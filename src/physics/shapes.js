// Nature-inspired (and a few engineered) planform families for the horizontal foils.
// Each entry sets the generalised planform parameters on a design (main foil and, where
// noted, the elevator) and lists the family's own variables for the shape tournament.
import { planformStats } from './geometry.js';

export const SHAPE_KEYS = ['dihedralInner', 'crescent', 'crescentStart', 'wingletHeight', 'wingletCant', 'wingletTaper', 'wingletSweep',
  'feathers', 'featherStart', 'featherSpread', 'featherFan', 'featherChord', 'featherLength', 'tubercleAmp', 'tubercleWave', 'riblet'];

export const SHAPES = {
  baseline: {
    label: 'Baseline (optimised planform)', nature: '—',
    note: 'Tapered, part-elliptic planform from the CMA-ES studies.',
    main: {}, vars: [],
  },
  tuna: {
    label: 'Tuna / swordfish lunate', nature: 'Thunniform caudal fin, swift wing',
    note: 'Crescent planform: pointed tips swept strongly aft, near-elliptic chord. Theory predicts no induced-drag gain in a flat wake, but the aft-swept tips unload and add bend–twist wash-out.',
    main: { ellipticity: 0.9, taper: 0.3, crescent: 32, crescentStart: 0.5 },
    vars: [['main.crescent', 5, 45], ['main.crescentStart', 0.3, 0.85], ['main.ellipticity', 0.5, 1.0]],
  },
  swift: {
    label: 'Raked tips (swift / albatross primaries)', nature: 'Swift, 787-style raked tip',
    note: 'Only the outer 20–30% of the span is raked aft; the inner wing is unswept.',
    main: { crescent: 25, crescentStart: 0.72 },
    vars: [['main.crescent', 5, 45], ['main.crescentStart', 0.55, 0.9]],
  },
  albatross: {
    label: 'Albatross (very high AR)', nature: 'Wandering albatross, AR ~15-18',
    note: 'Long, slender span at the same area: less induced drag, lower tip Reynolds number, more bending.',
    main: { span: '+18%', taper: 0.45, ellipticity: 0.5 },
    vars: [['main.span', 0.95, 1.2], ['main.rootChord', 0.06, 0.11]],
  },
  gull: {
    label: 'Seagull wing', nature: 'Gull / albatross shoulder-and-elbow',
    note: 'Inner panel with dihedral, outer panel with anhedral: the tips stay deep at windward heel and the strut junction clears the surface.',
    main: { dihedralInner: 6, dihedral: -14, dihedralStart: 0.45 },
    vars: [['main.dihedralInner', 0, 14], ['main.dihedral', -25, 0], ['main.dihedralStart', 0.25, 0.75]],
  },
  humpback: {
    label: 'Humpback tubercles', nature: 'Humpback whale flipper',
    note: 'Sinusoidal leading edge. At Moth Reynolds numbers (Johari 2007) tubercles lower lift slope and CLmax and stall earlier, but replace the abrupt stall with a plateau; troughs cavitate earlier.',
    main: { tubercleAmp: 0.05, tubercleWave: 0.3 },
    vars: [['main.tubercleAmp', 0.01, 0.12], ['main.tubercleWave', 0.15, 0.6]],
  },
  raptor: {
    label: 'Raptor slotted tips', nature: 'Harris hawk / eagle primaries',
    note: 'The outer span splits into splayed feathers with a dihedral fan, spreading the tip vortex in height (non-planar wake).',
    main: { feathers: 5, featherStart: 0.8, featherSpread: 24, featherFan: 14, featherChord: 0.9, featherLength: 1.1 },
    vars: [['main.feathers', 3, 6.49], ['main.featherStart', 0.65, 0.9], ['main.featherSpread', 5, 45], ['main.featherFan', 0, 25]],
  },
  wingletUp: {
    label: 'Winglet up (anti-vent tip)', nature: 'Bird alula / engineered',
    note: 'Up-turned tips (Maguire-style anti-ventilation tips): extra effective span, but the tip rises towards the surface at heel.',
    main: { wingletHeight: 0.06, wingletCant: 75, wingletTaper: 0.5, wingletSweep: 30 },
    vars: [['main.wingletHeight', 0.02, 0.12], ['main.wingletCant', 20, 90]],
  },
  wingletDown: {
    label: 'Winglet down (keel-winglet style)', nature: 'Engineered (Australia II keel)',
    note: 'Down-turned tips keep the tip vortex deep and away from the free surface.',
    main: { wingletHeight: 0.06, wingletCant: -75, wingletTaper: 0.5, wingletSweep: 30 },
    vars: [['main.wingletHeight', 0.02, 0.12], ['main.wingletCant', -90, -20]],
  },
  dolphin: {
    label: 'Dolphin fluke', nature: 'Cetacean fluke',
    note: 'Swept crescent with moderate AR (~6-8 in dolphins); strongly swept leading edge sheds weed and delays tip stall.',
    main: { sweep: 22, crescent: 18, crescentStart: 0.5, taper: 0.3, ellipticity: 0.4 },
    vars: [['main.sweep', 5, 35], ['main.crescent', 0, 35]],
  },
  manta: {
    label: 'Manta ray', nature: 'Manta pectoral fin',
    note: 'Low aspect ratio, strongly swept: robust and stiff, but high induced drag at Moth lift coefficients.',
    main: { span: '-12%', sweep: 28, taper: 0.25, ellipticity: 0.2 },
    vars: [['main.sweep', 15, 40], ['main.span', 0.7, 0.95]],
  },
  sharkskin: {
    label: 'Shark-skin riblets', nature: 'Shark dermal denticles',
    note: 'Streamwise micro-grooves (film) on the turbulent part of foils and struts: up to ~8% less turbulent friction when the spacing suits the speed (s+ ≈ 15-17); worse beyond s+ ≈ 30. ~28 µm suits 4-18 m/s.',
    main: { riblet: 28 }, struts: { riblet: 28 },
    vars: [['main.riblet', 10, 80]],
  },
  chimera: {
    label: 'Chimera (optimiser-combined)', nature: 'All of the above',
    note: 'CMA-ES free to combine gull dihedral, crescent tips, winglets (either way), riblets and tubercles on top of the planform variables.',
    main: {}, vars: [], noApply: true,
  },
  forward: {
    label: 'Forward-swept (dragonfly hind wing)', nature: 'Some insects and bats',
    note: 'Forward sweep loads the root and stalls inboard first, but is aeroelastically divergent — a useful negative control.',
    main: { sweep: -8 },
    vars: [['main.sweep', -15, 0]],
  },
};

/** Apply a family to a design (returns a new design). Relative span changes keep the area. */
export function applyShape(design, key, keepAreaFrom = design) {
  const d = JSON.parse(JSON.stringify(design));
  const shp = SHAPES[key];
  if (shp?.noApply) return d;
  for (const k of SHAPE_KEYS) { delete d.main[k]; delete d.elevator[k]; }
  delete d.mainStrut.riblet; delete d.rudderStrut.riblet;
  if (!shp) return d;
  const area0 = planformStats(keepAreaFrom.main).area;
  for (const [k, v] of Object.entries(shp.main || {})) {
    if (typeof v === 'string' && v.endsWith('%')) d.main[k] = d.main[k] * (1 + parseFloat(v) / 100);
    else d.main[k] = v;
  }
  if (shp.struts) { Object.assign(d.mainStrut, shp.struts); Object.assign(d.rudderStrut, shp.struts); }
  if (shp.main && ('span' in shp.main || 'taper' in shp.main || 'ellipticity' in shp.main)) {
    // hold the main-foil area constant so the comparison is about shape, not size
    for (let i = 0; i < 3; i++) d.main.rootChord *= area0 / planformStats(d.main).area;
  }
  d.shape = key;
  d.name = `${design.name?.replace(/ · .*$/, '') || 'Design'} · ${shp.label}`;
  return d;
}
