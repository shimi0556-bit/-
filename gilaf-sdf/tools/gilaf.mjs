#!/usr/bin/env node
// Command-line access to the studio through headless Chromium, so Claude Code (or you)
// can render and export recipes without opening a browser.
//
//   node tools/gilaf.mjs render  recipes/robot.js [--out shots/robot.png] [--size 1200] [--clay] [--light sunset]
//   node tools/gilaf.mjs still   recipes/robot.js [--out robot.png] [--yaw 30 --pitch 15 --zoom 1 --width 1200 --height 900]
//   node tools/gilaf.mjs export  recipes/robot.js [--out models/robot.glb] [--res 256] [--tris 100000] [--mm 80]
//   node tools/gilaf.mjs check   recipes/robot.js
//   --param name=value (repeatable) sets slider values.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return createRequire(join(g, 'noop.js'))('playwright');
  }
}

function parseArgs(argv) {
  const [cmd, file, ...rest] = argv;
  const o = { cmd, file, params: {} };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const next = rest[i + 1];
    if (k === 'clay' || k === 'no-wire') o[k] = true;
    else if (k === 'param') {
      const [n, v] = next.split('=');
      o.params[n] = +v;
      i++;
    } else {
      o[k] = next;
      i++;
    }
  }
  return o;
}

const USAGE = `usage: node tools/gilaf.mjs <render|still|export|check> <recipe.js> [options]
  render   2x2 contact sheet (3/4, front, side, back)      --out --size --clay --light --frames
  still    one view                                          --out --yaw --pitch --zoom --width --height --clay --light
  export   mesh files (.glb .stl .obj by --out extension)    --out --res --tris --mm --formats glb,stl
  check    compile only and print stats`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.cmd || !o.file || !['render', 'still', 'export', 'check'].includes(o.cmd)) {
    console.log(USAGE);
    process.exit(o.cmd ? 1 : 0);
  }
  const code = readFileSync(resolve(o.file), 'utf8');
  build();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(join(ROOT, 'dist/gilaf.html')).href);
    await page.waitForFunction(() => window.gilaf && window.gilaf.ready, null, { timeout: 60000 });
    const info = await page.evaluate(([c, p]) => window.gilaf.load(c, p), [code, o.params]);
    const name = basename(o.file, extname(o.file));
    const b = info.bounds;
    const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
    console.log(`ok: ${info.nodes} nodes, ${info.lines} GLSL lines, size ${size.join(' x ')}, step ${info.step.toFixed(2)}${info.params.length ? ', params: ' + info.params.map((q) => `${q.name}=${o.params[q.name] ?? q.def}`).join(' ') : ''}`);
    if (o.cmd === 'check') return;

    if (o.cmd === 'render' || o.cmd === 'still') {
      const t0 = Date.now();
      const url =
        o.cmd === 'render'
          ? await page.evaluate((a) => window.gilaf.sheet(a), { size: +(o.size || 1200), clay: !!o.clay, light: o.light, frames: +(o.frames || 5) })
          : await page.evaluate((a) => window.gilaf.still(a), {
              width: +(o.width || 1200),
              height: +(o.height || 900),
              yaw: +(o.yaw ?? 32),
              pitch: +(o.pitch ?? 16),
              zoom: +(o.zoom ?? 1),
              clay: !!o.clay,
              light: o.light,
            });
      const out = o.out || join('shots', `${name}${o.clay ? '-clay' : ''}${o.cmd === 'still' ? '-still' : ''}.png`);
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
      console.log(`wrote ${out} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }

    if (o.cmd === 'export') {
      const out = o.out || join('models', `${name}.glb`);
      const ext = extname(out).slice(1).toLowerCase();
      const formats = (o.formats || ext || 'glb').split(',');
      const r = await page.evaluate((a) => window.gilaf.export(a), { res: +(o.res || 256), tris: +(o.tris || 0), formats, mm: +(o.mm || 80) });
      mkdirSync(dirname(resolve(out)), { recursive: true });
      for (const f of r.files) {
        const fext = extname(f.name);
        const target = formats.length === 1 ? out : join(dirname(out), basename(out, extname(out)) + fext);
        writeFileSync(target, Buffer.from(f.b64, 'base64'));
        console.log(`wrote ${target} (${(Buffer.byteLength(f.b64, 'base64') / 1024).toFixed(0)} KB)`);
      }
      const s = r.stats;
      console.log(`mesh: ${s.triangles} triangles (raw ${s.raw}), ${s.vertices} vertices, grid ${s.grid.join('x')}, ${(s.ms / 1000).toFixed(1)}s, volume ${s.volume.toFixed(4)}`);
      if (o.preview) {
        const url = await page.evaluate(() => window.gilaf.meshView({}));
        writeFileSync(o.preview, Buffer.from(url.split(',')[1], 'base64'));
        console.log(`wrote ${o.preview}`);
      }
    }
  } finally {
    if (errors.length) console.error('page errors:\n' + errors.join('\n'));
    await browser.close();
  }
}

main().catch((e) => {
  console.error(String(e?.message || e).split('\n').slice(0, 12).join('\n'));
  process.exit(1);
});
