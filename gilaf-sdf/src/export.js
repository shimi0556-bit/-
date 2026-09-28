// File writers: GLB (glTF 2.0 binary), STL (binary), OBJ (with vertex colors) and a stored ZIP.

import { srgbToLinear } from './glsl.js';

// Assigns each triangle to the nearest recipe material (rough, metal, glow).
function groupByMaterial(mesh, palette) {
  const I = mesh.indices;
  const M = mesh.mats;
  const pal = palette.length ? palette : [[0.55, 0, 0]];
  const vmat = new Uint16Array(M.length / 3);
  for (let v = 0; v < vmat.length; v++) {
    let best = 0;
    let bd = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const d = (M[v * 3] - pal[p][0]) ** 2 + (M[v * 3 + 1] - pal[p][1]) ** 2 + ((M[v * 3 + 2] - pal[p][2]) / 4) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    vmat[v] = best;
  }
  const groups = pal.map(() => []);
  for (let t = 0; t < I.length; t += 3) {
    const a = vmat[I[t]];
    const b = vmat[I[t + 1]];
    const c = vmat[I[t + 2]];
    const m = b === c ? b : a;
    groups[m].push(I[t], I[t + 1], I[t + 2]);
  }
  return pal.map((m, i) => ({ mat: m, indices: Uint32Array.from(groups[i]) })).filter((g) => g.indices.length);
}

export function toGLB(mesh, { name = 'gilaf-model', palette = [], skeleton = null } = {}) {
  const vc = mesh.positions.length / 3;
  const groups = groupByMaterial(mesh, palette);
  const col = new Uint16Array(vc * 4);
  for (let i = 0; i < vc; i++) {
    for (let c = 0; c < 3; c++) col[i * 4 + c] = Math.round(srgbToLinear(mesh.colors[i * 3 + c]) * 65535);
    col[i * 4 + 3] = 65535;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vc; i++) for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c], mesh.positions[i * 3 + c]);
    max[c] = Math.max(max[c], mesh.positions[i * 3 + c]);
  }
  const chunks = [];
  let offset = 0;
  const views = [];
  const addView = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
    if (target) view.target = target;
    views.push(view);
    chunks.push(bytes);
    offset += bytes.byteLength;
    const padTo = (4 - (offset % 4)) % 4;
    if (padTo) {
      chunks.push(new Uint8Array(padTo));
      offset += padTo;
    }
    return views.length - 1;
  };
  const accessors = [
    { bufferView: addView(mesh.positions, 34962), componentType: 5126, count: vc, type: 'VEC3', min, max },
    { bufferView: addView(mesh.normals, 34962), componentType: 5126, count: vc, type: 'VEC3' },
    { bufferView: addView(col, 34962), componentType: 5123, normalized: true, count: vc, type: 'VEC4' },
  ];
  const attributes = { POSITION: 0, NORMAL: 1, COLOR_0: 2 };
  const skinned = !!(skeleton && mesh.joints && mesh.weights);
  if (skinned) {
    attributes.JOINTS_0 = accessors.push({ bufferView: addView(mesh.joints, 34962), componentType: 5121, count: vc, type: 'VEC4' }) - 1;
    attributes.WEIGHTS_0 = accessors.push({ bufferView: addView(mesh.weights, 34962), componentType: 5126, count: vc, type: 'VEC4' }) - 1;
  }
  const materials = [];
  const primitives = [];
  let emissiveUsed = false;
  for (const g of groups) {
    const acc = accessors.push({ bufferView: addView(g.indices, 34963), componentType: 5125, count: g.indices.length, type: 'SCALAR' }) - 1;
    const [rough, metal, glow] = g.mat;
    const m = {
      name: glow > 0 ? 'glow' : metal > 0.5 ? 'metal' : `surface-r${rough.toFixed(2)}`,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: metal, roughnessFactor: Math.max(0.04, rough) },
    };
    if (glow > 0) {
      // emissive can't read vertex colors in glTF, so use the average color of this part
      const avg = [0, 0, 0];
      const seen = new Set(g.indices);
      for (const v of seen) for (let c = 0; c < 3; c++) avg[c] += srgbToLinear(mesh.colors[v * 3 + c]);
      m.emissiveFactor = avg.map((x) => Math.min(1, x / seen.size));
      if (glow > 1) {
        m.extensions = { KHR_materials_emissive_strength: { emissiveStrength: glow } };
        emissiveUsed = true;
      }
    }
    materials.push(m);
    primitives.push({ attributes, indices: acc, material: materials.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: 'Gilaf SDF Studio' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  if (skinned) {
    // joint nodes follow the mesh node; joint j is node j + 1
    const J = skeleton.joints;
    J.forEach((j) => {
      const node = { name: j.name, translation: j.rest.t, rotation: j.rest.r, scale: j.rest.s };
      const kids = J.map((k, i) => (k.parent === J.indexOf(j) ? i + 1 : -1)).filter((i) => i >= 0);
      if (kids.length) node.children = kids;
      json.nodes.push(node);
    });
    json.scenes[0].nodes.push(1);
    const ibm = new Float32Array(J.length * 16);
    J.forEach((j, i) => ibm.set(j.ibm, i * 16));
    const ibmAcc = accessors.push({ bufferView: addView(ibm), componentType: 5126, count: J.length, type: 'MAT4' }) - 1;
    json.skins = [{ name: 'skeleton', inverseBindMatrices: ibmAcc, joints: J.map((_, i) => i + 1), skeleton: 1 }];
    json.nodes[0].skin = 0;
    const clip = skeleton.clip;
    if (clip) {
      const tAcc = accessors.push({ bufferView: addView(clip.times), componentType: 5126, count: clip.times.length, type: 'SCALAR', min: [clip.times[0]], max: [clip.times[clip.times.length - 1]] }) - 1;
      const samplers = [];
      const channels = [];
      for (const ch of clip.channels) {
        for (const [path, data, type] of [['translation', ch.T, 'VEC3'], ['rotation', ch.R, 'VEC4'], ['scale', ch.S, 'VEC3']]) {
          const o = accessors.push({ bufferView: addView(data), componentType: 5126, count: clip.times.length, type }) - 1;
          samplers.push({ input: tAcc, output: o, interpolation: 'LINEAR' });
          channels.push({ sampler: samplers.length - 1, target: { node: ch.joint + 1, path } });
        }
      }
      json.animations = [{ name: 'loop', samplers, channels }];
    }
  }
  if (emissiveUsed) json.extensionsUsed = ['KHR_materials_emissive_strength'];
  json.buffers[0].byteLength = offset;
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) {
    const j2 = new Uint8Array(jsonBytes.length + jpad).fill(0x20);
    j2.set(jsonBytes);
    jsonBytes = j2;
  }
  const total = 12 + 8 + jsonBytes.length + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let p = 20 + jsonBytes.length;
  dv.setUint32(p, offset, true);
  dv.setUint32(p + 4, 0x004e4942, true);
  p += 8;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}

// STL for 3D printing: Z-up, resting on the build plate, longest side = sizeMM.
export function toSTL(mesh, { sizeMM = 80 } = {}) {
  const P = mesh.positions;
  const I = mesh.indices;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c], P[i + c]);
    max[c] = Math.max(max[c], P[i + c]);
  }
  const s = sizeMM / Math.max(...max.map((v, i) => v - min[i]));
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const tr = (i) => [(P[i * 3] - cx) * s, -(P[i * 3 + 2] - cz) * s, (P[i * 3 + 1] - min[1]) * s];
  const n = I.length / 3;
  const out = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(out);
  const head = 'Gilaf SDF Studio - binary STL, units: mm';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = tr(I[t * 3]);
    const b = tr(I[t * 3 + 1]);
    const c = tr(I[t * 3 + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn) || 1;
    for (const x of [...nn.map((q) => q / l), ...a, ...b, ...c]) {
      dv.setFloat32(o, x, true);
      o += 4;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(out);
}

export function toOBJ(mesh, { name = 'gilaf-model' } = {}) {
  const P = mesh.positions;
  const N = mesh.normals;
  const C = mesh.colors;
  const I = mesh.indices;
  const parts = [`# Gilaf SDF Studio\n# vertices ${P.length / 3}, triangles ${I.length / 3}\no ${name}\n`];
  const r = (x) => +x.toFixed(5);
  let buf = [];
  for (let i = 0; i < P.length; i += 3) buf.push(`v ${r(P[i])} ${r(P[i + 1])} ${r(P[i + 2])} ${C[i].toFixed(3)} ${C[i + 1].toFixed(3)} ${C[i + 2].toFixed(3)}`);
  for (let i = 0; i < N.length; i += 3) buf.push(`vn ${N[i].toFixed(4)} ${N[i + 1].toFixed(4)} ${N[i + 2].toFixed(4)}`);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] + 1;
    const b = I[t + 1] + 1;
    const c = I[t + 2] + 1;
    buf.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    if (buf.length > 20000) {
      parts.push(buf.join('\n') + '\n');
      buf = [];
    }
  }
  parts.push(buf.join('\n') + '\n');
  return new TextEncoder().encode(parts.join(''));
}

// ---- stored (uncompressed) ZIP ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function toZIP(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    locals.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
