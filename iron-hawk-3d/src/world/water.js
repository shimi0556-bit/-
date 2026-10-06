// Water (lake and river) and lava surfaces. Both read a baked depth map of the terrain so
// shallow water turns turquoise with foam at the shore, and lava glows hottest in the middle.
import * as THREE from 'three';
import { getSurfaceTexture } from '../core/textures.js';
import { mulberry32 } from '../core/util.js';

function depthTexture(terrain, range) {
  const n = 256, size = terrain.size;
  const data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -size / 2 + (i + 0.5) / n * size, z = -size / 2 + (j + 0.5) / n * size;
    const d = (terrain.waterLevel - terrain.heightAt(x, z)) / range;
    data[j * n + i] = Math.max(0, Math.min(255, Math.round(d * 255)));
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function waveNormalTexture() {
  // tileable height noise turned into a normal map
  const n = 256, rand = mulberry32(5), P = 16;
  const grid = new Float32Array(P * P).map(() => rand());
  const hgt = new Float32Array(n * n);
  const val = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const g = (a, b) => grid[((b % p + p) % p) * P + ((a % p + p) % p)];
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx, b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, amp = 1;
    for (const p of [4, 8, 16]) { s += val(x / n * p, y / n * p, p) * amp; amp *= 0.5; }
    hgt[y * n + x] = s;
  }
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = hgt[y * n + (x + 1) % n] - hgt[y * n + (x - 1 + n) % n];
    const hy = hgt[((y + 1) % n) * n + x] - hgt[((y - 1 + n) % n) * n + x];
    const v = new THREE.Vector3(-hx * 6, -hy * 6, 1).normalize();
    const i = (y * n + x) * 4;
    data[i] = (v.x * 0.5 + 0.5) * 255; data[i + 1] = (v.y * 0.5 + 0.5) * 255; data[i + 2] = (v.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class Liquid {
  constructor(terrain, kind) {
    this.kind = kind;
    this.terrain = terrain;
    this.level = terrain.waterLevel;
    this.uniforms = { uTime: { value: 0 } };
  }

  async build(renderer) {
    const size = this.terrain.size;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const range = this.kind === 'lava' ? 20 : 30;
    const depth = depthTexture(this.terrain, range);
    const U = this.uniforms;
    U.tDepth = { value: depth };
    U.uSize = { value: size };
    let mat;
    if (this.kind === 'lava') {
      const lavaTex = await getSurfaceTexture('tex_lava', renderer);
      U.tLava = { value: lavaTex };
      mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.75, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform sampler2D tDepth, tLava; uniform float uTime, uSize;`)
          .replace('#include <map_fragment>', `
float dep = texture2D(tDepth, vWP.xz / uSize + 0.5).r;
vec2 flow = vec2(uTime * 0.6, uTime * 0.35);
vec3 l1 = texture2D(tLava, (vWP.xz + flow) / 70.0).rgb;
vec3 l2 = texture2D(tLava, (vWP.zx * vec2(1.0, -1.0) - flow * 0.7) / 160.0).rgb;
vec3 lava = max(l1, l2 * 0.9);
float heat = smoothstep(0.0, 0.6, dep) * (0.6 + 0.4 * sin(uTime * 1.3 + vWP.x * 0.01));
// thin dark crust floats on the hot middle; the edges are mostly crust
float crust = (1.0 - smoothstep(0.22, 0.6, max(lava.r, lava.g))) * (1.0 - 0.45 * smoothstep(0.1, 0.7, dep));
diffuseColor.rgb = mix(vec3(0.05, 0.03, 0.03), vec3(0.2, 0.08, 0.03), 1.0 - crust);`)
          .replace('#include <emissivemap_fragment>', `
totalEmissiveRadiance = pow(lava, vec3(1.4)) * vec3(2.7, 1.25, 0.4) * (0.55 + 0.5 * heat) * (1.0 - crust * 0.9);
totalEmissiveRadiance += vec3(0.5, 0.11, 0.02) * (0.2 + 0.6 * heat) * (1.0 - crust * 0.7);`);
      };
      mat.customProgramCacheKey = () => 'lava';
    } else {
      U.tWave = { value: waveNormalTexture() };
      mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0.0, transparent: true });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform sampler2D tDepth, tWave; uniform float uTime, uSize;`)
          .replace('#include <map_fragment>', `
float dep = texture2D(tDepth, vWP.xz / uSize + 0.5).r;
vec3 shallow = vec3(0.10, 0.42, 0.40), deep = vec3(0.010, 0.05, 0.09);
diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 0.45, dep)) * 0.6;
float foamN = texture2D(tWave, vWP.xz / 23.0 + uTime * 0.02).r;
float foam = (1.0 - smoothstep(0.0, 0.05, dep)) * smoothstep(0.35, 0.7, foamN + 0.25 * sin(uTime * 2.0 + dep * 60.0));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), foam * 0.8);
diffuseColor.a = mix(0.55, 0.96, smoothstep(0.0, 0.12, dep));`)
          .replace('#include <normal_fragment_maps>', `
vec3 w1 = texture2D(tWave, vWP.xz / 61.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
vec3 w2 = texture2D(tWave, vWP.xz / 17.0 - vec2(uTime * 0.021, -uTime * 0.016)).xyz * 2.0 - 1.0;
vec3 wn = normalize(vec3(w1.xy * 0.7 + w2.xy * 0.45, 1.0));
normal = normalize((viewMatrix * vec4(wn.x, wn.z, wn.y, 0.0)).xyz);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.05, 0.6, foam);');
      };
      mat.customProgramCacheKey = () => 'water';
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = this.level;
    this.mesh.receiveShadow = this.kind !== 'lava';
    this.mesh.renderOrder = 1;
    return this.mesh;
  }

  update(dt, time) { this.uniforms.uTime.value = time; }
}
