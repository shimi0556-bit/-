import * as THREE from 'three';
import { Random } from '../engine/core/Random.js';
import { fishGeometry } from './Sealife.js';
import { humpbackGeometry, hammerheadGeometry, giantMaterial, instanced } from './Megafauna.js';
import fishGz from './models/fish.glb.gz?url';

/**
 * The life round the glass sea tunnels (stage.life.tunnels): what a driver
 * sees through the glass. Along every tube a humpback cruises a long loop,
 * down one side, up and over the glass at the end, and back along the
 * other; a school of hammerheads and a few big sharks circle the tube,
 * passing over the roof; and shoals of real barramundi (a downloaded,
 * scanned-quality model: "Barramundi Fish", Microsoft, CC0) drift beside
 * the glass, tails beating. Nothing swims through the tube: below the roof
 * everything keeps a few metres clear of the glass.
 */
let FISH = null;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Loads the real fish (parse: a function that turns the inlined, gzipped GLB into a glTF). */
export async function loadFish(parse) {
  try {
    const gltf = await parse(fishGz);
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !mesh) mesh = o;
    });
    if (!mesh) throw new Error('no fish mesh');
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    // Head to +z (the game's forward), centred, one metre long.
    geo.rotateY(Math.PI);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
    geo.scale(1 / (b.max.z - b.min.z), 1 / (b.max.z - b.min.z), 1 / (b.max.z - b.min.z));
    FISH = { geo, material: mesh.material };
  } catch (e) {
    console.warn('the real fish did not load; the tunnels keep their sharks and whales', e);
  }
}

/** The real fish's material, its tail beating (more toward the tail, +z is the head). */
function fishMaterial(src, uniforms) {
  const m = src.clone();
  m.side = THREE.DoubleSide;
  // Silvery scales catch the light that filters down: a little of their own colour keeps them from going black in the blue.
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveMap = m.map;
  m.emissiveIntensity = 0.35;
  m.metalness = 0.35;
  m.roughness = 0.35;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float iPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tailK = smoothstep(0.15, -0.5, transformed.z);
        transformed.x += sin(uTime * 7.0 + iPhase - transformed.z * 7.0) * 0.07 * tailK;`,
      );
  };
  m.customProgramCacheKey = () => 'tunnel-barramundi';
  return m;
}

export class TunnelLife {
  constructor(engine, life) {
    this.engine = engine;
    this.life = life;
    this.track = life.track;
    this.terrain = life.terrain;
    this.rng = new Random(life.stage.seed * 131 + 7);
    this.group = new THREE.Group();
    this.group.name = 'חיים ליד המנהרות';
    this.time = 0;
  }

  /** Point beside sample i: lateral `lat` metres from the centre line, at height y. */
  _at(i, lat, out) {
    const tr = this.track;
    i = ((Math.round(i) % tr.n) + tr.n) % tr.n;
    out.x = tr.x[i] - tr.tz[i] * lat;
    out.z = tr.z[i] + tr.tx[i] * lat;
    out.h = tr.h[i];
    return out;
  }

  build() {
    const tr = this.track;
    const U = this.life.uniforms;
    const rng = this.rng;
    const tubes = (tr.tunnels || []).map((T) => {
      // The deep stretch under glass (the roof well under the surface), where there is room above it.
      const deep = (i) => tr.tube[i % tr.n] && tr.h[i % tr.n] < -12.4;
      let a = T.t0;
      let b = T.t1;
      while (a < b && !deep(a)) a++;
      while (b > a && !deep(b)) b--;
      return { a, b };
    }).filter((T) => T.b - T.a > 40);
    this.tubes = tubes;
    const top = tr.crown;
    const clear = tr.W + 6; // below the roof, keep this far from the centre line
    // Whales: one per tube, a long loop round it.
    const whaleMesh = instanced(humpbackGeometry(), giantMaterial(U, 'whale'), Math.max(1, tubes.length), 'לווייתנים ליד המנהרות');
    this.group.add(whaleMesh);
    this.whales = tubes.map((T, k) => ({ T, mesh: whaleMesh, slot: k, len: rng.range(13, 16), s: rng.random(), off: rng.range(24, 30), speed: 2.6 }));
    // Sharks: hammerheads in a school and big lone sharks, circling the tube.
    const fishMat = this.life._fishMaterial('swim');
    const hGeo = hammerheadGeometry();
    const sGeo = fishGeometry('shark');
    this.schools = [];
    const school = (geo, n, color, name, size, spread) => {
      const g = geo.clone();
      g.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(8), 1));
      const mesh = new THREE.InstancedMesh(g, fishMat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = name;
      mesh.userData.noPick = true;
      for (let j = 0; j < n; j++) mesh.setColorAt(j, _c.set(color).offsetHSL(0, 0, rng.range(-0.05, 0.05)));
      this.group.add(mesh);
      return { mesh, fish: Array.from({ length: n }, () => ({ ox: rng.range(-spread, spread), oy: rng.range(-1.5, 1.5), oz: rng.range(-spread * 1.4, spread * 1.4), ph: rng.range(0, 6.28), s: size * rng.range(0.85, 1.15) })) };
    };
    for (const T of tubes) {
      const len = T.b - T.a;
      // Hammerheads: an oval round a point on the tube, crossing over the roof.
      const H = school(hGeo, Math.round(rng.range(8, 12)), 0x8a94a0, 'פטישנים ליד המנהרה', 3, 4);
      this.schools.push({ ...H, T, c: T.a + len * rng.range(0.25, 0.45), rx: 26, ry: 34, a: rng.range(0, 6.28), dir: rng.random() < 0.5 ? 1 : -1, speed: 2.2, y: top + 4 });
      // Big sharks: grey reef and tiger sharks, each on a wide loop of its own.
      const B = school(sGeo, 3, 0x6f7a80, 'כרישים ליד המנהרה', 4, 10);
      this.schools.push({ ...B, T, c: T.a + len * rng.range(0.55, 0.75), rx: 22, ry: 40, a: rng.range(0, 6.28), dir: rng.random() < 0.5 ? 1 : -1, speed: 3, y: top + 3 });
    }
    // Shoals of the real fish beside the glass.
    this.shoals = [];
    if (FISH) {
      const mat = fishMaterial(FISH.material, U);
      for (const T of tubes) {
        const len = T.b - T.a;
        for (let k = 0; k < 4; k++) {
          const n = Math.round(rng.range(22, 34));
          const mesh = instanced(FISH.geo, mat, n, 'דגי ברמונדי');
          mesh.castShadow = false;
          this.group.add(mesh);
          const side = k % 2 ? 1 : -1;
          this.shoals.push({
            mesh,
            T,
            i: T.a + len * ((k + rng.random()) / 4),
            side,
            lat: side * rng.range(clear + 1.5, clear + 7),
            dir: rng.random() < 0.5 ? 1 : -1,
            speed: rng.range(0.6, 1.1),
            y: rng.range(2.5, top - 1),
            fish: Array.from({ length: n }, () => ({ ox: rng.range(-2.2, 2.2), oy: rng.range(-1.4, 1.4), oz: rng.range(-4, 4), ph: rng.range(0, 6.28), s: rng.range(0.75, 1.15) })),
          });
        }
      }
    }
    return this.group;
  }

  _put(mesh, slot, x, y, z, yaw, pitch, roll, size) {
    _q.setFromEuler(_e.set(-pitch, yaw, roll, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, _s.set(size, size, size));
    mesh.setMatrixAt(slot, _m);
  }

  update(dt) {
    if (!this.tubes || !this.tubes.length) return;
    this.time += dt;
    const tr = this.track;
    const t = this.terrain;
    const top = tr.crown;
    const P = {};
    const Q = {};
    // Whales: s runs round the loop; along = ends of the tube, lateral = ±off (0 at the ends, over the roof).
    for (const w of this.whales) {
      const { a, b } = w.T;
      const span = (b - a) * tr.ds;
      w.s = (w.s + (w.speed * dt) / (2 * span + Math.PI * w.off)) % 1;
      const ang = w.s * Math.PI * 2;
      const pos = (sv) => {
        const ga = sv * Math.PI * 2;
        const i = a + 12 + (b - a - 24) * (0.5 - 0.5 * Math.cos(ga));
        const lat = w.off * Math.sin(ga);
        this._at(i, lat, P);
        const floor = t.heightAt(P.x, P.z);
        // Over the roof near the ends, otherwise mid-water beside the tube.
        const over = 1 - Math.min(1, Math.abs(lat) / (tr.W + 10));
        const y = Math.min(-w.len * 0.16, Math.max(floor + w.len * 0.22, P.h + 3 + over * (top + 2.5)));
        return [P.x, y, P.z];
      };
      const [x, y, z] = pos(w.s);
      const [x2, y2, z2] = pos(w.s + 0.002);
      const yaw = Math.atan2(x2 - x, z2 - z);
      const pitch = Math.atan2(y2 - y, Math.hypot(x2 - x, z2 - z)) * 0.8;
      this._put(w.mesh, w.slot, x, y, z, yaw, pitch, Math.sin(this.time * 0.3 + ang) * 0.05, w.len);
    }
    if (this.whales.length) this.whales[0].mesh.instanceMatrix.needsUpdate = true;
    // Shark schools: an oval round the point c on the tube (rx across, ry along), above the roof.
    for (const S of this.schools) {
      S.a += (S.dir * S.speed * dt) / ((S.rx + S.ry) / 2);
      const along = S.c + (Math.sin(S.a) * S.ry) / tr.ds;
      const lat = Math.cos(S.a) * S.rx;
      this._at(along, lat, P);
      const along2 = S.c + (Math.sin(S.a + S.dir * 0.02) * S.ry) / tr.ds;
      this._at(along2, Math.cos(S.a + S.dir * 0.02) * S.rx, Q);
      const yaw = Math.atan2(Q.x - P.x, Q.z - P.z);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const floor = t.heightAt(P.x, P.z);
      const baseY = Math.min(-2.5, Math.max(floor + 2, P.h + S.y));
      S.fish.forEach((f, k) => {
        const wob = Math.sin(this.time * 0.7 + f.ph);
        const lx = f.ox + wob * 0.6;
        const x = P.x + lx * c + f.oz * s;
        const z = P.z - lx * s + f.oz * c;
        this._put(S.mesh, k, x, baseY + f.oy + Math.sin(this.time * 0.5 + f.ph) * 0.5, z, yaw + wob * 0.1, 0, 0, f.s);
      });
      S.mesh.instanceMatrix.needsUpdate = true;
    }
    // Shoals drift along beside the glass, turning back at the tube's ends.
    for (const S of this.shoals) {
      S.i += (S.dir * S.speed * dt) / tr.ds;
      if (S.i > S.T.b - 8) S.dir = -1;
      else if (S.i < S.T.a + 8) S.dir = 1;
      const lat = S.lat + Math.sin(this.time * 0.11 + S.i * 0.01) * 1.5;
      this._at(S.i, lat, P);
      this._at(S.i + S.dir, lat, Q);
      const yaw = Math.atan2(Q.x - P.x, Q.z - P.z);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const floor = t.heightAt(P.x, P.z);
      const y0 = Math.min(-1.8, Math.max(floor + 1.6, P.h + S.y));
      const ii = ((Math.round(S.i) % tr.n) + tr.n) % tr.n;
      const rx = -tr.tz[ii];
      const rz = tr.tx[ii];
      S.fish.forEach((f, k) => {
        const wob = Math.sin(this.time * 0.9 + f.ph);
        // Never toward the glass: the offset across is folded outward (rx, rz: the track's right).
        const ox = S.side * Math.abs(f.ox + wob * 0.5);
        const x = P.x + rx * ox + f.oz * s;
        const z = P.z + rz * ox + f.oz * c;
        this._put(S.mesh, k, x, y0 + f.oy + Math.sin(this.time * 0.6 + f.ph) * 0.3, z, yaw + wob * 0.15, 0, 0, f.s);
      });
      S.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
