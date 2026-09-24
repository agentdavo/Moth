// Validation and calibration of the IOM model against published data.
// usage: node tools/iom-validate.mjs  -> docs/results/iom/validation.json (+ console report)
import fs from 'node:fs';
import { DEFAULT_DESIGN, mergeDesign } from '../src/iom/physics/design.js';
import { computeStatics } from '../src/iom/physics/statics.js';
import { uprightResistance, BULB_SEP } from '../src/iom/physics/resistance.js';
import { sailForces, buildRig } from '../src/iom/physics/sails.js';
import { evaluateBands, makeContext, vmg } from '../src/iom/physics/vpp.js';
import { KNOT } from '../src/iom/physics/constants.js';

const out = {};
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;

// Speed of a towed hull under a constant force F (falling-weight tow, as in the Southampton tests)
function towSpeed(d, s, F, V0) {
  let lo = 0.2 * V0, hi = 2.5 * V0;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (uprightResistance(m, s, d).total < F) lo = m; else hi = m; }
  return lo;
}

// ---------------------------------------------------------------- 1. bulb tow tests (calibration)
// Gilbert & Bantock, "IOM bulb drag", AMYA Model Yachting #184 (onemetre.net): SAILSetc Fraktal towed with
// three bulbs by a falling weight to ~0.5 and ~1.0 m/s. Speed gain vs the 250 mm "fat" bulb:
// 300 mm +1.4 % (0.5 m/s), +0.6 % (1.0 m/s); 350 mm +1.9 % (0.5), "similarly faster" ~+0.6 % (1.0). SE ~0.15 %.
const TANK = { bulbs: {
  fat: { length: 0.25, nose: 2.2, tail: 2.2, xMax: 0.40 },
  medium: { length: 0.30, nose: 2.0, tail: 2.0, xMax: 0.42 },
  standard: { length: 0.35, nose: 2.0, tail: 2.0, xMax: 0.42 },
}, measured: { '0.5': { medium: 0.014, standard: 0.019 }, '1': { medium: 0.006, standard: 0.006 } } };

function tankDeltas(model) {
  const res = {};
  for (const V0 of [0.5, 1.0]) {
    const ds = Object.fromEntries(Object.entries(TANK.bulbs).map(([k, b]) => [k, mergeDesign(DEFAULT_DESIGN, { bulb: b, keel: { mass: 2.45 }, model })]));
    const ss = Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, computeStatics(d, 'A')]));
    const F = uprightResistance(V0, ss.fat, ds.fat).total;
    const v = Object.fromEntries(Object.keys(ds).map((k) => [k, towSpeed(ds[k], ss[k], F, V0)]));
    res[String(V0)] = { medium: v.medium / v.fat - 1, standard: v.standard / v.fat - 1, F, fineness: Object.fromEntries(Object.keys(ss).map((k) => [k, +ss[k].bulb.fineness.toFixed(2)])) };
  }
  return res;
}
function sse(r) {
  let e = 0;
  for (const V of ['0.5', '1']) for (const k of ['medium', 'standard']) e += ((r[V][k] - TANK.measured[V][k]) * 100) ** 2;
  return e;
}
let best = null;
const grid = [];
for (const K of [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]) for (const reS of [0.8e5, 1.0e5, 1.5e5, 2e5, 3e5]) for (const n of [1.5, 2.5, 3.5]) {
  const r = tankDeltas({ sepK: K, sepRe: reS, sepN: n });
  const e = sse(r);
  grid.push({ K, reS, n, sse: +e.toFixed(4) });
  if (!best || e < best.e) best = { K, reS, n, e, r };
}
const noSep = tankDeltas({ sepK: 0 });
const current = tankDeltas({});
console.log('1. Bulb tow tests (Gilbert & Bantock, MY #184): speed gain vs 250 mm bulb at constant tow force');
console.log('   measured          0.5 m/s: 300 mm +1.40%  350 mm +1.90% | 1.0 m/s: 300 mm +0.60%  350 mm ~+0.60%');
const show = (lab, r) => console.log(`   ${lab.padEnd(18)}0.5 m/s: 300 mm ${pct(r['0.5'].medium)} 350 mm ${pct(r['0.5'].standard)} | 1.0 m/s: 300 mm ${pct(r['1'].medium)} 350 mm ${pct(r['1'].standard)}`);
show('friction+FF only', noSep);
show(`best fit`, best.r);
show('model default', current);
console.log(`   best fit: K=${best.K} reS=${best.reS} n=${best.n} (rms error ${Math.sqrt(best.e / 4).toFixed(2)} %-points); default in code: ${JSON.stringify(BULB_SEP)}`);
console.log(`   bulb L/D: ${JSON.stringify(best.r['0.5'].fineness)}`);
out.bulbTank = { measured: TANK.measured, frictionOnly: noSep, bestFit: { K: best.K, reS: best.reS, n: best.n, rmsPctPts: Math.sqrt(best.e / 4), r: best.r }, modelDefault: current, grid };

// ---------------------------------------------------------------- 2. fin wetted area (RG65 tow tests)
// Gilbert & Bantock, "Wetted surface area", AMYA MY #183: RG65 with fins of 245 vs 270 cm2 (+2.3 % of total
// wetted area): long fin slower by 4.7 % (0.45 m/s), 3.8 % (0.65 m/s), 0.7 % (1.2 m/s).
// Model: IOM with the same relative wetted-area increase, at Froude-equivalent speeds (x sqrt(0.99/0.65)).
{
  const base = mergeDesign(DEFAULT_DESIGN, {});
  const s0 = computeStatics(base, 'A');
  const totalWet = s0.hull.S + s0.fin.wet + s0.rudder.wet + s0.bulb.S;
  const dS = 0.023 * totalWet;                                  // +2.3 % of the total wetted area
  const scale = 1 + dS / s0.fin.wet;
  const big = mergeDesign(DEFAULT_DESIGN, { fin: { rootChord: DEFAULT_DESIGN.fin.rootChord * scale, tipChord: DEFAULT_DESIGN.fin.tipChord * scale } });
  const s1 = computeStatics(big, 'A');
  const rows = [];
  for (const [Vrg, meas] of [[0.45, -0.047], [0.65, -0.038], [1.2, -0.007]]) {
    const V0 = Vrg * Math.sqrt(0.99 / 0.65);
    const F = uprightResistance(V0, s0, base).total;
    const v1 = towSpeed(big, s1, F, V0);
    rows.push({ Vrg65: Vrg, Viom: +V0.toFixed(3), measured: meas, model: +(v1 / V0 - 1).toFixed(4) });
  }
  console.log('\n2. Extra fin wetted area (+2.3 % of total; RG65 tow tests, MY #183): speed change at constant force');
  for (const r of rows) console.log(`   RG65 ${r.Vrg65} m/s (IOM ${r.Viom}): measured ${pct(r.measured)}  model ${pct(r.model)}`);
  out.finArea = rows;
}

// ---------------------------------------------------------------- 3. stability
// Bantock (Seahorse Feb 2009): GZ(40 deg), No1 rig, standard weights: 115 mm at 135 mm BWL (no form stability),
// +25 mm per +50 mm of BWL. Gilbert & Bantock MY #173: M 20–90 mm above the WL; TS2 158, Pikanto 134, Scharmer 117 mm.
{
  const rows = [];
  for (const bwl of [0.135, 0.155, 0.175, 0.195, 0.215]) {
    const s = computeStatics(mergeDesign(DEFAULT_DESIGN, { hull: { bwl } }), 'A');
    rows.push({ bwl, gz40: +(s.gz40 * 1000).toFixed(1), bantock: +(115 + 0.5 * (bwl - 0.135) * 1000).toFixed(1), zM: +(s.zM * 1000).toFixed(1), zG: +(s.zG * 1000).toFixed(1), Tc: +(s.hull.Tc * 1000).toFixed(1), S: +s.hull.S.toFixed(4) });
  }
  console.log('\n3. Righting arm at 40 deg (A rig) vs Bantock/Hydromax trend');
  for (const r of rows) console.log(`   BWL ${r.bwl * 1000} mm: GZ40 model ${r.gz40} mm  Bantock ${r.bantock} mm  (M ${r.zM} mm, G ${r.zG} mm, Tc ${r.Tc} mm, S ${r.S} m2)`);
  const slope = (rows[4].gz40 - rows[0].gz40) / 80;
  console.log(`   slope model ${slope.toFixed(2)} mm/mm vs Bantock 0.50; canoe-body wetted area at 160 mm BWL ~0.142 m2 (Bantock practical minimum)`);
  out.stability = { rows, slope };
}

// ---------------------------------------------------------------- 4. rig in the tunnel
// Southampton tunnel, IOM A rig, 4.3 m/s apparent: AWA 30 drive 2.5–3.5 N, heel force up to 10 N; beam reach drive ~10 N.
{
  const rig = buildRig('A');
  const at = (awa) => { // stationary hull: V = 0, true = apparent
    const f = sailForces(rig, 4.3, awa, 0, 0, 1, rig.AR);
    return { awa, drive: +f.drive.toFixed(2), heel: +f.heelF.toFixed(2), cl: +f.cl.toFixed(2), cd: +f.cd.toFixed(3) };
  };
  const rows = [30, 40, 70, 90, 180].map(at);
  console.log('\n4. A rig at 4.3 m/s apparent (Southampton tunnel: AWA30 drive 2.5–3.5 N, heel <=10 N; AWA90 drive ~10 N)');
  for (const r of rows) console.log(`   AWA ${r.awa}: drive ${r.drive} N, heel force ${r.heel} N (Cl ${r.cl}, Cd ${r.cd})`);
  out.tunnel = rows;
}

// ---------------------------------------------------------------- 5. speeds
{
  const ev = evaluateBands(DEFAULT_DESIGN, { rigMode: 'auto' });
  console.log('\n5. Baseline VPP (TWS at 1.5 m):');
  const rows = ev.bands.map((b) => ({ tws: b.tws, rig: b.rig, up: { twa: +b.up.twa.toFixed(1), V: +b.up.V.toFixed(3), vmg: +b.up.vmg.toFixed(3), heel: +b.up.heel.toFixed(1), leeway: +b.up.leeway.toFixed(2) }, down: { twa: +b.down.twa.toFixed(1), V: +b.down.V.toFixed(3), vmg: +b.down.vmg.toFixed(3) } }));
  for (const r of rows) console.log(`   ${r.tws} kn rig ${r.rig}: up ${r.up.V} m/s @ ${r.up.twa}° (VMG ${r.up.vmg}, heel ${r.up.heel}°, leeway ${r.up.leeway}°) | down ${r.down.V} m/s @ ${r.down.twa}° (VMG ${r.down.vmg})`);
  console.log('   references: hull speed 1.34 sqrt(LWL ft) = 1.25 m/s (Gilbert uses 1.23–1.25); Robinson timed a Marblehead (LWL ~1.27 m)');
  console.log('   at 1.45 m/s upwind at ~30° heel -> Froude-scaled to an IOM ~1.28 m/s; Gilbert\'s scaled VPP: 1.17 m/s reach at the top of the A range.');
  out.speeds = rows;
  // rig crossover
  const cross = [];
  for (let tws = 6; tws <= 22; tws += 1) {
    const r = {};
    for (const k of ['A', 'B', 'C']) { const v = vmg(makeContext(DEFAULT_DESIGN, k, tws), 8); r[k] = 0.5 * (v.up.vmg + v.down.vmg); r[`${k}up`] = v.up.vmg; }
    const bestK = ['A', 'B', 'C'].reduce((a, b) => (r[a] >= r[b] ? a : b));
    const bestUp = ['A', 'B', 'C'].reduce((a, b) => (r[`${a}up`] >= r[`${b}up`] ? a : b));
    cross.push({ tws, best: bestK, bestUp, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(3)])) });
  }
  console.log('   rig choice by mean VMG / by upwind VMG vs TWS (kn at 1.5 m):');
  console.log('   ' + cross.map((c) => `${c.tws}:${c.best}/${c.bestUp}`).join(' '));
  out.rigCrossover = cross;
}

// ---------------------------------------------------------------- 6. resistance breakdown
{
  const s = computeStatics(DEFAULT_DESIGN, 'A');
  const rows = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5].map((V) => Object.fromEntries(Object.entries(uprightResistance(V, s, DEFAULT_DESIGN)).map(([k, v]) => [k, +v.toFixed(4)])));
  console.log('\n6. Upright resistance breakdown, baseline (N)');
  for (const r of rows) console.log(`   ${r.V} m/s: hull friction ${r.hullF}  residuary ${r.hullR}  fin ${r.fin}  rudder ${r.rudder}  bulb ${r.bulb}  total ${r.total}`);
  out.upright = rows;
}

fs.mkdirSync('docs/results/iom', { recursive: true });
fs.writeFileSync('docs/results/iom/validation.json', JSON.stringify(out, null, 1));
console.log('\nwrote docs/results/iom/validation.json');
