let nextId = 1;

/**
 * Behaviour attached to an Entity. Override any of the hooks:
 * onAttach(engine), update(dt, engine), fixedUpdate(dt, engine), onDetach(engine).
 */
export class Component {
  constructor() {
    this.entity = null;
    this.enabled = true;
  }
}

/**
 * A scene object: a Three.js Object3D, an optional cannon-es body, and
 * a list of components. The editor lists, selects and serializes these.
 */
export class Entity {
  constructor(name, object3D, options = {}) {
    this.id = nextId++;
    this.name = name;
    this.object3D = object3D;
    this.body = null;
    this.components = [];
    this.engine = null;
    this.icon = options.icon || 'mesh';
    this.kind = options.kind || null; // spawn kind, used by the serializer
    this.params = options.params || {}; // spawn parameters, used by the serializer
    this.selectable = options.selectable !== false;
    this.serializable = options.serializable === true;
    this.locked = options.locked === true; // cannot be deleted from the editor
    object3D.userData.entity = this;
    object3D.traverse((o) => {
      o.userData.entity = this;
    });
  }

  addComponent(component) {
    component.entity = this;
    this.components.push(component);
    if (this.engine && component.onAttach) component.onAttach(this.engine);
    return component;
  }

  getComponent(Type) {
    return this.components.find((c) => c instanceof Type) || null;
  }

  removeComponent(component) {
    const i = this.components.indexOf(component);
    if (i < 0) return;
    this.components.splice(i, 1);
    if (this.engine && component.onDetach) component.onDetach(this.engine);
  }

  /** Teleport both the visual and the physics body; zeroes velocities. */
  setPosition(x, y, z) {
    this.object3D.position.set(x, y, z);
    this.syncBodyFromObject();
  }

  syncBodyFromObject() {
    if (!this.body) return;
    const o = this.object3D;
    o.updateMatrixWorld();
    this.body.position.set(o.position.x, o.position.y, o.position.z);
    this.body.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    this.body.previousPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.wakeUp();
  }
}
