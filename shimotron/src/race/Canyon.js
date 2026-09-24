import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Random } from '../engine/core/Random.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();

/**
 * Rock scenery for the canyon island, set around the gorges the track
 * carves: natural sandstone arches spanning the road, boulders piled at
 * the foot of the walls, hoodoo spires across the valley floor and a
 * plank-and-rope bridge slung between two rims.
 */
export class Canyon {
  constructor(engine, terrain, track, stage, materials, colliders = null) {
    this.engine = engine;
    this.colliders = colliders; // boulders, spires and arch feet are solid
    this.terrain = terrain;
    this.track = track;
    this.stage = stage;
    this.materials = materials;
    this.rng = new Random(stage.seed * 13 + 7);
    this.noise = new SimplexNoise(new Random(stage.seed * 5 + 1));
    this.group = new THREE.Group();
    this.group.name = 'קניון';
    const T = materials.textures;
    // Red sandstone: the engine's triplanar rock, tinted.
    this.rock = new THREE.MeshStandardMaterial({ name: 'אבן חול', color: 0xd9906a, roughness: 0.93, metalness: 0 });
    materials.triplanar(this.rock, T.rock, T.rockNormal, 0.16, 1.2);
  }

  build() {
    const tr = this.track;
    const centres = tr.gorgeCentres || [];
    // Arches over the first and last gorges, the rope bridge over the middle one.
    centres.forEach((c, k) => {
      if (k === 1 && centres.length >= 3) this._ropeBridge(c);
      else this._arch(c + Math.round((k ? -1 : 1) * 40 / tr.ds));
    });
    this._boulders();
    this._hoodoos();
    return this.group;
  }

  /** Road frame at sample i: position, tangent, right, road height. */
  _frame(i) {
    const tr = this.track;
    const n = tr.n;
    i = ((i % n) + n) % n;
    return { i, x: tr.x[i], z: tr.z[i], tx: tr.tx[i], tz: tr.tz[i], rx: -tr.tz[i], rz: tr.tx[i], h: tr.h[i] };
  }

  /** Displaces a geometry's vertices along their normals by fractal noise (rough rock). */
  _roughen(g, amp, freq, seed = 0) {
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const N = this.noise;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d = N.noise3d(x * freq + seed, y * freq, z * freq) * amp + N.noise3d(x * freq * 2.7, y * freq * 2.7 + seed, z * freq * 2.7) * amp * 0.35;
      pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
    }
    g.computeVertexNormals();
    return g;
  }

  /**
   * A natural sandstone arch from rim to rim over the road: a wide, flat
   * band of rock (deep along the road, shallow in height), thick at the
   * feet and thinning to a lintel over the cars, then weathered with noise.
   */
  _arch(i) {
    const f = this._frame(i);
    const t = this.terrain;
    const W = this.track.W;
    const span = W + 19;
    const apex = f.h + 20;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const lat = (u * 2 - 1) * span;
      const gx = f.x + f.rx * lat;
      const gz = f.z + f.rz * lat;
      const ground = t.heightAt(gx, gz);
      const arc = Math.sin(u * Math.PI);
      pts.push(new THREE.Vector3(gx, THREE.MathUtils.lerp(ground - 4, apex, Math.pow(arc, 0.5)), gz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const A = new THREE.Vector3(f.tx, 0, f.tz); // depth axis, along the road
    const rings = 72;
    const sides = 28;
    const pos = [];
    const idx = [];
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let r = 0; r <= rings; r++) {
      const u = r / rings;
      curve.getPointAt(u, c);
      curve.getTangentAt(u, T);
      N.crossVectors(A, T).normalize(); // continuous along the curve, so rings never flip
      const feet = 1 - Math.sin(u * Math.PI);
      const depth = 4.8 + feet * 4.5; // half depth
      const thick = 2.3 + feet * 3.2; // half thickness
      for (let k = 0; k <= sides; k++) {
        const th = (k / sides) * Math.PI * 2;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        // Superellipse: flat top and bottom, rounded edges.
        const ex = Math.sign(cs) * Math.pow(Math.abs(cs), 0.55) * depth;
        const ey = Math.sign(sn) * Math.pow(Math.abs(sn), 0.7) * thick;
        pos.push(c.x + A.x * ex + N.x * ey, c.y + A.y * ex + N.y * ey, c.z + A.z * ex + N.z * ey);
      }
    }
    const row = sides + 1;
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < sides; k++) {
        const a0 = r * row + k;
        idx.push(a0, a0 + row, a0 + 1, a0 + 1, a0 + row, a0 + row + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this._roughen(g, 1.1, 0.07, i * 0.13);
    this._roughen(g, 0.35, 0.3, i * 0.29);
    const mesh = new THREE.Mesh(g, this.rock);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'קשת סלע';
    this.group.add(mesh);
    this._archFeet = this._archFeet || [];
    this._archFeet.push(pts[1], pts[pts.length - 2]);
    // The feet are solid rock.
    if (this.colliders) {
      for (const q of [pts[0], pts[pts.length - 1]]) {
        const gy = t.heightAt(q.x, q.z);
        this.colliders.box(q.x, gy + 5, q.z, 5, 9, 9, Math.atan2(f.tx, f.tz));
      }
    }
  }

  /** Plank-and-rope bridge slung between the rims of a gorge. */
  _ropeBridge(i) {
    const f = this._frame(i);
    const t = this.terrain;
    const W = this.track.W;
    const span = W + 18;
    const a = new THREE.Vector3(f.x - f.rx * span, 0, f.z - f.rz * span);
    const b = new THREE.Vector3(f.x + f.rx * span, 0, f.z + f.rz * span);
    a.y = t.heightAt(a.x, a.z) + 0.3;
    b.y = t.heightAt(b.x, b.z) + 0.3;
    const deckMin = f.h + 12; // never low enough to meet a car
    const top = Math.max(deckMin + 4, Math.min(a.y, b.y));
    a.y = Math.max(a.y, top);
    b.y = Math.max(b.y, top);
    const sag = 3.2;
    const at = (u, lift = 0, side = 0) => {
      const p = a.clone().lerp(b, u);
      p.y += -sag * 4 * u * (1 - u) + lift;
      p.x += f.tx * side;
      p.z += f.tz * side;
      return p;
    };
    const wood = this.materials.lib.wood;
    const planks = [];
    const len = a.distanceTo(b);
    const count = Math.round(len / 0.55);
    const yaw = Math.atan2(f.tx, f.tz);
    for (let k = 1; k < count; k++) {
      const u = k / count;
      const p = at(u);
      const p2 = at(Math.min(1, u + 0.01));
      const pitch = Math.atan2(p2.y - p.y, p.distanceTo(p2));
      _q.setFromEuler(_e.set(0, yaw, 0));
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(f.tx, 0, f.tz), -pitch);
      _q.premultiply(tilt);
      _m.compose(p, _q, _s.set(0.4, 0.07, 2.2 + (k % 3) * 0.08)); // long side across the deck
      planks.push(_m.clone());
    }
    const plankGeo = new THREE.BoxGeometry(1, 1, 1);
    const pm = new THREE.InstancedMesh(plankGeo, wood, planks.length);
    planks.forEach((m, k) => pm.setMatrixAt(k, m));
    pm.castShadow = true;
    pm.receiveShadow = true;
    pm.name = 'גשר חבלים';
    this.group.add(pm);
    // Hand ropes, deck ropes and the hangers between them.
    const rope = new THREE.MeshStandardMaterial({ name: 'חבל', color: 0x8a6a45, roughness: 0.95 });
    const ropes = [];
    for (const side of [-1.15, 1.15]) {
      for (const lift of [0, 1.05]) {
        const pts = [];
        for (let k = 0; k <= 24; k++) pts.push(at(k / 24, lift - (lift ? 0.25 * Math.sin((k / 24) * Math.PI) : 0), side));
        ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.045, 5, false));
      }
      for (let k = 1; k < 18; k++) {
        const u = k / 18;
        const lo = at(u, 0, side);
        const hi = at(u, 1.05 - 0.25 * Math.sin(u * Math.PI), side);
        const c = new THREE.CylinderGeometry(0.02, 0.02, hi.distanceTo(lo), 4);
        c.translate(0, hi.distanceTo(lo) / 2, 0);
        c.applyMatrix4(new THREE.Matrix4().makeTranslation(lo.x, lo.y, lo.z));
        ropes.push(c);
      }
    }
    // Posts on each rim.
    const posts = [];
    for (const end of [a, b]) {
      for (const side of [-1.15, 1.15]) {
        const c = new THREE.CylinderGeometry(0.12, 0.15, 2.4, 6);
        c.translate(end.x + f.tx * side, end.y + 0.6, end.z + f.tz * side);
        posts.push(c);
      }
    }
    const rm = new THREE.Mesh(mergeGeometries(ropes.map((g) => (g.index ? g.toNonIndexed() : g))), rope);
    rm.castShadow = true;
    this.group.add(rm);
    const po = new THREE.Mesh(mergeGeometries(posts), wood);
    po.castShadow = true;
    this.group.add(po);
  }

  /** Boulders: piled at the foot of every gorge wall and strewn over the valley. */
  _boulders() {
    const tr = this.track;
    const t = this.terrain;
    const rng = this.rng;
    const W = tr.W;
    const variants = [0, 1, 2, 3].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      this._roughen(g, 0.3, 0.9, k * 7.3);
      g.scale(1, 0.72 + k * 0.06, 1);
      return g;
    });
    const lists = variants.map(() => []);
    const put = (x, z, s, sink = 0.3) => {
      const y = t.heightAt(x, z); // the baked grid the ground mesh is drawn from
      _q.setFromEuler(_e.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3)));
      _m.compose(_p.set(x, y - s * sink, z), _q, _s.set(s * rng.range(0.8, 1.3), s, s * rng.range(0.8, 1.3)));
      lists[Math.floor(rng.random() * lists.length)].push({ m: _m.clone(), c: new THREE.Color().setHSL(0.045 + rng.range(-0.015, 0.02), rng.range(0.35, 0.55), rng.range(0.42, 0.6)) });
      if (this.colliders && s > 0.7) this.colliders.sphere(x, y - s * sink + s * 0.05, z, s * 0.82);
    };
    // Along the gorges, just past the barriers, both sides.
    if (tr.gorge) {
      for (let i = 0; i < tr.n; i += 3) {
        const g = tr.gorge[i];
        if (g < 0.4 || rng.random() > 0.55) continue;
        const side = rng.random() < 0.5 ? -1 : 1;
        const lat = side * (W + rng.range(8.2, 10.8));
        const f = this._frame(i);
        put(f.x + f.rx * lat, f.z + f.rz * lat, rng.range(0.9, 2.6) * (0.6 + g * 0.5));
        if (rng.random() < 0.3) put(f.x + f.rx * (lat + side * 2.5), f.z + f.rz * (lat + side * 2.5), rng.range(2.2, 4.2), 0.45);
      }
    }
    // Rubble around the arch feet.
    for (const p of this._archFeet || []) for (let k = 0; k < 7; k++) put(p.x + rng.range(-7, 7), p.z + rng.range(-7, 7), rng.range(1.5, 4), 0.45);
    // Scattered over the valley, clear of the road.
    const half = this.stage.island.radius;
    let guard = 0;
    let placed = 0;
    while (placed < 160 && guard++ < 6000) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const clear = tr.clearance(x, z);
      if (clear < 9.5) continue;
      const h = t.heightAt(x, z);
      if (h < 2) continue;
      put(x, z, rng.range(1.2, clear > 25 ? 7 : 3.2));
      placed++;
    }
    variants.forEach((g, k) => {
      const list = lists[k];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(g, this.rock, list.length);
      list.forEach((it, j) => {
        mesh.setMatrixAt(j, it.m);
        mesh.setColorAt(j, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'סלעים';
      this.group.add(mesh);
    });
  }

  /** Hoodoos: eroded spires with a harder cap rock, across the open valley. */
  _hoodoos() {
    const tr = this.track;
    const t = this.terrain;
    const rng = this.rng;
    const variants = [0, 1, 2].map((k) => {
      const parts = [];
      const H = 1;
      // Tapering, wavy column in drums.
      const col = new THREE.CylinderGeometry(0.14, 0.26, H, 12, 10);
      col.translate(0, H / 2, 0);
      const pos = col.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        const w = 1 + Math.sin(y * (14 + k * 3)) * 0.14 + Math.sin(y * 31 + k) * 0.05;
        pos.setXYZ(v, pos.getX(v) * w, y, pos.getZ(v) * w);
      }
      col.computeVertexNormals();
      parts.push(col.toNonIndexed());
      const cap = new THREE.IcosahedronGeometry(0.2, 2);
      cap.scale(1.3, 0.5, 1.2);
      cap.translate(0.02 * k, H + 0.05, 0);
      parts.push(cap.toNonIndexed());
      return mergeGeometries(parts);
    });
    const lists = variants.map(() => []);
    const half = this.stage.island.radius;
    let guard = 0;
    let placed = 0;
    while (placed < 55 && guard++ < 8000) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const clear = tr.clearance(x, z);
      if (clear < 22) continue;
      const h = t.heightAt(x, z);
      if (h < 3 || h > 40) continue;
      if (t.normalAt(x, z, _n).y < 0.9) continue;
      const H = rng.range(10, 26) * (clear > 60 ? 1.2 : 0.8);
      // Spires stand in little families.
      const family = 1 + Math.floor(rng.random() * 3);
      for (let k = 0; k < family; k++) {
        const ox = x + rng.range(-9, 9) * (k ? 1 : 0);
        const oz = z + rng.range(-9, 9) * (k ? 1 : 0);
        const hh = H * (k ? rng.range(0.45, 0.8) : 1);
        _q.setFromEuler(_e.set(rng.range(-0.04, 0.04), rng.range(0, 6.28), rng.range(-0.04, 0.04)));
        _m.compose(_p.set(ox, t.heightAt(ox, oz) - 0.5, oz), _q, _s.set(hh * 0.55, hh, hh * 0.55));
        if (this.colliders) this.colliders.post(ox, t.heightAt(ox, oz) - 0.5, oz, hh * 0.55 * 0.22, hh * 0.95);
        lists[Math.floor(rng.random() * lists.length)].push({ m: _m.clone(), c: new THREE.Color().setHSL(0.04 + rng.range(-0.01, 0.02), 0.5, rng.range(0.45, 0.58)) });
      }
      placed++;
    }
    variants.forEach((g, k) => {
      const list = lists[k];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(g, this.rock, list.length);
      list.forEach((it, j) => {
        mesh.setMatrixAt(j, it.m);
        mesh.setColorAt(j, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'עמודי סלע';
      this.group.add(mesh);
    });
  }
}
