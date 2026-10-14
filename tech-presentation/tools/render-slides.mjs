// QA: screenshot every slide.  node tools/render-slides.mjs <deck.html> <outDir> [onlyIndex(1-based)]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [, , src, outDir, only] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.resolve(src));
await page.waitForTimeout(800);
const n = await page.evaluate(() => document.querySelectorAll('.slide').length);
for (let i = 0; i < n; i++) {
  if (only && +only !== i + 1) continue;
  await page.evaluate(k => show(k), i);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
}
const info = await page.evaluate(() => {
  const v = document.getElementById('atlas');
  return { canH264: v.canPlayType('video/mp4; codecs="avc1.42E01E"'), src: (v.getAttribute('src') || '').slice(0, 20), readyState: v.readyState, duration: v.duration, err: v.error && v.error.code };
});
console.log(JSON.stringify({ slides: n, video: info, errors }, null, 1));
await browser.close();
