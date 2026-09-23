// Lightweight canvas charts (line, bars, polar, scatter, heatmap) with hover tooltips.
// Thin 2px lines, recessive grid, legend + direct labels, one y-axis per chart.

const INK = { primary: '#e6edf3', secondary: '#9fb0c0', muted: '#5f7282', grid: 'rgba(160,180,200,0.12)', axis: 'rgba(160,180,200,0.35)' };

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px Inter, system-ui, sans-serif';
  return { ctx, w, h };
}

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function tooltip(canvas) {
  let tip = canvas.parentElement.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; canvas.parentElement.appendChild(tip); }
  return tip;
}

/**
 * series: [{ label, color, x: [], y: [], dash?, width? , marker? }]
 */
export function lineChart(canvas, { series, xlabel = '', ylabel = '', xlim, ylim, fmtX = (v) => v.toFixed(1), fmtY = (v) => v.toFixed(2), hline = null, zeroLine = false, legend = true }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 44, r: 10, t: legend && series.length > 1 ? 20 : 8, b: 30 };
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).filter(Number.isFinite);
  const [x0, x1] = xlim || [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = ylim || [Math.min(...ys), Math.max(...ys)];
  if (!ylim) { const m = (y1 - y0) * 0.08 || 0.5; y0 -= m; y1 += m; }
  const X = (v) => pad.l + (v - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - (v - y0) / (y1 - y0 || 1) * (h - pad.t - pad.b);
  ctx.strokeStyle = INK.grid; ctx.fillStyle = INK.muted; ctx.lineWidth = 1;
  for (const t of niceTicks(y0, y1, 4)) { ctx.beginPath(); ctx.moveTo(pad.l, Y(t)); ctx.lineTo(w - pad.r, Y(t)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(fmtY(t), pad.l - 5, Y(t) + 3); }
  for (const t of niceTicks(x0, x1, 6)) { ctx.textAlign = 'center'; ctx.fillText(fmtX(t), X(t), h - pad.b + 14); }
  ctx.fillStyle = INK.secondary; ctx.textAlign = 'center'; ctx.fillText(xlabel, (pad.l + w - pad.r) / 2, h - 3);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  if (zeroLine && y0 < 0 && y1 > 0) { ctx.strokeStyle = INK.axis; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke(); }
  if (hline) { ctx.strokeStyle = hline.color || INK.axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad.l, Y(hline.y)); ctx.lineTo(w - pad.r, Y(hline.y)); ctx.stroke(); ctx.setLineDash([]); if (hline.label) { ctx.fillStyle = INK.secondary; ctx.textAlign = 'left'; ctx.fillText(hline.label, pad.l + 4, Y(hline.y) - 4); } }
  ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, w - pad.l - pad.r, h - pad.t - pad.b + 4); ctx.clip();
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let pen = false;
    s.x.forEach((xv, i) => { const yv = s.y[i]; if (!Number.isFinite(yv)) { pen = false; return; } if (!pen) ctx.moveTo(X(xv), Y(yv)); else ctx.lineTo(X(xv), Y(yv)); pen = true; });
    ctx.stroke(); ctx.setLineDash([]);
    if (s.marker) { ctx.fillStyle = s.color; s.x.forEach((xv, i) => { if (!Number.isFinite(s.y[i])) return; ctx.beginPath(); ctx.arc(X(xv), Y(s.y[i]), 4, 0, 7); ctx.fill(); }); }
  }
  ctx.restore();
  if (legend && series.length > 1) {
    let lx = pad.l;
    for (const s of series) { ctx.fillStyle = s.color; ctx.fillRect(lx, 6, 12, 3); ctx.fillStyle = INK.secondary; ctx.textAlign = 'left'; ctx.fillText(s.label, lx + 16, 11); lx += ctx.measureText(s.label).width + 30; }
  }
  // hover crosshair
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const xv = x0 + (mx - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
    const rows = series.map((s) => { let bi = 0; s.x.forEach((v, i) => { if (Math.abs(v - xv) < Math.abs(s.x[bi] - xv)) bi = i; }); return `<span style="color:${s.color}">■</span> ${s.label}: <b>${Number.isFinite(s.y[bi]) ? fmtY(s.y[bi]) : '–'}</b>`; });
    tip.innerHTML = `${xlabel} ${fmtX(xv)}<br>${rows.join('<br>')}`;
    tip.style.display = 'block'; tip.style.left = `${Math.min(mx + 12, w - 150)}px`; tip.style.top = '8px';
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/** Horizontal stacked-free bar list: items [{label, value, color, note}] */
export function barList(canvas, items, { unit = 'N', fmt = (v) => v.toFixed(1) } = {}) {
  const { ctx, w, h } = setup(canvas);
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const rowH = Math.min(24, (h - 6) / items.length);
  const lw = 104;
  items.forEach((it, k) => {
    const y = 4 + k * rowH;
    ctx.fillStyle = INK.secondary; ctx.textAlign = 'left'; ctx.fillText(it.label, 2, y + rowH * 0.62);
    const bw = (w - lw - 70) * it.value / max;
    ctx.fillStyle = it.color;
    const bh = Math.max(6, rowH - 9);
    ctx.beginPath(); ctx.roundRect(lw, y + (rowH - bh) / 2, Math.max(2, bw), bh, [0, 4, 4, 0]); ctx.fill();
    ctx.fillStyle = INK.primary; ctx.fillText(`${fmt(it.value)} ${unit}`, lw + bw + 6, y + rowH * 0.62);
  });
}

/** Boat-speed polar: bands [{label,color, pts:[{twa,kn,foiling}]}] */
export function polarChart(canvas, bands, { maxKn } = {}) {
  const { ctx, w, h } = setup(canvas);
  const cx = 24, cy = h / 2 + 6, R = Math.min(w - 70, h / 2 - 20);
  const mk = maxKn || Math.ceil(Math.max(...bands.flatMap((b) => b.pts.map((p) => p.kn))) / 5) * 5;
  ctx.strokeStyle = INK.grid; ctx.fillStyle = INK.muted;
  for (let k = 5; k <= mk; k += 5) { ctx.beginPath(); ctx.arc(cx, cy, R * k / mk, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.fillText(`${k}`, cx + 2, cy - R * k / mk - 2); }
  for (let a = 0; a <= 180; a += 30) { const t = a * Math.PI / 180; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(t), cy - R * Math.cos(t)); ctx.stroke(); ctx.fillText(`${a}°`, cx + (R + 8) * Math.sin(t) - 6, cy - (R + 8) * Math.cos(t) + 4); }
  const P = (p) => [cx + R * p.kn / mk * Math.sin(p.twa * Math.PI / 180), cy - R * p.kn / mk * Math.cos(p.twa * Math.PI / 180)];
  for (const b of bands) {
    ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.beginPath();
    b.pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    for (const p of b.pts) { const [x, y] = P(p); ctx.fillStyle = p.foiling ? b.color : '#0e1822'; ctx.strokeStyle = b.color; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // legend (3 series: swatch + label, top right)
  bands.forEach((b, i) => { const y = 12 + i * 15; ctx.fillStyle = b.color; ctx.fillRect(w - 112, y - 7, 12, 3); ctx.fillStyle = INK.secondary; ctx.textAlign = 'left'; ctx.fillText(b.label, w - 96, y - 3); });
  ctx.fillStyle = INK.muted; ctx.fillText('kn · ○ = not foiling', w - 110, h - 4);
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 18;
    for (const b of bands) for (const p of b.pts) { const [x, y] = P(p); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = { b, p }; } }
    if (!best) { tip.style.display = 'none'; return; }
    tip.innerHTML = `${best.b.label} · TWA ${best.p.twa}°<br><b>${best.p.kn.toFixed(1)} kn</b> ${best.p.foiling ? 'foiling' : 'displacement'}`;
    tip.style.display = 'block'; tip.style.left = `${Math.min(mx + 10, w - 140)}px`; tip.style.top = `${my}px`;
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/** Scatter with optional highlighted points: pts [{x,y,color,r,label}] */
export function scatter(canvas, pts, { xlabel, ylabel, fmtX = (v) => v.toFixed(2), fmtY = (v) => v.toFixed(2), front = null, onPick = null }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 44, r: 10, t: 10, b: 30 };
  if (!pts.length) { ctx.fillStyle = INK.muted; ctx.fillText('run the optimiser to populate', pad.l, h / 2); return; }
  let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const mx = (x1 - x0) * 0.08 || 0.05, my = (y1 - y0) * 0.08 || 0.05; x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  const X = (v) => pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - (v - y0) / (y1 - y0) * (h - pad.t - pad.b);
  ctx.strokeStyle = INK.grid; ctx.fillStyle = INK.muted;
  for (const t of niceTicks(y0, y1, 4)) { ctx.beginPath(); ctx.moveTo(pad.l, Y(t)); ctx.lineTo(w - pad.r, Y(t)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(fmtY(t), pad.l - 5, Y(t) + 3); }
  for (const t of niceTicks(x0, x1, 5)) { ctx.textAlign = 'center'; ctx.fillText(fmtX(t), X(t), h - pad.b + 14); }
  ctx.fillStyle = INK.secondary; ctx.fillText(xlabel, (pad.l + w) / 2, h - 3);
  ctx.save(); ctx.translate(11, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  if (front && front.length > 1) {
    ctx.strokeStyle = '#e6edf3'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath();
    front.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const p of pts) {
    ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha ?? 0.7;
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r || 4, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    if (p.ring) { ctx.strokeStyle = '#0e1822'; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), (p.r || 4) + 3, 0, 7); ctx.stroke(); }
    if (p.label) { ctx.fillStyle = INK.primary; ctx.textAlign = 'left'; ctx.fillText(p.label, X(p.x) + 8, Y(p.y) - 6); }
  }
  const tip = tooltip(canvas);
  const find = (e) => { const r = canvas.getBoundingClientRect(); const ex = e.clientX - r.left, ey = e.clientY - r.top; let best = null, bd = 12; for (const p of pts) { const d = Math.hypot(X(p.x) - ex, Y(p.y) - ey); if (d < bd) { bd = d; best = p; } } return { best, ex, ey }; };
  canvas.onmousemove = (e) => { const { best, ex, ey } = find(e); if (!best) { tip.style.display = 'none'; return; } tip.innerHTML = best.tip || `${xlabel} ${fmtX(best.x)}<br>${ylabel} ${fmtY(best.y)}`; tip.style.display = 'block'; tip.style.left = `${Math.min(ex + 10, w - 170)}px`; tip.style.top = `${ey}px`; };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
  canvas.onclick = (e) => { const { best } = find(e); if (best && onPick) onPick(best); };
}

/** Sequential single-hue heatmap: grid values[j][i], light->dark = low->high "goodness". */
export function heatmap(canvas, { values, xs, ys, xlabel, ylabel, fmt = (v) => v.toFixed(1), unit = '', best = null, lowerIsBetter = true, marker = null }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 48, r: 64, t: 8, b: 30 };
  const flat = values.flat().filter(Number.isFinite);
  const lo = Math.min(...flat), hi = Math.max(...flat);
  const nx = xs.length, ny = ys.length;
  const cw = (w - pad.l - pad.r) / nx, chh = (h - pad.t - pad.b) / ny;
  // one hue (blue), dark = better
  const col = (v) => {
    let t = (v - lo) / (hi - lo || 1); if (lowerIsBetter) t = 1 - t;
    const l = 0.92 - 0.62 * t; // oklch-ish lightness via hsl
    return `hsl(212, ${55 + 20 * t}%, ${Math.round(l * 70)}%)`;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = values[j][i];
    ctx.fillStyle = Number.isFinite(v) ? col(v) : '#1a2430';
    ctx.fillRect(pad.l + i * cw, h - pad.b - (j + 1) * chh, cw + 0.5, chh + 0.5);
  }
  ctx.fillStyle = INK.muted; ctx.textAlign = 'center';
  for (let i = 0; i < nx; i += Math.ceil(nx / 6)) ctx.fillText(xs[i].toFixed(2), pad.l + (i + 0.5) * cw, h - pad.b + 14);
  ctx.textAlign = 'right';
  for (let j = 0; j < ny; j += Math.ceil(ny / 5)) ctx.fillText(ys[j].toFixed(3), pad.l - 4, h - pad.b - (j + 0.5) * chh + 3);
  ctx.fillStyle = INK.secondary; ctx.textAlign = 'center'; ctx.fillText(xlabel, (pad.l + w - pad.r) / 2, h - 3);
  ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  // legend ramp
  for (let k = 0; k < 40; k++) { ctx.fillStyle = col(lo + (hi - lo) * (1 - k / 39)); ctx.fillRect(w - pad.r + 14, pad.t + k * (h - pad.t - pad.b) / 40, 12, (h - pad.t - pad.b) / 40 + 1); }
  ctx.fillStyle = INK.secondary; ctx.textAlign = 'left';
  ctx.fillText(`${fmt(hi)}`, w - pad.r + 30, pad.t + 9); ctx.fillText(`${fmt(lo)}`, w - pad.r + 30, h - pad.b); ctx.fillText(unit, w - pad.r + 30, (pad.t + h - pad.b) / 2);
  const mark = (i, j, c, r) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pad.l + (i + 0.5) * cw, h - pad.b - (j + 0.5) * chh, r, 0, 7); ctx.stroke(); };
  if (best) mark(best[0], best[1], '#ffd54f', 6);
  if (marker) mark(marker[0], marker[1], '#ffffff', 4);
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const i = Math.floor((mx - pad.l) / cw), j = Math.floor((h - pad.b - my) / chh);
    if (i < 0 || j < 0 || i >= nx || j >= ny) { tip.style.display = 'none'; return; }
    tip.innerHTML = `${xlabel} ${xs[i].toFixed(3)} · ${ylabel} ${ys[j].toFixed(4)}<br><b>${fmt(values[j][i])} ${unit}</b>`;
    tip.style.display = 'block'; tip.style.left = `${Math.min(mx + 10, w - 190)}px`; tip.style.top = `${my}px`;
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}
