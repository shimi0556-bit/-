// Turns a compiled SDF into a triangle mesh.
// 1. The GPU samples the distance field on a grid, slice by slice (floats are
//    packed into RGBA8 pixels, so no float render-target extension is needed).
// 2. Surface nets builds one vertex per surface cell and one quad per sign-changing edge,
//    streaming two slices at a time.
// 3. The GPU snaps every vertex onto the true surface with Newton steps and
//    evaluates normal, color and material there.

import { linkProgram, fullscreenTriangle } from './renderer.js';
import { MeshoptSimplifier } from '../vendor/meshopt_simplifier.js';
import { skinWeights } from './anim.js';

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const PACK = `
vec4 packF(float v){ uint u = floatBitsToUint(v); return vec4(float(u & 255u), float((u >> 8u) & 255u), float((u >> 16u) & 255u), float(u >> 24u))/255.0; }
vec2 pack16(float v){ uint u = uint(clamp(v*0.5 + 0.5, 0.0, 1.0)*65535.0 + 0.5); return vec2(float(u >> 8u), float(u & 255u))/255.0; }
vec3 toSrgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
`;

const evalFrag = (glsl) => `#version 300 es
precision highp float; precision highp int;
uniform vec3 uMin; uniform float uH; uniform int uNx, uNy, uTilesX, uSlice0;
out vec4 o;
${glsl}
${PACK}
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy);
  int tx = fc.x / uNx; int ty = fc.y / uNy;
  int i = fc.x - tx*uNx; int j = fc.y - ty*uNy;
  int k = uSlice0 + ty*uTilesX + tx;
  o = packF(map(uMin + vec3(float(i), float(j), float(k))*uH));
}`;

const refineFrag = (glsl) => `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uPos; uniform int uCount, uW, uPass; uniform float uH;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2; layout(location = 3) out vec4 o3;
${glsl}
${PACK}
vec3 grad(vec3 p, float e){
  vec2 k = vec2(1.0, -1.0);
  return (k.xyy*map(p + k.xyy*e) + k.yyx*map(p + k.yyx*e) + k.yxy*map(p + k.yxy*e) + k.xxx*map(p + k.xxx*e))/(4.0*e);
}
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy);
  int idx = fc.y*uW + fc.x;
  o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(0.0); o3 = vec4(0.0);
  if (idx >= uCount) return;
  vec3 p0 = texelFetch(uPos, fc, 0).xyz;
  if (uPass == 0){
    vec3 p = p0;
    float e = uH*0.02;
    for (int it = 0; it < 6; it++){
      float d = map(p);
      if (abs(d) < uH*1e-4) break;
      vec3 g = grad(p, e);
      float gg = dot(g, g);
      if (gg < 1e-10) break;
      p -= d*g/gg;
    }
    vec3 dp = p - p0; float L = length(dp);
    if (L > 0.9*uH) p = p0 + dp*(0.9*uH/L);
    o0 = packF(p.x); o1 = packF(p.y); o2 = packF(p.z);
  } else {
    vec3 n = normalize(grad(p0, uH*0.05) + vec3(0.0, 1e-9, 0.0));
    vec3 col, mat; mapC(p0, col, mat);
    o0 = vec4(pack16(n.x), pack16(n.y));
    o1 = vec4(pack16(n.z), clamp(mat.z/4.0, 0.0, 1.0), 0.0);
    o2 = vec4(toSrgb(col), 1.0);
    o3 = vec4(clamp(mat.x, 0.0, 1.0), clamp(mat.y, 0.0, 1.0), 0.0, 1.0);
  }
}`;

const weightFrag = (glsl, skin) => `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uPos; uniform int uCount, uW, uGroup;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2; layout(location = 3) out vec4 o3;
${glsl}
${skin}
${PACK}
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy);
  if (fc.y*uW + fc.x >= uCount){ o0 = o1 = o2 = o3 = vec4(0.0); return; }
  vec3 p = texelFetch(uPos, fc, 0).xyz;
  o0 = packF(boneDist(uGroup*4, p));
  o1 = packF(boneDist(uGroup*4 + 1, p));
  o2 = packF(boneDist(uGroup*4 + 2, p));
  o3 = packF(boneDist(uGroup*4 + 3, p));
}`;

// cube corner c = x | y<<1 | z<<2; the 12 edges as corner pairs
const EDGES = [];
for (let c = 0; c < 8; c++) for (let b = 0; b < 3; b++) if (!(c & (1 << b))) EDGES.push([c, c | (1 << b)]);
const CX = [0, 1, 0, 1, 0, 1, 0, 1];
const CY = [0, 0, 1, 1, 0, 0, 1, 1];
const CZ = [0, 0, 0, 0, 1, 1, 1, 1];

class Grow {
  constructor(Type, n = 1 << 16) {
    this.Type = Type;
    this.a = new Type(n);
    this.n = 0;
  }
  push(...v) {
    if (this.n + v.length > this.a.length) {
      const b = new this.Type(Math.max(this.a.length * 2, this.n + v.length));
      b.set(this.a);
      this.a = b;
    }
    for (const x of v) this.a[this.n++] = x;
  }
  out() {
    return this.a.slice(0, this.n);
  }
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

export class Mesher {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 4;
    this.canvas.height = 4;
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.vao = fullscreenTriangle(gl);
    this.key = null;
  }

  prepare(compiled) {
    if (this.key === compiled.glsl) return;
    const gl = this.gl;
    if (this.evalP) gl.deleteProgram(this.evalP.p);
    if (this.refP) gl.deleteProgram(this.refP.p);
    if (this.wP) gl.deleteProgram(this.wP.p);
    this.evalP = linkProgram(gl, VERT, evalFrag(compiled.glsl));
    this.refP = linkProgram(gl, VERT, refineFrag(compiled.glsl));
    this.wP = compiled.skinGlsl ? linkProgram(gl, VERT, weightFrag(compiled.glsl, compiled.skinGlsl)) : null;
    this.key = compiled.glsl;
  }

  // Moving parts are meshed in their rest pose.
  rest(P, compiled) {
    const gl = this.gl;
    const pose = compiled.pose(null);
    gl.useProgram(P.p);
    if (P.uni.uBone) gl.uniformMatrix4fv(P.uni.uBone, false, pose.mats);
    if (P.uni.uBoneS) gl.uniform1fv(P.uni.uBoneS, pose.s);
  }

  // Distance from every vertex to every bone's part, read back as vc x bones floats.
  boneDistances(compiled, positions) {
    const gl = this.gl;
    const nb = compiled.bones.length;
    const vc = positions.length / 3;
    const out = new Float32Array(vc * nb);
    const W = 1024;
    const maxRows = 256;
    const P = this.wP;
    this.rest(P, compiled);
    const posTex = gl.createTexture();
    for (let start = 0; start < vc; start += W * maxRows) {
      const count = Math.min(W * maxRows, vc - start);
      const rows = Math.ceil(count / W);
      const upload = new Float32Array(W * rows * 4);
      for (let i = 0; i < count; i++) upload.set(positions.subarray((start + i) * 3, (start + i) * 3 + 3), i * 4);
      gl.bindTexture(gl.TEXTURE_2D, posTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, rows, 0, gl.RGBA, gl.FLOAT, upload);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const t = this.target(W, rows, 4);
      const px = new Uint8Array(W * rows * 4);
      const pf = new Float32Array(px.buffer);
      for (let g = 0; g * 4 < nb; g++) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, posTex); // target() rebinds TEXTURE_2D, so bind the input again
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, W, rows);
        gl.useProgram(P.p);
        gl.uniform1i(P.uni.uPos, 0);
        gl.uniform1i(P.uni.uCount, count);
        gl.uniform1i(P.uni.uW, W);
        gl.uniform1i(P.uni.uGroup, g);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        for (let a = 0; a < 4 && g * 4 + a < nb; a++) {
          gl.readBuffer(gl.COLOR_ATTACHMENT0 + a);
          gl.readPixels(0, 0, W, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
          for (let i = 0; i < count; i++) out[(start + i) * nb + g * 4 + a] = pf[i];
        }
      }
      t.free();
    }
    gl.deleteTexture(posTex);
    return out;
  }

  target(w, h, count) {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const texs = [];
    for (let i = 0; i < count; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      texs.push(t);
    }
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete');
    return {
      fb,
      texs,
      free() {
        gl.deleteFramebuffer(fb);
        texs.forEach((t) => gl.deleteTexture(t));
      },
    };
  }

  async build(compiled, { res = 192, onProgress = () => {}, signal } = {}) {
    const t0 = performance.now();
    this.prepare(compiled);
    const gl = this.gl;
    const b = compiled.restBounds || compiled.bounds;
    const ext = b.max.map((v, i) => v - b.min[i]);
    const pad = 2;
    const h = Math.max(...ext) / Math.max(8, res - 2 * pad - 1);
    const N = ext.map((e) => Math.min(1024, Math.ceil(e / h) + 2 * pad + 1));
    const [nx, ny, nz] = N;
    const min = b.min.map((v, i) => v - (h * (N[i] - 1) - ext[i]) / 2);

    // --- 1. sample the grid in batches of slices ---
    const tilesX = Math.max(1, Math.floor(1024 / nx));
    const tilesY = Math.max(1, Math.floor(1024 / ny));
    const per = tilesX * tilesY;
    const TW = tilesX * nx;
    const TH = tilesY * ny;
    const tgt = this.target(TW, TH, 1);
    const bytes = new Uint8Array(TW * TH * 4);
    const f32 = new Float32Array(bytes.buffer);
    const E = this.evalP;
    this.rest(E, compiled);
    this.rest(this.refP, compiled);
    gl.useProgram(E.p);
    gl.uniform3fv(E.uni.uMin, min);
    gl.uniform1f(E.uni.uH, h);
    gl.uniform1i(E.uni.uNx, nx);
    gl.uniform1i(E.uni.uNy, ny);
    gl.uniform1i(E.uni.uTilesX, tilesX);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, TW, TH);

    let batchStart = -1e9;
    const loadBatch = (k) => {
      batchStart = Math.floor(k / per) * per;
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fb);
      gl.useProgram(E.p);
      gl.uniform1i(E.uni.uSlice0, batchStart);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, TW, TH, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    };
    const slice = (k, out) => {
      if (k < batchStart || k >= batchStart + per) loadBatch(k);
      const s = k - batchStart;
      const tx = s % tilesX;
      const ty = Math.floor(s / tilesX);
      for (let j = 0; j < ny; j++) out.set(f32.subarray((ty * ny + j) * TW + tx * nx, (ty * ny + j) * TW + tx * nx + nx), j * nx);
    };

    // --- 2. surface nets, two slices at a time ---
    const Mx = nx - 1;
    const My = ny - 1;
    let s0 = new Float32Array(nx * ny);
    let s1 = new Float32Array(nx * ny);
    let prev = new Int32Array(Mx * My).fill(-1);
    let cur = new Int32Array(Mx * My).fill(-1);
    const P = new Grow(Float32Array, 1 << 18);
    const Q = new Grow(Uint32Array, 1 << 18);
    const v = new Float32Array(8);
    slice(0, s0);
    let lastYield = performance.now();
    for (let k = 0; k < nz - 1; k++) {
      slice(k + 1, s1);
      cur.fill(-1);
      for (let j = 0; j < My; j++) {
        for (let i = 0; i < Mx; i++) {
          const o = j * nx + i;
          v[0] = s0[o];
          v[1] = s0[o + 1];
          v[2] = s0[o + nx];
          v[3] = s0[o + nx + 1];
          v[4] = s1[o];
          v[5] = s1[o + 1];
          v[6] = s1[o + nx];
          v[7] = s1[o + nx + 1];
          let mask = 0;
          for (let c = 0; c < 8; c++) if (v[c] < 0) mask |= 1 << c;
          if (mask === 0 || mask === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let cnt = 0;
          for (let e = 0; e < 12; e++) {
            const a = EDGES[e][0];
            const c = EDGES[e][1];
            const ia = (mask >> a) & 1;
            if (ia === ((mask >> c) & 1)) continue;
            const t = v[a] / (v[a] - v[c]);
            sx += CX[a] + (CX[c] - CX[a]) * t;
            sy += CY[a] + (CY[c] - CY[a]) * t;
            sz += CZ[a] + (CZ[c] - CZ[a]) * t;
            cnt++;
          }
          cur[j * Mx + i] = P.n / 3;
          P.push(min[0] + (i + sx / cnt) * h, min[1] + (j + sy / cnt) * h, min[2] + (k + sz / cnt) * h);
        }
      }
      // quads around sign-changing grid edges
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const o = j * nx + i;
          const inA = s0[o] < 0;
          // z edge (i,j,k)-(i,j,k+1): cells in layer k
          if (inA !== s1[o] < 0) {
            const q = [cur[(j - 1) * Mx + i - 1], cur[(j - 1) * Mx + i], cur[j * Mx + i], cur[j * Mx + i - 1]];
            if (q[0] >= 0 && q[1] >= 0 && q[2] >= 0 && q[3] >= 0) {
              if (inA) Q.push(q[0], q[1], q[2], q[3]);
              else Q.push(q[3], q[2], q[1], q[0]);
            }
          }
          if (k === 0) continue;
          // x edge (i,j,k)-(i+1,j,k): cells (i, j-1..j, k-1..k)
          if (i < nx - 1 && inA !== s0[o + 1] < 0) {
            const q = [prev[(j - 1) * Mx + i], prev[j * Mx + i], cur[j * Mx + i], cur[(j - 1) * Mx + i]];
            if (q[0] >= 0 && q[1] >= 0 && q[2] >= 0 && q[3] >= 0) {
              if (inA) Q.push(q[0], q[1], q[2], q[3]);
              else Q.push(q[3], q[2], q[1], q[0]);
            }
          }
          // y edge (i,j,k)-(i,j+1,k): cells (i-1..i, j, k-1..k)
          if (j < ny - 1 && inA !== s0[o + nx] < 0) {
            const q = [prev[j * Mx + i - 1], cur[j * Mx + i - 1], cur[j * Mx + i], prev[j * Mx + i]];
            if (q[0] >= 0 && q[1] >= 0 && q[2] >= 0 && q[3] >= 0) {
              if (inA) Q.push(q[0], q[1], q[2], q[3]);
              else Q.push(q[3], q[2], q[1], q[0]);
            }
          }
        }
      }
      [s0, s1] = [s1, s0];
      [prev, cur] = [cur, prev];
      if (performance.now() - lastYield > 40) {
        onProgress(0.7 * (k / (nz - 1)), 'דגימת שדה המרחק');
        await nextTick();
        if (signal?.aborted) {
          tgt.free();
          throw new DOMException('cancelled', 'AbortError');
        }
        lastYield = performance.now();
      }
    }
    tgt.free();
    const positions = P.out();
    const quads = Q.out();
    const vc = positions.length / 3;
    if (vc === 0) throw new Error('The shape is empty inside its bounds, so there is nothing to mesh');

    // --- 3. snap vertices to the surface and read attributes ---
    const W = 1024;
    const normals = new Float32Array(vc * 3);
    const colors = new Float32Array(vc * 3);
    const mats = new Float32Array(vc * 3);
    const R = this.refP;
    const maxRows = 256;
    const posTex = gl.createTexture();
    for (let start = 0; start < vc; start += W * maxRows) {
      const count = Math.min(W * maxRows, vc - start);
      const rows = Math.ceil(count / W);
      const upload = new Float32Array(W * rows * 4);
      for (let i = 0; i < count; i++) {
        upload[i * 4] = positions[(start + i) * 3];
        upload[i * 4 + 1] = positions[(start + i) * 3 + 1];
        upload[i * 4 + 2] = positions[(start + i) * 3 + 2];
      }
      const t = this.target(W, rows, 4);
      const px = new Uint8Array(W * rows * 4);
      const pf = new Float32Array(px.buffer);
      const read = (att) => {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + att);
        gl.readPixels(0, 0, W, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      const runPass = (pass) => {
        gl.bindTexture(gl.TEXTURE_2D, posTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, rows, 0, gl.RGBA, gl.FLOAT, upload);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, W, rows);
        gl.useProgram(R.p);
        gl.uniform1i(R.uni.uPos, 0);
        gl.uniform1i(R.uni.uCount, count);
        gl.uniform1i(R.uni.uW, W);
        gl.uniform1i(R.uni.uPass, pass);
        gl.uniform1f(R.uni.uH, h);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      runPass(0);
      for (let c = 0; c < 3; c++) {
        read(c);
        for (let i = 0; i < count; i++) {
          positions[(start + i) * 3 + c] = pf[i];
          upload[i * 4 + c] = pf[i];
        }
      }
      onProgress(0.8, 'הצמדת נקודות למשטח');
      await nextTick();
      runPass(1);
      read(0);
      for (let i = 0; i < count; i++) {
        normals[(start + i) * 3] = ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * 2 - 1;
        normals[(start + i) * 3 + 1] = ((px[i * 4 + 2] * 256 + px[i * 4 + 3]) / 65535) * 2 - 1;
      }
      read(1);
      for (let i = 0; i < count; i++) {
        normals[(start + i) * 3 + 2] = ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * 2 - 1;
        mats[(start + i) * 3 + 2] = (px[i * 4 + 2] / 255) * 4;
      }
      read(2);
      for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) colors[(start + i) * 3 + c] = px[i * 4 + c] / 255;
      read(3);
      for (let i = 0; i < count; i++) {
        mats[(start + i) * 3] = px[i * 4] / 255;
        mats[(start + i) * 3 + 1] = px[i * 4 + 1] / 255;
      }
      t.free();
      onProgress(0.9, 'צבעים ונורמלים');
      await nextTick();
    }
    gl.deleteTexture(posTex);
    for (let i = 0; i < vc; i++) {
      const x = normals[i * 3];
      const y = normals[i * 3 + 1];
      const z = normals[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      normals[i * 3] = x / l;
      normals[i * 3 + 1] = y / l;
      normals[i * 3 + 2] = z / l;
    }

    // --- skin weights for moving parts ---
    let skin = null;
    if (this.wP && compiled.bones.length) {
      onProgress(0.94, 'משקלי עצמות');
      await nextTick();
      const dist = this.boneDistances(compiled, positions);
      const size = Math.hypot(...ext);
      skin = skinWeights(compiled.bones, dist, vc, size);
    }

    // --- 4. split quads along the shorter diagonal ---
    const qn = quads.length / 4;
    const indices = new Uint32Array(qn * 6);
    const d2 = (a, c) => {
      const dx = positions[a * 3] - positions[c * 3];
      const dy = positions[a * 3 + 1] - positions[c * 3 + 1];
      const dz = positions[a * 3 + 2] - positions[c * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    for (let q = 0; q < qn; q++) {
      const a = quads[q * 4];
      const b2 = quads[q * 4 + 1];
      const c = quads[q * 4 + 2];
      const d = quads[q * 4 + 3];
      const o = q * 6;
      if (d2(a, c) <= d2(b2, d)) indices.set([a, b2, c, a, c, d], o);
      else indices.set([a, b2, d, b2, c, d], o);
    }
    onProgress(1, 'מוכן');
    return {
      positions,
      normals,
      colors,
      mats,
      indices,
      joints: skin?.joints || null,
      weights: skin?.weights || null,
      grid: N,
      cell: h,
      ms: Math.round(performance.now() - t0),
    };
  }
}

// Reduces the triangle count while keeping the silhouette, normals and colors.
export async function simplifyMesh(mesh, targetTris) {
  const tris = mesh.indices.length / 3;
  if (!targetTris || tris <= targetTris) return mesh;
  if (!MeshoptSimplifier.supported) throw new Error('This browser cannot run the simplifier (WebAssembly is blocked)');
  await MeshoptSimplifier.ready;
  const vc = mesh.positions.length / 3;
  const attrs = new Float32Array(vc * 6);
  for (let i = 0; i < vc; i++) {
    attrs.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * 6);
    attrs.set(mesh.colors.subarray(i * 3, i * 3 + 3), i * 6 + 3);
  }
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(
    mesh.indices,
    mesh.positions,
    3,
    attrs,
    6,
    [0.4, 0.4, 0.4, 1.0, 1.0, 1.0],
    null,
    targetTris * 3,
    0.02,
    [],
  );
  // compact the vertex arrays to the vertices still in use
  const remap = new Int32Array(vc).fill(-1);
  let n = 0;
  for (let i = 0; i < idx.length; i++) if (remap[idx[i]] < 0) remap[idx[i]] = n++;
  const pick = (src) => {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < vc; i++) if (remap[i] >= 0) out.set(src.subarray(i * 3, i * 3 + 3), remap[i] * 3);
    return out;
  };
  const pick4 = (src, Type) => {
    const out = new Type(n * 4);
    for (let i = 0; i < vc; i++) if (remap[i] >= 0) out.set(src.subarray(i * 4, i * 4 + 4), remap[i] * 4);
    return out;
  };
  const indices = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) indices[i] = remap[idx[i]];
  return {
    ...mesh,
    positions: pick(mesh.positions),
    normals: pick(mesh.normals),
    colors: pick(mesh.colors),
    mats: pick(mesh.mats),
    joints: mesh.joints ? pick4(mesh.joints, Uint8Array) : null,
    weights: mesh.weights ? pick4(mesh.weights, Float32Array) : null,
    indices,
  };
}

export function meshStats(mesh) {
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c], p[i + c]);
    max[c] = Math.max(max[c], p[i + c]);
  }
  // signed volume (positive when triangles face outward)
  let vol = 0;
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3;
    const b = I[t + 1] * 3;
    const c = I[t + 2] * 3;
    vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return { vertices: p.length / 3, triangles: I.length / 3, min, max, volume: vol };
}
