// 2D hydrofoil section models.
//
// Each family is a semi-empirical description of a real section family used on
// Moth foils. The numbers are calibrated against published data (Abbott & von
// Doenhoff "Theory of Wing Sections", Hoerner "Fluid Dynamic Drag/Lift",
// Eppler hydrofoil sections) and are meant for design trade studies, not for
// replacing XFOIL/CFD.
//
//   kThick   : peak thickness-induced velocity  v/V = 1 + kThick * t/c  (sets Cp_min at design lift)
//   kLE      : leading-edge suction spike growth with off-design lift (cavitation bucket width)
//   xtr      : laminar run (fraction of chord) inside the drag bucket, both surfaces
//   bucket   : half-width of the laminar drag bucket in delta-cl
//   clmaxK   : stall scaling
//   camberX  : chordwise max-camber position used for geometry generation
import { DEG, clamp, NU_WATER } from './constants.js';

export const FAMILIES = {
  naca4: {
    label: 'NACA 4-digit (turbulent, forgiving)',
    kThick: 1.56, kLE: 1.0, xtr: 0.12, bucket: 0.45, clmaxK: 1.08, camberX: 0.4, thickX: 0.30,
    note: 'Blunt LE, broad low-drag range, mostly turbulent. Robust to fouling and wand-induced AoA swings.',
  },
  naca63: {
    label: 'NACA 63-series (laminar)',
    kThick: 1.38, kLE: 1.15, xtr: 0.38, bucket: 0.22, clmaxK: 1.0, camberX: 0.5, thickX: 0.36,
    note: 'Classic laminar section. ~35-40% laminar run inside the bucket; drag rises sharply outside.',
  },
  naca66: {
    label: 'NACA 66-series (long laminar)',
    kThick: 1.18, kLE: 1.4, xtr: 0.52, bucket: 0.12, clmaxK: 0.93, camberX: 0.5, thickX: 0.45,
    note: 'Flattest pressure distribution: best cavitation margin at design cl but narrow bucket and sharp LE.',
  },
  eppler: {
    label: 'Eppler-type hydrofoil (E8xx)',
    kThick: 1.28, kLE: 0.95, xtr: 0.40, bucket: 0.30, clmaxK: 1.02, camberX: 0.45, thickX: 0.38,
    note: 'Designed for cavitation-free buckets over a wide cl range; the modern default for Moth foils.',
  },
};

// Schlichting turbulent flat plate + Blasius laminar, mixed with a transition point.
export function cfTurb(re) { return 0.455 / Math.pow(Math.log10(Math.max(re, 1e3)), 2.58); }
export function cfLam(re) { return 1.328 / Math.sqrt(Math.max(re, 1e2)); }
export function cfMixed(re, xtr) {
  const rex = Math.max(re * xtr, 1e3);
  return cfTurb(re) - xtr * (cfTurb(rex) - cfLam(rex));
}

// Thin-aerofoil flap effectiveness tau for flap chord fraction cf.
export function flapTau(cf) {
  if (cf <= 0) return 0;
  const th = Math.acos(2 * cf - 1);
  return 1 - (th - Math.sin(th)) / Math.PI;
}

// Viscous flap efficiency: falls off at large deflections (separation over the hinge).
// Calibrated to the measured Moth flap authority (2.2 deg flap ~ 1 deg AoA for a 30%
// flap, Beaver & Zseleczky 2009): eta ~0.7 below 10 deg falling to ~0.5 at 15-20 deg.
export function flapEta(deltaRad) {
  const d = Math.abs(deltaRad) / DEG;
  return clamp(0.70 - 0.035 * Math.max(0, d - 10), 0.48, 0.70);
}

// Section lift slope per radian, incl. thickness (+) and viscous (-) corrections.
export function liftSlope2D(tc) { return 2 * Math.PI * (1 + 0.77 * tc) * 0.9; }

export function sectionProps(sec) {
  const f = FAMILIES[sec.family] || FAMILIES.eppler;
  const tc = sec.tc;
  const cli = sec.cli;
  const a0 = liftSlope2D(tc);
  const alpha0 = -cli / (2 * Math.PI);             // a=1.0 mean line zero-lift angle
  const clmax = f.clmaxK * (0.72 + 4.2 * tc + 0.45 * cli);
  const clmin = -f.clmaxK * (0.72 + 4.2 * tc - 0.45 * cli);
  return { f, tc, cli, a0, alpha0, clmax, clmin };
}

// Transition location vs. distance from the bucket centre.
export function transition(f, dcl, finish = 1) {
  const x = Math.abs(dcl);
  let xtr;
  if (x <= f.bucket) xtr = f.xtr;
  else xtr = Math.max(0.04, f.xtr - (x - f.bucket) * (f.xtr - 0.04) / 0.15);
  return Math.max(0.03, xtr * finish);
}

/**
 * Section drag coefficient.
 * @param sec  {family, tc, cli}
 * @param cl   local section lift coefficient
 * @param re   chord Reynolds number
 * @param dclFlap  lift increment produced by flap deflection (moves the bucket)
 * @param deltaRad flap deflection (rad)
 * @param finish   surface finish multiplier on laminar run (1 = mirror, 0.5 = sanded 400 grit ...)
 */
export function sectionCd(sec, cl, re, dclFlap = 0, deltaRad = 0, finish = 1) {
  const p = sectionProps(sec);
  const centre = p.cli + 0.8 * dclFlap;          // cambering flap shifts the bucket
  const dcl = cl - centre;
  const xtr = transition(p.f, dcl, finish);
  const ff = 1 + 2 * p.tc + 60 * Math.pow(p.tc, 4); // Hoerner form factor
  let cd = 2 * cfMixed(re, xtr) * ff;
  cd += 0.0035 * dcl * dcl;                         // pressure drag growth with off-design lift
  if (dclFlap !== 0 || deltaRad !== 0 || sec.flapped) {
    // flap gap increment (Wenzinger & Harris 1939): 0.0012 below cl 0.6 -> 0.0022 at cl 1.0
    cd += 0.0012 + 0.0025 * clamp(Math.abs(cl) - 0.6, 0, 0.4);
    const dm = Math.abs(deltaRad) / DEG;
    cd += 0.00002 * dm * dm;                        // separation over the hinge at large deflection
  }
  const r = cl > 0 ? cl / p.clmax : cl / p.clmin;
  if (r > 0.75) cd += 0.12 * (r - 0.75) * (r - 0.75); // approach to stall
  return cd;
}

/** Peak suction coefficient (negative). Cavitation when -Cp_min > sigma. */
export function sectionCpMin(sec, cl, dclFlap = 0, deltaRad = 0) {
  const p = sectionProps(sec);
  const f = p.f;
  const design = p.cli + 0.8 * dclFlap;
  const vt = 1 + f.kThick * p.tc;
  const vl = Math.abs(design) / 4;
  const vle = f.kLE * Math.abs(cl - design) * Math.sqrt(0.12 / Math.max(p.tc, 0.05)) * 0.9;
  const vflap = 0.35 * Math.abs(deltaRad);
  const v = vt + vl + vle + vflap;
  return 1 - v * v;
}

/** Cavitation number at depth h (m) and speed V (m/s). */
export function cavitationNumber(V, depth, rho = 1025, patm = 101325, pv = 1700) {
  const p = patm + rho * 9.81 * Math.max(depth, 0) - pv;
  return p / (0.5 * rho * V * V);
}

export function reynolds(V, chord, nu = NU_WATER) { return V * chord / nu; }

/**
 * Nonlinear section lift from effective angle (used to post-correct VLM strips for stall).
 */
export function clFromAlpha(sec, alphaEff, dclFlap = 0) {
  const p = sectionProps(sec);
  const clLin = p.a0 * (alphaEff - p.alpha0) + dclFlap;
  const cmax = p.clmax + 0.5 * Math.max(0, dclFlap);
  const cmin = p.clmin + 0.5 * Math.min(0, dclFlap);
  if (clLin > 0.85 * cmax) {
    const x = (clLin - 0.85 * cmax) / (0.15 * cmax);
    return 0.85 * cmax + 0.15 * cmax * Math.tanh(x);
  }
  if (clLin < 0.85 * cmin) {
    const x = (clLin - 0.85 * cmin) / (0.15 * cmin);
    return 0.85 * cmin + 0.15 * cmin * Math.tanh(x);
  }
  return clLin;
}

/**
 * Section coordinates (closed loop, TE -> upper -> LE -> lower -> TE), chord 1, LE at x=0.
 * Thickness: NACA 4-digit-like distribution with the family's max-thickness position
 * shifted by a simple stretching; camber: NACA a=1.0-like parabola scaled from cli.
 * Optional plain flap of chord fraction cf deflected by deltaRad (positive = TE down).
 */
export function sectionCoords(sec, n = 60, cf = 0, deltaRad = 0) {
  const f = FAMILIES[sec.family] || FAMILIES.eppler;
  const tc = sec.tc;
  const m = sec.cli / (4 * Math.PI) * 1.6;  // max camber ~ cli * 0.127 (approx for a=1 mean line)
  const pc = f.camberX;
  const tx = f.thickX;
  const pts = [];
  const thick = (x) => {
    // stretch x so that the max thickness sits at tx (NACA 4-digit native max at 0.3)
    const xs = x < tx ? 0.3 * x / tx : 0.3 + 0.7 * (x - tx) / (1 - tx);
    return 5 * tc * (0.2969 * Math.sqrt(xs) - 0.126 * xs - 0.3516 * xs * xs + 0.2843 * xs ** 3 - 0.1036 * xs ** 4);
  };
  const camber = (x) => (x < pc ? m / (pc * pc) * (2 * pc * x - x * x) : m / ((1 - pc) ** 2) * ((1 - 2 * pc) + 2 * pc * x - x * x));
  const xs = [];
  for (let i = 0; i <= n; i++) { const b = Math.PI * i / n; xs.push(0.5 * (1 - Math.cos(b))); }
  const hinge = 1 - cf;
  const flapT = (x, y) => {
    if (cf <= 0 || x <= hinge) return [x, y];
    const yc = camber(hinge);
    const dx = x - hinge, dy = y - yc;
    const c = Math.cos(deltaRad), s = Math.sin(deltaRad);
    return [hinge + dx * c + dy * s, yc - dx * s + dy * c];
  };
  for (let i = n; i >= 0; i--) { const x = xs[i]; pts.push(flapT(x, camber(x) + thick(x))); }
  for (let i = 1; i <= n; i++) { const x = xs[i]; pts.push(flapT(x, camber(x) - thick(x))); }
  return pts;
}
