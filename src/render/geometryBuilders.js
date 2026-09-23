// Procedural geometry for the Moth: lofted foils (with deflected flap), struts, hull,
// wings, rig, sail and sailor. All builders return BufferGeometry in Three.js
// coordinates of the *body* frame:  X = body x (fwd),  Y = body z (up the strut),
// Z = -body y (starboard / windward).
import * as THREE from 'three/webgpu';
import { sectionCoords } from '../physics/sections.js';
import { surfaceStations } from '../physics/geometry.js';

const toThree = (x, y, z) => [x, z, -y]; // body (x, y, z) -> three

/**
 * Lofted horizontal foil. `colorFn(eta, yb)` returns [r,g,b] per station (e.g. from strip cl).
 */
export function foilGeometry(f, x0, z0, { flapDeg = 0, isMain = false, colorFn = null, nSpan = 48, nSec = 36 } = {}) {
  const st = surfaceStations(f, x0, z0, nSpan);
  const pos = [], col = [], idx = [];
  const flapHalf = (f.flapSpan || 0) * f.span / 2;
  const ring = nSec * 2 - 1;
  for (const s of st) {
    const flapped = isMain && Math.abs(s.y) <= flapHalf && (f.flapFrac || 0) > 0;
    const pts = sectionCoords({ family: f.family, tc: s.tc, cli: f.cli || 0 }, nSec - 1, flapped ? f.flapFrac : 0, flapped ? flapDeg * Math.PI / 180 : 0);
    const c = s.chord, tw = s.twist;
    const cs = Math.cos(tw), sn = Math.sin(tw);
    const xq = s.xLE - 0.25 * c;
    const rgb = colorFn ? colorFn(s.eta, s.y) : [0.8, 0.82, 0.86];
    for (const [px, py] of pts) {
      // section x runs LE(0) -> TE(1) aft; rotate by twist about the quarter chord (nose up = +)
      const lx = -(px - 0.25) * c, lz = py * c;
      const X = xq + lx * cs - lz * sn;
      const Z = s.z + lx * sn + lz * cs;
      pos.push(...toThree(X, s.y, Z));
      col.push(...rgb);
    }
  }
  const nS = st.length;
  for (let i = 0; i < nS - 1; i++) {
    for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // tip caps (fan)
  for (const i of [0, nS - 1]) {
    const base = i * ring;
    for (let j = 1; j < ring - 2; j++) {
      if (i === 0) idx.push(base, base + j, base + j + 1); else idx.push(base, base + j + 1, base + j);
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
