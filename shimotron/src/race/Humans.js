import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * People. One body plan (about 1.75 m, feet at the origin, facing +Z)
 * with human proportions and smooth shading: shaped legs with knees and
 * calves, rounded shoes, hips and a torso with chest, waist and
 * shoulders, a neck, a head with jaw, nose, ears, eyes and brows, and
 * hair (short, long, a bun, curls or a cap). Arms hang from shoulder
 * pivots so they can be posed or animated; hands have thumbs.
 *
 * Every vertex carries `aPart` — 0 skin, 1 shirt, 2 trousers, 3 hair,
 * 4 shoes, 5 dark features (pupils, brows, mouth), 6 eye whites — so one
 * geometry can be dressed per person, either with baked vertex colours
 * (single figures) or per instance in the crowd shader.
 */

const PART = { skin: 0, shirt: 1, pants: 2, hair: 3, shoes: 4, dark: 5, white: 6 };
export const SHOULDER_Y = 1.43;
export const SHOULDER_X = 0.205;

/** Smooth-shaded, non-indexed, tagged with a body part. */
function tag(g, part, smooth = true) {
  if (smooth) {
    g = g.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
  }
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}

/** Cylinder from y0 (radius r0) up to y1 (radius r1), squashed front-to-back by sz. */
function limb(r0, r1, y0, y1, seg, part, sz = 1, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  g.scale(1, 1, sz);
  return tag(g, part);
}

/** Surface of revolution from [radius, y] pairs, squashed by sx / sz. */
function latheRaw(profile, seg, part, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
  g.scale(sx, 1, sz);
  return tag(g, part);
}

function ball(r, seg, part, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(3, Math.round(seg * 0.7)));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return tag(g, part);
}

/**
 * Parts for one figure: body (no arms) and the two arms, each arm built
 * hanging from its shoulder at the origin (rotate it about Z to raise it
 * sideways, about X to swing it forward).
 * lod 1 is the crowd version, well under half the triangles.
 */
export function humanParts({ female = false, hair = 'short', build = 1, lod = 0, skirt = false } = {}) {
  const seg = lod ? 5 : 10;
  // The crowd version keeps every other profile point.
  const thin = (pts) => (lod ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts);
  const lathe = (profile, sg, part, sx, sz) => latheRaw(thin(profile), sg, part, sx, sz);
  const parts = [];
  const w = build;
  // Legs: thigh and calf shapes in one lathe each, a knee between.
  for (const x of [-0.095, 0.095]) {
    const leg = lathe(
      [
        [0.05, 0.075],
        [0.056, 0.14],
        [0.063, 0.3],
        [0.058, 0.44],
        [0.062, 0.5],
        [0.075 * w, 0.62],
        [0.085 * w, 0.8],
        [0.09 * w, 0.93],
        [0.07, 0.98],
      ],
      seg,
      skirt ? PART.skin : PART.pants,
      1,
      0.95,
    );
    leg.translate(x, 0, 0);
    parts.push(leg);
    if (skirt) parts.push(limb(0.086 * w, 0.075, 0.8, 0.98, seg, PART.pants).translate(x, 0, 0));
    // Shoe: a rounded upper on a sole.
    parts.push(ball(0.06, lod ? 5 : 10, PART.shoes, x, 0.055, 0.045, 0.85, 0.7, 2.0));
    if (!lod) parts.push(tag(new THREE.BoxGeometry(0.1, 0.025, 0.26).translate(x, 0.012, 0.045), PART.shoes, false));
  }
  if (skirt) parts.push(lathe([[0.16 * w, 0.62], [0.17 * w, 0.75], [0.155 * w, 0.95], [0.15 * w, 1.02], [0.001, 1.03]], seg + 4, PART.pants, 1, 0.8));
  // Hips and seat.
  parts.push(lathe([[0.001, 0.86], [0.12 * w, 0.87], [(female ? 0.175 : 0.162) * w, 0.95], [0.165 * w, 1.03], [0.15 * w, 1.07]], seg + 4, PART.pants, 1, 0.66));
  // Belt.
  if (!lod && !skirt) parts.push(limb(0.152 * w, 0.152 * w, 1.03, 1.06, seg + 4, PART.shoes, 0.66));
  // Torso: waist, ribcage, chest, shoulders (flattened front to back).
  const torso = female
    ? [[0.148 * w, 1.05], [0.132 * w, 1.13], [0.14 * w, 1.2], [0.158 * w, 1.28], [0.162 * w, 1.33], [0.17 * w, 1.4], [0.15 * w, 1.45], [0.08, 1.49], [0.001, 1.5]]
    : [[0.152 * w, 1.05], [0.148 * w, 1.13], [0.165 * w, 1.22], [0.182 * w, 1.3], [0.19 * w, 1.37], [0.192 * w, 1.42], [0.16 * w, 1.47], [0.08, 1.5], [0.001, 1.51]];
  parts.push(lathe(torso, seg + (lod ? 2 : 4), PART.shirt, 1, female ? 0.66 : 0.62));
  if (female) for (const x of [-0.07, 0.07]) parts.push(ball(0.062, lod ? 6 : 9, PART.shirt, x * w, 1.3, 0.055, 1, 0.9, 0.8));
  // Collar.
  if (!lod) parts.push(tag(new THREE.TorusGeometry(0.058, 0.014, 5, 12).rotateX(Math.PI / 2).translate(0, 1.495, 0.004), PART.shirt));
  // Shoulders (deltoids), in the shirt.
  if (!lod) for (const x of [-SHOULDER_X, SHOULDER_X]) parts.push(ball(0.058, 9, PART.shirt, x * 0.96, SHOULDER_Y + 0.01, 0, 1.05, 0.9, 1));
  parts.push(limb(0.048, 0.043, 1.47, 1.57, lod ? 5 : 8, PART.skin));
  // Head: skull, jaw, nose, ears.
  const hy = 1.655;
  parts.push(ball(0.098, lod ? 7 : 14, PART.skin, 0, hy, 0.0, 0.86, 1.08, 0.98));
  if (!lod) parts.push(ball(0.075, 10, PART.skin, 0, hy - 0.055, 0.02, female ? 0.82 : 0.92, 0.72, 0.92));
  const nose = tag(new THREE.ConeGeometry(0.017, 0.042, lod ? 4 : 6).rotateX(Math.PI / 2 - 0.25).translate(0, hy - 0.02, 0.1), PART.skin);
  parts.push(nose);
  if (!lod) for (const x of [-0.085, 0.085]) parts.push(ball(0.022, 6, PART.skin, x, hy - 0.005, -0.005, 0.45, 1.1, 0.8));
  // Eyes, brows, mouth.
  for (const x of [-0.034, 0.034]) {
    if (!lod) parts.push(ball(0.0135, 6, PART.white, x, hy + 0.012, 0.079, 1.2, 0.8, 0.5));
    parts.push(ball(lod ? 0.011 : 0.0075, lod ? 4 : 6, PART.dark, x, hy + 0.012, lod ? 0.083 : 0.086, 1, 1, 0.5));
    if (!lod) parts.push(tag(new THREE.BoxGeometry(0.03, 0.006, 0.008).rotateZ(x > 0 ? -0.12 : 0.12).translate(x, hy + 0.035, 0.083), PART.hair, false));
  }
  if (!lod) parts.push(tag(new THREE.BoxGeometry(0.034, 0.005, 0.006).translate(0, hy - 0.06, 0.086), PART.dark, false));
  // Hair.
  const cap = (open, back = 0) => {
    const g = new THREE.SphereGeometry(0.104, lod ? 7 : 14, lod ? 4 : 8, 0, Math.PI * 2, 0, Math.PI * open);
    g.scale(0.9, 1.08, 1.0);
    g.rotateX(back);
    g.translate(0, hy + 0.008, -0.01);
    return tag(g, PART.hair);
  };
  if (hair === 'cap') {
    parts.push(cap(0.46));
    const brim = tag(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 10, 1, false, -Math.PI / 2, Math.PI), PART.hair);
    brim.scale(1, 1, 1.4);
    brim.translate(0, hy + 0.045, 0.07);
    parts.push(brim);
  } else if (hair === 'curly') {
    parts.push(cap(0.55, -0.2));
    for (let k = 0; k < (lod ? 5 : 11); k++) {
      const a = (k / (lod ? 5 : 11)) * Math.PI * 2;
      parts.push(ball(0.04, lod ? 4 : 6, PART.hair, Math.cos(a) * 0.085, hy + 0.05 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.08 - 0.02));
    }
  } else {
    parts.push(cap(0.56, -0.25));
    if (hair === 'long') {
      const back = tag(new THREE.CylinderGeometry(0.088, 0.105, 0.32, lod ? 6 : 10, 1, true, Math.PI * 0.55, Math.PI * 0.9), PART.hair);
      back.translate(0, hy - 0.14, -0.01);
      parts.push(back);
    } else if (hair === 'bun') {
      parts.push(ball(0.045, lod ? 5 : 8, PART.hair, 0, hy + 0.07, -0.09));
    }
  }
  const body = mergeGeometries(parts);
  const arm = (side) => {
    const sleeve = lod ? -0.2 : -0.17;
    const upper = lathe([[0.001, 0.02], [0.05, 0.0], [0.052, -0.08], [0.047, -0.2], [0.046, sleeve]], seg, PART.shirt);
    const bare = lathe([[0.043, sleeve], [0.041, -0.29], [0.043, -0.33], [0.042, -0.42], [0.034, -0.53], [0.03, -0.56]], seg, PART.skin);
    const hand = ball(0.042, lod ? 4 : 8, PART.skin, 0, -0.615, 0.01, 0.62, 1.2, 0.95);
    const g = [upper, bare, hand];
    if (!lod) g.push(ball(0.016, 5, PART.skin, side * 0.022, -0.59, 0.035, 1, 1.8, 1));
    const out = mergeGeometries(g);
    // Hang slightly away from the body, elbows a touch bent.
    out.rotateZ(side * 0.08);
    out.rotateX(-0.04);
    return out;
  };
  return { body, armL: arm(1), armR: arm(-1) };
}

/** One geometry with the arms in place; `aLimb` marks them (1 left, 2 right) for the crowd shader. */
export function humanMerged(opts) {
  const { body, armL, armR } = humanParts(opts);
  const mark = (g, v) => {
    g.setAttribute('aLimb', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
    return g;
  };
  const l = armL.clone().translate(SHOULDER_X, SHOULDER_Y, 0);
  const r = armR.clone().translate(-SHOULDER_X, SHOULDER_Y, 0);
  return mergeGeometries([mark(body.clone(), 0), mark(l, 1), mark(r, 2)]);
}

/** Bakes clothes into vertex colours for a single figure. */
export function paintHuman(geo, { skin, shirt, pants, hair, shoes = 0x1b1b1e }) {
  const cols = [skin, shirt, pants, hair, shoes, 0x1a1210, 0xf2efe8].map((c) => new THREE.Color(c));
  const part = geo.attributes.aPart.array;
  const out = new Float32Array(part.length * 3);
  for (let i = 0; i < part.length; i++) {
    const c = cols[Math.round(part[i])];
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

export const SKINS = [0xf1c9a8, 0xe8b996, 0xd9a47f, 0xc68863, 0xa9714c, 0x8a5a3c, 0x6b4430];
export const HAIRS = [0x1c1410, 0x2e1f16, 0x4a3020, 0x7a5230, 0xb88a4e, 0xd9c08a, 0x8e8e8e, 0x3a2418];
const SHIRTS = [0xe0262b, 0xffffff, 0x1f6fe0, 0xf2c230, 0x1faa59, 0x111111, 0xff7a1a, 0x8a4dff, 0x18b8c9, 0xf06aa0, 0x2b3a67, 0xc9c2b0];
const PANTS = [0x1f2a44, 0x2b2b2e, 0x3a3f4a, 0x6b5a45, 0xc9c2b0, 0x24324f, 0x4a4a52];

/**
 * Crowd material: dresses each instance from per-instance colours
 * (iShirt, iPants, iSkin, iHair) and animates it — a bounce and arms
 * thrown up in turns, scaled by uCheer.
 */
export function crowdMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCheer = uniforms.uCheer;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform float uCheer;
        attribute float aPart; attribute float aLimb;
        attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; attribute vec3 iHair;
        varying vec3 vDress;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        int P = int(aPart + 0.5);
        vDress = P == 0 ? iSkin : P == 1 ? iShirt : P == 2 ? iPants : P == 3 ? iHair : P == 5 ? vec3(0.03, 0.02, 0.02) : P == 6 ? vec3(0.9) : vec3(0.1);
        #ifdef USE_INSTANCING
          float ph = dot(instanceMatrix[3].xz, vec2(1.7, 2.3));
          float beat = abs(sin(uTime * (4.5 + fract(ph) * 3.0) + ph));
          // Arms: raised sideways in turns when cheering.
          if (aLimb > 0.5) {
            float side = aLimb < 1.5 ? 1.0 : -1.0;
            vec3 pivot = vec3(${SHOULDER_X.toFixed(3)} * side, ${SHOULDER_Y.toFixed(3)}, 0.0);
            float up = uCheer * (0.6 + 1.9 * smoothstep(0.35, 0.95, abs(sin(uTime * 2.1 + ph * 0.7 + side))));
            float a = side * up;
            vec3 q = transformed - pivot;
            transformed = pivot + vec3(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a), q.z);
          }
          transformed.y += beat * 0.1 * uCheer;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDress;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vDress;');
  };
  m.customProgramCacheKey = () => 'crowd-people';
  return m;
}

let crowdGeos = null;

/**
 * Instanced crowd: `items` are { m: Matrix4 } (feet position, facing),
 * optionally with colours; returns a Group of three body variants
 * (short hair, long hair, cap) sharing one material.
 */
export function createCrowd(items, uniforms, rng = Math.random, { shadows = false } = {}) {
  if (!crowdGeos) crowdGeos = [humanMerged({ hair: 'short', lod: 1 }), humanMerged({ female: true, hair: 'long', lod: 1 }), humanMerged({ hair: 'cap', build: 1.08, lod: 1 }), humanMerged({ female: true, hair: 'bun', lod: 1, skirt: true }), humanMerged({ hair: 'curly', build: 0.96, lod: 1 })];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const group = new THREE.Group();
  const mat = crowdMaterial(uniforms);
  const lists = crowdGeos.map(() => []);
  for (const it of items) lists[Math.floor(rng() * lists.length)].push(it);
  lists.forEach((list, v) => {
    if (!list.length) return;
    const geo = crowdGeos[v].clone();
    const n = list.length;
    const attr = (name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      geo.setAttribute(name, a);
      return a;
    };
    const shirt = attr('iShirt');
    const pants = attr('iPants');
    const skin = attr('iSkin');
    const hair = attr('iHair');
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const c = new THREE.Color();
    list.forEach((it, k) => {
      mesh.setMatrixAt(k, it.m);
      c.set(it.shirt ?? pick(SHIRTS)).toArray(shirt.array, k * 3);
      c.set(it.pants ?? pick(PANTS)).toArray(pants.array, k * 3);
      c.set(it.skin ?? pick(SKINS)).toArray(skin.array, k * 3);
      c.set(it.hair ?? (v === 2 ? pick(SHIRTS) : pick(HAIRS))).toArray(hair.array, k * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.name = 'קהל';
    mesh.userData.noPick = true;
    group.add(mesh);
  });
  group.name = 'קהל';
  return group;
}
