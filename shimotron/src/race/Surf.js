import { surfAt } from '../engine/world/Water.js';

/**
 * Spray thrown up where the surf breaks (see surfAt): random spots in a ring
 * around the camera are tested each frame, and those on a crest tripping
 * over in 1.3–3.2 m of water throw a burst of white water up and shoreward
 * (down the sea floor's slope), bigger for bigger swells.
 */
export class SurfSpray {
  constructor(engine, floorAt) {
    this.engine = engine;
    this.floorAt = floorAt;
    this.acc = 0;
    this._s = { h: 0, u: 0, a: 0 };
  }

  update(dt, amp) {
    const eng = this.engine;
    const P = eng.particles;
    if (!P || dt <= 0) return;
    const cam = eng.camera.position;
    if (cam.y > 160 || cam.y < -0.5) return;
    const S = P.systems.spray;
    const t = eng.time.elapsed;
    this.acc += dt * 1500;
    let tries = Math.min(90, Math.floor(this.acc));
    this.acc -= tries;
    let emitted = 0;
    while (tries-- > 0 && emitted < 40) {
      // Denser near the camera, where the spray can be seen.
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.pow(Math.random(), 1.5) * 220;
      const x = cam.x + Math.cos(a) * r;
      const z = cam.z + Math.sin(a) * r;
      const d = -this.floorAt(x, z);
      if (d < 1.3 || d > 3.2) continue;
      const s = surfAt(x, z, t, amp, d, this._s);
      if (s.u < 0.13 || s.u > 0.27 || s.a < 0.2) continue;
      const gx = -this.floorAt(x + 2, z) - d;
      const gz = -this.floorAt(x, z + 2) - d;
      const gl = Math.hypot(gx, gz) || 1;
      const sx = -gx / gl;
      const sz = -gz / gl;
      const k = Math.min(1.6, s.a / 0.8);
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const j = (Math.random() - 0.5) * 4; // along the crest
        const out = 1.2 + Math.random() * 3 * k;
        S.emit({
          x: x - sz * j,
          y: s.h + 0.15,
          z: z + sx * j,
          vx: sx * out + (Math.random() - 0.5),
          vy: 1.8 + Math.random() * 4.2 * k,
          vz: sz * out + (Math.random() - 0.5),
          life: 0.9 + Math.random() * 0.8,
          size0: 0.5 + 0.4 * k,
          size1: 2.4 + 2.6 * k,
          color0: [0.96, 0.98, 1, 0.7],
          color1: [0.94, 0.97, 1, 0],
          gravity: 9.2,
          drag: 0.6,
        });
      }
      emitted += n;
    }
  }
}
