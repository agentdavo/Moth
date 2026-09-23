// Shape tournament: every nature-inspired planform family is re-optimised per wind band
// (family variables + common sizing variables) with the same CMA-ES budget as a baseline
// re-optimisation, then compared. Writes docs/results/shape-tournament.json and
// src/physics/shapeResults.js.  usage: node tools/shape-tournament.mjs [gens] [lambda] [shapes...]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const { evaluateDesign } = await import('../src/physics/objective.js');
  const { decode } = await import('../src/physics/design.js');
  parentPort.on('message', ({ id, x, template, vars, target }) => {
    try {
      const r = evaluateDesign(decode(x, template, vars), target);
      parentPort.postMessage({ id, r: { score: r.score, raw: r.rawScore, bands: r.bands, penalties: r.penalties, takeoffKn: r.takeoffKn, minTWSkn: r.minTWSkn, minFlyKn: r.minFlyKn, vmaxKn: r.vmaxKn, cavAtMax: r.cavAtMax, main: r.main, defl: r.structure.main.deflectionRatio, zeta: r.stability.minZeta } });
    } catch (e) { parentPort.postMessage({ id, r: { score: -9, error: String(e) } }); }
  });
} else {
  const args = process.argv.slice(2);
  const gens = +(args[0] || 14), lambda = +(args[1] || 10);
  const SEED = +(process.env.SEED || 5);
  const FILE = process.env.SEED ? `docs/results/shape-tournament-seed${SEED}.json` : 'docs/results/shape-tournament.json';
  const { encode, decode } = await import('../src/physics/design.js');
  const { SepCMAES } = await import('../src/physics/optimizer.js');
  const { SHAPES, applyShape } = await import('../src/physics/shapes.js');
  const { OPTIMISED } = await import('../src/physics/optimised.js');
  const shapes = args.length > 2 ? args.slice(2) : Object.keys(SHAPES).filter((k) => !SHAPES[k].noApply);
  const COMMON = [['main.span', 0.78, 1.25], ['main.rootChord', 0.06, 0.13], ['main.incidence', -1, 3.5], ['main.flapFrac', 0.2, 0.45], ['main.tcRoot', 0.08, 0.15], ['boat.flapMax', 6, 15]];
  const workers = Array.from({ length: os.cpus().length }, () => new Worker(fileURLToPath(import.meta.url)));
  let seq = 0; const cbs = new Map(); const free = [...workers]; const queue = [];
  workers.forEach((w) => w.on('message', ({ id, r }) => { cbs.get(id)(r); cbs.delete(id); }));
  const pump = () => { while (free.length && queue.length) { const w = free.pop(); const j = queue.shift(); const id = ++seq; cbs.set(id, (r) => { free.push(w); j.res(r); pump(); }); w.postMessage({ id, ...j.msg }); } };
  const ev = (msg) => new Promise((res) => { queue.push({ msg, res }); pump(); });
  const out = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { shapes: {} };
  out.gens = gens; out.lambda = lambda; out.bandOrder = ['light', 'medium', 'strong'];
  const t0 = Date.now();
  for (const key of shapes) {
    out.shapes[key] = out.shapes[key] || {};
    for (const band of ['light', 'medium', 'strong']) {
      const template = applyShape(OPTIMISED[band], key);
      const famVars = SHAPES[key].vars;
      const vars = [...COMMON.filter(([p]) => !famVars.some(([q]) => q === p)), ...famVars];
      const x0 = encode(template, vars).map((v) => Math.min(0.97, Math.max(0.03, Number.isFinite(v) ? v : 0.5)));
      const start = await ev({ x: x0, template, vars, target: band });
      const es = new SepCMAES(x0, { sigma: 0.15, lambda, seed: SEED });
      let best = { r: start, x: x0 };
      for (let g = 0; g < gens; g++) {
        const pop = es.ask();
        const rs = await Promise.all(pop.map((p) => ev({ x: p.x, template, vars, target: band })));
        es.tell(pop, rs.map((r) => (Number.isFinite(r.score) ? r.score : -9)));
        rs.forEach((r, i) => { if (r.score > best.r.score) best = { r, x: pop[i].x }; });
      }
      const design = decode(best.x, template, vars);
      out.shapes[key][band] = { start: start.score, score: best.r.score, raw: best.r.raw, r: best.r, design, vars: vars.map(([p]) => p) };
      console.log(`${key.padEnd(12)} ${band.padEnd(7)} start ${start.score.toFixed(4)} -> ${best.r.score.toFixed(4)}  pen ${JSON.stringify(best.r.penalties)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
    }
  }
  // deltas vs baseline
  if (out.shapes.baseline) for (const [k, v] of Object.entries(out.shapes)) for (const b of out.bandOrder) if (v[b] && out.shapes.baseline[b]) v[b].delta = v[b].score - out.shapes.baseline[b].score;
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
  const slim = { bandOrder: out.bandOrder, gens, lambda, shapes: {} };
  for (const [k, v] of Object.entries(out.shapes)) {
    slim.shapes[k] = {};
    for (const b of out.bandOrder) if (v[b]) slim.shapes[k][b] = { delta: v[b].delta ?? 0, score: v[b].score, design: v[b].design, takeoffKn: v[b].r.takeoffKn, minTWSkn: v[b].r.minTWSkn, bands: v[b].r.bands, penalties: v[b].r.penalties };
  }
  if (!process.env.SEED) fs.writeFileSync('src/physics/shapeResults.js', `// Generated by tools/shape-tournament.mjs\nexport const SHAPE_RESULTS = ${JSON.stringify(slim)};\n`);
  workers.forEach((w) => w.terminate());
}
