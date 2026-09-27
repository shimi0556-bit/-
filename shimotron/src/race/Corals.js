import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';

/**
 * The reef's corals, sponges and other growth, modelled on how they really
 * grow: staghorn and elkhorn thickets, table corals (a horizontal plate of
 * fused branchlets on a stalk), brain corals (hemispheres of meandering
 * valleys and grooved ridges), boulder Porites, whorled plate corals,
 * pillars, mushroom corals, gorgonian sea fans, tree and leather soft
 * corals, tube, barrel and vase sponges, anemones, giant clams, feather
 * stars, sea cucumbers, urchins, sea stars, sea grass, kelp and reef rock.
 *
 * Every model is smooth-shaded, non-indexed, with a vertex colour, `aMask`
 * (sway weight, or how near a branch tip it is) and `aTex`, which picks
 * the surface the coral shader paints and bumps in: corallites, meanders,
 * pits, pores, septa... Each kind exists in two levels of detail.
 */

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Surface codes read by the shader (see CORAL_SURFACE_GLSL). */
export const TEX = { acropora: 0, brain: 1, porites: 2, table: 3, foliose: 4, fuzzy: 5, polyps: 6, sponge: 7, rock: 8, septa: 9, plain: 10, mantle: 11 };

/** Sets colour, aMask and aTex on a geometry (smooth normals kept) and returns it non-indexed. */
function finish(g, { color = 0xffffff, tex = TEX.plain, mask = null } = {}) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count;
  if (!g.attributes.color) {
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (!g.attributes.aMask || mask !== null) {
    const m = new Float32Array(n);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) m[i] = typeof mask === 'function' ? mask(p.getX(i), p.getY(i), p.getZ(i)) : mask || 0;
    g.setAttribute('aMask', new THREE.BufferAttribute(m, 1));
  }
  g.setAttribute('aTex', new THREE.BufferAttribute(new Float32Array(n).fill(tex), 1));
  return g;
}

/** Smooth normals across a stock geometry's seams (merge, recompute). */
function smoothed(g) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

/**
 * A tapering tube along a polyline, with a rounded end: radius r0 → r1,
 * `flat` squashes the section, `widen` grows its width toward the end
 * (elkhorn), `mask` = [m0, m1] written to aMask along its length.
 */
function tube(pts, r0, r1, radial, { flat = 1, widen = 0, mask = [0, 1], cap = true, side = null } = {}) {
  const n = pts.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  // Parallel-transported frame.
  let N = side ? side.clone() : Math.abs(T[0].y) < 0.9 ? new THREE.Vector3().crossVectors(T[0], UP).normalize() : new THREE.Vector3(1, 0, 0);
  N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const rings = [];
  const add = (c, t, B, Nn, r, w, m) => {
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      ring.push({ p: c.clone().addScaledVector(Nn, Math.cos(a) * r * w).addScaledVector(B, Math.sin(a) * r * flat), m });
    }
    rings.push(ring);
  };
  let B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i) {
      _q.setFromUnitVectors(T[i - 1], T[i]);
      N.applyQuaternion(_q).normalize();
    }
    B = new THREE.Vector3().crossVectors(T[i], N).normalize();
    const u = i / (n - 1);
    const r = r0 + (r1 - r0) * u;
    add(pts[i], u, B, N, r, 1 + widen * u * u, mask[0] + (mask[1] - mask[0]) * u);
  }
  if (cap) {
    const e = pts[n - 1];
    const t = T[n - 1];
    const w = 1 + widen;
    for (const [f, s] of [
      [0.45, 0.8],
      [0.8, 0.45],
    ])
      add(e.clone().addScaledVector(t, r1 * f), 1, B, N, r1 * s, w, mask[1]);
  }
  const pos = [];
  const msk = [];
  const idx = [];
  for (const ring of rings) for (const v of ring) {
    pos.push(v.p.x, v.p.y, v.p.z);
    msk.push(v.m);
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < radial; k++) {
      const a = j * radial + k;
      const b = j * radial + ((k + 1) % radial);
      idx.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  if (cap) {
    const tip = pts[n - 1].clone().addScaledVector(T[n - 1], r1 * 1.05);
    const c = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z);
    msk.push(mask[1]);
    const last = (rings.length - 1) * radial;
    for (let k = 0; k < radial; k++) idx.push(last + k, last + ((k + 1) % radial), c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(msk, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A surface of revolution from a profile [[r, y], ...] with an optional radial ripple r(θ). */
function lathe(profile, seg, ripple = null) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
  if (ripple) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const k = ripple(Math.atan2(z, x), p.getY(i));
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  return smoothed(g);
}

/** A grid surface f(u, v) → Vector3 (u, v in 0..1), smooth-shaded, double-sided by the material. */
function sheet(f, nu, nv) {
  const pos = [];
  const idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = f(i / nu, j / nv);
    pos.push(p.x, p.y, p.z);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i;
    idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A sphere deformed by r(dir) (smooth). */
function blob(detail, radius) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g = smoothed(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize();
    const r = radius(_v);
    p.setXYZ(i, _v.x * r.x, _v.y * r.y, _v.z * r.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Simple smooth 3D value noise for shaping (deterministic per seed). */
function shaper(seed) {
  const rnd = new Random(seed);
  const perm = Array.from({ length: 256 }, () => rnd.random());
  const h = (x, y, z) => perm[(((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & 255];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = s(x - xi);
    const fy = s(y - yi);
    const fz = s(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy),
      fz,
    ) * 2 - 1;
  };
}

// ---------------------------------------------------------------- the kinds

/** Staghorn Acropora: an antler thicket of round branches with pale growing tips. */
function staghorn(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const radial = lod ? 3 : 6;
  let budget = lod ? 50 : 85;
  const grow = (p, dir, len, r, depth, m0) => {
    if (budget-- <= 0) return;
    const pts = [p.clone()];
    const d = dir.clone();
    const q = p.clone();
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      d.add(new THREE.Vector3(rng.range(-0.25, 0.25), rng.range(0, 0.2), rng.range(-0.25, 0.25))).normalize();
      q.addScaledVector(d, len / steps);
      pts.push(q.clone());
    }
    const m1 = Math.min(1, m0 + 0.35);
    parts.push(tube(pts, r, r * 0.72, radial, { mask: depth > 0 ? [m0, m1 * 0.8] : [m0, 1], cap: true }));
    if (depth <= 0) return;
    const kids = rng.random() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const at = pts[k === 0 ? pts.length - 1 : 1 + Math.floor(rng.random() * (pts.length - 2))];
      const nd = d
        .clone()
        .add(new THREE.Vector3(rng.range(-0.9, 0.9), rng.range(-0.1, 0.5), rng.range(-0.9, 0.9)))
        .normalize();
      if (nd.y < 0.15) nd.y = 0.15;
      grow(at, nd.normalize(), len * rng.range(0.7, 0.9), r * 0.78, depth - 1, m1 * 0.8);
    }
  };
  const trunks = 9;
  for (let k = 0; k < trunks; k++) {
    const a = (k / trunks) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const out = rng.range(0.4, 0.95);
    const base = new THREE.Vector3(Math.cos(a) * rng.range(0, 0.25), 0, Math.sin(a) * rng.range(0, 0.25));
    grow(base, new THREE.Vector3(Math.cos(a) * out, 1, Math.sin(a) * out).normalize(), rng.range(0.28, 0.4), 0.05, 3, 0);
  }
  return finish(mergeGeometries(parts.map((g) => g.toNonIndexed())), { tex: TEX.acropora });
}

/** Elkhorn: thick, flattened branches spreading out and up, widening into palmate lobes. */
function elkhorn(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const radial = lod ? 5 : 9;
  const grow = (p, dir, len, r, depth, m0) => {
    const pts = [p.clone()];
    const d = dir.clone();
    const q = p.clone();
    for (let s = 0; s < 4; s++) {
      d.add(new THREE.Vector3(rng.range(-0.15, 0.15), rng.range(-0.02, 0.12), rng.range(-0.15, 0.15))).normalize();
      q.addScaledVector(d, len / 4);
      pts.push(q.clone());
    }
    const side = new THREE.Vector3().crossVectors(d, UP).normalize();
    const lift = new THREE.Vector3().crossVectors(side, d).normalize();
    parts.push(tube(pts, r, r * 0.9, radial, { flat: 0.32, widen: 0.9, mask: [m0, m0 + 0.4], side }));
    if (depth <= 0) return;
    for (let k = 0; k < 2; k++) {
      const nd = d.clone().addScaledVector(side, (k ? 1 : -1) * rng.range(0.35, 0.7)).add(new THREE.Vector3(0, rng.range(0.05, 0.3), 0)).normalize();
      grow(pts[pts.length - 1], nd, len * 0.75, r * 0.85, depth - 1, m0 + 0.4);
    }
  };
  const trunk = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.22, 0), new THREE.Vector3(0, 0.38, 0.02)], 0.16, 0.13, radial, { cap: false });
  parts.push(trunk);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
    grow(new THREE.Vector3(0, 0.36, 0), new THREE.Vector3(Math.cos(a), rng.range(0.35, 0.8), Math.sin(a)).normalize(), rng.range(0.42, 0.55), 0.11, 2, 0.1);
  }
  return finish(mergeGeometries(parts.map((g) => g.toNonIndexed())), { tex: TEX.acropora });
}

/** Brain coral: a hemisphere, slightly lumpy, the meanders are the shader's. */
function brain(seed, lod) {
  const n = shaper(seed);
  const g = blob(lod ? 3 : 8, (d) => {
    const r = 0.62 * (1 + n(d.x * 1.6, d.y * 1.6, d.z * 1.6) * 0.08);
    const y = d.y < 0 ? d.y * 0.15 : d.y * 0.72;
    return new THREE.Vector3(r, (y / (d.y || 1e-6)) * r, r);
  });
  // Keep the underside tucked into the sand.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.2);
  g.computeVertexNormals();
  return finish(g, { tex: TEX.brain });
}

/** Massive Porites: a lumpy boulder of merged lobes, flat underneath. */
function boulder(seed, lod) {
  const rng = new Random(seed);
  const n = shaper(seed + 5);
  const lobes = Array.from({ length: 4 }, () => new THREE.Vector3(rng.range(-1, 1), rng.range(0.3, 1), rng.range(-1, 1)).normalize());
  const g = blob(lod ? 3 : 8, (d) => {
    let r = 0.7;
    for (const L of lobes) r += Math.max(0, d.dot(L) - 0.55) * 0.55;
    r *= 1 + n(d.x * 2.2, d.y * 2.2, d.z * 2.2) * 0.1 + (lod ? 0 : Math.max(0, n(d.x * 7, d.y * 7, d.z * 7)) * 0.07);
    const y = d.y < 0 ? 0.08 : 0.85;
    return new THREE.Vector3(r, r * y, r);
  });
  return finish(g, { tex: TEX.porites });
}

/** Table coral: a lobed, flat-topped plate of fused branchlets on a flared stalk, fringed with upturned tips. */
function table(seed, lod) {
  const rng = new Random(seed);
  const n = shaper(seed + 11);
  const parts = [];
  const H = 0.46;
  const R = (a) => 0.92 * (1 + n(Math.cos(a) * 1.4, 3.1, Math.sin(a) * 1.4) * 0.16);
  const seg = lod ? 20 : 48;
  const rings = lod ? 4 : 9;
  const tilt = rng.range(-0.06, 0.06);
  const top = sheet(
    (u, v) => {
      const a = u * Math.PI * 2;
      const r = R(a) * (0.02 + 0.98 * v);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      return new THREE.Vector3(x, H + 0.04 + (1 - v * v) * 0.05 + x * tilt + Math.sin(a * 7 + v * 3) * 0.008 * v, z);
    },
    seg,
    rings,
  );
  // Underside: a shallow cone to the stalk.
  const under = sheet(
    (u, v) => {
      const a = -u * Math.PI * 2;
      const r = R(a) * (0.12 + 0.88 * v);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      return new THREE.Vector3(x, H - 0.02 - (1 - v) * 0.12 + x * tilt, z);
    },
    seg,
    rings,
  );
  parts.push(finish(top, { tex: TEX.table, mask: (x, y, z) => Math.min(1, Math.hypot(x, z) / 0.9) }));
  parts.push(finish(under, { tex: TEX.acropora, color: 0x8a8278, mask: 0.1 }));
  parts.push(finish(tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, H * 0.5, 0), new THREE.Vector3(0, H - 0.1, 0)], 0.13, 0.1, lod ? 5 : 8, { cap: false, mask: [0, 0] }), { tex: TEX.acropora, color: 0x9a9082 }));
  // Upturned branchlet tips around the rim.
  if (!lod) {
    const tips = [];
    for (let k = 0; k < 110; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = R(a) * (1 - Math.pow(rng.random(), 2) * 0.25);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = H + 0.045 + x * tilt;
      const out = new THREE.Vector3(Math.cos(a) * rng.range(0.1, 0.7), 1, Math.sin(a) * rng.range(0.1, 0.7)).normalize();
      tips.push(tube([new THREE.Vector3(x, y - 0.015, z), new THREE.Vector3(x, y, z).addScaledVector(out, rng.range(0.012, 0.03))], 0.008, 0.006, 3, { mask: [0.8, 1] }).toNonIndexed());
    }
    parts.push(finish(mergeGeometries(tips), { tex: TEX.acropora }));
  }
  return mergeGeometries(parts);
}

/** Plate (foliose) coral: overlapping whorled leaves with rounded, ruffled rims, cupped and rising like a half-opened cabbage. */
function foliose(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const leaves = lod ? 5 : 8;
  for (let k = 0; k < leaves; k++) {
    const a0 = (k / leaves) * Math.PI * 2 * 1.6 + rng.range(-0.3, 0.3);
    const span = rng.range(1.0, 1.5);
    const reach = rng.range(0.45, 0.7) * (1 - k * 0.04);
    const rise = rng.range(0.3, 0.6);
    const y0 = k * 0.05;
    const f = (u, v, off) => {
      const w = 2 * v - 1;
      const a = a0 + w * span * 0.5 * (0.35 + 0.65 * u);
      const r = 0.06 + u * reach * (1 - 0.3 * w * w);
      const y = y0 + u * u * reach * rise + w * w * u * 0.09 + Math.sin(w * span * 6 + k) * 0.03 * u ** 3 + off;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    };
    parts.push(finish(sheet((u, v) => f(u, v, 0.012), lod ? 3 : 7, lod ? 5 : 12), { tex: TEX.foliose, mask: (x, y, z) => Math.min(1, Math.hypot(x, z) / 0.6) }));
    parts.push(finish(sheet((u, v) => f(u, 1 - v, -0.012), lod ? 3 : 7, lod ? 5 : 12), { tex: TEX.foliose, color: 0xa8a098, mask: 0 }));
  }
  parts.push(finish(new THREE.CylinderGeometry(0.07, 0.12, 0.3, 7).translate(0, 0.12, 0), { tex: TEX.porites, color: 0x9a9082 }));
  return mergeGeometries(parts);
}

/** Pillar coral: upright round fingers furred with polyps, from a low mound. */
function pillar(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const radial = lod ? 5 : 10;
  const count = 8;
  for (let k = 0; k < count; k++) {
    const a = k * 2.39996 + rng.range(-0.2, 0.2);
    const r = k === 0 ? 0 : 0.14 + Math.sqrt(k / count) * 0.32;
    const h = rng.range(0.55, 1.6) * (1 - r * 0.6);
    const base = new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    const lean = new THREE.Vector3(Math.cos(a) * 0.08, 1, Math.sin(a) * 0.08).normalize();
    const pts = [0, 0.33, 0.66, 1].map((t) => base.clone().addScaledVector(lean, h * t).add(new THREE.Vector3(Math.sin(t * 5 + k) * 0.02, 0, Math.cos(t * 4 + k) * 0.02)));
    const rad = rng.range(0.07, 0.11);
    parts.push(tube(pts, rad * 1.1, rad, radial, { mask: [0, 1] }).toNonIndexed());
  }
  parts.push(blob(lod ? 1 : 2, (d) => new THREE.Vector3(0.45, d.y > 0 ? 0.12 : 0.02, 0.45)).toNonIndexed());
  return finish(mergeGeometries(parts.map((g) => { if (!g.attributes.aMask) g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; })), { tex: TEX.fuzzy });
}

/** Mushroom coral: a free-living oval disc on the sand, the septa radiate from its mouth. */
function mushroom(seed, lod) {
  const g = blob(lod ? 1 : 3, (d) => new THREE.Vector3(0.2, d.y > 0 ? 0.06 : 0.01, 0.15));
  return finish(g, { tex: TEX.septa });
}

/** Gorgonian sea fan: one gently curved net on a short stem (the net is cut by the shader). */
function fan(seed, lod) {
  const rng = new Random(seed);
  const n = shaper(seed + 3);
  const W = 0.75;
  const Hh = 1.35;
  const g = sheet(
    (u, v) => {
      const x = (u - 0.5) * 2 * W * (0.35 + 0.65 * Math.sin(v * Math.PI * 0.55 + 0.25));
      const y = 0.12 + v * Hh;
      return new THREE.Vector3(x, y, x * x * 0.35 + n(x * 2, y * 2, 0.5) * 0.05);
    },
    lod ? 6 : 14,
    lod ? 6 : 14,
  );
  const stem = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0.1, 0), new THREE.Vector3(0, 0.2, 0.01)], 0.035, 0.025, 5, { cap: false, mask: [0, 0.1] });
  return mergeGeometries([finish(g, { tex: TEX.plain, mask: (x, y) => (y / 1.5) * 0.6 }), finish(stem, { tex: TEX.plain, color: 0x6a5048 })]);
}

/** Tree soft coral (Dendronephthya): a pale translucent trunk dividing into branches crowned with polyp bunches. */
function softTree(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const radial = lod ? 4 : 7;
  const sway = (x, y) => Math.max(0, (y - 0.2) * 1.1);
  const trunkTop = new THREE.Vector3(rng.range(-0.04, 0.04), 0.42, rng.range(-0.04, 0.04));
  parts.push(finish(tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, 0), trunkTop], 0.11, 0.07, radial, { cap: false }), { tex: TEX.plain, color: 0xf2e6e0, mask: sway }));
  const branches = lod ? 6 : 9;
  for (let k = 0; k < branches; k++) {
    const a = (k / branches) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const out = rng.range(0.22, 0.42);
    const tip = new THREE.Vector3(Math.cos(a) * out, rng.range(0.7, 1.0), Math.sin(a) * out);
    const mid = trunkTop.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.04, 0));
    parts.push(finish(tube([trunkTop, mid, tip], 0.045, 0.025, radial - 1, { cap: false }), { tex: TEX.plain, color: 0xf2e6e0, mask: sway }));
    const puffs = lod ? 2 : 5;
    for (let j = 0; j < puffs; j++) {
      const r = rng.range(0.045, 0.08);
      const c = tip.clone().add(new THREE.Vector3(rng.range(-0.09, 0.09), rng.range(-0.06, 0.1), rng.range(-0.09, 0.09)));
      parts.push(finish(blob(lod ? 0 : 1, () => new THREE.Vector3(r, r * 0.9, r)).translate(c.x, c.y, c.z), { tex: TEX.polyps, mask: sway }));
    }
  }
  return mergeGeometries(parts);
}

/** Leather coral (Sarcophyton): a thick stalk and a wavy, folded cap furred with polyps. */
function leather(seed, lod) {
  const rng = new Random(seed);
  const folds = Math.round(rng.range(4, 7));
  const seg = lod ? 24 : 72;
  const cap = sheet(
    (u, v) => {
      const a = u * Math.PI * 2;
      const r = 0.05 + v * 0.5;
      const y = 0.34 + v * 0.1 + Math.sin(a * folds) * 0.09 * v * v - v * v * 0.08;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    },
    seg,
    lod ? 4 : 8,
  );
  const under = sheet(
    (u, v) => {
      const a = -u * Math.PI * 2;
      const r = 0.05 + v * 0.5;
      const y = 0.31 + v * 0.1 + Math.sin(a * folds) * 0.09 * v * v - v * v * 0.08 - 0.03;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    },
    seg,
    lod ? 4 : 8,
  );
  const stalk = lathe([[0.2, 0], [0.17, 0.12], [0.15, 0.25], [0.17, 0.32], [0.05, 0.34]], lod ? 8 : 16);
  const sway = (x, y) => Math.max(0, (y - 0.25) * 0.8);
  return mergeGeometries([finish(cap, { tex: TEX.fuzzy, mask: sway }), finish(under, { tex: TEX.plain, color: 0xbab0a0, mask: sway }), finish(stalk, { tex: TEX.plain, color: 0xd8d0c0, mask: 0 })]);
}

/** Tube sponges: a clump of thick-walled tubes with open, rimmed mouths. */
function tubes(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const seg = lod ? 7 : 14;
  const count = Math.round(rng.range(4, 7));
  for (let k = 0; k < count; k++) {
    const h = rng.range(0.35, 1.1);
    const r = rng.range(0.06, 0.11);
    const w = r * 0.28;
    const g = lathe([[r * 1.05, 0], [r, h * 0.5], [r * 1.12, h * 0.92], [r * 1.16, h], [r * 1.16 - w, h], [r - w, h * 0.9], [r - w, h * 0.3], [0.001, h * 0.25]], seg, (a, y) => 1 + Math.sin(a * 3 + k + y * 4) * 0.04);
    const a = k * 2.39996;
    const d = k === 0 ? 0 : 0.1 + Math.sqrt(k) * 0.07;
    g.rotateX(rng.range(-0.15, 0.15)).rotateZ(rng.range(-0.15, 0.15)).translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(finish(g, { tex: TEX.sponge }));
  }
  return mergeGeometries(parts);
}

/** Barrel sponge: a huge rough vase with deep vertical ribs and a wide dark mouth. */
function barrel(seed, lod) {
  const g = lathe(
    [[0.26, 0], [0.44, 0.18], [0.58, 0.6], [0.62, 1.05], [0.6, 1.22], [0.5, 1.22], [0.45, 0.8], [0.3, 0.5], [0.001, 0.45]],
    lod ? 14 : 36,
    (a, y) => 1 + Math.abs(Math.sin(a * 7)) * 0.08 * Math.min(1, y * 2),
  );
  return finish(g, { tex: TEX.sponge });
}

/** Vase sponge: a flaring, thin-walled cup. */
function vase(seed, lod) {
  const g = lathe([[0.06, 0], [0.1, 0.2], [0.2, 0.5], [0.34, 0.78], [0.4, 0.86], [0.37, 0.86], [0.3, 0.76], [0.16, 0.48], [0.001, 0.3]], lod ? 10 : 26, (a, y) => 1 + Math.sin(a * 5) * 0.05 * y);
  return finish(g, { tex: TEX.sponge });
}

/** Anemone: a column, an oral disc and a thick crown of tapering, curling tentacles. */
function anemone(seed, lod) {
  const rng = new Random(seed);
  const parts = [finish(lathe([[0.2, 0], [0.19, 0.1], [0.22, 0.16], [0.02, 0.17]], lod ? 8 : 16), { tex: TEX.plain, color: 0xc8b8a8, mask: 0 })];
  const count = lod ? 24 : 52;
  const tent = [];
  for (let k = 0; k < count; k++) {
    const a = k * 2.39996;
    const r = 0.03 + Math.sqrt(k / count) * 0.17;
    const base = new THREE.Vector3(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = rng.range(0.16, 0.28);
    const pts = [0, 0.33, 0.66, 1].map((t) => base.clone().addScaledVector(out, len * t * (0.6 + r * 2)).add(new THREE.Vector3(0, len * t * (1 - r * 2.5) + t * t * 0.02, 0)));
    tent.push(tube(pts, 0.018, 0.009, lod ? 3 : 5, { mask: [0.2, 1] }).toNonIndexed());
  }
  parts.push(finish(mergeGeometries(tent), { tex: TEX.plain }));
  return mergeGeometries(parts);
}

/** Giant clam: hinge down, two deeply fluted valves with zigzag lips, and the bright mantle spilling over the gap. */
function clam(seed, lod) {
  const L = 0.34;
  const H = 0.24;
  const W = 0.17;
  const gap = 0.035;
  const folds = 5;
  const valve = (s) => {
    const g = sheet(
      (u, v) => {
        const f = Math.sin(Math.PI * (0.04 + u * 0.92));
        const rib = Math.abs(Math.sin(u * Math.PI * folds));
        const x = (u - 0.5) * 2 * L;
        const z = s * (gap * v + (W * Math.sin(Math.PI * v * 0.85) + rib * 0.035 * v) * Math.sqrt(f));
        const y = H * (0.5 - 0.5 * Math.cos(Math.PI * v)) * Math.sqrt(f) + rib * 0.04 * v ** 4;
        return new THREE.Vector3(x, y, z);
      },
      lod ? 12 : 30,
      lod ? 4 : 10,
    );
    return finish(g, { tex: TEX.rock, color: 0xb8b0a0, mask: 0 });
  };
  const mantle = sheet(
    (u, v) => {
      const f = Math.sin(Math.PI * (0.06 + u * 0.88));
      const x = (u - 0.5) * 2 * L * 0.96;
      const z = (v - 0.5) * 2 * (gap + 0.05) * Math.sqrt(f);
      const y = H * Math.sqrt(f) + 0.02 + Math.sin(u * Math.PI * folds * 2) * 0.012 - (2 * v - 1) ** 2 * 0.03;
      return new THREE.Vector3(x, y, z);
    },
    lod ? 12 : 30,
    lod ? 3 : 6,
  );
  return mergeGeometries([valve(1), valve(-1), finish(mantle, { tex: TEX.mantle, mask: 0 })]);
}

/** Feather star: a crown of feathery arms curling up from a high perch. */
function crinoid(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const arms = lod ? 10 : 20;
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = rng.range(0.25, 0.38);
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.2) pts.push(out.clone().multiplyScalar(0.03 + len * t).add(new THREE.Vector3(0, 0.06 + Math.sin(t * Math.PI * 0.8) * 0.12 + t * t * 0.1, 0)));
    parts.push(tube(pts, 0.009, 0.005, 3, { mask: [0.3, 1] }).toNonIndexed());
    if (!lod) {
      // Pinnules: fine barbs down both sides of each arm.
      const barbs = [];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1].clone().lerp(pts[i], 0.5);
        const t = pts[i].clone().sub(pts[i - 1]).normalize();
        const s = new THREE.Vector3().crossVectors(t, UP).normalize();
        for (const sg of [1, -1]) {
          const tip = p.clone().addScaledVector(s, sg * 0.05).add(new THREE.Vector3(0, 0.025, 0));
          barbs.push(p.x, p.y, p.z, tip.x, tip.y, tip.z, p.x + t.x * 0.02, p.y + t.y * 0.02, p.z + t.z * 0.02);
        }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(barbs, 3));
      bg.computeVertexNormals();
      bg.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(barbs.length / 3).fill(0.8), 1));
      parts.push(bg);
    }
  }
  return finish(mergeGeometries(parts), { tex: TEX.plain });
}

/** Sea cucumber: a long soft body studded with papillae, lying on the sand. */
function cucumber(seed, lod) {
  const rng = new Random(seed);
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.2) pts.push(new THREE.Vector3(Math.sin(t * 2.5 + rng.random()) * 0.06, 0.06, (t - 0.5) * 0.55));
  const body = tube(pts, 0.07, 0.055, lod ? 6 : 12, { flat: 0.8 });
  const g = finish(body, { tex: TEX.fuzzy, mask: 0 });
  return g;
}

/** Long-spined urchin: a dark test bristling with needle spines. */
function urchin(seed, lod) {
  const parts = [finish(blob(lod ? 1 : 2, () => new THREE.Vector3(0.1, 0.075, 0.1)).translate(0, 0.07, 0), { tex: TEX.plain, mask: 0 })];
  const spines = [];
  const g = new THREE.IcosahedronGeometry(1, lod ? 1 : 2).toNonIndexed().attributes.position;
  for (let i = 0; i < g.count; i += 3) {
    const d = new THREE.Vector3(g.getX(i) + g.getX(i + 1) + g.getX(i + 2), g.getY(i) + g.getY(i + 1) + g.getY(i + 2), g.getZ(i) + g.getZ(i + 1) + g.getZ(i + 2)).normalize();
    if (d.y < -0.2) continue;
    const a = d.clone().multiplyScalar(0.08).add(new THREE.Vector3(0, 0.07, 0));
    spines.push(tube([a, a.clone().addScaledVector(d, 0.2 + (i % 7) * 0.012)], 0.007, 0.001, 3, { cap: false }).toNonIndexed());
  }
  parts.push(finish(mergeGeometries(spines), { tex: TEX.plain, mask: 0 }));
  return mergeGeometries(parts);
}

/** Sea star (Linckia): five long round arms, slightly curled. */
function star(seed, lod) {
  const rng = new Random(seed);
  const parts = [finish(blob(lod ? 1 : 2, (d) => new THREE.Vector3(0.05, d.y > 0 ? 0.03 : 0.005, 0.05)).translate(0, 0.02, 0), { tex: TEX.fuzzy, mask: 0 })];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(Math.cos(a + t * 0.2 * (k % 2 ? 1 : -1)) * (0.02 + t * 0.2), 0.022 + Math.sin(t * Math.PI) * 0.01, Math.sin(a + t * 0.2 * (k % 2 ? 1 : -1)) * (0.02 + t * 0.2)));
    parts.push(finish(tube(pts, 0.022, 0.012, lod ? 4 : 8, { flat: 0.75 }), { tex: TEX.fuzzy, mask: 0 }));
  }
  return mergeGeometries(parts);
}

/** Sea whips: long thin rods bending with the current. */
function whips(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 0.8 + rng.range(-0.2, 0.2);
    const h = rng.range(1.1, 2.0);
    const bend = rng.range(0.1, 0.45);
    const pts = [0, 0.25, 0.5, 0.75, 1].map((f) => new THREE.Vector3(Math.cos(a) * (0.04 + f * f * bend), h * f, Math.sin(a) * (0.04 + f * f * bend)));
    parts.push(tube(pts, 0.02, 0.008, lod ? 3 : 5, { mask: [0, 1] }).toNonIndexed());
  }
  return finish(mergeGeometries(parts), { tex: TEX.fuzzy, mask: (x, y) => (y / 2) ** 1.3 });
}

/** Sea grass: a tuft of long ribbon blades, gently curved. */
function seagrass(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const blades = lod ? 10 : 26;
  for (let k = 0; k < blades; k++) {
    const h = rng.range(0.3, 0.7);
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 0.25);
    const bend = rng.range(-0.25, 0.25);
    const g = sheet((u, v) => new THREE.Vector3((u - 0.5) * 0.035, v * h, bend * v * v * h), 1, lod ? 2 : 4);
    g.rotateY(a).translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(finish(g, { tex: TEX.plain, mask: (x, y) => (y / 0.7) ** 1.2 }));
  }
  return mergeGeometries(parts);
}

/** Kelp: tall stipes hung with blades and gas floats, waving from the tips. */
function kelp(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const sway = (x, y) => (y / 4.3) ** 1.4;
  for (let k = 0; k < 5; k++) {
    const h = 3.2 + (k % 3) * 0.5;
    const bx = Math.cos(k * 2.4) * 0.25;
    const bz = Math.sin(k * 2.4) * 0.25;
    parts.push(finish(tube([new THREE.Vector3(bx, 0, bz), new THREE.Vector3(bx, h * 0.5, bz), new THREE.Vector3(bx, h, bz)], 0.02, 0.012, 4, { cap: false }), { tex: TEX.plain, mask: sway }));
    const leaves = lod ? 5 : 10;
    for (let j = 0; j < leaves; j++) {
      const y = 0.4 + (j / leaves) * (h - 0.4);
      const a = j * 2.2 + k;
      const len = 0.45 + rng.range(-0.08, 0.1);
      const g = sheet((u, v) => {
        const w = Math.sin(v * Math.PI) * 0.08 * (1 + Math.sin(v * 9) * 0.1);
        return new THREE.Vector3((u - 0.5) * 2 * w, v * len * 0.55, v * len * 0.85 + Math.sin(u * Math.PI) * 0.01);
      }, 2, lod ? 3 : 6);
      g.rotateY(a).translate(bx, y, bz);
      parts.push(finish(g, { tex: TEX.plain, mask: sway }));
    }
    parts.push(finish(blob(0, () => new THREE.Vector3(0.035, 0.05, 0.035)).translate(bx, h, bz), { tex: TEX.plain, color: 0xd8c070, mask: sway }));
  }
  return mergeGeometries(parts);
}

/** Reef rock: a knobbly flattened boulder crusted with coralline algae and weed (colours in the shader). */
function rock(seed, lod) {
  const n = shaper(seed + 21);
  const g = blob(lod ? 3 : 9, (d) => {
    const r = 1 + n(d.x * 1.7, d.y * 1.7, d.z * 1.7) * 0.28 + n(d.x * 4.1, d.y * 4.1, d.z * 4.1) * 0.12 + (lod ? 0 : Math.max(0, n(d.x * 9, d.y * 9, d.z * 9)) * 0.08);
    return new THREE.Vector3(r, r * 0.62, r);
  });
  g.translate(0, 0.45, 0);
  return finish(g, { tex: TEX.rock, mask: 0 });
}

/** Moray eel: head and neck reaching out of a hole in the rock, jaws agape. */
function eel(seed, lod) {
  const rng = new Random(seed);
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.2) pts.push(new THREE.Vector3(Math.sin(t * 3 + rng.random()) * 0.05, 0.05 + t * 0.35, t * 0.25));
  const body = tube(pts, 0.075, 0.06, lod ? 6 : 12, { flat: 0.85, mask: [0, 1] });
  const head = pts[pts.length - 1];
  const jaw = blob(lod ? 1 : 2, () => new THREE.Vector3(0.05, 0.022, 0.1)).rotateX(0.35).translate(head.x, head.y - 0.04, head.z + 0.06);
  const hole = blob(lod ? 1 : 2, (d) => new THREE.Vector3(0.16, d.y > 0 ? 0.05 : 0.01, 0.16));
  const parts = [finish(body, { tex: TEX.fuzzy }), finish(jaw, { tex: TEX.fuzzy, mask: 1 }), finish(hole, { tex: TEX.rock, color: 0x5a5048, mask: 0 })];
  // Eyes.
  for (const s of [1, -1]) parts.push(finish(blob(0, () => new THREE.Vector3(0.012, 0.012, 0.012)).translate(head.x + s * 0.045, head.y + 0.02, head.z + 0.02), { color: 0x151510, mask: 1 }));
  return mergeGeometries(parts);
}

/** Octopus: a soft mantle and eight curling arms spread over the rock. */
function octopus(seed, lod) {
  const rng = new Random(seed);
  const parts = [finish(blob(lod ? 1 : 3, (d) => new THREE.Vector3(0.12, d.y > 0 ? 0.16 : 0.05, 0.14)).translate(0, 0.1, -0.04), { tex: TEX.fuzzy, mask: 0.2 })];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(0.35, 0.55);
    const curl = rng.range(0.6, 1.6) * (k % 2 ? 1 : -1);
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.125) {
      const r = 0.06 + t * len;
      const b = a + t * t * curl;
      pts.push(new THREE.Vector3(Math.cos(b) * r, 0.03 + Math.sin(t * Math.PI) * 0.04, Math.sin(b) * r));
    }
    parts.push(finish(tube(pts, 0.032, 0.006, lod ? 4 : 7, { mask: [0.2, 1] }), { tex: TEX.fuzzy }));
  }
  for (const s of [1, -1]) parts.push(finish(blob(0, () => new THREE.Vector3(0.02, 0.02, 0.02)).translate(s * 0.07, 0.13, 0.05), { color: 0xe8d890, mask: 0.2 }));
  return mergeGeometries(parts);
}

/** A crab: a wide carapace, claws held up, four pairs of jointed legs. */
function crab(seed, lod) {
  const parts = [finish(blob(lod ? 1 : 2, (d) => new THREE.Vector3(0.1, d.y > 0 ? 0.045 : 0.02, 0.075)).translate(0, 0.06, 0), { tex: TEX.fuzzy, mask: 0 })];
  const r = lod ? 3 : 5;
  for (const s of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const z = 0.03 - k * 0.025;
      parts.push(finish(tube([new THREE.Vector3(s * 0.08, 0.06, z), new THREE.Vector3(s * 0.15, 0.08, z - 0.01), new THREE.Vector3(s * 0.19, 0.0, z - 0.02)], 0.009, 0.005, r, { cap: false }), { tex: TEX.plain, mask: 0 }));
    }
    parts.push(finish(tube([new THREE.Vector3(s * 0.07, 0.07, 0.06), new THREE.Vector3(s * 0.11, 0.1, 0.11), new THREE.Vector3(s * 0.08, 0.1, 0.16)], 0.016, 0.02, r), { tex: TEX.plain, mask: 0 }));
  }
  return mergeGeometries(parts);
}

/** Spiny lobster: a banded tail, a spiny carapace and two long whip antennae, tucked under a ledge. */
function lobster(seed, lod) {
  const r = lod ? 5 : 9;
  const body = tube([0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => new THREE.Vector3(0, 0.06 + Math.sin(t * 3) * 0.01, -0.22 + t * 0.4)), 0.05, 0.055, r, { flat: 0.8 });
  const parts = [finish(body, { tex: TEX.fuzzy, mask: 0 })];
  for (const s of [1, -1]) parts.push(finish(tube([new THREE.Vector3(s * 0.03, 0.09, 0.18), new THREE.Vector3(s * 0.12, 0.16, 0.45), new THREE.Vector3(s * 0.22, 0.14, 0.7)], 0.012, 0.003, lod ? 3 : 4, { cap: false }), { tex: TEX.plain, mask: 0 }));
  for (const s of [1, -1]) for (let k = 0; k < 4; k++) parts.push(finish(tube([new THREE.Vector3(s * 0.04, 0.05, 0.08 - k * 0.05), new THREE.Vector3(s * 0.11, 0.06, 0.07 - k * 0.05), new THREE.Vector3(s * 0.14, 0.0, 0.06 - k * 0.05)], 0.008, 0.004, 3, { cap: false }), { tex: TEX.plain, mask: 0 }));
  return mergeGeometries(parts);
}

/** Seahorse: head bowed on a curled, ringed body, tail wrapped round a blade of grass. */
function seahorse(seed, lod) {
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const a = t * Math.PI * 1.3;
    pts.push(new THREE.Vector3(0, 0.02 + 0.1 * (1 - Math.cos(a)) * 0.5 + t * 0.14, Math.sin(a) * 0.04 - t * 0.02));
  }
  pts.reverse();
  const body = tube(pts, 0.004, 0.022, lod ? 5 : 8, { mask: [0.3, 0.3] });
  const top = pts[pts.length - 1];
  const snout = tube([top, top.clone().add(new THREE.Vector3(0, -0.01, 0.05))], 0.012, 0.006, 5);
  return mergeGeometries([finish(body, { tex: TEX.fuzzy }), finish(snout, { tex: TEX.fuzzy, mask: 0.3 })]);
}

/** Garden eels: a colony of thin bodies rising from their burrows in the sand, heads into the current. */
function gardenEels(seed, lod) {
  const rng = new Random(seed);
  const parts = [];
  const n = lod ? 8 : 16;
  for (let k = 0; k < n; k++) {
    const x = rng.range(-0.8, 0.8);
    const z = rng.range(-0.8, 0.8);
    const h = rng.range(0.25, 0.5);
    const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(x + t * t * 0.05, t * h, z + Math.sin(t * 2.5) * 0.04 + t * t * 0.06));
    parts.push(finish(tube(pts, 0.011, 0.009, lod ? 3 : 5, { mask: [0, 1] }), { tex: TEX.fuzzy }));
  }
  return mergeGeometries(parts);
}

const BUILDERS = {
  branch: staghorn,
  elkhorn,
  brain,
  boulder,
  table,
  plate: foliose,
  pillar,
  mushroom,
  fan,
  soft: softTree,
  leather,
  tubes,
  barrel,
  vase,
  anemone,
  clam,
  crinoid,
  cucumber,
  urchin,
  star,
  whip: whips,
  grass: seagrass,
  kelp,
  rock,
  eel,
  octopus,
  crab,
  lobster,
  seahorse,
  gardeneels: gardenEels,
};

export const CORAL_KINDS = Object.keys(BUILDERS);

/** Every model at detail `lod` (0 near, 1 far), grown from `seed`. */
export function buildCorals(seed, lod = 0) {
  const out = {};
  for (const [kind, f] of Object.entries(BUILDERS)) {
    const g = f(seed * 31 + kind.length * 7 + kind.charCodeAt(0), lod);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aMask', 'aTex'].includes(k)) g.deleteAttribute(k);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out[kind] = g;
  }
  return out;
}

/**
 * The coral surfaces, painted and bumped per fragment from object-space
 * position: tiny raised corallites (Acropora), meandering valleys with a
 * groove down each ridge (brain), fine pits on lumpy boulders (Porites),
 * crowded branchlet tips (tables), growth ridges (plates), polyp fur,
 * sponge pores, crusted rock, radial septa, a speckled clam mantle. Fades
 * to plain colour where the pattern would be finer than a pixel.
 */
export const CORAL_SURFACE_GLSL = /* glsl */ `
  varying vec3 vCP;
  varying float vTex;
  varying float vTip;
  float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float cNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // Distance to the nearest and second-nearest cell point.
  vec2 cCells(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    float d1 = 8.0; float d2 = 8.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = vec3(cHash(i + g), cHash(i + g + 17.13), cHash(i + g + 31.71));
      vec3 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(vec2(d1, d2));
  }
  // Phasor noise: the phase of a sum of randomly turned Gabor kernels; sin() of it gives
  // stripes of even width that meander and fork like a brain coral's valleys.
  float cPhasor(vec3 p, float f) {
    vec3 i = floor(p); vec3 fr = fract(p);
    vec2 acc = vec2(0.0);
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 c = i + g;
      vec3 r = g + vec3(cHash(c), cHash(c + 17.13), cHash(c + 31.71)) - fr;
      float w = exp(-dot(r, r) * 2.2);
      vec3 dir = normalize(vec3(cHash(c + 5.3), cHash(c + 9.1), cHash(c + 2.7)) - 0.5);
      float ph = 6.2831853 * (f * dot(r, dir) + cHash(c + 11.9));
      acc += w * vec2(cos(ph), sin(ph));
    }
    return atan(acc.y, acc.x);
  }
  // Height (metres, for the bump) and colour factor of each surface at p.
  float cSurface(vec3 p, float kind, out vec3 tint) {
    tint = vec3(1.0);
    float px = length(fwidth(p));
    if (kind < 0.5) {
      // Acropora: raised corallites, denser toward the tips.
      float fr = 55.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      vec2 c = cCells(p * fr);
      float b = (1.0 - smoothstep(0.05, 0.42, c.x)) * fade;
      tint = vec3(0.86 + 0.26 * b);
      return b * 0.004;
    } else if (kind < 1.5) {
      // Brain: phasor noise — even stripes whose direction wanders — makes the labyrinth of
      // valleys and ridges; each ridge carries a groove along its crest.
      vec3 q = p * 11.0;
      float fade = 1.0 - smoothstep(0.25, 0.9, px * 11.0 * 3.2);
      float st = sin(cPhasor(q, 3.2));
      float ridge = smoothstep(-0.35, 0.45, st);
      float groove = 1.0 - smoothstep(0.0, 0.12, 1.0 - st);
      float h = mix(0.55, ridge - groove * 0.4, fade);
      tint = mix(vec3(1.0), mix(vec3(0.52, 0.56, 0.44), vec3(1.14, 1.1, 1.0), ridge) * (1.0 - groove * 0.18), fade);
      return h * 0.012;
    } else if (kind < 2.5) {
      // Porites: gentle lumps, peppered with tiny pits.
      float fr = 70.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      float pit = (1.0 - smoothstep(0.1, 0.3, cCells(p * fr).x)) * fade;
      float lump = cNoise(p * 9.0) + 0.5 * cNoise(p * 23.0);
      float patchD = smoothstep(0.62, 0.75, cNoise(p * 2.0 + 7.0));
      tint = vec3(0.86 + 0.18 * lump - pit * 0.3) * mix(vec3(1.0), vec3(0.8, 0.78, 0.7), patchD);
      return lump * 0.02 - pit * 0.003;
    } else if (kind < 3.5) {
      // Table top: a crowd of branchlet tips, pale ends on darker gaps.
      float fr = 34.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      vec2 c = cCells(vec3(p.x, p.y * 0.3, p.z) * fr);
      float b = (1.0 - smoothstep(0.1, 0.5, c.x)) * fade;
      tint = vec3(0.62 + 0.55 * b + 0.38 * (1.0 - fade));
      return b * 0.009;
    } else if (kind < 4.5) {
      // Plate coral: fine concentric growth ridges and radial striations.
      float r = length(p.xz);
      float a = atan(p.z, p.x);
      float fr = 110.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      float ring = 0.5 + 0.5 * sin(r * fr + cNoise(p * 8.0) * 5.0);
      float ray = 0.5 + 0.5 * sin(a * 90.0);
      float h = (ring * 0.7 + ray * 0.3) * fade;
      tint = vec3(0.88 + 0.22 * h);
      return h * 0.002;
    } else if (kind < 5.5) {
      // Fur of extended polyps: a fine soft speckle.
      float fr = 90.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      float s = cNoise(p * fr) * fade;
      tint = vec3(0.85 + 0.3 * s);
      return s * 0.002;
    } else if (kind < 6.5) {
      // Soft-coral polyp bunches: knobbly, catching the light.
      float fr = 45.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      float b = (1.0 - smoothstep(0.1, 0.5, cCells(p * fr).x)) * fade;
      tint = vec3(0.8 + 0.4 * b);
      return b * 0.004;
    } else if (kind < 7.5) {
      // Sponge: open pores in a rough skin.
      float fr = 16.0;
      float fade = 1.0 - smoothstep(0.25, 0.8, px * fr);
      vec2 c = cCells(p * fr);
      float pore = (1.0 - smoothstep(0.12, 0.22, c.x)) * fade;
      float rough = cNoise(p * 60.0) * fade;
      tint = vec3(1.0 - pore * 0.6) * (0.9 + 0.15 * rough);
      return -pore * 0.006 + rough * 0.001;
    } else if (kind < 8.5) {
      // Reef rock: rough and holed, felted with brown-green algal turf, crusted with pink coralline algae.
      float n1 = cNoise(p * 5.0);
      float n2 = cNoise(p * 19.0 + 3.0);
      float fade = 1.0 - smoothstep(0.3, 0.9, px * 14.0);
      float hole = (1.0 - smoothstep(0.06, 0.16, cCells(p * 9.0).x)) * fade;
      float grit = cNoise(p * 70.0) * (1.0 - smoothstep(0.3, 0.9, px * 70.0));
      float pinkA = smoothstep(0.62, 0.74, cNoise(p * 5.3 + 9.0)) * smoothstep(0.4, 0.6, cNoise(p * 1.1 - 2.0));
      float turf = smoothstep(0.3, 0.55, cNoise(p * 4.1 - 5.0) * 0.7 + cNoise(p * 13.0) * 0.3);
      tint = mix(vec3(0.72, 0.66, 0.56), vec3(1.0, 0.72, 0.76), pinkA * 0.7);
      tint = mix(tint, vec3(0.5, 0.52, 0.34), turf * 0.8) * (0.7 + 0.35 * n2 + 0.15 * grit) * (1.0 - hole * 0.3);
      return n1 * 0.04 + n2 * 0.012 + grit * 0.003 - hole * 0.012;
    } else if (kind < 9.5) {
      // Mushroom coral: septa radiating from the central mouth.
      float a = atan(p.z, p.x);
      float r = length(p.xz);
      float fade = 1.0 - smoothstep(0.2, 0.8, px * 120.0);
      float s = (0.5 + 0.5 * cos(a * 64.0 + cNoise(p * 30.0) * 2.0)) * smoothstep(0.02, 0.05, r) * fade;
      tint = vec3(0.8 + 0.35 * s) * mix(0.8, 1.0, smoothstep(0.0, 0.05, r));
      return s * 0.002;
    } else if (kind < 10.5) {
      return 0.0;
    }
    // Clam mantle: blue-green iridescent speckles and wavy lines.
    float s = smoothstep(0.55, 0.75, cNoise(p * 80.0));
    float w = 0.5 + 0.5 * sin(p.x * 70.0 + cNoise(p * 12.0) * 4.0);
    tint = mix(vec3(0.7, 0.8, 0.9), vec3(1.3, 1.4, 1.2), w * 0.5) + s * 0.6;
    return w * 0.001;
  }
`;

/**
 * Hooks the coral surface into a MeshStandardMaterial's shader (call from
 * onBeforeCompile). `tipTint` lightens growing tips (Acropora go pale or bluish).
 */
export function coralShader(shader, declareMask = true) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aTex;\n' + (declareMask ? 'attribute float aMask;\n' : '') + 'varying vec3 vCP;\nvarying float vTex;\nvarying float vTip;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = position; vTex = aTex; vTip = aMask;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CORAL_SURFACE_GLSL + '\nfloat cH; vec3 cTint;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      cH = cSurface(vCP, vTex, cTint);
      diffuseColor.rgb *= cTint;
      // Growing tips: paler (and a little blue on Acropora).
      float tip = smoothstep(0.55, 1.0, vTip) * step(vTex, 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.6 + vec3(0.32, 0.36, 0.42), tip * 0.8);`,
    )
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n// Thin plates and tissue let a little light through.\ntotalEmissiveRadiance += diffuseColor.rgb * (vTex > 2.5 && vTex < 4.5 ? 0.14 : 0.035);')
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // Bump from the surface height (screen-space derivatives, view space).
        vec3 dpx = dFdx(-vViewPosition);
        vec3 dpy = dFdy(-vViewPosition);
        float hx = dFdx(cH);
        float hy = dFdy(cH);
        vec3 r1 = cross(dpy, normal);
        vec3 r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (hx * r1 + hy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`,
    );
}
