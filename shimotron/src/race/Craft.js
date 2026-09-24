import * as THREE from 'three';
import { buildCraft, designFor } from './CraftModels.js';

/**
 * Racing craft for the races that are not on wheels: powerboats on the
 * sea, submarines along the reefs, stunt planes over the island and
 * paragliders riding thermals down from the heights.
 *
 * Arcade physics of their own (no rigid bodies): each craft integrates
 * its speed, heading, pitch and bank, collides with the island (height
 * field), the bridge piers and decks, and exposes the same surface a Car
 * does to the camera, the engine sound and the HUD (position, forward,
 * body.velocity, vehicle.{speed, rpm, gear, controls}, object, kmh).
 */
export const KINDS = {
  boat: { name: 'סירות מרוץ', short: 'סירות', top: 27, accel: 8.5, drag: 0.0042, turn: 1.15, laps: true, music: 'sea', lane: 7, spacing: 16 },
  sub: { name: 'צוללות', short: 'צוללות', top: 17, accel: 5, drag: 0.012, turn: 0.95, laps: true, music: 'deep', lane: 3.5, spacing: 12 },
  plane: { name: 'מטוסי מרוץ', short: 'מטוסים', cruise: 46, top: 64, min: 30, laps: true, music: 'sky', lane: 5, spacing: 45 },
  glider: { name: 'מצנחי רחיפה', short: 'מצנחים', trim: 10.5, fast: 14.5, slow: 7.2, laps: false, music: 'sky', lane: 6, spacing: 22 },
  space: { name: 'מירוץ חלל', short: 'חלליות', cruise: 85, top: 140, min: 45, laps: true, music: 'space', lane: 8, spacing: 40 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _edge = { lat: 0, lim: 0, rx: 0, rz: 0 };
const _w = { y: 0, dx: 0, dz: 0 };
const UP = new THREE.Vector3(0, 1, 0);

/** Materials shared by every craft (vertex colours carry the liveries). */
const MATS = new WeakMap();
function craftMaterials(engine) {
  if (MATS.has(engine)) return MATS.get(engine);
  const body = new THREE.MeshPhysicalMaterial({ name: 'צבע', vertexColors: true, roughness: 0.3, metalness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const matte = new THREE.MeshStandardMaterial({ name: 'גומי ובד', vertexColors: true, roughness: 0.78, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ name: 'מתכת', vertexColors: true, roughness: 0.28, metalness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ name: 'זכוכית', color: 0xa8c8dc, transparent: true, opacity: 0.24, roughness: 0.03, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const pilot = new THREE.MeshStandardMaterial({ name: 'טייס', vertexColors: true, roughness: 0.6, metalness: 0.05 });
  // Lit instruments and lamps: the vertex colour is the light they give.
  const glow = new THREE.MeshStandardMaterial({ name: 'מכשירים', color: 0x050505, emissive: 0xffffff, emissiveIntensity: 1, vertexColors: true, roughness: 0.4 });
  glow.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;');
  };
  glow.customProgramCacheKey = () => 'craft-glow';
  engine.materials.trackEmissive(glow, 1.4);
  // Sail cloth: ripstop weave, darker seams between the cells, a glow of light through it.
  const fabric = new THREE.MeshStandardMaterial({ name: 'בד מצנח', vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
  fabric.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFab; varying vec2 vFab;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFab = aFab;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFab;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float seam = smoothstep(0.0, 0.05, vFab.x) * smoothstep(1.0, 0.95, vFab.x);
        diffuseColor.rgb *= 0.72 + 0.28 * seam;
        vec2 rip = fract(vFab * vec2(9.0, 70.0));
        diffuseColor.rgb *= 1.0 - 0.07 * step(0.9, max(rip.x, rip.y));
        diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 0.3, vFab.y);`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.16;');
  };
  fabric.customProgramCacheKey = () => 'craft-fabric';
  const lines = new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.8 });
  const wakeGeo = new THREE.BufferGeometry();
  wakeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -7, 0, -30, 1, 0, 0, 7, 0, -30, -7, 0, -30, -1, 0, 0, 1, 0, 0, 0, 0, -26, -1.2, 0, 0.8, 1.2, 0, 0.8, -1, 0, 0, 1.2, 0, 0.8, 1, 0, 0, -1, 0, 0], 3));
  wakeGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.4, 0, 0.6, 0, 0, 1, 0.6, 0, 1, 1, 0, 1, 0.45, 0, 0.55, 0, 0.5, 0.9, 0.4, 0, 0.6, 0, 0.4, 0, 0.6, 0, 0.6, 0, 0.4, 0], 2));
  const wake = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float edge = 1.0 - smoothstep(0.0, 0.2, min(abs(vUv.x - 0.06), abs(vUv.x - 0.94)));
        float mid = 1.0 - smoothstep(0.0, 0.12, abs(vUv.x - 0.5));
        float foam = smoothstep(0.35, 0.8, n(vUv * vec2(26.0, 40.0) + vec2(0.0, uTime * 3.0)));
        float a = (1.0 - vUv.y) * (0.3 + 0.6 * foam) * max(0.4 * edge, mid * 0.9 + 0.25);
        gl_FragColor = vec4(vec3(0.96), a * 0.75);
      }`,
  });
  // Seen from inside, a canopy is barely there: a faint, clear version for the cockpit view.
  const glassInside = new THREE.MeshPhysicalMaterial({ name: 'זכוכית מבפנים', color: 0xd8e8f0, transparent: true, opacity: 0.07, roughness: 0.02, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.4 });
  const m = { body, matte, metal, glass, glassInside, pilot, glow, fabric, lines, wake, wakeGeo };
  // Keep the foam moving.
  engine.events.on('frame', () => (wake.uniforms.uTime.value = engine.time.elapsed));
  MATS.set(engine, m);
  return m;
}

/**
 * For env.road: the circuit's asphalt height at (x, z), or null off the
 * road. With `edge` it also fills { lat, lim, rx, rz }: how far across
 * the road the point is, how far it may go, and the rightward direction.
 */
export function roadSurface(track) {
  const q = {};
  return (x, z, edge) => {
    const r = track ? track.nearest(x, z, q) : null;
    if (!r || r.dist > track.W + (edge ? 8 : 0.6)) return null;
    if (edge) {
      const j = (r.i + 1) % track.n;
      const tx = track.tx[r.i] + (track.tx[j] - track.tx[r.i]) * r.u;
      const tz = track.tz[r.i] + (track.tz[j] - track.tz[r.i]) * r.u;
      edge.lat = r.lat;
      edge.lim = track.W - 0.8;
      edge.rx = -tz;
      edge.rz = tx;
    }
    return r.h + clamp(r.lat, -track.W, track.W) * r.bank;
  };
}

// ------------------------------------------------------------------ craft

export class Craft {
  /**
   * env: { engine, particles, ground(x, z), wave(x, z, out), piers, decks, thermals, wind,
   *        obstacles() → moving hulls / balloons, road(x, z) → asphalt height or null }
   * opts: { kind, color, stripe, name, number, isPlayer, position, heading, seed }
   */
  constructor(env, opts) {
    this.env = env;
    this.kind = opts.kind;
    this.spec = KINDS[opts.kind];
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name;
    this.color = opts.color;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.body = { velocity: this.velocity, position: this.position };
    this.yaw = 0;
    this.pitch = 0; // nose up, radians
    this.bank = 0; // right wing down, radians
    this.speed = 0;
    this.vy = 0;
    this.offroad = 0;
    this.crash = 0; // seconds until the race puts a crashed craft back
    this.boost = 1;
    this.vehicle = {
      controls: { throttle: 0, brake: 0, steer: 0, up: 0, down: 0, nitro: false, hold: true },
      speed: 0,
      rpm: 900,
      gear: '',
      reversing: false,
      nitro: 1,
      nitroActive: false,
      shift: 0,
      slip: [0, 0, 0, 0],
      lateralSpeed: () => 0,
      onShift: null,
      upsideDown: 0,
    };
    const seed = opts.seed || 1;
    this.design = opts.design || designFor(this.kind, seed);
    const parts = buildCraft(this.design, opts.color, opts.stripe || '#111111', seed);
    this.parts = parts;
    const M = craftMaterials(env.engine);
    this.mats = M;
    this.object = new THREE.Group();
    this.object.name = `${this.spec.short}: ${opts.name}`;
    for (const key of ['body', 'matte', 'metal', 'pilot', 'fabric', 'glow', 'glass']) {
      if (!parts[key]) continue;
      const mesh = new THREE.Mesh(parts[key], M[key]);
      mesh.castShadow = key !== 'glass' && key !== 'glow';
      mesh.receiveShadow = key !== 'glass';
      if (key === 'glass') mesh.renderOrder = 8;
      this.object.add(mesh);
      if (key === 'pilot') this.pilotMesh = mesh;
      if (key === 'glass') this.glassMesh = mesh;
    }
    if (parts.lines) this.object.add(new THREE.LineSegments(parts.lines, M.lines));
    this.cockpit = { eye: new THREE.Vector3(...parts.eye), nose: new THREE.Vector3(...parts.nose) };
    this.gear = parts.gear || 1.42;
    this.tailSit = parts.tailSit || 0;
    // Propeller discs: faint blurs that spin.
    this.props = (parts.props || []).map((P) => {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(P.r, 24), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      disc.position.set(...P.pos);
      this.object.add(disc);
      return disc;
    });
    this.prop = this.props[0] || null;
    if (this.kind === 'boat') {
      // A V of foam trailing on the water (not part of the hull: it stays flat).
      this.wake = new THREE.Mesh(M.wakeGeo, M.wake);
      this.wake.renderOrder = 6;
      this.wake.frustumCulled = false;
      this.wake.userData.noPick = true;
      env.engine.scene.add(this.wake);
    }
    if (parts.jets) {
      // Engine glow: hot discs and flame cones that grow with thrust.
      const hot = parts.jets[0].color || 0x7fb8ff;
      const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hot, emissiveIntensity: 1 });
      env.engine.materials.trackEmissive(glow, 8);
      this.glowMat = glow;
      const cone = new THREE.MeshBasicMaterial({ color: hot === 0x7fb8ff ? 0x6fa8ff : 0xff9a50, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.coneMat = cone;
      this.flames = [];
      for (const J of parts.jets) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(J.r * 1.05, 16), glow);
        disc.position.set(J.pos[0], J.pos[1], J.pos[2] + 0.02);
        disc.rotation.y = Math.PI;
        const f = new THREE.Mesh(new THREE.ConeGeometry(J.r * 0.9, J.r * 6, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -J.r * 3), cone);
        f.position.set(...J.pos);
        this.object.add(disc, f);
        this.flames.push(f);
      }
    }
    this.object.traverse((o) => (o.userData.noPick = true));
    env.engine.scene.add(this.object);
    this.place(opts.position, opts.heading || 0);
  }

  /** Camera view changed: in the cockpit the driver is you, so their figure goes. */
  setView(id) {
    const inside = id === 'hood';
    if (this.pilotMesh) this.pilotMesh.visible = !inside;
    if (this.glassMesh) this.glassMesh.material = inside ? this.mats.glassInside : this.mats.glass;
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  place(pos, yaw) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.bank = 0;
    this.vy = 0;
    const cruise = this.kind === 'plane' || this.kind === 'space' ? this.spec.cruise : this.kind === 'glider' ? this.spec.trim : 0;
    this.speed = cruise;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(cruise);
    this.crash = 0;
    this.grounded = false;
    this.object.visible = true;
    this._pose();
  }

  /** Parked on the road with the engine running (planes): throttle to roll, Space to lift off. */
  park(road) {
    this.grounded = true;
    this.position.y = road + this.gear;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.pitch = 0;
    this.bank = 0;
    this._fwd();
    this._pose();
  }

  _fwd() {
    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /** Fixed-step physics. */
  step(dt, time) {
    const C = this.vehicle.controls;
    if (this.crash > 0) {
      this.crash -= dt;
      return;
    }
    if (C.hold) {
      // Before the start: boats idle on the swell, aircraft hang in formation.
      if (this.kind === 'boat') this._float(time, dt);
      this.speed = this.kind === 'plane' || this.kind === 'space' ? this.spec.cruise : this.kind === 'glider' ? this.spec.trim : 0;
      this.velocity.set(0, 0, 0);
      this._gauges(dt);
      return;
    }
    if (this.kind === 'boat') this._boat(dt, C, time);
    else if (this.kind === 'sub') this._sub(dt, C);
    else if (this.kind === 'plane') this._plane(dt, C);
    else if (this.kind === 'space') this._space(dt, C);
    else this._glider(dt, C);
    this._gauges(dt);
  }

  _gauges(dt) {
    const V = this.vehicle;
    const C = V.controls;
    V.speed = this.speed;
    V.reversing = this.speed < -0.5;
    const top = this.spec.top || this.spec.fast;
    const f = clamp(Math.abs(this.speed) / top, 0, 1.3);
    const target = this.kind === 'glider' ? 0 : 1200 + f * 5200 + C.throttle * 900;
    V.rpm += (target - V.rpm) * (1 - Math.exp(-dt * 6));
    const alt = this.position.y;
    V.gear = this.kind === 'boat' ? String(1 + Math.min(4, Math.floor(f * 5))) : this.kind === 'sub' ? `${Math.round(-alt)}מ` : this.kind === 'space' ? '' : `${Math.round(alt)}מ`;
    V.nitro = this.kind === 'boat' ? this.boost : null;
    V.nitroActive = !!this.nitroOn;
  }

  _float(time, dt) {
    this.env.wave(this.position.x, this.position.z, _w);
    this.position.y += (_w.y + 0.05 - this.position.y) * (1 - Math.exp(-dt * 8));
    this.wave = { dx: _w.dx, dz: _w.dz };
  }

  _boat(dt, C, time) {
    const K = this.spec;
    this.nitroOn = C.nitro && this.boost > 0.02 && C.throttle > 0.2;
    this.boost = this.nitroOn ? Math.max(0, this.boost - dt * 0.28) : Math.min(1, this.boost + dt * 0.06);
    const top = K.top * (this.nitroOn ? 1.3 : 1) * (this.topScale || 1);
    const thrust = C.throttle * K.accel * (this.nitroOn ? 1.5 : 1) * (this.speed < top ? 1 : 0);
    const reverse = C.brake * K.accel * (this.speed > 0 ? 1.1 : 0.45);
    this.speed += (thrust - reverse - this.speed * 0.12 - this.speed * Math.abs(this.speed) * K.drag) * dt;
    this.speed = clamp(this.speed, -6, top + 2);
    const eff = clamp(Math.abs(this.speed) / 6, 0.15, 1) * (1 - 0.3 * clamp((this.speed - 18) / 12, 0, 1));
    this.yaw -= C.steer * K.turn * eff * (this.speed < 0 ? -1 : 1) * dt;
    this._fwd();
    // The hull slides a little: velocity swings round to the heading.
    const k = 1 - Math.exp(-dt * 2.4);
    this.velocity.x += (this.forward.x * this.speed - this.velocity.x) * k;
    this.velocity.z += (this.forward.z * this.speed - this.velocity.z) * k;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    // Riding the swell: buoyancy only while the hull is in the water, so a
    // fast boat meeting a rising crest is thrown up and flies off the top.
    this.env.wave(this.position.x, this.position.z, _w);
    const rest = _w.y + 0.05 + Math.min(0.35, Math.abs(this.speed) * 0.012);
    const sub = rest - this.position.y;
    const wet = sub > -0.08;
    if (wet) this.vy += (sub * 40 - this.vy * 6.5) * dt;
    this.vy -= 9.81 * dt * (wet ? 0.3 : 1);
    this.position.y += this.vy * dt;
    if (this.position.y < rest - 0.45) {
      this.position.y = rest - 0.45;
      this.vy = Math.max(0, this.vy);
    }
    // Airborne time, and the slam when the hull comes back down.
    if (!wet) this.airT = (this.airT || 0) + dt;
    else {
      if ((this.airT || 0) > 0.18 && this.vy < -1.5) this.landing = Math.max(this.landing || 0, Math.min(1.5, -this.vy / 7 + this.airT * 0.6));
      this.airT = 0;
    }
    this.wave = { dx: _w.dx, dz: _w.dz };
    this.bankTarget = C.steer * eff * 0.2 * clamp(this.speed / 12, 0, 1);
    this.bank += (this.bankTarget - this.bank) * (1 - Math.exp(-dt * 4));
    // Running aground: pushed back off the shallows.
    const g = this.env.ground(this.position.x, this.position.z);
    this.offroad = g > -1.2 ? 1 : 0;
    if (g > -0.8) this._bounce(dt, 0.8);
    this._piers(dt, 3.2);
    this._obstacles(1.6, 0.55);
  }

  _sub(dt, C) {
    const K = this.spec;
    const top = K.top * (this.topScale || 1);
    const thrust = C.throttle * K.accel * (this.speed < top ? 1 : 0);
    const reverse = C.brake * K.accel * (this.speed > 0 ? 1.2 : 0.5);
    this.speed += (thrust - reverse - this.speed * 0.15 - this.speed * Math.abs(this.speed) * K.drag) * dt;
    this.speed = clamp(this.speed, -4, top + 1);
    const eff = clamp(Math.abs(this.speed) / 4, 0.35, 1);
    this.yaw -= C.steer * K.turn * eff * (this.speed < -0.2 ? -1 : 1) * dt;
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += (climb * 0.42 - this.pitch) * (1 - Math.exp(-dt * 2.5));
    this.bank += (C.steer * 0.22 * eff - this.bank) * (1 - Math.exp(-dt * 3));
    this._fwd();
    const k = 1 - Math.exp(-dt * 3);
    this.velocity.x += (this.forward.x * this.speed - this.velocity.x) * k;
    this.velocity.z += (this.forward.z * this.speed - this.velocity.z) * k;
    this.velocity.y += (this.forward.y * this.speed + climb * 1.2 - this.velocity.y) * k;
    this.position.addScaledVector(this.velocity, dt);
    // Stay under the surface and above the sea floor; walls push back.
    if (this.position.y > -2.2) {
      this.position.y = -2.2;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    const g = this.env.ground(this.position.x, this.position.z);
    if (this.position.y < g + 1.6) {
      const dip = g + 1.6 - this.position.y;
      this.position.y = g + 1.6;
      this.velocity.y = Math.max(0, this.velocity.y);
      if (dip > 0.6) this._bounce(dt, 0.6);
    }
    if (g > -2.6) this._bounce(dt, 0.6);
    this._piers(dt, 3.4);
    this._obstacles(2, 0.6);
  }

  _plane(dt, C) {
    const K = this.spec;
    if (this.grounded) return this._taxi(dt, C);
    const target = (K.cruise + C.throttle * (K.top - K.cruise) - C.brake * (K.cruise - K.min)) * (this.topScale || 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 0.9));
    this.speed = Math.max(K.min * 0.8, this.speed - Math.sin(this.pitch) * 9.81 * dt * 0.5);
    // Low over the road: the approach flattens out and the wings level, so a descent becomes a landing.
    const below = this.env.road ? this.env.road(this.position.x, this.position.z) : null;
    const low = below !== null && this.position.y - below < 14;
    this.bank += (C.steer * (low ? 0.45 : 1.05) - this.bank) * (1 - Math.exp(-dt * 2.6));
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += ((low ? Math.max(climb * 0.55, -0.1) : climb * 0.55) - this.pitch) * (1 - Math.exp(-dt * (low ? 3 : 1.8)));
    this.yaw -= ((9.81 * Math.tan(this.bank)) / Math.max(this.speed, 20)) * dt * 1.25;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.offroad = 0;
    this._obstacles(3.2, 0.75);
    const g = Math.max(0, this.env.ground(this.position.x, this.position.z));
    const road = this.env.road ? this.env.road(this.position.x, this.position.z) : null;
    // Over the asphalt: a gentle, wings-level descent touches down instead of crashing.
    if (road !== null && this.position.y < road + this.gear + 0.4 && this.position.y > road - 1.5) {
      if (this.pitch > -0.45 && Math.abs(this.bank) < 0.55) return this._touchDown(road);
      return this._crash();
    }
    if (this.position.y < g + 1.5 || this._deck(1.2)) this._crash();
    if (this.position.y > 900) this.position.y = 900;
  }

  /** Wheels on the road. */
  _touchDown(road) {
    const hard = Math.max(0, -this.forward.y * this.speed);
    this.grounded = true;
    this.position.y = road + this.gear;
    this.pitch = 0;
    this.bank = 0;
    this.hit = Math.min(1, 0.15 + hard / 14);
    const P = this.env.particles;
    if (P) {
      const smoke = P.systems.smoke;
      for (let i = 0; i < 10; i++) {
        const s = i % 2 ? 1 : -1;
        smoke.emit({ x: this.position.x + Math.cos(this.yaw) * s * 0.9, y: road + 0.2, z: this.position.z - Math.sin(this.yaw) * s * 0.9, vx: (Math.random() - 0.5) * 2, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 1.2, size0: 0.5, size1: 2.6, color0: [0.75, 0.75, 0.75, 0.6], color1: [0.8, 0.8, 0.8, 0], drag: 1.2 });
      }
    }
  }

  /** Rolling on the road (or a flat field): throttle, brakes, nose-wheel steering, and Space to lift off. */
  _taxi(dt, C) {
    const K = this.spec;
    const x0 = this.position.x;
    const z0 = this.position.z;
    const road = this.env.road ? this.env.road(x0, z0, _edge) : null;
    const g = this.env.ground(x0, z0);
    const surf = road !== null ? road : g;
    const rough = road !== null ? 1 : 3.5;
    const thrust = C.throttle * 9 - C.brake * (this.speed > 0.5 ? 14 : 0) - 0.35 * rough - this.speed * this.speed * 0.0016;
    this.speed = clamp(this.speed + thrust * dt, 0, K.top * 0.9);
    const eff = clamp(this.speed / 8, 0.25, 1) * (1 - clamp((this.speed - 25) / 40, 0, 0.7));
    this.yaw -= C.steer * 0.9 * eff * dt;
    this.bank += (C.steer * 0.04 * clamp(this.speed / 20, 0, 1) - this.bank) * (1 - Math.exp(-dt * 4));
    // Nose follows the road's slope.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const ahead = this.env.road ? this.env.road(x0 + fx * 3, z0 + fz * 3) : null;
    const lift = (C.up || 0) > 0.3 && this.speed > K.min * 0.85;
    // Taildraggers sit nose-high until the tail lifts with speed.
    const sit = this.tailSit * (1 - clamp(this.speed / (K.min * 0.65), 0, 1));
    this.pitch = lift ? 0.2 : (ahead !== null && road !== null ? Math.atan2(ahead - road, 3) : 0) + sit;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.offroad = road !== null ? 0 : 1;
    if (lift) {
      // Rotate and climb away.
      this.grounded = false;
      this.position.y = surf + this.gear + 0.6;
      this.speed = Math.max(this.speed, K.min);
      return;
    }
    const y = Math.max(surf, road === null ? 0 : -Infinity) + this.gear;
    if (road === null && g < 0.2) return this._crash(); // rolled off into the sea
    if (y < this.position.y - 2.5 && this.speed > K.min * 0.8) {
      // Ran off a drop fast enough: airborne again.
      this.grounded = false;
      return;
    }
    this.position.y = y;
    // The barriers keep a rolling plane on the asphalt: nudged back in, nose turned along the road.
    if (road !== null && Math.abs(_edge.lat) > _edge.lim) {
      const side = Math.sign(_edge.lat);
      const over = Math.abs(_edge.lat) - _edge.lim;
      this.position.x -= _edge.rx * side * over;
      this.position.z -= _edge.rz * side * over;
      const into = (this.forward.x * _edge.rx + this.forward.z * _edge.rz) * side;
      if (into > 0) {
        this._bumpYaw(_n.set(-_edge.rx * side, 0, -_edge.rz * side), 1.2);
        this.pitch = 0;
        this._fwd();
        if (this.speed > 4) this.hit = Math.min(1, into * this.speed * 0.06);
        this.speed *= 1 - clamp(into, 0, 1) * 0.5;
      }
    }
    this._obstacles(3.2, 0.5);
  }

  _space(dt, C) {
    const K = this.spec;
    const target = (K.cruise + C.throttle * (K.top - K.cruise) - C.brake * (K.cruise - K.min)) * (this.topScale || 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 1.3));
    this.bank += (C.steer * 1.0 - this.bank) * (1 - Math.exp(-dt * 3));
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += (climb * 0.7 - this.pitch) * (1 - Math.exp(-dt * 2.2));
    this.yaw -= this.bank * 0.95 * dt;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.offroad = 0;
    // Rocks and the station: bounce off, lose speed.
    for (const S of this.env.solids || []) {
      const dx = this.position.x - S.x;
      const dy = this.position.y - S.y;
      const dz = this.position.z - S.z;
      const d = Math.hypot(dx, dy, dz);
      const R = S.r + 2.2;
      if (d >= R || d < 1e-3) continue;
      const n = _v.set(dx / d, dy / d, dz / d);
      this.position.set(S.x + n.x * R, S.y + n.y * R, S.z + n.z * R);
      this.speed *= 0.8;
      this.hit = 1;
      this._bumpYaw(n);
    }
    if (this.env.collide) {
      const n = this.env.collide(this.position);
      if (n) {
        this.position.addScaledVector(n, 2);
        this.speed *= 0.8;
        this.hit = 1;
        this._bumpYaw(n);
      }
    }
  }

  /** After a knock: heading swings away from what was hit (k = 2 mirrors it, 1 slides along it). */
  _bumpYaw(n, k = 2) {
    const f = this.forward;
    const into = f.x * n.x + f.y * n.y + f.z * n.z;
    if (into >= 0) return;
    const out = _v.set(f.x - k * into * n.x, f.y - k * into * n.y, f.z - k * into * n.z);
    if (out.lengthSq() < 0.01) return;
    out.normalize();
    this.yaw = Math.atan2(out.x, out.z);
    this.pitch = Math.asin(clamp(out.y, -0.8, 0.8)) * 0.5;
    this._fwd();
  }

  /**
   * Ships and balloons: pushed out of them, glancing off to the side.
   * `pad` = this craft's own radius, `keep` = speed kept on a knock,
   * `up` = height of the part that touches above the craft's origin.
   */
  _obstacles(pad, keep, up = 0) {
    const list = this.env.obstacles ? this.env.obstacles(this.position) : null;
    if (!list || !list.length) return;
    const p = this.position;
    const py = p.y + up;
    for (const O of list) {
      let nx;
      let ny = 0;
      let nz;
      if (O.box) {
        // A building, a parked car: a turned box, left by the shallowest side (or the roof).
        const top = O.y + O.hy;
        if (py < O.y - O.hy - pad * 0.5 || py > top + pad * 0.5) continue;
        const dx = p.x - O.x;
        const dz = p.z - O.z;
        const lx = dx * O.c - dz * O.s;
        const lz = dx * O.s + dz * O.c;
        const ex = O.hx + pad - Math.abs(lx);
        const ez = O.hz + pad - Math.abs(lz);
        if (ex <= 0 || ez <= 0) continue;
        const ey = top + pad * 0.5 - py;
        if (ey < ex && ey < ez) {
          nx = 0;
          ny = 1;
          nz = 0;
          p.y += ey;
        } else if (ex < ez) {
          const sx = Math.sign(lx) || 1;
          nx = O.c * sx;
          nz = -O.s * sx;
          p.x += nx * ex;
          p.z += nz * ex;
        } else {
          const sz = Math.sign(lz) || 1;
          nx = O.s * sz;
          nz = O.c * sz;
          p.x += nx * ez;
          p.z += nz * ez;
        }
      } else if (O.y0 !== undefined) {
        // Hull: a vertical cylinder.
        if (py < O.y0 - pad * 0.5 || py > O.y1 + pad * 0.5) continue;
        const dx = p.x - O.x;
        const dz = p.z - O.z;
        const d = Math.hypot(dx, dz);
        const R = O.r + pad;
        if (d >= R || d < 1e-3) continue;
        nx = dx / d;
        nz = dz / d;
        p.x = O.x + nx * R;
        p.z = O.z + nz * R;
      } else {
        const dx = p.x - O.x;
        const dy = py - O.y;
        const dz = p.z - O.z;
        const d = Math.hypot(dx, dy, dz);
        const R = O.r + pad;
        if (d >= R || d < 1e-3) continue;
        nx = dx / d;
        ny = dy / d;
        nz = dz / d;
        p.set(O.x + nx * R, O.y + ny * R - up, O.z + nz * R);
      }
      const v = this.velocity;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn >= 0) continue;
      v.x -= 1.6 * vn * nx;
      v.y -= 1.6 * vn * ny;
      v.z -= 1.6 * vn * nz;
      this.speed *= keep;
      this.hit = Math.max(this.hit || 0, Math.min(1, 0.25 - vn / 14));
      this._bumpYaw(_n.set(nx, this.kind === 'boat' ? 0 : ny, nz), 1.4);
      if (this.kind === 'glider') this.vy = Math.max(this.vy, ny * 2);
      if (O.push) O.push(-nx, -nz, -vn);
    }
  }

  _glider(dt, C) {
    const K = this.spec;
    const target = K.trim + C.throttle * (K.fast - K.trim) - C.brake * (K.trim - K.slow);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 1.2));
    this.bank += (C.steer * 0.75 - this.bank) * (1 - Math.exp(-dt * 2));
    this.yaw -= ((9.81 * Math.tan(this.bank)) / Math.max(this.speed, 5)) * dt;
    const sink = 1.05 + (this.speed - K.trim) ** 2 * 0.07 + Math.abs(this.bank) * 1.3;
    const lift = this._thermal(this.position.x, this.position.z);
    this.vy += (lift - sink - this.vy) * (1 - Math.exp(-dt * 1.5));
    this.pitch = Math.atan2(this.vy, this.speed) * 0.6;
    this._fwd();
    const W = this.env.wind || { x: 0, z: 0 };
    this.velocity.set(Math.sin(this.yaw) * this.speed + W.x, this.vy, Math.cos(this.yaw) * this.speed + W.z);
    this.position.addScaledVector(this.velocity, dt);
    this.lift = lift;
    // The canopy flies ~4 m above the pilot: that is what meets a balloon.
    this._obstacles(5.5, 0.85, 5.5);
    const g = Math.max(0, this.env.ground(this.position.x, this.position.z));
    this.altitude = this.position.y - g;
    if (this.position.y < g + 0.9) {
      if (this.landing) {
        // On the landing field: touch down and slide to a stop.
        this.position.y = g + 0.9;
        this.speed *= 1 - dt * 1.5;
        this.vy = 0;
      } else this._crash();
    }
  }

  /** Rising air (paraglider thermals). */
  _thermal(x, z) {
    let lift = 0;
    for (const T of this.env.thermals || []) {
      const d = Math.hypot(x - T.x, z - T.z);
      if (d < T.r) lift += T.lift * (1 - (d / T.r) ** 2);
    }
    return lift;
  }

  /** Off the shallows / cliff walls: pushed back along the downhill direction. */
  _bounce(dt, keep) {
    const e = 3;
    const x = this.position.x;
    const z = this.position.z;
    const gx = this.env.ground(x + e, z) - this.env.ground(x - e, z);
    const gz = this.env.ground(x, z + e) - this.env.ground(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    const nx = -gx / l;
    const nz = -gz / l;
    this.position.x += nx * 0.9;
    this.position.z += nz * 0.9;
    const vn = this.velocity.x * nx + this.velocity.z * nz;
    if (vn < 0) {
      this.velocity.x -= 1.7 * vn * nx;
      this.velocity.z -= 1.7 * vn * nz;
      if (-vn > 3) this.hit = Math.min(1, -vn / 12);
    }
    this.speed *= keep ** (dt * 10);
    this.offroad = 1;
  }

  _piers(dt, r) {
    for (const P of this.env.piers || []) {
      const dx = this.position.x - P.x;
      const dz = this.position.z - P.z;
      const d = Math.hypot(dx, dz);
      const R = P.r + r;
      if (d >= R || d < 1e-3) continue;
      const nx = dx / d;
      const nz = dz / d;
      this.position.x = P.x + nx * R;
      this.position.z = P.z + nz * R;
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn < 0) {
        this.velocity.x -= 1.8 * vn * nx;
        this.velocity.z -= 1.8 * vn * nz;
        this.speed *= 0.5;
        this.hit = Math.min(1, -vn / 10);
      }
    }
  }

  /** Flying into a bridge deck. */
  _deck(pad) {
    for (const D of this.env.decks || []) {
      const dx = D.bx - D.ax;
      const dz = D.bz - D.az;
      const l2 = dx * dx + dz * dz;
      const u = ((this.position.x - D.ax) * dx + (this.position.z - D.az) * dz) / l2;
      if (u < 0 || u > 1) continue;
      const d = Math.abs((this.position.x - D.ax) * dz - (this.position.z - D.az) * dx) / Math.sqrt(l2);
      if (d > 8 + pad) continue;
      const y = D.ay + (D.by - D.ay) * u;
      if (this.position.y > y - 2.2 - pad && this.position.y < y + 1.3 + pad) return true;
    }
    return false;
  }

  _crash() {
    if (this.crash > 0) return;
    this.crash = 1.4;
    this.speed = 0;
    this.object.visible = false;
    this.crashed = true;
    const P = this.env.particles;
    if (P) {
      P.impact(this.position.clone(), null, 1.6);
      const smoke = P.systems.smoke;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.28;
        smoke.emit({ x: this.position.x, y: this.position.y + 1, z: this.position.z, vx: Math.cos(a) * 3, vy: 2 + Math.random() * 4, vz: Math.sin(a) * 3, life: 1.5 + Math.random(), size0: 2, size1: 7, color0: [0.25, 0.23, 0.22, 0.8], color1: [0.4, 0.4, 0.4, 0], drag: 0.5 });
      }
    }
  }

  _pose() {
    const o = this.object;
    o.position.copy(this.position);
    o.rotation.set(0, 0, 0);
    _e.set(-this.pitch, this.yaw, this.bank, 'YXZ');
    o.quaternion.setFromEuler(_e);
    if (this.kind === 'boat' && this.wave) {
      // Pitch and roll with the waves (bow up with speed), on top of the heading.
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const along = this.wave.dx * fx + this.wave.dz * fz;
      const across = this.wave.dx * -fz + this.wave.dz * fx;
      // In the air the bow rises on the way up and drops on the way down.
      const air = clamp((this.airT || 0) / 0.25, 0, 1);
      this.airPitch = (this.airPitch || 0) + (clamp(this.vy * 0.06, -0.3, 0.32) * air - (this.airPitch || 0)) * 0.2;
      _e.set(-(Math.atan(along) * (1 - air) + Math.min(0.09, Math.abs(this.speed) * 0.004) + this.airPitch), this.yaw, -Math.atan(across) * (1 - air * 0.7) + this.bank, 'YXZ');
      o.quaternion.setFromEuler(_e);
    }
  }

  /**
   * White water: sheets of spray peeling off the bow, a rooster tail
   * behind the engines, more of both the faster you go, spray off the
   * outside of a hard turn, and a burst when the hull slams down after a
   * jump (the higher the jump, the bigger the splash).
   */
  _boatSpray(dt, P, f, r) {
    const S = P.systems.spray;
    const sp = this.parts.spray || { bow: 1.8, beam: 1.3, stern: -4.4, props: [0] };
    const v = Math.abs(this.speed);
    const k = clamp(v / this.spec.top, 0, 1.35);
    const x0 = this.position.x;
    const z0 = this.position.z;
    const air = (this.airT || 0) > 0.05;
    const C = this.vehicle.controls;
    this._sprayAcc = (this._sprayAcc || 0) + dt;
    const water = this.position.y - 0.3;
    const white = [0.96, 0.98, 1, 0.75];
    const fade = [0.92, 0.96, 1, 0];
    if (!air && v > 3) {
      const rate = 90 * k * k + 8;
      let n = Math.floor(this._sprayAcc * rate);
      if (n > 0) this._sprayAcc -= n / rate;
      n = Math.min(n, 12);
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        const turn = 1 + Math.max(0, C.steer * -s) * 1.2;
        const along = sp.bow - Math.random() * 1.6;
        S.emit({
          x: x0 + f.x * along + r.x * s * sp.beam * 0.75,
          y: water + 0.1,
          z: z0 + f.z * along + r.z * s * sp.beam * 0.75,
          vx: r.x * s * (2.5 + 7 * k) * turn + this.velocity.x * 0.35 + (Math.random() - 0.5),
          vy: 1.5 + 5.5 * k * Math.random() * turn,
          vz: r.z * s * (2.5 + 7 * k) * turn + this.velocity.z * 0.35 + (Math.random() - 0.5),
          life: 0.55 + Math.random() * 0.5,
          size0: 0.25 + 0.3 * k,
          size1: 1.2 + 2.4 * k,
          color0: white,
          color1: fade,
          gravity: 9.5,
          drag: 0.5,
        });
      }
      // Rooster tail: a plume thrown up and back by the props.
      const tail = C.throttle * k;
      if (tail > 0.15) {
        for (const px of sp.props) {
          if (Math.random() > 0.35 + tail * 0.6) continue;
          S.emit({
            x: x0 + f.x * sp.stern + r.x * px,
            y: water + 0.2,
            z: z0 + f.z * sp.stern + r.z * px,
            vx: -f.x * (3 + v * 0.25) + (Math.random() - 0.5) * 2,
            vy: 3 + 7 * tail * (0.6 + Math.random() * 0.5),
            vz: -f.z * (3 + v * 0.25) + (Math.random() - 0.5) * 2,
            life: 0.9 + Math.random() * 0.6,
            size0: 0.4,
            size1: 2.2 + 2.5 * tail,
            color0: [0.95, 0.97, 1, 0.6],
            color1: fade,
            gravity: 9.8,
            drag: 0.35,
          });
        }
      }
    } else if (air && Math.random() < 0.5) {
      // Water streaming off the hull in the air.
      S.emit({ x: x0 - f.x * 2 + (Math.random() - 0.5) * 2, y: this.position.y - 0.3, z: z0 - f.z * 2 + (Math.random() - 0.5) * 2, vx: this.velocity.x * 0.6, vy: this.vy * 0.5, vz: this.velocity.z * 0.6, life: 0.6, size0: 0.2, size1: 0.7, color0: [0.95, 0.97, 1, 0.5], color1: fade, gravity: 9.8, drag: 0.3 });
    }
    // Landing after a jump: a sheet of water all round, taller the harder it hit.
    if (this.landing) {
      const L = this.landing;
      this.landing = 0;
      this.hit = Math.max(this.hit || 0, Math.min(1, 0.25 + L * 0.4));
      this.speed *= 1 - Math.min(0.25, L * 0.12);
      const n = Math.round(30 + 70 * Math.min(1.5, L));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const out = 3 + Math.random() * 6 * L;
        S.emit({
          x: x0 + Math.cos(a) * 1.4 + f.x * (Math.random() * 3 - 1),
          y: water + 0.1,
          z: z0 + Math.sin(a) * 1.4 + f.z * (Math.random() * 3 - 1),
          vx: Math.cos(a) * out + this.velocity.x * 0.4,
          vy: 3 + Math.random() * (5 + 9 * L),
          vz: Math.sin(a) * out + this.velocity.z * 0.4,
          life: 0.9 + Math.random() * 0.8,
          size0: 0.5,
          size1: 2.5 + 2.5 * L,
          color0: [0.97, 0.99, 1, 0.8],
          color1: fade,
          gravity: 9.8,
          drag: 0.4,
        });
      }
      if (this.env.engine.events) this.env.engine.events.emit('splash', { strength: L, position: this.position });
    }
    // Foam wake on the water behind.
    if (this.wake) {
      const w = this.wake;
      w.visible = !air && v > 2;
      if (w.visible) {
        w.position.set(x0 - f.x * (sp.stern * -1 - 0.3), this.position.y - 0.2, z0 - f.z * (sp.stern * -1 - 0.3));
        w.rotation.set(0, Math.atan2(f.x, f.z), 0);
        w.scale.set(0.7 + k * 0.6, 1, 0.4 + k * 0.9);
      }
    }
  }

  /** Per frame: pose, spinning bits, spray, bubbles, smoke. */
  update(dt) {
    this._pose();
    for (const d of this.props) d.rotation.z += dt * 60;
    if (this.flames) {
      const C = this.vehicle.controls;
      const k = 0.6 + C.throttle * 1.2 - C.brake * 0.4 + Math.random() * 0.15;
      for (const f of this.flames) f.scale.set(1, 1, Math.max(0.2, k));
      this.env.engine.materials.setEmissiveBase(this.glowMat, 5 + C.throttle * 7);
    }
    const P = this.env.particles;
    const cam = this.env.engine.camera.position;
    const near = this.position.distanceTo(cam) < (this.isPlayer ? 400 : 160);
    if (!P || !near || this.crash > 0) return;
    const f = this.forward;
    const r = _v.set(-f.z, 0, f.x).normalize();
    this._fx = (this._fx || 0) + dt;
    if (this.kind === 'boat') {
      this._boatSpray(dt, P, f, r);
    } else if (this.kind === 'sub' && Math.abs(this.speed) > 1 && this._fx > 0.06) {
      this._fx = 0;
      P.systems.smoke.emit({ x: this.position.x - f.x * 3.8, y: this.position.y, z: this.position.z - f.z * 3.8, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 2.5, size0: 0.15, size1: 0.45, color0: [0.8, 0.95, 1, 0.7], color1: [0.8, 0.95, 1, 0], drag: 0.3 });
    } else if (this.kind === 'plane' && this.smoke && !this.isPlayer && !this.vehicle.controls.hold && this._fx > 0.05) {
      // Air-race smoke trail in the pilot's colour.
      this._fx = 0;
      const c = new THREE.Color(this.color);
      P.systems.smoke.emit({ x: this.position.x - f.x * 4.5, y: this.position.y, z: this.position.z - f.z * 4.5, vx: 0, vy: 0.3, vz: 0, life: 4, size0: 1.2, size1: 5, color0: [0.6 + c.r * 0.4, 0.6 + c.g * 0.4, 0.6 + c.b * 0.4, 0.5], color1: [0.9, 0.9, 0.9, 0], drag: 0.2, turbulence: 0.5 });
    }
  }

  dispose() {
    if (this.glowMat) this.env.engine.materials.untrackEmissive(this.glowMat);
    this.object.removeFromParent();
    if (this.wake) this.wake.removeFromParent();
    // Model geometry and the part materials are shared (cached per design); only this craft's own bits go.
    const own = new Set([...this.props, ...(this.flames || [])]);
    this.object.traverse((o) => {
      if (own.has(o) || (o.material && (o.material === this.glowMat || o.material === this.coneMat))) {
        o.geometry.dispose();
        if (o.material !== this.glowMat && o.material !== this.coneMat) o.material.dispose();
      }
    });
    if (this.glowMat) this.glowMat.dispose();
    if (this.coneMat) this.coneMat.dispose();
  }
}

// ------------------------------------------------------------------ drivers

/** Keyboard, gamepad and touch for a craft (same keys as the cars, plus Space/Shift to climb and dive). */
export class CraftPlayer {
  constructor(craft, input, touch) {
    this.craft = craft;
    this.input = input;
    this.touch = touch;
    this.steer = 0;
    this.enabled = true;
  }

  update(dt) {
    const C = this.craft.vehicle.controls;
    const I = this.input;
    const T = this.touch || {};
    const kind = this.craft.kind;
    if (!this.enabled) {
      Object.assign(C, { throttle: 0, brake: 0, steer: 0, up: 0, down: 0, nitro: false });
      return;
    }
    let steer = I.axis('KeyA', 'KeyD') + I.axis('ArrowLeft', 'ArrowRight') + (T.right ? 1 : 0) - (T.left ? 1 : 0);
    let gas = I.isDown('KeyW') || I.isDown('ArrowUp') || T.gas ? 1 : 0;
    let brk = I.isDown('KeyS') || I.isDown('ArrowDown') || T.brake ? 1 : 0;
    const air = kind === 'plane' || kind === 'sub' || kind === 'space';
    let up = air && (I.isDown('Space') || T.nitro) ? 1 : 0;
    let down = air && (I.isDown('ShiftLeft') || I.isDown('ShiftRight') || I.isDown('KeyX') || T.handbrake) ? 1 : 0;
    let nitro = kind === 'boat' && (I.isDown('ShiftLeft') || I.isDown('ShiftRight') || I.isDown('KeyN') || T.nitro);
    let analog = null;
    const pad = I.gamepad;
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) analog = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) ** 1.5;
      const ay = pad.axes[1] || 0;
      if (air && Math.abs(ay) > 0.15) {
        up = Math.max(up, clamp(ay, 0, 1));
        down = Math.max(down, clamp(-ay, 0, 1));
      }
      const b = pad.buttons;
      gas = Math.max(gas, b[7] ? b[7].value : 0, b[0] && b[0].pressed ? 1 : 0);
      brk = Math.max(brk, b[6] ? b[6].value : 0);
      nitro = nitro || (b[3] && b[3].pressed);
    }
    steer = clamp(steer, -1, 1);
    if (analog !== null) this.steer = analog;
    else this.steer += clamp(steer - this.steer, -dt * 5, dt * 5);
    C.steer = this.steer;
    C.throttle = gas;
    C.brake = brk;
    C.up = up;
    C.down = down;
    C.nitro = !!nitro;
  }
}

/** Follows the course: pursuit steering, height tracking, speed from the bends ahead. */
export class CraftAI {
  constructor(craft, course, { skill = 0.9, lane = 0, seed = 1 } = {}) {
    this.craft = craft;
    this.course = course;
    this.skill = skill;
    this.lane = lane;
    this.seed = seed;
    this._q = {};
    craft.topScale = 0.9 + skill * 0.1;
  }

  update(dt, rubber = 0) {
    const c = this.craft;
    const C = c.vehicle.controls;
    const K = c.spec;
    const course = this.course;
    const q = course.nearest(c.position.x, c.position.z, this._q);
    if (!q) return;
    const v = Math.max(4, Math.abs(c.speed));
    const look = { boat: 16 + v * 1.1, sub: 14 + v * 1.2, plane: 40 + v * 1.3, glider: 30 + v * 2, space: 50 + v * 0.9 }[c.kind];
    const wobble = Math.sin(performance.now() * 0.0003 + this.seed) * 0.4;
    // Tighten to the centre line near a gate (small gates under bridges especially).
    let near = 1;
    for (const g of course.gates) {
      let ds = (g.s - q.s) * course.length;
      if (course.closed && ds < -course.length / 2) ds += course.length;
      if (ds > -10 && ds < 160) near = Math.min(near, clamp(ds / 160, 0, 1) * (g.radius > 8 ? 1 : 0.3) + (g.radius > 8 ? 0.35 : 0));
    }
    const target = course.pose(q.s + look / course.length, (this.lane + wobble) * near);
    const want = Math.atan2(target.position.x - c.position.x, target.position.z - c.position.z);
    const err = wrap(want - c.yaw);
    C.steer = clamp(-err * (c.kind === 'plane' || c.kind === 'space' ? 2.2 : 2.6), -1, 1);
    // Bends ahead set the pace.
    const ahead = course.pose(q.s + (look * 2.5) / course.length, 0);
    const bend = Math.abs(wrap(Math.atan2(ahead.tangent.x, ahead.tangent.z) - Math.atan2(target.tangent.x, target.tangent.z)));
    const pace = clamp(1 - bend * 0.9, 0.35, 1) * (0.9 + this.skill * 0.1) * (1 + rubber);
    c.topScale = (0.9 + this.skill * 0.1) * (1 + rubber * 0.5) * (c.kind === 'space' ? 0.9 : 1);
    if (c.kind === 'boat' || c.kind === 'sub') {
      const vt = (K.top * pace);
      C.throttle = c.speed < vt ? 1 : 0.3;
      C.brake = c.speed > vt + 3 ? 0.6 : 0;
      C.nitro = c.kind === 'boat' && bend < 0.12 && c.boost > 0.5 && this.skill > 0.8;
    } else if (c.kind === 'plane' || c.kind === 'space') {
      C.throttle = pace > 0.8 ? 1 : 0.4;
      C.brake = pace < 0.5 ? 0.5 : 0;
    }
    if (c.kind === 'sub' || c.kind === 'plane' || c.kind === 'space') {
      // Under a bridge: hold the pass height from well before it until clear of the deck.
      let ty = target.position.y;
      for (const g of course.gates) {
        if (!g.under) continue;
        let ds = (g.s - q.s) * course.length;
        if (course.closed && ds < -course.length / 2) ds += course.length;
        if (ds > -45 && ds < 90) ty = Math.min(ty, g.pos.y);
      }
      const dy = ty - c.position.y - c.velocity.y * 0.6;
      C.up = clamp(dy * 0.2, 0, 1);
      C.down = clamp(-dy * 0.2, 0, 1);
    }
    if (c.kind === 'glider') {
      // Height to spare: speed bar; short of the glide line: circle in lift if there is some, else trim.
      const dy = c.position.y - target.position.y;
      C.throttle = dy > 10 ? 1 : dy > 3 ? 0.5 : 0;
      C.brake = 0;
    }
  }
}
