// Small numeric helpers shared by the analysis modules (DOM-free).
export const DEG = Math.PI / 180;
export const KN = 1852 / 3600; // m/s per knot

export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const wrap180 = (a) => { const w = wrap360(a + 180) - 180; return w === -180 ? 180 : w; };
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function circMean(arr, w = null, i0 = 0, i1 = arr.length - 1) {
  let s = 0, c = 0;
  for (let i = i0; i <= i1; i++) { const a = arr[i]; if (!Number.isFinite(a)) continue; const k = w ? w[i] : 1; s += k * Math.sin(a * DEG); c += k * Math.cos(a * DEG); }
  if (s === 0 && c === 0) return NaN;
  return wrap360(Math.atan2(s, c) / DEG);
}

export function mean(a, i0 = 0, i1 = a.length - 1) {
  let s = 0, n = 0;
  for (let i = i0; i <= i1; i++) { const v = a[i]; if (Number.isFinite(v)) { s += v; n++; } }
  return n ? s / n : NaN;
}
export function std(a, i0 = 0, i1 = a.length - 1) {
  const m = mean(a, i0, i1); let s = 0, n = 0;
  for (let i = i0; i <= i1; i++) { const v = a[i]; if (Number.isFinite(v)) { s += (v - m) ** 2; n++; } }
  return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
}
export function minmax(a, i0 = 0, i1 = a.length - 1) {
  let lo = Infinity, hi = -Infinity, ilo = -1, ihi = -1;
  for (let i = i0; i <= i1; i++) { const v = a[i]; if (!Number.isFinite(v)) continue; if (v < lo) { lo = v; ilo = i; } if (v > hi) { hi = v; ihi = i; } }
  return { lo, hi, ilo, ihi };
}
export function finite(a) { const o = []; for (const v of a) if (Number.isFinite(v)) o.push(v); return o; }
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, i = Math.floor(p), f = p - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}
export function median(a) { const s = finite(a).sort((x, y) => x - y); return quantile(s, 0.5); }

/** Centered moving average over `w` samples, NaN-aware (a window with < half valid samples -> NaN). */
export function movingAverage(a, w) {
  const n = a.length, out = new Float64Array(n);
  const h = Math.max(0, Math.floor(w / 2));
  if (h === 0) { out.set(a); return out; }
  let s = 0, c = 0;
  const add = (v, k) => { if (Number.isFinite(v)) { s += k * v; c += k; } };
  for (let i = 0; i <= Math.min(n - 1, h); i++) add(a[i], 1);
  for (let i = 0; i < n; i++) {
    const span = Math.min(n - 1, i + h) - Math.max(0, i - h) + 1;
    out[i] = c > span / 2 ? s / c : NaN;
    const o = i - h, e = i + h + 1;
    if (o >= 0) add(a[o], -1);
    if (e < n) add(a[e], 1);
  }
  return out;
}

/** Running median over `w` samples (odd), NaN ignored. O(n w log w) but w is small. */
export function movingMedian(a, w) {
  const n = a.length, out = new Float64Array(n), h = Math.floor(w / 2);
  const buf = [];
  for (let i = 0; i < n; i++) {
    buf.length = 0;
    for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (Number.isFinite(a[k])) buf.push(a[k]);
    if (!buf.length) { out[i] = NaN; continue; }
    buf.sort((x, y) => x - y);
    out[i] = buf[buf.length >> 1];
  }
  return out;
}

/** Unwrap a degree series (NaN gaps keep the running offset). */
export function unwrapDeg(a) {
  const out = new Float64Array(a.length); let off = 0, prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) { out[i] = NaN; continue; }
    if (Number.isFinite(prev)) { const d = v + off - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; }
    out[i] = v + off; prev = out[i];
  }
  return out;
}

/** Linear interpolation of (xs, ys) at x (xs sorted). Returns NaN outside unless clamp. */
export function interp1(xs, ys, x, clampEnds = true) {
  const n = xs.length;
  if (!n) return NaN;
  if (x <= xs[0]) return clampEnds || x === xs[0] ? ys[0] : NaN;
  if (x >= xs[n - 1]) return clampEnds || x === xs[n - 1] ? ys[n - 1] : NaN;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

/** Seeded PRNG (mulberry32) with a normal deviate helper. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  const u = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  u.normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let a, b, r; do { a = u() * 2 - 1; b = u() * 2 - 1; r = a * a + b * b; } while (r >= 1 || r === 0);
    const f = Math.sqrt(-2 * Math.log(r) / r); spare = b * f; return a * f;
  };
  return u;
}

export const fmtClock = (s) => {
  if (!Number.isFinite(s)) return '–';
  const neg = s < 0; s = Math.abs(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, '0'), sss = String(ss).padStart(2, '0');
  return (neg ? '-' : '') + (h ? `${h}:${mm}:${sss}` : `${mm}:${sss}`);
};

/** Parse "m:ss", "h:mm:ss" or plain seconds. */
export function parseClock(str) {
  const s = String(str).trim();
  if (!s) return NaN;
  if (!s.includes(':')) return +s;
  const p = s.split(':').map(Number);
  return p.reduce((a, v) => a * 60 + v, 0);
}
