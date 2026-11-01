#!/usr/bin/env node
/**
 * Records the ~76s feature trailer (shots/feature-trailer.mp4) from the running dev server, against the
 * showcase city (`scenario=founding-city`; a plain boot is a fresh island, D-072). Twelve shots, camera
 * driven per captured frame (lookAt always centers the subject):
 *   1. island aerial reveal (title)      2. downtown orbit, day
 *   3. Windward Isle wind farm           4. Bloomtopia park + suspension bridge
 *   5. Aeroline train ride (explore)     6. dusk→night fireworks: heart then butterfly (caption card)
 *   7. rings, then "BLOOM ♥" written in the sky (engine at 3x so grand shows span ~3s of video)
 *   8. night, fires ignite, Flora console opens
 *   9. Flora AI: /advisor_tips + /incident_status cards (caption card)
 *   10. Bloom Retrofit wave at dawn      11. Flora-Net hive + drone mist
 *   12. pull back to overview (end card)
 *
 * Encodes at crf 25 / preset slow so the mp4 is small enough to commit under public/assets/ (GitHub's
 * hard limit is 100 MB; keep it under ~60 MB).
 *
 *   bun run dev                # keep it running
 *   bun run trailer:feature    # or: node scripts/feature-trailer.mjs [--duration 76] [--fps 30]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d;
};
/** Scripts record the showcase city unless a path names a scenario (a plain boot is a fresh island, D-072). */
const showcase = (p) => (/[?&]scenario=/.test(p) ? p : `${p}${p.includes('?') ? '&' : '?'}scenario=founding-city`);
const base = arg('base', 'http://localhost:5173');
const path = showcase(arg('path', '/?quality=high&nodynres'));
const fps = Number(arg('fps', 30));
const PLAN = 76;
const seconds = Number(arg('duration', PLAN));
const framesDir = arg('frames', 'shots/feature-trailer');
const out = arg('out', 'shots/feature-trailer.mp4');
const W = 1920;
const H = 1080;
const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const near = `(x, z) => {
  let best = -1;
  let bd = 1e9;
  for (const e of c.buildingEntities()) {
    const r = c.buildingRecord(e);
    const d = (r.x - x) ** 2 + (r.z - z) ** 2;
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}`;
const ENTER_TRAIN = `window.bloomgrid.services.get('explore').setMode('train')`;
const EXIT_TRAIN = `window.bloomgrid.services.get('explore').setMode('city')`;
const SPEED = (n) => `window.bloomgrid.engine.speed = ${n}`;
// Fireworks (D-068): one launch per Fireworks Factory yard; we build one on the Westport waterfront if the
// showcase city lacks it (the fireworks scene does the same), fill the racks and take over the sky. A grand
// show fires 60 shells over 30 sim-seconds, so the act runs at engine speed 3: one show spans ~3.3s of video.
const launch = (extra) => `window.bloomgrid.commands.execute('launchFireworks', ${JSON.stringify({ grand: true, ...extra })})`;
const FLORA_OPEN = `(() => {
  const g = window.bloomgrid;
  g.services.get('assistant').toggle(true);
  const c = g.city;
  // Three fires: Flora's console picks them up as notices (no model needed).
  (async () => {
    const { ignite } = await import('/src/sim/hazards.ts');
    const near = ${near};
    [[292, 222], [150, 270], [360, 250]].forEach(([x, z]) => ignite(c, near(x, z), 'lightning', 0.8));
  })();
})()`;
const FLORA_CLOSE = `window.bloomgrid.services.get('assistant').toggle(false)`;
const ASK = (tool) => `window.bloomgrid.services.get('assistant').ask('/${tool}')`;

// Founding-city landmarks (tiles): downtown ≈ 292/222, wind farm ≈ 430/102 (lighthouse 471/41),
// Bloomtopia ≈ 252/440 (bridge at 252/404, gate faces yaw π), gardens quarter ≈ 222/284.
const PLAN_SECONDS = PLAN;
let hive = { x: 282, z: 333 }; // flora-hive, resolved from the live city at boot
let yard = { x: 54, z: 281 }; // fireworks factory yard, resolved from the live city at boot
const shots = [
  {
    dur: 7.0,
    tod: () => 0.32,
    view: (t, od) => ({
      x: lerp(300, 284, t),
      z: lerp(248, 232, t),
      yaw: lerp(0.35, 0.95, t),
      pitch: lerp(1.18, 0.95, t),
      dist: lerp(od * 1.05, 205, t),
    }),
  },
  {
    dur: 5.5,
    tod: (t) => lerp(0.42, 0.5, t),
    view: (t) => ({ x: 292, z: 224, yaw: lerp(1.35, 2.05, t), pitch: lerp(0.64, 0.52, t), dist: lerp(60, 40, t) }),
  },
  {
    dur: 6.0,
    tod: () => 0.5,
    view: (t) => ({ x: lerp(466, 431, t), z: lerp(60, 103, t), yaw: lerp(0.2, 1.1, t), pitch: lerp(0.52, 0.42, t), dist: lerp(66, 44, t) }),
  },
  {
    dur: 6.5,
    tod: () => 0.5,
    view: (t) => ({ x: 252, z: lerp(414, 441, t), yaw: lerp(2.55, 3.14, t), pitch: lerp(0.6, 0.48, t), dist: lerp(85, 46, t) }),
  },
  { dur: 7.0, free: true, tod: () => 0.5, enter: ENTER_TRAIN, exit: EXIT_TRAIN },
  // Fireworks act I — dusk falls while the camera crosses the bay toward the yard; a heart goes up, then
  // Temple Fay's butterfly. Low angle like scripts/scenes/fireworks.js so bursts 35-55 units up fill the frame.
  {
    dur: 8.5,
    tod: (t) => lerp(0.75, 0.93, t),
    enter: SPEED(3),
    at: [
      [0.5, launch({ shape: 'heart' })],
      [5.0, launch({ shape: 'butterfly' })],
    ],
    view: (t) => ({
      x: yard.x + 2,
      z: yard.z + 2,
      yaw: lerp(Math.PI * 0.05, Math.PI * 0.3, t),
      pitch: lerp(0.2, 0.1, t),
      dist: lerp(220, 160, t),
    }),
  },
  // Fireworks act II — interlaced rings, then a message in dot letters ends the show. Restore 1x speed.
  {
    dur: 8.0,
    tod: () => 0.93,
    at: [
      [0.5, launch({ shape: 'rings' })],
      [4.4, launch({ text: 'BLOOM ♥' })],
    ],
    exit: SPEED(1),
    view: (t) => ({
      x: yard.x + 2,
      z: yard.z + 2,
      yaw: lerp(Math.PI * 0.38, Math.PI * 0.62, t),
      pitch: lerp(0.12, 0.16, t),
      dist: lerp(150, 138, t),
    }),
  },
  {
    dur: 4.0,
    tod: () => 0.94,
    enter: FLORA_OPEN,
    view: (t) => ({ x: 292, z: 224, yaw: lerp(2.4, 2.6, t), pitch: lerp(0.82, 0.78, t), dist: lerp(120, 95, t) }),
  },
  {
    dur: 6.0,
    tod: () => 0.94,
    at: [
      [0.4, ASK('advisor_tips')],
      [3.2, ASK('incident_status')],
    ],
    view: (t) => ({ x: 264, z: 250, yaw: lerp(2.6, 2.8, t), pitch: lerp(0.85, 0.8, t), dist: lerp(150, 135, t) }),
  },
  {
    dur: 7.0,
    tod: (t) => lerp(0.94, 0.48, t),
    enter: () =>
      `(() => {
        const g = window.bloomgrid;
        g.services.get('assistant').toggle(false);
        g.city.credits = 1e6;
        g.commands.execute('retrofit', { x: 222, z: 284, radius: 14 });
      })()`,
    view: (t) => ({ x: lerp(280, 270, t), z: 244, yaw: lerp(2.8, 3.15, t), pitch: lerp(0.72, 0.56, t), dist: lerp(95, 150, t) }),
  },
  {
    dur: 7.0,
    tod: (t) => lerp(0.48, 0.36, t),
    enter: () => `window.bloomgrid.commands.execute('mist', { x: ${Math.round(hive.x)} + 6, z: ${Math.round(hive.z)} + 4 })`,
    view: (t) => ({ x: hive.x + 2, z: hive.z + 2, yaw: lerp(1.1, 1.9, t), pitch: lerp(0.48, 0.42, t), dist: lerp(34, 26, t) }),
  },
  {
    dur: 4.0,
    tod: (t) => lerp(0.36, 0.44, t),
    view: (t, od) => ({ x: lerp(270, 256, t), z: lerp(250, 256, t), yaw: lerp(3.15, 3.55, t), pitch: lerp(0.56, 1.0, t), dist: lerp(150, od, t) }),
  },
];
const scale = seconds / PLAN_SECONDS;
shots.forEach((s) => {
  s.dur *= scale;
  if (s.at) s.at = s.at.map(([at, code]) => [at * scale, code]);
});
const shotStarts = shots.reduce((acc, s) => [...acc, (acc.at(-1) ?? 0) + s.dur], []);
const enterCode = (s) => (typeof s.enter === 'function' ? s.enter() : s.enter);

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) if (/(jpg|png)$/.test(f)) rmSync(join(framesDir, f));

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

// Title cards: transparent full-frame PNGs (this ffmpeg build has no drawtext).
const card = async (lines, pos = 'center') => {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  const place =
    pos === 'bottom' ? 'justify-content:flex-end;padding-bottom:110px' : 'justify-content:center';
  await p.setContent(
    `<body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;${place};background:transparent;font-family:Helvetica,Arial,sans-serif;text-align:center">
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
const fireworksPng = await card(
  [
    ['SHAPES IN THE SKY', 44, 10, 0],
    ['fireworks you design', 26, 4, 14],
  ],
  'bottom',
);
const floraPng = await card(
  [
    ['MEET FLORA', 44, 12, 0],
    ['the city\u2019s AI steward', 26, 4, 14],
  ],
  'bottom',
);
const endPng = await card([['TEND IT AND IT BLOOMS', 46, 10, 0]]);

await page.goto(base + path, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000)); // boot reveal + founding city
await page.evaluate(() => {
  document.querySelector('.help-ok')?.click();
  window.bloomgrid.city.credits = 1e6;
});
// The showcase city ships without a Fireworks Factory: build one on the Westport waterfront (like the
// fireworks scene) and fill its racks, then read back the yard and flora-hive positions for framing.
await page.evaluate(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const agent = g.services.get('agent');
  const has = c.buildingEntities().some((e) => c.buildingDef(e).id === 'fireworks-factory');
  if (!has) await agent.call('build', { type: 'fireworks-factory', district: 'Westport Works' });
  for (const k of Object.keys(c.fireworks.stock)) c.fireworks.stock[k] = 90;
  c.fireworks.auto = false;
});
({ hive, yard } = await page.evaluate(() => {
  const c = window.bloomgrid.city;
  const find = (id, fb) => {
    const e = c.buildingEntities().find((e) => c.buildingDef(e).id === id);
    return e === undefined ? fb : c.buildingRecord(e);
  };
  const h = find('flora-hive', { x: 282, z: 333 });
  const y = find('fireworks-factory', { x: 54, z: 281 });
  return { hive: { x: h.x, z: h.z }, yard: { x: y.x, z: y.z } };
}));
const od = await page.evaluate(() => window.bloomgrid.cameraCtl.overviewDistance);
console.log(
  `[trailer] overview ${od.toFixed(0)}, hive ${hive.x.toFixed(0)}/${hive.z.toFixed(0)}, fireworks yard ${yard.x.toFixed(0)}/${yard.z.toFixed(0)}, ${Math.round(seconds * fps)} frames at ${W}x${H}`,
);

const total = Math.round(seconds * fps);
let shotIdx = -1;
const fired = new Set();
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const time = f / fps;
  let acc = 0;
  let i = 0;
  while (i < shots.length - 1 && time >= acc + shots[i].dur) (acc += shots[i].dur), i++;
  const shot = shots[i];
  const local = Math.min(1, Math.max(0, (time - acc) / shot.dur));
  if (i !== shotIdx) {
    if (shotIdx >= 0 && shots[shotIdx].exit) await page.evaluate(shots[shotIdx].exit);
    shotIdx = i;
    if (shot.enter) await page.evaluate(enterCode(shot));
    fired.clear();
    console.log(`[trailer] shot ${i + 1} @ ${time.toFixed(1)}s`);
  }
  for (const [at, code] of shot.at ?? []) {
    if (local * shot.dur >= at && !fired.has(at)) (fired.add(at), await page.evaluate(code));
  }
  const tod = shot.tod?.(ease(local));
  if (shot.free) {
    // Explore mode drives the camera (train ride): only pin the clock.
    if (tod !== undefined && tod !== null) await page.evaluate((tod) => (window.bloomgrid.city.timeOfDay = tod), tod);
  } else {
    const v = shot.view(ease(local), od);
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
  }
  await page.screenshot({ path: join(framesDir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (f % 150 === 0) console.log(`[trailer] frame ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}
if (shots[shotIdx].exit) await page.evaluate(shots[shotIdx].exit);
await browser.close();

// Encode: composite cards (overlay + alpha fades), then fade the whole video in/out. Card windows sit over
// their shots (title over the reveal, fireworks over act I, Flora over her console, end over the pullback).
const [fwStart, fwMid] = [shotStarts[5], shotStarts[6]];
const [floraOpenAt, floraCardsAt] = [shotStarts[7], shotStarts[8]];
const cards = [];
if (seconds >= 6) cards.push({ png: titlePng, a: 1.2, b: Math.min(5.8, seconds * 0.1 + 2.8) });
if (seconds >= fwMid) cards.push({ png: fireworksPng, a: fwStart + 1.5 * scale, b: fwMid - 0.8 * scale });
if (seconds >= floraCardsAt + 3)
  cards.push({ png: floraPng, a: floraOpenAt + 0.5 * scale, b: floraCardsAt + 4 * scale });
if (seconds >= 4.4) cards.push({ png: endPng, a: seconds - 3, b: seconds - 0.35 });
const fades = (s, e) =>
  `fade=t=in:st=${s.toFixed(2)}:d=0.8:alpha=1,fade=t=out:st=${Math.max(0, e - 0.8).toFixed(2)}:d=0.8:alpha=1`;
const inputs = ['-framerate', String(fps), '-i', join(framesDir, 'f%04d.jpg')];
const graph = [];
let n = 1;
for (const c of cards) {
  inputs.push('-loop', '1', '-t', String(seconds), '-i', c.png);
  graph.push(`[${n}:v]${fades(c.a, c.b)}[c${n}]`);
  graph.push(`[${n === 1 ? 0 : `o${n - 1}`}][c${n}]overlay[o${n}]`);
  n++;
}
const last = n === 1 ? '0:v' : `o${n - 1}`;
graph.push(`[${last}]fade=t=in:st=0:d=0.7,fade=t=out:st=${Math.max(0, seconds - 0.9).toFixed(2)}:d=0.9,format=yuv420p[v]`);
console.log(`[trailer] encoding ${out}`);
execFileSync('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex', graph.join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
console.log(`[trailer] done: ${out} (${errors} page errors)`);
