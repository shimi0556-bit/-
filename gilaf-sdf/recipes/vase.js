// Glazed amphora: lathe outline, hollow wall opened at the top, spline handles, painted bands.
scene({ light: 'daylight' });

const belly = param('belly', 0.5, 0.36, 0.62);
const neck = param('neck', 0.2, 0.14, 0.3);

// outline from the foot to the lip: [radius, height]
const outline = [
  [0.24, 0], [0.3, 0.05], [belly * 0.86, 0.28], [belly, 0.55],
  [belly * 0.9, 0.8], [neck + 0.04, 1.08], [neck, 1.24], [neck + 0.07, 1.38], [neck + 0.08, 1.42],
];
const top = 1.42;

let body = lathe(outline, { smooth: 5 })
  .shell(0.05)                          // hollow wall
  .cut(halfspace('-y', top - 0.03))     // open the lip
  .color('#1d5f73', 'glossy');

// shallow flutes around the belly (the wall is thicker than their depth)
const flute = capsule([belly + 0.018, 0.36, 0], [belly + 0.018, 0.72, 0], 0.035);
body = body.cut(flute.ring(20), 0.015);

// two handles from neck to shoulder, modelled once and mirrored
const handle = tube([
  [neck + 0.02, 1.2, 0, 0.045],
  [neck + 0.2, 1.24, 0, 0.042],
  [belly * 0.95 + 0.1, 1.02, 0, 0.04],
  [belly * 0.93, 0.84, 0, 0.045],
], { smooth: 6 }).color('#1d5f73', 'glossy');

return body.add(handle.mirror('x'), 0.035)
  .gradient('#d8b58a', 'y', 0.3, 0.02)                               // raw clay foot
  .paint(torus(belly * 0.98, 0.035).move(0, 0.55, 0).scale(1.02), '#e8d9b8', 0.006)   // cream band
  .paint(box(3, 0.05, 3).move(0, 1.02, 0), '#e8d9b8', 0.006)
  .colorNoise('#2e8c8c', 9, 0.4, { sharp: 0.2 })
  .paint(lathe(outline, { smooth: 5 }).round(-0.012), '#0b2530', 0.004);   // darker glaze inside (painted last so nothing covers it)
