// Controls for the gunner: a crosshair moved by the mouse (absolutely), the keys or a
// gamepad stick; on touch screens a finger anywhere aims and fires, with the crosshair a
// little above the finger so it stays visible. Everything is merged into one state the
// game reads once per frame. The crosshair is kept in normalised screen units (-1..1).
import { clamp } from './util.js';

const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  fire: ['Space', 'KeyJ'], missile: ['KeyF', 'KeyK', 'Enter', 'NumpadEnter'],
  pause: ['Escape', 'KeyP'], mute: ['KeyM'],
};
const EDGE = ['missile', 'pause', 'mute'];
const FINGER_LIFT = 70; // css px between the finger and the crosshair

export class Input {
  constructor({ canvas, touchRoot }) {
    this.down = new Set();
    this.edges = {};
    this.aim = { x: 0, y: 0 };
    this.keyVel = { x: 0, y: 0 };
    this.mouse = { fire: false };
    this.touch = { fire: false, id: null };
    this.enabled = false; // only while playing
    this.lastDevice = 'mouse';
    this.padPrev = [];
    this.listeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.enabled && this.isGameKey(e.code)) e.preventDefault(); return; }
      this.down.add(e.code);
      if (this.isGameKey(e.code) && !['Escape', 'KeyP', 'KeyM'].includes(e.code)) this.lastDevice = 'keyboard';
      for (const [name, codes] of Object.entries(KEYS)) if (EDGE.includes(name) && codes.includes(e.code)) this.edges[name] = true;
      if (this.enabled && this.isGameKey(e.code)) e.preventDefault();
      for (const fn of this.listeners) fn(e);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.fire = false; this.touch.fire = false; this.touch.id = null; });
    const fromMouse = (e) => {
      this.aim.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
      this.aim.y = clamp(-((e.clientY / window.innerHeight) * 2 - 1), -1, 1);
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      fromMouse(e);
      this.lastDevice = 'mouse';
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      fromMouse(e);
      if (e.button === 0) this.mouse.fire = true;
      if (e.button === 2) this.edges.missile = true;
      this.lastDevice = 'mouse';
    });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.mouse.fire = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.buildTouch(touchRoot);
  }

  onKey(fn) { this.listeners.push(fn); }

  isGameKey(code) {
    for (const codes of Object.values(KEYS)) if (codes.includes(code)) return true;
    return false;
  }

  key(name) { return KEYS[name].some((c) => this.down.has(c)); }

  // ---------------------------------------------------------------- touch
  buildTouch(root) {
    this.touchRoot = root;
    root.innerHTML = `
      <div class="tc-zone" data-zone="aim"></div>
      <div class="tc-finger"></div>
      <button class="tc-btn tc-missile" data-btn="missile" aria-label="טיל"><svg viewBox="0 0 24 24"><path d="M12 2l3 5v9l2 3v3l-5-2-5 2v-3l2-3V7z" fill="currentColor"/></svg><span>טיל</span></button>`;
    const zone = root.querySelector('.tc-zone');
    const finger = root.querySelector('.tc-finger');
    const place = (e) => {
      const y = e.clientY - FINGER_LIFT;
      this.aim.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
      this.aim.y = clamp(-((y / window.innerHeight) * 2 - 1), -1, 1);
      finger.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.touch.id !== null) return;
      this.touch.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.touch.fire = true;
      this.lastDevice = 'touch';
      finger.classList.add('on');
      place(e);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.touch.id) place(e); });
    const end = (e) => {
      if (e.pointerId !== this.touch.id) return;
      this.touch.id = null;
      this.touch.fire = false;
      finger.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const btn of root.querySelectorAll('.tc-btn')) {
      const name = btn.dataset.btn;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('down');
        this.lastDevice = 'touch';
        this.edges[name] = true;
      });
      const release = () => btn.classList.remove('down');
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setTouchVisible(on) { this.touchRoot.classList.toggle('on', !!on); }

  // ---------------------------------------------------------------- gamepad
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
      // either stick moves the crosshair
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      const x = Math.abs(rx) > Math.abs(lx) ? rx : lx, y = Math.abs(ry) > Math.abs(ly) ? ry : ly;
      const out = { x, y: -y, fire: b(7) || b(6) };
      const edge = (i, name) => { if (b(i) && !this.padPrev[i]) this.edges[name] = true; };
      edge(0, 'missile'); edge(5, 'missile'); edge(4, 'missile'); edge(9, 'pause');
      for (let i = 0; i < p.buttons.length; i++) this.padPrev[i] = b(i);
      if (out.fire || Math.abs(x) + Math.abs(y) > 0.2) this.lastDevice = 'gamepad';
      return out;
    }
    return null;
  }

  // ---------------------------------------------------------------- frame state
  poll(dt) {
    const pad = this.pollPad();
    const k = (name) => (this.key(name) ? 1 : 0);
    // keys and sticks steer the crosshair with a little acceleration
    let sx = k('right') - k('left'), sy = k('up') - k('down');
    if (pad) { sx += pad.x; sy += pad.y; }
    sx = clamp(sx, -1, 1); sy = clamp(sy, -1, 1);
    const accel = (cur, want) => (want === 0 ? 0 : clamp(cur + want * dt * 4, -1, 1));
    this.keyVel.x = Math.sign(sx) === Math.sign(this.keyVel.x) || this.keyVel.x === 0 ? accel(this.keyVel.x, sx) : 0;
    this.keyVel.y = Math.sign(sy) === Math.sign(this.keyVel.y) || this.keyVel.y === 0 ? accel(this.keyVel.y, sy) : 0;
    const speed = 1.6;
    if (sx) this.aim.x = clamp(this.aim.x + sx * speed * dt * (0.45 + 0.55 * Math.abs(this.keyVel.x)), -0.95, 0.95);
    if (sy) this.aim.y = clamp(this.aim.y + sy * speed * dt * (0.45 + 0.55 * Math.abs(this.keyVel.y)), -0.9, 0.9);
    // with keys or a pad and nothing pressed, drift slowly back to the middle
    if (!sx && !sy && (this.lastDevice === 'keyboard' || this.lastDevice === 'gamepad')) {
      this.aim.x *= Math.exp(-0.6 * dt);
      this.aim.y *= Math.exp(-0.6 * dt);
    }
    const state = {
      aim: this.aim,
      fire: this.key('fire') || this.mouse.fire || this.touch.fire || !!(pad && pad.fire),
      missile: !!this.edges.missile, pause: !!this.edges.pause, mute: !!this.edges.mute,
      device: this.lastDevice,
    };
    this.edges = {};
    return state;
  }

  clearEdges() { this.edges = {}; this.mouse.fire = false; }
}
