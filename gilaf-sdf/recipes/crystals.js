// Crystal geode: ridged-noise rock, a scattered cluster of hexagonal crystals, emissive cores.
scene({ light: 'night' });

const count = Math.round(param('crystals', 9, 3, 16, 1));
const glow = param('glow', 0.35, 0, 2);

const rock = ellipsoid(1.0, 0.45, 0.85).move(0, 0.2, 0)
  .cut(ellipsoid(0.7, 0.4, 0.55).move(0, 0.62, 0.05), 0.12)       // the bowl the crystals grow from
  .displace(0.06, 2.5, { octaves: 5, ridged: true, seed: 4 })
  .color('#4a4550', 'matte')
  .colorNoise('#6f6878', 5, 0.8, { sharp: 0.3 })
  .intersect(halfspace('y', 0.55), 0.04);

// one hexagonal crystal: prism with a pointed cap, standing on its base at the origin
const crystal = (len, r) => ngon(6, r).extrude(len, r * 0.08).rotateX(-90).move(0, len / 2, 0)
  .add(cone(r * 0.96, 0.001, r * 1.6).move(0, len + r * 0.8, 0), 0.01);

const rnd = rand(7);
const parts = range(count).map((i) => {
  const a = (i / count) * TAU + rnd.range(-0.3, 0.3);
  const d = i === 0 ? 0 : rnd.range(0.12, 0.42);
  const len = i === 0 ? 0.95 : rnd.range(0.35, 0.7);
  const r = i === 0 ? 0.13 : rnd.range(0.06, 0.1);
  const tiltOut = i === 0 ? 0 : 18 + d * 40;
  return crystal(len, r)
    .rotate(0, 0, -tiltOut)                // lean outward...
    .rotateY((-a * 180) / PI)              // ...in the direction of its position
    .move(Math.cos(a) * d, 0.28, Math.sin(a) * d);
});
const cluster = union(...parts)
  .color('#8e5cf0', { rough: 0.08, metal: 0, glow })
  .gradient('#e2ccff', 'y', 0.5, 1.6);

return rock.add(cluster, 0.03);
