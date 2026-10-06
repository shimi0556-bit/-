// The player's fighter jet "Iron Hawk": a procedural twin-engine, twin-tail fighter
// (lofted fuselage, bevelled wings, gold canopy, moving tail planes, burner flames),
// and an arcade flight model that is forgiving but still feels fast.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeJetTexture, canvasTexture } from '../core/textures.js';
import { clamp, damp, lerp, wrapAngle } from '../core/util.js';

// fuselage stations: z, width, height, centre y, squareness
const STATIONS = [
  [-9.2, 0.02, 0.02, 0.05, 2.0], [-8.6, 0.32, 0.3, 0.06, 2.0], [-7.6, 0.62, 0.58, 0.07, 2.1],
  [-6.2, 0.92, 0.86, 0.1, 2.3], [-4.8, 1.12, 1.04, 0.14, 2.5], [-3.2, 1.45, 1.1, 0.1, 2.8],
  [-1.4, 2.2, 1.06, 0.02, 3.2], [1.0, 2.45, 1.0, 0.0, 3.4], [3.6, 2.4, 0.95, 0.0, 3.4],
  [6.0, 2.15, 0.88, 0.02, 3.2], [7.8, 1.95, 0.8, 0.02, 3.0], [8.7, 1.8, 0.74, 0.02, 2.8],
];

function interpStation(z) {
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i], b = STATIONS[i + 1];
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return a.map((v, k) => lerp(v, b[k], k === 0 ? t : s));
    }
  }
  return STATIONS[STATIONS.length - 1];
}

function fuselageGeometry() {
  const rings = 64, around = 36;
  const pos = [], uv = [], idx = [];
  const z0 = STATIONS[0][0], z1 = STATIONS[STATIONS.length - 1][0];
  for (let i = 0; i <= rings; i++) {
    const z = lerp(z0, z1, Math.pow(i / rings, 0.92));
    const [, w, h, yc, n] = interpStation(z);
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      let x = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      let y = (h / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      if (y < 0) y *= 0.82;
      // chine line: a slight edge along the sides
      pos.push(x, yc + y, z);
      uv.push(j / around, (z - z0) / (z1 - z0));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
    const a = i * (around + 1) + j, b = a + around + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Planform (x, z) points -> thin bevelled slab lying in the XZ plane.
function slab(points, thickness, bevel = 0.05) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); // shape y -> z, extrusion -> -y
  g.translate(0, thickness / 2, 0);
  g.computeVertexNormals();
  return g;
}

function mirrorPoints(pts) { return pts.map(([x, z]) => [-x, z]).reverse(); }

function flameMaterial(color, core) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0.5 }, uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uPower; uniform vec3 uColor, uCore; varying vec2 vUv;
void main(){
  float along = vUv.y; // 1 at the nozzle, 0 at the tip
  float flick = 0.8 + 0.2 * sin(uTime * 60.0 + along * 20.0);
  float diamonds = 0.75 + 0.25 * sin(along * 30.0 - uTime * 8.0);
  float a = pow(along, 1.6) * flick * uPower;
  vec3 c = mix(uColor, uCore, pow(along, 4.0)) * diamonds;
  gl_FragColor = vec4(c * a * 3.0, a);
}`,
  });
}

export function buildJetModel() {
  const root = new THREE.Group();
  const hullTex = canvasTexture(makeJetTexture(1024));
  hullTex.wrapS = hullTex.wrapT = THREE.RepeatWrapping;
  const hull = new THREE.MeshStandardMaterial({ color: 0xa8b2bd, map: hullTex, roughness: 0.42, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.55, metalness: 0.5 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.35, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffc860, metalness: 0.9, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.4, metalness: 0.3 });

  const fus = new THREE.Mesh(fuselageGeometry(), hull);
  root.add(fus);
  // radome tip
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.33, 1.2, 20).rotateX(-Math.PI / 2).translate(0, 0.06, -9.0), dark);
  root.add(radome);

  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.5, 0.5, 1.75);
  canopy.position.set(0, 0.62, -4.9);
  root.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 24, Math.PI), dark);
  frame.position.set(0, 0.62, -4.35);
  root.add(frame);

  // wings, tail planes and fins
  const wingR = [[1.0, -3.4], [6.6, 2.6], [6.6, 3.9], [5.6, 4.1], [1.0, 4.9]];
  const wings = new THREE.Mesh(mergeGeometries([slab(wingR, 0.16, 0.07), slab(mirrorPoints(wingR), 0.16, 0.07)]), hull);
  wings.position.y = -0.05;
  root.add(wings);
  // leading-edge extensions blending wings into the nose
  const lexR = [[0.6, -6.0], [1.4, -3.2], [1.4, 0.0], [0.6, 0.0]];
  root.add(new THREE.Mesh(mergeGeometries([slab(lexR, 0.12, 0.05), slab(mirrorPoints(lexR), 0.12, 0.05)]), hull));

  const stabs = [];
  for (const side of [1, -1]) {
    const pts = [[0, -0.9], [2.6, 0.7], [2.6, 1.6], [0, 1.5]].map(([x, z]) => [x * side, z]);
    const g = slab(side > 0 ? pts : pts.reverse(), 0.12, 0.05);
    const pivot = new THREE.Group();
    pivot.position.set(1.0 * side, 0.0, 7.2);
    pivot.add(new THREE.Mesh(g, hull));
    root.add(pivot);
    stabs.push(pivot);
  }
  const fins = [];
  for (const side of [1, -1]) {
    const shape = new THREE.Shape([[0, 0], [2.7, 3.1], [3.6, 3.1], [3.4, 0]].map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 2 });
    g.rotateY(-Math.PI / 2);
    g.translate(0.06, 0, 0);
    const fin = new THREE.Group();
    const mesh = new THREE.Mesh(g, hull);
    fin.add(mesh);
    // yellow tail band
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 1.05), accent);
    band.position.set(0, 2.55, 3.15);
    fin.add(band);
    fin.position.set(0.95 * side, 0.35, 4.9);
    fin.rotation.z = -0.42 * side;
    root.add(fin);
    fins.push(fin);
  }

  // intakes
  for (const side of [1, -1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 2.6), hull);
    intake.position.set(1.32 * side, -0.08, -1.6);
    intake.rotation.y = 0.06 * side;
    root.add(intake);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.72), new THREE.MeshBasicMaterial({ color: 0x050607 }));
    mouth.position.set(1.32 * side, -0.08, -2.92);
    mouth.rotation.y = Math.PI;
    root.add(mouth);
  }

  // engines
  const flames = [];
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.15).multiplyScalar(4) });
  for (const side of [1, -1]) {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.5, 1.5, 24, 1, true).rotateX(Math.PI / 2), nozzleMat);
    noz.position.set(0.56 * side, 0.02, 9.2);
    root.add(noz);
    // nozzle petals
    for (let i = 0; i < 12; i++) {
      const petal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.5), nozzleMat);
      const a = (i / 12) * Math.PI * 2;
      petal.position.set(0.56 * side + Math.cos(a) * 0.53, 0.02 + Math.sin(a) * 0.53, 9.9);
      petal.rotation.z = a + Math.PI / 2;
      root.add(petal);
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), glowMat);
    glow.position.set(0.56 * side, 0.02, 9.6);
    root.add(glow);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.5, 6, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 3), flameMaterial(0xff6a1a, 0xfff2c0));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 3.5, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 1.75), flameMaterial(0x6a8cff, 0xffffff));
    for (const f of [outer, inner]) {
      f.position.set(0.56 * side, 0.02, 9.75);
      f.renderOrder = 10;
      root.add(f);
      flames.push(f);
    }
  }

  // missiles on pylons
  const missileGeo = missileGeometry();
  const missileMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5, metalness: 0.2 });
  const missiles = [];
  for (const [x, z] of [[2.6, 1.4], [-2.6, 1.4], [4.1, 2.6], [-4.1, 2.6]]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 1.4), dark);
    pylon.position.set(x, -0.25, z);
    root.add(pylon);
    const m = new THREE.Mesh(missileGeo, missileMat);
    m.position.set(x, -0.52, z - 0.2);
    m.rotation.y = Math.PI; // missile noses point forward (-Z)
    root.add(m);
    missiles.push(m);
  }

  // navigation lights (bloom makes them glow)
  const nav = [];
  for (const [x, y, z, c] of [[-6.6, -0.02, 3.3, [4, 0.2, 0.1]], [6.6, -0.02, 3.3, [0.1, 4, 0.3]], [0, 1.1, 8.5, [4, 4, 4]]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) }));
    l.position.set(x, y, z);
    root.add(l);
    nav.push(l);
  }
  nav[2].position.set(1.95, 3.35, 8.3); // on the fin tip

  root.traverse((o) => { if (o.isMesh && !(o.material.isShaderMaterial) && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  // the nose is at -Z, which is the flight direction
  const model = new THREE.Group();
  model.add(root);
  return { model, flames, stabs, fins, missiles, nav, glowMat, muzzle: new THREE.Vector3(0.75, 0.2, -7.2), missileGeo, missileMat };
}

export function missileGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.14, 0.14, 2.6, 12).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.14, 0.5, 12).rotateX(Math.PI / 2).translate(0, 0, 1.55),
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(new THREE.BoxGeometry(0.02, 0.36, 0.3).translate(0, 0.2, -1.1).rotateZ((i * Math.PI) / 2 + Math.PI / 4));
    parts.push(new THREE.BoxGeometry(0.02, 0.22, 0.2).translate(0, 0.15, 0.7).rotateZ((i * Math.PI) / 2 + Math.PI / 4));
  }
  return mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
}

// ----------------------------------------------------------------------------------
export class Jet {
  constructor(scene) {
    const m = buildJetModel();
    Object.assign(this, m);
    this.object = new THREE.Group();
    this.object.add(this.model);
    scene.add(this.object);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.speed = 120;
    this.throttle = 0.6;
    this.boost = 1;
    this.alive = true;
    this.hp = 100;
    this.maxHp = 100;
    this.missilesLeft = 4;
    this.missileReload = 0;
    this.gforce = 0;
    this.invuln = 0;
    this.stats = { cruise: 125, boost: 205, slow: 70 };
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.quat.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));
    this.speed = this.stats.cruise;
    this.vel.set(0, 0, -1).applyQuaternion(this.quat).multiplyScalar(this.speed);
    this.angVel.set(0, 0, 0);
    this.alive = true;
    this.hp = this.maxHp;
    this.invuln = 2.5;
    this.boost = 1;
    this.object.visible = true;
    this.sync();
  }

  get forward() { return (this._f || (this._f = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(this.quat); }
  get up() { return (this._u || (this._u = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(this.quat); }
  get right() { return (this._r || (this._r = new THREE.Vector3())).set(1, 0, 0).applyQuaternion(this.quat); }

  bankAngle() {
    const r = this.right, u = this.up;
    return Math.atan2(r.y, u.y); // >0 when the right wing is up (banked left)
  }

  update(dt, input, world) {
    if (!this.alive) return;
    this.invuln = Math.max(0, this.invuln - dt);
    const assist = world.settings.assist ?? 1;
    const speedK = clamp(this.speed / this.stats.cruise, 0.6, 1.3);
    // control inputs -> target angular rates (local axes)
    const pitchIn = input.pitch, rollIn = input.roll, yawIn = input.yaw;
    const bank = this.bankAngle();
    // With flight assist the stick sets a bank angle (hold right = steady right turn, let go =
    // wings level). Without it the stick sets a roll rate, like a real jet.
    // A positive rate about the local Z axis lifts the right wing (bank > 0 = banked left).
    let rollRate;
    if (assist > 0.5) rollRate = clamp(wrapAngle(-rollIn * 1.2 - bank) * 3.4, -3.2, 3.2);
    else rollRate = -rollIn * 3.1;
    const target = new THREE.Vector3(pitchIn * 1.35 * speedK, -yawIn * 0.5, rollRate);
    this.angVel.x = damp(this.angVel.x, target.x, 7, dt);
    this.angVel.y = damp(this.angVel.y, target.y, 5, dt);
    this.angVel.z = damp(this.angVel.z, target.z, 8, dt);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.angVel.x * dt);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.angVel.y * dt);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.angVel.z * dt);
    this.quat.multiply(qy).multiply(qx).multiply(qz);
    // banking turns the jet (coordinated turn about world up)
    const turn = Math.sin(bank) * 0.95 * speedK * dt;
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    this.quat.premultiply(qt);
    // a banked jet also lifts its nose slightly into the turn
    this.quat.normalize();

    // speed
    const boosting = input.boost && this.boost > 0.02;
    const want = boosting ? this.stats.boost : input.brake ? this.stats.slow : this.stats.cruise;
    this.boost = clamp(this.boost + (boosting ? -0.22 : 0.1) * dt, 0, 1);
    this.boosting = boosting;
    this.throttle = damp(this.throttle, boosting ? 1 : input.brake ? 0.25 : 0.6, 3, dt);
    const f = this.forward;
    this.speed += -f.y * 32 * dt; // diving speeds up, climbing slows down
    this.speed = damp(this.speed, want, boosting ? 1.2 : 0.7, dt);
    this.speed = clamp(this.speed, 55, 260);
    const desiredVel = f.clone().multiplyScalar(this.speed);
    this.vel.lerp(desiredVel, 1 - Math.exp(-5 * dt));
    this.pos.addScaledVector(this.vel, dt);

    this.gforce = damp(this.gforce, Math.abs(this.angVel.x) * this.speed / 40 + Math.abs(turn / dt) * this.speed / 60, 5, dt);

    // soft ceiling and boundary help
    world.warnings.ceiling = this.pos.y > 1500;
    if (this.pos.y > 1500) this.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(this.right, -0.5 * dt));
    const r = Math.hypot(this.pos.x, this.pos.z);
    world.warnings.boundary = r > 3600;
    if (r > 3600) {
      const toCenter = Math.atan2(-this.pos.x, -this.pos.z);
      const heading = Math.atan2(-f.x, -f.z);
      let d = toCenter - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), clamp(d, -1, 1) * 0.6 * dt * clamp((r - 3600) / 300, 0, 1.5)));
    }
    this.sync(input, dt);
  }

  sync(input = { pitch: 0, roll: 0, yaw: 0 }, dt = 0) {
    this.object.position.copy(this.pos);
    this.object.quaternion.copy(this.quat);
    // moving surfaces
    for (const s of this.stabs) s.rotation.x = damp(s.rotation.x, input.pitch * 0.35, 10, dt || 1);
    this.stabs[0].rotation.x += input.roll * 0.12; this.stabs[1].rotation.x -= input.roll * 0.12;
    for (const f of this.fins) f.rotation.y = damp(f.rotation.y, input.yaw * 0.2, 10, dt || 1);
  }

  updateVisuals(time) {
    const p = this.boosting ? 1 : 0.35 + this.throttle * 0.3;
    for (const f of this.flames) {
      f.material.uniforms.uTime.value = time;
      f.material.uniforms.uPower.value = p;
      f.scale.set(1, 1, this.boosting ? 1.25 + Math.sin(time * 40) * 0.05 : 0.5 + this.throttle * 0.4);
    }
    this.glowMat.color.setRGB(1, 0.42, 0.12).multiplyScalar(2 + p * 5);
    const blink = (time % 1.2) < 0.08;
    this.nav[2].visible = blink;
    this.missiles.forEach((m, i) => { m.visible = i < this.missilesLeft; });
  }

  muzzleWorld(out = new THREE.Vector3()) {
    return out.copy(this.muzzle).applyQuaternion(this.quat).add(this.pos);
  }

  pylonWorld(i, out = new THREE.Vector3()) {
    const m = this.missiles[i % 4];
    return out.copy(m.position).applyQuaternion(this.quat).add(this.pos);
  }
}
