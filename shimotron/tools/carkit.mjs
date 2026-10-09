// Packs the downloaded low-poly car models (CC0: rgsdev's "Free Low Poly Vehicles Pack", Kenney's
// Car Kit) into src/race/models/kit-<type>.glb.gz for RealModels.js, which scales and orients them at
// load time. Source: the models-src folder the download thread filled (see its README).
//   node tools/carkit.mjs [/mnt/project-files/shimotron/models-src]
import fs from 'fs';
import zlib from 'zlib';

const SRC = process.argv[2] || '/mnt/project-files/shimotron/models-src';
const PICK = {
  gt: 'gt/rgsdev-sports/rgsdev-sports.glb',
  rally: 'rally/rgsdev-hatchback/rgsdev-hatchback.glb',
  muscle: 'muscle/rgsdev-muscle-2/rgsdev-muscle-2.glb',
  buggy: 'buggy/kenney-race-future/kenney-race-future.glb',
  formula: 'formula/kenney-race/kenney-race.glb',
};
for (const [type, rel] of Object.entries(PICK)) {
  const buf = fs.readFileSync(`${SRC}/${rel}`);
  const gz = zlib.gzipSync(buf, { level: 9 });
  const out = new URL(`../src/race/models/kit-${type}.glb.gz`, import.meta.url);
  fs.writeFileSync(out, gz);
  console.log(type.padEnd(8), rel, `${(buf.length / 1024).toFixed(0)} KB → ${(gz.length / 1024).toFixed(0)} KB`);
}
