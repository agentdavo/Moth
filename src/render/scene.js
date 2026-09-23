// Three.js WebGPU scene: Moth with lofted foils coloured by the physics, water with
// animated TSL surface, force vectors and the GPU flow-particle field.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { color, positionWorld, time, sin, cos, vec3, float, mix, normalWorld, cameraPosition, dot, normalize, abs, pow } from 'three/tsl';
import { foilGeometry, strutGeometry, hullGeometry, sailGeometry, tube, toThree } from './geometryBuilders.js';
import { FlowField } from './flowField.js';
import { DEG } from '../physics/constants.js';

export function ramp(t) {
  // blue -> cyan -> green -> yellow -> red
  t = Math.min(1, Math.max(0, t));
  const stops = [[0.13, 0.35, 0.95], [0.1, 0.8, 0.95], [0.2, 0.85, 0.35], [0.98, 0.85, 0.2], [0.95, 0.25, 0.18]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}

export class MothScene {
  async init(container) {
    this.container = container;
    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    await renderer.init();
    this.renderer = renderer;
    this.isWebGPU = !!renderer.backend.isWebGPUBackend;
    this.device = this.isWebGPU ? renderer.backend.device : null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1622);
    scene.fog = new THREE.Fog(0x0b1622, 14, 40);
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.05, 200);
    camera.position.set(-3.7, 0.95, -2.35);
    const cam = new URLSearchParams(location.search).get('cam');
    this.camera = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-1.0, -0.28, 0.05);
    if (cam) { const v = cam.split(',').map(Number); camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]); }
    controls.enableDamping = true;
    controls.update();
    this.controls = controls;

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x4a7f99, 1.6));
    const under = new THREE.DirectionalLight(0x9fd8ff, 0.9);
    under.position.set(-2, -6, 2);
    scene.add(under);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 8, -3);
    scene.add(sun);

    // water surface: animated normal perturbation + fresnel tint; translucent so foils are visible
    const wmat = new THREE.MeshStandardNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15, metalness: 0.0 });
    const p = positionWorld;
    const t = time.mul(0.9);
    const wave = sin(p.x.mul(3.1).add(t.mul(2.0))).mul(0.5).add(sin(p.z.mul(2.3).sub(t.mul(1.3)).add(p.x.mul(1.1))).mul(0.5));
    wmat.normalNode = normalize(vec3(cos(p.x.mul(3.1).add(t.mul(2.0))).mul(0.05), float(1), cos(p.z.mul(2.3).sub(t)).mul(0.05)));
    const fres = pow(float(1).sub(abs(dot(normalize(cameraPosition.sub(p)), vec3(0, 1, 0)))), 3.0);
    wmat.colorNode = mix(color(0x0b4f6c), color(0x5fb3c9), fres.add(wave.mul(0.04)));
    wmat.opacityNode = float(0.16).add(fres.mul(0.22));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), wmat);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 10;
    scene.add(water);
    this.water = water;
    // underwater depth grid for scale (0.25 m spacing)
    const grid = new THREE.GridHelper(12, 48, 0x1f4a60, 0x143444);
    grid.position.y = -1.6;
    scene.add(grid);
    // metre stick on the main strut position
    this.boat = new THREE.Group();
    scene.add(this.boat);
    this.mats = {
      foil: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }),
      hull: new THREE.MeshStandardNodeMaterial({ color: 0xe9eef2, roughness: 0.5 }),
      carbon: new THREE.MeshStandardNodeMaterial({ color: 0x22262b, roughness: 0.4, metalness: 0.2 }),
      sail: new THREE.MeshStandardNodeMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.88, roughness: 0.7 }),
      tramp: new THREE.MeshStandardNodeMaterial({ color: 0x39424c, side: THREE.DoubleSide, roughness: 0.9 }),
      sailor: new THREE.MeshStandardNodeMaterial({ color: 0xf2a33a, roughness: 0.6 }),
      skin: new THREE.MeshStandardNodeMaterial({ color: 0xd9a27a, roughness: 0.8 }),
    };
    this.foilMeshes = [];
    this.arrows = new THREE.Group();
    scene.add(this.arrows);
    if (this.isWebGPU) {
      const info = this.device.adapterInfo || renderer.backend.adapter?.info || {};
      const swift = /swiftshader/i.test(`${info.architecture} ${info.vendor} ${info.description}`);
      this.software = swift;
      this.flow = new FlowField(renderer, scene, swift ? 5000 : 14000);
    }
    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.resize());
    renderer.setAnimationLoop(() => this.frame());
    return this;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  frame() {
    const dt = this.clock.getDelta();
    this.controls.update();
    if (this.flow && this.flowActive) this.flow.step(dt);
    if (this.onFrame) this.onFrame(dt);
    this.renderer.render(this.scene, this.camera);
  }

  clearBoat() {
    for (const c of [...this.boat.children]) { this.boat.remove(c); c.geometry?.dispose?.(); }
  }

  /**
   * Rebuild the boat for a design and a solved condition.
   * detail: from api.conditionDetail (heel, z0, flap, elevator, sailor, forces, strips, segments)
   */
  setBoat(design, detail, colorMode = 'load') {
    this.clearBoat();
    const B = this.boat;
    const m = design.main, e = design.elevator, b = design.boat;
    const L = design.mainStrut.length;
    const strips = detail?.strips || [];
    const colorFrom = (surf) => {
      const ss = strips.filter((s) => s.surf === surf);
      if (!ss.length) return null;
      return (eta, yb) => {
        let best = ss[0], bd = 1e9;
        for (const s of ss) { const d = Math.abs(s.yb - yb); if (d < bd) { bd = d; best = s; } }
        if (colorMode === 'cav') return ramp(1 - Math.min(1, Math.max(0, best.cav) / 1.2));
        if (colorMode === 'cp') return ramp(Math.min(1, -best.cp / 0.9));
        return ramp(Math.abs(best.stall));
      };
    };
    const mainG = foilGeometry(m, 0, 0, { flapDeg: detail?.flap ?? 0, isMain: true, colorFn: colorFrom('main') });
    const elevRot = (detail?.elev ?? 0);
    const elevG = foilGeometry({ ...e, incidence: (e.incidence || 0) + elevRot }, e.x, e.z || 0, { colorFn: colorFrom('elev') });
    const mstrutFn = colorFrom('mstrut'), rstrutFn = colorFrom('rstrut');
    const sG = strutGeometry(design.mainStrut, m.rootChord * 0.25 + 0.0, 0, { colorFn: mstrutFn ? (t) => mstrutFn(t, 0) : null });
    const rG = strutGeometry(design.rudderStrut, e.x + e.rootChord * 0.25, e.z || 0, { colorFn: rstrutFn ? (t) => rstrutFn(t, 0) : null });
    for (const g of [mainG, elevG, sG, rG]) B.add(new THREE.Mesh(g, this.mats.foil));
    // hull + deck gear
    const keel = L;
    B.add(new THREE.Mesh(hullGeometry(keel), this.mats.hull));
    const deckZ = keel + b.deckAboveKeel;
    // wings (racks): tubes from hull to max beam 2.25 m
    for (const s of [1, -1]) {
      const y = 1.125 * s;
      B.add(tube([0.55, 0.15 * s, deckZ - 0.02], [0.25, y, deckZ + 0.05], 0.018, this.mats.carbon));
      B.add(tube([-1.05, 0.15 * s, deckZ - 0.02], [-0.85, y, deckZ + 0.05], 0.018, this.mats.carbon));
      B.add(tube([0.25, y, deckZ + 0.05], [-0.85, y, deckZ + 0.05], 0.02, this.mats.carbon));
      const tramp = new THREE.BufferGeometry();
      const q = [[0.55, 0.15 * s, deckZ], [0.25, y, deckZ + 0.05], [-0.85, y, deckZ + 0.05], [-1.05, 0.15 * s, deckZ]].map((v) => toThree(...v));
      tramp.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
      tramp.computeVertexNormals();
      B.add(new THREE.Mesh(tramp, this.mats.tramp));
    }
    // gantry to the rudder strut
    B.add(tube([-1.88, 0.12, deckZ - 0.05], [e.x + 0.03, 0, deckZ + 0.08], 0.015, this.mats.carbon));
    B.add(tube([-1.88, -0.12, deckZ - 0.05], [e.x + 0.03, 0, deckZ + 0.08], 0.015, this.mats.carbon));
    // rig: mast, boom, sail (sheeted by apparent wind)
    const mastX = 0.30;
    B.add(tube([mastX, 0, deckZ], [mastX, 0, deckZ + 5.1], 0.022, this.mats.carbon));
    const sheet = detail?.sheetDeg ?? 10;
    const boomAng = sheet * DEG;
    B.add(tube([mastX, 0, deckZ + 0.2], [mastX - 2.05 * Math.cos(boomAng), 2.05 * Math.sin(boomAng), deckZ + 0.2], 0.018, this.mats.carbon));
    B.add(new THREE.Mesh(sailGeometry(mastX, deckZ + 0.12, { sheetDeg: sheet, camber: detail?.sailCamber ?? 0.09, twistDeg: detail?.sailTwist ?? 10 }), this.mats.sail));
    // wand at the bow
    const psi = detail?.wandPsi ?? 40 * DEG;
    const wl = b.wandLength;
    B.add(tube([b.wandX, 0, deckZ - 0.05], [b.wandX + wl * Math.sin(psi), 0, deckZ - 0.05 - wl * Math.cos(psi)], 0.006, this.mats.carbon));
    // sailor hiking on the windward (-y body) wing
    const xs = detail?.sailorX ?? -0.3, ys = detail?.sailorY ?? 1.2;
    const hip = [xs, -Math.min(1.1, ys), deckZ + 0.1];
    const shoulder = [xs, -Math.min(1.1, ys) - 0.45 * Math.min(1, ys / 1.35), deckZ + 0.1 + 0.55];
    B.add(tube(hip, shoulder, 0.13, this.mats.sailor));
    B.add(tube([xs + 0.1, -0.55, deckZ + 0.08], hip, 0.075, this.mats.sailor));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), this.mats.skin);
    head.position.set(...toThree(shoulder[0], shoulder[1] - 0.1, shoulder[2] + 0.18));
    B.add(head);
    B.add(tube(shoulder, [mastX - 0.9, -0.3, deckZ + 0.9], 0.035, this.mats.skin));

    // attitude: heel about x, ride height
    const heel = (detail?.heel ?? 0) * DEG;
    B.rotation.set(heel, 0, 0);
    B.position.set(0, detail?.z0 ?? (b.rideHeight - L), 0);
    this.setArrows(detail);
    this.setFlow(detail, design);
  }

  setArrows(detail) {
    for (const c of [...this.arrows.children]) this.arrows.remove(c);
    if (!detail?.forces || !this.showForces) return;
    const k = 1 / 900; // m per N
    for (const f of detail.forces) {
      const dir = new THREE.Vector3(...toThree(...f.F));
      const len = dir.length();
      if (len < 1) continue;
      const a = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(...toThree(...f.P)), Math.max(0.05, len * k), f.color, 0.08, 0.05);
      this.arrows.add(a);
    }
  }

  setFlow(detail, design) {
    if (!this.flow) return;
    const segs = detail?.segments;
    this.flowActive = !!(segs && segs.n > 0);
    if (!this.flowActive) { this.flow.sprite.visible = false; return; }
    const V = detail.V;
    this.flow.setSegments(segs.data, segs.n, toThree(-V, -(detail.beta || 0) * DEG * V, 0));
    const depth = detail.depth ?? 0.4;
    // a sheet of tracers around the foil depth, slightly wider than the span, so tip vortices,
    // downwash and the elevator's passage through the main-foil wake stand out
    this.flow.setSeedBox(0.25, design.main.span * 0.6, -depth - 0.07, -Math.max(0.03, depth - 0.07), design.elevator.x - 1.2);
  }
}
