import * as THREE from 'three';
import { Random } from '../engine/core/Random.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A gate course around the island in play, for the craft races:
 *   boat    a lap of the island over open water, clear of the shallows,
 *           threading between bridge piers, through inflatable arches;
 *   sub     a lap along the reef shelf a few metres off the sea floor,
 *           through glowing rings, dipping into the trenches;
 *   plane   a lap around and over the island through air gates, low over
 *           the sea and under every bridge it crosses;
 *   glider  one descent from high over the island, around it through
 *           gates, past thermals, down to a landing target by the shore.
 * The course offers the same queries the HUD and drivers use on a Track:
 * nearest(), pose(), outline(), length, x/z samples.
 */
export class Course {
  constructor(kind, { island, world, engine, materials }) {
    this.kind = kind;
    this.island = island;
    this.world = world;
    this.engine = engine;
    this.materials = materials;
    this.stage = island.stage;
    this.terrain = island.terrain;
    this.rng = new Random(this.stage.seed * 17 + kind.length * 101);
    this.closed = kind !== 'glider';
    this.group = new THREE.Group();
    this.group.name = 'מסלול שערים';
    this.thermals = [];
    const obs = world.obstacles();
    this.piers = obs.piers;
    this.decks = obs.decks;
  }

  /** Ground or sea floor in local coordinates, also beyond the island's own square. */
  ground(x, z) {
    const half = this.terrain.size / 2;
    if (Math.abs(x) < half - 2 && Math.abs(z) < half - 2) return this.terrain.heightAt(x, z);
    return this.world.groundAt(...this.world.toWorld(x, z));
  }

  build() {
    const ctrl = this[`_${this.kind}`]();
    this.curve = new THREE.CatmullRomCurve3(ctrl, this.closed, 'centripetal', 0.5);
    this._sample();
    if (this.kind === 'sub') this._settleDepth();
    if (this.kind === 'plane') this._settleAltitude();
    this._gates();
    this._visuals();
    this.engine.scene.add(this.group);
    return this;
  }

  // ------------------------------------------------------------ layouts

  /** Radius per angle where the sea is at least `depth` deep, walking out from the middle of the island. */
  _shore(angles, depth, from = 0.45) {
    const R = this.stage.island.radius;
    const half = this.terrain.size / 2 + 700;
    return angles.map((a) => {
      let r = R * from;
      let run = 0;
      while (r < half) {
        if (this.ground(Math.cos(a) * r, Math.sin(a) * r) < -depth) {
          if (++run >= 4) break;
        } else run = 0;
        r += 10;
      }
      return r - 30;
    });
  }

  _smooth(v, k = 2, loops = 2) {
    let a = v.slice();
    const n = a.length;
    for (let l = 0; l < loops; l++) {
      a = a.map((_, i) => {
        let s = 0;
        for (let j = -k; j <= k; j++) s += a[(i + j + n) % n];
        return s / (2 * k + 1);
      });
    }
    return a;
  }

  /** Pushes control points off bridge piers (and pylon legs). */
  _clearPiers(pts, clear) {
    for (let pass = 0; pass < 4; pass++) {
      const curve = new THREE.CatmullRomCurve3(pts, this.closed, 'centripetal', 0.5);
      const S = curve.getSpacedPoints(Math.round(curve.getLength() / 5));
      let moved = false;
      for (const p of S) {
        for (const P of this.piers) {
          const d = Math.hypot(p.x - P.x, p.z - P.z);
          if (d > clear) continue;
          // Nudge the nearest control point sideways, away from the pier.
          let best = 0;
          let bd = Infinity;
          pts.forEach((c, i) => {
            const dd = Math.hypot(c.x - p.x, c.z - p.z);
            if (dd < bd) {
              bd = dd;
              best = i;
            }
          });
          const c = pts[best];
          const ux = (p.x - P.x) / (d || 1);
          const uz = (p.z - P.z) / (d || 1);
          c.x += ux * (clear - d + 2);
          c.z += uz * (clear - d + 2);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /** Direction of this island's bridge (the coastal circuits run past it, and under it). */
  _bridgeAngle() {
    const L = this.world.landings[this.stage.id];
    if (L && L.length) return Math.atan2(L[0].bz, L[0].bx);
    return this.rng.range(0, 6.28);
  }

  /**
   * A coastal circuit: out along the shore over an arc of the island, a
   * wide turn, and back further offshore. `offset` is the inner line's
   * distance off the depth contour, `width` the gap to the outer line.
   */
  _coastal(depth, arc, offset, width, y) {
    const mid = this._bridgeAngle() + this.rng.range(-0.25, 0.25);
    const N = 14;
    const a0 = mid - arc / 2;
    const angles = Array.from({ length: N + 1 }, (_, i) => a0 + (i / N) * arc);
    const shore = this._smooth(this._shore(angles, depth), 1, 2).map((r) => r + offset);
    const pts = [];
    angles.forEach((a, i) => {
      const r = shore[i] + Math.sin(i * 1.3 + mid) * width * 0.08;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    });
    // Round the far end, then run back offshore.
    const turn = (a, r0, r1) => [0.3, 0.7].map((f) => new THREE.Vector3(Math.cos(a + (a === angles[N] ? 1 : -1) * 0.05) * (r0 + (r1 - r0) * f), y, Math.sin(a + (a === angles[N] ? 1 : -1) * 0.05) * (r0 + (r1 - r0) * f)));
    pts.push(...turn(angles[N], shore[N], shore[N] + width));
    for (let i = N; i >= 0; i--) {
      const a = angles[i];
      const r = shore[i] + width + Math.sin(i * 0.9 - mid) * width * 0.15;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    pts.push(...turn(angles[0], shore[0] + width, shore[0]).reverse());
    return pts;
  }

  _boat() {
    const pts = this._coastal(6, 0.95, 70, 220, 0);
    // Keep off the shallows everywhere along the curve, then clear the piers.
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
      const n = pts.length;
      for (let i = 0; i < n * 3; i++) {
        const p = curve.getPoint(i / (n * 3));
        const t = curve.getTangent(i / (n * 3));
        for (const lat of [-18, 0, 18]) {
          if (this.ground(p.x - t.z * lat, p.z + t.x * lat) > -3) {
            const k = Math.round(i / 3) % n;
            const c = pts[k];
            c.multiplyScalar(1 + 25 / Math.hypot(c.x, c.z));
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
    }
    this._clearPiers(pts, 18);
    return pts;
  }

  _sub() {
    const pts = this._coastal(11, 0.62, 20, 100, -8);
    this._clearPiers(pts, 14);
    return pts;
  }

  /** Depth profile for the submarines: a few metres over the floor, below the surface, smoothed. */
  _settleDepth() {
    const n = this.n;
    const want = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let floor = -Infinity;
      for (const lat of [-6, 0, 6]) {
        const x = this.x[i] - this.tz[i] * lat;
        const z = this.z[i] + this.tx[i] * lat;
        floor = Math.max(floor, this.ground(x, z));
      }
      want[i] = Math.min(-4.5, floor + 5.5);
    }
    // Look ahead and behind so the line climbs early over ridges.
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = -Infinity;
      for (let k = -12; k <= 12; k++) m = Math.max(m, want[(i + k + n) % n] - Math.abs(k) * 0.35);
      out[i] = Math.min(-4.5, m);
    }
    let cur = out;
    for (let pass = 0; pass < 4; pass++) {
      const next = new Float32Array(n);
      for (let i = 0; i < n; i++) next[i] = Math.min(-4.5, (cur[(i - 1 + n) % n] + cur[i] * 2 + cur[(i + 1) % n]) / 4);
      cur = next;
    }
    this.y.set(cur);
  }

  /** Planes keep clear of every hill between the control points (except where they dive under a bridge). */
  _settleAltitude() {
    const n = this.n;
    const clear = this.stage.city ? 110 : 38;
    const want = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let g = 0;
      for (const lat of [-20, 0, 20]) g = Math.max(g, this.ground(this.x[i] - this.tz[i] * lat, this.z[i] + this.tx[i] * lat));
      const locked = (this.under || []).some((U) => Math.hypot(U.x - this.x[i], U.z - this.z[i]) < 70);
      want[i] = locked ? this.y[i] : Math.max(this.y[i], g > 1 ? g + clear : 22);
    }
    let cur = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = -Infinity;
      for (let k = -15; k <= 15; k++) m = Math.max(m, want[(i + k + n) % n] - Math.abs(k) * 1.2);
      const locked = (this.under || []).some((U) => Math.hypot(U.x - this.x[i], U.z - this.z[i]) < 45);
      cur[i] = locked ? want[i] : m;
    }
    for (let pass = 0; pass < 3; pass++) {
      const next = new Float32Array(n);
      for (let i = 0; i < n; i++) next[i] = (cur[(i - 1 + n) % n] + cur[i] * 2 + cur[(i + 1) % n]) / 4;
      cur = next;
    }
    this.y.set(cur);
  }

  _plane() {
    const N = 40;
    const R = this.stage.island.radius;
    const seed = this.rng.range(0, 6.28);
    const lift = this.stage.city ? 120 : 55;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = R * (0.78 + 0.22 * Math.sin(a * 2 + seed) + 0.08 * Math.sin(a * 5 - seed));
      const x = Math.cos(a) * r * (this.stage.island.stretch?.[0] || 1);
      const z = Math.sin(a) * r * (this.stage.island.stretch?.[1] || 1);
      let top = 0;
      for (let dx = -80; dx <= 80; dx += 40) for (let dz = -80; dz <= 80; dz += 40) top = Math.max(top, this.ground(x + dx, z + dz));
      const y = top > 2 ? top + lift + Math.sin(a * 3 + seed) * 15 : 26 + Math.sin(a * 3) * 6;
      pts.push(new THREE.Vector3(x, y, z));
    }
    this._clearPiers(pts, 14);
    // Crossing a bridge: dive under it, between two piers, well clear of the pylon.
    this.under = [];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const S = curve.getSpacedPoints(400);
    for (const D of this.decks) {
      for (let i = 0; i < S.length - 1; i++) {
        const p = S[i];
        const q = S[i + 1];
        const hit = segHit(p.x, p.z, q.x, q.z, D.ax, D.az, D.bx, D.bz);
        if (!hit) continue;
        const B = D.bridge;
        const [wx, wz] = this.world.toWorld(D.ax + (D.bx - D.ax) * hit.v, D.az + (D.bz - D.az) * hit.v);
        // Arc length along the bridge at the crossing.
        let sAt = 0;
        let bd = Infinity;
        for (const smp of B.samples) {
          const dd = Math.hypot(smp.p.x - wx, smp.p.z - wz);
          if (dd < bd) {
            bd = dd;
            sAt = smp.s;
          }
        }
        const ps = [...new Set(B.piers.filter((P) => !P.pylon).map((P) => P.s))].sort((a, b) => a - b);
        let lo = null;
        for (let k = 0; k < ps.length - 1; k++) {
          const mid = (ps[k] + ps[k + 1]) / 2;
          if (Math.abs(mid - B.length / 2) < 40) continue;
          if (!lo || Math.abs(mid - sAt) < Math.abs(lo - sAt)) lo = mid;
        }
        if (lo === null) continue;
        const smp = B.samples.reduce((a, b) => (Math.abs(b.s - lo) < Math.abs(a.s - lo) ? b : a));
        const deckY = smp.p.y;
        if (deckY < 13) continue;
        const [lx, lz] = this.world.toLocal(smp.p.x, smp.p.z);
        // Replace the nearest control point by the gap and ease its neighbours down.
        let best = 0;
        let bd2 = Infinity;
        pts.forEach((c, k) => {
          const dd = Math.hypot(c.x - lx, c.z - lz);
          if (dd < bd2) {
            bd2 = dd;
            best = k;
          }
        });
        const y = Math.min(8.5, deckY - 7);
        pts[best].set(lx, y, lz);
        for (const k of [-1, 1]) {
          const c = pts[(best + k + N) % N];
          c.y = Math.min(c.y, 22);
        }
        this.under.push({ x: lx, y, z: lz });
        break;
      }
    }
    return pts;
  }

  _glider() {
    const t = this.terrain;
    const R = this.stage.island.radius;
    const half = t.size / 2;
    // Landing field: low, flat, open ground near the shore, away from the circuit.
    let land = null;
    const tr = this.island.track;
    for (let k = 0; k < 400 && !land; k++) {
      const a = this.rng.range(0, 6.28);
      const r = R * this.rng.range(0.55, 0.95);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = t.heightAt(x, z);
      if (h < 1.5 || h > 12) continue;
      if (tr.clearance(x, z) < 40) continue;
      let flat = true;
      for (const [dx, dz] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) if (Math.abs(t.heightAt(x + dx, z + dz) - h) > 3) flat = false;
      if (flat) land = { x, z, h, a };
    }
    if (!land) land = { x: 0, z: 0, h: Math.max(2, t.heightAt(0, 0)), a: 0 };
    this.landing = land;
    // Start far round the island from the field, circle towards it.
    const span = Math.PI * 1.15;
    const N = 18;
    const pts = [];
    const rr = R * 0.52;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = land.a + span * (1 - u);
      const r = i === N ? 0 : rr * (1 - u * 0.25) + Math.sin(u * 9) * 40;
      const x = i === N ? land.x : Math.cos(a) * r;
      const z = i === N ? land.z : Math.sin(a) * r;
      pts.push(new THREE.Vector3(x, 0, z));
    }
    // The last stretch lines up on the field.
    const pre = pts[N - 1];
    pts[N - 1] = new THREE.Vector3(land.x + (pre.x - land.x) * 0.6, 0, land.z + (pre.z - land.z) * 0.6);
    // Glide line: from the end back up, at least 30 m over any ground on the way (never climbing).
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const L = curve.getLength();
    const M = 120;
    const ys = new Float32Array(M + 1);
    const ratio = 8.5;
    for (let i = M; i >= 0; i--) {
      const u = i / M;
      const p = curve.getPointAt(u);
      const g = Math.max(0, t.heightAt(p.x, p.z));
      const glide = land.h + 4 + (L * (1 - u)) / ratio;
      ys[i] = Math.max(glide, g + (i === M ? 4 : 32), i < M ? ys[i + 1] : 0);
    }
    for (let i = 0; i <= N; i++) pts[i].y = ys[Math.round((i / N) * M)];
    // Thermals: rising air along the way (circle in them to gain height).
    for (const u of [0.18, 0.4, 0.62, 0.8]) {
      const p = curve.getPointAt(u);
      const off = this.rng.range(-40, 40);
      this.thermals.push({ x: p.x + off, z: p.z - off * 0.5, r: 42, lift: 3.1 });
    }
    return pts;
  }

  // ------------------------------------------------------------ samples

  _sample() {
    const L = this.curve.getLength();
    const n = Math.max(200, Math.round(L / 4));
    this.length = L;
    this.n = n;
    const m = this.closed ? n : n + 1;
    this.x = new Float32Array(m);
    this.y = new Float32Array(m);
    this.z = new Float32Array(m);
    this.tx = new Float32Array(m);
    this.tz = new Float32Array(m);
    this.ty = new Float32Array(m);
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < m; i++) {
      const u = i / n;
      this.curve.getPointAt(Math.min(1, u), p);
      this.curve.getTangentAt(Math.min(1, u), t);
      this.x[i] = p.x;
      this.y[i] = p.y;
      this.z[i] = p.z;
      const l = Math.hypot(t.x, t.z) || 1;
      this.tx[i] = t.x / l;
      this.tz[i] = t.z / l;
      this.ty[i] = t.y;
    }
    this.m = m;
    // Spatial hash for nearest().
    this.cell = 50;
    this.grid = new Map();
    for (let i = 0; i < (this.closed ? n : n); i++) {
      const j = this.closed ? (i + 1) % n : Math.min(i + 1, m - 1);
      const x0 = Math.min(this.x[i], this.x[j]) - 90;
      const x1 = Math.max(this.x[i], this.x[j]) + 90;
      const z0 = Math.min(this.z[i], this.z[j]) - 90;
      const z1 = Math.max(this.z[i], this.z[j]) + 90;
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
        for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
          const key = cx * 100003 + cz;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  nearest(x, z, out = {}) {
    const list = this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    const n = this.n;
    const scan = list || null;
    let best = Infinity;
    let bi = -1;
    let bu = 0;
    const test = (i) => {
      const j = this.closed ? (i + 1) % n : Math.min(i + 1, this.m - 1);
      const ax = this.x[i];
      const az = this.z[i];
      const vx = this.x[j] - ax;
      const vz = this.z[j] - az;
      let u = ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = x - (ax + vx * u);
      const dz = z - (az + vz * u);
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
        bu = u;
      }
    };
    if (scan) for (const i of scan) test(i);
    else for (let i = 0; i < n; i += 2) test(i);
    if (bi < 0) return null;
    const j = this.closed ? (bi + 1) % n : Math.min(bi + 1, this.m - 1);
    const cx = this.x[bi] + (this.x[j] - this.x[bi]) * bu;
    const cz = this.z[bi] + (this.z[j] - this.z[bi]) * bu;
    out.i = bi;
    out.u = bu;
    out.dist = Math.sqrt(best);
    out.lat = (x - cx) * -this.tz[bi] + (z - cz) * this.tx[bi];
    out.y = this.y[bi] + (this.y[j] - this.y[bi]) * bu;
    out.s = (bi + bu) / n;
    return out;
  }

  pose(s, lat = 0) {
    const n = this.n;
    let f = this.closed ? (((s % 1) + 1) % 1) * n : clamp(s, 0, 1) * n;
    if (!this.closed && f >= n) f = n - 1e-4;
    const i = Math.floor(f) % n;
    const j = this.closed ? (i + 1) % n : Math.min(i + 1, this.m - 1);
    const u = f - Math.floor(f);
    const x = this.x[i] + (this.x[j] - this.x[i]) * u;
    const z = this.z[i] + (this.z[j] - this.z[i]) * u;
    const y = this.y[i] + (this.y[j] - this.y[i]) * u;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * u;
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * u;
    const tl = Math.hypot(tx, tz) || 1;
    const t = new THREE.Vector3(tx / tl, 0, tz / tl);
    const r = new THREE.Vector3(-t.z, 0, t.x);
    return { position: new THREE.Vector3(x + r.x * lat, y, z + r.z * lat), tangent: t, right: r, index: i };
  }

  outline(step = 4) {
    const pts = [];
    for (let i = 0; i < this.m; i += step) pts.push([this.x[i], this.z[i]]);
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

  // ------------------------------------------------------------ gates

  _gates() {
    const spacing = { boat: 230, sub: 150, plane: 330, glider: 260 }[this.kind];
    const radius = { boat: 13, sub: 6.5, plane: 15, glider: 19 }[this.kind];
    const L = this.length;
    const count = Math.max(4, Math.round(L / spacing));
    this.gates = [];
    for (let k = 0; k < count; k++) {
      const s = this.closed ? k / count : (k + 1) / count;
      this.gates.push(this._gate(s, radius));
    }
    if (!this.closed) this.gates[this.gates.length - 1].final = true;
    // Under-bridge passes get their own (smaller) gates.
    for (const U of this.under || []) {
      const q = this.nearest(U.x, U.z);
      if (!q) continue;
      const g = this._gate(q.s, 6.2);
      g.under = true;
      this.gates.push(g);
    }
    this.gates.sort((a, b) => a.s - b.s);
    this.gates.forEach((g, i) => (g.index = i));
  }

  _gate(s, radius) {
    const p = this.pose(s, 0);
    const f = s * this.n;
    const i = Math.min(this.m - 1, Math.floor(f));
    const tangent = new THREE.Vector3(this.tx[i], this.kind === 'boat' ? 0 : this.ty[i], this.tz[i]).normalize();
    const pos = p.position.clone();
    if (this.kind === 'boat') pos.y = 0;
    return { s, pos, tangent, radius };
  }

  // ------------------------------------------------------------ visuals

  _visuals() {
    const mats = this.materials;
    const kind = this.kind;
    const glow = (hex, base) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 1, roughness: 0.5 });
      mats.trackEmissive(m, base);
      return m;
    };
    const stripeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    this.gateMat = kind === 'sub' ? glow(0x3de0ff, 1.2) : stripeMat;
    this.nextMat = glow(kind === 'sub' ? 0x9ff6ff : 0xffc23a, kind === 'sub' ? 4 : 2.5);
    this.mats = [this.gateMat, this.nextMat, stripeMat];
    this.gateMeshes = [];
    for (const g of this.gates) {
      const geo = this._gateGeometry(g);
      const mesh = new THREE.Mesh(geo, g.index === 0 || g.final ? stripeMat : this.gateMat);
      mesh.position.copy(g.pos);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.tangent);
      mesh.userData.noPick = true;
      mesh.name = g.index === 0 ? 'שער זינוק' : 'שער';
      this.group.add(mesh);
      this.gateMeshes.push(mesh);
    }
    // The next gate for the player is marked by a bright copy.
    this.marker = new THREE.Mesh(this.gateMeshes[0].geometry, this.nextMat);
    this.marker.scale.setScalar(1.04);
    this.marker.userData.noPick = true;
    this.group.add(this.marker);
    if (this.landing) this.group.add(this._target());
    if (this.thermals.length) this._thermalVisuals();
  }

  _gateGeometry(g) {
    const r = g.radius;
    const checker = g.index === 0 || g.final;
    let geo;
    if (this.kind === 'boat') geo = new THREE.TorusGeometry(r, 0.85, 8, 28, Math.PI);
    else geo = new THREE.TorusGeometry(r, this.kind === 'sub' ? 0.35 : this.kind === 'glider' ? 0.7 : 0.9, 8, 36);
    geo = geo.toNonIndexed();
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const A = new THREE.Color(checker ? 0x111111 : this.kind === 'boat' ? 0xff6a1a : this.kind === 'glider' ? 0xffc21a : 0xe0262b);
    const B = new THREE.Color(0xf4f4f4);
    for (let i = 0; i < pos.count; i += 3) {
      const a = Math.atan2(pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2), pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2));
      const c = Math.floor(((a + Math.PI) / (Math.PI * 2)) * (checker ? 24 : 12)) % 2 ? A : B;
      for (let v = 0; v < 3; v++) c.toArray(col, (i + v) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  _target() {
    const L = this.landing;
    const g = new THREE.Group();
    const ring = (r0, r1, c) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      this.mats.push(m.material);
      return m;
    };
    g.add(ring(0, 4, 0xe0262b), ring(4, 9, 0xf4f4f4), ring(9, 14, 0xe0262b), ring(14, 19, 0xf4f4f4));
    g.position.set(L.x, this.terrain.heightAt(L.x, L.z) + 0.15, L.z);
    g.name = 'מטרת נחיתה';
    // A windsock beside it.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 10, 1, true).rotateZ(Math.PI / 2).translate(1.1, 5.7, 0), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
    pole.position.set(24, 0, 0);
    sock.position.set(24, 0, 0);
    g.add(pole, sock);
    this.mats.push(pole.material, sock.material);
    return g;
  }

  _thermalVisuals() {
    // A faint shimmering column and a few birds circling in it.
    const H = 420;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float swirl = 0.5 + 0.5 * sin(vUv.x * 18.85 + vUv.y * 22.0 - uTime * 1.6);
          float a = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y) * (0.35 + 0.65 * swirl) * 0.08;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * a, a);
        }`,
    });
    this.thermalMat = mat;
    this.mats.push(mat);
    this.birds = [];
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.9, 0.25, 0, 0, 0, 0.25, 0, 0, -0.1, 0.9, 0.25, 0, 0, 0, -0.1, 0, 0, 0.25], 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    this.mats.push(birdMat);
    for (const T of this.thermals) {
      const base = Math.max(0, this.ground(T.x, T.z));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r * 0.7, H, 24, 1, true).translate(0, H / 2, 0), mat);
      col.position.set(T.x, base, T.z);
      col.userData.noPick = true;
      this.group.add(col);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(birdGeo, birdMat);
        b.scale.setScalar(1.6);
        b.userData = { T, a: k * 2.1, h: base + 120 + k * 45, r: T.r * (0.4 + k * 0.2), noPick: true };
        this.group.add(b);
        this.birds.push(b);
      }
    }
  }

  /** Marks the next gate (for the player) and moves the scenery. */
  update(dt, next) {
    const g = this.gates[next];
    if (g) {
      this.marker.visible = true;
      this.marker.geometry = this.gateMeshes[next].geometry;
      this.marker.position.copy(g.pos);
      this.marker.quaternion.copy(this.gateMeshes[next].quaternion);
      const pulse = 1.03 + Math.sin(performance.now() * 0.008) * 0.02;
      this.marker.scale.setScalar(pulse);
    } else this.marker.visible = false;
    if (this.thermalMat) this.thermalMat.uniforms.uTime.value += dt;
    for (const b of this.birds || []) {
      const U = b.userData;
      U.a += dt * 0.35;
      b.position.set(U.T.x + Math.cos(U.a) * U.r, U.h + Math.sin(U.a * 0.7) * 4, U.T.z + Math.sin(U.a) * U.r);
      b.rotation.set(0, -U.a, Math.sin(U.a * 6) * 0.2);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.mats) {
      this.materials.untrackEmissive(m);
      m.dispose();
    }
  }
}

/** Where segment p→q crosses segment a→b (u along p→q, v along a→b), or null. */
function segHit(px, pz, qx, qz, ax, az, bx, bz) {
  const rx = qx - px;
  const rz = qz - pz;
  const sx = bx - ax;
  const sz = bz - az;
  const d = rx * sz - rz * sx;
  if (Math.abs(d) < 1e-9) return null;
  const u = ((ax - px) * sz - (az - pz) * sx) / d;
  const v = ((ax - px) * rz - (az - pz) * rx) / d;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}
