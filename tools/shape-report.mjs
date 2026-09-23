// Markdown summary of docs/results/shape-tournament.json (+ chimera vs plain optimum).
import fs from 'node:fs';
import { SHAPES } from '../src/physics/shapes.js';
const T = JSON.parse(fs.readFileSync('docs/results/shape-tournament.json'));
const bands = ['light', 'medium', 'strong'];
const f3 = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
console.log(`| Family | Nature | Δ light | Δ medium | Δ strong | take-off kn (M) | notes (medium optimum) |`);
console.log('|---|---|---|---|---|---|---|');
const rows = Object.entries(T.shapes).filter(([k]) => k !== 'baseline').map(([k, v]) => ({ k, v, mean: bands.reduce((a, b) => a + (v[b]?.delta ?? 0), 0) / 3 }));
rows.sort((a, b) => b.mean - a.mean);
for (const { k, v } of rows) {
  const m = v.medium;
  const vars = (m?.vars || []).filter((p) => !['main.span', 'main.rootChord', 'main.incidence', 'main.flapFrac', 'main.tcRoot', 'boat.flapMax'].includes(p));
  const pv = vars.map((p) => { const [a, b] = p.split('.'); const x = m.design[a][b]; return `${b}=${Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(1)}`; }).join(', ');
  const pen = Object.keys(m?.r?.penalties || {}).join('/');
  console.log(`| ${SHAPES[k].label} | ${SHAPES[k].nature} | ${f3(v.light?.delta ?? 0)} | ${f3(v.medium?.delta ?? 0)} | ${f3(v.strong?.delta ?? 0)} | ${m?.r?.takeoffKn?.toFixed(1)} | ${pv}${pen ? ` · pen: ${pen}` : ''} |`);
}
const B = T.shapes.baseline;
console.log(`\nBaseline re-optimised scores: light ${B.light.score.toFixed(3)}, medium ${B.medium.score.toFixed(3)}, strong ${B.strong.score.toFixed(3)}`);
for (const b of bands) {
  const c = `docs/results/chimera-${b}.json`, o = `docs/results/opt-${b}.json`;
  if (fs.existsSync(c) && fs.existsSync(o)) {
    const C = JSON.parse(fs.readFileSync(c)), O = JSON.parse(fs.readFileSync(o));
    const v = C.vars;
    const pick = ['main.dihedralInner', 'main.dihedral', 'main.crescent', 'main.crescentStart', 'main.wingletHeight', 'main.wingletCant', 'main.riblet', 'main.tubercleAmp'].filter((p) => v[p]).map((p) => `${p.split('.')[1]}=${(+v[p].best).toFixed(3)}`).join(', ');
    console.log(`Chimera ${b}: ${C.best.score.toFixed(4)} vs plain optimum ${O.best.score.toFixed(4)} (Δ ${f3(C.best.score - O.best.score)}) — ${pick}`);
  }
}
