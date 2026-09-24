// A/B configuration testing (DOM-free).
//
// 1. Every sample gets a configuration (A, B or none):
//    'toggle'    : start config, every event marker (> 0) flips A <-> B
//    'value'     : marker value 1 selects A, 2 selects B (others flip)
//    'ranges'    : user list "m:ss-m:ss A|B" (uncovered time is excluded)
//    'alternate' : no markers; legs of each type alternate A, B, A, … in time order
// 2. Legs take the configuration of their samples (legs are split at markers).
// 3. Per leg type (in time order), adjacent units with different configurations are paired without
//    overlap. The unit is a single leg when the configuration changes every leg or two (ABBA or
//    alternating designs: A B | B A | A B …), else a block = run of consecutive legs with the same
//    configuration (duration-weighted means; e.g. one configuration per lap). A pair is dropped
//    when the gap between its units exceeds maxGap.
// 4. Per pair d = (B / A − 1) × 100 % for mean VMG, mean SOG and SOG/model speed (when a model is loaded). Paired t (CI, p), percentile
//    bootstrap CI, and the pairs needed for a target resolution / power.
import { pairedStats, pairsForHalfWidth, pairsForPower, powerFor } from './stats.js';
import { parseClock } from './util.js';

export const AB_DEFAULTS = { pairing: 'auto', mode: 'toggle', start: 'A', ranges: '', metric: 'vmg', effect: 1.0, maxGap: 900, types: ['up', 'down', 'reach'] };

export function parseRanges(text) {
  const out = [];
  for (const line of String(text || '').split(/\n|;/)) {
    const m = /^\s*([\d:.]+)\s*[-–]\s*([\d:.]+)\s*([AB])\s*$/i.exec(line);
    if (m) out.push({ t0: parseClock(m[1]), t1: parseClock(m[2]), cfg: m[3].toUpperCase() });
  }
  return out;
}

/** Per-sample configuration: Uint8Array 0 = none, 1 = A, 2 = B. */
export function configArray(track, opts = {}) {
  const o = { ...AB_DEFAULTS, ...opts };
  const n = track.n, out = new Uint8Array(n);
  const s0 = o.start === 'B' ? 2 : 1;
  if (o.mode === 'toggle' || o.mode === 'value') {
    let cur = s0;
    for (let k = 0; k < n; k++) {
      const e = track.event[k];
      if (e > 0) cur = o.mode === 'value' && (e === 1 || e === 2) ? e : 3 - cur;
      out[k] = cur;
    }
  } else if (o.mode === 'ranges') {
    const rs = parseRanges(o.ranges);
    for (const r of rs) for (let k = 0; k < n; k++) if (track.t[k] >= r.t0 && track.t[k] < r.t1) out[k] = r.cfg === 'B' ? 2 : 1;
  }
  return out;
}

export function assignLegs(legs, cfg, opts = {}) {
  const o = { ...AB_DEFAULTS, ...opts };
  if (o.mode === 'alternate') {
    const cnt = {};
    for (const L of legs) { const c = cnt[L.mode] = (cnt[L.mode] ?? -1) + 1; L.config = (c % 2 === 0) === (o.start !== 'B') ? 'A' : 'B'; }
    return legs;
  }
  for (const L of legs) {
    let a = 0, b = 0;
    for (let k = L.i0; k <= L.i1; k++) { if (cfg[k] === 1) a++; else if (cfg[k] === 2) b++; }
    const len = L.i1 - L.i0 + 1;
    L.config = a > 0.9 * len ? 'A' : b > 0.9 * len ? 'B' : '';
  }
  return legs;
}

function blockOf(legs) {
  let d = 0, v = 0, g = 0, port = 0, gn = 0, q = 0, qn = 0;
  for (const L of legs) {
    d += L.dur; v += L.dur * L.sog;
    if (Number.isFinite(L.ratio)) { q += L.dur * L.ratio; qn += L.dur; }
    if (Number.isFinite(L.vmg)) { g += L.dur * L.vmg; gn += L.dur; }
    if (L.side < 0) port += L.dur;
  }
  return { legs: legs.map((L) => L.id), config: legs[0].config, t0: legs[0].t0, t1: legs[legs.length - 1].t1, dur: d, sog: v / d, vmg: gn ? g / gn : NaN, ratio: qn ? q / qn : NaN, portFrac: port / d, twa: legs.reduce((a, L) => a + L.dur * L.twa, 0) / d };
}

export function pairLegs(legs, opts = {}) {
  const o = { ...AB_DEFAULTS, ...opts };
  const res = {};
  for (const type of o.types) {
    const ls = legs.filter((L) => L.mode === type && (L.config === 'A' || L.config === 'B')).sort((a, b) => a.t0 - b.t0);
    const blocks = [];
    for (const L of ls) {
      const last = blocks[blocks.length - 1];
      if (last && last[0].config === L.config) last.push(L); else blocks.push([L]);
    }
    // pairing unit: single legs when the configuration changes every leg or two (ABBA, alternating),
    // else runs of legs averaged into blocks (e.g. one configuration per lap)
    const runLen = blocks.map((x) => x.length).sort((x, y) => x - y);
    const unit = o.pairing === 'legs' || o.pairing === 'blocks' ? o.pairing : (runLen[runLen.length >> 1] || 1) <= 2 ? 'legs' : 'blocks';
    const B = unit === 'legs' ? ls.map((L) => blockOf([L])) : blocks.map(blockOf);
    const pairs = [];
    for (let i = 0; i + 1 < B.length;) {
      const p = B[i], q = B[i + 1];
      if (p.config === q.config || q.t0 - p.t1 > o.maxGap) { i += 1; continue; }
      const a = p.config === 'A' ? p : q, b = p.config === 'A' ? q : p;
      pairs.push({ a, b, order: p.config + q.config, t: (p.t0 + q.t1) / 2, dSpeed: (b.sog / a.sog - 1) * 100, dVmg: (b.vmg / a.vmg - 1) * 100, dRatio: (b.ratio / a.ratio - 1) * 100 });
      i += 2;
    }
    const tot = { A: { dur: 0, port: 0 }, B: { dur: 0, port: 0 } };
    for (const L of ls) { tot[L.config].dur += L.dur; if (L.side < 0) tot[L.config].port += L.dur; }
    res[type] = { type, unit, legs: ls.length, blocks: B, pairs, balance: { A: tot.A.dur ? tot.A.port / tot.A.dur : NaN, B: tot.B.dur ? tot.B.port / tot.B.dur : NaN, durA: tot.A.dur, durB: tot.B.dur } };
  }
  return res;
}

const pick = (p, metric) => (metric === 'vmg' ? p.dVmg : metric === 'ratio' ? p.dRatio : p.dSpeed);

const TYPE_WORD = { up: 'upwind', down: 'downwind', reach: 'reaching', all: 'overall' };

export function analyzeAB(legs, cfgArrOrNull, opts = {}) {
  const o = { ...AB_DEFAULTS, ...opts };
  const byType = pairLegs(legs, o);
  const out = { opts: o, types: {} };
  for (const [type, r] of Object.entries(byType)) {
    const metric = type === 'reach' && o.metric === 'vmg' ? 'speed' : o.metric;
    const d = r.pairs.map((p) => pick(p, metric)).filter(Number.isFinite);
    const st = pairedStats(d);
    const stSpeed = pairedStats(r.pairs.map((p) => p.dSpeed).filter(Number.isFinite));
    const res = { ...r, metric, stats: st, speedStats: stSpeed };
    res.cumulative = d.map((_, i) => { const s = pairedStats(d.slice(0, i + 1), { boot: 0 }); return { n: i + 1, mean: s.mean, lo: s.ci?.[0], hi: s.ci?.[1] }; });
    if (st.n >= 2) {
      res.nForHalf = pairsForHalfWidth(st.sd, o.effect / 2);
      res.nForPower = pairsForPower(st.sd, o.effect);
      res.power = powerFor(st.sd, st.n, o.effect);
    }
    res.verdict = verdict(res, type, metric, o.effect);
    out.types[type] = res;
  }
  // pooled speed comparison over all leg types (more pairs; speed % is comparable across types)
  const all = Object.values(byType).flatMap((r) => r.pairs.map((p) => p.dSpeed)).filter(Number.isFinite);
  const pooled = { type: 'all', metric: 'speed', stats: pairedStats(all), pairs: Object.values(byType).flatMap((r) => r.pairs) };
  if (pooled.stats.n >= 2) { pooled.nForHalf = pairsForHalfWidth(pooled.stats.sd, o.effect / 2); pooled.nForPower = pairsForPower(pooled.stats.sd, o.effect); pooled.power = powerFor(pooled.stats.sd, pooled.stats.n, o.effect); }
  pooled.verdict = verdict(pooled, 'all', 'speed', o.effect);
  out.pooled = pooled;
  return out;
}

export function verdict(res, type, metric, effect) {
  const st = res.stats;
  const w = TYPE_WORD[type] || type;
  const what = metric === 'vmg' ? 'VMG' : metric === 'ratio' ? 'speed/model' : 'speed';
  if (!st || st.n < 2) return { level: 'none', conclusive: false, text: `Not enough ${w} A/B pairs (${st?.n || 0}); at least 2 are needed, 10+ for a useful answer.` };
  const faster = st.mean >= 0 ? 'B' : 'A';
  const mag = Math.abs(st.mean), half = st.half;
  const p = st.p < 0.001 ? 'p < 0.001' : `p = ${st.p.toFixed(st.p < 0.1 ? 3 : 2)}`;
  const head = `${faster} is ${mag.toFixed(1)}% ± ${half.toFixed(1)}% faster ${w} in ${what} (95% CI, ${st.n} pairs, ${p})`;
  const excl0 = st.ci[0] > 0 || st.ci[1] < 0;
  if (excl0) return { level: 'difference', conclusive: true, faster, text: `${head}; conclusive at 95%.` };
  if (st.ci[0] > -effect && st.ci[1] < effect) return { level: 'equivalent', conclusive: true, text: `${head}; no difference: any effect is smaller than ±${effect}% (95%).` };
  const more = Math.max(1, (res.nForHalf || NaN) - st.n);
  return { level: 'open', conclusive: false, faster, text: `${head}; not yet conclusive — ~${Number.isFinite(more) ? more : '?'} more pairs needed for ±${(effect / 2).toFixed(1)}%.` };
}
