// נץ הברזל: ציד מפלצות. Game flow: loading, the menu with a live 3D world behind it, the
// monster atlas, and missions. In a mission the player sits pressed against the front window
// with two cannons peeking in from the corners; the track carries them through the region,
// running along the ground or flying low, and stops at every ambush, where waves of monsters
// burst out of the ground and charge the window. The volcano ends with the boss. Also pause,
// results and scoring.
import * as THREE from 'three';
import { Renderer, autoQuality, QUALITY } from './core/render.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { clamp, damp, lerp, mulberry32, isTouchDevice, smoothstep, formatInt } from './core/util.js';
import { LEVELS, levelById } from './world/levels.js';
import { Terrain } from './world/terrain.js';
import { Atmosphere } from './world/sky.js';
import { Liquid } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Clouds } from './world/clouds.js';
import { Rail } from './world/rail.js';
import { MonsterSystem } from './actors/monsters.js';
import { SPECIES, SPECIES_ORDER } from './actors/species.js';
import { Guns } from './actors/guns.js';
import { Weapons, MISSILE } from './actors/weapons.js';
import { Pickups, PICKUPS } from './actors/pickups.js';
import { FX } from './fx/fx.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const STORE = 'ironhawk.v1.';
const load = (key, def) => {
  try { return { ...def, ...JSON.parse(localStorage.getItem(STORE + key) || '{}') }; } catch (e) { return { ...def }; }
};
const save = (key, v) => { try { localStorage.setItem(STORE + key, JSON.stringify(v)); } catch (e) { /* private mode */ } };

const LIVES = 3;
const COMBO_WINDOW = 4;
const SPEED = { ground: 17, air: 40 }; // cruising speed on each kind of leg, m/s
const ACCEL = 8, BRAKE = 12;           // m/s²
const WAVE_LIMIT = 24;                 // seconds before the next wave comes anyway
const TRAVEL_GAP = 260;                // metres between the groups met on the way
const tick = () => new Promise((r) => setTimeout(r, 0));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const approach = (cur, target, step) => (cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));

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
    progress(0.14, 'סולל את הדרך…');
    await tick();
    this.rail = new Rail(this.terrain, L.rail).build();
    progress(0.2, 'צובע את השמיים…');
    await tick();
    this.atmo = new Atmosphere(L, q);
    scene.add(this.atmo.group);
    this.fogColor = this.atmo.bake(r, scene);
    progress(0.3, 'פורש סלעים, חול ועשב…');
    await tick();
    await this.terrain.createMaterial(r, this.atmo.sunDir);
    if (L.water !== 'none') {
      this.liquid = new Liquid(this.terrain, L.water);
      scene.add(await this.liquid.build(r));
    }
    progress(0.42, 'שותל עצים ומפזר סלעים…');
    await tick();
    this.veg = new Vegetation(this.terrain, L, q, this.rail);
    this.veg.build();
    scene.add(this.veg.group);
    this.clouds = new Clouds(L, this.terrain.size);
    scene.add(this.clouds.build(this.atmo.sunDir, this.atmo.sun.color, scene.fog, this.atmo.horizonLum));
    progress(0.52, 'מעיר את המפלצות…');
    await tick();
    this.fx = new FX(scene, q);
    this.fx.setTheme(L, this.fogColor, L.fog.density);
    this.fx.onShake((pos, amount) => game.shakeAt(pos, amount));
    this.pickups = new Pickups(scene, this.terrain);
    const ctx = { scene, terrain: this.terrain, fx: this.fx, audio: game.audio, quality: q, events: game.events, renderer: r, level: L, pickups: this.pickups };
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
    progress(0.93, 'טוען את התותחים…');
    await tick();
  }

  speciesIds() {
    const L = this.level, set = new Set();
    for (const [id, n] of Object.entries(L.monsters)) if (n) set.add(id);
    for (const leg of L.rail.legs) {
      if (leg.boss) set.add('boss');
      for (const w of leg.waves || []) for (const id of Object.keys(w)) set.add(id);
    }
    for (const g of Object.values(L.rail.travel || {})) for (const id of Object.keys(g)) set.add(id);
    if (set.has('boss')) set.add('flyer');
    return SPECIES_ORDER.filter((id) => set.has(id));
  }

  // monsters roaming near the track (the menu's backdrop)
  populate(rand) {
    const T = this.terrain, M = this.monsters, R = this.rail;
    for (const [id, n] of Object.entries(this.level.monsters)) {
      if (!n) continue;
      if (id === 'boss') {
        const p = new THREE.Vector3(650, 0, 900);
        p.y = T.heightAt(p.x, p.z);
        M.spawn('boss', p, { heading: Math.atan2(-p.x, -p.z), nest: p.clone() });
        continue;
      }
      for (let i = 0; i < n; i++) {
        const near = R.pointAt(rand() * R.length, new THREE.Vector3()).setY(0);
        const at = T.findLandPoint(rand, { near, nearR: 260, maxSlope: id === 'longneck' ? 0.22 : 0.3, minHeightAboveWater: id === 'longneck' ? -3 : 2 });
        M.spawn(id, at, { sizeJitter: true, nest: at });
      }
    }
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
    this.camera.focus = 60;
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
    this.camera.focus = this.dist * 0.9;
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
      quality: autoQuality(), master: 0.8, music: 0.55, sfx: 0.9, assist: 1, anaglyph: false, shake: true, touch: 'auto', fps: false,
    });
    if (!QUALITY[this.settings.quality]) this.settings.quality = autoQuality();
    if (![0, 1, 1.6].includes(this.settings.assist)) this.settings.assist = 1;
    this.progress = load('progress', { levels: {}, seen: {}, last: 'valley' });
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas, this.settings.quality);
    this.renderer.autoScale = true;
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 16000);
    this.camera.focus = 24; // with 3D glasses, things nearer than this come out of the screen
    this.renderer.camera = this.camera;
    this.guns = new Guns();
    this.guns.camera.focus = 1.15;
    this.guns.show(false);
    this.renderer.overlay = { scene: this.guns.scene, camera: this.guns.camera, enabled: true };
    this.renderer.setAnaglyph(this.settings.anaglyph);
    this.rig = new CameraRig(this.camera);
    this.rig.shakeEnabled = this.settings.shake;
    this.rig.onStep = (side, amp) => this.footstep(side, amp);
    this.audio = new AudioEngine();
    this.audio.setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    this.input = new Input({ canvas: this.canvas, touchRoot: document.getElementById('touch') });
    this.hud = new HUD(document.getElementById('hud'));
    this.menus = new Menus(document.getElementById('ui'), { onAction: (a, el) => this.action(a, el), audio: this.audio });
    this.speciesAssets = {};
    this.events = this.makeEvents();
    this.player = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1),
      alive: true, invuln: 0, hp: 100, maxHp: 100, missilesLeft: MISSILE.max,
    };
    this.state = 'loading';
    this.world = null;
    this.showcase = null;
    this.time = 0;
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 0;
    this.hitFlash = 0;
    this.muted = false;
    this.selected = levelById(this.progress.last);

    const unlock = () => { this.audio.unlock(); if (this.audio.ctx && !this.audio.trackId && this.wantTrack !== undefined) this.audio.music(this.wantTrack); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
    document.getElementById('h-pause').addEventListener('click', () => { this.audio.ui('click'); this.pause(); });
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
    w.pickups.onTake = (kind, pos) => this.collect(kind, pos);
    if (!this.renderer.composer) this.renderer.buildComposer(w.scene, this.camera);
    this.renderer.setView(w.scene, this.camera);
    this.renderer.setLevelLook(level);
    this.guns.setLook(level, w.scene.environment, w.atmo.sunDir);
    // compile shaders now rather than in the first second of play
    try {
      this.attractSetup();
      this.updateAttract(0.016);
      this.guns.show(true);
      this.guns.update(0.016, this.camera, { aimDir: _v.set(0, 0, -1).applyQuaternion(this.camera.quaternion), aimDist: 100 });
      await this.renderer.renderer.compileAsync?.(w.scene, this.camera);
      await this.renderer.renderer.compileAsync?.(this.guns.scene, this.guns.camera);
      this.guns.show(false);
    } catch (e) { /* not fatal */ }
    this.menus.setLoading(1, 'מוכן!');
  }

  // menu background: a ride along the track, with close looks at the monsters on the way
  attractSetup() {
    const w = this.world;
    w.clearActors();
    w.monsters.railMode = false;
    w.weapons.rail = false;
    const rand = mulberry32(w.level.seed + 31);
    w.populate(rand);
    this.ap = { s: rand() * w.rail.length * 0.5, t: 0, kind: 'ride' };
    this.rig.snapTo(w.rail.pointAt(this.ap.s, _v), w.rail.lookAt(this.ap.s, _w));
  }

  // ---------------------------------------------------------------- menu flow
  enterMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.hud.show(false);
    this.guns.show(false);
    document.body.classList.remove('playing');
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
    if (k === 'shake') this.rig.shakeEnabled = v;
    if (k === 'touch') this.updateTouch();
    if (k === 'quality') this.qualityChanged = true;
    if (k === 'anaglyph') this.renderer.setAnaglyph(v);
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
    this.renderer.setView(this.showcase.scene, this.showcase.camera);
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
    this.renderer.setView(this.world.scene, this.camera);
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
    const w = this.world, L = w.level, R = w.rail, P = this.player;
    w.clearActors();
    w.monsters.railMode = true;
    w.weapons.rail = true;
    this.rand = mulberry32((Date.now() & 0xffff) + L.seed);
    Object.assign(P, { alive: true, invuln: 0, hp: 100, maxHp: 100, missilesLeft: MISSILE.max });
    R.pointAt(0, P.pos);
    R.tangentAt(0, P.forward);
    P.vel.set(0, 0, 0);
    this.mission = {
      s: 0, speed: 0, phase: 'intro', phaseT: 0, stop: 0, wave: -1, waveT: 0, queue: [], ambush: [], travelNext: 160,
      score: 0, kills: 0, combo: 1, comboTimer: 0, bestCombo: 1, lives: LIVES, livesLost: 0, damage: 0, time: 0, missiles: 0,
      cleared: 0, done: false, win: false, endTimer: 0, armorToast: 0, boss: null, arena: null,
      objTitle: '', objSub: '', objProgress: 0,
    };
    this.hud.setLives(LIVES, LIVES);
    this.hud.setBoss(null);
    this.hitFlash = 0;
    this.rig.snapTo(P.pos, R.lookAt(0, _v));
    this.rig.trauma = 0;
    this.input.aim.x = 0; this.input.aim.y = 0;
    this.guns.show(true);
    this.state = 'playing';
    document.body.classList.add('playing');
    this.menus.hideAll();
    this.hud.show(true);
    this.input.enabled = true;
    this.input.clearEdges();
    this.updateTouch();
    this.playMusic(L.music);
    this.audio.ambience(L.id);
    const first = R.stops[0];
    this.hud.message(L.name, first.mode === 'air' ? 'ממריאים. המפלצות כבר בדרך' : 'יוצאים לדרך. המפלצות כבר מחכות', 2.8);
    if (first.mode === 'air') this.audio.flyby(0.7);
    this.updateObjective();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.setTouchVisible(false);
    document.body.classList.remove('playing');
    this.audio.engine({ active: false, alive: false, throttle: 0, speed: 0 });
    this.audio.cannon(false);
    this.audio.alarm(false);
    this.menus.reset('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.body.classList.add('playing');
    this.menus.hideAll();
    this.input.enabled = true;
    this.input.clearEdges();
    this.updateTouch();
    this.last = performance.now();
  }

  quitToMenu() {
    this.audio.alarm(false);
    this.audio.cannon(false);
    this.attractSetup();
    this.enterMenu();
  }

  // ---------------------------------------------------------------- events from monsters and weapons
  makeEvents() {
    const live = () => this.state === 'playing' && this.mission && !this.mission.done;
    return {
      onKill: (m, point) => {
        if (!live()) return;
        const M = this.mission, S = m.spec, P = this.player;
        M.kills++;
        M.combo = M.comboTimer > 0 ? Math.min(5, M.combo + 1) : 1;
        M.comboTimer = COMBO_WINDOW;
        M.bestCombo = Math.max(M.bestCombo, M.combo);
        // close kills are worth more
        const close = m.pos.distanceTo(P.pos) < 30 ? 2 : 1;
        const pts = S.score * M.combo * close;
        M.score += pts;
        this.hud.hitMarker(true);
        this.hud.popup(point, close > 1 ? `+${formatInt(pts)} מקרוב!` : `+${formatInt(pts)}`, M.combo > 1 || close > 1 ? '#ffd36a' : '#ffffff', S.score >= 400);
        this.progress.seen[m.id] = (this.progress.seen[m.id] || 0) + 1;
        if (this.progress.seen[m.id] === 1) this.hud.toast(`חיסול ראשון: ${S.name}! נוסף לאטלס`, '#9dffcf');
        else if (M.combo >= 3) this.hud.toast(`רצף x${M.combo}!`, '#ffd36a');
        // supply crates from the bigger monsters
        const chance = S.boss ? 0 : S.id === 'raptor' ? 0.05 : S.flies ? 0.15 : 0.5;
        if (this.rand() < chance) {
          const kind = P.hp < 50 ? 'repair' : P.missilesLeft < 2 ? 'ammo' : ['repair', 'ammo', 'cool'][Math.floor(this.rand() * 3)];
          const at = this.world.monsters.center(m, new THREE.Vector3());
          at.y = Math.max(at.y, P.pos.y - 3);
          this.world.pickups.spawn(kind, at);
        }
        if (S.boss) this.win();
        this.updateObjective();
      },
      onHit: () => { if (live()) this.hud.hitMarker(false); },
      onMissileKill: (m) => {
        if (!live()) return;
        this.mission.score += 50;
        this.hud.popup(this.world.monsters.center(m, new THREE.Vector3()).add(_v.set(0, 5, 0)), 'פגיעה ישירה +50', '#9dffcf');
      },
      onShotDown: (s) => {
        if (!live()) return;
        const pts = s.meteor ? 150 : 25;
        this.mission.score += pts;
        this.hud.popup(s.p, `+${pts}`, '#ffb070', !!s.meteor);
        this.hud.hitMarker(false);
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
        if (kind === 'rain') this.hud.message('גשם מטאורים!', 'ירו בסלעים הבוערים לפני שהם פוגעים', 2.2, 'danger');
        if (kind === 'summon') this.hud.toast('מלך הלבה קורא לכנפיים', '#ff9ad0');
      },
      onMissile: () => { if (this.mission) this.mission.missiles++; },
    };
  }

  // ---------------------------------------------------------------- the ride
  setPhase(phase) {
    const M = this.mission;
    M.phase = phase;
    M.phaseT = 0;
  }

  updateRide(dt) {
    const M = this.mission, w = this.world, R = w.rail, P = this.player, L = w.level;
    M.phaseT += dt;
    let target = 0;
    const st = R.stops[M.stop];
    if (M.phase === 'intro' && M.phaseT > 1.6) this.setPhase('travel');
    if (M.phase === 'travel' && st) {
      const air = R.airAmount(M.s);
      const cruise = lerp(SPEED.ground, SPEED.air, air);
      const left = st.s - M.s;
      target = Math.min(cruise, Math.sqrt(2 * BRAKE * Math.max(0, left)));
      if (left < 1) { M.s = st.s; M.speed = 0; this.arrive(st); }
      else if (M.s > M.travelNext && left > 320) {
        this.spawnTravel();
        M.travelNext = M.s + TRAVEL_GAP * (0.8 + this.rand() * 0.4);
      }
    }
    if (M.phase === 'ambush') this.updateAmbush(dt, st);
    if (M.phase === 'boss' || (M.phase === 'done' && M.arena)) {
      this.updateArena(dt);
      if (M.done) this.updateObjective();
      return;
    }
    M.speed = approach(M.speed, target, (target > M.speed ? ACCEL : BRAKE * 1.3) * dt);
    _u.copy(P.pos);
    M.s = Math.min(M.s + M.speed * dt, R.length);
    R.pointAt(M.s, P.pos);
    R.tangentAt(M.s, P.forward);
    P.vel.copy(P.pos).sub(_u).divideScalar(Math.max(dt, 1e-4));
    // the land changes between legs
    const air = R.airAmount(M.s);
    if (M.lastAir !== undefined) {
      if (M.lastAir < 0.15 && air >= 0.15) { this.audio.flyby(0.8); this.hud.toast('ממריאים!', '#9dd8ff'); }
      if (M.lastAir > 0.85 && air <= 0.85) this.hud.toast('נוחתים לריצה', '#c8ffb0');
    }
    M.lastAir = air;
    if (M.phase !== 'ambush') this.cullBehind();
    this.updateObjective();
  }

  arrive(st) {
    const M = this.mission;
    if (st.boss) { this.startBoss(st); return; }
    this.setPhase('ambush');
    M.wave = -1;
    M.ambush = [];
    this.hud.message('מארב!', st.mode === 'air' ? 'הן באות מהאדמה ומהשמיים' : 'עצרו אותן לפני שהן מגיעות לחלון', 2.2, 'danger');
    this.audio.horn();
    this.nextWave(st);
  }

  nextWave(st) {
    const M = this.mission;
    M.wave++;
    M.waveT = 0;
    const wave = st.waves[M.wave];
    if (!wave) return;
    const crowd = this.renderer.q.crowd ?? 1;
    let delay = M.wave === 0 ? 0.9 : 0.4;
    for (const [id, n0] of Object.entries(wave)) {
      const small = id === 'raptor' || id === 'flyer';
      const n = small ? Math.max(2, Math.round(n0 * crowd)) : n0;
      for (let i = 0; i < n; i++) {
        M.queue.push({ id, t: delay, s: st.s });
        delay += small ? 0.2 + this.rand() * 0.35 : 0.8 + this.rand() * 0.8;
      }
    }
    if (M.wave > 0) this.hud.message(`גל ${M.wave + 1}`, M.wave === st.waves.length - 1 ? 'הגל האחרון במארב' : '', 1.6, 'danger');
    this.updateObjective();
  }

  updateAmbush(dt, st) {
    const M = this.mission;
    M.waveT += dt;
    for (let i = M.queue.length - 1; i >= 0; i--) {
      const q = M.queue[i];
      q.t -= dt;
      if (q.t > 0) continue;
      M.queue.splice(i, 1);
      const m = this.spawnCharger(q.id, q.s, { ambush: true });
      if (m) M.ambush.push(m);
    }
    this.dropStragglers(dt);
    const alive = M.ambush.filter((m) => m.alive).length;
    const last = M.wave >= st.waves.length - 1;
    if (M.queue.length) return;
    if (!last && (alive <= 2 || M.waveT > WAVE_LIMIT)) this.nextWave(st);
    else if (last && (alive === 0 || M.waveT > WAVE_LIMIT + 12)) this.clearStop(st);
  }

  // a runner stuck behind a rock, or one that ended up behind the window, would hold the
  // ambush up with nothing to shoot at: let it go
  dropStragglers(dt) {
    const M = this.mission, P = this.player, Ms = this.world.monsters;
    for (const m of M.ambush) {
      if (!m.alive || m.dying) continue;
      const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z);
      if (m.closest === undefined || d < m.closest - 2) { m.closest = d; m.idle = 0; } else m.idle += dt;
      const along = (m.pos.x - P.pos.x) * P.forward.x + (m.pos.z - P.pos.z) * P.forward.z;
      const stuck = !m.spec.flies && m.idle > 6 && d > m.spec.reach + 6;
      if (stuck || along < -30 || d > 600) {
        m.alive = false;
        Ms.remove(m);
      }
    }
  }

  clearStop(st) {
    const M = this.mission, R = this.world.rail;
    const bonus = 500 * (M.stop + 1);
    M.score += bonus;
    M.cleared++;
    M.stop++;
    if (M.stop >= R.stops.length) { this.win(); return; }
    const next = R.stops[M.stop];
    this.hud.message('המארב נשבר!', `+${formatInt(bonus)} · ${next.boss ? 'עכשיו למלך הלבה' : next.mode === 'air' ? 'ממשיכים בטיסה' : 'ממשיכים בריצה'}`, 2.4, 'gold');
    this.audio.pickup();
    this.setPhase('travel');
    M.travelNext = M.s + 180;
    this.updateObjective();
  }

  // a monster that charges the window, out of the ground or running in from ahead
  spawnCharger(id, nearS, opts = {}) {
    const w = this.world, R = w.rail, T = w.terrain, P = this.player;
    const big = id !== 'raptor' && id !== 'flyer';
    const p = new THREE.Vector3();
    for (let tries = 0; tries < 6; tries++) {
      // close enough to read as a crowd, spread across the view
      const ahead = opts.ahead ?? (big ? 75 + this.rand() * 75 : 35 + this.rand() * 95);
      const side = (this.rand() < 0.5 ? -1 : 1) * (4 + this.rand() * Math.min(big ? 40 : 55, ahead * (big ? 0.45 : 0.65)));
      R.spotAhead(nearS, ahead, side, p);
      if (id === 'flyer' || T.heightAt(p.x, p.z) > T.waterLevel + 0.6) break;
    }
    const heading = Math.atan2(P.pos.x - p.x, P.pos.z - p.z);
    const slot = (this.rand() - 0.5) * (big ? 22 : 15);
    if (id === 'flyer') {
      p.y = Math.max(p.y, P.pos.y) + 25 + this.rand() * 55;
      return w.monsters.spawn('flyer', p, { charge: true, ambush: opts.ambush, slot: slot * 3, heading, nest: p.clone() });
    }
    const emerge = opts.emerge ?? this.rand() < 0.6;
    const m = w.monsters.spawn(id, p, { charge: true, ambush: opts.ambush, slot, heading, emerge, sizeJitter: true, nest: p.clone() });
    if (emerge) {
      w.fx.dust(p, m.height * 0.9);
      if (big || this.rand() < 0.3) this.audio.thud(m.height / 8, p);
    }
    return m;
  }

  // a few monsters met on the way between stops
  spawnTravel() {
    const M = this.mission, R = this.world.rail, L = this.world.level;
    const mode = R.airAmount(M.s + 260) > 0.5 ? 'air' : 'ground';
    const group = L.rail.travel?.[mode];
    if (!group) return;
    for (const [id, n] of Object.entries(group)) {
      for (let i = 0; i < n; i++) this.spawnCharger(id, M.s, { ahead: 230 + this.rand() * 110, emerge: id !== 'flyer' && this.rand() < 0.4 });
    }
  }

  // monsters the ride has left behind are gone for good
  cullBehind() {
    const P = this.player, Ms = this.world.monsters;
    for (const m of [...Ms.list]) {
      if (!m.alive || m.spec.boss) continue;
      const along = _v.subVectors(m.pos, P.pos).dot(P.forward);
      if (along < -80 || _v.length() > 1400) Ms.remove(m);
    }
  }

  // ---------------------------------------------------------------- the boss
  startBoss(st) {
    const M = this.mission, w = this.world, L = w.level, T = w.terrain, P = this.player;
    this.setPhase('boss');
    const A = L.rail.arena;
    M.arena = { x: A.x, z: A.z, radius: A.radius, height: A.height, angle: Math.atan2(P.pos.z - A.z, P.pos.x - A.x), from: P.pos.clone(), dir: 1, t: 0 };
    const p = new THREE.Vector3(A.x, T.heightAt(A.x, A.z), A.z);
    const b = w.monsters.spawn('boss', p, { heading: Math.atan2(P.pos.x - p.x, P.pos.z - p.z), nest: p.clone(), emerge: true });
    b.rainTimer = 12; b.barrageTimer = 7; b.summonTimer = 16;
    M.boss = b;
    this.hud.setBoss(b);
    this.hud.message('מלך הלבה עולה!', 'השמידו את שלושת גבישי האש על גבו', 3.2, 'danger');
    this.audio.sample('rumble', { vol: 1, verb: 0.4 }) || this.audio.thud(4, p);
    this.audio.horn();
    this.rig.addTrauma(0.6);
    this.updateObjective();
  }

  updateArena(dt) {
    const M = this.mission, a = M.arena, w = this.world, T = w.terrain, P = this.player;
    a.angle += dt * 0.05 * a.dir;
    const x = a.x + Math.cos(a.angle) * a.radius, z = a.z + Math.sin(a.angle) * a.radius;
    const y = Math.max(T.waterLevel + a.height, T.groundOrWater(x, z) + 14);
    _u.copy(P.pos);
    a.t += dt;
    const k = smoothstep(0, 4, a.t);
    P.pos.set(x, y, z).lerp(a.from, 1 - k);
    P.vel.copy(P.pos).sub(_u).divideScalar(Math.max(dt, 1e-4));
    M.speed = P.vel.length();
    const b = M.boss;
    if (b) w.monsters.center(b, _v).setY(b.pos.y + b.height * 0.5);
    else _v.set(a.x, y, a.z);
    P.forward.subVectors(_v, P.pos).normalize();
    if (b && b.heartExposed) this.updateObjective();
  }

  // ---------------------------------------------------------------- objective line
  updateObjective() {
    const M = this.mission, w = this.world, R = w.rail;
    if (!M) return;
    const stops = R.stops.filter((s) => !s.boss).length;
    if (M.done) {
      M.objTitle = M.win ? 'המשימה הושלמה!' : 'המגן קרס';
      M.objSub = `מארבים שנשברו: ${M.cleared}/${stops}`;
      M.objProgress = M.win ? 1 : M.objProgress;
    } else if (M.phase === 'boss' && M.boss) {
      const left = M.boss.crystals.filter((c) => c && c.alive).length;
      if (left > 0) {
        M.objTitle = `נפצו את גבישי האש: ${3 - left}/3`;
        M.objProgress = (3 - left) / 3;
        M.objSub = 'כוונו לגבישים הזוהרים על הגב';
      } else {
        M.objTitle = 'פגעו בלב הזוהר!';
        M.objProgress = clamp(1 - M.boss.hp / M.boss.maxHp, 0, 1);
        M.objSub = 'טילים עושים הכי הרבה נזק';
      }
    } else if (M.phase === 'ambush') {
      const st = R.stops[M.stop];
      const alive = M.ambush.filter((m) => m.alive).length + M.queue.length;
      M.objTitle = `מארב ${M.stop + 1}/${stops} · גל ${Math.max(1, M.wave + 1)}/${st.waves.length}`;
      M.objSub = `מפלצות במארב: ${alive}`;
      M.objProgress = clamp((M.wave + (alive ? 0.5 : 1)) / st.waves.length, 0, 1);
    } else {
      const st = R.stops[Math.min(M.stop, R.stops.length - 1)];
      const left = Math.max(0, Math.round(st.s - M.s));
      const air = R.airAmount(M.s) > 0.5;
      M.objTitle = st.boss ? 'בדרך אל מלך הלבה' : `בדרך למארב ${M.stop + 1}/${stops}`;
      M.objSub = `${air ? 'בטיסה' : 'בריצה'} · עוד ${formatInt(left)} מ'`;
      M.objProgress = clamp(M.s / R.length, 0, 1);
    }
  }

  // ---------------------------------------------------------------- getting hurt
  playerHit(dmg, from, kind) {
    if (this.state !== 'playing' || !this.mission || this.mission.done) return;
    const P = this.player, M = this.mission;
    if (!P.alive || P.invuln > 0) return;
    P.hp -= dmg;
    M.damage += dmg;
    P.invuln = 0.25;
    M.combo = 1; M.comboTimer = 0;
    this.hitFlash = 1;
    this.hud.damage(from, kind, this.camera);
    this.rig.addTrauma(0.22 + dmg / 40);
    this.audio.hit(kind);
    if (P.hp <= 0) this.shieldDown();
  }

  shieldDown() {
    const P = this.player, M = this.mission, w = this.world;
    M.lives--;
    M.livesLost++;
    this.hud.setLives(M.lives, LIVES);
    if (M.lives <= 0) {
      P.hp = 0;
      P.alive = false;
      w.fx.explosion(_v.copy(P.pos).addScaledVector(P.forward, 8), 1.4);
      this.audio.explosion(2.2, P.pos);
      this.rig.addTrauma(1);
      this.hud.message('המגן קרס', 'נסו שוב, ירו קודם בקרובים', 2.6, 'danger');
      this.lose();
      return;
    }
    // the shield's last breath: a blast that throws everything near back
    w.monsters.blast(P.pos, 60, 200);
    for (const s of w.weapons.shots) if (s.p.distanceTo(P.pos) < 120) s.dead = true;
    w.fx.explosion(_v.copy(P.pos).addScaledVector(P.forward, 10).setY(P.pos.y - 1), 1.1);
    w.fx.sparks(_v, 2.4, 0x80e0ff);
    P.hp = P.maxHp;
    P.invuln = 2;
    this.hud.message('המגן התרוקן!', M.lives === 1 ? 'נשארו חיים אחרונים' : `נשארו ${M.lives} חיים`, 2.4, 'danger');
    this.audio.explosion(1.6, P.pos);
    this.rig.addTrauma(0.8);
  }

  win() {
    const M = this.mission;
    if (M.done) return;
    M.done = true;
    M.win = true;
    M.endTimer = 3.4;
    this.player.invuln = 99;
    this.setPhase('done');
    this.hud.message('המשימה הושלמה!', M.boss ? 'מלך הלבה הובס' : 'כל המארבים נשברו', 3, 'gold');
  }

  lose() {
    const M = this.mission;
    M.done = true;
    M.win = false;
    M.endTimer = 2.8;
    this.setPhase('done');
  }

  finish() {
    const M = this.mission, L = this.world.level, W = this.world;
    this.state = 'results';
    this.input.enabled = false;
    this.input.setTouchVisible(false);
    document.body.classList.remove('playing');
    this.audio.alarm(false);
    this.audio.cannon(false);
    this.guns.show(false);
    let stars = 0;
    if (M.win) {
      stars = 1;
      if (M.livesLost <= 1) stars = 2;
      if (M.livesLost === 0 && M.damage < 150) stars = 3;
    }
    const rec = this.progress.levels[L.id] || { stars: 0, best: 0 };
    const newBest = M.score > (rec.best || 0) && M.score > 0;
    this.progress.levels[L.id] = { stars: Math.max(rec.stars || 0, stars), best: Math.max(rec.best || 0, M.score) };
    save('progress', this.progress);
    this.menus.renderResults({
      level: L, win: !!M.win, stars, score: M.score, best: rec.best, newBest, time: M.time, kills: M.kills,
      accuracy: W.weapons.accuracy, missiles: M.missiles, bestCombo: M.bestCombo, deaths: M.livesLost,
      cleared: M.cleared, stops: W.rail.stops.filter((s) => !s.boss).length,
      hasNext: LEVELS.indexOf(L) < LEVELS.length - 1,
    });
    this.menus.reset('results');
    this.audio.fanfare(!!M.win);
  }

  collect(kind, pos) {
    const P = this.player, M = this.mission, W = this.world.weapons;
    if (!M || this.state !== 'playing') return;
    if (kind === 'repair') P.hp = Math.min(P.maxHp, P.hp + 25);
    if (kind === 'ammo') { P.missilesLeft = MISSILE.max; W.regen = 0; }
    if (kind === 'cool') { W.coolTimer = 10; W.heat = 0; W.overheated = false; }
    M.score += 50;
    this.hud.toast(`${PICKUPS[kind].name}: ${PICKUPS[kind].text}`, '#' + new THREE.Color(PICKUPS[kind].color).getHexString());
    this.audio.pickup();
    this.world.fx.sparks(pos, 1.4, PICKUPS[kind].color);
  }

  shakeAt(pos, amount) {
    const d = pos.distanceTo(this.camera.position);
    this.rig.addTrauma(clamp(amount * 0.35 / (1 + d / 90), 0, 0.6));
  }

  // a heavy footfall while running on the ground
  footstep(side, amp) {
    if (this.state !== 'playing') return;
    this.audio.sample('thud', { vol: 0.08 + amp * 0.06, pan: side * 0.25, rate: 1.7 + Math.random() * 0.2, verb: 0.05, filter: 900 });
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
    this.renderFrame(dt);
  }

  updateAttract(dt) {
    const w = this.world, R = w.rail, ap = this.ap;
    if (this.state === 'menu') {
      ap.t += dt;
      if (ap.kind === 'ride') {
        ap.s += dt * 30;
        if (ap.s > R.length - 60) { ap.s = 0; this.rig.snapTo(R.pointAt(0, _v), R.lookAt(0, _w)); }
        const p = R.pointAt(ap.s, _v);
        p.y = Math.max(p.y, R.groundAt(ap.s) + 6) + 12;
        this.rig.update(dt, { pos: p, dir: R.lookAt(ap.s, _w), air: 1, speed: 30 });
        if (ap.t > 14) {
          // a closer look at a monster near the camera
          let best = null, bd = 700;
          for (const m of w.monsters.list) {
            if (!m.alive || m.spec.flies) continue;
            const d = m.pos.distanceTo(p);
            if (d < bd) { bd = d; best = m; }
          }
          ap.t = 0;
          if (best) {
            ap.kind = 'orbit';
            ap.target = best;
            this.rig.setOrbit(w.monsters.center(best, new THREE.Vector3()), Math.max(40, best.height * 5 + best.radius * 4), Math.max(10, best.height * 1.1));
          }
        }
      } else {
        if (ap.target && ap.target.alive) w.monsters.center(ap.target, this.rig.orbit.center);
        this.rig.update(dt, { terrain: w.terrain });
        if (ap.t > 9) {
          ap.t = 0;
          ap.kind = 'ride';
          this.rig.snapTo(R.pointAt(ap.s, _v), R.lookAt(ap.s, _w));
        }
      }
    } else {
      this.rig.update(dt, { pos: this.rig.pos, dir: this.rig.dir, air: 1, speed: 0 });
    }
    const far = { pos: _u.set(0, -1e5, 0), vel: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), alive: false, invuln: 1 };
    w.monsters.update(dt, this.time, far);
    w.fx.update(dt, this.time, w.terrain);
    w.pickups.update(dt, this.time);
    this.audio.engine({ active: false, alive: false, throttle: 0, speed: 0 });
    this.audio.setListener(this.camera.position, _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));
    this.audio.update(dt);
    this.audio.setIntensity(0.3);
  }

  updatePlaying(dt) {
    const w = this.world, P = this.player, M = this.mission, T = w.terrain, R = w.rail;
    const input = this.input.poll(dt);
    if (input.pause) { this.pause(); return; }
    if (input.mute) { this.muted = !this.muted; this.audio.setVolumes({ master: this.muted ? 0 : this.settings.master }); this.hud.toast(this.muted ? 'הצליל כבוי' : 'הצליל פועל'); }
    if (this.input.lastDevice === 'touch' && this.settings.touch === 'auto' && !document.body.classList.contains('touch')) this.updateTouch();

    M.time += M.done ? 0 : dt;
    M.comboTimer = Math.max(0, M.comboTimer - dt);
    if (M.comboTimer <= 0) M.combo = 1;
    M.armorToast = Math.max(0, M.armorToast - dt);
    P.invuln = Math.max(0, P.invuln - dt);

    // ride the track (or circle the boss)
    this.updateRide(dt);
    const boss = M.phase === 'boss' || (M.phase === 'done' && M.arena);
    const air = boss ? 1 : R.airAmount(M.s);
    const dir = boss ? P.forward : R.lookAt(M.s, _w);
    this.rig.update(dt, { pos: P.pos, dir, aim: input.aim, air, speed: M.speed, dirRate: boss ? 2.5 : 4.5 });

    // aim and shoot
    const W = w.weapons;
    const canFire = P.alive && !M.done && M.phase !== 'intro';
    const touch = input.device === 'touch';
    const assistPx = Math.min(window.innerWidth, window.innerHeight) * (touch ? 0.1 : 0.06) * this.settings.assist;
    W.updateAim(this.camera, input.aim, assistPx, canFire);
    W.updateCannon(dt, input.fire && canFire, this.guns, this.camera);
    if (input.missile && canFire) W.launchMissile(P, this.camera);
    w.monsters.update(dt, this.time, P);
    W.update(dt, this.time, P);
    w.pickups.update(dt, this.time);
    w.fx.update(dt, this.time, T);
    this.guns.update(dt, this.camera, {
      aimDir: W.aimDir, aimDist: W.aimDist, firing: input.fire && canFire && !W.overheated, heat: W.heat, bob: this.rig.bob, time: this.time,
    });

    if (M.done) {
      M.endTimer -= dt;
      if (M.endTimer <= 0) { this.finish(); return; }
    }

    // sound
    const A = this.audio;
    A.engine({ active: true, alive: P.alive, throttle: 0.25 + air * 0.45 + M.speed / 120, speed: M.speed * 4, boosting: false, cockpit: true });
    A.setListener(this.camera.position, _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));
    A.alarm(P.alive && !M.done && P.hp < P.maxHp * 0.25);
    let busy = 0;
    for (const m of w.monsters.list) if (m.alive && m.pos.distanceTo(P.pos) < 300) busy += m.spec.boss ? 4 : m.height > 5 ? 1 : 0.4;
    A.setIntensity(clamp(0.3 + busy * 0.1 + (M.phase === 'ambush' || M.phase === 'boss' ? 0.3 : 0), 0.3, 1));
    A.update(dt);

    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    const g = this.renderer.grade.uniforms;
    g.uHit.value = this.hitFlash;
    g.uLowHp.value = P.alive && P.hp < P.maxHp * 0.3 ? 1 : 0;
    g.uBoost.value = 0;

    this.hud.update(dt, {
      player: P, weapons: W, monsters: w.monsters, camera: this.camera, pickups: w.pickups, aim: input.aim,
      game: { score: M.score, combo: M.combo, objTitle: M.objTitle, objSub: M.objSub, objProgress: M.objProgress },
      fps: this.settings.fps ? this.fps : 0, showCrosshair: !M.done,
    });
  }

  renderFrame(dt) {
    const w = this.world;
    w.update(dt, this.time, this.camera, this.camera.position);
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
