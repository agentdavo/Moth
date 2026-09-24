// Theme-aware canvas charts for the IOM lab. Same drawing conventions as src/ui/charts.js (thin 2 px lines,
// recessive grid, legend + direct labels, hover tooltips), but every colour is read from CSS custom properties
// at draw time so the charts follow the light/dark theme (src/ui/charts.js hard-codes dark ink).

export function css(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
function ink() {
  return { primary: css('--ink'), secondary: css('--ink-2'), muted: css('--ink-3'), grid: css('--grid'), axis: css('--axis'), surface: css('--panel-2') };
}

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { ctx, w, h, I: ink() };
}

export function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function tooltip(canvas) {
  let tip = canvas.parentElement.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; canvas.parentElement.appendChild(tip); }
  return tip;
}
function placeTip(tip, canvas, x, y, w) {
  tip.style.display = 'block';
  tip.style.left = `${canvas.offsetLeft + Math.min(x + 12, w - 170)}px`;
  tip.style.top = `${canvas.offsetTop + Math.max(4, y - 10)}px`;
}

function title(ctx, I, text, x = 0, y = 12) {
  if (!text) return;
  ctx.fillStyle = I.primary; ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(text, x, y);
  ctx.font = '11px Inter, system-ui, sans-serif';
}

/** series: [{label, color, x:[], y:[], dash?, marker?}] */
export function lineChart(canvas, { series, xlabel = '', ylabel = '', xlim, ylim, fmtX = (v) => v.toFixed(1), fmtY = (v) => v.toFixed(2), hline = null, zeroLine = false, heading = '', directLabels = true }) {
  const { ctx, w, h, I } = setup(canvas);
  const top = heading ? 24 : 8;
  // legend layout (wraps to several rows)
  const legendPos = [];
  if (series.length > 1) {
    let lx = 46, row = 0;
    for (const s of series) {
      const wl = ctx.measureText(s.label).width + 30;
      if (lx + wl > w - 6 && lx > 46) { lx = 46; row++; }
      legendPos.push([lx, top + row * 14]); lx += wl;
    }
  }
  const legendH = legendPos.length ? 14 * (1 + Math.max(...legendPos.map((p) => (p[1] - top) / 14))) + 2 : 0;
  const labW = directLabels && series.length > 1 ? Math.min(90, 10 + Math.max(...series.map((s) => ctx.measureText(s.short || s.label).width))) : 12;
  const pad = { l: 46, r: labW, t: top + legendH, b: 32 };
  title(ctx, I, heading, 4, 13);
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) { ctx.fillStyle = I.muted; ctx.fillText('no data', pad.l, h / 2); return; }
  const [x0, x1] = xlim || [Math.min(...xs), Math.max(...xs)];
  if (hline) ys.push(hline.y);
  let [y0, y1] = ylim || [Math.min(...ys), Math.max(...ys)];
  if (!ylim) { const m = (y1 - y0) * 0.08 || 0.05; y0 -= m; y1 += m; }
  const X = (v) => pad.l + (v - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - (v - y0) / (y1 - y0 || 1) * (h - pad.t - pad.b);
  ctx.lineWidth = 1;
  for (const t of niceTicks(y0, y1, 4)) { ctx.strokeStyle = I.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(t)); ctx.lineTo(w - pad.r, Y(t)); ctx.stroke(); ctx.fillStyle = I.muted; ctx.textAlign = 'right'; ctx.fillText(fmtY(t), pad.l - 5, Y(t) + 3); }
  for (const t of niceTicks(x0, x1, 6)) { ctx.fillStyle = I.muted; ctx.textAlign = 'center'; ctx.fillText(fmtX(t), X(t), h - pad.b + 14); }
  ctx.fillStyle = I.secondary; ctx.textAlign = 'center'; ctx.fillText(xlabel, (pad.l + w - pad.r) / 2, h - 4);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  if (zeroLine && y0 < 0 && y1 > 0) { ctx.strokeStyle = I.axis; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke(); }
  if (hline) { ctx.strokeStyle = I.axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad.l, Y(hline.y)); ctx.lineTo(w - pad.r, Y(hline.y)); ctx.stroke(); ctx.setLineDash([]); if (hline.label) { ctx.fillStyle = I.secondary; ctx.textAlign = 'left'; ctx.fillText(hline.label, pad.l + 4, Y(hline.y) - 4); } }
  ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, w - pad.l - pad.r, h - pad.t - pad.b + 4); ctx.clip();
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
    ctx.beginPath(); let pen = false;
    s.x.forEach((xv, i) => { const yv = s.y[i]; if (!Number.isFinite(yv)) { pen = false; return; } if (!pen) ctx.moveTo(X(xv), Y(yv)); else ctx.lineTo(X(xv), Y(yv)); pen = true; });
    ctx.stroke(); ctx.setLineDash([]);
    if (s.marker) s.x.forEach((xv, i) => { if (!Number.isFinite(s.y[i])) return; ctx.fillStyle = s.color; ctx.strokeStyle = I.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(xv), Y(s.y[i]), 4, 0, 7); ctx.fill(); ctx.stroke(); });
  }
  ctx.restore();
  if (series.length > 1) {
    series.forEach((s, i) => { const [lx, ly] = legendPos[i]; ctx.fillStyle = s.color; ctx.fillRect(lx, ly + 3, 12, 3); ctx.fillStyle = I.secondary; ctx.textAlign = 'left'; ctx.fillText(s.label, lx + 16, ly + 8); });
    if (directLabels) {
      const labs = [];
      for (const s of series) {
        let k = s.y.length - 1; while (k > 0 && !Number.isFinite(s.y[k])) k--;
        if (Number.isFinite(s.y[k])) labs.push({ s, y: Y(s.y[k]) + 3 });
      }
      labs.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 12) labs[i].y = labs[i - 1].y + 12;
      const over = labs.length ? labs[labs.length - 1].y - (h - pad.b) : 0;
      if (over > 0) for (const l of labs) l.y -= over;
      for (const l of labs) { ctx.fillStyle = I.secondary; ctx.textAlign = 'left'; ctx.fillText(l.s.short || l.s.label, w - pad.r + 5, l.y); }
    }
  }
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const xv = x0 + (mx - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
    const rows = series.map((s) => { let bi = 0; s.x.forEach((v, i) => { if (Math.abs(v - xv) < Math.abs(s.x[bi] - xv)) bi = i; }); return `<span style="color:${s.color}">■</span> ${s.label}: <b>${Number.isFinite(s.y[bi]) ? fmtY(s.y[bi]) : '–'}</b>`; });
    tip.innerHTML = `${xlabel} ${fmtX(xv)}<br>${rows.join('<br>')}`;
    placeTip(tip, canvas, mx, my, w);
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/** Half polar of boat speed: bands [{label, color, pts:[{twa, v}], vmg:[{twa,v}]}] */
export function polarChart(canvas, bands, { unit = 'm/s', maxV = null, heading = '' } = {}) {
  const { ctx, w, h, I } = setup(canvas);
  title(ctx, I, heading, 4, 13);
  const legendY = heading ? 30 : 10;
  const lpos = []; { let lx = 4, row = 0; for (const b of bands) { const lw = ctx.measureText(b.label).width + 28; if (lx + lw > w && lx > 4) { lx = 4; row++; } lpos.push([lx, legendY + row * 14]); lx += lw; } }
  const legendBottom = lpos.length ? lpos[lpos.length - 1][1] : legendY;
  const R = Math.max(40, Math.min(w - 70, (h - legendBottom - 42) / 2));
  const cx = 34, cy = legendBottom + 16 + R;
  const all = bands.flatMap((b) => b.pts.map((p) => p.v));
  const mv = maxV || Math.max(0.5, Math.ceil(Math.max(...all, 0.1) * 2) / 2);
  const step = mv > 2 ? 0.5 : 0.25;
  ctx.lineWidth = 1;
  for (let k = step; k <= mv + 1e-9; k += step) { ctx.strokeStyle = I.grid; ctx.beginPath(); ctx.arc(cx, cy, R * k / mv, -Math.PI / 2, Math.PI / 2); ctx.stroke(); if (Math.abs(k / (step * 2) - Math.round(k / (step * 2))) < 1e-6 || step === 0.5) { ctx.fillStyle = I.muted; ctx.textAlign = 'left'; ctx.fillText(k.toFixed(k < 1 ? 2 : 1), cx + 3, cy - R * k / mv - 2); } }
  for (let a = 0; a <= 180; a += 30) { const t = a * Math.PI / 180; ctx.strokeStyle = I.grid; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(t), cy - R * Math.cos(t)); ctx.stroke(); ctx.fillStyle = I.muted; ctx.textAlign = 'center'; ctx.fillText(`${a}°`, cx + (R + 14) * Math.sin(t), cy - (R + 14) * Math.cos(t) + 4); }
  const P = (p) => [cx + R * p.v / mv * Math.sin(p.twa * Math.PI / 180), cy - R * p.v / mv * Math.cos(p.twa * Math.PI / 180)];
  for (const b of bands) {
    ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.beginPath();
    b.pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    for (const p of b.vmg || []) { const [x, y] = P(p); ctx.fillStyle = b.color; ctx.strokeStyle = I.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  bands.forEach((b, i) => { const [lx, ly] = lpos[i]; ctx.fillStyle = b.color; ctx.fillRect(lx, ly - 4, 12, 3); ctx.fillStyle = I.secondary; ctx.textAlign = 'left'; ctx.fillText(b.label, lx + 16, ly); });
  ctx.fillStyle = I.muted; ctx.textAlign = 'right'; ctx.fillText(`${unit} · ● best VMG`, w - 4, h - 6);
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 16;
    for (const b of bands) for (const p of [...b.pts, ...(b.vmg || [])]) { const [x, y] = P(p); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = { b, p }; } }
    if (!best) { tip.style.display = 'none'; return; }
    tip.innerHTML = `${best.b.label} · TWA ${best.p.twa.toFixed(0)}°<br><b>${best.p.v.toFixed(3)} ${unit}</b>${best.p.note ? `<br>${best.p.note}` : ''}`;
    placeTip(tip, canvas, mx, my, w);
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/** Horizontal bars: items [{label, value, color?, note?}] (single hue unless colours given). */
export function barList(canvas, items, { unit = 'N', fmt = (v) => v.toFixed(3), heading = '', color = null } = {}) {
  const { ctx, w, h, I } = setup(canvas);
  title(ctx, I, heading, 4, 13);
  const top = heading ? 22 : 4;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);
  const rowH = Math.min(24, (h - top - 4) / items.length);
  const lw = 108;
  items.forEach((it, k) => {
    const y = top + k * rowH;
    ctx.fillStyle = I.secondary; ctx.textAlign = 'left'; ctx.fillText(it.label, 4, y + rowH * 0.62);
    const bw = (w - lw - 76) * Math.abs(it.value) / max;
    const bh = Math.max(6, rowH - 8);
    ctx.fillStyle = it.color || color || css('--s1');
    ctx.beginPath(); ctx.roundRect(lw, y + (rowH - bh) / 2, Math.max(2, bw), bh, [0, 4, 4, 0]); ctx.fill();
    ctx.fillStyle = I.primary; ctx.fillText(`${fmt(it.value)} ${unit}`, lw + bw + 6, y + rowH * 0.62);
  });
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const my = e.clientY - r.top, mx = e.clientX - r.left;
    const k = Math.floor((my - top) / rowH);
    if (k < 0 || k >= items.length) { tip.style.display = 'none'; return; }
    const tot = items.reduce((s, i) => s + i.value, 0);
    tip.innerHTML = `${items[k].label}: <b>${fmt(items[k].value)} ${unit}</b> (${(items[k].value / tot * 100).toFixed(0)} %)${items[k].note ? `<br>${items[k].note}` : ''}`;
    placeTip(tip, canvas, mx, my, w);
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/**
 * Diverging heatmap (blue = better, red = worse, grey = 0): values[j][i] for xs[i], ys[j].
 */
export function heatmap(canvas, { values, xs, ys, xlabel, ylabel, fmt = (v) => v.toFixed(2), unit = '', heading = '', marker = null, best = null, clip = false }) {
  const { ctx, w, h, I } = setup(canvas);
  title(ctx, I, heading, 4, 13);
  const pad = { l: 48, r: 70, t: heading ? 24 : 8, b: 32 };
  const flat = values.flat().filter(Number.isFinite);
  const mAbs = Math.max(1e-6, ...flat.map(Math.abs)), posMax = Math.max(0, ...flat);
  // clip: resolve the small differences near the optimum; large losses saturate (legend shows the clip)
  const m = clip ? Math.min(mAbs, Math.max(0.1, 3 * posMax)) : mAbs;
  const clipped = m < mAbs - 1e-9;
  const pos = css('--div-pos'), neg = css('--div-neg'), mid = css('--div-mid');
  const mix = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`; };
  const col = (v) => (v >= 0 ? mix(mid, pos, Math.pow(Math.min(1, v / m), 0.7)) : mix(mid, neg, Math.pow(Math.min(1, -v / m), 0.7)));
  const nx = xs.length, ny = ys.length;
  const cw = (w - pad.l - pad.r) / nx, chh = (h - pad.t - pad.b) / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = values[j][i];
    ctx.fillStyle = Number.isFinite(v) ? col(v) : I.grid;
    ctx.fillRect(pad.l + i * cw + 1, h - pad.b - (j + 1) * chh + 1, cw - 2, chh - 2);
  }
  ctx.fillStyle = I.muted; ctx.textAlign = 'center';
  xs.forEach((x, i) => { if (nx < 12 || i % 2 === 0) ctx.fillText(String(x), pad.l + (i + 0.5) * cw, h - pad.b + 14); });
  ctx.textAlign = 'right';
  ys.forEach((y, j) => ctx.fillText(String(y), pad.l - 5, h - pad.b - (j + 0.5) * chh + 3));
  ctx.fillStyle = I.secondary; ctx.textAlign = 'center'; ctx.fillText(xlabel, (pad.l + w - pad.r) / 2, h - 4);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  const lh = h - pad.t - pad.b;
  for (let k = 0; k < 40; k++) { ctx.fillStyle = col(m * (1 - 2 * k / 39)); ctx.fillRect(w - pad.r + 12, pad.t + k * lh / 40, 12, lh / 40 + 1); }
  ctx.fillStyle = I.secondary; ctx.textAlign = 'left';
  ctx.fillText(`+${fmt(m)}`, w - pad.r + 28, pad.t + 9); ctx.fillText(`${clipped ? '≤' : ''}−${fmt(m)}`, w - pad.r + 28, h - pad.b); ctx.fillText(`0 ${unit}`, w - pad.r + 28, pad.t + lh / 2 + 4);
  const ring = (i, j, c, r) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pad.l + (i + 0.5) * cw, h - pad.b - (j + 0.5) * chh, r, 0, 7); ctx.stroke(); };
  if (best) ring(best[0], best[1], I.primary, Math.min(cw, chh) * 0.32);
  if (marker) { ctx.strokeStyle = I.primary; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.strokeRect(pad.l + marker[0] * cw + 2, h - pad.b - (marker[1] + 1) * chh + 2, cw - 4, chh - 4); ctx.setLineDash([]); }
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const i = Math.floor((mx - pad.l) / cw), j = Math.floor((h - pad.b - my) / chh);
    if (i < 0 || j < 0 || i >= nx || j >= ny) { tip.style.display = 'none'; return; }
    tip.innerHTML = `${xlabel} ${xs[i]} · ${ylabel} ${ys[j]}<br><b>${values[j][i] >= 0 ? '+' : ''}${fmt(values[j][i])} ${unit}</b>`;
    placeTip(tip, canvas, mx, my, w);
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

/** Scatter: pts [{x, y, color, r, label, tip}], optional front polyline. */
export function scatter(canvas, pts, { xlabel, ylabel, fmtX = (v) => v.toFixed(2), fmtY = (v) => v.toFixed(2), front = null, heading = '', empty = 'run the optimiser to populate' }) {
  const { ctx, w, h, I } = setup(canvas);
  title(ctx, I, heading, 4, 13);
  const pad = { l: 50, r: 12, t: heading ? 24 : 10, b: 32 };
  if (!pts.length) { ctx.fillStyle = I.muted; ctx.textAlign = 'left'; ctx.fillText(empty, pad.l, h / 2); return; }
  let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const mx = (x1 - x0) * 0.08 || 0.05, my = (y1 - y0) * 0.08 || 0.05; x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  const X = (v) => pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - (v - y0) / (y1 - y0) * (h - pad.t - pad.b);
  ctx.lineWidth = 1;
  for (const t of niceTicks(y0, y1, 4)) { ctx.strokeStyle = I.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(t)); ctx.lineTo(w - pad.r, Y(t)); ctx.stroke(); ctx.fillStyle = I.muted; ctx.textAlign = 'right'; ctx.fillText(fmtY(t), pad.l - 5, Y(t) + 3); }
  for (const t of niceTicks(x0, x1, 5)) { ctx.fillStyle = I.muted; ctx.textAlign = 'center'; ctx.fillText(fmtX(t), X(t), h - pad.b + 14); }
  ctx.fillStyle = I.secondary; ctx.textAlign = 'center'; ctx.fillText(xlabel, (pad.l + w - pad.r) / 2, h - 4);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  for (const p of pts) { ctx.globalAlpha = p.alpha ?? 0.75; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r || 3.5, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (front && front.length > 1) {
    ctx.strokeStyle = I.primary; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath();
    front.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const p of pts) if (p.label) { ctx.strokeStyle = I.surface; ctx.lineWidth = 2; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), (p.r || 4) + 1, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = I.primary; ctx.textAlign = 'left'; ctx.fillText(p.label, X(p.x) + 9, Y(p.y) - 7); }
  const tip = tooltip(canvas);
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(); const ex = e.clientX - r.left, ey = e.clientY - r.top;
    let best = null, bd = 10;
    for (const p of pts) { const d = Math.hypot(X(p.x) - ex, Y(p.y) - ey); if (d < bd) { bd = d; best = p; } }
    if (!best) { tip.style.display = 'none'; return; }
    tip.innerHTML = best.tip || `${xlabel} ${fmtX(best.x)}<br>${ylabel} ${fmtY(best.y)}`;
    placeTip(tip, canvas, ex, ey, w);
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

function hex(c) {
  c = c.trim();
  if (c.startsWith('rgb')) return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const s = c.replace('#', '');
  const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
}
