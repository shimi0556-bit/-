// In-flight display (Hebrew, right to left): score and combo, objective, lives, boss bar,
// hull/boost/missiles/heat gauges, and a canvas layer with the gun sight, target brackets,
// lock-on diamond, lead pipper, off-screen arrows, radar, kill popups and damage arcs.
import * as THREE from 'three';
import { SPECIES } from '../actors/species.js';
import { PICKUPS } from '../actors/pickups.js';
import { clamp, formatInt } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const FONT = "'Rubik', 'Segoe UI', Arial, sans-serif";

export class HUD {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#hud-canvas');
    this.g = this.canvas.getContext('2d');
    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      score: $('h-score'), combo: $('h-combo'), objTitle: $('h-obj-title'), objBar: $('h-obj-bar'), objSub: $('h-obj-sub'),
      lives: $('h-lives'), boss: $('h-boss'), bossBar: $('h-boss-bar'), bossName: $('h-boss-name'), crystals: $('h-crystals'),
      hull: $('h-hull'), hullVal: $('h-hull-val'), boost: $('h-boost'), heat: $('h-heat'), missiles: $('h-missiles'), reload: $('h-reload'),
      msg: $('h-msg'), msgTitle: $('h-msg-title'), msgSub: $('h-msg-sub'), toast: $('h-toast'), warn: $('h-warn'), fps: $('h-fps'),
      weapons: $('h-weapons'),
    };
    this.popups = [];
    this.damageArcs = [];
    this.hitTimer = 0;
    this.killTimer = 0;
    this.msgTimer = 0;
    this.toastTimer = 0;
    this.last = {};
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.compact = this.w < 700 || this.h < 500;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  setLives(n, max = 3) {
    let html = '';
    for (let i = 0; i < max; i++) html += `<i class="${i < n ? 'on' : ''}"></i>`;
    this.el.lives.innerHTML = html;
  }

  setBoss(m) {
    this.boss = m;
    this.el.boss.classList.toggle('hidden', !m);
    if (m) this.el.bossName.textContent = m.spec.name;
  }

  message(title, sub = '', duration = 2.6, kind = '') {
    this.el.msgTitle.textContent = title;
    this.el.msgSub.textContent = sub;
    this.el.msg.className = 'hud-msg show ' + kind;
    this.msgTimer = duration;
  }

  toast(text, color = '') {
    this.el.toast.textContent = text;
    this.el.toast.style.color = color;
    this.el.toast.classList.remove('show');
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('show');
    this.toastTimer = 2.2;
  }

  popup(pos, text, color = '#ffd36a', big = false) {
    this.popups.push({ pos: pos.clone(), text, color, t: 0, big });
  }

  hitMarker(kill = false) { this.hitTimer = 0.18; if (kill) this.killTimer = 0.4; }

  damage(fromPos) { this.damageArcs.push({ pos: fromPos ? fromPos.clone() : null, t: 0 }); }

  // project to CSS pixels; returns behind=true when behind the camera
  project(camera, p, out) {
    _v.copy(p).project(camera);
    const behind = _v.z > 1;
    out.x = (_v.x * 0.5 + 0.5) * this.w;
    out.y = (-_v.y * 0.5 + 0.5) * this.h;
    out.behind = behind;
    out.on = !behind && out.x > -20 && out.x < this.w + 20 && out.y > -20 && out.y < this.h + 20;
    return out;
  }

  update(dt, s) {
    this.time += dt;
    const { jet, weapons, monsters, camera, game } = s;
    const E = this.el;
    // DOM gauges (only touch the DOM when a value changes)
    this.set('score', E.score, formatInt(game.score));
    this.set('combo', E.combo, game.combo > 1 ? `x${game.combo}` : '');
    this.set('objTitle', E.objTitle, game.objTitle);
    this.set('objSub', E.objSub, game.objSub);
    this.set('objBar', E.objBar.style, `${Math.round(game.objProgress * 100)}%`, 'width');
    const hp = Math.max(0, jet.hp) / jet.maxHp;
    this.set('hull', E.hull.style, `${Math.round(hp * 100)}%`, 'width');
    this.set('hullVal', E.hullVal, `${Math.ceil(Math.max(0, jet.hp))}`);
    this.set('hullLow', E.weapons, hp < 0.3 ? 'hud-weapons low' : 'hud-weapons', 'className');
    this.set('boost', E.boost.style, `${Math.round(jet.boost * 100)}%`, 'width');
    this.set('heat', E.heat.style, `${Math.round(weapons.heat * 100)}%`, 'width');
    this.set('heatHot', E.heat, weapons.overheated ? 'hot' : '', 'className');
    let mis = '';
    for (let i = 0; i < 4; i++) mis += `<i class="${i < jet.missilesLeft ? 'on' : ''}"></i>`;
    this.set('missiles', E.missiles, mis, 'innerHTML');
    this.set('reload', E.reload.style, jet.missilesLeft < 4 ? `${Math.round((1 - weapons.reloadTimer / 5.5) * 100)}%` : '0%', 'width');
    if (this.boss) {
      const b = this.boss;
      this.set('bossBar', E.bossBar.style, `${Math.round(clamp(b.hp / b.maxHp, 0, 1) * 100)}%`, 'width');
      let cr = '';
      for (const c of b.crystals) if (c) cr += `<i class="${c.alive ? 'on' : ''}"></i>`;
      this.set('crystals', E.crystals, cr + (b.heartExposed ? '<b>הלב חשוף!</b>' : ''), 'innerHTML');
    }
    // warnings
    let warn = '';
    if (s.warnings.ground) warn = 'גובה נמוך! משכו למעלה';
    else if (s.threats > 0) warn = 'סכנה מתקרבת! תמרנו';
    else if (s.warnings.boundary) warn = 'יציאה מאזור הקרב';
    else if (s.warnings.ceiling) warn = 'גובה מקסימלי';
    else if (weapons.overheated) warn = 'התותח התחמם';
    this.set('warn', E.warn, warn);
    this.set('warnOn', E.warn, warn ? 'hud-warn show' : 'hud-warn', 'className');
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) E.msg.classList.remove('show'); }
    if (s.fps !== undefined) this.set('fps', E.fps, s.fps ? `${s.fps} FPS` : '');

    this.draw(dt, s);
  }

  draw(dt, s) {
    const g = this.g, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const { jet, weapons, monsters, camera, pickups } = s;
    const cam = camera;
    const P = { x: 0, y: 0 };
    g.lineJoin = 'round';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    const accent = '#9dffcf';

    // ---- gun boresight and flight data
    if (jet.alive && s.cameraMode !== 'intro') {
      const aim = this.project(cam, _w.copy(jet.pos).addScaledVector(jet.forward, 420), {});
      if (!aim.behind) {
        const x = aim.x, y = aim.y, r = this.compact ? 13 : 16;
        g.strokeStyle = 'rgba(160,255,210,0.9)';
        g.lineWidth = 2;
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.beginPath(); g.moveTo(x + dx * (r + 4), y + dy * (r + 4)); g.lineTo(x + dx * (r + 12), y + dy * (r + 12)); g.stroke();
        }
        g.fillStyle = 'rgba(160,255,210,0.95)';
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
        // hit marker
        if (this.hitTimer > 0) {
          this.hitTimer -= dt;
          g.strokeStyle = this.killTimer > 0 ? '#ff5a3a' : '#ffffff';
          g.lineWidth = this.killTimer > 0 ? 3 : 2;
          const a = r * 0.55, b = r * 1.2;
          for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.beginPath(); g.moveTo(x + sx * a, y + sy * a); g.lineTo(x + sx * b, y + sy * b); g.stroke(); }
        }
        if (this.killTimer > 0) this.killTimer -= dt;
        // speed (left) and altitude (right) beside the sight
        if (!this.compact) {
          g.font = `600 15px ${FONT}`;
          g.fillStyle = 'rgba(190,255,225,0.95)';
          g.textAlign = 'right';
          g.direction = 'ltr';
          const spd = Math.round(jet.speed * 3.6), alt = Math.round(jet.pos.y - s.ground);
          g.fillText(`${spd}`, x - r - 48, y);
          g.textAlign = 'left';
          g.fillText(`${alt}`, x + r + 48, y);
          g.font = `500 10px ${FONT}`;
          g.fillStyle = 'rgba(190,255,225,0.6)';
          g.textAlign = 'right';
          g.fillText('קמ"ש', x - r - 48, y + 15);
          g.textAlign = 'left';
          g.fillText('גובה מ\'', x + r + 48, y + 15);
          g.direction = 'rtl';
        }
        g.shadowBlur = 0;
      }
    }

    // ---- monsters: brackets, labels, health, arrows
    const cx = this.w / 2, cy = this.h / 2;
    const edgeR = Math.min(this.w, this.h) * 0.42;
    for (const m of monsters.list) {
      if (!m.alive) continue;
      const c = monsters.center(m, _w);
      const dist = c.distanceTo(jet.pos);
      if (dist > 3200 && !m.spec.boss) continue;
      this.project(cam, c, P);
      const locked = weapons.lockTarget === m;
      const col = m.spec.boss ? '#ff4a2a' : locked ? (weapons.locked ? '#ff4a3a' : '#ffd166') : 'rgba(255,170,90,0.95)';
      if (P.on) {
        // projected size
        const size = clamp((Math.max(m.height, m.radius * 2.4) / dist) * (this.h / (2 * Math.tan((cam.fov * Math.PI) / 360))), 14, 220);
        const half = size * 0.6;
        g.strokeStyle = col;
        g.lineWidth = locked ? 2.5 : 1.6;
        const L = Math.max(5, half * 0.35);
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = P.x + sx * half, y = P.y + sy * half;
          g.moveTo(x, y - sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y);
        }
        g.stroke();
        // label
        if (dist < 2200 || locked || m.spec.boss) {
          g.font = `600 ${this.compact ? 11 : 12}px ${FONT}`;
          g.textAlign = 'center';
          g.fillStyle = col;
          g.fillText(`${m.spec.name} · ${Math.round(dist)}`, P.x, P.y + half + 11);
        }
        // health bar when hurt
        if (m.hp < m.maxHp && !m.spec.boss) {
          const bw = Math.max(26, half * 1.4), f = clamp(m.hp / m.maxHp, 0, 1);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(P.x - bw / 2, P.y - half - 9, bw, 4);
          g.fillStyle = f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffd166' : '#ff5a3a';
          g.fillRect(P.x - bw / 2, P.y - half - 9, bw * f, 4);
        }
        // lock diamond
        if (locked) {
          const k = weapons.locked ? 1 : weapons.lockProgress;
          const d = half + 26 * (1 - k) + 8;
          g.save();
          g.translate(P.x, P.y);
          g.rotate(weapons.locked ? 0 : this.time * 4);
          g.strokeStyle = weapons.locked ? '#ff4a3a' : '#ffd166';
          g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(0, -d); g.lineTo(d, 0); g.lineTo(0, d); g.lineTo(-d, 0); g.closePath(); g.stroke();
          g.restore();
          if (weapons.locked) {
            g.font = `700 13px ${FONT}`;
            g.fillStyle = '#ff6a4a';
            g.textAlign = 'center';
            g.fillText('נעול — שגרו טיל!', P.x, P.y - d - 12);
          }
        }
      } else {
        // off-screen arrow on an ellipse around the centre
        let dx = P.x - cx, dy = P.y - cy;
        if (P.behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const ax = cx + Math.cos(ang) * edgeR * (this.w / Math.min(this.w, this.h)) * 0.9;
        const ay = cy + Math.sin(ang) * edgeR;
        if (dist < 2400 || m.spec.boss) {
          g.save();
          g.translate(clamp(ax, 30, this.w - 30), clamp(ay, 60, this.h - 40));
          g.rotate(ang);
          g.fillStyle = col;
          g.globalAlpha = m.spec.boss ? 1 : clamp(1.4 - dist / 2400, 0.35, 0.9);
          const s2 = m.spec.boss ? 13 : 9;
          g.beginPath(); g.moveTo(s2, 0); g.lineTo(-s2 * 0.7, s2 * 0.7); g.lineTo(-s2 * 0.35, 0); g.lineTo(-s2 * 0.7, -s2 * 0.7); g.closePath(); g.fill();
          g.restore();
        }
      }
    }

    // ---- lead pipper for the cannon
    const lt = weapons.assistTarget || (weapons.lockTarget && weapons.lockTarget.alive ? weapons.lockTarget : null);
    if (lt && jet.alive) {
      weapons.leadPoint(jet, lt, _w);
      if (_w.distanceTo(jet.pos) < 1600) {
        this.project(cam, _w, P);
        if (P.on) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(P.x, P.y, 6, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(P.x, P.y, 1.5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
        }
      }
    }

    // ---- pickups
    for (const p of pickups.list) {
      const dist = p.pos.distanceTo(jet.pos);
      if (dist > 2600) continue;
      this.project(cam, p.pos, P);
      if (!P.on) continue;
      const def = PICKUPS[p.kind];
      const col = '#' + new THREE.Color(def.color).getHexString();
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
      g.beginPath(); g.moveTo(P.x, P.y - 9); g.lineTo(P.x + 9, P.y); g.lineTo(P.x, P.y + 9); g.lineTo(P.x - 9, P.y); g.closePath(); g.stroke();
      g.font = `600 11px ${FONT}`; g.textAlign = 'center';
      g.fillText(`${def.name} · ${Math.round(dist)}`, P.x, P.y + 20);
    }

    // ---- popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.4) { this.popups.splice(i, 1); continue; }
      this.project(cam, p.pos, P);
      if (!P.on) continue;
      g.globalAlpha = clamp(1.6 - p.t, 0, 1);
      g.font = `800 ${p.big ? 26 : 18}px ${FONT}`;
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText(p.text, P.x, P.y - p.t * 40);
      g.fillStyle = p.color;
      g.fillText(p.text, P.x, P.y - p.t * 40);
      g.globalAlpha = 1;
    }

    // ---- damage direction arcs
    for (let i = this.damageArcs.length - 1; i >= 0; i--) {
      const d = this.damageArcs[i];
      d.t += dt;
      if (d.t > 1.2) { this.damageArcs.splice(i, 1); continue; }
      let ang = -Math.PI / 2;
      if (d.pos) {
        this.project(cam, d.pos, P);
        let dx = P.x - cx, dy = P.y - cy;
        if (P.behind) { dx = -dx; dy = -dy; }
        if (Math.abs(dx) + Math.abs(dy) > 1) ang = Math.atan2(dy, dx);
      }
      g.strokeStyle = `rgba(255,60,40,${0.85 * (1 - d.t / 1.2)})`;
      g.lineWidth = 7;
      g.beginPath(); g.arc(cx, cy, Math.min(this.w, this.h) * 0.22, ang - 0.35, ang + 0.35); g.stroke();
    }

    // ---- radar
    this.drawRadar(g, s);
  }

  drawRadar(g, s) {
    const { jet, monsters, pickups } = s;
    const R = this.compact ? 54 : 74;
    const x0 = R + 16, y0 = R + (this.compact ? 62 : 72); // under the pause button and lives
    const range = 2600;
    g.save();
    g.translate(x0, y0);
    g.fillStyle = 'rgba(6,16,14,0.55)';
    g.strokeStyle = 'rgba(160,255,210,0.5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(160,255,210,0.18)';
    g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
    // sweep
    const sw = (this.time * 1.6) % (Math.PI * 2);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, 'rgba(120,255,190,0.0)'); grd.addColorStop(1, 'rgba(120,255,190,0.16)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, sw - 0.5, sw); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
    const f = jet.forward;
    const heading = Math.atan2(f.x, -f.z); // 0 = north (-Z)
    const toRadar = (wx, wz) => {
      const dx = wx - jet.pos.x, dz = wz - jet.pos.z;
      // rotate so the jet's heading points up
      const c = Math.cos(-heading), sn = Math.sin(-heading);
      const rx = dx * c - (-dz) * sn, ry = dx * sn + (-dz) * c;
      return [(rx / range) * R, -(ry / range) * R];
    };
    for (const p of pickups.list) {
      const [x, y] = toRadar(p.pos.x, p.pos.z);
      g.fillStyle = '#' + new THREE.Color(PICKUPS[p.kind].color).getHexString();
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const m of monsters.list) {
      if (!m.alive) continue;
      let [x, y] = toRadar(m.pos.x, m.pos.z);
      const d = Math.hypot(x, y);
      if (d > R - 4) { x *= (R - 4) / d; y *= (R - 4) / d; }
      const tgt = s.weapons.lockTarget === m;
      g.fillStyle = m.spec.boss ? '#ff3a2a' : tgt ? '#ffd166' : m.spec.flies ? '#ff9ad0' : '#ff9a4a';
      const r = m.spec.boss ? 6 : m.height > 10 ? 4 : 3;
      g.beginPath();
      if (m.spec.flies) { g.moveTo(x, y - r - 1); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); } else g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // the jet
    g.save();
    g.translate(x0, y0);
    g.fillStyle = '#c8fff0';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }
}
