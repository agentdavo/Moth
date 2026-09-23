// Runs the physics off the main thread so the WebGPU view stays smooth.
import { API } from '../physics/api.js';
import { evaluateDesign } from '../physics/objective.js';
import { decode } from '../physics/design.js';

self.onmessage = (ev) => {
  const { id, fn, args } = ev.data;
  try {
    let result;
    if (fn === 'evalVector') {
      // optimiser: decode a unit-cube vector into a design and score it
      const [x, template, target] = args;
      const d = decode(x, template);
      const r = evaluateDesign(d, target, { skipMinTWS: false });
      result = { score: r.score, raw: r.rawScore, bands: r.bands, penalties: r.penalties, takeoffKn: r.takeoffKn, minTWSkn: r.minTWSkn, main: r.main, elev: r.elev };
    } else {
      result = API[fn](...args);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e && e.stack || e) });
  }
};
