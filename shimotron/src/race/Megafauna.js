import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random, smoothstep } from '../engine/core/Random.js';
import { waveAt } from '../engine/world/Water.js';
import { fishGeometry } from './Sealife.js';

/**
 * The big life of the open sea: humpback whales that cruise the deep,
 * come up to blow, show their flukes as they dive and now and then breach
 * clear of the water; whale sharks drifting at the surface, mouths open;
 * manta rays gliding over the reef edge; schools of hammerheads over the
 * deep sand; bait balls of hundreds of sardines, swirling as tuna and
 * jacks tear through them; and smacks of drifting, pulsing jellyfish.
 * Whales, whale sharks and mantas are solid for boats and submarines.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Colour, mask and pattern-part attributes on a geometry, returned non-indexed. */
function paint(g, color, mask = 0, part = 0) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const m = new Float32Array(n);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    c.toArray(col, i * 3);
    m[i] = typeof mask === 'function' ? mask(p.getX(i), p.getY(i), p.getZ(i)) : mask;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(m, 1));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

/**
 * A body lofted along z from sections [z, halfHeight, halfWidth, yOffset]
 * (nose first), `around` points per ring, belly a little flatter than the back.
 */
function loft(sec, around, belly = 0.85) {
  const pos = [];
  const idx = [];
  for (const [z, h, w, y0] of sec) {
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const c = Math.cos(a);
      pos.push(Math.sin(a) * w, y0 + c * h * (c < 0 ? belly : 1), z);
    }
  }
  for (let i = 0; i < sec.length - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * around + k;
      const b = i * around + ((k + 1) % around);
      idx.push(a, a + around, b, b, a + around, b + around);
    }
  }
  // Close the nose and the tail with a point each.
  const nose = pos.length / 3;
  pos.push(0, sec[0][3], sec[0][0] + 0.004);
  const tail = nose + 1;
  const L = sec[sec.length - 1];
  pos.push(0, L[3], L[0] - 0.004);
  const last = (sec.length - 1) * around;
  for (let k = 0; k < around; k++) {
    idx.push(nose, (k + 1) % around, k);
    idx.push(tail, last + k, last + ((k + 1) % around));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin blade (fin, fluke) from an outline in its own (u, v) plane, given thickness, placed by `map(u, v, side)`. */
function blade(outline, thick, map) {
  const pos = [];
  const n = outline.length;
  let cx = 0;
  let cy = 0;
  for (const [u, v] of outline) {
    cx += u / n;
    cy += v / n;
  }
  for (const side of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const [u0, v0] = outline[k];
      const [u1, v1] = outline[(k + 1) % n];
      const a = map(cx, cy, side * thick);
      const b = map(u0, v0, side * thick * 0.25);
      const c = map(u1, v1, side * thick * 0.25);
      if (side > 0) pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      else pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Humpback whale, 1 unit long (nose +z): long knobbly flippers, small dorsal on a hump, broad serrated flukes. */
export function humpbackGeometry() {
  const sec = [
    [0.5, 0.0, 0.0, -0.01],
    [0.47, 0.03, 0.04, -0.012],
    [0.42, 0.048, 0.062, -0.016],
    [0.35, 0.064, 0.08, -0.02],
    [0.26, 0.078, 0.092, -0.024],
    [0.15, 0.088, 0.097, -0.024],
    [0.04, 0.09, 0.094, -0.02],
    [-0.07, 0.085, 0.086, -0.014],
    [-0.18, 0.072, 0.07, -0.006],
    [-0.28, 0.056, 0.05, 0.0],
    [-0.36, 0.043, 0.032, 0.004],
    [-0.42, 0.032, 0.02, 0.006],
    [-0.46, 0.022, 0.013, 0.006],
    [-0.485, 0.014, 0.01, 0.006],
  ];
  const tailMask = (x, y, z) => Math.max(0, Math.min(1, (0.0 - z) / 0.5)) ** 1.6;
  const parts = [paint(loft(sec, 22, 0.9), 0xffffff, tailMask, 0)];
  // Pectoral flippers: very long, narrow, scalloped along the leading edge.
  for (const s of [1, -1]) {
    const out = [];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      out.push([u, 0.5 + 0.5 * (1 - u * 0.7) + (k % 2 ? 0.08 : 0)]); // leading edge, knobbly
    }
    for (let k = N; k >= 0; k--) {
      const u = k / N;
      out.push([u, -0.5 * (1 - u * 0.75)]);
    }
    parts.push(
      paint(
        blade(out, 0.006, (u, v, off) => {
          const len = 0.32;
          const x = s * (0.085 + u * len * 0.82);
          const y = -0.045 - u * len * 0.32 + off;
          const z = 0.22 - u * len * 0.45 + v * 0.045 * (1 - u * 0.5);
          return new THREE.Vector3(x, y, z);
        }),
        0xffffff,
        (x) => Math.min(1, Math.abs(x) * 3) * 0.6,
        1,
      ),
    );
  }
  // Dorsal fin on its hump.
  parts.push(
    paint(
      blade(
        [
          [0, 0],
          [0.3, 0.9],
          [0.55, 1],
          [1, 0],
        ],
        0.006,
        (u, v, off) => new THREE.Vector3(off, 0.05 + v * 0.028, -0.17 - u * 0.07),
      ),
      0xffffff,
      tailMask,
      0,
    ),
  );
  // Flukes: wide, swept, with a serrated trailing edge and a notch in the middle.
  const fl = [[0, 0.03]];
  for (let k = 1; k <= 10; k++) {
    const u = k / 10;
    fl.push([u, 0.03 - u * u * 0.05]);
  }
  for (let k = 10; k >= 0; k--) {
    const u = k / 10;
    fl.push([u, -0.06 * (1 - u * 0.6) - (k % 2 ? 0.01 : 0) + (k === 0 ? 0.03 : 0)]);
  }
  for (const s of [1, -1]) {
    parts.push(
      paint(
        blade(fl, 0.005, (u, v, off) => new THREE.Vector3(s * u * 0.16, 0.006 + off, -0.49 + v - u * 0.04)),
        0xffffff,
        1,
        2,
      ),
    );
  }
  return mergeGeometries(parts);
}

/** Whale shark: broad flat head with a wide mouth at the front, ridged back, tall dorsal and a big crescent tail. */
export function whaleSharkGeometry() {
  const sec = [
    [0.5, 0.018, 0.055, -0.004],
    [0.49, 0.032, 0.075, 0.0],
    [0.45, 0.05, 0.09, 0.002],
    [0.36, 0.068, 0.095, 0.004],
    [0.22, 0.082, 0.088, 0.006],
    [0.06, 0.086, 0.078, 0.006],
    [-0.1, 0.075, 0.062, 0.004],
    [-0.24, 0.056, 0.042, 0.002],
    [-0.34, 0.036, 0.024, 0.0],
    [-0.4, 0.024, 0.014, 0.0],
  ];
  const tailMask = (x, y, z) => Math.max(0, Math.min(1, (0.1 - z) / 0.55)) ** 1.4;
  const body = loft(sec, 22, 0.8);
  const parts = [paint(body, 0xffffff, tailMask, 0)];
  // Mouth: a dark slot across the front.
  parts.push(paint(new THREE.BoxGeometry(0.12, 0.012, 0.012).translate(0, -0.012, 0.492), 0x101010, 0, 3));
  const fin = (pts, map, mask) => paint(blade(pts, 0.005, map), 0xffffff, mask, 0);
  parts.push(fin([[0, 0], [0.35, 1], [0.6, 0.95], [1, 0]], (u, v, off) => new THREE.Vector3(off, 0.075 + v * 0.1, 0.0 - u * 0.12), tailMask));
  parts.push(fin([[0, 0], [0.4, 1], [1, 0]], (u, v, off) => new THREE.Vector3(off, 0.04 + v * 0.035, -0.25 - u * 0.05), tailMask));
  // Crescent tail, the upper lobe bigger.
  // Crescent tail: the upper lobe long and swept back, the lower shorter, a deep notch between.
  parts.push(fin([[0, 0.025], [0.13, 0.2], [0.1, 0.17], [0.065, 0.06], [0.055, 0.0], [0.07, -0.07], [0.1, -0.12], [0.02, -0.03]], (u, v, off) => new THREE.Vector3(off, v, -0.39 - u), 1));
  for (const s of [1, -1]) parts.push(fin([[0, 0], [0.9, 0.25], [1, 0.05], [0.3, -0.35]], (u, v, off) => new THREE.Vector3(s * (0.07 + u * 0.16), -0.05 - u * 0.05 + off, 0.2 + v * 0.07 - u * 0.06), 0.3));
  return mergeGeometries(parts);
}

/** Manta ray: broad pointed wings, the two cephalic lobes in front, a short whip tail. aMask = wing flex. */
export function mantaGeometry() {
  const pos = [];
  const rim = [];
  const n = 28;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.sin(a);
    const z = Math.cos(a);
    // Swept, pointed wings: long in x, short and cut straight at the head.
    const tip = Math.pow(Math.abs(x), 3);
    let r = 0.2 + tip * 0.3;
    if (z > 0) r *= 1 - z * 0.25;
    rim.push([x * r * 1.0, z * (0.18 + (1 - tip) * 0.05) - tip * 0.1]);
  }
  for (const s of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const [x0, z0] = rim[k];
      const [x1, z1] = rim[(k + 1) % n];
      // A fleshy centre tapering to thin wing tips that curve down a little.
      const y = 0.075 * s;
      const d0 = -(Math.abs(x0) ** 2) * 0.12;
      const d1 = -(Math.abs(x1) ** 2) * 0.12;
      if (s > 0) pos.push(0, y, 0.02, x1, d1, z1, x0, d0, z0);
      else pos.push(0, y * 0.7, 0.02, x0, d0, z0, x1, d1, z1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.computeVertexNormals();
  const wing = (x) => Math.min(1, Math.abs(x) / 0.5) ** 1.5;
  const parts = [paint(body, 0xffffff, (x) => wing(x), 4)];
  for (const s of [1, -1]) parts.push(paint(new THREE.BoxGeometry(0.025, 0.012, 0.09).rotateY(s * 0.25).translate(s * 0.07, -0.01, 0.24), 0x202020, 0, 3));
  const tail = new THREE.CylinderGeometry(0.004, 0.012, 0.3, 4).rotateX(Math.PI / 2).translate(0, 0, -0.3);
  parts.push(paint(tail, 0x202020, 0, 3));
  return mergeGeometries(parts);
}

/** Hammerhead: a shark body with the flat cephalofoil across the front, eyes at its ends. */
export function hammerheadGeometry() {
  const base = fishGeometry('shark');
  const head = new THREE.BoxGeometry(0.32, 0.03, 0.08, 6, 1, 2);
  const p = head.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, p.getZ(i) - Math.abs(x) * 0.18); // swept back at the ends
  }
  head.translate(0, 0.01, 0.46);
  const h = head.toNonIndexed();
  h.deleteAttribute('uv');
  h.computeVertexNormals();
  const n = h.attributes.position.count;
  const col = new Float32Array(n * 3).fill(1);
  h.setAttribute('color', new THREE.BufferAttribute(col, 3));
  h.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(n), 1));
  for (const k of Object.keys(base.attributes)) if (!h.attributes[k]) base.deleteAttribute(k);
  return mergeGeometries([base, h]);
}

/** Moon jellyfish: a translucent pulsing bell, four pale gonad rings, frilly oral arms and fine trailing tentacles. */
export function jellyGeometry() {
  const bell = new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  bell.scale(1, 0.55, 1);
  const parts = [paint(bell, 0xffffff, (x, y) => 1 - y / 0.3, 0)];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    parts.push(paint(new THREE.TorusGeometry(0.09, 0.022, 5, 12).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.16, 0.12, Math.sin(a) * 0.16), 0xf0a0d0, 0.3, 1));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.08, 0.7, 1, 6).translate(0, -0.35, 0).rotateY(a);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setX(i, pp.getX(i) + Math.sin(pp.getY(i) * 14) * 0.03);
    parts.push(paint(g.translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), 0xf8e8f0, (x, y) => -y, 2));
  }
  const tent = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const x = Math.cos(a) * 0.48;
    const z = Math.sin(a) * 0.48;
    tent.push(x, 0.0, z, x * 1.02, -0.5, z * 1.02, x + 0.004, 0.0, z + 0.004);
    tent.push(x * 1.02, -0.5, z * 1.02, x * 0.9, -1.0, z * 0.9, x * 1.02 + 0.003, -0.5, z * 1.02 + 0.003);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tent, 3));
  tg.computeVertexNormals();
  parts.push(paint(tg, 0xf0f0ff, (x, y) => -y, 2));
  return mergeGeometries(parts);
}

/**
 * Whale / shark / manta skins: dark backs, pale bellies, with each one's
 * own markings — a humpback's white flippers and throat grooves, a whale
 * shark's checkerboard of pale spots and stripes, a manta's white
 * shoulder patches — and a gentle bend along the body as it swims.
 */
function giantMaterial(uniforms, kind) {
  const m = new THREE.MeshStandardMaterial({ name: 'יונקי ים', vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const motion = {
    whale: 'transformed.y += sin(uTime * 0.9 + ph - transformed.z * 5.0) * 0.035 * aMask;',
    shark: 'transformed.x += sin(uTime * 1.6 + ph - transformed.z * 5.0) * 0.05 * aMask;',
    manta: 'transformed.y += sin(uTime * 1.1 + ph - abs(transformed.x) * 2.5) * 0.12 * aMask;',
  }[kind];
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aMask; attribute float aPart; attribute float iPhase; varying vec3 vGP; varying float vPart;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nfloat ph = iPhase;\nvGP = position; vPart = aPart;\n${motion}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP; varying float vPart;\nfloat gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 p = vGP;
        float back = smoothstep(-0.03, 0.03, p.y);
        ${
          kind === 'whale'
            ? `// Black back, mottled white throat and belly with ventral grooves; white flippers; fluke undersides patterned.
          vec3 dark = vec3(0.06, 0.065, 0.07);
          vec3 pale = vec3(0.86, 0.86, 0.84);
          float bellyW = smoothstep(-0.02, -0.07, p.y) * smoothstep(-0.3, 0.1, p.z);
          float groove = step(0.5, fract(p.x * 90.0)) * step(0.05, p.z) * smoothstep(-0.04, -0.07, p.y);
          vec3 c = mix(dark, pale, bellyW * (0.7 + 0.3 * gH(floor(p.xz * 60.0))));
          c *= 1.0 - groove * 0.25;
          if (vPart > 0.5 && vPart < 1.5) c = mix(pale, dark, step(0.0, p.y + 0.06) * 0.5);
          if (vPart > 1.5 && vPart < 2.5) c = p.y < 0.006 ? mix(pale, dark, smoothstep(0.3, 0.7, gH(floor(p.xz * 40.0)))) : dark;
          // Barnacles and tubercles on the head.
          float knob = step(0.93, gH(floor(p.xz * 110.0))) * step(0.3, p.z) * back;
          c = mix(c, vec3(0.55, 0.55, 0.5), knob);
          diffuseColor.rgb = c;`
            : kind === 'shark'
            ? `// Whale shark: dark blue-grey, a grid of pale spots and thin pale stripes; white belly.
          vec3 dark = vec3(0.14, 0.18, 0.22);
          vec3 c = mix(vec3(0.85, 0.86, 0.84), dark, back);
          vec2 g = vec2(p.z * 36.0, atan(p.x, p.y + 0.02) * 5.0);
          vec2 cell = floor(g);
          vec2 f = fract(g) - 0.5 - (vec2(gH(cell), gH(cell + 7.3)) - 0.5) * 0.5;
          float spot = smoothstep(0.12 + 0.12 * gH(cell + 3.1), 0.05 + 0.08 * gH(cell + 3.1), length(f)) * back;
          float stripe = smoothstep(0.06, 0.02, abs(fract(p.z * 18.0) - 0.5)) * back * 0.5;
          c = mix(c, vec3(0.8, 0.82, 0.78), max(spot, stripe));
          if (vPart > 2.5) c = vec3(0.04);
          diffuseColor.rgb = c;`
            : `// Manta: black above with white shoulder patches, white below.
          vec3 c = p.y >= 0.0 ? vec3(0.05, 0.05, 0.06) : vec3(0.9, 0.9, 0.88);
          float patchW = smoothstep(0.1, 0.05, length(vec2(abs(p.x) - 0.14, p.z - 0.08))) * step(0.0, p.y);
          c = mix(c, vec3(0.85, 0.85, 0.82), patchW);
          if (vPart > 2.5) c = vec3(0.05);
          diffuseColor.rgb = c;`
        }`,
      );
  };
  m.customProgramCacheKey = () => `giant-${kind}`;
  return m;
}

/** Jellyfish: see-through, faintly glowing, bells pulsing and arms trailing. */
function jellyMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ name: 'מדוזות', vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, emissive: 0x6070a0, emissiveIntensity: 0.25 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aMask; attribute float aPart; attribute float iPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float pulse = sin(uTime * 2.2 + iPhase);
        if (aPart < 1.5) { transformed.xz *= 1.0 - 0.12 * pulse * aMask; transformed.y *= 1.0 + 0.1 * pulse; }
        else transformed.xz += vec2(sin(uTime * 1.3 + iPhase + transformed.y * 3.0), cos(uTime * 1.1 + iPhase + transformed.y * 2.0)) * 0.08 * aMask;`,
      );
  };
  m.customProgramCacheKey = () => 'jelly-1';
  return m;
}

/** A tiny helper: instanced mesh of `count` with a per-instance phase attribute. */
function instanced(geo, mat, count, name) {
  const g = geo.clone();
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) ph[i] = Math.random() * 6.28;
  g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(ph, 1));
  const mesh = new THREE.InstancedMesh(g, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.userData.noPick = true;
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, _m);
  return mesh;
}

export class Megafauna {
  /** life: the island's Life (terrain, uniforms, fish material, solids). */
  constructor(engine, life) {
    this.engine = engine;
    this.life = life;
    this.terrain = life.terrain;
    this.stage = life.stage;
    this.rng = new Random(this.stage.seed * 97 + 11);
    this.group = new THREE.Group();
    this.group.name = 'חיי הים הגדולים';
    this.time = 0;
  }

  /** A spot in open water deeper than `min` (and shallower than `max`), or null. */
  _deep(min, max = 400, near = null) {
    const t = this.terrain;
    const half = t.size / 2 - 40;
    for (let k = 0; k < 400; k++) {
      const x = near ? near.x + this.rng.range(-near.r, near.r) : this.rng.range(-half, half);
      const z = near ? near.z + this.rng.range(-near.r, near.r) : this.rng.range(-half, half);
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const h = t.heightAt(x, z);
      if (-h >= min && -h <= max) return { x, z, h };
    }
    return null;
  }

  build() {
    const U = this.life.uniforms;
    const cfg = this.life.cfg;
    // Whales: a humpback or two, sometimes a mother with her calf.
    this.whales = [];
    const nW = cfg.whales ?? 2;
    const whaleGeo = humpbackGeometry();
    const whaleMesh = instanced(whaleGeo, giantMaterial(U, 'whale'), Math.max(1, nW * 2), 'לווייתנים');
    this.group.add(whaleMesh);
    for (let i = 0; i < nW; i++) {
      const s = this._deep(25);
      if (!s) break;
      const R = Math.hypot(s.x, s.z);
      const w = { mesh: whaleMesh, slot: this.whales.length, len: this.rng.range(12, 15), a: Math.atan2(s.z, s.x), R, dir: this.rng.random() < 0.5 ? 1 : -1, x: s.x, y: -10, z: s.z, yaw: 0, pitch: 0, roll: 0, state: 'cruise', t: this.rng.range(10, 40), speed: 2.4, blows: 0 };
      this.whales.push(w);
      if (this.rng.random() < 0.5) this.whales.push({ ...w, slot: this.whales.length, len: w.len * 0.45, calf: w, off: this.rng.range(-1, 1) });
    }
    // Whale sharks near the surface over deep water.
    this.sharks = [];
    const nS = cfg.whaleSharks ?? 1;
    const wsMesh = instanced(whaleSharkGeometry(), giantMaterial(U, 'shark'), Math.max(1, nS), 'כרישי לווייתן');
    this.group.add(wsMesh);
    for (let i = 0; i < nS; i++) {
      const s = this._deep(18);
      if (!s) break;
      this.sharks.push({ mesh: wsMesh, slot: i, len: this.rng.range(8, 11), x: s.x, z: s.z, yaw: this.rng.range(0, 6.28), y: -2.5, turn: 0, t: 0 });
    }
    // Mantas over the reef edges.
    this.mantas = [];
    const nM = cfg.mantas ?? 3;
    const mMesh = instanced(mantaGeometry(), giantMaterial(U, 'manta'), Math.max(1, nM), 'מנטות');
    this.group.add(mMesh);
    const spots = this.life.reefSpots || [];
    for (let i = 0; i < nM && spots.length; i++) {
      const r = spots[Math.floor(this.rng.random() * spots.length)];
      const s = this._deep(8, 30, { x: r.x, z: r.z, r: 40 });
      if (!s) continue;
      this.mantas.push({ mesh: mMesh, slot: this.mantas.length, span: this.rng.range(3.5, 5.5), cx: s.x, cz: s.z, a: this.rng.range(0, 6.28), rr: this.rng.range(12, 25), y: s.h + this.rng.range(3, 7), floor: s.h, dir: this.rng.random() < 0.5 ? 1 : -1 });
    }
    // Hammerheads schooling over deep sand.
    this.hammers = [];
    const hGeo = hammerheadGeometry();
    const fishMat = this.life._fishMaterial('swim');
    const nH = cfg.hammerheads ?? 1;
    for (let i = 0; i < nH; i++) {
      const s = this._deep(30, 90);
      if (!s) break;
      const n = Math.round(this.rng.range(10, 22));
      const g = hGeo.clone();
      g.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(8), 1));
      const mesh = new THREE.InstancedMesh(g, fishMat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = 'פטישנים';
      for (let k = 0; k < n; k++) mesh.setColorAt(k, _c.set(0x8a94a0).offsetHSL(0, 0, this.rng.range(-0.05, 0.05)));
      this.group.add(mesh);
      const fish = Array.from({ length: n }, () => ({ ox: this.rng.range(-6, 6), oy: this.rng.range(-2, 2), oz: this.rng.range(-8, 8), ph: this.rng.range(0, 6.28), s: this.rng.range(2.6, 3.6) }));
      this.hammers.push({ mesh, fish, cx: s.x, cz: s.z, a: this.rng.range(0, 6.28), rr: this.rng.range(25, 45), y: Math.max(s.h + 8, -24), dir: this.rng.random() < 0.5 ? 1 : -1 });
    }
    // Bait balls: hundreds of sardines, with jacks and tuna hunting them.
    this.balls = [];
    const nB = cfg.baitBalls ?? 2;
    const slim = fishGeometry('slim');
    const tuna = fishGeometry('tuna');
    const q = this.engine.quality.presetName === 'low' ? 0.5 : 1;
    for (let i = 0; i < nB; i++) {
      const s = this._deep(16, 120);
      if (!s) break;
      const n = Math.round(this.rng.range(1200, 1500) * q);
      const g = slim.clone();
      g.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(0), 1));
      const mesh = new THREE.InstancedMesh(g, fishMat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = 'כדור סרדינים';
      for (let k = 0; k < n; k++) mesh.setColorAt(k, _c.set(0xc8d8e8).offsetHSL(0, 0, this.rng.range(-0.05, 0.05)));
      this.group.add(mesh);
      const fish = Array.from({ length: n }, () => {
        const u = this.rng.random() * 2 - 1;
        return { th: this.rng.range(0, 6.28), el: Math.asin(u), r: Math.cbrt(this.rng.random()), sp: this.rng.range(0.8, 1.2), s: this.rng.range(0.24, 0.32), fx: 0, fy: 0, fz: 0 };
      });
      const np = Math.round(this.rng.range(4, 8));
      const pg = tuna.clone();
      pg.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(np).fill(0), 1));
      const pmesh = new THREE.InstancedMesh(pg, fishMat, np);
      pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pmesh.frustumCulled = false;
      pmesh.name = 'טונות צדות';
      for (let k = 0; k < np; k++) pmesh.setColorAt(k, _c.set(0x44607a).offsetHSL(0, 0, this.rng.range(-0.04, 0.04)));
      this.group.add(pmesh);
      const preds = Array.from({ length: np }, (v, k) => ({ a: (k / np) * 6.28, r: this.rng.range(9, 13), y: this.rng.range(-2, 2), sp: this.rng.range(0.5, 0.8), dash: 0, s: this.rng.range(1.1, 1.5) }));
      this.balls.push({ mesh, pmesh, fish, preds, x: s.x, z: s.z, ax: s.x, az: s.z, y: Math.max(s.h + 8, -12), floor: s.h, R: 3.4, shape: 0, t: 0 });
    }
    // Jellyfish, drifting in loose smacks.
    this.jellies = [];
    const nJ = cfg.jellies ?? 2;
    const jGeo = jellyGeometry();
    const jMat = jellyMaterial(U);
    for (let i = 0; i < nJ; i++) {
      const s = this._deep(8, 200);
      if (!s) break;
      const n = Math.round(this.rng.range(25, 60) * q);
      const mesh = instanced(jGeo, jMat, n, 'מדוזות');
      mesh.renderOrder = 2;
      for (let k = 0; k < n; k++) mesh.setColorAt(k, _c.setHSL(this.rng.range(0.55, 0.9), 0.4, this.rng.range(0.75, 0.9)));
      this.group.add(mesh);
      const list = Array.from({ length: n }, () => ({ x: s.x + this.rng.range(-18, 18), z: s.z + this.rng.range(-18, 18), y: this.rng.range(-2, Math.max(-12, s.h + 3)), s: this.rng.range(0.25, 0.55), vy: this.rng.range(-0.05, 0.05), ph: this.rng.range(0, 6.28) }));
      this.jellies.push({ mesh, list });
    }
    // Solid parts for the boats and submarines (moved every frame).
    this.solids = [];
    for (const w of this.whales) {
      w.parts = [0.3, 0.05, -0.2].map((f) => ({ x: 0, y: 0, z: 0, r: w.len * (f === 0.05 ? 0.1 : 0.08), f }));
      this.solids.push(...w.parts);
    }
    for (const s of this.sharks) {
      s.parts = [0.25, -0.1].map((f) => ({ x: 0, y: 0, z: 0, r: s.len * 0.09, f }));
      this.solids.push(...s.parts);
    }
    for (const m of this.mantas) {
      m.parts = [{ x: 0, y: 0, z: 0, r: m.span * 0.3, f: 0 }];
      this.solids.push(...m.parts);
    }
    return this.group;
  }

  /** Surface height at (x, z). */
  _surf(x, z) {
    const w = this.life.island.water || this.engine.world?.water;
    return waveAt(x, z, this.engine.time.elapsed, w ? w.uniforms.uWaveAmp.value : 1, undefined, 40).y;
  }

  /** Places an instance: position, heading, pitch, roll, uniform size. */
  _put(mesh, slot, x, y, z, yaw, pitch, roll, size) {
    _q.setFromEuler(_e.set(-pitch, yaw, roll, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, _s.set(size, size, size));
    mesh.setMatrixAt(slot, _m);
  }

  _parts(parts, x, y, z, yaw, pitch, len) {
    const fx = Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = Math.cos(yaw) * Math.cos(pitch);
    for (const P of parts) {
      P.x = x + fx * P.f * len;
      P.y = y + fy * P.f * len;
      P.z = z + fz * P.f * len;
    }
  }

  update(dt) {
    if (!this.whales) return;
    this.time += dt;
    const cam = this.engine.camera.position;
    const far = cam.y > 160;
    this._whales(dt, far);
    this._whaleSharks(dt);
    this._mantas(dt);
    this._hammers(dt);
    this._balls(dt, cam);
    this._jellies(dt, cam);
  }

  /**
   * Humpbacks cruise a wide loop round the island at 8–14 m, surface to
   * blow three or four times, arch and lift their flukes as they dive,
   * and now and then launch into a breach and crash back in a burst of spray.
   */
  _whales(dt, far) {
    const P = this.engine.particles;
    const t = this.terrain;
    for (const w of this.whales) {
      if (w.calf) {
        // Calves keep to their mother's side.
        const M = w.calf;
        const sx = Math.cos(M.yaw || 0);
        const sz = -Math.sin(M.yaw || 0);
        const x = M.x + sx * M.len * 0.35 * (w.off > 0 ? 1 : -1) - Math.sin(M.yaw || 0) * M.len * 0.1;
        const z = M.z + sz * M.len * 0.35 * (w.off > 0 ? 1 : -1) - Math.cos(M.yaw || 0) * M.len * 0.1;
        w.x = x;
        w.z = z;
        w.y = Math.min(-w.len * 0.06, (M.y ?? -8) + 1);
        w.yaw = M.yaw;
        this._put(w.mesh, w.slot, x, w.y, z, w.yaw || 0, (M.pitch || 0) * 0.6, 0, w.len);
        this._parts(w.parts, x, w.y, z, w.yaw || 0, 0, w.len);
        continue;
      }
      w.t -= dt;
      const speed = w.state === 'breach' ? 7.5 : w.state === 'dive' ? 2.8 : 2.4;
      w.a += (w.dir * speed * dt) / w.R;
      let x = Math.cos(w.a) * w.R;
      let z = Math.sin(w.a) * w.R;
      // Keep over deep water: drift outward where it shoals.
      const floor = t.heightAt(x, z);
      if (floor > -18) w.R += dt * 3;
      else if (floor < -60 && w.R > 400) w.R -= dt * 0.5;
      x = Math.cos(w.a) * w.R;
      z = Math.sin(w.a) * w.R;
      const yaw = Math.atan2(-Math.sin(w.a) * w.dir, Math.cos(w.a) * w.dir);
      const surf = this._surf(x, z);
      let targetY = -10;
      let targetPitch = 0;
      if (w.state === 'cruise') {
        targetY = Math.max(floor + w.len * 0.3, -12);
        if (w.t <= 0) {
          w.state = this.rng.random() < 0.18 ? 'breach' : 'surface';
          w.t = w.state === 'breach' ? 6 : 16;
          w.blows = 0;
          w.blowT = 4;
        }
      } else if (w.state === 'surface') {
        targetY = surf - w.len * 0.045;
        targetPitch = (targetY - w.y) * 0.08;
        w.blowT -= dt;
        if (w.blowT <= 0 && Math.abs(w.y - targetY) < 0.6) {
          w.blowT = 3.5 + this.rng.random() * 2;
          w.blows++;
          // The blow: a tall bushy column of spray from the blowhole.
          if (P && P.spray && !far) {
            const bx = x + Math.sin(yaw) * w.len * 0.28;
            const bz = z + Math.cos(yaw) * w.len * 0.28;
            for (let k = 0; k < 70; k++) {
              P.spray.emit({ x: bx + (Math.random() - 0.5) * 0.4, y: surf + 0.4, z: bz + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.6, vy: 7 + Math.random() * 5, vz: (Math.random() - 0.5) * 1.6, life: 2.2 + Math.random(), size0: 0.5, size1: 2.6, color0: [0.95, 0.97, 1, 0.8], color1: [0.9, 0.93, 0.97, 0], gravity: 3.2, drag: 1.2 });
            }
          }
        }
        if (w.t <= 0 || w.blows >= 4) {
          w.state = 'dive';
          w.t = 7;
        }
      } else if (w.state === 'dive') {
        // Arch over and lift the flukes clear of the water.
        const k = 1 - w.t / 7;
        targetPitch = -Math.sin(Math.min(1, k * 1.3) * Math.PI * 0.5) * 1.05;
        targetY = surf - w.len * 0.05 - k * w.len * 0.6;
        if (w.t <= 0) {
          w.state = 'cruise';
          w.t = 40 + this.rng.random() * 50;
        }
      } else if (w.state === 'breach') {
        const k = 1 - w.t / 6;
        if (k < 0.45) {
          targetY = surf + w.len * (k / 0.45) * 0.55 - w.len * 0.2;
          targetPitch = 1.15;
          w.roll = (w.roll || 0) + dt * 0.9;
        } else {
          targetY = surf - w.len * 0.3;
          targetPitch = -0.2;
          if (!w.splashed && w.y < surf + w.len * 0.15) {
            w.splashed = true;
            if (P && P.spray && !far) {
              for (let k2 = 0; k2 < 220; k2++) {
                const a = Math.random() * 6.28;
                const r = Math.random() * w.len * 0.4;
                P.spray.emit({ x: x + Math.cos(a) * r, y: surf + 0.3, z: z + Math.sin(a) * r, vx: Math.cos(a) * (2 + Math.random() * 6), vy: 5 + Math.random() * 11, vz: Math.sin(a) * (2 + Math.random() * 6), life: 2 + Math.random() * 1.5, size0: 0.8, size1: 3.2, color0: [0.97, 0.98, 1, 0.9], color1: [0.9, 0.94, 0.97, 0], gravity: 7, drag: 0.6 });
              }
            }
          }
        }
        if (w.t <= 0) {
          w.state = 'cruise';
          w.splashed = false;
          w.roll = 0;
          w.t = 50 + this.rng.random() * 60;
        }
      }
      const rate = w.state === 'breach' ? 3.5 : 0.8;
      w.y += (targetY - w.y) * Math.min(1, dt * rate);
      w.pitch += (targetPitch - w.pitch) * Math.min(1, dt * (w.state === 'breach' ? 3 : 1.2));
      w.x = x;
      w.z = z;
      w.yaw = yaw;
      this._put(w.mesh, w.slot, x, w.y, z, yaw, w.pitch, w.state === 'breach' ? w.roll : Math.sin(this.time * 0.3 + w.slot) * 0.06, w.len);
      this._parts(w.parts, x, w.y, z, yaw, w.pitch, w.len);
    }
    if (this.whales.length) this.whales[0].mesh.instanceMatrix.needsUpdate = true;
  }

  /** Whale sharks cruise slowly just under the surface, wandering over deep water. */
  _whaleSharks(dt) {
    const t = this.terrain;
    for (const s of this.sharks) {
      s.t -= dt;
      if (s.t <= 0) {
        s.t = 8 + this.rng.random() * 10;
        s.turn = this.rng.range(-0.08, 0.08);
      }
      const ax = s.x + Math.sin(s.yaw) * 20;
      const az = s.z + Math.cos(s.yaw) * 20;
      if (t.heightAt(ax, az) > -15) s.yaw += dt * 0.25;
      else s.yaw += s.turn * dt;
      s.x += Math.sin(s.yaw) * 1.3 * dt;
      s.z += Math.cos(s.yaw) * 1.3 * dt;
      s.y = -2.2 - Math.sin(this.time * 0.07 + s.slot) * 1.2;
      this._put(s.mesh, s.slot, s.x, s.y, s.z, s.yaw, 0, 0, s.len);
      this._parts(s.parts, s.x, s.y, s.z, s.yaw, 0, s.len);
    }
    if (this.sharks.length) this.sharks[0].mesh.instanceMatrix.needsUpdate = true;
  }

  /** Mantas bank in slow loops over the reef edge, rising and dipping. */
  _mantas(dt) {
    for (const m of this.mantas) {
      m.a += (m.dir * 1.6 * dt) / m.rr;
      const x = m.cx + Math.cos(m.a) * m.rr;
      const z = m.cz + Math.sin(m.a * 0.85) * m.rr * 0.8;
      const floor = this.terrain.heightAt(x, z);
      const y = Math.min(-3.5, Math.max(floor + 2.5, m.y + Math.sin(this.time * 0.2 + m.a) * 2));
      const yaw = Math.atan2(-Math.sin(m.a) * m.dir, Math.cos(m.a * 0.85) * 0.68 * m.dir);
      this._put(m.mesh, m.slot, x, y, z, yaw, Math.sin(this.time * 0.2 + m.a) * 0.08, -m.dir * 0.2, m.span);
      this._parts(m.parts, x, y, z, yaw, 0, m.span);
    }
    if (this.mantas.length) this.mantas[0].mesh.instanceMatrix.needsUpdate = true;
  }

  /** Hammerhead schools patrol in slow ovals, each shark weaving in its own place. */
  _hammers(dt) {
    for (const H of this.hammers) {
      H.a += (H.dir * 1.8 * dt) / H.rr;
      const cx = H.cx + Math.cos(H.a) * H.rr;
      const cz = H.cz + Math.sin(H.a) * H.rr * 0.6;
      const yaw = Math.atan2(-Math.sin(H.a) * H.dir, Math.cos(H.a) * 0.6 * H.dir);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      H.fish.forEach((f, k) => {
        const wob = Math.sin(this.time * 0.7 + f.ph);
        const lx = f.ox + wob * 0.8;
        const lz = f.oz;
        const x = cx + lx * c + lz * s;
        const z = cz - lx * s + lz * c;
        this._put(H.mesh, k, x, H.y + f.oy + Math.sin(this.time * 0.5 + f.ph) * 0.6, z, yaw + wob * 0.12, 0, 0, f.s);
      });
      H.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Bait balls: every sardine circles the ball's centre on its own orbit,
   * the ball breathing between a sphere and a twisting column; the hunters
   * circle and dash through, and the sardines part round them and round
   * anything else that comes close, then close up again.
   */
  _balls(dt, cam) {
    for (const B of this.balls) {
      if (Math.abs(B.x - cam.x) > 260 || Math.abs(B.z - cam.z) > 260) {
        if (!B.hidden) {
          _m.makeScale(0, 0, 0);
          for (let i = 0; i < B.fish.length; i++) B.mesh.setMatrixAt(i, _m);
          for (let i = 0; i < B.preds.length; i++) B.pmesh.setMatrixAt(i, _m);
          B.mesh.instanceMatrix.needsUpdate = true;
          B.pmesh.instanceMatrix.needsUpdate = true;
          B.hidden = true;
        }
        continue;
      }
      B.hidden = false;
      B.t += dt;
      // The ball drifts round its home, breathing between a ball and a column.
      B.x = B.ax + Math.sin(B.t * 0.05) * 20;
      B.z = B.az + Math.cos(B.t * 0.043) * 20;
      const col = smoothstep(0.3, 0.9, 0.5 + 0.5 * Math.sin(B.t * 0.08));
      const R = B.R * (1 - col * 0.35);
      const Hh = R * (1 + col * 2.2);
      const cy = Math.min(-R * 0.8 - 1, B.y);
      // Hunters.
      const threats = [];
      B.preds.forEach((p, k) => {
        p.dash -= dt;
        if (p.dash <= -6 + k) p.dash = 1.4;
        const dashing = p.dash > 0;
        p.a += dt * p.sp * (dashing ? 0 : 1);
        let x = B.x + Math.cos(p.a) * p.r;
        let z = B.z + Math.sin(p.a) * p.r;
        let y = cy + p.y;
        let yaw = p.a + Math.PI;
        if (dashing) {
          // Straight through the middle.
          const u = 1 - p.dash / 1.4;
          x = B.x + Math.cos(p.a) * p.r * (1 - 2 * u);
          z = B.z + Math.sin(p.a) * p.r * (1 - 2 * u);
          yaw = Math.atan2(-Math.cos(p.a), -Math.sin(p.a));
        } else yaw = Math.atan2(-Math.sin(p.a), Math.cos(p.a));
        threats.push({ x, y, z, r: 3.2 });
        this._put(B.pmesh, k, x, y, z, yaw, 0, 0, p.s);
      });
      threats.push({ x: cam.x, y: cam.y, z: cam.z, r: 4.5 });
      B.fish.forEach((f, k) => {
        f.th += dt * f.sp * (1.1 / (0.35 + f.r));
        const r = R * (0.35 + 0.65 * f.r);
        let x = B.x + Math.cos(f.th) * r * Math.cos(f.el);
        let z = B.z + Math.sin(f.th) * r * Math.cos(f.el);
        let y = cy + Math.sin(f.el) * Hh * 0.5 * (0.4 + 0.6 * f.r) + Math.sin(f.th * 2 + f.el * 3) * 0.3;
        // Parting round hunters and divers.
        for (const T of threats) {
          const dx = x + f.fx - T.x;
          const dy = y + f.fy - T.y;
          const dz = z + f.fz - T.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < T.r && d > 1e-3) {
            const push = ((T.r - d) / T.r) * dt * 22;
            f.fx += (dx / d) * push;
            f.fy += (dy / d) * push;
            f.fz += (dz / d) * push;
          }
        }
        const back = 1 - Math.min(1, dt * 1.2);
        f.fx *= back;
        f.fy *= back;
        f.fz *= back;
        x += f.fx;
        y = Math.min(-0.5, y + f.fy);
        z += f.fz;
        this._put(B.mesh, k, x, y, z, Math.atan2(-Math.sin(f.th), Math.cos(f.th)), Math.sin(f.th * 2) * 0.1, 0, f.s);
      });
      B.mesh.instanceMatrix.needsUpdate = true;
      B.pmesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Jellyfish drift with the current, pulsing up and sinking back, and turn slowly. */
  _jellies(dt, cam) {
    for (const J of this.jellies) {
      J.list.forEach((j, k) => {
        j.ph += dt;
        j.y += (Math.sin(j.ph * 0.35) * 0.12 + j.vy) * dt;
        j.x += Math.sin(this.time * 0.02 + k) * 0.15 * dt;
        j.z += Math.cos(this.time * 0.017 + k) * 0.15 * dt;
        const floor = this.terrain.heightAt(j.x, j.z);
        if (j.y > -1.2) j.y = -1.2;
        if (j.y < floor + 1.5) j.y = floor + 1.5;
        this._put(J.mesh, k, j.x, j.y, j.z, j.ph * 0.05, Math.sin(j.ph * 0.3) * 0.15, Math.cos(j.ph * 0.25) * 0.15, j.s);
      });
      J.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
