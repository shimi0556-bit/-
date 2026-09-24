import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windMaterial } from '../engine/world/Vegetation.js';
import { Random, smoothstep } from '../engine/core/Random.js';

const _m = new THREE.Matrix4();
const _h = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CELL = 10; // lookup grid (m)

/**
 * Shrubs: several leafy lobes of small leaf cards round a few woody stems,
 * darker inside and underneath, or (dry islands) a sparse olive scrub.
 * Things that push into them bend them aside; driven over fast they are
 * trampled flat and stay flattened for a long while, then slowly rise.
 * Wind sways them like everything else.
 */
export class Bushes {
  constructor(engine, terrain, materials, stage, track, flora, blocked) {
    this.engine = engine;
    this.terrain = terrain;
    this.materials = materials;
    this.stage = stage;
    this.track = track;
    this.flora = flora;
    this.blocked = blocked;
    this.rng = new Random(stage.seed * 41 + 9);
    this.group = new THREE.Group();
    this.group.name = 'שיחים';
    this.items = [];
    this.grid = new Map();
    this.active = new Set();
    this.dirty = new Set();
  }

  /** One shrub, about 1.3 m tall and 1.8 m across before scaling. */
  _geometry(seed, dry) {
    const rng = new Random(seed);
    const pos = [];
    const nrm = [];
    const uv = [];
    const col = [];
    const lobes = [];
    const n = dry ? 3 : 4 + Math.floor(rng.random() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = k === 0 ? 0 : rng.range(0.35, 0.6);
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * d, rng.range(0.55, 0.85) + (k === 0 ? 0.2 : 0), Math.sin(a) * d), R: rng.range(0.42, 0.62) * (k === 0 ? 1.15 : 1) });
    }
    const v = new THREE.Vector3();
    const base = dry ? new THREE.Color(0x6f7a4a) : new THREE.Color(0x4f7d33);
    const tip = dry ? new THREE.Color(0xa9a878) : new THREE.Color(0x9cc46a);
    for (const L of lobes) {
      const cards = dry ? 26 : 56;
      for (let i = 0; i < cards; i++) {
        v.randomDirection();
        if (v.y < -0.35) v.y = -v.y * 0.5;
        const p = L.c.clone().addScaledVector(v, L.R * (0.45 + 0.55 * Math.sqrt(rng.random())));
        const out = p.clone().sub(L.c).normalize();
        const nd = new THREE.Vector3().randomDirection().addScaledVector(out, 1.3).normalize();
        const t1 = new THREE.Vector3().crossVectors(nd, Math.abs(nd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        const t2 = new THREE.Vector3().crossVectors(nd, t1).normalize();
        const size = rng.range(0.24, 0.38) * (dry ? 0.9 : 1);
        const corners = [
          p.clone().addScaledVector(t1, -size / 2).addScaledVector(t2, -size / 2),
          p.clone().addScaledVector(t1, size / 2).addScaledVector(t2, -size / 2),
          p.clone().addScaledVector(t1, size / 2).addScaledVector(t2, size / 2),
          p.clone().addScaledVector(t1, -size / 2).addScaledVector(t2, size / 2),
        ];
        const uvs = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        for (const tri of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          for (const k of tri) {
            const q = corners[k];
            pos.push(q.x, q.y, q.z);
            const nn = q.clone().sub(L.c).normalize().lerp(UP, 0.3).normalize();
            nrm.push(nn.x, nn.y, nn.z);
            uv.push(uvs[k][0], uvs[k][1]);
            // Darker deep inside and low down, lighter at the outer tips.
            const r = Math.min(1, q.distanceTo(L.c) / L.R);
            const lift = smoothstep(0, 1.3, q.y);
            const c = base.clone().lerp(tip, r * 0.6 + lift * 0.4);
            const ao = 0.45 + 0.55 * (r * 0.6 + lift * 0.4);
            const j = 0.9 + rng.random() * 0.2;
            col.push(c.r * ao * j, c.g * ao * j, c.b * ao * j);
          }
        }
      }
    }
    const leaves = new THREE.BufferGeometry();
    leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    leaves.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // Woody stems from the root to each lobe.
    const stems = [];
    for (const L of lobes) {
      const len = L.c.length();
      const g = new THREE.CylinderGeometry(0.018, 0.04, len, 5);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, L.c.clone().normalize()));
      stems.push(g.toNonIndexed());
    }
    const stemGeo = mergeGeometries(stems);
    const sc = new Float32Array(stemGeo.attributes.position.count * 3);
    for (let i = 0; i < sc.length; i += 3) sc.set([0.28, 0.22, 0.16], i);
    stemGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    return { leaves, stems: stemGeo };
  }

  build() {
    const F = this.stage.flora;
    const q = this.engine.quality.settings;
    const dry = (F.cactus || 0) + (F.deadTree || 0) > (F.oak || 0) + (F.pine || 0) + (F.palm || 0);
    const count = Math.round((F.bushes ?? F.trees * (dry ? 0.5 : 0.75)) * q.treeDensity);
    if (count <= 0) return this.group;
    const T = this.materials.textures;
    const leafMat = new THREE.MeshStandardMaterial({ name: 'עלי שיח', map: T.leaves, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    windMaterial(leafMat, this.flora.uniforms, 'bush', true);
    this.flora.windMats.push(leafMat);
    leafMat.color.set(F.foliageTint || '#ffffff');
    const stemMat = new THREE.MeshStandardMaterial({ name: 'גבעולים', vertexColors: true, roughness: 0.9 });
    const variants = [1, 2, 3].map((k) => this._geometry(this.stage.seed * 3 + k, dry));
    const t = this.terrain;
    const tr = this.track;
    const rng = this.rng;
    const half = t.size / 2 - 30;
    const noise = this.flora.noise;
    let guard = 0;
    while (this.items.length < count && guard++ < count * 30) {
      let x;
      let z;
      if (rng.random() < 0.6) {
        // The verges beyond the barriers, thinning out with distance.
        const i = Math.floor(rng.random() * tr.n);
        const side = rng.random() < 0.5 ? -1 : 1;
        const off = side * (tr.W + 9 + Math.pow(rng.random(), 1.5) * 120);
        x = tr.x[i] - tr.tz[i] * off;
        z = tr.z[i] + tr.tx[i] * off;
      } else {
        x = rng.range(-half, half);
        z = rng.range(-half, half);
      }
      const f = noise.noise(x * 0.008 + 7, z * 0.008) * 0.5 + 0.5;
      if (rng.random() > f + 0.25) continue;
      const h = t.heightAt(x, z);
      if (h < (dry ? 2 : 1.2) || h > 140) continue;
      if (tr.clearance(x, z) < 8.5) continue;
      if (this.blocked && this.blocked(x, z, 'bush')) continue;
      const n = t.normalAt(x, z, _p);
      if (n.y < 0.8) continue;
      const w = t.weightsAt(x, z);
      if (!dry && w.sand > 0.55) continue;
      if (w.rock > 0.6) continue;
      const s = rng.range(0.7, 1.35);
      this.items.push({ x, y: h - 0.05, z, s, yaw: rng.range(0, Math.PI * 2), v: Math.floor(rng.random() * variants.length), kx: 0, kz: 0, flat: 0, touch: 0 });
    }
    // Chunks of 120 m, one mesh per variant and part, so the camera culls whole patches.
    const chunks = new Map();
    this.items.forEach((it, idx) => {
      const key = `${Math.floor(it.x / 120)},${Math.floor(it.z / 120)},${it.v}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(it);
      const g = `${Math.floor(it.x / CELL)},${Math.floor(it.z / CELL)}`;
      if (!this.grid.has(g)) this.grid.set(g, []);
      this.grid.get(g).push(idx);
    });
    for (const list of chunks.values()) {
      const V = variants[list[0].v];
      const leaves = new THREE.InstancedMesh(V.leaves, leafMat, list.length);
      const stems = new THREE.InstancedMesh(V.stems, stemMat, list.length);
      list.forEach((it, k) => {
        it.meshes = [leaves, stems];
        it.slot = k;
        this._matrix(it);
      });
      for (const m of [leaves, stems]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
        m.boundingSphere.radius += 2;
        m.castShadow = m === leaves;
        m.receiveShadow = true;
        m.name = m === leaves ? 'שיחים' : 'גבעולי שיחים';
        m.userData.noPick = true;
        this.group.add(m);
      }
    }
    return this.group;
  }

  /** Instance matrix: position · lean (a shear that keeps the root put) · turn · size; trampled = low and spread. */
  _matrix(it) {
    const spread = 1 + it.flat * 0.35;
    _q.setFromAxisAngle(UP, it.yaw);
    _m.compose(_p.set(0, 0, 0), _q, _s.set(it.s * spread, it.s, it.s * spread));
    const sy = 1 - it.flat * 0.74;
    _h.set(1, it.kx, 0, 0, 0, sy, 0, 0, 0, it.kz, 1, 0, 0, 0, 0, 1);
    _h.multiply(_m);
    _h.elements[12] = it.x;
    _h.elements[13] = it.y;
    _h.elements[14] = it.z;
    for (const m of it.meshes) {
      m.setMatrixAt(it.slot, _h);
      this.dirty.add(m);
    }
  }

  /**
   * movers: [{ x, z, vx, vz, r }] (things on the ground). Bends and tramples
   * what they touch; returns how much they are held back (0..1 per second).
   */
  update(dt, movers) {
    let drag = 0;
    const P = this.engine.particles;
    for (const M of movers || []) {
      const speed = Math.hypot(M.vx, M.vz);
      const reach = M.r + 1.2;
      for (let i = Math.floor((M.x - reach) / CELL); i <= Math.floor((M.x + reach) / CELL); i++) {
        for (let j = Math.floor((M.z - reach) / CELL); j <= Math.floor((M.z + reach) / CELL); j++) {
          const list = this.grid.get(`${i},${j}`);
          if (!list) continue;
          for (const idx of list) {
            const it = this.items[idx];
            const rb = 0.75 * it.s;
            const dx = it.x - M.x;
            const dz = it.z - M.z;
            const d = Math.hypot(dx, dz);
            const over = M.r + rb - d;
            if (over <= 0) continue;
            const deep = Math.min(1, over / (rb + 0.4));
            it.touch = 0.15;
            if (speed > 3.2 && deep > 0.35) {
              // Run over: pressed down and forward.
              const was = it.flat;
              it.flat = Math.min(1, it.flat + dt * speed * 0.3);
              it.tx = (M.vx / speed) * 0.7;
              it.tz = (M.vz / speed) * 0.7;
              if (was < 0.6 && it.flat >= 0.6 && P && P.dust) {
                for (let k = 0; k < 10; k++) {
                  P.dust.emit({ x: it.x + (Math.random() - 0.5), y: it.y + 0.5, z: it.z + (Math.random() - 0.5), vx: M.vx * 0.3 + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2.5, vz: M.vz * 0.3 + (Math.random() - 0.5) * 3, life: 1.1, size0: 0.14, size1: 0.1, color0: [0.3, 0.42, 0.16, 1], color1: [0.36, 0.36, 0.2, 0], gravity: 5, drag: 1.5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8 });
                }
              }
            } else {
              // Pushed slowly: the branches give way to the side.
              const k = (deep * 0.95) / Math.max(d, 0.2);
              it.tx = dx * k;
              it.tz = dz * k;
            }
            drag = Math.max(drag, (0.35 + 0.65 * (1 - it.flat)) * deep * it.s * 0.9);
            this.active.add(it);
          }
        }
      }
    }
    for (const it of this.active) {
      it.touch -= dt;
      const touching = it.touch > 0;
      const tx = touching ? it.tx : 0;
      const tz = touching ? it.tz : 0;
      const rate = touching ? 12 : 2.2;
      const a = 1 - Math.exp(-dt * rate);
      // A little overshoot when let go: springy branches.
      it.vxk = (it.vxk || 0) * Math.exp(-dt * 5) + (tx - it.kx) * a * (touching ? 0 : 2.5);
      it.vzk = (it.vzk || 0) * Math.exp(-dt * 5) + (tz - it.kz) * a * (touching ? 0 : 2.5);
      it.kx += (tx - it.kx) * a + it.vxk * dt;
      it.kz += (tz - it.kz) * a + it.vzk * dt;
      if (!touching && it.flat > 0) it.flat = Math.max(0, it.flat - dt * 0.012);
      this._matrix(it);
      if (!touching && it.flat === 0 && Math.abs(it.kx) + Math.abs(it.kz) < 0.004 && Math.abs(it.vxk) + Math.abs(it.vzk) < 0.004) {
        it.kx = 0;
        it.kz = 0;
        this._matrix(it);
        this.active.delete(it);
      }
    }
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    return drag;
  }
}
