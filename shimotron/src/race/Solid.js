import * as CANNON from 'cannon-es';

/**
 * Keeps a car's chassis out of solid scenery.
 *
 * cannon resolves contacts with penalty-like impulses and no continuous
 * collision detection, so at racing speed a car moves ~0.6 m per 120 Hz step
 * and lands well inside a tree trunk, a lamp post or a boulder before the
 * solver ever sees it. A box overlapped past the middle of a thin post is then
 * pushed out the far side: the car "drives into" the object it hit.
 *
 * Two passes per step, both on the chassis boxes against static boxes and
 * spheres (scenery, rails, gantries, parked and kinematic cars):
 *  - sweep(): just before cannon integrates, finds the first moment in the
 *    step the chassis would touch something and shortens this step's motion
 *    to end there. The velocity is put back right after the integration, so
 *    on the next step cannon meets a touching contact at full closing speed
 *    and answers with its normal response: bounce, friction, a collide event
 *    with the true impact speed (sparks, sound, camera shake, damage).
 *  - resolve(): after the step, pushes the chassis out of anything it still
 *    overlaps (along the shallowest axis) and removes the velocity still
 *    heading in. With the sweep in front of it the overlap is always shallow,
 *    so the shallowest axis is the side the car came from.
 */

const SLOP = 0.015; // overlap left for cannon to keep the contact alive (m)
const DEEP = 0.05; // overlap past which the guard pushes the chassis out itself (m)
const _aabb = new CANNON.AABB();
const _hits = [];
const _q = new CANNON.Quaternion();
const _p = new CANNON.Vec3();
const _a = [new CANNON.Vec3(), new CANNON.Vec3(), new CANNON.Vec3()];
const _b = [new CANNON.Vec3(), new CANNON.Vec3(), new CANNON.Vec3()];
const _L = new CANNON.Vec3();
const _d = new CANNON.Vec3();
const AX = [new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, 0, 1)];

/** Box A (centre, axes, half) vs box B: overlap depth along the shallowest axis, or -1 if apart. Normal points from B to A. */
function boxBox(ca, aa, ha, cb, ab, hb, out) {
  _d.set(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z);
  let best = Infinity;
  const test = (L) => {
    const len = Math.sqrt(L.x * L.x + L.y * L.y + L.z * L.z);
    if (len < 1e-6) return true;
    const lx = L.x / len;
    const ly = L.y / len;
    const lz = L.z / len;
    let ra = 0;
    let rb = 0;
    for (let i = 0; i < 3; i++) {
      ra += ha[i] * Math.abs(aa[i].x * lx + aa[i].y * ly + aa[i].z * lz);
      rb += hb[i] * Math.abs(ab[i].x * lx + ab[i].y * ly + ab[i].z * lz);
    }
    const dist = _d.x * lx + _d.y * ly + _d.z * lz;
    const o = ra + rb - Math.abs(dist);
    if (o < 0) return false;
    if (o < best) {
      best = o;
      const s = dist < 0 ? -1 : 1;
      out.set(lx * s, ly * s, lz * s);
    }
    return true;
  };
  for (let i = 0; i < 3; i++) if (!test(aa[i]) || !test(ab[i])) return -1;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      aa[i].cross(ab[j], _L);
      if (!test(_L)) return -1;
    }
  }
  return best;
}

/** Box A vs sphere: overlap depth or -1. Normal points from the sphere to the box. */
function boxSphere(ca, aa, ha, cs, r, out) {
  _d.set(cs.x - ca.x, cs.y - ca.y, cs.z - ca.z);
  // Closest point on the box to the centre, in box coordinates.
  let inside = true;
  let px = ca.x;
  let py = ca.y;
  let pz = ca.z;
  let face = Infinity;
  let faceAxis = 0;
  let faceSign = 1;
  for (let i = 0; i < 3; i++) {
    const t = _d.x * aa[i].x + _d.y * aa[i].y + _d.z * aa[i].z;
    const c = t > ha[i] ? ha[i] : t < -ha[i] ? -ha[i] : t;
    if (c !== t) inside = false;
    const f = ha[i] - Math.abs(t);
    if (f < face) {
      face = f;
      faceAxis = i;
      faceSign = t < 0 ? -1 : 1;
    }
    px += aa[i].x * c;
    py += aa[i].y * c;
    pz += aa[i].z * c;
  }
  if (inside) {
    // Centre inside the box: out through the nearest face.
    const n = aa[faceAxis];
    out.set(-n.x * faceSign, -n.y * faceSign, -n.z * faceSign);
    return r + face;
  }
  const dx = px - cs.x;
  const dy = py - cs.y;
  const dz = pz - cs.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist >= r) return -1;
  out.set(dx / dist, dy / dist, dz / dist);
  return r - dist;
}

/** Whether a body takes part: static or kinematic scenery made of boxes and spheres (not the ground, not other cars). */
function solid(body) {
  if (body.type === CANNON.Body.DYNAMIC || body.collisionResponse === false) return false;
  if (body.userData && body.userData.soft) return false;
  return true;
}

export class SolidGuard {
  /**
   * body: the chassis body; boxes: [{ half: [x, y, z], offset: [x, y, z] }] in the body frame.
   * Only shapes that collide with the chassis boxes (collision filters) are considered.
   */
  constructor(world, body, boxes) {
    this.world = world;
    this.body = body;
    this.boxes = boxes.map((b) => ({ half: b.half, offset: new CANNON.Vec3(...b.offset), c: new CANNON.Vec3() }));
    this.reach = Math.max(...boxes.map((b) => Math.hypot(...b.half) + Math.hypot(...b.offset)));
    this.saved = null; // velocity to restore after the integration
    this.normal = new CANNON.Vec3();
    this.hit = null; // last sweep hit: { speed, normal, body }
    this.enabled = true;
  }

  /** Static shapes near the chassis, swept by `move` (m). Fills _hits with { c, axes, half | r }. */
  _gather(move) {
    const b = this.body;
    const R = this.reach + 0.1;
    const lo = _aabb.lowerBound;
    const hi = _aabb.upperBound;
    lo.set(b.position.x - R + Math.min(0, move.x), b.position.y - R + Math.min(0, move.y), b.position.z - R + Math.min(0, move.z));
    hi.set(b.position.x + R + Math.max(0, move.x), b.position.y + R + Math.max(0, move.y), b.position.z + R + Math.max(0, move.z));
    const bodies = this.world.broadphase.aabbQuery(this.world, _aabb, []);
    _hits.length = 0;
    const group = b.collisionFilterGroup;
    for (const o of bodies) {
      if (o === b || !solid(o)) continue;
      if (!(o.collisionFilterMask & group) || !(b.collisionFilterMask & o.collisionFilterGroup)) continue;
      for (let i = 0; i < o.shapes.length; i++) {
        const s = o.shapes[i];
        if (!(s.collisionFilterMask & group) || s.collisionResponse === false) continue;
        const isBox = s.type === CANNON.Shape.types.BOX;
        if (!isBox && s.type !== CANNON.Shape.types.SPHERE) continue;
        const c = new CANNON.Vec3();
        o.quaternion.vmult(o.shapeOffsets[i], c);
        c.vadd(o.position, c);
        const ext = isBox ? Math.sqrt(s.halfExtents.x ** 2 + s.halfExtents.y ** 2 + s.halfExtents.z ** 2) : s.radius;
        // Cheap reject: the shape's bounding sphere against the swept box.
        if (c.x + ext < lo.x || c.x - ext > hi.x || c.y + ext < lo.y || c.y - ext > hi.y || c.z + ext < lo.z || c.z - ext > hi.z) continue;
        if (isBox) {
          o.quaternion.mult(o.shapeOrientations[i], _q);
          const axes = AX.map((a) => _q.vmult(a));
          _hits.push({ c, axes, half: [s.halfExtents.x, s.halfExtents.y, s.halfExtents.z], body: o });
        } else _hits.push({ c, r: s.radius, body: o });
      }
    }
    return _hits;
  }

  /** Chassis boxes placed with the body moved by t·move. */
  _pose(move, t) {
    const b = this.body;
    for (let i = 0; i < 3; i++) b.quaternion.vmult(AX[i], _a[i]);
    for (const x of this.boxes) {
      b.quaternion.vmult(x.offset, x.c);
      x.c.x += b.position.x + move.x * t;
      x.c.y += b.position.y + move.y * t;
      x.c.z += b.position.z + move.z * t;
    }
  }

  /** Deepest overlap of the chassis (moved by t·move) with any gathered shape; sets this.normal. */
  _depth(hits, move, t) {
    this._pose(move, t);
    let deepest = -1;
    for (const x of this.boxes) {
      for (const h of hits) {
        const d = h.half ? boxBox(x.c, _a, x.half, h.c, h.axes, h.half, _p) : boxSphere(x.c, _a, x.half, h.c, h.r, _p);
        if (d > deepest) {
          deepest = d;
          this.normal.copy(_p);
          this.hitBox = x;
          this.hitShape = h;
        }
      }
    }
    return deepest;
  }

  /** Where the chassis meets the hit shape (world), for the pose last tested: the box corners deepest along -normal, averaged. */
  _contactPoint(out) {
    const n = this.normal;
    const h = this.hitShape;
    if (!h.half) return out.set(h.c.x + n.x * h.r, h.c.y + n.y * h.r, h.c.z + n.z * h.r);
    const x = this.hitBox;
    let min = Infinity;
    const corners = [];
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? 1 : -1;
      const sy = i & 2 ? 1 : -1;
      const sz = i & 4 ? 1 : -1;
      const px = x.c.x + _a[0].x * x.half[0] * sx + _a[1].x * x.half[1] * sy + _a[2].x * x.half[2] * sz;
      const py = x.c.y + _a[0].y * x.half[0] * sx + _a[1].y * x.half[1] * sy + _a[2].y * x.half[2] * sz;
      const pz = x.c.z + _a[0].z * x.half[0] * sx + _a[1].z * x.half[1] * sy + _a[2].z * x.half[2] * sz;
      const d = px * n.x + py * n.y + pz * n.z;
      corners.push([px, py, pz, d]);
      if (d < min) min = d;
    }
    // A face or an edge meeting flat: its middle, so a square hit does not spin the car.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let k = 0;
    for (const [px, py, pz, d] of corners) {
      if (d > min + 0.04) continue;
      cx += px;
      cy += py;
      cz += pz;
      k++;
    }
    out.set(cx / k, cy / k, cz / k);
    // Keep it inside the obstacle's footprint across the normal (a post hits the bumper where the post is).
    if (h.half) {
      const t = new CANNON.Vec3();
      out.vsub(h.c, t);
      for (let i = 0; i < 3; i++) {
        const ax = h.axes[i];
        const along = Math.abs(ax.dot(n)) > 0.9 ? null : t.dot(ax);
        if (along === null) continue;
        const c = Math.max(-h.half[i], Math.min(h.half[i], along));
        if (c !== along) {
          out.x += ax.x * (c - along);
          out.y += ax.y * (c - along);
          out.z += ax.z * (c - along);
        }
      }
    }
    return out;
  }

  /**
   * Before cannon integrates (the world's preStep): shorten this step's motion if it
   * would carry the chassis into something. `dt` is the fixed step.
   */
  sweep(dt) {
    if (!this.enabled) return;
    const b = this.body;
    const v = b.velocity;
    // The integration adds force/m·dt to the velocity before moving the body.
    const k = b.invMass * dt;
    const move = new CANNON.Vec3((v.x + b.force.x * k) * dt, (v.y + b.force.y * k) * dt, (v.z + b.force.z * k) * dt);
    const len = move.length();
    if (len < 0.02) return;
    const hits = this._gather(move);
    if (!hits.length) return;
    // Already touching at the start: cannon has that contact; only the new motion into it matters.
    const d0 = this._depth(hits, move, 0);
    const d1 = this._depth(hits, move, 1);
    if (d1 <= Math.max(SLOP, d0 + 0.005)) return;
    // Bisect for the first moment the overlap reaches the slop.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (this._depth(hits, move, mid) > Math.max(SLOP, d0 + 0.005)) hi = mid;
      else lo = mid;
    }
    this._depth(hits, move, hi);
    const n = this.normal;
    const closing = -(v.x * n.x + v.y * n.y + v.z * n.z);
    if (closing <= 0) return;
    const nx = n.x;
    const ny = n.y;
    const nz = n.z;
    // Only the velocity is held back; the forces (gravity, the engine) integrate in full.
    this.saved = v.clone();
    this.kept = lo;
    v.scale(lo, v);
    // The impact itself is answered after the step, at the contact, as cannon would have.
    this._depth(hits, move, lo);
    const point = this._contactPoint(new CANNON.Vec3());
    const at = new CANNON.Vec3(b.position.x + move.x * lo, b.position.y + move.y * lo, b.position.z + move.z * lo);
    this.hit = { normal: n.clone(), r: point.vsub(at), body: this.hitShape.body };
  }

  /**
   * The collision response at the contact found by the sweep: an impulse along the
   * normal with the pair's restitution, Coulomb friction along the surface, applied
   * at the point so an off-centre hit also turns the car. Then the same 'collide'
   * event cannon sends, so sparks, sound and camera shake follow.
   */
  _impact(hit) {
    const b = this.body;
    const o = hit.body;
    const n = hit.normal;
    const r = hit.r;
    const w = b.angularVelocity;
    const vp = new CANNON.Vec3();
    w.cross(r, vp);
    vp.vadd(b.velocity, vp);
    if (o.type === CANNON.Body.KINEMATIC) vp.vsub(o.velocity, vp);
    const vn = vp.dot(n);
    if (vn >= 0) return;
    const cm = this.world.getContactMaterial(b.material, o.material) || this.world.defaultContactMaterial;
    const e = cm.restitution >= 0 ? cm.restitution : 0.1;
    const mu = cm.friction >= 0 ? cm.friction : 0.3;
    b.updateInertiaWorld(true);
    const K = (dir) => {
      const rn = new CANNON.Vec3();
      r.cross(dir, rn);
      const t = b.invInertiaWorld.vmult(rn);
      const u = new CANNON.Vec3();
      t.cross(r, u);
      return b.invMass + dir.dot(u);
    };
    const jn = (-(1 + e) * vn) / K(n);
    const J = n.scale(jn);
    const vt = vp.vsub(n.scale(vn));
    const st = vt.length();
    if (st > 1e-3) {
      const t = vt.scale(1 / st);
      const jt = Math.min(mu * jn, st / K(t));
      J.vsub(t.scale(jt), J);
    }
    b.applyImpulse(J, r);
    const ni = n.negate();
    b.dispatchEvent({ type: 'collide', body: o, target: b, contact: { bi: b, bj: o, ri: r, rj: new CANNON.Vec3(), ni, getImpactVelocityAlongNormal: () => vn } });
  }

  /** After the step (the world's postStep): restore the swept velocity, then push out of anything still overlapped. */
  resolve() {
    if (!this.enabled) return;
    const b = this.body;
    if (this.saved) {
      // Give back what the sweep held back, on top of what this step's forces added.
      const k = 1 - this.kept;
      b.velocity.x += this.saved.x * k;
      b.velocity.y += this.saved.y * k;
      b.velocity.z += this.saved.z * k;
      this.saved = null;
      if (this.hit) this._impact(this.hit);
      this.hit = null;
    }
    const zero = new CANNON.Vec3();
    for (let pass = 0; pass < 3; pass++) {
      const hits = this._gather(zero);
      if (!hits.length) return;
      const d = this._depth(hits, zero, 0);
      if (d <= DEEP) return;
      const n = this.normal;
      // Up onto the top of something is how a car climbs a wall it is pushing into: leave
      // resting and grazing contacts on tops to cannon, step in only when it is truly inside.
      if (n.y > 0.5 && d < 0.25) return;
      const push = d - SLOP;
      b.position.x += n.x * push;
      b.position.y += n.y * push;
      b.position.z += n.z * push;
      const vn = b.velocity.dot(n);
      if (vn < 0) {
        b.velocity.x -= n.x * vn;
        b.velocity.y -= n.y * vn;
        b.velocity.z -= n.z * vn;
      }
    }
  }
}
