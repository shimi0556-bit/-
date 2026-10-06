// Combat. The player's two rotary cannons fire where the crosshair points (with a little
// aim assist that pulls rounds onto a monster near it), and missiles fly from below the
// window to the monster nearest the crosshair. Rounds also knock down what the monsters
// throw back (fireballs, acid, meteors) and break open the supply crates.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParticlePool } from '../fx/fx.js';
import { makeSoftSprite, canvasTexture } from '../core/textures.js';
import { clamp } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);

export const CANNON = { rate: 14, speed: 1400, damage: 18, life: 1.0, heatPerShot: 0.011, cool: 0.45, spread: 0.004 };
export const MISSILE = { damage: 520, splash: 26, speedMax: 380, accel: 320, turn: 5.5, life: 4.5, max: 6, regen: 4, cone: 0.35, range: 1200 };

function missileGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.14, 0.14, 2.6, 12).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.14, 0.5, 12).rotateX(Math.PI / 2).translate(0, 0, 1.55),
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(new THREE.BoxGeometry(0.02, 0.36, 0.3).translate(0, 0.2, -1.1).rotateZ((i * Math.PI) / 2 + Math.PI / 4));
    parts.push(new THREE.BoxGeometry(0.02, 0.22, 0.2).translate(0, 0.15, 0.7).rotateZ((i * Math.PI) / 2 + Math.PI / 4));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

export class Weapons {
  constructor(ctx) {
    this.ctx = ctx; // { scene, terrain, fx, audio, monsters, pickups, events, quality }
    this.bullets = [];
    this.missiles = [];
    this.shots = [];
    this.meteors = [];
    this.heat = 0;
    this.overheated = false;
    this.coolTimer = 0;     // the cooling crate: no overheating for a while
    this.fireAcc = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.regen = 0;
    this.missileSide = 1;
    this.rail = false;      // in a mission the player rides a track and can't dodge
    // aiming state, refreshed every frame by updateAim()
    this.aimOrigin = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.aimPoint = new THREE.Vector3();
    this.aimDist = 200;
    this.assist = null;     // { kind, ref, point } the thing the rounds are pulled onto
    this.hover = null;      // a monster right under the crosshair
    this.missileTarget = null;
    const tex = canvasTexture(makeSoftSprite(64, 0.4), false);
    this.tracerPool = new ParticlePool(400, { additive: true, texture: tex });
    this.glowPool = new ParticlePool(240, { additive: true, texture: tex });
    ctx.scene.add(this.tracerPool.mesh, this.glowPool.mesh);
    this.missileGeo = missileGeometry();
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5, metalness: 0.2 });
    this.rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const pos = this.rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) { // lumpy rock
      _a.fromBufferAttribute(pos, i);
      const k = 0.75 + 0.35 * Math.abs(Math.sin(_a.x * 3.1 + _a.y * 5.3) * Math.cos(_a.z * 4.7));
      pos.setXYZ(i, _a.x * k, _a.y * k, _a.z * k);
    }
    this.rockGeo.computeVertexNormals();
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 1.6 });
  }

  setFog(color, density) { this.tracerPool.setFog(color, density * 0.6); this.glowPool.setFog(color, density * 0.5); }

  get accuracy() { return this.shotsFired ? Math.min(1, this.shotsHit / this.shotsFired) : 0; }

  // ---------------------------------------------------------------- aiming
  // camera: the player's eyes; ndc: the crosshair (-1..1); assistPx: how close (in css px)
  // something must be to the crosshair for the rounds to bend onto it
  updateAim(camera, ndc, assistPx, active = true) {
    const M = this.ctx.monsters, T = this.ctx.terrain;
    const o = this.aimOrigin.copy(camera.position);
    const dir = this.aimDir.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(o).normalize();
    const w = window.innerWidth, h = window.innerHeight;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const toPx = (p) => {
      _e.copy(p).project(camera);
      if (_e.z > 1) return null;
      return [(_e.x - ndc.x) * w / 2, (_e.y - ndc.y) * h / 2];
    };
    let best = null, bestScore = Infinity, missile = null, missileScore = Infinity;
    const consider = (kind, ref, point, radius, maxDist, weight = 1) => {
      const dist = point.distanceTo(o);
      if (dist > maxDist || dist < 2) return;
      const px = toPx(point);
      if (!px) return;
      const rPx = (radius / (dist * tanHalf)) * (h / 2);
      const off = Math.max(0, Math.hypot(px[0], px[1]) - rPx);
      if (off > assistPx) return;
      const score = (off / assistPx) * weight + dist / 4000;
      if (score < bestScore) { bestScore = score; best = { kind, ref, point: point.clone(), off }; }
    };
    if (active) {
      for (const m of M.list) {
        if (!m.alive || m.rise > 0.6) continue;
        const c = M.aimPoint(m, o, dir, _a);
        const r = m.spec.boss ? 4 : Math.max(m.radius * 1.1, m.height * 0.45);
        consider('monster', m, c, r, m.spec.boss ? 1600 : 950, 1);
        // missiles: the monster nearest the crosshair inside a wide cone
        const to = _b.subVectors(c, o);
        const d = to.length();
        if (d < MISSILE.range && d > 6) {
          const ang = Math.acos(clamp(to.dot(dir) / d, -1, 1));
          const size = Math.atan2(r, d);
          if (ang < MISSILE.cone + size) {
            const sc = ang - size + d / 6000 - (m === this.missileTarget ? 0.05 : 0);
            if (sc < missileScore) { missileScore = sc; missile = m; }
          }
        }
      }
      for (const s of this.shots) if (!s.dead) consider('shot', s, s.p, 3 * s.size + 1, 700, 0.6);
      for (const m of this.meteors) if (!m.dead && m.aimed) consider('meteor', m, m.p, m.mesh.scale.x * 1.2, 900, 0.5);
      const P = this.ctx.pickups;
      if (P) for (const p of P.list) if (!p.taken) consider('crate', p, p.pos, 2.4, 400, 1.2);
    }
    this.assist = best;
    this.missileTarget = missile;
    // how far away the thing under the crosshair is (the guns converge there)
    const hit = M.segmentHit(o, _c.copy(o).addScaledVector(dir, 1500), 0);
    this.hover = hit && active ? hit.m : null;
    let dist = 400;
    if (hit) dist = hit.t;
    else {
      for (let s = 15; s <= 600; s += 15) {
        _c.copy(o).addScaledVector(dir, s);
        if (_c.y < T.groundOrWater(_c.x, _c.z)) { dist = s; break; }
      }
    }
    this.aimDist = dist;
    this.aimPoint.copy(o).addScaledVector(dir, dist);
    if (best && !this.hover && best.kind === 'monster') this.hover = best.off < 1 ? best.ref : null;
  }

  // where to shoot so a round meets the thing (first-order lead)
  leadPoint(from, target, out = new THREE.Vector3()) {
    const { kind, ref } = target;
    if (kind === 'monster') {
      const M = this.ctx.monsters;
      M.aimPoint(ref, this.aimOrigin, this.aimDir, out);
      const vel = ref.spec.flies || ref.leap || ref.airborne ? (ref.leap ? _c.set(0, 0, 0) : ref.vel) : _c.set(Math.sin(ref.heading) * ref.speed, 0, Math.cos(ref.heading) * ref.speed);
      return out.addScaledVector(vel, out.distanceTo(from) / CANNON.speed);
    }
    if (kind === 'shot' || kind === 'meteor') {
      out.copy(ref.p);
      return out.addScaledVector(ref.v, out.distanceTo(from) / CANNON.speed);
    }
    return out.copy(ref.pos);
  }

  // ---------------------------------------------------------------- player fire
  updateCannon(dt, firing, guns, camera) {
    const A = this.ctx.audio;
    this.coolTimer = Math.max(0, this.coolTimer - dt);
    if (firing && !this.overheated) {
      this.fireAcc += dt * CANNON.rate;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        this.fireRound(guns, camera);
        if (this.coolTimer <= 0) this.heat += CANNON.heatPerShot;
        if (this.heat >= 1) { this.heat = 1; this.overheated = true; A.overheat(); break; }
      }
      A.cannon(true);
    } else {
      this.fireAcc = Math.min(this.fireAcc, 0.999);
      A.cannon(false);
    }
    if (!firing || this.overheated || this.coolTimer > 0) this.heat = Math.max(0, this.heat - CANNON.cool * dt * (this.overheated ? 0.8 : 1) * (this.coolTimer > 0 ? 3 : 1));
    if (this.overheated && this.heat < 0.3) this.overheated = false;
  }

  fireRound(guns, camera) {
    const i = guns.nextGun();
    const muzzle = guns.muzzleWorld(i, camera, new THREE.Vector3());
    let target = this.aimPoint;
    if (this.assist) target = this.leadPoint(muzzle, this.assist, _d);
    const dir = _b.subVectors(target, muzzle).normalize();
    dir.x += (Math.random() - 0.5) * CANNON.spread * 2;
    dir.y += (Math.random() - 0.5) * CANNON.spread * 2;
    dir.z += (Math.random() - 0.5) * CANNON.spread * 2;
    dir.normalize();
    const v = dir.clone().multiplyScalar(CANNON.speed);
    // start a random part of a frame along, so the stream doesn't bunch up
    const p = muzzle.clone().addScaledVector(dir, Math.random() * 6);
    this.bullets.push({ p, v, life: 0, travel: 0, tracer: (this.shotsFired % 2) === 0 });
    this.shotsFired++;
    guns.fire(i);
    this.ctx.audio.gunshot();
  }

  // a missile from the launcher under the window, to the monster nearest the crosshair
  launchMissile(player, camera) {
    if (player.missilesLeft <= 0 || !player.alive) { this.ctx.audio.ui('deny'); return false; }
    player.missilesLeft--;
    const right = _a.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = _b.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.missileSide = -this.missileSide;
    const p = camera.position.clone().addScaledVector(up, -1.8).addScaledVector(right, this.missileSide * 1.2);
    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.castShadow = false;
    mesh.position.copy(p);
    this.ctx.scene.add(mesh);
    const target = this.missileTarget && this.missileTarget.alive ? this.missileTarget : null;
    const dir = this.aimDir.clone().addScaledVector(right, this.missileSide * 0.08).normalize();
    this.missiles.push({ p, v: dir.clone().multiplyScalar(60).addScaledVector(up, -4), speed: 60, target, life: 0, mesh, trailAcc: 0, dir });
    this.ctx.audio.missile();
    this.ctx.events.onMissile?.(target);
    return true;
  }

  updateRegen(dt, player) {
    if (player.missilesLeft >= MISSILE.max) { this.regen = 0; return; }
    this.regen += dt;
    if (this.regen >= MISSILE.regen) {
      this.regen = 0;
      player.missilesLeft++;
      this.ctx.audio.ui('reload');
    }
  }

  // ---------------------------------------------------------------- monster attacks
  enemyShot(type, from, player, speed, spread = 0, size = 1) {
    if (!player.alive) return;
    // aim at where the player will be
    const to = _a.subVectors(player.pos, from);
    const t = to.length() / speed;
    const aim = _b.copy(player.pos).addScaledVector(player.vel, t * 0.9).sub(from).normalize();
    if (spread) aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    this.shots.push({ type, p: from.clone(), v: aim.clone().multiplyScalar(speed), life: 0, size, acc: 0, homing: type === 'acid' ? 0.45 : 0.3 });
    if (type === 'fire') this.ctx.audio.fireball(from);
    this.ctx.events.onIncoming?.(type);
  }

  meteor(player, i) {
    const T = this.ctx.terrain;
    // on the track some rocks come straight at the window and must be shot down;
    // the rest crash into the ground nearby
    const aimed = this.rail && (i === 0 || i === 3 || i === 6);
    const arrive = (this.rail ? 3.4 : 2.6) + Math.random() * 0.6 + i * 0.15;
    let target;
    if (aimed) {
      target = player.pos.clone().addScaledVector(player.vel, arrive);
    } else {
      const ring = i === 0 ? 0 : 60 + (i % 4) * 45;
      const a = i * 2.4 + Math.random() * 0.6;
      target = player.pos.clone().addScaledVector(player.vel, arrive).add(new THREE.Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring));
      if (this.rail) target.addScaledVector(player.forward, 120);
      target.y = T.groundOrWater(target.x, target.z);
    }
    const from = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 500, 1100 + Math.random() * 200, (Math.random() - 0.5) * 500));
    if (aimed) from.addScaledVector(player.forward, 500);
    const dur = arrive + 0.4;
    const vel = target.clone().sub(from).divideScalar(dur);
    const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
    mesh.scale.setScalar(aimed ? 6 : 7 + Math.random() * 4);
    mesh.position.copy(from);
    this.ctx.scene.add(mesh);
    const beacon = aimed ? null : this.ctx.fx.beacon(target, 34, dur + 0.2);
    this.meteors.push({ p: from, v: vel, target, life: 0, dur, mesh, beacon, aimed, hp: 70, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), acc: 0 });
  }

  // ---------------------------------------------------------------- simulation
  update(dt, time, player) {
    const { terrain: T, monsters: M, fx, events, pickups: P } = this.ctx;
    this.updateRegen(dt, player);

    // rounds
    const pool = this.tracerPool;
    let n = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life += dt;
      const p0 = _a.copy(b.p);
      const p1 = _b.copy(b.p).addScaledVector(b.v, dt);
      b.travel += CANNON.speed * dt;
      let dead = b.life > CANNON.life;
      // what the monsters throw: fireballs, acid and meteors can be shot down
      if (!dead) for (const s of this.shots) {
        if (s.dead) continue;
        if (segPoint(p0, p1, s.p) < (s.type === 'fire' ? 4 : 3) * s.size + 1.5) {
          s.dead = true; dead = true;
          if (s.type === 'fire') { fx.explosion(s.p, 0.6); this.ctx.audio.explosion(0.5, s.p); } else fx.sparks(s.p, 0.8, 0x80ff60);
          this.shotsHit++;
          events.onShotDown?.(s);
          break;
        }
      }
      if (!dead) for (const m of this.meteors) {
        if (m.dead) continue;
        if (segPoint(p0, p1, m.p) < m.mesh.scale.x + 2) {
          dead = true;
          this.shotsHit++;
          m.hp -= CANNON.damage;
          fx.hitFlash(m.p, 1.5);
          if (m.hp <= 0) this.breakMeteor(m);
          break;
        }
      }
      if (!dead && P) for (const c of P.list) {
        if (c.taken) continue;
        if (segPoint(p0, p1, c.pos) < 2.6) {
          dead = true;
          this.shotsHit++;
          P.take(c);
          break;
        }
      }
      // monsters
      const hit = !dead && M.segmentHit(p0, p1, 0.6);
      if (hit) {
        M.damage(hit.m, CANNON.damage, hit.point, { sphere: hit.sphere, dir: b.v.clone().normalize() });
        fx.hitFlash(hit.point, hit.m.spec.boss ? 2 : 1);
        this.shotsHit++;
        events.onHit?.(hit.m, 'cannon');
        dead = true;
      }
      // ground and water
      if (!dead) {
        const g = T.groundOrWater(p1.x, p1.z);
        if (p1.y < g) {
          let lo = 0, hi = 1;
          for (let k = 0; k < 5; k++) {
            const mid = (lo + hi) / 2;
            _c.lerpVectors(p0, p1, mid);
            if (_c.y < T.groundOrWater(_c.x, _c.z)) hi = mid; else lo = mid;
          }
          _c.lerpVectors(p0, p1, hi);
          const water = T.heightAt(_c.x, _c.z) < T.waterLevel;
          fx.groundHit(_c, water && T.level.water === 'water', water && T.level.water === 'lava');
          dead = true;
        }
      }
      if (dead) { this.bullets[i] = this.bullets[this.bullets.length - 1]; this.bullets.pop(); continue; }
      b.p.copy(p1);
    }
    for (const b of this.bullets) {
      if (n >= pool.max) break;
      if (b.travel < 5) continue;
      // keep the tracer about the same size on screen near and far
      const size = clamp(b.travel * 0.0045, 0.03, 0.55);
      const bright = b.tracer ? 1 : 0.5;
      pool.setDirect(n++, b.p.x, b.p.y, b.p.z, b.v.x, b.v.y, b.v.z, size, 6 * bright, 3.6 * bright, 1.2 * bright, 1, clamp(b.travel / CANNON.speed, 0.002, 0.012));
    }
    pool.flush(n);

    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life += dt;
      const tgt = m.target && m.target.alive ? m.target : null;
      m.speed = Math.min(MISSILE.speedMax, m.speed + MISSILE.accel * dt);
      if (tgt && m.life > 0.08) {
        const c = M.aimPoint(tgt, m.p, m.dir, _a);
        const dist = c.distanceTo(m.p);
        const tv = tgt.spec.flies ? tgt.vel : _c.set(Math.sin(tgt.heading) * tgt.speed, 0, Math.cos(tgt.heading) * tgt.speed);
        c.addScaledVector(tv, Math.min(1.5, dist / m.speed) * 0.8);
        const want = _b.subVectors(c, m.p).normalize();
        const ang = m.dir.angleTo(want);
        if (ang > 1e-4) {
          const axis = _d.crossVectors(m.dir, want).normalize();
          m.dir.applyAxisAngle(axis, Math.min(ang, MISSILE.turn * dt));
        }
      }
      m.v.copy(m.dir).multiplyScalar(m.speed);
      const p0 = _c.copy(m.p);
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      _q.setFromUnitVectors(FWD, _d.copy(m.v).normalize());
      m.mesh.quaternion.copy(_q);
      m.trailAcc += dt;
      while (m.trailAcc > 0.016) { m.trailAcc -= 0.016; fx.trail(_a.copy(m.p).addScaledVector(m.dir, -1.6), m.v, 'missile'); }
      let boom = null, direct = null;
      if (m.life > 0.1) {
        const hit = M.segmentHit(p0, m.p, 1.5);
        if (hit) { boom = hit.point; direct = hit; }
        if (!boom && tgt) {
          const c = M.aimPoint(tgt, m.p, m.dir, _a);
          if (c.distanceTo(m.p) < (tgt.spec.boss ? 5 : Math.max(tgt.radius * 1.4, 4))) boom = m.p.clone();
        }
      }
      if (!boom && m.p.y < T.groundOrWater(m.p.x, m.p.z)) boom = m.p.clone();
      if (!boom && m.life > MISSILE.life) boom = m.p.clone();
      if (boom) {
        this.detonate(boom, direct, m.target);
        this.ctx.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

    // monster projectiles
    const gp = this.glowPool;
    let g = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life += dt;
      if (!s.dead && player.alive && s.life < 3.5) { // gentle homing
        const want = _a.subVectors(player.pos, s.p).normalize();
        const cur = _b.copy(s.v).normalize();
        const ang = cur.angleTo(want);
        if (ang > 1e-4 && ang < 1.2) cur.applyAxisAngle(_d.crossVectors(cur, want).normalize(), Math.min(ang, s.homing * dt));
        s.v.copy(cur).multiplyScalar(s.v.length());
      }
      const p0 = _c.copy(s.p);
      s.p.addScaledVector(s.v, dt);
      s.acc += dt;
      while (s.acc > 0.02) { s.acc -= 0.02; fx.trail(s.p, s.v, s.type); }
      if (!s.dead && player.alive && player.invuln <= 0 && segPoint(p0, s.p, player.pos) < 4 + s.size * 2) {
        s.dead = true;
        events.onPlayerHit?.(s.type === 'acid' ? 8 : Math.round(10 * s.size), s.p, s.type);
        if (s.type === 'fire') fx.explosion(_a.copy(s.p).addScaledVector(s.v, -0.03), 0.4); else fx.sparks(s.p, 1, 0x80ff60);
      }
      if (!s.dead && s.p.y < T.groundOrWater(s.p.x, s.p.z)) {
        s.dead = true;
        if (s.type === 'fire') { fx.explosion(s.p, 0.6); this.ctx.audio.explosion(0.4, s.p); } else fx.sparks(s.p, 0.8, 0x80ff60);
      }
      if (s.life > 7) s.dead = true;
      if (s.dead) { this.shots.splice(i, 1); continue; }
      const fire = s.type === 'fire';
      gp.setDirect(g++, s.p.x, s.p.y, s.p.z, 0, 0, 0, (fire ? 7 : 5) * s.size, fire ? 7 : 1.6, fire ? 3.4 : 6, fire ? 0.8 : 0.8, 1, 0);
      gp.setDirect(g++, s.p.x, s.p.y, s.p.z, 0, 0, 0, (fire ? 3 : 2) * s.size, 8, 8, 6, 1, 0);
    }

    // meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.dead) { this.removeMeteor(i); continue; }
      m.life += dt;
      if (m.aimed && player.alive) { // follow the moving window a little
        const left = Math.max(0.2, m.dur - m.life);
        const want = _a.copy(player.pos).addScaledVector(player.vel, left).sub(m.p).divideScalar(left);
        m.v.lerp(want, 1 - Math.exp(-1.2 * dt));
      }
      const p0 = _c.copy(m.p);
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      m.mesh.rotateOnAxis(m.spin, dt * 2);
      m.acc += dt;
      while (m.acc > 0.025) { m.acc -= 0.025; fx.trail(m.p, m.v, 'meteor'); }
      if (g < gp.max) gp.setDirect(g++, m.p.x, m.p.y, m.p.z, 0, 0, 0, 30, 5, 2, 0.5, 0.8, 0);
      if (player.alive && player.invuln <= 0 && !m.hitPlayer && segPoint(p0, m.p, player.pos) < (m.aimed ? 10 : 14)) {
        m.hitPlayer = true;
        events.onPlayerHit?.(m.aimed ? 16 : 22, m.p, 'meteor');
        fx.explosion(m.p.clone(), 1.2);
        if (m.aimed) { m.dead = true; continue; }
      }
      if (m.life >= m.dur) {
        if (!m.aimed) {
          fx.explosion(m.target, 3.2);
          this.ctx.audio.explosion(2.4, m.target);
          if (player.alive && player.invuln <= 0 && !m.hitPlayer && player.pos.distanceTo(m.target) < 30) events.onPlayerHit?.(14, m.target, 'meteor');
        }
        m.dead = true;
      }
    }
    gp.flush(g);
  }

  breakMeteor(m) {
    if (m.dead) return;
    m.dead = true;
    this.ctx.fx.explosion(m.p.clone(), 1.6);
    this.ctx.audio.explosion(1.4, m.p);
    this.ctx.events.onShotDown?.({ p: m.p.clone(), meteor: true });
  }

  removeMeteor(i) {
    const m = this.meteors[i];
    this.ctx.scene.remove(m.mesh);
    if (m.beacon) this.ctx.fx.removeBeacon?.(m.beacon);
    this.meteors.splice(i, 1);
  }

  detonate(point, direct, target) {
    const { monsters: M, fx, audio, events } = this.ctx;
    fx.explosion(point, 1.4);
    audio.explosion(1.3, point);
    const done = new Set();
    if (direct) {
      M.damage(direct.m, MISSILE.damage, direct.point, { sphere: direct.sphere, dir: _a.subVectors(direct.point, point).normalize(), missile: true });
      const weak = direct.sphere && (direct.sphere.weak !== undefined || direct.sphere.heart);
      if (!direct.m.spec.boss || weak) done.add(direct.m);
      events.onHit?.(direct.m, 'missile');
    }
    for (const m of M.list) {
      if (!m.alive || done.has(m)) continue;
      let best = null, bd = Infinity;
      for (const s of M.worldSpheres(m, [])) {
        if (m.spec.boss && s.weak === undefined && !s.heart) continue;
        const d = s.p.distanceTo(point) - s.r;
        if (d < bd) { bd = d; best = s; }
      }
      if (bd < MISSILE.splash) {
        const k = 1 - Math.max(0, bd) / MISSILE.splash;
        M.damage(m, MISSILE.damage * (0.35 + 0.65 * k), point, { sphere: best, dir: _b.subVectors(best.p, point).normalize(), missile: true });
        events.onHit?.(m, 'missile');
      }
    }
    // the blast also clears fireballs and acid around it
    for (const s of this.shots) if (!s.dead && s.p.distanceTo(point) < MISSILE.splash) { s.dead = true; events.onShotDown?.(s); }
    if (target && !target.alive) events.onMissileKill?.(target);
  }

  clear() {
    for (const m of this.missiles) this.ctx.scene.remove(m.mesh);
    while (this.meteors.length) this.removeMeteor(this.meteors.length - 1);
    this.bullets.length = 0; this.missiles.length = 0; this.shots.length = 0;
    this.tracerPool.flush(0); this.glowPool.flush(0);
    this.assist = null; this.hover = null; this.missileTarget = null;
    this.heat = 0; this.overheated = false; this.coolTimer = 0; this.regen = 0;
  }

  dispose() {
    this.clear();
    this.ctx.scene.remove(this.tracerPool.mesh, this.glowPool.mesh);
  }

  // projectiles heading for the player (for the HUD)
  incoming(player, out = []) {
    out.length = 0;
    for (const s of this.shots) {
      if (s.dead) continue;
      const to = _a.subVectors(player.pos, s.p);
      const d = to.length();
      if (d < 700 && to.dot(s.v) > 0.7 * d * s.v.length()) out.push({ p: s.p, d, kind: s.type, size: s.size });
    }
    for (const m of this.meteors) if (m.aimed && !m.dead) out.push({ p: m.p, d: m.p.distanceTo(player.pos), kind: 'meteor', size: 3 });
    return out;
  }
}

// distance from point c to segment a-b
function segPoint(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const L = abx * abx + aby * aby + abz * abz;
  const t = L > 0 ? Math.max(0, Math.min(1, (acx * abx + acy * aby + acz * abz) / L)) : 0;
  const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
