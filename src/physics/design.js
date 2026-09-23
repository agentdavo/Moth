// Design description, presets for the three wind bands, and optimiser bounds.
// Dimensions are in metres / degrees / kg. See docs/DESIGN_DECISIONS.md and
// docs/research/MOTH_FOIL_RESEARCH.md for where the numbers come from.

export const baseBoat = {
  hullMass: 33,          // all-up boat incl. rig, wings, foils (kg)          [research 2.1]
  sailorMass: 75,        // kg
  sailArea: 8.25,        // class limit, m^2
  sailCLmax: 1.30,       // peak of the North Sails FLOW polar (scales the table)
  sailCD0: 0.020,        // sail parasitic drag (polar fit)
  sailK: 0.115,          // sail lift-dependent drag factor (polar fit, incl. twist/depower losses)
  ceAboveDeck: 2.10,     // m
  deckAboveKeel: 0.30,   // hull bottom -> wing bar height
  windageCdA: 0.48,      // hull + wings + sailor, m^2 (modern 0.45-0.65, 2009 measured 0.58-0.75)
  rideHeight: 0.75,      // hull bottom above water at main strut (wand set point), m
  sailorZ: 0.35,         // sailor CG above wing bar when hiking, m
  hikeMax: 1.35,         // max lateral sailor CG offset, m
  sailorXmin: -0.95, sailorXmax: 0.45,  // fore-aft range relative to main strut, m
  boatX: -0.10,          // boat CG x relative to main foil (m, +fwd)
  boatZ: 0.45,           // boat CG above keel, m
  wandX: 1.45,           // wand pivot x ahead of main foil (bow), m
  wandLength: 1.30,
  wandGearing: 0.25,     // flap deg per wand deg
  flapMin: -7, flapMax: 10,
  elevMin: -3, elevMax: 4, // twist-grip rake range about the design incidence
  elevLoadTarget: 0.03,  // sailor trims fore/aft to keep the elevator lightly loaded
  takeoffPitch: 3.0,     // bow-up attitude at take-off, deg
  finish: 1.0,           // laminar-run multiplier (surface finish / fouling)
  junctionFactor: 1.0,   // 1 = plain T, ~0.6 = faired bulb / fillet
};

export const mediumDesign = {
  name: 'Medium (8-14 kn)',
  main: {
    span: 1.00, rootChord: 0.105, taper: 0.40, ellipticity: 0.75, sweep: 5.0, twist: -1.0,
    dihedral: -3, dihedralStart: 0.8, tcRoot: 0.11, tcTip: 0.09, cli: 0.35, family: 'eppler',
    flapFrac: 0.32, flapSpan: 0.90, incidence: 1.5, nHalf: 12,
  },
  elevator: {
    span: 0.70, rootChord: 0.065, taper: 0.46, ellipticity: 0.6, sweep: 4.0, twist: -0.5,
    dihedral: -14, dihedralStart: 0.45, tcRoot: 0.10, tcTip: 0.09, cli: 0.15, family: 'eppler',
    incidence: 1.0, x: -2.30, z: 0.10, nHalf: 7,
  },
  mainStrut: { length: 1.10, chord: 0.105, tc: 0.12, family: 'naca66', nSeg: 7 },
  rudderStrut: { length: 1.10, chord: 0.095, tc: 0.11, family: 'naca66', nSeg: 7 },
  boat: { ...baseBoat },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export const lightDesign = (() => {
  const d = clone(mediumDesign);
  d.name = 'Light (< 8 kn)';
  Object.assign(d.main, { span: 1.10, rootChord: 0.115, taper: 0.39, sweep: 3, twist: -1.5, tcRoot: 0.12, tcTip: 0.10, cli: 0.55, flapFrac: 0.35, incidence: 2.5 });
  Object.assign(d.elevator, { span: 0.78, rootChord: 0.070, dihedral: -12, cli: 0.2 });
  Object.assign(d.mainStrut, { chord: 0.110, tc: 0.125 });
  Object.assign(d.rudderStrut, { chord: 0.100 });
  Object.assign(d.boat, { flapMin: -6, flapMax: 12, rideHeight: 0.70 });
  return d;
})();

export const strongDesign = (() => {
  const d = clone(mediumDesign);
  d.name = 'Strong (15-25 kn)';
  Object.assign(d.main, { span: 0.88, rootChord: 0.097, taper: 0.41, sweep: 8, twist: -1.5, dihedral: -2, dihedralStart: 0.3, tcRoot: 0.10, tcTip: 0.085, cli: 0.2, flapFrac: 0.28, flapSpan: 0.85, incidence: 0.5 });
  Object.assign(d.elevator, { span: 0.63, rootChord: 0.060, dihedral: -16, tcRoot: 0.09, tcTip: 0.085, cli: 0.1 });
  Object.assign(d.mainStrut, { chord: 0.100, tc: 0.12 });
  Object.assign(d.rudderStrut, { chord: 0.092, tc: 0.10 });
  Object.assign(d.boat, { flapMin: -9, flapMax: 7, rideHeight: 0.72 });
  return d;
})();

// 2008 "Vendor 2" daggerboard T-foil measured by Beaver & Zseleczky (2009): validation case
export const bz09Design = (() => {
  const d = clone(mediumDesign);
  d.name = 'BZ09 Vendor-2 (2008)';
  Object.assign(d.main, { span: 0.986, rootChord: 0.129, taper: 0.62, ellipticity: 0.3, sweep: 0, twist: 0, dihedral: 0, tcRoot: 0.126, tcTip: 0.126, cli: 0.4, family: 'naca63', flapFrac: 0.27, flapSpan: 0.8, incidence: 0 });
  Object.assign(d.mainStrut, { chord: 0.118, tc: 0.14, family: 'naca66' });
  return d;
})();

export const PRESETS = { light: lightDesign, medium: mediumDesign, strong: strongDesign };

// Wind bands used by the VPP and the optimiser (research section 9.3). Heel is windward heel (deg).
export const WIND_BANDS = {
  light: { label: 'Light', tws: 7, heelUp: 12, heelDown: 4, color: '#3987e5' },
  medium: { label: 'Medium', tws: 11, heelUp: 17, heelDown: 6, color: '#199e70' },
  strong: { label: 'Strong', tws: 18, heelUp: 20, heelDown: 8, color: '#d95926' },
};

// Optimiser design variables: [path, min, max, integer?]
export const DESIGN_VARS = [
  ['main.span', 0.80, 1.20],
  ['main.rootChord', 0.075, 0.130],
  ['main.taper', 0.25, 0.60],
  ['main.ellipticity', 0.25, 1.0],
  ['main.sweep', -3, 12],
  ['main.twist', -3, 1],
  ['main.dihedral', -8, 5],
  ['main.tcRoot', 0.08, 0.14],
  ['main.tcTip', 0.07, 0.12],
  ['main.cli', 0.05, 0.60],
  ['main.flapFrac', 0.20, 0.45],
  ['main.flapSpan', 0.60, 1.00],
  ['main.incidence', -1.0, 3.5],
  ['elevator.span', 0.55, 0.85],
  ['elevator.rootChord', 0.045, 0.085],
  ['elevator.incidence', -2, 4],
  ['elevator.cli', 0.0, 0.3],
  ['mainStrut.chord', 0.080, 0.130],
  ['mainStrut.tc', 0.09, 0.15],
  ['rudderStrut.chord', 0.075, 0.120],
  ['boat.flapMin', -12, -4],
  ['boat.flapMax', 6, 15],
];

export function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }
export function setPath(obj, path, v) {
  const ks = path.split('.'); const last = ks.pop();
  ks.reduce((o, k) => o[k], obj)[last] = v;
}
export function cloneDesign(d) { return clone(d); }

export function encode(design, vars = DESIGN_VARS) {
  return vars.map(([p, lo, hi]) => (getPath(design, p) - lo) / (hi - lo));
}
export function decode(x, template, vars = DESIGN_VARS) {
  const d = clone(template);
  vars.forEach(([p, lo, hi], i) => setPath(d, p, lo + Math.min(1, Math.max(0, x[i])) * (hi - lo)));
  return d;
}
