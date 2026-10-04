import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Emitter } from '../engine/fx/Particles.js';
import { Random } from '../engine/core/Random.js';
import { Vehicle } from './Vehicle.js';

const G = 9.82;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The wild island's challenges, on top of the circuit and its jumps
 * (Track._jumps) and gorges (Track._gorges, Canyon):
 *  - waterfalls pouring off the cliffs into pools beside the road, in mist
 *    (one with a rainbow);
 *  - rockfalls: boulders breaking off the slopes above the road, bouncing
 *    and rolling across it (solid: a car hits them, they hit cars);
 *  - lava flows from the crater, one or more crossing the road on a causeway
 *    (leave the road there and the car burns);
 *  - the volcano erupting every half minute or so, throwing glowing lava
 *    bombs that land around the circuit (some on it) and lie there smoking
 *    until they cool and crumble.
 * Every moving rock is a kinematic body: the cars' sweep (Solid.js) sees it
 * with its velocity, so nothing passes through anything.
 *
 * plan() runs before the circuit is built (it opens the barriers where the
 * rocks and the lava cross); build() after the ground is baked.
 */
export class Wilds {
  constructor(engine, island) {
    this.engine = engine;
    this.island = island;
    this.terrain = island.terrain;
    this.track = island.track;
    this.stage = island.stage;
    this.cfg = island.stage.wilds;
    this.rng = new Random(this.stage.seed * 31 + 3);
    this.group = new THREE.Group();
    this.group.name = 'אתגרי הפרא';
    this.time = 0;
    this.rocks = [];
    this.bombs = [];
    this.flows = [];
    this.falls = [];
    this.zones = [];
    this._sq = {};
  }

  // ------------------------------------------------------------ queries

  /** Ground the rocks bounce on: the road surface on the road, else the terrain. */
  groundAt(x, z) {
    const tr = this.track;
    const q = tr.nearest(x, z, this._sq);
    if (q && Math.abs(q.lat) < tr.W + 4.5) {
      const W = tr.W;
      const a = Math.abs(q.lat);
      const lc = Math.max(-W, Math.min(W, q.lat));
      let y = q.h + lc * q.bank;
      if (a > W) {
        const e = a - W;
        y -= e < 0.4 ? e * 0.25 : 0.1 + (e - 0.4) * 0.02;
      }
      return y;
    }
    return this.terrain.heightAt(x, z);
  }

  _normal(x, z, out) {
    const e = 1;
    const hx = this.groundAt(x + e, z) - this.groundAt(x - e, z);
    const hz = this.groundAt(x, z + e) - this.groundAt(x, z - e);
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }

  _trackDist(x, z) {
    const q = this.track.nearest(x, z, this._sq);
    return q ? q.dist : 1e9;
  }

  /** Is p (a car body) in the lava, off the causeway? */
  burns(p) {
    if (!this.lavaGrid) return false;
    const list = this.lavaGrid.get(`${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`);
    if (!list) return false;
    for (const s of list) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz < s.r * s.r && p.y < s.y + 1.6) return this._trackDist(p.x, p.z) > this.track.W + 4.6;
    }
    return false;
  }

  // ------------------------------------------------------------ plan (before the circuit is built)

  plan() {
    const C = this.cfg;
    if (C.rockfalls) this._planRockfalls(C.rockfalls);
    if (C.lavaFlows) this._planFlows(C.lavaFlows);
  }

  /** Stretches with a steep slope rising beside the road: rocks will come down there. */
  _planRockfalls(count) {
    const tr = this.track;
    const n = tr.n;
    const ds = tr.ds;
    const W = tr.W;
    const t = this.terrain;
    const cands = [];
    const skip = Math.round(200 / ds);
    for (let i = skip; i < n - skip; i += 5) {
      if (this._nearJump(i, 90)) continue;
      for (const side of [-1, 1]) {
        const rx = -tr.tz[i] * side;
        const rz = tr.tx[i] * side;
        const hs = [W + 16, W + 30, W + 44].map((l) => t.height(tr.x[i] + rx * l, tr.z[i] + rz * l) - tr.h[i]);
        if (hs[0] > 1 && hs[1] > hs[0] + 3 && hs[2] > hs[1] + 2 && hs[2] > 13 && hs[2] < 90) cands.push({ i, side, score: hs[2] });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const gap = Math.round(380 / ds);
    for (const c of cands) {
      if (this.zones.length >= count) break;
      if (this.zones.some((z) => Math.min(Math.abs(z.i - c.i), n - Math.abs(z.i - c.i)) < gap)) continue;
      this.zones.push({ i: c.i, side: c.side, half: Math.round(32 / ds), next: 4 + this.rng.random() * 4 });
    }
    // Torn-out barriers both sides: a boulder rolls across, nothing for it to pass through.
    tr.gaps = tr.gaps || [];
    for (const z of this.zones) for (const side of [-1, 1]) tr.gaps.push({ i: z.i, side, half: z.half + 4 });
  }

  _nearJump(i, metres) {
    const tr = this.track;
    const k = Math.round(metres / tr.ds);
    for (const J of tr.jumps || []) {
      const d = Math.min(Math.abs(J.i0 - i), tr.n - Math.abs(J.i0 - i));
      const e = Math.min(Math.abs(J.end - i), tr.n - Math.abs(J.end - i));
      if (d < k || e < k) return true;
    }
    return false;
  }

  /** Lava flows: traced downhill from the crater rim, preferring ones that reach (and cross) the circuit. */
  _planFlows(count) {
    const I = this.stage.island;
    const V = I.volcano || (I.volcanoes && I.volcanoes[0]);
    if (!V) return;
    const t = this.terrain;
    const tr = this.track;
    const W = tr.W;
    const traces = [];
    const N = 18;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + this.rng.range(-0.08, 0.08);
      let x = V.x + Math.cos(a) * V.radius * V.craterRadius * 1.25;
      let z = V.z + Math.sin(a) * V.radius * V.craterRadius * 1.25;
      let dx = Math.cos(a);
      let dz = Math.sin(a);
      const pts = [];
      let cross = -1;
      let flat = 0;
      for (let s = 0; s < 420; s++) {
        const h = t.height(x, z);
        pts.push({ x, z, h });
        const q = tr.nearest(x, z, this._sq);
        if (q && q.dist < W && cross < 0) {
          if (this._nearJump(q.i, 120) || q.i < 120 / tr.ds || q.i > tr.n - 160 / tr.ds) break;
          cross = pts.length - 1;
        }
        if (cross >= 0 && pts.length - cross > 45) break; // ~135 m past the road
        if (h < 2.5) break;
        const e = 2;
        const gx = (t.height(x + e, z) - t.height(x - e, z)) / (2 * e);
        const gz = (t.height(x, z + e) - t.height(x, z - e)) / (2 * e);
        const gl = Math.hypot(gx, gz);
        if (gl < 0.015) flat++;
        else flat = 0;
        if (flat > 20) break;
        // Downhill, with momentum (lava keeps going across the road's levelled strip).
        const ix = gl > 1e-4 ? -gx / gl : dx;
        const iz = gl > 1e-4 ? -gz / gl : dz;
        dx = dx * 0.75 + ix * 0.25;
        dz = dz * 0.75 + iz * 0.25;
        const dl = Math.hypot(dx, dz);
        dx /= dl;
        dz /= dl;
        x += dx * 3;
        z += dz * 3;
      }
      if (pts.length > 40) traces.push({ a, pts, cross, score: (cross >= 0 ? 1000 : 0) + pts.length });
    }
    traces.sort((a, b) => b.score - a.score);
    for (const tc of traces) {
      if (this.flows.length >= count) break;
      if (this.flows.some((f) => Math.abs(Math.atan2(Math.sin(f.a - tc.a), Math.cos(f.a - tc.a))) < 0.9)) continue;
      this.flows.push(tc);
    }
    // Where a flow crosses the road there are no barriers: it is a causeway over the lava.
    tr.gaps = tr.gaps || [];
    for (const f of this.flows) {
      if (f.cross < 0) continue;
      const p = f.pts[f.cross];
      const q = tr.nearest(p.x, p.z, this._sq);
      f.crossI = q.i;
      for (const side of [-1, 1]) tr.gaps.push({ i: q.i, side, half: Math.round(16 / tr.ds) });
    }
  }

  // ------------------------------------------------------------ build (after the ground is baked)

  build(materials, colliders) {
    this.materials = materials;
    this.colliders = colliders;
    const T = materials.textures;
    this.rockMat = new THREE.MeshStandardMaterial({ name: 'סלע בזלת', color: 0x6d6a64, roughness: 0.92 });
    materials.triplanar(this.rockMat, T.rock, T.rockNormal, 0.35, 1.1);
    if (this.cfg.waterfalls) this._waterfalls(this.cfg.waterfalls);
    this._lava();
    if (this.zones.length) this._rockfalls();
    if (this.cfg.bombs) this._bombs();
    this._jumpSigns();
    // One listener for every moving rock, inside the fixed physics step.
    const world = this.engine.physics.world;
    this._pre = () => this._step(world.dt || 1 / 120);
    world.addEventListener('preStep', this._pre);
    return this.group;
  }

  // ------------------------------------------------------------ waterfalls

  _waterfalls(count) {
    const tr = this.track;
    const t = this.terrain;
    const W = tr.W;
    const cands = [];
    for (let i = 0; i < tr.n; i += 8) {
      for (const side of [-1, 1]) {
        for (let l = W + 14; l < W + 260; l += 9) {
          const rx = -tr.tz[i] * side;
          const rz = tr.tx[i] * side;
          const x = tr.x[i] + rx * l;
          const z = tr.z[i] + rz * l;
          const path = this._descend(x, z);
          if (!path) continue;
          const top = path[0];
          const bot = path[path.length - 1];
          const drop = top.h - bot.h;
          let run = 0;
          for (let k = 1; k < path.length; k++) run += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
          if (drop < 13 || drop / Math.max(run, 1) < 0.75 || bot.h < 1.5) continue;
          const d = this._trackDist(bot.x, bot.z);
          if (d < W + 7) continue; // the pool stays off the road
          cands.push({ path, drop, d, score: drop * (1.4 - Math.min(1, d / 300)) });
        }
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (this.falls.length >= count) break;
      const b = c.path[c.path.length - 1];
      if (this.falls.some((f) => Math.hypot(f.bot.x - b.x, f.bot.z - b.z) < 200)) continue;
      this.falls.push({ path: c.path, drop: c.drop, bot: b });
    }
    if (!this.falls.length) return;
    this.fallUniforms = { uTime: { value: 0 } };
    const fallMat = this._fallMaterial();
    const poolMat = this._poolMaterial();
    const geos = [];
    const pools = [];
    this.falls.forEach((f, k) => {
      const w = THREE.MathUtils.clamp(f.drop * 0.22, 5, 13);
      geos.push(this._ribbon(f.path, w, 0.45, true));
      const b = f.bot;
      pools.push(this._drape(b.x, b.z, w * 1.35, 0.14));
      // Mist rising off the pool, and spray at the lip.
      const mist = new Emitter(this.engine.particles.systems.spray, {
        position: new THREE.Vector3(b.x, b.h + 0.6, b.z),
        rate: 9 + w,
        radius: w * 0.6,
        spread: 0.7,
        speed: [1.2, 3.4],
        life: [2.5, 4.5],
        size0: [2.5, 4],
        size1: [7, 11],
        color0: [1, 1, 1, 0.35],
        color1: [1, 1, 1, 0],
        drag: 0.6,
        turbulence: 1.2,
        gravity: -0.15,
      });
      this.engine.particles.add(mist);
      this.island.emitters.push(mist);
      // Wet, mossy boulders round the pool (solid).
      for (let r = 0; r < 4; r++) {
        const a = this.rng.range(0, 6.28);
        const rr = w * this.rng.range(1.35, 1.7);
        const x = b.x + Math.cos(a) * rr;
        const z = b.z + Math.sin(a) * rr;
        if (this._trackDist(x, z) < W + 8) continue;
        // Only where the ground is gentle enough to hold a rock (on the cliff it would hang in the air).
        if (Math.abs(t.heightAt(x + 2, z) - t.heightAt(x - 2, z)) > 1.2 || Math.abs(t.heightAt(x, z + 2) - t.heightAt(x, z - 2)) > 1.2) continue;
        const s = this.rng.range(0.9, 2.1);
        const g = this._boulderGeo(1, 3 + r).scale(s * 1.2, s * 0.8, s);
        g.translate(x, t.heightAt(x, z) + s * 0.25, z);
        this._poolRocks = this._poolRocks || [];
        this._poolRocks.push(g);
        this.colliders.sphere(x, t.heightAt(x, z) + s * 0.25 - s * 0.2, z, s * 1.15);
      }
      if (k === 0) this._rainbow(f, w);
    });
    const fm = new THREE.Mesh(mergeGeometries(geos), fallMat);
    fm.name = 'מפלים';
    fm.renderOrder = 4;
    this.group.add(fm);
    const pm = new THREE.Mesh(mergeGeometries(pools), poolMat);
    pm.name = 'בריכות מפל';
    pm.renderOrder = 3;
    pm.receiveShadow = true;
    this.group.add(pm);
    if (this._poolRocks) {
      const rm = new THREE.Mesh(mergeGeometries(this._poolRocks), this.rockMat);
      rm.name = 'סלעי מפל';
      rm.castShadow = true;
      rm.receiveShadow = true;
      this.group.add(rm);
    }
  }

  /** Steepest descent from (x, z) until the slope eases: a waterfall's course, or null. */
  _descend(x, z) {
    const t = this.terrain;
    const pts = [{ x, z, h: t.height(x, z) }];
    let steep = 0;
    for (let s = 0; s < 70; s++) {
      const e = 1.5;
      const gx = (t.height(x + e, z) - t.height(x - e, z)) / (2 * e);
      const gz = (t.height(x, z + e) - t.height(x, z - e)) / (2 * e);
      const gl = Math.hypot(gx, gz);
      if (gl < 0.25) break;
      if (gl > 0.9) steep++;
      x -= (gx / gl) * 1.5;
      z -= (gz / gl) * 1.5;
      pts.push({ x, z, h: t.height(x, z) });
    }
    return steep >= 4 && pts.length > 6 ? pts : null;
  }

  /** A strip of width w along a path, lifted `lift` off the ground; uv: x across, y metres along. */
  _ribbon(path, w, lift, taper = false) {
    const t = this.terrain;
    const pos = [];
    const uv = [];
    const idx = [];
    const cols = 5;
    let along = 0;
    for (let k = 0; k < path.length; k++) {
      const a = path[Math.max(0, k - 1)];
      const b = path[Math.min(path.length - 1, k + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      if (k) along += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z, (path[k].h ?? 0) - (path[k - 1].h ?? 0));
      // A waterfall spreads as it falls; a lava flow widens downhill.
      const f = k / (path.length - 1);
      const ww = taper ? w * (0.55 + 0.45 * f) : w * (0.7 + 0.5 * f);
      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const o = (u - 0.5) * ww;
        const x = path[k].x - dz * o;
        const z = path[k].z + dx * o;
        const bulge = 1 - Math.abs(u - 0.5) * 2;
        pos.push(x, t.heightAt(x, z) + lift * (0.6 + 0.4 * bulge), z);
        uv.push(u, along);
      }
      if (k) {
        const r0 = (k - 1) * cols;
        const r1 = k * cols;
        for (let c = 0; c < cols - 1; c++) idx.push(r0 + c, r1 + c, r0 + c + 1, r0 + c + 1, r1 + c, r1 + c + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // Our own copy for the shaders (three declares \`uv\` only for materials with a texture map).
    g.setAttribute('fuv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Face up whichever way the path turned.
    if (g.attributes.normal.getY(0) < 0) {
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  }

  /** A disc of radius r draped over the ground (a pool's surface), uv: radial distance in x. */
  _drape(x0, z0, r, lift) {
    const t = this.terrain;
    const g = new THREE.CircleGeometry(r, 36, 0, Math.PI * 2).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    // The pool is level at its lowest rim point (water finds its level), never above the ground around it.
    let lvl = Infinity;
    for (let a = 0; a < 12; a++) lvl = Math.min(lvl, t.heightAt(x0 + Math.cos(a) * r, z0 + Math.sin(a) * r));
    for (let i = 0; i < p.count; i++) {
      const x = x0 + p.getX(i);
      const z = z0 + p.getZ(i);
      p.setXYZ(i, x, Math.max(lvl + lift, t.heightAt(x, z) + 0.06), z);
      uv.setXY(i, Math.hypot(p.getX(i) - x0, p.getZ(i) - z0) / r, 0);
    }
    g.setAttribute('fuv', uv.clone());
    g.computeVertexNormals();
    return g;
  }

  _fallMaterial() {
    const U = this.fallUniforms;
    const m = new THREE.MeshStandardMaterial({ name: 'מי מפל', color: 0xe8f6ff, roughness: 0.25, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vFall;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFall = fuv;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime; varying vec2 vFall;
          float fh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
          float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Streaks rushing down, broken into white water; thin and glassy at the edges.
            float across = vFall.x;
            float v = vFall.y;
            float s1 = fn(vec2(across * 14.0, v * 0.45 - uTime * 3.2));
            float s2 = fn(vec2(across * 33.0 + 7.0, v * 1.1 - uTime * 4.6));
            float white = smoothstep(0.35, 0.85, s1 * 0.6 + s2 * 0.5);
            float edge = smoothstep(0.0, 0.18, across) * smoothstep(1.0, 0.82, across);
            diffuseColor.rgb = mix(vec3(0.42, 0.72, 0.78), vec3(0.97), white);
            diffuseColor.a = edge * mix(0.45, 0.95, white);
          }`,
        );
    };
    m.customProgramCacheKey = () => 'wild-falls';
    return m;
  }

  _poolMaterial() {
    const U = this.fallUniforms;
    const m = new THREE.MeshStandardMaterial({ name: 'מי בריכה', color: 0x2a9c96, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.9, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vPool; varying vec3 vPW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPool = fuv; vPW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vPool; varying vec3 vPW;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Foam rings spreading from where the falls hit, clear water out at the rim.
            float r = vPool.x;
            float rings = 0.5 + 0.5 * sin(r * 26.0 - uTime * 3.0 + sin(vPW.x * 0.7) * 1.5);
            float foam = (1.0 - smoothstep(0.15, 0.75, r)) * smoothstep(0.45, 0.95, rings) + (1.0 - smoothstep(0.0, 0.25, r)) * 0.8;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), clamp(foam, 0.0, 1.0));
            diffuseColor.a *= mix(0.75, 1.0, foam) * (1.0 - smoothstep(0.9, 1.0, r) * 0.6);
          }`,
        );
    };
    m.customProgramCacheKey = () => 'wild-pool';
    return m;
  }

  /** A faint rainbow in the mist of the biggest fall, standing over its pool. */
  _rainbow(f, w) {
    const R = w * 2.4;
    const g = new THREE.TorusGeometry(R, w * 0.32, 4, 48, Math.PI);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      const k = THREE.MathUtils.clamp((r - (R - w * 0.32)) / (w * 0.64), 0, 1);
      c.setHSL(0.78 * k, 1, 0.55).toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const bow = new THREE.Mesh(g, m);
    const b = f.bot;
    const q = this.track.nearest(b.x, b.z, {});
    bow.position.set(b.x, b.h + 0.5, b.z);
    // Face the road.
    if (q) {
      const px = this.track.x[q.i];
      const pz = this.track.z[q.i];
      bow.rotation.y = Math.atan2(px - b.x, pz - b.z);
    }
    bow.name = 'קשת בענן';
    this.group.add(bow);
  }

  // ------------------------------------------------------------ lava

  _lava() {
    const isl = this.island;
    if (!isl.lavaUniforms) isl.lavaUniforms = { uTime: { value: 0 }, uGain: { value: 1 } };
    if (!this.flows.length) return;
    const W = this.track.W;
    // Lit like the ground around it (crust in the sun) with the molten parts glowing through:
    // emissive, so it is tone-mapped and exposure-compensated like every other light source.
    const U = isl.lavaUniforms;
    const mat = new THREE.MeshStandardMaterial({ name: 'לבה זורמת', color: 0x2b2220, roughness: 0.9, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vLava;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = fuv;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime; varying vec2 vLava; float wHot;
          float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
          float lfbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += ln(p) * a; p *= 2.03; a *= 0.5; } return s; }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Flowing downhill (y is metres along), crusting over at the cooler banks.
            vec2 p = vec2(vLava.x * 3.0, vLava.y * 0.12 - uTime * 0.16);
            float flow = lfbm(p + lfbm(p * 1.7 + vec2(0.0, -uTime * 0.1)) * 1.4);
            float bank = abs(vLava.x - 0.5) * 2.0;
            float crust = smoothstep(0.42, 0.6, flow + bank * 0.5);
            wHot = 1.0 - crust;
            diffuseColor.rgb = mix(vec3(0.55, 0.12, 0.02), diffuseColor.rgb, crust);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // Saturated and below the tone-mapping knee, or ACES bleaches the melt to white.
          totalEmissiveRadiance = (mix(vec3(0.85, 0.11, 0.0), vec3(1.0, 0.36, 0.03), wHot * wHot) * wHot + vec3(0.25, 0.03, 0.0) * smoothstep(0.75, 0.5, 1.0 - wHot) * (1.0 - wHot)) * emissive * 0.9;`,
        );
    };
    mat.customProgramCacheKey = () => 'wild-lava';
    this.materials.trackEmissive(mat, 1.2);
    const geos = [];
    this.lavaGrid = new Map();
    for (const f of this.flows) {
      const w = 9;
      // Off the road only: across the causeway the flow runs under it (gaps in the strip).
      const runs = [];
      let cur = [];
      for (const p of f.pts) {
        if (this._trackDist(p.x, p.z) < W + 4.8 + w * 0.6) {
          if (cur.length > 1) runs.push(cur);
          cur = [];
        } else cur.push(p);
      }
      if (cur.length > 1) runs.push(cur);
      for (const run of runs) geos.push(this._ribbon(run, w, 0.35));
      f.pts.forEach((p, k) => {
        const ww = w * (0.7 + 0.5 * (k / (f.pts.length - 1)));
        const s = { x: p.x, z: p.z, y: this.terrain.heightAt(p.x, p.z), r: ww / 2 };
        const key = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
        if (!this.lavaGrid.has(key)) this.lavaGrid.set(key, []);
        this.lavaGrid.get(key).push(s);
        for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
          const k2 = `${Math.floor((p.x + ox) / 8)},${Math.floor((p.z + oz) / 8)}`;
          if (!this.lavaGrid.has(k2)) this.lavaGrid.set(k2, []);
          this.lavaGrid.get(k2).push(s);
        }
      });
      // Smoke and sparks off the flow, thickest where it meets the road.
      const at = f.cross >= 0 ? f.pts[Math.max(0, f.cross - 6)] : f.pts[Math.floor(f.pts.length * 0.6)];
      const smoke = new Emitter(this.engine.particles.systems.smoke, {
        position: new THREE.Vector3(at.x, this.terrain.heightAt(at.x, at.z) + 1, at.z),
        rate: 2.2,
        radius: 4,
        spread: 0.3,
        speed: [1.5, 3],
        life: [6, 10],
        size0: [4, 6],
        size1: [14, 22],
        color0: [0.3, 0.26, 0.24, 0.5],
        color1: [0.4, 0.38, 0.36, 0],
        turbulence: 1,
        gravity: -0.3,
      });
      const sparks = new Emitter(this.engine.particles.systems.sparks, {
        position: smoke.position.clone(),
        rate: 6,
        radius: 4,
        spread: 0.5,
        speed: [3, 7],
        life: [0.6, 1.2],
        size0: [0.12, 0.2],
        size1: [0.02, 0.05],
        color0: [1, 0.55, 0.15, 1],
        color1: [1, 0.2, 0.05, 0],
        gravity: 4,
      });
      for (const e of [smoke, sparks]) {
        this.engine.particles.add(e);
        this.island.emitters.push(e);
      }
    }
    if (geos.length) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.name = 'נהר לבה';
      this.group.add(m);
    }
    // Warning boards at every causeway.
    for (const f of this.flows) if (f.crossI !== undefined) this._sign(f.crossI - Math.round(70 / this.track.ds), 'לבה', '#ff5a1a');
  }

  // ------------------------------------------------------------ rocks (rockfall boulders and lava bombs)

  _boulderGeo(r, seed) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position;
    const rng = new Random(seed * 97 + 11);
    const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), rng.range(-0.18, 0.14)]);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const d = _v.clone().normalize();
      let k = 1;
      for (const [b, a] of bumps) k += a * Math.max(0, d.dot(b)) ** 3;
      // Never bigger than the collision sphere (radius r): rocks don't reach into the cars.
      _v.setLength(r * Math.min(1, 0.9 * k));
      p.setXYZ(i, _v.x, _v.y, _v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  /** A pooled rock: a kinematic sphere with a mesh, parked far below when not in use. */
  _rock(r, mat, seed) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.engine.physics.materials.default });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(0, -500, 0);
    body.userData = { wildRock: true };
    this.engine.physics.world.addBody(body);
    this.island.bodies.push(body);
    const mesh = new THREE.Mesh(this._boulderGeo(r, seed), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.group.add(mesh);
    return { body, mesh, r, live: false, age: 0, still: 0, v: new THREE.Vector3() };
  }

  _rockfalls() {
    for (let k = 0; k < this.zones.length * 4; k++) this.rocks.push(this._rock(this.rng.range(0.8, 1.6), this.rockMat, k));
    this.rocks.forEach((R) => (R.mesh.name = 'סלעים נופלים'));
    this.dust = new Emitter(this.engine.particles.systems.dust, {
      rate: 0,
      enabled: false,
      radius: 1.2,
      spread: 1.2,
      speed: [2, 5],
      life: [1.5, 3],
      size0: [1.5, 2.5],
      size1: [5, 8],
      color0: [0.45, 0.4, 0.33, 0.7],
      color1: [0.5, 0.46, 0.4, 0],
      drag: 1.2,
      gravity: -0.2,
    });
    for (const z of this.zones) this._sign(z.i - z.half - Math.round(60 / this.track.ds), 'סלעים', '#f2c230');
  }

  _bombs() {
    const lavaRock = new THREE.MeshStandardMaterial({ name: 'פצצת לבה', color: 0x1a1210, roughness: 0.85, emissive: 0xff4a10, emissiveIntensity: 1 });
    this.materials.trackEmissive(lavaRock, 2.2);
    this.bombMat = lavaRock;
    for (let k = 0; k < 10; k++) {
      const b = this._rock(this.rng.range(0.8, 1.3), lavaRock.clone(), 100 + k);
      this.materials.trackEmissive(b.mesh.material, 2.2);
      b.mesh.name = 'פצצות לבה';
      b.trail = new Emitter(this.engine.particles.systems.fire, {
        rate: 40,
        enabled: false,
        radius: 0.6,
        spread: 0.6,
        speed: [0.5, 1.5],
        life: [0.4, 0.8],
        size0: [1.6, 2.4],
        size1: [0.4, 0.8],
        color0: [1, 0.6, 0.2, 1],
        color1: [1, 0.2, 0.05, 0],
      });
      b.smoke = new Emitter(this.engine.particles.systems.smoke, {
        rate: 10,
        enabled: false,
        radius: 0.5,
        spread: 0.4,
        speed: [0.5, 1.5],
        life: [3, 5],
        size0: [1.5, 2.5],
        size1: [5, 8],
        color0: [0.18, 0.16, 0.15, 0.7],
        color1: [0.35, 0.33, 0.32, 0],
        gravity: -0.4,
      });
      for (const e of [b.trail, b.smoke]) {
        this.engine.particles.add(e);
        this.island.emitters.push(e);
      }
      this.bombs.push(b);
    }
    const I = this.stage.island;
    const V = I.volcano || I.volcanoes[0];
    this.vent = new THREE.Vector3(V.x, this.terrain.height(V.x, V.z) + 4, V.z);
    this.fountain = new Emitter(this.engine.particles.systems.fire, {
      position: this.vent.clone(),
      rate: 0,
      radius: V.radius * V.craterRadius * 0.35,
      spread: 0.32,
      speed: [22, 48],
      life: [2.5, 4.5],
      size0: [5, 9],
      size1: [2, 4],
      color0: [1, 0.62, 0.22, 1],
      color1: [1, 0.18, 0.04, 0],
      gravity: 9,
    });
    this.ash = new Emitter(this.engine.particles.systems.smoke, {
      position: this.vent.clone(),
      rate: 0,
      radius: V.radius * V.craterRadius * 0.4,
      spread: 0.25,
      speed: [10, 22],
      life: [12, 20],
      size0: [20, 30],
      size1: [70, 110],
      color0: [0.14, 0.12, 0.11, 0.85],
      color1: [0.3, 0.28, 0.27, 0],
      drag: 0.25,
      turbulence: 2,
      gravity: -0.6,
    });
    for (const e of [this.fountain, this.ash]) {
      this.engine.particles.add(e);
      this.island.emitters.push(e);
    }
    this.nextEruption = 12;
    this.erupting = 0;
  }

  _erupt() {
    this.erupting = 4.5;
    this.fountain.burst(140);
    this.ash.burst(30);
    const P = this._player();
    this._shake(P, this.vent, 900, 0.35);
    const n = 4 + Math.floor(this.rng.random() * 5);
    const tr = this.track;
    for (let k = 0; k < n; k++) {
      const b = this.bombs.find((x) => !x.live);
      if (!b) break;
      let tx;
      let tz;
      if (P && k < Math.ceil(n / 2)) {
        // Ahead of the player, beside the road (now and then on it).
        const q = tr.nearest(P.x, P.z, this._sq);
        const i = ((q ? q.i : 0) + Math.round(this.rng.range(140, 340) / tr.ds)) % tr.n;
        const side = this.rng.random() < 0.5 ? -1 : 1;
        const lat = this.rng.random() < 0.25 ? this.rng.range(-tr.W * 0.6, tr.W * 0.6) : side * this.rng.range(tr.W + 5, tr.W + 30);
        tx = tr.x[i] - tr.tz[i] * lat;
        tz = tr.z[i] + tr.tx[i] * lat;
      } else {
        const a = this.rng.range(0, 6.28);
        const r = this.rng.range(150, 650);
        tx = this.vent.x + Math.cos(a) * r;
        tz = this.vent.z + Math.sin(a) * r;
      }
      const T = this.rng.range(5, 7.5);
      const ty = this.groundAt(tx, tz) + b.r;
      b.v.set((tx - this.vent.x) / T, (ty - this.vent.y + 0.5 * G * T * T) / T, (tz - this.vent.z) / T);
      b.body.position.set(this.vent.x + this.rng.range(-4, 4), this.vent.y + 6, this.vent.z + this.rng.range(-4, 4));
      b.live = true;
      b.flying = true;
      b.age = 0;
      b.heat = 1;
      b.mesh.visible = true;
      b.trail.enabled = true;
      b.smoke.enabled = true;
    }
  }

  _spawnBoulder(z) {
    const R = this.rocks.find((x) => !x.live) || this.rocks.reduce((a, b) => (a.age > b.age ? a : b));
    if (R.live) this._park(R, true);
    const tr = this.track;
    const i = (z.i + Math.round(this.rng.range(-z.half, z.half)) + tr.n) % tr.n;
    const lat = z.side * this.rng.range(tr.W + 30, tr.W + 44);
    const x = tr.x[i] - tr.tz[i] * lat;
    const zz = tr.z[i] + tr.tx[i] * lat;
    R.body.position.set(x, this.terrain.heightAt(x, zz) + R.r + 1.5, zz);
    // A push off the ledge towards the road.
    R.v.set(tr.tz[i] * z.side * 4, 2, -tr.tx[i] * z.side * 4);
    R.v.x += tr.tx[i] * this.rng.range(-2, 2);
    R.v.z += tr.tz[i] * this.rng.range(-2, 2);
    R.live = true;
    R.age = 0;
    R.still = 0;
    R.mesh.visible = true;
    this.dust.burst(10, R.body.position);
  }

  _park(R, puff = false) {
    if (puff && this.dust) this.dust.burst(14, R.body.position);
    R.live = false;
    R.flying = false;
    R.mesh.visible = false;
    R.body.position.set(0, -500, 0);
    R.body.velocity.setZero();
    R.body.angularVelocity.setZero();
    R.v.set(0, 0, 0);
    if (R.trail) {
      R.trail.enabled = false;
      R.smoke.enabled = false;
    }
  }

  _player() {
    for (const v of Vehicle.live) if (v.body.userData?.car?.isPlayer) return v.body.position;
    const first = Vehicle.live.values().next().value;
    return first ? first.body.position : null;
  }

  _shake(P, at, reach, strength) {
    if (!P) return;
    const d = Math.hypot(P.x - at.x, P.y - at.y, P.z - at.z);
    if (d < reach) this.engine.events.emit('shake', { strength: strength * (1 - d / reach) });
  }

  /** Physics step: gravity, bounces off the ground, rolling; the bodies move with the velocity set here. */
  _step(dt) {
    if (this.island.suspended) return;
    for (const R of this.rocks) if (R.live) this._move(R, dt, 0.32, 0.985);
    for (const B of this.bombs) if (B.live) this._move(B, dt, 0.12, 0.9);
  }

  _move(R, dt, bounce, roll) {
    const b = R.body;
    const p = b.position;
    R.v.y -= G * dt;
    // Where it will be after this step: meet the ground there.
    const nx = p.x + R.v.x * dt;
    const nz = p.z + R.v.z * dt;
    const g = this.groundAt(nx, nz);
    const ny = p.y + R.v.y * dt;
    if (ny - R.r < g) {
      this._normal(nx, nz, _n);
      const vn = R.v.dot(_n);
      if (vn < 0) {
        if (vn < -4) this._impact(R, -vn);
        R.v.addScaledVector(_n, -(1 + bounce) * vn);
        R.v.multiplyScalar(roll);
      }
      // Rest exactly on the surface (no sinking into it): the velocity carries it there this step.
      R.v.y = Math.max(R.v.y, Math.min(20, (g + R.r - p.y) / dt));
      if (R.flying) {
        R.flying = false;
        R.v.multiplyScalar(0.25);
      }
    }
    b.velocity.set(R.v.x, R.v.y, R.v.z);
    // Rolling: spin about the axis across the motion.
    _v.set(R.v.x, 0, R.v.z);
    const sp = _v.length();
    if (sp > 0.05) b.angularVelocity.set(R.v.z / R.r, 0, -R.v.x / R.r);
    else b.angularVelocity.set(0, 0, 0);
  }

  _impact(R, speed) {
    const p = R.body.position;
    if (R.trail) {
      // A lava bomb landing: a burst of fire and sparks.
      const fx = this.engine.particles.systems;
      for (let k = 0; k < 30; k++)
        fx.sparks.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 12, vz: (Math.random() - 0.5) * 16, life: 0.8 + Math.random() * 0.8, size0: 0.2, size1: 0.05, rot: 0, spin: 0, color0: [1, 0.6, 0.2, 1], color1: [1, 0.2, 0.05, 0], gravity: 9 });
      R.smoke.burst(12, p);
      this._shake(this._player(), p, 120, 0.6);
    } else if (this.dust) {
      this.dust.burst(Math.min(12, Math.round(speed)), p);
      this._shake(this._player(), p, 60, 0.25);
    }
  }

  // ------------------------------------------------------------ signs

  /** A warning board beside the road before sample i (both sides), on a solid post. */
  _sign(i, text, color) {
    const tr = this.track;
    i = ((i % tr.n) + tr.n) % tr.n;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 224;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(128, 6);
    g.lineTo(250, 214);
    g.lineTo(6, 214);
    g.closePath();
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(128, 30);
    g.lineTo(226, 200);
    g.lineTo(30, 200);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 44px Heebo, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('!', 128, 120);
    g.font = 'bold 38px Heebo, Arial, sans-serif';
    g.fillText(text, 128, 180);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    const pole = this.materials.lib.darkMetal || this.rockMat;
    for (const side of [-1, 1]) {
      const lat = side * (tr.W + 7.6);
      const x = tr.x[i] - tr.tz[i] * lat;
      const z = tr.z[i] + tr.tx[i] * lat;
      const y = this.terrain.heightAt(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8).translate(0, 1.3, 0), pole);
      post.position.set(x, y, z);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), face);
      board.position.set(x, y + 2.75, z);
      board.rotation.y = Math.atan2(-tr.tx[i], -tr.tz[i]);
      board.name = 'שלט אזהרה';
      post.name = 'עמוד שלט';
      post.castShadow = true;
      this.group.add(post, board);
      this.colliders.post(x, y, z, 0.07, 2.6, 'metal');
    }
  }

  /** Chevron boards before every jump, and a striped lip so you can see where to fly from. */
  _jumpSigns() {
    const tr = this.track;
    if (!tr.jumps) return;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 16;
    const g = cv.getContext('2d');
    for (let k = 0; k < 8; k++) {
      g.fillStyle = k % 2 ? '#111111' : '#f2c230';
      g.fillRect(k * 16, 0, 16, 16);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    const stripe = new THREE.MeshStandardMaterial({ name: 'פס קפיצה', map: tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    for (const J of tr.jumps) {
      this._sign(J.i0 - Math.round(80 / tr.ds), 'קפיצה', '#f2c230');
      // The stripe across the road at the lip, on the surface.
      const i = J.lip;
      const geo = new THREE.PlaneGeometry(tr.W * 2, 0.9, 8, 1).rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const lat = p.getX(k);
        const off = p.getZ(k);
        const x = tr.x[i] - tr.tz[i] * lat - tr.tx[i] * (0.45 + off);
        const z = tr.z[i] + tr.tx[i] * lat - tr.tz[i] * (0.45 + off);
        p.setXYZ(k, x, tr.surfaceY(i, lat) + 0.02, z);
      }
      geo.attributes.uv.array.forEach((_, k, a) => {
        if (k % 2 === 0) a[k] *= tr.W;
      });
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, stripe);
      m.name = 'פס קפיצה';
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    this.time += dt;
    if (this.fallUniforms) this.fallUniforms.uTime.value = this.time;
    const cars = [...Vehicle.live];
    // Rockfall: while a car is near a zone, a boulder every few seconds.
    for (const z of this.zones) {
      const tr = this.track;
      const near = cars.some((v) => Math.hypot(v.body.position.x - tr.x[z.i], v.body.position.z - tr.z[z.i]) < 380);
      if (!near) continue;
      z.next -= dt;
      if (z.next <= 0) {
        this._spawnBoulder(z);
        z.next = this.rng.range(3, 7);
      }
    }
    for (const R of this.rocks) {
      if (!R.live) continue;
      R.age += dt;
      const p = R.body.position;
      R.mesh.position.set(p.x, p.y, p.z);
      R.mesh.quaternion.set(R.body.quaternion.x, R.body.quaternion.y, R.body.quaternion.z, R.body.quaternion.w);
      const sp = R.v.length();
      R.still = sp < 0.4 ? R.still + dt : 0;
      const onRoad = this._trackDist(p.x, p.z) < this.track.W + 2;
      if (p.y < -2 || R.age > 24 || R.still > (onRoad ? 5 : 14)) this._park(R, p.y > -2);
    }
    if (this.bombs.length) {
      this.nextEruption -= dt;
      if (this.nextEruption <= 0) {
        this._erupt();
        this.nextEruption = this.rng.range(22, 38);
      }
      if (this.erupting > 0) {
        this.erupting -= dt;
        this.fountain.burst(Math.ceil(dt * 60));
        this.ash.burst(Math.random() < dt * 8 ? 1 : 0);
        const L = this.island.lights[0];
        if (L) L.light.intensity = L.base * (2.5 + Math.random());
      }
      for (const B of this.bombs) {
        if (!B.live) continue;
        B.age += dt;
        const p = B.body.position;
        B.mesh.position.set(p.x, p.y, p.z);
        B.mesh.quaternion.set(B.body.quaternion.x, B.body.quaternion.y, B.body.quaternion.z, B.body.quaternion.w);
        B.trail.position.set(p.x, p.y, p.z);
        B.smoke.position.set(p.x, p.y, p.z);
        B.trail.enabled = B.flying;
        if (!B.flying) {
          // Lying where it fell, cooling: the glow fades, then it crumbles.
          B.heat = Math.max(0, B.heat - dt / 10);
          B.mesh.material.emissiveIntensity = 0.15 + B.heat * 0.85;
          B.smoke.rate = 3 + B.heat * 8;
        }
        if (p.y < -1) {
          this.engine.particles.systems.spray && new Emitter(this.engine.particles.systems.spray, { position: p.clone(), spread: 0.5, speed: [4, 9], life: [1, 2], size0: [1, 2], size1: [3, 5], gravity: 9 }).burst(25);
          this._park(B);
        } else if (B.age > 22 || (!B.flying && B.heat <= 0)) {
          if (this.dust) this.dust.burst(10, p);
          this._park(B);
        }
      }
    }
  }

  dispose() {
    if (this._pre) this.engine.physics.world.removeEventListener('preStep', this._pre);
  }
}
