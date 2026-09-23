import * as THREE from 'three';
import { Emitter } from '../engine/fx/Particles.js';
import { createCarModel } from './CarModel.js';
import { carSpec } from './config.js';
import { smoothstep } from '../engine/core/Random.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Step layout, in place order: height, position along the podium, trim colour. */
const STEPS = [
  { h: 1.5, z: 0, metal: '#f2c230', dark: '#9a6a00' },
  { h: 1.0, z: 2.6, metal: '#d5dae3', dark: '#6b7383' },
  { h: 0.65, z: -2.6, metal: '#cf8446', dark: '#6e3a14' },
];
const SKIN = [0xe8b996, 0xc68863, 0x9a6444];

/**
 * The winners' ceremony on the start straight: a three-step podium with
 * the top three drivers — a gold crown on the winner, a silver cup held
 * high by second place and a bronze medal on third — their cars parked
 * behind, a banner, spotlights, confetti, fireworks, a fanfare and an
 * orbiting camera.
 */
export class Podium {
  /** winners: up to three { name, color, stripe, number, type } in finishing order. */
  constructor(game, winners) {
    this.game = game;
    this.engine = game.engine;
    this.materials = game.materials;
    this.winners = winners.slice(0, 3);
    this.group = new THREE.Group();
    this.group.name = 'במת המנצחים';
    this.time = 0;
    this.owned = []; // geometries + materials this class created
    this.figures = [];
    this.cars = [];
    this.nextFirework = 1.2;
  }

  _mat(opts, emissiveBase = null) {
    const m = new THREE.MeshStandardMaterial(opts);
    this.owned.push(m);
    if (emissiveBase !== null) this.materials.trackEmissive(m, emissiveBase);
    return m;
  }

  _geo(g) {
    this.owned.push(g);
    return g;
  }

  _mesh(geo, mat, parent = this.group, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.noPick = true;
    parent.add(m);
    return m;
  }

  build() {
    const tr = this.game.island.track;
    const p = tr.pose(30 / tr.length, 0);
    // Local frame: +X faces the grandstand side, +Y up.
    const back = p.tangent.clone().negate();
    _m.makeBasis(p.right, UP, back);
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.position.copy(p.position);
    this.group.updateMatrixWorld();
    this._stage();
    this.winners.forEach((w, k) => {
      this._figure(w, k);
      this._car(w, k);
    });
    this._banner();
    this._lights();
    this._confetti();
    this.engine.scene.add(this.group);
    this._fanfare();
    return this;
  }

  // ------------------------------------------------------------ set

  _stage() {
    const base = this._mat({ color: 0x1c1f26, roughness: 0.7, metalness: 0.2 });
    const carpet = this._mat({ color: 0x8e1016, roughness: 0.95 });
    this._mesh(this._geo(new THREE.BoxGeometry(5.4, 0.22, 9.4)), base).position.set(-0.4, 0.11, 0);
    this._mesh(this._geo(new THREE.BoxGeometry(3.2, 0.02, 9)), carpet).position.set(-0.2, 0.23, 0);
    // A runway of carpet towards the grandstand.
    this._mesh(this._geo(new THREE.BoxGeometry(6, 0.02, 2)), carpet).position.set(5.2, 0.02, 0);
    const white = this._mat({ color: 0xe9e9ee, roughness: 0.45 });
    STEPS.forEach((st, k) => {
      if (k >= this.winners.length) return;
      const front = this._mat({ map: this._numberTexture(k + 1, st), roughness: 0.35, metalness: 0.3 });
      const geo = this._geo(new THREE.BoxGeometry(2.3, st.h, 2.5));
      const m = new THREE.Mesh(geo, [front, white, white, white, white, white]);
      m.position.set(0, 0.22 + st.h / 2, st.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      // Metal trim along the top edge.
      const trim = this._mat({ color: st.metal, roughness: 0.25, metalness: 1 });
      this._mesh(this._geo(new THREE.BoxGeometry(2.34, 0.06, 2.54)), trim).position.set(0, 0.22 + st.h, st.z);
    });
  }

  _numberTexture(n, st) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, st.metal);
    grad.addColorStop(1, st.dark);
    g.fillStyle = '#f0f0f3';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = grad;
    g.fillRect(28, 28, 200, 200);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.font = '700 190px Karantina, "IBM Plex Sans Hebrew", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 134, 142);
    g.fillStyle = '#ffffff';
    g.fillText(String(n), 128, 136);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.owned.push(tex);
    return tex;
  }

  _banner() {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#0d1b3a');
    grad.addColorStop(0.5, '#1d3470');
    grad.addColorStop(1, '#0d1b3a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 64; i++) {
      for (const y of [0, 236]) {
        g.fillStyle = (i + (y ? 1 : 0)) % 2 ? '#ffffff' : '#111111';
        g.fillRect(i * 16, y, 16, 10);
        g.fillStyle = (i + (y ? 0 : 1)) % 2 ? '#ffffff' : '#111111';
        g.fillRect(i * 16, y + 10, 16, 10);
      }
    }
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffc83d';
    g.font = '700 120px Karantina, "IBM Plex Sans Hebrew", sans-serif';
    g.fillText('במת המנצחים', 512, 112);
    g.fillStyle = '#ffffff';
    g.font = '600 34px "IBM Plex Sans Hebrew", sans-serif';
    g.fillText(`שימוטרון ראלי · ${this.game.stage ? this.game.stage.name : ''}`, 512, 192);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.owned.push(tex);
    const mat = this._mat({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6, side: THREE.DoubleSide }, 0.18);
    this.bannerMat = mat;
    const banner = this._mesh(this._geo(new THREE.PlaneGeometry(12, 3)), mat);
    banner.position.set(-9.8, 3.1, 0);
    banner.rotation.y = Math.PI / 2;
    const post = this._geo(new THREE.CylinderGeometry(0.08, 0.1, 4.8, 8));
    for (const z of [-6.1, 6.1]) this._mesh(post, this.materials.lib.darkMetal || this.materials.lib.iron).position.set(-9.85, 2.4, z);
  }

  _lights() {
    this.spots = [];
    for (const z of [-7, 7]) {
      const s = new THREE.SpotLight(0xfff0d8, 0, 40, 0.55, 0.6, 1.2);
      s.position.set(9, 11, z);
      s.target.position.set(0, 1.2, 0);
      this.group.add(s, s.target);
      this.spots.push(s);
    }
  }

  // --------------------------------------------------------- figures

  _figure(w, k) {
    const st = STEPS[k];
    const fig = new THREE.Group();
    fig.position.set(0.1, 0.22 + st.h + 0.03, st.z);
    fig.rotation.y = Math.PI / 2; // local +Z (the figure's front) → +X
    this.group.add(fig);
    const suit = this._mat({ color: w.color, roughness: 0.5, metalness: 0.05 });
    const stripe = this._mat({ color: w.stripe || '#111111', roughness: 0.5 });
    const skin = this._mat({ color: SKIN[k % SKIN.length], roughness: 0.65 });
    const dark = this._mat({ color: 0x141519, roughness: 0.6 });
    // Legs, boots, torso, neck, head, hair.
    for (const x of [-0.1, 0.1]) {
      this._mesh(this._geo(new THREE.CylinderGeometry(0.085, 0.075, 0.82, 10)), suit, fig).position.set(x, 0.49, 0);
      this._mesh(this._geo(new THREE.BoxGeometry(0.13, 0.1, 0.27)), dark, fig).position.set(x, 0.05, 0.04);
    }
    const torso = this._mesh(this._geo(new THREE.CapsuleGeometry(0.19, 0.42, 6, 14)), suit, fig);
    torso.position.set(0, 1.16, 0);
    torso.scale.set(1.18, 1, 0.78);
    const band = this._mesh(this._geo(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 18)), stripe, fig);
    band.position.set(0, 1.02, 0);
    band.scale.set(1, 1, 0.72);
    this._mesh(this._geo(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8)), skin, fig).position.set(0, 1.5, 0);
    const head = this._mesh(this._geo(new THREE.SphereGeometry(0.125, 18, 14)), skin, fig);
    head.position.set(0, 1.66, 0.01);
    const hair = this._mesh(this._geo(new THREE.SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)), dark, fig);
    hair.position.set(0, 1.675, -0.012);
    hair.rotation.x = -0.25;
    // Arms hang from shoulder pivots.
    const arms = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.27, 1.42, 0);
      fig.add(pivot);
      this._mesh(this._geo(new THREE.CylinderGeometry(0.058, 0.05, 0.6, 8)), suit, pivot).position.set(0, -0.3, 0);
      this._mesh(this._geo(new THREE.SphereGeometry(0.062, 10, 8)), dark, pivot).position.set(0, -0.62, 0);
      arms.push({ pivot, side });
    }
    const f = { fig, arms, k, baseY: fig.position.y };
    if (k === 0) f.prize = this._crown(fig);
    else if (k === 1) f.prize = this._cup(fig);
    else f.prize = this._medal(fig);
    this.figures.push(f);
    this._pose(f, 0);
  }

  /** Arm and body animation per place: #1 pumps both fists, #2 lifts the cup, #3 waves. */
  _pose(f, t) {
    const [L, R] = f.arms;
    const up = (a) => Math.PI - a;
    if (f.k === 0) {
      const pump = 0.35 + Math.abs(Math.sin(t * 3.2)) * 0.25;
      L.pivot.rotation.z = up(pump);
      R.pivot.rotation.z = -up(pump);
      f.fig.position.y = f.baseY + Math.max(0, Math.sin(t * 3.2)) * 0.06;
    } else if (f.k === 1) {
      const lift = Math.sin(t * 1.6) * 0.04;
      L.pivot.rotation.z = up(0.2 - lift);
      R.pivot.rotation.z = -up(0.2 - lift);
      f.prize.position.y = 2.16 + lift * 1.5;
      f.prize.rotation.y = Math.sin(t * 0.8) * 0.4;
    } else {
      L.pivot.rotation.z = 0.12;
      R.pivot.rotation.z = -up(0.55 + Math.sin(t * 5) * 0.28);
      f.prize.rotation.z = Math.sin(t * 2.4) * 0.08;
    }
  }

  _gold() {
    return this.goldMat || (this.goldMat = this._mat({ color: 0xffc23a, roughness: 0.2, metalness: 1, emissive: 0x6a4200, emissiveIntensity: 1 }, 0.12));
  }

  /** Gold crown with spikes and jewels, worn by the winner. */
  _crown(fig) {
    const gold = this._gold();
    const crown = new THREE.Group();
    const R = 0.13;
    this._mesh(this._geo(new THREE.CylinderGeometry(R + 0.005, R - 0.01, 0.075, 28, 1, true)), gold, crown).position.y = 0.037;
    this._mesh(this._geo(new THREE.TorusGeometry(R - 0.002, 0.012, 6, 28)).rotateX(Math.PI / 2), gold, crown);
    const spike = this._geo(new THREE.ConeGeometry(0.03, 0.1, 6));
    const tip = this._geo(new THREE.SphereGeometry(0.018, 8, 6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this._mesh(spike, gold, crown).position.set(Math.cos(a) * R, 0.12, Math.sin(a) * R);
      this._mesh(tip, gold, crown).position.set(Math.cos(a) * R, 0.18, Math.sin(a) * R);
    }
    const ruby = this._mat({ color: 0xc0101c, roughness: 0.1, metalness: 0.2, emissive: 0x500006, emissiveIntensity: 1 }, 0.15);
    const sapphire = this._mat({ color: 0x1438c8, roughness: 0.1, metalness: 0.2 });
    const gem = this._geo(new THREE.SphereGeometry(0.022, 10, 8));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      this._mesh(gem, i % 2 ? sapphire : ruby, crown).position.set(Math.cos(a) * (R + 0.006), 0.04, Math.sin(a) * (R + 0.006));
    }
    crown.position.set(0, 1.74, 0.0);
    crown.scale.setScalar(1.45);
    crown.rotation.x = -0.08;
    fig.add(crown);
    return crown;
  }

  /** Silver cup with two handles, held above second place's head. */
  _cup(fig) {
    const silver = this._mat({ color: 0xe3e7ee, roughness: 0.14, metalness: 1 });
    const cup = new THREE.Group();
    const prof = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.04],
      [0.06, 0.06],
      [0.028, 0.09],
      [0.022, 0.19],
      [0.055, 0.22],
      [0.12, 0.27],
      [0.15, 0.36],
      [0.155, 0.46],
      [0.142, 0.46],
      [0.132, 0.37],
      [0.0, 0.33],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this._mesh(this._geo(new THREE.LatheGeometry(prof, 36)), silver, cup);
    const handle = this._geo(new THREE.TorusGeometry(0.075, 0.014, 8, 20, Math.PI));
    for (const s of [1, -1]) {
      const m = this._mesh(handle, silver, cup);
      m.position.set(s * 0.15, 0.36, 0);
      m.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    this._mesh(this._geo(new THREE.BoxGeometry(0.2, 0.05, 0.2)), this._gold(), cup).position.y = 0.025;
    cup.position.set(0, 2.16, 0.02);
    cup.scale.setScalar(1.25);
    fig.add(cup);
    return cup;
  }

  /** Bronze medal on a ribbon for third place. */
  _medal(fig) {
    const bronze = this._mat({ color: 0xcf8446, roughness: 0.3, metalness: 1 });
    const ribbon = this._mat({ color: 0xc8161e, roughness: 0.8 });
    const medal = new THREE.Group();
    const disc = this._mesh(this._geo(new THREE.CylinderGeometry(0.08, 0.08, 0.016, 28)), bronze, medal);
    disc.rotation.x = Math.PI / 2;
    const star = this._mesh(this._geo(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 5)), this._gold(), medal);
    star.rotation.x = Math.PI / 2;
    star.position.z = 0.004;
    for (const s of [1, -1]) {
      const r = this._mesh(this._geo(new THREE.BoxGeometry(0.045, 0.3, 0.008)), ribbon, medal);
      r.position.set(s * 0.06, 0.16, -0.012);
      r.rotation.z = s * 0.38;
    }
    medal.position.set(0, 1.12, 0.2);
    medal.scale.setScalar(1.6);
    fig.add(medal);
    return medal;
  }

  // ------------------------------------------------------------ cars

  _car(w, k) {
    const model = createCarModel(this.materials, { color: w.color, number: w.number, stripe: w.stripe || '#111111', type: w.type || 'gt' });
    this.cars.push(model);
    const spec = carSpec(w.type || 'gt');
    const Wh = spec.wheel;
    const len = Wh.restLength - 9.82 / (4 * Wh.stiffness);
    const car = model.group;
    car.position.set(-5.9, Wh.radius + len - Wh.height, STEPS[k].z * 1.3);
    car.rotation.y = Math.PI / 2 + (k === 0 ? 0 : k === 1 ? -0.22 : 0.22);
    this.group.add(car);
    const wb = this.game.wheels;
    const scale = wb.scaleFor(Wh);
    for (let i = 0; i < 4; i++) {
      const left = i % 2 === 0;
      const x = left ? Wh.track : -Wh.track;
      const z = i < 2 ? Wh.front : Wh.rear;
      for (const [geo, mat] of [
        [wb.tyreGeo, wb.tyreMat],
        [wb.rimGeo, wb.rimMat],
      ]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, Wh.height - len, z);
        m.rotation.y = left ? Math.PI : 0;
        m.scale.copy(scale);
        m.castShadow = true;
        car.add(m);
      }
    }
  }

  // -------------------------------------------------------- confetti

  _confetti() {
    const n = this.engine.quality.presetName === 'low' ? 220 : 420;
    const geo = this._geo(new THREE.PlaneGeometry(0.07, 0.12));
    const mat = this._mat({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 1 }, 0.2);
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    mat.customProgramCacheKey = () => 'podium-confetti';
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.noPick = true;
    const cols = ['#ffd23a', '#ff3b5c', '#2fd3ff', '#7cff5a', '#b06bff', '#ffffff', '#ff8a1a'].map((c) => new THREE.Color(c));
    this.bits = [];
    for (let i = 0; i < n; i++) {
      mesh.setColorAt(i, cols[i % cols.length]);
      this.bits.push(this._spawnBit({}, true));
    }
    this.confetti = mesh;
    this.group.add(mesh);
  }

  _spawnBit(b, initial = false) {
    b.x = THREE.MathUtils.randFloat(-3.5, 5);
    b.z = THREE.MathUtils.randFloat(-6.5, 6.5);
    b.y = initial ? THREE.MathUtils.randFloat(4, 16) : THREE.MathUtils.randFloat(9, 14);
    b.vx = THREE.MathUtils.randFloat(-0.4, 0.4);
    b.vz = THREE.MathUtils.randFloat(-0.4, 0.4);
    b.fall = THREE.MathUtils.randFloat(0.9, 1.6);
    b.rx = Math.random() * 6.28;
    b.ry = Math.random() * 6.28;
    b.sx = THREE.MathUtils.randFloat(2, 7);
    b.sy = THREE.MathUtils.randFloat(1, 4);
    b.phase = Math.random() * 6.28;
    return b;
  }

  _updateConfetti(dt) {
    const t = this.time;
    const raining = t < 14;
    const mesh = this.confetti;
    let alive = 0;
    this.bits.forEach((b, i) => {
      if (b.y < 0.25) {
        if (raining) this._spawnBit(b);
        else b.dead = true;
      }
      if (!b.dead) {
        b.y -= b.fall * dt;
        b.x += (b.vx + Math.sin(t * 2 + b.phase) * 0.5) * dt;
        b.z += (b.vz + Math.cos(t * 1.7 + b.phase) * 0.5) * dt;
        b.rx += b.sx * dt;
        b.ry += b.sy * dt;
        alive++;
      }
      _q.setFromEuler(_e.set(b.rx, b.ry, 0));
      _m.compose(_p.set(b.x, b.dead ? -50 : b.y, b.z), _q, _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = alive > 0;
  }

  // ------------------------------------------------------- fireworks

  _firework() {
    const P = this.engine.particles;
    const local = new THREE.Vector3(THREE.MathUtils.randFloat(-40, -14), THREE.MathUtils.randFloat(26, 42), THREE.MathUtils.randFloat(-26, 26));
    const at = local.applyMatrix4(this.group.matrixWorld);
    const hue = Math.random();
    const c = new THREE.Color().setHSL(hue, 1, 0.6);
    const c2 = new THREE.Color().setHSL((hue + 0.08) % 1, 1, 0.5);
    const k = Math.min(60, (this.materials.emissiveScale || 1) * 0.9);
    new Emitter(P.systems.sparks, {
      position: at,
      spread: Math.PI,
      speed: [9, 15],
      life: [1.1, 1.9],
      size0: [0.28, 0.4],
      size1: [0.05, 0.1],
      color0: [c.r, c.g, c.b, 1],
      color1: [c2.r, c2.g, c2.b, 0.6],
      gravity: 4,
      drag: 1.1,
      intensity: k,
    }).burst(this.engine.quality.presetName === 'low' ? 45 : 80);
    new Emitter(P.systems.glow, {
      position: at,
      spread: Math.PI,
      speed: [0.5, 2],
      life: [0.5, 0.9],
      size0: [5, 8],
      size1: [9, 14],
      color0: [c.r, c.g, c.b, 0.7],
      color1: [c.r, c.g, c.b, 0],
      intensity: k * 0.4,
    }).burst(4);
    const a = this.engine.audio;
    if (a && a.enabled && a.ctx) {
      const d = at.distanceTo(this.engine.camera.position);
      const when = Math.min(0.6, d / 340);
      a._burst(a.sfx, { dur: 0.9, freq: 150, q: 0.5, gain: 0.3, type: 'lowpass', when });
      for (let i = 0; i < 5; i++) a._burst(a.sfx, { dur: 0.05, freq: 2500 + Math.random() * 2000, q: 1.2, gain: 0.05, when: when + 0.25 + i * 0.07 });
    }
  }

  _fanfare() {
    const a = this.engine.audio;
    if (!a || !a.enabled || !a.ctx) return;
    const out = a.ctx.createGain();
    out.gain.value = 0.9;
    out.connect(a.buses.music);
    const notes = [
      [0, 392, 0.16],
      [0.18, 392, 0.16],
      [0.36, 392, 0.16],
      [0.54, 523, 0.62],
      [1.22, 440, 0.16],
      [1.4, 494, 0.16],
      [1.58, 523, 0.32],
      [1.94, 659, 1.3],
    ];
    for (const [when, f, dur] of notes) {
      a._tone(out, { freq: f, dur, gain: 0.05, type: 'sawtooth', when });
      a._tone(out, { freq: f * 2, dur, gain: 0.025, type: 'triangle', when });
    }
    for (const f of [262, 330, 392]) a._tone(out, { freq: f, dur: 1.4, gain: 0.035, type: 'triangle', when: 1.94 });
    // The crowd.
    a._burst(a.buses.ambience, { dur: 3.8, freq: 1300, q: 0.35, gain: 0.22, when: 0.3 });
    a._burst(a.buses.ambience, { dur: 3.2, freq: 700, q: 0.4, gain: 0.16, when: 1.6 });
  }

  // ------------------------------------------------------------ run

  /** Camera rig: swoops in from high and orbits the front of the podium. */
  cameraRig() {
    const pod = this;
    const cam = this.engine.camera;
    const look = new THREE.Vector3();
    const focus = new THREE.Vector3();
    return {
      focusPoint: () => focus.copy(look),
      update() {
        const t = pod.time;
        const intro = smoothstep(0, 4, t);
        const a = Math.sin(t * 0.16) * 0.95;
        const R = THREE.MathUtils.lerp(26, 11.5 - 1.2 * smoothstep(4, 14, t), intro);
        const y = THREE.MathUtils.lerp(11, 3.2 + 0.5 * Math.sin(t * 0.11), intro);
        const local = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
        cam.position.copy(local.applyMatrix4(pod.group.matrixWorld));
        // Aim below the drivers so they sit in the upper half, clear of the overlay cards.
        look.set(0, 0.6, 0).applyMatrix4(pod.group.matrixWorld);
        cam.lookAt(look);
        if (Math.abs(cam.fov - 50) > 0.01) {
          cam.fov += (50 - cam.fov) * 0.1;
          cam.updateProjectionMatrix();
        }
      },
    };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const f of this.figures) this._pose(f, t);
    if (this.figures[0] && this.figures[0].prize) this.figures[0].prize.rotation.y = Math.sin(t * 0.7) * 0.25;
    this._updateConfetti(dt);
    const night = this.engine.atmosphere.nightFactor;
    for (const s of this.spots) s.intensity = 60 + 900 * night;
    this.nextFirework -= dt;
    if (this.nextFirework <= 0) {
      this._firework();
      this.nextFirework = t < 12 ? THREE.MathUtils.randFloat(0.5, 1.2) : THREE.MathUtils.randFloat(1.6, 3.2);
    }
    const crowd = this.game.island && this.game.island.track.crowdUniforms;
    if (crowd) crowd.uCheer.value = 1;
  }

  dispose() {
    this.group.removeFromParent();
    const M = this.materials;
    for (const o of this.owned) {
      if (o.isMaterial) M.retire(o);
      else o.dispose();
    }
    for (const c of this.cars) {
      M.retire(c.paint);
      M.retire(c.tailMat);
    }
    this.owned = [];
    this.cars = [];
  }
}
