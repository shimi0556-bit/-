import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';
import { waveAt } from '../engine/world/Water.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _w = { y: 0, dx: 0, dz: 0 };
const UP = new THREE.Vector3(0, 1, 0);
/** Height of each coral model at scale 1 (metres). */
const CORAL_HEIGHT = { branch: 0.95, brain: 0.4, table: 0.56, fan: 1.45, tubes: 0.95, kelp: 4.3 };

/** Non-indexed copy with a flat vertex colour and a scalar attribute (sway / head / tail mask). */
function paint(g, color, mask = 0, name = 'aMask') {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = typeof mask === 'function' ? mask(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)) : mask;
  g.setAttribute(name, new THREE.BufferAttribute(m, 1));
  return g;
}

/**
 * Life around an island, above and below the water:
 *   reefs    coral gardens on the shallow shelf — branching and brain
 *            corals, table and fan corals, tube sponges, swaying kelp;
 *   fish     schools of several species that wheel around their reefs;
 *   dolphins pods cruising offshore that leap clear of the water;
 *   boats    sailboats, motorboats and fishing boats circling the island,
 *            riding the actual waves, with wakes;
 *   balloons hot-air balloons drifting over the island, burners flaring;
 *   herds    cows and sheep grazing the meadows, camels in the desert.
 * What appears where comes from the stage's `life` settings.
 */
export class Life {
  constructor(engine, island, materials) {
    this.engine = engine;
    this.island = island; // { terrain, track, stage, water } — water may arrive later
    this.terrain = island.terrain;
    this.track = island.track;
    this.stage = island.stage;
    this.materials = materials;
    this.cfg = { reef: 0.5, fish: 1, dolphins: 1, boats: 6, balloons: 0, cows: 0, sheep: 0, camels: 0, ...(this.stage.life || {}) };
    this.rng = new Random(this.stage.seed * 29 + 11);
    this.group = new THREE.Group();
    this.group.name = 'חיים';
    this.uniforms = { uTime: { value: 0 } };
    this.time = 0;
  }

  build() {
    const c = this.cfg;
    if (c.reef > 0) this._reefs();
    if (c.fish > 0) this._fish();
    if (c.dolphins > 0) this._dolphins();
    if (c.boats > 0) this._boats();
    if (c.balloons > 0) this._balloons();
    if (c.cows + c.sheep + c.camels > 0) this._herds();
    return this.group;
  }

  _chunked(geo, mat, items, name, { cell = 220, cast = false } = {}) {
    const cells = new Map();
    for (const it of items) {
      const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    for (const list of cells.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (it.c) mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.name = name;
      mesh.userData.noPick = true;
      this.group.add(mesh);
    }
  }

  /** A shader that bends vertices with the mask attribute (swaying fronds, grazing heads, swimming tails). */
  _animated(opts, key, body) {
    const m = new THREE.MeshStandardMaterial(opts);
    const U = this.uniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = U.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aMask;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = dot(instanceMatrix[3].xz, vec2(0.61, 0.37));
          #else
            float ph = 0.0;
          #endif
          ${body}`,
        );
    };
    m.customProgramCacheKey = () => key;
    return m;
  }

  // ---------------------------------------------------------------- reefs

  _coralGeos() {
    const rng = this.rng;
    const white = 0xffffff;
    // Branching (staghorn): forks of thin tapering cylinders.
    const branch = [];
    const grow = (x, y, z, dir, len, r, depth) => {
      const c = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1, depth > 0);
      c.translate(0, len / 2, 0);
      _q.setFromUnitVectors(UP, dir);
      c.applyQuaternion(_q);
      c.translate(x, y, z);
      branch.push(paint(c, white, 0));
      if (depth > 0) {
        const tip = dir.clone().multiplyScalar(len);
        for (let k = 0; k < 2; k++) {
          const d = dir.clone().add(new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.1, 0.5), rng.range(-0.7, 0.7))).normalize();
          grow(x + tip.x, y + tip.y, z + tip.z, d, len * 0.72, r * 0.7, depth - 1);
        }
      }
    };
    for (let k = 0; k < 6; k++) grow(0, 0, 0, new THREE.Vector3(Math.cos(k * 1.1) * 0.6, 1, Math.sin(k * 1.1) * 0.6).normalize(), 0.5, 0.08, 1);
    // Brain coral: a squashed, grooved dome.
    const brain = new THREE.IcosahedronGeometry(0.6, 2);
    const bp = brain.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      _p.fromBufferAttribute(bp, i);
      const groove = 1 + Math.sin(_p.x * 14 + Math.sin(_p.z * 9) * 2) * 0.04;
      _p.multiplyScalar(groove);
      _p.y = Math.max(_p.y, -0.1) * 0.62;
      bp.setXYZ(i, _p.x, _p.y, _p.z);
    }
    brain.computeVertexNormals();
    // Table coral: stem and a wide plate.
    const table = mergeGeometries([paint(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 6).translate(0, 0.25, 0), white), paint(new THREE.CylinderGeometry(0.9, 0.75, 0.07, 14).translate(0, 0.52, 0), white)]);
    // Sea fan: a vertical disc that sways.
    const fan = paint(new THREE.CircleGeometry(0.7, 12).translate(0, 0.75, 0), white, (x, y) => y / 1.4);
    // Tube sponges.
    const tubes = mergeGeometries(
      [0, 1, 2, 3].map((k) => {
        const h = 0.4 + k * 0.18;
        return paint(new THREE.CylinderGeometry(0.1 + (k % 2) * 0.03, 0.12, h, 7, 1, true).translate(Math.cos(k * 1.7) * 0.16, h / 2, Math.sin(k * 1.7) * 0.16), white);
      }),
    );
    // Kelp: tall twisted ribbons that wave.
    const kelp = mergeGeometries(
      [0, 1, 2, 3, 4].map((k) => {
        const g = new THREE.PlaneGeometry(0.16, 3.2 + (k % 3) * 0.5, 1, 10);
        g.translate(0, g.parameters.height / 2, 0);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          const a = y * 0.9 + k;
          const x = p.getX(i);
          p.setXYZ(i, x * Math.cos(a), y, x * Math.sin(a));
        }
        g.computeVertexNormals();
        g.translate(Math.cos(k * 2.4) * 0.25, 0, Math.sin(k * 2.4) * 0.25);
        return paint(g, white, (x, y) => (y / 3.6) ** 1.4);
      }),
    );
    return {
      branch: mergeGeometries(branch),
      brain: paint(brain, white),
      table,
      fan,
      tubes,
      kelp,
    };
  }

  /**
   * Coral is streamed: the sea floor is split into cells, each cell's
   * corals are generated from its own seed the first time the camera comes
   * near, and only the cells around the camera are drawn. That keeps the
   * gardens dense wherever you look without paying for the whole coast.
   */
  _reefs() {
    const t = this.terrain;
    const low = this.engine.quality.presetName === 'low';
    this.coralGeos = this._coralGeos();
    this.reefCellSize = 34;
    this.reefRange = low ? 2 : 3;
    this.reefPerCell = Math.round(80 * Math.min(1.4, this.cfg.reef) * (low ? 0.6 : 1));
    this.reefCache = new Map();
    const cells = (this.reefRange * 2 + 1) ** 2;
    const cap = cells * this.reefPerCell;
    const rigid = new THREE.MeshStandardMaterial({ name: 'אלמוגים', vertexColors: true, roughness: 0.72 });
    rigid.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCoral;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoral = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCoral;').replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 q = vCoral * 11.0;
        float polyp = sin(q.x + sin(q.z * 1.3) * 2.0) * sin(q.z * 1.1 + sin(q.y * 1.7)) * sin(q.y * 1.4 + q.x * 0.5);
        diffuseColor.rgb *= 0.72 + 0.34 * smoothstep(-0.6, 0.6, polyp);
        diffuseColor.rgb *= mix(0.7, 1.08, smoothstep(-0.1, 0.5, vCoral.y));`,
      );
    };
    rigid.customProgramCacheKey = () => 'life-coral';
    const sway = this._animated({ name: 'אלמוגים נעים', vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }, 'life-sway', 'transformed.x += sin(uTime * 1.2 + ph + transformed.y * 1.3) * 0.22 * aMask; transformed.z += cos(uTime * 0.9 + ph * 1.7) * 0.18 * aMask;');
    // Sea fans: a lace of fine branches, not a solid disc.
    const fan = this._animated({ name: 'מניפות ים', vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }, 'life-sway', 'transformed.x += sin(uTime * 1.2 + ph + transformed.y * 1.3) * 0.22 * aMask; transformed.z += cos(uTime * 0.9 + ph * 1.7) * 0.18 * aMask;');
    const fanCompile = fan.onBeforeCompile;
    fan.onBeforeCompile = (shader, r) => {
      fanCompile(shader, r);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLace;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLace = position.xy;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLace;').replace(
        '#include <alphatest_fragment>',
        `vec2 lp = vLace * 14.0;
        float web = min(abs(fract(lp.x + sin(lp.y * 0.7) * 0.6) - 0.5), abs(fract(lp.y * 0.8 + sin(lp.x * 0.9) * 0.5) - 0.5));
        float rim = smoothstep(0.66, 0.7, length(vLace - vec2(0.0, 0.75)));
        if (web > 0.16 && rim < 0.5) discard;`,
      );
    };
    fan.customProgramCacheKey = () => 'life-fan';
    this.reefMeshes = {};
    for (const kind of Object.keys(this.coralGeos)) {
      const mesh = new THREE.InstancedMesh(this.coralGeos[kind], kind === 'fan' ? fan : kind === 'kelp' ? sway : rigid, kind === 'kelp' ? cap : Math.ceil(cap * 0.6));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color());
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.name = 'שונית';
      mesh.userData.noPick = true;
      this.reefMeshes[kind] = mesh;
      this.group.add(mesh);
    }
    // Where the reef fish live: points of dense cover.
    const rng = this.rng;
    const half = t.size / 2 - 30;
    const spots = [];
    for (let guard = 0; guard < 30000 && spots.length < 260; guard++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = t.heightAt(x, z);
      if (h > -1.2 || h < -16) continue;
      if (t.reefAt && t.reefAt(x, z, h) > 0.5) spots.push({ x, z });
    }
    this.reefSpots = spots;
  }

  _reefCell(cx, cz) {
    const key = `${cx},${cz}`;
    let cell = this.reefCache.get(key);
    if (cell) return cell;
    const t = this.terrain;
    const S = this.reefCellSize;
    const half = t.size / 2;
    cell = [];
    if (Math.abs((cx + 0.5) * S) < half && Math.abs((cz + 0.5) * S) < half) {
      const rng = new Random(((cx * 73856093) ^ (cz * 19349663) ^ (this.stage.seed * 83492791)) >>> 0 || 1);
      const hot = [0xff6f91, 0xff9a3c, 0xffd23a, 0xb266ff, 0x3de0c8, 0xff4a5a, 0xf5f0e0, 0x7ad0ff, 0xe8a0ff, 0xff8fb0];
      const kinds = ['branch', 'branch', 'branch', 'brain', 'brain', 'table', 'fan', 'fan', 'tubes'];
      // Garden centres inside the cell; corals crowd around them.
      let gx = 0;
      let gz = 0;
      for (let k = 0; k < this.reefPerCell * 3 && cell.length < this.reefPerCell; k++) {
        if (k % 10 === 0) {
          gx = (cx + rng.random()) * S;
          gz = (cz + rng.random()) * S;
        }
        const x = gx + rng.range(-7, 7);
        const z = gz + rng.range(-7, 7);
        const h = t.heightAt(x, z);
        if (h > -0.8 || h < -22) continue;
        const cover = t.reefAt ? t.reefAt(x, z, h) : 0;
        const kelp = h < -6 && t.noise.noise(x * 0.02 - 30, z * 0.02 + 8) > 0.2;
        if (kelp ? rng.random() > 0.55 : rng.random() > cover * cover) continue;
        const kind = kelp ? 'kelp' : rng.pick(kinds);
        let s = kind === 'kelp' ? rng.range(0.8, 2.0) : kind === 'table' ? rng.range(0.9, 2.2) : rng.range(0.7, 2.3) * (0.7 + cover * 0.4);
        // Nothing breaks the surface: shallow corals stay small.
        s = Math.min(s, (-h - 0.45) / CORAL_HEIGHT[kind]);
        if (s < 0.35) continue;
        _q.setFromEuler(_e.set(rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15)));
        const c = kind === 'kelp' ? new THREE.Color().setHSL(rng.range(0.16, 0.3), 0.55, rng.range(0.22, 0.35)) : new THREE.Color(rng.pick(hot)).offsetHSL(0, 0, rng.range(-0.08, 0.05));
        cell.push({ kind, m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.1, z), _q.clone(), new THREE.Vector3(s, s * rng.range(0.8, 1.2), s)), c });
      }
    }
    this.reefCache.set(key, cell);
    if (this.reefCache.size > 600) this.reefCache.delete(this.reefCache.keys().next().value);
    return cell;
  }

  _updateReefs() {
    if (!this.reefMeshes) return;
    const cam = this.engine.camera.position;
    const M = this.reefMeshes;
    // From high up the reef reads through the painted sea floor alone.
    if (cam.y > 120) {
      if (this.reefShown) for (const m of Object.values(M)) m.count = 0;
      this.reefShown = false;
      return;
    }
    const S = this.reefCellSize;
    const cx = Math.floor(cam.x / S);
    const cz = Math.floor(cam.z / S);
    if (this.reefShown && cx === this.reefCx && cz === this.reefCz) return;
    this.reefShown = true;
    this.reefCx = cx;
    this.reefCz = cz;
    for (const m of Object.values(M)) m.count = 0;
    const R = this.reefRange;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        for (const it of this._reefCell(cx + dx, cz + dz)) {
          const m = M[it.kind];
          if (m.count >= m.instanceMatrix.count) continue;
          m.setMatrixAt(m.count, it.m);
          m.setColorAt(m.count, it.c);
          m.count++;
        }
      }
    }
    for (const m of Object.values(M)) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- fish

  _fishGeometry() {
    // Body along +Z (nose forward), tail fin, dorsal fin; aMask = how far towards the tail (for the swim wiggle).
    const body = new THREE.SphereGeometry(0.5, 7, 5);
    body.scale(0.32, 0.5, 1);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.45, 0, 0.32, -0.85, 0, -0.32, -0.85, 0, 0.32, -0.85, 0, 0, -0.45, 0, -0.32, -0.85], 3));
    tail.computeVertexNormals();
    const dorsal = new THREE.BufferGeometry();
    dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.22, 0.2, 0, 0.42, -0.1, 0, 0.22, -0.3, 0, 0.42, -0.1, 0, 0.22, 0.2, 0, 0.22, -0.3], 3));
    dorsal.computeVertexNormals();
    const tailMask = (x, y, z) => Math.max(0, Math.min(1, (0.1 - z) / 0.95));
    return mergeGeometries([paint(body, 0xffffff, tailMask), paint(tail, 0xffffff, tailMask), paint(dorsal, 0xffffff, tailMask)]);
  }

  _fish() {
    const t = this.terrain;
    const rng = this.rng;
    const species = [
      { name: 'sardine', size: 0.2, count: [40, 90], color: 0xb8c8d8, stripe: 0, speed: 3.2, radius: 5, depth: [-18, -3] },
      { name: 'tang', size: 0.28, count: [10, 24], color: 0x2f6bff, stripe: 0, speed: 2, radius: 3.5, depth: [-10, -1.5], reef: true },
      { name: 'yellow', size: 0.24, count: [10, 22], color: 0xffd23a, stripe: 0, speed: 2, radius: 3, depth: [-10, -1.5], reef: true },
      { name: 'clown', size: 0.14, count: [4, 9], color: 0xff7a1a, stripe: 2, speed: 1.2, radius: 1.5, depth: [-8, -1.5], reef: true },
      { name: 'parrot', size: 0.5, count: [4, 9], color: 0x3de0a0, stripe: 1, speed: 1.6, radius: 4, depth: [-14, -2], reef: true },
      { name: 'grouper', size: 0.9, count: [1, 3], color: 0x7a5a40, stripe: 1, speed: 1.1, radius: 5, depth: [-20, -4] },
      { name: 'tuna', size: 1.1, count: [8, 16], color: 0x44607a, stripe: 0, speed: 5, radius: 8, depth: [-24, -6] },
    ];
    const schools = [];
    const half = t.size / 2 - 40;
    const want = Math.round(80 * this.cfg.fish);
    let guard = 0;
    while (schools.length < want && guard++ < 4000) {
      const sp = rng.pick(species);
      let x;
      let z;
      if (sp.reef && this.reefSpots && this.reefSpots.length) {
        const r = rng.pick(this.reefSpots);
        x = r.x + rng.range(-6, 6);
        z = r.z + rng.range(-6, 6);
      } else {
        x = rng.range(-half, half);
        z = rng.range(-half, half);
      }
      const floor = t.heightAt(x, z);
      if (floor > sp.depth[1] - 1 || floor < sp.depth[0] - 12) continue;
      const n = Math.round(rng.range(sp.count[0], sp.count[1]));
      const fish = [];
      for (let k = 0; k < n; k++) fish.push({ ph: rng.range(0, 6.28), orbit: rng.range(0.3, 1), tilt: rng.range(-0.5, 0.5), rr: rng.range(0.3, 1), off: rng.range(-1, 1), s: sp.size * rng.range(0.85, 1.15) });
      schools.push({ sp, ax: x, az: z, floor, n, fish, ang: rng.range(0, 6.28), roam: rng.range(8, 26), dir: rng.random() < 0.5 ? 1 : -1, bob: rng.range(0, 6.28), x, y: 0, z });
    }
    this.schools = schools;
    const total = schools.reduce((a, s) => a + s.n, 0);
    const mat = this._animated(
      { name: 'דגים', vertexColors: true, roughness: 0.35, metalness: 0.35 },
      'life-fish',
      `transformed.x += sin(uTime * 9.0 + ph * 5.0 + transformed.z * 5.0) * 0.12 * aMask * aMask;`,
    );
    // Countershading and bands, per instance colour.
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float iStripe; varying vec3 vFishPos; varying float vStripe;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishPos = position; vStripe = iStripe;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFishPos; varying float vStripe;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb *= mix(1.35, 0.62, smoothstep(-0.2, 0.25, vFishPos.y));
          float band = step(0.72, fract(vFishPos.z * 2.6 + 0.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, vStripe > 1.5 ? vec3(1.0) : diffuseColor.rgb * 0.35, band * step(0.5, vStripe));`,
        );
    };
    mat.customProgramCacheKey = () => 'life-fish-v2';
    const geo = this._fishGeometry();
    const stripe = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    geo.setAttribute('iStripe', stripe);
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.noPick = true;
    mesh.name = 'להקות דגים';
    let k = 0;
    const c = new THREE.Color();
    for (const s of schools) {
      s.base = k;
      for (let i = 0; i < s.n; i++, k++) {
        c.set(s.sp.color).offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.06, 0.06));
        mesh.setColorAt(k, c);
        stripe.array[k] = s.sp.stripe;
      }
    }
    mesh.instanceColor.needsUpdate = true;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < total; i++) mesh.setMatrixAt(i, _m);
    for (const s of schools) s.hidden = true;
    this.fishMesh = mesh;
    this.group.add(mesh);
  }

  /** Schools far from the camera swim in again somewhere near it, so wherever you look there are fish. */
  _relocateFish() {
    const cam = this.engine.camera.position;
    if (cam.y > 90) return;
    const t = this.terrain;
    const half = t.size / 2 - 40;
    for (let n = 0; n < 3; n++) {
      this.fishCursor = ((this.fishCursor || 0) + 1) % this.schools.length;
      const s = this.schools[this.fishCursor];
      if (Math.hypot(s.ax - cam.x, s.az - cam.z) < 260) continue;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = 50 + Math.random() * 170;
        const x = cam.x + Math.cos(a) * r;
        const z = cam.z + Math.sin(a) * r;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        const floor = t.heightAt(x, z);
        if (floor > s.sp.depth[1] - 1 || floor < s.sp.depth[0] - 12) continue;
        if (s.sp.reef && t.reefAt && t.reefAt(x, z, floor) < 0.3) continue;
        s.ax = x;
        s.az = z;
        s.floor = floor;
        break;
      }
    }
  }

  _updateFish(dt) {
    const mesh = this.fishMesh;
    if (!mesh) return;
    this._relocateFish();
    const cam = this.engine.camera.position;
    const t = this.time;
    for (const s of this.schools) {
      // Each school owns a fixed run of instances (its colours live there); far schools collapse to nothing.
      if (Math.abs(s.ax - cam.x) > 320 || Math.abs(s.az - cam.z) > 320) {
        if (!s.hidden) {
          _m.makeScale(0, 0, 0);
          for (let i = 0; i < s.n; i++) mesh.setMatrixAt(s.base + i, _m);
          s.hidden = true;
        }
        continue;
      }
      s.hidden = false;
      let k = s.base;
      const sp = s.sp;
      // The school wanders around its anchor.
      s.ang += (dt * sp.speed * s.dir) / s.roam;
      s.x = s.ax + Math.cos(s.ang) * s.roam;
      s.z = s.az + Math.sin(s.ang * 0.8) * s.roam * 0.7;
      const floor = this.terrain.heightAt(s.x, s.z);
      const top = -0.9;
      const bottom = floor + 1 + sp.size;
      s.y = THREE.MathUtils.clamp(THREE.MathUtils.lerp(bottom, top, 0.35 + 0.15 * Math.sin(t * 0.3 + s.bob)), bottom, top);
      const hx = -Math.sin(s.ang) * s.roam * s.dir;
      const hz = Math.cos(s.ang * 0.8) * s.roam * 0.7 * 0.8 * s.dir;
      const heading = Math.atan2(hx, hz);
      for (const f of s.fish) {
        const a = t * (0.6 + f.orbit * 0.5) + f.ph;
        const r = sp.radius * f.rr;
        const ox = Math.cos(a) * r * 0.6 + f.off * sp.radius * 0.4;
        const oz = Math.sin(a) * r;
        const oy = Math.sin(a * 1.3 + f.ph) * r * 0.3 + f.tilt;
        const yaw = heading + Math.sin(a) * 0.35;
        _q.setFromEuler(_e.set(Math.sin(a * 1.3) * 0.15, yaw, 0));
        _m.compose(_p.set(s.x + ox, THREE.MathUtils.clamp(s.y + oy, bottom - 0.6, top), s.z + oz), _q, _s.set(f.s, f.s, f.s));
        mesh.setMatrixAt(k++, _m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- dolphins

  _dolphinGeometry() {
    const prof = [
      [0.0, 1.3],
      [0.05, 1.18],
      [0.07, 1.0],
      [0.19, 0.78],
      [0.27, 0.4],
      [0.28, 0.0],
      [0.22, -0.45],
      [0.12, -0.9],
      [0.06, -1.15],
    ].map(([r, z]) => new THREE.Vector2(r, z));
    const body = new THREE.LatheGeometry(prof, 12);
    body.rotateX(Math.PI / 2); // lathe axis Y → Z
    body.rotateX(Math.PI);
    body.scale(1, 0.9, 1);
    const tri = (pts) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      return g;
    };
    const dorsal = tri([0, 0.24, 0.1, 0, 0.55, -0.25, 0, 0.22, -0.35, 0, 0.55, -0.25, 0, 0.24, 0.1, 0, 0.22, -0.35]);
    const flukes = tri([0, 0, -1.1, 0.42, 0, -1.4, 0.1, 0, -1.25, 0, 0, -1.1, -0.1, 0, -1.25, -0.42, 0, -1.4, 0.42, 0, -1.4, 0, 0, -1.1, 0.1, 0, -1.25, -0.1, 0, -1.25, 0, 0, -1.1, -0.42, 0, -1.4]);
    const fins = tri([0.2, -0.1, 0.4, 0.5, -0.25, 0.15, 0.2, -0.12, 0.2, -0.2, -0.1, 0.4, -0.2, -0.12, 0.2, -0.5, -0.25, 0.15]);
    const grey = (x, y) => y;
    const g = mergeGeometries([paint(body, 0x6f7b88, grey), paint(dorsal, 0x5a6470, 1), paint(flukes, 0x5a6470, 0), paint(fins, 0x5a6470, 0)]);
    return g;
  }

  _dolphins() {
    const t = this.terrain;
    const rng = this.rng;
    const pods = [];
    const R = this.stage.island.radius;
    for (let k = 0; k < 3 * this.cfg.dolphins; k++) {
      // Offshore, in deep water.
      let guard = 0;
      let a;
      let r;
      do {
        a = rng.range(0, 6.28);
        r = R * rng.range(1.05, 1.35);
      } while (t.heightAt(Math.cos(a) * r, Math.sin(a) * r) > -8 && guard++ < 40);
      const n = 3 + Math.floor(rng.random() * 4);
      const members = [];
      for (let i = 0; i < n; i++) members.push({ lat: rng.range(-5, 5), lag: rng.range(-6, 6), leap: rng.range(0, 6), period: rng.range(4, 9), s: rng.range(0.9, 1.2), splashed: 0 });
      pods.push({ a, r, speed: rng.range(6, 8) / r, members });
    }
    this.pods = pods;
    const count = pods.reduce((s, p) => s + p.members.length, 0);
    const mat = new THREE.MeshStandardMaterial({ name: 'דולפינים', vertexColors: true, roughness: 0.3, metalness: 0.1 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMask; varying float vBelly;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBelly = aMask;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBelly;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.82, 0.84, 0.86), diffuseColor.rgb, smoothstep(-0.12, 0.08, vBelly));');
    };
    mat.customProgramCacheKey = () => 'life-dolphin';
    const mesh = new THREE.InstancedMesh(this._dolphinGeometry(), mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = 'דולפינים';
    this.dolphinMesh = mesh;
    this.group.add(mesh);
    const P = this.engine.particles;
    this.splash = P ? P.systems.smoke : null;
  }

  _updateDolphins(dt) {
    if (!this.dolphinMesh) return;
    const t = this.time;
    let k = 0;
    for (const pod of this.pods) {
      pod.a += pod.speed * dt;
      const cx = Math.cos(pod.a) * pod.r;
      const cz = Math.sin(pod.a) * pod.r;
      const tx = -Math.sin(pod.a);
      const tz = Math.cos(pod.a);
      const yaw = Math.atan2(tx, tz);
      for (const d of pod.members) {
        const x = cx + -tz * d.lat + tx * d.lag;
        const z = cz + tx * d.lat + tz * d.lag;
        const phase = ((t + d.leap) % d.period) / 1.35; // 0..1 during the leap
        let y = -1.4 + Math.sin(t * 1.3 + d.leap) * 0.25;
        let pitch = 0;
        if (phase < 1) {
          y = -1.2 + Math.sin(phase * Math.PI) * 3.4;
          pitch = -Math.cos(phase * Math.PI) * 0.9;
          if (phase > 0.05 && d.splashed === 0) this._splash(x, z, (d.splashed = 1));
          if (phase > 0.93 && d.splashed === 1) this._splash(x + tx * 3, z + tz * 3, (d.splashed = 2));
        } else d.splashed = 0;
        _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
        _m.compose(_p.set(x, y, z), _q, _s.set(d.s, d.s, d.s));
        this.dolphinMesh.setMatrixAt(k++, _m);
      }
    }
    this.dolphinMesh.instanceMatrix.needsUpdate = true;
  }

  _splash(x, z) {
    const sys = this.splash;
    if (!sys) return;
    const cam = this.engine.camera.position;
    if (Math.hypot(cam.x - x, cam.z - z) > 400) return;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28;
      const v = 1.5 + Math.random() * 3;
      sys.emit({ x: x + Math.cos(a) * 0.5, y: 0.1, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * v * 0.5, vy: 2 + Math.random() * 3.5, vz: Math.sin(a) * v * 0.5, life: 0.8 + Math.random() * 0.6, size0: 0.4, size1: 1.4, color0: [0.95, 0.97, 1, 0.8], color1: [0.95, 0.97, 1, 0], gravity: 7, drag: 0.8 });
    }
  }

  // ---------------------------------------------------------------- boats

  /** A closed loop around the island over water at least `depth` deep, pushed `margin` further out. */
  _seaLoop(depth, margin, rng) {
    const t = this.terrain;
    const R = this.stage.island.radius;
    const pts = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let r = R * 0.5;
      while (r < R * 1.6 && t.heightAt(Math.cos(a) * r, Math.sin(a) * r) > -depth) r += 12;
      r += margin + rng.range(-20, 20);
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    return { curve, length: curve.getLength() };
  }

  _hull(len, beam, depth, colorTop, colorBottom) {
    const g = new THREE.BoxGeometry(beam, depth, len, 1, 2, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      const z = p.getZ(i);
      const f = z / (len / 2); // -1 stern .. 1 bow
      if (f > 0) x *= 1 - Math.pow(f, 1.6) * 0.95; // pointed bow
      if (y < 0) x *= 0.62; // narrower keel
      y += Math.max(0, f) * Math.max(0, f) * depth * 0.45; // raised bow
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const top = new THREE.Color(colorTop);
    const bottom = new THREE.Color(colorBottom);
    g.translate(0, depth * 0.1, 0);
    const out = g.toNonIndexed();
    const col = new Float32Array(out.attributes.position.count * 3);
    for (let i = 0; i < out.attributes.position.count; i++) (out.attributes.position.getY(i) < -depth * 0.05 ? bottom : top).toArray(col, i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count), 1));
    out.deleteAttribute('uv');
    return out;
  }

  _boatModels() {
    const box = (w, h, d, c, x = 0, y = 0, z = 0) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
    const tri = (pts, c) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      return paint(g, c);
    };
    const motor = mergeGeometries([
      this._hull(7, 2.4, 1.2, 0xf4f4f2, 0x1f3f7a),
      box(1.8, 0.7, 2.2, 0xf4f4f2, 0, 0.95, -0.4),
      box(1.7, 0.45, 0.08, 0x1b2733, 0, 1.2, 0.72),
      box(2.1, 0.08, 0.5, 0x8a6a45, 0, 0.62, -3.1),
    ]);
    const sail = mergeGeometries([
      this._hull(9, 2.6, 1.3, 0xf2f2f0, 0xc8102e),
      box(1.4, 0.55, 2.4, 0xe8e6e0, 0, 0.9, -1.2),
      paint(new THREE.CylinderGeometry(0.07, 0.09, 11, 6).translate(0, 6.1, 0.6), 0xd9d9d9),
      tri([0, 1.6, 0.4, 0, 11, 0.55, 0, 1.6, -3.6, 0, 11, 0.55, 0, 1.6, 0.4, 0, 1.6, -3.6], 0xfafafa),
      tri([0, 1.4, 0.8, 0, 9.5, 0.7, 0, 1.2, 4.3, 0, 9.5, 0.7, 0, 1.4, 0.8, 0, 1.2, 4.3], 0xf0f0f0),
    ]);
    const fishing = mergeGeometries([
      this._hull(11, 3.6, 1.8, 0xe8e4d8, 0x7a2a1f),
      box(2.6, 2.2, 2.8, 0xf2f2f0, 0, 2.0, 1.6),
      box(2.7, 0.5, 0.1, 0x1b2733, 0, 2.6, 3.05),
      paint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3.5, -1.8), 0x3a3a3a),
      paint(new THREE.CylinderGeometry(0.06, 0.06, 5, 5).rotateZ(1.0).translate(1.6, 3.5, -1.8), 0x3a3a3a),
    ]);
    return { motor, sail, fishing };
  }

  _boats() {
    const rng = this.rng;
    const models = this._boatModels();
    const loops = [this._seaLoop(5, 60, rng), this._seaLoop(8, 160, rng), this._seaLoop(10, 290, rng)];
    const list = [];
    const n = this.cfg.boats;
    for (let i = 0; i < n; i++) {
      const kind = rng.pick(['motor', 'motor', 'sail', 'sail', 'fishing']);
      const loop = loops[i % loops.length];
      const speed = kind === 'motor' ? rng.range(8, 12) : kind === 'sail' ? rng.range(3.5, 5.5) : rng.range(3, 4.5);
      list.push({ kind, loop, u: rng.random(), speed, dir: rng.random() < 0.5 ? 1 : -1, lat: rng.range(-15, 15) });
    }
    this.boatList = list;
    const mat = new THREE.MeshStandardMaterial({ name: 'סירות', vertexColors: true, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
    this.boatMeshes = {};
    for (const kind of Object.keys(models)) {
      const mine = list.filter((b) => b.kind === kind);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(models[kind], mat, mine.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = 'סירות';
      mine.forEach((b, k) => {
        b.mesh = mesh;
        b.slot = k;
      });
      this.group.add(mesh);
      this.boatMeshes[kind] = mesh;
    }
    // Foam wakes: a flat V trailing each boat.
    const wake = new THREE.BufferGeometry();
    wake.setAttribute('position', new THREE.Float32BufferAttribute([-0.8, 0, 0, 0.8, 0, 0, -6, 0, -26, 0.8, 0, 0, 6, 0, -26, -6, 0, -26], 3));
    wake.setAttribute('uv', new THREE.Float32BufferAttribute([0.4, 0, 0.6, 0, 0, 1, 0.6, 0, 1, 1, 0, 1], 2));
    const wakeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.uniforms.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5); }
        void main(){
          float edge = 1.0 - smoothstep(0.0, 0.18, min(abs(vUv.x - 0.08), abs(vUv.x - 0.92)) + 0.0);
          float foam = smoothstep(0.35, 0.9, h(floor(vUv * vec2(40.0, 60.0)) + floor(uTime * 6.0)));
          float a = (1.0 - vUv.y) * (0.35 + 0.5 * foam) * (0.45 + 0.55 * edge);
          gl_FragColor = vec4(vec3(0.95), a * 0.7);
        }`,
    });
    this.wakeMesh = new THREE.InstancedMesh(wake, wakeMat, list.length);
    this.wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 6;
    this.group.add(this.wakeMesh);
  }

  _updateBoats(dt) {
    if (!this.boatList) return;
    const t = this.engine.time.elapsed;
    const water = this.island.water;
    const amp = water ? water.uniforms.uWaveAmp.value : 1;
    const tan = new THREE.Vector3();
    this.boatList.forEach((b, k) => {
      b.u = (b.u + (b.dir * b.speed * dt) / b.loop.length + 1) % 1;
      b.loop.curve.getPointAt(b.u, _p);
      b.loop.curve.getTangentAt(b.u, tan).multiplyScalar(b.dir);
      const x = _p.x - tan.z * b.lat;
      const z = _p.z + tan.x * b.lat;
      waveAt(x, z, t, amp, _w);
      const yaw = Math.atan2(tan.x, tan.z);
      const pitch = -(_w.dx * tan.x + _w.dz * tan.z) - (b.kind === 'motor' ? 0.05 : 0);
      const roll = _w.dx * tan.z - _w.dz * tan.x + (b.kind === 'sail' ? 0.12 : 0);
      _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
      _m.compose(_s.set(x, _w.y - 0.25, z), _q, _p.set(1, 1, 1));
      b.mesh.setMatrixAt(b.slot, _m);
      const w = b.kind === 'motor' ? 1 : 0.55;
      _q.setFromAxisAngle(UP, yaw);
      _m.compose(_s.set(x - tan.x * 2.5, _w.y + 0.05, z - tan.z * 2.5), _q, _p.set(w, 1, w * (b.speed / 10)));
      this.wakeMesh.setMatrixAt(k, _m);
    });
    for (const m of Object.values(this.boatMeshes)) m.instanceMatrix.needsUpdate = true;
    this.wakeMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- balloons

  _balloonGeometry(colors) {
    const prof = [
      [0.9, 0],
      [2.6, 1.4],
      [5.2, 4.4],
      [6.6, 8],
      [6.7, 10.5],
      [5.6, 13.4],
      [3.2, 15.4],
      [0.01, 16.2],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gores = 16;
    const env = new THREE.LatheGeometry(prof, gores);
    const g = env.toNonIndexed();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      // Colour each triangle by its gore (angle) and band (height).
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * gores);
      const band = y > 11 ? 2 : y > 5 ? 1 : 0;
      c.set(colors[(gore + band) % colors.length]);
      for (let v = 0; v < 3; v++) c.toArray(col, (i + v) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const basket = paint(new THREE.CylinderGeometry(0.75, 0.65, 1.1, 8).translate(0, -4.6, 0), 0x7a5230);
    const rim = paint(new THREE.TorusGeometry(0.76, 0.06, 5, 12).rotateX(Math.PI / 2).translate(0, -4.05, 0), 0x3a2a1a);
    const ropes = [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const from = new THREE.Vector3(Math.cos(a) * 0.7, -4.05, Math.sin(a) * 0.7);
      const to = new THREE.Vector3(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95);
      const len = from.distanceTo(to);
      const r = new THREE.CylinderGeometry(0.025, 0.025, len, 4).translate(0, len / 2, 0);
      r.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
      r.translate(from.x, from.y, from.z);
      return paint(r, 0x2a2a2a);
    });
    return mergeGeometries([g, basket, rim, ...ropes]);
  }

  _balloons() {
    const rng = this.rng;
    const palettes = [
      [0xe0262b, 0xffd23a, 0xffffff],
      [0x1f6fe0, 0xffffff, 0xff7a1a],
      [0x1faa59, 0xffd23a, 0x1f6fe0],
      [0x8a4dff, 0xf06aa0, 0xffffff],
      [0xff7a1a, 0x2b2b2b, 0xffd23a],
      [0x18b8c9, 0xffffff, 0xe0262b],
    ];
    const mat = new THREE.MeshStandardMaterial({ name: 'כדורים פורחים', vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff8a2a, emissiveIntensity: 1 });
    this.materials.trackEmissive(flameMat, 0);
    this.flameMat = flameMat;
    const flameGeo = new THREE.ConeGeometry(0.35, 1.6, 8);
    flameGeo.translate(0, 0.6, 0);
    this.balloonList = [];
    const R = this.stage.island.radius;
    for (let i = 0; i < this.cfg.balloons; i++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(this._balloonGeometry(palettes[i % palettes.length]), mat));
      b.children[0].castShadow = true;
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = -3.8;
      b.add(flame);
      b.name = 'כדור פורח';
      const s = rng.range(0.9, 1.25);
      b.scale.setScalar(s);
      const a = rng.range(0, 6.28);
      const r = rng.range(0, R * 0.9);
      this.balloonList.push({ g: b, flame, x: Math.cos(a) * r, z: Math.sin(a) * r, alt: rng.range(70, 210), ph: rng.range(0, 6.28), burn: 0 });
      this.group.add(b);
    }
  }

  _updateBalloons(dt) {
    if (!this.balloonList) return;
    const atm = this.engine.atmosphere;
    const wx = atm.wind.dir.x * (1.5 + atm.wind.strength);
    const wz = atm.wind.dir.y * (1.5 + atm.wind.strength);
    const R = this.stage.island.radius * 1.2;
    let burning = 0;
    for (const b of this.balloonList) {
      b.x += wx * dt;
      b.z += wz * dt;
      // Drifted off the island: come back in on the far side.
      if (Math.hypot(b.x, b.z) > R) {
        b.x = -b.x * 0.9;
        b.z = -b.z * 0.9;
      }
      const ground = Math.max(0, this.terrain.heightAt(b.x, b.z));
      const y = ground + b.alt + Math.sin(this.time * 0.2 + b.ph) * 6;
      b.g.position.set(b.x, y, b.z);
      b.g.rotation.y += dt * 0.03;
      // Burner blasts now and then.
      b.burn -= dt;
      if (b.burn < -Math.random() * 20) b.burn = 1.5 + Math.random() * 2;
      b.flame.visible = b.burn > 0;
      b.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
      if (b.burn > 0) burning++;
    }
    this.materials.setEmissiveBase(this.flameMat, burning ? 4 : 0);
  }

  // ---------------------------------------------------------------- herds

  _animalGeos() {
    const leg = (x, z, h, r, c) => paint(new THREE.CylinderGeometry(r, r * 0.85, h, 5).translate(x, h / 2, z), c, 0);
    // Cow (Holstein, patches painted per vertex).
    const cowBody = new THREE.CapsuleGeometry(0.42, 1.1, 4, 8).rotateX(Math.PI / 2).translate(0, 1.05, 0);
    const cow = mergeGeometries([
      paint(cowBody, 0xffffff, 0),
      leg(0.25, 0.55, 0.75, 0.09, 0xf0ece4),
      leg(-0.25, 0.55, 0.75, 0.09, 0x2a2420),
      leg(0.25, -0.55, 0.75, 0.09, 0x2a2420),
      leg(-0.25, -0.55, 0.75, 0.09, 0xf0ece4),
      paint(new THREE.BoxGeometry(0.34, 0.36, 0.55).translate(0, 1.25, 1.15), 0x2a2420, 1),
      paint(new THREE.BoxGeometry(0.28, 0.2, 0.2).translate(0, 1.15, 1.46), 0xd9a3a0, 1),
      paint(new THREE.ConeGeometry(0.04, 0.18, 4).rotateZ(-1.2).translate(0.2, 1.45, 1.05), 0xe8e0c8, 1),
      paint(new THREE.ConeGeometry(0.04, 0.18, 4).rotateZ(1.2).translate(-0.2, 1.45, 1.05), 0xe8e0c8, 1),
      paint(new THREE.CylinderGeometry(0.03, 0.02, 0.7, 4).translate(0, 0.85, -0.95), 0x2a2420, 0),
    ]);
    // Patches: darken body vertices by a hashed pattern.
    const cp = cow.attributes.position;
    const cc = cow.attributes.color;
    for (let i = 0; i < cp.count; i += 3) {
      const x = cp.getX(i);
      const y = cp.getY(i);
      const z = cp.getZ(i);
      if (y > 0.7 && Math.abs(z) < 1.0 && Math.sin(x * 7 + z * 4.3) * Math.cos(z * 5.1 - y * 3) > 0.2) for (let v = 0; v < 3; v++) cc.setXYZ(i + v, 0.12, 0.1, 0.09);
    }
    // Sheep: a cloud of wool on thin dark legs.
    const wool = [];
    for (let k = 0; k < 7; k++) wool.push(paint(new THREE.IcosahedronGeometry(0.32, 1).translate(Math.cos(k) * 0.18, 0.72 + (k % 3) * 0.08, (k - 3) * 0.13), 0xf2eee4, 0));
    const sheep = mergeGeometries([
      ...wool,
      leg(0.15, 0.3, 0.5, 0.045, 0x1c1a18),
      leg(-0.15, 0.3, 0.5, 0.045, 0x1c1a18),
      leg(0.15, -0.3, 0.5, 0.045, 0x1c1a18),
      leg(-0.15, -0.3, 0.5, 0.045, 0x1c1a18),
      paint(new THREE.BoxGeometry(0.2, 0.24, 0.32).translate(0, 0.85, 0.58), 0x1c1a18, 1),
      paint(new THREE.BoxGeometry(0.2, 0.06, 0.1).translate(0, 0.95, 0.55), 0x1c1a18, 1),
    ]);
    // Camel: long legs, a hump, a long neck.
    const camel = mergeGeometries([
      paint(new THREE.CapsuleGeometry(0.42, 1.0, 4, 8).rotateX(Math.PI / 2).translate(0, 1.7, 0), 0xc9a36a, 0),
      paint(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 0.9, 1.2).translate(0, 2.15, -0.05), 0xc09a60, 0),
      leg(0.22, 0.5, 1.45, 0.08, 0xb89058),
      leg(-0.22, 0.5, 1.45, 0.08, 0xb89058),
      leg(0.22, -0.5, 1.45, 0.08, 0xb89058),
      leg(-0.22, -0.5, 1.45, 0.08, 0xb89058),
      paint(new THREE.CylinderGeometry(0.12, 0.17, 1.0, 6).rotateX(-0.6).translate(0, 2.15, 0.95), 0xc9a36a, 1),
      paint(new THREE.BoxGeometry(0.22, 0.24, 0.55).translate(0, 2.55, 1.35), 0xc9a36a, 1),
    ]);
    return { cow, sheep, camel };
  }

  _herds() {
    const t = this.terrain;
    const tr = this.track;
    const rng = this.rng;
    const G = this._animalGeos();
    const lists = { cow: [], sheep: [], camel: [] };
    const want = { cow: this.cfg.cows, sheep: this.cfg.sheep, camel: this.cfg.camels };
    const half = t.size / 2 - 60;
    const n = new THREE.Vector3();
    for (const kind of ['cow', 'sheep', 'camel']) {
      let placed = 0;
      let guard = 0;
      while (placed < want[kind] && guard++ < 3000) {
        const x = rng.range(-half, half);
        const z = rng.range(-half, half);
        const h = t.heightAt(x, z);
        if (h < 3 || h > 70) continue;
        if (tr.clearance(x, z) < 30) continue;
        if (t.normalAt(x, z, n).y < 0.95) continue;
        const w = t.weightsAt(x, z);
        if (kind === 'camel' ? w.rock > 0.3 : w.grass < 0.55) continue;
        // A little herd around this spot.
        const size = kind === 'sheep' ? 6 + Math.floor(rng.random() * 12) : 3 + Math.floor(rng.random() * 6);
        const spread = kind === 'sheep' ? 9 : 14;
        const keep = this.island.opts && this.island.opts.keepOut;
        for (let k = 0; k < size && placed < want[kind]; k++) {
          const ax = x + rng.range(-spread, spread);
          const az = z + rng.range(-spread, spread);
          if (tr.clearance(ax, az) < 26 || (keep && keep(ax, az))) continue;
          const ah = t.heightAt(ax, az);
          _q.setFromAxisAngle(UP, rng.range(0, 6.28));
          const s = rng.range(0.9, 1.1);
          const c = kind === 'cow' && rng.random() < 0.35 ? new THREE.Color(0x8a5a3a) : new THREE.Color(1, 1, 1);
          lists[kind].push({ x: ax, z: az, m: new THREE.Matrix4().compose(new THREE.Vector3(ax, ah - 0.05, az), _q.clone(), new THREE.Vector3(s, s, s)), c });
          placed++;
        }
      }
    }
    // Heads go down to graze and come back up, each animal on its own clock.
    const mat = this._animated({ name: 'בעלי חיים', vertexColors: true, roughness: 0.85 }, 'life-graze', 'float graze = smoothstep(0.2, 0.8, sin(uTime * 0.35 + ph * 3.0) * 0.5 + 0.5); transformed.y -= graze * 0.55 * aMask; transformed.z += graze * 0.18 * aMask;');
    for (const [kind, list] of Object.entries(lists)) this._chunked(G[kind], mat, list, kind === 'cow' ? 'פרות' : kind === 'sheep' ? 'כבשים' : 'גמלים', { cast: true, cell: 260 });
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this._updateReefs();
    this._updateFish(dt);
    this._updateDolphins(dt);
    this._updateBoats(dt);
    this._updateBalloons(dt);
  }
}

