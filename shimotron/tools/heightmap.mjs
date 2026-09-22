// Renders the island's height field to a PNG (top-down, north = up) for track design.
import fs from 'fs';
import zlib from 'zlib';
import { Terrain } from '../src/engine/world/Terrain.js';

const out = process.argv[2] || 'heightmap.png';
const t = new Terrain({}, {});
const N = 550; // 2 m per pixel over 1100 m
const half = t.size / 2;
const px = Buffer.alloc(N * (N * 3 + 1));
for (let j = 0; j < N; j++) {
  px[j * (N * 3 + 1)] = 0;
  for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * (t.size / N);
    const z = -half + (j + 0.5) * (t.size / N);
    const h = t.height(x, z);
    let r, g, b;
    if (h < 0) { const k = Math.max(0, 1 + h / 30); r = 20; g = 60 + 80 * k; b = 120 + 100 * k; }
    else if (h < 2.5) { r = 220; g = 200; b = 150; }
    else { const k = Math.min(1, h / 90); r = 60 + 170 * k; g = 130 + 100 * k; b = 60 + 170 * k; }
    // contour every 10 m
    if (h > 0 && Math.abs((h % 10) - 5) > 4.6) { r *= 0.6; g *= 0.6; b *= 0.6; }
    // 100 m grid
    if (Math.abs(x % 100) < 1.1 || Math.abs(z % 100) < 1.1) { r = r * 0.7 + 60; g = g * 0.7; b = b * 0.7; }
    const o = j * (N * 3 + 1) + 1 + i * 3;
    px[o] = r; px[o + 1] = g; px[o + 2] = b;
  }
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
