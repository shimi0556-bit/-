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
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

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
    // The wheels were modelled turned and spun: undo it.
    resetWheels: true,
    lods: [
      { name: 'concept', ratio: 0.55, error: 0.0006, texture: 1024 },
      { name: 'concept-lo', ratio: 0.07, error: 0.012, texture: 256 },
    ],
  },
  hyper: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb',
    credit: '"Ferrari 458 Italia" by vicent091036 (via the three.js examples), CC BY 4.0 — modified: badges removed, simplified',
    // Badges (the yellow shields on the body, hubs and steering wheel) are trademarks; the carpet is never seen.
    drop: /^(centre|steering_centre|yellow_trim|blue|carpet)$/,
    // Source wheel → the names the game turns (its left lands on +x once the car faces +z, as in the game).
    wheels: { wheel_fl: 'WheelFrontL', wheel_fr: 'WheelFrontR', wheel_rl: 'WheelRearL', wheel_rr: 'WheelRearR' },
    tire: /^tire$/,
    // It faces -z; the game drives towards +z.
    yaw: Math.PI,
    // Split at every hard edge and double-sided, untextured: see remesh().
    remesh: true,
    // The materials the game recolours and lights, named as in the concept car.
    materials: { Body_Color: 'Paint 1 Carmine', Taillight_Glass: 'Brakelight', Projector_Glass: 'Headlight', Glass_Gray: 'Glass', Turn_Signal_LED: 'Signallight' },
    lods: [
      { name: 'hyper', ratio: 0.2, error: 0.0008, texture: 1024 },
      { name: 'hyper-lo', ratio: 0.02, error: 0.03, texture: 256 },
    ],
  },
};

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'draco3d.decoder': await draco3d.createDecoderModule() });

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

/**
 * For sources whose surfaces are split at every hard edge and modelled
 * double-sided (each face twice, back to back): the simplifier sees no surface
 * it may collapse. Rejoins every primitive by position alone, keeps one face of
 * each pair (the material turns double-sided instead), simplifies, then rebuilds
 * the normals smooth up to a crease. Only for untextured models (UVs are dropped).
 */
function remesh(doc, ratio, error) {
  for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const P = prim.getAttribute('POSITION');
    const src = P.getArray();
    const ids = prim.getIndices() ? prim.getIndices().getArray() : Uint32Array.from({ length: P.getCount() }, (_, i) => i);
    const at = new Map();
    const pos = [];
    const map = new Uint32Array(P.getCount());
    for (let i = 0; i < P.getCount(); i++) {
      const k = `${Math.round(src[i * 3] * 2e4)},${Math.round(src[i * 3 + 1] * 2e4)},${Math.round(src[i * 3 + 2] * 2e4)}`;
      let j = at.get(k);
      if (j === undefined) {
        j = pos.length / 3;
        at.set(k, j);
        pos.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
      }
      map[i] = j;
    }
    const seen = new Set();
    const idx = [];
    for (let t = 0; t < ids.length; t += 3) {
      const a = map[ids[t]], b = map[ids[t + 1]], c = map[ids[t + 2]];
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      idx.push(a, b, c);
    }
    const positions = new Float32Array(pos);
    let index = new Uint32Array(idx);
    const target = Math.max(3, Math.floor((index.length / 3) * ratio) * 3);
    if (index.length > 300) [index] = MeshoptSimplifier.simplify(index, positions, 3, target, error);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const out = toCreasedNormals(g, THREE.MathUtils.degToRad(50));
    for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
    prim.setIndices(null);
    P.setArray(out.attributes.position.array);
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out.attributes.normal.array).setBuffer(P.getBuffer()));
    prim.getMaterial()?.setDoubleSided(true);
  }
}

const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

async function build(id, M, L) {
  const doc = await io.read(await source(id, M.url));
  const rootP = doc.getRoot();
  // Paint options are material variants: keep the default paint only.
  // Draco only packs the download; the output is packed with meshopt instead.
  for (const ext of rootP.listExtensionsUsed()) if (['KHR_materials_variants', 'KHR_draco_mesh_compression'].includes(ext.extensionName)) ext.dispose();
  for (const n of rootP.listNodes()) if (M.drop.test(n.getName())) n.dispose();
  for (const mat of rootP.listMaterials()) if (M.materials?.[mat.getName()]) mat.setName(M.materials[mat.getName()]);
  if (M.yaw) {
    // Turn the whole car about the vertical so its nose points the way the game drives.
    const scene = rootP.listScenes()[0];
    const turn = doc.createNode('turn').setRotation([0, Math.sin(M.yaw / 2), 0, Math.cos(M.yaw / 2)]);
    for (const c of scene.listChildren()) {
      scene.removeChild(c);
      turn.addChild(c);
    }
    scene.addChild(turn);
  }

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
  const wheels = Array.isArray(M.wheels) ? Object.fromEntries(M.wheels.map((w) => [w, w])) : M.wheels;
  for (const [src, w] of Object.entries(wheels)) {
    const node = rootP.listNodes().find((n) => n.getName() === src);
    if (!node) throw new Error(`no wheel ${src}`);
    if (M.resetWheels) node.setRotation([0, 0, 0, 1]);
    node.listChildren().forEach((c, k) => {
      // The game finds a wheel by its name prefix and centres it on the part named Tire.
      if (!c.getName()) c.setName(`${w}Tire${k}`);
      else if (M.tire) c.setName(`${w}${M.tire.test(c.getName()) ? 'Tire' : 'Part'}${k}`);
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
  await doc.transform(join({ keepNamed: true }));
  if (M.remesh) {
    remesh(doc, L.ratio, L.error);
    await doc.transform(weld());
  } else {
    await doc.transform(
      weld(),
      // Borders stay put: the body is many separate panels, and a moved edge opens a crack between them.
      simplify({ simplifier: MeshoptSimplifier, ratio: L.ratio, error: L.error, lockBorder: true }),
    );
  }
  await doc.transform(
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

// node tools/models.mjs [id…]: rebuild only those (all by default).
const only = process.argv.slice(2);
for (const [id, M] of Object.entries(MODELS)) {
  if (only.length && !only.includes(id)) continue;
  for (const L of M.lods) await build(id, M, L);
}
fs.writeFileSync(
  path.join(OUT, 'CREDITS.md'),
  `# Models\n\n${Object.entries(MODELS).map(([id, M]) => `- **${id}**: ${M.credit}. Source: ${M.url}`).join('\n')}\n\nLicence texts: https://creativecommons.org/licenses/by/4.0/\n`,
);
