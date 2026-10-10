// Force layout: every node is pulled into the ellipse of its brain region; links add weak springs.
(function (BG) {
  'use strict';
  const L = (BG.layout = { alpha: 0 });
  L.kick = function (a) { L.alpha = Math.max(L.alpha, a == null ? 1 : a); if (BG.wake) BG.wake(); };

  // squared normalised distance from the region centre (<1 inside the ellipse)
  BG.regNorm = function (x, y, r) {
    const s = r.scale || 1, rad = (r.rot * Math.PI) / 180, c = Math.cos(rad), sn = Math.sin(rad);
    const dx = x - r.cx, dy = y - r.cy;
    const u = (dx * c + dy * sn) / (r.rx * s), v = (-dx * sn + dy * c) / (r.ry * s);
    return u * u + v * v;
  };
  // which region is under a point; deep regions win, then the tightest fit
  BG.regionAt = function (x, y) {
    let best = null, bd = 1;
    for (const r of BG.REGIONS) {
      const d = BG.regNorm(x, y, r) * (r.layer === 'deep' ? 0.6 : 1);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };

  // The cortex silhouette is never drawn, but every node is kept inside it.
  const probe = document.createElement('canvas').getContext('2d');
  const PATHS = [BG.CEREBRUM, BG.CEREBELLUM, BG.STEM].map((d) => new Path2D(d));
  BG.inBrain = (x, y) => PATHS.some((p) => probe.isPointInPath(p, x, y));
  const inSafe = (x, y) => BG.inBrain(x, y) && BG.inBrain(x + 9, y) && BG.inBrain(x - 9, y) && BG.inBrain(x, y + 9) && BG.inBrain(x, y - 9);
  // radius of the soft glow a node casts: few nodes in a region => big glows, so the region still reads as a solid patch
  BG.auraR = (r) => BG.clamp(0.8 * Math.sqrt((Math.PI * r.rx * r.ry * Math.pow(r.scale || 1, 2)) / Math.max(1, r.count || 1)), 24, 85);

  // Slot order per region: a farthest-point sequence over (cortex outline + interior), outline first. The first
  // nodes of a region therefore sit on the brain's contour, later ones fill inward - so the silhouette shows at any size.
  let ORDER = null;
  function buildOrder() {
    const SVGNS = 'http://www.w3.org/2000/svg';
    const cands = {};
    BG.REGIONS.forEach((r) => { cands[r.id] = []; });
    const surface = BG.REGIONS.filter((r) => r.layer === 'surface' && !r.own), deep = BG.REGIONS.filter((r) => r.layer === 'deep');
    const nearestSurface = (x, y) => { let best = null, bd = 1e9; for (const r of surface) { const d = BG.regNorm(x, y, Object.assign({}, r, { scale: 1 })); if (d < bd) { bd = d; best = r; } } return best; };
    const inCer = (x, y) => probe.isPointInPath(PATHS[0], x, y);
    const place = (x, y, outline) => {
      if (inCer(x, y)) {
        if (!outline) for (const r of deep) if (BG.regNorm(x, y, Object.assign({}, r, { scale: 1 })) < 1) { cands[r.id].push({ x, y, o: false }); return; }
        const r = nearestSurface(x, y); cands[r.id].push({ x, y, o: outline });
      } else if (probe.isPointInPath(PATHS[2], x, y)) cands.stem.push({ x, y, o: outline });
      else if (probe.isPointInPath(PATHS[1], x, y)) cands.cer.push({ x, y, o: outline });
    };
    for (let x = 200; x < 900; x += 15) for (let y = 80; y < 660; y += 15) if (inSafe(x, y)) place(x, y, false);
    // outline samples, nudged inward so a node and its glow sit inside the contour
    [[BG.CEREBRUM, 0], [BG.CEREBELLUM, 1], [BG.STEM, 2]].forEach(([d, pi]) => {
      const el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', d);
      const len = el.getTotalLength();
      for (let t = 0; t < len; t += 11) {
        const pt = el.getPointAtLength(t), pn = el.getPointAtLength(Math.min(len, t + 1));
        let nx = -(pn.y - pt.y), ny = pn.x - pt.x; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
        for (const sg of [1, -1]) {
          const x = pt.x + nx * 11 * sg, y = pt.y + ny * 11 * sg;
          if (probe.isPointInPath(PATHS[pi], x, y)) {
            // skip bits of the cerebellum / stem outline that are hidden under the cerebrum
            if (pi > 0 && inCer(x, y)) break;
            place(x, y, true); break;
          }
        }
      }
    });
    // One farthest-point sequence over ALL candidates (so slots of neighbouring regions never collide);
    // each region then takes its own candidates in that global order.
    const all = [];
    for (const r of BG.REGIONS) for (const p of cands[r.id]) { p.r = r.id; all.push(p); }
    const out = {};
    BG.REGIONS.forEach((r) => { out[r.id] = []; });
    if (!all.length) return out;
    const used = new Uint8Array(all.length), best = new Float32Array(all.length).fill(1e9);
    let cur = 0;
    all.forEach((p, i) => { if (p.o && (!all[cur].o || p.y < all[cur].y)) cur = i; });
    while (cur >= 0) {
      used[cur] = 1; out[all[cur].r].push(all[cur]);
      let nxt = -1, nv = -1;
      for (let i = 0; i < all.length; i++) {
        if (used[i]) continue;
        const d = Math.hypot(all[i].x - all[cur].x, all[i].y - all[cur].y);
        if (d < best[i]) best[i] = d;
        const v = best[i] * (all[i].o ? 1.6 : 1);
        if (v > nv) { nv = v; nxt = i; }
      }
      cur = nxt;
    }
    return out;
  }

  function assignSlots(nodes) {
    if (!ORDER) ORDER = buildOrder();
    const by = {};
    for (const n of nodes) (by[n.region] = by[n.region] || []).push(n);
    for (const id in by) {
      const r = BG.regionById(id), seq = ORDER[id] || [];
      const arr = by[id].sort((a, b) => (parseInt(a.id.slice(1)) || 0) - (parseInt(b.id.slice(1)) || 0));
      arr.forEach((n, i) => {
        if (i < seq.length) { n.sx = seq[i].x; n.sy = seq[i].y; return; }
        const k = i - seq.length, rr = Math.sqrt((k + 0.5) / arr.length) * 0.8, th = k * 2.39996; // overflow: spiral near the centre
        n.sx = r.cx + r.rx * rr * Math.cos(th); n.sy = r.cy + r.ry * rr * Math.sin(th);
      });
    }
  }

  L.step = function () {
    const nodes = BG.state.nodes, edges = BG.state.edges;
    const a = L.alpha;
    if (!nodes.length) { L.alpha = 0; return; }
    const counts = {};
    for (const n of nodes) counts[n.region] = (counts[n.region] || 0) + 1;
    for (const r of BG.REGIONS) {
      r.scale = 1;
      r.count = counts[r.id] || 0;
    }
    assignSlots(nodes);
    const cell = 46, grid = new Map();
    nodes.forEach((n, i) => {
      n._i = i;
      const k = (Math.floor(n.x / cell) + 500) * 1000 + (Math.floor(n.y / cell) + 500);
      const arr = grid.get(k);
      if (arr) arr.push(n); else grid.set(k, [n]);
    });
    for (const n of nodes) {
      const gx = Math.floor(n.x / cell) + 500, gy = Math.floor(n.y / cell) + 500, rn = BG.radius(n);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = grid.get((gx + ox) * 1000 + gy + oy);
        if (!arr) continue;
        for (const m of arr) {
          if (m._i <= n._i) continue;
          let dx = m.x - n.x, dy = m.y - n.y, d = Math.sqrt(dx * dx + dy * dy);
          const range = rn + BG.radius(m) + 14;
          if (d >= range) continue;
          if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.sqrt(dx * dx + dy * dy) || 1; }
          const f = ((range - d) / range) * 0.8 * Math.max(a, 0.3);
          n.vx -= (dx / d) * f; n.vy -= (dy / d) * f; m.vx += (dx / d) * f; m.vy += (dy / d) * f;
        }
      }
    }
    for (const n of nodes) { n.vx += (n.sx - n.x) * 0.05; n.vy += (n.sy - n.y) * 0.05; }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const p = byId.get(e.from), q = byId.get(e.to);
      if (!p || !q) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = (p.region === q.region ? 0.0015 : 0.0006) * Math.max(a, 0.3), f = d * k;
      p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx *= 0.74; n.vy *= 0.74;
      if (n.fixed) { n.vx = n.vy = 0; continue; }
      n.x += BG.clamp(n.vx, -9, 9); n.y += BG.clamp(n.vy, -9, 9);
      if (!BG.inBrain(n.x, n.y)) { const r = BG.regionById(n.region); n.x += (r.cx - n.x) * 0.15; n.y += (r.cy - n.y) * 0.15; }
    }
    L.alpha *= 0.986;
    if (L.alpha < 0.012) L.alpha = 0;
  };

  // Spread all nodes out of their current spots (used after bulk changes / the "scatter" button).
  L.reseed = function () {
    for (const n of BG.state.nodes) {
      const r = BG.regionById(n.region), a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 0.8;
      n.x = r.cx + Math.cos(a) * r.rx * d; n.y = r.cy + Math.sin(a) * r.ry * d; n.vx = n.vy = 0;
    }
    L.kick(1);
  };
})(window.BG);
