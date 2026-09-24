// CMA-ES driver shared by the CLI tool and the web worker.
import { SepCMAES, paretoInsert } from '../../physics/optimizer.js';
import { VARS, decode, encode, scoreDesign, makeReference } from './objective.js';
import { DEFAULT_DESIGN } from './design.js';

/**
 * Run sep-CMA-ES. opts: {template, weights, gens, lambda, seed, sigma, n, ref, onGen(genInfo)}.
 * Returns best design, history and the Pareto archive (righting moment vs appendage wetted area).
 */
export function runCMA(opts = {}) {
  const template = opts.template || DEFAULT_DESIGN;
  const ref = opts.ref || makeReference(template, opts.n ?? 7);
  const weights = opts.weights || template.env.weights;
  const es = new SepCMAES(opts.x0 || encode(template, template), { sigma: opts.sigma ?? 0.25, lambda: opts.lambda ?? 12, seed: opts.seed ?? 1 });
  const hist = [];
  let front = [];
  const cloud = [];
  let best = null;
  const gens = opts.gens ?? 30;
  for (let g = 0; g < gens; g++) {
    const pop = es.ask();
    const scores = pop.map((p) => {
      const d = decode(p.x, template);
      const r = scoreDesign(d, ref, { weights, n: opts.n ?? 7 });
      if (r.viol.length === 0) {
        const pt = { rm30: r.rm30, negWet: -r.wetApp, wet: r.wetApp, score: r.raw, x: p.x.slice() };
        front = paretoInsert(front, pt, 'rm30', 'negWet');
        cloud.push({ rm30: r.rm30, wet: r.wetApp, score: r.raw });
      }
      if (!best || r.score > best.score) best = { score: r.score, raw: r.raw, x: p.x.slice(), viol: r.viol, bands: r.bands };
      return r.score;
    });
    const info = es.tell(pop, scores);
    const genInfo = { gen: g + 1, best: best.score, bestRaw: best.raw, mean: scores.reduce((a, b) => a + b, 0) / scores.length, sigma: info.sigma };
    hist.push(genInfo);
    if (opts.onGen) opts.onGen(genInfo, best);
  }
  const design = decode(best.x, template);
  return { best, design, hist, front: front.map(({ rm30, wet, score }) => ({ rm30, wet, score })), cloud, ref, vars: VARS.map((v, i) => ({ name: v[3], path: v[0], value: v[1] + (v[2] - v[1]) * best.x[i], scale: v[4] })) };
}
