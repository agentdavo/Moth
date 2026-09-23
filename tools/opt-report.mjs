import fs from 'node:fs';
for (const t of ['light', 'medium', 'strong']) {
  const r = JSON.parse(fs.readFileSync(`docs/results/opt-${t}.json`));
  console.log('==', t, 'score', r.baseline.score.toFixed(3), '->', r.best.score.toFixed(3), 'pen', JSON.stringify(r.best.penalties), 'TO', r.baseline.takeoffKn.toFixed(1), '->', r.best.takeoffKn.toFixed(1), 'minTWS', r.baseline.minTWSkn.toFixed(1), '->', r.best.minTWSkn.toFixed(1), 'area', (r.baseline.main.area * 1e4).toFixed(0), '->', (r.best.main.area * 1e4).toFixed(0), 'AR', r.best.main.AR.toFixed(1), 'elev', (r.best.elev.area * 1e4).toFixed(0), 'vmax', r.best.vmaxKn.toFixed(1), 'cav', r.best.cavAtMax.toFixed(2), 'div', r.best.divergenceKn.toFixed(0), 'zeta', r.best.zeta.toFixed(2), 'defl', (r.best.defl * 100).toFixed(1));
  for (const b of ['light', 'medium', 'strong']) console.log('  ', b, 'up', r.baseline.bands[b].upVMG.toFixed(2), '->', r.best.bands[b].upVMG.toFixed(2), r.best.bands[b].upFoil, ' down', r.baseline.bands[b].downVMG.toFixed(2), '->', r.best.bands[b].downVMG.toFixed(2), r.best.bands[b].downFoil);
  console.log('  ', Object.entries(r.vars).map(([k, v]) => `${k.replace('main.', 'm.').replace('elevator.', 'e.')}=${+v.start.toFixed(3)}>${+v.best.toFixed(3)}`).join(' '));
}
