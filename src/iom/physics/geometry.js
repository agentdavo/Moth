// Geometry of the hull, fin, bulb and rudder.
import { RHO_LEAD, RHO_W, clamp } from './constants.js';

// ---------------------------------------------------------------- bulb ---
// Axisymmetric-like body with elliptic cross-sections.
// Non-dimensional half-thickness rho(xi), xi = x/L in [0,1], max 1 at xi = xm:
//   nose  (xi <= xm): rho = (1 - (1 - s)^p)^(1/p),  s = xi/xm       p = nose exponent (2 = ellipse)
//   tail  (xi >  xm): rho = 1 - t^q,                 t = (xi-xm)/(1-xm)  q = tail exponent (2 = parabola)
// The section at xi is an ellipse of height h*rho and width w*rho, w = aspect*h.
export function bulbRho(xi, xm, p, q) {
  if (xi <= 0 || xi >= 1) return 0;
  if (xi <= xm) { const s = xi / xm; return Math.pow(Math.max(0, 1 - Math.pow(1 - s, p)), 1 / p); }
  const t = (xi - xm) / (1 - xm);
  return Math.max(0, 1 - Math.pow(t, q));
}

const NB = 120;
// cosine-clustered stations (dense at both ends where the slope changes fastest)
const XI = Array.from({ length: NB + 1 }, (_, i) => 0.5 - 0.5 * Math.cos(Math.PI * i / NB));

/** Ramanujan perimeter of an ellipse with semi-axes a, b. */
export function ellipsePerimeter(a, b) {
  if (a + b <= 0) return 0;
  const l = (a - b) / (a + b), l2 = 3 * l * l;
  return Math.PI * (a + b) * (1 + l2 / (10 + Math.sqrt(4 - l2)));
}

/** Shape integrals that do not depend on size: I2 = int rho^2 dxi, xc = centroid. */
export function bulbShapeIntegrals(b) {
  let I2 = 0, M1 = 0;
  for (let i = 1; i <= NB; i++) {
    const x0 = XI[i - 1], x1 = XI[i];
    const r0 = bulbRho(x0, b.xMax, b.nose, b.tail), r1 = bulbRho(x1, b.xMax, b.nose, b.tail);
    const a = 0.5 * (r0 * r0 + r1 * r1) * (x1 - x0);
    I2 += a; M1 += a * 0.5 * (x0 + x1);
  }
  return { I2, xc: M1 / I2 };
}

/**
 * Size a bulb of given mass. Returns height h, width w, volume, wetted area, frontal area,
 * centroid (fraction of length), equivalent diameter and slenderness numbers.
 */
export function bulbGeometry(b, mass) {
  const L = b.length;
  const vol = mass / RHO_LEAD;
  const { I2, xc } = bulbShapeIntegrals(b);
  const h = Math.sqrt(4 * vol / (Math.PI * b.aspect * L * I2));
  const w = b.aspect * h;
  // wetted area: sum of elliptic perimeters times the meridian arc length
  let S = 0, maxTailSlope = 0;
  for (let i = 1; i <= NB; i++) {
    const x0 = XI[i - 1], x1 = XI[i];
    const r0 = bulbRho(x0, b.xMax, b.nose, b.tail), r1 = bulbRho(x1, b.xMax, b.nose, b.tail);
    const dx = (x1 - x0) * L;
    const req0 = 0.5 * Math.sqrt(w * h) * r0, req1 = 0.5 * Math.sqrt(w * h) * r1;
    const ds = Math.hypot(dx, req1 - req0);
    const P = 0.5 * (ellipsePerimeter(0.5 * w * r0, 0.5 * h * r0) + ellipsePerimeter(0.5 * w * r1, 0.5 * h * r1));
    S += P * ds;
    if (x0 >= b.xMax) maxTailSlope = Math.max(maxTailSlope, (req0 - req1) / dx);
  }
  const D = Math.sqrt(w * h);             // equivalent diameter
  const Af = Math.PI / 4 * w * h;         // frontal area
  // mean tail closing angle (equivalent radius drop over the run) and max tail slope
  const tailRun = (1 - b.xMax) * L;
  return {
    L, h, w, D, vol, S, Af, I2, xc, fineness: L / D,
    prismatic: I2,                         // volume / (frontal area * L)
    tailSlopeMean: 0.5 * D / tailRun, tailSlopeMax: maxTailSlope,
    wettedPerVolume: S / vol,
  };
}

/** Sampled outline for drawing: [{x, rw, rh}] with x from the nose (m). */
export function bulbOutline(b, g, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const xi = 0.5 - 0.5 * Math.cos(Math.PI * i / n);
    const r = bulbRho(xi, b.xMax, b.nose, b.tail);
    out.push({ x: xi * g.L, rw: 0.5 * g.w * r, rh: 0.5 * g.h * r });
  }
  return out;
}

// ---------------------------------------------------------------- foils ---
/** Trapezoidal foil: span, root/tip chord, t/c; area, mean chord, volume, mass. */
export function foilGeometry(f, span, density) {
  const cr = f.rootChord, ct = f.tipChord;
  const S = span * (cr + ct) / 2;
  const cbar = (cr + ct) / 2;
  // mean aerodynamic chord and section area 0.685 c t (NACA 00xx family)
  const mac = (2 / 3) * (cr * cr + cr * ct + ct * ct) / (cr + ct);
  const c2 = (cr * cr + cr * ct + ct * ct) / 3;   // mean of c^2 along span
  const vol = 0.685 * f.tc * span * c2;
  const mass = vol * (density ?? 1600);
  const AR = span * span / S;
  const taper = ct / cr;
  // spanwise centroid of area measured from the root
  const yc = span * (cr + 2 * ct) / (3 * (cr + ct));
  return { span, S, cbar, mac, vol, mass, AR, taper, yc, tMax: f.tc * cr, wet: 2.04 * S };
}

/** Bending of the fin as a tapered solid cantilever loaded by the bulb weight component. */
export function finDeflection(fin, span, force, E) {
  // I(y) = k c t^3 with k = 0.036 for a NACA 00xx-type solid section; integrate M^2/EI numerically
  const n = 40;
  let defl = 0;
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) / n * span;               // from root
    const c = fin.rootChord + (fin.tipChord - fin.rootChord) * y / span;
    const t = fin.tc * c;
    const I = 0.036 * c * t * t * t;
    const M = force * (span - y);
    // unit-load method: delta = int M(y) m(y) / EI dy with m = (span - y)
    defl += M * (span - y) / (E * I) * (span / n);
  }
  return defl;
}

// ---------------------------------------------------------------- hull ---
/**
 * Canoe body derived from main parameters and the canoe-body volume.
 * Wetted area: Gerritsma/Keuning Delft-series regression
 *   Sc = (1.97 + 0.171 BWL/Tc) (0.65/Cm)^(1/3) sqrt(Vc LWL)
 * Transverse waterplane inertia: I_T = C_IT L B^3, C_IT = 0.77 (0.1216 Cwp - 0.0410) (PNA approximation, IOM-fitted).
 * KB (Morrish): B lies Tc (1/6 + Cb/(3 Cwp)) below the waterline.
 */
export function hullGeometry(h, volC) {
  const L = h.lwl, B = h.bwl;
  const Cb = h.cp * h.cm;
  const Tc = volC / (Cb * L * B);
  const S = (1.97 + 0.171 * B / Tc) * Math.pow(0.65 / h.cm, 1 / 3) * Math.sqrt(volC * L);
  const Awp = h.cwp * L * B;
  // PNA approximation x 0.77: the factor is fitted to Bantock's Hydromax GZ(40) vs BWL trend for IOM hulls
  // (Seahorse, Feb 2009) -- fine-ended IOM waterplanes carry less inertia than ship waterplanes of equal Cwp
  const CIT = 0.77 * (0.1216 * h.cwp - 0.0410);
  const IT = CIT * L * B * B * B;
  const CIL = h.cwp * h.cwp / 14;                 // rough longitudinal inertia coefficient
  const IL = CIL * B * L * L * L;
  const zB = -Tc * (1 / 6 + Cb / (3 * h.cwp));   // centre of buoyancy of the canoe body (m, +up)
  const Ax = h.cm * B * Tc;                        // max section area
  return { L, B, Tc, Cb, S, Awp, IT, IL, zB, Ax, volC, lvr: L / Math.cbrt(volC), btr: B / Tc };
}

export { clamp, RHO_W };
