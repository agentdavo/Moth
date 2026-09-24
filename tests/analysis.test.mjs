// Tests for the sailing-log analysis modules (src/analysis/*), using the synthetic logs of
// tools/synth-log.mjs (bundled samples in docs/samples + in-memory sessions with known truth).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLog, writeLog, V1_COLUMNS } from '../src/analysis/parse.js';
import { buildTrack } from '../src/analysis/track.js';
import { analyze, defaultSettings } from '../src/analysis/pipeline.js';
import { binPolar } from '../src/analysis/metrics.js';
import { pairedStats, tQuantile, tCDF, pairsForHalfWidth } from '../src/analysis/stats.js';
import { parsePolarJSON } from '../src/analysis/model.js';
import { legsCSV, summaryJSON } from '../src/analysis/export.js';
import { wrap180 } from '../src/analysis/util.js';
import { synthesize, synthText } from '../tools/synth-log.mjs';

const sample = (name) => ({
  text: readFileSync(new URL(`../docs/samples/${name}.csv`, import.meta.url), 'utf8'),
  truth: JSON.parse(readFileSync(new URL(`../docs/samples/${name}.truth.json`, import.meta.url), 'utf8')),
});
const run = (text, tweak = {}) => {
  const track = buildTrack(parseLog(text));
  const s = defaultSettings(track);
  Object.assign(s, tweak);
  return { track, res: analyze(track, s) };
};
function recall(truth, maneuvers, tol = 5) {
  const det = maneuvers.filter((m) => m.type === 'tack' || m.type === 'gybe');
  const used = new Set();
  let hit = 0;
  for (const m of truth) {
    const j = det.findIndex((q, i) => !used.has(i) && q.type === m.type && Math.abs(q.t - m.t) < tol);
    if (j >= 0) { used.add(j); hit++; }
  }
  return { hit, n: truth.length, det: det.length, falsePos: det.length - used.size };
}

test('v1 parser round trip: metadata, trailer, empty fields, exact numbers', () => {
  const n = 5;
  const data = Object.fromEntries(V1_COLUMNS.map((c) => [c, new Float64Array(n).fill(NaN)]));
  for (let i = 0; i < n; i++) {
    data.t_ms[i] = 120020 + 20 * i; data.gnss_new[i] = i % 2; data.lat[i] = 50.8123456 + i * 1e-7; data.lon[i] = -1.3123456;
    data.sog[i] = 1.132; data.cog[i] = 41.2; data.roll[i] = -11.4; data.az[i] = -9.62; data.event[i] = i === 3 ? 2 : 0;
    data.rudder_us[i] = 1512; data.vbat[i] = 5.02;
  }
  data.utc_ms[4] = 1790158502100; // only the last row has GNSS time
  data.sog[2] = NaN; // missing value -> empty field
  const meta = { logger: 'test fw 1.0.0', boat: 'IOM GBR 123', class: 'IOM', rate_hz: 50, rudder_center_us: 1500, rudder_deg_per_us: 0.09, tws_source: 'none' };
  const text = writeLog({ meta, data, n, trailer: { start_utc: '2026-09-24T10:15:02Z' } });
  assert.match(text, /^# format=sail-log v1\n/);
  assert.match(text.split('\n').find((l) => !l.startsWith('#')), /^t_ms,utc_ms,gnss_new/);
  const log = parseLog(text);
  assert.equal(log.format, 'sail-log v1');
  assert.equal(log.n, n);
  assert.deepEqual(log.columns, V1_COLUMNS);
  assert.equal(log.meta.boat, 'IOM GBR 123');
  assert.equal(log.meta.rate_hz, 50);
  assert.equal(log.meta.rudder_deg_per_us, 0.09);
  assert.equal(log.meta.start_utc, '2026-09-24T10:15:02Z', 'trailer metadata is read');
  for (const c of V1_COLUMNS) for (let i = 0; i < n; i++) {
    const want = Number.isFinite(data[c][i]) ? +data[c][i].toFixed({ lat: 7, lon: 7, sog: 3, cog: 1, roll: 1, az: 2, vbat: 2 }[c] ?? 0) : NaN;
    if (Number.isNaN(want)) assert.ok(Number.isNaN(log.data[c][i]), `${c}[${i}] should be empty`);
    else assert.equal(log.data[c][i], want, `${c}[${i}]`);
  }
  assert.equal(log.data.utc_ms[4], 1790158502100);
  // write -> parse -> write is byte-identical
  assert.equal(writeLog({ meta: log.meta, data: log.data, n: log.n }), writeLog({ meta: { ...meta, start_utc: '2026-09-24T10:15:02Z' }, data, n }));
});

test('logger quirks: partial last row dropped, trailer-only start_utc, unknown keys, empty yaw column', async () => {
  const s = await synthText({ kind: 'moth', minutes: 4, seed: 12, noYaw: true });
  // the logger rewrites a trailer at close; after a power cut the last data line may be partial
  const lines = s.text.trimEnd().split('\n');
  const trailerAt = lines.findIndex((l, i) => i > 20 && l.startsWith('#'));
  const body = lines.slice(0, trailerAt), trailer = lines.slice(trailerAt);
  const cut = [...body.slice(0, 5), '# board=esp32s3 devkit', '# yaw_ref=game', ...body.slice(5), body[body.length - 1].slice(0, 30), ...trailer].join('\n') + '\n';
  const log = parseLog(cut);
  assert.equal(log.n, s.n, 'partial row dropped');
  assert.ok(log.warnings.some((w) => /wrong field count dropped/.test(w)));
  assert.match(String(log.meta.start_utc), /^2026-09-20T/, 'start_utc read from the trailer');
  assert.equal(log.meta.rows, '2400');
  assert.equal(log.meta.board, 'esp32s3 devkit');
  const track = buildTrack(log);
  assert.equal(track.has.yaw, false);
  assert.ok(track.utc0 > 0);
  const res = analyze(track, defaultSettings(track));
  assert.ok(res.legs.length >= 2 && Number.isFinite(res.est.twd), 'COG-based analysis works without yaw');
  // synthetic accelerometer follows the physics: heeled to starboard (roll > 0) -> ay < 0
  let sxy = 0; for (let k = 0; k < s.n; k++) if (Number.isFinite(s.data.roll[k])) sxy += s.data.roll[k] * s.data.ay[k];
  assert.ok(sxy < 0, 'ay ≈ −g·sin(roll)');
});

test('plain CSV (ISO time, knots) and GPX fallbacks parse', () => {
  const csv = 'time,latitude,longitude,speed_kn,heading\n' +
    Array.from({ length: 30 }, (_, i) => `2026-09-24T10:00:${String(i).padStart(2, '0')}Z,50.${String(1000000 + i * 90).slice(1)},-1.3,${(10 + (i % 3) * 0.1).toFixed(1)},45`).join('\n');
  const a = parseLog(csv);
  assert.equal(a.format, 'csv');
  assert.equal(a.n, 30);
  assert.equal(a.data.t_ms[29], 29000);
  assert.ok(Math.abs(a.data.sog[0] - 10 * 1852 / 3600) < 1e-9, 'knots converted to m/s');
  const tr = buildTrack(a);
  assert.ok(tr.n >= 29 && Number.isFinite(tr.sog[10]));
  const gpx = parseLog(readFileSync(new URL('../docs/samples/moth-track.gpx', import.meta.url), 'utf8'));
  assert.equal(gpx.format, 'gpx');
  assert.ok(gpx.n > 500);
  const g = buildTrack(gpx);
  assert.ok(g.duration > 800);
});

test('v1 parser speed: 1 h at 50 Hz (180k rows) parses in < 2 s', async () => {
  const s = await synthText({ kind: 'moth', minutes: 60, rate: 50, seed: 2 });
  const t0 = performance.now();
  const log = parseLog(s.text);
  const dt = performance.now() - t0;
  assert.equal(log.n, 180000);
  assert.ok(dt < 2000, `parse took ${dt.toFixed(0)} ms`);
  const t1 = performance.now();
  const tr = buildTrack(log);
  analyze(tr, defaultSettings(tr));
  assert.ok(performance.now() - t1 < 4000, 'track + analysis of 1 h stays interactive');
});

for (const name of ['moth-ab-sample', 'iom-sample']) {
  test(`${name}: TWD auto-estimate within 5° and tack/gybe recall >= 90 %`, () => {
    const { text, truth } = sample(name);
    const { res } = run(text);
    const err = Math.abs(wrap180(res.est.twd - truth.twdMean));
    assert.ok(err < 5, `TWD ${res.est.twd.toFixed(1)} vs truth ${truth.twdMean.toFixed(1)}`);
    const r = recall(truth.maneuvers, res.maneuvers);
    assert.ok(r.hit / r.n >= 0.9, `recall ${r.hit}/${r.n}`);
    assert.ok(r.falsePos <= Math.max(1, 0.1 * r.n), `false positives ${r.falsePos}`);
    assert.ok(res.legs.length >= 8, 'legs found');
    assert.ok(res.legs.every((L) => L.dur >= 20), 'legs respect the minimum length');
  });
}

test('maneuver detection on a long session with wind shifts (in memory, 3 seeds)', async () => {
  let hit = 0, n = 0, fp = 0;
  for (const seed of [21, 22, 23]) {
    const s = await synthText({ kind: 'moth', minutes: 30, seed });
    const { res } = run(s.text);
    const r = recall(s.truth.maneuvers, res.maneuvers);
    hit += r.hit; n += r.n; fp += r.falsePos;
    assert.ok(Math.abs(wrap180(res.est.twd - s.truth.twdMean)) < 5, `seed ${seed} TWD`);
  }
  assert.ok(hit / n >= 0.9, `recall ${hit}/${n}`);
  assert.ok(fp <= 0.1 * n, `false positives ${fp}`);
});

test('TWD from an anemometer column is used when tws_source says it is real', async () => {
  const s = await synthText({ kind: 'iom', minutes: 10, seed: 4, anemometer: true });
  const { track, res } = run(s.text);
  assert.ok(track.twdCol && track.twsCol);
  assert.equal(res.twdSource, 'column');
  assert.ok(Math.abs(wrap180(res.twd0 - s.truth.twdMean)) < 3);
  assert.ok(Math.abs(res.summary.twsMean - s.truth.twsMean) < 0.2);
});

test('A/B on the Moth sample: 95 % CI contains the known +1 % effect; short subset is not conclusive', () => {
  const { text, truth } = sample('moth-ab-sample');
  assert.equal(truth.effect, 0.01);
  const { res } = run(text);
  const up = res.ab.types.up, pooled = res.ab.pooled;
  assert.ok(up.stats.n >= 2 && pooled.stats.n >= 4, 'pairs formed');
  for (const st of [up.stats, pooled.stats]) assert.ok(st.ci[0] <= 1 && st.ci[1] >= 1, `CI [${st.ci}] contains +1 %`);
  assert.match(pooled.verdict.text, /\d+\.\d% ± \d+\.\d%/);
  // first 5 minutes only
  const lines = text.split('\n');
  const head = lines.findIndex((l) => l.startsWith('t_ms'));
  const short = lines.slice(0, head + 1 + 3000).join('\n');
  const { res: r2 } = run(short);
  assert.equal(r2.ab.types.up.verdict.conclusive, false);
  assert.match(r2.ab.types.up.verdict.text, /Not enough|not yet conclusive/);
});

test('A/B recovers +1 % without bias (same session with and without the treatment)', async () => {
  // common random numbers: identical wind, steering and sensor noise, only the B speed factor differs,
  // so the difference of the two estimates isolates the analysis' response to a known +1 % effect.
  const base = { kind: 'moth', minutes: 90, seed: 31, gustSigma: 0.01, slowSigma: 0.01, shiftSigma: 1.5 };
  const on = run((await synthText({ ...base, effect: 0.01 })).text).res.ab;
  const off = run((await synthText({ ...base, effect: 0 })).text).res.ab;
  const st = on.pooled.stats;
  assert.ok(st.n >= 20, `${st.n} pairs`);
  assert.ok(st.ci[0] <= 1 && st.ci[1] >= 1, `pooled CI [${st.ci.map((x) => x.toFixed(2))}] contains +1 %`);
  assert.ok(on.types.up.stats.ci[0] <= 1 && on.types.up.stats.ci[1] >= 1, 'upwind VMG CI contains +1 %');
  assert.ok(st.boot[0] < st.mean && st.boot[1] > st.mean);
  const dPooled = st.mean - off.pooled.stats.mean, dUp = on.types.up.stats.mean - off.types.up.stats.mean;
  assert.ok(Math.abs(dPooled - 1) < 0.3, `pooled speed responds ${dPooled.toFixed(2)} % to a +1 % effect`);
  assert.ok(Math.abs(dUp - 1) < 0.4, `upwind VMG responds ${dUp.toFixed(2)} %`);
});

test('A/B 95 % CI coverage of the true +1 % over 12 synthetic IOM and Moth sessions', async () => {
  let hit = 0, n = 0;
  for (const kind of ['iom', 'moth']) for (let seed = 200; seed < 206; seed++) {
    const { res } = run((await synthText({ kind, minutes: 12, seed })).text);
    const st = res.ab.pooled.stats;
    if (st.n < 2) continue;
    n++; if (st.ci[0] <= 1 && st.ci[1] >= 1) hit++;
  }
  assert.ok(n >= 10, `${n} sessions with pairs`);
  assert.ok(hit / n >= 0.8, `coverage ${hit}/${n}`);
});

test('statistics: t quantiles, paired CI and sample size', () => {
  assert.ok(Math.abs(tQuantile(0.975, 9) - 2.2622) < 1e-3);
  assert.ok(Math.abs(tQuantile(0.975, 1) - 12.706) < 1e-2);
  assert.ok(Math.abs(tCDF(0, 5) - 0.5) < 1e-12);
  const d = [1.2, 0.4, 1.9, 0.8, 1.1, 0.3, 1.6, 0.9];
  const st = pairedStats(d);
  assert.ok(Math.abs(st.mean - 1.025) < 1e-9);
  assert.ok(st.ci[0] > 0 && st.p < 0.01);
  const n = pairsForHalfWidth(2, 0.5);
  assert.ok(n >= 64 && n <= 70, `n = ${n}`); // (1.96*2/0.5)^2 = 61.5 plus the t penalty
});

test('polar binning and envelope sanity', () => {
  const pts = [];
  for (let twa = 40; twa <= 60; twa += 0.5) for (let k = 0; k < 4; k++) pts.push({ twa, speed: 7 + 0.05 * (twa - 40) + 0.1 * k, tws: 5.5 });
  for (let twa = 130; twa <= 150; twa += 0.5) pts.push({ twa, speed: 10, tws: 5.5 });
  const [p] = binPolar(pts, { bin: 5 });
  assert.equal(p.bins.reduce((a, b) => a + b.n, 0), pts.length);
  const b = p.bins.find((x) => x.twa === 42.5);
  assert.ok(b.mean > 7 && b.mean < 7.4 && b.p90 >= b.mean && b.max >= b.p90);
  assert.equal(p.envelope.length, 2, 'two separate TWA ranges -> two envelope pieces');
  for (const seg of p.envelope) for (const q of seg) assert.ok(q.speed > 6.9 && q.speed < 10.5);
  assert.ok(p.envelope[0][0].twa >= 40 && p.envelope[1].at(-1).twa <= 150 + 2.5);
});

test('model overlay: polar table import, measured/model ratios, exports', () => {
  const m = parsePolarJSON({ tws: 5.5, points: [{ twa: 40, speed: 7 }, { twa: 90, speed: 10 }, { twa: 150, speed: 9 }] });
  assert.equal(m.speed(65, 5.5), 8.5);
  assert.ok(m.bestVMG('up', 5.5).vmg > 5);
  const { text } = sample('iom-sample');
  const track = buildTrack(parseLog(text));
  const res = analyze(track, defaultSettings(track), parsePolarJSON({ tws: 3.6, points: [{ twa: 30, speed: 0.8 }, { twa: 180, speed: 1.2 }] }));
  assert.ok(res.legs.every((L) => Number.isFinite(L.ratio) && L.ratio > 0.5 && L.ratio < 1.6));
  const csv = legsCSV(res.legs);
  assert.equal(csv.trim().split('\n').length, res.legs.length + 1);
  const j = JSON.parse(summaryJSON(res, track, 'iom-sample.csv'));
  assert.equal(j.legs.length, res.legs.length);
  assert.ok(j.ab.up && j.wind.twd_deg > 0);
});

test('synthesiser output honours LOG_FORMAT v1 and the sample size budget', async () => {
  for (const name of ['moth-ab-sample', 'iom-sample']) {
    const { text } = sample(name);
    assert.ok(text.length < 1.5e6, `${name} is ${(text.length / 1e6).toFixed(2)} MB`);
    const log = parseLog(text);
    assert.deepEqual(log.columns, V1_COLUMNS);
    assert.equal(log.meta.rate_hz, 10);
    assert.ok(log.data.event.some((v) => v > 0), 'A/B markers present');
  }
  const s = await synthesize({ kind: 'iom', minutes: 3, seed: 9 });
  assert.equal(s.n, 1800);
  assert.ok(s.data.lat.slice(0, 100).some(Number.isNaN), 'no fix during the first seconds');
});
