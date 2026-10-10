// Detailed real car models for the car types that used to wear low-poly kit
// models: downloads each openly licensed source (see CARS below), takes out
// trademark logos and plates, cuts the four wheels out of the body so they
// can steer and spin, turns the nose to +z, scales the car to its real
// wheelbase, slims meshes and textures, and writes two levels of detail into
// src/race/models/real-<type>(-lo).glb.gz in the layout RealModels.js
// prepare() reads (wheel nodes WheelFrontL… with a …Tire part, materials named
// "Paint 1 Carmine", "Glass", "Brakelight", "Headlight"). No Draco or meshopt
// in the output: both need a decoder the artifact viewer may refuse; the files
// are quantized and gzipped instead. Prints the measured wheels and body for
// the physics spec in config.js.
//   node tools/realcars.mjs [type…]
// Sources are cached in .models/ (not committed); the outputs are committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, dequantize, join, prune, quantize, simplify, transformPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.models');
const OUT = path.join(root, 'src/race/models');
const GK = 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models';
const PM = 'https://raw.githubusercontent.com/pmndrs/examples/main/examples';

/**
 * Per car: source, credit, which way its nose points (yaw turns it to +z),
 * the real wheelbase it is scaled to, how to find the tyres (by material or
 * node name), which materials are the paint, glass and lamps, and what to
 * drop or paint out. `tex` caps texture sizes per material (default 512).
 */
export const CARS = {
  gt: {
    url: `${PM}/building-live-envmaps/src/911-transformed.glb`,
    credit: '"Free Porsche 911 Carrera 4S" by Karol Miklas (sketchfab.com/karolmiklas), CC BY-SA 4.0 — modified: badges and plates removed, simplified',
    licence: 'CC BY-SA 4.0',
    wheelbase: 2.45,
    tyre: { mat: /^rubber$/ },
    paint: /^paint$/,
    glass: /^(window|glass)$/,
    head: /^lights$/,
    drop: { mat: /^(logo)$/ },
    plain: /^license$/,
    lods: [{ ratio: 0.08, error: 0.006 }, { ratio: 0.012, error: 0.05 }],
  },
  rally: {
    url: `${PM}/stage-presets-gltfjsx/src/datsun-transformed.glb`,
    credit: '"(FREE) 1972 Datsun 240k GT" by Karol Miklas (sketchfab.com/karolmiklas), CC BY-SA 4.0 — modified: stickers and plates removed, simplified',
    licence: 'CC BY-SA 4.0',
    wheelbase: 2.61,
    tyre: { mat: /^tire$/ },
    paint: /^paint$/,
    glass: /^(glass|headlights)$/,
    tail: /^red_glass$/,
    drop: { mat: /^(stickers)$/ },
    plain: /^license$/,
    loose: true,
    lods: [{ ratio: 0.08, error: 0.006 }, { ratio: 0.012, error: 0.05 }],
  },
  muscle: {
    url: `${GK}/blendswap/dodge-challenger.glb`,
    credit: '"Dodge Challenger 1970 R/T" by kryptonmedia (blendswap.com/blend/4046), CC0 — modified: badges and plates removed, simplified',
    licence: 'CC0',
    wheelbase: 2.79,
    tyre: { node: /(^|\/)Cube\.008$/ },
    paint: /^paint_w_stripes$/,
    glass: /glass/,
    drop: { mat: /^(markings\.002)$/ },
    plain: /^lisenceplate$/,
    lods: [{ ratio: 0.025, error: 0.015 }, { ratio: 0.006, error: 0.05 }],
  },
  buggy: {
    url: `${GK}/vehicles/jeep-wrangler-rubicon.glb`,
    credit: '"Jeep Wrangler Adventure Rubicon" by vecarz (sketchfab.com/heynic), CC BY-NC-SA 4.0 — modified: badges removed, simplified',
    licence: 'CC BY-NC-SA 4.0',
    wheelbase: 3.01,
    tyre: { mat: /^wheel_01_diff\./ },
    paint: /^vehicle_generic_smallspecmap_PRIMARY\.004$/,
    glass: /^(t_cabin_d)$/,
    drop: { mat: /^(t_logo_d|t_logo_a_d)$/ },
    // Inside the cabin, a texture's average colour reads the same from the driver's seat camera.
    flat: /^(org_grain_004_w_INTERIOR_TRIM|carpet02_c_mip0|cloth09|T_Dashboard_E|script_rt_dials_race)$/,
    lods: [{ ratio: 0.1, error: 0.01 }, { ratio: 0.015, error: 0.05 }],
  },
  formula: {
    url: `${GK}/vehicles/mclaren-mp4-5.glb`,
    credit: '"McLaren MP4/5" by vecarz (sketchfab.com/heynic), CC BY 4.0 — modified: sponsor livery removed, simplified',
    licence: 'CC BY 4.0',
    wheelbase: 2.9,
    tyre: { node: /(^|\/)(front_wheels_7|back_wheels_1)\// },
    paint: /^body_mat$/,
    glass: /^glass_details_mat$/,
    // The livery carries a tobacco brand: the body is painted plain instead.
    plain: /^body_mat$/,
    tex: { wheels_mat: 1024 },
    lods: [{ ratio: 0.08, error: 0.006 }, { ratio: 0.012, error: 0.05 }],
  },
};

const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']; // left = +x once the nose faces +z

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

async function source(id, url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `real-${id}.glb`);
  if (!fs.existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const indicesOf = (p) => (p.getIndices() ? Array.from(p.getIndices().getArray()) : Array.from({ length: p.getAttribute('POSITION').getCount() }, (_, i) => i));
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

/** Every primitive in world space (one copy per node that shows it), on fresh nodes at the scene root; the old tree goes. */
function bake(doc, yaw) {
  const rootP = doc.getRoot();
  const scene = rootP.listScenes()[0];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const turn = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  const out = [];
  const visit = (n, trail) => {
    const here = trail ? `${trail}/${n.getName()}` : n.getName();
    if (n.getMesh()) {
      for (const p of n.getMesh().listPrimitives()) {
        // Own copies of the vertex streams: meshes shown by several nodes (wheels) share them.
        const q = p.clone();
        for (const sem of q.listSemantics()) q.setAttribute(sem, q.getAttribute(sem).clone());
        if (q.getIndices()) q.setIndices(q.getIndices().clone());
        transformPrimitive(q, mul(turn, n.getWorldMatrix()));
        out.push({ prim: q, node: here });
      }
    }
    for (const c of n.listChildren()) visit(c, here);
  };
  for (const c of scene.listChildren()) visit(c, '');
  for (const n of rootP.listNodes()) n.dispose();
  for (const m of rootP.listMeshes()) m.dispose();
  return out;
}

/** Palette materials (one colour per primitive, read from a tiny texture by UV) → plain materials with that colour. */
async function unpalette(doc, prims) {
  const cache = new Map();
  const texel = async (tex, uv) => {
    if (!cache.has(tex)) {
      const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      cache.set(tex, { data, info });
    }
    const { data, info } = cache.get(tex);
    const x = Math.min(info.width - 1, Math.max(0, Math.floor(uv[0] * info.width)));
    const y = Math.min(info.height - 1, Math.max(0, Math.floor(uv[1] * info.height)));
    const i = (y * info.width + x) * 4;
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255];
  };
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const made = new Map();
  for (const it of prims) {
    const m = it.prim.getMaterial();
    if (!m || !/^PaletteMaterial/.test(m.getName())) continue;
    const uvA = it.prim.getAttribute('TEXCOORD_0');
    if (!uvA) continue;
    const uv = uvA.getElement(0, []);
    const bc = m.getBaseColorTexture() ? await texel(m.getBaseColorTexture(), uv) : [1, 1, 1, 1];
    const mr = m.getMetallicRoughnessTexture() ? await texel(m.getMetallicRoughnessTexture(), uv) : [1, 1, 1, 1];
    const em = m.getEmissiveTexture() ? await texel(m.getEmissiveTexture(), uv) : [1, 1, 1, 1];
    const f = m.getBaseColorFactor();
    const color = [lin(bc[0]) * f[0], lin(bc[1]) * f[1], lin(bc[2]) * f[2], bc[3] * f[3]];
    const key = `${m.getName()}|${color.map((v) => v.toFixed(3))}|${mr.map((v) => v.toFixed(2))}|${em.map((v) => v.toFixed(2))}`;
    if (!made.has(key)) {
      const n = m.clone().setName(`${m.getName()}_${made.size}`);
      n.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
      n.setBaseColorFactor(color);
      n.setRoughnessFactor(m.getRoughnessFactor() * mr[1]).setMetallicFactor(m.getMetallicFactor() * mr[2]);
      const ef = m.getEmissiveFactor();
      n.setEmissiveFactor([lin(em[0]) * ef[0], lin(em[1]) * ef[1], lin(em[2]) * ef[2]]);
      made.set(key, n);
    }
    it.prim.setMaterial(made.get(key));
  }
}

/** The four tyres: the matching triangles split by quadrant around their middle → centre, radius and width of each. */
function findWheels(prims, spec) {
  const pts = [];
  for (const it of prims) {
    const hit = spec.mat ? spec.mat.test(it.prim.getMaterial()?.getName() || '') : spec.node.test(it.node || '');
    if (!hit) continue;
    const P = it.prim.getAttribute('POSITION');
    for (let i = 0; i < P.getCount(); i++) pts.push(P.getElement(i, []));
  }
  if (!pts.length) throw new Error('no tyre triangles');
  const mid = [0, 2].map((k) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p[k]);
      hi = Math.max(hi, p[k]);
    }
    return (lo + hi) / 2;
  });
  const box = WHEELS.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  for (const p of pts) {
    const front = p[2] > mid[1], left = p[0] > mid[0];
    const b = box[(front ? 0 : 2) + (left ? 0 : 1)];
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], p[k]);
      b.max[k] = Math.max(b.max[k], p[k]);
    }
  }
  return box.map((b, i) => {
    if (!isFinite(b.min[0])) throw new Error(`no tyre for ${WHEELS[i]}`);
    const c = b.min.map((v, k) => (v + b.max[k]) / 2);
    const r = Math.max(b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
    // The tread (points near the rim of the drum) gives the tyre's true width; hubs and shafts reach inwards.
    let x0 = Infinity, x1 = -Infinity;
    for (const p of pts) {
      const front = p[2] > mid[1], left = p[0] > mid[0];
      if ((front ? 0 : 2) + (left ? 0 : 1) !== i || Math.hypot(p[1] - c[1], p[2] - c[2]) < r * 0.88) continue;
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
    }
    c[0] = (x0 + x1) / 2;
    return { c, r, x: [x0, x1], inner: Math.abs(b.min[0]) < Math.abs(b.max[0]) ? b.min[0] : b.max[0] };
  });
}

/** Splits each primitive into body and wheel parts: a connected piece that lies inside a tyre's drum goes with that wheel. */
function cutWheels(doc, prims, wheels, spec) {
  const parts = [];
  for (const it of prims) {
    const p = it.prim;
    const P = p.getAttribute('POSITION');
    const idx = indicesOf(p);
    const n = P.getCount();
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const at = new Map();
    const pos = [];
    for (let i = 0; i < n; i++) {
      const v = P.getElement(i, []);
      pos.push(v);
      const k = `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;
      if (at.has(k)) parent[find(i)] = find(at.get(k));
      else at.set(k, i);
    }
    for (let t = 0; t < idx.length; t += 3) {
      const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
      parent[b] = a;
      parent[find(c)] = find(a);
    }
    const boxes = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let b = boxes.get(r);
      if (!b) boxes.set(r, (b = { min: [...pos[i]], max: [...pos[i]] }));
      for (let k = 0; k < 3; k++) {
        b.min[k] = Math.min(b.min[k], pos[i][k]);
        b.max[k] = Math.max(b.max[k], pos[i][k]);
      }
    }
    const isTyre = spec.mat ? spec.mat.test(p.getMaterial()?.getName() || '') : spec.node.test(it.node || '');
    const owner = new Map();
    for (const [r, b] of boxes) {
      let w = -1;
      wheels.forEach((W, i) => {
        const m = W.r * 1.04;
        if (b.min[1] >= W.c[1] - m && b.max[1] <= W.c[1] + m && b.min[2] >= W.c[2] - m && b.max[2] <= W.c[2] + m && b.min[0] >= W.x[0] - (W.c[0] > 0 ? W.r * 0.5 : W.r * 0.2) - 0.04 && b.max[0] <= W.x[1] + (W.c[0] < 0 ? W.r * 0.5 : W.r * 0.2) + 0.04) w = i;
      });
      owner.set(r, w);
    }
    const groups = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const w = owner.get(find(idx[t]));
      if (!groups.has(w)) groups.set(w, []);
      groups.get(w).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    for (const [w, list] of groups) {
      const q = p.clone();
      const acc = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(doc.getRoot().listBuffers()[0]);
      q.setIndices(acc);
      compactPrimitive(q);
      parts.push({ prim: q, wheel: w, tyre: isTyre });
    }
    p.dispose();
  }
  return parts;
}

const hasTexture = (m) => !!(m && (m.getBaseColorTexture() || m.getNormalTexture() || m.getMetallicRoughnessTexture() || m.getEmissiveTexture() || m.getOcclusionTexture()));

/**
 * Simplifies one primitive. Untextured surfaces (and everything in the far
 * version) are rejoined by position alone, so the simplifier sees one surface
 * instead of islands cut at every normal or UV seam; textured ones keep their
 * UVs and their seams. Normals are rebuilt smooth up to a 50° crease, and
 * vertices that end up identical are shared again.
 */
function slim(doc, prim, L, lo) {
  const keepUV = !lo && hasTexture(prim.getMaterial()) && !!prim.getAttribute('TEXCOORD_0');
  const P = prim.getAttribute('POSITION');
  const UV = keepUV ? prim.getAttribute('TEXCOORD_0') : null;
  const ids = indicesOf(prim);
  const at = new Map();
  const pos = [], uvs = [];
  const map = new Uint32Array(P.getCount());
  const v = [], t = [];
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, v);
    if (UV) UV.getElement(i, t);
    const k = `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}${UV ? `,${Math.round(t[0] * 4096)},${Math.round(t[1] * 4096)}` : ''}`;
    let j = at.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      at.set(k, j);
      pos.push(v[0], v[1], v[2]);
      if (UV) uvs.push(t[0], t[1]);
    }
    map[i] = j;
  }
  const seen = new Set();
  const idx = [];
  for (let k = 0; k < ids.length; k += 3) {
    const a = map[ids[k]], b = map[ids[k + 1]], c = map[ids[k + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    idx.push(a, b, c);
  }
  const positions = new Float32Array(pos);
  let index = new Uint32Array(idx);
  const target = Math.max(3, Math.floor((index.length / 3) * L.ratio) * 3);
  if (index.length > 120) [index] = MeshoptSimplifier.simplify(index, positions, 3, target, L.error, UV ? ['LockBorder'] : []);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (UV) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g = mergeVertices(toCreasedNormals(g, THREE.MathUtils.degToRad(50)), 1e-5);
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
  const buf = P.getBuffer();
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buf);
  prim.setAttribute('POSITION', acc('VEC3', g.attributes.position.array));
  prim.setAttribute('NORMAL', acc('VEC3', g.attributes.normal.array));
  if (UV) prim.setAttribute('TEXCOORD_0', acc('VEC2', g.attributes.uv.array));
  prim.setIndices(acc('SCALAR', new Uint32Array(g.index.array)));
}

async function build(id, C, L, lo) {
  const doc = await io.read(await source(id, C.url));
  const rootP = doc.getRoot();
  if (!rootP.listBuffers().length) doc.createBuffer();
  for (const ext of rootP.listExtensionsUsed()) if (['KHR_draco_mesh_compression', 'KHR_materials_variants', 'KHR_lights_punctual'].includes(ext.extensionName)) ext.dispose();
  await doc.transform(dequantize());
  // Source cars face -z or +z; find out from the tyres after a first bake.
  let prims = bake(doc, C.yaw || 0);
  await unpalette(doc, prims);
  prims = prims.filter((it) => {
    const name = it.prim.getMaterial()?.getName() || '';
    const gone = (C.drop?.mat && C.drop.mat.test(name)) || (C.drop?.node && C.drop.node.test(it.node || ''));
    if (gone) it.prim.dispose();
    return !gone;
  });
  let wheels = findWheels(prims, C.tyre);
  // Scale to the real wheelbase and put the wheelbase centre at the origin.
  const fz = (wheels[0].c[2] + wheels[1].c[2]) / 2, rz = (wheels[2].c[2] + wheels[3].c[2]) / 2;
  const cx = wheels.reduce((s, w) => s + w.c[0], 0) / 4;
  const k = C.wheelbase / Math.abs(fz - rz);
  const ground = Math.min(...wheels.map((w) => w.c[1] - w.r));
  const M = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -cx * k, -ground * k, -((fz + rz) / 2) * k, 1];
  for (const it of prims) transformPrimitive(it.prim, M);
  wheels = findWheels(prims, C.tyre);
  if (wheels[0].c[2] < 0) throw new Error(`${id}: the nose points to -z; set yaw: Math.PI`);
  const parts = cutWheels(doc, prims, wheels, C.tyre);

  // What the physics spec needs: wheels and the body's extent (before simplifying).
  const body = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const it of parts) {
    if (it.wheel >= 0) continue;
    const P = it.prim.getAttribute('POSITION');
    const mn = P.getMin([]), mx = P.getMax([]);
    for (let k = 0; k < 3; k++) {
      body.min[k] = Math.min(body.min[k], mn[k]);
      body.max[k] = Math.max(body.max[k], mx[k]);
    }
  }
  const f = (v) => +v.toFixed(3);
  const W = wheels;
  const report = `   wheels ${JSON.stringify({ radius: f(W.reduce((s, w) => s + w.r, 0) / 4), width: f(W.reduce((s, w) => s + w.x[1] - w.x[0], 0) / 4), front: f((W[0].c[2] + W[1].c[2]) / 2), rear: f((W[2].c[2] + W[3].c[2]) / 2), track: f(W.reduce((s, w) => s + Math.abs(w.c[0]), 0) / 4), centreY: f(W[0].c[1]) })} body ${JSON.stringify({ min: body.min.map(f), max: body.max.map(f) })}`;

  // Materials: roles by the names RealModels.prepare() looks for; plates and liveries painted out; names unique.
  const seen = new Map();
  for (const m of rootP.listMaterials()) {
    const n = m.getName();
    if (C.plain?.test(n)) m.setBaseColorTexture(null);
    if (C.plain?.test(n) && !C.paint.test(n)) m.setBaseColorFactor([0.85, 0.85, 0.82, 1]);
    let role = null;
    if (C.paint.test(n)) role = 'Paint 1 Carmine';
    else if (C.tail?.test(n)) role = 'Brakelight';
    else if (C.head?.test(n)) role = 'Headlight';
    else if (C.glass?.test(n)) role = 'Glass';
    m.setExtras({ ...m.getExtras(), source: n });
    if (role) m.setName(role);
    else {
      const c = seen.get(n) || 0;
      seen.set(n, c + 1);
      m.setName(c ? `${n}~${c}` : n);
    }
  }
  // One paint material (several would leave some panels uncoloured), lacquered like a real car's.
  const paints = rootP.listMaterials().filter((m) => m.getName() === 'Paint 1 Carmine');
  if (!paints.length) throw new Error(`${id}: no paint material`);
  const coat = doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.06);
  paints[0].setMetallicFactor(0.45).setRoughnessFactor(0.34).setMetallicRoughnessTexture(null).setExtension('KHR_materials_clearcoat', coat);
  for (const it of parts) if (it.prim.getMaterial()?.getName() === 'Paint 1 Carmine') it.prim.setMaterial(paints[0]);

  // Nodes: the body (one node per part, joined below by material), and per wheel its tyre and the rest.
  const scene = rootP.listScenes()[0];
  const wheelMesh = WHEELS.map((w) => ({ tyre: doc.createMesh(`${w}Tire0`), part: doc.createMesh(`${w}Part1`) }));
  for (const it of parts) {
    if (it.wheel < 0) {
      scene.addChild(doc.createNode('').setMesh(doc.createMesh('').addPrimitive(it.prim)));
      continue;
    }
    wheelMesh[it.wheel][it.tyre ? 'tyre' : 'part'].addPrimitive(it.prim);
  }
  WHEELS.forEach((w, i) => {
    const { tyre, part } = wheelMesh[i];
    if (!tyre.listPrimitives().length) throw new Error(`${id}: ${w} has no tyre`);
    scene.addChild(doc.createNode(`${w}Tire0`).setMesh(tyre));
    if (part.listPrimitives().length) scene.addChild(doc.createNode(`${w}Part1`).setMesh(part));
    else part.dispose();
  });
  // Tangents are rebuilt by the shader from screen-space derivatives; they only cost bytes here.
  for (const m of rootP.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('TANGENT', null);
  // Textures traded for their average colour where nobody looks closely.
  for (const m of rootP.listMaterials()) {
    const t = C.flat?.test(m.getName()) && m.getBaseColorTexture();
    if (!t) continue;
    const { channels } = await sharp(Buffer.from(t.getImage())).stats();
    const lin = (v) => Math.pow(v / 255, 2.2);
    const f = m.getBaseColorFactor();
    m.setBaseColorFactor([lin(channels[0].mean) * f[0], lin(channels[1].mean) * f[1], lin(channels[2].mean) * f[2], f[3]]).setBaseColorTexture(null);
  }
  // Grain and detail maps (metal/roughness, occlusion, normals on untextured parts) are invisible at
  // racing distance but keep every surface split at its UV seams: plain factors instead.
  for (const m of rootP.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setNormalTexture(null);
    if (m.getName() === 'Glass') m.setBaseColorTexture(null).setEmissiveTexture(null);
    // Same for the extensions' maps (clearcoat, specular, transmission…).
    for (const ext of m.listExtensions()) {
      for (let o = Object.getPrototypeOf(ext); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
        for (const k of Object.getOwnPropertyNames(o)) if (/^set\w*Texture$/.test(k)) ext[k](null);
      }
    }
  }
  await doc.transform(join({ keepNamed: true }));
  for (const m of rootP.listMeshes()) for (const p of m.listPrimitives()) slim(doc, p, L, lo);
  await doc.transform(prune(), dedup());

  // Textures: the far version wears the near one's (RealModels matches materials by name), so it carries none.
  for (const m of rootP.listMaterials()) {
    if (lo) for (const slot of ['BaseColor', 'MetallicRoughness', 'Normal', 'Occlusion', 'Emissive']) m[`set${slot}Texture`](null);
  }
  await doc.transform(prune());
  for (const t of rootP.listTextures()) {
    const users = t.listParents().filter((p) => p.propertyType === 'Material');
    // Small parts (dials, badges) get small textures.
    const trisOf = (m) => m.listParents().filter((x) => x.propertyType === 'Primitive').reduce((n, p) => n + (p.getIndices()?.getCount() || 0) / 3, 0);
    const cap = Math.max(...users.map((m) => C.tex?.[m.getExtras().source] || (trisOf(m) < 600 ? 128 : 512)), 64);
    const meta = await sharp(Buffer.from(t.getImage())).metadata();
    const size = Math.min(cap, Math.max(meta.width, meta.height));
    t.setImage(await sharp(Buffer.from(t.getImage())).resize(size, size, { fit: 'inside' }).webp({ quality: 82 }).toBuffer()).setMimeType('image/webp');
  }
  await doc.transform(quantize());
  for (const m of rootP.listMeshes())
    for (const p of m.listPrimitives()) {
      const I = p.getIndices();
      if (I && p.getAttribute('POSITION').getCount() < 65536 && !(I.getArray() instanceof Uint16Array)) I.setArray(Uint16Array.from(I.getArray()));
    }
  const name = `real-${id}${lo ? '-lo' : ''}`;
  const file = path.join(OUT, `${name}.glb.gz`);
  fs.writeFileSync(file, zlib.gzipSync(await io.writeBinary(doc), { level: 9 }));
  console.log(name.padEnd(16), `${tris(doc)} triangles`, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`, `${rootP.listMaterials().length} materials`, `${rootP.listTextures().length} textures`);
  if (!lo) console.log(report);
}

const only = process.argv.slice(2);
for (const [id, C] of Object.entries(CARS)) {
  if (only.length && !only.includes(id)) continue;
  for (const [i, L] of C.lods.entries()) await build(id, C, L, i > 0);
}
if (!only.length) {
  fs.writeFileSync(
    path.join(OUT, 'CREDITS-real.md'),
    `# Real car models (tools/realcars.mjs)\n\n${Object.entries(CARS).map(([id, C]) => `- **${id}**: ${C.credit}. Source: ${C.url}`).join('\n')}\n\nThe modified models keep their source licences (ShareAlike ones stay CC BY-SA; the NonCommercial one may not be used commercially).\n`,
  );
}
