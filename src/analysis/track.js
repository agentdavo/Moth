// Parsed log -> uniform analysis track (DOM-free).
//
// * time base: t = seconds since the first row (t_ms), analysis rate = min(rate_hz, 10 Hz);
//   higher-rate IMU/servo channels are block-averaged onto the grid (circular mean for yaw,
//   max for the event column so a one-row marker survives).
// * GNSS channels are taken only from rows that carry a new solution (gnss_new = 1, fix >= 2)
//   and linearly interpolated onto the grid; gaps longer than `maxGnssGap` stay empty.
// * positions -> local ENU metres about the first fix (equirectangular, fine for a few km).
// * course/speed for segmentation come from the Doppler velocity vector (sog, cog) averaged
//   over `smooth` seconds, which stays well defined at low speed in a tack.
import { DEG, wrap360, movingAverage, unwrapDeg, median } from './util.js';

const R_EARTH = 6371008.8;

export function buildTrack(log, opts = {}) {
  const { data, meta } = log;
  const maxRate = opts.maxRate ?? 10;
  const smooth = opts.smooth ?? 1.0;
  const maxGnssGap = opts.maxGnssGap ?? 2.5;
  const nRaw = log.n;
  const warnings = [...(log.warnings || [])];

  // ---- raw time (s)
  const tms = data.t_ms || null;
  let traw = new Float64Array(nRaw);
  let rawRate = +meta.rate_hz || NaN;
  let monotonic = !!tms;
  if (tms) for (let i = 1; i < nRaw; i++) if (!(tms[i] > tms[i - 1])) { monotonic = false; break; }
  if (tms && monotonic) { const t0 = tms[0]; for (let i = 0; i < nRaw; i++) traw[i] = (tms[i] - t0) / 1000; }
  else {
    if (!Number.isFinite(rawRate)) rawRate = 1;
    if (tms) warnings.push('t_ms not monotonic: using row index / rate_hz');
    for (let i = 0; i < nRaw; i++) traw[i] = i / rawRate;
  }
  if (!Number.isFinite(rawRate)) {
    const d = []; for (let i = 1; i < Math.min(nRaw, 500); i++) d.push(traw[i] - traw[i - 1]);
    rawRate = 1 / median(d);
  }
  const rate = Math.min(maxRate, rawRate);
  const dt = 1 / rate;
  const T = traw[nRaw - 1];
  const n = Math.max(1, Math.floor(T / dt + 1e-6) + 1);
  const t = new Float64Array(n);
  for (let k = 0; k < n; k++) t[k] = k * dt;

  // ---- block-average raw-rate channels onto the grid
  const idx = new Int32Array(nRaw);
  for (let i = 0; i < nRaw; i++) idx[i] = Math.min(n - 1, Math.max(0, Math.round(traw[i] / dt)));
  const block = (a, kind = 'mean') => {
    const out = new Float64Array(n).fill(NaN);
    if (!a) return out;
    if (kind === 'max') {
      for (let i = 0; i < nRaw; i++) { const v = a[i]; if (Number.isFinite(v) && !(out[idx[i]] >= v)) out[idx[i]] = v; }
      return out;
    }
    const s = new Float64Array(n), c = new Float64Array(n), s2 = kind === 'circ' ? new Float64Array(n) : null;
    for (let i = 0; i < nRaw; i++) {
      const v = a[i]; if (!Number.isFinite(v)) continue;
      const k = idx[i];
      if (s2) { s[k] += Math.sin(v * DEG); s2[k] += Math.cos(v * DEG); } else s[k] += v;
      c[k]++;
    }
    for (let k = 0; k < n; k++) if (c[k]) out[k] = s2 ? wrap360(Math.atan2(s[k], s2[k]) / DEG) : s[k] / c[k];
    return out;
  };

  // ---- GNSS samples
  const lat = data.lat, lon = data.lon;
  if (!lat || !lon) throw new Error('log has no lat/lon columns');
  const gn = data.gnss_new, fix = data.fix;
  const hasNewFlag = gn && gn.some((v) => v === 1);
  const gi = [];
  let plat = NaN, plon = NaN;
  for (let i = 0; i < nRaw; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    if (fix && Number.isFinite(fix[i]) && fix[i] < 2) continue;
    if (hasNewFlag) { if (gn[i] !== 1) continue; }
    else if (lat[i] === plat && lon[i] === plon && (!data.sog || data.sog[i] === data.sog[gi[gi.length - 1]])) continue; // repeated solution
    gi.push(i); plat = lat[i]; plon = lon[i];
  }
  if (gi.length < 2) throw new Error('fewer than 2 GNSS fixes in the log');
  const m = gi.length;
  const lat0 = lat[gi[0]], lon0 = lon[gi[0]];
  const kx = R_EARTH * DEG * Math.cos(lat0 * DEG), ky = R_EARTH * DEG;
  const gt = new Float64Array(m), gx = new Float64Array(m), gy = new Float64Array(m);
  for (let j = 0; j < m; j++) { const i = gi[j]; gt[j] = traw[i]; gx[j] = (lon[i] - lon0) * kx; gy[j] = (lat[i] - lat0) * ky; }
  let gsog = data.sog ? Float64Array.from(gi, (i) => data.sog[i]) : null;
  let gcog = data.cog ? Float64Array.from(gi, (i) => data.cog[i]) : null;
  if (!gsog || !gsog.some(Number.isFinite) || !gcog || !gcog.some(Number.isFinite)) {
    // derive from positions (central differences)
    const ds = new Float64Array(m), dc = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const a = Math.max(0, j - 1), b = Math.min(m - 1, j + 1);
      const dtt = gt[b] - gt[a];
      const ve = (gx[b] - gx[a]) / dtt, vn = (gy[b] - gy[a]) / dtt;
      ds[j] = dtt > 0 ? Math.hypot(ve, vn) : NaN; dc[j] = dtt > 0 ? wrap360(Math.atan2(ve, vn) / DEG) : NaN;
    }
    if (!gsog || !gsog.some(Number.isFinite)) gsog = ds;
    if (!gcog || !gcog.some(Number.isFinite)) gcog = dc;
  }
  const gve = Float64Array.from(gsog, (s, j) => s * Math.sin(gcog[j] * DEG));
  const gvn = Float64Array.from(gsog, (s, j) => s * Math.cos(gcog[j] * DEG));
  const pick = (name) => (data[name] ? Float64Array.from(gi, (i) => data[name][i]) : null);
  const ghacc = pick('hacc'), gsacc = pick('sacc'), gsats = pick('sats'), gfix = pick('fix');

  // interpolate GNSS onto the grid
  const x = new Float64Array(n).fill(NaN), y = new Float64Array(n).fill(NaN), sog = new Float64Array(n).fill(NaN);
  const ve = new Float64Array(n).fill(NaN), vn = new Float64Array(n).fill(NaN);
  const hacc = new Float64Array(n).fill(NaN), sacc = new Float64Array(n).fill(NaN), sats = new Float64Array(n).fill(NaN), fixg = new Float64Array(n).fill(0);
  const gnssOk = new Uint8Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const tk = t[k];
    while (j < m - 2 && gt[j + 1] <= tk) j++;
    let a = j, b = j + 1;
    if (tk < gt[0] || tk > gt[m - 1]) {
      // allow half a GNSS interval of extrapolation at the ends
      const e = tk < gt[0] ? 0 : m - 1;
      if (Math.abs(tk - gt[e]) > 0.6) continue;
      a = b = e;
    }
    if (gt[b] - gt[a] > maxGnssGap) continue;
    const f = b === a ? 0 : Math.min(1, Math.max(0, (tk - gt[a]) / (gt[b] - gt[a])));
    const L = (arr) => arr[a] + f * (arr[b] - arr[a]);
    x[k] = L(gx); y[k] = L(gy); sog[k] = L(gsog); ve[k] = L(gve); vn[k] = L(gvn);
    if (ghacc) hacc[k] = L(ghacc);
    if (gsacc) sacc[k] = L(gsacc);
    if (gsats) sats[k] = Math.min(gsats[a], gsats[b]);
    fixg[k] = gfix ? Math.min(gfix[a], gfix[b]) : 3;
    gnssOk[k] = Number.isFinite(x[k]) && Number.isFinite(sog[k]) ? 1 : 0;
  }

  // smoothed course / speed / turn rate
  const w = Math.max(1, Math.round(smooth * rate));
  const sve = movingAverage(ve, w), svn = movingAverage(vn, w);
  const speed = movingAverage(sog, w);
  const course = new Float64Array(n);
  for (let k = 0; k < n; k++) course[k] = Number.isFinite(sve[k]) ? wrap360(Math.atan2(sve[k], svn[k]) / DEG) : NaN;
  const cu = unwrapDeg(course);
  const turnRate = new Float64Array(n).fill(NaN);
  const hw = Math.max(1, Math.round(0.5 * rate));
  for (let k = hw; k < n - hw; k++) turnRate[k] = (cu[k + hw] - cu[k - hw]) / (2 * hw * dt);
  const cog = new Float64Array(n);
  for (let k = 0; k < n; k++) cog[k] = Number.isFinite(ve[k]) ? wrap360(Math.atan2(ve[k], vn[k]) / DEG) : NaN;

  // ---- IMU, servos, misc
  const yaw = block(data.yaw, 'circ');
  const roll = block(data.roll), pitch = block(data.pitch);
  const event = block(data.event, 'max');
  const vbat = block(data.vbat);
  const ru = block(data.rudder_us), su = block(data.sheet_us);
  const rc = Number.isFinite(+meta.rudder_center_us) ? +meta.rudder_center_us : 1500;
  const rk = Number.isFinite(+meta.rudder_deg_per_us) ? +meta.rudder_deg_per_us : NaN;
  const rudder = new Float64Array(n).fill(NaN);
  if (Number.isFinite(rk)) for (let k = 0; k < n; k++) rudder[k] = (ru[k] - rc) * rk;
  else if (ru.some(Number.isFinite)) warnings.push('rudder_us present but no rudder_deg_per_us calibration: rudder angle not shown');
  const sin = +meta.sheet_in_us, sout = +meta.sheet_out_us;
  const sheet = new Float64Array(n).fill(NaN);
  if (Number.isFinite(sin) && Number.isFinite(sout) && sin !== sout) for (let k = 0; k < n; k++) sheet[k] = (su[k] - sin) / (sout - sin) * 100;
  else if (su.some(Number.isFinite)) warnings.push('sheet_us present but no sheet_in_us/sheet_out_us calibration: sheet % not shown');
  const twsSrc = String(meta.tws_source || 'none').toLowerCase();
  const twsCol = block(data.tws), twdCol = block(data.twd, 'circ');
  const twsReal = twsSrc !== 'none' && twsCol.some(Number.isFinite);
  const twdReal = twsSrc !== 'none' && twdCol.some(Number.isFinite);

  const events = [];
  for (let k = 0; k < n; k++) if (event[k] > 0) events.push({ i: k, t: t[k], value: event[k] });

  let utc0 = null;
  if (data.utc_ms) {
    for (let i = 0; i < nRaw; i++) if (Number.isFinite(data.utc_ms[i])) { utc0 = data.utc_ms[i] - traw[i] * 1000; break; }
  }
  if (utc0 === null && meta.start_utc) { const v = Date.parse(meta.start_utc); if (Number.isFinite(v)) utc0 = v; }

  const cls = /moth/i.test(meta.class || '') ? 'Moth' : /iom/i.test(meta.class || '') ? 'IOM' : (meta.class || 'other');
  return {
    meta, format: log.format, cls, n, rate, rawRate, dt, duration: t[n - 1], utc0, origin: { lat0, lon0, kx, ky },
    t, x, y, sog, speed, course, cog, turnRate, gnssOk, hacc, sacc, sats, fix: fixg,
    yaw, roll, pitch, rudder, sheet, event, vbat, events,
    twsCol: twsReal ? twsCol : null, twdCol: twdReal ? twdCol : null, twsSource: twsSrc,
    has: {
      roll: roll.some(Number.isFinite), pitch: pitch.some(Number.isFinite), rudder: rudder.some(Number.isFinite),
      sheet: sheet.some(Number.isFinite), yaw: yaw.some(Number.isFinite), hacc: hacc.some(Number.isFinite),
    },
    warnings,
  };
}
