import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SkyModel, luminance } from './SkyModel.js';
import { fogParams } from './HeightFog.js';

// Same cloud field as Three's Sky shader, so stars hide behind the clouds.
const CLOUD_GLSL = /* glsl */ `
  vec2 cgrad(vec2 i) { vec3 p = fract(i.xyx * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.xx + p.yz) * p.zy) * 2.0 - 1.0; }
  float cnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(cgrad(i), f); float b = dot(cgrad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(cgrad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)); float d = dot(cgrad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
  }
  float cfbm(vec2 p, float drift) { float r = 0.0; float a = 1.0; for (int i = 0; i < 4; i++) { r += a * cnoise(p); a *= 0.5; p = p * 2.0 + drift; } return r; }
  float cloudAlpha(vec3 direction) {
    if (direction.y <= 0.0 || cloudCoverage <= 0.0) return 0.0;
    float elevation = mix(1.0, 0.1, cloudElevation);
    vec2 cloudUV = direction.xz / (direction.y * elevation);
    cloudUV *= cloudScale; cloudUV += time * cloudSpeed;
    float evolve = time * cloudSpeed * 300.0;
    float cloudNoise = clamp(cfbm(cloudUV * 1000.0, evolve) * 0.7 + 0.5, 0.0, 1.0);
    float region = cnoise(cloudUV * 300.0) * 0.37 + 0.5;
    float cov = clamp(cloudCoverage + (region - 0.5) * 0.6, 0.0, 1.0);
    float threshold = 1.0 - cov;
    float depth = max(0.0, cloudNoise - threshold);
    float horizonFade = smoothstep(0.0, 0.03 + 0.06 * cloudElevation, direction.y);
    return clamp((1.0 - exp(depth * cloudDensity * -12.0)) * horizonFade * 1.6, 0.0, 1.0);
  }
`;

/** Adds a moonlit night sky (deep blue gradient + moon halo) to Three's Sky shader. */
function patchSkyShader(material) {
  material.fragmentShader = material.fragmentShader
    .replace('uniform float time;', 'uniform float time;\n\t\tuniform float uNight;\n\t\tuniform vec3 uMoonDir;')
    .replace('vec3 L0 = vec3( 0.1 ) * Fex;', 'vec3 L0 = vec3( 0.1 ) * Fex * ( 1.0 - 0.85 * uNight );')
    .replace(
      '// Clouds',
      `// Night sky
			{
				float up = clamp( direction.y, 0.0, 1.0 );
				vec3 night = mix( vec3( 0.0022, 0.0034, 0.0075 ), vec3( 0.0006, 0.0011, 0.0028 ), pow( up, 0.6 ) );
				float moonHalo = pow( max( dot( direction, uMoonDir ), 0.0 ), 60.0 ) * 0.02 + pow( max( dot( direction, uMoonDir ), 0.0 ), 6.0 ) * 0.0025;
				texColor += ( night + vec3( 0.75, 0.85, 1.0 ) * moonHalo ) * uNight;
			}
			// Clouds`,
    );
  material.needsUpdate = true;
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Time of day, physically derived sun/moon light, Preetham sky with
 * clouds, stars and moon, image-based lighting regenerated from the live
 * sky, height fog colours, a shadow frustum that follows the camera with
 * texel snapping, and eye-adaptation exposure.
 */
export class Atmosphere {
  constructor(engine) {
    this.engine = engine;
    const scene = engine.scene;
    this.model = new SkyModel();

    this.timeOfDay = 16.6; // hours
    this.daySpeed = 0; // in-game hours per real second
    this.sunAzimuth = 0.62; // radians, rotates the whole solar arc
    this.maxElevation = THREE.MathUtils.degToRad(64);
    this.cloudCoverage = 0.38;
    this.cloudDensity = 0.55;
    this.fogDensity = 0.0012;
    this.exposureBias = 0; // EV
    this.wind = { strength: 1, dir: new THREE.Vector2(0.8, 0.6).normalize() };

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.dayFactor = 1;
    this.nightFactor = 0;
    this.exposure = 0.05;
    this.targetExposure = 0.05;
    this.sunColor = new THREE.Color();
    this.skyIrradiance = [1, 1, 1];

    // Sky dome with clouds.
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.sky.name = 'Sky';
    scene.add(this.sky);
    this.skyUniforms = this.sky.material.uniforms;
    this.skyUniforms.uNight = { value: 0 };
    this.skyUniforms.uMoonDir = { value: new THREE.Vector3(0, 1, 0) };
    patchSkyShader(this.sky.material);

    // Key light: the sun by day, the moon by night. One shadow caster.
    this.keyLight = new THREE.DirectionalLight(0xffffff, 10);
    this.keyLight.name = 'KeyLight';
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.035;
    this.shadowExtent = 70;
    scene.add(this.keyLight, this.keyLight.target);

    this.hemi = new THREE.HemisphereLight(0x8fb2ff, 0x2a2118, 0);
    scene.add(this.hemi);

    this._buildStars();
    this._buildMoon();
    this._buildEnvironment();
    this.applyQuality(engine.quality.settings);
    engine.events.on('quality', (s) => this.applyQuality(s));

    this._envTimer = 0;
    this._lastEnvSun = new THREE.Vector3(9, 9, 9);
    this._lastCoverage = -1;
    this.forceAdapt = true;
    this.update(0);
  }

  applyQuality(s) {
    const sh = this.keyLight.shadow;
    this.keyLight.castShadow = s.shadows;
    if (sh.mapSize.x !== s.shadowMapSize) {
      sh.mapSize.set(s.shadowMapSize, s.shadowMapSize);
      if (sh.map) {
        sh.map.dispose();
        sh.map = null;
      }
    }
    sh.radius = s.shadowRadius;
    sh.blurSamples = 12;
    this.shadowExtent = s.shadowMapSize >= 4096 ? 90 : s.shadowMapSize >= 2048 ? 70 : 55;
    const cam = sh.camera;
    cam.left = -this.shadowExtent;
    cam.right = this.shadowExtent;
    cam.top = this.shadowExtent;
    cam.bottom = -this.shadowExtent;
    cam.near = 1;
    cam.far = 700;
    cam.updateProjectionMatrix();
    if (this.envRT && this.envRT.width !== s.envSize) {
      this.envRT.setSize(s.envSize, s.envSize);
      this._envDirty = true;
    }
  }

  _buildStars() {
    const count = 7000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const band = new THREE.Vector3(0.3, 0.9, 0.3).normalize(); // galactic plane normal
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Half the stars concentrate near the galactic band.
      _v.randomDirection();
      if (i % 2 === 0) {
        const d = _v.dot(band);
        _v.addScaledVector(band, -d * 0.85).normalize();
      }
      pos.set([_v.x * 2400, _v.y * 2400, _v.z * 2400], i * 3);
      const temp = Math.random();
      c.setHSL(temp < 0.7 ? 0.6 : temp < 0.9 ? 0.12 : 0.02, temp < 0.7 ? 0.25 : 0.55, 0.85);
      col.set([c.r, c.g, c.b], i * 3);
      const mag = Math.pow(Math.random(), 9);
      size[i] = 0.9 + mag * 2.6;
      col[i * 3] *= 0.25 + mag * 3;
      col[i * 3 + 1] *= 0.25 + mag * 3;
      col[i * 3 + 2] *= 0.25 + mag * 3;
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starUniforms = {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uPixelRatio: { value: 1 },
      uBright: { value: 0.07 },
      cloudCoverage: { value: 0.4 },
      cloudScale: { value: 0.0002 },
      cloudSpeed: { value: 0.00002 },
      cloudElevation: { value: 0.5 },
      cloudDensity: { value: 0.4 },
      time: { value: 0 },
      uStarRot: { value: new THREE.Matrix3() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aPhase;
        uniform float uTime; uniform float uPixelRatio;
        uniform float cloudCoverage; uniform float cloudScale; uniform float cloudSpeed; uniform float cloudElevation; uniform float cloudDensity; uniform float time;
        varying vec3 vColor; varying float vTw;
        ${CLOUD_GLSL}
        void main() {
          vec3 wdir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          float cloudA = cloudAlpha(wdir);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99999;
          gl_PointSize = aSize * uPixelRatio;
          vTw = (0.7 + 0.3 * sin(uTime * (1.3 + aPhase * 4.0) + aPhase * 60.0)) * (1.0 - cloudA) * smoothstep(-0.02, 0.12, wdir.y);
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; uniform float uBright;
        varying vec3 vColor; varying float vTw;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a;
          gl_FragColor = vec4(vColor * a * vTw * uNight * uBright, 1.0);
        }`,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -999;
    this.stars.name = 'Stars';
    this.engine.scene.add(this.stars);
  }

  _buildMoon() {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s * 0.45, s * 0.42, s * 0.05, s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#f4f1e8');
    grd.addColorStop(0.85, '#cfcabd');
    grd.addColorStop(1, '#a9a498');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = Math.pow(Math.random(), 2.5) * s * 0.12 + 2;
      g.fillStyle = `rgba(90,86,78,${0.08 + Math.random() * 0.18})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x - 1, y - 1, r, Math.PI * 0.9, Math.PI * 1.8);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.moonMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1, 1, 1) });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.moonMat);
    this.moon.scale.setScalar(95);
    this.moon.renderOrder = -998;
    this.moon.frustumCulled = false;
    this.moon.name = 'Moon';
    this.engine.scene.add(this.moon);
  }

  _buildEnvironment() {
    // A tiny scene rendered into a cube map; Three turns it into a PMREM.
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(900);
    this.envSky.material.uniforms.showSunDisc.value = 0;
    this.envSky.material.uniforms.uNight = { value: 0 };
    this.envSky.material.uniforms.uMoonDir = { value: new THREE.Vector3(0, 1, 0) };
    patchSkyShader(this.envSky.material);
    this.envScene.add(this.envSky);
    this.groundUniforms = { uColor: { value: new THREE.Color(0.1, 0.09, 0.07) }, uHorizon: { value: new THREE.Color(0.5, 0.6, 0.7) } };
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.groundUniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform vec3 uHorizon; varying vec3 vDir;
          void main(){ if (vDir.y > 0.0) discard; float t = smoothstep(0.0, -0.25, vDir.y);
          gl_FragColor = vec4(mix(uHorizon, uColor, t), 1.0); }`,
      }),
    );
    ground.renderOrder = 1;
    this.envScene.add(ground);
    const size = this.engine.quality.settings.envSize;
    this.envRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCamera = new THREE.CubeCamera(0.5, 2000, this.envRT);
    this.engine.scene.environment = this.envRT.texture;
    this._envDirty = true;
  }

  /** Hours → sun direction on a tilted arc (sunrise 6:00, sunset 18:00). */
  computeSunDirection(hours, out) {
    const phase = ((hours - 6) / 24) * Math.PI * 2;
    const x = Math.cos(phase);
    const y = Math.sin(phase) * Math.sin(this.maxElevation);
    const z = -Math.sin(phase) * Math.cos(this.maxElevation);
    out.set(x, y, z).applyAxisAngle(_up, this.sunAzimuth).normalize();
    return out;
  }

  setTime(hours, snap = true) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    if (snap) this.forceAdapt = true;
  }

  update(dt) {
    const eng = this.engine;
    const t = eng.time.elapsed;
    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 24;
    this.computeSunDirection(this.timeOfDay, this.sunDir);
    this.moonDir.copy(this.sunDir).negate();
    this.moonDir.y = Math.abs(this.moonDir.y) * 0.85 + 0.12;
    this.moonDir.normalize();

    const elev = this.sunDir.y;
    this.dayFactor = THREE.MathUtils.smoothstep(elev, -0.06, 0.1);
    this.nightFactor = 1 - THREE.MathUtils.smoothstep(elev, -0.16, -0.02);

    const u = this.skyUniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = this.model.turbidity;
    u.rayleigh.value = this.model.rayleigh;
    u.mieCoefficient.value = this.model.mieCoefficient;
    u.mieDirectionalG.value = this.model.mieDirectionalG;
    u.cloudCoverage.value = this.cloudCoverage;
    u.cloudDensity.value = this.cloudDensity;
    u.cloudElevation.value = 0.55;
    u.cloudScale.value = 0.00022;
    u.cloudSpeed.value = 0.00003 * this.wind.strength;
    u.time.value = t;
    u.uNight.value = this.nightFactor;
    u.uMoonDir.value.copy(this.moonDir);

    // Physically derived light from the CPU sky model.
    const sky = this.model;
    const irr = sky.irradiance(this.sunDir);
    const nightAmb = [0.006, 0.009, 0.018];
    this.skyIrradiance = irr.map((v, i) => v + nightAmb[i]);
    const trans = sky.sunTransmittance(this.sunDir);
    const vis = THREE.MathUtils.smoothstep(elev, -0.035, 0.05);
    const sunIrr = trans.map((v) => v * 58 * vis);
    const sunLum = luminance(sunIrr);

    const moonIrr = [0.018, 0.026, 0.045].map((v) => v * this.nightFactor);
    const kl = this.keyLight;
    if (elev > -0.03) {
      this.lightDir.copy(this.sunDir);
      const m = Math.max(sunIrr[0], sunIrr[1], sunIrr[2], 1e-6);
      this.sunColor.setRGB(sunIrr[0] / m, sunIrr[1] / m, sunIrr[2] / m);
      kl.color.copy(this.sunColor);
      kl.intensity = m;
    } else {
      this.lightDir.copy(this.moonDir);
      kl.color.setRGB(0.62, 0.74, 1.0);
      kl.intensity = luminance(moonIrr) * THREE.MathUtils.smoothstep(-elev, 0.03, 0.14) * 1.4;
      this.sunColor.setRGB(0.62, 0.74, 1.0);
    }
    this.hemi.intensity = this.nightFactor * 0.035;

    // Shadow frustum follows the focus point, snapped to shadow texels.
    const focus = eng.cameraRig ? eng.cameraRig.focusPoint() : eng.camera.position;
    this._placeShadow(focus);

    // Stars, moon.
    this.starUniforms.uTime.value = t;
    this.starUniforms.uNight.value = this.nightFactor;
    this.starUniforms.uPixelRatio.value = eng.renderer.getPixelRatio();
    for (const k of ['cloudCoverage', 'cloudScale', 'cloudSpeed', 'cloudElevation', 'cloudDensity', 'time']) this.starUniforms[k].value = u[k].value;
    this.stars.position.copy(eng.camera.position);
    this.stars.rotation.set(0.35, (this.timeOfDay / 24) * Math.PI * 2 * 0.25, 0);
    this.moon.position.copy(eng.camera.position).addScaledVector(this.moonDir, 2200);
    this.moon.lookAt(eng.camera.position);
    this.moonMat.opacity = THREE.MathUtils.clamp(this.nightFactor * 1.2, 0, 1) * 0.95 + 0.05 * (1 - this.dayFactor);
    this.moon.visible = this.moonMat.opacity > 0.02;

    // Fog colours from the horizon of the same sky.
    const hz = sky.horizon(this.sunDir);
    const f = eng.scene.fog;
    if (f) {
      f.density = this.fogDensity;
      f.color.setRGB(hz.average[0] + nightAmb[0] * 0.5, hz.average[1] + nightAmb[1] * 0.5, hz.average[2] + nightAmb[2] * 0.5);
    }
    fogParams.sunDir.x = this.sunDir.x;
    fogParams.sunDir.y = this.sunDir.y;
    fogParams.sunDir.z = this.sunDir.z;
    fogParams.sunColor.x = hz.toward[0] + nightAmb[0];
    fogParams.sunColor.y = hz.toward[1] + nightAmb[1];
    fogParams.sunColor.z = hz.toward[2] + nightAmb[2];

    // Env-map ground tint (what reflections see below the horizon).
    const gl = luminance(this.skyIrradiance) + sunLum * Math.max(elev, 0);
    this.groundUniforms.uColor.value.setRGB(0.06, 0.055, 0.045).multiplyScalar(gl * 0.35);
    this.groundUniforms.uHorizon.value.setRGB(hz.average[0], hz.average[1], hz.average[2]).multiplyScalar(0.6);

    // Eye adaptation: meter a blend of lit ground and visible sky (log-average),
    // so bright sunsets do not blow out and nights stay moonlit rather than grey.
    const eSurf = sunLum * Math.max(elev, 0.1) * 0.9 + luminance(this.skyIrradiance) + luminance(moonIrr) * 0.6;
    const surfLum = (0.3 * eSurf) / Math.PI;
    const skyLum = luminance(hz.average) * 0.85 + luminance(hz.toward) * 0.15 + 0.004;
    const meter = Math.exp(0.58 * Math.log(Math.max(surfLum, 1e-5)) + 0.42 * Math.log(skyLum));
    this.targetExposure = THREE.MathUtils.clamp(0.2 / meter, 0.004, 9) * Math.pow(2, this.exposureBias);
    if (this.forceAdapt) {
      this.exposure = this.targetExposure;
      this.forceAdapt = false;
    } else {
      const k = 1 - Math.exp(-dt * 1.6);
      this.exposure = Math.exp(THREE.MathUtils.lerp(Math.log(this.exposure), Math.log(this.targetExposure), k));
    }

    this._updateEnvironment(dt);
  }

  _placeShadow(focus) {
    const kl = this.keyLight;
    const cam = kl.shadow.camera;
    const size = kl.shadow.mapSize.x;
    const texel = (this.shadowExtent * 2) / size;
    // Light-space basis.
    const fwd = _v.copy(this.lightDir).negate();
    const right = new THREE.Vector3().crossVectors(fwd, Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : _up).normalize();
    const upL = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const rx = Math.round(focus.dot(right) / texel) * texel;
    const uy = Math.round(focus.dot(upL) / texel) * texel;
    const fz = focus.dot(fwd);
    const snapped = new THREE.Vector3().addScaledVector(right, rx).addScaledVector(upL, uy).addScaledVector(fwd, fz);
    kl.target.position.copy(snapped);
    kl.position.copy(snapped).addScaledVector(this.lightDir, 300);
    kl.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }

  _updateEnvironment(dt) {
    this._envTimer -= dt;
    const moved = this._lastEnvSun.angleTo(this.sunDir) > 0.004;
    const clouds = Math.abs(this._lastCoverage - this.cloudCoverage) > 0.01;
    if (!(this._envDirty || ((moved || clouds) && this._envTimer <= 0))) return;
    this._envTimer = 0.25;
    this._envDirty = false;
    this._lastEnvSun.copy(this.sunDir);
    this._lastCoverage = this.cloudCoverage;
    const eu = this.envSky.material.uniforms;
    for (const k of Object.keys(this.skyUniforms)) {
      if (k === 'showSunDisc') continue;
      const v = this.skyUniforms[k].value;
      if (v && v.copy) eu[k].value.copy(v);
      else eu[k].value = v;
    }
    this.cubeCamera.update(this.engine.renderer, this.envScene);
    this.envRT.texture.needsPMREMUpdate = true;
  }
}
