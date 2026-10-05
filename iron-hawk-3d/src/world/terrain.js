// Height-field terrain: an analytic height function per region, baked into a grid that is
// both the rendered mesh and the collision surface (heightAt follows the same triangles).
import * as THREE from 'three';
import { makeNoise2D, fbm, ridged, smoothstep, lerp, clamp, mulberry32 } from '../core/util.js';
import { getSurfaceTexture } from '../core/textures.js';

const SHAPES = {
  valley(n1, n2, x, z, size) {
    const r = Math.hypot(x, z) / (size * 0.5);
    const ring = smoothstep(0.42, 0.98, r);
    let h = 28 + fbm(n1, x / 950, z / 950, 5) * 42;
    const inner = smoothstep(0.1, 0.55, fbm(n2, x / 2600 + 7, z / 2600 - 3, 3));
    const rid = ridged(n1, x / 1500 + 3.1, z / 1500 - 1.7, 6);
    h += rid * rid * 620 * Math.max(ring, inner * 0.8);
    h += ring * 170 + fbm(n2, x / 300, z / 300, 3) * 6;
    // the lake
    const lx = 900, lz = -650;
    const dl = Math.hypot(x - lx, z - lz) / 780 + fbm(n2, x / 420, z / 420, 3) * 0.3;
    const lake = 1 - smoothstep(0.55, 1.08, dl);
    h = lerp(h, -24, lake);
    // a river winding from the lake to the east
    if (x > lx - 200) {
      const cz = lz + Math.sin((x - lx) / 620) * 340 + Math.sin((x - lx) / 230) * 50;
      const w = 34 + 14 * Math.sin(x / 400);
      const d = Math.abs(z - cz);
      const river = (1 - smoothstep(w, w * 3.2, d)) * smoothstep(lx - 200, lx + 300, x);
      h = lerp(h, Math.min(h, -5), river);
    }
    return h;
  },
  canyon(n1, n2, x, z, size) {
    const r = Math.hypot(x, z) / (size * 0.5);
    const ring = smoothstep(0.55, 1.0, r);
    const plateau = fbm(n1, x / 1700, z / 1700, 4) * 0.5 + 0.5;
    let base = 50 + plateau * 300;
    const step = 62;
    const k = Math.floor(base / step), f = base / step - k;
    base = (k + smoothstep(0.72, 0.98, f)) * step + fbm(n2, x / 260, z / 260, 3) * 7;
    const c = ridged(n2, x / 2300 + 11, z / 2300 - 4, 4);
    const canyon = smoothstep(0.42, 0.66, c);
    const floor = 6 + fbm(n1, x / 500, z / 500, 3) * 8;
    let h = lerp(base, floor, canyon);
    h += ring * 320 + ring * ridged(n1, x / 900, z / 900, 4) * 160;
    return h;
  },
  volcano(n1, n2, x, z, size) {
    const r = Math.hypot(x, z) / (size * 0.5);
    const ring = smoothstep(0.55, 1.0, r);
    let h = 34 + fbm(n1, x / 700, z / 700, 5) * 30 + ridged(n2, x / 1100, z / 1100, 5) * 140;
    const vx = -1500, vz = -1400;
    const dv = Math.hypot(x - vx, z - vz);
    let cone = 1050 * Math.exp(-Math.pow(dv / 1250, 1.45));
    cone *= 1 + fbm(n1, Math.atan2(z - vz, x - vx) * 3, dv / 300, 3) * 0.12;
    if (dv < 300) cone -= (1 - (dv / 300) ** 2) * 260;
    h = Math.max(h, cone) + ring * 260 + ring * ridged(n1, x / 900, z / 900, 4) * 160;
    // the burning lake where the boss lives
    const lx = 650, lz = 900;
    const dl = Math.hypot(x - lx, z - lz) / 620 + fbm(n2, x / 300, z / 300, 3) * 0.25;
    const lake = 1 - smoothstep(0.6, 1.1, dl);
    h = lerp(h, -12, lake);
    // lava rivers running from the volcano to the lake and beyond
    const t = clamp(((x - vx) * (lx - vx) + (z - vz) * (lz - vz)) / ((lx - vx) ** 2 + (lz - vz) ** 2), 0, 1.6);
    const px = vx + (lx - vx) * t + Math.sin(t * 9) * 220, pz = vz + (lz - vz) * t + Math.cos(t * 7) * 160;
    const d = Math.hypot(x - px, z - pz);
    const river = (1 - smoothstep(30, 110, d)) * smoothstep(0.08, 0.2, t);
    h = lerp(h, Math.min(h, 1), river);
    return h;
  },
};

export class Terrain {
  constructor(level, quality) {
    this.level = level;
    this.size = level.terrain.size;
    this.waterLevel = level.terrain.water;
    this.segments = quality.terrainSegments;
    this.n1 = makeNoise2D(level.seed);
    this.n2 = makeNoise2D(level.seed * 7 + 3);
    this.shape = SHAPES[level.terrain.type];
    this.group = new THREE.Group();
  }

  rawHeight(x, z) { return this.shape(this.n1, this.n2, x, z, this.size); }

  build() {
    const seg = this.segments, size = this.size;
    const n = seg + 1;
    this.step = size / seg;
    this.half = size / 2;
    const heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      const z = -this.half + iz * this.step;
      for (let ix = 0; ix < n; ix++) heights[iz * n + ix] = this.rawHeight(-this.half + ix * this.step, z);
    }
    this.heights = heights;
    this.n = n;
    this.mesh = new THREE.Mesh(this.gridGeometry(seg, size, (x, z, ix, iz) => heights[iz * n + ix]), null);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    // a coarse outer apron so the horizon never ends at an edge
    const outerSize = size * 3.2, outerSeg = 96;
    const outer = this.gridGeometry(outerSeg, outerSize, (x, z) => {
      const m = Math.max(Math.abs(x), Math.abs(z));
      const sink = 1 - smoothstep(this.half * 0.9, this.half * 0.995, m);
      return this.rawHeight(x, z) - sink * 60 + smoothstep(this.half, outerSize / 2, m) * 500;
    });
    this.outer = new THREE.Mesh(outer, null);
    this.group.add(this.outer);
  }

  gridGeometry(seg, size, heightFn) {
    const n = seg + 1, half = size / 2, step = size / seg;
    const pos = new Float32Array(n * n * 3);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const x = -half + ix * step, z = -half + iz * step;
      const i = (iz * n + ix) * 3;
      pos[i] = x; pos[i + 1] = heightFn(x, z, ix, iz); pos[i + 2] = z;
    }
    const idx = new Uint32Array(seg * seg * 6);
    let k = 0;
    for (let iz = 0; iz < seg; iz++) for (let ix = 0; ix < seg; ix++) {
      const a = iz * n + ix, b = (iz + 1) * n + ix, c = (iz + 1) * n + ix + 1, d = iz * n + ix + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  // Exact height of the rendered triangles (matches gridGeometry's diagonal split).
  heightAt(x, z) {
    const fxAll = (x + this.half) / this.step, fzAll = (z + this.half) / this.step;
    if (fxAll < 0 || fzAll < 0 || fxAll >= this.n - 1 || fzAll >= this.n - 1) return this.rawHeight(x, z);
    const ix = Math.floor(fxAll), iz = Math.floor(fzAll);
    const fx = fxAll - ix, fz = fzAll - iz;
    const n = this.n, H = this.heights;
    const h00 = H[iz * n + ix], h10 = H[iz * n + ix + 1], h01 = H[(iz + 1) * n + ix], h11 = H[(iz + 1) * n + ix + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.step * 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  groundOrWater(x, z) { return Math.max(this.heightAt(x, z), this.waterLevel); }

  // A spawn point on dry, fairly flat land within the play radius.
  findLandPoint(rand, { minR = 0, maxR = 3000, maxSlope = 0.35, minHeightAboveWater = 2, near = null, nearR = 400 } = {}) {
    const tmp = new THREE.Vector3();
    for (let tries = 0; tries < 200; tries++) {
      let x, z;
      if (near) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * nearR;
        x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d;
      } else {
        const a = rand() * Math.PI * 2, d = minR + Math.sqrt(rand()) * (maxR - minR);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
      }
      const h = this.heightAt(x, z);
      if (h < this.waterLevel + minHeightAboveWater) continue;
      if (1 - this.normalAt(x, z, tmp).y > maxSlope) continue;
      return new THREE.Vector3(x, h, z);
    }
    return new THREE.Vector3(0, this.heightAt(0, 0), 0);
  }

  async createMaterial(renderer, sunDir) {
    const L = this.level.layers;
    const [tBase, tPatch, tRock, tShore] = await Promise.all([
      getSurfaceTexture(L.base.tex, renderer), getSurfaceTexture(L.patch.tex, renderer),
      getSurfaceTexture(L.rock.tex, renderer), getSurfaceTexture(L.shore.tex, renderer)]);
    const noiseTex = makeMacroNoise();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0.0, color: 0xffffff });
    const lava = this.level.water === 'lava';
    const uniforms = {
      tBase: { value: tBase }, tPatch: { value: tPatch }, tRock: { value: tRock }, tShore: { value: tShore }, tNoise: { value: noiseTex },
      uScale: { value: new THREE.Vector4(L.base.scale, L.patch.scale, L.rock.scale, L.shore.scale) },
      cBase: { value: new THREE.Vector3(...L.base.tint) }, cPatch: { value: new THREE.Vector3(...L.patch.tint) },
      cRock: { value: new THREE.Vector3(...L.rock.tint) }, cShore: { value: new THREE.Vector3(...L.shore.tint) },
      uWater: { value: this.waterLevel }, uSnow: { value: this.level.snowLine }, uLava: { value: lava ? 1 : 0 },
      uTime: { value: 0 },
    };
    this.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D tBase, tPatch, tRock, tShore, tNoise;
uniform vec4 uScale; uniform vec3 cBase, cPatch, cRock, cShore;
uniform float uWater, uSnow, uLava, uTime;
vec3 twoScale(sampler2D t, vec2 p, float s, float m) {
  vec3 a = texture2D(t, p / s).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p / (s * 4.3) + 0.37;
  vec3 b = texture2D(t, q).rgb;
  return mix(a, b, 0.3 + 0.35 * m);
}
vec3 triRock(vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 x = texture2D(tRock, p.zy / s).rgb, y = texture2D(tRock, p.xz / s).rgb, z = texture2D(tRock, p.xy / s).rgb;
  return x * w.x + y * w.y + z * w.z;
}
`)
        .replace('#include <map_fragment>', `
vec3 N = normalize(vWNrm);
float slope = 1.0 - N.y;
vec3 nz = texture2D(tNoise, vWPos.xz / 1100.0).rgb;
vec3 nz2 = texture2D(tNoise, vWPos.xz / 230.0 + 0.5).rgb;
float h = vWPos.y + (nz2.r - 0.5) * 6.0;
vec3 base = twoScale(tBase, vWPos.xz, uScale.x, nz.g) * cBase;
vec3 patchC = twoScale(tPatch, vWPos.xz, uScale.y, nz.b) * cPatch;
vec3 shore = twoScale(tShore, vWPos.xz, uScale.w, nz.r) * cShore;
vec3 rock = triRock(vWPos, N, uScale.z) * cRock;
float wPatch = smoothstep(0.52, 0.72, nz.r * 0.7 + nz2.g * 0.45);
float wShore = 1.0 - smoothstep(uWater + 1.5, uWater + 7.0, h);
float wRock = smoothstep(0.28, 0.5, slope + (nz2.b - 0.5) * 0.22);
float wSnow = smoothstep(uSnow, uSnow + 90.0, h + (nz.g - 0.5) * 120.0) * (1.0 - smoothstep(0.45, 0.75, slope));
vec3 col = mix(base, patchC, wPatch);
col = mix(col, shore, wShore);
col = mix(col, rock, wRock);
col = mix(col, vec3(0.92, 0.94, 0.98), wSnow);
col *= mix(0.78, 1.18, nz.g) * mix(0.92, 1.06, nz2.r);
diffuseColor.rgb *= col;
`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.95, 0.82, wRock) - wSnow * 0.35 - wShore * 0.1;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uLava > 0.5) {
  float glow = 1.0 - smoothstep(uWater - 2.0, uWater + 16.0, vWPos.y);
  float flick = 0.75 + 0.25 * sin(uTime * 2.0 + vWPos.x * 0.03 + vWPos.z * 0.02);
  totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * glow * glow * 2.2 * flick;
}`);
    };
    mat.customProgramCacheKey = () => 'terrain-splat';
    this.mesh.material = mat;
    this.outer.material = mat;
    return mat;
  }

  update(dt, time) { if (this.uniforms) this.uniforms.uTime.value = time; }
}

// RGB low-frequency tileable noise used to break up texture repetition.
function makeMacroNoise() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const chans = [7, 19, 31].map((s) => {
    const rand = mulberry32(s);
    const P = 8, grid = new Float32Array(P * P * 64);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    return (u, v) => {
      let sum = 0, amp = 0.5, norm = 0;
      for (let o = 0; o < 4; o++) {
        const p = P << o, x = u * p, y = v * p;
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const g0 = (a, b) => grid[((b % p) * p + (a % p)) % grid.length];
        const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
        const v0 = g0(xi, yi) + (g0(xi + 1, yi) - g0(xi, yi)) * sx;
        const v1 = g0(xi, yi + 1) + (g0(xi + 1, yi + 1) - g0(xi, yi + 1)) * sx;
        sum += (v0 + (v1 - v0) * sy) * amp; norm += amp; amp *= 0.5;
      }
      return sum / norm;
    };
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) img.data[i + k] = clamp((chans[k](x / size, y / size) - 0.5) * 2.2 + 0.5, 0, 1) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
