// The monster truck's body: Kenney's "vehicle-truck" (Starter Kit Racing, CC0) — its cab and bed
// only; the game builds the chassis, giant tyres and coil-over springs round it (MonsterTruck.js).
//   node tools/monster.mjs
// The source is cached in .models/ (not committed); the output is committed, gzipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.models');
const BASE = 'https://raw.githubusercontent.com/KenneyNL/Starter-Kit-Racing/main/models/';
export const SOURCE = { url: BASE + 'vehicle-truck-yellow.glb', credit: '"vehicle-truck" by Kenney (Starter Kit Racing, kenney.nl), CC0 — modified: wheels and underside removed' };

async function get(rel) {
  const file = path.join(CACHE, rel);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const res = await fetch(BASE + rel);
    if (!res.ok) throw new Error(`download failed ${res.status}: ${BASE + rel}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

const file = await get('vehicle-truck-yellow.glb');
await get('Textures/colormap.png');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
for (const n of doc.getRoot().listNodes()) if (n.getName() !== 'body') n.dispose();
await doc.transform(prune(), dedup());
// Texture inline (the source points at a separate PNG).
for (const t of doc.getRoot().listTextures()) t.setURI('');
const out = path.join(root, 'src/race/models/monster-body.glb.gz');
fs.writeFileSync(out, zlib.gzipSync(await io.writeBinary(doc), { level: 9 }));
console.log('monster-body.glb.gz', fs.statSync(out).size, 'bytes');
