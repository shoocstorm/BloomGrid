#!/usr/bin/env node
/**
 * Blink probe: what flashes by itself on a held view with the world running (clock, sim, dynamic resolution all
 * live, as a player sees it). Takes `--frames` screenshots of the same view and counts, per pixel, how often its
 * brightness jumps by more than `--threshold`; a pixel that jumps `--min` times or more is a blinker (something
 * that moves past a pixel jumps twice). Prints the blinker share and writes a heat map (`--out`) of where they are.
 *
 *   bun run blink -- --overview --night --out shots/blink.png
 *   bun run blink -- --path "/?nodynres" --cx 292 --cz 222 --dist 140 --pitch 0.7
 *
 * Options: --base, --path (default "/"), --overview (the O key's view), --cx/--cz/--dist/--yaw/--pitch, --night,
 * --frames 40, --threshold 40, --min 4, --size 1440x900, --dpr 2, --wait (ms before capturing, default 6000).
 */
import { launchChrome, findChrome } from './lib/chrome.mjs';
import sharp from 'sharp';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? 'true' : all[i + 1]]] : acc,
      [],
    ),
);
const base = args.base ?? 'http://localhost:3000';
const path = args.path ?? '/';
const full = /[?&]scenario=/.test(path) ? path : `${path}${path.includes('?') ? '&' : '?'}scenario=founding-city`;
const [W, H] = (args.size ?? '1440x900').split('x').map(Number);
const dpr = Number(args.dpr ?? 2);
const frames = Number(args.frames ?? 40);
const threshold = Number(args.threshold ?? 40);
const min = Number(args.min ?? 4);

const browser = await launchChrome({
  executablePath: findChrome(args.chrome),
  maxSeconds: 10 * 60,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => /\[dynres\]/.test(m.text()) && console.log(m.text()));
await page.goto(base + full, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 90000, polling: 250 });
await page.evaluate(
  ({ a }) => {
    const g = window.bloomgrid;
    document.getElementById('hud').style.visibility = 'hidden';
    g.services.get('render').power.mode = 'max';
    if (a.night) g.city.timeOfDay = 0.95;
    const c = g.cameraCtl;
    if (a.overview) c.overview();
    else {
      const x = Number(a.cx ?? 292);
      const z = Number(a.cz ?? 222);
      c.setView({ x, z, yaw: Number(a.yaw ?? 0.6), pitch: Number(a.pitch ?? 0.7), distance: Number(a.dist ?? 140) });
    }
  },
  { a: args },
);
await new Promise((r) => setTimeout(r, Number(args.wait ?? 6000)));

const grab = async () => {
  const { data, info } = await sharp(await page.screenshot({ type: 'png' }))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Float32Array(info.width * info.height);
  for (let i = 0, j = 0; j < out.length; i += 3, j++) out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { l: out, w: info.width, h: info.height };
};
let prev = null;
let jumps = null;
let size = null;
for (let f = 0; f <= frames; f++) {
  const cur = await grab();
  size ??= cur;
  jumps ??= new Uint16Array(cur.l.length);
  if (prev) for (let i = 0; i < cur.l.length; i++) if (Math.abs(cur.l[i] - prev[i]) > threshold) jumps[i]++;
  prev = cur.l;
}
let n = 0;
for (const j of jumps) if (j >= min) n++;
console.log(`blinkers (≥ ${min} jumps > ${threshold}/255 in ${frames} frames): ${((n / jumps.length) * 100).toFixed(3)} %`);
if (args.out) {
  const img = Buffer.alloc(jumps.length * 3);
  for (let i = 0; i < jumps.length; i++) {
    const v = prev[i] * 0.3;
    const hot = jumps[i] >= min;
    img[i * 3] = hot ? 255 : v;
    img[i * 3 + 1] = hot ? Math.max(0, 255 - jumps[i] * 12) : v;
    img[i * 3 + 2] = hot ? 0 : v;
  }
  await sharp(img, { raw: { width: size.w, height: size.h, channels: 3 } }).png().toFile(args.out);
  console.log(`map → ${args.out}`);
}
await browser.close();
