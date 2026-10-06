// The gunner's display (Hebrew, right to left): score and combo, the objective, lives, the
// boss bar, shield/heat/missile gauges, and a canvas layer with the crosshair, hit and kill
// markers, red brackets on monsters about to strike, arrows to monsters off screen, rings
// round incoming fire, the missile target, crate labels, score popups, and the marks hits
// leave on the window (claw scratches and cracks in the glass).
import * as THREE from 'three';
import { PICKUPS } from '../actors/pickups.js';
import { MISSILE } from '../actors/weapons.js';
import { clamp, formatInt, mulberry32 } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const FONT = "'Rubik', 'Segoe UI', Arial, sans-serif";
const DANGER = 45; // metres: closer than this, a monster is about to strike

export class HUD {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#hud-canvas');
    this.g = this.canvas.getContext('2d');
    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      score: $('h-score'), combo: $('h-combo'), objTitle: $('h-obj-title'), objBar: $('h-obj-bar'), objSub: $('h-obj-sub'),
      lives: $('h-lives'), boss: $('h-boss'), bossBar: $('h-boss-bar'), bossName: $('h-boss-name'), crystals: $('h-crystals'),
      hull: $('h-hull'), hullVal: $('h-hull-val'), heat: $('h-heat'), missiles: $('h-missiles'), reload: $('h-reload'),
      msg: $('h-msg'), msgTitle: $('h-msg-title'), msgSub: $('h-msg-sub'), toast: $('h-toast'), warn: $('h-warn'), fps: $('h-fps'),
      weapons: $('h-weapons'),
    };
    this.popups = [];
    this.marks = [];   // scratches and cracks on the window
    this.arcs = [];    // red edge glow towards a hit
    this.hitTimer = 0;
    this.killTimer = 0;
    this.msgTimer = 0;
    this.last = {};
    this.time = 0;
    this.rand = mulberry32(99);
    this.incoming = [];
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

  show(on) { this.root.classList.toggle('hidden', !on); if (!on) { this.marks.length = 0; this.popups.length = 0; this.arcs.length = 0; } }

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
  }

  popup(pos, text, color = '#ffd36a', big = false) {
    this.popups.push({ pos: pos.clone(), text, color, t: 0, big });
  }

  hitMarker(kill = false) { this.hitTimer = 0.14; if (kill) this.killTimer = 0.35; }

  // a hit on the window: claws and bites leave scratches, rams, stomps and fire crack the glass
  damage(fromPos, kind, camera) {
    let sx = this.w / 2, sy = this.h * 0.55;
    if (fromPos && camera) {
      _v.copy(fromPos).project(camera);
      if (_v.z < 1) { sx = (_v.x * 0.5 + 0.5) * this.w; sy = (-_v.y * 0.5 + 0.5) * this.h; }
      else { sx = this.w * (_v.x > 0 ? 0.15 : 0.85); }
    }
    sx = clamp(sx + (this.rand() - 0.5) * 80, this.w * 0.12, this.w * 0.88);
    sy = clamp(sy + (this.rand() - 0.5) * 60, this.h * 0.15, this.h * 0.85);
    const R = this.rand;
    if (kind === 'claw' || kind === 'bite') {
      const ang = (R() - 0.5) * 1.2 + (kind === 'bite' ? Math.PI / 2 : 0.6 * (sx < this.w / 2 ? 1 : -1));
      const len = Math.min(this.w, this.h) * (0.35 + R() * 0.15);
      const lines = [];
      const n = kind === 'bite' ? 2 : 3;
      for (let i = 0; i < n; i++) lines.push({ off: (i - (n - 1) / 2) * 26, bend: (R() - 0.5) * 40, len: len * (0.8 + R() * 0.3) });
      this.marks.push({ type: 'scratch', x: sx, y: sy, ang, lines, t: 0, life: 1.6, bite: kind === 'bite' });
    } else if (kind !== 'acid') {
      const rays = [];
      const n = 7 + Math.floor(R() * 5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.5;
        const pts = [];
        let r = 0, aa = a;
        const L = 60 + R() * (kind === 'stomp' || kind === 'ram' || kind === 'meteor' ? 220 : 130);
        while (r < L) { r += 14 + R() * 26; aa += (R() - 0.5) * 0.35; pts.push([Math.cos(aa) * r, Math.sin(aa) * r]); }
        rays.push(pts);
      }
      this.marks.push({ type: 'crack', x: sx, y: sy, rays, t: 0, life: 2.6 });
    } else {
      this.marks.push({ type: 'acid', x: sx, y: sy, t: 0, life: 2.2, blobs: Array.from({ length: 9 }, () => [(R() - 0.5) * 120, (R() - 0.5) * 80, 8 + R() * 22]) });
    }
    if (this.marks.length > 6) this.marks.shift();
    this.arcs.push({ x: sx, y: sy, t: 0 });
  }

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
    const { player, weapons, game } = s;
    const E = this.el;
    this.set('score', E.score, formatInt(game.score));
    this.set('combo', E.combo, game.combo > 1 ? `x${game.combo}` : '');
    this.set('objTitle', E.objTitle, game.objTitle);
    this.set('objSub', E.objSub, game.objSub);
    this.set('objBar', E.objBar.style, `${Math.round(game.objProgress * 100)}%`, 'width');
    const hp = Math.max(0, player.hp) / player.maxHp;
    this.set('hull', E.hull.style, `${Math.round(hp * 100)}%`, 'width');
    this.set('hullVal', E.hullVal, `${Math.ceil(Math.max(0, player.hp))}`);
    this.set('hullLow', E.weapons, hp < 0.3 ? 'hud-weapons low' : 'hud-weapons', 'className');
    this.set('heat', E.heat.style, `${Math.round(weapons.heat * 100)}%`, 'width');
    this.set('heatHot', E.heat, weapons.overheated ? 'hot' : weapons.coolTimer > 0 ? 'cool' : '', 'className');
    let mis = '';
    for (let i = 0; i < MISSILE.max; i++) mis += `<i class="${i < player.missilesLeft ? 'on' : ''}"></i>`;
    this.set('missiles', E.missiles, mis, 'innerHTML');
    this.set('reload', E.reload.style, player.missilesLeft < MISSILE.max ? `${Math.round((weapons.regen / MISSILE.regen) * 100)}%` : '0%', 'width');
    if (this.boss) {
      const b = this.boss;
      this.set('bossBar', E.bossBar.style, `${Math.round(clamp(b.hp / b.maxHp, 0, 1) * 100)}%`, 'width');
      let cr = '';
      for (const c of b.crystals) if (c) cr += `<i class="${c.alive ? 'on' : ''}"></i>`;
      this.set('crystals', E.crystals, cr + (b.heartExposed ? '<b>הלב חשוף!</b>' : ''), 'innerHTML');
    }
    let warn = '';
    if (weapons.overheated) warn = 'התותחים התחממו! שחררו לרגע';
    else if (hp < 0.25 && player.alive) warn = 'המגן כמעט נגמר';
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
    const { player, weapons, monsters, camera: cam, pickups, aim } = s;
    const P = { x: 0, y: 0 };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    const cx = this.w / 2, cy = this.h / 2;

    // ---- window marks under everything else
    this.drawMarks(g, dt);

    // ---- monsters: health, danger brackets, arrows to the ones off screen
    for (const m of monsters.list) {
      if (!m.alive || m.rise > 0.5) continue;
      const c = monsters.center(m, _w);
      const dist = c.distanceTo(player.pos);
      if (dist > 1400 && !m.spec.boss) continue;
      this.project(cam, c, P);
      const near = dist < DANGER + m.radius && !m.spec.boss;
      if (P.on) {
        const size = clamp((Math.max(m.height, m.radius * 2.4) / dist) * (this.h / (2 * Math.tan((cam.fov * Math.PI) / 360))), 14, 420);
        const half = size * 0.6;
        if (near) { // about to strike: red pulsing brackets
          const pulse = 0.65 + 0.35 * Math.sin(this.time * 14);
          g.strokeStyle = `rgba(255,60,40,${pulse})`;
          g.lineWidth = 3;
          const L = Math.max(8, half * 0.3);
          g.beginPath();
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = P.x + sx * half, y = P.y + sy * half;
            g.moveTo(x, y - sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y);
          }
          g.stroke();
        }
        if (m.hp < m.maxHp && !m.spec.boss) {
          const bw = clamp(half * 1.2, 26, 120), f = clamp(m.hp / m.maxHp, 0, 1);
          const y = P.y - half - 10;
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(P.x - bw / 2, y, bw, 4);
          g.fillStyle = f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffd166' : '#ff5a3a';
          g.fillRect(P.x - bw / 2, y, bw * f, 4);
        }
        // the missile's pick
        if (weapons.missileTarget === m && player.missilesLeft > 0) {
          const d = Math.max(14, half * 0.75) + 6;
          g.save();
          g.translate(P.x, P.y);
          g.rotate(Math.PI / 4 + Math.sin(this.time * 3) * 0.08);
          g.strokeStyle = '#ffd166';
          g.lineWidth = 2;
          g.setLineDash([8, 6]);
          g.strokeRect(-d, -d, d * 2, d * 2);
          g.setLineDash([]);
          g.restore();
        }
      } else if (dist < 220 || m.spec.boss) {
        let dx = P.x - cx, dy = P.y - cy;
        if (P.behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const ax = clamp(cx + Math.cos(ang) * this.w * 0.46, 34, this.w - 34);
        const ay = clamp(cy + Math.sin(ang) * this.h * 0.42, 70, this.h - 50);
        g.save();
        g.translate(ax, ay);
        g.rotate(ang);
        g.fillStyle = near ? '#ff4a3a' : m.spec.boss ? '#ff6a3a' : 'rgba(255,170,90,0.9)';
        g.globalAlpha = near ? 0.7 + 0.3 * Math.sin(this.time * 14) : 0.85;
        const s2 = near ? 14 : 10;
        g.beginPath(); g.moveTo(s2, 0); g.lineTo(-s2 * 0.7, s2 * 0.75); g.lineTo(-s2 * 0.3, 0); g.lineTo(-s2 * 0.7, -s2 * 0.75); g.closePath(); g.fill();
        g.restore();
      }
    }

    // ---- incoming fire: closing rings
    for (const it of weapons.incoming(player, this.incoming)) {
      this.project(cam, it.p, P);
      if (!P.on) continue;
      const k = clamp(1 - it.d / 700, 0, 1);
      const r = 26 - k * 14 + Math.sin(this.time * 18) * 2;
      g.strokeStyle = it.kind === 'acid' ? 'rgba(150,255,90,0.95)' : 'rgba(255,120,40,0.95)';
      g.lineWidth = 2 + k * 2;
      g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(P.x, P.y, r + 7, -0.6, 0.6); g.stroke();
      g.beginPath(); g.arc(P.x, P.y, r + 7, Math.PI - 0.6, Math.PI + 0.6); g.stroke();
    }

    // ---- crates
    for (const p of pickups.list) {
      const dist = p.pos.distanceTo(player.pos);
      if (dist > 600) continue;
      this.project(cam, p.pos, P);
      if (!P.on) continue;
      const def = PICKUPS[p.kind];
      const col = '#' + new THREE.Color(def.color).getHexString();
      g.fillStyle = col;
      g.font = `700 ${this.compact ? 11 : 12}px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(`${def.name} · ירו בתיבה`, P.x, P.y - 26);
    }

    // ---- popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.2) { this.popups.splice(i, 1); continue; }
      this.project(cam, p.pos, P);
      if (!P.on) continue;
      g.globalAlpha = clamp(1.5 - p.t, 0, 1);
      g.font = `800 ${p.big ? 28 : 19}px ${FONT}`;
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText(p.text, P.x, P.y - p.t * 46);
      g.fillStyle = p.color;
      g.fillText(p.text, P.x, P.y - p.t * 46);
      g.globalAlpha = 1;
    }

    // ---- red glow at the edge towards a hit
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      if (a.t > 0.9) { this.arcs.splice(i, 1); continue; }
      const grd = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(this.w, this.h) * 0.45);
      grd.addColorStop(0, `rgba(255,40,20,${0.28 * (1 - a.t / 0.9)})`);
      grd.addColorStop(1, 'rgba(255,40,20,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, this.h);
    }

    // ---- crosshair
    if (player.alive && s.showCrosshair) {
      const x = (aim.x * 0.5 + 0.5) * this.w, y = (-aim.y * 0.5 + 0.5) * this.h;
      const over = !!weapons.hover || (weapons.assist && weapons.assist.off < 2);
      const col = weapons.overheated ? 'rgba(255,150,80,0.6)' : over ? '#ff4a3a' : 'rgba(170,255,220,0.95)';
      const r = this.compact ? 15 : 18;
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4;
      const spin = over ? this.time * 2 : 0;
      for (let k = 0; k < 4; k++) {
        const a = spin + (k * Math.PI) / 2 + Math.PI / 4;
        g.beginPath(); g.arc(x, y, r, a - 0.5, a + 0.5); g.stroke();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.beginPath(); g.moveTo(x + dx * (r - 7), y + dy * (r - 7)); g.lineTo(x + dx * (r + 7), y + dy * (r + 7)); g.stroke();
      }
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      // heat arc under the crosshair
      if (weapons.heat > 0.02) {
        g.strokeStyle = weapons.overheated ? '#ff5a3a' : `rgba(255,${Math.round(220 - weapons.heat * 140)},80,0.9)`;
        g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, r + 11, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 0.5 * weapons.heat); g.stroke();
      }
      // hit and kill markers
      if (this.hitTimer > 0) {
        this.hitTimer -= dt;
        g.strokeStyle = this.killTimer > 0 ? '#ff5a3a' : '#ffffff';
        g.lineWidth = this.killTimer > 0 ? 3.5 : 2;
        const a = r * 0.45, b = r * (this.killTimer > 0 ? 1.35 : 1.05);
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.beginPath(); g.moveTo(x + sx * a, y + sy * a); g.lineTo(x + sx * b, y + sy * b); g.stroke(); }
      }
      if (this.killTimer > 0) this.killTimer -= dt;
      g.shadowBlur = 0;
    }
  }

  drawMarks(g, dt) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      if (m.t > m.life) { this.marks.splice(i, 1); continue; }
      const fade = clamp((m.life - m.t) / 0.6, 0, 1);
      g.save();
      g.translate(m.x, m.y);
      if (m.type === 'scratch') {
        g.rotate(m.ang);
        const grow = clamp(m.t / 0.08, 0, 1);
        for (const l of m.lines) {
          const half = (l.len / 2) * grow;
          for (const [w, col] of [[9, `rgba(80,10,6,${0.35 * fade})`], [4, `rgba(255,235,220,${0.75 * fade})`], [1.5, `rgba(255,255,255,${0.9 * fade})`]]) {
            g.strokeStyle = col;
            g.lineWidth = w;
            g.beginPath();
            g.moveTo(-half, l.off);
            g.quadraticCurveTo(0, l.off + l.bend, half, l.off + l.bend * 0.3);
            g.stroke();
          }
        }
      } else if (m.type === 'crack') {
        g.strokeStyle = `rgba(230,245,255,${0.8 * fade})`;
        g.lineWidth = 1.4;
        for (const ray of m.rays) {
          g.beginPath();
          g.moveTo(0, 0);
          for (const [x, y] of ray) g.lineTo(x, y);
          g.stroke();
        }
        g.strokeStyle = `rgba(230,245,255,${0.45 * fade})`;
        for (const r of [16, 34]) { // the ring cracks round the impact
          g.beginPath();
          for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; const rr = r * (0.85 + 0.3 * Math.abs(Math.sin(a * 3 + r))); if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          g.stroke();
        }
        g.fillStyle = `rgba(255,255,255,${0.35 * fade})`;
        g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
      } else {
        for (const [x, y, r] of m.blobs) {
          const grd = g.createRadialGradient(x, y + m.t * 20, 0, x, y + m.t * 20, r);
          grd.addColorStop(0, `rgba(160,255,80,${0.55 * fade})`);
          grd.addColorStop(1, 'rgba(160,255,80,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(x, y + m.t * 20, r, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    }
  }
}
