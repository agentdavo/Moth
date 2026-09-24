// Optimisation variables, constraints and the VMG objective for the keel/bulb/rudder.
import { DEFAULT_DESIGN, SECTIONS, clone } from './design.js';
import { computeStatics } from './statics.js';
import { checkRules, RULES } from './rules.js';
import { makeContext, vmg, tackExitCl, evaluateBands } from './vpp.js';
import { G } from './constants.js';

// [path, min, max, label, unit scale]
export const VARS = [
  ['bulb.length', 0.22, 0.46, 'bulb length', 1000],
  ['bulb.aspect', 1.0, 2.2, 'bulb width/height', 1],
  ['bulb.xMax', 0.30, 0.55, 'max section at', 100],
  ['bulb.nose', 1.4, 3.5, 'nose fullness', 1],
  ['bulb.tail', 1.2, 3.5, 'tail fullness', 1],
  ['bulb.dx', -0.015, 0.015, 'bulb fwd of level trim', 1000],
  ['fin.rootChord', 0.055, 0.110, 'fin root chord', 1000],
  ['fin.taper', 0.55, 1.0, 'fin taper', 1],
  ['fin.tc', 0.06, 0.12, 'fin t/c', 100],
  ['fin.section', 0, 2.999, 'fin section', 1],
  ['fin.fillet', 0, 0.012, 'fillet radius', 1000],
  ['rudder.scale', 0.85, 1.3, 'rudder area scale', 1],
  ['rudder.tc', 0.06, 0.12, 'rudder t/c', 100],
];

/** Apply a unit-cube vector to a template design. */
export function decode(x, template = DEFAULT_DESIGN) {
  const d = clone(template);
  const v = {};
  VARS.forEach(([p, lo, hi], i) => { v[p] = lo + (hi - lo) * Math.min(1, Math.max(0, x[i])); });
  Object.assign(d.bulb, { length: v['bulb.length'], aspect: v['bulb.aspect'], xMax: v['bulb.xMax'], nose: v['bulb.nose'], tail: v['bulb.tail'] });
  d.fin.rootChord = v['fin.rootChord'];
  d.fin.tipChord = v['fin.rootChord'] * v['fin.taper'];
  d.fin.tc = v['fin.tc'];
  d.fin.section = SECTIONS[Math.floor(v['fin.section'])];
  d.fin.fillet = v['fin.fillet'];
  const k = Math.sqrt(v['rudder.scale']);
  d.rudder.span = template.rudder.span * k;
  d.rudder.rootChord = template.rudder.rootChord * k;
  d.rudder.tipChord = template.rudder.tipChord * k;
  d.rudder.tc = v['rudder.tc'];
  // fore-aft: offset relative to the level-trim position
  d.bulb.xOffset = null;
  const lvl = computeStatics(d, 'A').xOffsetLevel;
  d.bulb.xOffset = lvl + v['bulb.dx'];
  return d;
}

/** Inverse of decode for a design (approximate for the rudder scale). */
export function encode(d, template = DEFAULT_DESIGN) {
  const lvl = computeStatics({ ...d, bulb: { ...d.bulb, xOffset: null } }, 'A').xOffsetLevel;
  const val = {
    'bulb.length': d.bulb.length, 'bulb.aspect': d.bulb.aspect, 'bulb.xMax': d.bulb.xMax, 'bulb.nose': d.bulb.nose, 'bulb.tail': d.bulb.tail,
    'bulb.dx': (d.bulb.xOffset ?? lvl) - lvl,
    'fin.rootChord': d.fin.rootChord, 'fin.taper': d.fin.tipChord / d.fin.rootChord, 'fin.tc': d.fin.tc,
    'fin.section': SECTIONS.indexOf(d.fin.section) + 0.5, 'fin.fillet': d.fin.fillet,
    'rudder.scale': (d.rudder.span * (d.rudder.rootChord + d.rudder.tipChord)) / (template.rudder.span * (template.rudder.rootChord + template.rudder.tipChord)),
    'rudder.tc': d.rudder.tc,
  };
  return VARS.map(([p, lo, hi]) => Math.min(1, Math.max(0, (val[p] - lo) / (hi - lo))));
}

export const MIN_RUDDER_AREA = 0.0085; // m^2: current practice (~200 x 45–55 mm); the steady VPP cannot value manoeuvring

/** Constraint violations (0 = satisfied) and descriptions. */
export function constraints(d, s, bandResults = []) {
  const v = [];
  const push = (name, amount) => { if (amount > 0) v.push({ name, amount }); };
  push('bulb taller than 60 mm (E.4.1)', (s.bulb.h - RULES.keelLowZone) / 0.005);
  push('rudder heavier than 75 g (C.6.4)', (s.mass.rudder - RULES.rudderMassMax) / 0.005);
  push('draft outside 370–420 mm (C.4.1)', (Math.max(s.draft - RULES.draftMax, RULES.draftMin - s.draft) - 1e-6) / 0.002);
  push('fin tip deflection > 6 mm at 40°', (s.fin.deflection - 0.006) / 0.002);
  push('fin span < 250 mm', (0.25 - s.fin.span) / 0.01);
  push('rudder area < 85 cm²', (MIN_RUDDER_AREA - s.rudder.S) / 0.001);
  for (const b of bandResults) {
    const te = tackExitCl(b, s, d);
    push(`fin stalls on tack exit (${b.tws} kn)`, (te.cl - te.clmax) / 0.05);
    push(`rudder c_l > 0.45 for balance (${b.tws} kn)`, (Math.abs(b.up.clR) - 0.45) / 0.05);
  }
  return v;
}

/**
 * Score a design: weighted mean over bands of 0.5 (VMGup/ref + VMGdown/ref), with fixed rigs per band.
 * ref: {rigs:[..], up:[..], down:[..]} from the baseline. Returns score (1 = baseline) and details.
 */
export function scoreDesign(d, ref, { weights = null, n = 7 } = {}) {
  const w = weights || d.env.weights;
  const bands = [];
  let num = 0, den = 0;
  const statics = {};
  d.env.bands.forEach((tws, i) => {
    if (!(w[i] > 0)) { bands.push(null); return; }
    const rig = ref.rigs[i];
    statics[rig] = statics[rig] || computeStatics(d, rig);
    const ctx = makeContext(d, rig, tws, statics[rig]);
    const r = vmg(ctx, n);
    const b = { tws, rig, ...r };
    bands.push(b);
    num += w[i] * 0.5 * (r.up.vmg / ref.up[i] + r.down.vmg / ref.down[i]);
    den += w[i];
  });
  const sA = statics.A || computeStatics(d, 'A');
  const viol = constraints(d, sA, bands.filter(Boolean));
  const pen = viol.reduce((s, c) => s + c.amount, 0);
  const raw = num / den;
  return {
    score: raw - 0.05 * pen - (pen > 0 ? 0.01 : 0), raw, viol, bands,
    rm30: sA.RM(30), zG: sA.zG, bulbH: sA.bulb.h, wetApp: sA.fin.wet + sA.bulb.S + sA.rudder.wet,
    bulbS: sA.bulb.S, fineness: sA.bulb.fineness,
  };
}

/** Baseline reference: rig per band (auto) and VMGs. */
export function makeReference(d, n = 7) {
  const ev = evaluateBands(d, { rigMode: 'auto', n });
  return { rigs: ev.bands.map((b) => b.rig), up: ev.bands.map((b) => b.up.vmg), down: ev.bands.map((b) => b.down.vmg), bands: ev.bands };
}

export { G };
