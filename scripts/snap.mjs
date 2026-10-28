#!/usr/bin/env node
/**
 * Headless visual check for BloomGrid (used by humans and AI agents).
 * Requires the dev server (`bun run dev`) and a local Chrome.
 *
 *   bun run snap -- --path "/?perf" --out shots/day.png
 *   bun run snap -- --path "/?renderer=webgl" --eval @scripts/scenes/demo-city.js --after 4000
 *   bun run snap -- --times 300,1500,3000,6000 --out shots/boot.png   # timed frames: boot-300.png …
 *   bun run snap -- --mobile --out shots/phone.png                      # 390×844 touch phone (--size overrides)
 *
 * Prints page console warnings/errors; exits 1 on uncaught page errors.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const base = args.base ?? 'http://localhost:5173';
const out = args.out ?? 'shots/snap.png';
const wait = Number(args.wait ?? 8000);
const after = Number(args.after ?? 3000);
const times = args.times ? args.times.split(',').map(Number) : null;
const mobile = args.mobile === 'true';
const [w, h] = (args.size ?? (mobile ? '390x844' : '1440x900')).split('x').map(Number);
const chrome =
  args.chrome ??
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));

mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${w},${h}`],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
let errors = 0;
// Warnings/errors, plus the app's own tagged logs (e.g. "[boot] …", "[scenario] …").
page.on('console', (m) => (['warn', 'error'].includes(m.type()) || /^\[[a-z]+\]/.test(m.text())) && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => (errors++, console.log(`[pageerror] ${e.message}`)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await page.goto(base + (args.path ?? '/'), { waitUntil: 'domcontentloaded' });

if (times) {
  for (const t of times) {
    await sleep(Math.max(0, t - (Date.now() - t0)));
    const file = out.replace(/\.png$/, `-${t}.png`);
    await page.screenshot({ path: file });
    console.log(`[shot] ${file}`);
  }
} else {
  await sleep(wait);
  if (args.eval) {
    const code = args.eval.startsWith('@') ? readFileSync(args.eval.slice(1), 'utf8') : args.eval;
    const r = await page.evaluate(code);
    if (r !== undefined) console.log(`[eval] ${JSON.stringify(r)}`);
    await sleep(after);
  }
  await page.screenshot({ path: out });
  console.log(`[shot] ${out}`);
}
await browser.close();
process.exit(errors ? 1 : 0);
