import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';
import { waveAt } from '../engine/world/Water.js';
import { coralShader } from './Corals.js';
import { Megafauna } from './Megafauna.js';
import { Wrecks } from './Wrecks.js';
import { paint, coralGeometries, CORAL_HEIGHT, CORAL_MAT, CORAL_COLORS, CORAL_SCALE, ZONES, pickWeighted, SPECIES, fishGeometry, FISH_PATTERN_GLSL } from './Sealife.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _w = { y: 0, dx: 0, dz: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
/**
 * Life around an island, above and below the water:
 *   reefs    the whole sea floor grows: coral gardens on the shelf
 *            (staghorn, brain, table, pillar, plate and soft corals, sea
 *            fans, anemones, giant clams, barrel and tube sponges), sea
 *            grass and starfish on the sand, sea whips, fans and sponges
 *            down the deep slopes, kelp forests (shapes in Sealife.js);
 *   fish     schools of many species that wheel around their reefs and
 *            dart away from a diver, reef sharks, eagle rays and turtles;
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
    // What the racing craft bump into: hulls (vertical cylinders) and balloons (spheres), moved every frame.
    this.solids = [];
  }

  build() {
    const c = this.cfg;
    if (c.reef > 0) this._reefs();
    // Wrecks on the sea floor; reef fish gather round them too.
    if (c.fish > 0) {
      this.wrecks = new Wrecks(this.engine, this);
      this.group.add(this.wrecks.build());
      if (this.reefSpots) for (const w of this.wrecks.spots) for (let k = 0; k < 8; k++) this.reefSpots.push({ x: w.x + this.rng.range(-12, 12), z: w.z + this.rng.range(-12, 12) });
    }
    if (c.fish > 0) this._fish();
    if (c.dolphins > 0) this._dolphins();
    if (c.boats > 0) this._boats();
    if (c.balloons > 0) this._balloons();
    if (c.cows + c.sheep + c.camels > 0) this._herds();
    // Whales, whale sharks, mantas, hammerheads, bait balls and jellyfish.
    if (c.fish > 0) {
      this.giants = new Megafauna(this.engine, this);
      this.group.add(this.giants.build());
      this.solids.push(...this.giants.solids);
    }
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
        it.mesh = mesh;
        it.slot = i;
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 40; // animals wander off a little
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

  /**
   * Coral models (near and far detail) and their three materials, shared
   * with the submarine course's reef canyon: rigid corals with the coral
   * surface shader, swaying soft growth, and gorgonian nets.
   */
  coralKit() {
    if (this._kit) return this._kit;
    const seed = this.stage.seed * 13 + 5;
    const geos = coralGeometries(seed, 0);
    const lo = coralGeometries(seed, 1);
    const heights = {};
    for (const k in geos) heights[k] = geos[k].boundingBox.max.y;
    Object.assign(CORAL_HEIGHT, heights);
    const rigid = new THREE.MeshStandardMaterial({ name: 'אלמוגים', vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    rigid.onBeforeCompile = (shader) => coralShader(shader, true);
    rigid.customProgramCacheKey = () => 'life-coral-3';
    const swayBody = 'transformed.x += sin(uTime * 1.2 + ph + transformed.y * 1.3) * 0.22 * aMask; transformed.z += cos(uTime * 0.9 + ph * 1.7) * 0.18 * aMask;';
    const sway = this._animated({ name: 'אלמוגים נעים', vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }, 'life-sway-3', swayBody);
    const swayCompile = sway.onBeforeCompile;
    sway.onBeforeCompile = (shader, r) => {
      swayCompile(shader, r);
      coralShader(shader, false);
      // Soft tissue lets light through a little.
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;');
    };
    // Sea fans: a gorgonian net of fine branches round thicker ones fanning from the stem.
    const lace = this._animated({ name: 'מניפות ים', vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }, 'life-fan-3', swayBody);
    const laceCompile = lace.onBeforeCompile;
    lace.onBeforeCompile = (shader, r) => {
      laceCompile(shader, r);
      coralShader(shader, false);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `if (vCP.y > 0.13) {
          vec2 lp = vCP.xy;
          vec2 c = cCells(vec3(lp * 21.0, 0.5));
          float net = 1.0 - smoothstep(0.05, 0.09, c.y - c.x);
          vec2 d = lp - vec2(0.0, 0.1);
          float ang = atan(d.x, d.y) / 3.14159;
          float vein = abs(fract(ang * 5.0 + cNoise(vec3(lp * 3.0, 1.0)) * 0.7) - 0.5);
          float main = 1.0 - smoothstep(0.02, 0.04 + 0.03 * (1.0 - clamp(length(d), 0.0, 1.0)), vein);
          if (max(net, main) < 0.5) discard;
        }`,
      );
    };
    this._kit = { geos, lo, heights, mats: { rigid, sway, lace } };
    return this._kit;
  }

  _coralMat(kind) {
    return this.coralKit().mats[CORAL_MAT[kind] || 'rigid'];
  }

  /**
   * A fixed set of corals (items: { kind, m: Matrix4, c: Color }), drawn in
   * chunks with the reef's own models and materials. The caller owns the
   * returned group (remove it and call `.dispose()` on its meshes when done).
   */
  coralSet(items, cell = 40) {
    const group = new THREE.Group();
    group.name = 'שונית';
    const { geos } = this.coralKit();
    const byKind = new Map();
    for (const it of items) {
      if (!byKind.has(it.kind)) byKind.set(it.kind, []);
      byKind.get(it.kind).push(it);
    }
    for (const [kind, list] of byKind) {
      const cells = new Map();
      for (const it of list) {
        const key = `${Math.floor(it.m.elements[12] / cell)},${Math.floor(it.m.elements[14] / cell)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(it);
      }
      for (const chunk of cells.values()) {
        // Full detail close up, the light models further off (switched in _updateSets).
        const pair = [geos[kind], this.coralKit().lo[kind]].map((geo, lod) => {
          const mesh = new THREE.InstancedMesh(geo, this._coralMat(kind), chunk.length);
          chunk.forEach((it, i) => {
            mesh.setMatrixAt(i, it.m);
            mesh.setColorAt(i, it.c);
          });
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.receiveShadow = true;
          mesh.name = 'שונית';
          mesh.userData.noPick = true;
          mesh.visible = lod === 1;
          group.add(mesh);
          return mesh;
        });
        this._sets = this._sets || [];
        const S = { hi: pair[0], lo: pair[1], c: pair[0].boundingSphere.center, r: pair[0].boundingSphere.radius, dead: false };
        pair[0].addEventListener('dispose', () => (S.dead = true));
        this._sets.push(S);
      }
    }
    return group;
  }

  /** Fixed coral sets (a course's reef canyon, the wrecks): full detail only for chunks near the camera. */
  _updateSets() {
    if (!this._sets) return;
    const cam = this.engine.camera.position;
    for (const S of this._sets) {
      const near = cam.distanceTo(S.c) - S.r < 25;
      S.hi.visible = near;
      S.lo.visible = !near;
    }
    if (this._sets.some((S) => S.dead)) this._sets = this._sets.filter((S) => !S.dead);
  }

  /** One coral of `kind` at (x, floor y, z): random size (never breaking the surface), turn and colour. */
  coralItem(kind, x, y, z, rng, scale = 1) {
    const H = this.coralKit().heights;
    const [s0, s1] = CORAL_SCALE[kind];
    let s = rng.range(s0, s1) * scale;
    s = Math.min(s, (-y - 0.45) / H[kind]);
    if (s < 0.3) return null;
    const lean = kind === 'rock' ? 0.3 : 0.15;
    _q.setFromEuler(_e.set(rng.range(-lean, lean), rng.range(0, 6.28), rng.range(-lean, lean)));
    const c =
      kind === 'kelp'
        ? new THREE.Color().setHSL(rng.range(0.1, 0.17), 0.62, rng.range(0.22, 0.3))
        : kind === 'grass'
        ? new THREE.Color().setHSL(rng.range(0.2, 0.3), 0.5, rng.range(0.2, 0.32))
        : new THREE.Color(rng.pick(CORAL_COLORS[kind])).offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.08, 0.05));
    const sy = kind === 'rock' ? s * rng.range(0.6, 1.1) : s * rng.range(0.8, 1.2);
    return { kind, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y - (kind === 'rock' ? 0.3 * sy : 0.1), z), _q.clone(), new THREE.Vector3(s, sy, s)), c };
  }

  /**
   * Coral is streamed: the sea floor is split into cells, each cell's
   * corals are generated from its own seed the first time the camera comes
   * near, and only the cells around the camera are drawn. That keeps the
   * whole sea floor dense wherever you look without paying for the whole coast.
   */
  _reefs() {
    const t = this.terrain;
    const low = this.engine.quality.presetName === 'low';
    const { geos, lo } = this.coralKit();
    this.reefCellSize = 34;
    this.reefRange = low ? 2 : 3;
    this.reefPerCell = Math.round(190 * Math.min(1.4, 0.55 + this.cfg.reef * 0.6) * (low ? 0.55 : 1));
    this.reefCache = new Map();
    const cells = (this.reefRange * 2 + 1) ** 2;
    const cap = cells * this.reefPerCell;
    // Two sets of meshes: full detail close to the camera, lighter models further out.
    this.reefMeshes = {};
    this.reefMeshesLo = {};
    for (const kind of Object.keys(geos)) {
      const share = kind === 'grass' || kind === 'kelp' ? 0.6 : 0.35;
      for (const [set, geo, k] of [
        [this.reefMeshes, geos[kind], 0.3],
        [this.reefMeshesLo, lo[kind], 1],
      ]) {
        const mesh = new THREE.InstancedMesh(geo, this._coralMat(kind), Math.ceil(cap * share * k));
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, new THREE.Color());
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = 'שונית';
        mesh.userData.noPick = true;
        set[kind] = mesh;
        this.group.add(mesh);
      }
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
      const N = t.noise;
      const cap = this.reefPerCell;
      const H = this.coralKit().heights;
      // A colony: a few of the same kind side by side, as corals settle and spread.
      // Wrecks keep their own ground: nothing grows through them.
      const W = this.wrecks ? this.wrecks.spots : [];
      const onWreck = (px, pz) => W.some((w) => Math.abs(px - w.x) < (w.kind === 'freighter' ? 30 : 20) && Math.abs(pz - w.z) < (w.kind === 'freighter' ? 30 : 20));
      const colony = (kind, x, y, z, scale, n, spread, onTop = null) => {
        for (let j = 0; j < n && cell.length < cap; j++) {
          const px = x + (j ? rng.range(-spread, spread) : 0);
          const pz = z + (j ? rng.range(-spread, spread) : 0);
          if (W.length && onWreck(px, pz)) continue;
          const py = onTop ? onTop(px, pz) : t.heightAt(px, pz);
          if (py === null || py > -0.8) continue;
          const it = this.coralItem(kind, px, py, pz, rng, scale * (j ? rng.range(0.6, 1) : 1));
          if (it) cell.push(it);
        }
      };
      // 1. Bommies: mounds of reef rock crowded with coral, the frame of every reef.
      const TOP = { table: 1.6, branch: 2.4, brain: 1.3, boulder: 1.2, plate: 1, soft: 0.9, leather: 0.9, anemone: 0.8, crinoid: 0.6, tubes: 0.5, clam: 0.4, pillar: 0.3, elkhorn: 0.8, fan: 0.4, octopus: 0.15 };
      const SIDE = { plate: 1.4, fan: 1, tubes: 1, soft: 1, barrel: 0.6, vase: 0.5, anemone: 0.6, boulder: 0.8, brain: 0.8, urchin: 0.6, star: 0.3, eel: 0.5, lobster: 0.35, crab: 0.3, octopus: 0.2 };
      for (let k = 0; k < 10 && cell.length < cap * 0.75; k++) {
        const x = (cx + rng.random()) * S;
        const z = (cz + rng.random()) * S;
        const h = t.heightAt(x, z);
        if (h > -2 || h < -40) continue;
        if (W.length && onWreck(x, z)) continue;
        const cover = t.reefAt ? t.reefAt(x, z, h) : 0;
        if (cover < 0.12 && rng.random() > 0.15) continue;
        const rs = Math.min(rng.range(1.4, 3.6), (-h - 1.2) / H.rock);
        if (rs < 0.9) continue;
        const rock = this.coralItem('rock', x, h, z, rng, rs / 1.7);
        if (!rock) continue;
        // Nearly level, so what grows on top sits on it.
        rock.m.decompose(_p, _q, _s);
        _q.setFromEuler(_e.set(rng.range(-0.06, 0.06), rng.range(0, 6.28), rng.range(-0.06, 0.06)));
        rock.m.compose(_p, _q, _s);
        cell.push(rock);
        const e = rock.m.elements;
        const sx = Math.hypot(e[0], e[1], e[2]);
        const sy = Math.hypot(e[4], e[5], e[6]);
        const R = sx * 1.05;
        const baseY = e[13];
        const top = (px, pz) => {
          const d = Math.hypot(px - x, pz - z) / R;
          if (d > 0.9) return null;
          return baseY + (0.45 + 0.62 * Math.sqrt(1 - d * d)) * sy - 0.12;
        };
        // Its top: tables, thickets, heads, soft corals, crowding each other.
        const nTop = Math.round(6 + rs * 6);
        for (let j = 0; j < nTop && cell.length < cap; j++) {
          const a = rng.range(0, Math.PI * 2);
          const d = Math.sqrt(rng.random()) * 0.8 * R;
          const kind = pickWeighted(rng, TOP);
          colony(kind, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, 0.6 + rng.random() * 0.45, 1 + Math.floor(rng.random() * 2), 0.5, top);
        }
        // Its flanks and foot: plates, fans, sponges, heads.
        const nSide = Math.round(3 + rs * 2);
        for (let j = 0; j < nSide && cell.length < cap; j++) {
          const a = rng.range(0, Math.PI * 2);
          const d = R * rng.range(0.9, 1.3);
          colony(pickWeighted(rng, SIDE), x + Math.cos(a) * d, 0, z + Math.sin(a) * d, 0.7, 1 + Math.floor(rng.random() * 2), 0.6);
        }
      }
      // 2. Gardens between them: colonies by zone (reef, sand, sea grass, deep slope), and kelp forests.
      let gx = 0;
      let gz = 0;
      for (let k = 0; k < cap * 3 && cell.length < cap; k++) {
        if (k % 8 === 0) {
          gx = (cx + rng.random()) * S;
          gz = (cz + rng.random()) * S;
        }
        const x = gx + rng.range(-6, 6);
        const z = gz + rng.range(-6, 6);
        const h = t.heightAt(x, z);
        if (h > -0.8 || h < -70) continue;
        const cover = t.reefAt ? t.reefAt(x, z, h) : 0;
        const patch = 0.55 + 0.45 * N.noise(x * 0.03 + 17, z * 0.03 - 4);
        const kelp = h < -6 && h > -30 && N.noise(x * 0.02 - 30, z * 0.02 + 8) > 0.25;
        let zone;
        let keep;
        if (kelp) {
          zone = null;
          keep = 0.5;
        } else if (cover > 0.05) {
          zone = ZONES.reef;
          keep = 0.45 + 0.55 * cover;
        } else if (h > -16) {
          const meadow = N.noise(x * 0.045 - 3, z * 0.045 + 12) > -0.05;
          zone = meadow ? ZONES.meadow : ZONES.sand;
          keep = (meadow ? 0.85 : 0.5) * patch;
        } else {
          zone = ZONES.deep;
          keep = 0.6 * patch * (0.55 + 0.45 * THREE.MathUtils.smoothstep(-h, 16, 30));
        }
        if (rng.random() > keep) continue;
        const kind = kelp ? 'kelp' : pickWeighted(rng, zone);
        const n = kind === 'grass' || kind === 'kelp' ? 1 : kind === 'branch' || kind === 'elkhorn' ? 2 + Math.floor(rng.random() * 3) : 1 + Math.floor(rng.random() * 2);
        colony(kind, x, 0, z, kind === 'rock' ? 1 : 0.75 + cover * 0.45, n, kind === 'branch' ? 1.1 : 0.9);
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
    const Lo = this.reefMeshesLo;
    const all = this._reefAll || (this._reefAll = [...Object.values(M), ...Object.values(Lo)]);
    // From high up the reef reads through the painted sea floor alone.
    if (cam.y > 120) {
      if (this.reefShown) for (const m of all) m.count = 0;
      this.reefShown = false;
      return;
    }
    const S = this.reefCellSize;
    const cx = Math.floor(cam.x / S);
    const cz = Math.floor(cam.z / S);
    // Cells well behind the camera are left out; turning round refreshes them.
    this.engine.camera.getWorldDirection(_p);
    const look = Math.atan2(_p.x, _p.z);
    const turned = Math.abs(Math.atan2(Math.sin(look - (this.reefLook || 0)), Math.cos(look - (this.reefLook || 0)))) > 0.5;
    const moved = this.reefAt ? Math.hypot(cam.x - this.reefAt.x, cam.z - this.reefAt.z) > 6 : true;
    if (this.reefShown && cx === this.reefCx && cz === this.reefCz && !turned && !moved) return;
    this.reefShown = true;
    this.reefCx = cx;
    this.reefCz = cz;
    this.reefLook = look;
    this.reefAt = { x: cam.x, z: cam.z };
    const near2 = 26 * 26;
    const fx = Math.sin(look);
    const fz = Math.cos(look);
    for (const m of all) m.count = 0;
    const R = this.reefRange;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if ((dx * fx + dz * fz) < -1.6 && Math.abs(_p.y) < 0.85) continue;
        for (const it of this._reefCell(cx + dx, cz + dz)) {
          const e = it.m.elements;
          const ex = e[12] - cam.x;
          const ez = e[14] - cam.z;
          let m = ex * ex + ez * ez < near2 ? M[it.kind] : Lo[it.kind];
          if (m.count >= m.instanceMatrix.count) m = Lo[it.kind];
          if (m.count >= m.instanceMatrix.count) continue;
          m.setMatrixAt(m.count, it.m);
          m.setColorAt(m.count, it.c);
          m.count++;
        }
      }
    }
    for (const m of all) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- fish

  /** Fish material for one kind of motion: 'swim' (tail wiggle), 'flap' (ray wings), 'paddle' (turtle flippers). */
  _fishMaterial(motion) {
    const body = {
      swim: 'transformed.x += sin(uTime * 9.0 + ph * 5.0 + transformed.z * 6.0) * 0.1 * aMask;',
      flap: 'transformed.y += sin(uTime * 2.2 + ph * 3.0 - abs(transformed.x) * 2.0) * 0.28 * aMask;',
      paddle: 'transformed.y += sin(uTime * 1.6 + ph * 3.0) * 0.18 * aMask; transformed.z += cos(uTime * 1.6 + ph * 3.0) * 0.08 * aMask;',
    }[motion];
    const mat = this._animated({ name: 'דגים', vertexColors: true, roughness: 0.38, metalness: 0.28, side: THREE.DoubleSide }, `life-fish-${motion}`, body);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float iPattern; varying vec3 vFishPos; varying float vPattern;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishPos = position; vPattern = iPattern;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFishPos; varying float vPattern;').replace('#include <color_fragment>', `#include <color_fragment>\n${FISH_PATTERN_GLSL}`);
    };
    mat.customProgramCacheKey = () => `life-fish-${motion}-v3`;
    return mat;
  }

  _fish() {
    const t = this.terrain;
    const rng = this.rng;
    const schools = [];
    const half = t.size / 2 - 40;
    const want = Math.round(95 * this.cfg.fish);
    // The big ones are rare: a few of each per island.
    const rare = { shark: 2, ray: 3, turtle: 3, grouper: 4 };
    const counts = {};
    let guard = 0;
    while (schools.length < want && guard++ < 5000) {
      const sp = rng.pick(SPECIES);
      if (rare[sp.name] && (counts[sp.name] || 0) >= rare[sp.name]) continue;
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
      counts[sp.name] = (counts[sp.name] || 0) + 1;
      const n = Math.round(rng.range(sp.count[0], sp.count[1]));
      const fish = [];
      for (let k = 0; k < n; k++) fish.push({ ph: rng.range(0, 6.28), orbit: rng.range(0.3, 1), tilt: rng.range(-0.5, 0.5), rr: rng.range(0.3, 1), off: rng.range(-1, 1), s: sp.size * rng.range(0.85, 1.15), fx: 0, fy: 0, fz: 0 });
      schools.push({ sp, ax: x, az: z, floor, n, fish, ang: rng.range(0, 6.28), roam: rng.range(8, 26) * (sp.radius > 8 ? 2 : 1), dir: rng.random() < 0.5 ? 1 : -1, bob: rng.range(0, 6.28), x, y: 0, z });
    }
    this.schools = schools;
    // One instanced mesh per species: its own body, fins and markings.
    this.fishMeshes = [];
    const mats = { swim: this._fishMaterial('swim'), flap: this._fishMaterial('flap'), paddle: this._fishMaterial('paddle') };
    const c = new THREE.Color();
    for (const sp of SPECIES) {
      const mine = schools.filter((s) => s.sp === sp);
      const total = mine.reduce((a, s) => a + s.n, 0);
      if (!total) continue;
      const geo = fishGeometry(sp.shape);
      geo.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(total).fill(sp.pattern), 1));
      const motion = sp.shape === 'ray' ? 'flap' : sp.shape === 'turtle' ? 'paddle' : 'swim';
      const mesh = new THREE.InstancedMesh(geo, mats[motion], total);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.noPick = true;
      mesh.name = 'להקות דגים';
      let k = 0;
      for (const s of mine) {
        s.mesh = mesh;
        s.base = k;
        for (let i = 0; i < s.n; i++, k++) {
          c.set(sp.color).offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.06, 0.06));
          mesh.setColorAt(k, c);
        }
      }
      mesh.instanceColor.needsUpdate = true;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < total; i++) mesh.setMatrixAt(i, _m);
      this.fishMeshes.push(mesh);
      this.group.add(mesh);
    }
    for (const s of schools) s.hidden = true;
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
    if (!this.fishMeshes) return;
    this._relocateFish();
    const cam = this.engine.camera.position;
    const t = this.time;
    const dirty = new Set();
    for (const s of this.schools) {
      const mesh = s.mesh;
      // Each school owns a fixed run of instances (its colours live there); far schools collapse to nothing.
      if (Math.abs(s.ax - cam.x) > 320 || Math.abs(s.az - cam.z) > 320) {
        if (!s.hidden) {
          _m.makeScale(0, 0, 0);
          for (let i = 0; i < s.n; i++) mesh.setMatrixAt(s.base + i, _m);
          s.hidden = true;
          dirty.add(mesh);
        }
        continue;
      }
      s.hidden = false;
      dirty.add(mesh);
      let k = s.base;
      const sp = s.sp;
      // The school wanders around its anchor.
      s.ang += (dt * sp.speed * s.dir) / s.roam;
      s.x = s.ax + Math.cos(s.ang) * s.roam;
      s.z = s.az + Math.sin(s.ang * 0.8) * s.roam * 0.7;
      const floor = this.terrain.heightAt(s.x, s.z);
      const top = -0.9 - sp.size * 0.3;
      const bottom = floor + 0.6 + sp.size * (sp.floor ? 0.3 : 1);
      const mid = sp.floor ? 0.05 : 0.35;
      // Never out of the water, even where the floor comes up close to the surface.
      s.y = Math.min(top, THREE.MathUtils.clamp(THREE.MathUtils.lerp(bottom, top, mid + 0.15 * Math.sin(t * 0.3 + s.bob)), bottom, top));
      const hx = -Math.sin(s.ang) * s.roam * s.dir;
      const hz = Math.cos(s.ang * 0.8) * s.roam * 0.7 * 0.8 * s.dir;
      const heading = Math.atan2(hx, hz);
      const solo = s.n <= 3 && sp.size > 0.8;
      for (const f of s.fish) {
        const a = t * (0.6 + f.orbit * 0.5) + f.ph;
        const r = sp.radius * f.rr * (solo ? 0.3 : 1);
        let px = s.x + Math.cos(a) * r * 0.6 + f.off * sp.radius * 0.4 * (solo ? 0.3 : 1);
        let pz = s.z + Math.sin(a) * r;
        let py = Math.min(top, THREE.MathUtils.clamp(s.y + Math.sin(a * 1.3 + f.ph) * r * (solo ? 0.05 : 0.3) + f.tilt * (solo ? 0.2 : 1), bottom - 0.6, top));
        // Startled by whoever comes close: the fish dart aside, then drift back.
        const dx = px + f.fx - cam.x;
        const dy = py + f.fy - cam.y;
        const dz = pz + f.fz - cam.z;
        const d = Math.hypot(dx, dy, dz);
        const scare = 7 + sp.size * 3;
        if (d < scare && d > 1e-3 && !solo) {
          const push = ((scare - d) / scare) * dt * 14;
          f.fx += (dx / d) * push;
          f.fy += (dy / d) * push * 0.5;
          f.fz += (dz / d) * push;
        }
        const back = 1 - Math.min(1, dt * 0.6);
        f.fx *= back;
        f.fy *= back;
        f.fz *= back;
        px += f.fx;
        py = Math.min(top, py + f.fy);
        pz += f.fz;
        const yaw = heading + Math.sin(a) * (solo ? 0.15 : 0.35);
        _q.setFromEuler(_e.set(Math.sin(a * 1.3) * (solo ? 0.05 : 0.15), yaw, sp.shape === 'ray' ? Math.sin(t * 0.5 + f.ph) * 0.08 : 0));
        _m.compose(_p.set(px, py, pz), _q, _s.set(f.s, f.s, f.s));
        mesh.setMatrixAt(k++, _m);
      }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
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
      const b = { kind, loop, u: rng.random(), speed, dir: rng.random() < 0.5 ? 1 : -1, lat: rng.range(-15, 15) };
      // Three discs along the hull, bow to stern.
      const [len, beam, top] = { motor: [7, 2.4, 1.3], sail: [9, 2.6, 1.4], fishing: [11, 3.6, 3.0] }[kind];
      b.parts = [0.32, 0, -0.32].map((f, k) => ({ x: 0, z: 0, y0: -1.2, y1: top, r: beam * (k === 0 ? 0.36 : 0.52), off: f * len }));
      this.solids.push(...b.parts);
      list.push(b);
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
      waveAt(x, z, t, amp, _w, -this.terrain.heightAt(x, z));
      const yaw = Math.atan2(tan.x, tan.z);
      for (const S of b.parts) {
        S.x = x + tan.x * S.off;
        S.z = z + tan.z * S.off;
      }
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
      const B = { g: b, flame, s, x: Math.cos(a) * r, z: Math.sin(a) * r, alt: rng.range(70, 210), ph: rng.range(0, 6.28), burn: 0, px: 0, pz: 0 };
      // Envelope and basket; a knock sends the balloon drifting off the other way.
      const push = (nx, nz, v) => {
        B.px += nx * Math.min(v, 20) * 0.25;
        B.pz += nz * Math.min(v, 20) * 0.25;
      };
      B.parts = [
        { x: 0, y: 0, z: 0, r: 7 * s, dy: 9 * s, push },
        { x: 0, y: 0, z: 0, r: 1.5 * s, dy: -4.4 * s, push },
      ];
      this.solids.push(...B.parts);
      this.balloonList.push(B);
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
      b.x += (wx + b.px) * dt;
      b.z += (wz + b.pz) * dt;
      b.px *= 1 - Math.min(1, dt * 0.4);
      b.pz *= 1 - Math.min(1, dt * 0.4);
      // Drifted off the island: come back in on the far side.
      if (Math.hypot(b.x, b.z) > R) {
        b.x = -b.x * 0.9;
        b.z = -b.z * 0.9;
      }
      const ground = Math.max(0, this.terrain.heightAt(b.x, b.z));
      const y = ground + b.alt + Math.sin(this.time * 0.2 + b.ph) * 6;
      b.g.position.set(b.x, y, b.z);
      b.g.rotation.y += dt * 0.03;
      for (const S of b.parts) {
        S.x = b.x;
        S.y = y + S.dy;
        S.z = b.z;
      }
      // Swaying after a knock.
      b.g.rotation.z = THREE.MathUtils.clamp(b.px * 0.03, -0.25, 0.25);
      b.g.rotation.x = THREE.MathUtils.clamp(-b.pz * 0.03, -0.25, 0.25);
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
          const yaw = rng.range(0, 6.28);
          _q.setFromAxisAngle(UP, yaw);
          const s = rng.range(0.9, 1.1);
          const c = kind === 'cow' && rng.random() < 0.35 ? new THREE.Color(0x8a5a3a) : new THREE.Color(1, 1, 1);
          lists[kind].push({ kind, x: ax, z: az, yaw, s, flee: 0, m: new THREE.Matrix4().compose(new THREE.Vector3(ax, ah - 0.05, az), _q.clone(), new THREE.Vector3(s, s, s)), c });
          placed++;
        }
      }
    }
    // Heads go down to graze and come back up, each animal on its own clock.
    const mat = this._animated({ name: 'בעלי חיים', vertexColors: true, roughness: 0.85 }, 'life-graze', 'float graze = smoothstep(0.2, 0.8, sin(uTime * 0.35 + ph * 3.0) * 0.5 + 0.5); transformed.y -= graze * 0.55 * aMask; transformed.z += graze * 0.18 * aMask;');
    for (const [kind, list] of Object.entries(lists)) this._chunked(G[kind], mat, list, kind === 'cow' ? 'פרות' : kind === 'sheep' ? 'כבשים' : 'גמלים', { cast: true, cell: 260 });
    this.animals = [...lists.cow, ...lists.sheep, ...lists.camel];
  }

  /**
   * Animals bolt from an approaching vehicle (`this.threat`: { x, z, speed },
   * set by free roam): they run away from it, round the circuit and the
   * shore, for a few seconds, then settle and graze again.
   */
  _updateHerds(dt) {
    const A = this.animals;
    if (!A || !A.length) return;
    const T = this.threat;
    const t = this.terrain;
    const tr = this.track;
    const dirty = this._herdDirty || (this._herdDirty = new Set());
    for (const a of A) {
      if (T) {
        const dx = a.x - T.x;
        const dz = a.z - T.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < 12 + T.speed * 0.9) {
          if (a.flee <= 0) a.run = { cow: 4.6, sheep: 5.4, camel: 6.2 }[a.kind] * (0.85 + ((a.slot * 7) % 10) * 0.03);
          a.flee = 3 + ((a.slot * 13) % 10) * 0.15;
          const side = ((a.slot % 2) * 2 - 1) * 0.35;
          a.dx = dx / d + (-dz / d) * side;
          a.dz = dz / d + (dx / d) * side;
          if (d < 1.8) {
            // Bumped: shoved aside.
            a.x += (dx / d) * (1.8 - d);
            a.z += (dz / d) * (1.8 - d);
          }
        }
      }
      if (a.flee <= 0) continue;
      a.flee -= dt;
      const run = a.run * Math.min(1, a.flee / 0.8);
      let l = Math.hypot(a.dx, a.dz) || 1;
      let ux = a.dx / l;
      let uz = a.dz / l;
      // Keep off the circuit and out of the sea: turn along the obstacle.
      const nx = a.x + ux * 3;
      const nz = a.z + uz * 3;
      if (tr.clearance(nx, nz) < 24 || t.heightAt(nx, nz) < 2.5) {
        [ux, uz] = [-uz, ux];
        a.dx = ux;
        a.dz = uz;
      }
      a.x += ux * run * dt;
      a.z += uz * run * dt;
      const want = Math.atan2(ux, uz);
      a.yaw += Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw)) * Math.min(1, dt * 6);
      a.gait = (a.gait || 0) + dt * run * 2.2;
      const bob = Math.abs(Math.sin(a.gait)) * 0.12 * Math.min(1, run / 3);
      _q.setFromAxisAngle(UP, a.yaw);
      a.m.compose(_v.set(a.x, t.heightAt(a.x, a.z) - 0.05 + bob, a.z), _q, _s.set(a.s, a.s, a.s));
      a.mesh.setMatrixAt(a.slot, a.m);
      dirty.add(a.mesh);
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    dirty.clear();
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
    this._updateHerds(dt);
    this._updateSets();
    if (this.giants) this.giants.update(dt);
  }
}

