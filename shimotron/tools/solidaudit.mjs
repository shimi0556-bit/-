// Solid-world audit: is everything a car can drive into actually solid?
//
// Opens dist/race.html in headless Chromium, lets the game build every island,
// then walks every mesh on each island. Surface points at car-body height above
// the ground (the band a chassis sweeps through) must lie on or inside a
// collision shape that stops cars; a point with no shape near it is a place a
// car drives into the object instead of hitting it. Soft things (grass, bushes,
// leaves, water, decals, people behind the fences) are skipped by name.
//
//   npm run build:race && node tools/solidaudit.mjs [island…]
// Prints, per island, the meshes with unguarded surface and where; exits 1 if any.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(root, 'dist', 'race.html');
if (!fs.existsSync(page)) {
  console.error('dist/race.html is missing: run "npm run build:race" first');
  process.exit(1);
}
const only = process.argv.slice(2);

let playwright;
try {
  playwright = await import('playwright');
} catch {
  const global = execSync('npm root -g').toString().trim();
  playwright = createRequire(path.join(global, 'noop.js'))('playwright');
}
const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'],
});
const tab = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
tab.on('pageerror', (e) => errors.push(e.message));
await tab.goto(pathToFileURL(page).href + '#low');
try {
  await tab.waitForFunction((n) => window.shimotron?.game?.state === 'menu' && window.shimotron.game.islands?.size >= n, (await import('../src/race/config.js')).STAGES.length, { timeout: 1500000, polling: 2000 });
} catch {
  console.error('the game did not finish loading', errors.join('\n'));
  await browser.close();
  process.exit(1);
}
await tab.evaluate(() => window.shimotron.engine.stop());

const report = await tab.evaluate((only) => {
  const { THREE } = window.shimotron;
  // Car-body band above the ground, and how far a surface may sit from a shape and still count as guarded.
  const BAND = [0.3, 1.3];
  const TOL = 0.25;
  // Soft or out of reach by design (the trail stakes bend away from a car, Trail._bendStakes;
  // the start gates lie flat from the green light on).
  const SOFT = /\b(grass|flower|bush|leaf|leaves|crown|frond|water|ocean|wave|foam|terrain|road|asphalt|decal|shadow|sky|cloud|particle|spray|dust|smoke|crowd|human|people|spectator|fish|coral|kelp|seagrass|glow|flag|banner|cable|rope|wire|lava|snow|weather|bird|balloon|cow|sheep|camel|pickup)|דשא|פרחים|שיחים|גבעולי שיחים|עלווה|מחטים|כפות דקל|Ocean|Water|קצף|קרקע|כביש|אספלט|שפת מסלול|שפות|סימון|קהל|אנשים|צופים|דגים|להקות|שונית|אלמוג|אצות|דגל|כבלים|חבל|לבה|שלג|ציפורים|כדור פורח|כדורים פורחים|פרות|כבשים|גמלים|הפתעות|יתדות|שערי זינוק|רחובות/i;
  const out = {};
  const tmp = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  for (const [id, isl] of window.shimotron.game.islands) {
    if (only.length && !only.includes(id)) continue;
    const t = isl.terrain;
    // Every shape that stops a car, from the island's own bodies.
    const shapes = [];
    const grid = new Map();
    const G = 8;
    const add = (s, r) => {
      for (let i = Math.floor((s.x - r) / G); i <= Math.floor((s.x + r) / G); i++) {
        for (let j = Math.floor((s.z - r) / G); j <= Math.floor((s.z + r) / G); j++) {
          const k = i + ',' + j;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(s);
        }
      }
    };
    const bodies = [...(isl.bodies || []), ...window.shimotron.engine.physics.world.bodies.filter((b) => b.type !== 1 && !isl.bodies?.includes(b))];
    for (const b of bodies) {
      if (b.type === 1) continue; // dynamic
      b.shapes.forEach((s, i) => {
        if (!(s.collisionFilterMask & 4)) return; // not hit by car chassis boxes
        const off = b.quaternion.vmult(b.shapeOffsets[i]);
        const c = { x: b.position.x + off.x, y: b.position.y + off.y, z: b.position.z + off.z };
        if (s.type === 1) {
          // sphere
          add({ ...c, r: s.radius }, s.radius);
        } else if (s.type === 4) {
          // box
          const q = b.quaternion.mult(b.shapeOrientations[i]);
          const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
          const h = s.halfExtents;
          add({ ...c, inv, h: [h.x, h.y, h.z] }, Math.hypot(h.x, h.y, h.z));
        }
      });
    }
    const dist = (p) => {
      const list = grid.get(Math.floor(p.x / G) + ',' + Math.floor(p.z / G));
      if (!list) return Infinity;
      let best = Infinity;
      for (const s of list) {
        let d;
        if (s.r !== undefined) d = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) - s.r;
        else {
          tmp.set(p.x - s.x, p.y - s.y, p.z - s.z).applyQuaternion(s.inv);
          const dx = Math.max(Math.abs(tmp.x) - s.h[0], 0);
          const dy = Math.max(Math.abs(tmp.y) - s.h[1], 0);
          const dz = Math.max(Math.abs(tmp.z) - s.h[2], 0);
          d = Math.hypot(dx, dy, dz);
        }
        if (d < best) best = d;
      }
      return best;
    };
    const found = new Map();
    const p = new THREE.Vector3();
    // Only vertices a drawn triangle uses (a strip may keep vertices across a gap it does not draw).
    const drawn = new Map();
    const used = (geo) => {
      if (!geo.index) return null;
      let list = drawn.get(geo);
      if (!list) {
        const set = new Set();
        const ix = geo.index.array;
        const end = Math.min(ix.length, (geo.drawRange.start || 0) + (geo.drawRange.count === Infinity ? ix.length : geo.drawRange.count));
        for (let k = geo.drawRange.start || 0; k < end; k++) set.add(ix[k]);
        drawn.set(geo, (list = Int32Array.from(set)));
      }
      return list;
    };
    const visit = (mesh, world, name) => {
      const pos = mesh.geometry.attributes.position;
      if (!pos) return;
      const list = used(mesh.geometry);
      const count = list ? list.length : pos.count;
      const step = Math.max(1, Math.floor(count / 400));
      for (let k = 0; k < count; k += step) {
        const i = list ? list[k] : k;
        p.fromBufferAttribute(pos, i).applyMatrix4(world);
        const g = t.height(p.x, p.z);
        if (g < -0.6) continue; // in the sea, past where a car can drive
        const h = p.y - g;
        if (h < BAND[0] || h > BAND[1]) continue;
        const d = dist(p);
        let e = found.get(name);
        if (!e) found.set(name, (e = { points: 0, open: 0, worst: 0, at: null, cells: new Set() }));
        e.points++;
        if (d > TOL) {
          e.open++;
          e.cells.add(Math.round(p.x / 10) + ',' + Math.round(p.z / 10));
          if (d > e.worst && d < 50) {
            e.worst = d;
            e.at = [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
          }
        }
      }
    };
    isl.group.updateMatrixWorld(true);
    isl.group.traverse((o) => {
      if (!o.isMesh || !o.visible && o.isInstancedMesh === undefined) return;
      if (o.isPoints || o.isLine || o.isSprite) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const name = [o.name, o.parent?.name, mat?.name].filter(Boolean).join(' / ') || '(unnamed)';
      if (SOFT.test(name)) return;
      if (mat && mat.transparent && mat.opacity < 0.6) return;
      if (o.isInstancedMesh) {
        const n = Math.min(o.count, 4000);
        for (let k = 0; k < n; k++) {
          o.getMatrixAt(k, m4);
          m4.premultiply(o.matrixWorld);
          visit(o, m4, name);
        }
      } else visit(o, o.matrixWorld, name);
    });
    out[id] = [...found.entries()]
      .filter(([, e]) => e.open > 0)
      .map(([name, e]) => ({ name, open: e.open, points: e.points, places: e.cells.size, worst: +e.worst.toFixed(2), at: e.at }))
      .sort((a, b) => b.places - a.places);
  }
  return out;
}, only);

await browser.close();
let total = 0;
for (const [id, list] of Object.entries(report)) {
  console.log(`\n== ${id}: ${list.length ? list.length + ' kinds of mesh a car can drive into' : 'solid'}`);
  for (const e of list) {
    total += e.places;
    console.log(`  ${String(e.places).padStart(4)} places  ${String(e.open).padStart(5)}/${String(e.points).padEnd(6)} pts  worst ${e.worst} m at ${e.at}  ${e.name}`);
  }
}
if (errors.length) console.log('\npage errors:\n' + errors.join('\n'));
process.exit(total ? 1 : 0);
