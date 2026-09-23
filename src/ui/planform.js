// Exact plan and front views of a horizontal foil drawn from the same spanwise paths the
// vortex lattice uses (so winglets, feathers, crescents and tubercles look as modelled).
import { halfPaths, planformStats } from '../physics/geometry.js';

const INK = { line: '#e6edf3', dim: '#5f7282', grid: 'rgba(160,180,200,0.12)', fill: 'rgba(57,135,229,0.30)', ref: '#9fb0c0' };

function outlines(f) {
  const tub = f.tubercleAmp || 0;
  const paths = halfPaths(f, 24, tub > 0 ? 10 : 2);
  const lam = Math.max(0.1, f.tubercleWave || 0.3) * planformStats(f).mac;
  const out = [];
  for (const side of [1, -1]) {
    for (const p of paths) {
      const le = [], te = [], fr = [];
      for (const st of p) {
        const bump = tub > 0 && st.kind === 'main' ? tub * st.chord * Math.cos(2 * Math.PI * st.s / lam) : 0;
        le.push([side * st.P[1], st.P[0] + 0.25 * st.chord + bump]);
        te.push([side * st.P[1], st.P[0] - 0.75 * st.chord]);
        fr.push([side * st.P[1], st.P[2], st.tc * st.chord]);
      }
      out.push({ kind: p[0].kind, le, te, fr });
    }
  }
  return out;
}

/** Draw plan view (top) and front view (bottom) of design.main; `ref` is drawn dashed. */
export function drawPlanform(canvas, f, ref = null, { title = '' } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px Inter, system-ui, sans-serif';
  const shapes = [ref && { f: ref, dashed: true }, { f, dashed: false }].filter(Boolean);
  const all = shapes.map((s) => ({ ...s, o: outlines(s.f) }));
  const ys = all.flatMap((a) => a.o.flatMap((q) => [...q.le, ...q.te].map((p) => p[0])));
  const xs = all.flatMap((a) => a.o.flatMap((q) => [...q.le, ...q.te].map((p) => p[1])));
  const zs = all.flatMap((a) => a.o.flatMap((q) => q.fr.map((p) => p[1])));
  const ymax = Math.max(...ys.map(Math.abs)) * 1.05;
  const planH = h * 0.62, frontH = h - planH - 18;
  const sc = Math.min((w - 40) / (2 * ymax), (planH - 30) / (Math.max(...xs) - Math.min(...xs) + 0.02));
  const cx = w / 2, px0 = 22 + (Math.max(...xs)) * sc; // plan: x forward is up
  const P = (y, x) => [cx + y * sc, px0 - x * sc];
  const zmid = planH + 10 + frontH / 2 + (Math.max(...zs) + Math.min(...zs)) / 2 * sc;
  const F = (y, z) => [cx + y * sc, zmid - z * sc];
  // scale bar & titles
  ctx.fillStyle = INK.dim; ctx.fillText(`${title}  plan view (flow ↓)`, 8, 12);
  ctx.fillText('front view (looking aft)', 8, planH + 14);
  ctx.strokeStyle = INK.dim; ctx.beginPath(); ctx.moveTo(w - 118, 14); ctx.lineTo(w - 118 + 0.1 * sc, 14); ctx.stroke(); ctx.fillText('100 mm', w - 118 + 0.1 * sc + 4, 17);
  ctx.strokeStyle = INK.grid; ctx.beginPath(); ctx.moveTo(8, planH + 2); ctx.lineTo(w - 8, planH + 2); ctx.stroke();
  for (const a of all) {
    for (const q of a.o) {
      ctx.setLineDash(a.dashed ? [4, 4] : []);
      ctx.strokeStyle = a.dashed ? INK.ref : INK.line; ctx.lineWidth = a.dashed ? 1 : 1.4;
      ctx.beginPath();
      q.le.forEach(([y, x], i) => { const [u, v] = P(y, x); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
      for (let i = q.te.length - 1; i >= 0; i--) { const [u, v] = P(q.te[i][0], q.te[i][1]); ctx.lineTo(u, v); }
      ctx.closePath();
      if (!a.dashed) { ctx.fillStyle = q.kind === 'main' ? INK.fill : 'rgba(25,158,112,0.35)'; ctx.fill(); }
      ctx.stroke();
      // front view: centre line with thickness band
      ctx.beginPath();
      q.fr.forEach(([y, z, t], i) => { const [u, v] = F(y, z + t / 2); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
      for (let i = q.fr.length - 1; i >= 0; i--) { const [y, z, t] = q.fr[i]; const [u, v] = F(y, z - t / 2); ctx.lineTo(u, v); }
      ctx.closePath();
      if (!a.dashed) { ctx.fillStyle = q.kind === 'main' ? INK.fill : 'rgba(25,158,112,0.35)'; ctx.fill(); }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  // strut stub in the front view
  const [sx, sy] = F(0, 0); ctx.strokeStyle = INK.dim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 40); ctx.stroke(); ctx.lineWidth = 1;
}
