// Aerodynamic model for the Moth rig + windage (track frame: x along the course
// over water, y to leeward/port, wind from starboard).
//
// Sail coefficients: Boegle et al. 2010 (North Sails FLOW) Moth polar as fitted by
// Waldman (Princeton thesis, Table A.2). The optimum-trim polar is fitted as
//   CD = CD0 + k CL^2 + CD_sep(beta) (CL/CL_opt)^2
// with CD0 = 0.02, k = 0.115 (fits the attached-flow points 13-24 deg within 0.007) and
// CD_sep the residual at large apparent wind angles (separated flow). Depowering
// (flatten + twist) moves down this curve to any CL <= CL_opt.
import { RHO_AIR, DEG, clamp } from './constants.js';

const POLAR = [ // beta_eff deg, CL_opt, CD_opt
  [0, 0.0, 0.05], [8, 0.35, 0.06], [13.1, 0.769, 0.083], [15.7, 0.870, 0.100], [19.4, 0.973, 0.123],
  [21.1, 1.076, 0.153], [23.8, 1.179, 0.190], [40, 1.30, 0.40], [110, 0.60, 0.80], [160, 0.2, 1.15], [180, 0.0, 1.10],
];
const CE_DZ = [[5, -0.04], [17, -0.01], [40, 0.05], [100, 0.10], [180, 0.12]];

function interp(tab, x, col) {
  if (x <= tab[0][0]) return tab[0][col];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) { const t = (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[i - 1][col] + t * (tab[i][col] - tab[i - 1][col]); }
  }
  return tab[tab.length - 1][col];
}

export function apparentWind(V, tws, twa) {
  const wx = tws * Math.cos(twa) + V;   // source direction components
  const wy = tws * Math.sin(twa);
  return { aws: Math.hypot(wx, wy), awa: Math.atan2(wy, wx), wx, wy };
}

/** Usable (optimum-trim) sail CL as a function of effective apparent wind angle (rad). */
export function sailCLmax(boat, awaEff) {
  return interp(POLAR, awaEff / DEG, 1) * (boat.sailCLmax / 1.30);
}

export function sailCD(boat, awaEff, CL) {
  const b = awaEff / DEG;
  const k = boat.sailK ?? 0.115;
  const cd0 = boat.sailCD0 ?? 0.02;
  const clo = interp(POLAR, b, 1), cdo = interp(POLAR, b, 2);
  const sep = Math.max(0, cdo - 0.02 - 0.115 * clo * clo);
  return cd0 + k * CL * CL + (clo > 0 ? sep * Math.min(1, (CL / clo) ** 2) : sep);
}

/**
 * Sail + windage force in the track frame for a windward heel (rad) and sail CL.
 * Returns force vector [x (drive), y (to leeward), z (up)] and the CE height factor.
 */
export function sailForce(boat, V, tws, twa, heel, CL) {
  const aw = apparentWind(V, tws, twa);
  // component of the apparent wind along the heeled mast is lost
  const wyE = aw.wy * Math.cos(heel);
  const awsE = Math.hypot(aw.wx, wyE);
  const awaE = Math.atan2(wyE, aw.wx);
  const qa = 0.5 * RHO_AIR * awsE * awsE;
  const CD = sailCD(boat, awaE, CL);
  const L = qa * boat.sailArea * CL;
  const D = qa * boat.sailArea * CD;
  const drive = L * Math.sin(awaE) - D * Math.cos(awaE);
  const side = L * Math.cos(awaE) + D * Math.sin(awaE);
  // windage acts along the true (horizontal) apparent wind
  const qw = 0.5 * RHO_AIR * aw.aws * aw.aws * boat.windageCdA;
  const wdx = -qw * Math.cos(aw.awa), wdy = qw * Math.sin(aw.awa);
  const clm = sailCLmax(boat, awaE);
  // depowering (flatten + twist) lowers the CE; polar CE shift with apparent wind angle
  const ceFactor = (0.80 + 0.20 * (clm > 0 ? clamp(CL / clm, 0, 1) : 1)) + interp(CE_DZ, awaE / DEG, 1) / boat.ceAboveDeck;
  return {
    sail: [drive, side * Math.cos(heel), side * Math.sin(heel)],
    windage: [wdx, wdy, 0],
    aws: aw.aws, awa: aw.awa, awaE, awsE, CL, CD, clMax: clm, ceFactor, L, D,
  };
}
