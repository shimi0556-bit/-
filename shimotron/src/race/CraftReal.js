import * as THREE from 'three';
import { bakeNode } from './MonsterTruck.js';
import geebeeGz from './models/plane-geebee.glb.gz?url';
import p51Gz from './models/plane-p51.glb.gz?url';
import catGz from './models/boat-cat.glb.gz?url';
import sprintGz from './models/boat-sprint.glb.gz?url';
import yellowGz from './models/sub-yellow.glb.gz?url';
import excavatorGz from './models/sub-excavator.glb.gz?url';

/**
 * Real downloaded models for the boats, submarines and planes (CC BY 4.0, see
 * tools/vehicles.mjs and models/CREDITS.md). Each file faces +z with its lowest point on
 * y = 0 and its propellers as nodes (`prop`, `prop_L`, `prop_R`) on their hubs, spinning
 * about their own z. Here each is scaled and moved into the craft's frame (CraftModels.js:
 * y = 0 the waterline for boats, the centre line for the rest), and given the points the
 * craft needs: the cockpit eye, the nose camera, spray points, the landing gear's height.
 *
 * Model coordinates below are measured on the files (metres before `scale`).
 */
export const REAL_CRAFT = {
  racer: {
    src: geebeeGz,
    kind: 'plane',
    scale: 1,
    centre: 1.392, // the propeller's axis: the plane's centre line
    eye: [0, 2.25, -1.05],
    nose: [3.0, 0.62, 0.35],
    // Red parts of the livery take the pilot's colour.
    key: { hue: 0, tol: 0.06 },
    fallback: 'racer',
  },
  mustang: {
    src: p51Gz,
    kind: 'plane',
    scale: 1,
    centre: 1.951,
    eye: [0, 2.62, 0.45],
    nose: [3.6, 1.3, 1.6],
    key: { hue: 0, tol: 0.06 },
    fallback: 'racer',
  },
  offshore: {
    src: catGz,
    kind: 'boat',
    scale: 0.85,
    draft: 0.32, // the sponsons sit this deep in the water
    eye: [0, 2.05, 1.2], // on the canopy: inside, its tinted shell hides the water
    nose: [0, 1.0, 5.6],
    key: { hue: 0, tol: 0.07 },
    fallback: 'offshore',
  },
  sprint: {
    src: sprintGz,
    kind: 'boat',
    scale: 1.25,
    draft: 0.3,
    eye: [0.3, 1.2, -0.25],
    nose: [0, 0.75, 2.1],
    // Untextured: its red hull material takes the colour.
    paint: 'color_15277357',
    fallback: 'runabout',
  },
  bubble: {
    src: yellowGz,
    kind: 'sub',
    scale: 1,
    centre: 1.132,
    eye: [0, 1.15, 1.9],
    nose: [0, 0.55, 2.75],
    paint: 'Material__397',
    fallback: 'bubble',
  },
  excavator: {
    src: excavatorGz,
    kind: 'sub',
    scale: 1,
    centre: 1.144,
    eye: [0, 1.85, 0.75],
    nose: [0, 0.6, 2.45],
    key: { hue: 0.14, tol: 0.06 },
    fallback: 'orca',
  },
};

const loaded = {};
export const hasRealCraft = (design) => !!loaded[design];

/** Loads every craft model (parse: inlined gzipped GLB → gltf); failures leave the procedural craft. */
export async function loadCrafts(parse, status) {
  await Promise.all(
    Object.entries(REAL_CRAFT).map(async ([design, C]) => {
      try {
        const gltf = await parse(C.src);
        loaded[design] = prepare(gltf.scene, C);
        status.ok.push(design);
      } catch (e) {
        status.failed.push({ id: design, why: String(e?.message || e).slice(0, 90) });
        console.warn(`real model for ${design} did not load; using the procedural craft`, e);
      }
    }),
  );
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

function prepare(scene, C) {
  const s = C.scale;
  // Model → craft frame: scaled, then lowered so y = 0 is the waterline or the centre line.
  const dy = C.kind === 'boat' ? -C.draft * s : -C.centre * s;
  const props = [];
  const keep = (parts) => {
    for (const p of parts) {
      const m = p.mat;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].userData.keep = true; // shared by every craft
      if (m.transparent && m.opacity < 0.5) m.depthWrite = false;
    }
    return parts;
  };
  // Each propeller round its hub: the mean of its vertices across the disc (blades even or odd),
  // the middle of its depth along the axis. (The node's own position is not the hub: quantizing
  // moved the meshes' offsets into the node transforms.)
  const nodes = [];
  scene.traverse((o) => {
    if (/^prop/.test(o.name) && !/^prop/.test(o.parent?.name || '')) nodes.push(o);
  });
  for (const o of nodes) {
    const parts = keep(bakeNode(o));
    const at = new THREE.Vector3();
    let n = 0;
    _box.makeEmpty();
    for (const p of parts) {
      const pos = p.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) at.add(_v.fromBufferAttribute(pos, i));
      n += pos.count;
      p.geo.computeBoundingBox();
      _box.union(p.geo.boundingBox);
    }
    at.divideScalar(n || 1);
    at.z = (_box.min.z + _box.max.z) / 2;
    for (const p of parts) p.geo.translate(-at.x, -at.y, -at.z);
    const size = _box.getSize(_v);
    props.push({ name: o.name, parts, at: [at.x * s, at.y * s + dy, at.z * s], r: (Math.max(size.x, size.y) / 2) * s });
  }
  const bodyNode = scene.getObjectByName('body');
  if (!bodyNode) throw new Error('model has no body');
  const body = keep(bakeNode(bodyNode));
  _box.makeEmpty();
  for (const p of body) {
    p.geo.computeBoundingBox();
    _box.union(p.geo.boundingBox);
  }
  const box = _box.clone();
  const P = (a) => [a[0] * s, a[1] * s + dy, a[2] * s];
  // Blur discs only for a plane's big propeller (a boat's or sub's small one is seen turning).
  const parts = { eye: P(C.eye), nose: P(C.nose), props: C.kind === 'plane' ? props.map((p) => ({ pos: p.at, r: p.r })) : [] };
  if (C.kind === 'plane') {
    // Parked: the main wheels on the road (the origin rides `gear` above it), and a taildragger's
    // nose up by the angle from the main wheels to the tail wheel.
    parts.gear = C.centre * s;
    parts.tailSit = tailAngle(body, box);
  }
  if (C.kind === 'boat') {
    const props2 = props.map((p) => p.at[0]);
    parts.spray = { bow: box.max.z * s * 0.55, beam: (box.max.x - box.min.x) * s * 0.5, stern: box.min.z * s, props: props2.length ? props2 : [0] };
  }
  return { C, s, dy, body, props, parts, length: (box.max.z - box.min.z) * s };
}

/** Pitch of a plane resting on its main wheels and its tail (or tail wheel). */
function tailAngle(body, box) {
  // Main wheels: the lowest points (y ≈ 0); the tail: the lowest point of the rear third.
  let zMain = 0;
  let nMain = 0;
  let tail = null;
  const back = box.min.z + (box.max.z - box.min.z) / 3;
  for (const { geo } of body) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < box.min.y + 0.03) {
        zMain += z;
        nMain++;
      }
      if (z < back && (!tail || y < tail.y)) tail = { y, z };
    }
  }
  if (!nMain || !tail) return 0;
  zMain /= nMain;
  return Math.max(0, Math.atan2(tail.y - box.min.y, zMain - tail.z));
}

/** The keyed paint: texels of the key hue take the craft's colour (shading and trim kept). */
function keyedMaterial(src, color, key) {
  const m = src.clone();
  m.userData.paint = new THREE.Color(color);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: m.userData.paint };
    sh.uniforms.uKey = { value: new THREE.Vector2(key.hue, key.tol) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nuniform vec2 uKey;').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      { vec3 c = sampledDiffuseColor.rgb; float hi = max(c.r, max(c.g, c.b)); float lo = min(c.r, min(c.g, c.b));
        float sat = (hi - lo) / max(hi, 1e-4); float h = 0.0;
        if (hi - lo > 1e-4) { h = hi == c.r ? mod((c.g - c.b) / (hi - lo), 6.0) : hi == c.g ? (c.b - c.r) / (hi - lo) + 2.0 : (c.r - c.g) / (hi - lo) + 4.0; h /= 6.0; }
        float d = abs(h - uKey.x); d = min(d, 1.0 - d);
        float k = smoothstep(0.3, 0.5, sat) * smoothstep(0.04, 0.12, hi) * (1.0 - smoothstep(uKey.y, uKey.y + 0.05, d));
        diffuseColor.rgb = mix(c, uPaint * (0.12 + 1.05 * hi), k); }`,
    );
  };
  m.customProgramCacheKey = () => `craft-key-${key.hue}-${key.tol}`;
  return m;
}

const paints = new Map();
/** This design's materials in a colour (cached: racers in the same colour share them). */
function materialsFor(R, color) {
  const id = `${R.C.src}|${color}`;
  if (!paints.has(id)) {
    const map = new Map();
    const all = [...R.body, ...R.props.flatMap((p) => p.parts)];
    for (const { mat } of all) {
      if (map.has(mat)) continue;
      let m = mat;
      if (R.C.paint && mat.name === R.C.paint) {
        m = mat.clone();
        m.color.set(color);
      } else if (R.C.key && mat.map) m = keyedMaterial(mat, color, R.C.key);
      map.set(mat, m);
    }
    paints.set(id, map);
  }
  return paints.get(id);
}

/**
 * One craft's model in the craft frame: { object, spinners, parts } (spinners: the
 * propeller nodes, turned about their z), or null while the model is not loaded.
 */
export function createRealCraft(design, color) {
  const R = loaded[design];
  if (!R) return null;
  const mats = materialsFor(R, color);
  const object = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(R.s);
  model.position.y = R.dy;
  object.add(model);
  const mesh = ({ geo, mat }) => {
    const m = new THREE.Mesh(geo, mats.get(mat) || mat);
    const clear = mat.transparent && mat.opacity < 0.5;
    m.castShadow = !clear;
    m.receiveShadow = !clear;
    if (clear) m.renderOrder = 8;
    return m;
  };
  // Canopies and windscreens, hidden from the cockpit view (some are painted opaque).
  const glass = [];
  for (const p of R.body) {
    const m = mesh(p);
    if (/glass|transparent/i.test(p.mat.name)) glass.push(m);
    model.add(m);
  }
  const spinners = R.props.map((P) => {
    const pivot = new THREE.Group();
    pivot.position.set(P.at[0] / R.s, (P.at[1] - R.dy) / R.s, P.at[2] / R.s);
    for (const p of P.parts) pivot.add(mesh(p));
    model.add(pivot);
    return pivot;
  });
  return { object, spinners, glass, parts: R.parts };
}
