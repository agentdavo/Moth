// Parameter panel generated from a schema. Values live in the design object (by path)
// or in the condition object ("cond." prefix).
import { FAMILIES } from '../physics/sections.js';
import { getPath, setPath } from '../physics/design.js';
import { SHAPES } from '../physics/shapes.js';

const SHAPE_DEFAULTS = { dihedralInner: 0, crescent: 0, crescentStart: 0.6, wingletHeight: 0, wingletCant: 90, feathers: 0, featherStart: 0.8, featherSpread: 24, featherFan: 14, tubercleAmp: 0, tubercleWave: 0.3, riblet: 0 };

const fam = Object.entries(FAMILIES).map(([k, f]) => [k, f.label]);

export const SCHEMA = [
  { title: 'Sailing condition', items: [
    ['cond.tws', 'True wind', 4, 26, 0.5, 1, 'kn', 1],
    ['cond.twa', 'True wind angle', 32, 170, 1, 1, '°', 0],
    ['cond.heel', 'Windward heel', 0, 28, 0.5, 1, '°', 1],
    ['boat.rideHeight', 'Ride height (keel)', 0.45, 1.0, 0.01, 1, 'm', 2],
  ] },
  { title: 'Main foil', items: [
    ['main.span', 'Span', 0.75, 1.25, 0.005, 1000, 'mm', 0],
    ['main.rootChord', 'Root chord', 0.07, 0.16, 0.001, 1000, 'mm', 0],
    ['main.taper', 'Taper c_tip/c_root', 0.2, 1.0, 0.01, 1, '', 2],
    ['main.ellipticity', 'Ellipticity', 0, 1, 0.01, 1, '', 2],
    ['main.sweep', '¼-chord sweep', -5, 15, 0.5, 1, '°', 1],
    ['main.twist', 'Tip twist', -4, 2, 0.1, 1, '°', 1],
    ['main.dihedral', 'Tip dihedral', -20, 12, 0.5, 1, '°', 1],
    ['main.dihedralStart', 'Dihedral from η', 0.2, 0.95, 0.01, 1, '', 2],
    ['main.tcRoot', 't/c root', 0.07, 0.16, 0.001, 100, '%', 1],
    ['main.tcTip', 't/c tip', 0.06, 0.15, 0.001, 100, '%', 1],
    ['main.cli', 'Design c_l (camber)', 0, 0.7, 0.01, 1, '', 2],
    ['main.family', 'Section family', fam],
    ['main.flapFrac', 'Flap chord', 0.15, 0.5, 0.01, 100, '%', 0],
    ['main.flapSpan', 'Flap span', 0.4, 1.0, 0.01, 100, '%', 0],
    ['main.incidence', 'Incidence', -2, 4, 0.1, 1, '°', 1],
  ] },
  { title: 'Nature-inspired planform', items: [
    ['shape', 'Shape library', 'SHAPES'],
    ['main.dihedralInner', 'Gull inner dihedral', 0, 20, 0.5, 1, '°', 1],
    ['main.crescent', 'Crescent tip rake', 0, 50, 0.5, 1, '°', 1],
    ['main.crescentStart', 'Crescent from η', 0.2, 0.95, 0.01, 1, '', 2],
    ['main.wingletHeight', 'Winglet height', 0, 0.15, 0.002, 1000, 'mm', 0],
    ['main.wingletCant', 'Winglet cant', -90, 90, 1, 1, '°', 0],
    ['main.feathers', 'Tip feathers (N)', 0, 7, 1, 1, '', 0],
    ['main.featherStart', 'Feathers from η', 0.55, 0.95, 0.01, 1, '', 2],
    ['main.featherSpread', 'Feather fan (dihedral)', 0, 50, 1, 1, '°', 0],
    ['main.featherFan', 'Feather fan (plan)', 0, 30, 1, 1, '°', 0],
    ['main.tubercleAmp', 'Tubercle amplitude A/c', 0, 0.15, 0.005, 100, '%', 1],
    ['main.tubercleWave', 'Tubercle wavelength λ/c', 0.1, 0.8, 0.01, 1, '', 2],
    ['main.riblet', 'Riblet spacing', 0, 150, 1, 1, 'µm', 0],
  ] },
  { title: 'Rudder elevator', items: [
    ['elevator.span', 'Span', 0.5, 0.95, 0.005, 1000, 'mm', 0],
    ['elevator.rootChord', 'Root chord', 0.04, 0.11, 0.001, 1000, 'mm', 0],
    ['elevator.taper', 'Taper', 0.2, 1.0, 0.01, 1, '', 2],
    ['elevator.ellipticity', 'Ellipticity', 0, 1, 0.01, 1, '', 2],
    ['elevator.sweep', 'Sweep', -5, 15, 0.5, 1, '°', 1],
    ['elevator.dihedral', 'Gull / anhedral', -25, 10, 0.5, 1, '°', 1],
    ['elevator.tcRoot', 't/c root', 0.07, 0.14, 0.001, 100, '%', 1],
    ['elevator.cli', 'Design c_l', -0.2, 0.4, 0.01, 1, '', 2],
    ['elevator.incidence', 'Incidence', -3, 5, 0.1, 1, '°', 1],
    ['elevator.x', 'Position aft', -2.6, -1.8, 0.01, -1, 'm', 2],
    ['elevator.z', 'Height above main', -0.1, 0.3, 0.01, 1, 'm', 2],
  ] },
  { title: 'Struts', items: [
    ['mainStrut.length', 'Main length', 0.9, 1.25, 0.005, 1, 'm', 2],
    ['mainStrut.chord', 'Main chord', 0.07, 0.14, 0.001, 1000, 'mm', 0],
    ['mainStrut.tc', 'Main t/c', 0.08, 0.16, 0.001, 100, '%', 1],
    ['mainStrut.family', 'Main section', fam],
    ['rudderStrut.chord', 'Rudder chord', 0.07, 0.13, 0.001, 1000, 'mm', 0],
    ['rudderStrut.tc', 'Rudder t/c', 0.08, 0.15, 0.001, 100, '%', 1],
  ] },
  { title: 'Control system', collapsed: true, items: [
    ['boat.flapMin', 'Flap min', -14, 0, 0.5, 1, '°', 1],
    ['boat.flapMax', 'Flap max', 4, 18, 0.5, 1, '°', 1],
    ['boat.elevMin', 'Rake min', -6, 0, 0.5, 1, '°', 1],
    ['boat.elevMax', 'Rake max', 0, 8, 0.5, 1, '°', 1],
    ['boat.wandLength', 'Wand length', 0.8, 1.5, 0.01, 1, 'm', 2],
    ['boat.wandGearing', 'Wand gearing', 0.05, 1.5, 0.01, 1, '°/°', 2],
    ['boat.elevLoadTarget', 'Elevator load target', -0.1, 0.25, 0.005, 100, '%W', 1],
    ['boat.takeoffPitch', 'Take-off pitch', 0, 6, 0.1, 1, '°', 1],
  ] },
  { title: 'Boat, sailor & rig', collapsed: true, items: [
    ['boat.sailorMass', 'Sailor mass', 55, 100, 0.5, 1, 'kg', 1],
    ['boat.hullMass', 'Boat all-up', 26, 45, 0.5, 1, 'kg', 1],
    ['boat.hikeMax', 'Hiking arm', 1.0, 1.6, 0.01, 1, 'm', 2],
    ['boat.windageCdA', 'Windage CdA', 0.3, 0.8, 0.01, 1, 'm²', 2],
    ['boat.ceAboveDeck', 'Sail CE height', 1.7, 2.5, 0.01, 1, 'm', 2],
    ['boat.finish', 'Surface finish', 0.3, 1.2, 0.01, 1, '×', 2],
    ['boat.junctionFactor', 'Junction fairing', 0.3, 1.2, 0.01, 1, '×', 2],
  ] },
];

export function buildControls(root, getState, onChange, onShape = null) {
  root.innerHTML = '';
  const outputs = [];
  for (const g of SCHEMA) {
    const sec = document.createElement('div');
    sec.className = 'group' + (g.collapsed ? ' collapsed' : '');
    const h = document.createElement('h4');
    h.innerHTML = `${g.title} <small>${g.collapsed ? '▸' : '▾'}</small>`;
    h.onclick = () => { sec.classList.toggle('collapsed'); h.querySelector('small').textContent = sec.classList.contains('collapsed') ? '▸' : '▾'; };
    sec.appendChild(h);
    for (const it of g.items) {
      const [path, label] = it;
      const row = document.createElement('div');
      row.className = 'ctl';
      const lab = document.createElement('label'); lab.textContent = label; lab.title = path;
      row.appendChild(lab);
      const read = () => {
        const s = getState();
        if (path === 'shape') return s.design.shape || 'baseline';
        const v = path.startsWith('cond.') ? s.cond[path.slice(5)] : getPath(s.design, path);
        return v ?? SHAPE_DEFAULTS[path.split('.').pop()] ?? 0;
      };
      const write = (v) => { const s = getState(); if (path.startsWith('cond.')) s.cond[path.slice(5)] = v; else setPath(s.design, path, v); onChange(path); };
      if (it[2] === 'SHAPES') {
        const sel = document.createElement('select');
        sel.id = 'shapeSelect';
        for (const [k, sh] of Object.entries(SHAPES)) { const o = document.createElement('option'); o.value = k; o.textContent = sh.label; sel.appendChild(o); }
        sel.onchange = () => onShape && onShape(sel.value);
        row.appendChild(sel);
        outputs.push(() => { sel.value = read(); });
      } else if (Array.isArray(it[2])) {
        const sel = document.createElement('select');
        for (const [k, l] of it[2]) { const o = document.createElement('option'); o.value = k; o.textContent = l; sel.appendChild(o); }
        sel.onchange = () => write(sel.value);
        row.appendChild(sel);
        outputs.push(() => { sel.value = read(); });
      } else {
        const [, , min, max, step, scale, unit, dig] = it;
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
        const out = document.createElement('output');
        const show = () => { const v = read(); inp.value = v; out.textContent = `${(v * scale).toFixed(dig)}${unit && unit.length < 3 ? unit : ''}`; out.title = unit; };
        inp.oninput = () => { write(parseFloat(inp.value)); show(); };
        row.appendChild(inp); row.appendChild(out);
        outputs.push(show);
      }
      sec.appendChild(row);
    }
    if (g.title === 'Nature-inspired planform') {
      const d = document.createElement('div'); d.className = 'derived shape-note'; d.id = 'shapeNote'; sec.appendChild(d);
    }
    if (g.title === 'Main foil' || g.title === 'Rudder elevator') {
      const d = document.createElement('div'); d.className = 'derived'; d.dataset.derived = g.title; sec.appendChild(d);
    }
    root.appendChild(sec);
  }
  return () => outputs.forEach((f) => f());
}
