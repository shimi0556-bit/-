#!/usr/bin/env node
// Bundles the studio into one self-contained HTML file (no server needed).
//   dist/gilaf.html          full document, open it directly in a browser
//   dist/gilaf.fragment.html page content only (for hosts that add their own <html> skeleton)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// dependency order
const MODULES = ['vendor/meshopt_simplifier.js', 'src/dsl.js', 'src/glsl.js', 'src/renderer.js', 'src/mesher.js', 'src/export.js', 'src/ai.js', 'src/app.js'];

const key = (p) => basename(p, '.js');

function wrap(path) {
  let src = read(path);
  const exports = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, names, from) => `const {${names}} = __mod[${JSON.stringify(key(from))}];`);
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => {
    exports.push(...names.split(',').map((s) => s.trim()).filter(Boolean));
    return '';
  });
  src = src.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exports.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${path}: unsupported import/export form left after bundling`);
  return `__mod[${JSON.stringify(key(path))}] = (() => {\n${src}\nreturn { ${exports.join(', ')} };\n})();\n`;
}

export function build() {
  const manifest = JSON.parse(read('recipes/index.json'));
  const recipes = manifest.map((r) => ({ id: r.id, name: r.name, code: read(join('recipes', r.file)).trim() + '\n' }));
  const reference = read('docs/recipe-reference.md');
  const script = [
    '"use strict";',
    `const BUILTIN_RECIPES = ${JSON.stringify(recipes)};`,
    `const RECIPE_REFERENCE = ${JSON.stringify(reference)};`,
    'const __mod = {};',
    ...MODULES.map(wrap),
  ].join('\n');
  const safe = script.replace(/<\/script/gi, '<\\/script');
  const fragment = read('src/app.html').replace('/*__SCRIPT__*/', () => safe);
  const full = `<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${fragment}\n</body>\n</html>\n`;
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/gilaf.html'), full);
  writeFileSync(join(ROOT, 'dist/gilaf.fragment.html'), fragment);
  return { bytes: full.length, recipes: recipes.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = build();
  console.log(`built dist/gilaf.html (${(r.bytes / 1024).toFixed(0)} KB, ${r.recipes} recipes)`);
}
