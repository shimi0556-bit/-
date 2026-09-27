// Mushroom cottage: soft organic blends, painted spots, a carved door and glowing windows.
scene({ light: 'sunset' });

const capR = param('capR', 0.78, 0.55, 1.0);

const stem = capsule([0, 0, 0], [0, 0.78, 0], 0.34, 0.27)
  .displace(0.008, 10, { octaves: 3 })
  .color('#efe3cc', 'satin')
  .colorNoise('#d9c7a6', 6, 0.5);

const cap = ellipsoid(capR, capR * 0.58, capR).move(0, 0.9, 0)
  .cut(ellipsoid(capR * 0.92, capR * 0.3, capR * 0.92).move(0, 0.62, 0), 0.08)   // hollow underside
  .color('#c8372d', 'glossy')
  .paint(sphere(0.13).move(capR * 0.45, 1.12, capR * 0.45).mirror('x'), '#fff4e2', 0.012)
  .paint(sphere(0.1).move(0, 1.32, 0.12), '#fff4e2', 0.012)
  .paint(sphere(0.09).move(capR * 0.7, 1.02, -capR * 0.3).mirror('x'), '#fff4e2', 0.012)
  .paint(sphere(0.11).move(0.1, 1.2, -capR * 0.6), '#fff4e2', 0.012);

// door: carved arch, painted by the colored cutter, with a tiny knob
const door = box(0.22, 0.36, 0.3, 0.1).move(0, 0.18, 0.34).color('#5b3a22', 'satin');
const knob = sphere(0.018).move(0.06, 0.2, 0.3).color('#d8b25a', 'metal');

// round windows with warm light
const win = cylinder(0.065, 0.2).rotateX(90).rotateY(40).move(0.22, 0.55, 0.22).color('#ffcf6b', 'glow');
const frame = torus(0.075, 0.018).rotateX(90).rotateY(40).move(0.25, 0.55, 0.25).color('#5b3a22', 'satin');

// grass tufts around the base
const tuft = cone(0.03, 0.001, 0.2).rotateZ(12).move(0.46, 0.08, 0).color('#6f9e3a', 'satin');

return stem
  .add(cap, 0.06)
  .cut(door, 0.015)
  .add(knob, 0.004)
  .cut(win.mirror('x'), 0.01)
  .add(frame.mirror('x'), 0.008)
  .add(tuft.ring(14), 0.02);
