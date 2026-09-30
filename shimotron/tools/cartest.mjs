// Vehicle calibration: 0-100, top speed, braking and skidpad grip on a flat plane (node tools/cartest.mjs).
import * as CANNON from 'cannon-es';
import { Vehicle } from '../src/race/Vehicle.js';
import { CAR } from '../src/race/config.js';

function makeWorld(step) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  const materials = { ground: new CANNON.Material('ground'), metal: new CANNON.Material('metal'), wood: new CANNON.Material('wood'), default: world.defaultMaterial };
  const ground = new CANNON.Body({ mass: 0, material: materials.ground });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const physics = { world, materials };
  const cars = [];
  world.addEventListener('preStep', () => { for (const c of cars) c.preStep(step); });
  const car = new Vehicle(physics, { position: { x: 0, y: 0.7, z: 0 } });
  cars.push(car);
  return { world, car, run(t, fn) { const n = Math.round(t / step); for (let i = 0; i < n; i++) { fn && fn(i * step); world.step(step); } } };
}
const kmh = (v) => (v * 3.6).toFixed(1);
for (const step of [1 / 60, 1 / 120]) {
  const { world, car, run } = makeWorld(step);
  run(1.5); // settle
  const y0 = car.body.position.y;
  let t100 = null, t200 = null, t = 0;
  car.controls.throttle = 1;
  run(40, (tt) => { t = tt; if (!t100 && car.speed > 27.78) t100 = tt; if (!t200 && car.speed > 55.5) t200 = tt; });
  const vmax = car.speed;
  // brake from current
  car.controls.throttle = 0; car.controls.brake = 1;
  // first get to 100 km/h: set velocity directly
  car.body.velocity.set(0, 0, 27.78);
  const z0 = car.body.position.z;
  let stopT = 0;
  run(8, (tt) => { if (!stopT && car.speed < 0.3) stopT = tt; });
  const brakeDist = car.body.position.z - z0;
  console.log(`step 1/${Math.round(1 / step)} settle y=${y0.toFixed(3)} 0-100 ${t100?.toFixed(2)}s 0-200 ${t200?.toFixed(2)}s vmax ${kmh(vmax)} km/h brake100 ${brakeDist.toFixed(1)} m in ${stopT.toFixed(2)}s`);
}
// Skidpad: find max lateral acceleration at several speeds with full steering held at a steer fraction.
for (const target of [15, 25, 35, 45]) {
  const { car, run } = makeWorld(1 / 120);
  run(1);
  car.body.velocity.set(0, 0, target);
  let lat = 0, n = 0, flips = 0, maxRoll = 0;
  const speedCtl = () => { const e = target - car.speed; car.controls.throttle = Math.max(0, Math.min(1, e * 0.8 + 0.3)); car.controls.brake = e < -2 ? 0.3 : 0; };
  for (const steer of [0.25, 0.5, 0.75, 1]) {
    lat = 0; n = 0;
    car.controls.steer = steer;
    run(5, (tt) => {
      speedCtl();
      if (tt > 2.5) {
        const b = car.body; const av = b.angularVelocity.y; lat += Math.abs(av * Math.hypot(b.velocity.x, b.velocity.z)); n++;
      }
      const up = car.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)); maxRoll = Math.max(maxRoll, Math.acos(Math.min(1, up.y)));
    });
    console.log(`v=${target} steer=${steer} lim=${car.steerLimit(target).toFixed(3)} speed=${car.speed.toFixed(1)} latG=${(lat / n / 9.82).toFixed(2)} slide=${car.lateralSpeed().toFixed(2)} slip=${car.slip.map((s) => s.toFixed(2)).join(',')} maxTilt=${(maxRoll * 57.3).toFixed(1)}°`);
  }
}
// Handbrake turn at 25 m/s: yaw change and speed loss over 1.2 s.
{
  const { car, run } = makeWorld(1 / 120);
  run(1);
  car.body.velocity.set(0, 0, 25);
  car.controls.throttle = 0.3;
  car.controls.steer = 1;
  car.controls.handbrake = true;
  let maxLat = 0;
  run(0.5, () => { maxLat = Math.max(maxLat, Math.abs(car.lateralSpeed())); });
  const q = car.body.quaternion; const f = q.vmult(new CANNON.Vec3(0, 0, 1));
  console.log(`handbrake: heading change ${(Math.atan2(f.x, f.z) * 57.3).toFixed(0)}° speed ${car.speed.toFixed(1)} maxSlide ${maxLat.toFixed(1)} m/s slip ${car.slip.map((s) => s.toFixed(2)).join(',')}`);
  car.controls.handbrake = false; car.controls.steer = 0.3; car.controls.throttle = 1;
  run(2);
  const f2 = car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
  console.log(`  recovered: heading ${(Math.atan2(f2.x, f2.z) * 57.3).toFixed(0)}° slide ${car.lateralSpeed().toFixed(2)} speed ${car.speed.toFixed(1)}`);
}
