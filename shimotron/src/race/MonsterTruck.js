import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import bodyGz from './models/monster-body.glb.gz?url';

/**
 * The monster 4×4: a downloaded truck body ("vehicle-truck" by Kenney, CC0;
 * see tools/monster.mjs) lifted high on a ladder frame over four giant
 * lugged tyres, each on a coil-over spring and damper that you can see
 * squash and stretch with the suspension, and solid axles that tilt as the
 * wheels ride the bumps. The body's yellow paint takes the driver's colour.
 */
let BODY = null;
const UP = new THREE.Vector3(0, 1, 0);
const AXLE = new THREE.Vector3(1, 0, 0);
const _qs = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Loads the body (parse: a function that turns the inlined, gzipped GLB into a scene). */
export async function loadMonster(parse) {
  try {
    const gltf = await parse(bodyGz);
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !mesh) mesh = o;
    });
    if (!mesh) throw new Error('no body mesh');
    mesh.updateWorldMatrix(true, false);
    // The model's nose is at -z; the game's forward is +z.
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).rotateY(Math.PI);
    BODY = { geo, map: mesh.material.map };
  } catch (e) {
    console.warn('monster truck body did not load; using the procedural body', e);
  }
}

export const hasMonster = () => !!BODY;

/** A giant tyre (axis along x) with chevron lugs, and its beadlock wheel. */
function tyreGeometries(R, Wd) {
  const pts = [];
  const r0 = R * 0.56;
  // Tyre section: sidewall bulge to a flat, slightly crowned tread.
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const a = -Math.PI / 2 + t * Math.PI;
    const bulge = Math.cos(a);
    pts.push(new THREE.Vector2(r0 + (R * 0.94 - r0) * (0.5 + 0.5 * Math.sin(Math.max(-1, Math.min(1, t * 2 - 1)) * Math.PI / 2)) * (0.6 + 0.4 * bulge) + bulge * 0.04, (t - 0.5) * Wd));
  }
  const tyre = new THREE.LatheGeometry(pts, 48);
  tyre.rotateZ(Math.PI / 2); // lathe axis y → x
  const lugs = [];
  const N = 30;
  for (let k = 0; k < N; k++) {
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(Wd * 0.44, R * 0.09, R * 0.17);
      g.rotateY(side * 0.45);
      g.translate(side * Wd * 0.24, R * 0.95, 0);
      g.rotateX((k / N) * Math.PI * 2 + (side > 0 ? Math.PI / N : 0));
      lugs.push(g);
    }
  }
  const rubber = mergeGeometries([tyre.toNonIndexed(), ...lugs.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); })].map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
  rubber.computeVertexNormals();
  // Wheel: a dished rim, a beadlock ring of bolts and six spokes.
  const parts = [];
  const rim = new THREE.CylinderGeometry(R * 0.57, R * 0.57, Wd * 0.8, 32, 1, true);
  rim.rotateZ(Math.PI / 2);
  parts.push(rim);
  for (const s of [-1, 1]) {
    const disc = new THREE.RingGeometry(R * 0.12, R * 0.57, 32);
    disc.rotateY((s * Math.PI) / 2);
    disc.translate(s * Wd * 0.18, 0, 0);
    parts.push(disc);
    const ring = new THREE.TorusGeometry(R * 0.53, R * 0.025, 6, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(s * Wd * 0.4, 0, 0);
    parts.push(ring);
  }
  for (let k = 0; k < 6; k++) {
    const sp = new THREE.BoxGeometry(Wd * 0.14, R * 0.42, R * 0.07);
    sp.translate(Wd * 0.22, R * 0.3, 0);
    sp.rotateX((k / 6) * Math.PI * 2);
    parts.push(sp);
  }
  const hub = new THREE.CylinderGeometry(R * 0.13, R * 0.15, Wd * 0.25, 12);
  hub.rotateZ(Math.PI / 2);
  hub.translate(Wd * 0.3, 0, 0);
  parts.push(hub);
  const wheel = mergeGeometries(parts.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  wheel.computeVertexNormals();
  return { rubber, wheel };
}

/** A coil spring of unit height (y 0..1), radius r, `turns` turns of wire radius w. */
function coilGeometry(r, turns, w) {
  const pts = [];
  const steps = turns * 18;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, t, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, w, 6, false);
}

let shared = null;
function parts(spec) {
  if (shared) return shared;
  const W = spec.wheel;
  const { rubber, wheel } = tyreGeometries(W.radius, W.width);
  shared = {
    rubber,
    wheel,
    coil: coilGeometry(0.15, 8, 0.028),
    damper: new THREE.CylinderGeometry(0.06, 0.06, 1, 10).translate(0, 0.5, 0),
    rod: new THREE.CylinderGeometry(0.03, 0.03, 1, 8).translate(0, 0.5, 0),
    axle: new THREE.CylinderGeometry(0.09, 0.09, 1, 10).rotateZ(Math.PI / 2),
    mats: {
      rubber: new THREE.MeshStandardMaterial({ name: 'צמיג ענק', color: 0x1a1a1a, roughness: 0.92, metalness: 0 }),
      rim: new THREE.MeshStandardMaterial({ name: 'חישוק', color: 0xc9ccd0, roughness: 0.28, metalness: 0.9, side: THREE.DoubleSide }),
      spring: new THREE.MeshStandardMaterial({ name: 'קפיץ', color: 0xff6a1a, roughness: 0.35, metalness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ name: 'בולם', color: 0xe8e8e8, roughness: 0.15, metalness: 1 }),
      frame: new THREE.MeshStandardMaterial({ name: 'שלדה', color: 0x26282b, roughness: 0.55, metalness: 0.7 }),
    },
  };
  for (const m of Object.values(shared.mats)) m.userData.keep = true;
  return shared;
}

/**
 * One truck: { group, paint, tailMat, headMat, pose(car) } (the same shape
 * as the real cars in RealModels.js).
 */
export function createMonsterCar(materials, { color = '#d42a2a', spec }) {
  const P = parts(spec);
  const W = spec.wheel;
  const group = new THREE.Group();
  // Body: the downloaded cab and bed, scaled to monster size; its yellow becomes the paint.
  const paint = new THREE.MeshPhysicalMaterial({ name: 'צבע משאית', map: BODY.map, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  paint.userData.paint = new THREE.Color(color);
  paint.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: paint.userData.paint };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPaint;').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float y = smoothstep(0.12, 0.3, min(c.r, c.g) - c.b);
        diffuseColor.rgb = mix(c, uPaint * (0.55 + 0.6 * max(c.r, c.g)), y); }`,
    );
  };
  paint.customProgramCacheKey = () => 'monster-paint';
  // Car.js recolours paint.color; keep the shader's colour in step.
  Object.defineProperty(paint, 'color', { get: () => paint.userData.paint, set: () => {} });
  const S = spec.monster;
  const body = new THREE.Mesh(BODY.geo, paint);
  body.scale.setScalar(S.scale);
  body.position.set(0, S.bodyY, S.bodyZ);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Lamps: headlights in the grille, a light bar on the roof, tail lights in the bed.
  const headMat = new THREE.MeshStandardMaterial({ name: 'פנסים', color: 0x222222, emissive: 0xf4f7ff, emissiveIntensity: 1 });
  const tailMat = new THREE.MeshStandardMaterial({ name: 'פנס אחורי', color: 0x330000, emissive: 0xff1a0a, emissiveIntensity: 1 });
  materials.trackEmissive(headMat, 0.6);
  materials.trackEmissive(tailMat, 0.25);
  const lampFront = new THREE.BoxGeometry(0.34, 0.16, 0.06);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(lampFront, headMat);
    h.position.set(s * S.lampX, S.lampY, S.front + 0.02);
    group.add(h);
    const t = new THREE.Mesh(lampFront, tailMat);
    t.position.set(s * S.lampX, S.lampY + 0.05, S.back - 0.02);
    group.add(t);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.14), headMat);
  bar.position.set(0, S.roofY + 0.1, S.roofZ);
  group.add(bar);
  // Ladder frame and skid plate under the body.
  const restY = W.height - (W.restLength - 9.82 / (4 * W.stiffness));
  const frameY = W.height + 0.05;
  const fr = [];
  for (const s of [-1, 1]) fr.push(new THREE.BoxGeometry(0.16, 0.24, (W.front - W.rear) + 1.4).translate(s * 0.62, frameY, (W.front + W.rear) / 2));
  for (const z of [W.front + 0.55, W.front - 0.2, (W.front + W.rear) / 2, W.rear + 0.2, W.rear - 0.55]) fr.push(new THREE.BoxGeometry(1.4, 0.16, 0.16).translate(0, frameY, z));
  // Bumpers / nerf bars.
  fr.push(new THREE.BoxGeometry(2.2, 0.18, 0.18).translate(0, frameY + 0.1, W.front + 0.95));
  fr.push(new THREE.BoxGeometry(2.2, 0.18, 0.18).translate(0, frameY + 0.1, W.rear - 0.95));
  const frame = new THREE.Mesh(mergeGeometries(fr.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); })), P.mats.frame);
  frame.castShadow = true;
  group.add(frame);
  // Wheels, springs and dampers.
  const X = [W.track, -W.track, W.track, -W.track];
  const Z = [W.front, W.front, W.rear, W.rear];
  const wheels = [];
  const coils = [];
  const dampers = [];
  const rods = [];
  const mountY = frameY + 0.5;
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(X[i], restY, Z[i]);
    const tyre = new THREE.Mesh(P.rubber, P.mats.rubber);
    const wheel = new THREE.Mesh(P.wheel, P.mats.rim);
    // The rim's face to the outside.
    if (X[i] < 0) wheel.rotation.y = Math.PI;
    tyre.castShadow = true;
    pivot.add(tyre, wheel);
    group.add(pivot);
    wheels.push(pivot);
    const coil = new THREE.Mesh(P.coil, P.mats.spring);
    const damper = new THREE.Mesh(P.damper, P.mats.chrome);
    const rod = new THREE.Mesh(P.rod, P.mats.chrome);
    coil.castShadow = true;
    group.add(coil, damper, rod);
    coils.push(coil);
    dampers.push(damper);
    rods.push(rod);
  }
  const axles = [0, 1].map(() => {
    const m = new THREE.Mesh(P.axle, P.mats.frame);
    group.add(m);
    return m;
  });
  const sx = (i) => X[i] - Math.sign(X[i]) * (W.width * 0.5 + 0.18); // spring's line: just inboard of the tyre
  const place = (i, hubY) => {
    // Spring from the frame mount down to the axle at the hub (it squashes and stretches).
    const x = sx(i);
    const len = Math.max(0.2, mountY - hubY);
    coils[i].position.set(x, hubY, Z[i]);
    coils[i].scale.set(1, len, 1);
    rods[i].position.set(x, hubY, Z[i]);
    rods[i].scale.set(1, len, 1);
    dampers[i].position.set(x, mountY - len * 0.55, Z[i]);
    dampers[i].scale.set(1, len * 0.55, 1);
  };
  const hubs = [restY, restY, restY, restY];
  for (let i = 0; i < 4; i++) place(i, restY);
  const axle = (k) => {
    const a = k * 2;
    _a.set(X[a], hubs[a], Z[a]);
    _b.set(X[a + 1], hubs[a + 1], Z[a + 1]);
    _d.subVectors(_a, _b);
    axles[k].position.addVectors(_a, _b).multiplyScalar(0.5);
    axles[k].scale.set(_d.length(), 1, 1);
    axles[k].quaternion.setFromUnitVectors(AXLE, _d.normalize());
  };
  axle(0);
  axle(1);
  group.userData.paint = paint;
  return {
    group,
    paint,
    tailMat,
    headMat,
    pose(car) {
      const veh = car.vehicle;
      const infos = veh.vehicle.wheelInfos;
      for (let i = 0; i < 4; i++) {
        const info = infos[i];
        const len = info.isInContact ? info.suspensionLength : Math.min(info.suspensionRestLength + 0.1, info.suspensionLength + 0.2);
        const y = W.height - len;
        hubs[i] = y;
        wheels[i].position.y = y;
        _qs.setFromAxisAngle(UP, i < 2 ? -veh.steerAngle : 0);
        _qw.setFromAxisAngle(AXLE, veh.wheelSpin[i]);
        _qs.multiply(_qw);
        wheels[i].quaternion.copy(_qs);
        place(i, y);
      }
      axle(0);
      axle(1);
    },
  };
}
