// Compiles a recipe node tree into GLSL: `float map(vec3 p)` for distance and
// `void mapC(vec3 p, out vec3 col, out vec3 mat)` for color + material.

import { bounds, ownColor, DEFAULT_COLOR, DEFAULT_MAT } from './dsl.js';

const HELPERS = {
  core: /* glsl */ `
float dot2(vec2 v){ return dot(v,v); }
float dot2(vec3 v){ return dot(v,v); }
float sdAABB(vec3 p, vec3 c, vec3 h){ vec3 q = abs(p - c) - h; return length(max(q, 0.0)); }
float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r; }
float sdEllipsoid(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/max(k1, 1e-9); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa - ba*h) - r; }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba,ba); float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1.0/l2;
  vec3 pa = p - a; float y = dot(pa,ba); float z = y - l2;
  vec3 xv = pa*l2 - ba*y; float x2 = dot(xv,xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdCylinder(vec3 p, float r, float h, float rr){ vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr); return min(max(d.x,d.y),0.0) + length(max(d,0.0)) - rr; }
float sdCone(vec3 p, float h, float r1, float r2){
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h); vec2 k2 = vec2(r2 - r1, 2.0*h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2*clamp(dot(k1 - q, k2)/dot2(k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s*sqrt(min(dot2(ca), dot2(cb)));
}
float sdTorus(vec3 p, float R, float r){ vec2 q = vec2(length(p.xz) - R, p.y); return length(q) - r; }
float sdOctahedron(vec3 p, float s){
  p = abs(p); float m = p.x + p.y + p.z - s; vec3 q;
  if (3.0*p.x < m) q = p.xyz; else if (3.0*p.y < m) q = p.yzx; else if (3.0*p.z < m) q = p.zxy; else return m*0.57735027;
  float k = clamp(0.5*(q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdRect(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
float sdExtrude(float d2, float z, float h, float r){ vec2 w = vec2(d2 + r, abs(z) - h + r); return min(max(w.x,w.y),0.0) + length(max(w,0.0)) - r; }
`,
  noise: /* glsl */ `
vec3 ghash(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
float gnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x);
  vec3 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
  float a = dot(ghash(i + vec3(0,0,0)), f - vec3(0,0,0));
  float b = dot(ghash(i + vec3(1,0,0)), f - vec3(1,0,0));
  float c = dot(ghash(i + vec3(0,1,0)), f - vec3(0,1,0));
  float d = dot(ghash(i + vec3(1,1,0)), f - vec3(1,1,0));
  float e = dot(ghash(i + vec3(0,0,1)), f - vec3(0,0,1));
  float g = dot(ghash(i + vec3(1,0,1)), f - vec3(1,0,1));
  float h = dot(ghash(i + vec3(0,1,1)), f - vec3(0,1,1));
  float k = dot(ghash(i + vec3(1,1,1)), f - vec3(1,1,1));
  return 1.6*mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,g,u.x), mix(h,k,u.x), u.y), u.z);
}
const mat3 FBM_ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*gnoise(p); n += a; p = FBM_ROT*p*2.03; a *= 0.5; }
  return s/n;
}
float rfbm(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; float v = 1.0 - abs(gnoise(p)); s += a*v*v; n += a; p = FBM_ROT*p*2.03; a *= 0.5; }
  return s/n - 0.5;
}
`,
};

export function f(x) {
  if (!Number.isFinite(x)) throw new Error('non-finite number in shader: ' + x);
  let s = (Math.abs(x) < 1e-7 ? 0 : x).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0');
  if (s === '-0.0') s = '0.0';
  return s;
}

const v3 = (a) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const colLit = (c) => v3(c.map(srgbToLinear));

class Gen {
  constructor(mode, shared) {
    this.mode = mode;
    this.shared = shared;
    this.lines = [];
    this.pad = '  ';
  }
  v(type, expr) {
    const name = `${type === 'float' ? 'd' : type === 'vec3' ? 'v' : 'q'}${this.shared.n++}`;
    this.lines.push(`${this.pad}${type} ${name} = ${expr};`);
    return name;
  }
  decl(type) {
    const name = `${type === 'float' ? 'd' : type === 'vec3' ? 'v' : 'q'}${this.shared.n++}`;
    this.lines.push(`${this.pad}${type} ${name};`);
    return name;
  }
  line(s) {
    this.lines.push(this.pad + s);
  }
  get color() {
    return this.mode === 'c';
  }
}

const DEF_C = colLit(DEFAULT_COLOR);
const DEF_M = v3(DEFAULT_MAT);

function prim(g, expr) {
  const d = g.v('float', expr);
  return g.color ? { d, c: DEF_C, m: DEF_M } : { d };
}

function polyFn(g, pts) {
  const key = JSON.stringify(pts);
  const sh = g.shared;
  if (sh.polys.has(key)) return sh.polys.get(key);
  const name = `sdPoly${sh.polys.size}`;
  const n = pts.length;
  const lo = [0, 1].map((i) => Math.min(...pts.map((q) => q[i])));
  const hi = [0, 1].map((i) => Math.max(...pts.map((q) => q[i])));
  const c = [0, 1].map((i) => (lo[i] + hi[i]) / 2);
  const h = [0, 1].map((i) => (hi[i] - lo[i]) / 2);
  sh.fns.push(`float ${name}(vec2 p){
  vec2 bq = abs(p - ${v2(c)}) - ${v2(h)};
  float bd = length(max(bq, 0.0));
  if (bd > ${f(Math.max(h[0], h[1]) * 0.05 + sh.kmax * 1.5)}) return bd;
  const vec2 v[${n}] = vec2[${n}](${pts.map(v2).join(', ')});
  float d = dot2(p - v[0]); float s = 1.0;
  for (int i = 0, j = ${n - 1}; i < ${n}; j = i, i++){
    vec2 e = v[j] - v[i]; vec2 w = p - v[i];
    vec2 b = w - e*clamp(dot(w,e)/dot(e,e), 0.0, 1.0);
    d = min(d, dot(b,b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x*w.y > e.y*w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s*sqrt(d);
}`);
  sh.polys.set(key, name);
  return name;
}

function tubeFn(g, pts) {
  // keep neighbouring spheres from swallowing each other (round-cone degenerate case)
  const P = [pts[0].slice()];
  for (let i = 1; i < pts.length; i++) {
    const a = P[P.length - 1];
    const b = pts[i].slice();
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < 1e-5) continue;
    const dr = b[3] - a[3];
    if (Math.abs(dr) > 0.9 * len) b[3] = a[3] + Math.sign(dr) * 0.9 * len;
    P.push(b);
  }
  if (P.length < 2) return null;
  const sh = g.shared;
  const name = `sdTube${sh.n++}`;
  const n = P.length;
  const lo = [0, 1, 2].map((i) => Math.min(...P.map((q) => q[i] - q[3])));
  const hi = [0, 1, 2].map((i) => Math.max(...P.map((q) => q[i] + q[3])));
  const bc = lo.map((v, i) => (v + hi[i]) / 2);
  const bh = lo.map((v, i) => (hi[i] - v) / 2);
  sh.fns.push(`float ${name}(vec3 p){
  float bd = sdAABB(p, ${v3(bc)}, ${v3(bh)});
  if (bd > ${f(Math.max(...bh) * 0.05 + sh.kmax * 1.5)}) return bd;
  const vec4 v[${n}] = vec4[${n}](${P.map((q) => `vec4(${f(q[0])}, ${f(q[1])}, ${f(q[2])}, ${f(q[3])})`).join(', ')});
  float d = 1e10;
  for (int i = 0; i < ${n - 1}; i++){
    vec4 a = v[i]; vec4 b = v[i + 1];
    d = min(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w));
  }
  return d;
}`);
  return name;
}

function latheFn(g, a) {
  const sh = g.shared;
  const name = `sdLathe${sh.n++}`;
  const n = a.Y.length;
  const arr = (v) => `float[${n}](${v.map(f).join(', ')})`;
  sh.fns.push(`float ${name}(vec3 p){
  const float Y[${n}] = ${arr(a.Y)};
  const float R[${n}] = ${arr(a.R)};
  const float M[${n}] = ${arr(a.M)};
  float y = clamp(p.y, Y[0], Y[${n - 1}]);
  int i = 0;
  for (int k = 0; k < ${n - 2}; k++) { if (y > Y[k + 1]) i = k + 1; }
  float h = Y[i + 1] - Y[i]; float t = (y - Y[i])/h;
  float r, dr;
  ${a.smooth
    ? `float t2 = t*t, t3 = t2*t;
  r = (2.0*t3 - 3.0*t2 + 1.0)*R[i] + (t3 - 2.0*t2 + t)*h*M[i] + (-2.0*t3 + 3.0*t2)*R[i + 1] + (t3 - t2)*h*M[i + 1];
  dr = ((6.0*t2 - 6.0*t)*R[i] + (3.0*t2 - 4.0*t + 1.0)*h*M[i] + (-6.0*t2 + 6.0*t)*R[i + 1] + (3.0*t2 - 2.0*t)*h*M[i + 1])/h;`
    : `r = mix(R[i], R[i + 1], t); dr = (R[i + 1] - R[i])/h;`}
  r = max(r, 0.0);
  vec2 w = vec2(0.7*(length(p.xz) - r)/sqrt(1.0 + dr*dr), max(Y[0] - p.y, p.y - Y[${n - 1}]));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}`);
  return name;
}

// Emits a subtree once as its own GLSL function (distance and color variants) so it can be called several times.
function subFn(g, node) {
  const sh = g.shared;
  let entry = sh.subs.get(node);
  if (!entry) {
    entry = { name: `sub${sh.n++}`, done: new Set() };
    sh.subs.set(node, entry);
  }
  if (!entry.done.has(g.mode)) {
    entry.done.add(g.mode);
    const sub = new Gen(g.mode, sh);
    const r = emit(sub, node, 'p');
    if (g.mode === 'c') sh.fns.push(`float ${entry.name}c(vec3 p, out vec3 oc, out vec3 om){\n${sub.lines.join('\n')}\n  oc = ${r.c}; om = ${r.m};\n  return ${r.d};\n}`);
    else sh.fns.push(`float ${entry.name}(vec3 p){\n${sub.lines.join('\n')}\n  return ${r.d};\n}`);
  }
  return entry.name;
}

function callSub(g, fn, p) {
  if (!g.color) return { d: g.v('float', `${fn}(${p})`) };
  const c = g.decl('vec3');
  const m = g.decl('vec3');
  return { d: g.v('float', `${fn}c(${p}, ${c}, ${m})`), c, m };
}

function lip(g, L) {
  g.shared.lip = Math.max(g.shared.lip, L);
}

function unionStep(g, a, b, k) {
  if (k <= 0) {
    const d = g.v('float', `min(${a.d}, ${b.d})`);
    if (!g.color) return { d };
    const s = g.v('bool', `${a.d} < ${b.d}`);
    return { d, c: g.v('vec3', `${s} ? ${a.c} : ${b.c}`), m: g.v('vec3', `${s} ? ${a.m} : ${b.m}`) };
  }
  const h = g.v('float', `clamp(0.5 + 0.5*(${b.d} - ${a.d})/${f(k)}, 0.0, 1.0)`);
  const d = g.v('float', `mix(${b.d}, ${a.d}, ${h}) - ${f(k)}*${h}*(1.0 - ${h})`);
  if (!g.color) return { d };
  return { d, c: g.v('vec3', `mix(${b.c}, ${a.c}, ${h})`), m: g.v('vec3', `mix(${b.m}, ${a.m}, ${h})`) };
}

// Emit a child guarded by its bounding box: skipped when it cannot change the union.
function guarded(g, child, p, accD, k) {
  const b = bounds(child);
  if (!b || !g.shared.cull || child.dim !== 3) return emit(g, child, p);
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  const h = b.max.map((v, i) => (v - b.min[i]) / 2);
  const size = Math.max(...h);
  const bd = g.v('float', `sdAABB(${p}, ${v3(c)}, ${v3(h.map((x) => x + size * 0.02 + 1e-4))})`);
  const d = g.decl('float');
  const c3 = g.color ? g.decl('vec3') : null;
  const m3 = g.color ? g.decl('vec3') : null;
  g.line(`if (${bd} > ${accD} + ${f(k + size * 0.01)}) {`);
  g.line(`  ${d} = ${bd};${g.color ? ` ${c3} = vec3(0.0); ${m3} = vec3(0.0);` : ''}`);
  g.line('} else {');
  const saved = g.pad;
  g.pad += '  ';
  const r = emit(g, child, p);
  g.line(`${d} = ${r.d};${g.color ? ` ${c3} = ${r.c}; ${m3} = ${r.m};` : ''}`);
  g.pad = saved;
  g.line('}');
  return g.color ? { d, c: c3, m: m3 } : { d };
}

function emit(g, n, p) {
  const a = n.a;
  if (n.dim === 2) return emit2(g, n, p);
  switch (n.type) {
    case 'sphere':
      return prim(g, `sdSphere(${p}, ${f(a.r)})`);
    case 'box':
      return prim(g, `sdBox(${p}, ${v3(a.b)}, ${f(a.r)})`);
    case 'ellipsoid':
      return prim(g, `sdEllipsoid(${p}, ${v3(a.r)})`);
    case 'capsule': {
      const len = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1], a.b[2] - a.a[2]);
      if (len < 1e-6 || Math.abs(a.r1 - a.r2) >= len * 0.999) {
        const big = a.r1 >= a.r2 ? a.a : a.b;
        return prim(g, `sdSphere(${p} - ${v3(big)}, ${f(Math.max(a.r1, a.r2))})`);
      }
      if (Math.abs(a.r1 - a.r2) < 1e-6) return prim(g, `sdCapsule(${p}, ${v3(a.a)}, ${v3(a.b)}, ${f(a.r1)})`);
      return prim(g, `sdRoundCone(${p}, ${v3(a.a)}, ${v3(a.b)}, ${f(a.r1)}, ${f(a.r2)})`);
    }
    case 'cylinder':
      return prim(g, `sdCylinder(${p}, ${f(a.r)}, ${f(a.h)}, ${f(a.rr)})`);
    case 'cone':
      return prim(g, `sdCone(${p}, ${f(a.h)}, ${f(a.r1)}, ${f(a.r2)})`);
    case 'torus':
      return prim(g, `sdTorus(${p}, ${f(a.R)}, ${f(a.r)})`);
    case 'octahedron':
      return prim(g, `sdOctahedron(${p}, ${f(a.s)})`);
    case 'plane':
      return prim(g, `dot(${p}, ${v3(a.n)}) - ${f(a.h)}`);
    case 'lathe':
      return prim(g, `${latheFn(g, a)}(${p})`);
    case 'tube': {
      const fn = tubeFn(g, a.pts);
      if (!fn) return prim(g, `sdSphere(${p} - ${v3(a.pts[0])}, ${f(a.pts[0][3])})`);
      return prim(g, `${fn}(${p})`);
    }
    case 'move':
      return emit(g, n.k[0], g.v('vec3', `${p} - ${v3(a.t)}`));
    case 'rotate': {
      // inverse rotation = transpose; GLSL mat3 is column-major so pass rows of m as columns of the transpose
      const m = a.m;
      const inv = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]].map(f).join(', ');
      return emit(g, n.k[0], g.v('vec3', `mat3(${inv}) * ${p}`));
    }
    case 'scale': {
      const s = a.s;
      const r = emit(g, n.k[0], g.v('vec3', `${p} / ${v3(s)}`));
      const d = g.v('float', `${r.d} * ${f(Math.min(...s))}`);
      return { ...r, d };
    }
    case 'mirror': {
      const comps = ['x', 'y', 'z'].map((c) => (a.axes.includes(c) ? `abs(${p}.${c})` : `${p}.${c}`));
      return emit(g, n.k[0], g.v('vec3', `vec3(${comps.join(', ')})`));
    }
    case 'grid': {
      // evaluate the nearest copy plus its neighbour on each repeated axis, so parts may overlap cells
      const off = a.s.map((s, i) => ((a.n[i] - 1) / 2) * s);
      const q = g.v('vec3', `${p} + ${v3(off)}`);
      const s = a.s.map((x, i) => (a.n[i] > 1 ? x : 1));
      const sv = v3(a.s.map((x, i) => (a.n[i] > 1 ? x : 0)));
      const nmax = v3(a.n.map((x) => x - 1));
      const id = g.v('vec3', `clamp(floor(${q} / ${v3(s)} + 0.5), vec3(0.0), ${nmax})`);
      const l = g.v('vec3', `${q} - ${id} * ${sv}`);
      const fn = subFn(g, n.k[0]);
      let acc = callSub(g, fn, l);
      'xyz'.split('').forEach((ax, i) => {
        if (a.n[i] < 2) return;
        const l2 = g.v('vec3', l);
        g.line(`${l2}.${ax} = ${q}.${ax} - clamp(${id}.${ax} + (${l}.${ax} >= 0.0 ? 1.0 : -1.0), 0.0, ${f(a.n[i] - 1)}) * ${f(a.s[i])};`);
        acc = unionStep(g, acc, callSub(g, fn, l2), 0);
      });
      return acc;
    }
    case 'ring': {
      // copies around Y. The part may sit at any angle: fold relative to its own angle, then evaluate
      // the nearest copy plus the neighbouring one, so parts may cross the sector boundary.
      const an = (Math.PI * 2) / a.n;
      const b = bounds(n.k[0]);
      const th = b ? Math.atan2((b.min[2] + b.max[2]) / 2, (b.min[0] + b.max[0]) / 2) : 0;
      const ang = g.v('float', `atan(${p}.z, ${p}.x) - ${f(th)}`);
      const la = g.v('float', `${ang} - floor(${ang} / ${f(an)} + 0.5) * ${f(an)}`);
      const la2 = g.v('float', `${la} - (${la} >= 0.0 ? ${f(an)} : ${f(-an)})`);
      const r = g.v('float', `length(${p}.xz)`);
      const fn = subFn(g, n.k[0]);
      const r1 = callSub(g, fn, g.v('vec3', `vec3(${r}*cos(${la} + ${f(th)}), ${p}.y, ${r}*sin(${la} + ${f(th)}))`));
      const r2 = callSub(g, fn, g.v('vec3', `vec3(${r}*cos(${la2} + ${f(th)}), ${p}.y, ${r}*sin(${la2} + ${f(th)}))`));
      return unionStep(g, r1, r2, 0);
    }
    case 'twist': {
      const b = bounds(n.k[0]);
      const R = b ? Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[2]), Math.abs(b.max[2])) : 1;
      lip(g, Math.sqrt(1 + (a.k * R) ** 2));
      const ang = g.v('float', `${f(a.k)} * ${p}.y`);
      const c = g.v('float', `cos(${ang})`);
      const s = g.v('float', `sin(${ang})`);
      return emit(g, n.k[0], g.v('vec3', `vec3(${c}*${p}.x - ${s}*${p}.z, ${p}.y, ${s}*${p}.x + ${c}*${p}.z)`));
    }
    case 'bend': {
      const b = bounds(n.k[0]);
      const R = b ? Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[1]), Math.abs(b.max[1])) : 1;
      lip(g, Math.sqrt(1 + (a.k * R) ** 2));
      const ang = g.v('float', `${f(a.k)} * ${p}.x`);
      const c = g.v('float', `cos(${ang})`);
      const s = g.v('float', `sin(${ang})`);
      return emit(g, n.k[0], g.v('vec3', `vec3(${c}*${p}.x - ${s}*${p}.y, ${s}*${p}.x + ${c}*${p}.y, ${p}.z)`));
    }
    case 'elongate':
      return emit(g, n.k[0], g.v('vec3', `${p} - clamp(${p}, ${v3(a.h.map((x) => -x))}, ${v3(a.h)})`));
    case 'round': {
      const r = emit(g, n.k[0], p);
      return { ...r, d: g.v('float', `${r.d} - ${f(a.r)}`) };
    }
    case 'shell': {
      const r = emit(g, n.k[0], p);
      return { ...r, d: g.v('float', `abs(${r.d}) - ${f(a.t / 2)}`) };
    }
    case 'displace': {
      g.shared.helpers.add('noise');
      lip(g, 1 + Math.abs(a.amp) * a.scale * 1.5);
      const r = emit(g, n.k[0], p);
      const seed = [17.31, 31.77, 11.13].map((x) => x * a.seed);
      const fn = a.ridged ? 'rfbm' : 'fbm';
      return { ...r, d: g.v('float', `${r.d} + ${f(a.amp)} * ${fn}(${p} * ${f(a.scale)} + ${v3(seed)}, ${a.oct})`) };
    }
    case 'color': {
      const r = emit(g, n.k[0], p);
      if (!g.color) return r;
      if (a.m) g.shared.materials.add(a.m.join(','));
      return { d: r.d, c: a.c ? colLit(a.c) : r.c, m: a.m ? v3(a.m) : r.m };
    }
    case 'paint': {
      const r = emit(g, n.k[0], p);
      if (!g.color) return r;
      g.mode = 'd';
      const rr = emit(g, n.k[1], p);
      g.mode = 'c';
      const t = a.soft > 0 ? `1.0 - smoothstep(${f(-a.soft)}, ${f(a.soft)}, ${rr.d})` : `step(${rr.d}, 0.0)`;
      const tv = g.v('float', t);
      if (a.m) g.shared.materials.add(a.m.join(','));
      return {
        d: r.d,
        c: g.v('vec3', `mix(${r.c}, ${colLit(a.c)}, ${tv})`),
        m: a.m ? g.v('vec3', `mix(${r.m}, ${v3(a.m)}, ${tv})`) : r.m,
      };
    }
    case 'colorNoise': {
      const r = emit(g, n.k[0], p);
      if (!g.color) return r;
      g.shared.helpers.add('noise');
      const seed = [5.1, 9.7, 3.3].map((x) => x * (a.seed + 1));
      const nz = `fbm(${p} * ${f(a.scale)} + ${v3(seed)}, ${a.veins ? 5 : 3})`;
      let t;
      if (a.veins) {
        const w = 0.14 - 0.12 * a.sharp;
        t = g.v('float', `${f(a.amount)} * (1.0 - smoothstep(0.0, ${f(w)}, abs(${nz})))`);
      } else {
        const w = 0.5 - 0.47 * a.sharp;
        t = g.v('float', `${f(a.amount)} * smoothstep(${f(-w)}, ${f(w)}, ${nz})`);
      }
      return { ...r, c: g.v('vec3', `mix(${r.c}, ${colLit(a.c)}, ${t})`) };
    }
    case 'gradient': {
      const r = emit(g, n.k[0], p);
      if (!g.color) return r;
      const t = g.v('float', `clamp((${p}.${a.axis} - ${f(a.from)}) / ${f(a.to - a.from)}, 0.0, 1.0)`);
      return { ...r, c: g.v('vec3', `mix(${r.c}, ${colLit(a.c)}, ${t}*${t}*(3.0 - 2.0*${t}))`) };
    }
    case 'union': {
      let acc = emit(g, n.k[0], p);
      for (let i = 1; i < n.k.length; i++) acc = unionStep(g, acc, guarded(g, n.k[i], p, acc.d, a.k), a.k);
      return acc;
    }
    case 'cut': {
      const r1 = emit(g, n.k[0], p);
      const r2 = guarded(g, n.k[1], p, `(-${r1.d})`, a.k);
      const k = a.k;
      let d;
      let h = null;
      if (k > 0) {
        h = g.v('float', `clamp(0.5 - 0.5*(${r1.d} + ${r2.d})/${f(k)}, 0.0, 1.0)`);
        d = g.v('float', `mix(${r1.d}, -${r2.d}, ${h}) + ${f(k)}*${h}*(1.0 - ${h})`);
      } else d = g.v('float', `max(${r1.d}, -${r2.d})`);
      if (!g.color) return { d };
      if (!a.paint) return { d, c: r1.c, m: r1.m };
      const t = h ?? g.v('float', `(-${r2.d} > ${r1.d}) ? 1.0 : 0.0`);
      return { d, c: g.v('vec3', `mix(${r1.c}, ${r2.c}, ${t})`), m: g.v('vec3', `mix(${r1.m}, ${r2.m}, ${t})`) };
    }
    case 'intersect': {
      const r1 = emit(g, n.k[0], p);
      const r2 = emit(g, n.k[1], p);
      const k = a.k;
      let d;
      let h;
      if (k > 0) {
        h = g.v('float', `clamp(0.5 - 0.5*(${r2.d} - ${r1.d})/${f(k)}, 0.0, 1.0)`);
        d = g.v('float', `mix(${r2.d}, ${r1.d}, ${h}) + ${f(k)}*${h}*(1.0 - ${h})`);
      } else {
        d = g.v('float', `max(${r1.d}, ${r2.d})`);
        h = `(${r1.d} > ${r2.d} ? 1.0 : 0.0)`;
      }
      if (!g.color) return { d };
      if (!ownColor(n.k[1])) return { d, c: r1.c, m: r1.m };
      return { d, c: g.v('vec3', `mix(${r2.c}, ${r1.c}, ${h})`), m: g.v('vec3', `mix(${r2.m}, ${r1.m}, ${h})`) };
    }
    case 'extrude': {
      const q = g.v('vec2', `${p}.xy`);
      const r = emit2(g, n.k[0], q);
      return prim(g, `sdExtrude(${r.d}, ${p}.z, ${f(a.h)}, ${f(Math.min(a.r, a.h))})`);
    }
    case 'revolve': {
      const q = g.v('vec2', `vec2(length(${p}.xz) - ${f(a.o)}, ${p}.y)`);
      const r = emit2(g, n.k[0], q);
      return prim(g, r.d);
    }
    default:
      throw new Error(`cannot compile ${n.type} as a 3D shape`);
  }
}

function emit2(g, n, p) {
  const a = n.a;
  switch (n.type) {
    case 'circle':
      return { d: g.v('float', `sdCircle(${p}, ${f(a.r)})`) };
    case 'rect':
      return { d: g.v('float', `sdRect(${p}, ${v2(a.b)}, ${f(a.r)})`) };
    case 'polygon':
      return { d: g.v('float', `${polyFn(g, a.pts)}(${p})`) };
    case 'move2':
      return emit2(g, n.k[0], g.v('vec2', `${p} - ${v2(a.t)}`));
    case 'rot2': {
      const t = (-a.deg * Math.PI) / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      return emit2(g, n.k[0], g.v('vec2', `mat2(${f(c)}, ${f(s)}, ${f(-s)}, ${f(c)}) * ${p}`));
    }
    case 'scale2': {
      const r = emit2(g, n.k[0], g.v('vec2', `${p} / ${f(a.s)}`));
      return { d: g.v('float', `${r.d} * ${f(a.s)}`) };
    }
    case 'round': {
      const r = emit2(g, n.k[0], p);
      return { d: g.v('float', `${r.d} - ${f(a.r)}`) };
    }
    case 'shell': {
      const r = emit2(g, n.k[0], p);
      return { d: g.v('float', `abs(${r.d}) - ${f(a.t / 2)}`) };
    }
    case 'union': {
      const saved = g.mode;
      g.mode = 'd';
      let acc = emit2(g, n.k[0], p);
      for (let i = 1; i < n.k.length; i++) acc = unionStep(g, acc, emit2(g, n.k[i], p), a.k);
      g.mode = saved;
      return { d: acc.d };
    }
    case 'cut': {
      const r1 = emit2(g, n.k[0], p);
      const r2 = emit2(g, n.k[1], p);
      if (a.k > 0) {
        const h = g.v('float', `clamp(0.5 - 0.5*(${r1.d} + ${r2.d})/${f(a.k)}, 0.0, 1.0)`);
        return { d: g.v('float', `mix(${r1.d}, -${r2.d}, ${h}) + ${f(a.k)}*${h}*(1.0 - ${h})`) };
      }
      return { d: g.v('float', `max(${r1.d}, -${r2.d})`) };
    }
    case 'intersect': {
      const r1 = emit2(g, n.k[0], p);
      const r2 = emit2(g, n.k[1], p);
      if (a.k > 0) {
        const h = g.v('float', `clamp(0.5 - 0.5*(${r2.d} - ${r1.d})/${f(a.k)}, 0.0, 1.0)`);
        return { d: g.v('float', `mix(${r2.d}, ${r1.d}, ${h}) + ${f(a.k)}*${h}*(1.0 - ${h})`) };
      }
      return { d: g.v('float', `max(${r1.d}, ${r2.d})`) };
    }
    default:
      throw new Error(`cannot use ${n.type} inside a 2D shape`);
  }
}

// Compiles a recipe result into GLSL source plus the numbers the renderers need.
export function compile(result, { cull = true } = {}) {
  const { node, scene } = result;
  // the largest blend radius: early-outs inside primitives must stay outside every blend zone
  let kmax = 0;
  const walk = (n) => {
    if ((n.type === 'union' || n.type === 'cut' || n.type === 'intersect') && n.a.k) kmax = Math.max(kmax, n.a.k);
    n.k.forEach(walk);
  };
  walk(node);
  const shared = { kmax, n: 0, helpers: new Set(['core']), fns: [], polys: new Map(), subs: new Map(), lip: 1, materials: new Set([DEFAULT_MAT.join(',')]), cull };
  const gd = new Gen('d', shared);
  const rd = emit(gd, node, 'p');
  const gc = new Gen('c', shared);
  const rc = emit(gc, node, 'p');

  let b = bounds(node);
  if (scene.bounds) {
    const sb = scene.bounds;
    b = { min: sb[0].slice(), max: sb[1].slice() };
  }
  if (!b || b.min.some((v) => !Number.isFinite(v)) || b.max.some((v) => !Number.isFinite(v))) {
    b = { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] };
  }
  // guard against flat or huge boxes
  b = { min: b.min.map((v) => Math.max(v, -50)), max: b.max.map((v) => Math.min(v, 50)) };
  for (let i = 0; i < 3; i++) if (b.max[i] - b.min[i] < 1e-3) {
    b.min[i] -= 0.01;
    b.max[i] += 0.01;
  }

  const step = scene.step ?? Math.max(0.3, Math.min(1, 0.95 / shared.lip));
  const glsl = [
    ...[...shared.helpers].map((h) => HELPERS[h]),
    ...shared.fns,
    `float map(vec3 p){\n${gd.lines.join('\n')}\n  return ${rd.d};\n}`,
    `void mapC(vec3 p, out vec3 col, out vec3 mat){\n${gc.lines.join('\n')}\n  col = ${rc.c}; mat = ${rc.m};\n}`,
  ].join('\n');

  return {
    glsl,
    bounds: b,
    step,
    scene,
    materials: [...shared.materials].map((s) => s.split(',').map(Number)),
    lines: gd.lines.length + gc.lines.length,
  };
}
