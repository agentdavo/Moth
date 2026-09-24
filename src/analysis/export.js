// CSV / JSON exports of an analysis result (DOM-free).
const r = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : null);

export const LEG_FIELDS = [
  ['id', 'leg', 0], ['t0', 't_start_s', 1], ['t1', 't_end_s', 1], ['dur', 'duration_s', 1], ['mode', 'type'], ['tack', 'tack'], ['config', 'config'],
  ['sog', 'sog_ms', 3], ['vmg', 'vmg_ms', 3], ['vmgMG', 'vmg_made_good_ms', 3], ['twa', 'twa_deg', 1], ['twd', 'twd_deg', 1], ['tws', 'tws_ms', 2],
  ['dist', 'distance_m', 1], ['heel', 'heel_leeward_deg', 1], ['heelSd', 'heel_sd_deg', 1], ['pitch', 'pitch_deg', 2],
  ['rudder', 'rudder_weather_deg', 2], ['rudderSd', 'rudder_sd_deg', 2], ['sheet', 'sheet_pct', 1], ['cv', 'speed_cv_pct', 2],
  ['hacc', 'hacc_m', 2], ['sacc', 'sacc_ms', 3], ['satsMin', 'sats_min', 0], ['fix3', 'fix3_frac', 3],
  ['modelSpeed', 'model_speed_ms', 3], ['ratio', 'speed_over_model', 4], ['modelVmg', 'model_vmg_ms', 3], ['vmgRatio', 'vmg_over_model', 4],
];

export function legsCSV(legs) {
  const head = LEG_FIELDS.map((f) => f[1]).join(',');
  const rows = legs.map((L) => LEG_FIELDS.map(([k, , d]) => { const v = L[k]; if (typeof v === 'string') return v; return Number.isFinite(v) ? (d === undefined ? String(v) : v.toFixed(d)) : ''; }).join(','));
  return [head, ...rows].join('\n') + '\n';
}

export function summaryJSON(res, track, fileName = '') {
  const legs = res.legs.map((L) => Object.fromEntries(LEG_FIELDS.map(([k, name, d]) => [name, typeof L[k] === 'string' ? L[k] : r(L[k], d ?? 3)])));
  const man = res.maneuvers.map((m) => ({
    type: m.type, t_s: r(m.t, 1), valid: m.valid ?? null, entry_speed_ms: r(m.vEntry), entry_vmg_ms: r(m.vmgEntry), distance_lost_m: r(m.distLost, 2),
    min_speed_ms: r(m.vMin), min_over_entry: r(m.minRatio), t90_s: r(m.t90, 1), turn_s: r(m.turnDur, 1), heel_swing_deg: r(m.heelSwing, 1),
    twa_in_deg: r(m.twaIn, 1), twa_out_deg: r(m.twaOut, 1), dropped_off_foils: m.dropped ?? null, overlaps_other: m.overlap ?? null,
  }));
  const ab = {};
  for (const [k, v] of Object.entries(res.ab.types).concat([['all', res.ab.pooled]])) {
    const s = v.stats || {};
    ab[k] = { metric: v.metric, pairs: s.n || 0, mean_pct: r(s.mean), sd_pct: r(s.sd), ci95_t: s.ci ? s.ci.map((x) => r(x)) : null, ci95_boot: s.boot ? s.boot.map((x) => r(x)) : null, p: r(s.p, 4), pairs_for_half_effect: v.nForHalf ?? null, pairs_for_80pct_power: v.nForPower ?? null, verdict: v.verdict?.text };
  }
  return JSON.stringify({
    file: fileName, format: track.format, meta: track.meta, class: track.cls,
    duration_s: r(track.duration, 1), analysis_rate_hz: track.rate,
    wind: { twd_deg: r(res.twd0, 1), twd_source: res.twdSource, twd_auto_deg: r(res.est.twd, 1), twd_auto_confidence: r(res.est.confidence, 2), tws_mean_ms: r(res.summary.twsMean, 2), tracked_shifts: !!res.shift },
    settings: res.settings, summary: res.summary, model: res.model ? res.model.name : null,
    legs, maneuvers: man, ab,
    polar: res.polar.map((p) => ({ tws_ms: r(p.tws, 2), bins: p.bins.map((b) => ({ twa: b.twa, n: b.n, mean_ms: r(b.mean), p90_ms: r(b.p90) })) })),
  }, null, 1);
}
