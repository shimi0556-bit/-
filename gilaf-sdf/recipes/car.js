// "Gilaf GT": a curvy coupe built to Shimotron Rally's car format.
// Metres, +Z forward, Y up, wheels at x = ±0.975, z = ±1.4, radius 0.384.
// exportParts() writes one GLB node per part with the names and materials the game looks for:
// 'Paint 1 Carmine' (recoloured by the game), 'Headlight', 'Brakelight', and Wheel<FrontL|FrontR|RearL|RearR>...
scene({ light: 'studio' });

const R = 0.384;      // wheel radius
const TW = 0.28;      // tyre width
const TRACK = 0.975;  // wheel centre x
const AXLE = 1.4;     // wheel centre z
const paint = '#d8322b';

// ---------- body ----------
const hull = box(1.86, 0.5, 4.2, 0.24).move(0, 0.6, -0.03);
const nose = ellipsoid(0.93, 0.3, 0.78).move(0, 0.55, 1.37);
const fender = (x, z) => ellipsoid(0.34, 0.34, 0.72).move(x, 0.64, z);
const cabin = ellipsoid(0.74, 0.44, 1.25).move(0, 0.86, -0.25);
const arch = (z) => cylinder(0.47, 2.6).rotateZ(90).move(0, R, z);
const vent = (x) => capsule([x, 0.83, 0.75], [x * 1.8, 0.8, 1.2], 0.022);

const body = hull
  .add(nose, 0.3)
  .add(union(fender(0.78, AXLE), fender(-0.78, AXLE), fender(0.8, -AXLE), fender(-0.8, -AXLE)), 0.22)
  .add(cabin, 0.22)
  .cut(union(arch(AXLE), arch(-AXLE)), 0.06)          // wheel arches
  .cut(union(vent(0.16), vent(-0.16)), 0.01)          // hood vents
  .cut(halfspace('y', 0.2), 0.04)                     // flat floor
  .color(paint, 'glossy');

// window band: the cabin, slightly inflated, sliced between belt line and roof
const windows = cabin.round(0.014)
  .intersect(box(3, 0.23, 3).move(0, 1.035, -0.25), 0.02)
  .color('#101722', { rough: 0.06, metal: 0.2 });

// racing stripe: a thin layer just above the paint, down the middle
const stripe = body.round(0.006)
  .intersect(union(...[-1, 1].map((s) => box(0.14, 2, 5).move(s * 0.13, 1, 0))))
  .intersect(halfspace('-y', 0.62))
  .color('#f3f1ea', 'glossy');

// ---------- lights ----------
const headlight = (s) => ellipsoid(0.27, 0.11, 0.2).rotateY(s * 18).rotateZ(-s * 8).move(s * 0.56, 0.63, 2.0);
const headlights = union(headlight(1), headlight(-1)).color('#fff4dc', 'glossy');
const brakelights = capsule([-0.72, 0.74, -2.19], [0.72, 0.74, -2.19], 0.042)
  .add(union(...[-1, 1].map((s) => ellipsoid(0.16, 0.07, 0.05).move(s * 0.64, 0.74, -2.2))), 0.02)
  .color('#ff2a2a', 'glossy');

// ---------- trim: intake, skirts, diffuser, mirrors, wing ----------
const mirror = (s) => ellipsoid(0.1, 0.06, 0.08).move(s * 0.84, 1.0, 0.52)
  .add(capsule([s * 0.7, 0.93, 0.5], [s * 0.8, 0.99, 0.52], 0.02), 0.02);
const wing = box(1.72, 0.045, 0.34, 0.02).rotateX(-6).move(0, 1.12, -1.95)
  .add(union(...[-1, 1].map((s) => box(0.05, 0.28, 0.14, 0.02).move(s * 0.55, 0.98, -1.93))), 0.02);
const trim = union(
  box(1.1, 0.13, 0.22, 0.06).move(0, 0.37, 2.02),                      // front intake
  ...[-1, 1].map((s) => box(0.09, 0.1, 1.9, 0.04).move(s * 0.93, 0.26, 0)), // side skirts
  box(1.4, 0.12, 0.26, 0.04).move(0, 0.3, -2.09),                      // diffuser
  mirror(1), mirror(-1),
  wing,
).color('#16181c', 'satin');

const exhaust = union(...[-1, 1].map((s) => cylinder(0.055, 0.22, 0.012).rotateX(90).move(s * 0.42, 0.33, -2.14)))
  .cut(union(...[-1, 1].map((s) => cylinder(0.038, 0.3).rotateX(90).move(s * 0.42, 0.33, -2.24))), 0.004)
  .color('#c9ccd2', 'metal');

// ---------- wheels (L = +x) ----------
const tyre = (x, z) => cylinder(R, TW, 0.07).rotateZ(90)
  .cut(cylinder(0.262, TW + 0.2).rotateZ(90), 0.02)                                      // hole for the rim
  .cut(union(...[-1, 1].map((k) => torus(R + 0.004, 0.011).rotateZ(90).move(k * 0.06, 0, 0))), 0.004)  // tread grooves
  .move(x, R, z)
  .color('#1b1c1f', 'matte');
const rim = (x, z) => {
  const s = Math.sign(x);
  const face = s * (TW / 2 - 0.03);
  return cylinder(0.27, TW - 0.06, 0.02).rotateZ(90)
    .cut(cylinder(0.232, 0.12).rotateZ(90).move(face, 0, 0), 0.015)                        // dished face
    .add(star(5, 0.232, 0.075).round(0.012).extrude(0.05, 0.01).rotateY(90).move(face - s * 0.03, 0, 0), 0.01)
    .add(cylinder(0.055, 0.07, 0.015).rotateZ(90).move(face - s * 0.01, 0, 0), 0.01)       // hub cap
    .move(x, R, z)
    .color('#d3d7dd', 'metal');
};
const wheels = [['FrontL', TRACK, AXLE], ['FrontR', -TRACK, AXLE], ['RearL', TRACK, -AXLE], ['RearR', -TRACK, -AXLE]];

exportParts([
  { name: 'Body', shape: body, material: 'Paint 1 Carmine' },
  { name: 'Windows', shape: windows, material: 'Window' },
  { name: 'Stripe', shape: stripe, material: 'Stripe' },
  { name: 'Headlights', shape: headlights, material: 'Headlight' },
  { name: 'Brakelights', shape: brakelights, material: 'Brakelight' },
  { name: 'Trim', shape: trim, material: 'Trim' },
  { name: 'Exhaust', shape: exhaust, material: 'Exhaust' },
  ...wheels.flatMap(([n, x, z]) => [
    { name: `Wheel${n}Tire`, shape: tyre(x, z), material: 'Tire' },
    { name: `Wheel${n}Rim`, shape: rim(x, z), material: 'Rim' },
  ]),
]);

return union(body, stripe, windows, headlights, brakelights, trim, exhaust, ...wheels.flatMap(([, x, z]) => [tyre(x, z), rim(x, z)]));
