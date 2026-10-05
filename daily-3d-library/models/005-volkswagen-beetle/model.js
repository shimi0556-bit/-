// #005 — Volkswagen Beetle Type 1 "1200" (1963). Built entirely in code with the library kit
// (engine/kit.js). Units are metres. Axes: +x = forward, +y = up, +z = right (passenger side);
// left-hand drive, the driver sits at -z. s = +1 right, -1 left. The engine is at the rear (-x),
// the luggage compartment, fuel tank and spare wheel are in the front (+x).
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

    // ------------------------------------------------------------------ key dimensions (VW 1963: 4.07 x 1.54 x 1.50 m, wheelbase 2.40 m)
    const AXF = 1.195, AXR = -1.205, TR = 0.315;            // axle x, rolling radius of the 5.60-15 tyre
    const HWF = 0.655, HWR = 0.675;                          // half track: front 1.31 m, rear 1.35 m
    const NOSE = 1.98, TAIL = -1.99;                         // body tips (bumpers stand ~5 cm beyond)
    const PAINT_HEX = 0x9b1b1f;                              // "Ruby Red"-like solid colour (approx.)
    const PAINT = new THREE.MeshPhysicalMaterial({ color: PAINT_HEX, metalness: 0.12, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide, name: 'לכה אדומה (Ruby Red) + שכבת לכה' });
    const EDGE = M.paintFlat(0x2b0a0c, 0.75);
    const CHROME = M.chrome(), SATIN = M.satin(), STEEL = M.steel(), DSTEEL = M.darkSteel(), CAST = M.castIron(), ALU = M.castAlu();
    const IRON = M.metal(0x24262a, 0.5);
    const rigWheels = [], spinners = [];

    // ================================================================== BODY SHELL
    // One lofted shell: a grid of columns (x stations) × rows (a section that runs from the left
    // sill up over the roof to the right sill). Named lines of the section (roof edge K1, belt K2,
    // bulge K3, door-bottom, sill K4…) keep their index in every column, so windows, doors, hood and
    // engine lid are exact sub-patches of the same grid with no stair-stepped edges.
    const body = sys('body'), doorsSys = sys('doors'), glassSys = sys('glass');
    const SQ = (u, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), n)), 1 / n);
    const Wp = (x) => {
      if (x > 1.35) return 0.77 * SQ((x - 1.35) / (NOSE - 1.35), 2.4);
      if (x < -1.35) return 0.77 * SQ((-1.35 - x) / (-1.35 - TAIL), 2.1);
      return 0.77 - 0.035 * smooth(-0.95, -0.45, x) * (1 - smooth(0.55, 0.95, x));
    };
    const archY = (ax, x) => { const d = (x - ax) / 0.40; return Math.abs(d) < 1 ? 0.27 + 0.43 * Math.sqrt(1 - d * d) : 0; };
    const Ll = (x) => Math.max(0.27 + 0.16 * smooth(1.7, NOSE, x) + 0.12 * smooth(-1.7, TAIL, x), archY(AXF, x), archY(AXR, x));
    const Tt = table([[-1.99, 0.6], [-1.985, 0.64], [-1.96, 0.7], [-1.9, 0.765], [-1.8, 0.83], [-1.68, 0.9], [-1.52, 0.985], [-1.38, 1.065], [-1.3, 1.1], [-1.15, 1.2], [-1.0, 1.305], [-0.8, 1.4], [-0.55, 1.462], [-0.28, 1.485], [0.0, 1.478], [0.2, 1.445], [0.32, 1.395], [0.4, 1.31], [0.5, 1.2], [0.6, 1.09], [0.68, 1.005], [0.74, 0.995], [0.95, 0.98], [1.15, 0.95], [1.4, 0.91], [1.7, 0.85], [1.9, 0.78], [1.98, 0.7]]);
    const crown = table([[-1.99, 0.09], [-1.7, 0.09], [-1.4, 0.08], [-1.3, 0.05], [-1.0, 0.04], [-0.8, 0.07], [-0.28, 0.075], [0.2, 0.06], [0.32, 0.03], [0.68, 0.03], [0.74, 0.07], [1.0, 0.12], [1.4, 0.14], [1.8, 0.12], [1.98, 0.09]]);
    const Zrt = table([[-1.99, 0.2], [-1.8, 0.36], [-1.55, 0.43], [-1.4, 0.47], [-1.3, 0.5], [-1.15, 0.52], [-1.0, 0.5], [-0.7, 0.52], [-0.4, 0.55], [-0.1, 0.56], [0.2, 0.54], [0.32, 0.5], [0.5, 0.53], [0.68, 0.575], [0.74, 0.5], [0.95, 0.45], [1.2, 0.41], [1.4, 0.37], [1.65, 0.31], [1.85, 0.22], [1.95, 0.12]]);
    const Zbt = table([[-1.99, 0.3], [-1.8, 0.58], [-1.55, 0.66], [-1.4, 0.7], [-1.2, 0.69], [-0.9, 0.675], [-0.5, 0.665], [0.0, 0.66], [0.4, 0.67], [0.68, 0.685], [0.78, 0.67], [1.05, 0.64], [1.4, 0.58], [1.7, 0.5], [1.9, 0.34], [1.98, 0.15]]);
    const Ybt = table([[-1.99, 0.6], [-1.9, 0.74], [-1.7, 0.87], [-1.55, 0.95], [-1.4, 0.99], [-1.2, 1.0], [-0.9, 0.99], [-0.5, 0.985], [0.0, 0.98], [0.4, 0.985], [0.68, 0.99], [0.8, 0.93], [1.05, 0.9], [1.4, 0.86], [1.75, 0.84], [1.9, 0.78], [1.98, 0.62]]);
    // half-section lines, top centre → sill: [name, segment, u]; segment 1 = K0 (top), 2 = K1 (roof edge / hood seam), 3 = K2 (belt), 4 = K3 (bulge), 5 = K4 (sill)
    const HL = [['c', 1, 0]];
    for (let k = 1; k <= 6; k++) HL.push(['r' + k, 1, k / 7]);
    HL.push(['K1', 2, 0], ['K1b', 2, 0.09]);
    for (let k = 1; k <= 3; k++) HL.push(['w' + k, 2, 0.09 + (0.91 * k) / 4]);
    HL.push(['K2', 3, 0], ['b1', 3, 0.5], ['K3', 4, 0], ['dl', 4, 0.62], ['dg', 4, 0.66], ['e1', 4, 0.82], ['K4', 5, 0]);
    const HI = {}; HL.forEach((l, i) => { HI[l[0]] = i; });
    const NH = HL.length, MID = NH - 1, NV = 2 * (NH - 1) + 1;
    const colPts = (x) => {
      const W = Wp(x), L = Ll(x), T = Tt(x);
      const Yr = T - crown(x), Yb = lerp(Math.min(Ybt(x), Yr - 0.025), Math.max(Ybt(x), Yr + 0.015), Math.max(smooth(0.6, 0.95, x), smooth(-1.0, -1.3, x))), Ym = Math.min(Math.max(0.62, L + 0.11), Yb - 0.03), Lc = Math.min(L, Ym - 0.03);
      const Zr = Math.min(Zrt(x), W * 0.62), Zb = Math.min(Zbt(x), W * 0.93), Zm = W, Zl = W * 0.93;
      const curve = new THREE.CatmullRomCurve3([V3(-Zr, Yr, 0), V3(0, T, 0), V3(Zr, Yr, 0), V3(Zb, Yb, 0), V3(Zm, Ym, 0), V3(Zl, Lc, 0)], false, 'centripetal');
      const fK = lerp(0.09, 0.02, Math.max(smooth(0.68, 0.74, x), smooth(-1.34, -1.38, x)));
      const half = HL.map(([nm, seg, u]) => { if (nm === 'K1b') u = fK; else if (nm[0] === 'w') u = fK + (1 - fK) * (+nm[1] / 4); return curve.getPoint(Math.min(1, (seg + u) / 5)); });
      const out = new Array(NV);
      half.forEach((p, k) => { out[MID + k] = V3(x, p.y, p.x); out[MID - k] = V3(x, p.y, -p.x); });
      return out;
    };
    // columns: dense at the tips (the section collapses there), fine over the cabin, exact at every seam
    const SEAM_X = [-1.38, -1.34, -1.02, -0.98, -0.385, -0.354, -0.35, -0.27, 0.235, 0.255, 0.32, 0.49, 0.494, 0.6, 0.604, 0.68, 0.736, 0.74];
    const XS = samples(TAIL, NOSE, (x) => { const d = Math.min(x - TAIL, NOSE - x); const base = x > -1.3 && x < 1.0 ? 0.03 : 0.05; return Math.min(base, 0.004 + 0.05 * d); }, SEAM_X);
    const GP = XS.map(colPts), NI = XS.length;
    const OUTC = (x) => V3(clamp(x, -1.2, 1.2), 0.62, 0);
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
    const XD0 = -0.35, XD1 = 0.6, XGAP = 0.004, XG0 = -0.27, XG1 = 0.49;
    const inX = (x, a, b) => x > a && x < b;
    const isWindshield = (x, lo, hi) => inX(x, 0.32, 0.68) && hi <= HI.K1;
    const isRear = (x, lo, hi) => inX(x, -1.34, -0.98) && hi <= HI.K1;
    const isDoorGlass = (x, lo, hi) => inX(x, XG0, 0.235) && lo >= HI.K1b && hi <= HI.K2;
    const isVent = (x, lo, hi) => inX(x, 0.255, XG1) && lo >= HI.K1b && hi <= HI.K2;
    const isQuarter = (x, lo, hi) => inX(x, -1.02, -0.385) && lo >= HI.K1b && hi <= HI.K2;
    const isHood = (x, lo, hi) => inX(x, 0.74, NOSE + 1) && hi <= HI.K1;
    const isLid = (x, lo, hi) => inX(x, TAIL - 1, -1.38) && hi <= HI.K1;
    const isDoorCell = (x, lo, hi) => (inX(x, XD0, XD1) && lo >= HI.K2 && hi <= HI.dl) || (inX(x, XD0, XG1) && lo >= HI.K1b && hi <= HI.K2 && !isDoorGlass(x, lo, hi) && !isVent(x, lo, hi));
    const isDoorHole = (x, lo, hi) => (inX(x, XD0 - XGAP, XD1 + XGAP) && lo >= HI.K2 && hi <= HI.dg) || (inX(x, XD0 - XGAP, XG1 + XGAP) && lo >= HI.K1b && hi <= HI.K2);
    const shellKeep = (x, lo, hi) => !(isWindshield(x, lo, hi) || isRear(x, lo, hi) || isDoorHole(x, lo, hi) || isQuarter(x, lo, hi) || (inX(x, 0.736, NOSE + 1) && hi <= HI.K1b) || (inX(x, TAIL - 1, -1.38) && hi <= HI.K1b));
    // ---- helpers that follow the grid lines exactly
    const jOf = (name, s) => (s > 0 ? MID + HI[name] : MID - HI[name]);
    const colAt = (x) => { let b = 0; for (let i = 0; i < NI; i++) if (Math.abs(XS[i] - x) < Math.abs(XS[b] - x)) b = i; return b; };
    // points along one grid row between two x values, pushed `off` along the normal
    const rowLine = (j, xa, xb, off = 0) => { const out = []; for (let i = 0; i < NI; i++) if (XS[i] >= xa - 1e-6 && XS[i] <= xb + 1e-6) out.push(GP[i][j].clone().addScaledVector(GN[i][j], off)); return out; };
    // points along one grid column between two rows
    const colLine = (i, ja, jb, off = 0) => { const out = [], d = Math.sign(jb - ja) || 1; for (let j = ja; d > 0 ? j <= jb : j >= jb; j += d) out.push(GP[i][j].clone().addScaledVector(GN[i][j], off)); return out; };
    const tubeAlong = (pts, r, seg = 8) => G.tube(pts, r, Math.max(8, pts.length * 3), seg, false, 'catmullrom', 0.3);
    const mergeTubes = (lines, r, seg = 8) => G.merge(lines.filter((l) => l.length > 1).map((l) => tubeAlong(l, r, seg)));
    // a mesh whose geometry is built in world coordinates but turns about `hinge` (a group sits there)
    const hinged = (parent, geo, mats, hinge, o = {}) => { const g = new THREE.Group(); g.position.set(...hinge); parent.add(g); geo.translate(-hinge[0], -hinge[1], -hinge[2]); mesh(geo, mats, { parent: g, ...o }); return g; };
    const sideMask = (f, s) => (x, lo, hi, i, j) => (s > 0 ? j >= MID : j < MID) && f(x, lo, hi);
    const SEAL = M.rubber();

    // ================================================================== BODY: shell + seals + arches
    {
      const shell = P(body, 'קליפת המרכב (גג, עמודים וכנפיים)', 'Body shell', 'פלדה 0.8–1 מ״מ + לכה', 'קליפה אחת מעוגלת מפח פלדה: הגג, העמודים, הדפנות והכנפיים האחוריות מרותכים כיחידה, והכנפיים הקדמיות מוברגות. הצורה ״הביצה״ נתנה לחיפושית קשיחות מצוינת ואת האווירודינמיקה המפורסמת שלה.');
      mesh(gridGeo(shellKeep, { thick: 0.012 }), [PAINT, EDGE], { parent: shell, name: 'shell skin' });
      // rolled lips around the four wheel arches
      for (const [ax, front] of [[AXF, true], [AXR, false]]) for (const s of [1, -1]) {
        const lip = P(body, `שפת קשת גלגל ${front ? 'קדמי' : 'אחורי'} ${sideHe(s)}`, `${front ? 'Front' : 'Rear'} ${sideEn(s)} arch lip`, 'פח מגולגל + לכה', 'שפת הקשת מגולגלת פנימה כדי לחזק את הפח ולמנוע חיתוך. בין הכנף לגוף נדחס פס גומי שמונע רעש וחלודה.');
        const j = s > 0 ? NV - 1 : 0;
        const pts = rowLine(j, ax - 0.41, ax + 0.41, 0.004).filter((p) => p.y > 0.3);
        mesh(tubeAlong(pts, 0.0085, 8), PAINT, { parent: lip });
      }
      // inner wheelhouses (half cylinders over each wheel) with the body-colour undercoat
      for (const [ax, front] of [[AXF, true], [AXR, false]]) for (const s of [1, -1]) {
        const hw = front ? HWF : HWR;
        const wh = P(body, `קשת פנימית (בית גלגל) ${front ? 'קדמי' : 'אחורי'} ${sideHe(s)}`, `${front ? 'Front' : 'Rear'} ${sideEn(s)} wheelhouse`, 'פלדה מגולוונת + שכבת הגנה', 'מעטפת פנימית מעל כל גלגל שמגינה על הרכב מבוץ ומים שהצמיג מתיז, ומפרידה בין הגלגל לתא הפנימי.');
        const g = new THREE.CylinderGeometry(0.385, 0.385, 0.22, 40, 1, true, PI * 0.5, PI); g.rotateX(PI / 2);
        mesh(g, dbl(M.paintFlat(0x15161a, 0.8)), { parent: wh, pos: [ax, TR, s * (hw - 0.035)], cast: false });
      }
    }
    // ---- hood (front luggage lid) and engine lid, hinged
    const hoodHinge = [0.74, Tt(0.74) - 0.005, 0];
    const hoodP = P(doorsSys, 'מכסה תא המטען (מכסה קדמי)', 'Front luggage hood', 'פלדה 0.8 מ״מ + לכה', 'מכסה גדול אחד עם גב מחוזק, נפתח קדימה ומעלה על שני צירים בקצהו הקרוב לשמשה. מתחתיו תא המטען: גלגל חילוף, מיכל דלק וערכת כלים.');
    const hoodG = hinged(hoodP, gridGeo(isHood, { thick: 0.012 }), [PAINT, EDGE], hoodHinge, { name: 'hood skin' });
    const lidHinge = [-1.38, Tt(-1.38) - 0.005, 0];
    const lidP = P(doorsSys, 'מכסה מנוע (מכסה אחורי)', 'Engine lid', 'פלדה 0.8 מ״מ + לכה', 'המכסה מעל המנוע האחורי, עם חריצי אוורור מעל המאוורר. נפתח כלפי מעלה על שני צירים בקצהו הקדמי.');
    const lidG = hinged(lidP, gridGeo(isLid, { thick: 0.012 }), [PAINT, EDGE], lidHinge, { name: 'lid skin' });
    K.toggle('hood', { he: 'מכסה תא מטען', key: 'h', seconds: 1.4 }, (t) => { hoodG.rotation.z = Math.sin(t * PI / 2) * 1.2; });
    K.toggle('lid', { he: 'מכסה מנוע', key: 'n', seconds: 1.4 }, (t) => { lidG.rotation.z = -Math.sin(t * PI / 2) * 1.0; });
    // ---- doors, hinged at the front edge
    const doorHinge = (s) => { const j = jOf('K2', s), i = colAt(XD1); return [XD1, (GP[i][j].y + GP[colAt(XD1)][jOf('dl', s)].y) / 2, s * Math.abs(GP[i][j].z)]; };
    const doorList = [];
    for (const s of [1, -1]) {
      const sH = sideHe(s), sE = sideEn(s);
      const dp = P(doorsSys, `דלת ${sH}`, `${s > 0 ? 'Right' : 'Left'} door`, 'פלדה מעוצבת + לכה', 'דלת מסגרת פלדה עם חלון מגולל וחלון איוורור. הצירים בקצה הקדמי, והיא ננעלת בתפס בעמוד האחורי.');
      const h = doorHinge(s);
      const g = hinged(dp, gridGeo(sideMask(isDoorCell, s), { thick: 0.012 }), [PAINT, EDGE], h, { name: 'door skin' });
      doorList.push({ s, g, h, dp });
    }
    K.toggle('doors', { he: 'דלתות', key: 'd', seconds: 1.4 }, (t) => { const e = Math.sin(t * PI / 2); for (const d of doorList) d.g.rotation.y = d.s * e * 1.15; });

    // ---- glass and rubber seals
    {
      const GLASS = M.glass(0x7fa0ae, 0.2), TINT = M.glass(0x7fa0ae, 0.26);
      const wsP = P(glassSys, 'שמשה קדמית', 'Windshield', 'זכוכית שכבתית 5 מ״מ', 'שמשה שכבתית מעט קמורה, מוחזקת בגומי בלי מסגרת. ב־1963 היא עוד קטנה יחסית: בדגמי 1965 הוגדלה בכ־18% (לפי תיעוד).');
      mesh(gridGeo(isWindshield, { off: -0.006 }), GLASS, { parent: wsP, cast: false });
      const rwP = P(glassSys, 'חלון אחורי', 'Rear window', 'זכוכית מחוסמת', 'חלון אחורי ״גדול״ שהחליף ב־1957 את החלון הקטן הקודם, מותקן בגומי.');
      mesh(gridGeo(isRear, { off: -0.006 }), GLASS, { parent: rwP, cast: false });
      const qP = P(glassSys, 'חלונות צד אחוריים (2)', 'Rear quarter windows', 'זכוכית מחוסמת', 'חלון קבוע קטן מאחורי הדלת. בחלק מהדגמים הוא נפתח החוצה בציר אחורי; כאן הוא קבוע.');
      mesh(gridGeo(isQuarter, { off: -0.006 }), TINT, { parent: qP, cast: false });
      const loop = (xa, xb, ja, jb, off = 0.004) => [rowLine(ja, xa, xb, off), rowLine(jb, xa, xb, off), colLine(colAt(xa), ja, jb, off), colLine(colAt(xb), ja, jb, off)];
      for (const s of [1, -1]) {
        const D = doorList.find((d) => d.s === s), h = D.h, sd = sideHe(s), se = sideEn(s);
        const tr = (g) => g.translate(-h[0], -h[1], -h[2]);
        const dgp = P(D.g, `זכוכית דלת ${sd}`, `${se} door glass`, 'זכוכית מחוסמת', 'חלון הדלת יורד לתוך הדלת בעזרת ידית סלילה. הזכוכית מחוסמת, ואם היא נשברת, מתפרקת לגרגרים קטנים.'); dgp.userData.sysOverride = 'glass';
        const dg = new THREE.Group(); dgp.add(dg); D.glass = dg;
        mesh(tr(gridGeo(sideMask(isDoorGlass, s), { off: -0.006 })), TINT, { parent: dg, cast: false });
        const vwp = P(D.g, `חלון איוורור ${sd}`, `${se} vent wing`, 'זכוכית מחוסמת + מסגרת כרום', 'חלון משולש קטן שנפתח החוצה כמו מניפה כדי להכניס אוויר לתא בלי רוח. אחד הסמלים של תקופת ה־50 וה־60.'); vwp.userData.sysOverride = 'glass';
        const vi = colAt(XG1), vpv = [XG1, 0, (GP[vi][jOf('K1b', s)].z + GP[vi][jOf('K2', s)].z) / 2];
        const vg = new THREE.Group(); vg.position.set(vpv[0] - h[0], vpv[1] - h[1], vpv[2] - h[2]); vwp.add(vg); D.vent = vg;
        mesh(gridGeo(sideMask(isVent, s), { off: -0.006 }).translate(-vpv[0], -vpv[1], -vpv[2]), TINT, { parent: vg, cast: false });
        const vf = P(D.g, `מסגרת חלון איוורור ${sd}`, `${se} vent-wing frame`, 'פליז מכוסה כרום', 'מסגרת כרום מעוגלת סביב חלון האיוורור, עם ידית נעילה קטנה.'); vf.userData.sysOverride = 'trim';
        D.ventFrame = vg;
        const sl = P(D.g, `אטם חלון דלת ${sd}`, `${se} door window seal`, 'גומי EPDM', 'פרופיל גומי שחור סביב חלון הדלת. מונע חדירת גשם ורעש רוח.'); sl.userData.sysOverride = 'glass';
        mesh(tr(mergeTubes(loop(XG0, XG1, jOf('K1b', s), jOf('K2', s)), 0.006)), SEAL, { parent: sl });
        const cs = P(D.g, `פס כרום חלון ${sd}`, `${se} window chrome strip`, 'פליז מכוסה כרום', 'פס כרום בתחתית חלון הדלת ועמוד האיוורור האנכי: אחד הפרטים שמעטרים את הדגם.'); cs.userData.sysOverride = 'trim';
        mesh(tr(tubeAlong(rowLine(jOf('K2', s), XG0, XG1, 0.006), 0.0045)), CHROME, { parent: cs });
        mesh(tr(tubeAlong(colLine(colAt(0.245), jOf('K1b', s), jOf('K2', s), 0.006), 0.0055)), CHROME, { parent: cs });
      }
      const sealP = P(glassSys, 'אטמי גומי לשמשות', 'Glass seals', 'גומי EPDM', 'פרופיל גומי שחור עם חריץ שבו יושבת הזכוכית. לפעמים נדחס בתוכו פס כרום דק.');
      const wsL = [rowLine(MID - HI.K1, 0.32, 0.68, 0.004), rowLine(MID + HI.K1, 0.32, 0.68, 0.004), colLine(colAt(0.32), MID - HI.K1, MID + HI.K1, 0.004), colLine(colAt(0.68), MID - HI.K1, MID + HI.K1, 0.004)];
      mesh(mergeTubes(wsL, 0.0075), SEAL, { parent: sealP });
      const rwL = [rowLine(MID - HI.K1, -1.34, -0.98, 0.004), rowLine(MID + HI.K1, -1.34, -0.98, 0.004), colLine(colAt(-1.34), MID - HI.K1, MID + HI.K1, 0.004), colLine(colAt(-0.98), MID - HI.K1, MID + HI.K1, 0.004)];
      mesh(mergeTubes(rwL, 0.0075), SEAL, { parent: sealP });
      for (const s of [1, -1]) mesh(mergeTubes(loop(-1.02, -0.385, jOf('K1b', s), jOf('K2', s)), 0.006), SEAL, { parent: sealP });
    }
    // ---- surface helpers (positions of lamps, badges, handles from the shell grid)
    const orient = (obj, n, up = V3(0, 1, 0)) => { const zA = n.clone().normalize(); const yA = up.clone().addScaledVector(zA, -up.dot(zA)).normalize(); const xA = yA.clone().cross(zA); obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA)); return obj; };
    const upper = (x, za, s = 1) => { const i = colAt(x); for (let k = 0; k < HI.K3; k++) { const a = GP[i][MID + k], b = GP[i][MID + k + 1]; if (b.z >= za && a.z <= za) { const t = (za - a.z) / Math.max(1e-6, b.z - a.z); const p = a.clone().lerp(b, t), n = GN[i][MID + k].clone().lerp(GN[i][MID + k + 1], t).normalize(); if (s < 0) { p.z = -p.z; n.z = -n.z; } return { p, n }; } } return null; };
    const frontX = (za, y, s = 1) => { for (let x = NOSE; x > 0.8; x -= 0.01) { const u = upper(x, za); if (u && u.p.y >= y) return upper(x, za, s); } return upper(1.2, za, s); };
    const sideAt = (x, y, s = 1) => { const i = colAt(x); for (let k = HI.K2; k < HI.K4; k++) { const a = GP[i][MID + k], b = GP[i][MID + k + 1]; if (a.y >= y && b.y <= y) { const t = (a.y - y) / Math.max(1e-6, a.y - b.y); const p = a.clone().lerp(b, t), n = GN[i][MID + k].clone().lerp(GN[i][MID + k + 1], t).normalize(); if (s < 0) { p.z = -p.z; n.z = -n.z; } return { p, n }; } } return null; };
    const rearAt = (y, zMax = 0.16) => { let best = 0; for (let i = 0; i < 40; i++) for (let j = 0; j < NV; j++) { const p = GP[i][j]; if (Math.abs(p.z) < zMax && Math.abs(p.y - y) < 0.03 && p.x < best) best = p.x; } return best; };
    const decal = (parent, tex, w, h, pos, n, up, o = {}) => { const m = mesh(new THREE.PlaneGeometry(w, h), M.decal(tex, { roughness: o.roughness ?? 0.4, metalness: o.metalness ?? 0 }), { parent, pos: pos.toArray(), cast: false }); orient(m, n, up); return m; };
    // sweep a section [[outwards, y]…] along a plan-view path [[x, z]…] (bumper blades)
    const sweepPlan = (path, section, outSign = 1) => {
      const rings = path.map(([x, z], i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz); tx /= l; tz /= l; const nx = outSign * tz, nz = -outSign * tx; return section.map(([o, y]) => V3(x + nx * o, y, z + nz * o)); });
      const pos = [], ind = [], nr = rings.length, np = rings[0].length;
      rings.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
      for (let i = 0; i < nr - 1; i++) for (let j = 0; j < np - 1; j++) { const a = i * np + j, b = a + 1, c = (i + 1) * np + j + 1, d = (i + 1) * np + j; ind.push(a, b, c, a, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind); g.computeVertexNormals(); return g;
    };

    // ================================================================== LIGHTS
    const lightsSys = sys('lights'), trimSys = sys('trim');
    const LM = {
      head: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0c0, emissiveIntensity: 0.04, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, name: 'עדשת פנס ראשי' }),
      amber: new THREE.MeshStandardMaterial({ color: 0xe8a21a, emissive: 0xff9a10, emissiveIntensity: 0.04, roughness: 0.15, transparent: true, opacity: 0.85, name: 'עדשה כתומה' }),
      red: new THREE.MeshStandardMaterial({ color: 0xb01012, emissive: 0xff1f1f, emissiveIntensity: 0.04, roughness: 0.18, transparent: true, opacity: 0.9, name: 'עדשה אדומה' }),
      plate: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, emissive: 0xfff2c8, emissiveIntensity: 0.0, roughness: 0.2, transparent: true, opacity: 0.8, name: 'עדשת פנס לוחית' }),
      bulb: new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffe9a0, emissiveIntensity: 0.15, roughness: 0.2, name: 'נורה' }),
      flasher: new THREE.MeshStandardMaterial({ color: 0xe8a21a, emissive: 0xff9a10, emissiveIntensity: 0.04, roughness: 0.15, transparent: true, opacity: 0.85, name: 'עדשה כתומה' }),
    };
    const lensTex = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,130,140,0.6)'; g.lineWidth = 2; for (let r = 18; r < 128; r += 11) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); } }, { });
    const lampKeep = []; // mesh refs whose emissive follows the toggle
    for (const s of [1, -1]) {
      const sH = sideHe(s), sE = sideEn(s);
      const hl = P(lightsSys, `פנס ראשי ${sH}`, `Headlamp ${sE}`, 'זכוכית + כרום + מחזיר מצופה אלומיניום', 'פנס ראשי עגול בקוטר 7 אינץ׳ (כ־180 מ״מ): עדשה מחורצת, מחזיר פרבולי ונורה כפולת להט לאור גבוה ונמוך. טבעת כרום מחזיקה אותו בכנף.');
      hl.position.set(1.9, 0.655, s * 0.47); hl.rotation.y = -s * 0.12;
      // bucket
      mesh(G.lathe([[0.094, 0.012], [0.098, -0.03], [0.09, -0.11], [0.0, -0.14]], 36, 'x'), PAINT, { parent: hl, name: 'pod' });
      mesh(G.lathe([[0.083, 0.012], [0.085, -0.03], [0.07, -0.085], [0.0, -0.1]], 36, 'x'), M.paintFlat(0x15161a, 0.6), { parent: hl, pos: [0.0, 0, 0], name: 'bucket' });
      mesh(G.lathe([[0.0, -0.06], [0.03, -0.055], [0.06, -0.035], [0.08, -0.01], [0.082, 0.0]], 36, 'x'), M.metal(0xd2d6da, 0.22), { parent: hl, name: 'reflector' });
      mesh(G.lathe([[0.0, 0.0], [0.075, 0.0], [0.082, 0.004], [0.083, 0.012]], 36, 'x'), LM.head, { parent: hl, pos: [0.006, 0, 0], name: 'lens' });
      mesh(G.sphere(0.012, 12, 10), LM.bulb, { parent: hl, pos: [-0.03, 0, 0], name: 'bulb' });
      mesh(G.torus(0.088, 0.0075, 10, 44, PI * 2, 'x'), CHROME, { parent: hl, pos: [0.018, 0, 0], name: 'bezel' });
      mesh(G.torus(0.094, 0.004, 8, 44, PI * 2, 'x'), CHROME, { parent: hl, pos: [0.0, 0, 0], name: 'rim' });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2 + 1.5; put(G.cyl(0.005, 0.005, 0.01, 8, 'x'), STEEL, hl, [0.024, Math.cos(a) * 0.092, Math.sin(a) * 0.092]); }
      lampKeep.push({ m: LM.head });
      // turn-signal lamp on top of the fender
      const fp = upper(1.52, 0.60, s);
      const tl = P(lightsSys, `מהבהב קדמי ${sH}`, `Front turn signal ${sE}`, 'כרום + עדשה כתומה', 'מהבהב מוגבה על ראש הכנף עם בסיס כרום ועדשה כתומה. נורת 6 וולט מהבהבת בעזרת ממסר.');
      tl.position.copy(fp.p).addScaledVector(fp.n, -0.005); orient(tl, fp.n, V3(1, 0, 0));
      mesh(G.lathe([[0.0, 0.0], [0.034, 0.0], [0.036, 0.006], [0.03, 0.012]], 24, 'z'), CHROME, { parent: tl });
      mesh(G.sphere(0.03, 18, 12, 0, 1), LM.flasher, { parent: tl, pos: [0, 0, 0.004], scale: [1.1, 0.8, 0.8] });
      put(G.cyl(0.02, 0.02, 0.012, 12, 'z'), M.paintFlat(0x15161a, 0.6), tl, [0, 0, 0.0]);
      // horn grille on the front of the fender
      const hg = frontX(0.6, 0.55, s);
      const hgP = P(trimSys, `גריל צופר ${sH}`, `Horn grille ${sE}`, 'פליז מכוסה כרום', 'גריל סגלגל מכרום מעל פתח הצופר בכנף: אחד הפרטים המוכרים של חזית החיפושית.');
      hgP.position.copy(hg.p).addScaledVector(hg.n, 0.001); orient(hgP, hg.n, V3(0, 1, 0));
      mesh(G.torus(0.035, 0.0045, 6, 28, PI * 2, 'z'), CHROME, { parent: hgP, scale: [1.5, 0.75, 1] });
      for (let k = -3; k <= 3; k++) put(G.box(0.07, 0.0042, 0.004, 0.0015, 1), CHROME, hgP, [0, k * 0.0085, 0.002]);
      // tail lamp (the 1962-67 large "elephant foot" unit)
      const tu = upper(-1.8, 0.45, s);
      const rl = P(lightsSys, `פנס זנב ${sH} (רגל פיל)`, `Tail lamp ${sE}`, 'פלסטיק אדום + בסיס כרום', 'פנס זנב גדול וסגלגל שמשלב אור אחורי ואור בלימה בעדשה אחת. ״רגל פיל״ — כך קראו לו בגלל צורתו הבולטת, בשנתונים 1962–1967.');
      rl.position.copy(tu.p).addScaledVector(tu.n, -0.004); orient(rl, tu.n, V3(1, 0, 0));
      mesh(G.lathe([[0.0, 0.0], [0.07, 0.0], [0.074, 0.008], [0.066, 0.016]], 28, 'z'), CHROME, { parent: rl, scale: [1.0, 1.35, 1] });
      mesh(G.sphere(0.063, 24, 14, 0, 1), LM.red, { parent: rl, pos: [0, 0, 0.004], scale: [1.0, 1.28, 0.7] });
      mesh(G.sphere(0.012, 10, 8), LM.bulb, { parent: rl, pos: [0, 0, 0.012], scale: [1, 1, 0.8] });
      mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 14), M.lens(0xf5f0e8, 0.8), { parent: rl, pos: [0.0, -0.045, 0.034], rot: [PI / 2, 0, 0] });
      lampKeep.push({ m: LM.red });
    }
    // number-plate lamp housing (rear) and interior dome lamp are added with the plates below
    // ================================================================== BUMPERS, PLATES, BADGES
    const bump = (front) => {
      const sgn = front ? 1 : -1, cx = front ? 2.0 : -2.005;
      const name = front ? 'פגוש קדמי (להב)' : 'פגוש אחורי (להב)';
      const bp = P(trimSys, name, front ? 'Front blade bumper' : 'Rear blade bumper', 'פלדה מכוסה כרום', 'פגוש ״להב״ מפלדה לחוצה ומכוסה כרום, מחובר בשתי זרועות לשלדה. בארה״ב הוסיפו עליו מגיני פגוש אנכיים.');
      const half = (sg) => { const out = []; for (let k = 0; k <= 26; k++) { const t = k / 26; const z = sg * t * 0.7; const back = (t > 0.45 ? Math.pow((t - 0.45) / 0.55, 2.0) : 0) * 0.34; out.push([cx - sgn * (0.01 * t + back), z]); } return out; };
      const full = [...half(-1).reverse(), ...half(1).slice(1)];
      const sec = [[0.0, -0.058], [0.012, -0.05], [0.02, -0.03], [0.022, -0.012], [0.02, 0.0], [0.022, 0.012], [0.02, 0.03], [0.012, 0.05], [0.0, 0.058], [-0.004, 0.05], [-0.006, 0.0], [-0.004, -0.05], [0.0, -0.058]];
      const g = sweepPlan(full, sec.map(([o, y]) => [o, y + 0.405]), front ? 1 : -1);
      const mat = dbl(CHROME); mesh(g, mat, { parent: bp, name: 'blade' });
      // brackets back to the frame horns (black steel), bolts
      for (const z of [-0.42, 0.42]) { rod(bp, [cx - sgn * 0.03, 0.4, z], [cx - sgn * 0.2, 0.44, z * 0.9], 0.012, IRON); bolts(bp, [{ pos: [cx + sgn * 0.0, 0.405, z], rot: [0, 0, -PI / 2 * sgn] }], 0.007, CHROME); }
      // over-riders (bumper guards)
      for (const z of [-0.45, 0.45]) {
        const og = P(trimSys, `מגן פגוש ${front ? 'קדמי' : 'אחורי'} ${z > 0 ? 'ימין' : 'שמאל'}`, `${front ? 'Front' : 'Rear'} overrider ${z > 0 ? 'right' : 'left'}`, 'פלדה מכוסה כרום + גומי', 'עמוד אנכי מכרום עם רצועת גומי שמגן על הפגוש והכנף ממכות חניה.');
        mesh(G.lathe([[0.0, -0.11], [0.02, -0.11], [0.024, -0.09], [0.024, 0.07], [0.02, 0.095], [0.0, 0.1]], 20, 'y'), CHROME, { parent: og, pos: [cx + sgn * 0.035, 0.42, z] });
        put(G.box(0.008, 0.12, 0.014, 0.003), M.rubber(), og, [cx + sgn * 0.06, 0.4, z]);
        bolts(og, [{ pos: [cx + sgn * 0.0, 0.46, z], rot: [0, 0, -PI / 2 * sgn] }, { pos: [cx + sgn * 0.0, 0.35, z], rot: [0, 0, -PI / 2 * sgn] }], 0.0055, CHROME);
      }
      return bp;
    };
    bump(true); bump(false);
    // number plates
    const plateTex = (txt, front) => K.canvasTexture(512, 256, (g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#10265f'; g.fillRect(14, 14, 54, h - 28); g.fillStyle = '#fff'; g.font = '700 38px Arial'; g.textAlign = 'center'; g.fillText('D', 41, h - 34); g.fillStyle = '#111'; g.font = '700 120px "DIN Alternate","Arial Narrow",Arial'; g.fillText(txt, w / 2 + 28, 168); });
    {
      const fp = P(trimSys, 'לוחית רישוי קדמית', 'Front licence plate', 'אלומיניום מוטבע', 'לוחית רישוי קדמית על תושבת מעל הפגוש. האותיות שחורות על רקע לבן, והסימן D מציין את גרמניה.');
      const px = 2.0, py = 0.54;
      mesh(G.box(0.012, 0.13, 0.3, 0.003), M.metal(0xeeeeea, 0.5), { parent: fp, pos: [px + 0.0, py, 0] });
      const t = plateTex('WOB 63', true); const m = mesh(new THREE.PlaneGeometry(0.296, 0.126), M.decal(t, { roughness: 0.5 }), { parent: fp, pos: [px + 0.0075, py, 0], rot: [0, PI / 2, 0], cast: false });
      for (const z of [-0.12, 0.12]) rod(fp, [px - 0.01, py - 0.05, z], [px - 0.02, 0.43, z], 0.006, IRON);
      const rp = P(trimSys, 'לוחית רישוי אחורית', 'Rear licence plate', 'אלומיניום מוטבע', 'לוחית רישוי אחורית שמותקנת בלוח הזנב, ופנס קטן מעליה מאיר אותה בלילה.');
      const ry = 0.5, rx = rearAt(ry) - 0.009;
      mesh(G.box(0.012, 0.13, 0.3, 0.003), M.metal(0xeeeeea, 0.5), { parent: rp, pos: [rx, ry, 0] });
      mesh(new THREE.PlaneGeometry(0.296, 0.126), M.decal(plateTex('WOB 63', false), { roughness: 0.5 }), { parent: rp, pos: [rx - 0.0075, ry, 0], rot: [0, -PI / 2, 0], cast: false });
      bolts(rp, [-0.13, 0.13].map((z) => ({ pos: [rx - 0.008, ry + 0.045, z], rot: [0, 0, PI / 2] })).concat([-0.13, 0.13].map((z) => ({ pos: [rx - 0.008, ry - 0.045, z], rot: [0, 0, PI / 2] }))), 0.004, CHROME);
      const pl = P(lightsSys, 'פנס לוחית רישוי', 'Number-plate lamp', 'פלסטיק + כרום', 'מעטפת קטנה ומעוגלת מעל הלוחית עם עדשה שקופה שמאירה אותה. אחד הפרטים המזוהים של החיפושית מאחור.');
      mesh(G.sphere(0.04, 16, 10, 0, 1), CHROME, { parent: pl, pos: [rx - 0.003, ry + 0.115, 0], scale: [0.55, 0.5, 1.6] });
      mesh(new THREE.BoxGeometry(0.003, 0.012, 0.09), LM.plate, { parent: pl, pos: [rx - 0.02, ry + 0.104, 0] });
      lampKeep.push({ m: LM.plate });
    }
    K.toggle('lights', { he: 'פנסים', key: 'l', seconds: 0.4, night: true }, (t) => { if (LM.dome) LM.dome.emissiveIntensity = t * 0.9; LM.head.emissiveIntensity = 0.04 + t * 3.5; LM.bulb.emissiveIntensity = 0.15 + t * 3.0; LM.amber.emissiveIntensity = 0.04 + t * 1.2; LM.flasher.emissiveIntensity = 0.04 + t * 1.4; LM.red.emissiveIntensity = 0.04 + t * 2.4; LM.plate.emissiveIntensity = t * 1.2; });
    // hood crest and engine-lid script
    {
      const cr = P(hoodG, 'סמל וולפסבורג על המכסה', 'Wolfsburg crest', 'פליז מכוסה כרום + אמייל', 'סמל העיר וולפסבורג (מצודה על רקע כחול) על שיפוע קדמת המכסה, מעל פגוש הלהב. כך עיטרו את החיפושית בשנות ה־50 וה־60.');
      cr.userData.sysOverride = 'trim'; const hp = upper(1.93, 0.0); const pos = hp.p.clone().addScaledVector(hp.n, 0.003).sub(V3(...hoodHinge));
      const crt = K.canvasTexture(256, 320, (g, w, h) => { g.fillStyle = '#ccd0d4'; g.fillRect(0, 0, w, h); g.fillStyle = '#17304d'; g.beginPath(); g.moveTo(24, 20); g.lineTo(w - 24, 20); g.lineTo(w - 24, h * 0.62); g.quadraticCurveTo(w / 2, h - 10, w / 2, h - 10); g.quadraticCurveTo(w / 2, h - 10, 24, h * 0.62); g.closePath(); g.fill(); g.fillStyle = '#e7d9a2'; g.fillRect(52, 90, w - 104, 80); for (let i = 0; i < 4; i++) g.fillRect(52 + i * 38, 70, 22, 24); g.fillStyle = '#17304d'; g.fillRect(w / 2 - 14, 120, 28, 50); g.fillStyle = '#a82a2a'; g.fillRect(52, 190, w - 104, 14); g.fillStyle = '#e7d9a2'; g.beginPath(); g.moveTo(40, 224); g.quadraticCurveTo(w / 2, 250, w - 40, 224); g.lineTo(w - 40, 238); g.quadraticCurveTo(w / 2, 266, 40, 238); g.fill(); });
      const crm = decal(cr, crt, 0.07, 0.088, pos, hp.n, V3(1, 0, 0), { roughness: 0.3, metalness: 0.5 });
      mesh(G.torus(0.04, 0.003, 6, 24, PI * 2, 'z'), CHROME, { parent: cr, pos: pos.toArray(), scale: [0.8, 1.05, 0.5] }).quaternion.copy(crm.quaternion);
      const sp = P(lidG, 'כיתוב Volkswagen על מכסה המנוע', 'Volkswagen script', 'פלסטיק + כרום', 'כיתוב Volkswagen בכתב יד, מפלסטיק מצופה כרום, על מכסה המנוע מעל לוחית הרישוי.');
      sp.userData.sysOverride = 'trim'; const sx = -1.78, sz = 0.0; const sn = (() => { const i = colAt(sx); return GN[i][MID].clone(); })(); const spos = GP[colAt(sx)][MID].clone().addScaledVector(sn, 0.003).sub(V3(...lidHinge));
      const st = K.textTexture('Volkswagen', { font: 'italic 700 130px "Brush Script MT","URW Chancery L","Z003","Lucida Handwriting",cursive', color: '#d8dce0', pad: 8 });
      decal(sp, st.tex, 0.26, 0.26 / st.aspect, spos, sn, V3(1, 0, 0), { metalness: 0.7, roughness: 0.25 });
    }
    // ================================================================== WHEELS (5.60-15 tyres on 4J×15 steel rims)
    const wheelsSys = sys('wheels'), brakesSys = sys('brakes'), suspSys = sys('suspension'), chassisSys = sys('chassis');
    const steerGroups = [];
    const tyreGeo = G.lathe([[0.195, -0.05], [0.203, -0.061], [0.23, -0.069], [0.27, -0.071], [0.297, -0.063], [0.309, -0.046], [0.3125, -0.036], [0.315, -0.032], [0.315, -0.0245], [0.3115, -0.0225], [0.3115, -0.0135], [0.315, -0.0115], [0.315, 0.0115], [0.3115, 0.0135], [0.3115, 0.0225], [0.315, 0.0245], [0.315, 0.032], [0.3125, 0.036], [0.309, 0.046], [0.297, 0.063], [0.27, 0.071], [0.23, 0.069], [0.203, 0.061], [0.195, 0.05]], 72, 'z');
    const rimBarrel = G.lathe([[0.1895, -0.047], [0.2005, -0.047], [0.2055, -0.05], [0.2055, -0.054], [0.199, -0.056], [0.189, -0.045], [0.186, -0.03], [0.186, 0.03], [0.189, 0.045], [0.199, 0.056], [0.2055, 0.054], [0.2055, 0.05], [0.2005, 0.047], [0.1895, 0.047]], 56, 'z');
    const discGeo = G.lathe([[0.186, 0.028], [0.16, 0.034], [0.13, 0.04], [0.105, 0.046], [0.098, 0.052], [0.06, 0.052], [0.03, 0.05], [0.028, 0.044], [0.0, 0.044]], 48, 'z');
    const capGeo = G.lathe([[0.101, 0.05], [0.101, 0.056], [0.097, 0.062], [0.085, 0.07], [0.06, 0.078], [0.03, 0.082], [0.0, 0.083]], 48, 'z');
    const vwLogo = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#12283f'; g.beginPath(); g.arc(w / 2, h / 2, 118, 0, 7); g.fill(); g.strokeStyle = '#e8ecef'; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, h / 2, 108, 0, 7); g.stroke(); g.fillStyle = '#e8ecef'; g.font = '700 118px Arial'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('V', w / 2, h / 2 + 4); g.fillText('W', w / 2, h / 2 + 100); g.fillStyle = '#12283f'; g.fillRect(w / 2 - 52, h / 2 + 8, 104, 5); });
    const arcText = (g, txt, cx, cy, r, mid, size, top = true) => { g.font = `600 ${size}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; const n = txt.length, step = (size * 0.62) / r; for (let i = 0; i < n; i++) { const a = top ? mid + step * ((n - 1) / 2 - i) : mid + step * (i - (n - 1) / 2); g.save(); g.translate(cx + Math.cos(a) * r, cy - Math.sin(a) * r); g.rotate(top ? -(a - PI / 2) : -(a + PI / 2)); g.fillText(txt[i], 0, 0); g.restore(); } };
    const sideTex = { tex: K.canvasTexture(1024, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#cfcfcf'; arcText(g, '5.60 – 15', 512, 512, 405, PI / 2, 58, true); arcText(g, 'TUBE TYPE · 4 PLY', 512, 512, 405, -PI / 2, 44, false); g.fillStyle = '#8a8a8a'; arcText(g, 'MADE IN GERMANY', 512, 512, 405, 0.2, 34, true); g.strokeStyle = 'rgba(200,200,200,0.35)'; g.lineWidth = 5; g.beginPath(); g.arc(512, 512, 338, 0, 7); g.stroke(); g.beginPath(); g.arc(512, 512, 456, 0, 7); g.stroke(); }) };
    const WHEELRING = new THREE.RingGeometry(0.205, 0.30, 64);
    { const p = WHEELRING.attributes.position, uv = WHEELRING.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 0.62, 0.5 + p.getY(i) / 0.62); }
    const lugPos = Array.from({ length: 5 }, (_, k) => { const a = (k / 5) * PI * 2 + 0.3; return [Math.cos(a) * 0.1025, Math.sin(a) * 0.1025, 0.056]; });
    const ventPos = Array.from({ length: 5 }, (_, k) => { const a = (k / 5) * PI * 2 + 0.3 + PI / 5; return { pos: [Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.0345], rot: [0, 0, a + PI / 2] }; });
    const DISC = M.paintFlat(0x232428, 0.45);
    const wheelSpots = [{ x: AXF, s: 1, front: true }, { x: AXF, s: -1, front: true }, { x: AXR, s: 1, front: false }, { x: AXR, s: -1, front: false }];
    const buildWheel = (parent, name, en, spare = false) => {
      const tire = P(parent, `צמיג ${name}`, `${en} tyre`, 'גומי + בד ניילון (4 שכבות)', 'צמיג דיאגונלי 5.60־15 עם כיתוב מידה על הדופן ושלוש שורות חריצים אורכיות שמנקזות מים.');
      mesh(tyreGeo, M.tire(), { parent: tire });
      mesh(WHEELRING, M.decal(sideTex.tex, { roughness: 0.9, clearcoat: 0 }), { parent: tire, pos: [0, 0, 0.0725], cast: false });
      const rim = P(parent, `חישוק ${name}`, `${en} rim`, 'פלדה מגולגלת + לכה', 'חישוק פלדה 4J×15 מרותך משני חלקים (קנה ודיסק). בדיסק חמישה חריצי אוורור לקירור הבלם וחמישה חורי ברגים.');
      mesh(rimBarrel, M.metal(0x1f2023, 0.55), { parent: rim });
      mesh(discGeo, DISC, { parent: rim });
      instances(new THREE.BoxGeometry(0.075, 0.02, 0.008), M.black(), ventPos, { parent: rim, cast: false });
      mesh(G.cyl(0.0042, 0.0042, 0.022, 8, 'z'), BRASS_V, { parent: rim, pos: [Math.cos(1.1) * 0.188, Math.sin(1.1) * 0.188, 0], rot: [0, 0, 0] });
      const lugs = P(parent, `ברגי גלגל ${name} (5)`, `${en} wheel nuts (×5)`, 'פלדה מצופה קדמיום', 'חמישה ברגי גלגל קוניים במעגל של 205 מ״מ, שמוסתרים מתחת לכיסוי הנאב.');
      instances(G.hexNut(0.012, 0.016), M.metal(0x9a9da2, 0.35), lugPos.map((p) => ({ pos: p, rot: [PI / 2, 0, 0] })), { parent: lugs });
      if (!spare) {
        const cap = P(parent, `כיסוי נאב ${name}`, `${en} hub cap`, 'פלדה מכוסה כרום', 'כיסוי כרום שנלחץ על הדיסק ומסתיר את הברגים. במרכזו סמל ה־VW.');
        mesh(capGeo, CHROME, { parent: cap });
        mesh(new THREE.CircleGeometry(0.036, 32), M.decal(vwLogo, { roughness: 0.3, metalness: 0.3 }), { parent: cap, pos: [0, 0, 0.0843], cast: false });
      }
    };
    const BRASS_V = M.brass();
    for (const w of wheelSpots) {
      const sH = sideHe(w.s), sE = sideEn(w.s), tag = w.front ? 'קדמי' : 'אחורי', tagE = w.front ? 'front' : 'rear';
      const hw = w.front ? HWF : HWR;
      let holder = wheelsSys, kp = null;
      if (w.front) { kp = new THREE.Group(); kp.position.set(AXF, 0, w.s * (hw - 0.03)); wheelsSys.add(kp); steerGroups.push(kp); holder = kp; }
      const wp = P(holder, `גלגל ${tag} ${sH}`, `${tagE[0].toUpperCase() + tagE.slice(1)} ${sE} wheel`, 'פלדה + גומי', 'גלגל שלם: צמיג, חישוק פלדה, ברגים וכיסוי נאב. כל ארבעת הגלגלים זהים וניתנים להחלפה, כולל הגלגל שבתא המטען.');
      if (w.front) wp.position.set(0, TR, w.s * 0.03); else wp.position.set(w.x, TR, w.s * hw);
      if (w.s < 0) wp.rotation.y = PI;
      const spin = new THREE.Group(); wp.add(spin); spinners.push({ o: spin, s: w.s });
      buildWheel(spin, `${tag} ${sH}`, `${tagE} ${sE}`);
      rigWheels.push({ steer: kp, spin, s: w.s, front: w.front, r: TR });
      // brake drum rides on the wheel but belongs to the brake system
      const bd = P(spin, `תוף בלם ${tag} ${sH}`, `${tagE} ${sE} brake drum`, 'ברזל יצוק + סנפירי קירור', 'תוף בלם מברזל יצוק בקוטר 230 מ״מ עם סנפירי קירור היקפיים. הלבנים נלחצות לדופן הפנימית שלו ומאטות את הגלגל.');
      bd.userData.sysOverride = 'brakes';
      mesh(G.lathe([[0.0, -0.042], [0.1, -0.042], [0.116, -0.04], [0.118, -0.03], [0.118, -0.0], [0.12, -0.0], [0.12, -0.05], [0.115, -0.056], [0.11, -0.056], [0.0, -0.05]], 40, 'z'), CAST, { parent: bd });
      for (let k = 0; k < 7; k++) put(G.cyl(0.124 - k * 0.0, 0.124, 0.0035, 40, 'z'), CAST, bd, [0, 0, -0.045 + k * 0.0 - 0.0025 * k]);
      mesh(G.cyl(0.02, 0.02, 0.07, 14, 'z'), CAST, { parent: bd, pos: [0, 0, -0.07] });
      // static brake parts: backing plate, shoes, wheel cylinder, spring
      const bk = P(brakesSys, `לוחית בלם ולבני בלימה ${tag} ${sH}`, `${tagE} ${sE} brake shoes & backing plate`, 'פלדה + בטנת ספיגה', 'הלוחית הנייחת נושאת שתי לבני בלימה עם בטנה, צילינדר הידראולי אחד וקפיצי החזרה.');
      const bkx = w.front ? AXF : AXR, bkz = w.s * (hw - 0.05);
      bk.position.set(bkx, TR, bkz);
      mesh(G.cyl(0.118, 0.118, 0.004, 40, 'z'), M.darkSteel(), { parent: bk, pos: [0, 0, 0] });
      for (const sg of [1, -1]) mesh(G.torus(0.098, 0.01, 6, 18, PI * 0.78, 'z'), M.metal(0x8a6a3a, 0.8), { parent: bk, pos: [0, 0, w.s * 0.01], rot: [0, 0, sg > 0 ? -PI * 0.39 + PI / 2 : PI * 0.39 + PI * 1.5 - PI / 2 * 2] });
      mesh(G.cyl(0.011, 0.011, 0.07, 12, 'x'), M.metal(0xa4a7ac, 0.4), { parent: bk, pos: [0, 0.092, w.s * 0.012] });
      for (const dx of [-0.05, 0.05]) rod(bk, [dx, 0.07, w.s * 0.012], [dx * 0.7, -0.045, w.s * 0.012], 0.0022, DSTEEL);
      bolts(bk, Array.from({ length: 4 }, (_, k) => ({ pos: [Math.cos(k * PI / 2 + 0.7) * 0.056, Math.sin(k * PI / 2 + 0.7) * 0.056, w.s * 0.004], rot: [w.s * PI / 2, 0, 0] })), 0.005);
      bk.userData.sysOverride = 'brakes'; if (w.front) { bk.position.set(0, TR, w.s * -0.02); kp.add(bk); } 
    }
    // spare wheel (leans in the front compartment)
    const spareP = P(wheelsSys, 'גלגל חילוף', 'Spare wheel', 'פלדה + גומי', 'גלגל חילוף שוכב בתא המטען הקדמי. הוא משמש גם כמקור האוויר הדחוס של מתזי השמשה.');
    { const sg = new THREE.Group(); sg.position.set(1.57, 0.63, 0); sg.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(Math.sin(0.35), Math.cos(0.35), 0)); spareP.add(sg); buildWheel(sg, 'חילוף', 'spare', true); }
    // driving and steering animation
    let speed = 0;
    K.toggle('drive', { he: 'גלגלים מסתובבים', key: 'g', seconds: 1.2 }, (t) => { speed = t * 6; });
    K.onFrame((time, dt) => { if (speed > 0.01) for (const sp of spinners) sp.o.rotation.z -= (sp.s * speed * dt) / TR; });
    // ================================================================== SUSPENSION & STEERING
    const TUBEM = M.metal(0x2c2e32, 0.5);
    const FB = 1.45;                                      // front axle beam (x)
    let steerWheel = null, steerRods = null;
    {
      const bm = P(suspSys, 'קורת ציר קדמי (שתי צינורות)', 'Front axle beam (two tubes)', 'פלדה צינורית', 'שני צינורות פלדה מקבילים (עליון ותחתון) שמרותכים לקורה אחת. בכל אחד מוטות פיתול. הקורה נושאת את זרועות המתלה הקדמי.');
      for (const [y, nm] of [[0.40, 'upper'], [0.25, 'lower']]) {
        mesh(G.cyl(0.031, 0.031, 1.0, 24, 'z', true), dbl(TUBEM), { parent: bm, pos: [FB, y, 0] });
        for (const s of [1, -1]) mesh(G.cyl(0.036, 0.036, 0.012, 24, 'z'), TUBEM, { parent: bm, pos: [FB, y, s * 0.505] });
      }
      put(G.box(0.15, 0.2, 0.09, 0.012), CAST, bm, [FB, 0.325, 0]);
      // torsion-bar leaf packs (four leaves in each tube, visible at the tube ends)
      const tb = P(suspSys, 'מוטות פיתול קדמיים (2×4 עלים)', 'Front torsion-bar leaves (2×4)', 'פלדת קפיצים מוקשית', 'ארבעה עלי פלדה שטוחים בכל צינור מתפתלים כשהגלגל עולה על מכשול ומחזירים אותו למקומו. פתרון קומפקטי בלי קפיצי סליל.');
      for (const y of [0.40, 0.25]) for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(0.03, 0.0065, 0.98), M.metal(0x33353a, 0.45), tb, [FB, y - 0.0105 + k * 0.007, 0]);
      for (const s of [1, -1]) {
        const sd = sideHe(s), se = sideEn(s);
        // trailing arms
        const ar = P(suspSys, `זרועות גרר קדמיות ${sd} (2)`, `${se} front trailing arms (×2)`, 'פלדה לחוצה', 'שתי זרועות שמחברות את קורת הציר לציפורן ההיגוי. בקצה כל זרוע פין ציר עם בושינג.');
        for (const [yb, yl] of [[0.40, 0.42], [0.25, 0.22]]) { rod(ar, [FB, yb, s * 0.43], [AXF + 0.01, yl, s * 0.585], 0.0185, TUBEM); put(G.cyl(0.024, 0.024, 0.04, 14, 'z'), IRON, ar, [FB, yb, s * 0.43]); }
        // stabiliser (anti-roll) bar link and arm
        // front shock absorber
        const sh = P(suspSys, `בולם זעזועים קדמי ${sd}`, `${se} front shock absorber`, 'פלדה + שמן', 'בולם זעזועים טלסקופי הידראולי: סופג את התנודות של הגלגל והקפיץ וגורם לצמיג לדבוק בכביש.');
        const a = V3(AXF + 0.12, 0.23, s * 0.52), b = V3(1.33, 0.64, s * 0.40), d = b.clone().sub(a);
        const lower = mesh(G.cyl(0.0225, 0.0225, d.length() * 0.55, 18, 'y'), M.metal(0x1e3f7a, 0.45), { parent: sh }); lower.position.copy(a).addScaledVector(d, 0.275); lower.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
        const upr = mesh(G.cyl(0.0095, 0.0095, d.length() * 0.55, 10, 'y'), CHROME, { parent: sh }); upr.position.copy(a).addScaledVector(d, 0.725); upr.quaternion.copy(lower.quaternion);
        for (const p of [a, b]) mesh(G.torus(0.017, 0.0065, 6, 14, PI * 2, 'z'), IRON, { parent: sh, pos: p.toArray() });
        // bump stop
        put(G.cyl(0.03, 0.03, 0.05, 14, 'y'), M.rubber(), sh, [FB - 0.1, 0.46, s * 0.30]);
      }
      // anti-roll bar
      const arb = P(suspSys, 'מייצב צד (בר אנטי־רול)', 'Anti-roll bar', 'פלדת קפיצים', 'מוט פלדה מעוצב כ־U שמחובר לשתי זרועות הגרר ומקטין את נטיית הגוף לצד בפניות.');
      rod(arb, [FB - 0.0, 0.2, -0.43], [FB + 0.0, 0.2, 0.43], 0.0085, DSTEEL); for (const s of [1, -1]) rod(arb, [FB, 0.2, s * 0.43], [AXF + 0.05, 0.22, s * 0.56], 0.0085, DSTEEL);
      // steering: box, drop arm, track rods
      const sb = P(suspSys, 'תיבת היגוי (תולעת ורולר)', 'Steering box (worm & roller)', 'ברזל יצוק + פלדה מוקשית', 'תיבת היגוי מסוג תולעת ורולר: תולעת על ציר ההגה מסובבת רולר שמזיז את זרוע הפיטמן. אין תגבור — החזית קלה מספיק.');
      put(G.cyl(0.05, 0.05, 0.12, 20, 'y'), CAST, sb, [FB - 0.09, 0.38, -0.14]);
      put(G.cyl(0.04, 0.04, 0.08, 18, 'x'), CAST, sb, [FB - 0.14, 0.43, -0.14]);
      bolts(sb, Array.from({ length: 6 }, (_, k) => ({ pos: [FB - 0.09 + Math.cos(k * 1.047) * 0.036, 0.445, -0.14 + Math.sin(k * 1.047) * 0.036] })), 0.0045);
      const pit = P(suspSys, 'זרוע פיטמן ומוטות היגוי', 'Pitman arm & track rods', 'פלדה מחושלת', 'זרוע קצרה שמזיזה את מוטות ההיגוי; מוט לכל גלגל מחובר לזרוע ההיגוי שבציפורן.');
      const pitArm = rod(pit, [FB - 0.09, 0.35, -0.14], [FB - 0.12, 0.31, -0.19], 0.0125, IRON);
      const trL = rod(pit, [FB - 0.12, 0.31, -0.19], [AXF - 0.1, 0.29, -0.58], 0.0105, TUBEM), trR = rod(pit, [FB - 0.12, 0.31, -0.19], [AXF - 0.1, 0.29, 0.58], 0.0105, TUBEM);
      steerRods = { L: trL, R: trR };
      // steering knuckles + king pins (turn with the wheels)
      for (const s of [1, -1]) { const kp = steerGroups[s > 0 ? 0 : 1]; const sd = sideHe(s), se = sideEn(s);
        const kn = P(suspSys, `ציפורן היגוי ופין ציר ${sd}`, `${se} steering knuckle & link pin`, 'פלדה מחושלת', 'ציפורן ההיגוי נושא את ציר הגלגל, את לוחית הבלם ואת זרוע ההיגוי. הוא מסתובב על פין אנכי בין זרועות הגרר.');
        kn.position.set(0, 0, 0); kp.add(kn);
        put(G.cyl(0.017, 0.017, 0.26, 14, 'y'), STEEL, kn, [0, 0.31, -0.04 * s]);
        put(G.cyl(0.026, 0.026, 0.06, 14, 'z'), CAST, kn, [0, TR, s * 0.0]);
        put(G.box(0.05, 0.12, 0.05, 0.01), CAST, kn, [0, 0.32, -0.025 * s]);
        put(G.cyl(0.014, 0.014, 0.1, 12, 'z'), STEEL, kn, [0, TR, s * 0.07]);
        rod(kn, [0, 0.28, -0.03 * s], [-0.1, 0.29, -s * 0.045], 0.011, IRON);
      }
    }
    // rear: swing axles, spring plates, transverse torsion bar, shock absorbers
    {
      const sa = P(suspSys, 'צירי נדנד אחוריים (2)', 'Rear swing axles (×2)', 'פלדה צינורית + ברזל יצוק', 'צינור חיצוני נושא את חצי הציר ומסתובב סביב מפרק ליד הדיפרנציאל. כשהגוף נוטה בפנייה, הגלגל האחורי נוטה איתו — מקור תכונת ה־oversteer המוכרת של החיפושית.');
      for (const s of [1, -1]) { mesh(G.cyl(0.036, 0.04, 0.5, 20, 'z'), TUBEM, { parent: sa, pos: [AXR, TR + 0.02, s * 0.32] }); put(G.cyl(0.058, 0.058, 0.05, 20, 'z'), CAST, sa, [AXR, TR + 0.02, s * 0.05]); put(G.cyl(0.06, 0.06, 0.03, 20, 'z'), CAST, sa, [AXR, TR, s * 0.595]); }
      const sp = P(suspSys, 'לוחיות קפיץ אחוריות (2)', 'Rear spring plates (×2)', 'פלדה מגולגלת', 'לוחית גרר שמחברת כל ציר נדנד לצינור מוט הפיתול הרוחבי, ונושאת את בלם התוף.');
      for (const s of [1, -1]) { rod(sp, [AXR + 0.24, 0.33, s * 0.5], [AXR + 0.02, 0.32, s * 0.5], 0.026, IRON); put(G.box(0.1, 0.05, 0.1, 0.012), CAST, sp, [AXR + 0.03, 0.32, s * 0.5]); }
      const tt = P(suspSys, 'מוט פיתול אחורי רוחבי', 'Rear transverse torsion bar', 'פלדה מקבילה בצינור', 'מוט קפיצים רוחבי אחד שמטפל בשני הגלגלים האחוריים.');
      mesh(G.cyl(0.026, 0.026, 1.0, 20, 'z'), TUBEM, { parent: tt, pos: [AXR + 0.24, 0.33, 0] });
      for (const s of [1, -1]) { mesh(G.cyl(0.034, 0.034, 0.02, 18, 'z'), TUBEM, { parent: tt, pos: [AXR + 0.24, 0.33, s * 0.51] }); }
      for (const s of [1, -1]) {
        const sd = sideHe(s), se = sideEn(s);
        const sh = P(suspSys, `בולם זעזועים אחורי ${sd}`, `${se} rear shock absorber`, 'פלדה + שמן', 'בולם טלסקופי שעומד כמעט אנכית מאחורי הגלגל האחורי.');
        const a = V3(AXR - 0.1, 0.24, s * 0.53), b = V3(AXR - 0.08, 0.70, s * 0.5), d = b.clone().sub(a);
        const lo = mesh(G.cyl(0.0235, 0.0235, d.length() * 0.55, 18, 'y'), M.metal(0x1e3f7a, 0.45), { parent: sh }); lo.position.copy(a).addScaledVector(d, 0.275); lo.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
        const up = mesh(G.cyl(0.0095, 0.0095, d.length() * 0.55, 10, 'y'), CHROME, { parent: sh }); up.position.copy(a).addScaledVector(d, 0.725); up.quaternion.copy(lo.quaternion);
        for (const p of [a, b]) mesh(G.torus(0.017, 0.0065, 6, 14, PI * 2, 'z'), IRON, { parent: sh, pos: p.toArray() });
      }
    }
    // steering column, toggled together with the front wheels
    const STW = V3(0.52, 0.83, -0.35), STB = V3(1.36, 0.43, -0.14);       // steering-wheel hub and the box input shaft
    const colDir = STW.clone().sub(STB).normalize();
    {
      const sc = P(suspSys, 'עמוד היגוי ומפרק גמיש', 'Steering column & flexible coupling', 'צינור פלדה + רפידת גומי', 'עמוד פלדה שעובר דרך קיר האש ומתחבר לתיבת ההיגוי במפרק גמיש מגומי. עמוד קשיח לגמרי, כפי שתוכננו מכוניות בראשית שנות ה־60.');
      rod(sc, STB, STW, 0.0125, DSTEEL); put(G.cyl(0.03, 0.03, 0.06, 16, 'y'), M.rubber(), sc, [STB.x, STB.y, STB.z]);
      const fw = P(chassisSys, 'קיר אש קדמי (מחיצת תא)', 'Front bulkhead (firewall)', 'פלדה בעובי 1 מ״מ', 'מחיצה בין תא המטען הקדמי לתא הנוסעים, עם פתחים לעמוד ההיגוי, לכבלים ולצינורות הבלם.');
      put(G.box(0.01, 0.62, 1.24, 0.004), M.paintFlat(0x1c1d20, 0.6), fw, [0.84, 0.6, 0]);
    }
    K.toggle('steer', { he: 'היגוי', key: 's', seconds: 1.2 }, (t) => {
      const th = 0.45 * Math.sin(t * PI / 2);
      for (const g of steerGroups) g.rotation.y = th;
      if (steerWheel) steerWheel.rotation.z = -th * 4;
      if (steerRods) {
        const a = V3(FB - 0.12, 0.31, -0.19 + 0.1 * Math.sin(th));                       // pitman joint slides sideways
        const end = (s) => { const lx = -0.1, lz = -0.045 * s; return V3(AXF + lx * Math.cos(th) + lz * Math.sin(th), 0.29, s * 0.625 - lx * Math.sin(th) + lz * Math.cos(th)); };
        const set = (m, p, q) => { if (!m.userData.len) m.userData.len = m.geometry.parameters.height; const d = q.clone().sub(p); m.scale.y = d.length() / m.userData.len; m.position.copy(p).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); };
        set(steerRods.L, a, end(-1)); set(steerRods.R, a, end(1));
      }
    });
    // ================================================================== CHASSIS (platform: backbone tunnel + floor pan)
    {
      const bb = P(chassisSys, 'צינור מרכזי (גב השלדה)', 'Backbone tube', 'פלדה צינורית 0.2 מ״מ + רתכים', 'צינור מרכזי מחבר את ראש השלדה הקדמי למזלג האחורי. שלדת הפלטפורמה שימשה גם את הקרמן גיא ואת הקבריולה.');
      mesh(G.cyl(0.055, 0.055, 2.3, 24, 'x'), CAST, { parent: bb, pos: [0.3, 0.27, 0] });
      for (let k = 0; k < 6; k++) put(G.cyl(0.058, 0.058, 0.01, 24, 'x'), M.metal(0x303236, 0.5), bb, [-0.62 + k * 0.42, 0.27, 0]);
      const tun = P(chassisSys, 'מנהרה מרכזית (תא)', 'Central tunnel', 'פלדה מגולגלת', 'המכסה מעל צינור הגב: בתוכו עוברים כבלי המצמד והבלם, חוט הגז ומוט ההילוכים.');
      mesh(G.soft(1.8, 0.12, 0.27, { r: 0.04, seg: 5 }), M.paintFlat(0x2a2b2e, 0.7), { parent: tun, pos: [-0.05, 0.345, 0] });
      const fl = P(chassisSys, 'רצפה (שני חצאי פח)', 'Floor pan halves', 'פלדה לחוצה בעובי 1 מ״מ + ריבועי חיזוק', 'שני חצאי פח עם גלי חיזוק, כל אחד מוברג לצד אחד של הצינור המרכזי. כל הגוף מוברג לפלטפורמה.');
      for (const s of [1, -1]) { put(G.box(1.68, 0.006, 0.54, 0.002), M.paintFlat(0x3a3d42, 0.65), fl, [-0.1, 0.275, s * 0.4]); for (let k = 0; k < 7; k++) put(new THREE.BoxGeometry(0.02, 0.008, 0.5), M.paintFlat(0x1b1c20, 0.7), fl, [-0.8 + k * 0.22, 0.28, s * 0.4], null, { cast: false }); }
      const hc = P(chassisSys, 'תעלות חימום (2)', 'Heater channels (×2)', 'פלדה לחוצה', 'תעלות לאורך הספים שמובילות אוויר חם מהמחליפים בעורף אל תא הנוסעים. גם מחזקות את הרצפה.');
      for (const s of [1, -1]) { mesh(G.cyl(0.045, 0.045, 1.6, 18, 'x'), M.metal(0x33353a, 0.55), { parent: hc, pos: [-0.1, 0.31, s * 0.6] }); }
      const fh = P(chassisSys, 'ראש שלדה קדמי', 'Frame head', 'פלדה מרותכת', 'הקצה הקדמי של צינור הגב: גוש פלדה שנושא את קורת הציר ואת תיבת ההיגוי.');
      put(G.box(0.3, 0.1, 0.34, 0.012), M.paintFlat(0x2a2b2e, 0.6), fh, [1.15, 0.3, 0]);
      const rf = P(chassisSys, 'מזלג אחורי (ל־תמסורת)', 'Rear frame fork', 'פלדה מרותכת', 'מזלג שנושא את התיבה והמנוע על שתי תמיכות גומי שמרככות רעידות.');
      for (const s of [1, -1]) rod(rf, [-0.95, 0.3, 0], [-1.25, 0.34, s * 0.16], 0.03, TUBEM);
      put(G.box(0.1, 0.07, 0.4, 0.01), M.paintFlat(0x2a2b2e, 0.6), rf, [-1.0, 0.3, 0]);
      const jk = P(chassisSys, 'נקודות הרמה (4)', 'Jacking points (×4)', 'פלדה מרותכת', 'ארבעה צינורות קטנים מרותכים לשולי הרצפה, שמכניסים אליהם את המגבה.');
      for (const x of [0.5, -0.5]) for (const s of [1, -1]) put(G.cyl(0.012, 0.012, 0.045, 12, 'y'), STEEL, jk, [x, 0.265, s * 0.69]);
      const rb = P(body, 'לוחות דריכה (2)', 'Running boards (×2)', 'פלדה + רצועות גומי', 'מדרגה מפח בין הכנפיים, מכוסה גומי מחורץ נגד החלקה, עם פס אלומיניום בקצה. ב־1963 הלוחות עדיין סטנדרטיים בכל חיפושית.');
      for (const s of [1, -1]) {
        put(G.box(1.94, 0.012, 0.15, 0.003), M.paintFlat(0x15161a, 0.7), rb, [0.1, 0.236, s * 0.69]);
        instances(new THREE.BoxGeometry(1.84, 0.004, 0.0075), M.black(), Array.from({ length: 9 }, (_, i) => ({ pos: [0.1, 0.244, s * (0.63 + i * 0.0145)] })), { parent: rb, cast: false });
        put(G.box(1.96, 0.016, 0.014, 0.004), M.aluminum(), rb, [0.1, 0.23, s * 0.765]);
        for (const x of [-0.7, 0.0, 0.7]) rod(rb, [x, 0.226, s * 0.62], [x, 0.265, s * 0.55], 0.007, IRON);
      }
    }
    // ================================================================== FRONT LUGGAGE COMPARTMENT (tank, trunk floor, washer, hinges)
    const fuelSys = sys('fuel'), elecSys = sys('electrics'), engSys = sys('engine'), dtSys = sys('drivetrain');
    {
      const tf = P(body, 'רצפת תא המטען', 'Luggage compartment floor', 'פלדה לחוצה + שכבת ציפוי', 'רצפה קדמית מפח לחוץ עם שקע לגלגל החילוף. מתחתיה עוברים קורת הציר הקדמית והצינור המרכזי.');
      put(G.box(1.02, 0.012, 1.06, 0.004), M.paintFlat(0x1b1c1f, 0.7), tf, [1.4, 0.44, 0]);
      put(G.box(0.62, 0.02, 0.62, 0.01), M.paintFlat(0x232428, 0.7), tf, [1.52, 0.452, 0]);
      const fa = P(body, 'סינר קדמי פנימי', 'Front inner apron', 'פלדה לחוצה', 'לוח הפח הפנימי בחזית שמחזק את המרכב, מחזיק את מנעול המכסה ואת הפגוש ומגן על תא המטען מקדימה.');
      put(G.box(0.012, 0.28, 0.7, 0.004), M.paintFlat(0x1b1c1f, 0.7), fa, [1.84, 0.57, 0]);
      const tk = P(fuelSys, 'מיכל דלק (40 ליטר)', 'Fuel tank (40 L)', 'פח מצופה אבץ', 'מיכל של 40 ליטר בתא המטען הקדמי. אין מד דלק: ידית רזרבה בתא פותחת צינור משני עם הליטרים האחרונים.');
      mesh(G.soft(0.36, 0.17, 0.66, { r: 0.04, seg: 6, deform: (p, n) => { p.y += 0.012 * (1 - n.x * n.x) * n.y; } }), M.metal(0x5b5e63, 0.5), { parent: tk, pos: [1.07, 0.54, 0] });
      for (const x of [0.97, 1.17]) put(G.box(0.025, 0.014, 0.66, 0.003), M.metal(0x2a2c30, 0.55), tk, [x, 0.628, 0]);
      const fl = P(fuelSys, 'צוואר מילוי ופקק', 'Filler neck & cap', 'פלדה + גומי + פח', 'צוואר מילוי עם פקק, שפותחים אליו כשפותחים את מכסה תא המטען.');
      mesh(G.tube([V3(1.12, 0.6, 0.27), V3(1.08, 0.7, 0.31), V3(1.0, 0.76, 0.4)], 0.028, 14, 12), M.rubber(), { parent: fl });
      mesh(G.cyl(0.045, 0.045, 0.03, 20, 'y'), CHROME, { parent: fl, pos: [1.0, 0.775, 0.4] }); put(G.cyl(0.032, 0.032, 0.016, 18, 'y'), M.black(), fl, [1.0, 0.79, 0.4]);
      const flt = P(fuelSys, 'צינור דלק לקרבורטור', 'Fuel line to the carburettor', 'צינור נחושת + צינור גומי', 'צינור דק שעובר דרך המנהרה אל משאבת הדלק שליד המנוע, עם קטעי גומי בקצוות.');
      mesh(G.tube([V3(1.08, 0.46, 0.0), V3(0.86, 0.34, -0.02), V3(0.0, 0.31, -0.03), V3(-1.0, 0.33, -0.03), V3(-1.38, 0.5, -0.1)], 0.0042, 90, 6), M.copper(), { parent: flt });
      const wb = P(glassSys, 'בקבוק מי שמשה ולחץ מהגלגל', 'Washer bottle (pressurised from the spare)', 'פלסטיק + גומי', 'צינור אוויר מהגלגל החילוף דוחף את מי הניקוי אל החרירים — בלי משאבה חשמלית. פשוט ומשעשע, עד שהצמיג מתרוקן.');
      mesh(G.cyl(0.055, 0.055, 0.17, 20, 'y'), M.glass(0x9ec1d1, 0.35), { parent: wb, pos: [1.05, 0.54, -0.32] }); put(G.cyl(0.02, 0.02, 0.02, 12, 'y'), M.black(), wb, [1.05, 0.64, -0.32]);
      mesh(G.tube([V3(1.05, 0.6, -0.31), V3(1.2, 0.62, -0.2), V3(1.4, 0.6, -0.05), V3(1.57, 0.66, 0.02)], 0.004, 24, 6), M.rubber(), { parent: wb });
      for (const s of [1, -1]) {
        const hg = P(doorsSys, `ציר מכסה מטען ${sideHe(s)}`, `Hood hinge ${sideEn(s)}`, 'פלדה מחושלת', 'ציר פלדה בקצה האחורי של מכסה המטען, עם קפיץ פיתול שמסייע בהרמה.');
        put(G.box(0.07, 0.012, 0.05, 0.003), IRON, hg, [0.77, 0.985, s * 0.34]); rod(hg, [0.77, 0.985, s * 0.34], [0.74, 0.99, s * 0.34], 0.0075, STEEL);
      }
      const hl = P(doorsSys, 'מנעול מכסה מטען', 'Hood latch', 'פלדה מצופה', 'תפס קפיצי בקצה הקדמי של המכסה, משוחרר בידית מהתא. מחזיק את המכסה סגור בנסיעה.');
      put(G.box(0.05, 0.02, 0.07, 0.004), IRON, hl, [1.9, 0.74, 0]);
    }
    // ================================================================== ENGINE (air-cooled flat four, 1,192 cc: bore 77 mm, stroke 64 mm)
    const CYY = 0.5, CRK = 0.032, ROD = 0.13, MOT = { piston: [], rod: [], crank: null, cam: null, fan: null, fly: null, pulley: null };
    const CYL = [{ x: -1.5, s: 1, ph: 0 }, { x: -1.54, s: -1, ph: PI }, { x: -1.66, s: 1, ph: PI }, { x: -1.7, s: -1, ph: 0 }];
    const finGeo = G.merge(Array.from({ length: 9 }, (_, k) => G.cyl(0.066 - (k % 2) * 0.004, 0.066 - (k % 2) * 0.004, 0.0028, 28, 'z').translate(0, 0, 0.0075 + k * 0.0145)));
    const headFinGeo = G.merge([...Array.from({ length: 9 }, (_, k) => new THREE.BoxGeometry(0.14, 0.11, 0.0035).translate(0, 0, 0.004 + k * 0.012)), new THREE.BoxGeometry(0.1, 0.075, 0.115).translate(0, 0, 0.055)]);
    const gearGeo = (r, n, w) => G.merge([G.cyl(r, r, w, 28, 'x'), ...Array.from({ length: n }, (_, k) => { const a = (k / n) * PI * 2; return G.at(new THREE.BoxGeometry(w, 0.007, 0.007), [0, Math.cos(a) * (r + 0.002), Math.sin(a) * (r + 0.002)], [a, 0, 0]); })]);
    {
      const cc = P(engSys, 'גוף המנוע (שני חצאי פח מגנזיום)', 'Crankcase (two magnesium halves)', 'מגנזיום יצוק', 'שני חצאי בית מיצוק מגנזיום שמחזיקים את גל הארכובה וגל הזיזים. מחוברים בשורת ברגים — החומר קל יותר מאלומיניום.');
      for (const s of [1, -1]) mesh(G.soft(0.36, 0.26, 0.125, { r: 0.04, seg: 5 }), M.metal(0xa4a8ac, 0.5), { parent: cc, pos: [-1.6, CYY + 0.02, s * 0.0625] });
      bolts(cc, Array.from({ length: 8 }, (_, k) => ({ pos: [-1.46 - (k % 4) * 0.08, CYY + (k < 4 ? 0.14 : -0.1), 0.0], rot: [0, 0, 0] })), 0.005, STEEL);
      const sm = P(engSys, 'תחתית השמן (פח)', 'Oil sump plate', 'פלדה מגולוונת + מסנן רשת', 'לוחית עגולה מוחזקת בשישה אומי כיפה, עם מסנן רשת קטן לשמן. אין מסנן שמן אמיתי — הרשת בלבד.');
      mesh(G.cyl(0.065, 0.065, 0.012, 24, 'y'), M.darkSteel(), { parent: sm, pos: [-1.6, 0.375, 0] });
      for (let k = 0; k < 6; k++) put(G.cyl(0.006, 0.006, 0.01, 8, 'y'), STEEL, sm, [-1.6 + Math.cos(k * 1.047) * 0.052, 0.368, Math.sin(k * 1.047) * 0.052]);
      for (const c of CYL) {
        const s = c.s, sd = sideHe(s), idx = CYL.indexOf(c) + 1;
        const ba = P(engSys, `צילינדר ${idx} (${sd}) עם סנפירים`, `Cylinder ${idx} (${sideEn(s)}) with fins`, 'ברזל יצוק', 'צילינדר מברזל יצוק עם סנפירי קירור מעגליים. האוויר מהמאוורר זורם בין הסנפירים ולוקח חום.');
        const g = new THREE.Group(); g.position.set(c.x, CYY, s * 0.125); if (s < 0) g.rotation.y = PI; ba.add(g);
        mesh(finGeo, M.castIron(), { parent: g }); mesh(G.cyl(0.046, 0.046, 0.15, 20, 'z'), CAST, { parent: g, pos: [0, 0, 0.065] });
        const hd = P(engSys, `ראש צילינדר ${idx} (אלומיניום)`, `Cylinder head ${idx}`, 'סגסוגת אלומיניום', 'ראש אלומיניום יצוק עם סנפירים. בכל ראש שני שסתומים ומצת אחד.');
        const hg = new THREE.Group(); hg.position.set(c.x, CYY, s * 0.263); if (s < 0) hg.rotation.y = PI; hd.add(hg);
        mesh(headFinGeo, ALU, { parent: hg });
        const rc = P(engSys, `כיסוי שסתומים ${idx}`, `Rocker cover ${idx}`, 'פח לחוץ + קפיץ חוטי', 'כיסוי פח שמוחזק בקפיץ חוטי יחיד. מתחתיו קשתות השסתומים.');
        const rg = new THREE.Group(); rg.position.set(c.x, CYY, s * 0.40); rc.add(rg);
        mesh(G.box(0.14, 0.095, 0.018, 0.012, 3), M.metal(0xc5c8cc, 0.4), { parent: rg }); rod(rg, [-0.065, -0.05, s * 0.011], [0.065, -0.05, s * 0.011], 0.0022, STEEL);
        // piston and connecting rod (animated)
        const pg = P(engSys, `בוכנה ומוט הנעה ${idx}`, `Piston & connecting rod ${idx}`, 'אלומיניום יצוק + פלדה מחושלת', 'בוכנה בקוטר 77 מ״מ ומוט הנעה: ממירים את הלחץ בצילינדר לתנועה סיבובית של גל הארכובה. המהלך 64 מ״מ.');
        const piston = mesh(G.cyl(0.0385, 0.0385, 0.052, 20, 'z'), ALU, { parent: pg }); const rodm = mesh(G.box(0.015, 0.015, 1, 0.003, 1), STEEL, { parent: pg });
        MOT.piston.push({ piston, rodm, c, x: c.x });
      }
      for (const c of CYL) {
        const s = c.s; const ptp = P(engSys, `צינורות דחיפה ${CYL.indexOf(c) + 1}`, `Pushrod tubes ${CYL.indexOf(c) + 1}`, 'פלדה מכוסה כרום', 'צינורות דקים מתחת לצילינדר שמכסים את מוטות הדחיפה ושומרים על אטימות.');
        for (const dx of [-0.026, 0.026]) mesh(G.cyl(0.0065, 0.0065, 0.27, 10, 'z'), CHROME, { parent: ptp, pos: [c.x + dx, CYY - 0.054, s * 0.25] });
      }
      // crankshaft with counterweights (rotates), camshaft (half speed), flywheel with ring gear
      const ck = P(engSys, 'גל ארכובה ומשקלים נגדיים', 'Crankshaft & counterweights', 'פלדה מחושלת', 'גל ארכובה מפלדה מחושלת עם משקלים נגדיים, ארבעה מסבים וארבעה פינים של מוטות הנעה.');
      const cg = new THREE.Group(); cg.position.set(0, CYY, 0); ck.add(cg); MOT.crank = cg;
      mesh(G.cyl(0.027, 0.027, 0.52, 18, 'x'), STEEL, { parent: cg, pos: [-1.6, 0, 0] });
      for (const c of CYL) { const pin = mesh(G.cyl(0.0195, 0.0195, 0.04, 14, 'x'), STEEL, { parent: cg }); c.pin = pin; for (const dx of [-0.026, 0.026]) mesh(G.cyl(0.045, 0.045, 0.012, 20, 'x'), M.metal(0x2d2f33, 0.45), { parent: cg, pos: [c.x + dx, 0, 0] }); }
      const cm = P(engSys, 'גל זיזים (8 זיזים)', 'Camshaft (8 lobes)', 'פלדה מחושלת מוקשית', 'גל זיזים בתוך בית הארכובה פותח וסוגר את השסתומים דרך מוטות דחיפה, ומסתובב בחצי מהירות גל הארכובה.');
      const cmg = new THREE.Group(); cmg.position.set(0, CYY - 0.075, 0); cm.add(cmg); MOT.cam = cmg;
      mesh(G.cyl(0.0125, 0.0125, 0.4, 12, 'x'), STEEL, { parent: cmg, pos: [-1.6, 0, 0] });
      instances(G.cyl(0.02, 0.02, 0.012, 14, 'x'), M.metal(0x8b9096, 0.4), CYL.flatMap((c, i) => [{ pos: [c.x - 0.01, 0.0, 0], rot: [i, 0, 0] }, { pos: [c.x + 0.012, 0, 0], rot: [i + 1.3, 0, 0] }]), { parent: cmg });
      const fw = P(engSys, 'גלגל תנופה וטבעת הנעה', 'Flywheel & starter ring gear', 'ברזל יצוק + פלדה', 'דיסק כבד שמחליק את דחפי הבוכנות, ועליו טבעת שיניים שהמתנע תופס.');
      const fg = new THREE.Group(); fg.position.set(-1.37, CYY, 0); fw.add(fg); MOT.fly = fg;
      mesh(G.cyl(0.115, 0.115, 0.03, 40, 'x'), CAST, { parent: fg }); mesh(G.torus(0.118, 0.007, 8, 40, PI * 2, 'x'), M.metal(0x9a9da2, 0.4), { parent: fg, pos: [-0.012, 0, 0] });
      instances(new THREE.BoxGeometry(0.012, 0.012, 0.007), M.metal(0x9a9da2, 0.4), Array.from({ length: 56 }, (_, k) => { const a = (k / 56) * PI * 2; return { pos: [-0.012, Math.cos(a) * 0.125, Math.sin(a) * 0.125], rot: [a, 0, 0] }; }), { parent: fg });
      put(G.cyl(0.03, 0.03, 0.005, 14, 'x'), M.matte(0x7a5a2c), fg, [0.016, 0, 0]);
      // cooling: fan on top of the engine, shroud, generator, belt, oil cooler, thermostat
      const fn = P(engSys, 'מאוורר קירור (11 להבים)', 'Cooling fan (11 blades)', 'פלדה לחוצה', 'מאוורר צירי שמסתובב על ציר הגנרטור ודוחף אוויר על הצילינדרים: זו כל מערכת הקירור — בלי מים.');
      const fng = new THREE.Group(); fng.position.set(-1.78, 0.6, 0); fn.add(fng); MOT.fan = fng;
      mesh(G.cyl(0.04, 0.04, 0.02, 18, 'y'), DSTEEL, { parent: fng });
      for (let k = 0; k < 11; k++) { const a = (k / 11) * PI * 2; const bl = mesh(G.box(0.1, 0.004, 0.035, 0.001, 1), M.metal(0x45484d, 0.5), { parent: fng }); bl.position.set(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075); bl.rotation.y = -a; bl.rotation.x = 0.4; }
      const sr = P(engSys, 'מעטפת מאוורר ופח קירור', 'Fan shroud & cooling tinware', 'פלדה מגולגלת + לכה שחורה', 'מעטפות פח שמכוונות את האוויר מהמאוורר אל סנפירי הצילינדרים.');
      mesh(G.box(0.3, 0.07, 0.62, 0.02), M.paintFlat(0x15161a, 0.5), { parent: sr, pos: [-1.76, 0.51, 0] });
      for (const s of [1, -1]) mesh(G.box(0.26, 0.012, 0.28, 0.006), M.paintFlat(0x15161a, 0.5), { parent: sr, pos: [-1.58, 0.5, s * 0.18] });
      const gn = P(engSys, 'גנרטור 6 וולט (180 וואט)', 'Generator (6 V, 180 W)', 'פלדה + נחושת', 'גנרטור זרם ישר 6 וולט שעומד אנכית מעל המנוע ומונע מרצועת V. הוא טוען את המצבר ומפעיל את הפנסים. המאוורר יושב על אותו ציר.');
      mesh(G.cyl(0.05, 0.05, 0.19, 24, 'y'), M.metal(0x2a2c30, 0.55), { parent: gn, pos: [-1.78, 0.73, 0] }); mesh(G.cyl(0.054, 0.054, 0.012, 24, 'y'), STEEL, { parent: gn, pos: [-1.78, 0.81, 0] });
      mesh(G.cyl(0.038, 0.038, 0.01, 18, 'y'), CHROME, { parent: gn, pos: [-1.78, 0.825, 0] }); instances(G.cyl(0.003, 0.003, 0.2, 6, 'y'), M.metal(0x8a8e94, 0.4), [0, 1, 2, 3].map((k) => ({ pos: [-1.78 + Math.cos(k * 1.57 + 0.78) * 0.052, 0.73, Math.sin(k * 1.57 + 0.78) * 0.052] })), { parent: gn });
      const pl = P(engSys, 'גלגל רצועה וחגורת V', 'Crank pulley & V-belt', 'פלדה + גומי', 'גלגל רצועת V על קצה גל הארכובה מניע את הגנרטור והמאוורר. אם הרצועה נקרעת, המנוע מתחמם במהירות.');
      const plg = new THREE.Group(); plg.position.set(-1.86, CYY, 0); pl.add(plg); MOT.pulley = plg;
      mesh(G.lathe([[0.0, -0.016], [0.052, -0.016], [0.058, -0.006], [0.058, 0.006], [0.052, 0.016], [0.0, 0.016]], 28, 'x'), M.metal(0x9a9da2, 0.4), { parent: plg });
      mesh(G.tube([V3(-1.86, CYY + 0.055, 0), V3(-1.82, 0.53, 0.02), V3(-1.78, 0.55, 0.0), V3(-1.78, 0.55, -0.02), V3(-1.84, 0.47, -0.02)], 0.007, 24, 8), M.rubber(), { parent: pl });
      const oc = P(engSys, 'מצנן שמן', 'Oil cooler', 'אלומיניום + נחושת', 'מצנן שמן קטן במעטפת האוויר: הזרם שעובר מעליו מצנן את השמן.');
      mesh(G.box(0.2, 0.05, 0.1, 0.006), ALU, { parent: oc, pos: [-1.65, 0.47, 0.0] }); instances(new THREE.BoxGeometry(0.2, 0.003, 0.1), M.metal(0x6b6e73, 0.5), Array.from({ length: 8 }, (_, k) => ({ pos: [-1.65, 0.447 + k * 0.0066, 0] })), { parent: oc });
      const th = P(engSys, 'תרמוסטט וחצי הדלתות', 'Cooling thermostat & flaps', 'פלדה + מפוח שעוה', 'בלוק מתכת עם מפוח שעווה שמתרחב לפי הטמפרטורה ופותח או סוגר את תריסי האוויר. כך מנוע קר מתחמם מהר יותר.');
      mesh(G.cyl(0.018, 0.018, 0.1, 14, 'z'), BRASS_V, { parent: th, pos: [-1.58, 0.43, 0.2] });
      // induction: carburettor, air cleaner, manifold, fuel pump
      const cb = P(fuelSys, 'קרבורטור סולקס 28 PICT', 'Solex 28 PICT carburettor', 'אלומיניום יצוק + פליז', 'קרבורטור סולקס 28 PICT עם חנק אוטומטי ומשאבת האצה. מסנן האוויר שמעליו הוא ״אמבט שמן״.');
      mesh(G.cyl(0.04, 0.04, 0.09, 20, 'y'), M.metal(0x6f7378, 0.5), { parent: cb, pos: [-1.5, 0.67, 0] }); put(G.cyl(0.03, 0.03, 0.04, 16, 'y'), BRASS_V, cb, [-1.5, 0.725, 0]); put(G.cyl(0.006, 0.006, 0.07, 8, 'x'), STEEL, cb, [-1.54, 0.65, 0.035]);
      const ac = P(fuelSys, 'מסנן אוויר באמבט שמן', 'Oil-bath air cleaner', 'פלדה צבועה + שמן', 'מסנן אוויר ״אמבט שמן״: האוויר חולף מעל שמן ונקי מאבק לפני הקרבורטור. העיגול הזה מזוהה מיד עם מנוע החיפושית.');
      mesh(G.cyl(0.085, 0.085, 0.07, 28, 'y'), M.metal(0x20242a, 0.5), { parent: ac, pos: [-1.5, 0.76, 0] }); put(G.cyl(0.09, 0.09, 0.012, 28, 'y'), M.metal(0x20242a, 0.5), ac, [-1.5, 0.8, 0]); put(G.cyl(0.02, 0.02, 0.02, 12, 'y'), CHROME, ac, [-1.5, 0.816, 0]);
      mesh(G.tube([V3(-1.5, 0.76, -0.08), V3(-1.56, 0.75, -0.12), V3(-1.62, 0.71, -0.14)], 0.032, 14, 14), M.metal(0x20242a, 0.5), { parent: ac });
      const im = P(fuelSys, 'צינור יניקה מחומם ופריטי הסתעפות', 'Heated intake manifold', 'ברזל יצוק + אלומיניום', 'צינור יניקה יצוק שמחלק את התערובת לארבעת הצילינדרים. המנוע מחמם אותו כדי לאדות את הדלק במזג אוויר קר.');
      mesh(G.cyl(0.03, 0.03, 0.46, 16, 'z'), CAST, { parent: im, pos: [-1.6, 0.6, 0] });
      for (const c of CYL) mesh(G.tube([V3(c.x, 0.6, c.s * 0.18), V3(c.x, 0.6, c.s * 0.29), V3(c.x, 0.57, c.s * 0.34)], 0.017, 12, 8), CAST, { parent: im });
      const fp = P(fuelSys, 'משאבת דלק מכנית', 'Mechanical fuel pump', 'אלומיניום + גומי', 'משאבת דלק מכנית עם דיאפרגמה שמונעת על ידי גל הזיזים. שואבת דלק מהמיכל הקדמי.');
      mesh(G.cyl(0.04, 0.04, 0.05, 18, 'z'), M.metal(0x7a7e84, 0.5), { parent: fp, pos: [-1.44, 0.47, -0.17] }); mesh(G.cyl(0.03, 0.03, 0.03, 16, 'z'), M.metal(0x2a2c30, 0.5), { parent: fp, pos: [-1.44, 0.47, -0.2] });
      // oil filler stack, dipstick
      const of = P(engSys, 'פתח מילוי שמן + מערכת אוורור', 'Oil filler & breather', 'פח + פקק', 'פקק מילוי שמן על צוואר קצר, צמוד למעטפת המאוורר.');
      mesh(G.cyl(0.03, 0.03, 0.04, 18, 'y'), M.metal(0x1d1f23, 0.5), { parent: of, pos: [-1.74, 0.55, 0.18] }); put(G.cyl(0.022, 0.022, 0.012, 18, 'y'), CHROME, of, [-1.74, 0.575, 0.18]);
      const ds = P(engSys, 'מד שמן (דיפסטיק)', 'Dipstick', 'פלדה + גומי', 'מוט עם שני סימנים שמראה את מפלס השמן: מוציאים, מנגבים, מכניסים ובודקים.');
      rod(ds, [-1.74, 0.38, -0.18], [-1.72, 0.6, -0.2], 0.0065, STEEL); put(G.sphere(0.014, 10, 8), M.rubber(), ds, [-1.72, 0.61, -0.2]);
    }
    // ignition: distributor, coil, plugs and leads
    {
      const ds = P(elecSys, 'מפזר ההצתה (דיסטריביוטור)', 'Distributor', 'אלומיניום + בקליט', 'מפזר מכני שמחלק את המתח הגבוה לארבעת המצתים בסדר ההצתה. כולל פלטינות (נקודות מגע) וקבל.');
      mesh(G.cyl(0.032, 0.032, 0.09, 20, 'y'), M.metal(0x9a9da2, 0.45), { parent: ds, pos: [-1.46, 0.6, -0.06] }); mesh(G.lathe([[0.0, 0.0], [0.034, 0.0], [0.034, 0.03], [0.02, 0.04], [0.0, 0.04]], 20, 'y'), M.gloss(0x181818), { parent: ds, pos: [-1.46, 0.648, -0.06] });
      for (let k = 0; k < 4; k++) put(G.cyl(0.0052, 0.0052, 0.03, 8, 'y'), BRASS_V, ds, [-1.46 + Math.cos(k * 1.57) * 0.026, 0.69, -0.06 + Math.sin(k * 1.57) * 0.026]);
      const cl = P(elecSys, 'סליל הצתה', 'Ignition coil', 'פלדה + בקליט', 'סליל הצתה שמעלה את מתח 6 הוולט לאלפי וולטים לצורך הניצוץ במצת.');
      mesh(G.cyl(0.026, 0.026, 0.1, 18, 'y'), M.gloss(0x181818), { parent: cl, pos: [-1.6, 0.69, 0.115] }); put(G.cyl(0.012, 0.012, 0.02, 12, 'y'), BRASS_V, cl, [-1.6, 0.745, 0.115]);
      const sp = P(elecSys, 'מצתים ובתי מצת (4)', 'Spark plugs & caps (×4)', 'חרסינה + פלדה + פליז', 'מצת בכל ראש צילינדר שמצית את התערובת. כובעי בקליט מחברים אליו את הכבל.');
      const wr = P(elecSys, 'כבלי הצתה (4)', 'Ignition leads (×4)', 'נחושת + גומי + ישורי מיגון', 'ארבעה כבלי מתח גבוה, כל אחד באורך אחר. סדר ההצתה: 1־4־3־2.');
      CYL.forEach((c, k) => { const px = c.x, pz = c.s * 0.32, py = 0.595; put(G.cyl(0.011, 0.011, 0.03, 10, 'y'), STEEL, sp, [px, py - 0.015, pz]); put(G.cyl(0.01, 0.01, 0.045, 10, 'y'), M.ceramic(), sp, [px, py + 0.03, pz]); put(G.cyl(0.015, 0.015, 0.02, 10, 'y'), M.gloss(0x181818), sp, [px, py + 0.063, pz]); mesh(G.tube([V3(-1.46 + Math.cos(k * 1.57) * 0.026, 0.69, -0.06 + Math.sin(k * 1.57) * 0.026), V3(-1.5 + k * -0.05, 0.74, c.s * 0.1), V3(px, 0.72, pz * 0.8), V3(px, py + 0.07, pz)], 0.0035, 24, 6), M.gloss(0x181818), { parent: wr }); });
    }
    // ================================================================== TRANSAXLE, CLUTCH AND DRIVE SHAFTS
    {
      const tx = P(dtSys, 'מארז תיבת הילוכים (טרנסאקסל)', 'Transaxle housing', 'מגנזיום / אלומיניום יצוק', 'תיבת ארבעה הילוכים משולבת עם הדיפרנציאל בבית אחד. הציר הראשי פונה קדימה, וצירי ההנעה יוצאים לצדדים.');
      mesh(G.soft(0.34, 0.26, 0.3, { r: 0.05, seg: 5 }), M.metal(0x8f949a, 0.55), { parent: tx, pos: [-1.1, 0.36, 0] });
      mesh(G.lathe([[0.0, 0.0], [0.07, 0.0], [0.095, -0.08], [0.095, -0.14], [0.0, -0.14]], 28, 'x'), M.metal(0x8f949a, 0.55), { parent: tx, pos: [-0.9, 0.38, 0], rot: [0, 0, 0], scale: [-1, 1, 1] });
      for (const s of [1, -1]) { put(G.cyl(0.088, 0.088, 0.016, 28, 'z'), M.metal(0x7a7e84, 0.55), tx, [-1.205, 0.33, s * 0.17]); bolts(tx, Array.from({ length: 6 }, (_, k) => ({ pos: [-1.205 + Math.cos(k * 1.047) * 0.07, 0.33 + Math.sin(k * 1.047) * 0.07, s * 0.18], rot: [s * PI / 2, 0, 0] })), 0.0055); }
      const bh = P(dtSys, 'בית מצמד (בל האוסינג)', 'Clutch bell housing', 'אלומיניום יצוק', 'בית פעמון שמחבר את התיבה למנוע ומכסה את המצמד ואת גלגל התנופה.');
      mesh(G.lathe([[0.12, 0.0], [0.13, 0.02], [0.13, 0.1], [0.09, 0.11], [0.0, 0.11]], 32, 'x'), M.metal(0x8f949a, 0.55), { parent: bh, pos: [-1.27, CYY - 0.0, 0], scale: [-1, 1, 1] });
      const cld = P(dtSys, 'מצמד חיכוך (דיסק + לוחית לחץ)', 'Friction clutch (disc + pressure plate)', 'פלדה + בטנה אורגנית + קפיץ דיאפרגמה', 'דיסק חיכוך עם בטנה אורגנית ולוחית לחץ עם קפיץ דיאפרגמה. דוושת המצמד מושכת כבל מכני.');
      mesh(G.cyl(0.1, 0.1, 0.006, 32, 'x'), M.matte(0x7a5a2c), { parent: cld, pos: [-1.34, CYY, 0] }); mesh(G.cyl(0.115, 0.115, 0.016, 32, 'x'), M.metal(0x3a3d42, 0.5), { parent: cld, pos: [-1.31, CYY, 0] });
      const gr = P(dtSys, 'גלגלי שיניים (4 הילוכים + אחורי)', 'Gear sets (4 forward + reverse)', 'פלדה מוקשית', 'גלגלי שיניים בתיבה: ארבעה הילוכים קדימה ואחורי. בשנתון הזה ההילוך הראשון בלי סינכרון — צריך לעצור כדי להכניס אותו.');
      for (let k = 0; k < 4; k++) { mesh(gearGeo(0.045 + (k % 2) * 0.012, 16, 0.025), M.steel(), { parent: gr, pos: [-1.0 + k * 0.045, 0.4, 0.0] }); mesh(gearGeo(0.04 + ((k + 1) % 2) * 0.012, 14, 0.025), M.steel(), { parent: gr, pos: [-1.0 + k * 0.045, 0.33, 0.0] }); }
      mesh(G.cyl(0.012, 0.012, 0.25, 12, 'x'), STEEL, { parent: gr, pos: [-1.05, 0.4, 0] }); mesh(G.cyl(0.012, 0.012, 0.25, 12, 'x'), STEEL, { parent: gr, pos: [-1.05, 0.33, 0] });
      const df = P(dtSys, 'דיפרנציאל וגלגל כתר', 'Differential & crown wheel', 'פלדה מוקשית', 'בית דיפרנציאל עם שני גלגלי צד, שני לוויינים וגלגל כתר. מאפשר לשני הגלגלים האחוריים להסתובב במהירויות שונות בפנייה.');
      mesh(G.cyl(0.09, 0.09, 0.02, 32, 'z'), M.steel(), { parent: df, pos: [-1.205, 0.33, 0.03] }); mesh(G.sphere(0.055, 18, 14), M.metal(0x5a5d62, 0.5), { parent: df, pos: [-1.205, 0.33, 0] });
      instances(new THREE.BoxGeometry(0.01, 0.012, 0.014), M.steel(), Array.from({ length: 36 }, (_, k) => { const a = (k / 36) * PI * 2; return { pos: [-1.205 + Math.cos(a) * 0.092, 0.33 + Math.sin(a) * 0.092, 0.03], rot: [0, 0, a] }; }), { parent: df });
      const hs = P(dtSys, 'חצאי צירים (2)', 'Half-shafts (×2)', 'פלדה מוקשית', 'צירי הנעה שעוברים בתוך צינורות הציר הנדנדיים. בקצה הפנימי מפרק אוניברסלי, ובקצה החיצוני — אין מפרק.');
      for (const s of [1, -1]) { rod(hs, [-1.205, 0.335, s * 0.1], [-1.205, 0.335, s * 0.6], 0.0175, STEEL); mesh(G.lathe([[0.04, 0.0], [0.05, 0.03], [0.05, 0.06], [0.04, 0.09]], 16, 'z'), M.rubber(), { parent: hs, pos: [-1.205, 0.335, s * 0.12], scale: [1, 1, s] }); }
      const gs = P(dtSys, 'ידית ההילוכים וציר ההעברה', 'Gear lever & selector rod', 'פלדה + פלסטיק', 'ידית קצרה על המנהרה שמחוברת למוט ארוך בתוך הצינור המרכזי עד לתיבה שבעורף.');
      rod(gs, [-0.95, 0.34, 0], [0.12, 0.34, 0], 0.0095, STEEL);
      const stm = P(elecSys, 'מתנע 6 וולט', 'Starter motor (6 V)', 'פלדה + נחושת', 'מתנע 6 וולט שמחובר לבית התיבה ומסובב את גלגל התנופה דרך טבעת שיניים; סלנואיד מעליו מכניס את גלגל המתנע.');
      mesh(G.cyl(0.047, 0.047, 0.2, 20, 'x'), M.metal(0x2a2c30, 0.5), { parent: stm, pos: [-1.32, 0.33, -0.17] }); mesh(G.cyl(0.032, 0.032, 0.09, 16, 'x'), M.metal(0x2a2c30, 0.5), { parent: stm, pos: [-1.37, 0.4, -0.17] });
    }
    // ================================================================== EXHAUST AND HEATING
    {
      const ex = P(fuelSys, 'מחליפי חום וצינורות פליטה (2)', 'Heat exchangers & exhaust manifolds (×2)', 'פלדה גלית + ברזל', 'צינורות פליטה עטופים במעטפת פח: אוויר צח מתחמם סביבם ועולה אל תא הנוסעים. כך מקבלים חימום בלי מים חמים — ולפעמים גם ריח פליטה.');
      for (const s of [1, -1]) { mesh(G.tube([V3(-1.46, 0.44, s * 0.28), V3(-1.62, 0.36, s * 0.34), V3(-1.78, 0.34, s * 0.34), V3(-1.82, 0.32, s * 0.1)], 0.035, 28, 14), M.metal(0x3a3a3c, 0.6), { parent: ex }); mesh(G.tube([V3(-1.46, 0.44, s * 0.28), V3(-1.62, 0.36, s * 0.34), V3(-1.78, 0.34, s * 0.34)], 0.046, 28, 14), M.metal(0x4a4a4e, 0.7), { parent: ex }); }
      const mf = P(fuelSys, 'משתיק קול (ממפלר)', 'Muffler', 'פלדה מגולגלת', 'משתיק קול מפלדה עם מחיצות פנימיות שמקטין את הרעש. אין עדיין קטליזטור.');
      mesh(G.cyl(0.065, 0.065, 0.42, 22, 'z'), M.metal(0x3d3d40, 0.6), { parent: mf, pos: [-1.84, 0.31, 0] });
      const tp = P(trimSys, 'צינור זנב (פליטה)', 'Tailpipe', 'פלדה מכוסה כרום', 'צינור קצר שיוצא מהממפלר דרך חריץ בסינר האחורי, עם קצה מכוסה כרום בצד שמאל.');
      mesh(G.cyl(0.0245, 0.0245, 0.14, 18, 'x'), CHROME, { parent: tp, pos: [-1.95, 0.32, -0.19] }); mesh(G.torus(0.0245, 0.003, 6, 18, PI * 2, 'x'), CHROME, { parent: tp, pos: [-2.02, 0.32, -0.19] });
      mesh(G.tube([V3(-1.84, 0.31, -0.16), V3(-1.9, 0.32, -0.19), V3(-1.95, 0.32, -0.19)], 0.022, 10, 12), M.metal(0x3d3d40, 0.6), { parent: tp });
      const hc = P(fuelSys, 'תעלות חימום ומצלעי אוויר', 'Heater hoses & flaps', 'פח + גומי + כבלים', 'צינורות גמישים שמובילים אוויר חם מהמחליפים אל התעלות לאורך הרצפה, בעזרת שני מנופי חימום ליד הרצפה.');
      for (const s of [1, -1]) mesh(G.tube([V3(-1.5, 0.36, s * 0.34), V3(-1.2, 0.3, s * 0.5), V3(-0.8, 0.31, s * 0.58)], 0.035, 18, 12), M.rubber(), { parent: hc });
    }
    // ================================================================== ELECTRICS (6 V)
    {
      const bt = P(elecSys, 'מצבר 6 וולט (84 אמפר־שעה)', 'Battery (6 V, 84 Ah)', 'עופרת־חומצה + פלסטיק', 'מצבר 6 וולט (כ־84 אמפר־שעה) שמונח מתחת למושב הנוסע הקדמי. הארקה לשלדה.');
      mesh(G.box(0.24, 0.18, 0.18, 0.012), M.gloss(0x14161a), { parent: bt, pos: [0.06, 0.4, 0.34] });
      for (const dx of [-0.07, 0.07]) put(G.cyl(0.013, 0.013, 0.02, 12, 'y'), M.metal(0xb0b4ba, 0.4), bt, [0.06 + dx, 0.5, 0.34]);
      for (let k = 0; k < 3; k++) put(G.cyl(0.011, 0.011, 0.006, 12, 'y'), M.black(), bt, [0.0 + k * 0.06, 0.492, 0.34]);
      const fb = P(elecSys, 'קופסת נתיכים (12 נתיכים)', 'Fuse box (12 fuses)', 'בקליט + פליז', 'קופסת נתיכי זכוכית מתחת ללוח המחוונים בצד הנהג, בנויה מבקליט.');
      mesh(G.box(0.14, 0.05, 0.1, 0.006), M.gloss(0x1a1b1e), { parent: fb, pos: [0.8, 0.72, -0.45] });
      instances(G.cyl(0.0036, 0.0036, 0.025, 8, 'z'), M.glass(0xdddddd, 0.4), Array.from({ length: 12 }, (_, k) => ({ pos: [0.8 + (k % 6 - 2.5) * 0.02, 0.72 + (k < 6 ? 0.012 : -0.012), -0.4] })), { parent: fb });
      const hn = P(elecSys, 'צופר בעל חילזון', 'Snail horn', 'פלדה צבועה + מטלה', 'צופר רטט חשמלי בצורת חילזון, מותקן בתא המטען, עם צליל עגול.');
      mesh(G.lathe([[0.0, 0.0], [0.06, 0.01], [0.075, 0.03], [0.06, 0.06], [0.04, 0.07]], 20, 'y'), M.metal(0x23252a, 0.55), { parent: hn, pos: [1.5, 0.5, -0.45], rot: [0, 0, PI / 2] });
      const wm = P(elecSys, 'מנוע מגבים ומוטות', 'Wiper motor & linkage', 'פלדה + נחושת', 'מנוע קטן מאחורי לוח המחוונים שמניע את שני המגבים דרך מוטות חיבור.');
      mesh(G.cyl(0.032, 0.032, 0.09, 16, 'z'), M.metal(0x2a2c30, 0.5), { parent: wm, pos: [0.76, 0.88, 0.0] }); rod(wm, [0.76, 0.88, 0.0], [0.76, 0.94, -0.3], 0.005, STEEL); rod(wm, [0.76, 0.88, 0.0], [0.76, 0.94, 0.3], 0.005, STEEL);
      const lm = P(elecSys, 'צרור חיווט ראשי', 'Main wiring loom', 'נחושת + בידוד בד', 'צרור חוטים שעובר בתוך המנהרה אל העורף: הצתה, פנסים וגנרטור.');
      mesh(G.tube([V3(0.8, 0.5, -0.12), V3(0.2, 0.37, -0.05), V3(-0.6, 0.37, -0.04), V3(-1.2, 0.45, -0.06), V3(-1.5, 0.6, -0.08)], 0.011, 60, 8), M.black(), { parent: lm });
    }
    // ================================================================== ENGINE ANIMATION
    let engineSpeed = 0, crankAngle = 0;
    const setEngine = () => {
      MOT.crank.rotation.x = crankAngle; MOT.cam.rotation.x = crankAngle / 2; MOT.fly.rotation.x = crankAngle; MOT.pulley.rotation.x = crankAngle; MOT.fan.rotation.y = -crankAngle * 1.9;
      for (const m of MOT.piston) {
        const c = m.c, ph = crankAngle + c.ph, py = CRK * Math.sin(ph), pz = CRK * Math.cos(ph), S = Math.sqrt(ROD * ROD - py * py);
        c.pin.position.set(c.x, py, pz);
        const zp = c.s > 0 ? pz + S : pz - S;
        m.piston.position.set(c.x, CYY, zp);
        const a = V3(c.x, CYY + py, pz), b = V3(c.x, CYY, zp), d = b.clone().sub(a);
        m.rodm.scale.z = d.length(); m.rodm.position.copy(a).addScaledVector(d, 0.5); m.rodm.quaternion.setFromUnitVectors(V3(0, 0, 1), d.normalize());
      }
    };
    setEngine();
    K.toggle('engine', { he: 'מנוע פועל', key: 'e', seconds: 1.0 }, (t) => { engineSpeed = t * 16; });
    K.onFrame((time, dt) => { if (engineSpeed > 0.01) { crankAngle += engineSpeed * dt; setEngine(); } });
    // ================================================================== DOOR HARDWARE
    const intSys = sys('interior');
    const VINYL = M.fabric(0xc9bda3), VINYLD = M.fabric(0x5b5648), SEATC = 0x8a7f6a;
    const dbPos = (x, y, s) => { const r = sideAt(x, y, s); return r; };
    for (const D of doorList) {
      const s = D.s, sd = sideHe(s), se = sideEn(s), h = D.h, tr = (g) => g.translate(-h[0], -h[1], -h[2]);
      const loc = (p) => p.clone().sub(V3(...h));
      // outside handle with push button
      const hd = dbPos(-0.2, 0.9, s); const dh = P(D.g, `ידית דלת ${sd} עם לחצן`, `${se} door handle with push button`, 'סגסוגת אבץ מכוסה כרום', 'ידית אחיזה עם לחצן במרכז: לוחצים על הלחצן, שמשחרר את התפס, ופותחים את הדלת. בדלת הנהג יש בלחצן גם מנעול מפתח.'); dh.userData.sysOverride = 'trim';
      dh.position.copy(loc(hd.p)).addScaledVector(hd.n, 0.004); orient(dh, hd.n, V3(0, 1, 0));
      mesh(G.box(0.1, 0.034, 0.012, 0.008, 3), CHROME, { parent: dh }); put(G.box(0.07, 0.014, 0.01, 0.004, 2), M.black(), dh, [0, 0, 0.0062]);
      mesh(G.cyl(0.0105, 0.0105, 0.012, 20, 'z'), CHROME, { parent: dh, pos: [-0.018, 0, 0.0115] }); put(G.cyl(0.0064, 0.0064, 0.003, 16, 'z'), M.black(), dh, [-0.018, 0, 0.0185]);
      // hinges (two) and striker
      for (const [y, nm, nmE] of [[0.9, 'עליון', 'upper'], [0.42, 'תחתון', 'lower']]) {
        const hp = dbPos(XD1, y, s); const hg = P(D.g, `ציר דלת ${nm} ${sd}`, `${se} door hinge (${nmE})`, 'פלדה מחושלת', 'ציר פלדה מחושל שמחבר את הדלת לעמוד הקדמי. שני צירים לכל דלת נושאים את משקלה.'); hg.userData.sysOverride = 'body';
        put(G.box(0.012, 0.09, 0.034, 0.003), IRON, hg, loc(hp.p).toArray().map((v, i) => (i === 0 ? v + 0.004 : v)));
        put(G.cyl(0.0085, 0.0085, 0.1, 12, 'y'), STEEL, hg, loc(hp.p).toArray().map((v, i) => (i === 0 ? v + 0.006 : i === 2 ? v - s * 0.004 : v)));
      }
      // inner door card, armrest, crank, pull strap
      const isLower = (x, lo, hi) => inX(x, XD0, XD1) && lo >= HI.K2 && hi <= HI.dl;
      const dc = P(D.g, `ריפוד דלת ${sd}`, `${se} door card`, 'קרטון מכוסה ויניל', 'לוח ריפוד מקרטון מכוסה ויניל שמסתיר את מנגנוני החלון והמנעול ואת פח הדלת.'); dc.userData.sysOverride = 'interior';
      mesh(tr(gridGeo(sideMask(isLower, s), { off: -0.032 })), dbl(VINYL), { parent: dc, cast: false });
      const am = sideAt(0.05, 0.69, s); const arm = P(D.g, `משענת יד ${sd}`, `${se} armrest`, 'ויניל על קצף', 'משענת יד מרופדת בויניל מעל לוח הדלת.'); arm.userData.sysOverride = 'interior';
      mesh(G.soft(0.34, 0.05, 0.06, { r: 0.02, seg: 4 }), VINYLD, { parent: arm, pos: loc(am.p.clone().addScaledVector(am.n, -0.06)).toArray() });
      const cr = sideAt(0.28, 0.83, s); const wc = P(D.g, `ידית פתיחת חלון ${sd}`, `${se} window crank`, 'פלסטיק + כרום', 'ידית סיבובית שמעלה ומורידה את זכוכית הדלת בעזרת מנגנון גלגלי שיניים.'); wc.userData.sysOverride = 'interior';
      const cpos = loc(cr.p.clone().addScaledVector(cr.n, -0.05));
      mesh(G.cyl(0.02, 0.02, 0.012, 20, 'z'), CHROME, { parent: wc, pos: cpos.toArray(), rot: [PI / 2, 0, 0] }); wc.children[0].quaternion.setFromUnitVectors(V3(0, 1, 0), cr.n.clone().multiplyScalar(-1));
      rod(wc, cpos, cpos.clone().addScaledVector(V3(0, -0.02, 0), 1).addScaledVector(V3(-0.0, 0, 0), 1).add(V3(-0.07, -0.0, 0).multiplyScalar(1)), 0.0045, CHROME); put(G.sphere(0.012, 10, 8), M.gloss(0x111111), wc, cpos.clone().add(V3(-0.07, 0, 0)).toArray());
      const ps = sideAt(-0.16, 0.8, s); const pull = P(D.g, `רצועת משיכה ${sd}`, `${se} door pull strap`, 'עור', 'רצועה קצרה למשיכת הדלת סגורה מבפנים.'); pull.userData.sysOverride = 'interior';
      mesh(G.box(0.016, 0.1, 0.006, 0.002), M.leather(0x241f19), { parent: pull, pos: loc(ps.p.clone().addScaledVector(ps.n, -0.05)).toArray() });
    }
    K.toggle('windows', { he: 'חלונות דלת (סלילה)', key: 'w', seconds: 1.2 }, (t) => { for (const D of doorList) D.glass.position.y = -t * 0.32; });
    K.toggle('vents', { he: 'חלונות איוורור', key: 'v', seconds: 1.0 }, (t) => { for (const D of doorList) D.vent.rotation.y = D.s * t * 0.9; });
    // ================================================================== WIPERS, WASHER JETS, MIRRORS
    {
      const nW = V3(0.653, 0.757, 0).normalize();               // windshield plane normal
      const wipers = [];
      for (const [z, nm, nmE] of [[-0.18, 'שמאלי', 'left'], [0.3, 'ימני', 'right']]) {
        const wp = P(glassSys, `מגב ${nm}`, `${nmE[0].toUpperCase() + nmE.slice(1)} wiper`, 'פלדה + גומי', 'מגב על זרוע קפיצית שמונעת על ידי מנוע חשמלי יחיד דרך מוטות חיבור. להב הגומי נשחק ומחליפים אותו מדי כמה שנים.');
        wp.position.set(0.687, 1.012, z); const wg = new THREE.Group(); wp.add(wg);
        wg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(-nW.y, nW.x, 0), nW)); wg.position.addScaledVector(nW, 0.009);
        const sw = new THREE.Group(); wg.add(sw); wipers.push(sw);
        mesh(G.cyl(0.012, 0.012, 0.016, 14, 'z'), CHROME, { parent: wg, pos: [0, 0, 0.004] });
        rod(sw, [0, 0, 0.006], [-0.3, 0.0, 0.006], 0.0035, M.metal(0x1d1d20, 0.5));      // arm along local -x = car right
        put(G.box(0.3, 0.012, 0.008, 0.002), M.rubber(), sw, [-0.24, 0.0, 0.004]);
        put(G.cyl(0.005, 0.005, 0.014, 10, 'x'), STEEL, sw, [-0.12, 0, 0.006]);
      }
      let wipeOn = 0, wipeT = 0;
      K.toggle('wipers', { he: 'מגבים', key: 'x', seconds: 0.4 }, (t) => { wipeOn = t; if (!t) for (const sw of wipers) sw.rotation.z = 0; });
      K.onFrame((time, dt) => { if (wipeOn > 0.5) { wipeT += dt * 3.2; const a = (0.5 - 0.5 * Math.cos(wipeT)) * 1.15; for (const sw of wipers) sw.rotation.z = -a; } });
      for (const z of [-0.08, 0.1]) { const jt = P(glassSys, `מתז מי שמשה ${z < 0 ? 'שמאל' : 'ימין'}`, `Washer jet ${z < 0 ? 'left' : 'right'}`, 'פלסטיק + פליז', 'חרירי פליז קטנים בתחתית השמשה שמרססים מים כשלוחצים על הכפתור.'); mesh(G.cyl(0.0045, 0.0045, 0.018, 8, 'y'), BRASS_V, { parent: jt, pos: [0.715, 1.0, z] }); }
      // left exterior mirror on the cowl
      const mp = upper(0.8, 0.58, -1); const mr = P(trimSys, 'מראה חיצונית שמאלית', 'Left exterior mirror', 'פלדה מכוסה כרום + זכוכית', 'מראה עגולה על זרוע כרום בצד הנהג. מראה בצד הנוסע הייתה בדרך כלל אופציה.');
      mr.position.copy(mp.p);
      rod(mr, [0, 0, 0], [-0.02, 0.1, -0.06], 0.0065, CHROME); mesh(G.cyl(0.044, 0.044, 0.016, 24, 'x'), CHROME, { parent: mr, pos: [-0.02, 0.12, -0.08] });
      put(new THREE.CircleGeometry(0.038, 24), M.reflector(), mr, [-0.0285 + 0.0, 0.12, -0.08], [0, -PI / 2, 0]);
      put(G.cyl(0.015, 0.015, 0.01, 12, 'y'), CHROME, mr, [0, 0.0, 0]);
    }
    // ================================================================== INTERIOR
    const quilt = M.quilted(SEATC, 'v', '#d7cdb6', 5), quiltU = M.quilted(SEATC, 'u', '#d7cdb6', 5), vinyl = M.leather(SEATC);
    const seat = (z, nm, nmE) => {
      const c = P(intSys, `כרית מושב ${nm}`, `${nmE} seat cushion`, 'ויניל + קצף + קפיצים', 'כרית עם קפיצי סליל וריפוד ויניל. המושב נע קדימה ואחורה על מסילות.');
      mesh(G.soft(0.46, 0.13, 0.46, { r: 0.05, seg: 6, deform: (p, n) => { p.y -= 0.014 * (1 - n.x * n.x) * (1 - n.z * n.z) * Math.max(0, n.y); } }), [vinyl, vinyl, quiltU, vinyl, vinyl, vinyl], { parent: c, pos: [0.07, 0.455, z] });
      const b = P(intSys, `משענת מושב ${nm}`, `${nmE} seat back`, 'ויניל + מסגרת פלדה', 'משענת מרופדת בקפלים ובתפרים. מתכווננת בידית בצד.');
      const bm = mesh(G.soft(0.1, 0.52, 0.46, { r: 0.04, seg: 6 }), [quilt, vinyl, vinyl, vinyl, vinyl, vinyl], { parent: b, pos: [-0.2, 0.78, z] }); bm.rotation.z = 0.2;
      const r = P(intSys, `מסילות מושב ${nm}`, `${nmE} seat rails`, 'פלדה', 'שתי מסילות פלדה שמאפשרות להזיז את המושב קדימה ואחורה.');
      for (const dz of [-0.17, 0.17]) put(G.box(0.46, 0.014, 0.024, 0.004), M.metal(0x1e1f22, 0.5), r, [0.06, 0.39, z + dz]); put(G.cyl(0.005, 0.005, 0.1, 8, 'z'), STEEL, r, [0.3, 0.38, z]);
    };
    seat(-0.35, 'נהג', 'Driver'); seat(0.35, 'נוסע', 'Passenger');
    {
      const rc = P(intSys, 'ספסל אחורי (כרית)', 'Rear bench cushion', 'ויניל + קצף', 'ספסל אחורי קטן. מתחתיו עובר מארז התיבה.');
      mesh(G.soft(0.4, 0.12, 1.12, { r: 0.05, seg: 6 }), [vinyl, vinyl, quiltU, vinyl, vinyl, vinyl], { parent: rc, pos: [-0.52, 0.45, 0] });
      const rb = P(intSys, 'ספסל אחורי (משענת)', 'Rear bench back', 'ויניל + פלדה', 'משענת ספסל אחורי מרופדת בקפלים.');
      const rbm = mesh(G.soft(0.1, 0.46, 1.12, { r: 0.04, seg: 6 }), [quilt, vinyl, vinyl, vinyl, vinyl, vinyl], { parent: rb, pos: [-0.8, 0.74, 0] }); rbm.rotation.z = 0.12;
      const sh = P(intSys, 'מדף אחורי (מדף כובעים)', 'Rear parcel shelf', 'קרטון + ויניל', 'מדף מאחורי הספסל מתחת לחלון האחורי, לשמירת מעילים וחבילות. מתחתיו אזור חם סביב התיבה.');
      put(G.box(0.5, 0.012, 1.1, 0.004), VINYLD, sh, [-1.1, 0.96, 0]);
      const rbk = P(body, 'מחיצת תא המנוע (קיר אחורי)', 'Engine bulkhead', 'פלדה בעובי 1 מ״מ + אטם', 'המחיצה בין תא הנוסעים לבין תא המנוע. בה פתח עגול שדרכו עובר פעמון המצמד, ואטם גומי סוגר את הרווח.');
      const bsh = G.shape([[-0.62, 0.28], [0.62, 0.28], [0.62, 0.99], [-0.62, 0.99]]); bsh.holes.push(G.circlePath(0.14, 0, 0.5, true));
      const bg = G.extrude(bsh, 0.008, { curveSeg: 20 }); bg.rotateY(-PI / 2); mesh(bg, dbl(M.paintFlat(0x15161a, 0.7)), { parent: rbk, pos: [-1.405, 0, 0] });
      // carpet and mats
      const cp = P(intSys, 'שטיחי רצפה', 'Floor carpet & mats', 'סיבים + גומי', 'שטיח גומי קדמי מחורץ ושטיח סיבים אחורי.');
      for (const s of [1, -1]) put(G.box(0.7, 0.008, 0.44, 0.003), M.rubber(), cp, [0.45, 0.295, s * 0.36]);
      put(G.box(0.55, 0.008, 1.15, 0.003), M.carpet(0x352f27), cp, [-0.55, 0.295, 0]);
      // headliner and dome lamp
      const hl = P(intSys, 'ריפוד גג (תקרה)', 'Headliner', 'בד סרוג על חוטי פלדה', 'בד קלוע מתוח על קשתות פלדה צרות מתחת לגג; גם מבודד חום וקול.');
      mesh(gridGeo((x, lo, hi) => inX(x, -0.97, 0.235) && hi <= HI.K1b, { off: -0.035 }), dbl(M.fabric(0xd9d0b6)), { parent: hl, cast: false });
      LM.dome = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xfff0c8, emissiveIntensity: 0.0, roughness: 0.4, name: 'נורת תקרה' });
      const dl = P(lightsSys, 'מנורת תקרה', 'Dome lamp', 'פלסטיק + נורה 6 וולט', 'מנורה קטנה בחלל הגג, נדלקת במתג שבמעטפת. עוזרת למצוא חפץ באמצע הלילה.');
      mesh(G.box(0.1, 0.02, 0.06, 0.008), LM.dome, { parent: dl, pos: [-0.35, 1.405, 0] });
      // visors and rear-view mirror
      const sv = P(intSys, 'מגני שמש (2)', 'Sun visors (×2)', 'קרטון + ויניל', 'שני מגני שמש מתכווננים מעל השמשה.');
      for (const z of [-0.3, 0.3]) mesh(G.box(0.14, 0.012, 0.3, 0.004), VINYLD, { parent: sv, pos: [0.19, 1.36, z] });
      const rv = P(intSys, 'מראה פנימית', 'Rear-view mirror', 'פלסטיק + זכוכית', 'מראה פנימית על זרוע קצרה שמחוברת לקצה העליון של השמשה.');
      rod(rv, [0.245, 1.385, -0.02], [0.2, 1.31, -0.02], 0.005, CHROME); mesh(G.box(0.012, 0.06, 0.2, 0.006), M.gloss(0x111111), { parent: rv, pos: [0.2, 1.3, -0.02] }); put(G.box(0.002, 0.048, 0.185, 0.002), M.reflector(), rv, [0.193, 1.3, -0.02]);
      // dash, instruments, controls
      const ds = P(intSys, 'לוח מחוונים (פח צבוע)', 'Dashboard (painted steel)', 'פלדה בעובי 1 מ״מ + לכה', 'לוח פח צבוע בצבע הגוף: מינימליזם של פולקסווגן. בשנתון 1963 יש מד מהירות אחד ושלוש נורות אזהרה, בלי מד דלק (רק ידית רזרבה).');
      mesh(G.soft(0.2, 0.34, 1.18, { r: 0.035, seg: 5 }), PAINT, { parent: ds, pos: [0.73, 0.79, 0] });
      put(G.box(0.1, 0.012, 1.04, 0.004), M.black(), ds, [0.64, 0.955, 0]);
      for (const z of [-0.24, 0.24]) { put(G.box(0.07, 0.006, 0.17, 0.002), M.black(), ds, [0.745, 0.963, z]); instances(new THREE.BoxGeometry(0.0035, 0.005, 0.15), M.metal(0x303236, 0.5), Array.from({ length: 6 }, (_, k) => ({ pos: [0.715 + k * 0.012, 0.966, z] })), { parent: ds, cast: false }); }
      const sp = P(intSys, 'מד מהירות עם נורות אזהרה', 'Speedometer with warning lights', 'פלדה + זכוכית + בקליט', 'מד מהירות עגול בקצה שמאל, ובתוכו מד קילומטרז׳ מכני ושלוש נורות אזהרה: שמן (אדום), טעינה (ירוק) ואור גבוה (כחול).');
      mesh(G.lathe([[0.056, 0.0], [0.06, 0.012], [0.058, 0.03], [0.054, 0.034], [0.0, 0.034]], 32, 'x'), M.metal(0x1d1f23, 0.4), { parent: sp, pos: [0.585, 0.89, -0.33], scale: [-1, 1, 1] });
      const spTex = K.canvasTexture(512, 512, (g, w, h) => { g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9d9d3'; g.fillStyle = '#d9d9d3'; g.lineWidth = 4; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 34px Arial'; for (let v = 0; v <= 120; v += 10) { const a = (-135 + (v / 120) * 270) * PI / 180; const r1 = 205, r2 = 230; g.beginPath(); g.moveTo(256 + Math.sin(a) * r1, 256 - Math.cos(a) * r1); g.lineTo(256 + Math.sin(a) * r2, 256 - Math.cos(a) * r2); g.stroke(); g.fillText(String(v), 256 + Math.sin(a) * 170, 256 - Math.cos(a) * 170); } for (let v = 5; v < 120; v += 10) { const a = (-135 + (v / 120) * 270) * PI / 180; g.beginPath(); g.moveTo(256 + Math.sin(a) * 215, 256 - Math.cos(a) * 215); g.lineTo(256 + Math.sin(a) * 230, 256 - Math.cos(a) * 230); g.stroke(); } g.font = '700 40px Arial'; g.fillText('km/h', 256, 330); g.fillStyle = '#f2f2ea'; g.fillRect(212, 365, 88, 28); g.fillStyle = '#111'; g.font = '600 26px "Courier New",monospace'; g.fillText('012345', 256, 380); g.fillStyle = '#d33'; g.beginPath(); g.arc(190, 430, 12, 0, 7); g.fill(); g.fillStyle = '#2d3'; g.beginPath(); g.arc(256, 438, 12, 0, 7); g.fill(); g.fillStyle = '#39f'; g.beginPath(); g.arc(322, 430, 12, 0, 7); g.fill(); });
      mesh(new THREE.CircleGeometry(0.052, 36), new THREE.MeshStandardMaterial({ map: spTex, roughness: 0.4 }), { parent: sp, pos: [0.5995, 0.89, -0.33], rot: [0, -PI / 2, 0] });
      const needle = new THREE.Group(); needle.position.set(0.598, 0.89, -0.33); sp.add(needle);
      mesh(new THREE.BoxGeometry(0.003, 0.046, 0.004), M.emissive(0xff6a2a, 0.5), { parent: needle, pos: [0, 0.015, 0] }); put(G.cyl(0.007, 0.007, 0.006, 12, 'x'), M.metal(0x303236, 0.4), needle, [0, 0, 0]);
      needle.rotation.x = -2.36; MOT.needle = needle;
      const ig = P(intSys, 'מתג הצתה עם מפתח', 'Ignition switch & key', 'פליז + פלדה', 'מתג הצתה עם מפתח, משמאל להגה. סיבוב ימינה מפעיל את המתנע.');
      mesh(G.cyl(0.02, 0.02, 0.016, 18, 'x'), CHROME, { parent: ig, pos: [0.625, 0.8, -0.15] }); put(G.box(0.01, 0.034, 0.006, 0.002), M.metal(0xb7b9bd, 0.35), ig, [0.612, 0.8, -0.15]); put(G.cyl(0.011, 0.011, 0.01, 12, 'x'), M.gloss(0x111111), ig, [0.607, 0.8, -0.15]);
      const ctl = K.panel(ds, { pos: [0.628, 0.74, -0.45], normal: [-1, 0, 0], up: [0, 1, 0], w: 0.2, h: 0.07, plate: M.gloss(0x0e0e10), buttons: [{ x: -0.07, y: 0.0, w: 0.028, kind: 'knob', label: 'LIGHT', mat: CHROME }, { x: -0.015, y: 0.0, w: 0.028, kind: 'knob', label: 'WIPER', mat: CHROME }, { x: 0.04, y: 0.0, w: 0.028, kind: 'knob', label: 'DEFROST', mat: CHROME }, { x: 0.085, y: -0.012, w: 0.02, h: 0.016, kind: 'rect', label: 'FLASH', led: '#e9a21a' }] });
      const sc = P(intSys, 'לוחית בקרה (תאורה, מגבים, איתות)', 'Control knobs (lights, wipers)', 'כרום + בקליט', 'בקרות של תאורה, מגבים, הפשרה ומחוון איתות. האיתות נשלט בידית קטנה בעמוד ההגה.');
      ctl.userData.sysOverride = 'interior';
      const gb = P(intSys, 'תא כפפות (עם דלת)', 'Glove compartment (hinged lid)', 'פלדה צבועה + כרום', 'תא כפפות בצד הנוסע עם מכסה צירי ותפס כרום ללחיצה.');
      put(new THREE.PlaneGeometry(0.34, 0.15), M.black(), gb, [0.6285, 0.67, 0.3], [0, -PI / 2, 0]);
      const glid = new THREE.Group(); glid.position.set(0.62, 0.595, 0.3); gb.add(glid);
      mesh(G.box(0.012, 0.16, 0.36, 0.006), PAINT, { parent: glid, pos: [0.0, 0.08, 0] }); put(G.cyl(0.011, 0.011, 0.012, 16, 'x'), CHROME, glid, [-0.009, 0.12, 0]);
      K.toggle('glovebox', { he: 'תא כפפות', key: 'q', seconds: 0.7 }, (t) => { glid.rotation.z = t * 1.3; });
      const as = P(intSys, 'מאפרה וגריל רמקול', 'Ashtray & speaker blank', 'כרום + פלסטיק', 'מאפרה כרום במרכז הלוח, ולידה לוחית ריקה שמיועדת למקלט רדיו אופציונלי.');
      put(G.box(0.012, 0.045, 0.12, 0.004), CHROME, as, [0.628, 0.83, 0.04]); put(G.box(0.01, 0.06, 0.15, 0.004), M.black(), as, [0.628, 0.74, 0.04]);
      // steering wheel on the column axis
      const sw = P(intSys, 'הגה עם טבעת צופר', 'Steering wheel with horn ring', 'בקליט שחור + פלדה', 'הגה בקוטר כ־40 ס״מ עם שני חישורים וחצי טבעת צופר מכרום; במרכזו סמל VW. לחיצה על הטבעת מפעילה את הצופר.');
      sw.position.copy(STW); sw.quaternion.setFromUnitVectors(V3(0, 0, 1), colDir.clone().multiplyScalar(-1));
      const swg = new THREE.Group(); sw.add(swg); steerWheel = swg;
      mesh(G.torus(0.19, 0.0165, 14, 56), M.gloss(0x14151a), { parent: swg });
      for (const a of [PI * 0.14, PI * 0.86]) rod(swg, [Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.0], [Math.cos(a) * 0.185, Math.sin(a) * 0.185, 0.0], 0.0068, M.darkSteel());
      mesh(G.torus(0.14, 0.0042, 8, 36, PI, 'z'), CHROME, { parent: swg, pos: [0, 0, 0.012], rot: [0, 0, PI] });
      mesh(G.cyl(0.04, 0.04, 0.026, 24, 'z'), M.gloss(0x14151a), { parent: swg, pos: [0, 0, 0.012] }); mesh(new THREE.CircleGeometry(0.03, 28), M.decal(vwLogo, { roughness: 0.3 }), { parent: swg, pos: [0, 0, 0.0262], cast: false });
      const ctrl = P(intSys, 'ידית איתות', 'Turn-signal stalk', 'פלסטיק + פלדה', 'ידית דקה משמאל לעמוד ההגה שמפעילה את מהבהבי הפנייה ומחזירה את עצמה בסיום הפנייה.');
      rod(ctrl, STB.clone().lerp(STW, 0.97).add(V3(0, 0.0, 0.03)), STB.clone().lerp(STW, 0.97).add(V3(0.06, 0.03, 0.12)), 0.0065, M.metal(0x1a1b1e, 0.5));
      // pedals, handbrake, gear lever, heater levers
      const pd = P(intSys, 'שלוש דוושות (מצמד, בלם, מצערת)', 'Three pedals (clutch, brake, throttle)', 'פלדה + גומי', 'שתי דוושות תלויות (מצמד ובלם) ודוושת גז מונחת על הרצפה.');
      for (const [z, mat] of [[-0.46, M.rubber()], [-0.36, M.rubber()]]) { rod(pd, [0.8, 0.64, z], [0.725, 0.36, z], 0.007, DSTEEL); put(G.box(0.025, 0.07, 0.06, 0.006), mat, pd, [0.718, 0.34, z], [0, 0, 0.3]); }
      rod(pd, [0.74, 0.3, -0.2], [0.68, 0.34, -0.2], 0.006, DSTEEL); put(G.box(0.1, 0.012, 0.055, 0.005), M.rubber(), pd, [0.69, 0.337, -0.2], [0, 0, -0.5]);
      const hb = P(intSys, 'ידית בלם יד', 'Handbrake lever', 'פלדה + ידית ויניל', 'ידית בלם יד על המנהרה ליד מושב הנהג, מחוברת בכבלי פלדה לבלמי התוף האחוריים.');
      rod(hb, [0.0, 0.41, -0.115], [-0.1, 0.6, -0.115], 0.0095, DSTEEL); put(G.cyl(0.0155, 0.0155, 0.08, 14, 'y'), M.gloss(0x14141a), hb, [-0.105, 0.625, -0.115], [0, 0, 0.45]);
      const gl = P(intSys, 'ידית הילוכים + מגן אבק', 'Gear lever & boot', 'פלדה + גומי + פלסטיק', 'ידית הילוכים קצרה עם מגן אבק מגומי, מחוברת למוט הילוכים בתוך המנהרה.');
      mesh(G.lathe([[0.036, 0.0], [0.03, 0.03], [0.014, 0.075], [0.012, 0.1]], 16, 'y'), M.rubber(), { parent: gl, pos: [0.17, 0.39, 0.0] }); rod(gl, [0.17, 0.42, 0.0], [0.15, 0.66, 0.0], 0.0075, DSTEEL); put(G.sphere(0.0225, 16, 12), M.gloss(0x14141a), gl, [0.148, 0.685, 0.0]);
      const hv = P(intSys, 'ידיות חימום (2)', 'Heater levers (×2)', 'פלדה + פלסטיק', 'שתי ידיות בצד המנהרה: ימין ושמאל פותחים את זרימת האוויר החם מהמחליפים. אין בקרת טמפרטורה — פתוח או סגור.');
      for (const z of [-0.06, 0.06]) { rod(hv, [0.1, 0.405, z], [0.07, 0.48, z], 0.0042, DSTEEL); put(G.sphere(0.011, 10, 8), M.gloss(0x14141a), hv, [0.068, 0.49, z]); }
      const ft = P(fuelSys, 'ידית רזרבה (ברז דלק)', 'Fuel reserve lever', 'פלדה + גומי', 'ידית קטנה על הרצפה ליד הנהג שפותחת צינור משני במיכל. כשהמנוע מתחיל לגמגם, מושכים אותה ויש עוד כמה ליטרים לנסיעה.');
      rod(ft, [0.55, 0.285, -0.2], [0.5, 0.34, -0.2], 0.0055, DSTEEL); put(G.sphere(0.012, 10, 8), M.gloss(0xb02020), ft, [0.495, 0.345, -0.2]);
    }
    // ================================================================== LID: louvres and handle
    {
      const lv = P(lidG, 'חריצי אוורור במכסה המנוע', 'Engine lid louvres', 'פלדה מחוררת', 'פתחי אוורור שמכניסים אוויר צח אל מאוורר הקירור ומשחררים חום מתא המנוע. בדגם כאן 14 חריצים.'); lv.userData.sysOverride = 'body';
      const list = []; for (let k = 0; k < 14; k++) { const x = -1.46 - k * 0.012 - 0.01; const i = colAt(x); const p = GP[i][MID].clone().addScaledVector(GN[i][MID], 0.0015).sub(V3(...lidHinge)); const a = Math.atan2(GP[Math.max(0, i - 1)][MID].y - GP[Math.min(NI - 1, i + 1)][MID].y, GP[Math.max(0, i - 1)][MID].x - GP[Math.min(NI - 1, i + 1)][MID].x); list.push({ pos: p.toArray(), rot: [0, 0, -Math.abs(a)] }); }
      instances(new THREE.BoxGeometry(0.006, 0.0035, 0.46), M.black(), list, { parent: lv, cast: false });
      const hd = P(lidG, 'ידית מכסה מנוע עם מנעול', 'Engine lid handle & lock', 'סגסוגת כרום', 'ידית כרום עם מנעול בקצה האחורי של המכסה: לוחצים על הלחצן ומרימים. היא יושבת מעל לוחית הרישוי.'); hd.userData.sysOverride = 'trim';
      const hp = upper(-1.9, 0.0); const hpos = hp.p.clone().addScaledVector(hp.n, 0.006).sub(V3(...lidHinge));
      mesh(G.box(0.05, 0.016, 0.07, 0.006), CHROME, { parent: hd, pos: hpos.toArray() }).quaternion.setFromUnitVectors(V3(0, 1, 0), hp.n);
    }
    // ================================================================== LATE DETAILS: seams, rubber, instrument animation
    K.onFrame((time, dt) => { if (MOT.needle) { const target = -2.36 + (speed > 0.01 ? Math.min(1, speed / 6) * 0.45 * 4.71 : 0); MOT.needle.rotation.x += (target - MOT.needle.rotation.x) * Math.min(1, dt * 4); } });
    // ================================================================== EXTRAS: brake hydraulics, hinges, seals, fasteners
    {
      const mc = P(brakesSys, 'צילינדר ראשי ובקבוק נוזל בלמים', 'Brake master cylinder & reservoir', 'ברזל יצוק + פלסטיק', 'צילינדר הידראולי יחיד שדוחף נוזל בלמים אל ארבעת הגלגלים. הוא מחובר ישירות לדוושה, ובקבוק קטן מעליו מחזיק את הנוזל. ב־1963 עדיין צילינדר אחד (לא כפול), כך שדליפה אחת מבטלת את הבלמים.');
      mesh(G.cyl(0.021, 0.021, 0.14, 18, 'x'), CAST, { parent: mc, pos: [0.79, 0.4, -0.28] }); mesh(G.cyl(0.032, 0.032, 0.06, 18, 'y'), M.glass(0xd8c88c, 0.6), { parent: mc, pos: [0.76, 0.45, -0.28] }); put(G.cyl(0.0175, 0.0175, 0.012, 14, 'y'), M.black(), mc, [0.76, 0.486, -0.28]);
      const bl = P(brakesSys, 'צינורות בלם הידראוליים', 'Hydraulic brake lines', 'פלדה מצופת נחושת', 'צינורות דקים שמובילים נוזל מהצילינדר הראשי לצילינדרי הגלגל, לאורך הצינור המרכזי. נוסו לנחושת כדי להתאים לשימוש בשטח.');
      mesh(G.tube([V3(0.79, 0.4, -0.28), V3(0.6, 0.31, -0.2), V3(1.0, 0.27, -0.1), V3(1.38, 0.27, -0.05)], 0.0035, 40, 6), M.copper(), { parent: bl });
      mesh(G.tube([V3(0.79, 0.4, -0.28), V3(0.5, 0.31, -0.12), V3(-0.4, 0.27, -0.06), V3(-1.1, 0.28, 0.0), V3(-1.2, 0.3, 0.48)], 0.0035, 100, 6), M.copper(), { parent: bl });
      const hh = P(brakesSys, 'צינורות גומי לבלמים (4)', 'Flexible brake hoses (×4)', 'גומי משוריין', 'קטע גמיש אחרון לכל גלגל, שנע יחד עם המתלה וההיגוי. הוא הרכיב הראשון שמחליפים כשמבקרים בבדיקה שנתית.');
      for (const [x, z] of [[AXF, 0.5], [AXF, -0.5], [AXR - 0.02, 0.46], [AXR - 0.02, -0.46]]) mesh(G.tube([V3(x, 0.44, z * 0.6), V3(x - 0.03, 0.32, z * 0.9), V3(x, 0.3, z * 1.05)], 0.0055, 14, 8), M.rubber(), { parent: hh });
      const hbc = P(brakesSys, 'כבלי בלם יד (2)', 'Handbrake cables (×2)', 'כבל פלדה בגיד', 'שני כבלים מהידית שעל המנהרה אל בלמי התוף האחוריים. הם עוברים בתוך מעטפת גמישה מתחת לרצפה.');
      for (const s of [1, -1]) mesh(G.tube([V3(-0.0, 0.32, -0.12), V3(-0.6, 0.29, s * 0.12), V3(-1.1, 0.29, s * 0.4), V3(AXR, 0.3, s * 0.58)], 0.0028, 50, 5), M.metal(0x8a8e94, 0.4), { parent: hbc });
      // engine lid hinges, seals and door striker plates
      for (const s of [1, -1]) {
        const lh = P(doorsSys, `ציר מכסה מנוע ${sideHe(s)}`, `Engine lid hinge ${sideEn(s)}`, 'פלדה מחושלת', 'ציר שני זרועות בקצה הקדמי של המכסה, עם קפיץ פיתול שמרים אותו מעט. המכסה נפתח אל מעלה ונשאר פתוח בעזרת מוט תמיכה.'); lh.userData.sysOverride = 'doors';
                put(G.box(0.06, 0.012, 0.06, 0.003), IRON, lh, [-1.4, Tt(-1.38) - 0.012, s * 0.3]); rod(lh, [-1.4, Tt(-1.38) - 0.012, s * 0.3], [-1.35, Tt(-1.38) - 0.006, s * 0.3], 0.007, STEEL);
        const st = P(doorsSys, `לוחית נעילה (סטרייקר) ${sideHe(s)}`, `Door striker plate ${sideEn(s)}`, 'פלדה מגולוונת', 'הלוחית שבעמוד האחורי שהתפס של הדלת נאחז בו. מסומרת בשלושה ברגי פיליפס.'); st.userData.sysOverride = 'doors';
        const sp = sideAt(XD0 - 0.012, 0.86, s);
        put(G.box(0.012, 0.045, 0.026, 0.003), M.metal(0x8f9399, 0.4), st, sp.p.clone().addScaledVector(sp.n, -0.004).toArray());
        const ds = P(doorsSys, `אטם פתח דלת ${sideHe(s)}`, `Door aperture seal ${sideEn(s)}`, 'גומי EPDM', 'פס גומי שחור סביב פתח הדלת שנלחץ כשהיא נסגרת ואוטם מפני גשם ורעש.'); ds.userData.sysOverride = 'doors';
        mesh(mergeTubes([colLine(colAt(XD0 - XGAP), jOf('K2', s), jOf('dg', s), -0.004), rowLine(jOf('dg', s), XD0 - XGAP, XD1 + XGAP, -0.004), colLine(colAt(XD1 + XGAP), jOf('K2', s), jOf('dg', s), -0.004)], 0.006), SEAL, { parent: ds });
      }
      const hs2 = P(doorsSys, 'אטם מכסה תא המטען', 'Hood seal', 'גומי ספוגי', 'שרוול גומי ספוגי סביב פתח תא המטען מונע מים ואבק. כשהמכסה סגור הוא נלחץ בכוח שלו.'); hs2.userData.sysOverride = 'doors';
      mesh(mergeTubes([rowLine(MID - HI.K1b, 0.74, 1.9, -0.003), rowLine(MID + HI.K1b, 0.74, 1.9, -0.003)], 0.006), SEAL, { parent: hs2 });
      const ls = P(doorsSys, 'אטם מכסה המנוע', 'Engine lid seal', 'גומי ספוגי', 'אטם גומי בהיקף פתח המנוע שמונע מים ומחזיר אוויר אל המאוורר דרך החריצים בלבד.'); ls.userData.sysOverride = 'doors';
      mesh(mergeTubes([rowLine(MID - HI.K1b, -1.95, -1.38, -0.003), rowLine(MID + HI.K1b, -1.95, -1.38, -0.003)], 0.006), SEAL, { parent: ls });
      // front fender bolts and rear shelf screws
      const fbs = P(body, 'ברגי כנף קדמית (2×8)', 'Front fender bolts (2×8)', 'פלדה מגולוונת + אומי קוצים', 'הכנף הקדמית מוברגת למרכב, ולכן אפשר להחליף אחרי תאונה בלי לרתך. ראשי הברגים צבועים בצבע המרכב.');
      for (const s of [1, -1]) { const list = []; for (let k = 0; k < 8; k++) { const x = lerp(0.76, 1.3, k / 7); const u = upper(x, 0.46, s); if (u) list.push({ pos: u.p.clone().addScaledVector(u.n, 0.001).toArray(), rot: [0, 0, 0] }); } instances(G.cyl(0.0055, 0.0055, 0.003, 8, 'y'), M.metal(0x2a2c30, 0.5), list, { parent: fbs, cast: false }); }
    }
    // @@TAIL
    K.gameRig({ kind: 'car', wheels: rigWheels });
  },
};
