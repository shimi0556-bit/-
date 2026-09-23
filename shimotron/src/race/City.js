import * as THREE from 'three';
import { buildLandmarks } from './CityLandmarks.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random, smoothstep } from '../engine/core/Random.js';
import { createCrowd } from './Humans.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Facade styles, and the storey height each one is drawn with. */
const S = { bauhaus: 0, stone: 1, office: 2, glass: 3, brick: 4 };
const FLOOR = [3.1, 3.3, 3.6, 3.9, 3.0];

const ADS = [
  { t: 'שימוטרון קולה', s: 'קרה כמו ניטרו', bg: '#c8102e', fg: '#ffffff' },
  { t: 'פלאפל הפודיום', s: 'מנה לאלופים · פתוח 24/7', bg: '#ffb020', fg: '#1b1202' },
  { t: 'בנק המהירות', s: 'משכנתא בלי עצירות בפיט', bg: '#0b3d91', fg: '#ffffff' },
  { t: 'הייפר 2026', s: '0–100 ב־2.4 שניות', bg: '#101014', fg: '#39d9ff' },
  { t: 'ביטוח נהיגה זהירה', s: 'המירוץ נגמר בקו הסיום', bg: '#1faa59', fg: '#ffffff' },
  { t: 'צמיגי אלופים', s: 'אחיזה בכל פנייה', bg: '#f2f2f2', fg: '#e0262b' },
  { t: 'קפה הפיט־סטופ', s: 'אספרסו ב־2.8 שניות', bg: '#3b2314', fg: '#ffcf7a' },
];

/**
 * A procedural Mediterranean city around the street circuit.
 *
 * plan() (before the terrain bake) lays out a rotated street grid, cuts
 * each block into four lots and decides what stands on them — buildings,
 * a park, a plaza — keeping clear of the circuit, the grandstand, a
 * tunnel and a footbridge; it also paints the ground urban.
 *
 * build() then draws: streets with markings, asphalt run-off and a raised
 * sidewalk along the circuit, paved lots; buildings in five styles (white
 * Bauhaus with ribbon balconies, Jerusalem stone, concrete offices, glass
 * towers, brick) through one facade shader — framed windows that reflect
 * the sky, blinds, lit rooms at dusk, shop fronts with sign bands —
 * with balconies, rooftop solar water heaters, AC units, awnings, masts
 * and billboards as instanced geometry; lamps, traffic lights, parked and
 * moving cars, spectators behind the catch fence, a tunnel under a
 * building, a footbridge, and the sound of the city.
 */
export class City {
  constructor(engine, terrain, track, stage, materials) {
    this.engine = engine;
    this.terrain = terrain;
    this.track = track;
    this.stage = stage;
    this.materials = materials;
    this.rng = new Random(stage.seed * 17 + 3);
    this.group = new THREE.Group();
    this.group.name = 'עיר';
    this.pitch = 62; // block + street
    this.block = 46;
    this.angle = 0.32;
    this.lotClear = 14.6; // buildings start just behind the circuit's sidewalk
    this.cars = [];
    this.time = 0;
    this.uniforms = { uLit: { value: 0 }, uGlow: { value: 1 }, uTime: { value: 0 }, uCheer: { value: 0.4 } };
  }

  // ------------------------------------------------------------ geometry helpers

  /** Grid → world. */
  _world(u, v, out = new THREE.Vector3()) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return out.set(u * c - v * s, 0, u * s + v * c);
  }

  /** World → grid. */
  _grid(x, z) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return [x * c + z * s, -x * s + z * c];
  }

  /** Distance past the road edge, or Infinity away from the track. */
  _clear(x, z) {
    const q = this.track.nearest(x, z, this._q || (this._q = {}));
    return q ? q.dist - this.track.W : Infinity;
  }

  _near(x, z) {
    return this.track.nearest(x, z, this._q2 || (this._q2 = {}));
  }

  /** The cell and lot under (x, z). */
  _lotAt(x, z) {
    if (!this.cells) return null;
    const [u, v] = this._grid(x, z);
    const P = this.pitch;
    const cell = this.cells.get(`${Math.floor(u / P)},${Math.floor(v / P)}`);
    if (!cell) return null;
    const lu = u - cell.u;
    const lv = v - cell.v;
    const L = this.block / 2;
    if (Math.abs(lu) > L || Math.abs(lv) > L) return { cell, lot: null };
    return { cell, lot: cell.lots[(lu > 0 ? 1 : 0) + (lv > 0 ? 2 : 0)] };
  }

  // ------------------------------------------------------------ plan

  /** Layout only (no meshes): runs before the terrain bake so the ground can be painted. */
  plan() {
    const t = this.terrain;
    const tr = this.track;
    const R = this.stage.island.radius;
    const P = this.pitch;
    const L = this.block / 2;
    const rng = this.rng;
    this.start = { x: tr.x[0], z: tr.z[0] };
    this._features();
    const n = Math.ceil((R * 1.15) / P);
    this.cells = new Map();
    this.lots = [];
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const cu = (i + 0.5) * P;
        const cv = (j + 0.5) * P;
        const c = this._world(cu, cv);
        const d = Math.hypot(c.x, c.z);
        if (d > R * 1.12) continue;
        const h = t.height(c.x, c.z);
        if (h < 1.8) continue;
        const cell = { i, j, u: cu, v: cv, c, y: h, d, lots: [] };
        for (const [a, b] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
        ]) {
          const lu = cu + a * L;
          const lv = cv + b * L;
          const p = this._world(lu, lv);
          const corners = [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([x, y]) => this._world(lu + x * L * 0.5, lv + y * L * 0.5));
          const ok = [p, ...corners].every((q) => this._lotOk(q.x, q.z));
          let kind = 'none';
          if (ok) {
            const r = rng.random();
            kind = r < 0.09 ? 'park' : r < 0.13 ? 'plaza' : 'building';
          }
          const lot = { u: lu, v: lv, p, d, y: Math.min(...corners.map((q) => t.height(q.x, q.z))), kind, cell };
          cell.lots.push(lot);
          if (kind !== 'none') this.lots.push(lot);
        }
        this.cells.set(`${i},${j}`, cell);
      }
    }
    this._landmarkPlan();
    return this;
  }

  /**
   * Landmarks, chosen with the lots (the ground under them is painted from
   * this): an arena on a whole block, a Ferris wheel in a park by the sea,
   * domed halls, building sites with cranes.
   */
  _landmarkPlan() {
    const rng = new Random(this.stage.seed * 7 + 19);
    const R = this.stage.island.radius;
    this.landmarks = { stadium: null, ferris: null, domes: [], cranes: [] };
    // Arena: a block of four building lots, mid-town, away from the circuit.
    let best = null;
    for (const cell of this.cells.values()) {
      if (cell.lots.length !== 4 || !cell.lots.every((l) => l.kind === 'building')) continue;
      if (cell.d < R * 0.3 || cell.d > R * 0.8) continue;
      const q = this._near(cell.c.x, cell.c.z);
      const clear = q ? q.dist : 999;
      if (clear < 60) continue;
      const score = clear + rng.random() * 40;
      if (!best || score > best.score) best = { cell, score };
    }
    if (best) {
      for (const l of best.cell.lots) l.kind = 'plaza';
      this.landmarks.stadium = best.cell;
    }
    // Ferris wheel: a park lot near the shore (or a building lot turned into one).
    const shore = this.lots.filter((l) => l.d > R * 0.7 && (l.kind === 'park' || l.kind === 'building') && l.cell !== best?.cell).sort((a, b) => b.d - a.d);
    if (shore.length) {
      const l = shore[Math.floor(rng.random() * Math.min(6, shore.length))];
      l.kind = 'park';
      this.landmarks.ferris = l;
    }
    // Domed halls and building sites.
    const pool = this.lots.filter((l) => l.kind === 'building' && l.d > R * 0.2 && l.d < R * 0.85);
    for (let k = 0; k < 3 && pool.length; k++) {
      const l = pool.splice(Math.floor(rng.random() * pool.length), 1)[0];
      l.landmark = 'dome';
      this.landmarks.domes.push(l);
    }
    for (let k = 0; k < 4 && pool.length; k++) {
      const l = pool.splice(Math.floor(rng.random() * pool.length), 1)[0];
      l.landmark = 'crane';
      this.landmarks.cranes.push(l);
    }
  }

  /** Room a building needs: behind the sidewalk, away from the grandstand, the tunnel and the footbridge. */
  _lotOk(x, z) {
    if (this.terrain.height(x, z) <= 1.8) return false;
    if (this.keepOut && this.keepOut(x, z)) return false; // a bridge lands here
    const q = this._near(x, z);
    if (q) {
      const c = q.dist - this.track.W;
      if (c < this.lotClear) return false;
      if (this.keepClear[q.i] && c < 30) return false;
      if (c < 34 && Math.hypot(x - this.start.x, z - this.start.z) < 150) return false;
    }
    return true;
  }

  /**
   * Picks the straightest stretch for a tunnel (170 m) and another for a
   * footbridge; marks them on the track so floodlight masts skip them.
   */
  _features() {
    const tr = this.track;
    const n = tr.n;
    const ds = tr.ds;
    const circ = (a, b) => Math.min(Math.abs(a - b), n - Math.abs(a - b));
    const pick = (len, avoid) => {
      const win = Math.round(len / ds);
      let best = -1;
      let bestK = Infinity;
      for (let c = 0; c < n; c += 2) {
        if (circ(c, 0) < 260 / ds + win / 2) continue;
        if (avoid.some((o) => circ(o, c) < win / 2 + 260 / ds)) continue;
        let k = 0;
        for (let d = -win / 2; d <= win / 2; d++) k += Math.abs(tr.kappa[(Math.round(c + d) + n) % n]);
        if (k < bestK) {
          bestK = k;
          best = c;
        }
      }
      return best;
    };
    const covered = new Uint8Array(n);
    const keep = new Uint8Array(n);
    const mark = (arr, c, half) => {
      for (let d = -Math.round(half / ds); d <= Math.round(half / ds); d++) arr[(c + d + n) % n] = 1;
    };
    this.tunnel = { c: pick(170, []), len: 170 };
    if (this.tunnel.c >= 0) {
      mark(covered, this.tunnel.c, 90);
      mark(keep, this.tunnel.c, 105);
    }
    this.bridge = { c: pick(24, [this.tunnel.c]) };
    if (this.bridge.c >= 0) {
      mark(covered, this.bridge.c, 8);
      mark(keep, this.bridge.c, 18);
    }
    tr.covered = covered;
    this.keepClear = keep;
  }

  _covered(x, z) {
    const q = this._near(x, z);
    return !!(q && this.track.covered[q.i] && q.dist < this.track.W + 18);
  }

  /** Ground paint: city blocks read as paving and tarmac; parks stay green. */
  splat(w, x, z) {
    const hit = this._lotAt(x, z);
    if (!hit) return w;
    if (hit.lot && hit.lot.kind === 'park') return { sand: 0, dirt: 0.08, rock: 0 };
    return { sand: 0, dirt: 0.92, rock: 0 };
  }

  /** True where vegetation must not grow. Parks and plazas are green; the circuit's sidewalk gets street trees. */
  blocked(x, z, kind) {
    const hit = this._lotAt(x, z);
    if (!hit) return false;
    if (hit.lot && this.landmarks && (hit.lot === this.landmarks.ferris || hit.lot.cell === this.landmarks.stadium) && kind !== 'grass') return true;
    if (hit.lot && (hit.lot.kind === 'park' || (hit.lot.kind === 'plaza' && kind !== 'grass'))) return false;
    if (kind === 'grass') return true;
    const c = this._clear(x, z);
    if (c > 8 && c < 13.6 && !this._covered(x, z)) return false;
    return true;
  }

  /** Street trees down the middle of the circuit's sidewalk, every ~21 m, clear of the grid, the tunnel and the bridge. */
  treeSpots() {
    const tr = this.track;
    const out = [];
    const step = Math.round(21 / tr.ds);
    for (let i = 0; i < tr.n; i += step) {
      if (tr.covered[i]) continue;
      if (Math.min(i, tr.n - i) * tr.ds < 130) continue;
      for (const side of [-1, 1]) {
        const lat = side * (tr.W + 11.4);
        const x = tr.x[i] - tr.tz[i] * lat;
        const z = tr.z[i] + tr.tx[i] * lat;
        if (this._clear(x, z) < 9.5) continue;
        out.push({ x, z });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ build

  build() {
    if (!this.cells) this.plan();
    const T = this.materials.textures;
    this.paving = new THREE.MeshStandardMaterial({ name: 'מדרכה', color: 0xc9c4ba, roughness: 0.86, metalness: 0 });
    this.materials.triplanar(this.paving, T.tiles, T.tilesNormal, 0.42, 0.6);
    this.tarmac = new THREE.MeshStandardMaterial({ name: 'אספלט עירוני', map: T.asphalt, normalMap: T.asphaltNormal, normalScale: new THREE.Vector2(0.3, 0.3), color: 0xc4c4c4, roughness: 0.88, metalness: 0 });
    this._streets();
    this._trackside();
    this._lotSlabs();
    this._buildings();
    this.landmarkFx = buildLandmarks(this);
    this._billboards();
    this._lamps();
    this._trafficLights();
    this._traffic();
    this._parked();
    this._spectators();
    this._tunnel();
    this._footbridge();
    return this.group;
  }

  _inst(geo, material, items, name, { cast = true, receive = true, color = true } = {}) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, k) => {
      mesh.setMatrixAt(k, it.m);
      if (color && it.c) mesh.setColorAt(k, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = name;
    mesh.userData.noPick = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Matrix for a box on a building: local offset (lx, ly, lz) from its base centre, turned with it. */
  _onBuilding(b, lx, ly, lz, sx, sy, sz, tilt = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, b.yaw);
    _v.set(lx, ly, lz).applyQuaternion(q);
    if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
    return new THREE.Matrix4().compose(new THREE.Vector3(b.x + _v.x, b.y + _v.y, b.z + _v.z), q, new THREE.Vector3(sx, sy, sz));
  }

  // ------------------------------------------------------------ ground

  /** Tarmac over every block cell (lane lines, stop lines, zebra crossings); stops at the circuit and under slabs and parks. */
  _streets() {
    const t = this.terrain;
    const P = this.pitch;
    const L = this.block / 2;
    const seg = 10;
    const pos = [];
    const uv = [];
    const vert = (u, v) => {
      const p = this._world(u, v);
      const h = t.heightAt(p.x, p.z);
      return { x: p.x, y: h + 0.14, z: p.z, u, v, ok: this._clear(p.x, p.z) > 7 && h > 0.8 };
    };
    for (const cell of this.cells.values()) {
      const grid = [];
      for (let a = 0; a <= seg; a++) {
        const row = [];
        for (let c = 0; c <= seg; c++) row.push(vert(cell.u - P / 2 + (a / seg) * P, cell.v - P / 2 + (c / seg) * P));
        grid.push(row);
      }
      for (let a = 0; a < seg; a++) {
        for (let c = 0; c < seg; c++) {
          const q = [grid[a][c], grid[a + 1][c], grid[a][c + 1], grid[a + 1][c + 1]];
          const mu = (q[0].u + q[3].u) / 2 - cell.u;
          const mv = (q[0].v + q[3].v) / 2 - cell.v;
          if (Math.abs(mu) < L - 1 && Math.abs(mv) < L - 1) {
            const lot = cell.lots[(mu > 0 ? 1 : 0) + (mv > 0 ? 2 : 0)];
            if (lot.kind !== 'none') continue;
          }
          for (const tri of [
            [q[0], q[2], q[1]],
            [q[1], q[2], q[3]],
          ]) {
            if (!tri.every((p) => p.ok)) continue;
            for (const p of tri) {
              pos.push(p.x, p.y, p.z);
              uv.push(p.u, p.v);
            }
          }
        }
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const T = this.materials.textures;
    const mat = new THREE.MeshStandardMaterial({ name: 'רחובות', map: T.asphalt, color: 0x8c8c8c, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPitch = { value: P };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGrid;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrid = uv;\nvMapUv = uv / 2.5;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGrid; uniform float uPitch;').replace(
        '#include <map_fragment>',
        `#include <map_fragment>
          {
            vec2 c = vGrid / uPitch;
            vec2 e = abs(fract(c + 0.5) - 0.5) * uPitch; // metres from the nearest street centre line
            vec2 aw = fwidth(vGrid) * 1.2 + 0.01;
            float inter = step(e.x, 8.0) * step(e.y, 8.0);
            float lx = (1.0 - smoothstep(0.12, 0.12 + aw.x, e.x)) * step(fract(vGrid.y / 6.0), 0.5);
            float ly = (1.0 - smoothstep(0.12, 0.12 + aw.y, e.y)) * step(fract(vGrid.x / 6.0), 0.5);
            float lines = max(lx, ly) * (1.0 - inter);
            float zx = step(8.5, e.y) * step(e.y, 11.5) * step(e.x, 6.5) * step(0.5, fract(vGrid.x / 1.2));
            float zy = step(8.5, e.x) * step(e.x, 11.5) * step(e.y, 6.5) * step(0.5, fract(vGrid.y / 1.2));
            float stop = step(11.8, e.y) * step(e.y, 12.3) * step(e.x, 6.5) + step(11.8, e.x) * step(e.x, 12.3) * step(e.y, 6.5);
            float paint = max(lines, max(max(zx, zy) * 0.9, stop));
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.82, 0.8, 0.72), paint);
          }`,
      );
    };
    mat.customProgramCacheKey = () => 'city-streets';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'רחובות';
    mesh.userData.noPick = true;
    this.group.add(mesh);
  }

  /**
   * Along the circuit: tarmac run-off from the road edge to the barrier
   * (street circuits have no gravel), then a raised, kerbed sidewalk up to
   * the building line.
   */
  _trackside() {
    const tr = this.track;
    const t = this.terrain;
    const W = tr.W;
    const n = tr.n;
    const ribbon = (profile, material, name) => {
      const pos = [];
      const uv = [];
      const idx = [];
      const cols = profile.length;
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        let rows = 0;
        for (let i = 0; i <= n; i += 2) {
          const k = i % n;
          const rx = -tr.tz[k] * side;
          const rz = tr.tx[k] * side;
          for (const [lat, lift] of profile) {
            const x = tr.x[k] + rx * lat;
            const z = tr.z[k] + rz * lat;
            pos.push(x, Math.max(t.heightAt(x, z), t.height(x, z)) + lift, z);
            uv.push((i * tr.ds) / 2.5, lat / 2.5); // same 2.5 m tiles as the road
          }
          if (rows) {
            for (let c = 0; c < cols - 1; c++) {
              const a = base + (rows - 1) * cols + c;
              const b = a + cols;
              // Wound so the faces look up on both sides of the road.
              if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
              else idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
          }
          rows++;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.name = name;
      mesh.userData.noPick = true;
      this.group.add(mesh);
    };
    ribbon(
      [
        [W + 0.2, 0.03],
        [W + 3.2, 0.03],
        [W + 6.4, 0.03],
      ],
      this.tarmac,
      'אספלט מילוט',
    );
    ribbon(
      [
        [W + 6.8, 0.02],
        [W + 6.8, 0.17],
        [W + 7.0, 0.19],
        [W + 10.5, 0.19],
        [W + this.lotClear, 0.19],
        [W + this.lotClear + 0.2, 0.02],
      ],
      this.paving,
      'מדרכה לאורך המסלול',
    );
  }

  /** Paved slabs (kerbed) under every building and plaza lot. */
  _lotSlabs() {
    const L = this.block / 2;
    const items = [];
    _q.setFromAxisAngle(UP, this.angle);
    for (const lot of this.lots) {
      if (lot.kind === 'park') continue;
      items.push({ m: new THREE.Matrix4().compose(_p.set(lot.p.x, lot.y - 0.15, lot.p.z), _q, _s.set(L + 0.3, 0.38, L + 0.3)) });
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this._inst(geo, this.paving, items, 'מדרכות', { cast: false, color: false });
  }

  // ------------------------------------------------------------ buildings

  _buildings() {
    const rng = this.rng;
    const R = this.stage.island.radius;
    const L = this.block / 2;
    const main = [];
    const palette = {
      [S.bauhaus]: [0xf1ede4, 0xe9e4d8, 0xf4f1ea, 0xe6dfcf],
      [S.stone]: [0xd9c7a2, 0xe0cfaa, 0xcdb994, 0xd6c29c],
      [S.office]: [0xa9abad, 0x9c9fa3, 0xb5b3ad, 0x8e949b],
      [S.glass]: [0x6f8fa6, 0x7a9aa8, 0x5e7f94, 0x8aa3b0],
      [S.brick]: [0xa0553a, 0x8f4b35, 0xb0654a, 0x7e4636],
    };
    const pick = (style) => new THREE.Color(rng.pick(palette[style]));
    const add = (b) => {
      b.yaw = b.yaw ?? this.angle;
      main.push(b);
      return b;
    };
    this.towers = [];
    this.residential = [];
    this.roundTowers = [];
    this.tileRoofs = [];
    const pastel = [0xf2c6c2, 0xf5e0a3, 0xbfe0cf, 0xbcd6ec, 0xe8b894, 0xf0d4e6, 0xd7e8a8, 0xf7efe0];
    for (const lot of this.lots) {
      if (lot.kind !== 'building' || lot.landmark) continue;
      const down = 1 - smoothstep(0, R * 0.75, lot.d);
      const baseY = lot.y + 0.2;
      const r = rng.random();
      if (r < 0.03 + 0.2 * down * down) {
        // Tower on a podium, stepped crown, mast.
        const glass = rng.random() < 0.7;
        const podStyle = glass ? S.glass : S.office;
        const w = L - rng.range(2, 3.5);
        const d = L - rng.range(2, 3.5);
        const pod = add({ x: lot.p.x, y: baseY, z: lot.p.z, w, d, h: FLOOR[podStyle] * 3 + 0.6, style: podStyle, col: pick(podStyle) });
        const style = glass ? S.glass : rng.random() < 0.5 ? S.office : S.stone;
        const floors = Math.round(12 + down * down * rng.range(8, 38) + rng.range(0, 6));
        const tw = w * rng.range(0.7, 0.92);
        const td = d * rng.range(0.7, 0.92);
        const col = pick(style);
        if (rng.random() < 0.35) {
          // A round glass tower instead of a box.
          const h = floors * 3.9 + 1.2;
          this.roundTowers.push({ x: lot.p.x, y: baseY + pod.h, z: lot.p.z, r: Math.min(tw, td) / 2, h, col: new THREE.Color(rng.pick([0x5f8aa6, 0x6f9fb0, 0x4f7896, 0x7fa0a8, 0x8a9aa6])), twist: rng.random() < 0.5 });
          this.towers.push({ x: lot.p.x, z: lot.p.z, top: baseY + pod.h + h });
          continue;
        }
        const tower = add({ x: lot.p.x, y: baseY + pod.h, z: lot.p.z, w: tw, d: td, h: floors * FLOOR[style] + 1.2, style, col });
        const crown = add({ x: lot.p.x, y: tower.y + tower.h, z: lot.p.z, w: tw * 0.72, d: td * 0.72, h: FLOOR[style] * rng.range(2, 4) + 1, style, col });
        this.towers.push({ x: crown.x, z: crown.z, top: crown.y + crown.h });
      } else if (down > 0.3 && r < 0.45) {
        // Mid-rise office or stone block.
        const style = rng.random() < 0.55 ? S.office : S.stone;
        const w = L - rng.range(1.5, 3.5);
        const d = L - rng.range(1.5, 3.5);
        const b = add({ x: lot.p.x, y: baseY, z: lot.p.z, w, d, h: Math.round(rng.range(8, 16)) * FLOOR[style] + 1.1, style, col: pick(style) });
        this._roofKit(b, false);
      } else {
        // Residential: often two buildings side by side on one lot.
        const style = rng.random() < 0.46 ? S.bauhaus : rng.random() < 0.65 ? S.stone : S.brick;
        const split = rng.random() < 0.45;
        const parts = split ? [-1, 1] : [0];
        const full = L - rng.range(1.5, 3);
        for (const k of parts) {
          const st = split && rng.random() < 0.35 ? rng.pick([S.bauhaus, S.stone, S.brick]) : style;
          const w = split ? full / 2 - 0.4 : full;
          const d = L - rng.range(1.5, 3.2);
          const floors = Math.round(rng.range(4, 8) + down * rng.range(0, 5));
          _v.set(k * (w / 2 + 0.4), 0, 0).applyAxisAngle(UP, this.angle);
          // Some homes painted in soft colours; low ones often under red tiles.
          const col = st !== S.brick && rng.random() < 0.34 ? new THREE.Color(rng.pick(pastel)) : pick(st);
          const low = floors <= 6 && rng.random() < 0.45;
          const b = add({ x: lot.p.x + _v.x, y: baseY, z: lot.p.z + _v.z, w, d, h: (low ? Math.min(floors, 4) : floors) * FLOOR[st] + 1.1, style: st, col, floors });
          this.residential.push(b);
          if (low) this.tileRoofs.push(b);
          else this._roofKit(b, true);
        }
      }
    }
    // The building the tunnel runs under.
    if (this.tunnel && this.tunnel.c >= 0) {
      const tr = this.track;
      const n = tr.n;
      const half = Math.round((this.tunnel.len * 0.42) / tr.ds);
      const a = (this.tunnel.c - half + n) % n;
      const b = (this.tunnel.c + half) % n;
      const i = this.tunnel.c;
      const len = Math.hypot(tr.x[b] - tr.x[a], tr.z[b] - tr.z[a]);
      const yaw = Math.atan2(tr.x[b] - tr.x[a], tr.z[b] - tr.z[a]);
      const top = Math.max(tr.h[a], tr.h[i], tr.h[b]) + 8.4;
      const hotel = add({ x: (tr.x[a] + tr.x[b]) / 2, y: top, z: (tr.z[a] + tr.z[b]) / 2, w: 2 * (tr.W + 16), d: len, h: 9 * FLOOR[S.stone] + 1.2, style: S.stone, col: new THREE.Color(0xe3d3ad), yaw });
      this._roofKit(hotel, false);
      this.hotel = hotel;
      // Its ground floors, either side of the tunnel walls, so it stands rather than floats.
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      for (const s of [-1, 1]) {
        const lat = s * (tr.W + 12.2);
        const bx = hotel.x + rx * lat;
        const bz = hotel.z + rz * lat;
        const gy = this.terrain.heightAt(bx, bz) + 0.2;
        add({ x: bx, y: gy, z: bz, w: 7.8, d: len, h: top - gy, style: S.stone, col: hotel.col, yaw });
      }
    }
    this.buildings = main;
    // One instanced mesh, one facade shader; style per instance.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const styles = new Float32Array(main.length);
    main.forEach((b, k) => (styles[k] = b.style));
    boxGeo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 1));
    const items = main.map((b) => {
      _q.setFromAxisAngle(UP, b.yaw);
      return { m: new THREE.Matrix4().compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.w, b.h, b.d)), c: b.col };
    });
    this._inst(boxGeo, this._facadeMaterial(), items, 'בניינים');
    this._balconies();
    this._wallUnits();
    this._awnings();
    this._flushRoofKit();
    this._masts();
    this.buildingCount = main.length;
  }

  /** Rooftop clutter: stair/lift housings, and on homes solar water heaters and AC condensers. */
  _roofKit(b, home) {
    const rng = this.rng;
    const k = (this._kit = this._kit || { box: [], panel: [], tank: [], ac: [] });
    const top = b.h;
    if (b.h > 14) k.box.push({ m: this._onBuilding(b, rng.range(-b.w, b.w) * 0.2, top, rng.range(-b.d, b.d) * 0.2, rng.range(2.4, 3.6), rng.range(2.6, 3.4), rng.range(2.2, 3.2)), c: b.col });
    if (home) {
      const heaters = Math.min(6, Math.max(2, Math.floor((b.w * b.d) / 55)));
      for (let i = 0; i < heaters; i++) {
        const lx = ((i % 3) - 1) * b.w * 0.28 + rng.range(-0.3, 0.3);
        const lz = (Math.floor(i / 3) - 1) * b.d * 0.26 + rng.range(-0.3, 0.3);
        k.panel.push({ m: this._onBuilding(b, lx, top + 0.75, lz, 1.05, 0.06, 1.9, -0.55) });
        k.tank.push({ m: this._onBuilding(b, lx, top + 1.45, lz - 1.05, 1.5, 0.52, 0.52) });
      }
    }
    const acs = Math.floor(rng.range(1, home ? 5 : 8));
    for (let i = 0; i < acs; i++) k.ac.push({ m: this._onBuilding(b, rng.range(-b.w, b.w) * 0.38, top, rng.range(-b.d, b.d) * 0.38, 0.95, 0.75, 0.42) });
  }

  _flushRoofKit() {
    const k = this._kit;
    if (!k) return;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const center = new THREE.BoxGeometry(1, 1, 1);
    const tank = new THREE.CylinderGeometry(0.5, 0.5, 1, 7, 1, true);
    tank.rotateZ(Math.PI / 2);
    const housing = new THREE.MeshStandardMaterial({ name: 'חדר מדרגות', color: 0xffffff, roughness: 0.85 });
    const panel = new THREE.MeshStandardMaterial({ name: 'קולט שמש', color: 0x1a2a46, roughness: 0.22, metalness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ name: 'דוד שמש', color: 0xe8e6e0, roughness: 0.5, metalness: 0.2 });
    const ac = new THREE.MeshStandardMaterial({ name: 'מזגן', color: 0xd3d5d6, roughness: 0.6, metalness: 0.15 });
    this._inst(box, housing, k.box, 'חדרי מדרגות');
    this._inst(center, panel, k.panel, 'קולטי שמש', { color: false });
    this._inst(tank, white, k.tank, 'דודי שמש', { color: false, cast: false });
    this._inst(box, ac, k.ac, 'מזגנים על הגג', { color: false, cast: false });
  }

  /** Balconies: long solid white bands on Bauhaus homes, pairs with iron railings on stone ones. */
  _balconies() {
    const slabs = [];
    const rails = [];
    const iron = [];
    for (const b of this.residential) {
      if (b.style === S.brick) continue;
      const fh = FLOOR[b.style];
      const floors = b.floors || Math.floor(b.h / fh);
      for (const face of [-1, 1]) {
        for (let f = 1; f < floors; f++) {
          const y = f * fh;
          if (b.style === S.bauhaus) {
            const len = b.w * 0.86;
            slabs.push({ m: this._onBuilding(b, 0, y - 0.08, face * (b.d / 2 + 0.7), len, 0.18, 1.4), c: b.col });
            rails.push({ m: this._onBuilding(b, 0, y + 0.1, face * (b.d / 2 + 1.34), len, 1.0, 0.12), c: b.col });
          } else {
            for (const x of [-0.26, 0.26]) {
              slabs.push({ m: this._onBuilding(b, x * b.w, y - 0.08, face * (b.d / 2 + 0.55), b.w * 0.3, 0.16, 1.1), c: b.col });
              iron.push({ m: this._onBuilding(b, x * b.w, y + 0.1, face * (b.d / 2 + 1.07), b.w * 0.3, 0.95, 0.04) });
            }
          }
        }
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const plaster = new THREE.MeshStandardMaterial({ name: 'מרפסות', color: 0xffffff, roughness: 0.85 });
    this._inst(box, plaster, slabs, 'מרפסות');
    this._inst(box, plaster, rails, 'מעקות מרפסת');
    const railMat = new THREE.MeshStandardMaterial({ name: 'מעקה ברזל', color: 0x26282b, roughness: 0.5, metalness: 0.6 });
    this._inst(box, railMat, iron, 'מעקות ברזל', { color: false, cast: false });
  }

  /** Air-conditioner units hung on the side walls under windows. */
  _wallUnits() {
    const rng = this.rng;
    const items = [];
    for (const b of this.buildings) {
      if (b.style === S.glass || b.h > 45) continue;
      const fh = FLOOR[b.style];
      const floors = Math.floor((b.h - 1.1) / fh);
      const count = Math.floor(rng.range(0, Math.min(10, floors * 1.4)));
      for (let i = 0; i < count; i++) {
        const f = 2 + Math.floor(rng.random() * Math.max(1, floors - 2));
        const side = rng.random() < 0.5 ? -1 : 1;
        items.push({ m: this._onBuilding(b, side * (b.w / 2 + 0.2), f * fh + 0.25, rng.range(-0.38, 0.38) * b.d, 0.36, 0.55, 0.85) });
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ name: 'מזגנים', color: 0xdcdedf, roughness: 0.6 });
    this._inst(box, mat, items, 'מזגנים', { color: false, cast: false });
  }

  /** Shop awnings over the ground floor, street side. */
  _awnings() {
    const rng = this.rng;
    const items = [];
    const cols = [0xc8102e, 0x1f6fe0, 0x1faa59, 0xf2c230, 0x8a4dff, 0xff7a1a, 0x2b2b2b, 0xe8e8ea];
    for (const b of this.buildings) {
      if (b.style === S.glass || b === this.hotel || rng.random() > 0.65) continue;
      const n = Math.max(1, Math.floor(b.w / 5));
      for (const face of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          if (rng.random() < 0.3) continue;
          const x = (i + 0.5) * (b.w / n) - b.w / 2;
          items.push({ m: this._onBuilding(b, x, 3.3, face * (b.d / 2 + 0.7), b.w / n - 0.8, 0.07, 1.45, face * 0.28), c: new THREE.Color(rng.pick(cols)) });
        }
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ name: 'סוככים', color: 0xffffff, roughness: 0.9 });
    this._inst(box, mat, items, 'סוככים');
  }

  /** Antenna masts with blinking aviation lights on the tall towers. */
  _masts() {
    const rng = this.rng;
    const masts = [];
    const beacons = [];
    for (const t of this.towers) {
      const h = rng.range(8, 22);
      masts.push({ m: new THREE.Matrix4().compose(_p.set(t.x, t.top, t.z), _q.identity(), _s.set(1, h, 1)) });
      beacons.push({ m: new THREE.Matrix4().setPosition(t.x, t.top + h, t.z) });
    }
    const mastGeo = new THREE.CylinderGeometry(0.15, 0.3, 1, 6);
    mastGeo.translate(0, 0.5, 0);
    this._inst(mastGeo, this.materials.lib.iron, masts, 'אנטנות', { color: false });
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 1 });
    this.materials.trackEmissive(beaconMat, 2);
    this.beaconMat = beaconMat;
    this._inst(new THREE.SphereGeometry(0.35, 8, 6), beaconMat, beacons, 'אורות אזהרה', { color: false, cast: false });
  }

  /**
   * Facade shader: per style, storeys and window bays with frames, sills
   * and glass that reflects the sky (metallic, glossy), blinds in some
   * windows, rooms lit after sunset, a ground floor of shop fronts with
   * sign bands, stone courses and brickwork, grime towards the ground;
   * far away the window grid folds into its average so it never shimmers.
   */
  _facadeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, name: 'חזיתות' });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aStyle;\nvarying vec3 vBLocal; varying vec3 vBSize; varying vec3 vBN; varying float vBSeed; varying float vBStyle;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vBLocal = position;
          vBN = normal;
          vBStyle = aStyle;
          #ifdef USE_INSTANCING
            vBSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vBSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #else
            vBSize = vec3(1.0); vBSeed = 0.0;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uLit; uniform float uGlow; uniform float uTime;
          varying vec3 vBLocal; varying vec3 vBSize; varying vec3 vBN; varying float vBSeed; varying float vBStyle;
          float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
          float bNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y); }
          float bGlass; float bLit; vec3 bLight; float bRough; float bMetal; vec3 bSign;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            bGlass = 0.0; bLit = 0.0; bLight = vec3(0.0); bRough = 0.85; bMetal = 0.0; bSign = vec3(0.0);
            int S = int(vBStyle + 0.5);
            vec3 n = vBN;
            vec3 base = diffuseColor.rgb;
            if (abs(n.y) < 0.5) {
              bool side = abs(n.x) > 0.5;
              float faceW = side ? vBSize.z : vBSize.x;
              float u = (side ? vBLocal.z : vBLocal.x) * faceW + faceW * 0.5;
              float v = vBLocal.y * vBSize.y;
              float H = vBSize.y;
              float fh = S == 0 ? 3.1 : S == 1 ? 3.3 : S == 2 ? 3.6 : S == 3 ? 3.9 : 3.0;
              float bay = S == 0 ? 3.6 : S == 1 ? 2.6 : S == 2 ? 1.6 : S == 3 ? 1.5 : 2.4;
              float ww = S == 0 ? 0.88 : S == 1 ? 0.44 : S == 2 ? 0.94 : S == 3 ? 0.96 : 0.42;
              float wh = S == 0 ? 0.44 : S == 1 ? 0.54 : S == 2 ? 0.48 : S == 3 ? 0.9 : 0.5;
              float sill = S == 0 ? 0.33 : S == 1 ? 0.24 : S == 2 ? 0.3 : S == 3 ? 0.05 : 0.27;
              float nb = max(1.0, floor(faceW / bay + 0.5));
              float bw = faceW / nb;
              vec2 cell = vec2(u / bw, v / fh);
              vec2 f = fract(cell);
              vec2 id = floor(cell) + vec2(side ? 57.0 : 0.0, 0.0) + vBSeed * 97.0;
              float px = max(fwidth(u), fwidth(v)); // metres per pixel
              // Window opening, in metres from its edges (negative inside), with a 9 cm frame.
              float dx = (abs(f.x - 0.5) - ww * 0.5) * bw;
              float dy = max(sill - f.y, f.y - sill - wh) * fh;
              float inside = max(dx, dy);
              float groundH = S == 3 ? 6.0 : 4.3;
              float band = step(v, H - 1.1) * step(groundH, v);
              float win = (1.0 - smoothstep(-px, px, inside)) * band;
              float frame = win * (1.0 - smoothstep(-0.09 - px, -0.09 + px, inside));
              // Wall surface.
              float grain = bNoise(vec2(u, v) * 1.7) * 0.5 + bNoise(vec2(u, v) * 0.21) * 0.5;
              vec3 wall = base * (0.9 + 0.12 * grain);
              float fine = 1.0 - smoothstep(0.015, 0.05, px);
              if (S == 1) {
                float row = floor(v / 0.55);
                float bxf = u / 1.15 + mod(row, 2.0) * 0.5;
                float joint = max(1.0 - smoothstep(0.0, 0.03, fract(bxf)), 1.0 - smoothstep(0.0, 0.06, fract(v / 0.55))) * fine;
                wall *= (0.93 + 0.13 * bHash(vec2(floor(bxf), row))) * (1.0 - joint * 0.22);
              } else if (S == 4) {
                float row = floor(v / 0.075);
                float bxf = u / 0.24 + mod(row, 2.0) * 0.5;
                float joint = max(1.0 - smoothstep(0.0, 0.1, fract(bxf)), 1.0 - smoothstep(0.0, 0.16, fract(v / 0.075))) * (1.0 - smoothstep(0.004, 0.02, px));
                wall *= (0.86 + 0.24 * bHash(vec2(floor(bxf), row))) * (1.0 - joint * 0.3);
              } else if (S == 2) {
                wall *= 0.96 - 0.1 * step(0.93, f.y) + 0.05 * step(f.y, 0.06);
              } else if (S == 0) {
                wall *= 1.0 + 0.05 * (1.0 - smoothstep(0.0, 0.22, f.y * fh));
              } else {
                wall = mix(vec3(0.05, 0.07, 0.09), base * 0.55, 0.3);
              }
              wall *= 0.8 + 0.2 * smoothstep(0.0, 3.0, v);
              wall *= 1.0 - 0.1 * smoothstep(0.55, 0.95, bNoise(vec2(u * 0.9, v * 0.05 + vBSeed * 13.0)));
              // Glass, blinds, lit rooms.
              float h1 = bHash(id);
              float h2 = bHash(id * 1.37 + 3.1);
              vec3 glass = S == 3 ? vec3(0.07, 0.11, 0.14) : vec3(0.045, 0.05, 0.056);
              float rel = (f.y - sill) / wh;
              float blind = (S == 3 ? 0.0 : step(h2, 0.38)) * step(1.0 - fract(h2 * 7.1) * 0.8, rel);
              float litShare = 0.14 + 0.32 * uLit;
              float lit = step(1.0 - litShare, h1) * uLit;
              bLight = mix(vec3(1.0, 0.64, 0.32), vec3(0.72, 0.84, 1.0), step(0.74, h2)) * (0.5 + 0.5 * fract(h1 * 13.7));
              vec3 blindCol = vec3(0.8, 0.75, 0.66);
              vec3 frameCol = S == 3 ? vec3(0.5, 0.53, 0.57) : S == 0 ? vec3(0.92) : vec3(0.16, 0.16, 0.18);
              vec3 pane = mix(glass, blindCol, blind);
              vec3 col = mix(wall, mix(pane, frameCol, frame), win);
              float pure = win * (1.0 - frame);
              bGlass = pure * (1.0 - blind);
              bLit = pure * lit * (blind > 0.5 ? 0.45 : 1.0);
              // Ground floor: shop fronts, lit inside, with a sign band.
              if (v < groundH) {
                float sb = S == 3 ? 3.0 : 5.0;
                float sx = fract(u / sb);
                float sid = bHash(vec2(floor(u / sb), vBSeed * 31.0));
                float shopWin = (1.0 - smoothstep(0.44 - px / sb, 0.44, abs(sx - 0.5))) * step(0.35, v) * step(v, S == 3 ? 5.4 : 3.1);
                float sign = S == 3 ? 0.0 : step(3.3, v) * step(v, 4.0) * step(abs(sx - 0.5), 0.46);
                vec3 signCol = 0.5 + 0.5 * cos(6.2831 * (sid + vec3(0.0, 0.33, 0.67)));
                col = mix(col, vec3(0.07, 0.07, 0.075), shopWin);
                col = mix(col, signCol * 0.85, sign);
                bGlass = max(bGlass, shopWin);
                bLit = max(bLit, shopWin * step(0.25, sid) * (0.3 + 0.7 * uLit));
                bLight = mix(bLight, vec3(1.0, 0.86, 0.66), shopWin);
                bSign = signCol * sign * (0.25 + 0.75 * uLit);
              }
              // Sub-pixel window grid: settle on its average.
              float far = smoothstep(0.12, 0.3, px / min(bw, fh)) * band;
              vec3 avg = mix(wall, glass * 1.4, ww * wh * 0.85);
              col = mix(col, avg, far);
              bGlass = mix(bGlass, ww * wh * 0.8, far);
              bLit = mix(bLit, litShare * uLit * ww * wh, far);
              bLight = mix(bLight, vec3(0.95, 0.7, 0.44), far);
              diffuseColor.rgb = col;
              bRough = mix(S == 3 ? 0.4 : 0.88, S == 3 ? 0.04 : 0.1, bGlass);
              bMetal = bGlass * (S == 3 ? 0.92 : 0.6);
            } else if (n.y > 0.5) {
              diffuseColor.rgb = vec3(0.33, 0.33, 0.34) * (0.8 + 0.3 * bNoise(vBLocal.xz * vBSize.xz * 0.8));
            }
          }`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = bRough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = bMetal;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (bLight * bLit + bSign * 0.8) * uGlow;');
    };
    mat.customProgramCacheKey = () => 'city-facade-v2';
    return mat;
  }

  /** Rooftop billboards on the buildings nearest the circuit, turned to face it; lit after dusk. */
  _billboards() {
    const cands = this.buildings
      .filter((b) => b.h > 10 && b.h < 45 && b !== this.hotel)
      .map((b) => ({ b, c: this._clear(b.x, b.z) }))
      .filter((x) => x.c < 45)
      .sort((a, b) => a.c - b.c);
    const chosen = [];
    for (const x of cands) {
      if (chosen.length >= 7) break;
      if (chosen.some((o) => Math.hypot(o.b.x - x.b.x, o.b.z - x.b.z) < 160)) continue;
      chosen.push(x);
    }
    this.boardMats = [];
    const legGeo = new THREE.BoxGeometry(0.25, 1, 0.25);
    legGeo.translate(0, 0.5, 0);
    const legs = [];
    chosen.forEach(({ b }, k) => {
      const ad = ADS[k % ADS.length];
      const cv = document.createElement('canvas');
      cv.width = 768;
      cv.height = 256;
      const g = cv.getContext('2d');
      g.fillStyle = ad.bg;
      g.fillRect(0, 0, 768, 256);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, 0, 768, 110);
      g.direction = 'rtl';
      g.textAlign = 'center';
      g.fillStyle = ad.fg;
      g.font = '700 118px Karantina, "IBM Plex Sans Hebrew", sans-serif';
      g.fillText(ad.t, 384, 130);
      g.font = '600 40px "IBM Plex Sans Hebrew", sans-serif';
      g.fillText(ad.s, 384, 205);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.55 });
      this.materials.trackEmissive(mat, 0.1);
      this.boardMats.push(mat);
      const q = this._near(b.x, b.z);
      const yaw = Math.atan2(this.track.x[q.i] - b.x, this.track.z[q.i] - b.z);
      const W = 14;
      const H = W / 3;
      const top = b.y + b.h;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      board.position.set(b.x, top + 2.2 + H / 2, b.z);
      board.rotation.y = yaw;
      board.castShadow = true;
      board.name = 'שלט פרסומת';
      this.group.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.2), this.materials.lib.darkMetal || this.materials.lib.iron);
      back.position.set(b.x - Math.sin(yaw) * 0.12, board.position.y, b.z - Math.cos(yaw) * 0.12);
      back.rotation.y = yaw;
      this.group.add(back);
      for (const s of [-0.35, 0.35]) {
        _p.set(b.x + Math.cos(yaw) * s * W, top, b.z - Math.sin(yaw) * s * W);
        legs.push({ m: new THREE.Matrix4().compose(_p, _q.identity(), _s.set(1, 2.3, 1)) });
      }
    });
    this._inst(legGeo, this.materials.lib.iron, legs, 'רגלי שלטים', { color: false });
  }

  // ------------------------------------------------------------ street furniture

  _built(cell) {
    return cell.lots.some((l) => l.kind !== 'none');
  }

  _lamps() {
    const poles = [];
    const heads = [];
    const half = this.block / 2 + 1.2;
    for (const cell of this.cells.values()) {
      if (!this._built(cell)) continue;
      for (const [a, c] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const p = this._world(cell.u + a * half, cell.v + c * half);
        if (this._clear(p.x, p.z) < 9) continue;
        const y = this.terrain.heightAt(p.x, p.z);
        poles.push({ m: new THREE.Matrix4().setPosition(p.x, y, p.z) });
        heads.push({ m: new THREE.Matrix4().setPosition(p.x, y + 7.2, p.z) });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.4, 6);
    poleGeo.translate(0, 3.7, 0);
    const headGeo = new THREE.SphereGeometry(0.32, 6, 4); // tiny and emissive: a few facets are plenty
    const headMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.materials.trackEmissive(headMat, 0);
    this.lampMat = headMat;
    this._inst(poleGeo, this.materials.lib.iron, poles, 'עמודי תאורה', { color: false });
    this._inst(headGeo, headMat, heads, 'פנסי רחוב', { color: false, cast: false });
  }

  /** Traffic lights at the junctions, cycling red, green and amber. */
  _trafficLights() {
    const P = this.pitch;
    const poles = [];
    const heads = [];
    const seen = new Set();
    for (const cell of this.cells.values()) {
      if (!this._built(cell)) continue;
      for (const [a, b] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const key = `${cell.i + (a > 0 ? 1 : 0)},${cell.j + (b > 0 ? 1 : 0)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cu = cell.u + (a * P) / 2;
        const cv = cell.v + (b * P) / 2;
        for (const [du, dv, dir] of [
          [-8.6, -8.6, 0],
          [8.6, 8.6, 1],
        ]) {
          const p = this._world(cu + du, cv + dv);
          if (this._clear(p.x, p.z) < 10) continue;
          const y = this.terrain.heightAt(p.x, p.z);
          poles.push({ m: new THREE.Matrix4().setPosition(p.x, y, p.z) });
          _q.setFromAxisAngle(UP, this.angle + (dir ? Math.PI / 2 : 0));
          heads.push({ m: new THREE.Matrix4().compose(_p.set(p.x, y + 3.3, p.z), _q, _s.set(1, 1, 1)), c: new THREE.Color(0xff2010), dir });
        }
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6);
    poleGeo.translate(0, 1.8, 0);
    const headGeo = new THREE.BoxGeometry(0.34, 0.95, 0.3);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 });
    headMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    headMat.customProgramCacheKey = () => 'city-signal';
    this.materials.trackEmissive(headMat, 1.2);
    this._inst(poleGeo, this.materials.lib.darkMetal || this.materials.lib.iron, poles, 'עמודי רמזור', { color: false });
    this.signals = this._inst(headGeo, headMat, heads, 'רמזורים', { cast: false });
    this.signalDirs = heads.map((h) => h.dir);
    this.signalPhase = -1;
  }

  _carGeometry() {
    if (this._carGeo) return this._carGeo;
    const body = new THREE.BoxGeometry(1.8, 0.7, 4.2);
    body.translate(0, 0.6, 0);
    const cab = new THREE.BoxGeometry(1.55, 0.55, 2.1);
    cab.translate(0, 1.2, -0.2);
    const col = (g, c) => {
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) a.set(c, i);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g.toNonIndexed();
    };
    this._carGeo = mergeGeometries([col(body, [1, 1, 1]), col(cab, [0.12, 0.13, 0.15])]);
    this._carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, name: 'מכוניות' });
    return this._carGeo;
  }

  /** Cars parked along the kerbs. */
  _parked() {
    const rng = this.rng;
    const L = this.block / 2;
    const items = [];
    for (const cell of this.cells.values()) {
      if (!this._built(cell)) continue;
      for (let side = 0; side < 4; side++) {
        const a0 = (side * Math.PI) / 2;
        const nx = Math.cos(a0);
        const nz = Math.sin(a0);
        for (let s = -L + 9; s <= L - 9; s += 5.6) {
          if (rng.random() < 0.4) continue;
          const lu = nx * (L + 1.5) - nz * s;
          const lv = nz * (L + 1.5) + nx * s;
          const p = this._world(cell.u + lu, cell.v + lv);
          if (this._clear(p.x, p.z) < 9) continue;
          // Along the kerb: the street runs along (-nz, nx) in grid space.
          _q.setFromAxisAngle(UP, Math.atan2(-nz, nx) - this.angle + (rng.random() < 0.5 ? 0 : Math.PI));
          items.push({ m: new THREE.Matrix4().compose(_p.set(p.x, this.terrain.heightAt(p.x, p.z) + 0.07, p.z), _q, _s.set(1, 1, 1)), c: new THREE.Color().setHSL(rng.random(), rng.range(0.05, 0.55), rng.range(0.18, 0.72)) });
        }
      }
    }
    this._inst(this._carGeometry(), this._carMat, items, 'רכבים חונים');
  }

  /** Spectators on the sidewalk behind the catch fence, thickest at the slow corners. */
  _spectators() {
    const tr = this.track;
    const rng = this.rng;
    const W = tr.W;
    const people = [];
    for (let i = 0; i < tr.n; i += 2) {
      if (tr.covered[i]) continue;
      const slow = tr.speed ? Math.max(0, 1 - tr.speed[i] / 45) : 0.3;
      if (rng.random() > 0.08 + slow * 1.6) continue;
      const side = rng.random() < 0.5 ? -1 : 1;
      const group = 1 + Math.floor(rng.random() * (1 + slow * 5));
      for (let k = 0; k < group; k++) {
        const lat = side * (W + rng.range(7.6, 10.5));
        const along = rng.range(-1.8, 1.8);
        const x = tr.x[i] - tr.tz[i] * lat + tr.tx[i] * along;
        const z = tr.z[i] + tr.tx[i] * lat + tr.tz[i] * along;
        const y = Math.max(this.terrain.heightAt(x, z), this.terrain.height(x, z)) + 0.19;
        // Face the road.
        const yaw = Math.atan2(tr.tz[i] * side, -tr.tx[i] * side) + rng.range(-0.6, 0.6);
        _q.setFromAxisAngle(UP, yaw);
        const sc = rng.range(0.92, 1.07);
        people.push({ m: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc)) });
      }
    }
    this.group.add(createCrowd(people, this.uniforms, () => rng.random()));
  }

  /**
   * The tunnel: walls and a roof over the straightest stretch (a hotel sits
   * on top, placed in _buildings), light strips inside and portal frames.
   */
  _tunnel() {
    const T = this.tunnel;
    if (!T || T.c < 0) return;
    const tr = this.track;
    const n = tr.n;
    const W = tr.W;
    const half = Math.round(T.len / 2 / tr.ds);
    const H = 7.4;
    const prof = [
      [-(W + 8.1), -0.3],
      [-(W + 7.1), -0.3],
      [-(W + 7.1), H],
      [W + 7.1, H],
      [W + 7.1, -0.3],
      [W + 8.1, -0.3],
      [W + 8.1, H + 1.0],
      [-(W + 8.1), H + 1.0],
    ];
    const pos = [];
    const idx = [];
    const P = prof.length;
    let rows = 0;
    const lights = [];
    for (let d = -half; d <= half; d++) {
      const i = (T.c + d + n) % n;
      const rx = -tr.tz[i];
      const rz = tr.tx[i];
      for (const [lat, y] of prof) pos.push(tr.x[i] + rx * lat, tr.h[i] + y, tr.z[i] + rz * lat);
      if (rows) {
        for (let k = 0; k < P; k++) {
          const a = (rows - 1) * P + k;
          const b = (rows - 1) * P + ((k + 1) % P);
          idx.push(a, b, a + P, b, b + P, a + P);
        }
      }
      rows++;
      if (d % 3 === 0) {
        _q.setFromAxisAngle(UP, Math.atan2(tr.tx[i], tr.tz[i]));
        for (const s of [-1, 1]) lights.push({ m: new THREE.Matrix4().compose(_p.set(tr.x[i] + rx * s * (W + 3), tr.h[i] + H - 0.08, tr.z[i] + rz * s * (W + 3)), _q, _s.set(0.35, 0.08, 2.2)) });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const concrete = new THREE.MeshStandardMaterial({ name: 'בטון מנהרה', color: 0xa39e95, roughness: 0.92, side: THREE.DoubleSide });
    this.materials.triplanar(concrete, this.materials.textures.tiles, this.materials.textures.tilesNormal, 0.25, 0.4, true);
    const shell = new THREE.Mesh(geo, concrete);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.name = 'מנהרה';
    this.group.add(shell);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff0d0, emissiveIntensity: 1 });
    this.materials.trackEmissive(lightMat, 3);
    this._inst(new THREE.BoxGeometry(1, 1, 1), lightMat, lights, 'תאורת מנהרה', { cast: false, color: false });
    // Portal frames at both mouths.
    for (const d of [-half, half]) {
      const i = (T.c + d + n) % n;
      const m = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + 8.6), 2.4, 1.4), concrete);
      m.position.set(tr.x[i], tr.h[i] + H + 1.1, tr.z[i]);
      m.rotation.y = Math.atan2(tr.tx[i], tr.tz[i]);
      m.castShadow = true;
      this.group.add(m);
    }
  }

  /** A glazed footbridge over the circuit with a banner, on stair towers behind the sidewalk. */
  _footbridge() {
    const B = this.bridge;
    if (!B || B.c < 0) return;
    const tr = this.track;
    const W = tr.W;
    const i = B.c;
    const x = tr.x[i];
    const z = tr.z[i];
    const h = tr.h[i];
    const yaw = Math.atan2(tr.tx[i], tr.tz[i]);
    const span = 2 * (W + 12);
    const deckY = h + 6.6;
    // The deck runs across the road: its long side along the road's right vector.
    const across = Math.atan2(-tr.tz[i], tr.tx[i]) + Math.PI / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, span), this.paving);
    deck.position.set(x, deckY, z);
    deck.rotation.y = across;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.group.add(deck);
    const glass = new THREE.MeshPhysicalMaterial({ name: 'זכוכית גשר', color: 0x9fc4d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, span), glass);
      g.position.set(x + tr.tx[i] * s * 1.65, deckY + 0.9, z + tr.tz[i] * s * 1.65);
      g.rotation.y = across;
      this.group.add(g);
    }
    // Stair towers just behind the sidewalks.
    for (const s of [-1, 1]) {
      const lat = s * (W + 14.8);
      const tx = x - tr.tz[i] * lat;
      const tz = z + tr.tx[i] * lat;
      const ty = this.terrain.heightAt(tx, tz);
      const hh = deckY - ty + 3.2;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4.2, hh, 4.2), this.paving);
      tower.position.set(tx, ty + hh / 2, tz);
      tower.rotation.y = yaw;
      tower.castShadow = true;
      this.group.add(tower);
    }
    // Banner on both faces, readable from each direction of travel.
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#0e1116';
    g.fillRect(0, 0, 1024, 96);
    g.fillStyle = '#ffb020';
    g.fillRect(0, 0, 1024, 8);
    g.fillRect(0, 88, 1024, 8);
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = '700 64px Karantina, "IBM Plex Sans Hebrew", sans-serif';
    g.fillText('העיר הסואנת · שימוטרון ראלי', 512, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6 });
    this.materials.trackEmissive(mat, 0.15);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.9, span * 0.9 * (96 / 1024)), mat);
      b.position.set(x - tr.tx[i] * s * 1.75, deckY - 0.05, z - tr.tz[i] * s * 1.75);
      b.rotation.y = yaw + (s > 0 ? Math.PI : 0);
      this.group.add(b);
    }
  }

  // ------------------------------------------------------------ traffic

  /** Civilian cars circling blocks whose lanes are clear of the circuit. */
  _traffic() {
    const rng = this.rng;
    const lane = this.block / 2 + 4.2;
    for (const cell of this.cells.values()) {
      if (!cell.lots.every((l) => l.kind !== 'none') || rng.random() > 0.35) continue;
      let ok = true;
      for (let k = 0; k < 16 && ok; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p = this._world(cell.u + Math.cos(a) * lane * 1.1, cell.v + Math.sin(a) * lane * 1.1);
        if (this._clear(p.x, p.z) < 8 || this.terrain.height(p.x, p.z) < 1.5) ok = false;
      }
      if (!ok) continue;
      const count = 1 + Math.floor(rng.random() * 2);
      for (let k = 0; k < count; k++) this.cars.push({ b: cell, lane: lane + (k % 2 ? 3.2 : 0), s: rng.random(), speed: rng.range(8, 13), dir: rng.random() < 0.5 ? 1 : -1, col: new THREE.Color().setHSL(rng.random(), rng.range(0.1, 0.6), rng.range(0.25, 0.7)) });
    }
    if (!this.cars.length) return;
    this.carMesh = new THREE.InstancedMesh(this._carGeometry(), this._carMat, this.cars.length);
    this.cars.forEach((c, k) => this.carMesh.setColorAt(k, c.col));
    const col = (g, c) => {
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) a.set(c, i);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g.toNonIndexed();
    };
    const lights = [];
    for (const s of [-1, 1]) {
      lights.push(col(new THREE.BoxGeometry(0.34, 0.14, 0.05).translate(s * 0.62, 0.75, 2.11), [1, 0.95, 0.85]));
      lights.push(col(new THREE.BoxGeometry(0.34, 0.12, 0.05).translate(s * 0.62, 0.78, -2.11), [1, 0.08, 0.04]));
    }
    const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1 });
    lightMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    lightMat.customProgramCacheKey = () => 'city-carlights';
    this.materials.trackEmissive(lightMat, 0.8);
    this.carLightMesh = new THREE.InstancedMesh(mergeGeometries(lights), lightMat, this.cars.length);
    for (const m of [this.carMesh, this.carLightMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.userData.noPick = true;
      this.group.add(m);
    }
    this.carMesh.castShadow = true;
    this._moveTraffic(0);
  }

  _moveTraffic(dt) {
    if (!this.cars.length) return;
    const r = 6; // corner radius
    this.cars.forEach((c, k) => {
      const hl = c.lane;
      const side = 2 * (hl - r);
      const per = 4 * side + 2 * Math.PI * r;
      c.s = (c.s + (c.dir * c.speed * dt) / per + 1) % 1;
      let d = c.s * per;
      // Walk the rounded rectangle: straight, quarter circle, ×4.
      let u = 0;
      let v = 0;
      let yaw = 0;
      for (let e = 0; e < 4; e++) {
        const a0 = (e * Math.PI) / 2;
        const dir = [Math.cos(a0 + Math.PI / 2), Math.sin(a0 + Math.PI / 2)];
        const start = [Math.cos(a0) * hl - dir[0] * (hl - r), Math.sin(a0) * hl - dir[1] * (hl - r)];
        if (d <= side) {
          u = start[0] + dir[0] * d;
          v = start[1] + dir[1] * d;
          yaw = Math.atan2(dir[0], dir[1]);
          break;
        }
        d -= side;
        const arc = (Math.PI / 2) * r;
        if (d <= arc) {
          const t = d / r;
          const cx = Math.cos(a0) * (hl - r) + dir[0] * (hl - r);
          const cz = Math.sin(a0) * (hl - r) + dir[1] * (hl - r);
          const ang = a0 + t;
          u = cx + Math.cos(ang) * r;
          v = cz + Math.sin(ang) * r;
          yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
          break;
        }
        d -= arc;
      }
      const p = this._world(c.b.u + u, c.b.v + v, _p);
      const y = this.terrain.heightAt(p.x, p.z) + 0.07;
      const heading = yaw + this.angle * -1 + (c.dir < 0 ? Math.PI : 0);
      _q.setFromAxisAngle(UP, heading);
      _m.compose(_p.set(p.x, y, p.z), _q, _s.set(1, 1, 1));
      this.carMesh.setMatrixAt(k, _m);
      this.carLightMesh.setMatrixAt(k, _m);
    });
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.carLightMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    const eng = this.engine;
    const atm = eng.atmosphere;
    this.time += dt;
    // Rooms light up as the sun goes down.
    const lit = 1 - smoothstep(0.12, 0.7, atm.dayFactor);
    this.uniforms.uLit.value = lit;
    this.uniforms.uGlow.value = (eng.materials.emissiveScale || 1) * 0.22;
    this.uniforms.uTime.value = this.time;
    if (this.landmarkFx) this.landmarkFx.update(dt);
    const M = eng.materials;
    if (this.lampMat) M.setEmissiveBase(this.lampMat, lit * 3);
    if (this.beaconMat) M.setEmissiveBase(this.beaconMat, Math.sin(this.time * 3) > 0.3 ? 2.5 : 0);
    for (const m of this.boardMats || []) M.setEmissiveBase(m, 0.08 + lit * 0.9);
    // Traffic lights: the two directions swap every 9 s, with an amber second between.
    if (this.signals) {
      const t = this.time % 18;
      const phase = t < 8 ? 0 : t < 9 ? 1 : t < 17 ? 2 : 3;
      if (phase !== this.signalPhase) {
        this.signalPhase = phase;
        const red = new THREE.Color(0xff2010);
        const green = new THREE.Color(0x20ff60);
        const amber = new THREE.Color(0xffa010);
        this.signalDirs.forEach((dir, k) => {
          const go = phase === 0 ? dir === 0 : phase === 2 ? dir === 1 : false;
          const warn = (phase === 1 && dir === 0) || (phase === 3 && dir === 1);
          this.signals.setColorAt(k, warn ? amber : go ? green : red);
        });
        this.signals.instanceColor.needsUpdate = true;
      }
    }
    this._moveTraffic(dt);
    this._sound(dt);
  }

  /** Traffic rumble, horns and the odd siren, placed around the listener. */
  _sound(dt) {
    const A = this.engine.audio;
    if (!A.ctx || !A.enabled) return;
    const ctx = A.ctx;
    if (!this.hum) {
      const src = ctx.createBufferSource();
      src.buffer = A.brown;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(f).connect(g).connect(A.buses.ambience);
      src.start();
      this.hum = { src, g };
      this.hornT = 2;
      this.sirenT = 12;
    }
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = 2 + Math.random() * 6;
      const pos = this.engine.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160));
      const out = ctx.createGain();
      out.gain.value = 0.05;
      out.connect(A._panner(pos, 10, 220)).connect(A.buses.ambience);
      const f0 = 330 + Math.random() * 120;
      const dur = 0.15 + Math.random() * 0.45;
      A._tone(out, { freq: f0, dur, gain: 0.5, type: 'square' });
      A._tone(out, { freq: f0 * 1.26, dur, gain: 0.4, type: 'square' });
    }
    this.sirenT -= dt;
    if (this.sirenT <= 0) {
      this.sirenT = 18 + Math.random() * 25;
      const out = ctx.createGain();
      out.gain.value = 0.025;
      out.connect(A.buses.ambience);
      for (let i = 0; i < 4; i++) A._tone(out, { freq: 620, dur: 0.7, gain: 1, type: 'sine', when: i * 0.75, slide: 1.4 });
    }
  }

  dispose() {
    if (this.hum) {
      try {
        this.hum.src.stop();
      } catch {
        /* stopped */
      }
      this.hum.g.disconnect();
    }
    this.group.removeFromParent();
  }
}
