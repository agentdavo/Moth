# Nature-Inspired and Unusual Planforms/Devices for Moth Horizontal Foils

Author: research lead (companion to `MOTH_FOIL_RESEARCH.md`)
Date: 2026-09-23
Status: v1.0. Scope is the main-foil and rudder-elevator horizontal lifting surfaces of an International Moth (span ~0.6–1.15 m, chord 45–125 mm, V = 4–18 m/s, Re = 1.5×10⁵–1.5×10⁶, depth 0.15–0.5 m, cavitation onset ~35 kn). Every number carries a source URL. **[EST]** marks an engineering estimate: a fit to the cited data, a scaling argument, or a standard-theory calculation made here. It is not a measurement on a Moth. Noise results are ignored except where they explain a mechanism.

Conventions: ν = 1.19×10⁻⁶ m²/s, ρ = 1025 kg/m³. *A* = tubercle half-amplitude (peak to mean), λ = tubercle wavelength, *c* = mean chord, *b* = span, *h* = vertical extent of a nonplanar device, *e* = span efficiency (C_Di = C_L²/(π e AR)), s⁺ = s·u_τ/ν.

---

## 0. Why the Moth operating envelope decides almost everything

Reference main foil **[EST, from MOTH_FOIL_RESEARCH §2–3]**: L = 1050 N (≈85% of ~125 kg all-up), S = 0.085 m², b = 1.0 m, c̄ = 85 mm, e = 0.95, C_d0 = 0.0075.

| V (m/s) | V (kn) | q (Pa) | C_L main | Re (c̄) | D_i (N) | D_0 (N) | D_i share of foil (D_i+D_0) |
|---|---|---|---|---|---|---|---|
| 4.5 | 8.7 | 10 378 | 1.19* | 3.2e5 | 35.6 | 6.6 | 0.84 |
| 5 | 9.7 | 12 812 | 0.96 | 3.6e5 | 28.8 | 8.2 | 0.78 |
| 6 | 11.7 | 18 450 | 0.67 | 4.3e5 | 20.0 | 11.8 | 0.63 |
| 8 | 15.6 | 32 800 | 0.38 | 5.7e5 | 11.3 | 20.9 | 0.35 |
| 10 | 19.4 | 51 250 | 0.24 | 7.1e5 | 7.2 | 32.7 | 0.18 |
| 12 | 23.3 | 73 800 | 0.17 | 8.6e5 | 5.0 | 47.0 | 0.10 |
| 15 | 29.2 | 115 312 | 0.11 | 1.07e6 | 3.2 | 73.5 | 0.04 |
| 18 | 35.0 | 166 050 | 0.07 | 1.29e6 | 2.2 | 105.9 | 0.02 |

\*The hull still carries part of the weight at take-off, so the foil does not really need C_L 1.2.

**Break-even ("crossover") speed for any device that trades a span-efficiency gain for a parasitic increment** **[EST, derived here]**:

```
ΔD = L²/(q π b²)·(1/e1 − 1/e0) + q S ΔCd0 = 0
q* = sqrt( L² (1/e0 − 1/e1) / (π b² S ΔCd0) ),   V* = sqrt(2 q*/ρ)
```

| Device (reference foil) | e1/e0 | ΔC_d0 | V* |
|---|---|---|---|
| Vertical winglets, h/b = 0.05 each, clean junctions | 1.095 | 0.0006 | 7.0 m/s (13.6 kn) |
| Same, realistic junction drag | 1.095 | 0.0010 | 6.2 m/s (12.0 kn) |
| Winglets h/b = 0.10 | 1.19 | 0.0015 | 6.5 m/s (12.6 kn) |
| Slotted/multi-element tip, +8% e | 1.08 | 0.0008 | 6.3 m/s (12.2 kn) |
| Slotted tip, +15% e | 1.15 | 0.0012 | 6.5 m/s (12.7 kn) |

Every tip-vortex device in §3–§5 and §10 pays only below about 6–7 m/s (12–14 kn), i.e. around take-off and in marginal foiling. Above ~15 kn the Moth is **profile-drag dominated**. At top speed (C_L ≈ 0.07–0.11) the only bio-inspired item that can still help drag is skin-friction reduction (§8). The only ones that can help the cavitation limit are those that lower −C_p,min at low C_L, and none of the concepts here does that.

---

## 1. Humpback-whale leading-edge tubercles

### 1.1 What nature does
Humpback flippers have AR ≈ 6, NACA 63₄-021-like sections (t/c ≈ 0.20–0.28), and 10–11 LE tubercles with A/c ≈ 0.025–0.12 and λ/c ≈ 0.25–0.5. The flipper Re is 0.5–1×10⁶ ([Joh15] https://iopscience.iop.org/article/10.1088/1742-6596/656/1/012155; [vN08] https://public.websites.umich.edu/~alben/BumpsOnWhalesPRL.pdf).

### 1.2 Mechanism (for modelling)
- The same thickness sits over a shorter chord at a trough, so troughs have higher local t/c, a more adverse pressure gradient, **lower local −C_p minimum (stronger suction peak)** and earlier separation. Peaks stay attached well past the baseline stall. Stall becomes a spanwise-distributed, gradual process ([vN08]). Counter-rotating streamwise vortex pairs form between tubercles ([Han10] https://people.eng.unimelb.edu.au/imarusic/proceedings/17/329_Paper.pdf).
- The van Nierop lifting-line model finds **no appreciable change in induced drag**: L/D_i changes by less than 0.1% ([vN08]). The one CFD claim of −10.9% induced drag at α = 10° (Watts & Fish 2001, panel method, AR 2.04) has never been reproduced experimentally ([Han10] review).
- Stall delay is almost independent of λ. Amplitude dominates ([vN08]; [Joh07]).

### 1.3 Measured data

**Finite flipper model, Re ≈ 5.05–5.2×10⁵ (Miklosovic et al. 2004, Phys. Fluids 16 L39; https://apps.dtic.mil/sti/pdfs/ADA511517.pdf, summary https://journals.biologists.com/jeb/article/207/21/iv/14951/HUMPBACKS-BUMPY-FLIPPERS):** stall angle 12° → 16.3–17.5° (+40%), C_Lmax +6%, lower drag over 10° ≤ α ≤ 18° (post-stall), higher L/D above α ≈ 10° ([Cus07] thesis review, https://digital.wpi.edu/downloads/5t34sj662). This is the only configuration class with a pre-stall *gain*: a finite, tapered, swept flipper at Re ≥ 5×10⁵.

**Full span vs finite span (Miklosovic, Murray & Howle 2007, J. Aircraft 44(4) 1404, https://doi.org/10.2514/1.30303; numbers as quoted in the review literature, [secondary]):** on a full-span (2D) NACA 0020, tubercles cut pre-stall lift by ~38% and raised drag by ~137% near the baseline stall. Past baseline stall, lift was +48% and drag −6%.

**Full-span NACA 63₄-021, Re = 1.83×10⁵, water tunnel (Johari et al. 2007, AIAA J 45(11) 2634, https://arc.aiaa.org/doi/abs/10.2514/1.28497; table from Custodio MSc thesis [Cus07] https://digital.wpi.edu/downloads/5t34sj662):**

| Model | A/c | λ/c | dC_L/dα (/deg) | C_Lmax | α @ C_Lmax (°) | C_Dmin | (L/D)max | α_stall (°) |
|---|---|---|---|---|---|---|---|---|
| Baseline | 0 | – | 0.094 | 1.13 | 20.9 | 0.016 | 14.8 | 20.9 |
| 8S | 0.025 | 0.25 | 0.091 (−3%) | 1.12 (−1%) | 16.6 | 0.019 | 13.6 (−8%) | 16.6 |
| 8M | 0.05 | 0.25 | 0.086 (−9%) | 1.05 (−7%) | 14.7 | 0.018 | 13.1 (−11%) | 14.7 |
| 8L | 0.12 | 0.25 | 0.085 (−10%) | 0.85 (−25%) | 23.5 (plateau) | 0.018 | 11.2 (−24%) | none (flat) |
| 4S | 0.025 | 0.5 | 0.099 | 1.05 (−7%) | 14.4 | 0.022 | 12.3 (−17%) | 15.4 |
| 4M | 0.05 | 0.5 | 0.090 (−4%) | 0.96 (−15%) | 13.4 | 0.019 | 12.5 (−16%) | 13.4 |
| 4L | 0.12 | 0.5 | 0.081 (−14%) | 0.86 (−24%) | 26.7 (plateau) | 0.019 | 10.2 (−31%) | none (flat) |

Further points from [Cus07]:
- All tubercled foils match baseline C_L only for −6° ≤ α ≤ 8°. They start separating at α ≈ 8–10° against the baseline's 11°.
- Large amplitude gives a C_L plateau of 0.82 ± 0.05 from α = 10° to 26°. That is 28% below baseline C_Lmax and more than 40% above baseline post-stall C_L.
- In the post-stall regime lift is up to +50% (21–25°). Drag is never more than 4% above baseline post-stall, but **up to +70% pre-stall** (8L at 14.5°).
- The shorter λ gives slightly less drag.

**Full-span and half-span NACA 0021, Re = 1.2×10⁵ (Hansen, Kelso & Dally 2010 [Han10]; 2011 AIAA J 49(1) 185, https://arc.aiaa.org/doi/10.2514/1.J050631):**
- Configurations tested: A/c = 0.03–0.11, λ/c = 0.11–0.86. **The best was A/c = 0.03, λ/c = 0.11** (A/λ = 0.27). It still has a "small penalty in C_Lmax", but the stall is much softer. For A/c = 0.06 the optimum is λ/c ≈ 0.21. λ/c = 0.86 stalls early and abruptly, and λ/c = 0.11 at A/c = 0.06 loses lift in the linear range.
- Low-α drag is essentially equal to baseline, and larger amplitude gives slightly more drag. Post-stall drag is lower.
- No additional 3D (finite-span) benefit at this Re. Tubercles helped the NACA 65-021 more than the 0021.

**Reynolds-number trend.**
- Rudders at Re up to 8.8×10⁵ (Weber, Howle & Murray 2010, Marine Technol. 47(1) 27, https://scholars.duke.edu/display/pub730416): at lower Re tubercles decrease lift and increase drag for α = 15–22°. **At higher Re the difference between smooth and tubercled rudders diminishes.**
- AR 1.5 rudder at Re = 10⁶, A/c = 0.025, λ/c = 0.2 (Yoon et al. 2011, https://doi.org/10.1016/j.compfluid.2011.06.010): lift enhancement **only post-stall** ([Joh15] summary).
- Finite wings (Custodio, Henoch & Johari 2015, AIAA J, https://arc.aiaa.org/doi/10.2514/1.J053568): coefficients nearly Re-independent above a threshold. **Except for the flipper-like planform, L/D of every modified wing was ≤ baseline.**
- At very low Re (5.5×10⁴, tapered swept wing), tubercles *increased* lift at all α and slightly reduced drag at 4° < α < 10°, by suppressing laminar separation (https://link.springer.com/article/10.1007/s00348-018-2557-5).

**Unsteady / waves (Ricard et al. 2025, https://arxiv.org/abs/2508.13329):** for a hydrofoil under surface gravity waves driven into dynamic stall, tubercles gave **no substantial change in lift**, but strongly attenuated the drag-driven horizontal force fluctuations.

### 1.4 Cavitation (directly Moth-scale)
**Johari 2015 [Joh15]:** NACA 63₄-021, AR 4.3, **c = 102 mm, V = 7.2 m/s, Re = 7.2×10⁵**. Geometry and speed are almost exactly a Moth foil at ~14 kn.
- **Incipient cavitation starts in the troughs** on every tubercled foil, because the trough has the lowest local pressure.
- Inception angle at the tunnel σ: baseline 15°, A/c = 0.025 and 0.05 at 15°, **A/c = 0.12 as low as 12°** (3° α steps).
- "Leading edge-modified hydrofoils will always cavitate at a lower velocity than their straight leading edge counterpart."
- Sheet extent: the baseline sheet runs along the whole span from α = 18°. With A/c = 0.025 the sheet is full-span but a smaller chord fraction. **With A/c ≥ 0.05 cavitation is confined to pockets behind the troughs.** Transient cavitation cells appear behind the troughs at high α.
- Tip-vortex cavitation diminishes earlier with large A, because those foils carry less lift.
- The Ocean Eng. 162:196–208 (2018) journal version (Custodio, Henoch & Johari) confirms that the modifications "reduce the velocity threshold for cavitation at a given static pressure" (via https://www.researchgate.net/scientific-contributions/Charles-Henoch-2060493734).

**Tidal turbines (Shi, Atlar et al., Emerson Cavitation Tunnel; https://tethys-engineering.pnnl.gov/publications/cavitation-observations-noise-measurements-horizontal-axis-tidal-turbines-biomimetic):** tubercles **trigger cavitation earlier** but confine it to the troughs and **inhibit tip-vortex cavitation**.

**Semi-elliptic 3D NACA 16020, A/c = 0.02, λ/c = 0.042–0.083 (Simanto et al. 2025, JFM 1016, https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/effects-of-leadingedge-protuberances-on-cavitation-induced-noise-and-hydrodynamic-performances-of-threedimensional-hydrofoils/BB2A3F8DAFA4979D1E1BAF2FFCE102A4):** lift higher at moderate-to-high α with and without cavitation. The benefit appears at partial-cavity coverage of 30–50%.

**Moth relevance:** the Moth cavitation limit is set at C_L ≈ 0.05–0.15, often on the pressure-side LE with flap up (MOTH_FOIL_RESEARCH §7.9). Tubercles do nothing useful there. They lower the inception speed slightly (troughs) and their cavity-confinement benefit only appears at high α.

### 1.5 Ventilation
No ventilation data for tubercled lifting surfaces was found. **[EST]** The trough separation cells appear 2–5° earlier than baseline separation. Near the strut junction or a breaching tip they would give air an earlier path into the suction side. Treat tubercles as neutral-to-slightly-negative for ventilation inception, and possibly positive for re-attachment and washout (stall is gradual, with less hysteresis).

### 1.6 Where it helps and where it hurts (Moth)
- **Hurts:**
  - The main foil pre-stall at all racing speeds: C_L 0.07–0.7, lift slope −3 to −10%, C_d0 up by 10–35% at Re 2×10⁵.
  - Cavitation inception speed.
  - L/D max, by −8% even for the best small tubercles.
- **Helps:**
  - Graceful post-stall lift retention (+40–50% post-stall C_L, no C_L cliff) under transient large α: elevator during crash recovery, a bear-away with a big pitch transient, or take-off on a flap-down main at α ≈ 10–15°.
  - Attenuation of drag fluctuations in waves.
- **Net recommendation:** do not fit tubercles to the main foil. If they are tried, try them only on the **elevator outboard 50% of span**, with A/c ≈ 0.02–0.03 and λ/c ≈ 0.1–0.25. On a 55 mm elevator chord that is A ≈ 1.1–1.6 mm and λ ≈ 6–14 mm. The goal is stall softening, not L/D.

### 1.7 Recommended model (strip theory on tubercled strips; fits to [Joh07]/[Cus07], Re ≈ 2×10⁵, λ/c ≈ 0.25) **[EST fits]**
```
Lift slope:        a_2D,tub = a_2D · (1 − 1.0·A/c)                      (0.97/0.95/0.88 at A/c = 0.025/0.05/0.12)
C_lmax:            c_lmax,tub = c_lmax · max(0.75, 1 − 2.4·A/c)          (λ/c≈0.25); use 1 − 3.0·A/c for λ/c≈0.5
α at c_lmax:       Δα_clmax ≈ −(4° + 50°·A/c)  (≈ −5° at A/c 0.025, −6.5° at 0.05)
Post-stall:        c_l = max(c_l,base,post, c_l,plateau) for α_base,stall−5° < α < α_base,stall+5°,
                   c_l,plateau = 0.83·c_lmax,base (A/c ≤ 0.03), 0.72·c_lmax,base (A/c ≥ 0.1)
Profile drag:      ΔC_d0 = +0.0025·(1.8e5/Re)^0.5, applied to the tubercled strips only
                   (+0.0013 at Re 7e5); ×2 near base stall (α > α_base,stall − 6°)
Induced drag:      e unchanged (Δe = 0 ± 0.01)
Cavitation:        σ_i,tub = σ_i,base · (1 + 2.5·A/c)   (inception speed × (1+2.5A/c)^−½:
                   −3% at A/c 0.025, −6% at 0.05, −13% at 0.12; calibrated to 15°→12° at A/c=0.12)
                   Equivalent: −C_p,min,trough = (−C_p,min,thick)/(1 − A/c) + (1 + 2A/c)²·(−C_p,min,lift)
Cavity extent:     A/c ≥ 0.05 → sheet only behind troughs, cavity-area multiplier ≈ 0.5;
                   A/c ≈ 0.025 → full-span sheet, chordwise length × ≈ 0.7
Re correction:     scale the lift-slope, c_lmax and α_clmax penalties (not ΔC_d0, which has its own
                   Re term) by k_Re = clamp((1e6 − Re)/(1e6 − 2e5), 0.3, 1)
                   [EST, following Weber 2010 "differences diminish at higher Re"]
Optional optimistic finite-flipper case (Re ≥ 5e5, strongly tapered/swept tip):
                   C_Lmax × 1.06, α_stall × 1.4, post-stall drag −10% (Miklosovic 2004)
```

---

## 2. Crescent / lunate planforms (tuna, swordfish, shark tails, swift wings, raked tips)

### 2.1 What nature does
- **Thunniform caudal fins:** AR ≈ 7 in yellowfin tuna, LE sweep 30–50°. Fins with less sweep go with faster species, and 50° sweep produced less thrust than 30–40° (https://pmc.ncbi.nlm.nih.gov/articles/PMC6679399/).
- **Cetacean flukes:** AR 2.0–6.2, sweep 4.4°–47.4°, t/c 0.16–0.25 (Fish 1998, https://www.wcupa.edu/sciences-mathematics/biology/fFish/documents/1998FlukeMech.pdf).
- **Swifts** morph from extended wings (slow glides, turns) to swept crescent wings (fast glides). Choosing sweep can halve sink speed or triple turn rate (Lentink et al. 2007, Nature 446:1082, https://www.nature.com/articles/nature05733).

### 2.2 The induced-drag claim and its rebuttal
- **van Dam 1987** (J. Aircraft 24(2) 115, https://arc.aiaa.org/doi/10.2514/3.45427): an AR 7 crescent gives −8.0% cruise induced drag against an unswept elliptic wing (surface-pressure integration, panel method).
- **Smith & Kroo 1990/1993** (https://ntrs.nasa.gov/citations/19900063583; J. Aircraft 30(4) 446, https://arc.aiaa.org/doi/10.2514/3.46365) and **Smith 1996 NASA TP-3598** (https://ntrs.nasa.gov/api/citations/19960015887/downloads/19960015887.pdf):
  - The 8% was **an artifact of too few spanwise panels.** At N_s = 10, pressure integration reproduces van Dam (e = 0.982 elliptic vs 1.042 crescent). Refining to N_s = 69 drops the crescent value by 7%.
  - Trefftz-plane result: **e_crescent = 0.991 vs e_elliptic = 0.984 (+0.85%)**, from a more nearly elliptic span load. A flat elliptic planform under-loads its tips.
  - With a force-free wake: crescent 0.992 (wake shape changes drag < 0.25%), elliptic 0.959 at α = 4°.
  - "The induced drag of the crescent wing was about 2 percent less than the elliptical wing." An elliptic-chord wing with modified chord, or with twist, matches it.
- **Kroo 1991** (https://ntrs.nasa.gov/api/citations/19910014792/downloads/19910014792.pdf):
  - The real effect is 1–2%.
  - Only a **curved trailing edge** (seen in the Trefftz plane at incidence) gives a nonplanar-wake gain. "Wings with aft-swept tips and straight trailing edges should have no advantage." An AR 7 elliptic wing with a straight LE saves 1–2% in cruise, more at high α and low AR.
  - Nonlinear lateral-velocity effects add about 0.5%.
- **Experiment** (van Dam, Vijgen & Holmes 1991, J. Aircraft 28(11) 713, https://arc.aiaa.org/doi/10.2514/3.46087; NTRS abstract https://ntrs.nasa.gov/search.jsp?R=19900035141): at Re ≈ 1.7×10⁶ and α = −3…10°, the crescent had less lift-dependent drag in attached flow. The abstract does not quantify it, and the measurement includes viscous lift-dependent drag.
- **Raked tips (767-400, 777-300ER):** Boeing states they gave "nearly the same efficiency" as a larger-span wing with winglets. The gain is mostly span increase plus lower weight (https://aerospaceweb.org/question/aerodynamics/q0148.shtml; https://www.flightglobal.com/boeing-chooses-new-wingtips-for-stretched-767-400/5055.article).

**Answer: in linear theory there is no planform-shape induced-drag benefit beyond reaching an elliptic load.** Munk: for a planar streamwise wake, D_i depends only on the span load. A lunate planform is one way to get the load elliptic without twist. The residual 1–2% comes from the wake leaving a curved TE at incidence.

### 2.3 What does change (and matters for a Moth)
1. **Tip stall.** Aft-swept tips raise tip loading and cause spanwise BL drift, so the tips stall first. A swept-tip foil needs 1–3° washout or reduced tip c_l.
2. **Bend-twist coupling (the real structural benefit).** On an aft-swept beam, upward bending reduces streamwise incidence:
   ```
   Δα_stream(y) = θ(y)·cosΛ − φ(y)·sinΛ,   φ = dw/ds (bending slope), θ = elastic twist (nose-up +)
   ```
   Example **[EST]**: 15 mm tip deflection on a 0.5 m semispan under uniform load gives tip slope φ ≈ (4/3)(15/500) = 0.040 rad. With Λ = 20° at the tip, Δα ≈ −0.040·0.342 = −0.014 rad = **−0.8°**. That is passive gust and load alleviation that grows with load, which is good for heave damping. It is also why aft-swept "crescent" tips shed weed. Forward sweep gives the opposite sign (wash-in → divergence; see §7.4).
3. **Lift slope and C_Lmax** follow normal swept-wing rules. The local section sees V·cosΛ, so c_lmax,stream ≈ c_lmax,⊥·cosΛ in simple sweep theory. Low-AR, highly swept lunate fins (flukes) stall late (§7).
4. **Cavitation.** Swept tips reduce the normal-velocity suction peak (−C_p,min,stream ≈ −C_p,min,⊥·cos²Λ in simple sweep theory) but concentrate the tip vortex **[EST]**.

### 2.4 Recommended model
- Model the real planform in the VLM (sweep, taper, twist). Do **not** apply any extra e multiplier for "crescent-ness". Expect e ≈ 0.98–0.99 against 0.97–0.98 for an untwisted, unswept elliptic planform.
- Shed the wake from the actual TE coordinates at the foil's incidence, i.e. a nonplanar Trefftz trace. That captures the 1–2% curved-TE effect automatically. Otherwise add Δe = +0.01·(α/5°), capped at +0.02 for a curved TE, and 0 for a straight TE **[EST, Kroo 1991]**.
- Tip stall: c_lmax,strip ← c_lmax·cosΛ_local, plus a spanwise-drift penalty −0.1·sinΛ for strips beyond 80% semispan **[EST]**.
- Aeroelastic twist: the Δα_stream(y) formula above, with φ from a beam model (EI(y)).

---

## 3. Bird slotted wingtips / splayed primaries

### 3.1 What nature does
Soaring land birds (hawks, eagles, vultures, storks) spread 4–7 primaries into separate winglets with vertical stagger ("tip slots").

### 3.2 Data

| Source | Configuration / Re | Result |
|---|---|---|
| Tucker 1993, J. Exp. Biol. 180:285 (https://journals.biologists.com/jeb/article/180/1/285/6536/Gliding-Birds-Reduction-of-Induced-Drag-by-Wing) | Base wing + tip of 4 Harris-hawk primaries vs Clark-Y tip vs balsa "feathers"; 12.6 m/s (air, Re ~10⁵ [EST]) | Base-wing L/D +107% (4.9 → 10.1) with the feathered tip, +49% balsa feathers, +5% Clark-Y tip. Span factor stayed 0.87 (feathered) while the Clark-Y tip fell from 1.0 to 0.75 with α. Total drag 12% below a comparable hypothetical wing. Upwash at the tips reached 15° at base-wing α = 10.5°. |
| Tucker 1995, J. Exp. Biol. 198:775 (https://journals.biologists.com/jeb/article/198/3/775/6908/Drag-reduction-by-wing-tip-slots-in-a-gliding) | Live Harris hawk, primaries clipped vs intact, 7.3–15 m/s | Intact hawk had **70–90% of the drag** of the clipped hawk. Induced-drag factor at 0.8 m span: **0.56 intact vs 1.10 assumed clipped**. |
| Smith (Stanford), NASA TP-3598 (link above) | Planar split-tip wing, AR 6.67, **Re = 1.12×10⁶** | Computed e = 1.048 (streamwise wake) → 1.113 (relaxed wake) at α = 9°, C_L ≈ 0.76. **Measured e = 1.10 vs 0.98 elliptic at C_L = 0.7** (12% lower induced drag). The gain is nonlinear: the wake becomes nonplanar only at incidence. |
| Smith, Komerath et al. 2001, AIAA 2001-2407 (https://arc.aiaa.org/doi/10.2514/6.2001-2407) | NACA 0012 rectangular wing + flat-plate multi-winglets with dihedral spread, Re 1.6–3×10⁵ | L/D +15–30% vs bare wing. Large lift-slope increase with dihedral spread. |
| Cosin, Catalano et al. 2010, ICAS 2010-067 (https://www.icas.org/icas_archive/ICAS2010/PAPERS/067.PDF) | Half wing-body + 6 tip-sail layouts, **Re = 4×10⁵** | e: 0.648 → 0.78–0.855 (up to **+32%**). C_D0: 0.032 → 0.035–0.040 (**+9…+25%**). C_Lα 4.82 → 5.08–5.34 /rad (+5…+11%). C_Lmax 1.14 → 1.20. (L/D)max +7.3% (at α = 4°), +11% at α = 8°. At α = −2…0° L/D fell by 3–24%. **Break-even C_L ≈ 0.45 ± 0.05.** The low-C_L loss is overstated because the sail-chord Re was only 7×10³. |
| Lynch, Mandadzhiev & Wissa 2018, Bioinspir. Biomim. 13 036003 (https://iopscience.iop.org/article/10.1088/1748-3190/aaac53) | Low-Re flat-plate wings with tip gaps | A 20%-chord gap with nonplanar tips cuts induced drag at the cost of more parasitic drag. Gap effect is independent of planarity. |
| Wiswell & Wissa 2026, Integr. Comp. Biol. (https://pmc.ncbi.nlm.nih.gov/articles/PMC13176839/) | Bioinspired slotted tips, bird Re | Partial stall delayed 3–5°. Drag similar or higher. **No induced-drag reduction found.** A slotted tip was less efficient than an unslotted span extension of equal span. |
| Kroo VKI 2005 (https://www.boatdesign.net/attachments/vki_nonplanar_kroo-pdf.15343/) | Trefftz optimisation | Tip sails "appear less effective than a single vertical winglet with the same total span and vertical extent", but may have smaller junction and viscous interactions. |

### 3.3 Interpretation
- A slotted tip is a **nonplanar tip device plus a span extension**.
- Its gain is **zero or negative at low C_L** (parasite drag of several low-Re elements) and grows with C_L and α, because the wake vertical spread grows with incidence.
- Gains quoted against a *clipped* or *bare* wing overstate the benefit against an equal-span, well-loaded planar wing.
- Evidence covers Re 10⁴ (feather chords) to 1.1×10⁶ (Smith split tip).

### 3.4 Recommended model **[EST]**
```
e_slot = e0 · (1 + Δ·min(1, C_L/0.7)),  Δ = 0.08 (conservative) … 0.12 (Smith split tip, Re 1e6)
ΔC_d0 (on foil S) = n_el · (S_el/S) · C_d,el(Re_el) + n_el · ΔC_d,junction
      ≈ +0.0008 … +0.0012 for 3–4 elements on the outer 10% of a Moth foil (+10–15%)
C_Lα × (1 + 0.5·Δ); C_Lmax × 1.03; tip-strip stall delayed +2°
Break-even: C_L,BE ≈ 0.45 (Cosin); Moth V* ≈ 6.3–6.5 m/s (§0)
```
Moth-specific penalties:
- Element chords of ~15–25 mm run at Re 0.6–4×10⁵. Laminar bubbles then set C_d,el ≈ 0.012–0.02.
- Each element tip is a new cavitating vortex, so the tip-vortex inception σ rises.
- Near-surface elements breach at heel.

**Not recommended for the main foil.** Possibly worth a look for a dedicated light-air/take-off main (V < 6 m/s dominant).

---

## 4. Winglets and tip fences at low Re and near the free surface

### 4.1 Theory (unbounded fluid)
- Optimally loaded wing plus vertical winglets of height h on each tip, same span and lift: **e ≈ 1 + 1.9·h/b** (my fit to Kroo 2005 Fig. 2: winglets e ≈ 1.41 and box 1.46 at h/b = 0.2) **[EST fit]**.
- At fixed integrated bending moment, winglets and planar span extensions are equivalent. The maximum is ≈ 11% induced-drag reduction, with winglets of 20% of semispan or a 15–20% span extension (Jones, via Kroo 2005).
- Whitcomb (NASA TN D-8260, 1976): −20% induced drag, +9% L/D on a transport wing at high subsonic Mach (quoted in https://journals.vilniustech.lt/index.php/Aviation/article/view/15663).
- At sailplane Re (≈ 10⁶ at the root), winglets help thermalling (high C_L) and cost a little at high speed. Maughmer 2003 (J. Aircraft 40(6) 1099, https://arc.aiaa.org/doi/10.2514/2.7220) stresses that the component drag build-up at the winglet's own low Re decides the net result.

### 4.2 Hydrofoils and keels
- **Winged keels (Australia II 1983, 1999 Swiss AC keel [Kroo 2005 Fig. 21]):** no peer-reviewed quantitative data found. They work at high C_L (upwind side force), with added ballast depth as a side benefit.
- **Fully submerged hydrofoil winglets:** RANS parametric study (Applied Ocean Research 2020, https://www.researchgate.net/publication/344417771) and analytical free-surface lifting-surface model (Appl. Math. Modelling 37(5), 2013, https://www.researchgate.net/publication/257161862). Both report winglet effectiveness depending on span, cant and chord. Numbers were paywalled.
- **Moth practice:** Maguire advertises "fixed, upturned anti-vent wing tips" (MOTH_FOIL_RESEARCH §3.1). Bieker rudders are gull-winged, and AST uses 40–60 mm anhedral to keep the rudder tips away from the surface (§3.2 there). Kite and wing foilers use anhedral to keep tips immersed in chop (https://kiteforum.com/viewtopic.php?t=2396388&start=20).

### 4.3 Free-surface specifics **[EST, image method]**
At high depth Froude number the free surface acts like a negative (φ = 0) image a distance 2d above the foil, which raises induced drag (MOTH_FOIL_RESEARCH §7.3).
- **Upturned** tips bring their loaded vortex closer to the image. The local image penalty on those strips grows, and the tips reach the surface first when heeled. Windward tip depth = d − (b/2)·sinφ − h_winglet. For d = 0.15 m, b = 1 m, φ = 10° and h = 50 mm, the clearance is only 13 mm, so it will ventilate.
- **Downturned** (anhedral) tips move vorticity away from the image. Munk gives the same e gain up or down in unbounded fluid, so **downturned is strictly better near the surface**, and better for ventilation.
- Junction (winglet root) drag: use Hoerner's corner/junction increment. The same model as the T-joint in MOTH_FOIL_RESEARCH §7.7 applies, with ΔC_D,junction ≈ 0.0002–0.0005 per junction referenced to foil S at Moth scale **[EST]**.

### 4.4 Recommended model
- Model winglets as extra VLM panels, which gives nonplanar e. Add the winglet profile drag with a strip model at its own Re, junction drag, and a depth-dependent image per strip.
- Quick estimate: e_w = e0·(1 + 1.9·h/b)·k_fs, where k_fs = 1 − 0.3·max(0, (h_up)/(d − b/2·sinφ)) for upturned tips, and 1 for downturned **[EST]**.
- Parasitic: ΔC_d0 = 2·(S_wl/S)·C_d(Re_wl) + 2·ΔC_d,j. Typical Moth numbers with h/b = 0.05: S_wl/S ≈ 0.05, C_d ≈ 0.012, so ΔC_d0 ≈ 0.0006–0.0010 (§0 break-even 6.2–7.0 m/s).
- Ventilation flag when the tip clearance falls below max(0.05 m, 0.5·c_tip) (existing rule).

---

## 5. Gull wing / polyhedral / anhedral tips; albatross shoulder lock

### 5.1 What nature does
- Gulls and albatrosses flex at the wrist (polyhedral), which keeps outer panels drooped.
- The albatross **shoulder lock** is a tendon that holds the wing extended without muscle effort (https://royalsocietypublishing.org/rsos/article/9/11/211364/96584/). It is a structural and physiological feature, not an aerodynamic one.

### 5.2 Effects
- **Span efficiency:** a bent tip with vertical extent h behaves like a weaker winglet. Kroo 2005: "spanwise camber is most effective near the tip" (Lowson 1990). Projected span shrinks, b_p = b·[η_k + (1 − η_k)·cosΓ].
- **Depth:** tip depth rises by (1 − η_k)(b/2)·sinΓ. For a 0.5 m semispan with the outer 40% at Γ = 15°, that is +52 mm. This matters: the depth loss factor and the ventilation clearance are both strongly nonlinear in d/c.
- **Heel:** at windward heel φ, the windward tip depth is ≈ d − (b/2)·sinφ + (1 − η_k)(b/2)·sinΓ (small angles). Anhedral directly buys back heel margin.
- **Lateral/heave coupling:** anhedral panels give side force under heave, and differential incidence ±β·sinΓ under yaw (rudder steering or leeway). That couples steering to roll and heave. Also, the anhedral panel's lift has a horizontal component that costs vertical lift ∝ cosΓ **[standard geometry]**.
- **Structure:** gull and anhedral rudder foils were adopted partly for stiffness ([Bon25] via MOTH_FOIL_RESEARCH §3.2).

### 5.3 Recommended model
- Geometry into the VLM (dihedral per panel). Per-strip depth d(y) for the free-surface factor and the ventilation clearance.
- Quick estimate **[EST]**: e ≈ e_planar(b_p)·(1 + 1.9·k·h/b_p) with k ≈ 0.5 for a smooth bend, and vertical lift from panel i ∝ cos Γ_i.
- Moth guideline **[EST]**: 30–60 mm tip drop on a 0.6–0.8 m elevator, and 20–40 mm on a 1 m main. This roughly cancels 3–5° of windward-heel tip rise and costs < 1% of vertical lift.

---

## 6. Very high aspect ratio (albatross-style)

### 6.1 What nature does
The wandering albatross has a ~3.4–3.5 m span, AR ≈ 12–15, and best glide ratio ≈ 20–21 (https://royalsocietypublishing.org/rsos/article/9/11/211364/96584/; general data https://en.wikipedia.org/wiki/Wingspan). Its wing chord is ~0.2 m at ~15 m/s in air, **Re ≈ 2×10⁵**, which is the same regime as Moth foil tips at take-off.

### 6.2 Limits for a Moth
**Aerodynamic optimum span at fixed area** **[EST, derived]**, with C_d0 ∝ Re^(−n) and Re ∝ S/b:
```
D(b) = q S C_d0(b) + L²/(q π e b²),  C_d0 ∝ b^n
b_opt = (L/q)·sqrt( 2 / (n π e S C_d0) )
```
With L = 1050 N, S = 0.085 m², C_d0 = 0.0075, n = 0.3 and e = 0.95:

| V (m/s) | 5 | 6 | 8 | 10 | 12 | 15 |
|---|---|---|---|---|---|---|
| b_opt (m) | 4.8 | 3.4 | 1.9 | 1.21 | 0.84 | 0.54 |

So the drag optimum is speed-dependent. It is bounded above by structure, beam (2.25 m rule), tip breaching at heel, tip Re, and handling.

**Structural scaling at fixed S and t/c [EST, beam theory]:**
- Root moment for an elliptic load: M_root = L·b/(3π). For L = 1050 N and b = 1 m, M = 111 N·m.
- Bending stress σ ∝ M·t/I ∝ L b⁴/((t/c)² S³) = (L/S)·**AR²**/(t/c)².
- Tip deflection δ ∝ L b⁷/S⁴, so **δ/b ∝ AR³**. Going from AR 12 to AR 16 multiplies δ/b by 2.4.
- Deflection drives the bend-twist of §2.3 and aeroelastic flap-reversal margins.
- Example: root c = 0.11 m, t/c = 0.11, I ≈ 0.036·c·t³ = 6.8×10⁻⁹ m⁴ gives σ ≈ 97 MPa at 1 g. That is about 290 MPa at 3 g against a UD HM carbon strength of ~1000–1500 MPa.

**Reynolds limit [EST]:** keep c_tip ≥ 1.5×10⁵·ν/V_TO ≈ 40 mm at V_TO = 4.5 m/s. Below that, laminar separation bubbles at take-off C_L raise c_d and give abrupt tip stall. The AST main (1150 mm, AR 13.8, 83 mm mean) and the Maguire RX1.2 elevator (AR 15.6, 56 mm mean) already sit at this edge (MOTH_FOIL_RESEARCH §3–4).

**Model:** no multiplier. Use the VLM with an Re-dependent strip polar (XFOIL at N_crit ≈ 4). Add a structural beam for δ(y), φ(y), θ(y) and feed Δα_stream back in (§2.3).

---

## 7. Cetacean flukes, manta pectoral fins, forward-swept wings

### 7.1 Data
- **Flukes** (Fish 1998, link §2.1):
  - AR 2.0 (Amazon river dolphin) to 6.1–6.2 (fin whale, false killer whale). Sweep 4.4° (killer whale) to 47.4° (white-sided dolphin). Sweep is inversely related to AR.
  - Sections resemble NACA 63₄-021, t/c 0.16–0.25, with the thickness position at 25–40% chord.
  - Propulsive efficiency 0.75–0.90 (3D lunate-tail models; Wu's 2D 0.99 is an overestimate). Chordwise flexibility adds up to +20% efficiency.
  - "Maximum lift is reduced with increasing sweep angle for a given AR, whereas efficiency increases" (Liu & Bose, cited there). Chopra & Kambe found efficiency falls for sweep > ~30°.
- **Odontocete flippers**, CT-scanned models at **Re = 2.5×10⁵** (Weber, Howle, Murray & Fish 2009, J. Exp. Biol. 212:2149, https://www.wcupa.edu/sciences-mathematics/biology/fFish/documents/2009JEBFlippers.pdf):
  - C_Lmax 0.85–1.53. Group means 1.01 (slow swimmers), 1.33 (medium), 1.03 (fast).
  - **Stall α 18–46°** (fast-group mean 39°).
  - **C_Dmin 0.013–0.048** (group means 0.027–0.041).
  - Lift slopes 0.035–0.064 /deg. Swept planforms show piecewise-linear, vortex-lift curves. Stall is gradual.
  - For comparison, humpback flipper stall was 16.3° and minke 10–14°.
- **Manta ray:** propulsive efficiency 89% in flapping flight, St 0.2–0.4, net thrust from the distal half of the fin (Fish et al. 2016, Aerospace, https://www.researchgate.net/publication/305217419_Hydrodynamic_Performance_of_Aquatic_Flapping_Efficiency_of_Underwater_Flight_in_the_Manta).

### 7.2 Relevance
- These are **propulsors and control surfaces** optimised for thrust efficiency in oscillation, high α tolerance and manoeuvring. A Moth foil is a steady lifter at C_L 0.07–0.7.
- Low-AR, highly swept planforms buy late stall at the price of low lift slope and 2–5× higher C_Dmin. That is the wrong trade for a Moth main foil.
- Two transferable points:
  - Moderate aft sweep of the outer panel, for bend-twist load relief and a raised tip-stall α.
  - Thick, round-LE sections that tolerate large α transients. For the elevator this conflicts with the cavitation-bucket requirement.

### 7.3 Model
Use the swept-wing lift slope (DATCOM/Helmbold form):
```
a = 2π AR / (2 + sqrt( AR²(1 + tan²Λ_c/2)/κ² + 4 )),  κ = a_2D/2π
```
For AR < 2 add Polhamus vortex lift, C_L = K_p sinα cos²α + K_v cosα sin²α. That applies only to flippers, not Moth foils.

### 7.4 Forward sweep (some insects, bats, X-29)
- Bending gives **wash-in**, Δα_stream = +φ·sin|Λ|, which reduces the divergence speed. The effective lift slope rises, a_eff ≈ a/(1 − q/q_D).
- Loading moves inboard, so root stall comes first. That is benign for roll but useless for a Moth.
- For heave: an aft-swept tip gives passive gust relief (a stabilising load-to-incidence feedback). Forward sweep gives the opposite (destabilising, and it amplifies wave-orbital gusts). **Not recommended** for Moth horizontals **[EST]**.

---

## 8. Shark-skin / riblet surfaces

### 8.1 Data
- **Bechert et al. 1997** (JFM 338:59, adjustable-geometry oil channel; summary tables in Dean MSc thesis, OSU, https://mae.osu.edu/sites/default/files/2021-08/thesis_-_dean.pdf):

  | Riblet type | Best geometry | Max drag reduction ΔC_f/C_f |
  |---|---|---|
  | Sawtooth | h/s ≈ 1, α ≈ 60° | −5% |
  | Scalloped | h/s ≈ 0.7 | −6.5% |
  | Trapezoidal | – | ≈ −8.2% (commonly cited) |
  | Thin blade | h/s = 0.5, t/s = 0.02 | **−9.9%** |

  Each type works best near **s⁺ ≈ 15** (optimum 15–17 for blades). In pipe flow the optimum is s⁺ ≈ 12.
- **3D shark-scale-like riblets:** ≈ −7.3% (slightly worse than 2D blades) (Bechert, Bruse & Hage 2000, via https://www.academia.edu/30905251/).
- **García-Mayoral & Jiménez 2011** (Phil. Trans. R. Soc. A 369:1412, https://royalsocietypublishing.org/doi/abs/10.1098/rsta.2010.0359):
  - The drag reduction is proportional to size in the viscous regime and breaks down at larger sizes.
  - The universal size parameter is **l_g⁺ = √A_g⁺, optimum 10.7 ± 1**. For blades with h/s = 0.5, l_g ≈ 0.71·s, so s⁺_opt ≈ 15.
  - The breakdown comes from spanwise Kelvin–Helmholtz-like rollers, and drag **increases** beyond about twice the optimum size (s⁺ ≳ 28–30 for blades).
- **Airfoils** (Viswanath 2002, Prog. Aerosp. Sci. 38:571, https://www.sciencedirect.com/science/article/abs/pii/S0376042102000489): with optimised 3M riblets, **5–8% skin-friction reduction on 2D airfoils at low incidence and in mild adverse pressure gradient**.
- **Yaw:** almost unchanged below 15° misalignment and **zero at 30°** (Walsh & Lindemann, via Hage, https://link.springer.com/chapter/10.1007/978-3-540-45359-8_29).
- **Shark skin itself:**
  - On a *rigid* foil, sanded skin swam 13.4% faster than intact denticles. On a *flexible* foil, intact denticles were 12.3% faster (Oeffner & Lauder 2012, J. Exp. Biol. 215:785, https://journals.biologists.com/jeb/article/215/5/785/11221/). So the benefit is not simple drag reduction.
  - Biomimetic 3D-printed skin: −8.7% static drag at low speed but **increased drag at higher speed** (Wen, Weaver & Lauder 2014, https://journals.biologists.com/jeb/article/217/10/1656/13926/).
  - Denticle-shaped **vortex generators** on a NACA 0012 at Re = 4×10⁴: C_L ×1.13–1.24, C_D ×0.78–0.84, L/D ×1.46–1.72 at α = 2–6° (Domel et al. 2018, J. R. Soc. Interface, https://pmc.ncbi.nlm.nih.gov/articles/PMC5832729/). That is a low-Re laminar-separation effect.
- **Sailing precedent:** 3M/NASA riblet film on the hull of *Stars & Stripes* (1987 America's Cup) (https://ntrs.nasa.gov/api/citations/20020087761/downloads/20020087761.pdf). Riblets were later banned in that class. Moth class rules restrict stored power, not surface texture. **No Moth rule restricting riblets was found** (MOTH_FOIL_RESEARCH §1).
- **Laminar flow:** riblets have little effect on laminar skin friction apart from added wetted area. Their transition effect is mixed: some delay of Λ-vortex breakdown in the nonlinear stage, and adverse effects on linear TS growth (https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/an-experimental-study-of-the-influence-of-riblets-on-transition/33CA9E66B91548A1B7C13312748F6A47). **[EST]** On a laminar-bucket Moth section, keep riblets **aft of the expected transition line** (e.g. x/c > 0.4–0.5 on the suction side, x/c > 0.6 on the pressure side), or bench-test for early transition.

### 8.2 Required riblet spacing at Moth speeds (computed here)
Method: u_τ = U_e·√(C_f/2), local turbulent C_f = (2 log₁₀Re_x − 0.65)^−2.3 (Schlichting), c = 80 mm, ν = 1.19×10⁻⁶. U_e/U = 1.0 is typical of the pressure side and 1.2 of the suction side mid-chord.

| U (m/s) | x/c | U_e/U | ν/u_τ (µm) | s for s⁺=10 | s⁺=15 | s⁺=17 | s⁺=25 | s⁺=30 (µm) |
|---|---|---|---|---|---|---|---|---|
| 5 | 0.3 | 1.0 | 4.40 | 44 | 66 | 75 | 110 | 132 |
| 5 | 0.7 | 1.2 | 4.08 | 41 | 61 | 69 | 102 | 122 |
| 8 | 0.3 | 1.0 | 2.89 | 29 | 43 | 49 | 72 | 87 |
| 8 | 0.7 | 1.2 | 2.67 | 27 | 40 | 45 | 67 | 80 |
| 10 | 0.3 | 1.0 | 2.37 | 24 | 36 | 40 | 59 | 71 |
| 10 | 0.7 | 1.2 | 2.18 | 22 | 33 | 37 | 54 | 65 |
| 12 | 0.3 | 1.0 | 2.01 | 20 | 30 | 34 | 50 | 60 |
| 15 | 0.3 | 1.0 | 1.64 | 16 | 25 | 28 | 41 | 49 |
| 15 | 0.7 | 1.2 | 1.51 | 15 | 23 | 26 | 38 | 45 |
| 18 | 0.3 | 1.2 | 1.18 | 12 | 18 | 20 | 30 | 35 |
| 18 | 0.7 | 1.2 | 1.27 | 13 | 19 | 22 | 32 | 38 |

**Optimum spacing is 20–70 µm** (15–75 µm over the whole envelope), with blade height 10–35 µm. That is micro-texture comparable to 400–1000-grit scratch depth. s⁺ ∝ U^0.9, so one spacing covers only a ~2.5:1 speed band before passing the zero crossing.

**Fixed spacing vs speed** (x/c = 0.5, U_e/U = 1.1; blade-riblet curve from §8.3) **[EST]**:

| s (µm) | 4 m/s | 6 | 8 | 10 | 12 | 15 | 18 |
|---|---|---|---|---|---|---|---|
| 20 | s⁺ 3.8 (−2.7%) | 5.5 (−3.9%) | 7.2 (−5.0%) | 8.8 (−6.1%) | 10.3 (−7.2%) | 12.7 (−8.3%) | 14.9 (−9.5%) |
| **30** | 5.8 (−4.0%) | 8.3 (−5.8%) | 10.7 (−7.4%) | 13.1 (−8.6%) | 15.5 (−9.6%) | 19.0 (−9.3%) | 22.4 (−7.1%) |
| 40 | 7.7 (−5.4%) | 11.1 (−7.5%) | 14.3 (−9.2%) | 17.5 (−9.7%) | 20.7 (−8.5%) | 25.3 (−4.7%) | 29.9 (0%) |
| 60 | 11.5 (−7.8%) | 16.6 (−9.8%) | 21.5 (−7.8%) | 26.3 (−3.7%) | 31.0 (+0.8%) | 38 (+6.4%) | 45 (+11.8%) |

**Recommendation [EST]:** s ≈ 25–30 µm, which is best for 10–18 m/s where profile drag dominates. With h/s ≈ 0.5 (blade) or a trapezoidal groove of h/s ≈ 0.5–0.7, the ideal gain over 8–18 m/s is 7–10% of turbulent C_f. Practical films or lasered grooves reach ~0.5–0.8 of that.

**Net effect on a Moth foil [EST]:** ΔC_d,profile ≈ −DR · f_turb · f_fric · C_d0. With DR ≈ 0.06, f_turb ≈ 0.5–0.7, f_fric ≈ 0.8, that is **≈ −2.5 to −3.5% of foil profile drag**, or −1 to −2 N per foil at 15 m/s. The same treatment on the struts (larger turbulent fraction) would be worth more.

Risks:
- Fouling or biofilm, and wet-sanding damage (the grooves are 10–35 µm).
- Spanwise flow on swept or tapered tips (yaw > 15°).
- Riblets that trip transition early on a laminar section, which gives a **net drag increase**.
- No cavitation benefit. Sharp blade tips could nucleate **[EST]**.

### 8.3 Recommended model: C_f multiplier f(s⁺), turbulent-BL area only **[EST digitisation of the Bechert 1997 blade curve shape; scale by DR_max ratio for other shapes]**

| s⁺ | 0 | 5 | 10 | 15 | 17 | 20 | 25 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|
| C_f/C_f0 (blade h/s = 0.5, DR_max 9.9%) | 1.000 | 0.965 | 0.930 | 0.905 | 0.901 | 0.910 | 0.950 | 1.000 | 1.040 | 1.080 |

```
C_f/C_f0 = 1 − k_shape·k_yaw·(1 − f_blade(s⁺))       for s⁺ ≤ 30
C_f/C_f0 = f_blade(s⁺)  (roughness-like increase)     for s⁺ > 30
k_shape = 1.0 blade, 0.83 trapezoid, 0.74 3D shark-scale, 0.66 scalloped, 0.5 sawtooth (≈3M film)
k_yaw   = 1 for |β| ≤ 15°, linear to 0 at |β| = 30°  (β = local flow vs groove angle; use sweep of isobars)
Laminar region: C_f unchanged; add wetted-area factor (1 + 0.1·h/s) only if the film/texture is there
Optional pressure-gradient bonus: none (mild APG results 5–8% ≈ ZPG)
s⁺ evaluated per strip and chord station: s⁺ = s·U_e·sqrt(C_f/2)/ν
```

---

## 9. Owl serrations, sinusoidal trailing edges, dragonfly corrugation, flexible fish-fin camber

### 9.1 Owl leading- and trailing-edge serrations
- Owls have leading-edge combs, trailing-edge fringes and a velvety upper surface. The function is **noise**.
- Trailing-edge serrations on wind turbines: a full-scale 2.3 MW test showed broadband TE noise reduced by serrations on the pressure side (Oerlemans et al. 2009, AIAA J; https://reports.nlr.nl/items/11da7378-1e42-4fd2-9d3b-373524383875).
- Aerodynamically, at Re_c = 3×10⁶ (NACA 64₃-418, RANS) the lift change from TE serrations is well approximated by **a split plate (chord extension) of reduced length** (Llorente & Ragni 2019, Wind Energy, https://research.tudelft.nl/en/publications/trailing-edge-serrations-effects-on-the-aerodynamic-performance-o/). Misaligned (flapped) serrations add crossflow drag.
- Sinusoidal/wavy trailing edges on a swept NACA 0012 wing at **Re = 3×10⁴**: C_Lmax +31%, stall +6°, drag +4.9% (Aziz et al. 2026, Sci. Rep., https://pmc.ncbi.nlm.nih.gov/articles/PMC12868862/). That is a very-low-Re separation-control effect with no Moth relevance.
- **Model:** Δc_eff = +0.5·L_serr (added to local chord for lift only). ΔC_d0 = +C_f·(wetted area of teeth)/S, plus +0.0005 if the teeth sit on a deflected flap **[EST]**. No Moth benefit.

### 9.2 Dragonfly corrugated sections
- Benefit mechanisms: trapped vortices in the valleys and early reattachment. They work at Re ≈ 10³–10⁴ (Kesel 2000; mechanism windows 1000 ≤ Re ≤ 4000 per https://arxiv.org/abs/2503.12039).
- A corrugated section beats a smooth airfoil and a flat plate only at **Re < 10⁵** (Murphy & Hu 2010, Exp. Fluids, Re 5.8×10⁴–1.25×10⁵, https://link.springer.com/article/10.1007/s00348-010-0826-z).
- At Moth Re (1.5×10⁵–1.5×10⁶) corrugation is just roughness and form drag. **Model: do not use.** If forced, ΔC_d0 ≈ +50–100% **[EST]**.

### 9.3 Flexible fish-fin passive camber vs the Moth flap
- Ray-finned fish *actively* curve fin rays through basal muscles (the "fin-ray effect"): loaded rays curve *into* the flow (Alben, Madden & Lauder 2007, J. R. Soc. Interface 4:243, DOI 10.1098/rsif.2006.0181). Cetacean flukes gain up to 20% propulsive efficiency from chordwise flexibility (Fish 1998).
- A Moth flap is already an active-by-mechanism camber control, driven by ride height through the wand with no stored power.
- A **passively compliant flap or trailing edge** responds to *load and speed*, not ride height. It reduces camber as q rises, like automatic flap-up, which lowers C_L at speed. That is useful as gust alleviation and adds some heave damping in waves, but it shifts the wand/flap trim schedule.
- For comparison: a passively morphing trailing edge for sailing hydrofoils (https://www.researchgate.net/publication/345153062_A_Passively_Morphing_Trailing_Edge_Concept_for_Sailing_Hydrofoil). A variable-camber continuous TE flap gave up to −6.3% drag and +4.9% L/D (aircraft study, quoted in the same search). LE + TE flaps shift the cavitation bucket up and shrink it (IRENav, Re = 10⁶, 6.67 m/s, https://hal.science/hal-03798533/document).
- Bend-twist-coupled composite hydrofoils: nose-up coupling **accelerates** cavitation inception (https://www.sciencedirect.com/science/article/abs/pii/S0301932222002488). Wash-out (nose-down under load) coupling does the opposite.

**Model (compliant flap) [thin-airfoil calculation here + EST]:**
```
δ_eff = δ_cmd + (q·c_f²/k'_θ)·(C_hα·α + C_hδ·δ_eff)    (k'_θ = hinge rotational stiffness per unit span, N·m/rad/m)
⇒ δ_eff = (δ_cmd + q c_f² C_hα α / k'_θ) / (1 − q c_f² C_hδ / k'_θ)
Thin-airfoil (computed, E = c_f/c):  E = 0.25: τ = 0.61, C_hα = −0.57, C_hδ = −0.94 /rad
                                     E = 0.30: τ = 0.66, C_hα = −0.63, C_hδ = −0.96 /rad
                                     E = 0.35: τ = 0.71, C_hα = −0.69, C_hδ = −0.99 /rad
Viscous: multiply τ by ≈0.7 (BZ09 measured 2.2° flap ≈ 1° α → τ ≈ 0.45 for a ~30% flap) and C_h by ≈0.6 [EST].
Δc_l = a_2D·τ·(δ_eff − δ_cmd)
```
Example **[EST]**: for c_f = 25 mm and k'_θ = 50 N·m/rad/m, at 15 m/s (q = 115 kPa) q c_f²/k'_θ = 1.44. With C_hδ ≈ −0.58 (viscous), δ_eff drops to 1/(1 + 0.83) = 55% of the commanded flap. That is a strong and probably excessive effect, so size k'_θ for 10–20% relief at top speed.

---

## 10. Tandem wings (dragonfly), ring/box/C-wings

### 10.1 Theory
- **Munk stagger theorem:** for a streamwise wake, the total induced drag of a multi-surface system with given span loads is independent of stagger. Only the split between surfaces changes: the aft surface in the forward surface's downwash pays more (Kroo 2005; TP-3598 notes the nonlinear exception).
- **Prandtl biplane/tandem formula [classical; interference factor approximate, verify with VLM]:**
  ```
  D_i = (1/(π q))·[ L1²/b1² + 2σ·L1L2/(b1 b2) + L2²/b2² ]
  σ(G/b̄) ≈ (1 − 0.66·G/b̄)/(1.055 + 3.7·G/b̄)     (G = vertical gap, b̄ = mean span)
  ```
- **Box wing (Prandtl "best wing system"):** D_i,box/D_i,mono ≈ (1 + 0.45 h/b)/(1.04 + 2.81 h/b) (Prandtl approximation; Frediani/Demasi line of work, https://link.springer.com/article/10.1007/s42496-020-00058-y). That gives e = 1.26 at h/b = 0.1 and **e = 1.47 at h/b = 0.2**, matching Kroo's optimised 1.46.
- **C-wing:** e = 1.45 at h/b = 0.2 with much less vertical area than a box (Kroo 2005).
- **Ring wing:** e = 2 (half the induced drag of a monoplane of the same span) (Kroo 2005).
- Kroo: "more than 30% drag reductions possible with h/b = 0.2", but the savings must be weighed against wetted area, junctions and weight.
- The dragonfly tandem is a flapping phase-interaction device (fore/hind wing phasing). Its steady-glide tandem benefit at low Re is marginal (e.g. https://arxiv.org/pdf/2304.07844).

### 10.2 Hydrofoil implementations
- No published box-, ring- or C-wing hydrofoil for sailing with measured data was found. Ring and toroidal forms appear as marine propellers (loop propellers) without comparable lift data.
- The Moth is already a tandem: the main plus the elevator ~2.2–2.4 m aft, with spans 0.9–1.15 m and 0.63–0.8 m.

### 10.3 Moth-specific points **[EST]**
- **Vertical extent is capped by depth.** A box or C-foil needs h ≤ d − clearance ≈ 0.1–0.15 m at racing ride heights. So h/b ≤ 0.1–0.15, giving **e ≤ 1.26–1.35**.
- The upper element runs at d/c ≈ 1–2, where the free-surface image kills much of its lift and adds wave drag. It ventilates first.
- Wetted area and junctions roughly double (4 junctions against 1). Chords halve, so Re halves and c_d rises.
- Net: C_d0 × 1.3–1.6. Break-even is well below 6 m/s. **Not competitive** except as a structural or low-speed curiosity.
- **Main-to-elevator interaction:**
  - The main-foil wake rolls up to vortices spaced πb/4 ≈ 0.785·b_main, i.e. ±0.39 m for a 1 m main.
  - The vortex pair's self-induced descent over the ~0.23 s transit at 10 m/s is only ~6 mm. So **elevator tips (±0.32–0.40 m) sit almost exactly on the main-foil tip-vortex paths** when the two foils are at similar depth and without leeway.
  - That imposes strong spanwise upwash and downwash (local twist) on the elevator. The downwash at the elevator centre is ε ≈ 2C_L/(πAR)·k with k ≈ 0.8–1.0 at x/b ≈ 2.3.
  - Model it with a VLM that includes the main-foil wake (preferably relaxed or rolled-up) and the free-surface image.
  - Design choice: keep elevator span < ~0.7·b_main or > ~0.9·b_main, or offset it vertically by ≥ 0.1 m.
- Elevator lift is usually small or negative at speed (MOTH_FOIL_RESEARCH §4). With L2 < 0 the tandem interference term raises total D_i, which is another reason to trim with near-zero elevator load.

### 10.4 Recommended model
- Solve main + elevator (+ images) in one VLM. Use a Trefftz-plane drag on the combined wake, and put the elevator in the main-foil wake (streamwise or relaxed).
- Box or C variants: model the geometry directly. Quick estimate with the Prandtl box formula, then C_d0 multiplier 1.3–1.6 and per-element depth factors **[EST]**.

---

## 11. Summary: model multipliers for the VLM + strip code

| Concept | Lift slope | C_Lmax / stall | C_d0 | e (span efficiency) | Cavitation | Ventilation | Verdict for Moth |
|---|---|---|---|---|---|---|---|
| Tubercles (A/c 0.025–0.05, λ/c 0.1–0.25) | ×(1 − A/c) | c_lmax ×max(0.75, 1 − 2.4A/c); α_clmax −(4° + 50·A/c); post-stall plateau 0.83·c_lmax,base | +0.0025·(1.8e5/Re)^0.5 on tubercled strips; ×2 near stall | ×1.00 | σ_i ×(1 + 2.5A/c); trough-first; A/c ≥ 0.05 cavity area ×0.5 | neutral/slightly worse [EST] | No on main; maybe elevator outer span for stall softening |
| Crescent / lunate | from geometry | tip c_lmax ×cosΛ, −0.1 sinΛ outer 20% | 0 | ×1.00 (straight TE); +0.01·(α/5°) ≤ +0.02 (curved TE); crescent vs flat ellipse +0.7–2% | −C_p ×cos²Λ on swept strips | – | Use aft-swept tips for bend-twist relief |
| Slotted / multi-element tips | ×(1 + 0.5Δ) | ×1.03, tip stall +2° | +0.0008–0.0012 | ×(1 + Δ·min(1, C_L/0.7)), Δ = 0.08–0.12 | worse (more tip vortices) | worse (breaching elements) | Only for a light-air main; V* ≈ 6.3–6.5 m/s |
| Winglets (up) | +few % | – | 2(S_wl/S)C_d,wl + 2ΔC_d,j ≈ +0.0006–0.001 | ×(1 + 1.9h/b)·k_fs | tip-vortex σ_i roughly unchanged | **worse** (tip clearance) | No |
| Winglets (down) / anhedral | ×cos Γ panel | – | as above | ×(1 + 1.9·k·h/b_p), k ≈ 0.5 for a bend | – | **better** (tip depth +(1 − η)(b/2)sinΓ) | Yes on elevator (30–60 mm drop); small on main |
| Very high AR | Helmbold | Re-limited tip c_l | Re-dependent | via span | – | tip breach at heel | Keep c_tip ≥ ~40 mm; δ/b ∝ AR³ |
| Flukes / low-AR swept | DATCOM low | stall 18–46° | C_Dmin 0.013–0.048 | low | – | – | No (propulsor, not steady lifter) |
| Forward sweep | ↑ (wash-in) | root stall first | 0 | ~0 | – | – | No (divergence, heave-destabilising) |
| Riblets (s ≈ 25–30 µm) | 0 | 0 | C_f × f(s⁺) on turbulent area (table §8.3) → −2.5…−3.5% of profile drag | 0 | none | none | Maybe; high-speed gain, fragile |
| TE serrations | +via Δc = 0.5L_serr | ~0 | +wetted | 0 | – | – | No |
| Corrugation | – | – | +50–100% | – | – | – | No |
| Compliant flap | τ_eff via δ_eff formula | – | ~0 | 0 | lower C_L at speed helps bucket | – | Possible as gust relief; retune wand |
| Tandem / box / C / ring | geometry | – | box/C ×1.3–1.6 | box: (1.04 + 2.81h/b)/(1 + 0.45h/b); ring 2.0 | upper element worse | upper element worse | Keep tandem, avoid closed; watch elevator tips in main vortices |

---

## 12. Source list (additional to inline URLs)

- [Joh07] Johari, Henoch, Custodio & Levshin 2007, AIAA J 45(11) 2634. https://arc.aiaa.org/doi/abs/10.2514/1.28497
- [Cus07] Custodio, MSc thesis, WPI 2007 (Table 1 data). https://digital.wpi.edu/downloads/5t34sj662?locale=en
- [Joh15] Johari 2015, J. Phys. Conf. Ser. 656 012155 (CAV2015). https://iopscience.iop.org/article/10.1088/1742-6596/656/1/012155
- [vN08] van Nierop, Alben & Brenner 2008, PRL 100 054502. https://public.websites.umich.edu/~alben/BumpsOnWhalesPRL.pdf
- [Han10] Hansen, Kelso & Dally 2010, 17th AFMC. https://people.eng.unimelb.edu.au/imarusic/proceedings/17/329_Paper.pdf
- [Han11] Hansen et al. 2011, AIAA J 49(1) 185. https://arc.aiaa.org/doi/10.2514/1.J050631
- [Cus15] Custodio, Henoch & Johari 2015, AIAA J. https://arc.aiaa.org/doi/10.2514/1.J053568
- [Web10] Weber, Howle & Murray 2010, Marine Technol. 47(1) 27. https://scholars.duke.edu/display/pub730416
- [Mik04] Miklosovic et al. 2004, Phys. Fluids 16 L39. https://apps.dtic.mil/sti/pdfs/ADA511517.pdf
- [Mik07] Miklosovic, Murray & Howle 2007, J. Aircraft 44(4) 1404. https://doi.org/10.2514/1.30303
- [TP3598] Smith 1996, NASA TP-3598. https://ntrs.nasa.gov/api/citations/19960015887/downloads/19960015887.pdf
- [Kro91] Kroo 1991, "Nonlinear aerodynamics and the design of wing tips". https://ntrs.nasa.gov/api/citations/19910014792/downloads/19910014792.pdf
- [Kro05] Kroo 2005, VKI "Nonplanar wing concepts". https://www.boatdesign.net/attachments/vki_nonplanar_kroo-pdf.15343/
- [Cos10] Cosin et al. 2010, ICAS. https://www.icas.org/icas_archive/ICAS2010/PAPERS/067.PDF
- [Fish98] Fish 1998, fluke biomechanics. https://www.wcupa.edu/sciences-mathematics/biology/fFish/documents/1998FlukeMech.pdf
- [Web09] Weber et al. 2009, J. Exp. Biol. 212:2149. https://www.wcupa.edu/sciences-mathematics/biology/fFish/documents/2009JEBFlippers.pdf
- [Dean] Dean, riblet thesis (Bechert 1997 data). https://mae.osu.edu/sites/default/files/2021-08/thesis_-_dean.pdf
- [GMJ11] García-Mayoral & Jiménez 2011. https://royalsocietypublishing.org/doi/abs/10.1098/rsta.2010.0359
- Internal: `docs/research/MOTH_FOIL_RESEARCH.md` (geometry, depth/free-surface, cavitation and ventilation models).

Calculations made for this report (riblet spacing, crossover speeds, b_opt, thin-airfoil hinge coefficients) used the stated formulas with ν = 1.19×10⁻⁶ m²/s and ρ = 1025 kg/m³. They are reproducible from the equations given.
