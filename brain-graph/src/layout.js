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

  L.step = function () {
    const nodes = BG.state.nodes, edges = BG.state.edges;
    const a = L.alpha;
    if (!nodes.length) { L.alpha = 0; return; }
    const counts = {};
    for (const n of nodes) counts[n.region] = (counts[n.region] || 0) + 1;
    for (const r of BG.REGIONS) {
      const need = ((counts[r.id] || 0) * 300) / (Math.PI * r.rx * r.ry);
      const target = Math.min(1.7, Math.max(1, Math.sqrt(need)));
      r.scale = (r.scale || 1) + (target - (r.scale || 1)) * 0.06;
      r.count = counts[r.id] || 0;
    }
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
          const range = rn + BG.radius(m) + 20;
          if (d >= range) continue;
          if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.sqrt(dx * dx + dy * dy) || 1; }
          const f = ((range - d) / range) * 1.3 * a;
          n.vx -= (dx / d) * f; n.vy -= (dy / d) * f; m.vx += (dx / d) * f; m.vy += (dy / d) * f;
        }
      }
    }
    for (const n of nodes) {
      const r = BG.regionById(n.region);
      n.vx += (r.cx - n.x) * 0.0035 * a; n.vy += (r.cy - n.y) * 0.0035 * a;
      const d2 = BG.regNorm(n.x, n.y, r);
      if (d2 > 0.75) { const k = (d2 - 0.75) * 0.05; n.vx += (r.cx - n.x) * k; n.vy += (r.cy - n.y) * k; }
      for (const o of BG.REGIONS) {
        if (o.layer !== 'deep' || o.id === n.region) continue;
        const d = BG.regNorm(n.x, n.y, o);
        if (d < 1.15) { const k = (1.15 - d) * 0.06 * a, dx = n.x - o.cx, dy = n.y - o.cy; n.vx += dx * k; n.vy += dy * k; }
      }
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const p = byId.get(e.from), q = byId.get(e.to);
      if (!p || !q) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const same = p.region === q.region;
      const target = same ? 52 : 120, k = (same ? 0.018 : 0.0035) * a;
      const f = (d - target) * k;
      p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx *= 0.74; n.vy *= 0.74;
      if (n.fixed) { n.vx = n.vy = 0; continue; }
      n.x += BG.clamp(n.vx, -9, 9); n.y += BG.clamp(n.vy, -9, 9);
    }
    L.alpha *= 0.983;
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
