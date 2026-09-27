// Bakes every stage's circuit plan into src/race/plans.json so the game does not
// have to search for it at run time. Run after changing a stage or the generator:
//   node tools/plans.mjs
import fs from 'fs';
import { Terrain } from '../src/engine/world/Terrain.js';
import { STAGES, RACE } from '../src/race/config.js';
import { generateTrack, planSignature, packPlan } from '../src/race/TrackGenerator.js';

const out = {};
for (const st of STAGES) {
  const t0 = Date.now();
  const terrain = new Terrain({}, { plaza: null, paths: [], island: st.island, size: st.size, seed: st.seed });
  terrain.skipMesas = true;
  const plan = generateTrack(terrain, st, { halfWidth: RACE.roadHalfWidth });
  if (!plan) throw new Error(`no track for ${st.id}`);
  out[st.id] = packPlan(plan, planSignature(st, RACE.roadHalfWidth));
  console.log(st.id.padEnd(7), `${Math.round(plan.length)} m`, `${Date.now() - t0} ms`);
}
const file = new URL('../src/race/plans.json', import.meta.url);
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log('wrote', file.pathname, fs.statSync(file).size, 'bytes');
