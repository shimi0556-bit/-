// Bones and animation: a `.bone(name, pivot)` node moves its sub-shape by a per-frame matrix.
// The preview feeds the matrices to the shader as uniforms; the GLB exporter turns the same
// bones into a glTF skeleton (skin weights come from each bone's distance field).

import { rotMatrix, RecipeError } from './dsl.js';

// ---------- 4x4 matrices, column-major (same layout as WebGL) ----------
export const m4 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const r = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
    return r;
  },
  translate: (v) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1],
  scale: (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1],
  // from a row-major 3x3 rotation
  rot: (m) => [m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, 0, 0, 0, 1],
  apply: (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]),
  invert(m) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    const d = 1 / det;
    return [
      (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
      (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
      (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
      (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
    ];
  },
};

// Decomposes a similarity-with-axis-scale matrix into glTF translation, rotation (quaternion) and scale.
export function decompose(m) {
  const t = [m[12], m[13], m[14]];
  const s = [0, 1, 2].map((c) => Math.hypot(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]));
  const r = [0, 1, 2].map((c) => [0, 1, 2].map((row) => m[c * 4 + row] / s[c])); // r[col][row]
  const R = (row, col) => r[col][row];
  const tr = R(0, 0) + R(1, 1) + R(2, 2);
  let q;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    q = [(R(2, 1) - R(1, 2)) / S, (R(0, 2) - R(2, 0)) / S, (R(1, 0) - R(0, 1)) / S, 0.25 * S];
  } else if (R(0, 0) > R(1, 1) && R(0, 0) > R(2, 2)) {
    const S = Math.sqrt(1 + R(0, 0) - R(1, 1) - R(2, 2)) * 2;
    q = [0.25 * S, (R(0, 1) + R(1, 0)) / S, (R(0, 2) + R(2, 0)) / S, (R(2, 1) - R(1, 2)) / S];
  } else if (R(1, 1) > R(2, 2)) {
    const S = Math.sqrt(1 + R(1, 1) - R(0, 0) - R(2, 2)) * 2;
    q = [(R(0, 1) + R(1, 0)) / S, 0.25 * S, (R(1, 2) + R(2, 1)) / S, (R(0, 2) - R(2, 0)) / S];
  } else {
    const S = Math.sqrt(1 + R(2, 2) - R(0, 0) - R(1, 1)) * 2;
    q = [(R(0, 2) + R(2, 0)) / S, (R(1, 2) + R(2, 1)) / S, 0.25 * S, (R(1, 0) - R(0, 1)) / S];
  }
  const ql = Math.hypot(...q);
  return { t, r: q.map((x) => x / ql), s };
}

function fail(msg) {
  throw new RecipeError(msg);
}

const BLOCK = new Set(['mirror', 'ring', 'grid', 'twist', 'bend']);

// Finds every bone in the tree with its parent bone and the transforms above it.
export function collectBones(root) {
  const bones = [];
  const names = new Set();
  const walk = (n, parent, E, blockedBy) => {
    let M = E;
    let par = parent;
    if (n.type === 'bone') {
      if (blockedBy) {
        fail(`bone '${n.a.name}' is inside .${blockedBy}(). A bone needs one place in space: build each side or copy separately (for example with a function that takes the side as +1 / -1) and give each its own bone`);
      }
      if (names.has(n.a.name)) fail(`two bones are named '${n.a.name}'. Bone names must be unique`);
      names.add(n.a.name);
      const b = { node: n, name: n.a.name, pivot: n.a.pivot, blend: n.a.blend, parent: parent ? parent.index : -1, index: bones.length, E: E.slice() };
      bones.push(b);
      n.a.index = b.index;
      par = b;
    } else if (n.type === 'move') M = m4.mul(E, m4.translate(n.a.t));
    else if (n.type === 'rotate') M = m4.mul(E, m4.rot(n.a.m));
    else if (n.type === 'scale') M = m4.mul(E, m4.scale(n.a.s));
    const blocked = blockedBy || (BLOCK.has(n.type) ? n.type : null);
    const kids = n.type === 'paint' ? [n.k[0]] : n.k;
    for (const k of kids) walk(k, par, M, blocked);
  };
  walk(root, null, m4.id(), null);
  return bones;
}

const num = (v, what) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number (got ${JSON.stringify(v)})`);
  return v;
};

// Reads one track value: { rotate: [x,y,z] degrees, scale: s | [sx,sy,sz], move: [x,y,z] }.
export function trackAt(anim, name, u) {
  const f = anim?.tracks?.[name];
  if (!f) return null;
  let r;
  try {
    r = f(u) || {};
  } catch (e) {
    fail(`animate(): track '${name}' failed at t=${u.toFixed(3)}: ${e.message}`);
  }
  const rot = r.rotate ?? [0, 0, 0];
  const sc = r.scale ?? 1;
  const mv = r.move ?? [0, 0, 0];
  const rotate = (Array.isArray(rot) ? rot : [0, 0, 0]).map((v, i) => num(v ?? 0, `track ${name} rotate[${i}]`));
  const scale = (Array.isArray(sc) ? sc : [sc, sc, sc]).map((v, i) => {
    num(v, `track ${name} scale[${i}]`);
    if (v <= 0) fail(`track ${name}: scale must stay above 0`);
    return v;
  });
  const move = mv.map((v, i) => num(v ?? 0, `track ${name} move[${i}]`));
  return { rotate, scale, move };
}

// Animation matrix A = T(move) R(rotate) S(scale) in the bone's own frame (origin at the pivot).
export function animMatrix(tr) {
  if (!tr) return m4.id();
  return m4.mul(m4.translate(tr.move), m4.mul(m4.rot(rotMatrix(...tr.rotate)), m4.scale(tr.scale)));
}

// Local motion of a bone around its pivot, in the coordinates where the bone was created.
export function boneLocal(bone, tr) {
  return m4.mul(m4.translate(bone.pivot), m4.mul(animMatrix(tr), m4.translate(bone.pivot.map((v) => -v))));
}

// Shader uniforms for time u in [0,1): inverse local matrices and a distance scale per bone.
export function poseUniforms(bones, anim, u) {
  const mats = new Float32Array(Math.max(1, bones.length) * 16);
  const s = new Float32Array(Math.max(1, bones.length)).fill(1);
  bones.forEach((b, i) => {
    const tr = u == null ? null : trackAt(anim, b.name, u);
    mats.set(tr ? m4.invert(boneLocal(b, tr)) : m4.id(), i * 16);
    if (tr) s[i] = Math.min(...tr.scale);
  });
  return { mats, s };
}

// Samples the animation so bounds can cover every pose; stores the local matrices on the bone nodes.
export function attachPoses(bones, anim, samples = 48) {
  for (const b of bones) {
    const poses = [m4.id()];
    if (anim?.tracks?.[b.name]) for (let i = 0; i < samples; i++) poses.push(boneLocal(b, trackAt(anim, b.name, i / samples)));
    b.node.a.poses = poses;
  }
}

// glTF skeleton: one extra root joint (index 0) plus one joint per bone, with rest and animated TRS.
export function skeleton(bones, anim, fps = 30) {
  const W = [m4.id(), ...bones.map((b) => m4.mul(b.E, m4.translate(b.pivot)))];
  const parent = [-1, ...bones.map((b) => b.parent + 1)];
  const joints = W.map((w, j) => {
    const restLocal = parent[j] < 0 ? w : m4.mul(m4.invert(W[parent[j]]), w);
    return { name: j === 0 ? 'root' : bones[j - 1].name, parent: parent[j], rest: decompose(restLocal), restLocal, ibm: m4.invert(w) };
  });
  let clip = null;
  if (anim && bones.some((b) => anim.tracks[b.name])) {
    const n = Math.max(2, Math.round(anim.seconds * fps) + 1);
    const times = new Float32Array(n);
    for (let k = 0; k < n; k++) times[k] = (k / (n - 1)) * anim.seconds;
    const channels = [];
    bones.forEach((b, i) => {
      if (!anim.tracks[b.name]) return;
      const T = new Float32Array(n * 3);
      const R = new Float32Array(n * 4);
      const S = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const u = (k / (n - 1)) % 1;
        const local = m4.mul(joints[i + 1].restLocal, animMatrix(trackAt(anim, b.name, k === n - 1 ? 0 : u)));
        const d = decompose(local);
        T.set(d.t, k * 3);
        // keep quaternions on one hemisphere so interpolation takes the short way
        if (k > 0) {
          const prev = R.subarray((k - 1) * 4, k * 4);
          if (prev[0] * d.r[0] + prev[1] * d.r[1] + prev[2] * d.r[2] + prev[3] * d.r[3] < 0) d.r = d.r.map((x) => -x);
        }
        R.set(d.r, k * 4);
        S.set(d.s, k * 3);
      }
      channels.push({ joint: i + 1, T, R, S });
    });
    clip = { times, channels };
  }
  return { joints, clip };
}

// Per-vertex skin weights from each bone's distance at the rest pose.
// A bone takes a share of its parent's weight: all of it on or inside its part, fading to none
// `blend` units outside (default: 30% of the part's thinnest side), so joints bend smoothly
// where the parts were melted together.
export function skinWeights(bones, dist, vc, size) {
  const J = bones.length + 1;
  const joints = new Uint8Array(vc * 4);
  const weights = new Float32Array(vc * 4);
  const w = new Float32Array(J);
  const order = new Int32Array(J);
  for (let v = 0; v < vc; v++) {
    w.fill(0);
    w[0] = 1;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      const r = b.blend ?? Math.min(size * 0.035, b.size * 0.3);
      const d = dist[v * bones.length + i];
      // on or inside the part: all of it; fading out over r units outside
      let f = Math.min(1, Math.max(0, 1 - d / r));
      f = f * f * (3 - 2 * f);
      const p = b.parent + 1;
      const take = f * w[p];
      w[i + 1] += take;
      w[p] -= take;
    }
    for (let j = 0; j < J; j++) order[j] = j;
    const top = Array.from(order).sort((a, b) => w[b] - w[a]).slice(0, 4);
    const sum = top.reduce((s, j) => s + w[j], 0) || 1;
    top.forEach((j, k) => {
      joints[v * 4 + k] = w[j] > 0 ? j : 0;
      weights[v * 4 + k] = w[j] > 0 ? w[j] / sum : 0;
    });
  }
  return { joints, weights };
}
