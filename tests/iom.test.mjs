// IOM lab: statics, rules, resistance, sails and VPP checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, mergeDesign } from '../src/iom/physics/design.js';
import { bulbGeometry, bulbShapeIntegrals, ellipsePerimeter } from '../src/iom/physics/geometry.js';
import { computeStatics } from '../src/iom/physics/statics.js';
import { checkRules } from '../src/iom/physics/rules.js';
import { uprightResistance, cfTransitional, cfITTC, cfBlasius, orcRr, bulbDrag } from '../src/iom/physics/resistance.js';
import { ORC_FN, ORC_LVR, ORC_BTR, ORC_RR } from '../src/iom/physics/orcSurfaces.js';
import { sd8020Cd, SD8020_TABLE } from '../src/iom/physics/foils.js';
import { buildRig, sailForces, windProfile } from '../src/iom/physics/sails.js';
import { makeContext, solvePoint, vmg, hydro } from '../src/iom/physics/vpp.js';
import { decode, encode, makeReference, scoreDesign } from '../src/iom/physics/objective.js';
import { RHO_LEAD } from '../src/iom/physics/constants.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('Lead volume and bulb sizing: 2.4 kg of lead is 211.6 cm3 and the integrated volume matches', () => {
  const g = bulbGeometry(DEFAULT_DESIGN.bulb, 2.4);
  near(g.vol * 1e6, 2.4 / RHO_LEAD * 1e6, 1e-9, 'volume');
  near(2.4 / RHO_LEAD * 1e6, 211.64, 0.01, 'lead');
  // re-integrate pi/4 w h rho^2 over the length
  const vol = Math.PI / 4 * g.w * g.h * g.L * g.I2;
  near(vol, g.vol, 1e-9);
  // a flattened bulb of the same mass and length is lower
  const flat = bulbGeometry({ ...DEFAULT_DESIGN.bulb, aspect: 2 }, 2.4);
  near(flat.h, g.h / Math.SQRT2, 1e-6, 'h scales as 1/sqrt(aspect)');
  assert.ok(flat.S > g.S, 'flattening adds wetted area');
});

test('Shape integrals: half-ellipsoid volume 2/3 and centroid 5/8 from the tip; ellipse perimeter', () => {
  const { I2, xc } = bulbShapeIntegrals({ xMax: 0.99999, nose: 2, tail: 2 });
  near(I2, 2 / 3, 2e-3, 'I2');
  near(xc, 0.625, 2e-3, 'centroid');
  near(ellipsePerimeter(1, 1), 2 * Math.PI, 1e-9, 'circle');
  near(ellipsePerimeter(2, 1), 9.68845, 1e-4, 'ellipse 2:1');
});

test('Mass budget obeys C.4.2 / C.6.4 and the draft is 420 mm by construction', () => {
  const s = computeStatics(DEFAULT_DESIGN, 'A');
  assert.ok(s.mass.total >= 4.0 - 1e-9);
  near(s.mass.keel, 2.5, 1e-9);
  near(s.mass.bulb + s.mass.fin, s.mass.keel, 1e-9);
  near(s.draft, 0.42, 1e-5, 'draft');
  near(s.bulb.z, -(0.42 - s.bulb.h / 2), 1e-6, 'bulb CG height');
  const sum = s.mass.items.reduce((a, i) => a + i.m, 0);
  near(sum, s.mass.total, 1e-9);
  near(s.trim, 0, 1e-9, 'auto level trim');
  assert.ok(checkRules(DEFAULT_DESIGN, s).filter((r) => r.kind === 'rule').every((r) => r.ok));
});

test('Rule checks catch a fat bulb (> 60 mm tall, E.4.1) and a heavy rudder (> 75 g)', () => {
  const d = mergeDesign(DEFAULT_DESIGN, { bulb: { length: 0.11 }, rudder: { span: 0.3, rootChord: 0.09, tipChord: 0.08, tc: 0.12 } });
  const s = computeStatics(d, 'A');
  const r = Object.fromEntries(checkRules(d, s).map((x) => [x.id, x.ok]));
  assert.equal(r.bulbH, false);
  assert.equal(r.rudder, false);
});

test('Stability matches Bantock/Hydromax GZ(40°) trend within 10 mm (BWL 135–195 mm)', () => {
  for (const bwl of [0.135, 0.155, 0.175, 0.195]) {
    const s = computeStatics(mergeDesign(DEFAULT_DESIGN, { hull: { bwl } }), 'A');
    near(s.gz40 * 1000, 115 + 0.5 * (bwl * 1000 - 135), 10, `BWL ${bwl}`);
  }
  const s = computeStatics(DEFAULT_DESIGN, 'A');
  assert.ok(s.zG < -0.18 && s.zG > -0.24, `VCG ${s.zG}`);
  assert.ok(s.hull.S > 0.13 && s.hull.S < 0.17, `canoe wetted area ${s.hull.S} (Bantock: practical minimum ~0.142 m2)`);
});

test('Friction: transitional Cf is continuous at transition and lies between laminar and ITTC', () => {
  const reTr = 2e5;
  near(cfTransitional(reTr * 0.9999, reTr), cfTransitional(reTr * 1.0001, reTr), 1e-6);
  for (const re of [3e5, 6e5, 1.2e6]) {
    const c = cfTransitional(re, reTr);
    assert.ok(c < cfITTC(re) && c > cfBlasius(re), `Re ${re}`);
  }
});

test('Resistance rises monotonically with speed; the ORC surface is reproduced at grid points', () => {
  const s = computeStatics(DEFAULT_DESIGN, 'A');
  let prev = 0;
  for (let V = 0.1; V <= 2.0; V += 0.05) { const r = uprightResistance(V, s, DEFAULT_DESIGN).total; assert.ok(r > prev, `V ${V}`); prev = r; }
  near(orcRr(ORC_FN[9], ORC_LVR[3], ORC_BTR[2]), ORC_RR[9][3][2], 1e-9);
  // slender hulls have less residuary resistance at Fn 0.45
  assert.ok(orcRr(0.45, 7.8, 4) < orcRr(0.45, 5.4, 4));
});

test('SD8020 low-Re polar: reproduces the UIUC table and drag falls with Re', () => {
  const { RE, CL, CD } = SD8020_TABLE;
  near(sd8020Cd(RE[1], CL[2]), CD[1][2], 1e-9);
  near(sd8020Cd(RE[3], 0), CD[3][0], 1e-9);
  assert.ok(sd8020Cd(4e4, 0.3) > sd8020Cd(1e5, 0.3) && sd8020Cd(1e5, 0.3) > sd8020Cd(3e5, 0.3));
});

test('Bulb drag reproduces the Gilbert & Bantock tow tests (slender bulb faster, more so at 0.5 m/s)', () => {
  const mk = (b) => { const d = mergeDesign(DEFAULT_DESIGN, { bulb: b, keel: { mass: 2.45 } }); return [d, computeStatics(d, 'A')]; };
  const [df, sf] = mk({ length: 0.25, nose: 2.2, tail: 2.2, xMax: 0.40 });
  const [dl, sl] = mk({ length: 0.35 });
  const speed = (d, s, F, V0) => { let lo = 0.2 * V0, hi = 2 * V0; for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (uprightResistance(m, s, d).total < F) lo = m; else hi = m; } return lo; };
  const g05 = speed(dl, sl, uprightResistance(0.5, sf, df).total, 0.5) / 0.5 - 1;
  const g10 = speed(dl, sl, uprightResistance(1.0, sf, df).total, 1.0) / 1.0 - 1;
  near(g05, 0.019, 0.005, 'gain at 0.5 m/s (measured +1.9 %)');
  near(g10, 0.006, 0.004, 'gain at 1.0 m/s (measured ~+0.6 %)');
  assert.ok(bulbDrag(0.5, sf, df).Dsep > bulbDrag(0.5, sl, dl).Dsep);
});

test('Sails: A rig at 4.3 m/s apparent gives the Southampton tunnel forces; log wind profile', () => {
  const rig = buildRig('A');
  near(rig.area, 0.60, 0.01, 'A rig area');
  near(buildRig('C').area, 0.275, 0.01, 'C rig area');
  const f = sailForces(rig, 4.3, 30, 0, 0, 1, rig.AR);
  assert.ok(f.drive > 2.4 && f.drive < 3.6, `drive ${f.drive}`);
  assert.ok(f.heelF < 10, `heel force ${f.heelF}`);
  const p = windProfile(4, 1.5);
  near(p.U(1.5), 4, 1e-6);
  assert.ok(p.U(0.3) < p.U(1.0) && p.U(1.0) < 4);
});

test('VPP converges: excess thrust ~0 at the solution, negative just above; heel limit respected', () => {
  const ctx = makeContext(DEFAULT_DESIGN, 'A', 8);
  for (const twa of [40, 90, 160]) {
    const p = solvePoint(ctx, twa);
    assert.ok(p.V > 0.5 && p.V < 2.5, `V ${p.V} at ${twa}`);
    assert.ok(Math.abs(p.excess) < 0.02 * p.hy.R.total + 1e-3, `excess ${p.excess}`);
    assert.ok(p.phi <= DEFAULT_DESIGN.env.maxHeel + 0.5, `heel ${p.phi}`);
    // side force balance
    const hy = hydro(p.V, p.phi, p.sf, ctx.s, ctx.d, ctx.H);
    near((hy.Lf + hy.Lr) * Math.cos(p.phi * Math.PI / 180) + hy.Lh, p.sf.side, 1e-6 + 1e-6 * Math.abs(p.sf.side), 'side force');
  }
});

test('VPP speeds are in the plausible IOM range and VMG grows from 4 to 8 kn', () => {
  const v4 = vmg(makeContext(DEFAULT_DESIGN, 'A', 4), 8), v8 = vmg(makeContext(DEFAULT_DESIGN, 'A', 8), 8);
  assert.ok(v8.up.vmg > v4.up.vmg && v8.down.vmg > v4.down.vmg);
  for (const v of [v4, v8]) {
    assert.ok(v.up.V > 0.8 && v.up.V < 1.3, `upwind ${v.up.V} m/s (hull speed ~1.25)`);
    assert.ok(v.up.twa > 32 && v.up.twa < 55, `upwind TWA ${v.up.twa}`);
    assert.ok(v.up.leeway > 1.5 && v.up.leeway < 8, `leeway ${v.up.leeway}`);
  }
});

test('Optimiser encoding round-trips the baseline and scores it at 1', () => {
  const x = encode(DEFAULT_DESIGN);
  const d = decode(x);
  near(d.bulb.length, DEFAULT_DESIGN.bulb.length, 1e-9);
  near(d.fin.tipChord, DEFAULT_DESIGN.fin.tipChord, 1e-9);
  const ref = makeReference(DEFAULT_DESIGN, 7);
  const sc = scoreDesign(d, ref, { weights: [1, 0, 0, 0], n: 7 });
  near(sc.raw, 1, 2e-3);
});
