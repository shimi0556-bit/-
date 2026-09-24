import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Shapes for the living sea: every kind of coral, sponge and anemone on
 * the reef, and fish with proper bodies — tapering, flattened or deep,
 * with tails, dorsal, anal and pectoral fins, eyes and their species'
 * markings (painted in the shader from the body coordinates).
 *
 * All geometry is non-indexed with a vertex colour and an `aMask`
 * scalar (sway weight for corals, tail weight for the swimming wiggle).
 */

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Non-indexed copy with a flat vertex colour and a scalar attribute (sway / tail mask). */
export function paint(g, color, mask = 0, name = 'aMask') {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new Float32Array(n);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) m[i] = typeof mask === 'function' ? mask(p.getX(i), p.getY(i), p.getZ(i)) : mask;
  g.setAttribute(name, new THREE.BufferAttribute(m, 1));
  return g;
}

/** A thin cylinder from a to b. */
function limb(a, b, r0, r1, seg = 5, cap = false) {
  const len = a.distanceTo(b);
  const c = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !cap);
  c.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, _v.copy(b).sub(a).normalize());
  c.applyQuaternion(_q);
  c.translate(a.x, a.y, a.z);
  return c;
}

/** A low-poly ball that still shades round: normals point straight out from its centre. */
function roundBlob(r) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return g;
}

/** Height of each coral model at scale 1 (metres), measured from the models when they are built. */
export const CORAL_HEIGHT = {};

/** Which material each kind uses: rigid (bumped coral surfaces), sway (soft, in the current), lace (sea fans). */
export const CORAL_MAT = { fan: 'lace', kelp: 'sway', anemone: 'sway', soft: 'sway', leather: 'sway', whip: 'sway', grass: 'sway', crinoid: 'sway', eel: 'sway', octopus: 'sway', gardeneels: 'sway', seahorse: 'sway' };

/**
 * Colours per kind (instance tints over the shader's surface). Living reef
 * builders are mostly tan, brown, olive and cream from their algae, with
 * the odd blue or purple Acropora; the colour comes from soft corals, sea
 * fans, sponges, anemones, clams, feather stars and the fish.
 */
export const CORAL_COLORS = {
  branch: [0xc8a878, 0xb89868, 0xa89060, 0xd8c8a0, 0x9aa070, 0xc0b088, 0xa888b8, 0x8aa8c8],
  elkhorn: [0xc89860, 0xb88850, 0xd0a870, 0xc0a068],
  brain: [0xb8a060, 0x9a9a68, 0xa88860, 0x8a9a70, 0xc8b080, 0x7a8a6a, 0xb0a888],
  boulder: [0xc8b078, 0xb89868, 0xa8a070, 0x9a8aa0, 0xd0c090, 0xb8b088],
  table: [0xb8a070, 0xa89868, 0x9aa878, 0xc8b890, 0x8898a8, 0xb0a078],
  plate: [0x9a9868, 0xa89070, 0x8a8a78, 0xb8a888, 0x6a8a70, 0xa09a80],
  pillar: [0xd8c8a0, 0xc8b890, 0xb8a888, 0xd0c098],
  mushroom: [0xd8c8a8, 0xb8a888, 0xc0b0d0, 0xa8b890],
  fan: [0x8a3a8a, 0xb03040, 0xd07030, 0xd0b040, 0x6a3070, 0xc85060],
  soft: [0xe86a9a, 0xc050a0, 0xe04040, 0xf08a40, 0xe8d8e8, 0xa060d0, 0xf0b0c8],
  leather: [0xd8c8a0, 0xc8b888, 0xa8a878, 0xb8c0a0, 0xd0c8b0],
  tubes: [0x8a4a9a, 0xd8b040, 0x6a7a9a, 0xd07040, 0xa04a6a, 0x9a8ac0],
  barrel: [0x9a5040, 0x8a4a3a, 0xa86048, 0x7a4050, 0x8a6a58],
  vase: [0x70a0d0, 0xd090b0, 0xa888c8, 0x90b8d8],
  anemone: [0xd8b8a0, 0xa8d070, 0xe8a0b0, 0xd0d0a0, 0xb070d0, 0xe0c080],
  clam: [0x3ab0c0, 0x2a70d0, 0x6a4ad0, 0x40c080, 0x1a90d0, 0x8a6a40],
  crinoid: [0xe0b030, 0xd06020, 0x902020, 0x303030, 0xe8e8e0, 0x3a9a50],
  cucumber: [0x2a2420, 0x6a5040, 0xa08860, 0x3a3020, 0xc0a070],
  urchin: [0x151518, 0x2a1a2a, 0x201010],
  star: [0x3a6ad8, 0xd84a2a, 0xe0a030, 0x8a3a8a, 0x4a7ae0],
  whip: [0xe0a030, 0xd05030, 0xd8d0c0, 0x9a3a9a, 0xe07a30],
  rock: [0xa09488, 0x988c84, 0xa8a090, 0x948a8a, 0xa89c8c],
  eel: [0x5a6a2a, 0x6a5a3a, 0x8a8a4a, 0x3a3a2a],
  octopus: [0xb86a4a, 0xa0503a, 0x8a6a5a, 0xc88a6a],
  crab: [0xc0401a, 0xd06a2a, 0x8a4a3a, 0xe0b080],
  lobster: [0x8a4a3a, 0xa05a3a, 0x6a4a5a],
  seahorse: [0xe0b040, 0xd07030, 0x9a8a60],
  gardeneels: [0xd8d0b8, 0xc8c0a0, 0xe0d8c0],
};

// Build every model (both levels of detail) from the dedicated module.
export { buildCorals as coralGeometries } from './Corals.js';

/**
 * Which kinds grow where, with weights: the shallow reef (thickets, tables,
 * brain and boulder corals), bare sand in the shallows (mushroom corals,
 * sea stars, cucumbers, a few heads), sea grass meadows, and the deep
 * slopes beyond (sea fans, whips, barrel and vase sponges, soft corals).
 */
export const ZONES = {
  reef: { branch: 3, elkhorn: 1.1, table: 1.6, brain: 1.4, boulder: 1.6, plate: 0.8, pillar: 0.4, soft: 0.8, leather: 0.9, anemone: 0.8, clam: 0.4, tubes: 0.5, fan: 0.4, rock: 1.2, urchin: 0.5, crinoid: 0.3, mushroom: 0.3, vase: 0.2, star: 0.25 },
  sand: { mushroom: 0.6, star: 0.6, cucumber: 0.8, urchin: 0.4, rock: 0.7, brain: 0.6, boulder: 0.6, anemone: 0.4, grass: 0.5, clam: 0.2, tubes: 0.25, leather: 0.3, gardeneels: 0.5, crab: 0.3 },
  meadow: { grass: 10, star: 0.3, cucumber: 0.35, urchin: 0.2, seahorse: 0.25, crab: 0.1 },
  deep: { fan: 2.4, whip: 2, barrel: 1.6, soft: 1.6, plate: 1.2, tubes: 1, vase: 0.8, crinoid: 0.8, rock: 1, boulder: 0.6, leather: 0.4, table: 0.2, star: 0.15 },
};

/** Scale range per kind. */
export const CORAL_SCALE = {
  branch: [0.8, 2.2],
  elkhorn: [0.8, 1.8],
  brain: [0.6, 2.5],
  boulder: [0.8, 3.4],
  table: [0.8, 2.4],
  plate: [0.7, 1.8],
  pillar: [0.6, 1.3],
  mushroom: [0.7, 1.3],
  fan: [0.8, 2],
  soft: [0.7, 1.8],
  leather: [0.7, 1.6],
  tubes: [0.8, 1.6],
  barrel: [0.6, 1.8],
  vase: [0.8, 1.5],
  anemone: [0.8, 1.6],
  clam: [0.7, 1.5],
  crinoid: [0.8, 1.5],
  cucumber: [0.8, 1.4],
  urchin: [0.8, 1.3],
  star: [0.8, 1.3],
  whip: [0.8, 1.5],
  grass: [1.1, 2.2],
  kelp: [0.8, 2],
  rock: [0.8, 2.6],
  eel: [0.9, 1.5],
  octopus: [0.8, 1.6],
  crab: [0.9, 1.5],
  lobster: [0.9, 1.3],
  seahorse: [0.9, 1.3],
  gardeneels: [1, 1.6],
};

export function pickWeighted(rng, table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let r = rng.random() * sum;
  for (const k in table) {
    r -= table[k];
    if (r <= 0) return k;
  }
  return Object.keys(table)[0];
}

// ------------------------------------------------------------------ fish

/**
 * Species: body shape, size, schooling, where they live and how they are
 * marked. `pattern` selects the markings in the fish shader:
 *   0 silver schooling fish   1 clownfish bands   2 blue tang, yellow tail
 *   3 butterflyfish eye bar   4 angelfish stripes 5 parrotfish scales
 *   6 grouper spots           7 moorish idol      8 shark / ray / plain
 *   9 turtle shell plates   10 spotted eagle ray
 */
export const SPECIES = [
  { name: 'sardine', shape: 'slim', size: 0.2, count: [50, 110], color: 0xc8d8e8, pattern: 0, speed: 3.4, radius: 5, depth: [-18, -3] },
  { name: 'jack', shape: 'slim', size: 0.55, count: [12, 26], color: 0xa8c0d0, pattern: 0, speed: 3.2, radius: 6, depth: [-26, -4] },
  { name: 'tuna', shape: 'tuna', size: 1.1, count: [8, 16], color: 0x44607a, pattern: 0, speed: 5, radius: 8, depth: [-30, -6] },
  { name: 'tang', shape: 'deep', size: 0.28, count: [10, 24], color: 0x2f6bff, pattern: 2, speed: 2, radius: 3.5, depth: [-12, -1.5], reef: true },
  { name: 'yellowtang', shape: 'deep', size: 0.24, count: [8, 20], color: 0xffd23a, pattern: 8, speed: 2, radius: 3, depth: [-10, -1.5], reef: true },
  { name: 'butterfly', shape: 'deep', size: 0.2, count: [4, 10], color: 0xffe066, pattern: 3, speed: 1.4, radius: 2, depth: [-12, -1.5], reef: true },
  { name: 'angel', shape: 'angel', size: 0.32, count: [2, 6], color: 0x3a70ff, pattern: 4, speed: 1.1, radius: 2.5, depth: [-16, -2], reef: true },
  { name: 'idol', shape: 'angel', size: 0.24, count: [3, 7], color: 0xfff2c0, pattern: 7, speed: 1.3, radius: 2.2, depth: [-14, -2], reef: true },
  { name: 'clown', shape: 'oval', size: 0.13, count: [4, 9], color: 0xff7a1a, pattern: 1, speed: 1.1, radius: 1.3, depth: [-9, -1.5], reef: true },
  { name: 'parrot', shape: 'oval', size: 0.5, count: [4, 9], color: 0x3de0a0, pattern: 5, speed: 1.6, radius: 4, depth: [-15, -2], reef: true },
  { name: 'grouper', shape: 'heavy', size: 0.9, count: [1, 3], color: 0x8a6a4a, pattern: 6, speed: 1.1, radius: 5, depth: [-24, -4] },
  { name: 'shark', shape: 'shark', size: 2.1, count: [1, 2], color: 0x8a96a0, pattern: 8, speed: 2.6, radius: 14, depth: [-40, -6] },
  { name: 'ray', shape: 'ray', size: 1.5, count: [1, 3], color: 0x3a3a44, pattern: 10, speed: 1.4, radius: 10, depth: [-30, -3], floor: true },
  { name: 'turtle', shape: 'turtle', size: 1.0, count: [1, 2], color: 0x6a7a4a, pattern: 9, speed: 1.2, radius: 9, depth: [-20, -2], reef: true },
];

/**
 * Body sections (z from nose +0.5 to tail root −0.36): [z, half-height, half-width].
 * The rest of each shape: tail, fins.
 */
const BODIES = {
  slim: { sec: [[0.5, 0.0, 0.0], [0.44, 0.07, 0.05], [0.3, 0.12, 0.08], [0.1, 0.14, 0.085], [-0.12, 0.11, 0.07], [-0.3, 0.05, 0.035], [-0.38, 0.03, 0.02]], tail: 'fork', tailH: 0.2, dorsal: [0.12, -0.06, 0.1], anal: [-0.1, -0.22, 0.05], pect: 0.07 },
  tuna: { sec: [[0.5, 0.0, 0.0], [0.42, 0.09, 0.07], [0.25, 0.17, 0.13], [0.0, 0.19, 0.14], [-0.2, 0.13, 0.09], [-0.34, 0.04, 0.03], [-0.4, 0.025, 0.02]], tail: 'lunate', tailH: 0.3, dorsal: [0.1, -0.08, 0.14], anal: [-0.12, -0.24, 0.08], pect: 0.12, finlets: true },
  deep: { sec: [[0.5, 0.0, 0.0], [0.42, 0.14, 0.04], [0.28, 0.3, 0.06], [0.05, 0.36, 0.065], [-0.18, 0.28, 0.05], [-0.32, 0.1, 0.03], [-0.38, 0.06, 0.02]], tail: 'square', tailH: 0.24, dorsal: [0.28, -0.3, 0.1], anal: [0.05, -0.3, 0.09], pect: 0.08, spine: true },
  angel: { sec: [[0.5, 0.0, 0.0], [0.42, 0.13, 0.04], [0.28, 0.3, 0.055], [0.05, 0.38, 0.06], [-0.16, 0.3, 0.05], [-0.3, 0.1, 0.03], [-0.36, 0.06, 0.02]], tail: 'square', tailH: 0.26, dorsal: [0.2, -0.36, 0.26], anal: [0.12, -0.34, 0.24], pect: 0.08, trail: true },
  oval: { sec: [[0.5, 0.0, 0.0], [0.42, 0.1, 0.07], [0.26, 0.19, 0.11], [0.02, 0.21, 0.12], [-0.2, 0.15, 0.09], [-0.32, 0.07, 0.04], [-0.38, 0.05, 0.03]], tail: 'round', tailH: 0.2, dorsal: [0.24, -0.26, 0.08], anal: [-0.02, -0.26, 0.06], pect: 0.09 },
  heavy: { sec: [[0.5, 0.0, 0.0], [0.45, 0.1, 0.1], [0.3, 0.2, 0.16], [0.05, 0.22, 0.17], [-0.18, 0.17, 0.12], [-0.32, 0.08, 0.05], [-0.38, 0.06, 0.04]], tail: 'round', tailH: 0.2, dorsal: [0.22, -0.26, 0.1], anal: [-0.06, -0.26, 0.07], pect: 0.12 },
  shark: { sec: [[0.5, 0.0, 0.0], [0.44, 0.05, 0.05], [0.3, 0.1, 0.095], [0.1, 0.12, 0.11], [-0.12, 0.09, 0.08], [-0.3, 0.04, 0.035], [-0.4, 0.025, 0.02]], tail: 'shark', tailH: 0.3, dorsal: [0.12, 0.0, 0.18], anal: [-0.2, -0.28, 0.05], pect: 0.2, shark: true },
};

/** A lofted fish body with eyes' socket shading left to the shader. Returns [geometry parts]. */
function fishBody(B) {
  const sec = B.sec;
  const around = 8;
  const pos = [];
  const idx = [];
  for (let i = 0; i < sec.length; i++) {
    const [z, h, w] = sec[i];
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      // Slightly flat-bellied, rounder back.
      const y = Math.cos(a) * h * (Math.cos(a) < 0 ? 0.92 : 1);
      pos.push(Math.sin(a) * w, y, z);
    }
  }
  for (let i = 0; i < sec.length - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * around + k;
      const b = i * around + ((k + 1) % around);
      const c = a + around;
      const d = b + around;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat fin from a list of [z, y] points (a fan around the first point), in the x=0 plane. */
function fin(points, x = 0) {
  const pos = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [z0, y0] = points[0];
    const [z1, y1] = points[i];
    const [z2, y2] = points[i + 1];
    pos.push(x, y0, z0, x, y1, z1, x, y2, z2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Fish, shark, ray or turtle geometry, 1 unit long, nose towards +Z. aMask = swim weight. */
export function fishGeometry(shape) {
  const white = 0xffffff;
  const finCol = 0xf0f0f0;
  const tailMask = (x, y, z) => Math.max(0, Math.min(1, (0.15 - z) / 0.75)) ** 1.3;
  if (shape === 'ray') return rayGeometry();
  if (shape === 'turtle') return turtleGeometry();
  const B = BODIES[shape];
  const parts = [paint(fishBody(B), white, tailMask)];
  const tz = B.sec[B.sec.length - 1][0];
  const H = B.tailH;
  // Tail fin.
  const tail = {
    fork: [[tz, 0], [tz - 0.2, H], [tz - 0.12, 0.02], [tz - 0.12, -0.02], [tz - 0.2, -H]],
    lunate: [[tz, 0], [tz - 0.14, H * 1.1], [tz - 0.08, 0.03], [tz - 0.08, -0.03], [tz - 0.14, -H * 1.1]],
    square: [[tz, 0], [tz - 0.16, H * 0.95], [tz - 0.13, 0], [tz - 0.16, -H * 0.95]],
    round: [[tz, 0], [tz - 0.1, H], [tz - 0.17, H * 0.5], [tz - 0.18, 0], [tz - 0.17, -H * 0.5], [tz - 0.1, -H]],
    shark: [[tz, 0], [tz - 0.26, H * 1.2], [tz - 0.14, 0.03], [tz - 0.13, -0.02], [tz - 0.16, -H * 0.55]],
  }[B.tail];
  parts.push(paint(fin(tail), finCol, tailMask));
  // Dorsal fin: [start z, end z (relative), height].
  const [d0, d1, dh] = B.dorsal;
  const top = (z) => {
    // Body half-height at z (linear between sections).
    for (let i = 0; i < B.sec.length - 1; i++) {
      const [za, ha] = B.sec[i];
      const [zb, hb] = B.sec[i + 1];
      if (z <= za && z >= zb) return ha + ((hb - ha) * (za - z)) / (za - zb);
    }
    return 0.03;
  };
  if (B.shark) {
    parts.push(paint(fin([[0.18, top(0.18) - 0.01], [0.0, top(0.0) + 0.2], [-0.04, top(-0.04) + 0.18], [-0.02, top(-0.02) - 0.01]]), white, tailMask));
    parts.push(paint(fin([[-0.26, top(-0.26) - 0.005], [-0.32, top(-0.32) + 0.06], [-0.33, top(-0.33)]]), white, tailMask));
  } else {
    const dz = [];
    const steps = 5;
    for (let k = 0; k <= steps; k++) {
      const z = d0 + ((d1 - d0) * k) / steps;
      const hgt = dh * Math.sin((Math.PI * (k + 0.3)) / (steps + 0.6)) * (B.trail && k === steps - 1 ? 2.2 : 1) * (B.spine && k === 1 ? 1.4 : 1);
      dz.push([z, top(z) + hgt]);
    }
    const pts = [[d0, top(d0) - 0.01], ...dz, [d1, top(d1) - 0.01]];
    parts.push(paint(fin(pts), finCol, tailMask));
  }
  // Anal fin (under the rear body).
  const [a0, a1, ah] = B.anal;
  const bot = (z) => -top(z) * 0.92;
  const az = [];
  for (let k = 0; k <= 4; k++) {
    const z = a0 + ((a1 - a0) * k) / 4;
    az.push([z, bot(z) - ah * Math.sin((Math.PI * (k + 0.3)) / 4.6) * (B.trail && k === 3 ? 2 : 1)]);
  }
  parts.push(paint(fin([[a0, bot(a0) + 0.01], ...az, [a1, bot(a1) + 0.01]]), finCol, tailMask));
  // Pectoral fins, swept back from behind the gills.
  const p = B.pect;
  const gz = B.sec[2][0] - 0.02;
  const gw = B.sec[2][2];
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([s * gw * 0.9, -0.02, gz, s * (gw + p * 0.7), -0.06 - p * (B.shark ? 0.6 : 0.2), gz - p * 1.2, s * gw * 0.9, -0.05, gz - p * 0.6, s * gw * 0.9, -0.05, gz - p * 0.6, s * (gw + p * 0.7), -0.06 - p * (B.shark ? 0.6 : 0.2), gz - p * 1.2, s * gw * 0.9, -0.02, gz], 3));
    g.computeVertexNormals();
    parts.push(paint(g, finCol, 0));
  }
  if (B.finlets) {
    for (let k = 0; k < 4; k++) {
      const z = -0.18 - k * 0.045;
      parts.push(paint(fin([[z, top(z) - 0.005], [z - 0.03, top(z) + 0.035], [z - 0.035, top(z) - 0.005]]), 0xffd23a, tailMask));
    }
  }
  return mergeGeometries(parts);
}

/** Stingray / eagle ray: a flat diamond whose wing tips flap (aMask = |x|). */
function rayGeometry() {
  const pos = [];
  const rim = [];
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.sin(a);
    const z = Math.cos(a);
    // Pointed wing tips, rounded snout, tapering rear.
    const r = 0.5 * (0.55 + 0.45 * Math.abs(x) ** 0.6) * (z < 0 ? 1 - Math.abs(z) * 0.35 : 1);
    rim.push([x * r * 1.5, z * r * 0.8 + 0.08]);
  }
  for (const s of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const [x0, z0] = rim[k];
      const [x1, z1] = rim[(k + 1) % n];
      const y = 0.06 * s;
      if (s > 0) pos.push(0, y, 0.05, x1, 0, z1, x0, 0, z0);
      else pos.push(0, y, 0.05, x0, 0, z0, x1, 0, z1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.computeVertexNormals();
  const tail = limb(new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(0, 0, -1.1), 0.02, 0.004, 3);
  const wing = (x) => Math.min(1, Math.abs(x) / 0.7) ** 1.5;
  return mergeGeometries([paint(body, 0xffffff, (x) => wing(x)), paint(tail, 0x8a8a8a, 0)]);
}

/** Sea turtle: domed shell, head, four flippers (front ones flap: aMask). */
function turtleGeometry() {
  const shell = new THREE.SphereGeometry(0.4, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.85, 0.42, 1.05);
  const plastron = new THREE.CircleGeometry(0.4, 14).rotateX(Math.PI / 2).scale(0.85, 1, 1.05);
  const head = new THREE.SphereGeometry(0.1, 8, 6).scale(0.9, 0.8, 1.3).translate(0, 0.02, 0.5);
  const flipper = (s, front) => {
    const g = new THREE.BufferGeometry();
    const z = front ? 0.22 : -0.28;
    const len = front ? 0.5 : 0.22;
    const pts = [s * 0.3, 0, z + 0.06, s * (0.3 + len), -0.02, z - len * 0.35, s * 0.3, 0, z - 0.08];
    g.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? pts : [pts[0], pts[1], pts[2], pts[6], pts[7], pts[8], pts[3], pts[4], pts[5]], 3));
    g.computeVertexNormals();
    return paint(g, 0x8a9a7a, (x) => (front ? Math.min(1, (Math.abs(x) - 0.28) * 2.5) : 0));
  };
  return mergeGeometries([
    paint(shell, 0xffffff, 0),
    paint(plastron, 0xe0d8b0, 0),
    paint(head, 0x9aa88a, 0),
    flipper(1, true),
    flipper(-1, true),
    flipper(1, false),
    flipper(-1, false),
  ]);
}

/** The fish markings, eye and countershading (GLSL, needs vFishPos, vPattern, diffuseColor). */
export const FISH_PATTERN_GLSL = `
  vec3 fp = vFishPos;
  float pat = vPattern;
  vec3 base = diffuseColor.rgb;
  float back = smoothstep(-0.05, 0.2, fp.y);
  // Countershading: dark back, pale belly.
  diffuseColor.rgb *= mix(1.3, 0.62, back);
  if (pat < 0.5) {
    // Silver: blue-grey back, mirror flanks, a thin lateral line.
    diffuseColor.rgb = mix(vec3(0.9, 0.93, 0.96), base * 0.55, back);
    diffuseColor.rgb *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.012, abs(fp.y - 0.02)));
  } else if (pat < 1.5) {
    // Clownfish: three white bands edged in black.
    float z = fp.z;
    float b1 = abs(z - 0.26); float b2 = abs(z - 0.0); float b3 = abs(z + 0.3);
    float d = min(b1, min(b2 * 0.8, b3 * 1.4));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), smoothstep(0.075, 0.06, d));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(0.06, 0.045, d));
  } else if (pat < 2.5) {
    // Blue tang: black palette mark, yellow tail.
    float mark = smoothstep(0.1, 0.06, abs(fp.y - 0.12 + (fp.z - 0.05) * 0.4)) * step(-0.25, fp.z) * step(fp.z, 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.03, 0.08), mark);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.1), smoothstep(-0.34, -0.4, fp.z));
  } else if (pat < 3.5) {
    // Butterflyfish: black bar through the eye, dark rear spot.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), smoothstep(0.035, 0.02, abs(fp.z - 0.36 - fp.y * 0.2)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), smoothstep(0.07, 0.05, length(fp.yz - vec2(0.2, -0.2))));
  } else if (pat < 4.5) {
    // Angelfish: bold curved stripes, yellow edges on the fins.
    float s = sin((fp.z + fp.y * fp.y * 1.2) * 38.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.85, 0.2), smoothstep(0.55, 0.8, s));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.15), smoothstep(0.34, 0.4, abs(fp.y)));
  } else if (pat < 5.5) {
    // Parrotfish: a mosaic of scales with pink edges.
    vec2 c = fract(vec2(fp.z * 22.0, fp.y * 22.0 + floor(fp.z * 22.0) * 0.5)) - 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.45, 0.65), smoothstep(0.32, 0.46, max(abs(c.x), abs(c.y))) * 0.8);
  } else if (pat < 6.5) {
    // Grouper: pale spots over mottled brown.
    vec2 c = fract(fp.zy * vec2(16.0, 18.0)) - 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, base * 1.7, smoothstep(0.2, 0.12, length(c)));
    diffuseColor.rgb *= 0.85 + 0.25 * sin(fp.z * 9.0 + fp.y * 7.0);
  } else if (pat < 7.5) {
    // Moorish idol: two wide black bands, a yellow saddle.
    float z = fp.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), smoothstep(0.08, 0.06, abs(z - 0.2)) + smoothstep(0.07, 0.05, abs(z + 0.2)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.85, 0.1), smoothstep(0.05, 0.02, abs(z + 0.02)) * step(0.0, fp.y));
  } else if (pat > 8.5 && pat < 9.5) {
    // Turtle: shell plates.
    vec2 c = fract(fp.xz * 5.0) - 0.5;
    diffuseColor.rgb *= 0.75 + 0.35 * smoothstep(0.5, 0.3, max(abs(c.x), abs(c.y)));
  } else if (pat > 9.5) {
    // Eagle ray: white spots on a dark back.
    vec2 c = fract(fp.xz * vec2(9.0, 11.0)) - 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), smoothstep(0.16, 0.1, length(c)) * back);
  }
  // The eye: a dark pupil in a pale ring, just behind the snout.
  if (pat < 7.5) {
    vec2 e = vec2(fp.z - 0.39, fp.y - 0.035);
    float r = length(e);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.88, 0.6), smoothstep(0.034, 0.028, r) * step(0.02, abs(fp.x)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01), smoothstep(0.02, 0.015, r) * step(0.02, abs(fp.x)));
  }
`;
