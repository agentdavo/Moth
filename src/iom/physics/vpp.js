// Velocity prediction for the IOM: 4 degrees of freedom in steady state
//   surge  : sail drive = hull + appendage resistance         -> boat speed V
//   roll   : heeling moment = righting moment (GM sin phi)     -> heel phi, sail flattened above maxHeel
//   sway   : sail side force = fin + rudder + hull side force  -> leeway beta
//   yaw    : moments about the fin quarter-chord balanced      -> rudder angle delta
// The skipper's controls are the sheet/twist ("flat", 0.3–1) and the heading; the VPP maximises
// speed over flat at each heading and VMG over heading.
import { G, RHO_W, NU_W, DEG, KNOT, clamp } from './constants.js';
import { computeStatics } from './statics.js';
import { sailForces, rigWind, RIG_KEYS } from './sails.js';
import { hullResistance, bulbDrag, foilProfileDrag, junctionDrag } from './resistance.js';
import { liftSlope2D, liftSlope3D, clMax } from './foils.js';

/** Per-design constants of the lifting system (spans, slopes, lever arms). */
export function hydroSetup(s, d, Vref = 1.0) {
  const f = s.fin, r = s.rudder, b = s.bulb;
  const EP = 1 + 0.5 * b.w / f.span;                  // bulb end-plate effect (assumption, see docs)
  const bf = f.span * Math.sqrt(EP);                   // effective span of the keel (hull = mirror plane)
  const br = r.span;
  const reF = Vref * f.mac / NU_W, reR = Vref * r.mac / NU_W;
  const ARf = 2 * bf * bf / f.S, ARr = 2 * br * br / r.S;
  const af = liftSlope3D(liftSlope2D(d.fin.section, d.fin.tc, reF), ARf, (d.fin.sweep || 0) * DEG);
  const ar = liftSlope3D(liftSlope2D(d.rudder.section, d.rudder.tc, reR), ARr);
  const zF = f.depthRoot + f.yc * 1.05, zR = r.depthRoot + r.yc;
  return {
    EP, bf, br, ARf, ARr, af, ar,
    ch: Math.PI * s.hull.Tc * s.hull.Tc,           // slender-body hull side force per (q beta)
    zCLR: 0.85 * zF + 0.15 * zR,                    // depth of the side-force centre below the WL
    zApp: 0.5 * (f.depthRoot + s.draft),            // depth of the keel drag centre
    lr: d.rudder.xFromFin, lead: d.rig.lead, xh: 0.10,
    kappa: 1.6,                                     // downwash factor at the rudder (0 at fin -> 2 far wake)
    // bow-down dynamic trim per N of drive: drive x (zCE + 0.06) / (Delta g BM_L)
    pitchK: (s.rig.zCE + 0.06) / (s.mass.total * G * (s.hull.IL / s.vol)) / DEG,
  };
}

/**
 * Hydrodynamic side forces, rudder balance and resistance at speed V, heel phi, for sail forces sf.
 */
export function hydro(V, phiDeg, sf, s, d, H) {
  const phi = phiDeg * DEG, cph = Math.cos(phi);
  const q = 0.5 * RHO_W * Math.max(V, 1e-3) ** 2;
  const f = s.fin, r = s.rudder;
  const Fs = sf.side;
  // appendage drag estimate for the yaw offset term (zero-lift profile drag of fin + bulb)
  const D0 = foilProfileDrag(V, f, d.fin, 0).D + bulbDrag(V, s, d).D;
  // yaw balance -> rudder lift
  const Myaw = -Fs * H.lead + (sf.drive * s.rig.zCE + D0 * H.zApp) * Math.sin(phi);
  // hull lift depends on beta; iterate twice
  let Lr = 0, beta = 0, Lh = 0;
  for (let it = 0; it < 3; it++) {
    Lr = (Myaw + H.xh * Lh) / (H.lr * cph);
    // side force: (Lf + Lr) cos phi + Lh = Fs, Lf = q Sf af beta cos phi, Lh = q ch beta
    beta = (Fs / cph - Lr) / (q * f.S * H.af * cph + q * H.ch / cph);
    Lh = q * H.ch * beta;
  }
  const Lf = q * f.S * H.af * beta * cph;
  const clF = Lf / (q * f.S), clR = Lr / (q * r.S);
  const eps = H.kappa * clF / (Math.PI * H.ARf);
  const delta = clR / H.ar - beta * cph + eps;
  // resistance
  const eph = 0.95 * (1 - 0.25 * Math.sin(phi));
  const sigma = Math.min(H.br, H.bf) / Math.max(H.br, H.bf);
  const Di = (Lf * Lf / (eph * H.bf * H.bf) + 2 * sigma * Lf * Lr / (H.bf * H.br) + Lr * Lr / (eph * H.br * H.br)) / (2 * Math.PI * q)
    + Lh * Lh / (2 * Math.PI * q * (2 * s.hull.Tc) ** 2);
  const pf = foilProfileDrag(V, f, d.fin, clF), pr = foilProfileDrag(V, r, d.rudder, clR);
  const bd = bulbDrag(V, s, d);
  const dynTrim = Math.max(0, sf.drive) * H.pitchK;
  const hr = hullResistance(V, phiDeg, s, d, dynTrim);
  const jn = 2 * junctionDrag(V, d.fin.rootChord, d.fin.tc, d.fin.fillet) + junctionDrag(V, d.rudder.rootChord, d.rudder.tc, 0);
  const total = hr.Rf + hr.Rr + pf.D + pr.D + bd.D + Di + jn;
  return {
    beta: beta / DEG, delta: delta / DEG, clF, clR, Lf, Lr, Lh, dynTrim,
    R: { hullF: hr.Rf, hullR: hr.Rr, fin: pf.D, rudder: pr.D, bulb: bd.D, induced: Di, junction: jn, total },
    reF: pf.re, reR: pr.re, reBulb: bd.reL, fn: hr.fn, reHull: hr.re,
  };
}

/** Heel angle for given V, heading and flat (bisection on RM = heeling moment). */
function heelFor(s, H, rig, Ut, twa, V, flat, arA) {
  const arm = (phi) => s.RM(phi) - sailForces(rig, Ut, twa, V, phi * DEG, flat, arA).heelF * (rig.zCE + H.zCLR);
  if (arm(0) >= 0) return 0;
  let lo = 0, hi = 85;
  if (arm(hi) < 0) return hi;
  for (let i = 0; i < 26; i++) { const m = 0.5 * (lo + hi); if (arm(m) < 0) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}

/** Largest flat that keeps heel <= maxHeel. */
function flatForHeel(s, H, rig, Ut, twa, V, maxHeel, arA) {
  const need = s.RM(maxHeel) / (rig.zCE + H.zCLR);
  const hf = (f) => sailForces(rig, Ut, twa, V, maxHeel * DEG, f, arA).heelF;
  if (hf(1) <= need) return 1;
  let lo = 0.05, hi = 1;
  if (hf(lo) > need) return lo;
  for (let i = 0; i < 18; i++) { const m = 0.5 * (lo + hi); if (hf(m) > need) hi = m; else lo = m; }
  return lo;
}

function stateAt(ctx, twa, V, flat) {
  const { s, d, H, rig, Ut, arA } = ctx;
  const phi = heelFor(s, H, rig, Ut, twa, V, flat, arA);
  const sf = sailForces(rig, Ut, twa, V, phi * DEG, flat, arA);
  const hy = hydro(V, phi, sf, s, d, H);
  return { V, twa, phi, flat, sf, hy, excess: sf.drive - hy.R.total };
}

/** Largest flat that keeps the bow-down dynamic trim below maxTrim (nosedive limit). */
function flatForTrim(ctx, twa, V, fmax) {
  // total bow-down trim = dynamic (sail pitching moment) - static (+ = stern down)
  const lim = (ctx.d.env.maxTrim ?? 99) + ctx.s.trim / DEG;
  const trimAt = (f) => {
    const phi = heelFor(ctx.s, ctx.H, ctx.rig, ctx.Ut, twa, V, f, ctx.arA);
    return Math.max(0, sailForces(ctx.rig, ctx.Ut, twa, V, phi * DEG, f, ctx.arA).drive) * ctx.H.pitchK;
  };
  if (trimAt(fmax) <= lim) return fmax;
  let lo = 0.02, hi = fmax;
  if (trimAt(lo) > lim) return lo;
  for (let i = 0; i < 14; i++) { const m = 0.5 * (lo + hi); if (trimAt(m) > lim) hi = m; else lo = m; }
  return lo;
}

/** Best excess thrust over flat at speed V (golden section inside the heel- and trim-limited range). */
function bestAt(ctx, twa, V) {
  let fmax = flatForHeel(ctx.s, ctx.H, ctx.rig, ctx.Ut, twa, V, ctx.d.env.maxHeel, ctx.arA);
  fmax = flatForTrim(ctx, twa, V, fmax);
  const fmin = Math.min(0.3, fmax);
  if (twa > 100 || fmax - fmin < 0.02) return stateAt(ctx, twa, V, fmax);
  const gr = 0.381966;
  let a = fmin, b = fmax;
  let x1 = a + gr * (b - a), x2 = b - gr * (b - a);
  let s1 = stateAt(ctx, twa, V, x1), s2 = stateAt(ctx, twa, V, x2);
  for (let i = 0; i < 9; i++) {
    if (s1.excess > s2.excess) { b = x2; x2 = x1; s2 = s1; x1 = a + gr * (b - a); s1 = stateAt(ctx, twa, V, x1); }
    else { a = x1; x1 = x2; s1 = s2; x2 = b - gr * (b - a); s2 = stateAt(ctx, twa, V, x2); }
  }
  const sb = stateAt(ctx, twa, V, fmax);
  const best = s1.excess > s2.excess ? s1 : s2;
  return sb.excess >= best.excess ? sb : best;
}

const VGRID = [3.2, 2.6, 2.2, 1.9, 1.65, 1.45, 1.3, 1.17, 1.05, 0.94, 0.84, 0.74, 0.65, 0.56, 0.48, 0.4, 0.33, 0.26, 0.2, 0.15, 0.1, 0.06];

/**
 * Steady boat speed at a true wind angle: the largest V with non-negative excess thrust.
 * (Excess thrust is negative at very low V too, where the leeway needed for side force explodes,
 * so the root is bracketed by scanning down from the top.)
 */
export function solvePoint(ctx, twa, guess = null) {
  const ex = (V) => bestAt(ctx, twa, V);
  let lo = null, hi = null;
  if (guess && guess > 0.07) {
    const a = ex(guess * 0.9), b = ex(guess * 1.1);
    if (a.excess >= 0 && b.excess < 0) { lo = guess * 0.9; hi = guess * 1.1; }
  }
  if (lo === null) {
    let prev = 3.6;
    if (ex(prev).excess >= 0) return ex(prev);
    for (const V of VGRID) {
      if (ex(V).excess >= 0) { lo = V; hi = prev; break; }
      prev = V;
    }
    if (lo === null) { const z = ex(0.05); return { ...z, V: 0 }; }
  }
  for (let i = 0; i < 22; i++) { const m = 0.5 * (lo + hi); if (ex(m).excess >= 0) lo = m; else hi = m; if (hi - lo < 2e-5) break; }
  return ex(lo);
}

/** Context for one design, rig and true wind (knots at zRef). */
export function makeContext(d, rigKey, twsKn, statics = null) {
  const s = statics && statics.rigKey === rigKey ? statics : computeStatics(d, rigKey);
  const rig = s.rig;
  const H = hydroSetup(s, d);
  const Uref = twsKn * KNOT;
  const w = rigWind(Uref, d.env.zRef, rig);
  return { d, s, H, rig, Ut: w.Ueff, Uce: w.Uce, Uref, twsKn, arA: s.rigs.A.AR };
}

function golden(fn, a, b, n) {
  const gr = 0.381966;
  let x1 = a + gr * (b - a), x2 = b - gr * (b - a);
  let f1 = fn(x1), f2 = fn(x2);
  for (let i = 0; i < n; i++) {
    if (f1.val > f2.val) { b = x2; x2 = x1; f2 = f1; x1 = a + gr * (b - a); f1 = fn(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = b - gr * (b - a); f2 = fn(x2); }
  }
  return f1.val > f2.val ? f1 : f2;
}

/** Optimum upwind and downwind VMG for a context. */
export function vmg(ctx, n = 9) {
  let gU = null, gD = null;
  const up = golden((twa) => { const p = solvePoint(ctx, twa, gU); gU = p.V || gU; return { ...p, twa, val: p.V * Math.cos(twa * DEG) }; }, 30, 75, n);
  const down = golden((twa) => { const p = solvePoint(ctx, twa, gD); gD = p.V || gD; return { ...p, twa, val: -p.V * Math.cos(twa * DEG) }; }, 110, 180, n);
  return { up: summarize(up, true), down: summarize(down, false) };
}

export function summarize(p, up) {
  return {
    twa: p.twa, V: p.V, vmg: up ? p.V * Math.cos(p.twa * DEG) : -p.V * Math.cos(p.twa * DEG),
    heel: p.phi, flat: p.flat, leeway: p.hy.beta, rudder: p.hy.delta, clF: p.hy.clF, clR: p.hy.clR,
    aws: p.sf.aws, awa: p.sf.awa, drive: p.sf.drive, side: p.sf.side, R: p.hy.R,
    reF: p.hy.reF, reBulb: p.hy.reBulb, fn: p.hy.fn,
  };
}

/** Polar for one context: array of {twa, V, heel, leeway, ...}. */
export function polar(ctx, twas = [30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150, 165, 180]) {
  let g = null;
  return twas.map((twa) => { const p = solvePoint(ctx, twa, g); g = p.V || g; return summarize({ ...p, twa }, twa < 90); });
}

/**
 * Evaluate a design over wind bands. rigMode: 'auto' (best of A/B/C per band by mean VMG),
 * or an array of rig keys per band, or a single key.
 */
export function evaluateBands(d, { rigMode = null, n = 9, withPolars = false } = {}) {
  const bands = d.env.bands;
  const mode = rigMode ?? (d.rig.choice === 'auto' ? 'auto' : d.rig.choice);
  const statics = Object.fromEntries(RIG_KEYS.map((k) => [k, computeStatics(d, k)]));
  const out = [];
  bands.forEach((tws, i) => {
    const keys = mode === 'auto' ? RIG_KEYS : [Array.isArray(mode) ? mode[i] : mode];
    let best = null;
    for (const k of keys) {
      const ctx = makeContext(d, k, tws, statics[k]);
      const v = vmg(ctx, n);
      const score = 0.5 * (v.up.vmg + v.down.vmg);
      if (!best || score > best.score) best = { tws, rig: k, score, ...v, ctx };
    }
    if (withPolars) best.polar = polar(best.ctx);
    best.Ut = best.ctx.Ut; best.Uce = best.ctx.Uce;
    delete best.ctx;
    out.push(best);
  });
  return { bands: out, statics };
}

/**
 * Tack-exit check (Robinson, "Fin area", onemetre.net: size the fin so it keeps reserve lift when slow after a
 * tack; low-Re c_l,max is only ~0.7–0.8): fin c_l needed to carry the same side force at 75 % of the upwind
 * speed, against c_l,max at that Reynolds number. Conservative, since the skipper eases the sheet out of a tack.
 */
export function tackExitCl(bandResult, s, d) {
  const u = bandResult.up;
  const V = 0.75 * u.V;
  const cl = u.clF / (0.75 * 0.75);
  const re = V * s.fin.mac / NU_W;
  return { cl, clmax: clMax(d.fin.section, d.fin.tc, re), re };
}

export { clamp, G };
