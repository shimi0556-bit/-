// Packs the built game for a USB stick (or any folder, fully offline):
//   dist/usb/Shimotron/          ready to copy onto the drive as is
//   dist/Shimotron-USB.zip       the same folder in one download
// npm run usb   builds both bundles, bakes the islands' ground
// (tools/bake-ground.mjs), builds the usb bundle with it, then runs this.
//
// Both bundles are single self-contained HTML files (engine, fonts, code and
// the pre-baked ground inlined, nothing fetched from the network), so the package is just
// the two files plus a Hebrew start page with quality links and a short
// read-me. File names are ASCII so they survive any zip tool and FAT32.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const FOLDER = 'Shimotron';
const out = path.join(dist, 'usb', FOLDER);
const zipPath = path.join(dist, 'Shimotron-USB.zip');

// The game from the usb build (the islands' ground pre-baked in), the editor as is.
const files = { 'Shimotron-Rally.html': 'usb-build/race.html', 'Shimotron-Editor.html': 'index.html' };
for (const src of Object.values(files)) {
  if (!fs.existsSync(path.join(dist, src))) {
    console.error(`dist/${src} is missing: run "npm run build" first`);
    process.exit(1);
  }
}

const QUALITY = [
  ['', 'אוטומטית', 'המשחק בוחר לפי כרטיס המסך'],
  ['#low', 'נמוכה', 'מחשב חלש, לפטופ ישן'],
  ['#medium', 'בינונית', 'לפטופ רגיל'],
  ['#high', 'גבוהה', 'מחשב גיימינג'],
  ['#ultra', 'אולטרה', 'כרטיס מסך חזק מאוד'],
];

const start = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>שימוטרון · התחלה</title>
<style>
  :root { color-scheme: dark; --bg: #0b1016; --card: #121a24; --line: #233142; --ink: #e8eef5; --dim: #93a4b8; --hot: #ffb020; --cool: #39d9ff; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(1200px 600px at 70% -10%, #1b2a3c, var(--bg)); color: var(--ink);
    font: 16px/1.6 'Segoe UI', 'Noto Sans Hebrew', 'Arial Hebrew', Arial, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { margin: 0; font-size: clamp(34px, 7vw, 56px); line-height: 1.05; letter-spacing: -0.5px; }
  h1 span { color: var(--hot); }
  .tag { color: var(--dim); margin: 6px 0 26px; }
  .play { display: block; text-decoration: none; color: #111; background: linear-gradient(180deg, #ffc24d, var(--hot)); border-radius: 16px;
    padding: 22px 24px; font-size: 28px; font-weight: 800; text-align: center; box-shadow: 0 10px 30px rgba(255,176,32,0.25); }
  .play small { display: block; font-size: 15px; font-weight: 600; opacity: 0.75; }
  .play:hover, .play:focus-visible { filter: brightness(1.07); outline: none; }
  h2 { font-size: 18px; margin: 30px 0 10px; color: var(--cool); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .q { display: block; text-decoration: none; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .q b { display: block; font-size: 17px; }
  .q span { color: var(--dim); font-size: 13px; }
  .q:hover, .q:focus-visible { border-color: var(--cool); outline: none; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 18px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td:first-child { white-space: nowrap; width: 1%; padding-left: 16px; }
  kbd { font: 600 13px/1 Consolas, 'Courier New', monospace; background: #0b1118; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 6px; padding: 3px 6px; direction: ltr; display: inline-block; }
  ul { margin: 0; padding-inline-start: 20px; }
  li { margin: 4px 0; }
  .editor { display: inline-block; margin-top: 8px; color: var(--cool); }
  footer { color: var(--dim); font-size: 13px; margin-top: 30px; }
</style>
</head>
<body>
<main>
  <h1>שימוטרון <span>ראלי</span></h1>
  <p class="tag">המשחק כולו נמצא בתיקייה הזאת ועובד בלי אינטרנט, ישר מהדיסק און קי.</p>

  <a class="play" href="Shimotron-Rally.html">▶ שחק<small>פותח את המשחק באיכות אוטומטית</small></a>

  <h2>איכות גרפיקה</h2>
  <div class="grid">
${QUALITY.map(([h, name, note]) => `    <a class="q" href="Shimotron-Rally.html${h}"><b>${name}</b><span>${note}</span></a>`).join('\n')}
  </div>

  <h2>שליטה</h2>
  <div class="card"><table>
    <tr><td><kbd>W</kbd> <kbd>↑</kbd></td><td>גז</td></tr>
    <tr><td><kbd>S</kbd> <kbd>↓</kbd></td><td>בלם, ורוורס כשעומדים</td></tr>
    <tr><td><kbd>A</kbd> <kbd>D</kbd> <kbd>←</kbd> <kbd>→</kbd></td><td>היגוי</td></tr>
    <tr><td><kbd>רווח</kbd></td><td>בלם יד (בכלי טיס וצוללות: עלייה)</td></tr>
    <tr><td><kbd>Shift</kbd> <kbd>N</kbd></td><td>ניטרו (בכלי טיס וצוללות: ירידה)</td></tr>
    <tr><td><kbd>Ctrl</kbd> <kbd>Enter</kbd></td><td>ירייה, מוקש או הפתעה אחרת</td></tr>
    <tr><td><kbd>C</kbd> · <kbd>B</kbd></td><td>החלפת מצלמה · מבט לאחור</td></tr>
    <tr><td><kbd>AltGr</kbd></td><td>חזרה למסלול</td></tr>
    <tr><td><kbd>Esc</kbd> · <kbd>M</kbd></td><td>עצירה · השתקה</td></tr>
  </table></div>
  <p style="color:var(--dim);margin:8px 0 0">עובד גם עם ג׳ויסטיק (Xbox / PlayStation) ועם מסך מגע.</p>

  <h2>טוב לדעת</h2>
  <div class="card"><ul>
    <li>צריך דפדפן עדכני: Chrome, Edge, Firefox או Safari. אם נפתח דפדפן אחר, לוחצים על הקובץ בכפתור ימני ← "פתח באמצעות".</li>
    <li>הטעינה הראשונה לוקחת כמה שניות: כל העולם, האיים, הים והעיר נבנים בזמן אמת.</li>
    <li>ההתקדמות בקריירה והשיאים נשמרים בדפדפן של המחשב שעליו משחקים, לא על הדיסק און קי.</li>
    <li>חשוב לפתוח את הקבצים מהתיקייה עצמה (אחרי חילוץ מה־zip), לא מתוך קובץ ה־zip.</li>
  </ul>
  <a class="editor" href="Shimotron-Editor.html">פתיחת מנוע שימוטרון והעורך ←</a></div>

  <footer>שימוטרון · מנוע תלת־ממד ומשחק מירוצים בדפדפן. אין בו אף קובץ תמונה, מודל או צליל: הכול נבנה בקוד. הגופנים: Karantina, IBM Plex Sans Hebrew ו־JetBrains Mono (רישיון SIL OFL).</footer>
</main>
</body>
</html>
`;

const readme = [
  'שימוטרון ראלי - משחק מירוצים בתלת-ממד',
  '======================================',
  '',
  'איך שמים על דיסק און קי:',
  '  1. מחלצים את קובץ ה-zip (כפתור ימני > "חלץ הכל").',
  '  2. מעתיקים את התיקייה Shimotron כמו שהיא לדיסק און קי.',
  '',
  'איך משחקים:',
  '  פותחים את Start.html (לחיצה כפולה) ולוחצים "שחק".',
  '  אפשר גם לפתוח ישר את Shimotron-Rally.html.',
  '  לא צריך אינטרנט ולא צריך להתקין כלום.',
  '',
  'מה יש בתיקייה:',
  '  Start.html             דף פתיחה: שחק, בחירת איכות גרפיקה, מקשים',
  '  Shimotron-Rally.html   המשחק',
  '  Shimotron-Editor.html  מנוע שימוטרון עם העורך',
  '  README.txt             הקובץ הזה',
  '',
  'איכות גרפיקה: בדף הפתיחה יש קישורים לכל רמה.',
  '  נמוכה למחשב חלש, אולטרה לכרטיס מסך חזק.',
  '',
  'מקשים:',
  '  W / חץ למעלה        גז',
  '  S / חץ למטה         בלם, ורוורס',
  '  A D / חצים          היגוי',
  '  רווח                בלם יד',
  '  Shift / N           ניטרו',
  '  Ctrl / Enter        ירייה, מוקש או הפתעה',
  '  C / B               מצלמה / מבט לאחור',
  '  AltGr               חזרה למסלול',
  '  Esc / M             עצירה / השתקה',
  '',
  'צריך דפדפן עדכני: Chrome, Edge, Firefox או Safari.',
  'ההתקדמות והשיאים נשמרים בדפדפן של המחשב שעליו משחקים.',
  '',
].join('\r\n');

fs.rmSync(path.join(dist, 'usb'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const entries = [];
const put = (name, data) => {
  fs.writeFileSync(path.join(out, name), data);
  entries.push([`${FOLDER}/${name}`, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
};
put('Start.html', start);
for (const [name, src] of Object.entries(files)) put(name, fs.readFileSync(path.join(dist, src)));
put('README.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(readme)])); // BOM: Notepad shows the Hebrew

fs.writeFileSync(zipPath, zip(entries));
const kb = (n) => `${Math.round(n / 1024)} KB`;
for (const [name, data] of entries) console.log(`  ${name.padEnd(34)} ${kb(data.length)}`);
console.log(`dist/usb/${FOLDER}/  and  dist/Shimotron-USB.zip (${kb(fs.statSync(zipPath).size)})`);

// Minimal zip writer (deflate, UTF-8 names, fixed timestamp so rebuilds of
// the same bundles give the same zip).
function zip(list) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const time = (12 << 11) | (0 << 5), date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of list) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12); dir.writeUInt16LE(date, 14); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBuf, end]);
}
