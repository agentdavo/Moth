// Bulb-shape study at fixed keel mass: fineness x cross-section aspect x nose/tail variants,
// with the VMG change split into (i) stability (VCG/GM), (ii) bulb hydrodynamics (drag + end-plate),
// (iii) the rest (fin span/area change and interactions).
import { clone } from './design.js';
import { computeStatics } from './statics.js';
import { bulbShapeIntegrals } from './geometry.js';
import { makeContext, vmg } from './vpp.js';
import { bulbDrag } from './resistance.js';
import { RHO_LEAD } from './constants.js';

export const VARIANTS = {
  standard: { label: 'ellipse nose, parabolic tail', nose: 2.0, tail: 2.0, xMax: 0.42 },
  bluntFine: { label: 'blunt nose, fine tail', nose: 2.8, tail: 1.6, xMax: 0.38 },
  laminar: { label: 'laminar-style (max at 50 %)', nose: 2.2, tail: 1.5, xMax: 0.50 },
  fullTail: { label: 'fine nose, full tail', nose: 1.6, tail: 2.8, xMax: 0.46 },
};

/** Bulb length that gives a target fineness L/D (D = sqrt(w h)) for the design's bulb mass. */
export function lengthForFineness(d, fineness) {
  const s = computeStatics(d, 'A');
  const V = s.bulb.mass / RHO_LEAD;
  const { I2 } = bulbShapeIntegrals(d.bulb);
  return Math.pow(fineness * Math.sqrt(4 * V / (Math.PI * I2)), 2 / 3);
}

export function bulbVariantDesign(base, fineness, aspect, variant) {
  const d = clone(base);
  Object.assign(d.bulb, VARIANTS[variant] ? { nose: VARIANTS[variant].nose, tail: VARIANTS[variant].tail, xMax: VARIANTS[variant].xMax } : {}, { aspect, xOffset: null });
  d.bulb.length = lengthForFineness(d, fineness);
  return d;
}

function vmgWith(d, rig, tws, s, n) {
  const r = vmg(makeContext(d, rig, tws, s), n);
  return { up: r.up.vmg, down: r.down.vmg, upV: r.up.V, downV: r.down.V, heel: r.up.heel };
}

/**
 * Evaluate one bulb design against the baseline for each band (rigs fixed per band).
 * ref: {rigs, up, down} baseline VMGs.
 */
export function evaluateBulb(base, d, ref, { n = 7, decompose = true } = {}) {
  const out = { bands: [] };
  const sA = computeStatics(d, 'A');
  out.geom = { L: sA.bulb.L, h: sA.bulb.h, w: sA.bulb.w, S: sA.bulb.S, fineness: sA.bulb.fineness, zG: sA.zG, GM: sA.GM, rm30: sA.RM(30), finSpan: sA.fin.span, finS: sA.fin.S };
  out.drag = [0.5, 1.0].map((V) => { const b = bulbDrag(V, sA, d); return { V, D: b.D, Df: b.Df, Dsep: b.Dsep, xtr: b.xtr }; });
  d.env.bands.forEach((tws, i) => {
    const rig = ref.rigs[i];
    const sB = computeStatics(base, rig), sN = computeStatics(d, rig);
    const full = vmgWith(d, rig, tws, sN, n);
    const rel = (r) => 0.5 * (r.up / ref.up[i] + r.down / ref.down[i]) - 1;
    const row = { tws, rig, up: full.up, down: full.down, dUp: full.up / ref.up[i] - 1, dDown: full.down / ref.down[i] - 1, dMean: rel(full) };
    if (decompose) {
      // stability only: baseline hydrodynamics with the new GM
      const sStab = { ...sB, GM: sN.GM, zG: sN.zG, GZ: sN.GZ, RM: sN.RM };
      const stab = vmgWith(base, rig, tws, sStab, n);
      // bulb hydrodynamics only: baseline stability and fin, new bulb geometry and shape
      const dB = clone(base); dB.bulb = { ...d.bulb };
      const sHyd = { ...sB, bulb: sN.bulb };
      const hyd = vmgWith(dB, rig, tws, sHyd, n);
      row.stab = rel(stab); row.bulbHydro = rel(hyd); row.rest = row.dMean - row.stab - row.bulbHydro;
      row.stabUp = stab.up / ref.up[i] - 1; row.hydroUp = hyd.up / ref.up[i] - 1;
      row.stabDown = stab.down / ref.down[i] - 1; row.hydroDown = hyd.down / ref.down[i] - 1;
    }
    out.bands.push(row);
  });
  return out;
}
