// Longitudinal flight dynamics (heave + pitch) with wand/flap ride-height control,
// irregular waves and foil ventilation / hull touch-down events.
//
// Aerodynamic derivatives come from the vortex lattice about a VPP trim point so the
// simulation inherits main-foil/elevator downwash coupling, flap effectiveness and
// free-surface effects. Speed is held constant (sailor/sail regulates drive).
import { G, DEG, RHO_WATER, clamp } from './constants.js';
import { MothModel } from './vpp.js';
import { hydroForces } from './hydro.js';

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Irregular sea: Pierson-Moskowitz components; heading 0 = following sea, 180 = head sea. */
export function makeSea({ hs = 0.25, tp = 2.8, heading = 180, n = 12, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const wp = 2 * Math.PI / tp;
  const comps = [];
  if (hs <= 0) return { comps, eta: () => 0, w: () => 0 };
  const w0 = 0.65 * wp, w1 = 2.6 * wp, dw = (w1 - w0) / n;
  const S = (w) => (5 / 16) * hs * hs * wp ** 4 / w ** 5 * Math.exp(-1.25 * (wp / w) ** 4);
  for (let i = 0; i < n; i++) {
    const w = w0 + (i + rnd()) * dw;
    const a = Math.sqrt(2 * S(w) * dw);
    const mu = (heading + (rnd() - 0.5) * 50) * DEG;
    comps.push({ a, w, k: w * w / G, cm: Math.cos(mu), ph: rnd() * 2 * Math.PI });
  }
  return {
    comps,
    // surface elevation at boat-fixed x (m, forward) at time t for boat speed V
    eta(x, t, V) { let s = 0; for (const c of comps) s += c.a * Math.cos(c.k * c.cm * (V * t + x) - c.w * t + c.ph); return s; },
    // vertical orbital velocity at depth d
    w(x, t, V, d) { let s = 0; for (const c of comps) s += c.a * c.w * Math.exp(-c.k * Math.max(d, 0)) * Math.sin(c.k * c.cm * (V * t + x) - c.w * t + c.ph); return s; },
  };
}

// lift ratio vs depth/chord from the free-surface image lattice + ventilation collapse
function depthFactor(d, c) {
  if (d <= 0) return 0.08;
  const img = 1 - 0.16 * Math.exp(-(d / c) / 1.8);
  const vent = d < 0.35 * c ? 0.25 + 0.75 * (d / (0.35 * c)) ** 2 : 1;
  return img * vent;
}

/** Build a linear derivative model around the trimmed state at speed V. */
export function buildFlightModel(design, V, opts = {}) {
  const model = new MothModel(design);
  const b = design.boat;
  const cfg = model.config(0, b.rideHeight);
  const ext = { F: [0, 0, 0] };
  const tr = model.trim(cfg, V, ext);
  const u = tr.u;
  const base = (du) => hydroForces(cfg.sol, cfg.lat, design, { V, theta: du.th || 0, df: u[0] + (du.df || 0), de: u[1] + (du.de || 0), beta: u[2] });
  const h0 = base({});
  const e = 0.2 * DEG;
  const hT = base({ th: e }), hF = base({ df: e }), hE = base({ de: e });
  const d = (h, s) => (h.S[s].F[2] - h0.S[s].F[2]) / e;
  const Lm_a = d(hT, 'main'), Le_th = d(hT, 'elev'), Le_de = d(hE, 'elev'), Lm_df = d(hF, 'main');
  const kdw = (Le_th - Le_de) / Lm_a; // elevator lift change per unit main lift change (downwash)
  const mTot = b.hullMass + b.sailorMass;
  const L = design.mainStrut.length;
  // CG in body frame (origin at main foil, z up the strut)
  const xs = clamp(tr.xs, b.sailorXmin, b.sailorXmax);
  const xcg = (b.hullMass * b.boatX + b.sailorMass * xs) / mTot;
  const zcg = (b.hullMass * (L + b.boatZ) + b.sailorMass * (L + b.deckAboveKeel + b.sailorZ)) / mTot;
  const xe = design.elevator.x;
  const Iy = opts.Iy ?? (b.hullMass * 0.85 ** 2 + b.sailorMass * 0.35 ** 2 + b.sailorMass * 0.12);
  const addedMass = RHO_WATER * Math.PI * ((design.main.rootChord / 2) ** 2 * design.main.span + (design.elevator.rootChord / 2) ** 2 * design.elevator.span) * 0.7;
  return {
    V, design, trim: tr, h0,
    Lm0: h0.S.main.F[2], Le0: h0.S.elev.F[2],
    Lm_a, Le_de, Lm_df, kdw,
    m: mTot + addedMass, Iy, xcg, zcg, xe, L,
    cMain: design.main.rootChord, cElev: design.elevator.rootChord,
    df0: tr.df * DEG, ride0: b.rideHeight,
    wandX: b.wandX, wandL: b.wandLength, gearing: opts.gearing ?? b.wandGearing, deck: b.deckAboveKeel,
    psi0: Math.acos(clamp((b.rideHeight + b.deckAboveKeel) / b.wandLength, -1, 1)),
    flapMin: b.flapMin * DEG, flapMax: b.flapMax * DEG,
    tauFlap: opts.tauFlap ?? 0.06,
    lag: (0 - xe) / V,
  };
}

// World heights of body points for the state (z_cg, theta). Body point (x, z) -> relative to CG.
function worldZ(M, s, x, z) { const dx = x - M.xcg, dz = z - M.zcg; return s[0] + dx * Math.sin(s[2]) + dz * Math.cos(s[2]); }

function stateAtTrim(M) {
  // choose z_cg so that the hull bottom at the main strut sits at the ride height (theta = 0)
  const zcg = M.ride0 + (M.zcg - M.L);
  return [zcg, 0, 0, 0, M.df0];
}

/**
 * Right-hand side. State: [z_cg, w, theta, q, flap]. hist = delayed main lift for downwash lag.
 */
function rhs(M, s, t, sea, env) {
  const V = M.V;
  const zMain = worldZ(M, s, 0, 0), zElev = worldZ(M, s, M.xe, 0);
  const etaM = sea.eta(0, t, V), etaE = sea.eta(M.xe, t, V);
  const dM = etaM - zMain, dE = etaE - zElev;               // depths below local surface
  const dM0 = M.L - M.ride0, dE0 = dM0;
  const wM = s[1] + s[3] * (0 - M.xcg), wE = s[1] + s[3] * (M.xe - M.xcg);
  const aM = s[2] - wM / V + sea.w(0, t, V, dM) / V;
  const aE = s[2] - wE / V + sea.w(M.xe, t, V, dE) / V;
  const fM = depthFactor(dM, M.cMain) / depthFactor(dM0, M.cMain);
  const fE = depthFactor(dE, M.cElev) / depthFactor(dE0, M.cElev);
  const dLm = M.Lm_a * aM + M.Lm_df * (s[4] - M.df0);
  const Lm = (M.Lm0 + dLm) * fM;
  const dLmLag = env.lagLift(t - M.lag, dLm);
  const Le = (M.Le0 + M.Le_de * aE + M.kdw * dLmLag) * fE;
  // hull contact (planing/buoyancy) at the main strut & bow
  let Fh = 0, Mh = 0, touch = false;
  for (const [x, k] of [[0, 1], [1.2, 0.8], [-1.2, 0.8]]) {
    const zk = worldZ(M, s, x, M.L) - sea.eta(x, t, V);
    if (zk < 0) { const f = k * (9000 * -zk) - 400 * (s[1] + s[3] * (x - M.xcg)); Fh += f; Mh += f * (x - M.xcg); touch = true; }
  }
  const W = (M.Lm0 + M.Le0);
  const Fz = Lm + Le - W + Fh;
  const My = (Lm - M.Lm0) * (0 - M.xcg) + (Le - M.Le0) * (M.xe - M.xcg) + Mh;
  // wand: pivot at the bow (deck level); angle from vertical psi = acos(h / L_wand); the
  // pushrod/bell-crank gearing turns wand rotation into flap: d_flap = K_g * d_psi
  const pivotZ = worldZ(M, s, M.wandX, M.L + M.deck);
  const psiEst = Math.acos(clamp((pivotZ - sea.eta(M.wandX, t, V)) / M.wandL, -1, 1));
  const tipX = M.wandX + M.wandL * Math.sin(psiEst);
  const hw = pivotZ - sea.eta(tipX, t, V);
  const psi = Math.acos(clamp(hw / M.wandL, -1, 1));
  const cmd = clamp(M.df0 + M.gearing * (psi - M.psi0), M.flapMin, M.flapMax);
  return {
    d: [s[1], Fz / M.m, s[3], My / M.Iy, (cmd - s[4]) / M.tauFlap],
    out: { Lm, Le, dM, dE, touch, breach: dM < 0.01, hw, ride: worldZ(M, s, 0, M.L) - sea.eta(0, t, V), dLm },
  };
}

/** Time-domain simulation. Returns time series + ride quality metrics. */
export function simulate(M, { T = 20, dt = 0.004, sea = makeSea({ hs: 0 }), perturb = 0.05, record = 0.02 } = {}) {
  let s = stateAtTrim(M);
  s[0] += perturb; // start with a ride-height disturbance
  const hist = [];
  const env = {
    lagLift(tq, fallback) {
      if (!hist.length || tq < hist[0][0]) return fallback;
      let lo = 0, hi = hist.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (hist[m][0] < tq) lo = m; else hi = m; }
      return hist[lo][1];
    },
  };
  const series = { t: [], ride: [], pitch: [], flap: [], acc: [], eta: [], Le: [], Lm: [] };
  let nextRec = 0, touch = 0, breach = 0, sumE = 0, sumP = 0, n = 0, maxAcc = 0;
  let wasTouch = false, wasBreach = false;
  for (let t = 0; t <= T; t += dt) {
    const k1 = rhs(M, s, t, sea, env);
    const s2 = s.map((v, i) => v + 0.5 * dt * k1.d[i]);
    const k2 = rhs(M, s2, t + dt / 2, sea, env);
    const s3 = s.map((v, i) => v + 0.5 * dt * k2.d[i]);
    const k3 = rhs(M, s3, t + dt / 2, sea, env);
    const s4 = s.map((v, i) => v + dt * k3.d[i]);
    const k4 = rhs(M, s4, t + dt, sea, env);
    s = s.map((v, i) => v + dt / 6 * (k1.d[i] + 2 * k2.d[i] + 2 * k3.d[i] + k4.d[i]));
    hist.push([t, k1.out.dLm]);
    if (hist.length > 4000) hist.splice(0, 1000);
    const o = k1.out;
    if (o.touch && !wasTouch) touch++;
    if (o.breach && !wasBreach) breach++;
    wasTouch = o.touch; wasBreach = o.breach;
    if (t > 2) { sumE += (o.ride - M.ride0) ** 2; sumP += s[2] ** 2; n++; maxAcc = Math.max(maxAcc, Math.abs(k1.d[1])); }
    if (t >= nextRec) {
      series.t.push(t); series.ride.push(o.ride); series.pitch.push(s[2] / DEG); series.flap.push(s[4] / DEG);
      series.acc.push(k1.d[1] / G); series.eta.push(sea.eta(0, t, M.V)); series.Le.push(o.Le); series.Lm.push(o.Lm);
      nextRec += record;
    }
    if (!isFinite(s[0]) || Math.abs(s[2]) > 0.6) break;
  }
  return {
    series,
    metrics: {
      rmsRide: Math.sqrt(sumE / Math.max(n, 1)), rmsPitchDeg: Math.sqrt(sumP / Math.max(n, 1)) / DEG,
      maxAccG: maxAcc / G, touchdowns: touch, breaches: breach,
    },
  };
}

// --- linear stability: eigenvalues of the Jacobian at trim (calm water) ---
function charPoly(A) {
  // Faddeev-LeVerrier: returns coefficients c[0..n] of det(lambda I - A) = sum c_k lambda^(n-k)
  const n = A.length;
  let Mk = A.map((r) => r.map(() => 0));
  const I = A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  const c = [1];
  for (let k = 1; k <= n; k++) {
    const AM = A.map((r, i) => r.map((_, j) => r.reduce((s, _, l) => s + A[i][l] * Mk[l][j], 0)));
    Mk = AM.map((r, i) => r.map((v, j) => v + c[k - 1] * I[i][j]));
    const AMk = A.map((r, i) => r.map((_, j) => r.reduce((s, _, l) => s + A[i][l] * Mk[l][j], 0)));
    const tr = AMk.reduce((s, r, i) => s + r[i], 0);
    c.push(-tr / k);
  }
  return c;
}

function polyRoots(c) {
  const n = c.length - 1;
  const cm = c.map((x) => x / c[0]);
  let roots = Array.from({ length: n }, (_, k) => [Math.cos(2 * Math.PI * k / n + 0.4) * 2, Math.sin(2 * Math.PI * k / n + 0.4) * 2]);
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-30; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const scale = Math.max(1, ...cm.map(Math.abs)) ** (1 / n) * 2;
  roots = roots.map((r) => [r[0] * scale, r[1] * scale]);
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    roots = roots.map((z, i) => {
      let p = [1, 0];
      for (let k = 1; k <= n; k++) p = [mul(p, z)[0] + cm[k], mul(p, z)[1]];
      let q = [1, 0];
      roots.forEach((w, j) => { if (j !== i) q = mul(q, [z[0] - w[0], z[1] - w[1]]); });
      const dz = div(p, q);
      delta = Math.max(delta, Math.hypot(dz[0], dz[1]));
      return [z[0] - dz[0], z[1] - dz[1]];
    });
    if (delta < 1e-10) break;
  }
  return roots;
}

export function linearStability(M) {
  const sea = makeSea({ hs: 0 });
  const env = { lagLift: (_t, f) => f };
  const s0 = stateAtTrim(M);
  const f0 = rhs(M, s0, 0, sea, env).d;
  const n = 5;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const eps = [1e-4, 1e-4, 1e-5, 1e-4, 1e-5];
  for (let j = 0; j < n; j++) {
    const s = s0.slice(); s[j] += eps[j];
    const f = rhs(M, s, 0, sea, env).d;
    for (let i = 0; i < n; i++) A[i][j] = (f[i] - f0[i]) / eps[j];
  }
  const roots = polyRoots(charPoly(A));
  let minZeta = Infinity, maxRe = -Infinity, freq = 0;
  for (const [re, im] of roots) {
    maxRe = Math.max(maxRe, re);
    if (Math.abs(im) > 1e-6) {
      const z = -re / Math.hypot(re, im);
      if (z < minZeta) { minZeta = z; freq = Math.abs(im) / (2 * Math.PI); }
    }
  }
  return { A, roots, stable: maxRe < 0, maxRe, minZeta: isFinite(minZeta) ? minZeta : 1, freqHz: freq };
}
