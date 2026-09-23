import { Craft, CraftPlayer, CraftAI, KINDS, roadSurface } from './Craft.js';
import { DESIGNS } from './CraftModels.js';
import { Course } from './Course.js';
import { waveAt } from '../engine/world/Water.js';
import { RACE, AI } from './config.js';
import { actionKeys } from './keys.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEP = 1 / 60;

/**
 * A race of boats, submarines, planes or paragliders through a gate
 * course. Same shape as the car Race (entries, order, laps, clock,
 * events), so the HUD, results and ceremonies work unchanged; timing
 * adds a 2 s penalty for every missed gate.
 */
export class CraftRace {
  constructor(game, island, opts) {
    this.game = game;
    this.engine = game.engine;
    this.island = island;
    this.kind = opts.kind;
    this.spec = KINDS[this.kind];
    this.title = this.spec.name;
    if (this.kind === 'space') this.stageName = 'מסלול במסלול: מעל הארכיפלג';
    this.events = game.engine.events;
    this.difficulty = AI.difficulty[opts.difficulty] || AI.difficulty.normal;
    this.state = 'intro';
    this.clock = 0;
    this.stateT = 0;
    this.lights = 0;
    this.entries = [];
    this.checkpoints = new Map();
    this.touch = game.touch;
    this.pickups = null;
    this.space = opts.space || null;
    this.course = new Course(this.kind, { island, world: game.world, engine: game.engine, materials: game.materials, space: this.space }).build();
    if (this.space) {
      this.space.placeStation(this.course, 0.52);
      this.space.scatterRocks(this.course, 0.1, 0.36);
      this.space.scatterRocks(this.course, 0.64, 0.88);
    }
    this.track = this.course;
    // Long laps for the slow craft: cap how many.
    const cap = { boat: 3, sub: 2, plane: 3, glider: 1, space: 2 }[this.kind];
    this.laps = this.course.closed ? Math.min(cap, opts.laps || RACE.laps) : 1;
    this.acc = 0;
    this._build(opts.roster);
  }

  _env() {
    const eng = this.engine;
    const c = this.course;
    const water = this.game.water;
    const atm = eng.atmosphere;
    return {
      engine: eng,
      particles: eng.particles,
      ground: (x, z) => c.ground(x, z),
      wave: (x, z, out) => waveAt(x, z, eng.time.elapsed, water ? water.uniforms.uWaveAmp.value : 1, out, -c.ground(x, z)),
      piers: c.piers,
      decks: c.decks,
      thermals: c.thermals,
      obstacles: this.space ? null : (p) => this._obstaclesNear(p),
      road: this.kind === 'plane' ? roadSurface(this.island.track) : null,
      solids: this.space ? this.space.rocks : null,
      collide: this.space ? (p) => this.space.collide(p) : null,
      get wind() {
        const s = 0.6 + atm.wind.strength * 0.8;
        return { x: atm.wind.dir.x * s, z: atm.wind.dir.y * s };
      },
    };
  }

  /** Ships and balloons of the island, and (sub races) the canyon's rocks around p. */
  _obstaclesNear(p) {
    const out = this._obs || (this._obs = []);
    out.length = 0;
    const L = this.island.life?.solids;
    if (L) for (let i = 0; i < L.length; i++) out.push(L[i]);
    const R = this.course.rocksNear(p.x, p.z);
    if (R) for (let i = 0; i < R.length; i++) out.push(R[i]);
    return out;
  }

  _build(roster) {
    const c = this.course;
    const env = this._env();
    const L = c.length;
    const sp = this.spec;
    roster.forEach((r, k) => {
      const row = Math.floor(k / 2);
      const col = k % 2;
      let s;
      let lat;
      if (c.closed) {
        s = 1 - (14 + row * sp.spacing + col * sp.spacing * 0.4) / L;
        lat = (col === 0 ? -1 : 1) * sp.lane;
      } else {
        s = 0;
        lat = (k - (roster.length - 1) / 2) * 18;
      }
      const pose = c.pose(s, lat);
      const pos = pose.position.clone();
      if (this.kind === 'boat') pos.y = 0;
      if (!c.closed) pos.y += (k % 2) * 6 - (row * 4);
      const heading = Math.atan2(pose.tangent.x, pose.tangent.z);
      // Every racer in a different design: the player's choice, the rest round the list.
      const list = DESIGNS[this.kind];
      const mine = (this.game.settings.designs || {})[this.kind] || list[0];
      const design = r.isPlayer ? mine : list[(list.indexOf(mine) + 1 + (k % (list.length - 1 || 1))) % list.length];
      const craft = new Craft(env, { kind: this.kind, color: r.color, stripe: r.stripe, name: r.name, number: r.number, isPlayer: r.isPlayer, position: pos, heading, seed: k + 3, design });
      if (this.kind === 'plane') craft.smoke = true;
      if (this.kind === 'plane' || this.kind === 'glider' || this.kind === 'space') craft.chase3d = true;
      const range = this.difficulty.skill;
      let skill = r.isPlayer ? 1 : range[0] + ((k * 0.37 + 0.13) % 1) * (range[1] - range[0]);
      if (this.kind === 'space' && !r.isPlayer) skill *= 0.9; // the space race is the gentle one
      const driver = r.isPlayer ? new CraftPlayer(craft, this.engine.input, this.touch) : new CraftAI(craft, c, { skill, lane: ((k % 3) - 1) * sp.lane * 0.7, seed: k + 1 });
      const back = c.closed ? (1 - s) * L : 0;
      const e = {
        car: craft,
        craft,
        driver,
        name: r.name,
        color: r.color,
        stripe: r.stripe,
        type: r.type || 'gt',
        number: r.number,
        isPlayer: !!r.isPlayer,
        id: r.id,
        progress: c.closed ? -back / L : 0,
        lastS: s,
        lap: 0,
        crossed: -1,
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
        watch: { t: 0, p: 0 },
        lost: 0,
        respawns: 0,
        topSpeed: 0,
        penalty: 0,
        gateL: 0,
        gateK: c.closed ? 1 : 0,
        passed: -1,
        launchDelay: r.isPlayer ? 0 : 0.05 + Math.random() * 0.3,
        skill,
        item: null,
        shield: 0,
        hits: 0,
      };
      this.entries.push(e);
      if (e.isPlayer) this.player = e;
    });
    const au = this.game.carAudio;
    if (au) {
      au.attachPlayer(this.player.car);
      if (this.kind !== 'glider') for (const e of this.entries) if (!e.isPlayer) au.attachAI(e.car);
    }
    this.order = [...this.entries];
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    if (dt <= 0) return;
    this.stateT += dt;
    if (this.state === 'racing' || this.state === 'finished') this.clock += dt;
    const racing = this.state === 'racing' || this.state === 'finished';
    const P = this.player;
    if (!P.autopilot) P.driver.update(dt);

    if (this.state === 'intro' && this.stateT > 3.2) this._setState('countdown');
    if (this.state === 'countdown') {
      const lit = Math.min(5, Math.floor(this.stateT / 0.9));
      if (lit !== this.lights) {
        this.lights = lit;
        if (lit > 0) this.game.carAudio?.beep(false);
      }
      if (this.stateT > 0.9 * 5 + 0.6 + this.goDelay) {
        this.game.carAudio?.beep(true);
        this._setState('racing');
        this.events.emit('race:go');
      }
    }

    // Drivers (AI every frame), then fixed-step physics.
    for (const e of this.entries) {
      const C = e.craft.vehicle.controls;
      if (!e.isPlayer || e.autopilot) {
        if (racing && this.clock >= e.launchDelay) {
          const behind = P.progress - e.progress;
          const rubber = e.isPlayer ? 0 : clamp(behind * 3, -1, 1) * this.difficulty.rubber;
          (e.autopilot || e.driver).update(dt, rubber);
        } else {
          C.throttle = this.state === 'countdown' && this.lights >= 3 ? 0.5 : 0;
          C.steer = 0;
        }
      }
      C.hold = !racing;
    }
    this.acc = Math.min(this.acc + dt, 0.25);
    const t = this.engine.time.elapsed;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (const e of this.entries) e.craft.step(STEP, t);
      this._separate();
    }
    for (const e of this.entries) {
      e.craft.update(dt);
      this._progress(e, dt);
      e.topSpeed = Math.max(e.topSpeed, e.craft.kmh);
    }
    this._rank();
    this.course.update(dt, this._nextGateIndex(P), P);

    if (racing && !P.finished) {
      if (actionKeys(this.engine.input).reset || this.touch.reset) {
        this.touch.reset = false;
        this.respawn(P);
      }
      // Wrong way.
      const q = P.q;
      if (q) {
        const f = P.craft.forward;
        const along = f.x * this.course.tx[q.i] + f.z * this.course.tz[q.i];
        P.wrongWay = along < -0.4 && Math.abs(P.craft.speed) > 3 ? P.wrongWay + dt : Math.max(0, P.wrongWay - dt * 2);
      }
    }
    // Crashes and getting lost.
    for (const e of this.entries) {
      const c = e.craft;
      if (c.crashed && c.crash <= 0) {
        c.crashed = false;
        e.penalty += 2;
        this.respawn(e);
        if (e.isPlayer) this.events.emit('race:crash', e);
      }
      if (c.hit) {
        if (e.isPlayer) this.engine.events.emit('shake', { strength: c.hit * 0.6 });
        c.hit = 0;
      }
      if (!racing || e.finished) continue;
      const far = { boat: 140, sub: 90, plane: 260, glider: 320, space: 400 }[this.kind];
      e.lost = (e.q && e.q.dist < far) || c.grounded ? 0 : e.lost + dt;
      if (e.lost > 4) {
        e.lost = 0;
        this.respawn(e);
        if (e.isPlayer) this.events.emit('race:auto-respawn', e);
      }
      // Watchdog: no progress while trying.
      const w = e.watch;
      const moved = (e.progress - w.p) * this.course.length;
      const trying = !e.isPlayer || e.autopilot || c.vehicle.controls.throttle > 0.3;
      if (moved > 8 || !trying || this.clock < 4 || c.crash > 0 || c.grounded) {
        w.t = this.clock;
        w.p = e.progress;
      } else if (this.clock - w.t > 4) {
        this.respawn(e);
        if (e.isPlayer) this.events.emit('race:auto-respawn', e);
      }
    }
    if (this.state === 'finished') {
      if (this.entries.every((e) => e.finished) || this.stateT > RACE.finishGrace) this._classify();
    }
  }

  /** Crafts push each other apart instead of passing through. */
  _separate() {
    const E = this.entries;
    const R = { boat: 4.2, sub: 4, plane: 6, glider: 7, space: 6 }[this.kind];
    for (let i = 0; i < E.length; i++) {
      for (let j = i + 1; j < E.length; j++) {
        const a = E[i].craft.position;
        const b = E[j].craft.position;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy * 1.5, dz);
        if (d >= R * 2 || d < 1e-3) continue;
        const push = (R * 2 - d) * 0.5;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }

  _setState(s) {
    this.state = s;
    this.stateT = 0;
    if (s === 'countdown') this.goDelay = 0.4 + Math.random() * 0.9;
    this.events.emit('race:state', s);
  }

  _nextGateIndex(e) {
    return e.finished ? -1 : e.gateK;
  }

  _progress(e, dt) {
    const c = this.course;
    const craft = e.craft;
    const q = c.nearest(craft.position.x, craft.position.z, e._q);
    e.q = q;
    if (!q) return;
    let ds = q.s - e.lastS;
    if (c.closed) {
      if (ds < -0.5) ds += 1;
      if (ds > 0.5) ds -= 1;
    }
    e.lastS = q.s;
    if (e.finished) return;
    const before = e.progress;
    if (c.closed) e.progress += ds;
    else e.progress = Math.max(e.progress, Math.min(e.progress + 0.02, q.s));
    if (this.state !== 'racing' && this.state !== 'finished') return;
    const cp = Math.floor(e.progress * 100);
    if (cp > Math.floor(before * 100) && cp >= 0) {
      if (!this.checkpoints.has(cp)) this.checkpoints.set(cp, this.clock);
      e.gap = this.clock - this.checkpoints.get(cp);
    }
    // Gates, in order.
    const G = c.gates;
    for (let guard = 0; guard < 3; guard++) {
      const g = G[e.gateK];
      if (!g) break;
      const U = (c.closed ? e.gateL : 0) + g.s;
      if (e.progress < U) break;
      const inside = craft.position.distanceTo(g.pos) <= g.radius * 1.15 + (this.kind === 'boat' ? 2 : 0);
      if (!inside && !(c.closed && e.gateK === 0)) {
        e.penalty += 2;
        if (e.isPlayer) this.events.emit('race:gate', { entry: e, missed: true });
      } else if (e.isPlayer) this.events.emit('race:gate', { entry: e, missed: false, under: g.under });
      e.passed = e.gateK;
      if (!c.closed && g.final) {
        this._finish(e, this.clock + e.penalty);
        return;
      }
      e.gateK++;
      if (e.gateK >= G.length) {
        e.gateK = 0;
        e.gateL++;
      }
    }
    if (!c.closed) return;
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
        if (crossed >= this.laps) this._finish(e, t + e.penalty);
      }
    }
  }

  _finish(e, t) {
    e.finished = true;
    e.finishTime = t;
    if (!this.course.closed) {
      e.lapTimes.push(t);
      e.bestLap = t;
    }
    const place = this.entries.filter((o) => o.finished).length;
    e.finishPlace = place;
    if (e.isPlayer) {
      e.autopilot = new CraftAI(e.craft, this.course, { skill: 0.7, lane: 0, seed: 99 });
      e.driver.enabled = false;
      if (!this.course.closed) e.craft.landing = true;
      this._setState('finished');
      this.game.carAudio?.fanfare();
      this.events.emit('race:finish', { entry: e, place });
    } else if (!this.course.closed) e.craft.landing = true;
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

  setAutopilot(on) {
    const P = this.player;
    P.autopilot = on ? new CraftAI(P.craft, this.course, { skill: 0.97, lane: 0, seed: 7 }) : null;
    P.driver.enabled = !on;
  }

  /** Back on the course: at the last gate passed (or where the craft is), pointing the right way. */
  respawn(e) {
    e.respawns++;
    const c = this.course;
    let s = e.q ? e.q.s : e.lastS;
    const g = c.gates[e.passed];
    if (g && (!c.closed || Math.abs(g.s - s) < 0.25)) s = g.s;
    s = c.closed ? (s - 4 / c.length + 1) % 1 : Math.max(0, s - 4 / c.length);
    const lat = e.isPlayer ? 0 : ((e.respawns % 3) - 1) * 4;
    const pose = c.pose(s, lat);
    const pos = pose.position.clone();
    if (this.kind === 'boat') pos.y = 0.1;
    if (this.kind === 'glider') pos.y = Math.max(pos.y, c.ground(pos.x, pos.z) + 40);
    e.craft.place(pos, Math.atan2(pose.tangent.x, pose.tangent.z));
    e.craft.landing = e.finished && !c.closed;
    e.lastS = s;
    e.wrongWay = 0;
    e.lost = 0;
    e.watch.t = this.clock;
    e.watch.p = e.progress;
    if (e.isPlayer) this.events.emit('race:respawn', e);
  }

  _classify() {
    if (this.state === 'done') return;
    const L = this.course.length;
    for (const e of this.entries) {
      if (e.finished) continue;
      const remaining = (this.laps - e.progress) * L;
      const avg = Math.max(6, (Math.max(0.05, e.progress) * L) / Math.max(1, this.clock));
      e.finishTime = this.clock + remaining / avg + e.penalty;
      e.finished = true;
      e.estimated = true;
    }
    this._rank();
    this._setState('done');
    this.events.emit('race:done', { order: this.order });
  }

  dispose() {
    for (const e of this.entries) e.craft.dispose();
    this.entries = [];
    this.course.dispose();
  }
}
