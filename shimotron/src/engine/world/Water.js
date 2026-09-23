import * as THREE from 'three';

/** Four Gerstner waves: direction (deg), wavelength (m), steepness, amplitude scale. */
const WAVES = [
  [18, 38, 0.1, 1.0],
  [58, 21, 0.09, 0.8],
  [-24, 13, 0.08, 0.6],
  [95, 7.5, 0.07, 0.45],
];

/**
 * The same Gerstner sum on the CPU: water height and surface slope at
 * (x, z), so boats, buoys and swimmers ride the waves the shader draws.
 */
export function waveAt(x, z, time, amp = 1, out = { y: 0, dx: 0, dz: 0 }, depth = 40) {
  out.y = 0;
  out.dx = 0;
  out.dz = 0;
  const swell = deepSwell(depth);
  for (let i = 0; i < WAVES.length; i++) {
    const [deg, len, steep, scale0] = WAVES[i];
    const scale = scale0 * (1 + swell * SWELL[i]) * shallowDamp(depth);
    const a0 = (deg * Math.PI) / 180;
    const k = (2 * Math.PI) / len;
    const c = Math.sqrt(9.81 / k);
    const dx = Math.cos(a0);
    const dz = Math.sin(a0);
    const f = k * (dx * x + dz * z - c * time);
    const a = (steep / k) * scale * amp;
    out.y += a * Math.sin(f);
    const slope = a * k * Math.cos(f);
    out.dx += dx * slope;
    out.dz += dz * slope;
  }
  return out;
}

/** How much each wave grows over deep water (the long swell most, the chop hardly). */
const SWELL = [1.7, 1.1, 0.45, 0.15];
/** 0 in the shallows → 1 over open, deep water (sea floor more than ~40 m down). */
function deepSwell(depth) {
  const t = Math.min(1, Math.max(0, (depth - 10) / 32));
  return t * t * (3 - 2 * t);
}
/** Waves die down over the shallows (same curve as the shader). */
function shallowDamp(depth) {
  const t = Math.min(1, Math.max(0, depth / 5));
  return t * t * (3 - 2 * t) * 0.85 + 0.15;
}

const DEEP = new THREE.DataTexture(new Float32Array([-40]), 1, 1, THREE.RedFormat, THREE.FloatType);
DEEP.needsUpdate = true;

/** Sea floor height under a point: the island's own height map, else the world map, else deep sea. */
const FLOOR = /* glsl */ `
uniform sampler2D tHeight; uniform sampler2D tWorld; uniform float uTerrainSize; uniform vec2 uWorldOffset; uniform float uWorldSize; uniform float uLocal;
float seaFloor(vec2 p) {
  vec2 huv = p / uTerrainSize + 0.5;
  if (uLocal > 0.5 && huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) return texture2D(tHeight, huv).r;
  vec2 wuv = (p + uWorldOffset) / uWorldSize + 0.5;
  if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) return texture2D(tWorld, wuv).r;
  return -40.0;
}`;

const GERSTNER = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[4];
uniform float uWaveAmp;
uniform vec4 uSwell;
// Returns displacement; accumulates the analytic normal terms. deep: 0..1 open-water swell.
vec3 gerstner(vec2 p, float damp, float deep, inout vec3 tang, inout vec3 bin) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.y;
    float c = sqrt(9.81 / k);
    vec2 dir = vec2(cos(w.x), sin(w.x));
    float f = k * (dot(dir, p) - c * uTime);
    float a = (w.z / k) * w.w * uWaveAmp * damp * (1.0 + deep * uSwell[i]);
    float s = sin(f); float co = cos(f);
    d += vec3(dir.x * a * co, a * s, dir.y * a * co);
    tang += vec3(-dir.x * dir.x * a * k * s, dir.x * a * k * co, -dir.x * dir.y * a * k * s);
    bin += vec3(-dir.x * dir.y * a * k * s, dir.y * a * k * co, -dir.y * dir.y * a * k * s);
  }
  return d;
}`;

/**
 * Ocean: a camera-following radial grid with Gerstner displacement,
 * per-pixel analytic wave normals plus two scrolling detail normals,
 * depth-based absorption from the terrain height map, shoreline and
 * crest foam, sun-lit subsurface scattering, and simple buoyancy.
 */
export class Water {
  constructor(engine, terrain, materials) {
    this.engine = engine;
    this.terrain = terrain;
    this.level = 0;
    this.waveAmp = 1;
    this.uniforms = {
      uTime: { value: 0 },
      uWaves: { value: WAVES.map(([deg, len, steep, amp]) => new THREE.Vector4(THREE.MathUtils.degToRad(deg), len, steep, amp)) },
      uWaveAmp: { value: 1 },
      uSwell: { value: new THREE.Vector4(...SWELL) },
      tHeight: { value: terrain.heightTexture },
      tNormal: { value: materials.textures.waterNormal },
      uTerrainSize: { value: terrain.size },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color(0.05, 0.42, 0.42) },
      uDeep: { value: new THREE.Color(0.004, 0.028, 0.055) },
      uClarity: { value: 0.9 }, // how fast the water turns opaque with depth (lower = clearer)
      // Beyond the island in play: a coarse depth map of the whole world (1×1 "deep sea" until one is set).
      tWorld: { value: DEEP },
      uWorldOffset: { value: new THREE.Vector2() },
      uWorldSize: { value: 1 },
      uLocal: { value: 1 },
    };
    this.mesh = new THREE.Mesh(this._geometry(engine.quality.settings.waterDetail), this._material());
    this.mesh.name = 'Ocean';
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.noPick = true;
    engine.scene.add(this.mesh);
    engine.events.on('quality', (s) => {
      this.mesh.geometry.dispose();
      this.mesh.geometry = this._geometry(s.waterDetail);
    });
    this.floaters = new Set();
  }

  _geometry(detail) {
    const rings = Math.round(110 * detail) + 20;
    const segs = Math.round(150 * detail) + 32;
    const maxR = 4800;
    const radii = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      radii.push(0.55 * i * (130 / rings) + maxR * Math.pow(t, 3.3));
    }
    const pos = [];
    const idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i <= rings; i++) {
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let i = 1; i < rings; i++) {
      const r0 = 1 + (i - 1) * segs;
      const r1 = 1 + i * segs;
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        idx.push(r0 + s, r0 + s1, r1 + s);
        idx.push(r0 + s1, r1 + s1, r1 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    return g;
  }

  _material() {
    const mat = new THREE.MeshPhysicalMaterial({
      name: 'Water',
      color: 0xffffff,
      roughness: 0.035,
      metalness: 0,
      ior: 1.333,
      transparent: true,
      depthWrite: true,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide, // submarines see the surface from below
    });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          ${GERSTNER}
          ${FLOOR}
          varying vec3 vWPos; varying float vDepth; varying float vCrest;`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
          float th = seaFloor(wp0.xz);
          float depth = max(0.0, -th);
          float damp = smoothstep(0.0, 5.0, depth) * 0.85 + 0.15;
          float fade = 1.0 - smoothstep(600.0, 2200.0, length(wp0.xz - cameraPosition.xz));
          vec3 tg = vec3(1.0, 0.0, 0.0); vec3 bn = vec3(0.0, 0.0, 1.0);
          vec3 disp = gerstner(wp0.xz, damp * fade, smoothstep(10.0, 42.0, depth), tg, bn);
          transformed += disp;
          vDepth = depth;
          vCrest = disp.y;`,
        )
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          ${GERSTNER}
          ${FLOOR}
          uniform sampler2D tNormal;
          uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uClarity;
          varying vec3 vWPos; varying float vDepth; varying float vCrest;
          float wFoam; float wDepth; vec3 wN;`,
        )
        .replace(
          '#include <map_fragment>',
          `{
            float th = seaFloor(vWPos.xz);
            wDepth = max(0.0, vWPos.y - th);
            float dist = length(vWPos - cameraPosition);
            float damp = smoothstep(0.0, 5.0, wDepth) * 0.85 + 0.15;
            float fade = 1.0 - smoothstep(300.0, 1600.0, dist);
            vec3 tg = vec3(1.0, 0.0, 0.0); vec3 bn = vec3(0.0, 0.0, 1.0);
            gerstner(vWPos.xz, damp * fade, smoothstep(10.0, 42.0, max(0.0, -th)), tg, bn);
            vec3 n = normalize(cross(bn, tg));
            vec2 uv1 = vWPos.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.011);
            vec2 uv2 = vWPos.xz * 0.11 + vec2(-uTime * 0.021, uTime * 0.027);
            vec3 d1 = texture2D(tNormal, uv1).xyz * 2.0 - 1.0;
            vec3 d2 = texture2D(tNormal, uv2).xyz * 2.0 - 1.0;
            float detail = mix(0.55, 0.12, smoothstep(40.0, 900.0, dist));
            vec2 dd = (d1.xy + d2.xy) * detail;
            wN = normalize(vec3(n.x + dd.x, n.y, n.z + dd.y));
            // Absorption: shallow turquoise over sand, deep navy offshore.
            float absorb = exp(-wDepth * min(0.22, 0.08 + uClarity * 0.8));
            vec3 body = mix(uDeep, uShallow, absorb);
            // Foam at the shore and on crests.
            float t = uTime;
            float fn = texture2D(tNormal, vWPos.xz * 0.09 + vec2(t * 0.03, -t * 0.02)).b;
            // Breaking band right at the waterline, pulsing with the swell.
            float swash = 0.5 + 0.5 * sin(t * 0.9 + vWPos.x * 0.05 + vWPos.z * 0.03);
            float shore = smoothstep(0.45 + swash * 0.25, 0.0, wDepth) * smoothstep(0.45, 0.8, fn + 0.18 * sin(wDepth * 14.0 - t * 2.2));
            // Whitecaps only on the steepest crests.
            float crest = smoothstep(0.62, 0.9, vCrest / max(uWaveAmp, 0.3)) * smoothstep(0.55, 0.85, fn);
            wFoam = clamp(shore * 0.85 + crest * 0.45, 0.0, 1.0) * (1.0 - smoothstep(150.0, 500.0, dist));
            diffuseColor.rgb = mix(body, vec3(0.9), wFoam);
            float fres = pow(1.0 - clamp(dot(wN, normalize(cameraPosition - vWPos)), 0.0, 1.0), 4.0);
            // Light path through the water: longer when looking in at a slant (refracted ray).
            float cosI = clamp(normalize(cameraPosition - vWPos).y, 0.0, 1.0);
            float cosR = sqrt(1.0 - (1.0 - cosI * cosI) / 1.777);
            diffuseColor.a = clamp(1.0 - exp(-wDepth * uClarity / max(cosR, 0.2)), 0.0, 1.0);
            diffuseColor.a = max(diffuseColor.a, max(fres, wFoam));
            diffuseColor.a = mix(diffuseColor.a, 1.0, smoothstep(40.0 + 1400.0 * (1.0 - uClarity), 160.0 + 2600.0 * (1.0 - uClarity), dist));
            if (!gl_FrontFacing) {
              // Seen from below: a bright, rippling ceiling.
              diffuseColor.rgb = uShallow * 0.55;
              diffuseColor.a = 0.9;
              wFoam = 0.0;
            }
          }`,
        )
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.6, wFoam);`)
        .replace('#include <normal_fragment_maps>', `normal = normalize((viewMatrix * vec4(gl_FrontFacing ? wN : -wN, 0.0)).xyz);`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Light passing through wave crests toward the viewer.
            vec3 V = normalize(cameraPosition - vWPos);
            float sss = pow(clamp(dot(V, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 4.0);
            float h = clamp(vCrest * 1.6 + 0.35, 0.0, 1.0);
            totalEmissiveRadiance += uSunColor * uShallow * sss * h * 0.05 * (1.0 - wFoam);
            // From below, sunlight comes through the surface (strongest looking straight up).
            if (!gl_FrontFacing) totalEmissiveRadiance += uSunColor * uShallow * 0.035 * pow(clamp(-V.y, 0.0, 1.0), 2.0);
          }`,
        );
      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = () => 'shimotron-water';
    return mat;
  }

  /** Makes a physics entity float (per-entity buoyancy). */
  addFloater(entity, radius = 0.5, strength = 1) {
    this.floaters.add({ entity, radius, strength });
  }

  update(dt, simDt) {
    const eng = this.engine;
    this.uniforms.uTime.value = eng.time.elapsed;
    this.uniforms.uWaveAmp.value = this.waveAmp * (0.65 + eng.atmosphere.wind.strength * 0.35);
    this.uniforms.uSunDir.value.copy(eng.atmosphere.lightDir);
    this.uniforms.uSunColor.value.copy(eng.atmosphere.keyLight.color).multiplyScalar(eng.atmosphere.keyLight.intensity);
    if (this.terrain && this.terrain.uniforms) {
      this.terrain.uniforms.uTime.value = eng.time.elapsed;
      this.terrain.uniforms.uCaustic.value.copy(eng.atmosphere.keyLight.color).multiplyScalar(Math.min(1.2, eng.atmosphere.dayFactor * 1.2));
    }
    const cam = eng.camera.position;
    // Seen from high above (the world map) the sea must reach the horizon: stretch the grid.
    const grow = Math.max(1, cam.y / 60);
    this.mesh.scale.set(grow, 1, grow);
    const snap = 4 * grow;
    this.mesh.position.set(Math.round(cam.x / snap) * snap, this.level, Math.round(cam.z / snap) * snap);

    if (simDt <= 0) return;
    // Buoyancy for every dynamic body touching the water plane.
    for (const b of eng.physics.bodies) {
      if (b.mass === 0 || b.sleepState === 2) continue;
      const r = b.boundingRadius || 0.5;
      const depth = this.level - (b.position.y - r);
      if (depth <= 0) continue;
      const sub = Math.min(1, depth / (2 * r));
      const volume = (4 / 3) * Math.PI * r * r * r * 0.55;
      const lift = 1000 * 9.82 * volume * sub * 0.0012; // scaled: bodies use kg-ish masses of 1-20
      b.force.y += Math.min(lift * 60, b.mass * 9.82 * 2.2) * sub;
      b.velocity.x *= 1 - 0.9 * simDt * sub;
      b.velocity.z *= 1 - 0.9 * simDt * sub;
      b.velocity.y *= 1 - 2.2 * simDt * sub;
      b.angularVelocity.scale(1 - 1.5 * simDt * sub, b.angularVelocity);
    }
  }
}
