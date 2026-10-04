// #004 — Ford Model T Touring (1915, brass era). Built entirely in code with the library kit
// (engine/kit.js). Units are metres. Axes: +x = forward, +y = up, +z = right (passenger side);
// the driver sits at -z (left-hand drive). s = +1 right, -1 left.
window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, surface, samples, cap, lerp, smooth, clamp, instances } = K;
    const PI = Math.PI;
    const v3 = (p) => (p.isVector3 ? p : V3(...p));
    const put = (geo, mat, parent, pos, rot, o = {}) => { if (rot && !Array.isArray(rot)) { o = rot; rot = null; } return mesh(geo, mat, { parent, pos: pos || undefined, rot: rot || undefined, ...o }); };
    const rod = (parent, a, b, r, mat, o = {}) => { a = v3(a); b = v3(b); const d = b.clone().sub(a); const m = mesh(G.cyl(o.r2 ?? r, r, d.length(), o.seg || 10, 'y'), mat, { parent, name: o.name }); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()); return m; };
    const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
    const sideHe = (s) => (s > 0 ? 'ימין' : 'שמאל'), sideEn = (s) => (s > 0 ? 'right' : 'left');
    // generic loft through rings of points (smooth shaded, open or closed ring)
    const loft = (rings, close = false) => {
      const nr = rings.length, np = rings[0].length, pos = [], ind = [], uv = [];
      rings.forEach((r, i) => r.forEach((p, j) => { pos.push(p.x, p.y, p.z); uv.push(i / (nr - 1), j / (np - 1)); }));
      const nj = close ? np : np - 1;
      for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nj; j++) { const a = i * np + j, b = i * np + ((j + 1) % np), c = (i + 1) * np + ((j + 1) % np), d = (i + 1) * np + j; ind.push(a, b, c, a, c, d); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      return g;
    };
    // sweep a cross-section [[z, h]…] along an x-y path; h is measured along the outward normal (away from (cx, cy))
    const sweep = (path, section, cx, cy) => loft(path.map((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      let nx = -ty, ny = tx; if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
      return (typeof section === 'function' ? section(i, path.length) : section).map(([z, h]) => V3(p[0] + nx * h, p[1] + ny * h, z));
    }));
    const tableFn = (pts) => (x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (x <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])); return pts[pts.length - 1][1]; };
    const bolts = (parent, list, size = 0.006, mat = M.steel()) => instances(G.bolt(size), mat, list.map((l) => ({ pos: l.pos, rot: l.rot || [0, 0, 0] })), { parent });
    const rivets = (parent, list, r = 0.004, mat = M.darkSteel()) => instances(G.rivet(r), mat, list.map((l) => ({ pos: l.pos, rot: l.rot || [0, 0, 0] })), { parent, cast: false });
    const P = (parent, he, en, mat, desc, o) => part(parent, { he, en, mat, desc }, o);

    // ------------------------------------------------------------------ key dimensions
    const AXF = 1.27, AXR = -1.27, TR = 0.381, WZ = 0.711;     // wheelbase 2.54 m (100 in), track 1.42 m (56 in)
    const FRAME_Y = 0.58, FLOOR = 0.70, BZ = 0.575, BELT = 1.06;
    const BLACK = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: 0.1, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, name: 'לכה שחורה (ג׳פאן)' }), BLACKM = M.paintFlat(0x0c0c0d, 0.5);
    const BRASS = M.brass(), BRASSD = (() => { const m = M.brass().clone(); m.color.setHex(0xb98f3a); m.roughness = 0.42; return m; })();
    const STEEL = M.steel(), DSTEEL = M.darkSteel(), CAST = M.castIron();
    const IRON = M.metal(0x1d1e21, 0.5);
    const SHEET = dbl(M.metal(0x131315, 0.4));
    const woodNat = (() => { const m = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.4, metalness: 0, bumpMap: K.noiseTexture(256, 'fabric'), bumpScale: 0.3, name: 'עץ היקורי צבוע שחור' }); return m; })();
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.6, bumpMap: K.noiseTexture(256, 'leather'), bumpScale: 0.3, name: 'עץ אפר' });
    const fabricTop = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.95, side: THREE.DoubleSide, bumpMap: K.noiseTexture(256, 'fabric'), bumpScale: 0.6, name: 'בד גג מגומם' });
    const spinners = [];

    // ================================================================== WHEELS
    const wheelsSys = sys('wheels');
    const wheelSpots = [{ x: AXF, s: 1, front: true }, { x: AXF, s: -1, front: true }, { x: AXR, s: 1, front: false }, { x: AXR, s: -1, front: false }];
    {
      const rimGeo = G.lathe([[0.296, -0.035], [0.303, -0.035], [0.31, -0.03], [0.322, -0.034], [0.326, -0.03], [0.315, -0.02], [0.306, -0.012], [0.306, 0.012], [0.315, 0.02], [0.326, 0.03], [0.322, 0.034], [0.31, 0.03], [0.303, 0.035], [0.296, 0.035], [0.296, -0.035]], 64, 'z');
      const felloeGeo = G.lathe([[0.236, -0.026], [0.3, -0.03], [0.3, 0.03], [0.236, 0.026], [0.236, -0.026]], 48, 'z');
      const hubGeo = G.lathe([[0, -0.085], [0.034, -0.085], [0.05, -0.06], [0.074, -0.04], [0.074, 0.04], [0.05, 0.06], [0.034, 0.085], [0, 0.085]], 28, 'z');
      const flangeGeo = G.merge([G.cyl(0.092, 0.092, 0.012, 32, 'z').translate(0, 0, -0.046), G.cyl(0.092, 0.092, 0.012, 32, 'z').translate(0, 0, 0.046)]);
      const spokeGeo = G.merge(Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * PI * 2; const g = G.cyl(0.011, 0.02, 0.19, 8, 'y'); g.scale(1, 1, 1.25); g.translate(0, 0.095 + 0.07, 0); g.rotateZ(a - PI / 2 + PI / 2); return g; }));
      const capGeo = G.lathe([[0, 0.052], [0.02, 0.05], [0.036, 0.04], [0.046, 0.02], [0.046, 0], [0, 0]], 24, 'z');
      const hubBolts = G.merge(Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * PI * 2; return G.at(G.cyl(0.006, 0.006, 0.01, 6, 'z'), [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.056]); }));
      const sidewall = K.textTexture('30 × 3½ · 4 PLY', { font: '600 70px Arial', color: '#3b3b3e', pad: 6 });
      for (const w of wheelSpots) {
        const name = `${w.front ? 'קדמי' : 'אחורי'} ${sideHe(w.s)}`, en = `${w.front ? 'Front' : 'Rear'} ${sideEn(w.s)}`;
        const tw = w.front ? 1.0 : 1.17;
        const wp = part(wheelsSys, { he: `גלגל ${name}`, en: `${en} wheel`, mat: 'עץ היקורי + חישוק פלדה + צמיג', desc: `גלגל ארטילריה מעץ עם 12 חישורים, ${w.front ? 'צמיג 30×3 קדמי' : 'צמיג 30×3½ אחורי רחב יותר'}. את הגלגל בנו כמו עגלה: חישורי עץ היקורי שנדחסים לתוך נבות וחישוק.` });
        wp.position.set(w.x, TR, w.s * WZ); if (w.s < 0) wp.rotation.y = PI;
        const spin = new THREE.Group(); wp.add(spin); spinners.push({ o: spin, s: w.s });
        const tire = part(spin, { he: `צמיג ${name}`, en: `${en} tyre`, mat: 'גומי מוואלקן + בד, 30×3' + (w.front ? '' : '½'), desc: 'צמיג קלינצ׳ר (נכנס לתוך שפת החישוק) עם שתי שכבות בד, שפופרת פנימית וכיתוב מידה על הדופן. נתקע לעיתים קרובות — מנהגים נסעו עם ערכת תיקון.' });
        mesh(G.torus(0.343, 0.038, 14, 64, PI * 2, 'z'), M.tire(), { parent: tire, scale: [1, 1, tw] });
        if (w.front) for (const z of [-0.016, 0.016]) mesh(G.torus(0.3805, 0.0018, 4, 64, PI * 2, 'z'), M.black(), { parent: tire, pos: [0, 0, z], cast: false });
        else instances(new THREE.BoxGeometry(0.004, 0.012, 0.034), M.black(), Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * PI * 2; return { pos: [Math.cos(a) * 0.381, Math.sin(a) * 0.381, 0.012 * (i % 2 ? 1 : -1)], rot: [0, 0, a + PI / 2 + (i % 2 ? 0.5 : -0.5)] }; }), { parent: tire, cast: false });
        const sw = mesh(new THREE.RingGeometry(0.322, 0.35, 48), M.decal(sidewall.tex, { roughness: 0.9, clearcoat: 0 }), { parent: tire, pos: [0, 0, 0.0385 * tw], cast: false });
        { const p = sw.geometry.attributes.position, uv = sw.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 0.7, 0.5 + p.getY(i) / 0.7); }
        const rim = P(spin, `חישוק ${name}`, `${en} clincher rim`, 'פלדה מגולוונת', 'חישוק פלדה בקוטר 24 אינץ׳ עם שפות מעוקלות שאוחזות בפטיט הצמיג. בפרט: ברז אוויר קטן עם מכסה.');
        mesh(rimGeo, STEEL, { parent: rim });
        put(G.cyl(0.005, 0.005, 0.03, 8, 'y'), BRASS, rim, [Math.cos(0.7) * 0.3, Math.sin(0.7) * 0.3, 0.0], [0, 0, 0.7 - PI / 2 + PI]);
        const fel = P(spin, `חישוק עץ (פלגה) ${name}`, `${en} wooden felloe`, 'עץ היקורי', 'טבעת העץ שאליה נקבעים קצות החישורים. מצופה בלכה ומחוזקת בחישוק הפלדה בחימום (התכווצות).');
        mesh(felloeGeo, woodNat, { parent: fel });
        instances(new THREE.BoxGeometry(0.03, 0.012, 0.008), DSTEEL, Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * PI * 2 + 0.26; return { pos: [Math.cos(a) * 0.294, Math.sin(a) * 0.294, 0.034], rot: [0, 0, a + PI / 2] }; }), { parent: fel });
        const sp = P(spin, `חישורים ${name} (12)`, `${en} spokes (×12)`, 'עץ היקורי', 'שנים־עשר חישורים מחוטבים, עבים ליד הנאב ודקים ליד הפלגה. שוקעים בחריצי הנאב וקבועים בדבק ובקשירה.');
        mesh(spokeGeo, woodNat, { parent: sp });
        const hub = P(spin, `נאב ${name}`, `${en} hub`, 'עץ + אוגנים מפלדה', 'נאב עץ גדול עם שני אוגנים מפלדה שמאחדים את החישורים. בתוכו מסבי רולר ועליו שישה ברגים.');
        mesh(hubGeo, woodDark, { parent: hub }); mesh(flangeGeo, IRON, { parent: hub }); mesh(hubBolts, STEEL, { parent: hub });
        const hc = P(spin, `פקק נאב ${name}`, `${en} hub cap`, 'פליז', 'פקק פליז מוברג על קצה הציר, עם סמל ״Ford״ מוטבע.');
        mesh(capGeo, BRASS, { parent: hc, pos: [0, 0, 0.08] });
        wp.userData.tw = tw;
      }
    }
    // spare wheel on the rear (static)
    {
      const sp = P(wheelsSys, 'גלגל חילוף', 'Spare wheel', 'צמיג + חישוק פלדה', 'חישוק פלדה עם צמיג 30×3½ מותקן על תושבת בגב הרכב. ההחלפה כרוכה בפתיחת החישוק מהגלגל עם ברגי נעילה ורתמת פלדה.');
      sp.position.set(-1.72, 1.0, 0); sp.rotation.y = PI / 2;
      mesh(G.torus(0.343, 0.038, 12, 56, PI * 2, 'z'), M.tire(), { parent: sp, scale: [1, 1, 1.17] });
      mesh(G.lathe([[0.296, -0.035], [0.322, -0.034], [0.326, -0.03], [0.306, -0.012], [0.306, 0.012], [0.326, 0.03], [0.322, 0.034], [0.296, 0.035]], 56, 'z'), STEEL, { parent: sp });
      mesh(G.cyl(0.07, 0.07, 0.006, 24, 'z'), IRON, { parent: sp, pos: [0, 0, 0.04] });
      const cr = P(wheelsSys, 'תושבת גלגל חילוף', 'Spare-tyre carrier', 'פלדה + רצועה', 'מוט פלדה אחד ושתי תושבות שמחזיקות את החישוק ללוח האחורי. מכוסה בלולאת רצועה.');
      rod(cr, [-1.6, 0.66, 0], [-1.7, 0.7, 0], 0.012, IRON); put(new THREE.BoxGeometry(0.05, 0.1, 0.34), IRON, cr, [-1.62, 0.72, 0]);
    }
    // ------------------------------------------------------------------ steered/driven spin animation
    let speed = 0;
    K.toggle('drive', { he: 'גלגלים מסתובבים', key: 'g', seconds: 1.2 }, (t) => { speed = t * 5; });
    K.onFrame((time, dt) => { if (speed > 0.01) for (const sp of spinners) sp.o.rotation.z -= (sp.s * speed * dt) / 0.381; });

    // ================================================================== BODY
    const body = sys('body');
    // ---- fenders (swept sections along arcs around the axles)
    const arc = (cx, cy, R, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n) * PI / 180; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
    const FR = 0.41;
    const fenderSec = (zin) => [[zin, 0.01], [zin + 0.1, 0.012], [zin + 0.25, 0.01], [WZ - 0.02, 0.0], [WZ + 0.05, -0.008], [0.80, -0.04], [0.812, -0.1]];
    const fenderMat = BLACK;
    const secBlend = (zin, s, kTip, kTail) => (i, n) => {
      const full = fenderSec(zin), board = [[0.585, 0.0], [0.64, 0.0], [0.72, 0.0], [0.78, 0.0], [0.82, 0.0], [0.835, 0.0], [0.84, 0.0]];
      let b = kTail(i, n), k = kTip(i, n);
      const zc = (zin + 0.85) / 2;
      return full.map(([z, h], j) => { const zz = lerp(zc + (z - zc) * k, board[j][0], b), hh = lerp(h * k, 0, b); return [s * zz, hh]; });
    };
    for (const s of [1, -1]) {
      const sH = sideHe(s), sE = sideEn(s);
      const ff = P(body, `פח כנף קדמית ${sH}`, `Front ${sE} fender`, 'פלדה + לכה שחורה', 'הכנף הקדמית מכוסה בלכה שחורה (״ג׳פאן״ שהתייבשה מהר, הסיבה שכל המכוניות שחורות מ־1914). קצה מגולגל מחזק את הפח, והקצה הפנימי עולה אל מכסה המנוע.');
      const pathF = [...arc(AXF, TR, FR, -22, 180, 40), [0.80, 0.398], [0.76, 0.43]];
      const secF = secBlend(0.30, s, (i) => 0.3 + 0.7 * smooth(0, 12, i), (i, n) => smooth(40, n - 1, i));
      mesh(sweep(pathF, secF, AXF, TR), fenderMat, { parent: ff, name: 'fender skin' });
      const rf = P(body, `פח כנף אחורית ${sH}`, `Rear ${sE} fender`, 'פלדה + לכה שחורה', 'הכנף האחורית רחבה וגולשת עד מאחורי הגלגל, כשהקצה הפנימי צמוד לדופן הגוף. בחזית היא ממשיכה אל לוח הדריכה.');
      const pathR = [[-0.76, 0.43], [-0.80, 0.398], ...arc(AXR, TR, FR, 0, 188, 40)];
      const secR = secBlend(0.585, s, (i, n) => 0.5 + 0.5 * smooth(n - 1, n - 10, i), (i, n) => 1 - smooth(0, 3, i));
      mesh(sweep(pathR, secR, AXR, TR), fenderMat, { parent: rf, name: 'fender skin' });
      // beads (rivets) along the rolled edges
      rivets(ff, arc(AXF, TR, FR - 0.03, -10, 175, 26).map(([x, y]) => ({ pos: [x, y + 0.0, s * 0.835], rot: [0, 0, 0] })), 0.003, BRASS);
      // fender irons (brackets) to the frame
      const fi = P(body, `ברזלי תליית כנף ${sH} (3)`, `${sE} fender irons (×3)`, 'פלדה מחושלת', 'שלושה זרועות מברזל שמחברות כל כנף למסגרת. בלעדיהן הכנף תרעד בנסיעה על כביש עפר.');
      for (const [x0, y0, x1, y1] of [[AXF + 0.12, 0.76, AXF + 0.12, 0.64], [AXF - 0.22, 0.79, AXF - 0.22, 0.64], [AXR + 0.12, 0.79, AXR + 0.12, 0.62], [AXR - 0.22, 0.77, AXR - 0.22, 0.60]]) { /* handled below per side */ rod(fi, [x0, y0 - 0.03, s * 0.44], [x1, y1, s * 0.36], 0.009, IRON); }
    }
    // ---- running boards
    for (const s of [1, -1]) {
      const rb = P(body, `לוח דריכה ${sideHe(s)}`, `${sideEn(s)} running board`, 'פלדה מצופה לכה + רצועות עץ', 'משטח שאליו דורכים בעלייה. פס אלומיניום מחורץ מונע החלקה, ומתחתיו ארבעה תומכי ברזל.');
      put(new THREE.BoxGeometry(1.56, 0.012, 0.235), SHEET, rb, [0, 0.432, s * 0.7025]);
      put(new THREE.BoxGeometry(1.56, 0.02, 0.008), M.aluminum(), rb, [0, 0.434, s * 0.825]);
      instances(new THREE.BoxGeometry(1.5, 0.004, 0.008), M.darkSteel(), Array.from({ length: 18 }, (_, i) => ({ pos: [0, 0.4395, s * (0.595 + i * 0.012)] })), { parent: rb, cast: false });
      for (const x of [-0.62, -0.22, 0.22, 0.62]) { rod(rb, [x, 0.426, s * 0.62], [x, 0.60, s * 0.42], 0.01, IRON); }
    }
    // ---- body tub: side walls with a door notch, rear panel, floor, toe-board, dash
    const DOOR = [-1.27, -0.60];       // rear door x range (hinged at the rear)
    const DY = 0.72;                    // door bottom
    const sideShape = () => {
      const p = [[0.88, 0.66], [-1.50, 0.66], [-1.56, 0.7], [-1.58, 0.8], [-1.58, BELT - 0.01], [-1.54, BELT + 0.02]];
      const sh = new THREE.Shape(); sh.moveTo(...p[0]); p.slice(1).forEach((q) => sh.lineTo(...q));
      sh.lineTo(DOOR[0] - 0.004, BELT + 0.02); sh.lineTo(DOOR[0] - 0.004, DY - 0.004); sh.lineTo(DOOR[1] + 0.004, DY - 0.004); sh.lineTo(DOOR[1] + 0.004, BELT + 0.02);
      sh.lineTo(0.2, BELT + 0.02); sh.quadraticCurveTo(0.6, BELT + 0.03, 0.88, 1.17); sh.lineTo(0.88, 0.66);
      return sh;
    };
    const bodyMat = BLACK;
    for (const s of [1, -1]) {
      const sp = P(body, `דופן גוף ${sideHe(s)}`, `Body side panel ${sideEn(s)}`, 'פלדה/אלומיניום על שלד עץ', 'דופן הגוף נתונה על שלד עץ אפר. גוף הטוריסט נבנה בנפרד מהשלדה ונורה אליה בארבעה ברגי נגרות.');
      const g = G.extrude(sideShape(), 0.02, { bevel: 0.002, curveSeg: 12 });
      mesh(g, bodyMat, { parent: sp, pos: [0, 0, s * BZ] });
      rivets(sp, [[0.4, 1.0], [-0.2, 1.0], [-0.6, 1.0], [-1.3, 1.0], [-1.5, 0.9], [0.8, 1.1], [0.3, 0.7], [-0.4, 0.7], [-1.0, 0.68], [-1.4, 0.68]].map(([x, y]) => ({ pos: [x, y, s * (BZ + 0.012)], rot: [PI / 2, 0, 0] })), 0.004, BRASS);
      // blind front door outline
      const fd = P(body, `דלת קדמית דמה ${sideHe(s)}`, `Front blind door ${sideEn(s)}`, 'פלדה צבועה', 'בטוריסט של 1915 דלתות המושב הקדמי היו מצוירות בלבד (כאן: קו מכוסה ללא ידית), ונכנסו אליו מהצד ומעל לוח הדריכה. (לפי תיאור שנאסף; פשטנו.)');
      for (const [x0, x1] of [[-0.12, 0.62]]) { for (const x of [x0, x1]) put(new THREE.BoxGeometry(0.006, 0.34, 0.004), M.black(), fd, [x, 0.89, s * (BZ + 0.021)]); put(new THREE.BoxGeometry(x1 - x0, 0.006, 0.004), M.black(), fd, [(x0 + x1) / 2, 0.72, s * (BZ + 0.021)]); }
    }
    {
      const rp = P(body, 'לוח אחורי', 'Rear panel', 'פלדה צבועה', 'לוח הקצה האחורי של הגוף, מחורר לסוגרי מנורת הזנב ולוחית הרישוי.');
      put(new THREE.BoxGeometry(0.02, 0.38, 1.17), BLACK, rp, [-1.58, 0.86, 0]);
      const lp = P(body, 'לוחית רישוי', 'Licence plate', 'פלדה אמייל', 'לוחית רישוי של קליפורניה 1915: מספר על רקע צהוב, בלי שנת הנפקה כדוגמת היום.');
      const tx = K.canvasTexture(512, 256, (g, w, h) => { g.fillStyle = '#e8b923'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#111'; g.font = '700 40px Arial'; g.textAlign = 'center'; g.fillText('CAL', 70, 60); g.fillText('1915', w - 80, 60); g.font = '700 150px Arial'; g.fillText('3685', w / 2, 190); });
      mesh(new THREE.PlaneGeometry(0.3, 0.15), M.decal(tx, { roughness: 0.5 }), { parent: lp, pos: [-1.592, 0.52, 0], rot: [0, -PI / 2, 0], cast: false });
      put(new THREE.BoxGeometry(0.004, 0.15, 0.3), M.metal(0xdba81e, 0.4), lp, [-1.589, 0.52, 0]); put(new THREE.BoxGeometry(0.03, 0.12, 0.02), IRON, lp, [-1.55, 0.6, 0]);
      const fp = P(body, 'לוחית רישוי קדמית', 'Front licence plate', 'פלדה אמייל', 'לוחית שנייה שתלויה מתחת לרדיאטור על זוג תומכים מהצלע הקדמית, כדי שייראה מספר גם מלפנים.');
      const ftx = K.canvasTexture(512, 256, (g, w, h) => { g.fillStyle = '#e8b923'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#111'; g.font = '700 40px Arial'; g.textAlign = 'center'; g.fillText('CAL', 70, 60); g.fillText('1915', w - 80, 60); g.font = '700 150px Arial'; g.fillText('3685', w / 2, 190); });
      mesh(new THREE.PlaneGeometry(0.3, 0.15), M.decal(ftx, { roughness: 0.5 }), { parent: fp, pos: [1.791, 0.4, 0], rot: [0, PI / 2, 0], cast: false });
      put(new THREE.BoxGeometry(0.004, 0.15, 0.3), M.metal(0xdba81e, 0.4), fp, [1.788, 0.4, 0]);
      for (const z of [-0.12, 0.12]) rod(fp, [1.785, 0.36, z], [1.5, 0.52, z * 1.2], 0.008, IRON);
      const fl = P(body, 'לוחות רצפה', 'Floorboards', 'עץ אורן', 'לוחות עץ פשוטים עם חריץ למוטות הדוושות ויציאה לידית הבלם. מעליהם שטיח גומי.');
      put(new THREE.BoxGeometry(2.25, 0.02, 1.15), woodDark, fl, [-0.42, FLOOR - 0.01, 0]);
      put(G.box(0.8, 0.006, 0.7, 0.002), M.rubber(), fl, [0.3, FLOOR + 0.002, 0]);
      const tb = P(body, 'לוח רגליים משופע', 'Toeboard', 'עץ + פלדה', 'לוח משופע שמחבר את הרצפה לקדמת התא, עם חריצים לשלוש הדוושות ולמוט היגוי.');
      { const g = new THREE.BoxGeometry(0.34, 0.012, 1.14); g.rotateZ(1.0); put(g, woodDark, tb, [0.72, 0.84, 0]); }
      const ds = P(body, 'לוח מחוונים וקיר אש (דאש)', 'Dash & firewall', 'פלדה צבועה', 'קיר האש שמפריד בין תא הנוסעים למנוע. ללא מחוונים כמעט: רק מתג הצתה, מד זרם וכפתור חנק.');
      put(new THREE.BoxGeometry(0.02, 0.5, 1.17), BLACK, ds, [0.88, 0.97, 0]);
      const cw = P(body, 'אדן קדמי (קאול)', 'Cowl', 'פלדה מעוצבת', 'החלק המעוגל שמעל קיר האש. עליו יושבים מנורות הצד ושמשת הרוח.');
      { const secs = []; for (const x of [0.9, 0.78]) secs.push(Array.from({ length: 11 }, (_, i) => { const u = i / 10 * 2 - 1; return V3(x, 1.2 + 0.04 * (1 - Math.abs(u) ** 2.4) - (x < 0.85 ? 0.03 : 0), u * BZ); })); mesh(loft(secs), BLACK, { parent: cw }); }
      const rs = P(body, 'מושב פנימי עליון (ארגז מושב)', 'Front seat riser', 'עץ + פלדה', 'ארגז העץ שמתחת למושב הקדמי: בתוכו מיכל הדלק, ומעליו כרית המושב.');
      put(new THREE.BoxGeometry(0.46, 0.14, 1.12), BLACK, rs, [-0.07, FLOOR + 0.07, 0]);
      const rs2 = P(body, 'ארגז מושב אחורי', 'Rear seat riser', 'עץ + פלדה', 'פלטפורמה נמוכה עבור כרית המושב האחורי, עם מגירה לכלי עבודה.');
      put(new THREE.BoxGeometry(0.5, 0.12, 1.12), BLACK, rs2, [-1.12, FLOOR + 0.06, 0]);
      for (const s of [1, -1]) { const sl = P(body, `קורת רצפה ${sideHe(s)}`, `${sideEn(s)} body sill`, 'עץ אפר', 'קורת עץ ארוכה שמתחת לדופן. הגוף יושב עליה והיא מונחת על מסגרת הפלדה, עם ריפוד גומי.'); put(new THREE.BoxGeometry(2.3, 0.05, 0.05), woodDark, sl, [-0.35, 0.645, s * 0.5]); }
    }
    // ---- hood (two halves hinged on the ridge), radiator, bonnet louvres
    const hoodSec = [[0.27, 0.86], [0.272, 0.93], [0.245, 1.04], [0.17, 1.105], [0.04, 1.135], [0.0, 1.14]];
    const hoodX = [0.9, 1.58];
    for (const s of [1, -1]) {
      const hh = P(body, `חצי מכסה מנוע ${sideHe(s)}`, `Hood half ${sideEn(s)}`, 'פלדה בעובי 1 מ״מ + לכה', 'מכסה המנוע מורכב משני חצאים שנפתחים כמו כנפי ספר מציר באמצע. הצדדים מחוררים בתריסי אוורור כדי להוציא חום.');
      hh.position.set(0, 1.14, 0);
      const rings = [0, 0.5, 1].map((t) => { const x = lerp(hoodX[0], hoodX[1], t); const k = lerp(1, 0.9, t); return hoodSec.map(([z, y]) => V3(x, 1.14 + (y - 1.14) * (t > 0.5 ? 1.0 : 1.0) - (t > 0 ? 0.015 * t : 0), s * z * k)); });
      mesh(loft(rings), BLACK, { parent: hh, pos: [0, -1.14, 0], name: 'hood skin' });
      const lv = P(hh, `תריסי אוורור ${sideHe(s)}`, `${sideEn(s)} louvres`, 'פלדה מחורצת', 'ארבעה חריצי אוורור מוטבעים בצד כל חצי מכסה, כדי שהאוויר החם יברח מהמנוע.');
      for (let i = 0; i < 5; i++) put(new THREE.BoxGeometry(0.1, 0.008, 0.004), M.black(), lv, [1.23 + i * 0.0, 0.92 - 1.14 + i * 0.03, s * 0.268], null, {});
      rivets(hh, Array.from({ length: 12 }, (_, i) => ({ pos: [0.95 + i * 0.058, 0.9 - 1.14, s * 0.272], rot: [PI / 2, 0, 0] })), 0.0035, BRASS);
      hh.userData.hinge = s;
    }
    const hoodHalves = body.children.filter((c) => c.name && c.name.startsWith('Hood half'));
    K.toggle('hood', { he: 'מכסה מנוע', key: 'h', seconds: 1.4 }, (t) => { for (const h of hoodHalves) h.rotation.x = -h.userData.hinge * 1.95 * Math.sin(t * PI / 2); });
    {
      const lt = P(body, 'תפס מכסה מנוע', 'Hood clip', 'פלדה קפיצית', 'שני תפסים לחוצי קפיץ שמחזיקים את חצי המכסה ברקע הרדיאטור.');
      for (const s of [1, -1]) put(new THREE.BoxGeometry(0.03, 0.02, 0.01), STEEL, lt, [1.57, 0.88, s * 0.26]);
      const hr = P(body, 'ציר מכסה מנוע', 'Hood hinge strip', 'פלדה', 'פס מתכת לאורך הרכס שבו נפגשים שני חצאי המכסה, ובו צירי הפתיחה.');
      put(new THREE.BoxGeometry(0.68, 0.01, 0.025), IRON, hr, [1.24, 1.145, 0]);
    }

    // ================================================================== COOLING (brass radiator)
    const cool = sys('cooling');
    const RX = 1.64;   // radiator centre x
    {
      const shellShape = G.shape([[-0.205, 0.0], [0.205, 0.0], [0.205, 0.5], [0.19, 0.52], [-0.19, 0.52], [-0.205, 0.5]], [[[-0.19, 0.015], [0.19, 0.015], [0.19, 0.49], [-0.19, 0.49]]]);
      const sg = G.extrude(shellShape, 0.11, { curveSeg: 4 }); sg.rotateY(-PI / 2); // shape x → world z, extrusion → x
      const shell = P(cool, 'מעטפת רדיאטור מפליז', 'Brass radiator shell', 'פליז מלוטש', 'המעטפת הנוצצת שהפכה לסמל של הדגם. בשנת 1917 החליפו אותה בפח שחור כדי לחסוך בעלות.');
      mesh(sg, BRASS, { parent: shell, pos: [RX, 0.66, 0] });
      // top header with embossed script
      const hd = P(cool, 'ראש הרדיאטור והכיתוב Ford', 'Radiator top tank & Ford script', 'פליז + כיתוב מוטבע', 'המיכל העליון המשופע נושא את הכיתוב Ford בכתב יד של הנרי פורד, הוטבע בפליז. ממנו נמלא המים.');
      mesh(G.box(0.1, 0.12, 0.4, 0.004, 2), BRASS, { parent: hd, pos: [RX, 1.1, 0] });
      const sc = K.textTexture('Ford', { font: 'italic 800 190px "Brush Script MT","URW Chancery L","Z003","Lucida Handwriting",cursive', color: '#6a4d12', pad: 10 });
      mesh(new THREE.PlaneGeometry(0.23, 0.23 / sc.aspect), M.decal(sc.tex, { roughness: 0.5, metalness: 0.5 }), { parent: hd, pos: [RX + 0.0505 + 0.002, 1.095, 0], rot: [0, PI / 2, 0], cast: false });
      const cr = P(cool, 'ליבת רדיאטור (חלת דבש)', 'Radiator core (honeycomb)', 'צינורות נחושת + סנפירים', 'מאות צינורות קטנים עם סנפירים שמצננים את המים. הרדיאטור אינו דחוס — הקירור נעשה ב״תרמוסיפון״: מים חמים עולים ומים קרים יורדים בלי משאבה.');
      const hc = K.canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b2c2f'; g.lineWidth = 2; for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 9) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = PI / 3 * k + PI / 6; g.lineTo(x + (y / 8 % 2 ? 4.5 : 0) + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5); } g.closePath(); g.stroke(); } }, { repeat: [2, 2] });
      const coreMat = new THREE.MeshStandardMaterial({ map: hc, roughness: 0.7, metalness: 0.3 });
      mesh(new THREE.BoxGeometry(0.09, 0.4, 0.37), coreMat, { parent: cr, pos: [RX - 0.0, 0.89, 0] });
      const fl = P(cool, 'מכסה ומילוי רדיאטור', 'Radiator cap', 'פליז', 'פקק פליז עם צוואר קצר. לפעמים חוסמים אותו במד־חום כנפיים (מוטומטר) שמראה לנהג אם המנוע מתחמם.');
      mesh(G.lathe([[0, 0.0], [0.028, 0.0], [0.03, 0.02], [0.022, 0.04], [0.024, 0.05], [0.0, 0.055]], 20, 'y'), BRASS, { parent: fl, pos: [RX - 0.02, 1.16, 0] });
      mesh(G.cyl(0.036, 0.036, 0.012, 20, 'y'), BRASSD, { parent: fl, pos: [RX - 0.02, 1.158, 0] });
      const dr = P(cool, 'ברז ניקוז (פטקוק)', 'Drain petcock', 'פליז', 'ברז קטן בתחתית הרדיאטור שמרוקנים בו את המים לפני חורף כדי שלא יקפאו.');
      put(G.cyl(0.008, 0.008, 0.04, 8, 'y'), BRASS, dr, [RX - 0.03, 0.64, 0.05]); put(G.box(0.03, 0.006, 0.008, 0.002), BRASS, dr, [RX - 0.03, 0.618, 0.05]);
      const st = P(cool, 'מוטות תמיכה לרדיאטור', 'Radiator stay rods', 'פלדה', 'שני מוטות שמחברים את הרדיאטור לראש המנוע. הם מונעים מהרדיאטור לנדנד על הקפיצים.');
      for (const s of [1, -1]) rod(st, [RX - 0.06, 1.0, s * 0.13], [1.34, 0.88, s * 0.1], 0.007, IRON);
      const hs = P(cool, 'צינורות גומי עליון ותחתון', 'Radiator hoses (upper & lower)', 'גומי מצולע + קולרי פליז', 'שני צינורות גומי: העליון מוביל מים חמים מראש המנוע, והתחתון מחזיר קרים. קולרי הפליז מהודקים בבורג.');
      rod(hs, [1.34, 0.88, 0.0], [RX - 0.08, 1.04, 0.0], 0.026, M.rubber());
      rod(hs, [1.38, 0.62, -0.2], [RX - 0.07, 0.72, -0.2], 0.02, M.rubber());
      for (const [a, b] of [[[1.37, 0.894, 0], [1.37, 0.894, 0]], [[RX - 0.1, 1.03, 0], 0]]) put(G.torus(0.032, 0.004, 6, 20, PI * 2, 'x'), BRASS, hs, a);
      const fan = P(cool, 'מאוורר ורצועה', 'Fan & belt', 'פלדה מצופה + רצועת עור', 'מאוורר ארבע להבים על רצועת עור שמסתובב מציר המנוע. זז רק כשהמנוע פועל.');
      const fanG = new THREE.Group(); fanG.position.set(1.50, 0.62, 0); fan.add(fanG);
      mesh(G.cyl(0.028, 0.028, 0.03, 16, 'x'), DSTEEL, { parent: fanG });
      for (let k = 0; k < 4; k++) { const b = mesh(G.box(0.01, 0.17, 0.05, 0.003, 1), M.metal(0x2a2b2e, 0.5), { parent: fanG, pos: [0, 0, 0] }); b.rotation.x = (k * PI) / 2; b.position.set(0, Math.cos(k * PI / 2) * 0.1, Math.sin(k * PI / 2) * 0.1); b.rotation.y = 0.35; }
      rod(fan, [1.40, 0.62, -0.02], [1.50, 0.62, -0.02], 0.004, STEEL);
      cool.userData.fan = fanG;
      ctxFan = fanG;
    }
    var ctxFan;
    // ================================================================== LIGHTS & HORN
    const lightsSys = sys('lights');
    const L = {};
    {
      L.head = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffe9a8, emissiveIntensity: 0.05, roughness: 0.1, transparent: true, opacity: 0.7 });
      L.kero = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa94d, emissiveIntensity: 0.05, roughness: 0.3, transparent: true, opacity: 0.65 });
      L.tail = new THREE.MeshStandardMaterial({ color: 0xc01010, emissive: 0xff2020, emissiveIntensity: 0.05, roughness: 0.2, transparent: true, opacity: 0.8 });
      const reflGeo = G.lathe([[0, -0.07], [0.03, -0.065], [0.06, -0.045], [0.085, -0.01], [0.092, 0.0]], 28, 'x');
      for (const s of [1, -1]) {
        const sH = sideHe(s), sE = sideEn(s);
        const hl = P(lightsSys, `פנס ראשי ${sH}`, `Headlamp ${sE}`, 'פליז + זכוכית + מחזיר מכסף', 'פנס חשמלי שמוזן מהמגנטו של המנוע (מ־1915): בעוצמת האור משתנה עם סיבובי המנוע, ולכן באיטיות הוא מחשיך. הטבעת העליונה נפתחת להחלפת הנורה.');
        hl.position.set(1.6, 0.98, s * 0.37);
        mesh(G.lathe([[0.105, -0.07], [0.108, -0.06], [0.1, -0.02], [0.1, 0.03], [0.109, 0.05], [0.112, 0.058]], 36, 'x'), BRASSD, { parent: hl, name: 'lamp drum' });
        mesh(G.torus(0.108, 0.007, 8, 40, PI * 2, 'x'), BRASS, { parent: hl, pos: [0.062, 0, 0], name: 'door rim' });
        mesh(new THREE.CircleGeometry(0.1, 36), L.head, { parent: hl, pos: [0.062, 0, 0], rot: [0, PI / 2, 0], name: 'lens' });
        mesh(reflGeo, M.reflector(), { parent: hl, pos: [0.0, 0, 0], name: 'reflector' });
        mesh(G.sphere(0.014, 12, 10), L.head, { parent: hl, pos: [-0.012, 0, 0], name: 'bulb' });
        put(G.cyl(0.006, 0.006, 0.03, 8, 'y'), BRASS, hl, [0.065, 0.108, 0]);
        rod(hl, [0, -0.1, 0], [-0.0, -0.205, s * -0.02], 0.014, BRASSD);
        put(G.cyl(0.03, 0.03, 0.012, 16, 'y'), BRASSD, hl, [0, -0.206, s * -0.02]);
        const sl = P(lightsSys, `מנורת צד ${sH} (נפט)`, `Side lamp ${sE} (oil)`, 'פליז + זכוכית', 'מנורת נפט קטנה ליד הקאול, עם פתיל ובד. נדלקת בגפרור מהצד ונותנת אור קלוש כדי שיראו את הרכב.');
        sl.position.set(0.84, 1.17, s * 0.62);
        mesh(G.lathe([[0, 0.0], [0.04, 0.0], [0.045, 0.01], [0.04, 0.03], [0.045, 0.1], [0.035, 0.16], [0.012, 0.18], [0.0, 0.2]], 20, 'y'), BRASSD, { parent: sl });
        mesh(G.cyl(0.03, 0.03, 0.09, 16, 'y'), L.kero, { parent: sl, pos: [0.03, 0.08, 0], name: 'chimney glass' });
        mesh(G.cyl(0.012, 0.016, 0.03, 10, 'y'), BRASS, { parent: sl, pos: [0, 0.213, 0] });
        rod(sl, [0, 0, 0], [0.0, -0.1, s * -0.04], 0.012, BRASSD);
      }
      const tl = P(lightsSys, 'פנס זנב (נפט)', 'Tail lamp (oil)', 'פליז + זכוכית אדומה', 'פנס נפט אחורי עם עדשה אדומה — לפני החשמל, הוא ההתראה היחידה לרכב שבא מאחור בלילה.');
      tl.position.set(-1.6, 0.98, -0.38);
      mesh(G.cyl(0.04, 0.045, 0.1, 16, 'x'), BRASSD, { parent: tl, pos: [-0.04, 0, 0] });
      mesh(G.sphere(0.034, 14, 10, 0, 0), L.tail, { parent: tl, pos: [-0.092, 0, 0] });
      put(G.cyl(0.006, 0.006, 0.24, 8, 'y'), IRON, tl, [0.0, -0.1, 0]);
      const hn = P(lightsSys, 'צופר בולב עם פעמון', 'Bulb horn', 'פליז + גומי', 'צפצוף בלחיצת כדור גומי: האוויר דוחף דרך קנה פליז מתפתל. ה״קלקסון״ באה בתור הבא.');
      mesh(G.sphere(0.04, 16, 12), M.rubber(), { parent: hn, pos: [0.4, 1.02, -0.65] });
      mesh(G.tube([V3(0.4, 1.02, -0.62), V3(0.46, 1.06, -0.63), V3(0.52, 1.1, -0.64), V3(0.58, 1.1, -0.66)], 0.012, 16, 8), BRASS, { parent: hn });
      mesh(G.lathe([[0.012, 0], [0.04, 0.08], [0.08, 0.18]], 20, 'x'), BRASS, { parent: hn, pos: [0.57, 1.09, -0.66], rot: [0, 0, 0.05] });
      const wr = P(lightsSys, 'חוטי חשמל לפנסים', 'Headlamp wiring', 'נחושת + בידוד בד', 'שני חוטי נחושת בבידוד בד שזורים מהמגנטו אל הפנסים הקדמיים דרך מתג.');
      for (const s of [1, -1]) mesh(G.tube([V3(0.88, 0.9, s * 0.1), V3(1.2, 0.86, s * 0.3), V3(1.5, 0.84, s * 0.34), V3(1.58, 0.92, s * 0.37)], 0.003, 24, 5), M.rubber(), { parent: wr });
    }
    K.toggle('lights', { he: 'פנסים', key: 'l', seconds: 0.4, night: true }, (t) => { L.head.emissiveIntensity = 0.05 + t * 4; L.kero.emissiveIntensity = 0.05 + t * 1.6; L.tail.emissiveIntensity = 0.05 + t * 2.2; });

    // ================================================================== DOORS (rear, hinged at the rear edge)
    const doorsSys = sys('doors');
    const doorList = [];
    for (const s of [1, -1]) {
      const sH = sideHe(s), sE = sideEn(s);
      const pv = V3(DOOR[0] + 0.004, 0, s * (BZ + 0.0));
      const door = P(doorsSys, `דלת אחורית ${sH}`, `Rear door ${sE}`, 'פלדה על שלד עץ + לכה', 'דלת אחורית היחידה שנפתחת בכל צד: צירי אחורה, פתיחה לכיוון החזית. הידית פנימית וחיצונית.');
      door.position.copy(pv);
      const sh = new THREE.Shape(); sh.moveTo(0.0, DY); sh.lineTo(DOOR[1] - DOOR[0] - 0.008, DY); sh.lineTo(DOOR[1] - DOOR[0] - 0.008, BELT + 0.02); sh.lineTo(0.0, BELT + 0.02); sh.closePath();
      mesh(G.extrude(sh, 0.02, { bevel: 0.002 }), BLACK, { parent: door, pos: [0, 0, 0] });
      const dh = P(door, `ידית דלת ${sH}`, `Door handle ${sE}`, 'פליז מצופה ניקל', 'ידית פליז קטנה בצורת מוט שמחזיקה את התפס. בלחיצה מרימים את התפס ופותחים.');
      put(G.cyl(0.008, 0.008, 0.07, 10, 'y'), M.satin(), dh, [DOOR[1] - DOOR[0] - 0.05, 0.93, s * 0.03]); put(G.cyl(0.02, 0.02, 0.006, 16, 'z'), M.satin(), dh, [DOOR[1] - DOOR[0] - 0.05, 0.93, s * 0.012]);
      for (const y of [0.78, 0.99]) { const hg = P(door, `ציר דלת ${sH} (${y > 0.9 ? 'עליון' : 'תחתון'})`, `Door hinge ${sE}`, 'פלדה מחושלת', 'ציר שרשרת עם ציר פלדה. הצירים מאחור כדי שהדלת תיסגר מעצמה בנסיעה קדימה.'); put(G.cyl(0.008, 0.008, 0.08, 10, 'y'), IRON, hg, [0, y, s * 0.012]); put(new THREE.BoxGeometry(0.1, 0.05, 0.006), IRON, hg, [0.04, y, s * 0.012]); }
      doorList.push({ door, s });
    }
    K.toggle('doors', { he: 'דלתות אחוריות', key: 'd', seconds: 1.4 }, (t) => { const e = Math.sin(t * PI / 2); for (const d of doorList) d.door.rotation.y = d.s * e * 1.3; });

    // ================================================================== INTERIOR
    const inter = sys('interior');
    const LEATH = M.leather(0x14110e);
    const seatBack = (xc, name, en) => {
      const sb = P(inter, name, en, 'עור מלאכותי + קפיצים + שיער סוס', 'משענת עם 20 כפתורי צביעה (טופטינג) ותפרים כפולים. מתחתיה קפיצי סליל וריפוד מהודק.');
      mesh(G.soft(0.1, 0.4, 1.1, { r: 0.04, seg: 6, deform: (p, n) => { p.x += Math.max(0, 1 - Math.abs(n.z)) * 0.01 * n.y; } }), [LEATH, LEATH, LEATH, LEATH, M.quilted(0x14110e, 'v', '#4a3d2c', 6), LEATH], { parent: sb, pos: [xc, 1.0, 0] });
      const btn = instances(G.sphere(0.006, 8, 6), M.black(), Array.from({ length: 18 }, (_, i) => ({ pos: [xc + 0.054, 0.9 + Math.floor(i / 6) * 0.1, -0.4 + (i % 6) * 0.16] })), { parent: sb, cast: false });
      return sb;
    };
    const cush = (xc, name, en, w) => {
      const c = P(inter, name, en, 'עור מלאכותי + קפיצים', 'כרית ישיבה על קפיצי סליל. מתחת נמצא מיכל הדלק (במושב הקדמי) או ארגז כלים (באחורי).');
      mesh(G.soft(w, 0.14, 1.08, { r: 0.05, seg: 6, deform: (p, n) => { p.y -= 0.012 * (1 - n.x * n.x) * (1 - n.z * n.z) * Math.max(0, n.y); } }), [LEATH, LEATH, M.quilted(0x14110e, 'u', '#4a3d2c', 5), LEATH, LEATH, LEATH], { parent: c, pos: [xc, FLOOR + 0.14 + 0.07, 0] });
      return c;
    };
    seatBack(-0.31, 'משענת מושב קדמי', 'Front seat back'); seatBack(-1.43, 'משענת מושב אחורי', 'Rear seat back');
    cush(-0.07, 'כרית מושב קדמי', 'Front seat cushion', 0.5); cush(-1.12, 'כרית מושב אחורי', 'Rear seat cushion', 0.58);
    {
      const sw = P(inter, 'הגה', 'Steering wheel', 'עץ שחור + ספיידר פליז', 'חישוק עץ בקוטר 40 ס״מ על ארבעה חישורי פלדה. במרכז ה״ספיידר״: ידיות ההצתה והמצערת.');
      sw.position.set(0.52, 1.12, -0.28); sw.rotation.z = -Math.atan2(0.78 - 1.12, 0.9 - 0.52) * -1; // wheel axis = column direction (forward-down, ~42°)
      const swg = new THREE.Group(); swg.rotation.y = PI / 2; sw.add(swg);
      mesh(G.torus(0.19, 0.016, 12, 56), woodDark, { parent: swg });
      for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; rod(swg, [Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0], [Math.cos(a) * 0.185, Math.sin(a) * 0.185, 0], 0.006, M.darkSteel()); }
      mesh(G.cyl(0.03, 0.03, 0.03, 20, 'z'), BRASS, { parent: swg });
      const sp = P(inter, 'ידיות צינור: הצתה ומצערת', 'Spark & throttle levers', 'פליז + פלדה', 'שתי ידיות קטנות מתחת להגה: משמאל מקדמים את ההצתה, מימין נותנים גז. בלי דוושת גז!');
      sp.position.set(0.52, 1.12, -0.28); sp.rotation.z = sw.rotation.z;
      const spg = new THREE.Group(); spg.rotation.y = PI / 2; sp.add(spg);
      mesh(G.torus(0.074, 0.003, 6, 24, PI, 'z'), BRASS, { parent: spg, pos: [0, 0, 0.03], rot: [0, 0, PI] });
      rod(spg, [0, 0, 0.03], [0.05, -0.08, 0.03], 0.003, BRASS); rod(spg, [0, 0, 0.03], [-0.05, -0.08, 0.03], 0.003, BRASS);
      const col = P(inter, 'עמוד היגוי', 'Steering column', 'צינור פלדה + מנשא', 'צינור פלדה מוליך את תנועת ההגה אל תיבת ההיגוי הקטנה. יציאתו מהקיר היא בזווית של 45°.');
      rod(col, [0.52, 1.12, -0.28], [0.9, 0.78, -0.28], 0.015, DSTEEL);
      // pedals
      const pd = P(inter, 'שלוש דוושות', 'Three pedals', 'פלדה + גומי', 'שמאלית: שני הילוכים (לחיצה: איטי, שחרור: מהיר). אמצעית: אחורה. ימנית: בלם. אין דוושת גז, ואין מצמד רגיל.');
      for (const [z, c] of [[-0.18, 0x222222], [-0.08, 0x222222], [0.02, 0x222222]]) { rod(pd, [0.64, 0.7, z], [0.62, 0.78, z], 0.008, DSTEEL); put(G.box(0.07, 0.01, 0.06, 0.004), M.matte(0x8c1a1a), pd, [0.61, 0.795, z]); }
      for (const [z, t] of [[-0.18, 'C'], [-0.08, 'R'], [0.02, 'B']]) { const tx = K.textTexture(t, { font: '700 100px Arial', color: '#e9d9a0', pad: 4 }); mesh(new THREE.PlaneGeometry(0.03, 0.03), M.decal(tx.tex), { parent: pd, pos: [0.61, 0.802, z], rot: [-PI / 2, 0, 0], cast: false }); }
      const hb = P(inter, 'ידית בלם יד (ילוך)', 'Hand lever', 'פלדה + ידית', 'ידית שמאלית ארוכה: מושכים אחורה — מבלמים ומכניסים ניוטרל. דוחפים קדימה — ילוך מהיר.');
      rod(hb, [0.44, FLOOR + 0.02, -0.52], [0.34, 1.0, -0.52], 0.01, DSTEEL); put(G.sphere(0.022, 12, 10), M.matte(0x222222), hb, [0.34, 1.02, -0.52]);
      put(new THREE.BoxGeometry(0.01, 0.1, 0.01), STEEL, hb, [0.44, FLOOR + 0.03, -0.505]);
      const fm = P(inter, 'שטיח רצפה', 'Floor mat', 'גומי', 'שטיח גומי שחור עם הכיתוב Ford בבליטה.');
      const ft = K.textTexture('Ford', { font: 'italic 700 150px "Brush Script MT","URW Chancery L",cursive', color: '#2a2a2c', bg: '#0e0e0f', pad: 12 });
      mesh(new THREE.PlaneGeometry(0.34, 0.34 / ft.aspect), M.decal(ft.tex, { roughness: 0.9, clearcoat: 0 }), { parent: fm, pos: [0.48, FLOOR + 0.0075, 0.25], rot: [-PI / 2, 0, -PI / 2], cast: false });
      const rr = P(inter, 'מסילת שמיכה וחגורה', 'Robe rail & foot rail', 'פליז', 'מוט פליז מאחורי המושב הקדמי להחזקת שמיכת צמר; נחוצה בחורף כי לטוריסט אין חימום.');
      rod(rr, [-0.36, 0.88, -0.55], [-0.36, 0.88, 0.55], 0.009, BRASS);
      for (const s of [-0.55, 0.55]) rod(rr, [-0.36, 0.88, s], [-0.34, 0.82, s], 0.007, BRASS);
      // dash fittings
      const ig = P(inter, 'מתג הצתה ומד זרם', 'Ignition switch & ammeter', 'פליז + בקליט', 'במרכז הקיר: מתג עם מפתח, ומד קטן שמראה אם המגנטו או הסוללה פועלים. אין מד מהירות.');
      const am = K.textTexture('AMP', { font: '700 100px Arial', color: '#e9d9a0', bg: '#16130e', pad: 8 });
      put(G.cyl(0.04, 0.04, 0.01, 24, 'x'), BRASS, ig, [0.868, 1.0, 0.04]); mesh(new THREE.CircleGeometry(0.032, 24), new THREE.MeshStandardMaterial({ map: am.tex }), { parent: ig, pos: [0.862, 1.0, 0.04], rot: [0, -PI / 2, 0] });
      put(G.box(0.1, 0.07, 0.01, 0.003), BRASSD, ig, [0.87, 0.9, -0.12]); put(G.cyl(0.012, 0.012, 0.012, 12, 'x'), STEEL, ig, [0.862, 0.9, -0.12]);
      const ck = P(inter, 'כפתור חנק', 'Choke wire pull', 'חוט פלדה + ידית', 'חוט שמושך את חסם האוויר ליד הקרבורטור: לחיצה מחזירה אותו. כדי להתניע בקור.');
      mesh(G.tube([V3(0.87, 0.88, 0.14), V3(0.7, 0.8, 0.14), V3(0.4, 0.74, 0.3)], 0.002, 12, 4), M.rubber(), { parent: ck }); put(G.sphere(0.012, 8, 6), M.matte(0x222222), ck, [0.866, 0.88, 0.14]);
    }

    // ================================================================== WINDSHIELD + TOP
    const topSys = sys('top');
    {
      const WX = 0.78, WB = 1.19;
      const ws = P(topSys, 'שמשת רוח (שתי חלקים)', 'Windshield assembly', 'פלדה צבועה + זכוכית', 'שמשה דו־חלקית: הקדמית התחתונה קבועה, והעליונה מתקפלת קדימה כדי לנהוג עם רוח בפנים. מסגרת פלדה עם צירי פליז.');
      const lowerG = M.glass(0x203038, 0.35);
      mesh(G.box(0.012, 0.22, 1.02, 0.002, 1), lowerG, { parent: ws, pos: [WX, WB + 0.12, 0] });
      for (const s of [1, -1]) { rod(ws, [WX, WB, s * 0.53], [WX - 0.04, WB + 0.5, s * 0.53], 0.011, BRASS); put(G.box(0.03, 0.03, 0.03, 0.005), BRASS, ws, [WX, WB + 0.01, s * 0.53]); }
      put(new THREE.BoxGeometry(0.02, 0.016, 1.06), BLACK, ws, [WX, WB + 0.01, 0]); put(new THREE.BoxGeometry(0.02, 0.016, 1.06), BLACK, ws, [WX - 0.005, WB + 0.235, 0]);
      const up = new THREE.Group(); up.position.set(WX - 0.005, WB + 0.235, 0); ws.add(up);
      mesh(G.box(0.012, 0.22, 1.02, 0.002, 1), lowerG, { parent: up, pos: [0, 0.12, 0] });
      for (const z of [-0.51, 0.51]) put(new THREE.BoxGeometry(0.02, 0.24, 0.016), BLACK, up, [0, 0.12, z]);
      put(new THREE.BoxGeometry(0.02, 0.016, 1.06), BLACK, up, [-0.0, 0.24, 0]);
      K.toggle('windshield', { he: 'שמשה עליונה', key: 'w', seconds: 1.0 }, (t) => { up.rotation.z = -t * 1.45; });
      const wp = P(topSys, 'מגב ידני', 'Hand wiper', 'פליז + גומי', 'מגב קטן שמסובבים ביד, ללא מנוע — הנהג מנגב את הזכוכית בעצמו בנסיעה בגשם.');
      rod(wp, [WX + 0.01, WB + 0.3, 0.05], [WX + 0.01, WB + 0.3, 0.35], 0.004, M.rubber()); put(G.sphere(0.012, 8, 6), BRASS, wp, [WX + 0.01, WB + 0.26, 0.05]);
    }
    // top: bows fold back like a fan; canopy scales away to a bundle behind the rear seat
    const topG = new THREE.Group(); topSys.add(topG);
    const bowPivots = [[0.62, 1.2], [-0.15, 1.2], [-0.78, 1.2], [-1.38, 1.2]];
    const bows = [];
    const crown = tableFn([[0.62, 1.68], [0.3, 1.74], [-0.2, 1.8], [-0.8, 1.82], [-1.2, 1.8], [-1.42, 1.72]]);
    {
      bowPivots.forEach(([bx, by], i) => {
        const b = P(topSys, `קשת גג ${i + 1}`, `Top bow ${i + 1}`, 'פלדה צינורית + עץ', i === 0 ? 'הקשת הקדמית (הדר) נקשרת לשמשה בשתי תפסים. בין הקשתות מתוח הבד.' : 'קשת פלדה מתקפלת על ציר ברזל בגוף המכונית. כשמקפלים אותן הן נערמות כמניפה.');
        b.position.set(bx, by - 0.14 + 0.03 * i, 0);
        const bg = new THREE.Group(); bg.userData.i = i; b.add(bg);
        const top = crown(bx), lean = -0.06;
        const pts = [V3(0, 0, -0.6), V3(lean, 0.35, -0.61), V3(lean - 0.01, top - by + 0.14 - 0.06, -0.58), V3(lean - 0.01, top - by + 0.14, -0.3), V3(lean - 0.01, top - by + 0.14 + 0.01, 0), V3(lean - 0.01, top - by + 0.14, 0.3), V3(lean - 0.01, top - by + 0.14 - 0.06, 0.58), V3(lean, 0.35, 0.61), V3(0, 0, 0.6)];
        mesh(G.tube(pts, 0.011, 60, 8), M.darkSteel(), { parent: bg });
        for (const z of [-0.6, 0.6]) { put(G.cyl(0.02, 0.02, 0.03, 12, 'z'), BRASS, bg, [0, 0, z * 1.0]); put(G.box(0.08, 0.03, 0.04, 0.005), IRON, bg, [-0.0, -0.01, z * 0.98]); }
        bows.push({ b, bg, i, bx, by });
      });
      const cv = P(topSys, 'בד הגג', 'Canopy fabric', 'בד כותנה מגומם', 'שכבת בד אטומה למים מעל שכבת בד פנימית. הבד מתוח בתפרים מקבילים על הקשתות.');
      const cg = new THREE.Group(); cg.position.set(-1.38, 1.06, 0); cv.add(cg);
      const xs = []; for (let i = 0; i <= 24; i++) xs.push(lerp(0.66, -1.46, i / 24));
      const rings = xs.map((x) => { const top = crown(x) + 0.01; return Array.from({ length: 17 }, (_, j) => { const u = j / 16 * 2 - 1; const edge = Math.abs(u); const y = top - 0.05 - Math.pow(edge, 4) * 0.0 + 0.0 - (edge > 0.95 ? (edge - 0.95) * 2 : 0); return V3(x + 1.38, y - 1.06 + 0.02, u * 0.64); }); });
      mesh(loft(rings), fabricTop, { parent: cg });
      // side valance + rear flap
      const vS = []; for (const s of [1, -1]) { const g = loft([xs.map((x) => V3(x + 1.38, crown(x) - 0.06 - 1.06 + 0.02 - 0.0, s * 0.64)), xs.map((x) => V3(x + 1.38, crown(x) - 0.2 - 1.06, s * 0.64))]); vS.push(g); mesh(g, fabricTop, { parent: cg }); }
      const rear = loft([Array.from({ length: 11 }, (_, j) => V3(0.04 - 0.0, crown(-1.42) - 0.06 - 1.06 + 0.02, (j / 10 * 2 - 1) * 0.64)), Array.from({ length: 11 }, (_, j) => V3(-0.1, 0.12 - 0.02, (j / 10 * 2 - 1) * 0.6))]);
      mesh(rear, fabricTop, { parent: cg });
      const rw = P(topSys, 'חלון אחורי (איזינגלס)', 'Rear window (isinglass)', 'סלולואיד שקוף', 'חלון קטן מפלסטיק שקוף (איזינגלס) בבד האחורי, המאפשר לנהג לראות מאחור. נהיה צהוב עם השנים.');
      mesh(G.box(0.004, 0.18, 0.4, 0.002, 1), M.glass(0x2a3a3c, 0.45), { parent: rw, pos: [-1.5, 1.52, 0], rot: [0, 0, 0.18] });
      const rest = P(topSys, 'מסדר קפל (מנוחת גג)', 'Top rest & straps', 'עור + פליז', 'שלוש רצועות עור מחזיקות את הגג המקופל כדי שלא יקרוס ברוח.');
      for (const z of [-0.45, 0, 0.45]) put(new THREE.BoxGeometry(0.02, 0.01, 0.06), M.leather(0x2b2218), rest, [-1.2, 1.1, z]);
      const props = P(topSys, 'מוטות תמיכה אחוריים', 'Rear top props', 'פלדה צינורית', 'שני מוטות שמחזיקים את הגג כשהוא מורם ונגררים אל הכנפיים האחוריות.');
      for (const s of [1, -1]) rod(props, [-1.4, 1.62, s * 0.6], [-1.45, 0.82, s * 0.62], 0.008, DSTEEL);
      // side curtains
      const curt = new THREE.Group(); topSys.add(curt);
      const sc = P(topSys, 'וילונות צד (איזינגלס)', 'Side curtains', 'בד מגומם + איזינגלס', 'וילונות נשלפים עם חלון שקוף, ננעלים בלחצנים למסגרת. הם מגנים מהגשם אבל מקשים לצאת.');
      curt.add(sc);
      for (const s of [1, -1]) for (const [x0, x1] of [[-1.38, -0.44], [-0.4, 0.58]]) {
        put(new THREE.BoxGeometry(x1 - x0, 0.46, 0.006), fabricTop, sc, [(x0 + x1) / 2, 1.38, s * 0.645]);
        put(new THREE.BoxGeometry((x1 - x0) * 0.6, 0.22, 0.008), M.glass(0x2a3a3c, 0.4), sc, [(x0 + x1) / 2, 1.4, s * 0.649]);
      }
      curt.visible = false;
      let topT = 0, curT = 0;
      const upd = () => { const sx = 0.12 + 0.88 * topT, sy = 0.1 + 0.9 * topT; cg.scale.set(sx, sy, 1); rw.visible = topT > 0.5; rest.visible = topT < 0.5; props.visible = topT > 0.5; curt.scale.y = Math.max(0.001, curT * topT); curt.position.y = (1 - curt.scale.y) * 1.62; curt.visible = curT * topT > 0.02;
        for (const o of bows) { const fold = 1 - topT; o.bg.rotation.z = -fold * (1.42 + 0.03 * o.i) ; }
      };
      K.toggle('top', { he: 'גג מתקפל', key: 't', seconds: 1.8 }, (t) => { topT = Math.sin(t * PI / 2); upd(); });
      K.toggle('curtains', { he: 'וילונות צד', key: 'v', seconds: 1.0 }, (t) => { curT = t; upd(); });
    }

    // ================================================================== CHASSIS
    const ch = sys('chassis');
    {
      // frame rails (C channels) + cross-members
      for (const s of [1, -1]) {
        const fr = P(ch, `אורך שלדה ${sideHe(s)}`, `Frame rail ${sideEn(s)}`, 'פלדת ונדיום מכופפת', 'קורת C מפלדת ונדיום: קלה וחזקה בהפתעה. הנרי פורד גילה את הפלדה בחלקי מירוץ צרפתיים, ובזכותה השלדה קלה ב־30%.');
        const L = 3.12, cx = 0.04, z = s * 0.36;
        put(new THREE.BoxGeometry(L, 0.11, 0.005), IRON, fr, [cx, FRAME_Y, z]);
        put(new THREE.BoxGeometry(L, 0.005, 0.055), IRON, fr, [cx, FRAME_Y + 0.0525, z - s * 0.025]); put(new THREE.BoxGeometry(L, 0.005, 0.055), IRON, fr, [cx, FRAME_Y - 0.0525, z - s * 0.025]);
        const rv = []; for (let i = 0; i < 40; i++) rv.push({ pos: [-1.5 + i * 0.075, FRAME_Y + (i % 2 ? 0.035 : -0.035), z + s * 0.003], rot: [PI / 2 * 0 + (s > 0 ? PI / 2 : -PI / 2), 0, 0] });
        rivets(fr, rv, 0.0045);
      }
      const cm = P(ch, 'קורות רוחב (5)', 'Cross-members (×5)', 'פלדה מכופפת + ניטים', 'חמש קורות שמחברות את שני האורכים ונושאות את המנוע, התמסורת והקפיצים. מסומרות בניטים חמים.');
      for (const x of [1.46, 0.98, 0.5, -0.4, -1.5]) { put(new THREE.BoxGeometry(0.06, 0.08, 0.76), IRON, cm, [x, FRAME_Y + (x > 1.4 ? 0.03 : 0), 0]); }
      // front axle: dropped I-beam
      const AY = (z) => 0.37 + 0.11 * Math.pow(Math.abs(z) / 0.64, 2);
      const ax = P(ch, 'ציר קדמי (קורת I)', 'Front axle (I-beam)', 'פלדת ונדיום מחושלת', 'קורת I מחושלת, מקופלת כלפי מטה במרכז כדי לעבור מתחת למנוע, והקצוות הפונים כלפי מעלה מחזיקים את הציפורנים.');
      for (let i = 0; i < 16; i++) { const z0 = -0.64 + i * 0.08, z1 = z0 + 0.08, d = V3(0, AY(z1) - AY(z0), 0.08), len = d.length(); const g = G.merge([new THREE.BoxGeometry(0.008, 0.05, len), G.at(new THREE.BoxGeometry(0.034, 0.008, len), [0, 0.022, 0]), G.at(new THREE.BoxGeometry(0.034, 0.008, len), [0, -0.022, 0])]); const m = mesh(g, IRON, { parent: ax }); m.position.set(AXF, (AY(z0) + AY(z1)) / 2, (z0 + z1) / 2); m.rotation.x = -Math.atan2(d.y, d.z); }
      for (const s of [1, -1]) {
        const sp = P(ch, `ציפורן היגוי ${sideHe(s)}`, `Steering spindle ${sideEn(s)}`, 'פלדה מחושלת', 'בולט שפונה החוצה: עליו נסמך הגלגל. הוא מסתובב על ציר אנכי (קינגפין) כשהנהג מפנה את ההגה.');
        put(G.cyl(0.025, 0.02, 0.1, 14, 'z'), STEEL, sp, [AXF, TR, s * 0.62]);
        put(G.cyl(0.015, 0.015, 0.15, 10, 'y'), DSTEEL, sp, [AXF, TR + 0.03, s * 0.58]); put(G.cyl(0.026, 0.026, 0.02, 12, 'y'), BRASS, sp, [AXF, TR + 0.105, s * 0.58]);
        rod(sp, [AXF - 0.0, TR + 0.0, s * 0.58], [AXF - 0.12, TR + 0.03, s * 0.64], 0.011, IRON);
      }
      const tr = P(ch, 'מוט חיבור (טיירוד)', 'Tie rod', 'פלדה', 'מוט שמחבר את שני ציפורני הגלגלים כדי שיתכנסו יחד. אורכו נקבע בכיוון הידיני.');
      rod(tr, [AXF - 0.12, TR + 0.03, -0.64], [AXF - 0.12, TR + 0.03, 0.64], 0.011, IRON); for (const s of [1, -1]) put(G.sphere(0.017, 10, 8), STEEL, tr, [AXF - 0.12, TR + 0.03, s * 0.64]);
      const dl = P(ch, 'מוט היגוי (דראג־לינק)', 'Drag link', 'פלדה', 'מוט ארוך מזרוע פיטמן בתיבת ההיגוי אל הציפורן השמאלי, שדרכו הכיוון עובר לשני הגלגלים.');
      rod(dl, [0.93, 0.66, -0.3], [AXF - 0.12, TR + 0.03, -0.64], 0.01, IRON); put(G.sphere(0.014, 8, 6), STEEL, dl, [0.93, 0.66, -0.3]);
      const sgh = P(ch, 'תיבת היגוי פלנטרית', 'Planetary steering gear', 'ברזל יצוק + גלגלי שיניים', 'תיבה מוגנת שבה גלגלי שיניים פלנטריים מגדילים את כוח הנהג. בולטת ליד קיר האש.');
      put(G.cyl(0.05, 0.05, 0.1, 20, 'z'), CAST, sgh, [0.93, 0.76, -0.28]); put(G.cyl(0.03, 0.03, 0.1, 16, 'y'), CAST, sgh, [0.93, 0.7, -0.3]);
      bolts(sgh, Array.from({ length: 6 }, (_, k) => ({ pos: [0.93 + Math.cos(k * 1.047) * 0.04, 0.76 + Math.sin(k * 1.047) * 0.04, -0.328], rot: [PI / 2, 0, 0] })), 0.004);
      // springs
      const leafSpring = (parent, cx, y0, n, span, thick, name) => {
        const g = new THREE.Group(); parent.add(g);
        for (let i = 0; i < n; i++) { const L = span * (1 - i * 0.13), pts = []; for (let k = 0; k <= 16; k++) { const u = (k / 16) * 2 - 1; pts.push(V3(0, y0 + 0.07 * (1 - u * u) - i * thick - 0.02 * Math.abs(u) * (i * 0.5), u * L)); } mesh(G.tube(pts, thick * 0.5, 30, 5), M.metal(0x2a2c30, 0.4), { parent: g, pos: [cx, 0, 0], scale: [3.2, 1, 1] }); }
        return g;
      };
      const fs = P(ch, 'קפיץ עלים קדמי (רוחבי)', 'Front transverse leaf spring', 'פלדת קפיצים, 6 עלים', 'קפיץ אחד לרוחב המכונית: מרכזו קבוע לקורת הרוחב, וקצותיו תלויים בשקליים על הציר. פשוט וזול — ודי נוח בכבישי עפר.');
      leafSpring(fs, 1.40, 0.62, 6, 0.52, 0.012, 'front');
      const cl = P(ch, 'מהדקי קפיץ (U) וכרית', 'Spring clips', 'פלדה', 'שתי חבקות U שמהדקות את צרור העלים. בין עלים משמנים גרפיט.');
      for (const z of [-0.04, 0.04]) put(G.torus(0.04, 0.005, 6, 16, PI, 'z'), STEEL, cl, [1.40, 0.7, z]);
      for (const s of [1, -1]) { const sh = P(ch, `שקליים קדמי ${sideHe(s)}`, `Front shackle ${sideEn(s)}`, 'פלדה', 'חוליית צירים שמחברת את קצה הקפיץ לציר ונותנת לו לנוע כשהקפיץ מתכופף.'); rod(sh, [1.40, 0.62 - 0.015, s * 0.52], [AXF + 0.0, 0.46, s * 0.56], 0.007, DSTEEL); }
      const rs = P(ch, 'קפיץ אחורי', 'Rear transverse leaf spring', 'פלדת קפיצים, 7 עלים', 'קפיץ רוחבי מאחור, שמחובר בשקליים לצירי העגלה ולקורה האחורית.');
      leafSpring(rs, -1.5, 0.58, 7, 0.52, 0.012, 'rear');
      for (const s of [1, -1]) { const sh = P(ch, `שקליים אחורי ${sideHe(s)}`, `Rear shackle ${sideEn(s)}`, 'פלדה', 'שקליים אחורי שמעביר את משקל הרכב לקפיץ ולציר.'); rod(sh, [-1.5, 0.58, s * 0.5], [AXR - 0.02, 0.42, s * 0.46], 0.007, DSTEEL); }
      const wb = P(ch, 'מוטות רדיוס (חץ V)', 'Radius rods (wishbone)', 'פלדה מחושלת', 'שני מוטות בצורת V מהציר הקדמי אל כדור המצמד מאחורי המנוע — הם מונעים מהציר להתקדם או לסטות.');
      for (const s of [1, -1]) rod(wb, [AXF + 0.04, 0.4, s * 0.4], [0.94, 0.48, 0.0], 0.012, IRON);
      put(G.sphere(0.04, 14, 10), CAST, wb, [0.9, 0.48, 0]);
      // rear axle housing + brakes
      const rax = P(ch, 'בית ציר אחורי', 'Rear axle housing', 'פלדה מעוצבת', 'שני חצאי צינור מוברגים באמצע. בתוכו עוברים שני סרנים עם נעילה למנוע.');
      rod(rax, [AXR, TR, -0.5], [AXR, TR, 0.5], 0.038, M.metal(0x2a2c30, 0.55)); put(G.cyl(0.05, 0.05, 0.1, 18, 'z'), CAST, rax, [AXR, TR, -0.44]); put(G.cyl(0.05, 0.05, 0.1, 18, 'z'), CAST, rax, [AXR, TR, 0.44]);
      for (const s of [1, -1]) {
        const bd = P(ch, `תוף בלם חירום ${sideHe(s)}`, `Emergency brake drum ${sideEn(s)}`, 'ברזל יצוק + בטנה', 'תוף שמאוגד לנאב האחורי, בתוכו שני לבני בלימה כשמושכים את ידית היד.');
        put(G.cyl(0.14, 0.14, 0.06, 32, 'z'), CAST, bd, [AXR, TR, s * 0.62]);
        put(G.torus(0.14, 0.008, 8, 32, PI * 2, 'z'), M.darkSteel(), bd, [AXR, TR, s * 0.65]);
        put(G.cyl(0.115, 0.115, 0.05, 28, 'z'), M.matte(0x7a5a2c), bd, [AXR, TR, s * 0.62]);
        put(new THREE.BoxGeometry(0.08, 0.02, 0.04), IRON, bd, [AXR - 0.1, TR - 0.1, s * 0.6]);
      }
      const brr = P(ch, 'מוטות בלם', 'Brake rods', 'פלדה', 'מוטות אחרוני שמעבירים את תנועת הידית הלתונה אל לבני התוף.');
      rod(brr, [0.4, 0.62, -0.5], [-0.4, 0.5, -0.5], 0.007, IRON); rod(brr, [-0.4, 0.5, -0.5], [AXR, 0.43, -0.6], 0.007, IRON); rod(brr, [-0.4, 0.5, -0.5], [AXR, 0.43, 0.6], 0.007, IRON);
      const pe = P(ch, 'תושבות כנפיים תחתונות', 'Splash aprons', 'פלדה דקה', 'לוחות פח מתחת לפנימיות הכנפיים שמגינים על המנוע מבוץ.');
      for (const s of [1, -1]) put(new THREE.BoxGeometry(0.5, 0.004, 0.2), SHEET, pe, [1.27, 0.62, s * 0.28]);
    }

    // ================================================================== ENGINE
    const eng = sys('engine');
    const CY = 0.62, CX = [1.31, 1.205, 1.1, 0.995];   // crank axis height, cylinder x
    const moving = { pistons: [], rods: [], crank: null, flywheels: [] };
    {
      const bl = P(eng, 'בלוק מנוע (יצוק כיחידה)', 'Cylinder block', 'ברזל יצוק', 'ארבעת הצילינדרים וחצי גוף האיטום נוצקו בחתיכה אחת — חידוש של פורד ב־1908. הראש (קדמי) נפרד, כך שאפשר לצחצח בוכנות בלי לפרק את כל המנוע.');
      mesh(new THREE.BoxGeometry(0.46, 0.32, 0.24), CAST, { parent: bl, pos: [1.15, 0.7, 0] });
      for (const x of CX) mesh(G.cyl(0.05, 0.05, 0.05, 20, 'y'), M.darkSteel(), { parent: bl, pos: [x, 0.86, 0] });
      const pan = P(eng, 'אגן שמן', 'Crankcase pan', 'פלדה לחוצה', 'אגן פח שמחזיק כ־2 ליטר שמן. השמן אינו נשאב — הגלגל התנופה מרסס אותו ברחבי המנוע.');
      mesh(G.box(0.5, 0.1, 0.3, 0.02), M.darkSteel(), { parent: pan, pos: [1.15, 0.5, 0] });
      put(G.cyl(0.012, 0.012, 0.02, 8, 'y'), STEEL, pan, [1.15, 0.445, 0]);
      for (const z of [-0.12, 0.12]) put(G.cyl(0.008, 0.008, 0.03, 8, 'x'), BRASS, pan, [1.37, 0.52, z]);
      const hd = P(eng, 'ראש צילינדרים', 'Cylinder head', 'ברזל יצוק', 'מכסה כל ארבעת הצילינדרים: נתיבי הצתה, תעלות מים, וארבעה חורי מצתים. מחובר ב־15 ברגים וטבעת אוטם.');
      mesh(new THREE.BoxGeometry(0.46, 0.07, 0.24), CAST, { parent: hd, pos: [1.15, 0.9, 0] });
      bolts(hd, Array.from({ length: 15 }, (_, i) => ({ pos: [0.96 + (i % 5) * 0.09 + (i >= 5 ? 0.0 : 0.0), 0.94, (Math.floor(i / 5) - 1) * 0.085], rot: [0, 0, 0] })), 0.008, STEEL);
      const gk = P(eng, 'אטם ראש', 'Head gasket', 'אסבסט + נחושת', 'שכבה דקה בין הראש לבלוק שמונעת דליפת גזי שריפה ומים.');
      put(new THREE.BoxGeometry(0.46, 0.004, 0.24), M.matte(0xa59377), gk, [1.15, 0.865, 0]);
      const vc = P(eng, 'כיסוי שסתומים (צד)', 'Valve cover plate', 'פח', 'לוחית פח בצד המנוע שמכסה את השסתומים ובולי הדחיפה, מוחזקת בקפיץ.');
      put(new THREE.BoxGeometry(0.4, 0.1, 0.006), M.darkSteel(), vc, [1.15, 0.75, -0.123]);
      const tc = P(eng, 'כיסוי גלגלי תזמון', 'Timing gear cover', 'פח לחוץ', 'מאחורי הכיסוי הקדמי יושבים גלגלי השיניים שמסנכרנים את גל הארכובה וגל זיזים (כשהמנוע פועל).');
      put(G.cyl(0.11, 0.11, 0.05, 28, 'x'), M.darkSteel(), tc, [1.4, 0.62, 0]); bolts(tc, Array.from({ length: 8 }, (_, k) => ({ pos: [1.428, 0.62 + Math.sin(k * 0.785) * 0.09, Math.cos(k * 0.785) * 0.09], rot: [0, 0, -PI / 2] })), 0.005);
      const ct = P(eng, 'ציר התנעה ידית', 'Starting crank', 'פלדה + ידית עץ', 'הידית שמסובבים בחזית כדי להתניע. מסוכן: הנפילה לאחור יכולה לשבור את פרק היד, ולכן מחזיקים את האגודל בצד.');
      rod(ct, [1.45, 0.62, 0], [1.78, 0.62, 0], 0.012, DSTEEL); rod(ct, [1.78, 0.62, 0], [1.78, 0.5, 0], 0.011, DSTEEL); put(G.cyl(0.017, 0.017, 0.1, 12, 'z'), woodNat, ct, [1.78, 0.5, 0.0]);
      put(G.cyl(0.02, 0.02, 0.02, 14, 'x'), BRASS, ct, [1.7, 0.62, 0]);
      // internals (visible in the cutaway)
      const pg = P(eng, 'בוכנות ומוטות חיבור (4)', 'Pistons & connecting rods (×4)', 'ברזל יצוק + פלדה', 'ארבע בוכנות נעות בשרשרת. סדר ההצתה 1־2־4־3. כל בוכנה עוברת בשלב הצתה, בשלב פליטה ובשני המהלכים האחרים.');
      const ccrank = P(eng, 'גל ארכובה ומשקלים', 'Crankshaft & counterweights', 'פלדה מחושלת', 'גל שלוש מסבים (בדרך כלל חמשה בכלי מודרני). המשקל הנגדי מאזן את תנועות הבוכנה.');
      const cg = new THREE.Group(); ccrank.add(cg); moving.crank = cg;
      mesh(G.cyl(0.02, 0.02, 0.5, 16, 'x'), STEEL, { parent: ccrank, pos: [1.15, CY, 0] });
      CX.forEach((x, i) => { const th = [0, PI, PI, 0][i]; mesh(G.cyl(0.018, 0.018, 0.04, 12, 'x'), STEEL, { parent: cg, pos: [x, CY + Math.cos(th) * 0.0508, Math.sin(th) * 0.0508] }); mesh(G.cyl(0.06, 0.06, 0.012, 20, 'x'), IRON, { parent: cg, pos: [x - 0.04, CY - Math.cos(th) * 0.04, -Math.sin(th) * 0.04] }); });
      const rGeo = G.box(0.014, 0.14, 0.014, 0.003, 1);
      CX.forEach((x, i) => { const p = mesh(G.cyl(0.046, 0.046, 0.07, 20, 'y'), M.castAlu(), { parent: pg }); const r = mesh(rGeo, STEEL, { parent: pg }); moving.pistons.push({ p, r, x, th0: [0, PI, PI, 0][i] }); });
      const cam = P(eng, 'גל זיזים ושסתומים (8)', 'Camshaft, valves & lifters', 'פלדה מחושלת', 'גל זיזים אחד לפתוח ולסגור שמונה שסתומים (שניים לכל צילינדר). בשנת 1908 זה היה חידוש.');
      mesh(G.cyl(0.012, 0.012, 0.48, 10, 'x'), STEEL, { parent: cam, pos: [1.15, 0.7, -0.07] });
      for (const x of CX) for (const dz of [-0.05, 0.05]) { put(G.cyl(0.004, 0.004, 0.12, 6, 'y'), STEEL, cam, [x + dz * 0.0, 0.76, dz * 1.1 - 0.0]); put(G.cyl(0.015, 0.004, 0.01, 10, 'y'), STEEL, cam, [x, 0.82, dz * 1.1]); }
      const fw = P(eng, 'גלגל תנופה עם מגנטים', 'Flywheel with magnets', 'ברזל יצוק + 16 מגנטים', 'גלגל כבד על גל הארכובה שמאחסן אנרגיה. עליו 16 מגנטים שמסובבים ליד סלילים וכך יוצרים חשמל להצתה. ללא סוללה!');
      const fwg = new THREE.Group(); fw.add(fwg); moving.flywheels.push(fwg);
      mesh(G.cyl(0.18, 0.18, 0.04, 36, 'x'), CAST, { parent: fwg, pos: [0.86, CY, 0] });
      instances(new THREE.BoxGeometry(0.03, 0.02, 0.03), M.matte(0x6b1d1d), Array.from({ length: 16 }, (_, k) => { const a = k / 16 * PI * 2; return { pos: [0.835, CY + Math.cos(a) * 0.165, Math.sin(a) * 0.165], rot: [-a, 0, 0] }; }), { parent: fwg });
      const mg = P(eng, 'סלילי מגנטו (16)', 'Magneto coil ring (×16)', 'נחושת + ברזל', 'טבעת קבועה עם 16 סלילים מול המגנטים. כשהגלגל מסתובב הם מייצרים זרם חילופין של כ־30 וולט.');
      instances(G.cyl(0.012, 0.012, 0.03, 8, 'x'), M.copper(), Array.from({ length: 16 }, (_, k) => { const a = k / 16 * PI * 2; return { pos: [0.82, CY + Math.cos(a) * 0.14, Math.sin(a) * 0.14] }; }), { parent: mg });
      put(G.cyl(0.155, 0.155, 0.012, 32, 'x'), M.darkSteel(), mg, [0.81, CY, 0]);
      const fh = P(eng, 'בית גלגל התנופה', 'Flywheel housing', 'ברזל יצוק', 'בית גדול שמצד אחד נצמד לבלוק ומצד שני לתמסורת. ממנו יוצא ציר הקשירה לתמסורת.');
      mesh(G.lathe([[0.2, -0.06], [0.2, 0.06], [0.18, 0.08], [0.17, 0.0]], 36, 'x'), CAST, { parent: fh, pos: [0.82, CY, 0] });
      put(G.cyl(0.04, 0.04, 0.4, 14, 'z'), CAST, fh, [0.98, 0.45, 0]);
      const mm = P(eng, 'תושבות מנוע (3)', 'Engine mounts', 'פלדה + גומי', 'שלוש נקודות חיבור בין הבלוק למסגרת: שתיים בקדמה ואחת בבית הגלגל. זו שלוש־נקודתית כדי שהמסגרת תתעקם בלי לשבור את המנוע.');
      for (const s of [1, -1]) put(new THREE.BoxGeometry(0.1, 0.05, 0.05), IRON, mm, [1.15, 0.6, s * 0.18]); put(new THREE.BoxGeometry(0.05, 0.05, 0.1), IRON, mm, [1.4, 0.55, 0]);
      const of = P(eng, 'צינור מילוי שמן ושקעי מפלס', 'Oil filler & level cocks', 'פליז + פח', 'צינור שבו שופכים שמן, ושני ברזים בצד האגן שבודקים בהם את המפלס: אם הפתוח לא מוציא שמן — חסר.');
      rod(of, [1.4, 0.6, 0.16], [1.45, 0.66, 0.16], 0.016, DSTEEL); put(G.cyl(0.02, 0.02, 0.012, 14, 'y'), BRASS, of, [1.45, 0.67, 0.16]);
      for (const y of [0.5, 0.47]) put(G.cyl(0.006, 0.006, 0.03, 8, 'z'), BRASS, of, [1.1, y, -0.155]);
    }
    // ================================================================== IGNITION
    const ign = sys('ignition');
    {
      const cb = P(ign, 'קופסת סלילי חילוף (טרמבלר)', 'Trembler coil box', 'עץ + פליז + נחושת', 'ארבעה סלילים עם נקודות רוטטות (טרמבלר) בתוך קופסה אחת. כל אחד מייצר מתח גבוה לאחד המצתים. אפשר ״לשמוע״ את הזמזום.');
      put(G.box(0.3, 0.14, 0.12, 0.005, 1), woodDark, cb, [0.835, 0.95, 0.1]); // sits on the dash behind the seat? placed on the cabin side
      for (let i = 0; i < 4; i++) { put(G.box(0.05, 0.1, 0.1, 0.004, 1), M.darkSteel(), cb, [0.835 - 0.0, 0.95, 0.1 + (i - 1.5) * 0.065 * 0.0]); put(G.cyl(0.006, 0.006, 0.02, 8, 'x'), BRASS, cb, [0.822, 0.95 + 0.02, 0.1 - 0.12 + i * 0.06]); }
      const pl = P(ign, 'מצתים (4)', 'Spark plugs (×4)', 'חרסינה + פלדה', 'ארבעה מצתים בראש. הנקודה ביניהם נפערת ב־0.6 מ״מ בערך. מדי פעם צריך לנקות פחם.');
      for (const x of CX) { put(G.cyl(0.012, 0.012, 0.04, 10, 'y'), STEEL, pl, [x, 0.955, 0]); put(G.cyl(0.011, 0.011, 0.06, 10, 'y'), M.ceramic(), pl, [x, 1.0, 0]); put(G.cyl(0.005, 0.005, 0.014, 6, 'y'), BRASS, pl, [x, 1.04, 0]); }
      const wr = P(ign, 'חוטי הצתה', 'Ignition wires', 'נחושת + גומי', 'חוטים מכוסי בד גומי מהתא לחצה ומהמצתים. אחד עם שרוול ירוק.');
      CX.forEach((x, i) => mesh(G.tube([V3(0.835, 0.95, 0.04 + i * 0.01), V3(x - 0.1, 1.02, 0.1), V3(x, 1.06, 0.03)], 0.003, 16, 5), M.rubber(), { parent: wr }));
      const cm = P(ign, 'מחלק זרם (טיימר קדמי)', 'Timer (commutator)', 'פליז + פיברגלס', 'פנאה סיבובית בקדמת המנוע שמעבירה את הזרם לסליל הנכון בעיתוי מתאים.');
      put(G.cyl(0.03, 0.03, 0.04, 20, 'x'), BRASSD, cm, [1.45, 0.62, 0]); for (let k = 0; k < 4; k++) put(G.cyl(0.004, 0.004, 0.03, 6, 'z'), BRASS, cm, [1.45, 0.62 + (k % 2 ? 0 : 0.02), (k - 1.5) * 0.01]);
    }
    // ================================================================== FUEL & EXHAUST
    const fuel = sys('fuel');
    {
      const tk = P(fuel, 'מיכל דלק (גרביטציה)', 'Gravity fuel tank', 'פח מצופה אבץ', 'מיכל 10 גלונים (38 ליטר) מתחת למושב. הדלק זורם לקרבורטור בגרביטציה, אז בעלייה תלולה צריך לנסוע אחורה כשהמיכל כמעט ריק!');
      put(G.box(0.4, 0.26, 0.96, 0.03), M.metal(0x5b5e63, 0.5), tk, [-0.05, 0.66 + 0.08 - 0.13 + 0.12, 0]);
      put(G.cyl(0.03, 0.03, 0.02, 14, 'y'), BRASS, tk, [-0.05, 0.89, 0.3]);
      const sb = P(fuel, 'פקק משקעים', 'Sediment bulb', 'זכוכית + פליז', 'קערת זכוכית קטנה בתחתית צינור הדלק שמסננת בוץ ומים. בודקים אותה בעין.');
      put(G.cyl(0.02, 0.02, 0.05, 12, 'y'), M.glass(0xd0e0d0, 0.5), sb, [0.15, 0.62, 0.2]);
      const fl = P(fuel, 'צינור דלק', 'Fuel line', 'נחושת', 'צינור נחושת דק שמוליך דלק מהמיכל אל הקרבורטור בצד שמאל, עם ברז סגירה.');
      mesh(G.tube([V3(0.15, 0.6, 0.2), V3(0.4, 0.55, 0.05), V3(0.7, 0.58, -0.15), V3(0.95, 0.7, -0.17), V3(1.12, 0.68, -0.17)], 0.004, 30, 5), M.copper(), { parent: fl });
      const cb = P(fuel, 'קרבורטור (קינגסטון)', 'Carburettor', 'פליז', 'קרבורטור בלי מצערת אוטומטית — מערבב דלק ואוויר. יש בורג כוונון עם ידית על הקיר ותפס חנק.');
      put(G.cyl(0.035, 0.035, 0.1, 18, 'y'), BRASS, cb, [1.12, 0.62, -0.17]); put(G.cyl(0.04, 0.04, 0.03, 18, 'y'), BRASSD, cb, [1.12, 0.68, -0.17]); put(G.cyl(0.006, 0.006, 0.06, 8, 'y'), BRASS, cb, [1.14, 0.56, -0.17]);
      const im = P(fuel, 'מערכת יניקה', 'Intake manifold', 'ברזל יצוק', 'צינור יצוק שמוליך תערובת דלק־אוויר אל ארבעת הצילינדרים.');
      mesh(G.tube([V3(1.12, 0.75, -0.17), V3(1.12, 0.8, -0.13), V3(1.31, 0.82, -0.125), V3(0.995, 0.82, -0.125)], 0.03, 20, 10), CAST, { parent: im });
      const em = P(fuel, 'צינור פליטה', 'Exhaust manifold', 'ברזל יצוק', 'ארבע יציאות מהצילינדרים מתחברות לצינור אחד שיורד אל הממפלר מתחת לרצפה.');
      put(G.box(0.46, 0.05, 0.05, 0.01), CAST, em, [1.15, 0.7, -0.16]); rod(em, [1.1, 0.7, -0.16], [0.92, 0.5, -0.3], 0.03, CAST);
      const mf = P(fuel, 'משתיק קול (ממפלר) וצינור זנב', 'Muffler & tailpipe', 'פלדה', 'משתיק קול גלילי עם חיץ בפנים. הצינור מוביל מאחור מתחת לדלת האחורית.');
      put(G.cyl(0.055, 0.055, 0.5, 22, 'x'), M.metal(0x3a3a3c, 0.6), mf, [0.2, 0.46, -0.3]); rod(mf, [0.92, 0.5, -0.3], [0.45, 0.46, -0.3], 0.03, DSTEEL); rod(mf, [-0.05, 0.46, -0.3], [-1.55, 0.45, -0.3], 0.025, DSTEEL);
      for (const x of [0.4, 0.0]) put(G.torus(0.058, 0.006, 6, 20, PI * 2, 'x'), STEEL, mf, [x, 0.46, -0.3]);
    }
    // ================================================================== DRIVETRAIN
    const dt = sys('drivetrain');
    {
      const tx = P(dt, 'תיבת הילוכים פלנטרית', 'Planetary transmission', 'ברזל יצוק', 'תיבת שני הילוכים קדימה והילוך אחד אחורה בשלוש סרטי בלימה. בלי מצמד רגיל — לחיצה על דוושה מצמצמת סרט סביב תוף.');
      mesh(new THREE.BoxGeometry(0.34, 0.2, 0.32), CAST, { parent: tx, pos: [0.68, 0.58, 0] });
      const hh = P(dt, 'מכסה חור־יד', 'Hand-hole cover', 'פח + 8 ברגים', 'לוחית שפותחים בה בלי לפרק את התיבה: דרכה החליפו סרטי בלימה.');
      put(G.box(0.18, 0.012, 0.16, 0.004), M.darkSteel(), hh, [0.68, 0.682, 0]); bolts(hh, Array.from({ length: 8 }, (_, k) => ({ pos: [0.68 + (k % 4 - 1.5) * 0.045, 0.69, (k < 4 ? -1 : 1) * 0.07] })), 0.005);
      const pg = P(dt, 'גלגלי שיניים פלנטריים (3 קבוצות)', 'Planetary gear sets (×3)', 'פלדה מחושלת', 'שלוש קבוצות גלגלי שיניים: שמש מרכזית, שלושה לוויינים וטבעת. כל קבוצה מקנה יחס אחר.');
      const gear = (r, n, w) => G.merge([G.cyl(r, r, w, 28, 'x'), ...Array.from({ length: n }, (_, k) => { const a = k / n * PI * 2; return G.at(new THREE.BoxGeometry(w, 0.008, 0.008), [0, Math.cos(a) * (r + 0.003), Math.sin(a) * (r + 0.003)], [a, 0, 0]); })]);
      for (const x of [0.58, 0.68, 0.78]) { mesh(gear(0.045, 18, 0.05), M.steel(), { parent: pg, pos: [x, 0.58, 0] }); for (let k = 0; k < 3; k++) { const a = k * 2.094; mesh(gear(0.025, 10, 0.05), M.castAlu(), { parent: pg, pos: [x, 0.58 + Math.cos(a) * 0.07, Math.sin(a) * 0.07] }); } }
      const br = P(dt, 'סרטי בלימה (3)', 'Brake bands (×3)', 'פלדה + בטנה', 'ברק, גלגל נסיעה והילוך אחורי — כל אחד סרט פלדה סביב תוף שנסגר בלחיצת דוושה.');
      for (const x of [0.58, 0.68, 0.78]) put(G.torus(0.1, 0.006, 6, 28, PI * 1.6, 'x'), M.matte(0x8a6a38), br, [x, 0.58, 0]);
      const cl = P(dt, 'מצמד מגע (דיסקים)', 'Clutch disc pack', 'פלדה + פיברגלס', 'סידרת דיסקים צמודים בקפיצים שמצמידים את גלגל התנופה לתמסורת בהילוך מהיר.');
      for (let i = 0; i < 6; i++) put(G.cyl(0.14, 0.14, 0.004, 28, 'x'), i % 2 ? M.darkSteel() : M.matte(0x6b5a3a), cl, [0.86 - 0.12 + i * 0.012 + 0.0, 0.62 - 0.04, 0]);
      const uj = P(dt, 'מפרק כדורי וקופסת מפרק', 'Universal joint ball & cap', 'פלדה מחושלת + ברונזה', 'כדור גדול בקצה גל ההנעה, בתוך בית שמחזיק אותו. מכאן העברת כוח בלי דחף מצד המכסה.');
      put(G.sphere(0.06, 20, 16), M.castIron(), uj, [0.5, 0.52, 0]);
      const tt = P(dt, 'צינור מומנט וגל הנעה', 'Torque tube & drive shaft', 'פלדה', 'הגל בתוך צינור נושא שמפתיע — הוא עובר לציר ומחזיק אותו במקום. ללא מוטות אחוריים!');
      rod(tt, [0.5, 0.52, 0], [AXR + 0.15, 0.4, 0], 0.045, M.metal(0x2a2c30, 0.55)); rod(tt, [0.5, 0.52, 0], [AXR + 0.15, 0.4, 0], 0.018, STEEL);
      moving.shaft = tt;
      const df = P(dt, 'דיפרנציאל (בית כדורי)', 'Differential housing', 'ברזל יצוק', 'בית כדורי בצורת ביצה בציר האחורי. בפנים: גלגל כתר וגלגל שיניים קטן, ושני פנינים ושני צירים.');
      mesh(G.sphere(0.13, 24, 18), CAST, { parent: df, pos: [AXR, TR, 0], scale: [1.1, 1, 1] });
      bolts(df, Array.from({ length: 8 }, (_, k) => ({ pos: [AXR + Math.cos(k * 0.785) * 0.105, TR + Math.sin(k * 0.785) * 0.105, 0.0], rot: [PI / 2, 0, 0] })), 0.007);
      const rg = P(dt, 'גלגל כתר וגלגל קטן (בקצה)', 'Ring gear & pinion', 'פלדה מוקשית', 'גלגל כתר גדול וגלגל קטן שמעבירים את הכוח מהאורך לרוחב, וכך מסתובבים הגלגלים.');
      put(G.cyl(0.095, 0.095, 0.02, 32, 'z'), STEEL, rg, [AXR, TR, 0.03]); put(G.cyl(0.025, 0.025, 0.06, 14, 'x'), STEEL, rg, [AXR + 0.06, TR, 0]);
      const axs = P(dt, 'סרנים (2)', 'Axle shafts (×2)', 'פלדה', 'שני סרנים בתוך בית הציר שמעבירים כוח מהדיפרנציאל לגלגלים.');
      for (const s of [1, -1]) rod(axs, [AXR, TR, s * 0.1], [AXR, TR, s * 0.7], 0.022, STEEL);
    }
    // ================================================================== ENGINE ANIMATION
    let engineSpeed = 0, crankAngle = 0;
    const setEngine = () => {
      const r = 0.0508, Lr = 0.14;
      for (const m of moving.pistons) {
        const th = crankAngle + m.th0, cy = CY + Math.cos(th) * r, cz = Math.sin(th) * r;
        const yp = cy + Math.sqrt(Lr * Lr - cz * cz);
        m.p.position.set(m.x, yp + 0.02, 0);
        const a = V3(m.x, cy, cz), b = V3(m.x, yp, 0), d = b.clone().sub(a);
        m.r.position.copy(a).addScaledVector(d, 0.5); m.r.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      }
      moving.crank.rotation.x = crankAngle; for (const f of moving.flywheels) f.rotation.x = crankAngle;
      ctxFan.rotation.x = crankAngle * 1.6;
    };
    setEngine();
    K.toggle('engine', { he: 'מנוע פועל', key: 'e', seconds: 1.0 }, (t) => { engineSpeed = t * 14; });
    K.onFrame((time, dt) => { if (engineSpeed > 0.01) { crankAngle += engineSpeed * dt; setEngine(); } });
  },
};
