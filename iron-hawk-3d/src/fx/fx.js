// Effects: pooled GPU particles (fire, smoke, sparks, tracers), flying debris, pooled
// point lights for explosion flashes, warning beacons on the ground and shake requests.
import * as THREE from 'three';
import { makeSoftSprite, makePuffSprite, canvasTexture } from '../core/textures.js';

const _c0 = new THREE.Color(), _c1 = new THREE.Color();
const rnd = Math.random;
function randDir(out) { // uniform direction on the sphere
  const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return out.set(Math.cos(a) * r, u, Math.sin(a) * r);
}

// Camera-facing quads in one instanced draw call. The CPU writes position, size, colour,
// rotation and (for streaks) velocity; the vertex shader builds the billboard.
export class ParticlePool {
  constructor(max, { additive = false, texture, fogDensity = 0.0002, fogColor = new THREE.Color() } = {}) {
    this.max = max;
    this.count = 0;
    this.additive = additive;
    // simulation state (struct of arrays)
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.a = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.rot = new Float32Array(max); this.rotV = new Float32Array(max); this.stretch = new Float32Array(max);
    // render attributes
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aCol = mk(4); this.aSR = mk(2); this.aVel = mk(4);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iSR', this.aSR); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    this.uniforms = {
      map: { value: texture },
      uFogDensity: { value: fogDensity },
      uFogColor: { value: fogColor.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
attribute vec3 iPos; attribute vec4 iColor; attribute vec2 iSR; attribute vec4 iVel;
uniform float uFogDensity;
varying vec2 vUv; varying vec4 vColor; varying float vFog;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;
  float size = iSR.x;
  if (iVel.w > 0.0) {
    vec3 vv = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz;
    // perspective-correct streak length on screen
    vec2 d = vv.xy - mv.xy * (vv.z / min(mv.z, -0.1));
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size + length(iVel.xyz) * iVel.w;
    mv.xy += dir * corner.y * len + perp * corner.x * size;
  } else {
    float c = cos(iSR.y), s = sin(iSR.y);
    mv.xy += mat2(c, s, -s, c) * corner * size;
  }
  vUv = uv;
  vColor = iColor;
  float dist = -mv.z;
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform sampler2D map; uniform vec3 uFogColor;
varying vec2 vUv; varying vec4 vColor; varying float vFog;
void main() {
  float a = texture2D(map, vUv).a * vColor.a;
  if (a < 0.004) discard;
  ${additive
    ? 'gl_FragColor = vec4(vColor.rgb * (1.0 - vFog), a);'
    : 'gl_FragColor = vec4(mix(vColor.rgb, uFogColor, vFog), a * (1.0 - vFog * 0.5));'}
}`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 6;
    this.geometry = g;
  }

  // Simulated particle. Colours are linear RGB triplets (may exceed 1 for glow).
  add(px, py, pz, vx, vy, vz, life, s0, s1, c0, c1, alpha, drag = 0, grav = 0, stretch = 0, rotV = 0) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(rnd() * this.max); // full: recycle a random slot
    else this.count++;
    const i3 = i * 3;
    this.p[i3] = px; this.p[i3 + 1] = py; this.p[i3 + 2] = pz;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
    this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
    this.a[i] = alpha; this.drag[i] = drag; this.grav[i] = grav; this.stretch[i] = stretch;
    this.rot[i] = rnd() * Math.PI * 2; this.rotV[i] = rotV;
  }

  kill(i) {
    const last = --this.count;
    if (i === last) return;
    const copy = (arr, n) => { for (let k = 0; k < n; k++) arr[i * n + k] = arr[last * n + k]; };
    copy(this.p, 3); copy(this.v, 3); copy(this.c0, 3); copy(this.c1, 3);
    for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.a, this.drag, this.grav, this.rot, this.rotV, this.stretch]) arr[i] = arr[last];
  }

  update(dt) {
    const P = this.p, Vv = this.v;
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSR.array, av = this.aVel.array;
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this.kill(i); continue; }
    }
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3, i4 = i * 4, i2 = i * 2;
      const t = this.life[i] / this.maxLife[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      Vv[i3] *= k; Vv[i3 + 1] = Vv[i3 + 1] * k + this.grav[i] * dt; Vv[i3 + 2] *= k;
      P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      const grow = 1 - (1 - t) * (1 - t);
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      ap[i3] = P[i3]; ap[i3 + 1] = P[i3 + 1]; ap[i3 + 2] = P[i3 + 2];
      ac[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      ac[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      ac[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      ac[i4 + 3] = this.a[i] * fade;
      as[i2] = this.s0[i] + (this.s1[i] - this.s0[i]) * grow;
      as[i2 + 1] = this.rot[i];
      av[i4] = Vv[i3]; av[i4 + 1] = Vv[i3 + 1]; av[i4 + 2] = Vv[i3 + 2]; av[i4 + 3] = this.stretch[i];
    }
    this.flush(this.count);
  }

  // Direct mode: the caller fills slots itself (used for bullets and projectiles).
  setDirect(i, px, py, pz, vx, vy, vz, size, r, g, b, a, stretch) {
    const i3 = i * 3, i4 = i * 4, i2 = i * 2;
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSR.array, av = this.aVel.array;
    ap[i3] = px; ap[i3 + 1] = py; ap[i3 + 2] = pz;
    ac[i4] = r; ac[i4 + 1] = g; ac[i4 + 2] = b; ac[i4 + 3] = a;
    as[i2] = size; as[i2 + 1] = 0;
    av[i4] = vx; av[i4 + 1] = vy; av[i4 + 2] = vz; av[i4 + 3] = stretch;
  }

  flush(n) {
    this.geometry.instanceCount = n;
    for (const [attr, w] of [[this.aPos, 3], [this.aCol, 4], [this.aSR, 2], [this.aVel, 4]]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n) * w);
      attr.needsUpdate = true;
    }
  }

  setFog(color, density) { this.uniforms.uFogColor.value.copy(color); this.uniforms.uFogDensity.value = density; }
}

const lin = (hex, mul = 1) => { const c = new THREE.Color(hex); return [c.r * mul, c.g * mul, c.b * mul]; };

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    const pmul = quality.particles ?? 1;
    this.soft = canvasTexture(makeSoftSprite(128, 0), false);
    this.puff = canvasTexture(makePuffSprite(256, 11), false);
    this.add = new ParticlePool(Math.round(3000 * pmul), { additive: true, texture: this.soft });
    this.smoke = new ParticlePool(Math.round(2200 * pmul), { additive: false, texture: this.puff });
    scene.add(this.add.mesh, this.smoke.mesh);
    this.density = pmul;
    this.theme = { dust: lin(0x8a7a60), smoke: lin(0x2a2826), smokeLight: lin(0x6a6460) };
    this.shakeListeners = [];

    // debris chunks
    const N = 160;
    this.debris = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, emissive: 0xff5a10, emissiveIntensity: 0.0 }), N);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.debris.castShadow = false;
    this.debrisList = [];
    scene.add(this.debris);
    this._dummy = new THREE.Object3D();

    // flash lights (a fixed number so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < (quality.lights ?? 2); i++) {
      const l = new THREE.PointLight(0xffa050, 0, 0, 2);
      l.userData = { t: 1, dur: 1, peak: 0 };
      scene.add(l);
      this.lights.push(l);
    }

    // warning beacons (meteor impact zones)
    this.beacons = [];
    this.beaconGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0);
    this.beaconMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(4, 0.6, 0.2) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float a = pow(1.0 - vUv.y, 2.5) * (0.55 + 0.45 * sin(uTime * 14.0));
  float bands = 0.6 + 0.4 * step(0.5, fract(vUv.y * 6.0 - uTime * 2.0));
  gl_FragColor = vec4(uColor * a * bands, a);
}`,
    });
  }

  setTheme(level, fogColor, fogDensity) {
    const dust = { valley: 0x8a7a60, canyon: 0xb07a50, volcano: 0x4a3c38 }[level.id] || 0x8a7a60;
    this.theme.dust = lin(dust);
    this.theme.smoke = level.id === 'volcano' ? lin(0x1a1414) : lin(0x2a2826);
    this.theme.smokeLight = level.id === 'volcano' ? lin(0x3a2e2c) : lin(0x77706a);
    this.add.setFog(fogColor, fogDensity);
    this.smoke.setFog(fogColor, fogDensity);
  }

  onShake(fn) { this.shakeListeners.push(fn); }
  shake(pos, amount) { for (const fn of this.shakeListeners) fn(pos, amount); }

  n(count) { return Math.max(1, Math.round(count * this.density)); }

  flash(pos, size, color = 0xffa050) {
    if (!this.lights.length) return;
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t / l.userData.dur > best.userData.t / best.userData.dur) best = l;
    best.position.copy(pos);
    best.color.set(color);
    best.userData = { t: 0, dur: 0.35 + size * 0.1, peak: 9e4 * size * size };
    best.distance = 260 * size;
  }

  // ---------------------------------------------------------------- recipes
  explosion(pos, size = 1) {
    const s = size;
    const A = this.add, S = this.smoke, v = new THREE.Vector3();
    A.add(pos.x, pos.y, pos.z, 0, 0, 0, 0.22, 18 * s, 46 * s, [6, 5, 3.5], [3, 1.2, 0.3], 1);
    const nf = this.n(Math.min(70, 14 * s + 6));
    for (let i = 0; i < nf; i++) {
      randDir(v);
      const sp = (8 + rnd() * 26) * Math.sqrt(s);
      A.add(pos.x + v.x * 2 * s, pos.y + v.y * 2 * s, pos.z + v.z * 2 * s, v.x * sp, v.y * sp + 4, v.z * sp,
        0.5 + rnd() * 0.7, 5 * s, (12 + rnd() * 10) * s, [5, 3.4, 1.4], [1.6, 0.35, 0.06], 0.85, 2.6, 6, 0, (rnd() - 0.5) * 2);
    }
    const ns = this.n(Math.min(46, 8 * s + 4));
    const sm = this.theme.smoke, sl = this.theme.smokeLight;
    for (let i = 0; i < ns; i++) {
      randDir(v);
      const sp = (4 + rnd() * 14) * Math.sqrt(s);
      S.add(pos.x + v.x * 3 * s, pos.y + v.y * 2 * s, pos.z + v.z * 3 * s, v.x * sp, Math.abs(v.y) * sp + 6, v.z * sp,
        2.6 + rnd() * 2.5, 7 * s, (24 + rnd() * 18) * s, sl, sm, 0.62, 1.2, 2.5, 0, (rnd() - 0.5) * 0.6);
    }
    const nk = this.n(Math.min(80, 18 * s + 8));
    for (let i = 0; i < nk; i++) {
      randDir(v);
      const sp = (40 + rnd() * 90) * Math.sqrt(s);
      A.add(pos.x, pos.y, pos.z, v.x * sp, v.y * sp + 15, v.z * sp, 0.6 + rnd() * 0.9, 0.45 * Math.sqrt(s), 0.25,
        [6, 3.6, 1.2], [2.2, 0.5, 0.1], 1, 0.7, -38, 0.035);
    }
    this.spawnDebris(pos, Math.min(10, Math.round(2 + s * 2)), s);
    this.flash(pos, Math.min(4, s));
    this.shake(pos, s);
  }

  sparks(pos, size = 0.5, color = 0xffc070) {
    const c = lin(color, 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < this.n(8 + size * 10); i++) {
      randDir(v);
      const sp = 30 + rnd() * 60;
      this.add.add(pos.x, pos.y, pos.z, v.x * sp, v.y * sp, v.z * sp, 0.25 + rnd() * 0.35, 0.3, 0.1, c, [c[0] * 0.3, c[1] * 0.15, c[2] * 0.05], 1, 1.5, -25, 0.03);
    }
    this.add.add(pos.x, pos.y, pos.z, 0, 0, 0, 0.08, 2.5 * size + 1.5, 4 * size + 2, [c[0], c[1], c[2]], [c[0] * 0.5, c[1] * 0.4, c[2] * 0.2], 0.9);
  }

  hitFlash(pos, size = 1) { // bullet hits on a monster: a hot flash and a few sparks, no gore
    this.add.add(pos.x, pos.y, pos.z, 0, 0, 0, 0.1, 2 * size, 5 * size, [5, 4, 2.4], [2, 0.8, 0.2], 1);
    const v = new THREE.Vector3();
    for (let i = 0; i < this.n(4); i++) {
      randDir(v);
      this.add.add(pos.x, pos.y, pos.z, v.x * 35, v.y * 35 + 10, v.z * 35, 0.3, 0.25, 0.1, [5, 3, 1], [1.5, 0.4, 0.1], 1, 1, -30, 0.03);
    }
  }

  smokePuff(pos, size = 2) {
    const sm = this.theme.smoke;
    this.smoke.add(pos.x + (rnd() - 0.5) * size, pos.y, pos.z + (rnd() - 0.5) * size, (rnd() - 0.5) * 3, 3 + rnd() * 3, (rnd() - 0.5) * 3,
      1.8 + rnd(), size, size * 3.5, sm, sm, 0.5, 0.6, 1);
  }

  dust(pos, size = 5) {
    const d = this.theme.dust, v = new THREE.Vector3();
    const n = this.n(Math.min(40, 10 + size * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      v.set(Math.cos(a), 0.1 + rnd() * 0.25, Math.sin(a));
      const sp = size * (1.2 + rnd() * 1.6);
      this.smoke.add(pos.x + v.x * size * 0.4, pos.y + 1, pos.z + v.z * size * 0.4, v.x * sp, v.y * sp, v.z * sp,
        2 + rnd() * 1.5, size * 0.4, size * (1.2 + rnd() * 0.6), d, [d[0] * 0.8, d[1] * 0.8, d[2] * 0.8], 0.55, 1.4, 0.5);
    }
  }

  embers(pos, size = 1) {
    const v = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      randDir(v);
      this.add.add(pos.x, pos.y, pos.z, v.x * 3, 4 + rnd() * 6, v.z * 3, 1 + rnd(), size * 0.25, size * 0.08, [5, 1.8, 0.4], [1.5, 0.2, 0.02], 1, 0.4, 2);
    }
  }

  splash(pos, size = 1) {
    const v = new THREE.Vector3();
    for (let i = 0; i < this.n(14 * size); i++) {
      randDir(v); v.y = Math.abs(v.y) * 2 + 0.6;
      const sp = (6 + rnd() * 12) * size;
      this.smoke.add(pos.x, pos.y, pos.z, v.x * sp * 0.6, v.y * sp, v.z * sp * 0.6, 0.9 + rnd() * 0.6, 1.2 * size, 4 * size,
        [0.75, 0.82, 0.86], [0.55, 0.62, 0.66], 0.65, 0.5, -22);
    }
  }

  groundHit(pos, water, lava) {
    if (water) { this.splash(pos, 0.5); return; }
    const d = lava ? [3, 0.8, 0.15] : this.theme.dust;
    this.smoke.add(pos.x, pos.y + 0.5, pos.z, (rnd() - 0.5) * 3, 4 + rnd() * 3, (rnd() - 0.5) * 3, 0.9 + rnd() * 0.5, 1, 4.5, d, d, 0.5, 1.5, 0);
    if (rnd() < 0.4) this.sparks(pos, 0.15, lava ? 0xff6a20 : 0xffd090);
  }

  muzzle(pos, dir) {
    this.add.add(pos.x + dir.x * 1.2, pos.y + dir.y * 1.2, pos.z + dir.z * 1.2, dir.x * 40, dir.y * 40, dir.z * 40, 0.05, 1.4, 2.6,
      [6, 4.5, 2.2], [3, 1.6, 0.4], 1, 0, 0, 0.02);
  }

  trail(pos, vel, kind = 'missile') {
    if (kind === 'missile') {
      const sl = this.theme.smokeLight;
      this.smoke.add(pos.x, pos.y, pos.z, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2 + 1, (rnd() - 0.5) * 2, 1.4 + rnd() * 0.8, 1.2, 6,
        [sl[0] * 1.6, sl[1] * 1.6, sl[2] * 1.6], sl, 0.5, 0.8, 1.5);
      this.add.add(pos.x, pos.y, pos.z, vel.x * 0.2, vel.y * 0.2, vel.z * 0.2, 0.07, 1.6, 0.6, [6, 3.5, 1.2], [3, 0.8, 0.1], 1);
    } else if (kind === 'fire') {
      this.add.add(pos.x + (rnd() - 0.5), pos.y + (rnd() - 0.5), pos.z + (rnd() - 0.5), (rnd() - 0.5) * 4, (rnd() - 0.5) * 4 + 2, (rnd() - 0.5) * 4,
        0.35 + rnd() * 0.25, 3.5, 1.2, [5, 2.2, 0.5], [1.4, 0.2, 0.02], 0.8, 1.5);
      if (rnd() < 0.35) this.smokePuff(pos, 2);
    } else if (kind === 'acid') {
      this.add.add(pos.x + (rnd() - 0.5), pos.y + (rnd() - 0.5), pos.z + (rnd() - 0.5), (rnd() - 0.5) * 3, -3, (rnd() - 0.5) * 3,
        0.4 + rnd() * 0.3, 2.2, 0.6, [1.2, 4.5, 0.6], [0.2, 1.2, 0.1], 0.8, 1, -10);
    } else if (kind === 'meteor') {
      this.add.add(pos.x + (rnd() - 0.5) * 3, pos.y + (rnd() - 0.5) * 3, pos.z + (rnd() - 0.5) * 3, 0, 0, 0, 0.5 + rnd() * 0.3, 9, 3,
        [6, 2.6, 0.6], [1.4, 0.2, 0.03], 0.8, 0, 0);
      const sm = this.theme.smoke;
      this.smoke.add(pos.x, pos.y, pos.z, (rnd() - 0.5) * 4, 2, (rnd() - 0.5) * 4, 2.5 + rnd(), 6, 22, sm, sm, 0.5, 0.3, 1);
    }
  }

  // jet wingtip vapour while pulling hard
  vapour(pos, vel, strength) {
    this.smoke.add(pos.x, pos.y, pos.z, vel.x * 0.85, vel.y * 0.85, vel.z * 0.85, 0.3 + rnd() * 0.2, 0.35, 0.9,
      [1.2, 1.25, 1.3], [0.9, 0.95, 1.0], 0.35 * strength, 3);
  }

  beacon(pos, radius, duration) {
    const m = new THREE.Mesh(this.beaconGeo, this.beaconMat);
    m.position.copy(pos);
    m.position.y -= 4;
    m.scale.set(radius, 60, radius);
    m.renderOrder = 7;
    this.scene.add(m);
    const b = { mesh: m, t: 0, dur: duration };
    this.beacons.push(b);
    return b;
  }

  removeBeacon(b) {
    this.scene.remove(b.mesh);
    const i = this.beacons.indexOf(b);
    if (i >= 0) this.beacons.splice(i, 1);
  }

  spawnDebris(pos, n, s) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (this.debrisList.length >= 160) this.debrisList.shift();
      randDir(v); v.y = Math.abs(v.y) + 0.4;
      const sp = (20 + rnd() * 40) * Math.sqrt(s);
      this.debrisList.push({
        p: pos.clone(), v: v.multiplyScalar(sp).clone(), axis: randDir(new THREE.Vector3()), ang: 0, spin: 4 + rnd() * 8,
        size: (0.4 + rnd() * 0.9) * Math.sqrt(s), life: 0, maxLife: 3.5 + rnd() * 2, smoke: 0,
      });
    }
  }

  update(dt, time, terrain) {
    this.add.update(dt);
    this.smoke.update(dt);
    // debris
    const d = this._dummy;
    let k = 0;
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const b = this.debrisList[i];
      b.life += dt;
      if (b.life > b.maxLife) { this.debrisList.splice(i, 1); continue; }
      b.v.y -= 30 * dt;
      b.p.addScaledVector(b.v, dt);
      b.ang += b.spin * dt;
      const g = terrain ? terrain.groundOrWater(b.p.x, b.p.z) : -1e9;
      if (b.p.y < g + b.size * 0.5) {
        b.p.y = g + b.size * 0.5;
        if (b.v.y < -6) { b.v.y *= -0.3; b.v.x *= 0.5; b.v.z *= 0.5; b.spin *= 0.5; } else { b.v.set(0, 0, 0); b.spin = 0; }
      }
      b.smoke += dt;
      if (b.smoke > 0.05 && b.life < 1.6) { b.smoke = 0; this.smokePuff(b.p, 1.2 * b.size + 0.6); }
    }
    for (const b of this.debrisList) {
      const fade = Math.min(1, (b.maxLife - b.life) * 2);
      d.position.copy(b.p);
      d.quaternion.setFromAxisAngle(b.axis, b.ang);
      d.scale.setScalar(b.size * fade);
      d.updateMatrix();
      this.debris.setMatrixAt(k++, d.matrix);
    }
    this.debris.count = k;
    this.debris.instanceMatrix.needsUpdate = true;
    // lights
    for (const l of this.lights) {
      const u = l.userData;
      u.t += dt;
      const f = Math.max(0, 1 - u.t / u.dur);
      l.intensity = u.peak * f * f;
    }
    // beacons
    this.beaconMat.uniforms.uTime.value = time;
    for (let i = this.beacons.length - 1; i >= 0; i--) {
      const b = this.beacons[i];
      b.t += dt;
      if (b.t > b.dur) this.removeBeacon(b);
    }
  }

  clear() {
    this.add.count = 0; this.smoke.count = 0;
    this.add.flush(0); this.smoke.flush(0);
    this.debrisList.length = 0;
    this.debris.count = 0;
    for (const b of [...this.beacons]) this.removeBeacon(b);
    for (const l of this.lights) { l.userData.t = l.userData.dur; l.intensity = 0; }
  }

  dispose() {
    this.clear();
    this.scene.remove(this.add.mesh, this.smoke.mesh, this.debris, ...this.lights);
  }
}
