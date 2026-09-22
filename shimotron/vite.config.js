import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file per app: the whole engine (Three.js and
// cannon-es included) inlines into it, so it opens straight from disk.
//   vite build               → dist/index.html  (engine + editor)
//   vite build --mode race   → dist/race.html   (Shimotron Rally)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    emptyOutDir: mode !== 'race',
    rollupOptions: { input: mode === 'race' ? 'race.html' : 'index.html' },
  },
}));
