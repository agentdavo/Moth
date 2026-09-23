// Offline CMA-ES optimisation of the foil set for one wind-band target, parallel over
// worker threads. Writes docs/results/opt-<target>.json.
// usage: node tools/optimise.mjs <light|medium|strong|allround> [gens] [lambda] [seed]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const { evaluateDesign } = await import('../src/physics/objective.js');
  const { decode } = await import('../src/physics/design.js');
  parentPort.on('message', ({ id, x, template, target, vars }) => {
    try {
      const r = evaluateDesign(decode(x, template, vars), target);
      parentPort.postMessage({ id, r: { score: r.score, raw: r.rawScore, bands: r.bands, penalties: r.penalties, takeoffKn: r.takeoffKn, minTWSkn: r.minTWSkn, vmaxKn: r.vmaxKn, main: r.main, elev: r.elev, cavAtMax: r.cavAtMax, divergenceKn: r.divergenceKn, zeta: r.stability.minZeta, defl: r.structure.main.deflectionRatio } });
    } catch (e) { parentPort.postMessage({ id, r: { score: -9, error: String(e) } }); }
  });
} else {
  const [target = 'medium', gens = 30, lambda = 12, seed = 11, mode = 'plain'] = process.argv.slice(2).map((v, i) => (i && i < 4 ? +v : v));
  const { PRESETS, encode, decode, DESIGN_VARS: BASE_VARS, getPath } = await import('../src/physics/design.js');
  const { SepCMAES } = await import('../src/physics/optimizer.js');
  const { OPTIMISED } = await import('../src/physics/optimised.js');
  // 'chimera' lets the optimiser combine nature-inspired features freely
  const CHIMERA = [['main.dihedralInner', 0, 14], ['main.crescent', 0, 40], ['main.crescentStart', 0.4, 0.9], ['main.wingletHeight', 0, 0.1], ['main.wingletCant', -90, 90], ['main.riblet', 0, 80], ['main.tubercleAmp', 0, 0.08]];
  const DESIGN_VARS = mode === 'chimera' ? [...BASE_VARS, ...CHIMERA] : BASE_VARS;
  const start = OPTIMISED[target] || PRESETS[target === 'allround' ? 'medium' : target];
  const template = JSON.parse(JSON.stringify(start));
  // chimera starts from the plain optimum + the tournament winner (riblets on foils and struts),
  // with every other feature exactly off so the search can only add what pays
  if (mode === 'chimera') {
    Object.assign(template.main, { dihedralInner: 0, crescent: 0, crescentStart: 0.6, wingletHeight: 0, wingletCant: 0, riblet: 28, tubercleAmp: 0 });
    template.mainStrut.riblet = 28; template.rudderStrut.riblet = 28;
  }
  const n = Math.max(1, os.cpus().length);
  const workers = Array.from({ length: n }, () => new Worker(fileURLToPath(import.meta.url)));
  let seq = 0; const cbs = new Map();
  workers.forEach((w) => w.on('message', ({ id, r }) => { cbs.get(id)(r); cbs.delete(id); }));
  const free = [...workers]; const queue = [];
  const pump = () => { while (free.length && queue.length) { const w = free.pop(); const j = queue.shift(); const id = ++seq; cbs.set(id, (r) => { free.push(w); j.res(r); pump(); }); w.postMessage({ id, x: j.x, template, target, vars: DESIGN_VARS }); } };
  const evalX = (x) => new Promise((res) => { queue.push({ x, res }); pump(); });
  const x0 = encode(template, DESIGN_VARS).map((v) => (mode === 'chimera' ? Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) : Math.min(0.98, Math.max(0.02, Number.isFinite(v) ? v : 0.02))));
  const base = await evalX(x0);
  const es = new SepCMAES(x0, { sigma: mode === 'chimera' ? 0.08 : 0.2, lambda, seed });
  let best = { r: base, x: x0 };
  const hist = [];
  const t0 = Date.now();
  for (let g = 0; g < gens; g++) {
    const pop = es.ask();
    const rs = await Promise.all(pop.map((p) => evalX(p.x)));
    es.tell(pop, rs.map((r) => r.score));
    rs.forEach((r, i) => { if (r.score > best.r.score) best = { r, x: pop[i].x }; });
    hist.push({ g: g + 1, best: best.r.score, mean: rs.reduce((a, r) => a + r.score, 0) / rs.length, sigma: es.sigma });
    console.log(`${target} gen ${g + 1}/${gens} best ${best.r.score.toFixed(4)} (start ${base.score.toFixed(4)}) sigma ${es.sigma.toFixed(3)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const design = decode(best.x, template, DESIGN_VARS);
  design.name = mode === 'chimera' ? `Chimera ${target}` : `Optimised ${target}`;
  fs.mkdirSync('docs/results', { recursive: true });
  const vars = Object.fromEntries(DESIGN_VARS.map(([p]) => [p, { start: getPath(template, p), best: getPath(design, p) }]));
  fs.writeFileSync(`docs/results/${mode === 'chimera' ? 'chimera' : 'opt'}-${target}.json`, JSON.stringify({ target, gens, lambda, seed, evaluations: 1 + gens * lambda, baseline: base, best: best.r, vars, design, hist }, null, 1));
  workers.forEach((w) => w.terminate());
}
