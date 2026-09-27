import * as THREE from 'three';
import { Random } from '../engine/core/Random.js';

/** Bump when the generator's logic changes, so stored plans are regenerated. */
export const GENERATOR_VERSION = 4;

/**
 * Signature of everything a plan depends on (generator version, island
 * recipe, seed, size, track brief, road width): a stored plan is only
 * reused while this matches.
 */
export function planSignature(stage, halfWidth) {
  const str = JSON.stringify([GENERATOR_VERSION, stage.seed, stage.size, stage.island, stage.track, halfWidth]);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Compact, JSON-safe form of a plan. */
export function packPlan(plan, sig) {
  const r = (v) => Math.round(v * 100) / 100;
  return { sig, controls: plan.controls.map((p) => [r(p.x), r(p.z)]), length: r(plan.length), minRadius: r(plan.minRadius), corners: plan.corners, tight: plan.tight, maxGrade: plan.maxGrade, cutFill: plan.cutFill, climb: plan.climb, score: plan.score };
}

export function unpackPlan(packed) {
  return { ...packed, controls: packed.controls.map(([x, z]) => new THREE.Vector3(x, 0, z)) };
}

/**
 * Procedural circuit for any island.
 *
 * The loop is star-shaped around the island centre, so it never crosses
 * itself. Its radius per control angle comes from:
 *   1. a low-frequency harmonic shape (the island-scale flow),
 *   2. a few "features" — narrow radial dips that fold the road into
 *      hairpins and infield loops, and wider bulges that make sweepers,
 *   3. a local search along each ray for dry, low, gentle ground.
 * Candidates are validated (corner radius, clearance between sections,
 * water, gradient) and the best-scoring seed wins.
 */
export function generateTrack(terrain, stage, { halfWidth = 7, attempts = 48, log = false } = {}) {
  const I = stage.island;
  const R = I.radius;
  const [sx, sz] = I.stretch || [1, 1];
  const T = stage.track;
  const volcanoes = I.volcanoes || (I.volcano ? [I.volcano] : []);
  const rng = new Random(stage.seed * 7919 + 13);
  let best = null;
  const reasons = {};

  for (let attempt = 0; attempt < attempts; attempt++) {
    const K = 44;
    const rMid = (T.radius[0] + T.radius[1]) / 2;
    const span = T.radius[1] - T.radius[0];
    const harmonics = [2, 3, 4].map((k) => ({ k, a: rng.range(0, span * 0.55 / k), p: rng.range(0, Math.PI * 2) }));
    const features = [];
    const nf = 3 + Math.floor(rng.random() * 3);
    for (let f = 0; f < nf; f++) {
      const inward = rng.random() < 0.65;
      features.push({
        at: rng.range(0, K),
        width: inward ? rng.range(1.1, 2.0) : rng.range(2.2, 4),
        amp: (inward ? -1 : 1) * rng.range(0.08, T.wiggle * 0.5),
      });
    }
    const radii = [];
    for (let i = 0; i < K; i++) {
      const th = (i / K) * Math.PI * 2;
      let base = rMid;
      for (const h of harmonics) base += h.a * Math.sin(h.k * th + h.p);
      for (const f of features) {
        let d = Math.abs(i - f.at);
        d = Math.min(d, K - d);
        base += f.amp * Math.exp(-(d * d) / (2 * f.width * f.width));
      }
      base = Math.min(T.radius[1] + 0.1, Math.max(T.radius[0] - 0.28, base));
      let bestR = base;
      let bestCost = Infinity;
      for (let r = base - 0.08; r <= base + 0.08; r += 0.008) {
        const x = Math.cos(th) * r * R * sx;
        const z = Math.sin(th) * r * R * sz;
        const h = terrain.height(x, z);
        let cost = ((r - base) / 0.035) ** 2;
        if (h < 2.2) cost += 300 + (2.2 - h) * 50;
        if (h > 34) cost += (h - 34) * 5;
        const gx = terrain.height(x + 14, z) - terrain.height(x - 14, z);
        const gz = terrain.height(x, z + 14) - terrain.height(x, z - 14);
        cost += Math.hypot(gx, gz) * 0.35;
        // Skirt the volcanoes' flanks instead of climbing them.
        for (const V of volcanoes) cost += Math.max(0, 1 - Math.hypot(x - V.x, z - V.z) / (V.radius * 0.95)) * 400;
        if (cost < bestCost) {
          bestCost = cost;
          bestR = r;
        }
      }
      radii.push(bestR);
    }
    // One light 1-2-1 pass removes ray-search jitter without flattening features.
    const smooth = radii.map((r, i) => (radii[(i - 1 + K) % K] + 2 * r + radii[(i + 1) % K]) / 4);
    const pts = smooth.map((r, i) => {
      const th = (i / K) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(th) * r * R * sx, 0, Math.sin(th) * r * R * sz);
    });
    const result = evaluate(terrain, pts, halfWidth, T, volcanoes);
    if (result.reject) reasons[result.reject] = (reasons[result.reject] || 0) + 1;
    else if (!best || result.score > best.score) best = result;
  }
  if (log) console.log(stage.id, 'rejections', JSON.stringify(reasons));
  return best;
}

function evaluate(terrain, controls, W, T, volcanoes = []) {
  const curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const n = Math.round(length / 2);
  const P = curve.getSpacedPoints(n).slice(0, n);
  let minR = Infinity;
  let corners = 0;
  let tight = 0;
  let inCorner = false;
  let inTight = false;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 5 + n) % n];
    const b = P[i];
    const c = P[(i + 5) % n];
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    const Rr = area > 1e-6 ? (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (4 * area) : 1e9;
    minR = Math.min(minR, Rr);
    const isCorner = Rr < 150;
    if (isCorner && !inCorner) corners++;
    inCorner = isCorner;
    const isTight = Rr < 60;
    if (isTight && !inTight) tight++;
    inTight = isTight;
  }
  if (minR < 22) return { reject: 'radius' };
  for (const V of volcanoes) for (let i = 0; i < n; i += 4) if (Math.hypot(P[i].x - V.x, P[i].z - V.z) < V.radius * 0.72) return { reject: 'volcano' };
  const step = 5;
  for (let i = 0; i < n; i += step) {
    for (let j = i + 45; j < Math.min(n, n - 45 + i); j += step) {
      if (Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) < 2 * W + 24) return { reject: 'close' };
    }
  }
  const raw = P.map((p) => terrain.height(p.x, p.z));
  const wet = raw.filter((h) => h < 1.2).length / n;
  if (wet > 0.05) return { reject: 'water' };
  let h = raw.map((v) => Math.max(v, 2.6));
  for (let k = 0; k < 50; k++) h = h.map((_, i) => (h[(i - 3 + n) % n] + h[(i - 1 + n) % n] + 2 * h[i] + h[(i + 1) % n] + h[(i + 3) % n]) / 6);
  let maxGrade = 0;
  let climb = 0;
  for (let i = 0; i < n; i++) {
    maxGrade = Math.max(maxGrade, Math.abs(h[(i + 1) % n] - h[i]) / 2);
    climb += Math.max(0, h[(i + 1) % n] - h[i]);
  }
  const cutFill = Math.max(...raw.map((v, i) => Math.abs(Math.max(v, 2.6) - h[i])));
  const [lo, hi] = T.targetLength;
  let score = 100;
  if (length < lo) score -= (lo - length) / 20;
  if (length > hi) score -= (length - hi) / 20;
  score -= Math.max(0, maxGrade - 0.07) * 350;
  score -= Math.max(0, cutFill - 9) * 3;
  score -= wet * 300;
  score += Math.min(corners, 16) * 2.5;
  score += Math.min(tight, 4) * 4;
  score += Math.min(climb, 140) * 0.05;
  return { controls, length, minRadius: minR, corners, tight, maxGrade, cutFill, climb, score };
}
