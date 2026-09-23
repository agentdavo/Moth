// Velocity prediction program for a foiling Moth.
//
// For each (TWS, TWA, heel) the boat is trimmed in 6 DOF:
//   Fz  : foils + sail vertical component carry the weight           -> main flap (wand)
//   Fy  : struts + tilted foils resist the sail side force            -> leeway
//   Fz,e: elevator carries a target share of the weight               -> elevator rake (twist grip)
//   My  : pitch balanced by the sailor's fore/aft position            -> sailor x (clamped; else elevator)
//   Mx  : roll balanced by hiking; beyond max hike the sail is flattened -> sailor y / sail CL
//   Fx  : drive = drag                                                -> boat speed
// Speed is the largest steady equilibrium that is feasible (flap/elevator within range,
// no stall). If no foiling equilibrium exists a displacement-mode estimate is returned.
import { G, DEG, RHO_WATER, clamp, KNOT } from './constants.js';
import { buildLattice, planformStats } from './geometry.js';
import { solveLattice, finishSolution } from './vlm.js';
import { hydroForces } from './hydro.js';
import { sailForce, sailCLmax } from './sail.js';
import { solveSmall } from './linalg.js';
import { WIND_BANDS } from './design.js';

// speed gain from pumping sail + body to initiate foiling (class rule 12.1 alters RRS 42)
export const PUMP = 1.15;

export class MothModel {
  constructor(design, opts = {}) {
    this.d = design;
    this.b = design.boat;
    this.cache = new Map();
    this.imageSign = opts.imageSign ?? 1;
    this.gpuSolutions = opts.gpuSolutions || null; // optional map key -> G (Float32Array) from GPU batch
    this.W = (this.b.hullMass + this.b.sailorMass) * G;
    this.Ws = this.b.sailorMass * G;
    this.Wb = this.b.hullMass * G;
    this.evals = 0;
  }

  key(heel, ride) { return `${heel.toFixed(2)}|${ride.toFixed(3)}`; }

  config(heel, ride = this.b.rideHeight) {
    const k = this.key(heel, ride);
    let c = this.cache.get(k);
    if (!c) {
      const lat = buildLattice(this.d, heel, ride);
      let sol;
      const g = this.gpuSolutions?.get(k);
      if (g && g.length === lat.panels.length * 5) sol = finishSolution(lat.panels, this.imageSign, Float64Array.from(g));
      else sol = solveLattice(lat.panels, this.imageSign);
      const L = this.d.mainStrut.length;
      const T = lat.T;
      const ref = T.P([0, 0, 0]);
      const rel = (p) => { const w = T.P(p); return [w[0] - ref[0], w[1] - ref[1], w[2] - ref[2]]; };
      c = {
        lat, sol, heel: heel * DEG, heelDeg: heel, ride, key: k,
        boatCG: rel([this.b.boatX, 0, L + this.b.boatZ]),
        sailorZ: L + this.b.deckAboveKeel + this.b.sailorZ,
        ceBody: (f) => rel([0.05, 0, L + this.b.deckAboveKeel + this.b.ceAboveDeck * f]),
        J: null, u: null,
      };
      this.cache.set(k, c);
    }
    return c;
  }

  hydro(cfg, V, u) {
    this.evals++;
    return hydroForces(cfg.sol, cfg.lat, this.d, { V, theta: cfg.theta || 0, df: u[0], de: u[1], beta: u[2] });
  }

  /**
   * Trim at speed V with an external (sail+windage) force given in the track frame.
   * Returns the trimmed state incl. sailor position and residual drive.
   */
  trim(cfg, V, ext, pitchMode = 'elev') {
    const W = this.W;
    const target = this.b.elevLoadTarget * W;
    let u = cfg.u ? cfg.u.slice() : [4 * DEG, 0, 0.5 * DEG];
    const resid = (h, uu, xsFixed) => {
      const cb = Math.cos(uu[2]), sb = Math.sin(uu[2]);
      const Fty = -h.F[0] * sb + h.F[1] * cb;
      const e1 = h.F[2] + ext.F[2] - W;
      const e2 = Fty + ext.F[1];
      let e3;
      if (xsFixed === undefined) e3 = h.S.elev.F[2] - target;
      else {
        const My = h.M[1] + this.extMoment(cfg, ext, uu[2])[1] + this.Wb * cfg.boatCG[0] + this.Ws * xsFixed;
        e3 = My / 2;
      }
      return [e1, e2, e3];
    };
    const solve = (xsFixed) => {
      let h = this.hydro(cfg, V, u);
      let e = resid(h, u, xsFixed);
      const sc = V * V;
      let J = cfg.J && cfg.Jmode === (xsFixed === undefined) ? cfg.J.map((r) => r.map((x) => x * sc / cfg.Jv2)) : null;
      for (let it = 0; it < 10; it++) {
        const err = Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]);
        if (err < 0.3) break;
        if (!J || it > 2) {
          J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          const steps = [0.15 * DEG, 0.15 * DEG, 0.08 * DEG];
          for (let k = 0; k < 3; k++) {
            const u2 = u.slice(); u2[k] += steps[k];
            const e2 = resid(this.hydro(cfg, V, u2), u2, xsFixed);
            for (let r = 0; r < 3; r++) J[r][k] = (e2[r] - e[r]) / steps[k];
          }
          cfg.J = J; cfg.Jv2 = sc; cfg.Jmode = xsFixed === undefined;
        }
        const du = solveSmall(J, e.map((x) => -x));
        if (!du) break;
        const lim = 6 * DEG;
        for (let k = 0; k < 3; k++) u[k] += clamp(du[k], -lim, lim);
        u[0] = clamp(u[0], -25 * DEG, 30 * DEG);
        u[1] = clamp(u[1], -15 * DEG, 15 * DEG);
        u[2] = clamp(u[2], -10 * DEG, 10 * DEG);
        h = this.hydro(cfg, V, u);
        e = resid(h, u, xsFixed);
      }
      return { h, e };
    };
    let { h, e } = solve(undefined);
    // sailor fore/aft to balance pitch
    const Mext = this.extMoment(cfg, ext, u[2]);
    let xs = -(h.M[1] + Mext[1] + this.Wb * cfg.boatCG[0]) / this.Ws;
    let pitchLimited = false;
    if (pitchMode === 'elev' && (xs < this.b.sailorXmin || xs > this.b.sailorXmax)) {
      xs = clamp(xs, this.b.sailorXmin, this.b.sailorXmax);
      ({ h, e } = solve(xs));
      pitchLimited = true;
    }
    cfg.u = u.slice();
    // roll moment of the boat weight about the reference: r_y * (-Wb)
    const MxB = cfg.boatCG[1] * -this.Wb;
    const Mo = h.M[0] + this.extMoment(cfg, ext, u[2])[0] + MxB;
    const ph = cfg.heel;
    const ys = (-Mo / this.Ws - cfg.sailorZ * Math.sin(ph)) / Math.cos(ph);
    const cb = Math.cos(u[2]), sb = Math.sin(u[2]);
    const Rx = h.F[0] * cb + h.F[1] * sb + ext.F[0];
    const df = u[0] / DEG, de = u[1] / DEG;
    const conv = Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 3;
    const feasible = conv && df >= this.b.flapMin - 1e-6 && df <= this.b.flapMax + 1e-6 &&
      de >= this.b.elevMin - 1e-6 && de <= this.b.elevMax + 1e-6 && h.stallMax <= 1.0;
    const why = !conv ? 'no trim' : df > this.b.flapMax ? 'flap max' : df < this.b.flapMin ? 'flap min' :
      de > this.b.elevMax ? 'elev max' : de < this.b.elevMin ? 'elev min' : h.stallMax > 1 ? 'stall' : '';
    return { h, u: u.slice(), df, de, beta: u[2] / DEG, xs, ys, Rx, feasible, why, pitchLimited, V };
  }

  extMoment(cfg, ext, beta) {
    // sail force (track frame) -> world frame, applied at CE; windage at 60% of CE height
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const toW = (f) => [f[0] * cb - f[1] * sb, f[0] * sb + f[1] * cb, f[2]];
    const M = [0, 0, 0];
    const add = (F, r) => { M[0] += r[1] * F[2] - r[2] * F[1]; M[1] += r[2] * F[0] - r[0] * F[2]; M[2] += r[0] * F[1] - r[1] * F[0]; };
    if (ext.sail) add(toW(ext.sail), cfg.ceBody(ext.ceFactor));
    if (ext.windage) add(toW(ext.windage), cfg.ceBody(0.25));
    return M;
  }

  /** Evaluate the boat at speed V for a condition; sail CL adjusted to the righting moment limit. */
  atSpeed(cfg, V, cond) {
    const b = this.b;
    const twa = cond.twa * DEG, tws = cond.tws;
    const mk = (CL) => {
      const s = sailForce(b, V, tws, twa, cfg.heel, CL);
      return { s, ext: { F: [s.sail[0] + s.windage[0], s.sail[1] + s.windage[1], s.sail[2]], sail: s.sail, windage: s.windage, ceFactor: s.ceFactor } };
    };
    let CL = sailCLmax(b, sailForce(b, V, tws, twa, cfg.heel, 1).awaE);
    let { s, ext } = mk(CL);
    let r = this.trim(cfg, V, ext);
    let rollLimited = false;
    if (r.ys > b.hikeMax && CL > 0.02) {
      rollLimited = true;
      // secant on sailor offset vs CL
      let c0 = 0, y0 = null;
      { const m0 = mk(0.0); const r0 = this.trim(cfg, V, m0.ext); y0 = r0.ys; }
      let c1 = CL, y1 = r.ys;
      for (let it = 0; it < 6; it++) {
        const cn = clamp(c1 + (b.hikeMax - y1) * (c1 - c0) / ((y1 - y0) || 1e-9), 0, CL);
        ({ s, ext } = mk(cn));
        r = this.trim(cfg, V, ext);
        c0 = c1; y0 = y1; c1 = cn; y1 = r.ys;
        if (Math.abs(y1 - b.hikeMax) < 0.01) break;
      }
      CL = c1;
    }
    return { ...r, sail: s, sailCL: CL, rollLimited, cond, heel: cfg.heelDeg };
  }

  /** Minimum foiling speed at a given heel/ride height with sail force neglected. */
  takeoffSpeed(heel = 0, ride = 0.03, pitch = this.b.takeoffPitch || 0) {
    // bow-up take-off attitude; separate cache entry so flying trims keep theta = 0
    const base = this.config(heel, ride);
    const cfg = pitch === 0 ? base : (base['to' + pitch] || (base['to' + pitch] = { ...base, theta: pitch * DEG, J: null, u: null }));
    // only a lift shortfall counts against take-off (flap/elevator saturating low is an over-speed issue)
    const ok = (V) => { const r = this.trim(cfg, V, { F: [0, 0, 0] }); return r.feasible || r.why === 'flap min' || r.why === 'elev min'; };
    let lo = 1.5, hi = NaN;
    for (let V = 2; V <= 12; V += 0.4) { if (ok(V)) { hi = V; break; } lo = V; }
    if (!isFinite(hi)) return NaN;
    for (let i = 0; i < 10; i++) { const m = 0.5 * (lo + hi); if (ok(m)) hi = m; else lo = m; }
    return hi;
  }

  /** Steady foiling speed at a given TWA (deg) or null if not foiling. */
  speedAt(cond) {
    const cfg = this.config(cond.heel ?? 0, cond.ride ?? this.b.rideHeight);
    if (!this._vto) this._vto = new Map();
    let vmin = this._vto.get(cfg.key);
    if (vmin === undefined) { vmin = this.takeoffSpeed(cond.heel ?? 0, cfg.ride, 0); this._vto.set(cfg.key, vmin); }
    if (!isFinite(vmin)) return null;
    const good = (r) => r.feasible && r.Rx > 0;
    // Scan upward from the minimum flying speed: foiling drag has a hump at low speed, so a
    // self-sustaining equilibrium can exist above speeds where drive < drag (reached in
    // practice by bearing away to accelerate). Keep the highest good speed, then bisect.
    let lo = null, rlo = null, hi = null, r;
    for (let V = vmin * 1.03; V <= 24; V *= 1.12) {
      r = this.atSpeed(cfg, V, cond);
      if (good(r)) { lo = V; rlo = r; } else if (lo !== null) { hi = V; break; }
    }
    if (lo === null) return null;
    if (hi === null) hi = Math.min(24, lo * 1.12);
    for (let i = 0; i < 14; i++) {
      const m = 0.5 * (lo + hi);
      r = this.atSpeed(cfg, m, cond);
      if (good(r)) { lo = m; rlo = r; } else hi = m;
      if (hi - lo < 0.01) break;
    }
    // limiting mechanism at the top: drag or control saturation
    const rhi = this.atSpeed(cfg, hi, cond);
    return { ...rlo, V: lo, limit: rhi.feasible ? 'drag' : rhi.why, foiling: true };
  }

  /**
   * Non-foiling (hull-borne) speed. Hull resistance from the Beaver & Zseleczky (2009) tow
   * tank: R = k' * Delta_hull * V^2 with k' = 7.0e-3 (60 lb) .. 5.6e-3 s^2/m^2 (>=120 lb);
   * the foils (at full depth, flap down) unload the hull but add their own drag.
   */
  displacementSpeed(cond) {
    const b = this.b, d = this.d;
    const twa = cond.twa * DEG;
    const Sm = planformStats(d.main).area, Se = planformStats(d.elevator).area;
    const strutWet = (d.mainStrut.chord + d.rudderStrut.chord) * (d.mainStrut.length - 0.1);
    const R = (V) => {
      const q = 0.5 * RHO_WATER * V * V;
      const lift = Math.min(this.W * 0.85, q * (Sm * 0.9 + Se * 0.4));
      const disp = Math.max(0, this.W - lift);
      const kp = clamp(7.0e-3 - (disp - 267) / 267 * 1.4e-3, 5.6e-3, 7.0e-3);
      const Rhull = kp * disp * V * V;
      const Rfoil = q * (Sm + Se) * 0.013 + q * strutWet * 0.009 + (lift * lift) / (q * Math.PI * d.main.span ** 2 * 0.9 + 1e-9);
      return Rhull + Rfoil;
    };
    const drive = (V) => {
      let CL = sailCLmax(b, sailForce(b, V, cond.tws, twa, 0, 1).awaE);
      let s = sailForce(b, V, cond.tws, twa, 0, CL);
      // roll limit with the sailor at max hike, no heel; CE height above the waterline
      const zce = b.deckAboveKeel + b.ceAboveDeck * s.ceFactor + 0.1;
      const Mr = this.Ws * b.hikeMax;
      if (s.sail[1] * zce > Mr) { CL *= Mr / (s.sail[1] * zce); s = sailForce(b, V, cond.tws, twa, 0, CL); }
      return s.sail[0] + s.windage[0];
    };
    let lo = 0.1, hi = 8;
    for (let i = 0; i < 30; i++) { const m = 0.5 * (lo + hi); if (drive(m) - R(m) > 0) lo = m; else hi = m; }
    return { V: lo, foiling: false, cond, limit: 'hull drag' };
  }

  /** Best VMG in a direction ('up' | 'down') for a TWS (m/s) and heel. */
  bestVMG(tws, dir, heel, canFoil = true) {
    const [a, b] = dir === 'up' ? [30, 68] : [105, 172];
    const f = (twa) => {
      const cond = { tws, twa, heel };
      const r = (canFoil && this.speedAt(cond)) || this.displacementSpeed(cond);
      return { r, vmg: r.V * Math.abs(Math.cos(twa * DEG)) };
    };
    // coarse scan (foiling / non-foiling makes the VMG curve discontinuous) then golden refine
    const n = 7;
    let bi = 0, fs = [];
    for (let i = 0; i < n; i++) { const t = a + (b - a) * i / (n - 1); fs.push({ t, ...f(t) }); if (fs[i].vmg > fs[bi].vmg) bi = i; }
    const gr = 0.618034;
    let lo = fs[Math.max(0, bi - 1)].t, hi = fs[Math.min(n - 1, bi + 1)].t;
    let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
    let f1 = f(x1), f2 = f(x2);
    for (let i = 0; i < 6; i++) {
      if (f1.vmg > f2.vmg) { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = f(x1); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = f(x2); }
    }
    if (fs[bi].vmg > Math.max(f1.vmg, f2.vmg)) { f1 = fs[bi]; }
    const best = f1.vmg > f2.vmg ? f1 : f2;
    return { ...best.r, twa: best.r.cond.twa, vmg: best.vmg };
  }

  /**
   * Minimum true wind (m/s) to get foiling from the hull: the displacement-mode speed on the
   * best reaching angle (x PUMP for pumping, allowed by rule 12.1) must reach the take-off
   * speed, and a sustained foiling equilibrium must exist there.
   */
  minFoilingTWS() {
    const vto = this.takeoffSpeed();
    if (!isFinite(vto)) return NaN;
    const test = (tws) => {
      for (const twa of [60, 75, 90, 105, 120]) {
        const disp = this.displacementSpeed({ tws, twa });
        if (disp.V * PUMP >= vto && this.speedAt({ tws, twa, heel: 0 })) return true;
      }
      return false;
    };
    let lo = 1.5, hi = 9;
    if (!test(hi)) return NaN;
    for (let i = 0; i < 9; i++) { const m = 0.5 * (lo + hi); if (test(m)) hi = m; else lo = m; }
    return hi;
  }

  /** Full evaluation over the wind bands. */
  evaluate(bands = WIND_BANDS, opts = {}) {
    const res = { bands: {} };
    res.takeoffV = this.takeoffSpeed(0, 0.03);
    if (!opts.skipMinTWS) res.minTWS = this.minFoilingTWS();
    for (const [k, band] of Object.entries(bands)) {
      const tws = band.tws * KNOT;
      // a band below the take-off threshold is sailed hull-borne: the sustained foiling
      // equilibrium exists but cannot be reached from the water
      const canFoil = opts.skipMinTWS || !isFinite(res.minTWS) ? isFinite(res.takeoffV) : tws >= res.minTWS;
      const up = this.bestVMG(tws, 'up', band.heelUp, canFoil);
      const down = this.bestVMG(tws, 'down', band.heelDown, canFoil);
      res.bands[k] = { up, down, tws: band.tws, canFoil };
    }
    return res;
  }

  /** Polar: boat speed vs TWA for given TWS (m/s). */
  polar(tws, heelFn, twas = [35, 40, 45, 50, 60, 75, 90, 105, 120, 135, 150, 165]) {
    return twas.map((twa) => {
      const cond = { tws, twa, heel: heelFn(twa) };
      const r = this.speedAt(cond) || this.displacementSpeed(cond);
      return { twa, V: r.V, foiling: r.foiling };
    });
  }
}
