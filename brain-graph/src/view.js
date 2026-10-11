// 3D canvas view of the brain graph. Same look as "המפה הנפשית שלי": flat nodes sized by connections, thin grey links,
// purple highlight on hover, quiet labels that never overlap. The scene can be rotated, zoomed and panned.
(function (BG) {
  'use strict';
  const DISP_KEY = 'brain-graph:display';
  const D = (BG.display = { sources: false, nodeSize: 0.5, linkOpacity: 1 });
  try { Object.assign(D, JSON.parse(localStorage.getItem(DISP_KEY) || '{}')); } catch (e) { /* ignore */ }
  let positionsDirty = true, running = false;
  BG.setDisplay = (k, val) => { D[k] = val; try { localStorage.setItem(DISP_KEY, JSON.stringify(D)); } catch (e) { /* ignore */ } BG.layout.kick(0.3); BG.wake(); BG.emit('display'); };
  BG.isHidden = (n) => !D.sources && !!BG.kindById(n.kind).source;
  const V = (BG.view = { selected: null, filter: null, focus: null, outline: null, labels: false });
  try { const o = localStorage.getItem('brain-graph:outline'); V.outline = o === '1' ? true : o === '0' ? false : null; V.labels = localStorage.getItem('brain-graph:labels') === '1'; } catch (e) { /* ignore */ }
  BG.effOutline = () => (V.outline == null ? BG.state.nodes.length < 300 : V.outline);   // faint ghost of the brain while the graph is small
  BG.setOutline = (b) => { V.outline = !!b; try { localStorage.setItem('brain-graph:outline', V.outline ? '1' : '0'); } catch (e) { /* ignore */ } BG.wake(); };
  BG.setLabels = (b) => { V.labels = !!b; try { localStorage.setItem('brain-graph:labels', V.labels ? '1' : '0'); } catch (e) { /* ignore */ } BG.wake(); };
  BG.wake = function () { if (!running) { running = true; requestAnimationFrame(frame); } };
  BG.markDirty = () => { positionsDirty = true; BG.wake(); };

  // ---------- camera ----------
  const cam = (BG.cam = { yaw: 0.5, pitch: -0.12, zoom: 1, px: 0, py: 0, auto: false, vyaw: 0, vpitch: 0 });
  const F = 1500;
  let cv, ctx, W = 0, H = 0, DPR = 1;
  const baseScale = (w, h) => Math.min(w / 820, h / 660) * 0.95;
  function projWith(x, y, z, yaw, pitch, w, h, zoom, px, py) {
    const C = BG.CENTER, X = x - C.x, Y = y - C.y, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const X1 = X * cy + z * sy, Z1 = -X * sy + z * cy, Y2 = Y * cp - Z1 * sp, Z2 = Y * sp + Z1 * cp;
    const s = F / (F - Z2), k = baseScale(w, h) * zoom * s;
    return [w / 2 + px + X1 * k, h / 2 + py + Y2 * k, k, Z2];
  }
  const proj = (x, y, z) => projWith(x, y, z, cam.yaw, cam.pitch, W, H, cam.zoom, cam.px, cam.py);
  // export helper: the current rotation, fitted into a w x h picture
  BG.projectExport = (x, y, z, w, h) => projWith(x, y, z, cam.yaw, cam.pitch, w, h, 1, 0, 0);
  const unproject = (dx, dy, k) => {   // a screen-plane move -> a world move
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const X1 = dx / k, Y2 = dy / k, Z2 = 0, Y = Y2 * cp + Z2 * sp, Z1 = -Y2 * sp + Z2 * cp;
    return [X1 * cy - Z1 * sy, Y, X1 * sy + Z1 * cy];
  };
  BG.setView = (name) => {
    const t = { side: [0, 0], front: [-Math.PI / 2, 0], back: [Math.PI / 2, 0], top: [0, -1.5], bottom: [0, 1.5], other: [Math.PI, 0] }[name] || [0, 0];
    cam.yaw = t[0]; cam.pitch = t[1]; cam.vyaw = cam.vpitch = 0; BG.wake();
  };
  BG.resetView = function () { cam.zoom = 1; cam.px = 0; cam.py = 0; BG.wake(); };
  BG.toggleAuto = () => { cam.auto = !cam.auto; BG.wake(); return cam.auto; };
  BG.fitTo = function (ids) {
    const ns = ids && ids.length ? ids.map(BG.nodeById).filter(Boolean) : null;
    if (!ns || !ns.length) return BG.resetView();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ns.forEach((n) => { const p = projWith(n.x, n.y, n.z || 0, cam.yaw, cam.pitch, W, H, 1, 0, 0); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const z = BG.clamp(Math.min(W / (x1 - x0 + 160), H / (y1 - y0 + 160)), 0.8, 2.2);
    cam.zoom = z; cam.px = -((x0 + x1) / 2 - W / 2) * z; cam.py = -((y0 + y1) / 2 - H / 2) * z; BG.wake();
  };
  BG.select = function (id) { V.selected = id; BG.emit('select', id); BG.wake(); };
  BG.setFilter = function (set) { V.filter = set; BG.wake(); };
  BG.toggleFocus = function (ids) { const cur = V.focus, same = cur && cur.size === ids.length && ids.every((i) => cur.has(i)); V.focus = same ? null : new Set(ids); BG.emit('focus'); BG.wake(); };
  BG.hoverId = null;

  BG.initView = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    const resize = () => { const r = cv.getBoundingClientRect(); DPR = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = Math.max(1, W * DPR); cv.height = Math.max(1, H * DPR); BG.wake(); };
    new ResizeObserver(resize).observe(cv); resize();
    bind();
    BG.on('change', () => { positionsDirty = true; BG.layout.kick(0.6); });
    BG.layout.kick(1);
  };

  // ---------- activation: the coloured trail of whatever the AI (or the user) is reading ----------
  BG.pulse = function (nodeId, viaEdgeId, hold) {
    const n = BG.nodeById(nodeId);
    if (n) { n.act = 1; n.hold = Math.max(n.hold || 0, hold == null ? 0.6 : hold); }
    if (viaEdgeId) { const e = BG.state.edges.find((x) => x.id === viaEdgeId); if (e) { e.act = 1; e.hold = Math.max(e.hold || 0, 0.55); } }
    BG.wake();
  };
  BG.clearActivation = function () { for (const n of BG.state.nodes) n.hold = 0; for (const e of BG.state.edges) e.hold = 0; BG.wake(); };
  BG.activeRegions = function () {
    const m = new Map();
    for (const n of BG.state.nodes) if ((n.hold || 0) > 0.05 || (n.act || 0) > 0.3) m.set(n.region, (m.get(n.region) || 0) + 1);
    return m;
  };

  // ---------- interaction ----------
  let tip = null;
  function pick(sx, sy) {
    let best = null, bz = -1e9;
    for (const n of BG.state.nodes) {
      if (BG.isHidden(n) || n._sx == null) continue;
      const d = Math.hypot(n._sx - sx, n._sy - sy);
      if (d < n._r + 4 && n._zc > bz) { bz = n._zc; best = n; }
    }
    return best;
  }
  BG.pickNode = pick;
  function bind() {
    const pts = new Map();
    let mode = null, drag = null, last = null, pinch = null, moved = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e); pts.set(e.pointerId, [sx, sy]); cv.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.zoom }; mode = 'pinch'; return; }
      moved = false; last = [sx, sy]; cam.vyaw = cam.vpitch = 0;
      const n = pick(sx, sy);
      if (n && e.button === 0) { mode = 'node'; drag = n; n.fixed = true; }
      else mode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'pan' : 'rotate';
      cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', (e) => {
      const [sx, sy] = pos(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [sx, sy]);
      if (mode === 'pinch' && pts.size === 2) { const [a, b] = [...pts.values()]; cam.zoom = BG.clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 0.25, 6); BG.wake(); return; }
      if (mode && last) {
        const dx = sx - last[0], dy = sy - last[1];
        if (Math.hypot(sx - last[0], sy - last[1]) > 0 && Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
        if (mode === 'rotate') { cam.yaw += dx * 0.008; cam.pitch = BG.clamp(cam.pitch + dy * 0.008, -1.55, 1.55); cam.vyaw = BG.clamp(dx * 0.006, -0.06, 0.06); cam.vpitch = BG.clamp(dy * 0.006, -0.06, 0.06); }
        else if (mode === 'pan') { cam.px += dx; cam.py += dy; }
        else if (mode === 'node' && drag) { const k = drag._k || 1, [wx, wy, wz] = unproject(dx, dy, k); drag.x += wx; drag.y += wy; drag.z += wz; drag._moved = true; BG.layout.kick(0.25); }
        last = [sx, sy]; BG.wake();
      } else {
        const n = pick(sx, sy);
        if (n !== (BG.hoverId ? BG.nodeById(BG.hoverId) : null)) { BG.hoverId = n ? n.id : null; BG.wake(); }
        if (n) { const r = BG.regionById(n.region); tip.innerHTML = '<b></b><br><span></span>'; tip.firstChild.textContent = n.label; tip.lastChild.textContent = r.name + ' · ' + BG.kindById(n.kind).name + ' · ' + (n.deg || 0) + ' קשרים'; tip.style.display = 'block'; tip.style.left = Math.min(sx + 14, W - 200) + 'px'; tip.style.top = sy + 14 + 'px'; }
        else tip.style.display = 'none';
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (mode === 'pinch') { if (pts.size < 2) mode = null; return; }
      if (mode === 'node' && drag) {
        const n = drag; n.fixed = false;
        if (!moved) BG.select(n.id);
        else {
          const r = BG.ownerAt(n.x, n.y);
          if (r && r.id !== n.region) { BG.snapshot(); n.region = r.id; BG.touch(); BG.emit('node-moved', n); }
          BG.scheduleSave(); BG.layout.kick(0.6);
        }
      } else if (mode === 'rotate' && !moved) BG.select(null);
      mode = null; drag = null; last = null; cv.classList.remove('drag'); BG.wake();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { BG.hoverId = null; tip.style.display = 'none'; BG.wake(); });
    cv.addEventListener('dblclick', () => { BG.setView('side'); BG.resetView(); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = pos(e), z0 = cam.zoom, z1 = BG.clamp(z0 * Math.exp(-e.deltaY * 0.0015), 0.25, 6);
      cam.px = (sx - W / 2) - ((sx - W / 2) - cam.px) * (z1 / z0); cam.py = (sy - H / 2) - ((sy - H / 2) - cam.py) * (z1 / z0); cam.zoom = z1; BG.wake();
    }, { passive: false });
    tip = document.getElementById('tip');
  }

  // ---------- drawing (same visual rules as the reference graph) ----------
  const TXT = '#8e8e9b', TXT_FOCUS = '#cfcfd8', PURPLE = 'rgba(139,124,246,.9)';
  let cloud = null;
  function brainCloud() {      // a ghost of the brain's surface, so its shape reads while there are few nodes
    if (cloud) return cloud;
    cloud = [];
    for (let x = 196; x < 898; x += 15) for (let y = 84; y < 652; y += 15) {
      if (!BG.inBrain(x, y)) continue;
      const grp = BG.regionAt(x, y); if (!grp) continue;
      const gi = grp.layer === 'own' ? (grp.id === 'cer' ? 1 : 2) : 0, h = BG.thickness(x, y, gi);
      if (h > 8) { cloud.push([x, y, h * 0.97]); cloud.push([x, y, -h * 0.97]); }
    }
    return cloud;
  }
  function frame() {
    let alive = false;
    if (BG.layout.alpha > 0) { BG.layout.step(); positionsDirty = true; alive = true; }
    if (cam.auto) { cam.yaw += 0.004; alive = true; }
    if (Math.abs(cam.vyaw) > 0.0004 || Math.abs(cam.vpitch) > 0.0004) { cam.yaw += cam.vyaw; cam.pitch = BG.clamp(cam.pitch + cam.vpitch, -1.55, 1.55); cam.vyaw *= 0.9; cam.vpitch *= 0.9; alive = true; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    const S = BG.state, sel = V.selected, hoverN = BG.hoverId ? BG.nodeById(BG.hoverId) : null, focusId = hoverN ? hoverN.id : sel;
    const filter = V.filter, fset = V.focus, q = filter;
    const near = new Set();
    if (focusId) { near.add(focusId); for (const e of S.edges) { if (e.from === focusId) near.add(e.to); else if (e.to === focusId) near.add(e.from); } }
    const vis = S.nodes.filter((n) => !BG.isHidden(n));
    let zmin = 1e9, zmax = -1e9;
    for (const n of vis) { const p = proj(n.x, n.y, n.z || 0); n._sx = p[0]; n._sy = p[1]; n._k = p[2]; n._zc = p[3]; n._r = BG.radius(n) * D.nodeSize * p[2]; zmin = Math.min(zmin, p[3]); zmax = Math.max(zmax, p[3]); }
    const outer = (n) => 0.24 + 0.76 * BG.clamp(((n.sf == null ? 1 : n.sf) - 0.35) / 0.55, 0, 1);   // nodes inside the brain are see-through, the shell is solid
  const depth = (zc) => 0.4 + 0.6 * BG.clamp((zc + 330) / 660, 0, 1);   // far side of the brain is dimmer
    // ghost surface
    if (BG.effOutline()) {
      ctx.fillStyle = '#8791bd';
      for (const c of brainCloud()) { const p = proj(c[0], c[1], c[2]); ctx.globalAlpha = 0.42 * depth(p[3]); ctx.fillRect(p[0] - 0.9, p[1] - 0.9, 1.8, 1.8); }
      ctx.globalAlpha = 1;
    }
    // activation: soft glow where the AI is reading
    const regAct = new Map();
    for (const n of vis) {
      const hold = n.hold || 0, a0 = n.act || 0;
      let a = a0 + (hold - a0) * 0.045; if (Math.abs(a - hold) < 0.004) a = hold; if (a !== a0) alive = true; n.act = a;
      if (a > 0.02) regAct.set(n.region, Math.max(regAct.get(n.region) || 0, a));
    }
    for (const [rid, a] of regAct) {
      const r = BG.regionById(rid), h = BG.thickness(r.cx, r.cy, r.layer === 'own' ? (rid === 'cer' ? 1 : 2) : 0);
      for (const z of r.layer === 'deep' || rid === 'mid' || rid === 'pons' || rid === 'med' ? [0] : [h * 0.9, -h * 0.9]) {
        const p = proj(r.cx, r.cy, z), rad = Math.max(r.rx, r.ry) * 1.5 * p[2];
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad); g.addColorStop(0, r.color.replace('hsl(', 'hsla(').replace(')', ',0.4)')); g.addColorStop(1, r.color.replace('hsl(', 'hsla(').replace(')', ',0)'));
        ctx.globalAlpha = Math.min(1, a) * depth(p[3]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // links
    const edgeBase = BG.clamp(90 / Math.max(1, S.edges.length), 0.45, 1) * D.linkOpacity;
    const byId = BG.nodeById;
    for (const e of S.edges) {
      const A = byId(e.from), B = byId(e.to);
      if (!A || !B || BG.isHidden(A) || BG.isHidden(B)) continue;
      const hold = e.hold || 0, a0 = e.act || 0;
      let a = a0 + (hold - a0) * 0.045; if (Math.abs(a - hold) < 0.004) a = hold; if (a !== a0) alive = true; e.act = a;
      const hot = focusId && (e.from === focusId || e.to === focusId);
      const dim = (q && !(q.has(e.from) && q.has(e.to))) || (fset && !fset.has(A.region) && !fset.has(B.region)) || (focusId && !hot);
      const dp = depth((A._zc + B._zc) / 2) * Math.min(outer(A), outer(B));
      ctx.strokeStyle = a > 0.12 ? 'rgba(255,212,94,' + Math.min(1, 0.3 + a) + ')' : hot ? PURPLE : 'rgba(120,120,140,' + ((dim ? 0.1 : 0.35) * edgeBase * dp).toFixed(3) + ')';
      ctx.lineWidth = Math.min(3, 0.7 + (e.w || 1) * 0.3) + (a > 0.12 ? a * 1.8 : 0);   // every line keeps the same thickness on screen
      ctx.beginPath(); ctx.moveTo(A._sx, A._sy); ctx.lineTo(B._sx, B._sy); ctx.stroke();
    }
    // nodes, far to near
    const ordered = vis.slice().sort((a, b) => a._zc - b._zc);
    for (const n of ordered) {
      const dim = (focusId && !near.has(n.id)) || (q && !q.has(n.id)) || (fset && !fset.has(n.region));
      const dp = depth(n._zc), r = n._r * (1 + n.act * 0.35);
      if (n.act > 0.02) { const g = ctx.createRadialGradient(n._sx, n._sy, r * 0.6, n._sx, n._sy, r * 3); g.addColorStop(0, '#ffd45e' + Math.round(Math.min(1, n.act) * 140).toString(16).padStart(2, '0')); g.addColorStop(1, '#ffd45e00'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n._sx, n._sy, r * 3, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = dim ? 0.15 : dp * outer(n); ctx.fillStyle = BG.kindById(n.kind).source ? '#2a2a33' : BG.regionById(n.region).color;
      ctx.beginPath();
      if (BG.kindById(n.kind).source) { if (ctx.roundRect) ctx.roundRect(n._sx - r, n._sy - r, r * 2, r * 2, r * 0.35); else ctx.rect(n._sx - r, n._sy - r, r * 2, r * 2); } else ctx.arc(n._sx, n._sy, r, 0, 6.2832);
      ctx.fill();
      if (BG.kindById(n.kind).source) { ctx.strokeStyle = '#8e8e9b'; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (n.id === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // region names (optional)
    if (V.labels) {
      ctx.font = '600 11px "Segoe UI",Arial'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
      for (const r of BG.REGIONS) { if (!r.count) continue; const h = BG.thickness(r.cx, r.cy, r.layer === 'own' ? (r.id === 'cer' ? 1 : 2) : 0), p = proj(r.cx, r.cy, r.layer === 'surface' ? h : 0); if (p[3] < -60 && r.layer === 'surface') continue; ctx.fillStyle = r.color; ctx.globalAlpha = 0.55; ctx.fillText(r.name, p[0], p[1] - 8); }
      ctx.globalAlpha = 1;
    }
    // labels: fade out when zoomed away, never overlap, the most important first (as in the reference)
    ctx.font = '12px "Segoe UI",Arial'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    const zz = baseScale(W, H) * cam.zoom, cand = [];
    for (const n of vis) {
      const imp = n.id === focusId || (focusId && near.has(n.id)) || (q && q.has(n.id)) || (n.act || 0) > 0.3;
      if ((focusId || q) && !imp) continue;
      let alpha = 1;
      if (!imp) { const lo = (n.deg || 0) >= 4 ? 0.3 : 0.45; alpha = Math.min(1, Math.max(0, (zz - lo) / 0.25)); if (alpha < 0.03) continue; alpha *= depth(n._zc) * outer(n); }
      if (n._sx < -80 || n._sx > W + 80 || n._sy < -20 || n._sy > H + 20) continue;
      cand.push({ n, alpha, pr: (n.id === focusId ? 1e7 : 0) + (imp ? 1e6 : 0) + (n.deg || 0) * 10 + n._zc * 0.01 });
    }
    cand.sort((a, b) => b.pr - a.pr);
    const boxes = [];
    for (const c of cand) {
      const n = c.n, text = n.label, w = ctx.measureText(text).width + 10, h = 15, x = n._sx - w / 2, y = n._sy + n._r + 3;
      if (boxes.some((b) => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1])) continue;
      boxes.push([x, y, w, h]);
      ctx.globalAlpha = c.alpha; ctx.fillStyle = n.id === focusId ? TXT_FOCUS : TXT; ctx.fillText(text, n._sx, n._sy + n._r + 13);
    }
    ctx.globalAlpha = 1;
    positionsDirty = false;
    if (alive) requestAnimationFrame(frame); else running = false;
  }
})(window.BG);
