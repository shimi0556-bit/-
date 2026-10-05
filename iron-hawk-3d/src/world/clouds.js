// Volumetric-looking clouds: clusters of camera-facing puffs in one instanced draw call,
// lit from the sun side, fading near the camera so flying through them feels soft.
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';
import { makePuffSprite, canvasTexture } from '../core/textures.js';

export class Clouds {
  constructor(level, terrainSize) {
    this.level = level;
    this.size = terrainSize;
  }

  build(sunDir, sunColor, fog) {
    const cfg = this.level.clouds;
    const rand = mulberry32(this.level.seed + 404);
    const puffs = [];
    for (let c = 0; c < cfg.count; c++) {
      const cx = (rand() - 0.5) * this.size * 1.1, cz = (rand() - 0.5) * this.size * 1.1;
      const cy = cfg.height[0] + rand() * (cfg.height[1] - cfg.height[0]);
      const n = 6 + Math.floor(rand() * 8), spread = 120 + rand() * 160;
      for (let i = 0; i < n; i++) {
        puffs.push([cx + (rand() - 0.5) * spread * 2, cy + (rand() - 0.5) * spread * 0.35, cz + (rand() - 0.5) * spread,
          70 + rand() * 110, rand() * Math.PI * 2]);
      }
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(puffs.length * 4), rot = new Float32Array(puffs.length);
    puffs.forEach((p, i) => { off[i * 4] = p[0]; off[i * 4 + 1] = p[1]; off[i * 4 + 2] = p[2]; off[i * 4 + 3] = p[3]; rot[i] = p[4]; });
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
    geo.instanceCount = puffs.length;
    this.uniforms = {
      tPuff: { value: canvasTexture(makePuffSprite(256, 3), false) },
      uSunDir: { value: sunDir.clone() },
      uSun: { value: new THREE.Color(sunColor) },
      uTint: { value: new THREE.Color(cfg.color) },
      uFogColor: { value: fog.color.clone() },
      uFogDensity: { value: fog.density * 0.6 },
      uOpacity: { value: cfg.opacity },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: `
attribute vec4 aOff; attribute float aRot;
varying vec2 vUv; varying float vDist; varying vec3 vLight; varying float vShade;
uniform vec3 uSunDir; uniform float uTime;
void main() {
  vec3 center = aOff.xyz + vec3(sin(uTime * 0.01 + aRot) * 30.0, 0.0, uTime * 2.0);
  vec4 mv = viewMatrix * vec4(center, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 corner = mat2(c, -s, s, c) * position.xy;
  mv.xy += corner * aOff.w * 2.0;
  vUv = uv;
  vDist = -mv.z;
  vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vShade = 0.55 + 0.45 * clamp(dot(normalize(vec3(corner, 0.35)), sunView) * 0.8 + position.y * 0.6 + 0.3, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform sampler2D tPuff; uniform vec3 uSun, uTint, uFogColor; uniform float uFogDensity, uOpacity;
varying vec2 vUv; varying float vDist; varying float vShade;
void main() {
  float a = texture2D(tPuff, vUv).a * uOpacity;
  a *= smoothstep(25.0, 260.0, vDist);
  if (a < 0.01) discard;
  vec3 col = uTint * mix(vec3(0.42, 0.46, 0.55), uSun * 0.95, vShade) * 0.85;
  float f = 1.0 - exp(-pow(uFogDensity * vDist, 2.0));
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, a * (1.0 - f * 0.6));
}`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    return this.mesh;
  }

  update(dt, time) { if (this.uniforms) this.uniforms.uTime.value = time; }
}
