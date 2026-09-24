// Study (b): CMA-ES optimisation of bulb, fin and rudder per wind band and all-round, multi-seed.
// usage: node tools/iom-optimise.mjs [gens=30] [lambda=12] [seeds=3] [targets=4,8,12,16,all] [gensAll=2*gens]
//   single-band runs first; the all-round run's first seed starts from the best single-band optimum
//   -> docs/results/iom/opt-<target>.json and docs/results/iom/opt-summary.json
import fs from 'node:fs';
import { DEFAULT_DESIGN } from '../src/iom/physics/design.js';
import { makeReference, scoreDesign, constraints, decode } from '../src/iom/physics/objective.js';
import { runCMA } from '../src/iom/physics/optimise.js';
import { computeStatics } from '../src/iom/physics/statics.js';
import { evaluateBands, tackExitCl } from '../src/iom/physics/vpp.js';

const [gens = 30, lambda = 12, seeds = 3] = process.argv.slice(2, 5).map(Number);
const targets = (process.argv[5] || '4,8,12,16,all').split(',');
const gensAll = Number(process.argv[6] || 2 * gens);
const bandBest = []; // best x of each single-band run: candidate starts for the all-round run
const base = DEFAULT_DESIGN;
const ref = makeReference(base, 7);
const bandsKn = base.env.bands;
console.log('baseline rigs', ref.rigs.join(' '), 'up', ref.up.map((v) => v.toFixed(3)).join(' '), 'down', ref.down.map((v) => v.toFixed(3)).join(' '));
fs.mkdirSync('docs/results/iom', { recursive: true });
const summary = { baseline: summarize(base), targets: {} };

function summarize(d) {
  const s = computeStatics(d, 'A');
  const ev = evaluateBands(d, { rigMode: ref.rigs, n: 9 });
  return {
    bulb: { length: d.bulb.length, aspect: d.bulb.aspect, xMax: d.bulb.xMax, nose: d.bulb.nose, tail: d.bulb.tail, xOffset: s.xOffset, xOffsetLevel: s.xOffsetLevel, h: s.bulb.h, w: s.bulb.w, fineness: s.bulb.fineness, S: s.bulb.S, mass: s.bulb.mass },
    fin: { rootChord: d.fin.rootChord, tipChord: d.fin.tipChord, tc: d.fin.tc, section: d.fin.section, fillet: d.fin.fillet, span: s.fin.span, area: s.fin.S, mass: s.fin.mass, deflection: s.fin.deflection },
    rudder: { span: d.rudder.span, rootChord: d.rudder.rootChord, tipChord: d.rudder.tipChord, tc: d.rudder.tc, area: s.rudder.S, mass: s.mass.rudder },
    stability: { zG: s.zG, GM: s.GM, gz40: s.gz40, rm30: s.RM(30) },
    bands: ev.bands.map((b, i) => ({ tws: b.tws, rig: b.rig, up: b.up.vmg, down: b.down.vmg, upV: b.up.V, upTwa: b.up.twa, downV: b.down.V, downTwa: b.down.twa, heel: b.up.heel, leeway: b.up.leeway, rudder: b.up.rudder, clF: b.up.clF, dUp: b.up.vmg / ref.up[i] - 1, dDown: b.down.vmg / ref.down[i] - 1, tackExit: tackExitCl(b, s, d) })),
    violations: constraints(d, s, ev.bands),
  };
}

for (const t of targets) {
  const weights = t === 'all' ? [1, 1, 1, 1] : bandsKn.map((b) => (String(b) === t ? 1 : 0));
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = Date.now();
    let x0 = null;
    if (t === 'all' && seed === 1 && bandBest.length) {
      // warm start: the single-band optimum that scores best all-round
      const cands = bandBest.map((x) => ({ x, s: scoreDesign(decode(x, base), ref, { weights, n: 9 }).score }));
      x0 = cands.sort((a, b) => b.s - a.s)[0].x;
    }
    const r = runCMA({ template: base, ref, weights, gens: t === 'all' ? gensAll : gens, lambda, seed, n: 9, x0, sigma: x0 ? 0.12 : 0.25 });
    if (t !== 'all') bandBest.push(r.best.x);
    const sc = scoreDesign(r.design, ref, { weights, n: 9 });
    console.log(`target ${t} seed ${seed}: score ${sc.raw.toFixed(4)} (+${((sc.raw - 1) * 100).toFixed(2)} %) viol ${sc.viol.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    runs.push({ seed, raw: sc.raw, score: sc.score, design: r.design, vars: r.vars, hist: r.hist, front: r.front, cloud: r.cloud });
  }
  runs.sort((a, b) => b.score - a.score);
  const best = runs[0];
  const sum = summarize(best.design);
  summary.targets[t] = { weights, gain: best.raw - 1, seeds: runs.map((r) => ({ seed: r.seed, gain: r.raw - 1, vars: r.vars.map((v) => ({ name: v.name, value: v.value * v.scale })) })), best: sum };
  fs.writeFileSync(`docs/results/iom/opt-${t}.json`, JSON.stringify({ target: t, weights, ref, best: { design: best.design, summary: sum, vars: best.vars }, runs: runs.map((r) => ({ seed: r.seed, gain: r.raw - 1, vars: r.vars, hist: r.hist })), front: best.front, cloud: best.cloud.filter((_, i) => i % 2 === 0) }, null, 0));
  const v = best.vars.map((x) => `${x.name} ${typeof x.value === 'number' ? (x.value * x.scale).toFixed(x.scale > 1 ? 1 : 2) : x.value}`).join(', ');
  console.log(`  best ${t}: +${((best.raw - 1) * 100).toFixed(2)} %  ${v}`);
  console.log(`  per band ΔVMG up/down %: ${sum.bands.map((b) => `${b.tws}kn ${(b.dUp * 100).toFixed(2)}/${(b.dDown * 100).toFixed(2)}`).join('  ')}`);
}
fs.writeFileSync('docs/results/iom/opt-summary.json', JSON.stringify(summary, null, 1));
console.log('wrote docs/results/iom/opt-summary.json');
