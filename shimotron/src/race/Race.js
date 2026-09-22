import * as THREE from 'three';
import { Car } from './Car.js';
import { PlayerDriver, AIDriver, updateDrafts } from './Drivers.js';
import { RACE, AI, CAR } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * One race on one island: grid, intro, countdown lights, lap and sector
 * timing, live positions and gaps, wrong-way and respawn handling, finish
 * and classification. The Game owns menus and the championship; the Race
 * only reports through `events` (an Events bus) and exposes read-only state.
 */
export class Race {
  constructor(game, island, opts) {
    this.game = game;
    this.engine = game.engine;
    this.island = island;
    this.track = island.track;
    this.laps = opts.laps || RACE.laps;
    this.difficulty = AI.difficulty[opts.difficulty] || AI.difficulty.normal;
    this.events = game.engine.events;
    this.state = 'intro';
    this.clock = 0; // race time since the green light
    this.stateT = 0;
    this.entries = [];
    this.checkpoints = new Map(); // floor(progress * 100) → first time reached
    this.messages = [];
    this.touch = game.touch;
    this._build(opts);
  }

  _build(opts) {
    const g = this.game;
    const tr = this.track;
    const ctx = g.carContext(this.island);
    // Grid order: championship order reversed (leader starts last), player among them.
    const roster = opts.roster; // [{ name, color, number, isPlayer }]
    const L = tr.length;
    roster.forEach((r, k) => {
      const row = Math.floor(k / 2);
      const col = k % 2;
      const back = 12 + row * 16 + col * 8;
      const lat = col === 0 ? -3.4 : 3.4;
      const s = 1 - back / L;
      const pose = tr.pose(s, lat);
      const heading = Math.atan2(pose.tangent.x, pose.tangent.z);
      const position = pose.position.clone();
      position.y += 0.66;
      const car = new Car(ctx, { color: r.color, stripe: r.stripe, number: r.number, name: r.name, isPlayer: r.isPlayer, position, heading });
      const skillRange = this.difficulty.skill;
      const skill = r.isPlayer ? 1 : skillRange[0] + ((k * 0.37 + 0.13) % 1) * (skillRange[1] - skillRange[0]);
      const driver = r.isPlayer ? new PlayerDriver(car, this.engine.input, this.touch) : new AIDriver(car, tr, { skill, rubber: this.difficulty.rubber, seed: k + 1 });
      if (!r.isPlayer) car.vehicle.assist = 1.2;
      const entry = {
        car,
        driver,
        name: r.name,
        color: r.color,
        number: r.number,
        isPlayer: !!r.isPlayer,
        id: r.id,
        progress: -back / L,
        lastS: s,
        lap: 0, // completed laps
        crossed: -1, // start-line crossings (forward, best so far)
        lapStart: 0,
        lapTimes: [],
        bestLap: Infinity,
        finished: false,
        finishTime: Infinity,
        position: k + 1,
        gap: 0,
        q: null,
        _q: {},
        wrongWay: 0,
        stuckT: 0,
        launchDelay: r.isPlayer ? 0 : 0.08 + Math.random() * 0.35 * (1.1 - skill),
        topSpeed: 0,
      };
      this.entries.push(entry);
      if (entry.isPlayer) this.player = entry;
    });
    this.game.carAudio?.attachPlayer(this.player.car);
    for (const e of this.entries) if (!e.isPlayer) this.game.carAudio?.attachAI(e.car);
    this._preStep = () => this.preStep(this.engine.physics.fixedStep);
    this.engine.physics.world.addEventListener('preStep', this._preStep);
    this.lights = 0;
    this.track.setStartLights(0);
  }

  // ------------------------------------------------------------ physics step

  preStep(dt) {
    const racing = this.state === 'racing' || this.state === 'finished';
    if (racing) updateDrafts(this.entries, this.track.length);
    for (const e of this.entries) {
      const C = e.car.vehicle.controls;
      if (!e.isPlayer) {
        if (racing && this.clock >= e.launchDelay) e.driver.update(dt, e, this.entries.filter((o) => o !== e), this.player);
        else if (!racing) {
          C.throttle = this.state === 'countdown' && this.lights >= 3 ? 0.35 + Math.random() * 0.3 : 0;
          C.brake = 1;
          C.steer = 0;
        } else {
          C.throttle = 0.6;
          C.brake = 1;
        }
      } else if (e.autopilot) e.autopilot.update(dt, e, this.entries.filter((o) => o !== e), null);
      // Before the green light (and after the flag) cars are held on the brakes; engines may rev.
      C.hold = !racing;
      if (!racing) C.nitro = false;
      e.car.vehicle.preStep(dt);
    }
  }

  // ------------------------------------------------------------ frame update

  update(dt) {
    if (dt <= 0) return;
    const tr = this.track;
    this.stateT += dt;
    if (this.state === 'racing' || this.state === 'finished') this.clock += dt;

    // Player input (per frame so key edges are seen once).
    const P = this.player;
    if (!P.autopilot) {
      P.driver.enabled = true;
      P.driver.update(dt);
    }

    // State machine: intro → countdown → racing → finished → done.
    if (this.state === 'intro' && this.stateT > 3.2) this._setState('countdown');
    if (this.state === 'countdown') {
      const lit = Math.min(5, Math.floor(this.stateT / 0.9));
      if (lit !== this.lights && lit <= 5) {
        this.lights = lit;
        tr.setStartLights(lit);
        if (lit > 0) this.game.carAudio?.beep(false);
      }
      if (this.stateT > 0.9 * 5 + 0.6 + this.goDelay) {
        tr.setStartLights(5, true);
        this.game.carAudio?.beep(true);
        this._setState('racing');
        this.events.emit('race:go');
      }
    }

    // Cars: visuals, surfaces, progress.
    const surface = (x, z) => this.island.surface(x, z);
    for (const e of this.entries) {
      e.car.update(dt, surface, this.island.dustColor);
      this._progress(e, dt);
    }
    this.game.wheels.commit();
    this._rank();

    // Player helpers: wrong way, manual reset.
    if (this.state === 'racing' && !P.finished) {
      const q = P.q;
      if (q) {
        const along = P.car.forward.x * tr.tx[q.i] + P.car.forward.z * tr.tz[q.i];
        const v = P.car.vehicle.speed;
        const backwards = (along < -0.4 && v > 3) || (along > 0.4 && v < -3);
        P.wrongWay = backwards ? P.wrongWay + dt : Math.max(0, P.wrongWay - dt * 2);
      }
      const I = this.engine.input;
      if (I.wasPressed('KeyR') || this.touch.reset) {
        this.touch.reset = false;
        this.respawn(P);
      }
    }
    // Automatic recovery for everyone: flipped, drowned, lost.
    for (const e of this.entries) {
      const b = e.car.body;
      const flipped = e.car.vehicle.upsideDown > CAR.flipResetTime;
      const drowned = b.position.y < -0.6;
      const lost = !e.q || e.q.dist > tr.W + 14;
      const aiAsk = !e.isPlayer && e.driver.needsRespawn;
      if ((flipped || drowned || lost || aiAsk) && this.state !== 'intro' && this.state !== 'countdown') this.respawn(e);
      e.topSpeed = Math.max(e.topSpeed, e.car.kmh);
    }

    if (this.state === 'finished') {
      const all = this.entries.every((e) => e.finished);
      if (all || this.stateT > RACE.finishGrace) this._classify();
    }
  }

  _setState(s) {
    this.state = s;
    this.stateT = 0;
    if (s === 'countdown') this.goDelay = 0.4 + Math.random() * 0.9;
    this.events.emit('race:state', s);
  }

  /** Unwrapped lap progress, lap timing and interval checkpoints. */
  _progress(e, dt) {
    const tr = this.track;
    const b = e.car.body;
    const q = tr.nearest(b.position.x, b.position.z, e._q);
    e.q = q;
    if (!q) return;
    let ds = q.s - e.lastS;
    if (ds < -0.5) ds += 1;
    if (ds > 0.5) ds -= 1;
    e.lastS = q.s;
    if (e.finished) return;
    const before = e.progress;
    e.progress += ds;
    if (this.state !== 'racing' && this.state !== 'finished') return;
    // Interval checkpoints (every 1% of a lap).
    const cp = Math.floor(e.progress * 100);
    if (cp > Math.floor(before * 100) && cp >= 0) {
      if (!this.checkpoints.has(cp)) this.checkpoints.set(cp, this.clock);
      e.gap = this.clock - this.checkpoints.get(cp);
    }
    // Lap line crossings (the grid is behind the line: lap 1 runs from the green light).
    const crossed = Math.floor(e.progress);
    if (crossed > e.crossed) {
      const frac = ds > 0 ? (crossed - before) / ds : 1;
      const t = this.clock - dt * (1 - clamp(frac, 0, 1));
      e.crossed = crossed;
      if (crossed >= 1) {
        const lapTime = t - e.lapStart;
        e.lapTimes.push(lapTime);
        if (lapTime < e.bestLap) e.bestLap = lapTime;
        e.lapStart = t;
        e.lap = crossed;
        if (e.isPlayer && crossed < this.laps) this.events.emit('race:lap', { entry: e, lap: crossed, time: lapTime, best: e.bestLap });
        if (crossed >= this.laps) this._finish(e, t);
      }
    }
  }

  _finish(e, t) {
    e.finished = true;
    e.finishTime = t;
    const place = this.entries.filter((o) => o.finished).length;
    e.finishPlace = place;
    if (e.isPlayer) {
      // Autopilot for the cool-down lap; the camera goes to the podium orbit.
      e.autopilot = new AIDriver(e.car, this.track, { skill: 0.6, rubber: 0, seed: 99 });
      e.driver.enabled = false;
      this._setState('finished');
      this.game.carAudio?.fanfare();
      this.events.emit('race:finish', { entry: e, place });
    }
  }

  _rank() {
    const sorted = [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((e, i) => (e.position = i + 1));
    this.order = sorted;
  }

  /** Lets the AI drive the player's car (attract mode, tests, the cool-down lap). */
  setAutopilot(on) {
    const P = this.player;
    P.autopilot = on ? new AIDriver(P.car, this.track, { skill: 0.96, rubber: 0, seed: 7 }) : null;
    P.driver.enabled = !on;
  }

  /** Puts a car back on the track at its current lap position, pointing the right way. */
  respawn(e) {
    const tr = this.track;
    const b = e.car.body;
    let s = e.q ? e.q.s : e.lastS;
    s = (s - 6 / tr.length + 1) % 1;
    // Pick the lateral slot furthest from nearby cars.
    let bestLat = 0;
    let bestScore = -Infinity;
    for (const lat of [0, -3.5, 3.5, -1.8, 1.8]) {
      const p = tr.pose(s, lat).position;
      let d = Infinity;
      for (const o of this.entries) if (o !== e) d = Math.min(d, o.car.position.distanceTo(p));
      if (d > bestScore) {
        bestScore = d;
        bestLat = lat;
      }
    }
    const pose = tr.pose(s, bestLat);
    const pos = pose.position.clone();
    pos.y += 0.7;
    e.car.place(pos, Math.atan2(pose.tangent.x, pose.tangent.z));
    e.lastS = s;
    e.wrongWay = 0;
    if (!e.isPlayer) {
      e.driver.needsRespawn = false;
      e.driver.stuck = 0;
      e.driver.recoveries = 0;
      e.driver.wrongWay = 0;
      e.driver.reverseT = 0;
    }
    b.velocity.set(pose.tangent.x * 8, 0, pose.tangent.z * 8);
    if (e.isPlayer) this.events.emit('race:respawn', e);
  }

  /** Final classification: unfinished cars are timed by their remaining distance. */
  _classify() {
    if (this.state === 'done') return;
    const tr = this.track;
    for (const e of this.entries) {
      if (e.finished) continue;
      const remaining = (this.laps - e.progress) * tr.length;
      const avg = Math.max(18, (e.progress * tr.length) / Math.max(1, this.clock));
      e.finishTime = this.clock + remaining / avg;
      e.finished = true;
      e.estimated = true;
    }
    this._rank();
    this._setState('done');
    this.events.emit('race:done', { order: this.order });
  }

  /** Human-readable race time. */
  static fmt(t, plus = false) {
    if (!isFinite(t)) return '—';
    const sign = t < 0 ? '−' : plus && t > 0 ? '+' : '';
    const m = Math.floor(Math.abs(t) / 60);
    const s = Math.abs(t) - m * 60;
    return `${sign}${m > 0 ? `${m}:${s < 10 ? '0' : ''}` : ''}${s.toFixed(m > 0 ? 3 : 3)}`;
  }

  dispose() {
    this.engine.physics.world.removeEventListener('preStep', this._preStep);
    for (const e of this.entries) e.car.dispose();
    this.entries = [];
  }
}

export { THREE };
