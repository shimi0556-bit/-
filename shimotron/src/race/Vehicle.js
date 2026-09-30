import * as CANNON from 'cannon-es';
import { CAR } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new CANNON.Vec3();
const _f = new CANNON.Vec3();
const _u = new CANNON.Vec3();
const _r = new CANNON.Vec3();
const _w = new CANNON.Vec3();
const Z = new CANNON.Vec3(0, 0, 1);
const Y = new CANNON.Vec3(0, 1, 0);
const X = new CANNON.Vec3(1, 0, 0);
const STUNNED = { throttle: 0, brake: 0.25, steer: 0, handbrake: false, nitro: false, hold: false };

/** Collision groups: car chassis, and the terrain heightfield's shape. */
export const GROUP = { car: 4, terrain: 8 };

/** Shared contact material for car chassis (slides along rails, bumps other cars). */
export function carMaterial(physics) {
  if (physics.materials.car) return physics.materials.car;
  const car = new CANNON.Material('car');
  physics.materials.car = car;
  const w = physics.world;
  const pair = (other, friction, restitution) => w.addContactMaterial(new CANNON.ContactMaterial(car, other, { friction, restitution, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 }));
  pair(physics.materials.ground, 0.25, 0.05);
  pair(physics.materials.metal, 0.04, 0.12);
  pair(physics.materials.default, 0.2, 0.1);
  pair(physics.materials.wood, 0.2, 0.1);
  // Car-to-car: soft and low friction, so door-to-door contact nudges instead of launching.
  w.addContactMaterial(new CANNON.ContactMaterial(car, car, { friction: 0.05, restitution: 0.05, contactEquationStiffness: 2e6, contactEquationRelaxation: 6 }));
  return car;
}

/**
 * Physics side of one car: a RaycastVehicle on a compound chassis, driven
 * by a small powertrain model. Everything is computed per fixed physics
 * step in preStep(dt), before cannon's own vehicle update.
 *
 * Local frame: +z forward, +y up, +x left. `controls` is written by the
 * player or an AI driver: throttle/brake 0..1, steer -1 (left)..1 (right),
 * handbrake and nitro booleans.
 */
export class Vehicle {
  constructor(physics, { position, heading = 0, ground = null, spec = CAR } = {}) {
    this.physics = physics;
    this.spec = spec;
    const S = spec;
    const mat = carMaterial(physics);
    const body = new CANNON.Body({ mass: S.mass, material: mat, allowSleep: false, angularDamping: 0.05, linearDamping: 0.004 });
    const b = S.body;
    const c = S.cabin;
    // Boxes hit rails and other cars but skip the terrain heightfield (box-vs-heightfield
    // is by far the most expensive test in cannon); the four skid spheres touch the ground.
    for (const [half, off] of [[b.half, b.offset], [c.half, c.offset]]) {
      const box = new CANNON.Box(new CANNON.Vec3(...half));
      box.collisionFilterMask = ~GROUP.terrain;
      body.addShape(box, new CANNON.Vec3(...off));
    }
    // Skid spheres: boxes cannot touch the road trimesh, spheres can.
    // Skid spheres under the floor and on the roof keep a bottomed-out or flipped car
    // on the ground; they only touch the (cheap) terrain heightfield.
    // Floor spheres sit 10 cm above the tyres' contact patch at rest.
    const Wh = S.wheel;
    const floorY = Wh.height - (Wh.restLength - 9.82 / (4 * Wh.stiffness)) - Wh.radius + 0.1 + 0.2;
    const sx = Math.min(0.62, b.half[0] - 0.25);
    const sz = b.half[2] - 0.57;
    const top = c.offset[1] + c.half[1] - 0.12;
    for (const [x, y, z, r] of [[sx, floorY, sz, 0.2], [-sx, floorY, sz, 0.2], [sx, floorY, -sz, 0.2], [-sx, floorY, -sz, 0.2], [0, top, c.offset[2] + 0.35, 0.3], [0, top, c.offset[2] - 0.45, 0.3]]) {
      const sphere = new CANNON.Sphere(r);
      sphere.collisionFilterMask = GROUP.terrain;
      body.addShape(sphere, new CANNON.Vec3(x, y, z));
    }
    body.collisionFilterGroup = GROUP.car;
    body.collisionFilterMask = -1;
    this.body = body;

    const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const W = S.wheel;
    const opts = {
      radius: W.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: W.stiffness,
      suspensionRestLength: W.restLength,
      frictionSlip: W.grip,
      dampingRelaxation: W.dampRelaxation,
      dampingCompression: W.dampCompression,
      maxSuspensionForce: 1e6,
      rollInfluence: W.rollInfluence,
      axleLocal: new CANNON.Vec3(1, 0, 0),
      maxSuspensionTravel: W.travel,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };
    // Order: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right (left = +x).
    for (const [x, z] of [[W.track, W.front], [-W.track, W.front], [W.track, W.rear], [-W.track, W.rear]]) {
      vehicle.addWheel({ ...opts, chassisConnectionPointLocal: new CANNON.Vec3(x, W.height, z) });
    }
    this.vehicle = vehicle;
    this.wheelBase = W.front - W.rear;

    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, hold: false };
    this.steerAngle = 0; // current road-wheel angle (+ = right)
    this.speed = 0; // signed forward speed m/s
    this.gear = 1;
    this.rpm = S.engine.idleRpm;
    this.shift = 0; // seconds left in a gear change
    this.nitro = 1; // tank 0..1
    this.nitroActive = false;
    this.reversing = false;
    this.slip = [0, 0, 0, 0]; // 0 = gripping, 1 = fully sliding
    this.contact = [false, false, false, false];
    this.airborne = 0;
    this.upsideDown = 0;
    this.wheelSpin = [0, 0, 0, 0]; // accumulated rotation (rad)
    this.compression = [0, 0, 0, 0];
    this.onShift = null; // (gear, up) => void
    this.assist = 1; // stability-assist scale (AI and player settings)
    this.gripScale = [1, 1, 1, 1]; // per-wheel surface grip
    this.surfaceDrag = 0; // extra rolling resistance off the asphalt (m/s²)
    this.draft = 0; // slipstream 0..1 (set by the race: close behind another car)
    this.boost = 0; // seconds of turbo left (pickup)
    this.stun = 0; // seconds of being knocked out of control (hit by a shot or a mine)

    if (position) this.place(position, heading);
    vehicle.addToWorld(physics.world);
    // Wheel rays ignore every car chassis (group 4), so cars never "drive" on each other.
    const world = physics.world;
    const rayWorld = Object.create(world);
    const rayOpts = { skipBackfaces: true, collisionFilterMask: ~GROUP.car, checkCollisionResponse: true };
    // `ground(from, to, result)` may answer the ray analytically (the race track does).
    rayWorld.rayTest = (from, to, result) => {
      if (ground && ground(from, to, result)) return;
      world.raycastClosest(from, to, rayOpts, result);
    };
    vehicle.world = rayWorld;
  }

  /** Teleports the car, resets motion. heading: yaw in radians (0 = +z). */
  place(position, heading = 0) {
    const b = this.body;
    b.position.set(position.x, position.y, position.z);
    b.quaternion.setFromEuler(0, heading, 0);
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.force.setZero();
    b.torque.setZero();
    b.previousPosition.copy(b.position);
    b.interpolatedPosition.copy(b.position);
    b.previousQuaternion.copy(b.quaternion);
    b.interpolatedQuaternion.copy(b.quaternion);
    this.steerAngle = 0;
    this.gear = 1;
    this.shift = 0;
    for (const w of this.vehicle.wheelInfos) {
      w.suspensionLength = w.suspensionRestLength;
      w.deltaRotation = 0;
    }
  }

  remove() {
    this.vehicle.world = this.physics.world;
    this.vehicle.removeFromWorld(this.physics.world);
  }

  /** Max road-wheel angle at a given speed: generous when slow, grip-limited when fast. */
  steerLimit(v) {
    const T = this.spec.steer;
    const grip = T.gripAngle / Math.max(1, v * v);
    return clamp(grip, T.min, T.max);
  }

  preStep(dt) {
    const S = this.spec;
    const b = this.body;
    const veh = this.vehicle;
    const C = this.stun > 0 ? STUNNED : this.controls;
    if (this.stun > 0) this.stun -= dt;
    if (this.boost > 0) this.boost -= dt;
    const E = S.engine;
    const m = S.mass;

    b.quaternion.vmult(Z, _f);
    b.quaternion.vmult(Y, _u);
    b.quaternion.vmult(X, _r);
    const v = b.velocity;
    const vf = v.dot(_f);
    const vAbs = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    this.speed = vf;

    // ---- steering (rate limited, speed sensitive)
    const lim = this.steerLimit(Math.abs(vf));
    const want = clamp(C.steer, -1, 1) * lim;
    const rate = (Math.abs(want) > Math.abs(this.steerAngle) && Math.sign(want) === Math.sign(this.steerAngle || want) ? S.steer.rate : S.steer.returnRate) * dt;
    // Bikes ease in and out of the angle (the machine has to bank first) instead of sweeping at a fixed rate.
    const next = S.steer.lag ? this.steerAngle + (want - this.steerAngle) * (1 - Math.exp(-dt / S.steer.lag)) : want;
    this.steerAngle += clamp(next - this.steerAngle, -rate, rate);
    // Positive cannon steering turns toward +x (left), so negate.
    veh.setSteeringValue(-this.steerAngle, 0);
    veh.setSteeringValue(-this.steerAngle, 1);

    // ---- gearbox (automatic)
    const gears = E.gears;
    const top = (this.nitroActive || this.boost > 0 ? S.nitro.topSpeed * (this.boost > 0 ? 1.08 : 1) : E.topSpeed) * (1 + 0.06 * this.draft);
    const gearTop = (g) => (E.topSpeed * gears[gears.length - 1]) / gears[g];
    if (this.shift > 0) this.shift -= dt;
    if (!this.reversing) {
      const r = Math.abs(vf) / gearTop(this.gear);
      if (r > 0.94 && this.gear < gears.length - 1 && this.shift <= 0) {
        this.gear++;
        this.shift = S.shiftTime;
        if (this.onShift) this.onShift(this.gear, true);
      } else if (this.gear > 1 && Math.abs(vf) < gearTop(this.gear - 1) * 0.62) {
        this.gear--;
        this.shift = S.shiftTime * 0.5;
        if (this.onShift) this.onShift(this.gear, false);
      }
    }
    const rpmTarget = this.reversing ? E.idleRpm + (Math.abs(vf) / E.reverseTop) * (E.redline - E.idleRpm) * 0.8 : Math.max(E.idleRpm, (Math.abs(vf) / gearTop(this.gear)) * E.redline);
    const rev = this.airborne > 0.2 || this.slip[2] + this.slip[3] > 1.2 ? E.redline * (0.55 + C.throttle * 0.42) : rpmTarget;
    this.rpm += (Math.min(E.redline * 1.02, rev + C.throttle * 250) - this.rpm) * Math.min(1, dt * 14);

    // ---- throttle / brake / reverse logic
    let drive = 0; // desired forward acceleration from the engine (m/s²)
    let brake = 0; // 0..1
    const throttle = clamp(C.throttle, 0, 1);
    const pedal = clamp(C.brake, 0, 1);
    if (C.hold) this.reversing = false;
    else if (this.reversing) {
      if (throttle > 0.1 || (pedal < 0.05 && vf > -0.5)) this.reversing = false;
    } else if (pedal > 0.5 && vf < 0.8 && throttle < 0.1) this.reversing = true;
    if (C.hold) {
      drive = 0;
      brake = 1;
    } else if (this.reversing) {
      drive = vf > -E.reverseTop ? -pedal * E.accel * 0.55 : 0;
      if (throttle > 0.1) brake = throttle;
    } else {
      const aero = S.drag * (1 - 0.45 * this.draft) * vf * vf + S.rolling;
      const curve = Math.max(0, 1 - Math.pow(Math.max(0, vf) / top, 2.2));
      const boost = (this.nitroActive ? S.nitro.accel : 0) + (this.boost > 0 ? 9 : 0);
      drive = Math.max(throttle, this.boost > 0 ? 1 : 0) * ((E.accel + boost) * curve + aero * (vf / top < 1 ? 1 : 0));
      if (this.shift > 0) drive *= 0.25;
      brake = pedal;
    }

    // ---- nitro
    this.nitroActive = !!C.nitro && this.nitro > 0.02 && throttle > 0.2 && !this.reversing && this.airborne < 0.3;
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - S.nitro.drain * dt);
    else this.nitro = Math.min(1, this.nitro + S.nitro.refill * dt);

    // ---- apply engine: AWD split, negative = forward (+z) in cannon's convention
    const F = drive * m;
    const fs = E.frontShare;
    veh.applyEngineForce(-F * fs * 0.5, 0);
    veh.applyEngineForce(-F * fs * 0.5, 1);
    veh.applyEngineForce(-F * (1 - fs) * 0.5, 2);
    veh.applyEngineForce(-F * (1 - fs) * 0.5, 3);

    // Brakes are impulse caps per step, so scale by dt to stay step-size independent.
    const bForce = brake * S.brake.decel * m;
    const fb = S.brake.frontBias;
    const hb = C.handbrake ? S.handbrake.decel * m : 0;
    veh.setBrake(bForce * fb * 0.5 * dt, 0);
    veh.setBrake(bForce * fb * 0.5 * dt, 1);
    veh.setBrake((bForce * (1 - fb) * 0.5 + hb * 0.5) * dt, 2);
    veh.setBrake((bForce * (1 - fb) * 0.5 + hb * 0.5) * dt, 3);
    if (C.handbrake) {
      veh.applyEngineForce(0, 2);
      veh.applyEngineForce(0, 3);
    }
    // Grip per wheel: surface (set by the car from what it rolls on) × handbrake on the rear.
    for (let i = 0; i < 4; i++) {
      const w = veh.wheelInfos[i];
      const hb = i >= 2 && C.handbrake ? S.handbrake.grip : 1;
      const target = S.wheel.grip * this.gripScale[i] * hb;
      w.frictionSlip += (target - w.frictionSlip) * Math.min(1, dt * (hb < 1 ? 12 : 4));
    }

    // ---- aero: downforce (more grip at speed) and drag along the velocity
    const q = (vf / E.topSpeed) ** 2;
    const down = S.downforce * m * 9.82 * q;
    b.force.x -= _u.x * down;
    b.force.y -= _u.y * down;
    b.force.z -= _u.z * down;
    if (vAbs > 0.5) {
      const d = (S.drag * (1 - 0.45 * this.draft) * vAbs * vAbs + (S.rolling + this.surfaceDrag) * (this.airborne > 0 ? 0 : 1) * Math.min(1, vAbs / 3)) * m;
      b.force.x -= (v.x / vAbs) * d;
      b.force.y -= (v.y / vAbs) * d * 0.3;
      b.force.z -= (v.z / vAbs) * d;
    }

    // ---- contact state from the previous vehicle update
    let grounded = 0;
    for (let i = 0; i < 4; i++) {
      const w = veh.wheelInfos[i];
      this.contact[i] = w.isInContact;
      if (w.isInContact) grounded++;
      const s = w.isInContact ? 1 - clamp(w.skidInfo, 0, 1) : 0;
      this.slip[i] += (s - this.slip[i]) * Math.min(1, dt * 20);
      this.compression[i] = w.isInContact ? (w.suspensionRestLength - w.suspensionLength) / w.maxSuspensionTravel : -0.3;
      const locked = i >= 2 && C.handbrake && w.isInContact;
      const spinV = vf;
      if (!locked) this.wheelSpin[i] += (spinV * dt) / S.wheel.radius;
    }
    this.airborne = grounded === 0 ? this.airborne + dt : 0;

    // ---- stability assist: yaw damping toward the kinematic yaw rate, anti-roll
    const av = b.angularVelocity;
    const yawRate = av.dot(_u);
    const expected = (vf * Math.tan(this.steerAngle)) / this.wheelBase * -1; // right turn = negative yaw about +y
    if (grounded >= 3 && Math.abs(vf) > 4 && this.stun <= 0) {
      const err = yawRate - expected;
      const k = S.assist.yaw * clamp((Math.abs(vf) - 4) / 10, 0, 1) * (C.handbrake ? 0.25 : 1) * this.assist;
      const inertia = b.inertia.y || m;
      const tq = -err * k * inertia * 8;
      b.torque.x += _u.x * tq;
      b.torque.y += _u.y * tq;
      b.torque.z += _u.z * tq;
    }
    // Roll & pitch: keep the car from tipping over on kerbs; level it in the air.
    const roll = _r.y; // sin of roll (+ = left side up)
    const pitch = _f.y; // sin of pitch (+ = nose up)
    this.upsideDown = _u.y < 0.2 ? this.upsideDown + dt : 0;
    if (_u.y > 0.2) {
      const ar = S.assist.antiRoll * m;
      const dz = grounded >= 3 ? 0.1 : 0;
      let rollT = -Math.sign(roll) * Math.max(0, Math.abs(roll) - dz) * ar * (grounded >= 3 ? 1.5 : 0.5);
      // Arcade safety net: past ~20° of roll, right the car firmly (rail hits, door-to-door).
      if (Math.abs(roll) > 0.34) rollT -= Math.sign(roll) * (Math.abs(roll) - 0.34) * ar * 4;
      const pitchT = grounded >= 3 ? 0 : pitch * ar * 0.3;
      b.torque.x += _f.x * rollT + _r.x * pitchT;
      b.torque.y += _f.y * rollT + _r.y * pitchT;
      b.torque.z += _f.z * rollT + _r.z * pitchT;
      if (S.bike) {
        // Two wheels: the rider balances the machine, so the chassis stays upright (the lean is drawn on the model).
        const wr = av.dot(_f);
        const I = b.inertia.z || m;
        const tq = -(roll * 170 + wr * 24) * I;
        b.torque.x += _f.x * tq;
        b.torque.y += _f.y * tq;
        b.torque.z += _f.z * tq;
        if (grounded >= 1) {
          // The rider's weight over the bars / over the back: cancels most of the wheelie from the drive and
          // the stoppie from the brakes (both act at the tyres, well below the centre of mass), damps pitching,
          // and puts a lifted wheel back down while the other is on the ground.
          const h = S.wheel.restLength + S.wheel.radius - S.wheel.height;
          const wp = av.dot(_r);
          const Ip = b.inertia.x || m;
          let tp = -wp * Ip * 5;
          if (!C.hold) {
            tp += F * h * 0.8;
            if (Math.abs(vf) > 1) tp -= brake * S.brake.decel * m * Math.sign(vf) * h * 0.8;
          }
          const front = this.contact[0] || this.contact[1];
          const back = this.contact[2] || this.contact[3];
          if (back && !front) tp += Ip * 9;
          else if (front && !back) tp -= Ip * 9;
          b.torque.x += _r.x * tp;
          b.torque.y += _r.y * tp;
          b.torque.z += _r.z * tp;
        }
      }
      if (grounded === 0) {
        const wr = av.dot(_f);
        const wp = av.dot(_r);
        const k = Math.min(1, dt * 2);
        av.x -= (_f.x * wr + _r.x * wp) * k;
        av.y -= (_f.y * wr + _r.y * wp) * k;
        av.z -= (_f.z * wr + _r.z * wp) * k;
      }
    }
  }

  /** Signed lateral speed (m/s, + = sliding toward the car's right). */
  lateralSpeed() {
    this.body.quaternion.vmult(X, _w);
    return -this.body.velocity.dot(_w);
  }

  get drifting() {
    return Math.abs(this.lateralSpeed()) > 3.2 && Math.abs(this.speed) > 8;
  }
}
