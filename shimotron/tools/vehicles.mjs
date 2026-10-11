// The monster truck and the motocross bike as real models, from the files the model-download
// thread prepared (metres, nose +z, wheels on y = 0, nodes `body` + `wheel_FL/FR/RL/RR` or
// `wheel_F/R` at their axle centres; see that folder's README and CREDIT.txt files):
//   node tools/vehicles.mjs [/mnt/project-files/shimotron/models-real]
// Textures are shrunk to WebP, geometry merged per material and quantized; the output is
// committed, gzipped, in src/race/models/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, join, quantize, flatten, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || '/mnt/project-files/shimotron/models-real';

export const VEHICLES = {
  'monster-van': {
    file: 'monster4x4/monster-truck-lunchbox/monster-truck-lunchbox.glb',
    credit: '"[Monster Truck Game] Lunchbox Van" by Jorma Rysky (sketchfab.com), CC BY 4.0 — modified: textures shrunk, compressed',
    tex: 512,
  },
  'moto-yz': {
    file: 'motocross/yamaha-yz250/yamaha-yz250.glb',
    credit: '"Yz250" by e-restrepo1114 (sketchfab.com/EmanuelRestrepoVelez), CC BY 4.0 — modified: cut into moving parts, simplified, compressed',
    tex: 256,
    // The steering (fork, bars, front fender) and the swingarm are cut out of the body as their own
    // nodes, so they can turn and swing; `axis` runs up the fork through `head` (model coordinates,
    // measured from the fork tubes), the swingarm swings about `pivot` towards the rear axle.
    split: {
      head: [0, 1.0, 0.303],
      axis: [0, 0.804, -0.595],
      margin: 0.035,
      steerNames: /manubrio|espejos|carenaje|guarda barros delantero/,
      keepNames: /tanque|asiento|tapas|mofle/,
      pivot: [0, 0.42, -0.1],
      axle: [0, 0.325, -0.645],
      band: 0.07,
      // The fork's lower legs (and the brake caliper on them) slide with the front wheel: steer
      // triangles further than this down the axis from the head.
      slider: 0.44,
      // The fork's own parts ("marco dt…": legs, guards, brake line) lie a little behind the axis near
      // the axle: below this height they all slide, above it they steer.
      forkNames: /marco dt|kx marco/,
      forkY: 0.62,
      forkZ: 0.52, // (the frame and engine share those names: they stand further back)
    },
    // Spoked wheels and a welded tube frame: half the triangles look the same at riding distance.
    simplify: { ratio: 0.5, error: 0.002 },
  },
  // Boats, submarines and planes (folder README "Boats, subs, planes"): nose +z, y = 0 the lowest
  // point; `prop`, `prop_L`, `prop_R` nodes sit on their hubs and spin about their own z.
  'plane-geebee': {
    file: 'plane/gee-bee-r1-racer/gee-bee-r1-racer.glb',
    credit: '"Gee Bee R-1" by helijah (sketchfab.com), CC BY 4.0 — modified: simplified, textures shrunk, compressed',
    tex: 256,
    simplify: { ratio: 0.2, error: 0.012 },
  },
  'plane-p51': {
    file: 'plane/p51-mustang-racer/p51-mustang-racer.glb',
    credit: '"P-51 Mustang" (racer livery) by isabel_arauz (sketchfab.com), CC BY 4.0 — modified: simplified, textures shrunk, compressed',
    tex: 512,
    simplify: { ratio: 0.25, error: 0.005 },
  },
  'boat-cat': {
    file: 'boat/offshore-catamaran/offshore-catamaran.glb',
    // The beer-brand livery (a trademark) painted over with the colour beside it: rectangles
    // [x0, y0, x1, y1, sample x, sample y] in pixels of the 1024² texture.
    cover: {
      BoatBody: [
        [22, 118, 186, 162, 100, 100], // "SELECT Budweiser", deck front
        [32, 625, 168, 668, 100, 617], // …deck back
        [58, 225, 146, 292, 100, 347], // crown, in the canopy oval
        [58, 545, 146, 604, 100, 540], // crown, behind it
        [268, 228, 312, 386, 290, 212], // side lettering
        [392, 535, 434, 688, 413, 520],
        [218, 420, 276, 478, 247, 482], // round crown badges
        [338, 420, 396, 478, 367, 413],
      ],
    },
    credit: '"Boat" (offshore racing catamaran) by milamila (sketchfab.com), CC BY 4.0 — modified: simplified, textures shrunk, compressed',
    tex: 512,
    simplify: { ratio: 0.25, error: 0.005 },
  },
  'boat-sprint': {
    file: 'boat/jet-sprint-boat/jet-sprint-boat.glb',
    credit: '"Jet sprint boat" by csharp122705 (sketchfab.com), CC BY 4.0 — modified: simplified, compressed',
    tex: 256,
    simplify: { ratio: 0.25, error: 0.005 },
  },
  'sub-yellow': {
    file: 'sub/yellow-research-sub/yellow-research-sub.glb',
    credit: '"Submarine" (yellow research submersible) by tflexcad (sketchfab.com), CC BY 4.0 — modified: simplified, compressed',
    tex: 256,
    simplify: { ratio: 0.25, error: 0.005 },
  },
  'sub-excavator': {
    file: 'sub/deep-sea-excavator-sub/deep-sea-excavator-sub.glb',
    credit: '"Deep sea excavator" by Crysis007-94 (sketchfab.com), CC BY 4.0 — modified: simplified, textures shrunk, compressed',
    tex: 512,
    simplify: { ratio: 0.25, error: 0.005 },
  },
};

// Nodes that move on their own (wheels turn, propellers spin): kept as nodes at their hubs.
const MOVING = /^(wheel_|prop)/;

/**
 * Cuts the body of a bike into body / steer / swing nodes (see VEHICLES['moto-yz'].split), and drops
 * the body's own copy of the wheels (the source left the tyres and rims in the body as well as in
 * the wheel nodes: they would stand still while the real ones spin).
 */
function splitParts(doc, scene, body, wheels, source, S) {
  const key = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const onWheel = new Set();
  const v = [0, 0, 0];
  for (const w of wheels) {
    const t = w.getTranslation();
    for (const p of w.getMesh().listPrimitives()) {
      const P = p.getAttribute('POSITION');
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v);
        onWheel.add(key(v[0] + t[0], v[1] + t[1], v[2] + t[2]));
      }
    }
  }
  // …and by place: inside a wheel's drum (radius and half width of its tyre), off-centre by less
  // than the tyre is wide (the fork legs and brake discs stand further out).
  const drums = wheels.map((w) => {
    const t = w.getTranslation();
    let r = 0;
    let hw = 0;
    for (const p of w.getMesh().listPrimitives()) {
      const P = p.getAttribute('POSITION');
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v);
        r = Math.max(r, Math.hypot(v[1], v[2]));
        hw = Math.max(hw, Math.abs(v[0]));
      }
    }
    return { t, r: r + 0.01, hw: hw + 0.003 };
  });
  const inOne = (d, q) => Math.abs(q[0] - d.t[0]) < d.hw && Math.hypot(q[1] - d.t[1], q[2] - d.t[2]) < d.r;
  const nodes = { steer: doc.createNode('steer'), slider: doc.createNode('slider'), swing: doc.createNode('swing') };
  nodes.steer.setTranslation(S.head).setExtras({ axis: S.axis });
  nodes.slider.setTranslation(S.head);
  nodes.swing.setTranslation(S.pivot);
  for (const n of Object.values(nodes)) n.setMesh(doc.createMesh(n.getName()));
  const [hy, hz] = [S.head[1], S.head[2]];
  const slope = S.axis[2] / S.axis[1]; // dz per dy along the fork
  const axisZ = (y) => hz + (y - hy) * slope;
  const seg = (y, z) => {
    const ay = S.pivot[1], az = S.pivot[2];
    const by = S.axle[1] - ay, bz = S.axle[2] - az;
    const t = Math.max(0, Math.min(1, ((y - ay) * by + (z - az) * bz) / (by * by + bz * bz)));
    return Math.hypot(y - ay - by * t, z - az - bz * t);
  };
  const alen = Math.hypot(S.axis[1], S.axis[2]);
  const down = (y, z) => -((y - hy) * S.axis[1] + (z - hz) * S.axis[2]) / alen; // metres down the fork from the head
  const counts = { body: 0, steer: 0, slider: 0, swing: 0, wheel: 0, dup: 0 };
  for (const p of [...body.getMesh().listPrimitives()]) {
    const name = source.get(p) || '';
    const P = p.getAttribute('POSITION');
    const I = p.getIndices();
    const ids = I ? Array.from(I.getArray()) : [...Array(P.getCount()).keys()];
    const out = { body: [], steer: [], slider: [], swing: [], wheels: [] };
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let k = 0; k < ids.length; k += 3) {
      P.getElement(ids[k], a);
      P.getElement(ids[k + 1], b);
      P.getElement(ids[k + 2], c);
      if ([a, b, c].every((q) => onWheel.has(key(q[0], q[1], q[2])))) {
        counts.dup++;
        continue;
      }
      // Rims, spokes and hubs the source left in the body: they turn with their wheel.
      const drum = drums.findIndex((d) => [a, b, c].every((q) => inOne(d, q)));
      if (drum >= 0) {
        (out.wheels[drum] ||= []).push(ids[k], ids[k + 1], ids[k + 2]);
        counts.wheel++;
        continue;
      }
      const x = (a[0] + b[0] + c[0]) / 3, y = (a[1] + b[1] + c[1]) / 3, z = (a[2] + b[2] + c[2]) / 3;
      let part = 'body';
      if (S.steerNames.test(name)) part = 'steer';
      else if (!S.keepNames.test(name) && y > 0.3 && z > axisZ(y) - S.margin) part = 'steer';
      else if (!S.keepNames.test(name) && Math.abs(x) < 0.14 && seg(y, z) < S.band) part = 'swing';
      if (S.forkNames && S.forkNames.test(name) && part !== 'swing' && z > S.forkZ) part = y < S.forkY ? 'slider' : 'steer';
      if (part === 'steer' && S.slider && !S.steerNames.test(name) && down(y, z) > S.slider) part = 'slider';
      out[part].push(ids[k], ids[k + 1], ids[k + 2]);
      counts[part]++;
    }
    for (const part of ['steer', 'slider', 'swing', 'body']) {
      if (!out[part].length) continue;
      const q = p.clone();
      q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out[part])));
      if (part !== 'body') {
        // Into the node's own frame (its origin on the steering axis / at the pivot).
        const o = nodes[part].getTranslation();
        const pos = P.clone();
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          pos.setElement(i, [v[0] - o[0], v[1] - o[1], v[2] - o[2]]);
        }
        q.setAttribute('POSITION', pos);
        nodes[part].getMesh().addPrimitive(q);
      } else body.getMesh().addPrimitive(q);
    }
    out.wheels.forEach((list, w) => {
      if (!list?.length) return;
      const q = p.clone();
      q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)));
      const o = wheels[w].getTranslation();
      const pos = P.clone();
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pos.setElement(i, [v[0] - o[0], v[1] - o[1], v[2] - o[2]]);
      }
      q.setAttribute('POSITION', pos);
      wheels[w].getMesh().addPrimitive(q);
    });
    body.getMesh().removePrimitive(p);
    p.dispose();
  }
  for (const n of Object.values(nodes)) scene.addChild(n);
  console.log('split', JSON.stringify(counts));
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const [id, V] of Object.entries(VEHICLES)) {
  if (only && !only.test(id)) continue;
  const doc = await io.read(path.join(SRC, V.file));
  const R = doc.getRoot();
  // Bake everything under `body` into it, so it is one node of merged meshes; wheels stay nodes.
  await doc.transform(flatten());
  const scene = R.listScenes()[0];
  const body = doc.createNode('body');
  const source = new Map(); // body primitive → the source node's name
  const wheels = [];
  for (const n of R.listNodes()) {
    if (MOVING.test(n.getName())) wheels.push(n);
  }
  for (const n of R.listNodes()) {
    if (!n.getMesh() || MOVING.test(n.getName()) || n === body) continue;
    // flatten() put every mesh node at the scene root with its world transform.
    const m = n.getMesh();
    const M = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const q = p.clone();
      const pos = q.getAttribute('POSITION').clone();
      const nor = q.getAttribute('NORMAL')?.clone();
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const [x, y, z] = v;
        pos.setElement(i, [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]);
      }
      q.setAttribute('POSITION', pos);
      if (nor) {
        for (let i = 0; i < nor.getCount(); i++) {
          nor.getElement(i, v);
          const [x, y, z] = v;
          const a = M[0] * x + M[4] * y + M[8] * z;
          const b = M[1] * x + M[5] * y + M[9] * z;
          const c = M[2] * x + M[6] * y + M[10] * z;
          const l = Math.hypot(a, b, c) || 1;
          nor.setElement(i, [a / l, b / l, c / l]);
        }
        q.setAttribute('NORMAL', nor);
      }
      if (!body.getMesh()) body.setMesh(doc.createMesh('body'));
      body.getMesh().addPrimitive(q);
      source.set(q, n.getName());
    }
    n.dispose();
  }
  for (const s of R.listScenes()) for (const c of s.listChildren()) s.removeChild(c);
  scene.addChild(body);
  for (const w of wheels) {
    w.setTranslation(w.getWorldTranslation());
    w.setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    scene.addChild(w);
  }
  if (V.split) splitParts(doc, scene, body, wheels, source, V.split);
  if (V.split && process.env.DEBUG_PARTS) {
    // Paint the cut-out parts to check the cut: steer red, fork sliders blue, swingarm green.
    for (const [n, c] of [['steer', [1, 0, 0, 1]], ['slider', [0, 0, 1, 1]], ['swing', [0, 1, 0, 1]]]) {
      const m = doc.createMaterial(n).setBaseColorFactor(c);
      for (const p of R.listNodes().find((x) => x.getName() === n).getMesh().listPrimitives()) p.setMaterial(m);
    }
  }
  await doc.transform(prune(), dedup(), join({ keepNamed: true }), prune());
  for (const m of R.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    m.setNormalTexture(null);
  }
  await doc.transform(prune());
  for (const t of R.listTextures()) {
    const rects = V.cover && t.listParents().flatMap((m) => (m.propertyType === 'Material' && V.cover[m.getName()]) || []);
    if (rects?.length) {
      const src = sharp(Buffer.from(t.getImage()));
      const { data, info } = await src.clone().raw().toBuffer({ resolveWithObject: true });
      const k = info.width / 1024;
      const px = (x, y) => {
        const o = (Math.round(y * k) * info.width + Math.round(x * k)) * info.channels;
        return { r: data[o], g: data[o + 1], b: data[o + 2] };
      };
      const tiles = await Promise.all(
        rects.map(async ([x0, y0, x1, y1, sx, sy]) => ({
          input: await sharp({ create: { width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k), channels: 3, background: px(sx, sy) } }).png().toBuffer(),
          left: Math.round(x0 * k),
          top: Math.round(y0 * k),
        })),
      );
      t.setImage(await src.composite(tiles).png().toBuffer()).setMimeType('image/png');
    }
    const img = await sharp(Buffer.from(t.getImage())).resize(V.tex, V.tex, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
    t.setImage(img).setMimeType('image/webp');
  }
  if (V.simplify) {
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ...V.simplify }));
  }
  await doc.transform(quantize({ quantizeNormal: 8 })); // 8-bit normals, as gltfpack does
  const out = path.join(root, `src/race/models/${id}.glb.gz`);
  fs.writeFileSync(out, zlib.gzipSync(await io.writeBinary(doc), { level: 9 }));
  console.log(id, fs.statSync(out).size, 'bytes,', R.listNodes().map((n) => n.getName()).join(' '));
}
