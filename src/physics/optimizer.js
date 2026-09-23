// Separable CMA-ES (sep-CMA-ES, Ros & Hansen 2008) on the unit hyper-cube of the
// design variables, with a Pareto archive of (light, strong) band scores.
// The optimiser is evaluation-agnostic: `ask()` returns candidates, `tell()` takes scores.

function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class SepCMAES {
  constructor(x0, { sigma = 0.2, lambda, seed = 1 } = {}) {
    const n = x0.length;
    this.n = n;
    this.rng = mulberry32(seed);
    this.lambda = lambda || 4 + Math.floor(3 * Math.log(n));
    this.mu = Math.floor(this.lambda / 2);
    const w = [];
    for (let i = 0; i < this.mu; i++) w.push(Math.log(this.mu + 0.5) - Math.log(i + 1));
    const sw = w.reduce((a, b) => a + b, 0);
    this.w = w.map((x) => x / sw);
    this.mueff = 1 / this.w.reduce((a, b) => a + b * b, 0);
    this.cs = (this.mueff + 2) / (n + this.mueff + 5);
    this.ds = 1 + 2 * Math.max(0, Math.sqrt((this.mueff - 1) / (n + 1)) - 1) + this.cs;
    this.cc = (4 + this.mueff / n) / (n + 4 + 2 * this.mueff / n);
    const c1 = 2 / ((n + 1.3) ** 2 + this.mueff);
    const cmu = Math.min(1 - c1, 2 * (this.mueff - 2 + 1 / this.mueff) / ((n + 2) ** 2 + this.mueff));
    // separable variant: learning rates scaled by (n+2)/3
    this.c1 = c1 * (n + 2) / 3;
    this.cmu = Math.min(1 - this.c1, cmu * (n + 2) / 3);
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.m = x0.slice();
    this.sigma = sigma;
    this.D = new Array(n).fill(1); // sqrt of diagonal covariance
    this.ps = new Array(n).fill(0);
    this.pc = new Array(n).fill(0);
    this.gen = 0;
    this.best = null;
  }

  ask() {
    const pop = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: this.n }, () => randn(this.rng));
      const x = z.map((zi, i) => this.m[i] + this.sigma * this.D[i] * zi);
      // mirror into [0, 1]
      const xr = x.map((v) => { let u = v % 2; if (u < 0) u += 2; return u > 1 ? 2 - u : u; });
      pop.push({ x: xr, z: xr.map((v, i) => (v - this.m[i]) / (this.sigma * this.D[i])) });
    }
    return pop;
  }

  /** scores: higher is better */
  tell(pop, scores) {
    const n = this.n;
    const idx = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map((p) => p[1]);
    if (!this.best || scores[idx[0]] > this.best.score) this.best = { x: pop[idx[0]].x.slice(), score: scores[idx[0]] };
    const old = this.m.slice();
    const zw = new Array(n).fill(0);
    for (let i = 0; i < this.mu; i++) {
      const p = pop[idx[i]];
      for (let j = 0; j < n; j++) zw[j] += this.w[i] * p.z[j];
    }
    for (let j = 0; j < n; j++) this.m[j] = old[j] + this.sigma * this.D[j] * zw[j];
    const csn = Math.sqrt(this.cs * (2 - this.cs) * this.mueff);
    for (let j = 0; j < n; j++) this.ps[j] = (1 - this.cs) * this.ps[j] + csn * zw[j];
    const psn = Math.hypot(...this.ps);
    const hsig = psn / Math.sqrt(1 - (1 - this.cs) ** (2 * (this.gen + 1))) / this.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const ccn = Math.sqrt(this.cc * (2 - this.cc) * this.mueff);
    for (let j = 0; j < n; j++) this.pc[j] = (1 - this.cc) * this.pc[j] + hsig * ccn * this.D[j] * zw[j];
    for (let j = 0; j < n; j++) {
      let cmuSum = 0;
      for (let i = 0; i < this.mu; i++) { const y = this.D[j] * pop[idx[i]].z[j]; cmuSum += this.w[i] * y * y; }
      const C = this.D[j] ** 2;
      const Cn = (1 - this.c1 - this.cmu) * C + this.c1 * this.pc[j] ** 2 + this.cmu * cmuSum;
      this.D[j] = Math.sqrt(Math.max(Cn, 1e-12));
    }
    this.sigma *= Math.exp((this.cs / this.ds) * (psn / this.chiN - 1));
    this.sigma = Math.min(this.sigma, 0.6);
    this.gen++;
    return { best: this.best, mean: this.m.slice(), sigma: this.sigma };
  }
}

/** Maintain a 2-D Pareto front (maximise both). */
export function paretoInsert(front, pt, keyA, keyB) {
  if (front.some((p) => p[keyA] >= pt[keyA] && p[keyB] >= pt[keyB])) return front;
  const f = front.filter((p) => !(pt[keyA] >= p[keyA] && pt[keyB] >= p[keyB]));
  f.push(pt);
  f.sort((a, b) => a[keyA] - b[keyA]);
  return f;
}
