import * as THREE from 'three';
import { Terrain } from '../engine/world/Terrain.js';
import { Emitter } from '../engine/fx/Particles.js';
import { generateTrack } from './TrackGenerator.js';
import { Track } from './Track.js';
import { IslandFlora } from './Flora.js';
import { City } from './City.js';
import { Canyon } from './Canyon.js';
import { Life } from './Life.js';
import { Spaceport } from './Launch.js';
import { Weather } from './Effects.js';
import { RACE } from './config.js';
import { GROUP } from './Vehicle.js';
import { AccessRoads } from './AccessRoads.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const SEGMENTS = { low: 420, medium: 520, high: 600, ultra: 640 };

/**
 * One stage = one island. Builds (and later disposes) everything that
 * belongs to it: terrain sculpted from the stage's island recipe, the
 * generated circuit carved into it, flora, water colours, sky preset,
 * weather, and the lava lake on the volcano island.
 */
export class Island {
  /**
   * opts.plan: a ready circuit plan (skips the search); opts.cache: a Map
   * the game keeps of baked terrain grids, so revisiting an island skips
   * the bake.
   */
  constructor(engine, materials, water, stage, opts = {}) {
    this.opts = opts;
    this.engine = engine;
    this.materials = materials;
    this.water = water;
    this.stage = stage;
    this.group = new THREE.Group();
    this.group.name = `אי: ${stage.name}`;
    this.bodies = [];
    this.emitters = [];
    this.lights = [];
    this.systems = [];
  }

  async build(progress = async () => {}) {
    const eng = this.engine;
    const st = this.stage;
    const q = eng.quality.presetName;
    await progress(0.05, `מפסל את ${st.name}…`);
    const terrain = new Terrain(eng, {
      plaza: null,
      paths: [],
      island: st.island,
      biome: st.biome,
      size: st.size,
      segments: SEGMENTS[q] || 520,
      seed: st.seed,
      reef: st.life?.reef ?? 0.5,
    });
    this.terrain = terrain;

    await progress(0.18, 'מתכנן מסלול מירוץ…');
    // Canyons: plan the road on the valley floor, then raise the mesas around it.
    terrain.skipMesas = true;
    const plan = this.opts.plan || generateTrack(terrain, st, { halfWidth: RACE.roadHalfWidth });
    if (!plan) throw new Error(`לא נמצא מסלול תקין עבור ${st.name}`);
    this.planGenerated = !this.opts.plan;
    const track = new Track(eng, terrain, plan.controls, st);
    terrain.skipMesas = false;
    this.track = track;
    this.plan = plan;
    terrain.heightModifier = track.heightModifier;
    terrain.splatModifier = track.splatModifier;
    terrain.clearance = track.clearance;
    // Roads from the bridges to the circuit (levelled into the ground, kept clear of trees and houses).
    const ends = this.opts.bridgeEnds || [];
    if (ends.length) {
      const roads = new AccessRoads(track, ends);
      this.roads = roads;
      const th = track.heightModifier;
      terrain.heightModifier = (x, z, h) => roads.height(x, z, th(x, z, h));
    }
    const keepBridge = this.opts.keepOut;
    this.keepOut = (x, z) => (keepBridge && keepBridge(x, z)) || (this.roads && this.roads.dist(x, z) < 14);
    if (st.city) {
      // The city is laid out before the ground is baked, so its blocks can be painted as paving.
      this.city = new City(eng, terrain, track, st, this.materials);
      this.city.keepOut = this.keepOut;
      // Level the ground under it first (sampled from the circuit-shaped terrain), then lay it out.
      const base = track.heightModifier;
      terrain.heightModifier = base;
      const lv = this.city.level();
      const roads = this.roads;
      terrain.heightModifier = roads ? (x, z, h) => roads.height(x, z, lv(x, z, base(x, z, h))) : (x, z, h) => lv(x, z, base(x, z, h));
      this.city.plan();
      terrain.splatModifier = (x, z, w, h) => this.city.splat(track.splatModifier(x, z, w, h), x, z);
    }
    if (this.roads) {
      const s0 = terrain.splatModifier;
      terrain.splatModifier = (x, z, w, h) => this.roads.splat(x, z, s0(x, z, w, h));
    }

    await progress(0.32, 'חוצב את הכביש בשטח…');
    // Heights and ground maps: from the cache when this island was built before, else baked in slices.
    const cache = this.opts.cache;
    const key = `${st.id}|${terrain.segments}|${plan.controls.length}|${Math.round(plan.length * 100)}`;
    const hit = cache && cache.get(key);
    if (hit) {
      terrain.heights = hit.heights;
      terrain.splatPre = hit.splat;
    } else {
      const baked = await terrain.prebake(() => new Promise((r) => setTimeout(r, 0)));
      if (cache) {
        cache.set(key, baked);
        while (cache.size > 4) cache.delete(cache.keys().next().value);
      }
    }
    this.group.add(terrain.build(this.materials));
    await nextFrame();
    const before = new Set(eng.physics.world.bodies);
    terrain.addPhysics(eng.physics);
    terrain.body.shapes[0].collisionFilterGroup = GROUP.terrain;

    await progress(0.48, 'סולל אספלט, שפות ומעקות…');
    this.group.add(track.build(this.materials));
    track.buildPhysics(eng.physics);
    if (this.roads) this.group.add(this.roads.build(this.materials));
    await nextFrame();

    if (this.city) {
      await progress(0.56, 'בונה את העיר…');
      this.group.add(this.city.build());
      await nextFrame();
    }
    if (this.opts.pad) {
      // The spaceport, with its rocket on the mount.
      this.spaceport = new Spaceport(eng, this.materials, this.opts.pad);
      this.group.add(this.spaceport.build());
    }
    if (st.gorge) {
      await progress(0.56, 'מפסל קשתות סלע ונקיקים…');
      this.group.add(new Canyon(eng, terrain, track, st, this.materials).build());
      await nextFrame();
    }

    await progress(0.62, 'שותל צמחייה…');
    // Bridge landings stay clear of trees, grass and houses.
    const keep = this.keepOut;
    const blocked = this.city ? (x, z, kind) => keep(x, z) || this.city.blocked(x, z, kind) : (x, z) => keep(x, z);
    const flora = new IslandFlora(eng, terrain, this.materials, st, track, blocked, this.city ? () => this.city.treeSpots() : null);
    this.flora = flora;
    this.group.add(flora.build());
    for (const b of eng.physics.world.bodies) if (!before.has(b)) this.bodies.push(b);
    await nextFrame();

    await progress(0.68, 'מאכלס שוניות, דגים, סירות ועדרים…');
    this.life = new Life(eng, this, this.materials);
    this.group.add(this.life.build());
    await nextFrame();

    await progress(0.74, 'מכוון שמיים, ים ומזג אוויר…');
    if (this.water) this.applyWater(this.water);
    this._sky();
    if (st.weather) {
      this.weather = new Weather(eng, st.weather);
      this.group.add(this.weather.points);
    }
    const volcanoes = st.island.volcanoes || (st.island.volcano ? [st.island.volcano] : []);
    volcanoes.forEach((V, k) => this._volcano(V, k === 0));
    this.dustColor = this._dustColor();
    eng.scene.add(this.group);
    return this;
  }

  applyWater(water) {
    this.water = water;
    const w = water;
    const st = this.stage;
    w.terrain = this.terrain;
    w.uniforms.tHeight.value = this.terrain.heightTexture;
    w.uniforms.uTerrainSize.value = this.terrain.size;
    w.uniforms.uShallow.value.setRGB(...st.water.shallow);
    w.uniforms.uDeep.value.setRGB(...st.water.deep);
    w.uniforms.uClarity.value = st.water.clarity ?? 0.9;
  }

  _sky() {
    const atm = this.engine.atmosphere;
    const s = this.stage.sky;
    // Put the sun behind the grid, over one shoulder, so the start straight is not a drive into it.
    atm.sunAzimuth = 0;
    const d0 = atm.computeSunDirection(s.time, new THREE.Vector3());
    const tr = this.track;
    const side = s.azimuth >= 0 ? 1 : -1;
    const a = Math.PI * 0.78 * side;
    const dx = tr.tx[0] * Math.cos(a) - tr.tz[0] * Math.sin(a);
    const dz = tr.tx[0] * Math.sin(a) + tr.tz[0] * Math.cos(a);
    atm.sunAzimuth = Math.atan2(-dz, dx) - Math.atan2(-d0.z, d0.x);
    atm.setTime(s.time, true);
    atm.daySpeed = 0;
    atm.model.turbidity = s.turbidity;
    atm.model.rayleigh = s.rayleigh;
    atm.cloudCoverage = s.clouds;
    atm.cloudDensity = s.cloudDensity;
    atm.fogDensity = s.fog;
    atm.wind.strength = s.wind;
    atm._envDirty = true;
  }

  _dustColor() {
    const b = this.stage.biome;
    const tint = b.sandTint || [1, 1, 1];
    if (this.stage.weather === 'snow') return [0.92, 0.94, 0.98];
    if (this.stage.id === 'lava') return [0.28, 0.26, 0.25];
    return [0.62 * tint[0], 0.55 * tint[1], 0.45 * tint[2]].map((v) => Math.min(1, v));
  }

  /** Glowing lava lake in the crater, a light over it and a slow ash plume (the big plume only on the main cone). */
  _volcano(V, main = true) {
    const t = this.terrain;
    const R = V.radius * V.craterRadius;
    let floor = Infinity;
    for (let a = 0; a < 24; a++) {
      for (const r of [0, 0.2, 0.4]) {
        const x = V.x + Math.cos(a) * R * r;
        const z = V.z + Math.sin(a) * R * r;
        floor = Math.min(floor, t.height(x, z));
      }
    }
    const level = floor + 3;
    if (!this.lavaUniforms) this.lavaUniforms = { uTime: { value: 0 }, uGain: { value: 1 } };
    const uniforms = this.lavaUniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGain;
        varying vec2 vP;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += n(p) * a; p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec2 p = vP * 0.06;
          float flow = fbm(p + vec2(uTime * 0.03, -uTime * 0.02) + fbm(p * 1.7 - uTime * 0.05) * 1.5);
          float crust = smoothstep(0.45, 0.62, flow);
          vec3 hot = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.28, 0.03), smoothstep(0.2, 0.5, flow));
          vec3 col = mix(hot * 3.0, vec3(0.05, 0.02, 0.015), crust);
          col += vec3(1.0, 0.3, 0.05) * pow(1.0 - crust, 3.0) * 0.8;
          gl_FragColor = vec4(col * uGain, 1.0);
        }`,
    });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(R * 0.75, 64), mat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(V.x, level, V.z);
    lake.name = 'אגם לבה';
    this.group.add(lake);
    this.lava = { uniforms, level };
    const glow = new THREE.PointLight(0xff5a1a, 0, R * 5, 1.6);
    glow.position.set(V.x, level + 18, V.z);
    this.group.add(glow);
    this.lights.push({ light: glow, base: main ? 600 : 260 });
    const plume = new Emitter(this.engine.particles.systems.smoke, {
      position: new THREE.Vector3(V.x, level + 6, V.z),
      rate: main ? 3 : 1.2,
      radius: R * 0.4,
      spread: 0.25,
      speed: [4, 8],
      life: [14, 22],
      size0: [18, 26],
      size1: [60, 90],
      color0: [0.18, 0.16, 0.15, 0.7],
      color1: [0.3, 0.29, 0.28, 0],
      drag: 0.05,
      turbulence: 1.5,
      gravity: -0.4,
    });
    this.engine.particles.add(plume);
    this.emitters.push(plume);
  }

  /** Height of paving the wheels roll on (access roads, city streets) at (x, z), or null. */
  pavedY(x, z) {
    const r = this.roads ? this.roads.pavedY(x, z) : null;
    if (r !== null) return r;
    return this.city ? this.city.pavedY(x, z) : null;
  }

  /**
   * A wheel's ray against the ground: the circuit and the paved roads and
   * streets answer analytically (as the planes they are drawn as); false
   * leaves it to the physics world (terrain, kerbs, obstacles).
   */
  groundRay(from, to, result) {
    const tr = this.track;
    if (tr.raycastRoad(from, to, result, tr.roadBody)) return true;
    if (!this.roads && !this.city) return false;
    const y = this.pavedY(from.x, from.z);
    if (y === null || from.y - y > 3 || from.y < y - 0.3) return false;
    const e = 0.7;
    const at = (x, z) => {
      const v = this.pavedY(x, z);
      return v === null ? y : v;
    };
    const gx = (at(from.x + e, from.z) - at(from.x - e, from.z)) / (2 * e);
    const gz = (at(from.x, from.z + e) - at(from.x, from.z - e)) / (2 * e);
    const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    const nx = -gx * il;
    const ny = il;
    const nz = -gz * il;
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= len;
    dy /= len;
    dz /= len;
    const denom = nx * dx + ny * dy + nz * dz;
    if (denom > -1e-4) return true;
    const t = (ny * (y - from.y)) / denom;
    if (t < 0 || t > len) return true;
    result.hitPointWorld.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
    result.hitNormalWorld.set(nx, ny, nz);
    result.distance = t;
    result.body = tr.roadBody;
    result.hasHit = true;
    return true;
  }

  /** What a wheel rolls on at (x, z). */
  surface(x, z) {
    const tr = this.track;
    if (this.roads && this.roads.dist(x, z) < 6.8) return 'asphalt';
    const q = tr.nearest(x, z, this._sq || (this._sq = {}));
    if (q) {
      const a = Math.abs(q.lat);
      if (a < tr.W - 0.05) return 'asphalt';
      if (a < tr.W + 1.25 && tr.curbMark && tr.curbMark[q.i]) return 'curb';
      if (this.city && a < tr.W + 6.6) return 'asphalt'; // street circuit: tarmac run-off, no gravel
      if (a < tr.W + 4.6) return 'gravel';
    }
    if (this.city && this.city.street(x, z)) return 'asphalt';
    const h = this.terrain.heightAt(x, z);
    if (h < 0.25) return 'water';
    if (this.stage.weather === 'snow') return 'snow';
    const w = this.terrain.weightsAt(x, z);
    if (w.sand > 0.5) return 'sand';
    if (w.dirt > 0.5 || w.rock > 0.5) return 'gravel';
    return 'grass';
  }

  update(dt) {
    const eng = this.engine;
    this.track.update(dt, eng);
    if (this.city) this.city.update(dt);
    if (this.life) this.life.update(dt);
    if (this.weather) this.weather.update(dt);
    if (this.lava) {
      this.lava.uniforms.uTime.value = eng.time.elapsed;
      this.lava.uniforms.uGain.value = (eng.materials.emissiveScale || 1) * 0.6 * (this.stage.lavaGain ?? 1);
    }
    for (const l of this.lights) l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(eng.time.elapsed * 3.1) * Math.sin(eng.time.elapsed * 1.7));
  }

  /** Off stage: out of the scene and the physics world, kept whole so coming back is instant. */
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    const eng = this.engine;
    for (const b of this.bodies) eng.physics.world.removeBody(b);
    for (const e of this.emitters) eng.particles.remove(e);
    this.group.removeFromParent();
  }

  /** Back on stage: its ground, circuit and bodies in the physics world, its sky and sea colours. */
  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    const eng = this.engine;
    for (const b of this.bodies) eng.physics.world.addBody(b);
    for (const e of this.emitters) eng.particles.add(e);
    this.group.visible = true;
    eng.scene.add(this.group);
    if (this.water) this.applyWater(this.water);
    this._sky();
  }

  dispose() {
    const eng = this.engine;
    for (const b of this.bodies) eng.physics.world.removeBody(b);
    this.bodies = [];
    for (const e of this.emitters) eng.particles.remove(e);
    if (this.city) this.city.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isInstancedMesh) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m || m.userData.keep) continue;
          this.materials.retire(m); // keeps the shader program for the next island
        }
      }
    });
    if (this.terrain) {
      this.terrain.splatTexture?.dispose();
      this.terrain.heightTexture?.dispose();
    }
  }
}
