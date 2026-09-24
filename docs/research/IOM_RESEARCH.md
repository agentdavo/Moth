# IOM research notes

Sources behind every number in the IOM Keel Lab (`iom.html`, `src/iom/**`). Accessed September 2026.
Where a source could not be reached (Cloudflare block, paywall) this is stated, and only what was visible is used.

## 1. Class rules (IOM Class Rules 2026, effective 1 March 2026)

Source: IOM ICA, *International One Metre Class Rules 2026 – Release 2*,
https://iomclass.org/wp-content/uploads/2026/04/IOM-Class-Rules-2026-Release-2.pdf
(notes on the 2026 changes: https://iomclass.org/wp-content/uploads/2026/04/IOM-Class-Rules-2026-Notes.pdf;
history: https://iomclass.org/wp-content/uploads/2026/04/IOM-Class-Rules-History-2026-Revision.pdf).
The 2026 revision only changed wording (vang definition), the MoU with IRSA, sail-number references and a
jib batten-point clause; none of the limits below changed.

| Item | Limit | Rule |
|---|---|---|
| Draft (floating in fresh water) | 370 mm min, **420 mm max** | C.4.1 |
| Hull depth (canoe body) | ≤ 60 mm | C.4.1 |
| Hull length | ≤ 1000 mm | C.4.1 |
| Boat weight, dry | **≥ 4000 g** | C.4.2 |
| Keel (fin + bulb) excl. fasteners | **2200–2500 g** | C.6.4 |
| Rudder incl. stock | ≤ 75 g | C.6.4 |
| Keel largest transverse dimension, except the lowest 60 mm | ≤ 20 mm | E.4.1 — so **the bulb has to fit inside the lowest 60 mm**, i.e. bulb height ≤ 60 mm; width is free |
| Appendage material density | ≤ lead, 11 340 kg/m³ | E.3.1 |
| Keel may not move/rotate except by flexing | — | C.6.3 |
| One keel and one rudder per event | — | C.6.2 |
| Correctors fixed in/on the hull | — | C.4.3; mast correctors C.7.3 |
| Hull: no fibre stiffer than glass, no foams/honeycombs | — | D.2.1 |
| Spars: aluminium alloys or wood; mast Ø ≥ 10.6 mm | — | F.3.1, F.3.4 |
| Mast lower→upper point A / B / C | 1600 / 1180 / 880 mm | F.3.4 |
| Lower point above deck limit mark | 60–100 mm | C.7.4 |
| Radio: one rudder unit (rudder only), one sheet unit (main + jib sheets only); no automation, no telemetry except link/battery | — | C.5.4, D.2.5 |

Sail dimensions (G.3.3 main, G.4.3 headsail; mid-tolerance values used, mm):

| Rig | Main leech / foot / ¼ / ½ / ¾ width | Jib luff / leech / foot / ½ width | Area (Simpson, this lab) |
|---|---|---|---|
| A | 1615 / 355 / 310 / 240 / 140 | 1325 / 1250 / 380 / 190 | 0.357 + 0.242 = **0.60 m²** |
| B | 1205 / 345 / 300 / 230 / 135 | 985 / 905 / 345 / 170 | 0.258 + 0.158 = **0.42 m²** |
| C | 915 / 315 / 270 / 210 / 120 | 735 / 660 / 295 / 145 | 0.177 + 0.099 = **0.28 m²** |

(All Radio Sailboats lists the total A-rig area of current designs as 6000 cm², which agrees:
https://www.allradiosailboats.com/design/britpop, https://www.allradiosailboats.com/design/kantun2.)

## 2. Typical designs and weights

* **Weight budget (Italiko, FIN 26, 2003)** — A. Wallin, http://www.anderswallin.net/wp-content/2003_07/IOMWeightBudget2003july.pdf:
  hull incl. deck & fittings 623 g; radio etc. (winch 133 g, rudder servo 45 g, NiMH 145 g, Rx 23 g, patches and plates 58 g);
  correctors 120 g → hull group 1147 g. Fin 108 g (7 % t/c, SAILSetc), **bulb 2387 g, 340 mm long** → keel 2495 g.
  Rudder 55 g. Each rig 312–314 g. Boat 4009–4011 g.
* **Bulb fineness history** — G. Bantock in *Seahorse* Feb 2009 (https://www.onemetre.net//othertopics/iomcomparisons/SeahorseArticle.pdf):
  the TS2 used L/D ≈ 7 from 1994 while most designs were ≈ 5; Bantock fitted Hoerner's low-speed body data, found drag
  falling steadily with L/D, and "during 1998 began to use ballasts with L/D ratios around 10 and this has since become the norm".
* **Hull form** (same article): the "safe" design space in 2009 was 190–240 mm maximum beam with **170–190 mm waterline beam**;
  canoe-body displacement 3.62 kg for a 4.01 kg boat; minimum practical canoe-body wetted area ≈ **0.142 m²** at 160 mm WL beam
  (0.137 m² theoretical at 990 mm × 160 mm). Righting arm at 40° (No 1 rig, standard weights, Hydromax, free trim):
  **115 mm at 135 mm WL beam with no form stability, +25 mm per +50 mm of WL beam.**
* **Righting arms of named designs** — Gilbert & Bantock, "Stiffness", AMYA MY #173 (https://www.onemetre.net/Design/Stiffness%20(AMYA%20MY%20173)/Stiffness.htm):
  TS2 158 mm, Pikanto 134 mm, Scharmer 117 mm at 40°; "almost all bulbs are around 2.35–2.4 kg"; for normal IOM hulls
  "it is reasonable to consider M as a fixed point"; M ≈ 20 mm (narrow) to 90 mm (TS2) above the WL. CE of the A rig ≈ 740 mm.
  (The quoted "VCG ≈ 90 mm below the WL" is not consistent with the quoted GZ values and M heights; this lab follows the
  Hydromax GZ numbers.)
* Current designs (Britpop, Kantun, Venti, Sedici, V11, Alioth): LOA = LWL ≈ 1000 mm, beams 160–190 mm (All Radio Sailboats pages
  above; the Britpop entry lists 120 mm, which looks like an error). No manufacturer publishes bulb/fin weights; builders'
  practice (Wallin; Cameron; Bantock) is a keel at or near 2500 g with a 300–350 mm bulb.
* **Bulb sizes in use** — G. Cameron (TS2 designer), "Bulb size & shape", onemetre.net/Design/Bulbsize: TS2 bulb 300 mm × 41 mm
  (13.7 % t/c, NACA 4-digit); he later preferred 360 mm × 36.4 mm; "the long thin bulb produces 41 % less drag than an
  equivalent E520 bulb" at 1 kn (XFOIL); a boat with the new bulb was 4–6 lengths faster down a run in 10 kn.
* Oval bulb: Bantock tried a flattened version of his standard bulb in 2003, "about as good on the beat, not quite as good on
  the run" (onemetre.net/Design/OvalBulb).
* Bulb calculator practice (Majic's BulbCalc via Gilbert): a NACA 0015 bulb of 2.4 kg is ~280 mm long with 252 cm² wetted area.

## 3. Measured speeds and resistance (what exists)

No published GPS polar of an IOM was found (searches of IOMICA, MYA, AMYA, onemetre.net, radiosailingtechnology.com,
sailboatrc.com, nigelbarrow.co.uk). IRSA/IOM rules forbid telemetry while racing (C.5.4(e)), so speed data come from
private loggers. What exists:

| Quantity | Value | Source |
|---|---|---|
| "Hull speed" 1.34 √LWL(ft) | 1.23–1.25 m/s | Gilbert, Simple VPP and Wind-tunnel pages, onemetre.net |
| Marblehead (LWL ~1.27 m) timed upwind at ~30° heel | 1.45 m/s → Froude-scaled to an IOM ≈ 1.28 m/s | L. Robinson, "Fin area", onemetre.net/Design/FinArea |
| Gilbert's scaled spreadsheet VPP | 1.17 m/s on a reach at the top of the A range | onemetre.net/Design/VPP/PoorVPP.htm |
| IOM Re | 5e5 at ~1.5 kn, 1e6 at ~3 kn; "measured skin friction at least 30 % more than anticipated"; measured drag close to theory below 1.5 kn and rising sharply above | radiosailingtechnology.com, "Drag measurements on an IOM" and "Estimating the hull drag of an IOM yacht (Aug 2014)" — **pages blocked by Cloudflare; only the search-engine extracts were readable** |
| Bulb tow tests (SAILSetc Fraktal, falling-weight tow, Southampton Lamont tank) | 250 → 300 → 350 mm bulbs: +1.4 % / +1.9 % speed at 0.5 m/s, +0.6 % / ~+0.6 % at 1.0 m/s; SE ~0.15 % | Gilbert & Bantock, "IOM bulb drag", AMYA MY #184, onemetre.net |
| Fin wetted-area tow tests (RG65, 245 vs 270 cm² fin, +2.3 % of total wetted area) | −4.7 % (0.45 m/s), −3.8 % (0.65 m/s), −0.7 % (1.2 m/s) | Gilbert & Bantock, "Wetted surface area", AMYA MY #183 |
| Laser dinghy tank vs Delft method | Delft under-predicts Rr by up to 8–9 % at Fn 0.25–0.43; bow-down trim cuts wetted area 8–10 % but costs Rr above ~2.5 kn; immersed-transom stern trim +30 % at 4.5 kn | Day & Nixon, IJSCT 2014, https://strathprints.strath.ac.uk/46407/ |

## 4. Resistance methods valid at model scale

* **Friction.** ITTC-1957 line Cf = 0.075/(log Re − 2)², Re on 0.7 LWL (Delft/ORC convention; Keuning & Katgert 2008 as
  described by Day & Nixon 2014). Hull Re at 0.5–1.5 m/s is 3e5–9e5, so a laminar forebody is plausible; transition is
  uncertain (Gilbert, "Boundary layer": transition "somewhere between Re 1e5 and 1e6"; Seahorse 2009: "below Re ~1e6 laminar
  flow is almost automatically achieved"). Composite laminar/turbulent Cf (Prandtl–Schlichting): Cf = Cf_T(Re) −
  (Re_tr/Re)(Cf_T(Re_tr) − 1.328/√Re_tr).
* **Residuary.** Delft Systematic Yacht Hull Series (Gerritsma, Onnink & Versluis 1981; Keuning & Sonnenberg 1998;
  Keuning & Katgert 2008), valid Fn 0.10–0.60/0.75 and parameter ranges (Day & Nixon Table 3): LCB 0.500–0.579,
  Cp 0.521–0.580, ∇^(2/3)/Aw 0.079–0.265, BWL/LWL 0.170–0.366, BWL/Tc 2.46–19.38, Cm 0.646–0.790,
  ∇^(1/3)/LWL 0.120–0.230. A typical IOM (∇c^(1/3)/LWL ≈ 0.155, BWL/LWL ≈ 0.18, BWL/Tc ≈ 3.2, Cp 0.55–0.58) sits
  **inside** the series in form, but far below it in Reynolds number (the series was tested at Re ~ 5e6).
  - Used here: the **ORC residuary surfaces** Rr/W (Fn, LVR, BTR), which are built on the DSYHS plus ORC tank data,
    from the MIT-licensed Python-VPP distribution (https://github.com/marinlauber/Python-VPP, `dat/ORCi_Drag_Surfaces.csv`;
    the file's rows are LVR and columns BTR, "RRmult(lvr_i, btr_j)"; Python-VPP's interpolator appears to assign the axes
    the other way round, which we did not copy).
  - Alternative (sensitivity only): own log-linear regression of the 308 Delft Series 1 runs (UCI data set 243,
    https://archive.ics.uci.edu/dataset/243/yacht+hydrodynamics), `tools/iom-fit-delft.mjs`. Series 1 covers LVR 4.34–5.14
    only, and its Rr includes the form effect, so it is used with 1+k = 1.0 and only as the "high-Rr" alternative.
* **Heel and trim.** No IOM data. Heel adds a quadratic Rr increment (assumed 15 % at 30°). Bow-down dynamic trim from the sail
  pitching moment (drive × CE height / Δ·g·BM_L) is modelled because IOMs nosedive downwind (radiosailingtechnology.com
  "Nosediving" page title; Barrow's rig-change rule "sail downwind without submerging the boat",
  https://www.nigelbarrow.co.uk/post/thought-for-the-day-wind-ranges-for-iom-rigs).
* **Appendage profile drag at Re 3e4–2e5.** UIUC low-speed tests: M. Selig et al., *Summary of Low-Speed Airfoil Data*
  Vol. 1 (1995), https://m-selig.ae.illinois.edu/uiuc_lsat/Low-Speed-Airfoil-Data-V1.pdf, Appendix B, SD8020 (10.1 %
  symmetric) clean runs at Re 61 400 / 101 700 / 203 500 / 305 200. Read values (cd at |cl| = 0 / 0.3 / 0.6):
  0.0155 / 0.0165 / 0.020; 0.0102 / 0.0133 / 0.0175; 0.0085 / 0.0097 / 0.0135; 0.0074 / 0.0087 / 0.0120.
  Lift slope ≈ 6 /rad for Re 1e5–3e5; c_l,max ≈ 0.78–0.83. Selig et al. §3.5: symmetric tail sections (NACA 0009,
  64A010, SD8020) show a lift "dead band" around zero lift from the interplay of upper/lower laminar separation bubbles;
  zig-zag trips at 25 % chord remove it above Re 8e4. NACA 0009 c_l,max 0.7–0.8 at Re 4e4–1e5 (Robinson, quoting Selig,
  Donovan & Fraser, *Airfoils at Low Speeds*, 1989). Laminar-flow and thick sections are prone to laminar separation at IOM Re
  (Cameron; Seahorse 2009 on low-Re section design).
* **Fin sizing criterion.** Robinson ("Fin area", onemetre.net): design c_l ≈ 0.2 (up to 0.3), because the fin must keep
  reserve lift coming out of a tack at 1 kn (Re ≈ 25 000) and at higher heel.
* **Bodies of revolution.** Hoerner, *Fluid-Dynamic Drag* (1965) §6: C_D,wet = Cf [1 + 1.5 (d/l)^1.5 + 7 (d/l)^3];
  wall-junction interference ΔC_D(t²) = 0.75 t/c − 0.0003/(t/c)² (§8), reduced by fillets; low-Re bodies suffer laminar
  separation on the afterbody (the reason the long-bulb trend holds at IOM Re, Bantock 2009; Cameron).
* **Wetted area and hydrostatics.** Canoe-body wetted area (DSYHS regression): Sc = (1.97 + 0.171 B/T)(0.65/Cm)^(1/3)(∇L)^(1/2);
  Morrish KB; transverse waterplane inertia C_IT = 0.1216 Cwp − 0.041 (PNA approximation), multiplied by 0.77 in this lab to
  match Bantock's Hydromax GZ trend.
* **Induced drag.** Munk's stagger theorem for two lifting lines (fin, rudder) with the hull bottom as a reflection plane;
  heel reduces the effective span; the bulb acts as a partial end plate (assumption k = 0.5 × bulb width / fin span).

## 5. Model-yacht sail aerodynamics and wind

* **Southampton University low-speed tunnel, IOM A rig** (W. Woodhead; R. Nicholls-Lee; reported by L. Gilbert,
  https://www.onemetre.net/Design/Windtunl/Windtunl.htm and https://www.onemetre.net/Design/WindRNL/WindRNL.htm):
  4.3 m/s apparent, "pretty much towards the top of the A rig wind speed range". At AWA 30°: drive 2.5–3.5 N, heel force up to
  10 N; best Cl ≈ 1.3 with Cd ≈ 0.25; at AWA 40° Cl ranged 0.66–1.34 with sheeting and Cd rose 0.22 per unit Cl; at 70° Cl ≈
  1.34, Cd ≈ 0.48 (slot open); beam reach drive ≈ 10 N; goose-winged running gave considerably more drive than not.
  Drive/heel is most sensitive to sheeting at low wind speed (Nicholls-Lee).
* **Coefficient shape.** Hazen (1980) main/jib tables as used by IMS/ORC VPPs (see Larsson, Eliasson & Orych, *Principles of
  Yacht Design*), re-scaled to the tunnel points above.
* **Wind gradient.** Log law U = u*/κ ln(z/z0) (Ruggles 1970, J. Appl. Meteorol. 9, 389–395), used for IOMs by Gilbert
  (https://www.onemetre.net/Design/Gradient/Gradient.htm): with 5.5 m/s free wind the IOM sees ~4.1 m/s at the masthead,
  3.5 m/s mid-mast and ~2 m/s at the boom. This lab uses Charnock roughness z0 = 0.011 u*²/g + 0.11 ν/u*.
* **Rig wind ranges from practice.** Barrow: A 0–15 kn, B 15–23 kn, C 23+ kn, "use a rig until you see your rudder", and
  whether you can sail downwind without submerging the boat. Height of those wind readings is not stated (bank-side hand
  anemometers or forecasts). Gilbert's tunnel/spreadsheet numbers put the top of the A range much lower (≈ 4.3 m/s apparent
  upwind ≈ 3.2 m/s true at rig height).

## 6. Optimisation

sep-CMA-ES (Ros & Hansen 2008) from the Moth lab (`src/physics/optimizer.js`), unit-cube variables, penalty constraints.
