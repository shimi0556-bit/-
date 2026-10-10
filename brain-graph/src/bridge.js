// A conversation between the AI of Atlas and the AI of "מפת הנפש" (mapat-hanefesh), over postMessage.
// Mapat runs in an iframe (or a window we opened); each side answers from its own data, and the user approves every change.
(function (BG) {
  'use strict';
  const TAG = 'atlas-bridge';
  const U = () => BG.ui;
  const h = BG.h;
  const B = (BG.bridge = { win: null, ready: false, info: null, busy: false });
  const waits = new Map();
  let abort = null;

  // Same-origin embedding: mapat's own "hub" hooks let it use Atlas' AI directly.
  window.hubAI = async (user, opts) => ({ text: await BG.ai.call({ system: (opts && opts.system) || '', user, max: opts && opts.maxTokens, signal: opts && opts.signal }), model: BG.ai.settings.model });
  window.hubAIInfo = () => ({ chosen: BG.ai.ready() ? 'atlas' : '', names: { atlas: 'אטלס המוח' }, model: BG.ai.settings.model });
  window.hubAISetProvider = () => {};

  const post = (msg) => { if (B.win) { try { B.win.postMessage(Object.assign({ bridge: TAG, from: 'atlas', to: 'mapat' }, msg), '*'); } catch (e) { /* ignore */ } } };
  function send(op, payload, timeout) {
    return new Promise((resolve, reject) => {
      if (!B.win || B.win.closed) return reject(new Error('מפת הנפש לא מחוברת'));
      const id = 'q' + Math.random().toString(36).slice(2, 9);
      const t = setTimeout(() => { waits.delete(id); reject(new Error('מפת הנפש לא ענתה בזמן (ייתכן שהאישור שם עדיין ממתין)')); }, timeout || 120000);
      waits.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      post(Object.assign({ op, id }, payload || {}));
    });
  }
  B.send = send;

  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || m.bridge !== TAG || m.from !== 'mapat' || !B.win || e.source !== B.win) return;
    if (m.op === 'hello-ack') { B.ready = true; B.info = m; render(); return; }
    if (m.op === 'need-llm') {
      // mapat has no key of its own: run its request with Atlas' AI
      try { const text = await BG.ai.call({ system: m.system, user: m.user, max: m.maxTokens || 1500 }); post({ op: 'llm-result', id: m.id, text }); }
      catch (err) { post({ op: 'llm-result', id: m.id, error: err.message }); }
      return;
    }
    const w = waits.get(m.id);
    if (!w) return;
    waits.delete(m.id);
    if (m.op === 'error') w.reject(new Error(m.message)); else if (m.op === 'denied') w.reject(new Error('האישור במפת הנפש נדחה')); else w.resolve(m);
  });

  // ---------- connection ----------
  const box = () => document.getElementById('tab-chat');
  let urlValue = 'mapat-hanefesh/index.html';
  try { urlValue = localStorage.getItem('brain-graph:mapat-url') || '../mapat-hanefesh/index.html'; } catch (e) { urlValue = '../mapat-hanefesh/index.html'; }
  let frameHolder = null, transcript = null, proposals = null, status = null;

  function connect(mode, url) {
    try { localStorage.setItem('brain-graph:mapat-url', url); } catch (e) { /* ignore */ }
    B.ready = false; B.info = null;
    if (mode === 'iframe') {
      const f = h('iframe', { class: 'frame', title: 'מפת הנפש', src: url });
      frameHolder.textContent = ''; frameHolder.append(f);
      B.win = f.contentWindow;
      f.addEventListener('load', () => { B.win = f.contentWindow; ping(); });
    } else {
      const w = window.open(url, 'mapat-hanefesh');
      if (!w) return BG.toast('הדפדפן חסם פתיחת חלון. אפשר לאשר חלונות קופצים לדף הזה.', 'err');
      B.win = w; frameHolder.textContent = '';
      setTimeout(ping, 1200);
    }
    render();
  }
  function ping() { let n = 0; const t = setInterval(() => { if (B.ready || ++n > 12) return clearInterval(t); post({ op: 'hello' }); }, 700); post({ op: 'hello' }); }

  // ---------- the dialogue ----------
  const PERSONA =
    'You are the AI of "אטלס המוח" (Atlas), a personal knowledge graph laid out like a human brain (values, habits, emotions, memories, skills, facts). ' +
    'You are in a dialogue with the AI of "מפת הנפש" (Mapat), a reflective journal that knows the user\'s stories, values, emotions, beliefs and the links between them. ' +
    'Together you look for real connections between the knowledge in Atlas and the inner world in Mapat. Speak Hebrew, 2-4 concrete sentences, and name actual nodes/concepts. Reply with JSON {"say":"..."}.';

  function addBubble(who, text) {
    const label = who === 'atlas' ? 'אטלס המוח' : who === 'mapat' ? 'מפת הנפש' : '';
    transcript.append(h('div', { class: 'bubble ' + who }, label ? h('b', { text: label }) : null, text));
    transcript.scrollTop = transcript.scrollHeight;
    const p = document.getElementById('tab-chat'); if (p) p.scrollTop = p.scrollHeight;
  }

  async function dialogue(topic, rounds) {
    if (!BG.ai.ready()) return BG.toast('השיחה דורשת מפתח AI בהגדרות (⚙)', 'err');
    if (!B.ready) return BG.toast('קודם צריך לחבר את מפת הנפש', 'err');
    B.busy = true; abort = new AbortController(); render();
    transcript.textContent = ''; proposals.textContent = '';
    const hist = [];
    try {
      addBubble('sys', 'האטלס סורק את הזיכרון שלו על "' + topic + '"…');
      let seeds = [];
      try {
        const r = await BG.ai.seeds(topic, U().indexFor(topic), abort.signal);
        seeds = (r.seeds || []).map((s) => { const n = BG.getNode(s); return n && n.id; }).filter(Boolean);
      } catch (e) { if (e.name === 'AbortError') throw e; }
      if (!seeds.length) seeds = U().localSeeds(topic);
      const order = U().traversal(seeds, 22, 2);
      if (order.length) await U().walk(order);
      const mem = order.map((o) => BG.nodeById(o.id)).filter(Boolean).map((n) => '- ' + n.label + ' [' + (BG.regionById(n.region) || {}).name + '] ' + (n.summary || '')).join('\n');
      for (let r = 1; r <= rounds; r++) {
        const last = r === rounds;
        const turn = await BG.ai.json({
          system: PERSONA,
          user: 'Topic: ' + topic + '\n\nAtlas memory (what Atlas knows about it):\n' + (mem || '(nothing relevant)') + '\n\nConversation so far:\n' +
            (hist.map((x) => (x.who === 'atlas' ? 'Atlas: ' : 'Mapat: ') + x.text).join('\n') || '(none yet)') + '\n\n' +
            (r === 1 ? 'Open the dialogue: share the most relevant thing Atlas knows and ask Mapat one concrete question about the user\'s inner world on this topic.'
              : last ? 'Final round: react to what Mapat said and state what you think should be connected or added on each side.' : 'React to what Mapat said and dig one level deeper with a concrete question.'),
          max: 700, signal: abort.signal
        });
        const say = String(turn.say || '').trim() || '(…)';
        hist.push({ who: 'atlas', text: say }); addBubble('atlas', say);
        const ans = await send('ask', { question: say, topic, history: hist.slice(0, -1) });
        hist.push({ who: 'mapat', text: ans.say }); addBubble('mapat', ans.say);
        // light up whatever in Atlas matches what Mapat just said
        const echo = U().localSeeds(ans.say).slice(0, 5);
        if (echo.length) { const o2 = U().traversal(echo, 8, 1); await U().walk(o2); }
        if (abort.signal.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError' });
      }
      addBubble('sys', 'שתי הבינות מסכמות…');
      const fin = await BG.ai.json({
        system: PERSONA,
        user: 'Topic: ' + topic + '\n\nAtlas memory:\n' + (mem || '(none)') + '\n\nDialogue:\n' + hist.map((x) => (x.who === 'atlas' ? 'Atlas: ' : 'Mapat: ') + x.text).join('\n') + '\n\n' +
          'Summarise what the two AIs agreed on and propose concrete changes. Return JSON:\n' +
          '{"summary":"3-4 Hebrew sentences","atlas_actions":[{"op":"add_node","label":"","kind":"","region":"","summary":"","links":[{"to":"existing label","rel":""}]},{"op":"link","from":"label","to":"label","rel":""}],' +
          '"mapat_actions":{"concepts":[{"name":"","type":"value|emotion|belief|need|behavior|person","note":""}],"relations":[{"from":"concept name","to":"concept name","type":"leads|supports|conflicts|protects|masks|related","note":""}]}}\n' +
          'Only propose what the dialogue actually supports; at most 6 atlas_actions, 6 concepts and 6 relations.',
        max: 2500, signal: abort.signal
      });
      addBubble('sys', String(fin.summary || ''));
      showProposals(fin);
    } catch (e) {
      if (e.name === 'AbortError') addBubble('sys', 'השיחה נעצרה.'); else addBubble('sys', '✗ ' + e.message);
    } finally { B.busy = false; BG.clearActivation(); BG.resetView(); render(); }
  }

  function showProposals(fin) {
    proposals.textContent = '';
    const atlas = U().cleanActions(fin.atlas_actions).filter((a) => a.op !== 'export' && a.op !== 'delete');
    const mc = (fin.mapat_actions && Array.isArray(fin.mapat_actions.concepts) ? fin.mapat_actions.concepts : []).filter((c) => c && c.name).slice(0, 8);
    const mr = (fin.mapat_actions && Array.isArray(fin.mapat_actions.relations) ? fin.mapat_actions.relations : []).filter((r) => r && r.from && r.to).slice(0, 8);
    if (!atlas.length && !mc.length && !mr.length) return proposals.append(h('p', { class: 'muted', text: 'השיחה לא העלתה שינויים להצעה.' }));
    const row = (text, checked) => { const cb = h('input', { type: 'checkbox' }); cb.checked = checked; return [cb, h('label', { style: 'display:flex;gap:8px;align-items:flex-start;padding:3px 0' }, cb, text)]; };
    const A = atlas.map((a) => row('אטלס: ' + U().describeAction(a), true));
    const MC = mc.map((c) => row('מפת הנפש: הוסף "' + c.name + '" (' + (c.type || 'belief') + ')', true));
    const MR = mr.map((r) => row('מפת הנפש: ' + r.from + ' ← ' + (r.type || 'related') + ' → ' + r.to, true));
    proposals.append(h('h3', { text: 'הצעות משותפות – סמן מה להחיל' }), A.map((x) => x[1]), MC.map((x) => x[1]), MR.map((x) => x[1]),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: async () => {
        const okA = atlas.filter((_, i) => A[i][0].checked);
        const okC = mc.filter((_, i) => MC[i][0].checked), okR = mr.filter((_, i) => MR[i][0].checked);
        try {
          if (okA.length) await U().applyActions(okA);
          if (okC.length || okR.length) { const r = await send('apply', { concepts: okC, relations: okR }); BG.toast('במפת הנפש נוספו ' + r.added + ' מושגים ו־' + r.links + ' קשרים', 'ok'); }
          proposals.textContent = '';
        } catch (e) { BG.toast(e.message, 'err'); }
      }, text: 'החל נבחרים' }), h('button', { onclick: () => { proposals.textContent = ''; }, text: 'התעלם' })));
  }

  async function sync() {
    try {
      BG.toast('מבקש את הנתונים ממפת הנפש (צריך לאשר שם)…');
      const r = await send('snapshot');
      const s = BG.mapat.import(r.data);
      BG.toast('נקלט: ' + s.added + ' חדשים, ' + s.merged + ' אוחדו, ' + s.links + ' קשרים, ' + s.stories + ' סיפורים', 'ok');
    } catch (e) { BG.toast(e.message, 'err'); }
  }

  // ---------- panel (built once: re-attaching the iframe would reload it) ----------
  let built = false, statusEl, actEl, syncBtn, topicEl, roundsEl;
  function build() {
    const p = box(); if (!p) return;
    built = true;
    const url = h('input', { value: urlValue, dir: 'ltr', placeholder: 'כתובת הקובץ של מפת הנפש' });
    url.addEventListener('change', () => { urlValue = url.value.trim(); });
    statusEl = h('p', { class: 'muted' });
    frameHolder = h('div');
    transcript = h('div');
    proposals = h('div');
    topicEl = h('input', { placeholder: 'על מה שתי הבינות ידברו? (למשל: למה אני דוחה משימות)', id: 'chatTopic' });
    roundsEl = h('select', null, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === 2 }, n + ' סבבים')));
    actEl = h('div', { style: 'flex:none' });
    syncBtn = h('button', { onclick: sync, text: 'משוך את כל הנתונים ממפת הנפש' });
    p.append(
      h('h3', { text: 'שיחה בין הבינות' }),
      h('p', { class: 'muted', text: 'הבינה של האטלס עוברת על הגרף, שואלת את הבינה של מפת הנפש, והן מסכמות יחד מה לחבר ומה להוסיף בכל צד. כל שינוי רק באישורך. מפת הנפש תבקש ממך אישור לפני שתענה.' }),
      h('label', { class: 'f', text: 'מפת הנפש' }), url,
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { class: 'primary', onclick: () => connect('iframe', url.value.trim()), text: 'הטמע כאן' }),
        h('button', { onclick: () => connect('window', url.value.trim()), text: 'פתח בחלון' })),
      statusEl, frameHolder,
      h('div', { class: 'hr' }),
      h('label', { class: 'f', text: 'נושא לשיחה' }), topicEl,
      h('div', { class: 'row', style: 'margin-top:6px' }, roundsEl, actEl),
      h('div', { style: 'margin-top:8px' }, syncBtn),
      transcript, proposals
    );
  }
  function render() {
    if (!built) build();
    if (!built) return;
    statusEl.textContent = '';
    statusEl.append(h('span', { class: 'dot' + (B.ready ? ' on' : '') }),
      B.ready ? 'מפת הנפש מחוברת · ' + B.info.counts.concepts + ' מושגים, ' + B.info.counts.relations + ' קשרים, ' + B.info.counts.stories + ' סיפורים' : (B.win ? 'ממתין לתשובה ממפת הנפש…' : 'לא מחובר'));
    syncBtn.disabled = !B.ready;
    actEl.textContent = '';
    actEl.append(B.busy ? h('button', { onclick: () => abort && abort.abort(), text: 'עצור' })
      : h('button', { class: 'primary', onclick: () => { const t = topicEl.value.trim(); if (!t) return BG.toast('כתוב נושא לשיחה'); dialogue(t, +roundsEl.value); }, text: 'התחל שיחה' }));
  }
  BG.on('change', () => { /* panel keeps its own state; only the status line may need a refresh */ });
  render();
})(window.BG);
