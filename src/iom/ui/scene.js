// Three.js view of the IOM: parametric hull, lofted fin and rudder, the bulb from the physics geometry,
// and the rig from the class-rule sail dimensions. World axes: x forward (bow +), y up, z to port.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bulbOutline } from '../physics/geometry.js';
import { DEG } from '../physics/constants.js';

const VIEWS = {
  boat: { pos: [1.8, 0.16, 2.7], target: [0.0, 0.36, 0] },
  keel: { pos: [0.95, -0.05, 1.05], target: [0.0, -0.24, 0] },
  bulb: { pos: [0.35, -0.3, 0.42], target: [-0.02, -0.4, 0] },
};

function naca(t, x) { return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4); }

/** Loft a straight tapered foil between two spanwise stations (points in world coords). */
function foilMesh(root, tip, cr, ct, tc, mat, n = 24) {
  const pos = [], idx = [];
  const xs = Array.from({ length: n + 1 }, (_, i) => 0.5 - 0.5 * Math.cos(Math.PI * i / n));
  const ring = (p, c) => {
    const pts = [];
    for (let i = n; i >= 0; i--) pts.push([p[0] + c * 0.25 - c * xs[i], p[1], p[2] + naca(tc, xs[i]) * c]);
    for (let i = 1; i <= n; i++) pts.push([p[0] + c * 0.25 - c * xs[i], p[1], p[2] - naca(tc, xs[i]) * c]);
    return pts;
  };
  const r0 = ring(root, cr), r1 = ring(tip, ct), m = r0.length;
  for (const p of [...r0, ...r1]) pos.push(...p);
  for (let i = 0; i < m - 1; i++) { idx.push(i, i + 1, m + i); idx.push(i + 1, m + i + 1, m + i); }
  // caps
  const c0 = pos.length / 3; pos.push(...root); const c1 = c0 + 1; pos.push(...tip);
  for (let i = 0; i < m - 1; i++) { idx.push(c0, i + 1, i); idx.push(c1, m + i, m + i + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function hullGeometry(d, s) {
  const L = d.hull.loa, B = s.hull.B, Bm = d.hull.bmax, T = s.hull.Tc, fb = d.hull.freeboard;
  const NS = 48, NP = 14;
  const pos = [], idx = [];
  const stations = [];
  for (let i = 0; i <= NS; i++) {
    const u = i / NS;                              // 0 = stern, 1 = bow
    const xw = -L / 2 + u * L;
    const plan = Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.12 + 0.88 * u) ** 1.25), 0.55); // wide stern, fine bow
    const bw = 0.5 * B * plan, bd = 0.5 * Bm * Math.max(plan, 0.25 + 0.75 * plan);
    const depth = T * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + 0.96 * u) ** 1.1), 0.9);
    const sheer = fb + 0.012 * u * u;
    const sec = [];
    for (let k = 0; k <= NP; k++) {
      const th = (k / NP) * Math.PI / 2;
      sec.push([xw, -depth * Math.cos(th), bw * Math.sin(th)]);
    }
    for (let k = 1; k <= 4; k++) { const t = k / 4; sec.push([xw, sheer * t, bw + (bd - bw) * Math.sin(t * Math.PI / 2)]); }
    stations.push(sec);
  }
  const m = stations[0].length;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const sec of stations) for (const p of sec) pos.push(p[0], p[1], p[2] * side);
    for (let i = 0; i < NS; i++) for (let k = 0; k < m - 1; k++) {
      const a = base + i * m + k, b = a + m;
      if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setIndex(idx); hull.computeVertexNormals();
  // deck
  const dp = [], di = [];
  stations.forEach((sec) => { const p = sec[m - 1]; dp.push(p[0], p[1], p[2], p[0], p[1], -p[2]); });
  for (let i = 0; i < NS; i++) { const a = 2 * i; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  deck.setIndex(di); deck.computeVertexNormals();
  return { hull, deck };
}

function bulbGeometry(d, s) {
  const out = bulbOutline(d.bulb, s.bulb, 56);
  const NR = 28, pos = [], idx = [];
  for (const o of out) for (let k = 0; k <= NR; k++) { const a = (k / NR) * Math.PI * 2; pos.push(-o.x, o.rh * Math.cos(a), o.rw * Math.sin(a)); }
  for (let i = 0; i < out.length - 1; i++) for (let k = 0; k < NR; k++) { const a = i * (NR + 1) + k, b = a + NR + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function sailGeometry(pts) { // polygon in its own plane, fan from first point
  const pos = [], idx = [];
  pts.forEach((p) => pos.push(...p));
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class IomScene {
  init(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.clientWidth, container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, container.clientWidth / Math.max(1, container.clientHeight), 0.02, 60);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.setView('boat');
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x3a5a6a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 6, 4); this.scene.add(sun);
    const under = new THREE.DirectionalLight(0xa8d8ff, 0.8); under.position.set(-2, -5, 2); this.scene.add(under);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x2f7fa0, transparent: true, opacity: 0.16, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    this.water.rotation.x = -Math.PI / 2; this.water.renderOrder = 5;
    this.scene.add(this.water);
    this.wl = new THREE.GridHelper(4, 16, 0x6fa8c0, 0x6fa8c0); this.wl.material.transparent = true; this.wl.material.opacity = 0.18; this.wl.position.y = 0.0005;
    this.scene.add(this.wl);
    this.mats = {
      hull: new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.45 }),
      deck: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.6, side: THREE.DoubleSide }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x55606c, roughness: 0.35, metalness: 0.15 }),
      lead: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.35 }),
      spar: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.3, metalness: 0.6 }),
      main: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, side: THREE.DoubleSide, roughness: 0.8 }),
      jib: new THREE.MeshStandardMaterial({ color: 0xf6f0e4, transparent: true, opacity: 0.82, side: THREE.DoubleSide, roughness: 0.8 }),
    };
    this.boat = new THREE.Group();
    this.scene.add(this.boat);
    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(container);
    r.setAnimationLoop(() => { this.controls.update(); r.render(this.scene, this.camera); });
    this.applyTheme();
    return this;
  }

  setView(name) {
    this.viewName = name;
    const v = VIEWS[name] || VIEWS.boat;
    let target = new THREE.Vector3(...v.target);
    // keel and bulb views follow the (heeled) bulb
    if (this.bulbMesh && name !== 'boat') {
      this.boat.updateMatrixWorld(true);
      const b = this.bulbMesh.getWorldPosition(new THREE.Vector3());
      target = name === 'bulb' ? b.add(new THREE.Vector3(-0.1, 0, 0)) : b.multiplyScalar(0.5).add(new THREE.Vector3(0, -0.02, 0));
    }
    const off = new THREE.Vector3(...v.pos).sub(new THREE.Vector3(...v.target));
    // portrait viewports (phones): back off so the boat still fits horizontally
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    if (aspect < 1.25) off.multiplyScalar(Math.min(2.6, 1.25 / Math.max(0.3, aspect)));
    this.camera.position.copy(target.clone().add(off));
    this.controls.target.copy(target);
    this.controls.update();
  }

  applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue('--scene-bg').trim() || '#0b1219';
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(new THREE.Color(bg), 6, 16);
  }

  resize() {
    const w = this.container.clientWidth, h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.viewName && Math.abs(w / h - (this.lastAspect || w / h)) > 0.2) this.setView(this.viewName);
    this.lastAspect = w / h;
  }

  /** Rebuild for a design (d), statics (s), rig key and attitude {heel, leeway, rudder, sheet}. */
  setBoat(d, s, att = {}) {
    for (const c of [...this.boat.children]) { this.boat.remove(c); c.geometry?.dispose?.(); }
    const B = this.boat;
    const L = d.hull.loa;
    const X = (xFromBow) => L / 2 - xFromBow;         // world x of a station measured from the bow
    const { hull, deck } = hullGeometry(d, s);
    B.add(new THREE.Mesh(hull, this.mats.hull));
    B.add(new THREE.Mesh(deck, this.mats.deck));
    const xf = X(s.xFin);
    // fin
    const Tc = s.hull.Tc, span = s.fin.span, sw = (d.fin.sweep || 0) * DEG;
    B.add(foilMesh([xf, -Tc + 0.004, 0], [xf - span * Math.tan(sw), -Tc - span, 0], d.fin.rootChord, d.fin.tipChord, d.fin.tc, this.mats.carbon));
    // bulb (centroid under its fore-aft position)
    const xb = xf + s.xOffset;
    const bm = new THREE.Mesh(bulbGeometry(d, s), this.mats.lead);
    bm.position.set(xb + s.bulb.xc * s.bulb.L, -s.draft + s.bulb.h / 2, 0);
    B.add(bm); this.bulbMesh = bm;
    // rudder
    const xr = xf - d.rudder.xFromFin;
    const rud = foilMesh([0, 0, 0], [0, -d.rudder.span, 0], d.rudder.rootChord, d.rudder.tipChord, d.rudder.tc, this.mats.carbon);
    rud.position.set(xr, -0.35 * Tc + 0.004, 0);
    rud.rotation.y = -(att.rudder || 0) * DEG;
    B.add(rud);
    // rig
    const rig = s.rig, xm = xf + 0.10;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0053, 0.0053, rig.zTop - d.hull.freeboard, 10), this.mats.spar);
    mast.position.set(xm, (rig.zTop + d.hull.freeboard) / 2, 0); B.add(mast);
    const sheet = -(att.sheet ?? 12) * DEG;             // boom to leeward (starboard, -z)
    const main = new THREE.Group(); main.position.set(xm, 0, 0); main.rotation.y = sheet; B.add(main);
    const mf = rig.mainArea / Math.max(1e-6, rig.zTop - rig.zFoot) * 1.55;  // foot length approx
    const foot = Math.min(0.36, mf);
    const zb = rig.zFoot + 0.05, zh = rig.zTop - 0.02;
    main.add(new THREE.Mesh(sailGeometry([[-0.006, zb, 0], [-0.006 - foot, zb, 0], [-0.006 - foot * 0.45, zb + (zh - zb) * 0.62, 0], [-0.03, zh, 0], [-0.006, zh, 0]]), this.mats.main));
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, foot, 8), this.mats.spar); boom.rotation.z = Math.PI / 2; boom.position.set(-foot / 2, zb - 0.004, 0); main.add(boom);
    const jib = new THREE.Group(); jib.position.set(xm + 0.36, 0, 0); jib.rotation.y = sheet * 1.2; B.add(jib);
    const jl = rig.jibArea / Math.max(1e-6, rig.zTop * 0.85) * 1.9, jz0 = d.hull.freeboard + 0.04, jz1 = jz0 + (rig.zTop - jz0) * 0.83;
    const jfoot = Math.min(0.38, jl);
    jib.add(new THREE.Mesh(sailGeometry([[0, jz0, 0], [-jfoot, jz0, 0], [-(0.36 - 0.02) * 0.9, jz1, 0]]), this.mats.jib));
    const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4), this.mats.spar);
    const a = new THREE.Vector3(xm + 0.36, jz0, 0), b = new THREE.Vector3(xm + 0.02, jz1, 0);
    stay.position.copy(a.clone().add(b).multiplyScalar(0.5)); stay.scale.y = a.distanceTo(b);
    stay.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); B.add(stay);
    // attitude: port tack, heeled to starboard
    B.rotation.set(-(att.heel || 0) * DEG, 0, 0);
  }
}
