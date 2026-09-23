// Physical constants used throughout the model (SI units).
export const G = 9.81;              // m/s^2
export const RHO_WATER = 1025;      // sea water, kg/m^3
export const NU_WATER = 1.19e-6;    // sea water kinematic viscosity @15C, m^2/s
export const RHO_AIR = 1.225;       // kg/m^3
export const P_ATM = 101325;        // Pa
export const P_VAPOUR = 1700;       // Pa, sea water @15C
export const KNOT = 0.514444;       // m/s per knot
export const DEG = Math.PI / 180;
export const E_CARBON = 150e9;      // effective bending modulus of a HM-UD-dominated solid carbon foil, Pa
export const G_CARBON = 12e9;       // effective shear modulus with +-45 skins (torsion), Pa
export const RHO_CARBON = 1580;     // kg/m^3 laminate density
export const SIGMA_ALLOW = 650e6;   // allowable laminate stress used for margins, Pa

export const kn = (v) => v * KNOT;
export const toKn = (v) => v / KNOT;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
