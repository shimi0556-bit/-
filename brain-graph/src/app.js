// UI wiring: panels, settings, ingest, the AI command that walks the graph (and colours what it touches), actions, demo data.
(function (BG) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  BG.h = h;
  const regionName = (id) => (BG.regionById(id) || {}).name || id;
  const kindName = (id) => (BG.kindById(id) || {}).name || id;

  BG.toast = function (msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || ''), text: msg });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 9000 : 4200);
  };

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + name));
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- stats ----------
  function renderStats() {
    const S = BG.state;
    $('#stats').textContent = S.nodes.length + ' צמתים · ' + S.edges.length + ' קשרים';
    $('#hint').textContent = S.nodes.length ? 'גרור צומת לאזור אחר כדי לשייך מחדש · גלגלת = זום' : '';
  }

  // ---------- ingest panel ----------
  const logBox = h('div', { class: 'log' });
  function log(msg, kind) { const d = h('div', { class: kind || '', text: msg }); logBox.prepend(d); return d; }
  let abortCtl = null;

  async function runIngest(sources) {
    const useAI = $('#useAI') ? $('#useAI').checked : BG.ai.ready();
    if (useAI && !BG.ai.ready()) { BG.toast('אין מפתח API – עובר לחילוץ מקומי. אפשר להוסיף מפתח בהגדרות.', 'err'); }
    for (const src of sources) {
      const line = log('מעבד: ' + (src.title || src.url || 'טקסט') + '…');
      try {
        if (!src.text) { line.textContent = 'מביא: ' + src.url + '…'; const p = await BG.fetchPage(src.url); src.title = p.title; src.text = p.text; }
        abortCtl = new AbortController();
        const res = await BG.ingest(src, { useAI: useAI && BG.ai.ready(), signal: abortCtl.signal, progress: (m) => { line.textContent = (src.title || '') + ' – ' + m; } });
        const st = res.stats;
        line.textContent = '✓ ' + (src.title || 'מקור') + ': ' + st.added + ' חדשים, ' + st.merged + ' אוחדו, ' + st.links + ' קשרים' + (st.ai ? '' : ' (חילוץ מקומי)');
        line.className = 'ok';
        await lightUp(res.touched, 'new');
      } catch (e) {
        if (e.name === 'AbortError') { line.textContent = 'בוטל'; continue; }
        line.textContent = '✗ ' + (src.title || src.url || '') + ': ' + e.message;
        line.className = 'err';
      }
    }
  }

  // Animate a set of nodes lighting up, one after the other, ending with a soft hold.
  async function lightUp(ids, mode) {
    BG.clearActivation();
    const list = ids.slice(0, 60);
    for (const id of list) { BG.pulse(id, null, 0.5); await BG.sleep(Math.max(25, 700 / list.length)); }
    await BG.sleep(1400);
    if (mode === 'new') BG.clearActivation();
  }

  function renderAddPanel() {
    const p = $('#tab-add');
    p.textContent = '';
    const title = h('input', { placeholder: 'כותרת (לא חובה)', id: 'srcTitle' });
    const text = h('textarea', { placeholder: 'הדבק כאן טקסט, מאמר, סיכום פגישה, יומן…', id: 'srcText', rows: '5' });
    const urls = h('textarea', { placeholder: 'https://… (אפשר כמה, שורה לכל קישור)', id: 'srcUrls', rows: '3', dir: 'ltr' });
    const files = h('input', { type: 'file', multiple: true, hidden: true, accept: '.txt,.md,.markdown,.html,.htm,.json,.csv,.pdf,.docx,.srt,.vtt' });
    files.addEventListener('change', () => { handleFiles([...files.files]); files.value = ''; });
    const useAI = h('input', { type: 'checkbox', id: 'useAI', style: 'width:auto' });
    useAI.checked = BG.ai.ready();
    p.append(
      h('h3', { text: 'הוספת ידע למוח' }),
      h('p', { class: 'muted', text: 'ה-AI קורא את המקור, מחלץ רעיונות, בוחר לכל אחד את אזור המוח שמתאים לתפקוד שלו ומקשר אותו למה שכבר קיים.' }),
      h('label', { class: 'f', text: 'טקסט' }), title, h('div', { style: 'height:6px' }), text,
      h('div', { class: 'row', style: 'margin-top:8px' }, h('label', { class: 'muted' }, useAI, ' להשתמש ב-AI'), h('button', { class: 'primary', onclick: () => {
        const t = text.value.trim(); if (!t) return BG.toast('הדבק טקסט קודם');
        runIngest([{ title: title.value.trim() || t.slice(0, 40), text: t }]); text.value = ''; title.value = '';
      }, text: 'הוסף לגרף' })),
      h('div', { class: 'hr' }),
      h('label', { class: 'f', text: 'קישורים לאתרים' }), urls,
      h('div', { style: 'margin-top:8px;text-align:end' }, h('button', { class: 'primary', onclick: () => {
        const list = urls.value.split(/\s+/).filter((u) => /^https?:\/\//i.test(u)); if (!list.length) return BG.toast('הדבק קישור שמתחיל ב-https://');
        runIngest(list.map((u) => ({ url: u, title: u }))); urls.value = '';
      }, text: 'הבא ושלב' })),
      h('div', { class: 'hr' }),
      h('div', { class: 'drophint', tabindex: '0', role: 'button', onclick: () => files.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') files.click(); } }, 'גרור לכאן מסמכים או לחץ לבחירה', h('br'), h('span', { class: 'muted', text: 'txt · md · html · pdf · docx · json · csv' })),
      files, logBox
    );
  }
  async function handleFiles(list) {
    if (!list.length) return;
    showTab('add');
    const srcs = [];
    for (const f of list) {
      const line = log('קורא קובץ: ' + f.name + '…');
      try { const r = await BG.readFile(f); srcs.push({ title: r.title, text: r.text }); line.remove(); }
      catch (e) { line.textContent = '✗ ' + f.name + ': ' + e.message; line.className = 'err'; }
    }
    if (srcs.length) await runIngest(srcs);
  }
  // global drag & drop
  const stageWrap = $('#stageWrap');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]);
    else { const u = (e.dataTransfer && e.dataTransfer.getData('text/uri-list')) || ''; if (/^https?:\/\//i.test(u)) runIngest([{ url: u.trim(), title: u.trim() }]); }
  });

  // ---------- node panel ----------
  function renderNodePanel() {
    const p = $('#tab-node');
    p.textContent = '';
    const n = BG.nodeById(BG.view.selected);
    if (!n) { p.append(h('p', { class: 'muted', text: 'בחר צומת בגרף כדי לראות ולערוך אותו, או הוסף צומת ידנית:' }), h('button', { onclick: addManual, text: '＋ צומת חדש' })); return; }
    const r = BG.regionById(n.region), src = BG.kindById(n.kind).source;
    const label = h('input', { value: n.label });
    label.addEventListener('change', () => { const v = label.value.trim(); if (v) { BG.snapshot(); n.label = v; BG.touch(); } });
    const kind = h('select', null, BG.KINDS.map((k) => h('option', { value: k.id, selected: k.id === n.kind }, k.name)));
    kind.addEventListener('change', () => { BG.snapshot(); n.kind = kind.value; BG.touch(); });
    const region = h('select', null, BG.REGIONS.map((x) => h('option', { value: x.id, selected: x.id === n.region }, x.name)));
    region.addEventListener('change', () => { BG.snapshot(); n.region = region.value; BG.touch(); BG.layout.kick(0.8); });
    const sum = h('textarea', { rows: '3' }); sum.value = n.summary || '';
    sum.addEventListener('change', () => { n.summary = sum.value; BG.touch(); });
    const notes = h('textarea', { rows: '3', placeholder: 'הערות אישיות…' }); notes.value = n.notes || '';
    notes.addEventListener('change', () => { n.notes = notes.value; BG.touch(); });
    const edges = BG.edgesOf(n.id).sort((a, b) => (b.w || 0) - (a.w || 0));
    const list = h('ul', { class: 'links' }, edges.map((e) => {
      const o = BG.nodeById(BG.otherEnd(e, n.id));
      if (!o) return null;
      return h('li', null, h('i', { class: 'chip', style: 'padding:0;border:0;background:' + BG.regionById(o.region).color + ';width:9px;height:9px;border-radius:50%;flex:none' }),
        h('a', { onclick: () => BG.select(o.id), text: o.label }), h('span', { class: 'rel', text: e.rel }),
        h('button', { class: 'small', title: 'מחק קשר', onclick: () => { BG.snapshot(); BG.removeEdge(e.id); renderNodePanel(); }, text: '✕' }));
    }));
    const dl = h('datalist', { id: 'labels' }, BG.state.nodes.map((x) => h('option', { value: x.label })));
    const toIn = h('input', { list: 'labels', placeholder: 'מקושר אל… (שם צומת)' });
    const relIn = h('input', { placeholder: 'סוג הקשר (למשל: מחזק)' });
    p.append(...[
      h('h3', null, h('span', { class: 'chip' }, h('i', { style: 'background:' + r.color }), r.name), h('span', { class: 'chip', text: kindName(n.kind) })),
      h('label', { class: 'f', text: 'שם' }), label,
      h('div', { class: 'grid2' }, h('div', null, h('label', { class: 'f', text: 'סוג' }), kind), h('div', null, h('label', { class: 'f', text: 'אזור במוח' }), region)),
      h('label', { class: 'f', text: 'תיאור' }), sum,
      h('label', { class: 'f', text: 'הערות שלי' }), notes,
      src && n.url ? h('p', null, h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--accent)', dir: 'ltr', text: n.url })) : null,
      src && n.excerpt ? h('details', null, h('summary', { class: 'muted', text: 'תחילת המקור' }), h('p', { class: 'muted', style: 'white-space:pre-wrap', text: n.excerpt.slice(0, 700) })) : null,
      h('div', { class: 'hr' }), h('h3', { text: 'קשרים (' + edges.length + ')' }), list,
      h('div', { class: 'row', style: 'margin-top:8px' }, toIn, relIn), dl,
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { onclick: () => { const t = BG.findByLabel(toIn.value) || BG.findSource(toIn.value); if (!t) return BG.toast('לא נמצא צומת בשם הזה'); BG.snapshot(); BG.addEdge(n.id, t.id, relIn.value.trim() || 'קשור ל', 1); renderNodePanel(); }, text: 'חבר' }),
        h('button', { onclick: () => traverseFrom([n.id], 'מסלול מהצומת "' + n.label + '"'), text: '▶ הפעל מסלול מכאן' })),
      h('div', { class: 'hr' }),
      h('button', { class: 'danger', onclick: () => { if (confirm('למחוק את "' + n.label + '"?')) { BG.snapshot(); BG.removeNode(n.id); BG.select(null); } }, text: 'מחק צומת' })
    ].filter(Boolean));
  }
  function addManual() {
    const label = prompt('שם הצומת:');
    if (!label || !label.trim()) return;
    BG.snapshot();
    const n = BG.addNode({ label: label.trim(), kind: 'concept' });
    BG.select(n.id);
  }
  BG.on('select', (id) => { renderNodePanel(); if (id) showTab('node'); });

  // ---------- regions panel ----------
  function renderRegionsPanel() {
    const p = $('#tab-regions');
    p.textContent = '';
    const tg = (label, on, fn) => { const cb = h('input', { type: 'checkbox', style: 'width:auto' }); cb.checked = on; cb.addEventListener('change', () => fn(cb.checked)); return h('label', { class: 'muted', style: 'display:block;margin:4px 0' }, cb, ' ' + label); };
    p.append(
      h('p', { class: 'muted', text: 'צורת המוח נוצרת מהצמתים עצמם: כל ערך נמצא באזור שמתאים לו. לחץ על אזור כדי להתמקד בו.' }),
      tg('שמות אזורים על המוח', BG.view.labels, BG.setLabels),
      tg('מתאר מוח מקווקו (אוטומטי כשיש מעט צמתים)', BG.effOutline(), BG.setOutline), h('div', { style: 'height:8px' }));
    for (const r of BG.REGIONS) {
      const n = BG.state.nodes.filter((x) => x.region === r.id).length;
      p.append(h('div', { class: 'region-row' + (BG.view.focusRegion === r.id ? ' on' : ''), tabindex: '0', onclick: () => { BG.view.focusRegion = BG.view.focusRegion === r.id ? null : r.id; renderRegionsPanel(); BG.markDirty(); },
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
      h('i', { style: 'background:' + r.color }), h('div', null, h('b', { text: r.name }), h('span', { class: 'muted', text: r.does })), h('span', { class: 'n', text: n })));
    }
  }

  // ---------- search ----------
  $('#search').addEventListener('input', (e) => {
    const q = BG.norm(e.target.value);
    if (!q) return BG.setFilter(null);
    BG.setFilter(new Set(BG.state.nodes.filter((n) => BG.norm(n.label + ' ' + n.summary + ' ' + n.notes).includes(q)).map((n) => n.id)));
  });
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && BG.view.filter && BG.view.filter.size) { const ids = [...BG.view.filter]; BG.fitTo(ids); BG.select(ids[0]); }
    if (e.key === 'Escape') { e.target.value = ''; BG.setFilter(null); }
  });

  // ---------- top buttons ----------
  $('#btnAdd').addEventListener('click', () => { showTab('add'); $('#srcText').focus(); });
  $('#btnFit').addEventListener('click', () => BG.resetView());
  $('#btnUndo').addEventListener('click', () => { if (BG.undo()) BG.toast('הפעולה האחרונה בוטלה', 'ok'); });
  BG.on('undo-state', (n) => { $('#btnUndo').disabled = n === 0; });
  $('#btnOrganize').addEventListener('click', organizeAll);
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnExport').addEventListener('click', openExport);

  // ---------- dialogs ----------
  const dlg = $('#dlg');
  function openDialog(content) { dlg.textContent = ''; dlg.append(...content); if (!dlg.open) dlg.showModal(); }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  function openSettings() {
    const s = BG.ai.settings;
    const prov = h('select', null, Object.entries(BG.PRESETS).map(([k, v]) => h('option', { value: k, selected: k === s.provider }, v.name)));
    const key = h('input', { type: 'password', value: s.key, placeholder: 'sk-… / מפתח API', dir: 'ltr', autocomplete: 'off' });
    const model = h('input', { value: s.model, dir: 'ltr' });
    const base = h('input', { value: s.base, dir: 'ltr' });
    const reader = h('input', { type: 'checkbox', style: 'width:auto' }); reader.checked = !!s.reader;
    prov.addEventListener('change', () => { const pr = BG.PRESETS[prov.value]; model.value = pr.model; base.value = pr.base; });
    const result = h('p', { class: 'muted' });
    const collect = () => { Object.assign(s, { provider: prov.value, key: key.value.trim(), model: model.value.trim(), base: base.value.trim(), reader: reader.checked }); BG.ai.saveSettings(); };
    openDialog([
      h('h3', { text: 'חיבור ל-AI' }),
      h('p', { class: 'muted', text: 'המפתח נשמר רק בדפדפן הזה ולא נכלל בגיבוי או בייצוא. הקריאות יוצאות ישירות מהדפדפן אל ספק ה-AI שבחרת.' }),
      h('label', { class: 'f', text: 'ספק' }), prov,
      h('label', { class: 'f', text: 'מפתח API' }), key,
      h('label', { class: 'f', text: 'מודל' }), model,
      h('label', { class: 'f', text: 'כתובת שרת' }), base,
      h('label', { class: 'f' }, reader, ' אפשר קורא חיצוני (r.jina.ai) כשאתר חוסם קריאה ישירה – כתובת האתר נשלחת אליו'),
      result,
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { onclick: async () => { collect(); result.textContent = 'בודק…'; try { result.textContent = '✓ מחובר – התשובה: ' + await BG.ai.ping(); } catch (e) { result.textContent = '✗ ' + e.message; } }, text: 'בדוק חיבור' }),
        h('button', { class: 'primary', onclick: () => { collect(); dlg.close(); renderAddPanel(); BG.toast('ההגדרות נשמרו', 'ok'); }, text: 'שמור' }))
    ]);
  }

  function openExport() {
    const transparent = h('input', { type: 'checkbox', style: 'width:auto' });
    const go = (fmt) => async () => {
      try { BG.toast('מכין ' + fmt.toUpperCase() + '…'); const name = await BG.runExport(fmt, { transparent: transparent.checked }); BG.toast('הורד: ' + name, 'ok'); }
      catch (e) { BG.toast('הייצוא נכשל: ' + e.message, 'err'); }
    };
    const mfile = h('input', { type: 'file', accept: '.json', hidden: true });
    mfile.addEventListener('change', async () => { try { importMapat(JSON.parse(await mfile.files[0].text())); } catch (e) { BG.toast('קובץ לא תקין: ' + e.message, 'err'); } });
    const importMapat = (d) => { const s = BG.mapat.import(d); dlg.close(); BG.toast('מפת הנפש נקלטה: ' + s.added + ' חדשים, ' + s.merged + ' אוחדו, ' + s.links + ' קשרים, ' + s.stories + ' סיפורים', 'ok'); };
    const file = h('input', { type: 'file', accept: '.json', hidden: true });
    file.addEventListener('change', async () => {
      try { const d = JSON.parse(await file.files[0].text()); if (BG.mapat.isBackup(d)) return importMapat(d); if (!confirm('לטעון את הגיבוי? הגרף הנוכחי יוחלף (אפשר לבטל).')) return; BG.snapshot(); BG.load(d); BG.layout.kick(0.5); dlg.close(); BG.toast('הגיבוי נטען', 'ok'); }
      catch (e) { BG.toast('קובץ לא תקין: ' + e.message, 'err'); }
    });
    openDialog([
      h('h3', { text: 'ייצוא, ייבוא וחיבורים' }),
      h('div', { class: 'grid2' },
        h('button', { class: 'exp', onclick: go('psd') }, h('b', { text: 'Photoshop (PSD)' }), h('span', { text: 'שכבה נפרדת לכל אזור, קשרים ורקע' })),
        h('button', { class: 'exp', onclick: go('svg') }, h('b', { text: 'SVG בשכבות' }), h('span', { text: 'Canva · Illustrator · Figma · Inkscape' })),
        h('button', { class: 'exp', onclick: go('png') }, h('b', { text: 'PNG' }), h('span', { text: 'תמונה ברזולוציה כפולה' })),
        h('button', { class: 'exp', onclick: go('json') }, h('b', { text: 'גיבוי JSON' }), h('span', { text: 'כל הגרף, לשחזור' }))),
      h('label', { class: 'f' }, transparent, ' רקע שקוף (SVG/PNG)'),
      h('div', { class: 'hr' }),
      h('button', { onclick: () => file.click(), text: 'ייבוא גיבוי JSON…' }), file,
      h('div', { class: 'hr' }), h('h3', { text: 'מפת הנפש' }),
      h('p', { class: 'muted', text: 'מיבוא: בחר את קובץ הגיבוי שמורידים מ"מפת הנפש" (הגדרות, גיבוי ודוגמאות). הערכים, הרגשות והקשרים נכנסים לאזורים שלהם, והסיפורים נכנסים להיפוקמפוס. שמות שכבר קיימים מתאחדים. אפשר גם לבחור אותו בכפתור הייבוא שלמעלה.' }),
      h('div', { class: 'row' },
        h('button', { onclick: () => mfile.click(), text: 'ייבוא ממפת הנפש…' }),
        h('button', { onclick: () => { try { BG.download(new Blob([JSON.stringify(BG.mapat.export(), null, 2)], { type: 'application/json' }), 'mapat-hanefesh-from-atlas.json'); BG.toast('הורד. אפשר לשחזר אותו במפת הנפש', 'ok'); } catch (e) { BG.toast(e.message, 'err'); } }, text: 'ייצוא למפת הנפש' })),
      h('div', { style: 'margin-top:8px' }, h('button', { onclick: () => { const s = BG.mapat.addMyValues(); dlg.close(); BG.toast('הערכים שלי: ' + s.added + ' נוספו, ' + s.merged + ' כבר היו', 'ok'); }, text: 'הוסף את 11 הערכים שלי' })), mfile,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'danger', onclick: () => { if (confirm('לנקות את כל הגרף?')) { BG.snapshot(); BG.clearAll(); dlg.close(); } }, text: 'נקה הכל' }), h('button', { onclick: () => dlg.close(), text: 'סגור' }))
    ]);
  }

  // ---------- AI command: walk the memory, colour what is touched, then do the job ----------
  const answerBox = $('#answer');
  let busy = false;
  function setBusy(b) { busy = b; $('#cmdGo').disabled = b; $('#cmdStop').hidden = !b; $('#cmdInput').disabled = b; }
  $('#cmdStop').addEventListener('click', () => { if (abortCtl) abortCtl.abort(); });

  function indexFor(request) {
    const q = BG.norm(request).split(' ').filter((w) => w.length > 1);
    let nodes = BG.state.nodes.slice();
    if (nodes.length > 320) {
      const score = (n) => { const t = BG.norm(n.label + ' ' + n.summary); return q.reduce((s, w) => s + (t.includes(BG.key(w)) ? 3 : 0), 0) + (n.deg || 0) * 0.2; };
      nodes = nodes.sort((a, b) => score(b) - score(a)).slice(0, 320);
    }
    return nodes.map((n) => [n.id, n.label, n.region, n.kind, (n.summary || '').slice(0, 70)].join('|')).join('\n');
  }
  function localSeeds(request) {
    const q = BG.norm(request).split(' ').filter((w) => w.length > 1).map(BG.key);
    return BG.state.nodes.map((n) => { const t = BG.norm(n.label + ' ' + n.summary); return { id: n.id, s: q.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0) }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.id);
  }
  function traversal(seeds, maxNodes, maxDepth) {
    const order = [], seen = new Set(), q = [];
    seeds.forEach((s) => { if (BG.nodeById(s) && !seen.has(s)) { seen.add(s); q.push({ id: s, via: null, d: 0 }); } });
    while (q.length && order.length < maxNodes) {
      const cur = q.shift();
      order.push(cur);
      if (cur.d >= maxDepth) continue;
      const nb = BG.edgesOf(cur.id).sort((a, b) => (b.w || 0) - (a.w || 0)).slice(0, 4);
      for (const e of nb) { const o = BG.otherEnd(e, cur.id); if (!seen.has(o)) { seen.add(o); q.push({ id: o, via: e.id, d: cur.d + 1 }); } }
    }
    return order;
  }
  async function walk(order) {
    BG.clearActivation();
    const ids = order.map((o) => o.id);
    BG.fitTo(ids.length > 1 ? ids : null);
    for (const step of order) { BG.pulse(step.id, step.via, 0.55); await BG.sleep(Math.max(80, Math.min(380, 3200 / order.length))); }
  }
  async function traverseFrom(seeds, title) {
    const order = traversal(seeds, 26, 2);
    await walk(order);
    showAnswer({ title, text: 'עברתי על ' + order.length + ' צמתים מסביב לנקודת ההתחלה. האזורים שהופעלו צבועים בגרף.', visited: order.map((o) => o.id), actions: [] });
  }

  function regionChips(ids) {
    const counts = new Map();
    ids.forEach((id) => { const n = BG.nodeById(id); if (n) counts.set(n.region, (counts.get(n.region) || 0) + 1); });
    return h('div', null, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([rid, c]) => h('span', { class: 'chip' }, h('i', { style: 'background:' + BG.regionById(rid).color }), regionName(rid) + ' · ' + c)));
  }
  function describeAction(a) {
    switch (a.op) {
      case 'add_node': return 'הוסף "' + a.label + '" (' + kindName(a.kind) + ') באזור ' + regionName(a.region || (BG.kindById(a.kind) || {}).home);
      case 'link': return 'חבר "' + labelOf(a.from) + '" ← ' + (a.rel || 'קשור ל') + ' → "' + labelOf(a.to) + '"';
      case 'move': return 'העבר "' + labelOf(a.node) + '" אל ' + regionName(a.region) + (a.kind ? ' (' + kindName(a.kind) + ')' : '');
      case 'update': return 'עדכן תיאור של "' + labelOf(a.node) + '"';
      case 'delete': return 'מחק את "' + labelOf(a.node) + '"';
      case 'export': return 'ייצוא ' + String(a.format).toUpperCase();
      default: return null;
    }
  }
  const labelOf = (ref) => { const n = BG.getNode(ref); return n ? n.label : String(ref); };

  function cleanActions(list) {
    const ok = [];
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || typeof a !== 'object') continue;
      if (a.op === 'add_node' && a.label) ok.push(a);
      else if (a.op === 'link' && BG.getNode(a.from) && BG.getNode(a.to)) ok.push(a);
      else if (a.op === 'move' && BG.getNode(a.node) && BG.regionById(a.region)) ok.push(a);
      else if (a.op === 'update' && BG.getNode(a.node) && typeof a.summary === 'string') ok.push(a);
      else if (a.op === 'delete' && BG.getNode(a.node)) ok.push(a);
      else if (a.op === 'export' && BG.exporters[a.format]) ok.push(a);
    }
    return ok.slice(0, 60);
  }

  function showAnswer({ title, text, visited, used, actions }) {
    answerBox.textContent = '';
    answerBox.hidden = false;
    const acts = cleanActions(actions);
    const hl = (used && used.length ? used : visited) || [];
    answerBox.append(
      h('button', { class: 'x', title: 'סגור וניקוי סימון', onclick: () => { answerBox.hidden = true; BG.clearActivation(); }, text: '✕' }),
      h('h4', { text: title || 'תשובה' }),
      h('p', { text }),
      h('div', { class: 'muted', text: 'אזורי זיכרון שנעשה בהם שימוש:' }), regionChips(hl)
    );
    if (acts.length) {
      const boxes = acts.map((a) => { const cb = h('input', { type: 'checkbox' }); cb.checked = a.op !== 'delete'; return cb; });
      answerBox.append(h('div', { class: 'acts' }, h('b', { text: 'הצעות לשינוי בגרף – סמן מה להחיל:' }),
        acts.map((a, i) => h('label', null, boxes[i], describeAction(a))),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'primary', onclick: async () => { await applyActions(acts.filter((_, i) => boxes[i].checked)); answerBox.hidden = true; }, text: 'החל נבחרים' }),
          h('button', { onclick: () => { answerBox.hidden = true; }, text: 'התעלם' }))));
    }
  }

  async function applyActions(list) {
    if (!list.length) return;
    const exports = list.filter((a) => a.op === 'export'), edits = list.filter((a) => a.op !== 'export');
    const touched = new Set();
    if (edits.length) {
      BG.snapshot();
      BG.batch(() => {
        for (const a of edits) {
          if (a.op === 'add_node') {
            let n = BG.findByLabel(a.label);
            if (!n) n = BG.addNode({ label: a.label, kind: a.kind, region: a.region, summary: a.summary });
            touched.add(n.id);
            for (const l of a.links || []) { const t = BG.getNode(l.to); if (t) BG.addEdge(n.id, t.id, l.rel, 1); }
          } else if (a.op === 'link') { const x = BG.getNode(a.from), y = BG.getNode(a.to); if (x && y) { BG.addEdge(x.id, y.id, a.rel, a.w); touched.add(x.id); touched.add(y.id); } }
          else if (a.op === 'move') { const n = BG.getNode(a.node); if (n) { n.region = a.region; if (BG.kindById(a.kind)) n.kind = a.kind; touched.add(n.id); } }
          else if (a.op === 'update') { const n = BG.getNode(a.node); if (n) { n.summary = a.summary.slice(0, 500); touched.add(n.id); } }
          else if (a.op === 'delete') { const n = BG.getNode(a.node); if (n) BG.removeNode(n.id); }
        }
      });
      BG.layout.kick(1);
      BG.toast('הוחלו ' + edits.length + ' שינויים (↶ מבטל)', 'ok');
      if (touched.size) lightUp([...touched], 'new');
    }
    for (const a of exports) { try { BG.toast('הורד: ' + await BG.runExport(a.format), 'ok'); } catch (e) { BG.toast('הייצוא נכשל: ' + e.message, 'err'); } }
  }

  async function runCommand(request) {
    if (busy || !request.trim()) return;
    if (!BG.state.nodes.length) return BG.toast('הגרף ריק – הוסף קודם מקורות או טען דוגמה');
    setBusy(true);
    abortCtl = new AbortController();
    const hint = $('#hint');
    try {
      let seeds = [], intent = 'answer', note = '';
      if (BG.ai.ready()) {
        hint.textContent = 'ה-AI סורק את המוח…'; hint.classList.add('scan');
        const r = await BG.ai.seeds(request, indexFor(request), abortCtl.signal);
        seeds = (r.seeds || []).map((s) => { const n = BG.getNode(s); return n && n.id; }).filter(Boolean);
        intent = r.intent || 'answer'; note = r.note || '';
      } else seeds = localSeeds(request);
      hint.classList.remove('scan');
      if (!seeds.length) seeds = localSeeds(request);
      if (!seeds.length && !(BG.ai.ready() && intent !== 'answer')) { hint.textContent = ''; setBusy(false); return showAnswer({ title: 'לא נמצא', text: 'לא מצאתי בגרף משהו שקשור לבקשה.' + (BG.ai.ready() ? '' : ' (בלי מפתח AI החיפוש הוא לפי מילים בלבד.)'), visited: [], actions: [] }); }
      hint.textContent = note || 'עובר על האזורים הרלוונטיים…';
      const order = traversal(seeds, 26, 2);
      await walk(order);
      if (!BG.ai.ready()) {
        showAnswer({ title: 'בלי מפתח AI', text: 'סימנתי את הצמתים והאזורים הקרובים למילים בבקשה. כדי שה-AI יענה, יסדר וייצא – הוסף מפתח API בהגדרות (⚙).', visited: order.map((o) => o.id), actions: [] });
        return;
      }
      hint.textContent = 'ה-AI קורא את מה שנמצא ועונה…'; hint.classList.add('scan');
      const vis = order.map((o) => BG.nodeById(o.id));
      const idset = new Set(vis.map((v) => v.id));
      const edges = BG.state.edges.filter((e) => idset.has(e.from) && idset.has(e.to)).map((e) => ({ from: e.from, to: e.to, rel: e.rel }));
      const res = await BG.ai.work(request, vis, edges, abortCtl.signal);
      hint.classList.remove('scan');
      const used = (res.used || []).map((u) => { const n = BG.getNode(u); return n && n.id; }).filter(Boolean);
      if (used.length) { BG.clearActivation(); used.forEach((id) => BG.pulse(id, null, 0.8)); }
      showAnswer({ title: intent === 'modify' ? 'הצעה לשינוי' : 'תשובה', text: String(res.answer || '').trim() || '(ה-AI לא כתב תשובה)', visited: order.map((o) => o.id), used, actions: res.actions });
    } catch (e) {
      if (e.name === 'AbortError') BG.toast('הופסק');
      else { BG.toast(e.message, 'err'); }
    } finally {
      hint.classList.remove('scan'); hint.textContent = ''; renderStats(); setBusy(false);
    }
  }
  $('#cmd').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#cmdInput').value; $('#cmdInput').value = ''; runCommand(v); });

  async function organizeAll() {
    if (busy) return;
    if (!BG.ai.ready()) return BG.toast('סידור אוטומטי דורש מפתח API (⚙)', 'err');
    const nodes = BG.state.nodes.filter((n) => !BG.kindById(n.kind).source);
    if (nodes.length < 2) return BG.toast('אין מספיק צמתים לסידור');
    setBusy(true); abortCtl = new AbortController();
    const actions = [], labels = BG.state.nodes.map((n) => n.label), hint = $('#hint');
    try {
      BG.clearActivation();
      for (let i = 0; i < nodes.length; i += 50) {
        const batch = nodes.slice(i, i + 50);
        hint.textContent = 'ה-AI עובר על הצמתים ' + (i + 1) + '–' + (i + batch.length) + ' מתוך ' + nodes.length + '…'; hint.classList.add('scan');
        batch.forEach((n) => BG.pulse(n.id, null, 0.5));
        const r = await BG.ai.organize(batch, labels, abortCtl.signal);
        for (const m of r.moves || []) { const n = BG.getNode(m.id); if (n && BG.regionById(m.region) && (m.region !== n.region || (m.kind && m.kind !== n.kind))) actions.push({ op: 'move', node: n.id, region: m.region, kind: m.kind }); }
        for (const l of r.links || []) actions.push({ op: 'link', from: l.from, to: l.to, rel: l.rel, w: l.w });
        BG.clearActivation();
      }
      showAnswer({ title: 'סידור מחדש', text: actions.length ? 'ה-AI עבר על ' + nodes.length + ' צמתים והציע ' + actions.length + ' שינויים.' : 'לא נמצא מה לשפר – הכל נראה במקום.', visited: nodes.map((n) => n.id), used: [], actions });
      BG.clearActivation();
    } catch (e) { if (e.name !== 'AbortError') BG.toast(e.message, 'err'); }
    finally { hint.classList.remove('scan'); hint.textContent = ''; setBusy(false); }
  }

  // ---------- demo data ----------
  const DEMO = {
    nodes: [
      ['ערך', 'יצירתיות', 'value', 'pfc', 'הצורך ליצור דברים חדשים ולא לחזור על אחרים'],
      ['ערך', 'מצוינות', 'value', 'pfc', 'לעשות כל דבר ברמה הגבוהה ביותר שאפשר'],
      ['ערך', 'חופש', 'value', 'pfc', 'לבחור לבד את הדרך, הזמן והעבודה'],
      ['מטרה', 'לבנות מוצר משלי', 'goal', 'pfc', 'להשיק אפליקציה שאנשים משתמשים בה'],
      ['הרגל', 'קפה ומסך בבוקר', 'habit', 'bg', 'פעולה אוטומטית שפותחת את היום בגלילה'],
      ['הרגל', 'כתיבה יומית', 'habit', 'bg', 'עשר דקות כתיבה לפני שהעולם מתעורר'],
      ['הרגל', 'דחיית משימות קשות', 'habit', 'bg', 'מעבר למשימה קלה כשמשהו מרגיש גדול'],
      ['רגש', 'חרדת ביצוע', 'emotion', 'amy', 'פחד שהתוצר לא יהיה טוב מספיק'],
      ['רגש', 'התלהבות', 'emotion', 'amy', 'דחיפה חזקה בתחילת רעיון חדש'],
      ['רגש', 'תסכול', 'emotion', 'amy', 'כשהתוצאה רחוקה ממה שדמיינתי'],
      ['זיכרון', 'הפרויקט הראשון שהצליח', 'memory', 'hip', 'הרגע שבו משהו שבניתי עבד אצל אחרים'],
      ['זיכרון', 'ביקורת מהמורה', 'memory', 'hip', 'הערה חדה שנשארה שנים'],
      ['מיומנות', 'תכנות', 'skill', 'cer', 'שליטה גוברת בבניית כלים בעצמי'],
      ['מיומנות', 'עיצוב ויזואלי', 'skill', 'cer', 'בחירת צבעים וקומפוזיציה'],
      ['ידע', 'גרפים וקשרים', 'concept', 'tem', 'ייצוג ידע כרשת של רעיונות מקושרים'],
      ['ידע', 'מערכת העצבים', 'fact', 'tem', 'תפקידים שונים לאזורים שונים במוח'],
      ['אדם', 'שותף לפרויקט', 'person', 'tem', 'מי שמסתכל על הדברים בזווית אחרת'],
      ['דימוי', 'מפת מוח כציור', 'image', 'occ', 'תמונה שבה כל אזור צבוע לפי תפקידו'],
      ['צורך', 'שינה סדירה', 'need', 'hyp', 'בלי שינה הכל נראה קשה יותר'],
      ['צורך', 'תנועה', 'need', 'hyp', 'הליכה פותחת את הראש'],
      ['פעולה', 'שליחת הגרסה הראשונה', 'action', 'mot', 'לפרסם לפני שהכל מושלם'],
      ['קשב', 'עבודה ממוקדת', 'space', 'par', 'מסך אחד, חלון אחד, שעה אחת'],
      ['מתח', 'שלמות מול מהירות', 'tension', 'acc', 'הרצון להשלים מתנגש בצורך להתקדם'],
      ['מצב', 'עייפות אחה״צ', 'state', 'stem', 'ירידת אנרגיה אחרי הצהריים']
    ],
    links: [
      ['מצוינות', 'חרדת ביצוע', 'מעוררת'], ['חרדת ביצוע', 'דחיית משימות קשות', 'מובילה ל'], ['דחיית משימות קשות', 'תסכול', 'יוצרת'],
      ['יצירתיות', 'התלהבות', 'מציתה'], ['התלהבות', 'לבנות מוצר משלי', 'מזינה'], ['חופש', 'לבנות מוצר משלי', 'מניע'],
      ['כתיבה יומית', 'יצירתיות', 'מזינה'], ['קפה ומסך בבוקר', 'עבודה ממוקדת', 'מפריע ל'], ['עבודה ממוקדת', 'תכנות', 'מאפשרת'],
      ['ביקורת מהמורה', 'חרדת ביצוע', 'מקור של'], ['הפרויקט הראשון שהצליח', 'מצוינות', 'חיזק את'], ['הפרויקט הראשון שהצליח', 'התלהבות', 'מעורר'],
      ['שלמות מול מהירות', 'מצוינות', 'נובע מ'], ['שלמות מול מהירות', 'שליחת הגרסה הראשונה', 'מעכב'], ['שליחת הגרסה הראשונה', 'לבנות מוצר משלי', 'מקדמת'],
      ['גרפים וקשרים', 'מערכת העצבים', 'מקביל ל'], ['מפת מוח כציור', 'גרפים וקשרים', 'מציגה'], ['עיצוב ויזואלי', 'מפת מוח כציור', 'יוצר'],
      ['שותף לפרויקט', 'שלמות מול מהירות', 'מאזן'], ['שינה סדירה', 'עייפות אחה״צ', 'מפחיתה'], ['תנועה', 'עבודה ממוקדת', 'משפרת'], ['עייפות אחה״צ', 'דחיית משימות קשות', 'מגבירה'],
      ['תכנות', 'לבנות מוצר משלי', 'כלי ל'], ['כתיבה יומית', 'קפה ומסך בבוקר', 'מתחרה ב']
    ]
  };
  function loadDemo() {
    BG.snapshot();
    BG.batch(() => {
      const m = new Map();
      for (const [, label, kind, region, summary] of DEMO.nodes) m.set(label, BG.addNode({ label, kind, region, summary }));
      for (const [a, b, rel] of DEMO.links) if (m.get(a) && m.get(b)) BG.addEdge(m.get(a).id, m.get(b).id, rel, 2);
    });
    BG.layout.kick(1);
    BG.toast('נטענה דוגמה – נסה: "מה גורם לי לדחות משימות?"', 'ok');
  }
  BG.loadDemo = loadDemo;

  function renderEmpty() {
    const has = BG.state.nodes.length > 0;
    const tail = $('#tab-add .demo');
    if (tail) tail.remove();
    if (!has) $('#tab-add').prepend(h('div', { class: 'demo drophint', style: 'margin:0 0 10px', onclick: loadDemo, text: 'הגרף ריק – לחץ לטעינת דוגמה קטנה (24 צמתים)' }));
  }

  BG.ui = { showTab, indexFor, localSeeds, traversal, walk, describeAction, cleanActions, applyActions, regionChips, labelOf };

  // ---------- init ----------
  BG.on('change', () => { renderStats(); renderRegionsPanel(); if (BG.view.selected && !BG.nodeById(BG.view.selected)) BG.view.selected = null; renderNodePanel(); renderEmpty(); });
  BG.ai.loadSettings();
  BG.initView($('#stage'));
  renderAddPanel();
  renderNodePanel();
  renderRegionsPanel();
  if (!BG.restore()) { renderStats(); renderEmpty(); }
  BG.layout.kick(1);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); BG.undo(); }
    if (e.key === 'Escape') { BG.clearActivation(); BG.select(null); }
  });
})(window.BG);
