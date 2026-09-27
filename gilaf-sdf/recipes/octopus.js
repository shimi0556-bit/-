// Octopus: organic blending, spline tentacles repeated with ring(), mottled skin.
scene({ light: 'sunset' });

const curl = param('curl', 1.0, 0.0, 1.6);
const skin = '#e0633f';
const belly = '#f6b28f';

// one tentacle along +X, curling up at the tip; ring(8) makes the other seven
const t = (a) => a * curl;
const tentacle = tube([
  [0.3, 0.4, 0, 0.16],
  [0.58, 0.2, 0, 0.13],
  [0.88, 0.1, 0.04, 0.1],
  [1.12, 0.12 + t(0.08), 0.08, 0.07],
  [1.22, 0.28 + t(0.14), 0.02, 0.045],
  [1.12, 0.4 + t(0.2), -0.06 * curl, 0.025],
], { smooth: 6 })
  // suckers: pale dots on the underside
  .paint(sphere(0.045).grid([0.16, 0, 0], [6, 1, 1]).move(0.72, 0.02, 0.02), '#fbd9c4', 0.012);

const legs = tentacle.ring(8).color(skin, 'satin')
  .gradient(belly, 'y', 0.35, 0.02);

// mantle (the head) and the web between the legs
const mantle = ellipsoid(0.62, 0.74, 0.6).move(0, 1.08, -0.08).rotateX(-12)
  .displace(0.012, 5, { octaves: 3, seed: 2 });
const web = ellipsoid(0.7, 0.3, 0.7).move(0, 0.48, 0);
const bodyShape = mantle.add(web, 0.28).color(skin, 'satin')
  .colorNoise('#b8432a', 7, 0.7, { sharp: 0.6 })
  .gradient(belly, 'y', 0.75, 0.35);

// eyes on the side of the head, with a slit pupil
const eyeBall = sphere(0.14).color('#f7efe0', 'glossy')
  .paint(box(0.14, 0.04, 0.3).move(0.02, 0, 0.1), '#15110e', 0.004)
  .paint(sphere(0.05).move(0.02, 0.03, 0.14), '#15110e', 0.002);
const eyeLid = ellipsoid(0.19, 0.12, 0.17).move(0, 0.06, -0.02).cut(sphere(0.16).move(0.02, -0.05, 0.08), 0.03).color(skin, 'satin');
const eye = eyeBall.add(eyeLid, 0.03).rotateY(28).move(0.3, 0.86, 0.36);

return bodyShape.add(legs, 0.12).add(eye.mirror('x'), 0.05);
