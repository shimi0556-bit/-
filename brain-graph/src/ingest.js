// Turning documents, pages and pasted text into nodes and links.
(function (BG) {
  'use strict';
  const STOP = new Set(('של על עם או גם כי אם לא כן הוא היא הם הן אני אתה את אנחנו זה זאת זו אלה אלו מה מי איך למה מתי אבל רק כל יש אין היה היו להיות עוד כמו אחרי לפני בין מן אל עד כך לכן שלא שזה אשר ' +
    'the and for are but not you all any can had her was one our out has have this that with from they will would there their what about which when your were been into more other than then them these some could also').split(/\s+/));

  const clip = (s, n) => String(s || '').trim().slice(0, n);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  BG.sleep = sleep;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('לא הצלחתי לטעון ' + src)); document.head.appendChild(s); });
  }
  async function readPdf(buf) {
    const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    if (!window.pdfjsLib) {
      await loadScript(CDN + 'pdf.min.js');
      const txt = await (await fetch(CDN + 'pdf.worker.min.js')).text();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    }
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out.push(tc.items.map((it) => it.str).join(' '));
    }
    return out.join('\n\n');
  }
  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readDocx(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder('utf-8');
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('קובץ DOCX לא תקין');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      if (name === 'word/document.xml') {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const raw = u8.subarray(start, start + csize);
        const xml = dec.decode(method === 0 ? raw : await inflateRaw(raw));
        return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      }
      p += 46 + nl + xl + cl;
    }
    throw new Error('לא נמצא טקסט בקובץ DOCX');
  }
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,svg,iframe').forEach((n) => n.remove());
    const title = (doc.querySelector('title') || {}).textContent || '';
    const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    return { title: title.trim(), text: (root ? root.textContent : '').replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim() };
  }

  BG.readFile = async function (file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return { title: file.name.replace(/\.pdf$/i, ''), text: await readPdf(await file.arrayBuffer()) };
    if (ext === 'docx') return { title: file.name.replace(/\.docx$/i, ''), text: await readDocx(await file.arrayBuffer()) };
    const raw = await file.text();
    if (ext === 'html' || ext === 'htm') { const r = htmlToText(raw); return { title: r.title || file.name, text: r.text }; }
    if (ext === 'json') { try { return { title: file.name, text: JSON.stringify(JSON.parse(raw), null, 1) }; } catch (e) { /* plain */ } }
    return { title: file.name.replace(/\.[^.]+$/, ''), text: raw };
  };

  BG.fetchPage = async function (url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('כתובת לא תקינה: ' + url);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      const html = await r.text();
      const out = htmlToText(html);
      if (out.text.length < 80) throw new Error('empty');
      return { title: out.title || url, text: out.text, url };
    } catch (e) {
      if (!BG.ai.settings.reader) throw new Error('הדפדפן חסם את הקריאה לאתר (CORS). הדבק את הטקסט ידנית, או אפשר "קורא חיצוני" בהגדרות.');
    }
    let r;
    try { r = await fetch('https://r.jina.ai/' + url); } catch (e) { throw new Error('לא הצלחתי להביא את האתר (גם דרך הקורא החיצוני). בדוק את החיבור.'); }
    if (!r.ok) throw new Error('הקורא החיצוני נכשל (' + r.status + ') עבור ' + url);
    const t = await r.text();
    const m = t.match(/^Title:\s*(.+)$/m);
    const body = t.replace(/^[\s\S]*?Markdown Content:\s*/, '');
    return { title: (m && m[1].trim()) || url, text: body, url };
  };

  function chunk(text, size, maxChunks) {
    const parts = text.split(/\n{2,}/), out = [];
    let cur = '';
    for (const p of parts) {
      if (cur.length + p.length > size && cur) { out.push(cur); cur = ''; if (out.length >= maxChunks) break; }
      cur += (cur ? '\n\n' : '') + p.slice(0, size);
    }
    if (cur && out.length < maxChunks) out.push(cur);
    return out.length ? out : [text.slice(0, size)];
  }

  // ---- offline extractor (no API key) ----
  function regionOfTerm(term) {
    const t = BG.key(term);
    for (const id in BG.LEXICON) if (BG.LEXICON[id].some((w) => t.includes(BG.key(w)) || BG.key(w).includes(t))) return id;
    return 'tem';
  }
  BG.localExtract = function (text, title) {
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+|\n+/).filter((s) => s.length > 12).slice(0, 600);
    const freq = new Map(), first = new Map();
    const toks = (s) => (s.match(/[\p{L}\p{N}'-]+/gu) || []).map((w) => w.replace(/^[-']+|[-']+$/g, '')).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
    const sentTerms = sentences.map((s) => {
      const t = toks(s), terms = new Set(t.map((w) => w.toLowerCase()));
      for (let i = 0; i < t.length - 1; i++) terms.add(t[i].toLowerCase() + ' ' + t[i + 1].toLowerCase());
      return terms;
    });
    sentTerms.forEach((terms, i) => terms.forEach((w) => { freq.set(w, (freq.get(w) || 0) + 1); if (!first.has(w)) first.set(w, sentences[i]); }));
    let ranked = [...freq.entries()].filter(([w, c]) => (w.includes(' ') ? c >= 3 : c >= 2 || freq.size < 30)).sort((a, b) => (b[1] * (b[0].includes(' ') ? 1.6 : 1)) - (a[1] * (a[0].includes(' ') ? 1.6 : 1)));
    const picked = [];
    for (const [w] of ranked) {
      if (picked.length >= 14) break;
      if (picked.some((p) => p.includes(w) || w.includes(p))) continue;
      picked.push(w);
    }
    const nodes = picked.map((w) => ({ label: w, kind: 'concept', region: regionOfTerm(w), summary: clip(first.get(w), 160) }));
    const links = [], seen = new Set();
    sentTerms.forEach((terms) => {
      const here = picked.filter((p) => terms.has(p));
      for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
        const k = here[i] + '|' + here[j];
        if (!seen.has(k) && links.length < 30) { seen.add(k); links.push({ from: here[i], to: here[j], rel: 'מופיעים יחד', w: 1 }); }
      }
    });
    return { title, summary: clip(sentences[0], 200), region: 'tem', nodes, links };
  };

  function applyExtraction(src, data, stats, touched) {
    const local = new Map();
    for (const o of data.nodes || []) {
      if (!o || !o.label) continue;
      const k = BG.key(o.label);
      if (!k) continue;
      let n = BG.findByLabel(o.label);
      if (n) { n.count = (n.count || 1) + 1; if (!n.summary && o.summary) n.summary = clip(o.summary, 500); stats.merged++; }
      else { n = BG.addNode({ label: o.label, kind: o.kind, region: o.region, summary: o.summary }); stats.added++; }
      local.set(k, n);
      touched.add(n.id);
      BG.addEdge(src.id, n.id, 'מכיל', 1);
    }
    for (const l of data.links || []) {
      if (!l) continue;
      const a = local.get(BG.key(l.from)) || BG.findByLabel(l.from), b = local.get(BG.key(l.to)) || BG.findByLabel(l.to);
      if (a && b && a !== b) { BG.addEdge(a.id, b.id, l.rel, l.w); stats.links++; touched.add(a.id); touched.add(b.id); }
    }
  }

  // source: {title, text, url?, kind?}
  BG.ingest = async function (source, opt) {
    opt = opt || {};
    const progress = opt.progress || (() => {});
    const useAI = opt.useAI !== false && BG.ai.ready();
    const text = String(source.text || '').trim();
    if (text.length < 20) throw new Error('אין מספיק טקסט במקור "' + (source.title || '') + '"');
    const kind = source.url ? 'url' : 'doc';
    const label = clip(source.title || text.slice(0, 40), 70);
    const stats = { added: 0, merged: 0, links: 0, ai: useAI };
    const touched = new Set();
    let src = BG.findSource(label);
    BG.snapshot();
    BG.batch(() => {
      if (!src) src = BG.addNode({ label, kind, url: source.url, excerpt: text.slice(0, 1500) });
      else src.count = (src.count || 1) + 1;
    });
    touched.add(src.id);
    const chunks = chunk(text, 14000, 4);
    for (let i = 0; i < chunks.length; i++) {
      progress((useAI ? 'AI קורא' : 'חילוץ מקומי') + ' – חלק ' + (i + 1) + ' מתוך ' + chunks.length + '…');
      let data;
      if (useAI) {
        const existing = BG.state.nodes.filter((n) => !BG.kindById(n.kind).source).sort((a, b) => (b.deg || 0) - (a.deg || 0)).map((n) => n.label);
        data = await BG.ai.extract(chunks[i], { title: label, url: source.url }, existing, opt.signal);
      } else data = BG.localExtract(chunks[i], label);
      BG.batch(() => {
        if (i === 0) {
          if (data.summary) src.summary = clip(data.summary, 500);
          if (BG.regionById(data.region)) src.region = data.region;
        }
        applyExtraction(src, data, stats, touched);
      });
      BG.layout.kick(1);
    }
    return { stats, touched: [...touched], source: src };
  };
})(window.BG);
