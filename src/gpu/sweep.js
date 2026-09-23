// Batched vortex-lattice solver on WebGPU for design-space sweeps.
// One workgroup per design: builds the full aerodynamic influence matrix (incl.
// free-surface images) with Biot-Savart, solves two right-hand sides (nominal
// incidence + unit pitch) by Gaussian elimination in storage memory, then evaluates
// induced velocities at the bound-vortex midpoints and reduces the quadratic
// Kutta-Joukowski force coefficients. Profile drag is added on the CPU per strip.
import { buildLattice, planformStats } from '../physics/geometry.js';
import { basisRHS, solveLattice, evalLattice } from '../physics/vlm.js';
import { sectionCd, reynolds } from '../physics/sections.js';
import { RHO_WATER, G, KNOT } from '../physics/constants.js';

export const NMAX = 64;
const PF = 16; // floats per panel

const WGSL = /* wgsl */`
const NMAX: u32 = ${NMAX}u;
const FAR: f32 = 60.0;
struct Params { nDesigns: u32, imageSign: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> geo: array<f32>;       // nDesigns * NMAX * 16
@group(0) @binding(2) var<storage, read> nPan: array<u32>;      // panels per design
@group(0) @binding(3) var<storage, read_write> M: array<f32>;   // nDesigns * NMAX * (NMAX + 2)
@group(0) @binding(4) var<storage, read_write> outG: array<f32>; // nDesigns * NMAX * 2
@group(0) @binding(5) var<storage, read_write> outF: array<f32>; // nDesigns * 12 (A0, A1, A2 as vec4)

fn pv(d: u32, i: u32, k: u32) -> f32 { return geo[(d * NMAX + i) * 16u + k]; }
fn P3(d: u32, i: u32, k: u32) -> vec3f { return vec3f(pv(d, i, k), pv(d, i, k + 1u), pv(d, i, k + 2u)); }

fn seg(a: vec3f, b: vec3f, p: vec3f) -> vec3f {
  let r1 = p - a; let r2 = p - b; let r0 = b - a;
  let c = cross(r1, r2);
  let c2 = dot(c, c) + 1e-8 * dot(r0, r0);
  let l1 = length(r1); let l2 = length(r2);
  if (l1 < 1e-9 || l2 < 1e-9 || c2 < 1e-14) { return vec3f(0.0); }
  let k = dot(r0, r1 / l1 - r2 / l2) / (4.0 * 3.14159265 * c2);
  return c * k;
}
fn mir(v: vec3f) -> vec3f { return vec3f(v.x, v.y, -v.z); }
fn horseshoe(a: vec3f, b: vec3f, p: vec3f, bound: bool) -> vec3f {
  let af = a - vec3f(FAR, 0.0, 0.0); let bf = b - vec3f(FAR, 0.0, 0.0);
  var v = seg(af, a, p) + seg(b, bf, p);
  if (bound) { v += seg(a, b, p); }
  var w = seg(mir(af), mir(a), p) + seg(mir(b), mir(bf), p) + seg(mir(a), mir(b), p);
  return v + P.imageSign * w;
}

var<workgroup> xk: f32;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) li: u32) {
  let d = wid.x;
  if (d >= P.nDesigns) { return; }
  let n = nPan[d];
  let W = NMAX + 2u;
  let base = d * NMAX * W;
  // 1) influence matrix + RHS (thread per row)
  for (var i = li; i < NMAX; i += 64u) {
    if (i >= n) {
      for (var j = 0u; j < W; j++) { M[base + i * W + j] = select(0.0, 1.0, j == i); }
      continue;
    }
    let C = P3(d, i, 6u); let nn = P3(d, i, 9u);
    for (var j = 0u; j < NMAX; j++) {
      if (j >= n) { M[base + i * W + j] = 0.0; continue; }
      let v = horseshoe(P3(d, j, 0u), P3(d, j, 3u), C, true);
      M[base + i * W + j] = dot(v, nn);
    }
    M[base + i * W + NMAX] = pv(d, i, 13u);
    M[base + i * W + NMAX + 1u] = pv(d, i, 14u);
  }
  storageBarrier(); workgroupBarrier();
  // 2) Gaussian elimination (VLM matrices are diagonally dominant: no pivoting)
  for (var k = 0u; k < NMAX; k++) {
    for (var i = k + 1u + li; i < NMAX; i += 64u) {
      let f = M[base + i * W + k] / M[base + k * W + k];
      if (f != 0.0) {
        for (var j = k; j < W; j++) { M[base + i * W + j] -= f * M[base + k * W + j]; }
      }
    }
    storageBarrier(); workgroupBarrier();
  }
  // 3) back substitution, two RHS
  for (var r = 0u; r < 2u; r++) {
    for (var kk = 0u; kk < NMAX; kk++) {
      let k = NMAX - 1u - kk;
      if (li == 0u) {
        let x = M[base + k * W + NMAX + r] / M[base + k * W + k];
        outG[(d * NMAX + k) * 2u + r] = x;
        xk = x;
      }
      workgroupBarrier(); storageBarrier();
      let x = workgroupUniformLoad(&xk);
      for (var i = li; i < k; i += 64u) { M[base + i * W + NMAX + r] -= M[base + i * W + k] * x; }
      storageBarrier(); workgroupBarrier();
    }
  }
  storageBarrier(); workgroupBarrier();
  // 4) Kutta-Joukowski force quadratic coefficients (thread 0 accumulates from per-thread partials in M scratch)
  var a0 = vec3f(0.0); var a1 = vec3f(0.0); var a2 = vec3f(0.0);
  let u = vec3f(-1.0, 0.0, 0.0);
  for (var i = li; i < n; i += 64u) {
    let A = P3(d, i, 0u); let B = P3(d, i, 3u);
    let Mi = 0.5 * (A + B);
    var w0 = vec3f(0.0); var w1 = vec3f(0.0);
    for (var j = 0u; j < n; j++) {
      let v = horseshoe(P3(d, j, 0u), P3(d, j, 3u), Mi, j != i);
      w0 += v * outG[(d * NMAX + j) * 2u];
      w1 += v * outG[(d * NMAX + j) * 2u + 1u];
    }
    let l = B - A;
    let g0 = outG[(d * NMAX + i) * 2u]; let g1 = outG[(d * NMAX + i) * 2u + 1u];
    // theta enters the free stream as (0,0,theta): u(theta) = u + theta*ez
    a0 += g0 * cross(u + w0, l);
    a1 += g1 * cross(u + w0, l) + g0 * cross(w1 + vec3f(0.0, 0.0, 1.0), l);
    a2 += g1 * cross(w1 + vec3f(0.0, 0.0, 1.0), l);
  }
  // reduce over threads through the matrix scratch area (no longer needed)
  M[base + li * 9u + 0u] = a0.x; M[base + li * 9u + 1u] = a0.y; M[base + li * 9u + 2u] = a0.z;
  M[base + li * 9u + 3u] = a1.x; M[base + li * 9u + 4u] = a1.y; M[base + li * 9u + 5u] = a1.z;
  M[base + li * 9u + 6u] = a2.x; M[base + li * 9u + 7u] = a2.y; M[base + li * 9u + 8u] = a2.z;
  storageBarrier(); workgroupBarrier();
  if (li == 0u) {
    var s: array<f32, 9>;
    for (var t = 0u; t < 64u; t++) { for (var k = 0u; k < 9u; k++) { s[k] += M[base + t * 9u + k]; } }
    for (var k = 0u; k < 9u; k++) { outF[d * 12u + k] = s[k]; }
  }
}
`;

/** Build the packed geometry for one design (main foil + elevator + struts). */
export function packDesign(design, heel = 0) {
  const lat = buildLattice(design, heel, design.boat.rideHeight);
  let panels = lat.panels;
  if (panels.length > NMAX) panels = panels.slice(0, NMAX);
  const R = basisRHS(panels);
  const out = new Float32Array(NMAX * PF);
  panels.forEach((p, i) => {
    out.set([...p.A, ...p.B, ...p.C, ...p.n, p.chord, R[i * 5], R[i * 5 + 1], 0], i * PF);
  });
  return { data: out, n: panels.length, panels, lat };
}

export class GPUSweep {
  constructor(device) {
    this.device = device;
    this.pipe = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: WGSL }), entryPoint: 'main' } });
  }

  /** Solve a batch of designs. Returns per-design {G0, G1, A0, A1, A2, panels}. */
  async solve(designs, imageSign = 1) {
    const d = this.device;
    const nD = designs.length;
    const packs = designs.map((x) => packDesign(x));
    const geo = new Float32Array(nD * NMAX * PF);
    const np = new Uint32Array(nD);
    packs.forEach((p, k) => { geo.set(p.data, k * NMAX * PF); np[k] = p.n; });
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const mk = (size, usage = S) => d.createBuffer({ size: Math.max(16, size), usage });
    const params = mk(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const pb = new ArrayBuffer(16); new Uint32Array(pb, 0, 1)[0] = nD; new Float32Array(pb, 4, 1)[0] = imageSign;
    d.queue.writeBuffer(params, 0, pb);
    const gBuf = mk(geo.byteLength); d.queue.writeBuffer(gBuf, 0, geo);
    const nBuf = mk(np.byteLength); d.queue.writeBuffer(nBuf, 0, np);
    const mBuf = mk(nD * NMAX * (NMAX + 2) * 4);
    const oG = mk(nD * NMAX * 2 * 4), oF = mk(nD * 12 * 4);
    const rG = mk(nD * NMAX * 2 * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const rF = mk(nD * 12 * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const bg = d.createBindGroup({ layout: this.pipe.getBindGroupLayout(0), entries: [params, gBuf, nBuf, mBuf, oG, oF].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    const t0 = performance.now();
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipe); pass.setBindGroup(0, bg);
    // chunk dispatches to stay under per-dimension limits
    pass.dispatchWorkgroups(nD);
    pass.end();
    enc.copyBufferToBuffer(oG, 0, rG, 0, nD * NMAX * 2 * 4);
    enc.copyBufferToBuffer(oF, 0, rF, 0, nD * 12 * 4);
    d.queue.submit([enc.finish()]);
    await Promise.all([rG.mapAsync(GPUMapMode.READ), rF.mapAsync(GPUMapMode.READ)]);
    const Gs = new Float32Array(rG.getMappedRange().slice(0));
    const Fs = new Float32Array(rF.getMappedRange().slice(0));
    const ms = performance.now() - t0;
    rG.unmap(); rF.unmap();
    for (const b of [params, gBuf, nBuf, mBuf, oG, oF, rG, rF]) b.destroy();
    const res = packs.map((p, k) => ({
      n: p.n, panels: p.panels,
      G0: Array.from({ length: p.n }, (_, i) => Gs[(k * NMAX + i) * 2]),
      G1: Array.from({ length: p.n }, (_, i) => Gs[(k * NMAX + i) * 2 + 1]),
      A0: Fs.slice(k * 12, k * 12 + 3), A1: Fs.slice(k * 12 + 3, k * 12 + 6), A2: Fs.slice(k * 12 + 6, k * 12 + 9),
    }));
    return { res, ms };
  }
}

/**
 * Level-flight drag (N) at speed V for a solved design: pitch theta chosen so that
 * Fz = W (quadratic KJ force model), plus strip profile drag, spray & junction.
 */
export function levelFlightDrag(sol, design, V) {
  const W = (design.boat.hullMass + design.boat.sailorMass) * G;
  const rv2 = RHO_WATER * V * V;
  const target = W / rv2;
  const [a0, a1, a2] = [sol.A0[2], sol.A1[2], sol.A2[2]];
  // a2 th^2 + a1 th + a0 - target = 0 (a2 small)
  let th;
  if (Math.abs(a2) < 1e-9) th = (target - a0) / a1;
  else { const disc = a1 * a1 - 4 * a2 * (a0 - target); th = (-a1 + Math.sqrt(Math.max(disc, 0))) / (2 * a2); if (!isFinite(th) || Math.abs(th) > 0.5) th = (target - a0) / a1; }
  const fx = sol.A0[0] + sol.A1[0] * th + sol.A2[0] * th * th;
  const induced = (-fx + th * target) * rv2; // force component along the flow (-x rotated by theta)
  let profile = 0, maxCl = 0;
  const q = 0.5 * rv2;
  sol.panels.forEach((p, i) => {
    const g = sol.G0[i] + th * sol.G1[i];
    const cl = 2 * g / p.chord;
    if (p.surf === 'main' || p.surf === 'elev') maxCl = Math.max(maxCl, cl);
    profile += q * p.chord * p.ds * sectionCd(p, cl, reynolds(V, p.chord), 0, 0, 1);
  });
  const t1 = design.mainStrut.tc * design.mainStrut.chord, t2 = design.rudderStrut.tc * design.rudderStrut.chord;
  const spray = q * 0.3 * (t1 * t1 + t2 * t2);
  return { total: induced + profile + spray, induced, profile, spray, thetaDeg: th * 180 / Math.PI, maxCl };
}

/** CPU reference solve for timing + verification of the GPU kernel. */
export function cpuSolve(design) {
  const p = packDesign(design);
  const sol = solveLattice(p.panels, 1);
  return { G0: Array.from({ length: p.n }, (_, i) => sol.G[i * 5]), G1: Array.from({ length: p.n }, (_, i) => sol.G[i * 5 + 1]), sol };
}

export { planformStats, KNOT, evalLattice };
