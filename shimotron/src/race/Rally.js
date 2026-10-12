import { STAGES } from './config.js';

/**
 * ראלי האיים: what the rally edition adds on top of the race — the road
 * surface labels, stars per stage, the co-driver's pace notes and the
 * recorded sound effects (ElevenLabs takes, with the synth as fallback).
 */

export const ROAD_LABEL = { asphalt: 'אספלט', gravel: 'חצץ', sand: 'חול', mixed: 'אספלט וחצץ' };

/** Average speed (m/s) a gold run holds, when a stage does not set its own `pace`. */
const GOLD_PACE = { asphalt: 41, mixed: 39, gravel: 36, sand: 35.5 };

/** Gold time in seconds for `laps` laps of a stage (null until its circuit is known); 4 s for the standing start. */
export function goldTime(st, plan, laps) {
  if (!plan) return null;
  return Math.round((laps * plan.length) / (st.pace || GOLD_PACE[st.road] || GOLD_PACE.asphalt) + 4);
}

/** Stars for one run: finishing, a podium, beating the gold time. */
export function starsFor({ place, time, gold }) {
  let n = 1;
  if (place <= 3) n++;
  if (gold && time <= gold) n++;
  return n;
}

/** Best stars per stage, kept in the browser. */
export class Stars {
  constructor(store) {
    this.store = store;
    this.best = store.get('stars', {});
  }

  get(id) {
    return this.best[id] || 0;
  }

  total() {
    return STAGES.reduce((s, st) => s + this.get(st.id), 0);
  }

  /** Records a run; returns true when it beat the stage's best. */
  award(id, n) {
    if (n <= this.get(id)) return false;
    this.best[id] = n;
    this.store.set('stars', this.best);
    return true;
  }
}

/** ★★☆ as text. */
export const starText = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));

// ------------------------------------------------------------ pace notes

const STYLE = `
.pacenote { position: fixed; top: calc(92px + var(--safe-t, 0px)); left: 50%; transform: translateX(-50%); z-index: 21; pointer-events: none;
  display: flex; align-items: center; gap: 12px; padding: 8px 18px 8px 14px; border-radius: 14px; direction: rtl;
  background: rgba(10, 12, 16, 0.62); border: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(6px);
  color: #fff; font: 700 30px/1 var(--display, sans-serif); letter-spacing: 0.5px; opacity: 0; transition: opacity 0.25s ease; }
.pacenote.on { opacity: 1; }
.pacenote svg { width: 44px; height: 44px; flex: none; }
.pacenote .g { font-family: var(--mono, monospace); font-size: 34px; color: var(--accent, #ffb020); }
.pacenote .d { font: 600 15px/1 var(--mono, monospace); color: rgba(255, 255, 255, 0.7); direction: ltr; }
.pacenote .then { font: 600 16px/1.2 var(--ui, sans-serif); color: rgba(255, 255, 255, 0.75); }
.pacenote.tight .g { color: #ff5a3a; }
@media (max-width: 640px) { .pacenote { top: calc(64px + var(--safe-t, 0px)); font-size: 22px; padding: 6px 12px; gap: 8px; } .pacenote svg { width: 32px; height: 32px; } .pacenote .g { font-size: 26px; } .pacenote .then { display: none; } }
`;

const ARROW = {
  // A road bending left / right from the bottom of the box.
  left: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M30 42V26c0-6-4-10-10-10H10"/><path d="M17 8l-8 8 8 8"/></svg>',
  right: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 42V26c0-6 4-10 10-10h10"/><path d="M31 8l8 8-8 8"/></svg>',
};

/**
 * The co-driver, on screen: the next corner ahead as a rally pace note
 * ("שמאלה 3"), graded 1 (hairpin) to 6 (flat out), with the distance to it
 * and what follows straight after. No speech: a chime marks each new call.
 */
export class PaceNotes {
  constructor(track, onCall) {
    this.track = track;
    this.onCall = onCall;
    this.corners = this._analyze(track);
    this.current = null;
    if (!document.getElementById('pacenote-style')) {
      const s = document.createElement('style');
      s.id = 'pacenote-style';
      s.textContent = STYLE;
      document.head.append(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'pacenote';
    this.el.setAttribute('aria-live', 'polite');
    document.body.append(this.el);
  }

  /** Corners from the track's curvature: runs of one sign, graded by their tightest radius. */
  _analyze(tr) {
    const n = tr.n;
    const K = tr.kappa;
    const ds = tr.ds;
    const th = 1 / 230;
    // Start the walk on a straight so no corner is split by the wrap.
    let i0 = 0;
    while (i0 < n && Math.abs(K[i0]) > th) i0++;
    const out = [];
    let cur = null;
    let gap = 0;
    for (let k = 0; k <= n; k++) {
      const i = (i0 + k) % n;
      const kap = K[i];
      const sign = Math.abs(kap) > th ? Math.sign(kap) : 0;
      if (cur && (sign === cur.sign || (sign === 0 && gap < 6))) {
        if (sign === 0) gap++;
        else {
          gap = 0;
          cur.end = k;
          cur.angle += Math.abs(kap) * ds;
          if (Math.abs(kap) > cur.kmax) cur.kmax = Math.abs(kap);
        }
        continue;
      }
      if (cur) out.push(cur);
      cur = sign ? { sign, start: k, end: k, angle: Math.abs(kap) * ds, kmax: Math.abs(kap) } : null;
      gap = 0;
    }
    if (cur) out.push(cur);
    return out
      .filter((c) => c.angle > 0.22) // under ~13°: a kink, not worth a call
      .map((c) => {
        const R = 1 / c.kmax;
        const grade = R < 28 ? 1 : R < 48 ? 2 : R < 75 ? 3 : R < 115 ? 4 : R < 170 ? 5 : 6;
        // kappa > 0 bends toward the track's right-hand side.
        const dir = c.sign > 0 ? 'right' : 'left';
        const deg = (c.angle * 180) / Math.PI;
        return { i: (i0 + c.start) % n, s: ((i0 + c.start) % n) * ds, dir, grade, long: deg > 110, hairpin: grade <= 1 && deg > 140 };
      });
  }

  static label(c) {
    const side = c.dir === 'left' ? 'שמאלה' : 'ימינה';
    if (c.hairpin) return { word: `פרסה ${side}`, grade: '' };
    return { word: side, grade: String(c.grade), extra: c.long ? 'ארוכה' : '' };
  }

  update(entry, racing) {
    const tr = this.track;
    const q = entry && entry.q;
    if (!racing || !q || !this.corners.length) {
      this.el.classList.remove('on');
      return;
    }
    const L = tr.length;
    const here = q.i * tr.ds;
    const v = Math.abs(entry.car.vehicle.speed);
    const look = 70 + v * 3.2;
    let best = null;
    let bestD = Infinity;
    for (const c of this.corners) {
      let d = c.s - here;
      if (d < -4) d += L;
      if (d >= -4 && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best || bestD > look) {
      this.el.classList.remove('on');
      this.current = null;
      return;
    }
    const k = this.corners.indexOf(best);
    const next = this.corners[(k + 1) % this.corners.length];
    let gapNext = next.s - best.s;
    if (gapNext < 0) gapNext += L;
    if (best !== this.current) {
      this.current = best;
      const lab = PaceNotes.label(best);
      const then = next !== best && gapNext < 90 ? PaceNotes.label(next) : null;
      this.el.className = `pacenote on${best.grade <= 2 ? ' tight' : ''}`;
      this.el.innerHTML = '';
      const arrow = document.createElement('span');
      arrow.innerHTML = ARROW[best.dir];
      this.el.append(arrow.firstChild);
      const w = document.createElement('span');
      w.textContent = lab.word + (lab.extra ? ` ${lab.extra}` : '');
      this.el.append(w);
      if (lab.grade) {
        const g = document.createElement('span');
        g.className = 'g';
        g.textContent = lab.grade;
        this.el.append(g);
      }
      this.distEl = document.createElement('span');
      this.distEl.className = 'd';
      this.el.append(this.distEl);
      if (then) {
        const t = document.createElement('span');
        t.className = 'then';
        t.textContent = `ואז ${then.word}${then.grade ? ` ${then.grade}` : ''}`;
        this.el.append(t);
      }
      if (this.onCall) this.onCall(best);
    } else this.el.classList.add('on');
    if (this.distEl) this.distEl.textContent = bestD > 15 ? `${Math.round(bestD / 10) * 10}m` : '';
  }

  dispose() {
    this.el.remove();
  }
}

// ------------------------------------------------------------ sound

/**
 * Recorded effects around the player's car: gravel spraying in a slide,
 * stones pinging the floor pan, the thump of a landing after a crest.
 * Each call falls back to silence (the synth layers keep running) when a
 * take is missing.
 */
export class RallySfx {
  constructor(audio) {
    this.audio = audio;
    this.air = 0;
    this.slideT = 0;
    this.pingT = 1;
  }

  update(dt, race) {
    const A = this.audio;
    if (!A.enabled || !race) return;
    const P = race.player;
    if (!P || race.state === 'intro') return;
    const car = P.car;
    const veh = car.vehicle;
    const v = Math.abs(veh.speed);
    const infos = veh.vehicle.wheelInfos;
    const inAir = infos.every((w) => !w.isInContact);
    if (inAir) this.air += dt;
    else {
      if (this.air > 0.3 && v > 5) A.sample('land', { vol: Math.min(1, 0.45 + this.air * 0.6), rate: 0.95 + Math.random() * 0.1 });
      this.air = 0;
    }
    const loose = car.offroad > 0.5;
    const slip = Math.max(veh.slip[2], veh.slip[3], Math.min(1, Math.max(0, (Math.abs(veh.lateralSpeed()) - 2.5) / 5)));
    this.slideT -= dt;
    if (loose && slip > 0.35 && v > 6 && this.slideT <= 0) {
      A.sample('gravel', { vol: Math.min(0.9, 0.3 + slip * 0.6), rate: 0.9 + Math.random() * 0.2 });
      this.slideT = 0.75;
    }
    this.pingT -= dt;
    if (loose && v > 10 && this.pingT <= 0) {
      if (Math.random() < v / 50) A.sample('ping', { vol: 0.22 + Math.random() * 0.15, rate: 0.9 + Math.random() * 0.25 });
      this.pingT = 1.4 + Math.random() * 2.2;
    }
  }
}
