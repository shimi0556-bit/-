import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Random, smoothstep, lerp } from '../core/Random.js';

/**
 * Procedural island terrain: continental noise, ridged mountains to the
 * north, beaches, a flattened plaza and winding dirt paths. Produces the
 * render mesh (4-layer splat shader with per-layer detail normals and
 * triplanar cliffs), a splat/height texture pair for water and grass,
 * and a physics heightfield.
 */
export class Terrain {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.size = options.size || 1100;
    this.segments = options.segments || 300;
    this.seed = options.seed || 7;
    // Options let a game reshape the island: `plaza: null` removes the
    // showcase plateau, `paths` replaces the dirt paths, and the hooks below
    // carve roads, repaint the splat map and keep vegetation clear.
    this.plaza = options.plaza === undefined ? { x: 0, z: 0, radius: 30, height: 3.2 } : options.plaza;
    this.heightModifier = options.heightModifier || null; // (x, z, h) => h
    this.splatModifier = options.splatModifier || null; // (x, z, weights, h) => weights
    this.clearance = options.clearance || null; // (x, z) => metres of free space to keep
    // Parametric island (games): when set, height() uses _islandHeight().
    this.island = options.island || null;
    // Biome look: layer tints, snow line, grass roughness.
    this.biome = {
      grassTint: [1, 1, 1],
      sandTint: [1, 1, 1],
      dirtTint: [1, 1, 1],
      rockTint: [1, 1, 1],
      snowLine: 9999,
      snowAmount: 0,
      ...(options.biome || {}),
    };
    const rng = new Random(this.seed);
    this.noise = new SimplexNoise(rng);
    this.paths = options.paths || [
      [
        [0, 30],
        [14, 70],
        [6, 120],
        [30, 170],
        [55, 215],
        [70, 262],
      ],
      [
        [-24, -18],
        [-60, -40],
        [-95, -38],
        [-140, -70],
        [-170, -120],
      ],
      [
        [26, -14],
        [70, -30],
        [110, -12],
        [150, 30],
      ],
    ];
  }

  _fbm(x, z, oct, lac = 2.0, gain = 0.5) {
    let s = 0;
    let a = 1;
    let n = 0;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise.noise(x * f, z * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }

  _ridged(x, z, oct) {
    let s = 0;
    let a = 1;
    let n = 0;
    let f = 1;
    let prev = 1;
    for (let i = 0; i < oct; i++) {
      let r = 1 - Math.abs(this.noise.noise(x * f + 31.7, z * f - 11.3));
      r *= r;
      s += a * r * prev;
      prev = r;
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }

  distanceToPath(x, z) {
    let best = 1e9;
    for (const path of this.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i];
        const [bx, bz] = path[i + 1];
        const vx = bx - ax;
        const vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
        if (d < best) best = d;
      }
    }
    return best;
  }

  /**
   * Parametric island used by games. `island` fields (all optional):
   * radius, stretch [sx, sz], base, hills, ranges [{angle, from, to, weight}],
   * mountainHeight, ridgeFreq, coastRough, volcano {x, z, radius, height,
   * craterRadius, craterDepth}, dunes {angle, height, wavelength},
   * lagoon {inner, outer, depth}.
   */
  _islandHeight(x, z) {
    const I = this.island;
    const R = I.radius || 800;
    const [sx, sz] = I.stretch || [1, 1];
    const warp = this.noise.noise(x * (0.75 / R) + 5.2, z * (0.75 / R) - 3.1);
    const coastN = this.noise.noise(x * (2.6 / R) - 7.7, z * (2.6 / R) + 1.3) * 0.5 + this.noise.noise(x * (6.5 / R), z * (6.5 / R) + 4.4) * 0.22;
    const dist = Math.hypot(x / sx, z / sz) / R + warp * 0.16 + coastN * (I.coastRough ?? 0.12);
    const island = smoothstep(1.02, 0.62, dist);
    const hills = this._fbm(x * 0.0055, z * 0.0055, 5) * (I.hills ?? 9) + this._fbm(x * 0.021, z * 0.021, 3) * 1.4;
    const rf = I.ridgeFreq ?? 0.0035;
    const rid = this._ridged(x * rf, z * rf, 6);
    let mask = 0;
    for (const m of I.ranges || []) {
      const d = (x * Math.cos(m.angle) + z * Math.sin(m.angle)) / R + warp * 0.18;
      mask = Math.max(mask, smoothstep(m.from, m.to, d) * (m.weight ?? 1));
    }
    let h = (I.base ?? 6) + hills + mask * Math.pow(rid, 1.6) * (I.mountainHeight ?? 110) * smoothstep(0.25, 0.7, 1 - dist * 0.85);
    if (I.dunes) {
      const D = I.dunes;
      const a = D.angle || 0;
      const u = x * Math.cos(a) + z * Math.sin(a);
      const n = this._fbm(x * 0.004, z * 0.004, 3);
      const wave = Math.pow(Math.abs(Math.sin((u / (D.wavelength || 90)) * Math.PI + n * 3.0)), 1.6);
      h += wave * (D.height || 8) * (0.6 + 0.4 * this.noise.noise(x * 0.002, z * 0.002));
    }
    if (I.volcano) {
      const V = I.volcano;
      const dv = Math.hypot(x - V.x, z - V.z) / V.radius;
      const ribs = this._ridged(x * 0.012, z * 0.012, 3);
      const cone = Math.pow(Math.max(0, 1 - dv), 1.7) * V.height * (0.88 + ribs * 0.2);
      const crater = smoothstep(V.craterRadius, V.craterRadius * 0.55, dv) * V.craterDepth;
      h += cone - crater;
    }
    const coast = smoothstep(0.62, 0.86, dist);
    h = lerp(h, 1.2 + hills * 0.12, coast * 0.85);
    h = lerp(-26 + hills * 0.5, h, island);
    if (I.lagoon) {
      const L = I.lagoon;
      const l = smoothstep(L.outer, L.inner, dist);
      h = lerp(h, -(L.depth || 4) + hills * 0.08, l);
    }
    if (this.heightModifier) h = this.heightModifier(x, z, h);
    return h;
  }

  /** Analytic height in metres (sea level = 0). */
  height(x, z) {
    if (this.island) return this._islandHeight(x, z);
    const warp = this.noise.noise(x * 0.0017 + 5.2, z * 0.0017 - 3.1);
    const dist = Math.hypot(x * 0.95, z * 1.08) / 430 + warp * 0.2;
    const island = smoothstep(1.02, 0.6, dist);
    const hills = this._fbm(x * 0.0055, z * 0.0055, 5) * 9 + this._fbm(x * 0.021, z * 0.021, 3) * 1.4;
    const rid = this._ridged(x * 0.0042, z * 0.0042, 6);
    const north = smoothstep(-20, -260, z + warp * 90) * smoothstep(0.35, 0.8, 1 - dist * 0.8);
    const west = smoothstep(-40, -300, x + warp * 60) * 0.55;
    const mountains = Math.max(north, west) * Math.pow(rid, 1.6) * 118;
    let h = 5 + hills + mountains;
    // Beach shelf: flatten near the coast so sand reads as a band.
    const coast = smoothstep(0.62, 0.86, dist);
    h = lerp(h, 1.2 + hills * 0.12, coast * 0.85);
    h = lerp(-26 + hills * 0.5, h, island);
    // Plaza plateau.
    let pt = 1;
    if (this.plaza) {
      const pd = Math.hypot(x - this.plaza.x, z - this.plaza.z);
      pt = smoothstep(this.plaza.radius + 2, this.plaza.radius + 46, pd);
      h = lerp(this.plaza.height - 0.05, h, pt);
    }
    // Paths sink slightly into the ground.
    if (this.paths.length) {
      const dp = this.distanceToPath(x, z);
      h -= smoothstep(3.5, 0.5, dp) * 0.18 * pt;
    }
    if (this.heightModifier) h = this.heightModifier(x, z, h);
    return h;
  }

  /** Bilinear sample of the baked height grid (fast, matches the mesh). */
  heightAt(x, z) {
    const n = this.segments;
    const half = this.size / 2;
    const fx = ((x + half) / this.size) * n;
    const fz = ((z + half) / this.size) * n;
    if (fx < 0 || fz < 0 || fx >= n || fz >= n) return this.height(x, z);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const w = n + 1;
    const H = this.heights;
    const h00 = H[iz * w + ix];
    const h10 = H[iz * w + ix + 1];
    const h01 = H[(iz + 1) * w + ix];
    const h11 = H[(iz + 1) * w + ix + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** Splat weights at a point: { sand, dirt, rock, grass }. */
  weightsAt(x, z) {
    const s = this.splatSize;
    const u = Math.min(s - 1, Math.max(0, Math.floor(((x + this.size / 2) / this.size) * s)));
    const v = Math.min(s - 1, Math.max(0, Math.floor(((z + this.size / 2) / this.size) * s)));
    const i = (v * s + u) * 4;
    const d = this.splatData;
    const sand = d[i] / 255;
    const dirt = d[i + 1] / 255;
    const rock = d[i + 2] / 255;
    return { sand, dirt, rock, grass: Math.max(0, 1 - sand - dirt - rock) };
  }

  /** Samples the height grid (enough for heightAt/physics without any rendering). */
  bakeHeights() {
    const n = this.segments;
    const w = n + 1;
    const half = this.size / 2;
    const step = this.size / n;
    this.heights = new Float32Array(w * w);
    for (let iz = 0; iz < w; iz++) {
      for (let ix = 0; ix < w; ix++) this.heights[iz * w + ix] = this.height(-half + ix * step, -half + iz * step);
    }
    return this.heights;
  }

  build(materials) {
    const n = this.segments;
    const w = n + 1;
    const half = this.size / 2;
    const step = this.size / n;
    this.bakeHeights();
    // Global normals from central differences, so tiles share seamless edges.
    const normals = new Float32Array(w * w * 3);
    const H = this.heights;
    const at = (ix, iz) => H[Math.min(n, Math.max(0, iz)) * w + Math.min(n, Math.max(0, ix))];
    for (let iz = 0; iz < w; iz++) {
      for (let ix = 0; ix < w; ix++) {
        const nx = at(ix - 1, iz) - at(ix + 1, iz);
        const nz = at(ix, iz - 1) - at(ix, iz + 1);
        const ny = 2 * step;
        const l = Math.hypot(nx, ny, nz);
        normals.set([nx / l, ny / l, nz / l], (iz * w + ix) * 3);
      }
    }
    this._buildSplat();
    this.material = this._material(materials);

    // Tiles give the camera and the shadow pass something to cull.
    const tiles = 6;
    const per = Math.ceil(n / tiles);
    this.mesh = new THREE.Group();
    this.mesh.name = 'Terrain';
    for (let tz = 0; tz < tiles; tz++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x0 = tx * per;
        const z0 = tz * per;
        const x1 = Math.min(n, x0 + per);
        const z1 = Math.min(n, z0 + per);
        if (x0 >= x1 || z0 >= z1) continue;
        const cw = x1 - x0 + 1;
        const ch = z1 - z0 + 1;
        const pos = new Float32Array(cw * ch * 3);
        const nrm = new Float32Array(cw * ch * 3);
        const uv = new Float32Array(cw * ch * 2);
        let k = 0;
        for (let iz = z0; iz <= z1; iz++) {
          for (let ix = x0; ix <= x1; ix++, k++) {
            const gi = iz * w + ix;
            pos.set([-half + ix * step, H[gi], -half + iz * step], k * 3);
            nrm.set([normals[gi * 3], normals[gi * 3 + 1], normals[gi * 3 + 2]], k * 3);
            uv.set([ix / n, iz / n], k * 2);
          }
        }
        const idx = [];
        for (let z = 0; z < ch - 1; z++) {
          for (let x = 0; x < cw - 1; x++) {
            const a = z * cw + x;
            const b = a + 1;
            const c = a + cw;
            const d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const tile = new THREE.Mesh(geo, this.material);
        tile.name = 'Terrain';
        tile.receiveShadow = true;
        tile.castShadow = true;
        this.mesh.add(tile);
      }
    }
    return this.mesh;
  }

  _buildSplat() {
    const s = 512;
    this.splatSize = s;
    const data = new Uint8Array(s * s * 4);
    const hdata = new Float32Array(s * s);
    const half = this.size / 2;
    const cell = this.size / s;
    const nrm = new THREE.Vector3();
    for (let v = 0; v < s; v++) {
      for (let u = 0; u < s; u++) {
        const x = -half + (u + 0.5) * cell;
        const z = -half + (v + 0.5) * cell;
        const h = this.heightAt(x, z);
        hdata[v * s + u] = h;
        this.normalAt(x, z, nrm);
        const slope = 1 - nrm.y;
        const nz = this.noise.noise(x * 0.03, z * 0.03);
        const nz2 = this.noise.noise(x * 0.11 + 7, z * 0.11 - 3);
        let sand = smoothstep(2.6 + nz * 1.2, 0.9, h);
        let rock = smoothstep(0.16 + nz2 * 0.05, 0.32, slope) + smoothstep(46, 70, h + nz * 12) * 0.8;
        rock = Math.min(1, rock);
        const pd = this.plaza ? Math.hypot(x - this.plaza.x, z - this.plaza.z) : 1e9;
        const path = this.paths.length ? smoothstep(3.2 + nz2 * 0.8, 1.2, this.distanceToPath(x, z)) * (this.plaza ? smoothstep(this.plaza.radius - 1, this.plaza.radius + 2, pd) : 1) : 0;
        const patches = smoothstep(0.45, 0.75, this.noise.noise(x * 0.012 - 4, z * 0.012 + 9)) * 0.55;
        let dirt = Math.max(path, patches * (1 - sand)) * (1 - rock);
        sand *= 1 - rock;
        if (this.splatModifier) ({ sand, dirt, rock } = this.splatModifier(x, z, { sand, dirt, rock }, h));
        const sum = sand + dirt + rock;
        if (sum > 1) {
          sand /= sum;
          dirt /= sum;
          rock /= sum;
        }
        const i = (v * s + u) * 4;
        data[i] = sand * 255;
        data[i + 1] = dirt * 255;
        data[i + 2] = rock * 255;
        data[i + 3] = 255;
      }
    }
    this.splatData = data;
    this.splatTexture = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
    this.splatTexture.magFilter = THREE.LinearFilter;
    this.splatTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.splatTexture.generateMipmaps = true;
    this.splatTexture.needsUpdate = true;
    this.heightTexture = new THREE.DataTexture(hdata, s, s, THREE.RedFormat, THREE.FloatType);
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.needsUpdate = true;
  }

  _material(materials) {
    const T = materials.textures;
    const mat = new THREE.MeshStandardMaterial({ name: 'Terrain', color: 0xffffff, roughness: 0.92, metalness: 0 });
    const uniforms = {
      tSplat: { value: this.splatTexture },
      tGrass: { value: T.grass },
      tGrassN: { value: T.grassNormal },
      tRock: { value: T.rock },
      tRockN: { value: T.rockNormal },
      tSand: { value: T.sand },
      tSandN: { value: T.sandNormal },
      tDirt: { value: T.dirt },
      uSize: { value: this.size },
      uTime: { value: 0 },
      uCaustic: { value: new THREE.Color(1, 1, 1) },
      uTintGrass: { value: new THREE.Vector3(...this.biome.grassTint) },
      uTintSand: { value: new THREE.Vector3(...this.biome.sandTint) },
      uTintDirt: { value: new THREE.Vector3(...this.biome.dirtTint) },
      uTintRock: { value: new THREE.Vector3(...this.biome.rockTint) },
      uSnow: { value: new THREE.Vector2(this.biome.snowLine, this.biome.snowAmount) },
    };
    this.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNrm;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTNrm = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTPos; varying vec3 vTNrm;
          uniform sampler2D tSplat, tGrass, tGrassN, tRock, tRockN, tSand, tSandN, tDirt;
          uniform float uSize; uniform float uTime; uniform vec3 uCaustic;
          uniform vec3 uTintGrass; uniform vec3 uTintSand; uniform vec3 uTintDirt; uniform vec3 uTintRock; uniform vec2 uSnow;
          float tSnow;
          // Animated caustic web (iterated domain warp), sharpened into bright filaments.
          float caustics(vec2 p, float t) {
            vec2 i = p; float c = 1.0; float inten = 0.005;
            for (int n = 0; n < 4; n++) {
              float tt = t * (1.0 - (3.5 / float(n + 1)));
              i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
              c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
            }
            c /= 4.0;
            c = 1.17 - pow(c, 1.4);
            return pow(abs(c), 8.0);
          }
          vec3 tBlendN(vec3 wn, vec3 tn, vec2 dir) { return normalize(vec3(tn.xy + wn.xz, wn.y)); }
          float tWet; vec4 tW; vec3 tTriW;`,
        )
        .replace(
          '#include <map_fragment>',
          `{
            vec2 suv = vTPos.xz / uSize + 0.5;
            vec4 sp = texture2D(tSplat, suv);
            vec2 wuv = vTPos.xz;
            vec3 n = normalize(vTNrm);
            float macro = texture2D(tGrass, wuv * 0.0045).g * 4.0;
            vec3 grass = mix(texture2D(tGrass, wuv * 0.085).rgb, texture2D(tGrass, wuv * 0.017).rgb, 0.45);
            grass *= mix(0.8, 1.2, clamp(macro, 0.0, 1.0));
            vec3 sand = texture2D(tSand, wuv * 0.07).rgb;
            vec3 dirt = texture2D(tDirt, wuv * 0.1).rgb;
            tTriW = pow(abs(n), vec3(4.0)); tTriW /= dot(tTriW, vec3(1.0));
            vec3 rock = texture2D(tRock, vTPos.zy * 0.045).rgb * tTriW.x + texture2D(tRock, vTPos.xz * 0.045).rgb * tTriW.y + texture2D(tRock, vTPos.xy * 0.045).rgb * tTriW.z;
            grass *= uTintGrass; sand *= uTintSand; dirt *= uTintDirt; rock *= uTintRock;
            // Height-aware blending keeps transitions crisp instead of muddy.
            float hg = dot(grass, vec3(0.33)) + 0.2;
            float hs = dot(sand, vec3(0.33));
            float hd = dot(dirt, vec3(0.33)) + 0.1;
            float hr = dot(rock, vec3(0.33)) + 0.1;
            vec4 w = vec4(sp.r, sp.g, sp.b, max(0.0, 1.0 - sp.r - sp.g - sp.b));
            vec4 hh = vec4(hs, hd, hr, hg) + w;
            float ma = max(max(hh.x, hh.y), max(hh.z, hh.w)) - 0.25;
            w = max(hh - ma, 0.0) * step(0.001, w);
            w /= max(dot(w, vec4(1.0)), 1e-4);
            tW = w;
            vec3 col = sand * w.x + dirt * w.y + rock * w.z + grass * w.w;
            // Wet sand band at the waterline.
            tWet = smoothstep(1.1, 0.15, vTPos.y) * w.x;
            col *= mix(1.0, 0.62, tWet);
            // Snow cover: altitude line broken up by noise, sliding off steep faces.
            float sn = texture2D(tGrass, wuv * 0.021).g * 3.0 + texture2D(tRock, wuv * 0.07).r;
            tSnow = uSnow.y * smoothstep(uSnow.x - 5.0, uSnow.x + 5.0, vTPos.y + (sn - 1.0) * 9.0) * smoothstep(0.55, 0.82, n.y) * (1.0 - tWet);
            col = mix(col, vec3(0.86, 0.9, 0.96) * (0.92 + 0.08 * sn), tSnow);
            // Under water: darken, tint, and dance with caustics.
            float under = smoothstep(0.05, -0.6, vTPos.y);
            col *= mix(vec3(1.0), vec3(0.55, 0.72, 0.75), smoothstep(0.0, -3.0, vTPos.y));
            if (under > 0.0) {
              float cz = caustics(vTPos.xz * 0.42, uTime * 0.55);
              col += uCaustic * cz * under * exp(vTPos.y * 0.22) * 0.55;
            }
            diffuseColor.rgb *= col;
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = dot(tW, vec4(0.88, 0.94, 0.82, 0.97));
          roughnessFactor = mix(roughnessFactor, 0.28, tWet);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
            vec3 wn = normalize(vTNrm);
            vec2 wuv = vTPos.xz;
            vec3 gN = texture2D(tGrassN, wuv * 0.085).xyz * 2.0 - 1.0;
            vec3 sN = texture2D(tSandN, wuv * 0.07).xyz * 2.0 - 1.0;
            vec3 rX = texture2D(tRockN, vTPos.zy * 0.045).xyz * 2.0 - 1.0;
            vec3 rY = texture2D(tRockN, vTPos.xz * 0.045).xyz * 2.0 - 1.0;
            vec3 rZ = texture2D(tRockN, vTPos.xy * 0.045).xyz * 2.0 - 1.0;
            rX = vec3(rX.xy + wn.zy, abs(rX.z) * wn.x);
            rY = vec3(rY.xy + wn.xz, abs(rY.z) * wn.y);
            rZ = vec3(rZ.xy + wn.xy, abs(rZ.z) * wn.z);
            vec3 rockN = normalize(rX.zyx * tTriW.x + rY.xzy * tTriW.y + rZ.xyz * tTriW.z);
            vec3 grassN = normalize(vec3(gN.x * 0.6 + wn.x, wn.y, gN.y * 0.6 + wn.z));
            vec3 sandN = normalize(vec3(sN.x * 0.5 + wn.x, wn.y, sN.y * 0.5 + wn.z));
            vec3 wN = normalize(sandN * tW.x + grassN * (tW.y + tW.w) + rockN * tW.z * 1.2);
            wN = normalize(mix(wN, wn, max(tWet * 0.6, tSnow * 0.8)));
            normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'shimotron-terrain-v2';
    return mat;
  }

  addPhysics(physics) {
    this.body = physics.addHeightfield((x, z) => this.heightAt(x, z), this.size, this.segments);
    return this.body;
  }
}
