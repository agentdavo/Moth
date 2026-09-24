// Physical constants for the IOM model (SI units).
// IOM boats are measured and mostly raced in fresh water (class rule C.4.1 "floating in fresh water").
export const G = 9.81;               // m/s^2
export const RHO_W = 1000;           // fresh water, kg/m^3
export const NU_W = 1.14e-6;         // fresh water kinematic viscosity at 15 C, m^2/s (ITTC 7.5-02-01-03)
export const RHO_A = 1.2;            // air, kg/m^3
export const NU_A = 1.5e-5;          // air kinematic viscosity, m^2/s
export const RHO_LEAD = 11340;       // kg/m^3; class rule E.3.1 caps appendage density at lead
export const KAPPA = 0.41;           // von Karman constant
export const KNOT = 0.514444;        // m/s per knot
export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const toKn = (v) => v / KNOT;
export const fromKn = (v) => v * KNOT;
