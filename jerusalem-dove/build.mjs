// Bundles src/ into a single self-contained index.html (three.js inlined, works offline).
// Usage: npm install && node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
});
let js = out.outputFiles[0].text;
let pre = '';
// Optional: embed a custom dove model and music so the single file stays portable.
if (existsSync('assets/dove.glb')) pre += `window.__DOVE_GLB__='data:model/gltf-binary;base64,${readFileSync('assets/dove.glb').toString('base64')}';`;
if (existsSync('assets/music.mp3')) pre += `window.__MUSIC_DATA__='data:audio/mpeg;base64,${readFileSync('assets/music.mp3').toString('base64')}';`;
const html = readFileSync('src/index.html', 'utf8').replace('<!--GAME_SCRIPT-->', () => `<script>${pre}${js.replace(/<\/script/g, '<\\/script')}</script>`);
writeFileSync('index.html', html);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB`);
