// Turns a creature recipe (bones + smooth blended shapes) into a skinned mesh:
//  1. the shapes form one signed-distance field with smooth unions (organic joins),
//  2. "surface nets" extracts a smooth surface from the field,
//  3. every vertex is bound to the bones of the shapes it lies on (skin weights),
//  4. colours (dark back, pale belly, stripes) are baked from the rest pose.
import * as THREE from 'three';

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

function compileShapes(recipe) {
  const joints = recipe.joints;
  const P = (v) => (typeof v === 'string' ? joints[v].pos : v);
  return recipe.shapes.map((s) => {
    if (s.type === 'ellipsoid') {
      return { type: 0, c: P(s.c), r: s.r, bone: s.bone, k: s.k ?? recipe.blend };
    }
    const a = P(s.a), b = P(s.b);
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return { type: 1, a, ba, bb: ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2], r1: s.r1, r2: s.r2 ?? s.r1, bone: s.bone, k: s.k ?? recipe.blend };
  });
}

function shapeDist(s, x, y, z) {
  if (s.type === 0) {
    const px = (x - s.c[0]) / s.r[0], py = (y - s.c[1]) / s.r[1], pz = (z - s.c[2]) / s.r[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / s.r[0], qy = py / s.r[1], qz = pz / s.r[2];
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(s.r[0], s.r[1], s.r[2]);
  }
  const px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
  let t = (px * s.ba[0] + py * s.ba[1] + pz * s.ba[2]) / s.bb;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - s.ba[0] * t, dy = py - s.ba[1] * t, dz = pz - s.ba[2] * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (s.r1 + (s.r2 - s.r1) * t);
}

function makeField(shapes) {
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      const di = shapeDist(s, x, y, z);
      d = i === 0 ? di : smin(d, di, s.k);
    }
    return d;
  };
}

function bounds(shapes, margin) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  const grow = (p, r) => { for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i] - r); max[i] = Math.max(max[i], p[i] + r); } };
  for (const s of shapes) {
    if (s.type === 0) grow(s.c, Math.max(...s.r));
    else { grow(s.a, Math.max(s.r1, s.r2)); grow([s.a[0] + s.ba[0], s.a[1] + s.ba[1], s.a[2] + s.ba[2]], Math.max(s.r1, s.r2)); }
  }
  for (let i = 0; i < 3; i++) { min[i] -= margin; max[i] += margin; }
  return { min, max };
}

// Naive surface nets over a regular grid.
function surfaceNets(field, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const id = (x, y, z) => (z * ny + y) * nx + x;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    vals[id(x, y, z)] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell);
  }
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (x, y, z) => (z * (ny - 1) + y) * (nx - 1) + x;
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = vals[id(x + corners[c][0], y + corners[c][1], z + corners[c][2])];
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellVert[cid(x, y, z)] = pos.length / 3;
    pos.push(min[0] + (x + sx / n) * cell, min[1] + (y + sy / n) * cell, min[2] + (z + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const inside = vals[id(x, y, z)] < 0;
    if (x < nx - 1 && inside !== (vals[id(x + 1, y, z)] < 0)) // edge along +x: cells around it in y,z
      quad(cellVert[cid(x, y - 1, z - 1)], cellVert[cid(x, y, z - 1)], cellVert[cid(x, y, z)], cellVert[cid(x, y - 1, z)], !inside);
    if (y < ny - 1 && inside !== (vals[id(x, y + 1, z)] < 0))
      quad(cellVert[cid(x - 1, y, z - 1)], cellVert[cid(x - 1, y, z)], cellVert[cid(x, y, z)], cellVert[cid(x, y, z - 1)], !inside);
    if (z < nz - 1 && inside !== (vals[id(x, y, z + 1)] < 0))
      quad(cellVert[cid(x - 1, y - 1, z)], cellVert[cid(x, y - 1, z)], cellVert[cid(x, y, z)], cellVert[cid(x - 1, y, z)], !inside);
  }
  return { pos: new Float32Array(pos), idx };
}

export function buildCreatureGeometry(recipe, cell) {
  const shapes = compileShapes(recipe);
  const field = makeField(shapes);
  const { min, max } = bounds(shapes, cell * 2);
  const { pos, idx } = surfaceNets(field, min, max, cell);
  const count = pos.length / 3;

  // normals from the field gradient (smoother than face normals)
  const nrm = new Float32Array(count * 3);
  const h = cell * 0.5;
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let gx = field(x + h, y, z) - field(x - h, y, z);
    let gy = field(x, y + h, z) - field(x, y - h, z);
    let gz = field(x, y, z + h) - field(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[i * 3] = gx / l; nrm[i * 3 + 1] = gy / l; nrm[i * 3 + 2] = gz / l;
  }
  // make the triangle winding agree with the outward normals
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = nrm[a * 3] + nrm[b * 3] + nrm[c * 3], ny = nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1], nz = nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }

  // skin weights: closeness to each shape, summed per bone, best four kept
  const boneIndex = recipe.boneIndex;
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  const falloff = recipe.skinFalloff ?? 0.18;
  const per = new Float32Array(recipe.bones.length);
  for (let i = 0; i < count; i++) {
    per.fill(0);
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    for (const s of shapes) {
      const d = Math.max(0, shapeDist(s, x, y, z));
      per[boneIndex[s.bone]] += Math.exp(-d / falloff);
    }
    const best = [...per.keys()].sort((p, q) => per[q] - per[p]).slice(0, 4);
    let sum = 0;
    for (const b of best) sum += per[b];
    best.forEach((b, k) => { skinIndex[i * 4 + k] = b; skinWeight[i * 4 + k] = sum > 0 ? per[b] / sum : (k === 0 ? 1 : 0); });
  }

  // baked colours: dark back, pale belly, stripes across the back
  const pal = recipe.palette;
  const col = new Float32Array(count * 3);
  const back = new THREE.Color(pal.back), belly = new THREE.Color(pal.belly), stripe = new THREE.Color(pal.stripe);
  const yMid = recipe.bellyY ?? (min[1] + max[1]) / 2;
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = pos[i * 3];
    const ny = nrm[i * 3 + 1];
    const under = THREE.MathUtils.smoothstep(-ny + (yMid - y) * 0.15, -0.1, 0.55);
    tmp.copy(back).lerp(belly, under);
    const st = Math.sin(z * pal.stripeFreq + Math.sin(x * 1.3) * 0.6) * 0.5 + 0.5;
    const stripeAmt = THREE.MathUtils.smoothstep(st, 0.62, 0.8) * (1 - under) * pal.stripeAmt;
    tmp.lerp(stripe, stripeAmt);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setIndex(idx.length > 65535 * 3 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return { geometry: geo, shapes, min, max };
}

// Skin material: triplanar scales in rest-pose space (the pattern sticks to the skin while it
// moves), a derivative bump from the same texture, a soft rim, a hit flash and a burn-away.
export function makeSkinMaterial(skinTex, texScale, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: opts.roughness ?? 0.62, metalness: 0.0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000), emissiveIntensity: 1,
  });
  const U = {
    tSkin: { value: skinTex }, uTexScale: { value: texScale },
    uFlash: { value: 0 }, uDissolve: { value: 0 }, uGlow: { value: new THREE.Color(opts.glow ?? 0x000000) },
    uRim: { value: new THREE.Color(opts.rim ?? 0x223322) }, uBump: { value: opts.bump ?? 1.0 },
  };
  mat.userData.u = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest; varying vec3 vRestN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vRestN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest; varying vec3 vRestN;
uniform sampler2D tSkin; uniform float uTexScale, uFlash, uDissolve, uBump; uniform vec3 uGlow, uRim;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float skinTri(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(3.0)); w /= (w.x + w.y + w.z);
  float a = texture2D(tSkin, p.zy / uTexScale).g, b = texture2D(tSkin, p.xz / uTexScale).g, c = texture2D(tSkin, p.xy / uTexScale).g;
  return a * w.x + b * w.y + c * w.z;
}`)
      .replace('#include <map_fragment>', `
float sk = skinTri(vRest, normalize(vRestN));
float dn = vnoise(vRest * 1.7) * 0.65 + vnoise(vRest * 5.3) * 0.35;
if (uDissolve > 0.0 && dn < uDissolve) discard;
diffuseColor.rgb *= mix(0.55, 1.35, sk);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhdx = dFdx(sk), dhdy = dFdy(sk);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  normal = normalize(abs(det) * normal - grad * uBump * 0.6);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
totalEmissiveRadiance += uRim * rim * 0.6;
if (uGlow.r + uGlow.g + uGlow.b > 0.0) { // glowing veins (the boss): thin lines where a smooth noise crosses its middle
  float vein = 1.0 - smoothstep(0.015, 0.05, abs(vnoise(vRest * 0.4) - 0.5));
  totalEmissiveRadiance += uGlow * (vein * 2.4 + 0.03);
}
totalEmissiveRadiance += vec3(1.0, 0.35, 0.15) * uFlash * 1.6;
if (uDissolve > 0.0) totalEmissiveRadiance += vec3(4.0, 1.4, 0.3) * (1.0 - smoothstep(0.0, 0.08, dn - uDissolve));`);
  };
  mat.customProgramCacheKey = () => 'creature-skin';
  return mat;
}
