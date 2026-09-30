/**
 * Unified input: keyboard (by physical key code), mouse, pointer lock,
 * wheel, gamepad and on-screen touch sticks. Per-frame edges
 * (pressed/released) are cleared by endFrame().
 */
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, wheel: 0, buttons: 0, clicked: new Set() };
    this.locked = false;
    this.gamepad = null;
    // Virtual sticks written by the touch overlay: move = left stick, look = right stick.
    this.touch = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, active: false };

    const isTyping = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };

    this._onKeyDown = (e) => {
      if (isTyping(e)) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && this.locked) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    this._onBlur = () => {
      this.down.clear();
      this.mouse.buttons = 0;
    };
    this._onMouseMove = (e) => {
      const r = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      this.mouse.buttons |= 1 << e.button;
      this.mouse.clicked.add(e.button);
    };
    this._onMouseUp = (e) => {
      this.mouse.buttons &= ~(1 << e.button);
    };
    this._onWheel = (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === dom;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    dom.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Axis helper: +1 / -1 / 0 from two key codes. */
  axis(neg, pos) {
    return (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0);
  }

  requestLock() {
    if (this.locked || !this.dom.requestPointerLock) return;
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock is optional (phones, embedded views) */
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gamepad = null;
    for (const p of pads) {
      if (p && p.connected) {
        this.gamepad = p;
        break;
      }
    }
  }

  /** Movement vector in [-1,1]² merged from keyboard, touch stick and gamepad. */
  moveVector() {
    let x = this.axis('KeyA', 'KeyD') + this.axis('ArrowLeft', 'ArrowRight');
    let y = this.axis('KeyS', 'KeyW') + this.axis('ArrowDown', 'ArrowUp');
    x += this.touch.move.x;
    y += this.touch.move.y;
    if (this.gamepad) {
      const [ax, ay] = this.gamepad.axes;
      if (Math.abs(ax) > 0.15) x += ax;
      if (Math.abs(ay) > 0.15) y -= ay;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Look delta in pixels-equivalent merged from mouse, touch and gamepad. */
  lookDelta(dt) {
    let dx = this.mouse.dx;
    let dy = this.mouse.dy;
    dx += this.touch.look.x * 900 * dt;
    dy += this.touch.look.y * 900 * dt;
    if (this.gamepad && this.gamepad.axes.length >= 4) {
      const [, , rx, ry] = this.gamepad.axes;
      if (Math.abs(rx) > 0.12) dx += rx * 700 * dt;
      if (Math.abs(ry) > 0.12) dy += ry * 700 * dt;
    }
    return { dx, dy };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.clicked.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.touch.jump = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.dom.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
