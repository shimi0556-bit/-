import * as CANNON from 'cannon-es';

const REACH = 7; // the widest craft's own radius: shapes are listed in every cell a craft touching them can be in

/**
 * Solid scenery: buildings, parked cars, poles, tree trunks, rocks.
 *
 * For cars they become boxes and spheres gathered into one static compound
 * body per patch of ground, so a whole city or forest costs a few hundred
 * bodies in the broadphase instead of thousands. For the arcade craft
 * (planes, gliders, boats) the same things are kept as simple shapes in a
 * grid — upright cylinders, spheres and turned boxes — found with near().
 */
export class Colliders {
  constructor(physics, cell = 64) {
    this.physics = physics;
    this.cell = cell;
    this.cells = new Map();
    this.bodies = [];
    this.count = 0;
    this.gridCell = 40;
    this.grid = new Map();
  }

  _shape(x, y, z, shape, material) {
    const key = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)},${material}`;
    let c = this.cells.get(key);
    if (!c) {
      c = { material, shapes: [] };
      this.cells.set(key, c);
    }
    c.shapes.push({ x, y, z, ...shape });
    this.count++;
  }

  /** For the craft: registers a shape in every grid cell its footprint `reach` touches. */
  _craft(o, reach) {
    const G = this.gridCell;
    for (let i = Math.floor((o.x - reach) / G); i <= Math.floor((o.x + reach) / G); i++) {
      for (let j = Math.floor((o.z - reach) / G); j <= Math.floor((o.z + reach) / G); j++) {
        const key = `${i},${j}`;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(o);
      }
    }
  }

  /** A box centred at (x, y, z), half extents (hx, hy, hz), turned `yaw` about the vertical. */
  box(x, y, z, hx, hy, hz, yaw = 0, material = 'default', { car = true, craft = true } = {}) {
    if (car) this._shape(x, y, z, { type: 'box', hx, hy, hz, yaw }, material);
    if (craft) this._craft({ box: true, x, y, z, hx, hy, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw) }, Math.hypot(hx, hz) + REACH);
  }

  /** An upright post (a square prism the width of the circle). */
  post(x, y, z, r, h, material = 'default') {
    this._shape(x, y + h / 2, z, { type: 'box', hx: r * 0.9, hy: h / 2, hz: r * 0.9, yaw: 0 }, material);
    this._craft({ x, z, y0: y, y1: y + h, r }, r + REACH);
  }

  /**
   * A tree: its trunk (radius r, height h) stops a car; a craft meets the
   * whole tree, a cylinder of the crown's radius up to the top.
   */
  tree(x, y, z, r, h, crownR, top) {
    this._shape(x, y + h / 2, z, { type: 'box', hx: r * 0.8, hy: h / 2, hz: r * 0.8, yaw: 0 }, 'wood');
    this._craft({ x, z, y0: y, y1: y + top, r: crownR }, crownR + REACH);
  }

  /** A boulder. */
  sphere(x, y, z, r, material = 'default') {
    this._shape(x, y, z, { type: 'sphere', r }, material);
    this._craft({ x, y, z, r }, r + REACH);
  }

  /** Craft-only shapes near (x, z) (within one grid cell's reach). */
  near(x, z) {
    return this.grid.get(`${Math.floor(x / this.gridCell)},${Math.floor(z / this.gridCell)}`) || null;
  }

  /** Creates the car bodies and adds them to the world. */
  build() {
    const P = this.physics;
    for (const c of this.cells.values()) {
      const o = c.shapes[0];
      const body = new CANNON.Body({ mass: 0, material: P.materials[c.material] || P.materials.default });
      body.position.set(o.x, o.y, o.z);
      for (const s of c.shapes) {
        const off = new CANNON.Vec3(s.x - o.x, s.y - o.y, s.z - o.z);
        if (s.type === 'sphere') body.addShape(new CANNON.Sphere(s.r), off);
        else body.addShape(new CANNON.Box(new CANNON.Vec3(s.hx, s.hy, s.hz)), off, new CANNON.Quaternion().setFromEuler(0, s.yaw, 0));
      }
      P.world.addBody(body);
      this.bodies.push(body);
    }
    this.cells.clear();
    return this.bodies;
  }
}
