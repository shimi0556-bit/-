import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import { CAR_TYPES, carSpec } from './config.js';
import { createCarModel, drawCarProfile } from './CarModel.js';
import { loadMonster, hasMonster, createMonsterCar } from './MonsterTruck.js';
import { loadFish } from './TunnelLife.js';
import conceptHi from './models/concept.glb.gz?url';
import conceptLo from './models/concept-lo.glb.gz?url';
import hyperHi from './models/hyper.glb.gz?url';
import hyperLo from './models/hyper-lo.glb.gz?url';
import gtHi from './models/real-gt.glb.gz?url';
import gtLo from './models/real-gt-lo.glb.gz?url';
import rallyHi from './models/real-rally.glb.gz?url';
import rallyLo from './models/real-rally-lo.glb.gz?url';
import muscleHi from './models/real-muscle.glb.gz?url';
import muscleLo from './models/real-muscle-lo.glb.gz?url';
import buggyHi from './models/real-buggy.glb.gz?url';
import buggyLo from './models/real-buggy-lo.glb.gz?url';
import formulaHi from './models/real-formula.glb.gz?url';
import formulaLo from './models/real-formula-lo.glb.gz?url';

/**
 * Real 3D models for the car types that name one in config (`model`):
 * prepared by tools/models.mjs (concept, hyper) and tools/realcars.mjs (the
 * rest), each in two levels of detail. Every car on the grid is a light clone
 * that only owns its paint and brake lights. If a model cannot load, the type
 * falls back to its procedural body (CarModel.js), so the game never depends on it.
 */
const SOURCES = {
  concept: { hi: conceptHi, lo: conceptLo },
  hyper: { hi: hyperHi, lo: hyperLo },
  'real-gt': { hi: gtHi, lo: gtLo },
  'real-rally': { hi: rallyHi, lo: rallyLo },
  'real-muscle': { hi: muscleHi, lo: muscleLo },
  'real-buggy': { hi: buggyHi, lo: buggyLo },
  'real-formula': { hi: formulaHi, lo: formulaLo },
};
/** Attribution the licences ask for (shown in the menu). */
export const MODEL_CREDIT =
  'המכונית "קונספט" היא מודל אמיתי: "Car Concept" מאת Eric Chadwick (Khronos glTF Sample Assets), ברישיון CC BY 4.0. ' +
  'ההיפרקאר היא מודל אמיתי: "Ferrari 458 Italia" מאת vicent091036 (מדוגמאות three.js), ברישיון CC BY 4.0. שינויים בשתיהן: הוסרו סמלים והמודל הוקטן. ' +
  'GT ספורט: "Free Porsche 911 Carrera 4S" וראלי: "(FREE) 1972 Datsun 240k GT", שתיהן מאת Karol Miklas, ברישיון CC BY-SA 4.0. ' +
  'מאסל: "Dodge Challenger 1970 R/T" מאת kryptonmedia, ברישיון CC0. ' +
  'באגי שטח: "Jeep Wrangler Adventure Rubicon" מאת vecarz, ברישיון CC BY-NC-SA 4.0 (לשימוש לא מסחרי). ' +
  'פורמולה: "McLaren MP4/5" מאת vecarz, ברישיון CC BY 4.0. בכולן הוסרו סמלים, לוחיות ופרסומות והמודל הוקטן. ' +
  'גוף משאית המפלצת: "vehicle-truck" מאת Kenney, ברישיון CC0. הדגים ליד מנהרות הים: "Barramundi Fish" מאת Microsoft (Khronos glTF Sample Assets), ברישיון CC0.';
const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']; // physics order: FL, FR, RL, RR (left = +x)
const LOD_FAR = 24; // metres: beyond this the light version is drawn

const loaded = {};
const UP = new THREE.Vector3(0, 1, 0);
const AXLE = new THREE.Vector3(1, 0, 0);
const _qs = new THREE.Quaternion();
const _qw = new THREE.Quaternion();

export const hasRealModel = (type) => !!loaded[type] || (type === 'monster' && hasMonster());

/** Loads every model named by a car type; resolves even if some fail (they fall back). */
export async function loadRealModels() {
  const loader = new GLTFLoader().register(inlineImages);
  const jobs = CAR_TYPES.filter((t) => t.model && SOURCES[t.model]).map(async (t) => {
    const src = SOURCES[t.model];
    try {
      const [hi, lo] = await Promise.all([parseGz(loader, src.hi), parseGz(loader, src.lo)]);
      loaded[t.id] = prepare(hi.scene, lo.scene);
      modelStatus.ok.push(t.id);
    } catch (e) {
      modelStatus.failed.push({ id: t.id, why: String(e?.message || e).slice(0, 90) });
      console.warn(`real model for ${t.id} did not load; using the procedural body`, e);
    }
  });
  jobs.push(loadMonster((src) => parseGz(loader, src)), loadFish((src) => parseGz(loader, src)));
  await Promise.all(jobs);
  (hasMonster() ? modelStatus.ok : modelStatus.failed).push(hasMonster() ? 'monster' : { id: 'monster', why: 'see console' });
}

/*
 * The claude.ai artifact viewer runs the page in a sandbox whose policy refuses
 * fetch() of data: and blob: addresses (and may refuse WebAssembly), which is
 * how GLTFLoader normally reads an inlined model and its textures: there the
 * cars silently fell back to their procedural bodies, while the same file opened
 * from disk showed the real ones. So nothing here fetches: the inlined bytes are
 * decoded from base64 by hand, unzipped in plain JavaScript (fflate), parsed
 * from memory, and every texture is decoded straight from its bytes (with an
 * <img> fallback where createImageBitmap refuses).
 */

/** Which models loaded and which did not (and why): shown in the menu when any failed. */
export const modelStatus = { ok: [], failed: [] };

/** A `data:…;base64,` address (what Vite inlines) or a plain URL → its bytes, without fetch() for data:. */
async function bytesOf(src) {
  if (!src.startsWith('data:')) return new Uint8Array(await (await fetch(src)).arrayBuffer());
  const bin = atob(src.slice(src.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Unzips in plain JavaScript (fflate, shipped with three): no DecompressionStream, Blob
 * stream or Response, any of which a sandboxed viewer may lack or refuse.
 */
export async function parseGz(loader, src) {
  const raw = gunzipSync(await bytesOf(src));
  return loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
}

/** Bytes → base64 (for a data: image address). */
function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * An image from its encoded bytes: createImageBitmap when the viewer allows it, else an
 * <img> from a data: address (which the artifact viewer always allows).
 */
export async function decodeImage(bytes, mime, opts = {}) {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      return await createImageBitmap(new Blob([bytes], { type: mime }), opts);
    } catch (e) {
      console.warn('createImageBitmap refused; decoding through <img>', e);
    }
  }
  const img = new Image();
  img.src = `data:${mime};base64,${base64(bytes)}`;
  await img.decode();
  return img;
}

/** GLTFLoader plugin: images embedded in the model become textures without an object URL or fetch. */
export function inlineImages(parser) {
  const base = parser.loadImageSource.bind(parser);
  parser.loadImageSource = function (index, loader) {
    const def = this.json.images[index];
    if (def.bufferView === undefined) return base(index, loader);
    if (!this.sourceCache[index]) {
      this.sourceCache[index] = this.getDependency('bufferView', def.bufferView)
        .then((view) => decodeImage(new Uint8Array(view), def.mimeType, { premultiplyAlpha: 'none' }))
        .then((image) => {
          const texture = new THREE.Texture(image);
          texture.needsUpdate = true;
          texture.userData.mimeType = def.mimeType;
          return texture;
        });
    }
    return this.sourceCache[index].then((t) => t.clone());
  };
  return { name: 'inline-images' };
}

/** Splits a loaded scene into a still body and four wheel pivots (centred on each tyre). */
function split(scene) {
  scene.updateMatrixWorld(true);
  const body = new THREE.Group();
  const pivots = WHEELS.map(() => new THREE.Group());
  const parts = WHEELS.map(() => []);
  for (const obj of [...scene.children]) {
    const w = WHEELS.findIndex((n) => obj.name.startsWith(n));
    if (w >= 0) parts[w].push(obj);
    else body.add(obj);
  }
  const box = new THREE.Box3();
  const centres = parts.map((list, w) => {
    const tyre = list.find((o) => /Tire/.test(o.name));
    if (!tyre) throw new Error(`model has no tyre for ${WHEELS[w]}`);
    const c = box.setFromObject(tyre).getCenter(new THREE.Vector3());
    for (const o of list) {
      o.position.sub(c);
      pivots[w].add(o);
    }
    return c;
  });
  return { body, pivots, centres };
}

function prepare(hiScene, loScene) {
  const hi = split(hiScene);
  const lo = split(loScene);
  const byName = new Map();
  // Glass: the source uses real refraction (a second render of the scene per frame); a tinted see-through pane looks close for a fraction.
  const glass = new THREE.MeshStandardMaterial({ name: 'שמשה', color: 0x121a22, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.5, envMapIntensity: 1.25, depthWrite: false });
  const fix = (m) => {
    if (m.name === 'Glass' || m.transmission > 0) return glass;
    // Perfectly smooth coats mirror the sun as a single blinding point (and bloom); real lacquer is a touch softer.
    m.roughness = Math.max(m.roughness, 0.05);
    if (m.clearcoat > 0) m.clearcoatRoughness = Math.max(m.clearcoatRoughness, 0.06);
    // Brushed-metal anisotropy needs the tangents the models ship without: the shader then
    // writes NaN, which the bloom smears into a white glare over the whole car.
    if (m.anisotropy) m.anisotropy = 0;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'clearcoatNormalMap']) if (m[k]) m[k].userData.keep = true;
    return m;
  };
  for (const root of [hi.body, ...hi.pivots]) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = fix(o.material);
      byName.set(o.material.name, o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }
  // The far version wears the same materials (one set of shaders and textures).
  for (const root of [lo.body, ...lo.pivots]) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = byName.get(o.material.name) || fix(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }
  const paint = byName.get('Paint 1 Carmine');
  if (!paint) throw new Error('model is missing its paint');
  // Lamps drawn into a texture (or not modelled) have no material of their own: those glow nowhere.
  const tail = byName.get('Brakelight') || new THREE.MeshStandardMaterial({ name: 'Brakelight' });
  const head = byName.get('Headlight') || new THREE.MeshStandardMaterial({ name: 'Headlight' });
  tail.emissive.set(0xff1a0a);
  head.emissive.set(0xe8f0ff);
  const front = (hi.centres[0].z + hi.centres[1].z) / 2;
  const rear = (hi.centres[2].z + hi.centres[3].z) / 2;
  return {
    hi,
    lo,
    paint,
    tail,
    head,
    glass,
    glow: ['Signallight', 'Dashboard'].map((n) => byName.get(n)).filter(Boolean),
    dz: -(front + rear) / 2, // the wheelbase centred on the physics body
    ground: hi.centres[0].y, // wheel centre height above the ground in the model
    cards: new Map(),
  };
}

/**
 * One car in the real model: { group (a LOD), paint, tailMat, headMat, pose(car) }.
 * The wheels steer, spin and ride the suspension like the physics wheels do.
 */
export function createRealCar(materials, { color = '#d42a2a', type }) {
  const R = loaded[type];
  const W = carSpec(type).wheel;
  if (!R.tracked) {
    // Shared lamps: exposure-compensated like every other emissive in the game.
    materials.trackEmissive(R.head, 0.6);
    for (const m of R.glow) materials.trackEmissive(m, 0.35);
    R.tracked = true;
  }
  const paint = R.paint.clone();
  paint.color.set(color);
  const tailMat = R.tail.clone();
  materials.trackEmissive(tailMat, 0.25);
  const restY = W.height - (W.restLength - 9.82 / (4 * W.stiffness));
  const lod = new THREE.LOD();
  const pivots = [];
  for (const [k, T] of (R.lo === R.hi ? [R.hi] : [R.hi, R.lo]).entries()) {
    const level = new THREE.Group();
    const body = T.body.clone();
    body.position.set(0, restY - R.ground, R.dz);
    level.add(body);
    const ps = T.pivots.map((p, i) => {
      const c = p.clone();
      c.position.set(T.centres[i].x, restY, T.centres[i].z + R.dz);
      level.add(c);
      return c;
    });
    level.traverse((o) => {
      if (o.material === R.paint) o.material = paint;
      else if (o.material === R.tail) o.material = tailMat;
    });
    lod.addLevel(level, k ? LOD_FAR : 0, 0.12);
    pivots.push(ps);
  }
  lod.userData.paint = paint;
  return {
    group: lod,
    paint,
    tailMat,
    headMat: R.head,
    pose(car) {
      const veh = car.vehicle;
      const infos = veh.vehicle.wheelInfos;
      for (let i = 0; i < 4; i++) {
        const info = infos[i];
        const len = info.isInContact ? info.suspensionLength : Math.min(info.suspensionRestLength + 0.05, info.suspensionLength + 0.2);
        _qs.setFromAxisAngle(UP, i < 2 ? -veh.steerAngle : 0);
        _qw.setFromAxisAngle(AXLE, veh.wheelShown[i]);
        _qs.multiply(_qw);
        for (const ps of pivots) {
          ps[i].position.y = W.height - len;
          ps[i].quaternion.copy(_qs);
        }
      }
    },
  };
}

/** A car of each real model in the scene while the start-up shaders compile; returns the clean-up. */
export function warmRealModels(scene, materials) {
  const cars = Object.keys(loaded).map((type) => createRealCar(materials, { type }));
  if (hasMonster()) cars.push(createMonsterCar(materials, { spec: carSpec('monster') }));
  for (const c of cars) scene.add(c.group);
  return () => {
    for (const c of cars) {
      c.group.removeFromParent();
      materials.retire(c.paint);
      materials.retire(c.tailMat);
    }
  };
}

/** The real model when its type has one (and it loaded), else the procedural body. */
export function createVehicleModel(materials, opts) {
  if (opts.type === 'monster' && hasMonster()) return createMonsterCar(materials, { ...opts, spec: carSpec('monster') });
  return loaded[opts.type] ? createRealCar(materials, opts) : createCarModel(materials, opts);
}

const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

/** Every visible triangle of the light version seen from the left side, far to near (once per model). */
function sideTriangles(R) {
  if (R.tris) return R.tris;
  const T = R.lo;
  const g = new THREE.Group();
  const body = T.body.clone();
  body.position.set(0, 0, R.dz);
  g.add(body);
  T.pivots.forEach((p, i) => {
    const c = p.clone();
    c.position.set(T.centres[i].x, R.ground, T.centres[i].z + R.dz);
    g.add(c);
  });
  g.updateMatrixWorld(true);
  const tris = [];
  const L = new THREE.Vector3(0.55, 0.75, 0.35).normalize();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    const m = o.material;
    const kind = m === R.paint ? 'paint' : m === R.glass ? 'glass' : null;
    const base = kind ? null : m.emissive && m.emissive.getHex() && m.color.getHex() === 0 ? m.emissive : m.color;
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) _v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
      _e1.subVectors(_v[1], _v[0]);
      _e2.subVectors(_v[2], _v[0]);
      const nrm = _e1.cross(_e2).normalize();
      if (nrm.x <= 0.02) continue; // facing away from a viewer on the left
      const shade = 0.32 + 0.68 * Math.max(0, nrm.dot(L)) + 0.25 * Math.max(0, nrm.y) ** 4;
      tris.push({ x: (_v[0].x + _v[1].x + _v[2].x) / 3, p: [_v[0].z, _v[0].y, _v[1].z, _v[1].y, _v[2].z, _v[2].y], shade, kind, base: base && base.clone(), metal: m.metalness > 0.5 });
    }
  });
  tris.sort((a, b) => a.x - b.x);
  const box = new THREE.Box3().setFromObject(g);
  R.tris = { tris, box };
  return R.tris;
}

/** Garage card: the real model's side view, drawn once per colour. */
function drawRealProfile(canvas, type, color) {
  const R = loaded[type];
  let img = R.cards.get(color);
  if (!img) {
    const { tris, box } = sideTriangles(R);
    img = document.createElement('canvas');
    img.width = canvas.width * 2;
    img.height = canvas.height * 2;
    const g = img.getContext('2d');
    const Wd = img.width;
    const Hd = img.height;
    const len = box.max.z - box.min.z;
    const scale = (Wd * 0.86) / (len + 0.4);
    const cx = Wd / 2;
    const cy = Hd * 0.8;
    const zc = (box.max.z + box.min.z) / 2;
    const X = (z) => cx - (z - zc) * scale; // nose to the left in the Hebrew (RTL) card
    const Y = (y) => cy - y * scale;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx, cy + 4, (len / 2) * scale * 1.02, 10, 0, 0, Math.PI * 2);
    g.fill();
    const paint = new THREE.Color(color);
    const glass = new THREE.Color(0x1a2530);
    const c = new THREE.Color();
    g.lineJoin = 'round';
    g.lineWidth = 1;
    for (const t of tris) {
      const src = t.kind === 'paint' ? paint : t.kind === 'glass' ? glass : t.base;
      c.copy(src).multiplyScalar(t.kind === 'glass' ? 0.6 + t.shade * 0.6 : t.metal && t.kind !== 'paint' ? 0.35 + t.shade * 0.55 : t.shade);
      c.addScalar(0.012 * t.shade); // tyres and black trim stay readable on the dark card
      const style = `#${c.getHexString()}`;
      g.fillStyle = style;
      g.strokeStyle = style; // covers the hairline seams between neighbours
      const p = t.p;
      g.beginPath();
      g.moveTo(X(p[0]), Y(p[1]));
      g.lineTo(X(p[2]), Y(p[3]));
      g.lineTo(X(p[4]), Y(p[5]));
      g.closePath();
      g.fill();
      g.stroke();
    }
    R.cards.set(color, img);
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
}

/** Garage card profile for any type. */
export function drawProfile(canvas, type, color) {
  if (loaded[type]) drawRealProfile(canvas, type, color);
  else drawCarProfile(canvas, type, color);
}
