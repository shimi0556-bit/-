import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { humanMerged, paintHuman, SKINS, HAIRS } from './Humans.js';

/**
 * Racing craft for the races that are not on wheels: powerboats on the
 * sea, submarines along the reefs, stunt planes over the island and
 * paragliders riding thermals down from the heights.
 *
 * Arcade physics of their own (no rigid bodies): each craft integrates
 * its speed, heading, pitch and bank, collides with the island (height
 * field), the bridge piers and decks, and exposes the same surface a Car
 * does to the camera, the engine sound and the HUD (position, forward,
 * body.velocity, vehicle.{speed, rpm, gear, controls}, object, kmh).
 */
export const KINDS = {
  boat: { name: 'סירות מרוץ', short: 'סירות', top: 27, accel: 8.5, drag: 0.0042, turn: 1.15, laps: true, music: 'sea', lane: 7, spacing: 16 },
  sub: { name: 'צוללות', short: 'צוללות', top: 17, accel: 5, drag: 0.012, turn: 0.95, laps: true, music: 'deep', lane: 3.5, spacing: 12 },
  plane: { name: 'מטוסי מרוץ', short: 'מטוסים', cruise: 46, top: 64, min: 30, laps: true, music: 'sky', lane: 5, spacing: 45 },
  glider: { name: 'מצנחי רחיפה', short: 'מצנחים', trim: 10.5, fast: 14.5, slow: 7.2, laps: false, music: 'sky', lane: 6, spacing: 22 },
  space: { name: 'מירוץ חלל', short: 'חלליות', cruise: 85, top: 140, min: 45, laps: true, music: 'space', lane: 8, spacing: 40 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _w = { y: 0, dx: 0, dz: 0 };
const UP = new THREE.Vector3(0, 1, 0);

/** Flat-coloured, non-indexed copy (so many parts merge into one mesh). */
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function pilot(suit, seed, { helmet = 0xf2f2f2 } = {}) {
  const g = paintHuman(humanMerged({ hair: 'cap' }), { skin: SKINS[seed % SKINS.length], shirt: suit, pants: suit, hair: helmet, shoes: 0x1b1b1e });
  g.deleteAttribute('aPart');
  g.deleteAttribute('aLimb');
  return g;
}

// ------------------------------------------------------------------ models

function boatModel(color, stripe, seed) {
  // Lofted deep-V hull: cross-sections from the transom to a sharp, raised bow.
  const stations = [
    // z, half-beam at the deck, deck height, chine half-width, chine height, keel depth
    [-4.2, 1.2, 0.55, 1.1, -0.1, -0.45],
    [-2.5, 1.26, 0.55, 1.12, -0.12, -0.5],
    [-0.5, 1.26, 0.58, 1.08, -0.12, -0.52],
    [1.5, 1.12, 0.64, 0.88, -0.08, -0.48],
    [3.0, 0.8, 0.74, 0.55, 0.02, -0.35],
    [4.0, 0.42, 0.84, 0.22, 0.2, -0.1],
    [4.6, 0.04, 0.95, 0.02, 0.5, 0.35],
  ];
  const ring = ([z, bw, dh, cw, ch, kd]) => [
    [bw, dh],
    [cw, ch],
    [0, kd],
    [-cw, ch],
    [-bw, dh],
  ].map(([x, y]) => new THREE.Vector3(x, y, z));
  const rings = stations.map(ring);
  const pos = [];
  const col = [];
  const cTop = new THREE.Color(color);
  const cBand = new THREE.Color(stripe);
  const cBottom = new THREE.Color(0xf0f0ee);
  const quad = (a, b, c, d, cc) => {
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let k = 0; k < 4; k++) quad(A[k], A[k + 1], B[k], B[k + 1], k === 0 || k === 3 ? (i < 3 ? cBand : cTop) : cBottom);
    // Deck.
    quad(A[4], A[0], B[4], B[0], cTop);
  }
  // Transom.
  const T = rings[0];
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 4], [2, 3, 4]]) {
    pos.push(T[a].x, T[a].y, T[a].z, T[b].x, T[b].y, T[b].z, T[c].x, T[c].y, T[c].z);
    for (let k = 0; k < 3; k++) col.push(cBand.r, cBand.g, cBand.b);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hull.computeVertexNormals();
  const parts = [
    hull,
    paint(new THREE.BoxGeometry(1.7, 0.12, 2.3).translate(0, 0.52, -1.3), 0x3a3f47), // cockpit floor
    paint(new THREE.BoxGeometry(1.9, 0.3, 0.12).translate(0, 0.72, -2.45), 0xe8e6e0), // seat back bench
    paint(new THREE.BoxGeometry(1.8, 0.42, 0.06).rotateX(-0.6).translate(0, 0.86, 0.1), 0xa8d8ff), // windscreen
    paint(new THREE.CapsuleGeometry(0.24, 0.3, 4, 8).scale(1, 1, 1.4).translate(0, 0.85, -4.4), 0x33383f), // outboard cowling
    paint(new THREE.BoxGeometry(0.12, 0.8, 0.2).translate(0, 0.25, -4.45), 0x33383f), // leg
    pilot(color, seed).scale(0.9, 0.9, 0.9).translate(0, -0.05, -1.6),
  ];
  return mergeGeometries(parts);
}

function subModel(color, stripe, seed) {
  const body = new THREE.CapsuleGeometry(1.05, 4.6, 6, 14).rotateX(Math.PI / 2);
  const g = paint(body, color);
  // Darker belly band.
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const band = new THREE.Color(stripe);
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.35) band.toArray(col.array, i * 3);
  const parts = [
    g,
    paint(new THREE.CapsuleGeometry(0.45, 1.2, 4, 10).rotateX(Math.PI / 2).scale(1, 1.4, 1).translate(0, 1.05, 0.4), color), // sail
    paint(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0.1, 3.25), 0x9fe6ff), // dome window
    paint(new THREE.BoxGeometry(3.2, 0.08, 0.7).translate(0, 0.9, 0.5), color), // sail planes
    paint(new THREE.BoxGeometry(2.8, 0.1, 0.8).translate(0, 0, -2.8), stripe), // stern planes
    paint(new THREE.BoxGeometry(0.1, 2.0, 0.8).translate(0, 0, -2.8), stripe), // rudder
    paint(new THREE.CylinderGeometry(0.34, 0.2, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0, -3.6), 0x2a2d33), // shroud
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 8).rotateX(Math.PI / 2).translate(0.55, -0.55, 2.7), 0xfff4c8), // lamps
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 8).rotateX(Math.PI / 2).translate(-0.55, -0.55, 2.7), 0xfff4c8),
    pilot(stripe, seed).scale(0.6, 0.6, 0.6).translate(0, -0.55, 2.55),
  ];
  return mergeGeometries(parts);
}

function planeModel(color, stripe, seed) {
  const prof = [
    [0.02, 3.6],
    [0.35, 3.4],
    [0.55, 2.8],
    [0.62, 1.6],
    [0.58, 0.0],
    [0.42, -2.0],
    [0.2, -3.8],
    [0.05, -4.3],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 12).rotateX(Math.PI / 2).rotateX(Math.PI);
  const wing = new THREE.BoxGeometry(8.6, 0.16, 1.5);
  const wp = wing.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i);
    const t = Math.abs(x) / 4.3;
    wp.setZ(i, wp.getZ(i) * (1 - t * 0.45) - t * 0.25);
    wp.setY(i, wp.getY(i) + t * 0.25);
  }
  wing.computeVertexNormals();
  const tipL = new THREE.BoxGeometry(0.9, 0.17, 0.9).translate(3.9, 0.25, 0.1);
  const tipR = new THREE.BoxGeometry(0.9, 0.17, 0.9).translate(-3.9, 0.25, 0.1);
  const parts = [
    paint(fus, color),
    paint(wing.translate(0, -0.2, 0.9), color),
    paint(tipL, stripe),
    paint(tipR, stripe),
    paint(new THREE.BoxGeometry(3.0, 0.12, 0.9).translate(0, 0.25, -3.6), color), // tailplane
    paint(new THREE.BoxGeometry(0.12, 1.4, 1.1).translate(0, 0.9, -3.7), stripe), // fin
    paint(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.9, 1.9).translate(0, 0.45, 0.4), 0x243447), // canopy
    paint(new THREE.ConeGeometry(0.28, 0.6, 10).rotateX(Math.PI / 2).translate(0, 0, 3.9), 0xdddddd), // spinner
    paint(new THREE.BoxGeometry(0.15, 0.7, 0.15).translate(0.9, -0.75, 1.5), 0x333333), // gear legs
    paint(new THREE.BoxGeometry(0.15, 0.7, 0.15).translate(-0.9, -0.75, 1.5), 0x333333),
    paint(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10).rotateZ(Math.PI / 2).translate(0.9, -1.1, 1.5), 0x151515),
    paint(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10).rotateZ(Math.PI / 2).translate(-0.9, -1.1, 1.5), 0x151515),
    pilot(stripe, seed).scale(0.55, 0.55, 0.55).translate(0, -0.3, 0.35),
  ];
  return mergeGeometries(parts);
}

function gliderModel(color, stripe, seed) {
  // Canopy: an arc of cells, alternating colours, a few metres above the pilot.
  const parts = [];
  const cells = 13;
  const span = 10.5;
  const R = span / 2 / Math.sin(0.95);
  for (let k = 0; k < cells; k++) {
    const t = (k + 0.5) / cells - 0.5;
    const a = t * 1.9;
    const w = (span / cells) * 1.08;
    const chord = 2.6 * (1 - Math.abs(t) * 0.7);
    const cell = new THREE.BoxGeometry(w, 0.32, chord, 1, 1, 2);
    const cp = cell.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) + (cp.getZ(i) > 0 ? 0.1 : -0.05) * (1 - Math.abs(cp.getZ(i)) / chord));
    cell.computeVertexNormals();
    cell.rotateZ(-a);
    cell.translate(Math.sin(a) * R, 7.4 - (1 - Math.cos(a)) * R, 0);
    parts.push(paint(cell, k % 3 === 1 ? stripe : k % 3 === 2 ? 0xf2f2f2 : color));
  }
  // Harness pod and pilot sitting in it, legs forward.
  parts.push(paint(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8).rotateX(Math.PI / 2 - 0.3).translate(0, -0.1, 0.25), 0x1d2229));
  const p = pilot(color, seed);
  p.rotateX(-0.5);
  parts.push(p.translate(0, -0.55, -0.1));
  return mergeGeometries(parts);
}

function shipModel(color, stripe, seed) {
  const prof = [
    [0.02, 5.2],
    [0.45, 4.6],
    [0.9, 3.0],
    [1.15, 0.8],
    [1.2, -1.5],
    [1.05, -3.6],
    [0.85, -4.4],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const body = new THREE.LatheGeometry(prof, 14).rotateX(Math.PI / 2).rotateX(Math.PI);
  body.scale(1, 0.62, 1);
  const tri = (pts, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeVertexNormals();
    return paint(g, c);
  };
  const wing = (s) => {
    // Swept delta: root chord along the body, tip well back and out; top and bottom faces.
    const a = [s * 0.9, 0, 2.2];
    const b = [s * 5.6, -0.25, -3.2];
    const c = [s * 0.9, 0, -3.8];
    const top = s > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c];
    const bot = s > 0 ? [...a, ...b, ...c] : [...a, ...c, ...b];
    return [tri(top.map((v, i) => (i % 3 === 1 ? v + 0.08 : v)), color), tri(bot.map((v, i) => (i % 3 === 1 ? v - 0.08 : v)), stripe)];
  };
  const parts = [
    paint(body, color),
    ...wing(1),
    ...wing(-1),
    paint(new THREE.BoxGeometry(0.12, 1.6, 1.8).rotateZ(0.35).translate(0.9, 0.9, -3.2), stripe), // twin fins
    paint(new THREE.BoxGeometry(0.12, 1.6, 1.8).rotateZ(-0.35).translate(-0.9, 0.9, -3.2), stripe),
    paint(new THREE.CylinderGeometry(0.62, 0.7, 3.4, 12).rotateX(Math.PI / 2).translate(1.5, -0.1, -2.6), 0x3a3e45), // nacelles
    paint(new THREE.CylinderGeometry(0.62, 0.7, 3.4, 12).rotateX(Math.PI / 2).translate(-1.5, -0.1, -2.6), 0x3a3e45),
    paint(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.8, 2.2).translate(0, 0.52, 1.6), 0x16283a), // canopy
    paint(new THREE.BoxGeometry(2.2, 0.06, 0.4).translate(0, 0.45, -0.6), stripe),
  ];
  return mergeGeometries(parts);
}

function gliderLines() {
  const pts = [];
  const cells = 7;
  const span = 10.5;
  const R = span / 2 / Math.sin(0.95);
  for (let k = 0; k <= cells; k++) {
    const t = k / cells - 0.5;
    const a = t * 1.9;
    const x = Math.sin(a) * R;
    const y = 7.4 - (1 - Math.cos(a)) * R - 0.2;
    for (const z of [0.7, -0.6]) pts.push(Math.sign(x) * 0.25, 0.9, 0, x, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

// ------------------------------------------------------------------ craft

export class Craft {
  /**
   * env: { engine, particles, ground(x, z), wave(x, z, out), piers, decks, thermals, wind }
   * opts: { kind, color, stripe, name, number, isPlayer, position, heading, seed }
   */
  constructor(env, opts) {
    this.env = env;
    this.kind = opts.kind;
    this.spec = KINDS[opts.kind];
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name;
    this.color = opts.color;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.body = { velocity: this.velocity, position: this.position };
    this.yaw = 0;
    this.pitch = 0; // nose up, radians
    this.bank = 0; // right wing down, radians
    this.speed = 0;
    this.vy = 0;
    this.offroad = 0;
    this.crash = 0; // seconds until the race puts a crashed craft back
    this.boost = 1;
    this.vehicle = {
      controls: { throttle: 0, brake: 0, steer: 0, up: 0, down: 0, nitro: false, hold: true },
      speed: 0,
      rpm: 900,
      gear: '',
      reversing: false,
      nitro: 1,
      nitroActive: false,
      shift: 0,
      slip: [0, 0, 0, 0],
      lateralSpeed: () => 0,
      onShift: null,
      upsideDown: 0,
    };
    const seed = opts.seed || 1;
    const geo = { boat: boatModel, sub: subModel, plane: planeModel, glider: gliderModel, space: shipModel }[this.kind](opts.color, opts.stripe || '#111111', seed);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15, side: this.kind === 'glider' ? THREE.DoubleSide : THREE.FrontSide });
    this.object = new THREE.Group();
    this.object.name = `${this.spec.short}: ${opts.name}`;
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.object.add(mesh);
    if (this.kind === 'glider') this.object.add(new THREE.LineSegments(gliderLines(), new THREE.LineBasicMaterial({ color: 0x333333 })));
    if (this.kind === 'plane') {
      // Propeller disc: a faint blur that spins.
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 20), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
      disc.position.z = 4.15;
      this.prop = disc;
      this.object.add(disc);
    }
    if (this.kind === 'space') {
      // Engine glow: two hot discs and flame cones that grow with thrust.
      const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7fb8ff, emissiveIntensity: 1 });
      env.engine.materials.trackEmissive(glow, 8);
      this.glowMat = glow;
      const cone = new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.coneMat = cone;
      this.flames = [];
      for (const x of [1.5, -1.5]) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), glow);
        disc.position.set(x, -0.1, -4.32);
        disc.rotation.y = Math.PI;
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.5), cone);
        f.position.set(x, -0.1, -4.35);
        this.object.add(disc, f);
        this.flames.push(f);
      }
    }
    this.object.traverse((o) => (o.userData.noPick = true));
    env.engine.scene.add(this.object);
    this.place(opts.position, opts.heading || 0);
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  place(pos, yaw) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.bank = 0;
    this.vy = 0;
    const cruise = this.kind === 'plane' || this.kind === 'space' ? this.spec.cruise : this.kind === 'glider' ? this.spec.trim : 0;
    this.speed = cruise;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(cruise);
    this.crash = 0;
    this.object.visible = true;
    this._pose();
  }

  _fwd() {
    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /** Fixed-step physics. */
  step(dt, time) {
    const C = this.vehicle.controls;
    if (this.crash > 0) {
      this.crash -= dt;
      return;
    }
    if (C.hold) {
      // Before the start: boats idle on the swell, aircraft hang in formation.
      if (this.kind === 'boat') this._float(time, dt);
      this.speed = this.kind === 'plane' || this.kind === 'space' ? this.spec.cruise : this.kind === 'glider' ? this.spec.trim : 0;
      this.velocity.set(0, 0, 0);
      this._gauges(dt);
      return;
    }
    if (this.kind === 'boat') this._boat(dt, C, time);
    else if (this.kind === 'sub') this._sub(dt, C);
    else if (this.kind === 'plane') this._plane(dt, C);
    else if (this.kind === 'space') this._space(dt, C);
    else this._glider(dt, C);
    this._gauges(dt);
  }

  _gauges(dt) {
    const V = this.vehicle;
    const C = V.controls;
    V.speed = this.speed;
    V.reversing = this.speed < -0.5;
    const top = this.spec.top || this.spec.fast;
    const f = clamp(Math.abs(this.speed) / top, 0, 1.3);
    const target = this.kind === 'glider' ? 0 : 1200 + f * 5200 + C.throttle * 900;
    V.rpm += (target - V.rpm) * (1 - Math.exp(-dt * 6));
    const alt = this.position.y;
    V.gear = this.kind === 'boat' ? String(1 + Math.min(4, Math.floor(f * 5))) : this.kind === 'sub' ? `${Math.round(-alt)}מ` : this.kind === 'space' ? '' : `${Math.round(alt)}מ`;
    V.nitro = this.kind === 'boat' ? this.boost : null;
    V.nitroActive = !!this.nitroOn;
  }

  _float(time, dt) {
    this.env.wave(this.position.x, this.position.z, _w);
    this.position.y += (_w.y + 0.05 - this.position.y) * (1 - Math.exp(-dt * 8));
    this.wave = { dx: _w.dx, dz: _w.dz };
  }

  _boat(dt, C, time) {
    const K = this.spec;
    this.nitroOn = C.nitro && this.boost > 0.02 && C.throttle > 0.2;
    this.boost = this.nitroOn ? Math.max(0, this.boost - dt * 0.28) : Math.min(1, this.boost + dt * 0.06);
    const top = K.top * (this.nitroOn ? 1.3 : 1) * (this.topScale || 1);
    const thrust = C.throttle * K.accel * (this.nitroOn ? 1.5 : 1) * (this.speed < top ? 1 : 0);
    const reverse = C.brake * K.accel * (this.speed > 0 ? 1.1 : 0.45);
    this.speed += (thrust - reverse - this.speed * 0.12 - this.speed * Math.abs(this.speed) * K.drag) * dt;
    this.speed = clamp(this.speed, -6, top + 2);
    const eff = clamp(Math.abs(this.speed) / 6, 0.15, 1) * (1 - 0.3 * clamp((this.speed - 18) / 12, 0, 1));
    this.yaw -= C.steer * K.turn * eff * (this.speed < 0 ? -1 : 1) * dt;
    this._fwd();
    // The hull slides a little: velocity swings round to the heading.
    const k = 1 - Math.exp(-dt * 2.4);
    this.velocity.x += (this.forward.x * this.speed - this.velocity.x) * k;
    this.velocity.z += (this.forward.z * this.speed - this.velocity.z) * k;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    // Riding the swell: a spring towards the wave surface lets it skip off crests.
    this.env.wave(this.position.x, this.position.z, _w);
    const rest = _w.y + 0.05 + Math.min(0.35, Math.abs(this.speed) * 0.012);
    this.vy += ((rest - this.position.y) * 38 - this.vy * 7) * dt;
    if (this.position.y > rest + 0.05) this.vy -= 9.81 * dt * 0.6;
    this.position.y += this.vy * dt;
    if (this.position.y < rest - 0.4) {
      this.position.y = rest - 0.4;
      this.vy = Math.max(0, this.vy);
    }
    this.wave = { dx: _w.dx, dz: _w.dz };
    this.bankTarget = C.steer * eff * 0.2 * clamp(this.speed / 12, 0, 1);
    this.bank += (this.bankTarget - this.bank) * (1 - Math.exp(-dt * 4));
    // Running aground: pushed back off the shallows.
    const g = this.env.ground(this.position.x, this.position.z);
    this.offroad = g > -1.2 ? 1 : 0;
    if (g > -0.8) this._bounce(dt, 0.8);
    this._piers(dt, 3.2);
  }

  _sub(dt, C) {
    const K = this.spec;
    const top = K.top * (this.topScale || 1);
    const thrust = C.throttle * K.accel * (this.speed < top ? 1 : 0);
    const reverse = C.brake * K.accel * (this.speed > 0 ? 1.2 : 0.5);
    this.speed += (thrust - reverse - this.speed * 0.15 - this.speed * Math.abs(this.speed) * K.drag) * dt;
    this.speed = clamp(this.speed, -4, top + 1);
    const eff = clamp(Math.abs(this.speed) / 4, 0.35, 1);
    this.yaw -= C.steer * K.turn * eff * (this.speed < -0.2 ? -1 : 1) * dt;
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += (climb * 0.42 - this.pitch) * (1 - Math.exp(-dt * 2.5));
    this.bank += (C.steer * 0.22 * eff - this.bank) * (1 - Math.exp(-dt * 3));
    this._fwd();
    const k = 1 - Math.exp(-dt * 3);
    this.velocity.x += (this.forward.x * this.speed - this.velocity.x) * k;
    this.velocity.z += (this.forward.z * this.speed - this.velocity.z) * k;
    this.velocity.y += (this.forward.y * this.speed + climb * 1.2 - this.velocity.y) * k;
    this.position.addScaledVector(this.velocity, dt);
    // Stay under the surface and above the sea floor; walls push back.
    if (this.position.y > -2.2) {
      this.position.y = -2.2;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    const g = this.env.ground(this.position.x, this.position.z);
    if (this.position.y < g + 1.6) {
      const dip = g + 1.6 - this.position.y;
      this.position.y = g + 1.6;
      this.velocity.y = Math.max(0, this.velocity.y);
      if (dip > 0.6) this._bounce(dt, 0.6);
    }
    if (g > -2.6) this._bounce(dt, 0.6);
    this._piers(dt, 3.4);
  }

  _plane(dt, C) {
    const K = this.spec;
    const target = (K.cruise + C.throttle * (K.top - K.cruise) - C.brake * (K.cruise - K.min)) * (this.topScale || 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 0.9));
    this.speed = Math.max(K.min * 0.8, this.speed - Math.sin(this.pitch) * 9.81 * dt * 0.5);
    this.bank += (C.steer * 1.05 - this.bank) * (1 - Math.exp(-dt * 2.6));
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += (climb * 0.55 - this.pitch) * (1 - Math.exp(-dt * 1.8));
    this.yaw -= ((9.81 * Math.tan(this.bank)) / Math.max(this.speed, 20)) * dt * 1.25;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.offroad = 0;
    const g = Math.max(0, this.env.ground(this.position.x, this.position.z));
    if (this.position.y < g + 1.5 || this._deck(1.2)) this._crash();
    if (this.position.y > 900) this.position.y = 900;
  }

  _space(dt, C) {
    const K = this.spec;
    const target = (K.cruise + C.throttle * (K.top - K.cruise) - C.brake * (K.cruise - K.min)) * (this.topScale || 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 1.3));
    this.bank += (C.steer * 1.0 - this.bank) * (1 - Math.exp(-dt * 3));
    const climb = (C.up || 0) - (C.down || 0);
    this.pitch += (climb * 0.7 - this.pitch) * (1 - Math.exp(-dt * 2.2));
    this.yaw -= this.bank * 0.95 * dt;
    this._fwd();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.offroad = 0;
    // Rocks and the station: bounce off, lose speed.
    for (const S of this.env.solids || []) {
      const dx = this.position.x - S.x;
      const dy = this.position.y - S.y;
      const dz = this.position.z - S.z;
      const d = Math.hypot(dx, dy, dz);
      const R = S.r + 2.2;
      if (d >= R || d < 1e-3) continue;
      const n = _v.set(dx / d, dy / d, dz / d);
      this.position.set(S.x + n.x * R, S.y + n.y * R, S.z + n.z * R);
      this.speed *= 0.8;
      this.hit = 1;
      this._bumpYaw(n);
    }
    if (this.env.collide) {
      const n = this.env.collide(this.position);
      if (n) {
        this.position.addScaledVector(n, 2);
        this.speed *= 0.8;
        this.hit = 1;
        this._bumpYaw(n);
      }
    }
  }

  /** After a knock: heading swings away from what was hit. */
  _bumpYaw(n) {
    const f = this.forward;
    const into = f.x * n.x + f.y * n.y + f.z * n.z;
    if (into >= 0) return;
    const out = _v.set(f.x - 2 * into * n.x, f.y - 2 * into * n.y, f.z - 2 * into * n.z).normalize();
    this.yaw = Math.atan2(out.x, out.z);
    this.pitch = Math.asin(clamp(out.y, -0.8, 0.8)) * 0.5;
  }

  _glider(dt, C) {
    const K = this.spec;
    const target = K.trim + C.throttle * (K.fast - K.trim) - C.brake * (K.trim - K.slow);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 1.2));
    this.bank += (C.steer * 0.75 - this.bank) * (1 - Math.exp(-dt * 2));
    this.yaw -= ((9.81 * Math.tan(this.bank)) / Math.max(this.speed, 5)) * dt;
    const sink = 1.05 + (this.speed - K.trim) ** 2 * 0.07 + Math.abs(this.bank) * 1.3;
    const lift = this._thermal(this.position.x, this.position.z);
    this.vy += (lift - sink - this.vy) * (1 - Math.exp(-dt * 1.5));
    this.pitch = Math.atan2(this.vy, this.speed) * 0.6;
    this._fwd();
    const W = this.env.wind || { x: 0, z: 0 };
    this.velocity.set(Math.sin(this.yaw) * this.speed + W.x, this.vy, Math.cos(this.yaw) * this.speed + W.z);
    this.position.addScaledVector(this.velocity, dt);
    this.lift = lift;
    const g = Math.max(0, this.env.ground(this.position.x, this.position.z));
    this.altitude = this.position.y - g;
    if (this.position.y < g + 0.9) {
      if (this.landing) {
        // On the landing field: touch down and slide to a stop.
        this.position.y = g + 0.9;
        this.speed *= 1 - dt * 1.5;
        this.vy = 0;
      } else this._crash();
    }
  }

  /** Rising air (paraglider thermals). */
  _thermal(x, z) {
    let lift = 0;
    for (const T of this.env.thermals || []) {
      const d = Math.hypot(x - T.x, z - T.z);
      if (d < T.r) lift += T.lift * (1 - (d / T.r) ** 2);
    }
    return lift;
  }

  /** Off the shallows / cliff walls: pushed back along the downhill direction. */
  _bounce(dt, keep) {
    const e = 3;
    const x = this.position.x;
    const z = this.position.z;
    const gx = this.env.ground(x + e, z) - this.env.ground(x - e, z);
    const gz = this.env.ground(x, z + e) - this.env.ground(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    const nx = -gx / l;
    const nz = -gz / l;
    this.position.x += nx * 0.9;
    this.position.z += nz * 0.9;
    const vn = this.velocity.x * nx + this.velocity.z * nz;
    if (vn < 0) {
      this.velocity.x -= 1.7 * vn * nx;
      this.velocity.z -= 1.7 * vn * nz;
      if (-vn > 3) this.hit = Math.min(1, -vn / 12);
    }
    this.speed *= keep ** (dt * 10);
    this.offroad = 1;
  }

  _piers(dt, r) {
    for (const P of this.env.piers || []) {
      const dx = this.position.x - P.x;
      const dz = this.position.z - P.z;
      const d = Math.hypot(dx, dz);
      const R = P.r + r;
      if (d >= R || d < 1e-3) continue;
      const nx = dx / d;
      const nz = dz / d;
      this.position.x = P.x + nx * R;
      this.position.z = P.z + nz * R;
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn < 0) {
        this.velocity.x -= 1.8 * vn * nx;
        this.velocity.z -= 1.8 * vn * nz;
        this.speed *= 0.5;
        this.hit = Math.min(1, -vn / 10);
      }
    }
  }

  /** Flying into a bridge deck. */
  _deck(pad) {
    for (const D of this.env.decks || []) {
      const dx = D.bx - D.ax;
      const dz = D.bz - D.az;
      const l2 = dx * dx + dz * dz;
      const u = ((this.position.x - D.ax) * dx + (this.position.z - D.az) * dz) / l2;
      if (u < 0 || u > 1) continue;
      const d = Math.abs((this.position.x - D.ax) * dz - (this.position.z - D.az) * dx) / Math.sqrt(l2);
      if (d > 8 + pad) continue;
      const y = D.ay + (D.by - D.ay) * u;
      if (this.position.y > y - 2.2 - pad && this.position.y < y + 1.3 + pad) return true;
    }
    return false;
  }

  _crash() {
    if (this.crash > 0) return;
    this.crash = 1.4;
    this.speed = 0;
    this.object.visible = false;
    this.crashed = true;
    const P = this.env.particles;
    if (P) {
      P.impact(this.position.clone(), null, 1.6);
      const smoke = P.systems.smoke;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.28;
        smoke.emit({ x: this.position.x, y: this.position.y + 1, z: this.position.z, vx: Math.cos(a) * 3, vy: 2 + Math.random() * 4, vz: Math.sin(a) * 3, life: 1.5 + Math.random(), size0: 2, size1: 7, color0: [0.25, 0.23, 0.22, 0.8], color1: [0.4, 0.4, 0.4, 0], drag: 0.5 });
      }
    }
  }

  _pose() {
    const o = this.object;
    o.position.copy(this.position);
    o.rotation.set(0, 0, 0);
    _e.set(-this.pitch, this.yaw, this.bank, 'YXZ');
    o.quaternion.setFromEuler(_e);
    if (this.kind === 'boat' && this.wave) {
      // Pitch and roll with the waves (bow up with speed), on top of the heading.
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const along = this.wave.dx * fx + this.wave.dz * fz;
      const across = this.wave.dx * -fz + this.wave.dz * fx;
      _e.set(-(Math.atan(along) + Math.min(0.09, Math.abs(this.speed) * 0.004)), this.yaw, -Math.atan(across) + this.bank, 'YXZ');
      o.quaternion.setFromEuler(_e);
    }
  }

  /** Per frame: pose, spinning bits, spray, bubbles, smoke. */
  update(dt) {
    this._pose();
    if (this.prop) this.prop.rotation.z += dt * 60;
    if (this.flames) {
      const C = this.vehicle.controls;
      const k = 0.6 + C.throttle * 1.2 - C.brake * 0.4 + Math.random() * 0.15;
      for (const f of this.flames) f.scale.set(1, 1, Math.max(0.2, k));
      this.env.engine.materials.setEmissiveBase(this.glowMat, 5 + C.throttle * 7);
    }
    const P = this.env.particles;
    const cam = this.env.engine.camera.position;
    const near = this.position.distanceTo(cam) < (this.isPlayer ? 400 : 160);
    if (!P || !near || this.crash > 0) return;
    const f = this.forward;
    const r = _v.set(-f.z, 0, f.x).normalize();
    this._fx = (this._fx || 0) + dt;
    if (this.kind === 'boat' && Math.abs(this.speed) > 6 && this._fx > 0.03) {
      this._fx = 0;
      const smoke = P.systems.smoke;
      for (const s of [-1, 1]) {
        smoke.emit({ x: this.position.x + f.x * 1.8 + r.x * s * 1.1, y: this.position.y + 0.1, z: this.position.z + f.z * 1.8 + r.z * s * 1.1, vx: r.x * s * 3 + this.velocity.x * 0.2, vy: 1.5 + Math.random() * 2, vz: r.z * s * 3 + this.velocity.z * 0.2, life: 0.7, size0: 0.4, size1: 1.8, color0: [0.95, 0.97, 1, 0.55], color1: [0.95, 0.97, 1, 0], gravity: 5, drag: 1.2 });
      }
      smoke.emit({ x: this.position.x - f.x * 4.4, y: this.position.y, z: this.position.z - f.z * 4.4, vx: -f.x * 2, vy: 0.8, vz: -f.z * 2, life: 1.4, size0: 0.8, size1: 3.2, color0: [0.95, 0.97, 1, 0.45], color1: [0.95, 0.97, 1, 0], gravity: 1, drag: 1 });
    } else if (this.kind === 'sub' && Math.abs(this.speed) > 1 && this._fx > 0.06) {
      this._fx = 0;
      P.systems.smoke.emit({ x: this.position.x - f.x * 3.8, y: this.position.y, z: this.position.z - f.z * 3.8, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 2.5, size0: 0.15, size1: 0.45, color0: [0.8, 0.95, 1, 0.7], color1: [0.8, 0.95, 1, 0], drag: 0.3 });
    } else if (this.kind === 'plane' && this.smoke && !this.isPlayer && !this.vehicle.controls.hold && this._fx > 0.05) {
      // Air-race smoke trail in the pilot's colour.
      this._fx = 0;
      const c = new THREE.Color(this.color);
      P.systems.smoke.emit({ x: this.position.x - f.x * 4.5, y: this.position.y, z: this.position.z - f.z * 4.5, vx: 0, vy: 0.3, vz: 0, life: 4, size0: 1.2, size1: 5, color0: [0.6 + c.r * 0.4, 0.6 + c.g * 0.4, 0.6 + c.b * 0.4, 0.5], color1: [0.9, 0.9, 0.9, 0], drag: 0.2, turbulence: 0.5 });
    }
  }

  dispose() {
    if (this.glowMat) this.env.engine.materials.untrackEmissive(this.glowMat);
    this.object.removeFromParent();
    this.object.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

// ------------------------------------------------------------------ drivers

/** Keyboard, gamepad and touch for a craft (same keys as the cars, plus Space/Shift to climb and dive). */
export class CraftPlayer {
  constructor(craft, input, touch) {
    this.craft = craft;
    this.input = input;
    this.touch = touch;
    this.steer = 0;
    this.enabled = true;
  }

  update(dt) {
    const C = this.craft.vehicle.controls;
    const I = this.input;
    const T = this.touch || {};
    const kind = this.craft.kind;
    if (!this.enabled) {
      Object.assign(C, { throttle: 0, brake: 0, steer: 0, up: 0, down: 0, nitro: false });
      return;
    }
    let steer = I.axis('KeyA', 'KeyD') + I.axis('ArrowLeft', 'ArrowRight') + (T.right ? 1 : 0) - (T.left ? 1 : 0);
    let gas = I.isDown('KeyW') || I.isDown('ArrowUp') || T.gas ? 1 : 0;
    let brk = I.isDown('KeyS') || I.isDown('ArrowDown') || T.brake ? 1 : 0;
    const air = kind === 'plane' || kind === 'sub' || kind === 'space';
    let up = air && (I.isDown('Space') || T.nitro) ? 1 : 0;
    let down = air && (I.isDown('ShiftLeft') || I.isDown('ShiftRight') || I.isDown('KeyX') || T.handbrake) ? 1 : 0;
    let nitro = kind === 'boat' && (I.isDown('ShiftLeft') || I.isDown('ShiftRight') || I.isDown('KeyN') || T.nitro);
    let analog = null;
    const pad = I.gamepad;
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) analog = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) ** 1.5;
      const ay = pad.axes[1] || 0;
      if (air && Math.abs(ay) > 0.15) {
        up = Math.max(up, clamp(ay, 0, 1));
        down = Math.max(down, clamp(-ay, 0, 1));
      }
      const b = pad.buttons;
      gas = Math.max(gas, b[7] ? b[7].value : 0, b[0] && b[0].pressed ? 1 : 0);
      brk = Math.max(brk, b[6] ? b[6].value : 0);
      nitro = nitro || (b[3] && b[3].pressed);
    }
    steer = clamp(steer, -1, 1);
    if (analog !== null) this.steer = analog;
    else this.steer += clamp(steer - this.steer, -dt * 5, dt * 5);
    C.steer = this.steer;
    C.throttle = gas;
    C.brake = brk;
    C.up = up;
    C.down = down;
    C.nitro = !!nitro;
  }
}

/** Follows the course: pursuit steering, height tracking, speed from the bends ahead. */
export class CraftAI {
  constructor(craft, course, { skill = 0.9, lane = 0, seed = 1 } = {}) {
    this.craft = craft;
    this.course = course;
    this.skill = skill;
    this.lane = lane;
    this.seed = seed;
    this._q = {};
    craft.topScale = 0.9 + skill * 0.1;
  }

  update(dt, rubber = 0) {
    const c = this.craft;
    const C = c.vehicle.controls;
    const K = c.spec;
    const course = this.course;
    const q = course.nearest(c.position.x, c.position.z, this._q);
    if (!q) return;
    const v = Math.max(4, Math.abs(c.speed));
    const look = { boat: 16 + v * 1.1, sub: 14 + v * 1.2, plane: 40 + v * 1.3, glider: 30 + v * 2, space: 50 + v * 0.9 }[c.kind];
    const wobble = Math.sin(performance.now() * 0.0003 + this.seed) * 0.4;
    // Tighten to the centre line near a gate (small gates under bridges especially).
    let near = 1;
    for (const g of course.gates) {
      let ds = (g.s - q.s) * course.length;
      if (course.closed && ds < -course.length / 2) ds += course.length;
      if (ds > -10 && ds < 160) near = Math.min(near, clamp(ds / 160, 0, 1) * (g.radius > 8 ? 1 : 0.3) + (g.radius > 8 ? 0.35 : 0));
    }
    const target = course.pose(q.s + look / course.length, (this.lane + wobble) * near);
    const want = Math.atan2(target.position.x - c.position.x, target.position.z - c.position.z);
    const err = wrap(want - c.yaw);
    C.steer = clamp(-err * (c.kind === 'plane' || c.kind === 'space' ? 2.2 : 2.6), -1, 1);
    // Bends ahead set the pace.
    const ahead = course.pose(q.s + (look * 2.5) / course.length, 0);
    const bend = Math.abs(wrap(Math.atan2(ahead.tangent.x, ahead.tangent.z) - Math.atan2(target.tangent.x, target.tangent.z)));
    const pace = clamp(1 - bend * 0.9, 0.35, 1) * (0.9 + this.skill * 0.1) * (1 + rubber);
    c.topScale = (0.9 + this.skill * 0.1) * (1 + rubber * 0.5) * (c.kind === 'space' ? 0.9 : 1);
    if (c.kind === 'boat' || c.kind === 'sub') {
      const vt = (K.top * pace);
      C.throttle = c.speed < vt ? 1 : 0.3;
      C.brake = c.speed > vt + 3 ? 0.6 : 0;
      C.nitro = c.kind === 'boat' && bend < 0.12 && c.boost > 0.5 && this.skill > 0.8;
    } else if (c.kind === 'plane' || c.kind === 'space') {
      C.throttle = pace > 0.8 ? 1 : 0.4;
      C.brake = pace < 0.5 ? 0.5 : 0;
    }
    if (c.kind === 'sub' || c.kind === 'plane' || c.kind === 'space') {
      const dy = target.position.y - c.position.y - c.velocity.y * 0.6;
      C.up = clamp(dy * 0.2, 0, 1);
      C.down = clamp(-dy * 0.2, 0, 1);
    }
    if (c.kind === 'glider') {
      // Height to spare: speed bar; short of the glide line: circle in lift if there is some, else trim.
      const dy = c.position.y - target.position.y;
      C.throttle = dy > 10 ? 1 : dy > 3 ? 0.5 : 0;
      C.brake = 0;
    }
  }
}
