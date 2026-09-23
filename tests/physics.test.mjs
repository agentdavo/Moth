// Unit checks of the physics building blocks against theory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediumDesign } from '../src/physics/design.js';
import { buildLattice, planformStats } from '../src/physics/geometry.js';
import { solveLattice, evalLattice } from '../src/physics/vlm.js';
import { flapTau, cavitationNumber, sectionCd } from '../src/physics/sections.js';
import { buildFlightModel, linearStability } from '../src/physics/dynamics.js';
import { SepCMAES } from '../src/physics/optimizer.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

function ellipticWing(depthBelow = null) {
  const d = clone(mediumDesign);
  Object.assign(d.main, { ellipticity: 1, taper: 0.0001, sweep: 0, twist: 0, cli: 0, incidence: 0, dihedral: 0, span: 1.0, rootChord: 0.1, nHalf: 20 });
  const lat = buildLattice(d, 0, depthBelow === null ? -20 : d.mainStrut.length - depthBelow);
  const panels = lat.panels.filter((p) => p.surf === 'main');
  const sol = solveLattice(panels, depthBelow === null ? 0 : 1);
  const a = 0.05;
  const r = evalLattice(sol, [1, a, 0, 0, 0]);
  let L = 0, D = 0;
  for (let i = 0; i < sol.N; i++) { L += r.f[i * 3 + 2]; D += -r.f[i * 3] + a * r.f[i * 3 + 2]; }
  const S = planformStats(d.main).area;
  return { CL: L / (0.5 * S), CD: D / (0.5 * S), AR: 1 / S, a };
}

test('VLM: elliptic wing lift slope matches Helmbold and span efficiency ~1', () => {
  const { CL, CD, AR, a } = ellipticWing();
  const helm = 2 * Math.PI * AR / (AR + 2);
  assert.ok(Math.abs(CL / a - helm) / helm < 0.03, `slope ${CL / a} vs ${helm}`);
  const e = CL * CL / (Math.PI * AR * CD);
  assert.ok(e > 0.95 && e < 1.06, `e = ${e}`);
});

test('Free surface (phi=0 image) reduces lift and raises induced drag near the surface', () => {
  const deep = ellipticWing();
  const near = ellipticWing(0.15);
  assert.ok(near.CL < deep.CL * 0.96);
  const kDeep = deep.CD / deep.CL ** 2, kNear = near.CD / near.CL ** 2;
  assert.ok(kNear > kDeep * 1.1, `k ${kNear} vs ${kDeep}`);
});

test('Thin-aerofoil flap effectiveness table (tau)', () => {
  for (const [E, tau] of [[0.2, 0.55], [0.3, 0.66], [0.4, 0.75]]) assert.ok(Math.abs(flapTau(E) - tau) < 0.01, `${E}: ${flapTau(E)}`);
});

test('Cavitation number and inception speed ~35 kn for -Cp_min 0.6', () => {
  // research table: -Cp_min 0.6 -> ~35 kn inception at shallow depth
  let V = 5;
  while (cavitationNumber(V, 0.25) > 0.6) V += 0.05;
  const kn = V / 0.514444;
  assert.ok(kn > 33 && kn < 38, `${kn}`);
});

test('Section drag lands in the measured Moth foil range (0.0075-0.012 at Re 6e5)', () => {
  const cd = sectionCd({ family: 'eppler', tc: 0.11, cli: 0.35, flapped: true }, 0.4, 6e5, 0, 0, 1);
  assert.ok(cd > 0.0075 && cd < 0.012, `${cd}`);
});

test('Wand gearing: damping falls when the wand is over-geared (porpoising)', () => {
  const z = [0.5, 3.0].map((g) => linearStability(buildFlightModel(mediumDesign, 7.5, { gearing: g })).minZeta);
  assert.ok(z[0] > 0.2 && z[1] < z[0] * 0.5, `${z}`);
});

test('sep-CMA-ES minimises a shifted sphere', () => {
  const es = new SepCMAES(new Array(6).fill(0.5), { sigma: 0.2, seed: 3 });
  for (let g = 0; g < 80; g++) { const pop = es.ask(); es.tell(pop, pop.map((p) => -p.x.reduce((s, v) => s + (v - 0.3) ** 2, 0))); }
  assert.ok(es.best.score > -1e-4, `${es.best.score}`);
});
