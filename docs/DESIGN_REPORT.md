# Moth Foil Design Report: light, medium and strong wind

*Chief-engineer summary of the Moth Foil Lab studies (v2). Source data: `docs/results/opt-*.json`
and `sensitivity-*.json`. Reproduce with `node tools/optimise.mjs <band> 40 12 11`,
`node tools/sensitivity.mjs <design>` and `node tools/report-tables.mjs`.*

## 1. Headline recommendations (v2: with the seaway / lull criterion)

v2 adds a flight test at a fixed lull / tack-exit speed (11 kn, 0.3 m head sea) to the objective, plus the generalised planform geometry. Under v1 (steady VPP only), the medium and strong optima shrank to ~630 cm², smaller than current production foils. The seaway criterion moves them to production-like sizes. The v1 results are kept in `docs/results/v1/`.

1. **A two-foil quiver, now at realistic sizes.**
   - **Foil A (light–medium, ≤ ~11 kn):** 958 cm², span 1.19 m, AR 14.7, foiling from 7.0 kn TWS.
   - **Foil B (medium–strong, ≥ ~11 kn):** 730 cm², span 0.95 m, AR 12.2, 41% flap.
   - Cross-evaluation: Foil A is marginally the best medium-wind foil (0.936 vs 0.931). Foil B is clearly the best strong-wind foil (1.051 vs 1.023 for the strong-band optimum, 669 cm²). A third, smaller foil earns nothing in the model.
2. **Light air is a take-off-threshold problem.** Span and root chord on Foil A are worth ±1.5 kn of mean VMG in 7 kn: the band flips between foiling and hull-borne. Nothing else matters as much.
3. **Above 11 kn, size is set by lulls and manoeuvres, not straight-line drag.** Smaller is faster in steady flight: each −4.4 mm of root chord gains ~0.1 kn. But with a minimum flying speed near 11 kn the boat touches down in chop and fails the seaway test. The optimiser buys low-speed lift with big flaps (41–44% chord, +14–15° stops) and keeps area around 670–730 cm².
4. **Top speed is limited by shedding lift.** On the light foil, camber (−0.62 kn), incidence (−0.54 kn) and the flap-up stop (−0.32 kn per step) set strong-wind VMG. Every foil must be able to shed lift, with ≥ −6° flap-up.
5. **Elevator:** S_r/S_m 0.37–0.51, span 0.55–0.58 m, 69–82 mm root chord, gull tips.
6. **Struts** stay stiffness-limited (≤ 100 mm deflection needs ≳ 10.5% t/c at 105–118 mm chord). Rudder struts shrink to ~75 mm.
7. **Wand gearing** peaks in damping around 0.4–0.6 flap° per wand°.
8. **Nature-inspired shapes** (full study in [`SHAPE_STUDY.md`](SHAPE_STUDY.md)):
   - **Shark-skin riblets are the only consistent winner:** +1–2% VMG in every band.
   - Winglets (up or down), gull wings and raked tips tie within optimiser noise.
   - Tubercles, raptor feather tips, tuna/dolphin crescents, manta and forward sweep lose.
   - Given every feature at once, the optimiser keeps only riblets.

## 2. How the numbers were produced

| Layer | Model |
|---|---|
| Lifting surfaces | One vortex lattice holds the main foil, elevator and both struts: 42–52 horseshoes, Weissinger ¼–¾ chord. The free surface is modelled with a φ = 0 mirror image, and heel and ride height set the geometry, so tips can breach. |
| Sections | Semi-empirical families (NACA 4-digit, 63-, 66-series, Eppler). Mixed laminar/turbulent friction uses a transition point, and the form factor is Hoerner's. The laminar bucket follows camber plus flap. The flap uses τ(E)·η_f, calibrated to the measured 2.2° flap ≈ 1° AoA. The model also includes flap-gap drag, stall and the −Cp_min bucket. |
| Appendage drag | Strut spray 0.30·q·t² (measured on Moths), Hoerner T-junction and foil wave drag (2-D vortex below a free surface). |
| Aero | North Sails FLOW Moth polar with a depower curve, CE shift and windage CdA 0.48 m². |
| VPP | 6-DOF trim: flap↔weight, leeway↔side force, elevator rake + sailor fore/aft↔pitch, hiking/depower↔roll, drive = drag. Best VMG over TWA per band. The heel per band comes from the research. |
| Take-off | Minimum flying speed (flap max, bow-up 3°). The hull-borne hump uses the Beaver & Zseleczky tow-tank fit with foil unloading, times 1.15 for pumping. A band below the take-off threshold is scored hull-borne. |
| Constraints | Seaway test at 11 kn in a 0.3 m head sea (stall, hull touch-down, breach, ride error). Cavitation margin at V_max; divergence ≥ 1.3 V_max; tip deflection ≤ 4.5% b/2 at 2 g; strut ≤ 100 mm at 441 N. Also tip Re ≥ 1.5e5 (main) and 1.2e5 (elevator) at take-off, S_r/S_m ≥ 0.35, tip clearance, strut ventilation, damping ζ ≥ 0.15, and foiling manoeuvres. |
| Optimiser | sep-CMA-ES, 22 variables, λ = 12, 40 generations (481 full VPP evaluations per study, ~90 s on 4 cores). |

Validation against published data is in the README table. Examples: the 2009 tow-tank T-foil drag breakdown, take-off at 7.5–9.3 kn, and the medium foil at 14.4 / 19.9 kn in 11 kn TWS against the published 14–18 / 19–25 kn.

## 3. Research baselines vs optimised designs (v2)

ᴴ = hull-borne (cannot take off in that band). "Foiling tacks" means the turn speed (0.6 × upwind speed) stays above the minimum flying speed. The target-band score includes the seaway penalty.

| | Light (baseline) | ★ Light (opt) | Medium (baseline) | ★ Medium (opt) | Strong (baseline) | ★ Strong (opt) |
|---|---|---|---|---|---|---|
| Main span (mm) | 1100 | 1188 | 1000 | 945 | 880 | 818 |
| Main area (cm²) | 965 | 958 | 803 | 730 | 654 | 669 |
| Main AR | 12.5 | 14.7 | 12.5 | 12.2 | 11.8 | 10.0 |
| Root / tip chord (mm) | 115 / 39 | 109 / 40 | 105 / 36 | 101 / 38 | 97 / 33 | 111 / 37 |
| ¼-chord sweep / twist (°) | 3.0 / -1.5 | 9.0 / -1.1 | 5.0 / -1.0 | 3.4 / 0.2 | 8.0 / -1.5 | 1.4 / 0.1 |
| Tip dihedral (°) | -3.0 | -6.7 | -3.0 | -4.8 | -2.0 | -4.0 |
| t/c root → tip (%) | 12.0 → 10.0 | 12.3 → 10.2 | 11.0 → 9.0 | 10.9 → 10.0 | 10.0 → 8.5 | 9.5 → 8.7 |
| Design c_l | 0.55 | 0.45 | 0.35 | 0.37 | 0.20 | 0.34 |
| Flap chord / span (%) | 35 / 90 | 35 / 62 | 32 / 90 | 41 / 95 | 28 / 85 | 44 / 96 |
| Flap stops (°) | -6.0 / +12.0 | -6.9 / +10.2 | -7.0 / +10.0 | -6.4 / +14.7 | -9.0 / +7.0 | -6.9 / +14.9 |
| Main incidence (°) | 2.5 | 1.0 | 1.5 | 0.9 | 0.5 | 1.9 |
| Elevator span (mm) / area (cm²) | 780 / 421 | 552 / 356 | 700 / 352 | 580 / 347 | 630 / 294 | 565 / 341 |
| S_elev / S_main | 0.44 | 0.37 | 0.44 | 0.48 | 0.45 | 0.51 |
| Main strut chord (mm) / t/c (%) | 110 / 12.5 | 103 / 12.6 | 105 / 12.0 | 118 / 11.2 | 100 / 12.0 | 118 / 10.6 |
| Rudder strut chord (mm) | 100 | 75 | 95 | 77 | 92 | 75 |
| **Take-off boat speed (kn)** | 7.5 | 8.6 | 9.3 | 9.2 | 12.9 | 9.5 |
| **Min. flying speed (kn)** | 7.6 | 8.7 | 9.4 | 9.3 | 13.0 | 9.6 |
| **Foils from TWS (kn)** | 6.9 | 7.0 | 7.6 | 7.7 | 8.8 | 8.1 |
| light VMG up / down (kn) | 6.2 / 5.2 | 6.6 / 6.6 | 3.4ᴴ / 3.2ᴴ | 3.4ᴴ / 3.2ᴴ | 3.5ᴴ / 3.2ᴴ | 3.4ᴴ / 3.2ᴴ |
| light boat speed up / down (kn) | 11.7 / 12.5 | 12.2 / 14.0 | 4.6 / 3.3 | 4.6 / 3.3 | 4.6 / 3.3 | 4.5 / 3.3 |
| light foiling tacks | ✗ | ✗ | – | – | – | – |
| medium VMG up / down (kn) | 9.3 / 10.6 | 9.7 / 13.1 | 9.8 / 14.1 | 9.9 / 14.7 | 8.2 / 15.2 | 9.8 / 14.9 |
| medium boat speed up / down (kn) | 13.6 / 14.6 | 14.0 / 19.2 | 14.5 / 19.9 | 15.1 / 20.2 | 18.8 / 20.7 | 15.1 / 20.4 |
| medium foiling tacks | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| strong VMG up / down (kn) | 10.4 / 13.1 | 11.1 / 16.5 | 11.4 / 21.2 | 12.5 / 21.8 | 10.8 / 22.7 | 11.5 / 22.2 |
| strong boat speed up / down (kn) | 13.4 / 14.8 | 16.1 / 19.7 | 20.6 / 26.0 | 19.8 / 26.6 | 20.1 / 27.2 | 17.2 / 26.9 |
| strong foiling tacks | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| V_max (kn) | 14.8 | 19.7 | 26.0 | 26.6 | 27.2 | 26.9 |
| Cavitation margin at V_max | 2.26 | 0.81 | 0.23 | 0.01 | 0.35 | 0.18 |
| Divergence speed (kn) | 48 | 47 | 44 | 44 | 43 | 42 |
| Tip deflection 2 g (% b/2) | 2.8 | 4.4 | 4.4 | 4.5 | 6.1 | 3.8 |
| Strut deflection (mm) | 72 | 92 | 102 | 80 | 120 | 92 |
| Heave/pitch damping ζ | 0.36 | 0.31 | 0.36 | 0.37 | 0.08 | 0.35 |
| Target-band score | 0.666 | 0.907 | 0.813 | 0.931 | 0.715 | 1.023 |

Notes:
- The **strong-band optimum (669 cm²)** has the best tack margin but gives up upwind VMG. Foil B (the medium optimum) beats it on the strong target (1.051 vs 1.023). Choose the strong foil only if waves and gusts are expected to be more severe than the 0.3 m seaway test.
- The light baseline foils in 7 kn but is overpowered in breeze: V_max is 14.8 kn, limited by the flap-up stop. The light optimum lowers camber and incidence and reaches 19.7 kn.
- With riblets (the "🧬 chimera" presets in the app), scores rise by +0.022 / +0.009 / +0.012.

## 4. Design decisions, quantified

*The tables below were computed on the v1 optima (`docs/results/v1/sensitivity-*.json`). The v2 sensitivities (`docs/results/sensitivity-opt-*.json`) keep the same ranking: root chord and span first, then elevator size, strut thickness, camber and incidence. The one new effect is that the light foil's strong-wind VMG is now visibly camber/incidence-limited (−0.62 / −0.54 kn per step).*

Central-difference sensitivities (±8% of each variable's range) of mean VMG = ½(up + down VMG). Full tables are in `docs/results/sensitivity-*.json`.

### 4.1 Main foil (horizontal)

| Decision | Light (7 kn) | Medium (11 kn) | Strong (18 kn) | Verdict |
|---|---|---|---|---|
| **Area (root chord)** | Decides foiling or not (cliff ±1.6 kn) | −0.10 kn per +4.4 mm chord | −0.09 to −0.16 kn per +4.4 mm | Big for light air; as small as manoeuvres allow above 8 kn |
| **Span / AR** | +1.6 kn cliff (lower take-off speed) | −0.03 to −0.06 kn per +32 mm (wetted area, tip clearance) | −0.06 to −0.13 kn | Max span (1.2 m) for light air; ~0.82–0.86 m for medium and strong |
| **Planform (ellipticity, taper)** | Cliff through take-off speed | −0.01 to −0.02 | −0.01 to −0.02 | Second-order once AR is set; 0.55–0.9 ellipticity, taper 0.36–0.43 |
| **Sweep** | – | ~0 | ~0 | Free for weed shedding / bend-twist (3–8°) |
| **Twist** | – | ~0 | −0.03 | Keep near 0 to −1°. The model's optimum sits at 0 to −1°, not the −1.5 to −2° of older foils |
| **Tip anhedral** | – | ~0 | ~0 | Set by tip clearance at 17–20° windward heel. Optimiser chose −5 to −7° outboard of 80% span |
| **Thickness** | Root 13% for stiffness at 1.2 m span | −0.02 per +0.5% root | −0.02 to −0.03 | Set by structure: 10–11% root at 0.82–0.86 m span, 13% at 1.2 m |
| **Camber (c_li)** | 0.37 | ~0 at optimum; baseline shows −0.02 | **−0.28 to −1.0 kn** per +0.044 | Low camber (0.3–0.37) for anything that must go fast |
| **Incidence** | 1.3° | ~0 | **−0.23 to −1.0 kn** per +0.36° | 0.4–1.3°. Too much incidence exhausts the flap-up stop |
| **Flap chord** | 31% | Optimiser drives it to 43–44% | Optimiser drives it to 43% | A big flap buys minimum flying speed (manoeuvres) without area |
| **Flap-up stop** | −6° | ~0 at optimum | **−0.9 kn** per +0.64° on the baseline | Must allow ≥ −6° on medium and strong foils |
| **Flap-down stop** | +10° | – | – | +10 to +13° for take-off and lulls |

### 4.2 Elevator (horizontal)

| Decision | Finding |
|---|---|
| Area | −0.04 kn per +3.2 mm chord in medium and strong. It is held up by the S_r/S_m ≥ 0.35 pitch-authority constraint and the tip-Re constraint. Optimum 290–354 cm². |
| Span | −0.03 to −0.04 kn per +24 mm. The optimiser shortens it to ~555–570 mm (tip clearance at heel, wetted area); production rudders use 630–780 mm with gull tips. |
| Incidence / camber | Near zero effect: the sailor fore/aft and the rake trim absorb it. Choose incidence so the rake runs mid-range (0 to +2°). |
| Downwash | The model's dε/dα at the elevator is ≈ 0.28, matching the ≈ 0.3 estimate in the research. The elevator rides 0.1 m above the main foil. |

### 4.3 Struts (vertical)

| Decision | Finding |
|---|---|
| Main strut chord | −0.02 to −0.04 kn per +4 mm in medium and strong. In light air a longer chord adds take-off drag (part of the cliff). The optimiser keeps 101–119 mm because a longer chord is the cheapest route to stiffness. |
| Main strut t/c | −0.04 kn per +0.5%, but t/c < ~10.5% violates the 100 mm stiffness limit. Use UHM or steel lower sections to go thinner. |
| Rudder strut | Always shrinks to 75–80 mm: it carries little side force. |
| Spray | 0.30·q·t² per strut: about 2 N for both struts at 14 kn and 7–8 N at 25 kn. Small against profile drag (42–52 N at 14 kn). Fences and rails matter for ventilation more than for drag. |
| Ventilation | The strut ventilation index (near-surface incidence ÷ 10°) peaks at 0.11–0.17 for the light and strong optima and 0.76 for the medium optimum. The medium one is the closest to the limit because its short strut immersion puts the side force near the surface. Leeway stays 1.6–2.3° because windward heel tilts the main-foil lift into side force. |

### 4.4 Control system

- **Wand gearing:** use 0.3–0.6 (flap° per wand°) with a 1.3 m wand. Damping peaks around 0.5 and the boat porpoises above ~2–3 (flight-sim tab, "gearing sweep").
- **Ride height:** foil depth 0.30 m in medium air keeps the leeward tip ≥ 0.05 m + ½ c_tip deep at 17° heel. Flying higher cuts strut drag and adds righting arm, but the image method shows lift loss and induced-drag growth below h/c ≈ 3.

## 5. What the model does not capture (and which way it biases)

- **Unsteady loads:** v2 includes a heave/pitch seaway test (0.3 m head sea at 11 kn), but only one sea state, a constant boat speed and no roll or yaw dynamics. The manoeuvre criterion (0.6 × upwind speed) is an estimate. Sailor skill (pumping, heel control) is not modelled.
- **Tip-vortex cavitation and hinge-gap cavitation** are not modelled. The low tip twist chosen by the optimiser would need checking with a panel method or CFD.
- **Section polars are semi-empirical.** Laminar extent in real sea water (Ncrit ≈ 4) is uncertain. The surface-finish factor is exposed in the app.
- **LBM section CFD** runs at lattice Re ~10³–10⁴. Use it for flow topology (flap separation, wake), not for absolute Cd.
- **Strut stiffness limit (100 mm at 441 N) and E = 200 GPa are estimates.** They set how thin the struts can be.
