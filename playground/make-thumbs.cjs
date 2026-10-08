// Regenerates playground/thumbs/*.jpg for the hub (index.html).
// Usage: node playground/make-thumbs.cjs [path/to/three-r128.min.js] [id,id,...]
// Pass a local three r128 only when cdnjs is unreachable (e.g. a sandbox).
const { chromium } = require('playwright');
const fs = require('fs');
const root = require('path').resolve(__dirname, '..') + '/';
const three = process.argv[2] && process.argv[2] !== '-' ? fs.readFileSync(process.argv[2]) : null;
const items = [
  ['shimotron-race','shimotron/dist/race.html',9000],['shimotron-editor','shimotron/dist/index.html',8000],
  ['ironhawk','iron-hawk-3d/index.html',20000],['chess','chess-game/index.html',2500],['reversi','reversi-game/index.html',2500],['go','go-game/index.html',2500],
  ['generals','generals-game/index.html',3000],['snake','snake-3d-game/index.html',4000],['bowling','bowling-3d/index.html',5000],
  ['abyss','submarine-simulator/index.html',5000],['skyhawk','skyhawk-flight-simulator/index.html',5000],
  ['guitar','guitar-fx-mixer/index.html',2500],['spark','claude-spark-pack/spark.html',3500],['deck','decks/demo-presentation.html',2500],
  ['library3d','daily-3d-library/models/001-cadillac-one-the-beast/index.html?shot=1',8000],
  ['vscode','vscode-course/index.html',2000],['powerpoint','powerpoint-course/index.html',2000],['excel','excel-course/index.html',2000],
  ['gmail','gmail-course/index.html',2000],['windows','windows-desktop-course/index.html',2000],['canva','canva-course/index.html',2000],
  ['obsidian','obsidian-course/index.html',2000],
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  for (const [id, p, wait] of items.filter(i => !process.argv[3] || process.argv[3].split(',').includes(i[0]))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });
    const page = await ctx.newPage();
    if (three) {
      await page.route(/^https?:\/\//, r => r.abort());
      await page.route('https://cdnjs.cloudflare.com/**three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
    }
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    try { await page.goto('file://' + root + p, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(wait); } catch (e) { errs.push(e.message); }
    await page.screenshot({ path: root + 'playground/thumbs/' + id + '.jpg', type: 'jpeg', quality: 72 });
    console.log(id, errs.length ? 'ERR ' + errs[0].slice(0, 120) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
