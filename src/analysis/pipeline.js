// Whole analysis for one track and one set of settings (DOM-free, synchronous, fast:
// a 1-h log at the 10-Hz analysis rate takes well under a second).
import { estimateTWD, trackTWD, parseTwsSchedule, twsArray } from './wind.js';
import { segment, SEG_DEFAULTS } from './segment.js';
import { legMetrics, maneuverMetrics, polarPoints, binPolar, scatterSamples, MAN_DEFAULTS } from './metrics.js';
import { configArray, assignLegs, analyzeAB, AB_DEFAULTS } from './ab.js';
import { KN, wrap360, mean, circMean, movingAverage } from './util.js';

export const CLASS_DEFAULTS = {
  Moth: { twsKn: 11, seg: { settle: 10, minLeg: 20 }, man: { mPre: 10, mPost: 20 } },
  IOM: { twsKn: 8, seg: { settle: 12, minLeg: 20, hyst: 12 }, man: { mPre: 10, mPost: 25, foilSpeed: 0 } },
  other: { twsKn: 10, seg: {}, man: {} },
};

export function defaultSettings(track) {
  const c = CLASS_DEFAULTS[track.cls] || CLASS_DEFAULTS.other;
  return {
    twdMode: track.twdCol ? 'column' : 'auto', twd: NaN, trackShifts: !track.twdCol,
    tws: c.twsKn * KN, twsSchedule: '',
    seg: { ...SEG_DEFAULTS, ...c.seg }, man: { ...MAN_DEFAULTS, ...c.man }, ab: { ...AB_DEFAULTS },
  };
}

export function analyze(track, settings, model = null) {
  const s = settings;
  const est = estimateTWD(track);
  let twd0 = s.twdMode === 'manual' && Number.isFinite(s.twd) ? wrap360(s.twd) : est.twd;
  if (!Number.isFinite(twd0)) twd0 = 0;
  let twd, twdSource;
  if (s.twdMode === 'column' && track.twdCol) {
    // smoothed (30 s) wind-vane direction, gaps filled with the estimate
    const sn = new Float64Array(track.n), cs = new Float64Array(track.n);
    for (let k = 0; k < track.n; k++) { const a = track.twdCol[k] * Math.PI / 180; sn[k] = Math.sin(a); cs[k] = Math.cos(a); }
    const w = Math.round(30 * track.rate);
    const ss = movingAverage(sn, w), cc = movingAverage(cs, w);
    twd = new Float64Array(track.n);
    for (let k = 0; k < track.n; k++) twd[k] = Number.isFinite(ss[k]) ? wrap360(Math.atan2(ss[k], cc[k]) * 180 / Math.PI) : twd0;
    twd0 = circMean(twd);
    twdSource = 'column';
  } else { twd = new Float64Array(track.n).fill(twd0); twdSource = s.twdMode === 'manual' ? 'manual' : 'auto'; }
  let seg = segment(track, twd, s.seg);
  let shift = null;
  if (s.trackShifts && twdSource !== 'column') {
    shift = trackTWD(track, seg.legs, twd0);
    twd = shift.twd;
    seg = segment(track, twd, s.seg);
  }
  const schedule = parseTwsSchedule(s.twsSchedule);
  const tws = twsArray(track, s.tws, schedule);
  legMetrics(track, seg, { twd, tws, model, foilSpeed: s.man.foilSpeed });
  let maneuvers = maneuverMetrics(track, seg, s.man);
  if (s.seg.adaptiveSettle !== false) {
    // legs start only once the boat has regained 90 % of its entry speed (+2 s), up to 30 s
    const extra = [];
    for (const m of maneuvers) {
      if (m.type !== 'tack' && m.type !== 'gybe') continue;
      const rec = Number.isFinite(m.t90) ? Math.min(30, m.t90 + 2) : m.valid ? 30 : 0;
      if (rec > s.seg.settle) extra.push([m.i, m.i + Math.round(rec * track.rate)]);
    }
    if (extra.length) {
      seg = segment(track, twd, s.seg, extra);
      legMetrics(track, seg, { twd, tws, model, foilSpeed: s.man.foilSpeed });
      maneuvers = maneuverMetrics(track, seg, s.man);
    }
  }
  const cfg = configArray(track, s.ab);
  assignLegs(seg.legs, cfg, s.ab);
  const ab = analyzeAB(seg.legs, cfg, s.ab);
  const points = polarPoints(track, seg, tws, s.man.blockS);
  let twsMin = Infinity, twsMax = -Infinity;
  for (const v of tws) { if (v < twsMin) twsMin = v; if (v > twsMax) twsMax = v; }
  const varying = twsMax - twsMin > 1.5 * KN;
  const polar = binPolar(points, { bin: s.man.polarBin, twsBand: varying ? 2 * KN : 0 });
  const scatter = scatterSamples(track, seg);
  const summary = summarize(track, seg, maneuvers, est, twd0, tws);
  return { settings: s, est, twd0, twd, twdSource, shift, tws, twsVarying: varying, seg, legs: seg.legs, maneuvers, cfg, ab, points, polar, scatter, summary, model };
}

function summarize(track, seg, maneuvers, est, twd0, tws) {
  let dist = 0;
  for (let k = 1; k < track.n; k++) { const d = Math.hypot(track.x[k] - track.x[k - 1], track.y[k] - track.y[k - 1]); if (Number.isFinite(d) && d < 50) dist += d; }
  const by = (mode) => seg.legs.filter((L) => L.mode === mode);
  const wmean = (ls, key) => { let s = 0, w = 0; for (const L of ls) if (Number.isFinite(L[key])) { s += L.dur * L[key]; w += L.dur; } return w ? s / w : NaN; };
  const mk = (mode) => { const ls = by(mode); return { legs: ls.length, time: ls.reduce((a, L) => a + L.dur, 0), sog: wmean(ls, 'sog'), vmg: wmean(ls, 'vmg'), twa: wmean(ls, 'twa'), heel: wmean(ls, 'heel') }; };
  const tk = maneuvers.filter((m) => m.type === 'tack' && m.valid), gy = maneuvers.filter((m) => m.type === 'gybe' && m.valid);
  const avg = (a, k) => mean(a.map((m) => m[k]));
  let gnss = 0; for (let k = 0; k < track.n; k++) gnss += track.gnssOk[k];
  return {
    duration: track.duration, distance: dist, maxSpeed: movingAverage(track.sog, Math.max(1, Math.round(2 * track.rate))).reduce((a, v) => (v > a ? v : a), 0),
    up: mk('up'), down: mk('down'), reach: mk('reach'),
    tacks: { n: maneuvers.filter((m) => m.type === 'tack').length, loss: avg(tk, 'distLost'), t90: avg(tk, 't90'), minRatio: avg(tk, 'minRatio'), dropped: tk.filter((m) => m.dropped).length },
    gybes: { n: maneuvers.filter((m) => m.type === 'gybe').length, loss: avg(gy, 'distLost'), t90: avg(gy, 't90'), minRatio: avg(gy, 'minRatio'), dropped: gy.filter((m) => m.dropped).length },
    roundings: maneuvers.filter((m) => m.type === 'bearaway' || m.type === 'roundup').length,
    events: track.events.length, gnssCoverage: gnss / track.n, twd: twd0, twsMean: mean(tws),
  };
}
