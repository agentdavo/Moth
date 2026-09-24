// Log parsers (DOM-free, usable in node, a worker or the page).
//
//  parseLog(text)       -> { format, meta, columns, n, data: {name: Float64Array}, warnings }
//     * LOG_FORMAT v1 ("sail-log v1") CSV: '# key=value' metadata, header, numeric rows and a '#'
//       trailer (start_utc, rows, dropped_rows, end_t_ms). Empty field -> NaN; a row with the wrong
//       field count (partial last line after a power cut) is dropped; unknown keys are kept, unused.
//     * plain CSV with at least time, lat, lon and speed columns (aliases below; ISO time strings ok)
//     * GPX 1.0/1.1 tracks (<trkpt lat lon><time/><speed/><course/>)
//  writeLog({meta, columns, rows|data}) -> v1 CSV text (used by the synthesiser and the tests)
//
// The v1 path is a hand-rolled char scanner (no split per row): ~0.3 s for 180k x 28 fields.

export const V1_COLUMNS = ['t_ms', 'utc_ms', 'gnss_new', 'lat', 'lon', 'sog', 'cog', 'sacc', 'hacc', 'fix', 'sats',
  'yaw', 'roll', 'pitch', 'gx', 'gy', 'gz', 'ax', 'ay', 'az', 'rudder_us', 'sheet_us', 'aux1_us', 'aux2_us',
  'vbat', 'event', 'tws', 'twd'];

const NUMERIC_META = ['rate_hz', 'declination_deg', 'rudder_center_us', 'rudder_deg_per_us', 'sheet_in_us', 'sheet_out_us'];

export function parseLog(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const head = text.slice(0, 2000).trimStart();
  if (head.startsWith('<?xml') || /<gpx[\s>]/i.test(head)) return parseGPX(text);
  return parseCSV(text);
}

function parseMetaLine(line, meta) {
  const s = line.replace(/^#\s*/, '');
  const eq = s.indexOf('=');
  if (eq <= 0) return;
  const k = s.slice(0, eq).trim(), v = s.slice(eq + 1).trim();
  if (!k) return;
  meta[k] = NUMERIC_META.includes(k) && v !== '' && Number.isFinite(+v) ? +v : v;
}

const POW10 = Array.from({ length: 23 }, (_, i) => 10 ** i);

/** Parse the numeric body of a CSV from `pos` into column arrays. Returns {n, cols, bad, trailerStart}. */
function scanNumeric(text, pos, ncol) {
  // estimate rows from length to preallocate; grow if needed
  let cap = Math.max(16, Math.ceil((text.length - pos) / Math.max(8, ncol * 4)));
  let cols = Array.from({ length: ncol }, () => new Float64Array(cap));
  const L = text.length;
  let n = 0, bad = 0, nonNumeric = 0;
  const trailer = [];
  while (pos < L) {
    let c = text.charCodeAt(pos);
    if (c === 10 || c === 13) { pos++; continue; }
    if (c === 35) { // '#' trailer line
      const e = text.indexOf('\n', pos); const end = e < 0 ? L : e;
      trailer.push(text.slice(pos, end).replace(/\r$/, ''));
      pos = end + 1; continue;
    }
    if (n >= cap) {
      cap *= 2;
      cols = cols.map((a) => { const b = new Float64Array(cap); b.set(a); return b; });
    }
    let col = 0;
    // parse fields
    for (;;) {
      // one field
      let neg = false, mant = 0, digits = 0, frac = 0, any = false, ok = true, exp = 0;
      const tok = pos;
      c = pos < L ? text.charCodeAt(pos) : 10;
      while (c === 32) { pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
      if (c === 45) { neg = true; pos++; c = pos < L ? text.charCodeAt(pos) : 10; } else if (c === 43) { pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
      while (c >= 48 && c <= 57) { mant = mant * 10 + (c - 48); digits++; any = true; pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
      if (c === 46) {
        pos++; c = pos < L ? text.charCodeAt(pos) : 10;
        while (c >= 48 && c <= 57) { mant = mant * 10 + (c - 48); digits++; frac++; any = true; pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
      }
      if (c === 101 || c === 69) { // exponent
        pos++; c = pos < L ? text.charCodeAt(pos) : 10;
        let eneg = false; if (c === 45) { eneg = true; pos++; c = pos < L ? text.charCodeAt(pos) : 10; } else if (c === 43) { pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
        let ev = 0; while (c >= 48 && c <= 57) { ev = ev * 10 + (c - 48); pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
        exp = eneg ? -ev : ev;
      }
      while (c === 32) { pos++; c = pos < L ? text.charCodeAt(pos) : 10; }
      if (c !== 44 && c !== 10 && c !== 13) { // garbage in field: skip to separator
        ok = false;
        while (pos < L) { c = text.charCodeAt(pos); if (c === 44 || c === 10 || c === 13) break; pos++; }
        if (pos >= L) c = 10;
      }
      let v;
      if (!any || !ok) { v = NaN; if (!ok) nonNumeric++; }
      else if (digits > 15 || frac > 22 || exp !== 0) v = Math.abs(parseFloat(text.slice(tok, pos))); // exact slow path
      else v = frac ? mant / POW10[frac] : mant;
      if (col < ncol) cols[col][n] = neg ? -v : v;
      col++;
      if (c === 44) { pos++; continue; }
      break; // newline or end
    }
    // a row with the wrong field count (e.g. a partial last line after a power cut) is dropped
    if (col !== ncol) bad++;
    else n++;
    // consume line end
    while (pos < L) { c = text.charCodeAt(pos); if (c === 10 || c === 13) pos++; else break; }
  }
  return { n, cols: cols.map((a) => a.subarray(0, n)), bad, nonNumeric, trailer };
}

// aliases for plain CSV exports (lower-cased, non-alphanumerics stripped)
const ALIASES = {
  time: ['t_ms', 'time', 't', 'timestamp', 'datetime', 'utc', 'utc_ms', 'date_time', 'time_s', 't_s', 'seconds', 'secs', 'elapsed', 'isotime', 'gpstime'],
  lat: ['lat', 'latitude', 'lat_deg'],
  lon: ['lon', 'lng', 'long', 'longitude', 'lon_deg'],
  sog: ['sog', 'speed', 'sog_ms', 'speed_ms', 'spd', 'boatspeed', 'bsp', 'velocity', 'sog_kn', 'sog_kts', 'speed_kn', 'speed_kts', 'speed_knots', 'sog_knots', 'speed_kmh', 'sog_kmh'],
  cog: ['cog', 'course', 'heading_gps', 'track', 'cog_deg', 'bearing'],
  yaw: ['yaw', 'heading', 'hdg', 'compass'],
  roll: ['roll', 'heel'],
  pitch: ['pitch', 'trim'],
  tws: ['tws', 'windspeed', 'tws_ms'],
  twd: ['twd', 'winddir', 'wind_direction'],
  event: ['event', 'marker', 'mark'],
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9_]/g, '');

function splitCSVLine(line, sep) {
  if (line.indexOf('"') < 0) return line.split(sep);
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

function parseCSV(text) {
  const meta = {};
  const warnings = [];
  let pos = 0;
  const L = text.length;
  let header = null;
  while (pos < L) {
    const e = text.indexOf('\n', pos); const end = e < 0 ? L : e;
    const line = text.slice(pos, end).replace(/\r$/, '');
    pos = end + 1;
    if (!line.trim()) continue;
    if (line.startsWith('#')) { parseMetaLine(line, meta); continue; }
    header = line; break;
  }
  if (!header) throw new Error('No header line found');
  const sep = header.includes(',') ? ',' : header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
  const columns = splitCSVLine(header, sep).map((s) => s.trim());
  const isV1 = /^sail-log v1/.test(String(meta.format || '')) || (columns[0] === 't_ms' && columns.includes('gnss_new'));
  if (isV1 && sep === ',') {
    const r = scanNumeric(text, pos, columns.length);
    for (const l of r.trailer) parseMetaLine(l, meta);
    if (r.bad) warnings.push(`${r.bad} row(s) with a wrong field count dropped`);
    if (r.nonNumeric) warnings.push(`${r.nonNumeric} non-numeric fields read as empty`);
    const data = {};
    columns.forEach((c, i) => { data[c] = r.cols[i]; });
    if (!meta.format) warnings.push('no "# format=" line; read as v1 by its header');
    return { format: 'sail-log v1', meta, columns, n: r.n, data, warnings };
  }
  return parsePlainCSV(text, pos, columns, sep, meta, warnings);
}

function parsePlainCSV(text, pos, columns, sep, meta, warnings) {
  const lines = text.slice(pos).split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const n = lines.length;
  const keys = columns.map(norm);
  const find = (role) => { for (const a of ALIASES[role]) { const i = keys.indexOf(a); if (i >= 0) return i; } return -1; };
  const idx = {};
  for (const role of Object.keys(ALIASES)) idx[role] = find(role);
  if (idx.time < 0 || idx.lat < 0 || idx.lon < 0) throw new Error('CSV needs at least time, lat and lon columns (header: ' + columns.join(', ') + ')');
  const raw = columns.map(() => new Array(n));
  for (let r = 0; r < n; r++) {
    const f = splitCSVLine(lines[r], sep);
    for (let c = 0; c < columns.length; c++) raw[c][r] = (f[c] ?? '').trim();
  }
  const num = (arr) => Float64Array.from(arr, (s) => (s === '' ? NaN : +s));
  const data = {};
  // time -> t_ms (and utc_ms when absolute)
  const tcol = raw[idx.time];
  const firstT = tcol.find((s) => s !== '') || '';
  let t;
  if (firstT && !Number.isFinite(+firstT)) {
    t = Float64Array.from(tcol, (s) => { const v = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return Number.isFinite(v) ? v : NaN; });
    data.utc_ms = t.slice();
  } else {
    t = num(tcol);
    const name = keys[idx.time];
    const med = medianDiff(t);
    if (name === 't_ms' || name === 'utc_ms' || (med >= 5 && med <= 5000 && name !== 'time_s' && name !== 't_s' && name !== 'seconds' && name !== 'secs')) { /* already ms */ }
    else for (let i = 0; i < n; i++) t[i] *= 1000;
    if (t[0] > 1e12) data.utc_ms = t.slice();
  }
  const t0 = t.find(Number.isFinite);
  data.t_ms = Float64Array.from(t, (v) => v - t0);
  data.lat = num(raw[idx.lat]); data.lon = num(raw[idx.lon]);
  if (idx.sog >= 0) {
    const s = num(raw[idx.sog]); const name = keys[idx.sog];
    const f = /kn|kts|knot/.test(name) ? 1852 / 3600 : /kmh/.test(name) ? 1 / 3.6 : 1;
    if (f !== 1) for (let i = 0; i < n; i++) s[i] *= f;
    data.sog = s;
  } else warnings.push('no speed column: speed derived from positions');
  for (const role of ['cog', 'yaw', 'roll', 'pitch', 'tws', 'twd', 'event']) if (idx[role] >= 0) data[role] = num(raw[idx[role]]);
  // keep any other numeric columns under their own names
  columns.forEach((c, i) => { if (!Object.values(idx).includes(i) && !data[c]) { const a = num(raw[i]); if (a.some(Number.isFinite)) data[c] = a; } });
  if (!meta.format) meta.format = 'csv';
  return { format: 'csv', meta, columns: Object.keys(data), n, data, warnings };
}

function medianDiff(t) {
  const d = [];
  for (let i = 1; i < t.length && d.length < 200; i++) if (Number.isFinite(t[i]) && Number.isFinite(t[i - 1])) d.push(t[i] - t[i - 1]);
  d.sort((a, b) => a - b); return d.length ? d[d.length >> 1] : NaN;
}

export function parseGPX(text) {
  const pts = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m;
  const attr = (s, k) => { const r = new RegExp(`\\b${k}\\s*=\\s*["']([^"']+)["']`).exec(s); return r ? +r[1] : NaN; };
  const tag = (s, k) => { const r = new RegExp(`<(?:\\w+:)?${k}>([^<]*)</(?:\\w+:)?${k}>`).exec(s || ''); return r ? r[1].trim() : ''; };
  while ((m = re.exec(text))) {
    const a = m[1] ?? m[3], body = m[2] ?? '';
    const time = tag(body, 'time');
    pts.push({ lat: attr(a, 'lat'), lon: attr(a, 'lon'), t: time ? Date.parse(time) : NaN, speed: parseFloat(tag(body, 'speed')), course: parseFloat(tag(body, 'course')) });
  }
  if (!pts.length) throw new Error('GPX without track points');
  const n = pts.length;
  const t0 = pts.find((p) => Number.isFinite(p.t))?.t;
  if (!Number.isFinite(t0)) throw new Error('GPX track points need <time>');
  const data = {
    t_ms: Float64Array.from(pts, (p) => p.t - t0), utc_ms: Float64Array.from(pts, (p) => p.t),
    lat: Float64Array.from(pts, (p) => p.lat), lon: Float64Array.from(pts, (p) => p.lon),
  };
  const warnings = [];
  if (pts.some((p) => Number.isFinite(p.speed))) data.sog = Float64Array.from(pts, (p) => p.speed);
  else warnings.push('GPX without <speed>: speed derived from positions');
  if (pts.some((p) => Number.isFinite(p.course))) data.cog = Float64Array.from(pts, (p) => p.course);
  const name = /<name>([^<]*)<\/name>/.exec(text);
  return { format: 'gpx', meta: { format: 'gpx', boat: name ? name[1] : '' }, columns: Object.keys(data), n, data, warnings };
}

// ---------- writer ----------
const DEFAULT_DEC = { t_ms: 0, utc_ms: 0, gnss_new: 0, lat: 7, lon: 7, sog: 3, cog: 1, sacc: 2, hacc: 1, fix: 0, sats: 0, yaw: 1, roll: 1, pitch: 1, gx: 2, gy: 2, gz: 2, ax: 2, ay: 2, az: 2, rudder_us: 0, sheet_us: 0, aux1_us: 0, aux2_us: 0, vbat: 2, event: 0, tws: 2, twd: 1 };

export function fmtNum(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const s = v.toFixed(d);
  return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
}

/** meta: object (format first), columns: names, data: {name: array}, n rows. */
export function writeLog({ meta, columns = V1_COLUMNS, data, n, decimals = {}, trailer = null }) {
  const dec = { ...DEFAULT_DEC, ...decimals };
  const out = [];
  const m = { format: 'sail-log v1', ...meta };
  for (const [k, v] of Object.entries(m)) out.push(`# ${k}=${v}`);
  out.push(columns.join(','));
  const arrs = columns.map((c) => data[c] || null);
  const ds = columns.map((c) => dec[c] ?? 3);
  for (let i = 0; i < n; i++) {
    let row = '';
    for (let c = 0; c < arrs.length; c++) { if (c) row += ','; const a = arrs[c]; if (a) row += fmtNum(a[i], ds[c]); }
    out.push(row);
  }
  if (trailer) for (const [k, v] of Object.entries(trailer)) out.push(`# ${k}=${v}`);
  return out.join('\n') + '\n';
}

export function writeGPX(name, pts) {
  const rows = pts.map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time><speed>${p.speed.toFixed(2)}</speed><course>${p.course.toFixed(1)}</course></trkpt>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.0" creator="synth-log" xmlns="http://www.topografix.com/GPX/1/0">\n<trk><name>${name}</name><trkseg>\n${rows.join('\n')}\n</trkseg></trk>\n</gpx>\n`;
}
