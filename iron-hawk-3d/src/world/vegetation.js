// Plants and rocks: low-poly procedural models drawn as instanced meshes in map chunks,
// with a wind sway in the vertex shader. Chunks far from the camera are hidden.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, makeNoise2D, fbm, smoothstep } from '../core/util.js';

function colorize(geo, color, jitter = 0, rand = Math.random) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rand() - 0.5) * jitter;
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r * k; col[(i + j) * 3 + 1] = c.g * k; col[(i + j) * 3 + 2] = c.b * k; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

function jitterVerts(geo, amount, rand) {
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const d = map.get(key);
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  return geo;
}

const MODELS = {
  pine(rand) {
    const parts = [colorize(new THREE.CylinderGeometry(0.25, 0.45, 4, 6).translate(0, 2, 0), 0x4a3524, 0.2, rand)];
    let y = 2.2, r = 3.6;
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.ConeGeometry(r, 4.6 - i * 0.3, 8, 1).translate(0, y + 2.1, 0);
      parts.push(colorize(jitterVerts(cone, 0.5, rand), new THREE.Color().setHSL(0.31 + rand() * 0.04, 0.45, 0.17 + i * 0.02), 0.25, rand));
      y += 2.5; r *= 0.74;
    }
    return mergeGeometries(parts);
  },
  broad(rand) {
    const parts = [colorize(new THREE.CylinderGeometry(0.3, 0.55, 5, 6).translate(0, 2.5, 0), 0x5a4330, 0.2, rand)];
    for (let i = 0; i < 4; i++) {
      const s = 2.4 + rand() * 1.4;
      const blob = new THREE.IcosahedronGeometry(s, 1).translate((rand() - 0.5) * 3, 6 + rand() * 2.5, (rand() - 0.5) * 3);
      parts.push(colorize(jitterVerts(blob, 0.7, rand), new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.5, 0.22 + rand() * 0.06), 0.3, rand));
    }
    return mergeGeometries(parts);
  },
  bush(rand) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.IcosahedronGeometry(0.9 + rand() * 0.6, 0).translate((rand() - 0.5) * 1.6, 0.7, (rand() - 0.5) * 1.6);
      parts.push(colorize(jitterVerts(b, 0.3, rand), new THREE.Color().setHSL(0.2 + rand() * 0.08, 0.4, 0.2), 0.3, rand));
    }
    return mergeGeometries(parts);
  },
  rock(rand) {
    const g = new THREE.IcosahedronGeometry(2, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(0.75 + 0.5 * Math.abs(Math.sin(v.x * 2.1 + v.z * 1.3) * Math.cos(v.y * 1.7)));
      v.y *= 0.6;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return colorize(jitterVerts(g, 0.4, rand), 0x8a857d, 0.35, rand);
  },
  cactus(rand) {
    const parts = [colorize(new THREE.CylinderGeometry(0.45, 0.5, 6, 8).translate(0, 3, 0), 0x3d6b33, 0.15, rand)];
    for (const side of [-1, 1]) {
      const h = 1.8 + rand() * 1.5;
      parts.push(colorize(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 6).rotateZ(Math.PI / 2).translate(side * 0.9, h, 0), 0x3d6b33, 0.15, rand));
      parts.push(colorize(new THREE.CylinderGeometry(0.3, 0.32, 2.2, 6).translate(side * 1.55, h + 1.0, 0), 0x41703a, 0.15, rand));
    }
    return mergeGeometries(parts);
  },
  deadTree(rand) {
    const parts = [colorize(new THREE.CylinderGeometry(0.18, 0.5, 7, 5).translate(0, 3.5, 0), 0x1d1816, 0.3, rand)];
    for (let i = 0; i < 4; i++) {
      const len = 2 + rand() * 2;
      const b = new THREE.CylinderGeometry(0.06, 0.16, len, 4).translate(0, len / 2, 0)
        .rotateZ((rand() - 0.5) * 1.6).rotateY(rand() * Math.PI * 2).translate(0, 3 + rand() * 3, 0);
      parts.push(colorize(b, 0x221c19, 0.3, rand));
    }
    return mergeGeometries(parts);
  },
  crystal(rand) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const h = 2 + rand() * 4;
      const c = new THREE.OctahedronGeometry(1, 0).scale(0.5, h, 0.5).translate(0, h * 0.6, 0)
        .rotateX((rand() - 0.5) * 0.8).rotateZ((rand() - 0.5) * 0.8).translate((rand() - 0.5) * 2, 0, (rand() - 0.5) * 2);
      parts.push(colorize(c, 0xff6a20, 0.3, rand));
    }
    return mergeGeometries(parts);
  },
};

const RULES = {
  pine: { minSlope: 0, maxSlope: 0.42, scale: [0.8, 1.6], forest: 0.48, minAbove: 3, maxH: 480, sway: 0.06 },
  broad: { minSlope: 0, maxSlope: 0.25, scale: [0.8, 1.4], forest: 0.4, minAbove: 3, maxH: 220, sway: 0.08 },
  bush: { minSlope: 0, maxSlope: 0.45, scale: [0.7, 1.6], forest: 0.2, minAbove: 1.5, maxH: 600, sway: 0.1 },
  rock: { minSlope: 0, maxSlope: 0.8, scale: [0.6, 3.5], forest: -1, minAbove: 0.5, maxH: 9999, sway: 0 },
  cactus: { minSlope: 0, maxSlope: 0.25, scale: [0.7, 1.4], forest: 0.1, minAbove: 1, maxH: 9999, sway: 0 },
  deadTree: { minSlope: 0, maxSlope: 0.45, scale: [0.8, 1.5], forest: 0.3, minAbove: 3, maxH: 700, sway: 0.02 },
  crystal: { minSlope: 0, maxSlope: 0.6, scale: [0.8, 2.2], forest: -1, minAbove: 1, maxH: 120, sway: 0, nearWater: 60, glow: true },
};

export class Vegetation {
  constructor(terrain, level, quality) {
    this.terrain = terrain; this.level = level; this.quality = quality;
    this.group = new THREE.Group();
    this.chunks = [];
    this.uniforms = { uTime: { value: 0 } };
  }

  build() {
    const rand = mulberry32(this.level.seed + 77);
    const noise = makeNoise2D(this.level.seed + 5);
    const CH = 6, size = this.terrain.size, chunk = size / CH;
    const tmpN = new THREE.Vector3();
    const dummy = new THREE.Object3D();
    for (const [kind, total] of Object.entries(this.level.plants)) {
      const count = Math.round(total * this.quality.plants);
      if (!count) continue;
      const rule = RULES[kind];
      const geo = MODELS[kind](mulberry32(this.level.seed + kind.length * 13));
      geo.computeVertexNormals();
      const mat = this.makeMaterial(rule);
      const buckets = Array.from({ length: CH * CH }, () => []);
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 30) {
        tries++;
        const x = (rand() - 0.5) * size * 0.96, z = (rand() - 0.5) * size * 0.96;
        const h = this.terrain.heightAt(x, z);
        if (h < this.terrain.waterLevel + rule.minAbove || h > rule.maxH) continue;
        if (rule.nearWater && h > this.terrain.waterLevel + rule.nearWater) continue;
        const slope = 1 - this.terrain.normalAt(x, z, tmpN).y;
        if (slope > rule.maxSlope) continue;
        if (rule.forest > 0) {
          const f = fbm(noise, x / 700, z / 700, 3) * 0.5 + 0.5;
          if (f < rule.forest + rand() * 0.15) continue;
        }
        const s = rule.scale[0] + rand() * (rule.scale[1] - rule.scale[0]);
        dummy.position.set(x, h - 0.3 * s, z);
        dummy.rotation.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1);
        dummy.scale.set(s, s * (0.85 + rand() * 0.3), s);
        dummy.updateMatrix();
        const ci = Math.min(CH - 1, Math.floor((x + size / 2) / chunk)), cj = Math.min(CH - 1, Math.floor((z + size / 2) / chunk));
        buckets[cj * CH + ci].push(dummy.matrix.clone());
        placed++;
      }
      buckets.forEach((mats, k) => {
        if (!mats.length) return;
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = this.quality.shadows > 0 && kind !== 'bush';
        im.receiveShadow = this.quality.shadows > 0;
        const cx = -size / 2 + ((k % CH) + 0.5) * chunk, cz = -size / 2 + (Math.floor(k / CH) + 0.5) * chunk;
        this.chunks.push({ mesh: im, center: new THREE.Vector3(cx, 0, cz) });
        this.group.add(im);
      });
    }
  }

  makeMaterial(rule) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
    if (rule.glow) { mat.emissive = new THREE.Color(0xff5a10); mat.emissiveIntensity = 2.2; }
    const U = this.uniforms;
    const sway = rule.sway.toFixed(3);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
float ph = instanceMatrix[3].x * 0.031 + instanceMatrix[3].z * 0.027;
float bend = max(0.0, transformed.y) * ${sway};
transformed.x += sin(uTime * 1.6 + ph) * bend + sin(uTime * 3.7 + ph * 2.0) * bend * 0.3;
transformed.z += cos(uTime * 1.3 + ph) * bend * 0.6;
#endif`);
    };
    mat.customProgramCacheKey = () => 'veg' + sway + (rule.glow ? 'g' : '');
    return mat;
  }

  update(dt, time, camera) {
    this.uniforms.uTime.value = time;
    const far = this.quality.plantDistance;
    for (const c of this.chunks) {
      const dx = c.center.x - camera.position.x, dz = c.center.z - camera.position.z;
      c.mesh.visible = Math.hypot(dx, dz) < far + 1100;
    }
  }
}
