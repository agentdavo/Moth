# Moth Foil Design Report: light, medium and strong wind

*Chief-engineer summary of the Moth Foil Lab studies. Source data: `docs/results/opt-*.json`
and `sensitivity-*.json`. Reproduce with `node tools/optimise.mjs <band> 40 12 11`,
`node tools/sensitivity.mjs <design>` and `node tools/report-tables.mjs`.*

## 1. Headline recommendations

1. **Run a two-foil quiver, not three.** The medium and strong optima converge to almost the same main foil: about 630 cm², 820–860 mm span, AR 11–12, with a big flap. The foil that must be different is the **light-air** foil. Its job is to get foiling at 7 kn of true wind: about 945 cm², span as large as the rules and structure allow (~1.2 m, AR 15), and a take-off speed below 9 kn.
2. **Light air is a threshold problem, not a drag problem.** At 7 kn TWS the light optimum sits exactly on the take-off cliff. Any change that raises take-off speed flips the band from foiling to hull-borne and costs **±1.6 kn of mean VMG**. Examples: +4 mm of strut chord, −32 mm of span, less planform fill. Nothing else in the design space matters as much in any band.
3. **In medium and strong air, area and span are traded against the ability to foil through manoeuvres.** Smaller is faster in a straight line: every −4.4 mm of root chord is worth about +0.1 kn VMG. The limit is the **minimum flying speed**, which must stay below the ~60% of upwind speed a boat keeps through a tack or gybe. The optimiser therefore buys low-speed lift with a **43–44% chord flap**, not with area.
4. **Top speed is limited by shedding lift, not by drag.** On the baseline medium foil, the strong-wind downwind VMG is set by the **flap-up stop, camber and incidence** (−0.9 to −1.0 kn per step). The foil runs out of negative flap before it runs out of drive. Optimised foils have lower camber and incidence than the research baselines, and the flap-up stop has to be designed as carefully as the flap-down stop.
5. **Elevators want S_r/S_m ≈ 0.37–0.48, span ~0.55–0.57 m and 70–82 mm root chord.** The model prefers lower aspect ratio than current production rudders (AR ~9 vs 14–16). The reasons are tip clearance at windward heel with the elevator 0.1 m above the main foil, and tip Reynolds number at take-off. The elevator's induced drag is negligible because it carries only ~3% of the weight. **Gull/anhedral tips** (−12…−16° outboard) keep the tips immersed.
6. **Struts are stiffness-limited.** At 10.5–12% t/c and 100–120 mm chord, a carbon strut deflects 85–100 mm under the 441 N design side load. Thinner struts save ~0.04 kn per step but fail the stiffness limit, so steel or UHM lower sections are the enabling technology. The rudder strut can drop to 75–80 mm chord.
7. **Wand gearing has a damping optimum.** Heave/pitch damping peaks at ζ ≈ 0.5 around 0.4–0.6 flap-degrees per wand-degree (1.3 m wand, medium foil at 7.5 m/s). It collapses toward porpoising (ζ < 0.1) above ~3. The strong-wind research baseline (small foil, +7° flap stop) has only ζ = 0.07. The optimised strong foil restores ζ = 0.33.

## 2. How the numbers were produced

| Layer | Model |
|---|---|
| Lifting surfaces | One vortex lattice holds the main foil, elevator and both struts: 42–52 horseshoes, Weissinger ¼–¾ chord. The free surface is modelled with a φ = 0 mirror image, and heel and ride height set the geometry, so tips can breach. |
| Sections | Semi-empirical families (NACA 4-digit, 63-, 66-series, Eppler). Mixed laminar/turbulent friction uses a transition point, and the form factor is Hoerner's. The laminar bucket follows camber plus flap. The flap uses τ(E)·η_f, calibrated to the measured 2.2° flap ≈ 1° AoA. The model also includes flap-gap drag, stall and the −Cp_min bucket. |
| Appendage drag | Strut spray 0.30·q·t² (measured on Moths), Hoerner T-junction and foil wave drag (2-D vortex below a free surface). |
| Aero | North Sails FLOW Moth polar with a depower curve, CE shift and windage CdA 0.48 m². |
| VPP | 6-DOF trim: flap↔weight, leeway↔side force, elevator rake + sailor fore/aft↔pitch, hiking/depower↔roll, drive = drag. Best VMG over TWA per band. The heel per band comes from the research. |
| Take-off | Minimum flying speed (flap max, bow-up 3°). The hull-borne hump uses the Beaver & Zseleczky tow-tank fit with foil unloading, times 1.15 for pumping. A band below the take-off threshold is scored hull-borne. |
| Constraints | Cavitation margin at V_max; divergence ≥ 1.3 V_max; tip deflection ≤ 4.5% b/2 at 2 g; strut ≤ 100 mm at 441 N. Also tip Re ≥ 1.5e5 (main) and 1.2e5 (elevator) at take-off, S_r/S_m ≥ 0.35, tip clearance, strut ventilation, damping ζ ≥ 0.15, and foiling manoeuvres. |
| Optimiser | sep-CMA-ES, 22 variables, λ = 12, 40 generations (481 full VPP evaluations per study, ~90 s on 4 cores). |

Validation against published data is in the README table. Examples: the 2009 tow-tank T-foil drag breakdown, take-off at 7.5–9.3 kn, and the medium foil at 14.4 / 19.9 kn in 11 kn TWS against the published 14–18 / 19–25 kn.

## 3. Research baselines vs optimised designs

ᴴ = hull-borne (cannot take off in that band). "Foiling tacks" means the turn speed (0.6 × upwind speed) stays above the minimum flying speed.

| | Light (baseline) | ★ Light (opt) | Medium (baseline) | ★ Medium (opt) | Strong (baseline) | ★ Strong (opt) |
|---|---|---|---|---|---|---|
| Main span (mm) | 1100 | 1196 | 1000 | 861 | 880 | 822 |
| Main area (cm²) | 965 | 945 | 803 | 635 | 654 | 627 |
| Main AR | 12.5 | 15.1 | 12.5 | 11.7 | 11.8 | 10.8 |
| Root / tip chord (mm) | 115 / 39 | 105 / 40 | 105 / 36 | 99 / 34 | 97 / 33 | 100 / 34 |
| ¼-chord sweep / twist (°) | 3.0 / -1.5 | 7.8 / -1.0 | 5.0 / -1.0 | 3.0 / -0.0 | 8.0 / -1.5 | 4.7 / -0.2 |
| Tip dihedral (°) | -3.0 | -6.7 | -3.0 | -5.4 | -2.0 | -6.6 |
| t/c root → tip (%) | 12.0 → 10.0 | 13.3 → 10.1 | 11.0 → 9.0 | 11.1 → 9.6 | 10.0 → 8.5 | 10.4 → 10.1 |
| Design c_l | 0.55 | 0.37 | 0.35 | 0.36 | 0.20 | 0.31 |
| Flap chord / span (%) | 35 / 90 | 31 / 63 | 32 / 90 | 44 / 76 | 28 / 85 | 43 / 88 |
| Flap stops (°) | -6.0 / +12.0 | -6.2 / +9.9 | -7.0 / +10.0 | -4.3 / +10.7 | -9.0 / +7.0 | -6.9 / +12.9 |
| Main incidence (°) | 2.5 | 1.3 | 1.5 | 0.4 | 0.5 | 1.2 |
| Elevator span (mm) / area (cm²) | 780 / 417 | 567 / 354 | 700 / 347 | 553 / 293 | 630 / 289 | 555 / 298 |
| S_elev / S_main | 0.43 | 0.37 | 0.43 | 0.46 | 0.44 | 0.48 |
| Main strut chord (mm) / t/c (%) | 110 / 12.5 | 101 / 12.8 | 105 / 12.0 | 115 / 11.2 | 100 / 12.0 | 119 / 10.7 |
| Rudder strut chord (mm) | 100 | 76 | 95 | 75 | 92 | 80 |
| **Take-off boat speed (kn)** | 7.5 | 8.9 | 9.3 | 10.6 | 12.9 | 10.4 |
| **Min. flying speed (kn)** | 7.6 | 9.0 | 9.4 | 10.7 | 13.0 | 10.5 |
| **Foils from TWS (kn)** | 7.1 | 7.0 | 7.6 | 7.8 | 8.8 | 8.0 |
| light VMG up / down (kn) | 3.4ᴴ / 3.2ᴴ | **6.6 / 6.5** | 3.4ᴴ / 3.2ᴴ | 3.5ᴴ / 3.3ᴴ | 3.5ᴴ / 3.3ᴴ | 3.4ᴴ / 3.2ᴴ |
| light boat speed up / down (kn) | 4.6 / 3.2 | 12.2 / 13.9 | 4.7 / 3.3 | 4.6 / 3.3 | 4.6 / 3.3 | 4.6 / 3.3 |
| medium VMG up / down (kn) | 9.3 / 9.8 | 9.7 / 13.2 | 9.8 / 14.1 | **10.0 / 15.5** | 8.2 / 15.1 | 9.9 / 15.2 |
| medium boat speed up / down (kn) | 13.5 / 14.5 | 14.2 / 19.2 | 14.4 / 19.9 | 15.4 / 20.8 | 18.8 / 20.6 | 15.2 / 20.8 |
| medium foiling tacks | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| strong VMG up / down (kn) | 10.3 / 13.1 | 11.1 / 16.6 | 11.4 / 21.2 | **12.9 / 22.8** | 10.8 / 22.7 | 11.6 / 22.6 |
| strong boat speed up / down (kn) | 13.3 / 14.8 | 16.1 / 19.8 | 20.6 / 25.9 | 19.3 / 27.2 | 20.1 / 27.2 | 17.4 / 27.2 |
| strong foiling tacks | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| V_max (kn) | 14.8 | 19.8 | 25.9 | 27.2 | 27.2 | 27.2 |
| Cavitation margin at V_max | 2.27 | 1.03 | 0.23 | 0.14 | 0.36 | 0.32 |
| Divergence speed (kn) | 48 | 48 | 44 | 46 | 43 | 51 |
| Tip deflection 2 g (% b/2) | 2.8 | 4.1 | 4.4 | 4.2 | 6.1 | 3.8 |
| Strut deflection (mm) | 72 | 97 | 102 | 89 | 120 | 84 |
| Heave/pitch damping ζ | 0.35 | 0.30 | 0.35 | 0.34 | 0.07 | 0.33 |

Notes:
- The **optimised medium foil is the best strong-wind foil as well**: 12.9 / 22.8 kn VMG against 11.6 / 22.6 for the optimised strong foil. It carries a 44% flap and a +10.7° stop, so it keeps foiling through lulls. It gives up the light band, which it could not reach anyway (7.8 kn threshold).
- The **optimised strong foil** trades ~1 kn of upwind VMG for a stiffer, better-damped foil. It has the highest divergence margin (51 kn) and ζ 0.33 against 0.07 for the baseline. Choose it for waves and gusts, which the steady VPP rewards less than a sailor does.
- The light baseline is overpowered in breeze: its V_max is 14.8 kn, limited by the flap-up stop. The light optimum fixes that with less camber (c_l 0.37 vs 0.55) and incidence (1.3° vs 2.5°). It now reaches 19.8 kn and still takes off in 7 kn.

## 4. Design decisions, quantified

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

- **Unsteady wave loads, gust response and sailor skill:** these favour bigger area and elevators than the steady optimum. The manoeuvre criterion (0.6 × upwind speed) is an estimate; raise it to push toward bigger medium foils.
- **Tip-vortex cavitation and hinge-gap cavitation** are not modelled. The low tip twist chosen by the optimiser would need checking with a panel method or CFD.
- **Section polars are semi-empirical.** Laminar extent in real sea water (Ncrit ≈ 4) is uncertain. The surface-finish factor is exposed in the app.
- **LBM section CFD** runs at lattice Re ~10³–10⁴. Use it for flow topology (flap separation, wake), not for absolute Cd.
- **Strut stiffness limit (100 mm at 441 N) and E = 200 GPa are estimates.** They set how thin the struts can be.
