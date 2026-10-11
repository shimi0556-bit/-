// 3D layout. The brain is a volume: the cortex is a shell around both hemispheres, the limbic / subcortical regions sit inside,
// the hindbrain hangs underneath. Every region owns a set of "slots" (points) and its nodes spring to them.
(function (BG) {
  'use strict';
  const L = (BG.layout = { alpha: 0 });
  L.kick = function (a) { L.alpha = Math.max(L.alpha, a == null ? 1 : a); if (BG.wake) BG.wake(); };
  BG.CENTER = { x: 545, y: 365, z: 0 };

  // ---- silhouette helpers (the lateral outline of the three parts) ----
  const probe = document.createElement('canvas').getContext('2d');
  const PATHS = [BG.CEREBRUM, BG.CEREBELLUM, BG.STEM].map((d) => new Path2D(d));
  const inP = (i, x, y) => probe.isPointInPath(PATHS[i], x, y);
  BG.inBrain = (x, y) => inP(0, x, y) || inP(1, x, y) || inP(2, x, y);
  const safe = (x, y, m) => BG.inBrain(x, y) && BG.inBrain(x + m, y) && BG.inBrain(x - m, y) && BG.inBrain(x, y + m) && BG.inBrain(x, y - m);
  const group = (x, y) => (inP(0, x, y) ? 0 : inP(2, x, y) ? 2 : inP(1, x, y) ? 1 : -1);

  // distance to the outline, per part (chamfer transform on a coarse raster) -> half thickness of the volume at (x, y)
  const RES = 3, GW = Math.ceil(BG.W / RES), GH = Math.ceil(BG.H / RES);
  let FIELD = null;
  function buildField() {
    FIELD = PATHS.map((path) => {
      const c = document.createElement('canvas'); c.width = GW; c.height = GH;
      const g = c.getContext('2d'); g.scale(1 / RES, 1 / RES); g.fillStyle = '#000'; g.fill(path);
      const px = g.getImageData(0, 0, GW, GH).data, d = new Float32Array(GW * GH);
      for (let i = 0; i < d.length; i++) d[i] = px[i * 4 + 3] > 127 ? 1e6 : 0;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x; if (!d[i]) continue; let v = d[i]; if (x) v = Math.min(v, d[i - 1] + 1); if (y) v = Math.min(v, d[i - GW] + 1); if (x && y) v = Math.min(v, d[i - GW - 1] + 1.41); if (x < GW - 1 && y) v = Math.min(v, d[i - GW + 1] + 1.41); d[i] = v; }
      for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) { const i = y * GW + x; if (!d[i]) continue; let v = d[i]; if (x < GW - 1) v = Math.min(v, d[i + 1] + 1); if (y < GH - 1) v = Math.min(v, d[i + GW] + 1); if (x < GW - 1 && y < GH - 1) v = Math.min(v, d[i + GW + 1] + 1.41); if (x && y < GH - 1) v = Math.min(v, d[i + GW - 1] + 1.41); d[i] = v; }
      return d;
    });
  }
  const PROFILE = [{ h: 300, R: 150 }, { h: 170, R: 80 }, { h: 52, R: 44 }];
  BG.thickness = function (x, y, g) {
    if (g < 0) return 0;
    if (!FIELD) buildField();
    const gx = BG.clamp(Math.round(x / RES), 0, GW - 1), gy = BG.clamp(Math.round(y / RES), 0, GH - 1);
    const d = Math.min(FIELD[g][gy * GW + gx] * RES, PROFILE[g].R), t = 1 - d / PROFILE[g].R;
    return PROFILE[g].h * Math.sqrt(Math.max(0, 1 - t * t));
  };

  // ---- which region owns a point of the lateral map ----
  const norm = (x, y, r) => { const a = (r.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - r.cx, dy = y - r.cy, u = (dx * c + dy * s) / r.rx, v = (-dx * s + dy * c) / r.ry; return u * u + v * v; };
  const segDist = (x, y, q) => { const [x1, y1, x2, y2] = q, dx = x2 - x1, dy = y2 - y1, t = BG.clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); };
  const SURF = () => BG.REGIONS.filter((r) => r.layer === 'surface'), DEEP = () => BG.REGIONS.filter((r) => r.layer === 'deep');
  BG.ownerAt = function (x, y) {
    const g = group(x, y);
    if (g < 0) return null;
    if (g === 1) return BG.regionById('cer');
    if (g === 2) return BG.regionById(y < 517 ? 'mid' : y < 580 ? 'pons' : 'med');
    let best = null, bd = 1;
    for (const r of DEEP()) { const d = norm(x, y, r); if (d < bd) { bd = d; best = r; } }
    if (best) return best;
    bd = 1e9;
    for (const r of SURF()) { const d = (r.seg ? segDist(x, y, r.seg) : Math.hypot(x - r.cx, y - r.cy)) / (r.w || 1); if (d < bd) { bd = d; best = r; } }
    return best;
  };
  BG.regionAt = BG.ownerAt;

  // ---- slots: candidate points in 3D, ordered by farthest-point sampling over the whole brain ----
  let ORDER = null;
  function buildOrder() {
    const cands = {};
    BG.REGIONS.forEach((r) => { cands[r.id] = []; });
    let curH = 1;
    const add = (r, x, y, z) => cands[r.id].push({ x, y, z, f: Math.min(1, Math.abs(z) / curH) });   // f: how close to the surface (1 = on the shell)
    for (let x = 194; x < 900; x += 12) for (let y = 82; y < 656; y += 12) {
      if (!safe(x, y, 5)) continue;
      const r = BG.ownerAt(x, y); if (!r) continue;
      const g = group(x, y), h = BG.thickness(x, y, g);
      if (h < 6) continue;
      curH = h;
      if (r.layer === 'surface') { add(r, x, y, h * 0.95); add(r, x, y, -h * 0.95); }
      else if (r.layer === 'own') {
        if (g === 2) { add(r, x, y, 0); add(r, x, y, h * 0.7); add(r, x, y, -h * 0.7); } else { add(r, x, y, h * 0.92); add(r, x, y, -h * 0.92); }
      } else {
        const zf = r.zf || [0.1, 0.4];
        for (const f of zf[0] === 0 ? [0, zf[1]] : zf) { if (f === 0) add(r, x, y, 0); else { add(r, x, y, f * h); add(r, x, y, -f * h); } }
      }
    }
    const all = [];
    for (const r of BG.REGIONS) for (const p of cands[r.id]) { p.r = r.id; all.push(p); }
    const out = {}; BG.REGIONS.forEach((r) => { out[r.id] = []; });
    if (!all.length) return out;
    const used = new Uint8Array(all.length), best = new Float32Array(all.length).fill(1e9);
    let cur = 0;
    while (cur >= 0) {
      used[cur] = 1; out[all[cur].r].push(all[cur]);
      let nxt = -1, nv = -1;
      for (let i = 0; i < all.length; i++) {
        if (used[i]) continue;
        const dx = all[i].x - all[cur].x, dy = all[i].y - all[cur].y, dz = all[i].z - all[cur].z, d = dx * dx + dy * dy + dz * dz;
        if (d < best[i]) best[i] = d;
        if (best[i] > nv) { nv = best[i]; nxt = i; }
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
        if (i < seq.length) { n.sx = seq[i].x; n.sy = seq[i].y; n.sz = seq[i].z; n.sf = seq[i].f; return; }
        const k = i - seq.length, a = k * 2.4, rr = 12 + Math.sqrt(k) * 9;   // overflow: a growing ring around the region's centre
        n.sx = r.cx + Math.cos(a) * rr; n.sy = r.cy + Math.sin(a) * rr; n.sz = ((k % 2) ? 1 : -1) * (30 + (k % 5) * 12); n.sf = 0.4;
      });
    }
  }
  BG.spawn = function (n) {          // starting spot of a new node: its region's centre, on a random side
    const r = BG.regionById(n.region), a = Math.random() * 6.283;
    n.x = r.cx + Math.cos(a) * 14; n.y = r.cy + Math.sin(a) * 14; n.z = (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 60); n.vx = n.vy = n.vz = 0;
  };

  L.step = function () {
    const vis = (n) => !BG.isHidden(n);
    const nodes = BG.state.nodes.filter(vis), byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = BG.state.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
    const a = L.alpha;
    if (!nodes.length) { L.alpha = 0; return; }
    const counts = {};
    for (const n of nodes) { counts[n.region] = (counts[n.region] || 0) + 1; if (typeof n.z !== 'number') { n.z = 0; n.vz = 0; } }
    for (const r of BG.REGIONS) { r.scale = 1; r.count = counts[r.id] || 0; }
    assignSlots(nodes);
    const cell = 40, grid = new Map(), key = (x, y, z) => ((Math.floor(x / cell) + 60) * 128 + (Math.floor(y / cell) + 60)) * 128 + Math.floor(z / cell) + 60;
    nodes.forEach((n, i) => { n._i = i; const k = key(n.x, n.y, n.z), arr = grid.get(k); if (arr) arr.push(n); else grid.set(k, [n]); });
    for (const n of nodes) {
      const gx = Math.floor(n.x / cell), gy = Math.floor(n.y / cell), gz = Math.floor(n.z / cell), rn = BG.radius(n) * 0.8;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const arr = grid.get(((gx + ox + 60) * 128 + (gy + oy + 60)) * 128 + gz + oz + 60);
        if (!arr) continue;
        for (const m of arr) {
          if (m._i <= n._i) continue;
          let dx = m.x - n.x, dy = m.y - n.y, dz = m.z - n.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const range = rn + BG.radius(m) * 0.8 + 26;
          if (d >= range) continue;
          if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; }
          const f = ((range - d) / range) * 1.1 * Math.max(a, 0.3);
          n.vx -= (dx / d) * f; n.vy -= (dy / d) * f; n.vz -= (dz / d) * f; m.vx += (dx / d) * f; m.vy += (dy / d) * f; m.vz += (dz / d) * f;
        }
      }
    }
    for (const n of nodes) { n.vx += (n.sx - n.x) * 0.05; n.vy += (n.sy - n.y) * 0.05; n.vz += (n.sz - n.z) * 0.05; }
    for (const e of edges) {
      const p = byId.get(e.from), q = byId.get(e.to);
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const k = (p.region === q.region ? 0.0015 : 0.0006) * Math.max(a, 0.3), f = d * k;
      p.vx += (dx / d) * f; p.vy += (dy / d) * f; p.vz += (dz / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f; q.vz -= (dz / d) * f;
    }
    for (const n of nodes) {
      n.vx *= 0.74; n.vy *= 0.74; n.vz *= 0.74;
      if (n.fixed) { n.vx = n.vy = n.vz = 0; continue; }
      n.x += BG.clamp(n.vx, -9, 9); n.y += BG.clamp(n.vy, -9, 9); n.z += BG.clamp(n.vz, -9, 9);
    }
    L.alpha *= 0.986;
    if (L.alpha < 0.012) L.alpha = 0;
  };
  L.reseed = function () { for (const n of BG.state.nodes) BG.spawn(n); L.kick(1); };
})(window.BG);
