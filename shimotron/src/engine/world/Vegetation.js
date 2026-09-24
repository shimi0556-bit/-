import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Random, smoothstep } from '../core/Random.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const ni = (g) => (g.index ? g.toNonIndexed() : g);

/**
 * Adds wind sway to a stock material. `mode`: 'grass' bends blades, 'tree'
 * sways canopies. Foliage cards also get sun backlighting (light through
 * leaves) and keep their authored normals on both faces.
 */
export function windMaterial(material, uniforms, mode, foliage = false) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform vec2 uWindDir;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wBase = instanceMatrix[3].xyz;
        #else
          vec3 wBase = vec3(0.0);
        #endif
        float wPhase = dot(wBase.xz, uWindDir) * 0.12 - uTime * 1.3;
        float gust = sin(wPhase) * 0.5 + sin(wPhase * 2.3 + wBase.x * 0.7) * 0.25 + sin(uTime * 0.37 + wBase.z * 0.05) * 0.35;
        ${
          mode === 'grass'
            ? `float hf = position.y * position.y;
               vec2 bend = uWindDir * (0.35 + gust * 0.45) * uWind * hf;
               bend += vec2(sin(uTime * 2.7 + wBase.x * 3.1), cos(uTime * 2.1 + wBase.z * 2.7)) * 0.05 * hf;
               transformed.xz += bend;
               transformed.y -= length(bend) * 0.35;`
            : mode === 'bush'
            ? `float hf = position.y * position.y * 0.05;
               vec2 sway = uWindDir * (0.4 + gust * 0.6) * uWind * hf;
               sway += vec2(sin(uTime * 3.1 + position.x * 4.0 + wBase.x), cos(uTime * 2.7 + position.z * 3.3 + wBase.z)) * 0.12 * uWind * hf;
               transformed.xz += sway;`
            : `float hf = max(position.y - 2.0, 0.0) * 0.045;
               vec2 sway = uWindDir * (0.4 + gust * 0.6) * uWind * hf;
               float flutter = sin(uTime * 6.0 + position.x * 3.1 + position.z * 2.3 + wBase.x) * 0.035 * uWind * step(2.5, position.y);
               sway += vec2(sin(uTime * 1.9 + position.y * 0.8 + wBase.x), cos(uTime * 1.6 + position.x * 1.3 + wBase.z)) * 0.04 * uWind * hf * 3.0;
               transformed.xz += sway;
               transformed.y += flutter;`
        }`,
      );
    if (foliage) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunColor;')
        .replace(
          '#include <alphatest_fragment>',
          `{
            // Keep coverage in distant mips so far canopies do not dissolve.
            vec2 mdx = dFdx(vMapUv * 512.0); vec2 mdy = dFdy(vMapUv * 512.0);
            float mipLevel = max(0.0, 0.5 * log2(max(dot(mdx, mdx), dot(mdy, mdy))));
            diffuseColor.a *= 1.0 + mipLevel * 0.35;
          }
          #include <alphatest_fragment>`,
        )
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            float back = pow(saturate(dot(normalize(-vViewPosition), sunV)), 4.0);
            totalEmissiveRadiance += uSunColor * diffuseColor.rgb * back * 0.22;
          }`,
        );
    }
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `wind-${mode}-${foliage}`;
  return material;
}

/** Builds one textured foliage card (quad) with per-vertex normals and AO. */
function pushCard(out, corners, normals, ao) {
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (const [a, b, c] of [
    [0, 1, 2],
    [0, 2, 3],
  ]) {
    for (const k of [a, b, c]) {
      out.pos.push(corners[k].x, corners[k].y, corners[k].z);
      out.nrm.push(normals[k].x, normals[k].y, normals[k].z);
      out.uv.push(uvs[k][0], uvs[k][1]);
      out.col.push(ao[k][0], ao[k][1], ao[k][2]);
    }
  }
}

function cardGeometry(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Instanced vegetation scattered from the terrain's splat map: two tree
 * species, wind-animated grass clumps, flowers and boulders.
 */
export class Vegetation {
  /**
   * options.grassSampler(rng) → {x, z} | null picks grass/flower spots (default:
   * a disk around the plaza); options.colliderFilter(c) → bool decides which
   * trees and rocks get static physics (default: the island's heart);
   * options.blocked(x, z) → bool keeps scenery off built-up ground.
   */
  constructor(engine, terrain, materials, options = {}) {
    this.engine = engine;
    this.options = options;
    this.terrain = terrain;
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = 'Vegetation';
    this.rng = new Random(99);
    this.noise = new SimplexNoise(new Random(1234));
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() } };
    this.windMats = [];
    this.colliders = []; // {x, y, z, r} for static physics
  }

  _canPlace(x, z, { minH = 1.2, maxH = 60, maxSlope = 0.35, clearPlaza = 42, clearPath = 5 } = {}) {
    const t = this.terrain;
    const h = t.heightAt(x, z);
    if (h < minH || h > maxH) return null;
    t.normalAt(x, z, _n);
    if (1 - _n.y > maxSlope) return null;
    if (t.plaza && Math.hypot(x - t.plaza.x, z - t.plaza.z) < clearPlaza) return null;
    if (clearPath > 0 && t.paths.length && t.distanceToPath(x, z) < clearPath) return null;
    if (t.clearance && t.clearance(x, z) < clearPath * 2 + 4) return null;
    if (this.options.blocked && this.options.blocked(x, z)) return null;
    return h;
  }

  /**
   * Splits instances into spatial cells, one InstancedMesh per cell, so the
   * camera and the shadow pass can frustum-cull whole patches. Items carry
   * a precomputed `matrix` and optional `color`.
   */
  _chunked(geo, mat, items, name, { cast = false, cell = 220 } = {}) {
    const cells = new Map();
    for (const it of items) {
      const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    const meshes = [];
    for (const list of cells.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.matrix);
        if (it.color) mesh.setColorAt(i, it.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox?.();
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.name = name;
      mesh.userData.noPick = true;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  build() {
    const q = this.engine.quality.settings;
    this._trees(q.treeDensity);
    this._rocks();
    this._grass(q.grassDensity);
    this._flowers(q.grassDensity);
    return this.group;
  }

  // ------------------------------------------------------------- trees

  _pineGeometry() {
    const trunk = new THREE.CylinderGeometry(0.14, 0.34, 9.4, 7, 1);
    trunk.translate(0, 4.7, 0);
    const uv = trunk.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
    const rng = new Random(5);
    const out = { pos: [], nrm: [], uv: [], col: [] };
    const up = new THREE.Vector3(0, 1, 0);
    const tiers = 11;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      const y = 2.0 + k * 8.0;
      const r = 3.1 * (1 - k) + 0.5;
      const count = t < 4 ? 10 : t < 8 ? 8 : 6;
      for (let b = 0; b < count; b++) {
        const a = (b / count) * Math.PI * 2 + t * 0.7 + rng.range(-0.2, 0.2);
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const len = r * rng.range(0.85, 1.1);
        const droop = len * rng.range(0.35, 0.55);
        const base = dir.clone().multiplyScalar(0.12).add(new THREE.Vector3(0, y + 0.15, 0));
        const tip = dir.clone().multiplyScalar(len).add(new THREE.Vector3(0, y - droop, 0));
        const nOut = dir.clone().multiplyScalar(0.55).add(up.clone().multiplyScalar(0.85)).normalize();
        const shade = 0.55 + k * 0.35;
        for (const tilt of [0, 1]) {
          const s2 = tilt ? side.clone().multiplyScalar(0.5).add(up.clone().multiplyScalar(0.866)) : side.clone();
          const wBase = len * 0.2;
          const wTip = len * 0.58;
          const corners = [
            base.clone().addScaledVector(s2, -wBase),
            base.clone().addScaledVector(s2, wBase),
            tip.clone().addScaledVector(s2, wTip),
            tip.clone().addScaledVector(s2, -wTip),
          ];
          const nb = nOut.clone().lerp(up, 0.3).normalize();
          const ao = [
            [shade * 0.55, shade * 0.6, shade * 0.55],
            [shade * 0.55, shade * 0.6, shade * 0.55],
            [shade, shade, shade * 0.95],
            [shade, shade, shade * 0.95],
          ];
          pushCard(out, corners, [nb, nb, nOut, nOut], ao);
        }
      }
    }
    // Leader at the crown.
    const topY = 10.4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const s2 = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const corners = [
        new THREE.Vector3(0, topY - 1.6, 0).addScaledVector(s2, -0.35),
        new THREE.Vector3(0, topY - 1.6, 0).addScaledVector(s2, 0.35),
        new THREE.Vector3(0, topY + 0.3, 0).addScaledVector(s2, 0.12),
        new THREE.Vector3(0, topY + 0.3, 0).addScaledVector(s2, -0.12),
      ];
      pushCard(out, corners, [up, up, up, up], [
        [0.85, 0.9, 0.85],
        [0.85, 0.9, 0.85],
        [1, 1, 1],
        [1, 1, 1],
      ]);
    }
    return { trunk, leaves: cardGeometry(out) };
  }

  _oakGeometry() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.26, 0.5, 5.4, 8, 3);
    trunk.translate(0, 2.7, 0);
    parts.push(trunk);
    const rng = new Random(11);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.08, 0.2, 3.4, 6);
      b.translate(0, 1.7, 0);
      b.rotateZ(0.6 + rng.random() * 0.35);
      b.rotateY((i / 4) * Math.PI * 2 + rng.random());
      b.translate(0, 4.4, 0);
      parts.push(b);
    }
    const trunkGeo = mergeGeometries(parts.map(ni));
    const uv = trunkGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);

    const out = { pos: [], nrm: [], uv: [], col: [] };
    const centers = [
      [0, 7.8, 0, 3.0, 40],
      [2.1, 6.8, 0.7, 2.2, 22],
      [-1.9, 7.0, -0.8, 2.3, 22],
      [0.5, 6.5, -2.1, 2.1, 20],
      [-0.6, 9.3, 0.9, 2.0, 18],
      [1.0, 8.6, 1.9, 1.8, 14],
    ];
    const v = new THREE.Vector3();
    for (const [cx, cy, cz, R, n] of centers) {
      const c = new THREE.Vector3(cx, cy, cz);
      for (let i = 0; i < n; i++) {
        v.randomDirection();
        v.y *= 0.8;
        const d = R * (0.3 + 0.7 * Math.sqrt(rng.random()));
        const p = c.clone().addScaledVector(v, d);
        const outward = p.clone().sub(c).normalize();
        const nd = new THREE.Vector3().randomDirection().addScaledVector(outward, 1.1).normalize();
        const t1 = new THREE.Vector3().crossVectors(nd, Math.abs(nd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
        const t2 = new THREE.Vector3().crossVectors(nd, t1).normalize();
        const rot = rng.range(0, Math.PI * 2);
        const u = t1.clone().multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot));
        const w = t1.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(t2, Math.cos(rot));
        const size = rng.range(1.5, 2.3) * (R / 2.6);
        const corners = [
          p.clone().addScaledVector(u, -size / 2).addScaledVector(w, -size / 2),
          p.clone().addScaledVector(u, size / 2).addScaledVector(w, -size / 2),
          p.clone().addScaledVector(u, size / 2).addScaledVector(w, size / 2),
          p.clone().addScaledVector(u, -size / 2).addScaledVector(w, size / 2),
        ];
        const normals = corners.map((q) => q.clone().sub(c).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.25).normalize());
        const ao = corners.map((q) => {
          const r = Math.min(1, q.distanceTo(c) / R);
          const lift = Math.min(1, Math.max(0, (q.y - 5.5) / 5));
          const k = (0.42 + 0.58 * r) * (0.75 + 0.25 * lift);
          return [k * 0.97, k, k * 0.9];
        });
        pushCard(out, corners, normals, ao);
      }
    }
    return { trunk: trunkGeo, leaves: cardGeometry(out) };
  }

  /** Vertex colours: darker inside/under the canopy, lighter at the tips. */
  _leafColors(geo, dark, light, yMin, yMax) {
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const r = Math.hypot(p.getX(i), p.getZ(i));
      const t = Math.min(1, Math.max(0, (y - yMin) / (yMax - yMin))) * 0.6 + Math.min(1, r / 3) * 0.4;
      _c.copy(dark).lerp(light, t * t);
      const v = 0.85 + Math.random() * 0.3;
      col.set([_c.r * v, _c.g * v, _c.b * v], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  _trees(density) {
    const pine = this._pineGeometry();
    const oak = this._oakGeometry();
    const T = this.materials.textures;
    const foliage = (map, name, color) =>
      windMaterial(
        new THREE.MeshStandardMaterial({ name, map, color, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 }),
        this.uniforms,
        'tree',
        true,
      );
    const needleMat = foliage(T.needles, 'מחטים', 0xffffff);
    const leafMat = foliage(T.leaves, 'עלווה', 0xffffff);
    const trunkMat = this.materials.lib.bark;
    this.windMats.push(leafMat, needleMat);

    const pines = [];
    const oaks = [];
    const t = this.terrain;
    const half = t.size / 2 - 20;
    const maxPines = Math.round(620 * density);
    const maxOaks = Math.round(260 * density);
    let guard = 0;
    while ((pines.length < maxPines || oaks.length < maxOaks) && guard++ < 60000) {
      const x = this.rng.range(-half, half);
      const z = this.rng.range(-half, half);
      const forest = this.noise.noise(x * 0.006, z * 0.006) * 0.5 + 0.5;
      if (this.rng.random() > smoothstep(0.35, 0.75, forest)) continue;
      const h = this._canPlace(x, z, { minH: 3.2, maxH: 70, maxSlope: 0.3, clearPlaza: 48, clearPath: 5 });
      if (h === null) continue;
      const w = t.weightsAt(x, z);
      if (w.rock > 0.4 || w.sand > 0.2) continue;
      const isPine = h > 16 || this.noise.noise(x * 0.01 + 50, z * 0.01) > 0.15;
      const list = isPine ? pines : oaks;
      if (list.length >= (isPine ? maxPines : maxOaks)) continue;
      const s = isPine ? this.rng.range(0.75, 1.35) : this.rng.range(0.8, 1.25);
      list.push({ x, y: h - 0.25, z, s, r: this.rng.range(0, Math.PI * 2) });
    }
    const withMatrix = (list) => {
      for (const it of list) {
        _q.setFromEuler(_e.set(this.rng.range(-0.04, 0.04), it.r, this.rng.range(-0.04, 0.04)));
        it.matrix = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), _q.clone(), new THREE.Vector3(it.s, it.s * this.rng.range(0.9, 1.15), it.s));
      }
    };
    withMatrix(pines);
    withMatrix(oaks);
    const make = (geo, mat, list, name, cast) => this._chunked(geo, mat, list, name, { cast, cell: 180 });
    make(pine.trunk, trunkMat, pines, 'אורנים · גזע', true);
    make(pine.leaves, needleMat, pines, 'אורנים · מחטים', true);
    make(oak.trunk, trunkMat, oaks, 'אלונים · גזע', true);
    make(oak.leaves, leafMat, oaks, 'אלונים · עלווה', true);
    for (const it of pines) this.colliders.push({ x: it.x, y: it.y + 3, z: it.z, r: 0.35 * it.s, h: 6, type: 'trunk' });
    for (const it of oaks) this.colliders.push({ x: it.x, y: it.y + 2.5, z: it.z, r: 0.45 * it.s, h: 5, type: 'trunk' });
    this.treeCount = pines.length + oaks.length;
  }

  // ------------------------------------------------------------- rocks

  _rockGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const noise = new SimplexNoise(new Random(seed));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _p.set(p.getX(i), p.getY(i), p.getZ(i));
      let d = 1 + noise.noise3d(_p.x * 1.1, _p.y * 1.1, _p.z * 1.1) * 0.28 + noise.noise3d(_p.x * 3, _p.y * 3, _p.z * 3) * 0.08;
      // Flatten facets for a chiselled read.
      d = Math.round(d * 7) / 7 * 0.35 + d * 0.65;
      _p.multiplyScalar(d);
      _p.y *= 0.72;
      p.setXYZ(i, _p.x, _p.y, _p.z);
    }
    g.computeVertexNormals();
    return g;
  }

  _rocks() {
    const t = this.terrain;
    const variants = [this._rockGeometry(3), this._rockGeometry(8), this._rockGeometry(21)];
    const lists = [[], [], []];
    const half = t.size / 2 - 30;
    let guard = 0;
    let count = 0;
    while (count < 240 && guard++ < 20000) {
      const x = this.rng.range(-half, half);
      const z = this.rng.range(-half, half);
      const h = this._canPlace(x, z, { minH: -2, maxH: 90, maxSlope: 0.6, clearPlaza: 36, clearPath: 3 });
      if (h === null) continue;
      const w = t.weightsAt(x, z);
      const coastal = h < 2.5;
      if (!coastal && w.rock < 0.2 && this.rng.random() > 0.12) continue;
      const s = coastal ? this.rng.range(0.6, 2.2) : this.rng.range(0.8, 3.6);
      lists[count % 3].push({ x, y: h - s * 0.25, z, s, r: this.rng.range(0, 6.28) });
      count++;
    }
    // A few hero boulders framing the plaza.
    const hero = [
      [-38, -26, 3.4],
      [41, -12, 2.6],
      [-30, 40, 2.2],
      [36, 34, 3.0],
    ];
    hero.forEach(([x, z, s], i) => lists[i % 3].push({ x, y: t.heightAt(x, z) - s * 0.2, z, s, r: i * 1.7, hero: true }));

    lists.forEach((list, vi) => {
      for (const it of list) {
        _q.setFromEuler(_e.set(this.rng.range(-0.3, 0.3), it.r, this.rng.range(-0.3, 0.3)));
        it.matrix = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), _q.clone(), new THREE.Vector3(it.s * this.rng.range(0.9, 1.3), it.s, it.s * this.rng.range(0.9, 1.3)));
        if (it.s > 1.2) this.colliders.push({ x: it.x, y: it.y, z: it.z, r: it.s * 0.8, type: 'sphere' });
      }
      this._chunked(variants[vi], this.materials.lib.rock, list, 'סלעים', { cast: true, cell: 220 });
    });
  }

  // ------------------------------------------------------------- grass

  _bladeClump() {
    const blades = [];
    const rng = new Random(3);
    for (let b = 0; b < 6; b++) {
      const h = rng.range(0.45, 0.95);
      const w = rng.range(0.035, 0.06);
      const lean = rng.range(0.05, 0.25);
      const pos = [-w, 0, 0, w, 0, 0, -w * 0.7, h * 0.5, lean * 0.4, w * 0.7, h * 0.5, lean * 0.4, 0, h, lean];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
      g.rotateY(rng.range(0, Math.PI * 2));
      g.translate(rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18));
      blades.push(ni(g));
    }
    const geo = mergeGeometries(blades);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const nrm = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = Math.min(1, y / 0.9);
      _c.setRGB(0.05, 0.1, 0.02).lerp(_c.clone().setRGB(0.36, 0.5, 0.14), t);
      col.set([_c.r, _c.g, _c.b], i * 3);
      nrm.set([0, 1, 0], i * 3); // lit like the ground it grows from
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    return geo;
  }

  _grass(density) {
    const t = this.terrain;
    const geo = this._bladeClump();
    const mat = windMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, name: 'דשא' }),
      this.uniforms,
      'grass',
    );
    this.windMats.push(mat);
    const target = Math.round(17000 * density);
    const radius = 95;
    const items = [];
    const sampler =
      this.options.grassSampler ||
      ((rng) => {
        if (!t.plaza) return null;
        const a = rng.random() * Math.PI * 2;
        const r = Math.sqrt(rng.random()) * radius;
        const x = t.plaza.x + Math.cos(a) * r;
        const z = t.plaza.z + Math.sin(a) * r;
        if (Math.hypot(x - t.plaza.x, z - t.plaza.z) < t.plaza.radius + 1.5) return null;
        return { x, z };
      });
    let guard = 0;
    while (items.length < target && guard++ < target * 6) {
      const p = sampler(this.rng);
      if (!p) continue;
      const { x, z } = p;
      if (t.clearance && t.clearance(x, z) < 1.5) continue;
      const w = t.weightsAt(x, z);
      if (this.rng.random() > w.grass * 1.15 - 0.1) continue;
      const h = t.heightAt(x, z);
      if (h < 1.2) continue;
      const patch = this.noise.noise(x * 0.05, z * 0.05) * 0.5 + 0.5;
      items.push({ x, y: h - 0.02, z, s: 0.7 + patch * 0.7 + this.rng.random() * 0.25, patch });
    }
    // Sparse tufts across the rest of the island.
    const half = t.size / 2 - 40;
    const extra = Math.round(3500 * density);
    guard = 0;
    let added = 0;
    while (added < extra && guard++ < extra * 8) {
      const x = this.rng.range(-half, half);
      const z = this.rng.range(-half, half);
      if (t.plaza && Math.hypot(x, z) < radius) continue;
      if (t.clearance && t.clearance(x, z) < 2) continue;
      const w = t.weightsAt(x, z);
      if (w.grass < 0.7) continue;
      const h = t.heightAt(x, z);
      if (h < 1.5) continue;
      items.push({ x, y: h - 0.02, z, s: 0.9 + this.rng.random() * 0.5, patch: 0.5, far: true });
      added++;
    }
    for (const it of items) {
      _q.setFromEuler(_e.set(0, this.rng.range(0, 6.28), 0));
      it.matrix = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), _q.clone(), new THREE.Vector3(it.s, it.s * (0.8 + it.patch * 0.5), it.s));
      it.color = new THREE.Color().setHSL(0.2 + it.patch * 0.05 + this.rng.range(-0.02, 0.02), 0.5, 0.45 + this.rng.range(-0.08, 0.08)).multiplyScalar(2.1);
    }
    this._chunked(geo, mat, items.filter((it) => !it.far), 'דשא', { cast: false, cell: 64 });
    this._chunked(geo, mat, items.filter((it) => it.far), 'דשא', { cast: false, cell: 280 });
    this.grassCount = items.length;
  }

  _flowers(density) {
    const t = this.terrain;
    const petal = new THREE.IcosahedronGeometry(0.07, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.35, 3);
    stem.translate(0, 0.17, 0);
    petal.translate(0, 0.36, 0);
    const col = (g, c) => {
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) a.set(c, i);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return ni(g);
    };
    const geo = mergeGeometries([col(stem, [0.12, 0.3, 0.06]), col(petal, [1, 1, 1])]);
    const mat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, name: 'פרחים' }), this.uniforms, 'grass');
    this.windMats.push(mat);
    const count = Math.round(1500 * density);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const palette = [0xf2e14b, 0xffffff, 0xd94f8a, 0x8a6cf0, 0xff8a3d].map((c) => new THREE.Color(c));
    let i = 0;
    let guard = 0;
    while (i < count && guard++ < count * 10) {
      let x;
      let z;
      if (this.options.grassSampler) {
        const p = this.options.grassSampler(this.rng);
        if (!p) continue;
        ({ x, z } = p);
        if (t.clearance && t.clearance(x, z) < 2) continue;
      } else {
        if (!t.plaza) break;
        const a = this.rng.random() * Math.PI * 2;
        const r = Math.sqrt(this.rng.random()) * 90;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (Math.hypot(x, z) < t.plaza.radius + 3) continue;
      }
      const cluster = this.noise.noise(x * 0.04 + 9, z * 0.04) > 0.35;
      if (!cluster) continue;
      const w = t.weightsAt(x, z);
      if (w.grass < 0.6) continue;
      const h = t.heightAt(x, z);
      _m.compose(_p.set(x, h, z), _q.identity(), _s.setScalar(this.rng.range(0.8, 1.4)));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, palette[Math.floor(this.noise.noise(x * 0.02, z * 0.02 + 40) * 2.5 + 2.5) % palette.length]);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.name = 'פרחים';
    mesh.userData.noPick = true;
    this.group.add(mesh);
  }

  addPhysics(physics) {
    for (const c of this.colliders) {
      const keep = this.options.colliderFilter ? this.options.colliderFilter(c) : Math.hypot(c.x, c.z) <= 240;
      if (!keep) continue; // far scenery stays visual-only
      if (c.type === 'sphere') physics.addStaticSphere(c, c.r);
      else physics.addStaticCylinder(c, c.r, c.h, 'wood');
    }
  }

  update(dt) {
    const eng = this.engine;
    const atm = eng.atmosphere;
    this.uniforms.uTime.value = eng.time.elapsed;
    this.uniforms.uWind.value = atm.wind.strength;
    this.uniforms.uWindDir.value.copy(atm.wind.dir);
    this.uniforms.uSunDir.value.copy(atm.lightDir);
    this.uniforms.uSunColor.value.copy(atm.keyLight.color).multiplyScalar(atm.keyLight.intensity);
  }
}
