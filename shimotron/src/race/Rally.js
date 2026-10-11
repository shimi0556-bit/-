import * as THREE from 'three';
import { WORLD } from './World.js';

/**
 * "ראלי כל האיים": a time trial right round the archipelago, on the roads
 * that are there. From the city over the bridge to the first island of the
 * outer ring, on round the ring island by island over the bridges between
 * them, and back over the last one to the city.
 *
 * On every island the route comes in on one bridge's access road, joins the
 * circuit, drives a stretch of it and leaves on the next bridge's road; a
 * gate on the circuit between the two junctions makes sure the island is
 * crossed, and one under each bridge's pylon that the bridge is. The clock
 * starts when the car moves off and stops at the finish gate back in the
 * city, where it started. It runs in free roam, so the islands are all
 * built and crossing between them never stops the clock (nor does pausing).
 */
export class Rally {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.gates = [];
    this.next = 0;
    this.time = 0;
    this.running = false;
    this.done = false;
    this.group = new THREE.Group();
    this.group.name = 'ראלי כל האיים';
  }

  /** The island ids in driving order, city first and last. */
  static order() {
    return [WORLD.hub, ...(WORLD.ring || []), WORLD.hub];
  }

  /** Lays out the gates (needs every island on the way built). False if the roads aren't all there. */
  plan() {
    const W = this.world;
    const ids = Rally.order();
    const legs = [];
    for (let k = 0; k < ids.length - 1; k++) {
      const B = W.bridgeBetween(ids[k], ids[k + 1]);
      if (!B) return false;
      legs.push({ from: ids[k], to: ids[k + 1], bridge: B });
    }
    const spurOf = (id, B) => {
      const isl = this.game.islands.get(id);
      if (!isl || !isl.roads) return null;
      const [cx, cz] = W.pos(id);
      const S = B.samples;
      const e = B.from === id ? S[0] : S[S.length - 1];
      let best = null;
      let bd = 30;
      for (const sp of isl.roads.spurs) {
        const d = Math.hypot(sp.deck.x - (e.p.x - cx), sp.deck.z - (e.p.z - cz));
        if (d < bd) {
          bd = d;
          best = sp;
        }
      }
      return best ? { island: isl, spur: best } : null;
    };
    const gates = [];
    // On the circuit of island `id`, between where the road from bridge `inB` joins it and where the road to `outB` leaves.
    const circuitGate = (id, inB, outB, label) => {
      const a = spurOf(id, inB);
      const b = spurOf(id, outB);
      if (!a || !b) return false;
      const tr = a.island.track;
      const n = tr.n;
      const ja = a.spur.join;
      const jb = b.spur.join;
      let d = (jb - ja + n) % n;
      const fwd = d <= n / 2;
      if (!fwd) d = n - d;
      const i = (fwd ? ja + Math.round(d / 2) : ja - Math.round(d / 2) + n) % n;
      const [cx, cz] = W.pos(id);
      gates.push({ kind: 'circuit', id, label, x: cx + tr.x[i], z: cz + tr.z[i], y: tr.h[i], yaw: Math.atan2(tr.tx[i], tr.tz[i]), half: tr.W + 1.2, r: tr.W + 4 });
      return true;
    };
    const name = (id) => W.stages.find((s) => s.id === id)?.name || id;
    for (let k = 0; k < legs.length; k++) {
      const L = legs[k];
      if (k > 0 && !circuitGate(L.from, legs[k - 1].bridge, L.bridge, name(L.from))) return false;
      const P = L.bridge.pylon;
      gates.push({ kind: 'bridge', id: null, label: `גשר אל ${name(L.to)}`, x: P.p.x, z: P.p.z, y: P.p.y, yaw: Math.atan2(P.t.x, P.t.z), half: 7.6, r: 10 });
    }
    // The finish: back on the city's circuit where the start road joins it.
    const s0 = spurOf(WORLD.hub, legs[0].bridge);
    const sE = spurOf(WORLD.hub, legs[legs.length - 1].bridge);
    if (!s0 || !sE) return false;
    {
      const tr = s0.island.track;
      const i = s0.spur.join;
      const [cx, cz] = W.pos(WORLD.hub);
      gates.push({ kind: 'finish', id: WORLD.hub, label: 'סיום', x: cx + tr.x[i], z: cz + tr.z[i], y: tr.h[i], yaw: Math.atan2(tr.tx[i], tr.tz[i]), half: tr.W + 1.2, r: tr.W + 4 });
    }
    // The start: on the city's road to the first bridge, a little way up from the junction, facing the bridge.
    const P = s0.spur.samples;
    const k = Math.max(0, P.length - 1 - Math.round(24 / 3));
    const p = P[Math.min(k, P.length - 1)];
    const [cx, cz] = W.pos(WORLD.hub);
    this.start = { kind: 'car', wx: cx + p.x, wz: cz + p.z, y: p.y + 0.6, yaw: Math.atan2(-p.tx, -p.tz), speed: 0 };
    this.gates = gates;
    this._build();
    return true;
  }

  _build() {
    const mats = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.5 });
    this.matOn = mats(0x39e07a, 1.3);
    this.matNext = mats(0xffb020, 0.5);
    this.matFinish = mats(0xffffff, 0.8);
    this.game.materials.trackEmissive?.(this.matOn, 1.3);
    this.game.materials.trackEmissive?.(this.matNext, 0.5);
    for (const G of this.gates) {
      const g = new THREE.Group();
      const post = new THREE.BoxGeometry(0.45, 6.2, 0.45).translate(0, 3.1, 0);
      const parts = [post.clone().translate(-G.half, 0, 0), post.clone().translate(G.half, 0, 0), new THREE.BoxGeometry(G.half * 2 + 0.45, 1.1, 0.25).translate(0, 6.2, 0)];
      for (const geo of parts) {
        const m = new THREE.Mesh(geo, this.matNext);
        m.castShadow = true;
        g.add(m);
      }
      // Chequered flags on the banner for the finish.
      if (G.kind === 'finish') g.children[2].material = this.matFinish;
      g.position.set(G.x, G.y, G.z);
      g.rotation.y = G.yaw;
      g.visible = false;
      g.userData.noPick = true;
      G.mesh = g;
      this.group.add(g);
    }
    this.world.group.add(this.group);
    this._show();
  }

  _show() {
    this.gates.forEach((G, k) => {
      G.mesh.visible = k === this.next || k === this.next + 1;
      const m = k === this.next ? this.matOn : this.matNext;
      G.mesh.children.forEach((c, j) => (c.material = G.kind === 'finish' && j === 2 && k !== this.next ? this.matFinish : m));
    });
  }

  /** The gate to drive through next, or null when finished. */
  get target() {
    return this.done ? null : this.gates[this.next] || null;
  }

  /** Per frame while roaming: the clock and the gates. ex: the Explore session (its vehicle). */
  update(dt, ex) {
    if (this.done || !ex.obj || !this.gates.length) return;
    if (!this.running) {
      if (Math.abs(ex.speed) > 1) this.running = true;
      else return;
    }
    this.time += dt;
    // Only on wheels: flying or sailing round the gates doesn't count.
    if (!ex.onWheels) return;
    const [wx, wz] = this.world.toWorld(ex.position.x, ex.position.z);
    const G = this.gates[this.next];
    if (Math.hypot(wx - G.x, wz - G.z) < G.r && Math.abs(ex.position.y - G.y) < 9) {
      this.next++;
      const ui = this.game.ui;
      if (this.next >= this.gates.length) {
        this.done = true;
        const best = this.game.rallyBest;
        const record = !best || this.time < best;
        if (record) this.game.saveRallyBest(this.time);
        ui.message('סיימתם את ראלי כל האיים!', fmt(this.time), record ? 'שיא חדש' : `השיא: ${fmt(best)}`, 6000);
        this.gates.forEach((g) => (g.mesh.visible = false));
        return;
      }
      ui.message(G.label, fmt(this.time), `שער ${this.next}/${this.gates.length}`, 1300);
      this._show();
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry?.dispose());
  }
}

export function fmt(t) {
  if (t == null) return '--:--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
