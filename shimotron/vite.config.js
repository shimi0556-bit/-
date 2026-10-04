import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { sourceHash } from './tools/srchash.mjs';

// One self-contained HTML file per app: the whole engine (Three.js and
// cannon-es included) inlines into it, so it opens straight from disk.
//   vite build               → dist/index.html      (engine + editor)
//   vite build --mode race   → dist/race.html       (Shimotron Rally, with the
//                              islands' ground pre-baked in when .ground/ is fresh)
//   vite build --mode usb    → dist/usb-build/race.html  (the same, but the
//                              pre-baked ground is required; see npm run usb)
const GROUND_FILE = path.resolve('.ground/ground.json');

/** `virtual:shimotron-ground`: the pre-baked ground in the race and usb builds, null otherwise. */
function groundData(mode) {
  const id = 'virtual:shimotron-ground';
  return {
    name: 'shimotron-ground',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      if (mode !== 'usb' && mode !== 'race') return 'export default null;';
      // The usb build insists on it; the race build takes it when it is fresh, else ships without (and builds it live).
      const json = fs.existsSync(GROUND_FILE) ? fs.readFileSync(GROUND_FILE, 'utf8') : null;
      if (!json || JSON.parse(json).source !== sourceHash(path.resolve('.'))) {
        if (mode === 'usb') throw new Error('No pre-baked ground for these sources: run "npm run usb" (it bakes, then builds).');
        this.warn('no fresh pre-baked ground: dist/race.html will build its ground live (run "npm run build" to bake it in)');
        return 'export default null;';
      }
      return `export default ${json};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [groundData(mode), viteSingleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    outDir: mode === 'usb' ? 'dist/usb-build' : 'dist',
    emptyOutDir: mode !== 'race',
    rollupOptions: { input: mode === 'race' || mode === 'usb' ? 'race.html' : 'index.html' },
  },
}));
