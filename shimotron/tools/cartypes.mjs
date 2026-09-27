// Per car type: 0-100 / 0-200 km/h, top speed and steady-state cornering grip on a flat plane.
import * as CANNON from 'cannon-es';
import { Vehicle } from '../src/race/Vehicle.js';
import { CAR_TYPES, carSpec } from '../src/race/config.js';

function world(spec, step = 1 / 120) {
  const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  w.broadphase = new CANNON.SAPBroadphase(w);
  const materials = { ground: new CANNON.Material('ground'), metal: new CANNON.Material('metal'), wood: new CANNON.Material('wood'), default: w.defaultMaterial };
  const g = new CANNON.Body({ mass: 0, material: materials.ground });
  // Like the race: wheels see an analytic road at y = 0, the terrain (skid spheres only) is 0.26 m lower.
  const plane = new CANNON.Plane();
  plane.collisionFilterGroup = 8;
  g.addShape(plane);
  g.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  g.position.y = -0.26;
  w.addBody(g);
  const road = new CANNON.Body({ mass: 0 });
  const ground = (from, to, r) => {
    if (to.y > 0 || from.y < 0) return true;
    const t = from.y / (from.y - to.y);
    r.hitPointWorld.set(from.x + (to.x - from.x) * t, 0, from.z + (to.z - from.z) * t);
    r.hitNormalWorld.set(0, 1, 0);
    r.distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * t;
    r.body = road;
    r.hasHit = true;
    return true;
  };
  const car = new Vehicle({ world: w, materials }, { position: { x: 0, y: 1, z: 0 }, spec, ground });
  w.addEventListener('preStep', () => car.preStep(step));
  return { car, run: (t, fn) => { for (let i = 0, n = Math.round(t / step); i < n; i++) { fn && fn(i * step); w.step(step); } } };
}
for (const t of CAR_TYPES) {
  const spec = carSpec(t.id);
  const a = world(spec);
  a.run(1.5);
  let t100 = null, t200 = null;
  a.car.controls.throttle = 1;
  a.run(40, (tt) => { if (!t100 && a.car.speed > 27.78) t100 = tt; if (!t200 && a.car.speed > 55.56) t200 = tt; });
  const vmax = a.car.speed * 3.6;
  const lat = [];
  for (const v of [20, 35]) {
    const b = world(spec);
    b.run(1);
    b.car.body.velocity.set(0, 0, v);
    b.car.controls.steer = 1;
    let acc = 0, n = 0;
    b.run(5, (tt) => { const e = v - b.car.speed; b.car.controls.throttle = Math.max(0, Math.min(1, e * 0.8 + 0.3)); if (tt > 2.5) { acc += Math.abs(b.car.body.angularVelocity.y * Math.hypot(b.car.body.velocity.x, b.car.body.velocity.z)); n++; } });
    lat.push((acc / n / 9.82).toFixed(2));
  }
  console.log(`${t.id.padEnd(8)} 0-100 ${t100?.toFixed(2)}s  0-200 ${t200 ? t200.toFixed(1) + 's' : '—'}  top ${vmax.toFixed(0)} km/h  lat g @72/126 km/h ${lat.join(' / ')}  settle y=${a.car.body.position.y.toFixed(2)}`);
}
