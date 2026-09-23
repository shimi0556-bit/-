import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain } from '../engine/world/Terrain.js';
import { Random, smoothstep } from '../engine/core/Random.js';

/**
 * The archipelago: where every island sits in one shared sea, and the
 * bridges that tie them to the city in the middle.
 *
 * The island being played is always built at the origin in full detail;
 * the world group is shifted so every other island lands at its true
 * offset around it. Islands that are not loaded are drawn from a light
 * stand-in: a coarse height grid with painted ground, clumps of trees,
 * blocks of houses for the city, the circuit as a ribbon, glowing craters.
 */
export const WORLD = {
  layout: {
    city: [0, 0],
    pines: [-2500, -1450],
    dunes: [0, -2750],
    lagoon: [2500, -1450],
    lava: [2550, 1500],
    canyon: [0, 2800],
    ice: [-2550, 1500],
  },
  hub: 'city',
  span: 9400, // the world depth map covers ±span/2
  deck: 17, // bridge deck height over the sea (sailboats pass underneath)
};

const lin = (hex) => new THREE.Color(hex);
const PALETTE = [0xe8e2d4, 0xd9c7a8, 0xc9d3db, 0x8fa9bf, 0xb9774f, 0xf2f0ea, 0xe2b98a, 0x9aa2a8, 0xd8d0c0, 0x7f93a6];

export class World {
  constructor(engine, materials, stages) {
    this.engine = engine;
    this.materials = materials;
    this.stages = stages;
    this.group = new THREE.Group();
    this.group.name = 'עולם';
    this.terrains = {};
    this.grids = {};
    this.lods = {};
    this.trackPts = {};
    this.landings = {};
    this.bridges = [];
    this.origin = [0, 0];
    this.mat = new THREE.MeshStandardMaterial({ name: 'איים רחוקים', vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mat.userData.keep = true;
  }

  pos(id) {
    return WORLD.layout[id] || [0, 0];
  }

  /** Which island's square holds this world point (or null for open sea). */
  islandAt(wx, wz) {
    for (const st of this.stages) {
      const [cx, cz] = this.pos(st.id);
      const h = st.size / 2;
      if (Math.abs(wx - cx) < h && Math.abs(wz - cz) < h) return st;
    }
    return null;
  }

  async build(plans, progress = async () => {}) {
    const low = this.engine.quality.presetName === 'low';
    this.N = low ? 81 : 121;
    const n = this.stages.length;
    for (let k = 0; k < n; k++) {
      const st = this.stages[k];
      await progress(k / (n * 2), `ממפה את ${st.name}…`);
      const t = new Terrain({}, { plaza: null, paths: [], island: st.island, biome: st.biome, size: st.size, seed: st.seed, reef: st.life?.reef ?? 0.5 });
      this.terrains[st.id] = t;
      const N = this.N;
      const cell = st.size / (N - 1);
      const half = st.size / 2;
      const g = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = t.height(-half + i * cell, -half + j * cell);
      this.grids[st.id] = g;
      this.setPlan(st.id, plans[st.id], false);
    }
    await progress(0.5, 'מותח גשרים בין האיים…');
    this._bridges();
    for (let k = 0; k < n; k++) {
      const st = this.stages[k];
      await progress(0.55 + (k / n) * 0.4, `בונה את ${st.name} מרחוק…`);
      this._lod(st);
    }
    this._depthMap();
    this.engine.scene.add(this.group);
    return this;
  }

  /** Circuit plan for an island (it can arrive later, once the circuit is planned). */
  setPlan(id, plan, rebuild = true) {
    if (!plan) return;
    const curve = new THREE.CatmullRomCurve3(plan.controls.map((p) => new THREE.Vector3(p.x, 0, p.z)), true, 'centripetal', 0.5);
    this.trackPts[id] = curve.getSpacedPoints(500);
    if (rebuild && this.lods[id]) {
      const st = this.stages.find((s) => s.id === id);
      this.lods[id].removeFromParent();
      this._lod(st);
    }
  }

  /** Distance from a local point to the island's circuit (∞ before it is planned). */
  trackDistance(id, x, z) {
    const pts = this.trackPts[id];
    if (!pts) return Infinity;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const d = Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
      if (d < best) best = d;
    }
    return best;
  }

  /** Coarse height at a local point of an island (from its stand-in grid). */
  gridHeight(id, x, z) {
    const st = this.stages.find((s) => s.id === id);
    const g = this.grids[id];
    const N = this.N;
    const cell = st.size / (N - 1);
    const fx = Math.max(0, Math.min(N - 1.001, (x + st.size / 2) / cell));
    const fz = Math.max(0, Math.min(N - 1.001, (z + st.size / 2) / cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = g[j * N + i];
    const b = g[j * N + i + 1];
    const c = g[(j + 1) * N + i];
    const d = g[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Sea floor (or ground) anywhere in the world. */
  groundAt(wx, wz) {
    const st = this.islandAt(wx, wz);
    if (!st) return -40;
    const [cx, cz] = this.pos(st.id);
    return this.gridHeight(st.id, wx - cx, wz - cz);
  }

  /** Stand-in height as drawn: land lifted a little, sea floor pushed down, so distant coasts do not shimmer. */
  _lodH(h) {
    return h > 0 ? h + 0.6 : h * 1.3 - 1.4;
  }

  // ------------------------------------------------------------ stand-ins

  _lod(st) {
    const t = this.terrains[st.id];
    const g = this.grids[st.id];
    const N = this.N;
    const size = st.size;
    const cell = size / (N - 1);
    const half = size / 2;
    const B = { grassTint: [1, 1, 1], sandTint: [1, 1, 1], dirtTint: [1, 1, 1], rockTint: [1, 1, 1], snowLine: 9999, snowAmount: 0, ...st.biome };
    const tint = (c, k) => new THREE.Color(c[0] * k[0], c[1] * k[1], c[2] * k[2]);
    const GR = tint([0.11, 0.2, 0.05], B.grassTint);
    const SA = tint([0.6, 0.5, 0.34], B.sandTint);
    const DI = tint([0.28, 0.2, 0.12], B.dirtTint);
    const RO = tint([0.3, 0.28, 0.26], B.rockTint);
    const SN = new THREE.Color(0.78, 0.82, 0.88);
    const REEF = new THREE.Color(0.32, 0.22, 0.24);
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const c = new THREE.Color();
    const H = (i, j) => g[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = -half + i * cell;
        const z = -half + j * cell;
        const h = g[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = this._lodH(h);
        pos[k * 3 + 2] = z;
        const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * cell);
        const dz = (H(i, j + 1) - H(i, j - 1)) / (2 * cell);
        const ny = 1 / Math.sqrt(1 + dx * dx + dz * dz);
        const slope = 1 - ny;
        const nz = t.noise.noise(x * 0.03, z * 0.03);
        if (h < 0.3) {
          c.copy(SA).multiplyScalar(0.85);
          const reef = t.reefAt ? t.reefAt(x, z, h) : 0;
          c.lerp(REEF, reef * 0.8);
          c.multiplyScalar(0.45 + 0.55 * Math.exp(h * 0.07));
        } else {
          let sand = smoothstep(2.6 + nz * 1.2, 0.9, h);
          const rock = Math.min(1, smoothstep(0.16, 0.32, slope * 1.6) + smoothstep(46, 70, h + nz * 12) * 0.8);
          const patches = smoothstep(0.45, 0.75, t.noise.noise(x * 0.012 - 4, z * 0.012 + 9)) * 0.55;
          let dirt = patches * (1 - sand) * (1 - rock);
          if (B.desert) {
            sand = Math.max(sand, B.desert * (0.7 + 0.3 * nz));
            dirt = Math.max(dirt, B.desert * patches * 1.2);
          }
          sand *= 1 - rock;
          const grass = Math.max(0, 1 - sand - dirt - rock);
          c.setRGB(0, 0, 0);
          c.r = SA.r * sand + DI.r * dirt + RO.r * rock + GR.r * grass;
          c.g = SA.g * sand + DI.g * dirt + RO.g * rock + GR.g * grass;
          c.b = SA.b * sand + DI.b * dirt + RO.b * rock + GR.b * grass;
          const snow = B.snowAmount * smoothstep(B.snowLine - 5, B.snowLine + 5, h + nz * 9) * smoothstep(0.55, 0.82, ny);
          c.lerp(SN, snow);
          c.multiplyScalar(0.85 + 0.3 * t.noise.noise(x * 0.05 + 3, z * 0.05 - 8) * 0.5 + 0.15);
        }
        c.toArray(col, k * 3);
      }
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Soften the relief: seen from kilometres away, cliffs on a 20 m grid would shade almost black.
    const nr = geo.attributes.normal;
    for (let i = 0; i < nr.count; i++) {
      const x = nr.getX(i);
      const y = nr.getY(i) + 0.9;
      const z = nr.getZ(i);
      const l = Math.hypot(x, y, z);
      nr.setXYZ(i, x / l, y / l, z / l);
    }
    const lod = new THREE.Group();
    lod.name = `${st.name} (מרחוק)`;
    const ground = new THREE.Mesh(geo, this.mat);
    ground.name = 'אי רחוק';
    ground.userData.stage = st.id;
    lod.add(ground);
    const ribbon = this._ribbon(st);
    if (ribbon) lod.add(ribbon);
    lod.add(...this._trees(st));
    if (st.city) lod.add(this._blocks(st));
    for (const V of st.island.volcanoes || (st.island.volcano ? [st.island.volcano] : [])) lod.add(this._crater(st, V));
    const [cx, cz] = this.pos(st.id);
    lod.position.set(cx, 0, cz);
    lod.traverse((o) => {
      o.userData.noPick = true;
      o.matrixAutoUpdate = o === lod;
    });
    lod.children.forEach((o) => o.updateMatrix());
    this.lods[st.id] = lod;
    this.group.add(lod);
  }

  _ribbon(st) {
    const pts = this.trackPts[st.id];
    if (!pts) return null;
    const n = pts.length;
    const pos = [];
    const col = [];
    const idx = [];
    const w = 7;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const q = pts[(i + 1) % n];
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const l = Math.hypot(tx, tz) || 1;
      const rx = -tz / l;
      const rz = tx / l;
      for (const s of [-1, 1]) {
        const x = p.x + rx * w * s;
        const z = p.z + rz * w * s;
        pos.push(x, this._lodH(Math.max(0.5, this.gridHeight(st.id, x, z))) + 1.2, z);
        col.push(0.045, 0.045, 0.05);
      }
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mat);
    m.name = 'מסלול (מרחוק)';
    return m;
  }

  _treeGeos() {
    if (this._tg) return this._tg;
    const paint = (g, hex) => {
      g = g.index ? g.toNonIndexed() : g;
      g.deleteAttribute('uv');
      const c = new THREE.Color(hex);
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    this._tg = {
      pine: paint(new THREE.ConeGeometry(3, 12, 6, 1, true).translate(0, 7.5, 0), 0x1d3a1c),
      oak: paint(new THREE.IcosahedronGeometry(4.4, 0).scale(1, 0.85, 1).translate(0, 6.5, 0), 0x2f4f1c),
      palm: mergeGeometries([paint(new THREE.CylinderGeometry(0.25, 0.35, 9, 4, 1, true).translate(0, 4.5, 0), 0x6a5238), paint(new THREE.IcosahedronGeometry(3.2, 0).scale(1, 0.38, 1).translate(0, 9.2, 0), 0x3d6420)]),
      cactus: paint(new THREE.CylinderGeometry(0.5, 0.55, 5, 5, 1, true).translate(0, 2.5, 0), 0x4a6a34),
    };
    return this._tg;
  }

  _trees(st) {
    const F = st.flora || {};
    const t = this.terrains[st.id];
    const rng = new Random(st.seed * 7 + 3);
    const G = this._treeGeos();
    const kinds = ['pine', 'oak', 'palm', 'cactus'].filter((k) => (F[k] || 0) > 0);
    if (!kinds.length) return [];
    const weight = kinds.map((k) => F[k]);
    const total = weight.reduce((a, b) => a + b, 0);
    const want = Math.round((F.trees || 600) * 0.55 * (this.engine.quality.presetName === 'low' ? 0.5 : 1));
    const lists = Object.fromEntries(kinds.map((k) => [k, []]));
    const half = st.size / 2;
    const tint = new THREE.Color(F.foliageTint || '#ffffff');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let guard = 0, placed = 0; placed < want && guard < want * 8; guard++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = this.gridHeight(st.id, x, z);
      if (h < 2.6 || h > 80) continue;
      if (st.biome.snowAmount && h > st.biome.snowLine + 40 && rng.random() < 0.7) continue;
      const e = 4;
      const slope = Math.abs(this.gridHeight(st.id, x + e, z) - h) / e + Math.abs(this.gridHeight(st.id, x, z + e) - h) / e;
      if (slope > 0.5) continue;
      if (t.noise.noise(x * 0.004 + 9, z * 0.004) < -0.35) continue; // clearings
      if (this.trackDistance(st.id, x, z) < 16 || this.keepOut(st.id, x, z)) continue;
      let r = rng.random() * total;
      let kind = kinds[0];
      for (let k = 0; k < kinds.length; k++) {
        r -= weight[k];
        if (r <= 0) {
          kind = kinds[k];
          break;
        }
      }
      const s = rng.range(0.75, 1.3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
      m.compose(new THREE.Vector3(x, this._lodH(h) - 0.4, z), q, new THREE.Vector3(s, s * rng.range(0.85, 1.2), s));
      lists[kind].push({ m: m.clone(), c: tint.clone().multiplyScalar(rng.range(0.75, 1.15)) });
      placed++;
    }
    const out = [];
    for (const kind of kinds) {
      const list = lists[kind];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(G[kind], this.mat, list.length);
      list.forEach((it, k) => {
        mesh.setMatrixAt(k, it.m);
        mesh.setColorAt(k, it.c);
      });
      mesh.computeBoundingSphere();
      mesh.name = 'עצים (מרחוק)';
      out.push(mesh);
    }
    return out;
  }

  /** The city from afar: blocks of houses, towers downtown. */
  _blocks(st) {
    const rng = new Random(st.seed * 13 + 5);
    const half = st.size / 2;
    const R = st.island.radius;
    const want = this.engine.quality.presetName === 'low' ? 700 : 1300;
    const list = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pts = this.trackPts[st.id];
    const down = pts ? pts[Math.floor(pts.length * 0.4)] : { x: 0, z: 0 };
    for (let guard = 0; list.length < want && guard < want * 10; guard++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = this.gridHeight(st.id, x, z);
      if (h < 2 || h > 30) continue;
      const d = this.trackDistance(st.id, x, z);
      if (d < 18 || this.keepOut(st.id, x, z)) continue;
      const core = Math.max(0, 1 - Math.hypot(x - down.x, z - down.z) / (R * 0.6));
      const tall = rng.random() < 0.08 + core * 0.3;
      const hgt = tall ? rng.range(35, 80 + core * 60) : rng.range(8, 20 + core * 14);
      const w = tall ? rng.range(18, 30) : rng.range(12, 26);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.pick([0, Math.PI / 2]) + rng.range(-0.1, 0.1));
      m.compose(new THREE.Vector3(x, this._lodH(h) - 1, z), q, new THREE.Vector3(w, hgt, rng.range(12, 26)));
      list.push({ m: m.clone(), c: lin(tall ? rng.pick([0x8fa9bf, 0x7f93a6, 0xc9d3db, 0xe8e2d4]) : rng.pick(PALETTE)).multiplyScalar(rng.range(0.85, 1.1)) });
    }
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed();
    box.deleteAttribute('uv');
    const shade = new Float32Array(box.attributes.position.count * 3).fill(1);
    // Windows band the walls: a darker top edge and slightly darker lower storeys.
    for (let i = 0; i < box.attributes.position.count; i++) {
      const y = box.attributes.position.getY(i);
      const v = y > 0.99 ? 0.92 : 0.8 + y * 0.2;
      shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = v;
    }
    box.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const mesh = new THREE.InstancedMesh(box, this.mat, list.length);
    list.forEach((it, k) => {
      mesh.setMatrixAt(k, it.m);
      mesh.setColorAt(k, it.c);
    });
    mesh.computeBoundingSphere();
    mesh.name = 'בניינים (מרחוק)';
    return mesh;
  }

  _crater(st, V) {
    if (!this.lavaMat) {
      this.lavaMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a1a, emissiveIntensity: 1, roughness: 1 });
      this.lavaMat.userData.keep = true;
      this.materials.trackEmissive(this.lavaMat, 3.5);
    }
    const R = V.radius * V.craterRadius;
    let floor = Infinity;
    for (let a = 0; a < 12; a++) floor = Math.min(floor, this.gridHeight(st.id, V.x + Math.cos(a) * R * 0.3, V.z + Math.sin(a) * R * 0.3));
    const m = new THREE.Mesh(new THREE.CircleGeometry(R * 0.8, 20).rotateX(-Math.PI / 2), this.lavaMat);
    m.position.set(V.x, this._lodH(floor) + 4, V.z);
    m.name = 'לוע (מרחוק)';
    return m;
  }

  // ------------------------------------------------------------ bridges

  /** Is a local point of this island on a bridge landing (kept free of houses and trees)? */
  keepOut(id, x, z) {
    const L = this.landings[id];
    if (!L) return false;
    for (const s of L) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - s.ax - dx * u, z - s.az - dz * u) < s.w) return true;
    }
    return false;
  }

  /** Where a bridge coming from direction `dir` touches down on an island: clear of its circuit. */
  _landing(st, ang) {
    const t = this.terrains[st.id];
    const half = st.size / 2 - 30;
    let fallback = null;
    for (const off of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.5, -0.5, 0.65, -0.65]) {
      const a = ang + off;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let r = half;
      while (r > 150 && t.height(dx * r, dz * r) < 1.4) r -= 5;
      if (r <= 150) continue;
      const land = r - 70;
      const L = { x: dx * land, z: dz * land };
      const hL = t.height(L.x, L.z);
      const cand = { a, dx, dz, r, L, hL, C: { x: dx * r, z: dz * r } };
      if (!fallback) fallback = cand;
      if (hL < 1.4 || hL > 16) continue;
      let ok = true;
      for (let s = -40; s <= 110 && ok; s += 10) {
        const x = dx * (land + s);
        const z = dz * (land + s);
        if (this.trackDistance(st.id, x, z) < 50) ok = false;
        if (s < 70 && Math.abs(t.height(x, z) - hL) > 6) ok = false;
      }
      if (ok) return cand;
    }
    return fallback;
  }

  _bridges() {
    const hub = this.stages.find((s) => s.id === WORLD.hub);
    if (!hub) return;
    const [hx, hz] = this.pos(hub.id);
    for (const st of this.stages) {
      if (st === hub) continue;
      const [sx, sz] = this.pos(st.id);
      const out = Math.atan2(sz - hz, sx - hx);
      const a = this._landing(hub, out);
      const b = this._landing(st, out + Math.PI);
      if (!a || !b) continue;
      this.landings[hub.id] = this.landings[hub.id] || [];
      this.landings[st.id] = this.landings[st.id] || [];
      const seg = (L) => ({ ax: L.dx * (L.r - 110), az: L.dz * (L.r - 110), bx: L.dx * (L.r + 20), bz: L.dz * (L.r + 20), w: 20 });
      this.landings[hub.id].push(seg(a));
      this.landings[st.id].push(seg(b));
      this._bridge(hub, a, st, b);
    }
  }

  _bridge(sa, a, sb, b) {
    const [ax, az] = this.pos(sa.id);
    const [bx, bz] = this.pos(sb.id);
    const P = [
      new THREE.Vector3(ax + a.L.x, 0, az + a.L.z),
      new THREE.Vector3(ax + a.C.x + a.dx * 60, 0, az + a.C.z + a.dz * 60),
      new THREE.Vector3(bx + b.C.x + b.dx * 60, 0, bz + b.C.z + b.dz * 60),
      new THREE.Vector3(bx + b.L.x, 0, bz + b.L.z),
    ];
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    const S = curve.getLength();
    const n = Math.ceil(S / 6);
    const grade = 0.055;
    const hA = a.hL + 0.05;
    const hB = b.hL + 0.05;
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const s = u * S;
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      const ground = this.groundAt(p.x, p.z);
      let y = Math.min(WORLD.deck, hA + s * grade, hB + (S - s) * grade);
      if (ground > 0) y = Math.max(y, ground + 0.35);
      samples.push({ p: new THREE.Vector3(p.x, y, p.z), t: tg, r: new THREE.Vector3(-tg.z, 0, tg.x).normalize(), s, ground });
    }
    const group = new THREE.Group();
    group.name = `גשר ל${sb.name}`;
    group.add(this._deck(samples));
    const piers = [];
    group.add(this._piers(samples, piers));
    group.add(...this._pylon(samples));
    group.traverse((o) => (o.userData.noPick = true));
    this.group.add(group);
    const mid = samples[Math.floor(samples.length / 2)];
    for (const side of [-1, 1]) piers.push({ x: mid.p.x + mid.r.x * side * 9, z: mid.p.z + mid.r.z * side * 9, r: 2, s: mid.s, pylon: true });
    this.bridges.push({ from: sa.id, to: sb.id, samples, length: S, group, piers, pylon: mid });
  }

  _deck(samples) {
    // Cross-section (lateral, vertical, colour): road with centre line, kerbs, parapets, box girder below.
    const asphalt = [0.06, 0.06, 0.065];
    const kerb = [0.55, 0.55, 0.52];
    const conc = [0.5, 0.5, 0.48];
    const line = [0.9, 0.75, 0.2];
    const white = [0.85, 0.85, 0.85];
    const prof = [
      [[-7.4, 1.05], [-7.4, -0.2], conc],
      [[-7.0, 1.05], [-7.4, 1.05], conc],
      [[-7.0, 0.2], [-7.0, 1.05], conc],
      [[-6.6, 0.2], [-7.0, 0.2], kerb],
      [[-6.4, 0.0], [-6.6, 0.2], kerb],
      [[-6.1, 0.0], [-6.4, 0.0], white],
      [[-0.2, 0.0], [-6.1, 0.0], asphalt],
      [[0.2, 0.0], [-0.2, 0.0], line],
      [[6.1, 0.0], [0.2, 0.0], asphalt],
      [[6.4, 0.0], [6.1, 0.0], white],
      [[6.6, 0.2], [6.4, 0.0], kerb],
      [[7.0, 0.2], [6.6, 0.2], kerb],
      [[7.0, 1.05], [7.0, 0.2], conc],
      [[7.4, 1.05], [7.0, 1.05], conc],
      [[7.4, -0.2], [7.4, 1.05], conc],
      [[5.2, -1.9], [7.4, -0.2], conc],
      [[-5.2, -1.9], [5.2, -1.9], [0.38, 0.38, 0.37]],
      [[-7.4, -0.2], [-5.2, -1.9], conc],
    ];
    const pos = [];
    const col = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const A = samples[i];
      const Bs = samples[i + 1];
      for (const [p0, p1, c] of prof) {
        const v = (S, [l, y]) => [S.p.x + S.r.x * l, S.p.y + y, S.p.z + S.r.z * l];
        const a0 = v(A, p0);
        const a1 = v(A, p1);
        const b0 = v(Bs, p0);
        const b1 = v(Bs, p1);
        pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
        for (let k = 0; k < 6; k++) col.push(...c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mat);
    m.name = 'גשר';
    m.receiveShadow = true;
    return m;
  }

  _piers(samples, out) {
    const list = [];
    let next = 0;
    for (const S of samples) {
      if (S.s < next) continue;
      const bottom = S.ground;
      const top = S.p.y - 1.9;
      if (top - bottom < 3) continue;
      next = S.s + 46;
      for (const side of [-1, 1]) out.push({ x: S.p.x + S.r.x * side * 3.2, z: S.p.z + S.r.z * side * 3.2, r: 1.9, s: S.s });
      const m = new THREE.Matrix4().compose(new THREE.Vector3(S.p.x, bottom, S.p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(S.t.x, S.t.z)), new THREE.Vector3(1, top - bottom, 1));
      list.push(m);
    }
    const g = mergeGeometries([new THREE.BoxGeometry(2.2, 1, 3.4).translate(-3.2, 0.5, 0), new THREE.BoxGeometry(2.2, 1, 3.4).translate(3.2, 0.5, 0)]);
    const pier = g.toNonIndexed();
    pier.deleteAttribute('uv');
    pier.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pier.attributes.position.count * 3).fill(0.46), 3));
    const mesh = new THREE.InstancedMesh(pier, this.mat, Math.max(1, list.length));
    list.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.count = list.length;
    mesh.computeBoundingSphere();
    mesh.name = 'עמודי גשר';
    return mesh;
  }

  /** A cable-stayed main span: an H-shaped pylon mid-channel with stays fanning out to the deck. */
  _pylon(samples) {
    const mid = samples[Math.floor(samples.length / 2)];
    const top = mid.p.y + 62;
    const yaw = Math.atan2(mid.t.x, mid.t.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.BoxGeometry(2.2, top - mid.ground, 3).translate(side * 9, (top + mid.ground) / 2, 0);
      legs.push(leg);
    }
    legs.push(new THREE.BoxGeometry(20, 2.4, 2.6).translate(0, top - 6, 0));
    legs.push(new THREE.BoxGeometry(20, 2, 2.6).translate(0, mid.p.y - 2.8, 0));
    const g = mergeGeometries(legs).toNonIndexed();
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.72), 3));
    g.applyQuaternion(q);
    g.translate(mid.p.x, 0, mid.p.z);
    g.computeVertexNormals();
    const pylon = new THREE.Mesh(g, this.mat);
    pylon.name = 'עמוד תלייה';
    pylon.castShadow = true;
    // Stays: from the top of each leg down to the deck edges, fore and aft.
    const pts = [];
    const i0 = samples.indexOf(mid);
    for (const side of [-1, 1]) {
      const tx = mid.p.x + mid.r.x * side * 9;
      const tz = mid.p.z + mid.r.z * side * 9;
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= 11; k++) {
          const S = samples[Math.max(0, Math.min(samples.length - 1, i0 + dir * k * 4))];
          pts.push(tx, top - 2 - k * 0.8, tz, S.p.x + S.r.x * side * 7.2, S.p.y + 1, S.p.z + S.r.z * side * 7.2);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const cables = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd }));
    cables.name = 'כבלים';
    return [pylon, cables];
  }

  // ------------------------------------------------------------ depth map

  /** One height map for the whole sea, so the water knows its depth everywhere (not just around the island in play). */
  _depthMap() {
    const S = 512;
    const span = WORLD.span;
    const data = new Float32Array(S * S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const wx = (i + 0.5) / S * span - span / 2;
        const wz = (j + 0.5) / S * span - span / 2;
        data[j * S + i] = this.groundAt(wx, wz);
      }
    }
    // Bridge piers and the pylon do not change the depth; fine.
    const tex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    tex.userData.keep = true;
    this.depthTexture = tex;
  }

  // ------------------------------------------------------------ placement

  /**
   * Makes island `id` (or none) the origin: the world shifts so that
   * island's full build sits at 0,0 and its stand-in hides while `local`.
   */
  setOrigin(id) {
    this.originId = id;
    this.origin = id ? this.pos(id) : [0, 0];
    this.group.position.set(-this.origin[0], 0, -this.origin[1]);
    this.group.updateMatrixWorld(true);
  }

  /** Show the stand-in of the origin island (world map) or the real one (playing). */
  showLocal(local) {
    for (const [id, lod] of Object.entries(this.lods)) lod.visible = !(local && id === this.originId);
    this.local = local;
  }

  /** Bridge obstacles near the origin island, in its local coordinates: pier and pylon circles, deck segments. */
  obstacles(range = 2600) {
    const piers = [];
    const decks = [];
    for (const B of this.bridges) {
      for (const P of B.piers) {
        const [x, z] = this.toLocal(P.x, P.z);
        if (Math.hypot(x, z) < range) piers.push({ x, z, r: P.r, s: P.s, pylon: !!P.pylon, bridge: B });
      }
      const S = B.samples;
      for (let i = 0; i < S.length - 1; i += 3) {
        const a = S[i];
        const b = S[Math.min(i + 3, S.length - 1)];
        const [ax, az] = this.toLocal(a.p.x, a.p.z);
        const [bx, bz] = this.toLocal(b.p.x, b.p.z);
        if (Math.hypot(ax, az) < range) decks.push({ ax, az, ay: a.p.y, bx, bz, by: b.p.y, bridge: B });
      }
    }
    return { piers, decks };
  }

  /** World position → local (origin island) coordinates, and back. */
  toLocal(wx, wz) {
    return [wx - this.origin[0], wz - this.origin[1]];
  }

  toWorld(x, z) {
    return [x + this.origin[0], z + this.origin[1]];
  }
}
