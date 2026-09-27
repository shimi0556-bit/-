// Bakes every island's ground (height grid + splat map) for the offline build:
// opens dist/race.html in headless Chromium, lets the game build its islands,
// then samples each island's final terrain (circuit, roads, city, trail all
// carved in) and writes .ground/ground.json for `vite build --mode usb`.
//   npm run usb   (builds, runs this, builds the usb bundle, packs)
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium);
// CHROME_PATH picks a specific Chromium binary.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceHash } from './srchash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEGMENTS = 520; // the offline build draws every island at this resolution, whatever the quality level
const page = path.join(root, 'dist', 'race.html');
if (!fs.existsSync(page)) {
  console.error('dist/race.html is missing: run "npm run build:race" first');
  process.exit(1);
}

let playwright;
try {
  playwright = await import('playwright');
} catch {
  const global = execSync('npm root -g').toString().trim();
  playwright = createRequire(path.join(global, 'noop.js'))('playwright');
}
const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'],
});
const tab = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
tab.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await tab.goto(pathToFileURL(page).href + '#low');
try {
  await tab.waitForFunction(() => window.shimotron?.game?.state === 'menu' && window.shimotron.game.islands?.size >= 7, null, { timeout: 900000 });
} catch (e) {
  console.error('the game did not finish loading', errors.join('\n'));
  await browser.close();
  process.exit(1);
}
await tab.evaluate(() => window.shimotron.engine.stop());
console.log(`islands built in ${((Date.now() - t0) / 1000).toFixed(1)} s, baking at ${SEGMENTS}…`);

const islands = await tab.evaluate((B) => {
  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const out = {};
  for (const [id, isl] of window.shimotron.game.islands) {
    const t = isl.terrain;
    const bw = B + 1;
    const half = t.size / 2;
    const step = t.size / B;
    const grid = new Float32Array(bw * bw);
    let min = Infinity;
    let max = -Infinity;
    for (let iz = 0; iz < bw; iz++) {
      for (let ix = 0; ix < bw; ix++) {
        const h = t.height(-half + ix * step, -half + iz * step);
        grid[iz * bw + ix] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    // 16-bit steps, gradient-predicted (left + up - up-left), low and high bytes in separate planes.
    const N = bw * bw;
    const q = new Uint16Array(N);
    for (let i = 0; i < N; i++) q[i] = Math.round(((grid[i] - min) / (max - min)) * 65535);
    const planes = new Uint8Array(N * 2);
    for (let r = 0; r < bw; r++) {
      for (let c = 0; c < bw; c++) {
        const i = r * bw + c;
        const pred = r === 0 ? (c === 0 ? 0 : q[i - 1]) : c === 0 ? q[i - bw] : q[i - 1] + q[i - bw] - q[i - bw - 1];
        const res = (q[i] - pred) & 0xffff;
        planes[i] = res & 0xff;
        planes[N + i] = res >> 8;
      }
    }
    // The splat map, from the same grid the game will use.
    const seg0 = t.segments;
    const h0 = t.heights;
    t.segments = B;
    t.heights = new Float32Array(N);
    for (let i = 0; i < N; i++) t.heights[i] = min + q[i] * ((max - min) / 65535);
    const S = 512;
    const pre = { size: S, data: new Uint8Array(S * S * 4), hdata: new Float32Array(S * S) };
    const v3 = t.mesh.position.clone();
    for (let v = 0; v < S; v++) t._splatRow(v, pre, v3);
    t.segments = seg0;
    t.heights = h0;
    const d = pre.data;
    const sd = new Uint8Array(d.length);
    for (let r = 0; r < S; r++) {
      for (let ch = 0; ch < 4; ch++) {
        let prev = 0;
        for (let c = 0; c < S; c++) {
          const i = (r * S + c) * 4 + ch;
          sd[i] = (d[i] - prev) & 0xff;
          prev = d[i];
        }
      }
    }
    out[id] = { key: isl.groundKey, size: t.size, min, max, splatSize: S, heights: b64(planes), splat: b64(sd) };
  }
  return out;
}, SEGMENTS);
await browser.close();
if (errors.length) console.warn('page errors:\n' + errors.join('\n'));

const pack = (s) => zlib.deflateRawSync(Buffer.from(s, 'base64'), { level: 9 }).toString('base64');
let total = 0;
for (const [id, g] of Object.entries(islands)) {
  g.heights = pack(g.heights);
  g.splat = pack(g.splat);
  const kb = Math.round((g.heights.length + g.splat.length) / 1024);
  total += kb;
  console.log(`  ${id.padEnd(7)} ${g.key.padEnd(24)} ${kb} KB`);
}
fs.mkdirSync(path.join(root, '.ground'), { recursive: true });
fs.writeFileSync(path.join(root, '.ground', 'ground.json'), JSON.stringify({ source: sourceHash(root), segments: SEGMENTS, islands }));
console.log(`.ground/ground.json: ${total} KB`);
