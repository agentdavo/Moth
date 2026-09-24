// Statistics for paired comparisons (DOM-free): Student t, bootstrap, power.
import { rng } from './util.js';

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Student t CDF. */
export function tCDF(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - p : p;
}

/** Student t quantile (inverse CDF) by bisection. */
export function tQuantile(p, df) {
  if (!(df > 0)) return NaN;
  let lo = -1e3, hi = 1e3;
  for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (tCDF(m, df) < p) lo = m; else hi = m; if (hi - lo < 1e-10) break; }
  return 0.5 * (lo + hi);
}

/** Paired analysis of differences d (e.g. % B − A per pair). */
export function pairedStats(d, { level = 0.95, boot = 4000, seed = 7 } = {}) {
  const n = d.length;
  if (!n) return { n: 0 };
  const m = d.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : NaN;
  const se = sd / Math.sqrt(n);
  const tq = n > 1 ? tQuantile(1 - (1 - level) / 2, n - 1) : NaN;
  const tStat = m / se;
  const p = n > 1 && se > 0 ? 2 * (1 - tCDF(Math.abs(tStat), n - 1)) : NaN;
  // percentile bootstrap of the mean
  let bLo = NaN, bHi = NaN;
  if (n > 1) {
    const r = rng(seed);
    const bs = new Float64Array(boot);
    for (let b = 0; b < boot; b++) { let s = 0; for (let i = 0; i < n; i++) s += d[Math.floor(r() * n)]; bs[b] = s / n; }
    bs.sort();
    bLo = bs[Math.floor(boot * (1 - level) / 2)]; bHi = bs[Math.ceil(boot * (1 + level) / 2) - 1];
  }
  return { n, mean: m, sd, se, t: tStat, df: n - 1, p, ci: [m - tq * se, m + tq * se], half: tq * se, boot: [bLo, bHi] };
}

/** Pairs needed so that the t-CI half-width is <= h (given the pair sd). */
export function pairsForHalfWidth(sd, h, level = 0.95) {
  if (!(sd > 0) || !(h > 0)) return NaN;
  let n = 2;
  for (; n < 100000; n++) if (tQuantile(1 - (1 - level) / 2, n - 1) * sd / Math.sqrt(n) <= h) break;
  return n;
}

/** Pairs needed for `power` to detect an effect `delta` (two-sided paired t at alpha). */
export function pairsForPower(sd, delta, { alpha = 0.05, power = 0.8 } = {}) {
  if (!(sd > 0) || !(delta > 0)) return NaN;
  let n = 2;
  for (; n < 100000; n++) {
    const df = n - 1;
    if ((tQuantile(1 - alpha / 2, df) + tQuantile(power, df)) * sd / Math.sqrt(n) <= delta) break;
  }
  return n;
}

/** Power of the current design (approx., non-central t by shifted t) for effect delta. */
export function powerFor(sd, n, delta, alpha = 0.05) {
  if (!(sd > 0) || n < 2) return NaN;
  const df = n - 1, tc = tQuantile(1 - alpha / 2, df);
  const ncp = delta / (sd / Math.sqrt(n));
  return 1 - tCDF(tc - ncp, df) + tCDF(-tc - ncp, df);
}
