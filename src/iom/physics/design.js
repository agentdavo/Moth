// IOM design description, defaults and parameter metadata.
// Lengths in metres, masses in kg, angles in degrees unless noted.
//
// Baseline = a typical modern IOM as a home builder would make it (docs/research/IOM_RESEARCH.md §2):
// LWL ~0.99 m, BWL ~0.175 m (Bantock 2009: 170–190 mm waterline beam on current designs),
// hull shell + deck + fittings 650 g, radio ~280 g (Wallin 2003 weight budget: 1147 g hull group incl. 120 g correctors),
// rig ~310 g each, keel at the 2500 g maximum, bulb L/D ~9 (Bantock: L/D ~10 has been the norm since 1998).

export const SECTIONS = ['sd8020', 'naca4', 'naca6'];
export const SECTION_LABELS = {
  sd8020: 'SD8020-type (low-Re, measured)',
  naca4: 'NACA 00xx',
  naca6: 'NACA 63-0xx (laminar)',
};

export const DEFAULT_DESIGN = {
  name: 'Baseline DIY IOM',
  hull: {
    loa: 1.000, lwl: 0.990, bwl: 0.175, bmax: 0.215,
    cp: 0.56,          // prismatic coefficient
    cm: 0.70,          // midship section coefficient
    cwp: 0.70,         // waterplane coefficient
    lcb: 0.535,        // LCB, fraction of LWL from the bow
    freeboard: 0.060,
    mass: 0.650,       // shell + deck + fittings (kg)
    massZ: 0.020,      // its CG above the waterline (m)
    radio: 0.280,      // servos + battery + receiver (kg)
    radioZ: 0.005,
    finX: 0.530,       // fin quarter-chord, fraction of LWL from the bow
    formFactor: 1.08,  // 1+k on hull friction
  },
  keel: {
    mass: 2.500,       // fin + bulb (C.6.4 max 2.5 kg); the bulb takes what the fin does not
    draft: 0.420,      // total draft (C.4.1 max)
  },
  fin: {
    rootChord: 0.076, tipChord: 0.068, tc: 0.075, section: 'sd8020',
    sweep: 0,          // quarter-chord sweep, deg (aft positive)
    density: 1450,     // carbon/epoxy laminate with a light core strip, kg/m^3
    modulus: 70e9,     // effective bending modulus (UD-rich carbon), Pa
    fillet: 0.004,     // root/tip fillet radius, m
  },
  bulb: {
    length: 0.300,
    aspect: 1.0,       // cross-section width / height (1 = round, >1 = flattened)
    xMax: 0.42,        // position of the maximum section, fraction of bulb length
    nose: 2.0,         // nose fullness exponent (1 = cone, 2 = ellipse, 3 = blunt)
    tail: 2.0,         // tail fullness exponent (1 = cone, 2 = parabolic, 3 = full)
    xOffset: null,     // bulb CG ahead (+) / aft (-) of the fin quarter-chord, m; null = float level
  },
  rudder: {
    span: 0.200, rootChord: 0.058, tipChord: 0.042, tc: 0.09, section: 'sd8020',
    density: 1600, stock: 0.012, // kg, stock + tiller
    xFromFin: 0.40,    // distance aft of the fin quarter-chord, m
  },
  rig: {
    mass: 0.310,       // each rig; C.7.3 allows correctors to equalise (Wallin 2003: 312–314 g)
    lead: 0.02,        // CE ahead of the fin quarter-chord at zero heel (m)
    choice: 'auto',    // 'auto' | 'A' | 'B' | 'C'
  },
  env: {
    zRef: 1.5,         // height of the reference (quoted) wind above the water, m
    bands: [4, 8, 12, 16],   // TWS at zRef, knots
    weights: [1, 1, 1, 1],
    maxHeel: 40,       // deg; above this the skipper depowers (rudder starts to ventilate)
    maxTrim: 3.5,      // deg bow-down from the sail pitching moment; above this the bow buries (nosedive)
  },
  model: {
    hullTransitionRe: 2.0e5,  // Re_x at transition on the hull
    bulbTransitionRe: 3.5e5,  // Re_x limit for natural transition on the bulb
    residuary: 'orc',         // 'orc' | 'delft' | 'orc+9'
    heelResistance: 0.15,     // fractional Rr rise at 30 deg heel
    sepK: null,               // bulb separation-drag constant; null = calibrated default
  },
};

export const clone = (o) => JSON.parse(JSON.stringify(o));

export function mergeDesign(base, patch) {
  const d = clone(base);
  for (const k of Object.keys(patch || {})) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) d[k] = { ...d[k], ...patch[k] };
    else d[k] = patch[k];
  }
  return d;
}

/**
 * UI and optimiser metadata: [group, key, label, min, max, step, unit, scale]
 * scale converts SI to the displayed unit (e.g. 1000 for mm).
 */
export const PARAMS = [
  ['hull', 'lwl', 'LWL', 0.90, 1.00, 0.005, 'mm', 1000],
  ['hull', 'bwl', 'Waterline beam', 0.13, 0.22, 0.005, 'mm', 1000],
  ['hull', 'cp', 'Prismatic Cp', 0.52, 0.62, 0.005, '', 1],
  ['hull', 'mass', 'Hull + deck + fittings', 0.40, 1.00, 0.01, 'g', 1000],
  ['hull', 'radio', 'Radio + battery', 0.15, 0.40, 0.01, 'g', 1000],
  ['keel', 'mass', 'Keel mass (fin+bulb)', 2.2, 2.5, 0.01, 'g', 1000],
  ['keel', 'draft', 'Draft', 0.37, 0.42, 0.002, 'mm', 1000],
  ['bulb', 'length', 'Bulb length', 0.20, 0.46, 0.005, 'mm', 1000],
  ['bulb', 'aspect', 'Bulb width/height', 1.0, 2.2, 0.05, '', 1],
  ['bulb', 'xMax', 'Max section at', 0.30, 0.55, 0.01, '% L', 100],
  ['bulb', 'nose', 'Nose fullness', 1.4, 3.5, 0.05, '', 1],
  ['bulb', 'tail', 'Tail fullness', 1.2, 3.5, 0.05, '', 1],
  ['bulb', 'xOffset', 'Bulb CG fwd of fin', -0.04, 0.06, 0.002, 'mm', 1000],
  ['fin', 'rootChord', 'Fin root chord', 0.055, 0.110, 0.001, 'mm', 1000],
  ['fin', 'tipChord', 'Fin tip chord', 0.040, 0.110, 0.001, 'mm', 1000],
  ['fin', 'tc', 'Fin t/c', 0.06, 0.13, 0.002, '%', 100],
  ['fin', 'sweep', 'Fin sweep', -5, 12, 0.5, '°', 1],
  ['fin', 'fillet', 'Fillet radius', 0, 0.012, 0.001, 'mm', 1000],
  ['rudder', 'span', 'Rudder span', 0.14, 0.26, 0.005, 'mm', 1000],
  ['rudder', 'rootChord', 'Rudder root chord', 0.040, 0.075, 0.001, 'mm', 1000],
  ['rudder', 'tipChord', 'Rudder tip chord', 0.025, 0.070, 0.001, 'mm', 1000],
  ['rudder', 'tc', 'Rudder t/c', 0.06, 0.13, 0.002, '%', 100],
  ['rig', 'lead', 'CE lead of fin', -0.03, 0.08, 0.002, 'mm', 1000],
  ['env', 'maxHeel', 'Max heel before depower', 25, 55, 1, '°', 1],
];
