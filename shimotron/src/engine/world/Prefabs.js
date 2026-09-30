import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Entity, Component } from '../core/Entity.js';
import { Emitter } from '../fx/Particles.js';
import { smoothstep } from '../core/Random.js';

// ------------------------------------------------------------ components

/** Point light (and its bulb) that switch on at dusk. */
export class NightLight extends Component {
  constructor(light, bulb, base = 4, flicker = 0) {
    super();
    this.light = light;
    this.bulb = bulb;
    this.base = base;
    this.flicker = flicker;
    this.seed = Math.random() * 100;
  }

  update(dt, engine) {
    const k = smoothstep(0.02, 0.5, engine.atmosphere.nightFactor);
    const f = this.flicker ? 1 + Math.sin(engine.time.elapsed * 17 + this.seed) * 0.04 * this.flicker + Math.sin(engine.time.elapsed * 7.3 + this.seed * 2) * 0.05 * this.flicker : 1;
    // Intensity only: toggling visibility would change the light count and recompile shaders.
    this.light.intensity = this.base * k * f;
    if (this.bulb) engine.materials.setEmissiveBase(this.bulb, 7 * k * f + 0.02);
  }
}

/** Flame-like flicker for a point light. */
export class Flicker extends Component {
  constructor(light, base) {
    super();
    this.light = light;
    this.base = base;
    this.t = Math.random() * 10;
  }

  update(dt, engine) {
    this.t += dt;
    const n = Math.sin(this.t * 13.1) * 0.5 + Math.sin(this.t * 23.7) * 0.3 + Math.sin(this.t * 5.3) * 0.4;
    const night = 0.35 + 0.65 * engine.atmosphere.nightFactor;
    this.light.intensity = this.base * (1 + n * 0.16) * night;
  }
}

export class Spin extends Component {
  constructor(axis = new THREE.Vector3(0, 1, 0), speed = 1, target = null) {
    super();
    this.axis = axis.clone().normalize();
    this.speed = speed;
    this.target = target;
  }

  update(dt) {
    (this.target || this.entity.object3D).rotateOnAxis(this.axis, this.speed * dt);
  }
}

export class Bob extends Component {
  constructor(amplitude = 0.3, speed = 1, target = null) {
    super();
    this.amplitude = amplitude;
    this.speed = speed;
    this.target = target;
    this.base = null;
    this.t = Math.random() * 6;
  }

  update(dt) {
    const o = this.target || this.entity.object3D;
    if (this.base === null || this.entity.dragging) this.base = o.position.y - Math.sin(this.t * this.speed) * this.amplitude;
    this.t += dt;
    o.position.y = this.base + Math.sin(this.t * this.speed) * this.amplitude;
  }
}

/** Keeps particle emitters glued to the entity (so moved fires keep burning in place). */
export class EmitterSocket extends Component {
  constructor(emitters, offset = new THREE.Vector3()) {
    super();
    this.emitters = emitters;
    this.offset = offset;
  }

  onAttach(engine) {
    for (const e of this.emitters) engine.particles.add(e);
  }

  onDetach(engine) {
    for (const e of this.emitters) engine.particles.remove(e);
  }

  update() {
    const p = this.entity.object3D.getWorldPosition(new THREE.Vector3()).add(this.offset);
    for (const e of this.emitters) e.position.copy(p).add(e.localOffset || new THREE.Vector3());
  }
}

/** Removes the entity after a while (projectiles). */
export class Lifetime extends Component {
  constructor(seconds) {
    super();
    this.left = seconds;
  }

  update(dt, engine) {
    this.left -= dt;
    if (this.left <= 0) engine.remove(this.entity);
  }
}

// ------------------------------------------------------------- helpers

/**
 * Merges a group's direct child meshes that share a material (and shadow
 * flags) into one mesh each: fewer draw calls for multi-part props.
 */
export function mergeByMaterial(group) {
  const buckets = new Map();
  for (const c of group.children) {
    if (!c.isMesh || c.userData.keep || Array.isArray(c.material)) continue;
    const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    for (const m of list) group.remove(m);
    group.add(mesh);
  }
  return group;
}

const shared = {};
function geo(key, make) {
  if (!shared[key]) {
    shared[key] = make();
    shared[key].userData.shared = true;
  }
  return shared[key];
}

function place(obj, p) {
  if (p.position) obj.position.fromArray(p.position);
  if (p.rotation) obj.rotation.set(...p.rotation.map((d) => THREE.MathUtils.degToRad(d)));
  if (p.scale !== undefined) {
    if (Array.isArray(p.scale)) obj.scale.fromArray(p.scale);
    else obj.scale.setScalar(p.scale);
  }
}

function shadowed(o, cast = true) {
  o.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Per-entity material copy so the inspector can edit it without side effects. */
function ownMaterial(engine, key, color) {
  const base = engine.materials.lib[key] || engine.materials.lib.plastic;
  const m = base.clone();
  m.userData.libKey = key;
  if (color) m.color.set(color);
  return m;
}

function fluteGeometry(radius, height, flutes = 20, radial = 80) {
  const g = new THREE.CylinderGeometry(radius, radius, height, radial, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    if (r < radius * 0.5) continue;
    const k = 1 - 0.045 * Math.pow(Math.abs(Math.cos(a * flutes * 0.5)), 0.6);
    p.setX(i, Math.cos(a) * r * k);
    p.setZ(i, Math.sin(a) * r * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ prefabs

export const PREFAB_CATALOG = [
  { kind: 'cube', label: 'קובייה', icon: 'cube', group: 'גופים' },
  { kind: 'ball', label: 'כדור', icon: 'sphere', group: 'גופים' },
  { kind: 'cylinder', label: 'גליל', icon: 'cylinder', group: 'גופים' },
  { kind: 'knot', label: 'קשר', icon: 'knot', group: 'גופים' },
  { kind: 'crate', label: 'ארגז', icon: 'crate', group: 'אביזרים' },
  { kind: 'barrel', label: 'חבית', icon: 'barrel', group: 'אביזרים' },
  { kind: 'domino', label: 'דומינו', icon: 'domino', group: 'אביזרים' },
  { kind: 'pillar', label: 'עמוד שיש', icon: 'pillar', group: 'אביזרים' },
  { kind: 'lamp', label: 'פנס רחוב', icon: 'lamp', group: 'אור ואש' },
  { kind: 'orb', label: 'כדור אור', icon: 'orb', group: 'אור ואש' },
  { kind: 'fire', label: 'מדורה', icon: 'fire', group: 'אור ואש' },
  { kind: 'rock', label: 'סלע', icon: 'rock', group: 'טבע' },
];

export function registerPrefabs(engine) {
  const L = engine.materials.lib;

  engine.registerPrefab('cube', {
    defaults: { position: [0, 5, 0], size: 1, material: 'plastic', color: '#e85d2a', mass: 2, dynamic: true },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo('box1', () => new THREE.BoxGeometry(1, 1, 1, 1, 1, 1)), ownMaterial(eng, p.material, p.color));
      mesh.scale.setScalar(p.size);
      place(mesh, p);
      const e = new Entity('קובייה', shadowed(mesh), { icon: 'cube' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'box', size: new THREE.Vector3(p.size, p.size, p.size), material: 'default' });
      return e;
    },
  });

  engine.registerPrefab('ball', {
    defaults: { position: [0, 6, 0], radius: 0.5, material: 'ceramic', color: '#2a7fff', mass: 1.5, dynamic: true },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 48, 32)), ownMaterial(eng, p.material, p.color));
      mesh.scale.setScalar(p.radius);
      place(mesh, p);
      const e = new Entity('כדור', shadowed(mesh), { icon: 'sphere' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'sphere', size: p.radius, material: 'rubber', angularDamping: 0.25 });
      return e;
    },
  });

  engine.registerPrefab('cylinder', {
    defaults: { position: [0, 5, 0], radius: 0.5, height: 1.4, material: 'panels', color: '#ffffff', mass: 3, dynamic: true },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo(`cyl`, () => new THREE.CylinderGeometry(1, 1, 1, 40)), ownMaterial(eng, p.material, p.color));
      mesh.scale.set(p.radius, p.height, p.radius);
      place(mesh, p);
      const e = new Entity('גליל', shadowed(mesh), { icon: 'cylinder' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'cylinder', size: new THREE.Vector3(p.radius, p.height, p.radius), material: 'metal' });
      return e;
    },
  });

  engine.registerPrefab('knot', {
    defaults: { position: [0, 6, 0], material: 'gold', color: '#ffc766', mass: 3, dynamic: true, size: 1 },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo('knot', () => new THREE.TorusKnotGeometry(0.42, 0.15, 220, 28)), ownMaterial(eng, p.material, p.color));
      mesh.scale.setScalar(p.size);
      place(mesh, p);
      const e = new Entity('קשר טורוס', shadowed(mesh), { icon: 'knot' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'sphere', size: 0.62 * p.size, material: 'metal' });
      return e;
    },
  });

  engine.registerPrefab('crate', {
    defaults: { position: [0, 5, 0], size: 1.2, mass: 4, dynamic: true },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo('crate', () => new THREE.BoxGeometry(1, 1, 1)), L.wood);
      mesh.scale.setScalar(p.size);
      place(mesh, p);
      const e = new Entity('ארגז עץ', shadowed(mesh), { icon: 'crate' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'box', size: new THREE.Vector3(p.size, p.size, p.size), material: 'wood' });
      return e;
    },
  });

  engine.registerPrefab('barrel', {
    defaults: { position: [0, 5, 0], mass: 6, dynamic: true, color: '#8a2b1f' },
    create(eng, p) {
      const g = new THREE.Group();
      const bodyGeo = geo('barrel', () => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          pts.push(new THREE.Vector2(0.42 + Math.sin(t * Math.PI) * 0.07, t * 1.3 - 0.65));
        }
        pts.unshift(new THREE.Vector2(0, -0.65));
        pts.push(new THREE.Vector2(0, 0.65));
        return new THREE.LatheGeometry(pts, 36);
      });
      const paint = ownMaterial(eng, 'carPaint', p.color);
      paint.clearcoatRoughness = 0.25;
      paint.roughness = 0.5;
      g.add(new THREE.Mesh(bodyGeo, paint));
      const ringGeo = geo('barrelRing', () => new THREE.TorusGeometry(0.47, 0.025, 8, 40).rotateX(Math.PI / 2));
      for (const y of [-0.42, 0.42]) {
        const r = new THREE.Mesh(ringGeo, L.darkMetal);
        r.position.y = y;
        g.add(r);
      }
      place(g, p);
      const e = new Entity('חבית', mergeByMaterial(shadowed(g)), { icon: 'barrel' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'cylinder', size: new THREE.Vector3(0.48, 1.3, 0.48), material: 'metal' });
      return e;
    },
  });

  engine.registerPrefab('domino', {
    defaults: { position: [0, 1, 0], color: '#f3f0ea', mass: 0.8, dynamic: true },
    create(eng, p) {
      const mesh = new THREE.Mesh(geo('domino', () => new THREE.BoxGeometry(0.5, 1.1, 0.14)), ownMaterial(eng, 'ceramic', p.color));
      place(mesh, p);
      const e = new Entity('דומינו', shadowed(mesh), { icon: 'domino' });
      eng.physics.addBody(e, { mass: p.dynamic ? p.mass : 0, shape: 'box', size: new THREE.Vector3(0.5, 1.1, 0.14), material: 'wood' });
      return e;
    },
  });

  engine.registerPrefab('pillar', {
    defaults: { position: [0, 0, 0], height: 6, broken: false },
    create(eng, p) {
      const g = new THREE.Group();
      const h = p.height;
      const shaft = new THREE.Mesh(geo(`flute`, () => fluteGeometry(0.42, 1, 22)), L.marble);
      shaft.scale.set(1, h - 0.9, 1);
      shaft.position.y = 0.45 + (h - 0.9) / 2;
      g.add(shaft);
      const base = new THREE.Mesh(geo('pillarBase', () => new THREE.CylinderGeometry(0.62, 0.7, 0.45, 40)), L.marble);
      base.position.y = 0.225;
      g.add(base);
      const plinth = new THREE.Mesh(geo('pillarPlinth', () => new THREE.BoxGeometry(1.5, 0.2, 1.5)), L.marble);
      plinth.position.y = 0.1;
      g.add(plinth);
      if (!p.broken) {
        const cap = new THREE.Mesh(geo('pillarCap', () => new THREE.CylinderGeometry(0.72, 0.46, 0.35, 40)), L.marble);
        cap.position.y = h - 0.3;
        g.add(cap);
        const abacus = new THREE.Mesh(geo('pillarAbacus', () => new THREE.BoxGeometry(1.55, 0.22, 1.55)), L.marble);
        abacus.position.y = h - 0.02;
        g.add(abacus);
      }
      place(g, p);
      const e = new Entity('עמוד שיש', mergeByMaterial(shadowed(g)), { icon: 'pillar' });
      const top = p.broken ? h - 0.45 : h + 0.09;
      eng.physics.addBody(e, { mass: 0, shape: 'box', size: new THREE.Vector3(1.1, top, 1.1) });
      e.body.shapeOffsets[0].set(0, top / 2, 0);
      e.body.updateBoundingRadius();
      e.body.aabbNeedsUpdate = true;
      return e;
    },
  });

  engine.registerPrefab('lamp', {
    defaults: { position: [0, 0, 0], rotation: [0, 0, 0], intensity: 5.5, color: '#ffcf8a' },
    create(eng, p) {
      const g = new THREE.Group();
      const iron = L.iron;
      const pole = new THREE.Mesh(geo('lampPole', () => new THREE.CylinderGeometry(0.07, 0.11, 4.2, 12)), iron);
      pole.position.y = 2.1;
      g.add(pole);
      const foot = new THREE.Mesh(geo('lampFoot', () => new THREE.CylinderGeometry(0.22, 0.3, 0.5, 12)), iron);
      foot.position.y = 0.25;
      g.add(foot);
      const arm = new THREE.Mesh(
        geo('lampArm', () => {
          const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 3.9, 0), new THREE.Vector3(0, 4.6, 0), new THREE.Vector3(0.9, 4.45, 0));
          return new THREE.TubeGeometry(c, 16, 0.045, 8, false);
        }),
        iron,
      );
      g.add(arm);
      const cage = new THREE.Mesh(geo('lampCage', () => new THREE.CylinderGeometry(0.18, 0.12, 0.42, 6, 1, true)), L.glass.clone());
      cage.material.transmission = 0;
      cage.material.transparent = true;
      cage.material.opacity = 0.35;
      cage.material.roughness = 0.1;
      cage.position.set(0.9, 4.15, 0);
      g.add(cage);
      const hat = new THREE.Mesh(geo('lampHat', () => new THREE.ConeGeometry(0.28, 0.2, 6)), iron);
      hat.position.set(0.9, 4.44, 0);
      g.add(hat);
      const bulbMat = L.lampGlow.clone();
      eng.materials.trackEmissive(bulbMat, 0);
      const bulb = new THREE.Mesh(geo('lampBulb', () => new THREE.SphereGeometry(0.09, 16, 12)), bulbMat);
      bulb.position.set(0.9, 4.12, 0);
      g.add(bulb);
      const light = new THREE.PointLight(p.color, 0, 22, 2);
      light.position.set(0.9, 4.0, 0);
      light.castShadow = false;
      g.add(light);
      place(g, p);
      shadowed(g);
      cage.castShadow = false;
      bulb.castShadow = false;
      mergeByMaterial(g);
      const e = new Entity('פנס רחוב', g, { icon: 'lamp' });
      e.light = light;
      e.addComponent(new NightLight(light, bulbMat, p.intensity, 0.3));
      eng.physics.addBody(e, { mass: 0, shape: 'box', size: new THREE.Vector3(0.3, 4.2, 0.3) });
      e.body.shapeOffsets[0].set(0, 2.1, 0);
      e.body.updateBoundingRadius();
      return e;
    },
  });

  engine.registerPrefab('orb', {
    defaults: { position: [0, 3, 0], color: '#7fe6ff', intensity: 3 },
    create(eng, p) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x0c1014, emissive: new THREE.Color(p.color), emissiveIntensity: 1, roughness: 0.2 });
      eng.materials.trackEmissive(mat, 5);
      const core = new THREE.Mesh(geo('orbCore', () => new THREE.IcosahedronGeometry(0.22, 3)), mat);
      g.add(core);
      const shell = new THREE.Mesh(geo('orbShell', () => new THREE.IcosahedronGeometry(0.38, 1)), new THREE.MeshStandardMaterial({ color: 0x9fb7c7, metalness: 1, roughness: 0.25, wireframe: true }));
      g.add(shell);
      const light = new THREE.PointLight(p.color, p.intensity, 14, 2);
      g.add(light);
      place(g, p);
      const e = new Entity('כדור אור', g, { icon: 'orb' });
      e.light = light;
      e.addComponent(new Bob(0.25, 1.4, null));
      e.addComponent(new Spin(new THREE.Vector3(0.3, 1, 0.2), 0.8, shell));
      const c = new NightLight(light, null, p.intensity, 0);
      c.update = function (dt, engine) {
        const k = 0.25 + 0.75 * engine.atmosphere.nightFactor;
        this.light.intensity = this.base * k;
      };
      e.addComponent(c);
      return e;
    },
  });

  engine.registerPrefab('fire', {
    defaults: { position: [0, 0, 0], intensity: 1 },
    create(eng, p) {
      const g = new THREE.Group();
      const logGeo = geo('log', () => {
        const c = new THREE.CylinderGeometry(0.11, 0.13, 1.3, 9);
        const uv = c.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 1.5);
        return c;
      });
      for (let i = 0; i < 5; i++) {
        const log = new THREE.Mesh(logGeo, L.bark);
        const a = (i / 5) * Math.PI * 2;
        log.position.set(Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.28);
        log.rotation.set(0, -a, 0);
        log.rotateZ(1.05);
        g.add(log);
      }
      const embers = new THREE.Mesh(geo('embers', () => new THREE.CylinderGeometry(0.42, 0.5, 0.08, 16)), L.ember);
      embers.position.y = 0.05;
      g.add(embers);
      const stoneGeo = geo('fireStone', () => new THREE.DodecahedronGeometry(0.2, 0));
      for (let i = 0; i < 11; i++) {
        const s = new THREE.Mesh(stoneGeo, L.stone);
        const a = (i / 11) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.82, 0.09, Math.sin(a) * 0.82);
        s.rotation.set(a, a * 2, 0);
        s.scale.set(1.1, 0.7, 0.9);
        g.add(s);
      }
      const light = new THREE.PointLight(0xff8a3a, 6, 26, 2);
      light.position.y = 1.0;
      g.add(light);
      place(g, p);
      shadowed(g);
      mergeByMaterial(g);
      const e = new Entity('מדורה', g, { icon: 'fire' });
      e.light = light;
      e.addComponent(new Flicker(light, 6 * p.intensity));
      const S = eng.particles.systems;
      const k = p.intensity;
      const fire = new Emitter(S.fire, { rate: 55 * k, radius: 0.3, spread: 0.25, speed: [0.9, 1.9], life: [0.45, 0.95], size0: [0.55, 0.8], size1: [0.12, 0.25], color0: [1.0, 0.55, 0.16, 0.9], color1: [0.9, 0.18, 0.03, 0.0], gravity: -1.5, turbulence: 1.2, intensity: 7 });
      fire.localOffset = new THREE.Vector3(0, 0.25, 0);
      const smoke = new Emitter(S.smoke, { rate: 7 * k, radius: 0.25, spread: 0.3, speed: [0.9, 1.5], life: [3.5, 5.5], size0: [0.5, 0.8], size1: [2.4, 3.6], color0: [0.32, 0.3, 0.29, 0.38], color1: [0.5, 0.49, 0.48, 0.0], gravity: -0.35, drag: 0.25, turbulence: 0.7 });
      smoke.localOffset = new THREE.Vector3(0, 1.3, 0);
      const sparks = new Emitter(S.sparks, { rate: 9 * k, radius: 0.25, spread: 0.45, speed: [1.8, 4.2], life: [0.9, 1.9], size0: [0.025, 0.04], size1: [0.01, 0.02], color0: [1, 0.6, 0.2, 1], color1: [1, 0.25, 0.02, 1], gravity: -0.6, drag: 0.6, turbulence: 3.5, intensity: 14 });
      sparks.localOffset = new THREE.Vector3(0, 0.6, 0);
      e.addComponent(new EmitterSocket([fire, smoke, sparks]));
      eng.physics.addBody(e, { mass: 0, shape: 'cylinder', size: new THREE.Vector3(0.95, 0.4, 0.95) });
      if (eng.audio && eng.audio.ctx) e.sound = eng.audio.addFire(g.position);
      return e;
    },
  });

  engine.registerPrefab('rock', {
    defaults: { position: [0, 0, 0], size: 1.6 },
    create(eng, p) {
      const mesh = new THREE.Mesh(
        geo('rockPrefab', () => {
          const g = new THREE.IcosahedronGeometry(1, 3);
          const pp = g.attributes.position;
          const v = new THREE.Vector3();
          for (let i = 0; i < pp.count; i++) {
            v.set(pp.getX(i), pp.getY(i), pp.getZ(i));
            const d = 1 + Math.sin(v.x * 3.1) * 0.08 + Math.sin(v.y * 4.3 + v.z * 2) * 0.1 + Math.cos(v.z * 5.1) * 0.05;
            v.multiplyScalar(d);
            v.y *= 0.7;
            pp.setXYZ(i, v.x, v.y, v.z);
          }
          g.computeVertexNormals();
          return g;
        }),
        L.rock,
      );
      mesh.scale.setScalar(p.size);
      place(mesh, p);
      const e = new Entity('סלע', shadowed(mesh), { icon: 'rock' });
      eng.physics.addBody(e, { mass: 0, shape: 'sphere', size: p.size * 0.82 });
      return e;
    },
  });
}

