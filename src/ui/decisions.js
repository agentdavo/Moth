// Design-decision matrix for Moth foils (condensed from docs/research/MOTH_FOIL_RESEARCH.md §8)
// with a pointer to where each effect lives in this app's physics model.
export const DECISIONS = [
  { t: 'Main foil area S', eff: 'Take-off speed ∝ S^-½; profile drag ∝ S; C_L at top speed drops to 0.05–0.15', L: 'Big win: take-off and the hull hump decide light-air races', M: 'Neutral once foiling', S: 'Penalty: profile drag dominates at 25–35 kn; more lift to shed', model: 'VLM + strip drag; take-off solver; min-foiling TWS (hull hump)' },
  { t: 'Span b (fixed S) / aspect ratio', eff: 'Induced drag ∝ 1/b²; root bending ∝ b; tip clearance at heel ↓; lift slope ↑ (gust sensitivity)', L: 'Big win (induced ~25% of T-foil drag at C_L 0.4)', M: 'Win (AR 12–14)', S: 'Shorter (0.85–0.90 m): tip breach at heel, stiffness', model: 'VLM induced drag incl. free-surface image; tip-clearance rule h − b/2·sinφ ≥ max(0.05, c_tip/2); bending & divergence' },
  { t: 'Taper & planform ellipticity', eff: 'Low λ / elliptic → e → 1 with less root penalty; tip Re drops, tip-stall risk', L: 'λ 0.35–0.45, bi-elliptic', M: 'λ 0.35–0.45', S: 'λ 0.4–0.5 (tip Re, robustness)', model: 'Chord law blend trapezoid↔ellipse; spanwise cl vs elliptic chart; Re per strip' },
  { t: 'Sweep Λ', eff: 'Aft sweep: bend–twist wash-out (gust relief), weed shedding, lower lift slope, earlier tip stall', L: '0–5°', M: '0–8°', S: '5–12° for load alleviation', model: 'Swept lifting lines in VLM; sweep raises divergence speed' },
  { t: 'Twist (wash-out)', eff: 'Unloads tips, moves stall inboard, lowers tip-vortex cavitation; small induced penalty off-design', L: '−1…−2°', M: '−1°', S: '−1…−2°', model: 'Per-strip incidence in VLM RHS' },
  { t: 'Dihedral / anhedral / gull tips', eff: 'Anhedral keeps the leeward tip deeper at windward heel; arch stiffens; adds wetted length', L: 'Mild anhedral', M: 'Mild anhedral', S: 'Anhedral for heel + waves (rudder gull 40–60 mm)', model: 'Heeled world-frame lattice; breached panels dropped; lift vector tilt gives side force' },
  { t: 'Section thickness t/c', eff: 'Thinner: less profile/spray/junction drag, lower suction at low c_l, narrower cavitation bucket, EI & GJ ∝ t³', L: '11–13% (lift, stall margin)', M: '9–11%', S: '8–10% if stiffness allows', model: 'Form factor, Cp_min(t/c), I = 0.036·c·t³, J = 0.14·c·t³' },
  { t: 'Camber / design c_l', eff: 'More C_L,max and lower take-off speed; more drag & suction at low c_l (flap-up cavitation)', L: 'High (c_l 0.5–0.6)', M: '0.3–0.4', S: 'Low (0.1–0.25)', model: 'α0 = −c_li/2π in VLM; drag bucket centred on c_li (+80% of flap Δc_l)' },
  { t: 'Laminar vs turbulent section', eff: 'Laminar buckets give low drag at Re 3e5–1e6 if the finish is perfect; sensitive to roughness and waves', L: 'Laminar (low Re)', M: 'Laminar if finish excellent', S: 'Robust / cavitation-shaped', model: 'Section families (NACA 4 / 63 / 66 / Eppler): x_tr, bucket width, finish factor' },
  { t: 'Flap chord fraction E', eff: 'τ 0.66 @30% → 0.75 @40%; more authority & C_L,max; more hinge moment (wand force), gap drag and Cm', L: '30–40%', M: '30–35%', S: '25–30%', model: 'Thin-aerofoil τ(E) × viscous η_f (0.70 → 0.5 above 10°), calibrated 2.2° flap ≈ 1° AoA' },
  { t: 'Flap range', eff: '+δ: take-off lift. −δ: shedding lift at speed (safety critical)', L: '+10…+12 / −5', M: '+8…+10 / −6…−7', S: '+6…+7 / −8…−10', model: 'Trim feasibility: “flap max” limits take-off, “flap min” limits top speed' },
  { t: 'Main incidence', eff: 'Sets the flap angle at cruise; keep flap near 0° at design speed for the lowest drag', L: '+2–3°', M: '+1–2°', S: '0–1°', model: 'Nominal RHS of VLM; optimiser variable' },
  { t: 'Elevator area & span', eff: 'Pitch damping/restoring and authority vs drag; high AR (14–16) gives stiffness per area', L: '0.040–0.045 m², 0.75–0.80 m', M: '0.032–0.036 m², ~0.70 m', S: '0.026–0.030 m², 0.62–0.66 m', model: 'Coupled in the same VLM (downwash); linear stability ζ; S_r/S_m ≥ 0.28 constraint' },
  { t: 'Elevator rake / incidence', eff: 'Trims pitch against sail-drive couple; sailor moves aft as thrust rises', L: '+ (lift at low speed)', M: '~0', S: '≤ 0 (down-force possible)', model: 'Trim unknown δ_e; sailor fore/aft balances pitch, clamps to wing range' },
  { t: 'Main–rudder separation', eff: 'Pitch stiffness ∝ l_r; limited by hull length + 500 mm gantry rule', L: 'Max', M: 'Max', S: 'Max', model: 'Elevator x = −2.3 m (editable)' },
  { t: 'Strut chord', eff: 'More side force per leeway (lower leeway), stiffness, Re; more wetted area and spray', L: '110–120 mm', M: '100–110 mm', S: '90–100 mm', model: 'Struts are VLM lifting surfaces with surface image; profile + spray drag' },
  { t: 'Strut t/c', eff: 'Stiffness ∝ t³; spray drag ∝ t²; junction drag ↑; rounder LE resists ventilation', L: '12–13%', M: '10–12%', S: '9–11% (steel lower)', model: 'Spray D = 0.30·q·t² (measured); Hoerner junction C_Dt = 17(t/c)² − 0.05' },
  { t: 'Ride height / strut length', eff: 'Flying high cuts immersed strut drag and adds righting arm; too high → tip breach, ventilation, crash', L: 'Deeper foil (0.35–0.45 m)', M: '0.20–0.30 m', S: '0.25–0.40 m (waves)', model: 'Ride-height slider → foil depth, image strength, cavitation σ, tip clearance' },
  { t: 'Windward heel', eff: 'Longer righting arm, foil lift gives windward side force (less leeway), sail lift unloads foils', L: '10–15°', M: '15–20°', S: '15–25°', model: 'Heeled lattice + sail force tilt; roll balance by hiking then depower' },
  { t: 'Wand length & gearing', eff: 'Gearing = flap° per wand°: high gearing tightens height control but reduces damping → porpoising', L: '1.2 m / 0.30', M: '1.1 m / 0.25', S: '1.0 m / 0.35', model: 'Flight sim: wand kinematics ψ = acos(h/L), flap lag, eigen-damping vs gearing' },
  { t: 'Stiffness / materials', eff: 'HM carbon allows thinner sections; torsional divergence ~40 kn is near top speeds', L: 'HM', M: 'HM', S: 'HM + steel/Ti', model: 'Tip deflection (≤ 4.5% semi-span at 2 g), stress margin, V_div ≥ 1.3 V_max' },
  { t: 'Surface finish & tolerances', eff: 'Mould finish +25% drag; incidence shim scatter; flap compliance > 2°', L: 'Critical (laminar)', M: 'Important', S: 'Critical at high q', model: 'Finish factor on laminar run; junction fairing factor' },
];

export function renderDecisions(el) {
  el.innerHTML = DECISIONS.map((d) => `
    <div class="dec"><h5>${d.t}</h5>
      <table>
        <tr><td>effect</td><td>${d.eff}</td></tr>
        <tr><td><span class="sw" style="background:var(--light)"></span>light</td><td>${d.L}</td></tr>
        <tr><td><span class="sw" style="background:var(--medium)"></span>medium</td><td>${d.M}</td></tr>
        <tr><td><span class="sw" style="background:var(--strong)"></span>strong</td><td>${d.S}</td></tr>
        <tr><td>model</td><td>${d.model}</td></tr>
      </table></div>`).join('');
}
