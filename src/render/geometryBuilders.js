// Procedural geometry for the Moth: lofted foils (with deflected flap), struts, hull,
// wings, rig, sail and sailor. All builders return BufferGeometry in Three.js
// coordinates of the *body* frame:  X = body x (fwd),  Y = body z (up the strut),
// Z = -body y (starboard / windward).
import * as THREE from 'three/webgpu';
import { sectionCoords } from '../physics/sections.js';
import { halfPaths, planformStats } from '../physics/geometry.js';

const toThree = (x, y, z) => [x, z, -y]; // body (x, y, z) -> three

/**
 * Lofted horizontal foil from the generalised spanwise paths (main span, winglets,
 * feather tips). Sections are streamwise, rotated into the local path frame; the
 * main-foil flap is deflected in place and humpback tubercles bump the leading edge.
 * `colorFn(pb)` takes the body-frame point of a station and returns [r,g,b].
 */
export function foilGeometry(f, x0, z0, { flapDeg = 0, isMain = false, colorFn = null, nSec = 30 } = {}) {
  const tub = f.tubercleAmp || 0;
  const dense = tub > 0 ? 8 : 3;
  const paths = halfPaths(f, 16, dense);
  const flapHalf = (f.flapSpan || 0) * f.span / 2;
  const cRef = planformStats(f).mac;
  const lambda = Math.max(0.1, f.tubercleWave || 0.3) * cRef;
  const pos = [], col = [], idx = [];
  for (const side of [1, -1]) {
    for (const path of paths) {
      const base = pos.length / 3;
      let ring = 0;
      for (const st of path) {
        const flapped = isMain && st.kind === 'main' && st.P[1] <= flapHalf && (f.flapFrac || 0) > 0;
        const pts = sectionCoords({ family: f.family, tc: st.tc, cli: f.cli || 0 }, nSec - 1, flapped ? f.flapFrac : 0, flapped ? flapDeg * Math.PI / 180 : 0);
        ring = pts.length;
        const up = [0, -st.t[2], st.t[1]];
        const c = st.chord, cs = Math.cos(st.twist), sn = Math.sin(st.twist);
        const bump = tub > 0 && st.kind === 'main' ? tub * c * Math.cos(2 * Math.PI * st.s / lambda) : 0;
        const pb = [x0 + st.P[0], side * st.P[1], z0 + st.P[2]];
        const rgb = colorFn ? colorFn(pb) : [0.8, 0.82, 0.86];
        for (const [px, py] of pts) {
          let lx = -(px - 0.25) * c;
          if (bump && px < 0.35) lx += bump * (1 - px / 0.35) ** 2;
          const lz = py * c;
          const a = lx * cs - lz * sn, b = lx * sn + lz * cs;   // along chord (x), along local up
          const X = x0 + st.P[0] + a;
          const Y = side * (st.P[1] + b * up[1]);
          const Z = z0 + st.P[2] + b * up[2];
          pos.push(...toThree(X, Y, Z));
          col.push(...rgb);
        }
      }
      const n = path.length;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < ring - 1; j++) {
          const a = base + i * ring + j, b = a + 1, c = a + ring, d = c + 1;
          if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
        }
      }
      // cap the outboard end (and the inboard end of tip devices)
      const caps = path[0].kind === 'main' ? [n - 1] : [0, n - 1];
      for (const i of caps) {
        const b0 = base + i * ring;
        for (let j = 1; j < ring - 2; j++) {
          const flip = (i === n - 1) === (side > 0);
          if (flip) idx.push(b0, b0 + j, b0 + j + 1); else idx.push(b0, b0 + j + 1, b0 + j);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical strut from body z = z0 to z0 + length at quarter-chord x = xq. */
export function strutGeometry(s, xLE, z0, { colorFn = null, nSec = 28, nSpan = 12 } = {}) {
  const pts = sectionCoords({ family: s.family, tc: s.tc, cli: 0 }, nSec - 1);
  const pos = [], col = [], idx = [];
  const ring = pts.length;
  for (let k = 0; k <= nSpan; k++) {
    const t = k / nSpan;
    const z = z0 + t * s.length;
    const rgb = colorFn ? colorFn(t) : [0.75, 0.77, 0.8];
    for (const [px, py] of pts) {
      pos.push(...toThree(xLE - px * s.chord, py * s.chord, z));
      col.push(...rgb);
    }
  }
  for (let i = 0; i < nSpan; i++) for (let j = 0; j < ring - 1; j++) {
    const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Narrow Moth hull: stations from transom (x=-1.9) to bow (x=+1.455), keel at body z = zKeel. */
export function hullGeometry(zKeel, { bowX = 1.455, sternX = -1.9, beam = 0.34, depth = 0.30 } = {}) {
  const nX = 28, nA = 14;
  const pos = [], idx = [];
  for (let i = 0; i <= nX; i++) {
    const t = i / nX;
    const x = sternX + (bowX - sternX) * t;
    const fwd = Math.max(0, (t - 0.55) / 0.45);
    const half = beam / 2 * Math.sqrt(Math.max(0.02, 1 - fwd ** 1.8)) * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    const keelRise = 0.12 * fwd ** 2;
    const d = depth * (1 - 0.15 * fwd);
    for (let j = 0; j <= nA; j++) {
      const a = Math.PI * j / nA; // 0 = port deck edge -> pi = starboard deck edge
      const y = half * Math.cos(a);
      const zz = zKeel + keelRise + d * (1 - Math.sin(a) * 0.95) * 1.0;
      const zb = zKeel + keelRise + (1 - Math.sin(a)) * d;
      pos.push(...toThree(x, y, Math.min(zz, zb)));
    }
  }
  const ring = nA + 1;
  for (let i = 0; i < nX; i++) for (let j = 0; j < nA; j++) {
    const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // deck
  const deckStart = pos.length / 3;
  for (let i = 0; i <= nX; i++) {
    const p0 = i * ring, p1 = i * ring + nA;
    pos.push(pos[p0 * 3], pos[p0 * 3 + 1], pos[p0 * 3 + 2], pos[p1 * 3], pos[p1 * 3 + 1], pos[p1 * 3 + 2]);
  }
  for (let i = 0; i < nX; i++) {
    const a = deckStart + 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Cambered, twisted sail between mast and leech. camber to +body y (leeward). */
export function sailGeometry(mastX, footZ, { luff = 5.0, foot = 2.05, head = 0.55, camber = 0.09, twistDeg = 12, sheetDeg = 8 } = {}) {
  const nU = 24, nV = 14;
  const pos = [], idx = [], col = [];
  for (let i = 0; i <= nU; i++) {
    const u = i / nU; // height fraction
    const chord = foot + (head - foot) * u ** 1.3;
    const ang = (sheetDeg + twistDeg * u) * Math.PI / 180;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV; // chordwise
      const cam = camber * chord * 4 * v * (1 - v) * (1 - 0.3 * u);
      // chord runs aft and is sheeted to leeward (+y) by ang; camber bulges to leeward
      const x = mastX - v * chord * Math.cos(ang) + cam * Math.sin(ang);
      const y = v * chord * Math.sin(ang) + cam * Math.cos(ang);
      pos.push(...toThree(x, y, footZ + u * luff));
      const shade = 0.82 + 0.12 * (1 - v);
      col.push(shade, shade, shade * 1.02);
    }
  }
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
    const a = i * (nV + 1) + j, b = a + 1, c = a + nV + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function tube(a, b, r, mat, seg = 8) {
  const A = new THREE.Vector3(...toThree(...a)), B = new THREE.Vector3(...toThree(...b));
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

export { toThree };
