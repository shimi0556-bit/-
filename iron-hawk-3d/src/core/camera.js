// Camera rig. In a mission the camera is the player's eyes: it rides the track (the game
// hands it a position and a direction each frame), turns a little towards the crosshair,
// bobs while running, banks into turns while flying, and shakes on hits. In the menu it
// either rides the track the same way or circles a monster for a closer look.
import * as THREE from 'three';
import { clamp, damp, wrapAngle } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 100, 0);
    this.dir = new THREE.Vector3(0, 0, -1);
    this.look = new THREE.Vector3();
    this.trauma = 0;
    this.shakeEnabled = true;
    this.baseFov = 70;
    this.time = 0;
    this.orbit = null;
    this.bank = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.bob = new THREE.Vector2(); // current head sway, -1..1 (the guns sway with it)
    this.lastYaw = null;
    this.onStep = null;             // called on every footfall while running
    this.stepSide = 1;
  }

  addTrauma(x) { if (this.shakeEnabled) this.trauma = Math.min(1, this.trauma + x); }

  setOrbit(center, radius, height, speed = 0.08) {
    this.orbit = { center: center.clone(), radius, height, speed, angle: this.orbit ? this.orbit.angle : 0.6 };
  }

  snapTo(pos, dir) {
    this.pos.copy(pos);
    this.dir.copy(dir).normalize();
    this.lastYaw = null;
    this.bank = 0;
    this.orbit = null;
  }

  // ctx: { pos, dir, aim: {x, y}, air: 0..1, speed, terrain, fovKick }
  update(dt, ctx = {}) {
    this.time += dt;
    const cam = this.camera;
    let fov = this.baseFov;

    if (this.orbit) {
      const o = this.orbit;
      o.angle += o.speed * dt;
      const p = _v.set(o.center.x + Math.cos(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.sin(o.angle) * o.radius);
      if (ctx.terrain) p.y = Math.max(p.y, ctx.terrain.groundOrWater(p.x, p.z) + 6);
      this.pos.lerp(p, 1 - Math.exp(-2 * dt));
      this.look.lerp(o.center, 1 - Math.exp(-3 * dt));
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      fov = 55;
      this.bob.set(0, 0);
    } else if (ctx.pos) {
      this.pos.copy(ctx.pos);
      // the looking direction follows the track with a little lag, like a head turning
      this.dir.lerp(ctx.dir, 1 - Math.exp(-(ctx.dirRate ?? 4.5) * dt)).normalize();
      const yaw = Math.atan2(this.dir.x, this.dir.z);
      const rate = this.lastYaw === null || dt <= 0 ? 0 : wrapAngle(yaw - this.lastYaw) / dt;
      this.lastYaw = yaw;
      const air = ctx.air ?? 0, speed = ctx.speed ?? 0;
      // bank into turns while flying
      this.bank = damp(this.bank, clamp(rate * 0.55, -0.32, 0.32) * air, 3, dt);
      // head bob while running: two footfalls per cycle
      const run = (1 - air) * clamp(speed / 16, 0, 1.25);
      this.bobAmp = damp(this.bobAmp, run, 5, dt);
      const before = Math.sin(this.bobPhase);
      this.bobPhase += dt * (4.2 + speed * 0.2);
      if (this.onStep && this.bobAmp > 0.25 && Math.sign(Math.sin(this.bobPhase)) !== Math.sign(before)) {
        this.stepSide = -this.stepSide;
        this.onStep(this.stepSide, this.bobAmp);
      }
      this.bob.set(Math.sin(this.bobPhase) * this.bobAmp, (Math.abs(Math.cos(this.bobPhase)) - 0.6) * this.bobAmp);
      // the head turns a little towards the crosshair
      const aim = ctx.aim || { x: 0, y: 0 };
      this.aimYaw = damp(this.aimYaw, -aim.x * 0.22, 5, dt);
      this.aimPitch = damp(this.aimPitch, aim.y * 0.13, 5, dt);

      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(_v.copy(this.pos).add(this.dir));
      cam.rotateY(this.aimYaw);
      cam.rotateX(this.aimPitch);
      cam.rotateZ(-this.bank + this.bob.x * 0.008);
      // sway the eye itself with the steps
      _w.set(1, 0, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(_w, this.bob.x * 0.045);
      cam.position.y += this.bob.y * 0.09;
      fov = this.baseFov + clamp((speed - 18) / 30, 0, 1) * 6 + (ctx.fovKick || 0);
    }

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma;
    if (s > 0.0005) {
      const t = this.time * 32;
      cam.rotateX((Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.022 * s);
      cam.rotateY((Math.sin(t * 0.9 + 3) + Math.sin(t * 1.9) * 0.5) * 0.022 * s);
      cam.rotateZ(Math.sin(t * 1.3 + 7) * 0.03 * s);
    }
    cam.fov = damp(cam.fov, fov, 3, dt);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
