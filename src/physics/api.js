// High-level entry points shared by the UI (via a Web Worker) and the tests.
import { MothModel } from './vpp.js';
import { evaluateDesign } from './objective.js';
import { buildFlightModel, simulate, makeSea, linearStability } from './dynamics.js';
import { planformStats, chordAt } from './geometry.js';
import { structuralCheck } from './structure.js';
import { sectionCd, sectionCpMin, sectionProps, reynolds, liftSlope2D, flapTau, flapEta } from './sections.js';
import { KNOT, DEG, toKn, G } from './constants.js';
import { WIND_BANDS } from './design.js';

const FAR = 60;

/** Detailed solution at one sailing condition, for the 3D view and the result panels. */
export function conditionDetail(design, cond) {
  const model = new MothModel(design);
  const c = { tws: cond.tws * KNOT, twa: cond.twa, heel: cond.heel ?? 10, ride: cond.ride ?? design.boat.rideHeight };
  let r = model.speedAt(c);
  const b = design.boat, L = design.mainStrut.length;
  if (!r) {
    const d = model.displacementSpeed(c);
    return {
      foiling: false, V: d.V, Vkn: toKn(d.V), vmg: toKn(d.V * Math.cos(c.twa * DEG)), heel: 0, z0: -0.1 - L + 0.12,
      flap: b.flapMax, elev: 0, beta: 0, sailorX: -0.2, sailorY: 0.6, strips: [], forces: [], segments: null,
      limit: 'not foiling', takeoffKn: toKn(model.takeoffSpeed()), cond,
    };
  }
  const cfg = model.config(c.heel, c.ride);
  const T = cfg.lat.T;
  const h = r.h;
  const P = (p) => T.P(p);
  const ref = T.P([0, 0, 0]);
  // horseshoe segments with circulation (actual m^2/s) in three.js coordinates
  const panels = cfg.sol.panels;
  const n = panels.length;
  const data = new Float32Array(n * 6 * 8);
  let k = 0;
  const push = (a, bb, g) => {
    data.set([a[0], a[2], -a[1], g, bb[0], bb[2], -bb[1], 0], k * 8); k++;
  };
  for (let i = 0; i < n; i++) {
    const p = panels[i];
    const g = h.strips[i].gam;
    const A = p.A, B = p.B;
    const Af = [A[0] - FAR, A[1], A[2]], Bf = [B[0] - FAR, B[1], B[2]];
    push(Af, A, g); push(A, B, g); push(B, Bf, g);
    const m = (v) => [v[0], v[1], -v[2]];
    push(m(Af), m(A), g * model.imageSign); push(m(A), m(B), g * model.imageSign); push(m(B), m(Bf), g * model.imageSign);
  }
  const cb = Math.cos(r.u[2]), sb = Math.sin(r.u[2]);
  const sailW = [r.sail.sail[0] * cb - r.sail.sail[1] * sb, r.sail.sail[0] * sb + r.sail.sail[1] * cb, r.sail.sail[2]];
  const ce = cfg.ceBody(r.sail.ceFactor);
  const forces = [
    { name: 'Main foil', F: h.S.main.F, P: P([0, 0, 0]), color: 0x4fc3f7 },
    { name: 'Elevator', F: h.S.elev.F, P: P([design.elevator.x, 0, design.elevator.z || 0]), color: 0x81c784 },
    { name: 'Main strut', F: h.S.mstrut.F, P: P([0, 0, 0.15]), color: 0xba68c8 },
    { name: 'Rudder strut', F: h.S.rstrut.F, P: P([design.elevator.x, 0, 0.15]), color: 0xba68c8 },
    { name: 'Sail', F: sailW, P: [ref[0] + ce[0], ref[1] + ce[1], ref[2] + ce[2]], color: 0xffd54f },
    { name: 'Weight', F: [0, 0, -model.W], P: P([r.xs * 0.7 + b.boatX * 0.3, -r.ys * 0.6, L + 0.4]), color: 0xef5350 },
  ];
  const deckWorld = P([b.wandX, 0, L + b.deckAboveKeel]);
  const psi = Math.acos(Math.min(1, Math.max(-1, deckWorld[2] / b.wandLength)));
  const awaDeg = r.sail.awa / DEG;
  const mainStrips = h.strips.map((s, i) => ({ ...s, i })).filter((s) => s.surf === 'main');
  const span = design.main.span;
  const Ltot = mainStrips.reduce((a, s) => a + s.lift, 0);
  const spanLoad = mainStrips.map((s) => ({ y: s.yb, lp: s.lift / s.ds, ell: (4 * Ltot / (Math.PI * span)) * Math.sqrt(Math.max(0, 1 - (2 * s.yb / span) ** 2)), cl: s.cl }));
  return {
    foiling: true, cond, V: r.V, Vkn: toKn(r.V), vmg: toKn(r.V * Math.cos(c.twa * DEG)),
    heel: c.heel, z0: T.z0, depth: -T.z0, flap: r.df, elev: r.de, beta: r.beta, sailorX: r.xs, sailorY: r.ys,
    sailCL: r.sailCL, sailCD: r.sail.CD, awa: awaDeg, aws: toKn(r.sail.aws), rollLimited: r.rollLimited, limit: r.limit,
    sheetDeg: Math.max(2, Math.min(60, awaDeg * 0.55 - 2)), sailCamber: 0.04 + 0.07 * Math.min(1, r.sailCL / 1.2), sailTwist: 6 + 14 * (1 - Math.min(1, r.sailCL / 1.2)),
    wandPsi: psi,
    drag: h.drag, windage: -r.sail.windage[0], sailDrive: r.sail.sail[0],
    lift: { main: h.S.main.F[2], elev: h.S.elev.F[2], W: model.W, sailZ: r.sail.sail[2] },
    side: { mstrut: h.S.mstrut.F[1], rstrut: h.S.rstrut.F[1], main: h.S.main.F[1], elev: h.S.elev.F[1] },
    cavMin: h.cavMin, ventMax: h.ventMax, tipClear: h.tipClear, stallMax: h.stallMax,
    strips: h.strips.map((s) => ({ surf: s.surf, yb: s.yb, eta: s.eta, cl: s.cl, cd: s.cd, cp: s.cp, cav: s.cav, stall: s.stall, depth: s.depth, re: s.re })),
    spanLoad, forces, segments: { data, n: k },
  };
}

export function evaluate(design, target) { return evaluateDesign(design, target); }

export function polars(design) {
  const model = new MothModel(design);
  const out = {};
  for (const [k, band] of Object.entries(WIND_BANDS)) {
    const twas = [36, 42, 48, 55, 65, 80, 95, 110, 125, 140, 152, 165];
    out[k] = twas.map((twa) => {
      const heel = twa < 90 ? band.heelUp : band.heelDown;
      const cond = { tws: band.tws * KNOT, twa, heel };
      const r = model.speedAt(cond) || model.displacementSpeed(cond);
      return { twa, kn: toKn(r.V), foiling: !!r.foiling };
    });
  }
  return out;
}

export function flightSim(design, opts) {
  const V = (opts.speedKn ?? 14) * KNOT;
  const M = buildFlightModel(design, V, { gearing: opts.gearing });
  const sea = makeSea({ hs: opts.hs ?? 0.25, tp: opts.tp ?? 2.6, heading: opts.heading ?? 180, seed: opts.seed ?? 3 });
  const res = simulate(M, { T: opts.T ?? 16, sea, perturb: opts.perturb ?? 0.05 });
  const st = linearStability(M);
  return { ...res, stability: { stable: st.stable, minZeta: st.minZeta, freqHz: st.freqHz, roots: st.roots }, derivs: { Lm_a: M.Lm_a, Le_de: M.Le_de, Lm_df: M.Lm_df, kdw: M.kdw, xcg: M.xcg } };
}

/** Gearing sweep for the control-system chart. */
export function gearingSweep(design, speedKn = 14, hs = 0.25) {
  const out = [];
  for (const g of [0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4]) {
    const M = buildFlightModel(design, speedKn * KNOT, { gearing: g });
    const st = linearStability(M);
    const sim = simulate(M, { T: 12, sea: makeSea({ hs, tp: 2.6, heading: 180, seed: 3 }) });
    out.push({ g, zeta: st.minZeta, stable: st.stable, rms: sim.metrics.rmsRide, pitch: sim.metrics.rmsPitchDeg, touch: sim.metrics.touchdowns });
  }
  return out;
}

/** 2-D section polar for the section panel (cl, cd, -Cp_min vs alpha, at flap angle). */
export function sectionPolar(sec, re, flapDeg = 0, flapFrac = 0.3) {
  const p = sectionProps(sec);
  const out = [];
  const dcl = liftSlope2D(sec.tc) * flapTau(flapFrac) * flapEta(flapDeg * DEG) * flapDeg * DEG;
  for (let a = -6; a <= 14; a += 0.5) {
    const cl = Math.max(p.clmin + 0.5 * Math.min(0, dcl), Math.min(p.clmax + 0.5 * Math.max(0, dcl), p.a0 * (a * DEG - p.alpha0) + dcl));
    out.push({ a, cl, cd: sectionCd({ ...sec, flapped: flapFrac > 0 }, cl, re, dcl, flapDeg * DEG), cp: -sectionCpMin(sec, cl, dcl, flapDeg * DEG) });
  }
  return out;
}

export function designSummary(design) {
  const m = planformStats(design.main), e = planformStats(design.elevator);
  const st = structuralCheck(design, 2.0);
  return { main: m, elev: e, ratio: e.area / m.area, structure: st, tipChord: chordAt(design.main, 1) };
}

export const API = { conditionDetail, evaluate, polars, flightSim, gearingSweep, sectionPolar, designSummary };
