import * as THREE from 'three';

/**
 * Tyre marks: one ring-buffer mesh of quads shared by every car. Each wheel
 * keeps its last contact point; while it slides a quad is laid from there
 * to the new point with an alpha from the slip amount. Old quads are
 * overwritten first, so memory is fixed.
 */
export class SkidMarks {
  constructor(max = 5000) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = geo;
    const mat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'סימני צמיגים';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.noPick = true;
    this.head = 0;
    this.dirty = false;
    this._from = -1; // first quad written since the last upload (ring order)
    this._count = 0;
  }

  /** Lays one segment. a/b: {x,y,z} centre points, side: unit right vector, width metres, alpha 0..1, tint rgb. */
  add(a, b, side, width, alpha, tint = [1, 1, 1]) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    if (this._from < 0) this._from = i;
    this._count = Math.min(this.max, this._count + 1);
    const hw = width / 2;
    const p = this.pos;
    const o = i * 12;
    p[o] = a.x - side.x * hw;
    p[o + 1] = a.y;
    p[o + 2] = a.z - side.z * hw;
    p[o + 3] = a.x + side.x * hw;
    p[o + 4] = a.y;
    p[o + 5] = a.z + side.z * hw;
    p[o + 6] = b.x - side.x * hw;
    p[o + 7] = b.y;
    p[o + 8] = b.z - side.z * hw;
    p[o + 9] = b.x + side.x * hw;
    p[o + 10] = b.y;
    p[o + 11] = b.z + side.z * hw;
    const c = this.col;
    const k = i * 16;
    for (let v = 0; v < 4; v++) {
      c[k + v * 4] = tint[0];
      c[k + v * 4 + 1] = tint[1];
      c[k + v * 4 + 2] = tint[2];
      c[k + v * 4 + 3] = alpha;
    }
    this.dirty = true;
  }

  /** Uploads only the quads written this frame (one or two ranges of the ring), not the whole buffer. */
  update() {
    if (!this.dirty) return;
    const pa = this.posAttr;
    const ca = this.colAttr;
    pa.clearUpdateRanges();
    ca.clearUpdateRanges();
    if (this._from >= 0 && this._count < this.max) {
      const a = this._from;
      const first = Math.min(this._count, this.max - a);
      pa.addUpdateRange(a * 12, first * 12);
      ca.addUpdateRange(a * 16, first * 16);
      if (first < this._count) {
        pa.addUpdateRange(0, (this._count - first) * 12);
        ca.addUpdateRange(0, (this._count - first) * 16);
      }
    }
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    this.dirty = false;
    this._from = -1;
    this._count = 0;
  }

  clear() {
    this.col.fill(0);
    this.pos.fill(0);
    this.dirty = true;
    this._from = -1;
    this._count = this.max; // whole buffer
  }
}

/**
 * Weather around the camera: snow, desert dust or volcanic ash with glowing
 * embers. A fixed cloud of points wraps inside a box that follows the
 * camera, animated fully in the vertex shader (one draw call).
 */
export class Weather {
  constructor(engine, kind) {
    this.engine = engine;
    this.kind = kind;
    const preset = {
      snow: { count: 9000, box: [70, 40, 70], fall: 1.6, drift: 0.9, size: 0.09, color: [1, 1, 1], alpha: 0.9, emissive: 0 },
      dust: { count: 7000, box: [60, 12, 60], fall: 0.15, drift: 9, size: 0.03, color: [0.95, 0.72, 0.48], alpha: 0.45, emissive: 0 },
      ash: { count: 6000, box: [70, 40, 70], fall: 0.7, drift: 1.4, size: 0.07, color: [0.3, 0.29, 0.28], alpha: 0.85, emissive: 0.08 },
    }[kind];
    this.preset = preset;
    const n = preset.count;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...preset.box) },
      uFall: { value: preset.fall },
      uDrift: { value: preset.drift },
      uWind: { value: new THREE.Vector2(1, 0.4) },
      uSize: { value: preset.size },
      uColor: { value: new THREE.Color(...preset.color) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uAlpha: { value: preset.alpha },
      uEmber: { value: kind === 'ash' ? 1 : 0 },
      uEmberGain: { value: 1 },
      uPixel: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uFall, uDrift, uSize, uPixel, uEmber;
        uniform vec3 uCam, uBox;
        uniform vec2 uWind;
        varying float vFade;
        varying float vEmber;
        void main() {
          vec3 p = aSeed.xyz * uBox;
          float t = uTime * (0.7 + aSeed.w * 0.6);
          p.y -= t * uFall;
          p.xz += uWind * t * uDrift + vec2(sin(t * 0.9 + aSeed.w * 40.0), cos(t * 0.7 + aSeed.x * 31.0)) * 0.6;
          // Wrap inside a box centred on the camera.
          vec3 origin = uCam - uBox * 0.5;
          p = origin + mod(p - origin, uBox);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          vEmber = step(0.94, aSeed.w) * uEmber;
          float size = uSize * (1.0 + vEmber * 0.6);
          gl_PointSize = clamp(size * uPixel * 800.0 / max(dist, 0.5), 1.0, 64.0);
          vec3 d = abs(p - uCam) / (uBox * 0.5);
          vFade = (1.0 - smoothstep(0.7, 1.0, max(d.x, max(d.y, d.z)))) * smoothstep(0.4, 2.0, dist);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uLight;
        uniform float uAlpha, uEmberGain;
        varying float vFade;
        varying float vEmber;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r = dot(c, c);
          if (r > 1.0) discard;
          float a = (1.0 - r) * uAlpha * vFade;
          vec3 col = uColor * uLight;
          col = mix(col, vec3(1.0, 0.35, 0.06) * uEmberGain, vEmber);
          gl_FragColor = vec4(col, a * (1.0 + vEmber));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.name = 'מזג אוויר';
    this.points.userData.noPick = true;
  }

  update(dt) {
    const eng = this.engine;
    const atm = eng.atmosphere;
    const u = this.uniforms;
    u.uTime.value = eng.time.elapsed;
    u.uCam.value.copy(eng.camera.position);
    u.uWind.value.copy(atm.wind.dir).multiplyScalar(atm.wind.strength);
    u.uPixel.value = eng.renderer.getPixelRatio() * (eng.renderer.domElement.height / eng.renderer.getPixelRatio() / 900);
    // Lit like the particles: sky + sun irradiance, scaled by exposure in the pipeline.
    const irr = atm.skyIrradiance;
    const kl = atm.keyLight;
    u.uLight.value.setRGB(irr[0], irr[1], irr[2]).multiplyScalar(0.6);
    u.uLight.value.add(kl.color.clone().multiplyScalar(kl.intensity * 0.3));
    u.uLight.value.multiplyScalar(1 / Math.PI);
    u.uEmberGain.value = (eng.materials.emissiveScale || 1) * 1.6;
  }
}
