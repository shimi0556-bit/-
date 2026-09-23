import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * People. One low-poly body plan (about 1.75 m, feet at the origin,
 * facing +Z) with human proportions: tapered legs in trousers, shoes,
 * hips, a torso that widens to the chest and shoulders, neck, a head
 * with a nose and hair (short, long or a cap), and arms in short sleeves
 * that hang from shoulder pivots so they can be posed or animated.
 *
 * Every vertex carries `aPart` — 0 skin, 1 shirt, 2 trousers, 3 hair,
 * 4 shoes — so one geometry can be dressed per person, either with baked
 * vertex colours (single figures) or per instance in the crowd shader.
 */

const PART = { skin: 0, shirt: 1, pants: 2, hair: 3, shoes: 4 };
export const SHOULDER_Y = 1.43;
export const SHOULDER_X = 0.205;

function tag(g, part) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
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

function lathe(profile, seg, part, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(sx, 1, sz);
  return tag(g, part);
}

/**
 * Parts for one figure: body (no arms) and the two arms, each arm built
 * hanging from its shoulder at the origin (rotate it about Z to raise it
 * sideways, about X to swing it forward).
 */
export function humanParts({ female = false, hair = 'short', build = 1, lod = 0 } = {}) {
  // lod 1: the crowd version, about half the triangles.
  const seg = lod ? 5 : 7;
  const open = lod > 0;
  const round = lod ? [7, 5, 4] : [10, 8, 6]; // head segments, head rings, hair rings
  const parts = [];
  const w = build;
  // Legs and shoes.
  for (const x of [-0.095, 0.095]) {
    const thigh = limb(0.085 * w, 0.07, 0.5, 0.97, seg, PART.pants, 1, open);
    const shin = limb(0.066, 0.052, 0.08, 0.52, seg, PART.pants, 1, open);
    thigh.translate(x, 0, 0);
    shin.translate(x, 0, 0);
    const shoe = tag(new THREE.BoxGeometry(0.1, 0.08, 0.25), PART.shoes);
    shoe.translate(x, 0.04, 0.045);
    parts.push(thigh, shin, shoe);
  }
  // Hips, torso, neck.
  parts.push(lathe([[0.001, 0.9], [0.15 * w, 0.92], [0.165 * w, 1.0], [0.15 * w, 1.06]], seg + 3, PART.pants, 1, 0.68));
  const torso = female
    ? [[0.148 * w, 1.05], [0.13 * w, 1.13], [0.155 * w, 1.27], [0.16 * w, 1.33], [0.165 * w, 1.42], [0.09, 1.47], [0.001, 1.48]]
    : [[0.152 * w, 1.05], [0.15 * w, 1.13], [0.175 * w, 1.28], [0.188 * w, 1.37], [0.185 * w, 1.43], [0.1, 1.48], [0.001, 1.49]];
  parts.push(lathe(torso, seg + 3, PART.shirt, 1, 0.62));
  parts.push(limb(0.05, 0.045, 1.46, 1.55, lod ? 4 : 6, PART.skin, 1, open));
  // Head: a slightly long ellipsoid, a nose, and hair.
  const head = tag(new THREE.SphereGeometry(0.1, round[0], round[1]), PART.skin);
  head.scale(0.88, 1.1, 0.96);
  head.translate(0, 1.64, 0.005);
  const nose = tag(new THREE.ConeGeometry(0.018, 0.045, 4), PART.skin);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 1.625, 0.105);
  parts.push(head);
  if (!lod) parts.push(nose);
  if (hair === 'cap') {
    const cap = tag(new THREE.SphereGeometry(0.106, round[0], round[2] - 1, 0, Math.PI * 2, 0, Math.PI * 0.45), PART.hair);
    cap.scale(0.92, 1.05, 1);
    cap.translate(0, 1.66, 0);
    const brim = tag(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 8, 1, false, -Math.PI / 2, Math.PI), PART.hair);
    brim.scale(1, 1, 1.4);
    brim.translate(0, 1.7, 0.07);
    parts.push(cap, brim);
  } else {
    const top = tag(new THREE.SphereGeometry(0.106, round[0], round[2], 0, Math.PI * 2, 0, Math.PI * 0.55), PART.hair);
    top.scale(0.92, 1.1, 1.0);
    top.rotateX(-0.25);
    top.translate(0, 1.655, -0.012);
    parts.push(top);
    if (hair === 'long') {
      const back = tag(new THREE.CylinderGeometry(0.085, 0.1, 0.3, 8, 1, true, Math.PI * 0.55, Math.PI * 0.9), PART.hair);
      back.translate(0, 1.52, -0.005);
      parts.push(back);
    }
  }
  const body = mergeGeometries(parts);
  body.computeVertexNormals();
  const arm = (side) => {
    const upper = limb(0.047, 0.056, -0.3, 0.0, lod ? 4 : 6, PART.shirt, 1, open);
    const fore = limb(0.035, 0.043, -0.56, -0.29, lod ? 4 : 6, PART.skin, 1, open);
    const hand = tag(new THREE.SphereGeometry(0.045, lod ? 4 : 6, lod ? 3 : 5), PART.skin);
    hand.scale(0.8, 1.15, 0.6);
    hand.translate(0, -0.61, 0);
    const g = mergeGeometries([upper, fore, hand]);
    // Hang slightly away from the body.
    g.rotateZ(side * 0.08);
    g.computeVertexNormals();
    return g;
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
  const cols = [skin, shirt, pants, hair, shoes].map((c) => new THREE.Color(c));
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
        vDress = P == 0 ? iSkin : P == 1 ? iShirt : P == 2 ? iPants : P == 3 ? iHair : vec3(0.1);
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
  if (!crowdGeos) crowdGeos = [humanMerged({ hair: 'short', lod: 1 }), humanMerged({ female: true, hair: 'long', lod: 1 }), humanMerged({ hair: 'cap', build: 1.08, lod: 1 })];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const group = new THREE.Group();
  const mat = crowdMaterial(uniforms);
  const lists = [[], [], []];
  for (const it of items) lists[Math.floor(rng() * 3)].push(it);
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
