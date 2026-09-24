import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A motocross bike and its rider, modelled to the proportions of a real
 * 450: 1.48 m wheelbase, 21" front and 19" rear spoked wheels on knobbly
 * tyres, upside-down fork raked at 27°, alloy twin-spar frame and
 * swingarm, radiator shrouds and number plates, a single-cylinder engine
 * with its header wrapping round to the silencer — and a rider in full kit
 * (helmet with peak and goggles, jersey, pants, knee braces, tall boots).
 *
 * Moving parts are their own groups: the fork and bars steer about the
 * steering axis, the fork legs and front wheel slide with the suspension,
 * the swingarm swings the rear wheel, both wheels spin, and the whole
 * machine leans into turns about its tyres' contact line (pose()).
 *
 * Bike frame: +z forward, +x left, +y up; origin at the chassis centre of
 * mass, the ground `GROUND` below it at rest.
 */

const GROUND = -0.662; // tyre contact below the centre of mass at rest (from the suspension spec)
const REAR_R = 0.37;
const FRONT_R = 0.385;
const AXLE_F = new THREE.Vector3(0, GROUND + 0.37, 0.74);
const AXLE_R = new THREE.Vector3(0, GROUND + 0.37, -0.72);
const HEAD = new THREE.Vector3(0, GROUND + 0.93, 0.4); // steering head, middle of the head tube
const PIVOT = new THREE.Vector3(0, GROUND + 0.5, -0.14); // swingarm pivot
// Fork axis: from the front axle up and back through the head tube.
const FORK = new THREE.Vector3(0, 0.883, -0.469).normalize(); // 28° from vertical

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

let MATS = null;
function motoMaterials() {
  if (MATS) return MATS;
  MATS = {
    gloss: new THREE.MeshPhysicalMaterial({ name: 'פלסטיק אופנוע', vertexColors: true, roughness: 0.34, metalness: 0.02, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ name: 'אלומיניום', vertexColors: true, roughness: 0.3, metalness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ name: 'מנוע', vertexColors: true, roughness: 0.5, metalness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'גומי', vertexColors: true, roughness: 0.93, metalness: 0 }),
    fabric: new THREE.MeshStandardMaterial({ name: 'ביגוד רוכב', vertexColors: true, roughness: 0.82, metalness: 0 }),
    lens: new THREE.MeshPhysicalMaterial({ name: 'עדשת משקף', color: 0x6a3a10, roughness: 0.06, metalness: 0.9, clearcoat: 1 }),
    tail: new THREE.MeshStandardMaterial({ name: 'מחזיר אור', color: 0x400808, roughness: 0.3 }),
  };
  return MATS;
}

// ------------------------------------------------------------ geometry helpers

const col = (hex) => new THREE.Color(hex);

/** Prepares a piece for merging: non-indexed, no uv, one colour. */
function paint(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = color.isColor ? color : col(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Cylinder (tapered) between two points. */
function rod(a, b, r0, r1 = r0, seg = 8) {
  const d = _v.subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, d.clone().normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Rounded limb: tapered cylinder with ball ends. */
function limb(a, b, r0, r1, seg = 10) {
  const parts = [rod(a, b, r0, r1, seg)];
  const s0 = new THREE.SphereGeometry(r0, seg, 6);
  s0.translate(a.x, a.y, a.z);
  const s1 = new THREE.SphereGeometry(r1, seg, 6);
  s1.translate(b.x, b.y, b.z);
  parts.push(s0, s1);
  return parts;
}

/** Tube along a smooth path. */
function pipe(points, r, seg = 8, steps = 24) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, r, seg, false);
}

/**
 * Molded plastic panel from a side-view outline (z, y), `t` thick, with
 * rounded edges, set at x = off(z, y) (curving round what it covers).
 */
function panel(outline, t, off, bevel = 0.008) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getX(i);
    const y = p.getY(i);
    const w = p.getZ(i);
    p.setXYZ(i, off(z, y) + w, y + GROUND, z);
  }
  g.computeVertexNormals();
  return g;
}

const mirrorX = (g) => {
  const m = g.clone();
  m.scale(-1, 1, 1);
  // Flip winding back after the mirror.
  const p = m.attributes.position;
  const nrm = m.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    for (const att of [p, nrm, m.attributes.color].filter(Boolean)) {
      const a = [att.getX(i + 1), att.getY(i + 1), att.getZ(i + 1)];
      att.setXYZ(i + 1, att.getX(i + 2), att.getY(i + 2), att.getZ(i + 2));
      att.setXYZ(i + 2, a[0], a[1], a[2]);
    }
  }
  return m;
};

/** Knobbly tyre on a spoked rim (axle along x, centred on the origin). */
function wheel(R, rimR, width, discR, discSide, tyreC, rimC, hubC, spokeC, discC) {
  const out = { rubber: [], metal: [], dark: [] };
  // Tyre carcass: rounded section.
  const hw = width / 2;
  const prof = [];
  const sec = R - rimR;
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    prof.push(new THREE.Vector2(rimR + sec * 0.5 + Math.cos(a) * sec * 0.5, Math.sin(a) * hw));
  }
  const tyre = new THREE.LatheGeometry(prof, 40);
  tyre.rotateZ(Math.PI / 2);
  out.rubber.push(paint(tyre, tyreC));
  // Knobs: staggered rows of square blocks over the crown and shoulders.
  const knob = new THREE.BoxGeometry(0.022, 0.032, 0.03);
  const rows = [
    [0, 0, 0.018],
    [0.5, hw * 0.55, 0.016],
    [0.5, -hw * 0.55, 0.016],
    [0, hw * 0.92, 0.014],
    [0, -hw * 0.92, 0.014],
  ];
  const N = 34;
  for (const [phase, x, h] of rows) {
    for (let k = 0; k < N; k++) {
      const a = ((k + phase) / N) * Math.PI * 2;
      const shoulder = Math.abs(x) / hw;
      const r = R - sec * 0.14 * shoulder * shoulder + h * 0.4;
      const g = knob.clone();
      g.scale(1, h / 0.032, 1);
      g.rotateX(a);
      g.translate(x, Math.cos(a) * r, Math.sin(a) * r);
      out.rubber.push(paint(g, tyreC));
    }
  }
  // Rim: a channel with lips.
  const rp = [];
  for (const [r, x] of [[rimR - 0.012, -hw * 0.62], [rimR + 0.012, -hw * 0.66], [rimR + 0.016, -hw * 0.5], [rimR - 0.004, -hw * 0.3], [rimR - 0.004, hw * 0.3], [rimR + 0.016, hw * 0.5], [rimR + 0.012, hw * 0.66], [rimR - 0.012, hw * 0.62], [rimR - 0.012, -hw * 0.62]]) rp.push(new THREE.Vector2(r, x));
  const rim = new THREE.LatheGeometry(rp, 40);
  rim.rotateZ(Math.PI / 2);
  out.metal.push(paint(rim, rimC));
  // Hub and its spoke flanges.
  out.metal.push(paint(rod(new THREE.Vector3(-0.07, 0, 0), new THREE.Vector3(0.07, 0, 0), 0.03, 0.03, 12), hubC));
  for (const x of [-0.05, 0.05]) out.metal.push(paint(rod(new THREE.Vector3(x - 0.006, 0, 0), new THREE.Vector3(x + 0.006, 0, 0), 0.052, 0.052, 16), hubC));
  // 36 spokes, laced tangentially from alternate flanges.
  for (let k = 0; k < 36; k++) {
    const side = k % 2 ? 1 : -1;
    const a0 = (k / 36) * Math.PI * 2;
    const a1 = a0 + side * 0.42 * (k % 4 < 2 ? 1 : -1);
    const h = new THREE.Vector3(side * 0.05, Math.cos(a1) * 0.048, Math.sin(a1) * 0.048);
    const r = new THREE.Vector3(side * hw * 0.25, Math.cos(a0) * (rimR - 0.01), Math.sin(a0) * (rimR - 0.01));
    out.metal.push(paint(rod(h, r, 0.0026, 0.0026, 3), spokeC));
  }
  // Brake disc (wavy "petal" edge) on one side.
  const disc = new THREE.Shape();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const r = discR * (1 - 0.05 * (0.5 + 0.5 * Math.cos(a * 12)));
    k === 0 ? disc.moveTo(Math.cos(a) * r, Math.sin(a) * r) : disc.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, discR * 0.55, 0, Math.PI * 2, true);
  disc.holes.push(hole);
  const dg = new THREE.ExtrudeGeometry(disc, { depth: 0.004, bevelEnabled: false, curveSegments: 4 });
  dg.rotateY(Math.PI / 2);
  dg.translate(discSide * 0.075, 0, 0);
  out.dark.push(paint(dg, discC));
  return out;
}

/** Number-plate texture: white background, black race number (cached). */
const plateCache = new Map();
function plateTexture(number) {
  let t = plateCache.get(number);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = '#f3f3ef';
  c.fillRect(0, 0, 256, 192);
  c.fillStyle = '#101010';
  c.font = '900 150px system-ui, "Arial Black", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(number), 128, 104);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.keep = true;
  plateCache.set(number, t);
  return t;
}

// ------------------------------------------------------------ the model

/**
 * Builds one bike with its rider. `color`: the team colour (plastics,
 * jersey, helmet), `stripe`: the second colour, `number`: race number.
 */
export function createMotoModel(materials, { color = '#e0262b', number = 1, stripe = '#111111' } = {}) {
  const M = motoMaterials();
  const team = col(color);
  const accent = col(stripe);
  const white = col(0xf2f2ee);
  const black = col(0x141416);
  const alu = col(0xc3c6cb);
  const gold = col(0xd1a542);
  const ti = col(0x9a9ca2);
  const dark = col(0x2b2d31);
  const rubber = col(0x161616);

  const root = new THREE.Group();
  root.name = 'אופנוע';
  const lean = new THREE.Group();
  lean.position.y = GROUND;
  root.add(lean);
  const body = new THREE.Group();
  body.position.y = -GROUND;
  lean.add(body);

  const buckets = () => ({ gloss: [], metal: [], dark: [], rubber: [], fabric: [] });
  const B = buckets(); // the static body
  const at = (y, z, x = 0) => new THREE.Vector3(x, GROUND + y, z); // heights from the ground

  // ---- frame: twin alloy spars from the head tube round the engine to the swingarm pivot, and the subframe
  for (const s of [1, -1]) {
    B.metal.push(paint(pipe([at(0.97, 0.37, s * 0.03), at(0.9, 0.2, s * 0.12), at(0.8, 0.0, s * 0.13), at(0.62, -0.12, s * 0.12), at(0.48, -0.15, s * 0.11)], 0.024, 8, 20), alu));
    B.metal.push(paint(pipe([at(0.88, 0.36, s * 0.02), at(0.62, 0.36, s * 0.05), at(0.36, 0.26, s * 0.07), at(0.32, 0.02, s * 0.08), at(0.4, -0.12, s * 0.09)], 0.014, 6, 16), alu));
    B.metal.push(paint(pipe([at(0.78, -0.08, s * 0.1), at(0.86, -0.4, s * 0.09), at(0.92, -0.62, s * 0.06)], 0.012, 6, 10), alu));
    B.metal.push(paint(pipe([at(0.56, -0.12, s * 0.1), at(0.76, -0.42, s * 0.09), at(0.9, -0.6, s * 0.06)], 0.01, 6, 10), alu));
  }
  B.metal.push(paint(rod(at(0.84, 0.44), at(1.02, 0.36), 0.032, 0.032, 12), alu)); // head tube
  // ---- engine: crankcases, cylinder and head, covers
  const cases = new THREE.BoxGeometry(0.2, 0.2, 0.34, 2, 2, 2);
  roundBox(cases, 0.03);
  cases.translate(0, GROUND + 0.46, 0.02);
  B.dark.push(paint(cases, dark));
  const cyl = rod(at(0.52, 0.1), at(0.74, 0.19), 0.058, 0.055, 14);
  B.dark.push(paint(cyl, col(0x3a3c40)));
  for (let k = 0; k < 5; k++) {
    const f = rod(at(0.56 + k * 0.035, 0.115 + k * 0.014), at(0.565 + k * 0.035, 0.117 + k * 0.014), 0.072, 0.072, 14);
    B.dark.push(paint(f, col(0x46484d)));
  }
  const head = new THREE.BoxGeometry(0.15, 0.08, 0.14, 2, 1, 2);
  roundBox(head, 0.02);
  head.rotateX(-0.4);
  head.translate(0, GROUND + 0.79, 0.2);
  B.dark.push(paint(head, col(0x55585e)));
  // Clutch cover (right side) and ignition cover (left), magnesium grey.
  const cover = new THREE.CylinderGeometry(0.085, 0.09, 0.03, 20);
  cover.rotateZ(Math.PI / 2);
  const cR = cover.clone();
  cR.translate(-0.11, GROUND + 0.47, 0.05);
  const cL = cover.clone();
  cL.translate(0.11, GROUND + 0.48, -0.02);
  B.dark.push(paint(cR, col(0x6d6f72)), paint(cL, col(0x5f6164)));
  // Skid plate.
  const skid = new THREE.BoxGeometry(0.19, 0.012, 0.36);
  skid.translate(0, GROUND + 0.345, 0.03);
  B.gloss.push(paint(skid, black));
  // ---- radiators behind the shrouds (louvred cores)
  for (const s of [1, -1]) {
    const core = new THREE.BoxGeometry(0.035, 0.26, 0.16, 1, 8, 1);
    core.rotateX(0.25);
    core.translate(s * 0.1, GROUND + 0.74, 0.26);
    B.dark.push(paint(core, col(0x303236)));
  }
  // ---- exhaust: header out of the head, round the right side, into the silencer under the side panel
  const header = [at(0.76, 0.28), at(0.7, 0.36, -0.02), at(0.56, 0.36, -0.08), at(0.46, 0.22, -0.13), at(0.5, 0.0, -0.15), at(0.6, -0.2, -0.16), at(0.66, -0.3, -0.165)];
  B.metal.push(paint(pipe(header, 0.022, 10, 36), ti));
  const can = rod(at(0.66, -0.3, -0.165), at(0.84, -0.86, -0.17), 0.05, 0.047, 16);
  B.metal.push(paint(can, alu));
  const endCap = rod(at(0.84, -0.86, -0.17), at(0.86, -0.92, -0.17), 0.047, 0.034, 16);
  B.dark.push(paint(endCap, col(0x505256)));
  const tip = rod(at(0.855, -0.9, -0.17), at(0.865, -0.94, -0.17), 0.018, 0.018, 10);
  B.dark.push(paint(tip, black));
  // ---- rear shock: spring and body from the frame down to the linkage
  const shockTop = at(0.84, -0.1);
  const shockBot = at(0.47, -0.2);
  B.metal.push(paint(rod(shockTop, shockBot, 0.022, 0.018, 10), ti));
  const spring = [];
  for (let k = 0; k <= 60; k++) {
    const f = k / 60;
    const a = f * Math.PI * 2 * 7;
    const p = shockTop.clone().lerp(shockBot, 0.12 + f * 0.62);
    spring.push(new THREE.Vector3(p.x + Math.cos(a) * 0.036, p.y, p.z + Math.sin(a) * 0.036));
  }
  B.gloss.push(paint(pipe(spring, 0.006, 5, 240), col(0xe8c21a)));
  B.metal.push(paint(rod(at(0.86, -0.02, -0.06), at(0.74, -0.03, -0.06), 0.02, 0.02, 10), ti)); // reservoir
  // ---- footpegs, brake pedal, shifter
  for (const s of [1, -1]) {
    const peg = new THREE.BoxGeometry(0.09, 0.02, 0.05, 3, 1, 1);
    peg.translate(s * 0.2, GROUND + 0.4, -0.02);
    B.metal.push(paint(peg, ti));
  }
  B.metal.push(paint(rod(at(0.4, -0.04, -0.13), at(0.38, 0.14, -0.15), 0.008, 0.007, 6), ti));
  B.metal.push(paint(rod(at(0.42, 0.0, 0.13), at(0.43, 0.14, 0.16), 0.008, 0.007, 6), ti));
  // ---- chain: top and bottom runs from the countershaft sprocket to the rear sprocket (moves with the swingarm, drawn on it)
  // ---- plastics: radiator shrouds, side panels (number plates), seat, rear fender, tank
  const shroudOutline = [[0.4, 0.98], [0.3, 1.0], [0.12, 0.99], [-0.02, 0.96], [-0.1, 0.9], [-0.06, 0.8], [0.04, 0.68], [0.16, 0.58], [0.3, 0.62], [0.38, 0.72], [0.42, 0.86]];
  const shroudOff = (z, y) => 0.1 + (0.98 - y) * 0.22 + Math.max(0, z - 0.25) * -0.1;
  const shroud = panel(shroudOutline, 0.01, shroudOff);
  // Graphics: the lower third in the second colour.
  const shL = colourBy(paint(shroud, team), (x, y) => (y < GROUND + 0.74 ? accent : team));
  B.gloss.push(shL, mirrorX(shL));
  const sideOutline = [[-0.12, 0.93], [-0.62, 0.99], [-0.68, 0.94], [-0.6, 0.78], [-0.42, 0.66], [-0.2, 0.66], [-0.08, 0.76]];
  const sideOff = (z, y) => 0.12 + Math.max(0, 0.9 - y) * 0.05;
  const side = paint(panel(sideOutline, 0.008, sideOff), white);
  B.gloss.push(side, mirrorX(side));
  // Tank (mostly hidden between the shrouds) and the seat on top.
  const tank = new THREE.SphereGeometry(0.13, 16, 10);
  tank.scale(0.95, 0.8, 1.6);
  tank.translate(0, GROUND + 0.9, 0.18);
  B.gloss.push(paint(tank, team));
  const seat = loft(
    (f) => {
      const z = 0.16 - f * 0.8;
      const w = 0.105 - f * 0.04 + (f < 0.1 ? -0.03 * (1 - f / 0.1) : 0);
      const y = GROUND + 0.965 + (f < 0.18 ? (0.18 - f) * 0.12 : 0) + f * 0.035 - Math.sin(f * Math.PI) * 0.012;
      return { z, w, y, t: 0.08 };
    },
    24,
    10,
  );
  B.rubber.push(paint(seat, col(0x1b1b1d)));
  // Rear fender: from under the seat's end, sweeping up and back.
  const rearFender = loft(
    (f) => ({ z: -0.52 - f * 0.56, w: 0.12 - f * 0.05, y: GROUND + 0.94 + f * 0.1 - f * f * 0.03, t: 0.012 }),
    14,
    8,
    true,
  );
  B.gloss.push(paint(rearFender, team));
  // ---- rider
  riderParts(B, team, accent, white, black, at);

  // Merge the body buckets into meshes.
  addBuckets(body, B, M);

  // ---- steering: fork, triple clamps, bars, front number plate, front fender
  const steer = new THREE.Group();
  steer.position.copy(HEAD);
  body.add(steer);
  const S = buckets();
  const local = (p) => p.clone().sub(HEAD);
  const axleL = local(AXLE_F);
  // Point on the fork axis `d` metres up from the axle.
  const onFork = (d, x = 0) => axleL.clone().addScaledVector(FORK, d).add(new THREE.Vector3(x, 0, 0));
  const topD = HEAD.clone().sub(AXLE_F).dot(FORK) + 0.1; // top clamp a little above the head
  for (const s of [1, -1]) {
    S.metal.push(paint(rod(onFork(topD - 0.52, s * 0.085), onFork(topD + 0.02, s * 0.085), 0.03, 0.03, 14), col(0x2a2b30))); // outer tubes (black)
  }
  // Triple clamps.
  for (const d of [topD - 0.02, topD - 0.22]) {
    const c = new THREE.BoxGeometry(0.24, 0.035, 0.07, 2, 1, 2);
    roundBox(c, 0.012);
    _q.setFromUnitVectors(UP, FORK);
    c.applyQuaternion(_q);
    const p = onFork(d);
    c.translate(p.x, p.y, p.z + 0.01);
    S.metal.push(paint(c, col(0xb8791e)));
  }
  // Handlebar: bent tube on risers, grips, levers, hand guards.
  const barC = onFork(topD + 0.05);
  const bar = pipe([new THREE.Vector3(0.4, barC.y + 0.08, barC.z - 0.08), new THREE.Vector3(0.22, barC.y + 0.07, barC.z - 0.02), new THREE.Vector3(0.08, barC.y + 0.025, barC.z + 0.01), new THREE.Vector3(-0.08, barC.y + 0.025, barC.z + 0.01), new THREE.Vector3(-0.22, barC.y + 0.07, barC.z - 0.02), new THREE.Vector3(-0.4, barC.y + 0.08, barC.z - 0.08)], 0.011, 8, 24);
  S.metal.push(paint(bar, col(0x2f3136)));
  const pad = new THREE.BoxGeometry(0.12, 0.035, 0.035);
  pad.translate(0, barC.y + 0.04, barC.z + 0.01);
  S.rubber.push(paint(pad, accent));
  for (const s of [1, -1]) {
    S.rubber.push(paint(rod(new THREE.Vector3(s * 0.3, barC.y + 0.075, barC.z - 0.05), new THREE.Vector3(s * 0.41, barC.y + 0.082, barC.z - 0.085), 0.017, 0.017, 10), black));
    S.metal.push(paint(rod(new THREE.Vector3(s * 0.2, barC.y + 0.08, barC.z - 0.0), new THREE.Vector3(s * 0.36, barC.y + 0.06, barC.z + 0.04), 0.006, 0.005, 6), ti));
    const guard = loft(
      (f) => ({ z: barC.z - 0.02 + f * 0.1, w: 0.05, y: barC.y + 0.08 + Math.sin(f * Math.PI) * 0.03, t: 0.006 }),
      8,
      6,
      true,
    );
    guard.rotateY(s * 0.25);
    guard.translate(s * 0.34, 0, 0);
    S.gloss.push(paint(guard, team));
  }
  // Front number plate between the fork tubes, raked with the fork.
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.13, -0.1);
  plateShape.lineTo(0.13, -0.1);
  plateShape.quadraticCurveTo(0.15, 0.06, 0.1, 0.12);
  plateShape.lineTo(-0.1, 0.12);
  plateShape.quadraticCurveTo(-0.15, 0.06, -0.13, -0.1);
  const plate = new THREE.ExtrudeGeometry(plateShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1 });
  const plateAt = onFork(topD - 0.16);
  const plateQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), FORK);
  plate.applyQuaternion(plateQ);
  plate.translate(plateAt.x, plateAt.y, plateAt.z + 0.085);
  S.gloss.push(paint(plate, white));
  // Front fender: long beak over the wheel, bolted to the lower clamp.
  const fenderBase = onFork(topD - 0.26);
  const fender = loft(
    (f) => {
      const a = -0.55 + f * 1.25; // angle round the wheel from behind to in front
      const r = FRONT_R + 0.12 + Math.max(0, f - 0.5) * 0.06;
      return { z: axleL.z + Math.sin(a) * r * 0.95, w: 0.07 - Math.max(0, f - 0.6) * 0.035, y: fenderBase.y + 0.04 + Math.cos(a) * 0.05 - f * 0.02 + (f > 0.7 ? (f - 0.7) * 0.12 : 0), t: 0.01 };
    },
    18,
    8,
    true,
  );
  S.gloss.push(paint(fender, team));
  addBuckets(steer, S, M);
  // The front number itself.
  const numMat = new THREE.MeshStandardMaterial({ map: plateTexture(number), roughness: 0.4, transparent: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const numF = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), numMat);
  numF.quaternion.copy(plateQ);
  numF.position.copy(plateAt).add(new THREE.Vector3(0, 0, 0.085)).addScaledVector(new THREE.Vector3(0, -FORK.z, FORK.y).normalize(), 0.012);
  steer.add(numF);
  // Side numbers on the side panels.
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), numMat);
    n.position.set(s * 0.148, GROUND + 0.81, -0.4);
    n.rotation.y = (s * Math.PI) / 2;
    n.rotation.z = s * 0.05;
    body.add(n);
  }

  // ---- fork sliders + front wheel (slide along the fork axis with the suspension)
  const slider = new THREE.Group();
  steer.add(slider);
  const L = buckets();
  for (const s of [1, -1]) {
    L.metal.push(paint(rod(onFork(0.02, s * 0.085), onFork(topD - 0.45, s * 0.085), 0.024, 0.024, 12), gold)); // inner tubes (gold)
    L.metal.push(paint(rod(onFork(-0.03, s * 0.085), onFork(0.06, s * 0.085), 0.03, 0.028, 12), col(0x2e2f33))); // axle lugs
    // Fork guards over the front of the tubes.
    const g = new THREE.CylinderGeometry(0.036, 0.034, 0.3, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    g.translate(0, 0.15, 0);
    _q.setFromUnitVectors(UP, FORK);
    g.applyQuaternion(_q);
    const p = onFork(0.05, s * 0.085);
    g.translate(p.x, p.y, p.z);
    L.gloss.push(paint(g, white));
  }
  L.metal.push(paint(rod(onFork(0, 0.11), onFork(0, -0.11), 0.01, 0.01, 8), ti)); // axle
  addBuckets(slider, L, M);
  const frontWheel = new THREE.Group();
  frontWheel.position.copy(axleL);
  slider.add(frontWheel);
  addBuckets(frontWheel, wheel(FRONT_R, 0.267, 0.085, 0.135, 1, rubber, col(0x1c1d20), alu, col(0xd0d2d6), col(0x8e9096)), M);
  // Caliper on the disc side.
  const cal = new THREE.BoxGeometry(0.03, 0.08, 0.05);
  cal.translate(0.09, 0.08, -0.1);
  slider.add(meshOf(paint(cal.translate(axleL.x, axleL.y, axleL.z), col(0x303236)), M.dark));

  // ---- swingarm + rear wheel
  const swing = new THREE.Group();
  swing.position.copy(PIVOT);
  body.add(swing);
  const W2 = buckets();
  const axR = AXLE_R.clone().sub(PIVOT);
  for (const s of [1, -1]) {
    // Box-section arm: a deep upper member and a lower one, tapering to the axle.
    const arm = pipe([new THREE.Vector3(s * 0.085, 0.012, 0.02), new THREE.Vector3(s * 0.095, -0.015, axR.z * 0.4), new THREE.Vector3(s * 0.09, axR.y + 0.018, axR.z + 0.03)], 0.024, 8, 16);
    const armLo = pipe([new THREE.Vector3(s * 0.085, -0.02, 0.0), new THREE.Vector3(s * 0.095, -0.05, axR.z * 0.4), new THREE.Vector3(s * 0.09, axR.y - 0.005, axR.z + 0.05)], 0.018, 8, 16);
    W2.metal.push(paint(arm, alu), paint(armLo, alu));
  }
  W2.metal.push(paint(rod(new THREE.Vector3(0.1, 0, 0), new THREE.Vector3(-0.1, 0, 0), 0.02, 0.02, 10), ti)); // pivot bolt
  // Chain (left side): top and bottom runs round the sprockets.
  const cs = new THREE.Vector3(0.105, 0.02, 0.15); // countershaft sprocket, just ahead of the pivot
  const rs = new THREE.Vector3(0.105, axR.y, axR.z);
  const chainPts = [];
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const f = k / 40;
    const onTop = f < 0.5;
    const t = onTop ? f * 2 : (f - 0.5) * 2;
    const p = onTop ? cs.clone().lerp(rs, t) : rs.clone().lerp(cs, t);
    const r = onTop ? 0.04 + t * 0.075 : 0.115 - t * 0.075;
    p.y += onTop ? r : -r;
    chainPts.push(p);
    void a;
  }
  W2.dark.push(paint(pipe(chainPts, 0.008, 5, 80), col(0x3b3326)));
  const sprocket = new THREE.CylinderGeometry(0.11, 0.11, 0.006, 24);
  sprocket.rotateZ(Math.PI / 2);
  sprocket.translate(0.098, axR.y, axR.z);
  W2.metal.push(paint(sprocket, col(0x8a8c90)));
  // Chain guide and rear caliper.
  const guide = new THREE.BoxGeometry(0.02, 0.07, 0.16);
  guide.translate(0.1, axR.y - 0.1, axR.z + 0.18);
  W2.gloss.push(paint(guide, black));
  addBuckets(swing, W2, M);
  const rearWheel = new THREE.Group();
  rearWheel.position.copy(axR);
  swing.add(rearWheel);
  addBuckets(rearWheel, wheel(REAR_R, 0.241, 0.11, 0.12, -1, rubber, col(0x1c1d20), alu, col(0xd0d2d6), col(0x8e9096)), M);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const state = { lean: 0 };
  const restF = AXLE_F.y;
  const restR = AXLE_R.y;
  const swingLen = Math.hypot(axR.y, axR.z);
  return {
    group: root,
    paint: M.gloss,
    tailMat: M.tail,
    headMat: M.tail,
    /** Follows the physics: steering, suspension, wheel spin, lean. */
    pose(car, dt) {
      const veh = car.vehicle;
      const infos = veh.vehicle.wheelInfos;
      const Wh = car.spec.wheel;
      const len = (i) => {
        const w = infos[i];
        return w.isInContact ? w.suspensionLength : Math.min(w.suspensionRestLength + 0.05, w.suspensionLength + 0.2);
      };
      const yF = Wh.height - (len(0) + len(1)) / 2 + (FRONT_R - Wh.radius);
      const yR = Wh.height - (len(2) + len(3)) / 2;
      // Front: the sliders move along the fork axis.
      const dF = THREE.MathUtils.clamp(yF - restF, -0.2, 0.3);
      slider.position.copy(FORK).multiplyScalar(dF / FORK.y);
      steer.quaternion.setFromAxisAngle(FORK, -veh.steerAngle * 0.9);
      // Rear: the swingarm swings.
      const dR = THREE.MathUtils.clamp(yR - restR, -0.2, 0.3);
      swing.rotation.x = Math.asin(THREE.MathUtils.clamp(dR / swingLen, -0.9, 0.9));
      frontWheel.rotation.x = veh.wheelSpin[0] * (Wh.radius / FRONT_R);
      rearWheel.rotation.x = veh.wheelSpin[2];
      // Lean into the turn: the angle that balances the cornering force, eased.
      const av = car.body.angularVelocity;
      const up = _v.set(0, 1, 0).applyQuaternion(car.object.quaternion);
      const yawRate = av.x * up.x + av.y * up.y + av.z * up.z;
      const v = veh.speed;
      const grounded = veh.airborne < 0.15;
      const want = grounded ? THREE.MathUtils.clamp(Math.atan((-v * yawRate) / 9.81), -0.85, 0.85) : state.lean * 0.9;
      state.lean += (want - state.lean) * Math.min(1, dt * (grounded ? 7 : 2));
      lean.rotation.z = state.lean;
    },
  };
}

// ------------------------------------------------------------ rider

function riderParts(B, team, accent, white, black, at) {
  const pants = team.clone().lerp(black, 0.45);
  const glove = black.clone().lerp(team, 0.25);
  const V = (x, y, z) => at(y, z, x);
  // Seated "attack position": knees gripping the shrouds, elbows up and out, head forward over the bars.
  const pelvis = V(0, 1.03, -0.15);
  const chestC = V(0, 1.33, 0.0);
  const shoulderC = V(0, 1.46, 0.06);
  // Torso: a loft of rounded sections up the spine — hips, waist, chest protector, shoulders, neck.
  const torso = ellipseLoft(
    [
      { c: V(0, 0.98, -0.16), a: 0.165, b: 0.12 },
      { c: V(0, 1.1, -0.12), a: 0.155, b: 0.115 },
      { c: V(0, 1.22, -0.06), a: 0.165, b: 0.13 },
      { c: chestC, a: 0.19, b: 0.145 },
      { c: V(0, 1.42, 0.05), a: 0.205, b: 0.125 },
      { c: shoulderC, a: 0.17, b: 0.1 },
      { c: V(0, 1.52, 0.09), a: 0.075, b: 0.065 },
    ],
    18,
  );
  B.fabric.push(colourBy(paint(torso, team), (x, y) => (Math.abs(x) > 0.14 && y < GROUND + 1.44 ? accent : team)));
  // Number panel across the back.
  const back = new THREE.BoxGeometry(0.2, 0.14, 0.01);
  back.rotateX(-0.55);
  back.translate(0, GROUND + 1.3, -0.1);
  B.fabric.push(paint(back, white));
  // Neck brace.
  const brace = new THREE.TorusGeometry(0.1, 0.03, 8, 20);
  brace.scale(1.15, 1, 1.0);
  brace.rotateX(Math.PI / 2 - 0.5);
  brace.translate(0, GROUND + 1.52, 0.08);
  B.dark.push(paint(brace, col(0x222428)));
  for (const s of [1, -1]) {
    // Legs: loose pants over knee braces, tall buckled boots on the pegs.
    const hip = V(s * 0.1, 1.02, -0.13);
    const knee = V(s * 0.19, 0.8, 0.14);
    const ankle = V(s * 0.205, 0.47, -0.04);
    B.fabric.push(...limb(hip, knee, 0.085, 0.068, 12).map((g) => paint(g, pants)));
    const kneeCap = new THREE.SphereGeometry(0.062, 12, 8);
    kneeCap.scale(0.9, 1.15, 0.8);
    kneeCap.translate(knee.x + s * 0.01, knee.y + 0.01, knee.z + 0.03);
    B.dark.push(paint(kneeCap, col(0x2a2c30)));
    const bootTop = ankle.clone().lerp(knee, 0.7);
    B.fabric.push(...limb(bootTop, knee, 0.062, 0.064, 12).map((g) => paint(g, pants)));
    B.fabric.push(...limb(ankle, bootTop, 0.058, 0.066, 14).map((g) => paint(g, white)));
    // Shin plate and buckles.
    const shin = rod(ankle.clone().lerp(bootTop, 0.15).add(new THREE.Vector3(0, 0, 0.05)), bootTop.clone().add(new THREE.Vector3(0, 0, 0.05)), 0.03, 0.036, 8);
    B.gloss.push(paint(shin, accent));
    for (let k = 0; k < 3; k++) {
      const p = ankle.clone().lerp(bootTop, 0.22 + k * 0.26);
      const b = new THREE.BoxGeometry(0.018, 0.018, 0.05);
      b.translate(p.x + s * 0.064, p.y, p.z + 0.01);
      B.metal.push(paint(b, col(0xb8babe)));
    }
    const foot = new THREE.BoxGeometry(0.095, 0.075, 0.28, 2, 2, 3);
    roundBox(foot, 0.03);
    foot.translate(ankle.x, ankle.y - 0.045, ankle.z + 0.07);
    B.fabric.push(paint(foot, white));
    const sole = new THREE.BoxGeometry(0.1, 0.026, 0.29, 2, 1, 3);
    roundBox(sole, 0.01);
    sole.translate(ankle.x, ankle.y - 0.085, ankle.z + 0.07);
    B.rubber.push(paint(sole, black));
    // Arms: shoulder → elbow (up and out) → hand on the grip; sleeves loose, gloves wrapped round the grips.
    const sh = V(s * 0.19, 1.45, 0.06);
    const el = V(s * 0.37, 1.33, 0.14);
    const wrist = V(s * 0.37, 1.17, 0.27);
    B.fabric.push(...limb(sh, el, 0.058, 0.05, 12).map((g) => paint(g, team)));
    B.fabric.push(...limb(el, wrist, 0.048, 0.038, 12).map((g) => paint(g, team)));
    B.fabric.push(paint(rod(el.clone().lerp(wrist, 0.72), el.clone().lerp(wrist, 0.84), 0.043, 0.041, 12), accent));
    const hand = new THREE.BoxGeometry(0.095, 0.065, 0.1, 2, 2, 2);
    roundBox(hand, 0.028);
    hand.rotateY(-s * 0.35);
    hand.translate(wrist.x - s * 0.005, wrist.y - 0.02, wrist.z + 0.035);
    B.fabric.push(paint(hand, glove));
  }
  // Helmet: a long shell, the chin bar jutting forward and down, a peak above the eye port,
  // goggles in the port with their strap round the back.
  const hc = V(0, 1.665, 0.19);
  const shell = new THREE.SphereGeometry(0.135, 26, 18);
  shell.scale(0.94, 0.98, 1.14);
  shell.rotateX(0.15);
  shell.translate(hc.x, hc.y, hc.z);
  B.gloss.push(colourBy(paint(shell, team), (x, y, z) => (Math.abs(x) < 0.028 && y > hc.y + 0.02 ? white : Math.abs(x) > 0.1 && y < hc.y - 0.02 ? accent : team)));
  const chin = new THREE.SphereGeometry(0.1, 18, 12);
  chin.scale(0.72, 0.52, 1.12);
  chin.rotateX(0.35);
  chin.translate(hc.x, hc.y - 0.085, hc.z + 0.115);
  B.gloss.push(paint(chin, team));
  const vent = new THREE.BoxGeometry(0.06, 0.025, 0.03, 2, 1, 1);
  roundBox(vent, 0.008);
  vent.translate(hc.x, hc.y - 0.105, hc.z + 0.215);
  B.dark.push(paint(vent, col(0x2e3034)));
  const peak = new THREE.BoxGeometry(0.22, 0.012, 0.15, 6, 1, 4);
  const pp = peak.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const z = pp.getZ(i);
    // Curved across, narrowing to a point-ish front edge.
    pp.setXYZ(i, x * (1 - Math.max(0, z / 0.075) * 0.22), pp.getY(i) - (x / 0.11) ** 2 * 0.018, z);
  }
  peak.rotateX(-0.22);
  peak.translate(hc.x, hc.y + 0.085, hc.z + 0.175);
  B.gloss.push(colourBy(paint(peak, team), (x) => (Math.abs(x) < 0.012 ? accent : team)));
  // Goggles: a curved band across the eye port (frame, then the mirrored lens in it), strap round the back.
  const band = (r, h, t0, t1, y) => {
    const g = new THREE.CylinderGeometry(r, r, h, 20, 1, true, t0, t1);
    g.scale(0.96, 1, 1.16);
    g.rotateX(0.15);
    g.translate(hc.x, hc.y + y, hc.z);
    return g;
  };
  B.dark.push(paint(band(0.142, 0.068, -0.72, 1.44, 0.012), black));
  const strap = band(0.138, 0.036, 0.7, Math.PI * 2 - 1.4, 0.014);
  B.fabric.push(paint(strap, accent));
  const lens = band(0.1445, 0.046, -0.6, 1.2, 0.012);
  B.lens = [paint(lens, white)];
}

/** Closed tube through rounded sections { c: centre, a: half width (x), b: half depth } with end caps. */
function ellipseLoft(sections, seg = 16) {
  const pos = [];
  const idx = [];
  const n = sections.length;
  for (let k = 0; k < n; k++) {
    const S = sections[k];
    // Section plane: perpendicular to the spine direction here.
    const prev = sections[Math.max(0, k - 1)].c;
    const next = sections[Math.min(n - 1, k + 1)].c;
    const up = next.clone().sub(prev).normalize();
    const side = new THREE.Vector3(1, 0, 0);
    const depth = new THREE.Vector3().crossVectors(side, up).normalize();
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const p = S.c.clone().addScaledVector(side, Math.cos(a) * S.a).addScaledVector(depth, Math.sin(a) * S.b);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < seg; j++) {
      const a = k * seg + j;
      const b = k * seg + ((j + 1) % seg);
      idx.push(a, a + seg, b, b, a + seg, b + seg);
    }
  }
  for (const [k, flip] of [[0, true], [n - 1, false]]) {
    const c = pos.length / 3;
    pos.push(sections[k].c.x, sections[k].c.y, sections[k].c.z);
    for (let j = 0; j < seg; j++) {
      const a = k * seg + j;
      const b = k * seg + ((j + 1) % seg);
      if (flip) idx.push(c, b, a);
      else idx.push(c, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ utilities

/** Round a subdivided box's corners toward a superellipse. */
function roundBox(g, r) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  const p = g.attributes.position;
  const hx = (b.max.x - b.min.x) / 2;
  const hy = (b.max.y - b.min.y) / 2;
  const hz = (b.max.z - b.min.z) / 2;
  const cx = (b.max.x + b.min.x) / 2;
  const cy = (b.max.y + b.min.y) / 2;
  const cz = (b.max.z + b.min.z) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - cx;
    const y = p.getY(i) - cy;
    const z = p.getZ(i) - cz;
    const ix = Math.max(-hx + r, Math.min(hx - r, x));
    const iy = Math.max(-hy + r, Math.min(hy - r, y));
    const iz = Math.max(-hz + r, Math.min(hz - r, z));
    const dx = x - ix;
    const dy = y - iy;
    const dz = z - iz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) p.setXYZ(i, cx + ix + (dx / l) * r, cy + iy + (dy / l) * r, cz + iz + (dz / l) * r);
  }
  g.computeVertexNormals();
}

/** Recolours a painted piece by position. */
function colourBy(g, fn) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, k.r, k.g, k.b);
  }
  return g;
}

/**
 * A lofted shell along z: each station f ∈ [0, 1] gives { z, w (half
 * width), y (top), t (thickness) }; the section is a rounded arch.
 * `shell`: a thin arched plate (fenders) instead of a solid (seat).
 */
function loft(station, steps, around, shell = false) {
  const pos = [];
  const idx = [];
  const ring = around * 2 + 2;
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const { z, w, y, t } = station(f);
    for (let k = 0; k <= around; k++) {
      const a = Math.PI * (k / around); // 0 → π across the top
      const x = Math.cos(a) * w;
      const top = y + Math.sin(a) * (shell ? w * 0.35 : t * 0.6);
      pos.push(x, top, z);
    }
    for (let k = around; k >= 0; k--) {
      const a = Math.PI * (k / around);
      const x = Math.cos(a) * (w - (shell ? 0.002 : 0.004));
      const bottom = shell ? y + Math.sin(a) * w * 0.35 - t : y - t * 0.4;
      pos.push(x, bottom, z);
    }
  }
  for (let s = 0; s < steps; s++) {
    for (let k = 0; k < ring - 1; k++) {
      const a = s * ring + k;
      const b = a + ring;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const a = s * ring + ring - 1;
    const b = a + ring;
    idx.push(a, b, s * ring, s * ring, b, (s + 1) * ring);
  }
  if (!shell) {
    // Caps: a fan from each end's centre.
    for (const s of [0, steps]) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < ring; k++) {
        cx += pos[(s * ring + k) * 3];
        cy += pos[(s * ring + k) * 3 + 1];
        cz += pos[(s * ring + k) * 3 + 2];
      }
      const c = pos.length / 3;
      pos.push(cx / ring, cy / ring, cz / ring);
      for (let k = 0; k < ring; k++) {
        const a = s * ring + k;
        const b = s * ring + ((k + 1) % ring);
        if (s === 0) idx.push(c, b, a);
        else idx.push(c, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function meshOf(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addBuckets(parent, B, M) {
  for (const [k, list] of Object.entries(B)) {
    if (!list || !list.length) continue;
    const mat = k === 'lens' ? M.lens : M[k];
    const geo = list.length === 1 ? list[0] : mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
    if (!geo) {
      console.warn('moto: merge failed for', k);
      continue;
    }
    parent.add(meshOf(geo, mat));
  }
}
