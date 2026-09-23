// Planform geometry and lattice generation for Moth foils.
// Body frame: origin at main-foil root quarter-chord, x forward, y to port, z up
// along the strut. World frame adds windward heel (rotation about x) and the ride
// height so that z = 0 is the water surface.
import { DEG, RHO_CARBON } from './constants.js';
import { flapTau, tubercleEffects } from './sections.js';

export function chordAt(f, eta) {
  const e = Math.min(1, Math.abs(eta));
  const trap = f.rootChord * (1 - (1 - f.taper) * e);
  const ell = f.rootChord * Math.sqrt(Math.max(0, 1 - e * e));
  const tipFloor = f.rootChord * f.taper * 0.35;
  return (1 - f.ellipticity) * trap + f.ellipticity * Math.max(ell, tipFloor);
}

export function tcAt(f, eta) { return f.tcRoot + (f.tcTip - f.tcRoot) * Math.min(1, Math.abs(eta)); }

// ---------------------------------------------------------------------------------
// Generalised planform. All shape parameters are optional (default = planar wing):
//   dihedralInner (deg)          dihedral inboard of dihedralStart; with an anhedral outer
//                                panel this is the gull wing (seagull / albatross shoulder)
//   crescent (deg), crescentStart  extra aft sweep ramping in quadratically outboard of
//                                crescentStart -> lunate (tuna / swift) or raked tips
//   wingletHeight (m), wingletCant (deg, +90 up, -90 down, 0 planar), wingletTaper,
//   wingletSweep (deg)           tip device at the end of the main path
//   feathers (N >= 2), featherStart (eta), featherSpread (deg dihedral fan), featherFan
//   (deg plan fan), featherChord (fraction of the break chord shared by the feathers),
//   featherLength (x outboard length)   splayed "primary feather" slotted tips
//   tubercleAmp (A/c), tubercleWave (lambda/c)   humpback leading-edge tubercles
//   riblet (um)                  shark-skin riblet spacing on the turbulent part
// ---------------------------------------------------------------------------------
export function zAt(f, y) {
  const ys = (f.dihedralStart ?? 0.75) * f.span / 2;
  const a = Math.abs(y);
  return Math.min(a, ys) * Math.tan((f.dihedralInner || 0) * DEG) + Math.max(0, a - ys) * Math.tan((f.dihedral || 0) * DEG);
}

export function xqcAt(f, y) {
  const b2 = f.span / 2, a = Math.abs(y);
  let x = -Math.tan((f.sweep || 0) * DEG) * a;
  if (f.crescent) {
    const e0 = f.crescentStart ?? 0.6, eta = a / b2;
    if (eta > e0) { const u = (eta - e0) / (1 - e0); x -= Math.tan(f.crescent * DEG) * b2 * (1 - e0) * u * u; }
  }
  return x;
}

const hasFeathers = (f) => (f.feathers || 0) >= 2;

/**
 * Spanwise paths of the +y half-wing in the body frame (relative to the foil root
 * quarter chord). Each path is a list of stations from inboard to outboard:
 *   { P: quarter-chord point, t: spanwise unit tangent (y-z plane), chord, tc,
 *     twist (rad, geometric incl. incidence), eta, kind: main|winglet|feather, s: arc length }
 * The main path uses half-cosine spacing (identical to full-span cosine spacing).
 */
export function halfPaths(f, n = 12, extraDense = 1) {
  const b2 = f.span / 2;
  const eEnd = hasFeathers(f) ? (f.featherStart ?? 0.8) : 1;
  const twistAt = (eta) => ((f.incidence || 0) + (f.twist || 0) * Math.min(1, eta)) * DEG;
  const nm = n * extraDense;
  const main = [];
  let s = 0, prev = null;
  for (let k = 0; k <= nm; k++) {
    const eta = eEnd * Math.sin(Math.PI / 2 * k / nm);
    const y = eta * b2;
    const P = [xqcAt(f, y), y, zAt(f, y)];
    const d = 1e-4;
    const t = norm([0, d, zAt(f, y + d) - zAt(f, y)]);
    if (prev) s += Math.hypot(P[1] - prev[1], P[2] - prev[2]);
    prev = P;
    main.push({ P, t, chord: Math.max(chordAt(f, eta), 0.002), tc: tcAt(f, eta), twist: twistAt(eta), eta, kind: 'main', s });
  }
  const paths = [main];
  const tip = main[main.length - 1];
  if (!hasFeathers(f) && (f.wingletHeight || 0) > 0) {
    const h = f.wingletHeight, cant = (f.wingletCant ?? 90) * DEG;
    const nw = Math.max(3, Math.round(n / 3)) * extraDense;
    // a short blend arc from the wing tangent to the cant angle, then the straight winglet
    const t0 = Math.atan2(tip.t[2], tip.t[1]);
    const w = [];
    let P = tip.P.slice(), sw = 0;
    for (let k = 0; k <= nw; k++) {
      const u = k / nw;
      const ang = t0 + (cant - t0) * Math.min(1, u / 0.3);
      const t = [0, Math.cos(ang), Math.sin(ang)];
      if (k > 0) { const ds = h / nw; P = [P[0] - Math.tan((f.wingletSweep ?? 30) * DEG) * ds, P[1] + t[1] * ds, P[2] + t[2] * ds]; sw += ds; }
      w.push({ P: P.slice(), t, chord: tip.chord * (1 - (1 - (f.wingletTaper ?? 0.5)) * u), tc: tip.tc, twist: twistAt(1), eta: 1 + u * h / b2, kind: 'winglet', s: tip.s + sw });
    }
    paths.push(w);
  }
  if (hasFeathers(f)) {
    const N = Math.round(f.feathers), br = tip;
    const L = (1 - eEnd) * b2 * (f.featherLength ?? 1.15);
    const cb = br.chord, cf = cb * (f.featherChord ?? 0.9) / N;
    const leB = br.P[0] + 0.25 * cb;
    const nf = Math.max(3, Math.round(n / 3)) * extraDense;
    for (let i = 0; i < N; i++) {
      const fr = i / (N - 1) - 0.5;
      const dih = ((f.dihedral || 0) - (f.featherSpread ?? 20) * fr) * DEG; // leading feather highest
      const sweep = (f.sweep || 0) * DEG + (f.featherFan ?? 12) * DEG * (fr + 0.5);
      const t = [0, Math.cos(dih), Math.sin(dih)];
      const x0 = leB - i * cb / N - 0.25 * cf;
      const path = [];
      for (let k = 0; k <= nf; k++) {
        const u = k / nf, sl = L * u;
        path.push({ P: [x0 - Math.tan(sweep) * sl, br.P[1] + t[1] * sl, br.P[2] + t[2] * sl], t, chord: cf * (1 - 0.45 * u), tc: br.tc, twist: twistAt(eEnd), eta: eEnd + (1 - eEnd) * u, kind: 'feather', s: br.s + sl });
      }
      paths.push(path);
    }
  }
  return paths;
}

/** Planform area (incl. tip devices, m^2), mean chord, aspect ratio (projected span). */
export function planformStats(f, n = 200) {
  let area = 0, vol = 0;
  for (const path of halfPaths(f, 40)) {
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1];
      const ds = Math.hypot(b.P[1] - a.P[1], b.P[2] - a.P[2]) || Math.abs(b.P[0] - a.P[0]);
      const c = 0.5 * (a.chord + b.chord), tc = 0.5 * (a.tc + b.tc);
      area += c * ds;
      vol += 0.685 * c * c * tc * ds;
    }
  }
  void n;
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

/** Horizontal lifting surface panels (any path set) in body frame. */
function horizontalPanels(f, surf, x0, z0, nHalf) {
  const b2 = f.span / 2;
  const out = [];
  const tau = surf === 'main' ? flapTau(f.flapFrac || 0) : 0;
  const flapHalf = (f.flapSpan || 0) * b2;
  const paths = halfPaths(f, nHalf);
  for (const side of [1, -1]) {
    for (const path of paths) {
      for (let k = 0; k < path.length - 1; k++) {
        const inn = path[k], outr = path[k + 1];
        const P = (st) => [x0 + st.P[0], side * st.P[1], z0 + st.P[2]];
        // bound vortex runs from +y towards -y (positive circulation = lift along +n)
        const [A, B] = side > 0 ? [P(outr), P(inn)] : [P(inn), P(outr)];
        const c = 0.5 * (inn.chord + outr.chord);
        const Mb = [0.5 * (A[0] + B[0]), 0.5 * (A[1] + B[1]), 0.5 * (A[2] + B[2])];
        const C = [Mb[0] - 0.5 * c, Mb[1], Mb[2]];
        const eta = 0.5 * (inn.eta + outr.eta);
        const twist = 0.5 * (inn.twist + outr.twist);
        const eps = twist + (f.cli || 0) / (2 * Math.PI);
        out.push(makePanel(surf, A, B, C, eps, {
          chord: c, tc: 0.5 * (inn.tc + outr.tc), cli: f.cli || 0, family: f.family, eta, yb: Mb[1], pb: Mb,
          kind: inn.kind, flapped: surf === 'main' && inn.kind === 'main' && Math.abs(Mb[1]) <= flapHalf + 1e-9, tau, eps,
          tub: inn.kind === 'main' ? (f.tubercleAmp || 0) : 0, tubWave: f.tubercleWave || 0.3, rib: f.riblet || 0,
          // local sweep of the bound vortex (crescent / raked tips stall earlier)
          sweepLocal: Math.atan2(Math.abs(outr.P[0] - inn.P[0]), Math.hypot(outr.P[1] - inn.P[1], outr.P[2] - inn.P[2]) || 1e-9),
          // slot/gap interference of feather tips, junction of winglets (research §3-4)
          slotDrag: inn.kind === 'feather' ? 0.001 : inn.kind === 'winglet' ? 0.0006 : 0,
          // tubercle lift-slope loss at Moth Re (evaluated at 6 m/s)
          slopeF: inn.kind === 'main' && f.tubercleAmp > 0 ? tubercleEffects(f.tubercleAmp, f.tubercleWave, 6 * c / 1.19e-6).slope : 1,
        }));
      }
    }
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
        chord: st.s.chord, tc: st.s.tc, cli: 0, family: st.s.family, eta: tm, yb: 0, pb: [st.xq, 0, st.z0 + tm * st.s.length],
        flapped: false, tau: 0, eps: 0, depth: -C[2], rib: st.s.riblet || 0,
      });
      panels.push(pnl);
    }
  }
  return { panels, breached, minDepth, T, heel: heelDeg, rideHeight };
}

