// Leg, maneuver and polar metrics (DOM-free). Definitions are documented in docs/ANALYSIS.md.
import { DEG, mean, std, minmax, circMean, wrap180, quantile, movingAverage } from './util.js';

export const MAN_DEFAULTS = { ref: 'entry', mPre: 10, mPost: 20, entryLen: 6, t90Max: 40, turnThr: 4, foilSpeed: 3.8, blockS: 10, polarBin: 5 };

/** VMG toward the wind (+) per sample: sog · cos(TWA). */
export function vmgArray(track, twaS) {
  const out = new Float64Array(track.n);
  for (let k = 0; k < track.n; k++) out[k] = track.sog[k] * Math.cos(twaS[k] * DEG);
  return out;
}

export function legMetrics(track, seg, ctx) {
  const { twd, tws, model } = ctx;
  const { twaS } = seg;
  const vmgW = vmgArray(track, twaS);
  const { rate, sog, x, y, roll, pitch, rudder, sheet, hacc, sacc, sats, fix } = track;
  const bs = Math.max(1, Math.round(rate));
  const sog1 = movingAverage(sog, bs);
  for (const L of seg.legs) {
    const { i0, i1 } = L;
    const s = L.side;
    const dirSign = L.mode === 'down' ? -1 : 1;
    L.sog = mean(sog, i0, i1);
    L.vmgRaw = mean(vmgW, i0, i1);
    L.vmg = L.mode === 'reach' ? NaN : dirSign * L.vmgRaw;
    L.twa = Math.abs(L.twaSigned);
    L.twd = circMean(twd, null, i0, i1);
    L.tws = mean(tws, i0, i1);
    let dist = 0;
    for (let k = i0 + 1; k <= i1; k++) { const d = Math.hypot(x[k] - x[k - 1], y[k] - y[k - 1]); if (Number.isFinite(d)) dist += d; }
    L.dist = dist;
    // VMG made good from the displacement (independent of the Doppler speed)
    const wx = Math.sin(L.twd * DEG), wy = Math.cos(L.twd * DEG);
    L.vmgMG = dirSign * (((x[i1] - x[i0]) * wx + (y[i1] - y[i0]) * wy) / (L.dur - 1 / rate));
    const lee = new Float64Array(i1 - i0 + 1), rwx = new Float64Array(i1 - i0 + 1);
    for (let k = i0; k <= i1; k++) { lee[k - i0] = -s * roll[k]; rwx[k - i0] = -s * rudder[k]; }
    L.heel = mean(lee); L.heelSd = std(lee);
    L.pitch = mean(pitch, i0, i1);
    L.rudder = mean(rwx); L.rudderSd = std(rwx);
    L.sheet = mean(sheet, i0, i1);
    L.hacc = mean(hacc, i0, i1); L.sacc = mean(sacc, i0, i1);
    const mm = minmax(sats, i0, i1); L.satsMin = Number.isFinite(mm.lo) ? mm.lo : NaN;
    let f3 = 0; for (let k = i0; k <= i1; k++) if (fix[k] >= 3) f3++;
    L.fix3 = f3 / (i1 - i0 + 1);
    // straight-line consistency: CV of the 1-s mean SOG (sampled every second)
    const v1 = [];
    for (let k = i0 + (bs >> 1); k <= i1 - (bs >> 1); k += bs) if (Number.isFinite(sog1[k])) v1.push(sog1[k]);
    const m1 = v1.reduce((a, b) => a + b, 0) / (v1.length || 1);
    L.cv = v1.length > 2 ? Math.sqrt(v1.reduce((a, b) => a + (b - m1) ** 2, 0) / (v1.length - 1)) / m1 * 100 : NaN;
    if (model) {
      // a foiling leg is compared with the model's foiling branch only (NaN outside its TWA range)
      const prefer = model.hasRegimes ? (track.cls === 'Moth' && L.sog > (ctx.foilSpeed ?? 3.8) ? 'foil' : 'hull') : undefined;
      const ms = model.speed(L.twa, L.tws, prefer);
      L.modelSpeed = ms; L.ratio = ms > 0 ? L.sog / ms : NaN;
      if (L.mode !== 'reach') {
        const b = model.bestVMG(L.mode, L.tws);
        L.modelVmg = b ? b.vmg : NaN; L.vmgRatio = b && b.vmg > 0 ? L.vmg / b.vmg : NaN;
      } else { L.modelVmg = NaN; L.vmgRatio = NaN; }
    } else { L.modelSpeed = L.ratio = L.modelVmg = L.vmgRatio = NaN; }
  }
  return seg.legs;
}

export function maneuverMetrics(track, seg, opts = {}) {
  const o = { ...MAN_DEFAULTS, ...opts };
  const { n, rate, t, sog, turnRate, roll } = track;
  const { twaS } = seg;
  const sogS = movingAverage(sog, Math.max(1, Math.round(rate)));
  const K = (s) => Math.round(s * rate);
  const out = [];
  const tg = seg.maneuvers.filter((m) => m.type === 'tack' || m.type === 'gybe');
  for (const m of seg.maneuvers) {
    const r = { ...m };
    out.push(r);
    if (m.type !== 'tack' && m.type !== 'gybe') continue;
    const dir = m.type === 'tack' ? 1 : -1;
    const k0 = m.i;
    const e0 = k0 - K(o.mPre + o.entryLen), e1 = k0 - K(o.mPre);
    const w0 = k0 - K(o.mPre), w1 = k0 + K(o.mPost);
    if (e0 < 0 || w1 >= n) { r.valid = false; r.note = 'window outside log'; continue; }
    const vmg = (k) => dir * sog[k] * Math.cos(twaS[k] * DEG);
    let vs = 0, vv = 0, c = 0;
    for (let k = e0; k < e1; k++) if (Number.isFinite(sog[k]) && Number.isFinite(twaS[k])) { vs += sog[k]; vv += vmg(k); c++; }
    if (c < K(o.entryLen) * 0.7) { r.valid = false; r.note = 'entry data missing'; continue; }
    r.vEntry = vs / c; r.vmgEntry = vv / c;
    // exit reference (same length, right after the loss window) for the 'mean' reference option
    let xv = 0, xc = 0;
    for (let k = w1 + 1; k <= Math.min(n - 1, w1 + K(o.entryLen)); k++) { const v = vmg(k); if (Number.isFinite(v)) { xv += v; xc++; } }
    r.vmgExit = xc > K(o.entryLen) * 0.7 ? xv / xc : NaN;
    r.vmgRef = o.ref === 'mean' && Number.isFinite(r.vmgExit) ? (r.vmgEntry + r.vmgExit) / 2 : r.vmgEntry;
    let lost = 0, miss = 0;
    for (let k = w0; k <= w1; k++) { const v = vmg(k); if (Number.isFinite(v)) lost += (r.vmgRef - v) / rate; else miss++; }
    r.distLost = lost * (w1 - w0 + 1) / Math.max(1, w1 - w0 + 1 - miss);
    const mm = minmax(sog, k0 - K(5), Math.min(n - 1, k0 + K(o.mPost)));
    r.vMin = mm.lo; r.tMin = t[mm.ilo] - m.t; r.minRatio = mm.lo / r.vEntry;
    r.t90 = NaN;
    for (let k = Math.max(mm.ilo, k0); k < Math.min(n, k0 + K(o.t90Max)); k++) if (sogS[k] >= 0.9 * r.vEntry) { r.t90 = t[k] - m.t; break; }
    // turn start/end from the smoothed turn rate
    let pk = 0;
    for (let k = Math.max(0, k0 - K(8)); k <= Math.min(n - 1, k0 + K(8)); k++) if (Math.abs(turnRate[k]) > pk) pk = Math.abs(turnRate[k]);
    const thr = Math.max(o.turnThr, 0.15 * pk);
    let ks = k0, ke = k0;
    while (ks > k0 - K(15) && ks > 0 && !(Math.abs(turnRate[ks]) < thr)) ks--;
    while (ke < k0 + K(15) && ke < n - 1 && !(Math.abs(turnRate[ke]) < thr)) ke++;
    r.tStart = t[ks] - m.t; r.tEnd = t[ke] - m.t; r.turnDur = t[ke] - t[ks]; r.peakRate = pk;
    const hm = minmax(roll, ks, ke);
    r.heelMin = hm.lo; r.heelMax = hm.hi; r.heelSwing = hm.hi - hm.lo;
    r.twaIn = Math.abs(mean(twaS, e0, e1 - 1));
    r.twaOut = Math.abs(mean(twaS, w1 - K(5), w1));
    r.dropped = track.cls === 'Moth' ? r.vMin < o.foilSpeed : false;
    r.overlap = tg.some((q) => q !== m && q.t > m.t - o.mPre - o.entryLen && q.t < m.t + o.mPost);
    r.valid = true;
    // aligned trace for the chart
    const a0 = k0 - K(o.mPre + o.entryLen), a1 = Math.min(n - 1, k0 + K(o.mPost + 10));
    r.trace = { t: [], v: [], vmg: [] };
    for (let k = a0; k <= a1; k += Math.max(1, Math.round(rate / 5))) { r.trace.t.push(t[k] - m.t); r.trace.v.push(sog[k]); r.trace.vmg.push(vmg(k)); }
  }
  return out;
}

/** 10-s block points from legs: {twa, speed, tws, mode, leg}. */
export function polarPoints(track, seg, tws, blockS = 10) {
  const pts = [];
  const bk = Math.max(2, Math.round(blockS * track.rate));
  for (const L of seg.legs) {
    for (let a = L.i0; a + bk - 1 <= L.i1; a += bk) {
      const b = a + bk - 1;
      const twa = Math.abs(mean(seg.twaS, a, b)), v = mean(track.sog, a, b), w = mean(tws, a, b);
      if (Number.isFinite(twa) && Number.isFinite(v)) pts.push({ twa, speed: v, tws: w, mode: L.mode, leg: L.id, t: track.t[a] });
    }
  }
  return pts;
}

/** Bin points by TWA (and optionally TWS band); per bin n, mean, p90, max; envelope per contiguous TWA range. */
export function binPolar(points, { bin = 5, twsBand = 0 } = {}) {
  const groups = new Map();
  for (const p of points) {
    const band = twsBand > 0 && Number.isFinite(p.tws) ? Math.round(p.tws / twsBand) * twsBand : 0;
    if (!groups.has(band)) groups.set(band, []);
    groups.get(band).push(p);
  }
  const out = [];
  for (const [band, pts] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const bins = new Map();
    for (const p of pts) { const c = Math.floor(p.twa / bin) * bin + bin / 2; if (!bins.has(c)) bins.set(c, []); bins.get(c).push(p.speed); }
    const rows = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([twa, v]) => {
      const s = v.slice().sort((a, b) => a - b);
      return { twa, n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p90: quantile(s, 0.9), max: s[s.length - 1] };
    });
    out.push({ tws: band, n: pts.length, bins: rows, envelope: envelope(rows, bin) });
  }
  return out;
}

/** Envelope: weighted quadratic fit to the per-bin 90th percentiles over each contiguous TWA range. */
export function envelope(rows, bin = 5) {
  const good = rows.filter((r) => r.n >= 2);
  const segs = [];
  let cur = [];
  for (const r of good) { if (cur.length && r.twa - cur[cur.length - 1].twa > 2 * bin + 1e-9) { segs.push(cur); cur = []; } cur.push(r); }
  if (cur.length) segs.push(cur);
  return segs.map((sg) => {
    if (sg.length < 3) return sg.map((r) => ({ twa: r.twa, speed: r.p90 }));
    // weighted LSQ: v = a + b u + c u^2, u = (twa - mid)/span
    const mid = (sg[0].twa + sg[sg.length - 1].twa) / 2, span = Math.max(1, (sg[sg.length - 1].twa - sg[0].twa) / 2);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    for (const r of sg) { const u = (r.twa - mid) / span, w = Math.sqrt(r.n), f = [1, u, u * u]; for (let i = 0; i < 3; i++) { B[i] += w * f[i] * r.p90; for (let j = 0; j < 3; j++) A[i][j] += w * f[i] * f[j]; } }
    const c = solve3(A, B);
    const lo = sg[0].twa - bin / 2, hi = sg[sg.length - 1].twa + bin / 2;
    const pts = [];
    for (let a = lo; a <= hi + 1e-9; a += 1) { const u = (a - mid) / span; pts.push({ twa: a, speed: c ? c[0] + c[1] * u + c[2] * u * u : NaN }); }
    return pts;
  });
}

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((r, i) => r[3] / r[i]);
}

/** 1-s samples inside legs for the scatter plots. */
export function scatterSamples(track, seg) {
  const out = [];
  const st = Math.max(1, Math.round(track.rate));
  for (const L of seg.legs) {
    for (let k = L.i0; k + st - 1 <= L.i1; k += st) {
      const b = k + st - 1;
      out.push({
        t: track.t[k], leg: L.id, mode: L.mode,
        sog: mean(track.sog, k, b), heel: -L.side * mean(track.roll, k, b), rudder: -L.side * mean(track.rudder, k, b), sheet: mean(track.sheet, k, b),
      });
    }
  }
  return out;
}

export { wrap180 };
