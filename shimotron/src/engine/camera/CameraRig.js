import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export const CAMERA_MODES = ['orbit', 'fly', 'walk', 'cinematic'];

/**
 * Camera controller with four modes:
 *  orbit — editor orbit with damping (default)
 *  fly — free flight (WASD + mouse, Q/E, Shift)
 *  walk — first person on a physics capsule with jump, head bob, footsteps
 *  cinematic — spline fly-through that loops around the island
 */
export class CameraRig {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.mode = 'orbit';
    this.orbit = new OrbitControls(this.camera, engine.canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.07;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 900;
    this.orbit.target.set(0, 4, 0);
    this.orbit.autoRotate = false;
    this.orbit.autoRotateSpeed = 0.35;
    this.yaw = 0;
    this.pitch = 0;
    this.flySpeed = 14;
    this.sensitivity = 0.0022;
    this.player = null;
    this.bob = 0;
    this.stepTimer = 0;
    this.fovBase = 58;
    this.cine = { t: 0, duration: 70, curve: null, look: null };
    this.onModeChange = null;
    this.groundHeight = null; // (x, z) => height, provided by the world
    this.trauma = 0;
    engine.events.on('shake', ({ strength = 0.5 } = {}) => {
      this.trauma = Math.min(1, this.trauma + strength);
    });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    const eng = this.engine;
    this.orbit.enabled = mode === 'orbit';
    if (prev === 'walk') this._removePlayer();
    if (mode !== 'orbit') {
      _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = _euler.y;
      this.pitch = _euler.x;
    }
    if (mode === 'orbit') {
      eng.input.exitLock();
      this.camera.getWorldDirection(_f);
      const dist = Math.max(8, Math.min(40, this.camera.position.y * 1.5));
      this.orbit.target.copy(this.camera.position).addScaledVector(_f, dist);
      if (this.groundHeight) this.orbit.target.y = Math.max(this.orbit.target.y, this.groundHeight(this.orbit.target.x, this.orbit.target.z) + 0.5);
      this.orbit.update();
    }
    if (mode === 'walk') this._spawnPlayer();
    if (mode === 'cinematic') this._buildCinematic();
    if (this.onModeChange) this.onModeChange(mode, prev);
    eng.events.emit('camera:mode', mode);
  }

  focusPoint() {
    if (this.mode === 'orbit') return this.orbit.target;
    this.camera.getWorldDirection(_f);
    return _r.copy(this.camera.position).addScaledVector(_f, 22);
  }

  /** Smoothly frames a point / object in orbit mode. */
  frame(target, distance = 8) {
    if (this.mode !== 'orbit') this.setMode('orbit');
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    this._frameAnim = {
      t: 0,
      fromT: this.orbit.target.clone(),
      toT: target.clone(),
      fromP: this.camera.position.clone(),
      toP: target.clone().addScaledVector(dir, distance),
    };
  }

  _spawnPlayer() {
    const eng = this.engine;
    const p = this.camera.position.clone();
    const gh = this.groundHeight ? this.groundHeight(p.x, p.z) : 0;
    p.y = Math.max(gh + 1.2, 1.2);
    const body = new CANNON.Body({ mass: 70, material: eng.physics.materials.player, fixedRotation: true, linearDamping: 0.0, allowSleep: false });
    body.addShape(new CANNON.Sphere(0.42), new CANNON.Vec3(0, 0, 0));
    body.addShape(new CANNON.Sphere(0.42), new CANNON.Vec3(0, 0.75, 0));
    body.position.set(p.x, p.y, p.z);
    body.collisionFilterGroup = 2; // ground probes ignore the player itself
    eng.physics.world.addBody(body);
    this.player = { body, grounded: false, eye: 1.45 };
  }

  _removePlayer() {
    if (!this.player) return;
    this.engine.physics.world.removeBody(this.player.body);
    this.player = null;
  }

  _buildCinematic() {
    const g = this.groundHeight || (() => 0);
    const pts = [
      [60, 22, 90],
      [18, 9, 38],
      [-22, 6, 18],
      [-30, 9, -22],
      [8, 14, -44],
      [70, 40, -80],
      [160, 70, 20],
      [120, 30, 150],
      [40, 12, 120],
    ].map(([x, y, z]) => new THREE.Vector3(x, Math.max(y, g(x, z) + 6), z));
    const looks = [
      [0, 4, 0],
      [0, 5, 0],
      [0, 5, 4],
      [0, 4, 0],
      [-10, 6, 0],
      [0, 10, -150],
      [0, 4, 0],
      [0, 2, 250],
      [0, 5, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.cine.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.cine.look = new THREE.CatmullRomCurve3(looks, true, 'centripetal');
    this.cine.t = 0;
  }

  update(dt) {
    const eng = this.engine;
    const input = eng.input;
    const cam = this.camera;

    if (this._frameAnim) {
      const a = this._frameAnim;
      a.t = Math.min(1, a.t + dt * 2.2);
      const k = 1 - Math.pow(1 - a.t, 3);
      this.orbit.target.lerpVectors(a.fromT, a.toT, k);
      cam.position.lerpVectors(a.fromP, a.toP, k);
      if (a.t >= 1) this._frameAnim = null;
    }

    if (this.mode === 'orbit') {
      this.orbit.update(dt);
      // Keep the camera above ground.
      if (this.groundHeight) {
        const gh = this.groundHeight(cam.position.x, cam.position.z);
        if (cam.position.y < gh + 0.8) cam.position.y = gh + 0.8;
      }
    } else if (this.mode === 'fly' || this.mode === 'walk') {
      const look = input.lookDelta(dt);
      const allowLook = input.locked || input.mouse.buttons & 4 || input.mouse.buttons & 2 || input.touch.active || input.gamepad;
      if (allowLook) {
        this.yaw -= look.dx * this.sensitivity;
        this.pitch -= look.dy * this.sensitivity;
        this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
      }
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(_euler);
      const mv = input.moveVector();
      if (this.mode === 'fly') this._fly(dt, mv);
      else this._walk(dt, mv);
    } else if (this.mode === 'cinematic') {
      const c = this.cine;
      c.t = (c.t + dt / c.duration) % 1;
      cam.position.copy(c.curve.getPointAt(c.t));
      const target = c.look.getPointAt((c.t + 0.01) % 1);
      const m = new THREE.Matrix4().lookAt(cam.position, target, _up);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, 1 - Math.exp(-dt * 3));
    }

    // Trauma-based camera shake (rotation only, so no controller drifts).
    if (this.trauma > 0.001) {
      const k = this.trauma * this.trauma * (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1);
      const t = eng.time.elapsed * 40;
      cam.rotateX(Math.sin(t * 1.1) * 0.03 * k);
      cam.rotateY(Math.sin(t * 0.9 + 1.7) * 0.03 * k);
      cam.rotateZ(Math.sin(t * 1.3 + 3.1) * 0.02 * k);
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }

    // FOV kick when sprinting in walk mode.
    const sprint = this.mode === 'walk' && input.isDown('ShiftLeft') && input.moveVector().y > 0.2;
    const fovT = sprint ? this.fovBase + 6 : this.fovBase;
    if (Math.abs(cam.fov - fovT) > 0.01) {
      cam.fov += (fovT - cam.fov) * (1 - Math.exp(-dt * 6));
      cam.updateProjectionMatrix();
    }
  }

  _fly(dt, mv) {
    const input = this.engine.input;
    const cam = this.camera;
    let speed = this.flySpeed * (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 4 : 1);
    if (input.mouse.wheel) this.flySpeed = Math.max(2, Math.min(120, this.flySpeed * (input.mouse.wheel > 0 ? 0.85 : 1.18)));
    cam.getWorldDirection(_f);
    _r.crossVectors(_f, _up).normalize();
    const vy = input.axis('KeyQ', 'KeyE') + (input.isDown('Space') ? 1 : 0) - (input.isDown('ControlLeft') ? 1 : 0);
    cam.position.addScaledVector(_f, mv.y * speed * dt);
    cam.position.addScaledVector(_r, mv.x * speed * dt);
    cam.position.y += vy * speed * dt;
    if (this.groundHeight) {
      const gh = this.groundHeight(cam.position.x, cam.position.z);
      if (cam.position.y < gh + 0.6) cam.position.y = gh + 0.6;
    }
  }

  _walk(dt, mv) {
    const eng = this.engine;
    const input = eng.input;
    const cam = this.camera;
    const pl = this.player;
    if (!pl) return;
    const b = pl.body;
    // Ground probe.
    const from = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
    const hit = eng.physics.raycast(from, from.clone().add(new THREE.Vector3(0, -0.62, 0)), { mask: 1 });
    pl.grounded = !!hit;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? 8.5 : 4.6;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wantX = (_f.x * mv.y + _r.x * mv.x) * speed;
    const wantZ = (_f.z * mv.y + _r.z * mv.x) * speed;
    const accel = pl.grounded ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    b.velocity.x += (wantX - b.velocity.x) * k;
    b.velocity.z += (wantZ - b.velocity.z) * k;
    if (pl.grounded && (input.wasPressed('Space') || input.touch.jump) && b.velocity.y < 1) b.velocity.y = 5.6;
    // Swimming: gentle float at the surface.
    if (b.position.y < -0.6) {
      b.velocity.y += (9.82 * 1.08) * dt;
      b.velocity.y *= 1 - 1.5 * dt;
    }
    const hs = Math.hypot(b.velocity.x, b.velocity.z);
    if (pl.grounded && hs > 0.5) {
      this.bob += dt * hs * 1.9;
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.3;
        eng.events.emit('footstep', { position: from, speed: hs });
      }
    } else this.bob *= 1 - Math.min(1, dt * 6);
    const bobY = Math.sin(this.bob * 2) * 0.045 * Math.min(1, hs / 4);
    const bobX = Math.cos(this.bob) * 0.03 * Math.min(1, hs / 4);
    cam.position.set(b.position.x, b.position.y + pl.eye + bobY, b.position.z);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.addScaledVector(_r, bobX);
  }
}
