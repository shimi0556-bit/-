import * as THREE from 'three';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const HALF = 6.6; // asphalt half-width, like the bridge deck

/**
 * Roads from the bridges down to the island's circuit. Each starts flush
 * with the end of a bridge deck, runs inland, and curves round to join
 * the circuit through an opening in its barriers. The ground under them
 * is levelled (with graded banks), trees and houses keep off, and they
 * are drawn as asphalt with edge lines and a centre line.
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
    for (const S of this.spurs) track.gaps.push({ i: S.join, side: S.side, half: Math.ceil(13 / track.ds) });
  }

  _spur(E) {
    const tr = this.track;
    const P0 = new THREE.Vector3(E.x, 0, E.z);
    const P1 = new THREE.Vector3(E.x + E.ix * 40, 0, E.z + E.iz * 40);
    // The nearest point of the circuit.
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < tr.n; i++) {
      const d = (tr.x[i] - P1.x) ** 2 + (tr.z[i] - P1.z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const rx = -tr.tz[bi];
    const rz = tr.tx[bi];
    const lat = (P1.x - tr.x[bi]) * rx + (P1.z - tr.z[bi]) * rz;
    const side = lat >= 0 ? 1 : -1;
    const W = tr.W;
    const J = new THREE.Vector3(tr.x[bi] + rx * side * (W - 0.6), 0, tr.z[bi] + rz * side * (W - 0.6));
    const J2 = new THREE.Vector3(tr.x[bi] + rx * side * (W + 24), 0, tr.z[bi] + rz * side * (W + 24));
    const pts = Math.sqrt(bd) > 70 ? [P0, P1, J2, J] : [P0, J2, J];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const L = curve.getLength();
    const m = Math.max(8, Math.ceil(L / 3));
    const y0 = E.y;
    const y1 = tr.h[bi] + side * (W - 0.6) * tr.bank[bi];
    const samples = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k <= m; k++) {
      const u = k / m;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      // Level off the deck first, then ease down (or up) to the circuit.
      const y = y0 + (y1 - y0) * smoothstep(0.08, 1, u);
      samples.push({ x: p.x, z: p.z, y, tx: t.x, tz: t.z, s: u * L });
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
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
        if (!best || d < best.d) {
          best = out;
          out.d = d;
          out.y = a.y + (b.y - a.y) * u;
        }
      }
    }
    return best;
  }

  /** Height of the asphalt at (x, z), or null off these roads. */
  pavedY(x, z) {
    const q = this.nearest(x, z, this._pq || (this._pq = {}));
    return q && q.d < HALF + 0.3 ? q.y + 0.04 : null;
  }

  dist(x, z) {
    const q = this.nearest(x, z, this._q || (this._q = {}));
    return q ? q.d : Infinity;
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
    if (!q || q.d > 40) return h;
    if (this.track.clearance(x, z) < 1.5) return h;
    const target = q.y - 0.08;
    // Level a full terrain cell past the edge, so no ground triangle pokes through the asphalt.
    const k = smoothstep(HALF + 5, HALF + 8 + Math.min(24, Math.abs(h - target) * 1.6), q.d);
    return target + (h - target) * k;
  }

  /** Ground paint: packed dirt along the verges. */
  splat(x, z, w) {
    const d = this.dist(x, z);
    if (d > HALF + 6) return w;
    const g = smoothstep(HALF + 6, HALF + 1, d);
    return { ...w, sand: (w.sand || 0) * (1 - g), dirt: Math.max(w.dirt || 0, 0.85 * g), rock: (w.rock || 0) * (1 - g) };
  }

  /** Asphalt ribbons with white edge lines and a yellow centre line. */
  build(materials) {
    const group = new THREE.Group();
    group.name = 'כבישי גישה לגשרים';
    if (!this.spurs.length) return group;
    const T = materials.textures;
    const road = new THREE.MeshStandardMaterial({ name: 'כביש גישה', map: T.asphalt || null, normalMap: T.asphaltNormal || null, color: T.asphalt ? 0xffffff : 0x2a2a2c, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const paint = new THREE.MeshStandardMaterial({ name: 'צבע כביש', color: 0xe8e8e2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const yellow = new THREE.MeshStandardMaterial({ name: 'קו צהוב', color: 0xe0b020, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const ribbon = (S, l0, l1, lift, dash = 0) => {
      const pos = [];
      const uv = [];
      const idx = [];
      const P = S.samples;
      let row = 0;
      for (let k = 0; k < P.length; k++) {
        const a = P[k];
        const rx = -a.tz;
        const rz = a.tx;
        pos.push(a.x + rx * l0, a.y + lift, a.z + rz * l0, a.x + rx * l1, a.y + lift, a.z + rz * l1);
        uv.push(l0 / 8, a.s / 8, l1 / 8, a.s / 8);
        if (k) {
          const on = !dash || Math.floor(a.s / dash) % 2 === 0;
          if (on) idx.push(row - 2, row - 1, row, row - 1, row + 1, row);
        }
        row += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    for (const S of this.spurs) {
      const r = new THREE.Mesh(ribbon(S, -HALF, HALF, 0.04), road);
      r.receiveShadow = true;
      group.add(r);
      for (const l of [-HALF + 0.3, HALF - 0.45]) group.add(new THREE.Mesh(ribbon(S, l, l + 0.15, 0.05), paint));
      group.add(new THREE.Mesh(ribbon(S, -0.08, 0.08, 0.05, 3), yellow));
    }
    group.traverse((o) => (o.userData.noPick = true));
    return group;
  }
}
