// Complete hydrodynamic force model for the appendage set at a given state.
// Combines the vortex-lattice potential-flow forces (lift + induced drag incl.
// free-surface image and foil/strut interference) with strip-theory viscous
// drag, spray, junction and wave drag, cavitation and ventilation checks.
import { RHO_WATER, G, DEG } from './constants.js';
import { sectionProps, sectionCd, sectionCpMin, cavitationNumber, reynolds, flapEta, liftSlope2D } from './sections.js';
import { evalLattice } from './vlm.js';

const SURFS = ['main', 'elev', 'mstrut', 'rstrut'];
export const SPRAY_C = 0.30;

/**
 * @param sol   lattice solution (solveLattice / finishSolution)
 * @param lat   lattice geometry (buildLattice)
 * @param design
 * @param st    { V, theta, df, de, beta }  (m/s, rad)
 * @param opts  { finish }
 */
export function hydroForces(sol, lat, design, st, opts = {}) {
  const V = st.V;
  const q = 0.5 * RHO_WATER * V * V;
  const rv2 = RHO_WATER * V * V;
  const etaF = flapEta(st.df);
  const c = [1, st.theta || 0, (st.df || 0) * etaF, st.de || 0, st.beta || 0];
  const ev = evalLattice(sol, c, st._scratch);
  st._scratch = ev;
  const panels = sol.panels;
  const N = sol.N;
  const finish = opts.finish ?? design.boat.finish ?? 1;
  // unit flow direction (water relative to boat)
  const ul = Math.hypot(1, c[4], c[1]);
  const ux = -1 / ul, uy = -c[4] / ul, uz = c[1] / ul;
  const ref = lat.T.P([0, 0, 0]);

  const S = {};
  for (const s of SURFS) S[s] = { F: [0, 0, 0], M: [0, 0, 0], lift: 0, induced: 0, profile: 0, area: 0, clMax: -9, cavMin: 9, stall: 0 };
  const strips = new Array(N);
  let cavMin = 9, stallMax = 0, ventMax = 0;
  const addForce = (s, F, P) => {
    const o = S[s];
    o.F[0] += F[0]; o.F[1] += F[1]; o.F[2] += F[2];
    const rx = P[0] - ref[0], ry = P[1] - ref[1], rz = P[2] - ref[2];
    o.M[0] += ry * F[2] - rz * F[1];
    o.M[1] += rz * F[0] - rx * F[2];
    o.M[2] += rx * F[1] - ry * F[0];
  };
  for (let i = 0; i < N; i++) {
    const p = panels[i];
    const Fp = [ev.f[i * 3] * rv2, ev.f[i * 3 + 1] * rv2, ev.f[i * 3 + 2] * rv2];
    const area = p.chord * p.ds;
    const cl = ev.cl[i];
    const sp = sectionProps(p, reynolds(V, p.chord));
    let dclFlap = 0, dRad = 0;
    if (p.flapped) { dRad = st.df; dclFlap = liftSlope2D(p.tc) * p.tau * etaF * st.df; }
    if (p.surf === 'elev') { dRad = 0; }
    const re = reynolds(V, p.chord);
    const cd = sectionCd(p, cl, re, dclFlap, dRad, finish);
    const Dv = q * area * cd;
    const Fv = [Dv * ux, Dv * uy, Dv * uz];
    const cp = sectionCpMin(p, cl, dclFlap, dRad);
    const sigma = cavitationNumber(V, p.depth);
    const cav = sigma + cp;
    const clmaxE = cl >= 0 ? sp.clmax + 0.5 * Math.max(0, dclFlap) : sp.clmin + 0.5 * Math.min(0, dclFlap);
    const stall = cl / clmaxE;
    addForce(p.surf, Fp, p.M);
    addForce(p.surf, Fv, p.M);
    const o = S[p.surf];
    // induced (pressure) drag = component of the potential force along the flow
    o.induced += Fp[0] * ux + Fp[1] * uy + Fp[2] * uz;
    o.profile += Dv;
    o.area += area;
    o.stall = Math.max(o.stall, stall);
    o.cavMin = Math.min(o.cavMin, cav);
    cavMin = Math.min(cavMin, cav);
    if (p.surf === 'main' || p.surf === 'elev') stallMax = Math.max(stallMax, stall);
    if ((p.surf === 'mstrut' || p.surf === 'rstrut') && p.depth < 0.25) {
      // ventilation of surface-piercing strut: local incidence vs inception angle (~10 deg)
      const vent = Math.abs(cl) / (sp.a0 * 10 * DEG);
      ventMax = Math.max(ventMax, vent);
    }
    strips[i] = { surf: p.surf, kind: p.kind, pb: p.pb, cl, cd, cp, sigma, cav, re, stall, gam: ev.gam[i] * V, eta: p.eta, yb: p.yb, depth: p.depth, chord: p.chord, ds: p.ds, lift: Fp[2] };
  }
  // Lift components per surface, perpendicular to flow (world z for foils, y for struts)
  for (const s of SURFS) S[s].lift = s.endsWith('strut') ? S[s].F[1] : S[s].F[2];

  // Spray drag of the two surface-piercing struts: D = C q t^2, C = 0.30 measured on Moth
  // struts (Beaver & Zseleczky 2009; Hoerner gives 0.24)
  let spray = 0, junction = 0, wave = 0;
  const surfPt = (surf) => { const ps = panels.filter((p) => p.surf === surf); return ps.length ? ps[0].A : ref; };
  for (const [s, strut] of [['mstrut', design.mainStrut], ['rstrut', design.rudderStrut]]) {
    const t = strut.tc * strut.chord;
    const Ds = q * SPRAY_C * t * t;
    spray += Ds;
    addForce(s, [Ds * ux, Ds * uy, Ds * uz], surfPt(s));
    // T-junction interference (Hoerner 8-11): C_Dt = 17 (t/c)^2 - 0.05 on mean thickness^2
    const foil = s === 'mstrut' ? design.main : design.elevator;
    const tf = foil.tcRoot * foil.rootChord;
    const tbar = 0.5 * (t + tf), cbar = 0.5 * (strut.chord + foil.rootChord);
    const cdj = Math.max(0, 17 * (tbar / cbar) ** 2 - 0.05) * (design.boat.junctionFactor ?? 1);
    const Dj = q * cdj * tbar * tbar;
    junction += Dj;
    const j = s === 'mstrut' ? lat.T.P([0, 0, 0]) : lat.T.P([design.elevator.x, 0, design.elevator.z || 0]);
    addForce(s, [Dj * ux, Dj * uy, Dj * uz], j);
  }
  // Wave drag of submerged lifting surfaces (2-D vortex below free surface, 3-D factor 0.6)
  for (const [s, f] of [['main', design.main], ['elev', design.elevator]]) {
    const o = S[s];
    if (o.area <= 0) continue;
    const CL = o.lift / (q * o.area);
    const cbar = o.area / f.span;
    const depth = panels.find((p) => p.surf === s)?.depth ?? 0.5;
    const cdw = 0.6 * (G * cbar / (2 * V * V)) * CL * CL * Math.exp(-2 * G * depth / (V * V));
    const Dw = q * o.area * cdw;
    wave += Dw;
    addForce(s, [Dw * ux, Dw * uy, Dw * uz], lat.T.P([s === 'main' ? 0 : f.x, 0, 0]));
  }
  // tip clearance rule: depth >= max(0.05 m, 0.5 c_tip) for every horizontal panel
  let tipClear = 9;
  for (const p of panels) if (p.surf === 'main' || p.surf === 'elev') tipClear = Math.min(tipClear, p.depth - Math.max(0.05, 0.5 * p.chord));
  if (lat.breached) tipClear = Math.min(tipClear, -0.05);
  const F = [0, 0, 0], M = [0, 0, 0];
  let induced = 0, profile = 0;
  for (const s of SURFS) {
    for (let k = 0; k < 3; k++) { F[k] += S[s].F[k]; M[k] += S[s].M[k]; }
    induced += S[s].induced; profile += S[s].profile;
  }
  return {
    F, M, ref, S, strips, q,
    drag: { induced, profile, spray, junction, wave, total: induced + profile + spray + junction + wave },
    cavMin, stallMax, ventMax, tipClear, breached: lat.breached, minDepth: lat.minDepth,
    flow: [ux, uy, uz], c,
  };
}

export { SURFS, DEG };
