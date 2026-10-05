// Camera rig: chase, far chase and cockpit views behind the jet, a speed-dependent field
// of view, trauma-based shake, a cinematic intro sweep, a crash cam and an orbit mode
// for the menu and the bestiary.
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from './util.js';

const MODES = ['chase', 'far', 'cockpit'];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.pos = new THREE.Vector3(0, 100, 0);
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.trauma = 0;
    this.shakeEnabled = true;
    this.baseFov = 68;
    this.intro = 0;
    this.time = 0;
    this.crash = null;
    this.orbit = null;
  }

  get mode() { return MODES[this.modeIndex]; }
  cycle() { this.modeIndex = (this.modeIndex + 1) % MODES.length; return this.mode; }

  addTrauma(x) { if (this.shakeEnabled) this.trauma = Math.min(1, this.trauma + x); }

  startIntro(jet) {
    this.intro = 3.2;
    this.crash = null;
    this.orbit = null;
    this.snap(jet);
  }

  startCrash(pos) { this.crash = { pos: pos.clone(), t: 0 }; }

  setOrbit(center, radius, height, speed = 0.08) {
    this.orbit = { center: center.clone(), radius, height, speed, angle: this.orbit ? this.orbit.angle : 0.6 };
  }

  snap(jet) {
    this.idealChase(jet, this.pos, this.look);
    this.up.set(0, 1, 0);
  }

  idealChase(jet, outPos, outLook) {
    const far = this.mode === 'far';
    const back = far ? 52 : 27, height = far ? 13 : 7.2;
    const f = jet.forward;
    // follow the flight path, but keep the horizon steady: use a flattened heading for the offset
    const flat = (this._flat ||= new THREE.Vector3()).set(f.x, 0, f.z);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    const pitchFollow = 0.55;
    const dir = (this._dir ||= new THREE.Vector3()).copy(flat).lerp(f, pitchFollow).normalize();
    outPos.copy(jet.pos).addScaledVector(dir, -back).addScaledVector(jet.up, height * 0.35).y += height * 0.75;
    outLook.copy(jet.pos).addScaledVector(f, far ? 70 : 55).addScaledVector(jet.up, 2.5);
    return outPos;
  }

  update(dt, ctx) { // ctx: { jet, terrain, boosting, speed }
    this.time += dt;
    const cam = this.camera;
    const { jet, terrain } = ctx;
    let fovTarget = this.baseFov;

    if (this.orbit) {
      const o = this.orbit;
      o.angle += o.speed * dt;
      const p = _v.set(o.center.x + Math.cos(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.sin(o.angle) * o.radius);
      if (terrain) p.y = Math.max(p.y, terrain.groundOrWater(p.x, p.z) + 20);
      this.pos.lerp(p, 1 - Math.exp(-2 * dt));
      this.look.lerp(o.center, 1 - Math.exp(-3 * dt));
      this.up.set(0, 1, 0);
      fovTarget = 55;
    } else if (this.crash) {
      this.crash.t += dt;
      this.look.lerp(this.crash.pos, 1 - Math.exp(-4 * dt));
      this.pos.y += dt * 4;
      this.up.lerp(_w.set(0, 1, 0), 1 - Math.exp(-3 * dt));
    } else if (jet) {
      if (this.mode === 'cockpit' && this.intro <= 0) {
        const p = _v.set(0, 1.25, -4.6).applyQuaternion(jet.quat).add(jet.pos);
        this.pos.copy(p);
        this.look.copy(jet.pos).addScaledVector(jet.forward, 200).addScaledVector(jet.up, 6);
        this.up.copy(jet.up);
        fovTarget = 74;
      } else {
        const idealPos = this._ip ||= new THREE.Vector3(), idealLook = this._il ||= new THREE.Vector3();
        this.idealChase(jet, idealPos, idealLook);
        if (this.intro > 0) {
          // sweep from in front of the jet round to behind it
          const t = 1 - this.intro / 3.2;
          const e = smoothstep(0, 1, t);
          const ang = lerp(Math.PI * 0.85, 0, e);
          const f = jet.forward, r = jet.right;
          const off = _v.copy(f).multiplyScalar(-Math.cos(ang) * lerp(40, 27, e)).addScaledVector(r, Math.sin(ang) * lerp(40, 10, e));
          idealPos.copy(jet.pos).add(off);
          idealPos.y += lerp(4, 7, e);
          idealLook.copy(jet.pos).addScaledVector(f, lerp(0, 55, e));
          this.intro -= dt;
          this.pos.copy(idealPos);
          this.look.copy(idealLook);
        } else {
          // springy follow: stiffer at speed so the jet never leaves the frame
          const k = 1 - Math.exp(-(this.mode === 'far' ? 5 : 7.5) * dt);
          this.pos.lerp(idealPos, k);
          this.look.lerp(idealLook, 1 - Math.exp(-11 * dt));
        }
        // a hint of the jet's bank in the horizon
        const bankUp = _w.set(0, 1, 0).lerp(jet.up, 0.28).normalize();
        this.up.lerp(bankUp, 1 - Math.exp(-4 * dt)).normalize();
        fovTarget = this.baseFov + clamp((ctx.speed - 125) / 80, -0.3, 1) * 9 + (ctx.boosting ? 4 : 0);
      }
    }

    // keep above the ground
    if (terrain) {
      const g = terrain.groundOrWater(this.pos.x, this.pos.z) + 3;
      if (this.pos.y < g) this.pos.y = g;
    }

    cam.position.copy(this.pos);
    cam.up.copy(this.up);
    cam.lookAt(this.look);
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    if (s > 0.0005) {
      const t = this.time * 32;
      cam.rotateX((Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.02 * s);
      cam.rotateY((Math.sin(t * 0.9 + 3) + Math.sin(t * 1.9) * 0.5) * 0.02 * s);
      cam.rotateZ(Math.sin(t * 1.3 + 7) * 0.03 * s);
    }
    cam.fov = damp(cam.fov, fovTarget, 3, dt);
    cam.updateProjectionMatrix();
  }
}
