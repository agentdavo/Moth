// Low-Reynolds-number section polars for the fin and rudder (Re ~ 3e4 – 3e5).
//
// Anchor data: SD8020 (10.1 % symmetric), UIUC low-turbulence tunnel,
// Selig, Guglielmo, Broeren & Giguère, "Summary of Low-Speed Airfoil Data Vol. 1" (1995), Appendix B,
// runs 252/254/256/258 at Re = 61 400, 101 700, 203 500, 305 200 (clean model).
// The table below is c_d vs |c_l| averaged over the + and − branches (symmetric section),
// read from the tabulated polars. At Re 61k the laminar separation bubbles make the polar lumpy
// ("dead band" around c_l = 0, Selig et al. §3.5); the averaged values smooth that.
//
// Other families are modelled as multipliers on the anchor (assumptions, see docs/IOM_LAB.md):
//   NACA 00xx:     same thickness form law, +8 % at Re <= 1e5 fading to 0 at 4e5 (similar bubbles,
//                  Selig et al. report dead bands on NACA 0009 as on SD8020)
//   NACA 63-0xx:   laminar-bucket section: −10 % at Re >= 4e5 but +25 % at Re <= 1e5, because the steeper
//                  aft pressure recovery produces a longer laminar separation bubble (Cameron in Gilbert,
//                  "Bulb size & shape"; Seahorse Feb 2009 on low-Re section design)
// Thickness: Hoerner/Torenbeek form factor FF = 1 + 2 t/c + 60 (t/c)^4 relative to 10.1 %.
import { clamp } from './constants.js';

const RE = [61400, 101700, 203500, 305200];
const CL = [0, 0.15, 0.30, 0.45, 0.60, 0.70, 0.80];
const CD = [
  [0.0155, 0.0180, 0.0165, 0.0175, 0.0200, 0.0250, 0.0360],
  [0.0102, 0.0126, 0.0133, 0.0155, 0.0175, 0.0220, 0.0350],
  [0.0085, 0.0082, 0.0097, 0.0115, 0.0135, 0.0175, 0.0270],
  [0.0074, 0.0079, 0.0087, 0.0104, 0.0120, 0.0160, 0.0240],
];
export const SD8020_TABLE = { RE, CL, CD };

const ff = (tc) => 1 + 2 * tc + 60 * tc ** 4;
const FF_REF = ff(0.101);

function interp1(xs, ys, x) {
  if (x <= xs[0]) return ys[0] + (ys[1] - ys[0]) * (x - xs[0]) / (xs[1] - xs[0]);
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
  const n = xs.length - 1;
  return ys[n] + (ys[n] - ys[n - 1]) * (x - xs[n]) / (xs[n] - xs[n - 1]);
}

/** SD8020 c_d at |cl| <= 0.8 and any Re (log-interpolated; laminar-like Re^-0.5 below 61k, Re^-0.2 above 305k). */
export function sd8020Cd(re, cl) {
  const a = Math.min(Math.abs(cl), 0.8);
  const row = (k) => interp1(CL, CD[k], a);
  const lr = Math.log(Math.max(re, 1e3));
  if (re <= RE[0]) return row(0) * Math.pow(RE[0] / Math.max(re, 1e4), 0.5);
  if (re >= RE[3]) return row(3) * Math.pow(RE[3] / re, 0.2);
  for (let k = 1; k < RE.length; k++) if (re <= RE[k]) {
    const t = (lr - Math.log(RE[k - 1])) / (Math.log(RE[k]) - Math.log(RE[k - 1]));
    return Math.exp(Math.log(row(k - 1)) * (1 - t) + Math.log(row(k)) * t);
  }
  return row(3);
}

/** weight of the low-Re (bubble-dominated) regime: 1 at Re <= 1e5, 0 at Re >= 4e5 */
export function bubbleWeight(re) { return clamp(Math.log(4e5 / re) / Math.log(4), 0, 1); }

export function familyFactor(section, re) {
  const bw = bubbleWeight(re);
  if (section === 'naca4') return 1 + 0.08 * bw;
  if (section === 'naca6') return 1 + 0.25 * bw - 0.10 * (1 - bw);
  return 1;
}

/** Maximum section lift coefficient at low Re (SD8020: 0.78–0.83 for Re 6e4–3e5; NACA 0009 0.7–0.8 at 4e4–1e5). */
export function clMax(section, tc, re) {
  const base = 0.74 + 0.09 * clamp(Math.log10(re / 6e4) / Math.log10(5), 0, 1);
  const t = clamp(0.62 + 3.8 * tc, 0.8, 1.12);          // thin sections stall earlier
  const fam = section === 'naca6' ? 0.93 : 1;
  return base * t * fam;
}

/** Section profile drag coefficient (per planform area) for |cl| incl. stall rise. */
export function sectionCd(section, tc, re, cl) {
  const a = Math.abs(cl);
  const cm = clMax(section, tc, re);
  let cd = sd8020Cd(re, Math.min(a, 0.8)) * ff(tc) / FF_REF * familyFactor(section, re);
  if (a > 0.8) cd += 0.02 * (a - 0.8) / 0.1;
  if (a > cm) cd += 0.15 * (a - cm) / 0.1;                 // post-stall
  return cd;
}

/** 2-D lift slope per rad at low Re (UIUC SD8020: ~5.9–6.4 /rad over Re 1e5–3e5; dead band below). */
export function liftSlope2D(section, tc, re) {
  const bw = bubbleWeight(re);
  return 2 * Math.PI * (0.96 - 0.08 * bw) * (1 + 0.3 * (tc - 0.1));
}

/** 3-D lift slope of a finite foil with effective aspect ratio ARe (Helmbold). */
export function liftSlope3D(a0, ARe, sweepRad = 0) {
  const k = a0 * Math.cos(sweepRad) / (Math.PI * ARe);
  return a0 * Math.cos(sweepRad) / (Math.sqrt(1 + k * k) + k);
}
