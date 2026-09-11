import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build is host-agnostic: works at the domain root (dev),
// in a GitHub Pages project subpath (hoodini.github.io/<repo>/), and on any
// static host — without hardcoding the repo name. Runtime asset paths go through
// src/lib/asset.ts so they respect import.meta.env.BASE_URL too.
// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
});
