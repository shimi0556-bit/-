import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParticleSystem, Emitter } from '../engine/fx/Particles.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function paint(g, hex, dark = null) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const d = dark ? new THREE.Color(dark.color) : null;
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) (d && dark.test(p.getX(i), p.getY(i), p.getZ(i)) ? d : c).toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * The spaceport in the city: a launch mount over a flame trench, a
 * lattice tower with swing arms, tank farm, and a two-stage rocket — a
 * super-heavy booster with a steel spaceship on top. It stands there in
 * every visit to the city, and it flies at the start of the space race.
 */
export class Spaceport {
  constructor(engine, materials, pad) {
    this.engine = engine;
    this.materials = materials;
    this.pad = pad;
    this.group = new THREE.Group();
    this.group.name = 'נמל חלל';
  }

  build() {
    const P = this.pad;
    const base = P.h;
    this.top = base + 18; // launch mount deck
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    this.mat = mat;
    const parts = [];
    // Launch mount: a ring table on six legs over the trench, on a concrete apron.
    parts.push(paint(new THREE.CylinderGeometry(55, 58, 1.2, 40).translate(0, 0.6, 0), 0xb9b6ae));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(paint(new THREE.BoxGeometry(2.4, 17, 2.4).translate(Math.cos(a) * 9, 8.5, Math.sin(a) * 9), 0x55595e));
    }
    parts.push(paint(new THREE.TorusGeometry(8.5, 1.4, 8, 24).rotateX(Math.PI / 2).translate(0, 17.3, 0), 0x6b6f75));
    parts.push(paint(new THREE.BoxGeometry(12, 1.2, 60).translate(0, 0.9, 40), 0x2a2a2a)); // trench, both ways
    parts.push(paint(new THREE.BoxGeometry(12, 1.2, 60).translate(0, 0.9, -40), 0x2a2a2a));
    // Tower: four columns, braces every 6 m, two swing arms.
    const tx = 20;
    const H = 110;
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) parts.push(paint(new THREE.BoxGeometry(1, H, 1).translate(tx + dx, H / 2, dz), 0x3c4046));
    for (let y = 6; y < H; y += 6) {
      parts.push(paint(new THREE.BoxGeometry(9, 0.5, 0.5).translate(tx, y, -4), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(9, 0.5, 0.5).translate(tx, y, 4), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 9).translate(tx - 4, y, 0), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 9).translate(tx + 4, y, 0), 0x3c4046));
    }
    parts.push(paint(new THREE.BoxGeometry(10, 4, 10).translate(tx, H + 2, 0), 0xd94a3a));
    parts.push(paint(new THREE.BoxGeometry(0.4, 12, 0.4).translate(tx, H + 10, 0), 0xdddddd));
    // Tank farm.
    for (let k = 0; k < 4; k++) {
      parts.push(paint(new THREE.SphereGeometry(7, 14, 10).translate(-40 + k * 16, 7, -44), 0xeeeeea));
      parts.push(paint(new THREE.CylinderGeometry(3.5, 3.5, 22, 12).rotateZ(Math.PI / 2).translate(-38 + k * 14, 4, 46), 0xdcdcd6));
    }
    const pad = new THREE.Mesh(mergeGeometries(parts), mat);
    pad.castShadow = true;
    pad.receiveShadow = true;
    pad.name = 'כן שיגור';
    this.group.add(pad);
    // Swing arms (they rotate away before liftoff).
    this.arms = [];
    for (const [y, len] of [[this.top - base + 58, 13], [this.top - base + 78, 13]]) {
      const arm = new THREE.Group();
      arm.position.set(tx - 4, y, 0);
      const beam = new THREE.Mesh(paint(new THREE.BoxGeometry(len, 2.2, 2.6).translate(-len / 2, 0, 0), 0x6b6f75), mat);
      arm.add(beam);
      this.group.add(arm);
      this.arms.push(arm);
    }
    this.group.position.set(P.x, base, P.z);
    // The rocket.
    this.rocket = this._rocket();
    this.group.add(this.rocket.group);
    this.reset();
    this.group.traverse((o) => (o.userData.noPick = true));
    return this.group;
  }

  _rocket() {
    const steel = 0xc9ccd0;
    const tiles = { color: 0x1c1d20, test: (x) => x < -1.2 };
    const R = 4.5;
    const booster = [];
    booster.push(paint(new THREE.CylinderGeometry(R, R, 50, 28, 6).translate(0, 25, 0), steel));
    booster.push(paint(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 1.4, 28, 1, true).translate(0, 48.6, 0), 0x2a2c30)); // hot-stage ring
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      booster.push(paint(new THREE.BoxGeometry(0.4, 3.2, 3.6).translate(R + 0.3, 45.5, 0).rotateY(a), 0x3a3d42)); // grid fins
    }
    for (let k = 0; k < 13; k++) {
      const a = (k / 10) * Math.PI * 2;
      const r = k < 10 ? 3.2 : 1.1;
      const x = k < 10 ? Math.cos(a) * r : Math.cos((k - 10) * 2.1) * r;
      const z = k < 10 ? Math.sin(a) * r : Math.sin((k - 10) * 2.1) * r;
      booster.push(paint(new THREE.CylinderGeometry(0.45, 0.8, 1.8, 10, 1, true).translate(x, -0.9, z), 0x2b2b2e)); // engine bells
    }
    const ship = [];
    ship.push(paint(new THREE.CylinderGeometry(R, R, 32, 28, 4).translate(0, 16, 0), steel, tiles));
    const nose = new THREE.LatheGeometry(
      [
        [R, 0],
        [R * 0.98, 3],
        [R * 0.88, 6],
        [R * 0.68, 9],
        [R * 0.38, 11.5],
        [0.01, 13],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ).translate(0, 32, 0);
    ship.push(paint(nose, steel, tiles));
    for (const side of [-1, 1]) {
      ship.push(paint(new THREE.BoxGeometry(0.35, 5, 3.4).translate(side * (R + 0.9), 37.5, 0), 0x2a2c30)); // forward flaps
      ship.push(paint(new THREE.BoxGeometry(0.4, 8, 5).translate(side * (R + 1.6), 4.5, 0), 0x2a2c30)); // aft flaps
    }
    for (let k = 0; k < 3; k++) ship.push(paint(new THREE.CylinderGeometry(0.4, 0.9, 1.6, 10, 1, true).translate(Math.cos(k * 2.1) * 1.4, -0.8, Math.sin(k * 2.1) * 1.4), 0x2b2b2e));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85 });
    this.rocketMat = mat;
    const bMesh = new THREE.Mesh(mergeGeometries(booster), mat);
    const sMesh = new THREE.Mesh(mergeGeometries(ship), mat);
    bMesh.castShadow = sMesh.castShadow = true;
    const group = new THREE.Group();
    const bGroup = new THREE.Group();
    bGroup.add(bMesh);
    const sGroup = new THREE.Group();
    sGroup.add(sMesh);
    sGroup.position.y = 50;
    group.add(bGroup, sGroup);
    group.name = 'רקטה';
    return { group, booster: bGroup, ship: sGroup };
  }

  /** Rocket back on the mount, arms in. */
  reset() {
    const r = this.rocket;
    r.group.position.set(0, this.top - this.pad.h + 1, 0);
    r.group.rotation.set(0, 0, 0);
    r.group.visible = true;
    r.group.add(r.booster);
    r.booster.position.set(0, 0, 0);
    r.booster.rotation.set(0, 0, 0);
    r.ship.position.set(0, 50, 0);
    for (const a of this.arms) a.rotation.y = 0;
  }

  // ---------------------------------------------------------------- launch

  /**
   * The launch, as a film: countdown and venting, ignition in a wall of
   * fire and smoke, liftoff seen from the pad, the climb over the city and
   * out of the sky, staging. Resolves when the ship reaches space (or when
   * the player skips). `hooks.message(text, sub)` shows captions.
   */
  play(game, hooks = {}) {
    const eng = this.engine;
    const cam = eng.camera;
    const atm = eng.atmosphere;
    const P = this.pad;
    const world = new THREE.Vector3();
    const R = this.rocket;
    const origin = new THREE.Vector3(P.x, this.top + 1, P.z);
    // Particle systems big enough for a launch plume.
    const T = this.materials.textures;
    const plume = new ParticleSystem(eng, { name: 'ענן שיגור', texture: T.smoke, max: 2600, additive: false, lit: true });
    const flame = new ParticleSystem(eng, { name: 'להבת מנועים', texture: T.flame, max: 1600, additive: true });
    eng.particles.systems.plume = plume;
    eng.particles.systems.flame = flame;
    const vent = new Emitter(plume, { position: origin.clone().add(new THREE.Vector3(0, 46, 4.8)), dir: new THREE.Vector3(0.3, 0.2, 1).normalize(), rate: 14, spread: 0.3, speed: [2, 4], life: [2, 3.5], size0: [1, 2], size1: [5, 8], color0: [0.95, 0.96, 1, 0.5], color1: [1, 1, 1, 0], gravity: 0.6, drag: 0.6, turbulence: 0.6 });
    const engines = new Emitter(flame, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.12, radius: 3.2, speed: [45, 70], life: [0.35, 0.6], size0: [4, 6], size1: [9, 14], color0: [1, 0.85, 0.55, 1], color1: [1, 0.4, 0.1, 0], intensity: 9, drag: 0.5 });
    const trench = [1, -1].map((side) => new Emitter(plume, { position: new THREE.Vector3(P.x, P.h + 2, P.z + side * 66), dir: new THREE.Vector3(0, 0.25, side).normalize(), rate: 0, spread: 0.55, radius: 6, speed: [18, 34], life: [5, 9], size0: [8, 12], size1: [30, 48], color0: [0.92, 0.9, 0.86, 0.85], color1: [0.8, 0.78, 0.75, 0], drag: 0.35, turbulence: 1.4, gravity: -0.5 }));
    const column = new Emitter(plume, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.35, radius: 4, speed: [8, 16], life: [6, 10], size0: [6, 10], size1: [22, 36], color0: [0.95, 0.94, 0.92, 0.8], color1: [0.85, 0.85, 0.85, 0], drag: 0.5, turbulence: 1.1, gravity: -0.3 });
    const shipFire = new Emitter(flame, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.1, radius: 1.2, speed: [40, 60], life: [0.25, 0.45], size0: [2.5, 3.5], size1: [6, 9], color0: [0.8, 0.85, 1, 1], color1: [0.5, 0.4, 1, 0], intensity: 10, drag: 0.4 });
    const emitters = [vent, engines, ...trench, column, shipFire];
    for (const e of emitters) eng.particles.add(e);
    // Rumble: filtered noise on the effects bus.
    const A = eng.audio;
    let rumble = null;
    if (A.ctx && A.enabled) {
      const ctx = A.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
        d[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g).connect(A.sfx);
      src.start();
      rumble = { src, g, lp, ctx };
    }
    const saved = { fov: cam.fov };
    let t = 0;
    let done = false;
    let skip = false;
    let said = -1;
    let lift = 0; // seconds since liftoff
    let y = 0;
    let v = 0;
    let separated = false;
    const boosterFall = { v: new THREE.Vector3(), w: 0 };
    const IGNITE = 7;
    const LIFTOFF = 10;
    const STAGE = 24;
    const END = 27.5;
    const look = new THREE.Vector3();
    const want = new THREE.Vector3();
    const onSkip = (e) => {
      if (e.type === 'keydown' && !['Space', 'Enter', 'Escape'].includes(e.code)) return;
      skip = true;
    };
    window.addEventListener('keydown', onSkip);
    window.addEventListener('pointerdown', onSkip);
    return new Promise((resolve) => {
      const rig = {
        focusPoint: () => look.clone(),
        update: (dt) => {
          if (done) return;
          dt = Math.min(dt, 0.05);
          t += dt;
          // Countdown captions.
          const count = Math.ceil(LIFTOFF - t);
          if (count !== said && count >= 0 && count <= 10) {
            said = count;
            if (hooks.message) hooks.message(count > 0 ? String(count) : 'המראה!', count === 3 ? 'הצתת מנועים' : count > 0 ? 'ספירה לאחור' : '');
            if (A.ctx && A.enabled && count > 0) A._tone(A.sfx, { freq: count <= 3 ? 880 : 660, dur: 0.12, gain: 0.06, type: 'sine' });
          }
          // Swing arms retract before ignition.
          for (const a of this.arms) a.rotation.y = -smooth(IGNITE - 3, IGNITE - 0.5, t) * 1.4;
          // Engines and motion.
          const fire = smooth(IGNITE, IGNITE + 1.2, t);
          if (t > LIFTOFF) {
            lift = t - LIFTOFF;
            const a = 7 + lift * 2.6;
            v += a * dt;
            y += v * dt;
          }
          R.group.position.y = this.top - P.h + 1 + y;
          // A gentle pitch-over (gravity turn) once clear of the tower.
          R.group.rotation.x = -smooth(4, 16, lift) * 0.35;
          R.group.updateMatrixWorld(true);
          R.booster.getWorldPosition(world);
          const tail = world.clone();
          const down = new THREE.Vector3(0, -1, 0).applyQuaternion(R.group.quaternion);
          vent.enabled = t < IGNITE;
          engines.position.copy(tail);
          engines.o.dir.copy(down);
          engines.rate = separated ? 0 : fire * 420;
          engines.o.speed = [45 + lift * 4, 70 + lift * 6];
          const near = smooth(8, 0, y);
          for (const e of trench) e.rate = fire * near * 60;
          column.position.copy(tail);
          column.rate = fire * (t < LIFTOFF + 10 ? 40 : 12);
          column.o.color0 = [0.95, 0.94, 0.92, 0.8 * (1 - smooth(1500, 3500, y))];
          if (rumble) {
            const tt = rumble.ctx.currentTime;
            rumble.g.gain.setTargetAtTime(fire * 0.9 * (1 - smooth(2500, 5000, y) * 0.8), tt, 0.3);
            rumble.lp.frequency.setTargetAtTime(160 + fire * 220, tt, 0.3);
          }
          if (fire > 0.5 && y < 400) eng.events.emit('shake', { strength: 0.12 * fire * (1 - y / 400) });
          // Staging: the booster drops away, the ship lights up.
          if (!separated && t > STAGE) {
            separated = true;
            R.booster.getWorldPosition(world);
            R.group.parent.attach(R.booster);
            boosterFall.v.copy(down).multiplyScalar(-v * 0.8).add(new THREE.Vector3(0, -5, 0));
            if (A.ctx && A.enabled) A._burst(A.sfx, { dur: 0.6, freq: 200, q: 0.6, gain: 0.5, type: 'lowpass' });
          }
          if (separated) {
            boosterFall.v.y -= 9.8 * dt;
            R.booster.position.addScaledVector(boosterFall.v, dt);
            R.booster.rotation.z += dt * 0.25;
            R.ship.getWorldPosition(world);
            shipFire.position.copy(world);
            shipFire.o.dir.copy(down);
            shipFire.rate = 260;
          }
          // Out of the air: the sky darkens to black as the ship climbs.
          atm.space = smooth(900, 4200, y);
          // Camera shots.
          const rp = R.group.getWorldPosition(new THREE.Vector3());
          if (t < 5) {
            // From the air over the city: the rocket on its mount, venting.
            const a = 0.7 + t * 0.05;
            want.set(P.x + Math.cos(a) * 420, P.h + 190 - t * 12, P.z + Math.sin(a) * 420);
            look.set(P.x, P.h + 55, P.z);
            cam.fov = 40;
          } else if (t < LIFTOFF + 3) {
            // On the apron as the engines light.
            want.set(P.x + 62, P.h + 3, P.z + 38);
            look.set(P.x, rp.y + 28, P.z);
            cam.fov = 58;
          } else if (t < LIFTOFF + 8) {
            // Watching it climb from the apron.
            want.set(P.x + 62, P.h + 3, P.z + 38);
            look.copy(rp).add(new THREE.Vector3(0, 40, 0));
            cam.fov = THREE.MathUtils.clamp(58 - lift * 4, 22, 58);
          } else {
            // Chase from above and behind: the city, then the islands, falling away below.
            want.copy(rp).add(new THREE.Vector3(60, 110 + lift * 4, 190 + lift * 6));
            look.copy(rp).add(new THREE.Vector3(0, -20, -40));
            cam.fov = 55;
          }
          const k = t < 0.1 ? 1 : 1 - Math.exp(-dt * (t > LIFTOFF + 8 ? 3 : 2));
          cam.position.lerp(want, k);
          cam.lookAt(look);
          cam.updateProjectionMatrix();
          if (hooks.fade) hooks.fade(smooth(END - 1.2, END, t));
          if (t > END || skip) finish();
        },
      };
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onSkip);
        window.removeEventListener('pointerdown', onSkip);
        for (const e of emitters) eng.particles.remove(e);
        // Let the plume hang a moment, then take the systems down.
        setTimeout(() => {
          for (const s of [plume, flame]) {
            s.mesh.removeFromParent();
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
          }
          delete eng.particles.systems.plume;
          delete eng.particles.systems.flame;
        }, 100);
        if (rumble) {
          rumble.g.gain.setTargetAtTime(0, rumble.ctx.currentTime, 0.4);
          setTimeout(() => rumble.src.stop(), 2000);
        }
        cam.fov = saved.fov;
        cam.updateProjectionMatrix();
        resolve();
      };
      eng.cameraRig = rig;
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    this.mat.dispose();
    this.rocketMat.dispose();
  }
}
