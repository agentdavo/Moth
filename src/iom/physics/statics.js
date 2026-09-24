// Mass budget, hydrostatics and stability of an IOM.
//
// Stability: GZ(phi) = GM sin(phi) with the metacentre treated as fixed. Gilbert & Bantock
// (onemetre.net "Stiffness", AMYA MY #173) note that "for normal IOM hull shapes and normal heel angles
// the metacentric height varies very little and it is reasonable to consider M as a fixed point".
// Bantock's Hydromax results (Seahorse, Feb 2009): GZ(40°) = 115 mm for a 135 mm waterline beam with no
// form stability, rising ~25 mm per +50 mm of waterline beam (validated in tests/iom.test.mjs).
import { G, RHO_W, RHO_LEAD, DEG } from './constants.js';
import { bulbGeometry, foilGeometry, finDeflection, hullGeometry } from './geometry.js';
import { RULES } from './rules.js';
import { buildRig, RIG_KEYS } from './sails.js';

export function computeStatics(d, rigKey = 'A') {
  const h = d.hull, kd = d.keel;
  const L = h.lwl;
  const rigs = Object.fromEntries(RIG_KEYS.map((k) => [k, buildRig(k, h.freeboard)]));
  const rig = rigs[rigKey] || rigs.A;
  const rudG = foilGeometry(d.rudder, d.rudder.span, d.rudder.density);
  const rudderMass = rudG.mass + d.rudder.stock;
  const others = h.mass + h.radio + d.rig.mass + rudderMass;
  const keelMass = Math.min(kd.mass, RULES.keelMassMax);
  const total = Math.max(RULES.massMin, keelMass + others);
  const corrector = total - keelMass - others;
  const volTot = total / RHO_W;

  // fixed point: fin span <- bulb height <- bulb mass <- fin mass; Tc <- appendage volumes
  let Tc = 0.045, finG = null, bulbG = null, span = 0.33, bulbMass = keelMass - 0.1;
  let hull = null;
  for (let it = 0; it < 40; it++) {
    finG = foilGeometry(d.fin, span, d.fin.density);
    bulbMass = keelMass - finG.mass;
    bulbG = bulbGeometry(d.bulb, bulbMass);
    const volApp = bulbG.vol + finG.vol + rudG.vol;
    hull = hullGeometry(h, volTot - volApp);
    Tc = hull.Tc;
    const spanNew = kd.draft - Tc - bulbG.h * 0.95;   // fin enters the bulb a little
    if (Math.abs(spanNew - span) < 1e-12) break;
    span = spanNew;
  }
  const draft = Tc + span + bulbG.h * 0.95;

  // vertical positions (m, + up from the waterline)
  const zFin = -(Tc + finG.yc);
  const zBulb = -(draft - bulbG.h / 2);
  const zRud = -(0.35 * Tc + rudG.yc);
  const zCorr = -0.7 * Tc;
  const xFin = h.finX * L;
  const items = [
    { name: 'hull', m: h.mass, z: h.massZ, x: 0.52 * L },
    { name: 'radio', m: h.radio, z: h.radioZ, x: 0.45 * L },
    { name: 'correctors', m: corrector, z: zCorr, x: h.lcb * L },
    { name: 'rig', m: d.rig.mass, z: rig.zCG, x: xFin - 0.10 },
    { name: 'rudder', m: rudderMass, z: zRud, x: xFin + d.rudder.xFromFin },
    { name: 'fin', m: finG.mass, z: zFin, x: xFin },
  ];
  const vols = [
    { v: hull.volC, z: hull.zB, x: h.lcb * L },
    { v: finG.vol, z: zFin, x: xFin },
    { v: rudG.vol, z: zRud, x: xFin + d.rudder.xFromFin },
  ];
  // bulb fore-aft offset that floats the boat level (everything else fixed); used when xOffset is null
  const Sm = items.reduce((s, i) => s + i.m * i.x, 0);
  const Sv = vols.reduce((s, v) => s + v.v * v.x, 0);
  const xBulbLevel = (RHO_W * Sv - Sm) / (bulbMass - RHO_W * bulbG.vol);
  const xOffsetLevel = xFin - xBulbLevel;
  const xOffset = d.bulb.xOffset ?? xOffsetLevel;
  items.push({ name: 'bulb', m: bulbMass, z: zBulb, x: xFin - xOffset });
  vols.push({ v: bulbG.vol, z: zBulb, x: xFin - xOffset });
  const zG = items.reduce((s, i) => s + i.m * i.z, 0) / total;
  const xG = items.reduce((s, i) => s + i.m * i.x, 0) / total;
  const zB = vols.reduce((s, v) => s + v.v * v.z, 0) / volTot;
  const xB = vols.reduce((s, v) => s + v.v * v.x, 0) / volTot;
  const BM = hull.IT / volTot;
  const zM = zB + BM;
  const GM = zM - zG;
  const trim = Math.atan(total * (xG - xB) / (RHO_W * hull.IL)); // + = stern down (x aft positive), - = bow down

  // fin bending under the bulb weight at 40 deg heel
  const deflection = finDeflection(d.fin, span, bulbMass * G * Math.sin(40 * DEG), d.fin.modulus);

  const GZ = (phiDeg) => GM * Math.sin(phiDeg * DEG);
  const RM = (phiDeg) => total * G * GZ(phiDeg);
  return {
    rigKey, rig, rigs,
    mass: { total, keel: keelMass, fin: finG.mass, bulb: bulbMass, rudder: rudderMass, corrector, others, items },
    hull, fin: { ...finG, span, deflection, zc: zFin, depthRoot: Tc },
    bulb: { ...bulbG, mass: bulbMass, z: zBulb, zBottom: -draft },
    rudder: { ...rudG, mass: rudderMass, zc: zRud, depthRoot: 0.35 * Tc },
    draft, zG, xG, zB, xB, BM, zM, GM, trim, xOffsetLevel, xOffset, xFin, GZ, RM, vol: volTot,
    gz40: GZ(40),
  };
}

/** GZ curve samples for plotting. */
export function gzCurve(s, maxDeg = 90) {
  const pts = [];
  for (let a = 0; a <= maxDeg; a += 2.5) pts.push({ phi: a, gz: s.GZ(a), rm: s.RM(a) });
  return pts;
}

export { RHO_LEAD };
