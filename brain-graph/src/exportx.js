// Exports for drawing / editing programs: layered SVG (Canva, Illustrator, Figma, Inkscape), PNG, layered PSD (Photoshop), JSON backup.
(function (BG) {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FONT = 'Heebo, Arial, Helvetica, sans-serif';
  const BGCOL = '#16161a';

  function defsSVG() { return '<defs></defs>'; }
  const W3 = BG.W, H3 = BG.H;
  const P = (n) => BG.projectExport(n.x, n.y, n.z || 0, W3, H3);
  const depthA = (zc) => 0.4 + 0.6 * BG.clamp((zc + 330) / 660, 0, 1);
  function cloudSVG() {
    const out = [];
    for (let x = 196; x < 898; x += 15) for (let y = 84; y < 652; y += 15) {
      if (!BG.inBrain(x, y)) continue;
      const r = BG.regionAt(x, y); if (!r) continue;
      const g = r.layer === 'own' ? (r.id === 'cer' ? 1 : 2) : 0, h = BG.thickness(x, y, g);
      if (h < 8) continue;
      for (const z of [h * 0.97, -h * 0.97]) { const p = BG.projectExport(x, y, z, W3, H3); out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="0.8" fill="#8791bd" fill-opacity="' + (0.45 * depthA(p[3])).toFixed(2) + '"/>'); }
    }
    return out.join('');
  }
  function edgesSVG() {
    const out = [];
    for (const e of BG.state.edges) {
      const a = BG.nodeById(e.from), b = BG.nodeById(e.to);
      if (!a || !b || BG.isHidden(a) || BG.isHidden(b)) continue;
      const p = P(a), q = P(b);
      out.push('<path d="M' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' L' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + '" fill="none" stroke="#78788c" stroke-opacity="' + (0.4 * depthA((p[3] + q[3]) / 2)).toFixed(2) + '" stroke-width="' + Math.min(3, 0.7 + (e.w || 1) * 0.3).toFixed(2) + '"/>');
    }
    return out.join('');
  }
  // nodes of one family, far to near, each with its label when the label has room
  const taken = [];
  function nodesSVG(ids) {
    const ns = BG.state.nodes.filter((n) => ids.includes(n.region) && !BG.isHidden(n)).map((n) => ({ n, p: P(n) })).sort((u, v) => u.p[3] - v.p[3]);
    return ns.map(({ n, p }) => {
      const col = BG.regionById(n.region).color, src = BG.kindById(n.kind).source, r = BG.radius(n) * 0.8 * p[2], dp = depthA(p[3]);
      const shape = src ? '<rect x="' + (-r).toFixed(1) + '" y="' + (-r).toFixed(1) + '" width="' + (r * 2).toFixed(1) + '" height="' + (r * 2).toFixed(1) + '" rx="' + (r * 0.35).toFixed(1) + '" fill="#2a2a33" stroke="#8e8e9b"/>' : '<circle r="' + r.toFixed(1) + '" fill="' + col + '"/>';
      const w = n.label.length * 6.4 + 8, bx = p[0] - w / 2, by = p[1] + r + 2, show = !taken.some((t) => bx < t[0] + t[2] && bx + w > t[0] && by < t[1] + t[3] && by + 14 > t[1]);
      if (show) taken.push([bx, by, w, 14]);
      return '<g id="node-' + n.id + '" opacity="' + dp.toFixed(2) + '" transform="translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')">' + shape +
        (show ? '<text y="' + (r + 12).toFixed(1) + '" text-anchor="middle" font-size="11" font-family="' + FONT + '" fill="#8e8e9b">' + esc(n.label) + '</text>' : '') + '</g>';
    }).join('');
  }
  BG.buildLayers = function () {
    const L = [];
    taken.length = 0;
    L.push({ id: 'background', label: 'רקע', inner: '<rect width="' + W3 + '" height="' + H3 + '" fill="#16161a"/>' });
    if (BG.effOutline()) L.push({ id: 'brain', label: 'ענן המוח', inner: cloudSVG() });
    L.push({ id: 'edges', label: 'קשרים', inner: edgesSVG() });
    // most important (best connected) labels first so they win the room
    BG.state.nodes.slice().sort((u, v) => (v.deg || 0) - (u.deg || 0));
    for (const f of BG.FAMILIES) if (BG.state.nodes.some((n) => f.ids.includes(n.region) && !BG.isHidden(n))) L.push({ id: 'nodes-' + f.id, label: 'צמתים – ' + f.name, inner: nodesSVG(f.ids) });
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
