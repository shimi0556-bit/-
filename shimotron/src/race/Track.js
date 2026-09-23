import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RACE, CAR, AI } from './config.js';
import { smoothstep } from '../engine/core/Random.js';


/**
 * A race circuit built from a closed spline:
 *  - path sampled every 2 m with tangents, right vectors and signed curvature,
 *  - a height profile (smoothed, grade-limited, banked in corners) that the
 *    terrain is carved to via heightModifier / splatModifier / clearance,
 *  - a spatial grid for fast "where am I on the track" queries,
 *  - a minimum-curvature racing line with a speed profile for the AI,
 *  - visuals (asphalt with markings, curbs, guard rails, gantry, grandstand,
 *    boards, tyre stacks, cones) and physics (road trimesh, barriers).
 */
export class Track {
  constructor(engine, terrain, controls, stage) {
    this.engine = engine;
    this.terrain = terrain;
    this.stage = stage;
    this.W = RACE.roadHalfWidth;
    this.group = new THREE.Group();
    this.group.name = 'Track';
    this.bodies = [];
    this._buildPath(controls);
    this._chooseStart();
    this._buildProfile();
    this._buildField();
    this._racingLine();
    this.heightModifier = (x, z, h) => this._heightModifier(x, z, h);
    this.splatModifier = (x, z, w, h) => this._splatModifier(x, z, w, h);
    this.clearance = (x, z) => {
      const q = this.nearest(x, z, this._q);
      return q ? q.dist - this.W : 1e9;
    };
    this._q = {};
    // Physics surface rows: asphalt plus gravel shoulders, in ~200 m trimesh chunks.
    const W = this.W;
    this._roadPhysicsRows = { lats: [-(W + 4.5), -(W + 0.4), -W, -W / 2, 0, W / 2, W, W + 0.4, W + 4.5] };
  }

  // ------------------------------------------------------------ geometry

  _buildPath(controls) {
    const curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
    this.length = curve.getLength();
    const n = Math.round(this.length / 2);
    const pts = curve.getSpacedPoints(n).slice(0, n);
    this.n = n;
    this.ds = this.length / n;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i].x;
      this.z[i] = pts[i].z;
    }
    this._computeFrames();
  }

  _computeFrames() {
    const n = this.n;
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.kappa = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    for (let i = 0; i < n; i++) {
      const a = (i - 3 + n) % n;
      const b = (i + 3) % n;
      // Signed curvature: positive when the road bends toward its right side.
      const dtx = this.tx[b] - this.tx[a];
      const dtz = this.tz[b] - this.tz[a];
      const rx = -this.tz[i];
      const rz = this.tx[i];
      this.kappa[i] = (dtx * rx + dtz * rz) / (6 * this.ds);
    }
    this.kappa = this._smoothLoop(this.kappa, 3, 2);
    this.dist = new Float32Array(n);
    for (let i = 0; i < n; i++) this.dist[i] = i * this.ds;
  }

  _smoothLoop(arr, radius, passes) {
    const n = arr.length;
    let a = Float32Array.from(arr);
    for (let p = 0; p < passes; p++) {
      const b = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        let w = 0;
        for (let k = -radius; k <= radius; k++) {
          const wk = radius + 1 - Math.abs(k);
          s += a[(i + k + n) % n] * wk;
          w += wk;
        }
        b[i] = s / w;
      }
      a = b;
    }
    return a;
  }

  /** Puts index 0 on the calmest straight so the grid and start line sit on it. */
  _chooseStart() {
    const n = this.n;
    const win = Math.round(240 / this.ds);
    let best = 0;
    let bestCost = Infinity;
    let acc = 0;
    for (let i = 0; i < win; i++) acc += Math.abs(this.kappa[i]);
    for (let i = 0; i < n; i++) {
      if (acc < bestCost) {
        bestCost = acc;
        best = i;
      }
      acc += Math.abs(this.kappa[(i + win) % n]) - Math.abs(this.kappa[i]);
    }
    const start = (best + Math.round(150 / this.ds)) % n;
    const rot = (arr) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = arr[(i + start) % n];
      return out;
    };
    this.x = rot(this.x);
    this.z = rot(this.z);
    this._computeFrames();
  }

  _buildProfile() {
    const n = this.n;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Sample across the road so side slopes pull the profile to a fair middle.
      const rx = -this.tz[i];
      const rz = this.tx[i];
      let s = 0;
      for (const l of [-this.W, 0, this.W]) s += this.terrain.height(this.x[i] + rx * l, this.z[i] + rz * l);
      raw[i] = Math.max(s / 3, 2.9);
    }
    let h = this._smoothLoop(raw, 4, 12);
    const maxRise = 0.085 * this.ds;
    for (let pass = 0; pass < 24; pass++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (h[j] > h[i] + maxRise) h[j] = h[i] + maxRise;
        if (h[j] < h[i] - maxRise) h[j] = h[i] - maxRise;
      }
      for (let i = n - 1; i >= 0; i--) {
        const j = (i - 1 + n) % n;
        if (h[j] > h[i] + maxRise) h[j] = h[i] + maxRise;
        if (h[j] < h[i] - maxRise) h[j] = h[i] - maxRise;
      }
    }
    // Round off crests and dips (vertical curves) after the grade limit, then re-limit.
    for (let round = 0; round < 3; round++) {
      h = this._smoothLoop(h, 8, 3);
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (h[j] > h[i] + maxRise) h[j] = h[i] + maxRise;
          if (h[j] < h[i] - maxRise) h[j] = h[i] - maxRise;
        }
      }
    }
    h = this._smoothLoop(h, 3, 4);
    for (let i = 0; i < n; i++) h[i] = Math.max(h[i], 2.9);
    this.h = h;
    // Banking: the outside of a bend rises (slope in metres per metre of width).
    const bank = new Float32Array(n);
    for (let i = 0; i < n; i++) bank[i] = THREE.MathUtils.clamp(-this.kappa[i] * 9, -0.065, 0.065);
    this.bank = this._smoothLoop(bank, 6, 2);
  }

  _buildField() {
    const cell = 24;
    this.cell = cell;
    this.grid = new Map();
    const reach = this.W + 60;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const x0 = Math.min(this.x[i], this.x[j]) - reach;
      const x1 = Math.max(this.x[i], this.x[j]) + reach;
      const z0 = Math.min(this.z[i], this.z[j]) - reach;
      const z1 = Math.max(this.z[i], this.z[j]) + reach;
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
        for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
          const k = cx * 100003 + cz;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(i);
        }
      }
    }
  }

  /**
   * Nearest centre-line point. Returns {i, u, dist, lat, h, bank, s} where
   * s ∈ [0,1) is the lap fraction and lat the signed lateral offset
   * (+ = right of the direction of travel), or null far from the road.
   */
  nearest(x, z, out = {}) {
    const list = this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!list) return null;
    let best = Infinity;
    let bi = -1;
    let bu = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const j = (i + 1) % this.n;
      const ax = this.x[i];
      const az = this.z[i];
      const vx = this.x[j] - ax;
      const vz = this.z[j] - az;
      let u = ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = x - (ax + vx * u);
      const dz = z - (az + vz * u);
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
        bu = u;
      }
    }
    if (bi < 0) return null;
    const j = (bi + 1) % this.n;
    const cx = this.x[bi] + (this.x[j] - this.x[bi]) * bu;
    const cz = this.z[bi] + (this.z[j] - this.z[bi]) * bu;
    const rx = -(this.tz[bi] + (this.tz[j] - this.tz[bi]) * bu);
    const rz = this.tx[bi] + (this.tx[j] - this.tx[bi]) * bu;
    out.i = bi;
    out.u = bu;
    out.dist = Math.sqrt(best);
    out.lat = (x - cx) * rx + (z - cz) * rz;
    out.h = this.h[bi] + (this.h[j] - this.h[bi]) * bu;
    out.bank = this.bank[bi] + (this.bank[j] - this.bank[bi]) * bu;
    out.s = (bi + bu) / this.n;
    return out;
  }

  /**
   * Exact ray–road intersection for wheel rays (replaces a triangle mesh):
   * asphalt height + banking, and the gravel shoulders that fall away to
   * W + 4.5 m. Returns false when (from.x, from.z) is off the road strip,
   * true when it handled the ray (hit or not). Fills a cannon RaycastResult.
   */
  raycastRoad(from, to, result, body) {
    const q = this.nearest(from.x, from.z, this._rq || (this._rq = {}));
    if (!q) return false;
    const W = this.W;
    const a = Math.abs(q.lat);
    if (a > W + 4.5) return false;
    const n = this.n;
    const i = q.i;
    const j = (i + 1) % n;
    const lc = q.lat < -W ? -W : q.lat > W ? W : q.lat;
    let y = q.h + lc * q.bank;
    let slopeR = a <= W ? q.bank : 0;
    if (a > W) {
      const e = a - W;
      y -= e < 0.4 ? e * 0.25 : 0.1 + (e - 0.4) * 0.02;
      slopeR -= Math.sign(q.lat) * (e < 0.4 ? 0.25 : 0.02);
    }
    const slopeT = (this.h[j] - this.h[i]) / this.ds;
    const tx = this.tx[i];
    const tz = this.tz[i];
    const gx = slopeT * tx - slopeR * tz;
    const gz = slopeT * tz + slopeR * tx;
    const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    const nx = -gx * il;
    const ny = il;
    const nz = -gz * il;
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= len;
    dy /= len;
    dz /= len;
    const denom = nx * dx + ny * dy + nz * dz;
    if (denom > -1e-4) return true;
    const t = (ny * (y - from.y)) / denom;
    if (t < 0 || t > len) return true;
    result.hitPointWorld.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
    result.hitNormalWorld.set(nx, ny, nz);
    result.distance = t;
    result.body = body;
    result.hasHit = true;
    return true;
  }

  /** Road surface height at lateral offset `lat` of sample i (with banking). */
  surfaceY(i, lat) {
    return this.h[i] + lat * this.bank[i];
  }

  /** Position/heading on the track at lap fraction s and lateral offset. */
  pose(s, lat = 0) {
    const f = (((s % 1) + 1) % 1) * this.n;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const u = f - Math.floor(f);
    const x = this.x[i] + (this.x[j] - this.x[i]) * u;
    const z = this.z[i] + (this.z[j] - this.z[i]) * u;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * u;
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * u;
    const tl = Math.hypot(tx, tz);
    const t = new THREE.Vector3(tx / tl, 0, tz / tl);
    const r = new THREE.Vector3(-t.z, 0, t.x);
    const y = this.h[i] + (this.h[j] - this.h[i]) * u + lat * this.bank[i];
    return { position: new THREE.Vector3(x + r.x * lat, y, z + r.z * lat), tangent: t, right: r, index: i };
  }

  _heightModifier(x, z, h) {
    const q = this.nearest(x, z, this._q);
    if (!q || q.dist > this.W + 70) return h;
    const W = this.W;
    const lat = THREE.MathUtils.clamp(q.lat, -(W + 4.5), W + 4.5);
    const roadY = q.h + lat * q.bank;
    let target;
    if (q.dist <= W + 0.4) target = roadY - 0.26;
    else target = roadY - 0.1 - Math.max(0, q.dist - (W + 0.4)) * 0.02;
    const inner = W + 4.5;
    const diff = Math.abs(h - target);
    const k = smoothstep(inner, inner + 5 + diff * 1.35, q.dist);
    return target + (h - target) * k;
  }

  _splatModifier(x, z, w) {
    const q = this.nearest(x, z, this._q);
    if (!q) return w;
    const g = smoothstep(this.W + 5.5, this.W + 3.5, q.dist);
    if (g <= 0) return w;
    return { sand: w.sand * (1 - g), dirt: Math.max(w.dirt, 0.92 * g), rock: w.rock * (1 - g) };
  }

  // -------------------------------------------------------- racing line

  _racingLine() {
    const n = this.n;
    const lim = this.W - 1.5;
    const off = new Float32Array(n);
    const px = new Float32Array(n);
    const pz = new Float32Array(n);
    const place = (i) => {
      px[i] = this.x[i] - this.tz[i] * off[i];
      pz[i] = this.z[i] + this.tx[i] * off[i];
    };
    for (let i = 0; i < n; i++) place(i);
    for (const [stencil, iters] of [
      [12, 160],
      [5, 160],
      [2, 120],
    ]) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
          const a = (i - stencil + n) % n;
          const b = (i + stencil) % n;
          const mx = (px[a] + px[b]) / 2;
          const mz = (pz[a] + pz[b]) / 2;
          const want = (mx - this.x[i]) * -this.tz[i] + (mz - this.z[i]) * this.tx[i];
          off[i] = THREE.MathUtils.clamp(off[i] + (want - off[i]) * 0.7, -lim, lim);
          place(i);
        }
      }
    }
    this.line = this._smoothLoop(off, 2, 2);
    // Speed profile on the line: grip-limited corners, then braking/acceleration passes.
    const v = new Float32Array(n);
    const g = 9.82;
    for (let i = 0; i < n; i++) {
      const a = (i - 4 + n) % n;
      const b = (i + 4) % n;
      const ax = px[a];
      const az = pz[a];
      const bx = px[i];
      const bz = pz[i];
      const cx = px[b];
      const cz = pz[b];
      const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
      const R = area > 1e-6 ? (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(ax - cx, az - cz)) / (4 * area) : 1e6;
      v[i] = Math.min(Math.sqrt(AI.grip * (this.stage.roadGrip || 1) * g * R), CAR.engine.topSpeed + 6);
      // Crests: stay planted (vertical curvature limits speed before the car goes light).
      const hv = (this.h[a] - 2 * this.h[i] + this.h[b]) / (16 * this.ds * this.ds);
      if (hv < -1e-5) v[i] = Math.min(v[i], Math.sqrt((0.75 * g) / -hv));
    }
    const ds = this.ds;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * AI.brakeDecel * ds));
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const acc = CAR.engine.accel * Math.max(0.12, 1 - (v[i] / CAR.engine.topSpeed) ** 2);
        v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * acc * ds));
      }
    }
    this.speed = v;
    this.lineX = px;
    this.lineZ = pz;
  }

  // ------------------------------------------------------------ visuals

  build(materials) {
    const T = materials.bakeRaceKit();
    this._road(T);
    this._curbs(T);
    this._rails(materials);
    this._gantry(materials);
    this._grandstand(materials);
    this._boards(materials);
    this._tyres(materials);
    this._lights(materials);
    return this.group;
  }

  _road(T) {
    const n = this.n;
    const W = this.W;
    const lats = [-W - 0.35, -W, -W * 0.75, -W * 0.5, -W * 0.25, 0, W * 0.25, W * 0.5, W * 0.75, W, W + 0.35];
    const cols = lats.length;
    const rows = n + 1;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const road = new Float32Array(rows * cols * 3);
    const vRep = this.length / Math.round(this.length / 2.5);
    for (let r = 0; r < rows; r++) {
      const i = r % n;
      const rx = -this.tz[i];
      const rz = this.tx[i];
      const d = r === n ? this.length : this.dist[i];
      for (let c = 0; c < cols; c++) {
        const l = lats[c];
        const skirt = Math.abs(l) > W + 0.01;
        const lc = THREE.MathUtils.clamp(l, -W, W);
        const k = (r * cols + c) * 3;
        pos[k] = this.x[i] + rx * l;
        pos[k + 1] = this.surfaceY(i, lc) - (skirt ? 0.4 : 0);
        pos[k + 2] = this.z[i] + rz * l;
        // Square 2.5 m texture tiles; markings come from aRoad, not the UVs.
        uv[(r * cols + c) * 2] = lc / 2.5;
        uv[(r * cols + c) * 2 + 1] = d / vRep;
        road[k] = lc;
        road[k + 1] = d;
        road[k + 2] = this.line[i];
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const cc = a + cols;
        const dd = cc + 1;
        idx.push(a, b, cc, b, dd, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aRoad', new THREE.BufferAttribute(road, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ name: 'אספלט', map: T.asphalt, normalMap: T.asphaltNormal, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.86, metalness: 0 });
    const startLen = 2.4;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uW = { value: W };
      shader.uniforms.uLen = { value: this.length };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aRoad; varying vec3 vRoad;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRoad; uniform float uW; uniform float uLen; float rPaint; float rRubber;\nfloat rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat rNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), f.x), f.y); }')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            float l = vRoad.x; float d = vRoad.y; float line = vRoad.z;
            // Large-scale patching and repairs so the 2.5 m tile never reads as a pattern.
            float macro = rNoise(vec2(d * 0.045, l * 0.12)) * 0.6 + rNoise(vec2(d * 0.21, l * 0.35)) * 0.4;
            diffuseColor.rgb *= 0.82 + macro * 0.36;
            float aw = fwidth(l) * 1.2 + 0.01;
            // Edge lines, dashed centre line.
            float edge = smoothstep(uW - 0.5 - aw, uW - 0.5, abs(l)) * (1.0 - smoothstep(uW - 0.25, uW - 0.25 + aw, abs(l)));
            float dash = step(fract(d / 12.0), 0.45) * (1.0 - smoothstep(0.1, 0.1 + aw, abs(l)));
            // Start / finish chequers across the full width.
            float sd = mod(d + ${startLen / 2}, uLen);
            float inStart = step(sd, ${startLen});
            float chk = mod(floor(l / 0.6) + floor(d / 0.6), 2.0);
            rPaint = max(edge, dash * 0.9);
            vec3 paint = vec3(0.82, 0.82, 0.8);
            diffuseColor.rgb = mix(diffuseColor.rgb, paint, rPaint);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.05), vec3(0.85), chk), inStart);
            rPaint = max(rPaint, inStart);
            // Rubbered-in racing line.
            rRubber = exp(-pow((l - line) / 1.3, 2.0)) * 0.55;
            diffuseColor.rgb *= 1.0 - rRubber * 0.45;
          }`,
        )
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, rPaint * 0.8); roughnessFactor = mix(roughnessFactor, 0.62, rRubber);`);
    };
    mat.customProgramCacheKey = () => 'shimotron-road';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'כביש';
    this.group.add(mesh);
    this.roadMaterial = mat;

  }

  _curbs(T) {
    const n = this.n;
    const W = this.W;
    const inCorner = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (Math.abs(this.kappa[i]) > 1 / 160) inCorner[i] = 1;
    // Extend each run so curbs start before and end after the bend.
    const ext = Math.round(14 / this.ds);
    const mark = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (inCorner[i]) for (let k = -ext; k <= ext; k++) mark[(i + k + n) % n] = 1;
    this.curbMark = mark;
    const profile = [
      [0.0, 0.0],
      [0.25, 0.06],
      [1.0, 0.07],
      [1.3, 0.0],
    ];
    const pos = [];
    const uv = [];
    const idx = [];
    const addRun = (from, len, side) => {
      const base = pos.length / 3;
      for (let r = 0; r <= len; r++) {
        const i = (from + r) % n;
        const rx = -this.tz[i];
        const rz = this.tx[i];
        for (let c = 0; c < profile.length; c++) {
          const [o, y] = profile[c];
          const l = side * (W - 0.08 + o);
          const lc = THREE.MathUtils.clamp(l, -W, W);
          pos.push(this.x[i] + rx * l, this.surfaceY(i, lc) + y + 0.012, this.z[i] + rz * l);
          uv.push(c / (profile.length - 1), (r * this.ds) / 2.4);
        }
      }
      const cols = profile.length;
      for (let r = 0; r < len; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = base + r * cols + c;
          const b = a + 1;
          const cc = a + cols;
          const dd = cc + 1;
          if (side > 0) idx.push(a, b, cc, b, dd, cc);
          else idx.push(a, cc, b, b, cc, dd);
        }
      }
    };
    // Walk runs of marked samples (handles wrap-around).
    let i0 = 0;
    while (i0 < n && mark[i0]) i0++;
    for (let k = 0; k < n; ) {
      const i = (i0 + k) % n;
      if (!mark[i]) {
        k++;
        continue;
      }
      let len = 0;
      while (len < n && mark[(i + len) % n]) len++;
      addRun(i, len, 1);
      addRun(i, len, -1);
      k += len;
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'שפת מסלול', map: T.curb, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    mesh.name = 'שפות';
    this.group.add(mesh);
  }

  _groundY(x, z) {
    return this.terrain.height(x, z);
  }

  _rails(materials) {
    const n = this.n;
    const W = this.W;
    const off = W + 6.5;
    const step = 2; // samples between rail vertices
    const railMat = new THREE.MeshStandardMaterial({ name: 'מעקה', color: 0xc3c9d1, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
    const postGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    postGeo.translate(0, 0.5, 0);
    const posts = [];
    const reflect = [];
    for (const side of [-1, 1]) {
      const pos = [];
      const nrm = [];
      const idx = [];
      const rows = Math.ceil(n / step) + 1;
      const prof = [0.42, 0.58, 0.74];
      for (let r = 0; r < rows; r++) {
        const i = (r * step) % n;
        const rx = -this.tz[i] * side;
        const rz = this.tx[i] * side;
        const x = this.x[i] + rx * off;
        const z = this.z[i] + rz * off;
        const gy = this._groundY(x, z);
        for (let c = 0; c < prof.length; c++) {
          const bulge = c === 1 ? 0.07 : 0;
          pos.push(x - rx * bulge, gy + prof[c], z - rz * bulge);
          nrm.push(-rx, 0, -rz);
        }
        if (r % 2 === 0 && r < rows - 1) {
          posts.push(new THREE.Matrix4().makeRotationY(Math.atan2(this.tx[i], this.tz[i])).setPosition(x + rx * 0.12, gy - 0.05, z + rz * 0.12));
          if (r % 6 === 0) reflect.push({ m: new THREE.Matrix4().makeRotationY(Math.atan2(this.tx[i], this.tz[i])).setPosition(x - rx * 0.03, gy + 0.9, z - rz * 0.03), side });
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < prof.length - 1; c++) {
          const a = r * prof.length + c;
          idx.push(a, a + 1, a + prof.length, a + 1, a + prof.length + 1, a + prof.length);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const rail = new THREE.Mesh(geo, railMat);
      rail.castShadow = true;
      rail.receiveShadow = true;
      rail.name = 'מעקה בטיחות';
      this.group.add(rail);
    }
    const postMesh = new THREE.InstancedMesh(postGeo, materials.lib.darkMetal, posts.length);
    posts.forEach((m, k) => postMesh.setMatrixAt(k, m));
    postMesh.instanceMatrix.needsUpdate = true;
    postMesh.computeBoundingSphere();
    postMesh.castShadow = true;
    postMesh.name = 'עמודי מעקה';
    this.group.add(postMesh);
    // Night reflectors (amber left, white right) that glow under exposure.
    const refl = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.3 });
    materials.trackEmissive(refl, 1.2);
    const rg = new THREE.BoxGeometry(0.16, 0.08, 0.03);
    const rm = new THREE.InstancedMesh(rg, refl, reflect.length);
    reflect.forEach((r, k) => {
      rm.setMatrixAt(k, r.m);
      rm.setColorAt(k, new THREE.Color(r.side < 0 ? 0xffa21f : 0xffffff));
    });
    rm.instanceMatrix.needsUpdate = true;
    if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
    rm.computeBoundingSphere();
    rm.name = 'מחזירי אור';
    this.group.add(rm);
  }

  /** Physics boxes along both guard rails (6 m chords), independent of the visuals. */
  _layoutRails() {
    const n = this.n;
    const off = this.W + 6.5;
    const every = 3; // 6 m chords stay within ~0.1 m of the curved rail
    this.railBoxes = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i += every) {
        const j = (i + every) % n;
        const x = this.x[i] - this.tz[i] * side * off;
        const z = this.z[i] + this.tx[i] * side * off;
        const x2 = this.x[j] - this.tz[j] * side * off;
        const z2 = this.z[j] + this.tx[j] * side * off;
        const mx = (x + x2) / 2;
        const mz = (z + z2) / 2;
        const len = Math.hypot(x2 - x, z2 - z);
        this.railBoxes.push({ x: mx, y: this._groundY(mx, mz) + 0.6, z: mz, len: len + 0.6, yaw: Math.atan2(x2 - x, z2 - z) });
      }
    }
  }

  _canvasMaterial(draw, w, h, emissive = 0) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05, emissiveMap: emissive ? tex : null, emissive: emissive ? 0xffffff : 0x000000 });
    if (emissive) this.engine.materials.trackEmissive(m, emissive);
    return m;
  }

  _gantry(materials) {
    const L = materials.lib;
    const p = this.pose(0, 0);
    const g = new THREE.Group();
    const span = this.W + 1.6;
    const H = 7.4;
    const legGeo = new THREE.BoxGeometry(0.7, H, 0.7);
    legGeo.translate(0, H / 2, 0);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, L.panels);
      leg.position.set(s * span, 0, 0);
      leg.castShadow = true;
      g.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.7, 1.6, 0.8), L.panels);
    beam.position.y = H + 0.3;
    beam.castShadow = true;
    g.add(beam);
    const title = this.stage ? this.stage.name : 'שימוטרון';
    const banner = this._canvasMaterial(
      (c, w, h) => {
        const grd = c.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, '#0d1118');
        grd.addColorStop(0.5, '#1a2230');
        grd.addColorStop(1, '#0d1118');
        c.fillStyle = grd;
        c.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 32) {
          c.fillStyle = (x / 32) % 2 ? '#fff' : '#111';
          c.fillRect(x, 0, 32, 16);
          c.fillStyle = (x / 32) % 2 ? '#111' : '#fff';
          c.fillRect(x, h - 16, 32, 16);
        }
        c.fillStyle = '#ffb020';
        c.font = '700 96px "Karantina", "Secular One", "Arial Hebrew", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.direction = 'rtl';
        c.fillText(`שימוטרון ראלי · ${title}`, w / 2, h / 2 + 4);
      },
      1024,
      128,
      0.35,
    );
    for (const z of [0.41, -0.41]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1, 1.25), banner);
      b.position.set(0, H + 0.3, z);
      if (z < 0) b.rotation.y = Math.PI;
      g.add(b);
    }
    // Five light pods for the start sequence.
    this.startLights = [];
    const podGeo = new THREE.BoxGeometry(0.9, 0.7, 0.45);
    const lampGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20).rotateX(Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const x = (k - 2) * 1.35;
      const pod = new THREE.Mesh(podGeo, L.darkMetal);
      pod.position.set(x, H - 0.85, 0.2);
      g.add(pod);
      const mat = new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff1a0a, emissiveIntensity: 0, roughness: 0.3 });
      materials.trackEmissive(mat, 0);
      for (const zz of [0.44, -0.04]) {
        const lamp = new THREE.Mesh(lampGeo, mat);
        lamp.position.set(x, H - 0.85, zz);
        g.add(lamp);
      }
      this.startLights.push(mat);
    }
    g.position.copy(p.position);
    g.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);
    g.name = 'שער הזינוק';
    this.group.add(g);
    this.gantry = g;
    this.gantryBoxes = [-1, 1].map((s) => {
      const q = p.position.clone().addScaledVector(p.right, s * span);
      return { x: q.x, y: q.y + H / 2, z: q.z, hx: 0.35, hy: H / 2, hz: 0.35, yaw: g.rotation.y };
    });
  }

  setStartLights(lit, green = false) {
    this.startLights.forEach((m, k) => {
      m.emissive.set(green ? 0x22ff55 : 0xff1a0a);
      this.engine.materials.setEmissiveBase(m, green ? 6 : k < lit ? 7 : 0);
    });
  }

  _grandstand(materials) {
    const L = materials.lib;
    const g = new THREE.Group();
    const s0 = -70;
    const s1 = 50;
    const tiers = 7;
    const blocks = [];
    const crowd = [];
    const figure = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.24, 0.8, 6).translate(0, 0.4, 0), new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.95, 0)]);
    const segLen = 10;
    for (let d = s0; d < s1; d += segLen) {
      const p = this.pose(d / this.length, 0);
      const yaw = Math.atan2(p.tangent.x, p.tangent.z);
      for (let k = 0; k < tiers; k++) {
        const lat = this.W + 11 + k * 1.3;
        const q = p.position.clone().addScaledVector(p.right, lat);
        const base = this.h[p.index] - 0.2;
        const top = base + 0.6 + k * 0.62;
        const box = new THREE.BoxGeometry(segLen + 0.02, top - base + 1.5, 1.3);
        box.translate(0, (top - base + 1.5) / 2 - 1.5, 0);
        box.rotateY(yaw);
        box.translate(q.x, base, q.z);
        blocks.push(box);
        for (let c = 0; c < 9; c++) {
          if (Math.random() < 0.18) continue;
          const along = -segLen / 2 + (c + 0.5) * (segLen / 9) + (Math.random() - 0.5) * 0.4;
          const pp = q.clone().addScaledVector(p.tangent, along);
          crowd.push({ x: pp.x, y: top, z: pp.z, yaw: yaw + Math.PI / 2 * (p.right.x * 0 + 1) });
        }
      }
      // Roof over the stand.
      const back = p.position.clone().addScaledVector(p.right, this.W + 11 + tiers * 1.3);
      const roof = new THREE.BoxGeometry(segLen + 0.02, 0.25, tiers * 1.3 + 3);
      roof.rotateX(-0.12);
      roof.rotateY(yaw);
      const mid = p.position.clone().addScaledVector(p.right, this.W + 11 + (tiers * 1.3) / 2 - 0.5);
      roof.translate(mid.x, this.h[p.index] + tiers * 0.62 + 5.2, mid.z);
      blocks.push(roof);
      const col = new THREE.BoxGeometry(0.3, tiers * 0.62 + 5.5, 0.3);
      col.translate(back.x, this.h[p.index] + (tiers * 0.62 + 5.5) / 2 - 0.3, back.z);
      blocks.push(col);
    }
    const stand = new THREE.Mesh(mergeGeometries(blocks.map((b) => (b.index ? b.toNonIndexed() : b))), L.stone);
    stand.castShadow = true;
    stand.receiveShadow = true;
    g.add(stand);
    // Crowd: instanced figures that bounce and cheer.
    this.crowdUniforms = { uTime: { value: 0 }, uCheer: { value: 0.2 } };
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    crowdMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.crowdUniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uCheer;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          transformed.y += abs(sin(uTime * (5.0 + fract(ph) * 3.0) + ph)) * 0.22 * uCheer;
        #endif`,
      );
    };
    crowdMat.customProgramCacheKey = () => 'crowd';
    const people = new THREE.InstancedMesh(figure, crowdMat, crowd.length);
    const palette = ['#e83b3b', '#ffb020', '#39d9ff', '#ffffff', '#1f6fe0', '#1faa59', '#ff7a1a', '#8a4dff', '#2a2a2a'].map((c) => new THREE.Color(c));
    crowd.forEach((c, k) => {
      people.setMatrixAt(k, new THREE.Matrix4().makeRotationY(c.yaw).setPosition(c.x, c.y, c.z));
      people.setColorAt(k, palette[k % palette.length]);
    });
    people.instanceMatrix.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;
    people.computeBoundingSphere();
    people.name = 'קהל';
    g.add(people);
    g.name = 'יציע';
    this.group.add(g);
  }

  _boards(materials) {
    // Braking-distance boards before the slowest corners, billboards on the straights.
    const n = this.n;
    const v = this.speed;
    const corners = [];
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      const nx = (i + 1) % n;
      if (v[i] < v[p] && v[i] <= v[nx] && v[i] < 30) {
        // Local minimum: walk back to where braking starts.
        let b = i;
        let steps = 0;
        while (v[(b - 1 + n) % n] > v[b] + 0.05 && steps < 150) {
          b = (b - 1 + n) % n;
          steps++;
        }
        if (v[b] - v[i] > 10) corners.push({ apex: i, brake: b, side: this.kappa[i] > 0 ? -1 : 1 });
      }
    }
    const boardGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6);
    poleGeo.translate(0, 0.9, 0);
    const labels = {};
    for (const num of [150, 100, 50]) {
      labels[num] = this._canvasMaterial(
        (c, w, h) => {
          c.fillStyle = '#f4f4f0';
          c.fillRect(0, 0, w, h);
          c.strokeStyle = '#111';
          c.lineWidth = 10;
          c.strokeRect(8, 8, w - 16, h - 16);
          c.fillStyle = '#111';
          c.font = '700 110px "JetBrains Mono", monospace';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(num), w / 2, h / 2 + 6);
        },
        256,
        256,
        0.25,
      );
    }
    const L = materials.lib;
    for (const c of corners.slice(0, 12)) {
      for (const num of [150, 100, 50]) {
        const s = (c.brake - Math.round((num - 50) / this.ds) + n) % n;
        const lat = c.side * (this.W + 3.2);
        const p = this.pose(s / n, lat);
        const gy = this._groundY(p.position.x, p.position.z);
        const pole = new THREE.Mesh(poleGeo, L.iron);
        pole.position.set(p.position.x, gy, p.position.z);
        this.group.add(pole);
        const b = new THREE.Mesh(boardGeo, labels[num]);
        b.position.set(p.position.x, gy + 1.9, p.position.z);
        b.lookAt(b.position.clone().sub(p.tangent));
        this.group.add(b);
      }
    }
    this.corners = corners;
    // Billboards on the longest straights.
    const texts = ['שימוטרון', this.stage ? this.stage.name : 'אליפות האיים', 'מהירות · דיוק · אומץ', 'אליפות האיים 2026'];
    const boards = [];
    for (let i = 0; i < n; i += 4) if (v[i] > 50) boards.push(i);
    const picked = [];
    for (const i of boards) if (!picked.some((j) => Math.min(Math.abs(i - j), n - Math.abs(i - j)) < 220)) picked.push(i);
    picked.slice(0, 6).forEach((i, k) => {
      const side = k % 2 ? 1 : -1;
      const p = this.pose(i / n, side * (this.W + 10));
      const gy = this._groundY(p.position.x, p.position.z);
      const text = texts[k % texts.length];
      const mat = this._canvasMaterial(
        (c, w, h) => {
          const grd = c.createLinearGradient(0, 0, w, h);
          grd.addColorStop(0, this.stage ? this.stage.color : '#ffb020');
          grd.addColorStop(1, '#0b0e14');
          c.fillStyle = grd;
          c.fillRect(0, 0, w, h);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          for (let x = -h; x < w; x += 60) {
            c.beginPath();
            c.moveTo(x, h);
            c.lineTo(x + h, 0);
            c.lineTo(x + h + 22, 0);
            c.lineTo(x + 22, h);
            c.fill();
          }
          c.fillStyle = '#fff';
          c.font = '700 150px "Karantina", "Secular One", "Arial Hebrew", sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.direction = 'rtl';
          c.fillText(text, w / 2, h / 2 + 6);
        },
        1024,
        384,
        0.5,
      );
      const board = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), mat);
      face.position.y = 3.6;
      const back = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.6, 0.2), L.darkMetal);
      back.position.set(0, 3.6, -0.12);
      board.add(face, back);
      for (const x of [-3.5, 3.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), L.darkMetal);
        leg.position.set(x, 1.1, -0.12);
        board.add(leg);
      }
      board.position.set(p.position.x, gy, p.position.z);
      board.lookAt(p.position.x - p.right.x * side * 10 + p.tangent.x * 6, gy, p.position.z - p.right.z * side * 10 + p.tangent.z * 6);
      board.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      this.group.add(board);
    });
  }

  _tyres(materials) {
    // Stacked tyre walls on the outside of the slowest corners.
    const tyre = new THREE.TorusGeometry(0.34, 0.15, 8, 18).rotateX(Math.PI / 2);
    const mats = [];
    for (const c of this.corners || []) {
      const side = -c.side;
      for (let k = -6; k <= 6; k++) {
        const s = (c.apex + k * 1 + this.n) % this.n;
        const p = this.pose(s / this.n, side * (this.W + 5.3));
        const gy = this._groundY(p.position.x, p.position.z);
        for (let h = 0; h < 3; h++) mats.push(new THREE.Matrix4().setPosition(p.position.x, gy + 0.15 + h * 0.3, p.position.z));
      }
    }
    if (!mats.length) return;
    const mesh = new THREE.InstancedMesh(tyre, materials.lib.rubber, mats.length);
    mats.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.name = 'חומת צמיגים';
    this.group.add(mesh);
  }

  _lights(materials) {
    // Floodlight masts along the track: emissive heads (cheap), plus two real lights at the start.
    const n = this.n;
    const every = Math.round(180 / this.ds);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 12, 8);
    poleGeo.translate(0, 6, 0);
    const headGeo = new THREE.BoxGeometry(1.4, 0.5, 0.35);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xfff1d6, emissiveIntensity: 0, roughness: 0.4 });
    materials.trackEmissive(headMat, 0);
    this.floodHead = headMat;
    const poles = [];
    const heads = [];
    for (let i = 0; i < n; i += every) {
      const side = (i / every) % 2 ? 1 : -1;
      const p = this.pose(i / n, side * (this.W + 8.2));
      const gy = this._groundY(p.position.x, p.position.z);
      poles.push(new THREE.Matrix4().setPosition(p.position.x, gy, p.position.z));
      const yaw = Math.atan2(-p.right.x * side, -p.right.z * side);
      heads.push(new THREE.Matrix4().makeRotationY(yaw).setPosition(p.position.x - p.right.x * side * 0.6, gy + 12, p.position.z - p.right.z * side * 0.6));
    }
    const pm = new THREE.InstancedMesh(poleGeo, materials.lib.iron, poles.length);
    poles.forEach((m, k) => pm.setMatrixAt(k, m));
    const hm = new THREE.InstancedMesh(headGeo, headMat, heads.length);
    heads.forEach((m, k) => hm.setMatrixAt(k, m));
    for (const m of [pm, hm]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = true;
      this.group.add(m);
    }
    this.startLightsReal = [];
    for (const d of [-25, 35]) {
      const p = this.pose(d / this.length, 0);
      const l = new THREE.PointLight(0xfff0d8, 0, 60, 2);
      l.position.copy(p.position).add(new THREE.Vector3(0, 11, 0));
      this.group.add(l);
      this.startLightsReal.push(l);
    }
  }

  // ------------------------------------------------------------ physics

  buildPhysics(physics) {
    const W = this.W;
    if (!this.railBoxes) this._layoutRails();
    const lats = this._roadPhysicsRows.lats;
    // The asphalt itself has no collision mesh: wheels use raycastRoad(), and the
    // chassis' skid spheres rest on the terrain carved 0.26 m under it.
    this.roadBody = new CANNON.Body({ mass: 0, material: physics.materials.ground });
    // Rails as compound static bodies (~100 m each) to keep the body count low.
    const per = 16;
    for (let k = 0; k < this.railBoxes.length; k += per) {
      const group = this.railBoxes.slice(k, k + per);
      const o = group[0];
      const body = new CANNON.Body({ mass: 0, material: physics.materials.metal });
      body.position.set(o.x, o.y, o.z);
      for (const b of group) {
        const q = new CANNON.Quaternion().setFromEuler(0, b.yaw, 0);
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 0.75, b.len / 2)), new CANNON.Vec3(b.x - o.x, b.y - o.y, b.z - o.z), q);
      }
      physics.world.addBody(body);
      this.bodies.push(body);
    }
    for (const b of this.gantryBoxes || []) {
      const body = new CANNON.Body({ mass: 0, material: physics.materials.metal });
      body.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)));
      body.position.set(b.x, b.y, b.z);
      body.quaternion.setFromEuler(0, b.yaw, 0);
      physics.world.addBody(body);
      this.bodies.push(body);
    }
  }

  update(dt, engine) {
    if (this.crowdUniforms) this.crowdUniforms.uTime.value = engine.time.elapsed;
    const night = engine.atmosphere.nightFactor;
    if (this.floodHead) engine.materials.setEmissiveBase(this.floodHead, 0.2 + night * 6);
    for (const l of this.startLightsReal || []) l.intensity = night * 40;
  }

  /** Minimap polyline (x, z) and bounds. */
  outline(step = 4) {
    const pts = [];
    for (let i = 0; i < this.n; i += step) pts.push([this.x[i], this.z[i]]);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    return { pts, minX, maxX, minZ, maxZ };
  }

  dispose(physics) {
    for (const b of this.bodies) physics.world.removeBody(b);
    this.bodies = [];
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

