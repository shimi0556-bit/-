import * as THREE from 'three';

/**
 * What the water itself looks like from inside: shafts of sunlight slanting
 * down from the surface, shimmering and fading with depth, and marine snow
 * — fine specks drifting in the water all round. Only while the camera is
 * under the surface.
 */
export class Underwater {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'מתחת למים';
    this.group.visible = false;
    this.time = 0;
    // Light shafts: soft-edged planes hanging from the surface, turned to face the camera about their own axis.
    const N = 60;
    const geo = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, -0.5, 0);
    const ph = new Float32Array(N);
    for (let i = 0; i < N; i++) ph[i] = Math.random() * 100;
    geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(ph, 1));
    this.rayUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uGain: { value: 0 } };
    const U = this.rayUniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: /* glsl */ `
        attribute float iPhase;
        varying vec2 vUv; varying float vPh; varying float vDist;
        void main() {
          vUv = uv; vPh = iPhase;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vDist = length(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uGain;
        varying vec2 vUv; varying float vPh; varying float vDist;
        void main() {
          float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float down = pow(vUv.y, 1.6);
          float flicker = 0.55 + 0.45 * sin(uTime * 0.7 + vPh) * sin(uTime * 0.43 + vPh * 1.7);
          float near = smoothstep(1.5, 6.0, vDist) * (1.0 - smoothstep(30.0, 60.0, vDist));
          gl_FragColor = vec4(uColor * across * down * flicker * near * uGain, 1.0);
        }`,
    });
    this.rays = new THREE.InstancedMesh(geo, mat, N);
    this.rays.frustumCulled = false;
    this.rays.renderOrder = 5;
    this.rayList = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 90, z: (Math.random() - 0.5) * 90, w: 1.2 + Math.random() * 4.5, len: 20 + Math.random() * 25 }));
    this.group.add(this.rays);
    // Marine snow.
    const M = 2400;
    const pos = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.snowMat = new THREE.PointsMaterial({ map: tex, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false, color: 0xd8e4e8 });
    this.snow = new THREE.Points(pg, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 6; // after the water surface, which would otherwise paint over it
    this.snowOrigin = new THREE.Vector3();
    this.group.add(this.snow);
    engine.scene.add(this.group);
  }

  update(dt, under) {
    this.group.visible = under;
    if (!under) return;
    this.time += dt;
    const eng = this.engine;
    const cam = eng.camera.position;
    const atm = eng.atmosphere;
    const depth = Math.max(0, -cam.y);
    // Sun under water: bent toward the vertical, dimmer with depth.
    const L = atm.lightDir;
    const k = 1 / 1.333;
    const sx = -L.x * k;
    const sz = -L.z * k;
    const sy = -Math.sqrt(Math.max(0.05, 1 - sx * sx - sz * sz));
    const U = this.rayUniforms;
    U.uTime.value = this.time;
    U.uColor.value.copy(atm.keyLight.color).multiplyScalar(0.028 * atm.keyLight.intensity);
    U.uGain.value = atm.dayFactor * Math.exp(-depth * 0.045) * Math.max(0, L.y) ** 0.5;
    const axis = new THREE.Vector3(sx, sy, sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
    const m = new THREE.Matrix4();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    this.rayList.forEach((r, i) => {
      // Wrap round the camera.
      r.x = cam.x + ((((r.x - cam.x + 45) % 90) + 90) % 90) - 45;
      r.z = cam.z + ((((r.z - cam.z + 45) % 90) + 90) % 90) - 45;
      const top = new THREE.Vector3(r.x, 0, r.z);
      // Face the camera round the shaft's own axis.
      toCam.copy(cam).sub(top);
      side.crossVectors(axis, toCam).normalize();
      fwd.crossVectors(side, axis).normalize();
      m.makeBasis(side.multiplyScalar(r.w), axis.clone().multiplyScalar(-r.len), fwd);
      m.setPosition(top);
      this.rays.setMatrixAt(i, m);
    });
    this.rays.instanceMatrix.needsUpdate = true;
    // Snow drifts past; the cloud follows the camera (wrapping).
    const p = this.snow.geometry.attributes.position;
    const a = p.array;
    const dx = cam.x - this.snowOrigin.x;
    const dy = cam.y - this.snowOrigin.y;
    const dz = cam.z - this.snowOrigin.z;
    this.snowOrigin.copy(cam);
    for (let i = 0; i < a.length; i += 3) {
      a[i] -= dx - Math.sin(this.time * 0.1 + i) * 0.02 * dt;
      a[i + 1] -= dy + 0.05 * dt;
      a[i + 2] -= dz;
      for (let j = 0; j < 3; j++) {
        if (a[i + j] > 20) a[i + j] -= 40;
        else if (a[i + j] < -20) a[i + j] += 40;
      }
    }
    p.needsUpdate = true;
    this.snow.position.copy(cam);
    this.snowMat.opacity = 0.45 + 0.35 * Math.min(1, depth / 15);
  }
}
