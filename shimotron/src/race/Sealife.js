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

/** Height of each coral model at scale 1 (metres): corals are scaled so none breaks the surface. */
export const CORAL_HEIGHT = {
  branch: 0.95,
  brain: 0.4,
  table: 0.56,
  fan: 1.45,
  tubes: 0.95,
  kelp: 4.3,
  barrel: 1.25,
  anemone: 0.42,
  pillar: 1.7,
  plate: 0.75,
  soft: 1.05,
  whip: 2.1,
  grass: 0.6,
  urchin: 0.32,
  star: 0.08,
  clam: 0.34,
  rock: 1.1,
};

/** Which material each kind uses: rigid (polyp shading), sway (fronds), lace (sea fans). */
export const CORAL_MAT = { fan: 'lace', kelp: 'sway', anemone: 'sway', soft: 'sway', whip: 'sway', grass: 'sway' };

/** Colour palettes per kind (instance colours, multiplied with the vertex colours). */
export const CORAL_COLORS = {
  branch: [0xff6f91, 0xff9a3c, 0xffd23a, 0xb266ff, 0x3de0c8, 0xc9a27a, 0x9fbf6a, 0xf5f0e0, 0x7ad0ff],
  brain: [0x9fbf6a, 0xc9a27a, 0xffd23a, 0x3de0c8, 0xe8a0ff, 0xff9a3c],
  table: [0xc9a27a, 0x9fbf6a, 0xffd23a, 0xff8fb0, 0x7ad0ff, 0xb28a5a],
  fan: [0xb266ff, 0xff4a5a, 0xff9a3c, 0xffd23a, 0xe8a0ff, 0xff6f91],
  tubes: [0xb266ff, 0xff9a3c, 0xffd23a, 0x3de0c8, 0xff4a5a],
  barrel: [0xa0522d, 0xd07040, 0x8a4a8a, 0xc98a5a, 0xb03a3a],
  anemone: [0xff8fb0, 0xb266ff, 0x9fe07a, 0xffd0a0, 0x3de0c8, 0xff6a5a],
  pillar: [0xc9a27a, 0xd8c8a0, 0x9fbf6a, 0xb8a080],
  plate: [0x9fbf6a, 0xc9a27a, 0xb266ff, 0x7ad0ff, 0xffd23a, 0x8a6bbf],
  soft: [0xff6f91, 0xffa3c4, 0xe8a0ff, 0xff9a3c, 0xf5f0e0, 0xffd23a, 0xff4a5a],
  whip: [0xffd23a, 0xff5a3a, 0xd9d0c0, 0x9a3aaa, 0xff8a2a],
  urchin: [0x2a1a3a, 0x3a1020, 0x151515, 0x4a2a5a],
  star: [0xff6a1a, 0xe0262b, 0x2f6bff, 0xffd23a, 0xff8fb0],
  clam: [0x3de0c8, 0x2f6bff, 0x8a4dff, 0x3de07a, 0x19b0ff],
  rock: [0xffffff, 0xf2e8e0, 0xe8f0e8, 0xf0e4f4],
};

/** Build every coral / sponge / anemone model. `rng` gives each island its own growth. */
export function coralGeometries(rng, noise) {
  const white = 0xffffff;
  // Branching (staghorn): forks of thin tapering cylinders.
  const branch = [];
  const grow = (x, y, z, dir, len, r, depth) => {
    const a = new THREE.Vector3(x, y, z);
    const b = a.clone().addScaledVector(dir, len);
    branch.push(paint(limb(a, b, r, r * 0.6, 5, depth === 0), white, 0));
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const d = dir.clone().add(new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.1, 0.5), rng.range(-0.7, 0.7))).normalize();
        grow(b.x, b.y, b.z, d, len * 0.72, r * 0.7, depth - 1);
      }
    }
  };
  for (let k = 0; k < 6; k++) grow(0, 0, 0, new THREE.Vector3(Math.cos(k * 1.1) * 0.6, 1, Math.sin(k * 1.1) * 0.6).normalize(), 0.5, 0.08, 1);
  // Brain coral: a squashed dome with meandering grooves.
  let brain = new THREE.IcosahedronGeometry(0.6, 3);
  brain.deleteAttribute('uv');
  brain.deleteAttribute('normal');
  brain = mergeVertices(brain);
  const bp = brain.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    _v.fromBufferAttribute(bp, i);
    const groove = 1 + Math.sin(_v.x * 14 + Math.sin(_v.z * 9) * 2) * 0.04;
    _v.multiplyScalar(groove);
    _v.y = Math.max(_v.y, -0.1) * 0.62;
    bp.setXYZ(i, _v.x, _v.y, _v.z);
  }
  brain.computeVertexNormals();
  // Table coral: stem and a wide plate.
  const table = mergeGeometries([paint(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 6).translate(0, 0.25, 0), white), paint(new THREE.CylinderGeometry(0.9, 0.75, 0.07, 14).translate(0, 0.52, 0), white)]);
  // Sea fan: a vertical disc cut into lace by its shader.
  const fan = paint(new THREE.CircleGeometry(0.7, 12).translate(0, 0.75, 0), white, (x, y) => y / 1.4);
  // Tube sponges.
  const tubes = mergeGeometries(
    [0, 1, 2, 3].map((k) => {
      const h = 0.4 + k * 0.18;
      return paint(new THREE.CylinderGeometry(0.1 + (k % 2) * 0.03, 0.12, h, 7, 1, true).translate(Math.cos(k * 1.7) * 0.16, h / 2, Math.sin(k * 1.7) * 0.16), white);
    }),
  );
  // Kelp: tall stipes hung with leaf blades and gas bladders, waving from the tips.
  const kelp = [];
  for (let k = 0; k < 5; k++) {
    const h = 3.2 + (k % 3) * 0.5;
    const bx = Math.cos(k * 2.4) * 0.25;
    const bz = Math.sin(k * 2.4) * 0.25;
    const sway = (x, y) => (y / 4.3) ** 1.4;
    kelp.push(paint(limb(new THREE.Vector3(bx, 0, bz), new THREE.Vector3(bx, h, bz), 0.018, 0.01, 3), white, sway));
    const leaves = [];
    for (let j = 0; j < 9; j++) {
      const y = 0.4 + (j / 9) * (h - 0.4);
      const a = j * 2.2 + k;
      const len = 0.42 + Math.sin(j * 1.7 + k) * 0.1;
      const w = 0.07;
      // A long diamond leaf, angled up and out from the stipe.
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const b0 = [bx, y, bz];
      const tip = [bx + dx * len * 0.8, y + len * 0.6, bz + dz * len * 0.8];
      const mid = [bx + dx * len * 0.4, y + len * 0.3, bz + dz * len * 0.4];
      const px = -dz * w;
      const pz = dx * w;
      leaves.push(...b0, mid[0] + px, mid[1], mid[2] + pz, ...tip, ...b0, ...tip, mid[0] - px, mid[1], mid[2] - pz);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3));
    lg.computeVertexNormals();
    kelp.push(paint(lg, white, sway));
    const bulbs = roundBlob(0.035);
    kelp.push(paint(bulbs.translate(bx, h, bz), 0xd8c070, sway));
  }
  // Barrel sponge: a ridged vase, open at the top.
  const barrelProf = [
    [0.22, 0],
    [0.42, 0.25],
    [0.56, 0.7],
    [0.6, 1.15],
    [0.56, 1.25],
    [0.46, 1.2],
    [0.36, 0.55],
    [0.1, 0.45],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const barrelG = new THREE.LatheGeometry(barrelProf, 16);
  const brp = barrelG.attributes.position;
  for (let i = 0; i < brp.count; i++) {
    const x = brp.getX(i);
    const z = brp.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 9) * 0.06;
    brp.setX(i, x * k);
    brp.setZ(i, z * k);
  }
  barrelG.computeVertexNormals();
  const barrel = paint(barrelG, white);
  // Anemone: a column and a crown of tentacles that wave.
  const anemone = [paint(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 10).translate(0, 0.08, 0), 0xd8c8c0, 0)];
  for (let k = 0; k < 22; k++) {
    const a = k * 2.399;
    const r = 0.05 + (k / 22) * 0.16;
    const base = new THREE.Vector3(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * (0.12 + r), 0.24 - r * 0.4, Math.sin(a) * (0.12 + r)));
    anemone.push(paint(limb(base, tip, 0.03, 0.012, 3), white, (x, y) => Math.max(0, (y - 0.14) * 3.5)));
  }
  // Pillar coral: a cluster of upright fingers.
  const pillar = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.2;
    const r = k === 0 ? 0 : 0.18 + (k % 3) * 0.08;
    const h = 0.7 + ((k * 37) % 9) * 0.11;
    pillar.push(paint(new THREE.CapsuleGeometry(0.1 + (k % 2) * 0.03, h, 1, 6).translate(Math.cos(a) * r, h / 2 + 0.08, Math.sin(a) * r), white));
  }
  // Plate (lettuce) coral: stacked wavy whorls.
  const plate = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.CircleGeometry(0.55 - k * 0.08, 18);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const d = Math.hypot(x, z);
      p.setY(i, Math.sin(Math.atan2(z, x) * 5 + k) * 0.07 * d * 2 + d * 0.35);
    }
    g.computeVertexNormals();
    g.rotateZ(rng.range(-0.25, 0.25));
    g.translate(rng.range(-0.15, 0.15), 0.1 + k * 0.16, rng.range(-0.15, 0.15));
    plate.push(paint(g, white));
  }
  plate.push(paint(new THREE.CylinderGeometry(0.08, 0.14, 0.6, 6).translate(0, 0.3, 0), 0xc0b0a0));
  // Soft coral: a trunk that splits into branches tipped with puffs of polyps; sways gently.
  const soft = [];
  const trunkTop = new THREE.Vector3(0, 0.45, 0);
  soft.push(paint(limb(new THREE.Vector3(0, 0, 0), trunkTop, 0.1, 0.07, 6), 0xf0e8e0, 0));
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + rng.range(-0.2, 0.2);
    const tip = new THREE.Vector3(Math.cos(a) * 0.38, 0.75 + rng.range(-0.1, 0.2), Math.sin(a) * 0.38);
    soft.push(paint(limb(trunkTop, tip, 0.05, 0.03, 4), 0xf0e8e0, (x, y) => Math.max(0, (y - 0.4) * 1.4)));
    for (let j = 0; j < 2; j++) {
      const puff = roundBlob(0.14 + rng.range(0, 0.06));
      puff.translate(tip.x + rng.range(-0.08, 0.08), tip.y + rng.range(-0.05, 0.12), tip.z + rng.range(-0.08, 0.08));
      soft.push(paint(puff, white, (x, y) => Math.max(0, (y - 0.4) * 1.4)));
    }
  }
  // Sea whips: long thin rods that bend with the current.
  const whip = [];
  for (let k = 0; k < 8; k++) {
    const a = k * 0.8;
    const h = 1.2 + ((k * 13) % 7) * 0.14;
    let prev = new THREE.Vector3(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06);
    for (let s = 1; s <= 4; s++) {
      const f = s / 4;
      const next = new THREE.Vector3(Math.cos(a) * (0.06 + f * f * 0.5), h * f, Math.sin(a) * (0.06 + f * f * 0.5));
      whip.push(paint(limb(prev, next, 0.028 * (1 - f * 0.5 + 0.12), 0.028 * (1 - f * 0.5), 3), white, (x, y) => (y / 2.2) ** 1.3));
      prev = next;
    }
  }
  // Sea grass: a tuft of blades.
  const grass = [];
  for (let k = 0; k < 18; k++) {
    const h = 0.32 + ((k * 7) % 5) * 0.07;
    const g = new THREE.PlaneGeometry(0.04, h, 1, 2);
    g.translate(0, h / 2, 0);
    g.rotateY(k * 1.3);
    g.rotateZ(Math.sin(k * 2.1) * 0.25);
    g.translate(Math.cos(k * 2.4) * 0.22 * ((k % 3) / 2 + 0.3), 0, Math.sin(k * 2.4) * 0.22 * ((k % 3) / 2 + 0.3));
    grass.push(paint(g, white, (x, y) => (y / 0.6) ** 1.2));
  }
  // Sea urchin: a dark ball of spines.
  const urchin = [paint(roundBlob(0.11).scale(1, 0.8, 1).translate(0, 0.08, 0), white)];
  const ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed().attributes.position;
  for (let i = 0; i < ico.count; i += 3) {
    const d = new THREE.Vector3(ico.getX(i) + ico.getX(i + 1) + ico.getX(i + 2), ico.getY(i) + ico.getY(i + 1) + ico.getY(i + 2), ico.getZ(i) + ico.getZ(i + 1) + ico.getZ(i + 2)).normalize();
    if (d.y < -0.3) continue;
    const a = d.clone().multiplyScalar(0.09).add(new THREE.Vector3(0, 0.08, 0));
    urchin.push(paint(limb(a, a.clone().addScaledVector(d, 0.22), 0.016, 0.002, 3), white));
  }
  // Starfish: five arms, flat on the sand.
  const starShape = new THREE.Shape();
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = k % 2 ? 0.08 : 0.24;
    if (k === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = paint(new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }).rotateX(-Math.PI / 2), white);
  // Giant clam: a fluted shell, open, with a bright mantle between the lips.
  const shell = (s) => {
    const g = new THREE.SphereGeometry(0.3, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const k = 1 + Math.sin(Math.atan2(z, x) * 5) * 0.08;
      p.setXYZ(i, x * k * 1.3, p.getY(i) * 0.5, z * k * 0.8);
    }
    g.rotateX((s * Math.PI) / 2 - (s > 0 ? 0.35 : -0.35));
    g.translate(0, 0.14, 0);
    g.computeVertexNormals();
    return paint(g, 0x8a8a84);
  };
  const clam = mergeGeometries([shell(1), shell(-1), paint(new THREE.SphereGeometry(0.3, 12, 4).scale(1.25, 0.25, 0.25).translate(0, 0.3, 0), white)]);
  // Reef rock: a knobbly, flattened boulder, smooth-shaded, mottled with coralline algae and weed.
  let rockG = new THREE.IcosahedronGeometry(1, 2);
  rockG.deleteAttribute('uv');
  rockG.deleteAttribute('normal');
  rockG = mergeVertices(rockG);
  const rp = rockG.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    _v.fromBufferAttribute(rp, i);
    const n = noise ? noise.noise(_v.x * 1.7 + 3, _v.z * 1.7 + _v.y * 1.3) + noise.noise(_v.x * 4.1 - 2, _v.z * 4.1 + _v.y * 3.7) * 0.35 : 0;
    _v.multiplyScalar(1 + n * 0.26);
    _v.y = _v.y * 0.62 + 0.45;
    rp.setXYZ(i, _v.x, _v.y, _v.z);
  }
  rockG.computeVertexNormals();
  const rc = new Float32Array(rp.count * 3);
  const stone = new THREE.Color(0x7d7266);
  const pink = new THREE.Color(0xb27f8c);
  const weed = new THREE.Color(0x6c7a48);
  const sand = new THREE.Color(0xb8a888);
  const c = new THREE.Color();
  for (let i = 0; i < rp.count; i++) {
    _v.fromBufferAttribute(rp, i);
    const m = noise ? noise.noise(_v.x * 2.3 + 11, _v.z * 2.3 - _v.y * 1.9) : 0;
    c.copy(stone).lerp(pink, THREE.MathUtils.smoothstep(m, 0.05, 0.4)).lerp(weed, THREE.MathUtils.smoothstep(-m, 0.15, 0.45));
    c.lerp(sand, THREE.MathUtils.smoothstep(_v.y, 0.85, 1.2) * 0.5);
    c.toArray(rc, i * 3);
  }
  rockG.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  rockG.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(rp.count), 1));
  const rock = rockG.toNonIndexed();
  return {
    branch: mergeGeometries(branch),
    brain: paint(brain, white),
    table,
    fan,
    tubes,
    kelp: mergeGeometries(kelp),
    barrel,
    anemone: mergeGeometries(anemone),
    pillar: mergeGeometries(pillar),
    plate: mergeGeometries(plate),
    soft: mergeGeometries(soft),
    whip: mergeGeometries(whip),
    grass: mergeGeometries(grass),
    urchin: mergeGeometries(urchin),
    star,
    clam,
    rock,
  };
}

/**
 * Which kinds grow where, with weights: the shallow reef, bare sand in the
 * shallows (sea grass and a few heads), and the deep slopes beyond.
 */
export const ZONES = {
  reef: { branch: 3, brain: 2, table: 1.4, fan: 1.2, tubes: 1, barrel: 0.6, anemone: 1.3, pillar: 0.8, plate: 1, soft: 1.1, clam: 0.4, rock: 0.9, urchin: 0.5 },
  sand: { star: 0.6, urchin: 0.5, rock: 0.9, brain: 0.8, anemone: 0.45, soft: 0.5, tubes: 0.35, branch: 0.6, barrel: 0.3, clam: 0.2, table: 0.3 },
  meadow: { grass: 10, star: 0.3, urchin: 0.2 },
  deep: { whip: 2.4, fan: 2, barrel: 1.5, soft: 1.4, rock: 1.1, tubes: 0.8, plate: 0.6, table: 0.3, star: 0.15, anemone: 0.3 },
};

/** Scale range per kind. */
export const CORAL_SCALE = {
  branch: [0.8, 2.4],
  brain: [0.8, 2.8],
  table: [0.9, 2.2],
  fan: [0.8, 2.2],
  tubes: [0.8, 2],
  kelp: [0.8, 2],
  barrel: [0.7, 2],
  anemone: [0.8, 1.8],
  pillar: [0.7, 1.6],
  plate: [0.8, 2.2],
  soft: [0.8, 2],
  whip: [0.8, 1.6],
  grass: [1.1, 2.2],
  urchin: [0.8, 1.4],
  star: [0.8, 1.4],
  clam: [0.8, 1.6],
  rock: [0.8, 2.6],
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
