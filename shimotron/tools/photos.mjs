// Photographed ground, rock, road and bark materials (Poly Haven, CC0) for PhotoTextures.js:
// the 1k colour map recompressed, the normal map at 512. Source: the folder the download thread
// filled (see its README and each CREDIT.txt).
//   node tools/photos.mjs [/mnt/project-files/shimotron/textures-src]
import fs from 'fs';
import sharp from 'sharp';

const SRC = process.argv[2] || '/mnt/project-files/shimotron/textures-src';
const OUT = new URL('../src/race/textures/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const SLOTS = { grass: 'leafy_grass', rock: 'rock_face', sand: 'coast_sand_01', dirt: 'gravel_road', asphalt: 'asphalt_02', bark: 'bark_willow_02' };
// The only grass photo on hand (leafy_grass) is late-summer straw with fallen leaves: its detail is kept
// but its colour is moved to the game's green (the biome tints were tuned on that), keeping a third of
// each pixel's own tint. Gravel road is a little red for the verges, so it is toned down.
const RECOLOUR = { grass: { to: [0.15, 0.235, 0.06], keep: 0.35 }, dirt: { to: [0.16, 0.11, 0.066], keep: 0.6 } };
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
async function colour(slot, file) {
  const R = RECOLOUR[slot];
  const img = sharp(file).resize(1024, 1024).removeAlpha();
  if (!R) return img;
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const px = new Float32Array(n * 3);
  const mean = [0, 0, 0];
  for (let i = 0; i < n * 3; i++) {
    px[i] = lin(data[i] / 255);
    mean[i % 3] += px[i] / n;
  }
  const Y = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mY = Y(...mean);
  const to = R.to || mean;
  for (let i = 0; i < n; i++) {
    const c = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
    const y = Y(...c) || 1e-4;
    for (let k = 0; k < 3; k++) {
      // Its brightness relative to the photo's, in the target colour; plus some of its own tint.
      const own = c[k] / y / (mean[k] / mY);
      data[i * 3 + k] = enc(to[k] * (y / mY) * (1 + R.keep * (own - 1)));
    }
  }
  return sharp(data, { raw: info });
}
let total = 0;
for (const [slot, id] of Object.entries(SLOTS)) {
  const diff = await (await colour(slot, `${SRC}/${slot}/${id}_diff_1k.jpg`)).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
  const nor = await sharp(`${SRC}/${slot}/${id}_nor_gl_1k.jpg`).resize(512, 512).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  fs.writeFileSync(new URL(`${slot}.jpg`, OUT), diff);
  fs.writeFileSync(new URL(`${slot}-n.jpg`, OUT), nor);
  total += diff.length + nor.length;
  console.log(slot.padEnd(8), id, `${(diff.length / 1024).toFixed(0)} KB + ${(nor.length / 1024).toFixed(0)} KB`);
}
console.log('total', (total / 1024).toFixed(0), 'KB');
