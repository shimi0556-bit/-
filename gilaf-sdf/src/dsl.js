// Gilaf recipe language: a tree of SDF nodes built with a small chainable API.
// A recipe is the body of a JavaScript function that returns a 3D node.

export const DEFAULT_COLOR = [0.80, 0.77, 0.72]; // sRGB 0..1
export const DEFAULT_MAT = [0.55, 0, 0]; // rough, metal, glow

export const MATERIALS = {
  matte: { rough: 0.9, metal: 0, glow: 0 },
  clay: { rough: 0.7, metal: 0, glow: 0 },
  satin: { rough: 0.5, metal: 0, glow: 0 },
  plastic: { rough: 0.32, metal: 0, glow: 0 },
  glossy: { rough: 0.14, metal: 0, glow: 0 },
  metal: { rough: 0.3, metal: 1, glow: 0 },
  brushed: { rough: 0.45, metal: 1, glow: 0 },
  chrome: { rough: 0.07, metal: 1, glow: 0 },
  glow: { rough: 0.5, metal: 0, glow: 1 },
};

export class RecipeError extends Error {}

function fail(msg) {
  throw new RecipeError(msg);
}

function num(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number (got ${JSON.stringify(v)})`);
  return v;
}

function pos(v, what) {
  num(v, what);
  if (v <= 0) fail(`${what} must be greater than 0 (got ${v})`);
  return v;
}

// Accepts (x, y, z), ([x, y, z]) or a single number for all three.
function vec3(args, what, fill) {
  let a = args;
  if (a.length === 1 && Array.isArray(a[0])) a = a[0];
  if (a.length === 1 && typeof a[0] === 'number' && fill === 'all') a = [a[0], a[0], a[0]];
  const out = [a[0] ?? fill ?? 0, a[1] ?? fill ?? 0, a[2] ?? fill ?? 0];
  out.forEach((v, i) => num(v, `${what}[${i}]`));
  return out;
}

function vec2(args, what) {
  let a = args;
  if (a.length === 1 && Array.isArray(a[0])) a = a[0];
  const out = [a[0] ?? 0, a[1] ?? 0];
  out.forEach((v, i) => num(v, `${what}[${i}]`));
  return out;
}

export function parseColor(c, what = 'color') {
  if (Array.isArray(c) && c.length >= 3) {
    const out = c.slice(0, 3).map(Number);
    out.forEach((v) => num(v, what));
    return out.map((v) => (v > 1 ? v / 255 : v));
  }
  if (typeof c === 'string') {
    let h = c.trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    }
  }
  fail(`${what}: use a hex color like '#e0a040' (got ${JSON.stringify(c)})`);
}

function parseMat(opts) {
  if (opts == null) return null;
  let o = opts;
  if (typeof o === 'string') {
    if (!MATERIALS[o]) fail(`unknown material '${o}'. Use one of: ${Object.keys(MATERIALS).join(', ')}`);
    o = MATERIALS[o];
  }
  if (typeof o !== 'object') fail('material must be a preset name or {rough, metal, glow}');
  const base = o.preset ? MATERIALS[o.preset] : null;
  const rough = o.rough ?? base?.rough ?? DEFAULT_MAT[0];
  const metal = o.metal ?? base?.metal ?? DEFAULT_MAT[1];
  const glow = o.glow ?? base?.glow ?? DEFAULT_MAT[2];
  return [clamp01(num(rough, 'rough')), clamp01(num(metal, 'metal')), Math.max(0, num(glow, 'glow'))];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function asNode(n, what) {
  if (!(n instanceof Node)) fail(`${what} must be a shape (got ${n === undefined ? 'undefined' : typeof n})`);
  return n;
}

// Rotation matrix (row-major) for Euler angles in degrees, applied X then Y then Z.
export function rotMatrix(rx, ry, rz) {
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 180);
  const X = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
  const Y = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)];
  const Z = [Math.cos(c), -Math.sin(c), 0, Math.sin(c), Math.cos(c), 0, 0, 0, 1];
  return mul3(Z, mul3(Y, X));
}

function mul3(A, B) {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return r;
}

export class Node {
  constructor(type, a = {}, kids = [], dim = 3) {
    this.type = type;
    this.a = a;
    this.k = kids;
    this.dim = dim;
  }

  _wrap(type, a) {
    return new Node(type, a, [this], this.dim);
  }

  _need3(op) {
    if (this.dim !== 3) fail(`.${op}() works on 3D shapes. Turn a 2D shape into 3D first with .extrude() or .revolve()`);
  }

  _need2(op) {
    if (this.dim !== 2) fail(`.${op}() works on 2D shapes (circle, rect, polygon, ngon, star)`);
  }

  // ---- transforms ----
  move(...args) {
    if (this.dim === 2) return this._wrap('move2', { t: vec2(args, 'move') });
    return this._wrap('move', { t: vec3(args, 'move') });
  }
  at(...args) {
    return this.move(...args);
  }
  rotate(...args) {
    if (this.dim === 2) {
      const deg = num(Array.isArray(args[0]) ? args[0][0] : args[0], 'rotate angle');
      return this._wrap('rot2', { deg });
    }
    const [x, y, z] = vec3(args, 'rotate');
    if (x === 0 && y === 0 && z === 0) return this;
    return this._wrap('rotate', { m: rotMatrix(x, y, z) });
  }
  rotateX(d) {
    return this.rotate(num(d, 'rotateX'), 0, 0);
  }
  rotateY(d) {
    return this.rotate(0, num(d, 'rotateY'), 0);
  }
  rotateZ(d) {
    return this.rotate(0, 0, num(d, 'rotateZ'));
  }
  // Point the shape's +Y axis along a direction vector.
  orient(...args) {
    this._need3('orient');
    const d = vec3(args, 'orient');
    const L = Math.hypot(...d);
    if (L === 0) fail('orient() needs a non-zero direction');
    const [x, y, z] = d.map((v) => v / L);
    // rotation taking +Y to (x,y,z): axis = Y x d
    const ax = [z, 0, -x];
    const s = Math.hypot(...ax);
    const c = y;
    if (s < 1e-9) return c > 0 ? this : this.rotate(180, 0, 0);
    const [ux, uy, uz] = ax.map((v) => v / s);
    const t = 1 - c;
    const m = [
      t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy,
      t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux,
      t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c,
    ];
    return this._wrap('rotate', { m });
  }
  scale(...args) {
    if (this.dim === 2) {
      const s = pos(Array.isArray(args[0]) ? args[0][0] : args[0], 'scale');
      return this._wrap('scale2', { s });
    }
    const s = vec3(args, 'scale', 'all');
    s.forEach((v) => pos(v, 'scale'));
    return this._wrap('scale', { s });
  }
  mirror(axes = 'x') {
    this._need3('mirror');
    if (typeof axes !== 'string' || !/^[xyz]+$/.test(axes)) fail("mirror() takes axes like 'x', 'z' or 'xz'");
    return this._wrap('mirror', { axes: [...new Set(axes)].join('') });
  }
  grid(spacing, count) {
    this._need3('grid');
    const s = vec3([spacing], 'grid spacing', 'all');
    const n = vec3([count], 'grid count', 'all').map((v) => Math.max(1, Math.round(v)));
    return this._wrap('grid', { s, n });
  }
  ring(n) {
    this._need3('ring');
    const c = Math.round(num(n, 'ring count'));
    if (c < 2) fail('ring() needs at least 2 copies');
    return this._wrap('ring', { n: c });
  }
  twist(k) {
    this._need3('twist');
    return this._wrap('twist', { k: num(k, 'twist') });
  }
  bend(k) {
    this._need3('bend');
    return this._wrap('bend', { k: num(k, 'bend') });
  }
  elongate(...args) {
    this._need3('elongate');
    const h = vec3(args, 'elongate').map((v) => Math.abs(v) / 2);
    return this._wrap('elongate', { h });
  }

  // ---- surface modifiers ----
  round(r) {
    return this._wrap('round', { r: num(r, 'round') });
  }
  shell(t) {
    return this._wrap('shell', { t: pos(t, 'shell thickness') });
  }
  displace(amp, scale = 4, opts = {}) {
    this._need3('displace');
    const o = typeof opts === 'number' ? { octaves: opts } : opts;
    return this._wrap('displace', {
      amp: num(amp, 'displace amount'),
      scale: pos(scale, 'displace scale'),
      oct: Math.max(1, Math.min(8, Math.round(o.octaves ?? 4))),
      ridged: !!o.ridged,
      seed: num(o.seed ?? 0, 'displace seed'),
    });
  }

  // ---- booleans ----
  add(other, k = 0) {
    return combine('union', num(k, 'add smoothness'), [this, asNode(other, 'add()')]);
  }
  cut(other, k = 0, opts = {}) {
    const o = asNode(other, 'cut()');
    if (o.dim !== this.dim) fail('cut(): both shapes must be 3D (or both 2D)');
    const paint = opts.paint ?? ownColor(o);
    return new Node('cut', { k: Math.abs(num(k, 'cut smoothness')), paint }, [this, o], this.dim);
  }
  intersect(other, k = 0) {
    const o = asNode(other, 'intersect()');
    if (o.dim !== this.dim) fail('intersect(): both shapes must be 3D (or both 2D)');
    return new Node('intersect', { k: Math.abs(num(k, 'intersect smoothness')) }, [this, o], this.dim);
  }

  // ---- appearance ----
  color(c, mat) {
    this._need3('color');
    return this._wrap('color', { c: parseColor(c), m: parseMat(mat) });
  }
  material(mat) {
    this._need3('material');
    return this._wrap('color', { c: null, m: parseMat(mat) });
  }
  paint(region, c, soft = 0, mat) {
    this._need3('paint');
    const r = asNode(region, 'paint() region');
    if (r.dim !== 3) fail('paint() region must be a 3D shape');
    return new Node('paint', { c: parseColor(c), soft: Math.abs(num(soft, 'paint softness')), m: parseMat(mat) }, [this, r]);
  }
  colorNoise(c, scale = 6, amount = 1, opts = {}) {
    this._need3('colorNoise');
    return this._wrap('colorNoise', {
      c: parseColor(c),
      scale: pos(scale, 'colorNoise scale'),
      amount: clamp01(num(amount, 'colorNoise amount')),
      sharp: clamp01(num(opts.sharp ?? 0.5, 'colorNoise sharp')),
      seed: num(opts.seed ?? 0, 'colorNoise seed'),
      veins: !!opts.veins,
    });
  }
  gradient(c, axis = 'y', from = 0, to = 1) {
    this._need3('gradient');
    if (!'xyz'.includes(axis) || axis.length !== 1) fail("gradient() axis must be 'x', 'y' or 'z'");
    if (from === to) fail('gradient(): from and to must differ');
    return this._wrap('gradient', { c: parseColor(c), axis, from: num(from, 'gradient from'), to: num(to, 'gradient to') });
  }

  // ---- 2D → 3D ----
  extrude(depth, round = 0) {
    this._need2('extrude');
    return new Node('extrude', { h: pos(depth, 'extrude depth') / 2, r: Math.abs(num(round, 'extrude round')) }, [this], 3);
  }
  revolve(offset = 0) {
    this._need2('revolve');
    return new Node('revolve', { o: num(offset, 'revolve offset') }, [this], 3);
  }
}

// True when a shape's appearance is set at its top (looking through transforms and repeats).
const PASS = new Set(['move', 'rotate', 'scale', 'mirror', 'grid', 'ring', 'twist', 'bend', 'elongate', 'round', 'shell', 'displace']);
export function ownColor(n) {
  let x = n;
  while (PASS.has(x.type)) x = x.k[0];
  return x.type === 'color' || x.type === 'paint' || x.type === 'colorNoise' || x.type === 'gradient';
}

function combine(type, k, nodes) {
  const flat = [];
  for (const n of nodes) {
    asNode(n, 'union/blend part');
    if (n.type === 'union' && n.a.k === k) flat.push(...n.k);
    else flat.push(n);
  }
  const dim = flat[0].dim;
  if (flat.some((n) => n.dim !== dim)) fail('cannot combine 2D and 3D shapes in one union');
  if (flat.length === 1) return flat[0];
  return new Node('union', { k: Math.abs(k) }, flat, dim);
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return p1.map((_, i) =>
    0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3),
  );
}

function smoothPoints(pts, steps, closed) {
  const n = pts.length;
  if (n < 3 || steps <= 1) return pts.slice();
  const out = [];
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    for (let s = 0; s < steps; s++) out.push(catmull(get(i - 1), get(i), get(i + 1), get(i + 2), s / steps));
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Seeded random numbers so scattered details stay the same on every run.
export function makeRand(seed = 1) {
  let s = (Math.floor(num(seed, 'rand seed')) >>> 0) || 1;
  const f = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// Builds the API object a recipe sees. `params` holds slider values by name.
export function createApi(params = {}) {
  const state = { scene: {}, params: [] };

  const api = {
    // 3D primitives
    sphere: (r = 0.5) => new Node('sphere', { r: pos(r, 'sphere radius') }),
    box: (w = 1, h = w, d = w, round = 0) => {
      const s = [pos(w, 'box width'), pos(h, 'box height'), pos(d, 'box depth')];
      const r = Math.min(Math.abs(num(round, 'box round')), Math.min(...s) / 2);
      return new Node('box', { b: s.map((v) => v / 2), r });
    },
    ellipsoid: (rx = 0.5, ry = rx, rz = rx) =>
      new Node('ellipsoid', { r: [pos(rx, 'ellipsoid rx'), pos(ry, 'ellipsoid ry'), pos(rz, 'ellipsoid rz')] }),
    capsule: (a, b, r1 = 0.1, r2 = r1) => {
      const A = vec3([a], 'capsule start');
      const B = vec3([b], 'capsule end');
      pos(r1, 'capsule radius');
      pos(r2, 'capsule end radius');
      return new Node('capsule', { a: A, b: B, r1, r2 });
    },
    cylinder: (r = 0.5, h = 1, round = 0) => {
      pos(r, 'cylinder radius');
      pos(h, 'cylinder height');
      const rr = Math.min(Math.abs(num(round, 'cylinder round')), r, h / 2);
      return new Node('cylinder', { r, h: h / 2, rr });
    },
    cone: (r1 = 0.5, r2 = 0, h = 1) => {
      num(r1, 'cone bottom radius');
      num(r2, 'cone top radius');
      if (r1 < 0 || r2 < 0 || r1 + r2 <= 0) fail('cone() radii must be >= 0 and not both 0');
      return new Node('cone', { r1, r2, h: pos(h, 'cone height') / 2 });
    },
    torus: (R = 0.5, r = 0.15) => new Node('torus', { R: pos(R, 'torus radius'), r: pos(r, 'torus thickness') }),
    octahedron: (s = 0.5) => new Node('octahedron', { s: pos(s, 'octahedron size') }),
    halfspace: (axis = 'y', offset = 0) => {
      const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] }[axis];
      if (!n) fail("halfspace() axis must be 'x','y','z','-x','-y' or '-z'");
      return new Node('plane', { n, h: num(offset, 'halfspace offset') * (axis[0] === '-' ? -1 : 1) });
    },
    tube: (points, opts = {}) => {
      if (!Array.isArray(points) || points.length < 2) fail('tube() needs an array of at least 2 points [x,y,z,radius]');
      const o = typeof opts === 'number' ? { radius: opts } : opts;
      const pts = points.map((p, i) => {
        if (!Array.isArray(p) || p.length < 3) fail(`tube point ${i} must be [x, y, z] or [x, y, z, radius]`);
        const r = p[3] ?? o.radius ?? 0.05;
        return [num(p[0], 'tube x'), num(p[1], 'tube y'), num(p[2], 'tube z'), pos(r, 'tube radius')];
      });
      const steps = Math.max(1, Math.min(16, Math.round(o.smooth ?? 6)));
      const sm = smoothPoints(pts, steps, !!o.closed);
      if (o.closed) sm.push(sm[0]);
      if (sm.length > 400) fail('tube() is too long; use fewer points or a lower smooth value');
      return new Node('tube', { pts: sm.map((p) => [p[0], p[1], p[2], Math.max(1e-4, p[3])]) });
    },

    // 2D shapes (for extrude / revolve)
    circle: (r = 0.5) => new Node('circle', { r: pos(r, 'circle radius') }, [], 2),
    rect: (w = 1, h = w, round = 0) => {
      const b = [pos(w, 'rect width') / 2, pos(h, 'rect height') / 2];
      return new Node('rect', { b, r: Math.min(Math.abs(num(round, 'rect round')), b[0], b[1]) }, [], 2);
    },
    polygon: (points, opts = {}) => {
      if (!Array.isArray(points) || points.length < 3) fail('polygon() needs at least 3 points [x, y]');
      const pts = points.map((p, i) => {
        if (!Array.isArray(p) || p.length < 2) fail(`polygon point ${i} must be [x, y]`);
        return [num(p[0], 'polygon x'), num(p[1], 'polygon y')];
      });
      const o = typeof opts === 'number' ? { smooth: opts } : opts;
      const steps = Math.max(1, Math.min(16, Math.round(o.smooth ?? 1)));
      const sm = smoothPoints(pts, steps, true);
      if (sm.length > 256) fail('polygon() has too many points after smoothing (max 256)');
      return new Node('polygon', { pts: sm }, [], 2);
    },
    // Solid of revolution from an outline of [radius, height] points, bottom to top.
    // Heights must increase; the outline is interpolated with a smooth cubic curve.
    lathe: (points, opts = {}) => {
      if (!Array.isArray(points) || points.length < 2) fail('lathe() needs at least 2 points [radius, height]');
      const pts = points.map((p, i) => {
        if (!Array.isArray(p) || p.length < 2) fail(`lathe point ${i} must be [radius, height]`);
        return [Math.max(0, num(p[0], 'lathe radius')), num(p[1], 'lathe height')];
      });
      if (pts.length > 64) fail('lathe() takes at most 64 points');
      for (let i = 1; i < pts.length; i++) {
        if (!(pts[i][1] > pts[i - 1][1])) fail(`lathe() heights must go up from point to point (point ${i} has height ${pts[i][1]}). For outlines that fold back, use polygon(...).revolve()`);
      }
      const o = typeof opts === 'number' ? { smooth: opts } : opts;
      const Y = pts.map((p) => p[1]);
      const R = pts.map((p) => p[0]);
      const n = pts.length;
      const smooth = o.smooth !== 0 && o.smooth !== false;
      const M = R.map((_, i) => {
        if (!smooth) return 0;
        const a = Math.max(0, i - 1);
        const b = Math.min(n - 1, i + 1);
        return (R[b] - R[a]) / (Y[b] - Y[a]);
      });
      return new Node('lathe', { Y, R, M, smooth });
    },
    ngon: (n = 6, r = 0.5) => {
      const c = Math.round(num(n, 'ngon sides'));
      if (c < 3) fail('ngon() needs at least 3 sides');
      pos(r, 'ngon radius');
      const pts = [];
      for (let i = 0; i < c; i++) {
        const t = (i / c) * Math.PI * 2 + Math.PI / 2;
        pts.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      return new Node('polygon', { pts }, [], 2);
    },
    star: (n = 5, r1 = 0.5, r2 = 0.25) => {
      const c = Math.round(num(n, 'star points'));
      if (c < 2) fail('star() needs at least 2 points');
      pos(r1, 'star outer radius');
      pos(r2, 'star inner radius');
      const pts = [];
      for (let i = 0; i < c * 2; i++) {
        const t = (i / (c * 2)) * Math.PI * 2 + Math.PI / 2;
        const r = i % 2 ? r2 : r1;
        pts.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      return new Node('polygon', { pts }, [], 2);
    },

    // combining
    union: (...nodes) => combine('union', 0, nodes.flat()),
    blend: (k, ...nodes) => combine('union', num(k, 'blend smoothness'), nodes.flat()),
    group: (...nodes) => combine('union', 0, nodes.flat()),

    // scene & parameters
    scene: (opts = {}) => {
      if (typeof opts !== 'object') fail('scene() takes an options object');
      Object.assign(state.scene, opts);
    },
    param: (name, def, min, max, step) => {
      if (typeof name !== 'string' || !name) fail('param() needs a name');
      num(def, `param ${name} default`);
      const lo = min ?? Math.min(0, def);
      const hi = max ?? (def === 0 ? 1 : Math.abs(def) * 2);
      const st = step ?? (hi - lo) / 100;
      if (!state.params.find((p) => p.name === name)) state.params.push({ name, def, min: lo, max: hi, step: st });
      const v = params[name];
      return typeof v === 'number' && Number.isFinite(v) ? v : def;
    },

    // helpers
    rand: (seed) => makeRand(seed),
    range: (n) => Array.from({ length: Math.max(0, Math.floor(num(n, 'range'))) }, (_, i) => i),
    lerp: (a, b, t) => a + (b - a) * t,
    mix: (a, b, t) => a + (b - a) * t,
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    rad: (d) => (d * Math.PI) / 180,
    PI: Math.PI,
    TAU: Math.PI * 2,
    MATERIALS,
  };
  return { api, state };
}

// ---------- bounds (axis-aligned boxes; null = unbounded) ----------

function boxOf(min, max) {
  return { min, max };
}

function unionBox(a, b) {
  if (!a || !b) return null;
  return boxOf(a.min.map((v, i) => Math.min(v, b.min[i])), a.max.map((v, i) => Math.max(v, b.max[i])));
}

function expand(b, e) {
  if (!b) return null;
  return boxOf(b.min.map((v) => v - e), b.max.map((v) => v + e));
}

function corners(b) {
  const out = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
  return out;
}

function fromPoints(pts) {
  const d = pts[0].length;
  const min = new Array(d).fill(Infinity);
  const max = new Array(d).fill(-Infinity);
  for (const p of pts) for (let i = 0; i < d; i++) {
    min[i] = Math.min(min[i], p[i]);
    max[i] = Math.max(max[i], p[i]);
  }
  return boxOf(min, max);
}

export function hermite(a, i, h, t) {
  if (!a.smooth) return a.R[i] + (a.R[i + 1] - a.R[i]) * t;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.R[i] + (t3 - 2 * t2 + t) * h * a.M[i] + (-2 * t3 + 3 * t2) * a.R[i + 1] + (t3 - t2) * h * a.M[i + 1];
}

const cache = new WeakMap();

export function bounds(n) {
  if (cache.has(n)) return cache.get(n);
  const b = computeBounds(n);
  cache.set(n, b);
  return b;
}

function computeBounds(n) {
  const a = n.a;
  const kid = () => bounds(n.k[0]);
  switch (n.type) {
    case 'sphere':
      return boxOf([-a.r, -a.r, -a.r], [a.r, a.r, a.r]);
    case 'box':
      return boxOf(a.b.map((v) => -v), a.b.slice());
    case 'ellipsoid':
      return boxOf(a.r.map((v) => -v), a.r.slice());
    case 'capsule':
      return boxOf([0, 1, 2].map((i) => Math.min(a.a[i] - a.r1, a.b[i] - a.r2)), [0, 1, 2].map((i) => Math.max(a.a[i] + a.r1, a.b[i] + a.r2)));
    case 'cylinder':
      return boxOf([-a.r, -a.h, -a.r], [a.r, a.h, a.r]);
    case 'cone': {
      const r = Math.max(a.r1, a.r2);
      return boxOf([-r, -a.h, -r], [r, a.h, r]);
    }
    case 'torus':
      return boxOf([-(a.R + a.r), -a.r, -(a.R + a.r)], [a.R + a.r, a.r, a.R + a.r]);
    case 'octahedron':
      return boxOf([-a.s, -a.s, -a.s], [a.s, a.s, a.s]);
    case 'plane':
      return null;
    case 'lathe': {
      let rmax = 0;
      for (let i = 0; i < a.Y.length - 1; i++) {
        const h = a.Y[i + 1] - a.Y[i];
        for (let k = 0; k <= 16; k++) rmax = Math.max(rmax, hermite(a, i, h, k / 16));
      }
      return boxOf([-rmax, a.Y[0], -rmax], [rmax, a.Y[a.Y.length - 1], rmax]);
    }
    case 'tube':
      return fromPoints(a.pts.flatMap((p) => [[p[0] - p[3], p[1] - p[3], p[2] - p[3]], [p[0] + p[3], p[1] + p[3], p[2] + p[3]]]));
    case 'circle':
      return boxOf([-a.r, -a.r], [a.r, a.r]);
    case 'rect':
      return boxOf([-a.b[0], -a.b[1]], [a.b[0], a.b[1]]);
    case 'polygon':
      return fromPoints(a.pts);
    case 'move': {
      const b = kid();
      return b && boxOf(b.min.map((v, i) => v + a.t[i]), b.max.map((v, i) => v + a.t[i]));
    }
    case 'move2': {
      const b = kid();
      return b && boxOf(b.min.map((v, i) => v + a.t[i]), b.max.map((v, i) => v + a.t[i]));
    }
    case 'rotate': {
      const b = kid();
      if (!b) return null;
      const m = a.m;
      return fromPoints(corners(b).map((p) => [0, 1, 2].map((r) => m[r * 3] * p[0] + m[r * 3 + 1] * p[1] + m[r * 3 + 2] * p[2])));
    }
    case 'rot2': {
      const b = kid();
      if (!b) return null;
      const R = Math.max(...[b.min, b.max].flatMap((x) => [Math.hypot(x[0], b.min[1]), Math.hypot(x[0], b.max[1])]));
      return boxOf([-R, -R], [R, R]);
    }
    case 'scale': {
      const b = kid();
      return b && boxOf(b.min.map((v, i) => v * a.s[i]), b.max.map((v, i) => v * a.s[i]));
    }
    case 'scale2': {
      const b = kid();
      return b && boxOf(b.min.map((v) => v * a.s), b.max.map((v) => v * a.s));
    }
    case 'mirror': {
      const b = kid();
      if (!b) return null;
      const min = b.min.slice();
      const max = b.max.slice();
      for (const ax of a.axes) {
        const i = 'xyz'.indexOf(ax);
        const M = Math.max(Math.abs(b.min[i]), Math.abs(b.max[i]));
        min[i] = -M;
        max[i] = M;
      }
      return boxOf(min, max);
    }
    case 'grid': {
      const b = kid();
      if (!b) return null;
      const e = a.s.map((s, i) => ((a.n[i] - 1) / 2) * s);
      return boxOf(b.min.map((v, i) => v - e[i]), b.max.map((v, i) => v + e[i]));
    }
    case 'ring': {
      const b = kid();
      if (!b) return null;
      const R = Math.max(...corners(b).map((p) => Math.hypot(p[0], p[2])));
      return boxOf([-R, b.min[1], -R], [R, b.max[1], R]);
    }
    case 'twist': {
      const b = kid();
      if (!b) return null;
      const R = Math.max(...corners(b).map((p) => Math.hypot(p[0], p[2])));
      return boxOf([-R, b.min[1], -R], [R, b.max[1], R]);
    }
    case 'bend': {
      const b = kid();
      if (!b) return null;
      const R = Math.max(...corners(b).map((p) => Math.hypot(p[0], p[1])));
      return boxOf([-R, -R, b.min[2]], [R, R, b.max[2]]);
    }
    case 'elongate': {
      const b = kid();
      return b && boxOf(b.min.map((v, i) => v - a.h[i]), b.max.map((v, i) => v + a.h[i]));
    }
    case 'round':
      return a.r > 0 ? expand(kid(), a.r) : kid();
    case 'shell':
      return expand(kid(), a.t / 2);
    case 'displace':
      return expand(kid(), Math.abs(a.amp) * 1.4);
    case 'color':
    case 'colorNoise':
    case 'gradient':
    case 'paint':
      return bounds(n.k[0]);
    case 'union': {
      let b = bounds(n.k[0]);
      for (let i = 1; i < n.k.length; i++) b = unionBox(b, bounds(n.k[i]));
      return expand(b, (a.k * (n.k.length - 1)) / 4);
    }
    case 'cut':
      return bounds(n.k[0]);
    case 'intersect': {
      const b0 = bounds(n.k[0]);
      const b1 = bounds(n.k[1]);
      if (!b0) return b1;
      if (!b1) return b0;
      const min = b0.min.map((v, i) => Math.max(v, b1.min[i]));
      const max = b0.max.map((v, i) => Math.min(v, b1.max[i]));
      return boxOf(min, max.map((v, i) => Math.max(v, min[i])));
    }
    case 'extrude': {
      const b = kid();
      return b && boxOf([b.min[0], b.min[1], -a.h], [b.max[0], b.max[1], a.h]);
    }
    case 'revolve': {
      const b = kid();
      if (!b) return null;
      const R = Math.max(0, a.o + Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])));
      return boxOf([-R, b.min[1], -R], [R, b.max[1], R]);
    }
    default:
      throw new Error('bounds: unknown node ' + n.type);
  }
}

// Runs recipe source (a function body) and returns { node, scene, params }.
export function runRecipe(code, params = {}) {
  const { api, state } = createApi(params);
  const names = Object.keys(api);
  let fn;
  try {
    fn = new Function(...names, '"use strict";\n' + code);
  } catch (e) {
    if (e instanceof SyntaxError) throw new RecipeError('Syntax error: ' + e.message);
    // eval blocked by CSP: fall back to an injected script
    fn = scriptFunction(names, code);
  }
  const node = fn(...names.map((k) => api[k]));
  if (!(node instanceof Node)) fail('The recipe must end with `return <shape>` (for example: return sphere(0.5))');
  if (node.dim !== 3) fail('The recipe returned a 2D shape. Use .extrude(depth) or .revolve() to make it 3D');
  return { node, scene: state.scene, params: state.params };
}

let scriptSeq = 0;
function scriptFunction(names, code) {
  if (typeof document === 'undefined') throw new RecipeError('Cannot evaluate recipes here');
  const key = '__gilafFn' + ++scriptSeq;
  const el = document.createElement('script');
  el.textContent = `window.${key} = function(${names.join(',')}){"use strict";\n${code}\n};`;
  let err = null;
  const onErr = (ev) => {
    err = ev.message;
  };
  window.addEventListener('error', onErr);
  document.head.appendChild(el);
  window.removeEventListener('error', onErr);
  el.remove();
  const fn = window[key];
  delete window[key];
  if (typeof fn !== 'function') throw new RecipeError(err || 'Could not evaluate the recipe');
  return fn;
}

export function countNodes(n) {
  return 1 + n.k.reduce((s, c) => s + countNodes(c), 0);
}
