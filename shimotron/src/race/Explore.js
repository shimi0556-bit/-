import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Car } from './Car.js';
import { PlayerDriver } from './Drivers.js';
import { Craft, CraftPlayer, roadSurface } from './Craft.js';
import { waveAt } from '../engine/world/Water.js';
import { GROUP } from './Vehicle.js';
import { actionKeys } from './keys.js';

const STEP = 1 / 60;

/** What the explorer can travel in. */
export const ROAM = {
  car: { name: 'מכונית', hint: 'על היבשה ועל הגשרים' },
  moto: { name: 'אופנוע שטח', hint: 'בשבילי העפר, בין הסלעים ועל הכבישים' },
  boat: { name: 'סירה', hint: 'על פני הים' },
  sub: { name: 'צוללת', hint: 'מתחת לים, בין השוניות' },
  plane: { name: 'מטוס', hint: 'באוויר, מעל הכול — נוחת וממריא מהכביש' },
  glider: { name: 'מצנח רחיפה', hint: 'גלישה שקטה מלמעלה' },
};

/**
 * Free roam: no race, no clock — the whole archipelago to explore by
 * car, boat, submarine, plane or paraglider, switching at any moment.
 * Drive across a bridge, sail or fly towards another island and it is
 * built on arrival, the journey carrying on from the same spot.
 */
export class Explore {
  constructor(game, island) {
    this.game = game;
    this.engine = game.engine;
    this.island = island;
    this.world = game.world;
    this.bodies = [];
    this.acc = 0;
    this.kind = null;
    this.obj = null;
    this._decks();
    const obs = this.world.obstacles(3200);
    this.env = {
      engine: this.engine,
      particles: this.engine.particles,
      ground: (x, z) => this.ground(x, z),
      wave: (x, z, out) => waveAt(x, z, this.engine.time.elapsed, game.water ? game.water.uniforms.uWaveAmp.value : 1, out, -this.ground(x, z)),
      piers: obs.piers,
      decks: obs.decks,
      thermals: this._thermals(),
      obstacles: (p) => island.obstaclesNear(p),
      road: roadSurface(island.track),
      get wind() {
        const atm = game.engine.atmosphere;
        const s = 0.6 + atm.wind.strength * 0.8;
        return { x: atm.wind.dir.x * s, z: atm.wind.dir.y * s };
      },
    };
    this._pre = () => {
      if (this.onWheels && this.obj) {
        this.obj.vehicle.controls.hold = false;
        this.obj.vehicle.preStep(this.engine.physics.fixedStep);
      }
    };
    this.engine.physics.world.addEventListener('preStep', this._pre);
  }

  ground(x, z) {
    const t = this.island.terrain;
    const half = t.size / 2;
    if (Math.abs(x) < half - 2 && Math.abs(z) < half - 2) return t.heightAt(x, z);
    return this.world.groundAt(...this.world.toWorld(x, z));
  }

  /** Rising air over the island's slopes for the paraglider. */
  _thermals() {
    const t = this.island.terrain;
    const out = [];
    const R = this.island.stage.island.radius;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      const r = R * (0.25 + (k % 3) * 0.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (t.heightAt(x, z) > 2) out.push({ x, z, r: 45, lift: 3.2 });
    }
    return out;
  }

  /** Bridge decks the car can drive on (static boxes grouped per ~120 m). */
  _decks() {
    const P = this.engine.physics;
    const obs = this.world.obstacles(3200);
    const byBridge = new Map();
    for (const D of obs.decks) {
      if (!byBridge.has(D.bridge)) byBridge.set(D.bridge, []);
      byBridge.get(D.bridge).push(D);
    }
    for (const list of byBridge.values()) {
      for (let k = 0; k < list.length; k += 8) {
        const group = list.slice(k, k + 8);
        const o = group[0];
        const body = new CANNON.Body({ mass: 0, material: P.materials.ground });
        body.position.set(o.ax, o.ay, o.az);
        const rails = new CANNON.Body({ mass: 0, material: P.materials.metal || P.materials.ground });
        rails.position.copy(body.position);
        for (const D of group) {
          const dx = D.bx - D.ax;
          const dy = D.by - D.ay;
          const dz = D.bz - D.az;
          const len = Math.hypot(dx, dz);
          const yaw = Math.atan2(dx, dz);
          const pitch = -Math.atan2(dy, len);
          const q = new CANNON.Quaternion().setFromEuler(pitch, yaw, 0, 'YXZ');
          const cx = (D.ax + D.bx) / 2 - o.ax;
          const cy = (D.ay + D.by) / 2 - o.ay - 0.9;
          const cz = (D.az + D.bz) / 2 - o.az;
          const shape = new CANNON.Box(new CANNON.Vec3(7.2, 0.9, len / 2 + 0.4));
          shape.collisionFilterGroup = GROUP.terrain;
          body.addShape(shape, new CANNON.Vec3(cx, cy, cz), q);
          for (const side of [-1, 1]) {
            const rx = Math.cos(yaw) * side * 7.2;
            const rz = -Math.sin(yaw) * side * 7.2;
            rails.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.7, len / 2 + 0.4)), new CANNON.Vec3(cx + rx, cy + 1.6, cz + rz), q);
          }
        }
        body.collisionFilterGroup = GROUP.terrain;
        P.world.addBody(body);
        P.world.addBody(rails);
        this.bodies.push(body, rails);
      }
    }
  }

  /** Driving on wheels (car or motorbike) rather than sailing or flying. */
  get onWheels() {
    return this.kind === 'car' || this.kind === 'moto';
  }

  get position() {
    return this.onWheels ? this.obj.body.position : this.obj.position;
  }

  get heading() {
    const f = this.obj.forward;
    return Math.atan2(f.x, f.z);
  }

  get speed() {
    return this.onWheels ? this.obj.vehicle.speed : this.obj.speed;
  }

  /** Puts the explorer in a vehicle; `at` = { x, y, z, yaw, speed } or a sensible spot nearby. */
  spawn(kind, at = null) {
    const g = this.game;
    const here = at || (this.obj ? { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.heading, speed: this.speed } : null);
    this._drop();
    this.kind = kind;
    const spot = this._spot(kind, here);
    const color = g.settings.color;
    if (kind === 'car' || kind === 'moto') {
      const ctx = g.carContext(this.island);
      const car = new Car(ctx, { color, stripe: '#111111', number: 7, name: 'את/ה', isPlayer: true, position: new THREE.Vector3(spot.x, spot.y + (spot.exact ? 0 : 0.7), spot.z), heading: spot.yaw, type: kind === 'moto' ? 'moto' : g.settings.car || 'gt' });
      // Carrying on from another island: same speed, same direction.
      if (spot.exact && spot.speed) car.body.velocity.set(Math.sin(spot.yaw) * spot.speed, spot.vy || 0, Math.cos(spot.yaw) * spot.speed);
      this.obj = car;
      this.driver = new PlayerDriver(car, this.engine.input, g.touch);
      g.carAudio?.attachPlayer(car);
    } else {
      const design = (g.settings.designs || {})[kind];
      const craft = new Craft(this.env, { kind, color, stripe: '#111111', name: 'את/ה', number: 7, isPlayer: true, position: new THREE.Vector3(spot.x, spot.y, spot.z), heading: spot.yaw, seed: 3, design });
      if (kind === 'plane' || kind === 'glider') craft.chase3d = true;
      if (spot.park !== undefined) craft.park(spot.park);
      if (spot.exact) {
        // Carrying on from another island exactly as it was.
        if (spot.speed) craft.speed = spot.speed;
        craft.pitch = spot.pitch || 0;
        craft.vy = spot.vy || 0;
        craft._fwd();
        craft.velocity.copy(craft.forward).multiplyScalar(craft.speed);
      } else if (spot.speed && kind !== 'plane' && kind !== 'glider') craft.speed = Math.min(spot.speed, 12);
      craft.vehicle.controls.hold = false;
      this.obj = craft;
      this.driver = new CraftPlayer(craft, this.engine.input, g.touch);
      g.carAudio?.attachPlayer(craft);
    }
    g.camera.target = this.obj;
    g.camera.setMode('chase');
    g.camera.snap = true;
  }

  _drop() {
    if (!this.obj) return;
    this.game.resetCarAudio();
    this.obj.dispose();
    this.obj = null;
    this.game.wheels.reset();
  }

  /** A good place for this vehicle near `here`: land for the car, open water for boats, sky for aircraft. */
  _spot(kind, here) {
    const tr = this.island.track;
    if (here && here.exact) return { ...here };
    const base = here || (() => {
      const p = tr.pose(0.02, 0);
      return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: Math.atan2(p.tangent.x, p.tangent.z), speed: 0 };
    })();
    const x = base.x;
    const z = base.z;
    const yaw = base.yaw || 0;
    const g = this.ground(x, z);
    const find = (ok) => {
      for (let r = 0; r < 1600; r += 25) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          if (ok(px, pz, this.ground(px, pz))) return { x: px, z: pz };
          if (r === 0) break;
        }
      }
      return null;
    };
    if (kind === 'car' || kind === 'moto') {
      // On a bridge deck already? Stay there. Else the nearest bit of the circuit, or dry land.
      if (here && here.onDeck) return { x, y: here.y + 0.5, z, yaw };
      if (g > 0.8 && here) return { x, y: g + 0.8, z, yaw };
      const q = tr.nearest(x, z, {});
      if (q && q.dist < 400) {
        const p = tr.pose(q.s, 0);
        return { x: p.position.x, y: p.position.y + 0.3, z: p.position.z, yaw: Math.atan2(p.tangent.x, p.tangent.z) };
      }
      const land = find((px, pz, h) => h > 1.5 && h < 60);
      if (land) return { ...land, y: this.ground(land.x, land.z) + 1, yaw };
      const p = tr.pose(0.02, 0);
      return { x: p.position.x, y: p.position.y + 0.3, z: p.position.z, yaw: Math.atan2(p.tangent.x, p.tangent.z) };
    }
    if (kind === 'boat' || kind === 'sub') {
      const depth = kind === 'sub' ? 9 : 3;
      const wet = g < -depth ? { x, z } : find((px, pz, h) => h < -depth);
      const w = wet || { x: x + 900, z };
      const floor = this.ground(w.x, w.z);
      return { x: w.x, y: kind === 'sub' ? Math.max(floor + 3, -7) : 0.1, z: w.z, yaw };
    }
    // A plane on the road: parked on the asphalt, pointing along it, ready to take off.
    const road = kind === 'plane' ? this.env.road(x, z) : null;
    if (road !== null && (!here || here.y - road < 8)) {
      const q = tr.nearest(x, z, {});
      const tx = tr.tx[q.i];
      const tz = tr.tz[q.i];
      const s = Math.sin(yaw) * tx + Math.cos(yaw) * tz < 0 ? -1 : 1;
      return { x, y: road, z, yaw: Math.atan2(tx * s, tz * s), park: road };
    }
    // Aircraft: above wherever we are.
    const alt = kind === 'glider' ? 180 : 90;
    return { x, y: Math.max(base.y || 0, Math.max(0, g)) + alt, z, yaw, speed: base.speed };
  }

  /** Per frame (sim time). */
  update(dt) {
    if (dt <= 0 || !this.obj) return;
    const I = this.engine.input;
    this.driver.update(dt);
    // Shrubs give way (and hold the car back a little).
    const Bu = this.island.bushes;
    if (Bu && Bu.items.length) {
      const p = this.position;
      let mover = null;
      if (this.onWheels) {
        const v = this.obj.body.velocity;
        mover = { x: p.x, z: p.z, vx: v.x, vz: v.z, r: 1.25 };
      } else if (p.y < this.ground(p.x, p.z) + 2.5) {
        const v = this.obj.velocity;
        mover = { x: p.x, z: p.z, vx: v.x, vz: v.z, r: 2 };
      }
      const drag = Bu.update(dt, mover ? [mover] : null);
      if (drag && this.onWheels) {
        const v = this.obj.body.velocity;
        const k = 1 - Math.min(0.12, drag * dt * 0.55);
        v.x *= k;
        v.z *= k;
      }
    }
    // Herds bolt from a vehicle on the ground.
    if (this.island.life) {
      const p = this.position;
      const low = this.onWheels || p.y < this.ground(p.x, p.z) + 6;
      this.island.life.threat = low ? { x: p.x, z: p.z, speed: Math.abs(this.speed) } : null;
    }
    // City traffic brakes for the explorer.
    if (this.island.city) this.island.city.avoid = this.onWheels || this.position.y < this.ground(this.position.x, this.position.z) + 4 ? this.position : null;
    if (this.onWheels) {
      this.obj.update(dt, (x, z) => this.island.surface(x, z), this.island.dustColor);
      this.game.wheels.commit();
    } else {
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.obj.step(STEP, this.engine.time.elapsed);
      }
      this.obj.update(dt);
      if (this.obj.crashed && this.obj.crash <= 0) {
        this.obj.crashed = false;
        this.spawn(this.kind);
      }
      if (this.obj.hit) {
        this.engine.events.emit('shake', { strength: this.obj.hit * 0.5 });
        this.obj.hit = 0;
      }
    }
    // Keys: V cycles vehicles, AltGr puts you back somewhere sensible.
    const order = Object.keys(ROAM);
    if (I.wasPressed('KeyV')) this.game.roamVehicle(order[(order.indexOf(this.kind) + 1) % order.length]);
    if (I.wasPressed('KeyG')) this.game.roamDesign();
    if (actionKeys(I).reset || this.game.touch.reset) {
      this.game.touch.reset = false;
      this.spawn(this.kind);
    }
    // The car fell into the sea: back to land.
    if (this.onWheels && this.position.y < -3) this.spawn(this.kind);
    // Heading for another island? It is built when we get there.
    const [wx, wz] = this.world.toWorld(this.position.x, this.position.z);
    const st = this.world.islandAt(wx, wz);
    if (st && st.id !== this.island.stage.id) {
      const [cx, cz] = this.world.pos(st.id);
      const inside = Math.min(st.size / 2 - Math.abs(wx - cx), st.size / 2 - Math.abs(wz - cz));
      if (inside > 120 && !this.travelling) {
        this.travelling = true;
        const p = this.position;
        const onDeck = this.onWheels && this.ground(p.x, p.z) < p.y - 3;
        const o = this.obj;
        this.game.roamTravel(st, { wx, wz, y: p.y, yaw: this.heading, speed: this.speed, kind: this.kind, onDeck, pitch: o.pitch, vy: this.onWheels ? o.body.velocity.y : o.vy });
      }
    }
  }

  dispose() {
    this._drop();
    if (this.island.city) this.island.city.avoid = null;
    if (this.island.life) this.island.life.threat = null;
    const P = this.engine.physics;
    for (const b of this.bodies) P.world.removeBody(b);
    this.bodies = [];
    P.world.removeEventListener('preStep', this._pre);
  }
}
