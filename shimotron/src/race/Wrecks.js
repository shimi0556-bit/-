import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';

/**
 * Wrecks on the sea floor, each a small reef of its own: a steel
 * freighter broken in two, the stern rolled onto its side; an old wooden
 * sailing ship, its ribs showing, masts down and cannons strewn round it;
 * and a sunken aircraft. Rust-streaked and crusted with growth, hung with
 * corals, sponges and sea fans, solid for submarines, and fish make their
 * home round them.
 */

/** Non-indexed, with a vertex colour and aWear (0 painted steel/wood … 1 all rust/growth). */
function part(g, color, wear = 0.5) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aWear', new THREE.BufferAttribute(new Float32Array(n).fill(wear), 1));
  return g;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/**
 * A ship's hull (length L along z, beam B, depth D), lofted from U-shaped
 * sections with a raked bow and rounded stern, open at the top; `from`/`to`
 * (0..1 along its length) cut out a piece, the cut edge torn ragged.
 */
function hull(L, B, D, from, to, rng) {
  const around = 18;
  const rows = 26;
  const pos = [];
  const idx = [];
  const section = (u) => {
    // Beam along the length: fine bow, full middle, rounded stern.
    const bow = Math.min(1, (1 - u) / 0.22);
    const stern = Math.min(1, u / 0.12);
    const half = (B / 2) * Math.sqrt(Math.max(0.02, bow)) * (0.75 + 0.25 * Math.sqrt(stern));
    return half;
  };
  for (let r = 0; r <= rows; r++) {
    const u = from + ((to - from) * r) / rows;
    const half = section(u);
    const z = (u - 0.5) * L;
    const rake = u > 0.8 ? (u - 0.8) * 0.9 : 0; // bow rakes forward at the top
    for (let k = 0; k <= around; k++) {
      // From the port deck edge down round the bilge to the starboard deck edge.
      const a = (k / around) * Math.PI;
      const x = -Math.cos(a) * half;
      const y = D - Math.sin(a) * D * (0.55 + 0.45 * Math.min(1, half / (B / 2)));
      let zz = z + rake * (y / D) * L * 0.08;
      // Torn edges where the ship broke.
      if ((r === 0 && from > 0.01) || (r === rows && to < 0.99)) zz += (rng.random() - 0.5) * 1.6;
      pos.push(x, Math.max(0, y), zz);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < around; k++) {
      const a = r * (around + 1) + k;
      idx.push(a, a + around + 1, a + 1, a + 1, a + around + 1, a + around + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, half: section };
}

/** A steel freighter's piece: hull shell, deck with hatches, and (stern piece) its bridge house, funnel and masts. */
function freighterPiece(L, B, D, from, to, rng, withHouse) {
  const H = hull(L, B, D, from, to, rng);
  const parts = [part(H.geo, 0x3a2f2a, 0.8)];
  // Deck plates with the odd hole rusted through.
  for (let u = from + 0.02; u < to - 0.02; u += 0.04) {
    if (rng.random() < 0.18) continue;
    const half = H.half(u) * 0.97;
    parts.push(part(box(half * 2, 0.15, L * 0.04, 0, D - 0.1, (u - 0.5) * L + L * 0.02), 0x4a4038, 0.6));
  }
  // Cargo hatches, lids askew or gone.
  for (let u = Math.max(from, 0.25); u < Math.min(to, 0.78); u += 0.13) {
    const z = (u - 0.5) * L;
    parts.push(part(box(B * 0.5, 0.9, L * 0.07, 0, D + 0.4, z), 0x58483a, 0.7));
    if (rng.random() < 0.5) parts.push(part(box(B * 0.46, 0.15, L * 0.065, rng.range(-0.8, 0.8), D + 0.95, z + rng.range(-0.8, 0.8)).rotateZ(rng.range(-0.3, 0.3)), 0x6a5a48, 0.6));
  }
  if (withHouse) {
    const z = (Math.max(from, 0.06) + 0.08 - 0.5) * L;
    // Bridge house: three decks, window bands, bridge wings.
    for (let k = 0; k < 3; k++) {
      parts.push(part(box(B * (0.8 - k * 0.08), 2.4, L * 0.1, 0, D + 1.2 + k * 2.4, z), 0xb8b0a0, 0.45));
      parts.push(part(box(B * (0.81 - k * 0.08), 0.7, L * 0.101, 0, D + 1.5 + k * 2.4, z), 0x151515, 0.3));
    }
    parts.push(part(box(B * 1.05, 0.2, 1.4, 0, D + 7.3, z + L * 0.04), 0xa8a090, 0.5));
    // Funnel.
    const f = new THREE.CylinderGeometry(1.1, 1.3, 4.5, 16).translate(0, D + 9.2, z - L * 0.03);
    parts.push(part(f, 0x2a2a2a, 0.7));
    parts.push(part(new THREE.CylinderGeometry(1.15, 1.15, 0.8, 16).translate(0, D + 10.8, z - L * 0.03), 0x9a3020, 0.5));
    // Mast (standing) and a derrick boom.
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.3, 11, 8).translate(0, D + 5.5, z + L * 0.12), 0x4a3a30, 0.7));
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.18, 9, 6).rotateZ(1.1).translate(2.5, D + 4, z + L * 0.12), 0x4a3a30, 0.7));
  } else {
    // Foremast, snapped and lying across the deck.
    const z = (Math.min(to, 0.95) - 0.12 - 0.5) * L;
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.3, 12, 8).rotateZ(1.35).rotateY(0.4).translate(1.5, D + 1.2, z), 0x4a3a30, 0.7));
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.35, 3, 8).translate(0, D + 1.5, z + 1.5), 0x4a3a30, 0.7));
  }
  // Rails along the deck edge (broken in places).
  for (let u = from + 0.01; u < to - 0.02; u += 0.02) {
    if (rng.random() < 0.3) continue;
    const half = H.half(u);
    for (const s of [1, -1]) parts.push(part(box(0.06, 1, 0.06, s * half, D + 0.5, (u - 0.5) * L), 0x3a3028, 0.8));
  }
  return mergeGeometries(parts);
}

/** An old wooden ship: keel, the ribs standing clear, some planking left, masts down, cannons about. */
function galleon(rng) {
  const L = 30;
  const B = 8;
  const D = 5;
  const parts = [];
  parts.push(part(box(0.5, 0.6, L * 0.95, 0, 0.3, 0), 0x3a2a1a, 0.6));
  // Ribs: curved frames every metre, taller near the middle, broken off at random heights.
  for (let k = 0; k < 26; k++) {
    const u = k / 25;
    const z = (u - 0.5) * L * 0.9;
    const half = (B / 2) * Math.sin(Math.PI * (0.08 + u * 0.84)) ** 0.6;
    for (const s of [1, -1]) {
      const top = rng.range(0.4, 1) * D;
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.2) {
        const a = t * Math.PI * 0.5;
        const y = (1 - Math.cos(a)) * D;
        if (y > top) break;
        pts.push(new THREE.Vector3(s * Math.sin(a) * half, 0.3 + y, z));
      }
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts);
      parts.push(part(new THREE.TubeGeometry(curve, 6, 0.16, 5, false), 0x4a3522, 0.7));
    }
  }
  // Planking on the lower part of one side.
  const plank = new THREE.BufferGeometry();
  const pos = [];
  for (let k = 0; k < 24; k++) {
    const u0 = k / 24;
    const u1 = (k + 1) / 24;
    if (rng.random() < 0.25) continue;
    for (let j = 0; j < 3; j++) {
      if (rng.random() < 0.2) continue;
      const a0 = (j / 5) * Math.PI * 0.5;
      const a1 = ((j + 1) / 5) * Math.PI * 0.5;
      const pt = (u, a) => {
        const half = (B / 2) * Math.sin(Math.PI * (0.08 + u * 0.84)) ** 0.6;
        return [Math.sin(a) * half + 0.05, 0.3 + (1 - Math.cos(a)) * D, (u - 0.5) * L * 0.9];
      };
      const A = pt(u0, a0);
      const Bq = pt(u1, a0);
      const C = pt(u1, a1);
      const Dq = pt(u0, a1);
      pos.push(...A, ...Bq, ...C, ...A, ...C, ...Dq);
    }
  }
  plank.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  plank.computeVertexNormals();
  parts.push(part(plank, 0x5a4028, 0.6));
  // Masts lying across the wreck and the sand.
  for (const [z, len, yaw] of [
    [-3, 16, 0.5],
    [5, 13, -0.7],
  ]) parts.push(part(new THREE.CylinderGeometry(0.28, 0.38, len, 8).rotateZ(Math.PI / 2).rotateY(yaw).translate(0, 0.5, z), 0x4a3522, 0.7));
  // Cannons and an anchor.
  for (let k = 0; k < 7; k++) {
    const g = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 10).rotateZ(Math.PI / 2).rotateY(rng.range(0, 6.28));
    parts.push(part(g.translate(rng.range(-6, 6), 0.25, rng.range(-12, 12)), 0x2a2a28, 0.9));
  }
  parts.push(part(new THREE.TorusGeometry(1.1, 0.12, 6, 12, Math.PI).rotateX(Math.PI / 2).translate(6, 0.2, 14), 0x2a2a28, 0.9));
  parts.push(part(box(0.2, 0.2, 2.4, 6, 0.2, 15), 0x2a2a28, 0.9));
  return mergeGeometries(parts);
}

/** A sunken aircraft (a four-engined airliner's worth of a small one): fuselage, wings, tail, propellers. */
function aircraft(rng) {
  const parts = [];
  const prof = [[0.05, 0], [0.9, 1.5], [1.2, 4], [1.2, 12], [0.9, 16], [0.3, 19]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 18).rotateX(Math.PI / 2).translate(0, 1.3, -8);
  parts.push(part(fus, 0x9aa0a4, 0.5));
  // Cockpit windows band.
  parts.push(part(new THREE.CylinderGeometry(0.95, 1.05, 1, 18, 1, true).rotateX(Math.PI / 2).translate(0, 1.5, 8.6), 0x151a1e, 0.2));
  for (const s of [1, -1]) {
    const w = box(9, 0.3, 2.4, s * 5.2, 0.9, 2);
    w.rotateZ(s * 0.05);
    parts.push(part(w, 0x9aa0a4, 0.55));
    // Engine and a bent propeller.
    parts.push(part(new THREE.CylinderGeometry(0.45, 0.5, 2, 12).rotateX(Math.PI / 2).translate(s * 3.4, 0.9, 3.4), 0x6a6e70, 0.6));
    for (let b = 0; b < 3; b++) parts.push(part(box(0.18, 1.3, 0.05, 0, 0.6, 0).rotateZ((b / 3) * Math.PI * 2 + rng.range(-0.2, 0.2)).rotateX(rng.range(-0.4, 0.4)).translate(s * 3.4, 0.9, 4.45), 0x3a3a3a, 0.7));
  }
  parts.push(part(box(5, 0.2, 1.4, 0, 1.6, -9.5), 0x9aa0a4, 0.55));
  parts.push(part(box(0.2, 2.4, 1.6, 0, 2.6, -9.6), 0x9aa0a4, 0.55));
  return mergeGeometries(parts);
}

/** Rust, streaks and marine growth over steel and wood (by aWear and object position). */
function wreckMaterial() {
  const m = new THREE.MeshStandardMaterial({ name: 'שברי ספינה', vertexColors: true, roughness: 0.9, metalness: 0.15, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWear; varying float vWear; varying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = aWear; vOP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vWear; varying vec3 vOP;
        float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float wN(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(wH(i), wH(i + vec3(1,0,0)), f.x), mix(wH(i + vec3(0,1,0)), wH(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(wH(i + vec3(0,0,1)), wH(i + vec3(1,0,1)), f.x), mix(wH(i + vec3(0,1,1)), wH(i + vec3(1,1,1)), f.x), f.y), f.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vOP;
          float n = wN(p * 0.6) * 0.6 + wN(p * 2.3) * 0.3 + wN(p * 9.0) * 0.1;
          // Rust: orange-brown blooms and dark streaks running down.
          float rust = smoothstep(0.35, 0.7, n + vWear * 0.35);
          float streak = smoothstep(0.55, 0.8, wN(vec3(p.x * 3.0, p.y * 0.25, p.z * 3.0)));
          vec3 c = mix(diffuseColor.rgb, vec3(0.42, 0.22, 0.12), rust * 0.85);
          c = mix(c, c * 0.45, streak * 0.6);
          // Growth: green-brown algae felt, pink coralline crusts, pale encrusting coral.
          float algae = smoothstep(0.45, 0.75, wN(p * 2.6 + 7.0) * 0.7 + wN(p * 11.0) * 0.3 + vWear * 0.15);
          float pinkC = smoothstep(0.72, 0.86, wN(p * 6.1 - 3.0));
          float crust = smoothstep(0.78, 0.9, wN(p * 9.0 + 11.0));
          c = mix(c, vec3(0.24, 0.27, 0.16), algae * 0.7);
          c = mix(c, vec3(0.55, 0.38, 0.4), pinkC * 0.3);
          c = mix(c, vec3(0.6, 0.57, 0.48), crust * 0.25);
          diffuseColor.rgb = c * (0.8 + 0.25 * wN(p * 31.0));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'wreck-1';
  return m;
}

export class Wrecks {
  constructor(engine, life) {
    this.engine = engine;
    this.life = life;
    this.terrain = life.terrain;
    this.rng = new Random(life.stage.seed * 131 + 17);
    this.group = new THREE.Group();
    this.group.name = 'ספינות טרופות';
    this.spots = [];
  }

  /** A flat patch of sea floor between `min` and `max` metres down, away from other wrecks. */
  _site(min, max) {
    const t = this.terrain;
    const half = t.size / 2 - 60;
    const n = new THREE.Vector3();
    for (let k = 0; k < 3000; k++) {
      const x = this.rng.range(-half, half);
      const z = this.rng.range(-half, half);
      const h = t.heightAt(x, z);
      if (-h < min || -h > max) continue;
      if (t.normalAt(x, z, n).y < 0.96) continue;
      if (this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 180)) continue;
      return { x, z, h };
    }
    return null;
  }

  build() {
    const mat = wreckMaterial();
    const kinds = ['freighter', 'galleon', 'aircraft'];
    const count = this.life.cfg.wrecks ?? 3;
    const growth = [];
    const col = this.life.island.colliders;
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length];
      const s = this._site(kind === 'aircraft' ? 10 : 16, kind === 'freighter' ? 40 : 30);
      if (!s) continue;
      const yaw = this.rng.range(0, Math.PI * 2);
      const t = this.terrain;
      const place = (geo, dx, dz, lift, roll, extraYaw = 0, sink = 0.6) => {
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        const x = s.x + dx * c + dz * sn;
        const z = s.z - dx * sn + dz * c;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, t.heightAt(x, z) - sink + lift, z);
        mesh.rotation.set(0, yaw + extraYaw, roll, 'YXZ');
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'ספינה טרופה';
        mesh.userData.noPick = true;
        this.group.add(mesh);
        return mesh;
      };
      const boxes = [];
      if (kind === 'freighter') {
        const L = 48;
        const B = 9;
        const D = 6;
        const bow = freighterPiece(L, B, D, 0.5, 1, this.rng, false);
        const stern = freighterPiece(L, B, D, 0, 0.47, this.rng, true);
        place(bow, 0, 2, 0, 0.1, 0.08, 0.6);
        place(stern, 5, -3, 4.2, 0.9, -0.2, 0.3);
        boxes.push([0, 12, 3, B * 0.55, 13], [3, -12, 3.5, 6, 12]);
        for (let k = 0; k < 18; k++) growth.push({ x: s.x + this.rng.range(-8, 8), z: s.z + this.rng.range(-22, 22), top: s.h + this.rng.range(1, 6) });
      } else if (kind === 'galleon') {
        place(galleon(this.rng), 0, 0, 0, 0.2, 0, 0.4);
        boxes.push([0, 0, 1.5, 4, 14]);
        for (let k = 0; k < 14; k++) growth.push({ x: s.x + this.rng.range(-5, 5), z: s.z + this.rng.range(-14, 14), top: s.h + this.rng.range(0.2, 2.5) });
      } else {
        place(aircraft(this.rng), 0, 0, 0, 0.08, 0, 0.5);
        boxes.push([0, 0, 1.3, 1.5, 10], [0, 2, 1, 10, 1.5]);
        for (let k = 0; k < 8; k++) growth.push({ x: s.x + this.rng.range(-6, 6), z: s.z + this.rng.range(-8, 8), top: s.h + this.rng.range(0.3, 2) });
      }
      // Solid for the submarines.
      if (col) {
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        for (const [dx, dz, hy, hx, hz] of boxes) col.box(s.x + dx * c + dz * sn, s.h + hy, s.z - dx * sn + dz * c, hx, hy + 1, hz, yaw, 'metal', { car: false });
      }
      this.spots.push({ x: s.x, z: s.z, h: s.h, kind });
    }
    // Growth on and round the wrecks: fans, sponges, soft corals, anemones, crinoids.
    const items = [];
    const G = { fan: 1.5, tubes: 1, soft: 1.2, anemone: 0.8, crinoid: 0.7, plate: 0.8, boulder: 0.5, barrel: 0.5, eel: 0.4, lobster: 0.3, vase: 0.4 };
    for (const g of growth) {
      let sum = 0;
      for (const k in G) sum += G[k];
      let r = this.rng.random() * sum;
      let kind = 'soft';
      for (const k in G) {
        r -= G[k];
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      const floor = this.terrain.heightAt(g.x, g.z);
      const it = this.life.coralItem(kind, g.x, Math.max(floor, Math.min(g.top, -1.5)), g.z, this.rng, 0.8);
      if (it) items.push(it);
    }
    if (items.length) this.group.add(this.life.coralSet(items, 60));
    return this.group;
  }
}
