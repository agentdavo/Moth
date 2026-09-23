// Design evaluation + scalar objective used by the optimiser and the UI.
import { MothModel } from './vpp.js';
import { WIND_BANDS } from './design.js';
import { structuralCheck } from './structure.js';
import { planformStats } from './geometry.js';
import { toKn, KNOT, DEG, RHO_WATER } from './constants.js';
import { buildFlightModel, linearStability } from './dynamics.js';
import { chordAt, tcAt } from './geometry.js';

// Reference VMGs (kn) used to normalise band scores: ~ published fleet speeds.
export const REF_VMG = {
  light: { up: 6.5, down: 7.5 },
  medium: { up: 9.5, down: 14 },
  strong: { up: 11.5, down: 21 },
};

export const TARGETS = {
  light: { light: 1, medium: 0.25, strong: 0 },
  medium: { light: 0.25, medium: 1, strong: 0.25 },
  strong: { light: 0, medium: 0.25, strong: 1 },
  allround: { light: 1, medium: 1, strong: 1 },
};

/** Torsional divergence speed (m/s) of a cantilever half-wing, AC at 25% c, elastic axis at ~38% c. */
export function divergenceSpeed(f, Gmod = 12e9) {
  const b2 = f.span / 2;
  const c = chordAt(f, 0.4), t = c * tcAt(f, 0.4);
  const GJ = Gmod * 0.14 * c * t ** 3;
  const e = 0.13, a0 = 5.8;
  const qD = (Math.PI / (2 * b2)) ** 2 * GJ / (c * c * e * a0);
  // aft sweep adds bend-twist wash-out -> raises divergence speed (approximate)
  const sweepGain = 1 + 0.06 * Math.max(0, f.sweep || 0);
  return Math.sqrt(2 * qD * sweepGain / RHO_WATER);
}

/**
 * Evaluate a design. Returns metrics + score for a target ('light'|'medium'|'strong'|'allround').
 */
export function evaluateDesign(design, target = 'allround', opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const model = new MothModel(design);
  const ev = model.evaluate(WIND_BANDS, { skipMinTWS: opts.skipMinTWS });
  const main = planformStats(design.main), elev = planformStats(design.elevator);
  const st = structuralCheck(design, 2.0);
  const vdiv = divergenceSpeed(design.main);
  // cavitation / ventilation at the fastest condition
  let vmax = 0, cavAtMax = 9, ventMax = 0, tipClear = 9, stall = 0;
  for (const b of Object.values(ev.bands)) {
    for (const r of [b.up, b.down]) {
      if (!r.foiling || !r.h) continue;
      if (r.V > vmax) { vmax = r.V; cavAtMax = r.h.cavMin; }
      ventMax = Math.max(ventMax, r.h.ventMax);
      tipClear = Math.min(tipClear, r.h.tipClear);
      stall = Math.max(stall, r.h.stallMax);
    }
  }
  // pitch/heave stability at a medium-wind cruise speed
  let stab = { minZeta: 0, stable: false, freqHz: 0 };
  try { stab = linearStability(buildFlightModel(design, 7.5)); } catch (e) { /* infeasible trim */ }

  // foiling manoeuvres & lulls: tacks/gybes bleed speed to ~60% of the upwind speed [EST];
  // if that is below the minimum flying speed (flap max, bow-up 3 deg, normal ride height)
  // the boat touches down in every manoeuvre, costing up to ~8% of the band's VMG [EST]
  const vMinFly = model.takeoffSpeed(0, design.boat.rideHeight);
  const bands = {};
  let score = 0, wsum = 0;
  const w = TARGETS[target] || TARGETS.allround;
  for (const [k, b] of Object.entries(ev.bands)) {
    const up = toKn(b.up.vmg), down = toKn(b.down.vmg);
    bands[k] = {
      upV: toKn(b.up.V), upTWA: b.up.twa, upVMG: up, upFoil: b.up.foiling,
      downV: toKn(b.down.V), downTWA: b.down.twa, downVMG: down, downFoil: b.down.foiling,
      upLimit: b.up.limit, downLimit: b.down.limit,
    };
    let s = 0.5 * (up / REF_VMG[k].up + down / REF_VMG[k].down);
    if (b.up.foiling) {
      const vTurn = 0.6 * b.up.V;
      const deficit = isFinite(vMinFly) ? Math.max(0, Math.min(1, (vMinFly - vTurn) / vMinFly * 4)) : 1;
      bands[k].manoeuvre = { vTurnKn: toKn(vTurn), vMinFlyKn: toKn(vMinFly), foilingTacks: deficit === 0 };
      s *= 1 - 0.08 * deficit;
    }
    bands[k].score = s;
    score += w[k] * s; wsum += w[k];
  }
  score /= wsum || 1;
  // penalties (constraints from research section 9.2)
  const pen = {};
  const minTWSkn = isFinite(ev.minTWS) ? toKn(ev.minTWS) : 12;
  if (w.light > 0 && minTWSkn > WIND_BANDS.light.tws) pen.takeoff = 0.05 * (minTWSkn - WIND_BANDS.light.tws) * w.light;
  if (cavAtMax < 0) pen.cavitation = 0.5 * -cavAtMax;
  if (vdiv < 1.3 * vmax) pen.divergence = 0.3 * (1.3 * vmax - vdiv) / vmax;
  if (st.main.deflectionRatio > 0.045) pen.deflection = 3 * (st.main.deflectionRatio - 0.045);
  if (st.main.stressMargin < 0) pen.stress = -st.main.stressMargin * 0.5;
  if (ventMax > 1) pen.ventilation = 0.1 * (ventMax - 1);
  if (tipClear < 0) pen.tipClearance = 2 * -tipClear;
  if (!stab.stable) pen.stability = 0.1; else if (stab.minZeta < 0.15) pen.stability = 0.3 * (0.15 - stab.minZeta);
  // tip Reynolds number at take-off >= 1.5e5 (laminar separation / tip stall), elevator >= 1.2e5
  const vto = ev.takeoffV || 5;
  const reTip = vto * chordAt(design.main, 0.95) / 1.19e-6, reTipE = vto * chordAt(design.elevator, 0.95) / 1.19e-6;
  if (reTip < 1.5e5) pen.tipRe = 0.4 * (1 - reTip / 1.5e5);
  if (reTipE < 1.2e5) pen.tipRe = (pen.tipRe || 0) + 0.3 * (1 - reTipE / 1.2e5);
  // strut lateral stiffness: <= 100 mm tip deflection at the design side load [EST]
  if (st.strut.tipDeflection > 0.10) pen.strut = 2 * (st.strut.tipDeflection - 0.10);
  const AR = main.AR;
  if (AR > 17) pen.aspect = 0.05 * (AR - 17);
  const ratio = elev.area / main.area;
  // pitch authority: modern elevators run S_r/S_m ~ 0.40-0.47 (research 4); below 0.35 is penalised
  if (ratio < 0.35) pen.tail = 1.5 * (0.35 - ratio);
  const totalPen = Object.values(pen).reduce((a, b) => a + b, 0);
  const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
  return {
    score: score - totalPen, rawScore: score, penalties: pen, bands,
    takeoffKn: toKn(ev.takeoffV), minTWSkn, minFlyKn: toKn(vMinFly), vmaxKn: toKn(vmax), cavAtMax, ventMax, tipClear, stallMax: stall,
    divergenceKn: toKn(vdiv), structure: st, stability: stab, reTip, reTipE,
    main: { area: main.area, AR: main.AR, mass: main.mass }, elev: { area: elev.area, AR: elev.AR },
    evals: model.evals, ms: t1 - t0,
  };
}

export { KNOT, DEG };
