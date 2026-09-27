// Friendly helper robot: hard-surface forms, a recessed glossy visor, glowing eyes.
scene({ light: 'studio' });

const headW = param('headWidth', 0.92, 0.7, 1.2);
const armDrop = param('armDrop', 0.0, -0.25, 0.25);

const white = '#eeeae2';
const orange = '#ff7a2f';
const steel = '#a3a9b4';
const joint = '#6d7380';

// ---- head ----
const headY = 1.58;
let head = box(headW, 0.64, 0.72, 0.22).move(0, headY, 0).color(white, 'plastic');
// visor pocket, painted dark glossy by the colored cutter
head = head.cut(box(headW - 0.2, 0.42, 0.3, 0.14).move(0, headY - 0.02, 0.4).color('#101318', 'glossy'), 0.02);
const eye = box(0.1, 0.15, 0.06, 0.05).move(0.17, headY, 0.26).color('#7df3ff', 'glow');
const ear = cylinder(0.15, 0.1, 0.03).rotateZ(90).move(headW / 2 + 0.02, headY, 0).color(orange, 'plastic')
  .add(cylinder(0.07, 0.06, 0.02).rotateZ(90).move(headW / 2 + 0.08, headY, 0).color(steel, 'metal'), 0.01);
const antenna = capsule([0, headY + 0.3, 0], [0.05, headY + 0.55, -0.05], 0.022).color(steel, 'metal')
  .add(sphere(0.06).move(0.05, headY + 0.58, -0.05).color(orange, 'glow'), 0.01);
head = head.add(eye.mirror('x'), 0.01).add(ear.mirror('x'), 0.02).add(antenna, 0.03);

// ---- body ----
const neck = cylinder(0.13, 0.3, 0.02).move(0, 1.2, 0).color(joint, 'brushed');
let torso = box(0.96, 0.82, 0.66, 0.28).move(0, 0.86, 0).color(white, 'plastic')
  .paint(box(2, 0.16, 2).move(0, 0.56, 0), orange, 0.004)
  .cut(box(0.5, 0.32, 0.3, 0.09).shell(0.014).move(0, 0.95, 0.33), 0.004)
  .add(cylinder(0.07, 0.06, 0.02).rotateX(90).move(0, 0.95, 0.33).color('#ffd166', 'glow'), 0.01)
  // back vents: one slot repeated four times
  .cut(capsule([-0.18, 0, 0], [0.18, 0, 0], 0.028).grid([0, 0.09, 0], [1, 4, 1]).move(0, 0.95, -0.34).color('#23262d', 'satin'), 0.012);

// ---- arms (model the right side, mirror it) ----
const sh = [0.56, 1.06 + armDrop * 0.2, 0];
const el = [0.66, 0.78 + armDrop, 0.04];
const wr = [0.62, 0.52 + armDrop, 0.16];
const arm = sphere(0.13).move(...sh).color(steel, 'metal')
  .add(capsule(sh, el, 0.085, 0.075).color(white, 'plastic'), 0.04)
  .add(sphere(0.085).move(...el).color(steel, 'metal'), 0.02)
  .add(capsule(el, wr, 0.08, 0.1).color(white, 'plastic'), 0.03)
  .add(torus(0.08, 0.035).rotateX(80).move(wr[0], wr[1] - 0.08, wr[2] + 0.03).color(orange, 'plastic'), 0.02);

// ---- legs ----
const leg = capsule([0.22, 0.5, 0], [0.24, 0.2, 0.02], 0.1, 0.09).color(joint, 'brushed')
  .add(box(0.3, 0.16, 0.42, 0.07).move(0.25, 0.08, 0.06).color(white, 'plastic')
    .paint(box(1, 1, 0.1).move(0.25, 0.08, 0.27), orange, 0.005), 0.05);

return torso
  .add(neck, 0.04)
  .add(head, 0.03)
  .add(arm.mirror('x'), 0.03)
  .add(leg.mirror('x'), 0.04);
