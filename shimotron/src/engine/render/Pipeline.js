import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Interleaved gradient noise: cheap per-pixel dither used by several passes.
const IGN = /* glsl */ `float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

const SELECTION_LAYER = 31;

/**
 * The frame graph:
 *   scene (MSAA, HDR, depth) → GTAO → god rays (½ res) → composite
 *   (AO, exposure, rays) → depth of field → bloom → grade/tonemap
 *   (AgX / ACES / Neutral, white balance, vignette, grain, chromatic
 *   aberration, selection outline) → FXAA → screen
 */
export class Pipeline {
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.params = {
      toneMapper: 'agx',
      aoIntensity: 0.85,
      aoRadius: 1.2,
      bloomStrength: 0.42,
      bloomRadius: 0.55,
      bloomThreshold: 1.1,
      raysIntensity: 0.55,
      vignette: 0.32,
      grain: 0.03,
      chromatic: 0.0007,
      saturation: 1.14,
      contrast: 1.1,
      temperature: 0,
      tint: 0,
      dofEnabled: false,
      dofFocus: 12,
      dofAperture: 2.2,
      dofMaxBlur: 11,
      outlineColor: new THREE.Color(1.0, 0.69, 0.13),
    };
    this.selection = [];
    // Editor overlays (gizmos) render after tone mapping, straight to the screen.
    this.overlay = new THREE.Scene();
    this.width = 1;
    this.height = 1;

    const hf = { type: THREE.HalfFloatType, depthBuffer: false };
    this.depthTexture = new THREE.DepthTexture(1, 1);
    this.depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthTexture: this.depthTexture });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, hf);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, hf);
    this.halfA = new THREE.WebGLRenderTarget(1, 1, hf);
    this.halfB = new THREE.WebGLRenderTarget(1, 1, hf);
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.maskRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });

    this.gtao = new GTAOPass(engine.scene, engine.camera, 2, 2);
    // Reconstruct normals from our own depth: no extra scene render.
    this.gtao.normalRenderTarget.setSize = () => {};
    this.gtao.normalRenderTarget.dispose();
    this.gtao.setGBuffer(this.depthTexture);
    this.gtao.output = GTAOPass.OUTPUT.Off;
    this.gtao.updateGtaoMaterial({ radius: this.params.aoRadius, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });

    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.params.bloomStrength, this.params.bloomRadius, this.params.bloomThreshold);

    this._buildMaterials();
    this.quad = new FullScreenQuad(null);
    this.maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.selectionLayer = SELECTION_LAYER;
    this.applyQuality(engine.quality.settings);
    engine.events.on('quality', (s) => this.applyQuality(s));
  }

  applyQuality(s) {
    this.quality = s;
    if (this.sceneRT.samples !== s.msaa) {
      this.sceneRT.samples = s.msaa;
      this.sceneRT.dispose();
    }
    this.setSize(this.width, this.height);
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    this.sceneRT.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.halfA.setSize(hw, hh);
    this.halfB.setSize(hw, hh);
    this.ldrRT.setSize(w, h);
    this.maskRT.setSize(w, h);
    const aoHalf = this.quality ? this.quality.aoHalfRes : true;
    this.gtao.setSize(aoHalf ? hw : w, aoHalf ? hh : h);
    this.bloom.setSize(w, h);
    this.fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
    this.finalMat.uniforms.uResolution.value.set(w, h);
    this.dofMat.uniforms.uResolution.value.set(w, h);
  }

  _buildMaterials() {
    this.raysOccMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, tColor: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth; uniform sampler2D tColor; uniform vec2 uSun; uniform float uAspect; varying vec2 vUv;
        void main(){
          float d = texture2D(tDepth, vUv).x;
          float sky = step(0.99999, d);
          vec2 dv = (vUv - uSun) * vec2(uAspect, 1.0);
          float glow = pow(max(0.0, 1.0 - length(dv) * 1.35), 3.0);
          vec3 c = min(texture2D(tColor, vUv).rgb, vec3(8.0));
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(vec3(sky * glow * (0.35 + min(l, 4.0) * 0.25)), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.raysBlurMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, uSun: { value: new THREE.Vector2() }, uDensity: { value: 0.9 }, uDecay: { value: 0.965 }, uWeight: { value: 0.07 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tInput; uniform vec2 uSun; uniform float uDensity; uniform float uDecay; uniform float uWeight; varying vec2 vUv;
        ${IGN}
        void main(){
          const int N = 56;
          vec2 delta = (vUv - uSun) * uDensity / float(N);
          vec2 uv = vUv - delta * ign(gl_FragCoord.xy);
          float decay = 1.0; vec3 sum = vec3(0.0);
          for (int i = 0; i < N; i++) {
            uv -= delta;
            sum += texture2D(tInput, clamp(uv, 0.0, 1.0)).rgb * decay * uWeight;
            decay *= uDecay;
          }
          gl_FragColor = vec4(sum, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tAO: { value: null },
        tRays: { value: null },
        uUseAO: { value: false },
        uUseRays: { value: false },
        uAOIntensity: { value: 1 },
        uExposure: { value: 1 },
        uRaysColor: { value: new THREE.Color() },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tRays;
        uniform bool uUseAO; uniform bool uUseRays; uniform float uAOIntensity; uniform float uExposure; uniform vec3 uRaysColor;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          if (uUseAO) { float ao = texture2D(tAO, vUv).r; c *= mix(1.0, ao, uAOIntensity); }
          c *= uExposure;
          if (uUseRays) c += texture2D(tRays, vUv).rgb * uRaysColor;
          c = min(c, vec3(48.0));
          if (any(isnan(c))) c = vec3(0.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.dofMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uFocus: { value: 10 },
        uAperture: { value: 2 },
        uMaxBlur: { value: 10 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform float uNear; uniform float uFar;
        uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; uniform vec2 uResolution;
        varying vec2 vUv;
        float linDepth(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
        float coc(float z){ return clamp(abs(z - uFocus) / max(z, 0.001) * uAperture * 6.0, 0.0, uMaxBlur); }
        void main(){
          float z = linDepth(texture2D(tDepth, vUv).x);
          float c0 = coc(z);
          vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.0;
          const int N = 40; const float GA = 2.39996323;
          for (int i = 1; i < N; i++) {
            float r = sqrt(float(i) / float(N)) * uMaxBlur;
            float a = float(i) * GA;
            vec2 o = vec2(cos(a), sin(a)) * r / uResolution;
            float zs = linDepth(texture2D(tDepth, vUv + o).x);
            float cs = coc(zs);
            // A sample contributes if its own blur reaches this pixel; background samples are limited by our own blur.
            float w = smoothstep(r - 1.0, r + 1.0, zs < z ? cs : min(cs, c0));
            acc += texture2D(tColor, vUv + o).rgb * w; wsum += w;
          }
          gl_FragColor = vec4(acc / wsum, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tMask: { value: null },
        toneMappingExposure: { value: 1 },
        uToneMapper: { value: 0 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uVignette: { value: 0.3 },
        uGrain: { value: 0.03 },
        uCA: { value: 0.002 },
        uSaturation: { value: 1 },
        uContrast: { value: 1 },
        uWB: { value: new THREE.Vector3(1, 1, 1) },
        uHasSelection: { value: false },
        uOutline: { value: new THREE.Color(1, 0.7, 0.1) },
        uNight: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        #include <tonemapping_pars_fragment>
        uniform sampler2D tColor; uniform sampler2D tMask; uniform int uToneMapper; uniform float uTime;
        uniform vec2 uResolution; uniform float uVignette; uniform float uGrain; uniform float uCA;
        uniform float uSaturation; uniform float uContrast; uniform vec3 uWB; uniform bool uHasSelection; uniform vec3 uOutline; uniform float uNight;
        varying vec2 vUv;
        ${IGN}
        void main(){
          vec2 dir = vUv - 0.5;
          float r2 = dot(dir, dir);
          vec2 off = dir * r2 * uCA * 8.0;
          vec3 c = vec3(texture2D(tColor, vUv - off).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv + off).b);
          c *= uWB;
          // Scotopic (night) vision: low light loses colour and shifts toward blue.
          float lumIn = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float scot = uNight * (1.0 - smoothstep(0.05, 0.9, lumIn));
          c = mix(c, lumIn * vec3(0.72, 0.86, 1.18), scot * 0.75);
          if (uToneMapper == 0) c = AgXToneMapping(c);
          else if (uToneMapper == 1) c = ACESFilmicToneMapping(c);
          else c = NeutralToneMapping(c);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = max(mix(vec3(l), c, uSaturation), 0.0);
          c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
          c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
          float aspect = uResolution.x / uResolution.y;
          float v = length(dir * vec2(aspect, 1.0) / sqrt(aspect * aspect * 0.25 + 0.25));
          c *= mix(1.0, smoothstep(1.25, 0.35, v), uVignette);
          if (uHasSelection) {
            vec2 px = 1.0 / uResolution;
            float m = texture2D(tMask, vUv).r;
            float mx = 0.0;
            for (int i = 0; i < 8; i++) {
              float a = float(i) * 0.785398;
              mx = max(mx, texture2D(tMask, vUv + vec2(cos(a), sin(a)) * px * 2.5).r);
            }
            float edge = clamp(mx - m, 0.0, 1.0);
            c = mix(c, uOutline, edge * 0.95);
            c = mix(c, uOutline, m * 0.07);
          }
          float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
          c += (n - 0.5) * uGrain * (1.0 - l * 0.6);
          c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.fxaaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: VERT,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  _renderSelectionMask() {
    const r = this.renderer;
    const cam = this.engine.camera;
    const scene = this.engine.scene;
    const marked = [];
    for (const obj of this.selection) {
      obj.traverse((o) => {
        if (o.isMesh || o.isPoints) {
          o.layers.enable(SELECTION_LAYER);
          marked.push(o);
        }
      });
    }
    const oldMask = cam.layers.mask;
    const oldOverride = scene.overrideMaterial;
    const oldBg = scene.background;
    cam.layers.set(SELECTION_LAYER);
    scene.overrideMaterial = this.maskMaterial;
    scene.background = null;
    r.setRenderTarget(this.maskRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, cam);
    cam.layers.mask = oldMask;
    scene.overrideMaterial = oldOverride;
    scene.background = oldBg;
    for (const o of marked) o.layers.disable(SELECTION_LAYER);
  }

  render(dt) {
    const eng = this.engine;
    const r = this.renderer;
    const s = this.quality;
    const p = this.params;
    const cam = eng.camera;
    const atm = eng.atmosphere;

    // 1. Scene → HDR target with depth.
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(eng.scene, cam);

    // 2. Ambient occlusion from the scene depth.
    const useAO = s.ao && p.aoIntensity > 0;
    if (useAO) {
      this.gtao.camera = cam;
      this.gtao.render(r, null, this.sceneRT);
    }

    // 3. Screen-space light shafts toward the key light.
    let useRays = false;
    if (s.godRays && p.raysIntensity > 0) {
      const ld = atm.lightDir;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const facing = fwd.dot(ld);
      const strength = p.raysIntensity * THREE.MathUtils.smoothstep(facing, 0.05, 0.45) * (atm.dayFactor * 1.0 + atm.nightFactor * 0.35);
      if (strength > 0.01) {
        const sp = ld.clone().multiplyScalar(1000).add(cam.position).project(cam);
        const sun = new THREE.Vector2(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
        this.raysOccMat.uniforms.tDepth.value = this.depthTexture;
        this.raysOccMat.uniforms.tColor.value = this.sceneRT.texture;
        this.raysOccMat.uniforms.uSun.value.copy(sun);
        this.raysOccMat.uniforms.uAspect.value = this.width / this.height;
        this._pass(this.raysOccMat, this.halfA);
        this.raysBlurMat.uniforms.tInput.value = this.halfA.texture;
        this.raysBlurMat.uniforms.uSun.value.copy(sun);
        this._pass(this.raysBlurMat, this.halfB);
        const k = strength * 2.2;
        this.compositeMat.uniforms.uRaysColor.value.copy(atm.sunColor).multiplyScalar(k);
        useRays = true;
      }
    }

    // 4. Composite: AO, exposure, rays.
    const cu = this.compositeMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tAO.value = this.gtao.pdRenderTarget.texture;
    cu.tRays.value = this.halfB.texture;
    cu.uUseAO.value = useAO;
    cu.uUseRays.value = useRays;
    cu.uAOIntensity.value = p.aoIntensity;
    cu.uExposure.value = atm.exposure;
    this._pass(this.compositeMat, this.rtA);
    let current = this.rtA;
    let spare = this.rtB;

    // 5. Depth of field (photo mode).
    if (p.dofEnabled) {
      const du = this.dofMat.uniforms;
      du.tColor.value = current.texture;
      du.tDepth.value = this.depthTexture;
      du.uNear.value = cam.near;
      du.uFar.value = cam.far;
      du.uFocus.value = p.dofFocus;
      du.uAperture.value = p.dofAperture;
      du.uMaxBlur.value = p.dofMaxBlur * (this.width / 1600);
      this._pass(this.dofMat, spare);
      [current, spare] = [spare, current];
    }

    // 6. Bloom (added in place).
    if (s.bloom && p.bloomStrength > 0) {
      this.bloom.strength = p.bloomStrength;
      this.bloom.radius = p.bloomRadius;
      this.bloom.threshold = p.bloomThreshold;
      this.bloom.render(r, null, current, dt, false);
    }

    // Selection outline mask.
    const hasSel = this.selection.length > 0;
    if (hasSel) this._renderSelectionMask();

    // 7. Tone map + grade.
    const fu = this.finalMat.uniforms;
    fu.tColor.value = current.texture;
    fu.tMask.value = this.maskRT.texture;
    fu.uHasSelection.value = hasSel;
    fu.uToneMapper.value = p.toneMapper === 'agx' ? 0 : p.toneMapper === 'aces' ? 1 : 2;
    fu.uTime.value = eng.time.elapsed;
    fu.uVignette.value = p.vignette;
    fu.uGrain.value = p.grain;
    fu.uCA.value = p.chromatic;
    fu.uSaturation.value = p.saturation;
    fu.uContrast.value = p.contrast;
    fu.uNight.value = atm.nightFactor;
    fu.uOutline.value.copy(p.outlineColor);
    // White balance: temperature shifts blue↔amber, tint shifts green↔magenta.
    const t = p.temperature;
    const g = p.tint;
    fu.uWB.value.set(1 + t * 0.12, 1 - g * 0.08, 1 - t * 0.12);

    if (s.fxaa) {
      this._pass(this.finalMat, this.ldrRT);
      this.fxaaMat.uniforms.tDiffuse.value = this.ldrRT.texture;
      this._pass(this.fxaaMat, null);
    } else {
      this._pass(this.finalMat, null);
    }

    if (this.overlay.children.length) {
      const oldAuto = r.autoClear;
      r.autoClear = false;
      r.setRenderTarget(null);
      r.clearDepth();
      r.render(this.overlay, cam);
      r.autoClear = oldAuto;
    }
  }

  /** Renders one frame and returns a PNG data URL of the canvas. */
  capture() {
    this.render(0);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Linear depth under a screen point (NDC), used for click-to-focus. */
  focusDistanceAt(ndc) {
    const hit = this.engine.pick(ndc, { any: true });
    return hit ? hit.distance : 50;
  }
}
