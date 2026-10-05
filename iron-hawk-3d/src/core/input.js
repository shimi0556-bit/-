// Controls: keyboard, mouse buttons, a floating touch joystick with action buttons, and
// gamepads. Everything is merged into one state the game reads once per frame.
import { clamp } from './util.js';

const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  yawL: ['KeyQ'], yawR: ['KeyE'], fire: ['Space', 'KeyJ'], missile: ['KeyF', 'KeyK', 'Enter', 'NumpadEnter'],
  boost: ['ShiftLeft', 'ShiftRight', 'KeyL'], brake: ['ControlLeft', 'ControlRight', 'KeyX', 'KeyZ'],
  camera: ['KeyC', 'KeyV'], pause: ['Escape', 'KeyP'], mute: ['KeyM'],
};
const EDGE = ['missile', 'camera', 'pause', 'mute'];

export class Input {
  constructor({ canvas, touchRoot }) {
    this.down = new Set();
    this.edges = {};
    this.invert = false;
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    this.touch = { pitch: 0, roll: 0, fire: false, boost: false, brake: false, active: false };
    this.mouse = { fire: false };
    this.enabled = false; // only while flying
    this.lastDevice = 'keyboard';
    this.padPrev = [];
    this.listeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.enabled && this.isGameKey(e.code)) e.preventDefault(); return; }
      this.down.add(e.code);
      this.lastDevice = 'keyboard';
      for (const [name, codes] of Object.entries(KEYS)) if (EDGE.includes(name) && codes.includes(e.code)) this.edges[name] = true;
      if (this.enabled && this.isGameKey(e.code)) e.preventDefault();
      for (const fn of this.listeners) fn(e);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.fire = false; });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      if (e.button === 0) this.mouse.fire = true;
      if (e.button === 2) this.edges.missile = true;
      this.lastDevice = 'keyboard';
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

  setInvert(v) { this.invert = !!v; }

  // ---------------------------------------------------------------- touch
  buildTouch(root) {
    this.touchRoot = root;
    root.innerHTML = `
      <div class="tc-zone" data-zone="stick"></div>
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <button class="tc-btn tc-fire" data-btn="fire" aria-label="ירי"><span>ירי</span></button>
      <button class="tc-btn tc-missile" data-btn="missile" aria-label="טיל"><span>טיל</span></button>
      <button class="tc-btn tc-boost" data-btn="boost" aria-label="טורבו"><span>טורבו</span></button>
      <button class="tc-btn tc-brake" data-btn="brake" aria-label="האטה"><span>האטה</span></button>
      <button class="tc-btn tc-cam" data-btn="camera" aria-label="מצלמה"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2h6l2 2h3v11H4z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`;
    const zone = root.querySelector('.tc-zone');
    const stick = root.querySelector('.tc-stick');
    const knob = root.querySelector('.tc-knob');
    this.stickEl = stick;
    let id = null, cx = 0, cy = 0;
    const R = () => Math.min(70, window.innerWidth * 0.12 + 20);
    const move = (e) => {
      const r = R();
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
      this.touch.roll = curve(dx / r);
      this.touch.pitch = curve(-dy / r);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      cx = e.clientX; cy = e.clientY;
      stick.style.left = `${cx}px`; stick.style.top = `${cy}px`;
      stick.classList.add('on');
      knob.style.transform = 'translate(0px, 0px)';
      this.touch.active = true;
      this.lastDevice = 'touch';
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      stick.classList.remove('on');
      this.touch.roll = 0; this.touch.pitch = 0;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    for (const btn of root.querySelectorAll('.tc-btn')) {
      const name = btn.dataset.btn;
      const press = (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('down');
        this.lastDevice = 'touch';
        if (name === 'missile' || name === 'camera') this.edges[name] = true;
        else this.touch[name] = true;
      };
      const release = (e) => {
        btn.classList.remove('down');
        if (name !== 'missile' && name !== 'camera') this.touch[name] = false;
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setTouchVisible(on) { this.touchRoot.classList.toggle('on', !!on); }

  // ---------------------------------------------------------------- gamepad
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
      const out = {
        roll: dz(p.axes[0] || 0), pitch: -dz(p.axes[1] || 0), yaw: dz(p.axes[2] || 0),
        fire: b(7), boost: b(4) || b(1), brake: b(6),
      };
      const edge = (i, name) => { if (b(i) && !this.padPrev[i]) this.edges[name] = true; };
      edge(0, 'missile'); edge(5, 'missile'); edge(3, 'camera'); edge(9, 'pause');
      for (let i = 0; i < p.buttons.length; i++) this.padPrev[i] = b(i);
      if (out.fire || out.boost || Math.abs(out.roll) + Math.abs(out.pitch) > 0.2) this.lastDevice = 'gamepad';
      return out;
    }
    return null;
  }

  // ---------------------------------------------------------------- frame state
  poll(dt) {
    const pad = this.pollPad();
    const k = (name) => (this.key(name) ? 1 : 0);
    const ramp = (cur, target, rate) => {
      if (target === 0) return Math.abs(cur) < rate * dt * 1.5 ? 0 : cur - Math.sign(cur) * rate * 1.5 * dt;
      return clamp(cur + clamp(target - cur, -rate * dt, rate * dt), -1, 1);
    };
    this.axes.pitch = ramp(this.axes.pitch, k('up') - k('down'), 4);
    this.axes.roll = ramp(this.axes.roll, k('right') - k('left'), 5);
    this.axes.yaw = ramp(this.axes.yaw, k('yawR') - k('yawL'), 4);
    let pitch = this.axes.pitch + this.touch.pitch + (pad ? pad.pitch : 0);
    const roll = clamp(this.axes.roll + this.touch.roll + (pad ? pad.roll : 0), -1, 1);
    const yaw = clamp(this.axes.yaw + (pad ? pad.yaw : 0), -1, 1);
    pitch = clamp(pitch, -1, 1) * (this.invert ? -1 : 1);
    const state = {
      pitch, roll, yaw,
      fire: this.key('fire') || this.mouse.fire || this.touch.fire || !!(pad && pad.fire),
      boost: this.key('boost') || this.touch.boost || !!(pad && pad.boost),
      brake: this.key('brake') || this.touch.brake || !!(pad && pad.brake),
      missile: !!this.edges.missile, camera: !!this.edges.camera, pause: !!this.edges.pause, mute: !!this.edges.mute,
    };
    this.edges = {};
    return state;
  }

  clearEdges() { this.edges = {}; }
}
