import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The glass tunnels under the sea (see Track._tunnels for the road's profile).
 * Each tunnel, from either shore inwards:
 *  - an open cut: the road ramps down between concrete retaining walls whose
 *    tops follow the land, with a walkway each side (the sea is not drawn
 *    inside the walls: Water's dry zones);
 *  - a headwall over the portal where the cut meets the tube;
 *  - the tube: a glass arch on concrete plinths with steel ribs every 12 m,
 *    LED strips along the crown and the plinths, all lying on the sea floor
 *    (the ground is dredged into a trench, or banked up into a berm, under it).
 * The walls are solid (boxes in the island's collider set).
 */
export class SeaTunnels {
  constructor(engine, terrain, track, materials) {
    this.engine = engine;
    this.terrain = terrain;
    this.track = track;
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = 'מנהרות ים';
  }

  /** The ground as it was before any road was carved into it. */
  _natural(x, z) {
    const t = this.terrain;
    const m = t.heightModifier;
    t.heightModifier = null;
    const h = t.height(x, z);
    t.heightModifier = m;
    return h;
  }

  build(colliders) {
    const tr = this.track;
    const n = tr.n;
    const W = tr.W;
    const crown = tr.crown;
    const conc = [];
    const walk = [];
    const glass = [];
    const leds = [];
    const ribs = [];
    const at = (i) => ((i % n) + n) % n;
    this.dry = [];
    for (const T of tr.tunnels) {
      // Wall tops along the cut: the land just outside them (never under the sea's reach).
      const top = new Map();
      for (let i = T.a; i <= T.b; i++) {
        const k = at(i);
        let t = 1.4;
        for (const side of [-1, 1]) {
          const rx = -tr.tz[k] * side;
          const rz = tr.tx[k] * side;
          t = Math.max(t, this._natural(tr.x[k] + rx * (W + 4.2), tr.z[k] + rz * (W + 4.2)) + 0.35);
        }
        top.set(k, Math.min(t, tr.h[k] + 40));
      }
      const cuts = [
        [T.a, T.t0],
        [T.t1, T.b],
      ].filter(([p, q]) => q > p);
      for (const [p, q] of cuts) {
        const ids = [];
        for (let i = p; i <= q; i++) ids.push(at(i));
        for (const side of [-1, 1]) {
          // Retaining wall: inner face, cap, outer face (its foot hidden in the ground).
          conc.push(
            this._extrude(ids, (k) => {
              const h = tr.h[k];
              const tp = top.get(k);
              return [
                [side * (W + 2.0), h - 0.4],
                [side * (W + 2.0), tp],
                [side * (W + 3.6), tp],
                [side * (W + 3.6), Math.min(h - 0.4, tp - 6)],
              ];
            }, side < 0),
          );
          for (let s = 0; s + 1 < ids.length; s += 4) {
            const k0 = ids[s];
            const k1 = ids[Math.min(ids.length - 1, s + 4)];
            const hTop = Math.max(top.get(k0), top.get(k1));
            const hBot = Math.min(tr.h[k0], tr.h[k1]) - 0.4;
            this._wallBox(colliders, k0, k1, side * (W + 2.8), 0.8, hBot, hTop);
          }
        }
        // Dry zone for the sea: the cut between its walls (and the slope just behind them).
        for (let s = 0; s < ids.length; s += 6) {
          const k0 = ids[s];
          const k1 = ids[Math.min(ids.length - 1, s + 6)];
          this.dry.push(new THREE.Vector4(tr.x[k0], tr.z[k0], tr.x[k1], tr.z[k1]));
        }
      }
      // Walkways the whole length (they also cover the trench floor beside the road).
      const all = [];
      for (let i = T.a; i <= T.b; i++) all.push(at(i));
      for (const side of [-1, 1]) {
        walk.push(
          this._extrude(all, (k) => {
            const h = tr.h[k];
            return [
              [side * (W + 0.35), h - 0.05],
              [side * (W + 0.35), h + 0.18],
              [side * (W + 2.0), h + 0.18],
            ];
          }, side > 0),
        );
      }
      // Headwalls over the portals.
      for (const k of [at(T.t0), at(T.t1)]) {
        if (!(T.t1 > T.t0)) break;
        const h = tr.h[k];
        const tp = top.get(k) ?? 1.4;
        const g = new THREE.BoxGeometry(2 * (W + 3.6), tp - (h + crown - 0.6), 1.4);
        g.translate(0, (tp - h + crown - 0.6) / 2, 0);
        g.applyMatrix4(this._frame(k));
        g.deleteAttribute('uv');
        conc.push(g.toNonIndexed());
      }
      if (!(T.t1 > T.t0)) continue;
      const tube = [];
      for (let i = T.t0; i <= T.t1; i++) tube.push(at(i));
      const N = 22;
      // Glass: an elliptical arch from plinth to plinth.
      glass.push(
        this._extrude(tube, (k) => {
          const h = tr.h[k];
          const out = [];
          for (let j = 0; j <= N; j++) {
            const th = (j / N) * Math.PI;
            out.push([Math.cos(th) * (W + 2.0), h + 1.0 + Math.sin(th) * (crown - 1.0)]);
          }
          return out;
        }),
      );
      for (const side of [-1, 1]) {
        // Plinth: the concrete footing the arch stands on, down to the slab under the road.
        conc.push(
          this._extrude(tube, (k) => {
            const h = tr.h[k];
            return [
              [side * (W + 2.0), h + 0.1],
              [side * (W + 2.0), h + 1.0],
              [side * (W + 2.9), h + 1.0],
              [side * (W + 2.9), h - 1.7],
              [0, h - 1.7],
            ];
          }, side < 0),
        );
        // Solid all the way round: the plinth and the glass's lower wall, then tiers stepping in under
        // the arch and the roof, so nothing (a tall truck on its side, a car in the air) leaves the tube.
        const archAt = (y) => (W + 2) * Math.sqrt(Math.max(0, 1 - (y / (crown - 1)) ** 2)); // half width y above h + 1
        for (let s = 0; s + 1 < tube.length; s += 4) {
          const k0 = tube[s];
          const k1 = tube[Math.min(tube.length - 1, s + 4)];
          const lo = Math.min(tr.h[k0], tr.h[k1]);
          const hi = Math.max(tr.h[k0], tr.h[k1]);
          this._wallBox(colliders, k0, k1, side * (W + 2.4), 0.4, lo - 0.4, hi + 3.2);
          // Each tier's face is where the glass is at the tier's top (inside the curve all the way up).
          for (const [y0, y1] of [[3.2, 4.0], [4.0, 4.8], [4.8, 5.6], [5.6, crown - 0.9]]) {
            this._wallBox(colliders, k0, k1, side * (archAt(y1 - 1) + 0.4), 0.4, lo + y0 - 0.1, hi + y1);
          }
          if (side > 0) this._wallBox(colliders, k0, k1, 0, archAt(crown - 1.9) + 0.6, lo + crown - 0.9, hi + crown);
        }
        // LED strip along the plinth top.
        leds.push(
          this._extrude(tube, (k) => {
            const h = tr.h[k];
            return [
              [side * (W + 1.98), h + 0.92],
              [side * (W + 1.98), h + 1.04],
            ];
          }, side > 0),
        );
      }
      // LED strip under the crown.
      leds.push(
        this._extrude(tube, (k) => {
          const h = tr.h[k] + crown - 0.08;
          return [
            [0.35, h],
            [-0.35, h],
          ];
        }),
      );
      // Steel ribs every 12 m.
      const every = Math.max(1, Math.round(12 / tr.ds));
      const rib = this._ribGeometry(W + 2.0, crown - 1.0);
      for (let s = 0; s < tube.length; s += every) {
        const g = rib.clone();
        g.translate(0, 1.0, 0);
        g.applyMatrix4(this._frame(tube[s]));
        ribs.push(g);
      }
    }
    const add = (list, mat, name, shadow = true) => {
      if (!list.length) return null;
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.name = name;
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const concrete = new THREE.MeshStandardMaterial({ name: 'בטון מנהרה', color: 0x9b978e, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
    add(conc, concrete, 'קירות מנהרה');
    add(walk, new THREE.MeshStandardMaterial({ name: 'מדרכת מנהרה', color: 0x6f6d68, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }), 'מדרכות מנהרה');
    add(ribs, new THREE.MeshStandardMaterial({ name: 'צלעות פלדה', color: 0x5d666e, roughness: 0.38, metalness: 0.85 }), 'צלעות מנהרה');
    const led = new THREE.MeshStandardMaterial({ name: 'פסי לד', color: 0x0b1418, emissive: 0x9fe8ff, emissiveIntensity: 1, roughness: 0.5, side: THREE.DoubleSide });
    this.materials.trackEmissive(led, 1.4);
    add(leds, led, 'תאורת מנהרה', false);
    // Thick, clean glass: a faint blue-green tint, a mirror-like sheen at grazing angles.
    const glassMat = new THREE.MeshPhysicalMaterial({
      name: 'זכוכית מנהרה',
      color: 0xbfe8ee,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.14,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const g = add(glass, glassMat, 'זכוכית מנהרה', false);
    if (g) g.renderOrder = 6;
    return this.group;
  }

  /** A box collider along the road from sample k0 to k1, `lat` across, `half` thick, from y0 to y1. */
  _wallBox(colliders, k0, k1, lat, half, y0, y1) {
    const tr = this.track;
    const rx0 = -tr.tz[k0];
    const rz0 = tr.tx[k0];
    const rx1 = -tr.tz[k1];
    const rz1 = tr.tx[k1];
    const ax = tr.x[k0] + rx0 * lat;
    const az = tr.z[k0] + rz0 * lat;
    const bx = tr.x[k1] + rx1 * lat;
    const bz = tr.z[k1] + rz1 * lat;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return;
    colliders.box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, half, (y1 - y0) / 2, len / 2 + 0.3, Math.atan2(bx - ax, bz - az), 'default');
  }

  /** Road frame at sample k: x across (right), y up, z along; pitched with the road. */
  _frame(k) {
    const tr = this.track;
    const n = tr.n;
    const j = (k + 1) % n;
    const slope = (tr.h[j] - tr.h[k]) / tr.ds;
    const t = new THREE.Vector3(tr.tx[k], slope, tr.tz[k]).normalize();
    const r = new THREE.Vector3(-tr.tz[k], 0, tr.tx[k]).normalize();
    const u = new THREE.Vector3().crossVectors(t, r).normalize().negate();
    if (u.y < 0) u.negate();
    return new THREE.Matrix4().makeBasis(r, u, t).setPosition(tr.x[k], tr.h[k], tr.z[k]);
  }

  /** One steel rib: a flat band round the outside of the arch (a × b ellipse), 0.35 m wide. */
  _ribGeometry(a, b) {
    const N = 26;
    const pos = [];
    const idx = [];
    for (let j = 0; j <= N; j++) {
      const th = (j / N) * Math.PI;
      const c = Math.cos(th);
      const s = Math.sin(th);
      for (const [f, z] of [
        [1.0, -0.18],
        [1.0, 0.18],
        [1.045, 0.18],
        [1.045, -0.18],
      ])
        pos.push(c * a * f, s * b * f, z);
    }
    for (let j = 0; j < N; j++) {
      const o = j * 4;
      const p = (j + 1) * 4;
      for (let e = 0; e < 4; e++) {
        const e1 = (e + 1) % 4;
        idx.push(o + e, p + e, p + e1, o + e, p + e1, o + e1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const out = g.toNonIndexed();
    out.computeVertexNormals();
    return out;
  }

  /**
   * A strip swept along samples `ids`: profile(k) gives the cross-section as
   * [lateral, height] points (lateral + = right of travel). `flip` turns the faces.
   */
  _extrude(ids, profile, flip = false) {
    const tr = this.track;
    const pos = [];
    const idx = [];
    let m = 0;
    for (let r = 0; r < ids.length; r++) {
      const k = ids[r];
      const rx = -tr.tz[k];
      const rz = tr.tx[k];
      const P = profile(k);
      m = P.length;
      for (const [lat, y] of P) pos.push(tr.x[k] + rx * lat, y, tr.z[k] + rz * lat);
    }
    for (let r = 0; r + 1 < ids.length; r++) {
      for (let c = 0; c + 1 < m; c++) {
        const a = r * m + c;
        const b = a + 1;
        const d = a + m;
        const e = d + 1;
        if (flip) idx.push(a, d, b, b, d, e);
        else idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  }
}
