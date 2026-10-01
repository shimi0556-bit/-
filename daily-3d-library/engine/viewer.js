// Daily 3D Library — shared viewer.
// Loads window.L3D_META (from meta.json) and window.L3D_MODEL (model.js),
// builds the model with the kit and wraps it in the studio + Hebrew UI:
// systems / parts / specs panel, exploded view, x-ray, cutaway, model toggles,
// camera presets, hover + select with part cards, screenshot.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const SHOT = new URLSearchParams(location.search).has('shot');

async function waitForModel() {
  for (let i = 0; i < 600; i++) { if (window.L3D?.kit && window.L3D_MODEL) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error('model script did not register window.L3D_MODEL');
}

function showError(err) {
  console.error(err);
  const box = $('.loading');
  if (box) { box.style.opacity = 1; box.hidden = false; box.querySelector('div').append(h('div', { class: 'err' }, String(err && err.stack || err))); }
  window.__error = String(err);
}
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

// A dark photo studio with soft-box strips: dark paint and glass pick up crisp
// highlight lines instead of mirroring a bright white room.
function studioEnvironment() {
  const env = new THREE.Scene();
  const bright = (k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide });
  const room = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = room.geometry.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) / 30 + 1) / 2; const c = 0.06 + 0.16 * Math.pow(1 - Math.abs(t - 0.45) * 1.6, 2); cols.push(c, c * 1.03, c * 1.1); }
  room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(room);
  const floorM = new THREE.Mesh(new THREE.CircleGeometry(30, 48), bright(0.32)); floorM.rotation.x = -Math.PI / 2; floorM.position.y = -1; env.add(floorM);
  const box = (w, h, k, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bright(k)); m.position.set(...pos); m.rotation.set(...rot); env.add(m); };
  for (const z of [-3.2, 0, 3.2]) box(14, 1.4, 5.5, [0, 9, z], [Math.PI / 2, 0, 0]);   // overhead strips
  box(2.2, 7, 2.6, [0, 3, 12], [0, Math.PI, 0]); box(2.2, 7, 2.6, [0, 3, -12], [0, 0, 0]); // side strips
  box(10, 4, 1.2, [14, 3, 0], [0, -Math.PI / 2, 0]); box(10, 4, 0.8, [-14, 3, 0], [0, Math.PI / 2, 0]); // front / rear fill
  return env;
}

async function main() {
  const meta = window.L3D_META || {};
  document.documentElement.style.setProperty('--accent', meta.accent || '#c8a75a');
  if (SHOT) document.body.classList.add('shot');
  await waitForModel();
  const K = window.L3D.kit;
  const MODEL = window.L3D_MODEL;

  // ------------------------------------------------------------- renderer
  const stage = $('#stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, SHOT ? 1 : 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const BG_DAY = new THREE.Color(0x10141b), BG_NIGHT = new THREE.Color(0x030407);
  scene.background = BG_DAY;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(32, stage.clientWidth / stage.clientHeight, 0.05, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.15; controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.495;

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a1510, 0.55); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); key.castShadow = true;
  key.shadow.mapSize.set(SHOT ? 2048 : 2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.1); rim.position.set(-6, 3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe7c4, 0.5); fill.position.set(-3, 2, 6); scene.add(fill);

  // studio floor: soft radial falloff + contact shadow
  const floorTex = K.canvasTexture(512, 512, (g, w, hh) => {
    const gr = g.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, w / 2);
    gr.addColorStop(0, '#3a414c'); gr.addColorStop(0.45, '#232831'); gr.addColorStop(1, '#10141b');
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.PolarGridHelper(12, 24, 24, 96, 0x2a313b, 0x1d232b);
  grid.position.y = 0.001; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);

  // ------------------------------------------------------------ build model
  const t0 = performance.now();
  const root = new THREE.Group(); root.name = 'model';
  const systems = new Map();
  for (const s of meta.systems || []) {
    const g = new THREE.Group(); g.name = s.id; g.userData.system = s; root.add(g); systems.set(s.id, g);
  }
  const ctx = { K, THREE, meta, sys: (id) => { if (!systems.has(id)) throw new Error('unknown system ' + id); return systems.get(id); }, scene, renderer };
  await MODEL.build(ctx);
  scene.add(root);
  root.updateMatrixWorld(true);
  const buildMs = performance.now() - t0;

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const radius = size.length() / 2;
  key.shadow.camera.left = -radius * 1.2; key.shadow.camera.right = radius * 1.2;
  key.shadow.camera.top = radius * 1.2; key.shadow.camera.bottom = -radius * 1.2;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 30; key.target.position.copy(centre);
  key.position.copy(centre).add(new THREE.Vector3(4, 7, 5));

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.z * 1.6), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, opacity: 0.85,
    map: K.canvasTexture(256, 256, (g, w, hh) => { const gr = g.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); }),
  }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(centre.x, 0.002, centre.z); scene.add(contact);

  // ------------------------------------------------------------ parts index
  const sysInfo = new Map((meta.systems || []).map((s) => [s.id, s]));
  // a part may live inside another system's assembly (door glass rides on the door)
  // and still belong to its own system via userData.sysOverride
  const sysOf = (o) => { for (let p = o; p; p = p.parent) { if (p.userData.sysOverride) return p.userData.sysOverride; if (p.userData.system) return p.userData.system.id; } return null; };
  const parts = [];
  let meshCount = 0, triCount = 0;
  root.traverse((o) => {
    if (o.userData.part) {
      let parentPart = null;
      for (let p = o.parent; p && !p.userData.system; p = p.parent) if (p.userData.part) { parentPart = p; break; }
      o.userData.sysId = sysOf(o); o.userData.parentPart = parentPart;
      parts.push(o);
    }
    if (o.isMesh) {
      o.userData.sysId = sysOf(o);
      meshCount++;
      const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      triCount += n * (o.isInstancedMesh ? o.count : 1);
      o.userData.baseMat = o.material;
    }
  });
  const partsOf = (sysId) => parts.filter((p) => p.userData.sysId === sysId);
  let isolated = null;
  window.__stats = { parts: parts.length, meshes: meshCount, triangles: Math.round(triCount), buildMs: Math.round(buildMs) };

  // explode: every part directly under a system moves by system vector + radial spread
  const exploders = [];
  for (const [id, g] of systems) {
    const s = sysInfo.get(id) || {};
    const sv = new THREE.Vector3(...(s.explode || [0, 0.8, 0]));
    const spread = new THREE.Vector3(...(s.spread || [0.35, 0.25, 0.9]));
    for (const c of g.children) {
      const b = new THREE.Box3().setFromObject(c);
      if (b.isEmpty()) continue;
      const pc = b.getCenter(new THREE.Vector3()).sub(centre);
      const off = c.userData.explode ? new THREE.Vector3().copy(c.userData.explode) : sv.clone().add(pc.multiply(spread));
      exploders.push({ o: c, base: c.position.clone(), off, local: false });
    }
  }
  root.traverse((o) => { if (o.userData.explodeLocal) exploders.push({ o, base: o.position.clone(), off: new THREE.Vector3().copy(o.userData.explodeLocal), local: true }); });
  let explode = 0;
  const applyExplode = () => { for (const e of exploders) e.o.position.copy(e.base).addScaledVector(e.off, explode); };

  // ------------------------------------------------------------ x-ray / wire / cut
  const ghost = new THREE.MeshStandardMaterial({ color: 0x86b4ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, metalness: 0 });
  let xray = false, wire = false;
  const shellSys = new Set((meta.systems || []).filter((s) => s.shell).map((s) => s.id));
  const setMaterials = () => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const sysId = o.userData.sysId;
      const sel = selected && isInside(o, selected);
      o.material = xray && shellSys.has(sysId) && !sel ? ghost : sel ? highlight(o.userData.baseMat) : o.userData.baseMat;
      o.castShadow = !(xray && shellSys.has(sysId));
    });
    allMaterials().forEach((m) => { if (m.isMaterial) m.wireframe = wire && m !== ghost; });
    applyClip(true);
  };
  const hlCache = new Map();
  const highlight = (m) => {
    if (Array.isArray(m)) return m.map(highlight);
    if (!hlCache.has(m)) { const c = m.clone(); if (c.emissive) { c.emissive = new THREE.Color(meta.accent || '#c8a75a'); c.emissiveIntensity = 0.35; } hlCache.set(m, c); }
    return hlCache.get(m);
  };
  const allMaterials = () => { const s = new Set([ghost]); root.traverse((o) => { if (o.isMesh) [o.material, o.userData.baseMat].flat().forEach((m) => m && s.add(m)); }); hlCache.forEach((m) => s.add(m)); return s; };

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10);
  let cut = 0, cutAxis = 'z', clipOn = false;
  const applyClip = (force) => {
    const on = cut > 0.001;
    // keep everything below the plane; it sweeps from the far edge of the box inward
    const ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[cutAxis];
    clipPlane.normal.set(-ax[0], -ax[1], -ax[2]);
    const lo = box.min[cutAxis] - 0.02, hi = box.max[cutAxis] + 0.02;
    clipPlane.constant = hi - cut * (hi - lo);
    if (on !== clipOn || force) {
      clipOn = on;
      allMaterials().forEach((m) => { m.clippingPlanes = on ? [clipPlane] : null; m.clipShadows = true; m.needsUpdate = true; });
    }
  };

  // ------------------------------------------------------------ selection
  let selected = null;
  const isInside = (o, anc) => { for (let p = o; p; p = p.parent) if (p === anc) return true; return false; };
  const partOf = (o) => { for (let p = o; p; p = p.parent) if (p.userData.part) return p; return null; };

  // ------------------------------------------------------------ UI
  const app = $('#app');
  const accentOf = (sysId) => sysInfo.get(sysId)?.color || '#888';
  const head = h('div', { class: 'head ui' },
    h('div', { class: 'brand' }, h('span', { class: 'no' }, '#' + String(meta.number || 1).padStart(3, '0')), h('a', { href: '../../index.html' }, 'ספריית התלת־ממד היומית'), h('span', {}, meta.dateHe || meta.date || '')),
    h('h1', {}, meta.title || 'דגם', h('small', {}, meta.subtitle || '')));
  const tip = h('div', { class: 'tip ui', hidden: true });
  const card = h('div', { class: 'card ui', hidden: true });
  const stats = h('div', { class: 'stats ui' });
  app.append(head, tip, card, stats);

  // panel
  const panel = h('div', { class: 'panel ui' + (innerWidth < 900 ? ' closed' : '') });
  const tabs = [['sys', 'מערכות'], ['parts', 'חלקים'], ['spec', 'מפרט'], ['facts', 'עובדות']];
  const pbody = h('div', { class: 'pbody' });
  const tabBar = h('div', { class: 'tabs' }, tabs.map(([id, he]) => h('button', { 'data-t': id, onclick: () => showTab(id) }, he)));
  panel.append(
    h('div', { class: 'ptop' }, h('b', {}, `${parts.length} חלקים · ${systems.size} מערכות`), h('button', { class: 'btn', onclick: () => { panel.classList.toggle('closed'); document.body.classList.toggle('panel-open', !panel.classList.contains('closed')); } }, '☰')),
    tabBar, pbody);
  app.append(panel);
  const visible = new Map([...systems.keys()].map((k) => [k, true]));
  function showTab(id) {
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
    pbody.innerHTML = '';
    if (id === 'sys') {
      for (const [sid, g] of systems) {
        const s = sysInfo.get(sid);
        const cb = h('input', { type: 'checkbox', onchange: (e) => { visible.set(sid, e.target.checked); refreshVisibility(); } });
        cb.checked = visible.get(sid);
        pbody.append(h('div', { class: 'sys' }, h('span', { class: 'dot', style: `background:${s.color}` }),
          h('div', {}, s.he, h('small', {}, s.desc || '')), h('span', { class: 'cnt' }, partsOf(sid).length),
          h('div', { style: 'display:flex;gap:4px;align-items:center' }, h('button', { title: 'הצג רק מערכת זו', onclick: () => soloSystem(sid) }, 'סולו'), cb)));
      }
      pbody.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: () => { for (const k of systems.keys()) visible.set(k, true); refreshVisibility(); showTab('sys'); } }, 'הצג הכול')));
    }
    if (id === 'parts') {
      const q = h('input', { class: 'search', placeholder: 'חיפוש חלק… (למשל: בורג, צמיג, שריון)' });
      const list = h('div');
      const render = () => {
        list.innerHTML = '';
        const term = q.value.trim().toLowerCase();
        for (const [sid] of systems) {
          const ps = partsOf(sid).filter((p) => !term || (p.userData.part.he + ' ' + (p.userData.part.en || '') + ' ' + (p.userData.part.desc || '')).toLowerCase().includes(term));
          if (!ps.length) continue;
          const d = h('details', { class: 'grp', open: !!term },
            h('summary', {}, h('span', { class: 'dot', style: `width:9px;height:9px;border-radius:50%;background:${accentOf(sid)}` }), sysInfo.get(sid).he, h('span', { class: 'cnt' }, ps.length)),
            ps.map((p) => h('button', { class: 'prt' + (p.userData.parentPart ? ' sub' : '') + (p === selected ? ' on' : ''), onclick: () => { select(p); focusOn(p); } }, p.userData.part.he)));
          list.append(d);
        }
      };
      q.addEventListener('input', render); render();
      pbody.append(q, list);
    }
    if (id === 'spec') {
      pbody.append(h('table', { class: 'spec' }, (meta.specs || []).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))));
      if (meta.specNote) pbody.append(h('div', { class: 'note' }, meta.specNote));
    }
    if (id === 'facts') {
      pbody.append(h('ul', { class: 'facts' }, (meta.facts || []).map((f) => h('li', {}, f))));
      if (meta.sources) pbody.append(h('div', { class: 'note', html: 'מקורות: ' + meta.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join(' · ') }));
      pbody.append(h('div', { class: 'note' }, `נבנה בקוד בלבד — בלי קבצי מודל או תמונות. ${window.__stats.meshes.toLocaleString()} רשתות, ${window.__stats.triangles.toLocaleString()} משולשים, נבנה ב-${window.__stats.buildMs}ms.`));
    }
  }
  function soloSystem(sid) { for (const k of systems.keys()) visible.set(k, k === sid); refreshVisibility(); showTab('sys'); }
  function refreshVisibility() {
    root.traverse((o) => { if (o.isMesh) o.visible = visible.get(o.userData.sysId) !== false && (!isolated || isInside(o, isolated)); });
  }
  showTab('sys');

  // toolbar
  const exOut = h('output', {}, '0%'), cutOut = h('output', {}, '0%');
  const exIn = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, oninput: (e) => { setExplodeTarget(+e.target.value); } });
  let zoomedForExplode = false;
  function setExplodeTarget(v) {
    explodeTarget = v; exIn.value = v; exOut.textContent = Math.round(v * 100) + '%';
    // pulling the model apart from close up: back off so the pieces stay in frame
    if (v > 0.35 && !zoomedForExplode && camera.position.distanceTo(controls.target) < radius * 3.4) { zoomedForExplode = true; goView('explode'); }
    if (v < 0.05) zoomedForExplode = false;
  }
  const cutIn = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, oninput: (e) => { cut = +e.target.value; cutOut.textContent = Math.round(cut * 100) + '%'; applyClip(); } });
  const axisSeg = h('div', { class: 'seg' }, [['z', 'צד'], ['y', 'על'], ['x', 'חזית']].map(([a, he]) => h('button', { class: a === cutAxis ? 'on' : '', onclick: (e) => { cutAxis = a; axisSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); applyClip(true); } }, he)));
  let explodeTarget = 0;
  const tbtn = (label, k, on, fn) => { const b = h('button', { class: 'btn' + (on ? ' on' : ''), onclick: () => b.classList.toggle('on', fn()) }, label, k ? h('span', { class: 'k' }, k) : null); return b; };
  const bX = tbtn('רנטגן', 'X', false, () => { xray = !xray; setMaterials(); return xray; });
  const bW = tbtn('שלד קווי', 'W', false, () => { wire = !wire; setMaterials(); return wire; });
  let night = false;
  const bN = tbtn('לילה', 'N', false, () => { night = !night; applyNight(); return night; });
  const bR = tbtn('סיבוב', 'R', false, () => { controls.autoRotate = !controls.autoRotate; return controls.autoRotate; });
  const toggles = K.registry.toggles;
  const tgButtons = toggles.map((t, i) => tbtn(t.he, t.key || String(i + 1), t.target > 0.5, () => { t.target = t.target > 0.5 ? 0 : 1; return t.target > 0.5; }));
  const views = buildViews();
  const viewSel = h('select', { class: 'btn', onchange: (e) => { goView(e.target.value); e.target.value = ''; } }, h('option', { value: '' }, '🎥 מבטים'), Object.entries(views).map(([k, v]) => h('option', { value: k }, v.he)));
  const bShot = h('button', { class: 'btn', onclick: screenshot }, '📷 צילום');
  const bHelp = h('button', { class: 'btn', onclick: () => help.hidden = false }, '?');
  const bar = h('div', { class: 'bar ui' },
    h('div', { class: 'row' }, h('label', { class: 'sl' }, 'פירוק', exIn, exOut), h('label', { class: 'sl' }, 'חתך', cutIn, cutOut, axisSeg)),
    h('div', { class: 'row tg' }, bX, bW, h('span', { class: 'sep' }), tgButtons, h('span', { class: 'sep' }), bN, bR, viewSel, bShot, bHelp));
  app.append(bar);

  const help = h('div', { class: 'help ui', hidden: true, onclick: () => help.hidden = true }, h('div', { html: `
    <b>איך משתמשים</b><br>
    גרירה — סיבוב · גלגלת / צביטה — זום · קליק ימני / שתי אצבעות — הזזה<br>
    ריחוף מעל חלק — שם החלק · קליק — כרטיס מידע, <kbd>F</kbd> מתמקד, <kbd>I</kbd> מבודד<br>
    <kbd>E</kbd> פירוק · <kbd>C</kbd> חתך · <kbd>X</kbd> רנטגן · <kbd>W</kbd> שלד קווי · <kbd>N</kbd> לילה · <kbd>R</kbd> סיבוב<br>
    ${toggles.map((t, i) => `<kbd>${t.key || i + 1}</kbd> ${t.he}`).join(' · ')}<br>
    <kbd>Esc</kbd> ביטול בחירה · <kbd>0</kbd> מבט פתיחה` }));
  app.append(help);

  function renderCard(p) {
    if (!p) { card.hidden = true; return; }
    const info = p.userData.part, sid = p.userData.sysId;
    const crumbs = []; for (let q = p.userData.parentPart; q; q = q.userData.parentPart) crumbs.unshift(q.userData.part.he);
    card.innerHTML = '';
    card.append(...[
      h('button', { class: 'x', onclick: () => select(null) }, '×'),
      h('span', { class: 'chip' }, h('i', { style: `background:${accentOf(sid)}` }), sysInfo.get(sid)?.he || ''),
      crumbs.length ? h('div', { class: 'crumbs' }, crumbs.join(' › ') + ' ›') : null,
      h('h3', {}, info.he), info.en ? h('div', { class: 'en' }, info.en) : null,
      info.desc ? h('p', {}, info.desc) : null,
      info.mat ? h('div', { class: 'mat' }, 'חומר: ' + info.mat) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => focusOn(p) }, 'מקד', h('span', { class: 'k' }, 'F')), h('button', { class: 'btn', onclick: () => isolate(p) }, isolated ? 'הצג הכול' : 'בודד', h('span', { class: 'k' }, 'I')))].filter(Boolean));
    card.hidden = false;
  }
  function select(p) {
    selected = p; setMaterials(); renderCard(p);
    if (tabBar.querySelector('.on')?.dataset.t === 'parts') pbody.querySelectorAll('.prt').forEach((b) => b.classList.toggle('on', b.textContent === p?.userData.part.he));
  }
  function isolate(p) {
    isolated = isolated || !p ? null : p;
    if (isolated) for (const k of systems.keys()) visible.set(k, true);
    refreshVisibility(); renderCard(selected);
  }

  // camera
  function buildViews() {
    // portrait screens need the camera further back to fit the model's length
    const c = centre, r0 = radius, r = r0 * Math.max(1, 1.45 / camera.aspect);
    const v = {
      explode: { he: 'מבט פירוק', pos: [c.x + r * 2.3, c.y + r * 1.25, c.z + r * 2.6], target: [c.x, c.y + 0.5, c.z] },
      hero: { he: 'מבט פתיחה', pos: [c.x + r * 1.55, c.y + r * 0.55, c.z + r * 1.75], target: [c.x, c.y * 0.8, c.z] },
      front: { he: 'חזית', pos: [c.x + r * 2.4, c.y + 0.2, c.z], target: [c.x, c.y, c.z] },
      side: { he: 'צד', pos: [c.x, c.y + 0.2, c.z + r * 2.4], target: [c.x, c.y, c.z] },
      rear: { he: 'אחור', pos: [c.x - r * 2.4, c.y + 0.3, c.z + 0.001], target: [c.x, c.y, c.z] },
      top: { he: 'מלמעלה', pos: [c.x + 0.001, c.y + r * 2.7, c.z], target: [c.x, c.y, c.z] },
      under: { he: 'מלמטה (שלדה)', pos: [c.x + r * 0.8, 0.12, c.z + r * 1.3], target: [c.x, 0.5, c.z] },
    };
    for (const [k, w] of Object.entries(meta.views || {})) v[k] = w;
    return v;
  }
  let camAnim = null;
  function flyTo(pos, target, ms = 900, fov = 32) {
    if (SHOT) { camera.position.set(...pos); controls.target.set(...target); camera.fov = fov; camera.updateProjectionMatrix(); controls.update(); return; }
    camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), f0: camera.fov, f1: fov, start: performance.now(), ms };
  }
  function goView(k) {
    const v = views[k]; if (!v) return;
    // looking at the chassis needs the camera below the floor
    controls.maxPolarAngle = k === 'under' || v.under ? Math.PI : Math.PI * 0.495;
    floor.visible = grid.visible = contact.visible = !(k === 'under' || v.under);
    // a view can open things first (e.g. the engine view opens the hood)
    (v.toggles || []).forEach((id) => { const i = toggles.findIndex((t) => t.id === id); if (i >= 0) { toggles[i].target = 1; if (SHOT) { toggles[i].t = 1; toggles[i].apply(1); } tgButtons[i]?.classList.add('on'); } });
    flyTo(v.pos, v.target, 900, v.fov || 32);
  }
  function focusOn(p) {
    const b = new THREE.Box3().setFromObject(p); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()); const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.08);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.25;
    flyTo(c.clone().addScaledVector(dir, dist).toArray(), c.toArray());
  }
  const startView = views[meta.startView || 'hero'] || views.hero;
  camera.position.set(...startView.pos); controls.target.set(...startView.target); controls.update();
  const viewKeys = Object.keys(views);

  // night mode: darker world, model toggles flagged night:true switch on
  function applyNight() {
    scene.background = night ? BG_NIGHT : BG_DAY;
    scene.environmentIntensity = night ? 0.22 : 0.9;
    hemi.intensity = night ? 0.12 : 0.55; key.intensity = night ? 0.25 : 2.2; rim.intensity = night ? 0.6 : 1.1; fill.intensity = night ? 0.08 : 0.5;
    key.color.set(night ? 0x9db4ff : 0xffffff);
    floor.material.color.set(night ? 0x3a3f48 : 0xffffff);
    toggles.forEach((t, i) => { if (t.night) { t.target = night ? 1 : 0; tgButtons[i].classList.toggle('on', night); } });
  }

  function screenshot() {
    renderer.render(scene, camera);
    const a = h('a', { href: renderer.domElement.toDataURL('image/png'), download: (meta.id || 'model') + '.png' }); a.click();
  }

  // hover + click
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null, lastHover = 0, hoverPart = null;
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(root, true).filter((x) => x.object.visible && visibleChain(x.object) && x.object.material !== ghost && !(clipOn && clipPlane.distanceToPoint(x.point) < 0));
    return hits.length ? partOf(hits[0].object) : null;
  };
  const visibleChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; tip.hidden = true; });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'touch') return;
    const now = performance.now(); if (now - lastHover < 50) return; lastHover = now;
    hoverPart = pick(e);
    if (hoverPart) {
      tip.innerHTML = ''; tip.append(h('i', { style: `background:${accentOf(hoverPart.userData.sysId)}` }), hoverPart.userData.part.he);
      tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.hidden = false; renderer.domElement.style.cursor = 'pointer';
    } else { tip.hidden = true; renderer.domElement.style.cursor = ''; }
  });
  renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const p = pick(e);
    // clicking the same part again climbs to its parent assembly
    if (p && selected && p === selected && p.userData.parentPart) select(p.userData.parentPart);
    else select(p);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (k === 'e') setExplodeTarget(explodeTarget > 0.5 ? 0 : 1);
    else if (k === 'c') { cut = cut > 0 ? 0 : 0.5; cutIn.value = cut; cutOut.textContent = Math.round(cut * 100) + '%'; applyClip(); }
    else if (k === 'x') bX.click(); else if (k === 'w') bW.click(); else if (k === 'n') bN.click(); else if (k === 'r') bR.click();
    else if (k === 'f' && selected) focusOn(selected); else if (k === 'i' && selected) isolate(selected);
    else if (k === 'escape') { select(null); help.hidden = true; } else if (k === '0') goView(meta.startView || 'hero');
    else { const i = toggles.findIndex((t, n) => (t.key || String(n + 1)) === k); if (i >= 0) tgButtons[i].click(); }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
  });

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let frames = 0, fpsT = 0, fps = 0;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    if (camAnim) {
      const k = Math.min(1, (performance.now() - camAnim.start) / camAnim.ms), s = k * k * (3 - 2 * k);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, s); controls.target.lerpVectors(camAnim.t0, camAnim.t1, s);
      if (camAnim.f0 !== camAnim.f1) { camera.fov = camAnim.f0 + (camAnim.f1 - camAnim.f0) * s; camera.updateProjectionMatrix(); }
      if (k >= 1) camAnim = null;
    }
    if (Math.abs(explode - explodeTarget) > 1e-4) { explode += (explodeTarget - explode) * Math.min(1, dt * 6); applyExplode(); }
    for (const tg of toggles) {
      if (Math.abs(tg.t - tg.target) > 1e-4) { tg.t += Math.sign(tg.target - tg.t) * Math.min(Math.abs(tg.target - tg.t), dt / (tg.seconds || 1.1)); tg.apply(tg.t); }
    }
    for (const f of K.registry.frames) f(t, dt);
    controls.update();
    renderer.render(scene, camera);
    frames++; fpsT += dt;
    if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; stats.textContent = `${parts.length} חלקים · ${meshCount.toLocaleString()} רשתות · ${Math.round(triCount).toLocaleString()} משולשים · ${fps} FPS`; }
    requestAnimationFrame(tick);
  }
  const ld = $('.loading'); ld.style.opacity = 0; setTimeout(() => (ld.hidden = true), 500);
  if (SHOT) {
    // screenshot harness (tools/check.cjs): no render loop, it calls __render() per shot
    window.__render = () => { for (const f of K.registry.frames) f(1.0, 0); controls.update(); renderer.render(scene, camera); };
    window.__render();
    window.__ready = true;
  } else {
    tick();
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
  }
  window.__viewer = { scene, camera, controls, renderer, root, goView, setExplode: (v) => { explodeTarget = explode = v; applyExplode(); }, toggles, select, focusOn, parts, setCut: (v, a = 'z') => { cutAxis = a; cut = v; applyClip(true); }, setXray: (v) => { xray = v; setMaterials(); }, setNight: (v) => { night = v; applyNight(); } };
}

main().catch(showError);
