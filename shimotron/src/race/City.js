import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random, smoothstep } from '../engine/core/Random.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A procedural city around the circuit: a street grid of blocks cut into
 * lots, each lot a building (towers downtown, mid-rise and low-rise
 * further out) drawn as instanced boxes with a facade shader that paints
 * floors, window bays, shop fronts and lit windows at dusk; rooftop plant
 * and blinking masts; sidewalks, street lamps, neon signs; traffic that
 * circles the blocks with head- and tail-lights; and a city soundscape.
 */
export class City {
  constructor(engine, terrain, track, stage, materials) {
    this.engine = engine;
    this.terrain = terrain;
    this.track = track;
    this.stage = stage;
    this.materials = materials;
    this.rng = new Random(stage.seed * 17 + 3);
    this.group = new THREE.Group();
    this.group.name = 'עיר';
    this.pitch = 62; // block + street
    this.block = 46;
    this.angle = 0.32;
    this.cars = [];
    this.time = 0;
    this.uniforms = { uLit: { value: 0 }, uGlow: { value: 1 }, uTime: { value: 0 } };
  }

  /** Grid → world. */
  _world(u, v, out = new THREE.Vector3()) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return out.set(u * c - v * s, 0, u * s + v * c);
  }

  /** World → grid (inverse of _world). */
  _grid(x, z) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return [x * c + z * s, -x * s + z * c];
  }

  /** Free space around (x, z): distance past the road edge, or Infinity away from the track. */
  _clear(x, z) {
    const q = this.track.nearest(x, z, this._q || (this._q = {}));
    return q ? q.dist - this.track.W : Infinity;
  }

  /** Room a building needs: clear of the rails and trackside trees, and well clear of the grandstand. */
  _lotOk(x, z) {
    if (this.terrain.height(x, z) <= 1.8) return false;
    const c = this._clear(x, z);
    if (c < 16) return false;
    const st = this.start;
    if (c < 34 && Math.hypot(x - st.x, z - st.z) < 150) return false;
    return true;
  }

  /** True where scenery must not grow: inside blocks, on the streets and traffic lanes (the road-side strip stays free). */
  blocked(x, z) {
    if (!this.cells) return false;
    const [u, v] = this._grid(x, z);
    const i = Math.floor(u / this.pitch);
    const j = Math.floor(v / this.pitch);
    let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) if (this.cells.has(`${i + a},${j + b}`)) near = true;
    if (!near) return false;
    return this._clear(x, z) > 11;
  }

  build() {
    const t = this.terrain;
    const R = this.stage.island.radius;
    this.start = { x: this.track.x[0], z: this.track.z[0] };
    this.cells = new Set();
    const n = Math.ceil((R * 1.15) / this.pitch);
    const lots = [];
    const blocks = [];
    const B = this.block;
    const L = B / 2; // lot size (2 x 2 lots per block)
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const cu = (i + 0.5) * this.pitch;
        const cv = (j + 0.5) * this.pitch;
        const c = this._world(cu, cv);
        const d = Math.hypot(c.x, c.z);
        if (d > R * 1.1) continue;
        const h = t.height(c.x, c.z);
        if (h < 2) continue;
        let blockOk = 0;
        for (const [a, b] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
        ]) {
          const lu = cu + a * L;
          const lv = cv + b * L;
          const p = this._world(lu, lv);
          const corners = [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([x, y]) => this._world(lu + x * L * 0.5, lv + y * L * 0.5));
          const ok = [p, ...corners].every((q) => this._lotOk(q.x, q.z));
          if (!ok) continue;
          blockOk++;
          lots.push({ u: lu, v: lv, p, d, y: Math.min(...corners.map((q) => t.height(q.x, q.z))) });
        }
        if (blockOk) {
          blocks.push({ u: cu, v: cv, c, y: h, full: blockOk === 4 });
          this.cells.add(`${i},${j}`);
        }
      }
    }
    this.lots = lots;
    this.blocks = blocks;
    this._streets(blocks);
    this._buildings(lots, R);
    this._sidewalks(blocks);
    this._lamps(blocks);
    this._traffic(blocks);
    return this.group;
  }

  _buildings(lots, R) {
    const rng = this.rng;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const mat = this._facadeMaterial();
    const main = [];
    const tops = [];
    const plant = [];
    const masts = [];
    const neons = [];
    const palette = [0x8f949c, 0xb7b1a5, 0x6e7580, 0x9c7a64, 0x2f3d4c, 0x44576b, 0xc9c4b8, 0x5b6470, 0x8a5a48];
    const L = this.block / 2;
    for (const lot of lots) {
      if (rng.random() < 0.08) continue; // a small plaza now and then
      const down = 1 - smoothstep(0, R * 0.8, lot.d);
      const r = rng.random();
      let H = 9 + r * r * (18 + 150 * down * down) + rng.range(0, 8);
      if (rng.random() < 0.08 * down) H += 60; // landmark towers
      const w = L - rng.range(3, 6);
      const dd = L - rng.range(3, 6);
      const col = new THREE.Color(palette[Math.floor(rng.random() * palette.length)]);
      const style = H > 55 ? (rng.random() < 0.6 ? 2 : 1) : rng.random() < 0.5 ? 0 : 1; // 0 residential, 1 office, 2 glass tower
      main.push({ x: lot.p.x, y: lot.y - 0.2, z: lot.p.z, w, h: H, d: dd, col, style });
      if (H > 30 && rng.random() < 0.55) {
        // Setback tier.
        const k = rng.range(0.55, 0.8);
        const h2 = H * rng.range(0.15, 0.35);
        main.push({ x: lot.p.x, y: lot.y - 0.2 + H, z: lot.p.z, w: w * k, h: h2, d: dd * k, col, style, tier: true });
        H += h2;
      }
      // Roof plant and masts.
      const pn = 1 + Math.floor(rng.random() * 3);
      for (let k = 0; k < pn; k++) plant.push({ x: lot.p.x + rng.range(-w, w) * 0.25, y: lot.y + H - 0.2, z: lot.p.z + rng.range(-dd, dd) * 0.25, s: rng.range(2, 4.5), h: rng.range(1.5, 3) });
      if (H > 70) masts.push({ x: lot.p.x, y: lot.y + H, z: lot.p.z, h: rng.range(8, 22) });
      // Street-level neon on shorter buildings.
      if (H < 60 && rng.random() < 0.35) {
        const side = Math.floor(rng.random() * 4);
        const a = this.angle + (side * Math.PI) / 2;
        const off = side % 2 === 0 ? dd / 2 + 0.15 : w / 2 + 0.15;
        const nx = Math.sin(a);
        const nz = Math.cos(a);
        neons.push({ x: lot.p.x + nx * off, y: lot.y + rng.range(4.5, 8), z: lot.p.z + nz * off, yaw: a, w: rng.range(3, 7), col: new THREE.Color().setHSL(rng.pick([0.92, 0.55, 0.12, 0.8, 0.33]), 1, 0.55) });
      }
    }
    const inst = (geo, material, list, fill, name, cast = true) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((it, k) => {
        fill(it);
        mesh.setMatrixAt(k, _m);
        if (it.col) mesh.setColorAt(k, it.col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.name = name;
      mesh.userData.noPick = true;
      this.group.add(mesh);
      return mesh;
    };
    _q.setFromAxisAngle(UP, this.angle);
    // Style goes into the colour's alpha-free channel trick: encode it in a second attribute.
    const styles = new Float32Array(main.length);
    main.forEach((b, k) => (styles[k] = b.style));
    const bgeo = boxGeo.clone();
    bgeo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 1));
    inst(bgeo, mat, main, (b) => _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.w, b.h, b.d)), 'בניינים');
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.7, metalness: 0.4 });
    inst(boxGeo, plantMat, plant, (p) => _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.s, p.h, p.s * 0.7)), 'מערכות גג');
    const mastGeo = new THREE.CylinderGeometry(0.15, 0.3, 1, 6);
    mastGeo.translate(0, 0.5, 0);
    inst(mastGeo, this.materials.lib.iron, masts, (p) => _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, p.h, 1)), 'אנטנות');
    // Blinking red aviation lights on the masts.
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 1 });
    this.materials.trackEmissive(beaconMat, 2);
    this.beaconMat = beaconMat;
    inst(new THREE.SphereGeometry(0.35, 8, 6), beaconMat, masts, (p) => _m.compose(_p.set(p.x, p.y + p.h, p.z), _q, _s.set(1, 1, 1)), 'אורות אזהרה', false);
    // Neon signs: emissive tinted by the instance colour.
    const neonMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 });
    neonMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    neonMat.customProgramCacheKey = () => 'city-neon';
    this.materials.trackEmissive(neonMat, 0.6);
    this.neonMat = neonMat;
    const neonGeo = new THREE.BoxGeometry(1, 0.9, 0.12);
    inst(neonGeo, neonMat, neons, (s) => _m.compose(_p.set(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(UP, s.yaw), _s.set(s.w, 1, 1)), 'שלטי ניאון', false);
    this.buildingCount = main.length;
  }

  /** Facade shader: floors, window bays, shop fronts; glass reflects, windows light up after sunset. */
  _facadeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.05, name: 'חזיתות' });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aStyle;\nvarying vec3 vBLocal; varying vec3 vBSize; varying vec3 vBN; varying float vBSeed; varying float vBStyle;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vBLocal = position;
          vBN = normal;
          vBStyle = aStyle;
          #ifdef USE_INSTANCING
            vBSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vBSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #else
            vBSize = vec3(1.0); vBSeed = 0.0;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uLit; uniform float uGlow; uniform float uTime;
          varying vec3 vBLocal; varying vec3 vBSize; varying vec3 vBN; varying float vBSeed; varying float vBStyle;
          float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
          float bWin; float bLit; vec3 bLight;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            bWin = 0.0; bLit = 0.0; bLight = vec3(0.0);
            vec3 n = vBN;
            if (abs(n.y) < 0.5) {
              float u = abs(n.x) > 0.5 ? vBLocal.z * vBSize.z : vBLocal.x * vBSize.x;
              float v = vBLocal.y * vBSize.y;
              float st = vBStyle;
              float floorH = st > 1.5 ? 3.8 : 3.3;
              float bay = st > 1.5 ? 1.6 : (st > 0.5 ? 2.6 : 3.2);
              vec2 cell = vec2(u / bay, v / floorH);
              vec2 f = fract(cell);
              float ww = st > 1.5 ? 0.9 : (st > 0.5 ? 0.78 : 0.5);
              float wh = st > 1.5 ? 0.86 : (st > 0.5 ? 0.55 : 0.5);
              float aw = fwidth(cell.x) * 1.2;
              float ah = fwidth(cell.y) * 1.2;
              bWin = smoothstep(0.5 - ww * 0.5 - aw, 0.5 - ww * 0.5, f.x) * (1.0 - smoothstep(0.5 + ww * 0.5, 0.5 + ww * 0.5 + aw, f.x));
              bWin *= smoothstep(0.2 - ah, 0.2, f.y) * (1.0 - smoothstep(0.2 + wh, 0.2 + wh + ah, f.y));
              // Ground floor: tall shop windows.
              float shop = 1.0 - step(4.4, v);
              if (shop > 0.5) { bWin = step(0.6, v) * step(v, 3.6) * smoothstep(0.08, 0.1, fract(u / 5.0)); }
              // Roof parapet band.
              bWin *= step(v, vBSize.y - 1.2);
              float id = bHash(floor(cell) + vBSeed * 91.7);
              float litShare = 0.16 + 0.26 * uLit;
              bLit = step(1.0 - litShare, id) * uLit * (0.55 + 0.45 * bHash(floor(cell) * 3.1 + vBSeed));
              if (shop > 0.5) bLit = uLit * step(0.25, vBSeed + 0.2) * 0.8;
              bLight = mix(vec3(1.0, 0.62, 0.3), vec3(0.62, 0.78, 1.0), step(0.7, bHash(floor(cell) * 1.7 + vBSeed)));
              // Far away the window grid is sub-pixel: fade to its average so it does not shimmer.
              float far = smoothstep(0.18, 0.45, max(fwidth(cell.x), fwidth(cell.y)));
              if (shop < 0.5) {
                bWin = mix(bWin, ww * wh * 0.9, far);
                bLit = mix(bLit, litShare * uLit * 0.75, far);
                bLight = mix(bLight, vec3(0.9, 0.7, 0.45), far);
              }
              vec3 glass = st > 1.5 ? vec3(0.1, 0.16, 0.2) : vec3(0.06, 0.07, 0.08);
              diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.15 * step(0.5, fract(v / floorH + 0.1))), glass, bWin);
            } else {
              diffuseColor.rgb *= 0.45; // roofs
            }
          }`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, bWin);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.55, bWin);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bLight * bWin * bLit * uGlow;');
    };
    mat.customProgramCacheKey = () => 'city-facade';
    return mat;
  }

  /** Asphalt draped over the terrain around every block, with lane lines and crossings; it stops at the circuit's barriers. */
  _streets(blocks) {
    const t = this.terrain;
    const P = this.pitch;
    const seg = 10;
    const pos = [];
    const uv = [];
    const vert = (u, v) => {
      const p = this._world(u, v);
      const c = this._clear(p.x, p.z);
      const nearStart = c < 34 && Math.hypot(p.x - this.start.x, p.z - this.start.z) < 150;
      return { x: p.x, y: t.heightAt(p.x, p.z) + 0.05, z: p.z, u, v, ok: c > 7.5 && !nearStart && t.heightAt(p.x, p.z) > 0.8 };
    };
    for (const b of blocks) {
      const grid = [];
      for (let a = 0; a <= seg; a++) {
        const row = [];
        for (let c = 0; c <= seg; c++) row.push(vert(b.u - P / 2 + (a / seg) * P, b.v - P / 2 + (c / seg) * P));
        grid.push(row);
      }
      for (let a = 0; a < seg; a++) {
        for (let c = 0; c < seg; c++) {
          const q = [grid[a][c], grid[a + 1][c], grid[a][c + 1], grid[a + 1][c + 1]];
          for (const tri of [
            [q[0], q[2], q[1]],
            [q[1], q[2], q[3]],
          ]) {
            if (!tri.every((p) => p.ok)) continue;
            for (const p of tri) {
              pos.push(p.x, p.y, p.z);
              uv.push(p.u, p.v);
            }
          }
        }
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const T = this.materials.bakeRaceKit();
    const mat = new THREE.MeshStandardMaterial({ name: 'רחובות', map: T.asphalt, color: 0xb4b4b4, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const block = this.block;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPitch = { value: P };
      shader.uniforms.uBlock = { value: block };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGrid;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrid = uv;\nvMapUv = uv / 2.5;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGrid; uniform float uPitch; uniform float uBlock;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            // Local coords from the street centre lines (cell edges).
            vec2 c = vGrid / uPitch;
            vec2 e = abs(fract(c + 0.5) - 0.5) * uPitch; // metres from the nearest street centre line
            vec2 aw = fwidth(vGrid) * 1.2 + 0.01;
            float inter = step(e.x, 8.0) * step(e.y, 8.0);
            // Dashed centre lines along each street, not through intersections.
            float lx = (1.0 - smoothstep(0.12, 0.12 + aw.x, e.x)) * step(fract(vGrid.y / 6.0), 0.5);
            float ly = (1.0 - smoothstep(0.12, 0.12 + aw.y, e.y)) * step(fract(vGrid.x / 6.0), 0.5);
            float lines = max(lx, ly) * (1.0 - inter);
            // Zebra crossings just outside each intersection.
            float zx = step(8.5, e.y) * step(e.y, 11.5) * step(e.x, 6.5) * step(0.5, fract(vGrid.x / 1.2));
            float zy = step(8.5, e.x) * step(e.x, 11.5) * step(e.y, 6.5) * step(0.5, fract(vGrid.y / 1.2));
            float paint = max(lines, max(zx, zy) * 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.8, 0.78, 0.7), paint);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'city-streets';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'רחובות';
    mesh.userData.noPick = true;
    this.group.add(mesh);
  }

  _sidewalks(blocks) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.92, name: 'מדרכות' });
    const list = blocks.filter((b) => b.full);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    _q.setFromAxisAngle(UP, this.angle);
    list.forEach((b, k) => {
      _m.compose(_p.set(b.c.x, b.y - 0.6, b.c.z), _q, _s.set(this.block + 1, 0.85, this.block + 1));
      mesh.setMatrixAt(k, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.name = 'מדרכות';
    this.group.add(mesh);
  }

  _lamps(blocks) {
    const poles = [];
    const heads = [];
    const half = this.block / 2 + 1.2;
    for (const b of blocks) {
      if (!b.full) continue;
      for (const [a, c] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const p = this._world(b.u + a * half, b.v + c * half);
        if (this._clear(p.x, p.z) < 9) continue;
        const y = this.terrain.height(p.x, p.z);
        poles.push(new THREE.Matrix4().setPosition(p.x, y, p.z));
        heads.push(new THREE.Matrix4().setPosition(p.x, y + 7.2, p.z));
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.4, 6);
    poleGeo.translate(0, 3.7, 0);
    const headGeo = new THREE.SphereGeometry(0.32, 10, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.materials.trackEmissive(headMat, 0);
    this.lampMat = headMat;
    for (const [geo, material, list, name, cast] of [
      [poleGeo, this.materials.lib.iron, poles, 'עמודי תאורה', true],
      [headGeo, headMat, heads, 'פנסי רחוב', false],
    ]) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = cast;
      mesh.name = name;
      mesh.userData.noPick = true;
      this.group.add(mesh);
    }
  }

  /** Civilian cars circling blocks (lanes checked clear of the circuit). */
  _traffic(blocks) {
    const rng = this.rng;
    const lane = this.block / 2 + 4.2;
    for (const b of blocks) {
      if (!b.full || rng.random() > 0.35) continue;
      let ok = true;
      for (let k = 0; k < 16 && ok; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p = this._world(b.u + Math.cos(a) * lane * 1.1, b.v + Math.sin(a) * lane * 1.1);
        if (this._clear(p.x, p.z) < 8 || this.terrain.height(p.x, p.z) < 1.5) ok = false;
      }
      if (!ok) continue;
      const count = 1 + Math.floor(rng.random() * 2);
      for (let k = 0; k < count; k++) this.cars.push({ b, lane: lane + (k % 2 ? 3.2 : 0), s: rng.random(), speed: rng.range(8, 13), dir: rng.random() < 0.5 ? 1 : -1, col: new THREE.Color().setHSL(rng.random(), rng.range(0.1, 0.6), rng.range(0.25, 0.7)) });
    }
    if (!this.cars.length) return;
    const body = new THREE.BoxGeometry(1.8, 0.7, 4.2);
    body.translate(0, 0.6, 0);
    const cab = new THREE.BoxGeometry(1.55, 0.55, 2.1);
    cab.translate(0, 1.2, -0.2);
    const col = (g, c) => {
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) a.set(c, i);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g.toNonIndexed();
    };
    const carGeo = mergeGeometries([col(body, [1, 1, 1]), col(cab, [0.12, 0.13, 0.15])]);
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5, name: 'תנועה' });
    this.carMesh = new THREE.InstancedMesh(carGeo, carMat, this.cars.length);
    this.cars.forEach((c, k) => this.carMesh.setColorAt(k, c.col));
    const lights = [];
    for (const s of [-1, 1]) {
      lights.push(col(new THREE.BoxGeometry(0.34, 0.14, 0.05).translate(s * 0.62, 0.75, 2.11), [1, 0.95, 0.85]));
      lights.push(col(new THREE.BoxGeometry(0.34, 0.12, 0.05).translate(s * 0.62, 0.78, -2.11), [1, 0.08, 0.04]));
    }
    const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1 });
    lightMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    lightMat.customProgramCacheKey = () => 'city-carlights';
    this.materials.trackEmissive(lightMat, 0.8);
    this.carLightMesh = new THREE.InstancedMesh(mergeGeometries(lights), lightMat, this.cars.length);
    for (const m of [this.carMesh, this.carLightMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.userData.noPick = true;
      this.group.add(m);
    }
    this.carMesh.castShadow = true;
    this._moveTraffic(0);
  }

  _moveTraffic(dt) {
    if (!this.cars.length) return;
    const r = 6; // corner radius
    this.cars.forEach((c, k) => {
      const hl = c.lane;
      const side = 2 * (hl - r);
      const per = 4 * side + 2 * Math.PI * r;
      c.s = (c.s + (c.dir * c.speed * dt) / per + 1) % 1;
      let d = c.s * per;
      // Walk the rounded rectangle: straight, quarter circle, ×4.
      let u = 0;
      let v = 0;
      let yaw = 0;
      for (let e = 0; e < 4; e++) {
        const a0 = (e * Math.PI) / 2;
        const dir = [Math.cos(a0 + Math.PI / 2), Math.sin(a0 + Math.PI / 2)];
        const start = [Math.cos(a0) * hl - dir[0] * (hl - r), Math.sin(a0) * hl - dir[1] * (hl - r)];
        if (d <= side) {
          u = start[0] + dir[0] * d;
          v = start[1] + dir[1] * d;
          yaw = Math.atan2(dir[0], dir[1]);
          break;
        }
        d -= side;
        const arc = (Math.PI / 2) * r;
        if (d <= arc) {
          const t = d / r;
          const cx = Math.cos(a0) * (hl - r) + dir[0] * (hl - r);
          const cz = Math.sin(a0) * (hl - r) + dir[1] * (hl - r);
          const ang = a0 + t;
          u = cx + Math.cos(ang) * r;
          v = cz + Math.sin(ang) * r;
          yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
          break;
        }
        d -= arc;
      }
      const p = this._world(c.b.u + u, c.b.v + v, _p);
      const y = this.terrain.heightAt(p.x, p.z) + 0.02;
      const heading = yaw + this.angle * -1 + (c.dir < 0 ? Math.PI : 0);
      _q.setFromAxisAngle(UP, heading);
      _m.compose(_p.set(p.x, y, p.z), _q, _s.set(1, 1, 1));
      this.carMesh.setMatrixAt(k, _m);
      this.carLightMesh.setMatrixAt(k, _m);
    });
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.carLightMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const eng = this.engine;
    const atm = eng.atmosphere;
    this.time += dt;
    const lit = smoothstep(0.85, 0.1, atm.dayFactor + (1 - atm.nightFactor) * 0.2);
    this.uniforms.uLit.value = lit;
    this.uniforms.uGlow.value = (eng.materials.emissiveScale || 1) * 0.22;
    const M = eng.materials;
    if (this.lampMat) M.setEmissiveBase(this.lampMat, lit * 3);
    if (this.neonMat) M.setEmissiveBase(this.neonMat, 0.15 + lit * 1.4);
    if (this.beaconMat) M.setEmissiveBase(this.beaconMat, Math.sin(this.time * 3) > 0.3 ? 2.5 : 0);
    this._moveTraffic(dt);
    this._sound(dt);
  }

  /** Traffic rumble, horns and the odd siren, placed around the listener. */
  _sound(dt) {
    const A = this.engine.audio;
    if (!A.ctx || !A.enabled) return;
    const ctx = A.ctx;
    if (!this.hum) {
      const src = ctx.createBufferSource();
      src.buffer = A.brown;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(f).connect(g).connect(A.master);
      src.start();
      this.hum = { src, g };
      this.hornT = 2;
      this.sirenT = 12;
    }
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = 2 + Math.random() * 6;
      const pos = this.engine.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160));
      const out = ctx.createGain();
      out.gain.value = 0.05;
      out.connect(A._panner(pos, 10, 220)).connect(A.master);
      const f0 = 330 + Math.random() * 120;
      const dur = 0.15 + Math.random() * 0.45;
      A._tone(out, { freq: f0, dur, gain: 0.5, type: 'square' });
      A._tone(out, { freq: f0 * 1.26, dur, gain: 0.4, type: 'square' });
    }
    this.sirenT -= dt;
    if (this.sirenT <= 0) {
      this.sirenT = 18 + Math.random() * 25;
      const out = ctx.createGain();
      out.gain.value = 0.025;
      out.connect(A.master);
      for (let i = 0; i < 4; i++) A._tone(out, { freq: 620, dur: 0.7, gain: 1, type: 'sine', when: i * 0.75, slide: 1.4 });
    }
  }

  dispose() {
    if (this.hum) {
      try {
        this.hum.src.stop();
      } catch {
        /* stopped */
      }
      this.hum.g.disconnect();
    }
    this.group.removeFromParent();
  }
}
