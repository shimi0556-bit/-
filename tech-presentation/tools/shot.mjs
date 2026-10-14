// Screenshot helper for QA.  node tools/shot.mjs <file.html|dir-of-svgs> <out.png> [width] [height] [slideIndex]
// - an .html file is screenshotted as-is (optionally after jumping to slide N)
// - a directory is rendered as a contact sheet of every .svg in it
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [, , src, out, w = '1920', h = '1080', slide] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
let url;
if (fs.statSync(src).isDirectory()) {
  const files = fs.readdirSync(src).filter(f => f.endsWith('.svg')).sort();
  const cells = files.map(f => `<figure><img src="${path.resolve(src, f)}"><figcaption>${f}</figcaption></figure>`).join('');
  const html = `<style>body{margin:0;background:#0A1630;color:#9fb3c8;font:14px sans-serif;display:flex;flex-wrap:wrap;gap:14px;padding:14px}
    figure{margin:0;background:#12244A;padding:8px;border-radius:8px}img{display:block;max-width:${Math.floor(+w / 3) - 40}px;max-height:520px}</style>${cells}`;
  const tmp = path.resolve(src, '_sheet.html');
  fs.writeFileSync(tmp, html);
  url = 'file://' + tmp;
} else {
  url = 'file://' + path.resolve(src);
}
await page.goto(url);
await page.waitForTimeout(600);
if (slide !== undefined) {
  await page.evaluate(i => { if (typeof show === 'function') show(+i); }, slide);
  await page.waitForTimeout(1300);
}
await page.screenshot({ path: out, fullPage: fs.statSync(src).isDirectory() });
await browser.close();
if (fs.statSync(src).isDirectory()) fs.rmSync(path.resolve(src, '_sheet.html'));
console.log('saved', out);
