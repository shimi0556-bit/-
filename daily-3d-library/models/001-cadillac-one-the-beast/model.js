// #001 — Cadillac One "The Beast" (2018), the US presidential state car.
// Built entirely in code with the library kit (engine/kit.js): no model files,
// no images. Units are metres. Axes: +x = forward, +y = up, +z = right
// (passenger side; the driver sits at -z). s = +1 right, -1 left.
//
// Body construction: the lower body and the greenhouse are two parametric
// surfaces S(x, v) — x along the car, v around the cross-section. Doors, hood,
// trunk lid and every window are patches cut from the same surfaces, and the
// holes they leave line up exactly because the samplers share break points.

window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, surface, samples, cap, lerp, smooth, clamp, instances } = K;

    // ------------------------------------------------------------------ key dimensions
    const XF = 2.68, XR = -2.66;              // body front / rear face (bumpers add ~9 cm each)
    const AXF = 1.80, AXR = -1.65;            // axles → wheelbase 3.45 m
    const TIRE_R = 0.464, TIRE_W = 0.255;     // 255/70 R22.5
    const WHEEL_Z = 0.885;                    // track ≈ 1.77 m
    const ARCH_R = 0.575;                     // wheel-arch radius (centred on the floor line)
    const HW = 1.025;                         // half body width → 2.05 m
    const BELT = 1.262, ROOF = 1.785;         // beltline, roof
    const RB = 0.055, RT = 0.085, BULGE = 0.012, W_IN = 0.60;
    const FLOOR = 0.40;                       // armoured under-tray
    const CABIN_FLOOR = 0.705;                // top of the carpet (floor armour sits on the frame rails)
    const FD = [0.95, 0.035], RD = [-0.035, -1.02]; // front / rear door x ranges (hinge first)
    const HOOD = [1.045, XF - 0.09], TRUNK = [XR + 0.09, -1.74];
    const COWL = 0.985, BACK = -1.69;         // greenhouse base front / rear
    const WS_TOP = 0.42, BL_TOP = -1.38;      // windshield top / formal, upright backlight top
    const GAP = 0.0035;                       // panel shut-line gap
    const ctxShared = { doors: [] };          // handles shared between sections (doors, hood…)

    // ------------------------------------------------------------------ section parameters
    const W = (x) => {
      const rf = 0.17, rr = 0.19;
      if (x > XF - rf) { const d = x - (XF - rf); return HW - rf + Math.sqrt(Math.max(0, rf * rf - d * d)); }
      if (x < XR + rr) { const d = XR + rr - x; return HW - rr + Math.sqrt(Math.max(0, rr * rr - d * d)); }
      return HW;
    };
    const Y1 = (x) => {
      if (x >= 1.0) return BELT - 0.085 * Math.pow((x - 1.0) / (XF - 1.0), 1.6);
      if (x <= BACK) return BELT - 0.045 * Math.pow((BACK - x) / (BACK - XR), 2);
      return BELT;
    };
    const Y0 = (x) => {
      let y = FLOOR;
      if (x > 2.36) y += 0.10 * Math.pow((x - 2.36) / (XF - 2.36), 2);
      if (x < -2.26) y += 0.09 * Math.pow((-2.26 - x) / (-2.26 - XR), 2);
      return y;
    };
    const YA = (x) => {
      for (const ax of [AXF, AXR]) { const d = Math.abs(x - ax); if (d < ARCH_R) return Math.max(Y0(x), FLOOR + Math.sqrt(ARCH_R * ARCH_R - d * d)); }
      return Y0(x);
    };
    const SW = (x) => 0.035 + 0.065 * (smooth(0.96, 1.06, x) + (1 - smooth(-1.8, -1.67, x)));
    const WG = (x) => W(x) - RT - SW(x);
    const CROWN = (x) => (x > 0 ? 0.03 : 0.018);
    const YR = (x) => {
      if (x >= COWL || x <= BACK) return Y1(x);
      if (x > WS_TOP) { const t = (COWL - x) / (COWL - WS_TOP); return BELT + (ROOF - BELT) * (1 - Math.pow(1 - t, 1.7)); }
      if (x >= BL_TOP) return ROOF + 0.006 * Math.sin((Math.PI * (x - BL_TOP)) / (WS_TOP - BL_TOP));
      const t = (x - BACK) / (BL_TOP - BACK); return BELT + (ROOF - BELT) * (1 - Math.pow(1 - t, 1.5));
    };

    // lower body: v in [-1,1], 0 = top centre, ±1 = bottom centre
    const LV = { deck: 0.3, shoulder: 0.38, cornerT: 0.48, side: 0.78, cornerB: 0.85, well: 0.91, wellIn: 0.95 };
    const lowSec = (x, v) => {
      const s = v < 0 ? -1 : 1, a = Math.min(1, Math.abs(v));
      const w = W(x), y1 = Y1(x), y0 = Y0(x), ya = YA(x), wg = WG(x), cr = CROWN(x);
      let y, z;
      const seg = (a0, a1) => (a - a0) / (a1 - a0);
      if (a <= LV.deck) { const t = a / LV.deck; z = wg * t; y = y1 + cr * (1 - t * t); }
      else if (a <= LV.shoulder) { const t = seg(LV.deck, LV.shoulder); z = lerp(wg, w - RT, t); y = y1; }
      else if (a <= LV.cornerT) { const t = seg(LV.shoulder, LV.cornerT) * Math.PI / 2; z = w - RT + RT * Math.sin(t); y = y1 - RT + RT * Math.cos(t); }
      else if (a <= LV.side) { const t = seg(LV.cornerT, LV.side); y = lerp(y1 - RT, ya + RB, t); z = w + BULGE * Math.sin(Math.PI * t); }
      else if (a <= LV.cornerB) { const t = seg(LV.side, LV.cornerB) * Math.PI / 2; z = w - RB + RB * Math.cos(t); y = ya + RB - RB * Math.sin(t); }
      else if (a <= LV.well) { const t = seg(LV.cornerB, LV.well); z = lerp(w - RB, W_IN, t); y = ya; }
      else if (a <= LV.wellIn) { const t = seg(LV.well, LV.wellIn); z = W_IN; y = lerp(ya, y0, t); }
      else { const t = seg(LV.wellIn, 1); z = lerp(W_IN, 0, t); y = y0; }
      return V3(x, y, s * z);
    };
    // greenhouse: open ring, v in [-1,1], 0 = roof centre, ±1 = beltline
    const GV = { roof: 0.55, corner: 0.72 };
    const gSec = (x, v) => {
      const s = v < 0 ? -1 : 1, a = Math.min(1, Math.abs(v));
      const yb = Y1(x), wb = WG(x), yr = YR(x), hh = Math.max(0, yr - yb), k = hh / (ROOF - BELT);
      const rr = Math.min(0.11, 0.45 * hh), wt = wb - 0.105 * k, crown = 0.025 * k;
      let y, z;
      if (a <= GV.roof) { const t = a / GV.roof; z = (wt - rr) * t; y = yr + crown * (1 - t * t); }
      else if (a <= GV.corner) { const t = ((a - GV.roof) / (GV.corner - GV.roof)) * Math.PI / 2; z = wt - rr + rr * Math.sin(t); y = yr - rr + rr * Math.cos(t); }
      else { const t = (a - GV.corner) / (1 - GV.corner); z = lerp(wt, wb, t); y = lerp(yr - rr, yb, t); }
      return V3(x, y, s * z);
    };
    const outLow = (p, x) => V3(0, p.y - (Y0(x) + Y1(x)) / 2, p.z);
    // a point `depth` inside the greenhouse skin (between the skin and the trim), right side
    const inG = (x, v, depth) => { const p = gSec(x, v); return p.addScaledVector(V3(0, BELT - 0.2 - p.y, -p.z).normalize(), depth); };
    const outG = (p, x) => V3(0, p.y - BELT + 0.2, p.z);

    // point + outward normal on the body side at height y (s = side)
    const sideAt = (x, y, s = 1) => {
      const y1 = Y1(x), ya = YA(x);
      const t = clamp((y1 - RT - y) / (y1 - RT - ya - RB));
      const v = s * (LV.cornerT + (LV.side - LV.cornerT) * t);
      const p = lowSec(x, v);
      const du = lowSec(x + 1e-3, v).sub(lowSec(x - 1e-3, v)), dv = lowSec(x, v + 1e-3).sub(lowSec(x, v - 1e-3));
      const n = du.cross(dv).normalize(); if (n.z * s < 0) n.negate();
      return { p, n, v };
    };

    // shared samplers so holes and patches line up
    const arcStep = (v) => { const a = Math.abs(v); return (a > LV.shoulder && a < LV.cornerT) || (a > LV.side && a < LV.cornerB) ? 0.012 : 0.03; };
    const lowBreaks = [LV.deck, LV.shoulder, LV.cornerT, 0.74, LV.side, LV.cornerB, LV.well, LV.wellIn];
    const lowVs = samples(-1, 1, arcStep, [...lowBreaks, ...lowBreaks.map((b) => -b), 0]);
    const xStep = (x) => (x > XF - 0.25 || x < XR + 0.25 ? 0.012 : Math.abs(x - AXF) < ARCH_R + 0.02 || Math.abs(x - AXR) < ARCH_R + 0.02 ? 0.022 : 0.05);
    const xBreaks = [...FD, ...RD, ...HOOD, ...TRUNK, COWL, BACK, AXF - ARCH_R, AXF + ARCH_R, AXR - ARCH_R, AXR + ARCH_R, XF - 0.17, XR + 0.19, WS_TOP, BL_TOP];
    const lowXs = samples(XR, XF, xStep, xBreaks);
    const gStep = (v) => { const a = Math.abs(v); return a > GV.roof && a < GV.corner ? 0.015 : 0.035; };
    const gBreaks = [GV.roof, GV.corner, 0.53, 0.745, 0.985];
    const gVs = samples(-1, 1, gStep, [...gBreaks, ...gBreaks.map((b) => -b), 0]);
    const gXs = samples(BACK, COWL, (x) => (x > WS_TOP || x < BL_TOP ? 0.025 : 0.06), xBreaks.filter((b) => b > BACK && b < COWL));

    const inX = (x, r) => x <= Math.max(...r) && x >= Math.min(...r);
    const PAINT = M.paint(0x07080b);

    // ================================================================== BODY
    {
      const body = sys('body');
      const shell = part(body, { he: 'מעטפת המרכב', en: 'Body shell', mat: 'פלדה בעובי מיליטרי + צבע שחור מתכתי ושכבת לכה', desc: 'המרכב החיצוני: כנפיים, ספים, גג תא המטען וקורות הגג. מתחת לפח — שלד שריון מלא. הגזרה מבוססת על קדילק אסקלייד ו־CT6, אך כל לוח מותאם לשריון.' });
      const skipLow = (x, v) => {
        const a = Math.abs(v);
        if (a < LV.deck && inX(x, [COWL, BACK])) return true;                 // greenhouse sits here
        if (a < LV.deck && (inX(x, HOOD) || inX(x, TRUNK))) return true;      // hood / trunk lid
        if (a > LV.deck && a < 0.74 && (inX(x, FD) || inX(x, RD))) return true; // doors
        return false;
      };
      mesh(surface(lowSec, lowXs, lowVs, { skip: skipLow, out: outLow }), PAINT, { parent: shell, name: 'lower body' });
      const ring = (x) => lowVs.map((v) => lowSec(x, v));
      mesh(cap(ring(XF).slice(0, -1), V3(1, 0, 0)), PAINT, { parent: shell, name: 'front face' });
      mesh(cap(ring(XR).slice(0, -1), V3(-1, 0, 0)), PAINT, { parent: shell, name: 'rear face' });

      const skipG = (x, v) => {
        const a = Math.abs(v);
        if (a < 0.55 && (inX(x, [COWL, WS_TOP]) || inX(x, [BL_TOP, BACK]))) return true; // windshield / backlight
        if (a > GV.corner && (inX(x, FD) || inX(x, RD))) return true;                      // door frames
        return false;
      };
      const roof = part(body, { he: 'גג ועמודים', en: 'Roof & pillars', mat: 'פלדה משוריינת, צבע שחור', desc: 'הגג ועמודי A,‏ B ו־C. העמודים עבים במיוחד כי הם נושאים את משקל זכוכית השריון ואת לוח השריון שבגג.' });
      mesh(surface(gSec, gXs, gVs, { skip: skipG, out: outG }), PAINT, { parent: roof, name: 'greenhouse' });

      // hood (opens on rear hinges)
      const hoodPivot = V3(HOOD[0], Y1(HOOD[0]) + CROWN(HOOD[0]) - 0.01, 0);
      const hood = part(body, { he: 'מכסה מנוע', en: 'Hood', mat: 'פלדת שריון + צבע', desc: 'מכסה מנוע משוריין, נפתח קדימה על צירים אחוריים. כבד מספיק כדי שיידרשו שתי בוכנות גז להחזיק אותו פתוח.' });
      hood.position.copy(hoodPivot);
      const hx = samples(HOOD[0] + GAP, HOOD[1] - GAP, xStep, xBreaks), hv = samples(-LV.deck + 0.004, LV.deck - 0.004, 0.02, [0]);
      const hg = surface(lowSec, hx, hv, { out: outLow, thickness: 0.018 }); hg.translate(-hoodPivot.x, -hoodPivot.y, 0);
      mesh(hg, [PAINT, M.black()], { parent: hood, name: 'hood skin' });
      // under-hood insulation + bracing
      const hinner = surface(lowSec, samples(HOOD[0] + 0.06, HOOD[1] - 0.06, 0.06), samples(-0.26, 0.26, 0.03, [0]), { out: outLow, offset: -0.03, thickness: 0.012 });
      hinner.translate(-hoodPivot.x, -hoodPivot.y, 0);
      mesh(hinner, M.fabric(0x26282c), { parent: hood, name: 'hood insulation' });
      K.toggle('hood', { he: 'מכסה מנוע', key: 'h', seconds: 1.4 }, (t) => { hood.rotation.z = 0.95 * Math.sin((t * Math.PI) / 2); });

      // trunk lid (opens on front hinges)
      const trunkPivot = V3(TRUNK[1], Y1(TRUNK[1]) + CROWN(TRUNK[1]) - 0.01, 0);
      const trunk = part(body, { he: 'מכסה תא מטען', en: 'Trunk lid', mat: 'פלדת שריון + צבע', desc: 'מכסה תא המטען המשוריין. מתחתיו: מכלי חמצן, מערכת כיבוי, מקרר מנות דם וציוד תקשורת.' });
      trunk.position.copy(trunkPivot);
      const tg = surface(lowSec, samples(TRUNK[0] + GAP, TRUNK[1] - GAP, xStep, xBreaks), samples(-LV.deck + 0.004, LV.deck - 0.004, 0.02, [0]), { out: outLow, thickness: 0.018 });
      tg.translate(-trunkPivot.x, -trunkPivot.y, 0);
      mesh(tg, [PAINT, M.black()], { parent: trunk, name: 'trunk skin' });
      K.toggle('trunk', { he: 'תא מטען', key: 't', seconds: 1.4 }, (t) => { trunk.rotation.z = -1.05 * Math.sin((t * Math.PI) / 2); });

      Object.assign(ctxShared, { hood, trunk, hoodPivot, trunkPivot });
    }

    // ================================================================== DOORS + GLASS
    // window stack: outer glass ply, alternating glass / polycarbonate, spall liner
    const GLASS_PLIES = [
      { off: 0.004, t: 0.012, m: () => M.glass(0x05080a, 0.8), he: 'שכבת זכוכית חיצונית מוקשית' },
      { off: -0.014, t: 0.02, m: () => M.polycarb(), he: 'שכבת פוליקרבונט 1' },
      { off: -0.04, t: 0.016, m: () => M.glass(0x0f1a1c, 0.14), he: 'שכבת זכוכית 2' },
      { off: -0.062, t: 0.02, m: () => M.polycarb(), he: 'שכבת פוליקרבונט 2' },
      { off: -0.088, t: 0.016, m: () => M.glass(0x0f1a1c, 0.14), he: 'שכבת זכוכית 3' },
      { off: -0.11, t: 0.012, m: () => M.polycarb(), he: 'ציפוי נגד רסיסים (פנימי)' },
    ];
    const glassStack = (parent, S, xs, vs, out, info, pivot) => {
      const g = part(parent, info);
      GLASS_PLIES.forEach((ply, i) => {
        const geo = surface(S, xs, vs, { out, offset: ply.off, thickness: ply.t });
        if (pivot) geo.translate(-pivot.x, -pivot.y, -pivot.z);
        const m = mesh(geo, ply.m(), { parent: g, name: ply.he, cast: i === 0 });
        m.renderOrder = 2 + i;
      });
      return g;
    };
    {
      const doorsSys = sys('doors'), glassSys = sys('glass');
      const doorDefs = [
        { r: FD, front: true }, { r: RD, front: false },
      ];
      for (const s of [1, -1]) for (const d of doorDefs) {
        const sideHe = s > 0 ? 'ימנית' : 'שמאלית';
        const posHe = d.front ? 'קדמית' : 'אחורית';
        const who = d.front ? (s > 0 ? 'דלת המפקד (סוכן השירות החשאי)' : 'דלת הנהג') : (s > 0 ? 'דלת הנשיא' : 'דלת אחורית');
        const x0 = d.r[0], x1 = d.r[1];
        const hingeP = sideAt(x0, 0.9, s).p; const pivot = V3(x0, 0.9, hingeP.z);
        const door = part(doorsSys, { he: `דלת ${posHe} ${sideHe}`, en: `${d.front ? 'Front' : 'Rear'} ${s > 0 ? 'right' : 'left'} door`, mat: 'פלדה, קרמיקה, קבלר, טיטניום, אלומיניום', desc: `${who}. עובי כ־20 ס״מ ומשקל של דלת מטוס — ולכן היא נשענת על שלושה צירים כבדים. הידית החיצונית יכולה להיות מחושמלת.` });
        door.position.copy(pivot);
        const tr = (g) => { g.translate(-pivot.x, -pivot.y, -pivot.z); return g; };
        const xs = samples(x0 - GAP * Math.sign(x0 - x1), x1 + GAP * Math.sign(x0 - x1), 0.04, xBreaks);
        const vs = samples(s * LV.deck, s * (0.74 - 0.004), arcStep, [LV.shoulder, LV.cornerT].map((b) => s * b));
        const skin = part(door, { he: 'פח חיצוני', en: 'Outer skin', mat: 'פלדה 3 מ״מ + צבע', desc: 'הפח הצבוע שרואים מבחוץ. מאחוריו מסתתרות שכבות השריון.' });
        mesh(tr(surface(lowSec, xs, vs, { out: outLow, thickness: 0.006 })), [PAINT, M.black()], { parent: skin });
        // window frame (blacked out) + glass in the greenhouse part of the door
        const gvs = samples(s * (GV.corner + 0.006), s * 1, gStep, [0.745, 0.985].map((b) => s * b));
        const gxs = samples(x0 - GAP * Math.sign(x0 - x1), x1 + GAP * Math.sign(x0 - x1), 0.03, [x0 - 0.05 * Math.sign(x0 - x1), x1 + 0.05 * Math.sign(x0 - x1), WS_TOP]);
        const wx0 = Math.min(x0, x1) + 0.05, wx1 = Math.max(x0, x1) - 0.05;
        const frame = part(door, { he: 'מסגרת חלון', en: 'Window frame', mat: 'פלדה + צבע שחור מבריק', desc: 'מסגרת החלון המשוריינת. נושאת זכוכית במשקל של עשרות קילוגרמים.' });
        mesh(tr(surface(gSec, gxs, gvs, { out: outG, thickness: 0.13, skip: (x, v) => x > wx0 && x < wx1 && Math.abs(v) > 0.745 && Math.abs(v) < 0.985 })), M.gloss(0x060708), { parent: frame });
        const glass = glassStack(glassSys, gSec, samples(wx0 + 0.003, wx1 - 0.003, 0.03, [WS_TOP]), samples(s * 0.748, s * 0.982, 0.03), outG,
          { he: `חלון ${posHe} ${sideHe}`, en: `${d.front ? 'Front' : 'Rear'} ${s > 0 ? 'right' : 'left'} window`, mat: 'זכוכית + פוליקרבונט, ~13 ס״מ', desc: `חלון שריון רב־שכבתי: זכוכית חיצונית מוקשית, שכבות פוליקרבונט וזכוכית לסירוגין, וציפוי פנימי שעוצר רסיסים. ${d.front && s < 0 ? 'זה החלון היחיד ברכב שנפתח — כ־7.5 ס״מ בלבד, כדי שהנהג יוכל לדבר עם השומרים.' : 'החלון אינו נפתח.'}` }, pivot);
        door.add(glass); // glass rides with the door (it's still listed under "glass")
        glass.userData.sysOverride = 'glass';
        ctxShared.doors.push({ door, s, front: d.front, x0, x1, pivot, tr });
      }
      K.toggle('doors', { he: 'דלתות', key: 'd', seconds: 1.6 }, (t) => {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        for (const d of ctxShared.doors) d.door.rotation.y = d.s * e * (d.front ? 1.1 : 1.15);
      });

      // windshield + backlight + black ceramic frit
      const ws = glassStack(glassSys, gSec, samples(COWL - 0.004, WS_TOP + 0.006, 0.03), samples(-0.545, 0.545, 0.025, [0]), outG,
        { he: 'שמשה קדמית', en: 'Windshield', mat: 'זכוכית שריון רב־שכבתית, ~13 ס״מ', desc: 'שמשה קדמית משוריינת. עוצרת ירי של נשק אוטומטי, ובכל זאת מספקת לנהג ראות כמעט ללא עיוות.' });
      const bl = glassStack(glassSys, gSec, samples(BL_TOP - 0.006, BACK + 0.004, 0.03), samples(-0.545, 0.545, 0.025, [0]), outG,
        { he: 'שמשה אחורית', en: 'Rear window', mat: 'זכוכית שריון רב־שכבתית', desc: 'שמשה אחורית משוריינת. מאחוריה, בחלק העליון, נורות חירום אדומות־כחולות.' });
      void ws; void bl;
      const frit = part(sys('body'), { he: 'מסגרת קרמית שחורה', en: 'Ceramic frit band', mat: 'קרמיקה מודפסת על זכוכית', desc: 'פס שחור קרמי בשולי השמשות שמסתיר את הדבק ומגן עליו מקרינת UV.' });
      const fx = samples(COWL - 0.004, WS_TOP + 0.006, 0.03, [COWL - 0.06, WS_TOP + 0.05]), fv = samples(-0.545, 0.545, 0.025, [-0.49, 0.49, 0]);
      mesh(surface(gSec, fx, fv, { out: outG, offset: 0.001, skip: (x, v) => x < COWL - 0.06 && x > WS_TOP + 0.05 && Math.abs(v) < 0.49 }), M.gloss(0x050505), { parent: frit });
      const bx = samples(BL_TOP - 0.006, BACK + 0.004, 0.03, [BL_TOP - 0.05, BACK + 0.05]);
      mesh(surface(gSec, bx, fv, { out: outG, offset: 0.001, skip: (x, v) => x < BL_TOP - 0.05 && x > BACK + 0.05 && Math.abs(v) < 0.49 }), M.gloss(0x050505), { parent: frit });
    }

    // ================================================================== WHEELS
    // Built along a local z axle (outer face = +z) and turned 180° for the left
    // side, so sidewall lettering always reads correctly (a mirror would flip it).
    const RIM_R = 0.2858; // 22.5" bead seat
    const wheelSpots = [], wheelPos = [];
    for (const x of [AXF, AXR]) for (const s of [1, -1]) wheelSpots.push({ x, s, front: x > 0 });
    {
      const wheels = sys('wheels');
      const tireSide = (sgn) => [[0.297, 0.106], [0.29, 0.098], [0.3, 0.108], [0.33, 0.12], [0.37, 0.1265], [0.405, 0.1255], [0.43, 0.1195], [0.446, 0.111], [0.452, 0.1]].map(([r, w]) => [r, sgn * w]);
      const tireProfile = [...tireSide(-1), [0.453, -0.07], [0.454, 0], [0.453, 0.07], ...tireSide(1).reverse()];
      const tireMat = M.tire(); tireMat.side = THREE.DoubleSide;
      const tireGeo = G.lathe(tireProfile, 120, 'z');
      // 5 tread ribs (Regional RHS steer pattern) + sipes
      const ribs = [-0.084, -0.042, 0, 0.042, 0.084];
      const ribGeo = G.merge(ribs.map((w) => G.lathe([[0.4515, w - 0.016], [0.4635, w - 0.014], [0.4642, w], [0.4635, w + 0.014], [0.4515, w + 0.016]], 120, 'z')));
      const sipeGeo = G.box(0.008, 0.0026, 0.024);
      const sipeList = [];
      ribs.forEach((w, k) => { for (let i = 0; i < 84; i++) { const a = ((i + (k % 2) * 0.5) / 84) * Math.PI * 2; sipeList.push({ pos: [Math.cos(a) * 0.4625, Math.sin(a) * 0.4625, w], rot: [0, 0, a + (k % 2 ? 0.25 : -0.25) * 0], scale: [1, 1, k === 0 || k === 4 ? 1.2 : 1] }); } });
      // lettering band that follows the outer sidewall
      const band = [[0.335, 0.1215], [0.36, 0.1253], [0.385, 0.1275], [0.405, 0.127], [0.425, 0.1225]].map(([r, w]) => [r, w + 0.0016]);
      let bandLen = 0; for (let i = 1; i < band.length; i++) bandLen += Math.hypot(band[i][0] - band[i - 1][0], band[i][1] - band[i - 1][1]);
      const TW_PX = 4096, TH_PX = 192, stretch = (TW_PX / (2 * Math.PI * 0.38)) / (TH_PX / bandLen);
      const letterTex = K.canvasTexture(TW_PX, TH_PX, (g, w, h) => {
        g.fillStyle = '#d4d4d4'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const put = (txt, u, px, weight = 900) => { g.save(); g.translate(u * w, h / 2); g.scale(-stretch, 1); g.font = `${weight} ${px}px Arial, Helvetica, sans-serif`; g.fillText(txt, 0, 0); g.restore(); };
        put('GOODYEAR', 0.07, 120); put('GOODYEAR', 0.57, 120);
        put('REGIONAL RHS', 0.21, 70); put('REGIONAL RHS', 0.71, 70);
        put('255/70R22.5', 0.32, 64, 700); put('255/70R22.5', 0.82, 64, 700);
        put('KEVLAR REINFORCED · RUN-FLAT', 0.42, 34, 700); put('LOAD RANGE H · 16 PLY', 0.92, 34, 700);
        put('DOT 4X7K H18W 2518', 0.48, 26, 500);
      });
      const letterMat = new THREE.MeshStandardMaterial({ map: letterTex, transparent: true, alphaTest: 0.3, roughness: 0.75, side: THREE.DoubleSide });
      const letterGeo = G.lathe(band, 160, 'z');

      // aluminium disc with 10 hand holes and 10 stud holes
      const disc = new THREE.Shape(); disc.absarc(0, 0, 0.274, 0, Math.PI * 2, false);
      disc.holes.push(G.circlePath(0.111, 0, 0, true));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, b = a + Math.PI / 10;
        disc.holes.push(G.circlePath(0.0135, Math.cos(a) * 0.14288, Math.sin(a) * 0.14288, true));
        const hp = new THREE.Path(); hp.absellipse(Math.cos(b) * 0.212, Math.sin(b) * 0.212, 0.026, 0.045, 0, Math.PI * 2, true, b); disc.holes.push(hp);
      }
      const discGeo = G.extrude(disc, 0.016, { bevel: 0.003, bevelSeg: 2, curveSeg: 12 });
      const barrelGeo = G.lathe([[0.3, -0.113], [0.297, -0.106], [RIM_R, -0.1], [0.279, -0.062], [0.271, -0.025], [0.271, 0.035], [0.279, 0.066], [RIM_R, 0.1], [0.297, 0.106], [0.3, 0.113]], 96, 'z');
      const flareGeo = G.lathe([[0.272, 0.078], [0.283, 0.09], [0.293, 0.104], [0.299, 0.112]], 96, 'z');
      const hubGeo = G.lathe([[0.08, -0.07], [0.095, -0.06], [0.109, -0.02], [0.109, 0.1], [0.104, 0.106], [0.0, 0.106]], 48, 'z');
      const capGeo = G.lathe([[0.0, 0.104], [0.103, 0.104], [0.108, 0.108], [0.107, 0.116], [0.1, 0.128], [0.088, 0.141], [0.072, 0.151], [0.058, 0.156], [0.054, 0.1575], [0.0, 0.1575]], 64, 'z');
      const nutGeo = G.merge([
        G.at(G.cyl(0.0185, 0.0185, 0.022, 6, 'z'), [0, 0, 0.011]),
        G.at(G.cyl(0.024, 0.024, 0.005, 24, 'z'), [0, 0, 0.0025]),
        G.at(G.lathe([[0.0175, 0], [0.017, 0.012], [0.012, 0.022], [0.0, 0.026]], 16, 'z'), [0, 0, 0.022]),
      ]);
      const insertGeo = G.lathe([[RIM_R + 0.002, -0.07], [0.33, -0.075], [0.362, -0.06], [0.37, 0], [0.362, 0.06], [0.33, 0.075], [RIM_R + 0.002, 0.07]], 72, 'z');
      const crestTex = crestTexture(K);
      const crestMat = M.decal(crestTex, { metalness: 0.3, roughness: 0.25, clearcoat: 1 });

      const DISC_W = 0.072;
      for (const ws of wheelSpots) {
        const sideHe = ws.s > 0 ? 'ימני' : 'שמאלי', posHe = ws.front ? 'קדמי' : 'אחורי';
        const wheel = part(wheels, { he: `גלגל ${posHe} ${sideHe}`, en: `${ws.front ? 'Front' : 'Rear'} ${ws.s > 0 ? 'right' : 'left'} wheel`, desc: 'מכלול גלגל של משאית: צמיג 255/70R22.5, חישוק אלומיניום מלוטש 22.5 אינץ׳, 10 אומים, טבעת ראן־פלאט פנימית. כל מכלול שוקל קרוב ל־100 ק״ג.' }, { pos: [ws.x, TIRE_R, ws.s * WHEEL_Z], rot: [0, ws.s > 0 ? 0 : Math.PI, 0] });
        wheelPos.push(wheel.position.clone());
        const tire = part(wheel, { he: 'צמיג Goodyear Regional RHS', en: 'Goodyear Regional RHS 255/70R22.5', mat: 'גומי, חגורות פלדה, שכבות קבלר', desc: 'צמיג משאית מחוזק בקבלר בעובי של 16 שכבות. גם אם יינקב, הרכב ימשיך לנסוע על טבעת הראן־פלאט שבתוכו.' });
        tire.userData.explodeLocal = V3(0, 0, 0.42);
        mesh(tireGeo, tireMat, { parent: tire, name: 'carcass' });
        mesh(ribGeo, tireMat, { parent: tire, name: 'tread ribs' });
        instances(sipeGeo, M.black(), sipeList, { parent: tire, cast: false });
        mesh(letterGeo, letterMat, { parent: tire, name: 'sidewall lettering', cast: false });
        const rim = part(wheel, { he: 'חישוק אלומיניום 22.5″', en: '22.5×8.25 forged aluminium wheel', mat: 'אלומיניום מחושל ומלוטש', desc: 'חישוק משאית מחושל עם 10 חורי ידיים לקירור הבלמים ו־10 חורי ברגים על קוטר 285.75 מ״מ. מרכוז על הרכזת (hub-piloted).' });
        rim.userData.explodeLocal = V3(0, 0, 0.2);
        const alu = M.aluminum();
        mesh(barrelGeo, alu, { parent: rim, name: 'barrel' });
        mesh(discGeo, alu, { parent: rim, name: 'disc', pos: [0, 0, DISC_W] });
        mesh(flareGeo, alu, { parent: rim, name: 'face flare' });
        mesh(hubGeo, M.darkSteel(), { parent: rim, name: 'hub' });
        // valve stem through a hand hole
        mesh(G.merge([G.at(G.cyl(0.005, 0.005, 0.07, 10, 'z'), [0, 0, 0.035]), G.at(G.cyl(0.0065, 0.0065, 0.014, 10, 'z'), [0, 0, 0.074])]), M.chrome(), { parent: rim, pos: [Math.cos(0.31) * 0.262, Math.sin(0.31) * 0.262, 0.03], name: 'valve stem' });
        // balance weights on the inner barrel
        for (const a of [1.2, 1.32, 4.1]) mesh(G.box(0.025, 0.006, 0.016), M.steel(), { parent: rim, pos: [Math.cos(a) * 0.268, Math.sin(a) * 0.268, -0.07], rot: [0, 0, a + Math.PI / 2], name: 'balance weight' });
        const nuts = part(wheel, { he: '10 אומי גלגל', en: '10 × M22 flange nuts with chrome caps', mat: 'פלדה + כיסויי כרום', desc: 'אומי M22 עם פלנג׳ משולב, מהודקים במומנט של כ־620 ניוטון־מטר, עם כיסויי כרום.' });
        nuts.userData.explodeLocal = V3(0, 0, 0.55);
        instances(nutGeo, M.chrome(), Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return { pos: [Math.cos(a) * 0.14288, Math.sin(a) * 0.14288, DISC_W + 0.011] }; }), { parent: nuts });
        const capP = part(wheel, { he: 'כיסוי רכזת עם סמל קדילק', en: 'Hub cover with Cadillac crest', mat: 'נירוסטה מלוטשת', desc: 'כיסוי הרכזת המרכזי, עם סמל קדילק צבעוני.' });
        capP.userData.explodeLocal = V3(0, 0, 0.7);
        mesh(capGeo, M.aluminum(), { parent: capP, name: 'cap' });
        mesh(G.torus(0.0505, 0.0035, 8, 48, Math.PI * 2, 'z'), M.chrome(), { parent: capP, pos: [0, 0, 0.158], name: 'crest bezel' });
        mesh(G.cyl(0.0475, 0.0475, 0.0012, 48, 'z'), M.gloss(0x0b0b0c), { parent: capP, pos: [0, 0, 0.1581], name: 'crest backing' });
        mesh(new THREE.CircleGeometry(0.046, 48), crestMat, { parent: capP, pos: [0, 0, 0.1589], name: 'crest' });
        mesh(G.torus(0.1065, 0.0015, 4, 48, Math.PI * 2, 'z'), M.black(), { parent: capP, pos: [0, 0, 0.105], name: 'cap seam' });
        const ins = part(wheel, { he: 'טבעת ראן־פלאט', en: 'Run-flat insert', mat: 'פוליאוריתן/קבלר קשיח', desc: 'טבעת קשיחה בתוך הצמיג. אם האוויר יוצא, הצמיג נשען עליה והרכב ממשיך לנסוע מהר הרחק מהסכנה.' });
        mesh(insertGeo, M.plastic(0x2a2622, 0.7), { parent: ins });
      }
    }

    // ================================================================== BRAKES + SUSPENSION + STEERING
    {
      const br = sys('brakes');
      const ventGeo = G.box(0.06, 0.004, 0.02);
      const ringGeo = G.lathe([[0.1, 0], [0.19, 0], [0.19, 0.012], [0.1, 0.012]], 64, 'z');
      const hatGeo = G.lathe([[0.112, 0.0], [0.112, 0.05], [0.1, 0.05], [0.1, 0.012]], 48, 'z');
      const sector = (r0, r1, a) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r1, -a, a, false); sh.absarc(0, 0, r0, a, -a, true); return sh; };
      // two caliper halves either side of the rotor + the bridge over its edge
      const calGeo = G.merge([G.at(G.extrude(sector(0.15, 0.232, 0.46), 0.03, { bevel: 0.008 }), [0, 0, 0.047]), G.at(G.extrude(sector(0.15, 0.232, 0.46), 0.03, { bevel: 0.008 }), [0, 0, -0.047]), G.extrude(sector(0.198, 0.236, 0.42), 0.12, { bevel: 0.006 })]);
      const padShape = new THREE.Shape(); padShape.absarc(0, 0, 0.188, -0.38, 0.38, false); padShape.absarc(0, 0, 0.12, 0.38, -0.38, true);
      const padGeo = G.extrude(padShape, 0.012);
      for (const ws of wheelSpots) {
        const { x, s, front } = ws;
        const sideHe = s > 0 ? 'ימני' : 'שמאלי', posHe = front ? 'קדמי' : 'אחורי';
        const cz = s * (WHEEL_Z - 0.06);
        const brake = part(br, { he: `בלם דיסק ${posHe} ${sideHe}`, en: `${front ? 'Front' : 'Rear'} ${s > 0 ? 'right' : 'left'} disc brake`, desc: 'בלם דיסק מאוורר בקוטר 38 ס״מ עם קליפר כפול בוכנות. צריך לעצור רכב של כ־9 טון.' }, { pos: [x, TIRE_R, 0] });
        const rotor = part(brake, { he: 'דיסק מאוורר', en: 'Vented rotor Ø380', mat: 'ברזל יצוק', desc: 'שני משטחי חיכוך עם 36 צלעות אוורור ביניהם שמפזרות את החום.' }, { pos: [0, 0, cz] });
        rotor.userData.explodeLocal = V3(0, 0, s * 0.2);
        mesh(ringGeo, M.castIron(), { parent: rotor, pos: [0, 0, -0.022] });
        mesh(ringGeo, M.castIron(), { parent: rotor, pos: [0, 0, 0.01] });
        mesh(hatGeo, M.castIron(), { parent: rotor, pos: [0, 0, s > 0 ? 0.022 : -0.072] });
        instances(ventGeo, M.castIron(), Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return { pos: [Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.0], rot: [0, 0, a + 0.3] }; }), { parent: rotor });
        const ca = Math.PI * 0.62 * (1) ; // caliper sits rear-top of the rotor
        const cal = part(brake, { he: 'קליפר בלם', en: 'Twin-piston caliper', mat: 'ברזל יצוק צבוע', desc: 'קליפר צף עם שתי בוכנות בקוטר 66 מ״מ. בתוכו שתי רפידות בלם.' }, { pos: [0, 0, cz], rot: [0, 0, ca] });
        cal.userData.explodeLocal = V3(-0.12, 0.15, s * 0.15);
        mesh(calGeo, M.metal(0x2b2d31, 0.45), { parent: cal });
        mesh(padGeo, M.metal(0x6d5a4a, 0.8), { parent: cal, pos: [0, 0, 0.029], name: 'outer pad' });
        mesh(padGeo, M.metal(0x6d5a4a, 0.8), { parent: cal, pos: [0, 0, -0.029], name: 'inner pad' });
        for (const a of [-0.3, 0.3]) mesh(G.bolt(0.012), M.steel(), { parent: cal, pos: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, -0.062 * s], rot: [s > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0], name: 'guide pin bolt' });
        mesh(G.merge([G.cyl(0.004, 0.004, 0.02, 8, 'z'), G.at(G.cyl(0.006, 0.006, 0.006, 6, 'z'), [0, 0, 0.012])]), M.brass(), { parent: cal, pos: [0.215, 0.03, -0.05 * s], name: 'bleeder valve' });
        // brake hose to the frame + ABS sensor
        const hoseStart = V3(x + Math.cos(ca) * 0.2, TIRE_R + Math.sin(ca) * 0.2, cz - s * 0.04);
        const hose = part(br, { he: 'צינור בלם גמיש', en: 'Brake hose', mat: 'גומי משוריין פלדה', desc: 'צינור לחץ גבוה שמעביר את נוזל הבלמים לקליפר.' });
        mesh(G.tube([hoseStart, V3(hoseStart.x - 0.05, hoseStart.y + 0.12, cz - s * 0.12), V3(x - 0.12, 0.74, s * 0.5)], 0.006, 32, 8), M.rubber(), { parent: hose });
        mesh(G.cyl(0.009, 0.009, 0.05, 10, 'x'), M.brass(), { parent: hose, pos: [x - 0.12, 0.74, s * 0.5], name: 'hard line fitting' });
        const abs = part(br, { he: 'חיישן ABS', en: 'ABS wheel-speed sensor', mat: 'פלסטיק + מגנט', desc: 'קורא את מהירות הגלגל 100 פעם בשנייה ומונע נעילה בבלימת חירום.' });
        mesh(G.cyl(0.009, 0.009, 0.05, 12, 'z'), M.plastic(0x1a1a1a), { parent: abs, pos: [x + 0.11, TIRE_R - 0.06, cz - s * 0.07] });
        mesh(G.tube([[x + 0.11, TIRE_R - 0.06, cz - s * 0.1], [x + 0.08, TIRE_R + 0.08, cz - s * 0.16], [x - 0.05, 0.7, s * 0.47]], 0.003, 24, 6), M.plastic(0x0c0c0c), { parent: abs });
        // dust shield
        mesh(G.lathe([[0.11, 0], [0.205, 0], [0.205, 0.004], [0.11, 0.004]], 48, 'z'), M.darkSteel(), { parent: brake, pos: [0, 0, cz - s * 0.04], name: 'dust shield' });
      }

      // ---- leaf springs (front: 6 leaves, rear: 7 + 2 helper leaves)
      const leafSpring = (parent, xc, len, zc, yTop, nLeaves, camber, helper) => {
        const g = new THREE.Group(); parent.add(g);
        const leafGeo = (L, t, yOff) => {
          const pts = []; const n = 24;
          for (let i = 0; i <= n; i++) { const u = -L / 2 + (L * i) / n; pts.push([u, yOff + camber * Math.pow((2 * u) / len, 2)]); }
          for (let i = n; i >= 0; i--) { const u = -L / 2 + (L * i) / n; pts.push([u, yOff - t + camber * Math.pow((2 * u) / len, 2)]); }
          return G.extrude(G.shape(pts), 0.075);
        };
        const leaves = [];
        for (let k = 0; k < nLeaves; k++) leaves.push(G.at(leafGeo(len - k * (len / (nLeaves + 1.5)), 0.012, -k * 0.0125), [0, 0, 0]));
        mesh(G.merge(leaves), M.metal(0x2a2c30, 0.6), { parent: g, name: 'leaves' });
        if (helper) mesh(G.merge([leafGeo(len * 0.5, 0.016, 0.03), leafGeo(len * 0.38, 0.016, 0.046)]), M.metal(0x2a2c30, 0.6), { parent: g, name: 'helper leaves' });
        // eyes, centre bolt, rebound clips
        for (const e of [-1, 1]) mesh(G.merge([G.at(G.torus(0.024, 0.008, 8, 20, Math.PI * 2, 'z'), [0, 0, 0]), G.at(G.cyl(0.012, 0.012, 0.09, 12, 'z'), [0, 0, 0])]), M.metal(0x2a2c30, 0.6), { parent: g, pos: [e * len / 2, camber + 0.02, 0], name: 'spring eye + bushing' });
        for (const u of [-0.32, 0.32]) mesh(G.box(0.02, 0.012 * nLeaves * 0.6 + 0.02, 0.082), M.darkSteel(), { parent: g, pos: [u * len / 2, -0.0125 * 1.2, 0], name: 'rebound clip' });
        mesh(G.cyl(0.01, 0.01, 0.012 * nLeaves + 0.04, 8, 'y'), M.steel(), { parent: g, pos: [0, -0.012 * nLeaves / 2, 0], name: 'centre bolt' });
        g.position.set(xc, yTop, zc);
        return g;
      };
      const uBolts = (parent, xc, zc, yTop, yBot) => {
        for (const dx of [-0.055, 0.055]) {
          mesh(G.tube([[xc + dx, yBot - 0.03, zc - 0.05], [xc + dx, yTop + 0.02, zc - 0.05], [xc + dx, yTop + 0.045, zc], [xc + dx, yTop + 0.02, zc + 0.05], [xc + dx, yBot - 0.03, zc + 0.05]], 0.008, 32, 8), M.darkSteel(), { parent, name: 'U-bolt' });
          for (const dz of [-0.05, 0.05]) mesh(G.hexNut(0.014, 0.016), M.steel(), { parent, pos: [xc + dx, yBot - 0.035, zc + dz], name: 'U-bolt nut' });
        }
        mesh(G.box(0.15, 0.014, 0.13), M.darkSteel(), { parent, pos: [xc, yBot - 0.02, zc], name: 'spring plate' });
      };
      const shock = (parent, a, b, info) => {
        const p = part(parent, info);
        const A = V3(...a), B = V3(...b), dir = B.clone().sub(A), L = dir.length();
        const g = new THREE.Group(); g.position.copy(A); g.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize()); p.add(g);
        mesh(G.cyl(0.032, 0.032, L * 0.55, 20, 'y'), M.metal(0x1d1f22, 0.5), { parent: g, pos: [0, L * 0.3, 0], name: 'body' });
        mesh(G.cyl(0.01, 0.01, L * 0.4, 10, 'y'), M.chrome(), { parent: g, pos: [0, L * 0.7, 0], name: 'piston rod' });
        mesh(G.cyl(0.026, 0.03, L * 0.22, 16, 'y', false, 6), M.rubber(), { parent: g, pos: [0, L * 0.72, 0], name: 'dust boot' });
        for (const t of [0, 1]) mesh(G.merge([G.torus(0.02, 0.008, 8, 16, Math.PI * 2, 'x'), G.cyl(0.009, 0.009, 0.07, 10, 'x')]), M.rubber(), { parent: g, pos: [0, t * L, 0], name: 'eye bushing' });
        return p;
      };
      const susp = part(br, { he: 'מתלה קדמי', en: 'Front suspension (solid I-beam axle)', desc: 'סרן קדמי קשיח מסוג I-beam עם קפיצי עלים — פתרון של משאיות שמחזיק את המשקל העצום של השריון.' });
      // I-beam axle: dropped centre + two sloped arms
      const iShape = G.shape([[-0.04, -0.055], [0.04, -0.055], [0.04, -0.042], [0.011, -0.042], [0.011, 0.042], [0.04, 0.042], [0.04, 0.055], [-0.04, 0.055], [-0.04, 0.042], [-0.011, 0.042], [-0.011, -0.042], [-0.04, -0.042]]);
      const beam = part(susp, { he: 'קורת סרן קדמית (I-beam)', en: 'Front I-beam axle', mat: 'פלדה מחושלת', desc: 'קורה מחושלת בחתך I שנושאת כ־3 טון. המרכז שלה מונמך כדי לפנות מקום לאגן השמן של המנוע.' });
      mesh(G.extrude(iShape, 0.74), M.metal(0x26282c, 0.55), { parent: beam, pos: [AXF, 0.43, 0] });
      for (const s of [1, -1]) {
        const arm = mesh(G.extrude(iShape, 0.3), M.metal(0x26282c, 0.55), { parent: beam, pos: [AXF, 0.447, s * 0.51] });
        arm.rotation.x = s * -0.12;
        mesh(G.cyl(0.042, 0.042, 0.14, 20, 'y'), M.metal(0x26282c, 0.55), { parent: beam, pos: [AXF, 0.465, s * 0.68], name: 'kingpin boss' });
        // knuckle + spindle + steering arm
        const kn = part(susp, { he: `ציר היגוי ${s > 0 ? 'ימני' : 'שמאלי'}`, en: 'Steering knuckle', mat: 'פלדה מחושלת', desc: 'מחבר את הגלגל לסרן ומסתובב סביב פין ההיגוי (kingpin) כשמסובבים את ההגה.' });
        mesh(G.cyl(0.016, 0.016, 0.2, 12, 'y'), M.steel(), { parent: kn, pos: [AXF, 0.465, s * 0.68], name: 'kingpin' });
        mesh(G.box(0.1, 0.2, 0.06, 0.02), M.metal(0x26282c, 0.55), { parent: kn, pos: [AXF, 0.465, s * 0.735] });
        mesh(G.cyl(0.05, 0.045, 0.14, 20, 'z'), M.steel(), { parent: kn, pos: [AXF, TIRE_R, s * (WHEEL_Z - 0.08)], name: 'spindle' });
        mesh(G.box(0.2, 0.03, 0.035, 0.01), M.metal(0x26282c, 0.55), { parent: kn, pos: [AXF - 0.1, 0.43, s * 0.68], rot: [0, s * 0.25, 0], name: 'steering arm' });
        mesh(G.sphere(0.024), M.darkSteel(), { parent: kn, pos: [AXF - 0.19, 0.43, s * 0.64], name: 'tie-rod end' });
        // springs, U-bolts, shocks, hangers
        const sp = part(susp, { he: `קפיץ עלים קדמי ${s > 0 ? 'ימני' : 'שמאלי'}`, en: 'Front leaf spring pack', mat: 'פלדת קפיצים', desc: 'חבילת 6 עלי פלדה. העלים מחליקים זה על זה ובולמים את הזעזועים; התפסים מונעים מהם להתפזר.' });
        leafSpring(sp, AXF, 1.25, s * 0.47, 0.565, 6, 0.05, false);
        uBolts(sp, AXF, s * 0.47, 0.6, 0.475);
        for (const e of [-1, 1]) mesh(G.box(0.08, 0.1, 0.09, 0.01), M.darkSteel(), { parent: sp, pos: [AXF + e * 0.625, 0.66, s * 0.47], name: e > 0 ? 'front hanger' : 'shackle' });
        shock(susp, [AXF + 0.07, 0.45, s * 0.38], [AXF + 0.16, 0.83, s * 0.4], { he: `בולם זעזועים קדמי ${s > 0 ? 'ימני' : 'שמאלי'}`, en: 'Front shock absorber', mat: 'פלדה, שמן הידראולי, גז חנקן', desc: 'בולם גז במילוי חנקן בגודל של משאית, מכויל למשקל של רכב משוריין.' });
      }
      // tie rod + drag link + steering box + sway bar
      const steer = part(br, { he: 'מערכת היגוי', en: 'Steering linkage', desc: 'תיבת היגוי הידראולית, זרוע פיטמן, מוט גרירה ומוט קישור שמחברים את ההגה לשני הגלגלים.' });
      mesh(G.cyl(0.016, 0.016, 1.26, 16, 'z'), M.steel(), { parent: steer, pos: [AXF - 0.19, 0.43, 0], name: 'tie rod' });
      for (const s of [1, -1]) { mesh(G.cyl(0.024, 0.024, 0.14, 16, 'z'), M.darkSteel(), { parent: steer, pos: [AXF - 0.19, 0.43, s * 0.45], name: 'adjusting sleeve' }); for (const dz of [-0.05, 0.05]) mesh(G.box(0.018, 0.05, 0.012), M.steel(), { parent: steer, pos: [AXF - 0.19, 0.43, s * 0.45 + dz], name: 'sleeve clamp' }); }
      mesh(G.box(0.18, 0.15, 0.12, 0.02), M.castAlu(), { parent: steer, pos: [AXF + 0.48, 0.77, -0.36], name: 'steering gear box' });
      mesh(G.box(0.05, 0.22, 0.04, 0.012), M.metal(0x26282c), { parent: steer, pos: [AXF + 0.46, 0.64, -0.42], name: 'pitman arm' });
      mesh(G.tube([[AXF + 0.46, 0.54, -0.42], [AXF + 0.2, 0.53, -0.56], [AXF - 0.12, 0.5, -0.66]], 0.016, 24, 10), M.steel(), { parent: steer, name: 'drag link' });
      mesh(G.tube([[AXF + 0.5, 0.82, -0.36], [1.5, 0.9, -0.38], [1.1, 1.0, -0.42], [0.98, 1.02, -0.42]], 0.014, 32, 8), M.steel(), { parent: steer, name: 'intermediate steering shaft' });
      for (const p of [[AXF + 0.5, 0.82, -0.36], [1.5, 0.9, -0.38]]) mesh(G.box(0.04, 0.04, 0.04, 0.008), M.darkSteel(), { parent: steer, pos: p, name: 'U-joint' });
      mesh(G.tube([[AXF + 0.02, 0.48, 0.58], [AXF + 0.3, 0.6, 0.5], [AXF + 0.34, 0.6, 0], [AXF + 0.3, 0.6, -0.5], [AXF + 0.02, 0.48, -0.58]], 0.017, 48, 10), M.metal(0x1b1c1f, 0.5), { parent: steer, name: 'anti-roll bar' });

      // ---- rear axle
      const rear = part(br, { he: 'סרן אחורי', en: 'Rear axle (full-floating, 11.5")', desc: 'סרן משאית צף לחלוטין עם דיפרנציאל 11.5 אינץ׳. מעביר את כוח המנוע לגלגלים האחוריים.' });
      const housing = part(rear, { he: 'בית דיפרנציאל', en: 'Differential housing', mat: 'ברזל יצוק', desc: 'בית הדיפרנציאל, עם מכסה מוברג ב־14 ברגים. מתחלק את הכוח בין הגלגלים בפנייה.' });
      mesh(G.lathe([[0, -0.11], [0.1, -0.1], [0.15, -0.05], [0.16, 0], [0.15, 0.05], [0.1, 0.1], [0, 0.11]], 40, 'z'), M.castIron(), { parent: housing, pos: [AXR, TIRE_R, 0], rot: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
      mesh(G.lathe([[0, 0], [0.14, 0], [0.15, 0.01], [0.13, 0.05], [0.08, 0.07], [0, 0.075]], 40, 'z'), M.metal(0x2c2e32, 0.5), { parent: housing, pos: [AXR - 0.1, TIRE_R, 0], rot: [0, -Math.PI / 2, 0], name: 'diff cover' });
      instances(G.bolt(0.008), M.steel(), Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return { pos: [AXR - 0.112, TIRE_R + Math.sin(a) * 0.14, Math.cos(a) * 0.14], rot: [0, 0, Math.PI / 2] }; }), { parent: housing });
      mesh(G.lathe([[0.08, 0], [0.065, 0.12], [0.05, 0.16]], 24, 'x'), M.castIron(), { parent: housing, pos: [AXR + 0.06, TIRE_R + 0.01, 0], name: 'pinion snout' });
      mesh(G.cyl(0.055, 0.055, WHEEL_Z * 2 - 0.36, 24, 'z'), M.castIron(), { parent: rear, pos: [AXR, TIRE_R, 0], name: 'axle tubes' });
      for (const s of [1, -1]) {
        const sp = part(rear, { he: `קפיץ עלים אחורי ${s > 0 ? 'ימני' : 'שמאלי'}`, en: 'Rear leaf spring pack + helper', mat: 'פלדת קפיצים', desc: '7 עלים ראשיים ועוד 2 עלי עזר שנכנסים לפעולה רק תחת עומס כבד — כמו 9 טון של רכב משוריין.' });
        leafSpring(sp, AXR, 1.45, s * 0.56, 0.58, 7, 0.055, true);
        uBolts(sp, AXR, s * 0.56, 0.62, 0.41);
        for (const e of [-1, 1]) mesh(G.box(0.08, 0.1, 0.09, 0.01), M.darkSteel(), { parent: sp, pos: [AXR + e * 0.725, 0.66, s * 0.56], name: e > 0 ? 'front hanger' : 'shackle' });
        shock(rear, [AXR - 0.09 * s, 0.42, s * 0.42], [AXR - 0.2 * s, 0.82, s * 0.42], { he: `בולם זעזועים אחורי ${s > 0 ? 'ימני' : 'שמאלי'}`, en: 'Rear shock absorber', mat: 'פלדה, שמן, חנקן', desc: 'בולמים אחוריים מותקנים באלכסון (staggered) כדי לרסן קפיצת סרן בתאוצה.' });
        mesh(G.cyl(0.075, 0.075, 0.02, 24, 'z'), M.castIron(), { parent: rear, pos: [AXR, TIRE_R, s * (WHEEL_Z - 0.15)], name: 'hub flange' });
      }
    }

    // ================================================================== CHASSIS + DRIVETRAIN
    {
      const ch = sys('chassis');
      const RAIL_Z = 0.47, RAIL_H = 0.2, FL = 0.075, TK = 0.008;
      // rail centre-line height (kick-ups over both axles)
      const railY = (x) => 0.56 + 0.14 * (smooth(0.95, 1.3, x) + (1 - smooth(-1.3, -0.95, x)));
      const frame = part(ch, { he: 'שלדת סולם', en: 'Ladder frame (GMC TopKick based)', mat: 'פלדה בחתך C, 8 מ״מ', desc: 'שלדה של משאית בינונית: שתי קורות אורך בחתך C ושמונה קורות רוחב מסומררות. כל המרכב והשריון יושבים עליה.' });
      // C-channel rail swept along x in short straight pieces
      const cShape = (s) => G.shape([[0, -RAIL_H / 2], [-s * FL, -RAIL_H / 2], [-s * FL, -RAIL_H / 2 + TK], [-s * TK, -RAIL_H / 2 + TK], [-s * TK, RAIL_H / 2 - TK], [-s * FL, RAIL_H / 2 - TK], [-s * FL, RAIL_H / 2], [0, RAIL_H / 2]]);
      for (const s of [1, -1]) {
        const rail = part(frame, { he: `קורת אורך ${s > 0 ? 'ימנית' : 'שמאלית'}`, en: 'Frame rail', mat: 'פלדה בחתך C', desc: 'קורת האורך הראשית. מוגבהת מעל הסרנים (kick-up) כדי לאפשר מהלך מתלה.' });
        const xsR = samples(2.56, -2.58, 0.08, [1.3, 0.95, -0.95, -1.3]);
        const pieces = [];
        for (let i = 0; i < xsR.length - 1; i++) {
          const a = V3(xsR[i], railY(xsR[i]), 0), b = V3(xsR[i + 1], railY(xsR[i + 1]), 0);
          const len = a.distanceTo(b) + 0.004, ang = Math.atan2(b.y - a.y, b.x - a.x);
          const g = G.extrude(cShape(s), len); // shape in (z, y), extruded along local z
          g.rotateY(-Math.PI / 2); // shape u → world z, extrusion → along x
          g.rotateZ(ang);
          g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
          pieces.push(g);
        }
        const rg = G.merge(pieces); rg.translate(0, 0, s * RAIL_Z);
        mesh(rg, M.metal(0x202225, 0.55), { parent: rail });
      }
      const crossXs = [2.5, 2.05, 1.25, 0.4, -0.55, -1.12, -2.1, -2.52];
      const rivets = [];
      crossXs.forEach((cx, i) => {
        const y = railY(cx);
        const cm = part(frame, { he: `קורת רוחב ${i + 1}`, en: `Crossmember ${i + 1}`, mat: 'פלדה', desc: ['קורת הפגוש הקדמי — מחזיקה את משגרי הגז ואת וו הגרירה.', 'תומכת ברדיאטור ובמגן התחתון.', 'קורת המנוע — עליה יושבות תושבות המנוע.', 'תושבת תיבת ההילוכים.', 'נושאת את המיסב המרכזי של גל ההינע.', 'מחזקת את אזור ההגבהה מעל הסרן האחורי.', 'מחזיקה את מיכל הדלק המשוריין.', 'קורת הפגוש האחורי.'][i] });
        mesh(G.box(0.09, RAIL_H * 0.75, RAIL_Z * 2 - 0.02, 0.01), M.metal(0x202225, 0.55), { parent: cm, pos: [cx, y, 0] });
        for (const s of [1, -1]) {
          mesh(G.box(0.2, RAIL_H * 0.9, 0.006), M.metal(0x202225, 0.55), { parent: cm, pos: [cx, y, s * (RAIL_Z + 0.004)], name: 'gusset plate' });
          for (const dx of [-0.07, 0, 0.07]) for (const dy of [-0.055, 0.055]) rivets.push({ pos: [cx + dx, y + dy, s * (RAIL_Z + 0.007)], rot: [s * Math.PI / 2, 0, 0] });
        }
      });
      const rv = part(frame, { he: `${rivets.length} מסמרות שלדה`, en: 'Frame rivets', mat: 'פלדה', desc: 'מסמרות חמות שמחברות את קורות הרוחב לקורות האורך דרך לוחות חיזוק. כל אחת בקוטר 12 מ״מ.' });
      instances(G.rivet(0.009), M.metal(0x2a2c30, 0.5), rivets, { parent: rv });
      // body mounts
      const bm = part(ch, { he: 'תושבות מרכב (גומי)', en: 'Body mounts', mat: 'גומי + פלדה', desc: '10 כריות גומי שמפרידות בין המרכב לשלדה ובולעות רעידות.' });
      const bmList = [];
      for (const bx of [2.3, 1.05, 0.2, -0.7, -2.3]) for (const s of [1, -1]) bmList.push({ pos: [bx, railY(bx) + RAIL_H / 2 + 0.015, s * (RAIL_Z - 0.035)] });
      instances(G.cyl(0.035, 0.035, 0.03, 20, 'y'), M.rubber(), bmList, { parent: bm });

      // transmission (Allison 1000, 6-speed)
      const tr = part(ch, { he: 'תיבת הילוכים אוטומטית', en: 'Allison 1000 6-speed automatic', mat: 'אלומיניום יצוק', desc: 'תיבת הילוכים של משאיות, 6 הילוכים, עם ממיר מומנט ששולח עד 1,100 ניוטון־מטר לגלגלים.' });
      mesh(G.lathe([[0.25, 0], [0.24, 0.08], [0.2, 0.18], [0.17, 0.22]], 40, 'x'), M.castAlu(), { parent: tr, pos: [1.2, 0.73, 0], rot: [0, 0, Math.PI], name: 'bell housing' });
      mesh(G.lathe([[0.17, 0], [0.16, 0.25], [0.13, 0.48], [0.085, 0.52], [0.07, 0.68]], 32, 'x'), M.castAlu(), { parent: tr, pos: [0.98, 0.72, 0], rot: [0, 0, Math.PI], name: 'main case + tail housing' });
      mesh(G.box(0.4, 0.06, 0.3, 0.015), M.metal(0x34373b, 0.5), { parent: tr, pos: [0.72, 0.56, 0], name: 'oil pan' });
      instances(G.bolt(0.006), M.steel(), Array.from({ length: 16 }, (_, i) => { const t = i / 16; const per = [[0.2, 0.15], [-0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]]; const k = Math.floor(t * 4), f = t * 4 - k; const a = per[k], b = per[(k + 1) % 4]; return { pos: [0.72 + lerp(a[0], b[0], f), 0.53, lerp(a[1], b[1], f)], rot: [Math.PI, 0, 0] }; }), { parent: tr });
      mesh(G.tube([[0.9, 0.62, 0.16], [1.6, 0.6, 0.3], [2.3, 0.7, 0.32], [2.4, 0.78, 0.3]], 0.006, 48, 6), M.steel(), { parent: tr, name: 'cooler line' });
      mesh(G.tube([[0.9, 0.64, 0.18], [1.6, 0.62, 0.32], [2.3, 0.72, 0.34], [2.4, 0.8, 0.32]], 0.006, 48, 6), M.steel(), { parent: tr, name: 'cooler line' });
      // driveshaft: two pieces with a centre bearing
      const ds = part(ch, { he: 'גל הינע דו־חלקי', en: 'Two-piece driveshaft', mat: 'צינור פלדה מאוזן', desc: 'מעביר את הכוח מתיבת ההילוכים לסרן האחורי. מחולק לשניים עם מיסב מרכזי כי המרחק ארוך — 2.2 מטר.' });
      const dsA = V3(0.3, 0.6, 0), dsB = V3(-0.55, 0.555, 0), dsC = V3(AXR + 0.22, TIRE_R + 0.01, 0);
      for (const [a, b] of [[dsA, dsB], [dsB, dsC]]) {
        const d = b.clone().sub(a), g = new THREE.Group(); g.position.copy(a); g.quaternion.setFromUnitVectors(V3(1, 0, 0), d.clone().normalize()); ds.add(g);
        mesh(G.cyl(0.045, 0.045, d.length() - 0.1, 24, 'x'), M.steel(), { parent: g, pos: [d.length() / 2, 0, 0], name: 'tube' });
        for (const t of [0.05, d.length() - 0.05]) { mesh(G.merge([G.cyl(0.012, 0.012, 0.1, 8, 'y'), G.cyl(0.012, 0.012, 0.1, 8, 'z')]), M.darkSteel(), { parent: g, pos: [t, 0, 0], name: 'U-joint cross' }); mesh(G.cyl(0.05, 0.05, 0.02, 20, 'x'), M.darkSteel(), { parent: g, pos: [t + (t < 0.1 ? 0.03 : -0.03), 0, 0], name: 'yoke' }); }
        mesh(G.box(0.02, 0.02, 0.012), M.steel(), { parent: g, pos: [d.length() * 0.4, 0.046, 0], name: 'balance weight' });
      }
      mesh(G.box(0.08, 0.12, 0.3, 0.02), M.rubber(), { parent: ds, pos: [dsB.x, dsB.y + 0.02, 0], name: 'centre bearing' });

      // exhaust: downpipe → DOC/DPF → SCR → muffler → tailpipe
      const ex = part(ch, { he: 'מערכת פליטה', en: 'Exhaust & after-treatment', mat: 'נירוסטה', desc: 'צנרת נירוסטה עם ממיר חמצון, מסנן חלקיקים (DPF) ומשתיק. מוסתרת לחלוטין מתחת למרכב, והיציאה מכוונת מטה.' });
      const exPath = [[1.18, 1.0, 0.1], [1.12, 0.86, 0.26], [1.02, 0.6, 0.3], [0.7, 0.5, 0.31], [0.25, 0.49, 0.31]];
      mesh(G.tube(exPath, 0.05, 64, 16), M.satin(), { parent: ex, name: 'downpipe' });
      mesh(G.cyl(0.13, 0.13, 0.62, 32, 'x'), M.satin(), { parent: ex, pos: [-0.08, 0.49, 0.31], name: 'DOC + DPF canister' });
      mesh(G.box(0.5, 0.16, 0.3, 0.06), M.satin(), { parent: ex, pos: [-0.75, 0.5, 0.29], name: 'muffler' });
      mesh(G.tube([[-1.0, 0.5, 0.29], [-1.25, 0.52, 0.3], [-1.45, 0.66, 0.3], [-1.85, 0.66, 0.3], [-2.05, 0.5, 0.36], [-2.5, 0.47, 0.5], [-2.7, 0.44, 0.52]], 0.045, 80, 14), M.satin(), { parent: ex, name: 'tailpipe' });
      mesh(G.cyl(0.055, 0.06, 0.08, 20, 'x'), M.chrome(), { parent: ex, pos: [-2.72, 0.44, 0.52], name: 'tip' });
      for (const hx of [0.5, -0.5, -1.2, -2.2]) mesh(G.merge([G.cyl(0.006, 0.006, 0.1, 8, 'y'), G.at(G.cyl(0.02, 0.02, 0.02, 12, 'z'), [0, 0.04, 0])]), M.rubber(), { parent: ex, pos: [hx, 0.56, 0.36], name: 'rubber hanger' });
      mesh(G.box(0.7, 0.008, 0.36), M.aluminum(), { parent: ex, pos: [-0.1, 0.63, 0.31], name: 'heat shield' });

      // armoured fuel tank
      const ft = part(ch, { he: 'מיכל דלק משוריין', en: 'Armoured, foam-filled fuel tank', mat: 'פלדת שריון + קצף מונע פיצוץ', desc: 'מיכל דיזל עטוף שריון וממולא בקצף מיוחד: גם אם קליע חודר אותו, הקצף מונע התלקחות ופיצוץ.' });
      mesh(G.box(0.55, 0.22, 0.74, 0.04), M.armorSteel(), { parent: ft, pos: [-2.15, 0.56, 0] });
      for (const sx of [-0.18, 0.18]) mesh(G.box(0.04, 0.24, 0.78, 0.01), M.darkSteel(), { parent: ft, pos: [-2.15 + sx, 0.56, 0], name: 'strap' });
      mesh(G.tube([[-2.0, 0.66, -0.3], [-1.95, 0.85, -0.6], [-1.9, 1.02, -0.92]], 0.025, 24, 10), M.rubber(), { parent: ft, name: 'filler neck' });
      mesh(G.tube([[-1.9, 0.62, -0.1], [-1.2, 0.68, -0.38], [0.5, 0.52, -0.38], [1.2, 0.72, -0.36], [1.4, 0.9, -0.2]], 0.006, 96, 6), M.steel(), { parent: ft, name: 'fuel supply line' });
      mesh(G.tube([[-1.9, 0.62, -0.13], [-1.2, 0.69, -0.4], [0.5, 0.53, -0.4], [1.2, 0.73, -0.38], [1.4, 0.92, -0.22]], 0.005, 96, 6), M.steel(), { parent: ft, name: 'fuel return line' });
      // brake lines along the left rail
      const bl = part(ch, { he: 'צנרת בלמים', en: 'Brake lines', mat: 'צינור נחושת־ניקל', desc: 'צינורות מתכת דקים שמובילים נוזל בלמים מהמשאבה לכל אחד מארבעת הגלגלים.' });
      for (const dz of [0, 0.012]) mesh(G.tube([[1.08, 0.98, -0.47 + dz], [1.0, 0.82, -0.4 + dz], [0.5, 0.52, -0.39 + dz], [-0.9, 0.52, -0.39 + dz], [-1.5, 0.68, -0.39 + dz], [AXR, 0.6, -0.1 + dz]], 0.0035, 96, 6), M.copper(), { parent: bl });
    }

    // ================================================================== ENGINE (Duramax 6.6 V8 turbo-diesel)
    {
      const en = sys('engine');
      const CY = 0.70, EX0 = 1.27, EX1 = 2.03, EXC = (EX0 + EX1) / 2, ELEN = EX1 - EX0;
      // bank geometry: d = cylinder axis direction, po = towards the outside of the V
      const bank = (s) => ({ d: V3(0, Math.SQRT1_2, s * Math.SQRT1_2), po: V3(0, -Math.SQRT1_2, s * Math.SQRT1_2) });
      const at = (s, along, out = 0, x = EXC) => { const b = bank(s); return V3(x, CY, 0).addScaledVector(b.d, along).addScaledVector(b.po, out); };
      const IRON = M.castIron(), ALU = M.castAlu();
      const onFrontX = (geo, x, y = 0, z = 0) => { geo.rotateY(Math.PI / 2); geo.translate(x, y, z); return geo; };

      const block = part(en, { he: 'בלוק מנוע V8', en: 'Cast-iron V8 block', mat: 'ברזל יצוק בגרפיט דחוס', desc: 'בלוק V8 בזווית 90° עם 8 צילינדרים בקוטר 103 מ״מ — 6.6 ליטר. מפיק כ־400 כ״ס ו־1,000 ניוטון־מטר.' });
      mesh(G.box(ELEN, 0.24, 0.46, 0.03), IRON, { parent: block, pos: [EXC, CY - 0.04, 0], name: 'crankcase' });
      for (const s of [1, -1]) {
        mesh(G.box(ELEN - 0.02, 0.28, 0.22, 0.02), IRON, { parent: block, pos: at(s, 0.22).toArray(), rot: [s * Math.PI / 4, 0, 0], name: 'cylinder bank' });
        // core (freeze) plugs along the block side
        instances(G.cyl(0.018, 0.018, 0.006, 16, 'y'), M.brass(), [0.2, 0.4, 0.6].map((t) => ({ pos: at(s, 0.18, 0.112, EX0 + t * ELEN).toArray(), rot: [s * Math.PI / 4 + Math.PI / 2 * s, 0, 0] })), { parent: block });
      }
      const pan = part(en, { he: 'אגן שמן', en: 'Oil pan', mat: 'אלומיניום יצוק', desc: 'מכיל 10 ליטר שמן. הבור (sump) בחלקו האחורי כדי לפנות מקום לסרן הקדמי שעובר מתחת.' });
      mesh(G.box(0.31, 0.17, 0.4, 0.03), ALU, { parent: pan, pos: [EX0 + 0.16, CY - 0.235, 0] });
      mesh(G.box(0.46, 0.09, 0.4, 0.03), ALU, { parent: pan, pos: [EX1 - 0.23, CY - 0.195, 0] });
      mesh(G.cyl(0.012, 0.012, 0.012, 6, 'y'), M.steel(), { parent: pan, pos: [EX0 + 0.16, CY - 0.326, 0.1], name: 'drain plug' });
      const crank = part(en, { he: 'גל ארכובה ובוכנות', en: 'Crankshaft, rods & pistons (hidden)', mat: 'פלדה מחושלת', desc: 'בתוך הבלוק: גל ארכובה מחושל, 8 טלטלים ו־8 בוכנות אלומיניום. מוצג רק בחתך.' });
      mesh(G.cyl(0.035, 0.035, ELEN - 0.04, 16, 'x'), M.steel(), { parent: crank, pos: [EXC, CY, 0] });
      for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
        const x = EX0 + 0.1 + i * 0.17 + (s > 0 ? 0.04 : -0.0);
        const p = at(s, 0.24 + 0.04 * Math.sin(i * 1.7 + s), 0, x);
        mesh(G.cyl(0.05, 0.05, 0.07, 20, 'y'), M.castAlu(), { parent: crank, pos: p.toArray(), rot: [s * Math.PI / 4, 0, 0], name: 'piston' });
        mesh(G.box(0.02, 0.16, 0.03), M.steel(), { parent: crank, pos: at(s, 0.13, 0, x).toArray(), rot: [s * Math.PI / 4, 0, 0], name: 'connecting rod' });
      }
      for (const s of [1, -1]) {
        const sideHe = s > 0 ? 'ימני' : 'שמאלי';
        const head = part(en, { he: `ראש צילינדרים ${sideHe}`, en: 'Aluminium cylinder head', mat: 'אלומיניום', desc: '4 צילינדרים, 16 שסתומים. מזרקי הדלק נכנסים ישירות לתא הבעירה מלמעלה.' });
        mesh(G.box(ELEN - 0.04, 0.12, 0.24, 0.015), ALU, { parent: head, pos: at(s, 0.42).toArray(), rot: [s * Math.PI / 4, 0, 0] });
        const vc = part(en, { he: `מכסה שסתומים ${sideHe}`, en: 'Valve cover', mat: 'פלסטיק מחוזק + אטם גומי', desc: 'מכסה את גלי הנדנדות ואת 4 המזרקים של הגדה. מוחזק ב־10 ברגים.' });
        mesh(G.soft(ELEN - 0.08, 0.065, 0.2, { r: 0.025, seg: 4, deform: (q, n) => { q.y += 0.01 * (1 - n.z * n.z) * smooth(0, 1, n.y); } }), M.gloss(0x111214), { parent: vc, pos: at(s, 0.515).toArray(), rot: [s * Math.PI / 4, 0, 0] });
        const label = K.textTexture('DURAMAX', { font: '900 110px Arial, sans-serif', color: '#d8d8d8', letterSpacing: '6px' });
        const lm = mesh(new THREE.PlaneGeometry(0.34, 0.34 / label.aspect), M.decal(label.tex), { parent: vc, cast: false, name: 'DURAMAX lettering' });
        lm.position.copy(at(s, 0.5595));
        // read left-to-right for someone standing beside the car on that side
        { const xa = V3(s, 0, 0), za = bank(s).d.clone(), ya = za.clone().cross(xa); lm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, za)); }
        const vb = [];
        for (let i = 0; i < 5; i++) for (const e of [-1, 1]) { const p = at(s, 0.55, e * 0.09, EX0 + 0.08 + i * 0.15); vb.push({ pos: p.toArray(), rot: [s * Math.PI / 4, 0, 0] }); }
        instances(G.bolt(0.007), M.steel(), vb, { parent: vc });
        // exhaust manifold: log + 4 runners + up-pipe to the turbo
        const xm = part(en, { he: `סעפת פליטה ${sideHe}`, en: 'Exhaust manifold', mat: 'ברזל יצוק עמיד חום', desc: 'אוספת גזים בטמפרטורה של 650°C מ־4 צילינדרים ומזינה את הטורבינה.' });
        const log = at(s, 0.36, 0.16);
        mesh(G.cyl(0.032, 0.032, ELEN - 0.1, 16, 'x'), IRON, { parent: xm, pos: log.toArray() });
        for (let i = 0; i < 4; i++) { const x = EX0 + 0.12 + i * 0.17; mesh(G.tube([at(s, 0.36, 0.16, x), at(s, 0.38, 0.12, x), at(s, 0.42, 0.115, x)], 0.022, 8, 8), IRON, { parent: xm, name: 'runner' }); }
        mesh(G.tube([V3(EX0 + 0.04, log.y, log.z), V3(EX0 - 0.04, log.y + 0.08, log.z * 0.8), V3(EX0 - 0.04, CY + 0.36, s * 0.16), V3(EX0 + 0.03, CY + 0.38, s * 0.06)], 0.026, 32, 10), M.satin(), { parent: xm, name: 'up-pipe' });
        // fuel rail + high-pressure lines + glow plugs
        const fr = part(en, { he: `מסילת דלק בלחץ גבוה ${sideHe}`, en: 'Common-rail + injector lines', mat: 'פלדה מחושלת', desc: 'מסילה שמחזיקה סולר בלחץ של 2,000 בר ומזינה 4 מזרקים דרך צינורות פלדה דקים.' });
        const rail = at(s, 0.47, 0.17);
        mesh(G.cyl(0.016, 0.016, ELEN - 0.12, 14, 'x'), M.steel(), { parent: fr, pos: rail.toArray() });
        for (let i = 0; i < 4; i++) { const x = EX0 + 0.12 + i * 0.17; mesh(G.tube([V3(x, rail.y, rail.z), at(s, 0.5, 0.15, x + 0.03), at(s, 0.49, 0.1, x + 0.04)], 0.0045, 16, 6), M.steel(), { parent: fr, name: 'injector line' }); }
        const gp = part(en, { he: `מצתי להט ${sideHe}`, en: 'Glow plugs', mat: 'קרמיקה + פלדה', desc: 'במנוע דיזל אין מצתים: 4 מצתי להט מחממים את תא הבעירה להתנעה בקור.' });
        for (let i = 0; i < 4; i++) { const p = at(s, 0.38, 0.135, EX0 + 0.16 + i * 0.17); mesh(G.cyl(0.006, 0.006, 0.04, 8, 'y'), M.steel(), { parent: gp, pos: p.toArray(), rot: [s * (Math.PI / 4 + Math.PI / 2), 0, 0] }); mesh(G.cyl(0.009, 0.009, 0.025, 10, 'y'), M.plastic(0x1d5fbf), { parent: gp, pos: at(s, 0.38, 0.165, EX0 + 0.16 + i * 0.17).toArray(), rot: [s * (Math.PI / 4 + Math.PI / 2), 0, 0], name: 'boot' }); }
        mesh(G.cyl(0.009, 0.009, ELEN - 0.1, 8, 'x'), M.plastic(0x0d0d0d), { parent: gp, pos: at(s, 0.38, 0.2).toArray(), name: 'harness' });
        // engine mount
        mesh(G.box(0.12, 0.08, 0.1, 0.02), M.rubber(), { parent: block, pos: [EXC + 0.1, 0.78, s * 0.36], name: 'engine mount' });
      }
      // intake plenum in the valley + label
      const intake = part(en, { he: 'סעפת יניקה', en: 'Intake plenum', mat: 'אלומיניום יצוק', desc: 'מפזרת את האוויר הדחוס והמקורר לשמונת הצילינדרים.' });
      mesh(G.box(0.6, 0.09, 0.22, 0.03), ALU, { parent: intake, pos: [EXC + 0.04, CY + 0.36, 0] });
      const lab = K.textTexture('DURAMAX  6.6L V8\nTURBO DIESEL', { font: '800 72px Arial, sans-serif', color: '#e3c26a', lineHeight: 84 });
      mesh(new THREE.PlaneGeometry(0.3, 0.3 / lab.aspect), M.decal(lab.tex), { parent: intake, pos: [EXC + 0.06, CY + 0.406, 0], rot: [-Math.PI / 2, 0, -Math.PI / 2], cast: false, name: 'badge' });
      mesh(G.cyl(0.045, 0.045, 0.12, 24, 'y'), ALU, { parent: intake, pos: [EX1 - 0.12, CY + 0.42, -0.02], name: 'intake horn' });
      // turbocharger at the back of the valley
      const tb = part(en, { he: 'מגדש טורבו', en: 'Variable-geometry turbocharger', mat: 'אלומיניום (מדחס) + ברזל יצוק (טורבינה)', desc: 'טורבינה משתנה־גאומטריה שמסתובבת עד 130,000 סל״ד ודוחסת אוויר ללחץ של 2 בר.' });
      const TP = V3(EX0 + 0.06, CY + 0.4, 0.03);
      mesh(G.torus(0.065, 0.032, 12, 32, Math.PI * 2, 'z'), ALU, { parent: tb, pos: [TP.x, TP.y, TP.z + 0.05], name: 'compressor scroll' });
      mesh(G.cyl(0.05, 0.05, 0.06, 24, 'z'), ALU, { parent: tb, pos: [TP.x, TP.y, TP.z + 0.05] });
      mesh(G.torus(0.06, 0.03, 12, 32, Math.PI * 2, 'z'), IRON, { parent: tb, pos: [TP.x, TP.y, TP.z - 0.06], name: 'turbine housing' });
      mesh(G.cyl(0.03, 0.03, 0.08, 16, 'z'), M.steel(), { parent: tb, pos: [TP.x, TP.y, TP.z], name: 'centre bearing housing' });
      mesh(G.box(0.05, 0.04, 0.07, 0.01), M.plastic(0x1a1a1a), { parent: tb, pos: [TP.x + 0.05, TP.y + 0.07, TP.z - 0.06], name: 'VGT actuator' });
      // front-end accessory drive
      const fead = part(en, { he: 'רצועה ופולים', en: 'Accessory drive: belt & pulleys', mat: 'גומי EPDM + פלדה', desc: 'רצועה אחת מסתובבת סביב 7 גלגלות ומניעה את האלטרנטור, משאבת המים, המזגן ומשאבת ההגה.' });
      const PX = EX1 + 0.07;
      const pulleys = [
        { he: 'מנחת רעידות', y: CY, z: 0, r: 0.105 }, { he: 'משאבת מים', y: CY + 0.25, z: 0, r: 0.075 },
        { he: 'אלטרנטור 250A', y: CY + 0.33, z: 0.26, r: 0.04 }, { he: 'מדחס מזגן', y: CY - 0.04, z: -0.27, r: 0.06 },
        { he: 'משאבת הגה', y: CY + 0.3, z: -0.25, r: 0.055 }, { he: 'גלגלת מתח', y: CY + 0.13, z: 0.2, r: 0.04 }, { he: 'גלגלת מובילה', y: CY + 0.42, z: 0.08, r: 0.035 },
      ];
      for (const p of pulleys) {
        mesh(G.merge([G.cyl(p.r, p.r, 0.03, 32, 'x'), G.at(G.cyl(p.r * 0.35, p.r * 0.35, 0.04, 16, 'x'), [0.01, 0, 0])]), p.r > 0.07 ? M.darkSteel() : M.steel(), { parent: fead, pos: [PX, p.y, p.z], name: p.he });
      }
      // belt: a smooth closed loop just outside the pulleys
      const loop = [pulleys[0], pulleys[3], pulleys[4], pulleys[1], pulleys[6], pulleys[2], pulleys[5]];
      const cen = loop.reduce((a, p) => a.add(V3(0, p.y, p.z)), V3()).multiplyScalar(1 / loop.length);
      const beltPts = loop.map((p) => { const d = V3(0, p.y - cen.y, p.z - cen.z).normalize(); return V3(PX, p.y + d.y * (p.r + 0.006), p.z + d.z * (p.r + 0.006)); });
      mesh(G.tube(beltPts, 0.007, 120, 6, true), M.rubber(), { parent: fead, name: 'serpentine belt' });
      const acc = part(en, { he: 'אביזרי מנוע', en: 'Alternator, A/C compressor, power-steering pump', mat: 'אלומיניום', desc: 'אלטרנטור כפול־עוצמה (מערכות התקשורת ברכב צורכות הרבה חשמל), מדחס מזגן ומשאבת הגה הידראולית.' });
      mesh(G.cyl(0.08, 0.08, 0.17, 24, 'x'), ALU, { parent: acc, pos: [PX - 0.12, CY + 0.33, 0.26], name: 'alternator' });
      mesh(G.cyl(0.075, 0.075, 0.19, 24, 'x'), ALU, { parent: acc, pos: [PX - 0.13, CY - 0.04, -0.27], name: 'A/C compressor' });
      mesh(G.cyl(0.055, 0.055, 0.12, 20, 'x'), M.darkSteel(), { parent: acc, pos: [PX - 0.1, CY + 0.3, -0.25], name: 'power steering pump' });
      mesh(G.cyl(0.045, 0.045, 0.08, 20, 'y'), M.plastic(0x222222), { parent: acc, pos: [PX - 0.2, CY + 0.39, -0.25], name: 'PS reservoir' });
      mesh(G.cyl(0.055, 0.055, 0.2, 20, 'x'), M.darkSteel(), { parent: acc, pos: [EX0 - 0.02, CY - 0.1, 0.27], name: 'starter motor' });
      // fan + shroud
      const fan = part(en, { he: 'מאוורר וקלאץ׳ צמיגי', en: 'Fan & viscous clutch', mat: 'ניילון מחוזק', desc: 'מאוורר בקוטר 60 ס״מ עם 9 להבים. הקלאץ׳ הצמיגי משלב אותו רק כשהמנוע חם.' });
      const FX = PX + 0.15, FY = CY + 0.2;
      mesh(G.cyl(0.075, 0.075, 0.07, 32, 'x'), ALU, { parent: fan, pos: [FX - 0.04, FY, 0], name: 'viscous clutch' });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const b = mesh(G.box(0.006, 0.15, 0.07, 0.003), M.plastic(0x101010), { parent: fan, pos: [FX, FY + Math.sin(a) * 0.135, Math.cos(a) * 0.135], name: 'blade' }); b.rotation.set(-a + Math.PI / 2, 0, 0); b.rotateY(0.45); }
      mesh(G.lathe([[0.225, -0.03], [0.225, 0.04], [0.25, 0.08]], 48, 'x'), M.plastic(0x141414), { parent: fan, pos: [FX - 0.02, FY, 0], name: 'shroud ring' });
      const shp = G.roundRect(0.78, 0.5, 0.04); shp.holes.push(G.circlePath(0.25, 0, FY - (CY + 0.15), true));
      mesh(onFrontX(G.extrude(shp, 0.015), FX + 0.065, CY + 0.15, 0), M.plastic(0x141414), { parent: fan, name: 'shroud panel' });
      // radiator + intercooler with fin texture
      const fins = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#2b2d30'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4d52'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h); g.fillStyle = '#1a1b1d'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 4); }, { repeat: [6, 3] });
      const finMat = new THREE.MeshStandardMaterial({ map: fins, metalness: 0.7, roughness: 0.5 });
      const rad = part(en, { he: 'רדיאטור', en: 'Radiator', mat: 'אלומיניום + מכלי פלסטיק', desc: 'רדיאטור גדול במיוחד: מנוע דיזל שסוחב 9 טון בנסיעה איטית בשיירה מייצר הרבה חום.' });
      mesh(G.box(0.05, 0.52, 0.78), finMat, { parent: rad, pos: [2.43, CY + 0.15, 0] });
      for (const s of [1, -1]) mesh(G.box(0.07, 0.56, 0.05, 0.01), M.plastic(0x101010), { parent: rad, pos: [2.43, CY + 0.15, s * 0.415], name: 'side tank' });
      mesh(G.cyl(0.025, 0.025, 0.03, 20, 'y'), M.steel(), { parent: rad, pos: [2.43, CY + 0.43, 0.38], name: 'pressure cap' });
      mesh(G.tube([[2.42, CY + 0.36, 0.4], [2.3, CY + 0.38, 0.3], [PX + 0.02, CY + 0.32, 0.06]], 0.03, 24, 12), M.rubber(), { parent: rad, name: 'upper hose' });
      mesh(G.tube([[2.42, CY - 0.06, -0.4], [2.3, CY - 0.08, -0.3], [PX - 0.01, CY + 0.12, -0.08]], 0.03, 24, 12), M.rubber(), { parent: rad, name: 'lower hose' });
      const cac = part(en, { he: 'מקרר אוויר דחוס (אינטרקולר)', en: 'Charge-air cooler', mat: 'אלומיניום', desc: 'מקרר את האוויר שיוצא חם מהטורבו, כדי להכניס יותר חמצן לצילינדרים.' });
      mesh(G.box(0.035, 0.42, 0.76), finMat, { parent: cac, pos: [2.5, CY + 0.13, 0] });
      mesh(G.tube([[TP.x, TP.y + 0.04, TP.z + 0.13], [TP.x + 0.1, TP.y + 0.08, 0.3], [1.95, CY + 0.32, 0.4], [2.4, CY + 0.3, 0.44], [2.5, CY + 0.25, 0.42]], 0.038, 64, 14), M.aluminum(), { parent: cac, name: 'hot-side pipe' });
      mesh(G.tube([[2.5, CY + 0.05, -0.42], [2.35, CY + 0.15, -0.44], [2.1, CY + 0.36, -0.2], [EX1 - 0.12, CY + 0.47, -0.02]], 0.038, 64, 14), M.aluminum(), { parent: cac, name: 'cold-side pipe' });
      // air filter + intake duct
      const af = part(en, { he: 'מסנן אוויר', en: 'Air filter box & intake duct', mat: 'פלסטיק + נייר מסנן', desc: 'מסנן אוויר גדול שמזין את הטורבו. כונס האוויר מוגן ברשת נגד חפצים זרים.' });
      mesh(G.box(0.34, 0.2, 0.26, 0.04), M.plastic(0x18191b), { parent: af, pos: [2.18, CY + 0.32, -0.58] });
      for (const dx of [-0.12, 0.12]) mesh(G.box(0.03, 0.05, 0.012), M.steel(), { parent: af, pos: [2.18 + dx, CY + 0.36, -0.715], name: 'lid clip' });
      mesh(G.tube([[2.05, CY + 0.36, -0.5], [1.85, CY + 0.47, -0.3], [1.55, CY + 0.47, -0.15], [TP.x + 0.02, TP.y + 0.05, TP.z + 0.15]], 0.05, 64, 16), M.plastic(0x1c1c1e), { parent: af, name: 'intake duct' });
      // batteries, fuse box, reservoirs, brake booster
      const elec = part(en, { he: 'שני מצברים', en: 'Twin batteries', mat: 'עופרת־חומצה AGM', desc: 'שני מצברים כבדים — מנוע דיזל צריך זרם התנעה גבוה, ומערכות התקשורת והאבטחה צורכות הרבה.' });
      for (const s of [1, -1]) {
        mesh(G.box(0.26, 0.2, 0.17, 0.01), M.plastic(0x15171a), { parent: elec, pos: [2.22, 0.87, s * 0.68], name: 'battery' });
        mesh(G.box(0.28, 0.012, 0.03), M.darkSteel(), { parent: elec, pos: [2.22, 0.975, s * 0.68], name: 'hold-down' });
        mesh(G.cyl(0.013, 0.015, 0.025, 12, 'y'), M.plastic(0xc0262d), { parent: elec, pos: [2.31, 0.985, s * 0.64], name: '+ terminal cover' });
        mesh(G.cyl(0.013, 0.015, 0.025, 12, 'y'), M.plastic(0x111111), { parent: elec, pos: [2.13, 0.985, s * 0.64], name: '− terminal' });
        mesh(G.tube([[2.31, 0.99, s * 0.64], [2.35, 1.02, s * 0.5], [2.2, 0.96, s * 0.3], [EX1, CY + 0.1, s * 0.25]], 0.009, 32, 8), M.plastic(s > 0 ? 0xa01f25 : 0x111111), { parent: elec, name: 'battery cable' });
      }
      const fuse = part(en, { he: 'קופסת נתיכים וממסרים', en: 'Underhood fuse & relay centre', mat: 'פלסטיק', desc: 'מרכז החשמל של תא המנוע: עשרות נתיכים וממסרים, חלקם למערכות האבטחה המיוחדות.' });
      mesh(G.box(0.24, 0.1, 0.16, 0.02), M.plastic(0x141516), { parent: fuse, pos: [1.38, 1.0, 0.66] });
      mesh(G.box(0.22, 0.012, 0.14, 0.01), M.plastic(0x1f2023), { parent: fuse, pos: [1.38, 1.056, 0.66], name: 'lid' });
      const fl = part(en, { he: 'מכלי נוזלים', en: 'Fluid reservoirs', mat: 'פוליפרופילן שקוף־למחצה', desc: 'מיכל נוזל קירור (כתום), מיכל נוזל לשטיפת שמשות ומיכל נוזל בלמים — כל אחד עם מכסה בצבע אחר.' });
      const translucent = new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.4, transparent: true, opacity: 0.45, depthWrite: false });
      mesh(G.box(0.18, 0.14, 0.12, 0.03), translucent, { parent: fl, pos: [1.66, 1.0, 0.7], name: 'coolant tank' });
      mesh(G.box(0.16, 0.07, 0.1, 0.02), M.matte(0xd9731c), { parent: fl, pos: [1.66, 0.97, 0.7], name: 'coolant' });
      mesh(G.cyl(0.028, 0.028, 0.03, 20, 'y'), M.plastic(0x111111), { parent: fl, pos: [1.66, 1.085, 0.7], name: 'coolant cap' });
      mesh(G.box(0.16, 0.18, 0.1, 0.03), translucent, { parent: fl, pos: [2.25, 0.86, -0.83], name: 'washer tank' });
      mesh(G.cyl(0.022, 0.022, 0.025, 16, 'y'), M.plastic(0x1f62c9), { parent: fl, pos: [2.25, 0.97, -0.83], name: 'washer cap' });
      mesh(G.cyl(0.02, 0.02, 0.025, 16, 'y'), M.plastic(0xe8c21a), { parent: fl, pos: [EX1 - 0.1, at(1, 0.585).y, at(1, 0.585, 0, EX1).z], name: 'oil filler cap' });
      mesh(G.torus(0.018, 0.004, 6, 16, Math.PI * 2, 'x'), M.plastic(0xe8c21a), { parent: fl, pos: [EX0 + 0.25, CY + 0.42, -0.3], name: 'dipstick handle' });
      const bb = part(en, { he: 'מגבר בלמים ומשאבה ראשית', en: 'Hydro-boost & master cylinder', mat: 'פלדה + אלומיניום', desc: 'מגבר בלמים הידראולי (Hydro-Boost) של משאיות — מגבר ואקום רגיל לא היה מספיק לעצור 9 טון.' });
      mesh(G.cyl(0.11, 0.11, 0.12, 32, 'x'), M.darkSteel(), { parent: bb, pos: [1.08, 1.0, -0.5], name: 'booster' });
      mesh(G.cyl(0.035, 0.035, 0.17, 20, 'x'), M.castAlu(), { parent: bb, pos: [1.22, 1.0, -0.5], name: 'master cylinder' });
      mesh(G.box(0.12, 0.07, 0.08, 0.015), translucent, { parent: bb, pos: [1.22, 1.07, -0.5], name: 'brake fluid reservoir' });
      mesh(G.cyl(0.02, 0.02, 0.02, 16, 'y'), M.plastic(0x111111), { parent: bb, pos: [1.22, 1.115, -0.5], name: 'reservoir cap' });
    }

    // ================================================================== FRONT & REAR FASCIA, LIGHTS, INSIGNIA
    // emitters get their own materials so toggles can drive them independently
    const glow = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.35, metalness: 0 });
    const L = {
      head: glow(0xf4f8ff, 0.05), drl: glow(0xf4f8ff, 0.8), turn: glow(0xffa21a, 0.15), fog: glow(0xfff3d6, 0.05),
      tail: glow(0xff1a1a, 0.35), reverse: glow(0xffffff, 0.05), marker: glow(0xff9a1a, 0.3),
      red: glow(0xff1020, 0.05), blue: glow(0x1a4dff, 0.05), plate: glow(0xffffff, 0.05), flagLamp: glow(0xfff2cc, 0.3),
    };
    const onFront = (geo, x, y = 0, z = 0) => { geo.rotateY(Math.PI / 2); geo.translate(x, y, z); return geo; };
    const onRear = (geo, x, y = 0, z = 0) => { geo.rotateY(-Math.PI / 2); geo.translate(x, y, z); return geo; };
    const plan = (x0, x1, hw, r, h, y) => { const g = G.extrude(G.roundRect(x1 - x0, hw * 2, r, (x0 + x1) / 2, 0), h, { bevel: 0.015, bevelSeg: 3 }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
    {
      const bodyS = sys('body'), lights = sys('lights'), ins = sys('insignia'), sec = sys('security');
      const FX = XF;

      // ---------------- grille
      const grille = part(bodyS, { he: 'גריל קדמי', en: 'Chrome mesh grille', mat: 'פלדת אל־חלד בציפוי כרום', desc: 'הגריל הגדול בסגנון קדילק. מאחורי סורגי הכרום מסתתרים אורות חירום, מצלמת ראיית לילה והרדיאטור.' });
      const gfr = G.roundRect(1.16, 0.52, 0.06); gfr.holes.push(G.roundRectPath(1.07, 0.43, 0.035));
      mesh(onFront(G.extrude(gfr, 0.05, { bevel: 0.012, bevelSeg: 4 }), FX + 0.03, 0.88, 0), M.chrome(), { parent: grille, name: 'surround' });
      mesh(new THREE.BoxGeometry(0.006, 0.43, 1.07), M.black(), { parent: grille, pos: [FX + 0.004, 0.88, 0], name: 'backing' });
      const bars = [];
      for (let i = 0; i < 9; i++) bars.push(G.at(G.box(0.022, 0.011, 1.06), [FX + 0.032, 0.68 + i * 0.05, 0]));
      for (let i = 0; i < 17; i++) bars.push(G.at(G.box(0.03, 0.42, 0.007), [FX + 0.024, 0.88, -0.52 + i * 0.065]));
      mesh(G.merge(bars), M.chrome(), { parent: grille, name: 'mesh bars' });
      // Cadillac crest
      const crest = part(ins, { he: 'סמל קדילק (חזית)', en: 'Cadillac crest — front', mat: 'אקריליק צבעוני + מסגרת כרום', desc: 'סמל קדילק ללא זר הדפנה, בגרסה שהוצגה ב־2014. מתחתיו מוסתרת מצלמת ראיית לילה.' });
      const crestTex = crestTexture(K);
      const shield = G.shape([[-0.0625, 0.0727], [0.0625, 0.0727], [0.0531, -0.0289], [0, -0.0898], [-0.0531, -0.0289]].map(([x, y]) => [x * 1.06, y * 1.06]));
      mesh(onFront(G.extrude(shield, 0.03, { bevel: 0.006 }), FX + 0.07, 0.9, 0), M.chrome(), { parent: crest, name: 'shield' });
      mesh(onFront(new THREE.PlaneGeometry(0.2, 0.2), FX + 0.092, 0.887, 0), M.decal(crestTex, { clearcoat: 1, roughness: 0.15 }), { parent: crest, name: 'crest face', cast: false });

      // ---------------- headlamps, LED blades, turn signals
      for (const s of [1, -1]) {
        const sideHe = s > 0 ? 'ימני' : 'שמאלי';
        const hl = part(lights, { he: `פנס ראשי ${sideHe}`, en: 'LED headlamp', mat: 'פוליקרבונט, אלומיניום, נוריות LED', desc: 'פנס LED עם שתי עדשות הקרנה (אור נמוך וגבוה). העדשה החיצונית עמידה לפגיעות.' });
        mesh(G.box(0.05, 0.15, 0.25, 0.02), M.black(), { parent: hl, pos: [FX + 0.012, 1.045, s * 0.715], name: 'housing' });
        mesh(new THREE.BoxGeometry(0.004, 0.11, 0.22), L.head, { parent: hl, pos: [FX + 0.039, 1.06, s * 0.715], name: 'LED reflector array', cast: false });
        for (const dz of [-0.06, 0.06]) {
          mesh(G.sphere(0.03, 24, 16), M.clearLens(), { parent: hl, pos: [FX + 0.035, 1.05, s * 0.715 + dz], name: 'projector lens' });
          mesh(G.torus(0.034, 0.006, 8, 24, Math.PI * 2, 'x'), M.chrome(), { parent: hl, pos: [FX + 0.03, 1.05, s * 0.715 + dz], name: 'bezel' });
          mesh(G.cyl(0.024, 0.024, 0.006, 20, 'x'), L.head, { parent: hl, pos: [FX + 0.018, 1.05, s * 0.715 + dz], name: 'LED emitter' });
        }
        mesh(G.box(0.006, 0.012, 0.21), L.drl, { parent: hl, pos: [FX + 0.034, 0.987, s * 0.715], name: 'DRL light pipe' });
        mesh(G.box(0.03, 0.155, 0.255, 0.02), M.clearLens(), { parent: hl, pos: [FX + 0.042, 1.045, s * 0.715], name: 'outer lens', cast: false });
        const blade = part(lights, { he: `להב LED אנכי ${sideHe}`, en: 'Vertical LED signature blade', mat: 'פוליקרבונט + LED', desc: 'פס האור האנכי — חתימת העיצוב של קדילק. משמש כאור יום, והחלק התחתון מהבהב ככתום כאיתות.' });
        mesh(G.box(0.02, 0.4, 0.04, 0.008), M.chrome(), { parent: blade, pos: [FX + 0.004, 0.8, s * 0.838], name: 'bezel' });
        mesh(G.box(0.012, 0.29, 0.022, 0.005), L.drl, { parent: blade, pos: [FX + 0.012, 0.845, s * 0.838], name: 'DRL' });
        mesh(G.box(0.012, 0.08, 0.022, 0.005), L.turn, { parent: blade, pos: [FX + 0.012, 0.645, s * 0.838], name: 'turn signal' });
        const mk = part(lights, { he: `פנס צד ${sideHe}`, en: 'Side marker lamps', mat: 'עדשה צבעונית', desc: 'פנסי סימון בצד הכנף: כתום מלפנים, אדום מאחור.' });
        const pf = sideAt(2.42, 0.95, s), pr = sideAt(-2.38, 0.95, s);
        mesh(G.box(0.07, 0.025, 0.012, 0.005), L.marker, { parent: mk, pos: pf.p.clone().addScaledVector(pf.n, 0.004).toArray() });
        mesh(G.box(0.07, 0.025, 0.012, 0.005), L.tail, { parent: mk, pos: pr.p.clone().addScaledVector(pr.n, 0.004).toArray() });
      }
      // grille-mounted emergency strobes
      const em = part(lights, { he: 'אורות חירום (גריל ופגוש)', en: 'Emergency strobes — front', mat: 'LED אדום/כחול', desc: 'נוריות אדום־כחול מוסתרות בגריל ובפגוש. דולקות רק כשהשיירה צריכה לפנות דרך.' });
      for (const s of [1, -1]) {
        mesh(G.box(0.01, 0.03, 0.09, 0.004), s > 0 ? L.red : L.blue, { parent: em, pos: [FX + 0.012, 0.74, s * 0.38] });
        mesh(G.box(0.01, 0.03, 0.09, 0.004), s > 0 ? L.blue : L.red, { parent: em, pos: [FX + 0.012, 1.02, s * 0.3] });
      }

      // ---------------- front bumper
      const fb = part(bodyS, { he: 'פגוש קדמי משוריין', en: 'Armoured front bumper', mat: 'פלדת שריון + חיפוי פלסטי', desc: 'פגוש מחוזק שיכול לשמש כאיל ניגוח. בתוכו: משגרי גז מדמיע, פנסי ערפל, אורות חירום ווי גרירה.' });
      mesh(plan(2.6, 2.775, 0.93, 0.16, 0.2, 0.465), PAINT, { parent: fb, name: 'bumper shell' });
      mesh(new THREE.BoxGeometry(0.004, 0.012, 1.5), M.chrome(), { parent: fb, pos: [2.79, 0.645, 0], name: 'chrome strip' });
      for (const s of [1, -1]) {
        mesh(new THREE.BoxGeometry(0.01, 0.1, 0.3), M.black(), { parent: fb, pos: [2.786, 0.555, s * 0.37], name: 'lower intake' });
        for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.014, 0.008, 0.3), M.gloss(0x0d0d0d), { parent: fb, pos: [2.79, 0.52 + i * 0.024, s * 0.37], name: 'intake slat' });
        mesh(G.cyl(0.036, 0.036, 0.012, 24, 'x'), L.fog, { parent: fb, pos: [2.786, 0.56, s * 0.67], name: 'fog lamp' });
        mesh(G.torus(0.04, 0.006, 8, 24, Math.PI * 2, 'x'), M.chrome(), { parent: fb, pos: [2.79, 0.56, s * 0.67], name: 'fog bezel' });
        mesh(G.box(0.01, 0.022, 0.08, 0.004), s > 0 ? L.blue : L.red, { parent: fb, pos: [2.789, 0.62, s * 0.8], name: 'bumper strobe' });
        mesh(G.torus(0.035, 0.012, 10, 20, Math.PI, 'z'), M.chrome(), { parent: fb, pos: [2.72, 0.455, s * 0.28], rot: [Math.PI, 0, 0], name: 'tow hook' });
        for (let i = 0; i < 3; i++) mesh(G.cyl(0.017, 0.017, 0.01, 18, 'x'), M.black(), { parent: fb, pos: [2.789, 0.495, s * (0.15 + i * 0.045)], name: 'tear-gas port' });
      }
      mesh(new THREE.BoxGeometry(0.4, 0.012, 1.2), M.darkSteel(), { parent: fb, pos: [2.5, 0.452, 0], name: 'skid plate' });

      // ---------------- rear
      const RX = XR;
      const rb = part(bodyS, { he: 'פגוש אחורי משוריין', en: 'Armoured rear bumper', mat: 'פלדת שריון + חיפוי', desc: 'פגוש אחורי מחוזק עם משטח דריכה, מחזירי אור, אורות חירום ונחירי מסך עשן.' });
      mesh(plan(-2.755, -2.57, 0.92, 0.17, 0.21, 0.46), PAINT, { parent: rb, name: 'bumper shell' });
      mesh(new THREE.BoxGeometry(0.12, 0.008, 1.3), M.rubber(), { parent: rb, pos: [-2.69, 0.676, 0], name: 'step pad' });
      for (const s of [1, -1]) {
        mesh(new THREE.BoxGeometry(0.006, 0.03, 0.12), M.lens(0xb00d10, 0.9), { parent: rb, pos: [-2.771, 0.6, s * 0.72], name: 'reflector' });
        mesh(G.box(0.01, 0.022, 0.08, 0.004), s > 0 ? L.red : L.blue, { parent: rb, pos: [-2.771, 0.56, s * 0.5], name: 'rear strobe' });
        for (let i = 0; i < 2; i++) mesh(G.cyl(0.012, 0.012, 0.012, 14, 'x'), M.black(), { parent: rb, pos: [-2.771, 0.5, s * (0.28 + i * 0.04)], name: 'smoke-screen nozzle' });
      }
      for (const s of [1, -1]) {
        const sideHe = s > 0 ? 'ימני' : 'שמאלי';
        const tl = part(lights, { he: `פנס אחורי ${sideHe}`, en: 'Vertical LED tail lamp', mat: 'עדשה אדומה + LED', desc: 'פנס אנכי גבוה בסגנון ״סנפירי״ קדילק: אור אחורי, בלם ואיתות, ובתחתיתו אור רוורס.' });
        mesh(G.box(0.03, 0.52, 0.1, 0.012), M.chrome(), { parent: tl, pos: [RX - 0.006, 0.93, s * 0.775], name: 'bezel' });
        mesh(G.box(0.02, 0.4, 0.08, 0.01), L.tail, { parent: tl, pos: [RX - 0.016, 0.98, s * 0.775], name: 'tail/brake LED' });
        instances(G.box(0.004, 0.012, 0.064), L.tail, Array.from({ length: 14 }, (_, i) => ({ pos: [RX - 0.028, 0.8 + i * 0.026, s * 0.775] })), { parent: tl, cast: false });
        mesh(G.box(0.02, 0.07, 0.08, 0.01), L.reverse, { parent: tl, pos: [RX - 0.016, 0.72, s * 0.775], name: 'reverse lamp' });
        mesh(G.box(0.034, 0.52, 0.104, 0.014), M.lens(0x8a0a0c, 0.35), { parent: tl, pos: [RX - 0.02, 0.93, s * 0.775], name: 'outer lens', cast: false });
      }
      const crestR = part(ins, { he: 'סמל קדילק (אחור)', en: 'Cadillac crest — rear', mat: 'אקריליק + כרום', desc: 'סמל קדילק על מכסה תא המטען. מתחתיו מצלמת רוורס.' });
      mesh(onRear(G.extrude(shield, 0.02, { bevel: 0.005 }), RX - 0.012, 1.08, 0), M.chrome(), { parent: crestR, name: 'shield' });
      mesh(onRear(new THREE.PlaneGeometry(0.2, 0.2), RX - 0.028, 1.067, 0), M.decal(crestTex, { clearcoat: 1, roughness: 0.15 }), { parent: crestR, cast: false, name: 'crest face' });
      // plate recesses + plates
      const plateTex = plateTexture(K);
      for (const [x, y, face, he] of [[2.792, 0.56, 1, 'לוחית רישוי קדמית'], [RX - 0.01, 0.875, -1, 'לוחית רישוי אחורית']]) {
        const pl = part(ins, { he, en: 'D.C. licence plate', mat: 'אלומיניום מוטבע', desc: 'לוחית של וושינגטון די.סי. עם המספר 800‑002 שדווח לרכבי הנשיא, והסיסמה ״End Taxation Without Representation״.' });
        const g = new THREE.PlaneGeometry(0.305, 0.152);
        mesh(face > 0 ? onFront(g, x, y, 0) : onRear(g, x, y, 0), M.decal(plateTex, { metalness: 0.4, roughness: 0.35 }), { parent: pl, cast: false, name: 'plate' });
        const fr = G.roundRect(0.33, 0.175, 0.012); fr.holes.push(G.roundRectPath(0.3, 0.147, 0.008));
        mesh(face > 0 ? onFront(G.extrude(fr, 0.008), x + 0.002, y, 0) : onRear(G.extrude(fr, 0.008), x - 0.002, y, 0), M.chrome(), { parent: pl, name: 'frame' });
        for (const dz of [-0.11, 0.11]) mesh(G.cyl(0.006, 0.006, 0.006, 12, 'x'), M.chrome(), { parent: pl, pos: [x + face * 0.004, y + 0.05, dz], name: 'screw' });
      }
      mesh(new THREE.BoxGeometry(0.01, 0.2, 0.36), M.black(), { parent: rb, pos: [RX - 0.002, 0.875, 0], name: 'plate recess' });
      mesh(G.box(0.01, 0.008, 0.06), L.plate, { parent: lights, pos: [RX - 0.01, 0.97, 0], name: 'plate lamp' });
      const cam = part(sec, { he: 'מצלמת רוורס ומצלמה תרמית אחורית', en: 'Rear camera', mat: 'זכוכית ספיר', desc: 'מצלמה אחורית עם ראיית לילה תרמית — הנהג רואה מה קורה מאחור גם בחושך מוחלט.' });
      mesh(G.cyl(0.014, 0.014, 0.02, 16, 'x'), M.black(), { parent: cam, pos: [RX - 0.01, 0.985, 0.06] });
      mesh(G.sphere(0.009, 12, 8), M.glass(0x111a22, 0.9), { parent: cam, pos: [RX - 0.02, 0.985, 0.06] });
      const nv = part(sec, { he: 'מצלמת ראיית לילה (FLIR)', en: 'Forward night-vision camera', mat: 'גרמניום + אלומיניום', desc: 'מצלמה תרמית מאחורי הגריל, שמציגה לנהג תמונה של אנשים וחיות בחושך עד 300 מטר קדימה.' });
      mesh(G.box(0.06, 0.05, 0.07, 0.01), M.black(), { parent: nv, pos: [FX + 0.012, 0.72, 0] });
      mesh(G.cyl(0.016, 0.016, 0.012, 20, 'x'), M.glass(0x1f2a1a, 0.95), { parent: nv, pos: [FX + 0.043, 0.72, 0], name: 'germanium lens' });

      // ---------------- cowl, wipers, fuel door, beltline chrome
      const cowl = part(bodyS, { he: 'רשת קאול ומגבים', en: 'Cowl grille & wipers', mat: 'פלסטיק + פלדה', desc: 'שני מגבים כבדים במיוחד — הם צריכים לנקות שמשה בעובי 13 ס״מ. מתחתם רשת יניקת אוויר למיזוג המסונן.' });
      mesh(new THREE.BoxGeometry(0.05, 0.01, 1.6), M.plastic(0x0b0b0c), { parent: cowl, pos: [1.015, BELT + 0.012, 0], name: 'cowl grille' });
      for (let i = 0; i < 30; i++) mesh(new THREE.BoxGeometry(0.035, 0.004, 0.006), M.black(), { parent: cowl, pos: [1.015, BELT + 0.018, -0.72 + i * 0.05], name: 'slot' });
      for (const [v0, v1, pz] of [[-0.5, -0.04, -0.55], [0.02, 0.46, 0.04]]) {
        const pts = samples(v0, v1, 0.06).map((v) => gSec(0.94, v).add(V3(0.0, 0.016, 0)));
        mesh(G.tube(pts, 0.007, 24, 6), M.rubber(), { parent: cowl, name: 'wiper blade' });
        const mid = pts[Math.floor(pts.length / 2)];
        mesh(G.tube([V3(1.02, BELT + 0.03, pz), V3(0.99, BELT + 0.04, (pz + mid.z) / 2), mid.clone().add(V3(0, 0.01, 0))], 0.006, 16, 6), M.plastic(0x0d0d0d), { parent: cowl, name: 'wiper arm' });
        mesh(G.cyl(0.018, 0.018, 0.03, 16, 'y'), M.plastic(0x0d0d0d), { parent: cowl, pos: [1.02, BELT + 0.02, pz], name: 'wiper pivot cap' });
      }
      const fuelDoor = part(bodyS, { he: 'מכסה פתח תדלוק', en: 'Fuel filler door', mat: 'פלדה + צבע', desc: 'פתח התדלוק בכנף האחורית השמאלית. מוביל למיכל הדלק המשוריין.' });
      const fdp = sideAt(-1.9, 1.06, -1);
      mesh(G.box(0.17, 0.15, 0.006, 0.02), PAINT, { parent: fuelDoor, pos: fdp.p.clone().addScaledVector(fdp.n, 0.002).toArray() });
      mesh(G.torus(0.088, 0.0025, 4, 40, Math.PI * 2, 'z'), M.black(), { parent: fuelDoor, pos: fdp.p.clone().addScaledVector(fdp.n, 0.0005).toArray(), scale: [1, 0.86, 1] });

      // ---------------- flags (US on the right, Presidential standard on the left)
      const flags = part(ins, { he: 'דגלים על הכנפיים', en: 'Fender flags', desc: 'בנסיעה רשמית: דגל ארה״ב על הכנף הימנית ודגל הנשיא על השמאלית, כל אחד עם פנס קטן שמאיר אותו בלילה.' });
      const flagInfo = [
        { s: 1, he: 'דגל ארצות הברית', en: 'US flag', tex: usFlagTexture(K) },
        { s: -1, he: 'דגל נשיא ארה״ב', en: 'Presidential standard', tex: presFlagTexture(K) },
      ];
      const flagMeshes = [];
      for (const f of flagInfo) {
        const fx = 2.44, fz = f.s * 0.93, fy = Y1(fx) + 0.002;
        const fp = part(flags, { he: f.he, en: f.en, mat: 'ניילון + מוט כרום', desc: f.s > 0 ? 'דגל ארה״ב, על הכנף הימנית (צד הנוסע) — המקום המכובד לפי פרוטוקול הדגל.' : 'דגל הנשיא: סמל הנשיאות על רקע כחול כהה, עם 4 כוכבים בפינות.' });
        mesh(G.lathe([[0.03, 0], [0.03, 0.01], [0.012, 0.03], [0.008, 0.05]], 24, 'y'), M.chrome(), { parent: fp, pos: [fx, fy, fz], name: 'mount' });
        mesh(G.cyl(0.005, 0.006, 0.42, 12, 'y'), M.chrome(), { parent: fp, pos: [fx, fy + 0.26, fz], name: 'staff' });
        mesh(G.lathe([[0, 0], [0.012, 0.004], [0.008, 0.02], [0, 0.045]], 16, 'y'), M.gold(), { parent: fp, pos: [fx, fy + 0.47, fz], name: 'finial' });
        mesh(G.box(0.03, 0.015, 0.025, 0.005), L.flagLamp, { parent: fp, pos: [fx + 0.05, fy + 0.008, fz], name: 'flag lamp' });
        const cloth = new THREE.PlaneGeometry(0.33, 0.21, 22, 12);
        cloth.translate(-0.165, 0, 0); cloth.rotateY(Math.PI);
        const fm = mesh(cloth, new THREE.MeshStandardMaterial({ map: f.tex, side: THREE.DoubleSide, roughness: 0.85 }), { parent: fp, pos: [fx - 0.004, fy + 0.35, fz], name: 'flag' });
        fm.userData.base = Float32Array.from(cloth.attributes.position.array);
        fm.userData.phase = f.s > 0 ? 0 : 1.7;
        flagMeshes.push(fm);
      }
      K.onFrame((t) => {
        for (const fm of flagMeshes) {
          if (!fm.visible) continue;
          const pos = fm.geometry.attributes.position, b = fm.userData.base;
          for (let i = 0; i < pos.count; i++) {
            const bx = b[i * 3], by = b[i * 3 + 1], u = Math.max(0, bx) / 0.33; // 0 at the staff → 1 at the fly end
            pos.array[i * 3 + 2] = b[i * 3 + 2] + Math.pow(u, 1.3) * 0.035 * Math.sin(u * 9 - t * 7 + fm.userData.phase + by * 3);
            pos.array[i * 3 + 1] = by - u * u * 0.02;
          }
          pos.needsUpdate = true; fm.geometry.computeVertexNormals();
        }
      });
      K.toggle('flags', { he: 'דגלים', key: 'g', seconds: 0.6 }, (t) => { for (const fm of flagMeshes) { fm.visible = t > 0.02; fm.scale.setScalar(Math.max(0.001, t)); } }, 1);

      // light toggles
      const spots = [];
      for (const s of [1, -1]) {
        const sp = new THREE.SpotLight(0xf2f6ff, 0, 30, 0.42, 0.55, 1.4);
        sp.position.set(FX + 0.06, 1.05, s * 0.715); sp.target.position.set(FX + 8, 0, s * 0.9);
        lights.add(sp, sp.target); spots.push(sp);
      }
      K.toggle('lights', { he: 'פנסים', key: 'l', seconds: 0.4, night: true }, (t) => {
        L.head.emissiveIntensity = 0.05 + t * 4; L.drl.emissiveIntensity = 0.8 + t * 1.6; L.fog.emissiveIntensity = 0.05 + t * 2.5;
        L.tail.emissiveIntensity = 0.35 + t * 1.6; L.plate.emissiveIntensity = 0.05 + t * 2; L.marker.emissiveIntensity = 0.3 + t * 1.5; L.flagLamp.emissiveIntensity = 0.3 + t * 2.5;
        spots.forEach((sp) => (sp.intensity = t * 40));
      });
      let sirenOn = 0;
      K.toggle('siren', { he: 'אורות חירום', key: 'b', seconds: 0.2 }, (t) => { sirenOn = t; if (t < 0.01) { L.red.emissiveIntensity = 0.05; L.blue.emissiveIntensity = 0.05; } });
      K.onFrame((t) => {
        if (sirenOn < 0.5) return;
        const ph = (t * 3.2) % 1, burst = (k) => (ph > k && ph < k + 0.08) || (ph > k + 0.14 && ph < k + 0.22);
        L.red.emissiveIntensity = burst(0) ? 9 : 0.05; L.blue.emissiveIntensity = burst(0.5) ? 9 : 0.05;
      });
    }

    // ================================================================== DOOR DETAILS + DOOR ARMOUR
    {
      const sealTex = sealTexture(K);
      const tileGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
      for (const d of ctxShared.doors) {
        const { door, s, front, x0, x1, tr } = d;
        const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
        // exterior handle near the trailing edge
        const hx = front ? x1 + 0.13 : x1 + 0.13;
        const hp = sideAt(hx, 1.1, s);
        const handle = part(door, { he: 'ידית חיצונית מחושמלת', en: 'Electrified door handle', mat: 'כרום', desc: 'ידית כרום רגילה למראה. במצב חירום אפשר לחשמל אותה כדי להרתיע מי שמנסה לפתוח את הדלת מבחוץ.' });
        const hq = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), hp.n);
        const hg = new THREE.Group(); hg.position.copy(hp.p.clone().sub(d.pivot)); hg.quaternion.copy(hq); handle.add(hg);
        mesh(G.box(0.2, 0.05, 0.012, 0.012), M.black(), { parent: hg, pos: [0, 0, 0.002], name: 'recess' });
        mesh(G.tube([[-0.09, 0, 0.004], [-0.07, 0, 0.03], [0.07, 0, 0.03], [0.09, 0, 0.004]], 0.011, 24, 10), M.chrome(), { parent: hg, name: 'pull bar' });
        if (front) mesh(G.merge([G.cyl(0.014, 0.014, 0.012, 20, 'z'), G.at(G.box(0.012, 0.002, 0.004), [0, 0, 0.007])]), M.chrome(), { parent: hg, pos: [0.14, 0, 0.006], name: 'key cylinder' });
        // beltline chrome along the bottom of the window
        mesh(tr(G.tube(samples(xb - 0.01, xa + 0.01, 0.05).map((x) => gSec(x, s * 0.992).addScaledVector(V3(0, 0, s), 0.004)), 0.0055, 24, 6)), M.chrome(), { parent: door, name: 'beltline chrome' });
        // hinges (3 per door, heavy-duty)
        const hingeP = part(door, { he: 'צירי דלת כבדים', en: 'Heavy-duty hinges ×3', mat: 'פלדה מחושלת', desc: 'שלושה צירים במקום שניים, כי כל דלת שוקלת כמו דלת של מטוס נוסעים.' });
        for (const y of [0.66, 0.9, 1.14]) { const q = sideAt(x0, y, s); mesh(G.merge([G.box(0.06, 0.07, 0.05, 0.01), G.at(G.cyl(0.014, 0.014, 0.09, 12, 'y'), [0.03, 0, 0])]), M.darkSteel(), { parent: hingeP, pos: q.p.clone().addScaledVector(q.n, -0.06).sub(d.pivot).toArray(), name: 'hinge' }); }
        // hermetic seal around the door
        const ring = [];
        for (const x of samples(xa + 0.012, xb - 0.012, 0.06)) ring.push(lowSec(x, s * 0.735));
        for (const v of samples(0.735, LV.deck, 0.06)) ring.push(lowSec(xb - 0.012, s * v));
        for (const v of samples(1, 0.735, 0.04)) ring.push(gSec(xb - 0.012, s * v));
        for (const x of samples(xb - 0.012, xa + 0.012, 0.05)) ring.push(gSec(x, s * 0.735));
        for (const v of samples(0.735, 1, 0.04)) ring.push(gSec(xa + 0.012, s * v));
        for (const v of samples(LV.deck, 0.735, 0.06)) ring.push(lowSec(xa + 0.012, s * v));
        const sealPts = ring.map((p) => p.clone().addScaledVector(V3(0, 0, s), -0.05));
        const seal = part(door, { he: 'אטם הרמטי', en: 'Hermetic double seal', mat: 'גומי EPDM', desc: 'אטם גומי כפול סביב הדלת. כשהיא סגורה, התא אטום הרמטית — כולל נגד גזים כימיים.' });
        mesh(tr(G.tube(sealPts, 0.009, 220, 6, true)), M.rubber(), { parent: seal });
        // armour package inside the door: listed under the armour system
        const ar = part(door, { he: 'שכבות שריון בדלת', en: 'Door armour package', desc: 'כ־20 ס״מ של שכבות: פלדת שריון, אריחי קרמיקה, קבלר, טיטניום ואלומיניום. עוצר ירי חודר שריון ורסיסי פיצוץ.' });
        ar.userData.sysOverride = 'armor';
        const axs = samples(xb - 0.025, xa + 0.025, 0.05), avs = samples(s * 0.33, s * 0.72, 0.03, [LV.shoulder, LV.cornerT].map((b) => s * b));
        const layers = [
          { off: -0.02, t: 0.012, m: M.armorSteel(), he: 'פלדת שריון מוקשית (12 מ״מ)' },
          { off: -0.085, t: 0.03, m: M.kevlar(), he: 'שכבת קבלר (30 מ״מ)' },
          { off: -0.12, t: 0.008, m: M.titanium(), he: 'לוח טיטניום (8 מ״מ)' },
          { off: -0.135, t: 0.012, m: M.aluminum(), he: 'לוח אלומיניום (12 מ״מ)' },
        ];
        for (const l of layers) { const lp = part(ar, { he: l.he, en: 'Armour layer', mat: l.m.name, desc: 'שכבה אחת מתוך מארז השריון של הדלת.' }); mesh(tr(surface(lowSec, axs, avs, { out: outLow, offset: l.off, thickness: l.t })), l.m, { parent: lp }); }
        const tiles = [];
        for (const x of samples(xb - 0.05, xa + 0.05, 0.055)) for (let y = 0.62; y < BELT - 0.12; y += 0.055) { const q = sideAt(x, y, s); tiles.push({ pos: q.p.clone().addScaledVector(q.n, -0.055).sub(d.pivot).toArray() }); }
        const tp = part(ar, { he: `${tiles.length} אריחי קרמיקה בליסטית`, en: 'Ballistic ceramic tiles', mat: 'קרביד בורון / אלומינה', desc: 'אריחים קשים מאוד שמנפצים את הקליע לפני שהוא פוגע בשכבות הבאות. מסודרים בשורות כמו פסיפס.' });
        instances(tileGeo, M.ceramic(), tiles, { parent: tp });
        // inner trim panel
        const trim = part(door, { he: 'חיפוי פנימי', en: 'Door trim panel', mat: 'עור, עץ, כרום', desc: front ? 'חיפוי פנימי בעור עם מתגי חלונות ונעילה, ידית פנימית ומשענת יד.' : 'חיפוי עור לתא הנשיא: משענת יד רחבה, רמקול, מנורת אווירה ופס עץ.' });
        mesh(tr(surface(lowSec, samples(xb - 0.02, xa + 0.02, 0.05), samples(s * 0.34, s * 0.735, 0.03, [LV.shoulder, LV.cornerT].map((b) => s * b)), { out: outLow, offset: -0.165, thickness: 0.035 })), M.leather(0x14161b), { parent: trim, name: 'panel' });
        const inner = (x, y, depth) => { const q = sideAt(x, y, s); return q.p.clone().addScaledVector(q.n, -depth).sub(d.pivot); };
        mesh(G.soft(Math.abs(xb - xa) * 0.62, 0.05, 0.1, { r: 0.02, seg: 4, deform: (q, n) => { q.y += 0.006 * (1 - n.x * n.x) * smooth(0, 1, n.y); } }), M.leather(0x1a1c22), { parent: trim, pos: inner((xa + xb) / 2 - 0.03, 0.93, 0.24).toArray(), name: 'armrest' });
        mesh(G.box(Math.abs(xb - xa) * 0.7, 0.025, 0.006), M.wood(), { parent: trim, pos: inner((xa + xb) / 2, 1.13, 0.2).toArray(), name: 'wood strip' });
        mesh(G.box(0.12, 0.02, 0.02, 0.008), M.chrome(), { parent: trim, pos: inner(front ? xb - 0.25 : xb - 0.22, 1.06, 0.215).toArray(), name: 'inner handle' });
        const spk = inner((xa + xb) / 2, 0.79, 0.203);
        mesh(G.cyl(0.07, 0.07, 0.006, 32, 'z'), new THREE.MeshStandardMaterial({ map: speakerTexture(K), metalness: 0.8, roughness: 0.4 }), { parent: trim, pos: spk.toArray(), rot: [Math.PI / 2 * 0, 0, 0], name: 'speaker grille' });
        mesh(G.box(0.03, 0.012, 0.03), glow(0xff2a1a, 0.6), { parent: trim, pos: inner(xa + 0.08, 0.63, 0.19).toArray(), name: 'door-open warning lamp' });
        // window / lock switches on the armrest (the driver gets the full cluster)
        { const sw = part(trim, { he: front && s < 0 ? 'מתגי חלונות, נעילה ומראות (נהג)' : 'מתג חלון ונעילה', en: 'Window & lock switches', mat: 'פלסטיק + כרום', desc: front && s < 0 ? 'מכאן הנהג שולט בכל החלונות, בנעילה המרכזית ובמראות. רק החלון שלו נפתח — כ־7.5 ס״מ בלבד, להעברת מסמכים או דיבור עם סוכן.' : 'מתג חלון (החלון עצמו נעול ולא נפתח) ולחצן נעילה.' });
          const ax = front ? xb - 0.24 : xb - 0.26, q = sideAt(ax, 0.962, s);
          const pos = q.p.clone().addScaledVector(q.n, -0.245).sub(d.pivot);
          const btns = front && s < 0
            ? [...[0, 1, 2, 3].map((i) => ({ kind: 'rocker', x: -0.045 + (i % 2) * 0.03, y: i < 2 ? 0.014 : -0.016, w: 0.022, h: 0.026, d: 0.008, color: 0x18191c })),
               { x: 0.025, y: 0.016, w: 0.026, h: 0.016, label: 'LOCK', color: 0x18191c }, { x: 0.025, y: -0.004, w: 0.026, h: 0.016, label: 'UNLK', color: 0x18191c },
               { kind: 'round', x: 0.05, y: -0.024, w: 0.02, d: 0.006, color: 0x18191c }, { x: 0.052, y: 0.012, w: 0.016, h: 0.012, label: 'L R', color: 0x18191c }]
            : [{ kind: 'rocker', x: -0.012, y: 0, w: 0.022, h: 0.026, d: 0.008, color: 0x18191c }, { x: 0.018, y: 0, w: 0.024, h: 0.016, label: 'LOCK', color: 0x18191c }];
          const pw = front && s < 0 ? 0.13 : 0.06;
          const g = K.panel(sw, { pos: pos.toArray(), normal: V3(0, 0.9, -s * 0.44).normalize().toArray(), up: [1, 0, 0], w: pw, h: 0.06, plate: M.gloss(0x0e0e10), buttons: btns });
          mesh(G.box(pw + 0.006, 0.003, 0.064, 0.0015), M.chrome(), { parent: g, pos: [0, -0.0305, -0.001], rot: [Math.PI / 2, 0, 0], name: 'chrome surround' }); }
        // presidential seal on the rear doors
        if (!front) {
          const sp = sideAt((xa + xb) / 2 + 0.02, 0.92, s);
          const seal2 = part(sys('insignia'), { he: `סמל נשיא ארה״ב — דלת ${s > 0 ? 'ימנית' : 'שמאלית'}`, en: 'Seal of the President of the United States', mat: 'מדבקת ויניל רב־שכבתית', desc: 'סמל הנשיאות על הדלתות האחוריות — הדלתות שדרכן הנשיא נכנס ויוצא.' });
          seal2.userData.sysOverride = 'insignia';
          const sm = mesh(new THREE.CircleGeometry(0.115, 64), M.decal(sealTex, { clearcoat: 1, roughness: 0.2 }), { parent: seal2, cast: false });
          sm.position.copy(sp.p.clone().addScaledVector(sp.n, 0.003).sub(d.pivot)); sm.lookAt(sm.position.clone().add(sp.n)); if (s < 0) sm.rotateZ(0);
          door.add(seal2);
        }
        // mirrors on the front doors
        if (front) {
          const mp = part(door, { he: `מראה צד ${s > 0 ? 'ימנית' : 'שמאלית'}`, en: 'Side mirror', mat: 'פלסטיק צבוע, זכוכית מראה, LED', desc: 'מראה מחוממת עם פנס איתות LED, נורית חירום אדומה־כחולה ופנס תאורת קרקע.' });
          const base = gSec(xb - 0.09, s * 0.96);
          const g = new THREE.Group(); g.position.copy(base.clone().sub(d.pivot)); mp.add(g);
          mesh(G.soft(0.13, 0.05, 0.06, { r: 0.018, seg: 3, deform: (q, n) => { q.y *= 1 - 0.3 * smooth(-1, 1, n.x); } }), PAINT, { parent: g, pos: [0, 0, s * 0.02], name: 'sail' });
          mesh(G.soft(0.05, 0.035, 0.13, { r: 0.015, seg: 3, deform: (q, n) => { q.y += 0.012 * smooth(-1, 1, n.z * s); } }), PAINT, { parent: g, pos: [-0.01, 0.03, s * 0.09], name: 'arm' });
          mesh(G.soft(0.1, 0.155, 0.24, { r: 0.045, seg: 5, deform: (q, n) => { q.x += 0.028 * (1 - n.y * n.y) * (1 - n.z * n.z) * smooth(-0.2, 1, n.x); const k = 0.8 + 0.2 * smooth(-1, 1, n.z * s); q.y *= k; } }), PAINT, { parent: g, pos: [-0.012, 0.06, s * 0.22], name: 'housing' });
          mesh(G.soft(0.004, 0.115, 0.19, { r: 0.0019, seg: 2, deform: (q, n) => { q.y *= 0.84 + 0.16 * smooth(-1, 1, n.z * s); } }), M.reflector(), { parent: g, pos: [-0.064, 0.06, s * 0.228], name: 'mirror glass' });
          mesh(G.box(0.012, 0.008, 0.12, 0.003), L.turn, { parent: g, pos: [0.05, 0.003, s * 0.27], name: 'turn repeater' });
          mesh(G.box(0.012, 0.012, 0.035, 0.004), s > 0 ? L.red : L.blue, { parent: g, pos: [0.047, 0.11, s * 0.3], name: 'strobe' });
          mesh(G.box(0.03, 0.004, 0.03), L.plate, { parent: g, pos: [0.0, -0.018, s * 0.25], name: 'puddle lamp' });
        }
      }
    }

    // ================================================================== INTERIOR (2-3-2)
    {
      const it = sys('interior');
      const F = CABIN_FLOOR;
      const NAVY = 0x121722, BLACK = 0x0f1013, THREAD = '#9c8a62';
      const PART_X = -0.21;   // armoured partition (centre line)
      // rear face of the dashboard: x as a function of height (follows the dash profile below)
      const dp = [[0.985, 1.262], [0.88, 1.258], [0.81, 1.246], [0.772, 1.215], [0.756, 1.16], [0.755, 1.07], [0.775, 0.975], [0.825, 0.885], [0.9, 0.82], [0.985, 0.8]];
      const faceX = (y) => { for (let i = 3; i < 8; i++) { const [x0, y0] = dp[i], [x1, y1] = dp[i + 1]; if (y <= y0 && y >= y1) return lerp(x0, x1, (y0 - y) / (y0 - y1)); } return 0.76; };
      const faceN = (y) => { const d = 0.01, a = faceX(y + d), b = faceX(y - d); return V3(-2 * d, a - b, 0).normalize(); }; // into the cabin
      const faceUp = (y) => { const n = faceN(y); return V3(-n.y, n.x, 0).multiplyScalar(-1); };
      const strap = (parent, a, b, w = 0.045, mat = M.fabric(0x1a1a1d)) => {
        const A = V3(...a), B = V3(...b), d = B.clone().sub(A);
        const m = mesh(G.box(w, d.length(), 0.004), mat, { parent, name: 'belt webbing' });
        m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
        return m;
      };
      const coil = (parent, a, b, turns = 14, r = 0.008) => {
        const A = V3(...a), B = V3(...b), axis = B.clone().sub(A), n = axis.clone().normalize();
        const u = V3(0, 1, 0).cross(n); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize(); const v = n.clone().cross(u);
        const pts = []; for (let i = 0; i <= turns * 12; i++) { const t = i / (turns * 12), a2 = t * turns * Math.PI * 2; pts.push(A.clone().addScaledVector(axis, t).addScaledVector(u, Math.cos(a2) * r).addScaledVector(v, Math.sin(a2) * r)); }
        return mesh(G.tube(pts, 0.0018, turns * 24, 5), M.plastic(0x0b0b0c), { parent, name: 'coiled cord' });
      };

      // ---- sculpted seats: bolsters, lumbar, sagging centre, quilted panels, switches
      const cushionDeform = (o) => (p, n) => {
        const top = smooth(-0.3, 0.7, n.y), side = smooth(0.5, 0.93, Math.abs(n.z));
        p.y += top * (side * (o.bolster ?? 0.04) * (1 - 0.45 * smooth(0.2, 1, n.x)) - 0.012 * (1 - side) * (1 - n.x * n.x) - 0.018 * smooth(0.6, 1, n.x) + 0.012 * n.x);
        p.z *= 1 - 0.05 * smooth(0, 1, -n.x);
      };
      const backDeform = (o) => (p, n) => {
        const front = smooth(-0.3, 0.7, n.x), side = smooth(0.5, 0.93, Math.abs(n.z));
        p.x += front * (side * (o.bolster ?? 0.045) * (1 - 0.5 * smooth(0.55, 1, n.y)) + 0.02 * Math.exp(-Math.pow((n.y + 0.45) / 0.32, 2)) * (1 - side) - 0.006 * (1 - side));
        p.x -= (1 - front) * 0.012 * (1 - n.z * n.z) * (1 - n.y * n.y);
        p.x += 0.018 * Math.pow(smooth(0.4, 1, n.y), 2);
        p.z *= 1 - 0.1 * smooth(0.3, 1, n.y);
      };
      const headDeform = (p, n) => { const front = smooth(-0.3, 0.7, n.x); p.x += front * 0.012 * (1 - n.y * n.y) * (1 - n.z * n.z) + 0.022 * n.z * n.z; };
      // local frame: +x = the way the occupant faces, z = across the seat
      const seat = (o) => {
        const p = part(it, o.info, { pos: [o.x, F, o.z], rot: [0, o.face > 0 ? 0 : Math.PI, 0] });
        const ch = o.h - F, bt = o.bt ?? 0.12, ct = o.ct ?? 0.13;
        const lth = M.leather(o.color);
        const only = (i, m) => [0, 1, 2, 3, 4, 5].map((k) => (k === i ? m : lth));
        mesh(G.box(o.d * 0.72, ch - ct, o.w * 0.72, 0.015), M.darkSteel(), { parent: p, pos: [0, (ch - ct) / 2, 0], name: 'seat frame' });
        for (const dz of [-1, 1]) {
          mesh(G.box(o.d, 0.016, 0.034, 0.004), M.steel(), { parent: p, pos: [0, 0.008, dz * o.w * 0.32], name: 'seat track' });
          for (const dx of [-1, 1]) mesh(G.bolt(0.006), M.steel(), { parent: p, pos: [dx * o.d * 0.45, 0.016, dz * o.w * 0.32], name: 'track bolt' });
        }
        mesh(G.cyl(0.028, 0.028, 0.09, 16, 'z'), M.darkSteel(), { parent: p, pos: [-o.d * 0.15, (ch - ct) * 0.45, 0], name: 'power-seat motor' });
        mesh(G.soft(o.d, ct, o.w, { r: 0.04, seg: 6, deform: cushionDeform(o) }), only(2, M.quilted(o.color, 'u', THREAD, o.pleats ?? 6)), { parent: p, pos: [0, ch - ct / 2, 0], name: 'cushion' });
        // outboard trim shield with the power-seat switches
        if (o.side) {
          mesh(G.soft(o.d * 0.86, ch - 0.06, 0.024, { r: 0.008, seg: 3 }), M.plastic(0x16171b, 0.5), { parent: p, pos: [0, (ch - 0.06) / 2 + 0.035, o.side * (o.w / 2 + 0.004)], name: 'side shield' });
          K.panel(p, { name: 'seat switches', pos: [0.0, ch - 0.075, o.side * (o.w / 2 + 0.017)], normal: [0, 0, o.side], w: 0.17, h: 0.06, plate: false, buttons: [
            { x: 0.03 * o.side, y: -0.008, w: 0.075, h: 0.016, d: 0.008, color: 0x1c1d21 },
            { x: -0.035 * o.side, y: 0.004, w: 0.014, h: 0.044, d: 0.008, color: 0x1c1d21 },
            { x: -0.064 * o.side, y: -0.004, w: 0.022, kind: 'round', d: 0.007, color: 0x1c1d21 },
            ...['1', '2', 'M'].map((l, i) => ({ x: (0.0 + i * 0.017) * o.side, y: 0.019, w: 0.013, h: 0.01, d: 0.003, label: l, color: 0x232428 })),
          ] });
        }
        const bk = new THREE.Group(); bk.position.set(-o.d / 2 + 0.04, ch - 0.04, 0); bk.rotation.z = o.lean; p.add(bk);
        mesh(G.soft(bt, o.back, o.w, { r: Math.min(0.04, bt * 0.45), seg: 6, deform: backDeform(o) }), only(0, M.quilted(o.color, 'v', THREAD, o.pleats ? o.pleats + 1 : 7)), { parent: bk, pos: [0.025 - bt / 2, o.back / 2, 0], name: 'backrest' });
        if (o.head !== false) {
          mesh(G.soft(0.09, 0.17, o.w * 0.56, { r: 0.035, seg: 5, deform: headDeform }), only(0, M.quilted(o.color, 'v', THREAD, 3)), { parent: bk, pos: [-0.03, o.back + 0.12, 0], name: 'headrest' });
          for (const sg of [-1, 1]) {
            mesh(G.cyl(0.0055, 0.0055, 0.07, 8, 'y'), M.chrome(), { parent: bk, pos: [-0.035, o.back + 0.03, sg * o.w * 0.14], name: 'headrest post' });
            mesh(G.cyl(0.01, 0.01, 0.012, 14, 'y'), M.plastic(0x111111), { parent: bk, pos: [-0.035, o.back + 0.004, sg * o.w * 0.14], name: 'post collar' });
          }
          mesh(G.box(0.008, 0.006, 0.01, 0.002), M.chrome(), { parent: bk, pos: [-0.035, o.back + 0.012, o.w * 0.14 + 0.012], name: 'headrest release' });
        }
        if (o.arm) for (const sg of o.arm) {
          mesh(G.soft(o.d * 0.72, 0.06, 0.085, { r: 0.025, seg: 4, deform: (q, n) => { q.y += 0.008 * (1 - n.x * n.x) * smooth(0, 1, n.y); } }), lth, { parent: p, pos: [-0.05, ch + 0.11, sg * (o.w / 2 + 0.035)], name: 'armrest' });
          mesh(G.soft(o.d * 0.5, 0.13, 0.06, { r: 0.015, seg: 3 }), lth, { parent: p, pos: [-0.07, ch + 0.03, sg * (o.w / 2 + 0.035)], name: 'armrest support' });
        }
        const bz = (o.buckle || 1) * (o.w / 2 + 0.03);
        mesh(G.soft(0.035, 0.028, 0.05, { r: 0.008, seg: 3 }), M.gloss(0x111111), { parent: p, pos: [-o.d / 2 + 0.06, ch + 0.02, bz], name: 'belt buckle' });
        mesh(G.box(0.012, 0.006, 0.02, 0.002), M.plastic(0xb3121b), { parent: p, pos: [-o.d / 2 + 0.06, ch + 0.035, bz], name: 'release button' });
        p.userData.bk = bk;
        return p;
      };

      // ---- floor, tunnel, mats, wheelhouses
      const floorP = part(it, { he: 'רצפה ושטיחים', en: 'Carpeted floor', mat: 'שטיח צמר סמיך', desc: 'שטיח עבה מעל לוח השריון של הרצפה, עם מנהרה לתיבת ההילוכים ושני שטיחונים רקומים בתא הנשיא.' });
      mesh(G.box(2.66, 0.012, 1.9, 0.004), M.carpet(NAVY), { parent: floorP, pos: [-0.35, F - 0.006, 0] });
      mesh(G.soft(0.95, 0.12, 0.3, { r: 0.05, seg: 4 }), M.carpet(NAVY), { parent: floorP, pos: [0.5, F + 0.05, 0], name: 'transmission tunnel' });
      const sealT = sealTexture(K);
      for (const s of [1, -1]) {
        mesh(G.soft(0.42, 0.01, 0.5, { r: 0.004, seg: 2 }), M.carpet(0x0c1018), { parent: floorP, pos: [-0.74, F + 0.005, s * 0.4], name: 'floor mat' });
        mesh(new THREE.CircleGeometry(0.08, 40), M.decal(sealT, { clearcoat: 0, roughness: 0.9 }), { parent: floorP, pos: [-0.74, F + 0.0105, s * 0.4], rot: [-Math.PI / 2, 0, -Math.PI / 2], cast: false, name: 'embroidered seal' });
      }
      const wh = part(it, { he: 'כיסויי בתי גלגלים אחוריים', en: 'Rear wheelhouse trims', mat: 'שטיח על פלדה', desc: 'הגלגלים האחוריים נכנסים לתוך תא הנשיא; הקשתות מכוסות בשטיח, משני צידי המושבים.' });
      const whShape = new THREE.Shape(); const R2 = ARCH_R + 0.035;
      whShape.moveTo(BACK + 0.02, F); whShape.lineTo(AXR + R2, F);
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; const x = AXR + Math.cos(a) * R2, y = FLOOR + Math.sin(a) * R2; if (x >= BACK + 0.02 && y >= F) whShape.lineTo(x, y); }
      whShape.lineTo(BACK + 0.02, FLOOR + Math.sqrt(R2 * R2 - Math.pow(BACK + 0.02 - AXR, 2)));
      for (const s of [1, -1]) { const g = G.extrude(whShape, 0.34, { bevel: 0.02 }); g.translate(0, 0, s * 0.8); mesh(g, M.carpet(NAVY), { parent: wh, name: 'wheelhouse hump' }); }

      // ---- seats: 2 front, 3 rear-facing jump seats, 2 executive seats
      for (const s of [1, -1]) seat({ x: 0.25, z: s * 0.42, face: 1, w: 0.52, d: 0.46, h: 0.99, back: 0.6, lean: 0.14, color: BLACK, side: s, buckle: -s, info: { he: s < 0 ? 'מושב הנהג' : 'מושב המפקד', en: s < 0 ? 'Driver seat' : 'Detail-leader seat', mat: 'עור מקופל עם תפרים כפולים, קצף, מסגרת פלדה', desc: s < 0 ? 'הנהג הוא סוכן שירות חשאי שעבר הכשרה בנהיגת התחמקות — כולל סיבוב של 180° בנסיעה לאחור. מושב חשמלי עם זיכרון לשלושה נהגים.' : 'כאן יושב ראש צוות האבטחה, עם מכשירי הקשר ולוח המתגים של מערכות ההגנה. הוא מחליט לאן ומתי לברוח.' } });
      for (const [i, z] of [[0, -0.52], [1, 0], [2, 0.52]]) seat({ x: -0.455, z, face: -1, w: 0.46, d: 0.3, h: 0.95, back: 0.44, lean: 0.08, bt: 0.07, ct: 0.1, bolster: 0.02, pleats: 4, color: NAVY, head: false, side: z === 0 ? 0 : -Math.sign(z), info: { he: `מושב מתקפל ${i + 1} (פונה לאחור)`, en: 'Rear-facing jump seat', mat: 'עור כחול כהה', desc: 'שלושה מושבים צמודים למחיצה ופונים לנשיא — לעוזרים, לרופא או לאורחים. הם דקים כדי להשאיר מקום לרגליים.' } });
      const pres = seat({ x: -1.12, z: 0.385, face: 1, w: 0.54, d: 0.5, h: 0.98, back: 0.56, lean: 0.17, color: NAVY, side: 1, buckle: -1, info: { he: 'מושב הנשיא', en: 'The President’s seat (rear right)', mat: 'עור כחול כהה מקופל, תפרים כפולים בצבע זהב', desc: 'הנשיא יושב תמיד מאחור מימין. המושב מתכוונן חשמלית, עם חימום, אוורור ועיסוי, וסמל הנשיאות רקום על משענת הראש.' } });
      seat({ x: -1.12, z: -0.385, face: 1, w: 0.54, d: 0.5, h: 0.98, back: 0.56, lean: 0.17, color: NAVY, side: -1, buckle: 1, info: { he: 'מושב אורח (אחורי שמאלי)', en: 'Guest seat (rear left)', mat: 'עור כחול כהה מקופל', desc: 'המושב לאורח המכובד — מנהיג זר, בן/בת זוג או ראש הסגל.' } });
      mesh(new THREE.CircleGeometry(0.042, 40), M.decal(sealT, { clearcoat: 0, roughness: 0.8 }), { parent: pres.userData.bk, pos: [0.022, 0.56 + 0.12, 0], rot: [0, Math.PI / 2, 0], cast: false, name: 'embroidered seal' });
      for (const s of [1, -1]) {
        const b = part(it, { he: `חגורת בטיחות קדמית ${s > 0 ? 'ימנית' : 'שמאלית'}`, en: 'Three-point belt', mat: 'פוליאסטר ארוג', desc: 'חגורת שלוש נקודות עם מותחן פירוטכני ומגביל עומס.' });
        strap(b, [0.0, 1.58, s * 0.8], [0.17, 1.02, s * 0.2]); strap(b, [0.17, 1.02, s * 0.2], [0.06, 0.98, s * 0.66]);
        mesh(G.soft(0.04, 0.065, 0.03, { r: 0.01, seg: 3 }), M.plastic(0x222222), { parent: b, pos: [0.0, 1.58, s * 0.8], name: 'D-ring' });
        mesh(G.soft(0.05, 0.03, 0.02, { r: 0.008, seg: 3 }), M.satin(), { parent: b, pos: [0.17, 1.02, s * 0.2], name: 'latch plate' });
      }

      // ---- dashboard
      const dash = part(it, { he: 'לוח מחוונים', en: 'Dashboard', mat: 'עור תפור, עץ אגוז, אלומיניום', desc: 'לוח מחוונים בסגנון אסקלייד, מותאם לשירות החשאי: מכשירי קשר מוצפנים, מסכי ניווט ומתגים למערכות ההגנה.' });
      mesh(G.extrude(G.shape(dp), 1.72, { bevel: 0.02, bevelOffset: -0.02, bevelSeg: 3 }), M.leather(BLACK), { parent: dash, name: 'dash body' });
      for (const [z0, z1] of [[-0.86, -0.66], [-0.2, -0.16], [0.16, 0.86]]) mesh(G.soft(0.012, 0.03, z1 - z0, { r: 0.005, seg: 2 }), M.wood(), { parent: dash, pos: [faceX(1.125) - 0.004, 1.125, (z0 + z1) / 2], name: 'walnut inlay' });
      for (const [z0, z1] of [[-0.86, -0.66], [0.16, 0.86]]) mesh(G.box(0.004, 0.003, z1 - z0), M.satin(), { parent: dash, pos: [faceX(1.105) - 0.004, 1.105, (z0 + z1) / 2], name: 'aluminium accent' });
      instances(G.box(0.0035, 0.0012, 0.0015), M.leather(0x9c8a62), Array.from({ length: 220 }, (_, i) => ({ pos: [0.79, 1.2365, -0.86 + i * 0.0078], rot: [0, 0, -0.62] })), { parent: dash, cast: false });
      for (const z of [-0.74, -0.12, 0.12, 0.74]) {
        const y = 1.198, x = faceX(y);
        mesh(G.soft(0.024, 0.05, 0.13, { r: 0.01, seg: 3 }), M.gloss(0x0c0c0d), { parent: dash, pos: [x - 0.004, y, z], name: 'air vent' });
        for (let i = 0; i < 4; i++) mesh(G.box(0.02, 0.0025, 0.118), M.satin(), { parent: dash, pos: [x - 0.012, y - 0.016 + i * 0.011, z], rot: [0, 0, 0.15], name: 'vent louvre' });
        mesh(G.box(0.01, 0.012, 0.012, 0.003), M.satin(), { parent: dash, pos: [x - 0.02, y, z], name: 'vent tab' });
      }
      const glove = part(dash, { he: 'תא כפפות', en: 'Glovebox', mat: 'עור', desc: 'בתא הכפפות: מפות, ערכת עזרה ראשונה וציוד קשר גיבוי.' });
      mesh(G.soft(0.014, 0.1, 0.36, { r: 0.006, seg: 2 }), M.leather(BLACK), { parent: glove, pos: [faceX(1.0) - 0.006, 1.0, 0.5] });
      mesh(G.soft(0.012, 0.014, 0.07, { r: 0.004, seg: 2 }), M.chrome(), { parent: glove, pos: [faceX(1.03) - 0.014, 1.03, 0.5], name: 'latch' });
      // instrument cluster under a stitched hood
      const cl = part(dash, { he: 'לוח שעונים דיגיטלי', en: 'Digital instrument cluster', mat: 'מסך TFT', desc: 'מד מהירות, מד סיבובים, טמפרטורת מנוע ולחץ אוויר בצמיגים — כולל התראה אם צמיג עבר למצב ראן־פלאט.' });
      const EYE = V3(0.2, 1.48, -0.42), SC = V3(0.771, 1.268, -0.42);
      mesh(G.soft(0.09, 0.15, 0.42, { r: 0.03, seg: 4, deform: (q, n) => { q.x -= 0.012 * smooth(0, 1, n.y) * (1 - n.z * n.z); } }), M.leather(BLACK), { parent: cl, pos: [0.83, 1.255, -0.42], name: 'binnacle' });
      mesh(G.soft(0.12, 0.03, 0.44, { r: 0.012, seg: 4, deform: (q, n) => { q.y += 0.008 * (1 - n.z * n.z); q.x -= 0.01 * n.z * n.z; } }), M.leather(BLACK), { parent: cl, pos: [0.79, 1.345, -0.42], name: 'cowl hood' });
      const bez = mesh(G.soft(0.36, 0.135, 0.012, { r: 0.008, seg: 2 }), M.gloss(0x080808), { parent: cl, pos: SC.clone().add(V3(0.007, -0.002, 0)).toArray(), name: 'bezel' }); bez.lookAt(EYE);
      const scr = mesh(new THREE.PlaneGeometry(0.34, 0.12), M.screen(clusterTexture(K), 1.1), { parent: cl, pos: SC.toArray(), cast: false, name: 'screen' }); scr.lookAt(EYE);
      // centre stack: secure-comms screen, climate panel, hazard
      const cs = part(dash, { he: 'מסך מרכזי ומערכת קשר', en: 'Centre stack — secure comms', mat: 'מסך מגע + כפתורים', desc: 'מסך שמחובר לרשתות הקשר המוצפנות של השירות החשאי ושל הבית הלבן, עם ניווט ותמונת מצב של השיירה.' });
      mesh(G.soft(0.014, 0.17, 0.29, { r: 0.008, seg: 2 }), M.gloss(0x0a0a0a), { parent: cs, pos: [faceX(1.09) - 0.004, 1.09, 0], name: 'bezel' });
      mesh(new THREE.PlaneGeometry(0.26, 0.15), M.screen(commsTexture(K), 1), { parent: cs, pos: [faceX(1.09) - 0.0115, 1.09, 0], rot: [0, -Math.PI / 2, 0], cast: false, name: 'screen' });
      const clim = part(dash, { he: 'לוח מיזוג אוויר', en: 'Climate control panel', mat: 'אלומיניום + פלסטיק מבריק', desc: 'שני כפתורי טמפרטורה מסתובבים (נהג ונוסע), מצב אוטומטי, מזגן, הפשרת שמשות ומחזור אוויר — האוויר עובר דרך מסנן NBC.' });
      { const y = 0.952, n = faceN(y); K.panel(clim, { pos: V3(faceX(y), y, 0).addScaledVector(n, 0.002).toArray(), normal: n.toArray(), up: faceUp(y).toArray(), w: 0.3, h: 0.072, plate: M.gloss(0x0d0d0f), buttons: [
        { kind: 'knob', x: -0.118, y: 0.004, w: 0.034, d: 0.016, label: 'TEMP', ticks: ['LO', '72', 'HI'] },
        { kind: 'knob', x: 0.118, y: 0.004, w: 0.034, d: 0.016, label: 'TEMP', ticks: ['LO', '72', 'HI'] },
        { x: -0.066, y: 0.015, w: 0.04, h: 0.022, label: 'AUTO', led: '#3dff8a' }, { x: -0.022, y: 0.015, w: 0.04, h: 0.022, label: 'A/C', led: '#3dff8a' },
        { x: 0.022, y: 0.015, w: 0.04, h: 0.022, label: 'MAX' }, { x: 0.066, y: 0.015, w: 0.04, h: 0.022, label: 'RECIRC', led: '#ffb43a' },
        { x: -0.066, y: -0.014, w: 0.04, h: 0.022, label: 'FAN −' }, { x: -0.022, y: -0.014, w: 0.04, h: 0.022, label: 'FAN +' },
        { x: 0.022, y: -0.014, w: 0.04, h: 0.022, label: 'DEF' }, { x: 0.066, y: -0.014, w: 0.04, h: 0.022, label: 'REAR' },
      ] }); }
      { const y = 1.2, n = faceN(y); K.panel(clim, { name: 'hazard', pos: V3(faceX(y), y, 0).addScaledVector(n, 0.002).toArray(), normal: n.toArray(), up: faceUp(y).toArray(), w: 0.05, h: 0.022, plate: M.gloss(0x0d0d0f), buttons: [{ x: 0, y: 0, w: 0.036, h: 0.016, label: '▲', color: 0x9b0f14, ink: '#fff' }] }); }
      const lightsP = part(dash, { he: 'מתג אורות וערפל', en: 'Lighting switch', mat: 'אלומיניום', desc: 'בורר האורות של הנהג: כבוי, אוטומטי, אורות חניה ואורות דרך, ולחצני ערפל ותאורת לוח.' });
      K.panel(lightsP, { pos: [faceX(1.07) - 0.002, 1.07, -0.75], normal: [-1, 0, 0], w: 0.1, h: 0.07, plate: M.gloss(0x0d0d0f), buttons: [
        { kind: 'knob', x: -0.018, y: 0.002, w: 0.03, d: 0.014, label: 'LIGHTS', ticks: ['OFF', 'AUTO', 'PARK', 'ON'] },
        { x: 0.03, y: 0.016, w: 0.028, h: 0.016, label: 'FOG', led: '#3dff8a' }, { x: 0.03, y: -0.006, w: 0.028, h: 0.016, label: 'DIM' }, { x: 0.03, y: -0.026, w: 0.028, h: 0.012, label: 'HUD' },
      ] });
      const start = part(dash, { he: 'כפתור התנעה', en: 'Engine start/stop button', mat: 'אלומיניום + LED', desc: 'כפתור התנעה בלחיצה. המנוע מניע רק כשהמפתח המוצפן של הנהג נמצא ברכב.' });
      { const y = 1.03, n = faceN(y); K.panel(start, { pos: V3(faceX(y), y, -0.19).addScaledVector(n, 0.002).toArray(), normal: n.toArray(), up: faceUp(y).toArray(), w: 0.04, h: 0.04, plate: M.satin(), depth: 0.003, buttons: [{ kind: 'round', x: 0, y: 0, w: 0.03, d: 0.006, label: 'START', color: 0x101010, led: '#ff3b2f' }] }); }

      // ---- steering wheel & column
      const sw = part(it, { he: 'הגה', en: 'Steering wheel & column', mat: 'עור, עץ, אלומיניום', desc: 'הגה עור עם קטע עץ עליון וסמל קדילק. על הזרועות: כפתורי שמע, קשר ובקרת שיוט.' });
      const WC = V3(0.6, 1.2, -0.42), TILT = 0.45, nD = V3(-Math.cos(TILT), Math.sin(TILT), 0); // nD: wheel normal, towards the driver
      const colA = WC.clone().addScaledVector(nD, -0.05), colB = WC.clone().addScaledVector(nD, -0.26);
      mesh(G.tube([colA, colB], 0.034, 4, 16), M.plastic(0x101010, 0.45), { parent: sw, name: 'column shroud' });
      mesh(G.tube([WC.clone().addScaledVector(nD, -0.02), colA], 0.022, 2, 12), M.darkSteel(), { parent: sw, name: 'steering shaft' });
      for (const sg of [-1, 1]) {
        const base = WC.clone().addScaledVector(nD, -0.09).add(V3(0, 0, sg * 0.03));
        mesh(G.tube([base, base.clone().add(V3(-0.02, -0.01, sg * 0.1)), base.clone().add(V3(-0.03, -0.02, sg * 0.15))], 0.0055, 8, 8), M.plastic(0x111111), { parent: sw, name: sg < 0 ? 'turn-signal stalk' : 'wiper stalk' });
        mesh(G.sphere(0.009, 12, 8), M.plastic(0x1a1a1a), { parent: sw, pos: base.clone().add(V3(-0.03, -0.02, sg * 0.15)).toArray(), name: 'stalk tip' });
      }
      const wg = new THREE.Group(); wg.position.copy(WC); wg.rotation.z = -TILT; sw.add(wg);
      mesh(G.torus(0.185, 0.017, 14, 72, Math.PI * 1.35, 'x'), M.leather(BLACK), { parent: wg, rot: [Math.PI * 0.825, 0, 0], name: 'rim (leather)' });
      mesh(G.torus(0.185, 0.0175, 14, 36, Math.PI * 0.65, 'x'), M.wood(), { parent: wg, rot: [Math.PI * 0.175, 0, 0], name: 'rim (wood)' });
      for (const a of [Math.PI * 0.175, Math.PI * 0.825]) mesh(G.torus(0.185, 0.0182, 10, 6, 0.012, 'x'), M.satin(), { parent: wg, rot: [a, 0, 0], name: 'wood/leather joint ring' });
      for (const sg of [-1, 1]) mesh(G.soft(0.026, 0.06, 0.13, { r: 0.012, seg: 4, deform: (q, n) => { q.y -= 0.012 * n.z * n.z * sg * sg; } }), M.satin(), { parent: wg, pos: [0.006, -0.01, sg * 0.112], name: 'side spoke' });
      mesh(G.soft(0.024, 0.12, 0.05, { r: 0.012, seg: 4, deform: (q, n) => { q.z *= 1 - 0.3 * smooth(-1, 1, -n.y); } }), M.satin(), { parent: wg, pos: [0.006, -0.11, 0], name: 'lower spoke' });
      mesh(G.soft(0.05, 0.115, 0.135, { r: 0.022, seg: 5, deform: (q, n) => { q.x -= smooth(-0.3, 0.7, -n.x) * 0.012 * (1 - n.y * n.y) * (1 - n.z * n.z); } }), M.leather(BLACK), { parent: wg, pos: [0.004, 0, 0], name: 'airbag cover' });
      mesh(new THREE.CircleGeometry(0.024, 32), M.decal(crestTexture(K)), { parent: wg, pos: [-0.0345, 0.006, 0], rot: [0, -Math.PI / 2, 0], cast: false, name: 'crest' });
      for (const sg of [-1, 1]) K.panel(wg, { name: sg < 0 ? 'audio & phone buttons' : 'cruise buttons', pos: [-0.0075, -0.008, sg * 0.118], normal: [-1, 0, 0], w: 0.075, h: 0.042, plate: false, buttons: (sg < 0
        ? [['VOL+', 0.011, -0.016], ['VOL−', -0.011, -0.016], ['MUTE', 0.011, 0.016], ['MIC', -0.011, 0.016]]
        : [['SET', 0.011, -0.016], ['RES', -0.011, -0.016], ['ON', 0.011, 0.016], ['CAN', -0.011, 0.016]]).map(([l, y, x]) => ({ x, y, w: 0.026, h: 0.017, d: 0.004, label: l, color: 0x161617 })) });
      // pedals
      const ped = part(it, { he: 'דוושות', en: 'Pedals', mat: 'אלומיניום + גומי', desc: 'דוושת בלם רחבה ודוושת גז. ברכב של 9 טון, הבלם מכויל לבלימת חירום חזקה במיוחד.' });
      for (const [z, w, he] of [[-0.48, 0.09, 'brake'], [-0.33, 0.05, 'accelerator']]) {
        mesh(G.soft(0.02, 0.09, w, { r: 0.008, seg: 3 }), M.satin(), { parent: ped, pos: [0.88, 0.8, z], rot: [0, 0, 0.5], name: he + ' pedal' });
        for (let i = 0; i < 4; i++) mesh(G.box(0.004, 0.006, w * 0.8), M.rubber(), { parent: ped, pos: [0.875 - i * 0.008 * 0.48, 0.775 + i * 0.016, z], rot: [0, 0, 0.5], name: 'rubber rib' });
        mesh(G.box(0.02, 0.2, 0.015, 0.004), M.darkSteel(), { parent: ped, pos: [0.92, 0.91, z], name: he + ' arm' });
      }
      mesh(G.soft(0.02, 0.1, 0.08, { r: 0.008, seg: 3 }), M.satin(), { parent: ped, pos: [0.88, 0.8, -0.66], rot: [0, 0, 0.5], name: 'footrest' });

      // ---- front console: gear selector, Secret Service switch panel, handsets
      const fc = part(it, { he: 'קונסולה קדמית ומכשירי קשר', en: 'Front console & radio handsets', mat: 'עור, עץ, פלסטיק', desc: 'בין הנהג למפקד: בורר הילוכים, לוח מתגי ההגנה ושתי שפופרות קשר מוצפן על כבלים מסולסלים — קשר ישיר לשאר רכבי השיירה.' });
      mesh(G.soft(0.68, 0.23, 0.26, { r: 0.04, seg: 4, deform: (q, n) => { q.y += 0.01 * (1 - n.z * n.z) * smooth(0, 1, n.y); } }), M.leather(BLACK), { parent: fc, pos: [0.36, F + 0.115, 0], name: 'console body' });
      mesh(G.soft(0.64, 0.01, 0.2, { r: 0.004, seg: 2 }), M.wood(), { parent: fc, pos: [0.36, F + 0.236, 0], name: 'walnut top' });
      const gear = part(fc, { he: 'בורר הילוכים', en: 'Gear selector', mat: 'עור + כרום', desc: 'ידית ההילוכים של תיבת אליסון בעלת 6 ההילוכים, עם לחצן נעילה ונוריות P‑R‑N‑D.' });
      mesh(G.lathe([[0.03, 0], [0.024, 0.02], [0.012, 0.035]], 24, 'y'), M.rubber(), { parent: gear, pos: [0.64, F + 0.241, 0], name: 'boot' });
      mesh(G.merge([G.at(G.cyl(0.008, 0.009, 0.06, 12, 'y'), [0, 0.03, 0]), G.at(G.soft(0.05, 0.05, 0.04, { r: 0.018, seg: 4, deform: (q, n) => { q.x += 0.006 * n.y; } }), [0, 0.07, 0])]), M.leather(BLACK), { parent: gear, pos: [0.64, F + 0.25, 0], name: 'shift knob' });
      mesh(G.box(0.006, 0.014, 0.02, 0.002), M.chrome(), { parent: gear, pos: [0.618, F + 0.33, 0], name: 'lock button' });
      K.panel(gear, { pos: [0.585, F + 0.2415, 0], normal: [0, 1, 0], up: [1, 0, 0], w: 0.05, h: 0.03, plate: false, buttons: ['P', 'R', 'N', 'D'].map((l, i) => ({ x: -0.018 + i * 0.012, y: 0, w: 0.01, h: 0.012, d: 0.0015, label: l, color: 0x0d0d0d, ink: l === 'D' ? '#3dff8a' : '#9aa' })) });
      const ss = part(fc, { he: 'לוח מתגי ההגנה של השירות החשאי', en: 'Secret Service defensive-systems switch panel', mat: 'אלומיניום אנודייז + מכסי בטיחות', desc: 'שמונה מתגים, כל אחד מתחת למכסה אדום קפיצי כדי שלא יופעלו בטעות: סירנה, אורות מהבהבים, כריזה, גז מדמיע, מסך עשן, כתם שמן, חמצן וכיבוי אש.' });
      K.panel(ss, { pos: [0.47, F + 0.2425, 0], normal: [0, 1, 0], up: [1, 0, 0], w: 0.2, h: 0.17, plate: M.metal(0x2a2d31, 0.4), depth: 0.004, buttons: [
        ...['SIREN', 'STROBE', 'PA', 'TEAR GAS'].map((l, i) => ({ kind: 'toggle', x: -0.072 + i * 0.048, y: 0.04, label: l })),
        ...['SMOKE', 'OIL', 'O₂', 'FIRE'].map((l, i) => ({ kind: 'toggle', x: -0.072 + i * 0.048, y: -0.035, label: l, cover: i >= 2 ? 0xd9a400 : 0xc8102e })),
      ] });
      for (const dz of [-0.06, 0.06]) { mesh(G.cyl(0.033, 0.033, 0.001, 32, 'y'), M.black(), { parent: fc, pos: [0.32, F + 0.2418, dz], cast: false, name: 'cup holder well' }); mesh(G.torus(0.034, 0.0022, 6, 32, Math.PI * 2, 'y'), M.satin(), { parent: fc, pos: [0.32, F + 0.2425, dz], name: 'cup holder ring' }); }
      for (const dz of [-0.075, 0.075]) {
        mesh(G.soft(0.2, 0.038, 0.05, { r: 0.016, seg: 4, deform: (q, n) => { q.y += 0.008 * (1 - n.x * n.x); } }), M.plastic(0x0d0d0e), { parent: fc, pos: [0.17, F + 0.262, dz], name: 'radio handset' });
        mesh(G.box(0.03, 0.005, 0.03, 0.002), M.satin(), { parent: fc, pos: [0.14, F + 0.285, dz], name: 'push-to-talk' });
        instances(G.cyl(0.0014, 0.0014, 0.002, 6, 'y'), M.black(), Array.from({ length: 12 }, (_, i) => ({ pos: [0.235 + (i % 3) * 0.006, F + 0.283, dz - 0.009 + Math.floor(i / 3) * 0.006] })), { parent: fc, cast: false });
        coil(fc, [0.07, F + 0.26, dz], [0.03, F + 0.17, dz * 1.2]);
      }
      const visor = part(it, { he: 'מגני שמש', en: 'Sun visors', mat: 'אלקנטרה', desc: 'מגני שמש עם מראת איפור מוארת.' });
      for (const s of [1, -1]) {
        mesh(G.soft(0.15, 0.022, 0.34, { r: 0.009, seg: 3 }), M.fabric(0x1d2028), { parent: visor, pos: [0.4, 1.706, s * 0.42], rot: [0, 0, -0.3], name: 'visor' });
        mesh(G.box(0.08, 0.002, 0.12, 0.001), M.plastic(0x15161a), { parent: visor, pos: [0.4, 1.694, s * 0.42], rot: [0, 0, -0.3], name: 'vanity mirror cover' });
      }

      // ---- partition
      const part1 = part(it, { he: 'מחיצה משוריינת עם חלון', en: 'Armoured partition with privacy glass', mat: 'פלדה, עור, זכוכית שריון', desc: 'מפרידה בין תא הנהג לתא הנשיא. החלון שבה עשוי זכוכית שריון ונפתח ונסגר חשמלית; אפשר לדבר דרך האינטרקום.' });
      mesh(G.soft(0.08, BELT - F, 1.8, { r: 0.02, seg: 3 }), [M.leather(NAVY), M.quilted(NAVY, 'v', THREAD, 8), M.leather(NAVY), M.leather(NAVY), M.leather(NAVY), M.leather(NAVY)], { parent: part1, pos: [PART_X, (BELT + F) / 2, 0], name: 'lower bulkhead' });
      const glassShape = G.shape([[-0.88, BELT], [0.88, BELT], [0.77, 1.71], [-0.77, 1.71]]);
      const gwin = G.extrude(glassShape, 0.035); gwin.rotateY(Math.PI / 2);
      mesh(gwin.clone().translate(PART_X, 0, 0), M.glass(0x0a0f12, 0.55), { parent: part1, name: 'privacy glass', cast: false });
      const pfr = G.shape([[-0.9, BELT - 0.01], [0.9, BELT - 0.01], [0.79, 1.73], [-0.79, 1.73]], [[[-0.86, BELT + 0.03], [0.86, BELT + 0.03], [0.755, 1.69], [-0.755, 1.69]]]);
      const pfg = G.extrude(pfr, 0.06); pfg.rotateY(Math.PI / 2); pfg.translate(PART_X, 0, 0);
      mesh(pfg, M.gloss(0x0b0b0c), { parent: part1, name: 'glass frame' });

      // ---- presidential console: buttons, panic button, sat-phone, desk
      const rc = part(it, { he: 'קונסולת הנשיא', en: 'Presidential centre console', mat: 'עץ אגוז, עור, אלומיניום', desc: 'בין שני המושבים האחוריים: לוח כפתורים, כפתור מצוקה, טלפון לוויני, מחזיקי כוסות ושולחן עבודה מתקפל.' });
      mesh(G.soft(0.52, 0.29, 0.2, { r: 0.04, seg: 4 }), M.leather(NAVY), { parent: rc, pos: [-1.14, F + 0.145, 0] });
      mesh(G.soft(0.5, 0.012, 0.19, { r: 0.005, seg: 2 }), M.wood(), { parent: rc, pos: [-1.14, F + 0.296, 0], name: 'walnut lid' });
      const rcp = part(rc, { he: 'לוח הכפתורים של הנשיא', en: 'Rear control buttons', mat: 'אלומיניום מוברש', desc: 'מיזוג נפרד לתא האחורי, חימום ועיסוי במושבים, מחיצת פרטיות, אינטרקום לנהג, תאורה ושולחן.' });
      K.panel(rcp, { pos: [-0.945, F + 0.3025, 0], normal: [0, 1, 0], up: [1, 0, 0], w: 0.18, h: 0.09, plate: M.satin(), depth: 0.003, ink: '#20242a', buttons: [
        ...['TEMP −', 'TEMP +', 'FAN', 'LIGHT'].map((l, i) => ({ x: -0.066 + i * 0.044, y: 0.02, w: 0.04, h: 0.03, label: l, color: 0x15171b, ink: '#e3e7ee' })),
        ...['HEAT', 'MASSAGE', 'PRIVACY', 'DESK'].map((l, i) => ({ x: -0.066 + i * 0.044, y: -0.02, w: 0.04, h: 0.03, label: l, color: 0x15171b, ink: '#e3e7ee', led: i === 2 ? '#ffb43a' : null })),
      ] });
      const panic = part(rc, { he: 'כפתור מצוקה', en: 'Panic button', mat: 'פלסטיק אדום', desc: 'לחיצה אחת מודיעה לכל השיירה ולמרכז הפיקוד שיש מצב חירום.' });
      mesh(G.cyl(0.014, 0.016, 0.012, 20, 'y'), glow(0xd61a1a, 0.6), { parent: panic, pos: [-1.035, F + 0.308, 0.0] });
      mesh(G.cyl(0.021, 0.021, 0.005, 24, 'y'), M.chrome(), { parent: panic, pos: [-1.035, F + 0.302, 0.0], name: 'bezel' });
      const phone = part(rc, { he: 'טלפון לוויני מוצפן', en: 'Encrypted satellite phone', mat: 'פלסטיק מחוזק', desc: 'קו מאובטח שמחובר לבית הלבן, לפנטגון — ולפי הדיווחים גם לסגן הנשיא, בכל רגע ובכל מקום בעולם.' });
      mesh(G.soft(0.21, 0.035, 0.055, { r: 0.015, seg: 4, deform: (q, n) => { q.y += 0.007 * (1 - n.x * n.x); } }), M.plastic(0x101112), { parent: phone, pos: [-1.2, F + 0.32, 0] });
      mesh(G.box(0.07, 0.003, 0.034, 0.001), M.screen(K.textTexture('SECURE', { font: '700 60px Arial', color: '#7dffb0', bg: '#04140a' }).tex, 0.8), { parent: phone, pos: [-1.17, F + 0.342, 0], name: 'display' });
      instances(G.cyl(0.0035, 0.0035, 0.002, 10, 'y'), M.gloss(0x2a2c30), Array.from({ length: 12 }, (_, i) => ({ pos: [-1.215 - Math.floor(i / 3) * 0.011, F + 0.341, -0.011 + (i % 3) * 0.011] })), { parent: phone, cast: false });
      coil(phone, [-1.31, F + 0.32, 0], [-1.37, F + 0.3, 0.08], 10);
      for (const dz of [-0.055, 0.055]) { mesh(G.cyl(0.031, 0.031, 0.001, 32, 'y'), M.black(), { parent: rc, pos: [-1.34, F + 0.3025, dz], cast: false, name: 'cup holder well' }); mesh(G.torus(0.032, 0.002, 6, 32, Math.PI * 2, 'y'), M.satin(), { parent: rc, pos: [-1.34, F + 0.303, dz], name: 'cup holder ring' }); }
      const desk = part(rc, { he: 'שולחן עבודה מתקפל', en: 'Fold-out desk', mat: 'עץ אגוז מצופה לכה', desc: 'שולחן עבודה שנפתח מהקונסולה — לחתימה על מסמכים בדרך.' });
      const deskPivot = new THREE.Group(); deskPivot.position.set(-0.9, F + 0.3, 0.1); desk.add(deskPivot);
      mesh(G.soft(0.32, 0.012, 0.22, { r: 0.005, seg: 2 }), M.wood(), { parent: deskPivot, pos: [-0.16, 0.0, -0.11], name: 'desk leaf' });
      K.toggle('desk', { he: 'שולחן', key: 'k', seconds: 0.9 }, (t) => { deskPivot.rotation.x = -t * Math.PI * 0.5; deskPivot.position.y = F + 0.3 + t * 0.12; });

      // ---- headliner, overhead consoles, cabin lighting
      const hl = part(it, { he: 'תקרה ותאורת תא', en: 'Headliner & cabin lighting', mat: 'זמש כחול כהה', desc: 'תקרה מרופדת עם מנורות קריאה, תאורת אווירה וידיות אחיזה. מעליה: לוח השריון של הגג.' });
      mesh(surface(gSec, samples(WS_TOP + 0.02, BL_TOP - 0.03, 0.05), samples(-0.66, 0.66, 0.04, [0]), { out: outG, offset: -0.04, thickness: 0.01 }), M.fabric(0x1b2030), { parent: hl, name: 'headliner' });
      const cabinLamp = glow(0xffe9c4, 0.05);
      for (const [x, z] of [[0.3, 0.35], [0.3, -0.35], [-1.05, 0.42], [-1.05, -0.42], [-0.6, 0]]) {
        mesh(G.cyl(0.03, 0.03, 0.008, 24, 'y'), cabinLamp, { parent: hl, pos: [x, ROOF - 0.055, z], name: 'reading lamp' });
        mesh(G.torus(0.032, 0.004, 6, 24, Math.PI * 2, 'y'), M.satin(), { parent: hl, pos: [x, ROOF - 0.055, z], name: 'lamp bezel' });
      }
      for (const s of [1, -1]) mesh(G.tube([[-0.4, 1.66, s * 0.76], [-0.45, 1.62, s * 0.78], [-0.7, 1.62, s * 0.78], [-0.75, 1.66, s * 0.76]], 0.01, 16, 8), M.plastic(0x1b2030), { parent: hl, name: 'grab handle' });
      const ohF = part(hl, { he: 'קונסולת תקרה קדמית', en: 'Front overhead console', mat: 'פלסטיק + LED', desc: 'מעל הנהג והמפקד: מנורות מפה, תאורת תקרה, כפתור SOS ושליטה במחיצה ובאינטרקום.' });
      mesh(G.soft(0.2, 0.03, 0.16, { r: 0.012, seg: 3 }), M.plastic(0x15171c, 0.5), { parent: ohF, pos: [0.3, ROOF - 0.06, 0] });
      K.panel(ohF, { pos: [0.3, ROOF - 0.076, 0], normal: [0, -1, 0], up: [1, 0, 0], w: 0.14, h: 0.17, plate: false, buttons: [
        ...['MAP', 'DOME', 'MAP'].map((l, i) => ({ x: -0.045 + i * 0.045, y: 0.05, w: 0.036, h: 0.022, label: l, color: 0x1c1e23 })),
        ...['INTERCOM', 'PARTITION'].map((l, i) => ({ x: -0.032 + i * 0.064, y: 0.0, w: 0.055, h: 0.022, label: l, color: 0x1c1e23 })),
        { x: 0, y: -0.05, w: 0.04, h: 0.026, label: 'SOS', color: 0x8b0d12, ink: '#fff' },
      ] });
      const ohR = part(hl, { he: 'קונסולת תקרה אחורית', en: 'Rear overhead console', mat: 'פלסטיק + LED', desc: 'מעל הנשיא: מנורות קריאה, אינטרקום לתא הנהג וכפתורי הרמה והורדה של חלון המחיצה.' });
      mesh(G.soft(0.22, 0.03, 0.18, { r: 0.012, seg: 3 }), M.plastic(0x15171c, 0.5), { parent: ohR, pos: [-0.95, ROOF - 0.06, 0] });
      K.panel(ohR, { pos: [-0.95, ROOF - 0.076, 0], normal: [0, -1, 0], up: [1, 0, 0], w: 0.16, h: 0.19, plate: false, buttons: [
        ...['READ L', 'READ R'].map((l, i) => ({ x: -0.035 + i * 0.07, y: 0.06, w: 0.055, h: 0.024, label: l, color: 0x1c1e23 })),
        ...['TALK', 'LISTEN'].map((l, i) => ({ x: -0.035 + i * 0.07, y: 0.02, w: 0.055, h: 0.024, label: l, color: 0x1c1e23, led: i === 1 ? '#3dff8a' : null })),
        ...['GLASS ▲', 'GLASS ▼'].map((l, i) => ({ x: -0.035 + i * 0.07, y: -0.025, w: 0.055, h: 0.024, label: l, color: 0x1c1e23 })),
        { x: 0, y: -0.065, w: 0.06, h: 0.022, label: 'AMBIENT', color: 0x1c1e23 },
      ] });
      const cp = part(hl, { he: 'חיפוי עמודי C', en: 'C-pillar trims', mat: 'זמש על פלסטיק', desc: 'חיפוי פנימי לעמודים האחוריים העבים. מאחוריו עוברים צינורות החמצן ומערכת הכיבוי אל התקרה.' });
      for (const s2 of [1, -1]) mesh(surface(gSec, samples(BACK + 0.02, RD[1] - 0.005, 0.04), samples(s2 * 0.62, s2 * 0.995, 0.03), { out: outG, offset: -0.05, thickness: 0.012 }), M.fabric(0x1b2030), { parent: cp, name: 'C-pillar trim' });
      const cabinLight = new THREE.PointLight(0xffe2b8, 0, 3.2, 1.6); cabinLight.position.set(-0.6, 1.55, 0); hl.add(cabinLight);
      K.toggle('cabin', { he: 'תאורת תא', key: 'i', seconds: 0.4, night: true }, (t) => { cabinLamp.emissiveIntensity = 0.05 + t * 3; cabinLight.intensity = t * 2.5; });
    }

    // ================================================================== ARMOUR (structure)
    {
      const ar = sys('armor');
      const fl = part(ar, { he: 'לוח שריון ברצפה', en: 'Blast-resistant floor plate', mat: 'פלדת שריון 12 מ״מ + שכבת קומפוזיט', desc: 'הגנה מפני מטען נפץ מתחת לרכב: לוח פלדה עבה שמונע מהדף ורסיסים לחדור לתא הנוסעים.' });
      mesh(G.box(2.64, 0.022, 1.9, 0.004), M.armorSteel(), { parent: fl, pos: [-0.35, CABIN_FLOOR - 0.025, 0] });
      mesh(G.box(2.6, 0.01, 1.86), M.kevlar(), { parent: fl, pos: [-0.35, CABIN_FLOOR - 0.04, 0], name: 'spall liner' });
      const rf = part(ar, { he: 'לוח שריון בגג', en: 'Roof armour plate', mat: 'פלדת שריון', desc: 'לוח שריון מלא מתחת לפח הגג — הגנה מפני רימונים וירי מזווית גבוהה.' });
      mesh(surface(gSec, samples(WS_TOP + 0.01, BL_TOP - 0.01, 0.05), samples(-0.7, 0.7, 0.035, [0]), { out: outG, offset: -0.012, thickness: 0.014 }), M.armorSteel(), { parent: rf });
      const fw = part(ar, { he: 'מחיצת אש משוריינת', en: 'Armoured firewall', mat: 'פלדת שריון + בידוד חום', desc: 'קיר משוריין בין תא המנוע לתא הנוסעים. עוצר גם אש וגם ירי מכיוון החזית.' });
      mesh(G.box(0.02, 0.56, 1.76, 0.005), M.armorSteel(), { parent: fw, pos: [1.0, 0.98, 0] });
      const bh = part(ar, { he: 'מחיצה אחורית משוריינת', en: 'Rear bulkhead armour', mat: 'פלדת שריון', desc: 'קיר שריון בין תא הנשיא לתא המטען.' });
      mesh(G.box(0.02, 0.52, 1.8, 0.005), M.armorSteel(), { parent: bh, pos: [BACK + 0.02, 0.99, 0] });
      const cage = part(ar, { he: 'כלוב שריון (עמודים וקשתות)', en: 'Pillar & roll-hoop reinforcement', mat: 'צינורות פלדה מוקשית', desc: 'צינורות פלדה בתוך העמודים והגג, שמחזיקים את משקל הזכוכית והשריון ומגנים במקרה של התהפכות.' });
      for (const s of [1, -1]) {
        const rail = samples(COWL - 0.02, BACK + 0.02, 0.08).map((x) => gSec(x, s * 0.7).addScaledVector(V3(0, -0.6, -s * 0.8).normalize(), 0.045));
        mesh(G.tube(rail, 0.022, 80, 10), M.armorSteel(), { parent: cage, name: 'roof rail tube' });
      }
      const hoop = samples(-1, 1, 0.08).map((v) => gSec(0.0, v).add(V3(0, -0.05, -Math.sign(v) * 0.04 * Math.abs(v))));
      mesh(G.tube([V3(0, CABIN_FLOOR, 0.9), ...hoop.reverse(), V3(0, CABIN_FLOOR, -0.9)], 0.025, 64, 10), M.armorSteel(), { parent: cage, name: 'B-pillar roll hoop' });
      const ep = part(ar, { he: 'לוח מגן תחתון למנוע', en: 'Engine-bay blast plate', mat: 'פלדת שריון', desc: 'לוח שריון מתחת למנוע ולתיבת ההילוכים, שמגן על מערכות ההנעה מפני מטען מתחת לרכב.' });
      mesh(G.box(1.4, 0.014, 1.15, 0.004), M.armorSteel(), { parent: ep, pos: [1.82, 0.418, 0] });
    }

    // ================================================================== SECURITY & LIFE SUPPORT
    {
      const sc = sys('security');
      const TF = 0.835; // trunk floor
      const trunkFloor = part(sc, { he: 'רצפת תא המטען', en: 'Trunk floor', mat: 'פלדה + שטיח', desc: 'תא המטען לא נועד למזוודות: הוא מלא במערכות הצלה ותקשורת.' });
      mesh(G.box(0.98, 0.015, 1.6, 0.004), M.carpet(0x111317), { parent: trunkFloor, pos: [-2.12, TF - 0.008, 0] });
      const ox = part(sc, { he: 'מערכת חמצן חירום', en: 'Emergency oxygen supply', mat: 'בלוני פלדה, וסת פליז', desc: 'שני בלוני חמצן שמספקים אוויר לתא האטום במקרה של מתקפה כימית או שריפה. הצינורות עוברים דרך המחיצה לתא הנשיא.' });
      for (const x of [-1.83, -2.03]) {
        mesh(G.cyl(0.085, 0.085, 0.66, 32, 'z'), M.paintFlat(0x2f7d3a, 0.45), { parent: ox, pos: [x, TF + 0.09, -0.05], name: 'O₂ cylinder' });
        mesh(G.sphere(0.085, 24, 12), M.paintFlat(0x2f7d3a, 0.45), { parent: ox, pos: [x, TF + 0.09, 0.28], scale: [1, 1, 0.5], name: 'cylinder shoulder' });
        mesh(G.merge([G.cyl(0.02, 0.02, 0.07, 16, 'z'), G.at(G.cyl(0.03, 0.03, 0.012, 6, 'z'), [0, 0, 0.02]), G.at(G.torus(0.025, 0.004, 6, 16, Math.PI * 2, 'y'), [0, 0.03, 0.04])]), M.brass(), { parent: ox, pos: [x, TF + 0.09, 0.36], name: 'valve' });
        for (const dz of [-0.25, 0.15]) mesh(G.box(0.2, 0.012, 0.03), M.darkSteel(), { parent: ox, pos: [x, TF + 0.18, dz], name: 'tie-down strap' });
      }
      mesh(G.box(0.08, 0.06, 0.06, 0.01), M.brass(), { parent: ox, pos: [-1.93, TF + 0.2, 0.42], name: 'regulator' });
      mesh(G.tube([V3(-1.93, TF + 0.23, 0.42), V3(-1.85, TF + 0.3, 0.6), V3(-1.74, 1.12, 0.82), ...[[-1.55, 0.93], [-1.4, 0.8], [-1.2, 0.62], [-0.95, 0.45]].map(([x, v]) => inG(x, v, 0.03))], 0.008, 64, 8), M.plastic(0x2f7d3a), { parent: ox, name: 'supply hose (inside the C-pillar trim)' });
      const fire = part(sc, { he: 'מערכת כיבוי אש', en: 'Fire-suppression system', mat: 'בלוני פלדה אדומים', desc: 'בלונים של חומר כיבוי שמחוברים בצנרת לתא הנוסעים, לתא המנוע ולמיכל הדלק — נפתחים אוטומטית תוך אלפיות שנייה.' });
      for (const z of [-0.3, 0.3]) {
        mesh(G.cyl(0.07, 0.07, 0.42, 28, 'z'), M.paintFlat(0xc0201f, 0.4), { parent: fire, pos: [-2.33, TF + 0.075, z * 0.9], name: 'agent bottle' });
        mesh(G.cyl(0.018, 0.018, 0.05, 12, 'y'), M.brass(), { parent: fire, pos: [-2.33, TF + 0.16, z * 0.9 + (z > 0 ? 0.15 : -0.15)], name: 'squib valve' });
      }
      mesh(G.tube([V3(-2.33, TF + 0.19, 0.42), V3(-2.1, TF + 0.3, 0.66), V3(-1.76, 1.1, 0.85), ...[[-1.58, 0.95], [-1.42, 0.82], [-1.2, 0.66], [-0.6, 0.6], [0.0, 0.58], [0.6, 0.52]].map(([x, v]) => inG(x, v, 0.032))], 0.007, 96, 8), M.paintFlat(0xc0201f, 0.4), { parent: fire, name: 'cabin pipe (above the headliner)' });
      mesh(G.tube([[-2.33, TF + 0.19, -0.42], [-2.0, 0.78, -0.75], [0.0, 0.62, -0.82], [1.1, 0.95, -0.7], [1.6, 1.1, -0.5]], 0.007, 80, 8), M.paintFlat(0xc0201f, 0.4), { parent: fire, name: 'engine-bay pipe' });
      for (const [x, z] of [[0.6, 0.0], [-0.2, 0.0], [-0.9, 0.0], [1.6, -0.5], [1.9, 0.3]]) mesh(G.merge([G.cyl(0.012, 0.012, 0.012, 12, 'y'), G.at(G.cyl(0.02, 0.02, 0.003, 16, 'y'), [0, -0.007, 0])]), M.chrome(), { parent: fire, pos: [x, x > 1 ? 1.16 : ROOF - 0.065, z], name: 'discharge nozzle' });
      const med = part(sc, { he: 'מקרר רפואי עם מנות דם', en: 'Medical fridge — blood supply', mat: 'אלומיניום מבודד', desc: 'מקרר בטמפרטורה קבועה עם מנות דם מסוג הדם של הנשיא, למקרה של פציעה בדרך לבית החולים.' });
      mesh(G.box(0.3, 0.3, 0.3, 0.02), M.paintFlat(0xeef0f2, 0.5), { parent: med, pos: [-2.38, TF + 0.15, -0.56] });
      const medTex = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#eef0f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(98, 40, 60, 160); g.fillRect(48, 90, 160, 60); g.fillStyle = '#222'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText('BLOOD SUPPLY · 4°C', w / 2, 232); });
      mesh(new THREE.PlaneGeometry(0.26, 0.26), M.decal(medTex, { clearcoat: 0 }), { parent: med, pos: [-2.38, TF + 0.15, -0.408], cast: false, name: 'label' });
      mesh(G.box(0.05, 0.02, 0.004), M.screen(K.textTexture('4.0°C', { font: '700 80px monospace', color: '#6cf', bg: '#012' }).tex, 1), { parent: med, pos: [-2.3, TF + 0.27, -0.408], name: 'thermometer display' });
      for (let i = 0; i < 4; i++) mesh(G.box(0.05, 0.1, 0.03, 0.01), new THREE.MeshPhysicalMaterial({ color: 0x8a0d16, roughness: 0.3, transmission: 0, transparent: true, opacity: 0.9 }), { parent: med, pos: [-2.46 + i * 0.055, TF + 0.12, -0.58], name: 'blood bag' });
      const comms = part(sc, { he: 'ארון תקשורת מוצפנת', en: 'Encrypted communications rack', mat: 'אלומיניום', desc: 'מכשירי קשר, משבש אותות (ג׳אמר) נגד מטעני חבלה מופעלים מרחוק, ומודם לווייני שמחברים את הרכב לבית הלבן.' });
      mesh(G.box(0.3, 0.28, 0.36, 0.01), M.metal(0x2d3138, 0.45), { parent: comms, pos: [-2.38, TF + 0.14, 0.52] });
      instances(G.box(0.004, 0.006, 0.006), glow(0x33ff77, 1.4), Array.from({ length: 18 }, (_, i) => ({ pos: [-2.228, TF + 0.06 + Math.floor(i / 6) * 0.06, 0.4 + (i % 6) * 0.045] })), { parent: comms, cast: false });
      instances(G.box(0.004, 0.006, 0.006), glow(0xff4433, 1.2), Array.from({ length: 4 }, (_, i) => ({ pos: [-2.228, TF + 0.24, 0.42 + i * 0.07] })), { parent: comms, cast: false });
      for (let i = 0; i < 3; i++) mesh(G.tube([[-2.38, TF + 0.28, 0.45 + i * 0.05], [-2.3, TF + 0.34, 0.45 + i * 0.05], [-2.25, 1.15, 0.3 + i * 0.1]], 0.004, 16, 5), M.plastic(0x111111), { parent: comms, name: 'antenna cable' });
      const nbc = part(sc, { he: 'מסנן אוויר נגד לוחמה כימית (NBC)', en: 'NBC air filtration unit', mat: 'פחם פעיל + HEPA', desc: 'מסנן שמנקה את האוויר מגזים כימיים, חומרים ביולוגיים ואבק רדיואקטיבי ושומר על לחץ־יתר בתא.' });
      mesh(G.cyl(0.11, 0.11, 0.3, 32, 'x'), M.paintFlat(0x4a5240, 0.6), { parent: nbc, pos: [-1.95, TF + 0.11, 0.62] });
      mesh(G.tube([[-1.8, TF + 0.11, 0.62], [-1.74, TF + 0.2, 0.7], [-1.7, 1.08, 0.75]], 0.035, 24, 12), M.plastic(0x222222), { parent: nbc, name: 'duct' });
      const slick = part(sc, { he: 'מיכל ומשאבה למסך עשן ולכתם שמן', en: 'Smoke-screen & oil-slick dispenser', mat: 'פלדה', desc: 'לפי הדיווחים, הרכב יכול לפלוט מסך עשן ושמן מאחור כדי לעכב רכבים רודפים. הנחירים בפגוש האחורי.' });
      mesh(G.box(0.2, 0.14, 0.22, 0.02), M.darkSteel(), { parent: slick, pos: [-2.5, TF + 0.07, -0.18] });
      for (const s of [1, -1]) mesh(G.tube([[-2.5, TF + 0.02, -0.18], [-2.62, 0.7, s * 0.3], [-2.73, 0.52, s * 0.3]], 0.006, 16, 6), M.steel(), { parent: slick, name: 'feed line' });
      // tear-gas launchers behind the front ports
      const tg = part(sc, { he: 'משגרי גז מדמיע', en: 'Tear-gas launchers', mat: 'צינורות פלדה', desc: 'שני מקבצים של שלושה משגרים מאחורי פתחים בפגוש הקדמי. משגרים רימוני גז מדמיע כדי לפזר המון שחוסם את הדרך.' });
      for (const s of [1, -1]) {
        for (let i = 0; i < 3; i++) mesh(G.cyl(0.016, 0.016, 0.24, 16, 'x'), M.darkSteel(), { parent: tg, pos: [2.665, 0.495, s * (0.15 + i * 0.045)], name: 'launch tube' });
        mesh(G.box(0.08, 0.06, 0.16, 0.01), M.metal(0x34383d), { parent: tg, pos: [2.52, 0.495, s * 0.195], name: 'firing unit' });
        mesh(G.tube([[2.52, 0.53, s * 0.195], [2.4, 0.62, s * 0.3], [2.1, 0.9, s * 0.5], [1.4, 1.0, s * 0.6]], 0.004, 24, 6), M.plastic(0x222222), { parent: tg, name: 'firing cable' });
      }
      // antennas on the trunk lid (ride with the lid) + roof SATCOM radome
      const ant = part(ctxShared.trunk, { he: 'אנטנות תקשורת', en: 'Communication antennas', mat: 'פיברגלס + פליז', desc: 'אנטנות לקשר רדיו מוצפן, GPS ומשבש אותות. כבלים מחברים אותן לארון התקשורת שבתא המטען.' });
      ant.userData.sysOverride = 'security';
      for (const [x, z, h] of [[-2.35, 0.32, 0.38], [-2.35, -0.32, 0.38], [-2.0, 0.0, 0.16]]) {
        const p = lowSec(x, z / WG(x) * LV.deck).sub(ctxShared.trunkPivot);
        mesh(G.lathe([[0.022, 0], [0.02, 0.012], [0.008, 0.03]], 20, 'y'), M.black(), { parent: ant, pos: p.toArray(), name: 'antenna base' });
        mesh(G.cyl(0.0025, 0.004, h, 8, 'y'), M.black(), { parent: ant, pos: [p.x, p.y + h / 2 + 0.02, p.z], name: 'whip' });
      }
      const sat = part(sc, { he: 'כיפת תקשורת לוויינית', en: 'SATCOM radome', mat: 'פיברגלס', desc: 'כיפה נמוכה על הגג שמסתירה אנטנת לוויין לתקשורת נתונים, וידאו וקול מאובטחים.' });
      mesh(G.lathe([[0.16, 0], [0.155, 0.01], [0.12, 0.028], [0.06, 0.038], [0, 0.04]], 40, 'y'), M.gloss(0x0b0c0e), { parent: sat, pos: [-0.75, ROOF + 0.016, 0] });
    }

    // DETAILS-PLACEHOLDER

    Object.assign(window.L3D, { beast: ctxShared });
  },
};

// Cadillac crest (2014+ wreath-less shield), drawn into a texture
function crestTexture(K) {
  return K.canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sh = () => { g.beginPath(); g.moveTo(96, 70); g.lineTo(416, 70); g.lineTo(392, 330); g.quadraticCurveTo(380, 420, 256, 470); g.quadraticCurveTo(132, 420, 120, 330); g.closePath(); };
    sh(); const met = g.createLinearGradient(0, 70, 0, 470); met.addColorStop(0, '#f4f4f4'); met.addColorStop(0.5, '#9aa0a6'); met.addColorStop(1, '#e6e6e6'); g.fillStyle = met; g.fill();
    g.save(); sh(); g.clip();
    const cells = [['#111', '#c9a227', '#b3121b', '#111'], ['#1f4aa8', '#111', '#c9a227', '#1f4aa8'], ['#c9a227', '#1f4aa8', '#111', '#b3121b'], ['#111', '#b3121b', '#1f4aa8', '#c9a227']];
    const x0 = 112, y0 = 86, cw = 72, ch = 92;
    cells.forEach((row, r) => row.forEach((c, k) => { g.fillStyle = c; g.fillRect(x0 + k * cw + 4, y0 + r * ch + 4, cw - 8, ch - 8); }));
    g.restore();
    sh(); g.lineWidth = 16; g.strokeStyle = '#e9ecef'; g.stroke();
  });
}

// Washington D.C. plate
function plateTexture(K) {
  return K.canvasTexture(640, 320, (g, w, h) => {
    g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8102e'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#c8102e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 34px Arial, sans-serif'; g.fillText('DISTRICT OF COLUMBIA', w / 2, 46);
    g.font = '900 150px "Arial Narrow", Arial, sans-serif'; g.fillText('800 002', w / 2, 168);
    g.fillStyle = '#1d3a8a'; g.font = '700 26px Arial, sans-serif'; g.fillText('END TAXATION WITHOUT REPRESENTATION', w / 2, 278);
    g.fillStyle = '#c8102e'; g.beginPath(); g.arc(70, 46, 9, 0, 7); g.fill(); g.beginPath(); g.arc(w - 70, 46, 9, 0, 7); g.fill();
  });
}

function star(g, cx, cy, r, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

// 13 stripes, 50 stars (hoist on the left of the canvas)
function usFlagTexture(K) {
  return K.canvasTexture(760, 400, (g, w, h) => {
    const sh = h / 13;
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, i * sh, w, sh + 1); }
    const cw = w * 0.4, chh = sh * 7;
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, cw, chh);
    for (let r = 0; r < 9; r++) { const n = r % 2 ? 5 : 6; for (let c = 0; c < n; c++) star(g, (cw / 12) * (c * 2 + (r % 2 ? 2 : 1)), (chh / 10) * (r + 1), sh * 0.32, '#fff'); }
  });
}

// stylised Presidential standard: coat of arms on navy, a star in each corner
function presFlagTexture(K) {
  return K.canvasTexture(760, 400, (g, w, h) => {
    g.fillStyle = '#0a1f5c'; g.fillRect(0, 0, w, h);
    for (const [x, y] of [[50, 50], [w - 50, 50], [50, h - 50], [w - 50, h - 50]]) star(g, x, y, 22, '#fff');
    for (let i = 0; i < 50; i++) { const a = (i / 50) * Math.PI * 2; star(g, w / 2 + Math.cos(a) * 150, h / 2 + Math.sin(a) * 150, 6, '#fff'); }
    eagle(g, w / 2, h / 2 + 6, 1.05);
  });
}

// stylised heraldic eagle with the striped shield
function eagle(g, cx, cy, k) {
  g.save(); g.translate(cx, cy); g.scale(k, k);
  g.fillStyle = '#7a4a22';
  for (const sgn of [-1, 1]) {
    g.beginPath(); g.moveTo(0, -10);
    g.bezierCurveTo(sgn * 40, -70, sgn * 95, -90, sgn * 118, -60);
    for (let i = 0; i < 6; i++) g.lineTo(sgn * (112 - i * 13), -36 + i * 13 + (i % 2) * 8);
    g.bezierCurveTo(sgn * 40, 30, sgn * 20, 20, 0, 20); g.fill();
  }
  g.fillStyle = '#f2f2f2'; g.beginPath(); g.ellipse(0, -58, 16, 20, 0, 0, 7); g.fill();
  g.fillStyle = '#e8b22a'; g.beginPath(); g.moveTo(10, -60); g.lineTo(24, -54); g.lineTo(10, -50); g.fill();
  g.fillStyle = '#7a4a22'; g.beginPath(); g.moveTo(-22, 48); g.lineTo(0, 78); g.lineTo(22, 48); g.fill();
  g.fillStyle = '#fff'; g.fillRect(-26, -26, 52, 58);
  for (let i = 0; i < 7; i++) { g.fillStyle = '#b22234'; g.fillRect(-26 + i * 7.6, -12, 4, 44); }
  g.fillStyle = '#3c3b6e'; g.fillRect(-26, -26, 52, 14);
  g.strokeStyle = '#e8b22a'; g.lineWidth = 3; g.strokeRect(-26, -26, 52, 58);
  g.fillStyle = '#4c7a2a'; g.beginPath(); g.ellipse(-48, 40, 16, 6, -0.6, 0, 7); g.fill();
  g.fillStyle = '#d8c7a0'; for (let i = 0; i < 3; i++) g.fillRect(36 + i * 5, 26 + i * 3, 3, 26);
  g.restore();
}

// stylised Seal of the President of the United States
function sealTexture(K) {
  return K.canvasTexture(1024, 1024, (g, w, h) => {
    const c = w / 2;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d9b55a'; g.beginPath(); g.arc(c, c, 506, 0, 7); g.fill();
    g.fillStyle = '#0b2160'; g.beginPath(); g.arc(c, c, 492, 0, 7); g.fill();
    g.strokeStyle = '#d9b55a'; g.lineWidth = 8; g.beginPath(); g.arc(c, c, 372, 0, 7); g.stroke();
    g.fillStyle = '#f2f0e6'; g.font = '700 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = 'SEAL · OF · THE · PRESIDENT · OF · THE · UNITED · STATES ·';
    const R = 432, span = Math.PI * 2 * 0.96;
    for (let i = 0; i < text.length; i++) { const a = -Math.PI / 2 - span / 2 + (span * (i + 0.5)) / text.length; g.save(); g.translate(c + Math.cos(a) * R, c + Math.sin(a) * R); g.rotate(a + Math.PI / 2); g.fillText(text[i], 0, 0); g.restore(); }
    g.fillStyle = '#e9edf5'; g.beginPath(); g.arc(c, c, 364, 0, 7); g.fill();
    for (let i = 0; i < 50; i++) { const a = (i / 50) * Math.PI * 2; star(g, c + Math.cos(a) * 320, c + Math.sin(a) * 320, 14, '#0b2160'); }
    g.fillStyle = '#c9d6ea'; g.beginPath(); g.arc(c, c - 150, 95, Math.PI, 0); g.fill();
    eagle(g, c, c + 20, 2.3);
  });
}

// perforated speaker grille
function speakerTexture(K) {
  return K.canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9ea4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16181b';
    for (let y = 6; y < h; y += 9) for (let x = 6 + ((y / 9) % 2) * 4.5; x < w; x += 9) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  });
}

// instrument cluster: speedometer (mph), tachometer, centre info
function clusterTexture(K) {
  return K.canvasTexture(1024, 370, (g, w, h) => {
    g.fillStyle = '#05070b'; g.fillRect(0, 0, w, h);
    const dial = (cx, cy, r, max, step, label, val) => {
      g.strokeStyle = '#2b3442'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      g.strokeStyle = '#c8a75a'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * val / max)); g.stroke();
      g.fillStyle = '#cfd6e2'; g.font = '600 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let v = 0; v <= max; v += step) { const a = Math.PI * (0.75 + (1.5 * v) / max); g.fillText(String(v), cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32)); }
      const a = Math.PI * (0.75 + 1.5 * val / max); g.strokeStyle = '#ff5a3a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#8a95a6'; g.font = '600 18px Arial'; g.fillText(label, cx, cy + r * 0.55);
    };
    dial(190, 190, 150, 120, 20, 'MPH', 35);
    dial(w - 190, 190, 150, 4, 1, 'RPM ×1000', 1.2);
    g.fillStyle = '#e9edf5'; g.font = '700 64px Arial'; g.textAlign = 'center'; g.fillText('35', w / 2, 140);
    g.font = '600 20px Arial'; g.fillStyle = '#8a95a6'; g.fillText('MPH · CRUISE', w / 2, 185);
    g.fillStyle = '#3ad17a'; g.fillText('TIRES OK · RUN-FLAT READY', w / 2, 240);
    g.fillStyle = '#c8a75a'; g.fillText('CABIN SEALED · O₂ 100%', w / 2, 275);
  });
}

// secure comms / convoy map on the centre screen
function commsTexture(K) {
  return K.canvasTexture(640, 370, (g, w, h) => {
    g.fillStyle = '#122233'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b3147'; for (let y = 60; y < h; y += 46) for (let x = 10; x < 470; x += 58) g.fillRect(x + ((y / 46) % 2) * 12, y, 44, 32);
    g.strokeStyle = '#3c5d7a'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, 210); g.lineTo(470, 120); g.moveTo(140, 44); g.lineTo(240, h); g.stroke();
    g.strokeStyle = '#38a3ff'; g.lineWidth = 7; g.beginPath(); g.moveTo(30, 340); g.bezierCurveTo(140, 300, 190, 180, 290, 160); g.bezierCurveTo(360, 146, 400, 110, 460, 70); g.stroke();
    for (const [x, y, c] of [[214, 214, '#cfd6e2'], [248, 186, '#ffd24a'], [282, 164, '#cfd6e2'], [318, 156, '#cfd6e2']]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
    g.fillStyle = '#0a1520'; g.fillRect(470, 44, w - 470, h - 44);
    g.font = '700 17px Arial'; g.textAlign = 'left';
    ['CH1  SS DETAIL', 'CH2  WHCA', 'CH3  MOTORCADE', 'CH4  LEAD CAR', 'CH5  HOSPITAL'].forEach((t, i) => { g.fillStyle = i === 0 ? '#3dff8a' : '#a9b6c6'; g.fillText(t, 482, 82 + i * 40); });
    g.fillStyle = '#0a1520'; g.fillRect(0, 0, w, 44); g.fillStyle = '#7dffb0'; g.font = '700 22px Arial'; g.fillText('● SECURE  ·  STAGECOACH', 16, 29);
    g.fillStyle = '#e3e7ee'; g.textAlign = 'right'; g.fillText('ETA 07:58', w - 16, 29);
  });
}

