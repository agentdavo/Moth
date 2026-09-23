# International Moth Hydrofoil Research: Physics & Design-Space Report

Author: research lead (for the WebGPU/Three.js Moth foil physics & optimiser project)
Date: 2026-09-23
Status: v1.0. Every number has a source URL. Anything marked **[EST]** is an engineering estimate: it is derived from the cited data or from standard theory, not measured on a current boat. Current commercial foil geometry (Exploder, Mach2, Bieker, Maguire, Swift, Ninja, etc.) is mostly proprietary. The only published modern spans and areas found were Mackay/Bieker, Maguire FX2.2/RX1.2 (through a thesis), and several academic designs. The rest is inferred.

Units are SI unless stated. 1 kn = 0.5144 m/s. 1 lb = 4.448 N. 1 in = 25.4 mm. 1 ft/s (fps) = 0.3048 m/s.

---

## 0. Key sources (used throughout)

| Tag | Source | Why it matters |
|---|---|---|
| [CR2024] | International Moth Class Rules, World Sailing, effective 1 Dec 2024. https://media.sailing.org/sailing/wp-content/uploads/2017/06/20094612/MTH_CR_2024-12Dec-01.pdf (landing page https://www.sailing.org/document/class-rules-moth/) | Rule text for §1 |
| [BZ09] | Beaver & Zseleczky, "Full Scale Measurements on a Hydrofoil International Moth", 19th CSYS, 2009. https://www.boatdesign.net/attachments/moth-foils-csyspaperfeb09-pdf.92311/ (also https://onepetro.org/SNAMECSYS/proceedings/CSYS09/461904) | Only full-scale tow-tank breakdown of Moth T-foil drag (strut, spray, junction, wave, induced), hull drag, windage |
| [Day19] | Day, Cocard & Troll, "Experimental measurement and simplified prediction of T-foil performance for monohull dinghies", 23rd CSYS, 2019. https://strathprints.strath.ac.uk/67655/1/Day_etal_CSYS2019_Experimental_measurement_and_simplified_prediction_of_T_foil.pdf | Flapped T-foil tank data, 2 VPP-grade models with all formulas (free surface, spray, junction, strut interference, flap drag) |
| [Bon25] | Bonetti et al., "Hydrofoils Design and Multifidelity Optimization for a Flax Fiber Moth", J. Sailing Technology 10(1), 2025. https://arts.units.it/retrieve/e48d8854-3b63-4909-a9eb-36e3cf83d558/sname-jst-2025-07.pdf | Complete published optimiser bounds and final Moth foil geometry |
| [Wal] | Waldman, "A Computational Design Framework for Hydrofoil Design Applied to the International Moth", Princeton MSE thesis. https://freight.cargo.site/m/B2367988924993911590778558622293/Waldman_MAE_Thesis_FileCopy.pdf | Maguire FX2.2/RX1.2 geometry, VPP data, wand equations, sail polar table, windage |
| [Mk25] | Mackay Bieker Foil Guide 2025. https://mackayboats.com/index.cfm/boats/bieker-moth/mackay-bieker-foil-guide-2025/ (older version: https://mackayboats.com/index.cfm/boats/bieker-moth/bieker-moth-vertical-and-horizontal-main-rudder-foil-models-pdf/) | Current commercial spans per wind band |
| [MkV3] | Mackay Bieker Moth BM-V3 User Guide (Sept 2024). https://mackayboats.com/index.cfm/boats/bieker-moth/bm-v3-user-guide-sept-2024-v4-compressed-pdf/ | Boat weight, sailor weight limit, control-system parts |
| [May] | Adam May, "Foiling Guide" (c. 2005/06). https://www.mothclass.at/wp-content/uploads/2014/10/Foiling-Guide.pdf | Historical Fastacraft/Full Force foil dims and sections |
| [McL09] | Bruce McLeod, "Magic wands – wand control systems on hydrofoil Moths", 2009. https://doczz.net/doc/936446/magic-wands---wand-control-systems-on-hydrofoil-moths | Wand gearing, bell-crank geometry, ride-height adjusters |
| [Chap71] | Chapman, "Spray Drag of Surface-Piercing Struts", NUC TP 251, 1971. https://www.foils.org/wp-content/uploads/2017/12/Spray-Drag-of-Surface-Piercing-Struts-71223.pdf | Spray drag equations (Hoerner, Savitsky-Breslin, Chapman) |
| [Lis] | "A Structural and Hydrodynamic Analysis of a 'Moth' Dinghy Hydrofoil" (IST Lisboa MSc, Voodoo Moth). https://fenix.tecnico.ulisboa.pt/downloadFile/2815144904098185/MasterThesis_84556.pdf | Strut stiffness test, CFD lift/drag vs heel, trim, depth |
| [NS] | North Sails International Moth Speed Guide. https://www.northsails.com/blogs/north-sails-blog/north-sails-international-moth-speed-guide | Rig numbers, speed targets, wind bands |
| [Hwd] | Harwood/Young ventilation stability maps and follow-up. https://arxiv.org/abs/2503.18015 | Ventilation inception on surface-piercing foils |

Also consulted (cited inline): Findlay & Turnock (Southampton VPP, 2008), https://eprints.soton.ac.uk/52462/ and https://eprints.soton.ac.uk/63963/ (abstracts only; the PDFs were blocked). Eggert, "Flight Dynamics and Stability of a Hydrofoiling International Moth with a DVPP", TU Berlin MSc 2018, https://www.researchgate.net/publication/328571438 (secondary through [Wal]). Bögle et al. 2010 (sail polar, secondary through [Wal]). Tannenberg et al., JST 2023 AC75 foil parametric VPP, https://foils.org/wp-content/uploads/2024/08/VPP_DR_2.pdf (methodology).

---

## 1. Class rules relevant to foils

Source: [CR2024]. The Moth is an open development class (rule 1.1: "give the designer and builder the fullest liberty").

| Item | Rule | Value / text |
|---|---|---|
| Hull length | 6.1 | ≤ **3355 mm** between perpendiculars, excluding removable rudder fittings and stem fittings |
| Rudder/stem fittings (gantry, bowsprit) | 6.1.2–6.1.5 | Must be mechanically fastened and removable. If they extend **> 500 mm** beyond the hull length limits, the excess counts toward hull length. So gantry and bowsprit are effectively limited to about 500 mm beyond the hull each. Rudder fittings must be ≥ 30 mm clear of the hull in profile (anti-waterline-extension rule). |
| Beam | 6.2 | Overall beam ≤ **2250 mm** (includes hiking racks/wings) |
| Hollows | 6.3.2 | No hollow > 75 mm in the hull bottom below the static waterplane within 2700 mm of the aft perpendicular (no tunnels/catamaran-like shapes) |
| **Foil exit** | **6.3.3** | **"Any foil, excluding the rudder and any rudder mounted foil, shall protrude out of the hull from below the static waterplane."** This is the only rule that directly constrains foils. It forces the main foil strut to leave the hull bottom, so there are no surface-piercing side foils from the wings. In practice this gives the universal centreline T-foil (daggerboard) layout, [Day19]. |
| Multihull | 11.2 | Catamaran/multihull configurations prohibited |
| Mast | 8.1–8.3 | Mast spar ≤ 6250 mm. The top 5185 mm of mast area counts in sail area. |
| Sail area | 9.1 | One sail. Total measured rig area (sail + mast area within 5185 mm of the top) ≤ **8.25 m²** |
| Sail height | 9.2 | Sail must not extend > 5185 mm from the throat point |
| Wing sails | 9.5 | Allowed, single element, no visible slots |
| Crew | 10.1–10.2 | One person. Righting moment is transmitted through hull/rigging/mainsheet only. Hiking straps allowed. |
| Trapeze / moving seats | 11.1 | Prohibited |
| Stored power | 12.2 | Only **remote controls using stored power** are prohibited. Springs and shock cord are allowed. So **no electronic/battery-actuated ride control in racing**. Mechanical wand/flap systems, elastic pre-load and passive composites are all legal. |
| Pumping to foil | 12.1 | RRS 42 altered: sail pumping and body movements are allowed to *initiate foiling* |
| Weight | none | **No minimum boat weight** |

**What is free (optimiser-relevant):** number, size, planform, section, span, sweep, dihedral/anhedral, twist, material, flap/no flap, all-moving vs flapped, and the control system (wand, bow sensor, gearing), subject only to: (a) the main foil exits the hull below the static waterline, (b) no stored-power actuation, (c) gantry/bowsprit ≤ ~500 mm beyond the hull, (d) overall beam 2.25 m. Rudder-mounted foils are exempt from 6.3.3, which is why the rudder T-foil hangs off a gantry behind the transom ([May]; [Day19]).

---

## 2. Typical numbers

### 2.1 Masses, rig, righting moment

| Quantity | Typical | Range | Source |
|---|---|---|---|
| Hull (bare) | < 10 kg modern | 8–20 kg | Mach2 typical hull 10 kg, all-up 30 kg (https://www.mach2boats.com/home/mach-2-essentials/12-content/information/377-moth-class-specifications via search summary); [Lis] "hull weights of less than 10 kg" |
| Boat rigged ("all-up") | 30–35 kg | 26–45 kg | Mach2 30 kg; Bieker BM-V3 **35–45 kg** [MkV3]; Voodoo "35 to 40 kg" [Lis]; "all-up sailing weight around 35 kg" [Day19]; Waldman VPP hull mass 29.2 kg [Wal] |
| Sailor | 70–80 kg | 60–95 kg | Competitive 60–85 kg (Mounts Bay SC, https://mbsc.com.au/classes/moths/); North split at 75 kg [NS]; Bieker max sailor **95 kg** [MkV3]; VPP crew 78.5 kg [Wal] |
| Total flying mass (baseline) | **108 kg** (33 + 75) **[EST]** | 90–135 kg | [Bon25] designed to 130 kg (heavier flax boat); [BZ09] 240 lb = 109 kg |
| Sail area | 8.25 m² | = max | [CR2024] |
| Mast length (example) | 5100 mm (Greenhalgh) | ≤ 6250 | [NS] |
| Boom–deck clearance | 700–750 mm | | [NS] |
| Sail CE height above deck | ~2.0–2.2 m **[EST]** | 1.8–2.4 | Decksweeper, 5.1–5.2 m luff; CE at ~40% of luff height |
| Sail CE height above main foil (flying) | ~3.1–3.5 m **[EST]** | | 2.1 m CE + ~0.3 m hull depth + 0.4–0.7 m ride clearance + 0.2–0.3 m foil depth |
| Sailor lateral CG (hiking) | 1.3–1.5 m from centreline | | Beam 2.25 m. VPP crew lateral limit 1.5 m [Wal] |
| Sailor CG height above main foil | ~1.5–1.9 m **[EST]** | | Geometry |
| Righting moment (75 kg, 15° windward heel) | **≈1.2–1.3 kN·m [EST]** | 0.9–1.6 kN·m | RM = m_s·g·(y·cosφ + z·sinφ) = 736·(1.35·0.966 + 1.7·0.259) ≈ 1.28 kN·m |
| Hull/wing/sailor windage | CdA ≈ 0.58–0.75 m² (drag, along course, AWS 12 kn); CsA ≈ 0.9–1.1 m² (side) | | Converted from [BZ09] Table 2: Drag/V² = 0.0095 (0°), 0.0078 (15°), 0.0074 lb/fps² (30° heel). Side 0.0115–0.0137. **The sailor is 42% of aero drag.** Modern hulls/wings are cleaner: use 0.45–0.65 m² **[EST]** |

The heel geometry is why windward heel matters. Heeling the rig to windward: (a) lengthens the righting arm (term z·sinφ); (b) tilts the main-foil lift to windward so it adds side force, letting the strut run at less leeway; (c) gives sail lift a vertical component that unloads the foils; (d) moves the sailor lower, out of the airflow. Source: [BZ09] §Air resistance, Fig. 25.

### 2.2 Take-off, speeds, VMG per wind band

Anchors:
- "Require about 8 knots of wind to get up on foils, but once foilborne boat speed rarely drops below wind speed". Upwind 10–14 kn typical, 15 kn for top sailors (2009 boats) [BZ09].
- Take-off boat speed "typically around 3.5 m/s" (6.8 kn) for a Bladerider-era foil [Day19].
- Flax Moth: take-off at **~8.5 kn boat speed in 6–7 kn TWS**, top speed > 20 kn [Bon25].
- Foiling possible from ~5–6 kn TWS for light, skilled sailors ([Lis]; Wikipedia summary https://en.wikipedia.org/wiki/Moth_(dinghy)).
- 2022 Aerocet: "we used to go upwind at 15–16 kts, now we're doing 20", AWS ~35 kn (Seahorse "New broom", https://www.seahorsemagazine.com/article/october-2022/new-broom). Dylan Fletcher: 21 kn upwind, AWS ~35 kn (https://www.sail-world.com/news/227910/21-knots-upwind-in-a-Moth).
- North Sails: upwind 15–20 kn in 15–20 kn TWS, starts at ~20 kn [NS].
- VPP at TWS 5 m/s (9.7 kn): upwind VS 6.5 m/s (Williams sailing data 2010), 6.7 (Eggert VPP), 8.0 (Waldman VPP, over-predicts); downwind 7.3/8.9/10.1 m/s [Wal Table 3.5]. Waldman VMG up/down: TWS 3 m/s: 4.34/4.09; 4 m/s: 5.26/6.01; 5 m/s: 5.83/7.60 m/s [Wal Table 4.2]. These over-predict.
- Records: **35.9 kn 10-s average** (Ned Goss, Mach2, 18–25 kn TWS, Charleston, 2014) (https://foilingweek.com/35-9-knots-new-moth-speed-world-record-ned-goss-in-charleston-bay-usa/). "Top speeds exceeding 36 knots" at the 2024 Worlds, Manly NZ (https://www.boatingnz.co.nz/2025/01/high-speed-battles-on-foils-at-manly-with-the-moth-world-championships-2024/). A web summary claimed 39 kn at the 2025 Worlds; this was **not verified** (Garda winds were 5–12 kn that week).
- General press: ~14 kn up / 20 kn down in 10 kn TWS; 17 up / 25–30 down in 20 kn (https://www.watersportsoutlet.com/blog/3-reasons-to-love-moth-sailing-k7hd5ag.html; low-grade source).

| Band | Design TWS | Upwind BS | Upwind TWA | Upwind VMG | Downwind BS | Downwind TWA | Downwind VMG | Notes |
|---|---|---|---|---|---|---|---|---|
| Light (< 8 kn) | 7 kn | 10–13 kn | 42–48° | 7.5–9 kn | 13–17 kn | 125–140° | 9–12 kn | Marginal foiling. Take-off TWS 6–8 kn (light sailor ~5.5–6). Hull drag hump dominates. **[EST]** from anchors |
| Medium (8–14 kn) | 11 kn | 14–18 kn | 40–45° | 10.5–13 kn | 19–25 kn | 130–145° | 14–19 kn | Fully foiling. Max ride height in flat water. **[EST]** |
| Strong (15–25 kn) | 18 kn | 17–21 kn | 38–44° | 13–15.5 kn | 25–33 kn (peaks 35–36) | 135–150° | 19–25 kn | Depowered rig. Control, cavitation and ventilation limited. Bieker rates its boat to **20 kn max wind** [MkV3]. **[EST]** |

Take-off check with the §9 baseline: m = 108 kg, main foil carries 80–85%, CL,max usable ≈ 1.0–1.05 (flap +8…+10°, [Bon25] take-off CL ≈ 1.03).
- S = 0.095 m² → V_TO ≈ 4.1 m/s (7.9 kn)
- S = 0.082 → 4.5 m/s (8.8 kn)
- S = 0.068 → 5.1 m/s (9.9 kn)

Required main-foil CL at speed (S = 0.082 m², 85% of 108 kg):
- 10 kn: 0.81
- 15 kn: 0.36
- 20 kn: 0.20
- 25 kn: 0.13
- 30 kn: 0.09
- 35 kn: 0.066

At top speed the foil runs at CL < 0.1, deep in the profile-drag-dominated regime. This is the core argument for smaller foils in breeze.

### 2.3 Attitude: ride height, heel, pitch

| Quantity | Typical | Source |
|---|---|---|
| Main foil depth (to ¼-chord), foiling | 0.15–0.35 m in flat water. Deeper (0.3–0.5) in waves or light air | CFD cases at 150/200 mm [Lis]. 18 in (457 mm) "typical from photographs" in 2009 [BZ09]. 100 mm tested [Day19]. PUFFIn range h_eff 0–0.79 m [Wal]. "Higher is better" [BZ09, Day19] |
| Main strut length below hull | 1.0–1.15 m | 1.0 m (Bladerider) [Day19]. 1.058 m (Mach2.5 CAD) [Wal]. 1.15 m [Bon25] |
| Hull bottom clearance when flying | ~0.5–0.8 m **[EST]** | strut length × cos(rake)·cos(heel) − foil depth |
| Windward heel upwind | **10–20°** (up to ~25–30° in breeze/for pointing) | Tested 0/15/30° [BZ09]. 0/10/15° [Lis]. 0–30° VPP [Wal]. Findlay & Turnock: windward heel and ride height are critical upwind (https://eprints.soton.ac.uk/52462/) |
| Heel downwind | 0–10° (near upright) | [BZ09]: "off the wind … typically sailed upright" |
| Pitch trim foiling | ~0° ± 1° (bow slightly down at high speed) **[EST]** | Main foil design AoA in foiling mode ≈ 1°, α = 3→1° across the speed range [Bon25] |
| Pitch at take-off | +2 to +5° bow up (stern-trim) **[EST]** | [Bon25] "boat trimmed by the stern" at take-off. Light air displacement sailing is bow-down [BZ09] |
| Leeway | ~2–5° | 4° assumed in [BZ09] aero test. ±5° in [Wal] |
| Main strut rake | ~7° forward (anti-ventilation) | [Day19]; [Bon25] |
| Main–rudder foil separation | ~2.2–2.4 m **[EST]** | Main foil 1.44 m aft of bow [Bon25]. Rudder foil near transom + gantry (≤ 500 mm). Waldman attachments 2.34 m apart [Wal] |
| Rudder foil vs main foil height | Rudder foil ~0.1 m shallower than main (hull level) | [Bon25]: keeps the elevator out of the main-foil downwash |

---

## 3. Main foil

### 3.1 Historical and published geometry

| Foil | Span b (mm) | Area S (cm²) | Root c (mm) | Tip / mean c (mm) | AR | t/c | Section | Flap | Source |
|---|---|---|---|---|---|---|---|---|---|
| Fastacraft (2005) | 850 (early 900) | 1000 (1080) | 120 | 120 (rect.) | 7.2 | 12% | NACA 63-412 | Kevlar hinge | [May] |
| Full Force (2005) | 860 | ~950 | 110 | 110 | 7.8 | 12% | NACA 63-412 | recessed | [May] |
| Hungry Beaver (2008) | 985 | 1030 | 120 | 121 mean | 9.4 | 12.2% | Eppler 393 | 30% of area | [BZ09]; [Bon25] Tab 6 |
| Vendor 1 (≈Bladerider 2008) | 991 | 961 | ~125 | 97 mean | 10.2 | 13.6% | ? | 33% of area | [BZ09] |
| Vendor 2 (≈Prowler/Mach2 2008) | 986 | 1022 | — | 104 mean | 9.5 | 12.6% | NACA 63-412 | 27% of area | [BZ09] |
| Bladerider (tank, 2019) | 988 | 939 | 125 | 45 @ 90% span, 95 mean | 10.4 | 12.8%, camber 3.1% | custom | 35% chord, squashed bulb | [Day19] |
| Nick Flutter DIY (2009) | 1050 | — | — | — | — | — | NACA 64-612 root → 64-608 tip | 35–40% mid, 25–30% tips, ~5° max at tips | https://nickflutter.blogspot.com/2009/12/foils.html |
| "2022 commercial mainfoil" | ~1000 | **800** | — | — | ~12.5 | thin | — | — | [Bon25] Fig 2 |
| **Maguire FX2.2 (light air)** | **1040** | **815** | — | 89.6 mean | **13.3** | — | — | yes | [Wal] Tab 3.4 |
| AST flax Moth (2023) | 1150 | 960 | 107 (excl. bulb) | 83 mean | 13.8 | ≥ 11% (flax) | Eppler 393, bi-elliptic | 30% | [Bon25] Tab 4/6 |
| **Bieker MH-V6** | 990 | — | — | — | — | — | high-lift | yes | Light airs [Mk25] |
| **Bieker MH-V5** | 950 | ref | — | — | — | — | standard | yes | Light–medium. ~85 kg+ sailor all-round [Mk25] |
| **Bieker MH-V10** | 950 | V5 − 8% | | | | | standard | | Medium–heavy [Mk25] |
| **Bieker MH-V8** | 900 | V5 − 12% | | | | | high-lift | | Medium. ~70 kg sailor all-round [Mk25] |
| **Bieker MH-V9** | 850 | V5 − 23% | | | | | high-lift | | Heavy air [Mk25] |

Maguire says its current mains have "skinnier verticals, a new titanium connection … super small low drag bulbs, faster foil sections and fixed, upturned anti-vent wing tips", with "typical speed gains of 2–3 knots" (https://maguireboats.com/international-moth-foils-84-c.asp). Named models: FX2.2, FX2.5, FX3.2 (https://maguireboats.com/main-foils-90-c.asp). Swift (Damic Design) offers three main sizes: Super Small, Small, Large (https://www.damicdesign.com/hydrofoils). Mach2.6 ships "2.4/2.41" HM foils (https://www.mach2boats.com/index.php/the-mach-2-5/mach-2-5-update). North Sails: "a larger foil for light wind / marginal foiling, a smaller foil for strong wind" [NS].

Trend: area fell ~20% from 2009 to 2022 (1030 → 800 cm²). Span stayed ~1 m or grew. Sections got thinner as high-modulus (HM) carbon became standard ([Bon25] §2.1; Mach2 "thinner and narrower … similar plan area").

**Inferred current band sizes [EST]:** using V5 ≈ 850–900 cm² (consistent with the FX2.2 at 815 cm² / 1040 mm and "800 cm² 2022"):
- Light: 950–1150 mm span, 850–1000 cm²
- Medium: 900–1000 mm, 750–850 cm²
- Strong: 850–900 mm, 620–720 cm²

### 3.2 Planform features
- **Taper / elliptic:** strongly tapered or bi-elliptic outlines (Spitfire-like). Root chord ~100–125 mm, tip ~35–50 mm (Bladerider 45 mm at 90% span [Day19]). In XFLR5 studies at constant area (960–970 cm²), efficiency rises with span from 950 to 1150 mm, most at take-off speeds [Bon25 Fig 8]. The OpenAeroStruct optimum at fixed area is elliptical [Wal §5.2].
- **Sweep:** modest leading-edge sweep near the tips. Aft sweep gives bend-twist washout (load relief) and sheds weed. Keep quarter-chord sweep small (< 10°) **[EST]**.
- **Dihedral/anhedral:** main foils mostly flat, with small tip features ("upturned anti-vent tips", Maguire). Rudder foils are commonly **gull-wing/anhedral** (Bieker RH-V3/V4/V5 "gullwing" [Mk25]; AST anhedral depth 40–60 mm, used "to increase stiffness … and keep rudderfoil tips away from the surface" [Bon25 §4.2]). AC75 parametric VPP favoured max span with anhedral (https://foils.org/wp-content/uploads/2024/08/VPP_DR_2.pdf).
- **T-junction:** bulb/fuselage for the strut tenon. Vendor 1 used a body of revolution; Vendor 2 had no fillet with the foil LE ahead of the strut LE; Hungry Beaver had a 0.75 in (19 mm) fillet [BZ09]. Aligning strut and foil leading edges likely gives the highest junction drag [BZ09]. Modern practice is small low-drag bulbs, titanium connections (Maguire), or airfoil-shaped "blended bulbs" [Bon25 §6.2]. The bulb adds ~3% wetted area [Day19].

### 3.3 Sections
- Lift foils: NACA 63-412 (Fastacraft, Vendor 2) [May, BZ09]; Eppler 393 (HB, AST — best L/D in XFOIL at Re 3.5–4.5e5 vs NACA 64612/63412 [Bon25 §3.1]); NACA 64-612/608 (Flutter); custom 12.8% / 3.1% camber (Bladerider) [Day19]; Speer H105 and optimised LAFV8 [Wal §4]; Eppler 297 and 836 (rudder, [BZ09]).
- Thickness: 2005–2010 sections were 12–14%. Modern HM solid-carbon foils are ~9–11% at mid-span, ~8% at tips **[EST]** ("thinner is better, the limit being structural" [BZ09]). The AST flax foils were forced to ≥ 11% [Bon25].
- Operating Reynolds numbers: Re = V·c/ν ≈ 1.5×10⁵ (take-off, tips) to 1.5×10⁶ (top speed, root). ν ≈ 1.19×10⁻⁶ m²/s (sea, 15 °C). This is transitional, so laminar-bucket sections help but are sensitive to roughness and free-stream turbulence. XFOIL Ncrit = 4 is recommended for open water [Day19; Bon25].

### 3.4 Flap
- Chord fraction: 27–35% of area/chord in production foils ([BZ09]; [Day19] 35%). 30–45% considered [Wal]. 30% chosen [Bon25]. Taper toward the tips (25–30%) to keep elliptic loading (Flutter).
- Deflection range tested/used: −6…+6° [Day19 tank]; ±10° [Wal]; design schedule +9° (take-off) → −7° (25 kn) [Bon25 Tab 5]; max +8…+12° [Bon25 Tab 3]. XFOIL "best take-off" combination for E393: α = 3°, δf = 8° [Bon25].
- Measured flap authority: a ~30% flap gives **~45%** of the lift change of whole-foil incidence. **2.2° of flap ≈ 1° of AoA** [BZ09]. Flap-up (shedding lift) matters more than flap-down for safety [BZ09].
- Hinge: flexible sealant, or Kevlar/fabric with flexible epoxy, flush on the upper surface with a lower-surface cut-out. A permeable hinge is worse than a sealed gap [BZ09]. The pushrod (2.5 mm stainless steel) bends under load, so flap angle under load can differ by > 2° [Day19].
- Drag increment of flap gap: ΔCD ≈ 0.0012 for CL < 0.6, rising linearly to 0.0022 at CL = 1.0 (Wenzinger & Harris 1939, used in [Day19]).

---

## 4. Rudder / elevator

| Foil | Span (mm) | Area (cm²) | Mean c (mm) | AR | Section | Source |
|---|---|---|---|---|---|---|
| Fastacraft 2005 | 650 | 780 | 120 | 5.4 | 63-412 + flap | [May] |
| Original Fastacraft | 520 | 624 | 120 | 4.3 | | [May] ("58% – too small") |
| Hungry Beaver | 879 | 806 | 117 | 9.6 | Eppler 393 | [BZ09]/[Bon25] |
| Vendor 2 rudder | 785 | 803 | 117 | 7.7 | NACA 63-412 | [BZ09] |
| Vendor 1 rudder | 831 | 779 | 102 | 8.8 | ? | [BZ09] |
| **Maguire RX1.2** | **765** | **375** | **56** | **15.6** | — | [Wal] |
| AST (2023) | 800 | 400 | 50 | 16 | Eppler 393, anhedral 40 mm | [Bon25] |
| Bieker RH-V1 | 770 | — | | | | light air, "28 kn regularly achieved" (https://mackayboats.com/index.cfm/news/introducing-the-bieker-moth-v2-bm-v2/) |
| Bieker RH-V3 | 700 | — | | | gull-wing | all-round light–medium [Mk25] |
| Bieker RH-V4 | 657 | — | | | gull-wing | medium [Mk25] |
| Bieker RH-V5 | 630 | — | | | gull-wing | heavy air [Mk25] |

- **Area ratio (rudder/main):** 2005: 75–80% ("fleet levelled out … ~75–80%" for pitch restoring moment [May]). 2008: 78% [BZ09], who concluded "existing rudder lifting foils appear too large": > 50% of rudder T-foil drag was foil section + junction drag, and induced drag was only ~5%. **Modern: ~40–47%** (RX1.2/FX2.2 = 0.46; AST 0.42).
- **Lift share:** designers assume the rudder carries ~20–25%: 25% in [BZ09] (180 lb main / 60 lb rudder); 22% in [Bon25] (lift ratio 78%). In practice the rudder share varies with thrust and sailor position, and can go **slightly negative** (downforce) at high thrust. See §6.3 for the pitch balance.
- **Incidence adjustment:** the whole rudder (strut + foil) is raked about the gudgeons by a worm/screw rod in the tiller, driven by twisting the tiller extension. The Bieker assembly uses a titanium worm-drive tube with a rake stopper [MkV3 App B]; the mechanism is described in [Day19]. Typical adjustment range ~±2–4° (a search summary quoted "4° (4.05° max)"; setup start 3.6° to −0.4°. Secondary source, **[EST]**). Historic 2005 boats used a rudder flap instead [May]. Modern boats are all-moving via rake.
- **Operating AoA:** AST design rudder-foil α = +4° → −4° over 0–25 kn [Bon25 Tab 5]. Rudder lift in the [BZ09] test: CL ≈ 0.18 at 20 fps.
- **Tail-volume-like metric:** V_H = S_r·l_r / (S_m·c̄_m). For RX1.2/FX2.2 with l_r ≈ 2.3 m: 0.0375·2.3 / (0.0815·0.0896) ≈ **11.8**. This is not comparable with aircraft values (0.3–0.6) because the "wing" chord is tiny. A more useful measure is the static-margin analysis in §6.3.

---

## 5. Vertical struts (main & rudder)

| Strut | Chord (mm) | t (mm) | t/c | Section | Source |
|---|---|---|---|---|---|
| Fastacraft CB / rudder (2005) | 120 / 120 | 16.8 / 14.4 | 14% / 12% | NACA 66014 / 0012 | [May] |
| Full Force CB / rudder | 120 / 120 | 14.4 | 12% | 0012 / 0012 | [May] |
| HB / JZ / V1 / V1-rudder / V2 (2008) | 114–121 | 15.2–18.0 | 13.0–15.2% | Eppler 297, Eppler 836, NACA 66014 (V2 daggerboard) | [BZ09 Fig 13] |
| Bladerider vertical | 118 root → 113.5 tip | 17 | 14.5% | NACA 66012 scaled to 14.5% | [Day19] |
| AST centreboard / rudder | tapered | — | 12→14% / 12→15% | NACA 63012 root → 66014 tip (CB); 0012 → 63015 (rudder) | [Bon25 §6.3] |
| Bieker MV-V4 / MV-V5 / RV-V5 | — | — | — | **Lower 400 / 450 / 470 mm in steel** ("reduced drag steel section") | [Mk25]; https://mackayboats.com/index.cfm/news/moth-foil-update/ |
| Swift verticals | — | — | — | HM carbon top + machined high-tensile stainless bottom | https://www.damicdesign.com/hydrofoils |
| Modern carbon/steel **[EST]** | 90–110 | 9–12 | 9–12% | 6-series-like symmetric | inferred from "skinnier verticals" (Maguire) and steel lower sections |

- **Length:** main 1.0–1.15 m below hull. Rudder ~1.1–1.35 m from gantry attachment. Waldman VPP: rudder span 1.354 m, chord 0.12 m [Wal].
- **Rake:** main strut ~7° forward to reduce ventilation [Day19, Bon25]. Rudder rake is adjustable (trim).
- **Measured strut drag at 20 fps (Re ≈ 6×10⁵):** section Cd (based on strut area) **0.0066–0.0104**. That is higher than Abbott & von Doenhoff at Re 3×10⁶ (0.005–0.006) and matches Lyon (0.008 at Re 5×10⁵). The most aggressive laminar strut (V2, NACA 66014) showed **no drag-bucket benefit** [BZ09].
- **Wave+spray coefficient** (D_ws = C·q·t²): measured **0.26–0.38** vs Hoerner **0.24**, i.e. ~30% higher [BZ09 Fig 17]. VPPs have used 0.26 (Eggert/[Wal]) and 0.54 ([Day19] model 1, from Hoerner §10-13).
- **Drag breakdown at 20 fps, 18 in immersion, 180 lb lift** (Vendor 2 daggerboard T-foil, total 9.73 lb) [BZ09 Fig 23]:

| Component | lb | Share |
|---|---|---|
| Strut section drag | 2.37 | 24% |
| Strut wave + spray | 0.35 | 4% |
| Foil section + junction | 4.06 | 42% |
| Induced | 2.54 | 26% |
| Foil wave drag | 0.40 | 4% |

  The main T-foil L/D was ≈ 18.5. Rudder T-foil (60 lb lift, 5.3–5.9 lb) L/D ≈ 10–11.
- **Structural data point:** Voodoo main strut cantilever with a point load 1060 mm from the clamp: stiffness **8.1 N/mm** measured, 8.42 N/mm FEA. At the 441 N "100 kg sailor" design side load, that is ~54 mm lateral tip deflection. UHM340 + UDC300 + ±45 layup [Lis §4, §6.1]. **Strut lateral bending is large enough to change leeway/foil yaw and must be modelled.**
- **Cavitation:** struts run at near-zero lift. −Cp_min ≈ 2·t/c (≈ 0.2–0.3), so inception is > 50 kn. They are not the limiting item except at the T-junction and in yaw. See §7.9.
- **Ventilation and spray:** see §7.8–7.10. Spray rails/fences reduce spray drag substantially [Chap71]. The Moth has used anti-ventilation fences on rudders historically; the wand paddle reduces wand-induced interference ahead of the rudder strut [McL09].

---

## 6. Control system

### 6.1 Wand → flap linkage (mechanical, legal because no stored power)
Chain: wand (carbon/glass rod with paddle) on a bow pivot or short bowsprit → hull pushrod (titanium tube in BM-V3) → gearing rod/bell-crank → ride-height barrel (M5 thread) → main vertical pushrod (inside the strut trailing edge) → flap horn [MkV3 App B; McL09; Day19].
- **Gearing:** default 1:1 bell crank (arm length = arm height). Standard arm lengths are 25 mm (Prowler) and 40 mm (Bladerider). A shorter height gives more flap per wand movement with less force [McL09]. Gearing is adjusted for waves: rougher water needs faster gearing [NS].
- **Neutral (bias / ride height):** flap neutral at wand ~45° is the default. A longer control rod means flap-down at 45° and flying higher [McL09]. Adjusted on the water with a "dial"/barrel adjuster (Lister, Gulari 2009) or a telescopic wand (the "Luka wand"). Retractable wands give up to ~300 mm of length change (search summary; **[EST]**).
- **Wand length:** ~0.9–1.3 m **[EST]**. Pivot ~0.3 m above the still waterline in the Mach2.6 CAD (swd_pivot = 0.298 m [Wal]). Longer wand = higher flight = more righting arm and less drag [search summary of North "How to build your Moth skills"].
- **Offset wand:** a starboard-offset wand gives different ride height port vs starboard when heeled. Sailors trim the rudder differently tack to tack [McL09].
- **Flick-off:** a straight wand can lose contact at the top of its travel and flick forward, giving full flap-up and a forced descent. Useful in extreme cases; can cause porpoising in chop [McL09].
- **Mach2.6** control lines: 16:1 downhaul, 48:1 vang (rig, not foils) (https://www.mach2boats.com/index.php/the-mach-2-5/mach-2-5-update).

### 6.2 Wand kinematics model (from Eggert via [Wal])
```
δ_wand = arccos( swd_pivot / (L_w · |cos φ|) ) − θ        if swd_pivot/|cos φ| < L_w
       = 0 (wand hanging, max flap-down)                  otherwise
δ_f [deg] = −G · ( Offset + 15 − (180/π)·atan( (r_pivot/l_flap) · δ_wand ) )
```
Where:
- swd_pivot = still-water distance of the wand pivot (m)
- L_w = wand length
- φ = heel, θ = pitch
- G = gearing (1 = default)
- Offset = ride-height bias
- r_pivot/l_flap and the "+15°" are curve-fit constants [Wal eq. 3.2.3–3.2.4]

For the optimiser, use a cleaner linearised form **[EST]**:
```
h_w  = h_pivot(z, θ, φ)                       // pivot height above local water surface (include waves)
θ_w  = acos( clamp(h_w / L_w, 0, 1) )         // wand angle from vertical
δ_f  = clamp( δ_0 + K_g · (θ_w − θ_w0), δ_min, δ_max )
dδ_f/dh ≈ −K_g / (L_w · sin θ_w)              // [rad flap per m of height]
```
With L_w = 1.1 m, θ_w0 = 45° and K_g ≈ 0.25 deg/deg, this gives ≈ −1.9° of flap per 100 mm of height. Add first-order lag (τ ≈ 0.05–0.15 s) and linkage compliance (pushrod bending, ≥ 2° at high load [Day19]).

### 6.3 Pitch/heave balance & stability (for the physics model)
Take moments about the main-foil quarter chord (x positive aft, z up):
```
W·Δx_cg  =  T_sail·z_CE  +  L_r·l_r  −  D_aero·z_aero  +  M_0,main  + …
→  L_r = ( W·Δx_cg − T·z_CE + D_aero·z_aero − M_0 ) / l_r
```
Where Δx_cg is the CG distance aft of the main foil and M_0,main is the flap pitching moment (nose-down with flap down; Cm ≈ −0.16 to −0.23 [Wal Tab 5.1]).

Example **[EST]**: W = 1060 N, Δx_cg = 0.4 m, T = 250 N at z_CE = 3.2 m, l_r = 2.3 m. Then L_r ≈ (424 − 800)/2.3 ≈ −160 N (downforce). The sailor moves aft, or rakes the rudder for less lift, as thrust rises. This matches the practice of trimming rudder incidence with wind strength and course [Day19].

- **Heave stability** comes from the wand: lift falls with height.
- **Pitch stability:** the open-loop neutral point with a fixed flap sits about x_NP ≈ a_r S_r (1−dε/dα) l_r / (a_m S_m + a_r S_r(1−dε/dα)). For FX2.2/RX1.2 with dε/dα ≈ 0.3 this is ≈ 0.55–0.6 m aft of the main foil. With the wand closing the loop, the main foil's effective lift-curve slope with respect to pitch falls (the flap cancels AoA changes) and the neutral point moves aft. Bow-up pitch also raises the wand sensing point and sheds main-foil lift, which is restoring. **The aircraft-style static margin is therefore only meaningful with the wand loop included.** Eggert's DVPP showed Moths are unstable in a lull without pitch control (aborted-lull simulation, https://www.researchgate.net/publication/328571438).
- **Rudder downwash:** keep the elevator ~0.1 m above the main-foil plane and ≥ 2.2 m aft [Bon25]. Downwash angle at the elevator ≈ 2·C_L,m/(π·AR_m)·κ, with κ ≈ 0.5–1 depending on vertical offset **[EST]**.

---

## 7. Hydrodynamic phenomena and models (formulas)

Notation: q = ½ρV². S = planform area. b = span. AR = b²/S. c̄ = S/b. h = submergence of the foil ¼-chord below the free surface. t = thickness. F_c = V/√(g c), F_h = V/√(g h).

### 7.1 Section data
- Use XFOIL-type polars (Ncrit ≈ 4, turbulence ~0.6%) over Re 1×10⁵–1.5×10⁶ and flap −8…+12° [Day19 used 6 Re × 13 α × 17 δf; Bon25]. Model 1 of [Day19] interpolates these with cubic splines.
- Thin-airfoil lift: c_l = a₀(α − α₀) with a₀ ≈ 2π·η_a (η_a ≈ 0.9–0.95 at these Re). Flap: Δα₀ = −τ·η_f·δ_f.
- **Flap effectiveness (thin-airfoil theory):**
  ```
  θ_h = arccos(1 − 2·x_h/c)          (x_h = hinge position from LE = (1 − E)·c,  E = c_f/c)
  τ   = 1 − (θ_h − sin θ_h)/π
  ```
  | E | τ |
  |---|---|
  | 0.20 | 0.55 |
  | 0.25 | 0.61 |
  | 0.30 | 0.66 |
  | 0.35 | 0.71 |
  | 0.40 | 0.75 |
  | 0.45 | 0.79 |

  Viscous/gap correction η_f ≈ 0.7 at |δ| < 10°, falling to ~0.5 at 15–20° (plain-flap empirical). With E = 0.30 this gives τ·η_f ≈ 0.46, matching [BZ09]'s measured 0.45.
- **Stall:** at Re 3–6×10⁵ with a 30% flap at +8–10°, usable c_l,max ≈ 1.1–1.4 (2D). 3D usable C_L,max ≈ 1.0–1.1 ([Bon25] take-off C_L ≈ 1.03). Section stall α ≈ 8–10° at zero flap. Soften near the flap limits: [Day19] found the simple models over-predict lift at δf = 6°.

### 7.2 3D lift and induced drag (deep water)
```
Helmbold lift slope:
  a = a₀ / ( sqrt(1 + (a₀/(π·AR))²) + a₀/(π·AR) )              [per rad]
Simple elliptic (as used by [Day19] model 1):
  C_L,3D = C_L,2D / (1 + 2/AR)
With thickness correction ([Bon25], Nobile 1954):
  C_L,3D = C_L,2D / (1 + 2·(1 + 0.77·t/c)/AR)
C_Di = C_L² / (π · e · AR)
```
Oswald e for tapered/swept planforms (Niţă & Scholz 2012, used in [Day19]; gives e = 0.97 for the Bladerider foil):
```
Δλ  = −0.357 + 0.45·exp(0.0375·Λ_deg)
f(λ) = 0.0524λ⁴ − 0.15λ³ + 0.1659λ² − 0.0706λ + 0.0119
e_theo = 1 / (1 + f(λ − Δλ)·AR)        (λ = taper ratio c_tip/c_root)
```
For optimisation, prefer a numerical lifting line (Prandtl/Weissinger, 20–40 stations; [Day19] used 21) or a VLM. These capture taper, twist, flap span and anhedral directly. The lifting line was more accurate than the 2D+correction model in [Day19].

### 7.3 Free-surface (depth) effects at high Froude number (image / biplane method)
At F_h ≳ 3 (V ≳ 5 m/s at h = 0.3 m), the free surface acts like a same-sign image vortex system at height 2h (the φ = 0 condition). The foil behaves like the lower wing of a biplane: lift slope falls and induced drag rises. Daskovsky (2000), as implemented in [Day19] model 2:
```
K(h/c) = (16·(h/c)² + 1) / (16·(h/c)² + 2)          2-D lift-slope factor (→1 deep, →0.5 at surface)
σ_fs(h/b) = 1 / (1 + 12·h/b)                          3-D biplane interference factor
a(h)   ≈ 2π·K / (1 + 2·K·(1+σ_fs)/AR)                 3-D lift slope near surface   [consistent form, EST]
C_Di(h) = (1 + σ_fs) · C_L² / (π·e·AR)
```
[Day19] prints the lift factor as (1 + 2/AR)/(1 + 2K(1+σ)/AR) applied to the 2D-corrected C_L (text partly garbled). The form above is the self-consistent lifting-line version. [Day19] reports this is similar to Wadlin's (NACA Rep. 1232) horseshoe-vortex model.

Examples:
- h/c = 3, h/b = 0.3: K = 0.993, σ = 0.22, so induced drag is +22%.
- h/c = 1, h/b = 0.1: K = 0.94, σ = 0.45.

Measured [Day19]: at h = 1.05 c̄ with flap 0°, lift and drag changed little from deep. At flap +6°, both dropped sharply. **At low lift, shallow running lowers total drag** because the strut is shorter. At high lift it raises drag. This is why sailors fly high.

### 7.4 Wave drag of the submerged foil (finite Froude number)
2-D Kotchin / point-vortex result (Daskovsky's approximation in [Day19], eq. 8; derived from D = ρ·g·Γ²/U²·e^{−2gh/U²} with Γ = ½·U·c·C_L):
```
C_Dw,2D = C_L² / (2·F_c²) · exp( −2·(h/c) / F_c² )      (based on planform area)
```
3-D foils give roughly 0.5× this at Moth aspect ratios **[EST, calibrate]**. Empirical Hoerner form used by [BZ09]:
```
C_Dw = C_L² · (c/h) · k_w ,   k_w measured = 0.022–0.039 (mean ≈ 0.025)
```
This is about half of Hoerner's prediction. ([Day19] eq. 3 quotes C_D/C_L² = 0.25 for this term, which looks like a transcription of a different normalisation. Use the measured 0.025.)

Example: at 20 fps, h = 18 in, the main foil wave drag was ~0.4 lb of 9.7 lb total. Negligible at speed, noticeable at take-off: F_c ≈ 4, h/c ≈ 3–6, hull still in the water.

### 7.5 Froude-depth regime
F_h = V/√(g·h):
- **F_h < ~1:** strong wave-making; the free surface behaves more like a rigid wall (opposite-sign image), which *raises* lift near the surface.
- **~1–3:** transitional; the wave drag peak near F_c ≈ 0.5–1 [Chap71].
- **F_h > ~3:** high-speed asymptote of §7.3.

Moth foiling at h = 0.2–0.4 m and V ≥ 4 m/s gives F_h ≈ 2–7. PUFFIn coefficients stop varying for F_c > 4–4.5, which holds for any foiling condition [Wal §3.2.2]. Take-off (V ≈ 4 m/s, deep foil) is transitional.

### 7.6 Viscous (profile) drag
```
Re = V·c/ν ;  ν_sea(15°C) = 1.19e-6, ν_fresh(20°C) = 1.00e-6 m²/s ; ρ_sea = 1025, ρ_fresh = 998 kg/m³
ITTC-57:              C_F = 0.075 / (log10 Re − 2)²
Transitional (Prandtl–Schlichting): C_F = 0.455/(log10 Re)^2.58 − 1700/Re   (floor at Blasius 1.328/√Re)
Form factor (Hoerner, wings):   FF = 1 + 2·(t/c) + 60·(t/c)⁴
  (alt. Raymer/Torenbeek:       FF = 1 + (0.6/(x/c)_tmax)·(t/c) + 100·(t/c)⁴)
C_D0 (planform-based) ≈ 2.04 · C_F · FF   (+ flap-gap ΔC_D 0.0012–0.0022, + junction, + roughness)
```

| Re | ITTC C_F | Transitional C_F |
|---|---|---|
| 3×10⁵ | 0.0062 | ~laminar (Blasius 0.0024) |
| 6×10⁵ | 0.00525 | 0.0021 |
| 1×10⁶ | 0.00469 | 0.0028 |

**Calibration targets (measured, Re ≈ 6×10⁵) [BZ09]:**
- Struts C_d = 0.0066–0.0104
- Lifting foil section + junction C_D = **0.0075–0.012** (rudders 0.0075–0.008 at C_L ≈ 0.18; daggerboards 0.010–0.012 at C_L ≈ 0.43)

Fully turbulent ITTC × FF over-predicts (≈ 0.013 for 11% thick). Fully laminar under-predicts. Use XFOIL polars (Ncrit 4) or a transition-point model tuned to these targets.
- A mould finish with pinholes and seams added **~25% drag** vs filled/faired/painted [BZ09]. Model this as a roughness/finish multiplier of 1.0–1.25.
- Include profile-drag growth with c_l: C_d(c_l) = C_d0 + k₂·(c_l − c_l,bucket)² outside the laminar bucket.

### 7.7 Junction (T-joint) and strut interference drag
Hoerner (Fluid-Dynamic Drag §8-11), as used by [BZ09] and [Day19]:
```
ΔD_junction = q · t̄² · C_Dt ,   C_Dt = 17·(t̄/c)² − 0.05     (t̄ = mean thickness of strut and foil at the joint; c = chord; floor C_Dt ≥ 0)
```
Example: t̄/c = 0.12 gives C_Dt = 0.195. Junction drag is < 10% of the foil section+junction drag [BZ09]. Fillets and a foil LE ahead of the strut LE reduce it. A bulb adds ~3% wetted area [Day19].

Strut-on-foil interference (Gibbs & Cox 1954, central strut; in [Day19]):
```
γ = 0.8·t_strut / b ;   C_L → C_L/(1+γ) ;   C_Di → (1+γ)²·C_Di
```

### 7.8 Spray (and wave) drag of the surface-piercing strut
All are per strut and per water-surface crossing. Valid for F_c ≳ 3, where wave drag is negligible and spray drag is independent of Froude number [Chap71].
```
Hoerner (t/x_tmax < 0.4):         D_spray = 0.24 · q · t²          (blunt bodies: 0.12 · q · t²)
Savitsky & Breslin:               D_spray = 0.03 · q · c·t + 0.08 · q · t²
Chapman (double-arc, 0.12<t/c<0.21):
   x_tmax/c = 0.65:  D = 0.003·q·c·t + 0.06·q·t²
   x_tmax/c = 0.50:  D = 0.011·q·c·t + 0.08·q·t²
   x_tmax/c = 0.35:  D = 0.009·q·c·t + 0.13·q·t²
   NACA 66-series:   D = 0.036·q·c·t − 0.03·q·t²
Coffee & McKann (NACA TN 3092, 12% 66-series, via [Day19]):  D = q · 0.0275 · c · t
Moth-measured (Beaver & Zseleczky 2009):  D_ws = C·q·t² with C = 0.26–0.38 (use 0.30)
```
Notes:
- The mechanism is mostly **skin friction of the spray sheet** on the strut above the waterline, so it is Re-dependent [Chap71].
- Blunter LEs throw spray higher and wet more strut. Sweep reduces spray drag per unit waterplane area.
- **Horizontal spray rails/fences substantially reduce spray drag** [Chap71]. Heel increases the waterplane cut length.
- For heel φ and rake ψ, use the waterplane section: effective c' ≈ c/cos(ψ_eff) and t' ≈ t, where ψ_eff is the angle between strut axis and vertical in the plane of motion.

### 7.9 Cavitation
```
σ = (p_atm + ρ·g·h − p_v) / (½·ρ·V²)       inception when −C_p,min ≥ σ
p_atm = 101 325 Pa ; p_v(15 °C) = 1.70 kPa, p_v(20 °C) = 2.34 kPa
```
Inception speed vs section suction peak (sea water, 20 °C; almost independent of h over 0.15–0.4 m):

| −C_p,min | 0.3 | 0.4 | 0.5 | 0.6 | 0.8 | 1.0 |
|---|---|---|---|---|---|---|
| V_i (kn) | 50 | 43 | 38.7 | 35.3 | 30.6 | 27.4 |

Approximate −C_p,min values **[EST, from Abbott & von Doenhoff velocity distributions; verify with XFOIL]**:
- Symmetric 6-series at zero lift: ≈ 2·t/c (0.20–0.26 for 10–13%)
- NACA 00xx: ≈ 0.35–0.41 at 12%
- NACA 63-412 at its design c_l 0.4: ≈ 0.5, rising steeply outside the bucket
- **Flap-up at high speed** (δ_f −5…−7°, α ≈ 1°) moves the suction peak to the **lower-surface leading edge**. The bucket's *lower* edge therefore sets the top-speed cavitation limit. Design the section bucket to span c_l ≈ 0–0.5 [Wal §4.3.4, cavitation bucket C_L vs −C_p,min].
- Other early sites: flap hinge gap and lower-surface cut-out, T-junction, and tip vortices. Tip-vortex inception scales roughly as σ_i ∝ C_L²·Re^0.35 (McCormick-type). It is mitigated by low tip loading (elliptic/washout) **[EST]**.

Practical implication: cavitation limits current Moths to the mid/high 30s kn, consistent with the ~36 kn records. A "high-speed" foil should keep −C_p,min ≤ ~0.55 over c_l 0.05–0.25.

### 7.10 Ventilation
- Ventilation needs a sub-atmospheric separated region plus an air path from the surface (strut LE/TE at yaw, heel, T-junction, or a tip near the surface). For surface-piercing hydrofoils (AR 1–1.5, F_h 0.5–2.5), steady-state inception needs large α (~15–20°+). Nose ventilation dominates at low F_h, tail ventilation at higher F_h. There is strong **hysteresis**: once ventilated, α must fall well below inception to wash out [Hwd].
- On Moths, unsteady triggers dominate: waves, crash/re-entry, sharp rudder angles, wand and main-strut wake ahead of the rudder strut, and foil tips breaching at heel [McL09]. Rudder strut ventilation propagating down to the elevator causes loss of pitch control and violent crashes [McL09].
- **Model rules [EST]:**
  1. Foil-tip clearance: h − (b/2)·sin φ − z_wave ≥ max(0.05 m, 0.5·c_tip). Otherwise apply tip-lift loss / ventilation.
  2. Strut ventilation flag: ventilate when |β_strut| (leeway + rudder angle + heel-induced yaw) > β_v(F_h), with β_v ≈ 10–15° for rounded-LE 10–12% struts. Keep ventilated until |β| < β_v − 5°.
  3. When ventilated, the strut loses ~70–90% of its side force and the attached foil loses 20–50% of lift near the root.
- Mitigation used: forward strut rake (~7°) [Day19; Bon25]; fences/anti-vent tips (Maguire); wand paddle [McL09]; anhedral/gull rudder tips kept away from the surface [Bon25]; rudder foil placed out of main-foil downwash.

### 7.11 Hull (pre-take-off) and windage
- Hull calm-water drag [BZ09 Table 1] collapses as R ≈ k·Δ·V² (2–14 fps, zero heel/yaw):
  - k' ≈ **5.6×10⁻³ s²/m²** (Δ ≥ 120 lb)
  - k' ≈ 7.0×10⁻³ (Δ = 60 lb)
  
  in R [N] = k'·Δ[N]·V²[m²/s²]. Hull drag with foil unloading "never exceeds 8 lb" [BZ09]. This gives the take-off hump [Bon25 Fig 7].
- Windage: D_aero = ½·ρ_air·CdA·V_A² with CdA ≈ 0.58–0.75 m² (2009 hull+racks+sailor, measured) or 0.45–0.65 (modern) **[EST]**. The sailor is ~42% of it [BZ09]. At 15 kn upwind, aero drag (17 lb) was ~70% of total hydro drag. **Aero matters as much as hydro upwind** [BZ09].

### 7.12 Sail/aero model for the Moth
Bögle et al. 2010 (from North Sails FLOW, Chris Williams), as fitted in [Wal Table A.2]. β_eff is the effective apparent-wind angle.

| β_eff (°) | C_L | C_D |
|---|---|---|
| 13.1 | 0.769 | 0.083 |
| 15.7 | 0.870 | 0.100 |
| 19.4 | 0.973 | 0.123 |
| 21.1 | 1.076 | 0.153 |
| 23.8 | 1.179 | 0.190 |
| 40 | 1.30 | 0.40 |
| 110 | 0.60 | 0.80 |
| 160 | — | 1.15 |
| 180 | 0 | 1.10 |

CE shifts:

| β_eff (°) | ΔX_CE (m) | β_eff (°) | ΔZ_CE (m) |
|---|---|---|---|
| 6 | +0.025 | 5 | −0.04 |
| 15 | 0 | 17 | −0.01 |
| 25 | −0.026 | 40 | +0.05 |
| 50 | −0.05 | 100 | +0.10 |
| 110 | −0.10 | 180 | +0.12 |
| 170 | −0.20 | | |

Depower (Hansen, used by Eggert/[Wal]): C_L = C_L,opt·P^0.7, with P ∈ [0, 1]. Add flat/twist induced drag: C_D = C_D0 + C_L²/(π·AR_eff) with geometric AR ≈ 5.2²/8.25 ≈ 3.3. A decksweeper foot sealed to the deck acts as an end-plate, so AR_eff ≈ 4.5–6 **[EST]**.

Forces:
```
F_drive = q_A · S · (C_L sin β_A − C_D cos β_A)
F_heel  = q_A · S · (C_L cos β_A + C_D sin β_A)
```
With windward heel φ, resolve F_heel into a horizontal component (cos φ) and a vertical (lift) component (sin φ).

Rig balance check **[EST]**: RM ≈ 1.25 kN·m, z_CE ≈ 3.2 m, so the max heeling force is ≈ 390 N. At AWS 20 kn (q_A ≈ 65 Pa) this needs C_L ≈ 0.73, so the rig must depower above ~20 kn AWS. Upwind AWS in medium/strong wind is 25–35 kn ([Seahorse]; Fletcher).

---

## 8. Design decision matrix

Legend: ↑ = increasing the variable. L/M/S = light (< 8 kn), medium (8–14), strong (15–25). "Model" = what the physics model must capture.

### 8.1 Horizontal foils

| Variable | Physical effect of ↑ | Light | Medium | Strong | Model / constraints |
|---|---|---|---|---|---|
| **Main area S** | Lower take-off speed (V_TO ∝ S^−½). Higher wetted area → profile drag ∝ S. Lower C_L at speed (off-design) | **Big win**: take-off is everything; hull hump | Neutral-to-negative once foiling | **Penalty**: C_L 0.05–0.15 at 25–35 kn; profile drag dominates; more lift to shed (control) | Need C_L,max·S ≥ W_main/(q_TO). Trend 1030 → 800 cm² [Bon25] |
| **Span b** (at fixed S) | Higher AR → induced drag ∝ 1/b². Root bending ∝ b. Tip clearance at heel ↓. Roll damping ↑ | **Big win** (induced drag ~25% of main T-foil drag at C_L 0.43 [BZ09]; efficiency gain largest at low speed [Bon25]) | Win | Smaller spans chosen (850–900 mm [Mk25]): tip breach at heel/waves, stiffness, less wetted area | Constraint: h − (b/2)sin φ ≥ margin; tip deflection; divergence |
| **AR** | As span. Higher AR → higher lift slope → more pitch/heave sensitivity to gusts | ↑ | ↑ (12–14) | Moderate (10–12); chord for Re and stiffness | Re at tips ≥ ~1.5×10⁵ (laminar-separation risk) |
| **Taper λ** | Lower λ → closer to elliptic with less root-chord penalty, lower tip Re, tip stall risk | ~0.35–0.45 | 0.35–0.45 | 0.4–0.5 (tip Re, robustness) | Oswald e (Niţă-Scholz) or lifting line |
| **Sweep Λ** | Aft sweep: bend-twist washout (gust load alleviation), weed shedding, lower lift slope (∝ cos Λ), spanwise flow, earlier tip stall | Small (0–5°) | 0–8° | 5–12° for load alleviation | Lifting line with sweep, or VLM. Aeroelastic coupling |
| **Twist (washout)** | Unloads tips, moves stall inboard, lowers tip-vortex cavitation, reduces induced efficiency off-design | −1…−2° | −1° | −1…−2° | Spanwise section α |
| **Dihedral/anhedral & tip shape** | Anhedral/gull keeps tips deeper at heel (less ventilation), stiffens (arch), adds wetted length. Dihedral tips: ventilation/stability claims (Maguire "upturned anti-vent tips"). Winglets: small induced gain, junction/interference drag | Mild anhedral | Mild anhedral | Anhedral helpful for heel/waves | Heel geometry + lift vector tilt. [Bon25] rudder anhedral depth 40–60 mm |
| **Section thickness t/c** | Thinner: lower profile, spray and junction drag; lower −C_p,min at low c_l; narrower cavitation bucket; lower stiffness (EI ∝ t³, GJ ∝ t³) | 11–13% OK (lift, stall margin) | 9–11% | 8–10% (drag, cavitation) if stiffness allows | Structure constraint. "Thinner is better, limit structural" [BZ09] |
| **Camber / design c_l** | Higher camber: more C_L,max, lower take-off speed, more drag and suction at low c_l (cavitation at flap-up) | High (design c_l 0.5–0.6; "high-lift" sections [Mk25]) | 0.3–0.4 | Low (0.1–0.25) | Section polar family; bucket centre |
| **Laminar vs turbulent section** | Laminar 6-series/Eppler: low drag at Re 3×10⁵–1×10⁶ if smooth. Sensitive to roughness, turbulence, waves; drag bucket may vanish (V2 strut [BZ09]) | Laminar helpful (low Re) | Laminar if finish is excellent | Robust (turbulent-tolerant); cavitation-shaped (e.g. H105-like) | Ncrit 4–6; roughness factor 1.0–1.25 |
| **Flap chord E** | Higher τ (0.66 at 30% → 0.75 at 40%), more control authority, larger C_L,max; higher hinge moment (wand force), more gap drag and pitching moment | 30–40% | 30–35% | 25–30% (enough to shed lift) | τ(E)·η_f, hinge moment → wand force balance |
| **Flap range** | +δ: take-off lift. −δ: shed lift at speed (safety-critical [BZ09]) | +10…+12 / −5 | +8 / −6 | +6 / −8…−10 | Clamp; cavitation at −δ |
| **Main incidence (relative to hull/strut)** | Sets flap angle needed at cruise. [Day19]: drag vs lift² collapses for α = 0–4°, so insensitive within a broad range | +2–3° (take-off without big flap) | ~+1–2° | 0–1° | Keep flap near 0° at design speed |
| **Rudder area S_r** | Pitch damping/restoring and control authority vs drag (2008 rudders "too large", > 50% of rudder drag was section+junction [BZ09]) | 0.040–0.045 (take-off pitch control) | 0.032–0.036 | 0.026–0.030 | Pitch balance (§6.3). S_r/S_m ≈ 0.40–0.47 |
| **Rudder span / AR** | High AR (15–16) → low induced drag, higher lift slope (more pitch stiffness per area) | 750–800 mm | 680–720 | 620–660 [Mk25] | Tip clearance at heel |
| **Rudder incidence / rake range** | Trims pitch balance with thrust; also gives elevator AoA | + (more lift at low speed) | ~0 | ≤ 0 (downforce possible) | Variable in optimiser per band: α_r ∈ [−4°, +5°] |
| **Main–rudder separation l_r** | Pitch stiffness ∝ l_r; limited by 500 mm gantry rule + hull length | Max | Max | Max | ≤ hull + 0.5 m |
| **Elevator vertical offset** | Reduces downwash/wake interaction; ventilation risk if too shallow | ~+0.1 m above main | same | same | [Bon25] |
| **T vs L/J configuration** | Rule 6.3.3 forces the main foil to exit the hull bottom below the static waterline, so centreline T (or inverted-T) is standard. L/J/V from the hull are theoretically possible but lose windward-heel side force symmetry and add waterplane crossings | T | T | T | Keep T; optionally allow asymmetric anhedral |
| **Stiffness (HM carbon)** | Higher E: thinner sections possible, lower tip deflection and twist; brittle; cost | HM | HM | HM + steel/Ti connections | See §8.3 |
| **Manufacturing tolerance** | Incidence shim scatter per assembly [Day19]; finish +25% drag [BZ09]; flap compliance > 2° [Day19] | — | — | Critical at high q | Add ±0.2° incidence noise, finish factor |

### 8.2 Vertical struts

| Variable | Effect of ↑ | Light | Medium | Strong | Model |
|---|---|---|---|---|---|
| **Strut chord c_s** | More side force per leeway (lower leeway), higher bending/torsion stiffness, higher Re; more wetted area and spray drag (c·t terms) | 110–120 mm (low-speed side force, take-off) | 100–110 | 90–100 | Side-force lift slope (low-AR strut, free-surface end), profile drag, spray |
| **Strut t/c** | Stiffness ↑ (t³); spray drag ∝ t² (Hoerner) ↑; junction drag ↑; ventilation margin (round LE) ↑ | 12–13% | 10–12% | 9–11% (steel lower section enables thin) | Hoerner/Chapman spray; strut Cd 0.007–0.010 |
| **Strut length** | Higher max ride height (less immersed strut = less drag) and more righting arm; more bending moment; more ventilation length | Needed for take-off clearance | Fly high | Long enough to clear waves; crash severity | Immersed length = f(ride height, heel, pitch) |
| **Rake (fwd)** | Anti-ventilation (air must travel against flow) [Day19]; changes foil incidence with pitch | 5–8° | ~7° | 7–10° | Couples rake to foil incidence |
| **Fences / spray rails** | Reduce spray drag and ventilation paths [Chap71] | optional | yes | yes | ΔD_spray × (0.6–0.8) **[EST]** |
| **Material (steel/Ti lower)** | Very thin, stiff, cheap to machine; heavy (7.8 g/cc steel) but mass is low-lying | — | MV-V4 400 mm steel | MV-V5 450 mm steel "for rougher water and higher winds" [Mk25] | E_steel 196 GPa, Ti 114 GPa |
| **Rudder strut** | Same trade-offs; plus steering authority and ventilation (most dangerous) | — | — | — | Ventilation flag + hysteresis |

### 8.3 Structural stiffness and aeroelasticity
- **Materials:**

  | Material | E | ρ (g/cc) |
  |---|---|---|
  | HM UD prepreg (M46J/M55J) | E₁ ≈ 230–300 GPa | 1.55–1.6 |
  | IM (T800/M40J) | ≈ 160–220 GPa | |
  | SM (T700) | ≈ 125–135 GPa | |

  G₁₂ ≈ 4–5 GPa for UD, so ±45° plies are needed for GJ. Steel 17-4PH: E ≈ 196 GPa, ρ 7.8. Ti-6Al-4V: E ≈ 114 GPa, ρ 4.43. [Lis] used UHM340/UDC300/XC400. Mackay: monolithic carbon foils, cure 80 °C [MkV3]. **[EST]** laminate values from typical supplier data.
- **Bending:** section I ≈ k_I·c·t³ with k_I ≈ 0.036–0.040 (NACA-like solid). Uniform-load cantilever semi-span: δ_tip = w·L⁴/(8EI).
  Example: c = 80 mm, t = 9 mm, E = 200 GPa (EI ≈ 430 N·m²), L = 0.5 m, 400 N per side gives δ ≈ 14 mm. Real tapered foils are stiffer at the root. **Target δ_tip ≤ 2–3% of semi-span at 1 g** **[EST]**. Dynamic loads reach 2–3 g in waves/landings.
- **Twist:** DIC tests on a Moth T-foil found twist cut the effective AoA by ~30% at higher speeds (Giovannetti/Banks et al., Southampton: https://eprints.soton.ac.uk/424432/; Procedia Eng. 147 (2016), https://www.sciencedirect.com/science/article/pii/S1877705816307445). Passive-adaptive bend-twist layups can give near-constant lift with speed (same group). **Model foil twist θ(y) = M_t/GJ.**
- **Torsional divergence** (uniform straight semi-span L, elastic axis e·c aft of the aerodynamic centre):
  ```
  q_D = π² · GJ / (4 · L² · a · e · c²)       → V_D = sqrt(2 q_D / ρ)
  ```
  Example **[EST]**: GJ ≈ 130 N·m² (solid, J ≈ 0.15·c·t³, G_eff ≈ 15 GPa), L = 0.5 m, a = 5.7/rad, e = 0.15, c = 0.08 m. This gives V_D ≈ 21 m/s ≈ **42 kn**, the same order as Moth top speeds. Aft sweep, a forward elastic axis (thick forward spar or Ti/steel core), and ±45° plies raise V_D. The flap-down pitching moment (nose-down) is stabilising. Forward sweep is destabilising. **Enforce V_D ≥ 1.3 × V_max.**
- **Strut bending:** 8.1 N/mm lateral stiffness at 1.06 m (Voodoo) [Lis]. Model the strut as a cantilever from the hull. Tip lateral deflection and twist change foil yaw/roll and elevator incidence (rudder).
- **Control-linkage compliance:** the pushrod bends; > 2° of flap error at high load [Day19]. Model flap δ_eff = δ_cmd − H_f/k_link (hinge moment over linkage stiffness).

---

## 9. Recommended optimiser envelopes and baselines

### 9.1 Global constants (baseline)
| Parameter | Value | Range for sensitivity |
|---|---|---|
| Boat all-up mass | 33 kg | 28–45 |
| Sailor mass | 75 kg | 60–95 |
| Total | 108 kg (W = 1059 N) | 90–135 |
| Sail area | 8.25 m² | fixed |
| CE above deck | 2.1 m **[EST]** | 1.9–2.4 |
| Sailor lateral arm | 1.35 m | 1.2–1.5 |
| Windage CdA | 0.55 m² **[EST]** | 0.45–0.75 |
| Water | sea ρ 1025, ν 1.19e-6 (15 °C); fresh (Garda) ρ 998, ν 1.0e-6 | |
| Main strut forward rake | 7° | 3–10 |
| Main–rudder foil separation | 2.3 m | 2.0–2.6 (rule-limited) |
| Main foil x from bow | 1.45 m | 1.3–1.6 |

### 9.2 Design-variable bounds (hard bounds for the optimiser)

**Main foil**
| Variable | Min | Max | Notes / source |
|---|---|---|---|
| Span b | 0.80 m | 1.20 m | Mackay 850–990; Maguire 1040; AST 1150; [Bon25] explored 900–1150 |
| Area S | 0.055 m² | 0.110 m² | 2022 commercial 800 cm²; HB 1030; [Bon25] 850–1050 (130 kg boat) |
| AR (derived constraint) | 8 | 17 | |
| Root chord (excl. bulb) | 0.075 m | 0.130 m | 107–125 mm published |
| Taper λ = c_tip/c_root | 0.25 | 0.60 | Bladerider ~0.36 |
| Planform shape parameter (ellipticity, [Bon25] Δ) | 25% | 75% c_root | [Bon25] |
| ¼-chord sweep | −3° | +12° | |
| Washout (root→tip) | −3° | +1° | |
| Dihedral (+) / anhedral (−) | −8° | +5° | or tip gull depth 0–60 mm |
| t/c root | 0.08 | 0.14 | |
| t/c tip | 0.07 | 0.12 | |
| Max camber | 0% | 4.5% | design c_l 0.1–0.6 |
| Flap chord fraction E | 0.20 | 0.45 | [Bon25] 25–45% |
| Flap span fraction | 0.60 | 1.00 | |
| Flap limits δ_min / δ_max | −12° / +6° | −4° / +15° | operational −8…+12 |
| Incidence (vs hull datum) | −1° | +3.5° | |
| Bulb length / diameter | 0 / 0 | 0.20 m / 0.035 m | "super small low drag bulbs" |

**Rudder elevator**
| Variable | Min | Max | Notes |
|---|---|---|---|
| Span b_r | 0.55 m | 0.85 m | Bieker 630–770; Maguire 765; AST 800 |
| Area S_r | 0.022 m² | 0.050 m² | RX1.2 375 cm²; AST 400 |
| AR_r | 10 | 18 | |
| S_r/S_m | 0.30 | 0.55 | modern 0.40–0.47 |
| Root chord | 0.045 m | 0.080 m | |
| Taper | 0.30 | 0.70 | |
| t/c | 0.08 | 0.12 | |
| Camber | 0% | 3% | E393-type used in [Bon25] |
| Anhedral/gull depth | 0 | 80 mm | AST 40–60 |
| Rake trim (incidence) range | −4° | +5° | per wind band variable |

**Struts**
| Variable | Min | Max |
|---|---|---|
| Main strut length below hull | 0.90 m | 1.20 m |
| Main strut chord | 0.080 m | 0.130 m |
| Main strut t/c | 0.09 | 0.15 |
| Rudder strut length (gantry to foil) | 1.00 m | 1.40 m |
| Rudder strut chord | 0.075 m | 0.120 m |
| Rudder strut t/c | 0.09 | 0.14 |

**Control / attitude (operational variables, per wind band)**
| Variable | Min | Max |
|---|---|---|
| Wand length | 0.80 m | 1.40 m |
| Gearing K_g (flap deg per wand deg) | 0.10 | 0.60 |
| Ride height (foil ¼-chord depth) | 0.10 m | 0.60 m |
| Windward heel (upwind) | 0° | 25° |
| Pitch | −2° | +5° |

**Hard constraints to apply**
1. Lift = weight (heave) and pitch-moment balance (§6.3).
2. C_L,main ≤ 0.9·C_L,max at take-off.
3. Tip clearance h − (b/2)·sin φ ≥ max(0.05 m, 0.5·c_tip).
4. Cavitation: −C_p,min(c_l, section) < σ(V, h) at V_max per band.
5. δ_tip ≤ 3% semi-span at 2 g **[EST]**.
6. V_divergence ≥ 1.3·V_max.
7. Strut ventilation margin |β| < β_v.
8. Re_tip ≥ 1.5×10⁵ at take-off.
9. Rule limits: beam 2.25 m, gantry ≤ 0.5 m beyond hull.

### 9.3 Recommended baseline designs per wind band **[EST, anchored to §3–§5 data]**

| | **Light (< 8 kn)** | **Medium (8–14 kn)** | **Strong (15–25 kn)** |
|---|---|---|---|
| Design TWS | 7 kn | 11 kn | 18 kn |
| Main span b | **1.10 m** | **1.00 m** | **0.88 m** |
| Main area S | **0.095 m²** | **0.082 m²** | **0.068 m²** |
| AR | 12.7 | 12.2 | 11.4 |
| Root / tip chord (excl. bulb) | 115 / 45 mm | 105 / 42 mm | 97 / 40 mm |
| Mean chord | 86 mm | 82 mm | 77 mm |
| Taper | 0.39 | 0.40 | 0.41 |
| ¼-chord sweep | 3° | 5° | 8° |
| Washout | −1.5° | −1° | −1.5° |
| Dihedral | 0° (tips −3°) | 0° (tips −3°) | −2° (gull) |
| t/c root → tip | 12% → 10% | 11% → 9% | 10% → 8.5% |
| Camber / design c_l | 3.5% / 0.55 | 2.5% / 0.35 | 1.5% / 0.2 |
| Flap E / span fraction | 0.35 / 0.9 | 0.32 / 0.9 | 0.28 / 0.85 |
| Flap limits | −6 / +12° | −7 / +10° | −9 / +7° |
| Incidence | +2.5° | +1.5° | +0.5° |
| Take-off V (C_L 1.05, 80–85% share, 108 kg) | 4.1 m/s (7.9 kn) | 4.5 m/s (8.8 kn) | 5.1 m/s (9.9 kn) |
| Rudder span b_r | **0.78 m** | **0.70 m** | **0.63 m** |
| Rudder area S_r | **0.040 m²** | **0.034 m²** | **0.028 m²** |
| Rudder AR | 15.2 | 14.4 | 14.2 |
| Rudder root / tip chord | 70 / 32 mm | 65 / 30 mm | 60 / 28 mm |
| Rudder t/c, camber | 10%, 2% | 10%, 1.5% | 9%, 1% |
| Rudder gull depth | 40 mm | 45 mm | 50 mm |
| Rudder incidence trim range | 0…+4° | −2…+3° | −4…+2° |
| Main strut length / chord / t/c | 1.10 m / 110 mm / 12% | 1.10 m / 105 mm / 11% | 1.10 m / 100 mm / 10.5% (steel lower 450 mm) |
| Rudder strut length / chord / t/c | 1.25 m / 100 mm / 11% | 1.25 m / 95 mm / 11% | 1.25 m / 92 mm / 10% |
| Main strut rake | 7° | 7° | 8° |
| Ride height (foil depth) target | 0.35–0.45 m | 0.20–0.30 m | 0.25–0.40 m (waves) |
| Windward heel upwind | 10–15° | 15–20° | 15–25° |
| Wand length / gearing | 1.2 m / 0.30 | 1.1 m / 0.25 | 1.0 m / 0.35 (faster in chop) |
| Expected upwind / downwind BS | 10–13 / 13–17 kn | 14–18 / 19–25 kn | 17–21 / 25–33 kn |

Commercial analogues:
- Light: Bieker MH-V6 (990 mm) + RH-V3 (700); Maguire FX2.2 (1040 mm, 815 cm²) + RX1.2 (765 mm, 375 cm²)
- Medium: Bieker MH-V5/V8 (950/900) + RH-V4 (657)
- Strong: Bieker MH-V9 (850 mm, −23% area vs V5) + RH-V5 (630)

### 9.4 Validation targets for the physics model
1. [BZ09] daggerboard T-foil at 20 fps (6.10 m/s), 18 in immersion, 180 lb (801 N) lift: total drag 9.7–10.3 lb (43–46 N). Rudder T-foil at 60 lb (267 N): 5.3–5.9 lb (23–26 N). Component split as in §5.
2. [BZ09] raw polar, HB daggerboard, 20 fps, 18 in, flap 0: α = 0,1,2,3,4,5,6° gives L = 6, 39, 76, 124, 163, 208, 275 lb and D = 6.9, 7.1, 7.2, 8.5, 9.7, 11.5, 15.9 lb (Appendix A).
3. [Day19]: Bladerider foil (§3.1 table) at 0.5–4.5 m/s, h = 457 mm and 100 mm, α 0–6°, δf −6…+6°. Drag area vs lift area² should collapse for α 0–4°.
4. [Lis] Voodoo main foil CFD at 20 kn, h = 150 mm, trim 0°: L = 1406 N, D = 117 N. At trim 2° bow-down: L = 576 N, D = 102 N. Heel 15° reduces lift ~10% and adds 346 N windward side force.
5. Speed checks: take-off 7–9 kn boat speed in 6–8 kn TWS. Upwind ≈ TWS to 1.3×TWS in 8–15 kn. Top speed 30–36 kn in 20–25 kn TWS.

---

## 10. Open gaps / caveats
- Current manufacturer areas, chords and sections (Exploder, Mach2 2.4/2.41, Swift, Maguire FX2.5/3.2, Ninja, Beacon, Onyx/"Pheonix") are **not public**. Only Mackay spans and relative areas, Maguire FX2.2/RX1.2 (through [Wal]) and academic designs are published. Treat §9.3 as a physically consistent starting point, not a copy of any product.
- The Findlay & Turnock VPP papers and the Eggert DVPP thesis could not be downloaded (bot-blocked). Only their abstracts and results as cited by [Wal]/[Day19] were used.
- Rudder load share in real sailing is not directly measured anywhere found. Model it from moment balance rather than a fixed %.
- Cavitation −C_p,min values and structural laminate properties are estimates. Compute −C_p,min per section in the app with a panel method (XFOIL-like) and flag it.
- The ventilation model is heuristic. Steady-state inception data [Hwd] are for low-AR surface-piercing foils, not thin Moth struts in waves.
