import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Flat vertex colour (optionally by a test on the position) on a non-indexed copy. */
function paint(g, hex, alt = null) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const c2 = alt ? new THREE.Color(alt.color) : null;
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) (c2 && alt.test(p.getX(i), p.getY(i), p.getZ(i)) ? c2 : c).toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * What makes the city more than rows of boxes: round glass towers (some
 * twisting), red-tiled roofs on the low houses, domed halls, an arena
 * with floodlights, a Ferris wheel by the sea, building sites with tower
 * cranes, fountains on the squares and a striped lighthouse on the point.
 * Returns { update(dt) } for the things that move.
 */
export function buildLandmarks(city) {
  const rng = new Random(city.stage.seed * 23 + 5);
  const group = new THREE.Group();
  group.name = 'ציוני דרך';
  city.group.add(group);
  const M = city.materials;
  const lit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
  const movers = [];
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, city.angle);
  const place = (geo, x, y, z, yaw = city.angle) => geo.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, yaw)).translate(x, y, z);

  // ---------------------------------------------------------------- round towers
  if (city.roundTowers.length) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ name: 'מגדל זכוכית עגול', color: 0xffffff, roughness: 0.12, metalness: 0.65 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;').replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Floor slabs and mullions on the curtain wall.
        float yh = vInstanceY;
        float slab = step(0.86, fract(yh / 3.9));
        float mull = step(0.93, fract(atan(vLocal.z, vLocal.x) * 5.093));
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vec3(0.78, 0.8, 0.82), max(slab, mull * 0.7));`,
      );
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vInstanceY;').replace('#include <project_vertex>', '#include <project_vertex>\nvInstanceY = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstanceY;');
    };
    mat.customProgramCacheKey = () => 'city-round-tower';
    const mesh = new THREE.InstancedMesh(geo, mat, city.roundTowers.length);
    const caps = [];
    city.roundTowers.forEach((t, k) => {
      mesh.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.h, t.r)));
      mesh.setColorAt(k, t.col);
      // Roof disc, a crown ring and a spire.
      caps.push(paint(new THREE.CylinderGeometry(t.r, t.r, 0.6, 32).translate(t.x, t.y + t.h + 0.3, t.z), 0x8a8f94));
      caps.push(paint(new THREE.CylinderGeometry(t.r * 1.02, t.r * 1.02, 4, 32, 1, true).translate(t.x, t.y + t.h - 2, t.z), 0xc8ccd0));
      caps.push(paint(new THREE.ConeGeometry(0.6, t.r * 1.6, 6).translate(t.x, t.y + t.h + 0.6 + t.r * 0.8, t.z), 0xd8d8d8));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'מגדלים עגולים';
    group.add(mesh);
    const capMesh = new THREE.Mesh(mergeGeometries(caps), lit);
    capMesh.castShadow = true;
    group.add(capMesh);
  }

  // ---------------------------------------------------------------- red roofs
  if (city.tileRoofs.length) {
    // A gable prism, ridge along local z, eaves overhanging a little.
    const g = new THREE.BufferGeometry();
    const v = [
      [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
      [-0.5, 0, 0.5], [0, 1, 0.5], [0.5, 0, 0.5],
    ];
    const tri = (a, b, c) => [...v[a], ...v[b], ...v[c]];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...tri(0, 2, 1), ...tri(3, 5, 4), ...tri(0, 3, 4), ...tri(0, 4, 2), ...tri(1, 2, 4), ...tri(1, 4, 5), ...tri(0, 1, 5), ...tri(0, 5, 3)], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ name: 'רעפים', color: 0xffffff, roughness: 0.78 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float row = fract(vW.y * 3.2);
        float tile = fract((vW.x + vW.z) * 1.6 + floor(vW.y * 3.2) * 0.5);
        diffuseColor.rgb *= 0.78 + 0.22 * smoothstep(0.0, 0.25, row) * (0.85 + 0.15 * step(0.08, tile));`,
      );
    };
    mat.customProgramCacheKey = () => 'city-tiles';
    const mesh = new THREE.InstancedMesh(g, mat, city.tileRoofs.length);
    const tints = [0xb5532e, 0xa84a2a, 0xc0643a, 0x9a4428, 0xb86a44];
    city.tileRoofs.forEach((b, k) => {
      const along = b.d >= b.w;
      const span = along ? b.w : b.d;
      const len = along ? b.d : b.w;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, b.yaw + (along ? 0 : Math.PI / 2));
      mesh.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y + b.h - 0.05, b.z), q, new THREE.Vector3(span + 0.9, Math.max(2.2, span * 0.32), len + 0.9)));
      mesh.setColorAt(k, new THREE.Color(rng.pick(tints)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.name = 'גגות רעפים';
    group.add(mesh);
  }

  // ---------------------------------------------------------------- domes
  const parts = [];
  for (const lot of city.landmarks.domes) {
    const y = lot.y + 0.2;
    const x = lot.p.x;
    const z = lot.p.z;
    const gold = rng.random() < 0.5;
    parts.push(place(paint(new THREE.BoxGeometry(19, 11, 19).translate(0, 5.5, 0), 0xe6dcc6), x, y, z));
    parts.push(place(paint(new THREE.BoxGeometry(21, 1, 21).translate(0, 11.3, 0), 0xcfc4ac), x, y, z));
    parts.push(paint(new THREE.CylinderGeometry(6.4, 6.4, 4.5, 24).translate(x, y + 14, z), 0xe9e0cc));
    parts.push(paint(new THREE.SphereGeometry(6.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y + 16.2, z), gold ? 0xd8a93a : 0x4aa39a));
    parts.push(paint(new THREE.ConeGeometry(0.35, 3.5, 8).translate(x, y + 24.6, z), 0xd8a93a));
    // Four corner turrets with little domes.
    for (const [dx, dz] of [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]]) {
      const p = new THREE.Vector3(dx, 0, dz).applyQuaternion(yawQ);
      parts.push(paint(new THREE.CylinderGeometry(1.3, 1.5, 17, 12).translate(x + p.x, y + 8.5, z + p.z), 0xe6dcc6));
      parts.push(paint(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x + p.x, y + 17, z + p.z), gold ? 0xd8a93a : 0x4aa39a));
    }
    // Arched doorway and windows (dark insets on each face).
    for (let f = 0; f < 4; f++) {
      const a = city.angle + (f * Math.PI) / 2;
      const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      for (const off of [-5, 0, 5]) {
        const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(off);
        parts.push(paint(new THREE.BoxGeometry(2.2, off === 0 ? 5 : 3.4, 0.3).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, a)).translate(x + n.x * 9.55 + t.x, y + (off === 0 ? 2.5 : 6.5), z + n.z * 9.55 + t.z), 0x3a2f28));
      }
    }
  }

  // ---------------------------------------------------------------- arena
  const S = city.landmarks.stadium;
  if (S) {
    const x = S.c.x;
    const z = S.c.z;
    const y = Math.min(...S.lots.map((l) => l.y)) + 0.2;
    const seg = 48;
    const ring = (a0, b0, y0, a1, b1, y1, colA, colB, flip = false) => {
      const pos = [];
      const col = [];
      const cA = new THREE.Color(colA);
      const cB = new THREE.Color(colB);
      for (let k = 0; k < seg; k++) {
        const t0 = (k / seg) * Math.PI * 2;
        const t1 = ((k + 1) / seg) * Math.PI * 2;
        const P = (a, b, yy, t) => new THREE.Vector3(Math.cos(t) * a, yy, Math.sin(t) * b);
        const p00 = P(a0, b0, y0, t0);
        const p01 = P(a0, b0, y0, t1);
        const p10 = P(a1, b1, y1, t0);
        const p11 = P(a1, b1, y1, t1);
        const quad = flip ? [p00, p10, p01, p01, p10, p11] : [p00, p01, p10, p01, p11, p10];
        for (const q of quad) pos.push(q.x, q.y, q.z);
        const c = Math.floor(k / 4) % 2 ? cA : cB;
        for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    const arena = [
      ring(15, 10.5, 1.2, 21.5, 16.5, 12.5, 0xd8332a, 0xf2f2f2, true), // seating bowl
      ring(21.5, 16.5, 12.5, 22.5, 17.5, 13.2, 0xdddddd, 0xdddddd, true), // rim
      ring(22.5, 17.5, 13.2, 22.5, 17.5, 0, 0xcfd3d6, 0xbfc4c8), // outer wall
      ring(15, 10.5, 1.2, 15, 10.5, 0, 0x777777, 0x777777, true),
      ring(19, 14, 15.5, 25, 20, 13.8, 0xf4f4f4, 0xf4f4f4, true), // roof canopy
    ];
    for (const g of arena) g.applyQuaternion(yawQ).translate(x, y, z);
    parts.push(...arena);
    // Pitch with lines.
    const pitch = paint(new THREE.CircleGeometry(1, 40).scale(15, 10.5, 1).rotateX(-Math.PI / 2), 0x3f8f3a);
    parts.push(pitch.applyQuaternion(yawQ).translate(x, y + 0.25, z));
    parts.push(paint(new THREE.BoxGeometry(0.25, 0.05, 18).applyQuaternion(yawQ).translate(x, y + 0.3, z), 0xf4f4f4));
    parts.push(paint(new THREE.TorusGeometry(3, 0.12, 4, 24).rotateX(Math.PI / 2).translate(x, y + 0.3, z), 0xf4f4f4));
    // Roof supports.
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(t) * 22.5, 0, Math.sin(t) * 17.5).applyQuaternion(yawQ);
      parts.push(paint(new THREE.BoxGeometry(0.5, 16, 0.5).translate(x + p.x, y + 8, z + p.z), 0xbfc4c8));
    }
  }

  // ---------------------------------------------------------------- building sites and cranes
  const cranes = [];
  for (const lot of city.landmarks.cranes) {
    const x = lot.p.x;
    const z = lot.p.z;
    const y = lot.y + 0.2;
    const floors = 3 + Math.floor(rng.random() * 6);
    // Concrete frame going up: slabs and columns, no walls yet.
    for (let f = 0; f <= floors; f++) parts.push(place(paint(new THREE.BoxGeometry(17, 0.35, 17).translate(0, f * 3.4 + 0.2, 0), 0xa6a6a2), x, y, z));
    for (const cx of [-8, -2.7, 2.7, 8]) for (const cz of [-8, -2.7, 2.7, 8]) parts.push(place(paint(new THREE.BoxGeometry(0.45, floors * 3.4, 0.45).translate(cx, (floors * 3.4) / 2, cz), 0x9a9a96), x, y, z));
    // Tower crane beside it.
    const H = floors * 3.4 + 22 + rng.random() * 10;
    const base = new THREE.Vector3(10.5, 0, -10.5).applyQuaternion(yawQ);
    const mastX = x + base.x;
    const mastZ = z + base.z;
    parts.push(paint(new THREE.BoxGeometry(1.8, H, 1.8).translate(mastX, y + H / 2, mastZ), 0xf2c230));
    for (let k = 2; k < H; k += 3) parts.push(paint(new THREE.BoxGeometry(1.9, 0.18, 1.9).translate(mastX, y + k, mastZ), 0xd9a820));
    const jib = new THREE.Group();
    jib.position.set(mastX, y + H, mastZ);
    const jg = mergeGeometries([
      paint(new THREE.BoxGeometry(1.4, 1.4, 42).translate(0, 0.7, 15), 0xf2c230),
      paint(new THREE.BoxGeometry(1.2, 1.2, 12).translate(0, 0.6, -9), 0xf2c230),
      paint(new THREE.BoxGeometry(2.6, 2.4, 3).translate(0, -1.2, -13), 0x7a7a78), // counterweight
      paint(new THREE.BoxGeometry(2, 2, 2.4).translate(0, -1, 1.6), 0xe8e8e8), // cab
      paint(new THREE.ConeGeometry(0.9, 6, 4).translate(0, 4, 0), 0xf2c230), // peak
      paint(new THREE.BoxGeometry(0.08, 18, 0.08).translate(0, -9, 26), 0x222222), // hook cable
      paint(new THREE.BoxGeometry(1.2, 0.8, 1.2).translate(0, -18.4, 26), 0xd9362a),
    ]);
    const jm = new THREE.Mesh(jg, lit);
    jm.castShadow = true;
    jib.add(jm);
    jib.rotation.y = rng.random() * 6.28;
    group.add(jib);
    cranes.push({ jib, speed: (rng.random() - 0.5) * 0.08 });
  }

  // ---------------------------------------------------------------- fountains
  const plazas = city.lots.filter((l) => l.kind === 'plaza' && (!S || l.cell !== S));
  const water = new THREE.MeshStandardMaterial({ name: 'מזרקה', color: 0x7fc4e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 });
  const jets = [];
  for (const lot of plazas.slice(0, 8)) {
    const x = lot.p.x;
    const z = lot.p.z;
    const y = lot.y + 0.2;
    parts.push(paint(new THREE.CylinderGeometry(5, 5.3, 0.8, 28).translate(x, y + 0.4, z), 0xd8d2c4));
    parts.push(paint(new THREE.CylinderGeometry(1.1, 1.4, 2.4, 12).translate(x, y + 1.2, z), 0xd8d2c4));
    parts.push(paint(new THREE.CylinderGeometry(2.2, 1.6, 0.4, 16).translate(x, y + 2.4, z), 0xd8d2c4));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28).rotateX(-Math.PI / 2), water);
    pool.position.set(x, y + 0.7, z);
    group.add(pool);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 12, 1, true).translate(0, 2.5, 0), water);
    jet.position.set(x, y + 2.6, z);
    group.add(jet);
    jets.push(jet);
  }

  // ---------------------------------------------------------------- Ferris wheel
  let wheel = null;
  const F = city.landmarks.ferris;
  if (F) {
    const R = 27;
    const x = F.p.x;
    const z = F.p.z;
    const y = F.y + 0.2;
    const hub = R + 5;
    // A-frame legs either side of the wheel.
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.9, hub + 2, 0.9).translate(0, (hub + 2) / 2, 0).rotateX(lean * 0.22);
        const off = new THREE.Vector3(side * 3.2, 0, lean * 0.2).applyQuaternion(yawQ);
        parts.push(paint(leg.applyQuaternion(yawQ).translate(x + off.x, y, z + off.z), 0xf4f4f4));
      }
    }
    parts.push(paint(new THREE.CylinderGeometry(0.7, 0.7, 7.4, 12).rotateZ(Math.PI / 2).applyQuaternion(yawQ).translate(x, y + hub, z), 0x9a9a9a));
    parts.push(place(paint(new THREE.BoxGeometry(14, 3, 8).translate(0, 1.5, 0), 0x2a6fb0), x, y, z)); // ticket booth / platform
    wheel = new THREE.Group();
    wheel.position.set(x, y + hub, z);
    wheel.quaternion.copy(yawQ);
    const spin = new THREE.Group();
    wheel.add(spin);
    const rim = [];
    for (const side of [-2.2, 2.2]) {
      rim.push(paint(new THREE.TorusGeometry(R, 0.35, 6, 64).rotateY(Math.PI / 2).translate(side, 0, 0), 0xf4f4f4));
      rim.push(paint(new THREE.TorusGeometry(R * 0.35, 0.25, 6, 32).rotateY(Math.PI / 2).translate(side, 0, 0), 0xf4f4f4));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        rim.push(paint(new THREE.BoxGeometry(0.2, R, 0.2).translate(0, R / 2, 0).rotateX(a).translate(side, 0, 0), 0xdcdcdc));
      }
    }
    const rimMesh = new THREE.Mesh(mergeGeometries(rim), lit);
    rimMesh.castShadow = true;
    spin.add(rimMesh);
    const cabinColors = [0xe0262b, 0xffd23a, 0x1f6fe0, 0x1faa59, 0xff7a1a, 0x8a4dff];
    const cabins = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const cab = new THREE.Group();
      cab.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
      const body = new THREE.Mesh(
        mergeGeometries([
          paint(new THREE.CapsuleGeometry(1.4, 1.2, 4, 10).scale(1, 1, 1).translate(0, -2.4, 0), cabinColors[k % cabinColors.length]),
          paint(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 4).translate(0, -0.6, 0), 0x777777),
          paint(new THREE.CylinderGeometry(1.45, 1.45, 0.7, 12, 1, true).translate(0, -2.3, 0), 0x2a3440),
        ]),
        lit,
      );
      cab.add(body);
      spin.add(cab);
      cabins.push(cab);
    }
    group.add(wheel);
    movers.push((dt) => {
      spin.rotation.x += dt * 0.05;
      for (const c of cabins) c.rotation.x = -spin.rotation.x;
    });
  }

  // ---------------------------------------------------------------- lighthouse
  const light = (() => {
    const t = city.terrain;
    const R = city.stage.island.radius;
    let best = null;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      let r = R * 0.6;
      while (r < R * 1.5 && t.height(Math.cos(a) * r, Math.sin(a) * r) > 0.8) r += 6;
      r -= 16;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = t.height(x, z);
      if (h < 1.2 || (city.keepOut && city.keepOut(x, z))) continue;
      const q = city._near(x, z);
      const clear = q ? q.dist : 999;
      if (clear < 45) continue;
      const score = clear + r * 0.1;
      if (!best || score > best.score) best = { x, z, h, score };
    }
    return best;
  })();
  let beam = null;
  if (light) {
    const { x, z, h } = light;
    const H = 30;
    const tower = new THREE.CylinderGeometry(2.4, 3.6, H, 20, 6).translate(0, H / 2, 0);
    parts.push(paint(tower, 0xf4f4f4, { color: 0xd8332a, test: (px, py) => Math.floor(py / 5) % 2 === 1 }).translate(x, h, z));
    parts.push(paint(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 20).translate(x, h + H + 0.25, z), 0x333333));
    parts.push(paint(new THREE.CylinderGeometry(4.5, 4.5, 3, 20).translate(x, h + 1.5, z), 0xe8e2d4)); // keeper's house ring
    parts.push(paint(new THREE.ConeGeometry(2.6, 2.6, 16).translate(x, h + H + 5.2, z), 0xd8332a));
    const lamp = new THREE.MeshStandardMaterial({ color: 0x221a00, emissive: 0xfff0b0, emissiveIntensity: 1 });
    M.trackEmissive(lamp, 5);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.4, 16), lamp);
    lantern.position.set(x, h + H + 2.2, z);
    group.add(lantern);
    // The sweeping beam.
    const bm = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    beam = new THREE.Mesh(new THREE.ConeGeometry(6, 90, 16, 1, true).rotateZ(Math.PI / 2).translate(45, 0, 0), bm);
    beam.position.copy(lantern.position);
    group.add(beam);
    movers.push((dt) => (beam.rotation.y += dt * 0.6));
    movers.push(() => (bm.opacity = 0.05 + 0.25 * (city.uniforms.uLit.value || 0)));
  }

  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), lit);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'ציוני דרך';
    group.add(mesh);
  }
  group.traverse((o) => (o.userData.noPick = true));

  return {
    update(dt) {
      for (const m of movers) m(dt);
      for (const c of cranes) c.jib.rotation.y += dt * c.speed;
      const t = performance.now() * 0.004;
      for (const j of jets) j.scale.set(1, 0.9 + Math.sin(t + j.position.x) * 0.1, 1);
    },
  };
}
