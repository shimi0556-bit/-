import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Entity } from '../engine/core/Entity.js';
import { Emitter } from '../engine/fx/Particles.js';
import { Spin, Bob, EmitterSocket, Lifetime, mergeByMaterial } from '../engine/world/Prefabs.js';
import { textToShapes } from '../engine/render/TextShape.js';

const DISPLAY_FONT = '"Karantina", "Secular One", "Rubik", "Arial Hebrew", "Noto Sans Hebrew", "FreeSans", sans-serif';
const UI_FONT = '"IBM Plex Sans Hebrew", "Noto Sans Hebrew", "Arial Hebrew", "FreeSans", sans-serif';

/**
 * The Shimotron showcase island: everything here is authored with the
 * engine's public API (entities, prefabs, materials, particles) — it is
 * both the demo and the reference for building your own scenes.
 */
export class Showcase {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.terrain = world.terrain;
    this.P = this.terrain.plaza.height + 0.25; // plaza walking height
    this.projectiles = [];
  }

  build() {
    this._plaza();
    this._core();
    this._logo();
    this._gallery();
    this._playground();
    this._campfire();
    this._lamps();
    this._ruins();
    this._pier();
  }

  entity(name, object, opts = {}) {
    const e = new Entity(name, object, { locked: opts.locked, icon: opts.icon, selectable: opts.selectable });
    e.group = opts.group || 'סביבה';
    return e;
  }

  // ------------------------------------------------------------------ plaza

  _plaza() {
    const eng = this.engine;
    const L = eng.materials.lib;
    const t = this.terrain.plaza;
    const P = this.P;
    const g = new THREE.Group();
    // Top: tiled disk with world-scaled UVs (1 m tiles).
    const disk = new THREE.CylinderGeometry(t.radius, t.radius + 0.35, 0.9, 160, 1);
    const pos = disk.attributes.position;
    const nrm = disk.attributes.normal;
    const uv = disk.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      if (nrm.getY(i) > 0.9) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
      else uv.setXY(i, uv.getX(i) * 40, uv.getY(i) * 0.25);
    }
    const top = new THREE.Mesh(disk, L.plaza);
    top.position.y = P - 0.45;
    top.receiveShadow = true;
    g.add(top);
    // Stepped stone rim.
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(t.radius + 1.3, t.radius + 1.9, 0.7, 160, 1, true), L.stone);
    rim.position.y = P - 0.62;
    rim.receiveShadow = true;
    g.add(rim);
    const rimTop = new THREE.Mesh(new THREE.RingGeometry(t.radius + 0.3, t.radius + 1.3, 160, 1).rotateX(-Math.PI / 2), L.stone);
    rimTop.position.y = P - 0.27;
    rimTop.receiveShadow = true;
    g.add(rimTop);
    // Inlaid neon rings and dark metal spokes.
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(22, 0.07, 8, 320).rotateX(Math.PI / 2), L.neonAmber);
    ringOuter.position.y = P - 0.02;
    g.add(ringOuter);
    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.06, 8, 160).rotateX(Math.PI / 2), L.neonCyan);
    ringInner.position.y = P - 0.02;
    g.add(ringInner);
    const spokes = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = new THREE.BoxGeometry(15.2, 0.05, 0.09);
      b.translate(14.2, 0, 0);
      b.rotateY(a);
      spokes.push(b);
    }
    const spokeMesh = new THREE.Mesh(mergeGeometries(spokes), L.brass);
    spokeMesh.position.y = P - 0.015;
    spokeMesh.receiveShadow = true;
    g.add(spokeMesh);
    const e = this.entity('רחבת האבן', g, { locked: true, icon: 'plaza', group: 'סביבה' });
    e.selectable = true;
    eng.add(e);
    eng.physics.addStaticCylinder(new THREE.Vector3(t.x, P - 0.45, t.z), t.radius, 0.9);
    eng.physics.addStaticCylinder(new THREE.Vector3(t.x, P - 0.62, t.z), t.radius + 1.9, 0.7);
  }

  // ------------------------------------------------------------ hero core

  _core() {
    const eng = this.engine;
    const L = eng.materials.lib;
    const P = this.P;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.5, 0.6, 6), L.panels);
    base.position.y = P + 0.3;
    g.add(base);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.5, 6), L.panels);
    step.position.y = P + 0.85;
    g.add(step);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 2.4, 6), L.darkMetal);
    column.position.y = P + 2.3;
    g.add(column);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.35, 6), L.panels);
    collar.position.y = P + 3.62;
    g.add(collar);
    for (const [y, r] of [
      [P + 0.62, 3.2],
      [P + 1.12, 2.4],
      [P + 3.8, 1.62],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6), L.neonCyan);
      ring.position.y = y;
      g.add(ring);
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    mergeByMaterial(g);
    const pedestal = this.entity('כן הליבה', g, { locked: true, icon: 'pillar', group: 'ליבת שימוטרון' });
    eng.add(pedestal);
    eng.physics.addStaticCylinder(new THREE.Vector3(0, P + 0.55, 0), 3.4, 1.1);
    eng.physics.addStaticCylinder(new THREE.Vector3(0, P + 2.4, 0), 1.4, 2.8);

    // Floating crystal: refractive shell + emissive heart + orbiting rings.
    const crystal = new THREE.Group();
    crystal.position.set(0, P + 6.4, 0);
    const shellGeo = new THREE.OctahedronGeometry(1, 1);
    const sp = shellGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i);
      sp.setXYZ(i, sp.getX(i) * 0.95, y * 1.9, sp.getZ(i) * 0.95);
    }
    shellGeo.computeVertexNormals();
    const shellMat = L.glass.clone();
    shellMat.iridescence = 0.6;
    shellMat.iridescenceIOR = 1.4;
    shellMat.attenuationColor = new THREE.Color(0x7fe6ff);
    shellMat.attenuationDistance = 1.2;
    shellMat.flatShading = true;
    eng.materials.trackRefractive(shellMat);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.castShadow = true;
    crystal.add(shell);
    const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0).scale(1, 1.8, 1), L.core);
    crystal.add(heart);
    const ringMats = [L.gold, L.chrome, L.copper];
    const rings = [];
    ringMats.forEach((m, i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.9 + i * 0.35, 0.05 + i * 0.01, 12, 160), m);
      r.rotation.set(Math.PI / 2 + i * 0.5, i * 0.8, 0);
      r.castShadow = true;
      const pivot = new THREE.Group();
      pivot.add(r);
      crystal.add(pivot);
      rings.push(pivot);
    });
    const light = new THREE.PointLight(0x7fe6ff, 3, 26, 2);
    crystal.add(light);
    const core = this.entity('ליבת שימוטרון', crystal, { locked: true, icon: 'orb', group: 'ליבת שימוטרון' });
    core.addComponent(new Bob(0.35, 0.8));
    core.addComponent(new Spin(new THREE.Vector3(0, 1, 0), 0.35, shell));
    core.addComponent(new Spin(new THREE.Vector3(0, 1, 0), -0.9, heart));
    rings.forEach((r, i) => core.addComponent(new Spin(new THREE.Vector3(i === 1 ? 1 : 0, 1, i === 2 ? 1 : 0), 0.5 + i * 0.3, r)));
    core.addComponent({
      enabled: true,
      update: (dt, en) => {
        light.intensity = 2.5 + en.atmosphere.nightFactor * 6 + Math.sin(en.time.elapsed * 2.2) * 0.4;
      },
    });
    const motes = new Emitter(eng.particles.systems.glow, {
      rate: 26,
      radius: 2.2,
      spread: Math.PI,
      speed: [0.1, 0.45],
      life: [2.5, 4.5],
      size0: [0.05, 0.1],
      size1: [0.01, 0.03],
      color0: [0.45, 0.9, 1.0, 1],
      color1: [0.8, 0.5, 1.0, 0],
      turbulence: 0.9,
      gravity: -0.05,
      intensity: 10,
    });
    motes.localOffset = new THREE.Vector3(0, -0.5, 0);
    core.addComponent(new EmitterSocket([motes]));
    eng.add(core);
    this.core = core;
  }

  // ---------------------------------------------------------- 3D logotype

  _logo() {
    const eng = this.engine;
    const L = eng.materials.lib;
    const P = this.P;
    const group = new THREE.Group();
    let text;
    try {
      text = textToShapes('שימוטרון', { font: `700 260px ${DISPLAY_FONT}`, direction: 'rtl', height: 4.2, tolerance: 0.9 });
    } catch (err) {
      console.warn('[Shimotron] logo tracing failed', err);
    }
    let width = 14;
    if (text && text.shapes.length) {
      const geo = new THREE.ExtrudeGeometry(text.shapes, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.045, bevelSegments: 3, curveSegments: 2 });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -0.3);
      width = bb.max.x - bb.min.x;
      // Backlit sign: warm metal faces that glow after dusk, dark brushed sides.
      const face = new THREE.MeshStandardMaterial({ name: 'שלט', color: 0xf3e3c3, metalness: 0.55, roughness: 0.28, emissive: 0xffc88a, emissiveIntensity: 0 });
      eng.materials.trackEmissive(face, 0.05);
      const sides = L.darkMetal;
      const letters = new THREE.Mesh(geo, [face, sides]);
      group.userData.signFace = face;
      letters.castShadow = true;
      letters.receiveShadow = true;
      letters.position.y = 1.0;
      group.add(letters);
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 2.4, 1.0, 2.2), L.marble);
    plinth.position.y = 0.5;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width + 2.0, 0.06, 0.06), L.neonAmber);
    strip.position.set(0, 0.82, 1.12);
    group.add(strip);
    // Engraved latin sub-title plate.
    const plate = this._label('SHIMOTRON · ENGINE', { w: 1024, h: 96, font: `600 58px ${UI_FONT}`, color: '#e8ecf3', bg: '#14181f', letterSpacing: 14 });
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.6), plate);
    plateMesh.position.set(0, 0.45, 1.111);
    group.add(plateMesh);
    group.position.set(0, P, -21);
    const e = this.entity('לוגו שימוטרון', group, { icon: 'text', group: 'סביבה' });
    if (group.userData.signFace) {
      const face = group.userData.signFace;
      e.addComponent({ enabled: true, update: (dt, en) => en.materials.setEmissiveBase(face, 0.05 + en.atmosphere.nightFactor * 2.2) });
    }
    eng.add(e);
    eng.physics.addBody(e, { mass: 0, shape: 'box' });
  }

  _label(text, { w = 512, h = 128, font, color = '#1b1d22', bg = '#d9d4ca', letterSpacing = 0 } = {}) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = color;
    g.font = font || `600 ${Math.round(h * 0.46)}px ${UI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${letterSpacing}px`;
    g.direction = /[֐-׿]/.test(text) ? 'rtl' : 'ltr';
    g.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.2 });
  }

  // ------------------------------------------------------- material gallery

  _gallery() {
    const eng = this.engine;
    const L = eng.materials.lib;
    const P = this.P;
    const items = [
      ['gold', 'זהב'],
      ['chrome', 'כרום'],
      ['copper', 'נחושת מוברשת'],
      ['carPaint', 'צבע מכונית'],
      ['glass', 'זכוכית'],
      ['velvet', 'קטיפה'],
      ['pearl', 'פנינה'],
      ['ceramic', 'קרמיקה'],
    ];
    const pedestalGeo = new THREE.CylinderGeometry(0.62, 0.72, 1.15, 48);
    const sphereGeo = new THREE.SphereGeometry(0.58, 64, 48);
    const plateGeo = new THREE.PlaneGeometry(1.1, 0.3);
    items.forEach(([key, label], i) => {
      const a = THREE.MathUtils.degToRad(-58 + (i / (items.length - 1)) * 116);
      const r = 16.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const g = new THREE.Group();
      const ped = new THREE.Mesh(pedestalGeo, L.marble);
      ped.position.y = 0.575;
      ped.castShadow = true;
      ped.receiveShadow = true;
      g.add(ped);
      const s = new THREE.Mesh(sphereGeo, L[key]);
      s.position.y = 1.15 + 0.6;
      s.castShadow = true;
      s.receiveShadow = true;
      g.add(s);
      const plate = new THREE.Mesh(plateGeo, this._label(label, { w: 512, h: 140, bg: '#1a1d23', color: '#f1e6cf' }));
      plate.position.set(0, 0.8, 0.66);
      plate.rotation.x = -0.12;
      g.add(plate);
      g.position.set(x, P, z);
      g.lookAt(0, P, 0);
      const e = this.entity(`חומר · ${label}`, g, { icon: 'sphere', group: 'גלריית חומרים' });
      e.galleryMaterial = key;
      eng.add(e);
      eng.physics.addBody(e, { mass: 0, shape: 'box' });
    });
  }

  // ------------------------------------------------------ physics playground

  _playground() {
    const eng = this.engine;
    const P = this.P;
    const add = (kind, params, group = 'מגרש פיזיקה') => {
      const e = eng.spawn(kind, params);
      e.group = group;
      e.serializable = false; // part of the built-in scene
      return e;
    };
    // Crate pyramid.
    const s = 1.2;
    const cx = -15;
    const cz = -8;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4 - row; i++) {
        add('crate', { position: [cx + (i - (3 - row) / 2) * (s + 0.02), P + s / 2 + row * s + 0.01, cz], size: s });
      }
    }
    // Domino spiral.
    const n = 28;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = t * Math.PI * 1.35 + 0.3;
      const rr = 3.2 + t * 4.5;
      const x = -9 + Math.cos(a) * rr;
      const z = 11 + Math.sin(a) * rr;
      const hue = t;
      const color = new THREE.Color().setHSL(0.08 + hue * 0.55, 0.65, 0.55).getStyle();
      add('domino', { position: [x, P + 0.56, z], rotation: [0, -THREE.MathUtils.radToDeg(a), 0], color });
    }
    // Barrels.
    add('barrel', { position: [-21, P + 0.66, 1], color: '#8a2b1f' });
    add('barrel', { position: [-22.2, P + 0.66, 2.2], color: '#1f5a8a' });
    add('barrel', { position: [-21.4, P + 1.98, 1.6], color: '#d4a017' });
    // Ball rack.
    const colors = ['#ff5a3c', '#ffb020', '#39d9ff', '#7a5cff', '#3ddc97'];
    colors.forEach((c, i) => add('ball', { position: [-19 + i * 1.1, P + 0.45, -14], radius: 0.45, color: c }));
    add('knot', { position: [-12.5, P + 0.9, -13], size: 1.3 });
  }

  _campfire() {
    const eng = this.engine;
    const P = this.P;
    const fire = eng.spawn('fire', { position: [13, P, 15] });
    fire.group = 'מדורה';
    fire.serializable = false;
    const L = eng.materials.lib;
    const benchGeo = new THREE.CylinderGeometry(0.28, 0.3, 2.6, 12).rotateZ(Math.PI / 2);
    for (const [x, z, ry] of [
      [13, 12.4, 0],
      [15.8, 16.2, 1.1],
      [10.3, 16.6, -1.05],
    ]) {
      const m = new THREE.Mesh(benchGeo, L.bark);
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.set(x, P + 0.28, z);
      m.rotation.y = ry;
      const e = this.entity('ספסל עץ', m, { icon: 'crate', group: 'מדורה' });
      eng.add(e);
      eng.physics.addBody(e, { mass: 0, shape: 'box' });
    }
    this.fire = fire;
  }

  _lamps() {
    const eng = this.engine;
    const P = this.P;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 8;
      const r = 28.6;
      const deg = THREE.MathUtils.radToDeg(Math.PI - a);
      const lamp = eng.spawn('lamp', { position: [Math.cos(a) * r, P, Math.sin(a) * r], rotation: [0, deg, 0] });
      lamp.group = 'תאורה';
      lamp.serializable = false;
    }
  }

  _ruins() {
    const eng = this.engine;
    const t = this.terrain;
    const cx = -58;
    const cz = -46;
    const h0 = t.heightAt(cx, cz);
    // Foundation slab levelled into the hillside.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 10), eng.materials.lib.stone);
    slab.position.set(cx, h0 - 0.35, cz);
    slab.receiveShadow = true;
    slab.castShadow = true;
    const se = this.entity('יסוד המקדש', slab, { icon: 'plaza', group: 'חורבות' });
    eng.add(se);
    eng.physics.addBody(se, { mass: 0, shape: 'box' });
    const top = h0 + 0.45;
    const cols = [
      [-5.5, -3.5, 7, false],
      [-1.8, -3.5, 7, false],
      [1.8, -3.5, 4.2, true],
      [5.5, -3.5, 7, false],
      [-5.5, 3.5, 7, false],
      [5.5, 3.5, 2.6, true],
    ];
    for (const [dx, dz, hgt, broken] of cols) {
      const e = eng.spawn('pillar', { position: [cx + dx, top, cz + dz], height: hgt, broken });
      e.group = 'חורבות';
      e.serializable = false;
    }
    // Lintel across the intact front pair.
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.7, 1.4), eng.materials.lib.marble);
    lintel.position.set(cx - 3.65, top + 7.45, cz - 3.5);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    const le = this.entity('משקוף', lintel, { icon: 'pillar', group: 'חורבות' });
    eng.add(le);
    eng.physics.addBody(le, { mass: 0, shape: 'box' });
    // A fallen drum.
    const fallen = eng.spawn('pillar', { position: [cx + 2, top + 0.45, cz + 1.2], height: 3.2, broken: true, rotation: [0, 30, 90] });
    fallen.group = 'חורבות';
    fallen.serializable = false;
  }

  _pier() {
    const eng = this.engine;
    const t = this.terrain;
    // Walk along the beach path until the water line.
    const dir = new THREE.Vector2(0.28, 1).normalize();
    let start = null;
    for (let s = 200; s < 520; s += 1) {
      const x = 60 + dir.x * (s - 200);
      const z = 230 + dir.y * (s - 200);
      if (t.heightAt(x, z) < 0.9) {
        start = new THREE.Vector3(x, 0, z);
        break;
      }
    }
    if (!start) return;
    start.addScaledVector(new THREE.Vector3(dir.x, 0, dir.y), -11);
    const len = 34;
    const deckY = 1.65;
    const planks = [];
    const posts = [];
    for (let i = 0; i < len; i++) {
      const b = new THREE.BoxGeometry(3.0, 0.14, 0.92);
      b.translate(0, deckY, i + 0.5);
      planks.push(b);
    }
    for (let i = 0; i <= len; i += 3) {
      for (const sx of [-1.45, 1.45]) {
        const c = new THREE.CylinderGeometry(0.13, 0.15, 5, 8);
        c.translate(sx, deckY - 2.5, i);
        posts.push(c);
      }
    }
    const g = new THREE.Group();
    const deck = new THREE.Mesh(mergeGeometries(planks), eng.materials.lib.wood);
    const piles = new THREE.Mesh(mergeGeometries(posts), eng.materials.lib.bark);
    for (const m of [deck, piles]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const lampEnd = eng.spawn('lamp', { position: [start.x, 0, start.z], rotation: [0, 0, 0] });
    lampEnd.serializable = false;
    lampEnd.group = 'מזח';
    g.position.copy(start);
    g.rotation.y = Math.atan2(dir.x, dir.y);
    g.updateMatrixWorld(true);
    const endLocal = new THREE.Vector3(1.4, deckY + 0.07, len - 0.6).applyMatrix4(g.matrixWorld);
    lampEnd.setPosition(endLocal.x, endLocal.y, endLocal.z);
    const e = this.entity('מזח העץ', g, { icon: 'crate', group: 'מזח' });
    eng.add(e);
    eng.physics.addStaticBox(new THREE.Vector3(0, deckY, len / 2).applyMatrix4(g.matrixWorld), new THREE.Vector3(3, 0.14, len), g.rotation.y, 'wood');
    this.pierStart = start;
  }

  // ----------------------------------------------------------- interaction

  /** Fires a ball from the camera (walk/fly modes). */
  shoot() {
    const eng = this.engine;
    const cam = eng.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pos = cam.position.clone().addScaledVector(dir, 1.2);
    const color = new THREE.Color().setHSL(Math.random(), 0.75, 0.55).getStyle();
    const ball = eng.spawn('ball', { position: pos.toArray(), radius: 0.28, color, mass: 2.5 });
    ball.serializable = false;
    ball.group = 'קליעים';
    ball.body.velocity.set(dir.x * 34, dir.y * 34, dir.z * 34);
    ball.body.ccdSpeedThreshold = 1;
    ball.addComponent(new Lifetime(35));
    this.projectiles.push(ball);
    while (this.projectiles.length > 40) {
      const old = this.projectiles.shift();
      if (old.engine) eng.remove(old);
    }
    eng.audio.ui('shoot');
  }

  /** Radial blast at the point under the crosshair (or a given point). */
  explode(point) {
    const eng = this.engine;
    if (!point) {
      const hit = eng.pick({ x: 0, y: 0 }, { any: true });
      if (!hit) return;
      point = hit.point;
    }
    eng.physics.explode(point, 9, 55);
    eng.particles.impact(point, new THREE.Vector3(0, 1, 0), 3);
    const S = eng.particles.systems;
    new Emitter(S.fire, { position: point, spread: Math.PI, speed: [3, 7], life: [0.3, 0.7], size0: [1.2, 2], size1: [0.2, 0.4], color0: [1, 0.6, 0.2, 1], color1: [0.8, 0.15, 0.02, 0], drag: 3, intensity: 12 }).burst(60);
    new Emitter(S.smoke, { position: point, spread: Math.PI * 0.6, speed: [1.5, 4], life: [2, 4], size0: [1, 1.6], size1: [4, 6], color0: [0.25, 0.23, 0.22, 0.6], color1: [0.4, 0.4, 0.4, 0], drag: 1.5, gravity: -0.6, turbulence: 1 }).burst(24);
    eng.audio.ui('boom');
    eng.events.emit('shake', { strength: 0.6 });
  }
}
