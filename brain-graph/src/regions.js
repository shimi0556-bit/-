// Brain geometry, regions and node kinds. Front of the brain is on the right (RTL reading side).
window.BG = window.BG || {};
(function (BG) {
  'use strict';
  BG.W = 1000;
  BG.H = 700;

  BG.CEREBRUM = 'M196,330 C160,250 200,150 320,112 C430,80 560,76 660,96 C790,114 890,180 896,280 C900,350 872,402 820,418 C780,430 745,424 712,430 C700,450 680,470 640,474 C590,480 520,478 470,462 C420,448 380,440 330,432 C270,425 215,395 196,330 Z';
  BG.CEREBELLUM = 'M226,424 C262,414 392,428 440,452 C450,500 410,548 336,552 C262,554 206,500 226,424 Z';
  BG.STEM = 'M490,450 L580,450 C586,510 588,580 572,650 L506,650 C498,580 492,510 490,450 Z';
  // Procedural gyri: seeded random walks, clipped to the cortex when drawn.
  (function () {
    let s = 7;
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    BG.SULCI = [];
    for (let i = 0; i < 34; i++) {
      let x = 210 + rnd() * 680, y = 100 + rnd() * 360, a = rnd() * 6.283, d = 'M' + x.toFixed(0) + ',' + y.toFixed(0);
      for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.5; x += Math.cos(a) * 13; y += Math.sin(a) * 13; d += ' L' + x.toFixed(0) + ',' + y.toFixed(0); }
      BG.SULCI.push(d);
    }
  })();

  // 30 regions. layer 'surface': a territory of the cortex (weighted Voronoi around a point or a strip `seg`);
  // 'deep': an ellipse carved out of the cortex (limbic / subcortical); 'own': hindbrain parts that have their own outline.
  // cx/cy/rx/ry/rot also give the size of the glow that lights up while the AI reads the region.
  const mk = (id, name, does, color, layer, cx, cy, rx, ry, extra) => Object.assign({ id, name, does, color, layer, cx, cy, rx, ry, rot: 0, w: 1 }, extra || {});
  BG.REGIONS = [
    // frontal (blues)
    mk('fpc', 'קוטב המצח', 'מטרות ארוכות טווח, חזון, זהות עצמית, תכנון העתיד', '#4f6bff', 'surface', 868, 270, 48, 80),
    mk('dlpfc', 'קליפת המצח הגבית', 'תכנון, זיכרון עבודה, חשיבה לוגית, ארגון והחלטות מחושבות', '#6f8cff', 'surface', 800, 180, 60, 55, { seg: [770, 130, 830, 235] }),
    mk('vmpfc', 'קליפת המצח התחתונה', 'ערכים, שיקול דעת מוסרי, הערכת תגמול וסיכון, החלטות רגשיות', '#8aa6ff', 'surface', 815, 372, 55, 38),
    mk('broca', 'אזור ברוקה', 'ניסוח ודיבור, הבעת מחשבות ורגשות במילים', '#5aa0ff', 'surface', 748, 332, 40, 32, { w: 0.8 }),
    mk('pmc', 'אזור קדם־מוטורי', 'תכנון תנועה, רצפי פעולות, יוזמה לפני ביצוע', '#4a86e8', 'surface', 712, 185, 28, 70, { seg: [720, 120, 705, 250], w: 0.6 }),
    mk('m1', 'קליפה מוטורית', 'ביצוע פעולה, תנועה, מעשים קונקרטיים', '#3b6fd4', 'surface', 652, 195, 26, 100, { seg: [665, 105, 640, 290], w: 0.55 }),
    // parietal (ambers)
    mk('s1', 'קליפה תחושתית', 'תחושות מגע וגוף, כאב, תחושה פיזית של מצבים', '#ffb84a', 'surface', 592, 192, 26, 98, { seg: [605, 100, 580, 285], w: 0.55 }),
    mk('spl', 'אונה קודקודית עליונה', 'קשב וריכוז, מרחב וניווט, תיאום עין־יד', '#ffc968', 'surface', 520, 140, 60, 40, { w: 1.1 }),
    mk('ipl', 'אונה קודקודית תחתונה', 'מספרים וחישוב, קריאה, שילוב בין חושים ומשמעות', '#f5a623', 'surface', 440, 210, 50, 48),
    mk('precun', 'פרקונאוס', 'התבוננות פנימית, דמיון, שוטטות מחשבות, תחושת עצמי', '#e8931a', 'surface', 505, 215, 36, 30, { w: 0.7 }),
    mk('tpj', 'צומת רקתי־קודקודי', 'הבנת אחרים, אמפתיה, נקודת מבט, גבול בין עצמי לאחר', '#ffd27f', 'surface', 455, 305, 38, 32, { w: 0.8 }),
    // occipital (pinks)
    mk('v1', 'קליפה חזותית ראשית', 'ראייה, תמונות, צבעים ותנועה חזותית', '#ff6fb5', 'surface', 230, 305, 28, 70, { seg: [232, 240, 230, 370], w: 0.7 }),
    mk('v2', 'קליפה חזותית משנית', 'זיהוי חפצים, פנים וצורות, דימויים ועיצוב', '#ff8fc8', 'surface', 300, 290, 42, 62, { w: 0.9 }),
    // temporal (greens)
    mk('wern', 'אזור ורניקה', 'הבנת שפה ושמיעה, משמעות של מילים ומשפטים', '#8fe35a', 'surface', 410, 380, 36, 28, { w: 0.8 }),
    mk('mtg', 'אונה רקתית אמצעית', 'ידע ועובדות, משמעות של מושגים, שמות', '#6fd04a', 'surface', 500, 410, 50, 30, { w: 0.9 }),
    mk('itg', 'אונה רקתית תחתונה', 'זיהוי פנים ואנשים, קטגוריות, ידע חזותי על העולם', '#a8e87a', 'surface', 585, 445, 46, 24, { w: 0.8 }),
    mk('tpole', 'קוטב רקתי', 'זיכרון אישי וחברתי, הכרה של אנשים קרובים ושל משמעות רגשית', '#4fc46a', 'surface', 690, 440, 36, 24, { w: 0.7 }),
    mk('insula', 'אינסולה', 'תחושות פנימיות בגוף, מודעות רגשית, גועל, חמלה', '#34d6a0', 'deep', 612, 378, 32, 17, { zf: [0.45, 0.7] }),
    // limbic / medial (purples & reds)
    mk('acc', 'קליפת החגורה הקדמית', 'מוטיבציה, מאמץ, התנגשות בין רצונות, ניטור שגיאות', '#b388ff', 'deep', 715, 212, 42, 20, { rot: -10 , zf: [0, 0.22] }),
    mk('pcc', 'קליפת החגורה האחורית', 'זיכרון אוטוביוגרפי, רפלקציה עצמית, חיבור בין זיכרון לעצמי', '#9a6ff0', 'deep', 505, 255, 34, 16, { zf: [0, 0.22] }),
    mk('amy', 'אמיגדלה', 'פחד, כעס, איום, המשמעות הרגשית של דברים', '#ff5a5a', 'deep', 692, 392, 30, 21, { zf: [0.45, 0.7] }),
    mk('hip', 'היפוקמפוס', 'זיכרונות ואירועים, סיפורים אישיים, למידה חדשה', '#4cc9ff', 'deep', 535, 372, 46, 17, { rot: -12 , zf: [0.45, 0.7] }),
    // subcortical (oranges & browns)
    mk('str', 'סטריאטום (גרעיני הבסיס)', 'הרגלים, שגרות, דפוסי פעולה אוטומטיים', '#ff8a3d', 'deep', 630, 262, 52, 30, { zf: [0.15, 0.4] }),
    mk('nac', 'גרעין האקומבנס', 'תגמול, חשק, הנאה, התמכרות', '#ff6a5a', 'deep', 702, 306, 28, 17, { zf: [0.15, 0.4] }),
    mk('thal', 'תלמוס', 'סינון מידע, קשב, מעבר בין מצבי ערנות', '#e0a060', 'deep', 560, 305, 38, 25, { zf: [0, 0.22] }),
    mk('hyp', 'היפותלמוס', 'צרכים בסיסיים, דחפים, רעב, שינה, בריאות הגוף', '#d4a373', 'deep', 622, 340, 34, 18, { zf: [0, 0.22] }),
    // hindbrain (teal & greys) - own outlines
    mk('cer', 'המוחון', 'מיומנויות, תרגול, למידה מוטורית, דיוק ושיפור מתמיד', '#7be0a0', 'own', 328, 490, 86, 46, { rot: 8 }),
    mk('mid', 'המוח התיכון', 'דופמין ומוטיבציה בסיסית, ערנות, התמצאות', '#9aa5b8', 'own', 536, 487, 32, 28),
    mk('pons', 'הגשר', 'שינה וחלימה, עוררות, מעבר בין עירות לשינה', '#8791a8', 'own', 537, 548, 32, 28),
    mk('med', 'המוח המוארך', 'נשימה, דופק, מצב הגוף הבסיסי ואנרגיה', '#aab3c6', 'own', 538, 612, 30, 32)
  ];

  BG.FAMILIES = [
    { id: 'frontal', name: 'האונה המצחית', ids: ['fpc', 'dlpfc', 'vmpfc', 'broca', 'pmc', 'm1'] },
    { id: 'parietal', name: 'האונה הקודקודית', ids: ['s1', 'spl', 'ipl', 'precun', 'tpj'] },
    { id: 'occipital', name: 'האונה העורפית', ids: ['v1', 'v2'] },
    { id: 'temporal', name: 'האונה הרקתית', ids: ['wern', 'mtg', 'itg', 'tpole', 'insula'] },
    { id: 'limbic', name: 'המערכת הלימבית', ids: ['acc', 'pcc', 'amy', 'hip'] },
    { id: 'subcortical', name: 'מבנים תת־קורטיקליים', ids: ['str', 'nac', 'thal', 'hyp'] },
    { id: 'hindbrain', name: 'המוחון וגזע המוח', ids: ['cer', 'mid', 'pons', 'med'] }
  ];

  // One hue per family of regions (a few clear colours instead of 30 that blend into mud); regions differ only in lightness.
  BG.FAMILY_COLORS = { frontal: 222, parietal: 38, occipital: 330, temporal: 125, limbic: 356, subcortical: 272, hindbrain: 182 };
  BG.FAMILIES.forEach((f) => {
    const hue = BG.FAMILY_COLORS[f.id];
    f.ids.forEach((id, i) => {
      const reg = BG.REGIONS.find((x) => x.id === id), l = 58 + (f.ids.length > 1 ? (i / (f.ids.length - 1)) * 14 : 6), sat = f.id === 'hindbrain' ? 55 : 78;
      reg.color = 'hsl(' + hue + ',' + sat + '%,' + l.toFixed(0) + '%)';
    });
  });
  BG.familyColor = (fid) => 'hsl(' + BG.FAMILY_COLORS[fid] + ',78%,64%)';

  // old (12-region) ids found in saved data -> new ids
  const OLD = { pfc: { value: 'vmpfc', goal: 'fpc', belief: 'dlpfc', _: 'dlpfc' }, mot: 'm1', par: 'spl', occ: 'v1', tem: { person: 'tpole', _: 'mtg' }, bg: 'str', cer: 'cer', stem: 'med' };
  BG.fixRegion = function (region, kind) {
    if (BG.REGIONS.some((r) => r.id === region)) return region;
    const m = OLD[region];
    if (!m) return null;
    return typeof m === 'string' ? m : m[kind] || m._;
  };

  BG.KINDS = [
    { id: 'value', name: 'ערך', home: 'vmpfc' },
    { id: 'goal', name: 'מטרה / חזון', home: 'fpc' },
    { id: 'belief', name: 'אמונה / מחשבה', home: 'dlpfc' },
    { id: 'plan', name: 'תכנון / החלטה', home: 'dlpfc' },
    { id: 'speech', name: 'ביטוי / שפה', home: 'broca' },
    { id: 'action', name: 'פעולה', home: 'm1' },
    { id: 'body', name: 'תחושה בגוף', home: 's1' },
    { id: 'space', name: 'קשב / מרחב', home: 'spl' },
    { id: 'identity', name: 'זהות / עצמי', home: 'precun' },
    { id: 'empathy', name: 'הבנת אחר', home: 'tpj' },
    { id: 'image', name: 'דימוי / ויזואל', home: 'v2' },
    { id: 'concept', name: 'מושג', home: 'mtg' },
    { id: 'fact', name: 'עובדה / ידע', home: 'mtg' },
    { id: 'person', name: 'אדם', home: 'tpole' },
    { id: 'emotion', name: 'רגש', home: 'amy' },
    { id: 'memory', name: 'זיכרון / אירוע', home: 'hip' },
    { id: 'tension', name: 'מתח / מוטיבציה', home: 'acc' },
    { id: 'habit', name: 'הרגל / שגרה', home: 'str' },
    { id: 'reward', name: 'תגמול / חשק', home: 'nac' },
    { id: 'need', name: 'צורך / דחף', home: 'hyp' },
    { id: 'skill', name: 'מיומנות', home: 'cer' },
    { id: 'arousal', name: 'ערנות / שינה', home: 'pons' },
    { id: 'state', name: 'מצב גוף', home: 'med' },
    { id: 'doc', name: 'מסמך', home: 'mtg', source: true },
    { id: 'url', name: 'אתר', home: 'mtg', source: true }
  ];

  // Cheap keyword lexicon for the offline (no-AI) extractor.
  BG.LEXICON = {
    fpc: ['מטרה', 'מטרות', 'חזון', 'זהות', 'goal', 'vision', 'identity'],
    vmpfc: ['ערך', 'ערכים', 'מוסר', 'עקרון', 'value', 'values', 'moral', 'principle'],
    dlpfc: ['תכנון', 'החלטה', 'אחריות', 'plan', 'decision', 'logic'],
    broca: ['דיבור', 'לדבר', 'ניסוח', 'כתיבה', 'speech', 'speaking', 'writing'],
    m1: ['לעשות', 'פעולה', 'ביצוע', 'תנועה', 'action', 'execute', 'movement'],
    s1: ['כאב', 'מגע', 'תחושה', 'pain', 'touch', 'sensation'],
    spl: ['קשב', 'ריכוז', 'מרחב', 'מפה', 'attention', 'focus', 'space', 'map'],
    ipl: ['מספר', 'חישוב', 'קריאה', 'number', 'math', 'reading'],
    tpj: ['אמפתיה', 'הבנת אחרים', 'נקודת מבט', 'empathy', 'perspective'],
    precun: ['דמיון', 'התבוננות', 'imagination', 'reflection'],
    v2: ['תמונה', 'צבע', 'עיצוב', 'ויזואלי', 'וידאו', 'ציור', 'image', 'color', 'design', 'visual', 'video', 'drawing'],
    wern: ['שמיעה', 'שפה', 'מילים', 'language', 'hearing', 'words'],
    mtg: ['ידע', 'מושג', 'עובדה', 'knowledge', 'concept', 'fact'],
    tpole: ['חבר', 'משפחה', 'אמא', 'אבא', 'friend', 'family'],
    insula: ['גועל', 'חמלה', 'disgust', 'compassion'],
    acc: ['מוטיבציה', 'מאמץ', 'קונפליקט', 'התנגשות', 'דחיינות', 'motivation', 'effort', 'conflict', 'procrastination'],
    pcc: ['זיכרון אישי', 'עצמי', 'autobiographical'],
    amy: ['פחד', 'כעס', 'חרדה', 'שמחה', 'רגש', 'רגשות', 'בושה', 'אשמה', 'עצב', 'תסכול', 'fear', 'anger', 'anxiety', 'emotion', 'joy', 'shame', 'guilt', 'sadness'],
    hip: ['זיכרון', 'זיכרונות', 'זוכר', 'ילדות', 'אירוע', 'סיפור', 'memory', 'memories', 'remember', 'childhood', 'story', 'episode'],
    str: ['הרגל', 'הרגלים', 'שגרה', 'אוטומטי', 'habit', 'habits', 'routine', 'automatic'],
    nac: ['תגמול', 'חשק', 'הנאה', 'התמכרות', 'reward', 'craving', 'pleasure', 'addiction'],
    thal: ['סינון', 'filter'],
    hyp: ['רעב', 'אוכל', 'גוף', 'בריאות', 'ספורט', 'צורך', 'hunger', 'food', 'body', 'health', 'need'],
    cer: ['תרגול', 'מיומנות', 'אימון', 'כושר', 'דיוק', 'practice', 'skill', 'training', 'precision'],
    mid: ['התמצאות', 'orientation'],
    pons: ['שינה', 'חלום', 'sleep', 'dream'],
    med: ['נשימה', 'עייפות', 'אנרגיה', 'דופק', 'breathing', 'fatigue', 'energy']
  };
})(window.BG);
