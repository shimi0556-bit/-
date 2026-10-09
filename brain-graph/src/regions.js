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

  // layer: 'surface' regions are clipped to the cortex, 'deep' regions are drawn on top as an x-ray overlay.
  BG.REGIONS = [
    { id: 'pfc', name: 'קליפת המצח', en: 'Prefrontal cortex', does: 'ערכים, מטרות, תכנון, שיקול דעת, זהות עצמית, קבלת החלטות', color: '#6c8cff', cx: 790, cy: 268, rx: 98, ry: 118, rot: 0, layer: 'surface' },
    { id: 'mot', name: 'האזור המוטורי', en: 'Motor cortex', does: 'פעולות מעשיות, ביצוע, תנועה, מעשים קונקרטיים', color: '#22d3c5', cx: 652, cy: 168, rx: 50, ry: 88, rot: 16, layer: 'surface' },
    { id: 'par', name: 'האונה הקודקודית', en: 'Parietal lobe', does: 'קשב וריכוז, מרחב וניווט, מספרים, שילוב בין חושים', color: '#ffc247', cx: 505, cy: 176, rx: 92, ry: 74, rot: 0, layer: 'surface' },
    { id: 'occ', name: 'האונה העורפית', en: 'Occipital lobe', does: 'ראייה, תמונות ודימויים, עיצוב, ויזואליה, וידאו', color: '#ff6fb5', cx: 246, cy: 290, rx: 66, ry: 104, rot: 0, layer: 'surface' },
    { id: 'tem', name: 'האונה הרקתית', en: 'Temporal lobe', does: 'שפה, ידע ועובדות, משמעות ומושגים, שמיעה, אנשים ושמות', color: '#9be34d', cx: 450, cy: 414, rx: 150, ry: 48, rot: 0, layer: 'surface' },
    { id: 'bg', name: 'גרעיני הבסיס', en: 'Basal ganglia', does: 'הרגלים, שגרות, דפוסי פעולה אוטומטיים, התמכרויות', color: '#ff8a3d', cx: 596, cy: 268, rx: 54, ry: 40, rot: 0, layer: 'deep' },
    { id: 'acc', name: 'קליפת החגורה', en: 'Anterior cingulate', does: 'מוטיבציה, מאמץ, התנגשות בין רצונות, ניטור שגיאות, דחיינות', color: '#b388ff', cx: 706, cy: 208, rx: 46, ry: 24, rot: -10, layer: 'deep' },
    { id: 'amy', name: 'האמיגדלה', en: 'Amygdala', does: 'רגשות, פחד, כעס, איום, המשמעות הרגשית של דברים', color: '#ff5a5a', cx: 684, cy: 396, rx: 38, ry: 28, rot: 0, layer: 'deep' },
    { id: 'hip', name: 'ההיפוקמפוס', en: 'Hippocampus', does: 'זיכרונות, אירועים וסיפורים אישיים, למידה חדשה', color: '#4cc9ff', cx: 550, cy: 376, rx: 58, ry: 24, rot: -12, layer: 'deep' },
    { id: 'hyp', name: 'ההיפותלמוס', en: 'Hypothalamus', does: 'צרכים בסיסיים, דחפים, גוף, רעב, שינה, בריאות', color: '#d4a373', cx: 628, cy: 328, rx: 40, ry: 22, rot: 0, layer: 'deep' },
    { id: 'cer', name: 'המוחון', en: 'Cerebellum', does: 'מיומנויות, תרגול, למידה מוטורית, דיוק, שיפור מתמיד', color: '#7be0a0', cx: 328, cy: 490, rx: 86, ry: 46, rot: 8, layer: 'surface', own: true },
    { id: 'stem', name: 'גזע המוח', en: 'Brainstem', does: 'ערנות, אנרגיה, עייפות, נשימה, מצב הגוף הבסיסי', color: '#9aa5b8', cx: 538, cy: 556, rx: 34, ry: 86, rot: 4, layer: 'surface', own: true }
  ];

  BG.KINDS = [
    { id: 'value', name: 'ערך', home: 'pfc' },
    { id: 'goal', name: 'מטרה / חזון', home: 'pfc' },
    { id: 'habit', name: 'הרגל / שגרה', home: 'bg' },
    { id: 'emotion', name: 'רגש', home: 'amy' },
    { id: 'memory', name: 'זיכרון / אירוע', home: 'hip' },
    { id: 'skill', name: 'מיומנות', home: 'cer' },
    { id: 'concept', name: 'מושג', home: 'tem' },
    { id: 'fact', name: 'עובדה / ידע', home: 'tem' },
    { id: 'person', name: 'אדם', home: 'tem' },
    { id: 'image', name: 'דימוי / ויזואל', home: 'occ' },
    { id: 'need', name: 'צורך / דחף', home: 'hyp' },
    { id: 'action', name: 'פעולה', home: 'mot' },
    { id: 'space', name: 'קשב / מרחב', home: 'par' },
    { id: 'tension', name: 'מתח / מוטיבציה', home: 'acc' },
    { id: 'state', name: 'מצב גוף', home: 'stem' },
    { id: 'doc', name: 'מסמך', home: 'tem', source: true },
    { id: 'url', name: 'אתר', home: 'tem', source: true }
  ];

  // Cheap keyword lexicon for the offline (no-AI) extractor.
  BG.LEXICON = {
    pfc: ['ערך', 'ערכים', 'מטרה', 'מטרות', 'תכנון', 'החלטה', 'אחריות', 'חזון', 'עקרון', 'זהות', 'goal', 'value', 'values', 'plan', 'decision', 'vision', 'principle'],
    bg: ['הרגל', 'הרגלים', 'שגרה', 'אוטומטי', 'התמכרות', 'חזרתי', 'habit', 'habits', 'routine', 'addiction', 'automatic'],
    amy: ['פחד', 'כעס', 'חרדה', 'שמחה', 'רגש', 'רגשות', 'בושה', 'אשמה', 'עצב', 'תסכול', 'fear', 'anger', 'anxiety', 'emotion', 'joy', 'shame', 'guilt', 'sadness'],
    hip: ['זיכרון', 'זיכרונות', 'זוכר', 'ילדות', 'אירוע', 'סיפור', 'memory', 'memories', 'remember', 'childhood', 'story', 'episode'],
    cer: ['תרגול', 'מיומנות', 'אימון', 'כושר', 'דיוק', 'practice', 'skill', 'training', 'precision'],
    occ: ['תמונה', 'צבע', 'עיצוב', 'ויזואלי', 'וידאו', 'ציור', 'image', 'color', 'design', 'visual', 'video', 'drawing'],
    hyp: ['שינה', 'רעב', 'אוכל', 'גוף', 'בריאות', 'ספורט', 'צורך', 'sleep', 'hunger', 'food', 'body', 'health', 'need'],
    mot: ['לעשות', 'פעולה', 'ביצוע', 'תנועה', 'action', 'execute', 'movement', 'doing'],
    par: ['קשב', 'ריכוז', 'מספר', 'מרחב', 'מפה', 'attention', 'focus', 'space', 'map', 'number'],
    acc: ['מוטיבציה', 'מאמץ', 'קונפליקט', 'התנגשות', 'דחיינות', 'motivation', 'effort', 'conflict', 'procrastination'],
    stem: ['ערנות', 'נשימה', 'עייפות', 'אנרגיה', 'alertness', 'breathing', 'fatigue', 'energy']
  };
})(window.BG);
