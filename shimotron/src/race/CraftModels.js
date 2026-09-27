import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The racing craft, several designs of each kind, built from parts so
 * that each part gets the right material and the cockpit can be seen
 * from inside:
 *   body      glossy painted shell (clear-coated)
 *   matte     rubber, fabric, non-slip decks, inflatable tubes, tyres
 *   metal     rails, struts, props, exhausts
 *   glass     canopies, windscreens, portholes, the acrylic sphere
 *   glow      lit instruments, screens, lamps (vertex colour = light)
 *   pilot     the driver (hidden in the cockpit view)
 *   fabric    paraglider / hang glider sail
 *   lines     rigging drawn as lines
 * plus `eye` (cockpit camera), `nose` (front camera), `props`, `jets`
 * and `spray` points. Everything faces +Z; y = 0 is the waterline for
 * boats and the centre line for the rest.
 */

export const DESIGNS = {
  boat: ['rib', 'offshore', 'runabout'],
  sub: ['bubble', 'orca', 'manta'],
  plane: ['racer', 'biplane', 'jet'],
  glider: ['para', 'speed', 'tandem', 'hang'],
  space: ['fighter', 'shuttle', 'needle'],
};

export const DESIGN_NAMES = {
  rib: 'סירת גומי טורנדו',
  offshore: 'קטמרן אופשור',
  runabout: 'סירת מנוע',
  bubble: 'צוללת בועה',
  orca: 'צוללת אורקה',
  manta: 'צוללת מנטה',
  racer: 'מטוס מרוץ',
  biplane: 'דו־כנפי',
  jet: 'סילון',
  para: 'מצנח רחיפה',
  speed: 'כנף מהירות',
  tandem: 'מצנח זוגי',
  hang: 'גלשן תלייה',
  fighter: 'חללית קרב',
  shuttle: 'מעבורת',
  needle: 'מחט',
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ helpers

/** Non-indexed copy with one flat vertex colour. */
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(hex);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Colour every vertex by a function of its position. */
function paintBy(g, fn) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.set(fn(p.getX(i), p.getY(i), p.getZ(i)));
    c.toArray(a, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r1, r0, h, seg);
const sphere = (r, ws = 14, hs = 10, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);

/** A rod from a to b (arrays or vectors). */
function rod(a, b, r0, r1 = r0, seg = 6) {
  const A = Array.isArray(a) ? new THREE.Vector3(...a) : a;
  const B = Array.isArray(b) ? new THREE.Vector3(...b) : b;
  const len = A.distanceTo(B);
  const c = new THREE.CylinderGeometry(r1, r0, len, seg);
  c.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, _v.copy(B).sub(A).normalize());
  c.applyQuaternion(_q);
  c.translate(A.x, A.y, A.z);
  return c;
}

/** A tube swept along points (smooth curve). */
function tube(points, r, seg = 48, radial = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, seg, r, radial, closed);
}

/**
 * Lofted body from cross-sections [z, halfWidth, halfHeight, centreY, power]
 * (power 2 = ellipse, higher = boxier). Smooth normals, closed ends.
 */
function loft(stations, around = 16) {
  const pos = [];
  const idx = [];
  const ring = (st) => {
    const [z, w, h, cy, pw = 2] = st;
    const e = 2 / pw;
    const out = [];
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2 - Math.PI / 2; // seam underneath
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push([Math.sign(c) * Math.abs(c) ** e * w, cy + Math.sign(s) * Math.abs(s) ** e * h, z]);
    }
    return out;
  };
  stations.forEach((st) => ring(st).forEach((p) => pos.push(...p)));
  const n = stations.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * around + k;
      const b = i * around + ((k + 1) % around);
      const c = a + around;
      const d = b + around;
      idx.push(a, b, c, b, d, c);
    }
  }
  // End caps (fans to the section centres).
  const capA = pos.length / 3;
  pos.push(0, stations[0][3], stations[0][0]);
  const capB = capA + 1;
  pos.push(0, stations[n - 1][3], stations[n - 1][0]);
  for (let k = 0; k < around; k++) {
    idx.push(capA, (k + 1) % around, k);
    idx.push(capB, (n - 1) * around + k, (n - 1) * around + ((k + 1) % around));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Smooth-shaded copy of a geometry (merge vertices, recompute normals). */
function smooth(g) {
  g = g.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

/** A flat polygon (points [x, z]) at height y, both faces. */
function plate(points, y, thick = 0.04) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y + thick / 2, 0);
  return g;
}

/** Instrument panel: a dark board with round lit gauges and a screen; returns { matte, glow, metal }. */
function panel(w, h, x, y, z, tilt, { gauges = 4, screen = true, color = 0x1c1f24 } = {}) {
  // Built facing +Z, then turned to face the driver behind it and tilted back.
  const m = new THREE.Matrix4().makeRotationX(tilt).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).setPosition(x, y, z);
  const matte = [paint(box(w, h, 0.05).applyMatrix4(m), color)];
  const glow = [];
  const metal = [];
  const cols = Math.min(gauges, 4);
  for (let k = 0; k < gauges; k++) {
    const row = Math.floor(k / cols);
    const col = k % cols;
    const gx = (col - (cols - 1) / 2) * (w / (cols + 0.6)) + (screen ? -w * 0.12 : 0);
    const gy = h * 0.18 - row * h * 0.42;
    const r = Math.min(0.055, w / (cols * 2.8));
    const face = new THREE.CircleGeometry(r, 16).translate(gx, gy, 0.03).applyMatrix4(m);
    glow.push(paint(face, k % 3 === 0 ? 0xdfe8ff : k % 3 === 1 ? 0xffe2b0 : 0xcff5d8));
    // Bezel and needle.
    metal.push(paint(new THREE.TorusGeometry(r, 0.006, 4, 16).translate(gx, gy, 0.032).applyMatrix4(m), 0x8a8f96));
    matte.push(paint(box(0.006, r * 0.8, 0.004).translate(0, r * 0.35, 0).rotateZ(-0.6 - k * 0.7).translate(gx, gy, 0.036).applyMatrix4(m), 0x111111));
  }
  if (screen) glow.push(paint(new THREE.PlaneGeometry(w * 0.28, h * 0.6).translate(w * 0.3, 0, 0.03).applyMatrix4(m), 0x3ad0ff));
  return { matte, glow, metal };
}

// ------------------------------------------------------------------ people

/**
 * A seated driver or pilot in a helmet, facing +Z, hips at the origin.
 * hands: 'wheel' (forward, mid height), 'stick' (low, centre), 'up'
 * (brake toggles above the shoulders), 'bar' (hang glider control bar).
 */
export function seatedPilot({ suit = 0x2b3a67, helmet = 0xf2f2f2, visor = 0x1a2530, skin = 0xe0b090, hands = 'wheel', lean = 0.15, open = false, legs = 'forward' } = {}) {
  const parts = [];
  const add = (g, c) => parts.push(paint(g, c));
  // Torso leaning back a little, with shoulders.
  const torso = loft(
    [
      [-0.02, 0.15, 0.1, 0.05, 2.4],
      [0.0, 0.17, 0.12, 0.25, 2.4],
      [0.0, 0.19, 0.12, 0.45, 2.6],
      [0.0, 0.2, 0.11, 0.55, 3],
      [0.0, 0.08, 0.07, 0.64, 2],
    ].map(([z, w, d, y, p]) => [y, w, d, z, p]),
    12,
  );
  // loft works along z: here the sections run up the spine, so swap axes afterwards.
  torso.rotateX(-Math.PI / 2);
  torso.scale(1, 1, -1);
  torso.rotateX(-lean);
  add(torso, suit);
  const neck = new THREE.Vector3(0, 0.66, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -lean);
  // Head in a helmet with a visor.
  const headC = neck.clone().add(new THREE.Vector3(0, 0.17, 0.02));
  add(sphere(0.105, 12, 9).scale(0.9, 1.05, 1).translate(headC.x, headC.y, headC.z), skin);
  if (open) {
    // Leather flying helmet and goggles.
    add(sphere(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(headC.x, headC.y + 0.01, headC.z - 0.01), 0x5a3a22);
    add(new THREE.TorusGeometry(0.035, 0.01, 5, 10).translate(0.042, headC.y + 0.02, headC.z + 0.095), 0x3a2a1a);
    add(new THREE.TorusGeometry(0.035, 0.01, 5, 10).translate(-0.042, headC.y + 0.02, headC.z + 0.095), 0x3a2a1a);
  } else {
    add(sphere(0.14, 14, 10).scale(0.95, 1.02, 1.05).translate(headC.x, headC.y + 0.02, headC.z - 0.01), helmet);
    add(sphere(0.142, 14, 6, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.26).scale(0.96, 1.02, 1.06).translate(headC.x, headC.y + 0.02, headC.z - 0.005), visor);
  }
  add(rod([0, 0.6, 0], neck.toArray(), 0.05, 0.045, 6), skin);
  // Arms: shoulder → elbow → hand.
  const sh = neck.clone().add(new THREE.Vector3(0, -0.07, 0));
  const handsAt = {
    wheel: [[0.19, 0.42, 0.46], [-0.19, 0.42, 0.46]],
    stick: [[0.05, 0.12, 0.4], [-0.2, 0.2, 0.3]],
    up: [[0.3, 0.95, 0.08], [-0.3, 0.95, 0.08]],
    bar: [[0.32, 0.25, 0.55], [-0.32, 0.25, 0.55]],
  }[hands];
  for (const s of [1, -1]) {
    const S = sh.clone().add(new THREE.Vector3(0.2 * s, 0, 0));
    const H = new THREE.Vector3(...handsAt[s > 0 ? 0 : 1]);
    const E = S.clone().lerp(H, 0.5).add(new THREE.Vector3(0.08 * s, hands === 'up' ? 0 : -0.1, hands === 'up' ? -0.08 : 0));
    add(rod(S, E, 0.055, 0.048, 6), suit);
    add(rod(E, H, 0.045, 0.04, 6), suit);
    add(sphere(0.045, 8, 6).translate(H.x, H.y, H.z), 0x1b1b1e); // gloves
  }
  // Legs.
  for (const s of [1, -1]) {
    const hip = new THREE.Vector3(0.1 * s, 0.05, 0.02);
    const knee = legs === 'hang' ? new THREE.Vector3(0.12 * s, -0.4, 0.05) : new THREE.Vector3(0.13 * s, 0.12, 0.46);
    const foot = legs === 'hang' ? new THREE.Vector3(0.12 * s, -0.82, 0.1) : new THREE.Vector3(0.13 * s, -0.32, 0.62);
    add(rod(hip, knee, 0.08, 0.065, 7), suit);
    add(rod(knee, foot, 0.06, 0.05, 7), suit);
    add(box(0.11, 0.1, 0.26).translate(foot.x, foot.y - 0.02, foot.z + 0.07), 0x1b1b1e);
  }
  add(sphere(0.17, 10, 8).scale(1.05, 0.6, 1).translate(0, 0.04, 0.02), suit); // seat of the suit
  return mergeGeometries(parts);
}

const GEO_KEYS = ['body', 'matte', 'metal', 'glass', 'glow', 'pilot', 'fabric', 'lines'];

/** Non-indexed, with exactly the attributes a part list shares. */
function tidy(g, keep) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  if (keep.includes('normal') && !g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Groups parts into one geometry per material (skipping empty lists). */
function assemble(parts) {
  const out = {};
  for (const [k, list] of Object.entries(parts)) {
    if (!GEO_KEYS.includes(k)) {
      out[k] = list;
      continue;
    }
    const keep = k === 'glass' ? ['position', 'normal'] : k === 'lines' ? ['position'] : k === 'fabric' ? ['position', 'normal', 'color', 'aFab'] : ['position', 'normal', 'color'];
    const geos = (list || []).filter(Boolean).map((g) => (k === 'lines' ? g : tidy(g, keep)));
    out[k] = geos.length ? mergeGeometries(geos) : null;
  }
  return out;
}

// ------------------------------------------------------------------ boats

/** Deep-V hull from sections [z, half-beam at deck, deck height, chine half-width, chine height, keel depth]. */
function vHull(stations, top, band, bottom, bandUntil = 3) {
  const ring = ([z, bw, dh, cw, ch, kd]) =>
    [
      [bw, dh],
      [cw, ch],
      [0, kd],
      [-cw, ch],
      [-bw, dh],
    ].map(([x, y]) => new THREE.Vector3(x, y, z));
  const rings = stations.map(ring);
  const pos = [];
  const col = [];
  const cTop = new THREE.Color(top);
  const cBand = new THREE.Color(band);
  const cBottom = new THREE.Color(bottom);
  const quad = (a, b, c, d, cc) => {
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let k = 0; k < 4; k++) quad(A[k], A[k + 1], B[k], B[k + 1], k === 0 || k === 3 ? (i < bandUntil ? cBand : cTop) : cBottom);
  }
  const T = rings[0];
  for (const [a, b, c] of [
    [0, 1, 2],
    [0, 2, 4],
    [2, 3, 4],
  ]) {
    pos.push(T[a].x, T[a].y, T[a].z, T[b].x, T[b].y, T[b].z, T[c].x, T[c].y, T[c].z);
    for (let k = 0; k < 3; k++) col.push(cBand.r, cBand.g, cBand.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function outboard(x, z, color, scale = 1) {
  const s = scale;
  return {
    body: [paint(smooth(new THREE.CapsuleGeometry(0.26 * s, 0.34 * s, 4, 10)).scale(1, 1.25, 1.5).translate(x, 0.95 * s, z), color)],
    metal: [paint(box(0.12 * s, 0.9 * s, 0.22 * s, x, 0.2 * s, z - 0.02), 0x2a2d33), paint(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.26 * s, 8).rotateX(Math.PI / 2).translate(x, -0.28 * s, z - 0.05), 0x2a2d33), paint(box(0.5 * s, 0.05 * s, 0.1 * s, x, -0.28 * s, z - 0.2 * s), 0x6a6e76)],
  };
}

function ribBoat(color, stripe, seed) {
  const hull = vHull(
    [
      [-4.15, 1.05, 0.42, 1.0, -0.12, -0.5],
      [-2.4, 1.12, 0.42, 1.02, -0.14, -0.55],
      [-0.4, 1.12, 0.45, 0.98, -0.12, -0.56],
      [1.6, 0.98, 0.52, 0.8, -0.06, -0.5],
      [3.0, 0.66, 0.62, 0.46, 0.06, -0.3],
      [4.0, 0.2, 0.78, 0.1, 0.35, 0.05],
    ],
    0x2b2d31,
    stripe,
    0xe8e8e6,
    6,
  );
  // The inflatable collar: a fat tube round the hull, with a rubbing strake and taped seams.
  const collar = [
    [1.28, 0.7, -4.45],
    [1.36, 0.72, -3.0],
    [1.36, 0.74, -1.0],
    [1.22, 0.78, 1.2],
    [0.92, 0.86, 2.7],
    [0.45, 0.98, 3.75],
    [0, 1.02, 4.12],
  ];
  const full = [...collar, ...collar.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
  const tubeG = paint(tube(full, 0.34, 80, 14), color);
  const strake = paint(tube(full.map(([x, y, z]) => [x * 1.24 + Math.sign(x) * 0.02, y - 0.1, z * 1.01]), 0.06, 80, 6), stripe);
  const cones = [1, -1].map((s) => paint(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.9).translate(s * 1.28, 0.7, -4.45), color));
  const seams = [-2.4, -0.6].map((z) => [1, -1].map((s) => paint(new THREE.TorusGeometry(0.345, 0.012, 4, 16).translate(s * 1.36, 0.73, z), 0x1a1a1a))).flat();
  const deck = paint(plate([[-1.02, -4.1], [1.02, -4.1], [1.05, 1.4], [0.7, 2.9], [0, 3.8], [-0.7, 2.9], [-1.05, 1.4]], 0.42, 0.05), 0x5b5e63);
  // Centre console with a windscreen, wheel and a grab rail.
  const console = [paint(smooth(box(0.95, 0.95, 0.85, 0, 0.92, 0.35)), 0xeeeeea), paint(box(0.97, 0.06, 0.9, 0, 1.42, 0.35), 0xcfcfcf)];
  const dash = panel(0.8, 0.3, 0, 1.26, -0.11, 0.55, { gauges: 3, screen: true });
  const wheel = paint(new THREE.TorusGeometry(0.19, 0.022, 6, 20).rotateX(-0.9).translate(0, 1.22, -0.3), 0x15171a);
  const hub = paint(rod([0, 1.18, -0.08], [0, 1.23, -0.3], 0.03, 0.03, 6), 0x15171a);
  const screen = new THREE.PlaneGeometry(0.95, 0.5, 1, 1).rotateX(-0.45).translate(0, 1.66, 0.62);
  const rail = paint(tube([[-0.5, 1.45, -0.1], [-0.52, 1.65, 0.25], [-0.5, 1.88, 0.6], [0.5, 1.88, 0.6], [0.52, 1.65, 0.25], [0.5, 1.45, -0.1]], 0.02, 30, 6), 0xd8dde2);
  // Jockey seats (you straddle them), a leaning post, the stern A-frame with a radar and a light.
  const seats = [];
  for (const x of [-0.42, 0.42]) {
    seats.push(paint(rod([x, 0.45, -0.95], [x, 0.9, -0.95], 0.07, 0.07, 8), 0xd8dde2));
    seats.push(paint(smooth(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10)).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(x, 1.02, -0.95), 0x1d1f23));
    seats.push(paint(smooth(box(0.36, 0.34, 0.1, x, 1.3, -1.3)), 0x1d1f23));
  }
  const arch = [
    paint(rod([-0.95, 0.45, -3.35], [-0.72, 2.05, -3.6], 0.045, 0.045, 8), 0xd8dde2),
    paint(rod([0.95, 0.45, -3.35], [0.72, 2.05, -3.6], 0.045, 0.045, 8), 0xd8dde2),
    paint(rod([-0.72, 2.05, -3.6], [0.72, 2.05, -3.6], 0.045, 0.045, 8), 0xd8dde2),
  ];
  const radar = paint(cyl(0.28, 0.25, 0.2, 16).translate(0, 2.2, -3.6), 0xf2f2f2);
  const outs = [outboard(0.42, -4.35, 0x16181c), outboard(-0.42, -4.35, 0x16181c)];
  const pilot = seatedPilot({ suit: stripe === '#111111' ? 0x22262c : color, hands: 'wheel', lean: 0.05, legs: 'forward' });
  pilot.translate(0, 0.95, -0.75);
  return assemble({
    body: [hull, ...console, ...outs.flatMap((o) => o.body)],
    matte: [tubeG, ...cones, strake, ...seams, deck, ...seats, wheel, hub, ...dash.matte],
    metal: [rail, ...arch, radar, ...outs.flatMap((o) => o.metal), ...dash.metal],
    glass: [screen],
    glow: [...dash.glow, paint(sphere(0.06, 8, 6).translate(0, 2.35, -3.6), 0xffffff)],
    pilot: [pilot],
    eye: [0, 1.74, -0.95],
    nose: [0, 1.5, 4.35],
    spray: { bow: 1.8, beam: 1.5, stern: -4.5, props: [0.42, -0.42] },
  });
}

function offshoreBoat(color, stripe, seed) {
  // Twin sponsons joined by a tunnel deck: a catamaran racer with a closed canopy and an aerofoil at the stern.
  const sponson = (s) =>
    paintBy(
      loft(
        [
          [-5.0, 0.42, 0.38, 0.05, 2.6],
          [-3.0, 0.46, 0.42, 0.06, 2.6],
          [0.0, 0.46, 0.42, 0.06, 2.6],
          [2.5, 0.4, 0.4, 0.08, 2.4],
          [4.0, 0.26, 0.32, 0.14, 2.2],
          [4.9, 0.06, 0.1, 0.28, 2],
        ],
        14,
      ).translate(s * 1.15, 0, 0),
      (x, y) => (y < -0.05 ? 0xe8e8e6 : y < 0.2 ? stripe : color),
    );
  const deck = paintBy(
    loft(
      [
        [-4.9, 1.55, 0.2, 0.42, 3],
        [-2.0, 1.6, 0.26, 0.46, 3],
        [1.0, 1.55, 0.3, 0.46, 3],
        [3.0, 1.15, 0.2, 0.42, 3],
        [4.3, 0.5, 0.1, 0.4, 2.5],
      ],
      16,
    ),
    (x, y) => (y > 0.55 ? color : stripe),
  );
  const hatch = paint(smooth(box(1.8, 0.35, 3.2, 0, 0.72, -2.7)), color);
  const intake = [1, -1].map((s) => paint(box(0.25, 0.3, 0.6, s * 0.75, 0.95, -1.6), 0x1a1c20));
  const fins = [1, -1].map((s) => paint(box(0.08, 0.9, 0.7, s * 1.3, 1.1, -4.4), stripe));
  const wing = paint(box(2.9, 0.08, 0.55, 0, 1.55, -4.45), color);
  const canopy = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.72, 0.62, 1.55).translate(0, 0.62, 1.3);
  const frame = paint(new THREE.TorusGeometry(0.72, 0.035, 6, 24, Math.PI).scale(1, 0.86, 1).translate(0, 0.62, 0.35), 0x16181c);
  const seatsIn = [1, -1].map((s) => paint(smooth(box(0.42, 0.55, 0.5, s * 0.33, 0.62, 0.7)), 0x1d1f23));
  const dash = panel(1.05, 0.28, 0, 0.85, 1.85, 0.9, { gauges: 4, screen: true });
  const wheel = paint(new THREE.TorusGeometry(0.15, 0.02, 6, 18).rotateX(-1.1).translate(0.33, 0.9, 1.55), 0x15171a);
  const outs = [outboard(0.75, -5.05, 0x16181c, 0.9), outboard(-0.75, -5.05, 0x16181c, 0.9)];
  const drivers = [0.33, -0.33].map((x) => seatedPilot({ suit: stripe, hands: x > 0 ? 'wheel' : 'stick', lean: 0.35 }).translate(x, 0.45, 0.75));
  return assemble({
    body: [sponson(1), sponson(-1), deck, hatch, ...fins, wing, ...outs.flatMap((o) => o.body)],
    matte: [...intake, ...seatsIn, wheel, ...dash.matte, frame],
    metal: [...outs.flatMap((o) => o.metal), ...dash.metal],
    glass: [canopy],
    glow: [...dash.glow],
    pilot: drivers,
    eye: [0.33, 1.25, 1.0],
    nose: [0, 0.85, 4.1],
    spray: { bow: 2.4, beam: 1.9, stern: -5.1, props: [0.75, -0.75] },
  });
}

function runaboutBoat(color, stripe, seed) {
  const hull = vHull(
    [
      [-4.2, 1.2, 0.55, 1.1, -0.1, -0.45],
      [-2.5, 1.26, 0.55, 1.12, -0.12, -0.5],
      [-0.5, 1.26, 0.58, 1.08, -0.12, -0.52],
      [1.5, 1.12, 0.64, 0.88, -0.08, -0.48],
      [3.0, 0.8, 0.74, 0.55, 0.02, -0.35],
      [4.0, 0.42, 0.84, 0.22, 0.2, -0.1],
      [4.6, 0.04, 0.95, 0.02, 0.5, 0.35],
    ],
    color,
    stripe,
    0xf0f0ee,
    3,
  );
  const foredeck = paint(plate([[-1.18, 0.2], [1.18, 0.2], [1.05, 1.6], [0.75, 3.0], [0.38, 4.0], [0, 4.55], [-0.38, 4.0], [-0.75, 3.0], [-1.05, 1.6]], 0.72, 0.1), color);
  const aftdeck = paint(plate([[-1.18, -4.15], [1.18, -4.15], [1.18, -3.0], [-1.18, -3.0]], 0.6, 0.08), 0xd8c8a8);
  const floor = paint(box(1.95, 0.08, 3.2, 0, 0.24, -1.4), 0x4a4f57);
  const bench = [paint(smooth(box(2.0, 0.3, 0.6, 0, 0.55, -2.65)), 0xf2efe6), paint(smooth(box(2.0, 0.55, 0.14, 0, 0.8, -2.95)), 0xf2efe6)];
  const helm = [paint(smooth(box(0.6, 0.35, 0.55, 0.55, 0.5, -0.9)), 0xf2efe6), paint(smooth(box(0.6, 0.55, 0.12, 0.55, 0.85, -1.18)), 0xf2efe6)];
  const console = paint(smooth(box(0.75, 0.6, 0.5, 0.55, 0.62, 0.05)), 0xeeeeea);
  const dash = panel(0.62, 0.24, 0.55, 0.9, -0.18, 0.6, { gauges: 3, screen: false });
  const wheel = paint(new THREE.TorusGeometry(0.17, 0.02, 6, 18).rotateX(-1.0).translate(0.55, 0.98, -0.32), 0x15171a);
  const screen = new THREE.PlaneGeometry(2.1, 0.5).rotateX(-0.75).translate(0, 1.02, 0.35);
  const screenFrame = paint(tube([[-1.1, 0.72, 0.1], [-1.05, 1.18, 0.5], [1.05, 1.18, 0.5], [1.1, 0.72, 0.1]], 0.02, 20, 6), 0xc8ccd0);
  const rails = [1, -1].map((s) => paint(tube([[s * 1.12, 0.75, 1.0], [s * 1.02, 0.95, 2.2], [s * 0.6, 1.02, 3.4], [s * 0.18, 1.02, 4.2]], 0.018, 20, 6), 0xd8dde2));
  const out = outboard(0, -4.45, 0x33383f);
  const pilot = seatedPilot({ suit: color, hands: 'wheel', lean: 0.12 }).translate(0.55, 0.4, -0.95);
  return assemble({
    body: [hull, foredeck, console, ...out.body],
    matte: [aftdeck, floor, ...bench, ...helm, wheel, ...dash.matte],
    metal: [screenFrame, ...rails, ...out.metal, ...dash.metal],
    glass: [screen],
    glow: [...dash.glow],
    pilot: [pilot],
    eye: [0.55, 1.45, -0.95],
    nose: [0, 1.3, 4.0],
    spray: { bow: 1.9, beam: 1.4, stern: -4.6, props: [0] },
  });
}

// ------------------------------------------------------------------ submarines

/** A ducted thruster facing +Z (or along `axis`), centred at (x, y, z). */
function thruster(x, y, z, r, axis = 'z') {
  const rot = (g) => (axis === 'z' ? g.rotateX(Math.PI / 2) : g);
  return {
    matte: [paint(rot(new THREE.CylinderGeometry(r, r, r * 1.3, 16, 1, true)).translate(x, y, z), 0x23262b), paint(rot(new THREE.TorusGeometry(r, r * 0.16, 6, 18).rotateX(Math.PI / 2)).translate(x, y + (axis === 'y' ? r * 0.65 : 0), z + (axis === 'z' ? r * 0.65 : 0)), 0x2e3238)],
    metal: [paint(rot(new THREE.CylinderGeometry(r * 0.25, r * 0.25, r * 0.9, 8)).translate(x, y, z), 0x8a8f96), paint(rot(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.03, 16)).translate(x, y, z), 0x5a5f66)],
  };
}

function bubbleSub(color, stripe, seed) {
  const R = 1.0;
  const S = [0, 0.15, 1.3];
  const glass = new THREE.SphereGeometry(R, 28, 18).translate(...S);
  const hoop = paint(new THREE.TorusGeometry(R + 0.01, 0.045, 6, 36).translate(S[0], S[1], S[2] + 0.12), 0x8a8f96);
  const hatch = paint(new THREE.TorusGeometry(0.34, 0.06, 6, 20).rotateX(Math.PI / 2).translate(S[0], S[1] + R * 0.94, S[2] - 0.35), 0x8a8f96);
  const pontoons = [1, -1].map((s) => paint(smooth(new THREE.CapsuleGeometry(0.34, 3.4, 6, 14)).rotateX(Math.PI / 2).translate(s * 1.18, -0.45, -0.3), color));
  const top = paint(smooth(new THREE.CapsuleGeometry(0.5, 2.4, 6, 14)).rotateX(Math.PI / 2).scale(2.1, 1, 1).translate(0, 0.95, -1.0), color);
  const pods = [1, -1].map((s) => paint(smooth(new THREE.CapsuleGeometry(0.26, 1.6, 4, 12)).rotateX(Math.PI / 2).translate(s * 0.55, -0.25, -1.4), 0x3a3f47));
  const belly = paint(box(1.6, 0.16, 2.6, 0, -0.5, -0.9), 0x2a2d33);
  const skids = [1, -1].flatMap((s) => [paint(rod([s * 1.18, -0.95, -2.1], [s * 1.18, -0.95, 1.7], 0.05, 0.05, 6), 0x8a8f96), paint(rod([s * 1.18, -0.95, -1.4], [s * 1.18, -0.6, -1.4], 0.04, 0.04, 6), 0x8a8f96), paint(rod([s * 1.18, -0.95, 1.0], [s * 1.18, -0.6, 1.0], 0.04, 0.04, 6), 0x8a8f96)]);
  const frame = [1, -1].flatMap((s) => [paint(rod([s * 1.18, -0.45, 1.2], [s * 0.72, 0.1, 1.2], 0.05, 0.05, 6), stripe), paint(rod([s * 1.0, 0.95, 0.2], [s * 0.6, 0.72, 0.9], 0.05, 0.05, 6), stripe)]);
  const thr = [thruster(1.25, 0.2, -2.35, 0.3), thruster(-1.25, 0.2, -2.35, 0.3), thruster(0.8, 1.25, 0.25, 0.26, 'y'), thruster(-0.8, 1.25, 0.25, 0.26, 'y')];
  const lamps = [1, -1].flatMap((s) => [paint(new THREE.CircleGeometry(0.13, 14).translate(s * 1.18, -0.45, 1.75), 0xfff4d8), paint(new THREE.CircleGeometry(0.1, 14).translate(s * 0.9, 1.1, 0.62), 0xfff4d8)]);
  const lampRims = [1, -1].map((s) => paint(new THREE.TorusGeometry(0.14, 0.03, 5, 14).translate(s * 1.18, -0.45, 1.74), 0x8a8f96));
  // Inside the sphere: a seat, the control console and a joystick.
  const seat = [paint(smooth(box(0.55, 0.12, 0.5, 0, -0.62, 0.95)), 0x1d1f23), paint(smooth(box(0.55, 0.6, 0.12, 0, -0.3, 0.68)), 0x1d1f23)];
  const deck = paint(new THREE.CircleGeometry(0.78, 24).rotateX(-Math.PI / 2).translate(S[0], -0.66, S[2]), 0x3a3f47);
  const dash = panel(0.8, 0.26, 0, -0.22, 1.82, 0.95, { gauges: 3, screen: true });
  const dashStand = paint(box(0.5, 0.45, 0.12, 0, -0.52, 1.86), 0x2a2d33);
  const stick = [paint(rod([0.22, -0.55, 1.3], [0.22, -0.3, 1.38], 0.02, 0.02, 6), 0x15171a), paint(sphere(0.035, 8, 6).translate(0.22, -0.28, 1.39), 0x15171a)];
  const pilot = seatedPilot({ suit: stripe, hands: 'stick', lean: 0.1 }).translate(0, -0.62, 0.95);
  return assemble({
    body: [...pontoons, top, hoop.clone ? hoop : hoop],
    matte: [...pods, belly, ...seat, deck, ...dash.matte, dashStand, ...stick, ...thr.flatMap((t) => t.matte), ...frame],
    metal: [hatch, ...skids, ...lampRims, ...dash.metal, ...thr.flatMap((t) => t.metal)],
    glass: [glass],
    glow: [...lamps, ...dash.glow],
    pilot: [pilot],
    eye: [0, 0.28, 1.0],
    nose: [0, -0.55, 2.0],
    lamps: [[1.18, -0.45, 1.8], [-1.18, -0.45, 1.8]],
  });
}

function orcaSub(color, stripe, seed) {
  const hull = paintBy(
    loft(
      [
        [-3.6, 0.12, 0.12, 0, 2],
        [-3.2, 0.42, 0.42, 0, 2],
        [-2.0, 0.78, 0.78, 0, 2],
        [0.0, 0.86, 0.86, 0, 2],
        [2.0, 0.82, 0.82, 0, 2],
        [2.9, 0.62, 0.62, 0, 2],
        [3.1, 0.45, 0.45, 0, 2],
      ],
      24,
    ),
    (x, y) => (y < -0.3 ? 0x1f2429 : Math.abs(y + 0.12) < 0.07 ? 0xf2f2f2 : y > 0.55 ? stripe : color),
  );
  const dome = new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.25).translate(0, 0, 3.08);
  const domeRing = paint(new THREE.TorusGeometry(0.47, 0.05, 6, 24).translate(0, 0, 3.08), 0x8a8f96);
  const sail = paintBy(
    loft(
      [
        [-0.7, 0.05, 0.3, 1.0, 2],
        [-0.4, 0.24, 0.5, 1.0, 2.6],
        [0.6, 0.26, 0.5, 1.0, 2.6],
        [1.1, 0.05, 0.3, 1.0, 2],
      ],
      14,
    ),
    () => color,
  );
  const sailWin = [1, -1].map((s) => new THREE.CircleGeometry(0.1, 12).rotateY((s * Math.PI) / 2).translate(s * 0.265, 1.2, 0.5));
  const ports = [1, -1].flatMap((s) => [1.4, 0.4, -0.6].map((z) => new THREE.CircleGeometry(0.13, 14).rotateY((s * Math.PI) / 2).translate(s * 0.87, 0.18, z)));
  const portRims = [1, -1].flatMap((s) => [1.4, 0.4, -0.6].map((z) => paint(new THREE.TorusGeometry(0.14, 0.025, 5, 14).rotateY((s * Math.PI) / 2).translate(s * 0.86, 0.18, z), 0x8a8f96)));
  const fin = (rz) => paint(box(0.08, 1.0, 0.8).translate(0, 0.75, 0).rotateZ(rz).translate(0, 0, -3.0), stripe);
  const tail = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(fin);
  const planes = [1, -1].map((s) => paint(box(0.8, 0.07, 0.45, s * 1.25, 0.95, 0.45), color));
  const shroud = thruster(0, 0, -3.75, 0.5);
  const pilot = seatedPilot({ suit: stripe, hands: 'stick', lean: 0.3 }).translate(0, -0.62, 2.1);
  const dash = panel(0.8, 0.24, 0, -0.32, 2.72, 1.1, { gauges: 3, screen: true });
  const interior = [paint(new THREE.CylinderGeometry(0.7, 0.62, 1.2, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2.2), 0x2a2e34)];
  return assemble({
    body: [hull, sail, ...tail, ...planes],
    matte: [...interior, ...dash.matte, ...shroud.matte],
    metal: [domeRing, ...portRims, ...dash.metal, ...shroud.metal],
    glass: [dome, ...sailWin, ...ports],
    glow: [...dash.glow, paint(new THREE.CircleGeometry(0.09, 12).translate(0.45, -0.4, 2.72), 0xfff4d8), paint(new THREE.CircleGeometry(0.09, 12).translate(-0.45, -0.4, 2.72), 0xfff4d8)],
    pilot: [pilot],
    eye: [0, 0.08, 2.75],
    nose: [0, -0.7, 3.2],
    lamps: [[0.45, -0.4, 2.9], [-0.45, -0.4, 2.9]],
  });
}

function mantaSub(color, stripe, seed) {
  const body = paintBy(
    loft(
      [
        [-2.8, 0.2, 0.12, 0.05, 2.4],
        [-2.0, 0.55, 0.32, 0.0, 2.6],
        [0.0, 0.62, 0.4, 0.0, 2.6],
        [1.6, 0.55, 0.36, 0.0, 2.4],
        [2.6, 0.3, 0.22, -0.02, 2.2],
        [3.0, 0.08, 0.08, -0.04, 2],
      ],
      20,
    ),
    (x, y) => (y < -0.15 ? 0x23282e : color),
  );
  const wing = (s) => {
    const g = new THREE.BufferGeometry();
    const P = [
      [0.5, 0, 0.9],
      [2.4, -0.25, -0.4],
      [2.4, -0.25, -1.1],
      [0.5, 0, -1.5],
    ];
    const t = 0.07;
    const v = [];
    const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    const up = P.map(([x, y, z]) => [s * x, y + t, z]);
    const dn = P.map(([x, y, z]) => [s * x, y - t, z]);
    if (s > 0) {
      quad(up[0], up[3], up[2], up[1]);
      quad(dn[0], dn[1], dn[2], dn[3]);
    } else {
      quad(up[0], up[1], up[2], up[3]);
      quad(dn[0], dn[3], dn[2], dn[1]);
    }
    for (let k = 0; k < 4; k++) {
      const a = up[k];
      const b = up[(k + 1) % 4];
      const c = dn[(k + 1) % 4];
      const d = dn[k];
      if (s > 0) quad(a, b, c, d);
      else quad(a, d, c, b);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return paintBy(g, (x) => (Math.abs(x) > 2.1 ? stripe : color));
  };
  const winglets = [1, -1].map((s) => paint(box(0.06, 0.7, 0.7, s * 2.42, -0.05, -0.75), stripe));
  const tails = [1, -1].map((s) => paint(box(0.06, 0.8, 0.7).rotateZ(s * 0.35).translate(s * 0.45, 0.55, -2.35), stripe));
  const thr = [thruster(0.9, -0.05, -2.0, 0.28), thruster(-0.9, -0.05, -2.0, 0.28)];
  const canopies = [
    new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.38, 0.85).translate(0, 0.32, 1.25),
    new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.4, 0.34, 0.75).translate(0, 0.32, -0.35),
  ];
  const seats = [1.0, -0.55].map((z) => paint(smooth(box(0.5, 0.1, 0.9, 0, -0.1, z)), 0x1d1f23));
  const dash = panel(0.62, 0.18, 0, 0.18, 1.85, 1.2, { gauges: 2, screen: true });
  const pilots = [seatedPilot({ suit: stripe, hands: 'stick', lean: 0.95 }).translate(0, -0.12, 0.75), seatedPilot({ suit: color, hands: 'stick', lean: 0.95 }).translate(0, -0.12, -0.8)];
  return assemble({
    body: [body, wing(1), wing(-1), ...winglets, ...tails],
    matte: [...seats, ...dash.matte, ...thr.flatMap((t) => t.matte)],
    metal: [...dash.metal, ...thr.flatMap((t) => t.metal)],
    glass: canopies,
    glow: [...dash.glow, paint(new THREE.CircleGeometry(0.08, 10).translate(0.3, -0.05, 2.62), 0xfff4d8), paint(new THREE.CircleGeometry(0.08, 10).translate(-0.3, -0.05, 2.62), 0xfff4d8)],
    pilot: pilots,
    eye: [0, 0.52, 1.35],
    nose: [0, -0.2, 3.0],
    lamps: [[0.3, -0.05, 2.8], [-0.3, -0.05, 2.8]],
  });
}

// ------------------------------------------------------------------ planes

/** Aerofoil loop (chord 1, leading edge at +0.5 in z), `n` points round. */
function aerofoil(n = 14, thick = 0.12, camber = 0.03) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = (1 - Math.cos(a)) / 2; // 0 at the trailing edge → 1 at the leading edge → 0
    const t = 1 - x; // 0 leading edge, 1 trailing edge
    const yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const yc = camber * 4 * t * (1 - t);
    pts.push([k < n / 2 ? yc + yt : yc - yt, 0.5 - t]);
  }
  return pts;
}

/**
 * A wing (both halves, or one when `half`): span, root and tip chord,
 * thickness, sweep of the tip (m back), dihedral (m up at the tip),
 * at (x0, y0, z0). `vertical` makes a fin.
 */
function wing({ span, root, tip, thick = 0.12, sweep = 0, dihedral = 0, x0 = 0, y0 = 0, z0 = 0, half = false, vertical = false, stations = 4 }) {
  const foil = aerofoil(16, thick);
  const pos = [];
  const idx = [];
  const sides = half ? [1] : [1, -1];
  for (const s of sides) {
    const base = pos.length / 3;
    for (let i = 0; i <= stations; i++) {
      const f = i / stations;
      const chord = root + (tip - root) * f;
      const along = f * (span / (half ? 1 : 2));
      for (const [y, z] of foil) {
        const P = [s * along, y * chord + dihedral * f, z * chord - sweep * f];
        if (vertical) pos.push(P[1] * 0 + y * chord * 0.6 * 0 + (y * chord) * 1, along, P[2]);
        else pos.push(P[0], P[1], P[2]);
      }
    }
    const n = foil.length;
    for (let i = 0; i < stations; i++) {
      for (let k = 0; k < n; k++) {
        const a = base + i * n + k;
        const b = base + i * n + ((k + 1) % n);
        const c = a + n;
        const d = b + n;
        if (s > 0 !== vertical) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    // Tip cap.
    const tipC = pos.length / 3;
    const t0 = base + stations * n;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < n; k++) {
      cx += pos[(t0 + k) * 3];
      cy += pos[(t0 + k) * 3 + 1];
      cz += pos[(t0 + k) * 3 + 2];
    }
    pos.push(cx / n, cy / n, cz / n);
    for (let k = 0; k < n; k++) {
      if (s > 0 !== vertical) idx.push(tipC, t0 + k, t0 + ((k + 1) % n));
      else idx.push(tipC, t0 + ((k + 1) % n), t0 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(x0, y0, z0);
  return g;
}

function landingGear(x, y, z, reach, spat = true) {
  const metal = [];
  const matte = [];
  const body = [];
  for (const s of [1, -1]) {
    const foot = [s * (x + reach * 0.55), y - reach, z];
    metal.push(paint(rod([s * x, y, z], foot, 0.05, 0.04, 6), 0x9aa0a8));
    matte.push(paint(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14).rotateZ(Math.PI / 2).translate(foot[0], foot[1] - 0.05, foot[2]), 0x151515));
    if (spat) body.push(paint(smooth(new THREE.CapsuleGeometry(0.18, 0.45, 4, 10)).rotateX(Math.PI / 2).scale(0.9, 1.2, 1).translate(foot[0], foot[1], foot[2] - 0.05), 0xf2f2f2));
  }
  return { metal, matte, body };
}

function racerPlane(color, stripe, seed) {
  const sun = new THREE.Color(stripe);
  const fus = paintBy(
    loft(
      [
        [3.05, 0.44, 0.44, 0.02, 2],
        [2.5, 0.54, 0.55, 0.02, 2.2],
        [1.2, 0.54, 0.6, 0.05, 2.3],
        [0.0, 0.47, 0.56, 0.08, 2.3],
        [-1.5, 0.3, 0.4, 0.12, 2.2],
        [-2.9, 0.12, 0.24, 0.24, 2],
        [-3.35, 0.05, 0.14, 0.3, 2],
      ],
      18,
    ),
    (x, y, z) => (Math.sin((z + y * 1.6) * 2.2) > 0.55 ? sun : color),
  );
  const cowl = paint(new THREE.TorusGeometry(0.43, 0.04, 6, 20).translate(0, 0.02, 3.05), 0x1a1c20);
  const spinner = paint(smooth(new THREE.ConeGeometry(0.2, 0.5, 14)).rotateX(Math.PI / 2).translate(0, 0.02, 3.3), stripe);
  const wings = paintBy(wing({ span: 7.4, root: 1.75, tip: 0.95, thick: 0.15, sweep: 0.15, dihedral: 0.05, y0: -0.28, z0: 0.95 }), (x) => (Math.abs(x) > 3.2 ? stripe : color));
  const hstab = paint(wing({ span: 2.7, root: 0.85, tip: 0.55, thick: 0.1, sweep: 0.2, y0: 0.26, z0: -2.95 }), color);
  const fin = paint(wing({ span: 1.25, root: 1.05, tip: 0.55, thick: 0.1, sweep: 0.45, x0: 0, y0: 0.3, z0: -2.95, half: true, vertical: true }), stripe);
  const canopy = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.44, 1.05).translate(0, 0.46, -0.3);
  // Canopy rail: a frame round the base of the bubble.
  const frame = paint(new THREE.TorusGeometry(1, 0.025, 5, 32).rotateX(Math.PI / 2).scale(0.42, 1, 1.05).translate(0, 0.47, -0.3), 0x16181c);
  const gear = landingGear(0.35, -0.35, 1.45, 0.85);
  const tailWheel = paint(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10).rotateZ(Math.PI / 2).translate(0, 0.02, -3.25), 0x151515);
  const dash = panel(0.72, 0.28, 0, 0.36, 0.52, 0.45, { gauges: 5, screen: false });
  const glare = paint(smooth(box(0.78, 0.07, 0.25, 0, 0.53, 0.6)), 0x1a1c20);
  const stick = [paint(rod([0, -0.25, 0.1], [0, 0.08, 0.28], 0.02, 0.018, 6), 0x15171a), paint(sphere(0.035, 8, 6).translate(0, 0.1, 0.29), 0x15171a)];
  const pilot = seatedPilot({ suit: stripe, helmet: color, hands: 'stick', lean: 0.35 }).translate(0, -0.28, -0.4);
  return assemble({
    body: [fus, wings, hstab, fin, spinner, ...gear.body],
    matte: [cowl, tailWheel, ...gear.matte, ...dash.matte, glare, ...stick, frame],
    metal: [...gear.metal, ...dash.metal],
    glass: [canopy],
    glow: [...dash.glow, paint(sphere(0.06, 8, 6).translate(3.7, -0.24, 0.55), 0xff2020), paint(sphere(0.06, 8, 6).translate(-3.7, -0.24, 0.55), 0x20ff40)],
    pilot: [pilot],
    eye: [0, 0.78, -0.35],
    nose: [3.0, -0.2, 1.0],
    props: [{ pos: [0, 0.02, 3.42], r: 1.0 }],
    gear: 1.49,
    tailSit: 0.27,
  });
}

function biplane(color, stripe, seed) {
  const fus = paintBy(
    loft(
      [
        [2.3, 0.5, 0.5, 0.05, 2],
        [1.6, 0.52, 0.55, 0.05, 2.4],
        [0.0, 0.45, 0.52, 0.08, 2.6],
        [-1.5, 0.28, 0.38, 0.12, 2.4],
        [-2.8, 0.1, 0.2, 0.22, 2],
      ],
      18,
    ),
    (x, y) => (y > 0.3 ? stripe : color),
  );
  // Radial engine: a round cowling with cylinder heads showing.
  const cowl = paint(new THREE.CylinderGeometry(0.58, 0.52, 0.5, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0.05, 2.45), stripe);
  const heads = Array.from({ length: 7 }, (_, k) => {
    const a = (k / 7) * Math.PI * 2;
    return paint(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8).rotateZ(a + Math.PI / 2).translate(Math.cos(a) * 0.38, 0.05 + Math.sin(a) * 0.38, 2.6), 0x55595f);
  });
  const spinner = paint(smooth(new THREE.ConeGeometry(0.16, 0.35, 12)).rotateX(Math.PI / 2).translate(0, 0.05, 2.85), 0xdddddd);
  const upper = paint(wing({ span: 6.4, root: 1.15, tip: 1.15, thick: 0.1, sweep: 0.15, y0: 1.1, z0: 0.95 }), color);
  const lower = paint(wing({ span: 6.0, root: 1.1, tip: 1.1, thick: 0.1, dihedral: 0.12, y0: -0.35, z0: 0.75 }), color);
  const struts = [];
  for (const s of [1, -1]) {
    struts.push(paint(rod([s * 2.5, -0.23, 0.95], [s * 2.5, 1.02, 1.1], 0.035, 0.035, 6), 0x2a2a2a));
    struts.push(paint(rod([s * 2.5, -0.23, 0.35], [s * 2.5, 1.02, 0.5], 0.035, 0.035, 6), 0x2a2a2a));
    struts.push(paint(rod([s * 0.3, 0.45, 1.3], [s * 0.45, 1.05, 1.25], 0.03, 0.03, 6), 0x2a2a2a));
    struts.push(paint(rod([s * 0.3, 0.45, 0.6], [s * 0.45, 1.05, 0.7], 0.03, 0.03, 6), 0x2a2a2a));
  }
  const wires = [];
  for (const s of [1, -1]) wires.push(s * 0.3, -0.3, 0.9, s * 2.5, 1.02, 0.95, s * 0.45, 1.05, 1.0, s * 2.5, -0.23, 0.8);
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const hstab = paint(wing({ span: 2.4, root: 0.8, tip: 0.6, thick: 0.08, y0: 0.22, z0: -2.55 }), color);
  const fin = paint(wing({ span: 1.0, root: 0.9, tip: 0.5, thick: 0.08, sweep: 0.3, y0: 0.26, z0: -2.55, half: true, vertical: true }), stripe);
  const screen = new THREE.PlaneGeometry(0.5, 0.26).rotateX(-0.5).translate(0, 0.67, -0.35);
  const rim = paint(new THREE.TorusGeometry(0.34, 0.05, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 1.5).translate(0, 0.57, -0.95), 0x5a3a22);
  const gear = landingGear(0.3, -0.35, 1.05, 0.8, false);
  const dash = panel(0.55, 0.22, 0, 0.42, -0.45, 0.3, { gauges: 4, screen: false, color: 0x4a3222 });
  const pilot = seatedPilot({ suit: 0x6a4a2a, hands: 'stick', lean: 0.1, open: true }).translate(0, -0.35, -1.0);
  return assemble({
    body: [fus, upper, lower, hstab, fin, cowl, spinner],
    matte: [...struts, rim, ...gear.matte, ...dash.matte],
    metal: [...heads, ...gear.metal, ...dash.metal],
    glass: [screen],
    glow: [...dash.glow],
    pilot: [pilot],
    lines: [lines],
    eye: [0, 0.78, -0.95],
    nose: [2.6, 1.3, 1.0],
    props: [{ pos: [0, 0.05, 2.98], r: 1.05 }],
    gear: 1.44,
    tailSit: 0.22,
  });
}

function jetPlane(color, stripe, seed) {
  const fus = paintBy(
    loft(
      [
        [4.3, 0.04, 0.04, -0.05, 2],
        [3.6, 0.3, 0.3, -0.02, 2],
        [2.4, 0.5, 0.52, 0.02, 2.2],
        [0.5, 0.58, 0.6, 0.05, 2.4],
        [-1.5, 0.52, 0.52, 0.06, 2.4],
        [-3.2, 0.36, 0.38, 0.08, 2.2],
        [-3.9, 0.34, 0.34, 0.08, 2],
      ],
      20,
    ),
    (x, y, z) => (y < -0.25 ? 0xe8e8e8 : z > 3.2 ? 0x1c1f24 : Math.abs(y - 0.05) < 0.08 && z < 2 ? stripe : color),
  );
  const intakes = [1, -1].map((s) => paint(smooth(box(0.36, 0.5, 1.4, s * 0.62, 0.02, 0.2)), color));
  const intakeHoles = [1, -1].map((s) => paint(new THREE.PlaneGeometry(0.3, 0.42).translate(s * 0.62, 0.02, 0.91), 0x0a0a0a));
  const wings = paint(wing({ span: 7.6, root: 2.3, tip: 1.1, thick: 0.1, sweep: 0.9, dihedral: 0.12, y0: -0.18, z0: -0.2 }), color);
  const tanks = [1, -1].map((s) => paint(smooth(new THREE.CapsuleGeometry(0.2, 1.3, 4, 12)).rotateX(Math.PI / 2).translate(s * 3.82, -0.06, -0.75), stripe));
  const hstab = paint(wing({ span: 3.0, root: 1.1, tip: 0.55, thick: 0.08, sweep: 0.5, y0: 0.2, z0: -3.1 }), color);
  const fin = paint(wing({ span: 1.5, root: 1.5, tip: 0.6, thick: 0.08, sweep: 0.9, y0: 0.4, z0: -2.9, half: true, vertical: true }), stripe);
  const canopy = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.46, 0.5, 1.5).translate(0, 0.5, 1.2);
  const frame = paint(new THREE.TorusGeometry(0.46, 0.03, 6, 20, Math.PI).translate(0, 0.5, 0.35), 0x16181c);
  const nozzle = paint(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0.08, -4.05), 0x55595f);
  const gear = landingGear(0.3, -0.45, 0.05, 0.9, false);
  const noseGear = [paint(rod([0, -0.4, 2.6], [0, -1.3, 2.65], 0.04, 0.04, 6), 0x9aa0a8), paint(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12).rotateZ(Math.PI / 2).translate(0, -1.33, 2.65), 0x151515)];
  const dash = panel(0.8, 0.3, 0, 0.38, 2.05, 0.5, { gauges: 4, screen: true });
  const glare = paint(smooth(box(0.85, 0.07, 0.3, 0, 0.56, 2.15)), 0x1a1c20);
  const seat = paint(smooth(box(0.5, 0.9, 0.2, 0, 0.1, 0.55)), 0x2a2d33);
  const pilot = seatedPilot({ suit: 0x4a5a3a, helmet: 0xe8e8e8, hands: 'stick', lean: 0.35 }).translate(0, -0.3, 1.0);
  return assemble({
    body: [fus, ...intakes, wings, ...tanks, hstab, fin],
    matte: [...intakeHoles, frame, ...gear.matte, ...dash.matte, glare, seat, noseGear[1]],
    metal: [nozzle, ...gear.metal, noseGear[0], ...dash.metal],
    glass: [canopy],
    glow: [...dash.glow, paint(sphere(0.06, 8, 6).translate(3.82, -0.06, -0.05), 0xff2020), paint(sphere(0.06, 8, 6).translate(-3.82, -0.06, -0.05), 0x20ff40)],
    pilot: [pilot],
    eye: [0, 0.82, 1.05],
    nose: [0, -0.5, 3.0],
    jets: [{ pos: [0, 0.08, -4.25], r: 0.28, color: 0xffa050 }],
    gear: 1.62,
  });
}

// ------------------------------------------------------------------ gliders

/**
 * A ram-air canopy: `cells` aerofoil cells round an arc, open at the
 * leading edge, sewn from panels (aFab.x = across the cell, aFab.y =
 * along the chord, for the seams and ripstop in the fabric shader).
 */
function canopy({ span = 10.5, arc = 1.9, chord = 2.6, cells = 13, height = 7.4, colors, thick = 0.16 }) {
  const R = span / 2 / Math.sin(arc / 2);
  const foil = aerofoil(18, thick, 0.04);
  const n = foil.length;
  const pos = [];
  const col = [];
  const fab = [];
  const c = new THREE.Color();
  const ribs = [];
  for (let i = 0; i <= cells; i++) {
    const t = i / cells - 0.5;
    const a = t * arc;
    const ch = chord * (1 - Math.abs(t * 2) ** 2 * 0.38);
    const cx = Math.sin(a) * R;
    const cy = height - (1 - Math.cos(a)) * R;
    ribs.push(foil.map(([y, z]) => {
      // Rib in its own plane, tilted with the arc.
      const ly = y * ch;
      return [cx + Math.sin(a) * ly, cy + Math.cos(a) * ly, z * ch + ch * 0.05];
    }));
  }
  for (let i = 0; i < cells; i++) {
    c.set(colors[i % colors.length]);
    const A = ribs[i];
    const B = ribs[i + 1];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      // Leave the cell mouths open: the front of the lower surface.
      const tz = (A[k][2] + A[k2][2]) / 2;
      const lower = k >= n / 2;
      if (lower && tz > chord * 0.28) continue;
      const u0 = k / n;
      const u1 = (k + 1) / n;
      const tri = [
        [A[k], 0, u0],
        [B[k], 1, u0],
        [A[k2], 0, u1],
        [A[k2], 0, u1],
        [B[k], 1, u0],
        [B[k2], 1, u1],
      ];
      for (const [p, fx, fy] of tri) {
        pos.push(...p);
        col.push(c.r, c.g, c.b);
        fab.push(fx, fy);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFab', new THREE.Float32BufferAttribute(fab, 2));
  g.computeVertexNormals();
  // Suspension lines: from the risers at the pilot's shoulders to each rib, front and back.
  const lines = [];
  for (let i = 0; i <= cells; i += 1) {
    const r = ribs[i];
    const lead = r[Math.floor(n * 0.75)];
    const trail = r[Math.floor(n * 0.5)];
    const side = Math.sign(r[0][0]) || 1;
    const riser = [side * 0.25, 1.05, 0.05];
    const casc = [lead[0] * 0.45 + riser[0] * 0.55, riser[1] + (lead[1] - riser[1]) * 0.45, 0.1];
    lines.push(...riser, ...casc, ...casc, ...lead, ...casc, ...trail);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  return { fabric: g, lines: lg };
}

function harness(color, y = 0) {
  return [paint(smooth(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10)).rotateX(Math.PI / 2 - 0.25).translate(0, -0.1 + y, 0.2), 0x1d2229), paint(smooth(box(0.5, 0.65, 0.18, 0, 0.35 + y, -0.22)), color), paint(smooth(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8)).rotateX(Math.PI / 2).translate(0, -0.25 + y, -0.45), color)];
}

function paraGlider(color, stripe, seed, kind = 'para') {
  const cfg = {
    para: { span: 10.5, arc: 1.9, chord: 2.6, cells: 15, height: 7.4, colors: [color, color, stripe, 0xf2f2f2] },
    speed: { span: 7.8, arc: 2.2, chord: 2.1, cells: 13, height: 5.8, colors: [color, stripe] },
    tandem: { span: 12.8, arc: 1.8, chord: 3.1, cells: 17, height: 8.6, colors: [color, 0xf2f2f2, stripe, 0xf2f2f2] },
  }[kind];
  const { fabric, lines } = canopy(cfg);
  const pilots = [seatedPilot({ suit: stripe, helmet: color, hands: 'up', lean: 0.35 }).translate(0, -0.3, 0)];
  const matte = harness(color);
  if (kind === 'tandem') {
    pilots.push(seatedPilot({ suit: 0x2b6ad0, helmet: 0xf2f2f2, hands: 'wheel', lean: 0.3 }).translate(0, -0.55, 0.65));
    matte.push(...harness(0x2b6ad0, -0.25).map((g) => g.translate(0, 0, 0.65)));
  }
  // Brake toggles in the hands.
  const toggles = [1, -1].map((s) => paint(box(0.05, 0.14, 0.05, s * 0.3, 0.72, 0.08), 0xff3b2b));
  return assemble({
    fabric: [fabric],
    lines: [lines],
    matte: [...matte, ...toggles],
    pilot: pilots,
    eye: [0, 0.95, 0.12],
    nose: [0, 0.2, 1.2],
    canopyUp: cfg.height,
  });
}

function hangGlider(color, stripe, seed) {
  // Delta sail over a frame of tubes; the pilot hangs prone below the keel.
  const nose = [0, 1.75, 2.1];
  const tipL = [5.0, 1.55, -1.1];
  const keelEnd = [0, 1.8, -2.1];
  const pos = [];
  const col = [];
  const fab = [];
  const c = new THREE.Color();
  const N = 12;
  const V = 5;
  const P = (u, v) => {
    const s = Math.sign(u) || 1;
    const au = Math.abs(u);
    const L = [nose[0] + (tipL[0] * s - nose[0]) * au, nose[1] + (tipL[1] - nose[1]) * au, nose[2] + (tipL[2] - nose[2]) * au];
    const T = [keelEnd[0] + (tipL[0] * s + 0.05 * s - keelEnd[0]) * au, keelEnd[1] + (tipL[1] - keelEnd[1]) * au, keelEnd[2] + (tipL[2] - 0.35 - keelEnd[2]) * au];
    const billow = Math.sin(Math.PI * v) * (1 - au) * 0.28 + Math.sin(Math.PI * v) * 0.08;
    return [L[0] + (T[0] - L[0]) * v, L[1] + (T[1] - L[1]) * v + billow, L[2] + (T[2] - L[2]) * v];
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < V; j++) {
      const u0 = (i / N) * 2 - 1;
      const u1 = ((i + 1) / N) * 2 - 1;
      const v0 = j / V;
      const v1 = (j + 1) / V;
      c.set(Math.abs(u0 + u1) / 2 > 0.66 ? stripe : j === 0 ? 0xf2f2f2 : color);
      const q = [
        [P(u0, v0), (i % 2) * 1, v0],
        [P(u0, v1), (i % 2) * 1, v1],
        [P(u1, v0), ((i + 1) % 2) * 1, v0],
        [P(u1, v0), ((i + 1) % 2) * 1, v0],
        [P(u0, v1), (i % 2) * 1, v1],
        [P(u1, v1), ((i + 1) % 2) * 1, v1],
      ];
      for (const [p, fx, fy] of q) {
        pos.push(...p);
        col.push(c.r, c.g, c.b);
        fab.push(fx, fy);
      }
    }
  }
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sail.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sail.setAttribute('aFab', new THREE.Float32BufferAttribute(fab, 2));
  sail.computeVertexNormals();
  const tubeC = 0x9aa0a8;
  const metal = [
    paint(rod(nose, tipL, 0.04, 0.03, 6), tubeC),
    paint(rod(nose, [-tipL[0], tipL[1], tipL[2]], 0.04, 0.03, 6), tubeC),
    paint(rod([0, 1.72, 2.2], keelEnd, 0.04, 0.035, 6), tubeC),
    paint(rod([-2.6, 1.68, 0.1], [2.6, 1.68, 0.1], 0.035, 0.035, 6), tubeC),
    paint(rod([0, 1.75, 0.15], [0, 2.6, 0.1], 0.03, 0.025, 6), tubeC),
    // The A-frame and its control bar.
    paint(rod([0, 1.7, 0.2], [0.65, -0.5, 0.55], 0.03, 0.03, 6), tubeC),
    paint(rod([0, 1.7, 0.2], [-0.65, -0.5, 0.55], 0.03, 0.03, 6), tubeC),
    paint(rod([-0.65, -0.5, 0.55], [0.65, -0.5, 0.55], 0.03, 0.03, 6), 0x1a1a1a),
  ];
  const wires = [];
  for (const p of [tipL, [-tipL[0], tipL[1], tipL[2]], nose, keelEnd]) wires.push(0, 2.6, 0.1, ...p, 0.65, -0.5, 0.55, ...p, -0.65, -0.5, 0.55, ...p);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  // Prone pilot: a seated figure turned face-down, head forward, hands on the bar.
  const pilot = seatedPilot({ suit: stripe, helmet: color, hands: 'bar', lean: 0, legs: 'hang' }).rotateX(Math.PI / 2).translate(0, 0.0, 0.2);
  const pod = paint(smooth(new THREE.CapsuleGeometry(0.28, 1.3, 4, 10)).rotateX(Math.PI / 2).translate(0, 0.05, -0.45), color);
  return assemble({
    fabric: [sail],
    lines: [lg],
    metal,
    matte: [pod],
    pilot: [pilot],
    eye: [0, 0.35, 1.15],
    nose: [0, 1.5, 2.4],
    canopyUp: 1.7,
  });
}

// ------------------------------------------------------------------ spaceships

function fighterShip(color, stripe, seed) {
  const body = paintBy(
    loft(
      [
        [5.2, 0.03, 0.02, 0, 2],
        [4.6, 0.3, 0.2, 0, 2],
        [3.0, 0.62, 0.4, 0, 2.2],
        [0.8, 0.78, 0.5, 0, 2.6],
        [-1.5, 0.8, 0.5, 0, 2.8],
        [-3.6, 0.7, 0.44, 0, 3],
        [-4.4, 0.62, 0.4, 0, 3],
      ],
      20,
    ),
    (x, y, z) => (y < -0.2 ? 0x2a2e34 : Math.abs(x) < 0.12 && z < 2 ? stripe : color),
  );
  const tri = (pts, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeVertexNormals();
    return paint(g, c);
  };
  const wingS = (s) => {
    const a = [s * 0.75, 0, 2.2];
    const b = [s * 5.6, -0.25, -3.2];
    const c = [s * 0.75, 0, -3.8];
    const top = s > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c];
    const bot = s > 0 ? [...a, ...b, ...c] : [...a, ...c, ...b];
    return [tri(top.map((v, i) => (i % 3 === 1 ? v + 0.08 : v)), color), tri(bot.map((v, i) => (i % 3 === 1 ? v - 0.08 : v)), stripe)];
  };
  const fins = [1, -1].map((s) => paint(box(0.12, 1.6, 1.8).rotateZ(s * 0.35).translate(s * 0.9, 0.9, -3.2), stripe));
  const nac = [1, -1].map((s) => paint(smooth(new THREE.CylinderGeometry(0.62, 0.7, 3.4, 16)).rotateX(Math.PI / 2).translate(s * 1.5, -0.1, -2.6), 0x3a3e45));
  const bells = [1, -1].map((s) => paint(new THREE.CylinderGeometry(0.55, 0.45, 0.4, 16, 1, true).rotateX(Math.PI / 2).translate(s * 1.5, -0.1, -4.4), 0x6a6e76));
  const canopy = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.85, 2.3).translate(0, 0.42, 1.5);
  const dash = panel(0.9, 0.3, 0, 0.45, 2.55, 0.6, { gauges: 3, screen: true });
  const hud = paint(new THREE.PlaneGeometry(0.34, 0.24).rotateX(-0.2).translate(0, 0.86, 2.4), 0x40ff80);
  const pilot = seatedPilot({ suit: 0x2a2e34, helmet: color, hands: 'stick', lean: 0.4 }).translate(0, -0.2, 1.25);
  return assemble({
    body: [body, ...wingS(1), ...wingS(-1), ...fins],
    matte: [...nac, ...dash.matte],
    metal: [...bells, ...dash.metal],
    glass: [canopy],
    glow: [...dash.glow, hud],
    pilot: [pilot],
    eye: [0, 0.78, 1.4],
    nose: [0, -0.4, 4.8],
    jets: [{ pos: [1.5, -0.1, -4.6], r: 0.5 }, { pos: [-1.5, -0.1, -4.6], r: 0.5 }],
  });
}

function shuttleShip(color, stripe, seed) {
  const body = paintBy(
    loft(
      [
        [4.6, 0.05, 0.05, -0.1, 2],
        [4.0, 0.5, 0.45, -0.05, 2],
        [2.8, 0.85, 0.75, 0.05, 2.4],
        [0.0, 0.95, 0.85, 0.1, 3],
        [-3.5, 0.95, 0.85, 0.1, 3],
        [-4.2, 0.9, 0.8, 0.1, 3],
      ],
      20,
    ),
    (x, y, z) => (y < -0.35 ? 0x16181c : z > 3.9 && y < 0.1 ? 0x16181c : color),
  );
  const tri = (pts, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeVertexNormals();
    return paint(g, c);
  };
  const wingS = (s) => {
    const a = [s * 0.8, -0.45, 1.8];
    const m = [s * 1.6, -0.5, -0.6];
    const b = [s * 4.2, -0.55, -3.6];
    const c = [s * 0.8, -0.45, -4.0];
    const top = (p) => p.map((v, i) => (i % 3 === 1 ? v + 0.07 : v));
    const bot = (p) => p.map((v, i) => (i % 3 === 1 ? v - 0.07 : v));
    const out = [];
    for (const [p, q, r] of [[a, m, c], [m, b, c]]) {
      const t = s > 0 ? [...p, ...r, ...q] : [...p, ...q, ...r];
      const d = s > 0 ? [...p, ...q, ...r] : [...p, ...r, ...q];
      out.push(tri(top(t), color), tri(bot(d), 0x16181c));
    }
    return out;
  };
  const tail = paint(wing({ span: 2.2, root: 2.2, tip: 0.8, thick: 0.08, sweep: 1.4, y0: 0.8, z0: -3.2, half: true, vertical: true }), stripe);
  const pods = [1, -1].map((s) => paint(smooth(new THREE.CapsuleGeometry(0.3, 1.6, 4, 12)).rotateX(Math.PI / 2).translate(s * 0.7, 0.85, -3.3), color));
  const bells = [[0, 0.35], [0.5, -0.25], [-0.5, -0.25]].map(([x, y]) => paint(new THREE.CylinderGeometry(0.34, 0.2, 0.6, 16, 1, true).rotateX(Math.PI / 2).translate(x, y, -4.5), 0x6a6e76));
  const windows = [
    new THREE.PlaneGeometry(0.5, 0.25).rotateX(-0.9).translate(0.3, 0.72, 3.25),
    new THREE.PlaneGeometry(0.5, 0.25).rotateX(-0.9).translate(-0.3, 0.72, 3.25),
    new THREE.PlaneGeometry(0.4, 0.22).rotateY(0.9).rotateX(-0.4).translate(0.7, 0.55, 3.0),
    new THREE.PlaneGeometry(0.4, 0.22).rotateY(-0.9).rotateX(-0.4).translate(-0.7, 0.55, 3.0),
  ];
  const cockpit = [paint(new THREE.CylinderGeometry(0.75, 0.7, 1.4, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0.25, 2.6), 0x2a2e34)];
  const dash = panel(1.0, 0.32, 0, 0.35, 3.1, 0.7, { gauges: 5, screen: true });
  const pilot = seatedPilot({ suit: 0xf2f2f2, helmet: 0xf2f2f2, hands: 'stick', lean: 0.3 }).translate(0.3, -0.25, 2.4);
  return assemble({
    body: [body, ...wingS(1), ...wingS(-1), tail, ...pods],
    matte: [...cockpit, ...dash.matte],
    metal: [...bells, ...dash.metal],
    glass: windows,
    glow: [...dash.glow],
    pilot: [pilot],
    eye: [0.3, 0.58, 2.55],
    nose: [0, -0.7, 4.3],
    jets: [{ pos: [0, 0.35, -4.85], r: 0.32 }, { pos: [0.5, -0.25, -4.85], r: 0.32 }, { pos: [-0.5, -0.25, -4.85], r: 0.32 }],
  });
}

function needleShip(color, stripe, seed) {
  const body = paintBy(
    loft(
      [
        [5.8, 0.02, 0.02, 0, 2],
        [4.0, 0.28, 0.26, 0, 2],
        [1.5, 0.48, 0.42, 0.02, 2.2],
        [-1.0, 0.45, 0.4, 0.04, 2.2],
        [-3.8, 0.2, 0.2, 0.05, 2],
      ],
      18,
    ),
    (x, y, z) => (Math.abs(y) < 0.08 ? stripe : color),
  );
  const pods = [1, -1].map((s) => paintBy(smooth(new THREE.CapsuleGeometry(0.46, 3.2, 6, 16)).rotateX(Math.PI / 2).translate(s * 2.3, -0.1, -1.0), (x, y, z) => (z > 0.7 ? stripe : 0x3a3e45)));
  const rings = [1, -1].map((s) => paint(new THREE.TorusGeometry(0.58, 0.07, 6, 22).translate(s * 2.3, -0.1, 0.2), 0x8a8f96));
  const struts = [1, -1].flatMap((s) => [paint(box(1.9, 0.08, 0.7, s * 1.3, -0.05, -0.9), color), paint(box(1.9, 0.06, 0.4, s * 1.3, -0.05, 0.5), stripe)]);
  const bells = [1, -1].map((s) => paint(new THREE.CylinderGeometry(0.44, 0.36, 0.5, 16, 1, true).rotateX(Math.PI / 2).translate(s * 2.3, -0.1, -2.9), 0x6a6e76));
  const canopy = new THREE.SphereGeometry(0.45, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.8, 2.4).translate(0, 0.3, 1.2);
  const dash = panel(0.62, 0.24, 0, 0.32, 2.1, 0.7, { gauges: 2, screen: true });
  const hud = paint(new THREE.PlaneGeometry(0.28, 0.2).rotateX(-0.2).translate(0, 0.68, 2.0), 0x40ff80);
  const pilot = seatedPilot({ suit: stripe, helmet: color, hands: 'stick', lean: 0.6 }).translate(0, -0.25, 0.95);
  return assemble({
    body: [body, ...pods, ...struts],
    matte: [...dash.matte],
    metal: [...rings, ...bells, ...dash.metal],
    glass: [canopy],
    glow: [...dash.glow, hud],
    pilot: [pilot],
    eye: [0, 0.62, 1.15],
    nose: [0, -0.35, 5.2],
    jets: [{ pos: [2.3, -0.1, -3.15], r: 0.4 }, { pos: [-2.3, -0.1, -3.15], r: 0.4 }],
  });
}

// ------------------------------------------------------------------ entry

const BUILDERS = {
  rib: ribBoat,
  offshore: offshoreBoat,
  runabout: runaboutBoat,
  bubble: bubbleSub,
  orca: orcaSub,
  manta: mantaSub,
  racer: racerPlane,
  biplane,
  jet: jetPlane,
  para: (c, s, seed) => paraGlider(c, s, seed, 'para'),
  speed: (c, s, seed) => paraGlider(c, s, seed, 'speed'),
  tandem: (c, s, seed) => paraGlider(c, s, seed, 'tandem'),
  hang: hangGlider,
  fighter: fighterShip,
  shuttle: shuttleShip,
  needle: needleShip,
};

const cache = new Map();

/** Model parts for a design in these colours (cached: racers share geometry when colours match). */
export function buildCraft(design, color, stripe, seed = 1) {
  const key = `${design}|${color}|${stripe}|${seed % 7}`;
  if (!cache.has(key)) cache.set(key, BUILDERS[design](color, stripe, seed));
  return cache.get(key);
}

/** Picks a design for racer number k in a race of `kind` (the player's choice first when given). */
export function designFor(kind, k, choice = null) {
  const list = DESIGNS[kind];
  if (choice && list.includes(choice)) return k === 0 ? choice : list[(list.indexOf(choice) + k) % list.length];
  return list[k % list.length];
}

// Shape helpers, shared with the city's cars.
export { loft, paint, paintBy, smooth, rod, tube };
