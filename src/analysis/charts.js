// Canvas charts for the analysis page. Colours come from the CSS custom properties (light/dark);
// text always uses the ink tokens, series use --s1..--s8 in fixed order; 1–2 px lines; a legend
// whenever a chart has two or more series; hover tooltips on every chart.
// Each chart draws its static layer once into an offscreen canvas and repaints only the overlay
// (cursor, hover) on pointer moves.

let TH = null;
export function refreshTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => cs.getPropertyValue(k).trim();
  TH = {
    surface: v('--panel'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), grid: v('--grid'), axis: v('--axis'),
    s: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)), seq: [0, 1, 2, 3, 4].map((i) => v(`--seq-${i}`)),
    bandUp: v('--band-up'), bandDown: v('--band-down'), bandReach: v('--band-reach'), brush: v('--brush'), bad: v('--bad'), good: v('--good'), warn: v('--warn'),
  };
  return TH;
}
export const theme = () => TH || refreshTheme();
const FONT = '11px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, canvas.clientWidth), h = Math.max(10, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const off = canvas._off || (canvas._off = document.createElement('canvas'));
  off.width = canvas.width; off.height = canvas.height;
  const ctx = off.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { ctx, w, h, dpr };
}
/** Blit the static layer and hand back a context for the overlay. */
function paint(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas._off) ctx.drawImage(canvas._off, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = FONT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return ctx;
}

export function niceTicks(lo, hi, n = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const span = hi - lo || Math.abs(hi) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0 * 0.999) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const decimals = (ticks) => { if (ticks.length < 2) return 0; const s = Math.abs(ticks[1] - ticks[0]); return s >= 1 ? 0 : s >= 0.1 ? 1 : 2; };

function tipEl(canvas) {
  const p = canvas.parentElement;
  let t = p.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; p.appendChild(t); }
  return t;
}
function showTip(canvas, html, x, y) {
  const t = tipEl(canvas);
  if (!html) { t.style.display = 'none'; return; }
  t.innerHTML = html; t.style.display = 'block';
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const tw = t.offsetWidth, th = t.offsetHeight;
  let left = x + 14, top = y + 12;
  if (left + tw > w - 4) left = x - tw - 14;
  if (top + th > h - 4) top = Math.max(4, h - th - 4);
  t.style.left = `${Math.max(4, left)}px`; t.style.top = `${Math.max(4, top)}px`;
}
export const sw = (c) => `<span class="sw" style="background:${c}"></span>`;

function yAxis(ctx, box, ticks, Y, fmt, { grid = true, labels = true } = {}) {
  const T = theme();
  ctx.lineWidth = 1;
  for (const t of ticks) {
    const y = Math.round(Y(t)) + 0.5;
    if (y < box.y - 1 || y > box.y + box.h + 1) continue;
    if (grid) { ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); }
    if (labels) { ctx.fillStyle = T.ink3; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(t), box.x - 6, y); }
  }
  ctx.textBaseline = 'alphabetic';
}
function xAxis(ctx, box, ticks, X, fmt, { grid = true } = {}) {
  const T = theme();
  ctx.lineWidth = 1;
  let lastR = -Infinity;
  for (const t of ticks) {
    const x = Math.round(X(t)) + 0.5;
    if (x < box.x - 1 || x > box.x + box.w + 1) continue;
    if (grid) { ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke(); }
    const s = fmt(t); const tw = ctx.measureText(s).width;
    if (x - tw / 2 < lastR + 6) continue;
    ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText(s, x, box.y + box.h + 14); lastR = x + tw / 2;
  }
  ctx.strokeStyle = T.axis; ctx.beginPath(); ctx.moveTo(box.x, box.y + box.h + 0.5); ctx.lineTo(box.x + box.w, box.y + box.h + 0.5); ctx.stroke();
}
function axisLabels(ctx, box, xlabel, ylabel, w, h) {
  const T = theme();
  ctx.fillStyle = T.ink2; ctx.textAlign = 'center';
  if (xlabel) ctx.fillText(xlabel, box.x + box.w / 2, h - 3);
  if (ylabel) { ctx.save(); ctx.translate(11, box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore(); }
}
/** Legend row (swatch + ink text), right-aligned at the top. items: [{label, color, kind:'line'|'dot'|'band'}] */
function legend(ctx, items, xRight, y) {
  const T = theme();
  let x = xRight;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const tw = ctx.measureText(it.label).width;
    x -= tw;
    ctx.fillStyle = T.ink2; ctx.textAlign = 'left'; ctx.fillText(it.label, x, y + 4);
    x -= 16;
    ctx.fillStyle = it.color; ctx.strokeStyle = it.color;
    if (it.kind === 'dot') { ctx.beginPath(); ctx.arc(x + 6, y, 4, 0, 7); ctx.fill(); }
    else if (it.kind === 'tri') { tri(ctx, x + 6, y, 4); }
    else if (it.kind === 'band') { ctx.beginPath(); ctx.roundRect(x, y - 4, 12, 8, 2); ctx.fill(); }
    else { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y); ctx.stroke(); }
    x -= 14;
  }
  return x;
}
const nearest = (arr, v) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return Math.abs(arr[hi] - v) < Math.abs(arr[lo] - v) ? hi : lo; };

/** Draw y(t) with min/max decimation per pixel column. */
function drawSeries(ctx, t, y, X, Y, i0, i1, color, width = 1.5) {
  const px = Math.max(1, Math.abs(X(t[i1]) - X(t[i0])));
  const n = i1 - i0 + 1;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  if (n <= px * 2) {
    let pen = false;
    for (let k = i0; k <= i1; k++) { const v = y[k]; if (!Number.isFinite(v)) { pen = false; continue; } const xx = X(t[k]), yy = Y(v); if (pen) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); pen = true; }
  } else {
    let col = -1, lo = Infinity, hi = -Infinity, pen = false;
    const flush = () => { if (col >= 0 && lo <= hi) { if (pen) ctx.lineTo(col, Y(lo)); else ctx.moveTo(col, Y(lo)); ctx.lineTo(col, Y(hi)); pen = true; } else pen = false; };
    for (let k = i0; k <= i1; k++) {
      const c = Math.round(X(t[k]));
      if (c !== col) { flush(); col = c; lo = Infinity; hi = -Infinity; }
      const v = y[k]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    flush();
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- time series stack
export function timeSeries(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const { t, panels } = o;
  const [x0, x1] = o.xlim || [t[0], t[t.length - 1]];
  const pad = { l: 50, r: 12, t: 6, b: 22 };
  const gap = 10;
  const ph = (h - pad.t - pad.b - gap * (panels.length - 1)) / panels.length;
  const X = (v) => pad.l + (v - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
  const i0 = Math.max(0, nearest(t, x0) - 1), i1 = Math.min(t.length - 1, nearest(t, x1) + 1);
  const boxes = [];
  panels.forEach((p, pi) => {
    const box = { x: pad.l, y: pad.t + pi * (ph + gap), w: w - pad.l - pad.r, h: ph };
    let lo = Infinity, hi = -Infinity;
    for (const s of p.series) for (let k = i0; k <= i1; k++) { const v = s.y[k]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (p.includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const m = (hi - lo) * 0.08 || 0.5; lo -= m; hi += m;
    const Y = (v) => box.y + box.h - (v - lo) / (hi - lo) * box.h;
    boxes.push({ box, Y, lo, hi, p });
    // leg bands
    for (const L of o.legs || []) {
      if (L.t1 < x0 || L.t0 > x1) continue;
      ctx.fillStyle = L.mode === 'up' ? T.bandUp : L.mode === 'down' ? T.bandDown : T.bandReach;
      const a = Math.max(box.x, X(L.t0)), b = Math.min(box.x + box.w, X(L.t1));
      ctx.fillRect(a, box.y, b - a, box.h);
    }
    const tk = niceTicks(lo, hi, Math.max(4, Math.floor(box.h / 28)));
    yAxis(ctx, box, tk, Y, (v) => v.toFixed(decimals(tk)));
    if (lo < 0 && hi > 0) { ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(box.x, Math.round(Y(0)) + 0.5); ctx.lineTo(box.x + box.w, Math.round(Y(0)) + 0.5); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    for (const s of p.series) drawSeries(ctx, t, s.y, X, Y, i0, i1, s.color, 1.5);
    ctx.restore();
    // panel title (ink) + legend when >= 2 series
    ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = T.ink2; ctx.textAlign = 'left';
    const title = p.label + (p.unit ? ` (${p.unit})` : '');
    const tw = ctx.measureText(title).width;
    ctx.fillStyle = T.surface; ctx.globalAlpha = 0.8; ctx.fillRect(box.x + 2, box.y + 1, tw + 8, 15); ctx.globalAlpha = 1;
    ctx.fillStyle = T.ink2; ctx.fillText(title, box.x + 6, box.y + 12);
    ctx.font = FONT;
    if (p.series.length > 1) {
      const lw = p.series.reduce((a, s) => a + ctx.measureText(s.label).width + 30, 0);
      ctx.fillStyle = T.surface; ctx.globalAlpha = 0.8; ctx.fillRect(box.x + box.w - lw - 4, box.y + 1, lw + 4, 15); ctx.globalAlpha = 1;
      legend(ctx, p.series.map((s) => ({ label: s.label, color: s.color })), box.x + box.w - 4, box.y + 9);
    }
    if (!p.series.some((s) => s.y.some?.(Number.isFinite))) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText('no data in this log', box.x + box.w / 2, box.y + box.h / 2); }
  });
  // maneuver ticks + event markers on the top panel
  const top = boxes[0].box;
  for (const m of o.maneuvers || []) {
    if (m.t < x0 || m.t > x1) continue;
    const x = X(m.t);
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top.y); ctx.lineTo(x, pad.t + (ph + gap) * panels.length - gap); ctx.stroke();
    ctx.fillStyle = T.ink2; marker(ctx, m.type, x, top.y + top.h - 6, 3.5);
  }
  for (const e of o.events || []) {
    if (e.t < x0 || e.t > x1) continue;
    ctx.fillStyle = T.ink; tri(ctx, X(e.t), top.y + 22, 4);
  }
  const bottom = boxes[boxes.length - 1].box;
  xAxis(ctx, bottom, niceTicks(x0, x1, Math.max(3, Math.floor(w / 90))), X, o.fmtT, { grid: false });

  const state = canvas._ts || (canvas._ts = {});
  Object.assign(state, { X, x0, x1, boxes, pad, w, h, o });
  const overlay = (cursorT, brush) => {
    const c = paint(canvas);
    if (brush) { c.fillStyle = T.brush; const a = X(Math.min(...brush)), b = X(Math.max(...brush)); c.fillRect(a, pad.t, b - a, h - pad.t - pad.b); }
    if (Number.isFinite(cursorT) && cursorT >= x0 && cursorT <= x1) {
      const x = Math.round(X(cursorT)) + 0.5;
      c.strokeStyle = T.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, h - pad.b); c.stroke();
      const k = nearest(t, cursorT);
      for (const { Y, p } of boxes) for (const s of p.series) { const v = s.y[k]; if (!Number.isFinite(v)) continue; c.fillStyle = s.color; c.strokeStyle = T.surface; c.lineWidth = 2; c.beginPath(); c.arc(x, Y(v), 4, 0, 7); c.stroke(); c.fill(); }
      return k;
    }
    return -1;
  };
  state.overlay = overlay;
  overlay(o.cursorT, null);
  // interaction
  let drag = null;
  const tAt = (mx) => x0 + (mx - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
  canvas.onpointerdown = (e) => { const r = canvas.getBoundingClientRect(); drag = { a: tAt(e.clientX - r.left) }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (mx < pad.l || mx > w - pad.r) { showTip(canvas, null); return; }
    const tv = tAt(mx);
    if (drag) { drag.b = tv; overlay(tv, [drag.a, drag.b]); }
    const k = overlay(tv, drag && drag.b !== undefined ? [drag.a, drag.b] : null);
    if (k >= 0) {
      const rows = boxes.flatMap(({ p }) => p.series.map((s) => `${sw(s.color)}${s.label}: <b>${Number.isFinite(s.y[k]) ? (p.fmt || ((v) => v.toFixed(1)))(s.y[k]) : '–'}</b>${p.unit ? ' ' + p.unit : ''}`));
      const leg = (o.legs || []).find((L) => t[k] >= L.t0 && t[k] <= L.t1);
      showTip(canvas, `<span class="mut">${o.fmtT(t[k])}${o.fmtClock ? ' · ' + o.fmtClock(t[k]) : ''}${leg ? ` · leg ${leg.id} ${leg.mode} ${leg.tack}${leg.config ? ' ' + leg.config : ''}` : ''}</span><br>${rows.join('<br>')}`, mx, my);
      o.onCursor?.(t[k]);
    }
  };
  canvas.onpointerup = (e) => {
    if (drag && drag.b !== undefined && Math.abs(X(drag.b) - X(drag.a)) > 6) o.onBrush?.([Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)]);
    drag = null;
  };
  canvas.onpointerleave = () => { showTip(canvas, null); if (!drag) { overlay(NaN, null); o.onCursor?.(NaN); } };
  canvas.ondblclick = () => o.onReset?.();
  return { setCursor: (tc) => overlay(tc, null) };
}

function marker(ctx, type, x, y, r) {
  ctx.beginPath();
  if (type === 'gybe') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath(); }
  else if (type === 'tack') ctx.arc(x, y, r, 0, 7);
  else { ctx.rect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1); }
  ctx.fill();
}
function tri(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); }

// ---------------------------------------------------------------- track map
export function trackMap(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const { x, y, sog, t } = o;
  const n = x.length;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < n; k++) if (Number.isFinite(x[k])) { if (x[k] < xmin) xmin = x[k]; if (x[k] > xmax) xmax = x[k]; if (y[k] < ymin) ymin = y[k]; if (y[k] > ymax) ymax = y[k]; }
  if (!Number.isFinite(xmin)) { ctx.fillStyle = T.ink3; ctx.fillText('no positions', 10, 20); paint(canvas); return {}; }
  const pad = 26;
  const view = o.view || {};
  const base = Math.min((w - 2 * pad) / (xmax - xmin || 1), (h - 2 * pad) / (ymax - ymin || 1));
  const sc = base * (view.zoom || 1);
  const cx = view.cx ?? (xmin + xmax) / 2, cy = view.cy ?? (ymin + ymax) / 2;
  const PX = (v) => w / 2 + (v - cx) * sc, PY = (v) => h / 2 - (v - cy) * sc;
  // speed bins (quantiles of moving speed)
  const sp = [];
  for (let k = 0; k < n; k += 5) if (Number.isFinite(sog[k])) sp.push(sog[k]);
  sp.sort((a, b) => a - b);
  const q = (p) => sp[Math.min(sp.length - 1, Math.floor(p * (sp.length - 1)))] ?? 0;
  const edges = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const bin = (v) => (v < edges[0] ? 0 : v < edges[1] ? 1 : v < edges[2] ? 2 : v < edges[3] ? 3 : 4);
  const range = o.range;
  const inR = (k) => !range || (t[k] >= range[0] && t[k] <= range[1]);
  // dim context outside the brushed range
  if (range) {
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.beginPath(); let pen = false;
    for (let k = 0; k < n; k++) { if (!Number.isFinite(x[k]) || inR(k)) { pen = false; continue; } const a = PX(x[k]), b = PY(y[k]); if (pen) ctx.lineTo(a, b); else ctx.moveTo(a, b); pen = true; }
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  let cur = -1, pen = false;
  const step = Math.max(1, Math.floor(n / 6000));
  for (let k = 0; k < n; k += step) {
    if (!Number.isFinite(x[k]) || !inR(k)) { if (pen) ctx.stroke(); pen = false; continue; }
    const b = bin(sog[k]);
    const a = PX(x[k]), c = PY(y[k]);
    if (b !== cur || !pen) { if (pen) { ctx.lineTo(a, c); ctx.stroke(); } ctx.strokeStyle = T.seq[b]; ctx.beginPath(); ctx.moveTo(a, c); cur = b; pen = true; }
    else ctx.lineTo(a, c);
  }
  if (pen) ctx.stroke();
  // selected leg outline
  if (o.selectedLeg) {
    const L = o.selectedLeg;
    ctx.strokeStyle = T.ink; ctx.lineWidth = 4; ctx.globalAlpha = 0.35; ctx.beginPath();
    for (let k = L.i0; k <= L.i1; k++) { if (!Number.isFinite(x[k])) continue; if (k === L.i0) ctx.moveTo(PX(x[k]), PY(y[k])); else ctx.lineTo(PX(x[k]), PY(y[k])); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  // maneuvers + events (ink symbols with a surface ring)
  for (const m of o.maneuvers || []) {
    if (m.type !== 'tack' && m.type !== 'gybe') continue;
    const k = m.i; if (!Number.isFinite(x[k]) || !inR(k)) continue;
    const a = PX(x[k]), b = PY(y[k]);
    ctx.fillStyle = T.surface; marker(ctx, m.type, a, b, 6);
    ctx.fillStyle = m.dropped ? T.bad : T.ink; marker(ctx, m.type, a, b, 4);
  }
  for (const e of o.events || []) {
    const k = e.i; if (!Number.isFinite(x[k]) || !inR(k)) continue;
    ctx.fillStyle = T.surface; tri(ctx, PX(x[k]), PY(y[k]) - 1, 7);
    ctx.fillStyle = T.s[3]; tri(ctx, PX(x[k]), PY(y[k]) - 1, 5);
  }
  // wind arrow (points downwind), top right
  if (Number.isFinite(o.twd)) {
    const ax = w - 46, ay = 44, L = 22, a = (o.twd + 180) * Math.PI / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    ctx.strokeStyle = T.ink2; ctx.fillStyle = T.ink2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax - dx * L, ay - dy * L); ctx.lineTo(ax + dx * L, ay + dy * L); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax + dx * (L + 3), ay + dy * (L + 3)); ctx.lineTo(ax + dx * (L - 8) - dy * 6, ay + dy * (L - 8) + dx * 6); ctx.lineTo(ax + dx * (L - 8) + dy * 6, ay + dy * (L - 8) - dx * 6); ctx.closePath(); ctx.fill();
    const wl = o.windLabel || `TWD ${Math.round(o.twd)}°`;
    ctx.textAlign = 'right'; ctx.fillStyle = T.ink2; ctx.fillText(wl, w - 8, ay + L + 18);
  }
  // north + scale bar
  ctx.fillStyle = T.ink3; ctx.textAlign = 'left'; ctx.fillText('N ↑', 8, 16);
  const target = (w * 0.18) / sc;
  const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((v) => v <= target * 1.25).pop() || 5;
  const bw = nice * sc;
  ctx.strokeStyle = T.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w - 14 - bw, h - 14); ctx.lineTo(w - 14, h - 14); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = T.ink2; ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, w - 14 - bw / 2, h - 20);
  // speed legend, bottom left
  const lab = (v) => o.fmtSpeed(v);
  const lx = 10, ly = h - 14;
  ctx.textAlign = 'left'; ctx.fillStyle = T.ink3; ctx.fillText(`speed (${o.unit})`, lx, ly - 12);
  const labels = [`< ${lab(edges[0])}`, `${lab(edges[0])}–${lab(edges[1])}`, `${lab(edges[1])}–${lab(edges[2])}`, `${lab(edges[2])}–${lab(edges[3])}`, `> ${lab(edges[3])}`];
  let xx = lx;
  const row2 = ly;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = T.seq[i]; ctx.fillRect(xx, row2 - 5, 14, 4);
    ctx.fillStyle = T.ink3; ctx.fillText(labels[i], xx + 17, row2);
    xx += 22 + ctx.measureText(labels[i]).width;
  }

  const st = { PX, PY, sc, cx, cy, base };
  const overlay = (k) => {
    const c = paint(canvas);
    if (k >= 0 && Number.isFinite(x[k])) { c.fillStyle = T.surface; c.beginPath(); c.arc(PX(x[k]), PY(y[k]), 7, 0, 7); c.fill(); c.fillStyle = T.s[1]; c.beginPath(); c.arc(PX(x[k]), PY(y[k]), 5, 0, 7); c.fill(); }
  };
  overlay(o.cursorIdx ?? -1);
  // hover / pan / zoom
  let drag = null;
  canvas.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, cx, cy, moved: false }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) { o.onView?.({ zoom: view.zoom || 1, cx: drag.cx - dx / sc, cy: drag.cy + dy / sc }); return; }
    }
    let best = -1, bd = 14 * 14;
    const st2 = Math.max(1, Math.floor(n / 8000));
    for (let k = 0; k < n; k += st2) { if (!Number.isFinite(x[k]) || !inR(k)) continue; const d = (PX(x[k]) - mx) ** 2 + (PY(y[k]) - my) ** 2; if (d < bd) { bd = d; best = k; } }
    overlay(best);
    if (best >= 0) { showTip(canvas, o.tipAt(best), mx, my); o.onHover?.(best); } else { showTip(canvas, null); o.onHover?.(-1); }
  };
  canvas.onpointerup = () => { drag = null; };
  canvas.onpointerleave = () => { showTip(canvas, null); overlay(-1); o.onHover?.(-1); };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const zoom = Math.min(40, Math.max(0.5, (view.zoom || 1) * f));
    const wx = cx + (mx - w / 2) / sc, wy = cy - (my - h / 2) / sc;
    const sc2 = base * zoom;
    o.onView?.({ zoom, cx: wx - (mx - w / 2) / sc2, cy: wy + (my - h / 2) / sc2 });
  };
  canvas.ondblclick = () => o.onView?.(null);
  return { setCursor: overlay, st };
}

// ---------------------------------------------------------------- polar
export function polarPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const conv = o.conv;
  const all = [...o.blocks.map((p) => p.speed), ...(o.legs || []).map((L) => L.sog), ...(o.model || []).flatMap((c) => c.pts.map((p) => p.speed))].filter(Number.isFinite).map(conv);
  const maxV = Math.max(1e-6, ...all) * 1.05;
  const top = 26, bottom = 22;
  const R = Math.max(40, Math.min(w - 70, (h - top - bottom) / 2));
  const cx = 34, cy = top + R;
  const rt = niceTicks(0, maxV, 4).filter((v) => v > 0);
  const rmax = rt.length ? Math.max(rt[rt.length - 1], maxV) : maxV;
  const P = (twa, v) => { const a = twa * Math.PI / 180, r = R * conv(v) / rmax; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
  ctx.lineWidth = 1;
  for (const v of rt) { ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.arc(cx, cy, R * v / rmax, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.fillStyle = T.ink3; ctx.textAlign = 'left'; ctx.fillText(v.toFixed(decimals(rt)), cx + 3, cy - R * v / rmax - 3); }
  for (let a = 0; a <= 180; a += 30) {
    const t = a * Math.PI / 180;
    ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(t), cy - R * Math.cos(t)); ctx.stroke();
    if (a > 0 && a < 180) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText(`${a}°`, cx + (R + 14) * Math.sin(t), cy - (R + 14) * Math.cos(t) + 4); }
  }
  ctx.fillStyle = T.ink3; ctx.textAlign = 'left'; ctx.fillText(`TWA 0° ↑ · ${o.unit}`, cx + 6, cy - R - 10 < 10 ? 12 : cy - R - 10);
  const bands = o.bands || [{ label: 'measured', blocks: o.blocks, envelope: o.envelope }];
  const pts = [];
  bands.forEach((b, i) => {
    const col = T.s[i === 0 ? 0 : i + 2 > 7 ? 7 : i + 2];
    b.color = col;
    ctx.fillStyle = col; ctx.globalAlpha = 0.45;
    for (const p of b.blocks) { const [a, c] = P(p.twa, p.speed); ctx.beginPath(); ctx.arc(a, c, 2.6, 0, 7); ctx.fill(); pts.push({ a, c, html: `${sw(col)}10-s block · TWA ${p.twa.toFixed(0)}° · <b>${o.fmt(p.speed)}</b> ${o.unit}${b.label !== 'measured' ? ` · ${b.label}` : ''}<br><span class="mut">leg ${p.leg} · ${o.fmtT(p.t)}</span>` }); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    for (const seg of b.envelope || []) { ctx.beginPath(); seg.forEach((p, j) => { const [a, c] = P(p.twa, p.speed); if (j) ctx.lineTo(a, c); else ctx.moveTo(a, c); }); ctx.stroke(); }
  });
  for (const L of o.legs || []) {
    const [a, c] = P(L.twa, L.sog);
    ctx.strokeStyle = T.surface; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(a, c, 4.5, 0, 7); ctx.stroke();
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, c, 4.5, 0, 7); ctx.stroke();
    pts.push({ a, c, html: `<b>Leg ${L.id}</b> ${L.mode} ${L.tack}${L.config ? ' · ' + L.config : ''}<br>TWA ${L.twa.toFixed(1)}° · <b>${o.fmt(L.sog)}</b> ${o.unit}${Number.isFinite(L.ratio) ? ` · ${(L.ratio * 100).toFixed(1)} % of model` : ''}` });
  }
  if (o.model && o.model.length) {
    // one polyline per regime; the hull-borne branch of a foiling model is drawn thin and faint
    for (const cv of o.model) {
      ctx.strokeStyle = T.s[1]; ctx.lineWidth = cv.foiling === false ? 1.25 : 2; ctx.globalAlpha = cv.foiling === false ? 0.55 : 1; ctx.beginPath();
      let prev = null;
      for (const p of cv.pts) { const [a, c] = P(p.twa, p.speed); if (prev !== null && Math.abs(p.twa - prev) <= 2) ctx.lineTo(a, c); else ctx.moveTo(a, c); prev = p.twa; }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const p of o.modelBest || []) { const [a, c] = P(p.twa, p.speed); ctx.fillStyle = T.surface; ctx.beginPath(); ctx.arc(a, c, 6, 0, 7); ctx.fill(); ctx.fillStyle = T.s[1]; ctx.beginPath(); ctx.arc(a, c, 4, 0, 7); ctx.fill(); pts.push({ a, c, html: `${sw(T.s[1])}${o.modelName} best VMG<br>TWA ${p.twa.toFixed(1)}° · <b>${o.fmt(p.speed)}</b> ${o.unit}` }); }
  }
  // legend
  const items = [];
  bands.forEach((b) => { items.push({ label: bands.length > 1 ? `${b.label} blocks` : '10-s blocks', color: b.color, kind: 'dot' }); items.push({ label: bands.length > 1 ? `${b.label} envelope` : 'envelope (p90)', color: b.color }); });
  items.push({ label: 'leg means', color: T.ink, kind: 'ring' });
  if (o.model && o.model.length) { items.push({ label: o.modelName, color: T.s[1] }); if (o.model.some((c) => c.foiling === false)) items.push({ label: 'model, hull-borne', color: T.s[1], kind: 'thin' }); }
  const colW = Math.max(...items.map((it) => ctx.measureText(it.label).width)) + 22;
  items.forEach((it, i) => {
    const lx = w - colW - 6, ly = 14 + i * 16;
    ctx.fillStyle = it.color; ctx.strokeStyle = it.color;
    if (it.kind === 'dot') { ctx.beginPath(); ctx.arc(lx + 6, ly - 3, 3.5, 0, 7); ctx.fill(); } else if (it.kind === 'ring') { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx + 6, ly - 3, 4, 0, 7); ctx.stroke(); } else if (it.kind === 'thin') { ctx.lineWidth = 1.25; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx + 12, ly - 3); ctx.stroke(); ctx.globalAlpha = 1; } else { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx + 12, ly - 3); ctx.stroke(); }
    ctx.fillStyle = T.ink2; ctx.textAlign = 'left'; ctx.fillText(it.label, lx + 17, ly + 1);
  });
  if (!o.blocks.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText('no steady legs yet', w / 2, h / 2); }
  paint(canvas);
  hoverPoints(canvas, pts);
}

function hoverPoints(canvas, pts, onPick) {
  canvas.onpointermove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 12 * 12;
    for (const p of pts) { const d = (p.a - mx) ** 2 + (p.c - my) ** 2; if (d < bd) { bd = d; best = p; } }
    const c = paint(canvas);
    if (best) { c.strokeStyle = theme().ink; c.lineWidth = 1.5; c.beginPath(); c.arc(best.a, best.c, 7, 0, 7); c.stroke(); showTip(canvas, best.html, mx, my); }
    else showTip(canvas, null);
  };
  canvas.onpointerleave = () => { paint(canvas); showTip(canvas, null); };
  canvas.onclick = (e) => { if (!onPick) return; const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; let best = null, bd = 144; for (const p of pts) { const d = (p.a - mx) ** 2 + (p.c - my) ** 2; if (d < bd) { bd = d; best = p; } } if (best) onPick(best); };
  canvas.onpointerdown = null; canvas.onpointerup = null; canvas.onwheel = null; canvas.ondblclick = null;
}

// ---------------------------------------------------------------- scatter
export function scatterPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const series = o.series.filter((s) => s.pts.length);
  const pad = { l: 46, r: 10, t: series.length > 1 ? 22 : 10, b: 32 };
  const xs = series.flatMap((s) => s.pts.map((p) => p.x)).filter(Number.isFinite), ys = series.flatMap((s) => s.pts.map((p) => p.y)).filter(Number.isFinite);
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  if (!xs.length || !ys.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText(o.empty || 'no data in this log', w / 2, h / 2); paint(canvas); hoverPoints(canvas, []); return; }
  const rx = robust(xs), ry = robust(ys);
  let [x0, x1] = rx, [y0, y1] = ry;
  if (o.zeroY) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  const mx = (x1 - x0) * 0.06 || 0.5, my = (y1 - y0) * 0.08 || 0.5; x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  const X = (v) => box.x + (v - x0) / (x1 - x0) * box.w, Y = (v) => box.y + box.h - (v - y0) / (y1 - y0) * box.h;
  const ty = niceTicks(y0, y1, 4), tx = niceTicks(x0, x1, 5);
  yAxis(ctx, box, ty, Y, (v) => v.toFixed(decimals(ty)));
  xAxis(ctx, box, tx, X, (v) => v.toFixed(decimals(tx)));
  if (y0 < 0 && y1 > 0) { ctx.strokeStyle = T.axis; ctx.beginPath(); ctx.moveTo(box.x, Math.round(Y(0)) + 0.5); ctx.lineTo(box.x + box.w, Math.round(Y(0)) + 0.5); ctx.stroke(); }
  axisLabels(ctx, box, o.xlabel, o.ylabel, w, h);
  const pts = [];
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  for (const s of series) {
    ctx.fillStyle = s.color; ctx.globalAlpha = s.alpha ?? 0.45;
    for (const p of s.pts) { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; const a = X(p.x), c = Y(p.y); ctx.beginPath(); ctx.arc(a, c, p.r || 2.6, 0, 7); ctx.fill(); if (p.tip) pts.push({ a, c, html: `${sw(s.color)}${p.tip}` }); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (series.length > 1) legend(ctx, series.map((s) => ({ label: s.label, color: s.color, kind: 'dot' })), w - pad.r, 10);
  paint(canvas);
  hoverPoints(canvas, pts);
}
function robust(v) { const s = v.slice().sort((a, b) => a - b); const q = (p) => s[Math.floor(p * (s.length - 1))]; const lo = q(0.005), hi = q(0.995); return lo === hi ? [lo - 1, hi + 1] : [lo, hi]; }

// ---------------------------------------------------------------- bars (one value per item, 0 baseline)
export function barPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const items = o.items;
  const cats = o.legend || [];
  const pad = { l: 46, r: 10, t: cats.length > 1 ? 22 : 10, b: 30 };
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  if (!items.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText(o.empty || 'nothing to show', w / 2, h / 2); paint(canvas); hoverPoints(canvas, []); return; }
  const vals = items.map((i) => i.value).filter(Number.isFinite);
  let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals);
  const m = (y1 - y0) * 0.08 || 1; y1 += m; if (y0 < 0) y0 -= m;
  const Y = (v) => box.y + box.h - (v - y0) / (y1 - y0) * box.h;
  const ty = niceTicks(y0, y1, 4);
  yAxis(ctx, box, ty, Y, (v) => v.toFixed(decimals(ty)));
  const slot = box.w / items.length, bw = Math.min(24, Math.max(2, slot - 2));
  const pts = [];
  items.forEach((it, i) => {
    if (!Number.isFinite(it.value)) return;
    const xc = box.x + slot * (i + 0.5), a = Y(Math.max(0, it.value)), b = Y(Math.min(0, it.value));
    ctx.fillStyle = it.color; ctx.beginPath();
    const r = Math.min(4, bw / 2, (b - a) / 2);
    if (it.value >= 0) ctx.roundRect(xc - bw / 2, a, bw, Math.max(1, b - a), [r, r, 0, 0]); else ctx.roundRect(xc - bw / 2, a, bw, Math.max(1, b - a), [0, 0, r, r]);
    ctx.fill();
    pts.push({ a: xc, c: it.value >= 0 ? a : b, html: it.tip });
  });
  ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(box.x, Math.round(Y(0)) + 0.5); ctx.lineTo(box.x + box.w, Math.round(Y(0)) + 0.5); ctx.stroke();
  // sparse x labels
  const every = Math.ceil(items.length / Math.max(1, Math.floor(box.w / 44)));
  ctx.fillStyle = T.ink3; ctx.textAlign = 'center';
  items.forEach((it, i) => { if (i % every === 0) ctx.fillText(it.label, box.x + slot * (i + 0.5), box.y + box.h + 14); });
  axisLabels(ctx, box, o.xlabel, o.ylabel, w, h);
  if (cats.length > 1) legend(ctx, cats.map((c) => ({ ...c, kind: 'band' })), w - pad.r, 10);
  paint(canvas);
  // bars: hover the whole column
  canvas.onpointermove = (e) => {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const i = Math.floor((mx - box.x) / slot);
    const c = paint(canvas);
    if (i >= 0 && i < items.length && mx >= box.x) { c.fillStyle = T.brush; c.fillRect(box.x + slot * i, box.y, slot, box.h); showTip(canvas, items[i].tip, mx, my); } else showTip(canvas, null);
  };
  canvas.onpointerleave = () => { paint(canvas); showTip(canvas, null); };
  canvas.onclick = (e) => { if (!o.onPick) return; const r = canvas.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - box.x) / slot); if (i >= 0 && i < items.length) o.onPick(items[i]); };
}

// ---------------------------------------------------------------- aligned maneuver traces
export function tracesPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const groups = o.groups.filter((g) => g.traces.length);
  const pad = { l: 46, r: 10, t: 22, b: 32 };
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  if (!groups.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText(o.empty || 'none detected', w / 2, h / 2); paint(canvas); hoverPoints(canvas, []); return; }
  const [x0, x1] = o.xlim;
  let y0 = o.ylim[0], y1 = o.ylim[1];
  const X = (v) => box.x + (v - x0) / (x1 - x0) * box.w, Y = (v) => box.y + box.h - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0) * box.h;
  const ty = niceTicks(y0, y1, 5);
  yAxis(ctx, box, ty, Y, (v) => v.toFixed(1));
  xAxis(ctx, box, niceTicks(x0, x1, 8), X, (v) => `${v}`);
  axisLabels(ctx, box, o.xlabel, o.ylabel, w, h);
  ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.round(X(0)) + 0.5, box.y); ctx.lineTo(Math.round(X(0)) + 0.5, box.y + box.h); ctx.stroke();
  for (const ref of o.refs || []) { const yy = Math.round(Y(ref.y)) + 0.5; ctx.beginPath(); ctx.moveTo(box.x, yy); ctx.lineTo(box.x + box.w, yy); ctx.stroke(); ctx.fillStyle = T.ink3; ctx.textAlign = 'left'; ctx.fillText(ref.label, box.x + 4, yy - 3); }
  const pts = [];
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  for (const g of groups) {
    ctx.strokeStyle = g.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    for (const tr of g.traces) {
      ctx.beginPath(); tr.t.forEach((tt, i) => { const a = X(tt), c = Y(tr.y[i]); if (i) ctx.lineTo(a, c); else ctx.moveTo(a, c); if (i % 3 === 0) pts.push({ a, c, html: tr.tip }); }); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (const g of groups) if (g.mean) { ctx.strokeStyle = g.meanColor || T.ink; ctx.lineWidth = 2.5; ctx.beginPath(); g.mean.t.forEach((tt, i) => { const a = X(tt), c = Y(g.mean.y[i]); if (i) ctx.lineTo(a, c); else ctx.moveTo(a, c); }); ctx.stroke(); }
  ctx.restore();
  const items = groups.map((g) => ({ label: `${g.label} (${g.traces.length})`, color: g.color }));
  if (groups.some((g) => g.mean)) items.push({ label: 'mean', color: T.ink });
  if (items.length > 1) legend(ctx, items, w - pad.r, 10);
  paint(canvas);
  hoverPoints(canvas, pts);
}

// ---------------------------------------------------------------- A/B: forest plot
export function forestPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const groups = o.groups.filter((g) => g.pairs.length);
  const pad = { l: 92, r: 14, t: 10, b: 32 };
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  if (!groups.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText('no A/B pairs yet', w / 2, h / 2); paint(canvas); hoverPoints(canvas, []); return; }
  const vals = groups.flatMap((g) => [...g.pairs.map((p) => p.d), g.lo, g.hi]).filter(Number.isFinite);
  let x0 = Math.min(-o.effect * 1.5, ...vals), x1 = Math.max(o.effect * 1.5, ...vals);
  const span = x1 - x0; x0 -= span * 0.05; x1 += span * 0.05;
  x0 = Math.max(x0, -25); x1 = Math.min(x1, 25);
  const X = (v) => box.x + (Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0) * box.w;
  const rows = groups.reduce((a, g) => a + g.pairs.length + 2.6, 0);
  const rh = Math.min(16, box.h / rows);
  xAxis(ctx, box, niceTicks(x0, x1, 7), X, (v) => `${v > 0 ? '+' : ''}${v}%`);
  ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(X(0)) + 0.5, box.y); ctx.lineTo(Math.round(X(0)) + 0.5, box.y + box.h); ctx.stroke();
  axisLabels(ctx, box, o.xlabel, '', w, h);
  let yy = box.y + rh * 0.8;
  const pts = [];
  for (const g of groups) {
    ctx.fillStyle = T.ink2; ctx.textAlign = 'left'; ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillText(g.label, 6, yy + 4); ctx.font = FONT;
    yy += rh;
    for (const p of g.pairs) {
      ctx.fillStyle = T.surface; ctx.beginPath(); ctx.arc(X(p.d), yy, 5.5, 0, 7); ctx.fill();
      ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(X(p.d), yy, 4, 0, 7); ctx.fill();
      ctx.fillStyle = T.ink3; ctx.textAlign = 'right'; ctx.fillText(p.label, box.x - 8, yy + 4);
      pts.push({ a: X(p.d), c: yy, html: p.tip });
      yy += rh;
    }
    // mean with CI
    if (Number.isFinite(g.mean)) {
      ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(g.lo), yy); ctx.lineTo(X(g.hi), yy); ctx.stroke();
      ctx.fillStyle = T.ink; ctx.beginPath(); ctx.moveTo(X(g.mean), yy - 6); ctx.lineTo(X(g.mean) + 6, yy); ctx.lineTo(X(g.mean), yy + 6); ctx.lineTo(X(g.mean) - 6, yy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.ink2; ctx.textAlign = 'right'; ctx.fillText('mean ± 95 %', box.x - 8, yy + 4);
      pts.push({ a: X(g.mean), c: yy, html: `<b>${g.label}</b>: mean ${fmtPct(g.mean)} (95 % CI ${fmtPct(g.lo)} … ${fmtPct(g.hi)})` });
    }
    yy += rh * 1.6;
  }
  paint(canvas);
  hoverPoints(canvas, pts);
}
export const fmtPct = (v, d = 1) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}%` : '–');

// ---------------------------------------------------------------- A/B: convergence
export function convergePlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const series = o.series.filter((s) => s.pts.length);
  const pad = { l: 46, r: 12, t: series.length > 1 ? 22 : 10, b: 32 };
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  if (!series.length) { ctx.fillStyle = T.ink3; ctx.textAlign = 'center'; ctx.fillText('no A/B pairs yet', w / 2, h / 2); paint(canvas); hoverPoints(canvas, []); return; }
  const nmax = Math.max(2, ...series.map((s) => s.pts.length));
  const vals = series.flatMap((s) => s.pts.slice(Math.min(2, s.pts.length - 1)).flatMap((p) => [p.lo, p.hi, p.mean])).filter(Number.isFinite);
  let y0 = Math.min(-o.effect, ...vals), y1 = Math.max(o.effect, ...vals);
  y0 = Math.max(y0, -15); y1 = Math.min(y1, 15);
  const m = (y1 - y0) * 0.08; y0 -= m; y1 += m;
  const X = (v) => box.x + (v - 1) / (nmax - 1) * box.w, Y = (v) => box.y + box.h - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0) * box.h;
  const ty = niceTicks(y0, y1, 5);
  yAxis(ctx, box, ty, Y, (v) => `${v > 0 ? '+' : ''}${v.toFixed(decimals(ty))}`);
  xAxis(ctx, box, niceTicks(1, nmax, Math.min(8, nmax - 1)).filter((v) => Number.isInteger(v)), X, (v) => `${v}`);
  ctx.strokeStyle = T.axis; ctx.beginPath(); ctx.moveTo(box.x, Math.round(Y(0)) + 0.5); ctx.lineTo(box.x + box.w, Math.round(Y(0)) + 0.5); ctx.stroke();
  axisLabels(ctx, box, 'pairs', `B − A (%)`, w, h);
  const pts = [];
  for (const s of series) {
    const P = s.pts.filter((p) => Number.isFinite(p.lo));
    if (P.length > 1) {
      ctx.fillStyle = s.color; ctx.globalAlpha = 0.12; ctx.beginPath();
      P.forEach((p, i) => { if (i) ctx.lineTo(X(p.n), Y(p.hi)); else ctx.moveTo(X(p.n), Y(p.hi)); });
      for (let i = P.length - 1; i >= 0; i--) ctx.lineTo(X(P[i].n), Y(P[i].lo));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
    s.pts.forEach((p, i) => { if (i) ctx.lineTo(X(p.n), Y(p.mean)); else ctx.moveTo(X(p.n), Y(p.mean)); });
    ctx.stroke();
    for (const p of s.pts) pts.push({ a: X(p.n), c: Y(p.mean), html: `${sw(s.color)}${s.label} after ${p.n} pair${p.n > 1 ? 's' : ''}: <b>${fmtPct(p.mean)}</b>${Number.isFinite(p.lo) ? ` <span class="mut">(${fmtPct(p.lo)} … ${fmtPct(p.hi)})</span>` : ''}` });
  }
  if (series.length > 1) legend(ctx, series.map((s) => ({ label: s.label, color: s.color })), w - pad.r, 10);
  paint(canvas);
  hoverPoints(canvas, pts);
}

// ---------------------------------------------------------------- A/B: timeline
export function timelinePlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const T = theme();
  const pad = { l: 70, r: 12, t: 28, b: 22 };
  const rows = o.rows;
  const box = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  const X = (v) => box.x + v / (o.duration || 1) * box.w;
  const rh = box.h / rows.length;
  const pts = [];
  rows.forEach((r, i) => {
    const yy = box.y + i * rh;
    ctx.fillStyle = T.ink2; ctx.textAlign = 'right'; ctx.fillText(r.label, box.x - 8, yy + rh / 2 + 4);
    ctx.fillStyle = T.grid; ctx.fillRect(box.x, yy + rh / 2 - 0.5, box.w, 1);
    for (const L of r.legs) {
      const a = X(L.t0), b = Math.max(a + 2, X(L.t1));
      ctx.fillStyle = L.config === 'A' ? T.s[0] : L.config === 'B' ? T.s[1] : T.axis;
      ctx.beginPath(); ctx.roundRect(a, yy + 3, b - a - 1, rh - 6, 3); ctx.fill();
      pts.push({ a: (a + b) / 2, c: yy + rh / 2, html: `Leg ${L.id} · ${L.mode} ${L.tack} · <b>${L.config || 'no config'}</b><br><span class="mut">${o.fmtT(L.t0)}–${o.fmtT(L.t1)}</span>` });
    }
  });
  for (const e of o.events) { ctx.fillStyle = T.ink; tri(ctx, X(e.t), pad.t - 5, 4); }
  xAxis(ctx, box, niceTicks(0, o.duration, Math.max(3, Math.floor(w / 90))), X, o.fmtT, { grid: false });
  legend(ctx, [{ label: 'A', color: T.s[0], kind: 'band' }, { label: 'B', color: T.s[1], kind: 'band' }, { label: 'unassigned', color: T.axis, kind: 'band' }, { label: 'marker', color: T.ink, kind: 'tri' }], w - pad.r, 9);
  paint(canvas);
  hoverPoints(canvas, pts);
}
