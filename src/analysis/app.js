// Sail log analysis page: loading, settings, rendering. Analysis logic lives in the DOM-free
// modules (parse, track, wind, segment, metrics, ab, pipeline); this file only wires the UI.
import { parseLog } from './parse.js';
import { buildTrack } from './track.js';
import { analyze, defaultSettings } from './pipeline.js';
import { PolarModel, parsePolarJSON } from './model.js';
import { legsCSV, summaryJSON } from './export.js';
import { KN, fmtClock, DEG, mean } from './util.js';
import { refreshTheme, theme, timeSeries, trackMap, polarPlot, scatterPlot, barPlot, tracesPlot, forestPlot, convergePlot, timelinePlot, sw, fmtPct } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const SAMPLES = {
  moth: { name: 'moth-ab-sample.csv', load: () => import('../../docs/samples/moth-ab-sample.csv?raw'), twsKn: 11 },
  iom: { name: 'iom-sample.csv', load: () => import('../../docs/samples/iom-sample.csv?raw'), twsKn: 7 },
  gpx: { name: 'moth-track.gpx', load: () => import('../../docs/samples/moth-track.gpx?raw'), twsKn: 11 },
};

const S = {
  track: null, file: '', info: null, settings: null, res: null, unit: 'kn', tab: 'overview',
  brush: null, mapView: null, selectedLeg: null, cursorT: NaN,
  model: { kind: 'none', moth: new Map(), imported: null, busy: false, preset: 'medium' },
  sort: { legs: { key: 'id', asc: true }, man: { key: 't', asc: true } },
  charts: {},
};

// ------------------------------------------------------------------ units & formatting
const conv = (v) => (S.unit === 'kn' ? v / KN : v);
const unitLabel = () => (S.unit === 'kn' ? 'kn' : 'm/s');
const fmtS = (v) => (Number.isFinite(v) ? conv(v).toFixed(S.unit === 'kn' ? 1 : 2) : '–');
const fmtN = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const fmtT = (s) => fmtClock(s);
const clockAt = (s) => (S.track?.utc0 ? new Date(S.track.utc0 + s * 1000).toISOString().slice(11, 19) + ' UTC' : '');

// ------------------------------------------------------------------ loading
let worker = null, reqId = 0;
function getWorker() {
  if (worker === null) {
    try { worker = new Worker(new URL('./parse.worker.js', import.meta.url), { type: 'module' }); } catch { worker = false; }
  }
  return worker || null;
}
function parseInWorker(payload) {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('no worker'));
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    const on = (e) => { if (e.data.id !== id) return; w.removeEventListener('message', on); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
    w.addEventListener('message', on);
    w.addEventListener('error', (e) => reject(new Error(e.message || 'worker failed')), { once: true });
    w.postMessage({ id, ...payload });
  });
}
async function parseAny(payload) {
  try { return await parseInWorker(payload); } catch (err) {
    if (!/no worker|worker failed/.test(err.message)) throw err;
    const text = payload.text ?? (await payload.file.text());
    const t0 = performance.now(); const log = parseLog(text); const t1 = performance.now();
    return { track: buildTrack(log), rows: log.n, bytes: text.length, parseMs: t1 - t0, buildMs: performance.now() - t1 };
  }
}

async function load(payload, name, preset = {}) {
  setStatus(`reading ${name}…`);
  try {
    const r = await parseAny(payload);
    S.track = r.track; S.file = name; S.info = r;
    S.brush = null; S.mapView = null; S.selectedLeg = null;
    S.settings = defaultSettings(S.track);
    if (preset.twsKn) S.settings.tws = preset.twsKn * KN;
    writeControls();
    document.body.classList.remove('no-data');
    $('#btnCSV').disabled = $('#btnJSON').disabled = false;
    run();
    if (S.model.kind === 'moth' && (await ensureMoth())) run();
  } catch (err) {
    setStatus(`could not read ${name}: ${err.message}`);
    console.error(err);
  }
}
async function loadSample(key) {
  const s = SAMPLES[key];
  setStatus(`loading sample ${s.name}…`);
  const mod = await s.load();
  await load({ text: mod.default }, s.name, s);
}

// ------------------------------------------------------------------ settings <-> controls
const num = (id) => { const v = parseFloat($('#' + id).value); return Number.isFinite(v) ? v : NaN; };
function writeControls() {
  const s = S.settings;
  const tr = S.track;
  $('#twdMode').value = s.twdMode;
  $('#twdMode option[value=column]').disabled = !tr.twdCol;
  $('#twd').value = Number.isFinite(s.twd) ? Math.round(s.twd) : '';
  $('#trackShifts').checked = !!s.trackShifts;
  $('#tws').value = +conv(s.tws).toFixed(1);
  $('#twsSchedule').value = s.twsSchedule || '';
  for (const k of ['minLeg', 'settle', 'pre', 'upMax', 'downMin', 'hyst']) $('#' + k).value = s.seg[k];
  $('#adaptiveSettle').checked = s.seg.adaptiveSettle !== false;
  $('#mPre').value = s.man.mPre; $('#mPost').value = s.man.mPost; $('#mRef').value = s.man.ref;
  $('#foilSpeed').value = +conv(s.man.foilSpeed).toFixed(1);
  $('#foilSpeed').closest('.ctl').style.display = tr.cls === 'Moth' ? '' : 'none';
  $('#abMode').value = s.ab.mode; $('#abStart').value = s.ab.start; $('#abRanges').value = s.ab.ranges;
  $('#abMetric').value = s.ab.metric; $('#abPairing').value = s.ab.pairing; $('#abEffect').value = s.ab.effect; $('#abGap').value = s.ab.maxGap;
  $('#rangesRow').style.display = s.ab.mode === 'ranges' ? '' : 'none';
  $$('.u').forEach((e) => { e.textContent = unitLabel(); });
}
function readControls() {
  const s = S.settings;
  s.twdMode = $('#twdMode').value;
  s.twd = num('twd');
  s.trackShifts = $('#trackShifts').checked;
  const tws = num('tws'); if (tws > 0) s.tws = S.unit === 'kn' ? tws * KN : tws;
  s.twsSchedule = $('#twsSchedule').value;
  for (const k of ['minLeg', 'settle', 'pre', 'upMax', 'downMin', 'hyst']) { const v = num(k); if (Number.isFinite(v)) s.seg[k] = v; }
  s.seg.adaptiveSettle = $('#adaptiveSettle').checked;
  const mp = num('mPre'), mq = num('mPost'); if (mp > 0) s.man.mPre = mp; if (mq > 0) s.man.mPost = mq;
  s.man.ref = $('#mRef').value;
  const fs = num('foilSpeed'); if (fs >= 0) s.man.foilSpeed = S.unit === 'kn' ? fs * KN : fs;
  s.ab.mode = $('#abMode').value; s.ab.start = $('#abStart').value; s.ab.ranges = $('#abRanges').value;
  s.ab.metric = $('#abMetric').value; s.ab.pairing = $('#abPairing').value; const ef = num('abEffect'); if (ef > 0) s.ab.effect = ef;
  const g = num('abGap'); if (g > 0) s.ab.maxGap = g;
  $('#rangesRow').style.display = s.ab.mode === 'ranges' ? '' : 'none';
}

// ------------------------------------------------------------------ model overlay
function currentModel() {
  if (S.model.kind === 'import') return S.model.imported;
  if (S.model.kind === 'moth') {
    const tabs = [...S.model.moth.values()];
    return tabs.length ? new PolarModel(`Moth VPP (${S.model.preset})`, tabs, 'src/physics/vpp.js MothModel') : null;
  }
  return null;
}
let modelWorker = null, modelReq = 0;
function mothTwsNeeded() {
  const s = S.settings;
  const set = new Set([+(s.tws / KN).toFixed(1)]);
  if (S.res?.twsVarying) for (const L of S.res.legs) if (Number.isFinite(L.tws)) set.add(Math.round(L.tws / KN * 2) / 2);
  return [...set].slice(0, 6).map((kn) => kn * KN);
}
async function ensureMoth() {
  const need = mothTwsNeeded().filter((t) => !S.model.moth.has(t.toFixed(3)));
  if (!need.length) return false;
  S.model.busy = true;
  const t0 = performance.now();
  setModelHint(`computing Moth polar at ${need.map((t) => (t / KN).toFixed(1)).join(', ')} kn…`);
  for (const tws of need) {
    const table = await new Promise((resolve, reject) => {
      if (!modelWorker) modelWorker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' });
      const id = ++modelReq;
      const on = (e) => { if (e.data.id !== id) return; modelWorker.removeEventListener('message', on); e.data.ok ? resolve(e.data.table) : reject(new Error(e.data.error)); };
      modelWorker.addEventListener('message', on);
      modelWorker.postMessage({ id, tws, preset: S.model.preset });
    }).catch((err) => { setModelHint(`Moth model failed: ${err.message}`); return null; });
    if (table) S.model.moth.set(tws.toFixed(3), table);
  }
  S.model.busy = false;
  const tabs = [...S.model.moth.values()];
  const b = tabs[0]?.best;
  setModelHint(`Moth VPP, medium preset (src/physics/vpp.js), computed in ${((performance.now() - t0) / 1000).toFixed(1)} s. ${b ? `Best VMG upwind ${fmtS(b.up.vmg)} ${unitLabel()} at ${b.up.twa.toFixed(0)}°, downwind ${fmtS(b.down.vmg)} at ${b.down.twa.toFixed(0)}°.` : ''} The faint branch is hull-borne (no steady foiling equilibrium at those angles); foiling legs are compared with the foiling branch only.`);
  return true;
}
function setModelHint(t) { $('#modelHint').textContent = t; }

// ------------------------------------------------------------------ run + render
let runTimer = 0;
function scheduleRun() { clearTimeout(runTimer); runTimer = setTimeout(async () => { readControls(); run(); if (S.model.kind === 'moth' && (await ensureMoth())) run(); }, 120); }
function run() {
  if (!S.track) return;
  const t0 = performance.now();
  S.res = analyze(S.track, S.settings, currentModel());
  S.analyseMs = performance.now() - t0;
  // keep selections valid
  if (S.selectedLeg) S.selectedLeg = S.res.legs.find((L) => Math.abs(L.t0 - S.selectedLeg.t0) < 2) || null;
  render();
}
function setStatus(t) { $('#status').textContent = t; }

function render() {
  if (!S.res) return;
  refreshTheme();
  renderHeader();
  renderWindHint();
  const f = { overview: renderOverview, legs: renderLegs, maneuvers: renderManeuvers, polar: renderPolar, ab: renderAB }[S.tab];
  f();
  const r = S.info;
  setStatus(`${r.rows.toLocaleString('en')} rows · parsed ${r.parseMs.toFixed(0)} ms · analysed ${S.analyseMs.toFixed(0)} ms at ${S.track.rate} Hz`);
}

function renderHeader() {
  const tr = S.track, m = tr.meta;
  const pills = [
    `<span class="pill"><b>${esc(S.file)}</b></span>`,
    m.boat ? `<span class="pill">${esc(m.boat)}</span>` : '',
    `<span class="pill">${esc(tr.cls)} · ${tr.format}${tr.rawRate ? ` · ${+tr.rawRate.toFixed(1)} Hz` : ''}</span>`,
    `<span class="pill">${fmtT(tr.duration)}${tr.utc0 ? ' · ' + new Date(tr.utc0).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''}</span>`,
    ...tr.warnings.slice(0, 2).map((w) => `<span class="pill warn" title="${esc(w)}">⚠ ${esc(w.slice(0, 48))}${w.length > 48 ? '…' : ''}</span>`),
  ];
  $('#fileInfo').innerHTML = pills.join('');
}
function renderWindHint() {
  const e = S.res.est;
  const src = S.res.twdSource;
  const conf = e.confidence >= 0.7 ? 'high' : e.confidence >= 0.4 ? 'medium' : 'low';
  let t = `Auto estimate <b>${fmtN(e.twd, 0)}°</b> (${conf} confidence; tack half-angles up ${fmtN(e.upHalfAngle, 0)}°, down ${fmtN(e.downHalfAngle, 0)}° from the axis).`;
  if (src === 'column') t = `Using the wind column (tws_source=${esc(S.track.twsSource)}), mean <b>${fmtN(S.res.twd0, 0)}°</b>. ` + t;
  else if (src === 'manual') t = `Using manual <b>${fmtN(S.res.twd0, 0)}°</b>. ` + t;
  if (S.res.shift) t += ` Shift tracking: ${S.res.shift.points.length} leg pairs, range ${fmtN(Math.min(...S.res.shift.points.map((p) => p.eSmooth)), 1)}…${fmtN(Math.max(...S.res.shift.points.map((p) => p.eSmooth)), 1)}°.`;
  $('#twdHint').innerHTML = t + (src !== 'auto' ? ' <button id="useEst">use estimate</button>' : '');
  $('#useEst')?.addEventListener('click', () => { $('#twdMode').value = 'auto'; $('#twd').value = ''; scheduleRun(); });
  if (!Number.isFinite(S.settings.twd)) $('#twd').placeholder = fmtN(e.twd, 0);
}

function kpi(label, value, sub = '') { return `<div class="kpi"><span>${label}</span><b>${value}</b><i>${sub}</i></div>`; }
function renderOverview() {
  const r = S.res, sm = r.summary, u = unitLabel();
  $('#kpis').innerHTML = [
    kpi('Duration · distance', fmtT(sm.duration), `${(sm.distance / 1852).toFixed(2)} nm · ${sm.distance.toFixed(0)} m`),
    kpi(`Upwind VMG (${u})`, fmtS(sm.up.vmg), `${fmtS(sm.up.sog)} ${u} at ${fmtN(sm.up.twa, 0)}° · ${sm.up.legs} legs`),
    kpi(`Downwind VMG (${u})`, fmtS(sm.down.vmg), `${fmtS(sm.down.sog)} ${u} at ${fmtN(sm.down.twa, 0)}° · ${sm.down.legs} legs`),
    kpi('Tacks · mean loss', `${sm.tacks.n} · ${fmtN(sm.tacks.loss, 0)} m`, `t90 ${fmtN(sm.tacks.t90, 1)} s${S.track.cls === 'Moth' ? ` · ${sm.tacks.dropped} off foils` : ''}`),
    kpi('Gybes · mean loss', `${sm.gybes.n} · ${fmtN(sm.gybes.loss, 0)} m`, `t90 ${fmtN(sm.gybes.t90, 1)} s${S.track.cls === 'Moth' ? ` · ${sm.gybes.dropped} off foils` : ''}`),
    kpi('Wind (TWD · TWS)', `${fmtN(r.twd0, 0)}° · ${fmtS(sm.twsMean)}`, `${r.twdSource}${r.shift ? ', shifts tracked' : ''} · ${u}`),
    kpi(`Max speed (${u}, 2 s)`, fmtS(sm.maxSpeed), `GNSS ${(sm.gnssCoverage * 100).toFixed(0)} % · ${sm.events} markers`),
  ].join('');
  drawMap();
  drawPolar($('#polarSmall'), true);
  drawTimeSeries();
}

function vmgDisplay() {
  const { sog } = S.track, tw = S.res.seg.twaS;
  const out = new Float64Array(sog.length);
  for (let k = 0; k < sog.length; k++) { const a = Math.abs(tw[k]); out[k] = a < 80 ? sog[k] * Math.cos(a * DEG) : a > 100 ? -sog[k] * Math.cos(a * DEG) : NaN; }
  return out;
}
function drawTimeSeries() {
  const tr = S.track, T = theme();
  const cv = (a) => Float64Array.from(a, (v) => conv(v));
  if (!S._vmgCache || S._vmgCache.res !== S.res || S._vmgCache.unit !== S.unit) S._vmgCache = { res: S.res, unit: S.unit, sog: cv(tr.sog), vmg: cv(vmgDisplay()) };
  const panels = [
    { label: 'Speed', unit: unitLabel(), series: [{ label: 'SOG', color: T.s[0], y: S._vmgCache.sog }, { label: 'VMG (along the wind)', color: T.s[1], y: S._vmgCache.vmg }], fmt: (v) => v.toFixed(S.unit === 'kn' ? 1 : 2) },
    { label: 'Heel, + starboard down', unit: '°', series: [{ label: 'roll', color: T.s[0], y: tr.roll }], includeZero: true },
    { label: 'Rudder, + bow to starboard', unit: '°', series: [{ label: 'rudder', color: T.s[0], y: tr.rudder }], includeZero: true },
    { label: 'Sheet, 0 = in', unit: '%', series: [{ label: 'sheet', color: T.s[0], y: tr.sheet }], fmt: (v) => v.toFixed(0) },
  ];
  S.charts.ts = timeSeries($('#ts'), {
    t: tr.t, panels, legs: S.res.legs, maneuvers: S.res.maneuvers.filter((m) => m.type === 'tack' || m.type === 'gybe'), events: tr.events,
    xlim: S.brush, fmtT, fmtClock: clockAt, cursorT: S.cursorT,
    onCursor: (t) => { S.cursorT = t; if (S.charts.map?.setCursor) S.charts.map.setCursor(Number.isFinite(t) ? Math.round(t * tr.rate) : -1); },
    onBrush: (b) => { S.brush = b; drawTimeSeries(); drawMap(); },
    onReset: () => { S.brush = null; S.selectedLeg = null; drawTimeSeries(); drawMap(); },
  });
}
function tipAt(k) {
  const tr = S.track, r = S.res;
  const leg = r.legs.find((L) => k >= L.i0 && k <= L.i1);
  const twa = r.seg.twaS[k];
  return `<span class="mut">${fmtT(tr.t[k])}${clockAt(tr.t[k]) ? ' · ' + clockAt(tr.t[k]) : ''}</span><br>SOG <b>${fmtS(tr.sog[k])}</b> ${unitLabel()} · TWA ${Number.isFinite(twa) ? Math.abs(twa).toFixed(0) + '° ' + (twa > 0 ? 'stbd' : 'port') : '–'}<br>heel ${fmtN(tr.roll[k])}° · rudder ${fmtN(tr.rudder[k])}°${leg ? `<br>leg ${leg.id} · ${leg.mode}${leg.config ? ' · config ' + leg.config : ''}` : ''}`;
}
function drawMap() {
  const tr = S.track, r = S.res;
  S.charts.map = trackMap($('#map'), {
    x: tr.x, y: tr.y, sog: tr.sog, t: tr.t, maneuvers: r.maneuvers, events: tr.events, twd: r.twd0,
    windLabel: `TWD ${Math.round(r.twd0)}° · ${fmtS(r.summary.twsMean)} ${unitLabel()}`,
    fmtSpeed: (v) => fmtS(v), unit: unitLabel(), range: S.brush, selectedLeg: S.selectedLeg, view: S.mapView,
    tipAt, cursorIdx: Number.isFinite(S.cursorT) ? Math.round(S.cursorT * tr.rate) : -1,
    onHover: (k) => { S.charts.ts?.setCursor?.(k >= 0 ? tr.t[k] : NaN); },
    onView: (v) => { S.mapView = v; drawMap(); },
  });
}

function modelCurve() {
  const m = S.res.model;
  if (!m) return null;
  const tws = S.settings.tws;
  return { curves: m.curves(tws), best: ['up', 'down'].map((d) => m.bestVMG(d, tws)).filter(Boolean) };
}
function drawPolar(canvas, small) {
  const r = S.res;
  const mc = modelCurve();
  const bands = r.polar.length > 1 ? r.polar.map((p) => ({ label: `${fmtS(p.tws)} ${unitLabel()}`, blocks: r.points.filter((q) => Math.abs(Math.round(q.tws / (2 * KN)) * 2 * KN - p.tws) < 1e-6), envelope: p.envelope })) : null;
  polarPlot(canvas, {
    blocks: r.points, legs: r.legs, envelope: r.polar[0]?.envelope || [], bands,
    model: mc?.curves, modelBest: mc?.best, modelName: r.model ? `${r.model.name} @ ${fmtS(S.settings.tws)} ${unitLabel()}` : '',
    conv, fmt: fmtS, unit: unitLabel(), fmtT,
  });
  if (!small) $('#polarNote').textContent = `${r.points.length} blocks of 10 s from ${r.legs.length} legs${r.twsVarying ? ' · binned by TWS (2 kn bands)' : ''}${r.model ? ' · model overlay ' + r.model.name : ''}`;
}

// ------------------------------------------------------------------ legs tab
const LEG_COLS = [
  ['id', '#', (L) => L.id], ['mode', 'Type', (L) => L.mode, 'txt'], ['tack', 'Tack', (L) => L.tack, 'txt'], ['config', 'Cfg', (L) => L.config || '–', 'txt'],
  ['t0', 'Start', (L) => fmtT(L.t0)], ['dur', 'Dur s', (L) => fmtN(L.dur, 0)],
  ['sog', 'SOG', (L) => fmtS(L.sog)], ['vmg', 'VMG', (L) => fmtS(L.vmg)], ['twa', 'TWA°', (L) => fmtN(L.twa, 1)], ['tws', 'TWS', (L) => fmtS(L.tws)],
  ['heel', 'Heel°', (L) => fmtN(L.heel, 1)], ['pitch', 'Pitch°', (L) => fmtN(L.pitch, 1)], ['rudder', 'Rudder°', (L) => fmtN(L.rudder, 1)], ['rudderSd', 'Rud sd°', (L) => fmtN(L.rudderSd, 1)],
  ['sheet', 'Sheet %', (L) => fmtN(L.sheet, 0)], ['cv', 'CV %', (L) => fmtN(L.cv, 1)], ['hacc', 'hAcc m', (L) => fmtN(L.hacc, 1)], ['satsMin', 'Sats', (L) => fmtN(L.satsMin, 0)],
  ['ratio', 'SOG/model', (L) => (Number.isFinite(L.ratio) ? (L.ratio * 100).toFixed(1) + ' %' : '–')], ['vmgRatio', 'VMG/model', (L) => (Number.isFinite(L.vmgRatio) ? (L.vmgRatio * 100).toFixed(1) + ' %' : '–')],
];
function table(wrap, cols, rows, sortState, opts = {}) {
  const { key, asc } = sortState;
  const val = (r) => r[key];
  const sorted = rows.slice().sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : (Number.isFinite(x) ? x : -Infinity) - (Number.isFinite(y) ? y : -Infinity); return asc ? c : -c; });
  wrap.innerHTML = `<table><thead><tr>${cols.map((c) => `<th data-k="${c[0]}" class="${c[3] || ''} ${c[0] === key ? 'sorted' + (asc ? ' asc' : '') : ''}" title="${esc(c[4] || '')}">${c[1]}</th>`).join('')}</tr></thead><tbody>${sorted.map((r, i) => `<tr data-i="${rows.indexOf(r)}" class="${opts.sel && opts.sel(r) ? 'sel' : ''}">${cols.map((c) => `<td class="${c[3] || ''}">${c[2](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $$('th', wrap).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; if (sortState.key === k) sortState.asc = !sortState.asc; else { sortState.key = k; sortState.asc = true; } table(wrap, cols, rows, sortState, opts); }));
  if (opts.onRow) $$('tbody tr', wrap).forEach((tr) => tr.addEventListener('click', () => opts.onRow(rows[+tr.dataset.i])));
}
function renderLegs() {
  const r = S.res, T = theme(), u = unitLabel();
  const cols = LEG_COLS.map((c) => (['sog', 'vmg', 'tws'].includes(c[0]) ? [c[0], `${c[1]} ${u}`, c[2], c[3]] : c));
  const typeSw = (m) => sw(m === 'up' ? T.s[0] : m === 'down' ? T.s[1] : T.s[2]);
  cols[1] = ['mode', 'Type', (L) => typeSw(L.mode) + L.mode, 'txt'];
  table($('#legsTableWrap'), cols, r.legs, S.sort.legs, {
    sel: (L) => S.selectedLeg && L.id === S.selectedLeg.id,
    onRow: (L) => { S.selectedLeg = L; S.brush = [Math.max(0, L.t0 - 15), Math.min(S.track.duration, L.t1 + 15)]; switchTab('overview'); },
  });
  $('#legsNote').textContent = `${r.legs.length} steady legs ≥ ${S.settings.seg.minLeg} s · heel + = to leeward · rudder + = weather helm · click a row to show it on the track`;
  const byMode = (m) => r.scatter.filter((p) => p.mode === m);
  const modes = [['up', 'upwind', T.s[0]], ['down', 'downwind', T.s[1]], ['reach', 'reach', T.s[2]]];
  scatterPlot($('#scHeel'), {
    series: modes.map(([m, label, color]) => ({ label, color, pts: byMode(m).map((p) => ({ x: conv(p.sog), y: p.heel, tip: `${label} · leg ${p.leg} · ${fmtT(p.t)}<br>${fmtS(p.sog)} ${u} · heel <b>${fmtN(p.heel)}°</b>` })) })),
    xlabel: `speed (${u})`, ylabel: 'heel to leeward (°)', empty: 'no heel (roll) data in this log',
  });
  scatterPlot($('#scRudder'), {
    series: modes.map(([m, label, color]) => ({ label, color, pts: byMode(m).map((p) => ({ x: p.heel, y: p.rudder, tip: `${label} · leg ${p.leg} · ${fmtT(p.t)}<br>heel ${fmtN(p.heel)}° · rudder <b>${fmtN(p.rudder)}°</b>` })) })),
    xlabel: 'heel to leeward (°)', ylabel: 'rudder, + weather helm (°)', empty: 'no calibrated rudder data in this log',
  });
  barPlot($('#cvChart'), {
    items: r.legs.map((L) => ({ label: `${L.id}`, value: L.cv, color: L.mode === 'up' ? T.s[0] : L.mode === 'down' ? T.s[1] : T.s[2], tip: `Leg ${L.id} · ${L.mode} ${L.tack} · ${fmtT(L.t0)}<br>speed CV <b>${fmtN(L.cv, 1)} %</b> · mean ${fmtS(L.sog)} ${u}` })),
    legend: modes.filter(([m]) => r.legs.some((L) => L.mode === m)).map(([, label, color]) => ({ label, color })),
    xlabel: 'leg', ylabel: 'CV of 1-s speed (%)', empty: 'no legs',
  });
}

// ------------------------------------------------------------------ maneuvers tab
function renderManeuvers() {
  const r = S.res, T = theme(), u = unitLabel(), sm = r.summary;
  const tg = r.maneuvers.filter((m) => (m.type === 'tack' || m.type === 'gybe'));
  const valid = tg.filter((m) => m.valid);
  const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const stats = (type) => { const v = valid.filter((m) => m.type === type); return { n: v.length, loss: med(v.map((m) => m.distLost)), t90: med(v.map((m) => m.t90)), min: med(v.map((m) => m.minRatio)), turn: med(v.map((m) => m.turnDur)) }; };
  const st = stats('tack'), sg = stats('gybe');
  $('#manKpis').innerHTML = [
    kpi('Tacks (analysed)', `${sm.tacks.n} (${st.n})`, `median turn ${fmtN(st.turn, 1)} s`),
    kpi('Tack: median loss', `${fmtN(st.loss, 1)} m`, `VMG vs ${S.settings.man.ref === 'mean' ? 'entry/exit mean' : 'entry'}, −${S.settings.man.mPre}…+${S.settings.man.mPost} s`),
    kpi('Tack: min speed', `${fmtN(st.min * 100, 0)} %`, `of entry · 90 % back after ${fmtN(st.t90, 1)} s`),
    kpi('Gybes (analysed)', `${sm.gybes.n} (${sg.n})`, `median turn ${fmtN(sg.turn, 1)} s`),
    kpi('Gybe: median loss', `${fmtN(sg.loss, 1)} m`, `min ${fmtN(sg.min * 100, 0)} % · 90 % after ${fmtN(sg.t90, 1)} s`),
    kpi('Bear-aways · round-ups', `${r.maneuvers.filter((m) => m.type === 'bearaway').length} · ${r.maneuvers.filter((m) => m.type === 'roundup').length}`, 'mark roundings, not in the loss stats'),
  ].join('');
  const x0 = -(S.settings.man.mPre + S.settings.man.entryLen), x1 = S.settings.man.mPost + 10;
  const mkGroups = (type) => {
    const ms = valid.filter((m) => m.type === type && m.trace);
    const tr = (m) => ({ t: m.trace.t, y: m.trace.v.map((v) => v / m.vEntry), tip: `${type} at ${fmtT(m.t)} · lost <b>${fmtN(m.distLost, 1)} m</b><br>entry ${fmtS(m.vEntry)} ${u} · min ${fmtN(m.minRatio * 100, 0)} % · 90 % after ${fmtN(m.t90, 1)} s${m.dropped ? '<br>dropped off the foils' : ''}` });
    const meanOf = (list) => { if (!list.length) return null; const L = Math.min(...list.map((m) => m.trace.t.length)); const t = list[0].trace.t.slice(0, L); return { t, y: t.map((_, i) => mean(list.map((m) => m.trace.v[i] / m.vEntry))) }; };
    if (S.track.cls === 'Moth') {
      const a = ms.filter((m) => !m.dropped), b = ms.filter((m) => m.dropped);
      return [{ label: 'stayed foiling', color: T.s[0], traces: a.map(tr), mean: meanOf(ms) }, { label: 'dropped off foils', color: T.s[1], traces: b.map(tr) }];
    }
    return [{ label: `${type}s`, color: T.s[0], traces: ms.map(tr), mean: meanOf(ms) }];
  };
  const common = { xlim: [x0, x1], ylim: [0, 1.3], xlabel: 's from head-to-wind / dead downwind', ylabel: 'speed ÷ entry speed', refs: [{ y: 1, label: '' }, { y: 0.9, label: '90 %' }] };
  tracesPlot($('#trTack'), { ...common, groups: mkGroups('tack'), empty: 'no tacks detected' });
  tracesPlot($('#trGybe'), { ...common, xlabel: 's from dead downwind', groups: mkGroups('gybe'), empty: 'no gybes detected' });
  barPlot($('#lossChart'), {
    items: valid.map((m) => ({ label: fmtT(m.t), value: m.distLost, color: m.type === 'tack' ? T.s[0] : T.s[1], tip: `${m.type} at ${fmtT(m.t)}<br>lost <b>${fmtN(m.distLost, 1)} m</b> of VMG · min speed ${fmtS(m.vMin)} ${u}` })),
    legend: [{ label: 'tack', color: T.s[0] }, { label: 'gybe', color: T.s[1] }], ylabel: 'distance lost (m)', empty: 'no complete maneuvers',
  });
  $('#lossNote').textContent = `metres of VMG lost vs sailing the ${S.settings.man.ref === 'mean' ? 'mean of entry and exit' : 'entry'} VMG from −${S.settings.man.mPre} s to +${S.settings.man.mPost} s`;
  const cols = [
    ['type', 'Type', (m) => m.type, 'txt'], ['t', 'Time', (m) => fmtT(m.t)], ['vEntry', `Entry ${u}`, (m) => fmtS(m.vEntry)], ['distLost', 'Lost m', (m) => fmtN(m.distLost, 1)],
    ['vMin', `Min ${u}`, (m) => fmtS(m.vMin)], ['minRatio', 'Min %', (m) => fmtN(m.minRatio * 100, 0)], ['t90', 't90 s', (m) => fmtN(m.t90, 1)], ['turnDur', 'Turn s', (m) => fmtN(m.turnDur, 1)],
    ['heelSwing', 'Heel swing°', (m) => fmtN(m.heelSwing, 0)], ['twaIn', 'TWA in°', (m) => fmtN(m.twaIn, 0)], ['twaOut', 'TWA out°', (m) => fmtN(m.twaOut, 0)],
    ['note', 'Notes', (m) => [m.valid === false ? `<span class="tag warn">${esc(m.note || 'incomplete')}</span>` : '', m.dropped ? '<span class="tag">off foils</span>' : '', m.overlap ? '<span class="tag">overlaps</span>' : '', m.type === 'bearaway' || m.type === 'roundup' ? `<span class="tag">${m.fromMode}→${m.toMode}</span>` : ''].join(' '), 'txt'],
  ];
  table($('#manTableWrap'), cols, r.maneuvers, S.sort.man, { onRow: (m) => { S.brush = [Math.max(0, m.t - 30), Math.min(S.track.duration, m.t + 40)]; S.selectedLeg = null; switchTab('overview'); } });
}

// ------------------------------------------------------------------ polar tab
function renderPolar() {
  drawPolar($('#polarBig'), false);
  const r = S.res, m = r.model, u = unitLabel();
  const pref = (b) => (m?.hasRegimes ? (S.track.cls === 'Moth' && b.mean > S.settings.man.foilSpeed ? 'foil' : 'hull') : undefined);
  const rows = r.polar.flatMap((p) => p.bins.map((b) => ({ ...b, tws: p.tws, model: m ? m.speed(b.twa, r.polar.length > 1 ? p.tws : S.settings.tws, pref(b)) : NaN })));
  const cols = [
    ...(r.polar.length > 1 ? [['tws', `TWS ${u}`, (b) => fmtS(b.tws)]] : []),
    ['twa', 'TWA°', (b) => `${b.twa - 2.5}–${b.twa + 2.5}`], ['n', 'Blocks', (b) => b.n], ['mean', `Mean ${u}`, (b) => fmtS(b.mean)], ['p90', `p90 ${u}`, (b) => fmtS(b.p90)], ['max', `Max ${u}`, (b) => fmtS(b.max)],
    ['vmg', `VMG ${u}`, (b) => fmtS(b.mean * Math.abs(Math.cos(b.twa * DEG)))],
    ...(m ? [['model', `Model ${u}`, (b) => fmtS(b.model)], ['ratio', 'Mean/model', (b) => (Number.isFinite(b.model) ? (b.mean / b.model * 100).toFixed(1) + ' %' : '–')]] : []),
  ];
  rows.forEach((b) => { b.vmg = b.mean * Math.abs(Math.cos(b.twa * DEG)); b.ratio = b.mean / b.model; });
  table($('#polarTableWrap'), cols, rows, S.sort.polar || (S.sort.polar = { key: 'twa', asc: true }));
}

// ------------------------------------------------------------------ A/B tab
const ci = (c) => `${fmtPct(c[0])} … ${fmtPct(c[1])}`;
const TYPE_LABEL = { up: 'Upwind', down: 'Downwind', reach: 'Reaching', all: 'All legs (speed)' };
function renderAB() {
  const r = S.res, ab = r.ab, T = theme();
  if (S.settings.ab.mode === 'off') { $('#verdicts').innerHTML = '<div class="verdict"><p>A/B assignment is off. Choose how legs are assigned to configurations in the A/B settings.</p></div>'; }
  else {
    const types = ['up', 'down', 'reach'].filter((k) => ab.types[k] && (ab.types[k].legs > 0 || k !== 'reach'));
    const card = (key, res) => {
      const st = res.stats || {}, v = res.verdict;
      const state = { difference: `Conclusive: ${v.faster} faster`, equivalent: 'No meaningful difference', open: 'Not yet conclusive', none: 'Not enough pairs' }[v.level];
      const metric = res.metric === 'vmg' ? 'VMG' : res.metric === 'ratio' ? 'speed ÷ model' : 'speed';
      const bal = res.balance;
      const imb = bal && Number.isFinite(bal.A) && Number.isFinite(bal.B) && Math.abs(bal.A - bal.B) > 0.3 && res.legs > 3
        ? `<p class="hint">⚠ Tack imbalance: A sailed ${(bal.A * 100).toFixed(0)} % and B ${(bal.B * 100).toFixed(0)} % of this leg type on port. A port/starboard difference (current, wind pattern, rig) would show up as an A/B effect.</p>` : '';
      return `<div class="verdict ${v.level}"><h4>${TYPE_LABEL[key]} · ${metric}<span class="state">${state}</span></h4><p>${esc(v.text)}</p>${imb}
        <dl><dt>pairs</dt><dd>${st.n || 0}</dd><dt>pair sd</dt><dd>${Number.isFinite(st.sd) ? st.sd.toFixed(2) + ' %' : '–'}</dd>
        <dt>95 % CI, t</dt><dd>${st.ci && Number.isFinite(st.ci[0]) ? ci(st.ci) : '–'}</dd><dt>bootstrap</dt><dd>${st.boot && Number.isFinite(st.boot[0]) ? ci(st.boot) : '–'}</dd>
        <dt>p (paired t)</dt><dd>${fmtN(st.p, 3)}</dd><dt>power, ${S.settings.ab.effect} %</dt><dd>${Number.isFinite(res.power) ? (res.power * 100).toFixed(0) + ' %' : '–'}</dd>
        <dt>n for ±${(S.settings.ab.effect / 2).toFixed(1)} %</dt><dd>${res.nForHalf ?? '–'}</dd><dt>n, 80 % power</dt><dd>${res.nForPower ?? '–'}</dd></dl></div>`;
    };
    $('#verdicts').innerHTML = types.map((k) => card(k, ab.types[k])).join('') + card('all', ab.pooled);
  }
  const typeColor = { up: T.s[0], down: T.s[1], reach: T.s[2] };
  const rows = ['up', 'down', 'reach'].filter((m) => r.legs.some((L) => L.mode === m)).map((m) => ({ label: TYPE_LABEL[m], legs: r.legs.filter((L) => L.mode === m) }));
  timelinePlot($('#abTimeline'), { duration: S.track.duration, rows, events: S.track.events, fmtT });
  const val = (res) => (res.metric === 'vmg' ? 'dVmg' : res.metric === 'ratio' ? 'dRatio' : 'dSpeed');
  const groups = Object.entries(ab.types).map(([k, res]) => ({
    label: TYPE_LABEL[k], color: typeColor[k], mean: res.stats.mean, lo: res.stats.ci?.[0], hi: res.stats.ci?.[1],
    pairs: res.pairs.map((p, i) => ({ d: p[val(res)], label: `${i + 1} · ${fmtT(p.t)}`, tip: `${TYPE_LABEL[k]} pair ${i + 1} (${p.order})<br>B − A: <b>${fmtPct(p[val(res)], 2)}</b> ${res.metric}<br><span class="mut">A legs ${p.a.legs.join(', ')} · B legs ${p.b.legs.join(', ')}</span>` })).filter((p) => Number.isFinite(p.d)),
  }));
  forestPlot($('#forest'), { groups, effect: S.settings.ab.effect, xlabel: 'B − A (%)' });
  convergePlot($('#converge'), { series: Object.entries(ab.types).map(([k, res]) => ({ label: TYPE_LABEL[k], color: typeColor[k], pts: res.cumulative })), effect: S.settings.ab.effect });
  const u = unitLabel();
  const pr = Object.entries(ab.types).flatMap(([k, res]) => res.pairs.map((p, i) => ({ ...p, type: k, idx: i + 1 })));
  const cols = [
    ['type', 'Type', (p) => TYPE_LABEL[p.type], 'txt'], ['idx', '#', (p) => p.idx], ['order', 'Order', (p) => p.order, 'txt'], ['t', 'Time', (p) => fmtT(p.t)],
    ['aLegs', 'A legs', (p) => p.a.legs.join(', '), 'txt'], ['bLegs', 'B legs', (p) => p.b.legs.join(', '), 'txt'],
    ['aSog', `A SOG ${u}`, (p) => fmtS(p.a.sog)], ['bSog', `B SOG ${u}`, (p) => fmtS(p.b.sog)], ['aVmg', `A VMG ${u}`, (p) => fmtS(p.a.vmg)], ['bVmg', `B VMG ${u}`, (p) => fmtS(p.b.vmg)],
    ['dSpeed', 'Δ speed', (p) => fmtPct(p.dSpeed, 2)], ['dVmg', 'Δ VMG', (p) => fmtPct(p.dVmg, 2)], ...(r.model ? [['dRatio', 'Δ SOG/model', (p) => fmtPct(p.dRatio, 2)]] : []),
    ['aTwa', 'TWA A/B°', (p) => `${fmtN(p.a.twa, 1)} / ${fmtN(p.b.twa, 1)}`],
  ];
  pr.forEach((p) => { p.aSog = p.a.sog; p.bSog = p.b.sog; p.aVmg = p.a.vmg; p.bVmg = p.b.vmg; p.aTwa = p.a.twa; });
  table($('#pairsTableWrap'), cols, pr, S.sort.pairs || (S.sort.pairs = { key: 't', asc: true }), { onRow: (p) => { S.brush = [Math.min(p.a.t0, p.b.t0) - 10, Math.max(p.a.t1, p.b.t1) + 10]; switchTab('overview'); } });
  const bal = Object.entries(ab.types).filter(([, res]) => res.legs).map(([k, res]) => `${TYPE_LABEL[k]} (paired by ${res.unit}): A ${fmtN(res.balance.A * 100, 0)} % / B ${fmtN(res.balance.B * 100, 0)} % of time on port, ${fmtN(res.balance.durA / 60, 1)} / ${fmtN(res.balance.durB / 60, 1)} min`).join(' · ');
  $('#balanceNote').textContent = `${S.settings.ab.mode === 'alternate' ? 'alternating legs' : S.settings.ab.mode === 'ranges' ? 'time ranges' : `${S.track.events.length} markers`} · ${bal} · click a row to show the pair`;
}

// ------------------------------------------------------------------ helpers & wiring
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function switchTab(tab) {
  S.tab = tab;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === tab));
  if (S.res) render();
}

function wire() {
  $('#btnOpen').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) load({ file: f }, f.name); e.target.value = ''; });
  const menu = $('#sampleMenu .menu-list');
  $('#btnSamples').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#btnSamples').setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', () => { menu.hidden = true; });
  $$('[data-sample]').forEach((b) => b.addEventListener('click', () => { menu.hidden = true; loadSample(b.dataset.sample); }));
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $$('.seg [data-unit]').forEach((b) => b.addEventListener('click', () => {
    if (S.unit === b.dataset.unit) return;
    if (S.settings) readControls();
    S.unit = b.dataset.unit;
    $$('.seg [data-unit]').forEach((x) => x.classList.toggle('on', x === b));
    if (S.settings) { writeControls(); render(); }
  }));
  $('#btnTheme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'auto';
    const next = { auto: 'light', light: 'dark', dark: 'auto' }[cur];
    if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
    $('#btnTheme').title = `Theme: ${next}`;
    try { localStorage.setItem('sla-theme', next); } catch { /* storage may be unavailable */ }
    render();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
  $('#btnCSV').addEventListener('click', () => S.res && download(S.file.replace(/\.[^.]+$/, '') + '-legs.csv', legsCSV(S.res.legs), 'text/csv'));
  $('#btnJSON').addEventListener('click', () => S.res && download(S.file.replace(/\.[^.]+$/, '') + '-summary.json', summaryJSON(S.res, S.track, S.file), 'application/json'));
  // settings
  $$('.side input, .side select, .side textarea').forEach((el) => {
    if (el.id === 'modelSel' || el.id === 'polarInput') return;
    el.addEventListener(el.tagName === 'TEXTAREA' || el.type === 'number' ? 'input' : 'change', () => {
      if (!S.settings) return;
      if (el.id === 'twd' && el.value !== '') $('#twdMode').value = 'manual';
      scheduleRun();
    });
  });
  $('#modelSel').addEventListener('change', async (e) => {
    const v = e.target.value;
    if (v === 'import') { $('#polarInput').click(); return; }
    S.model.kind = v;
    if (v === 'none') setModelHint('Polar table JSON: {"tws": 4, "points": [{"twa": 45, "speed": 1.0}], "unit": "m/s"}');
    if (S.settings) run();
    if (v === 'moth' && S.settings && (await ensureMoth())) run();
  });
  $('#polarInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) { $('#modelSel').value = S.model.kind; return; }
    try {
      S.model.imported = parsePolarJSON(await f.text(), f.name.replace(/\.json$/i, ''));
      S.model.kind = 'import';
      setModelHint(`${S.model.imported.name}: ${S.model.imported.tables.length} table(s), TWS ${S.model.imported.tables.map((t) => fmtS(t.tws)).join(', ')} ${unitLabel()}`);
      if (S.settings) run();
    } catch (err) { setModelHint(`Could not read polar: ${err.message}`); $('#modelSel').value = S.model.kind; }
  });
  $('#sideToggle').addEventListener('click', () => { const s = $('#side'); s.classList.toggle('collapsed'); $('#sideToggle').setAttribute('aria-expanded', String(!s.classList.contains('collapsed'))); });
  // drag and drop
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { depth++; $('#drop').hidden = false; } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('#drop').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; $('#drop').hidden = true; const f = e.dataTransfer?.files?.[0]; if (f) load({ file: f }, f.name); });
  // re-render on resize
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (S.res) render(); }, 80); }).observe($('.main'));
}

function init() {
  try { const th = localStorage.getItem('sla-theme'); if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; } catch { /* ignore */ }
  const q = new URLSearchParams(location.search);
  if (q.get('theme') === 'light' || q.get('theme') === 'dark') document.documentElement.dataset.theme = q.get('theme');
  document.body.classList.add('no-data');
  if (window.matchMedia('(max-width: 860px)').matches) $('#side').classList.add('collapsed');
  wire();
  if (q.get('unit') === 'ms') $('.seg [data-unit=ms]').click();
  const tab = q.get('tab');
  if (tab) switchTab(tab);
  if (q.get('model') === 'moth') { $('#modelSel').value = 'moth'; S.model.kind = 'moth'; }
  if (q.get('sample') && SAMPLES[q.get('sample')]) loadSample(q.get('sample'));
  window.__sla = S; // for debugging and the screenshot tool
}
init();
