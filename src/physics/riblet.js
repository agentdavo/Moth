// Riblet sizing at a point on a foil: local friction velocity from a turbulent flat-plate law at the
// local edge velocity, then s+ = s u_tau / nu (docs/research/BIOINSPIRED_FOILS.md 8.2, docs/RIBLET_EVIDENCE.md).
import { ribletFactor, RIBLET_FILM } from './sections.js';
import { KNOT } from './constants.js';

export const NU_SEA = 1.19e-6; // m^2/s, sea water ~15 C
export const S_PLUS_OPT = 15;   // optimum for blade riblets (l_g+ ~ 10.7), Garcia-Mayoral & Jimenez 2011

/** Local turbulent skin friction (Schlichting): C_f = (2 log10 Re_x - 0.65)^-2.3 */
export function cfLocal(reX) { return Math.pow(2 * Math.log10(Math.max(reX, 1e4)) - 0.65, -2.3); }

/**
 * Viscous length nu/u_tau (m) at chordwise station xc of a section with chord c (m), boat speed V (m/s),
 * edge-velocity ratio ue = U_e/V (about 1.0 on the pressure side, 1.1-1.2 on the suction side).
 */
export function viscousLength(V, c, xc = 0.5, ue = 1.1, nu = NU_SEA) {
  const Ue = V * ue;
  const utau = Ue * Math.sqrt(cfLocal(Ue * xc * c / nu) / 2);
  return nu / utau;
}

/** s+ for a riblet spacing s_um (micrometres). */
export function splusAt(sUm, V, c, xc = 0.5, ue = 1.1) { return sUm * 1e-6 / viscousLength(V, c, xc, ue); }

/** Change of local turbulent C_f (%) for spacing s_um at boat speed V; film = fraction of the ideal blade gain. */
export function dCfPercent(sUm, V, c, xc = 0.5, ue = 1.1, film = RIBLET_FILM) {
  return 100 * (ribletFactor(splusAt(sUm, V, c, xc, ue), film) - 1);
}

/** Spacing (micrometres) that puts s+ at the optimum at boat speed V. */
export function bestSpacing(V, c, xc = 0.5, ue = 1.1) { return S_PLUS_OPT * viscousLength(V, c, xc, ue) * 1e6; }

/** Speed-weighted mean change of C_f (%) over a speed range in knots (uniform weighting). */
export function meanDCf(sUm, kn0, kn1, c, xc = 0.5, ue = 1.1, film = RIBLET_FILM, n = 30) {
  let s = 0;
  for (let i = 0; i < n; i++) s += dCfPercent(sUm, (kn0 + (kn1 - kn0) * (i + 0.5) / n) * KNOT, c, xc, ue, film);
  return s / n;
}
