// IOM rigs, sail force coefficients, wind gradient and windage.
//
// Rig geometry from the class rule sail dimensions (IOM Class Rules 2026 G.3.3 / G.4.3, mid-tolerance),
// areas by Simpson's rule over the measured widths. Results: A 0.60 m², B 0.42 m², C 0.28 m²
// (the class quotes "about 0.6 m²" for the A rig).
//
// Force coefficients: shape of the Hazen (1980) / ORC main + jib tables, re-scaled to the only
// published IOM rig measurements: Southampton University low-speed tunnel, IOM "A" rig at 4.3 m/s
// (W. Woodhead, reported by L. Gilbert, onemetre.net/Design/Windtunl): best Cl ~1.3 with Cd ~0.25 at
// AWA 30°, Cl ~1.34 with Cd ~0.48 at AWA 70°, Cd rising ~0.22 per unit Cl at AWA 40°, drive 2.5–3.5 N and
// heel force up to 10 N at AWA 30°, drive ~10 N on a beam reach. The tunnel had uniform flow, so the
// coefficients include twist trimmed for uniform flow; the wind gradient is applied separately.
import { RHO_A, NU_A, KAPPA, G, DEG, clamp } from './constants.js';

function simpson(h, ys) { // ys at equal spacing h (odd count)
  let s = ys[0] + ys[ys.length - 1];
  for (let i = 1; i < ys.length - 1; i++) s += (i % 2 ? 4 : 2) * ys[i];
  return s * h / 3;
}

// [leech, foot, quarter, half, three-quarter, top] mainsail; [luff, leech, foot, half, top] headsail (mm)
const DIMS = {
  A: { main: [1615, 355, 310, 240, 140, 20], jib: [1325, 1250, 380, 190, 20], mast: 1.600 },
  B: { main: [1205, 345, 300, 230, 135, 20], jib: [985, 905, 345, 170, 20], mast: 1.180 },
  C: { main: [915, 315, 270, 210, 120, 20], jib: [735, 660, 295, 145, 20], mast: 0.880 },
};

// Rig CG above the waterline (m): mast ~45 g/m aluminium, booms, sails, rigging and the mast correctors
// below the lower point that equalise rig weights (C.7.3). Estimated, see docs/IOM_LAB.md.
const RIG_CG = { A: 0.45, B: 0.30, C: 0.21 };

export function buildRig(key, freeboard = 0.06) {
  const d = DIMS[key];
  const [ml, mf, mq, mh, mt, mtop] = d.main.map((x) => x / 1000);
  const [jl, jle, jf, jh, jtop] = d.jib.map((x) => x / 1000);
  const mainArea = simpson(ml / 4, [mf, mq, mh, mt, mtop]);
  const jibArea = simpson(jle / 2, [jf, jh, jtop]);
  const area = mainArea + jibArea;
  const lower = freeboard + 0.08;                 // lower point 60–100 mm above the deck (C.7.4)
  const mainFoot = lower + 0.01, mainHead = mainFoot + ml * 0.985;
  const jibFoot = freeboard + 0.04, jibHead = jibFoot + jl * 0.985;
  // CE ~40% up each luff (Robinson / Gilbert practice), area-weighted
  const zMain = mainFoot + 0.40 * (mainHead - mainFoot);
  const zJib = jibFoot + 0.40 * (jibHead - jibFoot);
  const zCE = (mainArea * zMain + jibArea * zJib) / area;
  const top = lower + d.mast;
  const span = top - jibFoot;
  const AR = span * span / area;
  return { key, area, mainArea, jibArea, zCE, zFoot: jibFoot, zTop: top, mast: d.mast, AR, zCG: RIG_CG[key] + (freeboard - 0.06) };
}

export const RIG_KEYS = ['A', 'B', 'C'];

// Combined rig coefficients vs apparent wind angle (deg) in the heeled sail plane.
//   CLmax: maximum usable lift; CD0: drag at zero lift (parasitic + slot/separation); induced drag K CL^2.
// Hazen/ORC shape (main + jib, jib ~40% of area), scaled to the IOM tunnel points above.
const AWA = [0, 15, 20, 27, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150, 165, 180];
const CLMAX = [0, 0.55, 0.90, 1.20, 1.30, 1.35, 1.38, 1.38, 1.36, 1.42, 1.45, 1.40, 1.30, 1.18, 0.95, 0.70, 0.40, 0.05];
const CD0 = [0.06, 0.05, 0.05, 0.058, 0.064, 0.075, 0.10, 0.15, 0.245, 0.33, 0.42, 0.54, 0.66, 0.78, 0.95, 1.10, 1.22, 1.28];
const K_A = 0.11; // induced + viscous drag due to lift for the A rig (per CL^2)

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
  return ys[ys.length - 1];
}

export function rigCoefficients(awaDeg, flat, rig, arA) {
  const b = clamp(Math.abs(awaDeg), 0, 180);
  const clmax = interp(AWA, CLMAX, b);
  const cd0 = interp(AWA, CD0, b);
  const K = K_A * (arA / rig.AR);
  const cl = flat * clmax;
  // off the wind the rig is drag-driven: "depowering" there means sheeting to reduce the projected area,
  // modelled as cd0 x (0.35 + 0.65 flat) beyond 100 deg AWA (blended from 80 deg)
  const w = clamp((b - 80) / 20, 0, 1);
  const cd = cd0 * (1 - w + w * (0.35 + 0.65 * flat)) + K * cl * cl;
  return { cl, cd, clmax, cd0, K };
}

// ------------------------------------------------------------ wind gradient ---
// Logarithmic profile U(z) = u*/kappa ln(z/z0) (Ruggles 1970, used for IOMs by Gilbert,
// onemetre.net/Design/Gradient) with Charnock roughness z0 = 0.011 u*^2/g + 0.11 nu/u*.
export function windProfile(Uref, zRef) {
  if (Uref <= 0) return { ustar: 0, z0: 1e-4, U: () => 0 };
  let ustar = Uref * KAPPA / Math.log(zRef / 1e-4);
  let z0 = 1e-4;
  for (let i = 0; i < 30; i++) {
    z0 = 0.011 * ustar * ustar / G + 0.11 * NU_A / Math.max(ustar, 1e-4);
    ustar = Uref * KAPPA / Math.log(zRef / z0);
  }
  return { ustar, z0, U: (z) => (z <= z0 ? 0 : ustar / KAPPA * Math.log(z / z0)) };
}

/** Effective (force-weighted RMS) true wind over the sail span and the true wind at the CE. */
export function rigWind(Uref, zRef, rig) {
  const p = windProfile(Uref, zRef);
  const n = 24;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const zeta = (i + 0.5) / n;
    const z = rig.zFoot + zeta * (rig.zTop - rig.zFoot);
    const chord = 1 - 0.85 * zeta;                  // near-triangular planform
    const u = p.U(z);
    num += chord * u * u; den += chord;
  }
  return { Ueff: Math.sqrt(num / den), Uce: p.U(rig.zCE), z0: p.z0, ustar: p.ustar };
}

/**
 * Sail + windage forces for a boat at speed V (m/s), heading TWA, heel phi (rad), flat factor.
 * Uses the effective true wind Ut over the rig. Apparent wind resolved in the heeled plane
 * (component normal to the mast reduced by cos(phi)).
 */
export function sailForces(rig, Ut, twaDeg, V, phi, flat, arA) {
  const twa = twaDeg * DEG;
  const ax = V + Ut * Math.cos(twa);             // apparent wind components in the boat frame
  const ay = Ut * Math.sin(twa);
  const aws = Math.hypot(ax, ay);
  const awa = Math.atan2(ay, ax);
  const ayh = ay * Math.cos(phi);                 // heeled-plane component
  const Ve = Math.hypot(ax, ayh);
  const be = Math.atan2(ayh, ax);
  const c = rigCoefficients(be / DEG, flat, rig, arA);
  const q = 0.5 * RHO_A * Ve * Ve;
  const L = q * rig.area * c.cl, D = q * rig.area * c.cd;
  const drive = L * Math.sin(be) - D * Math.cos(be);
  const heelF = L * Math.cos(be) + D * Math.sin(be);   // perpendicular to the mast, in the heeled plane
  // windage of hull, mast, booms, rigging (CdA, m^2) acting along the apparent wind
  const cda = 0.011 * rig.mast + 0.006 + 0.004 + 0.035 * Math.sin(awa) ** 2;
  const qa = 0.5 * RHO_A * aws * aws;
  const wDrive = -qa * cda * Math.cos(awa), wSide = qa * cda * Math.sin(awa);
  return {
    drive: drive + wDrive,
    heelF: heelF + wSide * Math.cos(phi),
    side: heelF * Math.cos(phi) + wSide,            // horizontal side force
    aws, awa: awa / DEG, awaEff: be / DEG, cl: c.cl, cd: c.cd, q, windage: -wDrive,
    Re: Ve * Math.sqrt(rig.area / 3) / NU_A,
  };
}
