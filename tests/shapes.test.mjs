// Nature-inspired planform geometry and section models.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediumDesign } from '../src/physics/design.js';
import { halfPaths, planformStats, buildLattice } from '../src/physics/geometry.js';
import { solveLattice, evalLattice } from '../src/physics/vlm.js';
import { ribletFactor, tubercleEffects, sectionCd } from '../src/physics/sections.js';
import { SHAPES, applyShape } from '../src/physics/shapes.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

test('every shape family builds a valid lattice', () => {
  for (const k of Object.keys(SHAPES)) {
    const d = applyShape(mediumDesign, k);
    const lat = buildLattice(d, 12);
    assert.ok(lat.panels.length > 30, k);
    for (const p of lat.panels) assert.ok(p.ds > 0 && Number.isFinite(p.n[0]), `${k} panel`);
  }
});

test('winglets and feathers add paths; area-preserving families keep main area', () => {
  const w = applyShape(mediumDesign, 'wingletDown');
  assert.equal(halfPaths(w.main, 12).length, 2);
  const f = applyShape(mediumDesign, 'raptor');
  assert.equal(halfPaths(f.main, 12).length, 1 + 5);
  const a0 = planformStats(mediumDesign.main).area;
  for (const k of ['albatross', 'manta', 'tuna']) {
    const a = planformStats(applyShape(mediumDesign, k).main).area;
    assert.ok(Math.abs(a / a0 - 1) < 0.01, `${k} area ${a} vs ${a0}`);
  }
});

test('non-planar tips raise span efficiency in the lattice (deep water)', () => {
  const eOf = (d) => {
    const dd = clone(d); Object.assign(dd.main, { sweep: 0, twist: 0, cli: 0, incidence: 0, nHalf: 16 });
    const lat = buildLattice(dd, 0, -20);
    const panels = lat.panels.filter((p) => p.surf === 'main');
    const sol = solveLattice(panels, 0);
    const a = 0.05, r = evalLattice(sol, [1, a, 0, 0, 0]);
    let L = 0, D = 0;
    for (let i = 0; i < sol.N; i++) { L += r.f[i * 3 + 2]; D += -r.f[i * 3] + a * r.f[i * 3 + 2]; }
    return L * L / (Math.PI * dd.main.span ** 2 * 0.5 * D); // CL^2/(pi AR CD) with q=1/2
  };
  const base = eOf(mediumDesign);
  const wl = eOf(applyShape(mediumDesign, 'wingletDown'));
  assert.ok(wl > base * 1.02, `winglet e ${wl} vs ${base}`);
});

test('riblet curve: optimum ~s+ 17 (film ~ -8%), neutral ~30, penalty beyond', () => {
  assert.ok(ribletFactor(17) < 0.93 && ribletFactor(17) > 0.9);
  assert.ok(Math.abs(ribletFactor(30) - 1) < 0.005);
  assert.ok(ribletFactor(40) > 1.05);
});

test('tubercles at Moth Re: lower clmax and slope, extra drag, fade toward Re 1e6', () => {
  const lo = tubercleEffects(0.05, 0.3, 2e5), hi = tubercleEffects(0.05, 0.3, 1e6);
  assert.ok(lo.clmax < 0.9 && lo.slope < 1 && lo.dcd > 0);
  assert.ok(hi.clmax > lo.clmax);
  const cd0 = sectionCd({ family: 'eppler', tc: 0.11, cli: 0.3 }, 0.3, 4e5);
  const cdT = sectionCd({ family: 'eppler', tc: 0.11, cli: 0.3, tub: 0.05 }, 0.3, 4e5);
  assert.ok(cdT > cd0);
});
