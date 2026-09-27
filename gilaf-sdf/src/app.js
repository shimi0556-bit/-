// Studio UI: editor, live preview, sliders, Claude generation and mesh export.

/* global BUILTIN_RECIPES */
import { runRecipe, countNodes, RecipeError } from './dsl.js';
import { compile } from './glsl.js';
import { Preview, LIGHTS } from './renderer.js';
import { Mesher, simplifyMesh, meshStats } from './mesher.js';
import { toGLB, toSTL, toOBJ, toZIP } from './export.js';
import { promptCreate, promptImprove, promptFix, extractCode, SAMPLE_ERRORS } from './ai.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) {
    try {
      return localStorage.getItem('gilaf:' + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gilaf:' + k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const S = {
  code: '',
  params: {},
  result: null,
  compiled: null,
  mesh: null,
  meshKey: null,
  preview: null,
  mesher: null,
  buildCtl: null,
  aiCtl: null,
  sample: null,
  downloads: null,
  inArtifact: typeof window.claude?.use === 'function',
};

// ---------- status helpers ----------
function status(text, kind = '') {
  const el = $('status');
  el.className = 'msg' + (kind ? ' ' + kind : '');
  el.textContent = text;
}

function friendlyError(e) {
  if (e instanceof RecipeError) return e.message;
  const m = String(e?.message || e);
  if (m.startsWith('Shader compile failed')) {
    const line = m.split('\n').find((l) => /ERROR/.test(l)) || m;
    return 'GPU compile error: ' + line.replace(/^.*?ERROR:\s*/, '');
  }
  return (e?.name && e.name !== 'Error' ? e.name + ': ' : '') + m;
}

// ---------- recipe run ----------
function run(code = S.code, { quiet = false } = {}) {
  S.code = code;
  const t0 = performance.now();
  try {
    const result = runRecipe(code, S.params);
    const compiled = compile(result);
    S.preview?.setCompiled(compiled);
    S.result = result;
    S.compiled = compiled;
    renderParams(result.params);
    syncLightSelect();
    const ms = Math.round(performance.now() - t0);
    const b = compiled.bounds;
    const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' × ');
    status(`${countNodes(result.node)} צמתים · ${size} יחידות · ${ms}ms`, 'good');
    $('codeInfo').textContent = `${code.split('\n').length} שורות`;
    if (S.meshKey !== compiled.glsl) setMeshStale();
    return true;
  } catch (e) {
    if (!quiet) status(friendlyError(e), 'bad');
    return false;
  }
}

function renderParams(list) {
  const box = $('params');
  if (!list.length) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  const sig = list.map((p) => `${p.name}:${p.min}:${p.max}`).join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.hidden = false;
  const h = document.createElement('h3');
  h.textContent = 'סליידרים';
  const rows = list.map((p) => {
    const row = document.createElement('div');
    row.className = 'param';
    const name = document.createElement('span');
    name.textContent = p.name;
    name.title = p.name;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = p.min;
    input.max = p.max;
    input.step = p.step;
    input.value = S.params[p.name] ?? p.def;
    input.id = 'param-' + p.name;
    input.setAttribute('aria-label', p.name);
    const out = document.createElement('output');
    const fmt = (v) => (+v).toFixed(Math.abs(p.max - p.min) >= 20 ? 0 : 2);
    out.textContent = fmt(input.value);
    let timer = 0;
    input.addEventListener('input', () => {
      S.params[p.name] = +input.value;
      out.textContent = fmt(input.value);
      clearTimeout(timer);
      timer = setTimeout(() => run(S.code), 90);
    });
    row.append(name, input, out);
    return row;
  });
  box.replaceChildren(h, ...rows);
}

// ---------- editor ----------
function setupEditor() {
  const ta = $('code');
  let timer = 0;
  ta.addEventListener('input', () => {
    S.code = ta.value;
    store.set('draft', ta.value);
    if ($('autoRun').checked) {
      clearTimeout(timer);
      timer = setTimeout(() => run(ta.value), 650);
    }
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run(ta.value);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  });
  $('runBtn').addEventListener('click', () => run(ta.value));
  $('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      status('הקוד הועתק', 'good');
    } catch {
      ta.focus();
      ta.select();
      status('סמנתי את הקוד. העתיקו עם Ctrl+C');
    }
  });

  const sel = $('gallery');
  for (const r of BUILTIN_RECIPES) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.name;
    sel.append(o);
  }
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = 'המתכון שלי';
  sel.append(custom);
  sel.addEventListener('change', () => {
    const r = BUILTIN_RECIPES.find((x) => x.id === sel.value);
    if (!r) return;
    loadCode(r.code, { resetView: true });
    store.set('recipe', r.id);
  });
}

function loadCode(code, { resetView = false } = {}) {
  S.params = {};
  $('params').dataset.sig = '';
  $('code').value = code;
  S.code = code;
  store.set('draft', code);
  if (resetView && S.preview) Object.assign(S.preview.view, { yaw: 32, pitch: 16, zoom: 1, panY: 0 });
  return run(code);
}

// ---------- viewport ----------
function setupViewport() {
  const canvas = $('view');
  try {
    S.preview = new Preview(canvas);
  } catch (e) {
    const d = document.createElement('div');
    d.className = 'fatal';
    d.textContent = 'הדפדפן הזה לא תומך ב־WebGL2, ולכן אי אפשר להציג את המודל. נסו Chrome, Edge, Firefox או Safari עדכני.';
    $('stage').append(d);
    return;
  }
  const pv = S.preview;
  pv.onFrame = (f, max) => {
    $('hudFrames').textContent = pv.mode === 'mesh' ? meshHud() : f < max ? `מחדד ${f}/${max}` : '';
  };
  new ResizeObserver(() => pv.resize()).observe(canvas);
  pv.resize();

  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      if (e.shiftKey) pv.view.panY += dy * 0.002;
      else {
        pv.view.yaw -= dx * 0.4;
        pv.view.pitch = Math.max(-20, Math.min(85, pv.view.pitch + dy * 0.3));
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) pv.view.zoom = Math.max(0.2, Math.min(4, pv.view.zoom * (pinch / d)));
      pinch = d;
    }
    pv.invalidate(true);
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      pv.view.zoom = Math.max(0.2, Math.min(4, pv.view.zoom * Math.exp(e.deltaY * 0.0012)));
      pv.invalidate(true);
    },
    { passive: false },
  );
  canvas.addEventListener('dblclick', () => {
    Object.assign(pv.view, { yaw: 32, pitch: 16, zoom: 1, panY: 0 });
    pv.invalidate();
  });

  const light = $('light');
  for (const [k, v] of Object.entries(LIGHTS)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = 'תאורה: ' + v.label;
    light.append(o);
  }
  light.addEventListener('change', () => {
    pv.light = light.value;
    pv.invalidate();
  });
  const toggle = (id, fn) => {
    const b = $(id);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      fn(on);
      pv.invalidate();
    });
  };
  toggle('clayBtn', (on) => (pv.clay = on));
  toggle('meshBtn', (on) => {
    pv.mode = on ? 'mesh' : 'sdf';
    $('wireBtn').hidden = !on;
  });
  toggle('wireBtn', (on) => (pv.wire = on));
  $('shotBtn').addEventListener('click', screenshot);
}

function syncLightSelect() {
  if (S.preview) $('light').value = S.preview.light;
}

function meshHud() {
  if (!S.mesh) return '';
  return `${S.mesh.indices.length / 3} משולשים`;
}

async function screenshot() {
  if (!S.compiled) return;
  const c = $('view');
  const scale = Math.min(2, 2400 / Math.max(c.clientWidth, c.clientHeight));
  const img = S.preview.renderStill(Math.round(c.clientWidth * scale), Math.round(c.clientHeight * scale), null, 16);
  const blob = await new Promise((r) => img.toBlob(r, 'image/png'));
  await saveFile(`${modelName()}.png`, blob);
}

// ---------- files ----------
function modelName() {
  const sel = $('gallery').value;
  return (S.compiled?.scene?.name || sel || 'gilaf-model').toString().replace(/[^\w֐-׿-]+/g, '-');
}

async function saveFile(name, data) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  if (S.inArtifact) {
    if (!S.downloads) {
      $('exportStatus').textContent = 'הורדת קבצים לא זמינה בתצוגה הזו.';
      return false;
    }
    try {
      await S.downloads.save({ filename: name, data: blob });
      return true;
    } catch (e) {
      if (e?.code !== 'declined') $('exportStatus').textContent = 'ההורדה נכשלה: ' + (e?.message || e?.code || e);
      return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

// ---------- export ----------
function setMeshStale() {
  if (!S.mesh) return;
  S.mesh = null;
  S.meshKey = null;
  S.preview?.setMesh(null);
  const mb = $('meshBtn');
  mb.disabled = true;
  mb.setAttribute('aria-pressed', 'false');
  $('wireBtn').hidden = true;
  if (S.preview) S.preview.mode = 'sdf';
  $('saveBtn').disabled = true;
  $('exportStatus').textContent = 'המתכון השתנה. בנו את הרשת מחדש כדי לייצא.';
}

async function buildMesh(opts = {}) {
  if (!S.compiled) throw new Error('No recipe is loaded');
  if (!S.mesher) S.mesher = new Mesher();
  const res = opts.res ?? +$('res').value;
  const tris = opts.tris ?? +$('tris').value;
  const compiled = S.compiled;
  S.buildCtl = new AbortController();
  const onProgress = (p, label) => {
    $('prog').style.width = `${Math.round(p * 100)}%`;
    $('exportStatus').textContent = `${label}… ${Math.round(p * 100)}%`;
  };
  let mesh = await S.mesher.build(compiled, { res, onProgress, signal: S.buildCtl.signal });
  const raw = mesh.indices.length / 3;
  if (tris && raw > tris) {
    $('exportStatus').textContent = 'מצמצם משולשים…';
    await new Promise((r) => setTimeout(r, 0));
    try {
      mesh = await simplifyMesh(mesh, tris);
    } catch (e) {
      $('exportStatus').textContent = 'הצמצום לא זמין כאן, הרשת נשמרה בגודל מלא. ' + e.message;
    }
  }
  S.mesh = mesh;
  S.meshKey = compiled.glsl;
  return { mesh, raw };
}

function setupExport() {
  $('buildBtn').addEventListener('click', async () => {
    const btn = $('buildBtn');
    btn.disabled = true;
    $('cancelBtn').hidden = false;
    $('saveBtn').disabled = true;
    try {
      const { mesh, raw } = await buildMesh();
      const st = meshStats(mesh);
      $('stats').hidden = false;
      $('stTris').textContent = st.triangles.toLocaleString('en-US');
      $('stVerts').textContent = st.vertices.toLocaleString('en-US');
      $('stTime').textContent = (mesh.ms / 1000).toFixed(1) + 's';
      const reduced = raw !== st.triangles ? ` (צומצם מ־${raw.toLocaleString('en-US')})` : '';
      $('exportStatus').textContent = `הרשת מוכנה: רשת דגימה ${mesh.grid.join('×')}${reduced}. אפשר להוריד או לבדוק אותה בכפתור "רשת".`;
      S.preview?.setMesh(mesh);
      $('meshBtn').disabled = false;
      $('saveBtn').disabled = false;
    } catch (e) {
      $('exportStatus').textContent = e?.name === 'AbortError' ? 'הבנייה בוטלה.' : 'הבנייה נכשלה: ' + friendlyError(e);
      $('prog').style.width = '0';
    } finally {
      btn.disabled = false;
      $('cancelBtn').hidden = true;
    }
  });
  $('cancelBtn').addEventListener('click', () => S.buildCtl?.abort());
  $('saveBtn').addEventListener('click', async () => {
    if (!S.mesh) return;
    const files = exportFiles({ glb: $('fGlb').checked, stl: $('fStl').checked, obj: $('fObj').checked, mm: +$('mm').value || 80 });
    if (!files.length) {
      $('exportStatus').textContent = 'בחרו לפחות פורמט אחד.';
      return;
    }
    const name = modelName();
    let ok;
    if (S.inArtifact || files.length > 1) {
      files.push({ name: 'recipe.js', data: S.code });
      ok = await saveFile(`${name}.zip`, toZIP(files));
    } else ok = await saveFile(files[0].name, files[0].data);
    if (ok) $('exportStatus').textContent = 'הקבצים נשמרו.';
  });
}

function exportFiles({ glb, stl, obj, mm = 80 }) {
  const name = modelName();
  const out = [];
  if (glb) out.push({ name: `${name}.glb`, data: toGLB(S.mesh, { name, palette: S.compiled.materials }) });
  if (stl) out.push({ name: `${name}.stl`, data: toSTL(S.mesh, { sizeMM: mm }) });
  if (obj) out.push({ name: `${name}.obj`, data: toOBJ(S.mesh, { name }) });
  return out;
}

// ---------- Claude ----------
function renderSheet({ size = 1200, clay = false, light, views, frames = 5 } = {}) {
  const pv = S.preview;
  const V = views || [
    { yaw: 35, pitch: 16, label: '3/4 front' },
    { yaw: 0, pitch: 6, label: 'front' },
    { yaw: 90, pitch: 6, label: 'side' },
    { yaw: 205, pitch: 18, label: 'back' },
  ];
  const cols = V.length > 2 ? 2 : V.length;
  const rows = Math.ceil(V.length / cols);
  const tw = Math.round(size / cols);
  const th = Math.round(tw * 0.8);
  const sheet = document.createElement('canvas');
  sheet.width = tw * cols;
  sheet.height = th * rows;
  const ctx = sheet.getContext('2d');
  const saved = { clay: pv.clay, light: pv.light, mode: pv.mode };
  pv.clay = clay;
  if (light) pv.light = light;
  V.forEach((v, i) => {
    const img = pv.renderStill(tw, th, { yaw: v.yaw, pitch: v.pitch, zoom: v.zoom ?? 1, panY: 0 }, frames);
    const x = (i % cols) * tw;
    const y = Math.floor(i / cols) * th;
    ctx.drawImage(img, x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x + 8, y + 8, ctx.measureText(v.label).width + 18, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(v.label, x + 16, y + 24);
  });
  Object.assign(pv, saved);
  pv.invalidate();
  return sheet;
}

async function setupAI() {
  if (!S.inArtifact) return;
  let sample = null;
  let downloads = null;
  try {
    [sample, downloads] = await Promise.all([window.claude.use('sample'), window.claude.use('downloads')]);
  } catch {
    /* capabilities unavailable */
  }
  S.downloads = downloads;
  if (!sample) return;
  S.sample = sample;
  $('aiReady').hidden = false;
  $('aiMissing').hidden = true;
  const caps = await sample.limits().catch(() => null);
  if (!caps?.images) {
    $('aiSeeWrap').hidden = true;
    $('aiSee').checked = false;
  }

  const setBusy = (on) => {
    $('aiCreate').disabled = on;
    $('aiImprove').disabled = on;
    $('aiStop').hidden = !on;
  };
  const ask = async (prompt, { images, label }) => {
    S.aiCtl = new AbortController();
    setBusy(true);
    const out = $('aiOut');
    out.hidden = false;
    out.textContent = '';
    $('aiStatus').className = 'msg';
    $('aiStatus').textContent = `${label}: Claude חושב… (זה יכול לקחת עד דקה)`;
    try {
      const { text, truncated } = await sample(prompt, {
        signal: S.aiCtl.signal,
        modelTier: $('aiTier').value,
        cache: false,
        ...(images ? { images } : {}),
        onText: ({ text: t }) => {
          $('aiStatus').textContent = `${label}: Claude כותב את המתכון…`;
          out.textContent = extractCode(t);
          out.scrollTop = out.scrollHeight;
        },
      });
      const code = extractCode(text);
      $('gallery').value = '';
      const ok = loadCode(code, { resetView: label === 'יצירה' });
      store.set('recipe', '');
      if (ok) {
        $('aiStatus').className = 'msg good';
        $('aiStatus').textContent = truncated ? 'התשובה נקטעה באמצע, אבל המתכון רץ. אפשר לבקש שיפור.' : 'המודל מוכן. אפשר לבקש שיפורים או לייצא.';
      } else {
        $('aiStatus').className = 'msg';
        $('aiStatus').textContent = 'במתכון יש שגיאה. לחצו "שפר" ו־Claude יתקן אותה.';
        S.pendingFix = true;
      }
    } catch (e) {
      $('aiStatus').className = 'msg warn';
      $('aiStatus').textContent = e?.code === 'cancelled' ? 'נעצר.' : SAMPLE_ERRORS[e?.code] || 'משהו השתבש: ' + (e?.message || e);
      if (e?.code === 'not_granted' || e?.code === 'sampling_disabled') {
        $('aiCreate').hidden = true;
        $('aiImprove').hidden = true;
      }
    } finally {
      setBusy(false);
    }
  };

  $('aiCreate').addEventListener('click', () => {
    const d = $('aiPrompt').value.trim();
    if (!d) {
      $('aiStatus').textContent = 'כתבו קודם מה לפסל.';
      return;
    }
    S.pendingFix = false;
    ask(promptCreate(d), { label: 'יצירה' });
  });
  $('aiImprove').addEventListener('click', async () => {
    const instr = $('aiPrompt').value.trim();
    const code = $('code').value;
    let working = true;
    try {
      runRecipe(code, S.params);
    } catch (e) {
      working = false;
      S.pendingFix = false;
      return ask(promptFix(code, friendlyError(e)), { label: 'תיקון' });
    }
    let images;
    if (working && $('aiSee').checked && S.compiled) {
      const sheet = renderSheet({ size: 1000 });
      images = await new Promise((r) => sheet.toBlob(r, 'image/png'));
    }
    ask(promptImprove(code, instr, !!images), { images, label: 'שיפור' });
  });
  $('aiStop').addEventListener('click', () => S.aiCtl?.abort());
}

// ---------- tabs ----------
function setupTabs() {
  const tabs = ['recipe', 'ai', 'export', 'guide'];
  const show = (name) => {
    for (const t of tabs) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('pane-' + t).hidden = t !== name;
    }
    store.set('tab', name);
  };
  for (const t of tabs) $('tab-' + t).addEventListener('click', () => show(t));
  const saved = store.get('tab');
  if (saved && tabs.includes(saved)) show(saved);
}

// ---------- headless API (used by tools/gilaf.mjs) ----------
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.gilaf = {
  load(code, params = {}) {
    S.params = { ...params };
    $('code').value = code;
    S.code = code;
    const result = runRecipe(code, S.params);
    const compiled = compile(result);
    S.preview.setCompiled(compiled);
    S.result = result;
    S.compiled = compiled;
    return { params: result.params, bounds: compiled.bounds, step: compiled.step, nodes: countNodes(result.node), lines: compiled.lines };
  },
  sheet(opts = {}) {
    return renderSheet(opts).toDataURL('image/png');
  },
  still({ width = 1200, height = 900, yaw = 32, pitch = 16, zoom = 1, clay = false, light, frames = 12 } = {}) {
    const pv = S.preview;
    const saved = { clay: pv.clay, light: pv.light };
    pv.clay = clay;
    if (light) pv.light = light;
    const img = pv.renderStill(width, height, { yaw, pitch, zoom, panY: 0 }, frames);
    Object.assign(pv, saved);
    return img.toDataURL('image/png');
  },
  async export({ res = 256, tris = 0, formats = ['glb'], mm = 80 } = {}) {
    const { mesh, raw } = await buildMesh({ res, tris });
    const files = exportFiles({ glb: formats.includes('glb'), stl: formats.includes('stl'), obj: formats.includes('obj'), mm });
    return { stats: { ...meshStats(mesh), raw, grid: mesh.grid, ms: mesh.ms }, files: files.map((f) => ({ name: f.name, b64: b64(f.data) })) };
  },
  meshView({ width = 1000, height = 800, yaw = 32, pitch = 16, wire = true } = {}) {
    const pv = S.preview;
    pv.setMesh(S.mesh);
    pv.mode = 'mesh';
    pv.wire = wire;
    const img = pv.renderStill(width, height, { yaw, pitch, zoom: 1, panY: 0 }, 1);
    pv.mode = 'sdf';
    pv.wire = false;
    return img.toDataURL('image/png');
  },
};

// ---------- boot ----------
function boot() {
  setupTabs();
  setupViewport();
  setupEditor();
  setupExport();
  const saved = store.get('recipe');
  const draft = store.get('draft');
  const first = BUILTIN_RECIPES.find((r) => r.id === saved) || BUILTIN_RECIPES[0];
  if (saved === '' && draft) {
    $('gallery').value = '';
    loadCode(draft);
  } else if (first) {
    $('gallery').value = first.id;
    loadCode(saved === first.id && draft ? draft : first.code);
  }
  setupAI();
  window.gilaf.ready = true;
}

boot();
