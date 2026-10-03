/**
 * Load timing, for finding out where the wait goes on a real computer:
 * open the game with `#timing` in the address (with a quality too, e.g.
 * `race.html#medium,timing`) and a panel lists how long each loading step
 * took, the islands one by one and the totals. The same lines go to the
 * console. Without `#timing` nothing is recorded or shown.
 */
export class Timing {
  constructor() {
    this.on = /\btiming\b/i.test(location.hash) || new URLSearchParams(location.search).has('timing');
    this.t0 = performance.now();
    this.open = null; // [label, start]
    this.rows = [];
    this.marks = [];
    this.el = null;
  }

  /** Starts step `label` (and ends the one before it). */
  step(label) {
    if (!this.on) return;
    const now = performance.now();
    if (this.open && this.open[0] === label) return;
    this.end(now);
    this.open = [label, now];
  }

  /** Ends the step in progress. */
  end(now = performance.now()) {
    if (!this.on || !this.open) return;
    const [label, start] = this.open;
    this.open = null;
    this.rows.push([label, now - start]);
    this._draw();
  }

  /** A moment worth a line of its own (seconds since the page opened). */
  mark(label) {
    if (!this.on) return;
    this.end();
    const s = (performance.now() - this.t0) / 1000;
    this.marks.push([label, s]);
    console.log(`[timing] ${label}: ${s.toFixed(1)} s`);
    this._draw();
  }

  _draw() {
    if (!this.on) return;
    if (!this.el) {
      this.el = document.createElement('pre');
      this.el.dir = 'rtl';
      this.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;max-height:70vh;overflow:auto;margin:0;padding:10px 12px;background:rgba(0,0,0,.82);color:#e8eef5;font:12px/1.45 "JetBrains Mono",monospace;border-radius:8px;pointer-events:auto;white-space:pre';
      document.body.appendChild(this.el);
    }
    // Same step on several islands ("<island>: <step>"): summed by step, and by island.
    const byStep = new Map();
    const byIsland = new Map();
    for (const [label, ms] of this.rows) {
      const m = /^(.*?): (.*)$/.exec(label);
      const step = m ? m[2] : label;
      byStep.set(step, (byStep.get(step) || 0) + ms);
      if (m) byIsland.set(m[1], (byIsland.get(m[1]) || 0) + ms);
    }
    const f = (ms) => `${(ms / 1000).toFixed(2).padStart(6)} ש׳`;
    const lines = ['⏱ זמני טעינה (#timing)', ''];
    for (const [label, s] of this.marks) lines.push(`${s.toFixed(1).padStart(6)} ש׳  ${label}`);
    lines.push('', 'לפי שלב:');
    let rest = 0;
    for (const [step, ms] of [...byStep].sort((a, b) => b[1] - a[1])) {
      if (ms >= 100) lines.push(`${f(ms)}  ${step}`);
      else rest += ms;
    }
    if (rest) lines.push(`${f(rest)}  שאר השלבים`);
    if (byIsland.size) {
      lines.push('', 'לפי אי:');
      for (const [isl, ms] of byIsland) lines.push(`${f(ms)}  ${isl}`);
    }
    this.el.textContent = lines.join('\n');
  }
}

export const timing = new Timing();
