import * as THREE from 'three';
import vanGz from './models/monster-van.glb.gz?url';

/**
 * The monster 4×4: a real downloaded monster truck ("[Monster Truck Game] Lunchbox Van" by
 * Jorma Rysky, CC BY 4.0; see tools/vehicles.mjs): a red van lifted on a tube chassis with
 * coil-overs and solid axles over four giant lugged tyres. The van's red paint takes the
 * driver's colour; the four tyres spin, steer and ride the suspension.
 */
let VAN = null;
const UP = new THREE.Vector3(0, 1, 0);
const AXLE = new THREE.Vector3(1, 0, 0);
const _qs = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _box = new THREE.Box3();
const _c = new THREE.Vector3();

/**
 * The meshes under a node, baked into model space (the GLB's node transforms hold the
 * dequantisation, so positions are first made plain floats).
 */
export function bakeNode(node) {
  const out = [];
  node.updateWorldMatrix(true, true);
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(o.geometry.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    out.push({ geo: g, mat: o.material });
  });
  return out;
}

/** Loads the truck (parse: a function that turns the inlined, gzipped GLB into a scene). */
export async function loadMonster(parse) {
  try {
    const gltf = await parse(vanGz);
    const node = (n) => {
      const o = gltf.scene.getObjectByName(n);
      if (!o) throw new Error(`no ${n} in the monster truck`);
      const parts = bakeNode(o);
      for (const p of parts) if (p.mat.map) p.mat.map.userData.keep = true; // shared by every truck
      return parts;
    };
    // Physics order FL, FR, RL, RR (left = +x); each tyre round its own axle centre.
    const wheels = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map((n) => {
      const parts = node(n);
      _box.makeEmpty();
      for (const p of parts) {
        p.geo.computeBoundingBox();
        _box.union(p.geo.boundingBox);
      }
      const centre = _box.getCenter(new THREE.Vector3());
      for (const p of parts) p.geo.translate(-centre.x, -centre.y, -centre.z);
      return { parts, centre, radius: (_box.max.y - _box.min.y) / 2 };
    });
    VAN = { body: node('body'), wheels };
  } catch (e) {
    console.warn('monster truck did not load; using the procedural body', e);
  }
}

export const hasMonster = () => !!VAN;

/** The van's paint: its red pixels take the driver's colour (shading and trim kept). */
function paintMaterial(src, color) {
  const paint = src.clone();
  paint.name = 'צבע משאית';
  paint.userData.paint = new THREE.Color(color);
  paint.roughness = 0.3;
  paint.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: paint.userData.paint };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPaint;').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      { vec3 c = sampledDiffuseColor.rgb; float red = smoothstep(0.05, 0.22, c.r - max(c.g, c.b));
        diffuseColor.rgb = mix(c, uPaint * (0.25 + 1.6 * c.r), red); }`,
    );
  };
  paint.customProgramCacheKey = () => 'monster-paint';
  // Car.js recolours paint.color; keep the shader's colour in step (the shader reads the texture
  // itself, so the diffuse colour does not tint the trim).
  Object.defineProperty(paint, 'color', { get: () => paint.userData.paint, set: () => {} });
  return paint;
}

/**
 * One truck: { group, paint, tailMat, headMat, pose(car) } (the same shape
 * as the real cars in RealModels.js).
 */
export function createMonsterCar(materials, { color = '#d42a2a', spec }) {
  const W = spec.wheel;
  const S = spec.monster;
  const group = new THREE.Group();
  // The van scaled so its tyres are the physics wheels' size, the axles' midpoint on the
  // physics wheelbase's, and the tyres on the ground with the suspension at rest.
  const s = W.radius / VAN.wheels[0].radius;
  const restY = W.height - (W.restLength - 9.82 / (4 * W.stiffness));
  const F = VAN.wheels;
  _c.set(F.reduce((a, w) => a + w.centre.x, 0) / 4, F.reduce((a, w) => a + w.centre.y, 0) / 4, F.reduce((a, w) => a + w.centre.z, 0) / 4);
  const model = new THREE.Group();
  model.scale.setScalar(s);
  model.position.set(-_c.x * s, restY - _c.y * s, -_c.z * s);
  group.add(model);
  let paint = null;
  for (const p of VAN.body) {
    let mat = p.mat;
    if (mat.name === 'Body') mat = paint = paintMaterial(mat, color);
    const m = new THREE.Mesh(p.geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    model.add(m);
  }
  if (!paint) paint = paintMaterial(new THREE.MeshStandardMaterial(), color);
  // Lamps: headlights in the grille, tail lights in the back doors (model coordinates).
  const headMat = new THREE.MeshStandardMaterial({ name: 'פנסים', color: 0x222222, emissive: 0xf4f7ff, emissiveIntensity: 1 });
  const tailMat = new THREE.MeshStandardMaterial({ name: 'פנס אחורי', color: 0x330000, emissive: 0xff1a0a, emissiveIntensity: 1 });
  materials.trackEmissive(headMat, 0.6);
  materials.trackEmissive(tailMat, 0.25);
  const L = S.lamps;
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(L.head[3], L.head[4], 0.04), headMat);
    h.position.set(sx * L.head[0], L.head[1], L.head[2]);
    model.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(L.tail[3], L.tail[4], 0.04), tailMat);
    t.position.set(sx * L.tail[0], L.tail[1], L.tail[2]);
    model.add(t);
  }
  // Wheels: pivots at the physics wheels (the model's tyres sit on them once scaled).
  const X = [W.track, -W.track, W.track, -W.track];
  const Z = [W.front, W.front, W.rear, W.rear];
  const wheels = F.map((w, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(X[i], restY, Z[i]);
    const tyre = new THREE.Group();
    tyre.scale.setScalar(s);
    for (const p of w.parts) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.castShadow = true;
      tyre.add(m);
    }
    pivot.add(tyre);
    group.add(pivot);
    return pivot;
  });
  group.userData.paint = paint;
  return {
    group,
    paint,
    tailMat,
    headMat,
    pose(car) {
      const veh = car.vehicle;
      const infos = veh.vehicle.wheelInfos;
      for (let i = 0; i < 4; i++) {
        const info = infos[i];
        const len = info.isInContact ? info.suspensionLength : Math.min(info.suspensionRestLength + 0.1, info.suspensionLength + 0.2);
        wheels[i].position.y = W.height - len;
        _qs.setFromAxisAngle(UP, i < 2 ? -veh.steerAngle : 0);
        _qw.setFromAxisAngle(AXLE, veh.wheelShown[i]);
        _qs.multiply(_qw);
        wheels[i].quaternion.copy(_qs);
      }
    },
  };
}

const texels = new Map(); // texture → its pixels, for the menu card
export function texelsOf(tex) {
  if (!texels.has(tex)) {
    let px = null;
    try {
      const im = tex.image;
      const cv = document.createElement('canvas');
      cv.width = Math.min(256, im.width);
      cv.height = Math.min(256, im.height);
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0, cv.width, cv.height);
      px = { data: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    } catch (e) {
      console.warn('monster card: texture not readable', e);
    }
    texels.set(tex, px);
  }
  return texels.get(tex);
}

/** The texture's colour at the centre of triangle t (first index t), from texelsOf pixels. */
export function texelAt(px, uv, idx, t) {
  let u = 0;
  let w = 0;
  for (let k = 0; k < 3; k++) {
    const v = idx ? idx.getX(t + k) : t + k;
    u += uv.getX(v) / 3;
    w += uv.getY(v) / 3;
  }
  const x = Math.min(px.w - 1, Math.floor((u - Math.floor(u)) * px.w));
  const y = Math.min(px.h - 1, Math.floor((w - Math.floor(w)) * px.h));
  const o = (y * px.w + x) * 4;
  return new THREE.Color().setRGB(px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255, THREE.SRGBColorSpace);
}

const cards = new Map();
const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _pc = new THREE.Color();

/**
 * The truck's side view for the car picker: its triangles seen from the left, each in its texture's
 * colour at that spot (the red paint in the driver's colour), lit from the front and above.
 */
export function drawMonsterProfile(canvas, color) {
  let img = cards.get(color);
  if (!img) {
    const paint = new THREE.Color(color);
    const L = new THREE.Vector3(0.55, 0.75, 0.35).normalize();
    const tris = [];
    const box = new THREE.Box3();
    const c = new THREE.Color();
    const add = (parts, off) => {
      for (const { geo, mat } of parts) {
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        const idx = geo.index;
        const n = idx ? idx.count : pos.count;
        const px = mat.map ? texelsOf(mat.map) : null;
        for (let t = 0; t < n; t += 3) {
          const id = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
          id.forEach((v, k) => _p[k].fromBufferAttribute(pos, v).add(off));
          const nrm = _e1.subVectors(_p[1], _p[0]).cross(_e2.subVectors(_p[2], _p[0])).normalize();
          if (nrm.x <= 0.02) continue;
          c.copy(mat.color);
          if (px && uv) {
            let u = 0;
            let w = 0;
            for (const v of id) {
              u += uv.getX(v) / 3;
              w += uv.getY(v) / 3;
            }
            const x = Math.min(px.w - 1, Math.floor((u - Math.floor(u)) * px.w));
            const y = Math.min(px.h - 1, Math.floor((w - Math.floor(w)) * px.h));
            const o = (y * px.w + x) * 4;
            const s = new THREE.Color().setRGB(px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255, THREE.SRGBColorSpace);
            if (mat.name === 'Body') {
              const red = THREE.MathUtils.smoothstep(s.r - Math.max(s.g, s.b), 0.05, 0.22);
              s.lerp(_pc.copy(paint).multiplyScalar(0.25 + 1.6 * s.r), red);
            }
            c.multiply(s);
          }
          const shade = 0.32 + 0.68 * Math.max(0, nrm.dot(L)) + 0.25 * Math.max(0, nrm.y) ** 4;
          c.multiplyScalar(shade).addScalar(0.012 * shade);
          for (const q of _p) box.expandByPoint(q);
          tris.push({ x: (_p[0].x + _p[1].x + _p[2].x) / 3, p: [_p[0].z, _p[0].y, _p[1].z, _p[1].y, _p[2].z, _p[2].y], style: `#${c.getHexString()}` });
        }
      }
    };
    add(VAN.body, new THREE.Vector3());
    for (const w of VAN.wheels) add(w.parts, w.centre);
    tris.sort((a, b) => a.x - b.x);
    img = document.createElement('canvas');
    img.width = canvas.width * 2;
    img.height = canvas.height * 2;
    const g = img.getContext('2d');
    const len = box.max.z - box.min.z;
    const scale = Math.min((img.width * 0.86) / (len + 0.4), (img.height * 0.82) / (box.max.y - box.min.y));
    const cx = img.width / 2;
    const cy = img.height * 0.92;
    const zc = (box.max.z + box.min.z) / 2;
    const X = (z) => cx - (z - zc) * scale; // nose to the left in the Hebrew (RTL) card
    const Y = (y) => cy - (y - box.min.y) * scale;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx, cy + 4, (len / 2) * scale * 1.02, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 1;
    for (const t of tris) {
      g.fillStyle = t.style;
      g.strokeStyle = t.style;
      const p = t.p;
      g.beginPath();
      g.moveTo(X(p[0]), Y(p[1]));
      g.lineTo(X(p[2]), Y(p[3]));
      g.lineTo(X(p[4]), Y(p[5]));
      g.closePath();
      g.fill();
      g.stroke();
    }
    cards.set(color, img);
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
}
