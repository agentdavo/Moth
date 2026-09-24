// Resistance of the IOM hull and appendages.
//
// Hull friction: ITTC-1957 line with a laminar forebody (composite Prandtl–Schlichting form), Reynolds number on
//   0.7 LWL (Delft/ORC practice, Keuning & Katgert 2008). The hull runs at Re 3e5–1.2e6, i.e. in the transition
//   range ("An IOM reaches Re 500,000 at about 1.5 knots and 1,000,000 at about 3 knots", radiosailingtechnology.com),
//   so the transition Reynolds number is an explicit, uncertain input (default 2e5, studied 1e5–1e6).
// Residuary: ORC residuary surfaces Rr/W(Fn, LVR, BTR) (orcSurfaces.js); alternative: own regression of the
//   Delft Series 1 data (delftFit.js, extrapolated in LVR); 'orc+9': +9 % (Day & Nixon 2014 found the Delft
//   method under-predicts a Laser's residuary resistance by up to 8–9 % at Fn 0.25–0.43).
// Bulb: laminar/turbulent friction x Hoerner body form factor + a low-Re separation (pressure) drag term
//   calibrated to the Gilbert & Bantock IOM bulb tow tests (see calibrateBulb / docs/IOM_LAB.md).
import { G, RHO_W, NU_W, DEG, clamp } from './constants.js';
import { ORC_FN, ORC_LVR, ORC_BTR, ORC_RR } from './orcSurfaces.js';
import { DELFT_FIT } from './delftFit.js';
import { sectionCd } from './foils.js';
import { cfLam, cfTurb } from '../../physics/sections.js';

// -------------------------------------------------------------- friction ---
export const cfITTC = (re) => 0.075 / (Math.log10(Math.max(re, 1e4)) - 2) ** 2;
export const cfBlasius = (re) => 1.328 / Math.sqrt(Math.max(re, 100));

/** Composite friction: laminar up to Re_x = reTr, ITTC-57 (or Schlichting) turbulent after. */
export function cfTransitional(re, reTr, turb = cfITTC) {
  if (re <= reTr) return cfBlasius(re);
  return turb(re) - (reTr / re) * (turb(reTr) - cfBlasius(reTr));
}

// -------------------------------------------------------------- residuary ---
function idx(xs, x) {
  if (x <= xs[0]) return [0, 0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return [i - 1, (x - xs[i - 1]) / (xs[i] - xs[i - 1])];
  return [xs.length - 2, 1];
}

/** ORC surfaces: 1000 Rr/W at (Fn, LVR, BTR), trilinear; Fn^4 decay below 0.125, linear above 0.7. */
export function orcRr(fn, lvr, btr) {
  const L = clamp(lvr, ORC_LVR[0], ORC_LVR[ORC_LVR.length - 1]);
  const B = clamp(btr, ORC_BTR[0], ORC_BTR[ORC_BTR.length - 1]);
  const [li, lt] = idx(ORC_LVR, L), [bi, bt] = idx(ORC_BTR, B);
  const at = (k) => {
    const t = ORC_RR[k];
    const a = t[li][bi] * (1 - bt) + t[li][bi + 1] * bt;
    const b = t[li + 1][bi] * (1 - bt) + t[li + 1][bi + 1] * bt;
    return a * (1 - lt) + b * lt;
  };
  if (fn <= ORC_FN[0]) return at(0) * Math.pow(Math.max(fn, 0) / ORC_FN[0], 4);
  const n = ORC_FN.length - 1;
  if (fn >= ORC_FN[n]) return at(n) + (at(n) - at(n - 1)) * (fn - ORC_FN[n]) / (ORC_FN[n] - ORC_FN[n - 1]);
  const [fi, ft] = idx(ORC_FN, fn);
  return at(fi) * (1 - ft) + at(fi + 1) * ft;
}

/** Own Delft-series regression (extrapolated in LVR); above its Fn range it follows the ORC shape. */
export function delftRr(fn, lvr, btr, cp, lcbPct) {
  const F = DELFT_FIT;
  const val = (f) => Math.exp(f.c[0] + f.c[1] * Math.log(lvr) + f.c[2] * cp + f.c[3] * Math.log(btr) + f.c[4] * lcbPct);
  if (fn <= F[0].fn) return val(F[0]) * Math.pow(Math.max(fn, 0) / F[0].fn, 4);
  const last = F[F.length - 1];
  if (fn >= last.fn) return val(last) * orcRr(fn, lvr, btr) / Math.max(1e-9, orcRr(last.fn, lvr, btr));
  for (let i = 1; i < F.length; i++) if (fn <= F[i].fn) {
    const t = (fn - F[i - 1].fn) / (F[i].fn - F[i - 1].fn);
    return val(F[i - 1]) * (1 - t) + val(F[i]) * t;
  }
  return val(last);
}

/**
 * Bare-hull resistance (N) at speed V (m/s) and heel phi (deg).
 */
export function hullResistance(V, phiDeg, s, d, dynTrimDeg = 0) {
  const h = s.hull, m = d.model;
  const q = 0.5 * RHO_W * V * V;
  const re = V * 0.7 * h.L / NU_W;
  const cf = cfTransitional(re, m.hullTransitionRe);
  const Rf = q * h.S * cf * d.hull.formFactor;
  const fn = V / Math.sqrt(G * h.L);
  let rr;
  if (m.residuary === 'delft') rr = delftRr(fn, h.lvr, h.btr, d.hull.cp, (0.5 - d.hull.lcb) * 100);
  else rr = orcRr(fn, h.lvr, h.btr) * (m.residuary === 'orc+9' ? 1.09 : 1);
  const W = s.mass.total * G;
  const heelK = 1 + m.heelResistance * (phiDeg / 30) ** 2;
  // trim away from the design waterline (static + bow-down dynamic trim from the sail pitching moment):
  // +3 % of Rr per deg^2 -- an assumption, see docs/IOM_LAB.md (Day & Nixon 2014 show bow-down trim costs
  // residuary resistance above ~Fn 0.2 on a Laser but do not give a per-degree law)
  const trimDeg = s.trim / DEG - dynTrimDeg;
  const trimK = 1 + 0.03 * trimDeg * trimDeg;
  const Rr = W * rr / 1000 * heelK * trimK;
  return { Rf, Rr, fn, re, cf };
}

// -------------------------------------------------------------- bulb ---
// Default separation constant from calibrateBulb() against the tow-tank data (tools/iom-validate.mjs).
export const BULB_SEP = { K: 0.04, reS: 1.5e5, n: 2.5 };

/**
 * Bulb drag (N) at speed V. Components:
 *   friction  q S Cf(Re_L, x_tr) FF,  FF = 1 + 1.5 (D/L)^1.5 + 7 (D/L)^3 (Hoerner, Fluid-Dynamic Drag 6-19)
 *   transition at the pressure minimum (just ahead of the max section) or at Re_x = bulbTransitionRe
 *   low-Re separation  q Af Ksep (steep/0.1)^2 / (1 + (Re_L/reS)^n)
 * The last term represents laminar separation over the afterbody that thickens the wake at the IOM's
 * low Reynolds numbers; it vanishes as Re_L -> 1e6+ where the classic high-Re form factor applies.
 */
export function bulbDrag(V, s, d, opt = {}) {
  const b = s.bulb, bd = d.bulb, m = d.model;
  const q = 0.5 * RHO_W * V * V;
  const reL = Math.max(1e3, V * b.L / NU_W);
  const xp = bd.xMax * (0.75 + 0.125 * (3 - bd.nose));      // pressure minimum (fraction of L)
  const xtr = clamp(Math.min(xp, (m.bulbTransitionRe ?? 3.5e5) / reL), 0.02, 1);
  const cf = cfTurb(reL) - xtr * (cfTurb(reL * xtr) - cfLam(reL * xtr));
  const Dff = 0.5 * (b.w + b.h);
  const fr = Dff / b.L;
  const FF = 1 + 1.5 * fr ** 1.5 + 7 * fr ** 3;
  const Df = q * b.S * cf * FF;
  const steep = b.tailSlopeMean * (0.5 + 0.25 * bd.tail);
  const K = opt.sepK ?? m.sepK ?? BULB_SEP.K, reS = opt.sepRe ?? m.sepRe ?? BULB_SEP.reS, nS = opt.sepN ?? m.sepN ?? BULB_SEP.n;
  const Dsep = q * b.Af * K * (steep / 0.1) ** 2 / (1 + (reL / reS) ** nS);
  return { D: Df + Dsep, Df, Dsep, reL, xtr, cf, FF };
}

// -------------------------------------------------------------- foils ---
/** Profile drag of a trapezoidal foil at lift coefficient cl (N). */
export function foilProfileDrag(V, geom, foil, cl) {
  const q = 0.5 * RHO_W * V * V;
  const re = Math.max(1e3, V * geom.mac / NU_W);
  const cd = sectionCd(foil.section, foil.tc, re, cl);
  return { D: q * geom.S * cd, cd, re };
}

/** Wall-junction interference (Hoerner 8-11): dCD(t^2) = 0.75 t/c - 0.0003/(t/c)^2, reduced by a fillet. */
export function junctionDrag(V, chord, tc, fillet) {
  const q = 0.5 * RHO_W * V * V;
  const t = tc * chord;
  const c = Math.max(0, 0.75 * tc - 0.0003 / (tc * tc));
  const red = 1 - 0.6 * clamp(fillet / Math.max(t, 1e-4), 0, 1);
  return q * t * t * c * red;
}

/** Upright resistance breakdown with the appendages at zero lift (tow-tank condition). */
export function uprightResistance(V, s, d) {
  const hr = hullResistance(V, 0, s, d);
  const fin = foilProfileDrag(V, s.fin, d.fin, 0).D;
  const rud = foilProfileDrag(V, s.rudder, d.rudder, 0).D;
  const bulb = bulbDrag(V, s, d).D;
  const jn = 2 * junctionDrag(V, d.fin.rootChord, d.fin.tc, d.fin.fillet) + junctionDrag(V, d.rudder.rootChord, d.rudder.tc, 0);
  return { V, hullF: hr.Rf, hullR: hr.Rr, fin, rudder: rud, bulb, junction: jn, total: hr.Rf + hr.Rr + fin + rud + bulb + jn };
}
