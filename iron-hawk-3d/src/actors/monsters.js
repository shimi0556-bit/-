// Monster system: builds each species once (skinned body + rigid details), spawns
// instances, animates their gaits procedurally, runs their behaviour, takes hits and
// plays their deaths.
import * as THREE from 'three';
import { buildCreatureGeometry, makeSkinMaterial } from './creature-mesh.js';
import { SPECIES } from './species.js';
import { getSurfaceTexture } from '../core/textures.js';
import { mulberry32, clamp, damp, wrapAngle, lerp, smoothstep } from '../core/util.js';

const V = () => new THREE.Vector3();
const _v1 = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function detailMaterial(color, emissive = 0, intensity = 0, rough = 0.5) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, emissive, emissiveIntensity: intensity });
}

function orientY(geo, dir) { // geometry built along +Y, rotate it to point along dir
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize());
  return geo.applyQuaternion(q);
}

export class MonsterSystem {
  constructor(ctx) {
    this.ctx = ctx; // { scene, terrain, fx, audio, quality, events, weapons, renderer }
    this.assets = {};
    this.list = [];
    this.rand = mulberry32(ctx.level.seed + 909);
    this.time = 0;
  }

  async prepare(ids) {
    for (const id of ids) if (!this.assets[id]) {
      this.assets[id] = await this.buildSpecies(SPECIES[id]);
      await new Promise((r) => setTimeout(r, 0)); // let the loading screen breathe
    }
  }

  async buildSpecies(spec) {
    const q = this.ctx.quality;
    const extent = spec.shapes.reduce((m, s) => {
      const pts = s.type === 'ellipsoid' ? [s.c] : [s.a, s.b];
      for (const p of pts) for (let i = 0; i < 3; i++) m[i] = [Math.min(m[i][0], p[i]), Math.max(m[i][1], p[i])];
      return m;
    }, [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]]);
    const longest = Math.max(...extent.map((e) => e[1] - e[0]));
    const res = Math.round(spec.res * q.creatureDetail);
    const cell = longest / res;
    const built = buildCreatureGeometry(spec, cell);
    const pos = (name) => new THREE.Vector3(...spec.joints[name].pos);
    const boneInverses = spec.bones.map((b) => new THREE.Matrix4().makeTranslation(pos(b).negate()));

    // hit spheres from the shapes
    const spheres = [];
    for (const s of built.shapes) {
      const bi = spec.boneIndex[s.bone], bp = pos(s.bone);
      if (s.type === 0) {
        const [rx, ry, rz] = s.r, c = new THREE.Vector3(...s.c);
        const maxR = Math.max(rx, ry, rz), minR = Math.min(rx, ry, rz);
        if (maxR / minR > 1.6) {
          const axis = rx === maxR ? new THREE.Vector3(1, 0, 0) : ry === maxR ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
          const r = (rx + ry + rz - maxR) / 2;
          for (const t of [-0.55, 0, 0.55]) spheres.push({ bone: bi, local: c.clone().addScaledVector(axis, maxR * t).sub(bp), r });
        } else spheres.push({ bone: bi, local: c.sub(bp), r: (rx + ry + rz) / 3 });
      } else {
        const a = new THREE.Vector3(...s.a), ba = new THREE.Vector3(...s.ba);
        const len = ba.length(), rAvg = (s.r1 + s.r2) / 2;
        const n = clamp(Math.ceil(len / (rAvg * 1.3)), 1, 7);
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          spheres.push({ bone: bi, local: a.clone().addScaledVector(ba, t).sub(bp), r: lerp(s.r1, s.r2, t) });
        }
      }
    }

    const skinTex = await getSurfaceTexture(spec.skin, this.ctx.renderer);
    const attachments = this.buildAttachments(spec, built, spheres);
    const membrane = spec.membrane ? this.buildMembrane(spec) : null;
    const g = built.geometry;
    const sphere = g.boundingSphere.clone();
    sphere.radius *= 1.35;
    return { spec, geometry: g, boneInverses, spheres, skinTex, attachments, membrane, boundingSphere: sphere, extent };
  }

  buildAttachments(spec, built, spheres) {
    const list = [];
    const jpos = (b) => new THREE.Vector3(...spec.joints[b].pos);
    // top-of-body finder for plates
    const topY = (z, x = 0) => {
      let y = built.max[1];
      const f = (yy) => built.shapes.reduce((d, s, i) => {
        const v = shapeDistAt(s, x, yy, z);
        return i === 0 ? v : sminJS(d, v, s.k);
      }, 0);
      while (y > built.min[1] && f(y) > 0) y -= (built.max[1] - built.min[1]) / 120;
      return y;
    };
    for (const a of spec.attachments) {
      const bone = spec.boneIndex[a.bone];
      // plates and quills place themselves along the body; the rest sit at a joint offset
      const local = a.pos && a.bone ? new THREE.Vector3(...a.pos).sub(jpos(a.bone)) : null;
      switch (a.type) {
        case 'eye': {
          const geo = new THREE.SphereGeometry(a.r, 12, 8);
          list.push({ bone, local, geo, mat: detailMaterial(0x111111, a.color, 3.5, 0.2) });
          break;
        }
        case 'tooth': {
          const geo = new THREE.ConeGeometry(a.r, a.len, 5).translate(0, a.len / 2, 0);
          if (a.down) geo.rotateX(Math.PI);
          list.push({ bone, local, geo, mat: 'ivory' });
          break;
        }
        case 'claw': {
          const geo = orientY(new THREE.ConeGeometry(a.r, a.len, 6).translate(0, a.len / 2, 0), [0, -0.6, 1]);
          list.push({ bone, local, geo, mat: 'claw' });
          break;
        }
        case 'horn': {
          const geo = orientY(new THREE.ConeGeometry(a.r, a.len, 8, 3).translate(0, a.len / 2, 0), a.dir);
          list.push({ bone, local, geo, mat: 'ivory' });
          break;
        }
        case 'frill': {
          const parts = [new THREE.CylinderGeometry(a.r, a.r * 0.8, 0.22, 24, 1).rotateX(Math.PI / 2 - 0.5)];
          for (let i = 0; i < a.spikes; i++) {
            const ang = Math.PI * (0.05 + 0.9 * i / (a.spikes - 1));
            const sp = new THREE.ConeGeometry(0.16, 0.6, 5).translate(0, a.r + 0.25, 0).rotateZ(ang - Math.PI / 2).rotateX(-0.5);
            parts.push(sp);
          }
          for (const p of parts) if (p.index) p.toNonIndexed();
          const geo = mergeSimple(parts);
          list.push({ bone, local, geo, mat: detailMaterial(a.color, 0x401000, 0.3, 0.55) });
          break;
        }
        case 'crystal': {
          const geo = new THREE.OctahedronGeometry(1, 0).scale(a.r, a.len * 0.5, a.r).translate(0, a.len * 0.35, 0);
          if (a.tilt) geo.rotateZ(a.tilt);
          list.push({ bone, local, geo, mat: 'crystal', weak: a.weak });
          spheres.push({ bone, local: local.clone().add(new THREE.Vector3(0, a.len * 0.35, 0)), r: a.r * 1.6, weak: a.weak });
          break;
        }
        case 'plates': {
          const zs = a.bones.map((b) => spec.joints[b].pos[2]);
          const z0 = Math.min(...zs), z1 = Math.max(...zs);
          for (let i = 0; i < a.n; i++) {
            const z = lerp(z1, z0, i / (a.n - 1));
            const y = topY(z);
            // nearest listed bone by z
            let best = a.bones[0], bd = 1e9;
            for (const b of a.bones) { const d = Math.abs(spec.joints[b].pos[2] - z); if (d < bd) { bd = d; best = b; } }
            const s = a.size * (0.6 + 0.4 * Math.sin((i / (a.n - 1)) * Math.PI));
            const geo = new THREE.ConeGeometry(s * 0.55, s * 1.6, 4, 1).scale(0.35, 1, 1).translate(0, s * 0.6, 0);
            list.push({ bone: spec.boneIndex[best], local: new THREE.Vector3(0, y - s * 0.15, z).sub(jpos(best)), geo,
              mat: a.glow ? 'glowplate' : detailMaterial(a.color, 0, 0, 0.7) });
          }
          break;
        }
        case 'quills': {
          const from = new THREE.Vector3(...a.from), to = new THREE.Vector3(...a.to);
          for (let i = 0; i < a.n; i++) {
            const p = from.clone().lerp(to, i / a.n);
            p.y = topY(p.z) - a.len * 0.2;
            const geo = orientY(new THREE.ConeGeometry(a.r, a.len, 4).translate(0, a.len / 2, 0), [0, 1, -0.6]);
            list.push({ bone, local: p.sub(jpos(a.bone)), geo, mat: detailMaterial(a.color, 0, 0, 0.6) });
          }
          break;
        }
      }
    }
    return list;
  }

  buildMembrane(spec) {
    const m = spec.membrane;
    const pts = [], idx = [], si = [], sw = [];
    const chain = m.chain.map((b) => new THREE.Vector3(...spec.joints[b].pos));
    const N = 10;
    const tip = chain[chain.length - 1];
    const root = new THREE.Vector3(0.35, -0.05, -0.9);
    const lead = (t) => { // position along the arm chain
      const segs = chain.length - 1, f = t * segs, i = Math.min(segs - 1, Math.floor(f));
      return { p: chain[i].clone().lerp(chain[i + 1], f - i), bone: spec.boneIndex[m.chain[i]] };
    };
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const base = pts.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const L = lead(t);
        const T = root.clone().lerp(tip, Math.pow(t, 1.15));
        T.z -= Math.sin(t * Math.PI) * 1.2; // scalloped trailing edge
        T.y -= 0.05;
        pts.push(L.p.x * sx, L.p.y, L.p.z, T.x * sx, T.y, T.z);
        const bone = side === 0 ? L.bone : spec.boneIndex[spec.bones[L.bone].replace(/L$/, 'R')];
        const body = spec.boneIndex.body;
        si.push(bone, 0, 0, 0, bone, body, 0, 0);
        const wb = smoothstep(0.0, 0.5, t);
        sw.push(1, 0, 0, 0, wb, 1 - wb, 0, 0);
        if (i < N) {
          const a = base + i * 2;
          if (side === 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return { geo, color: m.color };
  }

  sharedMat(name) {
    this._mats ||= {};
    if (!this._mats[name]) {
      this._mats[name] = {
        ivory: () => detailMaterial(0xe9dfc8, 0, 0, 0.4),
        claw: () => detailMaterial(0x1c1a18, 0, 0, 0.35),
        crystal: () => detailMaterial(0xff7a20, 0xff4a08, 4.0, 0.15),
        glowplate: () => detailMaterial(0x2a1c18, 0xff3a00, 0.6, 0.8),
      }[name]();
    }
    return this._mats[name];
  }

  // ---------------------------------------------------------------- instances
  spawn(id, at, opts = {}) {
    const asset = this.assets[id];
    const spec = asset.spec;
    const mat = makeSkinMaterial(asset.skinTex, spec.texScale, { rim: spec.rim, glow: spec.glow, roughness: spec.roughness, bump: spec.bump });
    const mesh = new THREE.SkinnedMesh(asset.geometry, mat);
    const bones = spec.bones.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    spec.bones.forEach((name, i) => {
      const j = spec.joints[name];
      const p = new THREE.Vector3(...j.pos);
      if (j.parent) {
        p.sub(new THREE.Vector3(...spec.joints[j.parent].pos));
        bones[spec.boneIndex[j.parent]].add(bones[i]);
      } else mesh.add(bones[i]);
      bones[i].position.copy(p);
    });
    const skeleton = new THREE.Skeleton(bones, asset.boneInverses.map((m) => m.clone()));
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.boundingSphere = asset.boundingSphere.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const crystals = [];
    for (const a of asset.attachments) {
      const material = typeof a.mat === 'string' ? (a.mat === 'crystal' ? this.sharedMat('crystal').clone() : this.sharedMat(a.mat)) : a.mat;
      const part = new THREE.Mesh(a.geo, material);
      part.position.copy(a.local);
      part.castShadow = a.mat !== 'ivory';
      bones[a.bone].add(part);
      if (a.weak !== undefined) crystals[a.weak] = { mesh: part, hp: 900, alive: true };
    }
    if (asset.membrane) {
      const mm = new THREE.SkinnedMesh(asset.membrane.geo, new THREE.MeshStandardMaterial({
        color: asset.membrane.color, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x200810, emissiveIntensity: 0.4 }));
      mm.bind(skeleton, new THREE.Matrix4());
      mm.boundingSphere = asset.boundingSphere.clone();
      mm.castShadow = true;
      mesh.add(mm);
      mesh.userData.membrane = mm;
    }
    const s = spec.scale;
    mesh.scale.setScalar(s * (opts.sizeJitter ? 0.9 + this.rand() * 0.2 : 1));
    const root = new THREE.Group();
    root.add(mesh);
    this.ctx.scene.add(root);
    const b = {};
    bones.forEach((bone) => { b[bone.name] = bone; });
    const scale = mesh.scale.x;
    const m = {
      id, spec, asset, root, mesh, mat, bones: b, boneList: bones, crystals, scale,
      pos: at.clone(), heading: opts.heading ?? this.rand() * Math.PI * 2, speed: 0, vel: new THREE.Vector3(),
      hp: spec.hp * (opts.hpMul || 1), maxHp: spec.hp * (opts.hpMul || 1),
      state: 'wander', timer: 0, phase: this.rand() * 10, alert: false, flash: 0, dying: 0, dissolve: 0,
      target: null, cooldown: 2 + this.rand() * 3, roar: 0, jawOpen: 0, look: 0, pitch: 0, bank: 0,
      packLeader: opts.leader || null, packOffset: opts.offset || null, nest: opts.nest || at.clone(),
      radius: spec.radius * scale, height: spec.height * scale, alive: true, heartExposed: false,
      roarTimer: 4 + this.rand() * 8, summonTimer: 10, barrageTimer: 4, rainTimer: 9,
    };
    if (spec.flies) {
      m.pos.y = Math.max(m.pos.y, this.ctx.terrain.groundOrWater(m.pos.x, m.pos.z) + 120 + this.rand() * 150);
      m.vel.set(Math.sin(m.heading), 0, Math.cos(m.heading)).multiplyScalar(spec.walk * scale * 0.5);
    }
    if (spec.boss) {
      mat.userData.u.uGlow.value.set(0xff4a0a);
      // glowing heart in the chest, exposed when the crystals are gone
      const heart = new THREE.Mesh(new THREE.SphereGeometry(spec.girth * 0.35, 20, 14), detailMaterial(0x200400, 0xff2a00, 0.5, 0.3));
      const chestLocal = new THREE.Vector3(0, -spec.girth * 0.2, spec.girth * 0.75);
      heart.position.copy(chestLocal);
      b.chest.add(heart);
      m.heart = heart;
      m.heartSphere = { bone: spec.boneIndex.chest, local: chestLocal, r: spec.girth * 0.6, heart: true };
    }
    this.place(m, 0);
    this.list.push(m);
    return m;
  }

  remove(m) {
    this.ctx.scene.remove(m.root);
    m.mat.dispose();
    for (const c of m.crystals) if (c) c.mesh.material.dispose();
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
  }

  get alive() { return this.list.filter((m) => m.alive); }

  // ---------------------------------------------------------------- hits
  worldSpheres(m, out = []) {
    out.length = 0;
    const list = m.asset.spheres;
    for (const s of list) {
      if (s.weak !== undefined && !(m.crystals[s.weak] && m.crystals[s.weak].alive)) continue;
      const bone = m.boneList[s.bone];
      const p = s._w || (s._w = new THREE.Vector3());
      out.push({ p: p.copy(s.local).applyMatrix4(bone.matrixWorld).clone(), r: s.r * m.scale, weak: s.weak });
    }
    if (m.heartExposed && m.heartSphere) {
      const hs = m.heartSphere;
      out.push({ p: hs.local.clone().applyMatrix4(m.boneList[hs.bone].matrixWorld), r: hs.r * m.scale, heart: true });
    }
    return out;
  }

  center(m, out = new THREE.Vector3()) {
    if (m.spec.flies) return out.copy(m.pos);
    return out.copy(m.pos).addScaledVector(UP, m.height * 0.55);
  }

  // Where guided weapons should go: the centre, or for the boss the weak point (a crystal
  // still standing, or the exposed heart) closest to the line the shooter is looking along.
  aimPoint(m, from, dir, out = new THREE.Vector3()) {
    if (!m.spec.boss) return this.center(m, out);
    let best = Infinity;
    for (const s of this.worldSpheres(m, this._aim || (this._aim = []))) {
      if (s.weak === undefined && !s.heart) continue;
      const to = _v1.subVectors(s.p, from);
      const along = Math.max(0, to.dot(dir));
      const off = to.addScaledVector(dir, -along).length() / Math.max(1, along);
      if (off < best) { best = off; out.copy(s.p); }
    }
    return best < Infinity ? out : this.center(m, out);
  }

  // First monster hit by the segment p0->p1 (bullets).
  segmentHit(p0, p1, pad = 0) {
    const dir = _v1.subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-6) return null;
    dir.divideScalar(len);
    let best = null;
    const tmpC = new THREE.Vector3();
    for (const m of this.list) {
      if (!m.alive) continue;
      const c = this.center(m, tmpC);
      const R = Math.max(m.radius * 2.6, m.height * 0.9) + pad;
      if (segSphere(p0, dir, len, c, R) === null) continue;
      const spheres = this.worldSpheres(m, this._sph || (this._sph = []));
      for (const s of spheres) {
        const t = segSphere(p0, dir, len, s.p, s.r + pad);
        if (t !== null && (!best || t < best.t)) best = { t, m, sphere: s, point: p0.clone().addScaledVector(dir, t) };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- damage
  damage(m, amount, point, hit = {}) {
    if (!m.alive) return;
    const spec = m.spec;
    m.alert = true;
    m.flash = 1;
    if (spec.boss) {
      const alive = m.crystals.filter((c) => c && c.alive);
      if (hit.sphere && hit.sphere.weak !== undefined) {
        const c = m.crystals[hit.sphere.weak];
        c.hp -= amount;
        c.mesh.material.emissiveIntensity = 8;
        if (c.hp <= 0 && c.alive) {
          c.alive = false;
          c.mesh.visible = false;
          const wp = c.mesh.getWorldPosition(new THREE.Vector3());
          this.ctx.fx.explosion(wp, 3.2);
          this.ctx.audio.explosion(2.2, wp);
          this.ctx.events.onCrystal?.(m, m.crystals.filter((k) => k && k.alive).length);
          if (!m.crystals.some((k) => k && k.alive)) {
            m.heartExposed = true;
            m.heart.material.emissiveIntensity = 6;
            m.state = 'enraged';
          }
        }
        return;
      }
      if (alive.length) { this.ctx.fx.sparks(point, 0.6, 0xffc080); this.ctx.events.onArmor?.(m); return; }
      amount *= hit.sphere && hit.sphere.heart ? 2.5 : 0.6;
    } else if (spec.armored && hit.dir) {
      // armour on the front: hits from the side/back hurt more
      const fwd = _v2.set(Math.sin(m.heading), 0, Math.cos(m.heading));
      const facing = -fwd.dot(_v3.copy(hit.dir).setY(0).normalize());
      amount *= facing > 0.5 ? 0.5 : 1.2;
    }
    m.hp -= amount;
    if (m.hp <= 0) this.kill(m, point);
  }

  kill(m, point) {
    if (!m.alive) return;
    m.alive = false;
    m.state = 'dying';
    m.dying = 0;
    const c = this.center(m, new THREE.Vector3());
    const big = m.spec.boss ? 6 : clamp(m.height / 12, 0.8, 3.5);
    this.ctx.fx.explosion(c, big);
    this.ctx.audio.roar(m.spec.sound, c, 1.2, true);
    this.ctx.audio.explosion(big, c);
    m.fallSide = this.rand() < 0.5 ? -1 : 1;
    this.ctx.events.onKill?.(m, point || c);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, time, player) {
    this.time = time;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (m.alive) this.think(m, dt, player);
      else this.dyingStep(m, dt);
      m.flash = Math.max(0, m.flash - dt * 4);
      m.mat.userData.u.uFlash.value = m.flash;
      for (const c of m.crystals) if (c && c.alive) c.mesh.material.emissiveIntensity = damp(c.mesh.material.emissiveIntensity, 4 + Math.sin(time * 4) * 1.5, 6, dt);
      if (m.heartExposed) m.heart.material.emissiveIntensity = 5 + Math.sin(time * 9) * 2.5;
    }
    this.separate(dt);
  }

  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (!a.alive || !b.alive || a.spec.flies || b.spec.flies) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = (a.radius + b.radius) * 1.2;
      if (d > 0.01 && d < min) {
        const push = (min - d) * 0.5 * Math.min(1, dt * 4) / d;
        const wa = b.spec.boss ? 1 : 0.5, wb = a.spec.boss ? 1 : 0.5;
        if (!a.spec.boss) { a.pos.x -= dx * push * wa * 2; a.pos.z -= dz * push * wa * 2; }
        if (!b.spec.boss) { b.pos.x += dx * push * wb * 2; b.pos.z += dz * push * wb * 2; }
      }
    }
  }

  think(m, dt, player) {
    const spec = m.spec, T = this.ctx.terrain;
    m.timer -= dt;
    m.cooldown -= dt;
    m.roarTimer -= dt;
    const toP = _v1.subVectors(player.pos, m.pos);
    const distP = toP.length();
    const horiz = Math.hypot(toP.x, toP.z);
    if (distP < 1500 && player.alive) m.alert = true;
    if (spec.flies) return this.thinkFlyer(m, dt, player, distP);
    if (spec.boss) return this.thinkBoss(m, dt, player, distP);

    let desired = m.heading, targetSpeed = spec.walk;
    const scale = m.scale;
    if (spec.id === 'raptor' && player.alive && horiz < 600 && player.pos.y - m.pos.y < 260) {
      m.state = 'flee';
      desired = Math.atan2(-toP.x, -toP.z) + Math.sin(this.time * 1.5 + m.phase) * 0.6;
      targetSpeed = spec.speed;
    } else if (m.packLeader && m.packLeader.alive) {
      const L = m.packLeader;
      const tx = L.pos.x + m.packOffset.x, tz = L.pos.z + m.packOffset.z;
      desired = Math.atan2(tx - m.pos.x, tz - m.pos.z);
      const d = Math.hypot(tx - m.pos.x, tz - m.pos.z);
      targetSpeed = clamp(d / 6, 0, L.speed / scale * 1.3 + 2);
      if (d < 3 * scale) targetSpeed = L.speed / scale;
      m.state = 'pack';
    } else {
      if (!m.target || m.timer <= 0 || Math.hypot(m.target.x - m.pos.x, m.target.z - m.pos.z) < 8 * scale) {
        m.target = T.findLandPoint(this.rand, { near: m.nest, nearR: spec.id === 'longneck' ? 700 : 500, maxSlope: 0.4, minHeightAboveWater: spec.wades ? -3 : 2 });
        m.timer = 12 + this.rand() * 10;
        if (this.rand() < 0.25) { m.timer = 3 + this.rand() * 3; m.target = m.pos.clone(); }
      }
      desired = Math.atan2(m.target.x - m.pos.x, m.target.z - m.pos.z);
      const d = Math.hypot(m.target.x - m.pos.x, m.target.z - m.pos.z);
      targetSpeed = d < 4 * scale ? 0 : spec.walk;
      m.state = 'wander';
      if (spec.id === 'horned' && m.alert && player.alive && horiz < 700 && player.pos.y - m.pos.y < 200) {
        desired = Math.atan2(toP.x, toP.z);
        targetSpeed = spec.speed;
        m.state = 'charge';
      }
      if (spec.fire && m.alert) {
        desired = Math.atan2(toP.x, toP.z);
        targetSpeed = horiz > 700 ? spec.walk : 0;
        m.state = 'hunt';
      }
    }

    // avoid water and cliffs ahead
    const ahead = 4 * m.radius + 10;
    const ax = m.pos.x + Math.sin(desired) * ahead, az = m.pos.z + Math.cos(desired) * ahead;
    const hAhead = T.heightAt(ax, az);
    if ((!spec.wades && hAhead < T.waterLevel + 1) || hAhead - m.pos.y > ahead * 0.7 || Math.hypot(ax, az) > 3900) {
      desired = m.heading + Math.PI * 0.6;
      m.target = null;
    }

    const turnRate = (spec.id === 'raptor' ? 3 : 1.1) / Math.sqrt(scale / 2);
    m.heading += clamp(wrapAngle(desired - m.heading), -turnRate * dt, turnRate * dt);
    m.speed = damp(m.speed, targetSpeed * scale, 2.5, dt);
    m.pos.x += Math.sin(m.heading) * m.speed * dt;
    m.pos.z += Math.cos(m.heading) * m.speed * dt;

    // fire breath / fireball
    if (spec.fire && m.alert && player.alive && distP < 1700 && m.cooldown <= 0) {
      if (m.roar <= 0) { m.roar = 1.0; this.ctx.audio.roar(spec.sound, m.pos, 1); }
    }
    if (m.roar > 0) {
      m.roar -= dt;
      if (m.roar <= 0.25 && !m.fired) {
        m.fired = true;
        const mouth = this.mouth(m);
        this.ctx.weapons.enemyShot('fire', mouth, player, 175);
        m.cooldown = 3.2 + this.rand() * 2.5;
      }
      if (m.roar <= 0) m.fired = false;
    } else if (m.roarTimer <= 0) {
      m.roarTimer = 9 + this.rand() * 12;
      m.roar = 0.9;
      m.idleRoar = true;
      if (distP < 1200) this.ctx.audio.roar(spec.sound, m.pos, 0.8);
    }
    if (m.roar <= 0) m.idleRoar = false;

    // tail swipe of the giant
    if (spec.id === 'longneck' && player.alive && distP < m.height * 2.2 && m.cooldown <= 0) {
      m.cooldown = 3;
      this.ctx.events.onPlayerHit?.(14, m.pos, 'tail');
    }
    this.place(m, dt);
  }

  mouth(m) {
    const mo = m.spec.mouth || [0, 0, 1];
    return new THREE.Vector3(mo[0], mo[1], mo[2]).applyMatrix4(m.bones.head.matrixWorld);
  }

  thinkFlyer(m, dt, player, distP) {
    const spec = m.spec, T = this.ctx.terrain, scale = m.scale;
    let desired = _v2;
    const speedCruise = spec.speed;
    if (m.alert && player.alive && distP < 2600) {
      // pursue a point slightly ahead of the jet, then break away after passing
      const lead = _v3.copy(player.vel).multiplyScalar(clamp(distP / 250, 0, 1.2));
      desired.copy(player.pos).add(lead).sub(m.pos);
      if (m.breakTimer > 0) {
        m.breakTimer -= dt;
        desired.set(Math.sin(m.phase * 3), 0.3, Math.cos(m.phase * 3));
      } else if (distP < 60) m.breakTimer = 2.5;
      m.state = 'chase';
      if (spec.spit && distP < 700 && distP > 120 && m.cooldown <= 0) {
        const fwd = m.vel.clone().normalize();
        if (fwd.dot(_v1.copy(player.pos).sub(m.pos).normalize()) > 0.8) {
          this.ctx.weapons.enemyShot('acid', this.mouth(m), player, 210);
          m.cooldown = 2.6 + this.rand() * 2;
          this.ctx.audio.roar(spec.sound, m.pos, 0.6);
        }
      }
      if (distP < m.radius + 12 && m.cooldown < 1.5) {
        m.cooldown = 2.5;
        this.ctx.events.onPlayerHit?.(10, m.pos, 'bite');
      }
    } else {
      // circle around the nest
      const a = this.time * 0.25 + m.phase;
      desired.set(m.nest.x + Math.cos(a) * 500 - m.pos.x, (m.nest.y + 220 + Math.sin(a * 2) * 60) - m.pos.y, m.nest.z + Math.sin(a) * 500 - m.pos.z);
      m.state = 'circle';
    }
    desired.normalize();
    const ground = T.groundOrWater(m.pos.x, m.pos.z);
    if (m.pos.y < ground + 45) desired.y = Math.max(desired.y, 0.6);
    const speed = (m.state === 'chase' ? speedCruise : speedCruise * 0.6);
    const cur = _v3.copy(m.vel).normalize();
    const maxTurn = 1.6 * dt;
    const angle = cur.angleTo(desired);
    if (angle > 1e-4) {
      const axis = _v1.crossVectors(cur, desired).normalize();
      cur.applyAxisAngle(axis, Math.min(angle, maxTurn));
    }
    const oldHeading = m.heading;
    m.vel.copy(cur).multiplyScalar(damp(m.vel.length(), speed, 1.5, dt));
    m.pos.addScaledVector(m.vel, dt);
    m.pos.y = Math.max(m.pos.y, ground + 20);
    m.heading = Math.atan2(cur.x, cur.z);
    m.pitch = -Math.asin(clamp(cur.y, -1, 1));
    m.bank = damp(m.bank, clamp(wrapAngle(m.heading - oldHeading) / Math.max(dt, 1e-3) * -0.5, -1, 1), 4, dt);
    m.speed = m.vel.length();
    this.place(m, dt);
  }

  thinkBoss(m, dt, player, distP) {
    const spec = m.spec;
    const toP = _v1.subVectors(player.pos, m.pos);
    const desired = Math.atan2(toP.x, toP.z);
    const rate = m.state === 'enraged' ? 0.45 : 0.3;
    m.heading += clamp(wrapAngle(desired - m.heading), -rate * dt, rate * dt);
    // slow walk inside the lake
    const home = m.nest;
    const away = Math.hypot(m.pos.x - home.x, m.pos.z - home.z);
    m.speed = damp(m.speed, away < 220 && Math.abs(wrapAngle(desired - m.heading)) < 0.5 ? spec.walk * m.scale : 0, 1, dt);
    m.pos.x += Math.sin(m.heading) * m.speed * dt;
    m.pos.z += Math.cos(m.heading) * m.speed * dt;
    if (!player.alive) { this.place(m, dt); return; }
    const enraged = m.state === 'enraged';
    m.barrageTimer -= dt; m.rainTimer -= dt; m.summonTimer -= dt;
    if (m.barrageTimer <= 0 && distP < 2600) {
      m.barrageTimer = enraged ? 3.2 : 5;
      m.roar = 1.2; m.fired = false;
      this.ctx.audio.roar(spec.sound, m.pos, 1.3);
      m.pendingBarrage = enraged ? 7 : 5;
    }
    if (m.roar > 0) {
      m.roar -= dt;
      if (m.roar < 0.4 && m.pendingBarrage) {
        const mouth = this.mouth(m);
        for (let i = 0; i < m.pendingBarrage; i++) {
          const spread = (i - (m.pendingBarrage - 1) / 2) * 0.09;
          this.ctx.weapons.enemyShot('fire', mouth, player, 190, spread, 1.6);
        }
        m.pendingBarrage = 0;
      }
    }
    if (m.rainTimer <= 0 && distP < 3000) {
      m.rainTimer = enraged ? 7 : 10;
      for (let i = 0; i < (enraged ? 9 : 6); i++) this.ctx.weapons.meteor(player, i);
      this.ctx.events.onBossMove?.('rain');
    }
    if (m.summonTimer <= 0) {
      m.summonTimer = enraged ? 16 : 22;
      const flyers = this.list.filter((k) => k.alive && k.spec.flies).length;
      if (flyers < 6) {
        for (let i = 0; i < 2; i++) {
          const p = m.pos.clone().add(new THREE.Vector3((this.rand() - 0.5) * 80, m.height * 0.8, (this.rand() - 0.5) * 80));
          const f = this.spawn('flyer', p, { nest: p.clone() });
          f.alert = true;
          f.vel.set(0, 30, 0);
        }
        this.ctx.events.onBossMove?.('summon');
      }
    }
    this.place(m, dt);
  }

  // ---------------------------------------------------------------- animation and placement
  place(m, dt) {
    const spec = m.spec, T = this.ctx.terrain;
    if (!spec.flies) {
      const ground = T.heightAt(m.pos.x, m.pos.z);
      m.pos.y = spec.wades || spec.boss ? ground : Math.max(ground, T.waterLevel - 0.5);
      // pitch to the slope
      const f = m.radius * 1.5;
      const hf = T.heightAt(m.pos.x + Math.sin(m.heading) * f, m.pos.z + Math.cos(m.heading) * f);
      const hb = T.heightAt(m.pos.x - Math.sin(m.heading) * f, m.pos.z - Math.cos(m.heading) * f);
      m.pitch = damp(m.pitch, clamp(-Math.atan2(hf - hb, 2 * f) * 0.7, -0.35, 0.35), 4, dt || 1);
    }
    m.root.position.copy(m.pos);
    m.root.rotation.set(0, 0, 0);
    m.root.rotateY(m.heading);
    m.root.rotateX(m.pitch);
    if (spec.flies) m.root.rotateZ(m.bank);
    this.animate(m, dt);
  }

  animate(m, dt) {
    const spec = m.spec, b = m.bones;
    const speedRel = m.speed / m.scale;
    const cyc = spec.flies ? (m.state === 'chase' ? 2.2 : 1.2) : speedRel / spec.stride;
    m.phase += dt * Math.PI * 2 * (spec.flies ? cyc : Math.max(cyc, 0));
    const ph = m.phase;
    const amt = spec.flies ? 1 : clamp(speedRel / (spec.walk * 0.8), 0, 1.25);
    const idle = Math.sin(this.time * 1.3 + m.phase * 0.1);
    m.jawOpen = damp(m.jawOpen, m.roar > 0 ? 1 : (m.state === 'chase' ? 0.25 : 0.05 + 0.05 * idle), 8, dt || 1);
    if (b.jaw) b.jaw.rotation.x = m.jawOpen * (spec.flies ? 0.5 : 0.55);
    if (spec.gait === 'biped') {
      const A = 0.55 * amt, K = 0.9 * amt;
      for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
        const s = Math.sin(ph + off), c = Math.cos(ph + off);
        b['thigh' + side].rotation.x = -s * A;
        b['shin' + side].rotation.x = Math.max(0, c) * K;
        b['foot' + side].rotation.x = s * A * 0.6 - Math.max(0, c) * K * 0.7;
      }
      b.hips.position.y = spec.joints.hips.pos[1] - Math.abs(Math.cos(ph)) * 0.06 * spec.H * amt;
      b.hips.rotation.z = Math.sin(ph) * 0.04 * amt;
      b.spine.rotation.x = -0.04 * amt + (m.roar > 0 ? -0.08 : 0);
      for (let i = 1; i <= 4; i++) {
        const t = b['tail' + i];
        t.rotation.y = Math.sin(ph * 0.5 + i * 0.7 + this.time * 0.8) * (0.05 + 0.03 * i) * (0.4 + amt);
        t.rotation.x = 0.03 * Math.sin(ph + i);
      }
      b.neck.rotation.x = Math.sin(ph * 2) * 0.04 * amt + (m.roar > 0 ? -0.35 * Math.min(1, m.roar * 2) : 0);
      b.head.rotation.x = (m.roar > 0 ? -0.2 : 0.03 * idle);
      b.head.rotation.y = damp(b.head.rotation.y, m.alert ? clamp(m.look, -0.6, 0.6) : 0.2 * Math.sin(this.time * 0.4 + m.phase), 3, dt || 1);
      if (b.armL) { b.armL.rotation.x = 0.3 + Math.sin(ph) * 0.15; b.armR.rotation.x = 0.3 - Math.sin(ph) * 0.15; }
    } else if (spec.gait === 'quad') {
      const A = 0.42 * amt, K = 0.55 * amt;
      const legs = [['hleg', 'hknee', 'hfoot', 'L', 0], ['fleg', 'fknee', 'ffoot', 'L', 0.25], ['hleg', 'hknee', 'hfoot', 'R', 0.5], ['fleg', 'fknee', 'ffoot', 'R', 0.75]];
      for (const [u, k, f, side, off] of legs) {
        const p = ph + off * Math.PI * 2;
        const s = Math.sin(p), c = Math.cos(p);
        b[u + side].rotation.x = -s * A;
        b[k + side].rotation.x = (u === 'hleg' ? 1 : -1) * Math.max(0, c) * K;
        b[f + side].rotation.x = s * A * 0.5;
      }
      b.hips.position.y = spec.joints.hips.pos[1] - Math.abs(Math.sin(ph * 2)) * 0.03 * spec.H * amt;
      b.spine.rotation.z = Math.sin(ph) * 0.03 * amt;
      for (let i = 1; i <= 3; i++) b['tail' + i].rotation.y = Math.sin(ph * 0.5 + i * 0.8 + this.time) * 0.08 * i * (0.5 + amt);
      const roar = m.roar > 0 ? Math.min(1, m.roar * 2) : 0;
      b.neck1.rotation.x = Math.sin(ph) * 0.03 * amt - roar * 0.25 + (spec.id === 'longneck' ? 0.05 * idle : 0);
      b.neck2.rotation.x = -roar * 0.2;
      b.neck1.rotation.y = damp(b.neck1.rotation.y, 0.25 * Math.sin(this.time * 0.3 + m.phase), 2, dt || 1);
      b.head.rotation.x = 0.05 * idle - roar * 0.25;
    } else if (spec.gait === 'flyer') {
      const flap = m.state === 'chase' ? 1 : 0.7;
      const glide = Math.max(0, Math.sin(this.time * 0.3 + m.phase * 0.1)) > 0.8 && m.state !== 'chase';
      const w = glide ? 0.08 * Math.sin(ph) : Math.sin(ph) * 0.75 * flap;
      b.shoulderL.rotation.z = w; b.shoulderR.rotation.z = -w;
      b.elbowL.rotation.z = -w * 0.35 - 0.05; b.elbowR.rotation.z = w * 0.35 + 0.05;
      b.wristL.rotation.y = Math.cos(ph) * 0.15; b.wristR.rotation.y = -Math.cos(ph) * 0.15;
      b.body.position.y = -w * 0.25;
      b.neck.rotation.x = 0.05 * Math.sin(ph);
      b.tail1.rotation.x = 0.1 * Math.sin(ph + 1);
      b.legL.rotation.x = 0.6; b.legR.rotation.x = 0.6;
    }
    // look towards the player a little
    m.look = 0;
  }

  dyingStep(m, dt) {
    m.dying += dt;
    const spec = m.spec, T = this.ctx.terrain;
    if (spec.flies) {
      m.vel.y -= 30 * dt;
      m.vel.multiplyScalar(1 - 0.3 * dt);
      m.pos.addScaledVector(m.vel, dt);
      m.bank += dt * 4 * m.fallSide;
      const ground = T.groundOrWater(m.pos.x, m.pos.z);
      if (m.pos.y <= ground + 2 && !m.landed) {
        m.landed = true; m.pos.y = ground + 2; m.vel.set(0, 0, 0);
        this.ctx.fx.explosion(m.pos, 1.6);
        this.ctx.audio.explosion(1.2, m.pos);
      }
      if (!m.landed && Math.random() < dt * 30) this.ctx.fx.smokePuff(m.pos, 2 * m.scale);
      m.root.position.copy(m.pos);
      m.root.rotation.set(0, 0, 0);
      m.root.rotateY(m.heading); m.root.rotateX(Math.min(1.2, m.dying)); m.root.rotateZ(m.bank);
      if (m.landed) m.dissolve = Math.min(1, m.dissolve + dt * 0.5);
    } else {
      const fall = smoothstep(0, 1.4, m.dying);
      m.root.position.copy(m.pos);
      m.root.position.y -= fall * m.height * 0.12;
      m.root.rotation.set(0, 0, 0);
      m.root.rotateY(m.heading);
      m.root.rotateX(m.pitch);
      m.root.rotateZ(fall * (Math.PI / 2.1) * m.fallSide);
      if (m.dying > 0.9 && !m.thud) { m.thud = true; this.ctx.fx.dust(m.pos, m.height * 0.6); this.ctx.audio.thud(m.height / 10, m.pos); }
      if (m.dying > 2.2) m.dissolve = Math.min(1, m.dissolve + dt * (spec.boss ? 0.15 : 0.45));
      if (m.dying > 2.2 && Math.random() < dt * 25) {
        const c = this.center(m, new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * m.radius * 3, (Math.random() - 0.3) * m.height * 0.5, (Math.random() - 0.5) * m.radius * 3));
        this.ctx.fx.embers(c, m.height * 0.12);
      }
    }
    m.mat.userData.u.uDissolve.value = m.dissolve * 1.05;
    if (m.mesh.userData.membrane) m.mesh.userData.membrane.visible = m.dissolve < 0.5;
    if (m.dissolve >= 1) this.remove(m);
  }
}

// helpers -------------------------------------------------------------------
function segSphere(p0, dir, len, c, r) {
  const ox = p0.x - c.x, oy = p0.y - c.y, oz = p0.z - c.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  if (cc < 0) return 0;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= len ? t : null;
}

function shapeDistAt(s, x, y, z) {
  if (s.type === 0) {
    const px = (x - s.c[0]) / s.r[0], py = (y - s.c[1]) / s.r[1], pz = (z - s.c[2]) / s.r[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / s.r[0], qy = py / s.r[1], qz = pz / s.r[2];
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -1;
  }
  const px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
  let t = (px * s.ba[0] + py * s.ba[1] + pz * s.ba[2]) / s.bb;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - s.ba[0] * t, dy = py - s.ba[1] * t, dz = pz - s.ba[2] * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (s.r1 + (s.r2 - s.r1) * t);
}
function sminJS(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

function mergeSimple(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
