import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Emitter } from '../engine/fx/Particles.js';

/** The four surprises a box can hold. */
export const ITEMS = {
  shots: { name: 'יריות', charges: 2, color: '#ff8a2a' },
  mine: { name: 'מוקש', charges: 2, color: '#ff3b3b' },
  turbo: { name: 'טורבו', charges: 1, color: '#39d9ff' },
  shield: { name: 'מגן', charges: 1, color: '#9b7bff' },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Surprise boxes on the circuit and everything that comes out of them:
 * rows of glowing "?" boxes on the straights; a car that drives through one
 * gets an item (weighted by race position, like arcade kart racers): shots
 * that chase the car ahead along the track, mines dropped behind, a turbo
 * burst, or a shield that absorbs one hit. AI drivers decide when to use
 * theirs. A hit knocks a car sideways, spins it and scrubs its speed.
 */
export class Pickups {
  constructor(race) {
    this.race = race;
    this.engine = race.engine;
    this.track = race.track;
    this.group = new THREE.Group();
    this.group.name = 'הפתעות';
    this.projectiles = [];
    this.mines = [];
    this._q = {};
    this.time = 0;
    this._boxes();
    this._assets();
    this._warmup();
    this.engine.scene.add(this.group);
  }

  /**
   * One of each lazily created mesh, parked far below the island: the
   * start-of-race shader compile then covers them, so the first shot,
   * mine or shield does not stall a frame compiling its program.
   */
  _warmup() {
    const park = new THREE.Group();
    park.position.set(0, -5000, 0);
    park.name = 'חימום שיידרים';
    for (const [g, m] of [
      [this.shotGeo, this.shotMat],
      [this.mineGeo, this.mineMat],
      [this.mineTop, this.mineLight],
      [this.spikeGeo, this.mineMat],
      [this.shotGeo, this.shieldMat],
    ]) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      park.add(mesh);
    }
    this.group.add(park);
  }

  // ------------------------------------------------------------ setup

  /** Item-box rows on the calmest stretches, spread around the lap. */
  _boxes() {
    const tr = this.track;
    const n = tr.n;
    const rows = 5;
    const picks = [];
    const minGap = n / (rows + 1);
    const score = (i) => {
      let k = 0;
      for (let d = -15; d <= 15; d++) k += Math.abs(tr.kappa[(i + d + n) % n]);
      return k;
    };
    const cand = [];
    for (let i = 0; i < n; i += 5) {
      const d0 = i * tr.ds;
      if (d0 < 180 || d0 > tr.length - 60) continue; // not on the grid or the finish straight
      cand.push({ i, k: score(i) });
    }
    cand.sort((a, b) => a.k - b.k);
    for (const c of cand) {
      if (picks.length >= rows) break;
      if (picks.every((p) => Math.min(Math.abs(p - c.i), n - Math.abs(p - c.i)) > minGap)) picks.push(c.i);
    }
    this.boxes = [];
    for (const i of picks.sort((a, b) => a - b)) {
      for (const lat of [-4.8, -2.4, 0, 2.4, 4.8]) {
        const pose = tr.pose(i / n, lat);
        this.boxes.push({ i, lat, pos: pose.position.clone().add(new THREE.Vector3(0, 1.0, 0)), respawn: 0, phase: Math.random() * 6 });
      }
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#d8d8ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 120, 120);
    g.font = '800 104px "Karantina", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#1b1202';
    g.strokeText('?', 64, 70);
    g.fillStyle = '#ffb020';
    g.fillText('?', 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 });
    this.engine.materials.trackEmissive(mat, 0.35);
    this.boxMat = mat;
    this.boxMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1.1, 1.1, 1.1, 3, 0.18), mat, this.boxes.length);
    this.boxMesh.castShadow = true;
    this.boxMesh.frustumCulled = false;
    this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.boxMesh);
  }

  _assets() {
    const M = this.engine.materials;
    this.shotMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 1, roughness: 0.3 });
    M.trackEmissive(this.shotMat, 3);
    this.shotGeo = new THREE.SphereGeometry(0.32, 16, 12);
    this.mineMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.4, metalness: 0.8 });
    this.mineLight = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 1 });
    M.trackEmissive(this.mineLight, 2);
    this.mineGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.22, 20);
    this.mineTop = new THREE.SphereGeometry(0.16, 12, 8);
    const spikes = new THREE.ConeGeometry(0.08, 0.3, 6);
    spikes.rotateZ(Math.PI / 2);
    this.spikeGeo = spikes;
    // Shield bubble: fresnel rim, additive.
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uColor: { value: new THREE.Color(0.55, 0.45, 1.0) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vP = position;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGain; uniform vec3 uColor;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.5);
          float hex = 0.5 + 0.5 * sin(vP.x * 18.0 + uTime * 3.0) * sin(vP.y * 18.0) * sin(vP.z * 18.0 - uTime * 2.0);
          gl_FragColor = vec4(uColor * (f * 1.6 + hex * 0.12) * uGain, 1.0);
        }`,
    });
  }

  // ------------------------------------------------------------ items

  /** Random item, weighted by position: leaders get defence, the back of the pack gets speed and firepower. */
  _roll(entry) {
    const n = this.race.entries.length;
    const t = (entry.position - 1) / Math.max(1, n - 1); // 0 = leader, 1 = last
    const w = { shield: 0.8 - t * 0.5, mine: 1.0 - t * 0.4, shots: 0.9 + t * 0.7, turbo: 0.5 + t * 1.2 };
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) return k;
    }
    return 'turbo';
  }

  give(entry, kind, charges = null) {
    entry.item = { kind, charges: charges ?? ITEMS[kind].charges };
    this.engine.events.emit('item:get', { entry, kind });
  }

  /** Fires / drops / activates the entry's current item. */
  use(entry) {
    const it = entry.item;
    if (!it || this.race.state !== 'racing' || entry.finished) return false;
    const car = entry.car;
    const ev = this.engine.events;
    if (it.kind === 'turbo') {
      car.vehicle.boost = 1.9;
      ev.emit('item:use', { entry, kind: 'turbo' });
    } else if (it.kind === 'shield') {
      entry.shield = 9;
      ev.emit('item:use', { entry, kind: 'shield' });
    } else if (it.kind === 'shots') this._fire(entry);
    else if (it.kind === 'mine') this._drop(entry);
    it.charges--;
    if (it.charges <= 0) entry.item = null;
    return true;
  }

  _fire(entry) {
    const tr = this.track;
    const q = entry.q;
    if (!q) return;
    // Target: the nearest car ahead within 160 m.
    let target = null;
    let best = 160;
    for (const o of this.race.entries) {
      if (o === entry || o.finished) continue;
      let d = (o.progress - entry.progress) * tr.length;
      if (d < 0 || d > best) continue;
      best = d;
      target = o;
    }
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    this.group.add(mesh);
    const trail = new Emitter(this.engine.particles.systems.glow, {
      rate: 90,
      spread: 0.6,
      speed: [0.2, 1],
      life: [0.25, 0.5],
      size0: [0.35, 0.5],
      size1: [0.05, 0.1],
      color0: [1.0, 0.55, 0.15, 1],
      color1: [1.0, 0.2, 0.05, 0],
      intensity: 6,
    });
    this.engine.particles.add(trail);
    const speed = Math.max(Math.abs(entry.car.vehicle.speed), 20) + 26;
    this.projectiles.push({ owner: entry, target, s: q.s + 3 / tr.length, lat: q.lat, speed, life: 3.0, mesh, trail, age: 0 });
    this.engine.events.emit('item:use', { entry, kind: 'shots' });
  }

  _drop(entry) {
    const tr = this.track;
    const q = entry.q;
    if (!q) return;
    const s = q.s - 4.5 / tr.length;
    const pose = tr.pose(s, q.lat);
    const g = new THREE.Group();
    const base = new THREE.Mesh(this.mineGeo, this.mineMat);
    base.position.y = 0.11;
    base.castShadow = true;
    g.add(base);
    const top = new THREE.Mesh(this.mineTop, this.mineLight);
    top.position.y = 0.26;
    g.add(top);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(this.spikeGeo, this.mineMat);
      const a = (k / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62);
      sp.rotation.y = -a;
      g.add(sp);
    }
    g.position.copy(pose.position);
    this.group.add(g);
    this.mines.push({ owner: entry, pos: pose.position.clone(), obj: g, top, armed: 0.7, life: 90 });
    if (this.mines.length > 14) this._removeMine(this.mines[0]);
    this.engine.events.emit('item:use', { entry, kind: 'mine' });
  }

  _removeMine(m) {
    m.obj.removeFromParent();
    this.mines.splice(this.mines.indexOf(m), 1);
  }

  /** A shot or mine connects. Shields absorb it. */
  hit(entry, by, kind, point) {
    const ev = this.engine.events;
    if (entry.shield > 0) {
      entry.shield = 0;
      ev.emit('item:blocked', { entry, by, kind, point });
      return;
    }
    const car = entry.car;
    const b = car.body;
    const v = car.vehicle;
    const side = Math.random() < 0.5 ? -1 : 1;
    b.velocity.x *= 0.35;
    b.velocity.z *= 0.35;
    b.velocity.x += car.right.x * side * 3;
    b.velocity.z += car.right.z * side * 3;
    b.velocity.y += kind === 'mine' ? 5.5 : 2.2;
    b.angularVelocity.y += side * (kind === 'mine' ? 5 : 7);
    v.stun = kind === 'mine' ? 1.3 : 1.0;
    v.boost = 0;
    const P = this.engine.particles;
    P.impact(point || car.position, null, 1.5);
    const fire = new Emitter(P.systems.fire, {
      position: (point || car.position).clone(),
      spread: 1.2,
      radius: 0.6,
      speed: [2, 6],
      life: [0.3, 0.7],
      size0: [0.8, 1.4],
      size1: [0.2, 0.4],
      color0: [1.0, 0.6, 0.2, 1],
      color1: [0.6, 0.15, 0.05, 0],
      gravity: -2,
      intensity: 2.2,
    });
    fire.burst(kind === 'mine' ? 40 : 24);
    ev.emit('item:hit', { entry, by, kind, point: (point || car.position).clone() });
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    if (dt <= 0) return;
    this.time += dt;
    const race = this.race;
    const tr = this.track;
    const t = this.time;
    const racing = race.state === 'racing' || race.state === 'finished';
    // Boxes: spin, bob, rainbow; collect on contact.
    for (let k = 0; k < this.boxes.length; k++) {
      const bx = this.boxes[k];
      if (bx.respawn > 0) bx.respawn -= dt;
      const visible = bx.respawn <= 0;
      const grow = visible ? Math.min(1, 1 - bx.respawn) : 0;
      _q.setFromAxisAngle(UP, t * 1.6 + bx.phase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35));
      _p.copy(bx.pos);
      _p.y += Math.sin(t * 2.2 + bx.phase) * 0.18;
      _s.setScalar(visible ? Math.max(0.001, grow) : 0.001);
      _m.compose(_p, _q, _s);
      this.boxMesh.setMatrixAt(k, _m);
      _c.setHSL((t * 0.15 + k * 0.07) % 1, 0.75, 0.62);
      this.boxMesh.setColorAt(k, _c);
      if (!visible || !racing) continue;
      for (const e of race.entries) {
        if (e.item || e.finished) continue;
        const dx = e.car.position.x - bx.pos.x;
        const dz = e.car.position.z - bx.pos.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
          bx.respawn = 1.4;
          this.give(e, this._roll(e));
          const P = this.engine.particles;
          new Emitter(P.systems.glow, { position: bx.pos.clone(), spread: Math.PI, speed: [2, 6], life: [0.3, 0.7], size0: [0.2, 0.35], size1: [0.02, 0.05], color0: [1, 0.85, 0.4, 1], color1: [0.6, 0.4, 1, 0], drag: 2, intensity: 8 }).burst(24);
          break;
        }
      }
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    if (this.boxMesh.instanceColor) this.boxMesh.instanceColor.needsUpdate = true;

    // Shots: run along the track, curving toward their target's line.
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k];
      p.age += dt;
      p.life -= dt;
      p.s += (p.speed * dt) / tr.length;
      // Gentle homing: a sharp swerve can still dodge it.
      if (p.target && !p.target.finished && p.target.q) p.lat += Math.max(-4 * dt, Math.min(4 * dt, (p.target.q.lat - p.lat) * dt * 2));
      const pose = tr.pose(p.s, p.lat);
      p.mesh.position.copy(pose.position);
      p.mesh.position.y += 0.7 + Math.sin(p.age * 30) * 0.03;
      p.trail.position.copy(p.mesh.position);
      let done = p.life <= 0;
      for (const e of race.entries) {
        if (done) break;
        if (e === p.owner && p.age < 0.6) continue;
        if (e.car.position.distanceToSquared(p.mesh.position) < 2.3 * 2.3) {
          this.hit(e, p.owner, 'shots', p.mesh.position);
          done = true;
        }
      }
      if (done) {
        p.mesh.removeFromParent();
        this.engine.particles.remove(p.trail);
        this.projectiles.splice(k, 1);
      }
    }

    // Mines: blink, arm, trigger.
    for (let k = this.mines.length - 1; k >= 0; k--) {
      const m = this.mines[k];
      m.armed -= dt;
      m.life -= dt;
      m.top.visible = Math.sin(t * 9 + k) > 0;
      let boom = m.life <= 0;
      if (m.armed <= 0 && racing) {
        for (const e of race.entries) {
          const dx = e.car.position.x - m.pos.x;
          const dz = e.car.position.z - m.pos.z;
          if (dx * dx + dz * dz < 2.1 * 2.1) {
            this.hit(e, m.owner, 'mine', m.pos.clone().add(new THREE.Vector3(0, 0.4, 0)));
            boom = true;
            break;
          }
        }
      }
      if (boom) this._removeMine(m);
    }

    // Shields tick down; AI decides what to do with what it holds.
    this.shieldMat.uniforms.uTime.value = t;
    this.shieldMat.uniforms.uGain.value = Math.min(4, (this.engine.materials.emissiveScale || 1) * 0.12);
    for (const e of race.entries) {
      if (e.shield > 0) e.shield -= dt;
      this._bubble(e);
      if (!e.isPlayer || e.autopilot) this._think(e, dt);
    }
  }

  _bubble(e) {
    const on = e.shield > 0;
    if (on && !e.bubble) {
      const sp = e.car.spec;
      const g = new THREE.SphereGeometry(1, 32, 16);
      e.bubble = new THREE.Mesh(g, this.shieldMat);
      e.bubble.scale.set(sp.body.half[0] + 0.55, 1.1, sp.body.half[2] + 0.5);
      e.bubble.position.y = 0.15;
      e.bubble.renderOrder = 9;
      e.car.object.add(e.bubble);
    }
    if (e.bubble) e.bubble.visible = on && (e.shield > 1.5 || Math.sin(this.time * 20) > 0);
  }

  /** AI: steer for a box when empty-handed, use items when it pays. */
  _think(e, dt) {
    if (this.race.state !== 'racing' || e.finished) return;
    const drv = e.autopilot || e.driver;
    if (!e.item && e.q) {
      const tr = this.track;
      let seek = null;
      let bestD = 75;
      for (const bx of this.boxes) {
        if (bx.respawn > 0) continue;
        let d = (bx.i - e.q.i) * tr.ds;
        if (d < 0) d += tr.length;
        if (d < 4 || d > bestD + 3) continue;
        if (seek === null || d < bestD - 3 || Math.abs(bx.lat - e.q.lat) < Math.abs(seek - e.q.lat)) {
          bestD = Math.min(bestD, d);
          seek = bx.lat;
        }
      }
      drv.seekLat = seek;
    } else drv.seekLat = null;
    if (!e.item) return;
    e.itemT = (e.itemT || 0) + dt;
    if (e.itemT < 0.8) return;
    // Opponents think about their item a few times a second, not every frame.
    e.thinkT = (e.thinkT || 0) - dt;
    if (e.thinkT > 0) return;
    e.thinkT = 0.5 + Math.random() * 0.7;
    const tr = this.track;
    const q = e.q;
    if (!q) return;
    const kind = e.item.kind;
    const gapTo = (o) => {
      let d = (o.progress - e.progress) * tr.length;
      if (d > tr.length / 2) d -= tr.length;
      if (d < -tr.length / 2) d += tr.length;
      return d;
    };
    let go = false;
    if (kind === 'turbo') {
      let calm = true;
      for (let d = 0; d < 90; d += 6) if (Math.abs(tr.kappa[(q.i + Math.round(d / tr.ds)) % tr.n]) > 1 / 250) calm = false;
      go = calm && Math.abs(e.car.vehicle.speed) > 15;
    } else if (kind === 'shots') {
      go = this.race.entries.some((o) => o !== e && !o.finished && o.q && gapTo(o) > 12 && gapTo(o) < 80 && Math.abs(o.q.lat - q.lat) < 4) && Math.random() < 0.6;
    } else if (kind === 'mine') {
      go = this.race.entries.some((o) => o !== e && gapTo(o) < -6 && gapTo(o) > -45) || e.itemT > 12;
    } else if (kind === 'shield') {
      go = this.projectiles.some((p) => p.target === e) || e.itemT > 6;
    }
    if (go) {
      this.use(e);
      e.itemT = 0;
    }
  }

  dispose() {
    for (const p of this.projectiles) this.engine.particles.remove(p.trail);
    this.projectiles = [];
    this.mines = [];
    for (const e of this.race.entries) if (e.bubble) e.bubble.removeFromParent();
    this.group.removeFromParent();
    this.boxMesh.geometry.dispose();
    this.boxMat.map.dispose();
    const M = this.engine.materials;
    for (const m of [this.boxMat, this.shotMat, this.mineMat, this.mineLight]) {
      M.untrackEmissive(m);
      m.dispose();
    }
  }
}
