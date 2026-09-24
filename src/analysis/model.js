// Model polar overlays (DOM-free).
//
// A model is anything with   speed(twa°, tws m/s) -> m/s   and   bestVMG('up'|'down', tws) -> {twa, speed, vmg}.
// PolarModel wraps one or more polar tables  {tws, points:[{twa, speed}]}  (m/s unless unit: 'kn'),
// interpolating linearly in TWA and between tables in TWS (clamped to the table range).
// The Moth tables come from MothModel (src/physics/vpp.js) via model.worker.js; the IOM lab
// (built separately) can export the same JSON and load it with "Import polar".
import { KN, interp1 } from './util.js';

export class PolarModel {
  constructor(name, tables, info = '') {
    this.name = name; this.info = info;
    this.tables = tables.map((t) => {
      const points = t.points.slice().sort((a, b) => a.twa - b.twa);
      // points may carry foiling: true/false (Moth VPP); each regime is interpolated on its own,
      // never across the take-off / touch-down discontinuity
      const flagged = points.some((p) => p.foiling === false) && points.some((p) => p.foiling === true);
      // branches = runs of consecutive points (by TWA) in the same regime
      const branches = [];
      for (const p of points) {
        const last = branches[branches.length - 1];
        if (flagged && last && !!last[0].foiling === !!p.foiling) last.push(p);
        else if (!flagged && last) last.push(p);
        else branches.push([p]);
      }
      return { tws: t.tws, points, best: t.best || null, branches: branches.filter((b) => b.length).map((b) => ({ foiling: flagged ? !!b[0].foiling : null, xs: b.map((p) => p.twa), ys: b.map((p) => p.speed) })) };
    }).sort((a, b) => a.tws - b.tws);
    this.hasRegimes = this.tables.some((t) => t.branches.length > 1);
  }
  /** prefer: 'foil' | 'hull' | undefined (foiling branch first, then hull-borne). */
  tableSpeed(tb, twa, prefer) {
    const a = Math.abs(twa);
    const order = tb.branches.slice().sort((x, y) => (prefer === 'hull' ? -1 : 1) * ((y.foiling === true) - (x.foiling === true)));
    for (const br of order) {
      if (prefer === 'foil' && br.foiling === false) continue;
      if (prefer === 'hull' && br.foiling === true) continue;
      if (a >= br.xs[0] - 1e-9 && a <= br.xs[br.xs.length - 1] + 1e-9) return br.xs.length === 1 ? br.ys[0] : interp1(br.xs, br.ys, a, true);
    }
    return NaN;
  }
  speed(twa, tws, prefer) {
    const T = this.tables;
    if (!T.length) return NaN;
    if (T.length === 1 || !Number.isFinite(tws) || tws <= T[0].tws) return this.tableSpeed(T[0], twa, prefer);
    if (tws >= T[T.length - 1].tws) return this.tableSpeed(T[T.length - 1], twa, prefer);
    let i = 0; while (T[i + 1].tws < tws) i++;
    const f = (tws - T[i].tws) / (T[i + 1].tws - T[i].tws);
    return (1 - f) * this.tableSpeed(T[i], twa, prefer) + f * this.tableSpeed(T[i + 1], twa, prefer);
  }
  bestVMG(dir, tws) {
    const [a, b] = dir === 'up' ? [20, 90] : [90, 180];
    let best = null;
    for (let t = a; t <= b; t += 0.5) {
      const v = this.speed(t, tws); if (!Number.isFinite(v)) continue;
      const vmg = Math.abs(v * Math.cos(t * Math.PI / 180));
      if (!best || vmg > best.vmg) best = { twa: t, speed: v, vmg };
    }
    return best;
  }
  /** Curves for drawing: one polyline per regime ([{foiling, pts:[{twa, speed}]}]). */
  curves(tws, step = 1) {
    const prefs = this.hasRegimes ? ['foil', 'hull'] : [undefined];
    return prefs.map((pr) => {
      const pts = [];
      for (let t = 0; t <= 180; t += step) { const v = this.speed(t, tws, pr); if (Number.isFinite(v)) pts.push({ twa: t, speed: v }); }
      return { foiling: pr === 'foil' ? true : pr === 'hull' ? false : null, pts };
    }).filter((c) => c.pts.length);
  }
}

/** Accepts {tws, points}, [{tws, points}, …] or {tables: [...]}, optional unit: 'kn' | 'm/s'. */
export function parsePolarJSON(obj, name = 'Imported polar') {
  if (typeof obj === 'string') obj = JSON.parse(obj);
  const unit = obj.unit || (Array.isArray(obj) ? obj[0]?.unit : null) || 'm/s';
  const list = Array.isArray(obj) ? obj : Array.isArray(obj.tables) ? obj.tables : Array.isArray(obj.bands) ? obj.bands : [obj]; // bands: IOM Keel Lab export
  const tables = list.map((t) => {
    const u = t.unit || unit;
    const f = /kn|kt/i.test(u) ? KN : 1;
    if (!Number.isFinite(+t.tws) || !Array.isArray(t.points)) throw new Error('polar table needs {tws, points:[{twa, speed}]}');
    return { tws: +t.tws * f, points: t.points.map((p) => ({ twa: +p.twa, speed: +(p.speed ?? p.v ?? p.bsp) * f })).filter((p) => Number.isFinite(p.twa) && Number.isFinite(p.speed)) };
  });
  return new PolarModel(obj.name || name, tables, obj.source || '');
}

/** TWAs used for the Moth overlay (kept short: each speedAt is ~20–60 ms). */
export const MOTH_TWAS = [38, 42, 46, 50, 55, 62, 75, 90, 105, 120, 132, 145, 160, 172];

/** Heel used for the Moth polar at a TWS (windward heel bands from src/physics/design.js). */
export function mothHeel(twa, tws) {
  const kn = tws / KN;
  const up = kn < 9 ? 12 : kn < 14 ? 17 : 20;
  const down = kn < 9 ? 4 : kn < 14 ? 6 : 8;
  return twa < 90 ? up : down;
}

/** Compute a Moth polar table with a MothModel instance (runs in the worker or in node). */
export function mothPolarTable(model, tws, twas = MOTH_TWAS) {
  const points = twas.map((twa) => {
    const cond = { tws, twa, heel: mothHeel(twa, tws) };
    const r = model.speedAt(cond) || model.displacementSpeed(cond);
    return { twa, speed: r.V, foiling: !!r.foiling };
  });
  const up = model.bestVMG(tws, 'up', mothHeel(45, tws));
  const dn = model.bestVMG(tws, 'down', mothHeel(135, tws));
  for (const b of [up, dn]) if (b && Number.isFinite(b.twa)) points.push({ twa: +b.twa.toFixed(1), speed: b.V, foiling: !!b.foiling, best: true });
  points.sort((a, b) => a.twa - b.twa);
  return { tws, points, best: { up: { twa: up.twa, speed: up.V, vmg: up.vmg }, down: { twa: dn.twa, speed: dn.V, vmg: dn.vmg } } };
}
