// Computes Moth model polars off the main thread (MothModel from src/physics/vpp.js).
import { MothModel } from '../physics/vpp.js';
import { PRESETS } from '../physics/design.js';
import { mothPolarTable } from './model.js';

const models = {};
self.onmessage = (e) => {
  const { id, tws, preset = 'medium' } = e.data;
  try {
    const t0 = performance.now();
    const m = models[preset] || (models[preset] = new MothModel(PRESETS[preset] || PRESETS.medium));
    const table = mothPolarTable(m, tws);
    self.postMessage({ id, ok: true, table, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
