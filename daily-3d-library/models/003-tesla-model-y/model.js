// #003 — Tesla Model Y "Juniper" (2025). Built entirely in code with the library kit
// (engine/kit.js): no model files, no images. Units are metres. Axes: +x = forward,
// +y = up, +z = right (passenger side; the driver sits at -z). s = +1 right, -1 left.
//
// Body: one parametric section S(x, v) — v runs around the car from the roof centre
// (0) through the greenhouse, the shoulder, the door side and the rocker to the floor
// centre (±1). Doors, frunk lid, liftgate and every window are patches of the same
// section with shared break points, so the holes and the panels line up exactly.

window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, surface, samples, cap, lerp, smooth, clamp, instances } = K;
    const PI = Math.PI;
    const put = (geo, mat, parent, pos, rot, o = {}) => { if (rot && !Array.isArray(rot)) { o = rot; rot = null; } return mesh(geo, mat, { parent, pos: pos || undefined, rot: rot || undefined, ...o }); };
    const ctx = {};
    const sideHe = (s) => (s > 0 ? 'ימין' : 'שמאל'), sideEn = (s) => (s > 0 ? 'right' : 'left');

    // ------------------------------------------------------------------ key dimensions
    const XF = 2.36, XR = -2.43;               // nose / tail → length 4.79 m
    const AXF = 1.445, AXR = -1.445;           // wheelbase 2.89 m
    const TIRE_R = 0.356, TIRE_W = 0.255;      // 255/45 R19
    const WHEEL_Z = 0.818;                     // track 1.636 m
    const HW = 0.96;                           // half width 1.92 m
    const ARCH_R = 0.405, ARCH_Y = 0.36;        // wheel-arch circle
    const W_IN = 0.69;                         // inner wheelhouse wall
    const COWL = 1.06, WS_TOP = -0.05, ROOF_END = -0.92, BL_END = -2.24;
    const ROOF = 1.622 - 0.5 * 0.27 * 0.27;                        // roof peak ≈ 1.62 with the crown
    const GA_TOP = 0.215, GA_BOT = 0.412, A_G = 0.42; // side-glass band in v; greenhouse ends at A_G
    const FD = [0.98, -0.155], RD = [-0.185, -1.06], QG = [-1.10, -1.62]; // front / rear door, quarter glass
    const FR = [1.10, 2.18];                   // frunk lid x range
    const LG = -0.95;                          // liftgate hinge line
    const GAP = 0.0035;
    const FLOOR = 0.42;                        // cabin floor (the battery sits under it)

    // ------------------------------------------------------------------ section parameters
    // Profiles measured from a camera-matched reference photo (tools/camsolve.py + back-projection):
    // monotone cubic interpolation through [x, value] tables.
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
    // plan view: rounded nose and tail (real corners sit ~0.26 m behind the tip at |z| = 0.6)
    const W = (x) => {
      const rf = 0.6, rr = 0.30;
      if (x > XF - rf) { const u = clamp((x - (XF - rf)) / rf); return HW * Math.pow(Math.max(0, 1 - Math.pow(u, 2.4)), 1 / 2.4); }
      if (x < XR + rr) { const d = XR + rr - x; return HW - rr + Math.sqrt(Math.max(0, rr * rr - d * d)); }
      return HW;
    };
    // centre-line top: hood → windshield → roof → fastback → spoiler
    const YT = table([[XR, 1.11], [-2.36, 1.13], [-2.28, 1.23], [-2.10, 1.35], [-1.92, 1.426], [-1.745, 1.48], [-1.565, 1.53], [-1.307, 1.565], [-1.052, 1.58], [-0.801, 1.587], [-0.553, 1.586], [-0.37, 1.565], [-0.13, 1.545], [0.11, 1.50], [0.34, 1.42], [0.57, 1.32], [0.82, 1.2], [1.06, 1.08], [1.32, 0.99], [1.54, 0.945], [1.76, 0.9], [1.98, 0.855], [2.19, 0.81], [XF, 0.75]]);
    // beltline (bottom of the side glass); in front of the cowl it is the hood edge, 5 cm below the hood crown
    const YB = table([[XR, 1.09], [-2.3, 1.12], [-1.9, 1.16], [-1.36, 1.16], [-1.11, 1.15], [-0.37, 1.13], [0.34, 1.11], [0.97, 1.075]]);
    const Yb = (x) => (x > COWL ? YT(x) - 0.05 - 0.05 * smooth(XF - 0.3, XF, x) : x > 0.97 ? lerp(1.075, YT(COWL) - 0.05, (x - 0.97) / (COWL - 0.97)) : YB(x));
    const Yt = (x) => YT(x);
    const Y0 = (x) => {
      let y = 0.17;
      if (x > 1.95) y += 0.11 * Math.pow((x - 1.95) / (XF - 1.95), 1.8);
      if (x < -1.95) y += 0.11 * Math.pow((-1.95 - x) / (-1.95 - XR), 1.6);
      return y;
    };
    const YA = (x) => {
      for (const ax of [AXF, AXR]) { const d = Math.abs(x - ax); if (d < ARCH_R) return Math.max(Y0(x), ARCH_Y + Math.sqrt(ARCH_R * ARCH_R - d * d)); }
      return Y0(x);
    };
    const LV = { glass: A_G, shoulder: 0.50, side: 0.80, cornerB: 0.86, well: 0.91, wellIn: 0.95 };
    const sec = (x, v) => {
      const s = v < 0 ? -1 : 1, a = Math.min(1, Math.abs(v));
      const w = W(x), yb = Yb(x), hh = Math.max(0.004, Yt(x) - yb), y0 = Y0(x), ya = YA(x);
      const nf = smooth(1.3, XF, x), k = clamp(hh / 0.5), wg = w - lerp(0.09, 0.2, k) - 0.12 * nf - 0.14 * smooth(-0.9, -2.3, x), n = lerp(5.5, 2.8, k), drop = 0.07 + 0.1 * nf, ws = w - 0.075, wi = Math.min(W_IN, Math.max(0, w - 0.17));
      let y, z;
      const seg = (a0, a1) => (a - a0) / (a1 - a0);
      if (a <= LV.glass) { const t = (a / LV.glass) * PI / 2; z = wg * Math.pow(Math.sin(t), 2 / n); y = yb + hh * Math.pow(Math.cos(t), 2 / n); }
      else if (a <= LV.shoulder) { const t = seg(LV.glass, LV.shoulder) * PI / 2; z = wg + (ws - wg) * Math.sin(t); y = yb - drop * (1 - Math.cos(t)); }
      else if (a <= LV.side) { const t = seg(LV.shoulder, LV.side); y = lerp(yb - drop, ya + 0.05, t); z = w - 0.075 * Math.pow(Math.abs(t - 0.45) / 0.55, 2) - 0.035 * t * t; }
      else if (a <= LV.cornerB) { const t = seg(LV.side, LV.cornerB) * PI / 2; z = w - 0.11 - 0.05 * (1 - Math.cos(t)); y = ya + 0.05 - 0.05 * Math.sin(t); }
      else if (a <= LV.well) { const t = seg(LV.cornerB, LV.well); z = lerp(w - 0.16, wi, t); y = ya; }
      else if (a <= LV.wellIn) { const t = seg(LV.well, LV.wellIn); z = wi; y = lerp(ya, y0, t); }
      else { const t = seg(LV.wellIn, 1); z = lerp(wi, 0, t); y = y0; }
      return V3(x, y, s * z);
    };
    const out = (p, x) => V3(0, p.y - (Y0(x) + Yb(x)) / 2, p.z);
    // outward unit normal of the section at (x, v)
    const nrm = (x, v) => { const e = 1e-3; const du = sec(x + e, v).sub(sec(x - e, v)), dv = sec(x, v + e).sub(sec(x, v - e)); const n = du.cross(dv).normalize(); const p = sec(x, v); if (n.dot(out(p, x)) < 0) n.negate(); return n; };
    const onBody = (x, v, d = 0) => sec(x, v).addScaledVector(nrm(x, v), d);
    // v for a given height on the door side (s = side)
    const vAtY = (x, y, s = 1) => { const dr = 0.055 + 0.1 * smooth(1.3, XF, x); return s * (LV.shoulder + (LV.side - LV.shoulder) * clamp((Yb(x) - dr - y) / (Yb(x) - dr - YA(x) - 0.05))); };

    const inX = (x, r) => x <= Math.max(...r) && x >= Math.min(...r);
    const aP = (x) => lerp(0.165, 0.372, clamp((x - WS_TOP) / (COWL - WS_TOP)));          // A-pillar line (v at x)
    const aD = (x) => (x >= LG ? 0.165 : x >= BL_END ? lerp(0.165, 0.36, (LG - x) / (LG - BL_END)) : 0.39); // D-pillar / liftgate edge
    const fdFront = () => FD[0];
    const inFD = (x, a) => a >= GA_TOP && a <= LV.side && x <= fdFront(a) && x >= FD[1] && !(a < GA_BOT && a < aP(x) + 0.035);
    const inRD = (x, a) => a >= GA_TOP && a <= LV.side && inX(x, RD);
    const inQG = (x, a) => a >= GA_TOP && a <= GA_BOT && inX(x, QG) && (x > LG || a > aD(x) + 0.04);
    const WSA = 0.375;
    const inWS = (x, a) => a < aP(x) - 0.012 && x <= COWL && x >= WS_TOP;
    const inRoofGlass = (x, a) => a < 0.165 && x <= WS_TOP - 0.04 && x >= ROOF_END + 0.05;
    const inFrunk = (x, a) => a < 0.405 && inX(x, FR);
    const inGate = (x, a) => x <= LG && a < aD(x) + 0.03;

    // shared samplers
    const aBreaks = [0.165, GA_TOP, WSA, GA_BOT, A_G, LV.shoulder, 0.65, LV.side, LV.cornerB, LV.well, LV.wellIn];
    const arcStep = (v) => { const a = Math.abs(v); return (a > A_G && a < LV.shoulder) || (a > LV.side && a < LV.cornerB) ? 0.011 : a < A_G ? 0.009 : 0.03; };
    const vs = samples(-1, 1, arcStep, [...aBreaks, ...aBreaks.map((b) => -b), 0]);
    const xBreaks = [...FD, 0.88, ...RD, ...QG, ...FR, LG, COWL, WS_TOP, WS_TOP - 0.04, ROOF_END, ROOF_END + 0.05, BL_END, AXF - ARCH_R, AXF + ARCH_R, AXR - ARCH_R, AXR + ARCH_R];
    const xStep = (x) => (x > XF - 0.6 || x < XR + 0.32 ? 0.016 : Math.abs(x - AXF) < ARCH_R + 0.02 || Math.abs(x - AXR) < ARCH_R + 0.02 ? 0.022 : (x < COWL && x > WS_TOP) || (x < LG && x > BL_END) ? 0.012 : 0.04);
    const xs = samples(XR, XF, xStep, xBreaks);
    // sub-ranges of the shared grids, so every patch is cut on exactly the same lines as its hole
    const subX = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return [lo, ...xs.filter((x) => x > lo + 1e-4 && x < hi - 1e-4), hi]; };
    const subV = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return [lo, ...vs.filter((v) => v > lo + 1e-4 && v < hi - 1e-4), hi]; };

    // a patch of the section between two v-curves lo(x)..hi(x): smooth edges along the pillars
    const band = (x0, x1, lo, hi, o = {}) => surface((x, u) => sec(x, lerp(lo(x), hi(x), u)), subX(x0, x1), samples(0, 1, 0.08), { out, ...o });
    const PAINT = M.paint(0x7d838b);            // Quicksilver
    const GLOSSBLK = M.gloss(0x08090a);
    const TRIM = M.plastic(0x101113, 0.5);
    const glassMat = (o = 0.62) => M.glass(0x0b1013, o);

    // ================================================================== BODY
    const bodySys = sys('body');
    {
      const shell = part(bodySys, { he: 'מעטפת המרכב', en: 'Body shell', mat: 'פלדה ואלומיניום + צבע מתכתי Quicksilver ולכה', desc: 'המרכב החיצוני: כנפיים, עמודים, גג, ספים ופגושים. החלק האחורי שלו (מאחורי המושבים) נוצק כחתיכת אלומיניום אחת במכונת Giga Press.' });
      const skip = (x, v) => { const a = Math.abs(v); return inFD(x, a) || inRD(x, a) || inQG(x, a) || inWS(x, a) || inRoofGlass(x, a) || inFrunk(x, a) || inGate(x, a); };
      mesh(surface(sec, xs, vs, { skip, out }), [PAINT, M.black()], { parent: shell, name: 'body skin' });
      const ring = (x) => vs.map((v) => sec(x, v));
      // rear face: lower part is the bumper (body), upper part belongs to the liftgate
      const rr = ring(XR).slice(0, -1), YC = 0.66;
      const clip = (pts, keepAbove) => { const o = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], pa = (p.y >= YC) === keepAbove, qa = (q.y >= YC) === keepAbove; if (pa) o.push(p); if (pa !== qa) { const t = (YC - p.y) / (q.y - p.y); o.push(p.clone().lerp(q, t)); } } return o; };
      const clipAt = (pts, yc, keepAbove) => { const o = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], pa = (p.y >= yc) === keepAbove, qa = (q.y >= yc) === keepAbove; if (pa) o.push(p); if (pa !== qa) { const t = (yc - p.y) / (q.y - p.y); o.push(p.clone().lerp(q, t)); } } return o; };
      const lowerR = clip(rr, false);
      mesh(cap(clipAt(lowerR, 0.5, false), V3(-1, 0, 0)), M.plastic(0x141516, 0.6), { parent: shell, name: 'rear lower bumper (black)' });
      mesh(cap(clipAt(lowerR, 0.5, true), V3(-1, 0, 0)), PAINT, { parent: shell, name: 'rear bumper face' });
      // black lower bumper wraps around the rear corners
      for (const s2 of [1, -1]) mesh(surface(sec, subX(XR, XR + 0.32), subV(s2 * vAtY(XR + 0.2, 0.5, 1), s2 * 1), { out, offset: 0.004, skip: (x, v) => sec(x, v).y > 0.5 }), M.plastic(0x141516, 0.6), { parent: shell, name: 'rear corner cladding' });
      ctx.rearUpper = clip(rr, true);
      // B-pillar gloss-black appliqués + A-pillar trim between windshield and door glass
      const bp = part(bodySys, { he: 'עמודי B בשחור מבריק', en: 'Gloss-black B-pillar trims', mat: 'פלסטיק פסנתר שחור', desc: 'כיסוי שחור מבריק על העמוד שבין הדלתות, כדי שהחלונות ייראו כפס זכוכית אחד רציף.' });
      for (const s of [1, -1]) mesh(surface(sec, samples(RD[0] + 0.004, FD[1] - 0.004, 0.01), samples(s * GA_TOP, s * GA_BOT, 0.02), { out, offset: 0.002 }), GLOSSBLK, { parent: bp });
      // black lower body cladding + rocker
      const cl = part(bodySys, { he: 'ספים וחיפוי תחתון', en: 'Rocker panels & lower cladding', mat: 'פלסטיק מצופה + פלדה', desc: 'הסף שבין הגלגלים. הוא מחזק את המרכב ומגן על מארז הסוללה מאבנים בצד.' });
      for (const s of [1, -1]) mesh(surface(sec, samples(AXR + ARCH_R + 0.01, AXF - ARCH_R - 0.01, 0.05), samples(s * 0.75, s * LV.cornerB, 0.012), { out, offset: 0.003 }), M.plastic(0x16171a, 0.45), { parent: cl });
      // front: lower intake + grille mesh + splitter
      const fr = part(bodySys, { he: 'פגוש קדמי, פתח אוויר תחתון וספליטר', en: 'Front fascia, lower intake & splitter', mat: 'פוליפרופילן צבוע + רשת שחורה', desc: 'בחזית אין גריל כמו ברכב בנזין — רק פתח תחתון שמכניס אוויר לרדיאטור של משאבת החום, עם תריסים אקטיביים שנסגרים בנסיעה מהירה.' });
      const fxz = (z) => { let lo = XF - 0.5, hi = XF; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (W(m) > Math.abs(z)) lo = m; else hi = m; } return lo; };
      // wide black lower intake and lip: bands of the nose surface that follow constant heights
      for (const s2 of [1, -1]) {
        mesh(band(XF - 0.34, XF - 0.001, (x) => s2 * vAtY(x, 0.42, 1), (x) => s2 * vAtY(x, 0.28, 1), { offset: 0.004 }), GLOSSBLK, { parent: fr, name: 'lower intake' });
        mesh(band(XF - 0.34, XF - 0.001, (x) => s2 * vAtY(x, 0.28, 1), (x) => s2 * vAtY(x, 0.235, 1), { offset: 0.004 }), M.plastic(0x2a2c30, 0.5), { parent: fr, name: 'lower lip' });
      }
      instances(new THREE.BoxGeometry(0.01, 0.006, 0.7), M.plastic(0x050506, 0.6), Array.from({ length: 7 }, (_, i) => ({ pos: [fxz(0.35) - 0.006, 0.3 + i * 0.016, 0] })), { parent: fr });
      // rear diffuser + reflectors
      const rd = part(bodySys, { he: 'מפזר אוויר אחורי', en: 'Rear diffuser', mat: 'פלסטיק שחור מרקם', desc: 'החלק השחור התחתון בפגוש האחורי. הוא מכוון את זרימת האוויר מתחת לרכב ומקטין גרר.' });
      put(G.box(0.05, 0.05, 1.4, 0.015), M.plastic(0x141516, 0.75), rd, [XR + 0.03, Y0(XR) + 0.0, 0]);
      instances(new THREE.BoxGeometry(0.2, 0.06, 0.008), M.plastic(0x141516, 0.75), [-0.45, -0.15, 0.15, 0.45].map((z) => ({ pos: [XR + 0.09, Y0(XR) + 0.03, z] })), { parent: rd });
      // underbody aero tray
      const ut = part(bodySys, { he: 'מגש תחתון אווירודינמי', en: 'Underbody aero tray', mat: 'פלסטיק מחוזק סיבים', desc: 'כיסוי חלק לכל התחתית. הוא מגן על הסוללה ומאפשר לאוויר לזרום מתחת לרכב בלי מערבולות.' });
      put(new THREE.BoxGeometry(3.7, 0.006, 1.3), M.plastic(0x1d1e20, 0.8), ut, [-0.1, 0.165, 0]);
      // cowl + wipers + washer jets
      const cw = part(bodySys, { he: 'אדן שמשה ומגבים', en: 'Cowl & wipers', mat: 'פלסטיק + פלדה קפיצית + גומי', desc: 'המגבים מוסתרים מתחת לקצה מכסה התא הקדמי. מגב אחד גדול מנקה כמעט את כל השמשה, ומתחתיו שני מתזי מים.' });
      put(new THREE.BoxGeometry(0.1, 0.012, 1.5), TRIM, cw, [COWL + 0.03, Yb(COWL) + 0.035, 0]);
      for (const v0 of [-0.22, 0.08]) { const pts = []; for (let k = 0; k <= 6; k++) pts.push(onBody(COWL - 0.03 - k * 0.055, v0 - k * 0.018, 0.014)); put(G.tube(pts, 0.007, 24, 6), M.rubber(), cw); put(G.cyl(0.015, 0.015, 0.02, 12, 'y'), TRIM, cw, onBody(COWL - 0.02, v0, 0.01).toArray()); }
      for (const z of [-0.3, 0.3]) put(G.cyl(0.008, 0.01, 0.015, 8, 'y'), TRIM, cw, [COWL + 0.08, Yb(COWL) + 0.04, z]);
    }

    // ================================================================== FRUNK + LIFTGATE
    {
      // frunk lid: hinged at its rear edge, opens nose-up
      const fp = V3(FR[0], Yt(FR[0]) - 0.012, 0);
      const fl = part(bodySys, { he: 'מכסה תא המטען הקדמי (frunk)', en: 'Frunk lid', mat: 'אלומיניום + צבע', desc: 'במקום מכסה מנוע: מכסה אלומיניום קל מעל תא מטען קדמי של כ־117 ליטר. נפתח מהמסך, מהאפליקציה או בלחיצה כפולה על המפתח.' });
      fl.position.copy(fp);
      const lg = surface(sec, subX(FR[0] + GAP, FR[1] - GAP), subV(-0.405, 0.405), { out, thickness: 0.014 });
      lg.translate(-fp.x, -fp.y, 0); mesh(lg, [PAINT, M.black()], { parent: fl, name: 'lid skin' });
      const li = surface(sec, samples(FR[0] + 0.07, FR[1] - 0.08, 0.06), samples(-0.33, 0.33, 0.03, [0]), { out, offset: -0.03, thickness: 0.01 }); li.translate(-fp.x, -fp.y, 0);
      mesh(li, M.plastic(0x1a1b1e, 0.8), { parent: fl, name: 'lid liner' });
      for (const z of [-0.3, 0.3]) put(G.box(0.05, 0.02, 0.02, 0.005), M.steel(), fl, [0.02, -0.02, z]);
      ctx.frunk = fl;
      K.toggle('frunk', { he: 'תא מטען קדמי', key: 'f', seconds: 1.4 }, (t) => { fl.rotation.z = 1.0 * Math.sin((t * PI) / 2); });
      const tub = part(bodySys, { he: 'אמבט תא המטען הקדמי', en: 'Frunk tub', mat: 'פלסטיק יצוק עמיד מים', desc: 'אמבט פלסטיק עמוק עם ניקוז. מתחתיו: מצבר 16V, משאבת החום ומיכל נוזל השמשות.' });
      const tb = M.plastic(0x16171a, 0.85);
      put(new THREE.BoxGeometry(0.72, 0.02, 0.84), tb, tub, [1.56, 0.56, 0]);
      put(new THREE.BoxGeometry(0.02, 0.3, 0.84), tb, tub, [1.2, 0.71, 0]); put(new THREE.BoxGeometry(0.02, 0.18, 0.84), tb, tub, [1.85, 0.65, 0]);
      for (const z of [-0.42, 0.42]) put(new THREE.BoxGeometry(0.72, 0.22, 0.02), tb, tub, [1.56, 0.67, z]);
      put(G.box(0.6, 0.012, 0.7, 0.004), M.carpet(0x1c1d21), tub, [1.56, 0.572, 0]);
      put(G.cyl(0.012, 0.012, 0.02, 10, 'y'), M.rubber(), tub, [1.56, 0.55, 0.3]);

      // liftgate: hinged at the roof, carries the backlight and the upper tail face
      const gp = V3(LG, Yt(LG) - 0.01, 0);
      const gate = part(bodySys, { he: 'דלת תא המטען האחורית', en: 'Power liftgate', mat: 'אלומיניום/פלדה + צבע', desc: 'דלת אחורית חשמלית שנפתחת עם שני בוכנות חשמליות. נושאת את השמשה האחורית, את פס האור האחורי ואת הכיתוב TESLA.' });
      gate.position.copy(gp);
      const gx = subX(XR, LG - GAP), gv = subV(-0.43, 0.43);
      const gs = surface(sec, gx, gv, { out, thickness: 0.016, skip: (x, v) => { const a = Math.abs(v); return !inGate(x, a) || (x < LG - 0.03 && x > BL_END + 0.04 && a < aD(x) - 0.025); } }); gs.translate(-gp.x, -gp.y, 0);
      mesh(gs, [PAINT, M.black()], { parent: gate, name: 'gate skin' });
      const ru = ctx.rearUpper.map((p) => p.clone().sub(gp)); mesh(cap(ru, V3(-1, 0, 0)), PAINT, { parent: gate, name: 'gate rear face' });
      const gi = part(gate, { he: 'חיפוי פנימי של דלת תא המטען', en: 'Liftgate inner trim', mat: 'פלסטיק + בד', desc: 'חיפוי פנימי עם ידית משיכה ונורת תאורה לתא המטען.' });
      put(G.box(0.03, 0.34, 1.1, 0.01), M.plastic(0x1a1b1e, 0.8), gi, [XR - gp.x + 0.03, 0.82 - gp.y, 0]);
      put(G.tube([V3(XR - gp.x + 0.05, 0.7 - gp.y, -0.08), V3(XR - gp.x + 0.08, 0.68 - gp.y, 0), V3(XR - gp.x + 0.05, 0.7 - gp.y, 0.08)], 0.01, 10, 6), M.plastic(0x2a2b2e, 0.5), gi);
      ctx.gate = gate;
      const st = part(bodySys, { he: 'בוכנות חשמליות לדלת האחורית (2)', en: 'Liftgate power struts (×2)', mat: 'פלדה + מנוע חשמלי קטן', desc: 'שתי בוכנות עם מנוע חשמלי וקפיץ פנימי. הן מרימות את הדלת וגם עוצרות אותה בגובה שנקבע במסך.' });
      const struts = [];
      for (const s of [1, -1]) { const m1 = put(G.cyl(0.016, 0.016, 0.42, 12, 'y'), M.metal(0x2b2d31, 0.4), st, [0, 0, 0]); const m2 = put(G.cyl(0.009, 0.009, 0.4, 10, 'y'), M.chrome(), st, [0, 0, 0]); struts.push({ m1, m2, s }); }
      const strutAt = (ang) => {
        const top = V3(-1.4 - gp.x, 1.35 - gp.y, 0).applyAxisAngle(V3(0, 0, 1), ang).add(gp);
        for (const { m1, m2, s } of struts) {
          const a = V3(-1.7, 0.85, s * 0.6), b = V3(top.x, top.y, s * 0.6), d = b.clone().sub(a), L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
          m1.position.copy(a).addScaledVector(d, 0.25); m1.quaternion.copy(q); m2.position.copy(a).addScaledVector(d, 0.72); m2.quaternion.copy(q); m2.scale.y = L / 0.8;
        }
      };
      K.toggle('liftgate', { he: 'דלת אחורית', key: 't', seconds: 1.8 }, (t) => { const a = -1.15 * Math.sin((t * PI) / 2); gate.rotation.z = a; strutAt(a); });
      // cargo floor
      const cf = part(bodySys, { he: 'רצפת תא המטען ותא תחתון', en: 'Cargo floor & sub-trunk', mat: 'לוח מעוטף שטיח', desc: 'רצפה שטוחה שמתחתיה תא אחסון עמוק נוסף — כי אין מאחור מיכל דלק או צינור פליטה.' });
      put(G.box(0.9, 0.02, 1.1, 0.006), M.carpet(0x18191c), cf, [-1.95, 0.68, 0]);
      put(G.box(0.6, 0.25, 0.9, 0.02), M.plastic(0x16171a, 0.85), cf, [-1.95, 0.55, 0]);
      for (const z of [-0.5, 0.5]) put(G.tube([V3(-1.75, 0.7, z), V3(-1.75, 0.73, z), V3(-1.65, 0.73, z), V3(-1.65, 0.7, z)], 0.006, 8, 5), M.steel(), cf);
    }

    // ================================================================== DOORS
    const glassSys = sys('glass');
    const doors = [];
    {
      const doorsSys = sys('doors');
      for (const s of [1, -1]) for (const front of [true, false]) {
        const r = front ? FD : RD, inD = front ? inFD : inRD, x0 = r[0], x1 = r[1];
        const posHe = front ? 'קדמית' : 'אחורית', sHe = s > 0 ? 'ימנית' : 'שמאלית';
        const hp = onBody(x0, vAtY(x0, 0.75, s));
        const pivot = V3(x0 - 0.01, 0.75, hp.z - s * 0.02);
        const door = part(doorsSys, { he: `דלת ${posHe} ${sHe}`, en: `${front ? 'Front' : 'Rear'} ${sideEn(s)} door`, mat: 'פלדה/אלומיניום + צבע', desc: `דלת ${posHe} ${sHe} עם חלון ללא מסגרת: הזכוכית יורדת מעט כשפותחים כדי להשתחרר מהאטם. ${front ? 'הידית שקועה ונפתחת בלחיצת אגודל.' : 'בדלתות האחוריות ידית פנימית מכנית נוספת לחירום.'}` });
        door.position.copy(pivot);
        const tr = (g) => { g.translate(-pivot.x, -pivot.y, -pivot.z); return g; };
        const dxs = subX(x0 - GAP, x1 + GAP);
        const skin = part(door, { he: 'פח חיצוני', en: 'Outer skin', mat: 'פלדה + צבע', desc: 'הפח הצבוע של הדלת, עם קו כתף עדין.' });
        mesh(tr(surface(sec, dxs, subV(s * (GA_BOT + 0.001), s * (LV.side - GAP)), { out, thickness: 0.012, skip: (x, v) => !inD(x, Math.abs(v)) })), [PAINT, M.black()], { parent: skin });
        const gl = part(glassSys, { he: `חלון ${posHe} ${sHe}`, en: `${front ? 'Front' : 'Rear'} ${sideEn(s)} window`, mat: 'זכוכית מרובדת אקוסטית', desc: 'חלון ללא מסגרת מזכוכית מרובדת כפולה שמשתיקה את רעשי הרוח.' });
        mesh(tr(band(x0 - GAP, x1 + GAP, (x) => s * (front ? Math.min(GA_BOT - 0.001, Math.max(GA_TOP + 0.002, aP(x) + 0.031)) : GA_TOP + 0.002), () => s * (GA_BOT - 0.001), { thickness: 0.006 })), glassMat(), { parent: gl });
        door.add(gl); gl.userData.sysOverride = 'glass';
        // inner trim (door card) with armrest, pull handle, speaker, pocket, switches
        const card = part(door, { he: 'חיפוי פנימי', en: 'Door card', mat: 'עור טבעוני + בד + אלומיניום', desc: 'חיפוי פנימי עם משענת יד, רמקול, כיס, תאורת אווירה ומתגי חלון.' });
        mesh(tr(surface(sec, samples(Math.max(x0, 0.86) - 0.03, x1 + 0.03, 0.04), samples(s * (A_G + 0.01), s * 0.76, 0.03), { out, offset: -0.055, thickness: 0.012 })), [M.leather(0x1b1c1f), M.black()], { parent: card });
        const cx = (x0 + x1) / 2, ci = (x, y) => onBody(x, vAtY(x, y, s), -0.07).sub(pivot);
        const arm = ci(cx + 0.05, 0.86);
        put(G.soft(Math.abs(x1 - x0) * 0.55, 0.05, 0.09, { r: 0.02, seg: 4 }), M.leather(0x26272a), card, [arm.x, arm.y, arm.z - s * 0.03]);
        const amb = ci(cx, 0.97); put(new THREE.BoxGeometry(Math.abs(x1 - x0) * 0.7, 0.006, 0.006), new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0x3388ff, emissiveIntensity: 0.6 }), card, [amb.x, amb.y, amb.z - s * 0.004], null, { name: 'ambient strip' });
        const spk = ci(cx + 0.12, 0.6); put(G.cyl(0.07, 0.07, 0.008, 28, 'z'), M.plastic(0x0e0f10, 0.6), card, [spk.x, spk.y, spk.z - s * 0.006]);
        put(G.cyl(0.055, 0.055, 0.004, 28, 'z'), M.satin(), card, [spk.x, spk.y, spk.z - s * 0.011]);
        if (front) K.panel(card, { pos: ci(cx - 0.05, 0.9).add(V3(0, 0.03, -s * 0.05)).toArray(), normal: [0, 1, 0], up: [1, 0, 0], w: 0.12, h: 0.05, plate: M.gloss(0x0e0e10), buttons: [0, 1, 2, 3].map((i) => ({ x: -0.042 + i * 0.028, y: 0, w: 0.02, h: 0.024, d: 0.005, kind: 'rocker', color: 0x1a1b1e })) });
        // flush exterior handle
        const hx = x1 + 0.13 * Math.sign(x0 - x1), hpnt = onBody(hx, vAtY(hx, 0.93, s), 0.001).sub(pivot);
        const hd = part(door, { he: 'ידית שקועה', en: 'Flush door handle', mat: 'פלסטיק שחור מבריק + מתג', desc: 'ידית שקועה בגוף: לוחצים בצד הרחב עם האגודל, והצד השני בולט החוצה ומאפשר למשוך. מקטינה גרר ורעש.' });
        put(G.box(0.17, 0.035, 0.012, 0.01), GLOSSBLK, hd, [hpnt.x, hpnt.y, hpnt.z]);
        put(G.box(0.05, 0.03, 0.008, 0.008), M.plastic(0x1e1f22, 0.4), hd, [hpnt.x + 0.055 * Math.sign(x0 - x1), hpnt.y, hpnt.z + s * 0.004]);
        // mirror on the front doors
        if (front) {
          const mp = onBody(0.82, vAtY(0.82, 1.0, s), 0.01).sub(pivot);
          const mir = part(door, { he: `מראה צד ${sHe}`, en: `${sideEn(s)} mirror`, mat: 'פלסטיק צבוע + זכוכית מחוממת', desc: 'מראה חשמלית מתקפלת ומחוממת. הבית שלה מעוצב בצורה אווירודינמית כדי להקטין רעש רוח.' });
          put(G.cyl(0.018, 0.022, 0.08, 10, 'z'), TRIM, mir, [mp.x, mp.y, mp.z + s * 0.04]);
          put(G.soft(0.15, 0.13, 0.22, { r: 0.05, seg: 6, deform: (p) => { p.x += (p.z * s + 0.5) * -0.02; return p; } }), PAINT, mir, [mp.x - 0.04, mp.y + 0.02, mp.z + s * 0.17]);
          put(G.box(0.008, 0.11, 0.19, 0.03), M.chrome(), mir, [mp.x - 0.115, mp.y + 0.02, mp.z + s * 0.17]);
        }
        doors.push({ door, s, front });
      }
      K.toggle('doors', { he: 'דלתות', key: 'd', seconds: 1.6 }, (t) => { const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; for (const d of doors) d.door.rotation.y = d.s * e * (d.front ? 1.1 : 1.15); });
    }

    // ================================================================== FIXED GLASS
    {
      const gpart = (he, en, desc, xr, vr, skipFn, off = 0) => { const g = part(glassSys, { he, en, mat: 'זכוכית מרובדת', desc }); mesh(surface(sec, subX(xr[0], xr[1]), subV(vr[0], vr[1]), { out, offset: off, thickness: 0.006, skip: skipFn }), glassMat(0.55), { parent: g }); return g; };
      const wsg = gpart('שמשה קדמית', 'Windshield', 'שמשה מרובדת אקוסטית עם ציפוי שמסנן קרינה. בחלק העליון: תא המצלמות של האוטופיילוט.', [COWL, WS_TOP], [-WSA, WSA], (x, v) => !inWS(x, Math.abs(v)));
      wsg.clear(); mesh(band(WS_TOP, COWL, (x) => -(aP(x) - 0.003), (x) => aP(x) - 0.003, { thickness: 0.006 }), glassMat(0.55), { parent: wsg });
      const rg = gpart('גג זכוכית', 'Glass roof', 'לוח זכוכית ענק אחד מעל כל הנוסעים, עם ציפוי שמחזיר UV וחום. אין לו וילון — הציפוי עושה את העבודה.', [WS_TOP - 0.04, ROOF_END + 0.05], [-0.163, 0.163]);
      rg.children[0].material = M.glass(0x020304, 0.9);
      for (const s of [1, -1]) {
        const sl = s > 0 ? [GA_TOP + 0.003, GA_BOT - 0.003] : [-(GA_BOT - 0.003), -(GA_TOP + 0.003)];
        const qg = gpart(`חלון אחורי קבוע ${sideHe(s)}`, `Rear quarter glass (${sideEn(s)})`, 'חלון קבוע מאחורי הדלת האחורית, שמשלים את קו החלונות עד העמוד האחורי.', [QG[0], QG[1]], sl, (x, v) => !inQG(x, Math.abs(v)));
        qg.clear(); mesh(band(QG[1], QG[0], () => s * (GA_BOT - 0.001), (x) => s * Math.min(GA_BOT - 0.001, x < LG ? Math.max(GA_TOP + 0.002, aD(x) + 0.036) : GA_TOP + 0.002), { thickness: 0.006 }), glassMat(0.55), { parent: qg });
      }
      const bl = part(glassSys, { he: 'שמשה אחורית', en: 'Rear window (liftgate glass)', mat: 'זכוכית מחוסמת + חוטי חימום', desc: 'השמשה שבדלת האחורית, עם חוטי חימום להפשרה ואנטנות מוטמעות.' });
      mesh(band(BL_END + 0.04, LG - 0.03, (x) => -(aD(x) - 0.016), (x) => aD(x) - 0.016, { offset: 0.002, thickness: 0.005 }).translate(-ctx.gate.position.x, -ctx.gate.position.y, 0), glassMat(0.6), { parent: bl });
      ctx.gate.add(bl); bl.userData.sysOverride = 'glass';
      // frit bands
      const frit = part(bodySys, { he: 'מסגרות קרמיות שחורות', en: 'Black ceramic frit bands', mat: 'קרמיקה מודפסת על זכוכית', desc: 'פסים שחורים בשולי השמשות שמסתירים את הדבק ומגנים עליו מקרינה.' });
      for (const sg of [1, -1]) mesh(band(WS_TOP, COWL, (x) => sg * (aP(x) - 0.05), (x) => sg * (aP(x) - 0.003), { offset: 0.008 }), GLOSSBLK, { parent: frit });
      mesh(band(COWL - 0.05, COWL, (x) => -(aP(x) - 0.003), (x) => aP(x) - 0.003, { offset: 0.008 }), GLOSSBLK, { parent: frit });
      for (const sg of [1, -1]) mesh(band(BL_END + 0.04, LG - 0.03, (x) => sg * (aD(x) - 0.06), (x) => sg * (aD(x) - 0.016), { offset: 0.006 }).translate(-ctx.gate.position.x, -ctx.gate.position.y, 0), GLOSSBLK, { parent: ctx.gate });
      // (the glass roof is tinted almost black, as on the real car; no separate frit band)
      // body-colour pillar covers over the stepped hole edges (A-pillars and D-pillars)
      const pc = part(bodySys, { he: 'עמודי A ו־D (כיסויים חלקים)', en: 'A- and D-pillar covers', mat: 'פלדה + צבע', desc: 'העמודים שמחזיקים את הגג משני צידי השמשה הקדמית והאחורית. הם דקים במיוחד כדי לא להסתיר את שדה הראייה.' });
      for (const sg of [1, -1]) {
        mesh(band(WS_TOP, COWL, (x) => sg * (aP(x) - 0.006), (x) => sg * (aP(x) + 0.042), { offset: 0.004 }), PAINT, { parent: pc });
        mesh(band(BL_END + 0.04, LG - 0.01, (x) => sg * (aD(x) + 0.018), (x) => sg * Math.min(GA_BOT, aD(x) + 0.05), { offset: 0.004 }), PAINT, { parent: pc });
      }
      // roof header between windshield and roof glass
      mesh(surface(sec, subX(WS_TOP, WS_TOP - 0.04), subV(-0.165, 0.165), { out, offset: 0.0015 }), GLOSSBLK, { parent: frit });
    }

    // ================================================================== LIGHTS
    const lampMat = (c, i = 0.06, o = 0.95) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.25, metalness: 0, transparent: o < 1, opacity: o });
    const L = { drl: lampMat(0xf4f8ff, 0.15), head: lampMat(0xffffff, 0.05), tail: lampMat(0xff1a10, 0.12), brake: lampMat(0xff2010, 0.06), amber: lampMat(0xffa21a, 0.05), rev: lampMat(0xffffff, 0.04), cabin: lampMat(0xffe6c0, 0.0), port: lampMat(0x2cff7a, 0.2) };
    const frontX = (z) => { let lo = XF - 0.5, hi = XF; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (W(m) > Math.abs(z)) lo = m; else hi = m; } return lo; };
    const rearX = (z) => { let lo = XR, hi = XR + 0.3; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (W(m) > Math.abs(z)) hi = m; else lo = m; } return hi; };
    {
      const lights = sys('lights');
      const bar = part(lights, { he: 'פס אור קדמי לרוחב החזית', en: 'Front full-width light bar', mat: 'נורות LED מתחת לעדשה', desc: 'פס אור דק שחוצה את כל החזית — סימן ההיכר של ג׳וניפר. משמש כאור יום ומשנה צבע לכתום כאיתות בקצוות.' });
      const barPts = []; for (let i = 0; i <= 48; i++) { const sd = i < 24 ? -1 : 1, u = sd < 0 ? i / 24 : (48 - i) / 24, x = lerp(XF - 0.5, XF - 0.002, u); barPts.push(onBody(x, sd * vAtY(x, Yb(x) - 0.05 - 0.02 * u, 1), 0.003)); }
      put(G.tube(barPts, 0.0045, 96, 6), L.drl, bar);
      put(G.tube(barPts.map((p) => p.clone().add(V3(-0.004, -0.008, 0))), 0.006, 96, 5), GLOSSBLK, bar);
      for (const s of [1, -1]) {
        const z = s * 0.72, hx = frontX(z), hy = Yb(hx) - 0.085, ang = Math.atan2(-(frontX(z + 0.01 * s) - hx), 0.01) * -s;
        const hl = part(lights, { he: `פנס ראשי ${sideHe(s)}`, en: `Headlamp (${sideEn(s)})`, mat: 'פוליקרבונט + מטריצת LED', desc: 'פנס צר ונסתר בפינת הפגוש, מתחת לקצה פס האור, עם עדשת הקרנה ומטריצת LED שמכבה אזורים כדי לא לסנוור נהגים ממול.' });
        const g = new THREE.Group(); g.position.set(hx, hy, z); g.rotation.y = s * Math.atan2(W(hx - 0.02) - W(hx), 0.02) * 0 - s * 0.45; hl.add(g);
        put(G.soft(0.03, 0.05, 0.22, { r: 0.015, seg: 4 }), GLOSSBLK, g, [-0.008, 0, 0]);
        for (const dz of [-0.05, 0.04]) { put(G.cyl(0.018, 0.018, 0.014, 20, 'x'), M.clearLens(), g, [0.006, 0, dz]); put(G.cyl(0.013, 0.013, 0.01, 18, 'x'), L.head, g, [0.0, 0, dz]); }
        put(new THREE.BoxGeometry(0.006, 0.005, 0.16), L.amber, g, [0.008, -0.02, 0]);
        void ang;
        // tail lamp (body corner, C-shape) + reverse lamp
        const tz = s * 0.78, tl = part(lights, { he: `פנס אחורי ${sideHe(s)}`, en: `Tail lamp (${sideEn(s)})`, mat: 'אקריליק אדום + LED', desc: 'פנס אחורי בצורת C עם אור ״מרחף״ שנוצר מהשתקפות פנימית. משתלב בפס האחורי.' });
        for (let k = 0; k < 3; k++) { const zz = s * (0.66 + k * 0.08); const x = rearX(zz); put(G.box(0.03, 0.045 - k * 0.008, 0.085, 0.01), L.tail, tl, [x + 0.006, 1.02 - k * 0.006, zz], [0, -s * (k * 0.35), 0]); }
        put(G.box(0.02, 0.012, 0.22, 0.004), L.brake, tl, [rearX(s * 0.72) + 0.01, 0.99, s * 0.72], [0, -s * 0.3, 0]);
        put(G.box(0.02, 0.035, 0.1, 0.01), L.rev, tl, [XR + 0.004, 0.47, s * 0.58]);
        put(G.box(0.012, 0.02, 0.1, 0.006), M.lens(0xb01010, 0.8), tl, [XR + 0.004, 0.36, s * 0.7]);
      }
      // rear light bar on the liftgate (rides with the gate)
      const rb = part(lights, { he: 'פס אור אחורי', en: 'Rear light bar', mat: 'אקריליק אדום + LED', desc: 'פס אדום דק לרוחב הדלת האחורית שמחבר בין שני הפנסים.' });
      const gpX = ctx.gate.position.x, gpY = ctx.gate.position.y;
      const spPts = []; for (let i = 0; i <= 40; i++) { const z = -0.84 + (i / 40) * 1.68; spPts.push(V3(rearX(z) - 0.035 * (1 - Math.pow(Math.abs(z) / 0.84, 4)) - gpX, 1.075 - gpY, z)); }
      const spoiler = part(rb, { he: 'ספוילר שחור אחורי (״ברווז״)', en: 'Black ducktail spoiler', mat: 'פלסטיק שחור מבריק', desc: 'פס שחור עבה בראש הדלת האחורית שבולט לאחור ומשמש כספוילר. בתוכו הכיתוב TESLA, ובקצוותיו הפנסים האחוריים.' });
      const spm = put(G.tube(spPts, 0.065, 60, 14), GLOSSBLK, spoiler); void spm;
      put(G.tube(spPts.map((p) => p.clone().add(V3(-0.03, -0.06, 0))), 0.005, 60, 5), L.tail, rb, null, null, { name: 'light strip' });
      ctx.gate.add(rb); rb.userData.sysOverride = 'lights';
      const cb = part(lights, { he: 'פנס בלימה עליון', en: 'Centre high-mount stop lamp', mat: 'LED', desc: 'פנס בלימה שלישי בקצה העליון של השמשה האחורית.' });
      put(new THREE.BoxGeometry(0.03, 0.01, 0.35), L.brake, cb, [LG - 0.02 - ctx.gate.position.x, Yt(LG - 0.02) - 0.01 - ctx.gate.position.y, 0]);
      ctx.gate.add(cb); cb.userData.sysOverride = 'lights';
      const cab = part(lights, { he: 'תאורת תא ואווירה', en: 'Cabin & ambient lights', mat: 'LED RGB', desc: 'פס אור RGB לאורך לוח המחוונים והדלתות, ומנורות קריאה בתקרה. הצבע נקבע במסך.' });
      put(new THREE.BoxGeometry(0.006, 0.006, 1.4), L.cabin, cab, [0.64, 0.86, 0]);
      for (const x of [0.1, -0.85]) put(G.cyl(0.03, 0.03, 0.008, 16, 'y'), L.cabin, cab, [x, Yt(x) - 0.04, 0.2]);
      K.toggle('lights', { he: 'פנסים', key: 'l', seconds: 0.4, night: true }, (t) => { L.drl.emissiveIntensity = 0.15 + t * 3; L.head.emissiveIntensity = 0.05 + t * 4; L.tail.emissiveIntensity = 0.12 + t * 2.5; L.amber.emissiveIntensity = 0.05 + t * 0.4; });
      K.toggle('cabin', { he: 'תאורת תא', key: 'i', seconds: 0.4, night: true }, (t) => { L.cabin.emissiveIntensity = t * 2.5; });
    }

    // ================================================================== INSIGNIA + CHARGE PORT
    {
      const ins = sys('insignia');
      const word = part(ins, { he: 'כיתוב TESLA על הדלת האחורית', en: 'TESLA wordmark', mat: 'אותיות כרום כהה', desc: 'בג׳וניפר הוחלף סמל ה־T בכיתוב TESLA ברוחב הדלת האחורית.' });
      const wt = K.textTexture('T E S L A', { font: '700 120px "Helvetica Neue", Arial', color: '#8d9298', pad: 10 });
      put(new THREE.PlaneGeometry(0.55, 0.55 / wt.aspect), M.decal(wt.tex, { metalness: 0.8, roughness: 0.25 }), word, [rearX(0) - 0.1 - ctx.gate.position.x, 1.075 - ctx.gate.position.y, 0], [0, -PI / 2, 0], { cast: false });
      ctx.gate.add(word); word.userData.sysOverride = 'insignia';
      const plateTex = K.canvasTexture(520, 112, (g, w, h) => { g.fillStyle = '#f7d117'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, 70, h); g.fillStyle = '#fff'; g.font = '700 30px Arial'; g.textAlign = 'center'; g.fillText('IL', 35, 92); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5); g.fillStyle = '#111'; g.font = '800 82px Arial'; g.fillText('123-45-678', 292, 86); });
      const pl = part(ins, { he: 'לוחיות רישוי (2)', en: 'Licence plates (×2)', mat: 'אלומיניום מוטבע', desc: 'לוחיות רישוי ישראליות צהובות, עם פס כחול ו־IL בצד שמאל.' });
      put(new THREE.BoxGeometry(0.006, 0.12, 0.53), M.plastic(0x111214, 0.5), pl, [XF - 0.0, 0.48, 0]);
      const rp = put(new THREE.PlaneGeometry(0.52, 0.11), M.decal(plateTex), pl, [XR - 0.012, 0.45, 0], [0, -PI / 2, 0], { cast: false }); void rp;
      const fp = put(new THREE.PlaneGeometry(0.52, 0.11), M.decal(plateTex), pl, [XF + 0.004, 0.48, 0], [0, PI / 2, 0], { cast: false }); void fp;
      // charge port (left rear, behind a flap in the tail-lamp corner)
      const cpx = -2.1, cpy = 0.93, cpp = onBody(cpx, vAtY(cpx, cpy, -1)), cpn = nrm(cpx, vAtY(cpx, cpy, -1));
      const port = part(ins, { he: 'שקע טעינה', en: 'Charge port', mat: 'פלסטיק + מגעי נחושת + LED', desc: 'שקע טעינה מהיר (NACS/CCS לפי שוק) מאחורי דלתית קטנה בפינה השמאלית האחורית. טבעת LED משנה צבע: כחול מוכן, ירוק טוען, אדום תקלה.' });
      port.userData.sysOverride = 'insignia';
      const pg = new THREE.Group(); pg.position.copy(cpp); pg.quaternion.setFromUnitVectors(V3(0, 0, 1), cpn); port.add(pg);
      put(G.cyl(0.055, 0.05, 0.05, 28, 'z'), M.plastic(0x0d0d0f, 0.6), pg, [0, 0, -0.03]);
      put(G.torus(0.046, 0.004, 8, 32, PI * 2, 'z'), L.port, pg, [0, 0, -0.004]);
      for (const [px, py, r] of [[-0.016, 0.012, 0.007], [0.016, 0.012, 0.007], [0, -0.018, 0.005], [-0.01, -0.006, 0.004], [0.01, -0.006, 0.004]]) put(G.cyl(r, r, 0.02, 10, 'z'), M.copper(), pg, [px, py, -0.012]);
      const flapPivot = new THREE.Group(); flapPivot.position.set(0.06, 0, 0.003); pg.add(flapPivot);
      const flap = part(ins, { he: 'דלתית שקע הטעינה', en: 'Charge-port flap', mat: 'פלסטיק צבוע', desc: 'דלתית ממונעת שנפתחת כשמקרבים את המטען או בלחיצה על המסך.' });
      flapPivot.add(flap); flap.userData.sysOverride = 'insignia';
      put(G.soft(0.13, 0.13, 0.008, { r: 0.004, seg: 3 }), PAINT, flap, [-0.065, 0, 0]);
      // charging cable + NACS connector that appears when the port is open
      const cable = new THREE.Group(); pg.add(cable);
      put(G.soft(0.05, 0.07, 0.16, { r: 0.02, seg: 4 }), M.plastic(0xe9eaec, 0.4), cable, [0, -0.005, 0.11]);
      put(G.tube([V3(0, -0.02, 0.18), V3(0, -0.15, 0.32), V3(0, -0.55, 0.45), V3(0, -0.95, 0.5)], 0.012, 30, 8), M.plastic(0x18191c, 0.5), cable);
      put(G.box(0.012, 0.006, 0.02, 0.003), M.lens(0x2c8cff, 0.8), cable, [0, 0.03, 0.12]);
      K.toggle('charge', { he: 'טעינה', key: 'c', seconds: 1.0 }, (t) => { flapPivot.rotation.y = 1.9 * Math.min(1, t * 1.6); cable.visible = t > 0.7; L.port.emissiveIntensity = t > 0.7 ? 2.5 : 0.2; });
    }

    // ================================================================== WHEELS
    const wheelSpots = [];
    for (const x of [AXF, AXR]) for (const s of [1, -1]) wheelSpots.push({ x, s, front: x > 0 });
    const spinners = [];
    {
      const wheels = sys('wheels');
      const RIM = 0.2413;
      const side = (sg) => [[RIM + 0.004, 0.105], [RIM + 0.012, 0.112], [0.27, 0.121], [0.31, 0.126], [0.335, 0.122], [0.35, 0.112], [0.355, 0.1]].map(([r, w]) => [r, sg * w]);
      const tireGeo = G.lathe([...side(-1), [0.3565, -0.07], [0.357, 0], [0.3565, 0.07], ...side(1).reverse()], 96, 'z');
      const tireMat = M.tire(); tireMat.side = THREE.DoubleSide;
      const grooves = G.merge([-0.065, -0.02, 0.025, 0.07].map((w) => { const g = G.torus(0.3555, 0.006, 4, 96, PI * 2, 'z'); g.translate(0, 0, w); return g; }));
      const sipe = new THREE.BoxGeometry(0.006, 0.004, 0.03);
      // sidewall lettering ring (outer face only)
      const swTex = K.canvasTexture(1024, 1024, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.translate(w / 2, h / 2); g.fillStyle = '#3b3b3e'; g.font = '700 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const put2 = (txt, a0) => { const chars = txt.split(''); const step = 0.052; chars.forEach((c, i) => { const a = a0 + (i - chars.length / 2) * step; g.save(); g.rotate(a); g.fillText(c, 0, -0.43 * w); g.restore(); }); };
        put2('TESLA • ALL SEASON', 0); put2('255/45 R19 104W XL', PI); put2('M+S', PI / 2); put2('E4 0213', -PI / 2);
      });
      const swGeo = new THREE.RingGeometry(0.27, 0.345, 96, 1);
      { const p = swGeo.attributes.position, uv = swGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * 0.39), 0.5 + p.getY(i) / (2 * 0.39)); }
      const swMat = M.decal(swTex, { roughness: 0.85, clearcoat: 0 });
      // rim: barrel + aero face with 5 twin-spoke windows
      const barrel = G.lathe([[RIM - 0.006, -0.12], [RIM + 0.012, -0.118], [RIM, -0.1], [RIM - 0.03, -0.05], [RIM - 0.03, 0.06], [RIM, 0.1], [RIM + 0.012, 0.115], [RIM - 0.004, 0.12]], 64, 'z');
      // 19" aero wheel with 10 swept blades (Juniper style): holes are curved windows between the blades
      const faceShape = new THREE.Shape(); faceShape.absarc(0, 0, RIM + 0.006, 0, PI * 2, false);
      const NB = 5, tw = 0.75, r0 = 0.085, r1 = 0.22;
      for (let k = 0; k < NB; k++) {
        const a0 = (k / NB) * PI * 2, wA = (PI * 2 / NB) * 0.72, hole = new THREE.Path(), pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10, r = lerp(r0, r1, t), a = a0 + tw * t * t; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        for (let i = 10; i >= 0; i--) { const t = i / 10, r = lerp(r0 + 0.012, r1, t), a = a0 + wA * (0.35 + 0.65 * t) + tw * t * t; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        hole.moveTo(...pts[0]); for (const p of pts.slice(1)) hole.lineTo(...p); hole.closePath(); faceShape.holes.push(hole);
      }
      const bladeGeo = G.merge(Array.from({ length: NB }, (_, k) => { const a0 = (k / NB) * PI * 2, wA = (PI * 2 / NB) * 0.72; const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8, r = lerp(0.1, 0.215, t), a = a0 + wA * (0.5 + 0.2 * t) + tw * t * t; pts.push(V3(Math.cos(a) * r, Math.sin(a) * r, 0.097)); } return G.tube(pts, 0.009, 16, 6); }));
      const faceGeo = new THREE.ExtrudeGeometry(faceShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 40 }); faceGeo.translate(0, 0, 0.088);
      const rimMat = M.metal(0xa3a8ae, 0.3), lipMat = M.metal(0x8f949a, 0.3);
      const logoTex = K.textTexture('T', { font: '800 220px Arial', color: '#e9ecef', bg: '#1b1d20', w: 256, h: 256 });
      const nutGeo = G.merge(Array.from({ length: 5 }, (_, k) => { const a = (k / 5) * PI * 2; return G.at(G.hexNut(0.011, 0.02), [Math.cos(a) * 0.057, Math.sin(a) * 0.057, 0.09], [PI / 2, 0, 0]); }));
      const disc = G.merge([G.cyl(0.178, 0.178, 0.026, 48, 'z'), G.cyl(0.09, 0.09, 0.05, 32, 'z').translate(0, 0, 0.02)]);
      const hubGeo = G.cyl(0.095, 0.1, 0.06, 32, 'z').translate(0, 0, 0.07);
      for (const w of wheelSpots) {
        const name = `${w.front ? 'קדמי' : 'אחורי'} ${sideHe(w.s)}`, en = `${w.front ? 'Front' : 'Rear'} ${sideEn(w.s)}`;
        const wp = part(wheels, { he: `גלגל ${name}`, en: `${en} wheel`, mat: 'צמיג + חישוק אלומיניום 19״', desc: 'גלגל 19 אינץ׳ עם חישוק אווירודינמי וצמיג 255/45. הצורה הסגורה של החישוק מוסיפה כמה קילומטרים לטווח.' }, { pos: [w.x, TIRE_R, w.s * WHEEL_Z] });
        if (w.s < 0) wp.rotation.y = PI;
        const spin = new THREE.Group(); wp.add(spin); spinners.push({ o: spin, s: w.s });
        const tire = part(spin, { he: `צמיג ${name}`, en: `${en} tyre`, mat: 'גומי, 255/45 R19', desc: 'צמיג עם ארבעה חריצים היקפיים וכיתוב על הדופן. בצמיגים של טסלה יש לפעמים שכבת קצף פנימית שמשתיקה רעש כביש.' });
        mesh(tireGeo, tireMat, { parent: tire }); mesh(grooves, M.black(), { parent: tire, cast: false });
        const sl = []; for (let i = 0; i < 72; i++) for (const zz of [-0.09, -0.042, 0.003, 0.048, 0.093]) { const a = (i / 72) * PI * 2 + zz; sl.push({ pos: [Math.cos(a) * 0.3555, Math.sin(a) * 0.3555, zz], rot: [0, 0, a] }); }
        instances(sipe, M.black(), sl, { parent: tire });
        mesh(swGeo, swMat, { parent: tire, pos: [0, 0, 0.1265], cast: false });
        const rim = part(spin, { he: `חישוק ${name}`, en: `${en} rim`, mat: 'אלומיניום יצוק, צבע אפור כהה', desc: 'חישוק 19 אינץ׳ עם חמישה זוגות חישורים ושפה מבריקה. הפתחים קטנים בכוונה כדי להקטין מערבולות.' });
        mesh(barrel, lipMat, { parent: rim }); mesh(faceGeo, rimMat, { parent: rim }); mesh(hubGeo, M.metal(0x3a3d42, 0.4), { parent: rim }); mesh(bladeGeo, rimMat, { parent: rim });
        mesh(G.torus(RIM + 0.004, 0.006, 8, 64, PI * 2, 'z'), lipMat, { parent: rim, pos: [0, 0, 0.116] });
        const cap = part(spin, { he: `מכסה מרכזי ${name}`, en: `${en} centre cap`, mat: 'פלסטיק + סמל T', desc: 'מכסה קטן עם סמל T שמכסה את אומי הגלגל.' });
        mesh(G.cyl(0.05, 0.052, 0.012, 32, 'z'), M.decal(logoTex.tex, { metalness: 0.4 }), { parent: cap, pos: [0, 0, 0.118] });
        mesh(nutGeo, M.chrome(), { parent: cap });
        put(G.cyl(0.004, 0.004, 0.03, 8, 'z'), M.chrome(), spin, [Math.cos(0.3) * 0.225, Math.sin(0.3) * 0.225, 0.1]);
        // brake (does not spin: caliper fixed, disc spins)
        const br = part(wp, { he: `בלם ${name}`, en: `${en} brake`, mat: 'דיסק ברזל יצוק מאוורר + קליפר אלומיניום', desc: `דיסק מאוורר וקליפר ${w.front ? 'דו־בוכנתי' : 'חד־בוכנתי עם בלם חניה חשמלי'}. ברוב הבלימות הרכב בכלל לא משתמש בהם — המנוע בולם ומחזיר אנרגיה לסוללה.` });
        br.userData.sysOverride = 'chassis';
        const dm = mesh(disc, M.castIron(), { parent: br, pos: [0, 0, 0.01] }); spinners.push({ o: dm, s: w.s });
        put(G.soft(0.12, 0.09, 0.07, { r: 0.025, seg: 4 }), M.metal(0x23262b, 0.35), br, [-0.13, 0.13, 0.03], [0, 0, PI / 4]);
        put(G.cyl(0.006, 0.006, 0.02, 8, 'y'), M.chrome(), br, [-0.15, 0.17, 0.05]);
      }
    }

    // ================================================================== CHASSIS: SUSPENSION, STEERING, SUBFRAMES
    const coil = (r, tube, h, turns, seg = 28) => { const pts = []; const n = turns * seg; for (let i = 0; i <= n; i++) { const a = (i / seg) * PI * 2; pts.push(V3(Math.cos(a) * r, (i / n) * h - h / 2, Math.sin(a) * r)); } return G.tube(pts, tube, n * 2, 6); };
    const rod = (parent, a, b, r, mat, name) => { const d = b.clone().sub(a), m = put(G.cyl(r, r, d.length(), 10, 'y'), mat, parent, a.clone().addScaledVector(d, 0.5).toArray(), null, { name }); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return m; };
    {
      const ch = sys('chassis');
      const arm = M.metal(0x4a4e55, 0.45), alu = M.castAlu();
      for (const w of wheelSpots) {
        const s = w.s, X = w.x, name = `${w.front ? 'קדמי' : 'אחורי'} ${sideHe(s)}`, en = `${w.front ? 'Front' : 'Rear'} ${sideEn(s)}`;
        const kn = part(ch, { he: `תושבת גלגל ${name}`, en: `${en} knuckle & hub`, mat: 'אלומיניום יצוק + מסב גלגל', desc: 'הגוש שאליו מחוברים הגלגל, הבלם, הזרועות והבולם. בתוכו מסב גלגל אטום וחיישן ABS.' });
        put(G.soft(0.12, 0.3, 0.08, { r: 0.03, seg: 4 }), alu, kn, [X, TIRE_R, s * 0.66]);
        put(G.cyl(0.07, 0.07, 0.08, 20, 'z'), M.steel(), kn, [X, TIRE_R, s * 0.72]);
        const la = part(ch, { he: `זרוע תחתונה ${name}`, en: `${en} lower control arm`, mat: 'אלומיניום מחושל + תותבי גומי', desc: 'זרוע תחתונה בצורת A שמחברת את תושבת הגלגל לתת־המסגרת. התותבים מגומי בולעים רעידות.' });
        rod(la, V3(X + 0.17, 0.2, s * 0.3), V3(X, 0.22, s * 0.64), 0.016, arm, 'front leg'); rod(la, V3(X - 0.17, 0.21, s * 0.3), V3(X, 0.22, s * 0.64), 0.016, arm, 'rear leg');
        for (const dx of [0.17, -0.17]) put(G.cyl(0.026, 0.026, 0.05, 14, 'x'), M.rubber(), la, [X + dx, 0.2, s * 0.3]);
        const ua = part(ch, { he: `זרוע עליונה ${name}`, en: `${en} upper link`, mat: 'אלומיניום', desc: w.front ? 'זרוע עליונה של מתלה עצמות משאלה כפולות — שומרת על זווית הגלגל קבועה בפנייה.' : 'אחת מחמש הזרועות של המתלה האחורי מרובה החוליות.' });
        rod(ua, V3(X + 0.12, 0.56, s * 0.42), V3(X, 0.52, s * 0.64), 0.012, arm); rod(ua, V3(X - 0.12, 0.57, s * 0.42), V3(X, 0.52, s * 0.64), 0.012, arm);
        const sd = part(ch, { he: `קפיץ ובולם ${name}`, en: `${en} coil spring & damper`, mat: 'פלדת קפיצים + בולם שמן', desc: 'קפיץ סליל סביב בולם זעזועים. בג׳וניפר הבולמים כוילו מחדש לנסיעה רכה ושקטה יותר.' });
        const sb = V3(X - 0.05, 0.25, s * 0.56), stt = V3(X - 0.05, 0.74, s * 0.52), d = stt.clone().sub(sb);
        const cm = put(coil(0.055, 0.008, 0.3, 6), M.metal(0x2f3236, 0.4), sd, sb.clone().addScaledVector(d, 0.55).toArray()); cm.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
        rod(sd, sb, sb.clone().addScaledVector(d, 0.6), 0.022, M.metal(0x1e2024, 0.4), 'damper body'); rod(sd, sb.clone().addScaledVector(d, 0.55), stt, 0.011, M.chrome(), 'damper rod');
        put(G.cyl(0.06, 0.06, 0.012, 20, 'y'), M.steel(), sd, stt.toArray()); put(G.cyl(0.06, 0.06, 0.012, 20, 'y'), M.steel(), sd, sb.clone().addScaledVector(d, 0.3).toArray());
        if (!w.front) { const tl = part(ch, { he: `זרוע כיוון אחורית ${name}`, en: `${en} toe link`, mat: 'פלדה', desc: 'מוט קצר שקובע את זווית ההתכנסות של הגלגל האחורי.' }); rod(tl, V3(X + 0.15, 0.32, s * 0.34), V3(X + 0.1, 0.3, s * 0.64), 0.009, arm); }
      }
      const rk = part(ch, { he: 'תמסורת היגוי חשמלית', en: 'Electric steering rack', mat: 'אלומיניום + מנוע חשמלי', desc: 'הגה כוח חשמלי: מנוע קטן על המוט מסייע לנהג, והתוכנה משנה את כובד ההגה לפי מצב הנהיגה.' });
      put(G.cyl(0.03, 0.03, 0.9, 16, 'z'), alu, rk, [1.62, 0.32, 0]); put(G.cyl(0.055, 0.055, 0.14, 18, 'x'), M.metal(0x3a3d42, 0.4), rk, [1.62, 0.32, -0.18]);
      for (const s of [1, -1]) { rod(rk, V3(1.62, 0.32, s * 0.45), V3(1.56, 0.33, s * 0.66), 0.01, M.steel()); put(G.lathe([[0.012, -0.05], [0.026, -0.03], [0.02, -0.01], [0.026, 0.01], [0.02, 0.03], [0.012, 0.05]], 14, 'z'), M.rubber(), rk, [1.62, 0.32, s * 0.47]); }
      rod(rk, V3(1.62, 0.34, -0.38), V3(0.75, 0.82, -0.38), 0.014, M.steel(), 'steering column shaft');
      for (const [x, he, en] of [[AXF, 'תת־מסגרת קדמית', 'Front subframe'], [AXR, 'תת־מסגרת אחורית', 'Rear subframe']]) {
        const sf = part(ch, { he, en, mat: 'אלומיניום יצוק', desc: 'מסגרת שאליה מחוברים המנוע, הזרועות ומוט המייצב. מחוברת למרכב דרך תותבי גומי שמבודדים רעש.' });
        for (const dx of [0.2, -0.2]) put(new THREE.BoxGeometry(0.06, 0.06, 0.66), alu, sf, [x + dx, 0.2, 0]);
        for (const s of [1, -1]) put(new THREE.BoxGeometry(0.46, 0.06, 0.06), alu, sf, [x, 0.2, s * 0.32]);
        const ar = part(ch, { he: `מוט מייצב ${x > 0 ? 'קדמי' : 'אחורי'}`, en: `${x > 0 ? 'Front' : 'Rear'} anti-roll bar`, mat: 'פלדת קפיצים', desc: 'מוט פיתול שמחבר בין שני הצדדים ומקטין את הטיית המרכב בפניות.' });
        put(G.tube([V3(x - 0.15, 0.27, -0.6), V3(x - 0.2, 0.27, -0.3), V3(x - 0.2, 0.27, 0.3), V3(x - 0.15, 0.27, 0.6)], 0.011, 30, 8), M.metal(0x26282c, 0.4), ar);
      }
    }

    // ================================================================== BATTERY
    {
      const bat = sys('battery');
      const PX = [-1.22, 1.08], PZ = 0.70, PY = [0.175, 0.335];
      const pk = part(bat, { he: 'מארז הסוללה (מבני)', en: 'Structural battery pack', mat: 'אלומיניום + פלדה, אטום למים', desc: 'מארז שטוח בין הגלגלים שמשמש גם כרצפת המרכב. בגרסת Long Range כ־75 קוט״ש (הערכה). הוא כבד — וזה מה שמוריד את מרכז הכובד.' });
      const al = M.metal(0x8d939a, 0.45);
      put(new THREE.BoxGeometry(PX[1] - PX[0], 0.012, 2 * PZ), al, pk, [(PX[0] + PX[1]) / 2, PY[0] + 0.006, 0], null, { name: 'floor plate' });
      for (const s of [1, -1]) put(new THREE.BoxGeometry(PX[1] - PX[0], PY[1] - PY[0], 0.02), al, pk, [(PX[0] + PX[1]) / 2, (PY[0] + PY[1]) / 2, s * PZ]);
      for (const x of PX) put(new THREE.BoxGeometry(0.02, PY[1] - PY[0], 2 * PZ), al, pk, [x, (PY[0] + PY[1]) / 2, 0]);
      const lid = part(bat, { he: 'מכסה הסוללה', en: 'Pack lid', mat: 'פלדה דקה + אטם', desc: 'מכסה שמאטם את הסוללה מלמעלה. במודל Y החדש המושבים מותקנים ישר עליו.' });
      put(new THREE.BoxGeometry(PX[1] - PX[0] - 0.02, 0.006, 2 * PZ - 0.02), M.metal(0x6c7178, 0.5), lid, [(PX[0] + PX[1]) / 2, PY[1] - 0.004, 0]);
      bolts: { const bl = []; for (let i = 0; i < 24; i++) for (const s of [1, -1]) bl.push({ pos: [PX[0] + 0.05 + i * 0.095, PY[1], s * (PZ - 0.012)] }); instances(G.bolt(0.008), M.darkSteel(), bl, { parent: lid }); }
      const cellGeo = G.cyl(0.0225, 0.0225, 0.08, 10, 'y'), topGeo = G.cyl(0.016, 0.016, 0.003, 10, 'y');
      for (let m = 0; m < 4; m++) {
        const zc = [-0.5, -0.17, 0.17, 0.5][m];
        const mod = part(bat, { he: `מודול סוללה ${m + 1}`, en: `Battery module ${m + 1}`, mat: 'תאי ליתיום־יון גליליים + דבק קירור', desc: 'שורה של תאים גליליים מודבקים יחד ומחוברים בפסי צבירה. נוזל קירור זורם בצינור גלי בין שורות התאים.' });
        const cells = [], tops = [];
        for (let i = 0; i < 44; i++) for (let j = 0; j < 6; j++) { const p = [PX[0] + 0.08 + i * 0.049 + (j % 2) * 0.024, PY[0] + 0.06, zc - 0.12 + j * 0.048]; cells.push({ pos: p }); tops.push({ pos: [p[0], p[1] + 0.041, p[2]] }); }
        instances(cellGeo, M.metal(0x23305c, 0.4), cells, { parent: mod }); instances(topGeo, M.metal(0xc9ccd0, 0.3), tops, { parent: mod });
        for (const j of [0.5, 2.5, 4.5]) put(G.tube(Array.from({ length: 20 }, (_, k) => V3(PX[0] + 0.08 + k * 0.11, PY[0] + 0.06, zc - 0.12 + j * 0.048 + 0.01 * Math.sin(k * 3))), 0.004, 60, 4), M.metal(0x9aa0a6, 0.3), mod, null, null, { name: 'cooling ribbon' });
        put(new THREE.BoxGeometry(2.14, 0.003, 0.022), M.copper(), mod, [(PX[0] + PX[1]) / 2, PY[0] + 0.105, zc - 0.13]); put(new THREE.BoxGeometry(2.14, 0.003, 0.022), M.copper(), mod, [(PX[0] + PX[1]) / 2, PY[0] + 0.105, zc + 0.13]);
        put(G.box(0.18, 0.01, 0.1, 0.003), M.plastic(0x1f6b33, 0.5), mod, [PX[0] + 0.25 + m * 0.3, PY[0] + 0.112, zc]);
      }
      const ph = part(bat, { he: 'תיבת מתח גבוה (״פנטהאוז״)', en: 'HV junction box ("penthouse")', mat: 'אלומיניום + מגענים ונתיך פירוטכני', desc: 'קופסה על קצה הסוללה שבה מגעני מתח גבוה, נתיך פירוטכני שמנתק את הסוללה בתאונה, מטען מובנה וממיר 16V.' });
      put(G.box(0.36, 0.1, 0.9, 0.02), M.castAlu(), ph, [-1.05, 0.38, 0]);
      for (const z of [-0.2, 0.2]) put(G.cyl(0.03, 0.03, 0.07, 14, 'y'), M.plastic(0x222428, 0.5), ph, [-0.95, 0.44, z]);
      put(G.cyl(0.02, 0.02, 0.05, 12, 'y'), M.plastic(0xd2541d, 0.5), ph, [-1.15, 0.44, 0.3]);
      const hv = part(bat, { he: 'כבלי מתח גבוה (כתומים)', en: 'Orange HV cables', mat: 'נחושת בבידוד כתום', desc: 'כבלי מתח גבוה (כ־400 וולט) בצבע כתום לפי תקן בטיחות, מהסוללה למנועים, למשאבת החום ולשקע הטעינה.' });
      const orange = M.plastic(0xe0631a, 0.5);
      for (const dz of [-0.05, 0.05]) { put(G.tube([V3(-1.05, 0.38, dz), V3(-1.25, 0.4, dz), V3(-1.4, 0.48, dz)], 0.011, 20, 6), orange, hv); put(G.tube([V3(1.05, 0.3, dz + 0.3), V3(1.25, 0.34, dz + 0.3), V3(1.4, 0.46, dz + 0.1)], 0.011, 20, 6), orange, hv); }
      put(G.tube([V3(-1.2, 0.4, -0.35), V3(-1.7, 0.6, -0.6), V3(-2.0, 0.85, -0.82), V3(-2.08, 0.93, -0.88)], 0.009, 30, 6), orange, hv);
    }

    // ================================================================== DRIVE UNITS + THERMAL
    {
      const dr = sys('drive');
      const du = (x, front) => {
        const nm = front ? 'קדמי' : 'אחורי';
        const g = part(dr, { he: `מנוע ${nm}`, en: `${front ? 'Front induction' : 'Rear permanent-magnet'} motor`, mat: front ? 'מנוע השראה, נחושת + פלדת סיליקון' : 'מנוע מגנטים קבועים (PMSRM)', desc: front ? 'המנוע הקדמי בגרסת הנעה כפולה. מנוע השראה שכמעט לא מבזבז אנרגיה כשהוא לא נדרש, ולכן הרכב נוסע רוב הזמן על המנוע האחורי.' : 'המנוע העיקרי. משלב מגנטים קבועים ורלקטנס — יעיל מאוד ומסתובב עד כ־18,000 סל״ד.' });
        put(G.cyl(0.13, 0.13, 0.3, 32, 'z'), M.castAlu(), g, [x, 0.34, -0.06]);
        instances(new THREE.BoxGeometry(0.02, 0.27, 0.012), M.castAlu(), Array.from({ length: 12 }, (_, i) => ({ pos: [x, 0.34, -0.2 + i * 0.026], rot: [0, 0, 0] })), { parent: g });
        put(G.cyl(0.1, 0.1, 0.02, 28, 'z'), M.metal(0xb87333, 0.35), g, [x, 0.34, -0.215]);
        const gb = part(dr, { he: `תיבת הילוכים ${nm}`, en: `${front ? 'Front' : 'Rear'} reduction gearbox`, mat: 'אלומיניום יצוק + גלגלי שיניים', desc: 'תיבה עם הילוך יחיד (יחס כ־9:1) ודיפרנציאל. ברכב חשמלי אין צורך בהחלפת הילוכים.' });
        put(G.soft(0.3, 0.26, 0.16, { r: 0.04, seg: 5 }), M.castAlu(), gb, [x, 0.33, 0.17]);
        instances(G.bolt(0.008), M.darkSteel(), Array.from({ length: 10 }, (_, i) => ({ pos: [x - 0.12 + (i % 5) * 0.06, 0.33 + (i < 5 ? 0.11 : -0.11), 0.252], rot: [PI / 2, 0, 0] })), { parent: gb });
        const inv = part(dr, { he: `ממיר מתח ${nm}`, en: `${front ? 'Front' : 'Rear'} inverter`, mat: 'אלומיניום + טרנזיסטורי SiC', desc: 'ממיר שהופך את זרם הסוללה הישר לזרם חילופין תלת־פאזי. טסלה הייתה מהראשונות שהשתמשו בטרנזיסטורי סיליקון־קרביד.' });
        put(G.box(0.26, 0.08, 0.3, 0.015), M.metal(0x7d838a, 0.4), inv, [x, 0.52, 0.02]);
        for (const dz of [-0.06, 0.06]) put(G.cyl(0.02, 0.02, 0.04, 12, 'y'), M.plastic(0xe0631a, 0.5), inv, [x + (front ? -0.1 : 0.1), 0.58, dz]);
        const hs = part(dr, { he: `צירי הנעה ${nm}ים`, en: `${front ? 'Front' : 'Rear'} half-shafts`, mat: 'פלדה + מפרקי CV + מגפי גומי', desc: 'שני צירים שמעבירים את הכוח מהתיבה לגלגלים. בכל קצה מפרק הומוקינטי מכוסה מגף גומי.' });
        for (const s of [1, -1]) { put(G.cyl(0.018, 0.018, 0.4, 12, 'z'), M.steel(), hs, [x, TIRE_R, s * 0.45]); for (const zz of [0.27, 0.62]) put(G.lathe([[0.02, -0.05], [0.042, -0.035], [0.034, -0.015], [0.042, 0.005], [0.034, 0.025], [0.024, 0.05]], 16, 'z'), M.rubber(), hs, [x, TIRE_R, s * zz]); }
      };
      du(AXR, false); du(AXF, true);
      const hp = part(dr, { he: 'משאבת חום ושסתום ״אוקטו״', en: 'Heat pump & Octovalve', mat: 'אלומיניום + פלסטיק + מדחס חשמלי', desc: 'לב ניהול החום: שסתום אחד עם שמונה דרכים מעביר חום בין הסוללה, המנועים והתא. בחורף הרכב מנצל אפילו את חום המנוע כדי לחמם את הנוסעים.' });
      put(G.soft(0.2, 0.16, 0.16, { r: 0.03, seg: 4 }), M.plastic(0x2a2c30, 0.5), hp, [1.2, 0.72, 0.62]);
      put(G.cyl(0.07, 0.07, 0.2, 20, 'x'), M.metal(0x8a9097, 0.4), hp, [1.2, 0.55, 0.62]);
      for (const [a, b] of [[[1.3, 0.72, 0.62], [1.95, 0.5, 0.3]], [[1.1, 0.7, 0.55], [0.8, 0.45, 0.4]], [[1.2, 0.64, 0.7], [1.45, 0.42, 0.2]]]) put(G.tube([V3(...a), V3((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.02, (a[2] + b[2]) / 2), V3(...b)], 0.012, 20, 6), M.rubber(), hp);
      const rad = part(dr, { he: 'רדיאטור ומאוורר', en: 'Radiator, condenser & fan', mat: 'אלומיניום עם סנפירים', desc: 'רדיאטור ומעבה מאחורי הפתח התחתון בחזית, עם מאוורר שמופעל רק כשצריך — בטעינה מהירה או ביום חם.' });
      put(new THREE.BoxGeometry(0.05, 0.3, 1.0), M.castAlu(), rad, [2.06, 0.46, 0]);
      instances(new THREE.BoxGeometry(0.045, 0.28, 0.003), M.aluminum(), Array.from({ length: 40 }, (_, i) => ({ pos: [2.065, 0.46, -0.48 + i * 0.0245] })), { parent: rad });
      put(G.cyl(0.13, 0.13, 0.04, 28, 'x'), M.plastic(0x1a1b1e, 0.6), rad, [2.0, 0.46, 0.2]);
      const lv = part(dr, { he: 'מצבר 16V (ליתיום)', en: '16V Li-ion low-voltage battery', mat: 'תאי ליתיום־יון', desc: 'במקום מצבר עופרת 12V, לטסלה החדשה מצבר ליתיום קטן ב־16 וולט שמזין את המחשבים והמסכים.' });
      put(G.box(0.24, 0.16, 0.16, 0.01), M.plastic(0x2a2c30, 0.5), lv, [1.2, 0.72, -0.62]);
      put(G.cyl(0.012, 0.012, 0.02, 10, 'y'), M.plastic(0xc0392b, 0.5), lv, [1.15, 0.81, -0.6]);
      const hv = part(dr, { he: 'יחידת מיזוג אוויר (HVAC)', en: 'HVAC module', mat: 'פלסטיק + מאוורר + מסנן HEPA', desc: 'תיבת מיזוג מאחורי לוח המחוונים עם מסנן HEPA וחיממה של הסוללה דרך משאבת החום.' });
      put(G.soft(0.3, 0.26, 0.8, { r: 0.05, seg: 4 }), M.plastic(0x2a2c30, 0.6), hv, [0.92, 0.66, 0.05]);
    }

    // ================================================================== INTERIOR
    const seatFolds = [];
    {
      const it = sys('interior');
      const SEAT = 0x16171a, ST = M.leather(SEAT), Q = M.quilted(SEAT, 'v', '#2a2c30', 6), QH = M.quilted(SEAT, 'u', '#2a2c30', 5);
      const fl = part(it, { he: 'רצפה ושטיחים', en: 'Floor & carpets', mat: 'שטיח + מחצלות גומי', desc: 'רצפה שטוחה לגמרי — אין מנהרת הילוכים כי אין תיבת הילוכים לאורך הרכב. מתחתיה הסוללה.' });
      put(new THREE.BoxGeometry(2.3, 0.02, 1.38), M.carpet(0x141518), fl, [-0.2, FLOOR, 0]);
      for (const [x, z] of [[0.35, -0.38], [0.35, 0.38], [-0.62, -0.42], [-0.62, 0.42]]) put(G.box(0.42, 0.012, 0.36, 0.01), M.rubber(), fl, [x, FLOOR + 0.016, z]);
      const seat = (info, x, z, w, rear, fold) => {
        const p = part(it, info, { pos: [x, FLOOR, z] });
        const cy = 0.24;
        put(G.soft(0.5, 0.12, w, { r: 0.05, seg: 6, deform: (q) => { q.y -= 0.025 * (1 - q.z * q.z * 4) * (q.y > 0 ? 1 : 0); if (Math.abs(q.z) > 0.35 && q.y > 0) q.y += 0.02; return q; } }), [ST, ST, Q, ST, ST, ST], p, [0, cy, 0], null, { name: 'cushion' });
        const back = new THREE.Group(); back.position.set(-0.23, cy + 0.05, 0); p.add(back);
        put(G.soft(0.13, rear ? 0.6 : 0.66, w * 0.98, { r: 0.05, seg: 6, deform: (q) => { if (q.x > 0) { q.x -= 0.02 * (1 - q.z * q.z * 4); if (Math.abs(q.z) > 0.35) q.x += 0.025; } return q; } }), [Q, ST, ST, ST, ST, ST], back, [0, (rear ? 0.3 : 0.33), 0], [0, 0, 0.2], { name: 'backrest' });
        put(G.soft(0.1, 0.16, w * 0.55, { r: 0.04, seg: 5 }), [QH, ST, ST, ST, ST, ST], back, [-0.07, rear ? 0.68 : 0.76, 0], [0, 0, 0.2], { name: 'headrest' });
        if (!rear) { put(G.cyl(0.04, 0.05, 0.12, 14, 'y'), M.metal(0x2b2d31, 0.4), p, [0, 0.12, 0]); put(new THREE.BoxGeometry(0.5, 0.02, 0.04), M.steel(), p, [0, 0.03, -w / 2 + 0.06]); put(new THREE.BoxGeometry(0.5, 0.02, 0.04), M.steel(), p, [0, 0.03, w / 2 - 0.06]); }
        if (!rear) K.panel(p, { name: 'seat switches', pos: [0.05, cy, (z > 0 ? 1 : -1) * (w / 2 + 0.006)], normal: [0, 0, z > 0 ? 1 : -1], w: 0.16, h: 0.05, plate: false, buttons: [{ x: 0.02, y: -0.005, w: 0.08, h: 0.016, d: 0.006, color: 0x1c1d21 }, { x: -0.05, y: 0.004, w: 0.014, h: 0.04, d: 0.006, color: 0x1c1d21 }] });
        if (fold) seatFolds.push(back);
        return p;
      };
      seat({ he: 'מושב הנהג', en: 'Driver seat', mat: 'עור טבעוני מחורר + אוורור', desc: 'מושב חשמלי עם חימום ואוורור (חדש בג׳וניפר), וזיכרון מיקום שמתחבר לפרופיל הנהג בטלפון.' }, 0.0, -0.38, 0.52, false);
      seat({ he: 'מושב הנוסע הקדמי', en: 'Front passenger seat', mat: 'עור טבעוני מחורר', desc: 'מושב חשמלי זהה למושב הנהג, עם חימום ואוורור.' }, 0.0, 0.38, 0.52, false);
      seat({ he: 'מושב אחורי שמאלי (60%)', en: 'Rear seat left (60%)', mat: 'עור טבעוני', desc: 'חלק ה־60% של הספסל האחורי. המשענת מתקפלת חשמלית בכפתור בתא המטען.' }, -0.92, -0.33, 0.66, true, true);
      seat({ he: 'מושב אחורי ימני (40%)', en: 'Rear seat right (40%)', mat: 'עור טבעוני', desc: 'חלק ה־40% של הספסל האחורי, מתקפל בנפרד כדי להעמיס חפצים ארוכים.' }, -0.92, 0.4, 0.46, true, true);
      K.toggle('seats', { he: 'קיפול מושבים', key: 's', seconds: 1.4 }, (t) => { for (const b of seatFolds) b.rotation.z = -t * 1.35; });
      // dashboard
      const dash = part(it, { he: 'לוח מחוונים', en: 'Dashboard', mat: 'עור טבעוני + בד + פס אוורור רציף', desc: 'לוח מחוונים נקי לגמרי, בלי שעונים. פתח מיזוג אחד דק לאורך כל הלוח מכוון את האוויר דרך המסך.' });
      put(G.soft(0.3, 0.13, 1.56, { r: 0.05, seg: 6 }), M.leather(0x1a1b1e), dash, [0.8, 0.92, 0]);
      put(G.soft(0.12, 0.08, 1.52, { r: 0.03, seg: 4 }), M.fabric(0x3a3c40), dash, [0.66, 0.84, 0]);
      put(new THREE.BoxGeometry(0.012, 0.008, 1.42), M.black(), dash, [0.645, 0.9, 0], null, { name: 'air vent slot' });
      put(G.soft(0.25, 0.18, 0.4, { r: 0.04, seg: 4 }), M.plastic(0x18191b, 0.6), dash, [0.82, 0.74, 0.38], null, { name: 'glovebox' });
      // centre screen
      const scrTex = K.canvasTexture(1024, 640, (g, w, h) => {
        g.fillStyle = '#e9edf0'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#dfe4e8'; g.fillRect(0, 0, w * 0.36, h);
        g.fillStyle = '#c9ced3'; g.beginPath(); g.ellipse(w * 0.18, h * 0.5, w * 0.08, h * 0.26, 0, 0, PI * 2); g.fill();
        g.fillStyle = '#9ea2a6'; g.beginPath(); g.ellipse(w * 0.18, h * 0.5, w * 0.055, h * 0.2, 0, 0, PI * 2); g.fill();
        g.fillStyle = '#c8d6c3'; g.fillRect(w * 0.36, 0, w * 0.64, h);
        g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.beginPath(); g.moveTo(w * 0.4, h * 0.9); g.bezierCurveTo(w * 0.55, h * 0.6, w * 0.7, h * 0.7, w * 0.97, h * 0.2); g.stroke();
        g.strokeStyle = '#3e6ef3'; g.lineWidth = 10; g.beginPath(); g.moveTo(w * 0.62, h * 0.66); g.bezierCurveTo(w * 0.7, h * 0.6, w * 0.8, h * 0.5, w * 0.97, h * 0.2); g.stroke();
        g.fillStyle = '#3e6ef3'; g.beginPath(); g.arc(w * 0.62, h * 0.66, 12, 0, PI * 2); g.fill();
        g.fillStyle = '#222'; g.font = '700 54px Arial'; g.fillText('P', w * 0.03, h * 0.12); g.font = '700 64px Arial'; g.fillText('0', w * 0.12, h * 0.13); g.font = '400 24px Arial'; g.fillText('km/h', w * 0.16, h * 0.13); g.fillText('82%', w * 0.27, h * 0.06);
        g.fillStyle = '#1b1c1f'; g.fillRect(0, h * 0.9, w, h * 0.1); g.fillStyle = '#ddd'; g.font = '400 26px Arial'; ['🚗', '22°', '❄', '♪', '⚙', '📞'].forEach((c, i) => g.fillText(c, w * (0.06 + i * 0.16), h * 0.965));
      });
      const scr = part(it, { he: 'מסך מגע מרכזי 15.4״', en: '15.4" centre touchscreen', mat: 'LCD + זכוכית מוקשית', desc: 'המסך שמחליף כמעט את כל הכפתורים: מהירות, ניווט, מיזוג, מראות, הגה ועוד. בג׳וניפר המסגרת דקה יותר והתמונה בהירה יותר.' });
      const sg = new THREE.Group(); sg.position.set(0.6, 1.08, 0); sg.rotation.z = 0.22; scr.add(sg);
      put(G.box(0.02, 0.23, 0.36, 0.008), M.black(), sg, [0, 0, 0]);
      put(new THREE.PlaneGeometry(0.35, 0.215), M.screen(scrTex, 0.8), sg, [-0.0105, 0, 0], [0, -PI / 2, 0], { cast: false });
      put(G.box(0.05, 0.08, 0.06, 0.01), M.metal(0x2b2d31, 0.4), sg, [0.03, -0.12, 0]);
      // steering wheel + column + stalk
      const sw = part(it, { he: 'הגה', en: 'Steering wheel', mat: 'עור + מגע קיבולי', desc: 'הגה עגול עם שני גלגלי גלילה. בג׳וניפר חזרה ידית האיתות, ובצד ההגה כפתורים לאורות ולצופר.' });
      const swg = new THREE.Group(); swg.position.set(0.47, 0.98, -0.38); swg.rotation.z = 0.32; sw.add(swg);
      put(G.torus(0.185, 0.02, 12, 48, PI * 2, 'x'), M.leather(0x141518), swg);
      put(G.soft(0.05, 0.1, 0.12, { r: 0.03, seg: 4 }), M.plastic(0x18191b, 0.5), swg);
      for (const a of [0, PI, -PI / 2]) put(G.tube([V3(0, 0, 0), V3(0, Math.sin(a) * 0.17, Math.cos(a) * 0.17)], 0.014, 4, 6), M.metal(0x2b2d31, 0.4), swg);
      for (const z of [-0.09, 0.09]) { put(G.cyl(0.018, 0.018, 0.012, 18, 'x'), M.satin(), swg, [-0.03, 0.0, z]); put(G.torus(0.018, 0.003, 6, 18, PI * 2, 'x'), M.plastic(0x333, 0.4), swg, [-0.032, 0, z]); }
      put(G.cyl(0.035, 0.04, 0.2, 14, 'x'), M.plastic(0x18191b, 0.6), sw, [0.58, 0.95, -0.38], [0, 0, 0.32]);
      put(G.cyl(0.006, 0.006, 0.12, 8, 'z'), M.plastic(0x18191b, 0.6), sw, [0.54, 0.95, -0.46]);
      // centre console + rear screen
      const cc = part(it, { he: 'קונסולה מרכזית', en: 'Centre console', mat: 'עור טבעוני + אלומיניום', desc: 'קונסולה עם שני משטחי טעינה אלחוטית לטלפונים, מחזיקי כוסות נסתרים, תא אחסון עמוק ושקעי USB-C.' });
      put(G.soft(1.0, 0.24, 0.26, { r: 0.05, seg: 5 }), M.leather(0x1a1b1e), cc, [0.05, FLOOR + 0.13, 0]);
      for (const x of [0.3, 0.46]) put(G.box(0.15, 0.006, 0.08, 0.004), M.gloss(0x0a0a0b), cc, [x, FLOOR + 0.253, 0], [0, 0, 0]);
      for (const x of [0.1, 0.2]) put(G.cyl(0.035, 0.035, 0.01, 18, 'y'), M.black(), cc, [x, FLOOR + 0.252, 0]);
      put(G.soft(0.36, 0.06, 0.25, { r: 0.025, seg: 4 }), M.leather(0x202124), cc, [-0.2, FLOOR + 0.275, 0], null, { name: 'armrest lid' });
      const rs = part(it, { he: 'מסך אחורי 8״', en: 'Rear 8" display', mat: 'LCD', desc: 'חדש בג׳וניפר: מסך לנוסעים מאחור לשליטה במיזוג, בחימום המושבים ובסרטים.' });
      const rsTex = K.canvasTexture(400, 240, (g, w, h) => { g.fillStyle = '#101214'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9edf0'; g.font = '700 46px Arial'; g.fillText('21.5°', 30, 80); g.fillText('21.5°', 250, 80); g.fillStyle = '#3e6ef3'; g.fillRect(30, 140, 340, 10); g.fillStyle = '#888'; g.font = '400 24px Arial'; g.fillText('Climate · Media · Seats', 60, 210); });
      put(new THREE.PlaneGeometry(0.17, 0.1), M.screen(rsTex, 0.8), rs, [-0.456, FLOOR + 0.17, 0], [0, -PI / 2, 0], { cast: false });
      // pedals, sun visors, mirror, belts
      const pd = part(it, { he: 'דוושות', en: 'Pedals', mat: 'אלומיניום + גומי', desc: 'דוושת האצה ודוושת בלם. ברוב הנהיגה משתמשים רק בדוושת ההאצה — כשמרפים אותה הרכב בולם לבד ומחזיר אנרגיה לסוללה.' });
      put(G.box(0.03, 0.15, 0.06, 0.01), M.rubber(), pd, [0.78, FLOOR + 0.12, -0.3], [0, 0, 0.5]); put(G.box(0.03, 0.08, 0.1, 0.01), M.rubber(), pd, [0.76, FLOOR + 0.15, -0.44], [0, 0, 0.5]);
      const sv = part(it, { he: 'מגני שמש (2)', en: 'Sun visors (×2)', mat: 'בד + מראת איפור מוארת', desc: 'מגני שמש עם מגנט שמחזיק אותם סגורים ומראה מוארת.' });
      for (const s of [1, -1]) put(G.soft(0.17, 0.02, 0.4, { r: 0.008, seg: 3 }), M.fabric(0x2a2b2e), sv, [0.22, Yt(0.22) - 0.05, s * 0.36]);
      const rm = part(it, { he: 'מראה פנימית', en: 'Rear-view mirror', mat: 'זכוכית אלקטרוכרומית', desc: 'מראה שמתכהה אוטומטית מול פנסים מאחור. מעליה תא מצלמות האוטופיילוט ומצלמת התא.' });
      put(G.soft(0.03, 0.07, 0.25, { r: 0.02, seg: 4 }), M.plastic(0x18191b, 0.5), rm, [0.3, Yt(0.3) - 0.12, 0]);
      put(new THREE.BoxGeometry(0.003, 0.055, 0.23), M.chrome(), rm, [0.284, Yt(0.3) - 0.12, 0]);
      const bt = part(it, { he: 'חגורות בטיחות', en: 'Seat belts', mat: 'ניילון ארוג + אבזמים', desc: 'חגורות שלוש נקודות עם מותחנים פירוטכניים שמהדקים אותן בשבריר שנייה בתאונה.' });
      for (const s of [1, -1]) put(G.tube([V3(-0.17, Yt(-0.17) - 0.25, s * 0.82), V3(-0.08, 1.05, s * 0.6), V3(0.05, 0.85, s * 0.3), V3(0.12, 0.7, s * 0.18)], 0.012, 30, 4), M.fabric(0x202124), bt);
      const pt = part(it, { he: 'חיפוי עמודים ותקרה', en: 'Pillar & roof-rail trims', mat: 'בד לבד', desc: 'חיפוי עמודים פנימי עם כריות אוויר וילון מוסתרות מאחוריו.' });
      for (const s of [1, -1]) put(G.box(1.2, 0.05, 0.035, 0.012), M.fabric(0x2a2b2e), pt, [-0.4, 1.4, s * 0.6]);
    }

    // ================================================================== AUTOPILOT: CAMERAS, COMPUTER, ANTENNAS
    {
      const ap = sys('autopilot');
      const lensMat = M.lens(0x223344, 0.85);
      const camHouse = part(ap, { he: 'תא המצלמות הקדמי (3 מצלמות)', en: 'Forward camera cluster', mat: 'פלסטיק + עדשות + חימום שמשה', desc: 'שלוש מצלמות מאחורי השמשה: רחבה, ראשית ומרחוק (עד כ־250 מ׳). זו העין העיקרית של האוטופיילוט.' });
      put(G.soft(0.09, 0.05, 0.2, { r: 0.015, seg: 4 }), M.plastic(0x101113, 0.5), camHouse, [0.3, Yt(0.3) - 0.055, 0]);
      for (const z of [-0.05, 0, 0.05]) { put(G.cyl(0.011, 0.011, 0.02, 14, 'x'), lensMat, camHouse, [0.352, Yt(0.3) - 0.055, z]); put(G.torus(0.012, 0.002, 6, 14, PI * 2, 'x'), M.darkChrome(), camHouse, [0.362, Yt(0.3) - 0.055, z]); }
      const bc = part(ap, { he: 'מצלמות עמוד B (2)', en: 'B-pillar cameras (×2)', mat: 'עדשה בכיסוי שחור', desc: 'מצלמה בכל עמוד B שמסתכלת קדימה ולצד — חיונית בצמתים.' });
      for (const s of [1, -1]) { const p = onBody(-0.17, s * 0.33, 0.004); put(G.cyl(0.009, 0.009, 0.008, 12, 'z'), lensMat, bc, p.toArray(), [0, 0, 0]); }
      const rc = part(ap, { he: 'מצלמות צד בכנפיים (2)', en: 'Fender repeater cameras (×2)', mat: 'עדשה + פנס איתות', desc: 'מצלמות שמסתכלות אחורה מהכנפיים הקדמיות, יחד עם פנס איתות קטן.' });
      for (const s of [1, -1]) { const v = vAtY(1.25, 0.8, s), p = onBody(1.25, v, 0.002), n = nrm(1.25, v); const g = new THREE.Group(); g.position.copy(p); g.quaternion.setFromUnitVectors(V3(0, 0, 1), n); rc.add(g); put(G.box(0.07, 0.025, 0.008, 0.004), M.gloss(0x0b0b0c), g); put(G.cyl(0.006, 0.006, 0.004, 10, 'z'), lensMat, g, [0.02, 0, 0.004]); put(new THREE.BoxGeometry(0.03, 0.006, 0.003), L.amber, g, [-0.015, 0, 0.004]); }
      const rcam = part(ap, { he: 'מצלמה אחורית', en: 'Rear camera', mat: 'עדשה עם מחמם', desc: 'מצלמה מעל לוחית הרישוי עם מחמם שמונע אדים. משמשת לחניה ולאוטופיילוט.' });
      put(G.cyl(0.012, 0.012, 0.02, 12, 'x'), lensMat, rcam, [XR - 0.005, 0.5, 0]);
      const fcam = part(ap, { he: 'מצלמת פגוש קדמית', en: 'Front bumper camera', mat: 'עדשה + מתז ניקוי', desc: 'חדש בג׳וניפר (בחלק מהשווקים): מצלמה נמוכה בפגוש שרואה מכשולים קרובים בחניה.' });
      put(G.cyl(0.012, 0.012, 0.02, 12, 'x'), lensMat, fcam, [XF - 0.002, 0.57, 0]);
      const cpu = part(ap, { he: 'מחשב האוטופיילוט (HW4)', en: 'Autopilot computer (HW4)', mat: 'לוח מעגלים + שבבי AI + קירור נוזלי', desc: 'מחשב עם שני שבבי בינה מלאכותית שמעבד את תמונות כל המצלמות בזמן אמת. מקורר בנוזל מאחורי תא הכפפות.' });
      put(G.box(0.28, 0.05, 0.22, 0.01), M.metal(0x7d838a, 0.4), cpu, [0.9, 0.82, 0.38]);
      instances(new THREE.BoxGeometry(0.26, 0.012, 0.004), M.aluminum(), Array.from({ length: 10 }, (_, i) => ({ pos: [0.9, 0.85, 0.29 + i * 0.02] })), { parent: cpu });
      const ant = part(ap, { he: 'אנטנות GPS/LTE/Bluetooth', en: 'GPS / LTE / BLE antennas', mat: 'אנטנות מוטבעות', desc: 'אנטנות מוסתרות בגג ובעמודים: GPS, סלולרי, Wi-Fi, ומפתח טלפון ב־Bluetooth שמזהה מאיזה צד אתה מתקרב.' });
      put(G.box(0.12, 0.02, 0.08, 0.008), M.plastic(0x101113, 0.5), ant, [-1.2, Yt(-1.2) - 0.03, 0]);
      for (const s of [1, -1]) put(G.box(0.03, 0.06, 0.01, 0.004), M.plastic(0x101113, 0.5), ant, [-0.17, 0.95, s * 0.88]);
      const cab = part(ap, { he: 'מצלמת תא הנוסעים', en: 'Cabin camera', mat: 'עדשה + לד אינפרא־אדום', desc: 'מצלמה מעל המראה שבודקת שהנהג מסתכל על הכביש כשהאוטופיילוט פועל.' });
      put(G.cyl(0.006, 0.006, 0.01, 10, 'x'), lensMat, cab, [0.27, Yt(0.3) - 0.07, 0]);
    }


    // ================================================================== SMALL PARTS (wheels, cabin, body)
    {
      const wh = sys('wheels'), it = sys('interior');
      for (const w of wheelSpots) {
        const name = `${w.front ? 'קדמי' : 'אחורי'} ${sideHe(w.s)}`, en = `${w.front ? 'Front' : 'Rear'} ${sideEn(w.s)}`;
        const tp = part(wh, { he: `חיישן לחץ אוויר ${name}`, en: `${en} TPMS sensor`, mat: 'פלסטיק + סוללת ליתיום + Bluetooth', desc: 'חיישן קטן בתוך החישוק שמדווח למסך את לחץ האוויר והטמפרטורה בכל צמיג.' }, { pos: [w.x, TIRE_R, w.s * WHEEL_Z] });
        if (w.s < 0) tp.rotation.y = PI;
        put(G.box(0.04, 0.02, 0.025, 0.006), M.plastic(0x1b1c1f, 0.5), tp, [Math.cos(0.3) * 0.22, Math.sin(0.3) * 0.22, 0.07], [0, 0, 0.3]);
      }
      const wc = part(it, { he: 'משטחי טעינה אלחוטית (2)', en: 'Wireless phone chargers (×2)', mat: 'סליל Qi מתחת לזכוכית', desc: 'שני משטחים שבהם טלפון נטען בלי כבל, עם אוורור שמונע התחממות. הטלפון משמש גם כמפתח.' });
      for (const x of [0.3, 0.46]) put(G.box(0.13, 0.004, 0.07, 0.003), M.plastic(0x2a2c30, 0.3), wc, [x, FLOOR + 0.258, 0]);
      const cup = part(it, { he: 'מחזיקי כוסות', en: 'Cup holders', mat: 'פלסטיק + גומי', desc: 'שני מחזיקי כוסות בקונסולה, עם תחתית גומי שמונעת רעש.' });
      for (const x of [0.1, 0.2]) put(G.cyl(0.033, 0.03, 0.08, 18, 'y', true), M.plastic(0x101113, 0.5), cup, [x, FLOOR + 0.215, 0]);
      const usb = part(it, { he: 'שקעי USB-C', en: 'USB-C ports', mat: 'פלסטיק + מגעים', desc: 'שקעי USB-C חזקים לטעינת מחשב נייד, מלפנים ומאחור.' });
      for (const z of [-0.04, 0.04]) put(G.box(0.004, 0.006, 0.012, 0.002), M.black(), usb, [0.55, FLOOR + 0.2, z]);
      for (const z of [-0.04, 0.04]) put(G.box(0.004, 0.006, 0.012, 0.002), M.black(), usb, [-0.456, FLOOR + 0.08, z]);
      const sub = part(it, { he: 'מערכת שמע (רמקולים + סאב־וופר)', en: 'Audio system (speakers + subwoofer)', mat: 'רמקולים + מגבר', desc: 'מערכת שמע עם כ־15 רמקולים וסאב־וופר בתא המטען, ובג׳וניפר גם ביטול רעשים אקטיבי.' });
      put(G.cyl(0.1, 0.1, 0.1, 24, 'z'), M.plastic(0x101113, 0.6), sub, [-1.95, 0.52, 0.6]);
      put(G.cyl(0.08, 0.08, 0.006, 24, 'z'), M.satin(), sub, [-1.95, 0.52, 0.548]);
      for (const z of [-0.45, 0.45]) put(G.cyl(0.04, 0.04, 0.02, 18, 'y'), M.plastic(0x101113, 0.6), sub, [0.75, 0.985, z]);
      const hr = part(it, { he: 'תא אחסון בקונסולה', en: 'Console storage bin', mat: 'פלסטיק + ריפוד', desc: 'תא עמוק מתחת למשענת היד, עם מגש נשלף.' });
      put(G.box(0.3, 0.14, 0.2, 0.01), M.plastic(0x101113, 0.7), hr, [-0.2, FLOOR + 0.18, 0]);
      const bd = sys('body');
      const wf = part(bd, { he: 'מיכל נוזל שמשות', en: 'Washer fluid reservoir', mat: 'פוליאתילן', desc: 'מיכל נוזל ניקוי בפינת תא המטען הקדמי, עם פקק כחול.' });
      put(G.soft(0.14, 0.16, 0.12, { r: 0.03, seg: 3 }), M.plastic(0xd8dade, 0.4), wf, [1.3, 0.62, 0.62]);
      put(G.cyl(0.025, 0.025, 0.02, 12, 'y'), M.plastic(0x1f5fbf, 0.4), wf, [1.3, 0.71, 0.62]);
      const jk = part(bd, { he: 'נקודות הרמה (4)', en: 'Jack points (×4)', mat: 'פלדה + פקק גומי', desc: 'ארבע נקודות מסומנות בתחתית שבהן מרימים את הרכב בלי לפגוע בסוללה.' });
      for (const x of [AXF - 0.5, AXR + 0.5]) for (const z of [-0.7, 0.7]) put(G.cyl(0.03, 0.03, 0.02, 16, 'y'), M.rubber(), jk, [x, 0.165, z]);
      const th = part(bd, { he: 'מכסה וו גרירה', en: 'Tow-eye cover', mat: 'פלסטיק צבוע', desc: 'מכסה קטן בפגוש הקדמי. מאחוריו מוברג וו הגרירה שנמצא בתא המטען.' });
      { const x = XF - 0.12, v = vAtY(x, 0.45, 1), g = new THREE.Group(); g.position.copy(onBody(x, v, 0.001)); g.quaternion.setFromUnitVectors(V3(0, 1, 0), nrm(x, v)); th.add(g); put(G.cyl(0.025, 0.025, 0.004, 16, 'y'), PAINT, g); }
      const fl2 = part(bd, { he: 'מנעול תא המטען הקדמי', en: 'Frunk latch', mat: 'פלדה + מנוע חשמלי', desc: 'מנעול כפול עם מנוע חשמלי, ובתוך התא ידית חירום זוהרת לפתיחה מבפנים.' });
      put(G.box(0.06, 0.05, 0.08, 0.008), M.steel(), fl2, [1.82, 0.7, 0]);
    }

    // ================================================================== ANIMATION: wheels spin while "drive" is on
    let speed = 0;
    K.toggle('drive', { he: 'נסיעה', key: 'g', seconds: 1.4 }, (t) => { speed = t * 6; });
    K.onFrame((time, dt) => { if (speed > 0.01) for (const sp of spinners) sp.o.rotation.z -= (sp.s * speed * dt) / TIRE_R; });
  },
};
