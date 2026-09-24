import * as CANNON from 'cannon-es';

/**
 * Solid scenery for the physics world: boxes (buildings, parked cars,
 * poles, tree trunks, rocks) gathered into one static compound body per
 * patch of ground, so a whole city or forest costs a few hundred bodies
 * in the broadphase instead of thousands.
 */
export class Colliders {
  constructor(physics, cell = 64) {
    this.physics = physics;
    this.cell = cell;
    this.cells = new Map();
    this.bodies = [];
    this.count = 0;
  }

  /** A box centred at (x, y, z), half extents (hx, hy, hz), turned `yaw` about the vertical. */
  box(x, y, z, hx, hy, hz, yaw = 0, material = 'default') {
    const key = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)},${material}`;
    let c = this.cells.get(key);
    if (!c) {
      c = { material, shapes: [] };
      this.cells.set(key, c);
    }
    c.shapes.push({ x, y, z, hx, hy, hz, yaw });
    this.count++;
  }

  /** An upright post or trunk (a square prism the width of the circle). */
  post(x, y, z, r, h, material = 'default') {
    this.box(x, y + h / 2, z, r * 0.9, h / 2, r * 0.9, 0, material);
  }

  /** Creates the bodies and adds them to the world. */
  build() {
    const P = this.physics;
    for (const c of this.cells.values()) {
      const o = c.shapes[0];
      const body = new CANNON.Body({ mass: 0, material: P.materials[c.material] || P.materials.default });
      body.position.set(o.x, o.y, o.z);
      for (const s of c.shapes) {
        const q = new CANNON.Quaternion().setFromEuler(0, s.yaw, 0);
        body.addShape(new CANNON.Box(new CANNON.Vec3(s.hx, s.hy, s.hz)), new CANNON.Vec3(s.x - o.x, s.y - o.y, s.z - o.z), q);
      }
      P.world.addBody(body);
      this.bodies.push(body);
    }
    this.cells.clear();
    return this.bodies;
  }
}
