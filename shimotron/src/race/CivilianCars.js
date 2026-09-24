import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Everyday cars for the city's streets: saloon, hatchback, SUV, van,
 * pickup and taxi. Each body is generated from a real side profile
 * (bumper, bonnet, windscreen, roof, rear glass, boot) and a plan
 * taper, with cross-sections that have upright flanks, a shoulder line
 * and a glasshouse that leans in; the wheel arches are cut into the
 * flanks. Dark glass, a black B-pillar, plastic bumpers and sills,
 * alloy wheels, grille, mirrors, handles and number plates. Every
 * vertex carries `aMat` (0 plastic/rubber, 1 paint — tinted per car,
 * 2 glass, 3 chrome) so one material draws a whole street; the lamps
 * are a second, glowing mesh. `lod` 1 is a lighter version for the middle distance and `lod` 2 a bare silhouette for far away.
 */

const MAT = { plastic: 0, paint: 1, glass: 2, chrome: 3 };
const GLASS = 0x0a0e13;
const TRIM = 0x131416;

function part(g, hex, mat) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return g;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Piecewise-linear lookup in [[z, v], …] sorted by descending z. */
function lookup(table, z) {
  if (z >= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [z0, v0] = table[i];
    const [z1, v1] = table[i + 1];
    if (z <= z0 && z >= z1) return v0 + ((v1 - v0) * (z0 - z)) / (z0 - z1 || 1);
  }
  return table[table.length - 1][1];
}

/** A wheel at (x, y, z): tyre, alloy rim with spokes (lod 0), hub cap. */
function wheel(x, y, z, r, w, lod) {
  const s = Math.sign(x);
  const out = [part(new THREE.CylinderGeometry(r, r, w, lod === 2 ? 6 : lod ? 8 : 16).rotateZ(Math.PI / 2).translate(x, y, z), 0x121212, MAT.plastic)];
  if (lod === 2) return out;
  out.push(part(new THREE.CylinderGeometry(r * 0.64, r * 0.64, 0.02, lod ? 8 : 16).rotateZ(Math.PI / 2).translate(x + s * (w / 2 + 0.004), y, z), 0x8e949a, MAT.chrome));
  if (!lod) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      out.push(part(new THREE.BoxGeometry(0.02, r * 0.5, 0.075).translate(0, r * 0.3, 0).rotateX(a).translate(x + s * (w / 2 + 0.016), y, z), 0xc9cdd1, MAT.chrome));
    }
    out.push(part(new THREE.CylinderGeometry(r * 0.15, r * 0.15, 0.03, 8).rotateZ(Math.PI / 2).translate(x + s * (w / 2 + 0.02), y, z), 0x23262a, MAT.chrome));
  }
  return out;
}

/**
 * The body shell. o: len, half width `hw`, `bottom` (sill height),
 * `belt` (window line), `top` profile [[z, height]], glass zones
 * `wind` [zFrom, zTo] (windscreen) and `rear` (rear glass), `sideGlass`
 * [zFrom, zTo] (where the side windows are), `bPillar` z, wheels
 * [[z, r]], plan taper at the ends.
 */
function shell(o, lod) {
  const L = o.len;
  const zf = L / 2;
  const zr = -L / 2;
  const S = lod === 2 ? 6 : lod ? 14 : 44; // stations along the car
  const pts = [];
  const zs = [];
  for (let k = 0; k <= S; k++) {
    // Denser near the ends, where the shape turns.
    const u = k / S;
    const e = 0.5 - 0.5 * Math.cos(u * Math.PI);
    zs.push(zf - (zf - zr) * (u * 0.4 + e * 0.6));
  }
  const arch = (z) => {
    let y = o.bottom;
    for (const [wz, r] of o.wheels) {
      const R = r + 0.06;
      const d = Math.abs(z - wz);
      if (d < R) y = Math.max(y, r + Math.sqrt(R * R - d * d) * 0.96);
    }
    return y;
  };
  const rows = [];
  for (const z of zs) {
    const endT = Math.min(1, (zf - z) / 0.45, (z - zr) / 0.35);
    const hw = o.hw * (0.9 + 0.1 * Math.sqrt(Math.max(0, endT)));
    const T = lookup(o.top, z);
    const B = Math.min(o.belt, T - 0.01);
    const low = arch(z);
    const green = T > o.belt + 0.06;
    const lean = green ? (T - o.belt) * 0.26 : 0;
    const gw = hw - 0.06;
    // One side, from the underside centre to the roof (bonnet, boot) centre.
    const side = [
      [0, o.bottom + 0.04],
      [hw - 0.1, Math.max(o.bottom, low - 0.02)],
      [hw - 0.02, low + 0.06],
      [hw, low + 0.18],
      [hw + 0.01, (low + B) / 2],
      [hw, B - 0.1],
      [hw - 0.03, B - 0.02],
      [green ? gw - 0.02 : hw - 0.14, B + (green ? 0.02 : 0.01)],
      [green ? gw - lean : hw * 0.55, green ? T - 0.08 : T - 0.005],
      [green ? gw - lean - 0.14 : hw * 0.25, T],
      [0, T + 0.015],
    ];
    rows.push({ z, side, green, T });
  }
  const P = rows[0].side.length;
  const pos = [];
  const col = [];
  const mat = [];
  const paintC = new THREE.Color(0xffffff);
  const glassC = new THREE.Color(GLASS);
  const trimC = new THREE.Color(TRIM);
  const inZone = (z, zone) => zone && z <= zone[0] && z >= zone[1];
  for (let r = 0; r < rows.length - 1; r++) {
    const A = rows[r];
    const Bn = rows[r + 1];
    const zm = (A.z + Bn.z) / 2;
    for (let c = 0; c < P - 1; c++) {
      for (const s of [1, -1]) {
        const a0 = [s * A.side[c][0], A.side[c][1], A.z];
        const a1 = [s * A.side[c + 1][0], A.side[c + 1][1], A.z];
        const b0 = [s * Bn.side[c][0], Bn.side[c][1], Bn.z];
        const b1 = [s * Bn.side[c + 1][0], Bn.side[c + 1][1], Bn.z];
        // What this face is: glass (side windows, windscreen, rear glass), trim, or paint.
        let kind = 'paint';
        const green = A.green && Bn.green;
        if (c === 7 && green && inZone(zm, o.sideGlass)) kind = Math.abs(zm - o.bPillar) < 0.07 ? 'trim' : 'glass';
        if ((c === 8 || c === 9) && green && (inZone(zm, o.wind) || inZone(zm, o.rear))) kind = 'glass';
        if (c === 8 && green && inZone(zm, o.wind) === false && inZone(zm, o.rear) === false && inZone(zm, o.sideGlass)) kind = 'paint';
        if (c <= 1) kind = 'trim';
        if (c === 2 && (zm > zf - 0.3 || zm < zr + 0.3)) kind = 'trim';
        const colr = kind === 'glass' ? glassC : kind === 'trim' ? trimC : paintC;
        const m = kind === 'glass' ? MAT.glass : kind === 'trim' ? MAT.plastic : MAT.paint;
        const quad = s > 0 ? [a0, b0, a1, a1, b0, b1] : [a0, a1, b0, a1, b1, b0];
        for (const v of quad) {
          pos.push(...v);
          col.push(colr.r, colr.g, colr.b);
          mat.push(m);
        }
      }
    }
  }
  // Nose and tail caps: fans across the end sections.
  for (const [row, dir] of [
    [rows[0], 1],
    [rows[rows.length - 1], -1],
  ]) {
    for (let c = 0; c < P - 1; c++) {
      for (const s of [1, -1]) {
        const a = [s * row.side[c][0], row.side[c][1], row.z];
        const b = [s * row.side[c + 1][0], row.side[c + 1][1], row.z];
        const m = [0, (row.side[0][1] + row.side[P - 1][1]) / 2, row.z];
        const tri = s * dir > 0 ? [m, a, b] : [m, b, a];
        for (const v of tri) {
          pos.push(...v);
          col.push(1, 1, 1);
          mat.push(MAT.paint);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 1));
  // Smooth shading across each panel (paint, glass and trim keep their own edges).
  const smooth = mergeVertices(g, 1e-4);
  smooth.computeVertexNormals();
  return smooth.toNonIndexed();
}

function carModel(o, lod) {
  const L = o.len;
  const zf = L / 2;
  const zr = -L / 2;
  const parts = [shell(o, lod)];
  const hw = o.hw;
  for (const [wz, r] of o.wheels) for (const s of [1, -1]) parts.push(...wheel(s * (hw - 0.13), r, wz, r, 0.22, lod));
  const noseY = lookup(o.top, zf - 0.05);
  const tailY = lookup(o.top, zr + 0.05);
  if (!lod) {
    // Bumpers, grille, plates.
    parts.push(part(box(hw * 1.9, 0.16, 0.14, 0, o.bottom + 0.2, zf - 0.03), TRIM, MAT.plastic));
    parts.push(part(box(hw * 1.9, 0.16, 0.14, 0, o.bottom + 0.2, zr + 0.03), TRIM, MAT.plastic));
    parts.push(part(box(hw * 1.05, Math.max(0.1, noseY - o.bottom - 0.42), 0.04, 0, (noseY + o.bottom + 0.36) / 2, zf + 0.005), 0x0e0f10, MAT.plastic));
    parts.push(part(box(hw * 1.1, 0.025, 0.05, 0, noseY - 0.05, zf), 0xb9bdc2, MAT.chrome));
    parts.push(part(box(0.52, 0.12, 0.02, 0, o.bottom + 0.2, zf + 0.05), 0xf4f4f0, MAT.plastic));
    parts.push(part(box(0.52, 0.12, 0.02, 0, Math.min(tailY - 0.2, o.belt - 0.25), zr - 0.02), 0xf4f4f0, MAT.plastic));
    for (const s of [1, -1]) {
      parts.push(part(box(0.18, 0.11, 0.12, s * (hw + 0.07), o.belt + 0.07, o.mirrorZ), 0xffffff, MAT.paint));
      parts.push(part(box(0.05, 0.12, 0.02, s * (hw + 0.02), o.belt + 0.03, o.mirrorZ + 0.06), TRIM, MAT.plastic));
      for (const z of o.handles) parts.push(part(box(0.025, 0.03, 0.15, s * (hw + 0.012), o.belt - 0.09, z), 0xb0b4b8, MAT.chrome));
    }
  }
  if (o.extra) parts.push(...o.extra({ hw, zf, zr, lod }));
  // Lamps: headlights front, tail lights behind.
  const lamps = [];
  for (const s of [1, -1]) {
    lamps.push(part(box(0.36, 0.1, 0.04, s * (hw - 0.26), noseY - 0.1, zf - 0.02), 0xfff4e2, 0));
    lamps.push(part(box(0.1, 0.06, 0.04, s * (hw - 0.05), noseY - 0.1, zf - 0.06), 0xffa020, 0));
    lamps.push(part(box(0.34, 0.1, 0.04, s * (hw - 0.22), Math.min(tailY, o.belt) - 0.1, zr + 0.01), 0xff1206, 0));
  }
  return { geo: mergeGeometries(parts), lamps: mergeGeometries(lamps), len: L, wid: hw * 2, height: Math.max(...o.top.map((p) => p[1])) };
}

const TYPES = {
  sedan: {
    len: 4.72,
    hw: 0.9,
    bottom: 0.26,
    belt: 0.98,
    top: [[2.36, 0.64], [2.28, 0.8], [2.0, 0.88], [1.05, 0.95], [0.98, 0.97], [0.05, 1.41], [-0.15, 1.45], [-0.9, 1.43], [-1.52, 1.02], [-1.6, 0.99], [-2.25, 0.97], [-2.36, 0.8]],
    wind: [0.98, 0.05],
    rear: [-0.9, -1.52],
    sideGlass: [0.9, -1.35],
    bPillar: -0.35,
    wheels: [[1.42, 0.33], [-1.38, 0.33]],
    mirrorZ: 0.78,
    handles: [0.15, -0.75],
  },
  hatch: {
    len: 4.08,
    hw: 0.88,
    bottom: 0.25,
    belt: 0.97,
    top: [[2.04, 0.64], [1.96, 0.78], [1.66, 0.86], [1.0, 0.94], [0.93, 0.96], [0.0, 1.44], [-0.25, 1.48], [-1.55, 1.45], [-1.88, 1.22], [-1.98, 0.98], [-2.04, 0.82]],
    wind: [0.93, 0.0],
    rear: [-1.55, -1.95],
    sideGlass: [0.85, -1.55],
    bPillar: -0.45,
    wheels: [[1.28, 0.31], [-1.24, 0.31]],
    mirrorZ: 0.62,
    handles: [0.05, -0.8],
  },
  suv: {
    len: 4.78,
    hw: 0.96,
    bottom: 0.4,
    belt: 1.2,
    top: [[2.39, 0.82], [2.28, 1.02], [1.95, 1.12], [1.22, 1.19], [1.15, 1.21], [0.28, 1.74], [0.08, 1.78], [-2.05, 1.76], [-2.3, 1.58], [-2.39, 1.22]],
    wind: [1.15, 0.28],
    rear: [-2.05, -2.33],
    sideGlass: [1.05, -2.05],
    bPillar: -0.25,
    wheels: [[1.45, 0.38], [-1.42, 0.38]],
    mirrorZ: 0.95,
    handles: [0.3, -0.7],
    extra: ({ hw, zf, zr, lod }) =>
      lod
        ? []
        : [0.6, -0.6].flatMap((x) => [
            part(box(0.045, 0.04, (zf - zr) * 0.6, x * hw, 1.775, -0.3), 0x2a2d31, MAT.chrome),
            ...[0.95, -1.55].map((z) => part(box(0.05, 0.05, 0.12, x * hw, 1.745, z), 0x1a1b1d, MAT.plastic)),
          ]),
  },
  van: {
    len: 5.1,
    hw: 0.99,
    bottom: 0.32,
    belt: 1.14,
    top: [[2.55, 0.76], [2.45, 1.0], [2.12, 1.12], [1.86, 1.15], [0.95, 1.98], [0.75, 2.04], [-2.45, 2.03], [-2.55, 1.2]],
    wind: [1.86, 0.95],
    rear: [-2.5, -2.55],
    sideGlass: [1.8, 0.35],
    bPillar: 0.55,
    wheels: [[1.65, 0.34], [-1.55, 0.34]],
    mirrorZ: 1.55,
    handles: [1.1, -0.2],
  },
  pickup: {
    len: 5.25,
    hw: 0.95,
    bottom: 0.4,
    belt: 1.18,
    top: [[2.62, 0.84], [2.52, 1.04], [2.2, 1.14], [1.38, 1.2], [1.32, 1.22], [0.55, 1.78], [0.35, 1.82], [-0.72, 1.8], [-0.8, 1.2], [-2.6, 1.19], [-2.62, 1.05]],
    wind: [1.32, 0.55],
    rear: [-0.72, -0.8],
    sideGlass: [1.25, -0.7],
    bPillar: 0.2,
    wheels: [[1.65, 0.37], [-1.7, 0.37]],
    mirrorZ: 1.2,
    handles: [0.75, -0.3],
    // The open bed: a dark floor with the tailgate edge.
    extra: ({ hw, zr }) => [part(box(hw * 1.72, 0.03, 1.72, 0, 1.2, -1.72), 0x1a1b1d, MAT.plastic), part(box(hw * 1.86, 0.06, 0.06, 0, 1.2, zr + 0.05), 0x1a1b1d, MAT.plastic)],
  },
};
TYPES.taxi = {
  ...TYPES.sedan,
  extra: ({ lod }) => (lod ? [] : [part(box(0.64, 0.17, 0.26, 0, 1.54, -0.3), 0xf6f3e8, MAT.plastic), part(box(0.66, 0.035, 0.28, 0, 1.64, -0.3), 0x151515, MAT.plastic)]),
};

/** Everyday colours: mostly white, silver, grey and black, some blue and red. */
export const CAR_COLORS = [0xf2f2f0, 0xf2f2f0, 0xeeeeea, 0xb9bdc2, 0xa8adb3, 0x7d8288, 0x55595e, 0x1c1d20, 0x121315, 0x1f3050, 0x2a4d7a, 0x7a1d1d, 0xa82a22, 0x3b4f3a, 0x8a7a62, 0xd8cdb6];

/** Share of each type among parked and moving cars. */
export const CAR_MIX = { sedan: 0.3, hatch: 0.25, suv: 0.2, van: 0.09, pickup: 0.08, taxi: 0.08 };

const built = [null, null, null];
/** The models (built once per detail level: 0 near, 1 middle distance, 2 far): { type: { geo, lamps, len, wid, height } }. */
export function civilianModels(lod = 0) {
  if (!built[lod]) built[lod] = Object.fromEntries(Object.entries(TYPES).map(([k, o]) => [k, carModel(o, lod)]));
  return built[lod];
}

/** One material for them all: paint tinted per car (iTint), glass, chrome and plastic set by aMat. */
export function civilianMaterial() {
  const m = new THREE.MeshStandardMaterial({ name: 'מכוניות', vertexColors: true, roughness: 0.5, metalness: 0.2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; attribute vec3 iTint; varying float vMat; varying vec3 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vTint = iTint;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vMat > 0.5 && vMat < 1.5) diffuseColor.rgb *= vTint;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMat < 0.5 ? 0.72 : vMat < 1.5 ? 0.22 : vMat < 2.5 ? 0.04 : 0.16;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMat < 0.5 ? 0.0 : vMat < 1.5 ? 0.35 : vMat < 2.5 ? 0.2 : 1.0;');
  };
  m.customProgramCacheKey = () => 'civilian-cars';
  return m;
}

/** Picks a car type by the mix above. */
export function pickType(r) {
  let acc = 0;
  for (const [k, w] of Object.entries(CAR_MIX)) {
    acc += w;
    if (r < acc) return k;
  }
  return 'sedan';
}
