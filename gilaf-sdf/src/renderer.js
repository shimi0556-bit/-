// Real-time preview: raymarches the compiled SDF with soft shadows, AO and PBR-ish
// lighting, and can also draw an exported triangle mesh for inspection.

import { srgbToLinear } from './glsl.js';

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255);
const lin = (h) => hex(h).map(srgbToLinear);
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

// Background colors are display-space (sRGB); light colors are linear radiance.
export const LIGHTS = {
  studio: {
    label: 'סטודיו',
    sun: norm([-0.55, 0.78, 0.62]),
    sunCol: [3.1, 2.95, 2.75],
    sky: lin('#8d9ab0').map((v) => v * 1.25),
    bounce: lin('#6b5f55'),
    rim: [0.55, 0.65, 0.9],
    bgTop: hex('#262a33'),
    bgBot: hex('#5d6371'),
    exposure: 1.0,
  },
  sunset: {
    label: 'שקיעה',
    sun: norm([-0.8, 0.35, 0.45]),
    sunCol: [3.6, 2.2, 1.2],
    sky: lin('#6d6fa8').map((v) => v * 1.1),
    bounce: lin('#7a4a3a'),
    rim: [1.0, 0.55, 0.35],
    bgTop: hex('#2c2240'),
    bgBot: hex('#b0705a'),
    exposure: 1.05,
  },
  daylight: {
    label: 'יום',
    sun: norm([0.45, 0.85, 0.35]),
    sunCol: [3.3, 3.2, 3.0],
    sky: lin('#9fc4ff').map((v) => v * 1.2),
    bounce: lin('#8a8070'),
    rim: [0.7, 0.8, 1.0],
    bgTop: hex('#6f9fd8'),
    bgBot: hex('#dfe6ee'),
    exposure: 0.95,
  },
  night: {
    label: 'לילה',
    sun: norm([0.3, 0.6, -0.75]),
    sunCol: [1.2, 1.5, 2.4],
    sky: lin('#28324d'),
    bounce: lin('#1a1a24'),
    rim: [0.55, 0.85, 1.7],
    bgTop: hex('#07080d'),
    bgBot: hex('#1b2033'),
    exposure: 1.25,
  },
};

const FRAG_HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes; uniform vec2 uJit;
uniform vec3 uRo, uCu, uCv, uCw; uniform float uFocal, uPix;
uniform vec3 uBMin, uBMax, uTarget; uniform float uS, uStep;
uniform int uGround, uClay, uFast; uniform float uGroundY;
uniform vec3 uSunDir, uSunCol, uSky, uBounce, uRim, uBgTop, uBgBot; uniform float uExposure;
uniform int uProbe, uPN, uPTiles; uniform vec3 uPMin; uniform float uPH;
out vec4 outColor;
`;

const FRAG_BODY = `
float mapS(vec3 p){ return map(p)*uStep; }

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax){
  vec3 inv = 1.0/rd; vec3 t0 = (bmin - ro)*inv; vec3 t1 = (bmax - ro)*inv;
  vec3 tn = min(t0,t1); vec3 tf = max(t0,t1);
  return vec2(max(max(tn.x,tn.y),tn.z), min(min(tf.x,tf.y),tf.z));
}

float march(vec3 ro, vec3 rd, float t, float tmax){
  int steps = uFast == 1 ? 160 : 320;
  for (int i = 0; i < 320; i++){
    if (i >= steps || t > tmax) break;
    float d = mapS(ro + rd*t);
    if (abs(d) < 0.5*uPix*t + 1e-5*uS) return t;
    t += d;
  }
  return -1.0;
}

vec3 calcNormal(vec3 p, float t){
  float e = max(2e-5*uS, 0.5*uPix*t);
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy*map(p + k.xyy*e) + k.yyx*map(p + k.yyx*e) + k.yxy*map(p + k.yxy*e) + k.xxx*map(p + k.xxx*e));
}

float softShadow(vec3 ro, vec3 rd){
  vec2 bh = boxHit(ro, rd, uBMin, uBMax);
  if (bh.y < 0.0 || bh.x > bh.y) return 1.0;
  float tmax = min(bh.y, 3.0*uS);
  float t = max(0.01*uS, bh.x);
  float res = 1.0;
  int steps = uFast == 1 ? 40 : 96;
  for (int i = 0; i < 96; i++){
    if (i >= steps) break;
    float h = mapS(ro + rd*t);
    res = min(res, 9.0*h/t);
    t += clamp(h, 0.004*uS, 0.12*uS);
    if (res < 0.002 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res*res*(3.0 - 2.0*res);
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0, s = 0.5*uS;
  for (int i = 0; i < 5; i++){
    float h = s*(0.01 + 0.12*float(i)/4.0);
    float d = mapS(p + n*h);
    occ += (h - d)*sca; sca *= 0.93;
  }
  return clamp(1.0 - 3.0*occ/s, 0.0, 1.0);
}

vec3 envColor(vec3 r, float rough){
  vec3 c = mix(uBounce*0.7, uSky, smoothstep(-0.25, 0.65, r.y));
  float w = mix(0.035, 0.6, rough);
  c += uSunCol*0.55*smoothstep(1.0 - w, 1.0 - w*0.25, dot(r, uSunDir));
  vec3 fill = normalize(vec3(-uSunDir.x, 0.35, -uSunDir.z));
  c += uRim*0.9*smoothstep(1.0 - w*1.4, 1.0 - w*0.3, dot(r, fill));
  c += uSky*0.35*exp(-abs(r.y)*mix(30.0, 3.0, rough));
  return c;
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

vec3 background(vec3 rd, vec2 uv){
  vec3 c = mix(uBgBot, uBgTop, smoothstep(-0.25, 0.75, rd.y));
  c *= 1.0 - 0.28*dot(uv, uv);
  return c;
}

vec3 shadeObject(vec3 p, vec3 n, vec3 rd, float t){
  vec3 alb, mat; mapC(p, alb, mat);
  if (uClay == 1){ alb = vec3(0.55, 0.53, 0.5); mat = vec3(0.62, 0.0, 0.0); }
  float rough = clamp(mat.x, 0.03, 1.0); float metal = clamp(mat.y, 0.0, 1.0); float glow = max(mat.z, 0.0);
  vec3 v = -rd; float ndv = max(dot(n, v), 1e-3);
  vec3 F0 = mix(vec3(0.04), alb, metal); vec3 dif = alb*(1.0 - metal);
  float ao = calcAO(p, n);
  vec3 L = uSunDir; float ndl = max(dot(n, L), 0.0);
  float sh = ndl > 0.0 ? softShadow(p + n*0.003*uS, L) : 0.0;
  vec3 H = normalize(L + v); float ndh = max(dot(n, H), 0.0);
  float a = rough*rough; float a2 = a*a; float dn = ndh*ndh*(a2 - 1.0) + 1.0;
  float D = a2/(3.14159*dn*dn);
  float kk = (rough + 1.0)*(rough + 1.0)/8.0;
  float G = (ndl/(ndl*(1.0 - kk) + kk))*(ndv/(ndv*(1.0 - kk) + kk));
  vec3 F = F0 + (1.0 - F0)*pow(1.0 - max(dot(H, v), 0.0), 5.0);
  vec3 spec = D*G*F/max(4.0*ndl*ndv, 1e-3);
  vec3 col = (dif*(1.0 - F) + 3.14159*spec)*uSunCol*ndl*sh;
  // back light for silhouette separation
  vec3 L2 = normalize(vec3(-uSunDir.x, 0.45, -uSunDir.z));
  float ndl2 = max(dot(n, L2), 0.0);
  col += dif*uRim*ndl2*0.35*ao;
  // sky + ground bounce
  vec3 amb = mix(uBounce, uSky, 0.5 + 0.5*n.y);
  col += dif*amb*ao*0.9;
  // environment reflection
  vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0)*pow(1.0 - ndv, 5.0);
  vec3 r = reflect(rd, n);
  float so = clamp(pow(ndv + ao, exp2(-16.0*rough - 1.0)) - 1.0 + ao, 0.0, 1.0);
  col += envColor(r, rough)*Fe*so*mix(1.0, 1.6, metal);
  col += alb*glow*2.6;
  col *= uExposure;
  return pow(aces(col), vec3(1.0/2.2));
}

vec3 shadeFloor(vec3 p, vec3 rd, vec2 uv){
  vec3 bg = background(rd, uv);
  float sh = uSunDir.y > 0.0 ? softShadow(p + vec3(0.0, 0.002*uS, 0.0), uSunDir) : 1.0;
  float ao = calcAO(p, vec3(0.0, 1.0, 0.0));
  vec3 c = bg*mix(0.42, 1.0, sh)*mix(0.35, 1.0, ao);
  float fade = smoothstep(0.9*uS, 3.5*uS, length(p.xz - uTarget.xz));
  return mix(c, bg, fade);
}

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }

vec4 packF(float v){ uint u = floatBitsToUint(v); return vec4(float(u & 255u), float((u >> 8u) & 255u), float((u >> 16u) & 255u), float(u >> 24u))/255.0; }

void main(){
  if (uProbe == 1){
    ivec2 pc = ivec2(gl_FragCoord.xy);
    int tx = pc.x / uPN; int ty = pc.y / uPN;
    vec3 q = uPMin + vec3(float(pc.x - tx*uPN), float(pc.y - ty*uPN), float(ty*uPTiles + tx))*uPH;
    outColor = packF(map(q));
    return;
  }
  vec2 fc = gl_FragCoord.xy + uJit;
  vec2 uv = (fc - 0.5*uRes)/uRes.y;
  vec3 rd = normalize(uv.x*uCu + uv.y*uCv + uFocal*uCw);
  vec3 ro = uRo;
  vec3 col = background(rd, uv);
  float tFloor = 1e20;
  if (uGround == 1 && rd.y < 0.0) tFloor = (uGroundY - ro.y)/rd.y;
  vec3 m = 0.01*uS*vec3(1.0);
  vec2 bh = boxHit(ro, rd, uBMin - m, uBMax + m);
  float t = -1.0;
  if (bh.x < bh.y && bh.y > 0.0) t = march(ro, rd, max(bh.x, 0.0), min(bh.y, tFloor));
  if (t > 0.0){
    vec3 p = ro + rd*t;
    col = shadeObject(p, calcNormal(p, t), rd, t);
  } else if (tFloor < 1e19){
    col = shadeFloor(ro + rd*tFloor, rd, uv);
  }
  col += (hash12(fc) - 0.5)/255.0;
  outColor = vec4(col, 1.0);
}
`;

const MESH_VERT = `#version 300 es
in vec3 aP; in vec3 aN; in vec3 aC;
uniform mat4 uMVP; out vec3 vN; out vec3 vC; out vec3 vP;
void main(){ vN = aN; vC = aC; vP = aP; gl_Position = uMVP*vec4(aP, 1.0); }`;

const MESH_FRAG = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec3 vP; uniform vec3 uEye; uniform vec3 uSunDir; uniform int uWire; uniform int uClay;
out vec4 o;
void main(){
  if (uWire == 1){ o = vec4(0.08, 0.09, 0.11, 0.55); return; }
  vec3 n = normalize(vN); vec3 v = normalize(uEye - vP);
  if (dot(n, v) < 0.0) n = -n;
  vec3 c = uClay == 1 ? vec3(0.3) : vC;
  float d = max(dot(n, uSunDir), 0.0);
  vec3 h = normalize(uSunDir + v);
  vec3 col = c*(0.25 + 0.5*(0.5 + 0.5*n.y)) + c*d*1.6 + vec3(0.25)*pow(max(dot(n, h), 0.0), 48.0);
  col = col/(1.0 + col);
  o = vec4(pow(col*1.35, vec3(1.0/2.2)), 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float; uniform vec2 uRes; uniform vec3 uBgTop, uBgBot; out vec4 o;
void main(){ vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y; vec3 c = mix(uBgBot, uBgTop, smoothstep(-0.4, 0.5, uv.y)); c *= 1.0 - 0.28*dot(uv,uv); o = vec4(c, 1.0); }`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('Shader compile failed: ' + log);
  }
  return s;
}

export function linkProgram(gl, vs, fs) {
  const p = gl.createProgram();
  const a = compileShader(gl, gl.VERTEX_SHADER, vs);
  const b = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a);
  gl.attachShader(p, b);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  gl.deleteShader(a);
  gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  const uni = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uni[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, uni };
}

export function fullscreenTriangle(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

// ---- tiny mat4 helpers (column-major) ----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, target, up) {
  const z = norm(eye.map((v, i) => v - target[i]));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function mul4(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k];
  return r;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const FOV = (32 * Math.PI) / 180;

export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.vao = fullscreenTriangle(gl);
    this.prog = null;
    this.compiled = null;
    this.view = { yaw: 32, pitch: 16, zoom: 1, panY: 0 };
    this.light = 'studio';
    this.clay = false;
    this.mode = 'sdf'; // or 'mesh'
    this.wire = false;
    this.frame = 0;
    this.maxFrames = 10;
    this.interactUntil = 0;
    this.scale = 0.5;
    this.lowFbo = null;
    this.raf = 0;
    this.onFrame = null;
    this.bgProg = linkProgram(gl, VERT, BG_FRAG);
    this.meshProg = null;
    this.mesh = null;
  }

  setCompiled(compiled) {
    const gl = this.gl;
    const prog = linkProgram(gl, VERT, FRAG_HEAD + compiled.glsl + FRAG_BODY);
    if (this.prog) gl.deleteProgram(this.prog.p);
    this.prog = prog;
    this.compiled = compiled;
    try {
      this.fit = this.probe();
    } catch {
      this.fit = null;
    }
    const sc = compiled.scene || {};
    if (sc.light && LIGHTS[sc.light]) this.light = sc.light;
    this.invalidate();
  }

  // Samples the field on a coarse grid to find where the solid really is (bounds are conservative).
  probe(N = 48) {
    const gl = this.gl;
    const b = this.compiled.bounds;
    const ext = b.max.map((v, i) => v - b.min[i]);
    const h = Math.max(...ext) / (N - 1);
    const n = ext.map((e) => Math.min(N, Math.ceil(e / h) + 1));
    const tiles = Math.ceil(Math.sqrt(n[2]));
    const W = tiles * N;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, W);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, W, W);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog.p);
    const U = this.prog.uni;
    gl.uniform1i(U.uProbe, 1);
    gl.uniform1i(U.uPN, N);
    gl.uniform1i(U.uPTiles, tiles);
    gl.uniform3fv(U.uPMin, b.min);
    gl.uniform1f(U.uPH, h);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(W * W * 4);
    gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.uniform1i(U.uProbe, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    const d = new Float32Array(px.buffer);
    const at = (i, j, k) => d[(Math.floor(k / tiles) * N + j) * W + (k % tiles) * N + i];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let floor = Infinity;
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const v = at(i, j, k);
      if (!(v < 0)) continue;
      const pt = [b.min[0] + i * h, b.min[1] + j * h, b.min[2] + k * h];
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], pt[c]);
        max[c] = Math.max(max[c], pt[c]);
      }
      // interpolate the surface crossing below this sample
      const below = j > 0 ? at(i, j - 1, k) : v;
      const y = below > 0 ? pt[1] - h * (-v / (below - v)) : pt[1] - h;
      floor = Math.min(floor, y);
    }
    if (!Number.isFinite(floor)) return null;
    return {
      min: min.map((v, c) => Math.max(b.min[c], v - h)),
      max: max.map((v, c) => Math.min(b.max[c], v + h)),
      floor: Math.max(b.min[1], floor),
    };
  }

  setMesh(mesh) {
    const gl = this.gl;
    if (!this.meshProg) this.meshProg = linkProgram(gl, MESH_VERT, MESH_FRAG);
    if (this.mesh) {
      this.mesh.bufs.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(this.mesh.vao);
    }
    if (!mesh) {
      this.mesh = null;
      return;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const attr = (loc, data, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      bufs.push(b);
    };
    const p = this.meshProg.p;
    attr(gl.getAttribLocation(p, 'aP'), mesh.positions, 3);
    attr(gl.getAttribLocation(p, 'aN'), mesh.normals, 3);
    const lc = new Float32Array(mesh.colors.length);
    for (let i = 0; i < lc.length; i++) lc[i] = srgbToLinear(mesh.colors[i]);
    attr(gl.getAttribLocation(p, 'aC'), lc, 3);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    bufs.push(ib);
    // edges for wireframe
    const tri = mesh.indices;
    const lines = new Uint32Array(tri.length * 2);
    for (let i = 0, j = 0; i < tri.length; i += 3) {
      lines[j++] = tri[i];
      lines[j++] = tri[i + 1];
      lines[j++] = tri[i + 1];
      lines[j++] = tri[i + 2];
      lines[j++] = tri[i + 2];
      lines[j++] = tri[i];
    }
    const lb = gl.createBuffer();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lb);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    bufs.push(lb);
    this.mesh = { vao, bufs, ib, lb, count: tri.length, lineCount: lines.length };
    this.invalidate();
  }

  invalidate(interactive = false) {
    this.frame = 0;
    if (interactive) this.interactUntil = performance.now() + 180;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.raf = 0;
    if (!this.prog) return;
    const now = performance.now();
    const interactive = now < this.interactUntil;
    if (this.mode === 'mesh' && this.mesh) {
      this.drawMesh();
      this.frame = this.maxFrames;
    } else if (interactive) {
      this.drawLow();
      this.frame = 0;
    } else if (this.frame < this.maxFrames) {
      this.drawAccum(this.frame);
      this.frame++;
    }
    this.onFrame?.(this.frame, this.maxFrames);
    if (interactive || this.frame < this.maxFrames) this.raf = requestAnimationFrame(() => this.tick());
  }

  camera(aspect = 1) {
    const b = this.fit || this.compiled.bounds;
    const c = b.min.map((v, i) => (v + b.max[i]) / 2);
    const size = Math.hypot(...b.max.map((v, i) => v - b.min[i]));
    const sc = this.compiled.scene || {};
    const radius = size / 2;
    const fitV = radius / Math.sin(FOV / 2);
    const fitH = radius / Math.sin(Math.atan(Math.tan(FOV / 2) * aspect));
    const dist = Math.max(fitV, fitH) * 1.0 * (sc.zoom ? 1 / sc.zoom : 1) * this.view.zoom;
    const yaw = (this.view.yaw * Math.PI) / 180;
    const pitch = (Math.max(-80, Math.min(85, this.view.pitch)) * Math.PI) / 180;
    const target = [c[0], c[1] + this.view.panY * size, c[2]];
    const eye = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    const w = norm(target.map((v, i) => v - eye[i]));
    const u = norm(cross(w, [0, 1, 0]));
    const v = cross(u, w);
    return { eye, target, u, v, w, size, dist };
  }

  setUniforms(width, height, jit) {
    const gl = this.gl;
    const U = this.prog.uni;
    const cam = this.camera(width / height);
    const L = LIGHTS[this.light] || LIGHTS.studio;
    const b = this.compiled.bounds;
    const sc = this.compiled.scene || {};
    const focal = 0.5 / Math.tan(FOV / 2);
    gl.uniform2f(U.uRes, width, height);
    gl.uniform2f(U.uJit, jit[0], jit[1]);
    gl.uniform3fv(U.uRo, cam.eye);
    gl.uniform3fv(U.uCu, cam.u);
    gl.uniform3fv(U.uCv, cam.v);
    gl.uniform3fv(U.uCw, cam.w);
    gl.uniform1f(U.uFocal, focal);
    gl.uniform1f(U.uPix, 1 / (height * focal));
    gl.uniform3fv(U.uBMin, b.min);
    gl.uniform3fv(U.uBMax, b.max);
    gl.uniform3fv(U.uTarget, cam.target);
    gl.uniform1f(U.uS, cam.size);
    gl.uniform1f(U.uStep, this.compiled.step);
    gl.uniform1i(U.uGround, sc.ground === false ? 0 : 1);
    gl.uniform1f(U.uGroundY, (this.fit ? this.fit.floor : b.min[1]) - cam.size * 0.0005);
    gl.uniform1i(U.uClay, this.clay ? 1 : 0);
    gl.uniform3fv(U.uSunDir, L.sun);
    gl.uniform3fv(U.uSunCol, L.sunCol);
    gl.uniform3fv(U.uSky, L.sky);
    gl.uniform3fv(U.uBounce, L.bounce);
    gl.uniform3fv(U.uRim, L.rim);
    const bgTop = sc.background ? hex(sc.background).map((v) => v * 0.55) : L.bgTop;
    const bgBot = sc.background ? hex(sc.background) : L.bgBot;
    gl.uniform3fv(U.uBgTop, bgTop);
    gl.uniform3fv(U.uBgBot, bgBot);
    gl.uniform1f(U.uExposure, L.exposure * (sc.exposure ?? 1));
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.invalidate();
    }
  }

  drawLow() {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const w = Math.max(1, Math.round(W * this.scale));
    const h = Math.max(1, Math.round(H * this.scale));
    if (!this.lowFbo || this.lowFbo.w !== w || this.lowFbo.h !== h) {
      if (this.lowFbo) {
        gl.deleteFramebuffer(this.lowFbo.fb);
        gl.deleteTexture(this.lowFbo.tex);
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.lowFbo = { fb, tex, w, h };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lowFbo.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog.p);
    this.setUniforms(w, h, [0, 0]);
    gl.uniform1i(this.prog.uni.uFast, 1);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.lowFbo.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawAccum(i) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog.p);
    // R2 sequence for sub-pixel jitter
    const g = 1.32471795724474602596;
    const jit = i === 0 ? [0, 0] : [((0.5 + i / g) % 1) - 0.5, ((0.5 + i / (g * g)) % 1) - 0.5];
    this.setUniforms(W, H, jit);
    gl.uniform1i(this.prog.uni.uFast, 0);
    if (i === 0) gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, 1 / (i + 1));
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  drawMesh() {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const L = LIGHTS[this.light] || LIGHTS.studio;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.bgProg.p);
    gl.uniform2f(this.bgProg.uni.uRes, W, H);
    gl.uniform3fv(this.bgProg.uni.uBgTop, L.bgTop);
    gl.uniform3fv(this.bgProg.uni.uBgBot, L.bgBot);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const cam = this.camera(W / H);
    const proj = perspective(FOV, W / H, cam.dist * 0.05, cam.dist * 10);
    const mvp = mul4(proj, lookAt(cam.eye, cam.target, [0, 1, 0]));
    const P = this.meshProg;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.uni.uMVP, false, mvp);
    gl.uniform3fv(P.uni.uEye, cam.eye);
    gl.uniform3fv(P.uni.uSunDir, L.sun);
    gl.uniform1i(P.uni.uClay, this.clay ? 1 : 0);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.mesh.vao);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.uniform1i(P.uni.uWire, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.ib);
    gl.drawElements(gl.TRIANGLES, this.mesh.count, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (this.wire) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1i(P.uni.uWire, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.lb);
      gl.drawElements(gl.LINES, this.mesh.lineCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.disable(gl.DEPTH_TEST);
  }

  // Renders a finished still at a fixed size (used for screenshots and contact sheets).
  renderStill(width, height, view, frames = 8) {
    const saved = { ...this.view };
    const c = this.canvas;
    const sw = c.width;
    const sh = c.height;
    if (view) Object.assign(this.view, view);
    c.width = width;
    c.height = height;
    if (this.mode === 'mesh' && this.mesh) this.drawMesh();
    else for (let i = 0; i < frames; i++) this.drawAccum(i);
    this.gl.finish();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d').drawImage(c, 0, 0);
    this.view = saved;
    c.width = sw;
    c.height = sh;
    this.invalidate();
    return out;
  }
}
