// Evaluates a candidate circuit against the terrain and draws it over the height map.
import fs from 'fs';
import zlib from 'zlib';
import * as THREE from 'three';
import { Terrain } from '../src/engine/world/Terrain.js';

const pts = JSON.parse(process.argv[2]);
const out = process.argv[3];
const t = new Terrain({}, { plaza: null, paths: [] });
const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const L = curve.getLength();
const n = Math.round(L / 2);
const P = curve.getSpacedPoints(n).slice(0, n);
let minR = 1e9, minRi = 0;
const raw = P.map((p) => t.height(p.x, p.z));
for (let i = 0; i < n; i++) {
  const a = P[(i - 4 + n) % n], b = P[i], c = P[(i + 4) % n];
  const ab = b.distanceTo(a), bc = c.distanceTo(b), ca = a.distanceTo(c);
  const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
  const R = area > 1e-6 ? (ab * bc * ca) / (4 * area) : 1e9;
  if (R < minR) { minR = R; minRi = i; }
}
// smoothed profile
let h = raw.map((v) => Math.max(v, 2.4));
for (let k = 0; k < 60; k++) h = h.map((_, i) => (h[(i - 3 + n) % n] + h[(i - 1 + n) % n] + 2 * h[i] + h[(i + 1) % n] + h[(i + 3) % n]) / 6);
let maxG = 0;
for (let i = 0; i < n; i++) maxG = Math.max(maxG, Math.abs(h[(i + 1) % n] - h[i]) / 2);
console.log(JSON.stringify({ length: Math.round(L), minRadius: Math.round(minR), at: P[minRi].toArray().map(Math.round), rawMin: Math.min(...raw).toFixed(1), rawMax: Math.max(...raw).toFixed(1), profMin: Math.min(...h).toFixed(1), profMax: Math.max(...h).toFixed(1), maxGradePct: (maxG * 100).toFixed(1), cutFill: Math.max(...raw.map((v, i) => Math.abs(v - h[i]))).toFixed(1) }));
// map
const N = 550, half = 550;
const px = Buffer.alloc(N * (N * 3 + 1));
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -half + (i + 0.5) * 2, z = -half + (j + 0.5) * 2;
  const hh = t.height(x, z);
  let c = hh < 0 ? [20, 90, 170] : hh < 2.5 ? [220, 200, 150] : [60 + 170 * Math.min(1, hh / 90), 130 + 100 * Math.min(1, hh / 90), 60 + 170 * Math.min(1, hh / 90)];
  if (hh > 0 && Math.abs((hh % 10) - 5) > 4.6) c = c.map((v) => v * 0.6);
  const o = j * (N * 3 + 1) + 1 + i * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
}
const dot = (x, z, col, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = Math.round((x + half) / 2) + dx, j = Math.round((z + half) / 2) + dy; if (i < 0 || j < 0 || i >= N || j >= N) continue; const o = j * (N * 3 + 1) + 1 + i * 3; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; } };
P.forEach((p, i) => dot(p.x, p.z, i === 0 ? [255, 255, 255] : [30, 30, 30], i === 0 ? 3 : 1));
pts.forEach(([x, z], k) => dot(x, z, k === 0 ? [255, 40, 40] : [255, 176, 32], 2));
dot(P[minRi].x, P[minRi].z, [255, 0, 255], 3);
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
