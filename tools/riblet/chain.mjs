// Riblet claim, step by step through the boat model: which surfaces the gain comes from, how it
// depends on the film efficiency and the riblet spacing, and what it is worth in VMG per wind band.
// Usage: node tools/riblet/chain.mjs [out.json]
import fs from 'node:fs';
import { MothModel } from '../../src/physics/vpp.js';
import { WIND_BANDS } from '../../src/physics/design.js';
import { OPTIMISED } from '../../src/physics/optimised.js';
import { setRibletFilm, ribletFactor } from '../../src/physics/sections.js';
import { cfTurb } from '../../src/physics/sections.js';

const KN = 1852 / 3600;
const NU = 1.19e-6;

function withRiblets(d, s, where = ['main', 'mainStrut', 'rudderStrut']) {
  const x = JSON.parse(JSON.stringify(d));
  for (const k of ['main', 'elevator', 'mainStrut', 'rudderStrut']) delete x[k].riblet;
  for (const k of where) if (s > 0) x[k].riblet = s;
  return x;
}

function run(d) {
  const m = new MothModel(d);
  const ev = m.evaluate(WIND_BANDS, { skipMinTWS: true });
  const out = {};
  for (const [k, b] of Object.entries(ev.bands)) {
    out[k] = {
      up: b.up.vmg / KN, down: b.down.vmg / KN, Vup: b.up.V / KN, Vdown: b.down.V / KN,
      dragUp: b.up.h?.drag, dragDown: b.down.h?.drag, foiling: b.canFoil,
    };
  }
  return out;
}

const pct = (a, b) => 100 * (a / b - 1);
const res = { bands: {}, where: {}, film: {}, spacing: {}, splus: [] };

// s+ that the model sees on a typical main-foil strip (chord ~95 mm) and strut (118 mm), 28 um film
for (const V of [4, 6, 8, 10, 12, 14, 16, 18]) {
  const row = { V, kn: V / KN };
  for (const [name, c] of [['foil', 0.095], ['strut', 0.1176]]) {
    const re = V * c / NU;
    const ut = V * Math.sqrt(cfTurb(re) / 2);
    const sp = 28e-6 * ut / NU;
    row[name] = { re, splus: sp, dCf: 100 * (ribletFactor(sp) - 1) };
  }
  res.splus.push(row);
}

for (const band of Object.keys(OPTIMISED)) {
  const base = OPTIMISED[band];
  const b0 = run(base);
  const r = res.bands[band] = { base: b0[band] };
  // 1. where the gain comes from (28 um, film 0.83)
  for (const [label, where] of [['all', ['main', 'mainStrut', 'rudderStrut']], ['mainFoil', ['main']], ['struts', ['mainStrut', 'rudderStrut']], ['all+elevator', ['main', 'elevator', 'mainStrut', 'rudderStrut']]]) {
    const x = run(withRiblets(base, 28, where))[band];
    (res.where[band] ||= {})[label] = { up: pct(x.up, b0[band].up), down: pct(x.down, b0[band].down), dragUp: x.dragUp, dragDown: x.dragDown };
  }
  // 2. film efficiency relative to ideal blade riblets
  for (const k of [0.4, 0.6, 0.83, 1.0]) {
    setRibletFilm(k);
    const x = run(withRiblets(base, 28))[band];
    (res.film[band] ||= {})[k] = { up: pct(x.up, b0[band].up), down: pct(x.down, b0[band].down) };
  }
  setRibletFilm(0.83);
  // 3. spacing sweep
  for (const s of [10, 20, 28, 40, 60, 80, 100]) {
    const x = run(withRiblets(base, s))[band];
    (res.spacing[band] ||= {})[s] = { up: pct(x.up, b0[band].up), down: pct(x.down, b0[band].down) };
  }
  console.log(band, JSON.stringify(res.where[band].all), JSON.stringify(res.film[band]));
}

fs.writeFileSync(process.argv[2] || 'chain.json', JSON.stringify(res, null, 1));
console.log('\ns+ seen by the model (28 um):');
for (const r of res.splus) console.log(`  ${r.kn.toFixed(1).padStart(5)} kn  foil s+=${r.foil.splus.toFixed(1)} dCf=${r.foil.dCf.toFixed(1)}%   strut s+=${r.strut.splus.toFixed(1)} dCf=${r.strut.dCf.toFixed(1)}%`);
for (const band of Object.keys(OPTIMISED)) {
  const w = res.where[band];
  console.log(`\n${band} (${WIND_BANDS[band].tws} kn): base up ${res.bands[band].base.up.toFixed(2)} kn VMG, down ${res.bands[band].base.down.toFixed(2)} kn`);
  for (const [k, v] of Object.entries(w)) console.log(`  ${k.padEnd(13)} up ${v.up.toFixed(2)}%  down ${v.down.toFixed(2)}%`);
  console.log('  film  ' + Object.entries(res.film[band]).map(([k, v]) => `${k}: ${v.up.toFixed(2)}/${v.down.toFixed(2)}%`).join('  '));
  console.log('  s(um) ' + Object.entries(res.spacing[band]).map(([k, v]) => `${k}: ${v.up.toFixed(2)}/${v.down.toFixed(2)}%`).join('  '));
  const d0 = res.bands[band].base.dragUp, d1 = w.all.dragUp;
  if (d0 && d1) console.log(`  upwind drag (N) base: profile ${d0.profile.toFixed(1)} total ${d0.total.toFixed(1)}  riblets: profile ${d1.profile.toFixed(1)} total ${d1.total.toFixed(1)}`);
}
