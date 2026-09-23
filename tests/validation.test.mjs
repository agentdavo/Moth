// Validation against published full-scale Moth data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bz09Design, PRESETS, mediumDesign } from '../src/physics/design.js';
import { buildLattice, planformStats } from '../src/physics/geometry.js';
import { solveLattice } from '../src/physics/vlm.js';
import { hydroForces } from '../src/physics/hydro.js';
import { MothModel } from '../src/physics/vpp.js';
import { DEG, KNOT, toKn } from '../src/physics/constants.js';

// Beaver & Zseleczky (2009) tow tank: Vendor-2 daggerboard T-foil, 20 ft/s, 18 in immersion,
// 180 lb lift -> total drag 9.73 lb (43.3 N): strut 10.5, spray 1.6, foil+junction 18.1, induced 11.3, wave 1.8 N
export function bz09Case() {
  const d = JSON.parse(JSON.stringify(bz09Design));
  const depth = 0.457;
  const lat = buildLattice(d, 0, d.mainStrut.length - depth);
  lat.panels = lat.panels.filter((p) => p.surf === 'main' || p.surf === 'mstrut');
  const sol = solveLattice(lat.panels, 1);
  const V = 6.096;
  // find incidence change (theta) giving 801 N of lift at zero flap
  let th = 0;
  for (let i = 0; i < 30; i++) {
    const h = hydroForces(sol, lat, d, { V, theta: th, df: 0, de: 0, beta: 0 });
    const h2 = hydroForces(sol, lat, d, { V, theta: th + 1e-3, df: 0, de: 0, beta: 0 });
    const L = h.S.main.F[2], dL = (h2.S.main.F[2] - L) / 1e-3;
    th += (801 - L) / dL;
    if (Math.abs(801 - L) < 0.1) break;
  }
  // exclude the rudder spray/junction (only one T-foil in the tank)
  const h = hydroForces(sol, lat, d, { V, theta: th, df: 0, de: 0, beta: 0 });
  const S = h.S;
  const strutProfile = S.mstrut.profile;
  const foilProfile = S.main.profile;
  return { h, th, strutProfile, foilProfile, induced: S.main.induced + S.mstrut.induced, spray: h.drag.spray / 2, junction: h.drag.junction / 2, wave: h.drag.wave };
}

test('BZ09 T-foil drag breakdown within tolerance of tow-tank data', () => {
  const r = bz09Case();
  const total = r.strutProfile + r.foilProfile + r.induced + r.spray + r.junction + r.wave;
  console.log('BZ09 model:', { total: total.toFixed(1), strut: r.strutProfile.toFixed(1), spray: r.spray.toFixed(1), foilJunction: (r.foilProfile + r.junction).toFixed(1), induced: r.induced.toFixed(1), wave: r.wave.toFixed(1), alphaDeg: (r.th / DEG).toFixed(2) });
  assert.ok(Math.abs(total - 43.3) / 43.3 < 0.2, `total drag ${total}`);
  assert.ok(Math.abs(r.induced - 11.3) / 11.3 < 0.35, `induced ${r.induced}`);
  assert.ok(Math.abs(r.foilProfile + r.junction - 18.1) / 18.1 < 0.3, `foil+junction ${r.foilProfile + r.junction}`);
});

test('Take-off speeds in the published 7-10 kn range, ordered light < medium < strong', () => {
  const v = Object.fromEntries(Object.entries(PRESETS).map(([k, d]) => [k, toKn(new MothModel(d).takeoffSpeed())]));
  console.log('take-off kn', v);
  assert.ok(v.light < v.medium && v.medium < v.strong);
  assert.ok(v.light > 6 && v.strong < 12);
});

test('Medium design VPP speeds in published envelope', () => {
  const m = new MothModel(mediumDesign);
  const ev = m.evaluate(undefined, { skipMinTWS: true });
  const up = toKn(ev.bands.medium.up.V), dn = toKn(ev.bands.medium.down.V);
  console.log('medium band up/down kn', up.toFixed(1), dn.toFixed(1), 'strong', toKn(ev.bands.strong.up.V).toFixed(1), toKn(ev.bands.strong.down.V).toFixed(1));
  assert.ok(up > 11 && up < 20, `upwind ${up}`);
  assert.ok(dn > 16 && dn < 28, `downwind ${dn}`);
});
