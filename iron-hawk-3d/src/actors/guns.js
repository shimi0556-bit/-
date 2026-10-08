// The two rotary cannons that peek into the view from the bottom corners, as if the player
// sat pressed against the front window with the guns mounted just below it. They live in a
// small scene of their own that is drawn over the world (so they never sink into a hill or
// a monster), swivel towards the crosshair, spin up, kick back, glow when hot and flash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../core/textures.js';
import { clamp, damp, mulberry32 } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const LENGTH = 1.02;          // pivot to muzzle
const MUZZLE_DEPTH = 1.12;    // how far in front of the eye the muzzles sit at rest
const MUZZLE_NDC = [0.56, -0.6]; // where on the screen the muzzles sit at rest
const SWING = 0.22;            // how far (radians) a gun turns from rest to follow the aim
const _rq = new THREE.Quaternion();

function wornMetalTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, 256, 256);
  // brushed streaks along the barrel
  for (let i = 0; i < 900; i++) {
    const y = rand() * 256, x = rand() * 256, w = 20 + rand() * 90;
    const l = 110 + rand() * 60;
    g.fillStyle = `rgba(${l},${l},${l},${0.08 + rand() * 0.1})`;
    g.fillRect(x, y, w, 1);
  }
  // scratches and scuffs (brighter = rougher in the roughness channel)
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(230,230,230,${0.15 + rand() * 0.25})`;
    g.lineWidth = 0.5 + rand();
    g.beginPath();
    const x = rand() * 256, y = rand() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,40,40,${0.1 + rand() * 0.2})`;
    g.beginPath();
    g.arc(rand() * 256, rand() * 256, 2 + rand() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = canvasTexture(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,230,170,0.95)');
  grd.addColorStop(0.45, 'rgba(255,140,40,0.45)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // four petals
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i * Math.PI) / 2 + 0.3);
    const p = g.createLinearGradient(0, 0, 62, 0);
    p.addColorStop(0, 'rgba(255,220,150,0.9)');
    p.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = p;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(62, 0); g.lineTo(0, 7); g.closePath(); g.fill();
    g.restore();
  }
  return canvasTexture(c, true);
}

// One cannon, built pointing down -Z with the pivot at the origin.
function buildCannon(mats, side) {
  const root = new THREE.Group();
  const recoil = new THREE.Group();
  root.add(recoil);

  // mount and receiver
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.25, 0.56, 3, 0.04).translate(0, 0, -0.06), mats.body);
  recoil.add(body);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.4, 2, 0.02).translate(0, 0.15, -0.05), mats.dark);
  recoil.add(cap);
  for (const z of [-0.16, -0.06, 0.04]) { // cooling slots
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.05).translate(side * 0.137, 0, z), mats.dark);
    recoil.add(slot);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.03, 0.06).translate(0, 0.07, -0.3), mats.accent);
  recoil.add(stripe);
  // motor housing under the receiver and the ammo chute dropping out of view
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 18).rotateX(Math.PI / 2).translate(-side * 0.05, -0.14, 0.04), mats.dark);
  recoil.add(motor);
  const chutePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.13, -0.04, 0.02), new THREE.Vector3(side * 0.26, -0.12, 0.1),
    new THREE.Vector3(side * 0.34, -0.42, 0.22), new THREE.Vector3(side * 0.38, -0.9, 0.3),
  ]);
  const chute = new THREE.Mesh(new THREE.TubeGeometry(chutePath, 24, 0.05, 10, false), mats.chute);
  recoil.add(chute);
  for (let i = 1; i < 6; i++) { // chute segments
    const t = i / 6;
    const p = chutePath.getPointAt(t), d = chutePath.getTangentAt(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.008, 6, 14), mats.dark);
    ring.position.copy(p);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    recoil.add(ring);
  }

  // the spinning barrel cluster
  const spin = new THREE.Group();
  spin.position.z = -0.32;
  recoil.add(spin);
  const barrels = [];
  const N = 6, R = 0.056;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    barrels.push(new THREE.CylinderGeometry(0.019, 0.021, 0.72, 10).rotateX(Math.PI / 2).translate(Math.cos(a) * R, Math.sin(a) * R, -0.36));
  }
  const barrelMesh = new THREE.Mesh(mergeGeometries(barrels), mats.barrel);
  spin.add(barrelMesh);
  const bores = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    bores.push(new THREE.CircleGeometry(0.012, 10).translate(Math.cos(a) * R, Math.sin(a) * R, 0).translate(0, 0, -0.721));
  }
  // circles face +Z; turn them to face down the barrel
  const boreGeo = mergeGeometries(bores);
  const bore = new THREE.Mesh(boreGeo, mats.bore);
  bore.rotation.y = Math.PI;
  bore.position.z = -1.442;
  spin.add(bore);
  for (const [z, r, w] of [[-0.02, 0.092, 0.06], [-0.3, 0.084, 0.035], [-0.62, 0.084, 0.04]]) {
    const clamp1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 24).rotateX(Math.PI / 2).translate(0, 0, z), mats.clamp);
    spin.add(clamp1);
  }
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.66, 10).rotateX(Math.PI / 2).translate(0, 0, -0.33), mats.dark);
  spin.add(spindle);

  // muzzle: where rounds leave and the flash sits
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -LENGTH);
  recoil.add(muzzle);
  const flash = new THREE.Group();
  flash.position.copy(muzzle.position).add(new THREE.Vector3(0, 0, -0.08));
  recoil.add(flash);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), mats.flash);
  flash.add(face);
  for (const r of [0, Math.PI / 2]) { // side petals reaching forward
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9).rotateX(-Math.PI / 2).translate(0, 0, -0.32), mats.flash);
    p.rotation.z = r;
    flash.add(p);
  }
  flash.visible = false;

  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, recoil, spin, muzzle, flash, face };
}

export class Guns {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.02, 30);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4030, 1.1);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.fill = new THREE.DirectionalLight(0x9cc8ff, 0.6);
    this.fill.position.set(0, 0.3, 1);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 1.6);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill, this.flashLight);

    const metal = wornMetalTexture(7);
    const mats = {
      body: new THREE.MeshStandardMaterial({ color: 0x4b5258, metalness: 0.75, roughness: 0.42, roughnessMap: metal, map: metal }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, metalness: 0.7, roughness: 0.5 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xffa21a, metalness: 0.3, roughness: 0.45, emissive: 0x2a1200 }),
      chute: new THREE.MeshStandardMaterial({ color: 0x2b3036, metalness: 0.6, roughness: 0.55 }),
      clamp: new THREE.MeshStandardMaterial({ color: 0x30353b, metalness: 0.85, roughness: 0.32 }),
      bore: new THREE.MeshBasicMaterial({ color: 0x050505 }),
      flash: new THREE.MeshBasicMaterial({
        map: flashTexture(), color: new THREE.Color(6, 4.2, 2.2), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    };
    mats.body.map.repeat.set(1, 2);
    this.barrelMats = [];
    this.guns = [-1, 1].map((side) => {
      const barrel = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.9, roughness: 0.3, roughnessMap: metal, emissive: 0xff4a10, emissiveIntensity: 0 });
      this.barrelMats.push(barrel);
      const g = buildCannon({ ...mats, barrel }, side);
      g.side = side;
      g.spinAngle = Math.random() * 6;
      g.spinSpeed = 0;
      g.kick = 0;
      g.flashT = 0;
      g.rest = new THREE.Vector3();
      g.aimQ = new THREE.Quaternion();
      this.scene.add(g.root);
      return g;
    });
    this.mats = mats;
    this.next = 0;
    this.heat = 0;
    this.visible = true;
    this.bob = new THREE.Vector2();
    this.aimLocal = new THREE.Vector3(0, 0, -60);
  }

  // borrow the region's light so the guns sit in the same world
  setLook(level, envMap, sunDir) {
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.9;
    this.sunDir = sunDir.clone();
    this.key.color.set(level.sun.color);
    this.key.intensity = level.sun.intensity * 0.85;
    this.hemi.color.set(level.hemi.sky);
    this.hemi.groundColor.set(level.hemi.ground);
    this.hemi.intensity = level.hemi.intensity * 0.9;
  }

  show(on) { this.visible = on; for (const g of this.guns) g.root.visible = on; }

  // lay the guns out for the current screen shape, matching the world camera's lens
  layout(worldCam) {
    const cam = this.camera;
    cam.fov = worldCam.fov;
    cam.aspect = worldCam.aspect;
    cam.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    // keep the barrels in the corners on wide screens and on narrow ones
    const aspect = clamp(cam.aspect, 1.1, 2.4);
    for (const g of this.guns) {
      const mx = g.side * MUZZLE_NDC[0] * t * aspect * MUZZLE_DEPTH;
      const my = MUZZLE_NDC[1] * t * MUZZLE_DEPTH;
      const muzzle = _v.set(mx, my, -MUZZLE_DEPTH);
      const dir = _w.set(0, 0, -70).sub(muzzle).normalize();
      g.rest.copy(muzzle).addScaledVector(dir, -LENGTH);
      g.restQ = g.restQ || new THREE.Quaternion();
      _m.lookAt(g.rest, _w.set(0, 0, -70), UP);
      g.restQ.setFromRotationMatrix(_m);
    }
  }

  // which gun fires next (they alternate)
  nextGun() { const i = this.next; this.next = 1 - this.next; return i; }

  fire(i) {
    const g = this.guns[i];
    g.kick = 1;
    g.flashT = 0.05 + Math.random() * 0.02;
    g.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    g.flash.scale.set(s, s, 0.8 + Math.random() * 0.6);
    g.spinSpeed = Math.max(g.spinSpeed, 26);
  }

  // muzzle position and direction in world space (for the rounds)
  muzzleWorld(i, worldCam, out = new THREE.Vector3()) {
    const g = this.guns[i];
    g.root.updateMatrixWorld(true);
    g.muzzle.getWorldPosition(out); // camera space of the overlay == the world camera's space
    return worldCam.localToWorld(out);
  }

  // aimDir: the direction under the crosshair in world space; aimDist: how far the thing
  // under it is; firing: the trigger is held; bob: the rig's head bob (for a little sway)
  update(dt, worldCam, { aimDir, aimDist = 120, firing = false, heat = 0, bob = null, time = 0 }) {
    this.layout(worldCam);
    // the aim point in the camera's own space
    _q.copy(worldCam.quaternion).invert();
    this.aimLocal.copy(aimDir).applyQuaternion(_q).multiplyScalar(clamp(aimDist, 25, 400));
    if (this.sunDir) {
      this.key.position.copy(this.sunDir).applyQuaternion(_q).multiplyScalar(10);
      this.hemi.position.copy(UP).applyQuaternion(_q);
    }
    this.heat = damp(this.heat, heat, 6, dt);
    const sway = bob || this.bob;
    let flashOn = 0;
    for (const g of this.guns) {
      // swing towards the aim point
      const target = _v.copy(this.aimLocal);
      _m.lookAt(g.rest, target, UP);
      g.aimQ.setFromRotationMatrix(_m);
      // only so far: a gun on the right can't swing out of the window to aim hard right
      const turn = g.restQ.angleTo(g.aimQ);
      if (turn > SWING) g.aimQ.copy(_rq.copy(g.restQ).slerp(g.aimQ, SWING / turn));
      g.root.quaternion.slerp(g.aimQ, 1 - Math.exp(-14 * dt));
      g.root.position.copy(g.rest);
      g.root.position.x += sway.x * 0.012 * g.side;
      g.root.position.y += sway.y * 0.016 + Math.sin(time * 1.3 + g.side) * 0.002;
      // recoil and barrel spin
      g.kick = Math.max(0, g.kick - dt * 14);
      g.recoil.position.z = g.kick * g.kick * 0.045;
      if (!firing) g.spinSpeed = damp(g.spinSpeed, 0, 1.4, dt);
      g.spinAngle += g.spinSpeed * dt;
      g.spin.rotation.z = g.spinAngle * -g.side;
      // the flash
      g.flashT -= dt;
      g.flash.visible = g.flashT > 0 && this.visible;
      if (g.flash.visible) flashOn = Math.max(flashOn, 1);
    }
    const glow = clamp((this.heat - 0.35) / 0.65, 0, 1);
    for (const m of this.barrelMats) m.emissiveIntensity = glow * glow * 1.8;
    // light the guns from the flashes
    const lit = this.guns.find((g) => g.flashT > 0);
    if (lit) {
      lit.muzzle.getWorldPosition(this.flashLight.position);
      this.flashLight.position.z += 0.2;
    }
    this.flashLight.intensity = damp(this.flashLight.intensity, flashOn ? 2.2 : 0, 30, dt);
  }
}
