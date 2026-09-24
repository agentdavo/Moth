// International One Metre class rules that constrain this model.
// Source: IOM Class Rules 2026 (effective 1 March 2026), IOM ICA,
// https://iomclass.org/wp-content/uploads/2026/04/IOM-Class-Rules-2026-Release-2.pdf
// Rule numbers are quoted next to each limit. Sail dimensions (G.3.3, G.4.3) are used in sails.js.

export const RULES = {
  draftMin: 0.370,            // C.4.1 draft, floating in fresh water (m)
  draftMax: 0.420,            // C.4.1
  hullDepthMax: 0.060,        // C.4.1 hull depth (canoe body below the waterline) (m)
  hullLengthMax: 1.000,       // C.4.1 hull length (m)
  massMin: 4.000,             // C.4.2 boat weight dry, excl. wind indicator (kg)
  keelMassMin: 2.200,         // C.6.4 keel excl. fasteners (kg)
  keelMassMax: 2.500,         // C.6.4
  rudderMassMax: 0.075,       // C.6.4 rudder incl. stock (kg)
  keelMaxWidthAbove60: 0.020, // E.4.1 largest transverse dimension except the lowest 60 mm (m)
  keelLowZone: 0.060,         // E.4.1 the bulb therefore has to fit inside the lowest 60 mm
  densityMax: 11340,          // E.3.1 appendage material density <= lead (kg/m^3)
  mastA: 1.600, mastB: 1.180, mastC: 0.880, // F.3.4 lower point to upper point (m)
  mastLowerPointAboveDeck: [0.060, 0.100],  // C.7.4
};

/**
 * Rule and engineering checks for a solved design.
 * @param {object} d  design
 * @param {object} s  statics (from statics.js)
 * @returns {Array<{id,label,ok,value,limit,kind,note}>} kind 'rule' (class rule) or 'eng' (engineering criterion)
 */
export function checkRules(d, s) {
  const out = [];
  const add = (id, label, ok, value, limit, kind = 'rule', note = '') => out.push({ id, label, ok, value, limit, kind, note });
  const mm = (x) => `${(x * 1000).toFixed(0)} mm`;
  add('draft', 'Draft 370–420 mm (C.4.1)', s.draft <= RULES.draftMax + 1e-6 && s.draft >= RULES.draftMin - 1e-6, mm(s.draft), '370–420 mm');
  add('depth', 'Hull depth ≤ 60 mm (C.4.1)', s.hull.Tc <= RULES.hullDepthMax + 1e-6, mm(s.hull.Tc), '≤ 60 mm');
  add('loa', 'Hull length ≤ 1000 mm (C.4.1)', d.hull.loa <= RULES.hullLengthMax + 1e-6, mm(d.hull.loa), '≤ 1000 mm');
  add('mass', 'Boat ≥ 4000 g (C.4.2)', s.mass.total >= RULES.massMin - 1e-6, `${(s.mass.total * 1000).toFixed(0)} g`, '≥ 4000 g', 'rule', s.mass.corrector > 0 ? `${(s.mass.corrector * 1000).toFixed(0)} g of correctors in the hull` : '');
  add('keel', 'Keel 2200–2500 g (C.6.4)', s.mass.keel <= RULES.keelMassMax + 1e-6 && s.mass.keel >= RULES.keelMassMin - 1e-6, `${(s.mass.keel * 1000).toFixed(0)} g`, '2200–2500 g');
  add('rudder', 'Rudder ≤ 75 g (C.6.4)', s.mass.rudder <= RULES.rudderMassMax + 1e-6, `${(s.mass.rudder * 1000).toFixed(0)} g`, '≤ 75 g');
  add('bulbH', 'Bulb within lowest 60 mm (E.4.1)', s.bulb.h <= RULES.keelLowZone + 1e-6, mm(s.bulb.h), '≤ 60 mm tall', 'rule', 'above the lowest 60 mm the keel may be at most 20 mm wide');
  add('finT', 'Fin ≤ 20 mm thick (E.4.1)', s.fin.tMax <= RULES.keelMaxWidthAbove60 + 1e-6, `${(s.fin.tMax * 1000).toFixed(1)} mm`, '≤ 20 mm');
  add('lead', 'Density ≤ lead (E.3.1)', true, '11.34 g/cm³', '≤ 11.34', 'rule', 'model assumes pure lead bulb');
  // engineering criteria (not class rules)
  add('finStiff', 'Fin tip deflection ≤ 6 mm at 40° heel', s.fin.deflection <= 0.006, mm(s.fin.deflection), '≤ 6 mm', 'eng', 'solid laminate cantilever, E from the fin input (70 GPa default)');
  add('span', 'Fin span ≥ 250 mm', s.fin.span >= 0.25, mm(s.fin.span), '≥ 250 mm', 'eng');
  return out;
}
