import './race.css';
import * as THREE from 'three';
import { Engine, VERSION } from '../engine/Engine.js';
import { Materials } from '../engine/render/Materials.js';
import { Water } from '../engine/world/Water.js';
import { Particles } from '../engine/fx/Particles.js';
import { AudioEngine } from '../engine/audio/AudioEngine.js';
import { Terrain } from '../engine/world/Terrain.js';
import { smoothstep } from '../engine/core/Random.js';
import { STAGES, AI, RACE } from './config.js';
import { generateTrack } from './TrackGenerator.js';
import { Island } from './Island.js';
import { Race } from './Race.js';
import { RaceCamera } from './RaceCamera.js';
import { WheelBatch } from './CarModel.js';
import { SkidMarks } from './Effects.js';
import { CarAudio } from './CarAudio.js';
import { RaceUI } from './ui.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`shimotron-rally:${k}`);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`shimotron-rally:${k}`, JSON.stringify(v));
    } catch {
      /* storage is optional */
    }
  },
};

/**
 * Shimotron Rally: owns the engine, the current island, the race and the
 * championship; routes input and events to the UI.
 */
class Game {
  constructor() {
    this.settings = { difficulty: 'normal', laps: RACE.laps, quality: null, sound: true, color: '#e0262b', camera: 0, ...store.get('settings', {}) };
    this.records = store.get('records', {});
    this.champ = store.get('champ', null);
    this.selected = 0;
    this.plans = {};
    this.previews = {};
    this.island = null;
    this.race = null;
    this.state = 'boot';
    this.touch = { left: false, right: false, gas: false, brake: false, nitro: false, handbrake: false, reset: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    if (this.isTouch) document.body.classList.add('is-touch');
  }

  async boot() {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'he';
    this.ui = new RaceUI(document.getElementById('ui'), this);
    const progress = async (p, text) => {
      this.ui.showLoader(text, p);
      await nextFrame();
    };
    if (!(() => {
      try {
        return !!document.createElement('canvas').getContext('webgl2');
      } catch {
        return false;
      }
    })()) throw new Error('הדפדפן הזה לא תומך ב־WebGL 2. נסו Chrome, Edge, Firefox או Safari בגרסה עדכנית.');
    await progress(0.03, 'טוען גופנים…');
    if (document.fonts) await Promise.race([Promise.all([document.fonts.load('700 120px "Karantina"'), document.fonts.load('600 20px "IBM Plex Sans Hebrew"'), document.fonts.load('700 40px "JetBrains Mono"')]).catch(() => {}), wait(2500)]);

    await progress(0.08, 'מאתחל את מנוע שימוטרון…');
    const canvas = document.getElementById('viewport');
    const forced = (location.hash.slice(1) || new URLSearchParams(location.search).get('quality') || '').toLowerCase();
    const q = ['low', 'medium', 'high', 'ultra'].includes(forced) ? forced : this.settings.quality || undefined;
    const engine = new Engine(canvas, { quality: q });
    this.engine = engine;
    this.settings.quality = engine.quality.presetName;
    engine.physics.fixedStep = 1 / 120;
    engine.physics.maxSubSteps = 10;
    engine.physics.world.allowSleep = false;
    engine.pipeline.params.bloomStrength = 0.5;
    engine.pipeline.params.vignette = 0.36;
    window.shimotron = { engine, version: VERSION, THREE, game: this };

    await progress(0.14, 'אופה טקסטורות פרוצדורליות על ה־GPU…');
    const materials = new Materials(engine);
    engine.materials = materials;
    materials.build();
    materials.bakeRaceKit();
    for (const m of Object.values(materials.lib)) m.userData.keep = true;
    this.materials = materials;
    engine.particles = new Particles(engine, materials);
    engine.audio = new AudioEngine(engine);
    this.wheels = new WheelBatch(materials, 32);
    engine.scene.add(this.wheels.group);
    this.skid = new SkidMarks(engine.quality.presetName === 'low' ? 2500 : 5000);
    engine.scene.add(this.skid.mesh);
    this.camera = new RaceCamera(engine);
    this.camera.modeIndex = this.settings.camera || 0;

    // Systems, in order.
    engine.addSystem({ update: () => materials.update(engine.atmosphere.exposure, engine.time.elapsed) });
    engine.addSystem({ update: (dt, simDt) => this.water && this.water.update(dt, simDt) });
    engine.addSystem({ update: (dt) => this.island && this.island.flora && this.island.flora.update(dt) });
    engine.addSystem({ update: (dt, simDt) => this.race && this.race.update(simDt) });
    engine.addSystem({ update: (dt, simDt) => engine.particles.update(simDt) });
    engine.addSystem({ update: (dt) => this.island && this.island.update(dt) });
    engine.addSystem({ update: () => this.skid.update() });
    engine.addSystem({ update: (dt) => engine.audio.update(dt) });
    engine.addSystem({ update: (dt) => this.carAudio && this.carAudio.update(dt) });
    engine.addSystem({ update: (dt) => this._frame(dt) });
    engine.audio.coastFactor = (p) => {
      if (!this.island) return 0;
      const t = this.island.terrain;
      let wet = 0;
      for (const [dx, dz] of [[70, 0], [-70, 0], [0, 70], [0, -70], [0, 0]]) wet += t.heightAt(p.x + dx, p.z + dz) < 0.3 ? 1 : 0;
      return wet / 5;
    };
    this._events();
    this._keys();

    await this.loadIsland(this.selected, (p, t) => progress(0.2 + p * 0.72, t));
    await progress(0.94, 'מקמפל שיידרים…');
    try {
      await Promise.race([engine.renderer.compileAsync(engine.scene, engine.camera), wait(12000)]);
    } catch {
      /* first frames compile whatever is left */
    }
    engine.atmosphere.update(0);
    engine.start();
    await progress(1, 'מוכן');
    this.ui.hideLoader();
    this.toMenu();
    this._planAll();
  }

  // ------------------------------------------------------------- islands

  async loadIsland(index, progress) {
    const st = STAGES[index];
    if (this.island && this.island.stage === st && !this.islandDirty) return this.island;
    this._endRace();
    if (this.island) {
      this.island.dispose();
      this.island = null;
    }
    this.skid.clear();
    const island = new Island(this.engine, this.materials, this.water, st);
    await island.build(progress);
    if (!this.water) {
      this.water = new Water(this.engine, island.terrain, this.materials);
      island.applyWater(this.water);
    }
    this.island = island;
    this.islandDirty = false;
    this.plans[st.id] = island.plan;
    this.previews[st.id] = this.previews[st.id] || this._preview(island.terrain, island.plan, st);
    this.camera.groundHeight = (x, z) => island.terrain.heightAt(x, z);
    this._flyT = 0;
    return island;
  }

  /** Generates every island's circuit in the background for the menu maps. */
  async _planAll() {
    for (const st of STAGES) {
      if (this.plans[st.id]) continue;
      await wait(60);
      const terrain = new Terrain({}, { plaza: null, paths: [], island: st.island, size: st.size, seed: st.seed });
      const plan = generateTrack(terrain, st, { halfWidth: RACE.roadHalfWidth });
      if (!plan) continue;
      this.plans[st.id] = plan;
      this.previews[st.id] = this._preview(terrain, plan, st);
      if (this.state === 'menu') this.ui.refreshPreviews();
    }
  }

  _preview(terrain, plan, st) {
    const W = 320;
    const H = 200;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const span = st.size * 0.78;
    const k = span / W;
    const water = st.water.shallow.map((v) => Math.round(Math.min(1, v * 1.6) * 255));
    const deep = st.water.deep.map((v) => Math.round(Math.min(1, v * 4 + 0.03) * 255));
    const tint = st.biome.grassTint || [1, 1, 1];
    const sand = st.biome.sandTint || [1, 1, 1];
    const snow = st.biome.snowLine !== undefined && st.biome.snowAmount > 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wx = (x - W / 2) * k;
        const wz = (y - H / 2) * k;
        const h = terrain.height(wx, wz);
        const hx = terrain.height(wx + k, wz);
        const shade = THREE.MathUtils.clamp(1 + (hx - h) * 0.12, 0.6, 1.3);
        let c;
        if (h < 0) {
          const d = smoothstep(0, -18, h);
          c = water.map((v, i) => v + (deep[i] - v) * d);
        } else if (h < 2.2) c = [226 * sand[0], 206 * sand[1], 160 * sand[2]];
        else if (snow && h > 18) c = [236, 240, 248];
        else if (h > 55) c = [120, 116, 112];
        else c = [70 * tint[0], 120 * tint[1], 60 * tint[2]].map((v) => v * (0.8 + h / 150));
        const o = (y * W + x) * 4;
        img.data[o] = Math.min(255, c[0] * (h < 0 ? 1 : shade));
        img.data[o + 1] = Math.min(255, c[1] * (h < 0 ? 1 : shade));
        img.data[o + 2] = Math.min(255, c[2] * (h < 0 ? 1 : shade));
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const curve = new THREE.CatmullRomCurve3(plan.controls, true, 'centripetal', 0.5);
    const pts = curve.getSpacedPoints(400);
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => {
      const x = p.x / k + W / 2;
      const y = p.z / k + H / 2;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 6;
    g.stroke();
    g.strokeStyle = '#fff';
    g.lineWidth = 2.6;
    g.stroke();
    return cv;
  }

  // ------------------------------------------------------------- menu

  toMenu() {
    this._endRace();
    this.engine.paused = false;
    this.state = 'menu';
    this.camera.target = null;
    this.engine.cameraRig = this._flyover();
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
    if (this.carAudio) this.carAudio.mute(false);
  }

  selectStage(i) {
    this.selected = i;
    this.engine.audio.unlock();
    this.engine.audio.ui('click');
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
    // Swap the backdrop to the chosen island.
    this._loadInMenu(i);
  }

  async _loadInMenu(i) {
    if (this._menuLoading) return;
    const st = STAGES[i];
    if (this.island && this.island.stage === st && !this.islandDirty) return;
    this._menuLoading = true;
    await this.loadIsland(i, (p, t) => this.ui.showLoader(t, p));
    this.ui.hideLoader();
    this._menuLoading = false;
    this.engine.cameraRig = this._flyover();
    if (this.state === 'menu' && this.selected !== i) this._loadInMenu(this.selected);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    store.set('settings', this.settings);
    if (key === 'quality') {
      this.engine.quality.setPreset(value);
      this.engine.resize();
      this.islandDirty = true; // terrain resolution and plant density apply on the next build
    }
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
  }

  settingsLabel() {
    return `${AI.difficulty[this.settings.difficulty].label} · ${this.settings.laps} הקפות`;
  }

  /** Slow flight along the circuit behind the menu. */
  _flyover() {
    const game = this;
    const cam = this.engine.camera;
    const look = new THREE.Vector3();
    const focus = new THREE.Vector3();
    return {
      focusPoint: () => focus.copy(look),
      update(dt) {
        const isl = game.island;
        if (!isl) return;
        const tr = isl.track;
        game._flyT = (game._flyT || 0) + dt * (18 / tr.length);
        const s = game._flyT % 1;
        const a = tr.pose(s, 0);
        const b = tr.pose(s + 60 / tr.length, 0);
        const side = Math.sin(game._flyT * 6.0) * 26 + 34;
        const p = a.position.clone().addScaledVector(a.right, side);
        p.y = Math.max(p.y, isl.terrain.heightAt(p.x, p.z)) + 14;
        cam.position.lerp(p, 1 - Math.exp(-dt * 1.5));
        look.lerp(b.position, 1 - Math.exp(-dt * 2));
        cam.lookAt(look);
        if (cam.fov !== 55) {
          cam.fov += (55 - cam.fov) * (1 - Math.exp(-dt * 3));
          cam.updateProjectionMatrix();
        }
      },
    };
  }

  // ------------------------------------------------------------- races

  roster() {
    const names = AI.names;
    const colors = AI.colors;
    const list = [{ id: 'player', name: 'את/ה', color: this.settings.color, stripe: '#111111', number: 7, isPlayer: true }];
    for (let i = 0; i < RACE.opponents; i++) {
      let color = colors[i];
      if (color.toLowerCase() === this.settings.color.toLowerCase()) color = colors[(i + RACE.opponents) % colors.length];
      list.push({ id: `ai${i}`, name: names[i], color, stripe: i % 2 ? '#111111' : '#f2f2f2', number: [3, 11, 21, 44, 55, 88][i], isPlayer: false });
    }
    return list;
  }

  /** Grid order: in the championship the points leader starts last; otherwise the player starts mid-pack. */
  _gridOrder(list) {
    const ai = list.filter((r) => !r.isPlayer);
    const me = list.find((r) => r.isPlayer);
    const base = [...ai.slice(0, 3), me, ...ai.slice(3)];
    if (this.champ && this.mode === 'champ') {
      const pts = this.champ.points;
      return base.map((r, i) => ({ r, i })).sort((a, b) => (pts[a.r.id]?.pts || 0) - (pts[b.r.id]?.pts || 0) || a.i - b.i).map((x) => x.r);
    }
    return base;
  }

  startSingle() {
    this.mode = 'single';
    this._launch(this.selected);
  }

  startChampionship() {
    this.mode = 'champ';
    if (!this.champ) {
      const points = {};
      for (const r of this.roster()) points[r.id] = { name: r.name, color: r.color, isPlayer: r.isPlayer, pts: 0, results: [] };
      this.champ = { stage: 0, points };
      store.set('champ', this.champ);
    }
    this._launch(this.champ.stage);
  }

  resetChampionship() {
    this.champ = null;
    store.set('champ', null);
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
  }

  async _launch(index) {
    const eng = this.engine;
    this.state = 'loading';
    eng.audio.unlock();
    if (!this.carAudio && eng.audio.ctx) this.carAudio = new CarAudio(eng.audio);
    this.ui.clear();
    this.selected = index;
    const st = STAGES[index];
    this.stage = st;
    if (!this.island || this.island.stage !== st || this.islandDirty) {
      await this.loadIsland(index, (p, t) => this.ui.showLoader(t, p));
      this.ui.showLoader('מקמפל שיידרים…', 0.96);
      await nextFrame();
    }
    this._endRace();
    this.skid.clear();
    this.wheels.reset();
    const race = new Race(this, this.island, { laps: this.settings.laps, difficulty: this.settings.difficulty, roster: this._gridOrder(this.roster()) });
    this.race = race;
    try {
      await Promise.race([eng.renderer.compileAsync(eng.scene, eng.camera), wait(6000)]);
    } catch {
      /* optional */
    }
    this.ui.hideLoader();
    this.state = 'race';
    eng.paused = false;
    this.camera.target = race.player.car;
    this.camera.setMode('orbit');
    this.camera.orbitAngle = Math.atan2(race.player.car.forward.z, race.player.car.forward.x) + Math.PI * 0.75;
    eng.cameraRig = this.camera;
    this.ui.showHUD(race, st);
    this.engine.canvas.focus({ preventScroll: true });
  }

  restart() {
    this.ui.showPause(false);
    this._launch(this.selected);
  }

  _endRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    if (this.carAudio) {
      this.carAudio.dispose();
      this.carAudio = this.engine.audio.ctx ? new CarAudio(this.engine.audio) : null;
    }
    this.wheels.reset();
  }

  pause(on) {
    if (this.state !== 'race' || !this.race || this.race.state === 'done') return;
    this.paused = on;
    this.engine.paused = on;
    this.ui.showPause(on);
    if (this.carAudio) this.carAudio.mute(on);
  }

  cycleCamera() {
    const v = this.camera.cycle();
    this.settings.camera = this.camera.modeIndex;
    store.set('settings', this.settings);
    if (this.race && this.ui.hudEls) this.ui.message(v.label, '', 'מצלמה', 700);
  }

  toggleSound() {
    this.settings.sound = !this.settings.sound;
    store.set('settings', this.settings);
    this.engine.audio.setEnabled(this.settings.sound);
    this.ui.showPause(true);
  }

  /** Everything a Car needs from the world. */
  carContext(island) {
    const rg = island.stage.roadGrip || 1;
    return {
      engine: this.engine,
      physics: this.engine.physics,
      scene: this.engine.scene,
      materials: this.materials,
      particles: this.engine.particles,
      wheels: this.wheels,
      skid: this.skid,
      ground: (from, to, result) => island.track.raycastRoad(from, to, result, island.track.roadBody),
      surfaceGrip: {
        asphalt: [rg, 0],
        curb: [rg * 0.94, 0.15],
        gravel: [0.72, 1.6],
        grass: [0.62, 2.0],
        sand: [0.56, 2.8],
        snow: [0.55, 1.8],
        water: [0.3, 7],
      },
    };
  }

  // ------------------------------------------------------------- events

  _events() {
    const ev = this.engine.events;
    ev.on('race:state', (s) => {
      const r = this.race;
      if (!r) return;
      if (s === 'countdown') {
        this.camera.setMode('chase');
        this.ui.hideStageName();
      }
      if (s === 'racing') this.ui.message('צא!', 'go', '', 900);
      if (s === 'done') {
        setTimeout(() => this._results(), 1400);
      }
    });
    ev.on('race:lap', ({ lap, time, best }) => {
      const r = this.race;
      if (!r) return;
      const isBest = time <= best + 1e-6 && r.player.lapTimes.length > 1;
      const last = lap === r.laps - 1;
      this.ui.message(last ? 'הקפה אחרונה!' : `הקפה ${lap + 1}`, isBest ? 'gold' : '', `${Race.fmt(time)}${isBest ? ' · הקפה מהירה' : ''}`, 1600);
    });
    ev.on('race:finish', ({ place }) => {
      this.camera.setMode('podium');
      this.ui.message(place === 1 ? 'ניצחון!' : `מקום ${place}`, place === 1 ? 'gold' : '', 'קו הסיום', 2400);
    });
    ev.on('race:respawn', () => this.ui.flash());
    ev.on('car:impact', ({ car, speed, point, rail, other }) => {
      const eng = this.engine;
      if (speed > 4) eng.particles.impact(point, null, Math.min(1.4, speed / 12));
      if (eng.audio.enabled) eng.audio.impact({ speed: speed * 0.9, point, material: rail ? 'metal' : other ? 'metal' : 'default' });
      if (car.isPlayer || (other && other.isPlayer)) eng.events.emit('shake', { strength: Math.min(0.7, speed / 20) });
    });
  }

  _keys() {
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', (e) => {
      if (this.state === 'race' && block.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (this.state !== 'race') return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pause(!this.paused);
      else if (e.code === 'KeyC') this.cycleCamera();
      else if (e.code === 'KeyM') {
        this.settings.sound = !this.settings.sound;
        this.engine.audio.setEnabled(this.settings.sound);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'race' && this.race && this.race.state === 'racing') this.pause(true);
    });
  }

  _frame(dt) {
    const r = this.race;
    if (!r || this.state !== 'race') return;
    const I = this.engine.input;
    this.camera.lookBack = I.isDown('KeyB') || I.isDown('KeyQ');
    this.ui.updateHUD(r, dt);
    const P = r.player;
    if (r.state === 'countdown') {
      const lit = r.lights;
      if (lit !== this._lastLit && lit > 0) this.ui.message('●'.repeat(lit) + '○'.repeat(5 - lit), 'lights', '', 850);
      this._lastLit = lit;
    } else this._lastLit = 0;
    if (r.state === 'racing' && P.wrongWay > 1.2) {
      this._wrongT = (this._wrongT || 0) - dt;
      if (this._wrongT <= 0) {
        this.ui.message('כיוון שגוי!', 'warn', 'לחצו R לחזרה למסלול', 1200);
        this._wrongT = 1.3;
      }
    }
  }

  _results() {
    const r = this.race;
    if (!r) return;
    const P = r.player;
    const st = this.stage;
    let newRecord = false;
    if (isFinite(P.bestLap) && (!this.records[st.id] || P.bestLap < this.records[st.id])) {
      this.records[st.id] = P.bestLap;
      store.set('records', this.records);
      newRecord = true;
    }
    const champ = this.mode === 'champ' ? this.champ : null;
    if (champ) {
      r.order.forEach((e, k) => {
        const d = champ.points[e.id];
        if (!d) return;
        d.pts += RACE.points[k] || 0;
        d.results[champ.stage] = k + 1;
      });
      store.set('champ', champ);
    }
    this.ui.showResults(r, {
      champ,
      points: champ ? champ.points : null,
      newRecord,
      onNext: champ
        ? () => {
            if (champ.stage >= STAGES.length - 1) {
              const pts = champ.points;
              this.champ = null;
              store.set('champ', null);
              this._endRace();
              this.ui.showChampionshipEnd(pts, () => this.toMenu());
            } else {
              champ.stage++;
              store.set('champ', champ);
              this._launch(champ.stage);
            }
          }
        : null,
      onRetry: () => {
        if (champ) {
          // A retry replaces this stage's result.
          r.order.forEach((e, k) => {
            const d = champ.points[e.id];
            if (d) {
              d.pts -= RACE.points[k] || 0;
              d.results[champ.stage] = undefined;
            }
          });
          store.set('champ', champ);
        }
        this._launch(this.selected);
      },
      onMenu: () => this.toMenu(),
    });
  }
}

const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const box = document.querySelector('#loader .err');
  if (box) {
    box.hidden = false;
    box.textContent = `שגיאה בטעינה: ${err && err.message ? err.message : err}`;
  }
});
