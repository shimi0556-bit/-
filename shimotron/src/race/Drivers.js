import * as CANNON from 'cannon-es';
import { AI, CAR } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FWD = new CANNON.Vec3(0, 0, 1);
const _f = new CANNON.Vec3();

/**
 * Slipstream: a car up to 30 m behind another, roughly in its wake, gets
 * less drag and a little more top speed. entries: [{ car, progress, q }].
 */
export function updateDrafts(entries, trackLength) {
  for (const e of entries) {
    let best = 0;
    const v = Math.abs(e.car.vehicle.speed);
    if (e.q && v > 20) {
      for (const o of entries) {
        if (o === e || !o.q) continue;
        let d = (o.progress - e.progress) * trackLength;
        if (d < -trackLength / 2) d += trackLength;
        if (d <= 3 || d > 30) continue;
        const dl = Math.abs(o.q.lat - e.q.lat);
        if (dl > 2.4) continue;
        best = Math.max(best, (1 - d / 30) * (1 - dl / 2.4));
      }
    }
    const veh = e.car.vehicle;
    veh.draft += (Math.min(1, best * 1.6) - veh.draft) * 0.08;
  }
}

/**
 * Human driver: keyboard (WASD / arrows, Space handbrake, Shift or N nitro),
 * gamepad (triggers, left stick, A/B/X) and the on-screen touch pad. Digital
 * steering is ramped so taps make small corrections and holds sweep to lock.
 */
export class PlayerDriver {
  constructor(car, input, touch) {
    this.car = car;
    this.input = input;
    this.touch = touch; // { left, right, gas, brake, nitro, handbrake } booleans
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.enabled = true;
  }

  update(dt) {
    const C = this.car.vehicle.controls;
    if (!this.enabled) {
      C.throttle = 0;
      C.brake = 0;
      C.steer = 0;
      C.handbrake = false;
      C.nitro = false;
      return;
    }
    const I = this.input;
    const T = this.touch || {};
    let steer = I.axis('KeyA', 'KeyD') + I.axis('ArrowLeft', 'ArrowRight') + (T.right ? 1 : 0) - (T.left ? 1 : 0);
    let gas = I.isDown('KeyW') || I.isDown('ArrowUp') || T.gas ? 1 : 0;
    let brk = I.isDown('KeyS') || I.isDown('ArrowDown') || T.brake ? 1 : 0;
    let hand = I.isDown('Space') || T.handbrake;
    let nitro = I.isDown('ShiftLeft') || I.isDown('ShiftRight') || I.isDown('KeyN') || T.nitro;
    let analogSteer = null;
    const pad = I.gamepad;
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) analogSteer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) ** 1.5;
      const b = pad.buttons;
      const rt = b[7] ? b[7].value : 0;
      const lt = b[6] ? b[6].value : 0;
      gas = Math.max(gas, rt, b[0] && b[0].pressed ? 1 : 0);
      brk = Math.max(brk, lt, b[1] && b[1].pressed && !gas ? 1 : 0);
      hand = hand || (b[2] && b[2].pressed) || (b[5] && b[5].pressed);
      nitro = nitro || (b[3] && b[3].pressed) || (b[4] && b[4].pressed);
    }
    steer = clamp(steer, -1, 1);
    if (analogSteer !== null) this.steer = analogSteer;
    else {
      const rate = steer !== 0 && Math.sign(steer) === Math.sign(this.steer) ? 3.6 : 8;
      this.steer += clamp(steer - this.steer, -rate * dt, rate * dt);
    }
    this.throttle += clamp(gas - this.throttle, -dt * 8, dt * 6);
    this.brake += clamp(brk - this.brake, -dt * 10, dt * 8);
    C.steer = this.steer;
    C.throttle = this.throttle;
    C.brake = this.brake;
    C.handbrake = !!hand;
    C.nitro = !!nitro;
  }
}

/**
 * AI driver: pure pursuit on the track's racing line, speed from the
 * precomputed profile scaled by skill and rubber-banding, overtaking by
 * shifting its line, nitro on long straights, and self-recovery
 * (reverse out, then ask the race for a respawn).
 */
export class AIDriver {
  constructor(car, track, { skill = 0.9, rubber = 0.08, seed = 1 } = {}) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.baseSkill = skill;
    this.rubber = rubber;
    this.offset = 0;
    this.bias = ((seed * 7919) % 11) / 11 - 0.5; // personal line preference (±0.5 m)
    this.stuck = 0;
    this.reverseT = 0;
    this.recoveries = 0;
    this.wrongWay = 0;
    this.needsRespawn = false;
    this.enabled = true;
    this._q = {};
    this.mistake = 0; // brief moments of lifting/wide lines, more for low skill
    this.mistakeT = 3 + Math.random() * 6;
  }

  /** others: other cars' race entries { car, progress } ; me: this car's entry. */
  update(dt, me, others, playerEntry) {
    const car = this.car;
    this.clock = (this.clock || 0) + dt;
    const C = car.vehicle.controls;
    if (!this.enabled) {
      C.throttle = 0;
      C.brake = 1;
      C.steer = 0;
      C.handbrake = false;
      C.nitro = false;
      return;
    }
    const tr = this.track;
    const b = car.body;
    const px = b.position.x;
    const pz = b.position.z;
    const q = tr.nearest(px, pz, this._q);
    if (!q || q.dist > tr.W + 12) {
      this.needsRespawn = true;
      this.reason = 'off-track';
      return;
    }
    const n = tr.n;
    const v = Math.abs(car.vehicle.speed);
    const f = b.quaternion.vmult(FWD, _f);
    // Car axes (world): forward from the quaternion, right = (-fz, fx) in the plane.
    const fx = f.x;
    const fz = f.z;
    const fl = Math.hypot(fx, fz) || 1;
    const hx = fx / fl;
    const hz = fz / fl;
    const rx = -hz;
    const rz = hx;

    // Wrong way / upside down / stuck bookkeeping.
    const along = hx * tr.tx[q.i] + hz * tr.tz[q.i];
    this.wrongWay = along < -0.3 && v > 2 ? this.wrongWay + dt : Math.max(0, this.wrongWay - dt);
    if (this.wrongWay > 2.5 || car.vehicle.upsideDown > CAR.flipResetTime) {
      this.needsRespawn = true;
      this.reason = this.wrongWay > 2.5 ? 'wrong-way' : 'flipped';
    }

    // Rubber band against the player's progress (metres).
    let skill = this.baseSkill;
    if (playerEntry) {
      const gap = (me.progress - playerEntry.progress) * tr.length; // + = AI ahead
      skill *= 1 - clamp(gap / 400, -1, 1) * this.rubber;
    }
    // Occasional small mistakes (lift, run wide) — rarer for good drivers.
    this.mistakeT -= dt;
    if (this.mistakeT <= 0) {
      this.mistake = Math.random() < (1.05 - this.baseSkill) * 1.6 ? 0.6 + Math.random() * 0.8 : 0;
      this.mistakeT = 4 + Math.random() * 8;
    }
    if (this.mistake > 0) {
      this.mistake -= dt;
      skill *= 0.93;
    }

    // ---- where we want to be: speed from the profile a little ahead, scaled by skill
    const look = AI.lookahead[0] + AI.lookahead[1] * v;
    const k = (q.i + Math.round(look / tr.ds)) % n;
    const lead = (q.i + Math.round((6 + v * 0.35) / tr.ds)) % n;
    const myTarget = Math.min(tr.speed[q.i], tr.speed[lead]) * skill;
    const lim = tr.W - 1.1;

    // ---- traffic: commit to a side to pass slower cars, keep clear of cars alongside.
    // Off the grid, hold the starting lane for a few seconds before merging onto the line.
    if (this.lane === undefined) this.lane = q.lat;
    const merge = clamp((this.clock - 4) / 8, 0, 1);
    let wantOffset = this.bias * merge + (this.lane - tr.line[k]) * (1 - merge);
    let followSpeed = Infinity;
    const myLat = q.lat;
    for (const o of others) {
      const oq = o.q;
      if (!oq) continue;
      let d = (o.progress - me.progress) * tr.length;
      if (d < -tr.length / 2) d += tr.length;
      if (d > tr.length / 2) d -= tr.length;
      if (d < -7 || d > 40) continue;
      const dl = oq.lat - myLat;
      const ov = Math.abs(o.car.vehicle.speed);
      if (d > 0) {
        if (Math.abs(dl) > 3.2) continue;
        // Start a pass only where the road allows it (straights, gentle bends); finish one already begun.
        const calm = Math.abs(tr.kappa[q.i]) < 1 / 130 && Math.abs(tr.kappa[k]) < 1 / 110;
        const faster = myTarget > ov + 1.2 || v > ov + 2.5;
        // No lunges in the opening seconds while the pack is still bunched.
        if (faster && this.clock > 9 && (calm || myTarget > ov + 3.5 || (this.pass && this.pass.car === o))) {
          if (!this.pass || this.pass.car !== o) {
            const leftRoom = oq.lat + tr.W;
            const rightRoom = tr.W - oq.lat;
            this.pass = { car: o, side: leftRoom > rightRoom ? -1 : 1, t: 5 };
          }
          const side = this.pass.side;
          const room = side < 0 ? oq.lat + tr.W : tr.W - oq.lat;
          if (room > 4.6) wantOffset = clamp(oq.lat + side * 3.6, -lim, lim) - tr.line[k];
          else if (d < 16) followSpeed = Math.min(followSpeed, ov - 0.3);
        }
        // Only hold back when our planned path actually goes through them.
        const planned = clamp(tr.line[k] + wantOffset, -lim, lim);
        if (d < 7 && Math.abs(dl) < 2.3 && Math.abs(planned - oq.lat) < 2.4) followSpeed = Math.min(followSpeed, ov - 0.6);
      } else if (Math.abs(dl) < 3.1) {
        // Alongside or just behind: hold a lateral gap instead of side-swiping.
        wantOffset += (dl > 0 ? -1 : 1) * (3.1 - Math.abs(dl));
      }
    }
    if (this.pass) {
      this.pass.t -= dt;
      if (this.pass.t <= 0) this.pass = null;
    }
    wantOffset = clamp(tr.line[k] + wantOffset, -lim, lim) - tr.line[k];
    this.offset += clamp(wantOffset - this.offset, -3.6 * dt, 3.6 * dt);
    this.offset = clamp(this.offset, -2 * lim, 2 * lim);

    // ---- steering: pure pursuit
    const lat = clamp(tr.line[k] + this.offset + (this.mistake > 0 ? Math.sign(tr.kappa[k]) * -1.2 : 0), -lim, lim);
    const tx = tr.x[k] - tr.tz[k] * lat;
    const tz = tr.z[k] + tr.tx[k] * lat;
    const dx = tx - px;
    const dz = tz - pz;
    const localRight = dx * rx + dz * rz; // + = target to the car's right
    const localFwd = dx * hx + dz * hz;
    const alpha = Math.atan2(localRight, Math.max(0.1, localFwd));
    const delta = Math.atan((2 * car.vehicle.wheelBase * Math.sin(alpha)) / Math.max(look, 4));
    let steer = delta / car.vehicle.steerLimit(v);

    // ---- throttle / brake (off the racing line in a bend there is less speed to be had)
    const offLine = Math.abs(lat - tr.line[k]) * Math.max(Math.abs(tr.kappa[q.i]), Math.abs(tr.kappa[k]));
    const target = Math.min(myTarget * (1 - Math.min(0.22, offLine * 7)), followSpeed);
    const slide = Math.abs(car.vehicle.lateralSpeed());
    let throttle = 0;
    let brake = 0;
    const e = target - v;
    if (e > 0) throttle = clamp(0.35 + e * 0.5, 0, 1) * (slide > 3 ? 0.5 : 1);
    else if (e < -1.2) brake = clamp(-e * 0.22, 0, 1);
    else throttle = 0.15;
    // Nitro on long fast stretches.
    let nitro = false;
    const straight = tr.speed[(q.i + Math.round(120 / tr.ds)) % n] > 50 && Math.abs(tr.kappa[q.i]) < 1 / 400;
    if (car.vehicle.nitro > 0.35 && v > 30 && straight && this.baseSkill > 0.84) nitro = true;
    if (this.pass && car.vehicle.nitro > 0.15 && v > 25 && Math.abs(tr.kappa[q.i]) < 1 / 200) nitro = true;

    // ---- recovery
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = 0;
      brake = 1;
      steer = -Math.sign(alpha || 1);
      if (this.reverseT <= 0) this.stuck = 0;
    } else if (v < 1.5 && throttle > 0.3) {
      this.stuck += dt;
      if (this.stuck > 1.8) {
        this.recoveries++;
        if (this.recoveries > 2) {
          this.needsRespawn = true;
          this.reason = 'stuck';
        }
        else this.reverseT = 1.4;
      }
    } else {
      this.stuck = Math.max(0, this.stuck - dt);
      if (v > 8) this.recoveries = 0;
    }

    if (this.trace) this.debug = { v, myTarget, target, followSpeed, offset: this.offset, wantOffset, pass: this.pass ? this.pass.side : 0, lat: q.lat, k: q.i };
    C.steer = clamp(steer, -1, 1);
    C.throttle = throttle;
    C.brake = brake;
    C.handbrake = false;
    C.nitro = nitro;
  }
}
