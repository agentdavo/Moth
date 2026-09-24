// Study (a): bulb shape at fixed keel mass.
// Sweeps fineness L/D 4–12 x cross-section aspect w/h 1.0–2.0 x four nose/tail variants; reports the VMG change
// per wind band against the baseline bulb and splits it into stability, bulb hydrodynamics and the rest.
// usage: node tools/iom-bulb-study.mjs [--quick]   -> docs/results/iom/bulb-study.json
import fs from 'node:fs';
import { DEFAULT_DESIGN } from '../src/iom/physics/design.js';
import { makeReference } from '../src/iom/physics/objective.js';
import { VARIANTS, bulbVariantDesign, evaluateBulb } from '../src/iom/physics/bulbStudy.js';

const quick = process.argv.includes('--quick');
const base = DEFAULT_DESIGN;
const t0 = Date.now();
const ref = makeReference(base, 7);
console.log('baseline rigs per band', ref.rigs.join(' '), 'VMG up', ref.up.map((v) => v.toFixed(3)).join(' '), 'down', ref.down.map((v) => v.toFixed(3)).join(' '));
const FIN = quick ? [4, 6, 8, 10, 12] : [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ASP = quick ? [1.0, 1.5, 2.0] : [1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
const results = [];
for (const variant of Object.keys(VARIANTS)) {
  for (const fineness of FIN) {
    for (const aspect of ASP) {
      const decompose = variant === 'standard';
      const d = bulbVariantDesign(base, fineness, aspect, variant);
      const r = evaluateBulb(base, d, ref, { n: 7, decompose });
      results.push({ variant, fineness, aspect, ...r });
    }
  }
  console.log(`variant ${variant} done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const fmt = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}`;
console.log('\nMean ΔVMG % over the four bands (standard variant) — rows L/D, columns w/h');
console.log('L/D  ' + ASP.map((a) => a.toFixed(1).padStart(7)).join(''));
for (const f of FIN) console.log(String(f).padEnd(5) + ASP.map((a) => { const r = results.find((x) => x.variant === 'standard' && x.fineness === f && x.aspect === a); const m = r.bands.reduce((s, b) => s + b.dMean, 0) / r.bands.length; return fmt(m).padStart(7); }).join(''));
for (const [i, tws] of base.env.bands.entries()) {
  const std = results.filter((x) => x.variant === 'standard');
  const best = std.reduce((a, b) => (b.bands[i].dMean > a.bands[i].dMean ? b : a));
  const r1 = std.find((x) => x.fineness === 6 && x.aspect === 1.0), r2 = std.find((x) => x.fineness === 10 && x.aspect === 1.0);
  console.log(`\n${tws} kn (${ref.rigs[i]}): best L/D ${best.fineness} w/h ${best.aspect} ${fmt(best.bands[i].dMean)} %  [up ${fmt(best.bands[i].dUp)} down ${fmt(best.bands[i].dDown)}]`);
  for (const r of [r1, r2, best]) console.log(`   L/D ${r.fineness} w/h ${r.aspect}: total ${fmt(r.bands[i].dMean)}  stability ${fmt(r.bands[i].stab)}  bulb hydro ${fmt(r.bands[i].bulbHydro)}  rest ${fmt(r.bands[i].rest)}`);
}
console.log('\nVariants at L/D 10, w/h 1.0 (mean ΔVMG %):');
for (const v of Object.keys(VARIANTS)) { const r = results.find((x) => x.variant === v && x.fineness === 10 && x.aspect === 1.0); if (r) console.log(`   ${VARIANTS[v].label.padEnd(32)} ${r.bands.map((b) => fmt(b.dMean)).join(' ')}  h ${(r.geom.h * 1000).toFixed(1)} mm  S ${(r.geom.S * 1e4).toFixed(0)} cm2  Dsep(0.5) ${(r.drag[0].Dsep * 1000).toFixed(1)} mN`); }
fs.mkdirSync('docs/results/iom', { recursive: true });
fs.writeFileSync('docs/results/iom/bulb-study.json', JSON.stringify({ generated: new Date().toISOString(), base: { bulb: base.bulb, keelMass: base.keel.mass }, ref: { rigs: ref.rigs, up: ref.up, down: ref.down }, bands: base.env.bands, fineness: FIN, aspect: ASP, variants: VARIANTS, results }, null, 0));
console.log(`\nwrote docs/results/iom/bulb-study.json in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
