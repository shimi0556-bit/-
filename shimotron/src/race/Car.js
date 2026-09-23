import * as THREE from 'three';
import { Emitter } from '../engine/fx/Particles.js';
import { Vehicle } from './Vehicle.js';
import { createCarModel } from './CarModel.js';
import { CAR } from './config.js';

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WHEEL_X = [CAR.wheel.track, -CAR.wheel.track, CAR.wheel.track, -CAR.wheel.track];
const WHEEL_Z = [CAR.wheel.front, CAR.wheel.front, CAR.wheel.rear, CAR.wheel.rear];

/**
 * One race car: physics (Vehicle) + procedural model + wheels in the shared
 * batch + tyre smoke, dust, nitro flame, sparks and skid marks.
 * `surface(x, z)` from the world says what each wheel is rolling on.
 */
export class Car {
  constructor(ctx, { color, stripe, number, name, isPlayer = false, position, heading = 0 }) {
    this.ctx = ctx;
    this.name = name;
    this.color = color;
    this.number = number;
    this.isPlayer = isPlayer;
    this.vehicle = new Vehicle(ctx.physics, { position, heading, ground: ctx.ground });
    this.body = this.vehicle.body;
    this.body.userData = { car: this };
    const model = createCarModel(ctx.materials, { color, number, stripe });
    this.model = model;
    this.object = model.group;
    this.object.name = `מכונית ${number}`;
    ctx.scene.add(this.object);
    this.wheelBase = ctx.wheels.allocate();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.position = this.object.position;
    this.lastMark = [null, null, null, null];
    this.brakeGlow = 0;
    this.surfaces = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];
    this.offroad = 0;
    this.scrape = 0;
    this._fx();
    if (isPlayer) this._headlights();
    // Rail scrapes and car-to-car hits.
    this._onCollide = (e) => {
      const other = e.body;
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const c = e.contact;
      const bi = c.bi;
      const ri = c.ri;
      const point = new THREE.Vector3(bi.position.x + ri.x, bi.position.y + ri.y, bi.position.z + ri.z);
      const isCar = other.userData && other.userData.car;
      const isRail = other.material === ctx.physics.materials.metal;
      if (isRail) {
        this.scrape = Math.min(1, this.scrape + 0.35 + speed * 0.05);
        // Local x of the contact (+ = left side of the car).
        this._railSide = (point.x - this.body.position.x) * -this.right.x + (point.z - this.body.position.z) * -this.right.z > 0 ? 1 : -1;
      }
      if (speed > 1.5) {
        ctx.engine.events.emit('car:impact', { car: this, other: isCar ? other.userData.car : null, speed, point, rail: isRail });
      }
    };
    this.body.addEventListener('collide', this._onCollide);
  }

  _fx() {
    const P = this.ctx.particles;
    const smoke = (sys) =>
      new Emitter(P.systems[sys], {
        rate: 0,
        dir: new THREE.Vector3(0, 1, 0),
        spread: 0.9,
        radius: 0.15,
        speed: [0.4, 1.6],
        life: [1.2, 2.4],
        size0: [0.35, 0.6],
        size1: [1.8, 3.2],
        color0: [0.85, 0.85, 0.86, 0.45],
        color1: [0.85, 0.85, 0.86, 0],
        drag: 1.4,
        turbulence: 0.7,
        gravity: -0.15,
      });
    this.smoke = [smoke('smoke'), smoke('smoke')];
    this.dust = [smoke('dust'), smoke('dust')];
    this.flames = [0, 1].map(
      () =>
        new Emitter(P.systems.fire, {
          rate: 0,
          dir: new THREE.Vector3(0, 0, -1),
          spread: 0.12,
          radius: 0.02,
          speed: [5, 9],
          life: [0.08, 0.16],
          size0: [0.12, 0.18],
          size1: [0.03, 0.05],
          color0: [0.35, 0.55, 1.0, 1],
          color1: [1.0, 0.35, 0.1, 0],
          intensity: 1.1,
        }),
    );
    this.sparks = new Emitter(P.systems.sparks, {
      rate: 0,
      dir: new THREE.Vector3(0, 1, 0),
      spread: 1.0,
      speed: [3, 8],
      life: [0.2, 0.5],
      size0: [0.03, 0.05],
      size1: [0.01, 0.02],
      color0: [1.0, 0.78, 0.4, 1],
      color1: [1.0, 0.3, 0.05, 1],
      gravity: 11,
      drag: 1.2,
      intensity: 20,
    });
    for (const e of [...this.smoke, ...this.dust, ...this.flames, this.sparks]) P.add(e);
  }

  /** Two real spot lights for the player's car (they matter on the night island). */
  _headlights() {
    this.lamps = [];
    for (const x of [0.62, -0.62]) {
      const l = new THREE.SpotLight(0xfff1dc, 0, 140, 0.48, 0.55, 1.6);
      l.position.set(x, -0.05, 2.1);
      l.target.position.set(x * 3, -0.6, 24);
      this.object.add(l, l.target);
      this.lamps.push(l);
    }
  }

  get speed() {
    return this.vehicle.speed;
  }

  get kmh() {
    return Math.abs(this.vehicle.speed) * 3.6;
  }

  place(position, heading) {
    this.vehicle.place(position, heading);
    this.lastMark = [null, null, null, null];
    this.sync(0);
  }

  /** Copies the interpolated chassis transform to the model and wheels. */
  sync(dt) {
    const b = this.body;
    const ip = b.interpolatedPosition;
    const iq = b.interpolatedQuaternion;
    this.object.position.set(ip.x, ip.y, ip.z);
    this.object.quaternion.set(iq.x, iq.y, iq.z, iq.w);
    this.object.updateMatrixWorld();
    this.forward.set(0, 0, 1).applyQuaternion(this.object.quaternion);
    this.right.set(-1, 0, 0).applyQuaternion(this.object.quaternion);
    const veh = this.vehicle;
    const infos = veh.vehicle.wheelInfos;
    const W = this.ctx.wheels;
    for (let i = 0; i < 4; i++) {
      const info = infos[i];
      const len = info.isInContact ? info.suspensionLength : Math.min(info.suspensionRestLength + 0.05, info.suspensionLength + 0.2);
      _p.set(WHEEL_X[i], CAR.wheel.height - len, WHEEL_Z[i]);
      const left = i % 2 === 0;
      const steer = i < 2 ? -veh.steerAngle : 0;
      const spin = veh.wheelSpin[i];
      _q.setFromAxisAngle(UP, steer + (left ? Math.PI : 0));
      _qs.setFromAxisAngle(_a.set(1, 0, 0), left ? -spin : spin);
      _q.multiply(_qs);
      _m.compose(_p, _q, _s);
      _w.multiplyMatrices(this.object.matrixWorld, _m);
      W.set(this.wheelBase + i, _w);
    }
  }

  /** Per-frame visuals and effects. surface(x, z) → 'asphalt' | 'curb' | 'gravel' | 'grass' | 'sand' | 'snow' | 'water'. */
  update(dt, surface, dustColor) {
    this.sync(dt);
    const veh = this.vehicle;
    const C = veh.controls;
    const v = Math.abs(veh.speed);
    // Brake lights and reverse glow.
    const braking = (C.brake > 0.1 && !veh.reversing) || C.handbrake;
    this.brakeGlow += ((braking ? 1 : 0) - this.brakeGlow) * Math.min(1, dt * 18);
    this.ctx.materials.setEmissiveBase(this.model.tailMat, 0.22 + this.brakeGlow * 1.3);
    const night = this.ctx.engine.atmosphere.nightFactor;
    if (this.lamps) for (const l of this.lamps) l.intensity = 26 * night + 2;
    // Daytime running lights stay subtle; full beams glow after dusk (shared material).
    if (this.isPlayer) this.ctx.materials.setEmissiveBase(this.model.headMat, 0.08 + night * 0.6);

    // Wheel contact points (world).
    const infos = veh.vehicle.wheelInfos;
    let slide = 0;
    let off = 0;
    for (let i = 0; i < 4; i++) {
      const info = infos[i];
      if (!info.isInContact) {
        this.lastMark[i] = null;
        continue;
      }
      const hp = info.raycastResult.hitPointWorld;
      const s = surface(hp.x, hp.z);
      this.surfaces[i] = s;
      const loose = s !== 'asphalt' && s !== 'curb';
      if (loose) off++;
      // Slide amount: cannon skid + lateral slip at the contact.
      const lat = Math.abs(veh.lateralSpeed());
      const k = Math.max(veh.slip[i], Math.min(1, Math.max(0, (lat - 2.2) / 6)), i >= 2 && C.handbrake && v > 4 ? 0.8 : 0);
      if (i >= 2) slide = Math.max(slide, k);
      const markable = !loose || s === 'snow' || s === 'sand';
      if (k > 0.25 && v > 3 && markable) {
        const cur = _b.set(hp.x, hp.y + 0.025, hp.z);
        const last = this.lastMark[i];
        if (last && last.distanceToSquared(cur) > 0.36) {
          _side.subVectors(cur, last).cross(UP).normalize();
          const tint = s === 'snow' ? [0.55, 0.6, 0.7] : s === 'sand' ? [0.55, 0.42, 0.3] : [1, 1, 1];
          this.ctx.skid.add(last, cur, _side, CAR.wheel.width * 0.9, Math.min(0.75, k * 0.9), tint);
          last.copy(cur);
        } else if (!last) this.lastMark[i] = cur.clone();
      } else this.lastMark[i] = null;
    }
    this.offroad = off / 4;
    // Surface grip and drag feed back into the physics.
    const G = this.ctx.surfaceGrip;
    let drag = 0;
    for (let i = 0; i < 4; i++) {
      const sf = this.surfaces[i];
      veh.gripScale[i] = infos[i].isInContact ? G[sf]?.[0] ?? 1 : 1;
      drag += G[sf]?.[1] ?? 0;
    }
    veh.surfaceDrag = drag / 4;

    // Rear smoke on asphalt, dust on loose ground.
    const smokeRate = v > 4 ? Math.max(0, slide - 0.45) * 90 : 0;
    const dustRate = v > 3 ? Math.min(1, v / 25) * 26 * this.offroad : 0;
    for (let k = 0; k < 2; k++) {
      const x = k === 0 ? CAR.wheel.track : -CAR.wheel.track;
      this._local(x, -0.5, CAR.wheel.rear - 0.25, this.smoke[k].position);
      this.smoke[k].rate = this.offroad > 0.5 ? 0 : smokeRate;
      this.dust[k].position.copy(this.smoke[k].position);
      this.dust[k].rate = dustRate + (this.offroad > 0.5 ? smokeRate * 0.5 : 0);
      const dc = dustColor || [0.62, 0.55, 0.45];
      this.dust[k].o.color0 = [dc[0], dc[1], dc[2], 0.55];
      this.dust[k].o.color1 = [dc[0], dc[1], dc[2], 0];
      this.dust[k].o.dir.copy(this.forward).multiplyScalar(-0.4).add(UP).normalize();
    }
    // Nitro flames out of both exhausts.
    for (let k = 0; k < 2; k++) {
      this._local(k === 0 ? 0.34 : -0.34, -0.3, -2.26, this.flames[k].position);
      this.flames[k].o.dir.copy(this.forward).negate();
      this.flames[k].rate = veh.nitroActive ? 60 : 0;
    }
    // Sparks while scraping a rail.
    if (this.scrape > 0.05 && v > 5) {
      this.sparks.rate = this.scrape * 160;
      const sideSign = this._railSide || 1;
      this._local(sideSign * 0.95, -0.2, 0, this.sparks.position);
    } else this.sparks.rate = 0;
    this.scrape = Math.max(0, this.scrape - dt * 3);
  }

  _local(x, y, z, out) {
    return out.set(x, y, z).applyMatrix4(this.object.matrixWorld);
  }

  dispose() {
    const P = this.ctx.particles;
    for (const e of [...this.smoke, ...this.dust, ...this.flames, this.sparks]) P.remove(e);
    this.body.removeEventListener('collide', this._onCollide);
    this.vehicle.remove();
    this.object.removeFromParent();
    this.model.paint.dispose();
    this.model.tailMat.dispose();
  }
}

