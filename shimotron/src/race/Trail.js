import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Track } from './Track.js';
import { AI } from './config.js';
import { Random, smoothstep } from '../engine/core/Random.js';

/** Half width of the dirt trail (metres from the centre line to the edge of the ridden dirt). */
export const TRAIL_HALF = 4.4;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Where a motocross trail can run on an island: a closed loop over the
 * valley floor between the mesas, clear of the circuit, the roads from the
 * bridges, the bridge landings, the volcano cones and the coast.
 *
 * A 16 m grid marks what the trail must keep away from (mesa slopes and
 * tops included) and a distance field is taken to it. Round a few roomy
 * spots, the loop is the contour of that field at a fixed distance, cut
 * off by a circle round the spot: it runs along the feet of the mesas,
 * keeping the same few metres from their walls, and across open ground
 * where there are none. The contour is smoothed, given serpentines where
 * the ground is open, and scored for cliffs alongside, turns and length.
 * Returns { controls, length, score, … } or null.
 */
export function planTrail(terrain, stage, { circuit, roads = null, keepOut = null, log = null } = {}) {
  const I = stage.island;
  const R = I.radius;
  const volcanoes = I.volcanoes || (I.volcano ? [I.volcano] : []);
  const rng = new Random(stage.seed * 131 + 71);
  const W = TRAIL_HALF;
  const G = 16;
  const N = Math.ceil((R * 2.2) / G);
  const half = (N * G) / 2;
  const cx0 = (i) => -half + (i + 0.5) * G;
  const free = new Uint8Array(N * N);
  const lift = new Float32Array(N * N);
  const bad = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx0(i);
      const z = cx0(j);
      const k = j * N + i;
      const h = terrain.height(x, z);
      terrain.skipMesas = true;
      const h0 = terrain.height(x, z);
      terrain.skipMesas = false;
      lift[k] = Math.max(0, h - h0);
      let ok = h0 > 3.2 && h0 < 60;
      if (ok && circuit.clearance(x, z) < 36) ok = false;
      if (ok && roads && roads.dist(x, z) < 26) ok = false;
      if (ok && keepOut && keepOut(x, z)) ok = false;
      if (ok) for (const V of volcanoes) if (Math.hypot(x - V.x, z - V.z) < V.radius * 0.86) ok = false;
      free[k] = ok ? 1 : 0;
      bad[k] = !ok || lift[k] > 6 ? 1 : 0;
    }
  }
  // Distance (m) from each cell to the nearest cell to avoid: two-pass chamfer.
  const D = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) D[k] = bad[k] ? 0 : 1e6;
  const d1 = G;
  const d2 = G * Math.SQRT2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let d = D[k];
      if (i > 0) d = Math.min(d, D[k - 1] + d1);
      if (j > 0) d = Math.min(d, D[k - N] + d1);
      if (i > 0 && j > 0) d = Math.min(d, D[k - N - 1] + d2);
      if (i < N - 1 && j > 0) d = Math.min(d, D[k - N + 1] + d2);
      D[k] = d;
    }
  }
  for (let j = N - 1; j >= 0; j--) {
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let d = D[k];
      if (i < N - 1) d = Math.min(d, D[k + 1] + d1);
      if (j < N - 1) d = Math.min(d, D[k + N] + d1);
      if (i < N - 1 && j < N - 1) d = Math.min(d, D[k + N + 1] + d2);
      if (i > 0 && j < N - 1) d = Math.min(d, D[k + N - 1] + d2);
      D[k] = d;
    }
  }
  const cellOf = (x, z) => {
    const i = Math.floor((x + half) / G);
    const j = Math.floor((z + half) / G);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  };
  const isFree = (x, z) => {
    const k = cellOf(x, z);
    return k >= 0 && free[k] === 1;
  };
  const liftAt = (x, z) => {
    const k = cellOf(x, z);
    return k >= 0 ? lift[k] : 0;
  };
  const room = (x, z) => {
    // Bilinear distance field.
    const fx = (x + half) / G - 0.5;
    const fz = (z + half) / G - 0.5;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i));
    const v = Math.max(0, Math.min(1, fz - j));
    const k = j * N + i;
    return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + N] * (1 - u) + D[k + N + 1] * u) * v;
  };

  // Roomy spots to centre loops on, spread apart.
  const spots = [];
  for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) if (D[j * N + i] >= 50) spots.push({ i, j, d: D[j * N + i] });
  spots.sort((a, b) => b.d - a.d);
  const centres = [];
  for (const sp of spots) {
    if (centres.length >= 7) break;
    const x = cx0(sp.i);
    const z = cx0(sp.j);
    if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < 170)) continue;
    centres.push({ x, z, d: sp.d });
  }

  const level = W + 15; // centre line this far from anything to avoid
  let best = null;
  for (const C of centres) {
    for (const Rc of [170, 220, 280, 340, 420]) {
      const loop = contourLoop(N, G, half, (i, j) => Math.min(D[j * N + i], Rc - Math.hypot(cx0(i) - C.x, cx0(j) - C.z)), level, C);
      if (!loop || loop.length < 12) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        const field = (x, z) => Math.min(room(x, z), Rc - Math.hypot(x - C.x, z - C.z));
        const controls = shapeLoop(loop, { rng, room, field, isFree, liftAt, level, wiggle: attempt });
        if (!controls) continue;
        const res = evaluateTrail(controls, W, { isFree, liftAt, circuit, roads, keepOut, terrain });
        if (log) log({ ...C, Rc }, res);
        if (res && !res.reject && (!best || res.score > best.score)) best = res;
      }
    }
  }
  return best;
}

/**
 * The closed contour {F = level} enclosing point C, by marching squares
 * over the cell-centred field F(i, j); null if none encloses it.
 */
function contourLoop(N, G, half, F, level, C) {
  const val = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) val[j * N + i] = F(i, j) - level;
  const px = (i) => -half + (i + 0.5) * G;
  // Crossing point on each edge, keyed by edge id.
  const pts = new Map();
  const edgePoint = (id, i0, j0, i1, j1) => {
    if (pts.has(id)) return id;
    const a = val[j0 * N + i0];
    const b = val[j1 * N + i1];
    const t = a / (a - b);
    pts.set(id, { x: px(i0) + (px(i1) - px(i0)) * t, z: px(j0) + (px(j1) - px(j0)) * t });
    return id;
  };
  const link = new Map();
  const connect = (a, b) => {
    if (!link.has(a)) link.set(a, []);
    if (!link.has(b)) link.set(b, []);
    link.get(a).push(b);
    link.get(b).push(a);
  };
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = val[j * N + i] > 0 ? 1 : 0; // (i, j)
      const b = val[j * N + i + 1] > 0 ? 1 : 0; // (i+1, j)
      const c = val[(j + 1) * N + i + 1] > 0 ? 1 : 0; // (i+1, j+1)
      const d = val[(j + 1) * N + i] > 0 ? 1 : 0; // (i, j+1)
      const code = a | (b << 1) | (c << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      const eB = () => edgePoint(`h${i},${j}`, i, j, i + 1, j); // bottom edge (j)
      const eR = () => edgePoint(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1);
      const eT = () => edgePoint(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1);
      const eL = () => edgePoint(`v${i},${j}`, i, j, i, j + 1);
      const centre = (val[j * N + i] + val[j * N + i + 1] + val[(j + 1) * N + i + 1] + val[(j + 1) * N + i]) / 4 > 0;
      switch (code) {
        case 1: case 14: connect(eL(), eB()); break;
        case 2: case 13: connect(eB(), eR()); break;
        case 3: case 12: connect(eL(), eR()); break;
        case 4: case 11: connect(eR(), eT()); break;
        case 6: case 9: connect(eB(), eT()); break;
        case 7: case 8: connect(eL(), eT()); break;
        case 5:
          if (centre) { connect(eL(), eT()); connect(eB(), eR()); } else { connect(eL(), eB()); connect(eR(), eT()); }
          break;
        case 10:
          if (centre) { connect(eL(), eB()); connect(eR(), eT()); } else { connect(eL(), eT()); connect(eB(), eR()); }
          break;
      }
    }
  }
  // Walk the closed loops; keep the one that encloses C (the largest if several do).
  const seen = new Set();
  let bestLoop = null;
  for (const start of link.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null;
    let cur = start;
    let closed = false;
    for (let guard = 0; guard < 20000; guard++) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const nb = link.get(cur).filter((e) => e !== prev);
      if (!nb.length) break;
      const next = nb[0];
      if (next === start) {
        closed = true;
        break;
      }
      if (seen.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (!closed || loop.length < 8) continue;
    let inside = false;
    for (let k = 0, m = loop.length - 1; k < loop.length; m = k++) {
      const p = loop[k];
      const q = loop[m];
      if (p.z > C.z !== q.z > C.z && C.x < ((q.x - p.x) * (C.z - p.z)) / (q.z - p.z) + p.x) inside = !inside;
    }
    if (inside && (!bestLoop || loop.length > bestLoop.length)) bestLoop = loop;
  }
  return bestLoop;
}

/**
 * From a raw contour to trail controls: smoothed (it shrinks inward, away
 * from what it skirts), resampled every ~14 m, with serpentines swung out
 * where the ground is open, and kinks eased to hairpin size or wider.
 */
function shapeLoop(raw, { rng, room, field, isFree, liftAt, level, wiggle }) {
  let pts = raw.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const n0 = pts.length;
  // Back out to the contour's distance wherever smoothing has pulled a point toward what it skirts.
  const project = (p) => {
    for (let it = 0; it < 4; it++) {
      const f = field(p.x, p.z);
      if (f >= level - 2) return;
      const e = 4;
      const gx = (field(p.x + e, p.z) - field(p.x - e, p.z)) / (2 * e);
      const gz = (field(p.x, p.z + e) - field(p.x, p.z - e)) / (2 * e);
      const gl = Math.hypot(gx, gz);
      if (gl < 0.05) return;
      const step = Math.min(10, level - f);
      p.x += (gx / gl) * step;
      p.z += (gz / gl) * step;
    }
  };
  for (let round = 0; round < 6; round++) {
    for (let pass = 0; pass < 5; pass++) {
      pts = pts.map((p, k) => {
        const a = pts[(k - 1 + n0) % n0];
        const b = pts[(k + 1) % n0];
        return new THREE.Vector3(p.x * 0.5 + (a.x + b.x) * 0.25, 0, p.z * 0.5 + (a.z + b.z) * 0.25);
      });
    }
    for (const p of pts) project(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const total = curve.getLength();
  if (total < 700) return null;
  const m = Math.round(total / 14);
  const lambda = rng.range(70, 120);
  const waves = Math.max(3, Math.round(total / lambda));
  const amp = wiggle === 0 ? 0 : rng.range(8, 16) * (wiggle === 2 ? 1.4 : 1);
  const phase = rng.range(0, Math.PI * 2);
  const controls = [];
  for (let k = 0; k < m; k++) {
    const u = k / m;
    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    let off = 0;
    if (amp > 0) {
      const want = amp * Math.sin(u * waves * Math.PI * 2 + phase);
      // Only where there is room either side of the contour (it keeps `level` from the walls).
      for (const f of [1, 0.6, 0.3, 0]) {
        const o = want * f;
        const qx = p.x - tg.z * o;
        const qz = p.z + tg.x * o;
        if (f === 0 || (isFree(qx, qz) && room(qx, qz) > level - 4 && liftAt(qx, qz) < 6)) {
          off = o;
          break;
        }
      }
    }
    controls.push(new THREE.Vector3(p.x - tg.z * off, 0, p.z + tg.x * off));
  }
  for (let pass = 0; pass < 24; pass++) {
    let tightest = Infinity;
    for (let k = 0; k < m; k++) {
      const a = controls[(k - 1 + m) % m];
      const b = controls[k];
      const c = controls[(k + 1) % m];
      const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
      const r = area > 1e-6 ? (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (4 * area) : 1e9;
      tightest = Math.min(tightest, r);
      if (r < 16) b.lerp(new THREE.Vector3((a.x + c.x) / 2, 0, (a.z + c.z) / 2), 0.4);
    }
    if (tightest >= 16) break;
  }
  return controls;
}

function evaluateTrail(controls, W, { isFree, liftAt, circuit, roads, keepOut, terrain }) {
  const curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
  const length = curve.getLength();
  if (length < 850 || length > 3200) return { reject: 'length', length };
  const n = Math.round(length / 2);
  const P = curve.getSpacedPoints(n).slice(0, n);
  let minR = Infinity;
  let corners = 0;
  let tight = 0;
  let inC = false;
  let inT = false;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 5 + n) % n];
    const b = P[i];
    const c = P[(i + 5) % n];
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    const r = area > 1e-6 ? (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (4 * area) : 1e9;
    minR = Math.min(minR, r);
    const isC = r < 70;
    if (isC && !inC) corners++;
    inC = isC;
    const isT = r < 28;
    if (isT && !inT) tight++;
    inT = isT;
  }
  if (minR < 9) return { reject: 'radius', minR };
  for (let i = 0; i < n; i += 2) {
    const p = P[i];
    if (!isFree(p.x, p.z)) return { reject: 'free' };
    if (i % 6 === 0) {
      if (circuit.clearance(p.x, p.z) < 38) return { reject: 'circuit' };
      if (roads && roads.dist(p.x, p.z) < 24) return { reject: 'roads' };
      if (keepOut && keepOut(p.x, p.z)) return { reject: 'keepOut' };
    }
  }
  const gap = 2 * W + 9; // hairpin legs may run side by side, a berm apart
  for (let i = 0; i < n; i += 3) {
    for (let j = i + 36; j < Math.min(n, n - 36 + i); j += 3) {
      if (Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) < gap) return { reject: 'close' };
    }
  }
  // Between cliffs: mesa walls standing beside the trail while the trail itself keeps to the floor.
  let cliffs = 0;
  let cut = 0;
  for (let i = 0; i < n; i += 3) {
    const a = P[(i + 1) % n];
    const b = P[(i - 1 + n) % n];
    const tl = Math.hypot(a.x - b.x, a.z - b.z) || 1;
    const rx = -(a.z - b.z) / tl;
    const rz = (a.x - b.x) / tl;
    const own = liftAt(P[i].x, P[i].z);
    if (own > 30) return { reject: 'mesa' }; // never through the high plateaus
    cut += own;
    let side = 0;
    for (const d of [-34, -20, 20, 34]) side = Math.max(side, liftAt(P[i].x + rx * d, P[i].z + rz * d));
    if (side > 12 && own < 6) cliffs++;
  }
  cut /= n / 3;
  // Ground along the way (for the grades it will need).
  let climb = 0;
  let prev = terrain.height(P[0].x, P[0].z);
  for (let i = 6; i < n; i += 6) {
    const h = terrain.height(P[i].x, P[i].z);
    climb += Math.abs(h - prev);
    prev = h;
  }
  let score = 100;
  score += Math.min(cliffs, 140) * 0.35;
  score += Math.min(corners, 16) * 2.2 + Math.min(tight, 7) * 3;
  score -= Math.abs(length - 1600) / 30;
  score -= cut * 6;
  score -= Math.max(0, climb - 120) * 0.08;
  return { controls, length, minRadius: minR, corners, tight, cliffs, cut, score };
}

/**
 * A motocross trail: packed dirt between the mesas, no asphalt. Built on
 * the circuit's Track (lap geometry, nearest-point grid, racing line, pose)
 * with its own
 *  - profile: follows the ground far more closely than a road, grades up to
 *    ~14%, with tabletop jumps, whoops and rollers on the straights and
 *    berms banked into the corners,
 *  - ground work: the trail is scraped into the valley floor (slots through
 *    any mesa it crosses) and the scrub either side cleared,
 *  - wheel surface: the dirt itself, exactly (jumps and berms included),
 *  - looks: a rutted, pebbly dirt ribbon that frays into the ground, stakes
 *    and course tape round the turns, hay bales, half-buried tyres, a
 *    drop-gate start under a banner with its lights.
 */
export class Trail extends Track {
  constructor(engine, terrain, controls, stage) {
    super(engine, terrain, controls, { ...stage, halfWidth: TRAIL_HALF, gorge: null, roadGrip: 0.84, startWindow: 110, startLead: 55, step: 1, trail: true });
    this.group.name = 'שביל מוטוקרוס';
    this.clearance = (x, z) => {
      const q = this.nearest(x, z, this._cq || (this._cq = {}));
      return q ? q.dist - this.W - 0.6 : 1e9;
    };
    // How close scrub, boulders and herds may come: the verge is cleared, the bush starts right after.
    this.softClearance = (x, z) => {
      const q = this.nearest(x, z, this._cq || (this._cq = {}));
      return q ? q.dist - this.W + 5.5 : 1e9;
    };
    this.solids = [];
    this.gateDrop = 0;
    this.gateDown = false;
  }

  // ------------------------------------------------------------ profile

  _buildProfile() {
    const n = this.n;
    const W = this.W;
    const t = this.terrain;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const rx = -this.tz[i];
      const rz = this.tx[i];
      let s = 0;
      let s0 = 0;
      for (const l of [-W, 0, W]) {
        const x = this.x[i] + rx * l;
        const z = this.z[i] + rz * l;
        s += t.height(x, z);
        t.skipMesas = true;
        s0 += t.height(x, z);
        t.skipMesas = false;
      }
      // Through a mesa the trail climbs only a little and is cut down into a slot between its walls.
      raw[i] = Math.max(s0 / 3 + (s - s0) / 3 * 0.2, 2.8);
    }
    let h = this._smoothLoop(raw, 3, 8);
    const maxRise = 0.13 * this.ds;
    // Grade limit on a closed loop: the steepest-allowed envelopes cut down from above
    // (through the rises) and filled up from below (over the dips), blended mostly toward the cut.
    const envelope = (src, fill) => {
      const a = Float32Array.from(src);
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          a[j] = fill ? Math.max(a[j], a[i] - maxRise) : Math.min(a[j], a[i] + maxRise);
        }
        for (let i = n - 1; i >= 0; i--) {
          const j = (i - 1 + n) % n;
          a[j] = fill ? Math.max(a[j], a[i] - maxRise) : Math.min(a[j], a[i] + maxRise);
        }
      }
      return a;
    };
    const limit = () => {
      const cut = envelope(h, false);
      const fill = envelope(h, true);
      for (let i = 0; i < n; i++) h[i] = cut[i] * 0.7 + fill[i] * 0.3;
    };
    limit();
    // Round off crests and dips (the smoothing keeps within the grade: it averages neighbours that already do).
    h = this._smoothLoop(h, 5, 3);
    for (let i = 0; i < n; i++) h[i] = Math.max(h[i], 2.8);
    this.base = h;
    this.feat = this._features();
    this.h = new Float32Array(n);
    for (let i = 0; i < n; i++) this.h[i] = h[i] + this.feat[i];
    // Berms: the outside of every turn is banked up, steeper the tighter the turn.
    const bank = new Float32Array(n);
    for (let i = 0; i < n; i++) bank[i] = clamp(-this.kappa[i] * 18, -0.24, 0.24);
    this.bank = this._smoothLoop(bank, 4, 2);
  }

  /**
   * Obstacles on the straights: tabletop jumps, whoops (a run of tight
   * bumps) and rollers. Returns the height added to the base profile.
   */
  _features() {
    const n = this.n;
    const ds = this.ds;
    const f = new Float32Array(n);
    const rng = new Random(Math.round(this.length * 7) + 3);
    // How gentle each sample is: jumps and whoops want an almost straight run, rollers only no hairpin.
    const gentle = (i, lim) => Math.abs(this.kappa[i]) < lim;
    const used = new Uint8Array(n);
    this.jumps = [];
    const plan = [
      ['table', 1 / 25],
      ['whoops', 1 / 24],
      ['rollers', 1 / 18],
      ['table', 1 / 25],
      ['rollers', 1 / 18],
      ['whoops', 1 / 24],
      ['table', 1 / 25],
      ['rollers', 1 / 18],
      ['rollers', 1 / 18],
    ];
    const startClear = Math.round(90 / ds); // the start straight and the run to turn one stay flat
    const endClear = Math.round(25 / ds);
    for (const [kind, lim] of plan) {
      const len = kind === 'table' ? 30 : kind === 'whoops' ? 33 : 48;
      const runIn = Math.round(8 / ds);
      const need = Math.round(len / ds) + runIn;
      // Candidate starts: every run of `need` gentle samples, clear of the others; pick one at random.
      const cands = [];
      for (let a = startClear; a + need < n - endClear; a++) {
        let ok = true;
        for (let i = a - Math.round(24 / ds); i < a + need + Math.round(12 / ds) && ok; i++) if (used[(i + n) % n]) ok = false;
        for (let i = a; i < a + need && ok; i++) if (!gentle(i, lim)) ok = false;
        if (ok) cands.push(a);
      }
      if (!cands.length) continue;
      const a0 = cands[Math.floor(rng.random() * cands.length)];
      for (let i = a0; i < a0 + need; i++) used[i % n] = 1;
      const a = a0 + runIn;
      const L = len / ds;
      for (let s = 0; s <= L; s++) {
        const d = s * ds; // metres into the feature
        let y = 0;
        if (kind === 'table') {
          // Take-off face (a little lip), flat table, softer landing ramp.
          if (d < 8) y = 1.75 * Math.pow(d / 8, 1.25);
          else if (d < 19) y = 1.75;
          else y = 1.75 * (1 - smoothstep(19, 30, d));
        } else if (kind === 'whoops') {
          y = 0.5 * Math.pow(Math.sin((Math.PI * d) / 5.4), 2) * smoothstep(0, 3, d) * smoothstep(len, len - 3, d);
        } else {
          y = 0.85 * Math.pow(Math.sin((Math.PI * d) / 16), 2);
        }
        f[(a + s) % n] = Math.max(f[(a + s) % n], y);
      }
      this.jumps.push({ kind, i: a, len });
    }
    return f;
  }

  _racingLine() {
    // Plan speeds on the ground itself: the jumps are there to be flown, not crept over.
    const h = this.h;
    this.h = this.base;
    super._racingLine();
    this.h = h;
    const n = this.n;
    const v = this.speed;
    const top = 34;
    for (let i = 0; i < n; i++) v[i] = Math.min(v[i], top);
    // Carry some speed into the tables so they are cleared, not cased; roll the rollers and skim the whoops at a pace that keeps the bike on them.
    const m = (d) => Math.round(d / this.ds);
    for (const J of this.jumps || []) {
      if (J.kind === 'table') for (let s = -m(8); s < m(10); s++) v[(J.i + s + n) % n] = Math.max(v[(J.i + s + n) % n], Math.min(top, 17));
      else {
        const cap = J.kind === 'rollers' ? 13 : 11;
        for (let s = -m(4); s < m(J.len); s++) v[(J.i + s + n) % n] = Math.min(v[(J.i + s + n) % n], cap);
      }
    }
    const brake = AI.brakeDecel * 0.72; // loose dirt
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * this.ds));
      }
    }
  }

  /** The start: one row of drop gates across the trail. */
  gridSlot(k) {
    return { back: 7, lat: (k - 2.5) * 1.42 };
  }

  // ------------------------------------------------------------ ground work

  _at(q, arr) {
    const j = (q.i + 1) % this.n;
    return arr[q.i] + (arr[j] - arr[q.i]) * q.u;
  }

  /**
   * Height of the dirt across the trail relative to its centre line: a berm rises on the outside of
   * a turn (steeper toward the edge), the inside stays nearly level. `lat` within ±W.
   */
  _cross(lat, bank) {
    const r = lat * bank;
    return r > 0 ? r * (0.55 + 0.45 * Math.abs(lat) / this.W) : r * 0.2;
  }

  /** Slope of _cross across the trail (per metre of lat). */
  _crossSlope(lat, bank) {
    const r = lat * bank;
    return r > 0 ? bank * (0.55 + 0.9 * Math.abs(lat) / this.W) : bank * 0.2;
  }

  pose(s, lat = 0) {
    const p = super.pose(s, 0);
    const i = p.index;
    p.position.addScaledVector(p.right, lat);
    p.position.y += this._cross(Math.max(-this.W, Math.min(this.W, lat)), this.bank[i]);
    return p;
  }

  _heightModifier(x, z, h) {
    const q = this.nearest(x, z, this._q);
    if (!q || q.dist > this.W + 48) return h;
    const W = this.W;
    const base = this._at(q, this.base);
    const feat = this._at(q, this.feat);
    const edge = base + this._cross(clamp(q.lat, -W, W), q.bank);
    // Under the dirt the ground sits well below it (the ribbon is the surface); the scraped verge
    // either side is level with the trail's edge, falling a little; beyond it the ground rises back —
    // gently over open ground, as a sheer cut where the trail runs into a mesa's foot.
    let target;
    if (q.dist <= W + 1) target = edge + feat * 0.5 - 0.45;
    else target = edge - 0.06 - (q.dist - W - 1) * 0.02 + feat * 0.5 * smoothstep(W + 8, W + 1, q.dist);
    const diff = Math.abs(h - target);
    const k = smoothstep(W + 7, W + 7 + 3 + diff * 0.32, q.dist);
    return target + (h - target) * k;
  }

  _splatModifier(x, z, w) {
    const q = this.nearest(x, z, this._q);
    if (!q) return w;
    const g = smoothstep(this.W + 7, this.W + 1.5, q.dist);
    if (g <= 0) return w;
    return { sand: w.sand * (1 - g), dirt: Math.max(w.dirt, g), rock: w.rock * (1 - g * 0.85) };
  }

  /**
   * Wheel rays on the dirt: the trail's own surface with its jumps, whoops
   * and berms, falling away past the edge. Off the dirt → false (terrain).
   */
  raycastRoad(from, to, result, body) {
    const q = this.nearest(from.x, from.z, this._rq || (this._rq = {}));
    if (!q) return false;
    const W = this.W;
    const a = Math.abs(q.lat);
    if (a > W + 0.9) return false;
    const n = this.n;
    const i = q.i;
    const j = (i + 1) % n;
    const lc = q.lat < -W ? -W : q.lat > W ? W : q.lat;
    let y = this.h[i] + (this.h[j] - this.h[i]) * q.u + this._cross(lc, q.bank);
    let slopeR = a <= W ? this._crossSlope(lc, q.bank) : 0;
    if (a > W) {
      y -= (a - W) * 0.15;
      slopeR -= Math.sign(q.lat) * 0.15;
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
    let t = (ny * (y - from.y)) / denom;
    if (t > len) return true;
    // A wheel whose mount has been driven under the surface (a hard landing bottoming the suspension)
    // still stands on the dirt: contact at full compression, which lifts the bike back up.
    if (t < 0) {
      if (t < -0.9) return true;
      t = 0.001;
    }
    result.hitPointWorld.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
    result.hitNormalWorld.set(nx, ny, nz);
    result.distance = t;
    result.body = body;
    result.hasHit = true;
    return true;
  }

  /** Is (x, z) on the ridden dirt? */
  onDirt(x, z) {
    const q = this.nearest(x, z, this._dq || (this._dq = {}));
    return !!q && Math.abs(q.lat) < this.W + 0.9;
  }

  // ------------------------------------------------------------ visuals

  build(materials) {
    this.materials = materials;
    this._ribbon(materials);
    this._stakes();
    this._bales();
    this._tyreMarkers();
    this._startGate(materials);
    return this.group;
  }

  buildPhysics() {
    // The dirt is answered by raycastRoad; the solid props go into the island's collider set.
  }

  /** The dirt itself: rutted where the bikes run, loose and pebbly at the edges, fraying into the ground. */
  _ribbon(materials) {
    const n = this.n;
    const W = this.W;
    const t = this.terrain;
    const lats = [-(W + 1.9), -(W + 0.9), -W, -W * 0.66, -W * 0.33, 0, W * 0.33, W * 0.66, W, W + 0.9, W + 1.9];
    const cols = lats.length;
    const rows = n + 1;
    const pos = new Float32Array(rows * cols * 3);
    const aS = new Float32Array(rows * cols);
    const aL = new Float32Array(rows * cols);
    const aLine = new Float32Array(rows * cols);
    const aEdge = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      const i = r % n;
      const rx = -this.tz[i];
      const rz = this.tx[i];
      for (let c = 0; c < cols; c++) {
        const l = lats[c];
        const a = Math.abs(l);
        const x = this.x[i] + rx * l;
        const z = this.z[i] + rz * l;
        let y;
        const ground = t.heightAt(x, z);
        if (a <= W + 0.01) y = this.h[i] + this._cross(l, this.bank[i]);
        else if (a < W + 1) {
          // Loose dirt pushed to the edge by the tyres (a lip of it on the outside of the turns).
          const s = Math.sign(l);
          const lip = Math.max(0, s * this.bank[i]) * 0.9;
          y = Math.max(this.h[i] + this._cross(s * W, this.bank[i]) + 0.05 + lip, ground + 0.03);
        } else y = ground + 0.005; // draped on the ground, where it frays out
        const k = r * cols + c;
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        aS[k] = r * this.ds;
        aL[k] = l;
        aLine[k] = this.line[i];
        aEdge[k] = a > W + 1 ? 1 : 0;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + cols;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    geo.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
    geo.setAttribute('aLine', new THREE.BufferAttribute(aLine, 1));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(aEdge, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const T = materials.textures;
    const tint = new THREE.Vector3(...(t.biome.dirtTint || [1, 1, 1]));
    const mat = new THREE.MeshStandardMaterial({ name: 'עפר דחוס', color: 0xffffff, roughness: 0.9, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tDirt = { value: T.dirt };
      shader.uniforms.uTint = { value: tint };
      shader.uniforms.uW = { value: W };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aS; attribute float aL; attribute float aLine; attribute float aEdge;\nvarying float vS; varying float vL; varying float vLine; varying float vEdge; varying vec3 vTPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS; vL = aL; vLine = aLine; vEdge = aEdge; vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D tDirt; uniform vec3 uTint; uniform float uW;
          varying float vS; varying float vL; varying float vLine; varying float vEdge; varying vec3 vTPos;
          float tH; float tRut;
          float th1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float tvn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(th1(i), th1(i + vec2(1.0, 0.0)), f.x), mix(th1(i + vec2(0.0, 1.0)), th1(i + vec2(1.0, 1.0)), f.x), f.y); }`,
        )
        .replace(
          '#include <map_fragment>',
          `{
            vec2 wuv = vTPos.xz;
            // Fray into the ground: ragged, noisy edge instead of a hard border.
            float fray = tvn(wuv * 1.1) * 0.6 + tvn(wuv * 3.7) * 0.4;
            if (vEdge > 0.02 && vEdge > 0.18 + fray * 0.75) discard;
            vec3 dirt = texture2D(tDirt, wuv * 0.1).rgb * uTint;
            vec3 dirt2 = texture2D(tDirt, wuv * 0.43 + 0.37).rgb * uTint;
            float rl = vL - vLine;
            float wander = sin(vS * 0.17 + vLine) * 0.35 + sin(vS * 0.61) * 0.12;
            float r0 = rl - wander;
            // Ruts: the main line and two more either side, worn in by the bikes.
            float rut = exp(-pow(r0 / 0.3, 2.0)) + 0.55 * exp(-pow((r0 - 1.3) / 0.28, 2.0)) + 0.5 * exp(-pow((r0 + 1.4) / 0.28, 2.0));
            rut *= 0.7 + 0.3 * tvn(vec2(vS * 0.08, vL));
            tRut = rut;
            float edge = smoothstep(uW * 0.5, uW + 0.7, abs(vL));
            vec3 col = mix(dirt, dirt2, 0.18) * 1.04;
            col *= mix(1.0, 0.8, rut); // packed and a little damp in the ruts
            col = mix(col, col * vec3(1.1, 1.06, 1.0), edge * (1.0 - rut)); // dry, loose soil pushed to the edges
            // Stones and clods.
            vec2 cp = wuv * 2.6;
            vec2 cell = floor(cp);
            vec2 f = fract(cp) - 0.5 - (vec2(th1(cell + 1.3), th1(cell + 7.1)) - 0.5) * 0.5;
            float peb = step(0.9 - edge * 0.12, th1(cell)) * smoothstep(0.14, 0.06, length(f) * (0.7 + th1(cell + 2.2) * 0.9));
            col = mix(col, col * (0.62 + 0.75 * th1(cell + 3.7)), peb * (0.35 + 0.5 * edge) * (1.0 - rut * 0.7));
            // Tread prints in the ruts.
            float tread = step(0.55, fract(vS * 3.4 + abs(r0) * 1.6)) * exp(-pow(r0 / 0.16, 2.0));
            col *= 1.0 - 0.12 * tread;
            // Braking ripples and tyre scuffs over the whole width.
            col *= 0.94 + 0.06 * tvn(vec2(vS * 1.3, vL * 0.7));
            tH = -rut * 0.04 + peb * 0.012 + tread * 0.003 + dot(dirt2, vec3(0.008)) + tvn(wuv * 5.0) * 0.006;
            diffuseColor.rgb *= col;
          }`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.93, 0.8, tRut);')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 dpx = dFdx(-vViewPosition);
            vec3 dpy = dFdy(-vViewPosition);
            float hx = dFdx(tH);
            float hy = dFdy(tH);
            vec3 r1 = cross(dpy, normal);
            vec3 r2 = cross(normal, dpx);
            float det = dot(dpx, r1);
            vec3 grad = sign(det) * (hx * r1 + hy * r2);
            normal = normalize(abs(det) * normal - grad);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'trail-dirt';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'עפר';
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.dirtMat = mat;
  }

  /** Samples on the outside of turns (and each side of the jumps), where a course is staked. */
  _markedRuns() {
    const n = this.n;
    const mark = new Int8Array(n); // -1 / +1: side to stake, 0: none
    for (let i = 0; i < n; i++) {
      const k = this.kappa[i];
      if (Math.abs(k) > 1 / 70) mark[i] = k > 0 ? -1 : 1; // outside of a right-hander is the left (−lat)
    }
    // Widen each marked stretch so the tape starts before the turn and ends after it.
    const out = Int8Array.from(mark);
    const pad = Math.round(14 / this.ds);
    for (let i = 0; i < n; i++) {
      if (!mark[i]) continue;
      for (let d = -pad; d <= pad; d++) {
        const j = (i + d + n) % n;
        if (!out[j]) out[j] = mark[i];
      }
    }
    return out;
  }

  /** Wooden stakes with course tape strung between them round the turns. */
  _stakes() {
    const n = this.n;
    const W = this.W;
    const t = this.terrain;
    const side = this._markedRuns();
    const step = Math.round(6 / this.ds);
    const stakes = [];
    const runs = []; // consecutive stakes on the same side → one tape
    let run = null;
    for (let i = 0; i < n; i += step) {
      const s = side[i];
      if (!s) {
        run = null;
        continue;
      }
      const off = s * (W + 1.55);
      const x = this.x[i] - this.tz[i] * off;
      const z = this.z[i] + this.tx[i] * off;
      const y = t.heightAt(x, z);
      const p = { x, y, z, tilt: (Math.sin(i * 12.9898) * 43758.5453) % 0.08 };
      stakes.push(p);
      if (!run || run.side !== s) runs.push((run = { side: s, pts: [] }));
      run.pts.push(p);
    }
    // Stake: split wooden post, painted top.
    const post = new THREE.CylinderGeometry(0.028, 0.034, 1.05, 6, 3);
    post.translate(0, 0.52, 0);
    const col = new Float32Array(post.attributes.position.count * 3);
    for (let v = 0; v < post.attributes.position.count; v++) {
      const y = post.attributes.position.getY(v);
      const c = y > 0.86 ? [0.95, 0.42, 0.08] : [0.62, 0.5, 0.36];
      col.set(c, v * 3);
    }
    post.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const postMat = new THREE.MeshStandardMaterial({ name: 'יתדות עץ', vertexColors: true, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(post, postMat, Math.max(1, stakes.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    stakes.forEach((p, k) => {
      e.set(p.tilt, k * 1.7, -p.tilt * 0.7);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y - 0.12, p.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(k, m);
    });
    mesh.count = stakes.length;
    mesh.castShadow = true;
    mesh.name = 'יתדות';
    this.group.add(mesh);
    // Course tape: a sagging ribbon from stake top to stake top.
    const pos = [];
    const uv = [];
    const idx = [];
    for (const R of runs) {
      if (R.pts.length < 2) continue;
      // The tape's path: stake top to stake top, sagging a little in between.
      const line = [];
      let u = 0;
      for (let k = 0; k < R.pts.length - 1; k++) {
        const a = R.pts[k];
        const b = R.pts[k + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (let sgm = k === 0 ? 0 : 1; sgm <= 4; sgm++) {
          const f = sgm / 4;
          line.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + 0.8 - Math.sin(Math.PI * f) * 0.1, z: a.z + (b.z - a.z) * f, u: u + f * len });
        }
        u += len;
      }
      const base = pos.length / 3;
      line.forEach((p, k) => {
        pos.push(p.x, p.y + 0.045, p.z, p.x, p.y - 0.045, p.z);
        uv.push(p.u, 1, p.u, 0);
        if (k > 0) {
          const a = base + (k - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      });
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 8;
      const c = cv.getContext('2d');
      c.fillStyle = '#f4f1ea';
      c.fillRect(0, 0, 64, 8);
      c.fillStyle = '#d8261c';
      for (let x = -8; x < 64; x += 16) {
        c.beginPath();
        c.moveTo(x, 8);
        c.lineTo(x + 8, 0);
        c.lineTo(x + 16, 0);
        c.lineTo(x + 8, 8);
        c.fill();
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1.6, 1);
      const tape = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'סרט סימון', map: tex, roughness: 0.55, side: THREE.DoubleSide }));
      tape.name = 'סרט סימון';
      this.group.add(tape);
    }
  }

  /** Straw bales on the outside of the hairpins and beside the jumps. */
  _bales() {
    const n = this.n;
    const W = this.W;
    const t = this.terrain;
    const spots = [];
    const put = (i, s, along) => {
      const off = s * (W + 3.1);
      const tx = this.tx[i];
      const tz = this.tz[i];
      for (let b = 0; b < along; b++) {
        const d = (b - (along - 1) / 2) * 1.12;
        const x = this.x[i] - tz * off + tx * d;
        const z = this.z[i] + tx * off + tz * d;
        spots.push({ x, z, y: t.heightAt(x, z), yaw: Math.atan2(tx, tz) + Math.PI / 2 + (Math.sin(i * 3.1 + b) * 0.06), top: false });
      }
    };
    // Hairpins: the tightest point of each tight turn.
    for (let i = 0; i < n; i++) {
      const k = Math.abs(this.kappa[i]);
      if (k < 1 / 22) continue;
      let peak = true;
      for (let d = -Math.round(24 / this.ds); d <= Math.round(24 / this.ds); d++) if (Math.abs(this.kappa[(i + d + n) % n]) > k) peak = false;
      if (!peak) continue;
      const s = this.kappa[i] > 0 ? -1 : 1;
      for (const d of [-4, 4]) put((i + Math.round(d / this.ds) + n) % n, s, 3);
    }
    for (const J of this.jumps || []) if (J.kind === 'table') for (const s of [-1, 1]) put((J.i + 2) % n, s, 2);
    // Some stacked two high.
    const extra = [];
    spots.forEach((p, k) => {
      if (k % 5 === 2) extra.push({ ...p, top: true });
    });
    const all = [...spots, ...extra];
    if (!all.length) return;
    const geo = baleGeometry();
    const mat = baleMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, all.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    all.forEach((p, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw + (p.top ? 0.12 : 0));
      m.compose(new THREE.Vector3(p.x, p.y + (p.top ? 0.72 : 0.22), p.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(k, m);
      if (!p.top) this.solids.push({ x: p.x, y: p.y + 0.35, z: p.z, hx: 0.55, hy: 0.4, hz: 0.26, yaw: p.yaw });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'חבילות קש';
    this.group.add(mesh);
  }

  /** Old tyres half buried along the inside of the turns (a classic of dirt tracks). */
  _tyreMarkers() {
    const n = this.n;
    const W = this.W;
    const t = this.terrain;
    const side = this._markedRuns();
    const spots = [];
    const step = Math.round(1.6 / this.ds) || 1;
    for (let i = 0; i < n; i += step) {
      const k = Math.abs(this.kappa[i]);
      if (k < 1 / 40 || !side[i]) continue;
      const s = -side[i]; // inside
      const off = s * (W + 1.1);
      const x = this.x[i] - this.tz[i] * off;
      const z = this.z[i] + this.tx[i] * off;
      spots.push({ x, z, y: t.heightAt(x, z), yaw: Math.atan2(this.tx[i], this.tz[i]) + Math.PI / 2 });
    }
    if (!spots.length) return;
    const tyre = new THREE.TorusGeometry(0.31, 0.1, 8, 18);
    // Tread blocks round the outside.
    const p = tyre.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const y = p.getY(v);
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      if (r > 0.36) {
        const k = 1 + 0.018 * Math.sign(Math.sin(a * 22));
        p.setXY(v, x * k, y * k);
      }
    }
    tyre.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ name: 'צמיגים ישנים', color: 0x1a1a1a, roughness: 0.93 });
    const mesh = new THREE.InstancedMesh(tyre, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((s, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      m.compose(new THREE.Vector3(s.x, s.y - 0.04, s.z), q, new THREE.Vector3(1, 1, 1)); // half in the ground
      mesh.setMatrixAt(k, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'צמיגים';
    this.group.add(mesh);
  }

  /** The start: a steel drop-gate across the trail, and a banner overhead with the start lights. */
  _startGate(materials) {
    const W = this.W;
    const L = materials.lib;
    const back = this.gridSlot(0).back - 1.25;
    const s = 1 - back / this.length;
    const pose = this.pose(s, 0);
    const yaw = Math.atan2(pose.tangent.x, pose.tangent.z);
    const g = new THREE.Group();
    g.position.copy(pose.position);
    g.rotation.y = yaw;
    const steel = new THREE.MeshStandardMaterial({ name: 'פלדה', color: 0x9aa0a6, roughness: 0.45, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ name: 'פלדה צבועה', color: 0x2c3036, roughness: 0.6, metalness: 0.5 });
    // Base beam across the trail, and the posts at the ends with the release boxes.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.2, 0.12, 0.16), dark);
    beam.position.set(0, 0.04, 0);
    g.add(beam);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), dark);
      post.position.set(sx * (W + 0.55), 0.45, 0);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.5), steel);
      box.position.set(sx * (W + 0.55), 0.95, -0.05);
      g.add(post, box);
    }
    // The gates: one per lane, hinged at the foot, standing until the lights go green.
    const lanes = 8;
    const gw = (W * 2) / lanes - 0.06;
    const gate = new THREE.BoxGeometry(gw, 0.52, 0.035);
    gate.translate(0, 0.26, 0);
    const bar = new THREE.BoxGeometry(gw, 0.05, 0.06);
    bar.translate(0, 0.5, 0.01);
    const gateGeo = mergeGeometries([gate, bar]);
    const gates = new THREE.InstancedMesh(gateGeo, steel, lanes);
    gates.castShadow = true;
    gates.name = 'שערי זינוק';
    this.gateMesh = gates;
    this.gateLanes = lanes;
    this.gateW = gw;
    g.add(gates);
    // Banner arch over the start line.
    const line = this.pose(0, 0);
    const arch = new THREE.Group();
    arch.position.copy(line.position);
    arch.rotation.y = Math.atan2(line.tangent.x, line.tangent.z);
    const H = 4.8;
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, H + 0.6, 10), L.metal || steel);
      leg.position.set(sx * (W + 1.6), H / 2 - 0.2, 0);
      arch.add(leg);
    }
    const bannerMat = this._canvasMaterial((c, w, h) => {
      c.fillStyle = '#141414';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8b422';
      c.fillRect(0, 0, w, h * 0.12);
      c.fillRect(0, h * 0.88, w, h * 0.12);
      c.fillStyle = '#f4f4f4';
      c.font = `900 ${h * 0.5}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SHIMOTRON  MX', w * 0.5, h * 0.53);
    }, 1024, 128);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3.4, 0.9, 0.08), bannerMat);
    banner.position.set(0, H, 0);
    arch.add(banner);
    // Five start lights on a box under the banner.
    const lbox = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 0.3), dark);
    lbox.position.set(0, H - 0.68, 0);
    arch.add(lbox);
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshStandardMaterial({ name: 'נורת זינוק', color: 0x220404, emissive: 0xff1a0a, emissiveIntensity: 1, roughness: 0.3 });
      materials.trackEmissive(m, 0);
      this.startLights.push(m);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), m);
      lamp.position.set((k - 2) * 0.42, H - 0.68, -0.16);
      lamp.rotation.y = Math.PI;
      arch.add(lamp);
    }
    arch.traverse((o) => o.isMesh && (o.castShadow = true));
    this.group.add(g, arch);
    this.gateGroup = g;
    this._poseGates(0);
  }

  _poseGates(k) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const W = this.W;
    // Falls forward, away from the riders, and bounces flat.
    const a = (Math.PI / 2) * Math.min(1, k * k) - Math.sin(Math.min(1, Math.max(0, k - 1)) * Math.PI) * 0.12;
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
    for (let l = 0; l < this.gateLanes; l++) {
      m.compose(new THREE.Vector3(-W + (l + 0.5) * (this.gateW + 0.06), 0.1, 0.1), q, new THREE.Vector3(1, 1, 1));
      this.gateMesh.setMatrixAt(l, m);
    }
    this.gateMesh.instanceMatrix.needsUpdate = true;
  }

  setStartLights(lit, green = false) {
    this.startLights.forEach((m, k) => {
      m.emissive.set(green ? 0x22ff55 : 0xff1a0a);
      this.engine.materials.setEmissiveBase(m, green ? 6 : k < lit ? 7 : 0);
    });
    if (green) this.gateDown = true;
    else if (lit === 0) {
      this.gateDown = false;
      this.gateDrop = 0;
      if (this.gateMesh) this._poseGates(0);
    }
  }

  update(dt) {
    if (this.gateDown && this.gateDrop < 2) {
      this.gateDrop = Math.min(2, this.gateDrop + dt * 3.2);
      this._poseGates(this.gateDrop);
    }
  }
}

// ------------------------------------------------------------ props

let _bale = null;
/** A straw bale: slightly rounded block, bulging sides, two twine bands. */
function baleGeometry() {
  if (_bale) return _bale;
  const g = new THREE.BoxGeometry(1.1, 0.46, 0.52, 10, 4, 5);
  const p = g.attributes.position;
  for (let v = 0; v < p.count; v++) {
    let x = p.getX(v);
    let y = p.getY(v);
    let z = p.getZ(v);
    // Round the edges and let the straw bulge.
    const ex = Math.abs(x) / 0.55;
    const ey = Math.abs(y) / 0.23;
    const ez = Math.abs(z) / 0.26;
    const corner = Math.max(0, ey + ez - 1.55) * 0.06 + Math.max(0, ex + ey - 1.8) * 0.03;
    y -= Math.sign(y) * corner;
    z -= Math.sign(z) * corner;
    const bulge = (1 - ex * ex) * 0.02;
    z += Math.sign(z) * bulge * (1 - ey * ey);
    y += Math.sign(y) * bulge * 0.5;
    x += (Math.sin(y * 40 + z * 31) * 0.008);
    p.setXYZ(v, x, y, z);
  }
  g.computeVertexNormals();
  _bale = g;
  return g;
}

let _baleMat = null;
function baleMaterial() {
  if (_baleMat) return _baleMat;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#b89a55';
  c.fillRect(0, 0, 256, 256);
  // Straw: thousands of short strokes, mostly along the bale.
  for (let k = 0; k < 2600; k++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const a = (Math.random() - 0.5) * 0.9;
    const l = 6 + Math.random() * 18;
    const t = Math.random();
    c.strokeStyle = t < 0.5 ? `rgba(226,196,120,${0.5 + Math.random() * 0.4})` : t < 0.85 ? `rgba(150,118,60,${0.4 + Math.random() * 0.4})` : `rgba(96,78,44,0.5)`;
    c.lineWidth = 0.8 + Math.random() * 1.2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  // Twine bands.
  c.fillStyle = 'rgba(70,52,30,0.85)';
  for (const x of [70, 186]) c.fillRect(x, 0, 5, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _baleMat = new THREE.MeshStandardMaterial({ name: 'קש', map: tex, roughness: 0.95, color: 0xe8dcc0 });
  return _baleMat;
}
