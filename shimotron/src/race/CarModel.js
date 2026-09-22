import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR } from './config.js';

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Procedural GT car. The shell is a loft: ~70 cross-sections along the
 * length, each a rounded profile (floor, flared sides, shoulder, greenhouse,
 * roof) so the silhouette, wheel arches, windscreen rake and fastback all
 * come from a handful of curves. Faces are split into paint and glass
 * groups. Trim, lights, wing, mirrors and decals are added on top.
 *
 * Local frame matches the physics chassis: +z forward, +y up, +x left,
 * origin at the centre of mass; the ground is at y = -0.6.
 */

// Cabin landmarks (z): windscreen base → roof front → roof rear → rear window base.
const ZF = 0.8;
const ZRF = 0.1;
const ZRR = -0.62;
const ZR = -1.35;
const HALF_L = 2.2;
const WHEELS = [CAR.wheel.front, CAR.wheel.rear];

function sectionParams(z) {
  // Nose/tail rounding factor (1 in the middle, → 0 at the tips).
  const nose = z > HALF_L - 0.34 ? Math.sqrt(Math.max(0, 1 - ((z - (HALF_L - 0.34)) / 0.34) ** 2)) : 1;
  const tail = z < -HALF_L + 0.16 ? Math.sqrt(Math.max(0, 1 - ((z - (-HALF_L + 0.16)) / 0.16) ** 2)) : 1;
  const tip = Math.min(nose, tail);
  // Width: fender flares around each axle, pinched waist between.
  let w = 0.86;
  for (const zw of WHEELS) w += 0.075 * Math.exp(-(((z - zw) / 0.55) ** 2));
  w -= 0.03 * Math.exp(-(((z + 0.1) / 0.5) ** 2));
  w *= 0.2 + 0.8 * Math.pow(tip, 0.6);
  // Floor, with wheel arches cut up around each wheel.
  let yb = -0.43 + (1 - nose) * 0.12 + (1 - tail) * 0.08;
  for (const zw of WHEELS) {
    const dz = z - zw;
    const r = CAR.wheel.radius + 0.07;
    if (Math.abs(dz) < r) yb = Math.max(yb, -0.24 + Math.sqrt(r * r - dz * dz) * 0.92);
  }
  // Beltline (top of the doors / hood surface).
  let belt = 0.1;
  belt -= smooth(0.9, HALF_L, z) * 0.19; // hood drops to the nose
  belt += smooth(-0.6, -HALF_L, z) * 0.06; // haunches rise to the tail
  for (const zw of WHEELS) belt += 0.045 * Math.exp(-(((z - zw) / 0.45) ** 2)); // fender crowns
  // Roof line.
  let roof;
  if (z > ZF) roof = belt + 0.035;
  else if (z > ZRF) roof = THREE.MathUtils.lerp(0.56, belt + 0.035, Math.pow((z - ZRF) / (ZF - ZRF), 1.25));
  else if (z > ZRR) roof = 0.56 + 0.012 * Math.sin(((z - ZRR) / (ZRF - ZRR)) * Math.PI);
  else if (z > ZR) roof = THREE.MathUtils.lerp(belt + 0.07, 0.56, Math.pow((z - ZR) / (ZRR - ZR), 0.85));
  else roof = belt + 0.07 - smooth(ZR, -HALF_L, z) * 0.02;
  // Ducktail spoiler lip.
  roof += Math.exp(-(((z + 2.02) / 0.1) ** 2)) * 0.035;
  const inCabin = z < ZF + 0.05 && z > ZR - 0.05;
  const wc = inCabin ? w * (0.78 - 0.04 * smooth(ZRF, ZRR, z)) : w * 0.86;
  const hTip = 0.25 + 0.75 * tip;
  const mid = (yb + roof) / 2;
  return {
    w,
    wc,
    yb: mid + (yb - mid) * hTip,
    belt: mid + (belt - mid) * hTip,
    roof: mid + (roof - mid) * hTip,
  };
}

/** Right-half profile (x ≤ 0 side is mirrored). Returns [{x, y, seg}] with a fixed count. */
function sectionProfile(p) {
  const pts = [];
  const add = (x, y, seg) => pts.push({ x, y, seg });
  const { w, wc, yb, belt, roof } = p;
  const r = 0.07;
  // floor (centre → edge)
  for (let i = 0; i < 4; i++) add((w - r) * (i / 4), yb, 'floor');
  // lower corner
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2);
    add(w - r + Math.cos(a) * r, yb + r + Math.sin(a) * r, 'floor');
  }
  // side (slight tumble-under at the sill, bulge at the door)
  const side = 7;
  for (let i = 0; i <= side; i++) {
    const t = i / side;
    const y = THREE.MathUtils.lerp(yb + r, belt - 0.05, t);
    const bulge = Math.sin(t * Math.PI) * 0.018 - (1 - t) * (1 - t) * 0.03;
    add(w + bulge, y, 'side');
  }
  // shoulder: roll over the beltline to the greenhouse base
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    add(wc + (w - wc) * Math.cos(a), belt - 0.05 + Math.sin(a) * 0.06, 'shoulder');
  }
  // greenhouse side (tumblehome toward the roof)
  const gh = 5;
  for (let i = 1; i <= gh; i++) {
    const t = i / gh;
    const y = THREE.MathUtils.lerp(belt + 0.01, roof - 0.045, t);
    add(wc - (wc * 0.12 + 0.02) * Math.pow(t, 1.4), y, 'glass');
  }
  // roof (edge → centre), crowned
  const rw = wc - (wc * 0.12 + 0.02);
  const rs = 5;
  for (let i = 1; i <= rs; i++) {
    const t = i / rs;
    const x = rw * (1 - t);
    add(x, roof - 0.045 * Math.cos((t * Math.PI) / 2) ** 3 + 0.0, 'roof');
  }
  return pts;
}

function buildShell() {
  // Denser stations at the tips and around the arches.
  const zs = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = t - Math.sin(t * Math.PI * 2) * 0.1; // cluster at the ends
    zs.push(THREE.MathUtils.lerp(-HALF_L, HALF_L, s));
  }
  const rings = zs.map((z) => ({ z, prof: sectionProfile(sectionParams(z)) }));
  const M = rings[0].prof.length;
  const cols = M * 2 - 1; // mirrored, centre-bottom and centre-roof shared once
  const pos = [];
  const segs = [];
  for (const { z, prof } of rings) {
    // right side: roof centre → floor centre (reverse), then left side floor → roof
    const ring = [];
    for (let i = M - 1; i >= 0; i--) ring.push({ x: -prof[i].x, y: prof[i].y, seg: prof[i].seg });
    for (let i = 1; i < M; i++) ring.push({ x: prof[i].x, y: prof[i].y, seg: prof[i].seg });
    // close the loop from the left roof centre back to the right roof centre
    for (const p of ring) {
      pos.push(p.x, p.y, z);
      segs.push(p.seg);
    }
  }
  // The ring runs roof(right) → floor → roof(left); the roof centre appears twice (ends),
  // so no wrap quad is needed.
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
      if (seg === 'roof') isGlass = (z < ZF - 0.06 && z > ZRF + 0.04) || (z < ZRR - 0.06 && z > ZR + 0.08);
      else if (seg === 'glass') isGlass = z < ZRF + 0.02 && z > ZR + 0.12 && Math.abs(z - (ZRR - 0.05)) > 0.07;
      // winding: right half vs left half keep outward normals
      const list = isGlass ? glass : paint;
      list.push(a, b, d, b, e, d);
    }
  }
  // Nose and tail caps: fan from the centre of the tip rings.
  for (const [r, dir] of [[0, -1], [R - 1, 1]]) {
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
  const idx = [...paint, ...glass];
  geo.setIndex(idx);
  geo.addGroup(0, paint.length, 0);
  geo.addGroup(paint.length, glass.length, 1);
  geo.computeVertexNormals();
  // Planar UVs (x/z) for any future livery texture.
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = pos[i * 3 + 2] / (2 * HALF_L) + 0.5;
    uv[i * 2 + 1] = pos[i * 3 + 1] + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

let shared = null;

function sharedParts() {
  if (shared) return shared;
  const shell = buildShell();
  // Dark trim: splitter, side skirts, diffuser with fins, grille, mirrors' stalks, wing.
  const trim = [];
  const box = (w, h, d, x, y, z, rx = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(x, y, z);
    trim.push(g);
  };
  const front = sectionParams(HALF_L - 0.3);
  box(1.66, 0.035, 0.3, 0, -0.41, HALF_L - 0.12); // splitter
  box(1.2, 0.16, 0.06, 0, front.yb + 0.16, HALF_L - 0.08); // lower grille
  for (const s of [-1, 1]) {
    box(0.05, 0.08, 2.2, s * 0.93, -0.38, -0.02); // skirts
    box(0.04, 0.16, 0.05, s * 0.36, 0.5, -1.93); // wing uprights
    box(0.05, 0.05, 0.12, s * 0.9, 0.18, 0.62); // mirror stalks
  }
  box(1.5, 0.05, 0.1, 0, -0.38, -HALF_L + 0.12); // diffuser plate
  for (let i = -2; i <= 2; i++) box(0.02, 0.12, 0.34, i * 0.28, -0.36, -HALF_L + 0.2);
  const wing = new THREE.BoxGeometry(1.72, 0.03, 0.3);
  wing.rotateX(-0.12);
  wing.translate(0, 0.6, -1.95);
  trim.push(wing);
  for (const s of [-1, 1]) box(0.02, 0.12, 0.34, s * 0.86, 0.58, -1.95); // end plates
  const trimGeo = mergeGeometries(trim.map((g) => g.toNonIndexed()));

  // Mirrors (painted caps).
  const mirror = [];
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(0.06, 0.055, 0.11);
    g.translate(s * 0.99, 0.2, 0.6);
    mirror.push(g);
  }
  const mirrorGeo = mergeGeometries(mirror);

  // Headlights: slim swept lenses at the nose corners.
  const heads = [];
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(1, 16, 8);
    g.scale(0.2, 0.05, 0.16);
    g.rotateY(s * 0.35);
    const p = sectionParams(HALF_L - 0.28);
    g.translate(s * 0.62, p.belt - 0.035, HALF_L - 0.26);
    heads.push(g);
  }
  const headGeo = mergeGeometries(heads);
  // Tail light bar across the back plus two blocks.
  const tails = [];
  const tp = sectionParams(-HALF_L + 0.1);
  {
    const g = new THREE.BoxGeometry(1.46, 0.03, 0.05);
    g.translate(0, tp.belt - 0.02, -HALF_L + 0.09);
    tails.push(g);
    for (const s of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.34, 0.07, 0.05);
      b.translate(s * 0.62, tp.belt - 0.06, -HALF_L + 0.1);
      tails.push(b);
    }
  }
  const tailGeo = mergeGeometries(tails.map((g) => g.toNonIndexed()));
  // Exhaust tips.
  const ex = [];
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.05, 0.055, 0.14, 14, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(s * 0.34, -0.3, -HALF_L + 0.06);
    ex.push(g);
  }
  const exhaustGeo = mergeGeometries(ex);
  shared = { shell, trimGeo, mirrorGeo, headGeo, tailGeo, exhaustGeo };
  return shared;
}

let sharedMats = null;

function sharedMaterials(materials) {
  if (sharedMats) return sharedMats;
  const glass = new THREE.MeshPhysicalMaterial({ name: 'שמשות', color: 0x0b0f14, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 });
  const trim = new THREE.MeshStandardMaterial({ name: 'פלסטיק שחור', color: 0x111214, roughness: 0.55, metalness: 0.2 });
  const chrome = materials.lib.chrome || new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
  const head = new THREE.MeshStandardMaterial({ name: 'פנסים', color: 0xdfe8ff, roughness: 0.1, metalness: 0.3, emissive: 0xe8f0ff, emissiveIntensity: 1 });
  materials.trackEmissive(head, 0.6);
  sharedMats = { glass, trim, chrome, head };
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
 * Builds one car body (without wheels). Returns the group plus handles for
 * brake lights and paint.
 */
export function createCarModel(materials, { color = '#d42a2a', number = 1, stripe = '#f2f2f2' } = {}) {
  const parts = sharedParts();
  const M = sharedMaterials(materials);
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    name: 'צבע',
    color: new THREE.Color(color),
    metalness: 0.55,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.15,
  });
  // Racing stripes painted in the shader (object space), so the shell stays one mesh.
  const stripeColor = new THREE.Color(stripe);
  paint.onBeforeCompile = (shader) => {
    shader.uniforms.uStripe = { value: stripeColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform vec3 uStripe;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float ax = abs(vObj.x);
          float aw = fwidth(ax) * 1.5;
          float s = smoothstep(0.1 - aw, 0.1, ax) * (1.0 - smoothstep(0.22, 0.22 + aw, ax));
          s *= step(0.02, vObj.y + 0.05); // only on top surfaces
          diffuseColor.rgb = mix(diffuseColor.rgb, uStripe, s);
        }`,
      );
  };
  paint.customProgramCacheKey = () => 'shimotron-carpaint';
  const shell = new THREE.Mesh(parts.shell, [paint, M.glass]);
  const trim = new THREE.Mesh(parts.trimGeo, M.trim);
  const mirrors = new THREE.Mesh(parts.mirrorGeo, paint);
  const heads = new THREE.Mesh(parts.headGeo, M.head);
  const tailMat = new THREE.MeshStandardMaterial({ name: 'פנס אחורי', color: 0x300404, roughness: 0.2, metalness: 0.1, emissive: 0xff1a0a, emissiveIntensity: 1 });
  materials.trackEmissive(tailMat, 0.25);
  const tails = new THREE.Mesh(parts.tailGeo, tailMat);
  const exhaust = new THREE.Mesh(parts.exhaustGeo, M.chrome);
  for (const m of [shell, trim, mirrors, heads, tails, exhaust]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  heads.castShadow = false;
  tails.castShadow = false;
  // Door and roof numbers.
  const numMat = new THREE.MeshStandardMaterial({ map: numberTexture(number, color), transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  const door = sectionParams(-0.15);
  for (const s of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), numMat);
    plane.position.set(s * (door.w + 0.022), (door.yb + door.belt) / 2 + 0.02, -0.15);
    plane.rotation.y = (s * Math.PI) / 2;
    g.add(plane);
  }
  const roofNum = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), numMat);
  roofNum.rotation.x = -Math.PI / 2;
  roofNum.position.set(0, sectionParams(-0.25).roof + 0.004, -0.25);
  g.add(roofNum);
  g.userData.paint = paint;
  return { group: g, paint, tailMat, headMat: M.head };
}

/**
 * All wheels of all cars as two InstancedMeshes (tyres + rims), updated
 * from each car's chassis matrix every frame.
 */
export class WheelBatch {
  constructor(materials, capacity) {
    const W = CAR.wheel;
    const r = W.radius;
    const hw = W.width / 2;
    // Tyre: lathe around the axle (profile in (radius, axial)).
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
    tyre.rotateZ(Math.PI / 2); // lathe axis y → x
    // Rim: dish, 5 twin spokes, barrel, cap, brake disc.
    const rim = [];
    const rimR = r * 0.68;
    const dish = new THREE.CylinderGeometry(rimR, rimR, 0.02, 32, 1);
    dish.rotateZ(Math.PI / 2);
    dish.translate(-hw + 0.035, 0, 0);
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
    const tyreMat = new THREE.MeshStandardMaterial({ name: 'צמיג', color: 0x151515, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const rimMat = new THREE.MeshStandardMaterial({ name: 'חישוק', color: 0xc9ccd2, roughness: 0.28, metalness: 1 });
    this.tyres = new THREE.InstancedMesh(tyre, tyreMat, capacity);
    this.rims = new THREE.InstancedMesh(rimGeo, rimMat, capacity);
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
