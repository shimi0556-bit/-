// Cute sitting puppy with a looping animation: tail wag, curious head tilt,
// floppy ears that follow the head, breathing, blinking and a panting tongue.
scene({ light: 'studio' });

const headSize = param('headSize', 1.0, 0.8, 1.25);
const earLength = param('earLength', 1.0, 0.7, 1.4);

const fur = '#dc9853';
const cream = '#f7e6cc';
const earFur = '#9b6034';
const dark = '#1b1512';

// ---------- body (sitting) ----------
const rump = ellipsoid(0.42, 0.33, 0.44).move(0, 0.32, -0.14);
const chest = ellipsoid(0.3, 0.42, 0.3).rotateX(-14).move(0, 0.64, 0.06);
const thigh = (s) => ellipsoid(0.17, 0.21, 0.27).rotateX(-20).move(s * 0.25, 0.26, -0.04);
const hindPaw = (s) => ellipsoid(0.1, 0.07, 0.15).move(s * 0.27, 0.065, 0.16);
const frontLeg = (s) => capsule([s * 0.14, 0.62, 0.13], [s * 0.15, 0.1, 0.25], 0.085, 0.075);
const frontPaw = (s) => ellipsoid(0.105, 0.075, 0.13).move(s * 0.15, 0.07, 0.29);
// toe grooves on each front paw
const toes = (s) => union(...[-1, 1].map((k) => capsule([s * 0.15 + k * 0.035, 0.1, 0.36], [s * 0.15 + k * 0.035, 0.06, 0.41], 0.008)));

let body = rump
  .add(chest, 0.18)
  .add(union(thigh(1), thigh(-1)), 0.1)
  .add(union(hindPaw(1), hindPaw(-1)), 0.05)
  .add(union(frontLeg(1), frontLeg(-1)), 0.06)
  .add(union(frontPaw(1), frontPaw(-1)), 0.04)
  .color(fur, 'satin')
  .colorNoise('#c98a4f', 9, 0.35, { sharp: 0.2 })
  .paint(ellipsoid(0.2, 0.3, 0.2).move(0, 0.62, 0.28), cream, 0.06)           // chest blaze
  .paint(box(2, 0.16, 2).move(0, 0.02, 0), cream, 0.04)                       // white socks
  .paint(ellipsoid(0.3, 0.22, 0.34).move(0, 0.56, -0.3), '#b8773f', 0.07)     // darker saddle on the back
  .cut(union(toes(1), toes(-1)).color('#b98755'), 0.006);

// ---------- collar ----------
// collar: low at the chest, high at the back of the neck
const collarR = param('collarSize', 0.25, 0.2, 0.3);
const collar = torus(collarR, 0.042).rotateX(22).move(0, 0.94, 0.05).color('#d8443c', 'plastic');
const tagY = 0.94 - collarR * Math.sin(rad(22)) - 0.07;
const tagZ = 0.05 + collarR * Math.cos(rad(22)) + 0.085;
const tag = cylinder(0.068, 0.024, 0.01).rotateX(75).move(0, tagY, tagZ).color('#f2c14e', 'metal')
  .add(torus(0.022, 0.008).rotateY(90).move(0, tagY + 0.07, tagZ - 0.01).color('#f2c14e', 'metal'), 0.005);

// ---------- head ----------
const hs = headSize;
const headY = 1.14;
const skull = ellipsoid(0.34 * hs, 0.31 * hs, 0.3 * hs).move(0, headY, 0.1);
const cheek = (s) => sphere(0.105 * hs).move(s * 0.085 * hs, headY - 0.13 * hs, 0.3 * hs);
const muzzle = ellipsoid(0.15 * hs, 0.1 * hs, 0.13 * hs).move(0, headY - 0.1 * hs, 0.33 * hs);
const nose = ellipsoid(0.066 * hs, 0.048 * hs, 0.05 * hs).move(0, headY - 0.06 * hs, 0.455 * hs).color(dark, 'glossy');

// mouth: a short line under the nose and a small "w" smile, cut in and painted dark
const smile = union(...[-1, 1].map((s) => torus(0.042 * hs, 0.011 * hs).rotateX(90).move(s * 0.042 * hs, headY - 0.14 * hs, 0.43 * hs)))
  .intersect(halfspace('y', headY - 0.14 * hs))
  .add(capsule([0, headY - 0.09 * hs, 0.45 * hs], [0, headY - 0.14 * hs, 0.44 * hs], 0.008 * hs))
  .color('#3a2418', 'satin');

// eyes: glossy with a sparkle; each is a bone so it can blink (squash)
const eye = (s, name) => {
  const c = [s * 0.14 * hs, headY + 0.02 * hs, 0.335 * hs];
  return sphere(0.068 * hs).move(...c).color(dark, 'glossy')
    .paint(sphere(0.022 * hs).move(c[0] + s * 0.012 * hs, c[1] + 0.03 * hs, c[2] + 0.055 * hs), '#ffffff', 0.004)
    .bone(name, c);
};
const brow = (s) => sphere(0.045 * hs).move(s * 0.12 * hs, headY + 0.13 * hs, 0.3 * hs);

// floppy ears hanging from the top of the head; each swings around its root
const ear = (s, name) => {
  const root = [s * 0.25 * hs, headY + 0.2 * hs, 0.05 * hs];
  return ellipsoid(0.12 * hs, 0.22 * hs * earLength, 0.06 * hs)
    .rotateZ(-s * 10)
    .rotateY(s * 12)
    .move(s * 0.34 * hs, headY - 0.04 * hs - 0.08 * (earLength - 1), 0.04 * hs)
    .color(earFur, 'satin')
    .colorNoise('#7d4a26', 7, 0.4)
    .bone(name, root);
};

// panting tongue
const tongue = ellipsoid(0.048 * hs, 0.018 * hs, 0.06 * hs).rotateX(35).move(0, headY - 0.185 * hs, 0.43 * hs)
  .color('#f07f86', 'glossy')
  .bone('tongue', [0, headY - 0.15 * hs, 0.4 * hs]);

let head = skull
  .add(union(cheek(1), cheek(-1)), 0.05)
  .add(muzzle, 0.06)
  .color(fur, 'satin')
  .colorNoise('#c98a4f', 9, 0.3, { sharp: 0.2 })
  .paint(ellipsoid(0.2 * hs, 0.16 * hs, 0.2 * hs).move(0, headY - 0.1 * hs, 0.36 * hs), cream, 0.03)   // white muzzle
  .paint(capsule([0, headY - 0.05 * hs, 0.35 * hs], [0, headY + 0.25 * hs, 0.25 * hs], 0.035 * hs), cream, 0.02) // forehead stripe
  .paint(union(brow(1), brow(-1)), '#b77a45', 0.015)
  .add(nose, 0.02)
  .cut(smile, 0.006)
  .add(tongue, 0.01)
  .add(eye(1, 'eyeR'), 0.012).add(eye(-1, 'eyeL'), 0.012)
  .add(ear(1, 'earR'), 0.04).add(ear(-1, 'earL'), 0.04)
  .bone('head', [0, 0.92, 0.08]);

// ---------- tail: a curled spline, wagging around its root ----------
const tail = tube([
  [0, 0.28, -0.52, 0.075],
  [0, 0.42, -0.66, 0.07],
  [0, 0.62, -0.68, 0.06],
  [0, 0.76, -0.58, 0.05],
  [0, 0.8, -0.48, 0.04],
], { smooth: 6 })
  .color(fur, 'satin')
  .paint(sphere(0.1).move(0, 0.8, -0.48), cream, 0.03)
  .bone('tail', [0, 0.28, -0.5]);

const dog = body
  .add(head, 0.1)
  .add(tail, 0.06)
  .add(collar, 0.012)
  .add(tag, 0.004)
  .bone('body', [0, 0.02, 0]);

// ---------- animation: one 4-second loop ----------
const blink = (t) => Math.max(pulse(t, 0.3, 0.035), pulse(t, 0.78, 0.03), pulse(t, 0.86, 0.03));
animate({ seconds: 4, fps: 30 }, {
  body: (t) => ({ scale: [1 + 0.012 * wave(t, 4), 1 + 0.018 * wave(t, 4), 1 + 0.012 * wave(t, 4)] }),
  head: (t) => ({ rotate: [4 * wave(t, 2, 0.25), 6 * wave(t, 1, 0.1), 11 * wave(t, 1)] }),
  earL: (t) => ({ rotate: [0, 0, -9 * wave(t, 1, -0.08) + 4 * wave(t, 4)] }),
  earR: (t) => ({ rotate: [0, 0, -9 * wave(t, 1, -0.08) - 4 * wave(t, 4)] }),
  eyeL: (t) => ({ scale: [1, 1 - 0.88 * blink(t), 1] }),
  eyeR: (t) => ({ scale: [1, 1 - 0.88 * blink(t), 1] }),
  tongue: (t) => ({ rotate: [8 * wave(t, 8), 0, 0] }),
  tail: (t) => ({ rotate: [0, 38 * wave(t, 8), 6 * wave(t, 8, 0.25)] }),
});

return dog;
