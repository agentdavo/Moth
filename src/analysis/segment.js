// Maneuver detection and leg segmentation (DOM-free).
//
// Signed TWA: twaS = wrap180(TWD − course), + = wind over starboard (starboard tack).
//
// Tacks / gybes: the tack side is +1/−1 with hysteresis — the side only changes once twaS is
// clearly on the other side (|twaS| between `hyst` and 180−`hyst`). A side that is held for
// less than `minHold` s is discarded (a wobble through the wind, not a maneuver). Each side
// change is one maneuver; its time t0 is the last sign change of twaS before the new side is
// established: through 0 → tack, through ±180 → gybe.
// Bear-aways / round-ups: changes of the point-of-sail mode (up: |TWA| < upMax, down: > downMin,
// reach between; |TWA| median-filtered over `modeSmooth` s, runs shorter than minHold merged)
// without a tack-side change are recorded as 'bearaway' (|TWA| increasing) or 'roundup'.
// Legs: maximal runs of samples with a constant side and mode, excluding [t0 − pre, t0 + settle]
// around every maneuver, samples turning (course change > turnMax over ±turnWin s), slow
// samples (< minSpeedFrac × median speed) and GNSS gaps; legs are split at event markers.
// Only runs of at least `minLeg` s are legs.
import { wrap180, movingMedian, median, circMean, mean } from './util.js';

export const SEG_DEFAULTS = {
  hyst: 12, minHold: 4, upMax: 70, downMin: 110, modeSmooth: 5,
  minLeg: 20, pre: 5, settle: 10, turnMax: 30, turnWin: 5, minSpeedFrac: 0.35,
  splitOnEvents: true,
};

export const MODE = { 0: '', 1: 'up', 2: 'reach', 3: 'down' };

export function signedTWA(track, twd) {
  const out = new Float64Array(track.n);
  for (let k = 0; k < track.n; k++) out[k] = Number.isFinite(track.course[k]) ? wrap180(twd[k] - track.course[k]) : NaN;
  return out;
}

function runs(arr, n) {
  const out = [];
  let s = 0;
  for (let k = 1; k <= n; k++) if (k === n || arr[k] !== arr[s]) { out.push({ v: arr[s], i0: s, i1: k - 1 }); s = k; }
  return out;
}

export function segment(track, twd, opts = {}, extraExcl = []) {
  const o = { ...SEG_DEFAULTS, ...opts };
  const { n, t, rate, speed, course } = track;
  const twaS = signedTWA(track, twd);
  const vmed = median(speed);
  const vmin = Math.max(0.2, o.minSpeedFrac * vmed);
  const moving = new Uint8Array(n);
  for (let k = 0; k < n; k++) moving[k] = speed[k] > vmin ? 1 : 0;

  // ---- tack side with hysteresis
  const side = new Int8Array(n);
  let st = 0;
  for (let k = 0; k < n; k++) {
    const a = twaS[k];
    if (Number.isFinite(a) && moving[k]) {
      if (a > o.hyst && a < 180 - o.hyst) st = 1;
      else if (a < -o.hyst && a > -180 + o.hyst) st = -1;
    }
    side[k] = st;
  }
  // discard short holds (merge into the surrounding side)
  const hold = Math.round(o.minHold * rate);
  for (let pass = 0; pass < 3; pass++) {
    const r = runs(side, n);
    let changed = false;
    for (let q = 1; q + 1 < r.length; q++) {
      const R = r[q];
      if (R.i1 - R.i0 + 1 < hold && r[q - 1].v === r[q + 1].v && R.v !== 0) {
        for (let k = R.i0; k <= R.i1; k++) side[k] = r[q - 1].v; changed = true;
      }
    }
    if (!changed) break;
  }
  const maneuvers = [];
  const sideRuns = runs(side, n);
  for (let q = 1; q < sideRuns.length; q++) {
    const A = sideRuns[q - 1], B = sideRuns[q];
    if (A.v === 0 || B.v === 0) continue;
    // last sign change of twaS before B.i0 (search back max 30 s)
    const lim = Math.max(A.i0, B.i0 - Math.round(30 * rate));
    let j0 = -1;
    for (let k = B.i0; k > lim; k--) {
      const a = twaS[k], b = twaS[k - 1];
      if (Number.isFinite(a) && Number.isFinite(b) && Math.sign(a) !== Math.sign(b)) { j0 = k; break; }
    }
    let type;
    if (j0 >= 0) type = Math.abs(twaS[j0]) + Math.abs(twaS[j0 - 1]) < 180 ? 'tack' : 'gybe';
    else {
      j0 = B.i0;
      const around = [];
      for (let k = Math.max(0, B.i0 - 5 * rate); k < Math.min(n, B.i0 + 5 * rate); k++) if (Number.isFinite(twaS[k])) around.push(Math.abs(twaS[k]));
      type = median(around) < 90 ? 'tack' : 'gybe';
    }
    maneuvers.push({ type, i: j0, t: t[j0], from: A.v, to: B.v });
  }

  // ---- point-of-sail mode
  const absTwa = Float64Array.from(twaS, (a, k) => (moving[k] ? Math.abs(a) : NaN));
  const absS = movingMedian(absTwa, Math.max(1, Math.round(o.modeSmooth * rate)) | 1);
  const mode = new Uint8Array(n);
  let md = 0;
  for (let k = 0; k < n; k++) {
    const a = absS[k];
    if (Number.isFinite(a)) {
      // hysteresis of 4° on the mode borders
      const h = 4;
      if (md === 0) md = a < o.upMax ? 1 : a > o.downMin ? 3 : 2;
      else if (md === 1) { if (a > o.upMax + h) md = a > o.downMin ? 3 : 2; }
      else if (md === 3) { if (a < o.downMin - h) md = a < o.upMax ? 1 : 2; }
      else if (a < o.upMax - h) md = 1;
      else if (a > o.downMin + h) md = 3;
    }
    mode[k] = md;
  }
  for (let pass = 0; pass < 3; pass++) {
    const r = runs(mode, n);
    let changed = false;
    for (let q = 1; q + 1 < r.length; q++) {
      const R = r[q];
      if (R.i1 - R.i0 + 1 < hold && r[q - 1].v === r[q + 1].v) { for (let k = R.i0; k <= R.i1; k++) mode[k] = r[q - 1].v; changed = true; }
    }
    if (!changed) break;
  }
  const modeRuns = runs(mode, n).filter((r) => r.v);
  const shortReach = Math.round(15 * rate);
  for (let q = 1; q < modeRuns.length; q++) {
    const A = modeRuns[q - 1];
    let B = modeRuns[q];
    let border, j;
    if (B.v === 2 && B.i1 - B.i0 < shortReach && q + 1 < modeRuns.length && modeRuns[q + 1].v !== 2 && modeRuns[q + 1].v !== A.v) {
      // up -> short reach -> down (or back): one bear-away / round-up, timed at |TWA| = 90°
      const C = modeRuns[q + 1];
      border = 90; j = B.i0;
      for (let k = B.i0; k <= C.i0; k++) if ((absS[k] - 90) * (absS[k - 1] - 90) <= 0) { j = k; break; }
      B = C; q++;
    } else {
      // time: where the smoothed |TWA| crosses the border between the two modes
      border = A.v < B.v ? (A.v === 1 ? o.upMax : o.downMin) : (B.v === 1 ? o.upMax : o.downMin);
      j = B.i0;
      for (let k = B.i0; k > Math.max(A.i0, B.i0 - 20 * rate); k--) { if ((absS[k] - border) * (absS[k - 1] - border) <= 0) { j = k; break; } }
    }
    // skip if a tack/gybe is within 3 s (the mode change is part of that maneuver)
    if (maneuvers.some((m) => Math.abs(m.t - t[j]) < 3 && (m.type === 'tack' || m.type === 'gybe'))) continue;
    maneuvers.push({ type: B.v > A.v ? 'bearaway' : 'roundup', i: j, t: t[j], fromMode: MODE[A.v], toMode: MODE[B.v], from: side[Math.max(0, j - 1)], to: side[j] });
  }
  maneuvers.sort((a, b) => a.t - b.t);

  // ---- exclusion mask + leg runs
  const excl = new Uint8Array(n);
  const pre = Math.round(o.pre * rate), settle = Math.round(o.settle * rate);
  for (const m of maneuvers) for (let k = Math.max(0, m.i - pre); k <= Math.min(n - 1, m.i + settle); k++) excl[k] = 1;
  for (const [a, b] of extraExcl) for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) excl[k] = 1;
  const tw = Math.round(o.turnWin * rate);
  for (let k = 0; k < n; k++) {
    if (!moving[k] || !track.gnssOk[k] || !Number.isFinite(twaS[k]) || !side[k] || !mode[k]) { excl[k] = 1; continue; }
    const a = course[Math.max(0, k - tw)], b = course[Math.min(n - 1, k + tw)];
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(wrap180(b - a)) > o.turnMax) excl[k] = 1;
  }
  const split = new Uint8Array(n);
  if (o.splitOnEvents) for (const e of track.events) split[e.i] = 1;
  const legs = [];
  const minLen = Math.round(o.minLeg * rate);
  let s = -1;
  for (let k = 0; k <= n; k++) {
    const cont = k < n && !excl[k] && s >= 0 && side[k] === side[s] && mode[k] === mode[s] && !split[k];
    if (s >= 0 && !cont) {
      if (k - s >= minLen) legs.push({ i0: s, i1: k - 1 });
      s = -1;
    }
    if (k < n && !excl[k] && s < 0) s = k;
  }
  legs.forEach((L, q) => {
    L.id = q + 1; L.t0 = t[L.i0]; L.t1 = t[L.i1]; L.dur = L.t1 - L.t0 + 1 / rate; L.tMid = (L.t0 + L.t1) / 2;
    L.mode = MODE[mode[L.i0]]; L.side = side[L.i0]; L.tack = L.side > 0 ? 'stbd' : 'port';
    L.twaSigned = mean(twaS, L.i0, L.i1);
    L.course = circMean(course, null, L.i0, L.i1);
  });
  return { twaS, side, mode, excl, maneuvers, legs, vmin, opts: o };
}
