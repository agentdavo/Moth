// Moth Foil Lab: application controller.
import { PRESETS, WIND_BANDS, DESIGN_VARS, cloneDesign, encode, decode, getPath } from './physics/design.js';
import { planformStats, tcAt } from './physics/geometry.js';
import { liftSlope2D, reynolds, FAMILIES } from './physics/sections.js';
import { KNOT, DEG } from './physics/constants.js';
import { SepCMAES, paretoInsert } from './physics/optimizer.js';
import { buildControls } from './ui/controls.js';
import { lineChart, barList, polarChart, scatter, heatmap } from './ui/charts.js';
import { renderDecisions } from './ui/decisions.js';
import { MothScene } from './render/scene.js';
import { LBMSolver } from './gpu/lbm.js';
import { GPUSweep, levelFlightDrag, cpuSolve } from './gpu/sweep.js';

const $ = (id) => document.getElementById(id);
const BANDS = Object.entries(WIND_BANDS);

// ---------------------------------------------------------------- workers
class Pool {
  constructor(n) {
    this.workers = Array.from({ length: n }, () => new Worker(new URL('./workers/physics.worker.js', import.meta.url), { type: 'module' }));
    this.free = [...this.workers];
    this.queue = [];
    this.pending = new Map();
    this.seq = 0;
    for (const w of this.workers) w.onmessage = (e) => this.done(w, e.data);
  }
  run(fn, args) { return new Promise((res, rej) => { this.queue.push({ fn, args, res, rej }); this.pump(); }); }
  pump() {
    while (this.free.length && this.queue.length) {
      const w = this.free.pop(); const job = this.queue.shift(); const id = ++this.seq;
      this.pending.set(id, job); w.postMessage({ id, fn: job.fn, args: job.args });
    }
  }
  done(w, { id, result, error }) {
    const job = this.pending.get(id); this.pending.delete(id); this.free.push(w);
    if (error) job.rej(new Error(error)); else job.res(result);
    this.pump();
  }
}
// "latest wins" channel on a dedicated worker for interactive requests
class Channel {
  constructor() { this.w = new Worker(new URL('./workers/physics.worker.js', import.meta.url), { type: 'module' }); this.seq = 0; this.cbs = new Map(); this.w.onmessage = (e) => { const cb = this.cbs.get(e.data.id); this.cbs.delete(e.data.id); cb && cb(e.data); }; }
  call(fn, args) { const id = ++this.seq; return new Promise((res, rej) => { this.cbs.set(id, (d) => (d.error ? rej(new Error(d.error)) : res(d.result))); this.w.postMessage({ id, fn, args }); }); }
}

const cores = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const detailCh = new Channel();
const evalCh = new Channel();
const pool = new Pool(cores);
$('optWorkers').textContent = `${cores} web workers`;

// ---------------------------------------------------------------- state
const state = {
  design: cloneDesign(PRESETS.medium),
  cond: { tws: 11, twa: 45, heel: 17 },
  colorMode: 'load',
  detail: null, evalRes: null, polars: null,
  optBest: null,
};
window.__moth = { state, ready: false, evalDone: false };

let busy = 0;
const setBusy = (d) => { busy += d; const b = $('busy'); b.textContent = busy > 0 ? 'solving…' : 'idle'; b.className = `pill ${busy > 0 ? 'busy' : 'dim'}`; };

// ---------------------------------------------------------------- scene
const scene = new MothScene();
await scene.init($('viewport'));
scene.showForces = true;
$('backend').textContent = scene.isWebGPU ? 'WebGPU ✓' : 'WebGL2 fallback';
$('backend').className = `pill ${scene.isWebGPU ? 'ok' : 'warn'}`;

// ---------------------------------------------------------------- controls & presets
const refreshControls = buildControls($('controls'), () => state, (path) => onEdit(path));
refreshControls();
const presetBar = $('presets');
const presetButtons = {};
for (const [k, d] of Object.entries(PRESETS)) {
  const b = document.createElement('button'); b.textContent = d.name; b.onclick = () => loadDesign(cloneDesign(d), k);
  presetBar.appendChild(b); presetButtons[k] = b;
}
function loadDesign(d, key) {
  state.design = d;
  for (const [k, b] of Object.entries(presetButtons)) b.classList.toggle('on', k === key);
  if (key && WIND_BANDS[key]) { const band = WIND_BANDS[key]; state.cond.tws = band.tws; state.cond.heel = band.heelUp; state.cond.twa = 45; }
  refreshControls(); onEdit('*');
}
presetButtons.medium.classList.add('on');

let tDetail = 0, tEval = 0;
function onEdit(path) {
  updateDerived();
  clearTimeout(tDetail); tDetail = setTimeout(requestDetail, 60);
  if (!path.startsWith('cond.')) { clearTimeout(tEval); tEval = setTimeout(requestEval, 450); }
}

function updateDerived() {
  const m = planformStats(state.design.main), e = planformStats(state.design.elevator);
  const dm = document.querySelector('[data-derived="Main foil"]');
  const de = document.querySelector('[data-derived="Rudder elevator"]');
  if (dm) dm.textContent = `S ${(m.area * 1e4).toFixed(0)} cm² · AR ${m.AR.toFixed(1)} · MAC ${(m.mac * 1000).toFixed(0)} mm · ${m.mass.toFixed(2)} kg`;
  if (de) de.textContent = `S ${(e.area * 1e4).toFixed(0)} cm² · AR ${e.AR.toFixed(1)} · S_r/S_m ${(e.area / m.area).toFixed(2)}`;
}

// ---------------------------------------------------------------- condition detail
let detailSeq = 0;
async function requestDetail() {
  const my = ++detailSeq; setBusy(1);
  try {
    const d = await detailCh.call('conditionDetail', [state.design, state.cond]);
    if (my !== detailSeq) return;
    state.detail = d;
    scene.setBoat(state.design, d, state.colorMode);
    renderDetail(d);
    window.__moth.ready = true;
  } catch (e) { console.error(e); } finally { setBusy(-1); }
}

function stat(label, value, unit = '') { return `<div><span>${label}</span><b>${value}<small> ${unit}</small></b></div>`; }
function renderDetail(d) {
  const hud = $('hud');
  const flags = [];
  if (!d.foiling) flags.push(`not foiling · displacement mode (take-off needs ${d.takeoffKn?.toFixed(1)} kn boat speed)`);
  if (d.rollLimited) flags.push('righting-moment limited → sail depowered');
  if (d.foiling && d.cavMin < 0.15) flags.push('cavitation risk');
  if (d.foiling && d.tipClear < 0) flags.push('leeward tip too close to the surface');
  if (d.foiling && d.ventMax > 1) flags.push('strut ventilation risk');
  hud.innerHTML = [
    ['boat speed', `${d.Vkn.toFixed(1)}`, 'kn'], ['VMG', `${Math.abs(d.vmg).toFixed(1)}`, 'kn'],
    ['flap', d.foiling ? `${d.flap.toFixed(1)}°` : '–'], ['rake', d.foiling ? `${d.elev.toFixed(1)}°` : '–'],
    ['leeway', d.foiling ? `${d.beta.toFixed(1)}°` : '–'], ['heel', `${d.heel.toFixed(0)}°`],
    ['AWA / AWS', d.foiling ? `${d.awa.toFixed(0)}° / ${d.aws.toFixed(0)}` : '–'], ['L/D hydro', d.foiling ? `${(d.lift.main + d.lift.elev) / d.drag.total > 0 ? ((d.lift.main + d.lift.elev) / d.drag.total).toFixed(1) : '–'}` : '–'],
  ].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('') + (flags.length ? `<div class="flag">⚠ ${flags.join(' · ')}</div>` : '');
  $('condTitle').textContent = `${state.cond.tws} kn TWS · TWA ${state.cond.twa}° · heel ${state.cond.heel}°`;
  if (!d.foiling) {
    $('condStats').innerHTML = stat('boat speed', d.Vkn.toFixed(1), 'kn') + stat('mode', 'hull') + stat('take-off', d.takeoffKn.toFixed(1), 'kn');
    barList($('dragBars'), [{ label: 'not foiling', value: 0, color: '#5f7282' }]);
    $('balance').innerHTML = ''; $('marginList').innerHTML = '<p class="note">No foiling equilibrium at this condition.</p>';
    return;
  }
  $('condStats').innerHTML = stat('boat speed', d.Vkn.toFixed(1), 'kn') + stat('VMG', Math.abs(d.vmg).toFixed(1), 'kn') + stat('limit', d.limit || '–') +
    stat('sail CL', d.sailCL.toFixed(2)) + stat('sailor x / y', `${d.sailorX.toFixed(2)}/${d.sailorY.toFixed(2)}`, 'm') + stat('foil depth', d.depth.toFixed(2), 'm');
  const dr = d.drag;
  barList($('dragBars'), [
    { label: 'profile (foils+struts)', value: dr.profile, color: '#3987e5' },
    { label: 'induced (+surface)', value: dr.induced, color: '#199e70' },
    { label: 'spray (struts)', value: dr.spray, color: '#d95926' },
    { label: 'junction', value: dr.junction, color: '#c98500' },
    { label: 'wave', value: dr.wave, color: '#9085e9' },
    { label: 'aero windage', value: d.windage, color: '#8a9aa8' },
  ]);
  const sl = d.spanLoad.slice().sort((a, b) => a.y - b.y);
  lineChart($('spanLoad'), {
    series: [{ label: 'VLM lift / span', color: '#3987e5', x: sl.map((s) => s.y * 1000), y: sl.map((s) => s.lp) }, { label: 'elliptic, same lift', color: '#9fb0c0', dash: [4, 4], x: sl.map((s) => s.y * 1000), y: sl.map((s) => s.ell) }],
    xlabel: 'span position y (mm, + = leeward)', ylabel: 'N/m', fmtX: (v) => v.toFixed(0), fmtY: (v) => v.toFixed(0),
  });
  $('balance').innerHTML = stat('main lift', d.lift.main.toFixed(0), 'N') + stat('elevator', d.lift.elev.toFixed(0), 'N') + stat('sail lift', d.lift.sailZ.toFixed(0), 'N') +
    stat('strut side', (d.side.mstrut + d.side.rstrut).toFixed(0), 'N') + stat('foil side', (d.side.main + d.side.elev).toFixed(0), 'N') + stat('sail drive', d.sailDrive.toFixed(0), 'N');
  const b = state.design.boat;
  const margins = [
    ['Cavitation σ + Cp_min', d.cavMin, 0, 1.0, (v) => v.toFixed(2)],
    ['Tip clearance', d.tipClear, 0, 0.3, (v) => `${(v * 1000).toFixed(0)} mm`],
    ['Stall margin 1 − cl/cl_max', 1 - d.stallMax, 0, 0.6, (v) => v.toFixed(2)],
    ['Strut ventilation 1 − α/α_v', 1 - d.ventMax, 0, 1, (v) => v.toFixed(2)],
    ['Flap to limit', Math.min(d.flap - b.flapMin, b.flapMax - d.flap), 0, 8, (v) => `${v.toFixed(1)}°`],
    ['Rake to limit', Math.min(d.elev - b.elevMin, b.elevMax - d.elev), 0, 4, (v) => `${v.toFixed(1)}°`],
  ];
  $('marginList').innerHTML = margins.map(([l, v, lo, hi, f]) => marginRow(l, v, lo, hi, f)).join('');
  renderRootPolar(d);
  updateLegend();
}

function marginRow(label, v, lo, hi, fmt) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const cls = v < lo ? 'bad' : t < 0.2 ? 'warn' : 'ok';
  const col = cls === 'bad' ? '#e5484d' : cls === 'warn' ? '#e0a100' : '#2bb673';
  const icon = cls === 'bad' ? '✕' : cls === 'warn' ? '!' : '✓';
  return `<div class="margin"><span>${label}</span><span class="bar"><i style="width:${Math.max(3, t * 100)}%;background:${col}"></i></span><span class="st ${cls}">${icon} ${fmt(v)}</span></div>`;
}

function updateLegend() {
  const lab = { load: ['0', 'cl/cl_max', '1 (stall)'], cav: ['≥1.2 safe', 'σ + Cp_min', '0 cavitating'], cp: ['0', '−Cp_min', '0.9'] }[state.colorMode];
  $('legend').innerHTML = `${lab[0]} <i></i> ${lab[2]} <small>${lab[1]}</small>`;
}

async function renderRootPolar(d) {
  const m = state.design.main;
  const re = reynolds(d.V, m.rootChord);
  const p = await detailCh.call('sectionPolar', [{ family: m.family, tc: m.tcRoot, cli: m.cli }, re, d.flap, m.flapFrac]);
  lineChart($('rootPolar'), { series: [{ label: `drag polar, flap ${d.flap.toFixed(1)}°`, color: '#3987e5', x: p.map((q) => q.cl), y: p.map((q) => q.cd * 1e4) }], xlabel: 'section c_l', ylabel: 'c_d × 10⁴', fmtY: (v) => v.toFixed(0), legend: false });
}

// ---------------------------------------------------------------- band evaluation
let evalSeq = 0;
async function requestEval() {
  const my = ++evalSeq; setBusy(1);
  try {
    const [ev, pol] = await Promise.all([evalCh.call('evaluate', [state.design, 'allround']), evalCh.call('polars', [state.design])]);
    if (my !== evalSeq) return;
    state.evalRes = ev; state.polars = pol;
    renderEval(ev, pol);
    window.__moth.evalDone = true;
  } catch (e) { console.error(e); } finally { setBusy(-1); }
}

function renderEval(ev, pol) {
  const rows = BANDS.map(([k, band]) => {
    const r = ev.bands[k];
    const f = (v, foil) => `${v.toFixed(1)}${foil ? '' : '<small>ᴴ</small>'}`;
    return `<tr><td><span class="sw" style="background:${band.color}"></span>${band.label} ${band.tws} kn</td><td>${f(r.upV, r.upFoil)}</td><td>${r.upTWA.toFixed(0)}°</td><td>${r.upVMG.toFixed(1)}</td><td>${f(r.downV, r.downFoil)}</td><td>${r.downTWA.toFixed(0)}°</td><td>${r.downVMG.toFixed(1)}</td></tr>`;
  }).join('');
  $('bandTable').innerHTML = `<table class="bands"><tr><th>band</th><th>up kn</th><th>TWA</th><th>VMG</th><th>down kn</th><th>TWA</th><th>VMG</th></tr>${rows}</table>`;
  const pen = Object.keys(ev.penalties);
  $('evalNote').innerHTML = `Take-off ${ev.takeoffKn.toFixed(1)} kn boat speed · foils from ${ev.minTWSkn.toFixed(1)} kn TWS · V<sub>max</sub> ${ev.vmaxKn.toFixed(1)} kn · score ${ev.score.toFixed(3)}${pen.length ? ` · penalties: ${pen.join(', ')}` : ''}<br><small>ᴴ = not foiling (hull-borne)</small>`;
  polarChart($('polar'), BANDS.map(([k, b]) => ({ label: `${b.label} ${b.tws} kn`, color: b.color, pts: pol[k] })));
  const st = ev.structure;
  $('structList').innerHTML = [
    marginRow('Main tip deflection (≤ 4.5% b/2)', 0.045 - st.main.deflectionRatio, 0, 0.03, () => `${(st.main.tipDeflection * 1000).toFixed(0)} mm`),
    marginRow('Main root stress margin', st.main.stressMargin, 0, 2, (v) => `${(st.main.maxStress / 1e6).toFixed(0)} MPa`),
    marginRow('Divergence ≥ 1.3 V_max', ev.divergenceKn / (1.3 * Math.max(ev.vmaxKn, 1)) - 1, 0, 0.5, () => `${ev.divergenceKn.toFixed(0)} kn`),
    marginRow('Strut tip deflection', 0.06 - st.strut.tipDeflection, 0, 0.04, () => `${(st.strut.tipDeflection * 1000).toFixed(0)} mm`),
    marginRow('Heave/pitch damping ζ', ev.stability.minZeta, 0.1, 0.6, (v) => v.toFixed(2)),
  ].join('') + `<p class="note">Main foil mass ≈ ${ev.main.mass.toFixed(2)} kg (solid carbon) · top-speed cavitation margin ${ev.cavAtMax.toFixed(2)}</p>`;
}

// ---------------------------------------------------------------- tabs
function wireTabs(nav, prefix, cls) {
  nav.querySelectorAll('button').forEach((b) => b.onclick = () => {
    nav.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll(`.${cls}`).forEach((p) => p.classList.toggle('on', p.id === `${prefix}${b.dataset.tab}`));
    onTab(b.dataset.tab);
  });
}
wireTabs($('dockTabs'), 'tab-', 'tabpane');
wireTabs($('rightTabs'), 'r-', 'rpane');
let activeTab = 'cfd';
function onTab(t) {
  if (['cfd', 'sim', 'opt', 'sweep', 'decisions'].includes(t)) activeTab = t;
  if (t === 'loads' && state.detail) renderDetail(state.detail);
  if (t === 'margins' && state.detail) renderDetail(state.detail);
  if (t === 'perf' && state.evalRes) renderEval(state.evalRes, state.polars);
  if (t === 'opt') drawOpt();
  if (t === 'sweep') drawSweep();
  if (t === 'sim' && simResult) drawSim(simResult);
}
window.__moth.tab = (t) => document.querySelector(`[data-tab="${t}"]`)?.click();
renderDecisions($('decisions'));

$('colorMode').onchange = (e) => { state.colorMode = e.target.value; if (state.detail) scene.setBoat(state.design, state.detail, state.colorMode); updateLegend(); };
$('showFlow').onchange = (e) => { if (scene.flow) scene.flow.enabled = e.target.checked; };
$('showForces').onchange = (e) => { scene.showForces = e.target.checked; scene.setArrows(state.detail); };

// ---------------------------------------------------------------- LBM section CFD
let lbm = null;
function lbmSection() {
  const s = $('lbmSurface').value, d = state.design;
  if (s === 'elev') return { sec: { family: d.elevator.family, tc: d.elevator.tcRoot, cli: d.elevator.cli }, cf: 0 };
  if (s === 'mstrut') return { sec: { family: d.mainStrut.family, tc: d.mainStrut.tc, cli: 0 }, cf: 0 };
  return { sec: { family: d.main.family, tc: d.main.tcRoot, cli: d.main.cli }, cf: d.main.flapFrac };
}
function lbmApply(reset = false) {
  if (!lbm) return;
  const { sec, cf } = lbmSection();
  const a = +$('lbmAlpha').value, f = +$('lbmFlap').value;
  $('lbmAlphaOut').textContent = a; $('lbmFlapOut').textContent = f; $('lbmReOut').textContent = $('lbmRe').value;
  lbm.setRe(+$('lbmRe').value);
  lbm.setFoil(sec, a, cf, cf ? f : 0);
  if (reset) lbm.reset();
}
if (scene.device) {
  try {
    const c = $('lbmCanvas');
    lbm = new LBMSolver(scene.device, c, { nx: 480, ny: 192 });
    const swift = scene.software;
    lbm.stepsPerFrame = swift ? 6 : 16;
    lbmApply(true);
    for (const id of ['lbmAlpha', 'lbmFlap', 'lbmSurface']) $(id).oninput = () => lbmApply(false);
    $('lbmRe').oninput = () => lbmApply(false);
    $('lbmMode').onchange = (e) => lbm.setMode(+e.target.value);
    $('lbmReset').onclick = () => lbmApply(true);
    $('lbmFromTrim').onclick = () => {
      if (!state.detail?.foiling) return;
      $('lbmSurface').value = 'main';
      $('lbmAlpha').value = (state.design.main.incidence).toFixed(1);
      $('lbmFlap').value = state.detail.flap.toFixed(1);
      lbmApply(true);
    };
    let frame = 0;
    const loop = () => {
      if (activeTab === 'cfd') {
        lbm.step();
        if (++frame % 10 === 0) drawLBMStats();
      }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { console.error('LBM init failed', e); $('lbmReadout').textContent = `LBM unavailable: ${e.message}`; }
} else {
  $('lbmReadout').textContent = 'WebGPU not available: section CFD needs compute shaders.';
}
function drawLBMStats() {
  const avg = lbm.averaged();
  const { sec, cf } = lbmSection();
  const a = +$('lbmAlpha').value, f = cf ? +$('lbmFlap').value : 0;
  const a0 = liftSlope2D(sec.tc);
  const thin = 2 * Math.PI * (a * DEG + sec.cli / (2 * Math.PI)) + a0 * 0.66 * 0.7 * f * DEG;
  $('lbmReadout').textContent = `D2Q9 ${lbm.nx}×${lbm.ny}, chord ${lbm.chord} cells, τ=${lbm.tau.toFixed(4)} + Smagorinsky\nsteps ${lbm.t}\nCl (LBM, Re ${lbm.re}) ${avg.cl.toFixed(3)}\nCd (LBM)            ${avg.cd.toFixed(4)}\nCl thin-aerofoil    ${thin.toFixed(3)}\n${FAMILIES[sec.family]?.label || sec.family}, t/c ${(sec.tc * 100).toFixed(1)}%`;
  const h = lbm.hist;
  if (h.length > 2) lineChart($('lbmHist'), { series: [{ label: 'Cl', color: '#3987e5', x: h.map((p) => p.t), y: h.map((p) => p.cl) }], xlabel: 'LBM steps', ylabel: 'Cl', fmtX: (v) => `${(v / 1000).toFixed(0)}k`, legend: false });
}

// ---------------------------------------------------------------- flight simulation
let simResult = null;
for (const id of ['simV', 'simG', 'simHs', 'simTp']) $(id).oninput = () => { $(`${id}Out`).textContent = $(id).value; };
$('simRun').onclick = runSim;
$('simSweep').onclick = async () => {
  setBusy(1);
  try {
    const sw = await evalCh.call('gearingSweep', [state.design, +$('simV').value, +$('simHs').value]);
    lineChart($('simSweepChart'), { series: [{ label: 'damping ζ', color: '#3987e5', x: sw.map((s) => s.g), y: sw.map((s) => s.zeta), marker: true }], xlabel: 'wand gearing (flap° per wand°)', ylabel: 'least-damped ζ', hline: { y: 0.15, label: 'ζ = 0.15 porpoising threshold', color: '#e0a100' }, legend: false });
  } finally { setBusy(-1); }
};
async function runSim() {
  setBusy(1);
  try {
    simResult = await evalCh.call('flightSim', [state.design, { speedKn: +$('simV').value, gearing: +$('simG').value, hs: +$('simHs').value, tp: +$('simTp').value, heading: +$('simHead').value, T: 16 }]);
    drawSim(simResult);
  } catch (e) { $('simReadout').textContent = `trim failed at this speed: ${e.message.split('\n')[0]}`; } finally { setBusy(-1); }
}
function drawSim(r) {
  const s = r.series, m = r.metrics, st = r.stability;
  const ride0 = state.design.boat.rideHeight;
  lineChart($('simRide'), { series: [{ label: 'ride height (keel)', color: '#3987e5', x: s.t, y: s.ride }, { label: 'wave at main foil', color: '#5f7282', x: s.t, y: s.eta.map((v) => v + ride0 - 0.5) }], xlabel: '', ylabel: 'm', hline: { y: ride0, label: 'set point' } });
  lineChart($('simPitch'), { series: [{ label: 'pitch', color: '#199e70', x: s.t, y: s.pitch }], xlabel: '', ylabel: 'pitch °', zeroLine: true, legend: false });
  lineChart($('simFlap'), { series: [{ label: 'flap', color: '#d95926', x: s.t, y: s.flap }], xlabel: 'time s', ylabel: 'flap °', legend: false });
  $('simReadout').textContent = `linear stability: ${st.stable ? 'stable' : 'UNSTABLE'}\nleast-damped ζ = ${st.minZeta.toFixed(3)} @ ${st.freqHz.toFixed(2)} Hz\nRMS ride error ${(m.rmsRide * 1000).toFixed(0)} mm\nRMS pitch ${m.rmsPitchDeg.toFixed(2)}°\npeak heave accel ${m.maxAccG.toFixed(2)} g\ntouch-downs ${m.touchdowns} · foil breaches ${m.breaches}\ndL_main/dα ${(r.derivs.Lm_a / 1000).toFixed(1)} kN/rad\ndownwash k ${r.derivs.kdw.toFixed(3)}`;
}

// ---------------------------------------------------------------- optimiser
const opt = { running: false, hist: [], pts: [], front: [], best: null, baseline: null };
$('optGens').oninput = () => { $('optGensOut').textContent = $('optGens').value; };
$('optStop').onclick = () => { opt.running = false; };
$('optApply').onclick = () => { if (opt.best) { loadDesign(cloneDesign(opt.best.design)); } };
$('optRun').onclick = runOptimiser;
async function runOptimiser() {
  if (opt.running) return;
  opt.running = true; opt.hist = []; opt.pts = []; opt.front = []; opt.best = null;
  const target = $('optTarget').value;
  const template = cloneDesign(state.design);
  const x0 = encode(template).map((v) => Math.min(0.98, Math.max(0.02, v)));
  const es = new SepCMAES(x0, { sigma: 0.18, lambda: Math.max(8, cores * 2), seed: 7 });
  const gens = +$('optGens').value;
  setBusy(1);
  const t0 = performance.now();
  try {
    opt.baseline = await pool.run('evalVector', [x0, template, target]);
    opt.best = { score: opt.baseline.score, design: decode(x0, template), r: opt.baseline, gen: 0 };
    let evals = 1;
    for (let g = 0; g < gens && opt.running; g++) {
      const pop = es.ask();
      const res = await Promise.all(pop.map((p) => pool.run('evalVector', [p.x, template, target])));
      evals += res.length;
      const scores = res.map((r) => (Number.isFinite(r.score) ? r.score : -9));
      es.tell(pop, scores);
      res.forEach((r, i) => {
        const pt = { x: r.bands.light.score, y: r.bands.strong.score, gen: g, score: r.score, xv: pop[i].x };
        opt.pts.push(pt);
        opt.front = paretoInsert(opt.front, pt, 'x', 'y');
        if (r.score > opt.best.score) opt.best = { score: r.score, design: decode(pop[i].x, template), r, gen: g + 1 };
      });
      opt.hist.push({ g: g + 1, best: opt.best.score, mean: scores.reduce((a, b) => a + b, 0) / scores.length, sigma: es.sigma });
      $('optReadout').textContent = `gen ${g + 1}/${gens} · ${evals} VPP evaluations\nbest score ${opt.best.score.toFixed(4)} (baseline ${opt.baseline.score.toFixed(4)})\nσ ${es.sigma.toFixed(3)} · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
      drawOpt();
    }
  } catch (e) { console.error(e); $('optReadout').textContent = `optimiser error: ${e.message}`; }
  opt.running = false; setBusy(-1);
  window.__moth.optDone = true;
}
function drawOpt() {
  if (!opt.hist.length) { scatter($('optScatter'), [], {}); return; }
  lineChart($('optConv'), { series: [{ label: 'best', color: '#3987e5', x: opt.hist.map((h) => h.g), y: opt.hist.map((h) => h.best) }, { label: 'population mean', color: '#9fb0c0', dash: [4, 4], x: opt.hist.map((h) => h.g), y: opt.hist.map((h) => h.mean) }], xlabel: 'generation', ylabel: 'score', fmtX: (v) => v.toFixed(0), fmtY: (v) => v.toFixed(3), hline: opt.baseline ? { y: opt.baseline.score, label: 'baseline' } : null, ylim: [Math.min(...opt.hist.map((h) => h.mean), opt.baseline?.score ?? 1) - 0.02, Math.max(...opt.hist.map((h) => h.best)) + 0.02] });
  const maxG = Math.max(1, ...opt.pts.map((p) => p.gen));
  const pts = opt.pts.filter((p) => p.x > 0.2 && p.y > 0.2).map((p) => ({ x: p.x, y: p.y, r: 3.5, alpha: 0.35 + 0.6 * p.gen / maxG, color: '#3987e5', tip: `gen ${p.gen + 1}<br>light ${p.x.toFixed(3)} · strong ${p.y.toFixed(3)}<br>score ${p.score.toFixed(3)}` }));
  if (opt.best?.r) pts.push({ x: opt.best.r.bands.light.score, y: opt.best.r.bands.strong.score, color: '#ffd54f', r: 6, ring: true, label: 'best', tip: 'best design' });
  if (opt.baseline) pts.push({ x: opt.baseline.bands.light.score, y: opt.baseline.bands.strong.score, color: '#e6edf3', r: 5, ring: true, label: 'start', tip: 'starting design' });
  scatter($('optScatter'), pts, { xlabel: 'light-band score (VMG / fleet ref)', ylabel: 'strong-band score', front: opt.front.filter((p) => p.x > 0.2 && p.y > 0.2) });
  if (opt.best) {
    const b = opt.best.design, s0 = state.design;
    const rows = DESIGN_VARS.map(([p]) => { const v0 = getPath(opt.baseline ? decode(encode(s0), s0) : s0, p), v1 = getPath(b, p); return `<tr><td>${p}</td><td>${fmtV(p, v0)}</td><td>${fmtV(p, v1)}</td></tr>`; }).join('');
    const bands = opt.best.r.bands;
    $('optTable').innerHTML = `<table><tr><td><b>variable</b></td><td>start</td><td><b>best</b></td></tr>${rows}
      <tr><td>main area</td><td>${(planformStats(s0.main).area * 1e4).toFixed(0)} cm²</td><td>${(opt.best.r.main.area * 1e4).toFixed(0)} cm²</td></tr>
      <tr><td>main AR</td><td>${planformStats(s0.main).AR.toFixed(1)}</td><td>${opt.best.r.main.AR.toFixed(1)}</td></tr>
      ${BANDS.map(([k, bd]) => `<tr><td>${bd.label} VMG up/down</td><td>${opt.baseline.bands[k].upVMG.toFixed(1)}/${opt.baseline.bands[k].downVMG.toFixed(1)}</td><td>${bands[k].upVMG.toFixed(1)}/${bands[k].downVMG.toFixed(1)}</td></tr>`).join('')}
      <tr><td>take-off kn</td><td>${opt.baseline.takeoffKn.toFixed(1)}</td><td>${opt.best.r.takeoffKn.toFixed(1)}</td></tr></table>`;
  }
}
const fmtV = (p, v) => (/span|Chord|chord|x$/.test(p) ? `${(v * 1000).toFixed(0)}` : /tc/.test(p) ? `${(v * 100).toFixed(1)}%` : /flapFrac|flapSpan/.test(p) ? `${(v * 100).toFixed(0)}%` : v.toFixed(2));

// ---------------------------------------------------------------- GPU design-space sweep
const sweep = { res: null, xs: [], ys: [], designs: [] };
$('swV').oninput = () => { $('swVOut').textContent = $('swV').value; drawSweep(); };
$('swRun').onclick = runSweep;
$('swCpu').onclick = () => {
  if (!sweep.designs.length) return;
  const t0 = performance.now();
  for (const d of sweep.designs) cpuSolve(d);
  const ms = performance.now() - t0;
  sweep.cpuMs = ms;
  drawSweepReadout();
};
let gpuSweep = null;
async function runSweep() {
  if (!scene.device) { $('swReadout').textContent = 'WebGPU compute not available.'; return; }
  gpuSweep = gpuSweep || new GPUSweep(scene.device);
  const nx = +$('swGrid').value, ny = Math.round(nx * 0.8);
  const base = state.design;
  const ref = planformStats(base.main);
  const k = ref.area / (base.main.span * base.main.rootChord);
  const xs = Array.from({ length: nx }, (_, i) => 0.80 + 0.40 * i / (nx - 1));
  const ys = Array.from({ length: ny }, (_, j) => 0.055 + 0.055 * j / (ny - 1));
  const designs = [];
  for (const area of ys) for (const span of xs) {
    const d = cloneDesign(base);
    d.main.span = span; d.main.rootChord = area / (span * k);
    d.main.nHalf = 10; d.elevator.nHalf = 6; d.mainStrut.nSeg = 5; d.rudderStrut.nSeg = 5;
    designs.push(d);
  }
  setBusy(1);
  try {
    const out = await gpuSweep.solve(designs);
    Object.assign(sweep, { res: out.res, ms: out.ms, xs, ys, designs, nx, ny });
    // verification against the CPU solver for the first and a middle design
    const errs = [0, Math.floor(designs.length / 2)].map((i) => {
      const c = cpuSolve(designs[i]);
      const g = out.res[i];
      let e = 0, n = 0;
      c.G1.forEach((v, j) => { e = Math.max(e, Math.abs(v - g.G1[j])); n = Math.max(n, Math.abs(v)); });
      return e / n;
    });
    sweep.err = Math.max(...errs);
    drawSweep();
    window.__moth.sweepDone = true;
  } catch (e) { console.error(e); $('swReadout').textContent = `GPU sweep failed: ${e.message}`; } finally { setBusy(-1); }
}
function drawSweepReadout() {
  if (!sweep.res) return;
  $('swReadout').textContent = `${sweep.designs.length} designs × ${sweep.res[0].n} panels\nGPU: ${sweep.ms.toFixed(0)} ms (AIC + elimination + KJ forces)\n${sweep.cpuMs ? `CPU (1 thread): ${sweep.cpuMs.toFixed(0)} ms` : 'CPU: press “CPU timing”'}\nGPU vs CPU max rel. error ${(sweep.err * 100).toExponential(2)}%`;
}
function drawSweep() {
  if (!sweep.res) { return; }
  const V = +$('swV').value * KNOT;
  const vals = [];
  let best = null, bestV = Infinity;
  for (let j = 0; j < sweep.ny; j++) {
    const row = [];
    for (let i = 0; i < sweep.nx; i++) {
      const idx = j * sweep.nx + i;
      const r = levelFlightDrag(sweep.res[idx], sweep.designs[idx], V);
      const v = r.maxCl > 1.1 ? NaN : r.total;
      row.push(v);
      if (v < bestV) { bestV = v; best = [i, j]; }
    }
    vals.push(row);
  }
  const d = state.design, a = planformStats(d.main).area;
  const cur = [sweep.xs.reduce((bi, x, i) => (Math.abs(x - d.main.span) < Math.abs(sweep.xs[bi] - d.main.span) ? i : bi), 0), sweep.ys.reduce((bi, y, i) => (Math.abs(y - a) < Math.abs(sweep.ys[bi] - a) ? i : bi), 0)];
  heatmap($('swHeat'), { values: vals, xs: sweep.xs, ys: sweep.ys, xlabel: 'main span (m)', ylabel: 'main area (m²)', unit: 'N drag', best, marker: cur });
  const speeds = Array.from({ length: 26 }, (_, i) => 7 + i);
  const curve = (i, j) => speeds.map((kn) => { const idx = j * sweep.nx + i; const r = levelFlightDrag(sweep.res[idx], sweep.designs[idx], kn * KNOT); return r.maxCl > 1.1 ? NaN : r.total; });
  const big = [sweep.nx - 1, sweep.ny - 1], small = [Math.floor(sweep.nx * 0.3), 1];
  lineChart($('swCurve'), {
    series: [
      { label: 'current', color: '#e6edf3', x: speeds, y: curve(...cur) },
      { label: 'best @ V', color: '#c98500', x: speeds, y: curve(...best) },
      { label: 'big foil', color: '#3987e5', x: speeds, y: curve(...big) },
      { label: 'small foil', color: '#d95926', x: speeds, y: curve(...small) },
    ], xlabel: 'boat speed kn', ylabel: 'level-flight drag N', fmtX: (v) => v.toFixed(0), fmtY: (v) => v.toFixed(0),
  });
  drawSweepReadout();
}

// ---------------------------------------------------------------- go
updateDerived();
updateLegend();
requestDetail();
requestEval();
window.__moth.runSweep = runSweep;
window.__moth.runOptimiser = runOptimiser;
window.__moth.runSim = runSim;
window.__moth.loadPreset = (k) => presetButtons[k].click();
window.__moth.scene = scene;
