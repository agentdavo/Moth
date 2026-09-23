# Nature-inspired horizontal foil shapes: tournament results

*Can shapes found in nature beat an optimised conventional Moth main foil?* Twelve planform families, most borrowed from animals, were built into the vortex-lattice / VPP / flight-dynamics model. Each was re-optimised for every wind band and compared against a baseline that got **the same optimiser budget and sizing freedom**. The evidence behind every model multiplier is in [`research/BIOINSPIRED_FOILS.md`](research/BIOINSPIRED_FOILS.md).

Reproduce:
- `node tools/shape-tournament.mjs 14 10` for the families
- `node tools/optimise.mjs <band> 50 12 13 chimera` for free combinations
- `node tools/shape-report.mjs` for the table

In the app, open the **Shape lab** tab. Pick a family from the library and use the L/M/S buttons to load each tournament optimum. Plan and front views are drawn from the exact solver geometry.

## 1. How each shape is represented

The foil is no longer a flat spanwise line. Each half-wing is a set of **3-D spanwise paths** (main span, winglet, individual feathers). Each path carries chord, thickness, twist and local sweep. The same paths feed the vortex lattice (with free-surface images and heel), the strip-theory drag, the structural checks and the 3-D loft.

| Family | Geometry | Extra physics (calibrated in the research doc) |
|---|---|---|
| Tuna / swordfish lunate | Near-elliptic chord, pointed tips, quadratic aft rake (crescent) | Section c_lmax × cos Λ on swept strips; bend–twist gust alleviation from tip rake; divergence gain |
| Raked tips (swift) | Rake only on the outer ~25% | Same as tuna |
| Albatross | +18% span at constant area | Tip Re and stiffness limits bite |
| Seagull wing | Inner dihedral, outer anhedral (two-segment) | Tip depth at heel; image-method lift loss |
| Humpback tubercles | Sinusoidal LE (A/c, λ/c), rendered as real bumps | Johari 2007 fits at Re 1.8e5, fading to ×0.3 at 1e6: slope ×(1−A), c_lmax ×(1−2.4…3A), ΔC_d0 = 0.0025·√(1.8e5/Re), trough suction ×(1+2.5A), post-stall **plateau** (0.72–0.83 c_lmax) in the flight simulator |
| Raptor slotted tips | Outer span split into N feathers fanned in dihedral and plan | Non-planar wake from the lattice itself; +0.001 slot drag; feathers carry no flap |
| Winglet up / down | Tip device ±20…90° cant with a blend arc | Non-planar lattice; +0.0006 junction drag; tip clearance at heel |
| Dolphin fluke | Swept (22°) crescent, taper 0.3 | Same as tuna |
| Manta ray | Low AR (−12% span at constant area), sweep 28° | — |
| Shark-skin riblets | Riblet film spacing s (µm) | Turbulent Cf × f(s⁺) (Bechert 1997 blade curve × 0.83 for trapezoid films) on the turbulent part only |
| Forward sweep (dragonfly) | Sweep −8° | Bend–twist *wash-in*: lift slope rises under load |

Two robustness checks were added to the objective so that the claimed benefits of stall softening and gust alleviation are tested:
- **Seaway flight test:** heave/pitch simulation at 11 kn (lull / tack exit) in a 0.3 m head sea, with main-foil stall saturation. It penalises time stalled, time with the hull touching, time with the foil breached, and ride error.
- **Bend–twist coupling** of swept tips in the flight dynamics.

## 2. Tournament protocol

- Each family starts from the optimised foil of the target band and applies its shape.
- CMA-ES then optimises the family's own variables plus six sizing variables (span, root chord, incidence, flap chord, root t/c, flap-down stop): 14 generations × λ = 10, about 141 full VPP evaluations per family per band.
- The **baseline gets exactly the same budget and sizing variables**.
- Score = weighted mean of band VMG normalised to fleet VMGs, minus the constraint penalties (1.0 ≈ fleet speed).
- **Noise floor:** two seeds of the baseline differ by ±0.0025. Treat |Δ| < ~0.004 as a tie.

## 3. Results

| Family | Nature | Δ light (7 kn) | Δ medium (11 kn) | Δ strong (18 kn) | Verdict |
|---|---|---|---|---|---|
| **Shark-skin riblets** | Shark dermal denticles | **+0.019** | **+0.011** | **+0.019** | **Adopt.** The only consistent gain: ~1–2% VMG in every band |
| Winglet up (anti-vent tip) | Bird alula / engineered | +0.001 | −0.001 | +0.000 | Neutral (within noise) |
| Winglet down | Australia II keel | −0.000 | −0.001 | −0.003 | Neutral |
| Seagull wing | Gull shoulder/elbow | −0.004 | −0.002 | −0.001 | Neutral / slightly worse |
| Raked tips (swift) | Swift, raked airliner tip | −0.007 | +0.000 | −0.001 | Neutral in medium/strong air, slightly worse in light air |
| Albatross (very high AR) | Wandering albatross | −0.007 | −0.017 | −0.004 | Worse: stiffness and tip-Re limits bind first |
| Forward-swept | Dragonfly hind wing | −0.022 | −0.006 | −0.003 | Worse: wash-in raises the gust response |
| Dolphin fluke | Cetacean fluke | −0.030 | −0.018 | −0.011 | Worse |
| Tuna lunate | Thunniform caudal fin | −0.085 | −0.013 | −0.008 | Worse: pointed tips fall below tip-Re limits |
| Raptor slotted tips | Harris hawk primaries | −0.047 | −0.040 | −0.030 | Worse |
| Humpback tubercles | Humpback flipper | −0.067 | −0.029 | −0.022 | Worse at Moth Re |
| Manta ray | Manta pectoral fin | −0.386 | −0.015 | −0.011 | Worse: cannot take off in 7 kn |

Baseline re-optimised scores: light 0.909, medium 0.932, strong 1.023.

**Chimera** (the optimiser free to combine gull dihedral, crescent, winglets up or down, riblets and tubercles on top of all 22 planform variables; 600 evaluations per band, started from the optimum + riblets):
- light 0.928, medium 0.941, strong 1.035; that is +0.022 / +0.009 / +0.012 over the plain optima.
- The search **switched every other feature off**: crescent 0, winglet 0, tubercles 0 and inner dihedral 0. It kept only riblets (28 µm) and the existing mild tip anhedral.

## 4. Why each family wins or loses

**Riblets.** A Moth above ~15 kn is profile-drag dominated: induced drag is 18% of foil drag at 10 m/s and 4% at 15 m/s. Riblets are the only natural feature that attacks skin friction.
- A ~28–40 µm film puts s⁺ in the 10–25 range over 5–15 m/s, worth up to ~8% of the turbulent friction.
- Applied aft of transition on the foils and struts, the whole-boat VMG gain is 1–2%.
- The optimiser chose 28–41 µm; spacing above ~60 µm starts to *add* drag at high speed.

**Winglets (either way).** The lattice gives the expected span-efficiency gain (+2–10%). But it only pays below the ~12–14 kn crossover speed where induced drag dominates, and the extra wetted area and junction drag cost it back above that.
- Up-turned tips also move towards the surface at windward heel.
- Down-turned tips avoid that but add stiffness demands.
- Net: a tie. Up-turned "anti-vent" tips are justified by ventilation behaviour, which this model treats only through the tip-clearance rule, not by drag.

**Gull and raked tips.** Both recover tip depth at heel (gull) or add bend–twist gust relief (rake). In the model both effects are real but small, and they are offset by the extra arc length and tip-Re penalties. A tie within noise.

**Albatross.** It buys induced drag the Moth only needs below ~12 kn. At constant area the stress rises ∝ AR² and the tip deflection ∝ AR³. The tip chord falls below the Re 1.5e5 limit at take-off. The optimiser pulled the span back to the baseline value.

**Tuna / dolphin crescent.** In a flat wake, linear theory gives no induced-drag benefit from a crescent. Van Dam's 1987 8% was a panel-density artifact (Smith & Kroo). What remains is bend–twist gust relief, but it is outweighed by pointed-tip Reynolds penalties and tip stall (c_lmax × cos Λ).

**Raptor feathers.** The split wake does raise span efficiency in the lattice. But each feather has one-Nth of the break chord (low Re, high profile drag), carries no flap, and adds slot drag. The minimum flying speed rises, so the boat touches down in lulls.
- Birds use slotted tips at C_L 1–1.5, where induced drag dominates.
- A Moth spends most of its time at C_L 0.1–0.5.

**Humpback tubercles.** At Re 1–5e5 the tubercled section has a lower lift slope and lower CLmax, stalls earlier, and cavitates earlier in the troughs. The single documented benefit is a soft post-stall plateau. But on a flapped Moth foil the **flap-down stop limits low-speed lift before the section stalls**: the seaway simulator never reaches stall, so the plateau has nothing to protect. Tubercles might still help on an *elevator* in violent pitch events, which is not modelled here.

**Manta.** Low aspect ratio is fine for a flapping propulsor. A steady lifting foil pays heavily in induced drag at take-off, and it cannot foil in 7 kn.

**Forward sweep.** Wash-in under load raises the dynamic lift slope and moves towards divergence. This is the useful negative control: the model penalises it as theory says it should.

## 5. Recommendations

1. **Apply riblet film (~30 µm spacing) to the turbulent part of the main foil, elevator and both struts.** Keep the laminar leading-edge region smooth.
2. **Keep the conventional optimised planform.** No bio-inspired planform beat it outside the optimiser noise.
3. Anti-ventilation up-turned tips cost nothing in drag, so use them if they help ventilation in practice. The research suggests down-turned tips are strictly better near the surface.
4. Research directions this model cannot settle:
   - tubercles on the **elevator** (stall softening in pitch-down events)
   - flapped feather tips
   - winglets on a **light-air-only** foil that spends its life below 12 kn
   - aeroelastically tailored raked tips with a real bend–twist laminate model

## 6. Caveats

- Tubercle, riblet and slot/junction multipliers are fits to published data at nearby Reynolds numbers ([EST] in the research doc). No hydrofoil-scale data exists for winglets, box/ring wings, or tubercle ventilation.
- The lattice uses a flat, rigid wake. Main-foil tip vortices pass close to the elevator tips (research §10), which is not modelled.
- 14 generations per family is a moderate budget; the second-seed noise floor (±0.0025) bounds it.
