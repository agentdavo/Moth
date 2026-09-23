// Central-difference sensitivity of band VMGs to every design variable (±8% of range).
// usage: node tools/sensitivity.mjs <preset|opt-light|opt-medium|opt-strong>
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const { evaluateDesign } = await import('../src/physics/objective.js');
  const { decode } = await import('../src/physics/design.js');
  parentPort.on('message', ({ id, x, template }) => {
    const r = evaluateDesign(decode(x, template), 'allround');
    parentPort.postMessage({ id, r: { bands: r.bands, minTWSkn: r.minTWSkn, takeoffKn: r.takeoffKn } });
  });
} else {
  const name = process.argv[2] || 'medium';
  const { PRESETS, encode, DESIGN_VARS } = await import('../src/physics/design.js');
  const template = name.startsWith('opt-') ? JSON.parse(fs.readFileSync(`docs/results/${name}.json`)).design : JSON.parse(JSON.stringify(PRESETS[name]));
  const workers = Array.from({ length: os.cpus().length }, () => new Worker(fileURLToPath(import.meta.url)));
  let seq = 0; const cbs = new Map(); const free = [...workers]; const queue = [];
  workers.forEach((w) => w.on('message', ({ id, r }) => { cbs.get(id)(r); cbs.delete(id); }));
  const pump = () => { while (free.length && queue.length) { const w = free.pop(); const j = queue.shift(); const id = ++seq; cbs.set(id, (r) => { free.push(w); j.res(r); pump(); }); w.postMessage({ id, x: j.x, template }); } };
  const ev = (x) => new Promise((res) => { queue.push({ x, res }); pump(); });
  const x0 = encode(template).map((v) => Math.min(0.97, Math.max(0.03, v)));
  const step = 0.08;
  const mean = (r, k) => 0.5 * (r.bands[k].upVMG + r.bands[k].downVMG);
  const base = await ev(x0);
  const rows = await Promise.all(DESIGN_VARS.map(async ([p, lo, hi], i) => {
    const [rp, rm] = await Promise.all([1, -1].map((s) => { const x = x0.slice(); x[i] = Math.min(1, Math.max(0, x[i] + s * step)); return ev(x); }));
    const d = {};
    for (const k of ['light', 'medium', 'strong']) d[k] = (mean(rp, k) - mean(rm, k)) / 2;
    return { p, step: step * (hi - lo), d, minTWS: (rp.minTWSkn - rm.minTWSkn) / 2 };
  }));
  fs.writeFileSync(`docs/results/sensitivity-${name}.json`, JSON.stringify({ name, base, rows }, null, 1));
  workers.forEach((w) => w.terminate());
  console.log(`| variable | +step | ΔVMG light | ΔVMG medium | ΔVMG strong | Δ min foiling TWS |`);
  console.log('|---|---|---|---|---|---|');
  for (const r of rows.sort((a, b) => Math.max(...Object.values(b.d).map(Math.abs)) - Math.max(...Object.values(a.d).map(Math.abs)))) {
    const f = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    console.log(`| ${r.p} | ${r.step.toPrecision(2)} | ${f(r.d.light)} | ${f(r.d.medium)} | ${f(r.d.strong)} | ${f(r.minTWS)} |`);
  }
}
