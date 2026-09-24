// True-wind direction from the track (DOM-free).
//
// estimateTWD: a boat sailing to windward and to leeward produces course clusters that are
// mirror images about the wind axis (port/starboard tack). We
//   1. histogram the course of steady sailing samples (1° bins, Gaussian-smoothed),
//   2. find the axis of best mirror symmetry  S(φ) = Σ_c h(c)·h(φ−c)  (φ = 2·axis), ignoring
//      pairs closer than 30° to each other (a single straight leg is trivially symmetric),
//   3. decide which end of the axis is upwind by votes: more heel, sheet further in, lower
//      speed and a wider cluster half-angle all indicate the windward half,
//   4. refine: with tacks known, TWD error e = mean of the port and starboard median TWAs
//      (signed), separately upwind and downwind, iterated.
// trackTWD: slowly varying TWD(t) from pairs of consecutive opposite-tack legs (same mode):
//   assuming the same TWA on both tacks, the bisector of their mean courses is the local wind.
import { DEG, wrap180, wrap360, median, interp1, clamp } from './util.js';

export function estimateTWD(track, opts = {}) {
  const { n, course, speed, turnRate, roll, sheet } = track;
  const sp = [];
  for (let k = 0; k < n; k++) if (Number.isFinite(speed[k])) sp.push(speed[k]);
  sp.sort((a, b) => a - b);
  const vmed = sp.length ? sp[sp.length >> 1] : 0;
  const vmin = Math.max(0.3, 0.45 * vmed);
  const use = new Uint8Array(n);
  let cnt = 0;
  for (let k = 0; k < n; k++) {
    if (Number.isFinite(course[k]) && speed[k] > vmin && Number.isFinite(turnRate[k]) && Math.abs(turnRate[k]) < 4) { use[k] = 1; cnt++; }
  }
  if (cnt < 50) return { twd: NaN, confidence: 0, reason: 'not enough steady sailing' };
  // histogram
  const h = new Float64Array(360);
  for (let k = 0; k < n; k++) if (use[k]) h[Math.floor(wrap360(course[k])) % 360] += 1;
  const hs = new Float64Array(360);
  const sig = 3;
  for (let c = 0; c < 360; c++) {
    if (!h[c]) continue;
    for (let d = -9; d <= 9; d++) hs[(c + d + 360) % 360] += h[c] * Math.exp(-0.5 * (d / sig) ** 2);
  }
  // mirror symmetry score S(phi), phi in [0, 360): axis theta = phi / 2 (mod 180)
  const S = new Float64Array(360);
  for (let phi = 0; phi < 360; phi++) {
    let s = 0;
    for (let c = 0; c < 360; c++) {
      if (!hs[c]) continue;
      const sep = Math.abs(wrap180(2 * c - phi)); // = 2 * angle between c and the axis
      if (sep < 30 || sep > 330) continue;
      s += hs[c] * hs[(phi - c + 720) % 360];
    }
    S[phi] = s;
  }
  let best = 0;
  for (let p = 1; p < 360; p++) if (S[p] > S[best]) best = p;
  const s0 = S[(best + 359) % 360], s1 = S[best], s2 = S[(best + 1) % 360];
  const off = (s0 - s2) / (2 * (s0 - 2 * s1 + s2) || 1);
  const axis = wrap360((best + clamp(off, -0.5, 0.5)) / 2); // mod 180
  // ---- which end is upwind: votes
  const half = (dir) => {
    let w = 0, heel = 0, nh = 0, sh = 0, ns = 0, v = 0, offs = [];
    for (let k = 0; k < n; k++) {
      if (!use[k]) continue;
      const a = wrap180(course[k] - dir);
      if (Math.abs(a) >= 90) continue;
      w++; v += speed[k];
      if (Number.isFinite(roll[k])) { heel += Math.abs(roll[k]); nh++; }
      if (Number.isFinite(sheet[k])) { sh += sheet[k]; ns++; }
      if (k % 5 === 0) offs.push(Math.abs(a));
    }
    return { w, heel: nh ? heel / nh : NaN, sheet: ns ? sh / ns : NaN, speed: w ? v / w : NaN, halfAngle: median(offs) };
  };
  const A = half(axis), B = half(axis + 180);
  let vote = 0; const why = [];
  const moth = /moth/i.test(track.cls);
  if (Number.isFinite(A.heel) && Number.isFinite(B.heel) && Math.abs(A.heel - B.heel) > 1) { const s = Math.sign(A.heel - B.heel); vote += s; why.push(`heel ${s > 0 ? 'A' : 'B'}`); }
  if (Number.isFinite(A.sheet) && Number.isFinite(B.sheet) && Math.abs(A.sheet - B.sheet) > 5) { const s = Math.sign(B.sheet - A.sheet); vote += 1.5 * s; why.push(`sheet ${s > 0 ? 'A' : 'B'}`); }
  if (A.w && B.w && Math.abs(A.speed - B.speed) > 0.03 * (A.speed + B.speed)) { const s = Math.sign(B.speed - A.speed); vote += (moth ? 1.5 : 0.75) * s; why.push(`speed ${s > 0 ? 'A' : 'B'}`); }
  if (Number.isFinite(A.halfAngle) && Number.isFinite(B.halfAngle) && Math.abs(A.halfAngle - B.halfAngle) > 8) { const s = Math.sign(A.halfAngle - B.halfAngle); vote += 0.5 * s; }
  if (!A.w || !B.w) vote += (A.w ? 0.25 : -0.25); // only one half sailed: assume it was upwind
  let twd = vote >= 0 ? axis : wrap360(axis + 180);
  // ---- refinement by tack-symmetric median TWA
  let info = null;
  for (let it = 0; it < 4; it++) {
    const g = { us: [], up: [], ds: [], dp: [] };
    for (let k = 0; k < n; k++) {
      if (!use[k] || k % 2) continue;
      const a = wrap180(twd - course[k]);
      const aa = Math.abs(a);
      if (aa > 15 && aa < 85) (a > 0 ? g.us : g.up).push(a);
      else if (aa > 95 && aa < 172) (a > 0 ? g.ds : g.dp).push(a);
    }
    const mus = median(g.us), mup = median(g.up), mds = median(g.ds), mdp = median(g.dp);
    const wu = Math.min(g.us.length, g.up.length), wd = Math.min(g.ds.length, g.dp.length);
    let e = 0, wsum = 0;
    if (wu > 20) { e += wu * (mus + mup) / 2; wsum += wu; }
    if (wd > 20) { e += wd * (mds + mdp) / 2; wsum += wd; }
    info = { upHalf: (mus - mup) / 2, downHalf: 180 - (mds - mdp) / 2, nUp: g.us.length + g.up.length, nDown: g.ds.length + g.dp.length, eUp: wu > 20 ? (mus + mup) / 2 : NaN, eDown: wd > 20 ? (mds + mdp) / 2 : NaN };
    if (!wsum) break;
    e /= wsum;
    twd = wrap360(twd - e);
    if (Math.abs(e) < 0.05) break;
  }
  // confidence: sharpness of the symmetry peak and agreement of the up/down estimates
  const Ssorted = Array.from(S).sort((a, b) => a - b);
  const sharp = s1 / (Ssorted[180] || 1);
  const agree = Number.isFinite(info?.eUp) && Number.isFinite(info?.eDown) ? Math.abs(info.eUp - info.eDown) : NaN;
  const confidence = clamp((Math.min(sharp, 8) - 1) / 7, 0, 1) * (Math.abs(vote) >= 1 ? 1 : 0.6);
  return { twd, axis, confidence, sharpness: sharp, vote, why, halves: [A, B], upHalfAngle: info?.upHalf, downHalfAngle: info?.downHalf, agree, histogram: hs, symmetry: S };
}

/** TWD(t) array: constant, from the tws/twd column, or tracked from leg pairs. */
export function constantArray(n, v) { return new Float64Array(n).fill(v); }

export function trackTWD(track, legs, twd0, opts = {}) {
  const maxGap = opts.maxGap ?? 240;
  const pts = [];
  const byMode = { up: [], down: [] };
  for (const L of legs) if (L.mode === 'up' || L.mode === 'down') byMode[L.mode].push(L);
  for (const mode of ['up', 'down']) {
    const ls = byMode[mode];
    for (let i = 0; i + 1 < ls.length; i++) {
      const a = ls[i], b = ls[i + 1];
      if (a.side === b.side || b.t0 - a.t1 > maxGap) continue;
      // signed TWA means relative to twd0 (course based)
      const e = (a.twaSigned + b.twaSigned) / 2; // = local TWD - twd0 error
      pts.push({ t: (a.tMid + b.tMid) / 2, e: -e, w: Math.min(a.dur, b.dur) });
    }
  }
  pts.sort((p, q) => p.t - q.t);
  const out = new Float64Array(track.n);
  if (pts.length < 2) { out.fill(twd0); return { twd: out, points: pts }; }
  // light smoothing: 3-point weighted
  const ts = pts.map((p) => p.t);
  const es = pts.map((p, i) => {
    let s = 0, w = 0;
    for (let k = Math.max(0, i - 1); k <= Math.min(pts.length - 1, i + 1); k++) { const ww = pts[k].w * (k === i ? 2 : 1); s += ww * pts[k].e; w += ww; }
    return s / w;
  });
  for (let k = 0; k < track.n; k++) out[k] = wrap360(twd0 + interp1(ts, es, track.t[k], true));
  return { twd: out, points: pts.map((p, i) => ({ ...p, eSmooth: es[i] })) };
}

/** Wind-speed schedule: "0:00-5:00 11" lines (kn by default, "m/s" suffix allowed). */
export function parseTwsSchedule(text, unitMs = 1852 / 3600) {
  const out = [];
  for (const line of String(text || '').split(/\n|;/)) {
    const m = /^\s*([\d:.]+)\s*[-–]\s*([\d:.]+)\s+([\d.]+)\s*(kn|kts|m\/s|ms)?\s*$/i.exec(line);
    if (!m) continue;
    const toS = (s) => s.split(':').map(Number).reduce((a, v) => a * 60 + v, 0);
    const u = m[4] && /m/i.test(m[4]) ? 1 : unitMs;
    out.push({ t0: toS(m[1]), t1: toS(m[2]), tws: +m[3] * u });
  }
  return out;
}

export function twsArray(track, twsDefault, schedule = []) {
  const out = new Float64Array(track.n).fill(twsDefault);
  if (track.twsCol) {
    for (let k = 0; k < track.n; k++) if (Number.isFinite(track.twsCol[k])) out[k] = track.twsCol[k];
  }
  for (const s of schedule) for (let k = 0; k < track.n; k++) if (track.t[k] >= s.t0 && track.t[k] < s.t1) out[k] = s.tws;
  return out;
}

export { DEG };
