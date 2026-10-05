// Combat: the jet's cannon (tracers with a little aim assist) and guided missiles with
// lock-on, plus everything the monsters throw back: fireballs, acid and falling meteors.
import * as THREE from 'three';
import { ParticlePool } from '../fx/fx.js';
import { makeSoftSprite, canvasTexture } from '../core/textures.js';
import { clamp } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);

export const CANNON = { rate: 16, speed: 1000, damage: 16, life: 1.5, heatPerShot: 0.016, cool: 0.42 };
export const MISSILE = { damage: 520, splash: 40, speedMax: 420, accel: 170, turn: 3.0, life: 6.5, lockTime: 0.75, lockRange: 2000, lockCone: 0.36, reload: 5.5 };

export class Weapons {
  constructor(ctx) {
    this.ctx = ctx; // { scene, terrain, fx, audio, monsters, events, quality }
    this.bullets = [];
    this.missiles = [];
    this.shots = [];
    this.meteors = [];
    this.heat = 0;
    this.overheated = false;
    this.fireAcc = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.locked = false;
    this.assistTarget = null;
    this.reloadTimer = 0;
    this.altBarrel = 0;
    const tex = canvasTexture(makeSoftSprite(64, 0.4), false);
    this.tracerPool = new ParticlePool(400, { additive: true, texture: tex });
    this.glowPool = new ParticlePool(200, { additive: true, texture: tex });
    ctx.scene.add(this.tracerPool.mesh, this.glowPool.mesh);
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

  get accuracy() { return this.shotsFired ? this.shotsHit / this.shotsFired : 0; }

  // ---------------------------------------------------------------- targeting
  // Picks the lock target in front of the jet and the cannon's aim-assist target.
  updateTargeting(dt, jet, wantLock = true) {
    const M = this.ctx.monsters;
    const fwd = jet.forward;
    let best = null, bestScore = Infinity, assist = null, assistAng = 0.07;
    const c = _a;
    for (const m of M.list) {
      if (!m.alive) continue;
      M.center(m, c);
      const to = _b.subVectors(c, jet.pos);
      const dist = to.length();
      if (dist < 1) continue;
      to.divideScalar(dist);
      const ang = Math.acos(clamp(to.dot(fwd), -1, 1));
      const size = Math.atan2(Math.max(m.radius * 2, m.height * 0.7), dist);
      if (dist < MISSILE.lockRange && ang < MISSILE.lockCone + size) {
        const score = ang / MISSILE.lockCone + dist / MISSILE.lockRange * 0.6 - (m === this.lockTarget ? 0.35 : 0) - (m.spec.boss ? 0.2 : 0);
        if (score < bestScore) { bestScore = score; best = m; }
      }
      if (dist < 1400 && ang < assistAng + size * 0.5) { assistAng = ang; assist = m; }
    }
    this.assistTarget = assist;
    if (!wantLock || !jet.alive) best = null;
    if (best !== this.lockTarget) {
      this.lockTarget = best;
      this.lockProgress = 0;
      this.locked = false;
    }
    if (best) {
      const before = this.locked;
      this.lockProgress = Math.min(1, this.lockProgress + dt / MISSILE.lockTime);
      this.locked = this.lockProgress >= 1;
      if (this.locked && !before) this.ctx.audio.lockTone(true);
    }
    this.ctx.audio.lockState(best ? (this.locked ? 2 : 1) : 0);
  }

  // Where to shoot so a round meets the monster (first-order lead).
  leadPoint(jet, m, out = new THREE.Vector3()) {
    const M = this.ctx.monsters;
    const c = M.center(m, out);
    const vel = m.spec.flies ? m.vel : _c.set(Math.sin(m.heading) * m.speed, 0, Math.cos(m.heading) * m.speed);
    const dist = c.distanceTo(jet.pos);
    const t = dist / (CANNON.speed + jet.speed * 0.6);
    return c.addScaledVector(vel, t);
  }

  // ---------------------------------------------------------------- player fire
  updateCannon(dt, jet, firing) {
    const A = this.ctx.audio;
    if (firing && !this.overheated && jet.alive) {
      this.fireAcc += dt * CANNON.rate;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        this.fireRound(jet);
        this.heat += CANNON.heatPerShot;
        if (this.heat >= 1) { this.heat = 1; this.overheated = true; A.overheat(); break; }
      }
      A.cannon(true);
    } else {
      this.fireAcc = Math.min(this.fireAcc, 0.999);
      A.cannon(false);
    }
    if (!firing || this.overheated) this.heat = Math.max(0, this.heat - CANNON.cool * dt * (this.overheated ? 0.8 : 1));
    if (this.overheated && this.heat < 0.3) this.overheated = false;
  }

  fireRound(jet) {
    const muzzle = jet.muzzleWorld(new THREE.Vector3());
    const dir = jet.forward.clone();
    const m = this.assistTarget;
    if (m) {
      const lp = this.leadPoint(jet, m, _d);
      const want = lp.sub(muzzle).normalize();
      if (want.dot(dir) > Math.cos(0.12)) dir.lerp(want, 0.85).normalize();
    }
    // gentle dispersion
    dir.x += (Math.random() - 0.5) * 0.008; dir.y += (Math.random() - 0.5) * 0.008; dir.z += (Math.random() - 0.5) * 0.008;
    dir.normalize();
    const vel = dir.clone().multiplyScalar(CANNON.speed).addScaledVector(jet.vel, 1);
    this.bullets.push({ p: muzzle.clone(), v: vel, life: 0, tracer: (this.altBarrel++ % 2) === 0 });
    this.shotsFired++;
    this.ctx.fx.muzzle(muzzle, dir);
    this.ctx.audio.gunshot();
  }

  launchMissile(jet) {
    if (jet.missilesLeft <= 0 || !jet.alive) { this.ctx.audio.ui('deny'); return false; }
    const slot = 4 - jet.missilesLeft;
    jet.missilesLeft--;
    if (this.reloadTimer <= 0) this.reloadTimer = MISSILE.reload;
    const p = jet.pylonWorld(slot, new THREE.Vector3());
    const mesh = new THREE.Mesh(jet.missileGeo, this.missileMat);
    mesh.castShadow = false;
    this.ctx.scene.add(mesh);
    const target = this.locked ? this.lockTarget : null;
    this.missiles.push({
      p, v: jet.vel.clone().addScaledVector(jet.up, -6), speed: jet.speed, target, life: 0, mesh, trailAcc: 0, dir: jet.forward.clone(),
    });
    this.ctx.audio.missile();
    this.ctx.events.onMissile?.(target);
    return true;
  }

  updateReload(dt, jet) {
    if (jet.missilesLeft >= 4) { this.reloadTimer = 0; return; }
    this.reloadTimer -= dt;
    if (this.reloadTimer <= 0) {
      jet.missilesLeft++;
      this.reloadTimer = jet.missilesLeft < 4 ? MISSILE.reload : 0;
      this.ctx.audio.ui('reload');
    }
  }

  // ---------------------------------------------------------------- monster attacks
  enemyShot(type, from, player, speed, spread = 0, size = 1) {
    if (!player.alive) return;
    // aim ahead of the jet
    const to = _a.subVectors(player.pos, from);
    const t = to.length() / speed;
    const aim = _b.copy(player.pos).addScaledVector(player.vel, t * 0.85).sub(from).normalize();
    if (spread) aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    this.shots.push({ type, p: from.clone(), v: aim.clone().multiplyScalar(speed), life: 0, size, acc: 0, homing: type === 'acid' ? 0.45 : 0.25 });
    if (type === 'fire') this.ctx.audio.fireball(from);
    this.ctx.events.onIncoming?.(type);
  }

  meteor(player, i) {
    const T = this.ctx.terrain;
    const ring = i === 0 ? 0 : 60 + (i % 4) * 45;
    const a = i * 2.4 + Math.random() * 0.6;
    const arrive = 2.6 + Math.random() * 0.6;
    const target = player.pos.clone().addScaledVector(player.vel, arrive).add(new THREE.Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring));
    target.y = T.groundOrWater(target.x, target.z);
    const from = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 500, 1100 + Math.random() * 200, (Math.random() - 0.5) * 500));
    const dur = arrive + 0.6 + i * 0.12;
    const vel = target.clone().sub(from).divideScalar(dur);
    const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
    mesh.scale.setScalar(7 + Math.random() * 4);
    mesh.position.copy(from);
    this.ctx.scene.add(mesh);
    const beacon = this.ctx.fx.beacon(target, 34, dur + 0.2);
    this.meteors.push({ p: from, v: vel, target, life: 0, dur, mesh, beacon, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), acc: 0 });
  }

  // ---------------------------------------------------------------- simulation
  update(dt, time, player) {
    const { terrain: T, monsters: M, fx, events } = this.ctx;
    this.updateReload(dt, player);

    // bullets
    const pool = this.tracerPool;
    let n = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life += dt;
      const p0 = _a.copy(b.p);
      const p1 = _b.copy(b.p).addScaledVector(b.v, dt);
      let dead = b.life > CANNON.life;
      // monsters
      const hit = !dead && M.segmentHit(p0, p1, 0.8);
      if (hit) {
        M.damage(hit.m, CANNON.damage, hit.point, { sphere: hit.sphere, dir: b.v.clone().normalize() });
        fx.hitFlash(hit.point, hit.m.spec.boss ? 2 : 1);
        this.shotsHit++;
        events.onHit?.(hit.m, 'cannon');
        dead = true;
      }
      // fireballs can be shot down
      if (!dead) for (const s of this.shots) {
        if (s.type !== 'fire') continue;
        if (segPoint(p0, p1, s.p) < 4 * s.size + 1.5) {
          s.dead = true; dead = true;
          fx.explosion(s.p, 0.7);
          this.ctx.audio.explosion(0.6, s.p);
          events.onShotDown?.(s);
          break;
        }
      }
      // ground and water
      if (!dead) {
        const g = T.groundOrWater(p1.x, p1.z);
        if (p1.y < g) {
          // refine the impact point
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
      const bright = b.tracer ? 1 : 0.45;
      pool.setDirect(n++, b.p.x, b.p.y, b.p.z, b.v.x, b.v.y, b.v.z, b.tracer ? 0.5 : 0.32, 6 * bright, 3.6 * bright, 1.2 * bright, 1, 0.014);
    }
    pool.flush(n);

    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life += dt;
      const tgt = m.target && m.target.alive ? m.target : null;
      if (m.life > 0.22) {
        m.speed = Math.min(MISSILE.speedMax, m.speed + MISSILE.accel * dt);
        if (tgt) {
          const c = M.center(tgt, _a);
          const dist = c.distanceTo(m.p);
          const tv = tgt.spec.flies ? tgt.vel : _c.set(Math.sin(tgt.heading) * tgt.speed, 0, Math.cos(tgt.heading) * tgt.speed);
          c.addScaledVector(tv, Math.min(2, dist / m.speed) * 0.8);
          const want = _b.subVectors(c, m.p).normalize();
          const ang = m.dir.angleTo(want);
          if (ang > 1e-4) {
            const axis = _d.crossVectors(m.dir, want).normalize();
            m.dir.applyAxisAngle(axis, Math.min(ang, MISSILE.turn * dt * (m.life < 0.6 ? 0.6 : 1)));
          }
        }
        m.v.copy(m.dir).multiplyScalar(m.speed);
      } else {
        m.v.y -= 12 * dt; // drop off the rail
      }
      const p0 = _c.copy(m.p);
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      _q.setFromUnitVectors(FWD, _d.copy(m.v).normalize());
      m.mesh.quaternion.copy(_q);
      m.trailAcc += dt;
      while (m.trailAcc > 0.016) { m.trailAcc -= 0.016; fx.trail(_a.copy(m.p).addScaledVector(m.dir, -1.6), m.v, 'missile'); }
      let boom = null, direct = null;
      if (m.life > 0.15) {
        const hit = M.segmentHit(p0, m.p, 2.5);
        if (hit) { boom = hit.point; direct = hit; }
        if (!boom && tgt) {
          const c = M.center(tgt, _a);
          if (c.distanceTo(m.p) < Math.max(tgt.radius * 1.5, 6)) boom = m.p.clone();
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
      if (!s.dead && player.alive && s.life < 3.5) { // gentle homing so dodging still works
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
      if (!s.dead && player.alive && player.invuln <= 0 && segPoint(p0, s.p, player.pos) < 5 + s.size * 3) {
        s.dead = true;
        events.onPlayerHit?.(s.type === 'acid' ? 9 : Math.round(11 * s.size), s.p, s.type);
        if (s.type === 'fire') fx.explosion(s.p, 0.8); else fx.sparks(s.p, 1, 0x80ff60);
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
      m.life += dt;
      const p0 = _c.copy(m.p);
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      m.mesh.rotateOnAxis(m.spin, dt * 2);
      m.acc += dt;
      while (m.acc > 0.025) { m.acc -= 0.025; fx.trail(m.p, m.v, 'meteor'); }
      gp.setDirect(g++, m.p.x, m.p.y, m.p.z, 0, 0, 0, 30, 5, 2, 0.5, 0.8, 0);
      if (player.alive && player.invuln <= 0 && !m.hitPlayer && segPoint(p0, m.p, player.pos) < 14) {
        m.hitPlayer = true;
        events.onPlayerHit?.(22, m.p, 'meteor');
        fx.explosion(m.p.clone(), 1.5);
      }
      if (m.life >= m.dur) {
        fx.explosion(m.target, 3.2);
        this.ctx.audio.explosion(2.4, m.target);
        if (player.alive && player.invuln <= 0 && !m.hitPlayer && player.pos.distanceTo(m.target) < 55) events.onPlayerHit?.(18, m.target, 'meteor');
        this.ctx.scene.remove(m.mesh);
        this.meteors.splice(i, 1);
      }
    }
    gp.flush(g);
  }

  detonate(point, direct, target) {
    const { monsters: M, fx, audio, events } = this.ctx;
    fx.explosion(point, 1.6);
    audio.explosion(1.4, point);
    const done = new Set();
    if (direct) {
      M.damage(direct.m, MISSILE.damage, direct.point, { sphere: direct.sphere, dir: _a.subVectors(direct.point, point).normalize(), missile: true });
      done.add(direct.m);
      events.onHit?.(direct.m, 'missile');
    }
    for (const m of M.list) {
      if (!m.alive || done.has(m)) continue;
      // nearest hit sphere for boss weak points, centre distance otherwise
      let best = null, bd = Infinity;
      for (const s of M.worldSpheres(m, [])) {
        const d = s.p.distanceTo(point) - s.r;
        if (d < bd) { bd = d; best = s; }
      }
      if (bd < MISSILE.splash) {
        const k = 1 - Math.max(0, bd) / MISSILE.splash;
        M.damage(m, MISSILE.damage * (0.35 + 0.65 * k), point, { sphere: best, dir: _b.subVectors(best.p, point).normalize(), missile: true });
        events.onHit?.(m, 'missile');
      }
    }
    if (target && !target.alive) events.onMissileKill?.(target);
  }

  clear() {
    for (const m of this.missiles) this.ctx.scene.remove(m.mesh);
    for (const m of this.meteors) this.ctx.scene.remove(m.mesh);
    this.bullets.length = 0; this.missiles.length = 0; this.shots.length = 0; this.meteors.length = 0;
    this.tracerPool.flush(0); this.glowPool.flush(0);
    this.lockTarget = null; this.locked = false; this.lockProgress = 0; this.assistTarget = null;
    this.heat = 0; this.overheated = false; this.reloadTimer = 0;
  }

  dispose() {
    this.clear();
    this.ctx.scene.remove(this.tracerPool.mesh, this.glowPool.mesh);
  }

  // projectiles heading for the jet (for the HUD warning)
  threats(player) {
    let n = 0;
    for (const s of this.shots) {
      const to = _a.subVectors(player.pos, s.p);
      const d = to.length();
      if (d < 900 && to.dot(s.v) > 0.8 * d * s.v.length()) n++;
    }
    for (const m of this.meteors) if (player.pos.distanceTo(m.target) < 160) n++;
    return n;
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
