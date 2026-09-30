// Stylized Jerusalem: terrain, Old City walls, landmarks, neighborhoods, trees, clouds.
// Coordinates: +x east, -z north. The Old City is centered on the origin.
import * as THREE from 'three';
import * as T from './textures.js';

export const WORLD = 4200;          // terrain size
export const CITY = { x0: -240, x1: 240, z0: -240, z1: 240 };  // Old City walls
const CITY_LEVEL = 40;

// ---------- noise ----------
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < 5; i++) { s += vnoise(x * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (dx, dz, r) => Math.exp(-(dx * dx + dz * dz) / (r * r));

// Distance outside the Old City rectangle (0 inside).
function cityDist(x, z) {
  const dx = Math.max(CITY.x0 - x, 0, x - CITY.x1);
  const dz = Math.max(CITY.z0 - z, 0, z - CITY.z1);
  return Math.hypot(dx, dz);
}

export function heightAt(x, z) {
  let h = 30 + (fbm(x / 520, z / 520) - 0.5) * 90;
  h += 85 * gauss(x - 700, z + 40, 260);            // Mount of Olives
  h += 55 * gauss(x + 50, z + 700, 300);            // Mount Scopus / north ridge
  h -= 45 * Math.exp(-((x - 330) ** 2) / (70 ** 2)) * sstep(-700, -200, z) * (1 - sstep(600, 900, z)); // Kidron
  h -= 38 * gauss(x + 120, z - 390, 150);           // Hinnom valley
  h += 25 * gauss(x + 1100, z - 250, 450);          // western hills
  // Flatten the Old City plateau and the Knesset/bridge areas.
  const k = sstep(0, 90, cityDist(x, z));
  h = CITY_LEVEL * (1 - k) + h * k;
  const kk = sstep(40, 140, Math.hypot(x + 1000, z - 320));
  h = 62 * (1 - kk) + h * kk;
  return h;
}

// ---------- world build ----------
export function buildWorld(scene) {
  const colliders = [];       // {min: Vector3, max: Vector3}
  const landmarks = [];       // {name, pos: Vector3, radius}
  const mapFeatures = { buildings: [], trees: [], walls: [] };
  const animated = [];        // objects with update(t)

  const addCollider = (obj) => {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    colliders.push(b);
    return b;
  };
  const addBoxCollider = (cx, y0, cz, w, h, d) => {
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - w / 2, y0, cz - d / 2), new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2)));
  };

  const stoneTex = T.stoneTexture(1);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92, color: 0xffffff });
  const darkStoneMat = new THREE.MeshStandardMaterial({ map: T.stoneTexture(4, [196, 170, 132]), roughness: 0.95 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.22, emissive: 0x3a2400, emissiveIntensity: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
  const greyDomeMat = new THREE.MeshStandardMaterial({ color: 0x8c9199, roughness: 0.55, metalness: 0.35 });

  // --- Terrain ---
  const seg = 220;
  const tg = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cStone = new THREE.Color(0xcdb690), cDry = new THREE.Color(0xb59a62), cGreen = new THREE.Color(0x7d8a4a), cOlive = new THREE.Color(0x6f7a45);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x / 90, z / 90);
    tmp.copy(cDry).lerp(cGreen, sstep(0.45, 0.7, n));
    tmp.lerp(cOlive, sstep(0.3, 1, gauss(x - 700, z + 40, 320)) * 0.8);
    tmp.lerp(cStone, 1 - sstep(10, 80, cityDist(x, z)));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  const detail = T.groundDetailTexture();
  detail.repeat.set(160, 160);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: detail }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // --- Old City walls with crenellations and towers ---
  const wallH = 16, wallT = 6;
  const wallGroup = new THREE.Group();
  const merlonGeo = new THREE.BoxGeometry(2.2, 2.4, wallT + 0.6);
  const merlons = [];
  const wallSegments = [
    [CITY.x0, CITY.z0, CITY.x1, CITY.z0], // north
    [CITY.x1, CITY.z0, CITY.x1, CITY.z1], // east
    [CITY.x1, CITY.z1, CITY.x0, CITY.z1], // south
    [CITY.x0, CITY.z1, CITY.x0, CITY.z0], // west
  ];
  const gates = [
    { name: 'שער שכם', x: -20, z: CITY.z0, rot: 0 },
    { name: 'שער יפו', x: CITY.x0, z: 10, rot: Math.PI / 2 },
    { name: 'שער האריות', x: CITY.x1, z: -120, rot: Math.PI / 2 },
    { name: 'שער ציון', x: -60, z: CITY.z1, rot: 0 },
  ];
  for (const [ax, az, bx, bz] of wallSegments) {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const tex = stoneTex.clone(); tex.repeat.set(len / 14, wallH / 14); tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + wallT, wallH, wallT), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    m.position.set((ax + bx) / 2, CITY_LEVEL + wallH / 2 - 2, (az + bz) / 2);
    m.rotation.y = -ang;
    m.castShadow = m.receiveShadow = true;
    wallGroup.add(m);
    addCollider(m);
    mapFeatures.walls.push([ax, az, bx, bz]);
    for (let s = 0; s < len; s += 4.5) {
      const t = s / len;
      merlons.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, rot: -ang });
    }
    // Towers every ~80m.
    for (let s = 0; s <= len; s += 80) {
      const t = s / len;
      const tw = new THREE.Mesh(new THREE.BoxGeometry(12, wallH + 6, 12), darkStoneMat);
      tw.position.set(ax + (bx - ax) * t, CITY_LEVEL + (wallH + 6) / 2 - 2, az + (bz - az) * t);
      tw.castShadow = true;
      wallGroup.add(tw);
    }
  }
  const mInst = new THREE.InstancedMesh(merlonGeo, stoneMat, merlons.length);
  const dummy = new THREE.Object3D();
  merlons.forEach((mm, i) => {
    dummy.position.set(mm.x, CITY_LEVEL + wallH - 0.8, mm.z);
    dummy.rotation.set(0, mm.rot, 0);
    dummy.updateMatrix();
    mInst.setMatrixAt(i, dummy.matrix);
  });
  mInst.castShadow = true;
  wallGroup.add(mInst);
  for (const g of gates) {
    const gate = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(24, wallH + 10, 14), darkStoneMat);
    body.position.y = (wallH + 10) / 2; body.castShadow = true;
    const arch = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 15), new THREE.MeshStandardMaterial({ color: 0x2a1f16 }));
    arch.position.y = 6;
    const archTop = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 15, 16, 1, false, 0, Math.PI), arch.material);
    archTop.rotation.set(Math.PI / 2, 0, Math.PI / 2); archTop.position.y = 12;
    gate.add(body, arch, archTop);
    gate.position.set(g.x, CITY_LEVEL - 2, g.z);
    gate.rotation.y = g.rot;
    wallGroup.add(gate);
    landmarks.push({ name: g.name, pos: new THREE.Vector3(g.x, CITY_LEVEL + 20, g.z), radius: 70 });
  }
  scene.add(wallGroup);

  // --- Temple Mount platform, Dome of the Rock, Western Wall ---
  const tm = { x: 140, z: 30, w: 150, d: 200 };
  const platTex = stoneTex.clone(); platTex.repeat.set(10, 1.2); platTex.needsUpdate = true;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(tm.w, 14, tm.d), new THREE.MeshStandardMaterial({ map: platTex, roughness: 0.9 }));
  plat.position.set(tm.x, CITY_LEVEL + 5, tm.z);
  plat.castShadow = plat.receiveShadow = true;
  scene.add(plat); addCollider(plat);
  const topY = CITY_LEVEL + 12;

  const dome = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.BoxGeometry(56, 3, 56), stoneMat); upper.position.y = 1.5;
  const oct = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 15, 8), new THREE.MeshStandardMaterial({ map: T.tileTexture(), roughness: 0.4, metalness: 0.1 }));
  oct.position.y = 3 + 7.5; oct.rotation.y = Math.PI / 8;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 7, 32), new THREE.MeshStandardMaterial({ map: T.tileTexture(), roughness: 0.4 }));
  drum.position.y = 18 + 3.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(11, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
  cap.scale.y = 1.15; cap.position.y = 25;
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 4), goldMat); finial.position.y = 39;
  [upper, oct, drum, cap].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  dome.add(upper, oct, drum, cap, finial);
  dome.position.set(tm.x + 10, topY, tm.z - 10);
  scene.add(dome); addCollider(oct); addCollider(cap);
  landmarks.push({ name: 'כיפת הסלע', pos: new THREE.Vector3(tm.x + 10, topY + 30, tm.z - 10), radius: 80 });

  // Al-Aqsa (grey dome) at the southern end.
  const aqsa = new THREE.Group();
  const aqB = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 60), stoneMat); aqB.position.y = 6; aqB.castShadow = true;
  const aqD = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), greyDomeMat); aqD.position.set(0, 12, 22);
  aqsa.add(aqB, aqD); aqsa.position.set(tm.x, topY, tm.z + 65);
  scene.add(aqsa); addCollider(aqB);

  // Western Wall: big ashlars, plaza in front.
  const kotelTex = T.stoneTexture(9, [214, 196, 160]); kotelTex.repeat.set(5, 1.6);
  const kotel = new THREE.Mesh(new THREE.BoxGeometry(4, 26, 70), new THREE.MeshStandardMaterial({ map: kotelTex, roughness: 0.95 }));
  kotel.position.set(tm.x - tm.w / 2 - 1, CITY_LEVEL + 11, tm.z + 40);
  kotel.castShadow = kotel.receiveShadow = true;
  scene.add(kotel); addCollider(kotel);
  // Greenery in the cracks.
  const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 6, 5), new THREE.MeshStandardMaterial({ color: 0x5e7a36 }), 24);
  for (let i = 0; i < 24; i++) {
    dummy.position.set(kotel.position.x - 2.2, CITY_LEVEL + 8 + hash(i, 3) * 18, kotel.position.z - 32 + hash(i, 7) * 64);
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.6 + hash(i, 1)); dummy.updateMatrix();
    bush.setMatrixAt(i, dummy.matrix);
  }
  scene.add(bush);
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 80), new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.8 }));
  plaza.position.set(kotel.position.x - 32, CITY_LEVEL + 0.2, kotel.position.z); plaza.receiveShadow = true;
  scene.add(plaza);
  landmarks.push({ name: 'הכותל המערבי', pos: new THREE.Vector3(kotel.position.x - 20, CITY_LEVEL + 16, kotel.position.z), radius: 60 });

  // Holy Sepulchre: two grey domes + bell tower.
  const hs = new THREE.Group();
  const hsB = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 34), darkStoneMat); hsB.position.y = 9; hsB.castShadow = true;
  const hsD1 = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), greyDomeMat); hsD1.position.set(-8, 18, 0);
  const hsD2 = new THREE.Mesh(new THREE.SphereGeometry(5.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), greyDomeMat); hsD2.position.set(10, 18, 2);
  const hsT = new THREE.Mesh(new THREE.BoxGeometry(7, 30, 7), darkStoneMat); hsT.position.set(16, 15, -12); hsT.castShadow = true;
  hs.add(hsB, hsD1, hsD2, hsT); hs.position.set(-90, CITY_LEVEL, -40);
  scene.add(hs); addCollider(hsB); addCollider(hsT);
  landmarks.push({ name: 'כנסיית הקבר', pos: new THREE.Vector3(-90, CITY_LEVEL + 25, -40), radius: 55 });

  // Tower of David (citadel + minaret) by Jaffa Gate.
  const td = new THREE.Group();
  const tdB = new THREE.Mesh(new THREE.BoxGeometry(44, 20, 44), darkStoneMat); tdB.position.y = 10; tdB.castShadow = true;
  const tdM = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 42, 16), stoneMat); tdM.position.set(14, 21, 14); tdM.castShadow = true;
  const tdBal = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 1.2, 16), stoneMat); tdBal.position.set(14, 34, 14);
  const tdTop = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7, 16), greyDomeMat); tdTop.position.set(14, 45.5, 14);
  const tdKeep = new THREE.Mesh(new THREE.BoxGeometry(16, 30, 16), darkStoneMat); tdKeep.position.set(-10, 15, -8); tdKeep.castShadow = true;
  td.add(tdB, tdM, tdBal, tdTop, tdKeep); td.position.set(CITY.x0 + 30, CITY_LEVEL - 2, 45);
  scene.add(td); addCollider(tdB); addCollider(tdM); addCollider(tdKeep);
  landmarks.push({ name: 'מגדל דוד', pos: new THREE.Vector3(CITY.x0 + 44, CITY_LEVEL + 50, 59), radius: 60 });

  // --- Old City houses: small stone cubes with little domes ---
  const houseGeo = new THREE.BoxGeometry(1, 1, 1); houseGeo.translate(0, 0.5, 0);
  const houseMat = [stoneMat, stoneMat, new THREE.MeshStandardMaterial({ map: T.roofTexture(), roughness: 1 }), stoneMat, stoneMat, stoneMat];
  const miniDomeGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const oldHouses = [], miniDomes = [];
  const occupied = (x, z) => (
    (x > tm.x - tm.w / 2 - 70 && x < tm.x + tm.w / 2 + 6 && z > tm.z - tm.d / 2 - 6 && z < tm.z + tm.d / 2 + 6) ||
    (Math.abs(x + 90) < 32 && Math.abs(z + 40) < 28) ||
    (Math.abs(x - (CITY.x0 + 30)) < 34 && Math.abs(z - 45) < 34)
  );
  for (let x = CITY.x0 + 14; x < CITY.x1 - 10; x += 13) {
    for (let z = CITY.z0 + 14; z < CITY.z1 - 10; z += 13) {
      if (occupied(x, z)) continue;
      if (hash(x, z) < 0.12) continue; // alleys
      const w = 8 + hash(x + 1, z) * 4, d = 8 + hash(x, z + 1) * 4, h = 6 + hash(x + 3, z + 5) * 9;
      const px = x + (hash(x, 9) - 0.5) * 3, pz = z + (hash(9, z) - 0.5) * 3;
      oldHouses.push([px, pz, w, h, d]);
      if (hash(x + 7, z + 2) < 0.45) miniDomes.push([px, CITY_LEVEL + h, pz, Math.min(w, d) * 0.32]);
    }
  }
  const oh = new THREE.InstancedMesh(houseGeo, houseMat, oldHouses.length);
  const houseColor = new THREE.Color();
  oldHouses.forEach(([x, z, w, h, d], i) => {
    dummy.position.set(x, CITY_LEVEL - 1, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(w, h + 1, d); dummy.updateMatrix();
    oh.setMatrixAt(i, dummy.matrix);
    const v = 0.88 + hash(x, z * 3) * 0.14;
    oh.setColorAt(i, houseColor.setRGB(v, v * 0.98, v * 0.94));
    addBoxCollider(x, CITY_LEVEL - 1, z, w, h + 1, d);
    mapFeatures.buildings.push([x, z, w, d, 0]);
  });
  oh.castShadow = oh.receiveShadow = true;
  scene.add(oh);
  const md = new THREE.InstancedMesh(miniDomeGeo, stoneMat, miniDomes.length);
  miniDomes.forEach(([x, y, z, r], i) => { dummy.position.set(x, y, z); dummy.scale.set(r, r * 0.8, r); dummy.updateMatrix(); md.setMatrixAt(i, dummy.matrix); });
  md.castShadow = true;
  scene.add(md);

  // --- Modern neighborhoods: stone apartment blocks with rooftop solar water heaters ---
  const facade = T.facadeTexture(2);
  const facade2 = T.facadeTexture(6);
  const roofMat = new THREE.MeshStandardMaterial({ map: T.roofTexture(8), roughness: 1 });
  const variants = [];
  for (let v = 0; v < 8; v++) {
    const w = 14 + (v % 4) * 5, d = 12 + ((v >> 1) % 3) * 5, h = 10 + v * 4.5;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    // Scale UVs so windows keep a real-world size (4m x 3.5m per tile / 2 windows each).
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      if (ny > 0.5) continue;
      const faceW = nx > 0.5 ? d : w;
      uv.setXY(i, uv.getX(i) * faceW / 8, uv.getY(i) * h / 7);
    }
    const mat = new THREE.MeshStandardMaterial({ map: v % 2 ? facade : facade2, roughness: 0.9 });
    variants.push({ geo: g, mats: [mat, mat, roofMat, roofMat, mat, mat], w, d, h, items: [] });
  }
  const tankItems = [];
  const avoid = (x, z) =>
    cityDist(x, z) < 70 ||
    Math.hypot(x - 700, z + 40) < 330 ||                       // Mount of Olives stays green
    Math.abs(x - 330) < 80 && z > -600 && z < 700 ||           // Kidron valley
    Math.hypot(x + 120, z - 390) < 110 ||                      // Hinnom valley park
    Math.hypot(x + 1000, z - 320) < 150 ||                     // Knesset hill
    Math.hypot(x + 330, z - 180) < 60 ||                       // windmill
    Math.hypot(x + 1300, z + 300) < 120 ||                     // bridge
    Math.abs(x) > 1900 || Math.abs(z) > 1900;
  for (let x = -1850; x < 1850; x += 34) {
    for (let z = -1850; z < 1850; z += 34) {
      const jx = x + (hash(x, z) - 0.5) * 12, jz = z + (hash(z, x) - 0.5) * 12;
      if (avoid(jx, jz)) continue;
      const dist = Math.hypot(jx, jz);
      const density = 0.85 - dist / 3200 + (jx < -300 ? 0.12 : 0);
      if (hash(jx * 0.7, jz * 1.3) > density) continue;
      // Taller towers in the west (city center), lower east.
      const tall = jx < -500 && jx > -1400 && Math.abs(jz) < 700 ? 1 : 0;
      let vi = Math.floor(hash(jx + 11, jz + 3) * (tall ? 8 : 4));
      const variant = variants[vi];
      const rot = hash(jx, jz + 9) < 0.5 ? 0 : Math.PI / 2;
      const y = heightAt(jx, jz) - 3;
      variant.items.push([jx, y, jz, rot]);
      const [cw, cd] = rot ? [variant.d, variant.w] : [variant.w, variant.d];
      addBoxCollider(jx, y, jz, cw, variant.h + 3, cd);
      mapFeatures.buildings.push([jx, jz, cw, cd, 1]);
      const tanks = 1 + Math.floor(hash(jx, jz * 2) * 3);
      for (let k = 0; k < tanks; k++) tankItems.push([jx + (k - 1) * 3, y + variant.h + 3, jz + (hash(k, jx) - 0.5) * 4, rot]);
    }
  }
  for (const v of variants) {
    if (!v.items.length) continue;
    const im = new THREE.InstancedMesh(v.geo, v.mats, v.items.length);
    v.items.forEach(([x, y, z, rot], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      const c = 0.86 + hash(x, z) * 0.16;
      im.setColorAt(i, houseColor.setRGB(c, c * 0.97, c * 0.92));
    });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
  // Solar water heater: tilted dark panel + white tank ("dud shemesh").
  const panelGeo = new THREE.BoxGeometry(2.2, 0.15, 1.6); panelGeo.rotateX(-0.6); panelGeo.translate(0, 0.9, 0.3);
  const tankGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 10); tankGeo.rotateZ(Math.PI / 2); tankGeo.translate(0, 1.6, -0.5);
  const panels = new THREE.InstancedMesh(panelGeo, new THREE.MeshStandardMaterial({ color: 0x1d2a3a, metalness: 0.6, roughness: 0.3 }), tankItems.length);
  const tanksM = new THREE.InstancedMesh(tankGeo, whiteMat, tankItems.length);
  tankItems.forEach(([x, y, z, rot], i) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, rot + Math.PI, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    panels.setMatrixAt(i, dummy.matrix); tanksM.setMatrixAt(i, dummy.matrix);
  });
  scene.add(panels, tanksM);

  // --- Chords Bridge (Calatrava) at the western entrance ---
  const br = new THREE.Group();
  const bx = -1300, bz = -300, by = heightAt(bx, bz);
  const deckCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-110, 10, 40), new THREE.Vector3(0, 14, -30), new THREE.Vector3(110, 10, 40));
  const deck = new THREE.Mesh(new THREE.TubeGeometry(deckCurve, 60, 3, 6), whiteMat); deck.scale.y = 0.4; deck.position.y = 6;
  const pylonBase = new THREE.Vector3(-30, 8, 0);
  const pylonTop = new THREE.Vector3(-70, 118, 0);
  const pylonCurve = new THREE.LineCurve3(pylonBase, pylonTop);
  const pylon = new THREE.Mesh(new THREE.TubeGeometry(pylonCurve, 8, 2.4, 10), whiteMat); pylon.castShadow = true;
  const cablePts = [];
  for (let i = 0; i <= 26; i++) {
    const tt = i / 26;
    const top = pylonBase.clone().lerp(pylonTop, 0.35 + tt * 0.63);
    const deckP = deckCurve.getPoint(0.3 + tt * 0.7); deckP.y = deckP.y * 0.4 + 6;
    cablePts.push(top, deckP);
  }
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: 0xffffff }));
  br.add(deck, pylon, cables);
  br.position.set(bx, by, bz); br.rotation.y = 0.4;
  scene.add(br);
  const pylonCol = new THREE.Mesh(new THREE.BoxGeometry(12, 118, 12)); pylonCol.position.set(-50, 60, 0); br.add(pylonCol); pylonCol.visible = false; addCollider(pylonCol);
  landmarks.push({ name: 'גשר המיתרים', pos: new THREE.Vector3(bx - 40, by + 70, bz - 15), radius: 90 });

  // --- Montefiore Windmill ---
  const wm = new THREE.Group();
  const wmx = -330, wmz = 180, wmy = heightAt(wmx, wmz);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6.5, 18, 20), stoneMat); tower.position.y = 9; tower.castShadow = true;
  const wcap = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.6 })); wcap.position.y = 18; wcap.scale.y = 0.8;
  const blades = new THREE.Group(); blades.position.set(0, 17, 5.4);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 13, 0.4), new THREE.MeshStandardMaterial({ color: 0x5a3d22 })); bar.position.y = 6.5;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 0.15), new THREE.MeshStandardMaterial({ color: 0xece5d5, side: THREE.DoubleSide })); sail.position.set(1.6, 7.5, 0);
    arm.add(bar, sail); blades.add(arm);
  }
  wm.add(tower, wcap, blades); wm.position.set(wmx, wmy, wmz); wm.rotation.y = -0.6;
  scene.add(wm); addCollider(tower);
  animated.push(t => { blades.rotation.z = t * 0.6; });
  landmarks.push({ name: 'טחנת הרוח של מונטיפיורי', pos: new THREE.Vector3(wmx, wmy + 25, wmz), radius: 60 });

  // --- The Knesset ---
  const kn = new THREE.Group();
  const knx = -1000, knz = 320, kny = heightAt(knx, knz);
  const knBody = new THREE.Mesh(new THREE.BoxGeometry(80, 18, 60), stoneMat); knBody.position.y = 11; knBody.castShadow = true;
  const knRoof = new THREE.Mesh(new THREE.BoxGeometry(92, 2.5, 72), new THREE.MeshStandardMaterial({ color: 0xd8cdb4 })); knRoof.position.y = 21;
  const colGeo = new THREE.BoxGeometry(1.8, 18, 1.8);
  const cols = new THREE.InstancedMesh(colGeo, whiteMat, 44);
  let ci = 0;
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) { dummy.position.set(-40 + i * 7.3, 11, s * 34); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); cols.setMatrixAt(ci++, dummy.matrix); }
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) { dummy.position.set(s * 44, 11, -30 + i * 6.6); dummy.updateMatrix(); cols.setMatrixAt(ci++, dummy.matrix); }
  cols.count = ci;
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 26), whiteMat); flagPole.position.set(0, 35, 0);
  const flagTex = (() => { const c = document.createElement('canvas'); c.width = 220; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 220, 160); g.fillStyle = '#0038b8'; g.fillRect(0, 16, 220, 24); g.fillRect(0, 120, 220, 24); g.strokeStyle = '#0038b8'; g.lineWidth = 6; const star = (up) => { g.beginPath(); for (let k = 0; k < 3; k++) { const a = (up ? -Math.PI / 2 : Math.PI / 2) + k * 2 * Math.PI / 3; g.lineTo(110 + Math.cos(a) * 30, 80 + Math.sin(a) * 30); } g.closePath(); g.stroke(); }; star(true); star(false); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flagGeo = new THREE.PlaneGeometry(11, 8, 12, 4);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(5.8, 44, 0);
  const flagBase = flagGeo.attributes.position.array.slice();
  animated.push(t => {
    const p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = flagBase[i * 3];
      p.setZ(i, Math.sin(x * 0.7 - t * 4) * 0.5 * (x + 5.5) / 11);
    }
    p.needsUpdate = true;
  });
  kn.add(knBody, knRoof, cols, flagPole, flag); kn.position.set(knx, kny, knz);
  scene.add(kn); addCollider(knBody); addCollider(knRoof);
  landmarks.push({ name: 'הכנסת', pos: new THREE.Vector3(knx, kny + 40, knz), radius: 90 });

  // --- Trees: cypress + olive (instanced) ---
  const cypressGeo = new THREE.ConeGeometry(1.6, 11, 7); cypressGeo.translate(0, 5.5, 0);
  const oliveGeo = new THREE.IcosahedronGeometry(3.2, 0); oliveGeo.scale(1, 0.75, 1); oliveGeo.translate(0, 3.6, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 5); trunkGeo.translate(0, 1.2, 0);
  const cyp = [], oli = [];
  for (let i = 0; i < 5200; i++) {
    const x = (hash(i, 1.7) - 0.5) * 3800, z = (hash(2.3, i) - 0.5) * 3800;
    if (cityDist(x, z) < 20 && !(Math.abs(x - 200) < 60)) continue;
    const olives = gauss(x - 700, z + 40, 330);
    const valley = gauss(x + 120, z - 390, 140) + Math.exp(-((x - 330) ** 2) / 6000);
    const p = 0.12 + olives * 0.9 + valley * 0.7;
    if (hash(x, z) > p) continue;
    if (avoid(x, z) === false && olives < 0.2 && valley < 0.2 && hash(i, 5) > 0.25) continue;
    (hash(i, 9) < 0.35 + (olives > 0.3 ? -0.2 : 0.2) ? cyp : oli).push([x, heightAt(x, z) - 0.3, z, 0.7 + hash(i, 4) * 0.7]);
  }
  // Trees on the Temple Mount esplanade.
  for (let i = 0; i < 40; i++) oli.push([tm.x - 60 + hash(i, 44) * 120, topY - 1, tm.z + 50 + hash(44, i) * 40 - 20, 0.6]);
  const makeTrees = (list, geo, color) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), list.length);
    const col = new THREE.Color();
    list.forEach(([x, y, z, s], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, hash(x, z) * 6, 0); dummy.scale.set(s, s * (0.85 + hash(z, x) * 0.4), s); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, col.setHex(color).offsetHSL(0, 0, (hash(x, z) - 0.5) * 0.1));
      mapFeatures.trees.push([x, z]);
    });
    im.castShadow = true;
    scene.add(im);
    return im;
  };
  makeTrees(cyp, cypressGeo, 0x2f4a26);
  makeTrees(oli, oliveGeo, 0x7c8a56);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4632 }), oli.length);
  oli.forEach(([x, y, z, s], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
  scene.add(trunks);
  landmarks.push({ name: 'הר הזיתים', pos: new THREE.Vector3(700, heightAt(700, -40) + 30, -40), radius: 160 });

  // --- Clouds ---
  const cloudTex = T.cloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffe2c4, transparent: true, depthWrite: false, opacity: 0.65 + hash(i, 2) * 0.3, fog: true });
    const s = new THREE.Sprite(m);
    const r = 500 + hash(i, 3) * 1700, a = hash(i, 8) * Math.PI * 2;
    s.position.set(Math.cos(a) * r, 230 + hash(i, 1) * 160, Math.sin(a) * r);
    const sc = 260 + hash(i, 6) * 300; s.scale.set(sc, sc * 0.5, 1);
    clouds.add(s);
  }
  scene.add(clouds);
  animated.push((t, dt) => { clouds.rotation.y += dt * 0.004; });

  return { colliders, landmarks, mapFeatures, animated, heightAt, templeMount: tm };
}
