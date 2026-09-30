import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * GPU procedural texture baker. Each recipe is a GLSL function evaluated
 * once into a mip-mapped, tileable render target — no image files, and
 * a full material kit bakes in a few milliseconds.
 */
const NOISE = /* glsl */ `
// ---- tileable noise library (period p in lattice cells) ----
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float gnoise(vec2 x, vec2 period) {
  vec2 i = floor(x); vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 g00 = hash22(mod(i, period)) * 2.0 - 1.0;
  vec2 g10 = hash22(mod(i + vec2(1.0, 0.0), period)) * 2.0 - 1.0;
  vec2 g01 = hash22(mod(i + vec2(0.0, 1.0), period)) * 2.0 - 1.0;
  vec2 g11 = hash22(mod(i + vec2(1.0, 1.0), period)) * 2.0 - 1.0;
  float a = dot(g00, f), b = dot(g10, f - vec2(1.0, 0.0));
  float c = dot(g01, f - vec2(0.0, 1.0)), d = dot(g11, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.414;
}
float fbm(vec2 uv, float freq, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * gnoise(uv * freq, vec2(freq)); n += a;
    freq *= 2.0; a *= 0.5;
  }
  return s / n;
}
float ridged(vec2 uv, float freq, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(gnoise(uv * freq, vec2(freq)));
    s += a * r * r; n += a;
    freq *= 2.0; a *= 0.5;
  }
  return s / n;
}
// Tileable Worley: returns (F1, F2, cell id hash)
vec3 worley(vec2 uv, float cells) {
  vec2 x = uv * cells; vec2 i = floor(x); vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    vec2 o = vec2(float(xx), float(y));
    vec2 c = mod(i + o, vec2(cells));
    vec2 p = o + hash22(c) - f;
    float d = dot(p, p);
    if (d < f1) { f2 = f1; f1 = d; id = hash12(c); } else if (d < f2) f2 = d;
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
`;

const HEADER = /* glsl */ `
varying vec2 vUv;
uniform vec2 uTexel;
uniform float uSeed;
${NOISE}
`;

export class TextureBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new FullScreenQuad(null);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.cache = new Map();
  }

  /**
   * body defines `vec4 bake(vec2 uv)`; for normal maps also `float height(vec2 uv)`.
   * kind: 'color' (sRGB), 'data' (linear), 'normal' (tangent-space from height()).
   */
  bake(name, body, { size = 512, kind = 'color', strength = 2.0, seed = 1, mipmaps = true, alpha = false, wrap = THREE.RepeatWrapping } = {}) {
    if (this.cache.has(name)) return this.cache.get(name);
    const rt = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: false,
      generateMipmaps: mipmaps,
      minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: wrap,
      wrapT: wrap,
      colorSpace: kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    });
    rt.texture.anisotropy = this.anisotropy;
    rt.texture.name = name;
    const main =
      kind === 'normal'
        ? /* glsl */ `
          uniform float uStrength;
          void main() {
            float h = height(vUv);
            float hx = height(vUv + vec2(uTexel.x, 0.0));
            float hy = height(vUv + vec2(0.0, uTexel.y));
            vec3 n = normalize(vec3((h - hx) * uStrength, (h - hy) * uStrength, 1.0));
            gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
          }`
        : /* glsl */ `void main() { vec4 c = bake(vUv); gl_FragColor = ${alpha ? 'c' : 'vec4(c.rgb, 1.0)'}; }`;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTexel: { value: new THREE.Vector2(1 / size, 1 / size) }, uSeed: { value: seed }, uStrength: { value: strength * size * 0.02 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: HEADER + body + main,
      depthTest: false,
      depthWrite: false,
      transparent: alpha,
      blending: THREE.NoBlending,
    });
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = mat;
    r.setRenderTarget(rt);
    this.quad.render(r);
    r.setRenderTarget(prev);
    mat.dispose();
    this.cache.set(name, rt.texture);
    return rt.texture;
  }
}

// ---------------------------------------------------------------- recipes
// Every recipe is tileable on [0,1]² so textures repeat seamlessly.

export const RECIPES = {
  grass: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = fbm(uv, 4.0, 6);
      float m = fbm(uv + 3.7, 2.0, 4);
      // Tufts and blades with no single direction (aligned streaks shimmer into stripes at a distance).
      float blades = (gnoise(uv * 128.0, vec2(128.0)) * 0.45 + gnoise(uv * 56.0 + 2.3, vec2(56.0)) * 0.35 + gnoise(vec2(uv.x + uv.y, uv.x - uv.y) * 90.0, vec2(90.0)) * 0.2) * 0.5 + 0.5;
      vec3 a = vec3(0.10, 0.20, 0.045);
      vec3 b = vec3(0.21, 0.30, 0.07);
      vec3 dry = vec3(0.36, 0.33, 0.14);
      vec3 c = mix(a, b, smoothstep(-0.4, 0.5, n));
      c = mix(c, dry, smoothstep(0.15, 0.55, m) * 0.55);
      c *= 0.82 + blades * 0.3;
      float soil = smoothstep(0.55, 0.8, fbm(uv + 9.1, 16.0, 3) * 0.5 + 0.5);
      c = mix(c, vec3(0.16, 0.12, 0.08), soil * 0.5);
      return vec4(c, 1.0);
    }`,
  grassNormal: /* glsl */ `
    float height(vec2 uv) {
      return gnoise(uv * 110.0, vec2(110.0)) * 0.16 + gnoise(uv * 48.0 + 1.9, vec2(48.0)) * 0.18 + fbm(uv, 16.0, 4) * 0.66;
    }`,
  rock: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = fbm(uv, 4.0, 7);
      float strata = sin((uv.y + n * 0.18) * 6.2831 * 9.0) * 0.5 + 0.5;
      float cr = ridged(uv, 6.0, 5);
      vec3 base = mix(vec3(0.24, 0.22, 0.2), vec3(0.42, 0.39, 0.35), smoothstep(-0.5, 0.6, n));
      base = mix(base, base * vec3(1.08, 0.98, 0.88), strata * 0.35);
      base *= mix(0.55, 1.0, smoothstep(0.45, 0.85, cr));
      float lichen = smoothstep(0.35, 0.7, fbm(uv + 11.0, 8.0, 4));
      base = mix(base, vec3(0.3, 0.33, 0.18), lichen * 0.25);
      return vec4(base, 1.0);
    }`,
  rockNormal: /* glsl */ `
    float height(vec2 uv) {
      float n = fbm(uv, 4.0, 7);
      float cr = ridged(uv, 6.0, 5);
      return n * 0.6 + cr * 0.5 + sin((uv.y + n * 0.18) * 6.2831 * 9.0) * 0.08;
    }`,
  sand: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = fbm(uv, 8.0, 6);
      float grain = hash12(floor(uv * 512.0));
      vec3 c = mix(vec3(0.55, 0.47, 0.33), vec3(0.72, 0.63, 0.46), smoothstep(-0.5, 0.5, n));
      c *= 0.9 + grain * 0.18;
      return vec4(c, 1.0);
    }`,
  sandNormal: /* glsl */ `
    float height(vec2 uv) {
      // Wind ripples: irregular, forking, fading in and out — and fine grain.
      float w = fbm(uv, 2.0, 4);
      float amp = smoothstep(-0.4, 0.5, fbm(uv + 7.3, 3.0, 3));
      float r = sin((uv.x + uv.y * 0.3 + w * 0.55) * 6.2831 * 14.0);
      return r * 0.16 * amp + fbm(uv, 32.0, 3) * 0.3;
    }`,
  dirtNormal: /* glsl */ `
    float height(vec2 uv) {
      // Packed earth: clods, small stones, cracks.
      vec3 w = worley(uv, 24.0);
      float pebble = smoothstep(0.26, 0.1, w.x) * step(0.62, w.z) * (0.5 + w.z * 0.5);
      return fbm(uv, 6.0, 6) * 0.55 + pebble * 0.22 + fbm(uv, 40.0, 3) * 0.14;
    }`,
  dirt: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = fbm(uv, 6.0, 6);
      float n2 = fbm(uv + 3.1, 18.0, 4);
      vec3 w = worley(uv, 24.0);
      // Only some cells hold a stone, of varied size and colour; the rest is earth with clods and grit.
      float pebble = smoothstep(0.22, 0.08, w.x * (0.8 + w.z * 0.5)) * step(0.68, w.z);
      vec3 c = mix(vec3(0.19, 0.14, 0.1), vec3(0.33, 0.26, 0.19), smoothstep(-0.5, 0.5, n));
      c *= 0.88 + 0.22 * smoothstep(-0.4, 0.4, n2);
      c *= 0.94 + hash12(floor(uv * 512.0)) * 0.12;
      c = mix(c, vec3(0.4, 0.37, 0.33) * (0.72 + fract(w.z * 7.3) * 0.45), pebble * 0.6);
      return vec4(c, 1.0);
    }`,
  // Stone plaza tiles: albedo / normal / ORM (R=AO, G=roughness, B=metal).
  tiles: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 g = uv * 4.0; vec2 id = floor(g); vec2 f = fract(g);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float grout = smoothstep(0.02, 0.035, edge);
      float tint = hash12(mod(id, 4.0) + uSeed);
      float n = fbm(uv, 8.0, 6);
      vec3 stone = mix(vec3(0.48, 0.46, 0.43), vec3(0.62, 0.6, 0.56), tint);
      stone *= 0.85 + n * 0.25;
      float stain = smoothstep(0.2, 0.7, fbm(uv + tint, 3.0, 4));
      stone = mix(stone, stone * vec3(0.8, 0.78, 0.72), stain * 0.5);
      vec3 c = mix(vec3(0.12, 0.11, 0.1), stone, grout);
      return vec4(c, 1.0);
    }`,
  tilesNormal: /* glsl */ `
    float height(vec2 uv) {
      vec2 f = fract(uv * 4.0);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float bevel = smoothstep(0.015, 0.06, edge);
      return bevel * 0.8 + fbm(uv, 16.0, 5) * 0.12;
    }`,
  tilesORM: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 f = fract(uv * 4.0);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float ao = mix(0.45, 1.0, smoothstep(0.0, 0.07, edge));
      float rough = mix(0.95, 0.62, smoothstep(0.02, 0.035, edge)) + fbm(uv, 12.0, 4) * 0.12;
      float wet = smoothstep(0.35, 0.7, fbm(uv + 5.0, 3.0, 4));
      rough = mix(rough, 0.35, wet * 0.5);
      return vec4(ao, clamp(rough, 0.05, 1.0), 0.0, 1.0);
    }`,
  // Crate planks.
  wood: /* glsl */ `
    vec4 bake(vec2 uv) {
      float plank = floor(uv.y * 5.0);
      float ph = hash12(vec2(plank, 3.0) + uSeed);
      vec2 p = vec2(uv.x * 2.0 + ph * 7.0, fract(uv.y * 5.0));
      float grain = gnoise(vec2(p.x * 3.0, p.y * 40.0 + gnoise(p * vec2(4.0, 2.0), vec2(64.0)) * 3.0), vec2(6.0, 200.0));
      float rings = sin((p.y * 22.0 + grain * 3.0 + fbm(uv, 4.0, 3) * 6.0)) * 0.5 + 0.5;
      vec3 c = mix(vec3(0.33, 0.2, 0.1), vec3(0.55, 0.37, 0.2), rings * 0.6 + ph * 0.4);
      float gap = smoothstep(0.0, 0.04, fract(uv.y * 5.0)) * smoothstep(1.0, 0.96, fract(uv.y * 5.0));
      c *= mix(0.35, 1.0, gap);
      float nail = 0.0;
      for (int i = 0; i < 2; i++) {
        vec2 np = vec2(fract(uv.x * 2.0) - (i == 0 ? 0.08 : 0.92), fract(uv.y * 5.0) - 0.5);
        nail = max(nail, smoothstep(0.03, 0.018, length(np * vec2(2.0, 1.0))));
      }
      c = mix(c, vec3(0.2, 0.2, 0.22), nail);
      return vec4(c, 1.0);
    }`,
  woodNormal: /* glsl */ `
    float height(vec2 uv) {
      vec2 p = vec2(uv.x * 2.0, fract(uv.y * 5.0));
      float gap = smoothstep(0.0, 0.05, p.y) * smoothstep(1.0, 0.95, p.y);
      float grain = gnoise(vec2(uv.x * 6.0, uv.y * 200.0), vec2(6.0, 200.0));
      return gap * 0.9 + grain * 0.05;
    }`,
  woodORM: /* glsl */ `
    vec4 bake(vec2 uv) {
      float gap = smoothstep(0.0, 0.05, fract(uv.y * 5.0)) * smoothstep(1.0, 0.95, fract(uv.y * 5.0));
      float r = 0.72 + fbm(uv, 8.0, 4) * 0.15;
      return vec4(mix(0.5, 1.0, gap), r, 0.0, 1.0);
    }`,
  // Sci-fi / industrial panels for pedestals and machinery.
  panels: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 g = uv * vec2(2.0, 4.0); vec2 id = floor(g); vec2 f = fract(g);
      float t = hash12(mod(id, vec2(2.0, 4.0)) + 17.0);
      float line = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y) * 4.0);
      float seam = smoothstep(0.006, 0.02, line);
      vec3 c = mix(vec3(0.16, 0.17, 0.19), vec3(0.24, 0.25, 0.27), t);
      c *= 0.9 + fbm(uv, 16.0, 4) * 0.12;
      vec2 rv = abs(f - vec2(0.5)) - vec2(0.42, 0.40);
      float rivet = smoothstep(0.02, 0.012, length(max(rv, 0.0) * vec2(2.0, 4.0)));
      c = mix(c * 0.35, c, seam);
      c = mix(c, vec3(0.5), rivet * 0.6);
      return vec4(c, 1.0);
    }`,
  panelsNormal: /* glsl */ `
    float height(vec2 uv) {
      vec2 f = fract(uv * vec2(2.0, 4.0));
      float line = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y) * 4.0);
      return smoothstep(0.004, 0.03, line) + fbm(uv, 24.0, 3) * 0.03;
    }`,
  panelsORM: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 f = fract(uv * vec2(2.0, 4.0));
      float line = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y) * 4.0);
      float scratches = smoothstep(0.75, 0.95, gnoise(vec2(uv.x * 200.0, uv.y * 8.0), vec2(200.0, 8.0)) * 0.5 + 0.5);
      float r = 0.38 + fbm(uv, 10.0, 4) * 0.12 - scratches * 0.2;
      return vec4(mix(0.4, 1.0, smoothstep(0.004, 0.03, line)), clamp(r, 0.08, 1.0), 0.85, 1.0);
    }`,
  bark: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = gnoise(vec2(uv.x * 12.0, uv.y * 3.0 + fbm(uv, 4.0, 3)), vec2(12.0, 3.0));
      float r = ridged(vec2(uv.x * 2.0, uv.y * 0.5), 4.0, 5);
      vec3 c = mix(vec3(0.12, 0.085, 0.06), vec3(0.3, 0.23, 0.17), smoothstep(0.3, 0.9, r));
      c *= 0.85 + n * 0.2;
      return vec4(c, 1.0);
    }`,
  barkNormal: /* glsl */ `
    float height(vec2 uv) { return ridged(vec2(uv.x * 2.0, uv.y * 0.5), 4.0, 5); }`,
  brushed: /* glsl */ `
    vec4 bake(vec2 uv) {
      float s = gnoise(vec2(uv.x * 4.0, uv.y * 512.0), vec2(4.0, 512.0)) * 0.5 + 0.5;
      float s2 = gnoise(vec2(uv.x * 2.0, uv.y * 128.0), vec2(2.0, 128.0)) * 0.5 + 0.5;
      float r = 0.18 + s * 0.12 + s2 * 0.08;
      return vec4(1.0, r, 1.0, 1.0);
    }`,
  waterNormal: /* glsl */ `
    float height(vec2 uv) {
      float h = fbm(uv, 4.0, 5) * 0.6 + fbm(uv + 0.37, 8.0, 5) * 0.4;
      vec3 w = worley(uv, 10.0);
      return h - w.x * 0.25;
    }`,
  // Race asphalt: aggregate, tar seams and wear. Tileable.
  asphalt: /* glsl */ `
    vec4 bake(vec2 uv) {
      float n = fbm(uv, 6.0, 6);
      float g = hash12(floor(uv * 1024.0));
      vec3 w = worley(uv, 48.0);
      float stone = smoothstep(0.26, 0.12, w.x) * (0.4 + w.z * 0.6);
      vec3 c = vec3(0.075, 0.075, 0.08) * (0.85 + n * 0.3);
      c += vec3(0.07) * stone * g;
      float patchy = smoothstep(0.35, 0.75, fbm(uv + 4.0, 3.0, 4));
      c = mix(c, c * vec3(0.72, 0.72, 0.75), patchy * 0.55);
      float crack = smoothstep(0.02, 0.0, abs(ridged(uv, 5.0, 3) - 0.97)) * 0.6;
      c *= 1.0 - crack;
      return vec4(c, 1.0);
    }`,
  asphaltNormal: /* glsl */ `
    float height(vec2 uv) {
      vec3 w = worley(uv, 48.0);
      return smoothstep(0.3, 0.08, w.x) * 0.5 + fbm(uv, 32.0, 3) * 0.25;
    }`,
  curb: /* glsl */ `
    vec4 bake(vec2 uv) {
      float band = step(0.5, fract(uv.y));
      vec3 red = vec3(0.62, 0.035, 0.03);
      vec3 white = vec3(0.78, 0.78, 0.76);
      vec3 c = mix(red, white, band);
      float edge = smoothstep(0.0, 0.04, fract(uv.y)) * smoothstep(1.0, 0.96, fract(uv.y));
      c *= 0.8 + 0.2 * edge;
      c *= 0.9 + fbm(uv, 8.0, 3) * 0.12;
      float wear = smoothstep(0.35, 0.8, fbm(uv + 2.0, 6.0, 4));
      c = mix(c, vec3(0.12), wear * 0.25 * (1.0 - uv.x));
      return vec4(c, 1.0);
    }`,
  // Palm frond (alpha): a long rib with paired leaflets.
  frond: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec4 col = vec4(0.0);
      float rib = smoothstep(0.012, 0.004, abs(uv.x - 0.5)) * step(0.02, uv.y);
      if (rib > 0.0) col = vec4(0.25, 0.3, 0.1, 1.0);
      for (int i = 0; i < 46; i++) {
        float fi = float(i);
        float h = hash12(vec2(fi * 1.3, uSeed + 7.0));
        float t = 0.06 + fi / 46.0 * 0.9;
        float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
        vec2 a = vec2(0.5, t);
        float len = 0.44 * sin(3.1416 * clamp(t * 1.05, 0.0, 1.0)) * (0.8 + h * 0.3);
        vec2 dir = normalize(vec2(side, -0.35 - h * 0.2));
        vec2 b = a + dir * len;
        vec2 pa = uv - a; vec2 ba = b - a;
        float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float d = length(pa - ba * k);
        float wdt = 0.018 * sin(3.1416 * k) + 0.002;
        if (d < wdt) {
          vec3 c1 = mix(vec3(0.12, 0.3, 0.06), vec3(0.34, 0.48, 0.12), h * 0.6 + k * 0.3);
          col = vec4(c1, 1.0);
        }
      }
      return col;
    }`,
  // Foliage cards (alpha): a leafy twig and a pine needle spray.
  leaves: /* glsl */ `
    vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
    vec4 bake(vec2 uv) {
      vec4 col = vec4(0.0);
      // Twig: a gentle S-curve up the card.
      float sx = 0.5 + sin(uv.y * 3.2) * 0.04;
      float twig = smoothstep(0.012, 0.004, abs(uv.x - sx)) * step(0.02, uv.y) * step(uv.y, 0.93);
      if (twig > 0.0) col = vec4(vec3(0.16, 0.11, 0.06), twig);
      for (int i = 0; i < 44; i++) {
        float fi = float(i);
        float h = hash12(vec2(fi * 1.7, uSeed + 3.0));
        float h2 = hash12(vec2(fi * 3.1, uSeed + 9.0));
        float t = 0.08 + fi / 44.0 * 0.86;
        float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
        // Leaves along the twig and on short side shoots.
        float shoot = step(0.55, h2) * side * (0.06 + h * 0.1);
        vec2 base = vec2(0.5 + sin(t * 3.2) * 0.04 + shoot, t + abs(shoot) * 0.4);
        float ang = side * (0.5 + h * 0.7) - 0.1;
        vec2 size = vec2(0.048, 0.11) * (0.75 + h2 * 0.45) * (1.0 - t * 0.3);
        vec2 q = rot(uv - base, ang);
        q.y -= size.y * 0.95;
        vec2 d = q / size;
        // Pointed leaf: ellipse pinched toward both tips.
        float w = 1.0 - d.y * d.y;
        float inside = step(abs(d.x), max(w, 0.0) * (0.85 + 0.15 * cos(d.y * 3.0))) * step(abs(d.y), 1.0);
        if (inside > 0.0) {
          float vein = smoothstep(0.08, 0.0, abs(d.x)) * 0.25 + smoothstep(0.06, 0.0, abs(fract(d.y * 3.0 + abs(d.x) * 2.0) - 0.5) - 0.3) * 0.08;
          vec3 c1 = mix(vec3(0.09, 0.2, 0.04), vec3(0.3, 0.42, 0.1), h);
          c1 = mix(c1, vec3(0.42, 0.44, 0.12), h2 * h2 * 0.5);
          c1 *= 0.75 + 0.35 * (0.5 + 0.5 * d.x * side) - vein;
          c1 *= mix(0.6, 1.0, smoothstep(-1.0, 0.4, d.y));
          col = vec4(c1, 1.0);
        }
      }
      return col;
    }`,
  needles: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec4 col = vec4(0.0);
      // Soft dark backing so a spray reads as a dense bough, not loose lines.
      float body = smoothstep(0.34, 0.1, abs(uv.x - 0.5) / (0.25 + uv.y * 0.9)) * smoothstep(0.02, 0.12, uv.y) * smoothstep(1.0, 0.8, uv.y);
      float bn = fbm(uv * vec2(3.0, 5.0), 4.0, 3) * 0.5 + 0.5;
      if (body * bn > 0.28) col = vec4(vec3(0.03, 0.085, 0.045) * (0.8 + bn * 0.4), 1.0);
      float twig = smoothstep(0.016, 0.006, abs(uv.x - 0.5)) * step(0.03, uv.y) * step(uv.y, 0.97);
      if (twig > 0.0) col = vec4(0.14, 0.1, 0.06, 1.0);
      for (int i = 0; i < 120; i++) {
        float fi = float(i);
        float h = hash12(vec2(fi * 2.3, uSeed + 1.0));
        float t = 0.04 + fi / 120.0 * 0.92;
        float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
        vec2 a = vec2(0.5 + (h - 0.5) * 0.03, t);
        float len = (0.22 + h * 0.2) * (1.0 - t * 0.4);
        vec2 dir = normalize(vec2(side * (0.7 + h * 0.3), 0.5 + h * 0.4));
        vec2 b = a + dir * len;
        vec2 pa = uv - a; vec2 ba = b - a;
        float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float d = length(pa - ba * k);
        if (d < 0.011 * (1.0 - k * 0.55)) {
          vec3 c1 = mix(vec3(0.05, 0.15, 0.07), vec3(0.2, 0.34, 0.14), h * 0.6 + k * 0.4);
          col = vec4(c1, 1.0);
        }
      }
      return col;
    }`,
  // Particle sprites (alpha).
  softDot: /* glsl */ `
    vec4 bake(vec2 uv) { float d = length(uv - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2); return vec4(1.0, 1.0, 1.0, a); }`,
  smoke: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 p = uv - 0.5; float d = length(p) * 2.0;
      float n = fbm(uv + uSeed, 4.0, 6) * 0.5 + 0.5;
      float a = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.9);
      a *= smoothstep(0.1, 0.6, n + 0.2);
      return vec4(vec3(0.75 + n * 0.25), clamp(a, 0.0, 1.0));
    }`,
  // Water spray: a torn, misty body with a fine scatter of droplets (no two particles read as the same disc).
  spray: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 p = uv - 0.5; float d = length(p) * 2.0;
      float n = fbm(uv + uSeed, 4.0, 5) * 0.5 + 0.5;
      float body = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.9);
      float mist = body * smoothstep(0.3, 0.8, n) * 0.62;
      float drops = 0.0;
      for (int i = 0; i < 3; i++) {
        float sc = 22.0 + float(i) * 15.0;
        vec2 g = uv * sc + uSeed * float(i + 1) * 3.1;
        vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float h = fract(sin(dot(id, vec2(12.9898, 78.233)) + float(i) * 7.1) * 43758.5453);
        vec2 o = vec2(fract(h * 13.1), fract(h * 71.7)) - 0.5;
        float r = 0.07 + 0.13 * fract(h * 3.3);
        drops = max(drops, smoothstep(r, r * 0.3, length(f - o * 0.6)) * step(0.55, h) * (0.45 + 0.55 * fract(h * 5.7)));
      }
      drops *= smoothstep(1.0, 0.3, d) * (0.4 + 0.6 * body);
      return vec4(vec3(0.9 + drops * 0.1), clamp(mist + drops * 0.85, 0.0, 1.0));
    }`,
  flame: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 p = uv - 0.5; p.y *= 0.8;
      float n = fbm(uv * vec2(1.0, 0.6) + uSeed, 4.0, 5);
      float d = length(p * vec2(1.4, 1.0) + vec2(0.0, n * 0.12));
      float a = smoothstep(0.5, 0.05, d + n * 0.1);
      return vec4(vec3(1.0), a);
    }`,
  spark: /* glsl */ `
    vec4 bake(vec2 uv) {
      vec2 p = abs(uv - 0.5) * 2.0;
      float core = pow(clamp(1.0 - length(p), 0.0, 1.0), 3.0);
      float star = pow(clamp(1.0 - p.x * 8.0, 0.0, 1.0), 2.0) * pow(clamp(1.0 - p.y, 0.0, 1.0), 2.0)
                 + pow(clamp(1.0 - p.y * 8.0, 0.0, 1.0), 2.0) * pow(clamp(1.0 - p.x, 0.0, 1.0), 2.0);
      return vec4(1.0, 1.0, 1.0, clamp(core + star * 0.6, 0.0, 1.0));
    }`,
};
