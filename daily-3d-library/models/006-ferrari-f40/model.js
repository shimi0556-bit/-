// #006 — Ferrari F40 (1987). Built entirely in code with the library kit (engine/kit.js). Units are metres.
// Axes: +x = forward, +y = up, +z = right (passenger side); left-hand drive, the driver sits at -z.
// s = +1 right, -1 left. Origin: ground, mid-wheelbase. The V8 sits behind the cabin (-x), the radiator and spare in the nose.
window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, samples, cap, lerp, smooth, clamp, instances } = K;
    const PI = Math.PI;
    const v3 = (p) => (p.isVector3 ? p : V3(...p));
    const put = (geo, mat, parent, pos, rot, o = {}) => { if (rot && !Array.isArray(rot)) { o = rot; rot = null; } return mesh(geo, mat, { parent, pos: pos || undefined, rot: rot || undefined, ...o }); };
    const rod = (parent, a, b, r, mat, o = {}) => { a = v3(a); b = v3(b); const d = b.clone().sub(a); const m = mesh(G.cyl(o.r2 ?? r, r, d.length(), o.seg || 10, 'y'), mat, { parent, name: o.name, cast: o.cast }); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()); return m; };
    const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
    const sideHe = (s) => (s > 0 ? 'ימין' : 'שמאל'), sideEn = (s) => (s > 0 ? 'right' : 'left');
    const P = (parent, he, en, mat, desc, o) => part(parent, { he, en, mat, desc }, o);
    const bolts = (parent, list, size = 0.006, mat = M.steel()) => instances(G.bolt(size), mat, list.map((l) => ({ pos: l.pos, rot: l.rot || [0, 0, 0] })), { parent });
    const rivets = (parent, list, r = 0.004, mat = M.darkSteel()) => instances(G.rivet(r), mat, list.map((l) => ({ pos: l.pos, rot: l.rot || [0, 0, 0] })), { parent, cast: false });
    // monotone cubic through points [[x, y]…]
    const table = (pts) => {
      const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = new Array(n).fill(0);
      const d = []; for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
      m[0] = d[0]; m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
      for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b; if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
      return (x) => {
        if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
        let i = 0; while (x > xs[i + 1]) i++;
        const hh = xs[i + 1] - xs[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
      };
    };

    // ------------------------------------------------------------------ key dimensions (Ferrari: 4.358 x 1.970 x 1.124 m, wheelbase 2.450 m, track 1.594 / 1.606 m)
    const AXF = 1.225, AXR = -1.225, TRF = 0.314, TRR = 0.333;   // axle x; rolling radius of 245/40 ZR17 and 335/35 ZR17
    const HWF = 0.797, HWR = 0.803;                              // half track
    const NOSE = 2.10, TAIL = -2.258;                            // body tips
    const PAINT = new THREE.MeshPhysicalMaterial({ color: 0xc4130f, metalness: 0.28, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, name: 'רוסו קורסה (Rosso Corsa) + שכבת לכה' });
    const EDGE = M.paintFlat(0x2a0605, 0.75);
    const BLK = M.black(), CHROME = M.chrome(), SATIN = M.satin(), STEEL = M.steel(), DSTEEL = M.darkSteel(), CAST = M.castIron(), ALU = M.castAlu();
    const IRON = M.metal(0x24262a, 0.5);
    const rigWheels = [], spinners = [];

    // ================================================================== BODY SHELL
    // One lofted shell: a grid of columns (x stations) x rows (a half-section from the left sill over the roof to the right sill).
    // Named section lines (roof edge K1, belt K2, shoulder K3, door bottom, sill K4…) keep their index in every column, so
    // windows, doors, hood and engine lid are exact sub-patches of the same grid with no stair-stepped edges.
    const body = sys('body'), doorsSys = sys('doors'), glassSys = sys('glass');
    const SQ = (u, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), n)), 1 / n);
    const Wp = (x) => {
      if (x > 1.5) return 0.985 * SQ((x - 1.5) / (NOSE - 1.5), 5.0);
      if (x < -1.45) { const base = 0.985 - 0.185 * smooth(-1.45, -2.2, x), d = (TAIL + 0.07 - x) / 0.07; return base * (d > 0 ? SQ(d, 3.2) : 1); }
      return 0.985 - 0.045 * smooth(-1.0, -0.3, x) + 0.045 * smooth(0.4, 1.3, x);
    };
    const archY = (ax, hw, top, x) => { const d = (x - ax) / hw; return Math.abs(d) < 1 ? 0.12 + (top - 0.12) * Math.sqrt(1 - d * d) : 0; };
    const ARCF = [0.37, 0.61], ARCR = [0.39, 0.63];
    const Ll = (x) => Math.max(0.11 + 0.03 * smooth(1.5, NOSE, x) + 0.13 * smooth(-1.85, TAIL, x), archY(AXF, ARCF[0], ARCF[1], x), archY(AXR, ARCR[0], ARCR[1], x));
    const Tt = table([[-2.258, 0.84], [-2.24, 0.865], [-2.15, 0.875], [-1.9, 0.87], [-1.74, 0.857], [-1.3, 0.935], [-1.0, 1.01], [-0.8, 1.07], [-0.66, 1.098], [-0.4, 1.115], [-0.1, 1.124], [0.2, 1.12], [0.4, 1.04], [0.6, 0.96], [0.8, 0.895], [0.92, 0.86], [1.1, 0.815], [1.4, 0.745], [1.7, 0.65], [1.9, 0.57], [2.0, 0.52], [2.06, 0.47], [2.095, 0.43], [2.1, 0.3]]);
    const crown = table([[-2.258, 0.03], [-1.74, 0.03], [-1.3, 0.03], [-0.8, 0.035], [-0.66, 0.03], [-0.1, 0.03], [0.2, 0.035], [0.5, 0.045], [0.92, 0.04], [1.4, 0.03], [1.9, 0.025], [2.1, 0.02]]);
    const Zrt = table([[-2.258, 0.5], [-2.1, 0.62], [-1.74, 0.66], [-1.4, 0.66], [-1.0, 0.58], [-0.8, 0.5], [-0.66, 0.49], [-0.4, 0.5], [0, 0.5], [0.2, 0.51], [0.5, 0.57], [0.9, 0.66], [1.2, 0.74], [1.7, 0.75], [2.0, 0.7], [2.1, 0.55]]);
    const Zbt = table([[-2.258, 0.5], [-2.1, 0.8], [-1.7, 0.86], [-1.2, 0.88], [-0.9, 0.88], [-0.65, 0.86], [-0.4, 0.86], [0, 0.87], [0.5, 0.88], [0.8, 0.87], [1.2, 0.88], [1.6, 0.86], [1.9, 0.76], [2.1, 0.4]]);
    const Ybt = table([[-2.258, 0.75], [-2.1, 0.89], [-1.7, 0.92], [-1.4, 0.95], [-1.1, 0.93], [-0.9, 0.88], [-0.7, 0.8], [-0.4, 0.775], [0, 0.77], [0.5, 0.77], [0.8, 0.77], [1.0, 0.79], [1.3, 0.78], [1.7, 0.68], [1.9, 0.58], [2.1, 0.42]]);
    const Ymt = table([[-2.258, 0.5], [-1.2, 0.55], [-0.4, 0.5], [0.8, 0.47], [1.5, 0.45], [2.1, 0.3]]);
    // half-section lines, top centre → sill: [name, segment, u]; segment 1 = top (centre → roof edge), 2 = K1 → K2, 3 = K2 → K3, 4 = K3 → K4 (door bottom, sill)
    const HL = [['c', 1, 0]];
    for (let k = 1; k <= 6; k++) HL.push(['r' + k, 1, k / 7]);
    HL.push(['K1', 2, 0], ['K1b', 2, 0.09]);
    for (let k = 1; k <= 3; k++) HL.push(['w' + k, 2, 0.09 + (0.91 * k) / 4]);
    HL.push(['K2', 3, 0], ['b1', 3, 0.5], ['K3', 4, 0], ['dl', 4, 0.62], ['dg', 4, 0.66], ['e1', 4, 0.82], ['K4', 5, 0]);
    const HI = {}; HL.forEach((l, i) => { HI[l[0]] = i; });
    const NH = HL.length, MID = NH - 1, NV = 2 * (NH - 1) + 1;
    const colPts = (x) => {
      const W = Wp(x), L = Ll(x), T = Tt(x);
      const Yr = T - crown(x), Yb = Math.min(Ybt(x), T - 0.0 + 0.1), Ym = Math.min(Math.max(0.34, Ymt(x), L + 0.07), Yb - 0.04), Lc = Math.min(L, Ym - 0.04);
      const Zr = Math.min(Zrt(x), W * 0.66), Zb = Math.min(Zbt(x), W * 0.93), Zm = W, Zl = W * (0.955 + 0.02 * smooth(-0.8, -1.2, x) * smooth(TAIL, -1.9, x));
      const curve = new THREE.CatmullRomCurve3([V3(-Zr, Yr, 0), V3(0, T, 0), V3(Zr, Yr, 0), V3(Zb, Yb, 0), V3(Zm, Ym, 0), V3(Zl, Lc, 0)], false, 'centripetal');
      const fK = 0.09;
      const half = HL.map(([nm, seg, u]) => { if (nm === 'K1b') u = fK; else if (nm[0] === 'w') u = fK + (1 - fK) * (+nm[1] / 4); return curve.getPoint(Math.min(1, (seg + u) / 5)); });
      const out = new Array(NV);
      half.forEach((p, k) => { out[MID + k] = V3(x, p.y, p.x); out[MID - k] = V3(x, p.y, -p.x); });
      return out;
    };
    // x stations of the openings
    const X_WS0 = 0.20, X_WS1 = 0.92;           // windshield: base at the cowl (0.92), top edge at the roof (0.20)
    const X_RF1 = -0.66;                        // roof rear edge / start of the engine cover
    const X_LEXAN = -1.74;                      // rear end of the louvred polycarbonate cover (the tail deck behind it is painted)
    const XD0 = -0.36, XD1 = 0.77, XGAP = 0.004, XG0 = -0.30, XG1 = 0.66;
    const XQ0 = -0.86, XQ1 = -0.40;
    const SEAM_X = [XD0, XD1, XG0, XG1, XQ0, XQ1, X_WS0, X_WS1, X_RF1, X_LEXAN, -2.2, 1.95, 0.2, 0.5];
    const XS = samples(TAIL, NOSE, (x) => { const d = Math.min(x - TAIL, NOSE - x); const base = x > -1.8 && x < 1.5 ? 0.04 : 0.06; return Math.min(base, 0.004 + 0.05 * d); }, SEAM_X);
    const GP = XS.map(colPts), NI = XS.length;
    const OUTC = (x) => V3(clamp(x, -1.4, 1.4), 0.5, 0);
    const GN = GP.map((col, i) => col.map((p, j) => {
      const a = GP[Math.min(i + 1, NI - 1)][j], b = GP[Math.max(i - 1, 0)][j], c = col[Math.min(j + 1, NV - 1)], d = col[Math.max(j - 1, 0)];
      const n = a.clone().sub(b).cross(c.clone().sub(d)); const o = p.clone().sub(OUTC(XS[i]));
      if (n.lengthSq() < 1e-14) n.copy(o);
      n.normalize(); if (n.dot(o) < 0) n.negate(); return n;
    }));
    const rowLo = (j) => (j >= MID ? j - MID : MID - j - 1), rowHi = (j) => (j >= MID ? j - MID + 1 : MID - j);
    // build a mesh from the cells where keep(xc, lo, hi, i, j) is true. off pushes along the normals, thick solidifies inward
    const gridGeo = (keep, o = {}) => {
      const off = o.off || 0, th = o.thick || 0;
      const ok = (i, j) => i >= 0 && j >= 0 && i < NI - 1 && j < NV - 1 && keep((XS[i] + XS[i + 1]) / 2, rowLo(j), rowHi(j), i, j);
      const pos = [], nor = [], uv = [], ind = [], map = new Map();
      const vtx = (i, j, layer) => { const k = (i * NV + j) * 2 + layer; let r = map.get(k); if (r === undefined) { const p = GP[i][j], n = GN[i][j], d = layer ? off - th : off; pos.push(p.x + n.x * d, p.y + n.y * d, p.z + n.z * d); nor.push(layer ? -n.x : n.x, layer ? -n.y : n.y, layer ? -n.z : n.z); uv.push(p.x, p.y + p.z); r = pos.length / 3 - 1; map.set(k, r); } return r; };
      for (let layer = 0; layer < (th > 0 ? 2 : 1); layer++) for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NV - 1; j++) {
        if (!ok(i, j)) continue;
        const pa = GP[i][j], pb = GP[i + 1][j], pc = GP[i + 1][j + 1], pd = GP[i][j + 1];
        const fn = pc.clone().sub(pa).cross(pd.clone().sub(pb)); const na = GN[i][j].clone().add(GN[i + 1][j + 1]);
        let ccw = fn.dot(na) > 0; if (layer) ccw = !ccw;
        const a = vtx(i, j, layer), b = vtx(i + 1, j, layer), c = vtx(i + 1, j + 1, layer), d = vtx(i, j + 1, layer);
        if (ccw) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c);
      }
      const skin = ind.length;
      if (th > 0) {
        const wall = (i0, j0, i1, j1, ci, cj) => {
          const q = (i, j, d) => GP[i][j].clone().addScaledVector(GN[i][j], off - d * th);
          const a = q(i0, j0, 0), b = q(i1, j1, 0), c = q(i1, j1, 1), d = q(i0, j0, 1);
          const cen = GP[ci][cj].clone().add(GP[ci + 1][cj + 1]).multiplyScalar(0.5);
          const fn = b.clone().sub(a).cross(d.clone().sub(a)); if (fn.lengthSq() < 1e-16) return;
          const away = a.clone().add(b).multiplyScalar(0.5).sub(cen); const n = fn.normalize(); const flip = n.dot(away) < 0; if (flip) n.negate();
          const base = pos.length / 3; for (const p of [a, b, c, d]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(0, 0); }
          if (!flip) ind.push(base, base + 3, base + 1, base + 1, base + 3, base + 2); else ind.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
        };
        for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NV - 1; j++) {
          if (!ok(i, j)) continue;
          if (!ok(i, j - 1)) wall(i, j, i + 1, j, i, j);
          if (!ok(i, j + 1)) wall(i, j + 1, i + 1, j + 1, i, j);
          if (!ok(i - 1, j) && i > 0) wall(i, j, i, j + 1, i, j);
          if (!ok(i + 1, j) && i < NI - 2) wall(i + 1, j, i + 1, j + 1, i, j);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(ind); g.addGroup(0, skin, 0); if (ind.length > skin) g.addGroup(skin, ind.length - skin, 1);
      return g;
    };
    // ---- the openings, as cell tests
    const inX = (x, a, b) => x > a && x < b;
    const isWindshield = (x, lo, hi) => inX(x, X_WS0, X_WS1) && hi <= HI.K1;
    const isLexan = (x, lo, hi) => inX(x, X_LEXAN, X_RF1) && hi <= HI.K1;
    const isDoorGlass = (x, lo, hi) => inX(x, XG0, XG1) && lo >= HI.K1b && hi <= HI.K2;
    const isQuarter = (x, lo, hi) => inX(x, XQ0, XQ1) && lo >= HI.K1b && hi <= HI.K2;
    const isHood = (x, lo, hi) => inX(x, X_WS1, NOSE + 1) && hi <= HI.K1;
    const isLid = (x, lo, hi) => inX(x, TAIL - 1, X_RF1) && hi <= HI.K1;
    const isDoorCell = (x, lo, hi) => (inX(x, XD0, XD1) && lo >= HI.K2 && hi <= HI.dl) || (inX(x, XD0, XD1) && lo >= HI.K1b && hi <= HI.K2 && !isDoorGlass(x, lo, hi));
    const isDoorHole = (x, lo, hi) => (inX(x, XD0 - XGAP, XD1 + XGAP) && lo >= HI.K2 && hi <= HI.dg) || (inX(x, XD0 - XGAP, XD1 + XGAP) && lo >= HI.K1b && hi <= HI.K2);
    const shellKeep = (x, lo, hi) => !(isWindshield(x, lo, hi) || isLid(x, lo, hi) || isHood(x, lo, hi) || isDoorHole(x, lo, hi) || isQuarter(x, lo, hi));
    // ---- helpers that follow the grid lines exactly
    const jOf = (name, s) => (s > 0 ? MID + HI[name] : MID - HI[name]);
    const colAt = (x) => { let b = 0; for (let i = 0; i < NI; i++) if (Math.abs(XS[i] - x) < Math.abs(XS[b] - x)) b = i; return b; };
    const rowLine = (j, xa, xb, off = 0) => { const out = []; for (let i = 0; i < NI; i++) if (XS[i] >= xa - 1e-6 && XS[i] <= xb + 1e-6) out.push(GP[i][j].clone().addScaledVector(GN[i][j], off)); return out; };
    const colLine = (i, ja, jb, off = 0) => { const out = [], d = Math.sign(jb - ja) || 1; for (let j = ja; d > 0 ? j <= jb : j >= jb; j += d) out.push(GP[i][j].clone().addScaledVector(GN[i][j], off)); return out; };
    const tubeAlong = (pts, r, seg = 8) => G.tube(pts, r, Math.max(8, pts.length * 3), seg, false, 'catmullrom', 0.3);
    const mergeTubes = (lines, r, seg = 8) => G.merge(lines.filter((l) => l.length > 1).map((l) => tubeAlong(l, r, seg)));
    const hinged = (parent, geo, mats, hinge, o = {}) => { const g = new THREE.Group(); g.position.set(...hinge); parent.add(g); geo.translate(-hinge[0], -hinge[1], -hinge[2]); mesh(geo, mats, { parent: g, ...o }); return g; };
    const sideMask = (f, s) => (x, lo, hi, i, j) => (s > 0 ? j >= MID : j < MID) && f(x, lo, hi);
    const SEAL = M.rubber();
    const orient = (obj, n, up = V3(0, 1, 0)) => { const zA = n.clone().normalize(); const yA = up.clone().addScaledVector(zA, -up.dot(zA)).normalize(); const xA = yA.clone().cross(zA); obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA)); return obj; };
    // surface lookups for lamps, vents and badges: point + normal on the shell
    const upper = (x, za, s = 1) => { const i = colAt(x); for (let k = 0; k < HI.K3; k++) { const a = GP[i][MID + k], b = GP[i][MID + k + 1]; if (b.z >= za && a.z <= za) { const t = (za - a.z) / Math.max(1e-6, b.z - a.z); const p = a.clone().lerp(b, t), n = GN[i][MID + k].clone().lerp(GN[i][MID + k + 1], t).normalize(); if (s < 0) { p.z = -p.z; n.z = -n.z; } return { p, n }; } } return null; };
    const sideAt = (x, y, s = 1) => { const i = colAt(x); for (let k = HI.K2; k < HI.K4; k++) { const a = GP[i][MID + k], b = GP[i][MID + k + 1]; if (a.y >= y && b.y <= y) { const t = (a.y - y) / Math.max(1e-6, a.y - b.y); const p = a.clone().lerp(b, t), n = GN[i][MID + k].clone().lerp(GN[i][MID + k + 1], t).normalize(); if (s < 0) { p.z = -p.z; n.z = -n.z; } return { p, n }; } } return null; };

    // ================================================================== BODY: shell, arch lips, wheelhouses
    let shellMesh = null;
    {
      const shell = P(body, 'קליפת המרכב (קבלר ופחם)', 'Body shell (Kevlar & carbon)', 'קבלר + סיבי פחם + אלומיניום, דבוק לשלדה', 'קליפות קלות מחומרים מרוכבים: קבלר וסיבי פחם על שלד צינורי. ב־F40 הקליפה לא נושאת עומס, ולכן אפשר היה לעצב אותה בחופשיות ולהוריד את המשקל. לפי נתוני היצרן הצבע היחיד שנמכר היה רוסו קורסה.');
      shellMesh = mesh(gridGeo(shellKeep, { thick: 0.008 }), [PAINT, EDGE], { parent: shell, name: 'shell skin' });
      for (const [ax, hw, top, front] of [[AXF, ARCF[0], ARCF[1], true], [AXR, ARCR[0], ARCR[1], false]]) for (const s of [1, -1]) {
        const lip = P(body, `שפת קשת גלגל ${front ? 'קדמי' : 'אחורי'} ${sideHe(s)}`, `${front ? 'Front' : 'Rear'} ${sideEn(s)} arch lip`, 'פחם + לכה', 'שפה מעוגלת סביב קשת הגלגל שמחזקת את הקליפה הדקה ומנקה את זרימת האוויר סביב הצמיג.');
        const j = s > 0 ? NV - 1 : 0;
        const pts = rowLine(j, ax - hw - 0.01, ax + hw + 0.01, 0.003).filter((p) => p.y > 0.2);
        mesh(tubeAlong(pts, 0.007, 8), PAINT, { parent: lip });
      }
      for (const [ax, TR, hw, front] of [[AXF, TRF, HWF, true], [AXR, TRR, HWR, false]]) for (const s of [1, -1]) {
        const wh = P(body, `בית גלגל פנימי ${front ? 'קדמי' : 'אחורי'} ${sideHe(s)}`, `${front ? 'Front' : 'Rear'} ${sideEn(s)} wheelhouse`, 'פחם + ציפוי שחור', 'מעטפת פנימית מעל הצמיג שמגינה על התא ועל המנוע מהתזות, ומנתבת את האוויר החוצה דרך החריצים בצד.');
        const rr = TR + 0.075, wdt = front ? 0.3 : 0.4;
        const g = new THREE.CylinderGeometry(rr, rr, wdt, 40, 1, true, PI * 0.5, PI); g.rotateX(PI / 2);
        mesh(g, dbl(M.paintFlat(0x0e0e10, 0.85)), { parent: wh, pos: [ax, TR, s * (hw - 0.02)], cast: false });
      }
    }
    // ---- hood (front clamshell lid) and engine cover, hinged
    const hoodHinge = [2.0, Tt(2.0) - 0.01, 0];
    const hoodP = P(doorsSys, 'מכסה קדמי (חרטום)', 'Front hood', 'קבלר + פחם', 'כל החרטום נפתח קדימה ומעלה על שני צירים בקצהו. מתחתיו המצנן, המצבר, גלגל החילוף והמגבים. על פני הכיסוי שני פתחי NACA ופנסים נשלפים.');
    const hoodG = hinged(hoodP, gridGeo(isHood, { thick: 0.008 }), [PAINT, EDGE], hoodHinge, { name: 'hood skin' });
    const lidHinge = [-2.2, Tt(-2.2) - 0.01, 0];
    const lidP = P(doorsSys, 'קליפת מנוע אחורית (עם כיסוי מחורץ)', 'Rear engine cover', 'קבלר + פוליקרבונט', 'קליפה אחורית שמורמת על ציר בקצה הזנב ומגלה את המנוע. החלק הקדמי שקוף ומחורץ כדי שאפשר יהיה לראות את המנוע ולפלוט חום.');
    const lidG = hinged(lidP, gridGeo((x, lo, hi) => isLid(x, lo, hi) && !isLexan(x, lo, hi), { thick: 0.008 }), [PAINT, EDGE], lidHinge, { name: 'lid skin' });
    K.toggle('hood', { he: 'מכסה קדמי', key: 'h', seconds: 1.4 }, (t) => { hoodG.rotation.z = -Math.sin(t * PI / 2) * 0.95; });
    K.toggle('lid', { he: 'קליפת מנוע', key: 'n', seconds: 1.6 }, (t) => { lidG.rotation.z = Math.sin(t * PI / 2) * 0.85; });
    // ---- doors, hinged at the front edge
    const doorHinge = (s) => { const j = jOf('K2', s), i = colAt(XD1); return [XD1, (GP[i][j].y + GP[colAt(XD1)][jOf('dl', s)].y) / 2, s * Math.abs(GP[i][j].z)]; };
    const doorList = [];
    for (const s of [1, -1]) {
      const dp = P(doorsSys, `דלת ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} door`, 'קבלר + פחם + לכה', 'דלת קלה בלי ידית חיצונית: פותחים מבפנים במשיכת כבל, ומבחוץ במנגנון נסתר בתוך חריץ. אחד הדברים שהפכו את ה־F40 לרכב כביש בעל נפש של מכונית מירוץ.');
      const h = doorHinge(s);
      const g = hinged(dp, gridGeo(sideMask(isDoorCell, s), { thick: 0.008 }), [PAINT, EDGE], h, { name: 'door skin' });
      doorList.push({ s, g, h, dp });
    }
    K.toggle('doors', { he: 'דלתות', key: 'd', seconds: 1.4 }, (t) => { const e = Math.sin(t * PI / 2); for (const d of doorList) d.g.rotation.y = d.s * e * 1.05; });
    // ================================================================== WHEELS
    const wheelsSys = sys('wheels'), brakesSys = sys('brakes'), suspSys = sys('suspension');
    const wheelSpots = [];
    for (const x of [AXF, AXR]) for (const s of [1, -1]) wheelSpots.push({ x, s, front: x > 0 });
    const steerWheels = [];
    const RIM = 0.2159;                                         // 17" bead seat
    const buildTyre = (parent, name, en, o) => {
      const { R, tw } = o;
      const side = (sg) => [[RIM + 0.004, tw * 0.84], [RIM + 0.012, tw * 0.91], [RIM + 0.04, tw * 0.975], [(RIM + R) / 2, tw], [R - 0.04, tw * 0.975], [R - 0.014, tw * 0.9], [R - 0.003, tw * 0.76]].map(([r, w]) => [r, sg * w]);
      const geo = G.lathe([...side(-1), [R, -tw * 0.58], [R + 0.0005, 0], [R, tw * 0.58], ...side(1).reverse()], 112, 'z');
      const tmat = M.tire(); tmat.side = THREE.DoubleSide;
      mesh(geo, tmat, { parent });
      // tread: circumferential grooves (dark) and lateral sipes
      const grooves = G.merge([-0.34, -0.12, 0.12, 0.34].map((k) => { const g = G.torus(R - 0.0006, 0.0045, 4, 112, PI * 2, 'z'); g.translate(0, 0, k * tw); return g; }));
      mesh(grooves, BLK, { parent, cast: false });
      const sipe = new THREE.BoxGeometry(0.005, 0.0035, tw * 0.17), sl = [];
      const N = o.rear ? 84 : 72;
      for (let i = 0; i < N; i++) for (const zz of [-0.55, -0.23, 0.0, 0.23, 0.55]) { const a = (i / N) * PI * 2 + zz * 0.5; sl.push({ pos: [Math.cos(a) * (R - 0.0004), Math.sin(a) * (R - 0.0004), zz * tw * 0.9], rot: [0, 0, a + (zz > 0 ? 0.4 : -0.4)] }); }
      instances(sipe, BLK, sl, { parent, cast: false });
      // sidewall lettering (outer face), arc text
      const tex = K.canvasTexture(1024, 1024, (g, w, h) => {
        g.translate(w / 2, h / 2); g.fillStyle = '#e7e4dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const arc = (txt, a0, rad, px, step) => { g.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`; txt.split('').forEach((c, i, arr) => { const a = a0 - (i - (arr.length - 1) / 2) * step; g.save(); g.rotate(a); g.fillText(c, 0, -rad * w); g.restore(); }); };
        arc('PIRELLI', 0, 0.395, 62, 0.058); arc('P ZERO', PI, 0.395, 52, 0.058);
        arc(o.size, -PI / 2, 0.37, 38, 0.044); arc('MADE IN ITALY · DOT', PI / 2, 0.37, 30, 0.036);
        g.fillStyle = '#c9a43a'; g.beginPath(); g.arc(0, -0.34 * w, 9, 0, 7); g.fill(); // wear-bar marker
      });
      const ring = new THREE.RingGeometry(RIM + 0.03, R - 0.03, 112, 1);
      { const p = ring.attributes.position, uv = ring.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * 0.39), 0.5 + p.getY(i) / (2 * 0.39)); }
      mesh(ring, M.decal(tex, { roughness: 0.85, clearcoat: 0 }), { parent, pos: [0, 0, tw + 0.0009], cast: false });
    };
    const buildRim = (parent, nm, en, o) => {
      const { bw, dish } = o;
      const rim = P(parent, `חישוק ${nm}`, `${en} rim`, 'אלומיניום יצוק Speedline', `חישוק בשני חלקים בקוטר 17 אינץ׳. הרוחב: ${o.rear ? '13' : '8'} אינץ׳ (מאחור 13J, מלפנים 8J). הלוע החיצוני מלוטש ומחובר בברגים, והפנים ב־5 חישורים רחבים.`);
      const barrel = G.lathe([[RIM - 0.012, -bw], [RIM + 0.012, -bw + 0.004], [RIM + 0.008, -bw + 0.02], [RIM - 0.02, -bw + 0.045], [RIM - 0.036, 0], [RIM - 0.02, bw - 0.045], [RIM + 0.008, bw - 0.02], [RIM + 0.012, bw - 0.004], [RIM - 0.002, bw]], 72, 'z');
      mesh(barrel, dbl(M.metal(0x2a2d31, 0.55)), { parent: rim });
      mesh(G.torus(RIM + 0.003, 0.0065, 8, 72, PI * 2, 'z'), SATIN, { parent: rim, pos: [0, 0, bw - 0.003] });
      mesh(G.torus(RIM + 0.003, 0.0065, 8, 72, PI * 2, 'z'), M.metal(0x8f949a, 0.3), { parent: rim, pos: [0, 0, -bw + 0.003] });
      // outer flange ring of the two-piece rim with 30 bolts
      mesh(new THREE.RingGeometry(RIM - 0.026, RIM + 0.0, 72, 1), SATIN, { parent: rim, pos: [0, 0, bw - 0.0045], cast: false });
      const bl = Array.from({ length: 30 }, (_, k) => { const a = (k / 30) * PI * 2; return { pos: [Math.cos(a) * (RIM - 0.0135), Math.sin(a) * (RIM - 0.0135), bw - 0.0045], rot: [PI / 2, 0, 0] }; });
      instances(G.cyl(0.0042, 0.0042, 0.006, 6, 'y'), M.metal(0x6c7076, 0.3), bl, { parent: rim, cast: false });
      // face: 5 wide spokes, dished toward the inside
      const zf = bw - dish, NS = 5, r0 = 0.045, r1 = RIM - 0.012;
      const spokes = G.merge(Array.from({ length: NS }, (_, k) => {
        const a0 = (k / NS) * PI * 2, sh = new THREE.Shape(), pts = [];
        const aw = (t) => lerp(0.3, 0.52, Math.pow(t, 0.8));
        for (let i = 0; i <= 10; i++) { const t = i / 10, r = lerp(r0, r1, t); pts.push([Math.cos(a0 - aw(t) / 2) * r, Math.sin(a0 - aw(t) / 2) * r]); }
        for (let i = 10; i >= 0; i--) { const t = i / 10, r = lerp(r0, r1, t); pts.push([Math.cos(a0 + aw(t) / 2) * r, Math.sin(a0 + aw(t) / 2) * r]); }
        sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 4 });
        const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); pos.setZ(i, pos.getZ(i) + zf - 0.03 * (r - r0) / (r1 - r0) - 0.01 + (o.rear ? 0.0 : 0.0)); }
        g.computeVertexNormals(); return g;
      }));
      mesh(spokes, M.metal(0xc4c8cd, 0.3), { parent: rim });
      mesh(G.lathe([[0.05, zf - 0.02], [0.05, zf + 0.008], [0.036, zf + 0.016], [0.0, zf + 0.016]], 40, 'z'), M.metal(0xb4b8bd, 0.28), { parent: rim });
      return { rim, zf };
    };
    const buildWheel = (spin, w, nm, en) => {
      const rear = !w.front, R = rear ? TRR : TRF, tw = rear ? 0.1675 : 0.1225, bw = rear ? 0.165 : 0.1015, dish = rear ? 0.05 : 0.026;
      const tire = P(spin, `צמיג ${nm}`, `${en} tyre`, rear ? 'גומי Pirelli P Zero 335/35 ZR17' : 'גומי Pirelli P Zero 245/40 ZR17', rear ? 'צמיג אחורי רחב במיוחד, 335 מ״מ, שפותח במיוחד ל־F40. הרוחב הגדול מדביק את המכונית לאספלט, ובלי סרוו ההיגוי כבד.' : 'צמיג קדמי 245/40 ZR17 ש־Pirelli פיתחה במיוחד ל־F40, סוג P Zero ללא שכבת קצף. סימון ZR מציין צמיג למהירות מעל 240 קמ״ש.');
      buildTyre(tire, nm, en, { R, tw, rear, size: rear ? '335/35 ZR 17' : '245/40 ZR 17' });
      const { rim, zf } = buildRim(spin, nm, en, { bw, dish, rear });
      const hub = P(spin, `אום מרכזי ${nm}`, `${en} centre nut`, 'פלדה מצופת כרום', 'אום נעילה מרכזי אחד במקום חמישה ברגים, בסגנון מכוניות מירוץ. מחזיק את הגלגל על הציר ומכוסה בכיסוי עם סמל.');
      mesh(G.cyl(0.032, 0.036, 0.016, 6, 'z'), CHROME, { parent: hub, pos: [0, 0, zf + 0.024] });
      mesh(G.cyl(0.02, 0.02, 0.01, 20, 'z'), M.gloss(0x111111), { parent: hub, pos: [0, 0, zf + 0.035] });
      for (const a of [0, 2.09, 4.19]) put(G.box(0.012, 0.03, 0.01, 0.003, 1), CHROME, hub, [Math.cos(a + 1.57) * 0.045, Math.sin(a + 1.57) * 0.045, zf + 0.022], [0, 0, a]);
      const stud = P(spin, `ברז אוויר ${nm}`, `${en} valve stem`, 'פליז + גומי', 'ברז אוויר קצר שיוצא דרך החישוק, עם פקק שחור.');
      put(G.cyl(0.004, 0.004, 0.035, 8, 'z'), M.brass(), stud, [Math.cos(0.5) * (RIM - 0.01), Math.sin(0.5) * (RIM - 0.01), bw - 0.03]);
      return { R, bw, zf };
    };
    for (const w of wheelSpots) {
      const sH = sideHe(w.s), sE = sideEn(w.s), tag = w.front ? 'קדמי' : 'אחורי', tagE = w.front ? 'front' : 'rear';
      const hw = w.front ? HWF : HWR, R = w.front ? TRF : TRR;
      const wp = P(wheelsSys, `גלגל ${tag} ${sH}`, `${tagE[0].toUpperCase() + tagE.slice(1)} ${sE} wheel`, 'אלומיניום + גומי', `גלגל שלם: צמיג Pirelli P Zero, חישוק Speedline ואום מרכזי. הגלגלים ${w.front ? 'הקדמיים' : 'האחוריים'} שונים בקוטר ובעובי כדי לאזן את המכונית.`, { pos: [w.x, R, w.s * hw] });
      if (w.s < 0) wp.rotation.y = PI;
      const spin = new THREE.Group(); wp.add(spin); spinners.push({ o: spin, s: w.s, r: R });
      const bw = buildWheel(spin, w, `${tag} ${sH}`, `${tagE} ${sE}`);
      rigWheels.push({ steer: w.front ? wp : null, spin, s: w.s, front: w.front, r: R });
      if (w.front) steerWheels.push({ wp, s: w.s });
      // ---- brake: disc spins with the wheel, caliper and dust shield stay on the upright
      const bk = P(wp, `בלם ${tag} ${sH}`, `${tagE} ${sE} brake`, 'דיסק ברזל מאוורר + קליפר אלומיניום', `דיסק מאוורר בקוטר ${w.front ? '330' : '310'} מ״מ (הערכה) וקליפר ארבע בוכנות של Brembo. אין מערכת ABS: הנהג מווסת את הבלימה ברגל.`);
      bk.userData.sysOverride = 'brakes';
      const DR = w.front ? 0.165 : 0.155, zD = -0.015;
      const disc = new THREE.Group(); disc.position.z = zD; bk.add(disc); spinners.push({ o: disc, s: w.s, r: R });
      mesh(G.lathe([[0.045, -0.014], [0.07, -0.014], [0.082, -0.008], [0.09, 0.012], [0.095, 0.012], [0.098, 0.0], [DR - 0.012, 0.0], [DR, 0.0]], 64, 'z'), CAST, { parent: disc });
      mesh(G.cyl(DR, DR, 0.0075, 72, 'z', false), M.metal(0x5a5c60, 0.5), { parent: disc, pos: [0, 0, 0.013] });
      mesh(G.cyl(DR, DR, 0.0075, 72, 'z', false), M.metal(0x5a5c60, 0.5), { parent: disc, pos: [0, 0, -0.013] });
      // radial vanes between the two friction rings (visible at the edge) and drilled-look vent slots
      const vanes = Array.from({ length: 36 }, (_, k) => { const a = (k / 36) * PI * 2; return { pos: [Math.cos(a) * (DR - 0.035), Math.sin(a) * (DR - 0.035), 0], rot: [0, 0, a] }; });
      instances(new THREE.BoxGeometry(0.07, 0.006, 0.02), CAST, vanes, { parent: disc });
      const hat = P(bk, `פעמון דיסק ${tag} ${sH}`, `${tagE} ${sE} disc hat`, 'אלומיניום', 'פעמון מחבר את הדיסק לגלגל.'); hat.userData.sysOverride = 'brakes';
      mesh(G.lathe([[0.0, 0.012], [0.052, 0.012], [0.056, 0.0], [0.07, -0.01]], 40, 'z'), M.castAlu(), { parent: hat, pos: [0, 0, zD] });
      const cal = P(bk, `קליפר ${tag} ${sH}`, `${tagE} ${sE} caliper`, 'אלומיניום יצוק', 'קליפר ארבע בוכנות שמהדק את שני צדי הדיסק. אפשר לראות אותו דרך החישורים.'); cal.userData.sysOverride = 'brakes';
      const ca = w.front ? 0.9 : 3.9;
      const calG = new THREE.Group(); calG.position.set(Math.cos(ca) * (DR - 0.012), Math.sin(ca) * (DR - 0.012), zD); calG.rotation.z = ca; cal.add(calG);
      mesh(G.soft(0.04, 0.12, 0.06, { r: 0.012, seg: 3 }), M.metal(0xb8140f, 0.35), { parent: calG, rot: [0, 0, 0] });
      for (const dz of [-0.0, 0.0]) put(G.cyl(0.012, 0.012, 0.012, 14, 'x'), M.metal(0x8a8e94, 0.3), calG, [0.0, 0.03, 0.033]);
      put(new THREE.PlaneGeometry(0.05, 0.016), M.decal(K.textTexture('brembo', { font: '700 80px Arial', color: '#f2f2f2', bg: 'rgba(0,0,0,0)' }).tex), calG, [0.0201, 0.0, 0.0], [0, PI / 2, 0], { cast: false });
      bolts(cal, [{ pos: [Math.cos(ca + 0.0) * (DR - 0.012) , Math.sin(ca) * (DR - 0.012), zD + 0.04], rot: [PI / 2, 0, 0] }], 0.005, CHROME);
      // dust shield
      mesh(G.cyl(DR + 0.006, DR + 0.006, 0.0025, 60, 'z'), M.darkSteel(), { parent: bk, pos: [0, 0, -0.045] });
    }
    // driving and steering animation
    let speed = 0;
    K.toggle('drive', { he: 'גלגלים מסתובבים', key: 'g', seconds: 1.2 }, (t) => { speed = t * 8; });
    K.onFrame((time, dt) => { if (speed > 0.01) for (const sp of spinners) sp.o.rotation.z -= (sp.s * speed * dt) / sp.r; });
    let steerAng = 0, setRodsFn = null;
    K.toggle('steer', { he: 'היגוי (שמאלה)', key: 'l', seconds: 1.0 }, (t) => { steerAng = t * 0.4; for (const w of steerWheels) w.wp.rotation.y = (w.s < 0 ? PI : 0) + steerAng; if (setRodsFn) setRodsFn(steerAng); });
    // ================================================================== GLASS, LOUVRES, SEALS
    const lightsSys = sys('lights'), trimSys = sys('trim'), aeroSys = sys('aero');
    const GLASS = M.glass(0x6f8f9a, 0.2), TINT = M.glass(0x4d6770, 0.3), LEXAN = M.glass(0x2f3a40, 0.34);
    {
      const wsP = P(glassSys, 'שמשה קדמית', 'Windshield', 'זכוכית שכבתית משופעת', 'שמשה משופעת מאוד, כמעט שטוחה, שמשרתת את צורת הטריז הנמוכה של המכונית.');
      mesh(gridGeo(isWindshield, { off: -0.005 }), GLASS, { parent: wsP, cast: false });
      const qP = P(glassSys, 'חלונות צד אחוריים (2)', 'Rear quarter windows', 'פוליקרבונט (Lexan)', 'חלון קבוע קטן מאחורי הדלת, מפוליקרבונט שקוף ששוקל פחות מזכוכית.');
      mesh(gridGeo(isQuarter, { off: -0.005 }), TINT, { parent: qP, cast: false });
      const loop = (xa, xb, ja, jb, off = 0.004) => [rowLine(ja, xa, xb, off), rowLine(jb, xa, xb, off), colLine(colAt(xa), ja, jb, off), colLine(colAt(xb), ja, jb, off)];
      // engine cover: polycarbonate panel with tapered louvres (belongs to the engine lid, so it lifts with it)
      const lx = P(lidG, 'חלון מנוע מפוליקרבונט', 'Polycarbonate engine window', 'פוליקרבונט (Lexan) שקוף', 'חלון אחורי משופע מעל המנוע: מפוליקרבונט במקום זכוכית. דרכו רואים את המנוע, ובחריצים עולה אוויר חם החוצה.'); lx.userData.sysOverride = 'glass';
      const trL = (g) => g.translate(-lidHinge[0], -lidHinge[1], -lidHinge[2]);
      mesh(trL(gridGeo(isLexan, { off: -0.004 })), LEXAN, { parent: lx, cast: false });
      const lv = P(lidG, 'חריצי אוורור בחלון המנוע (24)', 'Engine window louvres (×24)', 'אלומיניום שחור מוסק', 'סרגלים מוטים שחורים מעל הפוליקרבונט: מכסים את המנוע מהשמש, מונעים השתקפות בשמשה האחורית ומאפשרים לחום לצאת מתא המנוע.'); lv.userData.sysOverride = 'glass';
      const list = [];
      for (let k = 0; k < 24; k++) {
        const x = -0.72 - k * 0.043 - 0.01; if (x < X_LEXAN + 0.03) break; const i = colAt(x);
        const jK = MID + HI.K1, zE = Math.abs(GP[i][jK].z) - 0.012;
        const p = GP[i][MID].clone().addScaledVector(GN[i][MID], 0.016).sub(V3(...lidHinge));
        const slope = Math.atan2(GP[Math.min(NI - 1, i + 1)][MID].y - GP[Math.max(0, i - 1)][MID].y, GP[Math.min(NI - 1, i + 1)][MID].x - GP[Math.max(0, i - 1)][MID].x);
        list.push({ pos: p.toArray(), rot: [0, 0, slope - 0.4], len: zE * 0.97 });
      }
      for (const l of list) { const g = new THREE.BoxGeometry(0.05, 0.005, l.len * 2); mesh(g, M.paintFlat(0x0b0b0d, 0.5), { parent: lv, pos: l.pos, rot: l.rot, cast: false }); }
      // seals
      const sealP = P(glassSys, 'אטמי גומי לשמשות', 'Glass seals', 'גומי EPDM', 'פרופיל גומי שחור סביב השמשה והחלונות.');
      mesh(mergeTubes([rowLine(MID - HI.K1, X_WS0, X_WS1, 0.003), rowLine(MID + HI.K1, X_WS0, X_WS1, 0.003), colLine(colAt(X_WS0), MID - HI.K1, MID + HI.K1, 0.003), colLine(colAt(X_WS1), MID - HI.K1, MID + HI.K1, 0.003)], 0.0055), SEAL, { parent: sealP });
      for (const s of [1, -1]) mesh(mergeTubes(loop(XQ0, XQ1, jOf('K1b', s), jOf('K2', s)), 0.005), SEAL, { parent: sealP });
      // door glass: fixed front pane + sliding rear pane (the F40 has only a small sliding window)
      for (const s of [1, -1]) {
        const D = doorList.find((d) => d.s === s), h = D.h, sd = sideHe(s), se = sideEn(s);
        const tr = (g) => g.translate(-h[0], -h[1], -h[2]);
        const XSL = 0.12;
        const fg = P(D.g, `זכוכית דלת קבועה ${sd}`, `${se} fixed door glass`, 'פוליקרבונט (Lexan)', 'החלק הקדמי של חלון הדלת קבוע, מפוליקרבונט שקוף. ב־F40 אי אפשר להוריד את החלון: אין מנגנון חשמלי או ידית, כדי לחסוך משקל.'); fg.userData.sysOverride = 'glass';
        mesh(tr(gridGeo(sideMask((x, lo, hi) => isDoorGlass(x, lo, hi) && x > XSL, s), { off: -0.006 })), TINT, { parent: fg, cast: false });
        const sg = P(D.g, `חלון הזזה ${sd}`, `${se} sliding window`, 'פוליקרבונט + מסגרת אלומיניום', 'חלון קטן שנפתח בהזזה אחורה כדי שהנהג יוכל להושיט יד לתשלום או לקבלת כרטיס חניה. זה כל פתח האוורור של החלון.'); sg.userData.sysOverride = 'glass';
        const slide = new THREE.Group(); sg.add(slide); D.slide = slide;
        mesh(tr(gridGeo(sideMask((x, lo, hi) => isDoorGlass(x, lo, hi) && x < XSL, s), { off: -0.012 })), TINT, { parent: slide, cast: false });
        mesh(tr(tubeAlong(rowLine(jOf('K2', s), XG0, XSL, -0.004), 0.0045)), SATIN, { parent: slide });
        mesh(tr(tubeAlong(colLine(colAt(XSL), jOf('K1b', s), jOf('K2', s), -0.004), 0.004)), SATIN, { parent: slide });
        const sl = P(D.g, `אטם חלון דלת ${sd}`, `${se} door window seal`, 'גומי EPDM', 'פרופיל גומי שחור סביב חלון הדלת.'); sl.userData.sysOverride = 'glass';
        mesh(tr(mergeTubes(loop(XG0, XG1, jOf('K1b', s), jOf('K2', s)), 0.005), SEAL), SEAL, { parent: sl });
        const cs = P(D.g, `פס אלומיניום חלון ${sd}`, `${se} window trim`, 'אלומיניום אנודייז שחור', 'מסגרת שחורה דקה בתחתית החלון.'); cs.userData.sysOverride = 'trim';
        mesh(tr(tubeAlong(rowLine(jOf('K2', s), XG0, XG1, 0.004), 0.004)), M.metal(0x1b1c1f, 0.4), { parent: cs });
      }
      K.toggle('slide', { he: 'חלונות הזזה', key: 'w', seconds: 1.0 }, (t) => { for (const D of doorList) D.slide.position.x = t * 0.2; });
    }
    const lampKeep = [];
    const REFL = M.metal(0xdfe3e8, 0.12);
    const BLKP = M.paintFlat(0x0b0b0d, 0.55);
    // ---- ray helper: where does a ray hit the painted shell? (lamps, vents and badges sit on the real surface)
    const RAY = new THREE.Raycaster();
    const RAYM = [shellMesh, hoodG.children[0], lidG.children[0]];
    const rayHit = (o, d) => { for (const m of RAYM) (m.parent || m).updateMatrixWorld(true); RAY.set(v3(o), v3(d).clone().normalize()); const h = RAY.intersectObjects(RAYM, false)[0]; if (!h) return null; const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.dot(RAY.ray.direction) > 0) n.negate(); return { p: h.point.clone(), n }; };
    const downAt = (x, z) => rayHit([x, 3, z], [0, -1, 0]);
    const sideRay = (x, y, s) => rayHit([x, y, s * 3], [0, 0, -s]);
    const rearRay = (y, z) => rayHit([-6, y, z], [1, 0, 0]);
    const frontRay = (y, z) => rayHit([6, y, z], [-1, 0, 0]);
    // a flat black (or any material) plate laid on the shell
    const plate = (parent, hit, w, h, mat, o = {}) => { const m = mesh(G.box(w, h, o.d ?? 0.006, o.r ?? 0.002, 1), mat, { parent, cast: false }); m.position.copy(hit.p).addScaledVector(hit.n, o.off ?? 0.001); if (o.rel) m.position.sub(V3(...o.rel)); orient(m, hit.n, o.up || V3(0, 1, 0)); return m; };

    // ================================================================== BODY ENDS: tail panel and nose
    {
      const tp = P(body, 'לוח זנב שחור עם רשת', 'Tail panel with mesh', 'פחם שחור + רשת אלומיניום', 'לוח אחורי שחור שמחזיק את ארבעת פנסי הזנב ומאפשר לחום מהמנוע לצאת דרך רשת מחוררת. בין הפנסים יושבת לוחית הרישוי.');
      const th = rearRay(0.68, 0);
      if (th) {
        const bx = mesh(G.box(1.36, 0.27, 0.012, 0.012, 2), BLKP, { parent: tp }); bx.position.copy(th.p).addScaledVector(th.n, 0.002); orient(bx, th.n, V3(0, 1, 0));
        const meshTex = K.canvasTexture(512, 128, (g, w, h) => { g.fillStyle = '#050506'; g.fillRect(0, 0, w, h); g.strokeStyle = '#555960'; g.lineWidth = 2; for (let i = -h; i < w + h; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } });
        const mm = mesh(new THREE.PlaneGeometry(1.32, 0.25), new THREE.MeshStandardMaterial({ map: meshTex, roughness: 0.45, metalness: 0.6 }), { parent: tp, cast: false }); mm.position.copy(th.p).addScaledVector(th.n, 0.0095); orient(mm, th.n, V3(0, 1, 0));
      }
    }

    // ================================================================== LIGHTS
    const LM = {
      head: new THREE.MeshStandardMaterial({ color: 0x35464f, emissive: 0xfff0c0, emissiveIntensity: 0.0, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, name: 'עדשת פנס ראשי' }),
      bulb: new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffe9a0, emissiveIntensity: 0.1, roughness: 0.2, name: 'נורה' }),
      amber: new THREE.MeshStandardMaterial({ color: 0xe9890f, emissive: 0xff8a00, emissiveIntensity: 0.05, roughness: 0.15, transparent: true, opacity: 0.9, side: THREE.DoubleSide, name: 'עדשה כתומה' }),
      red: new THREE.MeshStandardMaterial({ color: 0xb40e12, emissive: 0xff1010, emissiveIntensity: 0.05, roughness: 0.15, transparent: true, opacity: 0.92, side: THREE.DoubleSide, name: 'עדשה אדומה' }),
      redSq: new THREE.MeshStandardMaterial({ color: 0xa00c10, emissive: 0xff1010, emissiveIntensity: 0.05, roughness: 0.2, transparent: true, opacity: 0.92, side: THREE.DoubleSide, name: 'עדשה אדומה (פנס ערפל)' }),
      plate: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, emissive: 0xfff2c8, emissiveIntensity: 0.0, roughness: 0.2, name: 'פנס לוחית' }),
      fogW: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.1, transparent: true, opacity: 0.85, side: THREE.DoubleSide, name: 'עדשת נסיעה לאחור' }),
    };
    {
      // fixed corner lamps (low beam) in the nose, behind a clear polycarbonate lens
      for (const s of [1, -1]) {
        const hit = frontRay(0.42, s * 0.57); if (!hit) continue;
        const cl = P(lightsSys, `פנס ראשי קבוע ${sideHe(s)} (אלומה נמוכה)`, `${s > 0 ? 'Right' : 'Left'} fixed headlamp (low beam)`, 'פוליקרבונט + מחזיר אלומיניום', 'פנס מלבני בפינת החרטום מאחורי עדשה שקופה משופעת. הפנסים הקבועים נותנים אלומה נמוכה, והפנסים הנשלפים שעל הכנף נוספים לאלומה הגבוהה.');
        cl.position.copy(hit.p).addScaledVector(hit.n, -0.002); orient(cl, hit.n, V3(0, 1, 0));
        mesh(G.box(0.33, 0.145, 0.04, 0.012, 2), BLKP, { parent: cl, pos: [0, 0, 0.012] });
        for (const dx of [-0.08, 0.08]) { mesh(G.lathe([[0.0, 0.0], [0.03, 0.004], [0.052, 0.022], [0.06, 0.038], [0.06, 0.042]], 28, 'z'), REFL, { parent: cl, pos: [dx, 0, 0.0], scale: [1, 0.9, 1] }); mesh(G.sphere(0.012, 12, 8), LM.bulb, { parent: cl, pos: [dx, 0, 0.012] }); }
        mesh(G.box(0.325, 0.14, 0.004, 0.012, 2), LM.head, { parent: cl, pos: [0, 0, 0.044], name: 'lens', cast: false });
        mesh(G.torus(0.01, 0.0028, 6, 16), CHROME, { parent: cl, pos: [0.13, 0.0, 0.034] });
        lampKeep.push({ m: LM.head });
      }
    }
    const decal = (parent, tex, w, h, pos, n, up, o = {}) => { const m = mesh(new THREE.PlaneGeometry(w, h), M.decal(tex, { roughness: o.roughness ?? 0.4, metalness: o.metalness ?? 0 }), { parent, pos: (pos.toArray ? pos.toArray() : pos), cast: false }); orient(m, n, up); return m; };
    {
      // retractable headlamps under flaps on the front fender tops
      const flaps = [];
      for (const s of [1, -1]) {
        const hit = downAt(1.72, s * 0.62); if (!hit) continue;
        const grp = P(hoodG, `פנס נשלף ${sideHe(s)} (אלומה גבוהה)`, `${s > 0 ? 'Right' : 'Left'} retractable headlamp`, 'פלסטיק + מחזיר + נורת הלוגן', 'פנס אלומה גבוהה שמסתתר מתחת לדשים על ראש הכנף ונשלף בלחיצה. כשהוא מוסתר, פני החרטום נקיים וחלקים לאוויר.');
        grp.userData.sysOverride = 'lights'; grp.position.copy(hit.p).sub(V3(...hoodHinge)); orient(grp, hit.n, V3(1, 0, 0));
        // the unit rises along the surface normal; local z = normal, local y = forward (+x), local x = -/+ z of the car
        const unit = new THREE.Group(); grp.add(unit);
        mesh(G.box(0.3, 0.17, 0.09, 0.012, 2), BLKP, { parent: unit, pos: [0, 0, -0.045] });
        mesh(G.lathe([[0.0, 0.0], [0.04, 0.004], [0.065, 0.03], [0.076, 0.058], [0.076, 0.062]], 28, 'z'), REFL, { parent: unit, pos: [-0.075, 0, -0.03] });
        mesh(G.lathe([[0.0, 0.0], [0.04, 0.004], [0.065, 0.03], [0.076, 0.058], [0.076, 0.062]], 28, 'z'), REFL, { parent: unit, pos: [0.075, 0, -0.03] });
        for (const dx of [-0.075, 0.075]) mesh(G.sphere(0.013, 10, 8), LM.bulb, { parent: unit, pos: [dx, 0, -0.016] });
        mesh(G.box(0.3, 0.16, 0.005, 0.01, 2), LM.head, { parent: unit, pos: [0, 0, -0.008], cast: false });
        mesh(G.torus(0.085, 0.003, 6, 36), M.metal(0x9a9ea4, 0.3), { parent: unit, pos: [-0.075, 0, -0.012] });
        mesh(G.torus(0.085, 0.003, 6, 36), M.metal(0x9a9ea4, 0.3), { parent: unit, pos: [0.075, 0, -0.012] });
        lampKeep.push({ m: LM.head });
        // flap (body colour), hinged at its front edge
        const fl = P(hoodG, `דש פנס נשלף ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} headlamp flap`, 'קבלר + לכה', 'דש בצבע המרכב שמכסה את הפנס הנשלף. כשהוא נפתח, הפנס מתרומם ופונה קדימה.');
        fl.userData.sysOverride = 'doors'; fl.position.copy(hit.p).sub(V3(...hoodHinge)); orient(fl, hit.n, V3(1, 0, 0));
        const hing = new THREE.Group(); hing.position.set(0, 0.095, 0.004); fl.add(hing);
        const fm = mesh(G.box(0.32, 0.19, 0.012, 0.004, 1), PAINT, { parent: hing, pos: [0, -0.095, 0.0] });
        mesh(G.box(0.33, 0.012, 0.004, 0.002, 1), BLK, { parent: hing, pos: [0, -0.19, -0.004] });
        mesh(G.box(0.345, 0.205, 0.003, 0.004, 1), BLK, { parent: fl, pos: [0, 0, -0.001], cast: false });
        flaps.push({ unit, hing, s });
      }
      K.toggle('headlamps', { he: 'פנסים נשלפים', key: 'o', seconds: 1.0 }, (t) => { for (const f of flaps) { f.hing.rotation.x = -t * 1.2 * 1; f.unit.position.z = t * 0.09; f.unit.rotation.x = -t * 1.15; } });
    }
    // ---- tail lamps (four round units in two pairs), lower reflectors, plate lamp
    const roundLamp = (parent, pos, n, mat, name, nameEn, descr, centre) => {
      const lp = P(parent, name, nameEn, 'פלסטיק צבעוני + מחזיר', descr);
      lp.position.copy(pos); orient(lp, n, V3(0, 1, 0));
      mesh(G.lathe([[0.0, -0.02], [0.095, -0.02], [0.1, -0.008], [0.1, 0.004], [0.088, 0.006]], 36, 'z'), BLKP, { parent: lp });
      mesh(G.torus(0.092, 0.005, 8, 36), M.metal(0x2c2d31, 0.4), { parent: lp, pos: [0, 0, 0.004] });
      mesh(G.lathe([[0.0, 0.0], [0.04, 0.0], [0.048, 0.006], [0.066, 0.008], [0.071, 0.016], [0.074, 0.02]], 36, 'z').scale(1, 1, 1), mat, { parent: lp, pos: [0, 0, -0.012] });
      for (const r of [0.058, 0.04, 0.026]) mesh(G.torus(r, 0.0016, 4, 36), M.metal(0xd8d8d8, 0.3), { parent: lp, pos: [0, 0, 0.004 + (0.05 - r) * 0.2] });
      mesh(G.cyl(0.011, 0.011, 0.004, 14, 'z'), centre, { parent: lp, pos: [0, 0, 0.0095] });
      return lp;
    };
    {
      const lampY = 0.70, zOut = 0.575, zIn = 0.385;
      for (const s of [1, -1]) {
        const base0 = rearRay(0.68, 0); const tOut = base0 && { p: V3(base0.p.x, lampY, s * zOut), n: base0.n }, tIn = base0 && { p: V3(base0.p.x, lampY, s * zIn), n: base0.n };
        if (tOut) { roundLamp(lightsSys, tOut.p.clone().addScaledVector(tOut.n, 0.013), tOut.n, LM.amber, `פנס איתות אחורי ${sideHe(s)}`, `Rear turn signal ${sideEn(s)}`, 'פנס עגול כתום בקצה הלוח האחורי, עם מחזיר לבן במרכז. מהבהב בעת פנייה.', LM.fogW); lampKeep.push({ m: LM.amber }); }
        if (tIn) { roundLamp(lightsSys, tIn.p.clone().addScaledVector(tIn.n, 0.013), tIn.n, LM.red, `פנס זנב ובלימה ${sideHe(s)}`, `Rear tail/brake lamp ${sideEn(s)}`, 'פנס עגול אדום גדול שמשמש לאור אחורי ולאור בלימה. ארבעת העיגולים האחוריים הפכו לאחד מהסימנים המוכרים ביותר של ה־F40.', LM.red); }
        // lower rectangular red lamp on the valance (rear fog / reflector)
        const lo = rearRay(0.34, s * 0.62);
        if (lo) { const lp = P(lightsSys, `פנס ערפל ומחזיר ${sideHe(s)}`, `Rear fog lamp ${sideEn(s)}`, 'פלסטיק אדום', 'פנס קטן מלבני באדום בפינת הפגוש התחתון: ערפל ומחזיר אור.'); lp.position.copy(lo.p).addScaledVector(lo.n, 0.002); orient(lp, lo.n, V3(0, 1, 0)); mesh(G.box(0.1, 0.04, 0.008, 0.003, 1), M.metal(0x1a1a1c, 0.5), { parent: lp, pos: [0, 0, 0] }); mesh(G.box(0.088, 0.03, 0.006, 0.002, 1), LM.redSq, { parent: lp, pos: [0, 0, 0.005] }); lampKeep.push({ m: LM.redSq }); }
      }
      // black rectangular surround and mesh panel were laid by the tail panel; plate bay in the middle
      const pl = rearRay(0.66, 0); const plateTex = (txt) => K.canvasTexture(512, 112, (g, w, h) => { g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1c1c1c'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#1f3f93'; g.fillRect(8, 8, 46, h - 16); g.fillStyle = '#e8c12a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText('I', 31, 84); g.fillStyle = '#111'; g.font = '700 74px "Arial Narrow", Arial'; g.fillText(txt, w / 2 + 28, 82); });
      if (pl) {
        const rp = P(trimSys, 'לוחית רישוי אחורית', 'Rear licence plate', 'אלומיניום מוטבע', 'לוחית רישוי אחורית במרכז הלוח האחורי. האותיות שחורות על רקע לבן, והרצועה הכחולה מציינת אירופה (I = איטליה).');
        rp.position.copy(pl.p).addScaledVector(pl.n, 0.0125); orient(rp, pl.n, V3(0, 1, 0));
        mesh(G.box(0.36, 0.1, 0.006, 0.003, 1), M.metal(0xe9e9e4, 0.4), { parent: rp }); const tx = plateTex('F40 1987'); mesh(new THREE.PlaneGeometry(0.352, 0.0775), M.decal(tx, { roughness: 0.5 }), { parent: rp, pos: [0, 0, 0.0035], cast: false });
        bolts(rp, [-0.16, 0.16].map((x) => ({ pos: [x, 0, 0.0035], rot: [PI / 2, 0, 0] })), 0.0035, CHROME);
        const pll = P(lightsSys, 'פנס לוחית', 'Number-plate lamp', 'פלסטיק + נורה', 'פנס קטן שמאיר את הלוחית בלילה.');
        pll.position.copy(pl.p).addScaledVector(pl.n, 0.016).add(V3(0, 0.082, 0)); mesh(G.box(0.07, 0.014, 0.012, 0.004, 1), LM.plate, { parent: pll, cast: false }); lampKeep.push({ m: LM.plate });
      }
      // chrome "Ferrari" script on the tail
      const sc = rearRay(0.79, 0.0);
      if (sc) { const t = K.textTexture('Ferrari', { font: 'italic 700 120px "Brush Script MT","Segoe Script",cursive', color: '#e6e8ea', pad: 12 }); const w = 0.15; const m = decal(trimSys, t.tex, w, w / t.aspect, sc.p.clone().addScaledVector(sc.n, 0.0125), sc.n, V3(0, 1, 0), { metalness: 0.7, roughness: 0.2 }); m.userData.part = { he: 'כיתוב Ferrari בכרום', en: 'Chrome Ferrari script', mat: 'פלסטיק מצופה כרום', desc: 'הכיתוב ״Ferrari״ בכתב יד מעל לוחית הרישוי.' }; }
    }
    // ================================================================== EXTERIOR DETAILS: aero, vents, badges, mirrors
    const slatBars = (parent, hit, w, h, n, vertical, mat, bw = 0.006, up) => { // n bars across a w x h vent, standing off the surface
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n - 0.5; const m = mesh(G.box(vertical ? bw : w * 0.94, vertical ? h * 0.92 : bw, 0.012, 0.002, 1), mat, { parent, cast: false }); m.position.copy(hit.p).addScaledVector(hit.n, 0.004); orient(m, hit.n, up || V3(0, 1, 0)); m.translateX(vertical ? t * w : 0); m.translateY(vertical ? 0 : t * h); }
    };
    const triPlate = (parent, hit, w, h, mat, up, rel) => { // triangle, apex toward local +y (the car's forward)
      const sh = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(0.0, h / 2)]);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false }); g.translate(0, 0, -0.002);
      const m = mesh(g, mat, { parent, cast: false }); m.position.copy(hit.p).addScaledVector(hit.n, 0.0005); if (rel) m.position.sub(V3(...rel)); orient(m, hit.n, up || V3(1, 0, 0)); return m;
    };
    {
      // ---- rear wing
      const wing = P(aeroSys, 'כנף אחורית', 'Rear wing', 'קבלר + פחם בצבע המרכב', 'כנף גדולה בקצה הזנב עם שני לוחות צד. היא יוצרת עומס אווירודינמי על הסרן האחורי במהירויות גבוהות, ומשלימה את הרצפה ואת החרטום בקבלת יציבות.');
      const blade = G.extrude(G.shape([[-1.78, 1.045], [-1.85, 1.066], [-2.0, 1.076], [-2.258, 1.112], [-2.258, 1.094], [-2.0, 1.05], [-1.85, 1.024]]), 1.56, { curveSeg: 4 }); // extruded along z
      mesh(blade, PAINT, { parent: wing, name: 'wing blade' });
      for (const s of [1, -1]) {
        const ep = P(aeroSys, `לוח צד של הכנף ${sideHe(s)}`, `Wing end plate ${sideEn(s)}`, 'קבלר + לכה', 'לוח אנכי בקצה הכנף שמונע מאוויר לברוח הצידה וכך מגדיל את העומס. הוא מתמזג בכנף האחורית של הגוף.');
        const g = G.extrude(G.shape([[-2.258, 0.86], [-2.258, 1.118], [-1.74, 1.075], [-1.62, 0.99], [-1.58, 0.9], [-1.9, 0.84]]), 0.016, { bevel: 0.002, bevelSeg: 1, curveSeg: 4 });
        mesh(g, PAINT, { parent: ep, pos: [0, 0, s * 0.79] });
        bolts(ep, [{ pos: [-2.1, 1.06, s * 0.8] }, { pos: [-1.85, 1.04, s * 0.8] }].map((b) => ({ pos: b.pos, rot: [s * PI / 2, 0, 0] })), 0.005, M.metal(0x1a1b1d, 0.4));
        const st = P(aeroSys, `תמיכת כנף ${sideHe(s)}`, `Wing strut ${sideEn(s)}`, 'פחם + פלדה', 'עמוד תמיכה בין כנף האוויר לבין מכסה הזנב. הוא מעביר את העומס האווירודינמי אל השלדה.');
        rod(st, [-2.12, 0.86, s * 0.34], [-2.06, 1.05, s * 0.34], 0.014, M.metal(0x16171a, 0.4));
      }
      // ---- front splitter lip (black) following the nose plan
      const spl = P(aeroSys, 'מפצל חזית', 'Front splitter lip', 'פוליפרופילן שחור', 'שפה שחורה דקה בתחתית החרטום שמפרידה את זרימת האוויר בין החלק העליון (מעל המכונית) לתחתית, ומקטינה את הגרר ואת ההרמה.');
      { const xs = []; for (let x = 1.6; x <= 2.095; x += 0.03) xs.push(x); xs.push(2.097); const pts = []; for (const x of xs) pts.push([x, Wp(x) * 0.985]); for (let k = xs.length - 1; k >= 0; k--) pts.push([xs[k], -Wp(xs[k]) * 0.985]); const sh = G.shape(pts.map(([x, z]) => [x, z])); const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); gg.rotateX(PI / 2); mesh(gg, M.paintFlat(0x08080a, 0.7), { parent: spl, pos: [0.0, 0.126, 0] }); }
      // ---- hood NACA ducts, crest and shut line (ride with the hood)
      for (const s of [1, -1]) {
        const hit = downAt(1.58, s * 0.26); if (!hit) continue;
        const nd = P(hoodG, `תעלת NACA בכיסוי ${sideHe(s)}`, `Hood NACA duct ${sideEn(s)}`, 'פחם + פחם שחור', 'פתח אוויר בצורת משולש שנכנס לפני השטח של הכיסוי ומכניס אוויר בלי להגביר את הגרר. הצורה פותחה בארה״ב ב־1945 על ידי NACA, גוף שקדם לנאס״א.'); nd.userData.sysOverride = 'aero';
        triPlate(nd, hit, 0.16, 0.2, BLK, V3(1, 0, 0), hoodHinge);
      }
      const hc = frontRay(0.40, 0.0);
      // Ferrari shield on the nose
      const shield = K.canvasTexture(256, 320, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#f2c617'; g.beginPath(); g.moveTo(12, 8); g.lineTo(w - 12, 8); g.lineTo(w - 12, h * 0.6); g.quadraticCurveTo(w - 12, h - 8, w / 2, h - 8); g.quadraticCurveTo(12, h - 8, 12, h * 0.6); g.closePath(); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 6; g.stroke();
        g.fillStyle = '#111'; g.font = '700 46px Arial'; g.textAlign = 'center'; g.fillText('S  F', w / 2, 60);
        // prancing horse (stylised)
        g.save(); g.translate(w / 2, 175); g.scale(1.05, 1.05); g.fillStyle = '#111'; g.beginPath();
        g.moveTo(-45, 70); g.lineTo(-40, 20); g.quadraticCurveTo(-60, -10, -30, -35); g.lineTo(-12, -62); g.lineTo(0, -48); g.lineTo(18, -70); g.lineTo(28, -40); g.quadraticCurveTo(44, -22, 36, 4); g.lineTo(50, 28); g.lineTo(38, 36); g.lineTo(18, 14); g.lineTo(8, 70); g.lineTo(-6, 70); g.lineTo(-8, 30); g.lineTo(-24, 70); g.closePath(); g.fill(); g.restore();
        g.fillStyle = '#1b8f3a'; g.fillRect(12, 12, w - 24, 8); g.fillStyle = '#fff'; g.fillRect(12 + (w - 24) / 3, 12, (w - 24) / 3, 8); g.fillStyle = '#c4130f'; g.fillRect(12 + 2 * (w - 24) / 3, 12, (w - 24) / 3, 8);
      });
      globalThis.__shield = shield;
      const hb = downAt(1.78, 0.0);
      if (hb) { const sb = P(hoodG, 'סמל הסוס המזנק על החרטום', 'Prancing horse badge (nose)', 'פליז מאמייל', 'סמל פרארי: סוס שחור מזנק על רקע צהוב. הסוס היה סמלו של טייס המלחמה פרנצ׳סקו ברקה, והצהוב הוא צבע העיר מודנה.'); sb.userData.sysOverride = 'trim'; decal(sb, shield, 0.04, 0.05, hb.p.clone().addScaledVector(hb.n, 0.0025).sub(V3(...hoodHinge)), hb.n, V3(1, 0, 0), { roughness: 0.3, metalness: 0.4 }); }
      // front fascia: central grille, two corner intakes, plate
      const fg = frontRay(0.3, 0.0);
      if (fg) {
        const gp = P(aeroSys, 'גריל חזית מרכזי', 'Front centre grille', 'פחם שחור + רשת אלומיניום', 'פתח רחב בחרטום שמזין אוויר אל המצנן הקדמי דרך רשת מתכת. מכאן האוויר עולה דרך המצנן ויוצא דרך פתחים בכיסוי.');
        plate(gp, fg, 0.86, 0.075, BLKP, { d: 0.012, off: 0.0015, up: V3(0, 1, 0) });
        const mt = K.canvasTexture(256, 64, (g, w, h) => { g.fillStyle = '#050506'; g.fillRect(0, 0, w, h); g.strokeStyle = '#686c72'; g.lineWidth = 1.5; for (let i = -h; i < w + h; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } });
        const mm = mesh(new THREE.PlaneGeometry(0.84, 0.062), new THREE.MeshStandardMaterial({ map: mt, roughness: 0.5, metalness: 0.5 }), { parent: gp, cast: false }); mm.position.copy(fg.p).addScaledVector(fg.n, 0.0085); orient(mm, fg.n, V3(0, 1, 0));
        for (const s of [1, -1]) { const ci = frontRay(0.3, s * 0.58); if (ci) { const cp = P(aeroSys, `פתח אוויר פינתי ${sideHe(s)}`, `Corner air intake ${sideEn(s)}`, 'פחם שחור + רשת', 'פתח קטן בפינת הפגוש שמפנה אוויר קר לבלמים הקדמיים.'); plate(cp, ci, 0.14, 0.085, BLKP, { d: 0.01, off: 0.0015, up: V3(0, 1, 0) }); const m2 = mesh(new THREE.PlaneGeometry(0.125, 0.07), new THREE.MeshStandardMaterial({ map: mt, roughness: 0.5, metalness: 0.5 }), { parent: cp, cast: false }); m2.position.copy(ci.p).addScaledVector(ci.n, 0.0075); orient(m2, ci.n, V3(0, 1, 0)); } }
        const pp = frontRay(0.2, 0.0);
        if (pp) {
          const fp = P(trimSys, 'לוחית רישוי קדמית', 'Front licence plate', 'אלומיניום מוטבע', 'לוחית רישוי קדמית מתחת לגריל, על תושבת קצרה.');
          fp.position.copy(pp.p).addScaledVector(pp.n, 0.006); orient(fp, pp.n, V3(0, 1, 0));
          mesh(G.box(0.36, 0.11, 0.006, 0.003, 1), M.metal(0xe9e9e4, 0.4), { parent: fp });
          const tx = K.canvasTexture(512, 112, (g, w, h) => { g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1c1c1c'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#1f3f93'; g.fillRect(8, 8, 46, h - 16); g.fillStyle = '#e8c12a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText('I', 31, 84); g.fillStyle = '#111'; g.font = '700 74px "Arial Narrow", Arial'; g.fillText('F40 1987', w / 2 + 28, 82); });
          mesh(new THREE.PlaneGeometry(0.352, 0.0775), M.decal(tx, { roughness: 0.5 }), { parent: fp, pos: [0, 0, 0.0035], cast: false });
        }
      }
      // ---- side air intakes behind the doors (feed the rear brakes and oil coolers)
      for (const s of [1, -1]) {
        const hi = sideRay(-0.62, 0.43, s); if (!hi) continue;
        const ip = P(aeroSys, `יניקת אוויר צדית ${sideHe(s)}`, `Side air intake ${sideEn(s)}`, 'פחם שחור + רשת', 'פתח גדול בצד מאחורי הדלת שמכניס אוויר אל מצנני השמן ואל הבלמים האחוריים. הצורה שלו משמשת גם לקירור מנוע וגם לניהול זרימה סביב הצמיג.');
        plate(ip, hi, 0.4, 0.26, BLKP, { d: 0.01, off: 0.0012, up: V3(0, 1, 0), r: 0.012 });
        slatBars(ip, hi, 0.38, 0.24, 4, false, M.paintFlat(0x1c1d20, 0.5), 0.007);
        const ramp = sideRay(-0.42, 0.43, s); if (ramp) { const lp = mesh(G.box(0.012, 0.25, 0.006, 0.002, 1), PAINT, { parent: ip, cast: false }); lp.position.copy(ramp.p).addScaledVector(ramp.n, 0.003); orient(lp, ramp.n, V3(0, 1, 0)); }
        // rear fender louvres
        const lv = sideRay(-1.88, 0.66, s);
        if (lv) { const lp2 = P(aeroSys, `חריצי פליטת חום ${sideHe(s)} (5)`, `Rear fender louvres ${sideEn(s)} (×5)`, 'פחם שחור', 'חמישה חריצים אנכיים בכנף האחורית מאפשרים לאוויר החם שבתוך בית הגלגל לברוח החוצה ומקטינים לחץ.'); plate(lp2, lv, 0.2, 0.3, BLKP, { d: 0.01, off: 0.0012, up: V3(0, 1, 0), r: 0.008 }); slatBars(lp2, lv, 0.19, 0.28, 5, true, PAINT, 0.016); }
        // front fender vent slit and shield badge
        const fv = sideRay(0.93, 0.5, s);
        if (fv) { const vp = P(aeroSys, `חריץ אוורור כנף קדמית ${sideHe(s)}`, `Front fender vent ${sideEn(s)}`, 'פחם שחור', 'חריץ אנכי בצד הכנף הקדמית שמשחרר אוויר מבית הגלגל.'); plate(vp, fv, 0.02, 0.1, BLKP, { d: 0.008, off: 0.001, up: V3(0, 1, 0), r: 0.004 }); }
        const sh = sideRay(0.88, 0.65, s);
        if (sh) { const bp = P(trimSys, `סמל פרארי בכנף ${sideHe(s)}`, `Ferrari shield on the fender ${sideEn(s)}`, 'אמייל על פליז', 'מגן קטן עם הסוס המזנק בכנף הקדמית, מעל לחריץ האוורור.'); decal(bp, shield, 0.036, 0.045, sh.p.clone().addScaledVector(sh.n, 0.0025), sh.n, V3(0, 1, 0), { roughness: 0.3, metalness: 0.4 }); }
        const pin = sideRay(-0.79, 0.52, s);
        if (pin) { const t = K.textTexture('Pininfarina', { font: 'italic 600 90px "Brush Script MT",Arial', color: '#d7dade', pad: 8 }); const pp = P(trimSys, `כיתוב Pininfarina ${sideHe(s)}`, `Pininfarina script ${sideEn(s)}`, 'פלסטיק מצופה כרום', 'כיתוב של בית העיצוב שתכנן את הקליפה. פינינפרינה עיצבה כמעט כל פרארי מאז שנות ה־50.'); decal(pp, t.tex, 0.09, 0.09 / t.aspect, pin.p.clone().addScaledVector(pin.n, 0.0022), pin.n, V3(0, 1, 0), { metalness: 0.7, roughness: 0.25 }); }
      }
      // ---- rear exhaust bay: four tailpipes in a recess below the tail panel
      const ex = rearRay(0.4, 0.0);
      if (ex) {
        const eb = P(aeroSys, 'מפרץ פליטה אחורי', 'Rear exhaust bay', 'פחם שחור', 'פתח מלבני בפגוש האחורי שמכיל את ארבעת קצוות הפליטה.');
        plate(eb, ex, 0.38, 0.1, BLKP, { d: 0.02, off: 0.0015, up: V3(0, 1, 0), r: 0.012 });
        const tp = P(sys('fuel'), 'ארבעה צינורות פליטה', 'Four tailpipes', 'נירוסטה', 'ארבעה קצוות פליטה בקוטר כ־55 מ״מ (הערכה), שיוצאים מתוך מפרץ אחד בפגוש האחורי.');
        for (let k = 0; k < 4; k++) { const x0 = (k - 1.5) * 0.085; const m = mesh(G.lathe([[0.0, 0.0], [0.028, 0.0], [0.03, 0.008], [0.028, 0.06], [0.026, 0.06]], 20, 'z'), M.metal(0x7e8187, 0.28), { parent: tp, cast: false }); m.position.copy(ex.p).addScaledVector(ex.n, -0.01); m.position.z += x0; m.position.x += 0.0; orient(m, ex.n, V3(0, 1, 0)); m.position.copy(ex.p).add(V3(0.0, 0, x0)).addScaledVector(ex.n, -0.02); }
      }
    }
    // ================================================================== CHASSIS: tubular steel space frame
    const chSys = sys('chassis'), engSys = sys('engine'), dtSys = sys('drivetrain'), fuelSys = sys('fuel'), elecSys = sys('electrics'), intSys = sys('interior');
    const FRAME = M.metal(0x23252a, 0.5), FRAMEB = M.metal(0x3b3e44, 0.45);
    // cylinder between two points, as geometry in world coordinates (merge many into one mesh)
    const cylBetween = (a, b, r, seg = 8) => { a = v3(a); b = v3(b); const d = b.clone().sub(a), len = d.length(); const g = new THREE.CylinderGeometry(r, r, len, seg, 1); const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()), V3(1, 1, 1)); g.applyMatrix4(m); return g; };
    const tubesGeo = (segs, r, seg = 8) => G.merge(segs.map(([a, b]) => cylBetween(a, b, r, seg)));
    const sym = (list) => list.flatMap(([a, b]) => [[a, b], [[a[0], a[1], -a[2]], [b[0], b[1], -b[2]]]]);
    {
      const fr = P(chSys, 'שלדה צינורית (פלדה מרותכת)', 'Tubular space frame', 'צינורות פלדה מרותכים 25–40 מ״מ', 'שלד מרחבי מצינורות פלדה מרותכים שנושא את המנוע, המתלים והקליפות. הקליפות דבוקות אליו ומוסיפות קשיחות. גישה שהגיעה ישירות ממכוניות המירוץ של פרארי.');
      const S = [];
      // tub: lower and upper sill rails, floor cross tubes, A-pillar hoops, roll hoop behind the seats
      S.push(...sym([[[1.05, 0.2, 0.58], [-0.68, 0.2, 0.58]], [[1.05, 0.5, 0.78], [-0.68, 0.5, 0.78]], [[1.05, 0.2, 0.58], [1.05, 0.5, 0.78]], [[-0.68, 0.2, 0.58], [-0.68, 0.5, 0.78]], [[0.3, 0.2, 0.58], [0.3, 0.5, 0.78]], [[-0.3, 0.2, 0.58], [-0.3, 0.5, 0.78]]]));
      S.push(...sym([[[1.05, 0.5, 0.78], [0.92, 0.84, 0.6]], [[0.92, 0.84, 0.6], [0.2, 1.07, 0.48]], [[0.2, 1.07, 0.48], [-0.6, 1.06, 0.5]], [[-0.6, 1.06, 0.5], [-0.68, 0.5, 0.78]], [[-0.6, 1.06, 0.5], [-0.66, 0.68, 0.62]]]));
      S.push([[0.92, 0.84, -0.6], [0.92, 0.84, 0.6]], [[0.2, 1.07, -0.48], [0.2, 1.07, 0.48]], [[-0.6, 1.06, -0.5], [-0.6, 1.06, 0.5]], [[-0.68, 0.5, -0.78], [-0.68, 0.5, 0.78]], [[1.05, 0.2, -0.58], [1.05, 0.2, 0.58]], [[1.05, 0.5, -0.78], [1.05, 0.5, 0.78]], [[0.3, 0.2, -0.58], [0.3, 0.2, 0.58]], [[-0.3, 0.2, -0.58], [-0.3, 0.2, 0.58]], [[-0.68, 0.2, -0.58], [-0.68, 0.2, 0.58]]);
      S.push(...sym([[[0.3, 0.2, 0.58], [-0.3, 0.5, 0.78]], [[-0.3, 0.2, 0.58], [0.3, 0.5, 0.78]], [[0.3, 0.2, 0.58], [0.3, 0.5, 0.78]]]));
      // central tunnel
      S.push(...sym([[[1.0, 0.36, 0.12], [-0.68, 0.36, 0.12]], [[1.0, 0.2, 0.12], [-0.68, 0.2, 0.12]], [[1.0, 0.2, 0.12], [1.0, 0.36, 0.12]], [[-0.68, 0.2, 0.12], [-0.68, 0.36, 0.12]]]));
      // front subframe (crash structure)
      S.push(...sym([[[1.05, 0.2, 0.58], [1.85, 0.24, 0.46]], [[1.05, 0.5, 0.78], [1.5, 0.58, 0.64]], [[1.5, 0.58, 0.64], [1.85, 0.5, 0.42]], [[1.85, 0.24, 0.46], [1.85, 0.5, 0.42]], [[1.5, 0.24, 0.52], [1.5, 0.58, 0.64]], [[1.05, 0.5, 0.78], [1.5, 0.24, 0.52]], [[1.05, 0.2, 0.58], [1.5, 0.58, 0.64]]]));
      S.push([[1.85, 0.24, -0.46], [1.85, 0.24, 0.46]], [[1.85, 0.5, -0.42], [1.85, 0.5, 0.42]], [[1.5, 0.24, -0.52], [1.5, 0.24, 0.52]], [[1.5, 0.58, -0.64], [1.5, 0.58, 0.64]]);
      // rear engine cradle with suspension towers
      S.push(...sym([[[-0.68, 0.2, 0.42], [-2.05, 0.24, 0.4]], [[-0.68, 0.72, 0.5], [-1.9, 0.76, 0.46]], [[-0.68, 0.2, 0.42], [-0.68, 0.72, 0.5]], [[-1.3, 0.2, 0.42], [-1.3, 0.78, 0.5]], [[-1.9, 0.24, 0.4], [-1.9, 0.76, 0.46]], [[-0.68, 0.72, 0.5], [-1.3, 0.2, 0.42]], [[-1.3, 0.78, 0.5], [-1.9, 0.24, 0.4]], [[-0.68, 0.5, 0.78], [-1.0, 0.7, 0.56]], [[-1.0, 0.7, 0.56], [-1.3, 0.78, 0.5]], [[-1.3, 0.78, 0.5], [-1.25, 0.52, 0.66]]]));
      S.push([[-0.68, 0.72, -0.5], [-0.68, 0.72, 0.5]], [[-1.3, 0.78, -0.5], [-1.3, 0.78, 0.5]], [[-1.9, 0.76, -0.46], [-1.9, 0.76, 0.46]], [[-1.9, 0.24, -0.4], [-1.9, 0.24, 0.4]], [[-1.3, 0.2, -0.42], [-1.3, 0.2, 0.42]], [[-2.05, 0.24, -0.4], [-2.05, 0.24, 0.4]]);
      mesh(tubesGeo(S, 0.0125, 8), FRAME, { parent: fr, name: 'frame tubes' });
      // node gussets: small spheres at the main joints
      const nodes = []; const seen = new Set();
      for (const [a, b] of S) for (const p of [a, b]) { const k = p.join(','); if (!seen.has(k)) { seen.add(k); nodes.push({ pos: p }); } }
      instances(G.sphere(0.0175, 8, 6), FRAMEB, nodes, { parent: fr, cast: false });
      // floor pan, tunnel cover, firewall behind the seats (carbon/Kevlar)
      const fl = P(chSys, 'רצפת תא הנוסעים (קבלר)', 'Cabin floor pan (Kevlar)', 'לוחות קבלר ופחם מודבקים', 'הרצפה והמנהרה בנויות מלוחות קבלר שמודבקים לצינורות. הן אינן מכוסות בשטיח, כדי לחסוך משקל, ולכן תא הנוסעים של ה־F40 חשוף וקולני.');
      mesh(G.box(1.68, 0.012, 1.18, 0.004, 1), M.paintFlat(0x1f2023, 0.8), { parent: fl, pos: [0.19, 0.185, 0], cast: false });
      mesh(G.box(1.68, 0.17, 0.2, 0.03, 2), M.paintFlat(0x232428, 0.75), { parent: fl, pos: [0.19, 0.285, 0] });
      const fw = P(chSys, 'מחיצת אש קדמית', 'Front bulkhead', 'פחם + רפידת בידוד', 'המחיצה בין תא הנהג לתא הקדמי. עליה מורכבים דוושות, צילינדרי בלם ומצמד.');
      mesh(G.box(0.014, 0.6, 1.4, 0.004, 1), M.paintFlat(0x17181b, 0.8), { parent: fw, pos: [1.07, 0.5, 0] });
      const bh = P(chSys, 'מחיצת מנוע אחורית', 'Rear bulkhead', 'פחם + אלומיניום', 'המחיצה שמפרידה בין תא הנהג לבין המנוע. מאחוריה חם מאוד, לכן היא מכוסה בלוח מחזיר חום.');
      mesh(G.box(0.014, 0.66, 1.2, 0.004, 1), M.paintFlat(0x2a2b2e, 0.6), { parent: bh, pos: [-0.69, 0.55, 0] });
      mesh(G.box(0.01, 0.58, 1.1, 0.004, 1), M.metal(0xbec2c7, 0.3), { parent: bh, pos: [-0.703, 0.56, 0] });
      rivets(bh, Array.from({ length: 20 }, (_, k) => ({ pos: [-0.708, 0.3 + Math.floor(k / 10) * 0.52 , -0.52 + (k % 10) * 0.115], rot: [0, 0, PI / 2] })), 0.0045, M.metal(0x6a6e74, 0.4));
      // body-to-frame bonding points (bolts) along the sills
      const sb = P(chSys, 'נקודות חיבור קליפה (ברגי נירוסטה)', 'Body mounting bolts', 'ברגי נירוסטה', 'ברגים שמחזיקים את הקליפה לשלדה, בנוסף לדבק. מאפשרים לפרק קליפה במקרה נזק.');
      bolts(sb, [1, -1].flatMap((s) => Array.from({ length: 8 }, (_, k) => ({ pos: [0.95 - k * 0.22, 0.158, s * 0.62], rot: [0, 0, 0] }))), 0.007, M.steel());
    }
    // ---- front compartment: radiator, fans, battery, spare wheel, jack
    {
      const rad = P(fuelSys, 'מצנן מים קדמי', 'Front radiator', 'אלומיניום (ליבה מצולעת)', 'מצנן גדול בקדמת המכונית, מוטה לאחור, שמקרר את מי המנוע. אוויר נכנס דרך הגריל הקדמי ויוצא בשני פתחי הכיסוי.');
      const rg = new THREE.Group(); rg.position.set(1.62, 0.34, 0); rg.rotation.z = 0.5; rad.add(rg);
      mesh(G.box(0.03, 0.4, 0.72, 0.004, 1), M.metal(0x5a5d62, 0.5), { parent: rg });
      mesh(G.box(0.012, 0.36, 0.68, 0.002, 1), M.metal(0x23262a, 0.6), { parent: rg, pos: [0.021, 0, 0] });
      instances(new THREE.BoxGeometry(0.004, 0.37, 0.003), M.metal(0x8a8e94, 0.4), Array.from({ length: 56 }, (_, k) => ({ pos: [0.03, 0, -0.34 + k * 0.0122] })), { parent: rg, cast: false });
      mesh(G.box(0.07, 0.42, 0.05, 0.01, 1), M.castAlu(), { parent: rg, pos: [-0.04, 0, 0.36] }); mesh(G.box(0.07, 0.42, 0.05, 0.01, 1), M.castAlu(), { parent: rg, pos: [-0.04, 0, -0.36] });
      mesh(G.cyl(0.018, 0.018, 0.09, 12, 'z'), M.metal(0x95999f, 0.4), { parent: rg, pos: [-0.04, 0.2, 0.36], rot: [PI / 2, 0, 0] });
      const fans = P(fuelSys, 'שני מאווררי קירור חשמליים', 'Electric cooling fans (×2)', 'פלסטיק + מנוע חשמלי', 'שני מאווררים חשמליים מאחורי המצנן שמופעלים בחום מנוע גבוה או בעמידה, כשאין זרימת אוויר.');
      const fanBlade = G.merge(Array.from({ length: 7 }, (_, k) => G.at(G.box(0.1, 0.004, 0.032, 0.002, 1), [0.05, 0, 0], [0, 0, 0.0]).rotateX(0.0).rotateY(0).rotateZ(0).applyMatrix4(new THREE.Matrix4().makeRotationY((k / 7) * PI * 2))));
      for (const z of [-0.18, 0.18]) { const fgp = new THREE.Group(); fgp.position.set(1.54, 0.34, z); fgp.rotation.z = 0.5; fans.add(fgp); mesh(G.lathe([[0.1, -0.03], [0.1, 0.03], [0.108, 0.03], [0.108, -0.03]], 28, 'x'), BLKP, { parent: fgp }); const hub = mesh(G.cyl(0.025, 0.025, 0.04, 14, 'x'), M.metal(0x1c1d20, 0.5), { parent: fgp }); const bl = mesh(fanBlade, M.plastic(0x0c0c0e, 0.5), { parent: fgp }); bl.rotation.x = 0; bl.quaternion.setFromEuler(new THREE.Euler(0, 0, PI / 2)); fgp.userData.fan = bl; }
      const bat = P(elecSys, 'מצבר 12 וולט', '12 V battery', 'עופרת־חומצה במארז פלסטיק', 'מצבר אחד בתא הקדמי, שמשמש גם כמשקל נגד למנוע שמאחור. החוטים עוברים אל המנוע דרך המנהרה.');
      mesh(G.box(0.24, 0.18, 0.17, 0.008, 1), M.plastic(0x1c1f24, 0.5), { parent: bat, pos: [1.22, 0.3, -0.5] }); put(G.cyl(0.011, 0.011, 0.014, 10, 'y'), M.metal(0xb8bcc2, 0.3), bat, [1.1, 0.4, -0.46]); put(G.cyl(0.011, 0.011, 0.014, 10, 'y'), M.metal(0xb8bcc2, 0.3), bat, [1.1, 0.4, -0.54]);
      const sp = P(sys('wheels'), 'גלגל חילוף קטן', 'Compact spare wheel', 'פלדה + גומי', 'גלגל חילוף קטן בתא הקדמי, בנוי להחלפה זמנית כדי להגיע לתיקון. חיסכון במשקל ובמקום.');
      const sg = new THREE.Group(); sg.position.set(1.58, 0.43, 0.0); sg.rotation.z = -0.12; sp.add(sg);
      mesh(G.lathe([[0.1, -0.05], [0.15, -0.055], [0.268, -0.045], [0.285, -0.02], [0.285, 0.02], [0.268, 0.045], [0.15, 0.055], [0.1, 0.05]], 48, 'y'), M.tire(), { parent: sg, pos: [0, 0.0, 0], rot: [0, 0, 0] });
      mesh(G.cyl(0.14, 0.14, 0.012, 32, 'y'), M.metal(0x9a9ea4, 0.35), { parent: sg, pos: [0, 0.052, 0] });
      const jk = P(chSys, 'ג׳ק וערכת כלים', 'Jack and tool roll', 'פלדה + בד', 'מגבה ומפתח גלגל בחבילה קטנה בתא הקדמי.');
      mesh(G.box(0.2, 0.06, 0.1, 0.01, 1), M.metal(0x6b6f76, 0.5), { parent: jk, pos: [1.66, 0.28, 0.42] }); mesh(G.cyl(0.02, 0.02, 0.26, 10, 'z'), M.fabric(0x252a31), { parent: jk, pos: [1.6, 0.27, 0.0] });
    }
    // ---- fuel: two flexible bladder tanks along the sills
    {
      for (const s of [1, -1]) {
        const tk = P(fuelSys, `מיכל דלק גמיש ${sideHe(s)} (60 ל׳)`, `${s > 0 ? 'Right' : 'Left'} bladder fuel tank (60 L)`, 'גומי מצופה קבלר', 'מיכל דלק גמיש שחור שיושב לאורך הסף בין הסרנים, מבודד מהקליפה. שני המיכלים יחד מכילים 120 ליטר.');
        mesh(G.soft(1.0, 0.18, 0.22, { r: 0.05, seg: 5, deform: (p, n) => { p.y += 0.0; } }), M.rubber(), { parent: tk, pos: [0.4, 0.26, s * 0.66] });
      }
      const pump = P(fuelSys, 'משאבות דלק (2)', 'Fuel pumps (×2)', 'פלדה + נחושת', 'שתי משאבות דלק חשמליות שמזינות את מערכת ההזרקה בלחץ גבוה.');
      for (const s of [1, -1]) mesh(G.cyl(0.03, 0.03, 0.12, 14, 'x'), M.metal(0x4b4f55, 0.4), { parent: pump, pos: [-0.12, 0.28, s * 0.52] });
      const lines = P(fuelSys, 'צנרת דלק ומים (נחושת ואלומיניום)', 'Fuel and coolant lines', 'אלומיניום + נחושת', 'שני צינורות קירור ארוכים לאורך המנהרה מקדמת המכונית אל המנוע, וצינורות דלק לצידם.');
      for (const s of [1, -1]) mesh(G.tube([V3(1.5, 0.2, s * 0.14), V3(0.6, 0.17, s * 0.15), V3(-0.4, 0.17, s * 0.15), V3(-0.9, 0.3, s * 0.2)], 0.018, 40, 10), M.metal(0xb4b8be, 0.3), { parent: lines });
      mesh(G.tube([V3(-0.3, 0.17, 0.05), V3(-0.8, 0.2, 0.05), V3(-1.0, 0.3, 0.1)], 0.006, 30, 6), M.copper(), { parent: lines });
    }
    // ================================================================== SUSPENSION, STEERING, BRAKE HYDRAULICS
    const helix = (a, b, rc, turns, r, seg = 12) => { a = v3(a); b = v3(b); const d = b.clone().sub(a), len = d.length(), ax = d.clone().normalize(); const u = Math.abs(ax.y) < 0.9 ? V3(0, 1, 0).cross(ax).normalize() : V3(1, 0, 0).cross(ax).normalize(), w = ax.clone().cross(u); const pts = []; const N = Math.round(turns * seg); for (let i = 0; i <= N; i++) { const t = i / N, th = t * turns * PI * 2; pts.push(a.clone().addScaledVector(ax, t * len).addScaledVector(u, Math.cos(th) * rc).addScaledVector(w, Math.sin(th) * rc)); } return G.tube(pts, r, N * 2, 5, false, 'catmullrom', 0.5); };
    const SPR = M.metal(0xd2a21a, 0.4), DAMP = M.metal(0x1e2024, 0.35);
    const coilOver = (parent, lo, hi, nm, nmE, desc, spring = 0.034) => {
      const cp = P(parent, nm, nmE, 'פלדה + אלומיניום + קפיץ פלדה', desc);
      lo = v3(lo); hi = v3(hi); const d = hi.clone().sub(lo), len = d.length(), ax = d.clone().normalize();
      mesh(cylBetween(lo, lo.clone().addScaledVector(ax, len * 0.55), 0.016, 12), M.metal(0x9fa3a9, 0.3), { parent: cp });          // piston rod
      mesh(cylBetween(lo.clone().addScaledVector(ax, len * 0.42), hi, 0.024, 14), DAMP, { parent: cp });                              // damper body
      mesh(helix(lo.clone().addScaledVector(ax, len * 0.06), hi.clone().addScaledVector(ax, -len * 0.08), spring, 9, 0.0045), SPR, { parent: cp });
      mesh(G.cyl(0.04, 0.04, 0.012, 20, 'y').applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), ax))).translate(...lo.clone().addScaledVector(ax, len * 0.06).toArray()), M.metal(0x333539, 0.4), { parent: cp });
      mesh(G.cyl(0.04, 0.04, 0.012, 20, 'y').applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), ax))).translate(...hi.clone().addScaledVector(ax, -len * 0.08).toArray()), M.metal(0x333539, 0.4), { parent: cp });
      mesh(G.sphere(0.012, 10, 8), CHROME, { parent: cp, pos: lo.toArray() }); mesh(G.sphere(0.012, 10, 8), CHROME, { parent: cp, pos: hi.toArray() });
      return cp;
    };
    const tieRods = [];
    const rodUpdate = (m, a, b) => { const d = b.clone().sub(a), l = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); m.scale.set(1, l, 1); };
    {
      const ARM = M.metal(0x2d3036, 0.4), ARMH = M.metal(0x5a5f66, 0.4);
      for (const s of [1, -1]) {
        const sH = sideHe(s), sE = sideEn(s);
        // ---- front axle
        const J = { lo: [1.225, 0.2, s * 0.7], up: [1.225, 0.47, s * 0.72] };
        const ful = P(suspSys, `משולש תחתון קדמי ${sH}`, `Front lower wishbone ${sE}`, 'צינורות פלדה מרותכים', 'זרוע תחתונה בצורת A שמחברת את ציר הגלגל לשלדה בשתי נקודות. נושאת את הקפיץ והבולם.');
        mesh(G.merge([cylBetween([1.38, 0.22, s * 0.44], J.lo, 0.014), cylBetween([1.07, 0.22, s * 0.44], J.lo, 0.014), cylBetween([1.38, 0.22, s * 0.44], [1.07, 0.22, s * 0.44], 0.011)]), ARM, { parent: ful });
        const fuu = P(suspSys, `משולש עליון קדמי ${sH}`, `Front upper wishbone ${sE}`, 'צינורות פלדה מרותכים', 'זרוע עליונה קצרה יותר. אורכי הזרועות השונים קובעים איך הגלגל נטוי כשהמתלה נדחס.');
        mesh(G.merge([cylBetween([1.33, 0.52, s * 0.4], J.up, 0.012), cylBetween([1.1, 0.52, s * 0.4], J.up, 0.012), cylBetween([1.33, 0.52, s * 0.4], [1.1, 0.52, s * 0.4], 0.009)]), ARM, { parent: fuu });
        for (const [x, y, z] of [[1.38, 0.22, s * 0.44], [1.07, 0.22, s * 0.44], [1.33, 0.52, s * 0.4], [1.1, 0.52, s * 0.4]]) put(G.sphere(0.016, 10, 8), ARMH, ful, [x, y, z]);
        coilOver(suspSys, [1.225, 0.23, s * 0.55], [1.2, 0.64, s * 0.36], `בולם־קפיץ קדמי ${sH} (Koni)`, `Front coil-over ${sE}`, 'קפיץ סליל צהוב על בולם Koni מתכוונן. הקפיץ נושא את משקל המכונית והבולם מרסן את התנודות.');
        const up = P(suspSys, `צירון קדמי ${sH}`, `Front upright ${sE}`, 'אלומיניום יצוק', 'הצירון הוא החלק שנושא את גלגל, הבלם והמיסב ומחבר אותם לשתי הזרועות.');
        mesh(G.soft(0.07, 0.31, 0.06, { r: 0.015, seg: 3 }), M.castAlu(), { parent: up, pos: [1.225, 0.34, s * 0.715] });
        mesh(G.cyl(0.04, 0.04, 0.08, 18, 'z'), M.metal(0x9a9ea4, 0.3), { parent: up, pos: [1.225, TRF, s * 0.74] });
        put(G.sphere(0.017, 10, 8), M.metal(0xb8bcc2, 0.3), up, J.lo); put(G.sphere(0.017, 10, 8), M.metal(0xb8bcc2, 0.3), up, J.up);
        const ba = P(suspSys, `בולם פגוש ${sH} (קדמי)`, `Front bump stop ${sE}`, 'פוליאוריתן', 'כרית פוליאוריתן שמגבילה את המהלך המקסימלי של המתלה.');
        put(G.cyl(0.02, 0.026, 0.05, 12, 'y'), M.rubber(), ba, [1.2, 0.58, s * 0.4]);
        // ---- rear axle
        const R = { lo: [-1.225, 0.2, s * 0.7], up: [-1.225, 0.5, s * 0.72] };
        const rul = P(suspSys, `משולש תחתון אחורי ${sH}`, `Rear lower wishbone ${sE}`, 'צינורות פלדה מרותכים', 'זרוע תחתונה מאחור, רחבה יותר כדי לשאת כוחות האצה גדולים מהצמיג ברוחב 335.');
        mesh(G.merge([cylBetween([-1.0, 0.24, s * 0.4], R.lo, 0.016), cylBetween([-1.45, 0.24, s * 0.4], R.lo, 0.016), cylBetween([-1.0, 0.24, s * 0.4], [-1.45, 0.24, s * 0.4], 0.012)]), ARM, { parent: rul });
        const ruu = P(suspSys, `משולש עליון אחורי ${sH}`, `Rear upper wishbone ${sE}`, 'צינורות פלדה מרותכים', 'זרוע עליונה אחורית, מחוברת למגדל בשלדה מעל תיבת ההילוכים.');
        mesh(G.merge([cylBetween([-1.08, 0.62, s * 0.44], R.up, 0.013), cylBetween([-1.37, 0.62, s * 0.44], R.up, 0.013), cylBetween([-1.08, 0.62, s * 0.44], [-1.37, 0.62, s * 0.44], 0.01)]), ARM, { parent: ruu });
        for (const [x, y, z] of [[-1.0, 0.24, s * 0.4], [-1.45, 0.24, s * 0.4], [-1.08, 0.62, s * 0.44], [-1.37, 0.62, s * 0.44]]) put(G.sphere(0.017, 10, 8), ARMH, rul, [x, y, z]);
        const tl = P(suspSys, `זרוע הצמדה (Toe) ${sH}`, `Rear toe link ${sE}`, 'פלדה + מפרקים כדוריים', 'מוט קצר שקובע את זווית ההצמדה של הגלגל האחורי תוך כדי תנועת המתלה.');
        mesh(cylBetween([-1.52, 0.3, s * 0.4], [-1.4, 0.3, s * 0.7], 0.009), ARM, { parent: tl });
        coilOver(suspSys, [-1.225, 0.23, s * 0.56], [-1.2, 0.76, s * 0.34], `בולם־קפיץ אחורי ${sH} (Koni)`, `Rear coil-over ${sE}`, 'קפיץ סליל ובולם אחורי כמעט אנכי, בנוי כך שיעמוד בעומס של מנוע טורבו ומשקל מוגבר מאחור.', 0.04);
        const ru = P(suspSys, `צירון אחורי ${sH}`, `Rear upright ${sE}`, 'אלומיניום יצוק', 'צירון אחורי רחב שנושא את מיסב הגלגל, את הבלם ואת הציר ההנעה.');
        mesh(G.soft(0.08, 0.35, 0.065, { r: 0.016, seg: 3 }), M.castAlu(), { parent: ru, pos: [-1.225, 0.36, s * 0.715] });
        mesh(G.cyl(0.045, 0.045, 0.08, 18, 'z'), M.metal(0x9a9ea4, 0.3), { parent: ru, pos: [-1.225, TRR, s * 0.74] });
        put(G.sphere(0.018, 10, 8), M.metal(0xb8bcc2, 0.3), ru, R.lo); put(G.sphere(0.018, 10, 8), M.metal(0xb8bcc2, 0.3), ru, R.up);
      }
      // anti-roll bars
      const arb = P(suspSys, 'מייצב קדמי', 'Front anti-roll bar', 'פלדת קפיץ', 'מוט פיתול שמחבר את שני הגלגלים כדי לצמצם נטיית גוף בפניות.');
      mesh(G.tube([V3(1.12, 0.26, -0.5), V3(1.12, 0.26, -0.3), V3(1.12, 0.26, 0.3), V3(1.12, 0.26, 0.5), V3(1.18, 0.23, 0.55)], 0.011, 30, 8), M.metal(0x3f4348, 0.4), { parent: arb });
      mesh(G.tube([V3(1.12, 0.26, -0.5), V3(1.18, 0.23, -0.55)], 0.011, 6, 8), M.metal(0x3f4348, 0.4), { parent: arb });
      const arbr = P(suspSys, 'מייצב אחורי', 'Rear anti-roll bar', 'פלדת קפיץ', 'מוט מייצב נוסף מאחור; משותף לאיזון בין תת־היגוי לעודף היגוי.');
      mesh(G.tube([V3(-1.55, 0.3, -0.56), V3(-1.55, 0.3, -0.3), V3(-1.55, 0.3, 0.3), V3(-1.55, 0.3, 0.56), V3(-1.4, 0.26, 0.6)], 0.012, 30, 8), M.metal(0x3f4348, 0.4), { parent: arbr });
      mesh(G.tube([V3(-1.55, 0.3, -0.56), V3(-1.4, 0.26, -0.6)], 0.012, 6, 8), M.metal(0x3f4348, 0.4), { parent: arbr });
      // steering rack, tie rods and column
      const rk = P(suspSys, 'תיבת היגוי (מסור ושן)', 'Steering rack', 'אלומיניום + פלדה', 'תיבת היגוי פשוטה בלי סרוו הידראולי: הנהג מרגיש כל מהלך של הכביש בהגה, אבל במהירות נמוכה ההיגוי כבד.');
      mesh(G.cyl(0.03, 0.03, 0.62, 16, 'z'), M.castAlu(), { parent: rk, pos: [1.0, 0.32, 0] });
      for (const s of [1, -1]) mesh(G.cyl(0.02, 0.016, 0.1, 12, 'z'), M.rubber(), { parent: rk, pos: [1.0, 0.32, s * 0.33] });
      const colG = P(suspSys, 'עמוד הגה ופרק קרדן', 'Steering column & universal joint', 'פלדה', 'עמוד היגוי שמחבר את ההגה לתיבה דרך פרק קרדן, כדי להתגבר על הזווית.');
      rod(colG, [0.6, 0.72, -0.36], [0.82, 0.55, -0.34], 0.012, M.metal(0x2a2c30, 0.4)); put(G.sphere(0.022, 12, 8), CHROME, colG, [0.82, 0.55, -0.34]); rod(colG, [0.82, 0.55, -0.34], [1.0, 0.34, -0.1], 0.01, M.metal(0x2a2c30, 0.4));
      for (const s of [1, -1]) {
        const tr = P(suspSys, `מוט הגה ${sideHe(s)}`, `Tie rod ${sideEn(s)}`, 'פלדה + מפרקים כדוריים', 'מוט שמעביר את תנועת תיבת ההיגוי אל זרוע ההיגוי שעל הצירון ומסובב את הגלגל.');
        const m = mesh(G.cyl(0.0085, 0.0085, 1, 10, 'y'), M.metal(0x9a9ea4, 0.3), { parent: tr }); tieRods.push({ m, s });
        put(G.sphere(0.014, 10, 8), CHROME, tr, [1.0, 0.32, s * 0.33]); put(G.sphere(0.014, 10, 8), CHROME, tr, [1.08, 0.3, s * 0.72]);
        put(G.box(0.02, 0.012, 0.09, 0.003, 1), M.metal(0x6a6e74, 0.4), tr, [1.12, 0.3, s * 0.72]);
      }
      const setRods = (a) => { for (const t of tieRods) { const s = t.s; const arm = V3(-0.13, 0, -s * 0.09).applyAxisAngle(V3(0, 1, 0), a).add(V3(1.225, 0.3, s * 0.8)); const rack = V3(1.0, 0.32, s * 0.33 + a * 0.18 * 1.0); rodUpdate(t.m, rack, arm); } };
      setRods(0); setRodsFn = setRods;
    }
    // ---- brake hydraulics
    {
      const mc = P(brakesSys, 'צילינדר ראשי כפול ובקבוק נוזל', 'Dual master cylinder & reservoir', 'אלומיניום + פלסטיק', 'צילינדר ראשי עם שני מעגלים נפרדים, אחד לקדמי ואחד לאחורי: אם מעגל אחד נכשל, השני עדיין בולם. הבקבוק מעל הנוזל.');
      mesh(G.cyl(0.021, 0.021, 0.15, 16, 'x'), M.castAlu(), { parent: mc, pos: [0.98, 0.5, -0.32] }); mesh(G.cyl(0.03, 0.03, 0.07, 16, 'y'), M.glass(0xd8c88c, 0.6), { parent: mc, pos: [0.96, 0.56, -0.32] }); put(G.cyl(0.0225, 0.0225, 0.012, 14, 'y'), BLK, mc, [0.96, 0.6, -0.32]);
      const bl = P(brakesSys, 'צינורות בלם הידראוליים', 'Hydraulic brake lines', 'נירוסטה קלועה', 'צינורות נירוסטה קלועים בצבע כחול שמובילים נוזל מהצילינדר הראשי לארבעת הקליפרים. קלועים כדי למנוע התנפחות בלחץ גבוה.');
      for (const [x, z] of [[AXF, 0.62], [AXF, -0.62], [AXR, 0.64], [AXR, -0.64]]) mesh(G.tube([V3(0.98, 0.5, -0.32), V3(1.0, 0.3, -0.3), V3(0.95, 0.15, z * 0.2), V3(x * 0.9, 0.14, z * 0.7), V3(x, 0.3, z)], 0.0035, 60, 6), M.metal(0x4a6fa8, 0.3), { parent: bl });
    }
    // ================================================================== ENGINE: 2.9 L twin-turbo V8 (longitudinal, behind the cabin)
    const CY = 0.33, CRK = 0.0348, ROD = 0.135, BORE = 0.082;
    const XP = [-0.866, -0.97, -1.074, -1.178], XC = -1.022, PH = [0, PI / 2, PI * 1.5, PI];   // cylinder x, bank centre x, crank pin phases (cross-plane)
    const REDC = M.metal(0xa8120e, 0.55), CASTD = M.metal(0x6d7177, 0.5), ALUD = M.metal(0x9a9ea4, 0.45), EXH = M.metal(0x5a4a3c, 0.5);
    const bkW = (s, x, yl, zl) => { const c = Math.SQRT1_2, sn = s * Math.SQRT1_2; return V3(x, CY + yl * c - zl * sn, yl * sn + zl * c); };   // bank-local -> world
    const MOT = { piston: [] };
    {
      const eng = P(engSys, 'מנוע V8 טורבו כפול (2,936 סמ״ק)', 'Twin-turbo V8 engine (2.936 L)', 'אלומיניום יצוק + פלדה', 'מנוע F120A: V8 ב־90° בנפח 2,936 סמ״ק, 32 שסתומים, שני טורבו IHI ושני מצננים בין־אווריים. מייצר 478 כ״ס ב־7,000 סל״ד ו־577 ניוטון־מטר ב־4,000. יושב לאורך המכונית מאחורי הנהג.');
      MOT.root = eng;
      // crankcase / oil sump
      const cc = P(engSys, 'בית ארכובה ואמבט שמן', 'Crankcase and oil sump', 'אלומיניום יצוק', 'החצי התחתון של המנוע, שמחזיק את גל הארכובה ואת השמן. בצדדים יש צלעות חיזוק.');
      mesh(G.soft(0.58, 0.14, 0.34, { r: 0.03, seg: 4 }), CASTD, { parent: cc, pos: [XC, CY - 0.05, 0] });
      mesh(G.box(0.46, 0.06, 0.28, 0.012, 1), ALUD, { parent: cc, pos: [XC, CY - 0.14, 0] });
      for (let k = 0; k < 7; k++) put(G.box(0.012, 0.045, 0.3, 0.003, 1), ALUD, cc, [XC - 0.22 + k * 0.073, CY - 0.185, 0]);
      mesh(G.cyl(0.011, 0.011, 0.012, 6, 'y'), M.steel(), { parent: cc, pos: [XC + 0.1, CY - 0.225, 0.06] });
      for (let k = 0; k < 4; k++) put(G.box(0.014, 0.016, 0.36, 0.004, 1), CASTD, cc, [XP[k], CY - 0.05, 0]);
      // crankshaft (rotates)
      const crk = P(engSys, 'גל ארכובה (4 זרועות)', 'Crankshaft (four throws)', 'פלדה מחושלת', 'גל הארכובה מקבל מכל זוג בוכנות כוח ומעביר לגלגל התנופה. הזרועות במרווחי 90° (Cross-plane), מבנה שנותן ל־V8 את צליל הרעם האופייני.');
      const crankG = new THREE.Group(); crankG.position.set(0, CY, 0); crk.add(crankG); MOT.crank = crankG;
      mesh(G.cyl(0.024, 0.024, 0.62, 18, 'x'), M.steel(), { parent: crankG, pos: [XC - 0.03, 0, 0] });
      PH.forEach((ph, i) => {
        const y = CRK * Math.cos(ph), z = CRK * Math.sin(ph);
        mesh(G.cyl(0.021, 0.021, 0.05, 14, 'x'), M.metal(0x8a8e94, 0.3), { parent: crankG, pos: [XP[i], y, z] });
        for (const dx of [-0.035, 0.035]) { mesh(G.box(0.012, 0.075, 0.05, 0.004, 1), M.steel(), { parent: crankG, pos: [XP[i] + dx, y * 0.5, z * 0.5], rot: [ph, 0, 0] }); put(G.box(0.012, 0.06, 0.07, 0.004, 1), M.darkSteel(), crankG, [XP[i] + dx, -Math.cos(ph) * 0.045, -Math.sin(ph) * 0.045], [ph, 0, 0]); }
      });
      // front damper pulley and flywheel
      mesh(G.lathe([[0.0, -0.02], [0.055, -0.02], [0.062, -0.008], [0.062, 0.02], [0.0, 0.02]], 36, 'x'), M.metal(0x2b2d31, 0.45), { parent: crankG, pos: [-0.79, 0, 0] });
      const fly = P(dtSys, 'גלגל תנופה וטבעת מתנע', 'Flywheel with ring gear', 'פלדה', 'גלגל כבד שמחליק את פעימות המנוע ומחזיק את טבעת השיניים שהמתנע תופס בה.');
      const flyG = new THREE.Group(); flyG.position.set(-1.29, CY, 0); fly.add(flyG); MOT.fly = flyG;
      mesh(G.cyl(0.14, 0.14, 0.028, 40, 'x'), M.metal(0x5b5e64, 0.35), { parent: flyG });
      mesh(G.cyl(0.152, 0.152, 0.012, 60, 'x'), M.metal(0x34363a, 0.5), { parent: flyG, pos: [-0.006, 0, 0] });
      instances(new THREE.BoxGeometry(0.01, 0.006, 0.006), M.steel(), Array.from({ length: 36 }, (_, k) => { const a = (k / 36) * PI * 2; return { pos: [-0.006, Math.cos(a) * 0.1585, Math.sin(a) * 0.1585], rot: [a, 0, 0] }; }), { parent: flyG, cast: false });
      // two banks at 45 degrees
      for (const s of [1, -1]) {
        const bnk = new THREE.Group(); bnk.position.set(0, CY, 0); bnk.rotation.x = s * PI / 4; engSys.add(bnk);
        const blk = P(bnk, `גוף ושרוולי צילינדר ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} cylinder bank`, 'אלומיניום יצוק + שרוולי ברזל', 'ארבעה צילינדרים בשורה, 82×69.5 מ״מ. השרוולים מברזל והגוף מאלומיניום, כדי להוריד משקל ועדיין לעמוד בלחץ הגבוה של הטורבו.'); blk.userData.sysOverride = 'engine';
        mesh(G.box(0.49, 0.15, 0.2, 0.012, 1), CASTD, { parent: blk, pos: [XC, 0.12, 0] });
        instances(G.cyl(0.0415, 0.0415, 0.02, 20, 'y'), M.metal(0x2e3034, 0.5), XP.map((x) => ({ pos: [x, 0.196, 0] })), { parent: blk, cast: false });
        const hd = P(bnk, `ראש צילינדרים ${sideHe(s)} (16 שסתומים)`, `${s > 0 ? 'Right' : 'Left'} cylinder head (16 valves)`, 'אלומיניום יצוק', 'ראש עם שני גלי זיזים ו־16 שסתומים (ארבעה לכל צילינדר): שני שסתומי יניקה ושניים לפליטה. תא שריפה בצורת גג משופע.'); hd.userData.sysOverride = 'engine';
        mesh(G.box(0.49, 0.1, 0.22, 0.01, 1), ALUD, { parent: hd, pos: [XC, 0.255, 0] });
        // cam covers (red crinkle) with plug wells between them
        for (const dz of [-0.06, 0.06]) {
          const cv = P(bnk, `כיסוי גל זיזים ${dz < 0 ? 'פנימי' : 'חיצוני'} ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} ${dz < 0 ? 'inner' : 'outer'} cam cover`, 'מגנזיום צבוע אדום קמטים', 'כיסוי אדום קמטים עם כיתוב Ferrari. הצבע הזה הוא סימן ההיכר של מנועי פרארי מהשנים ההן.'); cv.userData.sysOverride = 'engine';
          mesh(G.box(0.46, 0.04, 0.09, 0.01, 2), REDC, { parent: cv, pos: [XC, 0.328, dz] });
          const t = K.textTexture('Ferrari', { font: 'italic 700 80px "Brush Script MT",Arial', color: '#e8e3d4', pad: 6 });
          mesh(new THREE.PlaneGeometry(0.1, 0.1 / t.aspect), M.decal(t.tex), { parent: cv, pos: [XC, 0.3485, dz], rot: [-PI / 2, 0, 0], cast: false });
          instances(G.cyl(0.004, 0.004, 0.006, 8, 'y'), M.metal(0x303236, 0.4), Array.from({ length: 10 }, (_, k) => ({ pos: [XC - 0.2 + k * 0.044, 0.35, dz + (k % 2 ? 0.032 : -0.032)] })), { parent: cv, cast: false });
        }
        // camshafts (rotate at half crank speed) with cam lobes
        for (const dz of [-0.06, 0.06]) {
          const cm = P(bnk, `גל זיזים ${dz < 0 ? 'פנימי' : 'חיצוני'} ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} camshaft`, 'פלדה מחושלת', 'גל זיזים שמפעיל שמונה שסתומים. מסתובב במחצית מהירות גל הארכובה, ומונע בחגורה משוננת.'); cm.userData.sysOverride = 'engine';
          const cg = new THREE.Group(); cg.position.set(0, 0.29, dz); cm.add(cg); MOT.cam = MOT.cam || []; MOT.cam.push(cg);
          mesh(G.cyl(0.011, 0.011, 0.5, 12, 'x'), M.steel(), { parent: cg, pos: [XC, 0, 0] });
          instances(G.cyl(0.017, 0.017, 0.012, 10, 'x'), M.metal(0x7b7f85, 0.3), XP.flatMap((x) => [x - 0.018, x + 0.018]).map((x, k) => ({ pos: [x, 0.006 * (k % 2 ? 1 : -1), 0], rot: [0, 0, 0] })), { parent: cg, cast: false });
        }
        // spark plugs with boots, one per cylinder
        const pg = P(elecSys, `מצתים ${sideHe(s)} (4)`, `${s > 0 ? 'Right' : 'Left'} spark plugs (×4)`, 'קרמיקה + ניקל', 'מצת אחד לכל צילינדר, בתוך באר בין שני גלי הזיזים. כבלים שחורים מובילים מהם אל המפזר.'); pg.userData.sysOverride = 'electrics';
        instances(G.cyl(0.0085, 0.0085, 0.05, 10, 'y'), M.black(), XP.map((x) => ({ pos: [x, 0.372, 0] })), { parent: pg });
        instances(G.cyl(0.006, 0.006, 0.02, 8, 'y'), M.metal(0xdad6cc, 0.4), XP.map((x) => ({ pos: [x, 0.405, 0] })), { parent: pg, cast: false });
        // pistons and rods (animated)
        const pc = P(bnk, `בוכנות ומוטות חיבור ${sideHe(s)} (4)`, `${s > 0 ? 'Right' : 'Left'} pistons and rods (×4)`, 'אלומיניום מחושל + פלדה', 'בוכנה מחושלת עם שלוש טבעות ומוט חיבור מפלדה. הבוכנות נעות כ־70 מ״מ מעלה ומטה: בסל״ד 7,000 כל בוכנה עושה כ־117 מחזורים בשנייה.'); pc.userData.sysOverride = 'engine';
        XP.forEach((x, i) => {
          const pis = mesh(G.merge([G.cyl(0.0405, 0.0405, 0.05, 18, 'y'), G.at(G.torus(0.0405, 0.0018, 4, 18, PI * 2, 'y'), [0, 0.015, 0]), G.at(G.torus(0.0405, 0.0018, 4, 18, PI * 2, 'y'), [0, 0.006, 0]), G.at(G.torus(0.0405, 0.0018, 4, 18, PI * 2, 'y'), [0, -0.003, 0])]), M.metal(0xb7bbc1, 0.3), { parent: pc });
          const rodm = mesh(G.cyl(0.008, 0.012, 1, 8, 'y'), M.steel(), { parent: pc });
          MOT.piston.push({ piston: pis, rodm, c: { x, s, ph: PH[i] } });
        });
        // belt drive on the front: pulleys and a toothed belt
        const bt = P(engSys, `חגורת גלי זיזים ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} cam belt`, 'גומי משוריין + משוננת', 'חגורה משוננת שמסנכרנת בין גל הארכובה לגלי הזיזים. אם נקרעת, המנוע עלול להינזק, ולכן מחליפים אותה במועדים קבועים.'); bt.userData.sysOverride = 'engine';
        const cp = [bkW(s, -0.8, 0.29, -0.06), bkW(s, -0.8, 0.29, 0.06)];
        for (const p of cp) mesh(G.lathe([[0.0, -0.014], [0.028, -0.014], [0.032, -0.006], [0.032, 0.014], [0.0, 0.014]], 24, 'x'), M.metal(0x2c2e32, 0.5), { parent: bt, pos: p.toArray() });
        const crP = V3(-0.8, CY, 0);
        const loopPts = [crP.clone().add(V3(0, 0.055, s * 0.0)), cp[0].clone().add(V3(0, 0, -0.035 * 0)), cp[1], crP.clone().add(V3(0, -0.01, s * 0.06))];
        mesh(G.tube([bkW(s, -0.8, 0.0, -0.07), bkW(s, -0.8, 0.29, -0.092), bkW(s, -0.8, 0.325, 0.0), bkW(s, -0.8, 0.29, 0.092), bkW(s, -0.8, 0.0, 0.07), bkW(s, -0.8, -0.03, 0.0)], 0.0075, 60, 6, true, 'catmullrom', 0.5), M.rubber(), { parent: bt });
      }
      // ---- the engine rest of parts: accessory drive and ancillaries
      const alt = P(elecSys, 'אלטרנטור', 'Alternator', 'אלומיניום + נחושת', 'מייצר חשמל לכל המכונית ומטעין את המצבר. מונע בעזרת רצועה מגל הארכובה.');
      mesh(G.cyl(0.055, 0.055, 0.1, 18, 'x'), M.metal(0x3a3d42, 0.5), { parent: alt, pos: [-0.78, 0.22, -0.2] }); mesh(G.lathe([[0.0, 0], [0.035, 0], [0.04, 0.01], [0.0, 0.01]], 20, 'x'), M.metal(0x2c2e32, 0.5), { parent: alt, pos: [-0.74, 0.22, -0.2] });
      const wp = P(sys('fuel'), 'משאבת מים', 'Water pump', 'אלומיניום יצוק', 'משאבה שמזרימה נוזל קירור בין המנוע למצנן הקדמי דרך הצינורות הארוכים שלאורך המכונית.');
      mesh(G.cyl(0.05, 0.05, 0.06, 18, 'x'), CASTD, { parent: wp, pos: [-0.78, 0.2, 0.0] }); mesh(G.cyl(0.02, 0.02, 0.12, 12, 'z'), M.rubber(), { parent: wp, pos: [-0.78, 0.17, 0.0] });
      const of = P(engSys, 'מסנן שמן', 'Oil filter', 'פלדה צבועה', 'מסנן שמן גדול שמנקה את השמן ממתכת ופיח. בצבע אדום כמו שאר חלקי המנוע.'); of.userData.sysOverride = 'engine';
      mesh(G.cyl(0.04, 0.04, 0.12, 16, 'z'), REDC, { parent: of, pos: [-1.1, 0.14, 0.2], rot: [0, 0, 0] });
      const oc = P(engSys, 'פקק מילוי שמן', 'Oil filler cap', 'אלומיניום', 'פקק עם כיתוב OIL לשמן המנוע.'); oc.userData.sysOverride = 'engine';
      put(G.cyl(0.022, 0.022, 0.02, 16, 'y'), M.metal(0xc4c8cd, 0.3), oc, bkW(1, XC - 0.18, 0.35, 0.0).toArray());
      const ds = P(engSys, 'מוט מדידת שמן', 'Dipstick', 'פלדה + גומי', 'מוט למדידת מפלס השמן.'); ds.userData.sysOverride = 'engine'; rod(ds, [XC + 0.18, 0.4, -0.12], [XC + 0.18, 0.62, -0.1], 0.0035, M.steel()); put(G.sphere(0.01, 8, 6), M.gloss(0xe1b020), ds, [XC + 0.18, 0.625, -0.1]);
    }
    // ---- intake, turbochargers, intercoolers and exhaust
    {
      const plen = P(engSys, 'מכלול יניקה (פלנום ושמונה ראנרים)', 'Intake plenum and runners', 'אלומיניום יצוק', 'תא אוויר בתוך ה־V שמחלק את האוויר הדחוס מהטורבו לשמונה צינורות יניקה. קצרים וישרים, כדי שהמנוע יגיב מהר.'); plen.userData.sysOverride = 'engine';
      mesh(G.soft(0.5, 0.08, 0.15, { r: 0.03, seg: 4 }), ALUD, { parent: plen, pos: [XC, 0.585, 0] });
      for (const s of [1, -1]) {
        XP.forEach((x) => { const a = bkW(s, x, 0.255, -0.115); mesh(G.tube([V3(x, 0.585, s * 0.04), V3(x, a.y + 0.07, a.z * 0.5 + s * 0.03), a], 0.0185, 24, 10), ALUD, { parent: plen }); });
        // injectors and fuel rail
        const inj = P(sys('fuel'), `מזרקים ומסילת דלק ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} injectors and fuel rail`, 'פלדה + פלסטיק', 'ארבעה מזרקים שמרססים דלק אל תוך כל צינור יניקה, על מסילה משותפת. המחשב מחליט כמה דלק לתת לפי עומס וסל״ד.');
        instances(G.cyl(0.0095, 0.0095, 0.06, 10, 'y'), M.metal(0x2f3236, 0.4), XP.map((x) => { const a = bkW(s, x, 0.255, -0.115); return { pos: [x, a.y + 0.035, a.z * 0.9 + s * 0.012], rot: [0, 0, 0] }; }), { parent: inj });
        mesh(G.cyl(0.011, 0.011, 0.4, 10, 'x'), M.metal(0xb8bcc2, 0.3), { parent: inj, pos: [XC, bkW(s, 0, 0.255, -0.115).y + 0.065, bkW(s, 0, 0.255, -0.115).z * 0.9 + s * 0.012] });
        // exhaust manifold, turbo, wastegate
        const mf = P(sys('fuel'), `סעפת פליטה ${sideHe(s)} (4 לתוך 1)`, `${s > 0 ? 'Right' : 'Left'} exhaust manifold (4-into-1)`, 'נירוסטה', 'ארבעה צינורות פליטה נפגשים לכניסת הטורבו. הם הופכים לאדומים מחום כאשר המנוע עובד חזק.');
        const tx = -1.45, ty = 0.44, tz = s * 0.5, col = V3(tx + 0.1, ty - 0.02, s * 0.46);
        XP.forEach((x, i) => { const p0 = bkW(s, x, 0.25, 0.1); mesh(G.tube([p0, V3(x, p0.y - 0.05, s * (0.34 + i * 0.012)), V3(lerp(x, col.x, 0.6), p0.y - 0.08, lerp(s * 0.4, col.z, 0.6)), col], 0.0165, 30, 10), EXH, { parent: mf }); });
        const tb = P(engSys, `טורבו ${sideHe(s)} (IHI)`, `${s > 0 ? 'Right' : 'Left'} turbocharger (IHI)`, 'ברזל יצוק + אלומיניום', 'טורבו IHI קטן שמסתובב בעשרות אלפי סל״ד ומגביר את לחץ היניקה (בסדר גודל של בר אחד, לפי דיווחים). שני טורבו, אחד לכל שורה, כדי שהמנוע יקבל כוח מהר.'); tb.userData.sysOverride = 'engine';
        const tg = new THREE.Group(); tg.position.set(tx, ty, tz); tb.add(tg);
        mesh(G.lathe([[0, 0], [0.06, 0], [0.065, 0.03], [0.05, 0.075], [0.0, 0.08]], 28, 'x'), M.castIron(), { parent: tg, pos: [-0.04, 0, 0], rot: [0, 0, PI] });
        mesh(G.lathe([[0.0, 0.0], [0.05, 0.0], [0.07, 0.03], [0.075, 0.06], [0.0, 0.06]], 28, 'x'), M.castAlu(), { parent: tg, pos: [0.02, 0, 0] });
        mesh(G.cyl(0.03, 0.03, 0.12, 16, 'x'), M.metal(0x3d4045, 0.4), { parent: tg });
        const wg = P(engSys, `ווסת לחץ טורבו (wastegate) ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} wastegate`, 'פלדה', 'שסתום שמפנה עודף גזי פליטה סביב הטורבו כשהלחץ גבוה מדי, כדי להגן על המנוע.'); wg.userData.sysOverride = 'engine';
        mesh(G.cyl(0.03, 0.03, 0.05, 14, 'y'), M.metal(0x4a4d52, 0.4), { parent: wg, pos: [tx - 0.05, ty + 0.07, tz] });
        // down-pipe from turbine to the silencer, and the pipe to the tail
        const dp = P(sys('fuel'), `צינור פליטה אחורי ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} exhaust pipe`, 'נירוסטה', 'צינור הפליטה מהטורבו אל משתיק הקול ומשם לקצה הזנב.');
        mesh(G.tube([V3(tx - 0.08, ty, tz), V3(tx - 0.2, ty - 0.12, s * 0.38), V3(-1.8, 0.28, s * 0.3), V3(-2.12, 0.23, s * 0.12), V3(-2.2, 0.22, s * 0.05)], 0.027, 40, 12), M.metal(0x8a8f95, 0.35), { parent: dp });
        mesh(G.cyl(0.07, 0.07, 0.4, 18, 'x'), M.metal(0x9aa0a6, 0.4), { parent: dp, pos: [-1.82, 0.28, s * 0.3] });
        // air filter box and intercooler
        const af = P(engSys, `מסנן אוויר ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} air filter box`, 'פלסטיק + נייר', 'קופסה שחורה שמכילה את מסנן האוויר ומובילה אוויר נקי לטורבו.'); af.userData.sysOverride = 'engine';
        mesh(G.soft(0.22, 0.13, 0.16, { r: 0.025, seg: 3 }), M.plastic(0x16171a, 0.6), { parent: af, pos: [-1.72, 0.46, s * 0.58] });
        mesh(G.tube([V3(-1.62, 0.5, s * 0.58), V3(-1.55, 0.5, s * 0.55), V3(tx - 0.03, ty + 0.02, tz)], 0.03, 20, 10), M.rubber(), { parent: af });
        const ic = P(sys('fuel'), `מצנן ביניים (אינטרקולר) ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} intercooler`, 'אלומיניום (ליבת סנפירים)', 'מצנן אוויר־אוויר שמקרר את האוויר הדחוס מהטורבו לפני הכניסה למנוע. אוויר קר צפוף יותר, ולכן נותן יותר כוח.');
        mesh(G.box(0.34, 0.06, 0.22, 0.008, 1), M.metal(0x4a4e54, 0.5), { parent: ic, pos: [-1.58, 0.74, s * 0.3] });
        instances(new THREE.BoxGeometry(0.004, 0.03, 0.2), M.metal(0x9a9ea4, 0.4), Array.from({ length: 28 }, (_, k) => ({ pos: [-1.74 + k * 0.0125, 0.77, s * 0.3] })), { parent: ic, cast: false });
        mesh(G.tube([V3(tx + 0.02, ty + 0.06, tz - s * 0.04), V3(-1.5, 0.62, s * 0.36), V3(-1.5, 0.74, s * 0.3)], 0.024, 20, 10), M.rubber(), { parent: ic });
        mesh(G.tube([V3(-1.4, 0.74, s * 0.28), V3(-1.2, 0.76, s * 0.18), V3(XC, 0.585, s * 0.05)], 0.028, 30, 10), M.rubber(), { parent: ic });
      }
    }
    // ---- drivetrain: clutch, transaxle, differential, half-shafts, shift linkage
    const SHAFT = [];
    {
      const cl = P(dtSys, 'מצמד (דיסק יחיד ולוחית לחץ)', 'Clutch (single plate)', 'פלדה + בטנת ספיגה', 'מצמד חד־דיסק יבש שמעביר את הכוח מהמנוע לתיבה. כבד, והנהג צריך ללחוץ בכוח.');
      mesh(G.lathe([[0.17, 0.0], [0.17, 0.07], [0.12, 0.17], [0.1, 0.17], [0.1, 0.0]], 40, 'x'), M.castAlu(), { parent: cl, pos: [-1.33, CY, 0] });
      mesh(G.cyl(0.13, 0.13, 0.016, 32, 'x'), M.metal(0x8f7a4a, 0.7), { parent: cl, pos: [-1.325, CY, 0] });
      const gb = P(dtSys, 'תיבת הילוכים בת 5 הילוכים', '5-speed gearbox', 'אלומיניום יצוק', 'תיבה ידנית מסונכרנת בעלת חמישה הילוכים קדימה, מונחת מאחורי המנוע. הכוח עובר דרך זוגות גלגלי שיניים אל דיפרנציאל בעל נעילה חלקית.');
      mesh(G.soft(0.42, 0.3, 0.34, { r: 0.04, seg: 4 }), M.castAlu(), { parent: gb, pos: [-1.72, 0.3, 0] });
      for (let k = 0; k < 6; k++) put(G.box(0.012, 0.31, 0.01, 0.003, 1), M.metal(0x7e8187, 0.45), gb, [-1.54 - k * 0.07, 0.3, 0.172]);
      // gear sets inside (visible in the cutaway)
      const gs = P(dtSys, 'גלגלי שיניים ופירי תיבה', 'Gear sets and shafts', 'פלדה מוקשית', 'חמישה זוגות גלגלי שיניים על שני פירים. מצמדי סינכרון מחברים את ההילוך הנבחר לפיר.');
      mesh(G.cyl(0.016, 0.016, 0.44, 12, 'x'), M.steel(), { parent: gs, pos: [-1.72, 0.34, 0] }); mesh(G.cyl(0.018, 0.018, 0.44, 12, 'x'), M.steel(), { parent: gs, pos: [-1.72, 0.22, 0] });
      [-1.57, -1.64, -1.72, -1.8, -1.87].forEach((x, k) => { mesh(G.cyl(0.05 - k * 0.006, 0.05 - k * 0.006, 0.022, 24, 'x'), M.metal(0xa9adb3, 0.35), { parent: gs, pos: [x, 0.34, 0] }); mesh(G.cyl(0.03 + k * 0.007, 0.03 + k * 0.007, 0.022, 24, 'x'), M.metal(0xa9adb3, 0.35), { parent: gs, pos: [x, 0.22, 0] }); });
      const df = P(dtSys, 'דיפרנציאל חלקי נעילה', 'Limited-slip differential', 'פלדה + אלומיניום', 'מחלק את הכוח לשני הגלגלים האחוריים ומונע החלקה של גלגל אחד. בלי להסתמך על אלקטרוניקה.');
      mesh(G.cyl(0.12, 0.12, 0.28, 28, 'z'), M.castAlu(), { parent: df, pos: [-1.5, 0.22, 0] }); mesh(G.cyl(0.095, 0.095, 0.03, 36, 'z'), M.metal(0x6a6e74, 0.4), { parent: df, pos: [-1.5, 0.22, 0.0] });
      // half-shafts with rubber boots and CV joint housings; they spin with the wheels
      for (const s of [1, -1]) {
        const hs = P(dtSys, `ציר הנעה ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} half-shaft`, 'פלדה + גומי', 'ציר ההנעה שמעביר את הכוח מהדיפרנציאל אל הגלגל. בשני קצותיו מפרקים (CV) בתוך מגני גומי.');
        const a = V3(-1.5, 0.22, s * 0.15), b = V3(-1.225, 0.31, s * 0.68), d = b.clone().sub(a), L = d.length();
        const g = new THREE.Group(); g.position.copy(a); g.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()); hs.add(g);
        const sp = new THREE.Group(); g.add(sp); SHAFT.push({ o: sp, s });
        mesh(G.cyl(0.015, 0.015, L, 12, 'y'), M.steel(), { parent: sp, pos: [0, L / 2, 0] });
        mesh(G.lathe([[0.03, 0], [0.04, 0.015], [0.03, 0.05], [0.022, 0.09], [0.018, 0.1]], 16, 'y'), M.rubber(), { parent: g, pos: [0, 0.02, 0] });
        mesh(G.lathe([[0.018, 0], [0.026, 0.02], [0.038, 0.05], [0.04, 0.08]], 16, 'y'), M.rubber(), { parent: g, pos: [0, L - 0.1, 0] });
        mesh(G.cyl(0.04, 0.04, 0.05, 16, 'y'), M.metal(0x2d2f33, 0.4), { parent: g, pos: [0, L - 0.025, 0] });
      }
      // gear lever and linkage
      const gl = P(dtSys, 'ידית הילוכים בשער פתוח', 'Gear lever in exposed gate', 'פלדה + אלומיניום מלוטש', 'ידית הילוכים בתוך ״שער״ ממתכת חשוף בתבנית H. כל המעבר בין הילוכים נשמע ונמשך ביד, בלי כל טכנולוגיה מסייעת.');
      rod(gl, [0.02, 0.36, 0.0], [0.0, 0.58, 0.0], 0.007, M.metal(0xb7bbc0, 0.3)); put(G.sphere(0.025, 14, 10), M.metal(0xc8ccd1, 0.25), gl, [-0.003, 0.595, 0.0]);
      const gt = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, w, h); g.fillStyle = '#16171a'; g.lineWidth = 0; const bar = (x0, y0, x1, y1) => g.fillRect(x0, y0, x1 - x0, y1 - y0); bar(60, 118, 196, 138); bar(60, 40, 76, 216); bar(120, 40, 136, 216); bar(180, 40, 196, 216); g.fillStyle = '#111'; g.font = '700 28px Arial'; g.textAlign = 'center'; g.fillText('1', 68, 34); g.fillText('3', 128, 34); g.fillText('5', 188, 34); g.fillText('2', 68, 246); g.fillText('4', 128, 246); g.fillText('R', 188, 246); });
      mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: gt, metalness: 0.7, roughness: 0.35 }), { parent: gl, pos: [0.02, 0.5, 0.0], rot: [-PI / 2, 0, PI / 2] });
      mesh(G.box(0.2, 0.01, 0.17, 0.004, 1), M.metal(0x2a2c30, 0.4), { parent: gl, pos: [0.02, 0.495, 0.0] });
      const lk = P(dtSys, 'כבלי החלפת הילוכים', 'Shift cables', 'פלדה בנדן', 'שני כבלים בתוך נדן שמעבירים את תנועת הידית אל התיבה שבקצה האחורי.');
      for (const dz of [-0.025, 0.025]) mesh(G.tube([V3(0.0, 0.34, dz), V3(-0.4, 0.27, dz * 2), V3(-1.2, 0.45, dz * 2), V3(-1.6, 0.5, dz * 2)], 0.005, 50, 6), M.metal(0x303236, 0.5), { parent: lk });
    }
    // ---- electrics under the bonnet and behind the seats
    {
      const ec = P(elecSys, 'מחשב מנוע Weber-Marelli', 'Weber-Marelli ECU', 'אלומיניום + אלקטרוניקה', 'המחשב שמנהל הזרקה והצתה. מערכת דיגיטלית מתקדמת לשנות ה־80 שמחשבת כמה דלק לתת לפי חיישנים.');
      mesh(G.box(0.18, 0.05, 0.12, 0.008, 1), M.metal(0x3a3d42, 0.45), { parent: ec, pos: [-0.6, 0.62, 0.0] }); put(new THREE.PlaneGeometry(0.1, 0.03), M.decal(K.textTexture('WEBER MARELLI', { font: '700 52px Arial', color: '#d33', bg: 'rgba(0,0,0,0)' }).tex), ec, [-0.6, 0.646, 0.0], [-PI / 2, 0, 0], { cast: false });
      const fb = P(elecSys, 'קופסת נתיכים ומפסקים', 'Fuse box and relays', 'פלסטיק + נחושת', 'קופסה עם נתיכים ומפסקי ממסר לפנסים, מאווררים ומשאבות.');
      mesh(G.box(0.12, 0.06, 0.16, 0.006, 1), M.plastic(0x1d1f23, 0.55), { parent: fb, pos: [-0.6, 0.42, 0.42] });
      instances(new THREE.BoxGeometry(0.008, 0.02, 0.012), M.plastic(0xd83030, 0.5), Array.from({ length: 8 }, (_, k) => ({ pos: [-0.53, 0.45, 0.36 + k * 0.016] })), { parent: fb, cast: false });
      for (const s of [1, -1]) {
        const dist = P(elecSys, `מפזר ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} distributor`, 'בקליט + פליז', 'מפזר שמחלק את הניצוץ בין ארבעת המצתים של השורה. כבלי ההצתה שחורים וגמישים.');
        mesh(G.cyl(0.03, 0.03, 0.04, 14, 'x'), M.plastic(0x1c1d20, 0.5), { parent: dist, pos: [-1.26, bkW(s, 0, 0.3, 0).y, bkW(s, 0, 0.3, 0).z] });
        XP.forEach((x, k) => mesh(G.tube([V3(-1.26, bkW(s, 0, 0.3, 0).y, bkW(s, 0, 0.3, 0).z), V3(-1.2, bkW(s, 0, 0.34, 0).y + 0.04, bkW(s, 0, 0.34, 0).z), bkW(s, x, 0.4, 0)], 0.0028, 20, 5), M.black(), { parent: dist }));
        const co = P(elecSys, `סליל הצתה ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} ignition coil`, 'נחושת + שרף', 'סליל שמגביר את מתח המצבר לעשרות אלפי וולט ומעביר אותו אל המצת.');
        mesh(G.cyl(0.026, 0.026, 0.09, 12, 'y'), M.plastic(0x1d1d20, 0.5), { parent: co, pos: [-1.3, bkW(s, 0, 0.2, 0).y + 0.12, s * 0.12] });
      }
      const st = P(elecSys, 'מתנע', 'Starter motor', 'פלדה + נחושת', 'מנוע חשמלי קטן שמסובב את גלגל התנופה כדי להתניע את המנוע.');
      mesh(G.cyl(0.04, 0.04, 0.16, 14, 'x'), M.metal(0x2c2e32, 0.4), { parent: st, pos: [-1.22, 0.2, -0.17] }); mesh(G.cyl(0.03, 0.03, 0.05, 14, 'x'), M.metal(0x4a4d52, 0.4), { parent: st, pos: [-1.1, 0.2, -0.17] });
      const wh = P(elecSys, 'צרור חיווט ראשי', 'Main wiring loom', 'נחושת + בידוד', 'צרור כבלים שעובר בתוך המנהרה מהחזית אל הזנב: פנסים, מאווררים, משאבות ומד סל״ד.');
      mesh(G.tube([V3(1.4, 0.3, -0.3), V3(0.8, 0.26, -0.12), V3(0.0, 0.25, -0.09), V3(-0.7, 0.3, -0.1), V3(-1.0, 0.3, -0.18)], 0.012, 60, 8), M.black(), { parent: wh });
      mesh(G.tube([V3(0.9, 0.45, 0.3), V3(0.4, 0.26, 0.1), V3(-0.6, 0.28, 0.1)], 0.008, 30, 6), M.black(), { parent: wh });
    }
    // ================================================================== ENGINE ANIMATION
    let engineSpeed = 0, crankAngle = 0;
    const setEngine = () => {
      MOT.crank.rotation.x = crankAngle; MOT.fly.rotation.x = crankAngle; for (const c of MOT.cam) c.rotation.x = crankAngle / 2;
      for (const m of MOT.piston) {
        const c = m.c, ph = crankAngle + c.ph, th = c.s * PI / 4, ca = Math.cos(th), sa = Math.sin(th);
        const py = CRK * Math.cos(ph), pz = CRK * Math.sin(ph);
        const pa = py * ca + pz * sa, pb = -py * sa + pz * ca, yp = pa + Math.sqrt(ROD * ROD - pb * pb);
        m.piston.position.set(c.x, yp + 0.0, 0);
        const a = V3(c.x, pa, pb), b = V3(c.x, yp, 0), d = b.clone().sub(a);
        m.rodm.scale.set(1, d.length(), 1); m.rodm.position.copy(a).addScaledVector(d, 0.5); m.rodm.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
      }
    };
    setEngine();
    K.toggle('engine', { he: 'מנוע פועל', key: 'e', seconds: 1.0 }, (t) => { engineSpeed = t * 24; });
    K.onFrame((time, dt) => { if (engineSpeed > 0.01) { crankAngle += engineSpeed * dt; setEngine(); } });
    K.onFrame((time, dt) => { if (speed > 0.01) for (const sh of SHAFT) sh.o.rotation.y += (sh.s * speed * dt) / TRR; });
    // ================================================================== INTERIOR
    const STRAP = M.fabric(0xb01419), BLKF = M.fabric(0x16171a), SEATRED = M.fabric(0xa9151b), SHELL = M.paintFlat(0x1b1c1f, 0.75);
    const strap = (parent, a, b, w = 0.048, th = 0.004, mat = STRAP) => { a = v3(a); b = v3(b); const d = b.clone().sub(a), l = d.length(); const m = mesh(G.box(w, l, th, 0.001, 1), mat, { parent, cast: false }); m.position.copy(a).addScaledVector(d, 0.5); const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()); m.quaternion.copy(q); return m; };
    const dialTex = (max, step, minor, label, redFrom, unit, size = 512) => K.canvasTexture(size, size, (g, w, h) => {
      const cx = w / 2, cy = h / 2; g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, w, h); g.translate(cx, cy);
      const a0 = -225 * PI / 180, a1 = 45 * PI / 180, ang = (v) => a0 + (v / max) * (a1 - a0);
      g.strokeStyle = '#ecece6'; g.fillStyle = '#ecece6'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (redFrom != null) { g.strokeStyle = '#d62020'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, cx * 0.84, ang(redFrom), ang(max)); g.stroke(); g.strokeStyle = '#ecece6'; }
      for (let v = 0; v <= max + 1e-6; v += minor) { const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6; g.lineWidth = major ? 5 : 2.5; g.beginPath(); g.moveTo(Math.cos(a) * cx * (major ? 0.74 : 0.8), Math.sin(a) * cx * (major ? 0.74 : 0.8)); g.lineTo(Math.cos(a) * cx * 0.9, Math.sin(a) * cx * 0.9); g.stroke(); if (major) { g.font = `700 ${cx * 0.15}px Arial`; g.fillText(String(Math.round(v / (unit === 'rpm' ? 1000 : 1))), Math.cos(a) * cx * 0.58, Math.sin(a) * cx * 0.58); } }
      g.font = `700 ${cx * 0.12}px Arial`; g.fillText(label, 0, cx * 0.36); g.font = `600 ${cx * 0.09}px Arial`; g.fillText(unit === 'rpm' ? 'x 1000 giri/min' : 'km/h', 0, cx * 0.5);
    });
    const dial = (parent, pos, n, up, r, tex, name, nameEn, descr, needleRef) => {
      const d = P(parent, name, nameEn, 'פלסטיק + זכוכית + מחוג אלומיניום', descr);
      d.position.copy(v3(pos)); orient(d, v3(n), v3(up));
      mesh(G.lathe([[r * 1.12, -0.012], [r * 1.12, 0.012], [r * 1.06, 0.014], [r, 0.012], [r, -0.01]], 36, 'z'), M.metal(0x2a2c30, 0.35), { parent: d });
      mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), { parent: d, pos: [0, 0, 0.006], cast: false });
      mesh(new THREE.CircleGeometry(r * 0.98, 40), M.glass(0xaabbcc, 0.1), { parent: d, pos: [0, 0, 0.014], cast: false });
      const nd = new THREE.Group(); nd.position.z = 0.009; d.add(nd);
      mesh(new THREE.BoxGeometry(0.0022, r * 0.82, 0.0015), M.emissive(0xff7a22, 0.7), { parent: nd, pos: [0, r * 0.31, 0] });
      mesh(G.cyl(r * 0.09, r * 0.09, 0.004, 14, 'z'), M.metal(0x202226, 0.4), { parent: nd, pos: [0, 0, 0.002] });
      needleRef.g = nd; return d;
    };
    const NEEDLES = { rpm: {}, spd: {}, minis: [] };
    const DASH = M.paintFlat(0x131416, 0.8);
    // ---- dashboard, binnacle, instruments, centre panel
    {
      const ds = P(intSys, 'לוח מחוונים', 'Dashboard', 'קבלר + פחם + פלסטיק שחור מט', 'לוח פשוט ושחור בלי עץ או עור: שני מחוונים גדולים מול הנהג וחלון פתוח לכמה כפתורים. הוא נבנה כך שהנהג יתרכז בכביש.');
      mesh(G.soft(0.3, 0.2, 1.42, { r: 0.04, seg: 5, deform: (p, n) => { p.y -= 0.02 * Math.max(0, n.y) * (1 - Math.abs(n.z)); } }), DASH, { parent: ds, pos: [0.78, 0.66, 0] });
      mesh(G.box(0.1, 0.07, 0.4, 0.02, 2), DASH, { parent: ds, pos: [0.68, 0.73, -0.36] });   // binnacle hood
      for (const s of [1, -1]) put(G.box(0.12, 0.03, 0.34, 0.01, 2), DASH, ds, [0.74, 0.77, s * 0.43]);
      // instrument cluster
      const rpmP = dial(ds, [0.628, 0.715, -0.4], [-1, 0, 0], [0, 1, 0], 0.062, dialTex(10000, 1000, 500, 'GIRI', 7750, 'rpm'), 'מד סל״ד (טכומטר)', 'Tachometer', 'מד סל״ד גדול בסקאלה עד 10,000, עם קו אדום סביב 7,750 (משוחזר). המחוג מסתובב כשמפעילים את המנוע.', NEEDLES.rpm);
      const spdP = dial(ds, [0.628, 0.715, -0.28], [-1, 0, 0], [0, 1, 0], 0.062, dialTex(340, 20, 10, 'F40', null, 'kmh'), 'מד מהירות', 'Speedometer', 'מד מהירות בסקאלה גבוהה (כאן משוחזרת עד 340 קמ״ש). המחוג עולה בנסיעה כשהגלגלים מסתובבים.', NEEDLES.spd);
      const sm = (z, label, max, step, minor, nm, nmE, red, desc) => { const r = {}; dial(ds, [0.628, 0.67, z], [-1, 0, 0], [0, 1, 0], 0.026, dialTex(max, step, minor, label, red, 'kmh', 256), nm, nmE, desc, r); NEEDLES.minis.push(r.g); };
      sm(-0.45, 'H2O', 120, 40, 20, 'מד טמפרטורת מים', 'Water temperature gauge', null, 'מחוון קטן שמראה את טמפרטורת נוזל הקירור של המנוע.');
      sm(-0.395, 'OIL °C', 160, 40, 20, 'מד טמפרטורת שמן', 'Oil temperature gauge', null, 'מחוון קטן שמראה את טמפרטורת השמן, שמתחמם מאוד במנוע טורבו.');
      sm(-0.34, 'OIL bar', 8, 2, 1, 'מד לחץ שמן', 'Oil pressure gauge', null, 'מחוון קטן שמראה את לחץ השמן במערכת הסיכה.');
      sm(-0.285, 'FUEL', 1, 0.5, 0.25, 'מד דלק', 'Fuel gauge', null, 'מחוון קטן שמראה את מפלס הדלק בשני המיכלים.');
      sm(-0.23, 'BOOST', 1.2, 0.4, 0.2, 'מד לחץ טורבו', 'Boost gauge', 1.0, 'מחוון קטן שמראה את לחץ הטורבו ביחס לאטמוספירה; הסקאלה מסומנת באדום בקצה העליון.');
      // warning lights strip and key
      const wl = P(intSys, 'נורות אזהרה (8)', 'Warning lights (×8)', 'פלסטיק + נורות LED', 'שורה של נורות אזהרה: שמן, טעינה, בלם, דלק, פנסים, מהבהבים ועוד.');
      const WL = [0xff2a2a, 0x2aff44, 0xff2a2a, 0xffb020, 0x2a7aff, 0x2aff44, 0xff2a2a, 0xffb020];
      instances(G.cyl(0.006, 0.006, 0.004, 10, 'x'), M.light(0xffffff, 0.3), WL.map((c, k) => ({ pos: [0.625, 0.775, -0.5 + k * 0.026], rot: [0, 0, 0] })), { parent: wl, cast: false });
      const ig = P(intSys, 'מתג הצתה עם מפתח', 'Ignition switch with key', 'פליז + פלדה', 'מתג הצתה בעמוד ההגה: מפתח אחד שמדליק את הציוד החשמלי ואחר כך מפעיל את המתנע.');
      mesh(G.cyl(0.018, 0.018, 0.016, 16, 'x'), CHROME, { parent: ig, pos: [0.64, 0.6, -0.5] }); put(G.box(0.008, 0.03, 0.006, 0.002, 1), M.metal(0xb7b9bd, 0.35), ig, [0.628, 0.6, -0.5]);
      // centre panel with real switches
      const cp = K.panel(ds, { pos: [0.628, 0.64, -0.02], normal: [-1, 0, 0], up: [0, 1, 0], w: 0.3, h: 0.1, plate: M.gloss(0x0e0e10), buttons: [
        { x: -0.11, y: 0.01, w: 0.032, kind: 'knob', label: 'FAN', mat: CHROME }, { x: -0.06, y: 0.01, w: 0.032, kind: 'knob', label: 'TEMP', mat: CHROME },
        { x: -0.01, y: 0.015, w: 0.026, h: 0.02, kind: 'rocker', label: 'LAMPS' }, { x: 0.03, y: 0.015, w: 0.026, h: 0.02, kind: 'rocker', label: 'POP-UP' },
        { x: 0.07, y: 0.015, w: 0.026, h: 0.02, kind: 'rocker', label: 'FOG', led: '#ffb020' }, { x: 0.11, y: 0.015, w: 0.026, h: 0.02, kind: 'rocker', label: 'HAZ', led: '#f33' },
        { x: -0.11, y: -0.03, w: 0.026, h: 0.016, kind: 'rect', label: 'WIPER' }, { x: -0.07, y: -0.03, w: 0.026, h: 0.016, kind: 'rect', label: 'WASH' }, { x: 0.12, y: -0.03, w: 0.03, h: 0.016, kind: 'rect', label: 'A/C', led: '#3f6' } ] });
      cp.userData.part = { he: 'לוח מתגים מרכזי', en: 'Centre switch panel', mat: 'פלסטיק + מתגי נדנדה', desc: 'לוח קטן באמצע הלוח עם מתגים אמיתיים: מאוורר, חום, פנסים, פנסים נשלפים, ערפל, מהבהבי חירום ומגבים.' };
      // round air vents
      const av = P(intSys, 'פתחי אוורור עגולים (3)', 'Round air vents (×3)', 'פלסטיק שחור', 'שלושה פתחי אוויר עגולים עם להבים מתכווננים, אחד בכל קצה ואחד במרכז.');
      for (const z of [-0.62, 0.0, 0.62]) { mesh(G.lathe([[0.04, 0], [0.04, 0.02], [0.034, 0.024], [0.034, 0.0]], 24, 'x'), M.metal(0x2a2c30, 0.45), { parent: av, pos: [0.633, 0.77, z] }); for (let k = -2; k <= 2; k++) put(G.box(0.004, 0.004, 0.06, 0.001, 1), BLK, av, [0.636, 0.77 + k * 0.012, z]); }
    }
    // ---- steering wheel (axis = column direction), stalks
    let wheelGrp = null;
    {
      const colTop = V3(0.58, 0.735, -0.36), colDir = V3(0.82 - 0.58, 0.55 - 0.735, -0.34 + 0.36).normalize();    // pointing down-forward to the rack; the driver faces -colDir
      const sw = P(intSys, 'הגה עור עם חישורי אלומיניום', 'Leather steering wheel with aluminium spokes', 'עור + אלומיניום מחורר', 'הגה בקוטר כ־37 ס״מ בשלושה חישורים מאלומיניום מחורר. ללא כרית אוויר, ובלי כפתורים: רק לחצן צופר במרכז.');
      sw.position.copy(colTop); sw.quaternion.setFromUnitVectors(V3(0, 0, 1), colDir.clone().multiplyScalar(-1));
      const swg = new THREE.Group(); sw.add(swg); wheelGrp = swg;
      mesh(G.torus(0.185, 0.0155, 12, 56), M.leather(0x0c0d10), { parent: swg });
      for (const a of [PI / 2 + PI * 2 / 3, PI / 2 - PI * 2 / 3, PI * 1.5]) {
        const sh = G.shape([[-0.014, 0.04], [0.014, 0.04], [0.011, 0.176], [-0.011, 0.176]]);
        for (let k = 0; k < 4; k++) sh.holes.push(G.circlePath(0.006, 0, 0.07 + k * 0.03));
        const g = G.extrude(sh, 0.008, { curveSeg: 8 }); g.rotateZ(a - PI / 2);
        mesh(g, M.metal(0xb7bbc0, 0.3), { parent: swg, pos: [0, 0, -0.012] });
      }
      mesh(G.cyl(0.045, 0.05, 0.03, 28, 'z'), M.gloss(0x111113), { parent: swg, pos: [0, 0, 0.004] });
      mesh(new THREE.CircleGeometry(0.036, 32), M.decal(globalThis.__shield, { roughness: 0.3 }), { parent: swg, pos: [0, 0, 0.0205], cast: false });
      mesh(G.torus(0.037, 0.003, 6, 32), M.metal(0xc0c4c9, 0.25), { parent: swg, pos: [0, 0, 0.0195] });
      mesh(G.cyl(0.052, 0.052, 0.004, 28, 'z'), M.metal(0x2c2e32, 0.4), { parent: swg, pos: [0, 0, -0.012] });
      for (const [dz, nm, nmE] of [[0.03, 'ידית איתות', 'Turn-signal stalk'], [-0.05, 'ידית מגבים', 'Wiper stalk']]) {
        const st = P(intSys, nm, nmE, 'פלסטיק + פלדה', nm === 'ידית איתות' ? 'ידית דקה משמאל להגה שמפעילה את המהבהבים.' : 'ידית בצד ימין להפעלת המגבים והמתזים.');
        const base = colTop.clone().addScaledVector(colDir, 0.07), side = nm === 'ידית איתות' ? -1 : 1;
        rod(st, base.clone().add(V3(0, 0, side * 0.03)), base.clone().add(V3(0.02, 0.02, side * 0.11)), 0.006, M.metal(0x1a1b1e, 0.5));
        put(G.sphere(0.0085, 10, 8), M.gloss(0x111113), st, base.clone().add(V3(0.02, 0.02, side * 0.11)).toArray());
      }
    }
    // ---- seats, harnesses, pedals, handbrake, door cards, mirror, mats
    {
      for (const s of [-1, 1]) {
        const nm = s < 0 ? 'נהג' : 'נוסע', nmE = s < 0 ? 'driver' : 'passenger', z = s * 0.36;
        const sc = P(intSys, `מושב דלי ${nm} (כרית)`, `Bucket seat ${nmE} (cushion)`, 'קבלר + קצף + בד אדום', 'מושב דלי קבוע בלי הרבה מתכוונים: רק הזזה קדימה ואחורה. הבד האדום הוא סימן ההיכר של ה־F40, ואין בו עור.');
        mesh(G.soft(0.5, 0.1, 0.46, { r: 0.035, seg: 6, deform: (p, n) => { p.y -= 0.018 * (1 - n.x * n.x) * (1 - n.z * n.z) * Math.max(0, n.y); p.y += 0.02 * Math.abs(n.z) * Math.max(0, n.y); } }), [BLKF, BLKF, SEATRED, BLKF, BLKF, BLKF], { parent: sc, pos: [-0.16, 0.265, z] });
        const sb = P(intSys, `משענת מושב ${nm}`, `Seat back ${nmE}`, 'קבלר + בד אדום', 'משענת גבוהה עם ראש מובנה (בלי מתכוונן). שני צדדי המשענת מקיפים את הגוף ותומכים בו בסיבובים.');
        const bg = new THREE.Group(); bg.position.set(-0.4, 0.5, z); bg.rotation.z = 0.2; sb.add(bg);
        mesh(G.soft(0.09, 0.66, 0.48, { r: 0.03, seg: 6, deform: (p, n) => { p.x += 0.03 * Math.abs(n.z) * (n.y > -0.5 ? 1 : 0) * (n.x > 0 ? 1 : 0); } }), [SEATRED, BLKF, BLKF, BLKF, BLKF, BLKF], { parent: bg, pos: [0.0, 0.0, 0] });
        mesh(G.soft(0.07, 0.72, 0.5, { r: 0.03, seg: 4 }), SHELL, { parent: bg, pos: [-0.075, 0.03, 0] });
        mesh(G.soft(0.12, 0.17, 0.3, { r: 0.04, seg: 5 }), BLKF, { parent: bg, pos: [0.0, 0.43, 0] });
        const rl = P(intSys, `מסילות מושב ${nm}`, `Seat rails ${nmE}`, 'אלומיניום', 'שתי מסילות שמאפשרות הזזת מושב. כל תנועה אחרת נחסכה כדי להקטין משקל.');
        for (const dz of [-0.17, 0.17]) put(G.box(0.5, 0.02, 0.03, 0.005, 1), M.metal(0xa9adb3, 0.4), rl, [-0.15, 0.2, z + dz]);
        const hs = P(intSys, `רתמת בטיחות ${nm} (4 נקודות)`, `Harness ${nmE} (4-point)`, 'ניילון אדום + פלדה', 'הדגם מציג רתמה בת ארבע נקודות עם אבזם מרכזי, בסגנון מכוניות מירוץ. הרצועות האדומות תואמות את בד המושב.');
        for (const dz of [-0.12, 0.12]) { strap(hs, [-0.46, 0.78, z + dz * 1.0], [-0.1, 0.34, z + dz * 0.35], 0.05); put(G.box(0.012, 0.02, 0.016, 0.003, 1), CHROME, hs, [-0.1, 0.34, z + dz * 0.35]); }
        strap(hs, [-0.12, 0.31, z - 0.19], [-0.1, 0.34, z - 0.04], 0.05); strap(hs, [-0.12, 0.31, z + 0.19], [-0.1, 0.34, z + 0.04], 0.05);
        put(G.cyl(0.032, 0.032, 0.012, 18, 'y'), M.metal(0xc1c5ca, 0.25), hs, [-0.1, 0.35, z]);
        // doorcard (bare composite) with cable pull and sliding-window latch
        const D = doorList.find((d) => d.s === (s < 0 ? -1 : 1)), h = D.h;
        const dc = P(D.g, `לוח דלת פנימי ${nm}`, `Inner door panel ${nmE}`, 'פחם חשוף + בד', 'פנים הדלת חשוף למחצה: פחם בגימור מט, בלי ריפוד, ובמקום ידית יש כבל אדום קטן שמושכים כדי לפתוח.'); dc.userData.sysOverride = 'interior';
        const isLower = (x, lo, hi) => inX(x, XD0, XD1) && lo >= HI.K2 && hi <= HI.dl;
        mesh(gridGeo(sideMask(isLower, s < 0 ? -1 : 1), { off: -0.03 }).translate(-h[0], -h[1], -h[2]), dbl(M.paintFlat(0x2a2b2e, 0.85)), { parent: dc, cast: false });
        const pull = sideAt(-0.1, 0.62, s < 0 ? -1 : 1);
        const cord = P(D.g, `כבל פתיחת דלת ${nm}`, `Door pull cord ${nmE}`, 'כבל ניילון אדום + פליז', 'לולאה קטנה של חבל אדום שבה מושכים כדי לפתוח את הדלת מבפנים. אין ידית כרום ואין מנעול חשמלי.'); cord.userData.sysOverride = 'interior';
        const cpt = pull.p.clone().addScaledVector(pull.n, -0.045).sub(V3(...h));
        mesh(G.tube([cpt.clone().add(V3(0.06, 0.02, 0)), cpt.clone().add(V3(0.0, 0.0, -s * 0.02)), cpt.clone().add(V3(-0.06, 0.03, 0))], 0.004, 16, 6), M.fabric(0xa8141a), { parent: cord });
        put(G.sphere(0.012, 10, 8), M.brass(), cord, cpt.clone().add(V3(0.06, 0.02, 0)).toArray());
      }
      const pd = P(intSys, 'דוושות אלומיניום (מצמד, בלם, גז)', 'Aluminium pedals (clutch, brake, throttle)', 'אלומיניום מחורר + גומי', 'שלוש דוושות מחוררות ללא חיפוי, תלויות מהקיר הקדמי. הדוושות כבדות ומדויקות.');
      for (const [z, w] of [[-0.54, 0.09], [-0.42, 0.06], [-0.3, 0.05]]) {
        rod(pd, [1.04, 0.5, z], [0.96, 0.27, z], 0.0075, M.metal(0x9a9ea4, 0.3));
        const pad = mesh(G.box(0.012, 0.13, w, 0.004, 1), M.metal(0xc4c8cd, 0.28), { parent: pd, pos: [0.945, 0.255, z] }); pad.rotation.z = -0.35;
        instances(G.cyl(0.0035, 0.0035, 0.014, 8, 'x'), BLK, Array.from({ length: 10 }, (_, k) => ({ pos: [0.936, 0.22 + (k % 5) * 0.022 * Math.cos(0.35), z + ((k < 5) ? -1 : 1) * w * 0.22] })), { parent: pd, cast: false });
      }
      put(G.box(0.014, 0.11, 0.13, 0.004, 1), M.metal(0xc4c8cd, 0.28), pd, [0.98, 0.24, -0.65], [0, 0, -0.5]);
      const hb = P(intSys, 'ידית בלם יד', 'Handbrake lever', 'פלדה + גומי', 'ידית קצרה בין המושבים שמחזיקה את הגלגלים האחוריים באמצעות כבלים.');
      rod(hb, [-0.1, 0.38, -0.12], [-0.22, 0.52, -0.12], 0.011, M.metal(0x2a2c30, 0.4)); put(G.cyl(0.016, 0.016, 0.08, 14, 'x'), M.leather(0x15151a), hb, [-0.24, 0.535, -0.12], [0, 0, 0.55]);
      // mirror, visors, bare floor mats
      const rv = P(intSys, 'מראה פנימית', 'Interior mirror', 'פלסטיק + זכוכית', 'מראה פנימית על זרוע קצרה; דרכה הנהג רואה את המנוע מבעד לחלון האחורי.');
      rod(rv, [0.24, 1.06, 0.0], [0.2, 0.98, 0.0], 0.005, M.metal(0x1a1b1e, 0.5)); mesh(G.box(0.014, 0.05, 0.22, 0.01, 2), M.gloss(0x111113), { parent: rv, pos: [0.185, 0.96, 0] }); put(G.box(0.002, 0.04, 0.2, 0.002, 1), M.reflector(), rv, [0.177, 0.96, 0]);
      const mt = P(intSys, 'שטיחי גומי שחורים', 'Rubber floor mats', 'גומי', 'שתי מחצלות גומי שחורות פשוטות במקום שטיח.');
      for (const s of [-1, 1]) put(G.box(0.76, 0.008, 0.4, 0.003, 1), M.rubber(), mt, [0.58, 0.195, s * 0.38]);
      const hdr = P(intSys, 'מגני שמש (2)', 'Sun visors (×2)', 'קצף + בד', 'שני מגני שמש קלים מעל השמשה.');
      for (const z of [-0.3, 0.3]) put(G.box(0.1, 0.012, 0.28, 0.004, 1), BLKF, hdr, [0.3, 1.06, z]);
    }
    // instrument animation: tach follows the engine, speedo follows the wheels
    K.onFrame((time, dt) => {
      const rpm = engineSpeed > 0.01 ? 1000 + (engineSpeed / 24) * 5500 : 0, kmh = speed * 3.6 * 4;
      const set = (n, v, max) => { if (n.g) n.g.rotation.z += ((-(PI * 1.5) * (v / max) + PI * 0.75 - n.g.rotation.z) * Math.min(1, dt * 5)); };
      set(NEEDLES.rpm, rpm, 10000); set(NEEDLES.spd, kmh, 340);
    });
    for (const n of [NEEDLES.rpm, NEEDLES.spd]) if (n.g) n.g.rotation.z = PI * 0.75;
    for (const g of NEEDLES.minis) g.rotation.z = PI * 0.75 - PI * 1.5 * 0.4;
    // ================================================================== LIGHTS TOGGLE (night mode)
    K.toggle('lights', { he: 'פנסים', key: 'k', seconds: 0.4, night: true }, (t) => {
      LM.head.emissiveIntensity = t * 3.5; LM.bulb.emissiveIntensity = 0.1 + t * 3.0; LM.amber.emissiveIntensity = 0.05 + t * 0.9; LM.red.emissiveIntensity = 0.05 + t * 0.8;
      LM.redSq.emissiveIntensity = 0.05 + t * 0.8; LM.plate.emissiveIntensity = t * 1.2; LM.fogW.emissiveIntensity = 0.05 + t * 0.8;
    });
    // ================================================================== EXTRAS: hinges, latches, wipers, undertray, ducts, fasteners
    {
      // hood hinges and cowl latches, engine-cover hinges and prop rod
      for (const s of [1, -1]) {
        const hh = P(doorsSys, `ציר מכסה קדמי ${sideHe(s)}`, `Hood hinge ${sideEn(s)}`, 'פלדה מחושלת', 'ציר בקצה הקדמי של המכסה, שמחובר לתת־שלדה הקדמית. כשהמכסה נפתח הוא מתרומם מאחור, כמו פה שנפתח.'); hh.userData.sysOverride = 'doors';
        const hy = (downAt(2.0, s * 0.36)?.p.y ?? 0.45) - 0.035; put(G.box(0.07, 0.02, 0.05, 0.005, 1), IRON, hh, [hoodHinge[0] - 0.02, hy - 0.012, s * 0.36]); put(G.cyl(0.011, 0.011, 0.06, 12, 'z'), STEEL, hh, [hoodHinge[0], hy, s * 0.36]);
        const lh = P(doorsSys, `ציר קליפת מנוע ${sideHe(s)}`, `Engine cover hinge ${sideEn(s)}`, 'פלדה מחושלת', 'ציר בקצה הזנב שמחזיק את הקליפה האחורית, עם קפיץ שמסייע להרים אותה.'); lh.userData.sysOverride = 'doors';
        put(G.box(0.07, 0.02, 0.05, 0.005, 1), IRON, lh, [lidHinge[0] - 0.02, lidHinge[1] - 0.025, s * 0.4]); put(G.cyl(0.011, 0.011, 0.06, 12, 'z'), STEEL, lh, [lidHinge[0], lidHinge[1], s * 0.4]);
        const pl = P(doorsSys, `מנעול דלת וסטרייקר ${sideHe(s)}`, `Door latch and striker ${sideEn(s)}`, 'פלדה מגולוונת', 'תפס בעמוד האחורי של הדלת שנאחז בסטרייקר. נפתח בכבל הפנימי או במפתח.'); pl.userData.sysOverride = 'doors';
        const sp = sideAt(XD0 - 0.012, 0.58, s); if (sp) put(G.box(0.012, 0.05, 0.02, 0.003, 1), M.metal(0x8f9399, 0.4), pl, sp.p.clone().addScaledVector(sp.n, -0.006).toArray());
        for (const y of [0.72, 0.4]) { const hp = sideAt(XD1 + 0.01, y, s); if (hp) { const dh = P(doorsSys, `ציר דלת ${y > 0.5 ? 'עליון' : 'תחתון'} ${sideHe(s)}`, `${s > 0 ? 'Right' : 'Left'} door hinge (${y > 0.5 ? 'upper' : 'lower'})`, 'פלדה מחושלת', 'שני צירים לכל דלת, מוברגים לשלדה, שנושאים את משקל הדלת הקלה.'); dh.userData.sysOverride = 'doors'; put(G.box(0.014, 0.08, 0.036, 0.003, 1), IRON, dh, hp.p.clone().addScaledVector(hp.n, -0.01).toArray()); put(G.cyl(0.0085, 0.0085, 0.09, 12, 'y'), STEEL, dh, hp.p.clone().addScaledVector(hp.n, -0.006).add(V3(0.008, 0, 0)).toArray()); } }
      }
      const pr = P(doorsSys, 'מוט תמיכה של קליפת המנוע', 'Engine cover prop rod', 'פלדה', 'מוט תמיכה שמחזיק את הקליפה האחורית פתוחה בעת שירות המנוע.'); pr.userData.sysOverride = 'doors';
      rod(pr, [-2.0, 0.78, 0.5], [-2.1, 1.08, 0.5], 0.006, STEEL);
      // wipers and washer jets on the windshield
      {
        const nW = V3(0.34, 0.94, 0).normalize(), pivY = 0.87, pivX = 0.935;
        const wipers = [];
        for (const [z, nm, nmE] of [[-0.36, 'נהג', 'driver'], [0.1, 'נוסע', 'passenger']]) {
          const wp = P(glassSys, `מגב ${nm}`, `Wiper (${nmE})`, 'פלדה + גומי', 'מגב על זרוע קפיצית שנמשכת בעזרת מנוע חשמלי. להב הגומי מוחלף כל כמה שנים.');
          wp.position.set(pivX, pivY, z); const wg = new THREE.Group(); wp.add(wg);
          wg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(-nW.y, nW.x, 0), nW)); wg.position.addScaledVector(nW, 0.012);
          const sw = new THREE.Group(); wg.add(sw); wipers.push(sw);
          mesh(G.cyl(0.012, 0.012, 0.016, 14, 'z'), CHROME, { parent: wg, pos: [0, 0, 0.004] });
          rod(sw, [0, 0, 0.006], [-0.44, 0.0, 0.006], 0.0035, M.metal(0x1d1d20, 0.5));
          put(G.box(0.4, 0.012, 0.008, 0.002, 1), M.rubber(), sw, [-0.25, 0.0, 0.004]);
        }
        let wipeOn = 0, wipeT = 0;
        K.toggle('wipers', { he: 'מגבים', key: 'x', seconds: 0.4 }, (t) => { wipeOn = t; if (!t) for (const sw of wipers) sw.rotation.z = 0; });
        K.onFrame((time, dt) => { if (wipeOn > 0.5) { wipeT += dt * 3.4; const a = (0.5 - 0.5 * Math.cos(wipeT)) * 1.1; for (const sw of wipers) sw.rotation.z = -a; } });
        for (const z of [-0.2, 0.0]) { const jt = P(glassSys, `מתז מי שמשה ${z < 0 ? 'שמאל' : 'ימין'}`, `Washer jet ${z < 0 ? 'left' : 'right'}`, 'פלסטיק + פליז', 'חרירי פליז קטנים בתחתית השמשה שמרססים מים.'); mesh(G.cyl(0.0045, 0.0045, 0.014, 8, 'y'), M.brass(), { parent: jt, pos: [0.94, 0.866, z] }); }
      }
      // undertray with diffuser and brake ducts (aero)
      const ut = P(aeroSys, 'תחתית שטוחה (Undertray)', 'Flat undertray', 'קבלר + לוח שחור', 'לוח שטוח מתחת למכונית שמחליק את האוויר ומקטין את ההרמה האווירודינמית. מאחור הוא עולה כדיפיוזר.');
      mesh(G.box(2.2, 0.01, 1.52, 0.004, 1), M.paintFlat(0x0a0a0c, 0.8), { parent: ut, pos: [0.05, 0.118, 0], cast: false });
      mesh(G.box(0.9, 0.01, 1.4, 0.004, 1), M.paintFlat(0x0a0a0c, 0.8), { parent: ut, pos: [1.55, 0.13, 0], cast: false });
      const df = P(aeroSys, 'דיפיוזר אחורי (4 לוחות)', 'Rear diffuser (4 strakes)', 'פחם', 'לוח מוטה בקצה האחורי עם ארבעה חיצי חלוקה אנכיים שמאיצים את זרימת האוויר מתחת למכונית ומשפרים אחיזה.');
      { const g = new THREE.BoxGeometry(0.6, 0.01, 1.32); g.rotateZ(0.2); mesh(g, M.paintFlat(0x0a0a0c, 0.8), { parent: df, pos: [-1.95, 0.175, 0], cast: false }); for (const z of [-0.5, -0.17, 0.17, 0.5]) { const f = new THREE.BoxGeometry(0.6, 0.07, 0.008); f.rotateZ(0.2); mesh(f, M.paintFlat(0x131316, 0.7), { parent: df, pos: [-1.95, 0.155, z], cast: false }); } }
      for (const s of [1, -1]) {
        const bd = P(brakesSys, `תעלת אוויר לבלם קדמי ${sideHe(s)}`, `Front brake duct ${sideEn(s)}`, 'גומי גמיש שחור', 'צינור גמיש מהפתח בפגוש אל הדיסק, כדי לקרר אותו בנסיעה מהירה ולמנוע התחממות יתר.'); bd.userData.sysOverride = 'brakes';
        mesh(G.tube([V3(2.02, 0.2, s * 0.58), V3(1.7, 0.2, s * 0.66), V3(1.4, 0.22, s * 0.7), V3(1.3, 0.28, s * 0.68)], 0.034, 36, 12), M.rubber(), { parent: bd });
        for (let k = 0; k < 14; k++) { const t = k / 13; const pt = new THREE.CatmullRomCurve3([V3(2.02, 0.2, s * 0.58), V3(1.7, 0.2, s * 0.66), V3(1.4, 0.22, s * 0.7), V3(1.3, 0.28, s * 0.68)]).getPoint(t); put(G.torus(0.035, 0.0035, 5, 14, PI * 2, 'x'), M.metal(0x2c2c30, 0.6), bd, pt.toArray()); }
      }
      // tow eye and jacking points
      const te = P(chSys, 'עין גרירה', 'Tow eye', 'פלדה', 'עין גרירה קטנה בחזית שמוברגת בעת הצורך.'); te.userData.sysOverride = 'chassis';
      mesh(G.torus(0.028, 0.007, 8, 20, PI * 2, 'x'), M.metal(0xb8140f, 0.4), { parent: te, pos: [2.06, 0.17, 0.0] }); put(G.cyl(0.01, 0.01, 0.05, 10, 'x'), STEEL, te, [2.03, 0.17, 0]);
      const jp = P(chSys, 'נקודות הרמה (4)', 'Jacking points (×4)', 'פלדה מחוזקת', 'ארבע נקודות מחוזקות בשלדה שבהן מרימים את המכונית במגבה.'); jp.userData.sysOverride = 'chassis';
      instances(G.cyl(0.018, 0.018, 0.02, 10, 'y'), STEEL, [[0.8, 0.12, 0.62], [0.8, 0.12, -0.62], [-0.6, 0.12, 0.62], [-0.6, 0.12, -0.62]].map((p) => ({ pos: p })), { parent: jp });
      // engine mounts, heat shields and turbo oil lines
      const em = P(engSys, 'כריות מנוע (4)', 'Engine mounts (×4)', 'גומי + פלדה', 'ארבע כריות גומי שמחברות את המנוע לתת־שלדה האחורית ומספגות חלק מהרעידות, אך לא את כולן.'); em.userData.sysOverride = 'engine';
      instances(G.cyl(0.03, 0.03, 0.04, 14, 'y'), M.rubber(), [[-0.8, 0.22, 0.24], [-0.8, 0.22, -0.24], [-1.25, 0.2, 0.2], [-1.25, 0.2, -0.2]].map((p) => ({ pos: p })), { parent: em });
      for (const s of [1, -1]) {
        const hs = P(engSys, `מגן חום לסעפת ${sideHe(s)}`, `Manifold heat shield ${sideEn(s)}`, 'נירוסטה + רדיד זהב', 'לוח מתכת שמגן על הקליפה ועל הצינורות הסמוכים מהחום העז של הסעפת.'); hs.userData.sysOverride = 'engine';
        mesh(G.box(0.34, 0.004, 0.1, 0.002, 1), M.metal(0xd8b25a, 0.3), { parent: hs, pos: [-1.12, 0.37, s * 0.44], rot: [s * 0.4, 0, 0] });
        const ol = P(engSys, `צנרת שמן לטורבו ${sideHe(s)}`, `Turbo oil feed line ${sideEn(s)}`, 'נירוסטה קלועה', 'צינור דק שמזין את הטורבו בשמן לשימון ולקירור המיסב המהיר.'); ol.userData.sysOverride = 'engine';
        mesh(G.tube([V3(-1.15, 0.22, s * 0.18), V3(-1.3, 0.3, s * 0.3), V3(-1.45, 0.4, s * 0.48)], 0.0045, 24, 6), M.metal(0x4a6fa8, 0.3), { parent: ol });
        const tbd = P(engSys, `מצערת ${sideHe(s)}`, `Throttle body ${sideEn(s)}`, 'אלומיניום', 'פרפר מצערת שמווסת את כמות האוויר שנכנסת לפלנום. נשלט בכבל מהדוושה.'); tbd.userData.sysOverride = 'engine';
        mesh(G.cyl(0.032, 0.032, 0.05, 16, 'x'), ALUD, { parent: tbd, pos: [-0.74, 0.585, s * 0.06] }); put(G.cyl(0.004, 0.004, 0.07, 8, 'z'), STEEL, tbd, [-0.74, 0.585, s * 0.06]);
      }
      // cabin extras
      const fe = P(intSys, 'מטף כיבוי אש', 'Fire extinguisher', 'פלדה צבועה', 'מטף כיבוי קטן מאחורי המושבים: בתא נוסעים חשוף ליד מנוע טורבו חם זו תוספת הגיונית.'); 
      mesh(G.cyl(0.04, 0.04, 0.26, 16, 'z'), M.paintFlat(0xb01412, 0.4), { parent: fe, pos: [-0.62, 0.34, 0.0] }); put(G.cyl(0.015, 0.015, 0.03, 10, 'y'), M.metal(0x2a2a2a, 0.4), fe, [-0.62, 0.395, 0.0]);
      const hr = P(intSys, 'ידית פתיחת מכסה קדמי', 'Hood release handle', 'פלדה + גומי', 'ידית אדומה ליד רגל הנהג שפותחת את נעילת המכסה הקדמי.');
      put(G.cyl(0.008, 0.008, 0.04, 8, 'x'), M.metal(0xb8bcc2, 0.3), hr, [0.9, 0.28, -0.7]); put(G.sphere(0.016, 10, 8), M.gloss(0xb01412), hr, [0.87, 0.28, -0.7]);
      const fb = P(chSys, 'ברגי רצפה (20)', 'Floor bolts (×20)', 'פלדה מגולוונת', 'ברגים שמחזיקים את לוחות הרצפה לצינורות השלדה. אין שטיח שמסתיר אותם.'); fb.userData.sysOverride = 'chassis';
      bolts(fb, Array.from({ length: 20 }, (_, k) => ({ pos: [0.8 - (k % 10) * 0.16, 0.192, (k < 10 ? -1 : 1) * 0.42], rot: [0, 0, 0] })), 0.0065, STEEL);
      const tr = P(trimSys, 'ברגי לוח זנב (14)', 'Tail panel screws (×14)', 'נירוסטה', 'ברגים שמחזיקים את הלוח השחור עם הרשת בתוך הזנב.');
      for (const y of [0.55, 0.81]) { const rr = rearRay(y, 0); if (rr) { const list = Array.from({ length: 7 }, (_, k) => { const h = rearRay(y, -0.66 + k * 0.22); return h ? { pos: h.p.clone().addScaledVector(h.n, 0.012).toArray(), rot: [0, 0, -PI / 2] } : null; }).filter(Boolean); instances(G.cyl(0.0045, 0.0045, 0.004, 8, 'x'), M.metal(0x9a9ea4, 0.3), list, { parent: tr, cast: false }); } }
    }
    // ================================================================== MIRRORS AND SIDE MARKERS
    {
      for (const D of doorList) {
        const s = D.s, h = D.h, nm = sideHe(s), nmE = sideEn(s);
        const mp = P(D.g, `מראה חיצונית ${nm}`, `${s > 0 ? 'Right' : 'Left'} exterior mirror`, 'פלסטיק צבוע + זכוכית', 'מראה קטנה בצבע הגוף על בסיס הדלת. היא נעה יחד עם הדלת. הזכוכית מעט קמורה כדי להרחיב את שדה הראייה.'); mp.userData.sysOverride = 'trim';
        const base = V3(0.66, 0.79, s * 0.9).sub(V3(...h)), head = V3(0.6, 0.86, s * 1.0).sub(V3(...h));
        mesh(G.soft(0.14, 0.085, 0.055, { r: 0.028, seg: 5 }), PAINT, { parent: mp, pos: head.toArray(), rot: [0, s * 0.35, 0] });
        mesh(new THREE.PlaneGeometry(0.115, 0.065), M.reflector(), { parent: mp, pos: head.clone().add(V3(-0.001 - 0.07 * Math.cos(s * 0.35) * 0 - 0.0, 0, 0)).add(V3(-0.07, 0, -s * 0.01)).toArray(), rot: [0, -PI / 2 - s * 0.35, 0], cast: false });
        rod(mp, base, head.clone().add(V3(0.03, -0.02, -s * 0.01)), 0.008, M.paintFlat(0x151517, 0.6));
        mesh(G.cyl(0.02, 0.02, 0.012, 14, 'y'), M.paintFlat(0x151517, 0.6), { parent: mp, pos: base.toArray() });
      }
      for (const s of [1, -1]) {
        const fm = sideRay(1.78, 0.44, s), rm = sideRay(-2.12, 0.52, s);
        if (fm) { const lp = P(lightsSys, `סימון צד קדמי כתום ${sideHe(s)}`, `Front side marker ${sideEn(s)}`, 'פלסטיק כתום', 'נורה קטנה בפינת הכנף הקדמית שמסמנת את רוחב המכונית בלילה.'); lp.position.copy(fm.p).addScaledVector(fm.n, 0.002); orient(lp, fm.n, V3(0, 1, 0)); mesh(G.box(0.05, 0.022, 0.006, 0.003, 1), LM.amber, { parent: lp, cast: false }); lampKeep.push({ m: LM.amber }); }
        if (rm) { const lp = P(lightsSys, `סימון צד אחורי אדום ${sideHe(s)}`, `Rear side marker ${sideEn(s)}`, 'פלסטיק אדום', 'נורת צד אדומה בקצה הכנף האחורית.'); lp.position.copy(rm.p).addScaledVector(rm.n, 0.002); orient(lp, rm.n, V3(0, 1, 0)); mesh(G.box(0.05, 0.022, 0.006, 0.003, 1), LM.redSq, { parent: lp, cast: false }); }
      }
    }
    K.gameRig({ kind: 'car', wheels: rigWheels });
  },
};
