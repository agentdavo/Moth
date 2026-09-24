// IOM Keel Lab page: controls, 3-D view, charts; physics in a Web Worker.
import { DEFAULT_DESIGN, PARAMS, SECTIONS, SECTION_LABELS, clone } from '../physics/design.js';
import { showExport } from '../../ui/exportDialog.js';
import { computeStatics } from '../physics/statics.js';
import { checkRules } from '../physics/rules.js';
import { VARS } from '../physics/objective.js';
import { KNOT } from '../physics/constants.js';
import { IomScene } from './scene.js';
import { lineChart, polarChart, barList, heatmap, scatter, css } from './charts.js';

const RESULTS = import.meta.glob('/docs/results/iom/*.json', { eager: true, import: 'default' });
const res = (name) => RESULTS[`/docs/results/iom/${name}.json`] || null;

const $ = (id) => document.getElementById(id);
const state = { design: clone(DEFAULT_DESIGN), band: 1, results: null, baseline: null, bulbGrid: null, opt: null, view: 'boat' };
const bandColor = (i) => css(`--s${i + 1}`);
window.__iom = { ready: false, evalDone: false, optDone: false };

// ------------------------------------------------------------------ theme
try { const t = localStorage.getItem('iom-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* storage unavailable */ }
$('theme').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('iom-theme', next); } catch { /* ignore */ }
  scene?.applyTheme(); redrawAll();
};

// ------------------------------------------------------------------ worker
const worker = new Worker(new URL('../workers/iom.worker.js', import.meta.url), { type: 'module' });
let nextId = 1;
const pending = new Map();
worker.onmessage = (ev) => {
  const { id, result, error, progress, ...rest } = ev.data;
  const p = pending.get(id);
  if (!p) return;
  if (progress !== undefined) { p.onProgress?.(progress, rest); return; }
  pending.delete(id);
  if (error) p.reject(new Error(error)); else p.resolve(result);
};
function call(fn, args, onProgress) {
  return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, fn, args }); });
}
let busyN = 0;
function busy(delta, label = 'computing') { busyN += delta; const b = $('busy'); b.textContent = busyN > 0 ? label : 'idle'; b.classList.toggle('busy', busyN > 0); }

// ------------------------------------------------------------------ controls
const GROUPS = { hull: 'Hull (your boat)', keel: 'Keel', bulb: 'Bulb', fin: 'Fin', rudder: 'Rudder', rig: 'Rig', env: 'Sailing' };
const ctlRefs = [];
function fmtVal(v, scale, unit) { const x = v * scale; return unit === '°' || unit === '' ? (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(1)) : x.toFixed(unit === '%' || unit === '% L' ? 1 : 0); }
function buildControls() {
  const root = $('controls');
  root.innerHTML = '';
  const groups = {};
  for (const g of Object.keys(GROUPS)) {
    const div = document.createElement('div'); div.className = 'group';
    div.innerHTML = `<h4>${GROUPS[g]}</h4>`;
    div.querySelector('h4').onclick = () => div.classList.toggle('collapsed');
    root.appendChild(div); groups[g] = div;
  }
  for (const [g, k, label, min, max, step, unit, scale] of PARAMS) {
    const row = document.createElement('div'); row.className = 'ctl';
    row.innerHTML = `<label title="${label}">${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    const sync = () => { const v = state.design[g][k]; const val = v ?? (g === 'bulb' && k === 'xOffset' ? currentStatics().xOffsetLevel : min); inp.value = val; out.textContent = `${fmtVal(val, scale, unit)}${unit && unit !== '°' ? '' : unit}`; out.title = unit; inp.disabled = g === 'bulb' && k === 'xOffset' && state.design.bulb.xOffset == null; };
    inp.oninput = () => { state.design[g][k] = +inp.value; sync(); onDesignChange(); };
    groups[g].appendChild(row); ctlRefs.push(sync);
  }
  const sel = (g, label, options, get, set) => {
    const row = document.createElement('div'); row.className = 'ctl';
    row.innerHTML = `<label>${label}</label><select>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const s = row.querySelector('select');
    s.onchange = () => { set(s.value); onDesignChange(); };
    groups[g].appendChild(row); ctlRefs.push(() => { s.value = get(); });
  };
  sel('fin', 'Fin section', SECTIONS.map((s) => [s, SECTION_LABELS[s]]), () => state.design.fin.section, (v) => { state.design.fin.section = v; });
  sel('rudder', 'Rudder section', SECTIONS.map((s) => [s, SECTION_LABELS[s]]), () => state.design.rudder.section, (v) => { state.design.rudder.section = v; });
  sel('rig', 'Rig per band', [['auto', 'auto (best VMG)'], ['A', 'A only'], ['B', 'B only'], ['C', 'C only']], () => state.design.rig.choice, (v) => { state.design.rig.choice = v; });
  sel('env', 'Hull residuary', [['orc', 'ORC surfaces'], ['orc+9', 'ORC +9 % (Laser tank)'], ['delft', 'own Delft-series fit']], () => state.design.model.residuary, (v) => { state.design.model.residuary = v; });
  sel('env', 'Hull transition Re', [['1e5', '1e5 (early)'], ['2e5', '2e5 (default)'], ['5e5', '5e5'], ['1e6', '1e6 (late)']], () => String(state.design.model.hullTransitionRe).replace('00000', 'e5').replace('1000000', '1e6'), (v) => { state.design.model.hullTransitionRe = +v; });
  // bulb level-trim toggle
  const lv = document.createElement('div'); lv.className = 'ctl';
  lv.innerHTML = '<label>Float level</label><span><input type="checkbox" id="levelTrim"> auto bulb fore-aft</span><span></span>';
  groups.bulb.appendChild(lv);
  const cb = lv.querySelector('input');
  cb.onchange = () => { state.design.bulb.xOffset = cb.checked ? null : currentStatics().xOffsetLevel; onDesignChange(); };
  ctlRefs.push(() => { cb.checked = state.design.bulb.xOffset == null; });
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = 'Bulb mass is not an input: it is the keel mass (≤ 2500 g, C.6.4) minus the fin. Fin span follows from the draft, hull depth and bulb height.';
  groups.bulb.appendChild(note);
  syncControls();
}
function syncControls() { for (const f of ctlRefs) f(); }

// ------------------------------------------------------------------ presets
function presets() {
  const list = [['Baseline', DEFAULT_DESIGN]];
  for (const [k, lab] of [['all', 'Optimised all-round'], ['4', 'Opt 4 kn'], ['8', 'Opt 8 kn'], ['12', 'Opt 12 kn'], ['16', 'Opt 16 kn']]) { const r = res(`opt-${k}`); if (r?.best?.design) list.push([lab, r.best.design]); }
  const root = $('presets'); root.innerHTML = '';
  list.forEach(([lab, d], i) => {
    const b = document.createElement('button'); b.textContent = lab; if (i === 0) b.classList.add('on');
    b.onclick = () => { root.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); state.design = clone(d); syncControls(); onDesignChange(); };
    root.appendChild(b);
  });
}

// ------------------------------------------------------------------ geometry + rules (main thread, instant)
function rigForBand() { return state.results?.bands?.[state.band]?.rig || (state.design.rig.choice === 'auto' ? ['A', 'A', 'B', 'C'][state.band] : state.design.rig.choice); }
function currentStatics(rig = 'A') { return computeStatics(state.design, rig); }
let scene = null;
function updateGeometry() {
  const s = currentStatics(rigForBand());
  const b = state.results?.bands?.[state.band];
  const heeled = $('heeled').checked && b;
  const heel = heeled ? b.up.heel : 0;
  scene?.setBoat(state.design, s, heeled ? { heel, rudder: b.up.rudder, sheet: 10 } : { sheet: 4 });
  if (state.view !== 'boat' && Math.abs(heel - (state.lastHeel ?? heel)) > 0.5) scene?.setView(state.view);
  state.lastHeel = heel;
  const sA = currentStatics('A');
  const rules = checkRules(state.design, sA);
  const extra = (state.results?.constraints || []).map((c) => ({ label: c.name, ok: false, value: '', kind: 'eng' }));
  $('badges').innerHTML = [...rules, ...extra].map((r) => `<div class="badge ${r.ok ? 'ok' : 'fail'} ${r.kind}"><i>${r.ok ? '✓' : r.kind === 'eng' ? '!' : '✗'}</i><span>${r.label}</span><span class="v">${r.value ?? ''}</span></div>`).join('')
    + (state.results && !extra.length ? '<div class="badge ok eng"><i>✓</i><span>Tack-exit fin lift and rudder balance OK</span><span class="v"></span></div>' : '');
  const mm = (x) => `${(x * 1000).toFixed(1)} mm`;
  $('keelTable').innerHTML = [
    ['Bulb mass', `${(sA.bulb.mass * 1000).toFixed(0)} g`], ['Bulb L × w × h', `${(sA.bulb.L * 1000).toFixed(0)} × ${(sA.bulb.w * 1000).toFixed(1)} × ${(sA.bulb.h * 1000).toFixed(1)} mm`],
    ['Fineness L/D', sA.bulb.fineness.toFixed(2)], ['Bulb wetted area', `${(sA.bulb.S * 1e4).toFixed(0)} cm²`],
    ['Bulb CG vs fin ¼c', `${mm(sA.xOffset)} ${sA.xOffset >= 0 ? 'fwd' : 'aft'}`],
    ['Fin span / area', `${(sA.fin.span * 1000).toFixed(0)} mm / ${(sA.fin.S * 1e4).toFixed(0)} cm²`], ['Fin mass', `${(sA.fin.mass * 1000).toFixed(0)} g`],
    ['Rudder area / mass', `${(sA.rudder.S * 1e4).toFixed(0)} cm² / ${(sA.mass.rudder * 1000).toFixed(0)} g`],
    ['Hull depth Tc / wetted', `${mm(sA.hull.Tc)} / ${(sA.hull.S * 1e4).toFixed(0)} cm²`], ['Correctors', `${(sA.mass.corrector * 1000).toFixed(0)} g`],
  ].map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('');
  $('stabTable').innerHTML = [
    ['VCG (below WL)', mm(-sA.zG)], ['VCB (below WL)', mm(-sA.zB)], ['BM', mm(sA.BM)], ['GM', mm(sA.GM)],
    ['GZ at 40°', mm(sA.gz40)], ['RM at 30°', `${sA.RM(30).toFixed(2)} N·m`], ['Static trim', `${(sA.trim * 57.3).toFixed(2)}°`],
  ].map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('');
}

// ------------------------------------------------------------------ evaluation
let evalTimer = null, evalSeq = 0;
function onDesignChange() {
  syncControls();
  updateGeometry();
  clearTimeout(evalTimer);
  evalTimer = setTimeout(runEval, 220);
}
async function runEval() {
  const seq = ++evalSeq;
  busy(1, 'VPP…');
  try {
    const r = await call('evaluate', [state.design]);
    if (seq !== evalSeq) return;
    state.results = r;
    window.__iom.evalDone = true;
    updateGeometry(); redrawAll();
  } catch (e) { console.error(e); } finally { busy(-1); }
}

// ------------------------------------------------------------------ drawing
const fmt = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : '–');
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)} %`;
function drawHud() {
  const r = state.results; if (!r) return;
  const b = r.bands[state.band];
  $('hud').innerHTML = [
    [`${b.tws} kn · rig ${b.rig}`, 'true wind @1.5 m'], [`${fmt(b.up.V, 2)} m/s`, `upwind @ ${b.up.twa.toFixed(0)}°`], [fmt(b.up.vmg, 3), 'VMG up m/s'],
    [`${b.up.heel.toFixed(0)}°`, 'heel'], [`${b.up.leeway.toFixed(1)}°`, 'leeway'], [fmt(b.down.vmg, 3), 'VMG down m/s'],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}
function drawPerf() {
  const r = state.results; if (!r) return;
  polarChart($('polar'), r.bands.map((b, i) => ({ label: `${b.tws} kn (${b.rig})`, color: bandColor(i), pts: b.polar.map((p) => ({ twa: p.twa, v: p.V, note: `heel ${p.heel.toFixed(0)}°` })), vmg: [{ twa: b.up.twa, v: b.up.V, note: 'best VMG up' }, { twa: b.down.twa, v: b.down.V, note: 'best VMG down' }] })), { heading: 'Boat speed polar (m/s)' });
  const tws = r.bands.map((b) => b.tws);
  const series = [
    { label: 'VMG up', short: 'up', color: css('--s1'), x: tws, y: r.bands.map((b) => b.up.vmg), marker: true },
    { label: 'VMG down', short: 'down', color: css('--s2'), x: tws, y: r.bands.map((b) => b.down.vmg), marker: true },
  ];
  if (state.baseline) {
    series.push({ label: 'baseline up', short: 'base', color: css('--s1'), x: tws, y: state.baseline.bands.map((b) => b.up.vmg), dash: [4, 4], width: 1.5 });
    series.push({ label: 'baseline down', short: 'base', color: css('--s2'), x: tws, y: state.baseline.bands.map((b) => b.down.vmg), dash: [4, 4], width: 1.5 });
  }
  lineChart($('vmgChart'), { series, xlabel: 'true wind at 1.5 m (kn)', ylabel: 'VMG (m/s)', heading: 'VMG per wind band', fmtX: (v) => v.toFixed(0), directLabels: false });
  const base = state.baseline;
  $('bandTable').innerHTML = `<table class="data"><tr><th>band</th><th>rig</th><th>TWA↑</th><th>V↑</th><th>VMG↑</th><th>heel</th><th>lee</th><th>rud</th><th>c<sub>l</sub> fin</th><th>TWA↓</th><th>V↓</th><th>VMG↓</th><th>Δ vs base</th></tr>${r.bands.map((b, i) => {
    const d = base ? 0.5 * (b.up.vmg / base.bands[i].up.vmg + b.down.vmg / base.bands[i].down.vmg) - 1 : 0;
    return `<tr${i === state.band ? ' style="font-weight:600"' : ''}><td>${b.tws} kn</td><td>${b.rig}</td><td>${b.up.twa.toFixed(0)}°</td><td>${fmt(b.up.V)}</td><td>${fmt(b.up.vmg)}</td><td>${b.up.heel.toFixed(0)}°</td><td>${b.up.leeway.toFixed(1)}°</td><td>${b.up.rudder.toFixed(1)}°</td><td>${b.up.clF.toFixed(2)}</td><td>${b.down.twa.toFixed(0)}°</td><td>${fmt(b.down.V)}</td><td>${fmt(b.down.vmg)}</td><td class="${d >= 0 ? 'pos' : 'neg'}">${pct(d)}</td></tr>`;
  }).join('')}</table><p class="note">Speeds in m/s (1 kn = 0.514 m/s). TWS is the true wind 1.5 m above the water; the sails see a log-profile wind (Charnock roughness). c<sub>l</sub> fin at the upwind VMG point; tack-exit check needs it ≤ ~0.37–0.42.</p>`;
}
function drawRes() {
  const r = state.results; if (!r) return;
  const sel = $('resCond');
  if (!sel.options.length) { r.bands.forEach((b, i) => { for (const w of ['up', 'down']) { const o = document.createElement('option'); o.value = `${i}:${w}`; o.textContent = `${b.tws} kn ${w === 'up' ? 'upwind' : 'downwind'}`; sel.appendChild(o); } }); sel.value = `${state.band}:up`; sel.onchange = drawRes; }
  const [i, w] = sel.value.split(':'); const p = r.bands[+i][w];
  const R = p.R;
  barList($('resBars'), [
    { label: 'hull friction', value: R.hullF, note: `Re ${(p.V * 0.7 * state.design.hull.lwl / 1.14e-6).toExponential(1)}` },
    { label: 'hull residuary', value: R.hullR, note: `Fn ${p.fn.toFixed(2)}` },
    { label: 'fin profile', value: R.fin, note: `chord Re ${p.reF.toExponential(1)}` },
    { label: 'induced', value: R.induced }, { label: 'bulb', value: R.bulb, note: `Re_L ${p.reBulb.toExponential(1)}` },
    { label: 'rudder', value: R.rudder }, { label: 'junctions', value: R.junction },
  ], { heading: `Resistance at ${p.V.toFixed(2)} m/s, heel ${p.heel.toFixed(0)}° — total ${R.total.toFixed(3)} N`, unit: 'N' });
  const V = r.upright.map((u) => u.V);
  lineChart($('resCurve'), { heading: 'Upright resistance vs speed (appendages at zero lift)', xlabel: 'boat speed (m/s)', ylabel: 'N', fmtX: (v) => v.toFixed(1), series: [
    { label: 'hull friction', short: 'friction', color: css('--s1'), x: V, y: r.upright.map((u) => u.hullF) },
    { label: 'residuary', short: 'residuary', color: css('--s2'), x: V, y: r.upright.map((u) => u.hullR) },
    { label: 'appendages', short: 'appendages', color: css('--s3'), x: V, y: r.upright.map((u) => u.fin + u.rudder + u.bulb + u.junction) },
    { label: 'total', short: 'total', color: css('--s4'), x: V, y: r.upright.map((u) => u.total) },
  ] });
}
function drawStab() {
  const r = state.results; if (!r) return;
  const st = r.statics;
  const phi = st.gz.map((g) => g.phi);
  const series = ['A', 'B', 'C'].map((k, i) => { const GM = r.staticsByRig[k].GM; return { label: `rig ${k}`, short: k, color: bandColor(i), x: phi, y: phi.map((p) => GM * Math.sin(p * Math.PI / 180) * 1000) }; });
  lineChart($('gzChart'), { series, heading: 'Righting arm GZ = GM sin φ (metacentre fixed; Gilbert & Bantock)', xlabel: 'heel (deg)', ylabel: 'GZ (mm)', fmtX: (v) => v.toFixed(0), fmtY: (v) => v.toFixed(0), hline: { y: 115 + 0.5 * (state.design.hull.bwl * 1000 - 135), label: 'Bantock Hydromax GZ(40°) for this BWL' } });
  barList($('massBars'), st.mass.items.map((it) => ({ label: it.name, value: it.m * 1000, note: `CG ${(it.z * 1000).toFixed(0)} mm ${it.z >= 0 ? 'above' : 'below'} WL` })), { heading: `Mass budget — total ${(st.mass.total * 1000).toFixed(0)} g, VCG ${(-st.zG * 1000).toFixed(0)} mm below WL`, unit: 'g', fmt: (v) => v.toFixed(0) });
}

function bulbData() { return state.bulbGrid || res('bulb-study'); }
function drawBulb() {
  const B = bulbData(); if (!B) return;
  const bSel = $('bsBand'), vSel = $('bsVariant');
  if (!bSel.options.length) {
    bSel.innerHTML = '<option value="mean">mean of bands</option>' + B.bands.map((t, i) => `<option value="${i}">${t} kn</option>`).join('');
    vSel.innerHTML = Object.entries(B.variants).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    bSel.value = String(state.band); bSel.onchange = drawBulb; vSel.onchange = drawBulb;
  }
  const bi = bSel.value, variant = vSel.value;
  const val = (row) => (bi === 'mean' ? row.bands.reduce((s, b) => s + b.dMean, 0) / row.bands.length : row.bands[+bi].dMean) * 100;
  const fins = B.fineness, asps = B.aspect;
  const rows = B.results.filter((r) => r.variant === variant);
  if (!rows.length) return;
  const values = asps.map((a) => fins.map((f) => { const r = rows.find((x) => x.fineness === f && Math.abs(x.aspect - a) < 1e-6); return r ? val(r) : NaN; }));
  let best = [0, 0], bv = -1e9; values.forEach((row, j) => row.forEach((v, i) => { if (v > bv) { bv = v; best = [i, j]; } }));
  const s = currentStatics('A');
  const mi = fins.reduce((k, f, i) => (Math.abs(f - s.bulb.fineness) < Math.abs(fins[k] - s.bulb.fineness) ? i : k), 0);
  const mj = asps.reduce((k, a, j) => (Math.abs(a - state.design.bulb.aspect) < Math.abs(asps[k] - state.design.bulb.aspect) ? j : k), 0);
  heatmap($('bulbHeat'), { values, xs: fins, ys: asps.map((a) => a.toFixed(1)), xlabel: 'fineness L/D', ylabel: 'width / height', unit: '%', heading: `ΔVMG vs baseline bulb, fixed ${(B.base?.keelMass ?? 2.5) * 1000} g keel`, best, marker: [mi, mj], clip: true });
  const std = (B.results.filter((r) => r.variant === 'standard' && Math.abs(r.aspect - 1) < 1e-6)).sort((a, b) => a.fineness - b.fineness);
  const pick = (r, key) => (bi === 'mean' ? r.bands.reduce((s, b) => s + (b[key] ?? NaN), 0) / r.bands.length : r.bands[+bi][key]) * 100;
  if (std.length && std[0].bands[0].stab !== undefined) {
    lineChart($('bulbDecomp'), { heading: 'Split of ΔVMG (%)', xlabel: 'fineness L/D', ylabel: 'ΔVMG %', zeroLine: true, fmtX: (v) => v.toFixed(0), series: [
      { label: 'total', color: css('--s1'), x: std.map((r) => r.fineness), y: std.map((r) => pick(r, 'dMean')) },
      { label: 'stability (VCG)', short: 'stability', color: css('--s2'), x: std.map((r) => r.fineness), y: std.map((r) => pick(r, 'stab')) },
      { label: 'bulb drag + end plate', short: 'bulb hydro', color: css('--s3'), x: std.map((r) => r.fineness), y: std.map((r) => pick(r, 'bulbHydro')) },
      { label: 'fin span & rest', short: 'rest', color: css('--s4'), x: std.map((r) => r.fineness), y: std.map((r) => pick(r, 'rest')) },
    ] });
  }
  const vars = Object.keys(B.variants);
  lineChart($('bulbVariants'), { heading: 'Nose / tail shape (ΔVMG %)', xlabel: 'fineness L/D', ylabel: 'ΔVMG %', zeroLine: true, fmtX: (v) => v.toFixed(0), series: vars.map((v, k) => {
    const rr = B.results.filter((r) => r.variant === v && Math.abs(r.aspect - 1) < 1e-6).sort((a, b) => a.fineness - b.fineness);
    return { label: B.variants[v].label, short: v, color: bandColor(k), x: rr.map((r) => r.fineness), y: rr.map((r) => val(r)) };
  }) });
}

function drawOpt() {
  const o = state.opt || optFromFile();
  if (!o) { scatter($('pareto'), [], { xlabel: '', ylabel: '' }); return; }
  const bestY = o.hist.map((h) => h.best * 100 - 100);
  const floor = Math.min(0, ...bestY) - 1.5;
  lineChart($('optHist'), { heading: `CMA-ES progress${o.label ? ` — ${o.label}` : ''}`, xlabel: 'generation', ylabel: 'score − 1 (%), penalised', fmtX: (v) => v.toFixed(0), series: [
    { label: 'best so far', short: 'best', color: css('--s1'), x: o.hist.map((h) => h.gen), y: bestY },
    { label: 'population mean (clipped)', short: 'mean', color: css('--s2'), x: o.hist.map((h) => h.gen), y: o.hist.map((h) => Math.max(floor, h.mean * 100 - 100)) },
  ], zeroLine: true });
  const pts = (o.cloud || []).map((c) => ({ x: c.wet * 1e4, y: c.rm30, color: css('--s3'), alpha: 0.35, r: 3, tip: `wetted ${(c.wet * 1e4).toFixed(0)} cm²<br>RM30 ${c.rm30.toFixed(2)} N·m<br>score ${((c.score - 1) * 100).toFixed(2)} %` }));
  const front = (o.front || []).map((f) => ({ x: f.wet * 1e4, y: f.rm30 })).sort((a, b) => a.x - b.x);
  const s0 = computeStatics(DEFAULT_DESIGN, 'A');
  pts.push({ x: (s0.fin.wet + s0.bulb.S + s0.rudder.wet) * 1e4, y: s0.RM(30), color: css('--s2'), r: 5, label: 'baseline', alpha: 1 });
  if (o.design) { const s1 = computeStatics(o.design, 'A'); pts.push({ x: (s1.fin.wet + s1.bulb.S + s1.rudder.wet) * 1e4, y: s1.RM(30), color: css('--s1'), r: 5, label: 'best', alpha: 1 }); }
  scatter($('pareto'), pts, { heading: 'Stability vs wetted area (dashed: Pareto front)', xlabel: 'fin + bulb + rudder wetted area (cm²)', ylabel: 'righting moment at 30° (N·m)', fmtX: (v) => v.toFixed(0), front });
  if (o.vars) {
    const x0 = VARS.map(([p]) => p);
    $('optVars').innerHTML = `<table class="data"><tr><th>variable</th><th>optimum</th></tr>${o.vars.map((v) => `<tr><td>${v.name}</td><td>${v.path === 'fin.section' ? SECTIONS[Math.floor(v.value)] : (v.value * v.scale).toFixed(v.scale > 10 ? 1 : 2)}</td></tr>`).join('')}</table><p class="note">${o.gain !== undefined ? `Gain ${pct(o.gain)} (weighted VMG). ` : ''}${x0.length} variables; hard limits: rules + fin stiffness, tack-exit lift, rudder balance and ≥ 85 cm² rudder.</p>`;
  }
}
function optFromFile() {
  const t = $('optTarget').value;
  const key = t === 'all' ? 'all' : String(DEFAULT_DESIGN.env.bands[+t]);
  const r = res(`opt-${key}`); if (!r) return null;
  const run = r.runs?.[0];
  return { label: `CLI, ${key}${key === 'all' ? '' : ' kn'}, best of ${r.runs.length}`, hist: run?.hist || [], cloud: r.cloud || [], front: r.front || [], vars: r.best.vars, design: r.best.design, gain: run?.gain };
}

function redrawAll() { drawHud(); drawPerf(); drawRes(); drawStab(); drawBulb(); drawOpt(); }

// ------------------------------------------------------------------ bulb grid + optimiser in the worker
$('bsRun').onclick = async () => {
  const B = res('bulb-study');
  const fins = [4, 5, 6, 7, 8, 9, 10, 11, 12], asps = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
  const variant = $('bsVariant').value || 'standard';
  busy(1, 'bulb grid…');
  try {
    const r = await call('bulbGrid', [state.design, variant, fins, asps], (p) => { $('bsProg').firstElementChild.style.width = `${p * 100}%`; });
    state.bulbGrid = { bands: state.design.env.bands, fineness: fins, aspect: asps, variants: B?.variants || { [variant]: { label: variant } }, results: r.results, base: { keelMass: state.design.keel.mass } };
    drawBulb();
  } finally { busy(-1); }
};
let optResult = null;
$('optTarget').onchange = () => { state.opt = null; drawOpt(); };
$('optRun').onclick = async () => {
  const t = $('optTarget').value;
  const weights = t === 'all' ? [1, 1, 1, 1] : [0, 1, 2, 3].map((i) => (String(i) === t ? 1 : 0));
  const gens = +$('optGens').value, lambda = +$('optLambda').value, seed = +$('optSeed').value;
  const template = clone(state.design);
  state.opt = { label: 'live run', hist: [], cloud: [], front: [] };
  window.__iom.optDone = false;
  busy(1, 'CMA-ES…'); $('optRun').disabled = true;
  try {
    const r = await call('optimise', [{ template, weights, gens, lambda, seed, n: 7 }], (p, extra) => {
      $('optProg').firstElementChild.style.width = `${p * 100}%`;
      if (extra.gen) { state.opt.hist.push({ ...extra.gen, bestRaw: extra.bestRaw }); drawOpt(); }
    });
    optResult = r;
    state.opt = { label: `live run (${gens}×${lambda}, seed ${seed})`, hist: state.opt.hist, cloud: r.cloud, front: r.front, vars: r.vars, design: r.design, gain: r.bestRaw - 1 };
    $('optApply').disabled = false;
    drawOpt();
  } catch (e) { console.error(e); } finally { busy(-1); $('optRun').disabled = false; window.__iom.optDone = true; }
};
$('optApply').onclick = () => { if (!optResult) return; state.design = clone(optResult.design); syncControls(); onDesignChange(); };

// ------------------------------------------------------------------ export polar
$('exportPolar').onclick = () => {
  const r = state.results; if (!r) return;
  const mk = (b) => ({ tws: +(b.tws * KNOT).toFixed(4), tws_kn: b.tws, zRef_m: state.design.env.zRef, rig: b.rig, points: b.polar.map((p) => ({ twa: p.twa, speed: +p.V.toFixed(4) })), vmg: { up: { twa: +b.up.twa.toFixed(1), speed: +b.up.V.toFixed(4), vmg: +b.up.vmg.toFixed(4) }, down: { twa: +b.down.twa.toFixed(1), speed: +b.down.V.toFixed(4), vmg: +b.down.vmg.toFixed(4) } } });
  const sel = r.bands[state.band];
  const doc = { format: 'iom-polar v1', source: 'IOM Keel Lab VPP', design: state.design.name, units: { tws: 'm/s', speed: 'm/s', twa: 'deg' }, ...mk(sel), bands: r.bands.map(mk) };
  showExport(`Polar, ${sel.tws} kn (paste into Log analysis → Model overlay → polar table)`, `iom-polar-${sel.tws}kn.json`, JSON.stringify(doc, null, 1), 'application/json');
};

// ------------------------------------------------------------------ tabs, views, bands
function tab(name) {
  document.querySelectorAll('#dockTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('on', p.id === `tab-${name}`));
  requestAnimationFrame(redrawAll);
}
document.querySelectorAll('#dockTabs button').forEach((b) => { b.onclick = () => tab(b.dataset.tab); });
function setView(v) {
  state.view = v;
  document.querySelectorAll('.viewbar [data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
  scene?.setView(v);
}
document.querySelectorAll('.viewbar [data-view]').forEach((b) => { b.onclick = () => setView(b.dataset.view); });
$('heeled').onchange = updateGeometry;
function buildBandButtons() {
  const vb = document.querySelector('.viewbar');
  const span = document.createElement('span'); span.style.marginLeft = '8px'; span.textContent = 'Band ';
  vb.appendChild(span);
  DEFAULT_DESIGN.env.bands.forEach((t, i) => {
    const b = document.createElement('button'); b.textContent = `${t} kn`; b.dataset.band = i; if (i === state.band) b.classList.add('on');
    b.onclick = () => selectBand(i); vb.appendChild(b);
  });
}
function selectBand(i) {
  state.band = i;
  document.querySelectorAll('.viewbar [data-band]').forEach((x) => x.classList.toggle('on', +x.dataset.band === i));
  const rs = $('resCond'); if (rs.options.length) rs.value = `${i}:up`;
  const bs = $('bsBand'); if (bs.options.length) bs.value = String(i);
  updateGeometry(); redrawAll();
}

$('notes').innerHTML = `
<h4>What the model does</h4>
<p>Statics: bulb mass = keel (≤ 2500 g) − fin; lead volume at 11.34 g/cm³ sets the bulb height for a given length, fullness and width/height; the bulb sits in the lowest 60 mm (E.4.1). VCG from the mass budget, B from canoe body (Morrish) + appendages, BM = I<sub>T</sub>/∇, GZ = GM sin φ.</p>
<p>Resistance: ITTC-57 friction with a laminar forebody (transition Re is an input), ORC residuary surfaces (Delft series based), heel increment, bow-down trim from the sail pitching moment; fin and rudder from measured low-Re SD8020 polars (UIUC); bulb = transitional friction × Hoerner form factor + a low-Re afterbody separation term calibrated on the Gilbert &amp; Bantock bulb tow tests; Hoerner junction drag; induced drag of fin + rudder (+hull) with a bulb end-plate factor.</p>
<p>Sails: Hazen/ORC-shaped coefficients scaled to the Southampton IOM A-rig tunnel data, log-profile wind gradient, windage. VPP balances drive, heel, side force and yaw; depowers above the heel limit and to stay below the nosedive trim.</p>
<h4>Honest uncertainty</h4>
<p>No published IOM GPS polar was found; speeds are checked against hull speed, Froude-scaled Marblehead timings and tunnel forces only. Low-Re transition on the hull and bulb is the biggest unknown — see the sensitivity study. Full write-up: <code>docs/IOM_LAB.md</code>; sources: <code>docs/research/IOM_RESEARCH.md</code>.</p>`;

// ------------------------------------------------------------------ boot
buildControls();
presets();
buildBandButtons();
try { scene = new IomScene().init($('viewport')); } catch (e) { console.error('3D view unavailable', e); }
updateGeometry();
window.__iom.tab = tab; window.__iom.selectBand = selectBand; window.__iom.setView = setView;
window.__iom.state = state;
(async () => {
  busy(1, 'baseline…');
  try { state.baseline = await call('evaluate', [DEFAULT_DESIGN]); } finally { busy(-1); }
  await runEval();
  window.__iom.ready = true;
})();
window.addEventListener('resize', () => requestAnimationFrame(redrawAll));
