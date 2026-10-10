// SVG rendering of the brain, nodes and edges; pan / zoom / drag; activation (the coloured "memory in use" effect).
(function (BG) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const V = (BG.view = { k: 1, x: 0, y: 0, selected: null, filter: null, focusRegion: null, outline: null, labels: true });
  try { { const o = localStorage.getItem('brain-graph:outline'); V.outline = o === '1' ? true : o === '0' ? false : null; } V.labels = localStorage.getItem('brain-graph:labels') !== '0'; } catch (e) { /* ignore */ }
  // null = auto: a faint dotted contour while the graph is small, so the shape reads before the nodes fill it
  BG.effOutline = () => (V.outline == null ? BG.state.nodes.length < 60 : V.outline);
  BG.setOutline = (b) => { V.outline = !!b; BG.markDirty && BG.markDirty(); try { localStorage.setItem('brain-graph:outline', V.outline ? '1' : '0'); } catch (e) { /* ignore */ } };
  BG.setLabels = (b) => { V.labels = !!b; BG.markDirty && BG.markDirty(); try { localStorage.setItem('brain-graph:labels', V.labels ? '1' : '0'); } catch (e) { /* ignore */ } };
  let svg, vp, gEdges, gNodes, gRegions, gBrain, gAura, running = false;
  const nodeEls = new Map(), edgeEls = new Map(), regEls = new Map();
  let positionsDirty = true;

  BG.wake = function () { if (!running) { running = true; requestAnimationFrame(frame); } };

  BG.initView = function (svgEl) {
    svg = svgEl;
    svg.setAttribute('viewBox', '0 0 ' + BG.W + ' ' + BG.H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const defs = mk('defs', null, svg);
    const clip = mk('clipPath', { id: 'brainClip' }, defs);
    mk('path', { d: BG.CEREBRUM }, clip);
    const glow = mk('filter', { id: 'glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
    mk('feGaussianBlur', { stdDeviation: '4', result: 'b' }, glow);
    const fm = mk('feMerge', null, glow);
    mk('feMergeNode', { in: 'b' }, fm); mk('feMergeNode', { in: 'SourceGraphic' }, fm);
    const bigGlow = mk('filter', { id: 'bigGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    mk('feGaussianBlur', { stdDeviation: '14' }, bigGlow);
    const grad = mk('linearGradient', { id: 'brainFill', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    mk('stop', { offset: '0', 'stop-color': '#1b2447' }, grad); mk('stop', { offset: '1', 'stop-color': '#11172e' }, grad);

    for (const r of BG.REGIONS) {
      const rg = mk('radialGradient', { id: 'aura-' + r.id }, defs);
      mk('stop', { offset: '0', 'stop-color': r.color, 'stop-opacity': 0.5 }, rg);
      mk('stop', { offset: '0.55', 'stop-color': r.color, 'stop-opacity': 0.2 }, rg);
      mk('stop', { offset: '1', 'stop-color': r.color, 'stop-opacity': 0 }, rg);
    }

    vp = mk('g', { id: 'viewport' }, svg);
    // optional faint cortex outline (a hint, off by default: the shape is meant to come from the nodes themselves)
    gBrain = mk('g', { fill: 'none', stroke: '#6c8cff', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, vp);
    for (const d of [BG.STEM, BG.CEREBELLUM, BG.CEREBRUM]) mk('path', { d }, gBrain);
    gRegions = mk('g', null, vp);
    gAura = mk('g', { style: 'mix-blend-mode:screen;pointer-events:none' }, vp);
    for (const r of BG.REGIONS) {
      const glowEl = mk('ellipse', { fill: r.color, opacity: 0, filter: 'url(#bigGlow)' }, gRegions);
      const lab = mk('text', { 'text-anchor': 'middle', 'font-size': 11.5, fill: r.color, opacity: 0.55, stroke: '#0b1020', 'stroke-width': 2.4, 'paint-order': 'stroke', 'pointer-events': 'none', 'font-weight': 600 }, vp);
      regEls.set(r.id, { glowEl, lab });
    }
    gEdges = mk('g', { fill: 'none' }, vp);
    gNodes = mk('g', null, vp);
    // labels of regions are drawn above everything inside vp but below nodes? keep them above regions:
    vp.insertBefore(gEdges, gNodes);
    for (const { lab } of regEls.values()) vp.insertBefore(lab, gEdges);
    BG.setLabels(V.labels);
    bindInteraction();
    BG.on('change', sync);
    sync();
  };

  function applyView() { vp.setAttribute('transform', 'translate(' + V.x + ' ' + V.y + ') scale(' + V.k + ')'); BG.wake(); }
  BG.resetView = function () { V.k = 1; V.x = 0; V.y = 0; applyView(); };
  // fit the view to a set of nodes (or the whole brain)
  BG.fitTo = function (ids) {
    const ns = ids && ids.length ? ids.map(BG.nodeById).filter(Boolean) : null;
    if (!ns || !ns.length) return BG.resetView();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ns.forEach((n) => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    const w = Math.max(160, x1 - x0 + 120), h = Math.max(120, y1 - y0 + 120);
    const k = BG.clamp(Math.min(BG.W / w, BG.H / h), 0.8, 2.2);
    V.k = k; V.x = BG.W / 2 - ((x0 + x1) / 2) * k; V.y = BG.H / 2 - ((y0 + y1) / 2) * k; applyView();
  };

  function toSvg(e) { const m = svg.getScreenCTM().inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: p.x, y: p.y }; }
  function toGraph(e) { const p = toSvg(e); return { x: (p.x - V.x) / V.k, y: (p.y - V.y) / V.k }; }

  function bindInteraction() {
    const pts = new Map();
    let pan = null, pinch = null, drag = null;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = toSvg(e), k2 = BG.clamp(V.k * Math.exp(-e.deltaY * 0.0015), 0.6, 6);
      V.x = p.x - (p.x - V.x) * (k2 / V.k); V.y = p.y - (p.y - V.y) * (k2 / V.k); V.k = k2; applyView();
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      const ng = e.target.closest && e.target.closest('g.node');
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: V.k }; pan = null; drag = null; return; }
      svg.setPointerCapture(e.pointerId);
      if (ng) {
        const n = BG.nodeById(ng.getAttribute('data-id'));
        const g = toGraph(e);
        drag = { n, sx: e.clientX, sy: e.clientY, moved: false, ox: n.x - g.x, oy: n.y - g.y };
        n.fixed = true;
      } else pan = { sx: e.clientX, sy: e.clientY, x: V.x, y: V.y, moved: false };
    });
    svg.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, p = toSvg({ clientX: mx, clientY: my });
        const k2 = BG.clamp(pinch.k * (d / pinch.d), 0.6, 6);
        V.x = p.x - (p.x - V.x) * (k2 / V.k); V.y = p.y - (p.y - V.y) * (k2 / V.k); V.k = k2; applyView();
        return;
      }
      if (drag) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
        if (drag.moved) { const g = toGraph(e); drag.n.x = g.x + drag.ox; drag.n.y = g.y + drag.oy; BG.layout.kick(0.25); positionsDirty = true; BG.wake(); }
      } else if (pan) {
        const m = svg.getScreenCTM();
        const dx = (e.clientX - pan.sx) / m.a, dy = (e.clientY - pan.sy) / m.d;
        if (Math.abs(dx) + Math.abs(dy) > 2) pan.moved = true;
        V.x = pan.x + dx; V.y = pan.y + dy; applyView();
      } else {
        const ng = e.target.closest && e.target.closest('g.node');
        BG.emit('hover', ng ? ng.getAttribute('data-id') : null);
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag) {
        const n = drag.n;
        n.fixed = false;
        if (!drag.moved) BG.select(n.id);
        else {
          const r = BG.regionAt(n.x, n.y);
          if (r && r.id !== n.region) { BG.snapshot(); n.region = r.id; BG.touch(); BG.emit('node-moved', n); }
          BG.scheduleSave();
          BG.layout.kick(0.5);
        }
        drag = null;
      } else if (pan) { if (!pan.moved) BG.select(null); pan = null; }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  BG.select = function (id) { V.selected = id; positionsDirty = true; BG.emit('select', id); BG.wake(); };

  // ---- element sync ----
  function sync() {
    const S = BG.state;
    const ids = new Set(S.nodes.map((n) => n.id));
    for (const [id, o] of nodeEls) if (!ids.has(id)) { o.g.remove(); o.aura.remove(); nodeEls.delete(id); }
    for (const n of S.nodes) {
      if (nodeEls.has(n.id)) continue;
      const src = BG.kindById(n.kind).source;
      const g = mk('g', { class: 'node', 'data-id': n.id, style: 'cursor:pointer' }, gNodes);
      const inner = mk('g', null, g);
      const halo = mk('circle', { r: 10, opacity: 0, filter: 'url(#glow)' }, inner);
      const body = src ? mk('rect', { rx: 2.5 }, inner) : mk('circle', {}, inner);
      const ring = mk('circle', { fill: 'none', stroke: '#fff', 'stroke-width': 1.6, opacity: 0 }, inner);
      const label = mk('text', { 'text-anchor': 'middle', 'font-size': 10, fill: '#e8ecff', stroke: '#0b1020', 'stroke-width': 2.6, 'paint-order': 'stroke', 'pointer-events': 'none' }, g);
      const title = mk('title', null, g);
      const aura = mk('circle', {}, gAura);
      nodeEls.set(n.id, { g, inner, halo, body, ring, label, title, src, aura });
    }
    const eids = new Set(S.edges.map((e) => e.id));
    for (const [id, o] of edgeEls) if (!eids.has(id)) { o.remove(); edgeEls.delete(id); }
    for (const e of S.edges) {
      if (edgeEls.has(e.id)) continue;
      const p = mk('path', { 'stroke-linecap': 'round' }, gEdges);
      const t = mk('title', null, p);
      p._t = t;
      edgeEls.set(e.id, p);
    }
    for (const n of S.nodes) {
      const o = nodeEls.get(n.id), r = BG.regionById(n.region), rad = BG.radius(n);
      o.body.setAttribute('fill', o.src ? '#0f1630' : r.color);
      o.body.setAttribute('stroke', r.color);
      o.body.setAttribute('stroke-width', o.src ? 2 : 1);
      o.halo.setAttribute('fill', r.color);
      o.aura.setAttribute('fill', 'url(#aura-' + r.id + ')');
      if (o.src) { o.body.setAttribute('x', -rad); o.body.setAttribute('y', -rad); o.body.setAttribute('width', rad * 2); o.body.setAttribute('height', rad * 2); }
      else o.body.setAttribute('r', rad);
      o.halo.setAttribute('r', rad + 7); o.ring.setAttribute('r', rad + 3);
      o.label.setAttribute('y', rad + 11);
      o.label.textContent = n.label;
      o.title.textContent = n.label + ' · ' + BG.kindById(n.kind).name + ' · ' + r.name + (n.summary ? '\n' + n.summary : '');
    }
    for (const e of S.edges) { const p = edgeEls.get(e.id); p._t.textContent = e.rel || ''; }
    positionsDirty = true;
    BG.layout.kick(0.6);
    BG.wake();
  }

  // ---- activation: the coloured trail of whatever the AI (or the user) is reading ----
  BG.pulse = function (nodeId, viaEdgeId, hold) {
    const n = BG.nodeById(nodeId);
    if (n) { n.act = 1; n.hold = Math.max(n.hold || 0, hold == null ? 0.6 : hold); }
    if (viaEdgeId) { const e = BG.state.edges.find((x) => x.id === viaEdgeId); if (e) { e.act = 1; e.hold = Math.max(e.hold || 0, 0.55); } }
    BG.wake();
  };
  BG.clearActivation = function () {
    for (const n of BG.state.nodes) n.hold = 0;
    for (const e of BG.state.edges) e.hold = 0;
    BG.wake();
  };
  BG.activeRegions = function () {
    const m = new Map();
    for (const n of BG.state.nodes) if ((n.hold || 0) > 0.05 || (n.act || 0) > 0.3) m.set(n.region, (m.get(n.region) || 0) + 1);
    return m;
  };
  BG.setFilter = function (set) { V.filter = set; positionsDirty = true; BG.wake(); };

  function edgePath(a, b, i) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
    const c = 0.12 * (i % 2 ? 1 : -1);
    return 'M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ' Q' + (mx - dy * c).toFixed(1) + ',' + (my + dx * c).toFixed(1) + ' ' + b.x.toFixed(1) + ',' + b.y.toFixed(1);
  }

  function frame() {
    let alive = false;
    if (BG.layout.alpha > 0) { BG.layout.step(); positionsDirty = true; alive = true; }
    const S = BG.state, regAct = new Map();
    const sel = V.selected, selNbrs = new Set();
    if (sel) for (const e of S.edges) { if (e.from === sel) selNbrs.add(e.to); else if (e.to === sel) selNbrs.add(e.from); }
    const showLabelsAll = V.k > 1.6;
    const topLabels = new Set(S.nodes.slice().sort((a, b) => (b.deg || 0) - (a.deg || 0)).slice(0, 36).map((n) => n.id));
    const filter = V.filter, focus = V.focusRegion;
    const edgeBase = BG.clamp(70 / Math.max(1, S.edges.length), 0.35, 1);
    const auraR = {};
    for (const r of BG.REGIONS) auraR[r.id] = BG.auraR(r);

    for (const n of S.nodes) {
      const o = nodeEls.get(n.id);
      if (!o) continue;
      const hold = n.hold || 0, a0 = n.act || 0;
      let a = a0 + (hold - a0) * 0.045;
      if (Math.abs(a - hold) < 0.004) a = hold;
      if (a !== a0) alive = true;
      n.act = a;
      if (a > 0.02) regAct.set(n.region, Math.max(regAct.get(n.region) || 0, a));
      const dim = (filter && !filter.has(n.id)) || (focus && n.region !== focus);
      const isSel = sel === n.id;
      o.g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ' ' + n.y.toFixed(1) + ')');
      o.inner.setAttribute('transform', 'scale(' + (1 + a * 0.45).toFixed(3) + ')');
      o.halo.setAttribute('opacity', (a * 0.95).toFixed(2));
      o.ring.setAttribute('opacity', isSel ? 1 : (a > 0.35 ? 0.85 : 0));
      o.g.setAttribute('opacity', dim ? 0.14 : 1);
      o.aura.setAttribute('cx', n.x.toFixed(1)); o.aura.setAttribute('cy', n.y.toFixed(1));
      o.aura.setAttribute('r', (auraR[n.region] * (1 + a * 0.25)).toFixed(1));
      o.aura.setAttribute('opacity', dim ? 0.08 : Math.min(1, 0.75 + a * 0.6).toFixed(2));
      const showLabel = isSel || selNbrs.has(n.id) || a > 0.3 || showLabelsAll || topLabels.has(n.id) || (filter && filter.has(n.id)) || BG.hoverId === n.id;
      o.label.setAttribute('display', showLabel ? '' : 'none');
      o.label.setAttribute('font-size', (a > 0.3 || isSel ? 12 : 10));
    }
    for (const e of S.edges) {
      const p = edgeEls.get(e.id), A = BG.nodeById(e.from), B = BG.nodeById(e.to);
      if (!p || !A || !B) continue;
      const hold = e.hold || 0, a0 = e.act || 0;
      let a = a0 + (hold - a0) * 0.045;
      if (Math.abs(a - hold) < 0.004) a = hold;
      if (a !== a0) alive = true;
      e.act = a;
      if (positionsDirty) p.setAttribute('d', edgePath(A, B, parseInt(e.id.slice(1)) || 0));
      const isSrc = BG.kindById(A.kind).source || BG.kindById(B.kind).source;
      const touchesSel = sel && (e.from === sel || e.to === sel);
      const dim = (filter && !(filter.has(e.from) && filter.has(e.to))) || (focus && (A.region !== focus && B.region !== focus));
      const col = a > 0.12 ? '#ffd45e' : BG.regionById(A.region).color;
      p.setAttribute('stroke', touchesSel ? '#ffffff' : col);
      p.setAttribute('stroke-width', (0.7 + (e.w || 1) * 0.35 + a * 2.6 + (touchesSel ? 0.8 : 0)).toFixed(2));
      p.setAttribute('stroke-opacity', dim ? 0.04 : Math.min(1, (isSrc ? 0.08 : 0.28) * edgeBase + a * 0.75 + (touchesSel ? 0.5 : 0)).toFixed(2));
      if (isSrc && a < 0.1) p.setAttribute('stroke-dasharray', '3 4'); else p.removeAttribute('stroke-dasharray');
    }
    for (const r of BG.REGIONS) {
      const o = regEls.get(r.id), s = r.scale || 1, a = regAct.get(r.id) || 0;
      o.glowEl.setAttribute('transform', 'translate(' + r.cx + ' ' + r.cy + ') rotate(' + r.rot + ')');
      o.glowEl.setAttribute('rx', r.rx * s * 0.85); o.glowEl.setAttribute('ry', r.ry * s * 0.85);
      o.glowEl.setAttribute('opacity', (a * 0.55 + (focus === r.id ? 0.18 : 0)).toFixed(2));
      o.lab.setAttribute('x', r.cx);
      o.lab.setAttribute('y', r.cy + 4);
      o.lab.setAttribute('display', V.labels && r.count ? '' : 'none');
      o.lab.setAttribute('opacity', (0.4 + a * 0.6).toFixed(2));
      o.lab.setAttribute('font-size', 11 + a * 3);
      if (o.lab._txt !== r.name) { o.lab.textContent = r.name; o.lab._txt = r.name; }
      if (Math.abs((r._ra || 0) - a) > 0.002) { r._ra = a; alive = true; }
    }
    gBrain.setAttribute('opacity', BG.effOutline() ? 0.5 : 0);
    positionsDirty = false;
    if (alive) requestAnimationFrame(frame); else running = false;
  }
  BG.hoverId = null;
  BG.on('hover', (id) => { if (BG.hoverId !== id) { BG.hoverId = id; BG.wake(); } });
  BG.markDirty = () => { positionsDirty = true; BG.wake(); };
})(window.BG);
