// Crash test (no rendering): drives a car flat out into solid scenery (a tree trunk,
// a lamp post, a boulder, a wall, a parked car) and measures how deep the chassis
// gets into it. Nothing may pass into anything: the gate is a few centimetres.
//   node tools/crashtest.mjs            prints a table, exits 1 if anything goes deeper than the gate
import * as CANNON from 'cannon-es';
import { Physics } from '../src/engine/physics/Physics.js';
import { Vehicle, GROUP } from '../src/race/Vehicle.js';
import { carSpec } from '../src/race/config.js';

const GATE = 0.12; // metres of overlap allowed (solver slop + one step of contact settling)
const stub = { events: { emit() {}, on() {} } };

/** Signed depth of a world point inside a shape (positive = inside). */
function depthIn(o, p) {
  if (o.type === 'sphere') return o.r - Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
  const c = Math.cos(o.yaw || 0);
  const s = Math.sin(o.yaw || 0);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const ly = p.y - o.y;
  return Math.min(o.hx - Math.abs(lx), o.hy - Math.abs(ly), o.hz - Math.abs(lz));
}

/** Points filling the car's chassis boxes, in the body frame. */
function chassisPoints(spec) {
  const pts = [];
  for (const { half, offset } of [spec.body, spec.cabin, ...(spec.extra || []).map(([half, offset]) => ({ half, offset }))]) {
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 3; j++) for (let k = 0; k <= 10; k++) {
      pts.push(new CANNON.Vec3(offset[0] + half[0] * (i / 3 - 1), offset[1] + half[1] * (j / 1.5 - 1), offset[2] + half[2] * (k / 5 - 1)));
    }
  }
  return pts;
}

const OBSTACLES = {
  trunk: { type: 'box', hx: 0.28, hy: 3, hz: 0.28, material: 'wood' },
  post: { type: 'box', hx: 0.11, hy: 3.7, hz: 0.11, material: 'metal' },
  boulder: { type: 'sphere', r: 1.4, material: 'default' },
  wall: { type: 'box', hx: 6, hy: 4, hz: 0.5, material: 'default' },
  parked: { type: 'box', hx: 0.9, hy: 0.7, hz: 2.2, material: 'default' },
  rail: { type: 'box', hx: 8, hy: 0.75, hz: 0.2, material: 'metal' },
};

function run(name, speed, offset, angle, type) {
  const physics = new Physics(stub);
  physics.fixedStep = 1 / 120;
  physics.maxSubSteps = 10;
  physics.world.allowSleep = false;
  const ground = physics.addHeightfield(() => 0, 400, 100);
  ground.shapes[0].collisionFilterGroup = GROUP.terrain;
  const spec = carSpec(type);
  const O = { ...OBSTACLES[name], x: offset, z: 40, yaw: 0 };
  O.y = O.type === 'sphere' ? O.r * 0.6 : O.hy;
  const body = new CANNON.Body({ mass: 0, material: physics.materials[O.material] });
  body.position.set(O.x, O.y, O.z);
  body.addShape(O.type === 'sphere' ? new CANNON.Sphere(O.r) : new CANNON.Box(new CANNON.Vec3(O.hx, O.hy, O.hz)));
  physics.world.addBody(body);
  // Aimed so the line of travel goes through the obstacle's centre (plus the offset).
  const run = speed * 0.3 + 6;
  const car = new Vehicle(physics, { position: { x: -Math.sin(angle) * run, y: 0.75, z: 40 - Math.cos(angle) * run }, heading: angle, spec });
  car.body.velocity.set(Math.sin(angle) * speed, 0, Math.cos(angle) * speed);
  if (process.env.NOGUARD) car.guard.enabled = false;
  car.controls.throttle = 1;
  const pts = chassisPoints(spec);
  const w = new CANNON.Vec3();
  let deepest = 0;
  physics.world.addEventListener('preStep', () => car.preStep(physics.fixedStep));
  // The response must be a real one: cannon reports the impact at the speed the car arrived with.
  let impact = 0;
  car.body.addEventListener('collide', (e) => {
    if (e.body === body) impact = Math.max(impact, Math.abs(e.contact.getImpactVelocityAlongNormal()));
  });
  for (let i = 0; i < 240; i++) {
    physics.world.step(physics.fixedStep);
    for (const p of pts) {
      car.body.pointToWorldFrame(p, w);
      const d = depthIn(O, w);
      if (d > deepest) deepest = d;
    }
    if (process.env.TRACE && i % (+process.env.TRACE) === 0) console.log(i, car.vehicle.wheelInfos.map((w) => (w.isInContact ? (w.raycastResult.body === body ? 'R' : 'g') : '-')).join(''), car.body.quaternion.toEuler ? '' : '', car.body.position.x.toFixed(2), car.body.position.y.toFixed(2), car.body.position.z.toFixed(2), car.body.velocity.length().toFixed(1));
  }
  // Passed through: ended beyond it while still in line with it (a narrow bike may legitimately miss a post).
  const reach = spec.body.half[0] + (O.type === 'sphere' ? O.r : O.hx);
  const through = car.body.position.z > O.z + (O.type === 'sphere' ? O.r : O.hz) + 1 && Math.abs(car.body.position.x - O.x) < reach - 0.05;
  return { deepest, through, impact, end: car.body.position.z - O.z };
}

if (process.env.ONLY) {
  const [type, name, speed, offset, angle] = process.env.ONLY.split(',');
  console.log(run(name, Number(speed), Number(offset), Number(angle), type));
  process.exit(0);
}
let bad = 0;
const rows = [];
for (const type of ['gt', 'formula', 'moto', 'monster']) {
  let spec;
  try { spec = carSpec(type); } catch { continue; }
  if (!spec) continue;
  for (const name of Object.keys(OBSTACLES)) {
    for (const speed of [15, 35, 55, 75]) {
      for (const [offset, angle] of [[0, 0], [0.45, 0], [0, 0.25]]) {
        const r = run(name, speed, offset, angle, type);
        // Head-on, the impact cannon reports must be close to the speed the car hit at (no silent stop).
        const headOn = offset === 0 && angle === 0 && name !== 'boulder';
        const soft = headOn && r.impact < speed * 0.6;
        const fail = r.deepest > GATE || r.through || soft;
        if (fail) bad++;
        rows.push(`${fail ? 'FAIL' : ' ok '}  ${type.padEnd(8)} ${name.padEnd(8)} ${String(speed).padStart(3)} m/s  off ${offset.toFixed(2)} yaw ${angle.toFixed(2)}  depth ${r.deepest.toFixed(2)} m  impact ${r.impact.toFixed(1)} m/s${r.through ? '  PASSED THROUGH' : ''}${soft ? '  NO IMPACT' : ''}`);
      }
    }
  }
}
console.log(rows.join('\n'));
console.log(`\n${bad} of ${rows.length} crashes went deeper than ${GATE} m`);
process.exit(bad ? 1 : 0);
