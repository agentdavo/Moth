// Study (c): sensitivity of the conclusions to the uncertain model inputs.
// For each input value: baseline VMGs, the bulb-shape conclusions (L/D 6 vs 10, flat vs round, laminar tail) and
// the gain of the all-round optimum (re-evaluated, and optionally re-optimised for the key inputs).
// usage: node tools/iom-sensitivity.mjs [--reopt]  -> docs/results/iom/sensitivity.json
import fs from 'node:fs';
import { DEFAULT_DESIGN, mergeDesign } from '../src/iom/physics/design.js';
import { makeReference, scoreDesign, encode } from '../src/iom/physics/objective.js';
import { bulbVariantDesign, evaluateBulb } from '../src/iom/physics/bulbStudy.js';
import { runCMA } from '../src/iom/physics/optimise.js';

const reopt = process.argv.includes('--reopt');
let optDesign = null;
try { optDesign = JSON.parse(fs.readFileSync('docs/results/iom/opt-all.json', 'utf8')).best.design; } catch { console.log('no opt-all.json yet; optimum gain column skipped'); }

const CASES = [
  ['default', {}],
  ['hull transition Re 1e5', { model: { hullTransitionRe: 1e5 } }],
  ['hull transition Re 5e5', { model: { hullTransitionRe: 5e5 } }],
  ['hull transition Re 1e6', { model: { hullTransitionRe: 1e6 } }],
  ['bulb transition Re 2e5', { model: { bulbTransitionRe: 2e5 } }],
  ['bulb transition Re 1e6', { model: { bulbTransitionRe: 1e6 } }],
  ['residuary ORC +9 %', { model: { residuary: 'orc+9' } }],
  ['residuary own Delft fit', { model: { residuary: 'delft' }, hull: { formFactor: 1.0 } }],
  ['bulb separation off', { model: { sepK: 0 } }],
  ['bulb separation x2', { model: { sepK: 0.08 } }],
  ['heel resistance 0', { model: { heelResistance: 0 } }],
  ['heel resistance 0.3', { model: { heelResistance: 0.3 } }],
  ['max heel 35°', { env: { maxHeel: 35 } }],
  ['max heel 50°', { env: { maxHeel: 50 } }],
  ['nosedive trim 2.5°', { env: { maxTrim: 2.5 } }],
  ['nosedive trim 5°', { env: { maxTrim: 5 } }],
  ['hull 850 g (heavy DIY)', { hull: { mass: 0.85 } }],
];

const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}`;
const mean = (r) => r.bands.reduce((s, b) => s + b.dMean, 0) / r.bands.length;
const rows = [];
const t0 = Date.now();
for (const [label, patch] of CASES) {
  const base = mergeDesign(DEFAULT_DESIGN, patch);
  const ref = makeReference(base, 7);
  const fat = evaluateBulb(base, bulbVariantDesign(base, 6, 1.0, 'standard'), ref, { decompose: false });
  const slim = evaluateBulb(base, bulbVariantDesign(base, 10, 1.0, 'standard'), ref, { decompose: false });
  const flat = evaluateBulb(base, bulbVariantDesign(base, 10, 1.6, 'standard'), ref, { decompose: false });
  const lam = evaluateBulb(base, bulbVariantDesign(base, 10, 1.0, 'laminar'), ref, { decompose: false });
  const row = {
    label, rigs: ref.rigs, up: ref.up, down: ref.down,
    slimVsFat: slim.bands.map((b, i) => (1 + b.dMean) / (1 + fat.bands[i].dMean) - 1),
    flatVsRound: flat.bands.map((b, i) => (1 + b.dMean) / (1 + slim.bands[i].dMean) - 1),
    laminarVsStd: lam.bands.map((b, i) => (1 + b.dMean) / (1 + slim.bands[i].dMean) - 1),
  };
  if (optDesign) {
    const od = mergeDesign(optDesign, patch);
    const sc = scoreDesign(od, ref, { n: 7 });
    row.optGain = sc.raw - 1; row.optViol = sc.viol.map((v) => v.name);
  }
  if (reopt && ['default', 'hull transition Re 1e6', 'residuary own Delft fit', 'bulb separation off', 'max heel 50°'].includes(label)) {
    // warm start from the default all-round optimum: does the optimum move when the input changes?
    const r = runCMA({ template: base, ref, gens: 20, lambda: 10, seed: 1, n: 7, x0: optDesign ? encode(mergeDesign(optDesign, patch), base) : null, sigma: 0.12 });
    row.reopt = { gain: r.best.raw - 1, vars: r.vars.map((v) => ({ name: v.name, value: +(v.value * v.scale).toFixed(3) })) };
  }
  rows.push(row);
  console.log(`${label.padEnd(26)} rigs ${ref.rigs.join('')}  up ${ref.up.map((v) => v.toFixed(3)).join(' ')}  down ${ref.down.map((v) => v.toFixed(2)).join(' ')}`);
  console.log(`${''.padEnd(26)} L/D10 vs 6: ${row.slimVsFat.map(pct).join(' ')} | w/h1.6 vs 1: ${row.flatVsRound.map(pct).join(' ')} | laminar vs std: ${row.laminarVsStd.map(pct).join(' ')}${row.optGain !== undefined ? ` | optimum ${pct(row.optGain)}` : ''}${row.reopt ? ` | re-opt ${pct(row.reopt.gain)}` : ''}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (row.reopt) console.log(`${''.padEnd(26)} re-opt vars: ${row.reopt.vars.map((v) => `${v.name} ${v.value}`).join(', ')}`);
}
fs.writeFileSync('docs/results/iom/sensitivity.json', JSON.stringify({ generated: new Date().toISOString(), bands: DEFAULT_DESIGN.env.bands, rows }, null, 1));
console.log('wrote docs/results/iom/sensitivity.json');
