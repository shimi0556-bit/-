// #002 — Merkava Mk 4M ("Barak" / Windbreaker), IDF main battle tank.
// Built entirely in code with the library kit (engine/kit.js): no model files, no
// images. Units are metres. Axes: +x = forward (the gun), +y = up, +z = right.
// s = +1 right, -1 left. Public information only; internals are an informed
// reconstruction, not a drawing.
//
// Layout: engine + transmission in the FRONT of the hull (right), driver front-left,
// fighting compartment in the middle under the turret, ammunition + rear door at the
// back. Turret is long, wedge-shaped, ring centre at x = -0.80.
//
// Two upgrades over #001: (1) procedural "wear & dust" paint (object-space speckle +
// world-height dust, so the lower hull and tracks are dustier than the roof) and
// (2) living mechanisms: running tracks (every link, road wheel and sprocket turns
// with the true speed), traversing turret, elevating gun, extending Trophy launchers.

window.L3D_MODEL = {
  async build({ K, THREE, sys }) {
    const { M, G, V3, mesh, part, instances, lerp, clamp } = K;
    const PI = Math.PI;

    // ------------------------------------------------------------------ dimensions
    const HZ = 1.05, HT = 0.07;               // hull outer half width / plate thickness
    const BELLY = 0.47, ROOFY = 1.62;         // belly clearance 0.47 m, hull roof
    const RING = { x: -0.80, r: 0.93 };       // turret ring centre / radius
    const TZ = 1.46, TW = 0.60;               // track centre line z / width
    const SKZ = 1.83;                         // side-skirt plane (overall width 3.72 m)
    const SPR = { x: 3.15, y: 0.88, r: 0.42 };// drive sprocket (front)
    const IDL = { x: -3.55, y: 0.50, r: 0.47 };// idler (rear)
    const WR = 0.395, WY = 0.45;              // road wheel radius / axle height
    const WX = [2.35, 1.38, 0.41, -0.56, -1.53, -2.50];
    const TUR_Y = ROOFY;                      // turret group origin height
    const GUN = { x: 1.80, y: 0.24, len: 4.24 }; // trunnion in turret coordinates, barrel length

    // ------------------------------------------------------------------ materials
    const mats = new Map();
    // matte military paint with speckle + height-dependent dust (wear upgrade)
    const dusty = (color, o = {}) => {
      const key = color + '/' + (o.r ?? 0.82) + '/' + (o.m ?? 0.12) + '/' + (o.dust ?? 0.6);
      if (mats.has(key)) return mats.get(key);
      const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.82, metalness: o.m ?? 0.12, side: THREE.DoubleSide, name: o.name || 'צבע צבאי מט עם אבק' });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uDust = { value: o.dust ?? 0.35 }; sh.uniforms.uBump = { value: o.bump ?? 0.009 };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying float vWY; varying vec3 vNo; varying vec3 vVX; varying vec3 vVY; varying vec3 vVZ;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vObj = position; vNo = normal; vVX = normalMatrix * vec3(1.0, 0.0, 0.0); vVY = normalMatrix * vec3(0.0, 1.0, 0.0); vVZ = normalMatrix * vec3(0.0, 0.0, 1.0); vec4 dw = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            dw = instanceMatrix * dw;
            #endif
            vWY = (modelMatrix * dw).y;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vObj; varying float vWY; varying vec3 vNo; varying vec3 vVX; varying vec3 vVY; varying vec3 vVZ; uniform float uDust; uniform float uBump;
            float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
            float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
              return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                         mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
            float vnf(float f){ float cell = 1.0 / f; float px = length(fwidth(vObj)); float fade = clamp(1.0 - px / (cell * 0.5), 0.0, 1.0); return mix(0.5, vn(vObj * f), fade); }
            float vnp(vec3 p, float f){ float cell = 1.0 / f; float px = length(fwidth(vObj)); float fade = clamp(1.0 - px / (cell * 0.5), 0.0, 1.0); return mix(0.5, vn(p * f), fade); }
            float bumpH(vec3 p){ return vnp(p, 420.0) * 0.45 + vnp(p, 90.0) * 0.35 + vnp(p, 25.0) * 0.2; }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float patch_ = vnf(5.0) * 0.6 + vnf(17.0) * 0.4;
            float grain = vnf(160.0);
            float chipV = smoothstep(0.82, 0.9, vnf(55.0) * 0.7 + vnf(210.0) * 0.3) * (0.35 + 0.65 * patch_);
            diffuseColor.rgb *= 0.9 + 0.2 * patch_ + 0.12 * (grain - 0.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.17), chipV * 0.8);
            float dust = smoothstep(1.15, 0.05, vWY) * (0.25 + 0.75 * patch_);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.45, 0.35), dust * uDust);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * patch_) - chipV * 0.35 + dust * 0.1, 0.05, 1.0);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
            metalnessFactor = mix(metalnessFactor, 0.85, chipV);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float e = 0.0012; vec3 no = normalize(vNo);
              vec3 g = vec3(bumpH(vObj + vec3(e, 0.0, 0.0)) - bumpH(vObj - vec3(e, 0.0, 0.0)), bumpH(vObj + vec3(0.0, e, 0.0)) - bumpH(vObj - vec3(0.0, e, 0.0)), bumpH(vObj + vec3(0.0, 0.0, e)) - bumpH(vObj - vec3(0.0, 0.0, e))) / (2.0 * e);
              g -= no * dot(g, no);
              normal = normalize(normal - uBump * (vVX * g.x + vVY * g.y + vVZ * g.z) * (1.0 - 0.8 * chipV)); }`);
      };
      m.customProgramCacheKey = () => 'l3d-dusty';
      mats.set(key, m);
      return m;
    };
    const OLIVE = dusty(0x5d5a43, { dust: 0.3 });                         // main hull / turret paint (IDF khaki-olive)
    const OLIVE2 = dusty(0x54513d, { dust: 0.3 });                        // armour modules, a shade darker
    const SAND = dusty(0x8a7a58, { name: 'צבע חול (סיני)' });
    const CAMO_RUB = dusty(0x1c1c1b, { r: 0.95, m: 0, dust: 0.8, name: 'גומי שריון (חצאיות)' });
    const TRACK_M = dusty(0x2a2926, { r: 0.9, m: 0.4, dust: 0.6, name: 'פלדה + רפידות גומי מאובקות' });
    const WHEEL_M = dusty(0x3a3a38, { r: 0.85, m: 0.5, dust: 0.35, name: 'פלדה וגומי מאובקים' });
    const RUBBER = dusty(0x141416, { r: 0.95, m: 0, dust: 0.3, name: 'גומי' });
    const STEEL = M.steel(), DSTEEL = M.darkSteel(), CIRON = M.castIron(), BLACK = M.black();
    const MARK = M.paintFlat(0xe9e6da, 0.7);

    // ------------------------------------------------------------------ helpers
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const RB = (w, h, d, r = 0.008) => G.box(w, h, d, Math.min(r, Math.min(w, h, d) * 0.3), 2); // slightly rounded box for things people touch or see up close
    const put = (geo, mat, parent, pos, rot, o = {}) => { if (rot && !Array.isArray(rot)) { o = rot; rot = null; } return mesh(geo, mat, { parent, pos: pos || undefined, rot: rot || undefined, ...o }); };
    // plan-view polygon [[x, z], …] extruded upward from y0 to y1 (optional holes)
    const planPrism = (pts, y0, y1, holes = []) => {
      const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      holes.forEach((h) => sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
      const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false });
      g.rotateX(-PI / 2); g.translate(0, y0, 0); return g;
    };
    // side-view polygon [[x, y], …] extruded across z0..z1
    const sidePrism = (pts, z0, z1) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
      g.translate(0, 0, z0); return g;
    };
    const circlePts = (cx, cz, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * PI * 2) * r, cz + Math.sin((i / n) * PI * 2) * r]);
    const sideHe = (s) => (s > 0 ? 'ימין' : 'שמאל');
    const sideEn = (s) => (s > 0 ? 'right' : 'left');
    const bolts = (parent, list, size = 0.012, mat = DSTEEL) => instances(G.bolt(size), mat, list, { parent });
    // a thin slab lying along the plan line p0→p1 (turret coordinates), offset outward by `off`
    const slabAlong = (p0, p1, off, th, y0, y1, side = 1) => {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
      const nx = (-dz / L) * side, nz = (dx / L) * side; // outward normal (side=1: toward +z for a +x-running edge on the right)
      const cx = (p0[0] + p1[0]) / 2 + nx * off, cz = (p0[1] + p1[1]) / 2 + nz * off;
      return { geo: B(L, y1 - y0, th), pos: [cx, (y0 + y1) / 2, cz], rot: [0, -ang, 0], L, ang, nx, nz, cx, cz };
    };
    // helix coil spring along +y of height h
    const coil = (r, tube, h, turns, seg = 40) => {
      const pts = []; const n = turns * seg;
      for (let i = 0; i <= n; i++) { const a = (i / seg) * PI * 2; pts.push(V3(Math.cos(a) * r, (i / n) * h - h / 2, Math.sin(a) * r)); }
      return G.tube(pts, tube, n * 2, 6);
    };

    // hatch lid furniture: rubber seal, bolt ring, grab handle, hinge barrels and a latch (lid disc centred at x = cx, top at y = top)
    const lidDetails = (lid, cx, r, top = 0.025) => {
      put(G.torus(r - 0.012, 0.011, 6, 44, PI * 2, 'y'), M.rubber(), lid, [cx, -top + 0.004, 0]);
      bolts(lid, Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * PI * 2; return { pos: [cx + Math.cos(a) * (r - 0.055), top, Math.sin(a) * (r - 0.055)] }; }), 0.009);
      put(G.tube([V3(cx - 0.07, top, 0), V3(cx - 0.07, top + 0.045, 0), V3(cx + 0.07, top + 0.045, 0), V3(cx + 0.07, top, 0)], 0.009, 14, 6), STEEL, lid);
      for (const z of [-0.1, 0.1]) put(G.cyl(0.02, 0.02, 0.07, 10, 'z'), DSTEEL, lid, [cx - r - 0.005, 0, z]);
      put(RB(0.05, 0.03, 0.08, 0.006), DSTEEL, lid, [cx + r - 0.03, top, 0]);
      put(G.cyl(0.014, 0.014, 0.03, 10, 'y'), STEEL, lid, [cx + r - 0.03, top + 0.02, 0]);
    };
    const hullSys = sys('hull'), armorSys = sys('armor'), turretSys = sys('turret'), gunSys = sys('gun');
    const opticsSys = sys('optics'), trophySys = sys('trophy'), tracksSys = sys('tracks'), suspSys = sys('suspension');
    const powerSys = sys('power'), crewSys = sys('crew'), equipSys = sys('equip');
    const hatches = []; // {obj, axis, open, sign}

    // ------------------------------------------------------------------ lamps (own materials: each toggles on its own)
    const lampMat = (c, i = 0.05) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.92 });
    const L = { head: lampMat(0xfff3cf), red: lampMat(0xff2a12), amber: lampMat(0xffa21a), ir: lampMat(0x9a1010), green: lampMat(0x33ff77) };

    // ================================================================== HULL
    const DECK_A = Math.atan2(-0.18, 1.55);                 // engine deck slopes down toward the nose
    const deckY = (x) => 1.34 + (3.15 - x) * 0.116;
    const plateBetween = (p0, p1, th, hz, inward = 0) => {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], Ln = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const nx = -dy / Ln, ny = dx / Ln;
      return { geo: B(Ln, th, 2 * hz), pos: [(p0[0] + p1[0]) / 2 + nx * inward, (p0[1] + p1[1]) / 2 + ny * inward, 0], rot: [0, 0, a] };
    };
    const hullPlate = (p0, p1, he, en, mat, desc, name) => {
      const pp = part(hullSys, { he, en, mat, desc });
      const o = plateBetween(p0, p1, HT, HZ, HT / 2);
      put(o.geo, OLIVE, pp, o.pos, o.rot, { name });
      return pp;
    };
    {
      const hull = part(hullSys, { he: 'גוף הטנק (שלדה מרותכת)', en: 'Hull (welded structure)', mat: 'פלדת שריון מרותכת', desc: 'שלד הגוף: לוחות פלדה מרותכים עם חזית משופעת נמוכה. המנוע והתמסורת נמצאים מלפנים, ולכן הם משמשים גם כשריון נוסף לצוות — זה הרעיון המרכזי של המרכבה.' });
      // side plates: one profile, extruded for each side
      const prof = [[-3.80, 0.50], [3.05, 0.47], [3.80, 0.80], [3.84, 1.05], [3.15, 1.34], [1.60, 1.52], [1.30, 1.62], [-3.80, 1.62]];
      for (const s of [1, -1]) {
        const sp = part(hull, { he: `דופן גוף ${sideHe(s)}`, en: `Hull side plate (${sideEn(s)})`, mat: 'פלדת שריון, עובי ~70 מ״מ (הערכה)', desc: 'דופן הגוף. עליה מורכבים זרועות המתלים, גלגלי התמיכה ומגני הצד. קצה הדופן הקדמי משופע כדי להסיט פגזים.' });
        put(sidePrism(prof, s > 0 ? HZ - HT : -HZ, s > 0 ? HZ : -HZ + HT), OLIVE, sp, [0, 0, 0], null, { name: 'side plate' });
        // weld seams along the top edge and a row of small hull bolts
        const wl = []; for (let i = 0; i < 13; i++) wl.push({ pos: [-3.3 + i * 0.5, 1.5, s * (HZ + 0.004)], rot: [s * PI / 2, 0, 0] });
        bolts(sp, wl, 0.011, DSTEEL);
      }
      // belly (V-shaped mine deflector, two shallow wedges meeting on the centre line)
      const belly = part(hull, { he: 'תחתית הגוף', en: 'Belly plate', mat: 'פלדת שריון, תחתית משופעת', desc: 'התחתית בנויה משני משטחים משופעים שנפגשים באמצע בצורת V רדודה, כדי להסיט את גל הלחץ של מוקש. הרווח מהקרקע הוא 47 ס״מ.' });
      for (const s of [1, -1]) put(B(6.85, 0.06, HZ + 0.02), OLIVE, belly, [-0.375, BELLY + 0.03 - 0.02, s * (HZ / 2 + 0.01)], [-s * 0.045, 0, 0], { name: 'belly wedge' });
      const ribs = []; for (let i = 0; i < 9; i++) ribs.push({ pos: [-3.3 + i * 0.78, BELLY - 0.02, 0], scale: 1 });
      instances(B(0.07, 0.05, 1.9), DSTEEL, ribs, { parent: belly });
      // lower glacis (nose underside), nose plate, upper glacis
      hullPlate([3.05, 0.47], [3.80, 0.80], 'לוח חזית תחתון', 'Lower front plate', 'פלדת שריון', 'הלוח התחתון בחזית הגוף. מוגן מאחוריו על ידי תא המנוע והתמסורת.');
      hullPlate([3.80, 0.80], [3.84, 1.05], 'חוטם הגוף', 'Nose plate', 'פלדת שריון', 'קצה החזית של הגוף. כאן מחוברים וו הגרירה ופנסי הנסיעה.');
      hullPlate([3.84, 1.05], [3.15, 1.34], 'לוח חזית עליון (גלסיס)', 'Upper glacis', 'פלדת שריון + שכבות מרוחקות', 'הלוח הקדמי המשופע הנמוך. מוסתר מאחורי המנוע — התא הקדמי הוא שריון מרחוק אמיתי.');
      hullPlate([3.15, 1.34], [1.60, 1.52], 'סיפון תא המנוע', 'Engine deck plate', 'פלדת שריון', 'גג תא המנוע והנהג. בו חלונות האוורור וצוהר הנהג.');
      hullPlate([1.60, 1.52], [1.30, 1.62], 'לוח מעבר לצריח', 'Turret-front rise plate', 'פלדת שריון', 'לוח משופע קצר שמעלה את הסיפון אל טבעת הצריח.');
      // roof with the turret ring hole
      const roof = part(hull, { he: 'גג תא הלחימה', en: 'Fighting-compartment roof', mat: 'פלדת שריון', desc: 'גג הגוף סביב טבעת הצריח. חור עגול בקוטר 1.86 מ׳ מאפשר לצוות לעבור בין הצריח לגוף.' });
      put(planPrism([[-3.80, -HZ], [1.30, -HZ], [1.30, HZ], [-3.80, HZ]], ROOFY - 0.045, ROOFY, [circlePts(RING.x, 0, RING.r, 40)]), OLIVE, roof, null, null, { name: 'roof plate' });
      const lugs = []; for (const [x, z] of [[0.95, 0.85], [0.95, -0.85], [-3.4, 0.85], [-3.4, -0.85]]) lugs.push({ pos: [x, ROOFY + 0.01, z], rot: [0, 0, 0] });
      const lugPart = part(hull, { he: 'פינות הרמה בגג (4)', en: 'Roof lifting lugs (×4)', mat: 'פלדה מחושלת', desc: 'ארבע עיניות הרמה שבהן מרימים את הגוף בעגורן. כל אחת מרותכת לקורה מתחת ללוח הגג.' });
      instances(G.torus(0.04, 0.011, 8, 18, PI * 2, 'x'), DSTEEL, lugs.map((l) => ({ pos: [l.pos[0], l.pos[1] + 0.045, l.pos[2]], rot: [0, PI / 2, 0] })), { parent: lugPart });
      instances(B(0.1, 0.03, 0.05), DSTEEL, lugs, { parent: lugPart });

      // rear plate: frame around the door opening
      const rear = part(hull, { he: 'לוח אחורי (מסגרת הדלת)', en: 'Rear plate / door frame', mat: 'פלדת שריון', desc: 'הלוח האחורי של הגוף. מסגרת הדלת מחוזקת בפרופילי פלדה, והפתח מאפשר פינוי פצועים ופריקת תחמושת.' });
      put(B(HT, 0.12, 2 * HZ), OLIVE, rear, [-3.80 + HT / 2 - 0.0, 1.56, 0], null, { name: 'upper beam' });
      for (const s of [1, -1]) put(B(HT, 1.0, 0.25), OLIVE, rear, [-3.80 + HT / 2, 1.0, s * (HZ - 0.125)], null, { name: 'door post' });
      put(B(HT, 0.03, 1.6), DSTEEL, rear, [-3.80 + HT / 2, 0.515, 0], null, { name: 'sill' });
      // rear door (opens to the side on 3 hinges)
      const doorPivot = V3(-3.83, 1.0, -0.82);
      const doorPart = part(hull, { he: 'דלת אחורית', en: 'Rear door', mat: 'פלדת שריון, עובי ~60 מ״מ', desc: 'דלת אחורית גדולה — ייחודית למרכבה. דרכה נכנסים כוחות חי״ר ומפנים פצועים, ובעזרתה מעמיסים פגזים בתוך הגוף המוגן.' });
      doorPart.position.copy(doorPivot);
      put(B(0.07, 0.98, 1.64), OLIVE2, doorPart, [0, 0, 0.82], null, { name: 'door skin' });
      put(B(0.025, 0.86, 1.5), CIRON, doorPart, [0.05, 0, 0.82], null, { name: 'door inner liner' });
      for (let i = 0; i < 3; i++) put(B(0.05, 0.05, 1.5), DSTEEL, doorPart, [-0.055, -0.3 + i * 0.3, 0.82], null, { name: 'stiffener' });
      const hinge = part(doorPart, { he: 'צירי הדלת (3)', en: 'Door hinges (×3)', mat: 'פלדה מחושלת, פינים מחוסמים', desc: 'שלושה צירים כבדים עם פיני פלדה מחוסמים. הדלת שוקלת מאות קילוגרמים, ולכן הצירים הם חלק מהמבנה של לוח האחורי.' });
      for (const y of [-0.38, 0, 0.38]) { put(G.cyl(0.035, 0.035, 0.2, 14, 'y'), DSTEEL, hinge, [-0.01, y, 0], null); put(G.cyl(0.015, 0.015, 0.24, 10, 'y'), STEEL, hinge, [-0.01, y, 0]); }
      const latches = part(doorPart, { he: 'מנעולי הדלת (3) וידית', en: 'Door latches (×3) & handle', mat: 'פלדה מגולוונת', desc: 'שלושה בריחי פלדה נועלים את הדלת לחלק הימני של המסגרת. ידית אחת מרכזית פותחת את שלושתם ביחד.' });
      for (const y of [-0.34, 0, 0.34]) { put(B(0.04, 0.05, 0.16), STEEL, latches, [-0.07, y, 1.55]); put(G.cyl(0.012, 0.012, 0.09, 10, 'x'), DSTEEL, latches, [-0.09, y, 1.62]); }
      put(G.tube([V3(-0.09, 0.0, 1.35), V3(-0.14, 0.0, 1.35), V3(-0.14, 0.0, 1.0), V3(-0.09, 0.0, 1.0)], 0.011, 24, 8), STEEL, latches, null, { name: 'handle' });
      bolts(doorPart, Array.from({ length: 18 }, (_, i) => ({ pos: [-0.037, -0.43 + (i % 2) * 0.86, 0.1 + Math.floor(i / 2) * 0.17], rot: [0, 0, PI / 2] })), 0.011);
      const tl = part(doorPart, { he: 'פנס אחורי ופנס עצירה (2)', en: 'Rear lamps (×2)', mat: 'פוליקרבונט אדום', desc: 'פנסי עצירה וחשכה על הדלת האחורית. בצבא יש גם מצב ״כיבוי אור״ שבו הם נכבים לגמרי.' });
      for (const z of [0.25, 1.4]) { put(B(0.03, 0.07, 0.12), BLACK, tl, [-0.052, -0.4, z]); put(B(0.012, 0.055, 0.1), L.red, tl, [-0.071, -0.4, z]); }
      hatches.push({ obj: doorPart, axis: 'y', sign: -1, max: 1.75, id: 'door' });

      // engine deck: cooling-air louvers (right), exhaust grilles at the rear, driver hatch (left)
      const louver = part(hull, { he: 'סורגי יניקת אוויר למנוע', en: 'Engine air-intake louvers', mat: 'פלדה, רשת ופרופילים משופעים', desc: 'סורגים משופעים שדרכם נשאב אוויר הקירור. הם בנויים כך שרסיסים ומי גשם לא ייכנסו ישר אל המאוורר.' });
      louver.position.set(1.95, deckY(2.3) + 0.012, 0.52); louver.rotation.z = DECK_A;
      put(B(0.62, 0.025, 0.8), BLACK, louver, [0, -0.012, 0], null, { name: 'intake base' });
      instances(B(0.52, 0.012, 0.028), DSTEEL, Array.from({ length: 10 }, (_, i) => ({ pos: [0, 0.012, -0.34 + i * 0.075], rot: [0.5, 0, 0] })), { parent: louver })
      for (const z of [-0.4, 0.4]) put(B(0.62, 0.03, 0.02), DSTEEL, louver, [0, 0.015, z]);
      put(B(0.02, 0.03, 0.8), DSTEEL, louver, [-0.31, 0.015, 0]); put(B(0.02, 0.03, 0.8), DSTEEL, louver, [0.31, 0.015, 0]);
      const exh = part(hull, { he: 'גרילי פליטה (2)', en: 'Exhaust grilles (×2)', mat: 'פלדה עמידת חום', desc: 'גזי הפליטה והאוויר החם יוצאים דרך שני גרילים בחלק האחורי של סיפון המנוע. הם מכוונים כך שיפחיתו חתימה תרמית.' });
      for (const z of [0.3, 0.72]) { const g = part(exh, { he: 'גריל', en: 'grille' }); g.position.set(2.62, deckY(2.62) + 0.01, z); g.rotation.z = DECK_A; put(B(0.34, 0.02, 0.3), BLACK, g); instances(B(0.3, 0.012, 0.018), DSTEEL, Array.from({ length: 7 }, (_, i) => ({ pos: [0, 0.012, -0.12 + i * 0.04], rot: [0.55, 0, 0] })), { parent: g }); }
      for (const [x, z] of [[3.0, 0.2], [3.0, 0.82]]) {
        const cap = part(hull, { he: 'פקק מילוי דלק/שמן', en: 'Fill cap', mat: 'פלדה + שרשרת', desc: 'פקק מילוי עם שרשרת שמונעת את אובדנו. מתחתיו הצוואר של מיכל הדלק או שמן המנוע.' });
        cap.position.set(x, deckY(x) + 0.004, z); cap.rotation.z = DECK_A;
        put(G.cyl(0.07, 0.07, 0.03, 20, 'y'), DSTEEL, cap, [0, 0.015, 0]); put(G.cyl(0.04, 0.04, 0.015, 16, 'y'), STEEL, cap, [0, 0.036, 0]); put(B(0.1, 0.012, 0.02), STEEL, cap, [0, 0.046, 0]);
      }

      // driver hatch + periscopes
      const drv = part(hull, { he: 'צוהר הנהג', en: 'Driver hatch', mat: 'פלדת שריון + 3 פריסקופים', desc: 'הנהג יושב משמאל בחזית הגוף, בשכיבה כמעט. הצוהר נפתח לאחור, ובו שלושה פריסקופים עם זכוכית משוריינת.' });
      drv.position.set(2.38, deckY(2.38), -0.52); drv.rotation.z = DECK_A;
      put(G.cyl(0.33, 0.35, 0.05, 36, 'y'), OLIVE2, drv, [0.0, 0.025, 0], null, { name: 'hatch collar' });
      const lidPivot = part(drv, { he: 'מכסה צוהר הנהג', en: 'Driver hatch lid', mat: 'פלדת שריון', desc: 'מכסה עגול על ציר אחורי. כשהצוהר סגור, הנהג רואה רק דרך הפריסקופים.' }, { pos: [-0.3, 0.06, 0] });
      put(G.cyl(0.3, 0.3, 0.05, 36, 'y'), OLIVE, lidPivot, [0.3, 0.02, 0], null, { name: 'lid' });
      put(G.cyl(0.04, 0.04, 0.02, 14, 'y'), DSTEEL, lidPivot, [0.15, 0.06, 0.0]);
      const dper = part(lidPivot, { he: 'פריסקופי הנהג (3)', en: 'Driver periscopes (×3)', mat: 'זכוכית רב־שכבתית בתוך בית פלדה', desc: 'שלושה פריסקופים נותנים שדה ראייה של כ־120°. הקצה הפנימי של כל אחד נראה כמו מראה, והחיצוני מוגן בזכוכית שריון.' });
      for (const a of [-0.55, 0, 0.55]) { const g = new THREE.Group(); g.position.set(0.3 + Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2); g.rotation.y = -a; dper.add(g); put(B(0.1, 0.09, 0.16), BLACK, g, [0, 0.04, 0]); put(B(0.012, 0.055, 0.13), M.glass(0x0a1a22, 0.7), g, [0.056, 0.04, 0]); put(B(0.11, 0.015, 0.17), DSTEEL, g, [0, 0.09, 0]); }
      lidDetails(lidPivot, 0.3, 0.3, 0.045);
      hatches.push({ obj: lidPivot, axis: 'z', sign: 1, max: 1.35, id: 'driver' });

      // tow eyes (front), tow shackles (rear)
      const eye = part(hull, { he: 'עיניות גרירה קדמיות (2)', en: 'Front tow eyes (×2)', mat: 'פלדה מחושלת', desc: 'שתי עיניות כבדות בחוטם הגוף. מחברים אליהן כבלי גרירה כדי לחלץ טנק תקוע בשטח.' });
      for (const s of [1, -1]) { put(B(0.12, 0.16, 0.05), DSTEEL, eye, [3.85, 0.93, s * 0.62]); put(G.torus(0.065, 0.017, 10, 22, PI * 2, 'x'), STEEL, eye, [3.93, 0.9, s * 0.62], [0, PI / 2, 0]); }
      const shackle = part(hull, { he: 'אזיקי גרירה אחוריים (2)', en: 'Rear tow shackles (×2)', mat: 'פלדה מחושלת', desc: 'אזיקי D שמחוברים ללוח האחורי. הצבא משתמש בהם גם לשחרור טנקים שנתקעו בחול.' });
      for (const s of [1, -1]) { put(B(0.07, 0.12, 0.07), DSTEEL, shackle, [-3.84, 0.63, s * 0.92]); put(G.torus(0.06, 0.016, 10, 20, PI, 'x'), STEEL, shackle, [-3.9, 0.58, s * 0.92], [PI / 2, PI / 2, 0]); put(G.cyl(0.012, 0.012, 0.11, 10, 'z'), STEEL, shackle, [-3.86, 0.65, s * 0.92]); }

      // headlights with guards (front fenders)
      const hl = part(hull, { he: 'פנסי נסיעה קדמיים (2)', en: 'Front headlamps (×2)', mat: 'זכוכית + בית פלדה + מגן', desc: 'פנס נסיעה ופנס חשכה עם מסגרת מגן. אפשר להדליק אותם בכפתור ״פנסים״.' });
      for (const s of [1, -1]) {
        const g = new THREE.Group(); g.position.set(3.78, 1.12, s * 0.95); hl.add(g);
        put(B(0.14, 0.12, 0.14), BLACK, g); put(G.cyl(0.045, 0.045, 0.02, 16, 'x'), L.head, g, [0.08, 0.01, 0]); put(B(0.012, 0.025, 0.04), L.amber, g, [0.075, -0.045, 0.0]);
        for (const dz of [-0.075, 0.075]) put(G.tube([V3(0.075, 0.06, dz), V3(0.14, 0.0, dz), V3(0.075, -0.06, dz)], 0.007, 12, 5), DSTEEL, g);
        put(G.tube([V3(0.14, 0.0, -0.075), V3(0.14, 0.0, 0.075)], 0.007, 6, 5), DSTEEL, g);
      }
    }

    // ================================================================== TRACKS + SUSPENSION (shared path)
    // closed track path (CCW seen from +z): bottom run → up around the front sprocket → top run → around the rear idler
    const pathPts = [];
    const arcTo = (c, r, a0, a1) => { const n = Math.max(3, Math.ceil((Math.abs(a1 - a0) * r) / 0.02)); for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pathPts.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]); } };
    const lineTo = (p0, p1) => { const n = Math.max(2, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.02)); for (let i = 1; i <= n; i++) pathPts.push([lerp(p0[0], p1[0], i / n), lerp(p0[1], p1[1], i / n)]); };
    const P0 = [2.62, 0.03];
    const dP = Math.hypot(P0[0] - SPR.x, P0[1] - SPR.y), bP = Math.atan2(P0[1] - SPR.y, P0[0] - SPR.x), gP = Math.acos(SPR.r / dP);
    const tcand = [bP + gP, bP - gP].map((a) => ({ a, p: [SPR.x + Math.cos(a) * SPR.r, SPR.y + Math.sin(a) * SPR.r] }));
    const tg = tcand.find((c) => (c.p[0] - P0[0]) * (SPR.y - c.p[1]) - (c.p[1] - P0[1]) * (SPR.x - c.p[0]) > 0) || tcand[0];
    const vv = [SPR.x - IDL.x, SPR.y - IDL.y], LL = Math.hypot(...vv), thTop = Math.atan2(vv[1], vv[0]) + Math.acos((IDL.r - SPR.r) / LL);
    const nTop = [Math.cos(thTop), Math.sin(thTop)];
    const t2 = [SPR.x + SPR.r * nTop[0], SPR.y + SPR.r * nTop[1]], t1 = [IDL.x + IDL.r * nTop[0], IDL.y + IDL.r * nTop[1]];
    let a1s = thTop; while (a1s <= tg.a) a1s += PI * 2;
    pathPts.push([IDL.x, IDL.y - IDL.r]);
    lineTo([IDL.x, IDL.y - IDL.r], P0); lineTo(P0, tg.p);
    arcTo(SPR, SPR.r, tg.a, a1s); lineTo(t2, t1);
    arcTo(IDL, IDL.r, thTop, 3 * PI / 2);
    const cum = [0]; for (let i = 1; i < pathPts.length; i++) cum.push(cum[i - 1] + Math.hypot(pathPts[i][0] - pathPts[i - 1][0], pathPts[i][1] - pathPts[i - 1][1]));
    const PLEN = cum[cum.length - 1] + Math.hypot(pathPts[0][0] - pathPts[pathPts.length - 1][0], pathPts[0][1] - pathPts[pathPts.length - 1][1]);
    const NLINK = Math.round(PLEN / 0.19), PITCH = PLEN / NLINK;
    const pathAt = (s) => {
      s = ((s % PLEN) + PLEN) % PLEN; let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
      const a = pathPts[lo], b = pathPts[Math.min(lo + 1, pathPts.length - 1)], seg = cum[Math.min(lo + 1, cum.length - 1)] - cum[lo] || 1;
      const u = clamp((s - cum[lo]) / seg);
      return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    };

    let travel = 0, speed = 0;
    const rolling = []; // {obj, r} rotate about z with the track
    const trackSets = [];

    // ---- tracks
    {
      // one link: rubber pad outside (-y), steel body + end connectors, guide horns inside (+y)
      const padGeo = G.merge([G.at(B(PITCH * 0.9, 0.016, 0.56), [0, -0.036, 0]), ...[-0.2, 0, 0.2].map((z) => G.at(B(PITCH * 0.9, 0.008, 0.045), [0, -0.048, z]))]);
      const bodyGeo = G.merge([
        G.at(B(PITCH * 0.86, 0.022, 0.58), [0, -0.016, 0]),
        G.at(B(PITCH * 0.7, 0.036, 0.03), [0, 0.004, TW / 2 - 0.015]), G.at(B(PITCH * 0.7, 0.036, 0.03), [0, 0.004, -TW / 2 + 0.015]),
        G.at(B(0.022, 0.07, 0.03), [0.004, 0.042, 0.032]), G.at(B(0.022, 0.07, 0.03), [0.004, 0.042, -0.032]),
        G.at(B(0.04, 0.012, 0.09), [0.004, 0.08, 0.032]), G.at(B(0.04, 0.012, 0.09), [0.004, 0.08, -0.032]),
      ]);
      const pinGeo = G.cyl(0.012, 0.012, TW + 0.04, 8, 'z'); pinGeo.translate(-PITCH / 2, 0, 0);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (const s of [1, -1]) {
        const tr = part(tracksSys, { he: `זחל ${sideHe(s)} (${NLINK} חוליות)`, en: `Track (${sideEn(s)}, ${NLINK} links)`, mat: 'פלדה יצוקה + רפידות גומי', desc: `שרשרת של ${NLINK} חוליות פלדה, כל אחת עם רפידת גומי ושני קרנות מנחות באמצע. רוחב הזחל 60 ס״מ, והוא מתנגב קדימה על גלגל ההנעה כל פעם בשן אחת.` });
        const pads = instances(padGeo, RUBBER, Array.from({ length: NLINK }, () => ({ pos: [0, 0, 0] })), { parent: tr });
        const bodies = instances(bodyGeo, TRACK_M, Array.from({ length: NLINK }, () => ({ pos: [0, 0, 0] })), { parent: tr });
        const pinPart = part(tracksSys, { he: `פיני חוליות ${sideHe(s)}`, en: `Track pins (${sideEn(s)})`, mat: 'פלדה מחוסמת', desc: 'כל חוליה מחוברת לשכנה בפין פלדה שחוצה את רוחב הזחל. הקצוות הבולטים נראים בשולי הזחל.' });
        const pins = instances(pinGeo, DSTEEL, Array.from({ length: NLINK }, () => ({ pos: [0, 0, 0] })), { parent: pinPart });
        trackSets.push({ s, ims: [pads, bodies, pins] });
      }
      const updateTracks = () => {
        for (const ts of trackSets) for (let k = 0; k < NLINK; k++) {
          const p = pathAt(k * PITCH - travel);
          e.set(0, 0, p.ang); q.setFromEuler(e); m4.compose(V3(p.x, p.y, ts.s * TZ), q, V3(1, 1, 1));
          for (const im of ts.ims) im.setMatrixAt(k, m4);
        }
        for (const ts of trackSets) for (const im of ts.ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
        for (const r of rolling) r.obj.rotation.z = -travel / r.r;
      };
      K.__updateTracks = updateTracks;
    }

    // ---- sprockets + idlers + tensioners
    for (const s of [1, -1]) {
      const spr = part(tracksSys, { he: `גלגל הנעה ${sideHe(s)}`, en: `Drive sprocket (${sideEn(s)})`, mat: 'פלדה יצוקה מחוסמת', desc: 'גלגל השיניים הקדמי שמושך את הזחל. 14 שיניים בכל טבעת, כך שכל שן פוגשת חוליה אחת בכל סיבוב.' }, { pos: [SPR.x, SPR.y, s * TZ] });
      const rot = new THREE.Group(); spr.add(rot); rolling.push({ obj: rot, r: SPR.r });
      for (const dz of [-0.17, 0.17]) { put(G.cyl(0.4, 0.4, 0.035, 40, 'z'), WHEEL_M, rot, [0, 0, dz]); }
      put(G.cyl(0.14, 0.14, 0.42, 28, 'z'), CIRON, rot);
      put(G.cyl(0.07, 0.07, 0.5, 20, 'z'), STEEL, rot);
      instances(B(0.075, 0.1, 0.05), WHEEL_M, Array.from({ length: 28 }, (_, i) => { const a = ((i % 14) / 14) * PI * 2; return { pos: [Math.cos(a) * 0.43, Math.sin(a) * 0.43, i < 14 ? -0.17 : 0.17], rot: [0, 0, a] }; }), { parent: rot });
      instances(G.bolt(0.014), DSTEEL, Array.from({ length: 24 }, (_, i) => { const a = ((i % 12) / 12) * PI * 2; return { pos: [Math.cos(a) * 0.3, Math.sin(a) * 0.3, i < 12 ? -0.17 - 0.012 : 0.17 + 0.012], rot: [-PI / 2 * (i < 12 ? -1 : 1), 0, 0] }; }), { parent: rot });
      put(G.cyl(0.1, 0.1, 0.03, 20, 'z'), DSTEEL, rot, [0, 0, 0.245]);
      // final drive housing (inboard)
      const fd = part(tracksSys, { he: `תיבת הנעה סופית ${sideHe(s)}`, en: `Final drive (${sideEn(s)})`, mat: 'אלומיניום יצוק + גלגלי שיניים פלנטריים', desc: 'מכפיל הכוח האחרון לפני הזחל: גלגלי שיניים פלנטריים שמורידים את הסיבובים ומגדילים את המומנט לפני גלגל ההנעה.' });
      put(G.cyl(0.19, 0.19, 0.2, 28, 'z'), M.castAlu(), fd, [SPR.x, SPR.y, s * 1.15]);
      instances(G.bolt(0.012), DSTEEL, Array.from({ length: 10 }, (_, i) => ({ pos: [SPR.x + Math.cos(i / 10 * PI * 2) * 0.16, SPR.y + Math.sin(i / 10 * PI * 2) * 0.16, s * 1.253], rot: [s * PI / 2, 0, 0] })), { parent: fd });

      const idl = part(tracksSys, { he: `גלגל מתח אחורי ${sideHe(s)}`, en: `Rear idler (${sideEn(s)})`, mat: 'פלדה יצוקה + שפה מגומי', desc: 'הגלגל האחורי מכוון את הזחל וקובע את המתיחות שלו. הוא מורכב על זרוע מתכווננת ולכן אפשר להדק את הזחל בלי להסיר חוליות.' }, { pos: [IDL.x, IDL.y, s * TZ] });
      const irot = new THREE.Group(); idl.add(irot); rolling.push({ obj: irot, r: IDL.r });
      for (const dz of [-0.17, 0.17]) { put(G.cyl(0.46, 0.46, 0.09, 44, 'z'), RUBBER, irot, [0, 0, dz]); put(G.cyl(0.38, 0.38, 0.1, 32, 'z'), WHEEL_M, irot, [0, 0, dz]); }
      put(G.cyl(0.13, 0.13, 0.4, 24, 'z'), CIRON, irot);
      instances(G.bolt(0.014), DSTEEL, Array.from({ length: 16 }, (_, i) => { const a = ((i % 8) / 8) * PI * 2; return { pos: [Math.cos(a) * 0.27, Math.sin(a) * 0.27, (i < 8 ? -0.17 : 0.17) + (i < 8 ? -0.052 : 0.052)], rot: [(i < 8 ? -1 : 1) * PI / 2, 0, 0] }; }), { parent: irot });
      put(G.cyl(0.08, 0.08, 0.04, 16, 'z'), STEEL, irot, [0, 0, 0.22]);
      const ten = part(tracksSys, { he: `מותח זחל ${sideHe(s)}`, en: `Track tensioner (${sideEn(s)})`, mat: 'פלדה + בורג כוונון', desc: 'זרוע ובורג כוונון. סיבוב הבורג דוחף את הגלגל האחורי החוצה ומותח את הזחל.' });
      put(B(0.7, 0.1, 0.06), DSTEEL, ten, [IDL.x + 0.3, IDL.y, s * 1.105], [0, 0, 0.0]);
      put(G.cyl(0.03, 0.03, 0.5, 12, 'x'), STEEL, ten, [IDL.x + 0.55, IDL.y + 0.1, s * 1.105]);
      put(G.hexNut(0.04, 0.05), STEEL, ten, [IDL.x + 0.82, IDL.y + 0.1, s * 1.105], [0, 0, PI / 2]);
    }

    // ---- road wheels, arms, springs, shocks, return rollers
    {
      const rimProfile = (z0, z1) => [[0.17, z0], [0.35, z0], [0.372, z0 + 0.005], [WR - 0.012, z0 + 0.012], [WR, z0 + 0.03], [WR, z1 - 0.03], [WR - 0.012, z1 - 0.012], [0.372, z1 - 0.005], [0.35, z1], [0.17, z1]];
      const rubGeo = G.merge([G.lathe(rimProfile(0.075, 0.215), 44, 'z'), G.lathe(rimProfile(-0.215, -0.075), 44, 'z')]);
      const rubTreadGeo = G.merge([0.145, -0.145].map((z) => { const g = G.torus(WR - 0.002, 0.004, 4, 44, PI * 2, 'z'); g.translate(0, 0, z); return g; }));
      const steelParts = [G.cyl(0.17, 0.17, 0.46, 24, 'z'), G.cyl(0.33, 0.33, 0.028, 32, 'z', false).translate(0, 0, 0.215), G.cyl(0.33, 0.33, 0.028, 32, 'z').translate(0, 0, -0.215), G.cyl(0.33, 0.33, 0.028, 32, 'z').translate(0, 0, 0.075), G.cyl(0.33, 0.33, 0.028, 32, 'z').translate(0, 0, -0.075),
        G.cyl(0.07, 0.07, 0.05, 18, 'z').translate(0, 0, 0.25)];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; steelParts.push(G.at(G.hexNut(0.016, 0.02), [Math.cos(a) * 0.255, Math.sin(a) * 0.255, 0.236], [PI / 2, 0, 0]), G.at(G.hexNut(0.016, 0.02), [Math.cos(a) * 0.255, Math.sin(a) * 0.255, -0.236], [PI / 2, 0, 0])); }
      const steelGeo = G.merge(steelParts);
      const coilGeo = coil(0.04, 0.0085, 0.5, 7, 28);
      const armGeo = B(1, 0.1, 0.05);
      for (const s of [1, -1]) for (let i = 0; i < WX.length; i++) {
        const x = WX[i], name = `${i + 1} ${sideHe(s)}`, nameEn = `${i + 1} ${sideEn(s)}`;
        const wp = part(suspSys, { he: `גלגל מרכב ${name}`, en: `Road wheel ${nameEn}`, mat: 'פלדה + חישוק גומי כפול', desc: 'אחד משישה גלגלי מרכב בכל צד. שני חישוקי גומי נושאים את משקל הטנק, והזחל עובר ביניהם. 10 אומים מחזיקים כל צד.' }, { pos: [x, WY, s * TZ] });
        const spin = new THREE.Group(); wp.add(spin); rolling.push({ obj: spin, r: WR });
        const ms = mesh(steelGeo, WHEEL_M, { parent: spin }); mesh(rubGeo, RUBBER, { parent: spin });
        void ms; mesh(rubTreadGeo, DSTEEL, { parent: spin, cast: false });
        // arm
        const P = [x + 0.62, 0.72], A = [x, WY], dx = A[0] - P[0], dy = A[1] - P[1], ln = Math.hypot(dx, dy);
        const arm = part(suspSys, { he: `זרוע מתלה ${name}`, en: `Suspension arm ${nameEn}`, mat: 'פלדה יצוקה', desc: 'זרוע נגררת שמחברת את הגלגל לצד הגוף. כשהגלגל עולה על מכשול, הזרוע מסתובבת סביב ציר הקדמי ודוחסת את הקפיץ.' });
        put(B(ln + 0.14, 0.1, 0.05), CIRON, arm, [(P[0] + A[0]) / 2, (P[1] + A[1]) / 2, s * 1.1], [0, 0, Math.atan2(dy, dx)]);
        put(G.cyl(0.07, 0.07, 0.08, 20, 'z'), DSTEEL, arm, [P[0], P[1], s * 1.1]);
        put(G.cyl(0.05, 0.05, 0.12, 16, 'z'), STEEL, arm, [x, WY, s * 1.12]);
        const bump = part(arm, { he: `בולם נגיעה מגומי ${name}`, en: `Bump stop ${nameEn}`, mat: 'גומי', desc: 'כרית גומי שעוצרת את הזרוע לפני שהיא פוגעת בגוף, בחבטות חזקות.' });
        put(G.cyl(0.035, 0.045, 0.06, 14, 'y'), RUBBER, bump, [x + 0.2, 0.86, s * 1.1]);
        // coil spring (external, mounted on the hull side)
        const sp = part(suspSys, { he: `קפיץ מתלה ${name}`, en: `Coil spring ${nameEn}`, mat: 'פלדת קפיצים', desc: 'קפיץ סליל חיצוני — המרכבה היא אחד הטנקים היחידים עם מתלים בקפיצים חיצוניים, וכך אפשר להחליף אותם בלי לפתוח את הגוף.' });
        const top = [x + 0.34, 1.16], bot = [x + 0.2, 0.66], cl = Math.hypot(top[0] - bot[0], top[1] - bot[1]);
        const cmesh = mesh(coilGeo, M.metal(0x3d4147, 0.45), { parent: sp, pos: [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, s * 1.1], rot: [0, 0, Math.atan2(-(top[0] - bot[0]), top[1] - bot[1])] });
        cmesh.scale.y = cl / 0.5;
        put(G.cyl(0.05, 0.05, 0.02, 16, 'y'), DSTEEL, sp, [top[0], top[1] + 0.012, s * 1.1]); put(G.cyl(0.05, 0.05, 0.02, 16, 'y'), DSTEEL, sp, [bot[0], bot[1] - 0.012, s * 1.1]);
        // telescopic shock absorber
        const sh = part(suspSys, { he: `בולם זעזועים ${name}`, en: `Shock absorber ${nameEn}`, mat: 'פלדה + שמן הידראולי', desc: 'בולם טלסקופי שמרסן את התנודות של הקפיץ אחרי כל מהמורה, כדי שהצריח יישאר יציב וכוונת התותחן לא תקפוץ.' });
        const sb = [x + 0.08, 0.52], st = [x - 0.25, 1.05], sl = Math.hypot(st[0] - sb[0], st[1] - sb[1]), sa = Math.atan2(-(st[0] - sb[0]), st[1] - sb[1]);
        put(G.cyl(0.026, 0.026, sl * 0.55, 12, 'y'), M.metal(0x23252a, 0.4), sh, [lerp(sb[0], st[0], 0.27), lerp(sb[1], st[1], 0.27), s * 1.12], [0, 0, sa]);
        put(G.cyl(0.017, 0.017, sl * 0.55, 10, 'y'), M.chrome(), sh, [lerp(sb[0], st[0], 0.73), lerp(sb[1], st[1], 0.73), s * 1.12], [0, 0, sa]);
      }
      // return rollers (upper track support)
      const rr = 0.085;
      for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
        const f = [0.18, 0.4, 0.62, 0.84][i], px = lerp(t1[0], t2[0], f), py = lerp(t1[1], t2[1], f);
        const cx = px - nTop[0] * (0.03 + rr), cy = py - nTop[1] * (0.03 + rr);
        const rp = part(suspSys, { he: `גלגל תמיכה עליון ${i + 1} ${sideHe(s)}`, en: `Return roller ${i + 1} ${sideEn(s)}`, mat: 'פלדה + חישוק גומי', desc: 'גלגל קטן שתומך בחלק העליון של הזחל כדי שלא יתנדנד. יושב על זרוע קטנה שמחוברת לדופן הגוף.' }, { pos: [cx, cy, s * TZ] });
        const spin = new THREE.Group(); rp.add(spin); rolling.push({ obj: spin, r: rr });
        put(G.cyl(rr, rr, 0.1, 18, 'z'), RUBBER, spin, [0, 0, 0.08]); put(G.cyl(rr, rr, 0.1, 18, 'z'), RUBBER, spin, [0, 0, -0.08]); put(G.cyl(0.05, 0.05, 0.3, 14, 'z'), WHEEL_M, spin);
        put(B(0.07, 0.07, 0.36), DSTEEL, rp, [0, 0, -s * 0.28]);
      }
    }

    // ================================================================== SPONSONS, FENDERS, SKIRTS
    const skirts = [];
    const SKY = 1.46;                                        // skirt hinge height
    const SPA = Math.atan2(0.14, 0.81);                      // slope of the sponson plate (rises toward the hull)
    const sponY = (az) => SKY + ((1.86 - az) / 0.81) * 0.14; // sponson surface height at |z| = az
    const vTex = K.textTexture('V', { font: '900 260px "Arial Black", Arial', color: '#f1eee4', pad: 6 });
    const plateTex = (n) => n;
    void plateTex;
    for (const s of [1, -1]) {
      const sp = part(hullSys, { he: `מדף צד משופע (ספונסון) ${sideHe(s)}`, en: `Sloped sponson (${sideEn(s)})`, mat: 'פלדה בעובי 20 מ״מ + צלעות חיזוק', desc: 'לוח משופע שמחבר את דופן הגוף לראש החצאית. הוא מכסה את החלק העליון של הזחל, והשיפוע שלו מסיט פגזים ונותן לצוות מקום ללכת עליו.' });
      put(G.box(6.65, 0.05, 0.83, 0.015, 2), OLIVE, sp, [-0.375, 1.515, s * 1.455], [s * SPA, 0, 0], { name: 'sponson plate' });
      bolts(sp, Array.from({ length: 28 }, (_, i) => { const az = i % 2 ? 1.2 : 1.72; return { pos: [-3.45 + (i >> 1) * 0.47 + 0.24, sponY(az) + 0.027, s * az], rot: [s * SPA, 0, 0] }; }), 0.01);
      const ff = part(hullSys, { he: `כנף קדמית ${sideHe(s)}`, en: `Front fender (${sideEn(s)})`, mat: 'פלדה עם שוליים מחוזקים', desc: 'כנף משופעת שמגינה על גלגל ההנעה מפני אבנים ובוץ, ויורדת קדימה בהמשך לקו הגוף. על שפתה הקדמית מותקן מגן בוץ מגומי.' });
      put(G.box(0.98, 0.04, 0.78, 0.012, 2), OLIVE, ff, [3.475, 1.39, s * 1.425], [0, 0, -0.227], { name: 'fender plate' });
      put(G.box(0.96, 0.1, 0.03, 0.008, 2), OLIVE2, ff, [3.475, 1.34, s * 1.795], [0, 0, -0.227], { name: 'fender lip' });
      instances(G.bolt(0.01), DSTEEL, Array.from({ length: 6 }, (_, i) => { const x = 3.12 + (i >> 1) * 0.3; return { pos: [x, 1.39 + 0.027 + 0.227 * (3.475 - x), s * (i % 2 ? 1.18 : 1.68)], rot: [0, 0, -0.227] }; }), { parent: ff });
      const rf = part(hullSys, { he: `כנף אחורית ${sideHe(s)}`, en: `Rear fender (${sideEn(s)})`, mat: 'פלדה', desc: 'כנף קטנה מעל גלגל המתח האחורי.' });
      put(B(0.85, 0.04, 0.78), OLIVE, rf, [-3.93, 1.14, s * 1.425], null, { name: 'rear fender plate' });
      // side skirts: 6 hinged plates per side (a toggle lifts them to show the running gear); the first one is the long, chamfered front plate
      for (let i = 0; i < 6; i++) {
        const front = i === 5, half = front ? 0.67 : 0.4875, x = front ? 2.33 : -2.815 + i * 0.995;
        const sk = part(armorSys, { he: `חצאית שריון ${i + 1} ${sideHe(s)}${front ? ' (קדמית)' : ''}`, en: `Side skirt ${i + 1} (${sideEn(s)})${front ? ' front' : ''}`, mat: 'פלדה + שכבת גומי מרוחקת', desc: front ? 'החצאית הקדמית ארוכה יותר, והפינה התחתונה שלה חתוכה בשיפוע שעוקב אחרי עליית הזחל אל גלגל ההנעה. עליה מצויר הסימן הלבן של הפלוגה.' : 'לוחית שריון צד על ציר עליון. מגינה על הזחל והמתלים מפני נשק נגד טנקים קל, ואפשר להרים אותה לתחזוקה.' }, { pos: [x, SKY, s * SKZ] });
        if (front) put(sidePrism([[-half, 0], [half, 0], [half, -0.4], [0.3, -0.84], [-half, -0.84]], -0.03, 0.03), OLIVE2, sk, null, null, { name: 'skirt plate' });
        else put(G.box(2 * half, 0.84, 0.06, 0.014, 2), OLIVE2, sk, [0, -0.42, 0], null, { name: 'skirt plate' });
        put(B(2 * half - 0.12, 0.012, 0.012), DSTEEL, sk, [0, -0.4, s * 0.032]);
        put(B(2 * half - 0.04, 0.035, 0.02), OLIVE, sk, [0, -0.025, s * 0.04]);
        instances(G.bolt(0.012), DSTEEL, [[-half + 0.06, -0.1], [half - 0.06, -0.1], [-half + 0.06, -0.74], [half - 0.06, -0.74], [0, -0.1], [0, -0.74]].map(([bx, by]) => ({ pos: [bx, by, s * 0.03], rot: [s * PI / 2, 0, 0] })), { parent: sk });
        put(G.tube([V3(-0.09, -0.27, s * 0.03), V3(-0.09, -0.27, s * 0.075), V3(0.09, -0.27, s * 0.075), V3(0.09, -0.27, s * 0.03)], 0.01, 12, 6), STEEL, sk);
        if (front) { const g = new THREE.Group(); g.rotation.y = s > 0 ? 0 : PI; g.position.set(-0.15, -0.42, s * 0.034); sk.add(g); put(new THREE.PlaneGeometry(0.4, 0.4 / vTex.aspect), M.decal(vTex.tex), g, [0, 0, 0], null, { cast: false }); }
        const flap = part(sk, { he: `מגן גומי תחתון ${i + 1} ${sideHe(s)}`, en: `Rubber flap ${i + 1} (${sideEn(s)})`, mat: 'גומי מחוזק בבד', desc: 'פס גומי בתחתית החצאית. מונע אבק, וסופג מכות כשהטנק גורר חול ואבנים.' });
        put(G.box(front ? 0.84 : 2 * half, 0.14, 0.02, 0.008, 2), CAMO_RUB, flap, [front ? -0.25 : 0, -0.9, 0]);
        skirts.push(sk); sk.userData.s = s;
      }
      const hg = part(armorSys, { he: `פס צירים לחצאיות ${sideHe(s)}`, en: `Skirt hinge bar (${sideEn(s)})`, mat: 'פלדה מחוסמת', desc: 'ציר ארוך לאורך שולי המדף שעליו נתלות כל שש החצאיות.' });
      put(G.cyl(0.018, 0.018, 6.0, 10, 'x'), STEEL, hg, [-0.375, SKY, s * SKZ]);
    }

    // ================================================================== HULL + TURRET SMALL DETAILS
    {
      const dt = part(hullSys, { he: 'פנלים ותפרי סיפון המנוע', en: 'Engine-deck panel seams & bolts', mat: 'פלדה, ברגי ריתוך ובורגי פנל', desc: 'קווי המפגש בין לוחות הסיפון עם שורות ברגים. כל פנל נפתח לתחזוקה, ושורות הברגים נועדו לאטום מפני אבק וגז.' });
      for (const x of [1.72, 2.25, 2.95, 3.32]) {
        put(B(0.012, 0.005, 1.9), DSTEEL, dt, [x, deckY(x) + 0.003, 0], [0, 0, DECK_A]);
        bolts(dt, Array.from({ length: 13 }, (_, i) => ({ pos: [x + 0.03, deckY(x + 0.03) + 0.002, -0.9 + i * 0.15], rot: [0, 0, DECK_A] })), 0.008);
      }
      const hd = part(hullSys, { he: 'ידיות אחיזה וטבעות קשירה (סיפון)', en: 'Deck grab handles & tie-down rings', mat: 'פלדה מחושלת', desc: 'ידיות לצוות שעולה על הגוף, וטבעות קשירה לכבלים ולציוד. כל אחת רתומה לקורה שמתחת ללוח.' });
      for (const [x, z] of [[1.75, 0.92], [1.75, -0.92], [3.55, 0.66], [3.55, -0.66]]) { const h = new THREE.Group(); h.position.set(x, deckY(x) + 0.004, z); h.rotation.set(0, 0, DECK_A); hd.add(h); put(G.tube([V3(-0.07, 0, 0), V3(-0.07, 0.045, 0), V3(0.07, 0.045, 0), V3(0.07, 0, 0)], 0.009, 14, 6), STEEL, h); }
      const sh = part(hullSys, { he: 'ידיות אחיזה על הספונסון (12)', en: 'Sponson grab handles (×12)', mat: 'פלדה מגולוונת', desc: 'ידיות לאורך שפת הספונסון שעליהן אוחזים כשעולים לצריח או מורידים ציוד.' });
      for (const s of [1, -1]) for (let i = 0; i < 6; i++) { const x = -3.1 + i * 1.0, h = new THREE.Group(); h.position.set(x, sponY(1.76) + 0.02, s * 1.76); h.rotation.x = s * SPA; sh.add(h); put(G.tube([V3(-0.09, 0, 0), V3(-0.09, 0.05, 0), V3(0.09, 0.05, 0), V3(0.09, 0, 0)], 0.009, 14, 6), STEEL, h); }
      const hl = part(armorSys, { he: 'לשוניות ציר וקפיצי נעילה לחצאיות', en: 'Skirt hinge lugs & hold-open springs', mat: 'פלדה מחוסמת', desc: 'לשוניות על ציר החצאית וקפיץ נעילה שמחזיק אותה סגורה בנסיעה ופתוחה בתחזוקה.' });
      for (const s of [1, -1]) for (let i = 0; i < 6; i++) { const front = i === 5, x = front ? 2.33 : -2.815 + i * 0.995, half = front ? 0.67 : 0.4875; for (const dx of [-half + 0.1, half - 0.1]) { put(B(0.07, 0.05, 0.05), DSTEEL, hl, [x + dx, SKY + 0.01, s * (SKZ + 0.03)]); put(G.cyl(0.012, 0.012, 0.09, 8, 'z'), STEEL, hl, [x + dx, SKY + 0.01, s * (SKZ + 0.03)]); } }
      const rg = part(hullSys, { he: 'ידיות אחיזה אחוריות (2)', en: 'Rear grab handles (×2)', mat: 'פלדה', desc: 'ידיות לצד הדלת האחורית לצוות שנכנס ויוצא בריצה.' });
      for (const s of [1, -1]) put(G.tube([V3(-3.86, 0.8, s * 0.95), V3(-3.93, 0.8, s * 0.95), V3(-3.93, 1.3, s * 0.95), V3(-3.86, 1.3, s * 0.95)], 0.012, 16, 6), STEEL, rg);
    }

    // ================================================================== POWER PACK (front-right) + driver compartment (front-left)
    {
      const eng = part(powerSys, { he: 'מנוע GD883 (V12 דיזל)', en: 'GD883 V12 diesel engine', mat: 'אלומיניום ופלדה, 1,500 כ״ס', desc: 'מנוע דיזל V12 בתפוקה 1,500 כוח סוס (מבוסס MTU, יוצר ברישיון). בחזית הגוף הוא משמש כמגן לצוות מפני פגזים. ברגע שהצריח מתחיל להסתובב, המאוורר שלו כבר עובד.' });
      const E = [2.5, 0.0, 0.52];
      const ENGM = M.metal(0x5d6168, 0.48);
      const grp = new THREE.Group(); grp.position.set(E[0], 0.0, E[2]); eng.add(grp);
      put(B(1.0, 0.28, 0.46), ENGM, grp, [0, 0.76, 0], null, { name: 'crankcase' });
      put(B(0.9, 0.12, 0.42), CIRON, grp, [0, 0.58, 0], null, { name: 'oil sump' });
      for (const sd of [1, -1]) {
        const bank = new THREE.Group(); bank.position.set(0, 0.99, sd * 0.13); bank.rotation.x = sd * 0.62; grp.add(bank);
        put(B(0.92, 0.19, 0.17), ENGM, bank, null, null, { name: 'cylinder bank' });
        put(B(0.9, 0.05, 0.14), M.aluminum(), bank, [0, 0.12, 0], null, { name: 'cylinder head' });
        instances(B(0.11, 0.05, 0.12), M.darkChrome(), Array.from({ length: 6 }, (_, i) => ({ pos: [-0.38 + i * 0.152, 0.17, 0] })), { parent: bank });
        instances(G.bolt(0.01), DSTEEL, Array.from({ length: 12 }, (_, i) => ({ pos: [-0.38 + (i >> 1) * 0.152, 0.2, (i % 2 ? 0.045 : -0.045)] })), { parent: bank });
        // exhaust manifold on the outer side of each bank
        put(G.tube([V3(-0.4, 0.1, sd * 0.1), V3(0.0, 0.08, sd * 0.12), V3(0.4, 0.1, sd * 0.1)], 0.03, 18, 10), M.metal(0x4a3a30, 0.7), bank);
      }
      put(B(0.8, 0.1, 0.16), ENGM, grp, [0, 1.12, 0], null, { name: 'intake manifold' });
      const lines = part(eng, { he: 'צנרת הזרקת דלק', en: 'Fuel-injection lines', mat: 'פלדה בלחץ גבוה', desc: 'שבעה־עשר צינורות דקים מעבירים סולר בלחץ גבוה מהמשאבה אל המזרקים. כל צינור הוא באורך אחר, כדי שהזרקה תהיה סינכרונית.' });
      for (let i = 0; i < 6; i++) for (const sd of [1, -1]) put(G.tube([V3(E[0] - 0.38 + i * 0.152, 1.22, E[2]), V3(E[0] - 0.38 + i * 0.152, 1.28, E[2] + sd * 0.05), V3(E[0] - 0.38 + i * 0.152, 1.2, E[2] + sd * 0.15)], 0.005, 10, 5), M.copper(), lines);
      const turbo = part(eng, { he: 'מגדשי טורבו (2)', en: 'Turbochargers (×2)', mat: 'אלומיניום, פלדה נירוסטה', desc: 'שני טורבינות סדרתיות דוחסות את האוויר לפני שהוא נכנס לצילינדרים. בלעדיהן אי אפשר לגרום ל־12 צילינדרים להפיק 1,500 כוחות סוס.' });
      for (const sd of [1, -1]) { const t = new THREE.Group(); t.position.set(E[0] - 0.55, 0.98, E[2] + sd * 0.22); turbo.add(t); put(G.lathe([[0.001, -0.07], [0.07, -0.06], [0.1, 0], [0.07, 0.07], [0.04, 0.12], [0.001, 0.12]], 22, 'x'), M.metal(0x58524a, 0.5), t); put(G.cyl(0.04, 0.04, 0.12, 14, 'x'), DSTEEL, t, [-0.12, 0, 0]); put(G.tube([V3(0.0, 0.0, 0.0), V3(0.1, 0.1, -sd * 0.1), V3(0.3, 0.1, -sd * 0.18)], 0.03, 12, 8), M.metal(0x3b3835, 0.6), t); }
      const fan = part(eng, { he: 'מאוורר קירור', en: 'Cooling fan', mat: 'פלדה, 10 להבים', desc: 'מאוורר צירי גדול שמושך אוויר דרך הסורגים בגג ודרך הרדיאטורים. הוא מסתובב בזמן נסיעה ושואב את חום המנוע החוצה.' });
      const fanRot = new THREE.Group(); fanRot.position.set(1.62, 0.9, E[2]); fan.add(fanRot);
      put(G.cyl(0.07, 0.07, 0.1, 16, 'x'), DSTEEL, fanRot);
      instances(B(0.012, 0.3, 0.07), M.metal(0x2c2e33, 0.5), Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * PI * 2; return { pos: [0, Math.cos(a) * 0.19, Math.sin(a) * 0.19], rot: [a, 0.5, 0] }; }), { parent: fanRot });
      put(G.torus(0.36, 0.012, 8, 36, PI * 2, 'x'), DSTEEL, fan, [1.62, 0.9, E[2]], [0, PI / 2, 0]);
      K.onFrame((time, dt) => { fanRot.rotation.x += Math.min(speed, 1) * dt * 14; });
      const rad = part(eng, { he: 'רדיאטור וקירור שמן', en: 'Radiator & oil cooler', mat: 'אלומיניום עם סנפירים', desc: 'מעבירים את חום המים והשמן אל זרם האוויר. אלפי סנפירים דקים מגדילים את שטח המגע.' });
      put(B(0.12, 0.7, 0.82), M.castAlu(), rad, [1.82, 0.88, E[2]], null, { name: 'radiator core' });
      instances(B(0.1, 0.66, 0.006), M.aluminum(), Array.from({ length: 34 }, (_, i) => ({ pos: [1.82, 0.88, E[2] - 0.4 + i * 0.0245] })), { parent: rad });
      const mounts = part(eng, { he: 'בולמי מנוע וכן מתלה', en: 'Engine mounts', mat: 'פלדה וגומי', desc: 'ארבע כריות גומי ופלדה בולעות את הרעידות של המנוע, כדי שלא יעברו לצוות ולמכשירי הכוונה.' });
      for (const [dx, dz] of [[-0.4, -0.2], [-0.4, 0.2], [0.4, -0.2], [0.4, 0.2]]) { put(G.cyl(0.04, 0.05, 0.06, 12, 'y'), RUBBER, mounts, [E[0] + dx, 0.56, E[2] + dz]); put(B(0.1, 0.02, 0.1), DSTEEL, mounts, [E[0] + dx, 0.53, E[2] + dz]); }
      const air = part(eng, { he: 'מסנן אוויר (ציקלונים)', en: 'Air cleaner (cyclones)', mat: 'פלסטיק + פלדה', desc: 'מסנן אבק רב־ציקלוני: מרכזי אוויר מסתובבים משליכים את האבק החוצה. חיוני במדבר, שבו חול הורס מנוע תוך שעות.' });
      put(B(0.5, 0.16, 0.3), M.plastic(0x2c2d30, 0.7), air, [E[0] - 0.05, 1.12, E[2] - 0.15]);
      instances(G.cyl(0.032, 0.032, 0.12, 12, 'y'), DSTEEL, Array.from({ length: 12 }, (_, i) => ({ pos: [E[0] - 0.25 + (i % 6) * 0.1, 1.26, E[2] - 0.22 + Math.floor(i / 6) * 0.1] })), { parent: air });

      const tr = part(powerSys, { he: 'תמסורת אוטומטית RK325', en: 'RK325 automatic transmission', mat: 'אלומיניום יצוק וגלגלי שיניים', desc: 'תמסורת אוטומטית עם 5 הילוכים קדימה ו־2 אחורה (לפי פרסומים). מובנית בחזית כדי שהמנוע והתמסורת ישמשו שריון לצוות.' });
      put(B(0.62, 0.5, 0.64), M.metal(0x6c7077, 0.5), tr, [3.2, 0.82, 0.52], null, { name: 'gearbox case' });
      put(G.cyl(0.2, 0.2, 0.2, 28, 'x'), CIRON, tr, [2.88, 0.85, 0.52], null, { name: 'torque converter housing' });
      instances(G.bolt(0.011), DSTEEL, Array.from({ length: 14 }, (_, i) => ({ pos: [3.2 + (i % 7) * 0.075 - 0.225, 1.075, 0.52 + (i < 7 ? -0.14 : 0.14)] })), { parent: tr });
      const brk = part(powerSys, { he: 'בלמי דיסק (2)', en: 'Disc brakes (×2)', mat: 'פלדה, קליפרים מאלומיניום', desc: 'דיסק בלם וקליפר בכל צד של התמסורת. הם עוצרים טנק של 65 טון כאשר הנהג לוחץ על הדוושה.' });
      for (const s of [1, -1]) { put(G.cyl(0.17, 0.17, 0.025, 28, 'z'), M.darkSteel(), brk, [SPR.x - 0.03, SPR.y, s * 0.99]); put(B(0.1, 0.1, 0.07), M.metal(0xb02a22, 0.4), brk, [SPR.x - 0.03, SPR.y + 0.18, s * 0.99]); }
      const shaft = part(powerSys, { he: 'ציר הנעה רוחבי', en: 'Cross-drive shaft', mat: 'פלדה מחוסמת', desc: 'ציר שחוצה את הגוף ממש מאחורי החוטם ומעביר כוח מהתמסורת אל שתי תיבות ההנעה הסופיות, ומשם לגלגלי ההנעה.' });
      put(G.cyl(0.045, 0.045, 2.0, 16, 'z'), M.metal(0x6a6e75, 0.3), shaft, [SPR.x, SPR.y, 0]);
      for (const z of [-0.78, -0.42, 0.9]) put(G.cyl(0.07, 0.07, 0.05, 16, 'z'), DSTEEL, shaft, [SPR.x, SPR.y, z]);
      const dshaft = part(powerSys, { he: 'ציר מנוע–תמסורת', en: 'Engine–gearbox driveshaft', mat: 'פלדה', desc: 'ציר קצר עם מצמד גמיש שמעביר את סיבובי המנוע אל ממיר המומנט של התמסורת.' });
      put(G.cyl(0.04, 0.04, 0.35, 14, 'x'), M.metal(0x6a6e75, 0.3), dshaft, [3.02, 0.85, 0.52]);
      const ex = part(powerSys, { he: 'מערכת פליטה', en: 'Exhaust system', mat: 'פלדה עמידת חום', desc: 'צינורות פליטה מוסתרים מתחת לסיפון, מחוברים לגרילי הפליטה ומוגנים בלוחות בידוד תרמי כדי להקטין את חתימת החום.' });
      for (const z of [0.3, 0.72]) put(G.tube([V3(2.55, 1.1, z), V3(2.2, 1.25, z), V3(1.85, 1.32, z)], 0.055, 20, 10), M.metal(0x4a3a30, 0.7), ex);
      const fuel = part(powerSys, { he: 'מיכלי דלק (שמאל, חזית)', en: 'Fuel tanks (front-left)', mat: 'פלדה/פלסטיק עם קצף מונע פיצוץ', desc: 'הדלק נמצא בצד שמאל של חזית הגוף ובמקומות נוספים. הוא נוסף על השריון — פגז שפוגע בדלק נבלם לפני שהוא מגיע לצוות.' });
      put(B(0.5, 0.52, 0.82), M.paintFlat(0x3a4a3a, 0.7), fuel, [1.88, 0.8, -0.5]);
      put(G.cyl(0.04, 0.04, 0.06, 12, 'y'), STEEL, fuel, [1.88, 1.08, -0.5]);
      const bat = part(powerSys, { he: 'מערך מצברים (4)', en: 'Battery bank (×4)', mat: 'עופרת־חומצה / ליתיום', desc: 'ארבעה מצברים בצד הנהג. הם מניעים את המנוע, את הצריח ואת מערכות הלילה כשהמנוע כבוי.' });
      for (let i = 0; i < 4; i++) { const bx = 3.05 + (i >> 1) * 0.31, bz = -0.2 - (i % 2) * 0.18; put(B(0.28, 0.24, 0.17), M.plastic(0x23262c, 0.6), bat, [bx, 0.64, bz]); }
      for (let i = 0; i < 4; i++) { const bx = 3.05 + (i >> 1) * 0.31, bz = -0.2 - (i % 2) * 0.18; put(G.cyl(0.015, 0.015, 0.02, 8, 'y'), M.metal(0xb0b0b0, 0.3), bat, [bx - 0.08, 0.775, bz]); put(G.cyl(0.015, 0.015, 0.02, 8, 'y'), M.copper(), bat, [bx + 0.08, 0.775, bz]); }
    }

    // ================================================================== TURRET
    const sub = (parent, sysId, info, o) => { const p = part(parent, info, o); p.userData.sysOverride = sysId; return p; };
    const faceRot = (n) => { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(...n).normalize())); return [e.x, e.y, e.z]; };
    const TB = 0.04, TR = 0.68;                           // turret body bottom / main roof height (local y)
    // turret stations: [x, half-width at the bottom, half-width at the roof edge, roof height]. Sides lean inward ~35°.
    const ST = [[-3.10, 0.90, 0.78, 0.60], [-2.95, 1.02, 0.86, 0.66], [-1.60, 1.42, 0.98, 0.68], [-0.40, 1.48, 1.02, 0.68], [0.50, 1.40, 0.98, 0.64], [1.20, 1.10, 0.80, 0.54], [1.70, 0.88, 0.66, 0.44], [2.10, 0.70, 0.56, 0.34]];
    const stAt = (x) => {
      x = clamp(x, ST[0][0], ST[ST.length - 1][0]);
      for (let i = 0; i < ST.length - 1; i++) if (x <= ST[i + 1][0]) { const t = (x - ST[i][0]) / (ST[i + 1][0] - ST[i][0]); return [1, 2, 3].map((k) => lerp(ST[i][k], ST[i + 1][k], t)); }
      return ST[ST.length - 1].slice(1);
    };
    const roofY = (x) => stAt(x)[2];
    // point on the sloping side of the turret: side = ±1, f = 0 (bottom) … 1 (roof edge)
    const surfPt = (side, x, f) => { const [wb, wt, yt] = stAt(x); return V3(x, TB + f * (yt - TB), side * lerp(wb, wt, f)); };
    const surfN = (side, x, f) => { const e = 0.01; const dx = surfPt(side, x + e, f).sub(surfPt(side, x - e, f)), dy = surfPt(side, x, f + e).sub(surfPt(side, x, f - e)); return dx.cross(dy).normalize().multiplyScalar(side); };
    // quads → one BufferGeometry with flat normals oriented away from `inside`
    const quadsGeo = (quads, inside) => {
      const pos = [], nor = [];
      for (let q of quads) {
        const n = q[1].clone().sub(q[0]).cross(q[3].clone().sub(q[0])).normalize();
        const c = q.reduce((a, v) => a.add(v), V3()).multiplyScalar(0.25);
        if (inside && n.dot(c.sub(inside)) < 0) q = q.slice().reverse(), n.negate();
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i].x, q[i].y, q[i].z); nor.push(n.x, n.y, n.z); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      return g;
    };
    // a raised armour module on the sloping side: corners on the surface, pushed out by t along the normal
    const modGeo = (side, xa, xb, fa, fb, t) => {
      const c = [[xa, fa], [xb, fa], [xb, fb], [xa, fb]].map(([x, f]) => surfPt(side, x, f));
      const n = surfN(side, (xa + xb) / 2, (fa + fb) / 2);
      const cen = c.reduce((a, v) => a.add(v), V3()).multiplyScalar(0.25);
      const o = c.map((p) => p.clone().addScaledVector(n, t).lerp(cen.clone().addScaledVector(n, t), 0.06));
      const mid = c.reduce((a, v) => a.add(v), V3()).multiplyScalar(0.25).addScaledVector(n, -0.2);
      return { geo: quadsGeo([o, [o[0], o[1], c[1], c[0]], [o[1], o[2], c[2], c[1]], [o[2], o[3], c[3], c[2]], [o[3], o[0], c[0], c[3]]], mid), n, o, c };
    };
    const tur = part(turretSys, { he: 'צריח (מכלול)', en: 'Turret assembly', mat: 'פלדת שריון + מודולי שריון מרוחק', desc: 'הצריח של המרכבה ארוך ורחב, בצורת טריז. הוא מרוחק מקדמת הגוף כדי לשבת מעל תא הלחימה האחורי, והתא שמתחתיו משמש גם לתחמושת.' }, { pos: [RING.x, TUR_Y, 0] });
    // ---- turret shell, armour, hatches
    let cup, ld;
    {
      // ring bearing + ring gear + skirt
      const ringB = part(tur, { he: 'מסב טבעת הצריח', en: 'Turret ring bearing', mat: 'פלדה מחוסמת, מסב כדורי כפול', desc: 'מסב כדורי ענק בקוטר ~1.9 מ׳ שעליו מסתובב כל הצריח, 65 טון בסך הכול, בעזרת מנוע חשמלי והילוך שיניים.' });
      put(G.torus(RING.r, 0.045, 10, 56, PI * 2, 'y'), M.steel(), ringB, [0, -0.012, 0]);
      put(G.torus(RING.r - 0.06, 0.028, 8, 56, PI * 2, 'y'), DSTEEL, ringB, [0, -0.03, 0]);
      instances(B(0.03, 0.05, 0.05), M.steel(), Array.from({ length: 90 }, (_, i) => { const a = (i / 90) * PI * 2; return { pos: [Math.cos(a) * (RING.r - 0.1), -0.06, Math.sin(a) * (RING.r - 0.1)], rot: [0, -a, 0] }; }), { parent: ringB });
      bolts(ringB, Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * PI * 2; return { pos: [Math.cos(a) * (RING.r + 0.015), 0.01, Math.sin(a) * (RING.r + 0.015)] }; }), 0.012);
      const base = part(tur, { he: 'חצאית הצריח', en: 'Turret skirt', mat: 'פלדת שריון', desc: 'הטבעת התחתונה של הצריח, מכסה את המסב ומונעת משברי פגזים לחדור ברווח שבין הצריח לגוף.' });
      put(G.cyl(RING.r + 0.07, RING.r + 0.07, 0.16, 48, 'y', true), OLIVE, base, [0, 0.08, 0]);

      // shell: lofted between the bottom outline and the (narrower, lower) roof outline, so the sides lean inward
      const shell = part(tur, { he: 'מעטפת הצריח', en: 'Turret shell', mat: 'פלדת שריון יצוקה ומרותכת', desc: 'המעטפת המרכזית של הצריח, בצורת טריז נמוך. הדפנות נוטות פנימה בכ־35° והגג משתפל קדימה, כדי להסיט פגזים כלפי מעלה.' });
      {
        const q = [], last = ST.length - 1;
        for (let i = 0; i < last; i++) {
          const [x0, b0, t0, y0] = ST[i], [x1, b1, t1, y1] = ST[i + 1];
          q.push([V3(x0, TB, b0), V3(x1, TB, b1), V3(x1, y1, t1), V3(x0, y0, t0)]);
          q.push([V3(x1, TB, -b1), V3(x0, TB, -b0), V3(x0, y0, -t0), V3(x1, y1, -t1)]);
          q.push([V3(x0, y0, -t0), V3(x0, y0, t0), V3(x1, y1, t1), V3(x1, y1, -t1)]);
        }
        const [xf, bf, tf, yf] = ST[last], [xr, br, tr, yr] = ST[0];
        q.push([V3(xf, TB, bf), V3(xf, TB, -bf), V3(xf, yf, -tf), V3(xf, yf, tf)]);
        q.push([V3(xr, TB, -br), V3(xr, TB, br), V3(xr, yr, tr), V3(xr, yr, -tr)]);
        put(quadsGeo(q, V3(-0.5, 0.3, 0)), OLIVE, shell, null, null, { name: 'lofted shell' });
      }
      // weld seams along the roof edge + roof panel lines
      const roofP = part(tur, { he: 'גג הצריח (תפרי ריתוך וקווי פנלים)', en: 'Turret roof (weld seams & panel lines)', mat: 'פלדת שריון, 40 מ״מ (הערכה)', desc: 'הגג בנוי מלוחות מרותכים; תפרי הריתוך נראים כרצועות בולטות. הגג משתפל קדימה כדי להקטין את הסיכוי לפגיעה ישירה.' });
      for (const sd of [1, -1]) put(G.tube(ST.map(([x, , t, y]) => V3(x, y + 0.004, sd * (t - 0.012))), 0.007, 50, 5), DSTEEL, roofP);
      for (const x of [-2.2, -1.9, 0.0, 0.3]) put(B(0.014, 0.008, 2 * stAt(x)[1] - 0.06), DSTEEL, roofP, [x, roofY(x) + 0.004, 0]);
      bolts(roofP, Array.from({ length: 40 }, (_, i) => { const x = -2.7 + (i >> 1) * 0.145; return { pos: [x, roofY(x) + 0.004, (i % 2 ? 1 : -1) * (stAt(x)[1] - 0.09)] }; }), 0.009);

      // side + rear modular armour, following the slope: 2 rows at the rear and middle, 1 row at the front
      const bx = [[-2.9, -2.1, 2], [-2.1, -1.3, 2], [-1.3, -0.5, 2], [-0.5, 0.3, 2], [0.3, 1.0, 1], [1.0, 1.55, 1], [1.55, 2.05, 1]];
      let mi = 0;
      for (const side of [1, -1]) {
        for (const [xa, xb, rows] of bx) for (let r = 0; r < rows; r++) {
          const fa = rows === 2 ? (r ? 0.54 : 0.09) : 0.11, fb = rows === 2 ? (r ? 0.93 : 0.51) : 0.9;
          const m = modGeo(side, xa + 0.012, xb - 0.012, fa, fb, 0.07);
          const mp = part(armorSys, { he: `מודול שריון ${++mi} ${sideHe(side)}`, en: `Armour module ${mi} (${sideEn(side)})`, mat: 'פלדה + שכבות קרמיקה ופולימר (הערכה)', desc: 'לוח שריון מודולרי בקופסת פלדה על דופן הצריח. אם נפגע, מחליפים רק אותו ולא את כל הצריח — עיקרון המודולריות של המרכבה.' });
          tur.add(mp); mp.userData.sysOverride = 'armor';
          put(m.geo, OLIVE2, mp, null, null, { name: 'module box' });
          const bl = [];
          for (const [u, w] of [[0.1, 0.12], [0.5, 0.12], [0.9, 0.12], [0.1, 0.88], [0.5, 0.88], [0.9, 0.88]]) { const p = m.o[0].clone().lerp(m.o[1], u).lerp(m.o[3].clone().lerp(m.o[2], u), w); bl.push({ pos: p.toArray(), rot: faceRot(m.n.toArray()) }); }
          bolts(mp, bl, 0.011);
        }
      }
      // rear plate of the bustle
      const rp = part(tur, { he: 'לוח אחורי של הצריח', en: 'Bustle rear plate', mat: 'פלדת שריון', desc: 'הקיר האחורי של הצריח, שמגן על התחמושת והציוד. בדומה לדלת הגוף, הוא מחולק לפנלים שאפשר לפרק.' });
      put(B(0.05, 0.46, 1.5), OLIVE2, rp, [-3.125, 0.32, 0]);
      for (let i = 0; i < 4; i++) put(B(0.03, 0.4, 0.04), OLIVE, rp, [-3.16, 0.32, -0.56 + i * 0.37]);
      bolts(rp, Array.from({ length: 16 }, (_, i) => ({ pos: [-3.152, 0.14 + (i % 2) * 0.36, -0.7 + (i >> 1) * 0.2], rot: [0, 0, PI / 2] })), 0.011);
      // chain curtain under the bustle ("ball-and-chain")
      const ch = sub(tur, 'armor', { he: 'וילון שרשראות אחורי', en: 'Bustle chain curtain', mat: 'פלדה מגולוונת + משקולות', desc: 'כ־30 שרשראות עם כדורי משקל תלויות בחלקו האחורי של הצריח. הן מפעילות את תרמילי הנפץ של טילי נ״ט לפני שהם פוגעים בשריון. פתרון פשוט, זול ויעיל.' });
      put(G.cyl(0.014, 0.014, 1.7, 10, 'z'), DSTEEL, ch, [-3.17, 0.14, 0]);
      const links = [], balls = [];
      for (let c = 0; c < 29; c++) { const z = -0.84 + c * 0.06; for (let k = 0; k < 5; k++) links.push({ pos: [-3.17, 0.1 - k * 0.035, z], rot: [0, k % 2 ? 0 : PI / 2, 0], scale: 1 }); balls.push({ pos: [-3.17, 0.1 - 5 * 0.035 - 0.012, z] }); }
      instances(G.torus(0.012, 0.0035, 5, 10, PI * 2, 'z'), STEEL, links, { parent: ch });
      instances(G.sphere(0.014, 10, 8), M.metal(0x44464a, 0.5), balls, { parent: ch });

      // turret-mounted: cupola, loader hatch (hatches belong to the turret system)
      cup = part(tur, { he: 'כיפת המפקד', en: 'Commander cupola', mat: 'פלדת שריון יצוקה', desc: 'המפקד יושב מימין. מסביבו 8 פריסקופים ושמשות שריון, כך שיכול לצפות 360° בלי להוציא את הראש. אפשר גם לפתוח את הצוהר ולצאת החוצה.' }, { pos: [-0.9, TR + 0.02, 0.62] });
      put(G.cyl(0.36, 0.4, 0.13, 36, 'y'), OLIVE, cup, [0, 0.065, 0]);
      put(G.cyl(0.33, 0.33, 0.03, 36, 'y'), OLIVE2, cup, [0, 0.145, 0]);
      put(G.torus(0.285, 0.012, 8, 40, PI * 2, 'y'), M.rubber(), cup, [0, 0.162, 0]);
      bolts(cup, Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * PI * 2; return { pos: [Math.cos(a) * 0.345, 0.16, Math.sin(a) * 0.345] }; }), 0.011);
      const cl = part(cup, { he: 'מכסה צוהר המפקד', en: 'Commander hatch lid', mat: 'פלדת שריון + אטם', desc: 'מכסה עגול על ציר אחורי עם אטם גומי נגד גז ואבק. כשהוא נסגר הצוות מבודד לגמרי, כולל מפני נשק כימי וביולוגי.' }, { pos: [-0.3, 0.17, 0] });
      put(G.cyl(0.29, 0.3, 0.045, 36, 'y'), OLIVE, cl, [0.3, 0.0, 0]);
      put(G.cyl(0.08, 0.1, 0.03, 20, 'y'), OLIVE2, cl, [0.3, 0.04, 0]);
      put(G.torus(0.045, 0.01, 8, 18, PI, 'y'), DSTEEL, cl, [0.55, 0.045, 0]);
      lidDetails(cl, 0.3, 0.29, 0.022);
      hatches.push({ obj: cl, axis: 'z', sign: 1, max: 1.3, id: 'cmdr' });
      // loader hatch
      ld = part(tur, { he: 'צוהר הטען', en: 'Loader hatch', mat: 'פלדת שריון', desc: 'הטען יושב משמאל. הצוהר המרובע נפתח לאחור ומאפשר לו לצאת ולטעון בעמידה.' }, { pos: [-1.0, TR + 0.02, -0.62] });
      put(G.cyl(0.33, 0.35, 0.09, 36, 'y'), OLIVE, ld, [0, 0.045, 0]);
      const lc = part(ld, { he: 'מכסה צוהר הטען', en: 'Loader hatch lid', mat: 'פלדה + אטם', desc: 'מכסה עם ציר אחורי ומנעול פנימי.' }, { pos: [-0.28, 0.1, 0] });
      put(G.cyl(0.27, 0.27, 0.04, 32, 'y'), OLIVE, lc, [0.28, 0.0, 0]);
      put(G.torus(0.04, 0.009, 8, 16, PI, 'y'), DSTEEL, lc, [0.5, 0.04, 0]);
      lidDetails(lc, 0.28, 0.27, 0.02);
      hatches.push({ obj: lc, axis: 'z', sign: 1, max: 1.25, id: 'loader' });
      const rgh = part(tur, { he: 'ידיות אחיזה על הגג (6)', en: 'Roof grab handles (×6)', mat: 'פלדה מצופה', desc: 'ידיות לצוות שנע על גג הצריח ומטפס אל הצוהרים, ולהחזקה בזמן נסיעה בשטח.' });
      for (const [x, z] of [[-1.7, 0.75], [-1.7, -0.75], [-0.4, 0.05], [-2.3, 0.0], [0.3, -0.5], [0.3, 0.7]]) put(G.tube([V3(-0.09, 0, 0), V3(-0.09, 0.05, 0), V3(0.09, 0.05, 0), V3(0.09, 0, 0)], 0.009, 14, 6), STEEL, rgh, [x, roofY(x) + 0.004, z]);

      // smoke grenade dischargers (2 banks of 8) on the front cheeks
      for (const sd of [1, -1]) {
        const pt = surfPt(sd, 1.62, 0.5), n = surfN(sd, 1.62, 0.5);
        const bank = part(equipSys, { he: `משגר רימוני עשן ${sideHe(sd)} (8)`, en: `Smoke launcher (${sideEn(sd)}, ×8)`, mat: 'פלדה + עדשות', desc: 'שמונה קנים שמשגרים רימוני עשן קדימה, ליצירת מסך מגן. הם מכוונים כך שהעשן יתפשט לפני הטנק.' });
        tur.add(bank); bank.userData.sysOverride = 'equip';
        bank.position.copy(pt).addScaledVector(n, 0.13); bank.rotation.y = Math.atan2(-n.z, n.x);
        put(B(0.12, 0.05, 0.5), DSTEEL, bank, [-0.04, -0.07, 0]);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { put(G.cyl(0.037, 0.037, 0.2, 14, 'x'), M.metal(0x34373b, 0.5), bank, [0.04, r * 0.085, -0.18 + c * 0.12]); put(G.cyl(0.03, 0.03, 0.01, 12, 'x'), BLACK, bank, [0.145, r * 0.085, -0.18 + c * 0.12]); }
        put(B(0.02, 0.2, 0.5), DSTEEL, bank, [-0.07, 0.04, 0]);
      }
    }

    // ================================================================== GUN (120 mm MG253), elevates on the trunnion
    const gunG = sub(tur, 'gun', { he: 'מכלול התותח 120 מ״מ', en: '120 mm gun assembly', mat: 'פלדת תותחים, ציפוי כרום בקנה', desc: 'התותח החלק MG253 בקוטר 120 מ״מ — אחד התותחים החזקים בעולם. פגזי חץ (APFSDS) יוצאים ממנו במהירות של כ־1,700 מטר בשנייה, והוא יכול גם לשגר טילי LAHAT.' }, { pos: [GUN.x, GUN.y, 0] });
    {
      const barrelMat = M.metal(0x2c2f33, 0.45);
      const mant = sub(gunG, 'gun', { he: 'מגן תותח (מנטלט)', en: 'Gun mantlet', mat: 'פלדת שריון יצוקה', desc: 'הגוש הכבד שמגן על פתח התותח בחזית הצריח. הוא נע יחד עם התותח ומשמש גם כשריון, והצורה שלו מסיטה פגזים כלפי מעלה.' });
      put(sidePrism([[0.0, -0.2], [0.3, -0.16], [0.5, 0.0], [0.38, 0.3], [0.0, 0.3]], -0.5, 0.5), OLIVE2, mant, null, null, { name: 'mantlet block' });
      put(sidePrism([[0.0, 0.3], [0.38, 0.3], [0.52, 0.12], [0.5, 0.0], [0.0, 0.0]], -0.58, -0.5), OLIVE, mant, null, null, { name: 'mantlet cheek L' });
      put(sidePrism([[0.0, 0.3], [0.38, 0.3], [0.52, 0.12], [0.5, 0.0], [0.0, 0.0]], 0.5, 0.58), OLIVE, mant, null, null, { name: 'mantlet cheek R' });
      put(G.cyl(0.13, 0.115, 0.16, 28, 'x'), M.rubber(), mant, [0.58, 0.0, 0.0], null, { name: 'dust boot' });
      bolts(mant, [[-0.4, 0.1], [0.4, 0.1], [-0.4, -0.1], [0.4, -0.1], [-0.2, 0.2], [0.2, 0.2], [-0.3, 0.0], [0.3, 0.0]].map(([z, y]) => ({ pos: [0.3 + (y < 0.0 ? 0.0 : 0.0), y + 0.08, z], rot: [0, 0, -PI / 2 + 0.0] })), 0.013);
      const tube = sub(gunG, 'gun', { he: 'קנה התותח', en: 'Gun barrel', mat: 'פלדת תותחים מצופה כרום', desc: 'קנה חלק באורך כ־5.5 מ׳ (מתוכם חלק בתוך הצריח). חלק, בלי חריצים, כי הפגז הוא חץ שמסתובב בעצמו מהמייצבים שבגופו.' });
      put(G.cyl(0.075, 0.066, GUN.len - 0.5, 36, 'x'), barrelMat, tube, [0.5 + (GUN.len - 0.5) / 2, 0, 0], null, { name: 'tube' });
      put(G.cyl(0.095, 0.095, 0.7, 28, 'x'), M.darkSteel(), tube, [0.35, 0, 0], null, { name: 'cradle sleeve' });
      const sleeve = sub(gunG, 'gun', { he: 'שרוול תרמי', en: 'Thermal sleeve', mat: 'סיבי זכוכית בשרוול דו־שכבתי', desc: 'שרוול סיבי זכוכית שמשווה את הטמפרטורה סביב הקנה. בלי שרוול, שמש חמה או גשם יעקמו את הקנה בכמה מילימטרים ויקלקלו את דיוק האש.' });
      put(G.cyl(0.108, 0.108, 3.0, 36, 'x'), dusty(0x4b4d3f, { r: 0.9, m: 0.05, dust: 0.25, name: 'סיבי זכוכית' }), sleeve, [2.05, 0, 0], null, { name: 'sleeve' });
      instances(G.torus(0.11, 0.0065, 6, 32, PI * 2, 'x'), M.darkChrome(), Array.from({ length: 10 }, (_, i) => ({ pos: [0.7 + i * 0.31, 0, 0] })), { parent: sleeve });
      instances(B(0.05, 0.02, 0.03), M.darkChrome(), Array.from({ length: 10 }, (_, i) => ({ pos: [0.7 + i * 0.31, 0.112, 0] })), { parent: sleeve });
      const evac = sub(gunG, 'gun', { he: 'מפלט גזים (איבקואטור)', en: 'Bore evacuator', mat: 'פלדה', desc: 'מיכל גזים עם צינורות כיוונים. אחרי כל ירייה הוא מנקז את אבק השריפה מהקנה, כדי שלא יזרום לתוך הצריח בעת פתיחת הבריח.' });
      put(G.lathe([[0.075, -0.2], [0.11, -0.16], [0.125, -0.1], [0.125, 0.1], [0.11, 0.16], [0.075, 0.2]], 32, 'x'), dusty(0x4b4d3f, { r: 0.7, m: 0.4, dust: 0.25, name: 'פלדה צבועה' }), evac, [3.3, 0, 0], null, { name: 'evacuator' });
      for (const a of [0.7, -0.7, 2.4, -2.4]) put(G.cyl(0.012, 0.012, 0.16, 8, 'x'), STEEL, evac, [3.3, Math.sin(a) * 0.125, Math.cos(a) * 0.125], [0, 0, 0.0]);
      const mrs = sub(gunG, 'gun', { he: 'מערכת כיול לוע (MRS)', en: 'Muzzle reference system', mat: 'פלדה + מראה אופטית', desc: 'מראה קטנה בקצה הקנה שמשקפת קרן לכוונת. האופטיקה מודדת סטייה של הקנה בין ירייה לירייה ומתקנת אוטומטית.' });
      put(G.cyl(0.075, 0.075, 0.12, 24, 'x'), M.darkSteel(), mrs, [GUN.len - 0.06, 0, 0], null, { name: 'muzzle collar' });
      put(G.torus(0.068, 0.012, 8, 28, PI * 2, 'x'), STEEL, mrs, [GUN.len - 0.005, 0, 0]);
      put(B(0.16, 0.1, 0.1), M.darkSteel(), mrs, [GUN.len - 0.16, 0.1, 0]);
      put(B(0.012, 0.07, 0.08), M.lens(0x66ccff, 0.55), mrs, [GUN.len - 0.075, 0.1, 0]);
      const bore = put(G.cyl(0.044, 0.044, 0.02, 20, 'x'), BLACK, mrs, [GUN.len + 0.002, 0, 0], null, { name: 'bore', cast: false });
      void bore;
      // breech + recoil system, inside the turret
      const brc = sub(gunG, 'gun', { he: 'בריח וקופסת קנה', en: 'Breech & breech ring', mat: 'פלדה מחושלת', desc: 'הבריח האנכי נפתח למעלה וסוגר את התא אחרי שהטען מכניס פגז. הוא מחזיק לחץ של אלפי אטמוספרות בשבריר שנייה.' });
      put(B(0.5, 0.34, 0.34), M.darkSteel(), brc, [-0.45, 0.0, 0], null, { name: 'breech ring' });
      put(B(0.4, 0.2, 0.3), M.castIron(), brc, [-0.8, 0.0, 0]);
      put(G.cyl(0.03, 0.03, 0.12, 12, 'y'), STEEL, brc, [-0.48, 0.2, 0]);
      const rec = sub(gunG, 'gun', { he: 'בולמי רתע (2) ומחזירי קנה', en: 'Recoil cylinders (×2)', mat: 'פלדה, שמן הידראולי וחנקן', desc: 'שני בוכנות הידראוליות סופגות את אנרגיית הרתע ומחזירות את הקנה למקומו. הרתע של ירייה כזאת הוא כמה עשרות ק״ג־מטר.' });
      for (const z of [-0.2, 0.2]) { put(G.cyl(0.04, 0.04, 0.8, 16, 'x'), M.metal(0x3d4147, 0.4), rec, [-0.2, 0.02, z]); put(G.cyl(0.02, 0.02, 0.9, 12, 'x'), M.chrome(), rec, [-0.1, 0.02, z]); }
      const tag = sub(gunG, 'gun', { he: 'לוחית התותח', en: 'Gun data plate', mat: 'פליז חרוט', desc: 'לוחית שמזהה את התותח: קליבר, דגם ומספר סידורי.' });
      const tx = K.textTexture('120 mm  MG253', { font: '700 80px Arial', color: '#e8dcc0', bg: '#2a2a22' });
      put(B(0.2, 0.05, 0.004), M.decal(tx.tex), tag, [-0.43, 0.0, 0.172], null, { cast: false });
      // coaxial MG (MAG 7.62 mm) beside the barrel, inside the mantlet
      const cox = sub(gunG, 'gun', { he: 'מקלע תוואי (7.62 מ״מ)', en: 'Coaxial machine gun (7.62 mm)', mat: 'פלדה, חטיבת נשק', desc: 'מקלע MAG שמותקן ליד התותח ויורה באותו כיוון בו־זמנית. משמש נגד חי״ר, והתוואי עוזר לכוון.' });
      put(G.cyl(0.015, 0.015, 0.9, 12, 'x'), STEEL, cox, [0.9, -0.03, 0.27]); put(B(0.45, 0.1, 0.07), M.darkSteel(), cox, [0.1, -0.03, 0.27]);
      put(B(0.2, 0.14, 0.12), M.plastic(0x38402e, 0.6), cox, [0.3, -0.14, 0.27]);
    }

    // ================================================================== OPTICS + MACHINE GUNS (on the roof)
    {
      const gs = sub(tur, 'optics', { he: 'ראש כוונת התותחן', en: 'Gunner sight head', mat: 'פלדה + חלונות ברמה צבאית', desc: 'ראש הכוונת של התותחן, מייצב בשני צירים. בתוכו מצלמת יום, מצלמה תרמית (ראיית לילה) ומד טווח לייזר — תותחן מכוון וקולט יעד בעשרות קילומטרים.' }, { pos: [-0.12, TR + 0.02, 0.45] });
      put(RB(0.38, 0.12, 0.36), OLIVE2, gs, [0, 0.06, 0], null, { name: 'base' });
      put(RB(0.28, 0.18, 0.3), M.darkSteel(), gs, [0.0, 0.2, 0], null, { name: 'head' });
      for (const [z, c] of [[-0.07, 0x86e0ff], [0.08, 0xffd36a]]) { put(G.cyl(0.045, 0.045, 0.02, 18, 'x'), M.metal(0x101214, 0.2), gs, [0.15, 0.2, z]); put(G.cyl(0.036, 0.036, 0.012, 18, 'x'), M.lens(c, 0.6), gs, [0.16, 0.2, z]); }
      put(RB(0.3, 0.025, 0.34), OLIVE2, gs, [0.0, 0.31, 0], null, { name: 'hood' });
      const cs = sub(cup, 'optics', { he: 'מכ״ם פריסקופי של המפקד (CWS)', en: 'Commander panoramic sight', mat: 'פלדה, מערכת אופטית מייצבת', desc: 'כוונת פנורמית של המפקד על גג הכיפה. המפקד יכול להצביע על יעד, והתותח פונה אליו אוטומטית — מערכת ״צייד־הורג״ (hunter-killer).' });
      put(RB(0.24, 0.2, 0.26), M.darkSteel(), cs, [0.38, 0.22, 0], null, { name: 'sight body' });
      for (const z of [-0.06, 0.06]) { put(G.cyl(0.04, 0.04, 0.02, 18, 'x'), M.metal(0x101214, 0.2), cs, [0.51, 0.24, z]); put(G.cyl(0.032, 0.032, 0.012, 18, 'x'), M.lens(z > 0 ? 0xffd36a : 0x86e0ff, 0.6), cs, [0.52, 0.24, z]); }
      const per = sub(cup, 'optics', { he: 'פריסקופי המפקד (8)', en: 'Commander periscopes (×8)', mat: 'זכוכית שריון בבית פלדה', desc: 'שמונה חלונות ראייה מסביב לכיפה. בכל אחד זכוכית רב־שכבתית חסינת רסיסים, וביחד הם נותנים תצפית של 360°.' });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + PI / 8; const g = new THREE.Group(); g.position.set(Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3); g.rotation.y = -a; per.add(g); put(RB(0.1, 0.1, 0.12), BLACK, g); put(RB(0.012, 0.06, 0.1), M.glass(0x0a1a22, 0.7), g, [0.056, 0.0, 0]); put(RB(0.12, 0.014, 0.14), DSTEEL, g, [0, 0.055, 0]); }
      // loader periscope
      const lp = sub(ld, 'optics', { he: 'פריסקופ הטען', en: 'Loader periscope', mat: 'זכוכית שריון', desc: 'פריסקופ נוסף לטען, מסתכל לצד שמאל ואחורה.' });
      put(RB(0.14, 0.1, 0.12), BLACK, lp, [0.0, 0.14, 0.3]); put(RB(0.1, 0.06, 0.012), M.glass(0x0a1a22, 0.7), lp, [0.0, 0.14, 0.37]);
      // laser-warning receivers
      const lwr = sub(tur, 'optics', { he: 'חיישני אזהרת לייזר (4)', en: 'Laser warning receivers (×4)', mat: 'פלדה ופוליקרבונט', desc: 'כיפות קטנות בפינות הצריח שקולטות קרן לייזר משמיד או מכוון. כשהן מזהות — המערכת מתריעה, ואפשר לשגר עשן.' });
      for (const [x, z] of [[0.0, 0.8], [0.0, -0.8], [-2.7, 0.65], [-2.7, -0.65]]) { put(G.sphere(0.04, 14, 10), M.polycarb(), lwr, [x, TR + 0.075, z]); put(G.cyl(0.05, 0.055, 0.03, 16, 'y'), DSTEEL, lwr, [x, TR + 0.065, z]); }
      // antennas
      const ant = sub(tur, 'optics', { he: 'אנטנות קשר (2) ו־GPS', en: 'Radio antennas (×2) & GPS', mat: 'פיברגלס, נחושת, בסיס גמיש', desc: 'שתי אנטנות שוט לקשר רדיו, וכיפה קטנה ל־GPS. הבסיסים הגמישים מאפשרים להן להתכופף אל הענפים בלי להישבר.' });
      for (const [x, z, h] of [[-2.1, 0.28, 1.2], [-2.1, -0.28, 0.9]]) { put(G.cyl(0.04, 0.05, 0.1, 14, 'y'), M.rubber(), ant, [x, TR + 0.1, z]); put(G.cyl(0.0035, 0.009, h, 8, 'y'), M.metal(0x2a2c30, 0.4), ant, [x, TR + 0.15 + h / 2, z]); put(G.sphere(0.012, 8, 6), STEEL, ant, [x, TR + 0.15 + h, z]); }
      put(G.lathe([[0.001, 0], [0.05, 0], [0.05, 0.03], [0.03, 0.05], [0.001, 0.055]], 18, 'y'), M.plastic(0x1c1d20, 0.6), ant, [-1.5, TR + 0.0, -0.15]);

      // machine guns on pintle rings + a small remote weapon station
      const mg = (parent, info, pos, yaw, shield, postH) => {
        const m = sub(parent, 'gun', info, { pos, rot: [0, yaw, 0] });
        put(G.cyl(0.015, 0.015, 0.7, 10, 'x'), STEEL, m, [0.5, 0.1, 0]); put(RB(0.5, 0.1, 0.07), M.darkSteel(), m, [0.0, 0.1, 0]); put(RB(0.22, 0.16, 0.1), M.plastic(0x38402e, 0.6), m, [0.0, -0.02, 0.1]);
        put(G.cyl(0.02, 0.02, postH, 8, 'y'), STEEL, m, [-0.1, 0.05 - postH / 2, 0]);
        if (shield) put(RB(0.025, 0.3, 0.42), OLIVE2, m, [0.2, 0.12, 0]);
        return m;
      };
      mg(cup, { he: 'מקלע המפקד (7.62 מ״מ)', en: 'Commander MG (7.62 mm)', mat: 'פלדה', desc: 'מקלע MAG על טבעת מעל כיפת המפקד, ליריות הגנה קרובות.' }, [0.0, 0.32, -0.3], 0, false, 0.225);
      mg(ld, { he: 'מקלע הטען (7.62 מ״מ) עם מגן', en: 'Loader MG with shield', mat: 'פלדה + מגן שריון', desc: 'מקלע שני על ציר, מוגן בלוח שריון מרובע שמגן על ראש הטען.' }, [0.1, 0.23, -0.3], 0, true, 0.19);
      const rws = sub(tur, 'gun', { he: 'עמדת נשק נשלטת מרחוק (RWS)', en: 'Remote weapon station', mat: 'פלדה + מצלמות', desc: 'עמדת נשק קטנה שנשלטת מבפנים: המפקד יורה בלי לחשוף את ראשו. מצלמה ומקלע .50 או 7.62 מ״מ מאזנים זה את זה. מותקנת בצד שמאל.' }, { pos: [-0.05, TR + 0.02, -0.72] });
      put(G.cyl(0.2, 0.22, 0.1, 24, 'y'), OLIVE2, rws, [0, 0.05, 0], null, { name: 'ring base' });
      const rwsTop = new THREE.Group(); rwsTop.position.y = 0.1; rws.add(rwsTop);
      put(RB(0.34, 0.2, 0.3), M.darkSteel(), rwsTop, [0, 0.1, 0]); put(G.cyl(0.015, 0.015, 0.6, 10, 'x'), STEEL, rwsTop, [0.35, 0.12, 0.05]); put(RB(0.08, 0.08, 0.1), BLACK, rwsTop, [0.18, 0.12, -0.1]); put(G.cyl(0.03, 0.03, 0.02, 14, 'x'), M.lens(0x86e0ff, 0.6), rwsTop, [0.225, 0.12, -0.1]);
      K.onFrame((time) => { if (speed > 0.05) rwsTop.rotation.y = Math.sin(time * 0.6) * 0.6 * Math.min(speed, 1); });
    }

    // ================================================================== TROPHY active protection (hard-kill APS)
    const pods = [];
    {
      const radarTex = K.canvasTexture(256, 360, (g, w, h) => {
        g.fillStyle = '#12161a'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2b333b';
        for (let r = 0; r < 18; r++) for (let c = 0; c < 12; c++) g.fillRect(14 + c * 19.5, 14 + r * 18.5, 12, 11);
        g.fillStyle = '#9aa7b2'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText('TROPHY', w / 2, h - 6);
      });
      const radarFace = new THREE.MeshStandardMaterial({ map: radarTex, roughness: 0.4, metalness: 0.3 });
      const mkRadar = (x, z, s, rear) => {
        const r = sub(tur, 'trophy', { he: `מכ״ם Trophy ${rear ? 'אחורי' : 'קדמי'} ${sideHe(s)}`, en: `Trophy radar ${rear ? 'rear' : 'front'} (${sideEn(s)})`, mat: 'מערך אנטנות מישורי (AESA) בבית פלדה', desc: 'פאנל מכ״ם שטוח סורק את השמיים סביב הטנק. הוא מזהה טיל או רקטה שנורים לעבר הטנק ותוך מאית השנייה מחשב את מסלולם.' }, { pos: [x, 0.44, z], rot: [0, -s * (rear ? 3 * PI / 4 : PI / 4), 0] });
        put(RB(0.07, 0.56, 0.4), M.darkSteel(), r, [0, 0, 0], null, { name: 'housing' });
        put(new THREE.PlaneGeometry(0.35, 0.5), radarFace, r, [0.037, 0.0, 0.0], [0, PI / 2, 0], { name: 'array face', cast: false });
        put(RB(0.025, 0.58, 0.02), M.steel(), r, [0.03, 0, 0.195]); put(RB(0.025, 0.58, 0.02), M.steel(), r, [0.03, 0, -0.195]);
        put(RB(0.025, 0.02, 0.4), M.steel(), r, [0.03, 0.28, 0]); put(RB(0.025, 0.02, 0.4), M.steel(), r, [0.03, -0.28, 0]);
        for (const dy of [-0.18, 0.18]) put(RB(0.2, 0.04, 0.05), DSTEEL, r, [-0.12, dy, 0]);
        put(RB(0.014, 0.018, 0.05), L.green, r, [0.04, 0.3, 0]);
        return r;
      };
      for (const s of [1, -1]) { const pf = surfPt(s, 0.45, 0.42), pr = surfPt(s, -2.35, 0.42); mkRadar(pf.x, pf.z + s * 0.3, s, false); mkRadar(pr.x, pr.z + s * 0.3, s, true); }
      // countermeasure launchers on the rear roof (they rise and turn outward when armed)
      const lau = sub(tur, 'trophy', { he: 'משגרי יירוט (2)', en: 'Interceptor launchers (×2)', mat: 'פלדה + קנים עם מכסי הגנה', desc: 'שני תרמילי שיגור על גג הצריח. כשמכ״ם מזהה איום, הם משגרים מטען יירוט שמתפוצץ סמוך לטיל ומשמיד אותו. לאחר ההפעלה אי אפשר לשגר שוב מיד, ולכן מחזיקים כמה שיגורים.' });
      for (const s of [1, -1]) {
        const hg = new THREE.Group(); hg.position.set(-2.55, TR + 0.07, s * 0.58); lau.add(hg);
        put(RB(0.8, 0.07, 0.42), M.darkSteel(), hg, [0.38, 0.0, 0], null, { name: 'fixed base' });
        for (const dz of [-0.17, 0.17]) put(RB(0.04, 0.09, 0.06), STEEL, hg, [0.0, 0.05, dz]);
        const pod = new THREE.Group(); pod.position.set(0.0, 0.1, 0); hg.add(pod);
        put(RB(0.7, 0.14, 0.38), OLIVE2, pod, [0.35, 0.05, 0], null, { name: 'pod box' });
        for (const dz of [-0.09, 0.09]) { put(G.cyl(0.062, 0.062, 0.52, 18, 'x'), M.metal(0x2e3034, 0.5), pod, [0.38, 0.17, dz], null, { name: 'launch tube' }); put(G.cyl(0.05, 0.05, 0.014, 16, 'x'), L.red, pod, [0.65, 0.17, dz], null, { cast: false }); put(G.torus(0.062, 0.008, 6, 20, PI * 2, 'x'), STEEL, pod, [0.62, 0.17, dz]); }
        put(RB(0.02, 0.1, 0.34), CIRON, pod, [0.7, 0.05, 0]);
        pods.push({ hg, pod, s });
      }
      const cab = sub(tur, 'trophy', { he: 'חבילת כבלים וממשק חיבור', en: 'Trophy cable harness', mat: 'נחושת בבידוד גומי', desc: 'חבילת כבלים מוגנת בתעלת פלדה שמחברת את המכ״מים והמשגרים למחשב הבקרה שבתוך הצריח.' });
      for (const s of [1, -1]) { put(G.tube([V3(-2.55, TR + 0.1, s * 0.46), V3(-2.3, TR + 0.1, s * 0.3), V3(-1.8, TR + 0.1, s * 0.28), V3(-1.2, TR + 0.1, s * 0.5)], 0.015, 30, 8), M.rubber(), cab); }
      const cpu = sub(tur, 'trophy', { he: 'מחשב בקרת Trophy', en: 'Trophy control unit', mat: 'אלומיניום מוקשח, קירור פסיבי', desc: 'המחשב שמקבל נתוני מכ״ם ומחליט תוך מילי־שניות אם לשגר יירוט ומאיזה משגר. מותקן בחלק האחורי של הצריח בין הרדיו לתחמושת.' });
      put(RB(0.35, 0.22, 0.3), M.castAlu(), cpu, [-2.75, 0.2, -0.6]);
      instances(RB(0.34, 0.012, 0.02), M.aluminum(), Array.from({ length: 8 }, (_, i) => ({ pos: [-2.75, 0.31 + 0.0, -0.74 + i * 0.04] })), { parent: cpu }).position.y = 0.0;
      put(RB(0.012, 0.03, 0.05), L.green, cpu, [-2.57, 0.26, -0.6]);
    }

    // ================================================================== CREW COMPARTMENT, AMMUNITION
    {
      // turret basket
      const bsk = sub(tur, 'crew', { he: 'סל הצריח (רצפה מסתובבת)', en: 'Turret basket', mat: 'פלדה דקה + רשת', desc: 'רצפה וקיר עגולים שמסתובבים יחד עם הצריח. הצוות יושב בתוכם, והם מוגנים בשריון הגוף ובשריון הצריח.' });
      put(G.cyl(0.9, 0.9, 0.9, 44, 'y', true), dusty(0x3a3d42, { r: 0.6, m: 0.5, dust: 0.1, name: 'פלדה' }), bsk, [0, -0.45, 0], null, { name: 'basket wall' });
      put(G.cyl(0.9, 0.9, 0.03, 44, 'y'), M.metal(0x3e4247, 0.6), bsk, [0, -0.88, 0], null, { name: 'floor' });
      put(G.cyl(0.12, 0.12, 0.34, 20, 'y'), DSTEEL, bsk, [0, -1.06, 0], null, { name: 'slip ring' });
      for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2; put(B(0.04, 0.04, 0.5), M.metal(0x2a2d31, 0.6), bsk, [Math.cos(a) * 0.62, -0.88, Math.sin(a) * 0.62], [0, -a, 0], { name: 'grating rib' }); }
      // seats
      const seatMat = M.leather(0x2b2a25);
      const mkSeat = (parent, info, pos) => {
        const s = part(parent, info, { pos }); if (parent === tur) s.userData.sysOverride = 'crew';
        put(G.soft(0.38, 0.09, 0.4, { r: 0.04, seg: 5 }), seatMat, s, [0, 0.0, 0], null, { name: 'cushion' });
        put(G.soft(0.36, 0.46, 0.09, { r: 0.04, seg: 5 }), seatMat, s, [-0.22, 0.27, 0], [0, 0, 0.14], { name: 'backrest' });
        put(G.soft(0.2, 0.12, 0.1, { r: 0.04, seg: 5 }), seatMat, s, [-0.26, 0.56, 0], [0, 0, 0.14], { name: 'headrest' });
        for (const z of [-0.2, 0.2]) put(G.soft(0.26, 0.04, 0.05, { r: 0.015, seg: 3 }), M.plastic(0x1d1e20, 0.7), s, [-0.04, 0.17, z]);
        put(G.cyl(0.03, 0.03, 0.4, 10, 'y'), DSTEEL, s, [0.0, -0.22, 0]);
        return s;
      };
      mkSeat(tur, { he: 'מושב המפקד', en: 'Commander seat', mat: 'עור + קצף ספיגה, מסגרת פלדה', desc: 'המושב ניתן להגבהה: המפקד יושב נמוך כשהצוהר סגור, ועולה אל הצוהר כדי לצפות מבחוץ.' }, [-0.5, -0.45, 0.62]);
      mkSeat(tur, { he: 'מושב התותחן', en: 'Gunner seat', mat: 'עור + קצף', desc: 'התותחן יושב מתחת למפקד, מול ידיות הכוונה והכוונת.' }, [0.35, -0.6, 0.5]);
      mkSeat(tur, { he: 'מושב הטען', en: 'Loader seat', mat: 'עור + קצף', desc: 'מושב מתקפל. הטען לא יושב הרבה — הוא טוען פגזים בעמידה וגם נשען על המושב.' }, [-0.7, -0.5, -0.58]);
      // turret consoles
      const cons = sub(tur, 'crew', { he: 'לוחות בקרה בצריח', en: 'Turret control consoles', mat: 'פלסטיק, לחצנים מוארים', desc: 'לוח המפקד, ידיות התותחן ולוח הטען. בכל אחד לחצנים עם כיתוב מואר, כמו שמקובל בצבא — ללא מסכים מיותרים, כי הכל נשלט בהרגל.' });
      K.panel(cons, { pos: [0.02, -0.12, 1.22], normal: [0, 0, -1], up: [0, 1, 0], w: 0.5, h: 0.24, plate: M.gloss(0x0c0d0f), buttons: [
        ...['ARM', 'FCS', 'LRF', 'TRP', 'NBC', 'SMK'].map((l, i) => ({ x: -0.2 + i * 0.075, y: 0.06, w: 0.055, h: 0.04, d: 0.006, label: l, led: i % 2 ? '#3f6' : '#fb3', color: 0x1b1c20 })),
        { x: -0.17, y: -0.06, w: 0.06, kind: 'knob', label: 'ELEV' }, { x: 0.0, y: -0.06, w: 0.06, kind: 'knob', label: 'TRAV' },
        ...[0.12, 0.2].map((x) => ({ x, y: -0.07, kind: 'toggle' })),
      ] });
      K.panel(cons, { pos: [0.92, -0.38, 0.5], normal: [-1, 0, 0], up: [0, 1, 0], w: 0.38, h: 0.2, plate: M.gloss(0x0c0d0f), buttons: [
        { x: -0.1, y: 0.04, w: 0.08, kind: 'round', d: 0.012, label: 'LASE', color: 0xa3141a }, { x: 0.02, y: 0.04, w: 0.06, h: 0.04, label: 'AMMO', led: '#3f6', color: 0x1b1c20 },
        { x: 0.12, y: 0.04, w: 0.06, h: 0.04, label: 'MODE', color: 0x1b1c20 }, { x: -0.08, y: -0.05, w: 0.06, kind: 'knob', label: 'GAIN' }, { x: 0.1, y: -0.05, kind: 'toggle' },
      ] });
      K.panel(cons, { pos: [-1.2, -0.18, -1.2], normal: [0, 0, 1], up: [0, 1, 0], w: 0.36, h: 0.2, plate: M.gloss(0x0c0d0f), buttons: [
        { x: -0.1, y: 0.04, w: 0.07, h: 0.045, label: 'HE', led: '#fb3', color: 0x1b1c20 }, { x: 0.0, y: 0.04, w: 0.07, h: 0.045, label: 'APFSDS', led: '#3f6', color: 0x1b1c20 }, { x: 0.1, y: 0.04, w: 0.07, h: 0.045, label: 'LAHAT', color: 0x1b1c20 },
        { x: -0.05, y: -0.05, w: 0.06, kind: 'rocker', label: 'LOAD' }, { x: 0.08, y: -0.05, kind: 'toggle' },
      ] });
      // radios in the bustle
      const rad = sub(tur, 'crew', { he: 'ערכות קשר (3)', en: 'Radio sets (×3)', mat: 'אלומיניום, כפתורים וצגים', desc: 'שלוש ערכות קשר מוצבות בחלק האחורי של הצריח: פנים־גדודי, גדודי וחירום. הצוות נוגע בהן כל משימה.' });
      for (let i = 0; i < 3; i++) {
        put(B(0.3, 0.14, 0.34), M.castAlu(), rad, [-2.55, 0.12 + i * 0.17, 0.62]);
        K.panel(rad, { pos: [-2.395, 0.12 + i * 0.17, 0.62], normal: [1, 0, 0], up: [0, 1, 0], w: 0.3, h: 0.12, plate: M.gloss(0x14161a), buttons: [{ x: -0.09, y: 0.0, w: 0.05, kind: 'knob', label: 'VOL' }, { x: 0.0, y: 0.0, w: 0.05, kind: 'knob', label: 'CH' }, { x: 0.09, y: 0.0, w: 0.06, h: 0.04, label: ['VHF', 'UHF', 'SOS'][i], led: '#3f6', color: 0x1b1c20 }] });
      }
      // ready rack (4 rounds) in the bustle
      const caseGeo = G.lathe([[0.0, 0.0], [0.05, 0.0], [0.056, 0.02], [0.058, 0.4], [0.05, 0.5], [0.04, 0.54]], 16, 'x');
      const headGeo = G.lathe([[0.04, 0.54], [0.04, 0.72], [0.028, 0.88], [0.0, 0.98]], 16, 'x');
      const ready = sub(tur, 'crew', { he: 'מתקן תחמושת מוכנה (4 פגזים)', en: 'Ready rack (4 rounds)', mat: 'פלדה, פגזי 120 מ״מ', desc: 'ארבעה פגזים מוכנים בהישג ידו של הטען. כל שאר התחמושת (כ־48 פגזים) נמצאת בגוף, בתוך מכלים עמידי אש מאחורי דלת הגוף.' });
      for (let i = 0; i < 4; i++) { const o = { pos: [-2.5, 0.09 + (i >> 1) * 0.14, -0.55 - (i % 2) * 0.14] }; mesh(caseGeo, M.brass(), { parent: ready, pos: o.pos }); mesh(headGeo, M.metal(0x404438, 0.5), { parent: ready, pos: o.pos }); }
      put(B(1.1, 0.03, 0.4), DSTEEL, ready, [-2.0, 0.045, -0.62]);

      // driver: seat, steering wheel, pedals, instrument panel
      const dseat = mkSeat(crewSys, { he: 'מושב הנהג (מוטה)', en: 'Driver seat (reclined)', mat: 'עור + קצף, מסגרת פלדה', desc: 'הנהג כמעט שוכב בגלל הגובה הנמוך של החזית. המושב ניתן לכוונון, ואפשר להפוך אותו אחורה כדי לצאת דרך הגוף.' }, [2.78, 0.76, -0.52]);
      dseat.rotation.z = 0.0;
      const wheel = part(crewSys, { he: 'הגה הנהג', en: 'Steering wheel', mat: 'פלדה + ציפוי גומי', desc: 'הנהג מנהג את המרכבה בהגה מעגלי כמו במכונית, בניגוד לטנקים ישנים שהיו עם שתי ידיות. ההגה שולט בהסטת הכוח בין שני הזחלים.' });
      put(G.torus(0.17, 0.018, 10, 32, PI * 2, 'x'), M.rubber(), wheel, [3.18, 1.0, -0.52], [0, 0, -0.5]);
      put(G.cyl(0.04, 0.04, 0.05, 16, 'x'), DSTEEL, wheel, [3.18, 1.0, -0.52], [0, 0, -0.5]);
      for (const a of [PI / 2, PI * 7 / 6, PI * 11 / 6]) put(G.tube([V3(3.18, 1.0, -0.52), V3(3.18 + 0.0, 1.0 + Math.cos(a) * 0.1 * Math.cos(0.5), -0.52 + Math.sin(a) * 0.17)], 0.008, 2, 6), STEEL, wheel);
      put(G.cyl(0.02, 0.02, 0.4, 10, 'x'), STEEL, wheel, [3.4, 0.9, -0.52], [0, 0, -0.5]);
      const ped = part(crewSys, { he: 'דוושות הנהג', en: 'Driver pedals', mat: 'פלדה + גומי', desc: 'שתי דוושות: גז (ימין) ובלם (שמאל). הבלם הוא הידראולי ומופעל בכל גלגל הנעה.' });
      for (const [z, c] of [[-0.62, 0x1a1a1a], [-0.42, 0x222222]]) { put(B(0.04, 0.16, 0.1), M.rubber(), ped, [3.3, 0.62, z], [0, 0, -0.5]); put(B(0.05, 0.03, 0.04), DSTEEL, ped, [3.34, 0.55, z]); void c; }
      K.panel(crewSys, { name: 'driver dash', pos: [3.5, 1.0, -0.52], normal: [-1, 0, 0], up: [0, 1, 0], w: 0.44, h: 0.22, plate: M.gloss(0x0c0d0f), buttons: [
        ...['ENG', 'NBC', 'LGT', 'SMK', 'FIRE', 'HEAT'].map((l, i) => ({ x: -0.18 + i * 0.07, y: 0.06, w: 0.05, h: 0.04, d: 0.006, label: l, led: i === 4 ? '#f33' : '#3f6', color: 0x1b1c20 })),
        { x: -0.15, y: -0.04, w: 0.07, kind: 'knob', label: 'RPM' }, { x: -0.04, y: -0.04, w: 0.07, kind: 'knob', label: 'TEMP' }, { x: 0.07, y: -0.04, w: 0.07, kind: 'knob', label: 'OIL' },
        ...[0.17].map((x) => ({ x, y: -0.04, kind: 'toggle' })),
      ] });
      // fire suppression, NBC unit, stretchers
      const fs = part(crewSys, { he: 'מערכת כיבוי אש אוטומטית', en: 'Fire suppression system', mat: 'פלדה, הלון/חומר כיבוי', desc: 'חיישנים באגף המנוע ובתא הלחימה מזהים אש ופורקים חומר כיבוי תוך שבריר שנייה. יש גם מערכת ידנית עם ידית אדומה ליד כל אחד מחברי הצוות.' });
      for (const [x, z] of [[-3.5, 0.9], [-3.5, -0.9], [3.35, 0.02]]) { put(G.cyl(0.075, 0.075, 0.48, 18, 'y'), M.paintFlat(0xb3201a, 0.5), fs, [x, 0.78, z], null, { name: 'bottle' }); put(G.cyl(0.03, 0.03, 0.06, 10, 'y'), STEEL, fs, [x, 1.05, z]); put(G.torus(0.05, 0.008, 6, 14, PI * 2, 'y'), STEEL, fs, [x, 1.1, z]); }
      const nbc = part(crewSys, { he: 'מערכת הגנה מפני נשק כימי (NBC)', en: 'NBC protection unit', mat: 'פלדה וקרבון פעיל', desc: 'מפעילה לחץ יתר בתא הצוות ומסננת אוויר דרך מסנני פחם פעיל, כדי שאבק רדיואקטיבי או גז לא ייכנסו.' });
      put(B(0.4, 0.3, 0.3), M.metal(0x4b5240, 0.6), nbc, [-1.8, 1.3, -0.82]); put(G.cyl(0.06, 0.06, 0.1, 14, 'x'), M.metal(0x2a2c30, 0.5), nbc, [-1.56, 1.3, -0.82]);
      const str = part(crewSys, { he: 'אלונקות פינוי (2)', en: 'Stretchers (×2)', mat: 'אלומיניום ובד', desc: 'שתי אלונקות מתקפלות בצד הגוף. אפשר לפנות עד ארבעה פצועים דרך הדלת האחורית — הטנק משמש גם כאמבולנס.' });
      for (const y of [1.0, 1.28]) { put(B(1.4, 0.03, 0.04), M.aluminum(), str, [-3.0, y, -0.915]); put(B(1.35, 0.5, 0.012), M.fabric(0x5a5f45), str, [-3.0, y - 0.0, -0.93]); }
      // ammunition racks: 4 columns × 8 rounds (rear of the hull, either side of the door aisle)
      const cGeo = G.lathe([[0.0, 0.0], [0.055, 0.0], [0.06, 0.02], [0.062, 0.52], [0.052, 0.6], [0.04, 0.64]], 16, 'y');
      const hGeo = G.lathe([[0.04, 0.64], [0.04, 0.78], [0.028, 0.88], [0.0, 0.96]], 16, 'y');
      const ammo = part(crewSys, { he: 'מכלי תחמושת (32 פגזים)', en: 'Ammunition cells (32 rounds)', mat: 'פלדה עמידת אש', desc: 'הפגזים מאוחסנים אנכית בגוף האחורי, בין הצוות לדלת האחורית. מכל מכל בנוי שיחסוך מהצוות שריפה אם יש פגיעה.' });
      const casings = [], heads = [];
      for (const s of [1, -1]) for (const zc of [0.56, 0.79]) for (let i = 0; i < 8; i++) { const p = [-3.42 + i * 0.19, 0.56, s * zc]; casings.push({ pos: p }); heads.push({ pos: p }); }
      instances(cGeo, M.brass(), casings, { parent: ammo }); instances(hGeo, M.metal(0x4d5342, 0.5), heads, { parent: ammo });
      const racks = part(crewSys, { he: 'מסגרות מכלי התחמושת', en: 'Rack frames', mat: 'פלדה מגולוונת', desc: 'רצפה ותקרה מחוררות שמחזיקות את הפגזים בישיבה אנכית ומונעות מהם להתנדנד בנסיעה.' });
      for (const s of [1, -1]) for (const zc of [0.675]) { put(B(1.7, 0.03, 0.4), M.metal(0x363a3f, 0.6), racks, [-2.75, 0.52, s * zc]); put(B(1.7, 0.03, 0.4), M.metal(0x363a3f, 0.6), racks, [-2.75, 1.19, s * zc]); for (const px of [-3.57, -1.93]) for (const dz of [-0.19, 0.19]) put(B(0.03, 0.7, 0.03), M.metal(0x363a3f, 0.6), racks, [px, 0.85, s * zc + dz]); }
      void headGeo; void caseGeo;
    }

    // ================================================================== EQUIPMENT + MARKINGS
    {
      const cab = part(equipSys, { he: 'כבלי גרירה (2)', en: 'Tow cables (×2)', mat: 'כבל פלדה מצופה, עיניות מחושלות', desc: 'שני כבלי פלדה לגרירה עצמית ולחילוץ. שזורים מחוטי פלדה ומחוברים לעיניות בחוטם.' });
      for (const s of [1, -1]) {
        const pts = [[3.7, 0.0], [3.45, 0.004], [3.2, -0.004], [2.95, 0.004], [2.75, 0.0]].map(([x, dz]) => V3(x, deckY(x) + 0.03 + Math.abs(dz) * 2, s * (0.38 + dz)));
        put(G.tube(pts, 0.016, 40, 8), M.metal(0x363b3f, 0.55), cab);
        put(G.torus(0.04, 0.01, 8, 16), STEEL, cab, [3.72, deckY(3.72) + 0.05, s * 0.38], [PI / 2 + DECK_A, 0, 0]);
        put(G.torus(0.04, 0.01, 8, 16), STEEL, cab, [2.72, deckY(2.72) + 0.05, s * 0.38], [PI / 2 + DECK_A, 0, 0]);
        for (const x of [3.3, 3.0]) put(B(0.04, 0.012, 0.12), DSTEEL, cab, [x, deckY(x) + 0.02, s * 0.38]);
      }
      const tool = part(equipSys, { he: 'כלי עבודה (את, מקוש)', en: 'Hand tools (shovel, sledge)', mat: 'פלדה ועץ', desc: 'את ומקוש על המדף. כדי להחזיר טנק תקוע מהחול, לפעמים החול מנצח את הטכנולוגיה.' });
      put(G.cyl(0.015, 0.015, 0.9, 8, 'x'), M.wood(), tool, [-2.0, sponY(1.3) + 0.04, 1.3]); put(B(0.28, 0.01, 0.2), STEEL, tool, [-1.43, sponY(1.3) + 0.04, 1.3]);
      put(G.cyl(0.018, 0.018, 0.75, 8, 'x'), M.wood(), tool, [-2.2, sponY(1.52) + 0.04, 1.52]); put(B(0.16, 0.08, 0.08), DSTEEL, tool, [-1.8, sponY(1.52) + 0.05, 1.52]);
      const jer = part(equipSys, { he: 'ג׳ריקנים (3)', en: 'Jerrycans (×3)', mat: 'פלדה מצופה', desc: 'שלושה ג׳ריקנים של מים או שמן. בצבא נושאים אותם בכל מקום לגיבוי.' });
      for (let i = 0; i < 3; i++) { put(B(0.36, 0.46, 0.17), M.paintFlat(0x5c6347, 0.7), jer, [0.2 + i * 0.4, sponY(1.55) + 0.25, -1.55]); put(G.tube([V3(0.2 + i * 0.4 - 0.1, sponY(1.55) + 0.49, -1.55), V3(0.2 + i * 0.4, sponY(1.55) + 0.57, -1.55), V3(0.2 + i * 0.4 + 0.1, sponY(1.55) + 0.49, -1.55)], 0.01, 12, 6), STEEL, jer); }
      const bx = part(equipSys, { he: 'תיבות ציוד אחוריות (2)', en: 'Rear stowage boxes (×2)', mat: 'פלדה בעובי 2 מ״מ', desc: 'תיבות למנות, בדים ושקי שינה, מחוברות לגב המדפים. הצוות חי בטנק לימים, ולכן הציוד נחוץ.' });
      for (const s of [1, -1]) { put(B(0.7, 0.4, 0.44), OLIVE2, bx, [-3.3, 1.7, s * 1.58]); put(B(0.04, 0.06, 0.1), STEEL, bx, [-2.95, 1.7, s * 1.58]); bolts(bx, Array.from({ length: 4 }, (_, i) => ({ pos: [-3.5 + (i % 2) * 0.4, 1.85, s * (1.4 + (i >> 1) * 0.36)] })), 0.011); }
      const mf = part(equipSys, { he: 'מגני בוץ מגומי (4)', en: 'Rubber mud flaps (×4)', mat: 'גומי מחוזק בבד', desc: 'מונעים התזת בוץ ואבק על הציוד והצוות, וגם מקטינים את ענן האבק מאחורי הטנק.' });
      for (const s of [1, -1]) { put(B(0.02, 0.18, 0.7), CAMO_RUB, mf, [3.96, 1.17, s * 1.425]); put(B(0.02, 0.28, 0.76), CAMO_RUB, mf, [-4.37, 0.98, s * 1.425]); }
      // markings: tactical number on both turret sides + data plate
      const num = K.textTexture('3 • 7 • 4', { font: '800 120px "Arial Black", Arial', color: '#f2efe6', pad: 12 });
      const mk = sub(tur, 'equip', { he: 'סימון טקטי על הצריח (2)', en: 'Turret tactical numbers (×2)', mat: 'צבע לבן מט', desc: 'מספר הטנק בצבע לבן על דופן הצריח: פלוגה, מחלקה, מספר טנק. הצבע מט כדי שלא ינצנץ בשמש.' });
      for (const sd of [1, -1]) { const pt = surfPt(sd, -0.9, 0.5), n = surfN(sd, -0.9, 0.5), g = new THREE.Group(); g.position.copy(pt).addScaledVector(n, 0.095); g.rotation.y = sd > 0 ? 0 : PI; mk.add(g); const phi = Math.atan2(n.y, Math.abs(n.z)); put(new THREE.PlaneGeometry(0.5, 0.5 / num.aspect), M.decal(num.tex), g, [0, 0, 0], [-phi, 0, 0], { cast: false }); }
      const pl = part(equipSys, { he: 'לוחית דגם על הגוף', en: 'Hull data plate', mat: 'אלומיניום חרוט', desc: 'לוחית יצרן על הגוף: דגם, מספר סידורי ושנת ייצור. על כל טנק יש מספר ייחודי.' });
      const pt = K.textTexture('MERKAVA Mk.4M\nIDF · 2012', { font: '700 80px Arial', color: '#2a2a28', bg: '#b9bcc0', lineHeight: 90 });
      put(new THREE.PlaneGeometry(0.22, 0.22 / pt.aspect), M.decal(pt.tex), pl, [3.5, deckY(3.5) + 0.01, 0.0], [-PI / 2 + DECK_A, 0, PI / 2], { cast: false });
    }

    // ================================================================== TOGGLES + ANIMATION
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    K.toggle('turret', { he: 'סיבוב צריח', key: 'r', seconds: 2.4 }, (t) => { tur.rotation.y = -ease(t) * PI * 0.55; });
    K.toggle('gun', { he: 'הגבהת תותח', key: 'e', seconds: 1.6 }, (t) => { gunG.rotation.z = lerp(-0.03, 0.3, ease(t)); });
    K.toggle('hatches', { he: 'צוהרים', key: 'h', seconds: 1.2 }, (t) => { for (const h of hatches) if (h.id !== 'door') h.obj.rotation[h.axis] = h.sign * ease(t) * h.max; });
    K.toggle('door', { he: 'דלת אחורית', key: 'd', seconds: 1.8 }, (t) => { for (const h of hatches) if (h.id === 'door') h.obj.rotation[h.axis] = h.sign * ease(t) * h.max; });
    K.toggle('skirts', { he: 'הרמת חצאיות', key: 's', seconds: 1.5 }, (t) => { for (const sk of skirts) sk.rotation.x = -sk.userData.s * ease(t) * 1.4; });
    K.toggle('drive', { he: 'זחלים רצים', key: 't', seconds: 1.4 }, (t) => { speed = t * 3.2; });
    K.toggle('trophy', { he: 'הגנה אקטיבית', key: 'p', seconds: 1.0 }, (t) => {
      for (const p of pods) { p.pod.rotation.z = ease(t) * 0.85; p.hg.rotation.y = -p.s * ease(t) * 0.5; }
      L.green.emissiveIntensity = 0.05 + t * 2.4;
    });
    K.toggle('lights', { he: 'פנסים', key: 'l', seconds: 0.4, night: true }, (t) => { L.head.emissiveIntensity = 0.05 + t * 3; L.red.emissiveIntensity = 0.05 + t * 2; });
    K.onFrame((time, dt) => { if (speed > 0.001) { travel += speed * dt; K.__updateTracks(); } });
    K.__updateTracks();
  },
};
