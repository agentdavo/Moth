# Sail log analysis (`analysis.html`)

A standalone page that reads a sailing log, splits it into steady legs and maneuvers, and measures them. Its main use is A/B testing a change (riblet film on a Moth strut, a different bulb on an IOM) on the water with a single boat. It reads the on-board logger's CSV ([LOG_FORMAT.md](LOG_FORMAT.md), v1). It also reads a plain CSV that has at least time, lat, lon and speed columns, and GPX tracks.

- **Run it:** `npx vite`, then open `http://localhost:5173/analysis.html`. The file is processed in the browser tab and is not uploaded anywhere.
- **Samples:** *Load sample* offers synthetic logs with a known +1 % speed effect for configuration B. They are in `docs/samples/` and are made by `tools/synth-log.mjs`.
- **Code:** everything except the page wiring is in DOM-free ES modules in `src/analysis/`. The tests in `tests/analysis.test.mjs` import them directly.
- **Screenshots:** `docs/screenshots/20-analysis-*.png`, made by `tools/screenshot-analysis.mjs`.

| Module | Role |
|---|---|
| `parse.js` | v1 parser (char scanner, ~0.15–0.25 s for 180 k rows × 28 fields), plain CSV, GPX, v1 writer |
| `track.js` | uniform analysis track: time base, GNSS interpolation, ENU metres, smoothed course/speed, calibrated rudder/sheet |
| `wind.js` | TWD auto-estimate, shift tracking, TWS schedule |
| `segment.js` | tack/gybe/bear-away/round-up detection, point of sail, steady legs |
| `metrics.js` | leg metrics, maneuver metrics, polar points/bins/envelope, scatter samples |
| `ab.js`, `stats.js` | configuration assignment, pairing, paired t, bootstrap, power |
| `model.js`, `model.worker.js` | model polar adapter; Moth polar from `src/physics/vpp.js` computed in a worker |
| `pipeline.js`, `export.js` | one call `analyze(track, settings, model)`; CSV/JSON exports |
| `parse.worker.js`, `charts.js`, `app.js`, `analysis.css` | off-thread parsing, canvas charts, UI |

## 1. Pre-processing

- **Time base.** t = (t_ms − t_ms[0]) / 1000 s. If t_ms is not monotonic, the row index / rate_hz is used instead. The analysis runs at min(rate_hz, 10 Hz).
  - Higher-rate channels are block-averaged onto the grid: roll, pitch, servo pulses and vbat by plain mean, yaw by circular mean.
  - `event` takes the block maximum, so a marker written on a single row is never lost.
- **GNSS.** Only rows with `gnss_new = 1` and `fix ≥ 2` are used (or rows with a changed position when there is no `gnss_new` column).
  - lat, lon, sog, cog, hacc and sacc are linearly interpolated onto the grid. Gaps longer than 2.5 s stay empty.
  - Positions become local east/north metres about the first fix (equirectangular projection).
- **Course and speed for segmentation.** The Doppler velocity vector (sog·sin cog, sog·cos cog) is averaged over 1 s, and the course is the direction of that vector. Unlike a smoothed cog, it stays defined at the low speeds inside a tack.
  - Turn rate is the central difference of the unwrapped course over ±0.5 s.
  - `yaw` is not used for segmentation or wind. It may be empty (game-rotation fusion without a magnetometer), and its magnetic error can reach ±5°.
- **Calibration.** Both values come from the metadata. Without the calibration keys the channel is not shown, and a warning appears.
  - rudder angle = (rudder_us − rudder_center_us) × rudder_deg_per_us, + = trailing edge to port.
  - sheet % = (sheet_us − sheet_in_us) / (sheet_out_us − sheet_in_us) × 100 (0 = fully in).
- **Bad rows.** A row with the wrong number of fields is dropped, for example a partial last line after a power cut. The `#` trailer (start_utc, rows, dropped_rows, end_t_ms) is read like the header metadata. Unknown keys (board, imu_fusion, yaw_ref, …) are kept and otherwise ignored.

## 2. Wind

**Signed TWA** = wrap₁₈₀(TWD − course). A positive value means the wind is over starboard (starboard tack).

**TWD auto-estimate** (`estimateTWD`) uses the steady samples: speed > 0.45 × the median speed and |turn rate| < 4°/s.

1. Histogram the course in 1° bins and smooth it with a Gaussian (σ = 3°).
2. Find the axis of best mirror symmetry, S(φ) = Σ_c h(c)·h(φ − c) with φ = 2 × axis. Pairs of courses less than 30° apart are ignored, because a single straight leg is trivially symmetric. The two tacks upwind, and the two gybing angles downwind, are mirror images about the wind axis.
3. Decide which end of the axis is upwind by a weighted vote. The upwind half has:
   - more |heel| (weight 1);
   - the sheet further in (weight 1.5);
   - lower speed (weight 1.5 for a Moth, 0.75 otherwise);
   - a wider half-angle to the axis (weight 0.5).
4. Refine: with the tack of every sample known, the TWD error is e = (median TWA on starboard + median TWA on port) / 2. This is computed separately upwind and downwind, weighted by sample count, and iterated to convergence.

The confidence shown combines the sharpness of the symmetry peak with the clarity of the vote. The estimate is shown in the Wind panel and can be overridden with a manual TWD.

**Shift tracking** is on by default when there is no wind column. For each pair of consecutive opposite-tack legs of the same type (up/up or down/down, ≤ 4 min apart), the local wind correction is −(TWA_a + TWA_b)/2, placed at the time between the two legs. This assumes the boat sails the same TWA on both tacks. The corrections are lightly smoothed (3-point), interpolated in time and held flat at the ends. Segmentation is then repeated with TWD(t).

**Wind columns.** When `tws_source` is `anemometer` or `manual` and the `tws`/`twd` columns hold data:
- TWD(t) is the 30-s circular moving average of `twd`;
- TWS(t) is `tws`.

**TWS** otherwise comes from the input box. The class default is Moth 11 kn, IOM 8 kn. A *TWS by time window* list (`m:ss-m:ss value`, kn unless the value ends in `m/s`) overrides the TWS inside each window. TWS is used only for the model overlay and for splitting the polar into TWS bands (2-kn bands when TWS varies by more than 1.5 kn).

## 3. Segmentation

- **Tack side with hysteresis.** The side becomes +1 once the signed TWA is inside (h, 180 − h), and −1 inside (−180 + h, −h), with h = 12°. Otherwise it keeps its previous value. The side is not updated while the boat is slow (< 0.35 × the median speed).
- **Short holds.** A side held for less than 4 s is merged back, so a wobble through the wind is not a maneuver.
- **Tack or gybe.** Every change of side is one maneuver. Its time t₀ is the last sign change of the signed TWA before the new side is established.
  - The TWA crosses 0 → **tack**.
  - The TWA crosses ±180 → **gybe**.
- **Point of sail.** From |TWA| median-filtered over 5 s:
  - up: |TWA| < 70°;
  - reach: 70°–110°;
  - down: |TWA| > 110°;
  - 4° hysteresis on the borders; runs shorter than 4 s are merged.
- **Bear-aways and round-ups** are changes of point of sail. A short reach (< 15 s) between up and down is merged into one event, timed where |TWA| crosses 90°. They are listed but kept out of the tack/gybe loss statistics.
- **Legs** are maximal runs with a constant side and point of sail. The following samples are excluded, and a leg is kept only if it lasts at least **20 s** (*Min leg*):
  - [t₀ − 5 s, t₀ + 10 s] around every maneuver (*Cut before*, *Settle after*);
  - samples turning by more than 30° over ±5 s;
  - slow samples;
  - GNSS gaps.
- **Adaptive settle** (on by default). After a tack or gybe, the next leg starts only at t₀ + t₉₀ + 2 s (capped at 30 s), where t₉₀ is the time to regain 90 % of the entry speed (§5). A Moth that dropped off the foils therefore does not pull its acceleration phase into the leg mean.
- **Event markers.** Legs are split at every `event` marker, so a leg never mixes two configurations.

## 4. Leg metrics

For the samples k in leg L (analysis rate, all channels as above):

| Metric | Definition |
|---|---|
| duration | t_last − t_first + Δt |
| SOG | mean of the interpolated Doppler `sog` |
| VMG | mean of sog·cos(TWA) upwind; mean of −sog·cos(TWA) downwind (positive = made good toward / away from the wind); undefined on reaches |
| VMG made good | displacement from the first to the last sample, projected on the wind axis, / duration (independent of the Doppler speed) |
| TWA | abs(mean signed TWA) using TWD(t) |
| heel | mean of −side × roll: + = heeled to leeward; a Moth sailed flat-to-windward reads negative |
| heel sd | standard deviation of the same |
| pitch | mean pitch (+ bow up) |
| rudder | mean of −side × rudder angle: + = weather helm (the rudder holds the bow away from the wind) |
| rudder sd | steering activity |
| sheet | mean sheet % |
| speed CV | standard deviation / mean of the 1-s mean SOG, sampled once per second (straight-line consistency) |
| GNSS quality | mean hacc, mean sacc, minimum satellites, fraction of samples with a 3-D fix |
| SOG/model | SOG / model speed at the leg's TWA and TWS (§6); VMG/model = VMG / model best VMG for that point of sail |

## 5. Maneuver metrics (tacks and gybes)

The time origin is t₀, the head-to-wind crossing (tack) or the dead-downwind crossing (gybe). Signs are chosen so VMG is positive in the direction of travel: VMG(t) = sog·cos(TWA) for a tack, −sog·cos(TWA) for a gybe.

| Metric | Definition (defaults) |
|---|---|
| entry speed V_e, entry VMG | means over [t₀ − 16 s, t₀ − 10 s] (a 6-s window just before the loss window) |
| **distance lost** | D = ∫ (VMG_ref − VMG(t)) dt over the **loss window [t₀ − 10 s, t₀ + 20 s]** (Moth; IOM uses +25 s). VMG_ref is the entry VMG (default) or the mean of the entry VMG and the exit VMG over [t₀ + 20, t₀ + 26 s]. This is the distance, in metres along the wind axis, by which the boat trails a ghost boat that kept sailing at VMG_ref for the whole window. |
| minimum speed | min SOG in [t₀ − 5 s, t₀ + window end]; also given as a fraction of V_e |
| t₉₀ | first time after the minimum at which the 1-s SOG is ≥ 0.9 V_e, in s after t₀ (searched up to +40 s; empty if never reached) |
| turn duration | turn start to turn end: the last and first samples around t₀ (±15 s) where \|turn rate\| < max(4°/s, 15 % of the peak rate) |
| heel through the turn | min and max roll between turn start and end, and the swing max − min |
| TWA in / out | mean \|TWA\| over the entry window and over the last 5 s of the loss window |
| off foils (Moth) | minimum speed < *Off-foil below* (default 3.8 m/s ≈ 7.4 kn) |
| overlaps | another tack or gybe inside the entry or loss window, which contaminates the numbers |

A maneuver is marked incomplete when its window runs outside the log, or when more than 30 % of the entry samples are missing (a GNSS gap).

## 6. Polar and model overlay

- **Points.** Each leg is cut into 10-s blocks. Each block gives a point (mean |TWA|, mean SOG, mean TWS). Leg means are drawn on top of the blocks.
- **Bins.** 5° TWA bins (per TWS band when TWS varies), each with count, mean, 90th percentile, max and VMG.
- **Envelope.** Within each contiguous group of bins (gaps ≤ 10°) with ≥ 2 blocks per bin, a weighted (√n) least-squares quadratic is fitted to the per-bin 90th percentiles. It is drawn only over the TWA range that was actually sailed; nothing is extrapolated across the unsailed reach.
- **Model adapter** (`src/analysis/model.js`). A model is anything that provides `speed(twa, tws)` and `bestVMG('up'|'down', tws)`.
  - `PolarModel` wraps polar tables. It interpolates linearly in TWA and linearly between tables in TWS, clamped to the range of the tables.
  - Points may carry `foiling: true|false`. Each regime is then interpolated separately and never across the take-off discontinuity.
- **Moth VPP.** `MothModel` from `src/physics/vpp.js` (medium preset) runs in a Web Worker at the entered TWS: 14 TWAs plus `bestVMG` up and down, about 0.5–0.8 s per TWS, cached. A foiling leg is compared with the model's foiling branch only. At 11 kn the VPP finds no steady foiling equilibrium deeper than ~135°, so deeper downwind legs show no ratio rather than a meaningless one against the hull-borne speed.
- **Import** a polar table as JSON. This is how the IOM lab can plug in later:

  ```json
  {"name": "IOM lab, bulb B", "unit": "m/s", "tables": [
    {"tws": 3.6, "points": [{"twa": 40, "speed": 0.92}, {"twa": 90, "speed": 1.20}, {"twa": 150, "speed": 1.10}]}
  ]}
  ```

  A single `{tws, points}` object or an array of them also works, and `"unit": "kn"` converts both speed and TWS. `src/analysis/data/moth-polar.json` (cached Moth tables) is a valid example.

## 7. A/B testing

**Assigning legs to A or B** (*A/B test* panel). Samples before the first marker have the *Start with* configuration.

- *markers toggle A↔B*: every `event` marker flips the configuration.
- *marker 1 = A, 2 = B*: for a two-position transmitter switch.
- *alternating legs*: no markers; the legs of each type alternate A, B, A, … in time order.
- *time ranges*: a list of `m:ss-m:ss A|B`. Uncovered time is excluded.

A leg takes a configuration only when more than 90 % of its samples share it. Legs are split at markers, so this is normally 100 %.

**Pairing.** Per leg type (up with up, down with down), legs are taken in time order, and adjacent units with different configurations are paired without overlap: (1, 2), (3, 4), …
- The unit is a **single leg** when the configuration changes every leg or two (*auto* picks this when the median run of same-configuration legs is ≤ 2).
- Otherwise the unit is a **block**: a run of consecutive same-configuration legs, averaged by duration, for example one configuration per lap.
- A pair whose units are more than *Max pair gap* (900 s) apart is not formed.

Pairing adjacent units cancels slow drift in wind speed, sea state and sailor fatigue.

**Per pair**, d = (B / A − 1) × 100 % is computed for:
- mean VMG (default for up/down);
- mean SOG (always used for reaches and for the pooled all-legs line);
- SOG ÷ model speed, when a model is loaded (useful with a real anemometer, because it removes the TWS variation).

**Statistics** over the n pairs:

- mean d̄, standard deviation s, standard error s/√n;
- **95 % CI (paired t):** d̄ ± t₀.₉₇₅,ₙ₋₁ · s/√n; **p**: two-sided paired t test of d̄ = 0;
- **bootstrap CI:** percentile interval of 4000 resampled means (seeded, reproducible);
- **pairs for ±δ/2:** smallest n with t₀.₉₇₅,ₙ₋₁ · s/√n ≤ δ/2, where δ = *Effect to resolve* (default 1 %);
- **80 % power:** smallest n with (t₀.₉₇₅ + t₀.₈₀)·s/√n ≤ δ; the current power is from the shifted t approximation.

**Verdict:**
- **conclusive difference** if the CI excludes 0;
- **no meaningful difference** if the whole CI lies inside ±δ;
- otherwise **not yet conclusive**, with ~(pairs for ±δ/2 − n) more pairs needed.

An example sentence: "B is 1.5% ± 3.7% faster upwind in VMG (95% CI, 5 pairs, p = 0.33); not yet conclusive — ~136 more pairs needed for ±0.5%."

**Tack balance.** The page reports the fraction of time each configuration spent on port and warns when the two differ by more than 30 percentage points. With a fixed toggle pattern, a port/starboard asymmetry (current, a persistent shift pattern, an asymmetric rig) would otherwise appear as an A/B effect.

## 8. Running an A/B test on the water

1. **Fix everything else.** Keep the same sailor, the same rig settings (mark them), the same course and the same session. Log the wind if you can (`tws_source=anemometer`). Otherwise enter the TWS, or a TWS schedule.
2. **Alternate often.** Weather drifts over minutes, so compare configurations close in time.
   - *Switchable changes* (flap/jib settings, trim positions, anything a transmitter switch sets): change at every leg and press the marker when you change. Upwind, use an **ABBA** sequence (A B B A A B B A …). Tacks alternate S P S P along a beat, so ABBA gives each configuration equal time on port and starboard, and it cancels a linear trend. Downwind on a windward–leeward course the runs go S P | P S | …, so use ABAB there. The synthetic Moth sample does exactly this. Plain ABAB upwind would confound configuration with tack; the page's tack-balance warning catches it.
   - *Changes made ashore* (riblet film on a strut, a different IOM bulb): swap between short blocks, for example 2 laps with A, 2 laps with B, 2 laps with A, and so on. Mark each block start with the button, or type the time ranges. The page pairs the blocks.
   - A second, unchanged boat sailing alongside as a reference (two-boat testing) removes most wind noise. The page can analyse both logs, but it does not yet combine them.
3. **Leg length.** Make each leg long enough to measure after the settling time. Aim for ≥ 30 s of steady sailing after the boat is back to speed: about 45–60 s legs for a Moth, 40–60 s for an IOM. Sail at a steady target mode (fixed TWA or VMG mode) on both configurations.
4. **Markers.** Press the button right after the change, not in the middle of a leg you want to keep. Legs are split at markers, and a marker inside the settling window costs nothing.
5. **How many pairs.** The number depends on the scatter of the pair differences, which the page shows as *pair sd* after the first few pairs. The table uses the same formulas as the page:

   | pair sd | 80 % power, δ = 0.5 % | δ = 1 % | δ = 2 % | CI ± 0.25 % | ± 0.5 % | ± 1 % |
   |---|---|---|---|---|---|---|
   | 1 % | 34 | 10 | 5 | 64 | 18 | 7 |
   | 1.5 % | 73 | 20 | 7 | 141 | 38 | 12 |
   | 2 % | 128 | 34 | 10 | 249 | 64 | 18 |
   | 3 % | 285 | 73 | 20 | 556 | 141 | 38 |
   | 4 % | 505 | 128 | 34 | 986 | 249 | 64 |
   | 6 % | 1133 | 285 | 73 | 2216 | 556 | 141 |

   In the synthetic sessions (wind speed gusts of 4 % over 15 s plus 4 % over 7 min, shifts of 5°, and a sailor wandering ±2° in TWA), the pair sd is 2–3 % for upwind VMG and 1.5–3 % for the pooled speed. Resolving a 1 % effect with one boat therefore takes about 35–75 pairs: several sessions. Riblets are a sub-percent effect at boat level, so expect a null result unless the scatter is brought down: a steady breeze, long legs, a wind sensor with *speed ÷ model*, or a reference boat. Pairs from several sessions can be pooled by loading the exported legs CSVs into your own statistics. A multi-file mode is a known gap.
6. **Read the verdict honestly.** "Not yet conclusive" with a CI of ±3 % means the test cannot tell. It does not mean there is no effect. Stop when the CI half-width is below the effect you care about, and not when p first drops below 0.05. Stopping at that point overstates effects.

## 9. Exports

- **Legs CSV:** one row per leg with all the metrics of §4, configuration, model speed and ratios.
- **Summary JSON:** file metadata, wind estimate and source, the settings used, the session summary, the legs, the maneuvers (§5 fields), the A/B statistics per leg type plus pooled (mean, sd, t and bootstrap CIs, p, pairs needed, verdict) and the polar bins.

## 10. Validation on synthetic logs

`tools/synth-log.mjs` generates LOG_FORMAT v1 logs with ground truth (`*.truth.json`: mean TWD/TWS, the time and type of every tack and gybe, configuration changes, the effect).
- **Wind:** TWD with an OU shift (σ 5°, τ 4 min). TWS × (1 + gust OU (4 %, 15 s) + slow OU (4 %, 7 min)).
- **Course:** windward–leeward laps with 3-leg beats and 2-leg runs, bear-aways and round-ups. The sailor holds a target TWA on a 5-s-lagged wind with an OU steering wander.
- **Speed:** a first-order approach to the polar speed at the true TWA and TWS, with coasting deceleration in the no-go zones.
  - Moth: the foiling branch of the cached MothModel polar (`src/analysis/data/moth-polar.json`). 30 % of tacks and 15 % of gybes fail, dropping the boat to displacement speed with a re-launch after 2–5 s.
  - IOM: a parametric displacement polar (~0.9–1.5 m/s) with a TODO hook for the IOM lab's polar.
- **Sensors:**
  - GNSS at 5 Hz: correlated position error (1.2 m, 60 s) plus 0.25 m white noise, Doppler noise 0.05 m/s per axis, a no-fix start and two outages.
  - IMU: noise and gyro bias; accelerometer with the physical sign (ay ≈ −g·sin roll).
  - Heading: leeway plus a magnetic error up to ~5°.
  - Servo pulses: ±2 µs noise and a receiver dropout.
  - A/B markers: B multiplies the target speed by 1.01.
  - Files end with the `#` trailer the firmware writes.

Results (in `tests/analysis.test.mjs`, plus a 40-seed sweep run during development):

- **Maneuver recall:** Moth 390/392 tacks and gybes found within ±5 s (2 false positives), IOM 372/372 (0 false positives), over 40 × 15-min sessions each. The bundled samples are 10/10 (Moth) and 9/9 (IOM).
- **TWD auto-estimate:** mean absolute error 0.45°, max 1.75° over the same 80 sessions. The samples are 0.4° (Moth) and 0.4° (IOM).
- **A/B:** the 95 % CI contains the true +1 % in 39/40 (Moth, pooled speed), 35/40 (Moth, upwind VMG with 3–5 pairs), 37/40 (IOM pooled) and 38/40 (IOM upwind) sessions.
  - Running the same 90-min session (45 pairs) with and without the treatment moves both the pooled-speed estimate and the upwind-VMG estimate by 0.99 %, so the analysis is unbiased. The test accepts 1 ± 0.3 %.
  - Moth sample: upwind B +1.5 % ± 3.7 % (5 pairs), pooled +1.3 % ± 4.1 % (8 pairs), not conclusive, as expected from 15 minutes.
- **Speed:** a 1-h, 50-Hz log (180 000 rows, 25 MB) parses in ~0.15–0.25 s, and the whole analysis runs in ~1 s.

## 11. Limitations

- **Current is ignored.** TWA is computed from the course over ground, and VMG from SOG. In a tidal stream, compare configurations only within the same stream, or the difference will include the tide. The page has no current estimate.
- **Wind inferred from the track.** Without a wind sensor, the estimate assumes equal TWA on both tacks. A boat that points differently on port and starboard biases TWD by half the difference. VMG comparisons are then only as good as the shift tracking; for single-leg pairs use *speed* when shifts are large.
- **The polar is not normalised for TWS** unless the log has a wind column. A slow-looking leg may just be a lull.
- **Maneuver windows are fixed.** Very slow IOM tacks (> 10 s) or maneuvers closer than ~30 s apart are flagged "overlaps" and contaminate each other.
- **Heel sign:** + to leeward. Moths sail heeled to windward, so their heel is negative. Heel magnitude is used for the upwind/downwind vote; the heel sign is never inferred from accelerations.
- **The Moth VPP is steady-state only.** Measured/model ratios above 100 % on deep downwind angles, or no ratio at all, reflect the VPP's foiling range (§6), not necessarily the boat.
- **Single-log A/B only.** There is no pooling across files and no two-boat comparison yet. A/B statistics assume independent pairs; strongly autocorrelated wind over adjacent pairs makes the CI somewhat optimistic (upwind coverage was 35/40 with 3–5 pairs).
- **GPX / plain CSV** have no IMU or servo data, so the heel, rudder and sheet charts stay empty, and the TWD vote relies on speed alone.

## 12. Suggested additions to LOG_FORMAT

These are optional keys; v1 readers ignore unknown keys:
- `marker_mode=toggle|value`, so the page can pick the A/B assignment automatically;
- `config_a=…`, `config_b=…`, free-text labels for the two configurations;
- `gnss_dyn_model=` (for example `sea`), because the Doppler noise depends on it;
- `tws_height_m=`, the anemometer height, for normalising to 10 m.
