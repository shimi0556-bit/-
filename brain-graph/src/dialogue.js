// A room where the AIs of several journals talk to each other. No bridge, no live connection:
// each journal is loaded from its export file (or from this browser's storage), and gets its own AI that knows only that data.
(function (BG) {
  'use strict';
  const h = BG.h, U = () => BG.ui;
  const R = (BG.room = { parts: [], busy: false });
  let abort = null, listEl, transcript, proposals, actEl, topicEl, roundsEl, atlasRow;

  // ---------- reading the different file formats ----------
  const TYPE_OUT = { emotion: 'emotion', person: 'person', thought: 'belief', trigger: 'belief', body: 'need', coping: 'behavior', insight: 'belief', concept: 'belief' };
  const TYPE_HE = { event: 'מקרה', emotion: 'רגש', person: 'אדם', trigger: 'טריגר', thought: 'מחשבה', body: 'תחושה בגוף', coping: 'התמודדות', insight: 'תובנה', concept: 'מושג', history: 'היסטוריה' };
  const isJournal = (d) => Array.isArray(d) && d.some((x) => x && x.id && x.type && 'title' in x);

  function parseAny(json) {
    if (isJournal(json)) return { kind: 'journal', items: json.filter((x) => x && x.id && x.type) };
    if (json && isJournal(json.items)) return { kind: 'journal', items: json.items };
    if (BG.mapat.isBackup(json)) return { kind: 'mapat', data: json };
    throw new Error('לא זיהיתי את הקובץ. צריך את קובץ הייצוא של המפה הנפשית או של מפת הנפש.');
  }

  // psychJournal items -> mapat backup shape (so it can be imported into the brain)
  function journalToMapat(items) {
    const real = items.filter((n) => !n.demo), by = new Map(real.map((n) => [n.id, n]));
    const cs = real.filter((n) => n.type !== 'event' && n.type !== 'history');
    const ids = new Set(cs.map((n) => n.id)), pairs = new Map();
    const add = (a, b) => { if (!a || !b || a === b || !ids.has(a) || !ids.has(b)) return; const k = [a, b].sort().join('|'); const o = pairs.get(k) || { a, b, n: 0 }; o.n++; pairs.set(k, o); };
    for (const e of real.filter((n) => n.type === 'event')) { const r = (e.refs || []).map((x) => x.id); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) add(r[i], r[j]); }
    return {
      app: 'mapat-hanefesh',
      concepts: cs.map((n) => ({ id: n.id, name: n.title, type: TYPE_OUT[n.type] || 'belief', note: n.text || '' })),
      relations: [...pairs.values()].sort((x, y) => y.n - x.n).slice(0, 200).map((p, i) => ({ id: 'r' + i, from: p.a, to: p.b, type: 'related', note: 'מופיעים יחד ב־' + p.n + ' מקרים' })),
      stories: real.filter((n) => n.type === 'event').map((e) => ({ id: e.id, title: e.title || 'מקרה', text: [e.text, e.lesson ? 'תובנה: ' + e.lesson : '', (e.refs || []).map((r) => by.get(r.id)).filter(Boolean).map((n) => '[[' + n.title + ']]').join(' ')].filter(Boolean).join('\n') }))
    };
  }

  // ---------- what each AI is allowed to know: a compact text of its own data ----------
  function journalDigest(items, limit) {
    let real = items.filter((n) => !n.demo);
    if (!real.length) real = items;
    const by = new Map(real.map((n) => [n.id, n]));
    const evs = real.filter((n) => n.type === 'event').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const out = []; let size = 0;
    for (const e of evs) {
      const g = {};
      for (const r of e.refs || []) { const n = by.get(r.id); if (n) (g[n.type] = g[n.type] || []).push(n.title + (r.v ? ' ' + r.v : '')); }
      const line = [String(e.date || '') + ' | ' + (e.title || 'מקרה'), e.text ? 'מה קרה: ' + e.text.replace(/\s+/g, ' ').slice(0, 220) : '',
        ...['emotion', 'person', 'trigger', 'thought', 'body', 'coping'].map((t) => g[t] ? TYPE_HE[t] + ': ' + g[t].join(', ') : ''), e.lesson ? 'תובנה: ' + e.lesson.replace(/\s+/g, ' ').slice(0, 160) : ''].filter(Boolean).join(' | ');
      if (size + line.length > limit) break;
      out.push(line); size += line.length;
    }
    const freq = new Map();
    for (const e of evs) for (const r of e.refs || []) freq.set(r.id, (freq.get(r.id) || 0) + 1);
    const pat = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([id, c]) => { const n = by.get(id); return n ? n.title + ' (' + TYPE_HE[n.type] + ') ×' + c : ''; }).filter(Boolean);
    const others = real.filter((n) => n.type === 'insight' || n.type === 'concept').slice(0, 20).map((n) => n.title + (n.text ? ': ' + n.text.slice(0, 80) : ''));
    return 'מקרים (מהחדש לישן):\n' + (out.reverse().join('\n') || '(אין)') + '\n\nדפוסים שחוזרים:\n' + (pat.join('; ') || '(אין)') + (others.length ? '\n\nתובנות ומושגים:\n' + others.join('\n') : '');
  }
  function mapatDigest(d, limit) {
    const concepts = Array.isArray(d.concepts) ? d.concepts : Object.values(d.concepts || {});
    const byId = new Map(concepts.map((c) => [c.id, c]));
    const HE = { value: 'ערכים', emotion: 'רגשות', belief: 'אמונות ומחשבות', need: 'צרכים', behavior: 'התנהגויות', person: 'אנשים' };
    const lines = Object.keys(HE).map((t) => { const l = concepts.filter((c) => c.type === t).slice(0, 40); return l.length ? HE[t] + ': ' + l.map((c) => c.name + (c.note ? ' (' + String(c.note).slice(0, 70) + ')' : '')).join('; ') : ''; }).filter(Boolean);
    const rels = (d.relations || []).slice(0, 70).map((r) => { const a = byId.get(r.from), b = byId.get(r.to); return a && b ? a.name + ' ' + r.type + ' ' + b.name : ''; }).filter(Boolean);
    const stories = (d.stories || []).slice(-8).map((s) => (s.title || '') + ': ' + String(s.text || '').replace(/\[\[([^\]|]*)\|?[^\]]*\]\]/g, '$1').slice(0, 260));
    return (lines.join('\n') + '\n\nקשרים:\n' + rels.join('\n') + '\n\nסיפורים אחרונים:\n' + stories.join('\n')).slice(0, limit);
  }
  const digestOf = (p) => (p.kind === 'journal' ? journalDigest(p.items, 7000) : mapatDigest(p.data, 7000));
  const countsOf = (p) => {
    if (p.kind === 'journal') { const r = p.items.filter((n) => !n.demo); return r.filter((n) => n.type === 'event').length + ' מקרים, ' + r.filter((n) => n.type !== 'event' && n.type !== 'history').length + ' פריטים'; }
    const c = Array.isArray(p.data.concepts) ? p.data.concepts.length : Object.keys(p.data.concepts || {}).length;
    return c + ' מושגים, ' + (p.data.stories || []).length + ' סיפורים';
  };

  // ---------- loading ----------
  function addPart(name, parsed) {
    const p = Object.assign({ id: 'q' + Date.now().toString(36) + R.parts.length, name, use: true, ai: null }, parsed);
    R.parts.push(p); listEl.append(partRow(p));
    return p;
  }
  async function loadFiles(files) {
    for (const f of files) {
      try { addPart(f.name.replace(/\.json$/i, ''), parseAny(JSON.parse(await f.text()))); }
      catch (e) { BG.toast(f.name + ': ' + e.message, 'err'); }
    }
  }
  function loadFromBrowser() {
    const keys = [['psychJournal.modern.v1', 'המפה הנפשית (שמורה בדפדפן)'], ['psychJournal.v1', 'המפה הנפשית (שמורה בדפדפן, גרסה ישנה)'], ['mapat-hanefesh.v1', 'מפת הנפש (שמורה בדפדפן)']];
    let found = 0;
    for (const [k, name] of keys) {
      try { const t = localStorage.getItem(k); if (t) { addPart(name, parseAny(JSON.parse(t))); found++; } } catch (e) { /* not readable or not the right shape */ }
    }
    if (!found) BG.toast('לא נמצא מידע של המפות בדפדפן הזה (הוא נשמר לפי כתובת הקובץ). אפשר לטעון את קובצי הייצוא שלהן.', 'err');
  }

  // ---------- one participant ----------
  function partRow(p) {
    const nameIn = h('input', { value: p.name }); nameIn.addEventListener('change', () => { p.name = nameIn.value.trim() || p.name; });
    const use = h('input', { type: 'checkbox', style: 'width:auto' }); use.checked = true; use.addEventListener('change', () => { p.use = use.checked; });
    // optional separate brain: lets one journal speak with Gemini and another with Claude, for example
    const prov = h('select', null, h('option', { value: '' }, 'אותה בינה של האטלס'), Object.entries(BG.PRESETS).map(([k, v]) => h('option', { value: k }, v.name)));
    const key = h('input', { type: 'password', placeholder: 'מפתח API לבינה הזו', dir: 'ltr', autocomplete: 'off' });
    const model = h('input', { placeholder: 'מודל', dir: 'ltr' });
    const sync = () => {
      if (!prov.value) { p.ai = null; return; }
      const pr = BG.PRESETS[prov.value];
      p.ai = { provider: prov.value, key: key.value.trim(), model: model.value.trim() || pr.model, base: pr.base };
    };
    prov.addEventListener('change', () => { model.value = prov.value ? BG.PRESETS[prov.value].model : ''; sync(); });
    key.addEventListener('input', sync); model.addEventListener('input', sync);
    p.el = h('div', { class: 'region-row', style: 'display:block;cursor:default' },
      h('div', { class: 'row' }, use, nameIn, h('button', { class: 'small danger', title: 'הסר', onclick: () => { R.parts = R.parts.filter((x) => x !== p); p.el.remove(); }, text: '✕' })),
      h('div', { class: 'muted', text: (p.kind === 'journal' ? 'המפה הנפשית' : 'מפת הנפש') + ' · ' + countsOf(p) }),
      h('details', null, h('summary', { class: 'muted', text: 'בינה משלה (ספק ומפתח נפרדים)' }), prov, h('div', { style: 'height:4px' }), key, h('div', { style: 'height:4px' }), model),
      h('div', { style: 'margin-top:6px' }, h('button', { class: 'small', onclick: () => {
        const s = BG.mapat.import(p.kind === 'journal' ? journalToMapat(p.items) : p.data);
        BG.toast(p.name + ' נכנסה לאטלס: ' + s.added + ' חדשים, ' + s.merged + ' אוחדו, ' + s.links + ' קשרים, ' + s.stories + ' סיפורים', 'ok');
      }, text: 'הכנס את הנתונים לאטלס' })));
    return p.el;
  }

  // ---------- the conversation ----------
  const personaFor = (p, others) =>
    'You are the AI of "' + p.name + '", a personal journal app. You know ONLY the user\'s own data below. You are in a dialogue with the AI of ' + others.map((o) => '"' + o.name + '"').join(' and ') +
    ', each of which knows different data about the same person. Goal: find real connections, contradictions and blind spots between what each of you knows about the user on the topic. ' +
    'Answer in Hebrew, 2-4 concrete sentences, name actual items from YOUR data, and either answer the last question or ask the other a concrete one. Say plainly when your data does not cover something. This is reflection, not diagnosis. Reply with JSON {"say":"..."}.';

  function addBubble(cls, label, text) {
    transcript.append(h('div', { class: 'bubble ' + cls }, label ? h('b', { text: label }) : null, text));
    const p = document.getElementById('tab-chat'); if (p) p.scrollTop = p.scrollHeight;
  }
  const histText = (hist) => hist.map((x) => x.name + ': ' + x.text).join('\n') || '(none yet)';

  // the brain takes part by reading its own memory about the topic (the regions it reads light up)
  async function atlasMemory(topic, last, signal) {
    const query = topic + ' ' + (last || '');
    let seeds = [];
    if (BG.ai.ready()) { try { const r = await BG.ai.seeds(query, U().indexFor(query), signal); seeds = (r.seeds || []).map((s) => { const n = BG.getNode(s); return n && n.id; }).filter(Boolean); } catch (e) { if (e.name === 'AbortError') throw e; } }
    if (!seeds.length) seeds = U().localSeeds(query);
    const order = U().traversal(seeds, 18, 2);
    if (order.length) await U().walk(order);
    return order.map((o) => BG.nodeById(o.id)).filter(Boolean).map((n) => '- ' + n.label + ' [' + (BG.regionById(n.region) || {}).name + '] ' + (n.summary || '')).join('\n') || '(nothing relevant)';
  }

  async function run(topic, rounds) {
    const active = R.parts.filter((p) => p.use);
    const withAtlas = atlasRow.cb.checked;
    const speakers = active.map((p) => ({ name: p.name, p, digest: digestOf(p), ai: p.ai }));
    if (withAtlas) speakers.push({ name: 'אטלס המוח', atlas: true });
    if (speakers.length < 2) return BG.toast('צריך לפחות שתי בינות: טען שתי מפות (או סמן גם את האטלס)', 'err');
    for (const s of speakers) if (!s.atlas && !((s.ai && s.ai.key) || BG.ai.ready())) return BG.toast('אין מפתח AI ל"' + s.name + '". הוסף מפתח בהגדרות (⚙) או "בינה משלה" לשורה שלה.', 'err');
    if (!BG.ai.ready()) return BG.toast('הסיכום נעשה בבינה של האטלס: צריך מפתח AI בהגדרות (⚙)', 'err');
    R.busy = true; abort = new AbortController(); updateAct();
    transcript.textContent = ''; proposals.textContent = '';
    const hist = [];
    try {
      for (let r = 1; r <= rounds; r++) {
        for (const s of speakers) {
          const others = speakers.filter((o) => o !== s);
          const last = hist.length ? hist[hist.length - 1].text : '';
          const data = s.atlas ? await atlasMemory(topic, last, abort.signal) : s.digest;
          const turn = await BG.ai.json({
            system: personaFor({ name: s.name }, others) + '\n\nYOUR DATA:\n' + data,
            user: 'Topic: ' + topic + '\n\nConversation so far:\n' + histText(hist) + '\n\n' +
              (!hist.length ? 'You speak first: open with the most relevant thing your data shows about the topic and ask the other a concrete question.'
                : r === rounds && s === speakers[speakers.length - 1] ? 'Final turn: say what you now think connects your data with theirs.' : 'Respond to the last message and move one step deeper.'),
            max: 600, signal: abort.signal, settings: s.ai || null
          });
          const say = String(turn.say || '').trim() || '(…)';
          hist.push({ name: s.name, text: say });
          addBubble(s.atlas ? 'atlas' : speakers.indexOf(s) % 2 === 0 ? 'mapat' : 'atlas', s.name, say);
        }
      }
      addBubble('sys', 'האטלס מסכם את השיחה…');
      const fin = await BG.ai.json({
        system: 'You moderate a dialogue between the AIs of several journals of one person, and also own "אטלס המוח", a brain-shaped knowledge graph. Reply with one JSON object, Hebrew text.',
        user: 'Topic: ' + topic + '\n\nDialogue:\n' + histText(hist) + '\n\nReturn JSON:\n' +
          '{"summary":"3-5 sentences: what connects the journals, what contradicts, what is missing",' +
          '"suggestions":{"<participant name>":["short concrete thing worth adding or examining in that journal"]},' +
          '"atlas_actions":[{"op":"add_node","label":"","kind":"","region":"","summary":"","links":[{"to":"existing label","rel":""}]}]}\n' +
          'Participants: ' + speakers.map((s) => s.name).join('; ') + '. At most 4 suggestions per participant and 6 atlas_actions; only what the dialogue supports.',
        max: 2200, signal: abort.signal
      });
      addBubble('sys', String(fin.summary || ''));
      showProposals(fin);
    } catch (e) {
      addBubble('sys', e.name === 'AbortError' ? 'השיחה נעצרה.' : '✗ ' + e.message);
    } finally { R.busy = false; BG.clearActivation(); BG.resetView(); updateAct(); }
  }

  function showProposals(fin) {
    proposals.textContent = '';
    const acts = U().cleanActions(fin.atlas_actions).filter((a) => a.op !== 'export' && a.op !== 'delete');
    const boxes = acts.map(() => { const cb = h('input', { type: 'checkbox' }); cb.checked = true; return cb; });
    const sug = fin.suggestions && typeof fin.suggestions === 'object' ? fin.suggestions : {};
    const names = Object.keys(sug).filter((k) => Array.isArray(sug[k]) && sug[k].length);
    if (names.length) {
      proposals.append(h('h3', { text: 'מה כדאי להוסיף או לבדוק בכל מפה' }));
      names.forEach((k) => proposals.append(h('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:700', text: k }), h('ul', { style: 'margin:0;padding-inline-start:18px' }, sug[k].slice(0, 5).map((t) => h('li', { text: String(t) })))));
    }
    if (acts.length) {
      proposals.append(h('h3', { text: 'הצעות לאטלס – סמן מה להחיל' }), acts.map((a, i) => h('label', { style: 'display:flex;gap:8px;align-items:flex-start;padding:3px 0' }, boxes[i], U().describeAction(a))),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: async () => { await U().applyActions(acts.filter((_, i) => boxes[i].checked)); proposals.textContent = ''; }, text: 'החל נבחרים' }),
          h('button', { onclick: () => { proposals.textContent = ''; }, text: 'התעלם' })));
    }
  }

  // ---------- panel ----------
  function updateAct() {
    actEl.textContent = '';
    actEl.append(R.busy ? h('button', { onclick: () => abort && abort.abort(), text: 'עצור' })
      : h('button', { class: 'primary', onclick: () => { const t = topicEl.value.trim(); if (!t) return BG.toast('כתוב נושא לשיחה'); run(t, +roundsEl.value); }, text: 'התחל שיחה' }));
  }
  function build() {
    const p = document.getElementById('tab-chat'); if (!p) return;
    listEl = h('div'); transcript = h('div'); proposals = h('div');
    const file = h('input', { type: 'file', multiple: true, accept: '.json,application/json', hidden: true });
    file.addEventListener('change', () => { loadFiles([...file.files]); file.value = ''; });
    topicEl = h('input', { id: 'chatTopic', placeholder: 'על מה הבינות ידברו? (למשל: למה אני נלחץ מביקורת)' });
    roundsEl = h('select', null, [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === 3 }, n + ' סבבים')));
    actEl = h('div', { style: 'flex:none' });
    const acb = h('input', { type: 'checkbox', style: 'width:auto' });
    atlasRow = { cb: acb };
    p.append(
      h('h3', { text: 'שיחה בין הבינות' }),
      h('p', { class: 'muted', text: 'טוען את קובצי הייצוא של שתי המפות (בכל אחת: ייצוא / גיבוי). לכל מפה יש בינה משלה שמכירה רק את הנתונים שלה, והבינות מדברות ישירות זו עם זו, בלי חיבור ובלי אישורים. בסוף האטלס מסכם ומציע מה להוסיף.' }),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => file.click(), text: 'טען קובצי ייצוא…' }), h('button', { onclick: loadFromBrowser, text: 'קרא מהדפדפן' })), file,
      listEl,
      h('label', { class: 'muted', style: 'display:block;margin:8px 0' }, acb, ' גם האטלס משתתף בשיחה (עם הזיכרון שלו, והאזורים נצבעים)'),
      h('div', { class: 'hr' }),
      h('label', { class: 'f', text: 'נושא לשיחה' }), topicEl,
      h('div', { class: 'row', style: 'margin-top:6px' }, roundsEl, actEl),
      transcript, proposals);
    updateAct();
  }
  // drop export files straight onto the chat panel
  BG.room.loadFiles = loadFiles;
  build();
})(window.BG);
