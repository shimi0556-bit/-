// Render every given model headless, fail on any page/console error, and save
// thumb.jpg (gallery card), shots/*.png (QA views) and stats.json next to it.
//   node tools/check.cjs [model-id ...]          (no ids = all models)
// Needs Playwright. In the Claude Code sandbox it's the global install.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = fs.readdirSync(path.join(ROOT, 'models')).filter((d) => fs.existsSync(path.join(ROOT, 'models', d, 'model.js')));
const targets = ids.length ? all.filter((d) => ids.includes(d)) : all;
const QA = process.argv.includes('--qa');

// CDN files (three.js) are fetched once with curl — which honours the machine's
// proxy and CA setup — cached, and served to the page through request routing.
const CACHE = path.join(os.tmpdir(), 'l3d-cdn-cache');
fs.mkdirSync(CACHE, { recursive: true });
async function serveCdn(route) {
  const url = route.request().url();
  if (!url.startsWith('https://cdn.jsdelivr.net/')) return route.abort(); // fonts etc. fall back to system fonts
  const file = path.join(CACHE, url.replace(/[^a-z0-9.]+/gi, '_'));
  if (!fs.existsSync(file)) execFileSync('curl', ['-sSfL', url, '-o', file]);
  return route.fulfill({ path: file, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
}

(async () => {
  const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const id of targets) {
    const dir = path.join(ROOT, 'models', id);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route(/^https?:\/\//, serveCdn);
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto('file://' + path.join(dir, 'index.html') + '?shot=1');
    if (process.argv.includes('--verbose')) page.on('console', (m) => console.log('       [' + m.type() + '] ' + m.text().slice(0, 400)));
    try { await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 240000 }); }
    catch { errors.push('timeout: page never became ready'); }
    const err = await page.evaluate(() => window.__error);
    if (err) errors.push('model: ' + err);
    const stats = (await page.evaluate(() => window.__stats)) || {};
    if (!errors.length) await page.screenshot({ path: path.join(dir, 'thumb.jpg'), type: 'jpeg', quality: 86, timeout: 120000 });
    if (QA) {
      const shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
      const views = await page.evaluate(() => Object.keys(window.L3D_META.views || {}));
      const plan = [
        ['front', {}], ['side', {}], ['rear', {}], ['top', {}], ['under', {}],
        ['explode', { explode: 1 }], ['xray', { xray: true }], ['cut', { cut: 0.5 }], ['open', { toggles: ['doors', 'hood', 'trunk', 'flags'] }], ['night', { night: true, toggles: ['lights', 'cabin', 'siren', 'flags'] }],
        ...views.map((v) => [v, {}]),
      ];
      for (const [name, o] of plan) {
        await page.evaluate(([name, o]) => {
          const v = window.__viewer;
          v.toggles.forEach((t) => { const on = o.toggles ? o.toggles.includes(t.id) : t.init > 0.5; t.target = t.t = on ? 1 : 0; t.apply(t.t); });
          v.setExplode(o.explode || 0); v.setXray(!!o.xray); v.setCut(o.cut || 0);
          const views = { front: 1, side: 1, rear: 1, top: 1, under: 1, explode: 1 };
          v.goView(views[name] || window.L3D_META.views?.[name] ? name : 'hero');
          if (o.night) v.setNight(true); else v.setNight(false);
          window.__render();
        }, [name, o]);
        await page.screenshot({ path: path.join(shots, name + '.png'), timeout: 120000 });
      }
    }
    fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
    console.log(`  ${errors.length ? 'FAIL' : 'ok  '} ${id}: ${stats.parts} parts, ${stats.meshes} meshes, ${stats.triangles} triangles, built in ${stats.buildMs}ms`);
    errors.forEach((e) => console.log('       ' + e));
    if (errors.length) failed++;
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
