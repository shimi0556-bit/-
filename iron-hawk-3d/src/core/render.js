// Renderer, quality presets and the post-processing chain:
// scene -> bloom -> tone mapping (OutputPass) -> colour grade, vignette and hit flash -> FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { isTouchDevice } from './util.js';

export const QUALITY = {
  low: { name: 'נמוכה', pixelRatio: 0.8, shadows: 0, terrainSegments: 256, plants: 0.35, plantDistance: 1500, creatureDetail: 0.7, bloom: false, msaa: 0, fxaa: false, lights: 1, particles: 0.5 },
  medium: { name: 'בינונית', pixelRatio: 1, shadows: 1024, terrainSegments: 320, plants: 0.6, plantDistance: 2100, creatureDetail: 0.85, bloom: true, msaa: 0, fxaa: true, lights: 2, particles: 0.75 },
  high: { name: 'גבוהה', pixelRatio: 1.5, shadows: 2048, terrainSegments: 400, plants: 0.85, plantDistance: 2900, creatureDetail: 1, bloom: true, msaa: 4, fxaa: false, lights: 3, particles: 1 },
  ultra: { name: 'אולטרה', pixelRatio: 2, shadows: 4096, terrainSegments: 512, plants: 1, plantDistance: 3600, creatureDetail: 1.15, bloom: true, msaa: 4, fxaa: false, lights: 3, particles: 1 },
};

export function autoQuality() {
  if (isTouchDevice()) return Math.min(window.screen.width, window.screen.height) > 700 ? 'medium' : 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.1 }, uContrast: { value: 1.05 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.35 }, uHit: { value: 0 }, uLowHp: { value: 0 }, uTime: { value: 0 }, uBoost: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uSaturation, uContrast, uVignette, uHit, uLowHp, uTime, uBoost, uAspect; uniform vec3 uTint;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  // a touch of radial blur / chromatic split while boosting
  vec3 col;
  if (uBoost > 0.01) {
    vec2 o = c * 0.006 * uBoost;
    col = vec3(texture2D(tDiffuse, uv - o).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + o).b);
  } else col = texture2D(tDiffuse, uv).rgb;
  col *= uTint;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  vec2 cv = c * vec2(uAspect, 1.0);
  float r = length(cv) / length(vec2(uAspect, 1.0) * 0.5);
  float vig = 1.0 - uVignette * smoothstep(0.35, 1.05, r);
  col *= vig;
  // damage: red edges
  float edge = smoothstep(0.45, 1.0, r);
  float pulse = uLowHp * (0.55 + 0.45 * sin(uTime * 6.0));
  col = mix(col, vec3(0.75, 0.05, 0.02), clamp(edge * (uHit * 0.85 + pulse * 0.5), 0.0, 0.85));
  col += (hash(uv * 911.0 + fract(uTime)) - 0.5) * 0.012; // fine grain against banding
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};

export class Renderer {
  constructor(canvas, qualityKey) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.65;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scale = 1;
    this.frameTimes = [];
    this.setQuality(qualityKey);
  }

  setQuality(key) {
    this.qualityKey = key;
    this.q = QUALITY[key];
    const r = this.renderer;
    r.shadowMap.enabled = this.q.shadows > 0;
    this.scale = 1;
    this.composer = null;
    this.resize();
  }

  buildComposer(scene, camera) {
    const r = this.renderer, q = this.q;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(r.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.55, 0.9);
      composer.addPass(this.bloom);
    } else this.bloom = null;
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    if (q.fxaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(this.fxaa);
    } else this.fxaa = null;
    this.composer = composer;
    this.scene = scene;
    this.camera = camera;
    this.updateSizes();
  }

  pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * this.scale;
  }

  resize() {
    const r = this.renderer;
    r.setPixelRatio(this.pixelRatio());
    r.setSize(window.innerWidth, window.innerHeight, false);
    if (this.camera) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
    if (this.composer) {
      this.composer.setPixelRatio(r.getPixelRatio());
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.updateSizes();
    }
  }

  updateSizes() {
    const pr = this.renderer.getPixelRatio();
    const w = window.innerWidth * pr, h = window.innerHeight * pr;
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
    if (this.grade) this.grade.uniforms.uAspect.value = w / h;
  }

  setLevelLook(level) {
    this.renderer.toneMappingExposure = level.exposure;
    const g = this.grade.uniforms;
    g.uSaturation.value = level.grade.saturation;
    g.uContrast.value = level.grade.contrast;
    g.uTint.value.set(...level.grade.tint);
    g.uVignette.value = level.grade.vignette;
    if (this.bloom) {
      this.bloom.strength = level.id === 'volcano' ? 0.75 : 0.5;
      this.bloom.threshold = level.id === 'volcano' ? 0.8 : 0.92;
    }
  }

  render(dt, time) {
    if (!this.composer) return;
    this.grade.uniforms.uTime.value = time;
    this.composer.render(dt);
    this.adapt(dt);
  }

  // dynamic resolution: keep the frame rate up on weaker devices
  adapt(dt) {
    if (!this.autoScale) return;
    const f = this.frameTimes;
    f.push(dt);
    if (f.length < 90) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    f.length = 0;
    const before = this.scale;
    if (avg > 1 / 40 && this.scale > 0.55) this.scale = Math.max(0.55, this.scale - 0.12);
    else if (avg < 1 / 58 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.06);
    if (this.scale !== before) this.resize();
  }
}
