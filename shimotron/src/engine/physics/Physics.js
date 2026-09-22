import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Rigid-body physics on cannon-es: fixed 60 Hz stepping with render
 * interpolation, sleeping, shared contact materials, impact events,
 * ray casts and heightfield terrain.
 */
export class Physics {
  constructor(engine) {
    this.engine = engine;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 12;
    this.world.solver.tolerance = 0.0005;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0.15;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;

    this.materials = {
      default: this.world.defaultMaterial,
      ground: new CANNON.Material('ground'),
      rubber: new CANNON.Material('rubber'),
      wood: new CANNON.Material('wood'),
      metal: new CANNON.Material('metal'),
      player: new CANNON.Material('player'),
    };
    const pair = (a, b, friction, restitution) =>
      this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials[a], this.materials[b], { friction, restitution }));
    pair('ground', 'rubber', 0.6, 0.72);
    pair('rubber', 'rubber', 0.5, 0.8);
    pair('ground', 'wood', 0.55, 0.12);
    pair('wood', 'wood', 0.5, 0.08);
    pair('ground', 'metal', 0.35, 0.25);
    pair('metal', 'wood', 0.35, 0.18);
    pair('player', 'ground', 0.0, 0.0);
    pair('player', 'wood', 0.0, 0.0);
    pair('player', 'default', 0.0, 0.0);
    pair('player', 'metal', 0.0, 0.0);
    pair('player', 'rubber', 0.0, 0.2);

    this.fixedStep = 1 / 60;
    this.enabled = true;
    this.timeScale = 1;
    this.bodies = new Set();
  }

  /**
   * Builds a body for an entity. desc: { mass, shape: 'box'|'sphere'|'cylinder'|'auto',
   * size (Vector3 or number), material, linearDamping, angularDamping, fixedRotation, offset }
   */
  addBody(entity, desc = {}) {
    const mass = desc.mass ?? 1;
    const body = new CANNON.Body({
      mass,
      material: this.materials[desc.material || 'default'],
      linearDamping: desc.linearDamping ?? 0.04,
      angularDamping: desc.angularDamping ?? 0.08,
      fixedRotation: desc.fixedRotation || false,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.8,
    });
    const shapes = desc.shapes || [this.makeShape(entity.object3D, desc)];
    for (const s of shapes) {
      if (s.shape) body.addShape(s.shape, s.offset ? new CANNON.Vec3(s.offset.x, s.offset.y, s.offset.z) : undefined);
      else body.addShape(s);
    }
    if (desc.kinematic) body.type = CANNON.Body.KINEMATIC;
    const o = entity.object3D;
    body.position.set(o.position.x, o.position.y, o.position.z);
    body.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
    body.interpolatedPosition.copy(body.position);
    body.interpolatedQuaternion.copy(body.quaternion);
    body.userData = { entity };
    entity.body = body;
    entity.bodyDesc = desc;

    if (mass > 0) {
      body.addEventListener('collide', (e) => {
        const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (speed < 1.2) return;
        const c = e.contact;
        const bi = c.bi;
        const p = new THREE.Vector3(bi.position.x + c.ri.x, bi.position.y + c.ri.y, bi.position.z + c.ri.z);
        this.engine.events.emit('impact', { entity, other: e.body.userData?.entity || null, speed, point: p, material: desc.material || 'default' });
      });
    }
    this.world.addBody(body);
    this.bodies.add(body);
    return body;
  }

  makeShape(object3D, desc) {
    let kind = desc.shape || 'auto';
    const s = desc.size;
    if (s !== undefined) {
      if (kind === 'sphere') return new CANNON.Sphere(typeof s === 'number' ? s : s.x);
      if (kind === 'box') return new CANNON.Box(new CANNON.Vec3(s.x / 2, s.y / 2, s.z / 2));
      if (kind === 'cylinder') return new CANNON.Cylinder(s.x, s.x, s.y, 16);
    }
    // Derive from local-space bounds (object rotation removed, scale kept).
    const q = object3D.quaternion.clone();
    const p = object3D.position.clone();
    object3D.quaternion.identity();
    object3D.position.set(0, 0, 0);
    object3D.updateMatrixWorld(true);
    _box.setFromObject(object3D);
    object3D.quaternion.copy(q);
    object3D.position.copy(p);
    object3D.updateMatrixWorld(true);
    _box.getSize(_size);
    _box.getCenter(_center);
    if (kind === 'auto') kind = 'box';
    let shape;
    if (kind === 'sphere') shape = new CANNON.Sphere(Math.max(_size.x, _size.y, _size.z) / 2);
    else if (kind === 'cylinder') shape = new CANNON.Cylinder(_size.x / 2, _size.x / 2, _size.y, 16);
    else shape = new CANNON.Box(new CANNON.Vec3(_size.x / 2, _size.y / 2, _size.z / 2));
    if (_center.lengthSq() > 1e-6) return { shape, offset: _center.clone() };
    return shape;
  }

  /**
   * Static heightfield. heightAt(x, z) samples the terrain; the grid covers
   * [-size/2, size/2] on both axes with `segments` cells.
   */
  addHeightfield(heightAt, size, segments) {
    const n = segments + 1;
    const es = size / segments;
    const half = size / 2;
    const data = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(heightAt(-half + i * es, half - j * es));
      data.push(row);
    }
    const shape = new CANNON.Heightfield(data, { elementSize: es });
    const body = new CANNON.Body({ mass: 0, material: this.materials.ground });
    body.addShape(shape);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.set(-half, 0, half);
    this.world.addBody(body);
    return body;
  }

  addStaticBox(center, size, rotationY = 0, material = 'ground') {
    const body = new CANNON.Body({ mass: 0, material: this.materials[material] });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    body.position.set(center.x, center.y, center.z);
    body.quaternion.setFromEuler(0, rotationY, 0);
    this.world.addBody(body);
    return body;
  }

  addStaticCylinder(center, radius, height, material = 'ground') {
    const body = new CANNON.Body({ mass: 0, material: this.materials[material] });
    body.addShape(new CANNON.Cylinder(radius, radius, height, 20));
    body.position.set(center.x, center.y, center.z);
    this.world.addBody(body);
    return body;
  }

  addStaticSphere(center, radius, material = 'ground') {
    const body = new CANNON.Body({ mass: 0, material: this.materials[material] });
    body.addShape(new CANNON.Sphere(radius));
    body.position.set(center.x, center.y, center.z);
    this.world.addBody(body);
    return body;
  }

  /** Rebuilds an entity's body from its current (scaled) bounds, keeping mass and material. */
  rebuildBody(entity) {
    if (!entity.body || !entity.bodyDesc) return;
    const old = entity.body;
    const desc = { ...entity.bodyDesc, size: undefined, shapes: undefined };
    if (desc.shape === 'sphere' || desc.shape === 'cylinder' || desc.shape === 'box') {
      // keep the primitive type, derive dimensions from the new bounds
    } else desc.shape = 'box';
    const vel = old.velocity.clone();
    this.removeBody(old);
    const body = this.addBody(entity, desc);
    body.velocity.copy(vel);
    entity.bodyDesc = { ...entity.bodyDesc };
    return body;
  }

  removeBody(body) {
    if (!body) return;
    this.world.removeBody(body);
    this.bodies.delete(body);
  }

  step(dt) {
    if (!this.enabled) return;
    this.world.step(this.fixedStep, dt * this.timeScale, 5);
  }

  /** Copies interpolated body transforms onto the entities' visuals. */
  syncEntities(entities) {
    for (const e of entities) {
      const b = e.body;
      if (!b || b.mass === 0 || e.dragging) continue;
      const o = e.object3D;
      o.position.set(b.interpolatedPosition.x, b.interpolatedPosition.y, b.interpolatedPosition.z);
      o.quaternion.set(b.interpolatedQuaternion.x, b.interpolatedQuaternion.y, b.interpolatedQuaternion.z, b.interpolatedQuaternion.w);
    }
  }

  raycast(from, to, options = {}) {
    const result = new CANNON.RaycastResult();
    const hit = this.world.raycastClosest(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z),
      { skipBackfaces: true, collisionFilterMask: options.mask ?? -1 },
      result,
    );
    if (!hit) return null;
    return {
      body: result.body,
      entity: result.body?.userData?.entity || null,
      point: new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z),
      normal: new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z),
      distance: result.distance,
    };
  }

  /** Radial impulse on every dynamic body within radius. */
  explode(center, radius, strength) {
    for (const b of this.bodies) {
      if (b.mass === 0) continue;
      const dx = b.position.x - center.x;
      const dy = b.position.y - center.y;
      const dz = b.position.z - center.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius || d < 1e-4) continue;
      const f = (1 - d / radius) * strength;
      b.wakeUp();
      b.applyImpulse(new CANNON.Vec3((dx / d) * f, (dy / d) * f + f * 0.5, (dz / d) * f));
    }
  }
}

export { CANNON };
