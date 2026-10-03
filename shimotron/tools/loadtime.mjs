// Measures how long Shimotron Rally takes to load in headless Chromium:
// time to the menu (world map), each island built, and — the number a player
// feels — time from the first frame of the menu to driving when "start" is
// pressed straight away.
//   npm run build:race && node tools/loadtime.mjs [page] [runs]
// Headless Chromium draws with SwiftShader (on the CPU), so absolute times are
// several times a real GPU's; compare runs of this script with each other.
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(process.argv[2] || path.join(root, 'dist', 'race.html'));
const runs = Number(process.argv[3] || 1);
let playwright;
try {
  playwright = await import('playwright');
} catch {
  const global = execSync('npm root -g').toString().trim();
  playwright = createRequire(path.join(global, 'noop.js'))('playwright');
}

async function once() {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'],
  });
  const tab = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await tab.goto(pathToFileURL(page).href + '#medium');
  const s = (ms) => +(ms / 1000).toFixed(1);
  const out = { page: path.basename(page) };
  await tab.waitForFunction(() => window.shimotron?.game?.state === 'menu', null, { timeout: 900000, polling: 50 });
  out.menu = s(Date.now() - t0);
  // Straight to a race on the first island, as an impatient player would.
  const t1 = Date.now();
  await tab.evaluate(() => window.shimotron.game.startSingle ? window.shimotron.game.startSingle() : (window.shimotron.game.mode = 'single', window.shimotron.game._launch(0)));
  await tab.waitForFunction(() => window.shimotron.game.state === 'race', null, { timeout: 900000, polling: 50 });
  out.menuToRace = s(Date.now() - t1);
  out.firstRace = s(Date.now() - t0);
  out.islandsAtRace = await tab.evaluate(() => window.shimotron.game.islands.size);
  // Back to the menu: the rest of the world is built there.
  const t2 = Date.now();
  await tab.evaluate(() => window.shimotron.game.toMenu());
  await tab.waitForFunction(() => window.shimotron.game.islands?.size >= 7 && !window.shimotron.game._bgBuild, null, { timeout: 900000, polling: 200 });
  out.restInMenu = s(Date.now() - t2);
  out.errors = errors.slice(0, 3);
  await browser.close();
  return out;
}

for (let i = 0; i < runs; i++) console.log(JSON.stringify(await once()));
