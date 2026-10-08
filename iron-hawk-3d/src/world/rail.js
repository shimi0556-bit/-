// The track the player rides. A path is routed across the region between a few waypoints
// (A* over the height field, so it follows valley floors and canyon bottoms), smoothed, and
// sampled every few metres. Each leg of it is either run along the ground at eye height or
// flown low over the land, and every leg ends at a stop where an ambush happens.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';

const CELL = 20;     // routing grid cell, metres
const SPAN = 3200;   // the grid covers -SPAN..SPAN on both axes
const STEP = 5;      // spacing of the dense samples along the path
export const EYE = { ground: 2.6, air: 30, hover: 7 };

export class Rail {
  constructor(terrain, cfg) {
    this.terrain = terrain;
    this.cfg = cfg;
  }

  build() {
    const pts = this.route(this.cfg.points);
    const smooth = chaikin(chaikin(chaikin(pts)));
    this.resample(smooth);
    // arc position of each waypoint, so stops can be placed relative to them
    this.wp = this.cfg.points.map(([x, z]) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < this.n; i++) {
        const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best * STEP;
    });
    this.placeStops();
    this.computeHeights();
    this.buildIndex();
    return this;
  }

  // ---------------------------------------------------------------- routing
  route(points) {
    const T = this.terrain, N = Math.round((SPAN * 2) / CELL);
    const H = new Float32Array(N * N), wet = new Uint8Array(N * N);
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = -SPAN + (ix + 0.5) * CELL, z = -SPAN + (iz + 0.5) * CELL;
      const h = T.heightAt(x, z);
      H[iz * N + ix] = Math.max(h, T.waterLevel);
      wet[iz * N + ix] = h < T.waterLevel + 1 ? 1 : 0;
    }
    let hMin = Infinity;
    for (let i = 0; i < H.length; i++) hMin = Math.min(hMin, H[i]);
    const low = this.cfg.lowBias ?? 160;
    const cellOf = (x, z) => [clamp(Math.floor((x + SPAN) / CELL), 0, N - 1), clamp(Math.floor((z + SPAN) / CELL), 0, N - 1)];
    const centre = (i) => [-SPAN + ((i % N) + 0.5) * CELL, -SPAN + (Math.floor(i / N) + 0.5) * CELL];
    const stepCost = (a, b, diag) => {
      const d = diag ? CELL * Math.SQRT2 : CELL;
      const [ax, az] = centre(a), [bx, bz] = centre(b);
      const mid = T.groundOrWater((ax + bx) / 2, (az + bz) / 2);
      const hi = Math.max(H[a], H[b]);
      const rise = Math.abs(H[b] - H[a]) + Math.max(0, mid - hi) * 2;
      const slope = rise / d;
      let c = d * (1 + 40 * slope * slope + Math.max(0, slope - 0.3) * 40);
      if (wet[b]) c += d * 5;
      c += d * (H[b] - hMin) / low;
      const r = Math.hypot(bx, bz);
      if (r > 2900) c += d * (r - 2900) / 40;
      return c;
    };
    const out = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const [sx, sz] = cellOf(points[k][0], points[k][1]);
      const [tx, tz] = cellOf(points[k + 1][0], points[k + 1][1]);
      const path = astar(N, sz * N + sx, tz * N + tx, stepCost);
      const first = k === 0 ? 0 : 1;
      for (let i = first; i < path.length; i++) out.push(centre(path[i]));
    }
    // start and end exactly at the given points
    out[0] = [points[0][0], points[0][1]];
    out[out.length - 1] = [points[points.length - 1][0], points[points.length - 1][1]];
    return out;
  }

  // even samples every STEP metres (in plan view)
  resample(pts) {
    const xs = [], zs = [];
    let carry = 0;
    xs.push(pts[0][0]); zs.push(pts[0][1]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      let t = STEP - carry;
      while (t <= len) {
        xs.push(ax + (bx - ax) * (t / len));
        zs.push(az + (bz - az) * (t / len));
        t += STEP;
      }
      carry = len - (t - STEP);
    }
    this.n = xs.length;
    this.X = Float32Array.from(xs);
    this.Z = Float32Array.from(zs);
    this.length = (this.n - 1) * STEP;
  }

  // ---------------------------------------------------------------- legs and stops
  placeStops() {
    const T = this.terrain, legs = this.cfg.legs;
    this.stops = [];
    let prev = 0;
    legs.forEach((leg, k) => {
      // `at` is a fraction of the whole path, or [waypoint, metres before (-) or after (+) it]
      const at = Array.isArray(leg.at) ? this.wp[leg.at[0]] + (leg.at[1] || 0) : leg.at * this.length;
      let s = clamp(at, prev + 200, this.length);
      if (!leg.boss && s < this.length - 1) {
        // settle on flat, dry ground near the planned spot
        let best = s, bestScore = Infinity;
        for (let d = -80; d <= 80; d += 10) {
          const ss = clamp(s + d, prev + 150, this.length - 60);
          const i = Math.round(ss / STEP);
          const x = this.X[i], z = this.Z[i];
          const h = T.heightAt(x, z);
          let rough = 0;
          for (const [ox, oz] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) rough += Math.abs(T.groundOrWater(x + ox, z + oz) - h);
          const score = rough + (h < T.waterLevel + 1 ? 200 : 0) + Math.abs(d) * 0.05;
          if (score < bestScore) { bestScore = score; best = ss; }
        }
        s = best;
      }
      this.stops.push({ index: k, s, mode: leg.mode, waves: leg.waves || [], boss: !!leg.boss });
      prev = s;
    });
    const modeOf = (k) => (legs[k].mode === 'air' ? 1 : 0);
    // 0 = running on the ground, 1 = flying; the change happens just after leaving a stop
    this.airAt = (s) => {
      let k = 0;
      while (k < this.stops.length - 1 && s > this.stops[k].s) k++;
      const m = modeOf(k);
      if (k === 0) return m;
      const from = modeOf(k - 1), s0 = this.stops[k - 1].s;
      return lerp(from, m, smoothstep(s0 + 25, s0 + 190, s));
    };
  }

  // the next stop at or after distance s
  nextStop(s) {
    for (const st of this.stops) if (st.s >= s - 0.5) return st;
    return null;
  }

  // ---------------------------------------------------------------- heights
  computeHeights() {
    const T = this.terrain, n = this.n;
    const g = new Float32Array(n), wide = new Float32Array(n);
    const t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      this.tangentIndex(i, t);
      const rx = -t.z, rz = t.x;
      g[i] = T.groundOrWater(this.X[i], this.Z[i]);
      let w = g[i];
      for (const o of [-14, -7, 7, 14]) w = Math.max(w, T.groundOrWater(this.X[i] + rx * o, this.Z[i] + rz * o));
      wide[i] = w;
    }
    // flying: clear the highest ground a little ahead and behind
    // (at the stops only the ground right there counts, so the hover is low enough for the
    // runners to reach the window)
    const airBase = new Float32Array(n), stopBase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = -Infinity, k = -Infinity;
      for (let j = Math.max(0, i - 14); j <= Math.min(n - 1, i + 14); j++) {
        m = Math.max(m, wide[j]);
        if (Math.abs(j - i) <= 2) k = Math.max(k, wide[j]);
      }
      airBase[i] = m;
      stopBase[i] = k;
    }
    const groundBase = blur(g, 3);
    const air = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      air[i] = this.airAt(s);
      let near = 0;
      for (const st of this.stops) {
        if (st.mode !== 'air') continue;
        const d = s - st.s;
        near = Math.max(near, d < 0 ? smoothstep(-240, -50, d) : 1 - smoothstep(25, 210, d));
      }
      const yAir = lerp(airBase[i] + EYE.air, stopBase[i] + EYE.hover, near);
      const yGround = Math.max(groundBase[i], g[i]) + EYE.ground;
      Y[i] = lerp(yGround, yAir, air[i]);
    }
    // smooth, but never closer to the ground than the eye height allows
    for (let pass = 0; pass < 4; pass++) {
      const b = blur(Y, 2);
      for (let i = 0; i < n; i++) Y[i] = Math.max(b[i], g[i] + lerp(1.8, 6, air[i]));
    }
    this.Y = Y;
    this.G = g;
    this.air = air;
  }

  tangentIndex(i, out) {
    const a = Math.max(0, i - 2), b = Math.min(this.n - 1, i + 2);
    out.set(this.X[b] - this.X[a], 0, this.Z[b] - this.Z[a]);
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  // ---------------------------------------------------------------- queries
  sample(arr, s) {
    const f = clamp(s / STEP, 0, this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    return lerp(arr[i], arr[i + 1], f - i);
  }

  pointAt(s, out = new THREE.Vector3()) {
    if (s > this.length) { // past the end: carry on along the last direction
      const t = this.tangentAt(this.length, new THREE.Vector3());
      this.pointAt(this.length, out);
      return out.addScaledVector(t, s - this.length);
    }
    return out.set(this.sample(this.X, s), this.sample(this.Y, s), this.sample(this.Z, s));
  }

  // smoothed direction of travel (with the climb or descent)
  tangentAt(s, out = new THREE.Vector3()) {
    const a = clamp(s - 10, 0, this.length), b = clamp(s + 10, 0, this.length);
    const ax = this.sample(this.X, a), az = this.sample(this.Z, a), bx = this.sample(this.X, b), bz = this.sample(this.Z, b);
    const ay = this.sample(this.Y, a), by = this.sample(this.Y, b);
    out.set(bx - ax, (by - ay) * 0.6, bz - az);
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  // looking direction along the path: averaged further ahead so turns read smoothly
  lookAt(s, out = new THREE.Vector3()) {
    const t = new THREE.Vector3();
    out.set(0, 0, 0);
    for (const d of [0, 15, 30, 45]) out.addScaledVector(this.tangentAt(s + d, t), d === 0 ? 1.5 : 1);
    return out.normalize();
  }

  groundAt(s) { return this.sample(this.G, s); }
  airAmount(s) { return this.sample(this.air, s); }

  // ---------------------------------------------------------------- clearings
  buildIndex() {
    const C = 60;
    this.cell = C;
    this.grid = new Map();
    const key = (ix, iz) => ix * 100003 + iz;
    for (let i = 0; i < this.n; i += 2) {
      const k = key(Math.floor(this.X[i] / C), Math.floor(this.Z[i] / C));
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    }
    this.key = key;
    const t = new THREE.Vector3();
    this.clearings = this.stops.map((st) => {
      const p = this.pointAt(st.s);
      this.tangentAt(st.s, t);
      return { x: p.x + t.x * 90, z: p.z + t.z * 90, r: st.boss ? 0 : 135 };
    });
  }

  // plan-view distance from (x, z) to the path (capped at one grid cell)
  distance(x, z) {
    const C = this.cell, ix = Math.floor(x / C), iz = Math.floor(z / C);
    let best = C * 2;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.grid.get(this.key(ix + dx, iz + dz));
      if (!list) continue;
      for (const i of list) best = Math.min(best, Math.hypot(this.X[i] - x, this.Z[i] - z));
    }
    return best;
  }

  // keep trees and rocks off the track and out of the ambush grounds
  blocks(x, z, small) {
    if (this.distance(x, z) < (small ? 9 : 16)) return true;
    if (small) return false;
    for (const c of this.clearings) if (c.r && Math.hypot(x - c.x, z - c.z) < c.r) return true;
    return false;
  }

  // a spot on the ground ahead of distance s, roughly `ahead` metres along the track and
  // `side` metres off it (used for spawning monsters that come at the player)
  spotAhead(s, ahead, side, out = new THREE.Vector3()) {
    const T = this.terrain;
    const p = this.pointAt(s + ahead, out);
    const t = this.tangentAt(Math.min(s + ahead, this.length), new THREE.Vector3());
    const rx = -t.z, rz = t.x;
    const n = Math.hypot(rx, rz) || 1;
    p.x += (rx / n) * side;
    p.z += (rz / n) * side;
    p.y = T.heightAt(p.x, p.z);
    return p;
  }
}

// ---------------------------------------------------------------- helpers
function chaikin(pts) {
  const out = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function blur(arr, passes) {
  let a = Float32Array.from(arr);
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) b[i] = a[Math.max(0, i - 1)] * 0.25 + a[i] * 0.5 + a[Math.min(a.length - 1, i + 1)] * 0.25;
    a = b;
  }
  return a;
}

// A* on an N x N grid with 8 neighbours; cost(a, b, diagonal) must be >= the step length
function astar(N, start, goal, cost) {
  const g = new Float32Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = new Heap();
  const gx = goal % N, gz = Math.floor(goal / N);
  const h = (i) => Math.hypot((i % N) - gx, Math.floor(i / N) - gz) * CELL;
  g[start] = 0;
  heap.push(start, h(start));
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % N, cz = Math.floor(cur / N);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const nb = nz * N + nx;
      if (closed[nb]) continue;
      const ng = g[cur] + cost(cur, nb, dx && dz);
      if (ng < g[nb]) { g[nb] = ng; from[nb] = cur; heap.push(nb, ng + h(nb)); }
    }
  }
  const path = [];
  for (let i = goal; i !== -1; i = from[i]) { path.push(i); if (i === start) break; }
  return path.reverse();
}

class Heap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const it = this.items, ks = this.keys;
    let i = it.length;
    it.push(item); ks.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p] <= key) break;
      it[i] = it[p]; ks[i] = ks[p]; i = p;
    }
    it[i] = item; ks[i] = key;
  }
  pop() {
    const it = this.items, ks = this.keys;
    const top = it[0];
    const lastI = it.pop(), lastK = ks.pop();
    if (it.length) {
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mk = lastK;
        if (l < n && ks[l] < mk) { m = l; mk = ks[l]; }
        if (r < n && ks[r] < mk) { m = r; mk = ks[r]; }
        if (m === i) break;
        it[i] = it[m]; ks[i] = ks[m]; i = m;
      }
      it[i] = lastI; ks[i] = lastK;
    }
    return top;
  }
}
