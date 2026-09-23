// Planform geometry and lattice generation for Moth foils.
// Body frame: origin at main-foil root quarter-chord, x forward, y to port, z up
// along the strut. World frame adds windward heel (rotation about x) and the ride
// height so that z = 0 is the water surface.
import { DEG, RHO_CARBON } from './constants.js';
import { flapTau } from './sections.js';

export function chordAt(f, eta) {
  const e = Math.min(1, Math.abs(eta));
  const trap = f.rootChord * (1 - (1 - f.taper) * e);
  const ell = f.rootChord * Math.sqrt(Math.max(0, 1 - e * e));
  const tipFloor = f.rootChord * f.taper * 0.35;
  return (1 - f.ellipticity) * trap + f.ellipticity * Math.max(ell, tipFloor);
}

export function tcAt(f, eta) { return f.tcRoot + (f.tcTip - f.tcRoot) * Math.min(1, Math.abs(eta)); }

export function zAt(f, y) {
  const ys = (f.dihedralStart ?? 0.75) * f.span / 2;
  const a = Math.abs(y);
  return a > ys ? (a - ys) * Math.tan((f.dihedral || 0) * DEG) : 0;
}

export function xqcAt(f, y) { return -Math.tan((f.sweep || 0) * DEG) * Math.abs(y); }

/** Planform area (projected, m^2), mean chord, aspect ratio. */
export function planformStats(f, n = 200) {
  let area = 0, vol = 0;
  const h = f.span / 2 / n;
  for (let i = 0; i < n; i++) {
    const eta = (i + 0.5) / n;
    const c = chordAt(f, eta);
    area += c * h;
    vol += 0.685 * c * c * tcAt(f, eta) * h;
  }
  area *= 2; vol *= 2;
  const mac = area / f.span;
  return { area, mac, AR: f.span * f.span / area, volume: vol, mass: vol * RHO_CARBON };
}

export function strutStats(s) {
  return { area: s.length * s.chord, thickness: s.tc * s.chord, mass: 0.685 * s.chord * s.chord * s.tc * s.length * RHO_CARBON };
}

// --- small vector helpers ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Rotate v about unit axis k by angle a (Rodrigues).
function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

function makePanel(surf, A, B, C, eps, extra) {
  const s = norm(sub(B, A));
  let c0 = [1, 0, 0];
  c0 = norm(sub(c0, scl(s, dot(c0, s))));
  const ch = rot(c0, s, eps);
  const n = norm(cross(s, ch));
  const dn = cross(s, n);
  return { surf, A, B, C, M: scl(add(A, B), 0.5), n, dn, ds: Math.hypot(...sub(B, A)), ...extra };
}

/** Horizontal lifting surface panels in body frame. */
function horizontalPanels(f, surf, x0, z0, nHalf) {
  const N = 2 * nHalf;
  const b2 = f.span / 2;
  const ys = [];
  for (let k = 0; k <= N; k++) ys.push(b2 * Math.cos(Math.PI * k / N));
  const out = [];
  const tau = surf === 'main' ? flapTau(f.flapFrac || 0) : 0;
  const flapHalf = (f.flapSpan || 0) * b2;
  for (let k = 0; k < N; k++) {
    const ya = ys[k], yb = ys[k + 1], ym = 0.5 * (ya + yb);
    const eta = Math.abs(ym) / b2;
    const c = chordAt(f, eta);
    const A = [x0 + xqcAt(f, ya), ya, z0 + zAt(f, ya)];
    const B = [x0 + xqcAt(f, yb), yb, z0 + zAt(f, yb)];
    const C = [x0 + xqcAt(f, ym) - 0.5 * c, ym, z0 + zAt(f, ym)];
    const eps = ((f.incidence || 0) + (f.twist || 0) * eta) * DEG + (f.cli || 0) / (2 * Math.PI);
    out.push(makePanel(surf, A, B, C, eps, {
      chord: c, tc: tcAt(f, eta), cli: f.cli || 0, family: f.family, eta, yb: ym,
      flapped: surf === 'main' && Math.abs(ym) <= flapHalf, tau, eps,
    }));
  }
  return out;
}

/** Heel + ride-height transform body -> world. */
export function worldTransform(design, heelDeg, rideHeight) {
  const ph = heelDeg * DEG;
  const c = Math.cos(ph), s = Math.sin(ph);
  const z0 = rideHeight - design.mainStrut.length * c;
  const P = (p) => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c + z0];
  const V = (v) => [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  return { P, V, z0, heel: ph };
}

/**
 * Build the world-frame lattice for a given heel (deg, +windward) and ride height (m,
 * hull bottom above water at the main strut). Horizontal panels that breach the
 * surface are dropped (ventilated tip) and reported.
 */
export function buildLattice(design, heelDeg = 0, rideHeight = design.boat.rideHeight) {
  const T = worldTransform(design, heelDeg, rideHeight);
  const m = design.main, e = design.elevator;
  const body = [
    ...horizontalPanels(m, 'main', 0, 0, m.nHalf || 12),
    ...horizontalPanels(e, 'elev', e.x, e.z || 0, e.nHalf || 7),
  ];
  const panels = [];
  let breached = 0, minDepth = Infinity;
  for (const p of body) {
    const A = T.P(p.A), B = T.P(p.B), C = T.P(p.C);
    const depth = -C[2];
    minDepth = Math.min(minDepth, depth);
    if (depth < 0.012) { breached++; continue; }
    panels.push({ ...p, A, B, C, M: scl(add(A, B), 0.5), n: T.V(p.n), dn: T.V(p.dn), depth });
  }
  // struts: vertical lifting lines from the foil root up to the surface
  const struts = [
    { s: design.mainStrut, surf: 'mstrut', xq: m.rootChord / 4 - design.mainStrut.chord / 4, z0: 0 },
    { s: design.rudderStrut, surf: 'rstrut', xq: e.x + e.rootChord / 4 - design.rudderStrut.chord / 4, z0: e.z || 0 },
  ];
  for (const st of struts) {
    const bot = T.P([st.xq, 0, st.z0]);
    const top = T.P([st.xq, 0, st.z0 + st.s.length]);
    const zs = -0.004;
    const tS = (zs - bot[2]) / (top[2] - bot[2]);
    if (!(tS > 0)) continue;
    const n = st.s.nSeg || 7;
    const ts = [];
    for (let k = 0; k <= n; k++) ts.push(tS * (1 - Math.cos(Math.PI * (n - k) / n)) / 2 * 1 + 0);
    // ts from top (tS) to bottom (0): A above B
    ts.sort((a, b) => b - a);
    const L = (t) => [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t];
    for (let k = 0; k < n; k++) {
      const A = L(ts[k]), B = L(ts[k + 1]), tm = 0.5 * (ts[k] + ts[k + 1]);
      const Mq = L(tm);
      const C = [Mq[0] - 0.5 * st.s.chord, Mq[1], Mq[2]];
      const pnl = makePanel(st.surf, A, B, C, 0, {
        chord: st.s.chord, tc: st.s.tc, cli: 0, family: st.s.family, eta: tm, yb: 0,
        flapped: false, tau: 0, eps: 0, depth: -C[2],
      });
      panels.push(pnl);
    }
  }
  return { panels, breached, minDepth, T, heel: heelDeg, rideHeight };
}

/** Geometry for rendering: list of spanwise stations with LE, TE, thickness in body frame. */
export function surfaceStations(f, x0, z0, n = 40) {
  const st = [];
  const b2 = f.span / 2;
  for (let k = 0; k <= n; k++) {
    const y = -b2 + (2 * b2 * k) / n;
    const eta = Math.abs(y) / b2;
    const c = Math.max(chordAt(f, eta), 0.004);
    const xq = x0 + xqcAt(f, y);
    const twist = ((f.incidence || 0) + (f.twist || 0) * eta) * DEG;
    st.push({ y, z: z0 + zAt(f, y), xLE: xq + c / 4, chord: c, tc: tcAt(f, eta), twist, eta });
  }
  return st;
}
