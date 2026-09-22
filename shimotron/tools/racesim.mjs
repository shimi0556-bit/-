// Headless race simulation (no rendering): terrain + circuit + physics + AI.
// Usage: node tools/racesim.mjs [stageId] [seconds] [cars]
// Prints each car's progress and flags crashes, flips, stalls and respawns.
import * as THREE from 'three';
import { Terrain } from '../src/engine/world/Terrain.js';
import { Physics } from '../src/engine/physics/Physics.js';
import { STAGES, RACE, AI } from '../src/race/config.js';
import { generateTrack } from '../src/race/TrackGenerator.js';
import { Track } from '../src/race/Track.js';
import { Vehicle, GROUP } from '../src/race/Vehicle.js';
import { AIDriver, updateDrafts } from '../src/race/Drivers.js';

const [, , stageId = 'pines', secs = '90', nCars = '6', skillArg = '0.95'] = process.argv;
const st = STAGES.find((s) => s.id === stageId);
const stub = { events: { emit() {}, on() {} }, materials: { setEmissiveBase() {} } };
const t0 = Date.now();
const terrain = new Terrain(stub, { plaza: null, paths: [], island: st.island, biome: st.biome, size: st.size, segments: 520, seed: st.seed });
const plan = generateTrack(terrain, st, { halfWidth: RACE.roadHalfWidth });
const track = new Track(stub, terrain, plan.controls, st);
terrain.heightModifier = track.heightModifier;
terrain.bakeHeights();
const physics = new Physics(stub);
physics.fixedStep = 1 / 120;
physics.maxSubSteps = 10;
terrain.addPhysics(physics);
terrain.body.shapes[0].collisionFilterGroup = GROUP.terrain;
track.buildPhysics(physics);
console.log(`${st.id}: ${track.length.toFixed(0)} m, built in ${Date.now() - t0} ms, bodies ${physics.world.bodies.length}`);

const cars = [];
const L = track.length;
for (let k = 0; k < Number(nCars); k++) {
  const row = Math.floor(k / 2);
  const col = k % 2;
  const back = 12 + row * 16 + col * 8;
  const s = 1 - back / L;
  const pose = track.pose(s, col === 0 ? -3.4 : 3.4);
  const pos = pose.position.clone();
  pos.y += 0.66;
  const vehicle = new Vehicle(physics, { position: pos, heading: Math.atan2(pose.tangent.x, pose.tangent.z), ground: (f, t, r) => track.raycastRoad(f, t, r, track.roadBody) });
  vehicle.assist = 1.2;
  const car = { vehicle, body: vehicle.body };
  vehicle.body.userData = { simCar: k };
  const skill = process.env.REVERSE ? Number(skillArg) - (Number(nCars) - 1 - k) * 0.015 : Number(skillArg) - k * 0.01;
  const driver = new AIDriver(car, track, { skill, rubber: 0, seed: k + 1 });
  cars.push({ id: k, car, driver, progress: -back / L, lastS: s, q: null, _q: {}, respawns: 0, flips: 0, hits: 0, minV: 99, laps: [], lapStart: 0, crossed: -1 });
  vehicle.body.addEventListener('collide', (e) => {
    const sp = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (sp > 3) cars[k].hits++;
    if (sp > 1) {
      cars[k].lastHitT = clock;
      cars[k].lastHitWhat = `${e.body.userData && e.body.userData.simCar !== undefined ? 'car' + e.body.userData.simCar : e.body.material ? e.body.material.name : '?'} ${sp.toFixed(1)}m/s`;
    }
  });
}
let clock = 0;
physics.world.addEventListener('preStep', () => {
  updateDrafts(cars, L);
  for (const c of cars) {
    c.driver.update(physics.fixedStep, c, cars.filter((o) => o !== c), null);
    c.car.vehicle.preStep(physics.fixedStep);
  }
});
const respawn = (c, why) => {
  c.respawns++;
  let s = (c.q ? c.q.s : c.lastS) - 6 / L;
  s = (s + 1) % 1;
  const pose = track.pose(s, 0);
  const pos = pose.position.clone();
  pos.y += 0.7;
  c.car.vehicle.place(pos, Math.atan2(pose.tangent.x, pose.tangent.z));
  c.car.body.velocity.set(pose.tangent.x * 8, 0, pose.tangent.z * 8);
  c.lastS = s;
  Object.assign(c.driver, { needsRespawn: false, stuck: 0, recoveries: 0, wrongWay: 0, reverseT: 0 });
  console.log(`  t=${clock.toFixed(1)} car${c.id} respawn (${why}) at ${(c.progress * 100).toFixed(1)}% i=${c.q ? c.q.i : '?'}`);
};
const dt = 1 / 60;
const total = Number(secs);
let nextLog = 5;
while (clock < total) {
  physics.step(dt);
  clock += dt;
  for (const c of cars) {
    const b = c.car.body;
    const q = track.nearest(b.position.x, b.position.z, c._q);
    c.q = q;
    if (q) {
      let ds = q.s - c.lastS;
      if (ds < -0.5) ds += 1;
      if (ds > 0.5) ds -= 1;
      c.lastS = q.s;
      const before = c.progress;
      c.progress += ds;
      const crossed = Math.floor(c.progress);
      if (crossed > c.crossed) {
        c.crossed = crossed;
        if (crossed >= 1) {
          c.laps.push(clock - c.lapStart);
          c.lapStart = clock;
        }
      }
      void before;
    }
    const v = c.car.vehicle;
    if (clock > 3) c.minV = Math.min(c.minV, Math.abs(v.speed));
    if (v.upsideDown > 0.05 && !c._flip) {
      c.flips++;
      c._flip = true;
      const near = cars.filter((o) => o !== c && o.car.body.position.distanceTo(b.position) < 9).map((o) => `car${o.id}@${o.car.body.position.distanceTo(b.position).toFixed(1)}m lat${o.q ? o.q.lat.toFixed(1) : '?'} v${(o.car.vehicle.speed * 3.6).toFixed(0)}`);
      console.log(`  t=${clock.toFixed(1)} car${c.id} FLIP at i=${q ? q.i : '?'} lat=${q ? q.lat.toFixed(1) : '?'} v=${(v.speed * 3.6).toFixed(0)} near: ${near.join(', ') || 'none'} lastHit=${(clock - (c.lastHitT || -99)).toFixed(1)}s ago (${c.lastHitWhat || '-'})`);
    }
    if (v.upsideDown === 0) c._flip = false;
    if (v.upsideDown > 2.2) respawn(c, 'flipped');
    else if (b.position.y < -0.6) respawn(c, 'water');
    else if (!q || q.dist > track.W + 14) respawn(c, 'lost');
    else if (c.driver.needsRespawn) respawn(c, `ai:${c.driver.reason}`);
  }
  if (process.env.DEBUG_CAR && Math.abs(clock * 2 - Math.round(clock * 2)) < 1e-6 && clock > 15 && clock < 60) {
    const c = cars[Number(process.env.DEBUG_CAR)];
    c.driver.trace = true;
    const d = c.driver.debug;
    const ahead = cars.filter((o) => o !== c).map((o) => ({ o, d: (o.progress - c.progress) * L })).filter((x) => x.d > 0).sort((a, b) => a.d - b.d)[0];
    if (d) console.log(`dbg t=${clock.toFixed(1)} i=${d.k} v=${d.v.toFixed(1)} tgt=${d.myTarget.toFixed(1)}/${d.target.toFixed(1)} follow=${isFinite(d.followSpeed) ? d.followSpeed.toFixed(1) : '-'} lat=${d.lat.toFixed(1)} off=${d.offset.toFixed(1)} want=${d.wantOffset.toFixed(1)} pass=${d.pass} draft=${c.car.vehicle.draft.toFixed(2)} ahead=${ahead ? `car${ahead.o.id} d=${ahead.d.toFixed(1)} lat=${ahead.o.q.lat.toFixed(1)} v=${Math.abs(ahead.o.car.vehicle.speed).toFixed(1)}` : '-'}`);
  }
  if (clock >= nextLog) {
    nextLog += 5;
    console.log(`t=${clock.toFixed(0).padStart(3)} ` + cars.map((c) => `${c.id}:${(c.progress * 100).toFixed(1).padStart(5)}% ${String(Math.round(Math.abs(c.car.vehicle.speed) * 3.6)).padStart(3)} lat${c.q ? c.q.lat.toFixed(1) : '?'}`).join(' | '));
  }
}
console.log('summary:');
for (const c of cars) console.log(`  car${c.id} skill ${c.driver.baseSkill.toFixed(2)} progress ${(c.progress * 100).toFixed(1)}% laps ${c.laps.map((t) => t.toFixed(1)).join(',')} respawns ${c.respawns} flips ${c.flips} hits ${c.hits}`);
console.log(`sim ${total}s in ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
