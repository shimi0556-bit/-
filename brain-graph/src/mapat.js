// Two-way bridge with "מפת הנפש" (mapat-hanefesh): import its JSON backup into the brain, export the brain back to its format.
(function (BG) {
  'use strict';
  const TYPE_IN = { value: 'value', emotion: 'emotion', belief: 'belief', need: 'need', behavior: 'action', person: 'person' };
  const TYPE_OUT = { value: 'value', goal: 'value', emotion: 'emotion', belief: 'belief', need: 'need', state: 'need', action: 'behavior', habit: 'behavior', skill: 'behavior', person: 'person' };
  const REL_LABEL = { leads: 'מוביל ל־', supports: 'מחזק את', conflicts: 'מתנגש עם', protects: 'מגן על', masks: 'מסתיר את', related: 'קשור ל־' };
  const REL_BACK = {};
  Object.keys(REL_LABEL).forEach((k) => { REL_BACK[REL_LABEL[k]] = k; });
  const LINK_RE = /\[\[([^\[\]\n|]{1,80})(?:\|([^\[\]\n]{1,80}))?\]\]/g;
  const MY_VALUES = [
    ['יצירה', 'לבנות דברים משלי: משחקים, תוכנות, סרטונים. לראות רעיון הופך למשהו שעובד באמת.'],
    ['מצוינות', 'שכל דבר שאני בונה ייצא טוב, מקצועי ויפה יותר מהקודם.'],
    ['למידה', 'ללמוד כל כלי עד שאני שולט בו, ולקחת מכל פרויקט משהו לפעם הבאה.'],
    ['סקרנות', 'לחקור מה קיים בעולם ומה עוד אפשר לעשות. לנסות כלים חדשים.'],
    ['יעילות', 'להגיע לתוצאה בלי סיבובים: תשובה קצרה, החלטה, ביצוע.'],
    ['עצמאות', 'כלים שעובדים אצלי, בסביבה שלי, גם בלי אינטרנט ובלי תלות באחרים.'],
    ['יופי', 'שמה שאני יוצר ייראה מרשים ויעשה רושם כבר ברגע הראשון.'],
    ['דיוק', 'שדברים ייראו ויתנהגו כמו במציאות, עד הפרט הקטן.'],
    ['נתינה', 'לבנות וללמד דברים שמועילים גם לאחרים.'],
    ['הבנת אנשים', 'להבין מה עובר על אדם אחר: מה הוא מרגיש ולמה הוא מגיב כך.'],
    ['סדר', 'שכל מה שבניתי יישמר מסודר ולא ילך לאיבוד.']
  ];
  const MY_LINKS = [['יעילות', 'conflicts', 'מצוינות'], ['למידה', 'supports', 'מצוינות'], ['סקרנות', 'leads', 'יצירה'], ['הבנת אנשים', 'supports', 'נתינה']];

  const M = (BG.mapat = {});
  M.isBackup = (d) => !!d && typeof d === 'object' && (d.app === 'mapat-hanefesh' || (Array.isArray(d.relations) && d.concepts && !d.nodes));
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

  // Merge a mapat backup into the graph. Same-name concepts are merged, nothing is overwritten.
  M.import = function (d) {
    if (!M.isBackup(d)) throw new Error('זה לא גיבוי של מפת הנפש');
    const concepts = Array.isArray(d.concepts) ? d.concepts : Object.values(d.concepts || {});
    const stats = { added: 0, merged: 0, links: 0, stories: 0 };
    const idMap = new Map();
    BG.snapshot();
    BG.batch(() => {
      for (const c of concepts) {
        if (!c || !String(c.name || '').trim()) continue;
        let n = BG.findByLabel(c.name);
        if (n) { n.count = (n.count || 1) + 1; if (!n.summary && c.note) n.summary = clip(c.note, 500); stats.merged++; }
        else { n = BG.addNode({ label: c.name, kind: TYPE_IN[c.type] || 'concept', summary: clip(c.note, 500) }); stats.added++; }
        idMap.set(c.id, n);
      }
      for (const r of Array.isArray(d.relations) ? d.relations : []) {
        const a = idMap.get(r.from), b = idMap.get(r.to);
        if (!a || !b || !REL_LABEL[r.type]) continue;
        const e = BG.addEdge(a.id, b.id, REL_LABEL[r.type], r.type === 'related' ? 1 : 2);
        if (e) { if (!e.mtype) e.mtype = r.type; if (r.note && !e.note) e.note = clip(r.note, 300); stats.links++; }
      }
      for (const s of Array.isArray(d.stories) ? d.stories : []) {
        const text = String(s.text || '');
        const title = String(s.title || '').trim() || clip(text.replace(/\[\[|\]\]/g, ''), 40);
        if (!title) continue;
        let st = BG.findByLabel(title);
        if (!st) {
          st = BG.addNode({ label: title, kind: 'memory', summary: clip(text.replace(/\[\[([^\]|]*)\|?[^\]]*\]\]/g, '$1'), 300), excerpt: text });
          st.origin = 'mapat-story';
          stats.stories++;
        }
        for (const m of text.matchAll(LINK_RE)) {
          const n = BG.findByLabel(m[1]);
          if (n && n !== st) BG.addEdge(st.id, n.id, 'מוזכר בסיפור', 1);
        }
      }
    });
    BG.layout.kick(1);
    return stats;
  };

  M.addMyValues = function () {
    const stats = { added: 0, merged: 0 };
    BG.snapshot();
    BG.batch(() => {
      const ids = {};
      for (const [name, note] of MY_VALUES) {
        let n = BG.findByLabel(name);
        if (n) stats.merged++; else { n = BG.addNode({ label: name, kind: 'value', summary: note }); stats.added++; }
        ids[name] = n;
      }
      for (const [a, t, b] of MY_LINKS) { const e = BG.addEdge(ids[a].id, ids[b].id, REL_LABEL[t], 2); if (e && !e.mtype) e.mtype = t; }
    });
    BG.layout.kick(1);
    return stats;
  };

  // Export in mapat's backup format: emotions/values/needs/behaviours/people/beliefs, their relations, and memories as stories.
  M.export = function () {
    const S = BG.state, pad = (n) => n.toString(36).padStart(4, '0');
    const num = (id) => parseInt(String(id).slice(1)) || 0;
    const cid = new Map(), concepts = [], stories = [], relations = [];
    for (const n of S.nodes) {
      const k = BG.kindById(n.kind);
      if (k.source) continue;
      if (n.kind === 'memory') {
        stories.push({ id: 's_bg' + pad(num(n.id)), title: n.label, date: new Date(n.created || Date.now()).toISOString().slice(0, 10), text: n.excerpt || n.summary || n.label, created: n.created || Date.now(), updated: Date.now() });
        continue;
      }
      const id = 'c_bg' + pad(num(n.id));
      cid.set(n.id, id);
      concepts.push({ id, name: n.label, type: TYPE_OUT[n.kind] || 'belief', note: [n.summary, n.notes].filter(Boolean).join('\n'), auto: false, created: n.created || Date.now() });
    }
    for (const e of S.edges) {
      const a = cid.get(e.from), b = cid.get(e.to);
      if (!a || !b) continue;
      const type = e.mtype || REL_BACK[e.rel] || 'related';
      relations.push({ id: 'r_bg' + pad(num(e.id)), from: a, to: b, type, note: e.note || (REL_BACK[e.rel] || e.mtype ? '' : e.rel || ''), storyId: null });
    }
    return { app: 'mapat-hanefesh', exported: new Date().toISOString(), version: 1, stories, concepts, relations, settings: {} };
  };
})(window.BG);
