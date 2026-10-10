// Exports for drawing / editing programs: layered SVG (Canva, Illustrator, Figma, Inkscape), PNG, layered PSD (Photoshop), JSON backup.
(function (BG) {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FONT = 'Heebo, Arial, Helvetica, sans-serif';
  const BGCOL = '#0b1020';

  function defsSVG() {
    return '<defs>' + BG.REGIONS.map((r) => '<radialGradient id="aura-' + r.id + '"><stop offset="0" stop-color="' + r.color + '" stop-opacity="0.5"/><stop offset="0.55" stop-color="' + r.color + '" stop-opacity="0.2"/><stop offset="1" stop-color="' + r.color + '" stop-opacity="0"/></radialGradient>').join('') + '</defs>';
  }
  function brainSVG() {
    return '<g fill="none" stroke="#6c8cff" stroke-opacity="0.55" stroke-width="1.6" stroke-dasharray="2 6" stroke-linecap="round">' +
      [BG.STEM, BG.CEREBELLUM, BG.CEREBRUM].map((d) => '<path d="' + d + '"/>').join('') + '</g>';
  }
  function aurasSVG() {
    const R = {};
    BG.REGIONS.forEach((r) => { R[r.id] = BG.auraR(r); });
    return BG.state.nodes.map((n) => '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + R[n.region].toFixed(1) + '" fill="url(#aura-' + n.region + ')"/>').join('');
  }
  function regionsSVG() {
    return BG.REGIONS.filter((r) => r.count).map((r) =>
      '<text x="' + r.cx + '" y="' + (r.cy + 4) + '" text-anchor="middle" font-size="11.5" font-weight="600" font-family="' + FONT + '" fill="' + r.color + '" fill-opacity="0.6" stroke="' + BGCOL + '" stroke-width="3" paint-order="stroke">' + esc(r.name) + '</text>').join('');
  }
  function edgesSVG() {
    const out = [];
    BG.state.edges.forEach((e, i) => {
      const a = BG.nodeById(e.from), b = BG.nodeById(e.to);
      if (!a || !b) return;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, c = 0.12 * (i % 2 ? 1 : -1);
      const src = BG.kindById(a.kind).source || BG.kindById(b.kind).source;
      out.push('<path d="M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ' Q' + (mx - dy * c).toFixed(1) + ',' + (my + dx * c).toFixed(1) + ' ' + b.x.toFixed(1) + ',' + b.y.toFixed(1) +
        '" fill="none" stroke="' + BG.regionById(a.region).color + '" stroke-opacity="' + (src ? 0.18 : 0.5) + '" stroke-width="' + (0.8 + (e.w || 1) * 0.4).toFixed(2) + '"' + (src ? ' stroke-dasharray="3 4"' : '') + '/>');
    });
    return out.join('');
  }
  function nodesSVG(regionId) {
    return BG.state.nodes.filter((n) => n.region === regionId).map((n) => {
      const r = BG.radius(n), col = BG.regionById(n.region).color, src = BG.kindById(n.kind).source;
      const shape = src
        ? '<rect x="' + (-r) + '" y="' + (-r) + '" width="' + r * 2 + '" height="' + r * 2 + '" rx="2.5" fill="#0f1630" stroke="' + col + '" stroke-width="2"/>'
        : '<circle r="' + r + '" fill="' + col + '" stroke="' + col + '"/>';
      return '<g id="node-' + n.id + '" transform="translate(' + n.x.toFixed(1) + ' ' + n.y.toFixed(1) + ')">' + shape +
        '<text y="' + (r + 11) + '" text-anchor="middle" font-size="10" font-family="' + FONT + '" fill="#e8ecff" stroke="' + BGCOL + '" stroke-width="2.6" paint-order="stroke">' + esc(n.label) + '</text></g>';
    }).join('');
  }

  BG.buildLayers = function () {
    const L = [];
    L.push({ id: 'background', label: 'רקע', inner: '<rect width="' + BG.W + '" height="' + BG.H + '" fill="' + BGCOL + '"/>' });
    if (BG.view.outline) L.push({ id: 'brain', label: 'מתאר מוח', inner: brainSVG() });
    L.push({ id: 'aura', label: 'זוהר הערכים', inner: aurasSVG() });
    L.push({ id: 'edges', label: 'קשרים', inner: edgesSVG() });
    if (BG.view.labels) L.push({ id: 'regions', label: 'שמות אזורים', inner: regionsSVG() });
    for (const r of BG.REGIONS) if (BG.state.nodes.some((n) => n.region === r.id)) L.push({ id: 'nodes-' + r.id, label: 'צמתים – ' + r.name, inner: nodesSVG(r.id) });
    return L;
  };
  BG.layersToSVG = function (layers, opt) {
    opt = opt || {};
    const body = layers.filter((l) => !(opt.transparent && l.id === 'background'))
      .map((l) => '<g id="' + l.id + '" inkscape:groupmode="layer" inkscape:label="' + esc(l.label) + '">' + l.inner + '</g>').join('\n');
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ' + BG.W + ' ' + BG.H + '" width="' + BG.W + '" height="' + BG.H + '">' + defsSVG() + '\n' + body + '\n</svg>';
  };

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  BG.download = download;

  function svgToCanvas(svg, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(BG.W * scale); c.height = Math.round(BG.H * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('הרנדור של ה-SVG נכשל')); };
      img.src = url;
    });
  }

  // ---------- PSD (Photoshop) writer: RGB 8-bit, RLE layers with Unicode names ----------
  function packBits(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      let j = i + 1;
      while (j < n && j - i < 128 && src[j] === src[i]) j++;
      if (j - i >= 2) { out.push(257 - (j - i), src[i]); i = j; }
      else {
        let k = i + 1;
        while (k < n && k - i < 128 && !(k + 1 < n && src[k] === src[k + 1])) k++;
        out.push(k - i - 1);
        for (let m = i; m < k; m++) out.push(src[m]);
        i = k;
      }
    }
    return out;
  }
  class BW {
    constructor() { this.parts = []; this.len = 0; }
    u8(v) { this.bytes([v & 255]); }
    u16(v) { this.bytes([(v >> 8) & 255, v & 255]); }
    u32(v) { this.bytes([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
    i16(v) { this.u16(v < 0 ? v + 65536 : v); }
    str(s) { this.bytes(Array.from(s).map((c) => c.charCodeAt(0))); }
    bytes(a) { const u = a instanceof Uint8Array ? a : Uint8Array.from(a); this.parts.push(u); this.len += u.length; }
    zeros(n) { this.bytes(new Uint8Array(n)); }
    concat() { const out = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
  }
  function layerChannels(img, x0, y0, x1, y1, W) {
    // returns 4 encoded channels (R,G,B,A) for the rect, RLE compressed
    const w = x1 - x0, h = y1 - y0, chans = [];
    for (const c of [0, 1, 2, 3]) {
      const rows = [];
      for (let y = 0; y < h; y++) {
        const row = new Uint8Array(w);
        for (let x = 0; x < w; x++) row[x] = img.data[((y0 + y) * W + x0 + x) * 4 + c];
        rows.push(packBits(row));
      }
      const w2 = new BW();
      w2.u16(1);
      rows.forEach((r) => w2.u16(r.length));
      rows.forEach((r) => w2.bytes(r));
      chans.push(w2.concat());
    }
    return chans;
  }
  function buildPSD(W, H, layers, composite) {
    const recs = [], datas = [];
    for (const L of layers) {
      const ctx = L.canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, W, H);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img.data[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
      if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
      const chans = layerChannels(img, x0, y0, x1, y1, W);
      const rec = new BW();
      rec.u32(y0); rec.u32(x0); rec.u32(y1); rec.u32(x1);
      rec.u16(4);
      [0, 1, 2, -1].forEach((id, i) => { rec.i16(id); rec.u32(chans[i].length); });
      rec.str('8BIM'); rec.str('norm'); rec.u8(255); rec.u8(0); rec.u8(0); rec.u8(0);
      // extra data: mask(4) + blending ranges(4) + pascal name + luni block
      const pname = new TextEncoder().encode(L.ascii.slice(0, 31));
      const pad = (4 - ((1 + pname.length) % 4)) % 4;
      const units = Array.from(L.name).flatMap((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]; });
      let ldata = 4 + units.length * 2;
      const lpad = (4 - (ldata % 4)) % 4;
      ldata += lpad;
      const extra = new BW();
      extra.u32(0); extra.u32(0);
      extra.u8(pname.length); extra.bytes(pname); extra.zeros(pad);
      extra.str('8BIM'); extra.str('luni'); extra.u32(ldata); extra.u32(units.length);
      units.forEach((u) => extra.u16(u)); extra.zeros(lpad);
      rec.u32(extra.len); rec.bytes(extra.concat());
      recs.push(rec.concat());
      datas.push(chans);
    }
    const li = new BW();
    li.i16(layers.length);
    recs.forEach((r) => li.bytes(r));
    datas.forEach((chs) => chs.forEach((c) => li.bytes(c)));
    if (li.len % 2) li.u8(0);
    const lmi = new BW();
    lmi.u32(li.len); lmi.bytes(li.concat()); lmi.u32(0);

    const out = new BW();
    out.str('8BPS'); out.u16(1); out.zeros(6); out.u16(3); out.u32(H); out.u32(W); out.u16(8); out.u16(3);
    out.u32(0); out.u32(0);
    out.u32(lmi.len); out.bytes(lmi.concat());
    out.u16(0);
    const cimg = composite.getContext('2d').getImageData(0, 0, W, H).data;
    for (let c = 0; c < 3; c++) {
      const plane = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) plane[i] = cimg[i * 4 + c];
      out.bytes(plane);
    }
    return out.concat();
  }
  BG._buildPSD = buildPSD;

  BG.exporters = {
    async svg(opt) {
      const svg = BG.layersToSVG(BG.buildLayers(), opt);
      download(new Blob([svg], { type: 'image/svg+xml' }), 'brain-graph.svg');
      return 'brain-graph.svg';
    },
    async png(opt) {
      const layers = BG.buildLayers();
      const c = await svgToCanvas(BG.layersToSVG(layers, opt), 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      download(blob, 'brain-graph.png');
      return 'brain-graph.png';
    },
    async psd() {
      const scale = 1.6, layers = BG.buildLayers();
      const W = Math.round(BG.W * scale), H = Math.round(BG.H * scale);
      const out = [];
      let i = 0;
      for (const l of layers) {
        const canvas = await svgToCanvas(BG.layersToSVG([l]), scale);
        out.push({ name: l.label, ascii: (l.id.replace(/[^\x20-\x7e]/g, '_') || 'layer') + '', canvas });
        i++;
      }
      const composite = await svgToCanvas(BG.layersToSVG(layers), scale);
      const bytes = buildPSD(W, H, out, composite);
      download(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), 'brain-graph.psd');
      return 'brain-graph.psd';
    },
    async json() {
      download(new Blob([JSON.stringify(BG.serialize(), null, 1)], { type: 'application/json' }), 'brain-graph-backup.json');
      return 'brain-graph-backup.json';
    }
  };
  BG.runExport = async function (fmt, opt) {
    if (!BG.exporters[fmt]) throw new Error('פורמט לא מוכר: ' + fmt);
    return BG.exporters[fmt](opt);
  };
  BG._svgToCanvas = svgToCanvas;
})(window.BG);
