#!/usr/bin/env node
/**
 * Records a ~30s trailer (shots/trailer.mp4) from the running dev server.
 * Four cinematic shots, camera driven per captured frame (deterministic moves):
 *   1. island reveal (aerial sweep in)   2. downtown orbit (day)
 *   3. Bloom Retrofit wave, dusk→night   4. lightning fires, night pull-back
 * Frames are grabbed as JPEGs and encoded with ffmpeg (fades + title cards).
 *
 *   bun run dev        # keep it running
 *   bun run trailer    # or: node scripts/trailer.mjs [--duration 30] [--fps 30]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d;
};
const base = arg('base', 'http://localhost:5173');
const path = arg('path', '/?quality=high&nodynres');
const fps = Number(arg('fps', 30));
const seconds = Number(arg('duration', 30));
const framesDir = arg('frames', 'shots/trailer');
const out = arg('out', 'shots/trailer.mp4');
const W = 1920;
const H = 1080;
const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Founding-city landmarks (tiles): downtown ≈ 292/222, towns at 150/270 and 360/250.
const RETROFIT = `(() => {
  const g = window.bloomgrid;
  g.city.credits = 1e6;
  g.commands.execute('retrofit', { x: 292, z: 224, radius: 12 });
})()`;
const IGNITE = `(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const { ignite } = await import('/src/sim/hazards.ts');
  const near = (x, z) => {
    let best = -1;
    let bd = 1e9;
    for (const e of c.buildingEntities()) {
      const r = c.buildingRecord(e);
      const d = (r.x - x) ** 2 + (r.z - z) ** 2;
      if (d < bd) (bd = d), (best = e);
    }
    return best;
  };
  [[292, 222], [150, 270], [360, 250]].forEach(([x, z]) => ignite(c, near(x, z), 'lightning', 0.8));
})()`;

const PLAN = 30; // seconds the shot durations below were choreographed for
const shots = [
  {
    dur: 7.2,
    view: (t, od) => ({
      x: lerp(300, 284, t),
      z: lerp(248, 232, t),
      yaw: lerp(0.35, 0.95, t),
      pitch: lerp(1.18, 0.95, t),
      dist: lerp(od * 1.05, 205, t),
    }),
  },
  {
    dur: 7.2,
    view: (t) => ({ x: 292, z: 224, yaw: lerp(1.35, 2.15, t), pitch: lerp(0.66, 0.52, t), dist: lerp(62, 38, t) }),
  },
  {
    dur: 7.2,
    enter: RETROFIT,
    tod: (t) => lerp(0.55, 0.96, t),
    view: (t) => ({ x: 292, z: 224, yaw: lerp(2.15, 1.55, t), pitch: lerp(0.52, 0.44, t), dist: lerp(38, 30, t) }),
  },
  {
    dur: 8.4,
    enter: IGNITE,
    tod: () => 0.96,
    view: (t, od) => ({
      x: lerp(292, 264, t),
      z: lerp(224, 254, t),
      yaw: lerp(1.55, 1.95, t),
      pitch: lerp(0.44, 1.08, t),
      dist: lerp(30, od, t),
    }),
  },
];
const scale = seconds / PLAN;
shots.forEach((s) => (s.dur *= scale));

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) if (f.endsWith('.jpg')) rmSync(join(framesDir, f));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
let errors = 0;
page.on('console', (m) => ['warn', 'error'].includes(m.type()) && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => (errors++, console.log(`[pageerror] ${e.message}`)));
browser.on('disconnected', () => console.log('[trailer] browser disconnected'));

// Title cards: rendered now (before capture) as transparent full-frame PNGs.
const card = async (lines) => {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  await p.setContent(
    `<body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:transparent;font-family:Helvetica,Arial,sans-serif;text-align:center">
      ${lines
        .map(
          ([text, size, ls, top]) =>
            `<div style="margin-top:${top}px;font-size:${size}px;letter-spacing:${ls}px;padding-left:${ls}px;font-weight:700;color:#fff;text-shadow:0 2px 28px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.5)">${text}</div>`,
        )
        .join('')}
    </body>`,
  );
  const file = join(framesDir, `${lines[0][0].toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
  await p.screenshot({ path: file, type: 'png', omitBackground: true });
  await p.close();
  return file;
};
const titlePng = await card([
  ['BLOOMGRID', 108, 26, 0],
  ['A SOLARPUNK ISLAND STEWARD', 32, 7, 26],
]);
const endPng = await card([['TEND IT AND IT BLOOMS', 46, 10, 0]]);

await page.goto(base + path, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000)); // boot reveal + founding city
const od = await page.evaluate(() => window.bloomgrid.cameraCtl.overviewDistance);
console.log(`[trailer] overview distance ${od.toFixed(0)}, capturing ${Math.round(seconds * fps)} frames at ${W}x${H}`);

const total = Math.round(seconds * fps);
let shotIdx = -1;
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const time = f / fps;
  let acc = 0;
  let i = 0;
  while (i < shots.length - 1 && time >= acc + shots[i].dur) (acc += shots[i].dur), i++;
  const shot = shots[i];
  const local = Math.min(1, Math.max(0, (time - acc) / shot.dur));
  if (i !== shotIdx) {
    shotIdx = i;
    if (shot.enter) await page.evaluate(shot.enter);
    console.log(`[trailer] shot ${i + 1} @ ${time.toFixed(1)}s`);
  }
  const v = shot.view(ease(local), od);
  const tod = shot.tod?.(ease(local));
  await page.evaluate((v, tod) => {
    const g = window.bloomgrid;
    const cam = g.cameraCtl;
    cam.lookAt(v.x, v.z, v.dist, true);
    cam.yaw = cam.goalYaw = v.yaw;
    cam.pitch = cam.goalPitch = v.pitch;
    cam.distance = cam.goalDistance = v.dist;
    if (g.input) g.input.lastActivity = performance.now();
    if (tod !== undefined && tod !== null) g.city.timeOfDay = tod;
  }, v, tod);
  await page.screenshot({ path: join(framesDir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (f % 90 === 0) console.log(`[trailer] frame ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}

// Encode: composite the cards (overlay + alpha fades), then fade the whole video in/out.
await browser.close();

const titleEnd = Math.min(5.8, seconds * 0.3 + 2.8);
const endStart = Math.max(0, seconds - 3.4);
const fades = (s, e) =>
  `fade=t=in:st=${s.toFixed(2)}:d=0.8:alpha=1,fade=t=out:st=${Math.max(0, e - 0.8).toFixed(2)}:d=0.8:alpha=1`;
const inputs = ['-framerate', String(fps), '-i', join(framesDir, 'f%04d.jpg')];
const graph = [];
let n = 1;
if (seconds >= 3) {
  inputs.push('-loop', '1', '-t', String(seconds), '-i', titlePng);
  graph.push(`[${n}:v]${fades(1.2, titleEnd)}[t]`, `[0:v][t]overlay[o${n}]`);
  n++;
}
if (seconds >= 4.4) {
  inputs.push('-loop', '1', '-t', String(seconds), '-i', endPng);
  graph.push(`[${n}:v]${fades(endStart, seconds - 0.4)}[e]`, `[o${n - 1}][e]overlay[o${n}]`);
  n++;
}
const last = n === 1 ? '0:v' : `o${n - 1}`;
graph.push(`[${last}]fade=t=in:st=0:d=0.7,fade=t=out:st=${Math.max(0, seconds - 0.9).toFixed(2)}:d=0.9,format=yuv420p[v]`);
console.log(`[trailer] encoding ${out}`);
execFileSync('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex', graph.join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
console.log(`[trailer] done: ${out} (${errors} page errors)`);
