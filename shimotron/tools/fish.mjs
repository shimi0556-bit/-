// The real fish that swim by the sea tunnels: "Barramundi Fish" (Khronos glTF Sample Assets,
// Microsoft, CC0). Textures shrunk to 512 px (colour as JPEG), the rest as is.
//   node tools/fish.mjs
// The source is cached in .models/ (not committed); the output is committed, gzipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb';
export const SOURCE = { url: URL, credit: '"Barramundi Fish" by Microsoft (Khronos glTF Sample Assets), CC0 — modified: textures reduced' };

const file = path.join(root, '.models/BarramundiFish.glb');
if (!fs.existsSync(file)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${URL}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
for (const m of doc.getRoot().listMaterials()) {
  // The occlusion/roughness/metal map adds little at the size a fish is seen; keep colour and normals.
  m.setOcclusionTexture(null);
  m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(0.45);
}
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], slots: /^baseColor/, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [256, 256], slots: /^normal/ }),
);
const out = path.join(root, 'src/race/models/fish.glb.gz');
fs.writeFileSync(out, zlib.gzipSync(await io.writeBinary(doc), { level: 9 }));
console.log('fish.glb.gz', fs.statSync(out).size, 'bytes');
for (const n of doc.getRoot().listNodes()) console.log(n.getName(), n.getMesh()?.getName(), n.getTranslation(), n.getScale());
