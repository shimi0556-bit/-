import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { sourceHash } from './tools/srchash.mjs';

// One self-contained HTML file per app: the whole engine (Three.js and
// cannon-es included) inlines into it, so it opens straight from disk.
//   vite build               → dist/index.html      (engine + editor)
//   vite build --mode race   → dist/race.html       (Shimotron Rally)
//   vite build --mode usb    → dist/usb-build/race.html  (Shimotron Rally with
//                              the islands' ground pre-baked in; see npm run usb)
//   vite build --mode rally  → dist/rally.html      (ראלי האיים: five rally stages,
//                              with the recorded sound effects from assets/sfx)
const GROUND_FILE = path.resolve('.ground/ground.json');

/** `virtual:shimotron-ground`: the pre-baked ground in the usb build, null otherwise. */
function groundData(mode) {
  const id = 'virtual:shimotron-ground';
  return {
    name: 'shimotron-ground',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      if (mode !== 'usb') return 'export default null;';
      if (!fs.existsSync(GROUND_FILE)) throw new Error('No pre-baked ground: run "npm run usb" (it bakes, then builds).');
      const json = fs.readFileSync(GROUND_FILE, 'utf8');
      if (JSON.parse(json).source !== sourceHash(path.resolve('.'))) throw new Error('The pre-baked ground is older than the sources: run "npm run usb" again.');
      return `export default ${json};`;
    },
  };
}

/**
 * `virtual:shimotron-sounds`: the recorded effects (assets/sfx/<name>_<n>.mp3,
 * made by tools/process_sfx.py) as { name: [data: URI, …] } in the rally
 * build, an empty map otherwise (the archipelago stays fully procedural).
 */
function sounds(mode) {
  const id = 'virtual:shimotron-sounds';
  const dir = path.resolve('assets/sfx');
  return {
    name: 'shimotron-sounds',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const map = {};
      if (mode === 'rally' && fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).sort()) {
          const m = f.match(/^(.+)_\d+\.mp3$/);
          if (!m) continue;
          (map[m[1]] = map[m[1]] || []).push('data:audio/mpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'));
        }
      }
      return `export default ${JSON.stringify(map)};`;
    },
  };
}

const INPUT = { race: 'race.html', usb: 'race.html', rally: 'rally.html' };

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [groundData(mode), sounds(mode), viteSingleFile()],
  define: { __SHIMOTRON_EDITION__: JSON.stringify(mode === 'rally' ? 'rally' : 'world') },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    outDir: mode === 'usb' ? 'dist/usb-build' : 'dist',
    emptyOutDir: mode !== 'race' && mode !== 'rally',
    rollupOptions: { input: INPUT[mode] || 'index.html' },
  },
}));
