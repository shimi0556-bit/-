// Graph state, persistence, undo and small helpers.
(function (BG) {
  'use strict';
  const LS_KEY = 'brain-graph:v1';
  const S = (BG.state = { nodes: [], edges: [], seq: 1 });
  const listeners = {};
  const byId = new Map();
  const byKey = new Map();
  let batchDepth = 0;
  let pendingEmit = false;
  let saveTimer = 0;
  const undoStack = [];

  BG.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  BG.emit = (ev, a) => { (listeners[ev] || []).forEach((f) => { try { f(a); } catch (e) { console.error(e); } }); };
  BG.regionById = (id) => BG.REGIONS.find((r) => r.id === id);
  BG.kindById = (id) => BG.KINDS.find((k) => k.id === id);
  BG.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  BG.norm = (s) => String(s || '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/["'׳״`“”‘’]/g, '').replace(/\s+/g, ' ').trim();
  BG.key = (s) => { let k = BG.norm(s); if (k.length > 3 && k[0] === 'ה') k = k.slice(1); return k; };
  const keyOf = (n) => (BG.kindById(n.kind) && BG.kindById(n.kind).source ? 'src:' : '') + BG.key(n.label);

  BG.reindex = function () {
    byId.clear(); byKey.clear();
    for (const n of S.nodes) { byId.set(n.id, n); byKey.set(keyOf(n), n); n.deg = 0; }
    for (const e of S.edges) { const a = byId.get(e.from), b = byId.get(e.to); if (a) a.deg++; if (b) b.deg++; }
  };
  BG.nodeById = (id) => byId.get(id);
  BG.findByLabel = (label) => byKey.get(BG.key(label));
  BG.findSource = (label) => byKey.get('src:' + BG.key(label));
  // Resolve an id or a label the AI wrote to a node.
  BG.getNode = (ref) => (ref == null ? null : byId.get(String(ref)) || byKey.get(BG.key(ref)) || null);

  function change() {
    BG.reindex();
    if (batchDepth) { pendingEmit = true; return; }
    BG.emit('change');
    scheduleSave();
  }
  BG.batch = function (fn) {
    batchDepth++;
    try { fn(); } finally {
      batchDepth--;
      if (!batchDepth && pendingEmit) { pendingEmit = false; BG.reindex(); BG.emit('change'); scheduleSave(); }
    }
  };
  BG.touch = change;

  BG.addNode = function (o) {
    const kind = BG.kindById(o.kind) ? o.kind : 'concept';
    const region = BG.regionById(o.region) ? o.region : BG.kindById(kind).home;
    const r = BG.regionById(region);
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.6;
    const n = {
      id: 'n' + S.seq++, label: String(o.label || 'ללא שם').trim().slice(0, 80), kind, region,
      summary: String(o.summary || '').slice(0, 500), notes: String(o.notes || ''),
      x: o.x != null ? o.x : r.cx + Math.cos(a) * r.rx * d, y: o.y != null ? o.y : r.cy + Math.sin(a) * r.ry * d,
      vx: 0, vy: 0, count: 1, created: Date.now(), deg: 0
    };
    if (o.url && /^https?:\/\//i.test(String(o.url))) n.url = String(o.url).slice(0, 500);
    if (o.excerpt) n.excerpt = String(o.excerpt).slice(0, 1800);
    S.nodes.push(n);
    change();
    return n;
  };

  BG.addEdge = function (fromId, toId, rel, w) {
    if (!fromId || !toId || fromId === toId) return null;
    let e = S.edges.find((x) => (x.from === fromId && x.to === toId) || (x.from === toId && x.to === fromId));
    if (e) {
      e.w = BG.clamp((e.w || 1) + 0.5, 1, 3);
      if (rel && (!e.rel || e.rel === 'מכיל')) e.rel = rel;
    } else {
      e = { id: 'e' + S.seq++, from: fromId, to: toId, rel: String(rel || 'קשור ל').slice(0, 40), w: BG.clamp(+w || 1, 1, 3) };
      S.edges.push(e);
    }
    change();
    return e;
  };
  BG.removeEdge = function (id) { S.edges = S.edges.filter((e) => e.id !== id); change(); };
  BG.removeNode = function (id) {
    S.nodes = S.nodes.filter((n) => n.id !== id);
    S.edges = S.edges.filter((e) => e.from !== id && e.to !== id);
    change();
  };
  BG.edgesOf = (id) => S.edges.filter((e) => e.from === id || e.to === id);
  BG.otherEnd = (e, id) => (e.from === id ? e.to : e.from);
  BG.radius = (n) => 5.5 + Math.min(7, Math.sqrt(Math.max(0, (n.deg || 0) * 0.6 + ((n.count || 1) - 1))) * 1.6);

  // ---- persistence ----
  function serialize() {
    return { format: 'brain-graph', version: 1, seq: S.seq, nodes: S.nodes.map((n) => { const c = Object.assign({}, n); delete c.vx; delete c.vy; delete c.act; delete c.hold; delete c.fixed; return c; }), edges: S.edges };
  }
  BG.serialize = serialize;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  BG.scheduleSave = scheduleSave;
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); }
    catch (e) { BG.toast && BG.toast('השמירה בדפדפן נכשלה (אולי המקום נגמר). כדאי לייצא גיבוי JSON.', 'err'); }
  }
  BG.load = function (data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('קובץ לא תקין');
    S.nodes = data.nodes.filter((n) => n && n.id).map((n) => Object.assign({ vx: 0, vy: 0, count: 1, summary: '', notes: '', deg: 0 }, n));
    S.nodes.forEach((n) => { if (n.url && !/^https?:\/\//i.test(String(n.url))) delete n.url; if (!BG.regionById(n.region)) n.region = (BG.kindById(n.kind) || BG.kindById('concept')).home; if (!BG.kindById(n.kind)) n.kind = 'concept'; if (typeof n.x !== 'number') { n.x = 500; n.y = 300; } });
    const ids = new Set(S.nodes.map((n) => n.id));
    S.edges = data.edges.filter((e) => e && ids.has(e.from) && ids.has(e.to));
    S.seq = Math.max(+data.seq || 1, 1 + Math.max(0, ...S.nodes.map((n) => parseInt(String(n.id).slice(1)) || 0), ...S.edges.map((e) => parseInt(String(e.id).slice(1)) || 0)));
    BG.reindex();
    BG.emit('change');
  };
  BG.restore = function () {
    try { const t = localStorage.getItem(LS_KEY); if (t) { BG.load(JSON.parse(t)); return true; } } catch (e) { console.warn('restore failed', e); }
    return false;
  };
  BG.clearAll = function () { S.nodes = []; S.edges = []; S.seq = 1; change(); };

  BG.snapshot = function () {
    undoStack.push(JSON.stringify(serialize()));
    if (undoStack.length > 12) undoStack.shift();
    BG.emit('undo-state', undoStack.length);
  };
  BG.undo = function () {
    const s = undoStack.pop();
    if (!s) return false;
    BG.load(JSON.parse(s));
    scheduleSave();
    BG.emit('undo-state', undoStack.length);
    return true;
  };
  BG.canUndo = () => undoStack.length > 0;
})(window.BG);
