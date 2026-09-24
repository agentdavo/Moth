import test from 'node:test';
import assert from 'node:assert/strict';
import { viscousLength, splusAt, dCfPercent, bestSpacing, meanDCf } from '../src/physics/riblet.js';
import { ribletFactor, ribletCurve } from '../src/physics/sections.js';

test('viscous length matches the research table (c = 80 mm)', () => {
  // docs/research/BIOINSPIRED_FOILS.md 8.2: U 10 m/s, x/c 0.3, Ue/U 1.0 -> 2.37 um; U 5, x/c 0.7, Ue/U 1.2 -> 4.08 um
  assert.ok(Math.abs(viscousLength(10, 0.08, 0.3, 1.0) * 1e6 - 2.37) < 0.05);
  assert.ok(Math.abs(viscousLength(5, 0.08, 0.7, 1.2) * 1e6 - 4.08) < 0.08);
});

test('30 um film sits near the optimum at Moth cruising speeds and hurts when too coarse', () => {
  const sp = splusAt(30, 12, 0.08, 0.5, 1.1);
  assert.ok(sp > 12 && sp < 18, `s+ ${sp}`);
  assert.ok(dCfPercent(30, 12, 0.08) < -7);
  assert.ok(dCfPercent(80, 15, 0.08) > 0, 'coarse riblets increase drag at speed');
  assert.ok(bestSpacing(8, 0.08) > bestSpacing(15, 0.08), 'faster -> finer riblets');
  assert.ok(meanDCf(30, 10, 30, 0.08) < meanDCf(60, 10, 30, 0.08), '30 um beats 60 um over 10-30 kn');
});

test('film factor scales reductions but not penalties', () => {
  assert.equal(ribletCurve(0), 0);
  assert.ok(Math.abs(ribletFactor(17, 0.5) - (1 + 0.5 * ribletCurve(17))) < 1e-12);
  assert.ok(Math.abs(ribletFactor(45, 0.5) - (1 + ribletCurve(45))) < 1e-12);
});
