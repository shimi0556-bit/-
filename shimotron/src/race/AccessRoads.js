import * as THREE from 'three';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 0..1 over a road's length: level off the deck, then an even grade with rounded crests and sags.
const ramp = (u) => {
  const t = Math.min(1, Math.max(0, (u - 0.05) / 0.95));
  const e = 0.15;
  const v = 1 / (1 - e);
  if (t < e) return (v * t * t) / (2 * e);
  if (t > 1 - e) return 1 - (v * (1 - t) ** 2) / (2 * e);
  return v * (t - e / 2);
};

const HALF = 6.6; // asphalt half-width, like the bridge deck
const FLARE = 9; // radius of the rounded corners where a road meets the circuit
const BLEND = 20; // over this far from the circuit's edge the road's surface turns into the circuit's own

/**
 * Roads from the bridges down to the island's circuit. Each starts flush
 * with the end of a bridge deck, runs inland, and curves round to join
 * the circuit through an opening in its barriers. The ground under them
 * is levelled (with graded banks), trees and houses keep off, and they
 * are drawn with the circuit's own asphalt and markings.
 *
 * Where one meets the circuit it is built as a junction rather than laid
 * on top: it widens into rounded corners, its surface warps over its last
 * stretch into the plane of the circuit (camber and grade) so the two meet
 * flush, it stops at the circuit's edge instead of overlapping it, the
 * circuit's edge line and kerbs break for the mouth, and a give-way line
 * crosses the incoming lane.
 */
export class AccessRoads {
  constructor(track, ends) {
    this.track = track;
    this.spurs = [];
    for (const E of ends) {
      const spur = this._spur(E);
      if (spur) this.spurs.push(spur);
    }
    // Openings in the circuit's barriers where they join.
    track.gaps = track.gaps || [];
    // `open` is the mouth itself (no edge line, no kerb; the wheels leave the circuit flush), `half` the barriers.
    for (const S of this.spurs) track.gaps.push({ i: S.join, side: S.side, half: Math.ceil((HALF + FLARE + 5) / track.ds), open: Math.ceil((HALF + FLARE) / track.ds), road: true });
  }

  _spur(E) {
    const tr = this.track;
    const P0 = new THREE.Vector3(E.x, 0, E.z);
    const nearestTo = (P) => {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < tr.n; i++) {
        const d = (tr.x[i] - P.x) ** 2 + (tr.z[i] - P.z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return [bi, Math.sqrt(bd)];
    };
    // Straight on off the deck first (no tight turn at its end), as far as the circuit leaves room for.
    const [, d0] = nearestTo(P0);
    const run = Math.max(10, Math.min(40, d0 - tr.W - 34));
    const P1 = new THREE.Vector3(E.x + E.ix * run, 0, E.z + E.iz * run);
    // Where to join the circuit: not simply its nearest point, but the one along a stretch of it that
    // gives a road a driver would expect: gentle enough (grade), no hairpin off the deck, not cutting
    // across the circuit, and short.
    const [b0] = nearestTo(P1);
    const W = tr.W;
    const y0 = E.y;
    const span = Math.round(320 / tr.ds);
    const stepI = Math.max(1, Math.round(3 / tr.ds));
    let best = null;
    for (let o = -span; o <= span; o += stepI) {
      const i = (b0 + o + tr.n) % tr.n;
      const rx = -tr.tz[i];
      const rz = tr.tx[i];
      const lat = (P1.x - tr.x[i]) * rx + (P1.z - tr.z[i]) * rz;
      const side = lat >= 0 ? 1 : -1;
      const J2x = tr.x[i] + rx * side * (W + 24);
      const J2z = tr.z[i] + rz * side * (W + 24);
      const dx = J2x - P1.x;
      const dz = J2z - P1.z;
      const d = Math.hypot(dx, dz) || 1;
      // Turning: off the deck's line onto the run to J2, then onto the square approach to the circuit.
      const a1 = Math.acos(THREE.MathUtils.clamp((dx * E.ix + dz * E.iz) / d, -1, 1));
      const a2 = Math.acos(THREE.MathUtils.clamp((dx * -rx * side + dz * -rz * side) / d, -1, 1));
      const radius = (d + 24) / (a1 + a2 + 0.05);
      // And the bend off the deck's line itself, taken within the straight run and half the way on.
      const radius1 = (run + d * 0.5) / (a1 + 0.05);
      const rise = Math.abs(tr.h[i] + side * W * tr.bank[i] - y0);
      const grade = (1.25 * rise) / (run + d + 24);
      // The run to J2 must stay on this side of the circuit (and clear of it).
      let cuts = false;
      for (let k = 1; k < 6 && !cuts; k++) {
        const q = tr.nearest(P1.x + (dx * k) / 6, P1.z + (dz * k) / 6, this._cq || (this._cq = {}));
        if (q && q.dist < W + 10) cuts = true;
      }
      if (cuts) continue;
      const score = d + 2500 * Math.max(0, grade - 0.07) + 6 * Math.max(0, 22 - radius) + 8 * Math.max(0, 28 - radius1) + Math.abs(o) * tr.ds * 0.05;
      if (!best || score < best.score) best = { i, side, score };
    }
    const bi = best ? best.i : b0;
    const rx = -tr.tz[bi];
    const rz = tr.tx[bi];
    const side = best ? best.side : (P1.x - tr.x[bi]) * rx + (P1.z - tr.z[bi]) * rz >= 0 ? 1 : -1;
    // The road stops at the circuit's edge: it joins it, it does not lie on it.
    const J = new THREE.Vector3(tr.x[bi] + rx * side * (W - 0.05), 0, tr.z[bi] + rz * side * (W - 0.05));
    const J2 = new THREE.Vector3(tr.x[bi] + rx * side * (W + 24), 0, tr.z[bi] + rz * side * (W + 24));
    const pts = P1.distanceTo(J2) > 14 ? [P0, P1, J2, J] : [P0, P1, J];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const L = curve.getLength();
    const y1 = tr.h[bi] + side * W * tr.bank[bi];
    const samples = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    // Every 3 m, and finely over the mouth, where the corners round off.
    const at = [];
    const fine = L - FLARE - 6;
    const m = Math.max(6, Math.ceil(fine / 3));
    for (let k = 0; k <= m; k++) at.push((fine * k) / m);
    for (let s = fine + 0.6; s < L; s += 0.6) at.push(s);
    at.push(L);
    for (const sAt of at) {
      const u = Math.min(1, sAt / L);
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      // Level off the deck first, then ease down (or up) to the circuit.
      const y = y0 + (y1 - y0) * ramp(u);
      // How far short of the circuit's edge, and the half-width there: the rounded corners of the mouth.
      const dj = Math.max(0, L - sAt - 0.05);
      const half = HALF + (dj < FLARE ? FLARE - Math.sqrt(Math.max(0, FLARE * FLARE - (FLARE - dj) ** 2)) : 0);
      samples.push({ x: p.x, z: p.z, y, tx: t.x, tz: t.z, s: u * L, dj, half });
      minX = Math.min(minX, p.x - half);
      maxX = Math.max(maxX, p.x + half);
      minZ = Math.min(minZ, p.z - half);
      maxZ = Math.max(maxZ, p.z + half);
    }
    const pad = 40;
    // The deck climbs away from the road's start: the ground must stay under it.
    const ox = -E.ix;
    const oz = -E.iz;
    minX = Math.min(minX, E.x + ox * 70);
    maxX = Math.max(maxX, E.x + ox * 70);
    minZ = Math.min(minZ, E.z + oz * 70);
    maxZ = Math.max(maxZ, E.z + oz * 70);
    return { samples, join: bi, side, length: L, box: [minX - pad, maxX + pad, minZ - pad, maxZ + pad], deck: { x: E.x, z: E.z, y: E.y, ox, oz } };
  }

  /** Nearest road point to (x, z): { d, y } or null when far from every road. */
  nearest(x, z, out = {}) {
    let best = null;
    for (const S of this.spurs) {
      const [x0, x1, z0, z1] = S.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const P = S.samples;
      for (let k = 0; k < P.length - 1; k++) {
        const a = P[k];
        const b = P[k + 1];
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        let u = ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz);
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(x - a.x - vx * u, z - a.z - vz * u);
        // Nearest to the edge, not the centre line: over the flared mouth that is what decides which road this is.
        const half = a.half + (b.half - a.half) * u;
        if (!best || d - half < best.d - best.half) {
          best = out;
          out.d = d;
          out.half = half;
          out.y = a.y + (b.y - a.y) * u;
          out.dj = a.dj + (b.dj - a.dj) * u;
          out.spur = S;
        }
      }
    }
    return best;
  }

  /**
   * Surface height of the road at (x, z), given its nearest-point query q:
   * its own profile, turned over the last BLEND metres into the circuit's
   * plane carried out past the edge, so at the edge the two are one surface.
   */
  surfaceY(x, z, q) {
    let y = q.y;
    if (q.dj < BLEND + 4) {
      const tr = this.track;
      const c = tr.nearest(x, z, this._cq || (this._cq = {}));
      if (c) {
        let di = Math.abs(c.i - q.spur.join);
        di = Math.min(di, tr.n - di);
        if (di * tr.ds < HALF + FLARE + 30) {
          const W = tr.W;
          const lat = c.lat < -W ? -W : c.lat > W ? W : c.lat;
          const yc = c.h + lat * c.bank;
          const w = 1 - smoothstep(W, W + BLEND, Math.abs(c.lat));
          y += (yc - y) * w;
        }
      }
    }
    return y;
  }

  /** Height of the asphalt at (x, z), or null off these roads. */
  pavedY(x, z) {
    const q = this.nearest(x, z, this._pq || (this._pq = {}));
    return q && q.d < q.half + 0.3 ? this.surfaceY(x, z, q) + 0.04 : null;
  }

  dist(x, z) {
    const q = this.nearest(x, z, this._q || (this._q = {}));
    return q ? q.d : Infinity;
  }

  /** Distance past the asphalt's edge (negative on it), flared mouths included. */
  edgeDist(x, z) {
    const q = this.nearest(x, z, this._q || (this._q = {}));
    return q ? q.d - q.half : Infinity;
  }

  /** Terrain height with the roads levelled in (the circuit's own shaping wins on its asphalt). */
  height(x, z, h) {
    if (!this.spurs.length) return h;
    // Under the first stretch of each bridge deck: cut the ground below it.
    for (const S of this.spurs) {
      const D = S.deck;
      const t = (x - D.x) * D.ox + (z - D.z) * D.oz;
      if (t < -2 || t > 70) continue;
      const lat = Math.abs((x - D.x) * -D.oz + (z - D.z) * D.ox);
      if (lat > 22) continue;
      const under = D.y + 0.055 * Math.max(0, t) - 0.35;
      const k = smoothstep(9, 22, lat);
      if (h > under) h = under + (h - under) * k;
    }
    const q = this.nearest(x, z, this._hq || (this._hq = {}));
    if (!q || q.d > q.half + 34) return h;
    if (this.track.clearance(x, z) < 1.5) return h;
    const target = this.surfaceY(x, z, q) - 0.12;
    // Level a full terrain cell past the edge, so no ground triangle pokes through the asphalt.
    const k = smoothstep(q.half + 4, q.half + 7 + Math.min(24, Math.abs(h - target) * 1.6), q.d);
    return target + (h - target) * k;
  }

  /** Ground paint: packed dirt along the verges. */
  splat(x, z, w) {
    const d = this.edgeDist(x, z);
    if (d > 6) return w;
    const g = smoothstep(6, 1, d);
    return { ...w, sand: (w.sand || 0) * (1 - g), dirt: Math.max(w.dirt || 0, 0.85 * g), rock: (w.rock || 0) * (1 - g) };
  }

  /**
   * The roads in the circuit's own asphalt and paint (its material, fed the
   * same per-vertex road coordinates), so where they meet the circuit they
   * read as one surface.
   */
  build(materials) {
    const group = new THREE.Group();
    group.name = 'כבישי גישה לגשרים';
    if (!this.spurs.length) return group;
    const tr = this.track;
    const W = tr.W;
    const mat = tr.roadMaterial;
    // Across: the shoulders (skirts dropping under the ground), then the asphalt in eighths.
    const fr = [-1.06, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.06];
    const c = {};
    for (const S of this.spurs) {
      const pos = [];
      const uv = [];
      const road = [];
      const dirt = [];
      const gap = [];
      const idx = [];
      const P = S.samples;
      const cols = fr.length;
      for (let k = 0; k < P.length; k++) {
        const a = P[k];
        const tl = Math.hypot(a.tx, a.tz) || 1;
        const tx = a.tx / tl;
        const tz = a.tz / tl;
        for (let ci = 0; ci < cols; ci++) {
          const f = fr[ci];
          const skirt = Math.abs(f) > 1.001;
          const o = skirt ? Math.sign(f) * (a.half + 0.35) : f * a.half;
          let x = a.x - tz * o;
          let z = a.z + tx * o;
          // Over the mouth: no point of the road on the circuit; pull it back to the circuit's edge.
          if (a.dj < FLARE + 3) {
            for (let it = 0; it < 4; it++) {
              const q = tr.nearest(x, z, c);
              if (!q || Math.abs(q.lat) >= W) break;
              x -= tx * (W - Math.abs(q.lat) + 0.01);
              z -= tz * (W - Math.abs(q.lat) + 0.01);
            }
          }
          const q = this.nearest(x, z, this._bq || (this._bq = {}));
          const y = (q ? this.surfaceY(x, z, q) : a.y) + 0.03 - (skirt ? 0.4 : 0);
          pos.push(x, y, z);
          // Lateral scaled so the edge lines follow the rounded corners out to the circuit.
          const l = Math.max(-1, Math.min(1, f)) * W;
          const d = a.s + 10;
          uv.push((skirt ? o + Math.sign(f) * 0.4 : o) / 2.5, d / 2.5);
          road.push(l, d, 1e4);
          dirt.push(0);
          gap.push(0, 0, a.dj);
        }
        if (k) {
          const r0 = (k - 1) * cols;
          const r1 = k * cols;
          for (let ci = 0; ci < cols - 1; ci++) idx.push(r0 + ci, r0 + ci + 1, r1 + ci, r0 + ci + 1, r1 + ci + 1, r1 + ci);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 3));
      g.setAttribute('aDirt', new THREE.Float32BufferAttribute(dirt, 1));
      g.setAttribute('aGap', new THREE.Float32BufferAttribute(gap, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      // Face up whichever way round the rows were laid.
      if (g.attributes.normal.getY(Math.floor(cols / 2)) < 0) {
        for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
        g.setIndex(idx);
        g.computeVertexNormals();
      }
      const r = new THREE.Mesh(g, mat);
      r.name = 'כביש גישה';
      r.receiveShadow = true;
      group.add(r);
    }
    group.traverse((o) => (o.userData.noPick = true));
    return group;
  }
}
