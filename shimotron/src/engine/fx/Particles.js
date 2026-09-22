import * as THREE from 'three';
import { fogUniforms } from '../render/HeightFog.js';

/**
 * Pooled billboard particles. One ParticleSystem = one draw call
 * (instanced quads, no point-size limits). Emitters feed systems with
 * spawn rate, cone velocity, lifetime curves, gravity, drag, curl-ish
 * turbulence and optional velocity stretching (sparks).
 */
export class ParticleSystem {
  constructor(engine, { name, texture, max = 2000, additive = true, lit = false, stretch = 0, softness = 1 }) {
    this.engine = engine;
    this.max = max;
    this.count = 0;
    this.lit = lit;
    this.additive = additive;
    // Simulation arrays (struct of arrays).
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.turb = new Float32Array(max);

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSizeRot = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOffset', this.aOffset);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSizeRot', this.aSizeRot);
    geo.setAttribute('aVel', this.aVel);
    geo.instanceCount = 0;

    this.uniforms = {
      ...fogUniforms(),
      tMap: { value: texture },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uStretch: { value: stretch },
      uSoft: { value: softness },
    };
    const material = new THREE.ShaderMaterial({
      name: `particles-${name}`,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec4 aColor; attribute vec2 aSizeRot; attribute vec3 aVel;
        uniform float uStretch;
        varying vec2 vUv; varying vec4 vColor;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
          vec2 corner = position.xy * aSizeRot.x;
          if (uStretch > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
            float sp = length(vv.xy);
            vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
            vec2 side = vec2(-dir.y, dir.x);
            corner = side * position.x * aSizeRot.x + dir * position.y * (aSizeRot.x + sp * uStretch);
          } else {
            float c = cos(aSizeRot.y), s = sin(aSizeRot.y);
            corner = mat2(c, s, -s, c) * corner;
          }
          mvPosition.xy += corner;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec3 uLight;
        varying vec2 vUv; varying vec4 vColor;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(tMap, vUv);
          vec4 c = vec4(vColor.rgb * t.rgb * uLight, vColor.a * t.a);
          if (c.a < 0.003) discard;
          gl_FragColor = c;
          ${additive ? '#ifdef USE_FOG\n float fogA = shimoFogAmount(cameraPosition, vFogWorldPos); gl_FragColor.rgb *= 1.0 - fogA;\n#endif' : '#include <fog_fragment>'}
        }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.renderOrder = additive ? 20 : 15;
    this.mesh.userData.noPick = true;
    engine.scene.add(this.mesh);
  }

  /** Spawns one particle; returns false when the pool is full. */
  emit(p) {
    if (this.count >= this.max) return false;
    const i = this.count++;
    const i3 = i * 3;
    const i4 = i * 4;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx;
    this.vel[i3 + 1] = p.vy;
    this.vel[i3 + 2] = p.vz;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.size0[i] = p.size0;
    this.size1[i] = p.size1;
    this.rot[i] = p.rot || 0;
    this.spin[i] = p.spin || 0;
    this.c0.set(p.color0, i4);
    this.c1.set(p.color1, i4);
    this.gravity[i] = p.gravity || 0;
    this.drag[i] = p.drag || 0;
    this.turb[i] = p.turbulence || 0;
    return true;
  }

  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    const mv3 = (a) => {
      a[i * 3] = a[last * 3];
      a[i * 3 + 1] = a[last * 3 + 1];
      a[i * 3 + 2] = a[last * 3 + 2];
    };
    const mv4 = (a) => {
      for (let k = 0; k < 4; k++) a[i * 4 + k] = a[last * 4 + k];
    };
    mv3(this.pos);
    mv3(this.vel);
    mv4(this.c0);
    mv4(this.c1);
    for (const a of [this.life, this.maxLife, this.size0, this.size1, this.rot, this.spin, this.gravity, this.drag, this.turb]) a[i] = a[last];
  }

  update(dt, time) {
    const off = this.aOffset.array;
    const col = this.aColor.array;
    const sr = this.aSizeRot.array;
    const av = this.aVel.array;
    for (let i = 0; i < this.count; ) {
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) {
        this._kill(i);
        continue;
      }
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      const tb = this.turb[i];
      let vx = this.vel[i3] * d;
      let vy = this.vel[i3 + 1] * d - this.gravity[i] * dt;
      let vz = this.vel[i3 + 2] * d;
      if (tb > 0) {
        const px = this.pos[i3];
        const py = this.pos[i3 + 1];
        const pz = this.pos[i3 + 2];
        vx += Math.sin(py * 1.7 + time * 2.1 + pz * 0.9) * tb * dt;
        vz += Math.cos(py * 1.3 - time * 1.7 + px * 1.1) * tb * dt;
        vy += Math.sin(px * 0.8 + pz * 0.7 + time) * tb * 0.3 * dt;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] += vy * dt;
      this.pos[i3 + 2] += vz * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    // Upload.
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      const t = this.life[i] / this.maxLife[i];
      off[i3] = this.pos[i3];
      off[i3 + 1] = this.pos[i3 + 1];
      off[i3 + 2] = this.pos[i3 + 2];
      av[i3] = this.vel[i3];
      av[i3 + 1] = this.vel[i3 + 1];
      av[i3 + 2] = this.vel[i3 + 2];
      // Colour: lerp c0→c1, alpha shaped with a fade-in/out envelope.
      const env = Math.min(1, t * 8) * (1 - t) * (1 - t) * 1.6;
      for (let k = 0; k < 3; k++) col[i4 + k] = this.c0[i4 + k] + (this.c1[i4 + k] - this.c0[i4 + k]) * t;
      col[i4 + 3] = (this.c0[i4 + 3] + (this.c1[i4 + 3] - this.c0[i4 + 3]) * t) * Math.min(1, env);
      sr[i * 2] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      sr[i * 2 + 1] = this.rot[i];
    }
    const geo = this.mesh.geometry;
    geo.instanceCount = this.count;
    if (this.count > 0) {
      for (const a of [this.aOffset, this.aColor, this.aSizeRot, this.aVel]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.count * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
}

/** Continuous or burst source feeding a ParticleSystem. */
export class Emitter {
  constructor(system, opts) {
    this.system = system;
    this.position = opts.position ? opts.position.clone() : new THREE.Vector3();
    this.rate = opts.rate ?? 30;
    this.enabled = opts.enabled !== false;
    this.o = {
      spread: 0.3,
      radius: 0.2,
      speed: [1, 2],
      dir: new THREE.Vector3(0, 1, 0),
      life: [1, 2],
      size0: [0.3, 0.5],
      size1: [0.1, 0.2],
      color0: [1, 1, 1, 1],
      color1: [1, 1, 1, 0],
      gravity: 0,
      drag: 0,
      turbulence: 0,
      spin: 1,
      intensity: 1,
      ...opts,
    };
    this._acc = 0;
    this.scale = 1;
  }

  update(dt) {
    if (!this.enabled) return;
    this._acc += dt * this.rate * this.scale;
    while (this._acc >= 1) {
      this._acc -= 1;
      this.spawnOne();
    }
  }

  burst(n, at) {
    if (at) this.position.copy(at);
    for (let i = 0; i < n; i++) this.spawnOne();
  }

  spawnOne() {
    const o = this.o;
    const r = (a) => a[0] + Math.random() * (a[1] - a[0]);
    // Random direction within a cone around o.dir.
    const u = Math.random() * Math.PI * 2;
    const c = 1 - Math.random() * (1 - Math.cos(o.spread));
    const s = Math.sqrt(1 - c * c);
    const local = new THREE.Vector3(Math.cos(u) * s, c, Math.sin(u) * s);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), o.dir);
    local.applyQuaternion(q);
    const sp = r(o.speed);
    const rr = Math.sqrt(Math.random()) * o.radius;
    const ra = Math.random() * Math.PI * 2;
    const k = o.intensity;
    this.system.emit({
      x: this.position.x + Math.cos(ra) * rr,
      y: this.position.y,
      z: this.position.z + Math.sin(ra) * rr,
      vx: local.x * sp,
      vy: local.y * sp,
      vz: local.z * sp,
      life: r(o.life),
      size0: r(o.size0),
      size1: r(o.size1),
      rot: Math.random() * 6.28,
      spin: (Math.random() - 0.5) * o.spin,
      color0: [o.color0[0] * k, o.color0[1] * k, o.color0[2] * k, o.color0[3]],
      color1: [o.color1[0] * k, o.color1[1] * k, o.color1[2] * k, o.color1[3]],
      gravity: o.gravity,
      drag: o.drag,
      turbulence: o.turbulence,
    });
  }
}

/**
 * Engine-level particle manager: owns the shared systems and emitters,
 * keeps fire HDR-consistent with exposure and smoke lit by the sky.
 */
export class Particles {
  constructor(engine, materials) {
    this.engine = engine;
    const T = materials.textures;
    const q = engine.quality.settings.particlesScale;
    this.systems = {
      fire: new ParticleSystem(engine, { name: 'אש', texture: T.flame, max: Math.round(900 * q), additive: true }),
      smoke: new ParticleSystem(engine, { name: 'עשן', texture: T.smoke, max: Math.round(500 * q), additive: false, lit: true }),
      sparks: new ParticleSystem(engine, { name: 'ניצוצות', texture: T.spark, max: Math.round(1600 * q), additive: true, stretch: 0.045 }),
      glow: new ParticleSystem(engine, { name: 'זוהר', texture: T.softDot, max: Math.round(1400 * q), additive: true }),
      dust: new ParticleSystem(engine, { name: 'אבק', texture: T.smoke, max: Math.round(600 * q), additive: false, lit: true }),
    };
    this.emitters = [];
    this.materials = materials;
  }

  add(emitter) {
    this.emitters.push(emitter);
    return emitter;
  }

  remove(emitter) {
    const i = this.emitters.indexOf(emitter);
    if (i >= 0) this.emitters.splice(i, 1);
  }

  /** Burst of sparks + dust at an impact point. */
  impact(point, normal, strength = 1) {
    const n = normal || new THREE.Vector3(0, 1, 0);
    const sparks = new Emitter(this.systems.sparks, {
      position: point,
      dir: n,
      spread: 1.1,
      speed: [3 * strength, 9 * strength],
      life: [0.25, 0.7],
      size0: [0.03, 0.06],
      size1: [0.01, 0.02],
      color0: [1.0, 0.75, 0.35, 1],
      color1: [1.0, 0.3, 0.05, 1],
      gravity: 12,
      drag: 1.5,
      intensity: 18,
    });
    sparks.burst(Math.round(10 + strength * 14));
    const dust = new Emitter(this.systems.dust, {
      position: point,
      dir: n,
      spread: 1.3,
      speed: [0.6, 1.8],
      life: [0.8, 1.6],
      size0: [0.25, 0.4],
      size1: [0.9, 1.6],
      color0: [0.62, 0.56, 0.48, 0.5],
      color1: [0.62, 0.56, 0.48, 0],
      drag: 2.2,
      turbulence: 0.6,
      gravity: -0.2,
    });
    dust.burst(Math.round(4 + strength * 4));
  }

  update(dt) {
    if (dt <= 0) return;
    const eng = this.engine;
    const atm = eng.atmosphere;
    const t = eng.time.elapsed;
    for (const e of this.emitters) e.update(dt);
    // Lit systems see sky + sun irradiance; emissive systems follow exposure.
    const irr = atm.skyIrradiance;
    const kl = atm.keyLight;
    const lit = new THREE.Color(irr[0], irr[1], irr[2]).multiplyScalar(0.55);
    lit.add(kl.color.clone().multiplyScalar(kl.intensity * 0.35));
    lit.multiplyScalar(1 / Math.PI);
    const emissive = this.materials.emissiveScale || 1;
    for (const s of Object.values(this.systems)) {
      if (s.lit) s.uniforms.uLight.value.copy(lit);
      else s.uniforms.uLight.value.setScalar(emissive * 0.25);
      s.update(dt, t);
    }
  }
}
