// נץ הברזל: ציד מפלצות. Game flow: loading, the menu with a live 3D world behind it, the
// monster atlas, missions (spawning, waves, scoring, lives, the boss), pause and results.
import * as THREE from 'three';
import { Renderer, autoQuality, QUALITY } from './core/render.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { clamp, damp, mulberry32, isTouchDevice, wrapAngle, formatInt } from './core/util.js';
import { LEVELS, levelById } from './world/levels.js';
import { Terrain } from './world/terrain.js';
import { Atmosphere } from './world/sky.js';
import { Liquid } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Clouds } from './world/clouds.js';
import { MonsterSystem } from './actors/monsters.js';
import { SPECIES, SPECIES_ORDER } from './actors/species.js';
import { Jet } from './actors/jet.js';
import { Weapons } from './actors/weapons.js';
import { Pickups, PICKUPS } from './actors/pickups.js';
import { FX } from './fx/fx.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const STORE = 'ironhawk.v1.';
const load = (key, def) => {
  try { return { ...def, ...JSON.parse(localStorage.getItem(STORE + key) || '{}') }; } catch (e) { return { ...def }; }
};
const save = (key, v) => { try { localStorage.setItem(STORE + key, JSON.stringify(v)); } catch (e) { /* private mode */ } };

const PAR = { valley: 6 * 60, canyon: 8 * 60, volcano: 9 * 60 }; // seconds for the third star
const LIVES = 3;
const COMBO_WINDOW = 5;
const tick = () => new Promise((r) => setTimeout(r, 0));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ------------------------------------------------------------------ one region, built once
class World {
  constructor(level, game) {
    this.level = level;
    this.game = game;
    this.scene = new THREE.Scene();
  }

  async build(progress) {
    const { game, level: L, scene } = this;
    const R = game.renderer, r = R.renderer, q = R.q;
    progress(0.04, 'מעצב את פני השטח…');
    await tick();
    this.terrain = new Terrain(L, q);
    this.terrain.build();
    scene.add(this.terrain.group);
    progress(0.18, 'צובע את השמיים…');
    await tick();
    this.atmo = new Atmosphere(L, q);
    scene.add(this.atmo.group);
    this.fogColor = this.atmo.bake(r, scene);
    progress(0.28, 'פורש סלעים, חול ועשב…');
    await tick();
    await this.terrain.createMaterial(r, this.atmo.sunDir);
    if (L.water !== 'none') {
      this.liquid = new Liquid(this.terrain, L.water);
      scene.add(await this.liquid.build(r));
    }
    progress(0.42, 'שותל עצים ומפזר סלעים…');
    await tick();
    this.veg = new Vegetation(this.terrain, L, q);
    this.veg.build();
    scene.add(this.veg.group);
    this.clouds = new Clouds(L, this.terrain.size);
    scene.add(this.clouds.build(this.atmo.sunDir, this.atmo.sun.color, scene.fog, this.atmo.horizonLum));
    progress(0.52, 'מעיר את המפלצות…');
    await tick();
    this.fx = new FX(scene, q);
    this.fx.setTheme(L, this.fogColor, L.fog.density);
    this.fx.onShake((pos, amount) => game.shakeAt(pos, amount));
    this.jet = new Jet(scene);
    this.pickups = new Pickups(scene, this.terrain);
    const ctx = { scene, terrain: this.terrain, fx: this.fx, audio: game.audio, quality: q, events: game.events, renderer: r, level: L };
    this.monsters = new MonsterSystem(ctx);
    this.monsters.assets = game.speciesAssets; // species meshes are shared between regions
    this.weapons = new Weapons(ctx);
    ctx.monsters = this.monsters;
    ctx.weapons = this.weapons;
    this.weapons.setFog(this.fogColor, L.fog.density);
    const ids = this.speciesIds();
    for (let i = 0; i < ids.length; i++) {
      progress(0.55 + 0.35 * (i / ids.length), `מעצב ${SPECIES[ids[i]].plural}…`);
      await tick();
      await this.monsters.prepare([ids[i]]);
    }
    progress(0.93, 'מתדלק את המטוס…');
    await tick();
  }

  speciesIds() {
    const L = this.level, set = new Set();
    for (const [id, n] of Object.entries(L.monsters)) if (n) set.add(id);
    for (const w of L.waves) for (const id of Object.keys(w.add)) set.add(id);
    if (set.has('boss')) set.add('flyer');
    return SPECIES_ORDER.filter((id) => set.has(id));
  }

  // a land point away from `avoid` (the player's start)
  landPoint(rand, opts, avoid, minDist = 700) {
    let p = null;
    for (let i = 0; i < 25; i++) {
      p = this.terrain.findLandPoint(rand, opts);
      if (!avoid || Math.hypot(p.x - avoid.x, p.z - avoid.z) > minDist) return p;
    }
    return p;
  }

  spawnGroup(id, n, rand, avoid, opts = {}) {
    const T = this.terrain, M = this.monsters;
    const range = { minR: opts.minR ?? 300, maxR: opts.maxR ?? 3100, maxSlope: 0.3 };
    if (opts.near) Object.assign(range, { near: opts.near, nearR: opts.nearR || 900 });
    const out = [];
    if (id === 'boss') {
      const p = new THREE.Vector3(650, 0, 900);
      p.y = T.heightAt(p.x, p.z);
      const b = M.spawn('boss', p, { heading: Math.atan2(-p.x, -p.z), nest: p.clone() });
      out.push(b);
      return out;
    }
    if (id === 'raptor') {
      let left = n;
      while (left > 0) {
        const size = Math.min(left, 3 + Math.floor(rand() * 3));
        const at = this.landPoint(rand, range, avoid);
        const leader = M.spawn('raptor', at, { sizeJitter: true, nest: at });
        out.push(leader);
        for (let i = 1; i < size; i++) {
          const off = new THREE.Vector3((rand() - 0.5) * 50, 0, (rand() - 0.5) * 50);
          const p = at.clone().add(off);
          p.y = T.heightAt(p.x, p.z);
          out.push(M.spawn('raptor', p, { leader, offset: off, sizeJitter: true, nest: at }));
        }
        left -= size;
      }
      return out;
    }
    for (let i = 0; i < n; i++) {
      const o = { ...range };
      if (id === 'longneck') { o.maxSlope = 0.22; o.minHeightAboveWater = -3; }
      const at = this.landPoint(rand, o, avoid);
      const m = M.spawn(id, at, { sizeJitter: true, nest: at });
      if (opts.alert) m.alert = true;
      out.push(m);
    }
    return out;
  }

  populate(rand, avoid) {
    for (const [id, n] of Object.entries(this.level.monsters)) if (n) this.spawnGroup(id, n, rand, avoid);
  }

  clearActors() {
    for (const m of [...this.monsters.list]) this.monsters.remove(m);
    this.weapons.clear();
    this.pickups.clear();
    this.fx.clear();
  }

  update(dt, time, camera, focus) {
    this.atmo.update(dt, time, focus);
    this.terrain.update(dt, time);
    if (this.liquid) this.liquid.update(dt, time);
    this.veg.update(dt, time, camera);
    this.clouds.update(dt, time);
  }

  dispose() {
    this.clearActors();
    this.scene.traverse((o) => {
      if (o.isSkinnedMesh) return; // species geometry is shared
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.dispose();
    });
    if (this.atmo.envMap) this.atmo.envMap.dispose();
  }
}

// ------------------------------------------------------------------ the monster atlas turntable
class Showcase {
  constructor(game) {
    this.game = game;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1318);
    scene.fog = new THREE.Fog(0x0b1318, 120, 900);
    this.camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.5, 3000);
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x2a2018, 1.1);
    const key = new THREE.DirectionalLight(0xfff0dd, 3.2);
    key.position.set(60, 90, 40);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 2.4);
    rim.position.set(-70, 40, -80);
    scene.add(hemi, key, rim);
    // stage: a dark disc with a soft glow ring
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    grd.addColorStop(0.8, 'rgba(120,255,200,0.10)'); grd.addColorStop(0.86, 'rgba(120,255,200,0.0)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    this.stage = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    scene.add(this.stage);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2000, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x111a1e, roughness: 1 }));
    floor.position.y = -0.05;
    scene.add(floor);
    const flat = {
      level: LEVELS[0], size: 4000, waterLevel: -999,
      heightAt: () => 0, groundOrWater: () => 0, normalAt: (x, z, out) => out.set(0, 1, 0),
      findLandPoint: () => new THREE.Vector3(),
    };
    const noop = () => {};
    const fx = new Proxy({}, { get: () => noop });
    this.monsters = new MonsterSystem({ scene, terrain: flat, fx, audio: game.audio, quality: game.renderer.q, events: {}, renderer: game.renderer.renderer, level: LEVELS[0] });
    this.monsters.assets = game.speciesAssets;
    this.angle = 0.9;
    this.current = null;
  }

  async show(id) {
    this.wanted = id;
    if (!this.game.speciesAssets[id]) this.game.menus.toast('מעצב את המפלצת…');
    await this.monsters.prepare([id]);
    if (this.wanted !== id) return;
    if (this.current) this.monsters.remove(this.current);
    const m = this.monsters.spawn(id, new THREE.Vector3(0, 0, 0), { heading: 0 });
    m.speed = 0;
    if (m.spec.flies) m.pos.y = m.radius * 3.2;
    this.current = m;
    const size = Math.max(m.height * 1.15, m.radius * 3.2, m.spec.flies ? m.radius * 5 : 0);
    this.dist = size * 2.7 + 6;
    this.focusY = m.spec.flies ? m.pos.y : m.height * 0.55;
    this.stage.scale.setScalar(Math.max(m.radius * 4.5, size * 0.9));
  }

  update(dt) {
    const m = this.current, cam = this.camera;
    this.angle += dt * 0.32;
    if (m) {
      m.phase += dt;
      this.monsters.time += dt;
      if (m.spec.flies) m.pos.y = m.radius * 3.2 + Math.sin(this.monsters.time * 1.3) * m.radius * 0.3;
      this.monsters.place(m, dt);
      cam.position.set(Math.sin(this.angle) * this.dist, this.focusY + this.dist * 0.28, Math.cos(this.angle) * this.dist);
      cam.lookAt(0, this.focusY, 0);
    }
    const w = window.innerWidth, h = window.innerHeight;
    cam.aspect = w / h;
    // frame the monster beside the info panel (left on wide screens, top on narrow ones)
    if (w > 900 || (w > h && h < 520)) cam.setViewOffset(w, h, w * 0.2, 0, w, h); else cam.setViewOffset(w, h, 0, h * 0.2, w, h);
    cam.updateProjectionMatrix();
  }
}

// ------------------------------------------------------------------ the game
class Game {
  constructor() {
    this.settings = load('settings', {
      quality: autoQuality(), master: 0.8, music: 0.55, sfx: 0.9, invert: false, assist: 1, shake: true, touch: 'auto', fps: false,
    });
    if (!QUALITY[this.settings.quality]) this.settings.quality = autoQuality();
    this.progress = load('progress', { levels: {}, seen: {}, last: 'valley' });
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas, this.settings.quality);
    this.renderer.autoScale = true;
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 1, 16000);
    this.renderer.camera = this.camera;
    this.rig = new CameraRig(this.camera);
    this.rig.shakeEnabled = this.settings.shake;
    this.audio = new AudioEngine();
    this.audio.setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    this.input = new Input({ canvas: this.canvas, touchRoot: document.getElementById('touch') });
    this.input.setInvert(this.settings.invert);
    this.hud = new HUD(document.getElementById('hud'));
    this.menus = new Menus(document.getElementById('ui'), { onAction: (a, el) => this.action(a, el), audio: this.audio });
    this.speciesAssets = {};
    this.events = this.makeEvents();
    this.state = 'loading';
    this.world = null;
    this.showcase = null;
    this.time = 0;
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 0;
    this.warnings = {};
    this.hitFlash = 0;
    this.boostFx = 0;
    this.muted = false;
    this.selected = levelById(this.progress.last);

    const unlock = () => { this.audio.unlock(); if (this.audio.ctx && !this.audio.trackId && this.wantTrack !== undefined) this.audio.music(this.wantTrack); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
    this.input.onKey((e) => this.menuKey(e));
    this.updateTouch();
  }

  async boot() {
    this.menus.reset('loading');
    this.menus.nextTip();
    this.tipTimer = setInterval(() => this.menus.nextTip(), 4500);
    await this.loadWorld(this.selected);
    clearInterval(this.tipTimer);
    this.enterMenu();
    requestAnimationFrame(() => this.frame());
    document.getElementById('ui').dataset.ready = '1';
  }

  // ---------------------------------------------------------------- worlds
  async loadWorld(level) {
    const old = this.world;
    this.world = null;
    if (old) old.dispose();
    const w = new World(level, this);
    await w.build((p, title) => this.menus.setLoading(p, title));
    this.world = w;
    if (!this.renderer.composer) this.renderer.buildComposer(w.scene, this.camera);
    this.renderer.renderPass.scene = w.scene;
    this.renderer.renderPass.camera = this.camera;
    this.renderer.setLevelLook(level);
    // compile shaders now rather than in the first second of play
    try {
      this.attractSetup();
      this.rig.snap(w.jet);
      this.rig.update(0.016, { jet: w.jet, terrain: w.terrain, boosting: false, speed: w.jet.speed });
      await this.renderer.renderer.compileAsync?.(w.scene, this.camera);
    } catch (e) { /* not fatal */ }
    this.menus.setLoading(1, 'מוכן!');
  }

  // menu background: the jet circles over the region while monsters roam
  attractSetup() {
    const w = this.world;
    w.clearActors();
    const rand = mulberry32(w.level.seed + 31);
    w.populate(rand, null);
    const T = w.terrain;
    const c = w.level.id === 'volcano' ? new THREE.Vector3(500, 0, 700) : T.findLandPoint(rand, { maxR: 1200 });
    this.ap = { center: c, R: 650 + rand() * 250, dir: 1, t: 0 };
    const start = new THREE.Vector3(c.x + this.ap.R, 0, c.z);
    start.y = this.safeAltitude(start, 0, 140);
    w.jet.reset(start, Math.atan2(0, -1));
    w.jet.invuln = 0;
    this.shot = { t: 0, kind: 'chase' };
    this.rig.modeIndex = 1; // far chase
  }

  safeAltitude(p, heading, clearance) {
    const T = this.world.terrain;
    let g = T.groundOrWater(p.x, p.z);
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    for (let d = 100; d <= 900; d += 100) g = Math.max(g, T.groundOrWater(p.x + fx * d, p.z + fz * d));
    return g + clearance;
  }

  // ---------------------------------------------------------------- menu flow
  enterMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.hud.show(false);
    this.updateTouch();
    this.menus.reset('title');
    this.playMusic('menu');
    this.audio.ambience(null);
  }

  playMusic(id) {
    this.wantTrack = id;
    if (this.audio.ctx) this.audio.music(id);
  }

  action(a, el) {
    switch (a) {
      case 'regions': this.menus.renderRegions(this.progress); this.menus.push('regions'); break;
      case 'region': {
        this.selected = levelById(el.dataset.id);
        this.menus.renderBriefing(this.selected, this.touchVisible());
        this.menus.push('briefing');
        break;
      }
      case 'launch': this.launch(this.selected); break;
      case 'bestiary': this.openBestiary(); break;
      case 'beast': this.selectBeast(el.dataset.id); break;
      case 'help': this.menus.push('help'); break;
      case 'settings':
        this.menus.renderSettings(this.settings, (k, v) => this.changeSetting(k, v));
        this.menus.push('settings');
        break;
      case 'back': this.back(); break;
      case 'resume': this.resume(); break;
      case 'restart': this.startMission(); break;
      case 'quit': this.quitToMenu(); break;
      case 'next': {
        const i = LEVELS.indexOf(this.world.level);
        this.launch(LEVELS[Math.min(LEVELS.length - 1, i + 1)]);
        break;
      }
      default: break;
    }
  }

  back() {
    const cur = this.menus.current;
    if (cur === 'bestiary') this.closeBestiary();
    if (cur === 'settings' && this.qualityChanged) {
      this.qualityChanged = false;
      if (this.state === 'menu') { this.reloadForQuality(); return; }
      this.menus.toast('האיכות החדשה תיכנס לתוקף באזור הבא');
    }
    this.menus.pop();
  }

  menuKey(e) {
    if (e.code !== 'Escape' && e.code !== 'Backspace') return;
    if (this.state === 'playing') return; // the game loop handles pause
    if (this.state === 'paused' && this.menus.current === 'pause') { this.resume(); return; }
    if (this.menus.stack.length > 1) { this.audio.ui('click'); this.back(); }
  }

  changeSetting(k, v) {
    this.settings[k] = v;
    save('settings', this.settings);
    if (k === 'master' || k === 'music' || k === 'sfx') this.audio.setVolumes({ [k]: v });
    if (k === 'invert') this.input.setInvert(v);
    if (k === 'shake') this.rig.shakeEnabled = v;
    if (k === 'touch') this.updateTouch();
    if (k === 'quality') this.qualityChanged = true;
  }

  async reloadForQuality() {
    this.state = 'loading';
    this.menus.reset('loading');
    this.renderer.setQuality(this.settings.quality);
    this.speciesAssets = {};
    this.renderer.composer = null;
    if (this.showcase) { this.showcase = null; }
    await this.loadWorld(this.world.level);
    this.enterMenu();
  }

  touchVisible() {
    const t = this.settings.touch;
    return t === 'on' || (t === 'auto' && (isTouchDevice() || this.input.lastDevice === 'touch'));
  }

  updateTouch() {
    const on = this.touchVisible();
    document.body.classList.toggle('touch', on);
    this.input.setTouchVisible(on && this.state === 'playing');
  }

  // ---------------------------------------------------------------- bestiary
  async openBestiary() {
    if (!this.showcase) this.showcase = new Showcase(this);
    this.state = 'bestiary';
    this.beast = this.beast || 'raptor';
    this.menus.renderBestiary(this.progress.seen, this.beast);
    this.menus.push('bestiary');
    this.renderer.renderPass.scene = this.showcase.scene;
    this.renderer.renderPass.camera = this.showcase.camera;
    this.renderer.setLevelLook(LEVELS[0]);
    this.showcase.scene.environment = this.world.scene.environment;
    await this.showcase.show(this.beast);
  }

  selectBeast(id) {
    this.beast = id;
    this.menus.renderBestiary(this.progress.seen, id);
    this.showcase.show(id);
    const s = SPECIES[id].sound;
    this.audio.roar(s, null, 0.7);
  }

  closeBestiary() {
    this.state = 'menu';
    this.renderer.renderPass.scene = this.world.scene;
    this.renderer.renderPass.camera = this.camera;
    this.renderer.setLevelLook(this.world.level);
  }

  // ---------------------------------------------------------------- missions
  async launch(level) {
    this.progress.last = level.id;
    save('progress', this.progress);
    if (this.touchVisible()) {
      try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) { /* optional */ }
      try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* optional */ }
    }
    if (!this.world || this.world.level !== level) {
      this.state = 'loading';
      this.hud.show(false);
      this.input.setTouchVisible(false);
      this.menus.reset('loading');
      this.menus.nextTip();
      this.tipTimer = setInterval(() => this.menus.nextTip(), 4500);
      await this.loadWorld(level);
      clearInterval(this.tipTimer);
    }
    this.startMission();
  }

  startMission() {
    const w = this.world, L = w.level;
    w.clearActors();
    const rand = mulberry32((Date.now() & 0xffff) + L.seed);
    // start on the far side of the region, flying in towards the centre
    let ang = rand() * Math.PI * 2;
    if (L.id === 'volcano') ang = Math.atan2(900, 650) + (rand() - 0.5) * 0.5;
    const start = new THREE.Vector3(Math.cos(ang) * 2300, 0, Math.sin(ang) * 2300);
    const heading = Math.atan2(start.x, start.z);
    start.y = this.safeAltitude(start, heading, 170);
    w.populate(rand, start);
    this.rand = rand;
    w.jet.reset(start, heading);
    w.jet.missilesLeft = 4;
    this.mission = {
      score: 0, kills: 0, combo: 1, comboTimer: 0, bestCombo: 1, lives: LIVES, deaths: 0, time: 0, missiles: 0,
      waveIndex: 0, done: false, endTimer: 0, respawn: 0, armorToast: 0, boss: w.monsters.list.find((m) => m.spec.boss) || null,
      objTitle: '', objSub: '', objProgress: 0, popups: 0,
    };
    this.hud.setLives(LIVES, LIVES);
    this.hud.setBoss(this.mission.boss);
    this.hitFlash = 0;
    this.rig.modeIndex = 0;
    this.rig.startIntro(w.jet);
    this.state = 'playing';
    this.menus.hideAll();
    this.hud.show(true);
    this.input.enabled = true;
    this.input.clearEdges();
    this.updateTouch();
    this.playMusic(L.music);
    this.audio.ambience(L.id);
    this.audio.flyby(0.7);
    this.hud.message(L.name, L.goal ? `חסלו ${L.goal} מפלצות` : 'השמידו את גבישי האש של מלך הלבה', 3.2);
    this.updateObjective();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.setTouchVisible(false);
    this.audio.engine({ active: false, alive: false, throttle: 0, speed: 0 });
    this.audio.cannon(false);
    this.audio.alarm(false);
    this.audio.lockState(0);
    this.menus.reset('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.hideAll();
    this.input.enabled = true;
    this.input.clearEdges();
    this.updateTouch();
    this.last = performance.now();
  }

  quitToMenu() {
    this.audio.alarm(false);
    this.audio.lockState(0);
    this.audio.cannon(false);
    this.attractSetup();
    this.rig.crash = null;
    this.rig.snap(this.world.jet);
    this.enterMenu();
  }

  // ---------------------------------------------------------------- events from monsters and weapons
  makeEvents() {
    const live = () => this.state === 'playing' && this.mission && !this.mission.done;
    return {
      onKill: (m, point) => {
        if (!live()) return;
        const M = this.mission, S = m.spec;
        M.kills++;
        M.combo = M.comboTimer > 0 ? Math.min(5, M.combo + 1) : 1;
        M.comboTimer = COMBO_WINDOW;
        M.bestCombo = Math.max(M.bestCombo, M.combo);
        const pts = S.score * M.combo;
        M.score += pts;
        this.hud.hitMarker(true);
        this.hud.popup(point, `+${formatInt(pts)}`, M.combo > 1 ? '#ffd36a' : '#ffffff', S.score >= 400);
        this.progress.seen[m.id] = (this.progress.seen[m.id] || 0) + 1;
        if (this.progress.seen[m.id] === 1) this.hud.toast(`חיסול ראשון: ${S.name}! נוסף לאטלס`, '#9dffcf');
        else if (M.combo >= 3) this.hud.toast(`רצף x${M.combo}!`, '#ffd36a');
        // drops from the bigger monsters
        const chance = S.boss ? 0 : S.id === 'raptor' ? 0.1 : S.flies ? 0.25 : 0.55;
        if (this.rand() < chance) {
          const jet = this.world.jet;
          const kind = jet.hp < 60 ? 'repair' : jet.missilesLeft < 2 ? 'ammo' : ['repair', 'ammo', 'boost'][Math.floor(this.rand() * 3)];
          this.world.pickups.spawn(kind, m.pos);
        }
        if (S.boss) this.win();
        else this.checkWaves();
        this.updateObjective();
      },
      onHit: (m) => { if (live()) this.hud.hitMarker(false); },
      onMissileKill: (m) => {
        if (!live()) return;
        this.mission.score += 50;
        this.hud.popup(this.world.monsters.center(m, new THREE.Vector3()).add(_v.set(0, 8, 0)), 'פגיעה ישירה +50', '#9dffcf');
      },
      onShotDown: (s) => {
        if (!live()) return;
        this.mission.score += 25;
        this.hud.popup(s.p, '+25', '#ffb070');
      },
      onPlayerHit: (dmg, from, kind) => this.playerHit(dmg, from, kind),
      onCrystal: (m, left) => {
        if (!live()) return;
        this.mission.score += 1000;
        this.hud.popup(m.pos.clone().add(_v.set(0, m.height, 0)), '+1,000', '#ffd36a', true);
        if (left > 0) this.hud.message('גביש נופץ!', `נותרו ${left}`, 2.2, 'gold');
        else { this.hud.message('הלב חשוף!', 'כוונו לחזה הזוהר של מלך הלבה', 3, 'danger'); this.audio.horn(); }
        this.updateObjective();
      },
      onArmor: () => {
        if (!live() || this.mission.armorToast > 0) return;
        this.mission.armorToast = 5;
        this.hud.toast('השריון חוסם! פגעו בגבישים הזוהרים', '#ffb070');
      },
      onBossMove: (kind) => {
        if (!live()) return;
        if (kind === 'rain') this.hud.message('גשם מטאורים!', 'צאו מעמודי האור האדומים', 2.2, 'danger');
        if (kind === 'summon') this.hud.toast('מלך הלבה קורא לכנפיים', '#ff9ad0');
      },
      onMissile: () => { if (this.mission) this.mission.missiles++; },
    };
  }

  checkWaves() {
    const M = this.mission, L = this.world.level;
    const w = L.waves[M.waveIndex];
    if (!w || M.kills < w.at) return;
    M.waveIndex++;
    const jet = this.world.jet;
    for (const [id, n] of Object.entries(w.add)) {
      // arrive from somewhere ahead-ish of the player, not on top of them
      this.world.spawnGroup(id, n, this.rand, jet.pos, { near: jet.pos.clone().addScaledVector(jet.forward, 900).setY(0), nearR: 900, alert: true });
    }
    this.hud.message('גל חדש!', 'עוד מפלצות נכנסו לאזור', 2.4, 'danger');
    this.audio.horn();
  }

  updateObjective() {
    const M = this.mission, L = this.world.level, W = this.world;
    const alive = W.monsters.list.filter((m) => m.alive).length;
    if (L.goal) {
      M.objTitle = `חסלו מפלצות: ${Math.min(M.kills, L.goal)}/${L.goal}`;
      M.objProgress = clamp(M.kills / L.goal, 0, 1);
      M.objSub = M.waveIndex < L.waves.length ? `באזור: ${alive}` : `באזור: ${alive} · הגל האחרון`;
    } else if (M.boss) {
      const left = M.boss.crystals.filter((c) => c && c.alive).length;
      if (left > 0) {
        M.objTitle = `נפצו את גבישי האש: ${3 - left}/3`;
        M.objProgress = (3 - left) / 3;
        M.objSub = 'מלך הלבה שוכן באגם הבוער';
      } else {
        M.objTitle = 'פגעו בלב הזוהר!';
        M.objProgress = clamp(1 - M.boss.hp / M.boss.maxHp, 0, 1);
        M.objSub = 'טילים עושים הכי הרבה נזק';
      }
    }
    if (L.goal && M.kills >= L.goal) this.win();
  }

  playerHit(dmg, from, kind) {
    if (this.state !== 'playing' || !this.mission || this.mission.done) return;
    const jet = this.world.jet;
    if (!jet.alive || jet.invuln > 0) return;
    jet.hp -= dmg;
    jet.invuln = 0.35;
    this.hitFlash = 1;
    this.hud.damage(from);
    this.rig.addTrauma(0.3 + dmg / 50);
    this.audio.hit(kind);
    if (jet.hp <= 0) this.die();
  }

  die() {
    const w = this.world, jet = w.jet, M = this.mission;
    if (!jet.alive) return;
    jet.alive = false;
    jet.hp = 0;
    jet.object.visible = false;
    w.fx.explosion(jet.pos.clone(), 2.6);
    this.audio.explosion(2.6, jet.pos);
    this.rig.startCrash(jet.pos);
    this.rig.addTrauma(0.9);
    M.lives--;
    M.deaths++;
    M.combo = 1; M.comboTimer = 0;
    M.respawn = 2.8;
    this.hud.setLives(M.lives, LIVES);
    this.hud.message('המטוס הופל!', M.lives > 0 ? (M.lives === 1 ? 'נותר מטוס אחרון' : `נותרו ${M.lives} מטוסים`) : '', 2.4, 'danger');
    this.audio.alarm(false);
    this.audio.lockState(0);
    this.audio.cannon(false);
  }

  respawn() {
    const w = this.world, jet = w.jet;
    // come back in from the edge behind where we went down
    const ang = Math.atan2(jet.pos.z, jet.pos.x) + (this.rand() - 0.5) * 0.8;
    const p = new THREE.Vector3(Math.cos(ang) * 2300, 0, Math.sin(ang) * 2300);
    const heading = Math.atan2(p.x, p.z);
    p.y = this.safeAltitude(p, heading, 180);
    jet.reset(p, heading);
    jet.missilesLeft = 4;
    w.weapons.lockTarget = null;
    this.rig.crash = null;
    this.rig.startIntro(jet);
    this.audio.flyby(0.6);
  }

  win() {
    const M = this.mission;
    if (M.done) return;
    M.done = true;
    M.win = true;
    M.endTimer = 3.2;
    this.world.jet.invuln = 99;
    this.hud.message('המשימה הושלמה!', this.world.level.goal ? 'האזור נקי ממפלצות' : 'מלך הלבה הובס', 3, 'gold');
  }

  lose() {
    const M = this.mission;
    M.done = true;
    M.win = false;
    M.endTimer = 2.6;
  }

  finish() {
    const M = this.mission, L = this.world.level, W = this.world;
    this.state = 'results';
    this.input.enabled = false;
    this.input.setTouchVisible(false);
    this.audio.alarm(false);
    this.audio.lockState(0);
    this.audio.cannon(false);
    let stars = 0;
    if (M.win) {
      stars = 1;
      if (M.deaths <= 1) stars = 2;
      if (M.deaths === 0 && M.time <= PAR[L.id]) stars = 3;
    }
    const rec = this.progress.levels[L.id] || { stars: 0, best: 0 };
    const newBest = M.score > (rec.best || 0) && M.score > 0;
    this.progress.levels[L.id] = { stars: Math.max(rec.stars || 0, stars), best: Math.max(rec.best || 0, M.score) };
    save('progress', this.progress);
    this.menus.renderResults({
      level: L, win: !!M.win, stars, score: M.score, best: rec.best, newBest, time: M.time, kills: M.kills,
      accuracy: W.weapons.accuracy, missiles: M.missiles, bestCombo: M.bestCombo, deaths: M.deaths,
      hasNext: LEVELS.indexOf(L) < LEVELS.length - 1,
    });
    this.menus.reset('results');
    this.audio.fanfare(!!M.win);
  }

  shakeAt(pos, amount) {
    const d = pos.distanceTo(this.camera.position);
    this.rig.addTrauma(clamp(amount * 0.35 / (1 + d / 120), 0, 0.6));
  }

  // ---------------------------------------------------------------- per frame
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }
    if (!this.world) return;

    if (this.state === 'bestiary' && this.showcase) {
      this.showcase.update(dt);
      this.renderer.render(dt, this.time);
      return;
    }
    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'menu' || this.state === 'results') this.updateAttract(dt);
    else if (this.state === 'paused') { /* frozen */ }
    this.renderFrame(dt);
  }

  updateAttract(dt) {
    const w = this.world, jet = w.jet, ap = this.ap;
    if (this.state === 'menu' && jet.alive) {
      // autopilot: fly a wide circle round the centre at a comfortable height
      ap.t += dt;
      const ang = Math.atan2(jet.pos.z - ap.center.z, jet.pos.x - ap.center.x) + ap.dir * 0.45;
      const target = _v.set(ap.center.x + Math.cos(ang) * ap.R, 0, ap.center.z + Math.sin(ang) * ap.R);
      const f = jet.forward;
      const tx = target.x - jet.pos.x, tz = target.z - jet.pos.z;
      const err = Math.atan2(tx * f.z - tz * f.x, tx * f.x + tz * f.z); // > 0: target on the left
      const alt = jet.pos.y - this.safeAltitude(jet.pos, Math.atan2(-f.x, -f.z), 0);
      const pitch = clamp((130 - alt) * 0.012 - f.y * 2.5, -0.6, 0.6);
      jet.update(dt, { pitch, roll: clamp(-err * 1.6, -0.9, 0.9), yaw: 0, boost: false, brake: false }, { settings: { assist: 1 }, warnings: {} });
      jet.updateVisuals(this.time);
    }
    // alternate between chasing the jet and orbiting a monster
    const s = this.shot;
    s.t += dt;
    if (this.state === 'menu' && s.t > (s.kind === 'chase' ? 13 : 10)) {
      s.t = 0;
      const mons = w.monsters.list.filter((m) => m.alive && !m.spec.flies);
      if (s.kind === 'chase' && mons.length) {
        const m = mons[Math.floor(Math.random() * mons.length)];
        s.kind = 'orbit';
        s.target = m;
        this.rig.setOrbit(w.monsters.center(m, new THREE.Vector3()), Math.max(45, m.height * 5 + m.radius * 4), Math.max(14, m.height * 1.2));
        this.rig.pos.copy(this.rig.orbit.center).add(_w.set(this.rig.orbit.radius, this.rig.orbit.height, 0));
      } else {
        s.kind = 'chase';
        this.rig.orbit = null;
        this.rig.snap(jet);
      }
    }
    if (s.kind === 'orbit' && s.target && s.target.alive) w.monsters.center(s.target, this.rig.orbit.center);
    w.monsters.update(dt, this.time, { pos: _w.set(0, -1e5, 0), vel: new THREE.Vector3(), alive: false, invuln: 1 });
    w.fx.update(dt, this.time, w.terrain);
    w.pickups.update(dt, this.time, { alive: false, pos: jet.pos }, () => {});
    this.rig.update(dt, { jet, terrain: w.terrain, boosting: false, speed: jet.speed });
    this.audio.engine({ active: false, alive: false, throttle: 0, speed: 0 });
    this.audio.setListener(this.camera.position, _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));
    this.audio.update(dt);
    this.audio.setIntensity(0.3);
  }

  updatePlaying(dt) {
    const w = this.world, jet = w.jet, M = this.mission, T = w.terrain;
    const input = this.input.poll(dt);
    if (input.pause) { this.pause(); return; }
    if (input.mute) { this.muted = !this.muted; this.audio.setVolumes({ master: this.muted ? 0 : this.settings.master }); this.hud.toast(this.muted ? 'הצליל כבוי' : 'הצליל פועל'); }
    if (input.camera) this.rig.cycle();
    if (this.input.lastDevice === 'touch' && this.settings.touch === 'auto' && !document.body.classList.contains('touch')) this.updateTouch();

    M.time += M.done ? 0 : dt;
    M.comboTimer = Math.max(0, M.comboTimer - dt);
    if (M.comboTimer <= 0) M.combo = 1;
    M.armorToast = Math.max(0, M.armorToast - dt);
    const warnings = this.warnings;
    warnings.ground = false;

    // the jet
    const prev = _w.copy(jet.pos);
    if (jet.alive) {
      // after a win the jet climbs away on its own (a victory lap, and no crash after the win)
      const ctl = M.done && M.win ? { pitch: clamp((0.28 - jet.forward.y) * 2.5, -0.4, 0.7), roll: 0, yaw: 0, boost: false, brake: false } : input;
      jet.update(dt, ctl, { settings: { assist: M.done && M.win ? 1 : this.settings.assist }, warnings });
      jet.updateVisuals(this.time);
      const ground = T.groundOrWater(jet.pos.x, jet.pos.z);
      const alt = jet.pos.y - ground;
      warnings.ground = !M.done && (alt < 30 || (alt < 70 && jet.vel.y < -25));
      if (alt < 2.5) {
        if (M.done && M.win) jet.pos.y = ground + 2.5;
        else this.die();
      }
      else {
        // flying into a monster
        const hit = w.monsters.segmentHit(prev, jet.pos, 3);
        if (hit && jet.invuln <= 0) {
          this.playerHit(40, hit.point, 'body');
          w.monsters.damage(hit.m, 150, hit.point, { sphere: hit.sphere, dir: jet.forward.clone() });
          jet.pos.y += 6;
          jet.vel.y = Math.max(jet.vel.y, 40);
          w.fx.sparks(hit.point, 1.2);
        }
      }
    } else if (!M.done) {
      M.respawn -= dt;
      if (M.respawn <= 0) {
        if (M.lives > 0) this.respawn();
        else { this.lose(); this.hud.message('המטוסים אזלו', 'נסו שוב, הפעם קצת יותר גבוה', 2.6, 'danger'); }
      }
    }

    // weapons
    const W = w.weapons;
    W.updateTargeting(dt, jet, jet.alive && !M.done);
    W.updateCannon(dt, jet, input.fire && jet.alive && !M.done && this.rig.intro <= 0);
    if (input.missile && jet.alive && !M.done) W.launchMissile(jet);
    w.monsters.update(dt, this.time, jet);
    W.update(dt, this.time, jet);
    w.pickups.update(dt, this.time, jet, (kind, pos) => this.collect(kind, pos));
    w.fx.update(dt, this.time, T);
    if (jet.boosting && Math.random() < dt * 20) w.fx.vapour?.(jet.pos, jet.vel, 0.6);

    // end of mission
    if (M.done) {
      M.endTimer -= dt;
      if (M.endTimer <= 0) { this.finish(); return; }
    } else if (M.boss || this.world.level.goal) {
      if (M.boss && M.boss.heartExposed) this.updateObjective();
    }

    // camera, sound, HUD
    this.rig.update(dt, { jet, terrain: T, boosting: jet.boosting, speed: jet.speed });
    const A = this.audio;
    A.engine({ active: true, alive: jet.alive, throttle: jet.throttle, speed: jet.speed, boosting: jet.boosting, cockpit: this.rig.mode === 'cockpit' });
    A.setListener(this.camera.position, _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));
    A.alarm(jet.alive && !M.done && (warnings.ground || jet.hp < jet.maxHp * 0.25));
    let busy = 0;
    for (const m of w.monsters.list) if (m.alive && m.alert && m.pos.distanceTo(jet.pos) < 1300) busy += m.spec.boss ? 4 : 1;
    const threats = jet.alive ? W.threats(jet) : 0;
    A.setIntensity(clamp(0.25 + busy * 0.12 + threats * 0.15, 0.25, 1));
    A.update(dt);

    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    this.boostFx = damp(this.boostFx, jet.boosting ? 1 : 0, 6, dt);
    const g = this.renderer.grade.uniforms;
    g.uHit.value = this.hitFlash;
    g.uLowHp.value = jet.alive && jet.hp < jet.maxHp * 0.3 ? 1 : 0;
    g.uBoost.value = this.boostFx;

    this.hud.update(dt, {
      jet, weapons: W, monsters: w.monsters, camera: this.camera, pickups: w.pickups,
      game: { score: M.score, combo: M.combo, objTitle: M.objTitle, objSub: M.objSub, objProgress: M.objProgress },
      warnings, threats, fps: this.settings.fps ? this.fps : 0, ground: T.groundOrWater(jet.pos.x, jet.pos.z),
      cameraMode: this.rig.intro > 0 ? 'intro' : this.rig.mode,
    });
  }

  collect(kind, pos) {
    const jet = this.world.jet, M = this.mission;
    if (kind === 'repair') jet.hp = Math.min(jet.maxHp, jet.hp + 35);
    if (kind === 'ammo') { jet.missilesLeft = 4; this.world.weapons.reloadTimer = 0; }
    if (kind === 'boost') jet.boost = 1;
    M.score += 50;
    this.hud.toast(`${PICKUPS[kind].name}: ${PICKUPS[kind].text}`, '#' + new THREE.Color(PICKUPS[kind].color).getHexString());
    this.audio.pickup();
    this.world.fx.sparks(pos, 1.2, PICKUPS[kind].color);
  }

  renderFrame(dt) {
    const w = this.world;
    const focus = w.jet.alive ? w.jet.pos : this.camera.position;
    w.update(dt, this.time, this.camera, focus);
    if (this.state !== 'playing') {
      const g = this.renderer.grade.uniforms;
      g.uHit.value = 0; g.uLowHp.value = 0; g.uBoost.value = 0;
    }
    this.renderer.render(dt, this.time);
  }

  resize() {
    this.renderer.resize();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.updateTouch();
  }
}

// ------------------------------------------------------------------ start
function fatal(err) {
  console.error(err);
  const box = document.getElementById('load-title');
  if (box) box.textContent = 'משהו השתבש בטעינה. נסו לרענן את הדף, או לבחור איכות נמוכה.';
}

try {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
  const game = new Game();
  window.__game = game; // handy for debugging from the console
  game.boot().catch(fatal);
} catch (e) {
  const t = document.getElementById('load-title');
  if (t) t.textContent = e.message === 'no webgl' ? 'הדפדפן הזה לא תומך בגרפיקה תלת־ממדית (WebGL).' : 'משהו השתבש בטעינה.';
  console.error(e);
}
