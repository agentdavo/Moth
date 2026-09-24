// IOM physics off the main thread: design evaluation, bulb-shape grid and CMA-ES optimisation.
import { evaluateBands, makeContext, polar, tackExitCl } from '../physics/vpp.js';
import { computeStatics, gzCurve } from '../physics/statics.js';
import { checkRules } from '../physics/rules.js';
import { uprightResistance } from '../physics/resistance.js';
import { constraints, makeReference } from '../physics/objective.js';
import { runCMA } from '../physics/optimise.js';
import { bulbVariantDesign, evaluateBulb } from '../physics/bulbStudy.js';

function staticsSummary(s) {
  const { GZ, RM, rigs, ...rest } = s; // drop functions
  return { ...rest, rigs: Object.fromEntries(Object.entries(rigs).map(([k, r]) => [k, r])), gz: gzCurve(s, 90), rm30: RM(30) };
}

function evaluate(design) {
  const ev = evaluateBands(design, { withPolars: true, n: 9 });
  const sA = ev.statics.A;
  const bands = ev.bands.map((b) => ({ ...b, tackExit: tackExitCl(b, ev.statics[b.rig], design) }));
  const upright = [];
  for (let V = 0.1; V <= 2.001; V += 0.05) upright.push(uprightResistance(V, sA, design));
  return {
    statics: staticsSummary(sA),
    staticsByRig: Object.fromEntries(Object.entries(ev.statics).map(([k, s]) => [k, { zG: s.zG, GM: s.GM, gz40: s.gz40, rm30: s.RM(30), zCE: s.rig.zCE, area: s.rig.area }])),
    rules: checkRules(design, sA),
    constraints: constraints(design, sA, ev.bands),
    bands, upright,
  };
}

self.onmessage = (ev) => {
  const { id, fn, args } = ev.data;
  const post = (msg) => self.postMessage({ id, ...msg });
  try {
    if (fn === 'evaluate') {
      post({ result: evaluate(args[0]) });
    } else if (fn === 'bulbGrid') {
      const [design, variant, fins, asps] = args;
      const ref = makeReference(design, 7);
      const out = [];
      const total = fins.length * asps.length;
      for (const f of fins) for (const a of asps) {
        const d = bulbVariantDesign(design, f, a, variant);
        const r = evaluateBulb(design, d, ref, { n: 7, decompose: false });
        out.push({ fineness: f, aspect: a, variant, bands: r.bands, geom: r.geom });
        post({ progress: out.length / total });
      }
      post({ result: { ref, results: out } });
    } else if (fn === 'optimise') {
      const [opts] = args;
      const ref = makeReference(opts.template, 7);
      const r = runCMA({ ...opts, ref, onGen: (g, best) => post({ progress: g.gen / opts.gens, gen: g, bestRaw: best.raw }) });
      post({ result: { design: r.design, hist: r.hist, front: r.front, cloud: r.cloud, vars: r.vars, ref: { rigs: ref.rigs, up: ref.up, down: ref.down }, bestRaw: r.best.raw, viol: r.best.viol } });
    } else if (fn === 'polar') {
      const [design, rig, tws] = args;
      post({ result: polar(makeContext(design, rig, tws)) });
    } else {
      throw new Error(`unknown fn ${fn}`);
    }
  } catch (e) {
    post({ error: String((e && e.stack) || e) });
  }
};

export { computeStatics };
