// Structural checks: foils and struts as solid-carbon cantilever beams
// (Euler-Bernoulli), loaded by the spanwise lift distribution from the lattice.
import { E_CARBON, SIGMA_ALLOW, G, DEG, G_CARBON } from './constants.js';
import { chordAt, tcAt, planformStats, strutStats } from './geometry.js';

// Second moment of area of a solid aerofoil about its chord line: I ~ k c t^3
const K_I = 0.036;
// Torsion constant of a solid aerofoil: J ~ k c t^3 (thin section)
const K_J = 0.14;

/**
 * Main-foil / elevator half-span bending under a given total lift (N), distributed
 * like `shape` (array of {yb, lift}) or elliptically if not given.
 */
export function foilBending(f, totalLift, shape = null, n = 60) {
  const b2 = f.span / 2;
  const ys = [], w = [];
  for (let i = 0; i < n; i++) ys.push((i + 0.5) / n * b2);
  if (shape && shape.length) {
    // bin strip loads on the |y| stations
    const acc = new Array(n).fill(0);
    for (const s of shape) {
      const k = Math.min(n - 1, Math.floor(Math.abs(s.yb) / b2 * n));
      acc[k] += Math.max(0, s.lift);
    }
    const tot = acc.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < n; i++) w.push(acc[i] / tot * totalLift / 2);
  } else {
    let tot = 0;
    for (const y of ys) { const v = Math.sqrt(Math.max(0, 1 - (y / b2) ** 2)); w.push(v); tot += v; }
    for (let i = 0; i < n; i++) w[i] = w[i] / tot * totalLift / 2;
  }
  const dy = b2 / n;
  // bending moment at station i (from loads outboard)
  const M = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i; j < n; j++) m += w[j] * (ys[j] - (ys[i] - dy / 2)); M[i] = m; }
  let slope = 0, defl = 0, maxStress = 0, rootStress = 0;
  for (let i = 0; i < n; i++) {
    const eta = ys[i] / b2;
    const c = chordAt(f, eta), t = c * tcAt(f, eta);
    const I = K_I * c * t ** 3;
    const kappa = M[i] / (E_CARBON * I);
    slope += kappa * dy;
    defl += slope * dy;
    const sig = M[i] * (t / 2) / I;
    if (i === 0) rootStress = sig;
    maxStress = Math.max(maxStress, sig);
  }
  const stats = planformStats(f);
  return {
    tipDeflection: defl, tipSlopeDeg: slope / DEG, rootMoment: M[0], rootStress, maxStress,
    stressMargin: SIGMA_ALLOW / Math.max(maxStress, 1) - 1,
    deflectionRatio: defl / b2, mass: stats.mass,
  };
}

/** Strut lateral bending: cantilever from the hull bottom, side load distributed over immersed length. */
export function strutBending(s, sideForce, immersed, foilSide = 0) {
  const L = s.length;
  const t = s.tc * s.chord;
  const I = K_I * s.chord * t ** 3;
  const n = 40, dz = L / n;
  let slope = 0, defl = 0, maxM = 0;
  const load = (z) => (z > L - immersed ? sideForce / immersed : 0); // z measured from hull downward
  for (let i = 0; i < n; i++) {
    const z = (i + 0.5) * dz;
    let m = foilSide * (L - z);
    for (let j = i; j < n; j++) { const zj = (j + 0.5) * dz; m += load(zj) * dz * (zj - z); }
    maxM = Math.max(maxM, Math.abs(m));
    slope += m / (E_CARBON * I) * dz;
    defl += slope * dz;
  }
  return { tipDeflection: defl, tipSlopeDeg: slope / DEG, rootStress: maxM * (t / 2) / I, mass: strutStats(s).mass };
}

/** Torsional stiffness check: twist of the foil tip under a section pitching moment coefficient. */
export function foilTwist(f, q, cm) {
  const b2 = f.span / 2, n = 40, dy = b2 / n;
  let twist = 0;
  for (let i = 0; i < n; i++) {
    const eta = (i + 0.5) / n;
    let T = 0;
    for (let j = i; j < n; j++) { const e2 = (j + 0.5) / n; const c2 = chordAt(f, e2); T += q * c2 * c2 * cm * dy; }
    const c = chordAt(f, eta), t = c * tcAt(f, eta);
    const J = K_J * c * t ** 3;
    twist += T / (G_CARBON * J) * dy;
  }
  return twist / DEG;
}

/** Full structural summary for a design at a given lift load factor. */
export function structuralCheck(design, loadFactor = 2.5, mainShape = null) {
  const W = (design.boat.hullMass + design.boat.sailorMass) * G;
  const main = foilBending(design.main, W * loadFactor * 0.96, mainShape);
  const elev = foilBending(design.elevator, W * loadFactor * 0.25);
  const strut = strutBending(design.mainStrut, W * 0.5 * loadFactor, design.mainStrut.length - design.boat.rideHeight);
  return { main, elev, strut, loadFactor };
}
