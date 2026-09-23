// Renders every race stage's island with its generated circuit (top-down PNGs + stats).
import fs from 'fs';
import zlib from 'zlib';
import { Terrain } from '../src/engine/world/Terrain.js';
import { STAGES } from '../src/race/config.js';
import { generateTrack } from '../src/race/TrackGenerator.js';
import * as THREE from 'three';

const outDir = process.argv[2] || '.';
const only = process.argv[3];
for (const st of STAGES) {
  if (only && st.id !== only) continue;
  const t0 = Date.now();
  const terrain = new Terrain({}, { plaza: null, paths: [], island: st.island, size: st.size, seed: st.seed });
  terrain.skipMesas = true;
  const tr = generateTrack(terrain, st, { log: true });
  terrain.skipMesas = false;
  const ms = Date.now() - t0;
  if (!tr) { console.log(st.id, 'NO TRACK', ms + 'ms'); continue; }
  console.log(st.id, JSON.stringify({ len: Math.round(tr.length), minR: Math.round(tr.minRadius), corners: tr.corners, tight: tr.tight, grade: (tr.maxGrade * 100).toFixed(1), cut: tr.cutFill.toFixed(1), climb: Math.round(tr.climb), score: tr.score.toFixed(1), ms }));
  const N = 390, half = st.size / 2, px = Buffer.alloc(N * (N * 3 + 1)), cell = st.size / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell, h = terrain.height(x, z);
    let c = h < 0 ? [20, 90, 170] : h < 2.5 ? [220, 200, 150] : [60 + 170 * Math.min(1, h / 120), 130 + 100 * Math.min(1, h / 120), 60 + 170 * Math.min(1, h / 120)];
    if (h > 0 && Math.abs((h % 10) - 5) > 4.5) c = c.map((v) => v * 0.65);
    const o = j * (N * 3 + 1) + 1 + i * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  }
  const curve = new THREE.CatmullRomCurve3(tr.controls, true, 'centripetal');
  for (const p of curve.getSpacedPoints(3000)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = Math.round((p.x + half) / cell) + dx, j = Math.round((p.z + half) / cell) + dy; if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const o = j * (N * 3 + 1) + 1 + i * 3; px[o] = 20; px[o + 1] = 20; px[o + 2] = 24;
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(`${outDir}/stage-${st.id}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
}
