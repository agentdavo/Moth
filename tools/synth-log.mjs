#!/usr/bin/env node
// Synthetic LOG_FORMAT v1 sailing logs with known ground truth, for tests and bundled samples.
//
//   node tools/synth-log.mjs                 # writes docs/samples/*.csv, *.truth.json, moth-track.gpx
//   node tools/synth-log.mjs --kind moth --minutes 20 --seed 3 --out /tmp/x.csv [--rate 50]
//   node tools/synth-log.mjs --recompute-polar   # refresh src/analysis/data/moth-polar.json from MothModel
//
// Model (see docs/ANALYSIS.md, "Synthetic logs"):
//  * wind: TWD = mean + Ornstein–Uhlenbeck shift (σ 5°, τ 4 min); TWS = mean × (1 + gust OU (σ 4 %, τ 15 s)
//    + slow OU (σ 4 %, τ 7 min)).
//  * course plan: windward–leeward laps, beats of 3 legs (tacks), runs of 2 legs (gybe), bear-away at the
//    windward mark and round-up at the leeward mark; legs sized so the track closes.
//  * the sailor holds a target TWA on the instantaneous wind (steering noise OU 2°, τ 6 s); maneuvers are
//    smoothstep turns of the TWA through head-to-wind / dead-downwind.
//  * speed: first-order approach to the polar speed at the actual TWA/TWS (Moth: cached MothModel polar;
//    IOM: parametric displacement polar), coasting deceleration inside the no-go zones; Moth tacks/gybes can
//    fail (touch down: speed collapses to displacement speed, re-launch after 2–5 s).
//  * sensors: GNSS 5 Hz with correlated position error (σ 1.2 m, τ 60 s) + 0.25 m white, Doppler velocity
//    noise 0.05 m/s per axis, dropouts; IMU with noise and gyro bias; heading = course + leeway + magnetic
//    error up to ~5°; servo pulses with ±2 µs noise and a receiver dropout; event markers toggling A/B.
//  * A/B: configuration B multiplies the target speed by (1 + effect).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeLog, writeGPX, V1_COLUMNS } from '../src/analysis/parse.js';
import { PolarModel, mothPolarTable } from '../src/analysis/model.js';
import { rng, wrap180, wrap360, DEG, interp1, KN } from '../src/analysis/util.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLAR_CACHE = resolve(ROOT, 'src/analysis/data/moth-polar.json');
export const MOTH_TWS_GRID = [4.0, 4.75, 5.5, 6.25, 7.0];

export async function mothPolar({ recompute = false } = {}) {
  if (!recompute && existsSync(POLAR_CACHE)) {
    const j = JSON.parse(readFileSync(POLAR_CACHE, 'utf8'));
    return new PolarModel(j.name, j.tables, j.source);
  }
  const { MothModel } = await import('../src/physics/vpp.js');
  const { mediumDesign } = await import('../src/physics/design.js');
  const m = new MothModel(mediumDesign);
  const tables = MOTH_TWS_GRID.map((tws) => mothPolarTable(m, tws));
  const j = { name: 'Moth VPP (medium preset, cached)', source: 'src/physics/vpp.js MothModel, mediumDesign; tools/synth-log.mjs --recompute-polar', unit: 'm/s', tables };
  mkdirSync(dirname(POLAR_CACHE), { recursive: true });
  writeFileSync(POLAR_CACHE, JSON.stringify(j, null, 1));
  return new PolarModel(j.name, tables, j.source);
}

// TODO(IOM lab): replace this parametric polar with the IOM lab's exported table
// (same JSON as src/analysis/model.js parsePolarJSON) via --iom-polar <file.json>.
export function iomPolar() {
  const g = [[28, 0.25], [34, 0.58], [40, 0.74], [45, 0.80], [60, 0.90], [90, 0.97], [110, 1.0], [135, 0.97], [150, 0.93], [165, 0.86], [180, 0.80]];
  const xs = g.map((p) => p[0]), ys = g.map((p) => p[1]);
  return {
    name: 'IOM parametric', speed(twa, tws) {
      const a = Math.abs(twa); if (a < 28) return 0;
      return 1.48 * (1 - Math.exp(-tws / 2.2)) * interp1(xs, ys, a, true);
    },
  };
}

/**
 * The VPP polar has a foiling/displacement discontinuity (no steady foiling equilibrium above ~135 deg
 * or below ~46 deg at 11 kn). A foiling sailor who wanders a few degrees past it slows but keeps flying,
 * so the synthesiser uses the foiling points only, extrapolated with -1.2 %/deg (deeper) and -3 %/deg
 * (higher); dropping off the foils is modelled separately (speed < foilOff).
 */
export function foilingPolar(pm) {
  const tabs = pm.tables.map((tb) => ({ tws: tb.tws, pts: tb.points.filter((p) => p.foiling !== false) }));
  const one = (tb, a) => {
    const p = tb.pts, f = p[0], l = p[p.length - 1];
    if (a < f.twa) return f.speed * Math.max(0.2, 1 - 0.03 * (f.twa - a));
    if (a > l.twa) return l.speed * Math.max(0.3, 1 - 0.012 * (a - l.twa));
    return interp1(p.map((q) => q.twa), p.map((q) => q.speed), a, true);
  };
  const speed = (twa, tws) => {
    const a = Math.abs(twa);
    if (tws <= tabs[0].tws) return one(tabs[0], a);
    if (tws >= tabs[tabs.length - 1].tws) return one(tabs[tabs.length - 1], a);
    let i = 0; while (tabs[i + 1].tws < tws) i++;
    const f = (tws - tabs[i].tws) / (tabs[i + 1].tws - tabs[i].tws);
    return (1 - f) * one(tabs[i], a) + f * one(tabs[i + 1], a);
  };
  const m = { name: pm.name + ' (foiling branch)', speed };
  m.bestVMG = (dir, tws) => PolarModel.prototype.bestVMG.call(m, dir, tws);
  return m;
}

const smoothstep = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function ou(r, sigma, tau, dt) {
  let x = sigma * r.normal();
  const a = Math.exp(-dt / tau), b = sigma * Math.sqrt(1 - a * a);
  return () => (x = a * x + b * r.normal());
}

/** Build the phase plan: array of {kind:'leg'|'man', ...}. */
function plan(r, P, total) {
  const ph = [];
  let t = 0;
  const leg = (mode, side, dur) => { ph.push({ kind: 'leg', mode, side, dur }); t += dur; };
  const man = (type, from, to, dur, fail = false) => { ph.push({ kind: 'man', type, from, to, dur, fail }); t += dur; };
  const U = (a, b) => a + (b - a) * r();
  // pre-start reach, then round up onto starboard
  leg('reach', 1, P.reachLead);
  man('roundup', { mode: 'reach', side: 1 }, { mode: 'up', side: 1 }, U(...P.roundDur));
  let side = 1, lap = 0;
  while (t < total - 60) {
    // beat: 3 legs, the middle one as long as the other two together (track closes)
    const d1 = U(...P.upLeg), d3 = U(...P.upLeg), d2 = (d1 + d3) * U(0.9, 1.1);
    const durs = [d1, d2, d3];
    for (let i = 0; i < 3; i++) {
      const trim = lap === 0 && i === 0 ? 0 : P.settleTrim; // time taken by the previous maneuver's exit
      leg('up', side, Math.max(8, durs[i] - trim));
      if (i < 2) { const f = r() < P.tackFail; man('tack', { mode: 'up', side }, { mode: 'up', side: -side }, f ? U(...P.tackSlow) : U(...P.tackDur), f); side = -side; }
      if (t > total - 40) break;
    }
    if (t > total - 40) break;
    man('bearaway', { mode: 'up', side }, { mode: 'down', side }, U(...P.bearDur));
    const e1 = U(...P.downLeg), e2 = e1 * U(0.9, 1.1);
    leg('down', side, e1);
    { const f = r() < P.gybeFail; man('gybe', { mode: 'down', side }, { mode: 'down', side: -side }, f ? U(...P.gybeSlow) : U(...P.gybeDur), f); side = -side; }
    leg('down', side, Math.max(8, e2 - P.settleTrim));
    man('roundup', { mode: 'down', side }, { mode: 'up', side }, U(...P.roundDur));
    lap++;
  }
  leg('up', side, 25);
  man('bearaway', { mode: 'up', side }, { mode: 'reach', side }, U(...P.bearDur));
  leg('reach', side, 40);
  return ph;
}

const PRESETS = {
  moth: {
    cls: 'Moth', boat: 'Moth GBR 4242 (synthetic)', twd0: 225, tws0: 5.5, lat0: 50.5935, lon0: -2.4412,
    upLeg: [32, 48], downLeg: [38, 52], reachLead: 25, settleTrim: 3,
    tackDur: [3.4, 4.4], tackSlow: [5.2, 6.5], tackFail: 0.3, gybeDur: [3.0, 3.8], gybeSlow: [4.5, 5.5], gybeFail: 0.15,
    bearDur: [4, 5.5], roundDur: [4, 5],
    coastTau: 4.5, accTau: 3.0, decTau: 2.5, noGoUp: 32, noGoDown: 168, foilOff: 3.6, dispSpeed: 2.5,
    leeway: 1.5, heelUp: 12, heelDown: 5, whUp: 1.5, whDown: 0.5, turnGain: 3.5, vRef: 7, sheetUp: 10, sheetDown: 45, sheetReach: 30,
    rudderCenter: 1510, rudderDegPerUs: 0.1, sheetIn: 1000, sheetOut: 2000, vbat: [4.05, 3.86], imuVib: 0.35,
    upTwa: null, downTwa: null, toggle: 'leg', effect: 0.01, declination: -1.2,
  },
  iom: {
    cls: 'IOM', boat: 'IOM GBR 123 (synthetic)', twd0: 300, tws0: 3.6, lat0: 51.4012, lon0: -0.3265,
    upLeg: [34, 50], downLeg: [40, 55], reachLead: 20, settleTrim: 4,
    tackDur: [5, 7], tackSlow: [7, 8.5], tackFail: 0, gybeDur: [4.5, 6], gybeSlow: [6, 7], gybeFail: 0,
    bearDur: [4.5, 6], roundDur: [4.5, 6],
    coastTau: 4.5, accTau: 4.5, decTau: 3.0, noGoUp: 30, noGoDown: 180, foilOff: 0, dispSpeed: 0,
    leeway: 4, heelUp: 16, heelDown: 3, whUp: 1, whDown: 0, turnGain: 0.9, vRef: 1, sheetUp: 5, sheetDown: 85, sheetReach: 45,
    rudderCenter: 1500, rudderDegPerUs: 0.09, sheetIn: 1100, sheetOut: 1900, vbat: [5.05, 4.98], imuVib: 0.2,
    upTwa: 42, downTwa: 155, toggle: 'leg', effect: 0.01, declination: 0.3,
  },
};

/**
 * Generate a session. Returns { text?, meta, data, n, truth }.
 * opts: kind 'moth'|'iom', minutes, seed, rate (Hz, default 10), gnssHz (5), effect (fraction, B vs A),
 *       toggle 'leg'|'lap'|null, tws0, twd0, polar (model with speed(twa,tws)), gustSigma, shiftSigma, anemometer (bool)
 */
export async function synthesize(opts = {}) {
  const kind = opts.kind || 'moth';
  const P = { ...PRESETS[kind], ...(opts.preset || {}) };
  const r = rng(opts.seed ?? 1);
  const rate = opts.rate ?? 10, gnssHz = opts.gnssHz ?? 5;
  const sub = 5, dt = 1 / (rate * sub);
  const total = (opts.minutes ?? 15) * 60;
  const tws0 = opts.tws0 ?? P.tws0, twd0 = opts.twd0 ?? P.twd0;
  const effect = opts.effect ?? P.effect;
  const toggle = opts.toggle === undefined ? P.toggle : opts.toggle;
  const polar = opts.polar || (kind === 'moth' ? foilingPolar(await mothPolar()) : iomPolar());
  const upTwa = P.upTwa ?? polar.bestVMG('up', tws0).twa;
  const downTwa = P.downTwa ?? polar.bestVMG('down', tws0).twa;
  const V = (twa, tws) => {
    const a = Math.abs(twa);
    const lo = 28;
    if (a < lo) { const v = polar.speed(lo, tws); return v * Math.max(0, (a - 20) / (lo - 20)); }
    return polar.speed(a, tws);
  };
  const phases = plan(r, P, total);
  // wind processes
  const shift = ou(r, opts.shiftSigma ?? 5, 240, dt), gust = ou(r, opts.gustSigma ?? 0.04, 15, dt), slow = ou(r, opts.slowSigma ?? 0.04, 420, dt);
  const steer = ou(r, 2, 6, dt), tech = ou(r, 0.006, 20, dt), rollN = ou(r, 1, 1, dt), pitchN = ou(r, 0.3, 0.8, dt), rudN = ou(r, 0.8, 0.5, dt);
  const gpsE = ou(r, 1.2, 60, 1 / gnssHz), gpsN = ou(r, 1.2, 60, 1 / gnssHz), saccW = ou(r, 0.03, 30, 1 / gnssHz), haccW = ou(r, 0.3, 40, 1 / gnssHz);
  const gyroBias = [0.2 * r.normal(), 0.2 * r.normal(), 0.25 * r.normal()];
  const magPhase = 360 * r(), magBias = 1.5 * r.normal();
  // state
  let E = 0, N = 0, v = kind === 'moth' ? 6 : 0.9, foiling = kind === 'moth', touchT = -99, takeoffDelay = 3, takeoffT = -99;
  let roll = 0, pitch = 0, sheetF = 20, rudder = 0;
  let prevCourse = NaN, prevRoll = 0, prevPitch = 0, prevV = v;
  let config = 1; // 1 = A, 2 = B
  let pendingToggle = Infinity, twdSeen = twd0, steerS = 0;
  const legCount = {};
  const nRows = Math.floor(total * rate);
  const cols = Object.fromEntries(V1_COLUMNS.map((c) => [c, new Float64Array(nRows).fill(NaN)]));
  const truth = { kind, seed: opts.seed ?? 1, rate, tws0, twd0, upTwa, downTwa, effect, toggle, maneuvers: [], configChanges: [], twdSamples: [], twsSamples: [] };
  let pi = 0, pStart = 0;
  let prevTwaS = NaN, curMan = null, legIndex = 0, lapIndex = 0;
  let lastLegStart = -1;
  const fixStart = 15; // s without fix at power-on
  const outages = [[total * 0.37, 4], [total * 0.71, 6]];
  const servoOut = [total * 0.55, 8];
  let row = 0, stepInRow = 0, lastGnss = -1;
  const gnssEvery = Math.max(1, Math.round(rate / gnssHz));
  let sumTwd = [0, 0], sumTws = 0, cntW = 0;
  const bootMs = 120000 + Math.floor(r() * 900) * 10;
  const utcStart = Date.UTC(2026, 8, 20, 13, 5, 0) + Math.floor(r() * 1000) * 1000;
  for (let step = 0; row < nRows; step++) {
    const t = step * dt;
    // phase bookkeeping
    while (pi < phases.length - 1 && t - pStart >= phases[pi].dur) { pStart += phases[pi].dur; pi++; }
    const ph = phases[pi];
    const u = (t - pStart) / ph.dur;
    // wind
    const twd = twd0 + shift();
    const g = gust(), tws = tws0 * (1 + g + slow());
    sumTwd[0] += Math.sin(twd * DEG); sumTwd[1] += Math.cos(twd * DEG); sumTws += tws; cntW++;
    // commanded signed TWA
    const tgt = (mode) => (mode === 'up' ? upTwa : mode === 'down' ? downTwa : 90);
    let twaCmd;
    if (ph.kind === 'leg') {
      twaCmd = ph.side * tgt(ph.mode);
      // acceleration build after a tack: sail 7° lower for the first seconds
      if (ph.mode === 'up' && t - pStart < 6) twaCmd += ph.side * 7 * (1 - (t - pStart) / 6);
      if (ph.kind === 'leg' && legIndex !== pi) {
        legIndex = pi;
        // A/B marker
        const isLapStart = ph.mode === 'up' && phases[pi - 1]?.type === 'roundup' && pi > 2;
        if (toggle === 'leg' && (ph.mode === 'up' || ph.mode === 'down')) {
          // tack-balanced sequences for this course: beats alternate tacks S P S P … -> ABBA upwind
          // (pairs S-A/P-B, S-B/P-A); runs go S P | P S | S P … -> ABAB downwind
          const j = (legCount[ph.mode] = (legCount[ph.mode] ?? -1) + 1);
          const seq = ph.mode === 'up' ? [1, 2, 2, 1] : [1, 2, 1, 2];
          if (seq[j % 4] !== config) pendingToggle = t + 3;
        } else if (toggle === 'lap' && isLapStart) pendingToggle = t + 3;
      }
    } else {
      const a0 = ph.from.side * tgt(ph.from.mode);
      let a1 = ph.to.side * tgt(ph.to.mode);
      if (ph.type === 'gybe') a1 = a0 > 0 ? 360 - Math.abs(a1) : -(360 - Math.abs(a1)); // through 180
      twaCmd = a0 + (a1 - a0) * smoothstep(u);
      if (curMan !== pi) { curMan = pi; }
    }
    if (t >= pendingToggle) { pendingToggle = Infinity; config = 3 - config; truth.configChanges.push({ t, config: config === 2 ? 'B' : 'A' }); }
    steerS += (steer() - steerS) * dt / 1.0; // sailor's steering wander (low-passed OU)
    twdSeen += wrap180(twd - twdSeen) * dt / 5; // the sailor follows shifts with a 5-s lag
    const twaS = wrap180(twaCmd + (ph.kind === 'leg' ? steerS : 0.3 * steerS));
    // truth maneuver time: crossing of the commanded TWA through 0 / 180
    if (Number.isFinite(prevTwaS) && Math.sign(twaS) !== Math.sign(prevTwaS) && ph.kind === 'man' && (ph.type === 'tack' || ph.type === 'gybe')) {
      if (!truth.maneuvers.length || t - truth.maneuvers[truth.maneuvers.length - 1].t > 2) truth.maneuvers.push({ t, type: ph.type, failed: ph.fail });
      if (kind === 'moth' && ph.fail && foiling) { foiling = false; touchT = t; takeoffDelay = 2 + 3 * r(); }
    }
    prevTwaS = twaS;
    const course = wrap360(twdSeen - twaS);
    // speed dynamics on the true TWA
    const a = Math.abs(wrap180(twd - course));
    const mult = (1 + tech()) * (config === 2 ? 1 + effect : 1);
    let vt = V(a, tws) * mult, tau;
    const noGo = a < P.noGoUp || a > P.noGoDown;
    if (kind === 'moth') {
      if (foiling) {
        if (noGo) { vt = 0; tau = P.coastTau; } else tau = vt > v ? P.accTau : P.decTau;
        if (v < P.foilOff && t - takeoffT > 5) { foiling = false; touchT = t; takeoffDelay = 2 + 3 * r(); }
      } else {
        vt = noGo ? 0 : Math.min(vt, P.dispSpeed * Math.min(1, a / 60));
        tau = v > vt ? 1.0 : 2.0;
        if (t - touchT > takeoffDelay && a > 38 && a < 155) { foiling = true; takeoffT = t; }
      }
    } else {
      if (noGo) { vt = 0; tau = P.coastTau; } else tau = vt > v ? P.accTau : P.decTau;
    }
    v += (vt - v) / tau * dt;
    const dvdt = (v - prevV) / dt; prevV = v;
    E += v * Math.sin(course * DEG) * dt; N += v * Math.cos(course * DEG) * dt;
    // yaw rate
    const yawRate = Number.isFinite(prevCourse) ? wrap180(course - prevCourse) / dt : 0; prevCourse = course;
    const sgn = Math.sign(twaS) || 1;
    // heel
    let rt;
    if (kind === 'moth') rt = foiling ? sgn * ((a < 90 ? P.heelUp : P.heelDown) + 40 * g) : -sgn * 3;
    else rt = -sgn * (a < 90 ? Math.min(35, P.heelUp * ((tws / tws0) ** 2)) : P.heelDown + 4 * Math.sin(2 * Math.PI * 0.35 * t));
    if (ph.kind === 'man' && (ph.type === 'tack' || ph.type === 'gybe')) rt *= 0.6;
    roll += (rt - roll) / 0.6 * dt;
    const rollM = roll + rollN();
    // pitch
    let pt;
    if (kind === 'moth') pt = foiling ? 0.6 + (t - takeoffT < 2 ? 3 * (1 - (t - takeoffT) / 2) : 0) : -1.0;
    else pt = (a < 90 ? 0.5 : -1.5 - 0.3 * (v - 1)) + 0.8 * Math.sin(2 * Math.PI * 0.7 * t);
    pitch += (pt - pitch) / 0.4 * dt;
    const pitchM = pitch + pitchN();
    // rudder (+ = trailing edge to port -> bow to starboard -> positive yaw rate)
    const G = P.turnGain * Math.max(0.3, v / P.vRef);
    const wh = a < 90 ? P.whUp + (kind === 'iom' ? 0.12 * Math.abs(roll) : 0) : P.whDown;
    rudder += (Math.max(-35, Math.min(35, yawRate / G - sgn * wh)) - rudder) / 0.25 * dt;
    // sheet (% out)
    let st = a < 70 ? P.sheetUp + (kind === 'moth' ? 150 * Math.max(0, g) : 0) : a > 110 ? P.sheetDown : P.sheetReach;
    if (ph.kind === 'man' && ph.type === 'tack' && kind === 'moth') st = 20;
    sheetF += (st - sheetF) / 1.2 * dt;

    // ---- output row
    stepInRow++;
    if (stepInRow < sub) continue;
    stepInRow = 0;
    const k = row;
    const tr = t; // time of this row
    cols.t_ms[k] = bootMs + Math.round(tr * 1000);
    const hasFix = tr >= fixStart && !outages.some(([o, d]) => tr >= o && tr < o + d);
    if (tr >= fixStart) cols.utc_ms[k] = utcStart + Math.round(tr * 1000);
    const newG = k % gnssEvery === 0;
    if (hasFix) {
      if (newG || lastGnss < 0) {
        const ee = E + gpsE() + 0.25 * r.normal(), nn = N + gpsN() + 0.25 * r.normal();
        const kx = 6371008.8 * DEG * Math.cos(P.lat0 * DEG), ky = 6371008.8 * DEG;
        const ve = v * Math.sin(course * DEG) + 0.05 * r.normal(), vn = v * Math.cos(course * DEG) + 0.05 * r.normal();
        lastGnss = { lat: P.lat0 + nn / ky, lon: P.lon0 + ee / kx, sog: Math.hypot(ve, vn), cog: wrap360(Math.atan2(ve, vn) / DEG), sacc: Math.max(0.03, 0.08 + saccW()), hacc: Math.max(0.6, 1.3 + haccW()), sats: 16 + Math.round(2 * Math.sin(tr / 300)) };
        cols.gnss_new[k] = 1;
      } else cols.gnss_new[k] = 0;
      const G0 = lastGnss;
      cols.lat[k] = G0.lat; cols.lon[k] = G0.lon; cols.sog[k] = G0.sog; cols.cog[k] = G0.cog; cols.sacc[k] = G0.sacc; cols.hacc[k] = G0.hacc;
      cols.fix[k] = 3; cols.sats[k] = G0.sats;
    } else { cols.gnss_new[k] = 0; cols.fix[k] = 0; cols.sats[k] = tr < fixStart ? Math.floor(tr / 3) : 3; }
    // IMU
    const leeway = a < 90 ? P.leeway : 0.3;
    const hdg = course + sgn * leeway;
    const mag = 3 * Math.sin((hdg + magPhase) * DEG) + 2 * Math.sin((2 * hdg + 10) * DEG) + magBias;
    cols.yaw[k] = wrap360(hdg + mag + 0.4 * r.normal());
    cols.roll[k] = rollM; cols.pitch[k] = pitchM;
    const rr = (rollM - prevRoll) * rate, pr = (pitchM - prevPitch) * rate; prevRoll = rollM; prevPitch = pitchM;
    cols.gx[k] = rr * 0.3 + gyroBias[0] + 0.3 * r.normal();
    cols.gy[k] = pr * 0.3 + gyroBias[1] + 0.3 * r.normal();
    cols.gz[k] = yawRate + gyroBias[2] + 0.3 * r.normal();
    const ph_ = rollM * DEG, th = pitchM * DEG, gg = 9.81;
    cols.ax[k] = dvdt + gg * Math.sin(th) + P.imuVib * r.normal();
    cols.ay[k] = v * yawRate * DEG - gg * Math.sin(ph_) * Math.cos(th) + P.imuVib * r.normal();
    cols.az[k] = -gg * Math.cos(ph_) * Math.cos(th) + P.imuVib * r.normal();
    // servos
    const servoLost = tr >= servoOut[0] && tr < servoOut[0] + servoOut[1];
    if (!servoLost) {
      cols.rudder_us[k] = Math.round(P.rudderCenter + (rudder + rudN()) / P.rudderDegPerUs + 2 * r.normal());
      cols.sheet_us[k] = Math.round(P.sheetIn + Math.max(0, Math.min(100, sheetF)) / 100 * (P.sheetOut - P.sheetIn) + 2 * r.normal());
    }
    cols.vbat[k] = P.vbat[0] + (P.vbat[1] - P.vbat[0]) * tr / total + 0.01 * r.normal();
    cols.event[k] = 0;
    if (opts.anemometer) { cols.tws[k] = tws * (1 + 0.03 * r.normal()); cols.twd[k] = wrap360(twd + 3 * r.normal()); }
    if (k % rate === 0) { truth.twdSamples.push(+wrap360(twd).toFixed(2)); truth.twsSamples.push(+tws.toFixed(3)); }
    row++;
  }
  // event markers: one row, 3 s after the configuration change (config applied from the marker on)
  for (const c of truth.configChanges) { const k = Math.min(nRows - 1, Math.round(c.t * rate)); cols.event[k] = 1; c.t = k / rate; }
  truth.twdMean = wrap360(Math.atan2(sumTwd[0], sumTwd[1]) / DEG);
  truth.twsMean = sumTws / cntW;
  truth.durationS = nRows / rate;
  const meta = {
    format: 'sail-log v1', logger: 'synth-log.mjs (synthetic)', boat: P.boat, class: P.cls, rate_hz: rate,
    declination_deg: P.declination, imu_mount: 'x_fwd_y_stbd_z_down',
    rudder_center_us: P.rudderCenter, rudder_deg_per_us: P.rudderDegPerUs, sheet_in_us: P.sheetIn, sheet_out_us: P.sheetOut,
    tws_source: opts.anemometer ? 'anemometer' : 'none', imu_fusion: opts.noYaw ? 'game' : 'rotation_vector', gnss_rate_hz: gnssHz,
  };
  if (opts.noYaw) cols.yaw.fill(NaN); // game-rotation fusion without magnetometer: yaw column empty
  // trailer, rewritten by the logger at close: start_utc is only known once GNSS time arrived
  const trailer = { start_utc: new Date(utcStart + fixStart * 1000).toISOString().replace('.000Z', 'Z'), rows: nRows, dropped_rows: 0, end_t_ms: cols.t_ms[nRows - 1] };
  // the effect applies to target speed; marker config before markers = A
  truth.note = 'maneuver t = s since the first row (t_ms − t_ms[0]); config A until the first marker, each marker toggles';
  return { meta, trailer, data: cols, n: nRows, truth };
}

export async function synthText(opts) {
  const s = await synthesize(opts);
  return { ...s, text: writeLog({ meta: s.meta, data: s.data, n: s.n, trailer: s.trailer }) };
}

function gpxFrom(s, name, every = 10) {
  const pts = [];
  const t0 = Date.parse(s.trailer.start_utc) - 15000;
  for (let k = 0; k < s.n; k += every) {
    if (!(s.data.fix[k] >= 2)) continue;
    pts.push({ lat: s.data.lat[k], lon: s.data.lon[k], t: t0 + (s.data.t_ms[k] - s.data.t_ms[0]), speed: s.data.sog[k], course: s.data.cog[k] });
  }
  return writeGPX(name, pts);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes('--recompute-polar')) { const t0 = Date.now(); await mothPolar({ recompute: true }); console.log(`moth polar cache written (${Date.now() - t0} ms): ${POLAR_CACHE}`); if (!args.includes('--kind')) return; }
  if (arg('kind')) {
    const s = await synthText({ kind: arg('kind'), minutes: +arg('minutes', 15), seed: +arg('seed', 1), rate: +arg('rate', 10), effect: +arg('effect', 0.01), anemometer: args.includes('--anemometer'), noYaw: args.includes('--no-yaw') });
    const out = arg('out', `synth-${arg('kind')}.csv`);
    writeFileSync(out, s.text);
    writeFileSync(out.replace(/\.csv$/i, '') + '.truth.json', JSON.stringify(s.truth));
    console.log(`${out}: ${s.n} rows, ${(s.text.length / 1e6).toFixed(2)} MB, ${s.truth.maneuvers.length} tacks/gybes`);
    return;
  }
  const dir = resolve(ROOT, 'docs/samples');
  mkdirSync(dir, { recursive: true });
  const jobs = [
    { file: 'moth-ab-sample.csv', opts: { kind: 'moth', minutes: 15, seed: 121 } },
    { file: 'iom-sample.csv', opts: { kind: 'iom', minutes: 15, seed: 5 } },
  ];
  for (const j of jobs) {
    const s = await synthText(j.opts);
    writeFileSync(resolve(dir, j.file), s.text);
    const { twdSamples, twsSamples, ...tr } = s.truth;
    writeFileSync(resolve(dir, j.file.replace('.csv', '.truth.json')), JSON.stringify({ ...tr, twdSamples1Hz: twdSamples, twsSamples1Hz: twsSamples }));
    console.log(`${j.file}: ${s.n} rows, ${(s.text.length / 1e6).toFixed(2)} MB, ${s.truth.maneuvers.length} tacks/gybes, TWD ${s.truth.twdMean.toFixed(1)}°, TWS ${(s.truth.twsMean / KN).toFixed(1)} kn, up ${s.truth.upTwa.toFixed(1)}° down ${s.truth.downTwa.toFixed(1)}°`);
    if (j.opts.kind === 'moth') writeFileSync(resolve(dir, 'moth-track.gpx'), gpxFrom(s, 'Moth GBR 4242 (synthetic)'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
