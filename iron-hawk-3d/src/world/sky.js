// Atmosphere: physical sky with its own clouds, a sun light that casts shadows around the
// player, image-based lighting baked from the sky, stars at dusk, and a fog colour read
// back from the sky's horizon so distant land melts into the sky without a seam.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from '../core/util.js';

export class Atmosphere {
  constructor(level, quality) {
    this.level = level;
    this.quality = quality;
    this.group = new THREE.Group();
    this.sunDir = new THREE.Vector3();
    const s = level.sky;
    const phi = THREE.MathUtils.degToRad(90 - s.elevation);
    const theta = THREE.MathUtils.degToRad(s.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);

    this.sky = new Sky();
    this.sky.scale.setScalar(40000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = s.turbidity;
    u.rayleigh.value = s.rayleigh;
    u.mieCoefficient.value = s.mie;
    u.mieDirectionalG.value = s.mieG;
    u.sunPosition.value.copy(this.sunDir);
    u.cloudCoverage.value = s.night ? 0.55 : level.id === 'canyon' ? 0.25 : 0.42;
    u.cloudDensity.value = 0.5;
    u.cloudElevation.value = 0.55;
    // horizon blend towards the fog colour
    u.uFogColor = { value: new THREE.Color() };
    u.uFogMix = { value: 0 };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform vec3 uFogColor;\nuniform float uFogMix;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );',
        'texColor = mix(uFogColor, texColor, mix(1.0, smoothstep(-0.02, 0.16, direction.y), uFogMix));\n\t\t\tgl_FragColor = vec4( texColor, 1.0 );');
    this.group.add(this.sky);

    // Sun
    this.sun = new THREE.DirectionalLight(level.sun.color, level.sun.intensity);
    this.sun.castShadow = quality.shadows > 0;
    if (this.sun.castShadow) {
      const sh = this.sun.shadow;
      sh.mapSize.set(quality.shadows, quality.shadows);
      const ext = 260;
      sh.camera.left = -ext; sh.camera.right = ext; sh.camera.top = ext; sh.camera.bottom = -ext;
      sh.camera.near = 10; sh.camera.far = 3000;
      sh.bias = -0.0004; sh.normalBias = 0.6;
      this.shadowTexel = (ext * 2) / quality.shadows;
    }
    this.group.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(level.hemi.sky, level.hemi.ground, level.hemi.intensity);
    this.group.add(this.hemi);

    if (s.night || s.elevation < 6) this.addStars(s.night ? 1 : 0.35);
  }

  addStars(strength) {
    const rand = mulberry32(99);
    const N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 30000; pos[i * 3 + 1] = y * 30000; pos[i * 3 + 2] = Math.sin(a) * r * 30000;
      const b = (0.3 + rand() * 0.7) * strength * 0.6;
      col[i * 3] = b; col[i * 3 + 1] = b * (0.9 + rand() * 0.1); col[i * 3 + 2] = b * (0.95 + rand() * 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true });
    this.stars = new THREE.Points(g, m);
    this.stars.renderOrder = -1;
    this.group.add(this.stars);
  }

  // Bake image-based lighting from the sky and read the horizon colour for the fog.
  bake(renderer, scene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.material = this.sky.material;
    skyCopy.scale.setScalar(1000);
    skyCopy.material.uniforms.uFogMix.value = 0;
    skyScene.add(skyCopy);
    const env = pmrem.fromScene(skyScene, 0, 0.1, 2000);
    this.envMap = env.texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = this.level.sky.night ? 0.55 : 0.85;

    // horizon colour: render a small cube map and average the horizon row of the side faces
    const fog = new THREE.Color(this.level.fog.color);
    try {
      const rt = new THREE.WebGLCubeRenderTarget(32, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(1, 5000, rt);
      skyScene.add(cam);
      cam.update(renderer, skyScene);
      const buf = new Uint16Array(32 * 4);
      let r = 0, g = 0, b = 0, count = 0;
      for (const face of [0, 1, 4, 5]) {
        for (const row of [15, 16]) {
          renderer.readRenderTargetPixels(rt, 0, row, 32, 1, buf, face);
          for (let i = 0; i < 32; i++) {
            const R = THREE.DataUtils.fromHalfFloat(buf[i * 4]), G = THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]), B = THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]);
            if (!(R + G + B < 3) || !(R + G + B > 0)) continue; // skip the sun disc and bad values
            r += R; g += G; b += B; count++;
          }
        }
      }
      if (count > 20) {
        const measured = new THREE.Color(r / count, g / count, b / count);
        // keep a little of the hand-picked tint (at the measured brightness) so dusk haze stays warm
        const tint = new THREE.Color(this.level.fog.color).convertSRGBToLinear();
        const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
        tint.multiplyScalar(lum(measured) / Math.max(1e-4, lum(tint)));
        fog.copy(measured).lerp(tint, 0.25);
      } else fog.convertSRGBToLinear();
      rt.dispose();
    } catch (e) {
      fog.convertSRGBToLinear();
    }
    pmrem.dispose();
    this.fogColor = fog;
    scene.fog = new THREE.FogExp2(fog, this.level.fog.density);
    this.sky.material.uniforms.uFogColor.value.copy(fog);
    this.sky.material.uniforms.uFogMix.value = 1;
    return fog;
  }

  update(dt, time, focus) {
    this.sky.material.uniforms.time.value = time;
    this.sky.position.copy(focus);
    if (this.stars) this.stars.position.copy(focus);
    // keep the shadow box centred on the player, snapped to texels to stop shimmering
    const t = this.sun.target.position;
    t.copy(focus);
    if (this.shadowTexel) {
      // snap in the light's own view plane
      const right = this._r || (this._r = new THREE.Vector3()), up = this._u || (this._u = new THREE.Vector3());
      right.crossVectors(this.sunDir, THREE.Object3D.DEFAULT_UP).normalize();
      up.crossVectors(right, this.sunDir).normalize();
      const a = t.dot(right), b = t.dot(up), c = t.dot(this.sunDir);
      const q = this.shadowTexel;
      t.copy(right).multiplyScalar(Math.round(a / q) * q).addScaledVector(up, Math.round(b / q) * q).addScaledVector(this.sunDir, c);
    }
    this.sun.position.copy(t).addScaledVector(this.sunDir, 1500);
    this.sun.target.updateMatrixWorld();
  }
}
