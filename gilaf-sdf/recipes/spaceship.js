// Scout spaceship: mirrored hard-surface forms, elongate(), extruded wing outlines, glowing engines.
scene({ light: 'night' });

const sweep = param('wingSweep', 0.4, 0.0, 0.8);
const hull = '#dfe3e8';
const dark = '#2a2f38';
const accent = '#ff5a36';

// fuselage: long rounded body tapering to a pointed nose
let fuselage = capsule([0, 0, 1.3], [0, 0, -0.9], 0.08, 0.3)
  .scale(1, 0.72, 1)
  .add(ellipsoid(0.34, 0.24, 0.9).move(0, 0.02, -0.45), 0.2)
  .cut(halfspace('y', -0.14), 0.05)                 // flat belly
  .color(hull, 'plastic');

// canopy: glossy glass bubble
const canopy = ellipsoid(0.17, 0.15, 0.48).move(0, 0.11, 0.42).color('#0d1420', 'glossy');

// panel seams and a dorsal stripe
fuselage = fuselage
  .cut(box(1, 0.01, 0.012).grid([0, 0, 0.3], [1, 1, 4]).move(0, 0.1, -0.55).color(dark), 0.003)
  .paint(box(0.08, 1, 1.4).move(0, 0.3, -0.35), accent, 0.006);

// air intakes on the sides
const intake = box(0.16, 0.14, 0.4, 0.05).move(0.3, -0.02, -0.05)
  .cut(box(0.12, 0.09, 0.3, 0.04).move(0.3, -0.02, 0.1).color('#101318', 'satin'), 0.01)
  .color(hull, 'plastic');

// wing: 2D outline extruded thin and laid flat; built for the right side, mirrored
const wing = polygon([
  [0.25, 0.5], [1.3, -0.15 - sweep * 0.55], [1.38, -0.5 - sweep * 0.55], [0.25, -0.72],
]).extrude(0.07, 0.025)
  .rotateX(90).move(0, -0.06, -0.3)
  .color(hull, 'plastic')
  .paint(box(0.35, 1, 3).move(1.2, 0, 0), accent, 0.008)
  .cut(box(0.5, 1, 0.012).move(0.8, 0, -0.35 - sweep * 0.25).rotateY(-20).color(dark), 0.003);

// wingtip cannons and the main engines with glowing nozzles
const cannon = capsule([1.32, -0.06, 0.25 - sweep * 0.5], [1.32, -0.06, -0.85 - sweep * 0.4], 0.05, 0.085).color('#8f96a1', 'metal');
const engine = capsule([0.34, 0, -0.3], [0.34, 0, -1.25], 0.14, 0.2).color('#8f96a1', 'brushed')
  .cut(cylinder(0.15, 0.3).rotateX(90).move(0.34, 0, -1.45).color('#6fd8ff', 'glow'), 0.02);

// twin tail fins leaning outward
const fin = polygon([[0, 0], [0.6, 0], [0.7, 0.45], [0.5, 0.47]], 1).extrude(0.05, 0.02)
  .rotateY(90).rotateZ(-14).move(0.2, 0.08, -0.7).color(hull, 'plastic')
  .paint(box(1, 0.14, 2).move(0.3, 0.46, 0), accent, 0.006);

return fuselage
  .add(canopy, 0.03)
  .add(intake.mirror('x'), 0.04)
  .add(wing.mirror('x'), 0.06)
  .add(cannon.mirror('x'), 0.03)
  .add(engine.mirror('x'), 0.08)
  .add(fin.mirror('x'), 0.03);
