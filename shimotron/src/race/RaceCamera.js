import * as THREE from 'three';
import { CAMERA, CAR } from './config.js';

const _up = new THREE.Vector3(0, 1, 0);
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _look = new THREE.Vector3();

const _c = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/** Moves `cur` towards `target` as a critically damped spring of angular frequency w (exact for any dt). */
function smoothDamp(cur, target, vel, w, dt) {
  const x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  _c.subVectors(cur, target);
  _tmp.copy(vel).addScaledVector(_c, w).multiplyScalar(dt);
  vel.addScaledVector(_tmp, -w).multiplyScalar(e);
  cur.copy(target).add(_c.add(_tmp).multiplyScalar(e));
}

/**
 * Race camera rig (plugs into engine.cameraRig): chase / far / hood /
 * bumper views on a critically damped spring, speed FOV and nitro kick,
 * impact shake, a slow orbit for the grid intro and the podium, and a
 * trackside "TV" camera for spectating.
 */
export class RaceCamera {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.target = null; // Car
    this.modeIndex = 0;
    this.mode = 'chase';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.lookVel = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.lookOffset = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.trauma = 0;
    this.orbitAngle = 0;
    this.orbitRadius = 11;
    this.orbitHeight = 3.2;
    this.fovBase = 62;
    this.groundHeight = null;
    this.snap = true;
    this.lookBack = false;
    this._focus = new THREE.Vector3();
    engine.events.on('shake', ({ strength = 0.4 } = {}) => {
      this.trauma = Math.min(1, this.trauma + strength);
    });
  }

  get view() {
    return CAMERA.modes[this.modeIndex];
  }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA.modes.length;
    this.snap = true;
    return this.view;
  }

  setMode(mode) {
    this.mode = mode;
    this.snap = true;
  }

  focusPoint() {
    if (this.target) {
      const p = this.target.position;
      return this._focus.copy(p).addScaledVector(this.target.forward, 18);
    }
    return this._focus.copy(this.camera.position);
  }

  update(dt) {
    const cam = this.camera;
    const car = this.target;
    if (!car) return;
    dt = Math.min(dt, 0.1);
    const view = this.view;
    if (car.setView) car.setView(this.mode === 'chase' ? view.id : 'chase');
    const p = car.position;
    const fwd = car.forward;
    const v = Math.abs(car.vehicle.speed);
    // Heading follows the car's velocity a little (so drifts show the car's angle), smoothed.
    const vel = car.body.velocity;
    _fwd.set(vel.x, 0, vel.z);
    const hv = _fwd.length();
    _fwd.set(fwd.x, 0, fwd.z).normalize();
    if (hv > 6 && car.vehicle.speed > 0) _fwd.lerp(_d.set(vel.x / hv, 0, vel.z / hv), 0.35).normalize();
    if (this.lookBack) _fwd.negate();
    // Bikes flick through turns: their chase camera swings round more gently.
    const kh = 1 - Math.exp(-dt * (view.distance > 0 ? (car.spec?.bike ? 3.2 : 5) : 30));
    this.heading.lerp(_fwd, this.snap ? 1 : kh).normalize();

    let fovTarget = view.fov;
    if (this.mode === 'orbit' || this.mode === 'podium') {
      this.orbitAngle += dt * (this.mode === 'podium' ? 0.22 : 0.35);
      const r = this.orbitRadius;
      _t.set(p.x + Math.cos(this.orbitAngle) * r, p.y + this.orbitHeight, p.z + Math.sin(this.orbitAngle) * r);
      _look.copy(p);
      _look.y += 0.6;
      this._spring(_t, _look, dt, 3, p);
      fovTarget = 50;
    } else if (this.mode === 'tv') {
      // A trackside camera that hops ahead of the car when it gets too far.
      if (!this.tvPos || this.tvPos.distanceTo(p) > 90) {
        this.tvPos = p.clone().addScaledVector(this.heading, 55).addScaledVector(_d.crossVectors(this.heading, _up).normalize(), (Math.random() < 0.5 ? -1 : 1) * 16);
        const gh = this.groundHeight ? this.groundHeight(this.tvPos.x, this.tvPos.z) : p.y;
        this.tvPos.y = Math.max(gh, p.y) + 4 + Math.random() * 4;
        this.snap = true;
      }
      this._spring(this.tvPos, p, dt, 6);
      const d = cam.position.distanceTo(p);
      fovTarget = THREE.MathUtils.clamp(2400 / Math.max(d, 10), 12, 60);
    } else if (view.distance > 0 && car.chase3d) {
      // Aircraft: behind along the flight path (climbs and dives included), a bit further back.
      _fwd.copy(car.forward);
      if (this.lookBack) _fwd.negate();
      this.heading3 = this.heading3 || _fwd.clone();
      this.heading3.lerp(_fwd, this.snap ? 1 : 1 - Math.exp(-dt * 3)).normalize();
      const dist = view.distance * 1.7;
      _t.copy(p).addScaledVector(this.heading3, -dist).add(_d.set(0, view.height * 1.2, 0));
      const lookAt = _look.copy(p).addScaledVector(this.heading3, view.lookAhead * 2);
      this._spring(_t, lookAt, dt, 6, p);
      if (this.groundHeight) {
        const gh = Math.max(0, this.groundHeight(cam.position.x, cam.position.z)) + 1.5;
        if (cam.position.y < gh) cam.position.y = gh;
      }
    } else if (view.distance > 0) {
      // Chase: behind and above, looking ahead of the car (boats and submarines a little further back).
      const far = car.kind ? 1.45 : 1;
      _t.copy(p).addScaledVector(this.heading, -view.distance * far).add(_d.set(0, view.height * far, 0));
      const lookAt = _look.copy(p).addScaledVector(this.heading, view.lookAhead);
      lookAt.y += 0.9;
      this._spring(_t, lookAt, dt, 7, p);
      if (this.groundHeight) {
        const gh = this.groundHeight(cam.position.x, cam.position.z) + 0.8;
        if (cam.position.y < gh) cam.position.y = gh;
      }
      // Submarines: the camera stays under the surface with them.
      if (car.kind === 'sub' && cam.position.y > -1.2) cam.position.y = -1.2;
      if (car.kind === 'boat' && cam.position.y < 1.2) cam.position.y = 1.2;
    } else if (car.cockpit) {
      // Craft: in the cockpit (the driver's eye) or on the nose, riding every roll and pitch.
      car.object.updateMatrixWorld(true);
      const m = car.object.matrixWorld;
      cam.position.copy(_t.copy(view.id === 'bumper' ? car.cockpit.nose : car.cockpit.eye).applyMatrix4(m));
      const dir = _d.set(0, view.id === 'bumper' ? -0.03 : car.kind === 'boat' ? -0.16 : -0.1, 1).normalize().transformDirection(m);
      if (this.lookBack) dir.negate();
      _t.copy(cam.position).addScaledVector(dir, 30);
      _m.lookAt(cam.position, _t, _up.clone().applyQuaternion(car.object.quaternion).lerp(_up, car.kind === 'boat' ? 0.3 : 0.05).normalize());
      _q.setFromRotationMatrix(_m);
      cam.quaternion.copy(_q);
      this.look.copy(_t);
      this.snap = false;
    } else {
      // Hood / bumper: rigidly attached to the chassis (interpolated), slight lag in pitch.
      const m = car.object.matrixWorld;
      const local = new THREE.Vector3(0, view.height - 0.6 + (view.id === 'hood' ? 0.1 : 0), -view.distance);
      if (view.id === 'bumper') local.set(0, view.height - 0.65, CAR.body.half[2] + 0.3);
      if (view.id === 'hood') local.set(0, 0.3, 0.98);
      cam.position.copy(local.applyMatrix4(m));
      const dir = _d.set(0, -0.02, 1).transformDirection(m);
      if (this.lookBack) dir.negate();
      _t.copy(cam.position).addScaledVector(dir, 30);
      _m.lookAt(cam.position, _t, _up.clone().applyQuaternion(car.object.quaternion).lerp(_up, 0.6).normalize());
      _q.setFromRotationMatrix(_m);
      cam.quaternion.copy(_q);
      this.look.copy(_t);
      this.snap = false;
    }

    // Speed FOV + nitro kick.
    if (this.mode === 'chase') {
      const k = Math.min(1, v / CAR.engine.topSpeed);
      fovTarget += k * k * CAMERA.fovBoost * 0.7 + (car.vehicle.nitroActive ? CAMERA.fovBoost * 0.5 : 0);
    }
    cam.fov += (fovTarget - cam.fov) * (1 - Math.exp(-dt * 4));
    cam.updateProjectionMatrix();

    // A light rumble off-road, plus impact trauma. Low frequencies only: a
    // fast buzz aliases into random jitter at the frame rate.
    const eng = this.engine;
    const tt = eng.time.elapsed;
    const buzz = this.mode === 'chase' ? car.offroad * 0.0022 * Math.min(1, v / 15) : 0;
    const k = this.trauma * this.trauma * 0.04 + buzz;
    if (k > 1e-5) {
      cam.rotateX((Math.sin(tt * 13.1) + Math.sin(tt * 7.7 + 0.6) * 0.5) * k * 0.7);
      cam.rotateY(Math.sin(tt * 9.3 + 1.3) * k * 0.5);
      cam.rotateZ(Math.sin(tt * 11.7 + 2.1) * k * 0.6);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.snap = false;
  }

  /**
   * Critically damped follow of position and look target. With an anchor
   * (the car) the springs act on offsets from it, so the camera does not
   * trail further behind as speed rises.
   */
  _spring(targetPos, lookAt, dt, stiffness, anchor = null) {
    const cam = this.camera;
    const a = anchor || _zero;
    if (this.snap) {
      this.offset.subVectors(targetPos, a);
      this.lookOffset.subVectors(lookAt, a);
      this.vel.set(0, 0, 0);
      this.lookVel.set(0, 0, 0);
    } else {
      // Closed-form critically damped step: stable at any frame time, so a
      // slow or uneven frame rate never makes the camera overshoot and shake.
      smoothDamp(this.offset, _d.subVectors(targetPos, a), this.vel, stiffness, dt);
      smoothDamp(this.lookOffset, _d.subVectors(lookAt, a), this.lookVel, stiffness * 1.6, dt);
    }
    cam.position.addVectors(a, this.offset);
    this.look.addVectors(a, this.lookOffset);
    cam.lookAt(this.look);
  }
}
