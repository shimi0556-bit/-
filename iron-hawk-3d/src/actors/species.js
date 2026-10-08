// Monster recipes. Each one is a skeleton (joint positions, +Z is forward) and a set of
// smooth shapes bound to bones; creature-mesh.js turns them into a skinned body.
// Two-legged and four-legged bodies come from parametric generators.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function finish(r) {
  // mirror every *L joint/shape to *R
  const joints = {};
  for (const [k, j] of Object.entries(r.joints)) {
    joints[k] = j;
    if (k.endsWith('L')) {
      const kr = k.slice(0, -1) + 'R';
      joints[kr] = { parent: j.parent && j.parent.endsWith('L') ? j.parent.slice(0, -1) + 'R' : j.parent, pos: [-j.pos[0], j.pos[1], j.pos[2]] };
    }
  }
  const mir = (v) => (typeof v === 'string' ? (v.endsWith('L') ? v.slice(0, -1) + 'R' : v) : [-v[0], v[1], v[2]]);
  const shapes = [];
  for (const s of r.shapes) {
    shapes.push(s);
    if (s.bone.endsWith('L')) {
      const m = { ...s, bone: mir(s.bone) };
      if (s.c) m.c = mir(s.c);
      if (s.a) { m.a = mir(s.a); m.b = mir(s.b); }
      shapes.push(m);
    }
  }
  const bones = Object.keys(joints);
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b, i]));
  const attachments = [];
  for (const a of r.attachments || []) {
    attachments.push(a);
    if (a.bone.endsWith('L')) attachments.push({ ...a, bone: mir(a.bone), pos: mir(a.pos), dir: a.dir ? mir(a.dir) : undefined, mirrored: true });
    else if (a.sym) attachments.push({ ...a, pos: [-a.pos[0], a.pos[1], a.pos[2]], dir: a.dir ? [-a.dir[0], a.dir[1], a.dir[2]] : undefined, tilt: a.tilt ? -a.tilt : a.tilt, mirrored: true });
  }
  return { ...r, joints, shapes, bones, boneIndex, attachments };
}

function biped(p) {
  const H = p.hip, L = p.body, g = p.girth;
  const head = [0, H + 0.12 * H + p.neckRise, L + p.neck];
  const J = {
    hips: { pos: [0, H, 0] },
    spine: { parent: 'hips', pos: [0, H + 0.06 * H, L * 0.5] },
    chest: { parent: 'spine', pos: [0, H + 0.1 * H, L] },
    neck: { parent: 'chest', pos: [0, H + 0.12 * H + p.neckRise * 0.45, L + p.neck * 0.5] },
    head: { parent: 'neck', pos: head },
    jaw: { parent: 'head', pos: add(head, [0, -p.headH * 0.38, p.head * 0.12]) },
    tail1: { parent: 'hips', pos: [0, H - p.tailDrop * 0.05, -p.tail * 0.18] },
    tail2: { parent: 'tail1', pos: [0, H - p.tailDrop * 0.25, -p.tail * 0.4] },
    tail3: { parent: 'tail2', pos: [0, H - p.tailDrop * 0.5, -p.tail * 0.62] },
    tail4: { parent: 'tail3', pos: [0, H - p.tailDrop * 0.78, -p.tail * 0.82] },
    tailTip: { parent: 'tail4', pos: [0, H - p.tailDrop, -p.tail] },
    thighL: { parent: 'hips', pos: [p.hipW, H - g * 0.25, 0.05 * L] },
    shinL: { parent: 'thighL', pos: [p.hipW * 1.08, H * 0.55, H * 0.2] },
    footL: { parent: 'shinL', pos: [p.hipW * 1.1, H * 0.17, -H * 0.1] },
    toeL: { parent: 'footL', pos: [p.hipW * 1.1, H * 0.03, H * 0.2] },
    armL: { parent: 'chest', pos: [g * 0.55, H + 0.04 * H, L * 0.98] },
    foreL: { parent: 'armL', pos: [g * 0.62, H + 0.04 * H - p.arm * 0.5, L * 0.98 + p.arm * 0.4] },
    handL: { parent: 'foreL', pos: [g * 0.64, H + 0.04 * H - p.arm * 0.7, L * 0.98 + p.arm * 0.85] },
  };
  const P = (k) => J[k].pos;
  const tailR = [g * 0.78, g * 0.6, g * 0.42, g * 0.24, g * 0.08];
  const tails = ['tail1', 'tail2', 'tail3', 'tail4', 'tailTip'];
  const S = [
    { type: 'ellipsoid', c: [0, H, -0.05 * L], r: [g * 0.82, g * 0.92, g * 1.15], bone: 'hips' },
    { type: 'ellipsoid', c: [0, H + 0.02 * H - g * 0.08, L * 0.5], r: [g * 0.98, g * 1.05, L * 0.62 + g * 0.3], bone: 'spine' },
    { type: 'ellipsoid', c: [0, H + 0.08 * H, L * 0.95], r: [g * 0.82, g * 0.92, g * 0.85], bone: 'chest' },
    { type: 'capsule', a: add(P('chest'), [0, 0, -g * 0.2]), b: add(head, [0, -p.headH * 0.1, 0]), r1: g * 0.58, r2: p.headH * 0.42, bone: 'neck' },
    { type: 'ellipsoid', c: add(head, [0, p.headH * 0.05, p.head * 0.18]), r: [p.headW * 0.5, p.headH * 0.5, p.head * 0.36], bone: 'head' },
    { type: 'capsule', a: add(head, [0, 0, p.head * 0.1]), b: add(head, [0, -p.headH * 0.08, p.head]), r1: p.headH * 0.4, r2: p.headH * 0.22, bone: 'head', k: p.headH * 0.3 },
    { type: 'capsule', a: P('jaw'), b: add(head, [0, -p.headH * 0.5, p.head * 0.88]), r1: p.headH * 0.27, r2: p.headH * 0.15, bone: 'jaw', k: p.headH * 0.12 },
    { type: 'capsule', a: [0, H, -0.1 * L], b: P('tail1'), r1: g * 0.8, r2: tailR[0], bone: 'hips' },
    ...tails.slice(0, 4).map((t, i) => ({ type: 'capsule', a: P(t), b: P(tails[i + 1]), r1: tailR[i], r2: tailR[i + 1], bone: t })),
    { type: 'capsule', a: P('thighL'), b: P('shinL'), r1: p.thigh, r2: p.thigh * 0.5, bone: 'thighL' },
    { type: 'ellipsoid', c: add(P('thighL'), [0.05 * g, -(P('thighL')[1] - P('shinL')[1]) * 0.32, (P('shinL')[2] - P('thighL')[2]) * 0.25]), r: [p.thigh * 0.85, p.thigh * 1.45, p.thigh * 1.1], bone: 'thighL' },
    { type: 'capsule', a: P('shinL'), b: P('footL'), r1: p.thigh * 0.48, r2: p.thigh * 0.3, bone: 'shinL' },
    { type: 'capsule', a: P('footL'), b: P('toeL'), r1: p.thigh * 0.3, r2: p.thigh * 0.24, bone: 'footL' },
    { type: 'capsule', a: P('armL'), b: P('foreL'), r1: p.armR, r2: p.armR * 0.75, bone: 'armL', k: p.armR },
    { type: 'capsule', a: P('foreL'), b: P('handL'), r1: p.armR * 0.75, r2: p.armR * 0.5, bone: 'foreL', k: p.armR },
  ];
  return { joints: J, shapes: S, head, H, mouth: [0, -p.headH * 0.3, p.head * 0.95] };
}

function quadruped(p) {
  const H = p.hip, Hc = p.shoulder, L = p.body, g = p.girth, w = p.legW;
  const chest = [0, Hc, L];
  const head = add(chest, [0, p.neckRise, p.neck]);
  const J = {
    hips: { pos: [0, H, 0] },
    spine: { parent: 'hips', pos: [0, (H + Hc) / 2 + p.hump, L * 0.5] },
    chest: { parent: 'spine', pos: chest },
    neck1: { parent: 'chest', pos: add(chest, [0, p.neckRise * 0.3, p.neck * 0.33]) },
    neck2: { parent: 'neck1', pos: add(chest, [0, p.neckRise * 0.7, p.neck * 0.68]) },
    head: { parent: 'neck2', pos: head },
    jaw: { parent: 'head', pos: add(head, [0, -p.headH * 0.32, p.head * 0.15]) },
    tail1: { parent: 'hips', pos: [0, H - p.tailDrop * 0.08, -p.tail * 0.2] },
    tail2: { parent: 'tail1', pos: [0, H - p.tailDrop * 0.35, -p.tail * 0.45] },
    tail3: { parent: 'tail2', pos: [0, H - p.tailDrop * 0.68, -p.tail * 0.72] },
    tailTip: { parent: 'tail3', pos: [0, H - p.tailDrop, -p.tail] },
    hlegL: { parent: 'hips', pos: [w, H - g * 0.35, 0.05] },
    hkneeL: { parent: 'hlegL', pos: [w * 1.02, H * 0.48, p.kneeFwd] },
    hfootL: { parent: 'hkneeL', pos: [w * 1.02, H * 0.12, -p.kneeFwd * 0.3] },
    htoeL: { parent: 'hfootL', pos: [w * 1.04, 0.02, p.legT * 0.9] },
    flegL: { parent: 'chest', pos: [w * 0.95, Hc - g * 0.4, L] },
    fkneeL: { parent: 'flegL', pos: [w * 0.98, Hc * 0.48, L - p.kneeFwd * 0.4] },
    ffootL: { parent: 'fkneeL', pos: [w * 0.98, Hc * 0.12, L + p.kneeFwd * 0.1] },
    ftoeL: { parent: 'ffootL', pos: [w, 0.02, L + p.legT * 0.8] },
  };
  const P = (k) => J[k].pos;
  const tails = ['tail1', 'tail2', 'tail3', 'tailTip'];
  const tailR = [g * 0.62, g * 0.42, g * 0.22, g * 0.06];
  const S = [
    { type: 'ellipsoid', c: [0, H - g * 0.05, -0.05 * L], r: [g * 0.9, g * 0.9, g * 1.05], bone: 'hips' },
    { type: 'ellipsoid', c: [0, (H + Hc) / 2 - g * 0.12 + p.hump * 0.5, L * 0.5], r: [g * 1.05, g * 1.0 + p.hump * 0.4, L * 0.55 + g * 0.45], bone: 'spine' },
    { type: 'ellipsoid', c: add(chest, [0, -g * 0.08, 0]), r: [g * 0.92, g * 0.95, g * 0.9], bone: 'chest' },
    { type: 'capsule', a: add(chest, [0, 0, -g * 0.1]), b: P('neck1'), r1: g * 0.7, r2: p.neckR, bone: 'neck1' },
    { type: 'capsule', a: P('neck1'), b: P('neck2'), r1: p.neckR, r2: p.neckR * 0.85, bone: 'neck1' },
    { type: 'capsule', a: P('neck2'), b: head, r1: p.neckR * 0.85, r2: p.headH * 0.42, bone: 'neck2' },
    { type: 'ellipsoid', c: add(head, [0, p.headH * 0.05, p.head * 0.12]), r: [p.headW * 0.5, p.headH * 0.5, p.head * 0.35], bone: 'head' },
    { type: 'capsule', a: add(head, [0, 0, p.head * 0.1]), b: add(head, [0, -p.headH * 0.12, p.head]), r1: p.headH * 0.4, r2: p.headH * 0.26, bone: 'head', k: p.headH * 0.3 },
    { type: 'capsule', a: P('jaw'), b: add(head, [0, -p.headH * 0.45, p.head * 0.85]), r1: p.headH * 0.24, r2: p.headH * 0.15, bone: 'jaw', k: p.headH * 0.12 },
    { type: 'capsule', a: [0, H, -0.1 * L], b: P('tail1'), r1: g * 0.75, r2: tailR[0], bone: 'hips' },
    ...tails.slice(0, 3).map((t, i) => ({ type: 'capsule', a: P(t), b: P(tails[i + 1]), r1: tailR[i], r2: tailR[i + 1], bone: t })),
    { type: 'capsule', a: P('hlegL'), b: P('hkneeL'), r1: p.legT * 1.25, r2: p.legT * 0.85, bone: 'hlegL' },
    { type: 'capsule', a: P('hkneeL'), b: P('hfootL'), r1: p.legT * 0.8, r2: p.legT * 0.7, bone: 'hkneeL' },
    { type: 'capsule', a: P('hfootL'), b: P('htoeL'), r1: p.legT * 0.7, r2: p.legT * 0.55, bone: 'hfootL' },
    { type: 'capsule', a: P('flegL'), b: P('fkneeL'), r1: p.legT * 1.15, r2: p.legT * 0.8, bone: 'flegL' },
    { type: 'capsule', a: P('fkneeL'), b: P('ffootL'), r1: p.legT * 0.78, r2: p.legT * 0.68, bone: 'fkneeL' },
    { type: 'capsule', a: P('ffootL'), b: P('ftoeL'), r1: p.legT * 0.68, r2: p.legT * 0.55, bone: 'ffootL' },
  ];
  return { joints: J, shapes: S, head, chest, H, mouth: [0, -p.headH * 0.3, p.head * 0.95] };
}

function eyes(head, p, color, size = 1) {
  const e = { type: 'eye', bone: 'head', pos: add(head, [p.headW * 0.36, p.headH * 0.18, p.head * 0.22]), r: p.headH * 0.085 * size, color };
  return [e, { ...e, pos: [-e.pos[0], e.pos[1], e.pos[2]] }];
}

function teeth(head, p, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const t = 0.25 + (i / (n - 1)) * 0.68;
    const z = p.head * t, side = p.headW * (0.3 - t * 0.12);
    list.push({ type: 'tooth', bone: 'head', pos: [side, -p.headH * 0.3 + t * p.headH * 0.08, 0].map((v, k) => v + head[k] + (k === 2 ? z : 0)), len: p.headH * 0.14, r: p.headH * 0.035, down: true });
    list.push({ type: 'tooth', bone: 'jaw', pos: [side * 0.9, -p.headH * 0.36 + t * p.headH * 0.0, 0].map((v, k) => v + head[k] + (k === 2 ? z * 0.95 : 0)), len: p.headH * 0.11, r: p.headH * 0.03, down: false });
  }
  return list.flatMap((a) => [a, { ...a, pos: [-a.pos[0], a.pos[1], a.pos[2]] }]);
}

// ---------- the bestiary ----------
const rexP = { hip: 4.4, body: 3.0, girth: 1.5, neck: 1.9, neckRise: 0.9, head: 2.5, headH: 1.55, headW: 1.45, tail: 9.5, tailDrop: 1.4, hipW: 1.0, thigh: 0.98, arm: 0.95, armR: 0.22 };
const rexB = biped(rexP);
const raptorP = { hip: 1.15, body: 1.0, girth: 0.37, neck: 0.95, neckRise: 0.55, head: 0.8, headH: 0.36, headW: 0.3, tail: 2.9, tailDrop: 0.05, hipW: 0.27, thigh: 0.27, arm: 0.62, armR: 0.075 };
const raptorB = biped(raptorP);
const hornP = { hip: 2.5, shoulder: 2.25, body: 3.2, girth: 1.45, hump: 0.25, neck: 1.0, neckRise: 0.15, neckR: 0.95, head: 2.3, headH: 1.25, headW: 1.15, tail: 3.6, tailDrop: 1.0, legW: 0.95, legT: 0.42, kneeFwd: 0.25 };
const hornB = quadruped(hornP);
const longP = { hip: 5.6, shoulder: 5.9, body: 5.2, girth: 2.4, hump: 0.6, neck: 7.5, neckRise: 7.2, neckR: 0.75, head: 1.4, headH: 0.75, headW: 0.7, tail: 13, tailDrop: 4.2, legW: 1.45, legT: 0.72, kneeFwd: 0.3 };
const longB = quadruped(longP);
const bossP = { hip: 11, shoulder: 14, body: 13, girth: 6.5, hump: 3, neck: 4.5, neckRise: 1.0, neckR: 3.6, head: 8, headH: 5.2, headW: 5.2, tail: 20, tailDrop: 8, legW: 5.0, legT: 2.2, kneeFwd: 1.2 };
const bossB = quadruped(bossP);

export const SPECIES = {
  raptor: finish({
    id: 'raptor', scale: 2.6, name: 'רץ', plural: 'רצים', gait: 'biped', ...raptorB,
    blend: 0.12, skinFalloff: 0.05, res: 70,
    palette: { back: 0x2f6e5c, belly: 0xc9c9a0, stripe: 0x16231c, stripeFreq: 5.5, stripeAmt: 0.85 },
    skin: 'tex_scales', texScale: 0.5, rim: 0x203a30, glow: 0x000000,
    attachments: [...eyes(raptorB.head, raptorP, 0xffd23a, 1.3), ...teeth(raptorB.head, raptorP, 5),
      { type: 'claw', bone: 'footL', pos: add(raptorB.joints.footL.pos, [0.03, -0.05, 0.12]), len: 0.22, r: 0.035, curve: true },
      { type: 'quills', bone: 'neck', from: raptorB.joints.chest.pos, to: raptorB.head, n: 6, len: 0.16, r: 0.03, color: 0x8a2a1a }],
    hp: 60, speed: 15, walk: 3, stride: 2.3, score: 100, radius: 1.6, height: 1.6,
    charge: 21, reach: 11, attack: 'pounce', damage: 7,
    desc: 'קטן, מהיר ותמיד בלהקה. רץ בזיגזג וקופץ ישר על החלון, אז כדאי לירות בו עוד באוויר.',
    sound: { pitch: 1.9, rough: 0.4 },
  }),
  rex: finish({
    id: 'rex', scale: 2.4, name: 'טורף', plural: 'טורפים', gait: 'biped', ...rexB,
    blend: 0.45, skinFalloff: 0.22, res: 92,
    palette: { back: 0x5a2418, belly: 0xb88a62, stripe: 0x1a0d09, stripeFreq: 1.2, stripeAmt: 0.75 },
    skin: 'tex_scales', texScale: 1.6, rim: 0x3a1206, glow: 0x000000,
    attachments: [...eyes(rexB.head, rexP, 0xff7a10), ...teeth(rexB.head, rexP, 9),
      { type: 'claw', bone: 'footL', pos: add(rexB.joints.toeL.pos, [0, 0.1, 0.1]), len: 0.5, r: 0.12 },
      { type: 'plates', bones: ['neck', 'chest', 'spine', 'hips', 'tail1', 'tail2'], bone: 'hips', n: 12, size: 0.38, color: 0x2a1410 }],
    hp: 750, speed: 7, walk: 3, stride: 5.5, score: 500, radius: 3.5, height: 7, fire: true,
    charge: 9.5, reach: 18, attack: 'bite', damage: 14,
    desc: 'ענק על שתי רגליים. מרחוק הוא יורק כדורי אש, ומקרוב הוא נוגס. את כדורי האש אפשר להפיל בתותח.',
    sound: { pitch: 0.55, rough: 1 },
  }),
  horned: finish({
    id: 'horned', scale: 2.6, name: 'שריון', plural: 'שריונים', gait: 'quad', ...hornB,
    blend: 0.4, skinFalloff: 0.2, res: 84,
    palette: { back: 0x5b5a2e, belly: 0xb9a77a, stripe: 0x2d2a14, stripeFreq: 2.2, stripeAmt: 0.45 },
    skin: 'tex_hide', texScale: 1.3, rim: 0x2a2a10, glow: 0x000000,
    attachments: [...eyes(hornB.head, hornP, 0xffc040, 0.8),
      { type: 'horn', bone: 'head', pos: add(hornB.head, [0.42, hornP.headH * 0.42, hornP.head * 0.25]), dir: [0.2, 0.55, 1], len: 1.7, r: 0.2, color: 0xe8dcc0, sym: true },
      { type: 'horn', bone: 'head', pos: add(hornB.head, [0, hornP.headH * 0.05, hornP.head * 0.88]), dir: [0, 0.75, 1], len: 0.7, r: 0.15, color: 0xe8dcc0, center: true },
      { type: 'frill', bone: 'head', pos: add(hornB.head, [0, hornP.headH * 0.55, -hornP.head * 0.12]), r: 1.75, color: 0xd0601e, spikes: 9 }],
    hp: 520, speed: 5, walk: 2.4, stride: 3.2, score: 250, radius: 3, height: 3.4, armored: true,
    charge: 13, reach: 13, attack: 'ram', damage: 12,
    desc: 'שריון עבה בחזית. מסתער בראש מורכן ונוגח, ואז נסוג ומסתער שוב. טיל עוצר אותו מהר.',
    sound: { pitch: 0.8, rough: 0.7 },
  }),
  longneck: finish({
    id: 'longneck', scale: 2.3, name: 'ענק', plural: 'ענקים', gait: 'quad', ...longB,
    blend: 0.7, skinFalloff: 0.35, res: 96,
    palette: { back: 0x48586a, belly: 0xc2c4b8, stripe: 0x2c3540, stripeFreq: 0.7, stripeAmt: 0.5 },
    skin: 'tex_hide', texScale: 2.2, rim: 0x1c2630, glow: 0x000000,
    attachments: [...eyes(longB.head, longP, 0xeaff70, 1.4)],
    hp: 1400, speed: 2.6, walk: 1.6, stride: 5.5, score: 400, radius: 6, height: 14, wades: true,
    charge: 6, reach: 26, attack: 'stomp', damage: 16,
    desc: 'הגדול ביותר בעמק. איטי אבל צריך הרבה פגיעות, וכשהוא מגיע הוא רוקע ומרעיד את כל הקרקע.',
    sound: { pitch: 0.4, rough: 0.3 },
  }),
  boss: finish({
    id: 'boss', scale: 2.0, name: 'מלך הלבה', plural: 'מלך הלבה', gait: 'quad', ...bossB,
    blend: 2.2, skinFalloff: 1.0, res: 110,
    palette: { back: 0x1e1916, belly: 0x3a2c26, stripe: 0x0d0a09, stripeFreq: 0.35, stripeAmt: 0.6 },
    skin: 'tex_ash', texScale: 6, rim: 0x401004, glow: 0xff5a10, roughness: 0.8, bump: 2.2,
    attachments: [...eyes(bossB.head, bossP, 0xffe070, 1.2), ...teeth(bossB.head, bossP, 7),
      { type: 'crystal', bone: 'spine', pos: add(bossB.joints.spine.pos, [0, bossP.girth * 0.95 + bossP.hump * 0.4, -2]), len: 9, r: 1.6, weak: 0 },
      { type: 'crystal', bone: 'chest', pos: add(bossB.chest, [3.2, bossP.girth * 0.7, -1]), len: 7, r: 1.3, weak: 1, tilt: 0.35 },
      { type: 'crystal', bone: 'hips', pos: [-3.0, bossP.hip + bossP.girth * 0.75, 0], len: 7, r: 1.3, weak: 2, tilt: -0.35 },
      { type: 'plates', bones: ['neck2', 'neck1', 'chest', 'spine', 'hips', 'tail1', 'tail2'], bone: 'hips', n: 14, size: 2.2, color: 0x2a201c, glow: true }],
    hp: 9000, speed: 1.5, walk: 1.2, stride: 12, score: 5000, radius: 16, height: 30, boss: true, girth: bossP.girth,
    desc: 'שליט האגם הבוער. שלושה גבישי אש על גופו מגינים עליו. נפצו אותם, ואז ירו בלב הזוהר בחזה. מטאורים וכדורי אש אפשר להפיל בתותח.',
    sound: { pitch: 0.25, rough: 1.2 },
  }),
  flyer: makeFlyer(),
};

function makeFlyer() {
  const J = {
    body: { pos: [0, 0, 0] },
    chest: { parent: 'body', pos: [0, 0.1, 0.9] },
    neck: { parent: 'chest', pos: [0, 0.35, 1.5] },
    head: { parent: 'neck', pos: [0, 0.55, 2.3] },
    jaw: { parent: 'head', pos: [0, 0.42, 2.45] },
    tail1: { parent: 'body', pos: [0, -0.05, -1.1] },
    tailTip: { parent: 'tail1', pos: [0, -0.1, -2.2] },
    shoulderL: { parent: 'chest', pos: [0.35, 0.2, 0.9] },
    elbowL: { parent: 'shoulderL', pos: [2.2, 0.3, 0.6] },
    wristL: { parent: 'elbowL', pos: [3.8, 0.25, 1.1] },
    fingerL: { parent: 'wristL', pos: [6.6, 0.0, -0.4] },
    legL: { parent: 'body', pos: [0.3, -0.25, -0.5] },
    footL: { parent: 'legL', pos: [0.35, -0.6, -1.0] },
  };
  const P = (k) => J[k].pos;
  const S = [
    { type: 'ellipsoid', c: [0, 0, 0.1], r: [0.48, 0.5, 1.15], bone: 'body' },
    { type: 'ellipsoid', c: [0, 0.12, 0.9], r: [0.52, 0.52, 0.65], bone: 'chest' },
    { type: 'capsule', a: P('chest'), b: P('head'), r1: 0.32, r2: 0.2, bone: 'neck' },
    { type: 'ellipsoid', c: [0, 0.58, 2.45], r: [0.24, 0.27, 0.42], bone: 'head' },
    { type: 'capsule', a: [0, 0.6, 2.5], b: [0, 0.48, 3.9], r1: 0.15, r2: 0.035, bone: 'head', k: 0.08 },
    { type: 'capsule', a: [0, 0.82, 2.35], b: [0, 1.15, 1.35], r1: 0.1, r2: 0.03, bone: 'head', k: 0.1 },
    { type: 'capsule', a: P('jaw'), b: [0, 0.38, 3.75], r1: 0.09, r2: 0.03, bone: 'jaw', k: 0.05 },
    { type: 'capsule', a: [0, 0, -0.6], b: P('tailTip'), r1: 0.3, r2: 0.04, bone: 'tail1' },
    { type: 'capsule', a: P('shoulderL'), b: P('elbowL'), r1: 0.22, r2: 0.13, bone: 'shoulderL', k: 0.2 },
    { type: 'capsule', a: P('elbowL'), b: P('wristL'), r1: 0.12, r2: 0.09, bone: 'elbowL', k: 0.06 },
    { type: 'capsule', a: P('wristL'), b: P('fingerL'), r1: 0.08, r2: 0.025, bone: 'wristL', k: 0.04 },
    { type: 'capsule', a: P('legL'), b: P('footL'), r1: 0.11, r2: 0.06, bone: 'legL', k: 0.08 },
  ];
  return finish({
    id: 'flyer', scale: 2.3, name: 'כנף', plural: 'כנפיים', gait: 'flyer', joints: J, shapes: S, head: P('head'), H: 0, mouth: [0, -0.1, 1.5],
    blend: 0.18, skinFalloff: 0.07, res: 92,
    palette: { back: 0x4a3a5c, belly: 0xb39aa8, stripe: 0x231a2d, stripeFreq: 3, stripeAmt: 0.5 },
    skin: 'tex_hide', texScale: 0.6, rim: 0x2a1a40, glow: 0x000000,
    membrane: { color: 0x5a3550, chain: ['shoulderL', 'elbowL', 'wristL', 'fingerL'], trailing: ['body', 'body', 'tail1'] },
    attachments: [{ type: 'eye', bone: 'head', pos: [0.17, 0.66, 2.55], r: 0.06, color: 0x80ff60, sym: true }],
    hp: 110, speed: 75, walk: 40, stride: 1, score: 300, radius: 3.5, height: 1, flies: true, spit: true,
    charge: 34, reach: 8, attack: 'dive', damage: 8,
    desc: 'מעופף שצולל ישר אל החלון, נוגס ומסתובב לסיבוב נוסף. מרחוק הוא יורק חומצה ירוקה.',
    sound: { pitch: 2.4, rough: 0.6 },
  });
}

export const SPECIES_ORDER = ['raptor', 'horned', 'longneck', 'rex', 'flyer', 'boss'];
