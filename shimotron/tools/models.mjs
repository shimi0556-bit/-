// Real 3D models for the game: downloads each source model (openly licensed,
// see MODELS below), strips what the game never shows and every trademark
// logo, slims the meshes and textures, and writes two levels of detail into
// src/race/models/ (close up and far away), compressed for the web.
//   node tools/models.mjs
// Sources are cached in .models/ (not committed); the outputs are committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.models');
const OUT = path.join(root, 'src/race/models');

export const MODELS = {
  concept: {
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb',
    credit: '"Car Concept" by Eric Chadwick (Khronos glTF Sample Assets), CC BY 4.0 — modified: logos removed, simplified',
    // Parts nobody sees from outside or in a race, and the densest small details.
    drop: /^(InteriorFloormats|InteriorPedal.*|Engine|License Plate|BodyHoodInterior0[12]|BodyHoodUnder|BodyWindshieldWipers|InteriorSteeringEmblem|Wheel.*BrakePad|InteriorDoor[LR]0[3-6])$/,
    wheels: ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'],
    lods: [
      { name: 'concept', ratio: 0.55, error: 0.0006, texture: 1024 },
      { name: 'concept-lo', ratio: 0.07, error: 0.012, texture: 256 },
    ],
  },
};

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** A tiny solid-colour PNG (to paint over a logo). */
const solid = (r, g, b) => sharp({ create: { width: 4, height: 4, channels: 3, background: { r, g, b } } }).png().toBuffer();

async function source(id, url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${id}.glb`);
  if (!fs.existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

async function build(id, M, L) {
  const doc = await io.read(await source(id, M.url));
  const rootP = doc.getRoot();
  // Paint options are material variants: keep the default paint only.
  for (const ext of rootP.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose();
  for (const n of rootP.listNodes()) if (M.drop.test(n.getName())) n.dispose();

  // Logos (Khronos, 3D Commerce) are trademarks, not part of the licence: paint them out.
  for (const mat of rootP.listMaterials()) {
    const name = mat.getName();
    if (name === 'Tireside') {
      if (mat.getBaseColorTexture()) mat.getBaseColorTexture().setImage(await solid(30, 30, 30)).setMimeType('image/png');
      if (mat.getNormalTexture()) mat.getNormalTexture().setImage(await solid(128, 128, 255)).setMimeType('image/png');
    }
    if (name === 'License') {
      for (const t of [mat.getBaseColorTexture(), mat.getEmissiveTexture()]) if (t) t.setImage(await solid(0, 0, 0)).setMimeType('image/png');
    }
  }

  // Wheels: undo the pose they were modelled in (spin and steer), name their parts, keep them apart.
  const wheelOf = new Map();
  for (const w of M.wheels) {
    const node = rootP.listNodes().find((n) => n.getName() === w);
    if (!node) throw new Error(`no wheel ${w}`);
    node.setRotation([0, 0, 0, 1]);
    node.listChildren().forEach((c, k) => {
      if (!c.getName()) c.setName(`${w}Tire${k}`);
      wheelOf.set(c, w);
      if (c.getMesh()) c.getMesh().setName(c.getName());
    });
  }
  await doc.transform(flatten());
  // The body joins into one mesh per material; wheel parts keep their names so they can turn.
  for (const n of rootP.listNodes()) {
    if (wheelOf.has(n)) continue;
    n.setName('');
    if (n.getMesh()) n.getMesh().setName('');
  }
  await doc.transform(
    join({ keepNamed: true }),
    weld(),
    // Borders stay put: the body is many separate panels, and a moved edge opens a crack between them.
    simplify({ simplifier: MeshoptSimplifier, ratio: L.ratio, error: L.error, lockBorder: true }),
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [L.texture, L.texture], quality: 88 }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${L.name}.glb`);
  await io.write(file, doc);
  console.log(`${L.name}.glb`.padEnd(20), `${tris(doc)} triangles`, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`, `${rootP.listMaterials().length} materials`);
}

for (const [id, M] of Object.entries(MODELS)) {
  for (const L of M.lods) await build(id, M, L);
}
fs.writeFileSync(
  path.join(OUT, 'CREDITS.md'),
  `# Models\n\n${Object.entries(MODELS).map(([id, M]) => `- **${id}**: ${M.credit}. Source: ${M.url}`).join('\n')}\n\nLicence texts: https://creativecommons.org/licenses/by/4.0/\n`,
);
