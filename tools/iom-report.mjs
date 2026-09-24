// Tables for docs/IOM_LAB.md from the result files, plus an attribution of each optimum's gain to its bulb,
// fin and rudder changes (each applied alone to the baseline).
// usage: node tools/iom-report.mjs  -> docs/results/iom/report.md (+ attribution.json)
import fs from 'node:fs';
import { DEFAULT_DESIGN, clone } from '../src/iom/physics/design.js';
import { makeReference, scoreDesign } from '../src/iom/physics/objective.js';
import { computeStatics } from '../src/iom/physics/statics.js';

const R = (n) => JSON.parse(fs.readFileSync(`docs/results/iom/${n}.json`, 'utf8'));
const pct = (x, d = 2) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)} %`;
const out = [];
const base = DEFAULT_DESIGN;
const ref = makeReference(base, 9);

// baseline table
const val = R('validation');
out.push('### Baseline table\n');
for (const b of val.speeds) out.push(`| ${b.tws} kn | ${b.rig} | ${b.up.V.toFixed(2)} @ ${b.up.twa.toFixed(0)}° | ${b.up.vmg.toFixed(3)} | ${b.up.heel.toFixed(0)}° / ${b.up.leeway.toFixed(1)}° | ${b.down.V.toFixed(2)} @ ${b.down.twa.toFixed(0)}° | ${b.down.vmg.toFixed(3)} |`);

// optimum table + attribution
const targets = ['all', '4', '8', '12', '16'];
const attrib = {};
out.push('\n### Optima\n');
out.push('| | Baseline | ' + targets.map((t) => (t === 'all' ? '**All-round**' : `${t} kn`)).join(' | ') + ' |');
out.push('|---|---|' + targets.map(() => '---').join('|') + '|');
const designs = { base, ...Object.fromEntries(targets.map((t) => [t, R(`opt-${t}`).best.design])) };
const S = Object.fromEntries(Object.entries(designs).map(([k, d]) => [k, computeStatics(d, 'A')]));
const row = (label, f) => out.push(`| ${label} | ${f('base')} | ${targets.map((t) => f(t)).join(' | ')} |`);
const mm = (x) => (x * 1000).toFixed(0);
row('Bulb length (mm)', (k) => mm(designs[k].bulb.length));
row('Bulb h × w (mm)', (k) => `${(S[k].bulb.h * 1000).toFixed(1)} × ${(S[k].bulb.w * 1000).toFixed(1)}`);
row('Fineness L/D', (k) => S[k].bulb.fineness.toFixed(1));
row('Max section at', (k) => `${(designs[k].bulb.xMax * 100).toFixed(0)} %`);
row('Nose / tail fullness', (k) => `${designs[k].bulb.nose.toFixed(2)} / ${designs[k].bulb.tail.toFixed(2)}`);
row('Bulb CG vs level trim (mm, + fwd)', (k) => (k === 'base' ? '0' : ((S[k].xOffset - S[k].xOffsetLevel) * 1000).toFixed(1)));
row('Bulb mass (g) / wetted (cm²)', (k) => `${(S[k].bulb.mass * 1000).toFixed(0)} / ${(S[k].bulb.S * 1e4).toFixed(0)}`);
row('Fin root → tip chord (mm)', (k) => `${mm(designs[k].fin.rootChord)} → ${mm(designs[k].fin.tipChord)}`);
row('Fin t/c, section', (k) => `${(designs[k].fin.tc * 100).toFixed(1)} %, ${designs[k].fin.section}`);
row('Fin span (mm) / area (cm²) / mass (g)', (k) => `${mm(S[k].fin.span)} / ${(S[k].fin.S * 1e4).toFixed(0)} / ${(S[k].fin.mass * 1000).toFixed(0)}`);
row('Fillet radius (mm)', (k) => (designs[k].fin.fillet * 1000).toFixed(1));
row('Rudder span × root/tip (mm)', (k) => `${mm(designs[k].rudder.span)} × ${mm(designs[k].rudder.rootChord)}/${mm(designs[k].rudder.tipChord)}`);
row('Rudder area (cm²), t/c', (k) => `${(S[k].rudder.S * 1e4).toFixed(0)}, ${(designs[k].rudder.tc * 100).toFixed(1)} %`);
row('VCG (mm below WL) / GZ40 (mm)', (k) => `${(-S[k].zG * 1000).toFixed(1)} / ${(S[k].gz40 * 1000).toFixed(1)}`);
const bandsRow = (t) => { const sc = scoreDesign(designs[t], ref, { weights: [1, 1, 1, 1], n: 9 }); return sc; };
const scs = Object.fromEntries(Object.keys(designs).map((k) => [k, bandsRow(k)]));
DEFAULT_DESIGN.env.bands.forEach((tws, i) => row(`ΔVMG up / down ${tws} kn`, (k) => `${pct(scs[k].bands[i].up.vmg / ref.up[i] - 1, 1)} / ${pct(scs[k].bands[i].down.vmg / ref.down[i] - 1, 1)}`));
row('**Mean ΔVMG, 4 bands**', (k) => `**${pct(scs[k].raw - 1)}**`);
row('Constraint violations (all bands)', (k) => (scs[k].viol.length ? scs[k].viol.map((v) => v.name).join('; ') : 'none'));

out.push('\n### Attribution (each part of the optimum applied alone to the baseline; mean ΔVMG over 4 bands)\n');
out.push('| Optimum | bulb shape only (level trim) | bulb fore-aft (trim) only | fin only | rudder only | all together |');
out.push('|---|---|---|---|---|---|');
for (const t of targets) {
  const o = designs[t];
  const sc = (d) => scoreDesign(d, ref, { weights: [1, 1, 1, 1], n: 9 }).raw - 1;
  const mk = (parts) => { const d = clone(base); for (const p of parts) d[p] = clone(o[p]); d.bulb.xOffset = null; return sc(d); };
  const dTrim = clone(base); dTrim.bulb.xOffset = computeStatics(base, 'A').xOffsetLevel + (S[t].xOffset - S[t].xOffsetLevel);
  const a = { shape: mk(['bulb']), trim: sc(dTrim), fin: mk(['fin']), rudder: mk(['rudder']), all: scs[t].raw - 1 };
  attrib[t] = a;
  out.push(`| ${t === 'all' ? 'all-round' : `${t} kn`} | ${pct(a.shape)} | ${pct(a.trim)} | ${pct(a.fin)} | ${pct(a.rudder)} | ${pct(a.all)} |`);
}

// multi-seed spread
out.push('\n### Seeds\n');
for (const t of targets) { const r = R(`opt-${t}`); out.push(`* ${t}: ${r.runs.map((x) => `seed ${x.seed} ${pct(x.gain)}`).join(', ')}`); }

// sensitivity
try {
  const sens = R('sensitivity');
  out.push('\n### Sensitivity\n');
  out.push('| Input | rigs | VMG up 4/8/12/16 (m/s) | L/D 10 vs 6 (mean of up/down, per band) | w/h 1.6 vs 1.0 | laminar tail vs standard | optimum gain (re-evaluated) | re-optimised |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const s of sens.rows) out.push(`| ${s.label} | ${s.rigs.join('')} | ${s.up.map((v) => v.toFixed(3)).join(' / ')} | ${s.slimVsFat.map((v) => pct(v, 2)).join(' ')} | ${s.flatVsRound.map((v) => pct(v, 2)).join(' ')} | ${s.laminarVsStd.map((v) => pct(v, 2)).join(' ')} | ${s.optGain !== undefined ? pct(s.optGain) : '–'}${s.optViol?.length ? ' (violates)' : ''} | ${s.reopt ? pct(s.reopt.gain) : ''} |`);
  const ro = sens.rows.filter((s) => s.reopt);
  if (ro.length) {
    out.push('\nRe-optimised variables (20 generations):\n');
    for (const s of ro) out.push(`* ${s.label}: ${s.reopt.vars.map((v) => `${v.name} ${v.value}`).join(', ')}`);
  }
} catch { out.push('\n(no sensitivity.json yet)'); }

fs.writeFileSync('docs/results/iom/report.md', out.join('\n') + '\n');
fs.writeFileSync('docs/results/iom/attribution.json', JSON.stringify(attrib, null, 1));
console.log(out.join('\n'));
