import './styles.css';
import * as THREE from 'three';
import { Engine, VERSION } from './engine/Engine.js';
import { Materials } from './engine/render/Materials.js';
import { Terrain } from './engine/world/Terrain.js';
import { Water } from './engine/world/Water.js';
import { Vegetation } from './engine/world/Vegetation.js';
import { Particles } from './engine/fx/Particles.js';
import { AudioEngine } from './engine/audio/AudioEngine.js';
import { CameraRig } from './engine/camera/CameraRig.js';
import { registerPrefabs } from './engine/world/Prefabs.js';
import { Showcase } from './demo/Showcase.js';
import { Editor } from './editor/Editor.js';
import { Component, Entity } from './engine/core/Entity.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(raw).replace(/ANGLE \((.*)\)/, '$1').replace(/Direct3D.*$/, '').replace(/, ?$/, '').slice(0, 60);
  } catch {
    return '';
  }
}

function webgl2Available() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  const loader = document.getElementById('loader');
  const bar = loader.querySelector('.bar i');
  const stepEl = loader.querySelector('.step');
  const progress = async (p, text) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    stepEl.textContent = text;
    await nextFrame();
  };

  if (!webgl2Available()) throw new Error('הדפדפן הזה לא תומך ב־WebGL 2. נסו Chrome, Edge, Firefox או Safari בגרסה עדכנית.');

  await progress(0.03, 'טוען גופנים…');
  if (document.fonts) {
    await Promise.race([Promise.all([document.fonts.load('700 120px "Karantina"'), document.fonts.load('600 40px "IBM Plex Sans Hebrew"')]).catch(() => {}), wait(2500)]);
  }

  await progress(0.06, 'מאתחל את המנוע…');
  const canvas = document.getElementById('viewport');
  // Optional quality override: #low / #medium / #high / #ultra (or ?quality=…).
  const forced = (location.hash.slice(1) || new URLSearchParams(location.search).get('quality') || '').toLowerCase();
  const engine = new Engine(canvas, { quality: ['low', 'medium', 'high', 'ultra'].includes(forced) ? forced : undefined });
  // Exposed for the browser console and the in-editor script box.
  const app = { engine, version: VERSION, gpuName: gpuName(engine.renderer), THREE, Component, Entity };
  window.shimotron = app;

  await progress(0.14, 'אופה טקסטורות פרוצדורליות על ה־GPU…');
  const materials = new Materials(engine);
  engine.materials = materials;
  materials.build();

  await progress(0.3, 'מפסל את האי: הרים, חופים ושבילים…');
  const terrain = new Terrain(engine);
  engine.scene.add(terrain.build(materials));
  terrain.addPhysics(engine.physics);

  await progress(0.44, 'ממלא את האוקיינוס…');
  const water = new Water(engine, terrain, materials);

  await progress(0.52, 'שותל עצים, דשא ופרחים…');
  const vegetation = new Vegetation(engine, terrain, materials);
  engine.scene.add(vegetation.build());
  vegetation.addPhysics(engine.physics);

  engine.particles = new Particles(engine, materials);
  engine.audio = new AudioEngine(engine);
  registerPrefabs(engine);
  app.world = { terrain, water, vegetation };

  // Per-frame systems (order matters: materials read last frame's exposure).
  engine.addSystem({ update: () => materials.update(engine.atmosphere.exposure, engine.time.elapsed) });
  // Glass refracts only near the plaza and on high/ultra; elsewhere it is cheap tinted glass.
  engine.addSystem({
    update: () => {
      const q = engine.quality;
      const d = engine.camera.position.distanceTo(new THREE.Vector3(0, 6, 0));
      materials.setRefraction((q.presetName === 'ultra' && d < 90) || (q.presetName === 'high' && d < 34));
      engine.renderer.transmissionResolutionScale = q.presetName === 'ultra' ? 1 : 0.5;
    },
  });
  engine.addSystem(water);
  engine.addSystem(vegetation);
  engine.addSystem({ update: (dt, simDt) => engine.particles.update(simDt) });
  engine.addSystem({ update: (dt) => engine.audio.update(dt) });
  engine.addSystem({
    update: () => {
      for (const e of engine.entities) {
        if (!e.sound) continue;
        const p = e.object3D.position;
        e.sound.panner.positionX.value = p.x;
        e.sound.panner.positionY.value = p.y;
        e.sound.panner.positionZ.value = p.z;
      }
    },
  });

  await progress(0.64, 'בונה את רחבת שימוטרון…');
  const rig = new CameraRig(engine);
  rig.groundHeight = (x, z) => terrain.heightAt(x, z);
  engine.cameraRig = rig;
  app.rig = rig;
  const showcase = new Showcase(engine, app.world);
  app.showcase = showcase;
  showcase.build();
  const P = showcase.P;
  engine.camera.position.set(31, P + 11, 36);
  rig.orbit.target.set(0, P + 3.2, 0);
  rig.orbit.update();

  // Physics feedback: sparks + dust on hard hits, footsteps by surface.
  let lastFx = 0;
  engine.events.on('impact', (e) => {
    const now = performance.now();
    if (e.speed > 4 && now - lastFx > 60) {
      lastFx = now;
      engine.particles.impact(e.point, null, Math.min(1.6, e.speed / 9));
    }
  });
  engine.events.on('footstep', ({ position, speed }) => {
    let surface = 'grass';
    const dPlaza = Math.hypot(position.x - terrain.plaza.x, position.z - terrain.plaza.z);
    if (position.y < 0.4) surface = 'water';
    else if (dPlaza < terrain.plaza.radius + 1.5) surface = 'stone';
    else if (position.y > 1.3 && terrain.heightAt(position.x, position.z) < 0.5) surface = 'wood';
    else {
      const w = terrain.weightsAt(position.x, position.z);
      if (w.sand > 0.5) surface = 'sand';
      else if (w.rock > 0.5) surface = 'stone';
    }
    engine.audio.step(surface, speed);
  });
  engine.events.on('entity:remove', (e) => {
    if (!e.sound) return;
    e.sound.gain.disconnect();
    const i = engine.audio.sources.indexOf(e.sound);
    if (i >= 0) engine.audio.sources.splice(i, 1);
  });

  await progress(0.78, 'מקמפל שיידרים…');
  try {
    await Promise.race([engine.renderer.compileAsync(engine.scene, engine.camera), wait(12000)]);
  } catch {
    /* compileAsync is an optimisation; first frames compile anything left */
  }
  engine.atmosphere.update(0);
  engine.frame();

  await progress(0.92, 'מכין את העורך…');
  const editor = new Editor(app);
  app.editor = editor;
  editor.build();
  engine.start();

  await progress(1, `מוכן · ${engine.entities.length} אובייקטים · ${engine.physics.world.bodies.length} גופים פיזיקליים`);
  const enter = loader.querySelector('.enter');
  enter.hidden = false;
  enter.focus();
  const go = () => {
    engine.audio.unlock();
    for (const e of engine.entities) if (e.kind === 'fire' && !e.sound) e.sound = engine.audio.addFire(e.object3D.position);
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 700);
    editor.toast('ברוכים הבאים לשימוטרון — לחצו ? לקיצורי מקלדת', 'bolt');
  };
  enter.addEventListener('click', go, { once: true });
  return app;
}

boot().catch((err) => {
  console.error(err);
  const loader = document.getElementById('loader');
  const box = loader && loader.querySelector('.err');
  if (box) {
    box.hidden = false;
    box.textContent = `שגיאה בטעינת המנוע: ${err && err.message ? err.message : err}`;
  }
});

export { THREE };
