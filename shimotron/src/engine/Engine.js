import * as THREE from 'three';
import { Events } from './core/Events.js';
import { Input } from './core/Input.js';
import { Quality } from './core/Quality.js';
import { Physics } from './physics/Physics.js';
import { installHeightFog } from './render/HeightFog.js';
import { Atmosphere } from './render/Atmosphere.js';
import { Pipeline } from './render/Pipeline.js';

export const VERSION = '1.0.0';

const _ray = new THREE.Raycaster();

/**
 * Shimotron engine root. Owns the renderer, scene, camera, clock and
 * every subsystem; runs the frame loop:
 *   input → fixed-step physics (interpolated) → components → systems →
 *   atmosphere → render pipeline → stats.
 */
export class Engine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.events = new Events();
    this.time = { elapsed: 0, delta: 0, frame: 0, scale: 1 };

    installHeightFog();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // done in the pipeline
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // refreshed once per frame by the pipeline
    this.renderer.info.autoReset = false;

    this.quality = new Quality(this, options.quality);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8899aa, 0.0015);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 6000);
    this.camera.position.set(34, 16, 42);
    this.scene.add(this.camera);

    this.input = new Input(canvas);
    this.physics = new Physics(this);
    this.entities = [];
    this.systems = []; // objects with update(dt) / fixedUpdate(dt)
    this.paused = false; // freezes simulation (physics + components), rendering continues
    this.stats = { fps: 0, ms: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, bodies: 0 };
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._last = performance.now();
    this._running = false;
    this.prefabs = new Map();
    this.cameraRig = null;

    this.atmosphere = new Atmosphere(this);
    this.pipeline = new Pipeline(this);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ---------------------------------------------------------------- entities

  add(entity) {
    entity.engine = this;
    if (!entity.object3D.parent) this.scene.add(entity.object3D);
    this.entities.push(entity);
    for (const c of entity.components) c.onAttach && c.onAttach(this);
    this.events.emit('entity:add', entity);
    return entity;
  }

  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i < 0) return;
    this.entities.splice(i, 1);
    for (const c of entity.components) c.onDetach && c.onDetach(this);
    if (entity.body) this.physics.removeBody(entity.body);
    entity.object3D.removeFromParent();
    entity.object3D.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    entity.engine = null;
    this.events.emit('entity:remove', entity);
  }

  find(name) {
    return this.entities.find((e) => e.name === name) || null;
  }

  addSystem(system) {
    this.systems.push(system);
    return system;
  }

  /** Registers a prefab factory: (engine, params) => Entity. */
  registerPrefab(kind, info) {
    this.prefabs.set(kind, info);
  }

  spawn(kind, params = {}) {
    const info = this.prefabs.get(kind);
    if (!info) throw new Error(`Unknown prefab: ${kind}`);
    const entity = info.create(this, { ...info.defaults, ...params });
    entity.kind = kind;
    entity.params = { ...info.defaults, ...params };
    entity.serializable = true;
    entity.group = entity.group || 'אובייקטים';
    this.add(entity);
    return entity;
  }

  // ------------------------------------------------------------------ picking

  /** Ray pick against entity visuals. ndc: {x,y} in [-1,1]. */
  pick(ndc, options = {}) {
    _ray.setFromCamera(ndc, this.camera);
    _ray.far = options.far || 2000;
    const targets = options.any ? this.scene.children.filter((o) => o.visible && o.name !== 'Sky' && o.name !== 'Stars' && o.name !== 'Moon') : this.entities.filter((e) => e.selectable && e.object3D.visible).map((e) => e.object3D);
    const hits = _ray.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object.userData.noPick) continue;
      if (!h.object.visible) continue;
      let o = h.object;
      while (o && !o.userData.entity) o = o.parent;
      return { entity: o ? o.userData.entity : null, point: h.point, distance: h.distance, object: h.object, face: h.face };
    }
    return null;
  }

  // -------------------------------------------------------------------- loop

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const dpr = this.quality.dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (this.pipeline) this.pipeline.setSize(pw, ph);
    this.events.emit('resize', { width: w, height: h, pixelWidth: pw, pixelHeight: ph });
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  frame() {
    const now = performance.now();
    const rawDt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    const dt = rawDt * this.time.scale;
    this.time.delta = dt;
    this.time.elapsed += dt;
    this.time.frame++;

    this.input.update();
    const simDt = this.paused ? 0 : dt;

    if (simDt > 0) {
      this.physics.step(simDt);
      this.physics.syncEntities(this.entities);
    }
    for (const e of this.entities) {
      for (const c of e.components) if (c.enabled && c.update) c.update(simDt, this);
    }
    for (const s of this.systems) if (s.update) s.update(dt, simDt);
    if (this.cameraRig) this.cameraRig.update(rawDt);
    this.atmosphere.update(dt);
    this.events.emit('update', { dt, simDt, rawDt });

    this.renderer.info.reset();
    this.renderer.shadowMap.needsUpdate = true;
    this.pipeline.render(dt);
    this._collectStats(rawDt);
    this.quality.sample(rawDt);
    this.input.endFrame();
    this.events.emit('frame', this.stats);
  }

  _collectStats(rawDt) {
    const info = this.renderer.info;
    this._fpsAcc += rawDt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.stats.fps = this._fpsFrames / this._fpsAcc;
      this.stats.ms = (this._fpsAcc / this._fpsFrames) * 1000;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }
    this.stats.calls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.stats.programs = info.programs ? info.programs.length : 0;
    this.stats.bodies = this.physics.world.bodies.length;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.renderer.dispose();
  }
}
