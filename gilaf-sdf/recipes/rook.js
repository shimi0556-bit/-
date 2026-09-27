// Chess rook in marble: lathe profile, battlements from ring(), carved arrow slits, veined stone.
scene({ light: 'studio' });

const merlons = Math.round(param('merlons', 6, 4, 10, 1));
const height = param('height', 1.7, 1.3, 2.2);

// the turned body: [radius, height] from the base to the top rim
const h = height;
const body = lathe([
  [0.52, 0], [0.54, 0.05], [0.5, 0.1], [0.44, 0.14], [0.46, 0.2], [0.38, 0.28],
  [0.3, 0.45], [0.27, h * 0.62], [0.3, h * 0.72], [0.36, h * 0.76], [0.4, h * 0.8],
  [0.4, h * 0.97], [0.38, h],
], { smooth: 4 });

// hollow crown and the gaps between battlements
const crown = cylinder(0.3, 0.4).move(0, h, 0);
const gap = box(1.0, 0.3, 0.14, 0.01).move(0.45, h, 0);
const slit = capsule([0, h * 0.5, 0.3], [0, h * 0.6, 0.3], 0.028);

// a thin ring of decoration under the crown
const collar = torus(0.39, 0.025).move(0, h * 0.8, 0);

return body
  .cut(crown, 0.02)
  .cut(gap.ring(merlons), 0.015)
  .cut(slit.ring(4).rotateY(45), 0.01)
  .add(collar, 0.01)
  .color('#eee9e1', 'glossy')
  .colorNoise('#d6cfc3', 3, 0.6, { sharp: 0.1 })                          // soft cloudy tone
  .colorNoise('#8d877d', 2.2, 0.8, { veins: true, sharp: 0.6, seed: 3 })  // grey veins
  .colorNoise('#a39c90', 5, 0.5, { veins: true, sharp: 0.85, seed: 8 })   // fine veins
  .paint(torus(0.52, 0.06).move(0, 0.05, 0), '#2d2a26', 0.005, 'satin');   // felt pad
