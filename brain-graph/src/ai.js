// AI connection (Anthropic or any OpenAI-compatible endpoint) and the prompts that drive the graph.
(function (BG) {
  'use strict';
  const SKEY = 'brain-graph:settings';
  const PRESETS = BG.PRESETS = {
    anthropic: { name: 'Anthropic (Claude)', model: 'claude-sonnet-5-5', base: 'https://api.anthropic.com' },
    openai: { name: 'OpenAI', model: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
    mistral: { name: 'Mistral', model: 'mistral-small-latest', base: 'https://api.mistral.ai/v1' },
    gemini: { name: 'Google Gemini', model: 'gemini-2.0-flash', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    openrouter: { name: 'OpenRouter', model: 'anthropic/claude-sonnet-4.5', base: 'https://openrouter.ai/api/v1' },
    custom: { name: 'מותאם אישית (תואם OpenAI)', model: '', base: '' }
  };
  const ai = (BG.ai = { settings: { provider: 'anthropic', key: '', model: PRESETS.anthropic.model, base: PRESETS.anthropic.base, reader: true } });

  ai.loadSettings = function () {
    try { const t = localStorage.getItem(SKEY); if (t) Object.assign(ai.settings, JSON.parse(t)); } catch (e) { /* ignore */ }
  };
  ai.saveSettings = function () {
    try { localStorage.setItem(SKEY, JSON.stringify(ai.settings)); } catch (e) { /* ignore */ }
  };
  ai.ready = () => !!(ai.settings.key && ai.settings.key.trim());

  function explain(status, body) {
    let detail = '';
    try { const j = JSON.parse(body); detail = (j.error && (j.error.message || j.error)) || j.message || ''; if (typeof detail !== 'string') detail = JSON.stringify(detail); } catch (e) { detail = String(body || '').slice(0, 200); }
    detail = detail.slice(0, 240);
    if (status === 401 || status === 403) return 'המפתח נדחה (' + status + '). בדוק שהמפתח נכון ושיש לו הרשאה. ' + detail;
    if (status === 404) return 'המודל או הכתובת לא נמצאו (404). בדוק שם מודל וכתובת שרת. ' + detail;
    if (status === 429) return 'חריגה ממכסה או מהקצב (429). נסה שוב עוד רגע, או בדוק את החיוב בחשבון. ' + detail;
    if (status >= 500) return 'שרת ה-AI מדווח על תקלה (' + status + '). נסה שוב מאוחר יותר. ' + detail;
    return 'שגיאה ' + status + ': ' + detail;
  }

  ai.call = async function (opt) {
    const s = ai.settings;
    if (!ai.ready()) throw new Error('אין מפתח API. אפשר להוסיף אותו בהגדרות (⚙).');
    const key = s.key.replace(/[^\x21-\x7E]/g, '');
    const base = (s.base || (PRESETS[s.provider] || {}).base || '').replace(/\/+$/, '');
    const model = s.model || (PRESETS[s.provider] || {}).model;
    if (!base) throw new Error('חסרה כתובת שרת בהגדרות.');
    let url, headers, body;
    if (s.provider === 'anthropic') {
      url = base + '/v1/messages';
      headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      body = { model, max_tokens: opt.max || 4000, system: opt.system, messages: [{ role: 'user', content: opt.user }] };
    } else {
      url = base + '/chat/completions';
      headers = { 'content-type': 'application/json', authorization: 'Bearer ' + key };
      body = { model, messages: [{ role: 'system', content: opt.system }, { role: 'user', content: opt.user }] };
      if (s.provider === 'openai') body.max_completion_tokens = opt.max || 4000; else body.max_tokens = opt.max || 4000;
      if (s.provider === 'openai' || s.provider === 'mistral') body.response_format = { type: 'json_object' };
    }
    let res;
    try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opt.signal }); }
    catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('שגיאת רשת: לא הצלחתי להתחבר לשרת ה-AI. בדוק אינטרנט, כתובת שרת, או שהשרת חוסם קריאות מהדפדפן (CORS).');
    }
    if (!res.ok) { let t = ''; try { t = await res.text(); } catch (e) { /* ignore */ } throw new Error(explain(res.status, t)); }
    const data = await res.json();
    if (s.provider === 'anthropic') {
      const txt = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (!txt) throw new Error('ה-AI לא החזיר טקסט' + (data.stop_reason ? ' (' + data.stop_reason + ')' : ''));
      return txt;
    }
    const m = data.choices && data.choices[0] && data.choices[0].message;
    if (!m || !m.content) throw new Error('ה-AI לא החזיר טקסט');
    return m.content;
  };

  ai.parseJSON = function (text) {
    let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      const sub = t.slice(a, b + 1);
      try { return JSON.parse(sub); } catch (e) { /* fall through */ }
      try { return JSON.parse(sub.replace(/,\s*([}\]])/g, '$1')); } catch (e) { /* fall through */ }
    }
    throw new Error('ה-AI החזיר תשובה שלא הצלחתי לקרוא כ-JSON: ' + t.slice(0, 120));
  };
  ai.json = async function (opt) { return ai.parseJSON(await ai.call(opt)); };

  const regionGuide = () => BG.REGIONS.map((r) => r.id + ' = ' + r.name + ' (' + r.does + ')').join('\n');
  const kindGuide = () => BG.KINDS.filter((k) => !k.source).map((k) => k.id + ' = ' + k.name).join(', ');
  const SYS = () =>
    'You are the librarian of a personal knowledge graph that is laid out like a human brain. Every node lives in the brain region that fits its psychological function:\n' +
    regionGuide() + '\nNode kinds: ' + kindGuide() + '.\n' +
    'Always answer with ONE strict JSON object and nothing else (no prose, no code fences). Write labels and text in the language of the user (Hebrew by default).';

  // ---- 1. extraction from a document / page ----
  ai.extract = async function (text, meta, existing, signal) {
    const user =
      'Source title: ' + (meta.title || '') + (meta.url ? '\nURL: ' + meta.url : '') + '\n\n' +
      'Existing node labels (reuse them EXACTLY when the same idea appears, and link to them): ' + JSON.stringify(existing.slice(0, 160)) + '\n\n' +
      'Task: extract the real knowledge in the source. Return JSON:\n' +
      '{"title":"short title","summary":"2 sentences","region":"region id that best fits the whole source",' +
      '"nodes":[{"label":"2-4 words","kind":"<kind>","region":"<region id>","summary":"one concrete sentence"}],' +
      '"links":[{"from":"label","to":"label","rel":"short relation phrase","w":1}]}\n' +
      'Rules: at most 22 nodes; prefer specific insights over generic words; every node needs at least one link (to another new node or an existing label); "w" is 1-3 link strength; choose the region by the psychological function of the idea.\n\n' +
      '--- SOURCE ---\n' + text;
    return ai.json({ system: SYS(), user, max: 5000, signal });
  };

  // ---- 2. find where a request lives in the graph ----
  ai.seeds = async function (request, index, signal) {
    const user =
      'User request: ' + request + '\n\nGraph index (id|label|region|kind|summary):\n' + index + '\n\n' +
      'Decide what the request needs. Return JSON: {"intent":"answer|modify|organize|export|other","seeds":["ids of the nodes to start from, most relevant first, max 8"],"note":"one short sentence about where you will look"}.';
    return ai.json({ system: SYS(), user, max: 800, signal });
  };

  // ---- 3. do the work with the visited memory ----
  ai.work = async function (request, visited, edges, signal) {
    const nodes = visited.map((v) => ({ id: v.id, label: v.label, region: v.region, kind: v.kind, summary: v.summary, notes: v.notes || undefined, excerpt: v.excerpt ? v.excerpt.slice(0, 350) : undefined }));
    const user =
      'User request: ' + request + '\n\nMemory visited (nodes):\n' + JSON.stringify(nodes) + '\n\nLinks between them:\n' + JSON.stringify(edges) + '\n\n' +
      'Do what the user asked using this memory. Return JSON: {"answer":"plain Hebrew text, short paragraphs, no markdown","used":["ids of nodes you actually relied on"],"actions":[...]}.\n' +
      'Allowed actions (only when the user asked to change, add, organise or export; otherwise []):\n' +
      '{"op":"add_node","label":"","kind":"","region":"","summary":"","links":[{"to":"label or id","rel":""}]}\n' +
      '{"op":"link","from":"label or id","to":"label or id","rel":""}\n' +
      '{"op":"move","node":"label or id","region":"region id","kind":"optional kind"}\n' +
      '{"op":"update","node":"label or id","summary":"new text"}\n' +
      '{"op":"delete","node":"label or id"}\n' +
      '{"op":"export","format":"svg|png|psd|json"}  (svg for Canva/Illustrator/Figma, psd for Photoshop with one layer per brain region)\n' +
      'Never invent facts that are not in the memory; say so if the memory is not enough.';
    return ai.json({ system: SYS(), user, max: 3500, signal });
  };

  // ---- 4. re-organise a batch of nodes ----
  ai.organize = async function (batch, labels, signal) {
    const nodes = batch.map((n) => ({ id: n.id, label: n.label, region: n.region, kind: n.kind, summary: n.summary }));
    const user =
      'Review these nodes. Fix the brain region and kind of each node only when it is clearly wrong, and propose strong missing links between nodes (they may also point to labels from the full list).\n' +
      'Nodes: ' + JSON.stringify(nodes) + '\nAll labels in the graph: ' + JSON.stringify(labels.slice(0, 300)) + '\n' +
      'Return JSON: {"moves":[{"id":"","region":"","kind":"","why":"short"}],"links":[{"from":"label","to":"label","rel":"","w":1}]}. At most 12 links.';
    return ai.json({ system: SYS(), user, max: 3000, signal });
  };

  ai.ping = async function () {
    const t = await ai.call({ system: 'Reply with the single word OK.', user: 'ping', max: 20 });
    return t.trim().slice(0, 40);
  };
})(window.BG);
