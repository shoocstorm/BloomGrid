#!/usr/bin/env node
/**
 * Fly-out flash probe: what pops while the camera glides to the island view (the O key). The engine is stopped and
 * frames are stepped by hand at 1/60 s (input, sim tick, sync, render), each captured; a pixel that jumps by more
 * than `--threshold` and back within two frames (A → B → A) is a pop, not motion. Prints pops per frame (spikes
 * name the frame where something switched) and writes the worst frame's pop map to `--out`.
 *
 *   bun run flyprobe -- --night --out shots/fly.png
 *
 * Options: --base, --path, --night, --from x,z,dist,pitch (start view, default downtown 292,222,90,0.75),
 * --frames 150, --threshold 40, --size 1280x800, --dpr 1, --log (print the [dynres]/[lod] logs).
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
const path = args.path ?? '/?nodynres';
const full = /[?&]scenario=/.test(path) ? path : `${path}${path.includes('?') ? '&' : '?'}scenario=founding-city`;
const [W, H] = (args.size ?? '1280x800').split('x').map(Number);
const frames = Number(args.frames ?? 150);
const threshold = Number(args.threshold ?? 40);
const from = (args.from ?? '292,222,90,0.75').split(',').map(Number);

const browser = await launchChrome({
  executablePath: findChrome(args.chrome),
  maxSeconds: 15 * 60,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: Number(args.dpr ?? 1) });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
if (args.log) page.on('console', (m) => /^\[/.test(m.text()) && console.log(m.text()));
await page.goto(base + full, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 90000, polling: 250 });
await page.evaluate(
  async ({ night, from }) => {
    const g = window.bloomgrid;
    document.getElementById('hud').style.visibility = 'hidden';
    if (night) g.city.timeOfDay = 0.95;
    g.engine.speed = 0;
    const [x, z, d, p] = from;
    const c = g.cameraCtl;
    c.target.set(x, 0, z);
    c.goalTarget.set(x, 0, z);
    c.distance = c.goalDistance = d;
    c.pitch = c.goalPitch = p;
    await new Promise((r) => setTimeout(r, 5000));
    g.engine.stop();
    let t = 0;
    window.__step = () => {
      t += 1 / 60;
      const f = { dt: 1 / 60, tickDt: 1 / 60, alpha: 0, elapsed: t, tick: g.city.tick };
      g.systems.run('input', g, f);
      g.systems.run('sync', g, f);
      g.systems.run('render', g, f);
      return new Promise((res) => requestAnimationFrame(() => res()));
    };
    for (let i = 0; i < 30; i++) await window.__step();
    c.overview();
  },
  { night: !!args.night, from },
);

const grab = async () => {
  const { data, info } = await sharp(await page.screenshot({ type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const l = new Float32Array(info.width * info.height);
  for (let i = 0, j = 0; j < l.length; i += 3, j++) l[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { l, w: info.width, h: info.height };
};
const seq = [];
for (let f = 0; f < frames; f++) {
  await page.evaluate(() => window.__step());
  seq.push(await grab());
}
let worst = { n: 0, f: -1, map: null };
const counts = [];
for (let f = 1; f < seq.length - 1; f++) {
  const [a, b, c] = [seq[f - 1].l, seq[f].l, seq[f + 1].l];
  let n = 0;
  const map = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) {
    const up = b[i] - a[i];
    const back = b[i] - c[i];
    if (Math.abs(up) > threshold && Math.abs(back) > threshold && Math.sign(up) === Math.sign(back)) {
      n++;
      map[i] = 1;
    }
  }
  counts.push(n);
  if (n > worst.n) worst = { n, f, map };
}
const total = seq[0].l.length;
console.log('pops per frame (% of pixels):');
console.log(counts.map((n, i) => `${i + 1}:${((n / total) * 100).toFixed(3)}`).join(' '));
console.log(`mean ${((counts.reduce((s, n) => s + n, 0) / counts.length / total) * 100).toFixed(4)} %, worst frame ${worst.f} ${((worst.n / total) * 100).toFixed(3)} %`);
if (args.out && worst.map) {
  const { w, h } = seq[worst.f];
  const img = Buffer.alloc(total * 3);
  for (let i = 0; i < total; i++) {
    const v = seq[worst.f].l[i] * 0.35;
    img[i * 3] = worst.map[i] ? 255 : v;
    img[i * 3 + 1] = worst.map[i] ? 40 : v;
    img[i * 3 + 2] = worst.map[i] ? 40 : v;
  }
  await sharp(img, { raw: { width: w, height: h, channels: 3 } }).png().toFile(args.out);
  await sharp(Buffer.from(seq[worst.f].l.map((x) => x)), { raw: { width: w, height: h, channels: 1 } }).png().toFile(args.out.replace(/\.png$/, '-frame.png'));
  console.log(`worst frame map → ${args.out}`);
}
await browser.close();
