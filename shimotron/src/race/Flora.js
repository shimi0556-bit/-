import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Vegetation, windMaterial } from '../engine/world/Vegetation.js';
import { Random, smoothstep } from '../engine/core/Random.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Tube along a curve with a per-ring radius function (and optional ribs). */
function tube(curve, rings, sides, radius, { ribs = 0, ribDepth = 0, capTop = false, vScale = 1 } = {}) {
  const frames = curve.computeFrenetFrames(rings, false);
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const len = curve.getLength();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const c = curve.getPointAt(t);
    const N = frames.normals[r];
    const B = frames.binormals[r];
    const rad = radius(t);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const rib = ribs ? 1 + Math.cos(a * ribs) * ribDepth : 1;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const nx = N.x * dx + B.x * dy;
      const ny = N.y * dx + B.y * dy;
      const nz = N.z * dx + B.z * dy;
      pos.push(c.x + nx * rad * rib, c.y + ny * rad * rib, c.z + nz * rad * rib);
      nrm.push(nx, ny, nz);
      uv.push(s / sides, t * len * vScale);
    }
  }
  const row = sides + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * row + s;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  if (capTop) {
    const c = curve.getPointAt(1);
    const T = curve.getTangentAt(1);
    const centre = pos.length / 3;
    const tip = c.clone().addScaledVector(T, radius(1) * 0.8);
    pos.push(tip.x, tip.y, tip.z);
    nrm.push(T.x, T.y, T.z);
    uv.push(0.5, len * vScale);
    const last = rings * row;
    for (let s = 0; s < sides; s++) idx.push(last + s, centre, last + s + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (ribs) g.computeVertexNormals();
  return g;
}

/** Coconut palm: curved ringed trunk + a crown of drooping textured fronds. */
export function palmGeometry(seed = 1) {
  const rng = new Random(seed);
  const lean = rng.range(1.2, 2.6);
  const H = rng.range(8.5, 10.5);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3(lean * 0.15, H * 0.35, 0),
    new THREE.Vector3(lean * 0.55, H * 0.7, 0),
    new THREE.Vector3(lean, H, 0),
  ]);
  const trunk = tube(curve, 22, 9, (t) => (0.3 - t * 0.11) * (1 + 0.07 * Math.max(0, Math.sin(t * 80))), { vScale: 0.5 });
  const top = curve.getPointAt(1);
  const out = { pos: [], nrm: [], uv: [], col: [] };
  const fronds = 12;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = rng.range(3.6, 4.8);
    const rise = rng.range(0.6, 1.4) * (f % 3 === 0 ? 1.4 : 1);
    const droop = rng.range(2.0, 3.0);
    const segs = 8;
    const pts = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const p = top.clone().addScaledVector(dir, L * t);
      p.y += Math.sin(t * Math.PI * 0.7) * rise - t * t * droop;
      pts.push(p);
    }
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const w0 = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(0.98, t0 * 0.9 + 0.08)), 0.7) + 0.04;
      const w1 = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(0.98, t1 * 0.9 + 0.08)), 0.7) + 0.04;
      const p0 = pts[s];
      const p1 = pts[s + 1];
      // V-fold: the midrib sits a little above the leaflet tips.
      const fold = new THREE.Vector3(0, -0.12, 0);
      const corners = [p0.clone().addScaledVector(side, -w0).add(fold), p0.clone().addScaledVector(side, w0).add(fold), p1.clone().addScaledVector(side, w1).add(fold), p1.clone().addScaledVector(side, -w1).add(fold)];
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, 0.2).normalize();
      const shade0 = 0.55 + t0 * 0.45;
      const shade1 = 0.55 + t1 * 0.45;
      const uvs = [
        [0, t0],
        [1, t0],
        [1, t1],
        [0, t1],
      ];
      const cols = [shade0, shade0, shade1, shade1];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        out.pos.push(corners[k].x, corners[k].y, corners[k].z);
        out.nrm.push(up.x, up.y, up.z);
        out.uv.push(uvs[k][0], uvs[k][1]);
        out.col.push(cols[k], cols[k], cols[k] * 0.95);
      }
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  leaves.computeBoundingSphere();
  // Coconuts under the crown, merged into the trunk.
  const nuts = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SphereGeometry(0.17, 8, 6);
    const a = (i / 4) * Math.PI * 2;
    s.translate(top.x + Math.cos(a) * 0.25, top.y - 0.35, top.z + Math.sin(a) * 0.25);
    nuts.push(s);
  }
  const trunkGeo = mergeGeometries([trunk, ...nuts].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute('color');
    return g;
  }));
  return { trunk: trunkGeo, leaves };
}

/** Saguaro: ribbed column with two or three upturned arms (vertex coloured). */
export function cactusGeometry(seed = 1) {
  const rng = new Random(seed);
  const H = rng.range(4, 6.5);
  const R = rng.range(0.3, 0.42);
  const parts = [];
  const main = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, H * 0.5, 0), new THREE.Vector3(0.05, H, 0)]);
  parts.push(tube(main, 14, 20, (t) => R * (1 - Math.pow(t, 6) * 0.25), { ribs: 12, ribDepth: 0.07, capTop: true }));
  const arms = 2 + (rng.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const y0 = H * rng.range(0.35, 0.6);
    const out = rng.range(0.7, 1.0);
    const up = rng.range(1.2, 2.2);
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, y0, 0),
      d.clone().multiplyScalar(out * 0.7).setY(y0 + 0.1),
      d.clone().multiplyScalar(out).setY(y0 + 0.6),
      d.clone().multiplyScalar(out).setY(y0 + up),
    ]);
    parts.push(tube(arm, 12, 14, (t) => R * 0.62 * (1 - Math.pow(t, 6) * 0.25), { ribs: 10, ribDepth: 0.07, capTop: true }));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  // Rib shading: darker in the grooves via the normal/radial difference.
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 0.75 + 0.25 * Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 12) + (y < 0.4 ? -0.15 : 0);
    col.set([0.3 * k, 0.48 * k, 0.24 * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Leafless snag: tapered trunk with recursive forked branches. */
export function deadTreeGeometry(seed = 1) {
  const rng = new Random(seed);
  const parts = [];
  const branch = (base, dir, len, rad, depth) => {
    const tip = base.clone().addScaledVector(dir, len);
    const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)).multiplyScalar(len * 0.3));
    const c = new THREE.CatmullRomCurve3([base, mid, tip]);
    parts.push(tube(c, 4, depth === 0 ? 8 : 5, (t) => rad * (1 - t * 0.65), { vScale: 0.6 }));
    if (depth >= 3) return;
    const kids = depth === 0 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const nd = dir.clone().add(new THREE.Vector3(rng.range(-0.9, 0.9), rng.range(0.1, 0.6), rng.range(-0.9, 0.9))).normalize();
      const from = base.clone().lerp(tip, depth === 0 ? rng.range(0.55, 0.9) : 1);
      branch(from, nd, len * rng.range(0.5, 0.7), rad * 0.55, depth + 1);
    }
  };
  branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rng.range(-0.1, 0.1), 1, rng.range(-0.1, 0.1)).normalize(), rng.range(4.5, 6.5), 0.28, 0);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

/**
 * Stage vegetation: the engine's grass/rocks/flowers plus a per-island tree
 * mix (pine, oak, palm, cactus, dead tree) concentrated along the circuit
 * where the camera actually is.
 */
export class IslandFlora extends Vegetation {
  constructor(engine, terrain, materials, stage, track) {
    const W = track.W;
    const n = track.n;
    super(engine, terrain, materials, {
      // Grass hugs the circuit: random track sample, random side offset.
      grassSampler: (rng) => {
        const i = Math.floor(rng.random() * n);
        const side = rng.random() < 0.5 ? -1 : 1;
        const off = side * (W + 3 + Math.pow(rng.random(), 1.6) * 55);
        return { x: track.x[i] - track.tz[i] * off, z: track.z[i] + track.tx[i] * off };
      },
      colliderFilter: () => false, // rails enclose the circuit; scenery is visual only
    });
    this.stage = stage;
    this.track = track;
    this.rng = new Random(stage.seed * 31 + 5);
  }

  build() {
    const q = this.engine.quality.settings;
    const F = this.stage.flora;
    this._trees(q.treeDensity);
    this._rocks();
    if (F.grass > 0) this._grass(q.grassDensity * F.grass * 1.4);
    if (F.flowers > 0) this._flowers(q.grassDensity * F.flowers);
    // Biome tints on the shared foliage/grass materials.
    const tint = new THREE.Color(F.foliageTint || '#ffffff');
    for (const m of this.windMats) m.color.copy(tint);
    return this.group;
  }

  _trees(density) {
    const F = this.stage.flora;
    const T = this.materials.textures;
    const t = this.terrain;
    const tr = this.track;
    const species = [];
    const foliage = (map, name) =>
      new THREE.MeshStandardMaterial({ name, map, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
    const wind = (m) => {
      const v = windMaterial(m, this.uniforms, 'tree', true);
      this.windMats.push(v);
      return v;
    };
    const bark = this.materials.lib.bark;
    const greyBark = bark.clone();
    greyBark.color = new THREE.Color(0x9a948c);
    greyBark.name = 'עץ מת';
    const cactusMat = new THREE.MeshStandardMaterial({ name: 'קקטוס', vertexColors: true, roughness: 0.72, metalness: 0 });
    if (F.pine > 0) {
      const g = this._pineGeometry();
      species.push({ id: 'pine', w: F.pine, parts: [[g.trunk, bark, true], [g.leaves, wind(foliage(T.needles, 'מחטים')), true]], h: [4, 140], scale: [0.75, 1.35], collider: 0.35 });
    }
    if (F.oak > 0) {
      const g = this._oakGeometry();
      species.push({ id: 'oak', w: F.oak, parts: [[g.trunk, bark, true], [g.leaves, wind(foliage(T.leaves, 'עלווה')), true]], h: [3, 40], scale: [0.8, 1.25], collider: 0.45 });
    }
    if (F.palm > 0) {
      const variants = [palmGeometry(3), palmGeometry(8)];
      const frondMat = wind(foliage(T.frond, 'כפות תמר'));
      species.push({ id: 'palm', w: F.palm, variants: variants.map((g) => [[g.trunk, bark, true], [g.leaves, frondMat, true]]), h: [1.6, 30], scale: [0.85, 1.2], collider: 0.3, coastal: true });
    }
    if (F.cactus > 0) {
      const variants = [cactusGeometry(2), cactusGeometry(5), cactusGeometry(9)];
      species.push({ id: 'cactus', w: F.cactus, variants: variants.map((g) => [[g, cactusMat, true]]), h: [3, 60], scale: [0.8, 1.3], collider: 0.4, dry: true });
    }
    if (F.deadTree > 0) {
      const variants = [deadTreeGeometry(4), deadTreeGeometry(12)];
      species.push({ id: 'dead', w: F.deadTree, variants: variants.map((g) => [[g, greyBark, true]]), h: [2, 120], scale: [0.8, 1.3], collider: 0.3 });
    }
    if (!species.length) return;
    const total = species.reduce((s, x) => s + x.w, 0);
    const target = Math.round(F.trees * density);
    const lists = species.map((s) => (s.variants ? s.variants.map(() => []) : [[]]));
    const half = t.size / 2 - 30;
    let placed = 0;
    let guard = 0;
    while (placed < target && guard++ < target * 40) {
      let x;
      let z;
      if (this.rng.random() < 0.72) {
        // Near the circuit: 12–260 m from the road edge, denser close in.
        const i = Math.floor(this.rng.random() * tr.n);
        const side = this.rng.random() < 0.5 ? -1 : 1;
        const off = side * (tr.W + 12 + Math.pow(this.rng.random(), 1.8) * 250);
        x = tr.x[i] - tr.tz[i] * off;
        z = tr.z[i] + tr.tx[i] * off;
      } else {
        x = this.rng.range(-half, half);
        z = this.rng.range(-half, half);
      }
      const forest = this.noise.noise(x * 0.005, z * 0.005) * 0.5 + 0.5;
      if (this.rng.random() > smoothstep(0.2, 0.7, forest) + 0.15) continue;
      const h = this._canPlace(x, z, { minH: 1.4, maxH: 150, maxSlope: 0.32, clearPlaza: 0, clearPath: 5 });
      if (h === null) continue;
      const w = t.weightsAt(x, z);
      // Pick a species by weight, filtered by local conditions.
      let r = this.rng.random() * total;
      let sp = species[0];
      let si = 0;
      for (let k = 0; k < species.length; k++) {
        r -= species[k].w;
        if (r <= 0) {
          sp = species[k];
          si = k;
          break;
        }
      }
      if (h < sp.h[0] || h > sp.h[1]) continue;
      if (sp.coastal && h > 14 && this.rng.random() < 0.7) continue;
      if (!sp.coastal && w.sand > 0.5 && !sp.dry) continue;
      if (w.rock > 0.55 && sp.id !== 'dead' && sp.id !== 'pine') continue;
      const vi = Math.floor(this.rng.random() * lists[si].length);
      const s = this.rng.range(sp.scale[0], sp.scale[1]);
      const it = { x, y: h - 0.1, z, s, r: this.rng.range(0, Math.PI * 2) };
      _q.setFromEuler(_e.set(this.rng.range(-0.03, 0.03), it.r, this.rng.range(-0.03, 0.03)));
      it.matrix = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), _q.clone(), new THREE.Vector3(s, s * this.rng.range(0.92, 1.1), s));
      lists[si][vi].push(it);
      placed++;
    }
    species.forEach((sp, si) => {
      const variants = sp.variants || [sp.parts];
      variants.forEach((parts, vi) => {
        const list = lists[si][vi];
        if (!list.length) return;
        for (const [geo, mat, cast] of parts) this._chunked(geo, mat, list, sp.id, { cast, cell: 200 });
      });
    });
    this.treeCount = placed;
  }
}
