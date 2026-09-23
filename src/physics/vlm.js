// Vortex-lattice (Weissinger, one chordwise horseshoe per strip) solver for the
// complete Moth appendage set: main foil, elevator and both surface-piercing
// struts, all solved together so that main-foil downwash on the elevator and
// strut/foil junction interference are captured.
//
// Free surface: linearised high-Froude condition (phi = 0 on z = 0) represented
// by a mirrored image lattice with the same traversal order and circulation
// multiplied by `imageSign` (+1 -> constant pressure surface, -1 -> rigid wall).
//
// World frame: x forward (boat heading), y to port / leeward, z up, z = 0 is the
// undisturbed water surface. Solutions are for unit free-stream speed; circulation
// scales linearly with V.
//
// Linear basis (columns of G):
//   0: nominal incidence (geometry, twist, camber), unit speed, flow along -x
//   1: pitch  theta  (rad)   -- free-stream from below, all surfaces
//   2: flap   delta_f (rad)  -- main-foil flapped strips, tau-weighted
//   3: elevator incidence delta_e (rad)
//   4: leeway beta (rad)     -- free-stream from +y (boat drifting to leeward)
import { luFactor, luSolve } from './linalg.js';

export const NB = 5;
const FAR = 60; // m, length of "semi-infinite" trailing legs
const CORE2 = 1e-8;

// Biot-Savart induced velocity of a straight segment A->B with unit circulation at P.
// Adds s * v into out[0..2].
export function segVel(ax, ay, az, bx, by, bz, px, py, pz, s, out) {
  const r1x = px - ax, r1y = py - ay, r1z = pz - az;
  const r2x = px - bx, r2y = py - by, r2z = pz - bz;
  const cx = r1y * r2z - r1z * r2y;
  const cy = r1z * r2x - r1x * r2z;
  const cz = r1x * r2y - r1y * r2x;
  const r0x = bx - ax, r0y = by - ay, r0z = bz - az;
  const r0sq = r0x * r0x + r0y * r0y + r0z * r0z;
  const c2 = cx * cx + cy * cy + cz * cz + CORE2 * r0sq;
  const r1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
  const r2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
  if (r1 < 1e-9 || r2 < 1e-9 || c2 < 1e-14) return;
  const dot = (r0x * (r1x / r1 - r2x / r2) + r0y * (r1y / r1 - r2y / r2) + r0z * (r1z / r1 - r2z / r2));
  const k = s * dot / (4 * Math.PI * c2);
  out[0] += k * cx; out[1] += k * cy; out[2] += k * cz;
}

// Velocity at P induced by horseshoe j (and its image), unit circulation.
// includeBound=false skips the bound leg (used for forces on the bound leg itself).
export function horseshoeVel(p, P, imageSign, out, includeBound = true) {
  out[0] = out[1] = out[2] = 0;
  const [ax, ay, az] = p.A, [bx, by, bz] = p.B;
  const px = P[0], py = P[1], pz = P[2];
  segVel(ax - FAR, ay, az, ax, ay, az, px, py, pz, 1, out);
  if (includeBound) segVel(ax, ay, az, bx, by, bz, px, py, pz, 1, out);
  segVel(bx, by, bz, bx - FAR, by, bz, px, py, pz, 1, out);
  if (imageSign !== 0) {
    segVel(ax - FAR, ay, -az, ax, ay, -az, px, py, pz, imageSign, out);
    segVel(ax, ay, -az, bx, by, -bz, px, py, pz, imageSign, out);
    segVel(bx, by, -bz, bx - FAR, by, -bz, px, py, pz, imageSign, out);
  }
  return out;
}

/** Right-hand sides for the five basis cases. */
export function basisRHS(panels) {
  const N = panels.length;
  const R = new Float64Array(N * NB);
  for (let i = 0; i < N; i++) {
    const p = panels[i];
    const n = p.n, dn = p.dn;
    R[i * NB + 0] = n[0];                         // -u.n with u = (-1,0,0)
    R[i * NB + 1] = -n[2];                        // u = (0,0,1)*theta
    const dRdEps = dn[0];                         // -(-1,0,0).dn
    R[i * NB + 2] = p.surf === 'main' && p.flapped ? dRdEps * p.tau : 0;
    R[i * NB + 3] = p.surf === 'elev' ? dRdEps : 0;
    R[i * NB + 4] = n[1];                         // u = (0,-1,0)*beta
  }
  return R;
}

/**
 * Build and solve the lattice. Returns the basis circulations G (N x NB) and the
 * induced velocities at bound-vortex midpoints for each basis (N x NB x 3).
 */
export function solveLattice(panels, imageSign = 1) {
  const N = panels.length;
  const A = new Float64Array(N * N);
  const v = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const pi = panels[i];
    for (let j = 0; j < N; j++) {
      horseshoeVel(panels[j], pi.C, imageSign, v, true);
      A[i * N + j] = v[0] * pi.n[0] + v[1] * pi.n[1] + v[2] * pi.n[2];
    }
  }
  const R = basisRHS(panels);
  const lu = luFactor(A, N);
  const G = new Float64Array(N * NB);
  const col = new Float64Array(N);
  for (let k = 0; k < NB; k++) {
    for (let i = 0; i < N; i++) col[i] = R[i * NB + k];
    const x = luSolve(lu, col);
    for (let i = 0; i < N; i++) G[i * NB + k] = x[i];
  }
  return finishSolution(panels, imageSign, G);
}

/** Given basis circulations (from CPU or GPU), compute the midpoint induced-velocity basis. */
export function finishSolution(panels, imageSign, G) {
  const N = panels.length;
  const Wm = new Float64Array(N * N * 3);
  const v = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      horseshoeVel(panels[j], panels[i].M, imageSign, v, j !== i);
      Wm[(i * N + j) * 3] = v[0]; Wm[(i * N + j) * 3 + 1] = v[1]; Wm[(i * N + j) * 3 + 2] = v[2];
    }
  }
  // Pre-contract induced velocities with the basis: WG[i][k] = sum_j Wm[i][j] G[j][k]
  const WG = new Float64Array(N * NB * 3);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const w0 = Wm[(i * N + j) * 3], w1 = Wm[(i * N + j) * 3 + 1], w2 = Wm[(i * N + j) * 3 + 2];
      for (let k = 0; k < NB; k++) {
        const g = G[j * NB + k];
        const o = (i * NB + k) * 3;
        WG[o] += w0 * g; WG[o + 1] += w1 * g; WG[o + 2] += w2 * g;
      }
    }
  }
  return { panels, N, G, WG, imageSign };
}

/**
 * Evaluate forces for basis coefficients c = [1, theta, delta_f_eff, delta_e, beta].
 * Returns per-panel unit-speed quantities; caller scales by rho V^2.
 *   gam[i]      : circulation / V  (m)
 *   f[i*3..]    : force / (rho V^2)  (m^2) on the bound leg (Kutta-Joukowski, incl. induced drag)
 *   cl[i]       : section lift coefficient 2*gam/c
 */
export function evalLattice(sol, c, out) {
  const { panels, N, G, WG } = sol;
  if (!out || out.N !== N) out = { N, gam: new Float64Array(N), f: new Float64Array(N * 3), cl: new Float64Array(N), vi: new Float64Array(N * 3) };
  const ux = -1, uy = -c[4], uz = c[1];
  for (let i = 0; i < N; i++) {
    let g = 0, wx = 0, wy = 0, wz = 0;
    for (let k = 0; k < NB; k++) {
      const ck = c[k];
      if (ck === 0) continue;
      g += G[i * NB + k] * ck;
      const o = (i * NB + k) * 3;
      wx += WG[o] * ck; wy += WG[o + 1] * ck; wz += WG[o + 2] * ck;
    }
    const p = panels[i];
    const Ux = ux + wx, Uy = uy + wy, Uz = uz + wz;
    const lx = p.B[0] - p.A[0], ly = p.B[1] - p.A[1], lz = p.B[2] - p.A[2];
    out.gam[i] = g;
    out.vi[i * 3] = wx; out.vi[i * 3 + 1] = wy; out.vi[i * 3 + 2] = wz;
    out.f[i * 3] = g * (Uy * lz - Uz * ly);
    out.f[i * 3 + 1] = g * (Uz * lx - Ux * lz);
    out.f[i * 3 + 2] = g * (Ux * ly - Uy * lx);
    out.cl[i] = 2 * g / p.chord;
  }
  return out;
}
