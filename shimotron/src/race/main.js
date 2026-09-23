import './race.css';
import * as THREE from 'three';
import { Engine, VERSION } from '../engine/Engine.js';
import { Materials } from '../engine/render/Materials.js';
import { Water } from '../engine/world/Water.js';
import { Particles } from '../engine/fx/Particles.js';
import { AudioEngine } from '../engine/audio/AudioEngine.js';
import { Music } from '../engine/audio/Music.js';
import { Terrain } from '../engine/world/Terrain.js';
import { smoothstep } from '../engine/core/Random.js';
import { STAGES, AI, RACE, CAREER, PODIUM, CAR_TYPES } from './config.js';
import { generateTrack, planSignature, packPlan, unpackPlan } from './TrackGenerator.js';
import BAKED_PLANS from './plans.json';
import { Island } from './Island.js';
import { Race } from './Race.js';
import { CraftRace } from './CraftRace.js';
import { KINDS } from './Craft.js';
import { waveAt } from '../engine/world/Water.js';
import { RaceCamera } from './RaceCamera.js';
import { WheelBatch } from './CarModel.js';
import { SkidMarks } from './Effects.js';
import { CarAudio } from './CarAudio.js';
import { RaceUI } from './ui.js';
import { ITEMS } from './Pickups.js';
import { Podium } from './Podium.js';
import { World, WORLD } from './World.js';
import { SpaceScene } from './Space.js';
import { Explore, ROAM } from './Explore.js';

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
    this.settings = { difficulty: 'normal', laps: RACE.laps, quality: null, sound: true, color: '#e0262b', camera: 0, car: 'gt', items: true, podium: true, kind: 'car', ...store.get('settings', {}) };
    this.settings.audio = { engine: true, music: true, sfx: true, ambience: true, ...(this.settings.audio || {}) };
    this.records = store.get('records', {});
    this.champ = store.get('champ', null);
    this.career = store.get('career', null);
    this.series = store.get('series', null); // podium points for single races
    this.podium = null;
    this.selected = 0;
    this.plans = {};
    for (const st of STAGES) {
      const p = this._storedPlan(st);
      if (p) this.plans[st.id] = p;
    }
    this.bakeCache = new Map(); // terrain grids of recently built islands
    this.previews = {};
    this.island = null;
    this.race = null;
    this.state = 'boot';
    this.touch = { left: false, right: false, gas: false, brake: false, nitro: false, handbrake: false, reset: false, item: false };
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
    engine.pipeline.params.bloomStrength = 0.42;
    engine.pipeline.params.bloomThreshold = 1.5;
    engine.pipeline.params.raysIntensity = 0.18;
    engine.pipeline.params.vignette = 0.36;
    // A gentler sun for driving: dimmer disc and a tighter forward-scatter halo.
    engine.atmosphere.skyUniforms.showSunDisc.value = 0.22;
    engine.atmosphere.model.mieCoefficient = 0.0032;
    engine.atmosphere.model.mieDirectionalG = 0.72;
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
    engine.addSystem({ update: (dt) => this.island && this.state !== 'menu' && !this.inSpace && this.island.flora && this.island.flora.update(dt) });
    engine.addSystem({ update: (dt, simDt) => this.race && this.race.update(simDt) });
    engine.addSystem({ update: (dt, simDt) => this.explore && this.state === 'explore' && this.explore.update(simDt) });
    engine.addSystem({ update: (dt, simDt) => engine.particles.update(simDt) });
    engine.addSystem({ update: (dt) => this.island && this.state !== 'menu' && !this.inSpace && this.island.update(dt) });
    engine.addSystem({ update: (dt) => this.space && this.space.update(dt) });
    engine.addSystem({ update: (dt) => this.podium && this.podium.update(dt) });
    engine.addSystem({ update: () => this.skid.update() });
    engine.addSystem({ update: (dt) => engine.audio.update(dt) });
    engine.addSystem({ update: (dt) => this.carAudio && this.carAudio.update(dt) });
    engine.addSystem({ update: (dt) => this._frame(dt) });
    engine.audio.coastFactor = (p) => {
      if (!this.island || this.state === 'menu' || this.inSpace) return 0;
      const t = this.island.terrain;
      let wet = 0;
      for (const [dx, dz] of [[70, 0], [-70, 0], [0, 70], [0, -70], [0, 0]]) wet += t.heightAt(p.x + dx, p.z + dz) < 0.3 ? 1 : 0;
      return wet / 5;
    };
    this._events();
    this._keys();
    // Sound can only start after a gesture: the first click or key anywhere.
    const first = () => {
      this._audioReady();
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
    };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);

    // The whole archipelago, seen from above: the first thing on screen.
    this.world = new World(engine, materials, STAGES);
    await this.world.build(this.plans, (p, t) => progress(0.2 + p * 0.66, t));
    this.water = new Water(engine, { heightTexture: this.world.depthTexture, size: 1 }, materials);
    const wu = this.water.uniforms;
    wu.tWorld.value = this.world.depthTexture;
    wu.uWorldSize.value = WORLD.span;
    this._showMap(true);
    engine.cameraRig = this._worldView();
    engine.cameraRig.update(10);
    await progress(0.9, 'מקמפל שיידרים…');
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

  /** A circuit plan that is still valid for this stage: baked into the build, or saved by an earlier visit. */
  _storedPlan(st) {
    const sig = planSignature(st, RACE.roadHalfWidth);
    const baked = BAKED_PLANS[st.id];
    if (baked && baked.sig === sig) return unpackPlan(baked);
    const saved = store.get('plans', {})[st.id];
    if (saved && saved.sig === sig) return unpackPlan(saved);
    return null;
  }

  _savePlan(st, plan) {
    const all = store.get('plans', {});
    all[st.id] = packPlan(plan, planSignature(st, RACE.roadHalfWidth));
    store.set('plans', all);
  }

  async loadIsland(index, progress) {
    const st = STAGES[index];
    if (this.island && this.island.stage === st && !this.islandDirty) return this.island;
    const eng = this.engine;
    // Nothing to see behind the loading screen: stop drawing the old island while the new one is built.
    const running = eng._running;
    if (running) eng.stop();
    try {
      this._endRace();
      this._endPodium();
      if (this.island) {
        this.island.dispose();
        this.island = null;
      }
      this.skid.clear();
      const pad = this.world.pad && this.world.pad.id === st.id ? this.world.pad : null;
      const island = new Island(eng, this.materials, this.water, st, { plan: this.plans[st.id], cache: this.bakeCache, keepOut: (x, z) => this.world.keepOut(st.id, x, z), pad });
      await island.build(progress);
      this.island = island;
      // The world shifts so this island sits at the origin; its stand-in steps aside.
      this.world.setOrigin(st.id);
      this.water.uniforms.uWorldOffset.value.set(...this.world.origin);
      this.islandDirty = false;
      if (island.planGenerated) this._savePlan(st, island.plan);
      this.plans[st.id] = island.plan;
      this.camera.groundHeight = (x, z) => island.terrain.heightAt(x, z);
      this._flyT = 0;
      return island;
    } finally {
      if (running) eng.start();
    }
  }

  /** Draws every island's menu map in the background (and plans any circuit that is not stored yet). */
  async _planAll() {
    for (const st of STAGES) {
      if (this.previews[st.id]) continue;
      await wait(30);
      const terrain = new Terrain({}, { plaza: null, paths: [], island: st.island, size: st.size, seed: st.seed });
      let plan = this.plans[st.id];
      if (!plan) {
        // Only when a stage changed since the build: search once, then remember it.
        terrain.skipMesas = true;
        plan = generateTrack(terrain, st, { halfWidth: RACE.roadHalfWidth });
        terrain.skipMesas = false;
        if (!plan) continue;
        this.plans[st.id] = plan;
        this._savePlan(st, plan);
        if (this.world) this.world.setPlan(st.id, plan);
      }
      this.previews[st.id] = await this._preview(terrain, plan, st);
      if (this.state === 'menu') this.ui.refreshPreviews();
    }
  }

  /** Island map for the menu card, drawn a few rows at a time so the menu keeps moving. */
  async _preview(terrain, plan, st) {
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
    let t0 = performance.now();
    for (let y = 0; y < H; y++) {
      if (performance.now() - t0 > 8) {
        await wait(0);
        t0 = performance.now();
      }
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
    this._endPodium();
    this._exitSpace();
    this.ui.fade(0);
    this.engine.paused = false;
    this.state = 'menu';
    this.camera.target = null;
    this._showMap(true);
    this.mapFocus = null;
    this.engine.cameraRig = this._worldView();
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
    if (this.carAudio) this.carAudio.mute(false);
  }

  selectStage(i) {
    const again = this.selected === i && this.mapFocus === i;
    this.selected = i;
    this.mapFocus = again ? null : i; // a second click zooms back out to the whole world
    this._audioReady();
    this.engine.audio.ui('click');
    // The island itself is built when the race starts; the world map shows it meanwhile.
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
  }

  /** World map on (every island from afar) or off (the loaded island in full). */
  _showMap(on) {
    const eng = this.engine;
    const cam = eng.camera;
    this.world.showLocal(!on && !!this.island);
    if (this.island) this.island.group.visible = !on;
    this.water.uniforms.uLocal.value = on || !this.island ? 0 : 1;
    if (on) {
      this._worldSky();
      cam.near = 6;
      cam.far = 42000;
      // Open-ocean colours for the map (each island tints its own waters when played).
      this.water.uniforms.uShallow.value.setRGB(0.05, 0.5, 0.52);
      this.water.uniforms.uDeep.value.setRGB(0.012, 0.08, 0.15);
      this.water.uniforms.uClarity.value = 0.14;
    } else {
      if (this.island) {
        this.island._sky();
        this.island.applyWater(this.water);
      }
      cam.clearViewOffset();
      cam.near = 0.25;
      cam.far = 20000;
    }
    cam.updateProjectionMatrix();
    this.mapOn = on;
  }

  /** Into orbit: the islands, the sea and the sky give way to the planet below and the stars. */
  _enterSpace() {
    const eng = this.engine;
    if (!this.space) this.space = new SpaceScene(eng, this.materials).build();
    this.inSpace = true;
    this.world.group.visible = false;
    if (this.island) this.island.group.visible = false;
    this.water.mesh.visible = false;
    const atm = eng.atmosphere;
    atm.sunAzimuth = 0.6;
    atm.setTime(10.2, true);
    atm.fogDensity = 0;
    this.space.enter();
    const cam = eng.camera;
    cam.near = 0.5;
    cam.far = 42000;
    cam.updateProjectionMatrix();
    const A = eng.audio;
    if (A.buses && A.ctx) A.buses.ambience.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3);
  }

  _exitSpace() {
    if (!this.inSpace) return;
    this.inSpace = false;
    this.space.exit();
    this.world.group.visible = true;
    this.water.mesh.visible = true;
    if (this.island) {
      this.island.group.visible = !this.mapOn;
      this.island._sky();
    }
    const A = this.engine.audio;
    if (A.ctx) A.setBus('ambience', this.settings.audio.ambience);
  }

  /** Sky for the world map: a clear afternoon, little haze, so every island shows. */
  _worldSky() {
    const atm = this.engine.atmosphere;
    atm.sunAzimuth = 0.4;
    atm.setTime(15.6, true);
    atm.daySpeed = 0;
    atm.model.turbidity = 2.4;
    atm.model.rayleigh = 1.15;
    atm.cloudCoverage = 0.3;
    atm.cloudDensity = 0.5;
    atm.fogDensity = 0.00035;
    atm.wind.strength = 1;
    atm._envDirty = true;
  }

  /** Camera over the archipelago: a slow circle around the whole world, or around the chosen island. */
  _worldView() {
    const game = this;
    const cam = this.engine.camera;
    const look = new THREE.Vector3();
    const want = new THREE.Vector3();
    const focus = new THREE.Vector3();
    let angle = 0.6;
    let dist = 9800;
    return {
      focusPoint: () => focus.copy(look),
      update(dt) {
        const W = game.world;
        const f = game.mapFocus;
        const id = f !== null && f !== undefined ? STAGES[f].id : null;
        const [wx, wz] = id ? W.pos(id) : [0, 150];
        const [lx, lz] = W.toLocal(wx, wz);
        const d = game.mapDive ? 1500 : id ? 3300 : 9800;
        dist += (d - dist) * (1 - Math.exp(-dt * (game.mapDive ? 2.2 : 1.1)));
        angle += dt * (id ? 0.045 : 0.018);
        want.set(lx + Math.sin(angle) * dist * 0.6, dist * 0.78, lz + Math.cos(angle) * dist * 0.6);
        const k = 1 - Math.exp(-dt * 1.6);
        cam.position.lerp(want, k);
        look.lerp(focus.set(lx, 0, lz), k);
        cam.lookAt(look);
        // Keep the islands clear of the menu panel: to the left of it on wide screens, above it on narrow ones.
        const w = game.engine.renderer.domElement.width;
        const h = game.engine.renderer.domElement.height;
        const narrow = innerWidth <= 760;
        cam.fov = 50;
        cam.setViewOffset(w, h, narrow ? 0 : w * 0.19, narrow ? h * 0.2 : 0, w, h);
      },
    };
  }

  /** Island labels on the world map follow their islands on screen. */
  _mapLabels() {
    if (this.state !== 'menu' || !this.ui.mapLabels) return;
    const cam = this.engine.camera;
    const v = new THREE.Vector3();
    const w = innerWidth;
    const h = innerHeight;
    STAGES.forEach((st, i) => {
      const el = this.ui.mapLabels[i];
      if (!el) return;
      const [x, z] = this.world.toLocal(...this.world.pos(st.id));
      v.set(x, 120, z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    });
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

  /** What to race: cars, boats, submarines, planes or paragliders. */
  selectKind(kind) {
    this.settings.kind = kind;
    store.set('settings', this.settings);
    this._audioReady();
    this.engine.audio.ui('click');
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
    const myCar = this.mode === 'career' && this.career ? this.career.car : this.settings.car || 'gt';
    const list = [{ id: 'player', name: 'את/ה', color: this.settings.color, stripe: '#111111', number: 7, isPlayer: true, type: myCar }];
    // Opponents drive a mix of car types that rotates from island to island.
    const mix = ['gt', 'rally', 'muscle', 'formula', 'buggy', 'gt', 'hyper'];
    for (let i = 0; i < RACE.opponents; i++) {
      let color = colors[i];
      if (color.toLowerCase() === this.settings.color.toLowerCase()) color = colors[(i + RACE.opponents) % colors.length];
      list.push({ id: `ai${i}`, name: names[i], color, stripe: i % 2 ? '#111111' : '#f2f2f2', number: [3, 11, 21, 44, 55, 88][i], isPlayer: false, type: mix[(i + this.selected * 2) % mix.length] });
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

  // ------------------------------------------------------------- career

  /** Career ("מצב מתמשך"): money, a garage, surprises that carry over, islands that follow on by themselves. */
  startCareer() {
    this.mode = 'career';
    this._audioReady();
    if (!this.career) {
      this.career = { money: CAREER.startMoney, owned: ['gt'], car: 'gt', item: null, stage: 0, cycle: 0, races: 0, wins: 0, podiums: 0, earned: 0, series: { count: 0, points: {} } };
      store.set('career', this.career);
    }
    this._garage();
  }

  resetCareer() {
    this.career = null;
    store.set('career', null);
    this.ui.showMenu({ selected: this.selected, champ: this.champ });
  }

  /** Rivals get one level harder for every full lap of the islands. */
  _difficulty() {
    if (this.mode !== 'career' || !this.career) return this.settings.difficulty;
    const levels = Object.keys(AI.difficulty);
    const base = Math.max(0, levels.indexOf(this.settings.difficulty));
    return levels[Math.min(levels.length - 1, base + this.career.cycle)];
  }

  _garage(paused = false) {
    const C = this.career;
    if (!C) return this.toMenu();
    this._endRace();
    this._endPodium();
    this.mode = 'career';
    this._exitSpace();
    this.state = 'garage';
    this.engine.paused = false;
    this.camera.target = null;
    this._showMap(!this.island);
    this.engine.cameraRig = this.island ? this._flyover() : this._worldView();
    const next = STAGES[C.stage];
    const again = () => this._garage(true);
    this.ui.showGarage(C, {
      next,
      level: AI.difficulty[this._difficulty()].label,
      paused,
      onGo: () => this._launch(C.stage),
      onMenu: () => this.toMenu(),
      onPickCar: (id) => {
        if (!C.owned.includes(id)) return;
        C.car = id;
        store.set('career', C);
        this.engine.audio.ui('click');
        again();
      },
      onBuyCar: (id) => {
        const t = CAR_TYPES.find((c) => c.id === id);
        if (!t || C.owned.includes(id) || C.money < t.price) return;
        C.money -= t.price;
        C.owned.push(id);
        C.car = id;
        store.set('career', C);
        this.engine.audio.ui('buy');
        again();
      },
      onBuyItem: (kind) => {
        const price = CAREER.itemPrices[kind];
        if (C.money < price) return;
        C.money -= price;
        C.item = { kind, charges: ITEMS[kind].charges };
        store.set('career', C);
        this.engine.audio.ui('buy');
        again();
      },
    });
  }

  /** Prize money for the race just run; also banks the held surprise and moves the career on one island. */
  _careerPayout(r) {
    const C = this.career;
    const P = r.player;
    const place = r.order.indexOf(P) + 1;
    const k = 1 + 0.25 * C.cycle;
    const lines = [[`מקום ${place}`, Math.round((CAREER.prizes[place - 1] || 0) * k)]];
    const fastest = r.entries.reduce((a, e) => (e.bestLap < a.bestLap ? e : a), r.entries[0]);
    if (fastest === P && isFinite(P.bestLap)) lines.push(['הקפה המהירה במירוץ', CAREER.fastestLap]);
    if (P.hits) lines.push([`${P.hits} פגיעות ביריבים`, P.hits * CAREER.hit]);
    if (!P.respawns) lines.push(['מירוץ נקי, בלי חזרות למסלול', CAREER.clean]);
    const total = lines.reduce((a, [, v]) => a + v, 0);
    C.money += total;
    C.earned += total;
    C.races++;
    if (place === 1) C.wins++;
    if (place <= 3) C.podiums++;
    C.item = P.item ? { kind: P.item.kind, charges: P.item.charges } : null;
    C.stage = (C.stage + 1) % STAGES.length;
    if (C.stage === 0) C.cycle++;
    store.set('career', C);
    return { lines, total, money: C.money, item: C.item };
  }

  // ------------------------------------------------------------- podium

  /** Adds a finished race to this mode's podium series; returns the ceremony when one is due. */
  _seriesAdd(r) {
    if (!this.settings.podium) return null;
    let S;
    if (this.mode === 'champ') S = this.champ.series || (this.champ.series = { count: 0, points: {} });
    else if (this.mode === 'career') S = this.career.series || (this.career.series = { count: 0, points: {} });
    else S = this.series || (this.series = { count: 0, points: {} });
    r.order.forEach((e, k) => {
      const d = S.points[e.id] || (S.points[e.id] = { pts: 0 });
      Object.assign(d, { name: e.name, color: e.color, stripe: e.stripe, number: e.number, type: e.type, isPlayer: e.isPlayer });
      d.pts += RACE.points[k] || 0;
    });
    S.count++;
    let due = null;
    if (S.count >= PODIUM.every) {
      due = { title: 'במת המנצחים', sub: `${S.count} המירוצים האחרונים · ${this.stage.name}`, list: Object.values(S.points).sort((a, b) => b.pts - a.pts) };
      S.count = 0;
      S.points = {};
    }
    if (this.mode === 'champ') store.set('champ', this.champ);
    else if (this.mode === 'career') store.set('career', this.career);
    else store.set('series', this.series);
    return due;
  }

  /** The 3D ceremony on the start straight; `after` = { label, action } continues the game. */
  _ceremony({ title, sub, list }, after) {
    this._endRace();
    this._exitSpace();
    this._showMap(false);
    this._endPodium();
    this.ui.clear();
    const pod = new Podium(this, list.slice(0, 3));
    pod.build();
    this.podium = pod;
    this.state = 'podium';
    this.engine.paused = false;
    this.engine.cameraRig = pod.cameraRig();
    if (list.findIndex((d) => d.isPlayer) === 0 && this.mode === 'career') {
      // A win on points pays a bonus.
      this.career.money += 2500;
      store.set('career', this.career);
      sub = `${sub} · בונוס כתר: ₪2,500`;
    }
    this.ui.showPodium({
      title,
      sub,
      list,
      after: {
        label: after.label,
        action: () => {
          this._endPodium();
          after.action();
        },
      },
      onMenu: () => this.toMenu(),
    });
  }

  _endPodium() {
    if (!this.podium) return;
    this.podium.dispose();
    this.podium = null;
    const crowd = this.island && this.island.track.crowdUniforms;
    if (crowd) crowd.uCheer.value = 0.2;
  }

  _champEnd() {
    const pts = this.champ.points;
    this.champ = null;
    store.set('champ', null);
    const list = Object.values(pts).sort((a, b) => b.pts - a.pts);
    const table = () => {
      this.engine.cameraRig = this._flyover();
      this.state = 'menu-results';
      this.ui.showChampionshipEnd(pts, () => this.toMenu());
    };
    this._ceremony({ title: 'אלופי האליפות', sub: `${STAGES.length} איים — הטבלה הסופית`, list }, { label: 'לטבלה הסופית', action: table });
  }

  async _launch(index) {
    const eng = this.engine;
    const fromMap = this.mapOn;
    this._endPodium();
    this._exitSpace();
    // The space race always lifts off from the city's spaceport.
    const wantKind = this.mode === 'single' && KINDS[this.settings.kind] ? this.settings.kind : 'car';
    if (wantKind === 'space') index = Math.max(0, STAGES.findIndex((s) => s.id === WORLD.hub));
    this.state = 'loading';
    this._audioReady();
    if (!this.carAudio && eng.audio.ctx) this.carAudio = new CarAudio(eng.audio);
    this.ui.clear();
    this.selected = index;
    const st = STAGES[index];
    this.stage = st;
    if (this.mapOn) {
      // From the world map: swoop down onto the island first.
      this.mapFocus = index;
      this.mapDive = true;
      this.engine.cameraRig = this._worldView();
      await wait(1300);
      this.mapDive = false;
    }
    if (!this.island || this.island.stage !== st || this.islandDirty) {
      await this.loadIsland(index, (p, t) => this.ui.showLoader(t, p));
      this.ui.showLoader('מקמפל שיידרים…', 0.96);
      await nextFrame();
    }
    this._endRace();
    this._endPodium();
    this._showMap(false);
    this.skid.clear();
    this.wheels.reset();
    const career = this.mode === 'career' && this.career;
    // Boats, submarines, planes and paragliders: single races only (championship and career are on wheels).
    const kind = wantKind;
    this.kind = kind;
    if (kind === 'space') {
      // Countdown on the pad, liftoff over the city, up out of the air — then the race in orbit.
      if (fromMap && this.island.spaceport) {
        this.ui.hideLoader();
        this.state = 'launch';
        this.ui.launchScreen(true);
        this.island.spaceport.reset();
        eng.camera.far = 400000; // up there the sea must reach the horizon
        eng.camera.updateProjectionMatrix();
        await this.island.spaceport.play(this, { message: (t, sub) => this.ui.message(t, 'lights', sub, 950), fade: (k) => this.ui.fade(k) });
        this.ui.launchScreen(false);
        this.island.spaceport.reset();
      }
      this._enterSpace();
    }
    let race;
    if (kind === 'car') race = new Race(this, this.island, { laps: this.settings.laps, difficulty: this._difficulty(), roster: this._gridOrder(this.roster()), items: career ? true : this.settings.items, startItem: career ? this.career.item : null });
    else {
      if (!this.carAudio && eng.audio.ctx) this.carAudio = new CarAudio(eng.audio);
      race = new CraftRace(this, this.island, { kind, laps: this.settings.laps, difficulty: this._difficulty(), roster: this._gridOrder(this.roster()), space: this.inSpace ? this.space : null });
    }
    this.race = race;
    try {
      await Promise.race([eng.renderer.compileAsync(eng.scene, eng.camera), wait(6000)]);
    } catch {
      /* optional */
    }
    this.ui.hideLoader();
    this.ui.fade(0);
    this.state = 'race';
    eng.paused = false;
    this.camera.target = race.player.car;
    this.camera.setMode('orbit');
    this.camera.orbitAngle = Math.atan2(race.player.car.forward.z, race.player.car.forward.x) + Math.PI * 0.75;
    eng.cameraRig = this.camera;
    this.ui.showHUD(race, st);
    this.engine.canvas.focus({ preventScroll: true });
  }

  /** Engine sound starts over (new vehicle, new race). */
  resetCarAudio() {
    if (this.carAudio) this.carAudio.dispose();
    this.carAudio = this.engine.audio.ctx ? new CarAudio(this.engine.audio) : null;
  }

  // ------------------------------------------------------------- free roam

  startExplore() {
    this.mode = 'explore';
    this._roam(this.selected);
  }

  /** Free roam on an island (from the map, or arriving from another island at `at`). */
  async _roam(index, at = null) {
    const eng = this.engine;
    const fromMap = this.mapOn;
    this._endPodium();
    this._exitSpace();
    this.state = 'loading';
    this._audioReady();
    if (!this.carAudio && eng.audio.ctx) this.carAudio = new CarAudio(eng.audio);
    this.ui.clear();
    this.selected = index;
    const st = STAGES[index];
    this.stage = st;
    if (fromMap) {
      this.mapFocus = index;
      this.mapDive = true;
      eng.cameraRig = this._worldView();
      await wait(1300);
      this.mapDive = false;
    }
    if (!this.island || this.island.stage !== st || this.islandDirty) {
      await this.loadIsland(index, (p, t) => this.ui.showLoader(t, p));
      this.ui.showLoader('מקמפל שיידרים…', 0.96);
      await nextFrame();
    }
    this._endRace();
    this._showMap(false);
    this.skid.clear();
    const ex = new Explore(this, this.island);
    this.explore = ex;
    this.kind = null;
    if (at) {
      const [x, z] = this.world.toLocal(at.wx, at.wz);
      ex.spawn(at.kind, { x, y: at.y, z, yaw: at.yaw, speed: at.speed, onDeck: at.onDeck });
    } else ex.spawn(this.roamKind || 'car');
    try {
      await Promise.race([eng.renderer.compileAsync(eng.scene, eng.camera), wait(5000)]);
    } catch {
      /* optional */
    }
    this.ui.hideLoader();
    this.ui.fade(0);
    this.state = 'explore';
    eng.paused = false;
    eng.cameraRig = this.camera;
    this.ui.showExplore(ex, st);
    this.engine.canvas.focus({ preventScroll: true });
  }

  roamVehicle(kind) {
    if (!this.explore || this.state !== 'explore') return;
    this.roamKind = kind;
    this.explore.spawn(kind);
    this.ui.showExplore(this.explore, this.stage);
    this.ui.message(ROAM[kind].name, '', ROAM[kind].hint, 1100);
  }

  /** Crossing into another island's waters (or over its bridge): build it and carry on from the same spot. */
  roamTravel(st, at) {
    const i = STAGES.indexOf(st);
    if (i < 0) return;
    this.ui.showLoader(`בדרך אל ${st.name}…`, 0.02);
    this._roam(i, at);
  }

  restart() {
    this.ui.showPause(false);
    if (this.state === 'explore' && this.explore) {
      this.pause(false);
      this.explore.spawn(this.explore.kind);
      return;
    }
    this._launch(this.selected);
  }

  _endRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    if (this.explore) {
      this.explore.dispose();
      this.explore = null;
    }
    if (this.carAudio) {
      this.carAudio.dispose();
      this.carAudio = this.engine.audio.ctx ? new CarAudio(this.engine.audio) : null;
    }
    this.wheels.reset();
  }

  pause(on) {
    const roaming = this.state === 'explore' && this.explore;
    if (!roaming && (this.state !== 'race' || !this.race || this.race.state === 'done')) return;
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

  /** Starts audio on the first gesture: mixer channels from the settings, and the music. */
  _audioReady() {
    const A = this.engine.audio;
    A.unlock();
    if (!A.ctx) return;
    for (const [k, on] of Object.entries(this.settings.audio)) A.setBus(k, on);
    if (!this.settings.sound) A.setEnabled(false);
    if (!this.music) {
      this.music = new Music(A);
      this.music.play(this._musicStyle());
    }
  }

  /** Which piece fits the moment: the island's own style in a race, a calm one elsewhere. */
  _musicStyle() {
    if (this.state === 'race' && this.stage) return this.stage.id;
    return 'menu';
  }

  /** Mixer: turn one channel (engine, music, sfx, ambience) on or off. */
  setAudio(name, on) {
    this.settings.audio[name] = on;
    store.set('settings', this.settings);
    this._audioReady();
    this.engine.audio.setBus(name, on);
    if (this.state === 'menu') this.ui.showMenu({ selected: this.selected, champ: this.champ });
    else if (this.paused) this.ui.showPause(true);
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
      if (lap === r.laps - 1 && this.music) this.music.riser();
      const isBest = time <= best + 1e-6 && r.player.lapTimes.length > 1;
      const last = lap === r.laps - 1;
      this.ui.message(last ? 'הקפה אחרונה!' : `הקפה ${lap + 1}`, isBest ? 'gold' : '', `${Race.fmt(time)}${isBest ? ' · הקפה מהירה' : ''}`, 1600);
    });
    ev.on('race:finish', ({ place }) => {
      this.camera.setMode('podium');
      this.ui.message(place === 1 ? 'ניצחון!' : `מקום ${place}`, place === 1 ? 'gold' : '', 'קו הסיום', 2400);
    });
    ev.on('race:respawn', () => this.ui.flash());
    ev.on('race:gate', ({ missed, under }) => {
      const a = this.engine.audio.enabled ? this.engine.audio : null;
      if (missed) {
        this.ui.message('פספסת שער!', 'warn', '‎+2 שניות', 1000);
        if (a) a._tone(a.sfx, { freq: 220, dur: 0.25, gain: 0.08, type: 'square' });
      } else {
        if (under) this.ui.message('מתחת לגשר!', 'gold', '', 900);
        if (a) [988, 1319].forEach((f, i) => a._tone(a.sfx, { freq: f, dur: 0.1, gain: 0.06, type: 'triangle', when: i * 0.07 }));
      }
    });
    ev.on('race:crash', () => {
      this.ui.message('התרסקות!', 'warn', '‎+2 שניות', 1200);
      this.engine.events.emit('shake', { strength: 0.9 });
      if (this.engine.audio.enabled) this.engine.audio.ui('boom');
    });
    // Surprises: sounds for everyone nearby, messages for the player.
    const au = () => (this.engine.audio.enabled ? this.engine.audio : null);
    ev.on('item:get', ({ entry, kind }) => {
      if (!entry.isPlayer) return;
      const a = au();
      if (a) [880, 1175, 1568].forEach((f, i) => a._tone(a.sfx, { freq: f, dur: 0.12, gain: 0.07, type: 'triangle', when: i * 0.06 }));
      this.ui.toast(`קיבלת ${ITEMS[kind].name}!`, ITEMS[kind].color);
    });
    ev.on('item:use', ({ entry, kind }) => {
      const a = au();
      const near = entry.car.position.distanceTo(this.engine.camera.position) < 60;
      if (!a || !near) return;
      if (kind === 'shots') a._burst(a.sfx, { dur: 0.18, freq: 700, q: 0.8, gain: 0.3 });
      else if (kind === 'turbo') a._tone(a.sfx, { freq: 220, dur: 0.6, gain: 0.12, slide: 3, type: 'sawtooth' });
      else if (kind === 'shield') a._tone(a.sfx, { freq: 520, dur: 0.5, gain: 0.08, slide: 2 });
      else if (kind === 'mine') a._tone(a.sfx, { freq: 330, dur: 0.15, gain: 0.08, type: 'square' });
      if (entry.isPlayer && kind === 'turbo') this.engine.events.emit('shake', { strength: 0.25 });
    });
    ev.on('item:hit', ({ entry, by, point }) => {
      const a = au();
      if (a && point.distanceTo(this.engine.camera.position) < 120) a.ui('boom');
      if (entry.isPlayer) {
        this.ui.message('נפגעת!', 'warn', '', 900);
        this.engine.events.emit('shake', { strength: 0.8 });
      } else if (by && by.isPlayer) this.ui.message('פגיעה!', 'gold', entry.name, 900);
    });
    ev.on('item:blocked', ({ entry, point }) => {
      const a = au();
      if (a && point && point.distanceTo(this.engine.camera.position) < 80) a._tone(a.sfx, { freq: 1400, dur: 0.3, gain: 0.08, slide: 0.5 });
      if (entry.isPlayer) this.ui.toast('המגן ספג את הפגיעה', ITEMS.shield.color);
    });
    ev.on('race:auto-respawn', () => this.ui.message('חוזרים למסלול', 'warn', 'המכונית נתקעה', 900));
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
      if ((this.state === 'race' || this.state === 'explore') && block.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (this.state !== 'race' && this.state !== 'explore') return;
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

  /** Keeps the music on the right piece and, in a race, running with the player's pace. */
  _musicFrame() {
    const M = this.music;
    if (!M) return;
    const raceStyle = this.race && this.race.kind ? KINDS[this.race.kind].music : this.stage ? this.stage.id : 'menu';
    const want = this.state === 'race' || this.state === 'podium' ? raceStyle : this.state === 'explore' ? (this.stage ? this.stage.id : 'world') : this.state === 'menu' ? 'world' : 'menu';
    M.setStyle(want);
    const r = this.race;
    if (this.state === 'podium') M.drive(0.9, 0.6);
    else if (r && this.state === 'race') {
      const P = r.player;
      const car = P.car;
      const top = (car.spec.engine ? car.spec.engine.topSpeed : car.spec.top || car.spec.fast || 30) * 3.6;
      const pace = Math.min(1, car.kmh / top);
      const last = P.lap >= r.laps - 1 ? 0.14 : 0;
      const nitro = car.vehicle.nitroActive ? 0.14 : 0;
      if (car.vehicle.nitroActive && !this._nitroRiser) M.riser();
      this._nitroRiser = car.vehicle.nitroActive;
      if (r.state === 'countdown' || r.state === 'intro') M.drive(0.3, 0.1);
      else if (r.state === 'done' || P.finished) M.drive(0.5, 0.3);
      else M.drive(0.42 + pace * 0.34 + last + nitro, pace * 0.85 + last);
    } else if (this.state === 'explore' && this.explore && this.explore.obj) {
      const v = Math.abs(this.explore.speed);
      M.drive(0.3 + Math.min(0.3, v / 150), Math.min(1, v / 60));
    } else M.drive(this.state === 'garage' ? 0.42 : 0.3, 0.1);
  }

  _frame(dt) {
    this._musicFrame();
    this._mapLabels();
    if (this.state === 'explore' && this.explore) this.ui.updateExplore(this.explore, dt);
    // Under the waves: water fog instead of air.
    const cam = this.engine.camera.position;
    const w = this.water;
    const surf = w && this.state !== 'menu' ? waveAt(cam.x, cam.z, this.engine.time.elapsed, w.uniforms.uWaveAmp.value).y : -1e9;
    this.engine.atmosphere.underwater = cam.y < surf - 0.05;
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
    const rk = this.kind && this.kind !== 'car' ? `${st.id}:${this.kind}` : st.id;
    if (isFinite(P.bestLap) && (!this.records[rk] || P.bestLap < this.records[rk])) {
      this.records[rk] = P.bestLap;
      store.set('records', this.records);
      newRecord = true;
    }
    const mode = this.mode;
    const champ = mode === 'champ' ? this.champ : null;
    if (champ) {
      r.order.forEach((e, k) => {
        const d = champ.points[e.id];
        if (!d) return;
        Object.assign(d, { stripe: e.stripe, number: e.number, type: e.type });
        d.pts += RACE.points[k] || 0;
        d.results[champ.stage] = k + 1;
      });
      store.set('champ', champ);
    }
    const payout = mode === 'career' && this.career ? this._careerPayout(r) : null;
    const lastChamp = champ && champ.stage >= STAGES.length - 1;
    let due = this._seriesAdd(r);
    if (lastChamp) due = null; // the championship ceremony takes over
    // Where the game goes after the results (and after a ceremony, if one is due).
    let cont = null;
    if (champ) {
      cont = lastChamp
        ? { label: 'לטקס האליפות', action: () => this._champEnd() }
        : {
            label: 'לאי הבא',
            action: () => {
              champ.stage++;
              store.set('champ', champ);
              this._launch(champ.stage);
            },
          };
    } else if (payout) cont = { label: 'למוסך', action: () => this._garage() };
    let primary = cont;
    if (due) primary = { label: 'לבמת המנצחים', action: () => this._ceremony(due, cont || { label: 'מירוץ נוסף', action: () => this._launch(this.selected) }) };
    if (primary && payout) primary.auto = 10; // career rolls on by itself
    this.ui.showResults(r, {
      champ,
      points: champ ? champ.points : null,
      newRecord,
      payout,
      primary,
      onRetry: payout
        ? null
        : () => {
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
