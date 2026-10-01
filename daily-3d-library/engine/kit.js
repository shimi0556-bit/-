// Daily 3D Library — modelling kit.
// Shared helpers every model builds with: materials, primitives, parametric
// surfaces, canvas textures, instancing and the part registry. Exposed as
// window.L3D.kit so a model file can use it without an import (pages are
// bundled into one HTML file by build.py, see README.md).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L3D = (window.L3D = window.L3D || {});
L3D.THREE = THREE;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- materials
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const hexKey = (c) => (typeof c === 'number' ? c.toString(16) : String(c));

function phys(o) { return new THREE.MeshPhysicalMaterial(o); }
function std(o) { return new THREE.MeshStandardMaterial(o); }

const M = {
  // deep multi-layer car paint: metallic base + clear coat
  paint: (c = 0x07080b) => once('paint' + hexKey(c), () => phys({ color: c, metalness: 0.6, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.035, side: THREE.DoubleSide, name: 'צבע מתכתי + שכבת לכה' })),
  paintFlat: (c = 0x111111, r = 0.6) => once('pflat' + hexKey(c) + r, () => std({ color: c, metalness: 0.1, roughness: r, name: 'צבע מט' })),
  chrome: () => once('chrome', () => std({ color: 0xffffff, metalness: 1, roughness: 0.05, name: 'כרום' })),
  satin: () => once('satin', () => std({ color: 0xcfd3d8, metalness: 1, roughness: 0.28, name: 'כרום סאטן' })),
  darkChrome: () => once('dchrome', () => std({ color: 0x55585e, metalness: 1, roughness: 0.12, name: 'כרום כהה' })),
  aluminum: () => once('alu', () => std({ color: 0xd9dde2, metalness: 1, roughness: 0.22, name: 'אלומיניום מלוטש' })),
  castAlu: () => once('calu', () => std({ color: 0xa9adb2, metalness: 0.9, roughness: 0.55, name: 'אלומיניום יצוק' })),
  steel: () => once('steel', () => std({ color: 0x8b9096, metalness: 0.95, roughness: 0.38, name: 'פלדה' })),
  darkSteel: () => once('dsteel', () => std({ color: 0x3a3d42, metalness: 0.85, roughness: 0.5, name: 'פלדה כהה' })),
  castIron: () => once('ciron', () => std({ color: 0x46484c, metalness: 0.75, roughness: 0.78, name: 'ברזל יצוק' })),
  armorSteel: () => once('asteel', () => std({ color: 0x6b7178, metalness: 0.9, roughness: 0.45, name: 'פלדת שריון מוקשית' })),
  titanium: () => once('titan', () => std({ color: 0x9a9690, metalness: 0.9, roughness: 0.32, name: 'טיטניום' })),
  ceramic: () => once('ceram', () => std({ color: 0xe8e2d4, metalness: 0, roughness: 0.6, name: 'קרמיקה בליסטית' })),
  kevlar: () => once('kevlar', () => std({ color: 0xc9a43a, metalness: 0.05, roughness: 0.8, name: 'קבלר (אראמיד)' })),
  copper: () => once('copper', () => std({ color: 0xc8764a, metalness: 1, roughness: 0.3, name: 'נחושת' })),
  brass: () => once('brass', () => std({ color: 0xd8b25a, metalness: 1, roughness: 0.3, name: 'פליז' })),
  gold: () => once('gold', () => std({ color: 0xf2c75c, metalness: 1, roughness: 0.18, name: 'זהב' })),
  rubber: () => once('rubber', () => std({ color: 0x141416, metalness: 0, roughness: 0.92, name: 'גומי' })),
  tire: () => once('tire', () => std({ color: 0x18181a, metalness: 0, roughness: 0.86, name: 'גומי צמיגים' })),
  plastic: (c = 0x15161a, r = 0.55) => once('plastic' + hexKey(c) + r, () => std({ color: c, metalness: 0, roughness: r, name: 'פלסטיק' })),
  gloss: (c = 0x0b0b0d) => once('gloss' + hexKey(c), () => phys({ color: c, metalness: 0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, name: 'פלסטיק מבריק' })),
  leather: (c = 0x15171c) => once('leather' + hexKey(c), () => phys({ color: c, metalness: 0, roughness: 0.62, sheen: 0.4, sheenColor: 0x444444, sheenRoughness: 0.6, bumpMap: noiseTexture(256, 'leather'), bumpScale: 0.6, name: 'עור' })),
  fabric: (c = 0x1b1d24) => once('fabric' + hexKey(c), () => std({ color: c, metalness: 0, roughness: 0.95, bumpMap: noiseTexture(256, 'fabric'), bumpScale: 0.5, name: 'בד' })),
  carpet: (c = 0x14161d) => once('carpet' + hexKey(c), () => std({ color: c, metalness: 0, roughness: 1, bumpMap: noiseTexture(256, 'carpet'), bumpScale: 1, name: 'שטיח' })),
  wood: () => once('wood', () => phys({ color: 0x5a2e17, map: woodTexture(), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, name: 'עץ מצופה לכה' })),
  glass: (c = 0x0d1418, o = 0.55) => once('glass' + hexKey(c) + o, () => phys({ color: c, metalness: 0, roughness: 0.02, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.0, clearcoat: 1, name: 'זכוכית' })),
  polycarb: () => once('polyc', () => phys({ color: 0x3d5a58, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.3, name: 'פוליקרבונט' })),
  clearLens: () => once('clens', () => phys({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, name: 'עדשה שקופה' })),
  lens: (c = 0xff1010, o = 0.75) => once('lens' + hexKey(c) + o, () => phys({ color: c, metalness: 0, roughness: 0.08, transparent: true, opacity: o, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.05, name: 'עדשה צבעונית' })),
  // emissive light sources; intensity is driven by the model's toggles
  light: (c = 0xffffff, i = 0.2) => once('light' + hexKey(c) + i, () => std({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, metalness: 0, name: 'מקור אור' })),
  reflector: () => once('refl', () => std({ color: 0xdfe6ee, metalness: 1, roughness: 0.08, name: 'מחזיר אור' })),
  black: () => once('black', () => std({ color: 0x050505, metalness: 0, roughness: 0.8, name: 'שחור מט' })),
  matte: (c) => once('matte' + hexKey(c), () => std({ color: c, metalness: 0, roughness: 0.75 })),
  metal: (c, r = 0.35) => once('metal' + hexKey(c) + r, () => std({ color: c, metalness: 0.9, roughness: r })),
  emissive: (c, i = 1) => once('emis' + hexKey(c) + i, () => std({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 })),
  decal: (tex, o = {}) => phys({ map: tex, transparent: true, alphaTest: 0.05, roughness: o.roughness ?? 0.35, metalness: o.metalness ?? 0, clearcoat: o.clearcoat ?? 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, ...o.extra }),
  screen: (tex, i = 0.9) => std({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: i, roughness: 0.2, metalness: 0 }),
};

// ------------------------------------------------------------ canvas textures
function canvasTexture(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}

// deterministic PRNG so every build of a model is identical
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function noiseTexture(size = 256, kind = 'leather') {
  return once('noise' + kind + size, () => canvasTexture(size, size, (g, w, h) => {
    const r = rng(kind.length * 977);
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      let v = 128 + (r() - 0.5) * (kind === 'carpet' ? 200 : 90);
      if (kind === 'fabric') v += ((i % w) % 4 < 2 ? 30 : -30) + ((Math.floor(i / w) % 4) < 2 ? 20 : -20);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (kind === 'leather') { // pebbled grain cells
      g.globalAlpha = 0.25;
      for (let k = 0; k < 900; k++) { g.fillStyle = r() > 0.5 ? '#fff' : '#000'; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3, 0, 7); g.fill(); }
    }
  }, { linear: true, repeat: kind === 'carpet' ? [10, 10] : [6, 6] }));
}

function woodTexture() {
  return once('woodtex', () => canvasTexture(512, 512, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#5b2f18'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const k = Math.sin(y * 0.05 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
      g.fillStyle = `rgba(${40 + k * 60},${18 + k * 25},${8 + k * 10},${0.25 + r() * 0.2})`;
      g.fillRect(0, y, w, 2);
    }
    for (let k = 0; k < 40; k++) { g.strokeStyle = 'rgba(20,8,2,0.25)'; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 30 - 15, w * 0.6, y + r() * 30 - 15, w, y + r() * 20 - 10); g.stroke(); }
  }, { repeat: [2, 2] }));
}

// text rendered into a texture; returns {tex, aspect}
function textTexture(text, o = {}) {
  const font = o.font || '700 120px "Helvetica Neue", Arial, sans-serif';
  const pad = o.pad ?? 20;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const lines = String(text).split('\n');
  const lh = o.lineHeight || parseInt(font.match(/(\d+)px/)[1], 10) * 1.15;
  const w = Math.ceil(Math.max(...lines.map((l) => meas.measureText(l).width)) + pad * 2);
  const h = Math.ceil(lh * lines.length + pad * 2);
  const tex = canvasTexture(o.w || w, o.h || h, (g, W, H) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, W, H); }
    g.font = font; g.fillStyle = o.color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.letterSpacing) g.letterSpacing = o.letterSpacing;
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));
  });
  return { tex, aspect: (o.w || w) / (o.h || h) };
}

// ---------------------------------------------------------------- geometry
const G = {
  box(w, h, d, r = 0, seg = 2) {
    if (r > 0) return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
    return new THREE.BoxGeometry(w, h, d);
  },
  // cylinder along an axis ('x' | 'y' | 'z')
  cyl(rTop, rBot, h, seg = 32, axis = 'y', open = false, hseg = 1) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hseg, open);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  },
  sphere(r, ws = 24, hs = 16) { return new THREE.SphereGeometry(r, ws, hs); },
  torus(R, r, rs = 12, ts = 48, arc = Math.PI * 2, axis = 'z') {
    const g = new THREE.TorusGeometry(R, r, rs, ts, arc);
    if (axis === 'x') g.rotateY(Math.PI / 2);
    if (axis === 'y') g.rotateX(Math.PI / 2);
    return g;
  },
  // lathe from [radius, height] pairs, revolved around an axis
  lathe(pts, seg = 48, axis = 'y', phiStart = 0, phiLen = Math.PI * 2) {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg, phiStart, phiLen);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  },
  tube(pts, r, segs = 64, radial = 8, closed = false, curveType = 'catmullrom', tension = 0.5) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V3(...p))), closed, curveType, tension);
    return new THREE.TubeGeometry(curve, segs, r, radial, closed);
  },
  // polyline tube with sharp-ish bends (pipes, brake lines)
  pipe(pts, r, radial = 8) {
    return G.tube(pts, r, Math.max(8, pts.length * 12), radial, false, 'centripetal');
  },
  shape(pts, holes = []) {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    holes.forEach((h) => s.holes.push(h.isPath ? h : new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))));
    return s;
  },
  roundRect(w, h, r, cx = 0, cy = 0) {
    const s = new THREE.Shape(); const x = cx - w / 2, y = cy - h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  },
  roundRectPath(w, h, r, cx = 0, cy = 0) { const s = G.roundRect(w, h, r, cx, cy); const p = new THREE.Path(); p.curves = s.curves; return p; },
  circlePath(r, cx = 0, cy = 0, cw = false) { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, cw); return p; },
  // extrude a 2D shape (XY) by depth along +Z, centred on z=0
  extrude(shape, depth, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevelT ?? o.bevel ?? 0, bevelSegments: o.bevelSeg ?? 3, curveSegments: o.curveSeg ?? 16, steps: o.steps ?? 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
  hexNut(s = 0.012, h = 0.01) { return once('hex' + s + h, () => G.cyl(s, s, h, 6, 'y')); },
  // hex bolt head + washer, standing on +Y
  bolt(s = 0.01) {
    return once('bolt' + s, () => {
      const head = G.cyl(s, s, s * 0.65, 6, 'y'); head.translate(0, s * 0.45, 0);
      const washer = G.cyl(s * 1.35, s * 1.35, s * 0.15, 16, 'y'); washer.translate(0, s * 0.075, 0);
      return mergeGeometries([head.toNonIndexed(), washer.toNonIndexed()]);
    });
  },
  rivet(r = 0.006) { return once('rivet' + r, () => { const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); return g; }); },
  merge(list) {
    const norm = list.filter(Boolean).map((g) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; });
    norm.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
    return mergeGeometries(norm);
  },
  // place a geometry copy with a transform (for merging many small parts)
  at(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    const g = geo.clone();
    const m = new THREE.Matrix4().compose(V3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), typeof scale === 'number' ? V3(scale, scale, scale) : V3(...scale));
    g.applyMatrix4(m);
    return g;
  },
};

// --------------------------------------------------------- param surfaces
// Sorted samples from a to b. `step` may be a number or a function of position;
// every value in `breaks` that falls inside (a, b) is hit exactly, so patches
// cut from the same surface line up perfectly with the holes left for them.
function samples(a, b, step, breaks = []) {
  const dir = Math.sign(b - a) || 1;
  const st = typeof step === 'function' ? step : () => step;
  const bs = [...new Set([...breaks, b])].filter((t) => (t - a) * dir > 1e-9 && (b - t) * dir >= -1e-9).sort((p, q) => (p - q) * dir);
  const out = [a]; let cur = a;
  for (const nb of bs) {
    let n = 0, t = cur;
    while ((nb - t) * dir > 1e-9 && n < 4000) { t += dir * Math.max(1e-4, st(t)); n++; }
    n = Math.max(1, n);
    for (let i = 1; i <= n; i++) out.push(cur + ((nb - cur) * i) / n);
    cur = nb;
  }
  return out;
}

// Build a surface from S(u, v) -> Vector3 over the grid us × vs.
//   skip(u, v)  -> true to leave a hole for the quad centred at (u, v)
//   out(p,u,v)  -> a vector pointing "outside" (fixes normal orientation)
//   offset      -> push the surface along its normal (negative = inward)
//   thickness   -> solidify inward, adding inner skin + rim walls around holes/edges
function surface(S, us, vs, o = {}) {
  const { skip = null, out = null, offset = 0, thickness = 0, inset = 0 } = o;
  const nu = us.length, nv = vs.length, e = 1e-4;
  const P = new Array(nu * nv), N = new Array(nu * nv);
  const idx = (i, j) => i * nv + j;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = us[i], v = vs[j];
      const p = S(u, v);
      const du = S(u + e, v).sub(S(u - e, v));
      const dv = S(u, v + e).sub(S(u, v - e));
      let n = du.cross(dv);
      if (n.lengthSq() < 1e-18) n = null; else {
        n.normalize();
        if (out) { const h = out(p, u, v); if (n.dot(h) < 0) n.negate(); }
      }
      P[idx(i, j)] = p; N[idx(i, j)] = n;
    }
  }
  // fill degenerate normals from the nearest valid neighbour
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (N[idx(i, j)]) continue;
    const nb = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].find(([a, b]) => a >= 0 && b >= 0 && a < nu && b < nv && N[idx(a, b)]);
    if (nb) N[idx(i, j)] = N[idx(nb[0], nb[1])].clone();
  }
  for (let k = 0; k < N.length; k++) if (!N[k]) N[k] = V3(0, 1, 0);

  const keep = new Uint8Array((nu - 1) * (nv - 1));
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
    keep[i * (nv - 1) + j] = skip && skip(uc, vc) ? 0 : 1;
  }
  const kept = (i, j) => i >= 0 && j >= 0 && i < nu - 1 && j < nv - 1 && keep[i * (nv - 1) + j] === 1;

  // uv by accumulated distance along the middle row/column
  const uAcc = [0], vAcc = [0];
  const jm = Math.floor(nv / 2), im = Math.floor(nu / 2);
  for (let i = 1; i < nu; i++) uAcc.push(uAcc[i - 1] + P[idx(i, jm)].distanceTo(P[idx(i - 1, jm)]));
  for (let j = 1; j < nv; j++) vAcc.push(vAcc[j - 1] + P[idx(im, j)].distanceTo(P[idx(im, j - 1)]));

  const pos = [], nor = [], uvs = [], ind = [];
  const push = (p, n, uu, vv) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uvs.push(uu, vv); return pos.length / 3 - 1; };
  const layer = (off, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const n = N[idx(i, j)];
      const p = P[idx(i, j)].clone().addScaledVector(n, off);
      push(p, flip ? n.clone().negate() : n, uAcc[i], vAcc[j]);
    }
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
      if (!kept(i, j)) continue;
      const a = base + idx(i, j), b = base + idx(i + 1, j), c = base + idx(i + 1, j + 1), d = base + idx(i, j + 1);
      const pa = P[idx(i, j)], pb = P[idx(i + 1, j)], pc = P[idx(i + 1, j + 1)], pd = P[idx(i, j + 1)];
      const fn = pc.clone().sub(pa).cross(pd.clone().sub(pb));
      const nAvg = N[idx(i, j)].clone().add(N[idx(i + 1, j + 1)]);
      let ccw = fn.dot(nAvg) > 0;
      if (flip) ccw = !ccw;
      if (ccw) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c);
    }
  };
  const outer = offset, inner = offset - thickness;
  layer(outer, false);
  if (thickness > 0) layer(inner, true);
  const skinCount = ind.length;
  if (thickness > 0) {
    // rim walls on every boundary edge of the kept region
    const wall = (i0, j0, i1, j1, ci, cj) => {
      const k0 = idx(i0, j0), k1 = idx(i1, j1);
      const a = P[k0].clone().addScaledVector(N[k0], outer), b = P[k1].clone().addScaledVector(N[k1], outer);
      const c = P[k1].clone().addScaledVector(N[k1], inner), d = P[k0].clone().addScaledVector(N[k0], inner);
      const centre = P[idx(ci, cj)].clone().add(P[idx(ci + 1, cj + 1)]).multiplyScalar(0.5);
      const away = a.clone().add(b).multiplyScalar(0.5).sub(centre);
      const fn = b.clone().sub(a).cross(d.clone().sub(a));
      if (fn.lengthSq() < 1e-16) return;
      const n = fn.clone().normalize();
      const flipW = n.dot(away) < 0;
      const nn = flipW ? n.clone().negate() : n;
      const ia = push(a, nn, 0, 0), ib = push(b, nn, 1, 0), ic = push(c, nn, 1, 1), id = push(d, nn, 0, 1);
      if (!flipW) ind.push(ia, id, ib, ib, id, ic); else ind.push(ia, ib, id, ib, ic, id);
    };
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
      if (!kept(i, j)) continue;
      if (!kept(i, j - 1)) wall(i, j, i + 1, j, i, j);
      if (!kept(i, j + 1)) wall(i, j + 1, i + 1, j + 1, i, j);
      if (!kept(i - 1, j)) wall(i, j, i, j + 1, i, j);
      if (!kept(i + 1, j)) wall(i + 1, j, i + 1, j + 1, i, j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  // group 0 = skins, group 1 = rim walls: pass [skinMat, edgeMat] to darken panel edges
  g.addGroup(0, skinCount, 0);
  if (ind.length > skinCount) g.addGroup(skinCount, ind.length - skinCount, 1);
  void inset;
  return g;
}

// flat cap for a planar loop of 3D points; `normal` picks the facing side
function cap(points, normal) {
  const n = normal.clone().normalize();
  const t = Math.abs(n.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const a = t.clone().cross(n).normalize(), b = n.clone().cross(a);
  const c2 = points.map((p) => new THREE.Vector2(p.dot(a), p.dot(b)));
  const tris = THREE.ShapeUtils.triangulateShape(c2, []);
  const pos = [], nor = [], uv = [];
  for (const tri of tris) {
    let [i0, i1, i2] = tri;
    const f = points[i1].clone().sub(points[i0]).cross(points[i2].clone().sub(points[i0]));
    if (f.dot(n) < 0) [i1, i2] = [i2, i1];
    for (const k of [i0, i1, i2]) { pos.push(points[k].x, points[k].y, points[k].z); nor.push(n.x, n.y, n.z); uv.push(c2[k].x, c2[k].y); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------ scene graph
const registry = { toggles: [], frames: [] };

function mesh(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(...o.scale);
  if (o.name) m.name = o.name;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.parent) o.parent.add(m);
  return m;
}

function group(parent, o = {}) {
  const g = new THREE.Group();
  if (o.pos) g.position.set(...o.pos);
  if (o.rot) g.rotation.set(...o.rot);
  if (o.name) g.name = o.name;
  if (parent) parent.add(g);
  return g;
}

// A named, documented part. Everything the viewer can hover, list, isolate or
// explode is a part: { he, en, desc, mat } where `mat` names the material.
function part(parent, info, o = {}) {
  const g = group(parent, o);
  g.name = info.en || info.he;
  g.userData.part = info;
  if (o.explode) g.userData.explode = V3(...o.explode);
  return g;
}

// InstancedMesh from a list of transforms [{pos, rot, scale}]
function instances(geo, mat, list, o = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V3();
  list.forEach((t, k) => {
    e.set(...(t.rot || [0, 0, 0]), t.order || 'XYZ');
    q.setFromEuler(e);
    const sc = t.scale ?? 1;
    typeof sc === 'number' ? s.setScalar(sc) : s.set(...sc);
    m4.compose(V3(...t.pos), q, s);
    im.setMatrixAt(k, m4);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = o.cast ?? true;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  if (o.parent) o.parent.add(im);
  return im;
}

// mirror a built object across the z=0 plane (left/right pairs)
function mirrorZ(obj) {
  const c = obj.clone(true);
  c.position.z *= -1;
  c.rotation.x *= -1; c.rotation.y *= -1;
  c.traverse((n) => {
    if (n.isMesh && n !== c) { /* children keep their local transform; flip via parent scale */ }
  });
  c.scale.z *= -1;
  c.traverse((n) => { if (n.isMesh) n.userData.mirrored = true; });
  return c;
}

// animated toggles (doors, lights…) — viewer renders a button per toggle
function toggle(id, info, apply, initial = 0) {
  registry.toggles.push({ id, ...info, apply, t: initial, target: initial, init: initial });
  apply(initial);
}
function onFrame(fn) { registry.frames.push(fn); }

L3D.kit = {
  THREE, V3, clamp, lerp, smooth, rng, M, G, samples, surface, cap,
  canvasTexture, textTexture, noiseTexture, mesh, group, part, instances, mirrorZ,
  toggle, onFrame, registry, mergeGeometries,
};
