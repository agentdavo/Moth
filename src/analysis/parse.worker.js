// Parses a log and builds the analysis track off the main thread; typed arrays are transferred.
import { parseLog } from './parse.js';
import { buildTrack } from './track.js';

self.onmessage = async (e) => {
  const { id, file, text } = e.data;
  try {
    const t0 = performance.now();
    const src = text ?? (await file.text());
    const log = parseLog(src);
    const t1 = performance.now();
    const track = buildTrack(log);
    const transfer = [];
    for (const v of Object.values(track)) if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
    self.postMessage({ id, ok: true, track, rows: log.n, bytes: src.length, parseMs: t1 - t0, buildMs: performance.now() - t1 }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
