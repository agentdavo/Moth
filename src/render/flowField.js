// GPU flow visualisation: thousands of tracer particles advected (TSL compute shader)
// through the velocity field of the *solved* vortex lattice, evaluated with the
// Biot-Savart law over every bound/trailing segment and its free-surface image.
// This is the same potential-flow solution the VPP uses, so the tip vortices,
// downwash behind the main foil and the strut wakes are physically consistent.
import * as THREE from 'three/webgpu';
import {
  Fn, instancedArray, instanceIndex, uniform, vec3, float, int, Loop, If, hash, cross, dot, length, max, mix, color, time, select,
} from 'three/tsl';

export const MAX_SEG = 640;

export class FlowField {
  constructor(renderer, scene, count = 8000) {
    this.renderer = renderer;
    this.count = count;
    this.enabled = true;
    const pos = instancedArray(count, 'vec3');
    const ind = instancedArray(count, 'float');
    const segA = instancedArray(MAX_SEG, 'vec4');
    const segB = instancedArray(MAX_SEG, 'vec4');
    this.segA = segA; this.segB = segB; this.pos = pos; this.ind = ind;
    this.uSeg = uniform(0, 'int');
    this.uVinf = uniform(new THREE.Vector3(-8, 0, 0));
    this.uDt = uniform(0.016);
    this.uTimeScale = uniform(0.10);
    this.uSeed = uniform(new THREE.Vector4(1.6, 1.2, -1.1, 0.7)); // x0, halfSpanZ, yMin, yMax(depth range)
    this.uBox = uniform(new THREE.Vector4(1.4, -3.6, 0.0, 0)); // xSpawn, xKill, surface y
    const { uSeg, uVinf, uDt, uTimeScale, uSeed, uBox } = this;

    // returns a new seed position (Fn parameters are copied, so the caller assigns)
    const respawn = Fn(([k]) => {
      const s = instanceIndex.toFloat().mul(3.0).add(k);
      const r1 = hash(s);
      const r2 = hash(s.add(7919.0));
      const r3 = hash(s.add(104729.0));
      return vec3(uBox.x.add(r3.mul(0.15)), mix(uSeed.z, uSeed.w, r2), r1.sub(0.5).mul(2).mul(uSeed.y));
    });

    this.init = Fn(() => {
      const p = pos.element(instanceIndex);
      p.assign(respawn(float(0)));
      // spread initial x along the domain
      p.x.assign(mix(uBox.y, uBox.x, hash(instanceIndex.toFloat().add(31337.0))));
    })().compute(count);

    const velocityAt = Fn(([p]) => {
      const v = vec3(0).toVar();
      Loop({ start: int(0), end: uSeg, type: 'int', condition: '<' }, ({ i }) => {
        const a = segA.element(i);
        const b = segB.element(i);
        const A = a.xyz, B = b.xyz;
        const r1 = p.sub(A), r2 = p.sub(B), r0 = B.sub(A);
        const c = cross(r1, r2);
        const c2 = dot(c, c).add(dot(r0, r0).mul(4e-5));
        const l1 = max(length(r1), 1e-4), l2 = max(length(r2), 1e-4);
        const k = a.w.mul(dot(r0, r1.div(l1).sub(r2.div(l2)))).div(c2.mul(4 * Math.PI));
        v.addAssign(c.mul(k));
      });
      return v;
    });

    this.update = Fn(() => {
      const p = pos.element(instanceIndex);
      const vi = velocityAt(p);
      const v = uVinf.add(vi);
      p.addAssign(v.mul(uDt.mul(uTimeScale)));
      ind.element(instanceIndex).assign(length(vi).div(max(length(uVinf), 0.1)));
      const out = p.x.lessThan(uBox.y).or(p.y.greaterThan(uBox.z)).or(p.y.lessThan(uSeed.z.sub(0.8)));
      If(out, () => { p.assign(respawn(time.mul(977.0).floor().mul(5.0))); });
    })().compute(count);

    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.positionNode = pos.toAttribute();
    const s = ind.toAttribute();
    const t = s.mul(8.0).clamp(0, 1);
    mat.colorNode = mix(color(0x2c8cff), mix(color(0xffffff), color(0xff5a3c), select(t.greaterThan(0.5), t.sub(0.5).mul(2), float(0))), t.mul(2).clamp(0, 1));
    mat.opacityNode = float(0.30).add(t.mul(0.6));
    mat.scaleNode = float(0.0065);
    this.sprite = new THREE.Sprite(mat);
    this.sprite.count = count;
    this.sprite.frustumCulled = false;
    scene.add(this.sprite);
    this.ready = renderer.computeAsync(this.init);
  }

  /** segments: Float32Array of [ax,ay,az,gamma, bx,by,bz,0]* in three.js world coords. */
  setSegments(segs, nSeg, vinf) {
    const A = this.segA.value.array, B = this.segB.value.array;
    const n = Math.min(nSeg, MAX_SEG);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) { A[i * 4 + k] = segs[i * 8 + k]; B[i * 4 + k] = segs[i * 8 + 4 + k]; }
    }
    this.segA.value.needsUpdate = true;
    this.segB.value.needsUpdate = true;
    this.uSeg.value = n;
    this.uVinf.value.set(vinf[0], vinf[1], vinf[2]);
  }

  setSeedBox(xSpawn, halfSpan, yMin, yMax, xKill) {
    this.uSeed.value.set(xSpawn, halfSpan, yMin, yMax);
    this.uBox.value.set(xSpawn, xKill, -0.005, 0);
  }

  step(dt) {
    if (!this.enabled) { this.sprite.visible = false; return; }
    this.sprite.visible = true;
    this.uDt.value = Math.min(dt, 0.05);
    this.renderer.compute(this.update);
  }
}
