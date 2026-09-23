import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR, CAR_TYPES, carSpec } from './config.js';

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;

/**
 * Procedural cars. Every body is a loft: ~70 cross-sections along the
 * length, each a rounded profile (floor, flared sides, shoulder, greenhouse,
 * roof), driven by a handful of shape parameters per car type — so the GT,
 * rally hatch, long-hood muscle car, hypercar, open-wheel formula car and
 * caged buggy all come from the same code. Faces are split into paint and
 * glass groups; trim, lights, wings, cages, helmets and decals go on top.
 *
 * Local frame matches the physics chassis: +z forward, +y up, +x left,
 * origin at the centre of mass.
 */
const DEFAULT_SHAPE = {
  halfL: 2.2, // half length
  w: 0.86, // body half width
  flare: 0.075, // fender flare over each axle
  waist: 0.03, // pinch between the axles
  arches: true,
  floor: -0.43,
  belt: 0.1, // beltline / hood height
  hoodDrop: 0.19, // how far the hood falls to the nose
  tailRise: 0.06,
  crown: 0.045, // fender crowns
  roof: 0.56,
  cabin: [0.8, 0.1, -0.62, -1.35], // windscreen base, roof front, roof rear, rear window base
  cabinW: 0.78,
  noseLen: 0.34,
  tailLen: 0.16,
  duck: 0.035, // ducktail lip
  open: false, // open cockpit (formula, buggy)
  formula: false,
  pods: 0, // formula side pods
  wing: 'gt', // gt | big | rally | formula | none
  lights: 'gt', // gt | round | none
  splitter: true,
  skirts: true,
  diffuser: true,
  mirrors: true,
  extras: [],
};

function shapeOf(typeId) {
  const t = CAR_TYPES.find((c) => c.id === typeId) || CAR_TYPES[0];
  const spec = carSpec(t.id);
  const W = spec.wheel;
  const sag = 9.82 / (4 * W.stiffness);
  return { S: { ...DEFAULT_SHAPE, ...t.shape }, W, wheelY: W.height - (W.restLength - sag), spec };
}

function sectionParams(z, shape) {
  const { S, W, wheelY } = shape;
  const L = S.halfL;
  const wheels = [W.front, W.rear];
  const nose = z > L - S.noseLen ? Math.sqrt(Math.max(0, 1 - ((z - (L - S.noseLen)) / S.noseLen) ** 2)) : 1;
  const tail = z < -L + S.tailLen ? Math.sqrt(Math.max(0, 1 - ((z - (-L + S.tailLen)) / S.tailLen) ** 2)) : 1;
  const tip = Math.min(nose, tail);
  let w = S.w;
  for (const zw of wheels) w += S.flare * Math.exp(-(((z - zw) / 0.55) ** 2));
  w -= S.waist * Math.exp(-(((z + 0.1) / 0.5) ** 2));
  if (S.pods) w += S.pods * smooth(W.front - 0.45, W.front - 0.95, z) * smooth(W.rear + 0.2, W.rear + 0.7, z);
  w *= (S.formula ? 0.35 : 0.2) + (S.formula ? 0.65 : 0.8) * Math.pow(tip, 0.6);
  let yb = S.floor + (1 - nose) * (S.formula ? 0.02 : 0.12) + (1 - tail) * 0.08;
  if (S.arches) {
    for (const zw of wheels) {
      const dz = z - zw;
      const r = W.radius + 0.07;
      if (Math.abs(dz) < r) yb = Math.max(yb, wheelY + Math.sqrt(r * r - dz * dz) * 0.92);
    }
  }
  const [zf, zrf, zrr, zr] = S.cabin;
  let belt = S.belt;
  belt -= smooth(zf + 0.1, L, z) * S.hoodDrop;
  belt += smooth(-0.6, -L, z) * S.tailRise;
  if (S.arches) for (const zw of wheels) belt += S.crown * Math.exp(-(((z - zw) / 0.45) ** 2));
  let roof;
  if (S.open) roof = belt + 0.02;
  else if (z > zf) roof = belt + 0.035;
  else if (z > zrf) roof = lerp(S.roof, belt + 0.035, Math.pow((z - zrf) / (zf - zrf), 1.25));
  else if (z > zrr) roof = S.roof + 0.012 * Math.sin(((z - zrr) / (zrf - zrr)) * Math.PI);
  else if (z > zr) roof = lerp(belt + 0.07, S.roof, Math.pow((z - zr) / (zrr - zr), 0.85));
  else roof = belt + 0.07 - smooth(zr, -L, z) * 0.02;
  roof += Math.exp(-(((z + L - 0.18) / 0.1) ** 2)) * S.duck;
  const inCabin = !S.open && z < zf + 0.05 && z > zr - 0.05;
  const wc = S.open ? w * 0.97 : inCabin ? w * (S.cabinW - 0.04 * smooth(zrf, zrr, z)) : w * 0.86;
  const hTip = 0.25 + 0.75 * tip;
  const mid = (yb + roof) / 2;
  return { w, wc, yb: mid + (yb - mid) * hTip, belt: mid + (belt - mid) * hTip, roof: mid + (roof - mid) * hTip };
}

/** Right-half profile; the same point count for every section so the loft stitches. */
function sectionProfile(p) {
  const pts = [];
  const add = (x, y, seg) => pts.push({ x, y, seg });
  const { w, wc, yb, belt, roof } = p;
  const r = Math.min(0.07, w * 0.3);
  for (let i = 0; i < 4; i++) add((w - r) * (i / 4), yb, 'floor');
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2);
    add(w - r + Math.cos(a) * r, yb + r + Math.sin(a) * r, 'floor');
  }
  const side = 7;
  const top = Math.max(yb + r + 0.01, belt - 0.05);
  for (let i = 0; i <= side; i++) {
    const t = i / side;
    const y = lerp(yb + r, top, t);
    const bulge = Math.sin(t * Math.PI) * 0.018 - (1 - t) * (1 - t) * 0.03;
    add(w + bulge * Math.min(1, w / 0.5), y, 'side');
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    add(wc + (w - wc) * Math.cos(a), top + Math.sin(a) * 0.06, 'shoulder');
  }
  const gh = 5;
  const base = top + 0.06;
  for (let i = 1; i <= gh; i++) {
    const t = i / gh;
    const y = lerp(base, Math.max(base + 0.002, roof - 0.045), t);
    add(wc - (wc * 0.12 + 0.02) * Math.pow(t, 1.4), y, 'glass');
  }
  const rw = wc - (wc * 0.12 + 0.02);
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    add(rw * (1 - t), Math.max(base, roof - 0.045 * Math.cos((t * Math.PI) / 2) ** 3), 'roof');
  }
  return pts;
}

function buildShell(shape) {
  const { S } = shape;
  const L = S.halfL;
  const [zf, zrf, zrr, zr] = S.cabin;
  const zs = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    zs.push(lerp(-L, L, t - Math.sin(t * Math.PI * 2) * 0.1));
  }
  const rings = zs.map((z) => ({ z, prof: sectionProfile(sectionParams(z, shape)) }));
  const M = rings[0].prof.length;
  const cols = M * 2 - 1;
  const pos = [];
  const segs = [];
  for (const { z, prof } of rings) {
    const ring = [];
    for (let i = M - 1; i >= 0; i--) ring.push({ x: -prof[i].x, y: prof[i].y, seg: prof[i].seg });
    for (let i = 1; i < M; i++) ring.push({ x: prof[i].x, y: prof[i].y, seg: prof[i].seg });
    for (const p of ring) {
      pos.push(p.x, p.y, z);
      segs.push(p.seg);
    }
  }
  const paint = [];
  const glass = [];
  const R = rings.length;
  for (let r = 0; r < R - 1; r++) {
    const z = (rings[r].z + rings[r + 1].z) / 2;
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      const sa = segs[a];
      const sb = segs[b];
      const seg = sa === sb ? sa : sa === 'glass' || sb === 'glass' ? 'glass' : sa === 'roof' || sb === 'roof' ? 'roof' : sa;
      let isGlass = false;
      if (!S.open) {
        if (seg === 'roof') isGlass = (z < zf - 0.06 && z > zrf + 0.04) || (z < zrr - 0.06 && z > zr + 0.08);
        else if (seg === 'glass') isGlass = z < zrf + 0.02 && z > zr + 0.12 && Math.abs(z - (zrr - 0.05)) > 0.07;
      }
      (isGlass ? glass : paint).push(a, b, d, b, e, d);
    }
  }
  for (const [r, dir] of [
    [0, -1],
    [R - 1, 1],
  ]) {
    let cx = 0;
    let cy = 0;
    for (let c = 0; c < cols; c++) {
      cx += pos[(r * cols + c) * 3];
      cy += pos[(r * cols + c) * 3 + 1];
    }
    const centre = pos.length / 3;
    pos.push(cx / cols, cy / cols, rings[r].z + dir * 0.012);
    segs.push('floor');
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      if (dir > 0) paint.push(a, a + 1, centre);
      else paint.push(a + 1, a, centre);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([...paint, ...glass]);
  geo.addGroup(0, paint.length, 0);
  geo.addGroup(paint.length, glass.length, 1);
  geo.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = pos[i * 3 + 2] / (2 * L) + 0.5;
    uv[i * 2 + 1] = pos[i * 3 + 1] + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const tube = (a, b, r, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(a.x, a.y, a.z);
  return g.toNonIndexed();
};

const partsCache = new Map();

function buildParts(typeId) {
  if (partsCache.has(typeId)) return partsCache.get(typeId);
  const shape = shapeOf(typeId);
  const { S, W, wheelY } = shape;
  const L = S.halfL;
  const sec = (z) => sectionParams(z, shape);
  const shell = buildShell(shape);
  const trim = [];
  const paintX = [];
  const lamps = [];
  const tails = [];
  const chrome = [];
  const helmet = [];
  const box = (list, w, h, d, x, y, z, rx = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(x, y, z);
    list.push(g.toNonIndexed());
  };
  const front = sec(L - 0.3);
  const bodyW = S.w + S.flare;
  if (S.splitter) box(trim, bodyW * 1.9, 0.035, 0.3, 0, S.floor + 0.02, L - 0.12);
  if (!S.open) box(trim, bodyW * 1.3, 0.16, 0.06, 0, front.yb + 0.16, L - 0.08);
  if (S.skirts) for (const s of [-1, 1]) box(trim, 0.05, 0.08, (W.front - W.rear) * 0.62, s * (sec(0).w + 0.05), S.floor + 0.05, (W.front + W.rear) / 2);
  if (S.diffuser) {
    box(trim, bodyW * 1.7, 0.05, 0.1, 0, S.floor + 0.05, -L + 0.12);
    for (let i = -2; i <= 2; i++) box(trim, 0.02, 0.12, 0.34, i * 0.28, S.floor + 0.07, -L + 0.2);
  }
  // Wings.
  const rearZ = -L + 0.28;
  const rearTop = sec(rearZ).roof;
  if (S.wing === 'gt' || S.wing === 'big') {
    const big = S.wing === 'big';
    const h = big ? 0.34 : 0.16;
    const span = big ? 1.95 : 1.72;
    for (const s of [-1, 1]) box(trim, 0.04, h, 0.05, s * 0.36, rearTop + h / 2, rearZ);
    const blade = new THREE.BoxGeometry(span, 0.03, big ? 0.38 : 0.3);
    blade.rotateX(-0.12);
    blade.translate(0, rearTop + h + 0.02, rearZ);
    trim.push(blade.toNonIndexed());
    for (const s of [-1, 1]) box(trim, 0.02, big ? 0.2 : 0.12, 0.38, s * span * 0.5, rearTop + h, rearZ);
  } else if (S.wing === 'rally') {
    const z = S.cabin[2] - 0.12;
    const blade = new THREE.BoxGeometry(bodyW * 1.5, 0.04, 0.36);
    blade.rotateX(-0.28);
    blade.translate(0, S.roof + 0.03, z);
    paintX.push(blade.toNonIndexed());
    for (const s of [-1, 1]) box(trim, 0.03, 0.1, 0.3, s * bodyW * 0.72, S.roof, z);
  } else if (S.wing === 'formula') {
    // Front wing ahead of the front wheels, rear wing high behind the engine cover.
    const fz = W.front + W.radius + 0.18;
    box(trim, 1.72, 0.03, 0.42, 0, S.floor + 0.08, fz);
    box(paintX, 1.6, 0.025, 0.16, 0, S.floor + 0.14, fz - 0.08, -0.25);
    for (const s of [-1, 1]) box(trim, 0.02, 0.16, 0.46, s * 0.86, S.floor + 0.14, fz);
    const rz = -L + 0.12;
    box(trim, 1.02, 0.03, 0.34, 0, 0.52, rz, -0.15);
    box(paintX, 1.02, 0.025, 0.18, 0, 0.62, rz - 0.06, -0.3);
    for (const s of [-1, 1]) box(paintX, 0.02, 0.42, 0.44, s * 0.51, 0.45, rz);
    box(trim, 0.05, 0.36, 0.1, 0, 0.3, rz + 0.1);
  }
  // Mirrors.
  if (S.mirrors) {
    const zc = S.cabin[0] - 0.2;
    const p = sec(zc);
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(1, 12, 8);
      g.scale(0.06, 0.055, 0.11);
      g.translate(s * (p.w + 0.1), p.belt + 0.1, zc);
      paintX.push(g.toNonIndexed());
      box(trim, 0.05, 0.05, 0.12, s * (p.w + 0.04), p.belt + 0.08, zc);
    }
  }
  // Lights.
  const lz = L - (S.formula ? 0.2 : 0.26);
  const lp = sec(lz);
  if (S.lights === 'gt') {
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(1, 16, 8);
      g.scale(0.2, 0.05, 0.16);
      g.rotateY(s * 0.35);
      g.translate(s * lp.w * 0.72, lp.belt - 0.035, lz);
      lamps.push(g.toNonIndexed());
    }
  } else if (S.lights === 'round') {
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20);
      g.rotateX(Math.PI / 2);
      g.translate(s * lp.w * 0.62, (lp.belt + lp.yb) / 2 + 0.04, L - 0.05);
      lamps.push(g.toNonIndexed());
    }
  }
  const tp = sec(-L + 0.1);
  if (S.formula) box(tails, 0.12, 0.08, 0.04, 0, 0.12, -L + 0.06);
  else {
    box(tails, Math.min(1.46, tp.w * 1.7), 0.03, 0.05, 0, tp.belt - 0.02, -L + 0.09);
    for (const s of [-1, 1]) box(tails, 0.3, 0.07, 0.05, s * tp.w * 0.72, tp.belt - 0.06, -L + 0.1);
  }
  // Exhausts.
  const exhausts = S.formula ? [[0, 0.16]] : [[0.34, S.floor + 0.13], [-0.34, S.floor + 0.13]];
  for (const [x, y] of exhausts) {
    const g = new THREE.CylinderGeometry(0.05, 0.055, 0.14, 14, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, -L + 0.06);
    chrome.push(g.toNonIndexed());
  }
  // Extras.
  const ex = new Set(S.extras);
  if (ex.has('lightbar')) {
    const z = S.open ? 0.35 : S.cabin[1] + 0.05;
    const y = S.open ? 1.05 : S.roof + 0.08;
    box(trim, 0.9, 0.04, 0.05, 0, y - 0.02, z);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16);
      g.rotateX(Math.PI / 2);
      g.translate((i - 1.5) * 0.24, y + 0.05, z + 0.03);
      lamps.push(g.toNonIndexed());
    }
  }
  if (ex.has('mudflaps')) for (const s of [-1, 1]) for (const zw of [W.front, W.rear]) box(trim, 0.2, 0.2, 0.02, s * W.track, wheelY - 0.12, zw - W.radius - 0.06);
  if (ex.has('hoodScoop')) {
    const z = (S.cabin[0] + L) / 2;
    box(paintX, 0.5, 0.1, 0.7, 0, sec(z).belt + 0.06, z);
    box(trim, 0.42, 0.06, 0.03, 0, sec(z).belt + 0.08, z + 0.35);
  }
  if (ex.has('fins')) for (const s of [-1, 1]) box(paintX, 0.03, 0.22, 0.9, s * 0.22, sec(-L + 0.8).roof + 0.08, -L + 0.8);
  if (ex.has('helmet')) {
    const hz = S.formula ? -0.35 : -0.15;
    const hy = S.formula ? 0.22 : 0.52;
    const g = new THREE.SphereGeometry(0.15, 20, 14);
    g.scale(1, 1.05, 1.1);
    g.translate(0, hy, hz);
    helmet.push(g.toNonIndexed());
    const visor = new THREE.SphereGeometry(0.152, 20, 8, -0.9, 1.8, 1.1, 0.6);
    visor.rotateY(Math.PI / 2);
    visor.translate(0, hy, hz);
    trim.push(visor.toNonIndexed());
    // Cockpit opening.
    const hole = new THREE.CylinderGeometry(1, 1, 0.02, 24);
    hole.scale(S.formula ? 0.24 : 0.5, 1, S.formula ? 0.5 : 0.7);
    hole.translate(0, sec(hz).roof + 0.005, hz + 0.05);
    trim.push(hole.toNonIndexed());
  }
  if (ex.has('airbox')) {
    const g = new THREE.CylinderGeometry(0.07, 0.16, 0.9, 4, 1);
    g.rotateY(Math.PI / 4);
    g.rotateX(Math.PI / 2 - 0.2);
    g.translate(0, 0.36, -0.9);
    paintX.push(g.toNonIndexed());
  }
  if (ex.has('halo')) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.24, 0.12, -0.55), new THREE.Vector3(-0.22, 0.4, -0.25), new THREE.Vector3(0, 0.44, 0.05), new THREE.Vector3(0.22, 0.4, -0.25), new THREE.Vector3(0.24, 0.12, -0.55)]);
    trim.push(new THREE.TubeGeometry(curve, 20, 0.025, 6).toNonIndexed());
    trim.push(tube(new THREE.Vector3(0, 0.44, 0.05), new THREE.Vector3(0, 0.12, 0.3), 0.025));
  }
  if (ex.has('cage')) {
    const y0 = S.belt + 0.02;
    const y1 = 1.02;
    const zs = [0.45, -0.55];
    const xw = S.w * 0.95;
    for (const z of zs) {
      trim.push(tube(new THREE.Vector3(xw, y0, z), new THREE.Vector3(xw * 0.8, y1, z - 0.1), 0.03));
      trim.push(tube(new THREE.Vector3(-xw, y0, z), new THREE.Vector3(-xw * 0.8, y1, z - 0.1), 0.03));
      trim.push(tube(new THREE.Vector3(xw * 0.8, y1, z - 0.1), new THREE.Vector3(-xw * 0.8, y1, z - 0.1), 0.03));
    }
    for (const s of [-1, 1]) {
      trim.push(tube(new THREE.Vector3(s * xw * 0.8, y1, zs[0] - 0.1), new THREE.Vector3(s * xw * 0.8, y1, zs[1] - 0.1), 0.03));
      trim.push(tube(new THREE.Vector3(s * xw * 0.8, y1, zs[0] - 0.1), new THREE.Vector3(s * xw, y0, L - 0.35), 0.03));
      trim.push(tube(new THREE.Vector3(s * xw * 0.8, y1, zs[1] - 0.1), new THREE.Vector3(s * xw * 0.9, y0, -L + 0.3), 0.03));
    }
    // Seat.
    box(trim, 0.5, 0.5, 0.12, 0, y0 + 0.25, -0.42, 0.15);
  }
  if (ex.has('spare')) {
    const g = new THREE.TorusGeometry(0.28, 0.1, 10, 24);
    g.rotateX(Math.PI / 2 - 0.35);
    g.translate(0, S.belt + 0.25, -L + 0.3);
    trim.push(g.toNonIndexed());
  }
  const merged = (list) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))) : null);
  const parts = {
    shape,
    shell,
    trimGeo: merged(trim),
    paintGeo: merged(paintX),
    lampGeo: merged(lamps),
    tailGeo: merged(tails),
    chromeGeo: merged(chrome),
    helmetGeo: merged(helmet),
  };
  partsCache.set(typeId, parts);
  return parts;
}

let sharedMats = null;

function sharedMaterials(materials) {
  if (sharedMats) return sharedMats;
  const glass = new THREE.MeshPhysicalMaterial({ name: 'שמשות', color: 0x0b0f14, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 });
  const trim = new THREE.MeshStandardMaterial({ name: 'פלסטיק שחור', color: 0x111214, roughness: 0.55, metalness: 0.2 });
  const chrome = materials.lib.chrome || new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
  const head = new THREE.MeshStandardMaterial({ name: 'פנסים', color: 0xdfe8ff, roughness: 0.1, metalness: 0.3, emissive: 0xe8f0ff, emissiveIntensity: 1 });
  materials.trackEmissive(head, 0.6);
  const helmet = new THREE.MeshPhysicalMaterial({ name: 'קסדה', color: 0xf4f4f4, roughness: 0.25, clearcoat: 1 });
  sharedMats = { glass, trim, chrome, head, helmet };
  return sharedMats;
}

function numberTexture(number, color) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#f4f4f2';
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = '#111';
  g.font = '800 150px "IBM Plex Sans Hebrew", "Rubik", "Arial", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 128, 138);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Builds one car body (without wheels) of the given type. Returns the group
 * plus handles for brake lights and paint.
 */
export function createCarModel(materials, { color = '#d42a2a', number = 1, stripe = '#f2f2f2', type = 'gt' } = {}) {
  const parts = buildParts(type);
  const { S } = parts.shape;
  const M = sharedMaterials(materials);
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ name: 'צבע', color: new THREE.Color(color), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15 });
  // Racing stripes painted in the shader (object space), so the shell stays one mesh.
  const stripeColor = new THREE.Color(stripe);
  paint.onBeforeCompile = (shader) => {
    shader.uniforms.uStripe = { value: stripeColor };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform vec3 uStripe;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float ax = abs(vObj.x);
        float aw = fwidth(ax) * 1.5;
        float s = smoothstep(0.1 - aw, 0.1, ax) * (1.0 - smoothstep(0.22, 0.22 + aw, ax));
        s *= step(0.02, vObj.y + 0.05);
        diffuseColor.rgb = mix(diffuseColor.rgb, uStripe, s);
      }`,
    );
  };
  paint.customProgramCacheKey = () => 'shimotron-carpaint';
  const tailMat = new THREE.MeshStandardMaterial({ name: 'פנס אחורי', color: 0x300404, roughness: 0.2, metalness: 0.1, emissive: 0xff1a0a, emissiveIntensity: 1 });
  materials.trackEmissive(tailMat, 0.25);
  const add = (geo, mat, shadow = true) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(parts.shell, [paint, M.glass]);
  add(parts.trimGeo, M.trim);
  add(parts.paintGeo, paint);
  add(parts.lampGeo, M.head, false);
  add(parts.tailGeo, tailMat, false);
  add(parts.chromeGeo, M.chrome);
  add(parts.helmetGeo, M.helmet);
  // Numbers on both flanks and on top.
  const numMat = new THREE.MeshStandardMaterial({ map: numberTexture(number, color), transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  const nz = S.formula ? -0.75 : S.open ? -0.1 : -0.15;
  const door = sectionParams(nz, parts.shape);
  const size = Math.min(0.36, (door.belt - door.yb) * 0.9);
  for (const s of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), numMat);
    plane.position.set(s * (door.w + 0.022), (door.yb + door.belt) / 2 + 0.02, nz);
    plane.rotation.y = (s * Math.PI) / 2;
    g.add(plane);
  }
  const topZ = S.open ? S.halfL - 0.55 : -0.25;
  const top = sectionParams(topZ, parts.shape);
  const topNum = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.42, top.w * 1.2), Math.min(0.42, top.w * 1.2)), numMat);
  topNum.rotation.set(-Math.PI / 2, 0, Math.PI);
  topNum.position.set(0, top.roof + 0.004, topZ);
  g.add(topNum);
  g.userData.paint = paint;
  return { group: g, paint, tailMat, headMat: M.head };
}

/**
 * Side-view silhouette of a car type for the garage cards, drawn from the
 * same loft curves as the 3D body.
 */
export function drawCarProfile(canvas, typeId, color = '#e0262b') {
  const shape = shapeOf(typeId);
  const { S, W, wheelY } = shape;
  const g = canvas.getContext('2d');
  const Wd = canvas.width;
  const Hd = canvas.height;
  g.clearRect(0, 0, Wd, Hd);
  const L = S.halfL;
  const scale = (Wd * 0.86) / (2 * L + 0.9);
  const ground = wheelY - W.radius;
  const cx = Wd / 2;
  const cy = Hd * 0.8;
  const X = (z) => cx - z * scale; // nose to the left in the Hebrew (RTL) card
  const Y = (y) => cy - (y - ground) * scale;
  const zs = [];
  for (let i = 0; i <= 90; i++) zs.push(lerp(-L, L, i / 90));
  const secs = zs.map((z) => ({ z, ...sectionParams(z, shape) }));
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(cx, cy + 2, L * scale * 1.05, 6, 0, 0, Math.PI * 2);
  g.fill();
  // Body.
  g.beginPath();
  secs.forEach((p, i) => (i ? g.lineTo(X(p.z), Y(p.roof)) : g.moveTo(X(p.z), Y(p.roof))));
  for (let i = secs.length - 1; i >= 0; i--) g.lineTo(X(secs[i].z), Y(secs[i].yb));
  g.closePath();
  const grad = g.createLinearGradient(0, Y(S.roof), 0, Y(S.floor));
  grad.addColorStop(0, color);
  grad.addColorStop(1, '#101216');
  g.fillStyle = grad;
  g.fill();
  // Glass band.
  if (!S.open) {
    const [zf, , , zr] = S.cabin;
    g.beginPath();
    const cab = secs.filter((p) => p.z < zf - 0.05 && p.z > zr + 0.1);
    cab.forEach((p, i) => (i ? g.lineTo(X(p.z), Y(p.roof - 0.05)) : g.moveTo(X(p.z), Y(p.roof - 0.05))));
    for (let i = cab.length - 1; i >= 0; i--) g.lineTo(X(cab[i].z), Y(Math.min(cab[i].roof - 0.05, cab[i].belt + 0.07)));
    g.closePath();
    g.fillStyle = 'rgba(12,16,22,0.9)';
    g.fill();
  }
  if (S.extras.includes('helmet')) {
    g.fillStyle = '#f2f2f2';
    g.beginPath();
    g.arc(X(S.formula ? -0.35 : -0.15), Y(S.formula ? 0.22 : 0.52), 0.15 * scale, 0, Math.PI * 2);
    g.fill();
  }
  if (S.extras.includes('cage')) {
    g.strokeStyle = '#2a2d33';
    g.lineWidth = Math.max(2, 0.05 * scale);
    g.beginPath();
    g.moveTo(X(L - 0.35), Y(S.belt));
    g.lineTo(X(0.35), Y(1.02));
    g.lineTo(X(-0.65), Y(1.02));
    g.lineTo(X(-L + 0.3), Y(S.belt));
    g.stroke();
  }
  if (S.wing !== 'none') {
    g.fillStyle = '#15171b';
    const rz = S.wing === 'rally' ? S.cabin[2] - 0.12 : -L + (S.wing === 'formula' ? 0.12 : 0.28);
    const ry = S.wing === 'rally' ? S.roof + 0.03 : S.wing === 'formula' ? 0.6 : sectionParams(rz, shape).roof + (S.wing === 'big' ? 0.36 : 0.18);
    g.fillRect(X(rz) - 0.2 * scale, Y(ry) - 0.03 * scale, 0.4 * scale, 0.06 * scale);
    if (S.wing !== 'rally') g.fillRect(X(rz) - 0.02 * scale, Y(ry), 0.04 * scale, (ry - sectionParams(rz, shape).roof) * scale);
  }
  // Wheels.
  for (const zw of [W.front, W.rear]) {
    g.fillStyle = '#0c0c0e';
    g.beginPath();
    g.arc(X(zw), Y(wheelY), W.radius * scale, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b9bdc4';
    g.beginPath();
    g.arc(X(zw), Y(wheelY), W.radius * scale * 0.62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a3d44';
    g.beginPath();
    g.arc(X(zw), Y(wheelY), W.radius * scale * 0.2, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * All wheels of all cars as two InstancedMeshes (tyres + rims), updated
 * from each car's chassis matrix every frame. Geometry is built for the
 * base wheel; other sizes are a per-instance scale.
 */
export class WheelBatch {
  constructor(materials, capacity) {
    const W = CAR.wheel;
    this.baseRadius = W.radius;
    this.baseWidth = W.width;
    const r = W.radius;
    const hw = W.width / 2;
    const prof = [];
    const rr = 0.05;
    prof.push(new THREE.Vector2(r * 0.64, -hw * 0.9));
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * (Math.PI / 2);
      prof.push(new THREE.Vector2(r - rr + Math.sin(t) * rr, -hw + rr - Math.cos(t) * rr));
    }
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * (Math.PI / 2);
      prof.push(new THREE.Vector2(r - rr + Math.cos(t) * rr, hw - rr + Math.sin(t) * rr));
    }
    prof.push(new THREE.Vector2(r * 0.64, hw * 0.9));
    const tyre = new THREE.LatheGeometry(prof, 36);
    tyre.rotateZ(Math.PI / 2);
    const rim = [];
    const rimR = r * 0.68;
    const lip = new THREE.TorusGeometry(rimR, 0.012, 6, 36);
    lip.rotateY(Math.PI / 2);
    lip.translate(-hw + 0.02, 0, 0);
    rim.push(lip.toNonIndexed());
    const barrel = new THREE.CylinderGeometry(rimR * 0.98, rimR * 0.98, W.width * 0.8, 28, 1, true);
    barrel.rotateZ(Math.PI / 2);
    rim.push(barrel.toNonIndexed());
    for (let i = 0; i < 5; i++) {
      for (const off of [-0.09, 0.09]) {
        const sp = new THREE.BoxGeometry(0.026, rimR * 0.92, 0.04);
        sp.translate(0, rimR * 0.46, 0);
        sp.rotateX(0.02);
        sp.rotateX((i / 5) * Math.PI * 2 + off);
        sp.translate(-hw + 0.03, 0, 0);
        rim.push(sp.toNonIndexed());
      }
    }
    const cap = new THREE.CylinderGeometry(0.055, 0.065, 0.05, 12);
    cap.rotateZ(Math.PI / 2);
    cap.translate(-hw + 0.03, 0, 0);
    rim.push(cap.toNonIndexed());
    const disc = new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 28);
    disc.rotateZ(Math.PI / 2);
    disc.translate(0.02, 0, 0);
    rim.push(disc.toNonIndexed());
    const rimGeo = mergeGeometries(rim);
    this.tyreGeo = tyre;
    this.rimGeo = rimGeo;
    this.tyreMat = new THREE.MeshStandardMaterial({ name: 'צמיג', color: 0x151515, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.rimMat = new THREE.MeshStandardMaterial({ name: 'חישוק', color: 0xc9ccd2, roughness: 0.28, metalness: 1 });
    this.tyres = new THREE.InstancedMesh(tyre, this.tyreMat, capacity);
    this.rims = new THREE.InstancedMesh(rimGeo, this.rimMat, capacity);
    for (const m of [this.tyres, this.rims]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.group = new THREE.Group();
    this.group.add(this.tyres, this.rims);
    this.capacity = capacity;
    this.used = 0;
  }

  /** Scale vector for a wheel spec relative to the batch geometry. */
  scaleFor(wheel) {
    return new THREE.Vector3(wheel.width / this.baseWidth, wheel.radius / this.baseRadius, wheel.radius / this.baseRadius);
  }

  reset() {
    this.used = 0;
    this.tyres.count = this.rims.count = 0;
  }

  allocate() {
    const base = this.used;
    this.used += 4;
    this.tyres.count = this.rims.count = this.used;
    return base;
  }

  set(i, matrix) {
    this.tyres.setMatrixAt(i, matrix);
    this.rims.setMatrixAt(i, matrix);
  }

  commit() {
    this.tyres.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.tyres.dispose();
    this.rims.dispose();
  }
}
