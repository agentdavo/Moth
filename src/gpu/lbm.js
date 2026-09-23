// 2-D lattice-Boltzmann (D2Q9, BGK + Smagorinsky LES) section CFD on WebGPU.
// The foil section (with deflected flap) is rasterised into a solid mask; forces
// are obtained by momentum exchange on the half-way bounce-back links and reduced
// on the GPU. Flow is rendered straight from the GPU buffers (vorticity / speed /
// pressure). Lattice Reynolds numbers are far below full scale (~1e4 vs ~1e6), so
// this is a qualitative tool for flap/incidence flow structure and separation.
import { sectionCoords } from '../physics/sections.js';

const WG = 8;

const COMMON = /* wgsl */`
struct Params { nx: u32, ny: u32, tau: f32, u0: f32, cs2: f32, mode: u32, chord: f32, vscale: f32 };
@group(0) @binding(0) var<uniform> P: Params;
`;

const STEP = COMMON + /* wgsl */`
@group(0) @binding(1) var<storage, read> fin: array<f32>;
@group(0) @binding(2) var<storage, read_write> fout: array<f32>;
@group(0) @binding(3) var<storage, read> mask: array<u32>;
@group(0) @binding(4) var<storage, read_write> mac: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> frc: array<vec2f>;

var<private> CX: array<i32, 9> = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
var<private> CY: array<i32, 9> = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
var<private> W: array<f32, 9> = array<f32, 9>(0.444444444, 0.111111111, 0.111111111, 0.111111111, 0.111111111, 0.027777778, 0.027777778, 0.027777778, 0.027777778);
var<private> OPP: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

fn feq(q: u32, rho: f32, u: vec2f) -> f32 {
  let cu = 3.0 * (f32(CX[q]) * u.x + f32(CY[q]) * u.y);
  return W[q] * rho * (1.0 + cu + 0.5 * cu * cu - 1.5 * dot(u, u));
}

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) g: vec3u) {
  let x = g.x; let y = g.y;
  if (x >= P.nx || y >= P.ny) { return; }
  let N = P.nx * P.ny;
  let i = y * P.nx + x;
  let uin = vec2f(P.u0, 0.0);
  if (mask[i] == 1u) {
    for (var q = 0u; q < 9u; q++) { fout[q * N + i] = W[q]; }
    mac[i] = vec4f(1.0, 0.0, 0.0, 1.0);
    frc[i] = vec2f(0.0);
    return;
  }
  var f: array<f32, 9>;
  var F = vec2f(0.0);
  for (var q = 0u; q < 9u; q++) {
    let sx = i32(x) - CX[q];
    let sy = i32(y) - CY[q];
    if (sx < 0 || sy < 0 || sy >= i32(P.ny)) { f[q] = feq(q, 1.0, uin); continue; }
    if (sx >= i32(P.nx)) { f[q] = fin[q * N + i]; continue; }
    let j = u32(sy) * P.nx + u32(sx);
    if (mask[j] == 1u) {
      let fb = fin[OPP[q] * N + i];
      f[q] = fb;
      F += -2.0 * fb * vec2f(f32(CX[q]), f32(CY[q]));
    } else {
      f[q] = fin[q * N + j];
    }
  }
  var rho = 0.0; var u = vec2f(0.0);
  for (var q = 0u; q < 9u; q++) { rho += f[q]; u += f[q] * vec2f(f32(CX[q]), f32(CY[q])); }
  rho = max(rho, 0.2);
  u = u / rho;
  let sp = length(u);
  if (sp > 0.3) { u = u * (0.3 / sp); }
  // Smagorinsky eddy viscosity from the non-equilibrium stress
  var pxx = 0.0; var pyy = 0.0; var pxy = 0.0;
  var fe: array<f32, 9>;
  for (var q = 0u; q < 9u; q++) {
    fe[q] = feq(q, rho, u);
    let d = f[q] - fe[q];
    let cx = f32(CX[q]); let cy = f32(CY[q]);
    pxx += cx * cx * d; pyy += cy * cy * d; pxy += cx * cy * d;
  }
  let Q = sqrt(pxx * pxx + pyy * pyy + 2.0 * pxy * pxy);
  let te = 0.5 * (P.tau + sqrt(P.tau * P.tau + 18.0 * 1.4142 * P.cs2 * Q / rho));
  for (var q = 0u; q < 9u; q++) { fout[q * N + i] = f[q] - (f[q] - fe[q]) / te; }
  mac[i] = vec4f(rho, u.x, u.y, 0.0);
  frc[i] = F;
}
`;

const REDUCE = COMMON + /* wgsl */`
@group(0) @binding(1) var<storage, read> frc: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> outF: array<vec2f>;
var<workgroup> acc: array<vec2f, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) li: u32) {
  let N = P.nx * P.ny;
  var s = vec2f(0.0);
  for (var k = li; k < N; k += 256u) { s += frc[k]; }
  acc[li] = s;
  workgroupBarrier();
  var st = 128u;
  loop {
    if (st == 0u) { break; }
    if (li < st) { acc[li] += acc[li + st]; }
    workgroupBarrier();
    st = st / 2u;
  }
  if (li == 0u) { outF[0] = acc[0]; }
}
`;

const RENDER = COMMON + /* wgsl */`
@group(0) @binding(1) var<storage, read> mac: array<vec4f>;
@group(0) @binding(2) var<storage, read> mask: array<u32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VO; o.pos = vec4f(p[vi], 0.0, 1.0); o.uv = (p[vi] + 1.0) * 0.5; return o;
}
fn cell(x: i32, y: i32) -> vec4f {
  let cx = clamp(x, 0, i32(P.nx) - 1); let cy = clamp(y, 0, i32(P.ny) - 1);
  return mac[u32(cy) * P.nx + u32(cx)];
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let x = i32(in.uv.x * f32(P.nx)); let y = i32(in.uv.y * f32(P.ny));
  let i = u32(clamp(y, 0, i32(P.ny) - 1)) * P.nx + u32(clamp(x, 0, i32(P.nx) - 1));
  if (mask[i] == 1u) { return vec4f(0.86, 0.88, 0.9, 1.0); }
  let c = cell(x, y);
  let bg = vec3f(0.09, 0.11, 0.13);
  if (P.mode == 0u) {
    // vorticity: diverging blue - neutral - red
    let w = (cell(x + 1, y).z - cell(x - 1, y).z) - (cell(x, y + 1).y - cell(x, y - 1).y);
    let t = clamp(w / (P.u0 * 0.18) * P.vscale, -1.0, 1.0);
    let neg = vec3f(0.22, 0.53, 0.9); let pos = vec3f(0.85, 0.35, 0.15);
    let col = select(mix(bg, neg, -t), mix(bg, pos, t), t > 0.0);
    return vec4f(col, 1.0);
  } else if (P.mode == 1u) {
    let s = clamp(length(c.yz) / (P.u0 * 1.6), 0.0, 1.0);
    return vec4f(mix(vec3f(0.05, 0.08, 0.14), vec3f(0.62, 0.84, 1.0), s), 1.0);
  }
  let cp = (c.x - 1.0) / 3.0 / (0.5 * P.u0 * P.u0);
  let t = clamp(cp / 1.5, -1.0, 1.0);
  let col = select(mix(bg, vec3f(0.22, 0.53, 0.9), -t), mix(bg, vec3f(0.85, 0.35, 0.15), t), t > 0.0);
  return vec4f(col, 1.0);
}
`;

export class LBMSolver {
  constructor(device, canvas, { nx = 480, ny = 192 } = {}) {
    this.device = device; this.canvas = canvas; this.nx = nx; this.ny = ny;
    this.N = nx * ny;
    this.u0 = 0.08;
    this.re = 6000;
    this.mode = 0;
    this.chord = Math.round(nx * 0.17); // ~40% of the height: moderate blockage
    this.stepsPerFrame = 12;
    this.force = [0, 0];
    this.hist = [];
    this.t = 0;
    const N = this.N;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.f = [device.createBuffer({ size: N * 9 * 4, usage }), device.createBuffer({ size: N * 9 * 4, usage })];
    this.mask = device.createBuffer({ size: N * 4, usage });
    this.mac = device.createBuffer({ size: N * 16, usage });
    this.frc = device.createBuffer({ size: N * 8, usage });
    this.outF = device.createBuffer({ size: 8, usage });
    this.readF = device.createBuffer({ size: 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.params = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const stepMod = device.createShaderModule({ code: STEP });
    this.stepPipe = device.createComputePipeline({ layout: 'auto', compute: { module: stepMod, entryPoint: 'main' } });
    this.redPipe = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: REDUCE }), entryPoint: 'main' } });
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    const rmod = device.createShaderModule({ code: RENDER });
    this.renderPipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: rmod, entryPoint: 'vs' }, fragment: { module: rmod, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
    this.stepBG = [0, 1].map((k) => device.createBindGroup({ layout: this.stepPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.f[k] } }, { binding: 2, resource: { buffer: this.f[1 - k] } },
      { binding: 3, resource: { buffer: this.mask } }, { binding: 4, resource: { buffer: this.mac } }, { binding: 5, resource: { buffer: this.frc } }] }));
    this.redBG = device.createBindGroup({ layout: this.redPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.frc } }, { binding: 2, resource: { buffer: this.outF } }] });
    this.renderBG = device.createBindGroup({ layout: this.renderPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.mac } }, { binding: 2, resource: { buffer: this.mask } }] });
    this.cur = 0;
    this.reading = false;
    this.reset();
  }

  writeParams() {
    const nu = this.u0 * this.chord / this.re;
    const tau = 3 * nu + 0.5;
    const b = new ArrayBuffer(32), dv = new DataView(b);
    dv.setUint32(0, this.nx, true); dv.setUint32(4, this.ny, true);
    dv.setFloat32(8, tau, true); dv.setFloat32(12, this.u0, true); dv.setFloat32(16, 0.16 * 0.16, true);
    dv.setUint32(20, this.mode, true); dv.setFloat32(24, this.chord, true); dv.setFloat32(28, 1.0, true);
    this.device.queue.writeBuffer(this.params, 0, b);
    this.tau = tau;
  }

  reset() {
    const N = this.N;
    const f = new Float32Array(N * 9);
    const w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
    const cx = [0, 1, 0, -1, 0, 1, -1, -1, 1];
    const u = this.u0;
    for (let q = 0; q < 9; q++) {
      const cu = 3 * cx[q] * u;
      const v = w[q] * (1 + cu + 0.5 * cu * cu - 1.5 * u * u);
      f.fill(v, q * N, (q + 1) * N);
    }
    this.device.queue.writeBuffer(this.f[0], 0, f);
    this.device.queue.writeBuffer(this.f[1], 0, f);
    this.hist = []; this.t = 0;
    this.writeParams();
  }

  /** Rasterise the section at incidence alpha (deg) with flap (deg). */
  setFoil(sec, alphaDeg, flapFrac = 0, flapDeg = 0) {
    const pts = sectionCoords(sec, 90, flapFrac, flapDeg * Math.PI / 180);
    const a = alphaDeg * Math.PI / 180, c = this.chord;
    const x0 = Math.round(this.nx * 0.22), y0 = Math.round(this.ny * 0.5);
    const poly = pts.map(([px, py]) => [x0 + c * ((px - 0.25) * Math.cos(a) + py * Math.sin(a)), y0 + c * (-(px - 0.25) * Math.sin(a) + py * Math.cos(a))]);
    const m = new Uint32Array(this.N);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const xa = Math.floor(Math.min(...xs)), xb = Math.ceil(Math.max(...xs)), ya = Math.floor(Math.min(...ys)), yb = Math.ceil(Math.max(...ys));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && x >= 0 && y >= 0 && x < this.nx && y < this.ny) m[y * this.nx + x] = 1;
    }
    this.device.queue.writeBuffer(this.mask, 0, m);
    this.alpha = alphaDeg;
    this.hist = [];
  }

  setRe(re) { this.re = re; this.writeParams(); }
  setMode(m) { this.mode = m; this.writeParams(); }

  step(n = this.stepsPerFrame) {
    const d = this.device;
    const enc = d.createCommandEncoder();
    for (let s = 0; s < n; s++) {
      const p = enc.beginComputePass();
      p.setPipeline(this.stepPipe);
      p.setBindGroup(0, this.stepBG[this.cur]);
      p.dispatchWorkgroups(Math.ceil(this.nx / WG), Math.ceil(this.ny / WG));
      p.end();
      this.cur = 1 - this.cur;
    }
    this.t += n;
    const doRead = !this.reading;
    if (doRead) {
      const p = enc.beginComputePass();
      p.setPipeline(this.redPipe); p.setBindGroup(0, this.redBG); p.dispatchWorkgroups(1); p.end();
      enc.copyBufferToBuffer(this.outF, 0, this.readF, 0, 8);
    }
    const view = this.ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    rp.setPipeline(this.renderPipe); rp.setBindGroup(0, this.renderBG); rp.draw(3); rp.end();
    d.queue.submit([enc.finish()]);
    if (doRead) {
      this.reading = true;
      this.readF.mapAsync(GPUMapMode.READ).then(() => {
        const v = new Float32Array(this.readF.getMappedRange().slice(0));
        this.readF.unmap();
        const q = 0.5 * this.u0 * this.u0 * this.chord;
        this.force = [v[0] / q, v[1] / q]; // Cd, Cl (per unit span, lattice units)
        this.hist.push({ t: this.t, cd: this.force[0], cl: this.force[1] });
        if (this.hist.length > 400) this.hist.shift();
        this.reading = false;
      }).catch(() => { this.reading = false; });
    }
  }

  /** Time-averaged coefficients over the last part of the history. */
  averaged() {
    const h = this.hist.slice(-Math.max(5, Math.floor(this.hist.length / 3)));
    if (!h.length) return { cl: 0, cd: 0 };
    return { cl: h.reduce((a, b) => a + b.cl, 0) / h.length, cd: h.reduce((a, b) => a + b.cd, 0) / h.length };
  }
}
