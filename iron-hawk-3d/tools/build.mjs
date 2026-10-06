// Builds the whole game into ONE self-contained index.html (works offline, from a file,
// or from any static host): bundles the code with esbuild and inlines the CSS, the Hebrew
// fonts, the images (assets/img) and the sound effects (assets/sfx) as data URLs.
//
//   npm run build            -> iron-hawk-3d/index.html
//   node tools/build.mjs --dev   (no minification, easier to debug)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const rel = (...p) => path.join(ROOT, ...p);
const dataURL = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' };

// ---- fonts: Rubik for text, Karantina for the big display titles (Hebrew + Latin subsets)
function fontFaces() {
  const want = [
    ['rubik', ['hebrew', 'latin'], [400, 500, 600, 700, 800]],
    ['karantina', ['hebrew', 'latin'], [400]],
  ];
  let css = '';
  for (const [family, subsets, weights] of want) {
    for (const subset of subsets) {
      for (const w of weights) {
        const cssFile = rel('node_modules', '@fontsource', family, `${w}.css`);
        const font = rel('node_modules', '@fontsource', family, 'files', `${family}-${subset}-${w}-normal.woff2`);
        if (!fs.existsSync(cssFile) || !fs.existsSync(font)) { console.warn('missing font', family, subset, w); continue; }
        // the per-weight stylesheet lists every subset with its unicode-range
        const block = fs.readFileSync(cssFile, 'utf8').split(`/* ${family}-${subset}-${w}-normal */`)[1] || '';
        const range = (block.split('}')[0].match(/unicode-range:[^;]+;/) || [''])[0];
        const name = family === 'rubik' ? 'Rubik' : 'Karantina';
        css += `@font-face{font-family:'${name}';font-style:normal;font-display:swap;font-weight:${w};src:url(${dataURL(font, 'font/woff2')}) format('woff2');${range}}\n`;
      }
    }
  }
  return css;
}

// ---- images (Gemini art after tools/process_images.py) and sounds (ElevenLabs after tools/process_sfx.py)
function assets() {
  const images = {};
  const imgDir = rel('assets', 'img');
  if (fs.existsSync(imgDir)) {
    for (const f of fs.readdirSync(imgDir).sort()) {
      const ext = path.extname(f).toLowerCase();
      if (MIME[ext] && MIME[ext].startsWith('image')) images[path.basename(f, ext)] = dataURL(path.join(imgDir, f), MIME[ext]);
    }
  }
  const sounds = {};
  const sfxDir = rel('assets', 'sfx');
  if (fs.existsSync(sfxDir)) {
    for (const f of fs.readdirSync(sfxDir).sort()) {
      if (!f.endsWith('.mp3')) continue;
      const key = f.replace(/_\d+\.mp3$/, '');
      (sounds[key] ||= []).push(dataURL(path.join(sfxDir, f), 'audio/mpeg'));
    }
  }
  return { images, sounds };
}

async function main() {
  const t0 = Date.now();
  const out = await build({
    entryPoints: [rel('src', 'main.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    minify: !dev,
    legalComments: 'none',
    write: false,
    sourcemap: false,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fontFaces() + fs.readFileSync(rel('src', 'styles.css'), 'utf8');
  const { images, sounds } = assets();
  const assetJS = `window.__ASSETS=${JSON.stringify(images)};window.__SOUNDS=${JSON.stringify(sounds)};`;
  let html = fs.readFileSync(rel('src', 'index.html'), 'utf8');
  // function replacers so "$" sequences inside the code are left alone
  html = html.replace('/*__CSS__*/', () => css).replace('/*__ASSETS__*/', () => assetJS).replace('/*__JS__*/', () => js);
  const dest = rel('index.html');
  fs.writeFileSync(dest, html);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`built ${path.relative(process.cwd(), dest)}: ${kb(html.length)} (code ${kb(js.length)}, css+fonts ${kb(css.length)}, images ${Object.keys(images).length}, sounds ${Object.values(sounds).flat().length}) in ${Date.now() - t0} ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
