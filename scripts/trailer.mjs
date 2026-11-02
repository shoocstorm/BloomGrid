#!/usr/bin/env node
/**
 * Records the ~75s trailer (shots/trailer.mp4) from the running dev server, against the showcase city
 * (`scenario=founding-city`; a plain boot is a fresh island, D-072). Thirteen shots, camera driven per
 * captured frame (lookAt always centers the subject), joined with crossfades so the cuts flow:
 *   1. island aerial reveal (title)      2. downtown orbit, day
 *   3. Windward Isle wind farm           4. Bloomtopia park + suspension bridge
 *   5. city walk up the hero avenue (explore, caption card)
 *   6. Aeroline train ride (explore, caption card)
 *   7. dusk→night fireworks: heart then butterfly (caption card)
 *   8. rings, then "BLOOM ♥" written in the sky (engine at 3x so grand shows span ~3s of video)
 *   9. night, fires ignite, Flora console opens
 *   10. Flora AI: /advisor_tips + /incident_status cards (caption card)
 *   11. Bloom Retrofit wave at dawn      12. Flora-Net hive + drone mist
 *   13. pull back to overview (end card)
 *
 * Each shot's frames are captured into its own segment directory and the encode chains ffmpeg `xfade`
 * dissolves (0.55s) between them, so the whole trailer reads as one continuous move. Caption cards are
 * transparent full-frame PNGs overlaid with alpha fades. Encodes at crf 25 / preset slow so the mp4 is
 * small enough to commit under public/assets/ (GitHub's hard limit is 100 MB; keep it under ~60 MB).
 *
 *   bun run dev                # keep it running
 *   bun run trailer            # or: node scripts/trailer.mjs [--duration 82] [--fps 30]
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
const base = arg('base', 'http://localhost:3000');
const path = showcase(arg('path', '/?quality=high&nodynres'));
const fps = Number(arg('fps', 30));
const PLAN = 82;
const seconds = Number(arg('duration', PLAN));
const framesDir = arg('frames', 'shots/trailer');
const out = arg('out', 'shots/trailer.mp4');
const W = 1920;
const H = 1080;
const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

// Gentler start/stop than smoothstep, so every camera move eases in and out imperceptibly.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
// City walk: park the city camera on the hero avenue south of the spire, then enter walk mode — the
// steward spawns at the nearest road tile and strides away from the camera toward the Wellspring Spire.
const ENTER_WALK = `(() => {
  const g = window.bloomgrid;
  const cam = g.cameraCtl;
  cam.lookAt(292, 238, 14, true);
  cam.yaw = cam.goalYaw = Math.PI;
  cam.pitch = cam.goalPitch = 0.1;
  cam.distance = cam.goalDistance = 14;
  g.services.get('explore').setMode('walk');
  g.input.keys.add('ShiftLeft');
  g.input.keys.add('KeyW');
})()`;
const EXIT_WALK = `(() => {
  const g = window.bloomgrid;
  g.input.keys.delete('ShiftLeft');
  g.input.keys.delete('KeyW');
  g.services.get('explore').setMode('city');
})()`;
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
let hive = { x: 282, z: 333 }; // flora-hive, resolved from the live city at boot
let yard = { x: 54, z: 281 }; // fireworks factory yard, resolved from the live city at boot
const shots = [
  {
    dur: 7.0,
    card: 'title',
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
    view: (t) => ({ x: lerp(293, 289, t), z: lerp(226, 221, t), yaw: lerp(1.35, 2.05, t), pitch: lerp(0.64, 0.52, t), dist: lerp(60, 40, t) }),
  },
  {
    dur: 5.5,
    tod: () => 0.5,
    view: (t) => ({ x: lerp(466, 431, t), z: lerp(60, 103, t), yaw: lerp(0.2, 1.1, t), pitch: lerp(0.52, 0.42, t), dist: lerp(66, 44, t) }),
  },
  {
    dur: 6.0,
    tod: () => 0.5,
    view: (t) => ({ x: 252, z: lerp(414, 441, t), yaw: lerp(2.55, 3.14, t), pitch: lerp(0.6, 0.48, t), dist: lerp(85, 46, t) }),
  },
  // Street level at last: the steward strides up the hero avenue toward the spire (chase camera).
  { dur: 6.5, free: true, card: 'walk', enter: ENTER_WALK, exit: EXIT_WALK, tod: () => 0.55 },
  // The Aeroline carries the camera round the loop (ride cam); dusk starts to fall toward the fireworks.
  { dur: 7.0, free: true, card: 'train', enter: ENTER_TRAIN, exit: EXIT_TRAIN, tod: (t) => lerp(0.5, 0.66, t) },
  // Fireworks act I — dusk falls while the camera crosses the bay toward the yard; a heart goes up, then
  // Temple Fay's butterfly. Low angle like scripts/scenes/fireworks.js so bursts 35-55 units up fill the frame.
  {
    dur: 8.5,
    card: 'fireworks',
    tod: (t) => lerp(0.72, 0.93, t),
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
    card: 'flora',
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
    dur: 6.5,
    tod: (t) => lerp(0.48, 0.36, t),
    enter: () => `window.bloomgrid.commands.execute('mist', { x: ${Math.round(hive.x)} + 6, z: ${Math.round(hive.z)} + 4 })`,
    view: (t) => ({ x: hive.x + 2, z: hive.z + 2, yaw: lerp(1.1, 1.9, t), pitch: lerp(0.48, 0.42, t), dist: lerp(34, 26, t) }),
  },
  {
    dur: 4.5,
    card: 'end',
    tod: (t) => lerp(0.36, 0.44, t),
    view: (t, od) => ({ x: lerp(270, 256, t), z: lerp(250, 258, t), yaw: lerp(3.15, 3.55, t), pitch: lerp(0.56, 1.0, t), dist: lerp(150, od, t) }),
  },
];
const scale = seconds / PLAN;
shots.forEach((s) => {
  s.dur *= scale;
  if (s.at) s.at = s.at.map(([at, code]) => [at * scale, code]);
});
// Crossfade length between shots: full plan 0.55s, shrinking if the trailer is squeezed.
const xfade = Math.max(0.2, 0.55 * Math.min(1, scale));
const enterCode = (s) => (typeof s.enter === 'function' ? s.enter() : s.enter);

// Per-shot frame segments: each shot's frames land in its own dir (renumbered), so the encode can
// dissolve between them. Shot starts in *output* time shift earlier by one dissolve per boundary.
const shotStarts = [];
{
  let acc = 0;
  for (const s of shots) (shotStarts.push(acc), (acc += s.dur - xfade));
}
const total = seconds - (shots.length - 1) * xfade;

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) if (f !== '.gitignore') rmSync(join(framesDir, f), { recursive: true, force: true });

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

// Caption cards: transparent full-frame PNGs (this ffmpeg build has no drawtext). Bottom cards carry a
// soft dark gradient band so the type stays readable over bright scenes.
const card = async (lines, pos = 'center') => {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  const band =
    pos === 'bottom'
      ? 'justify-content:flex-end;padding-bottom:64px;background:linear-gradient(to top,rgba(4,12,10,.62) 0%,rgba(4,12,10,.28) 14%,transparent 30%)'
      : 'justify-content:center;background:radial-gradient(ellipse at center,rgba(4,12,10,.32) 0%,transparent 62%)';
  await p.setContent(
    `<body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;${band};font-family:Helvetica,Arial,sans-serif;text-align:center">
      ${lines
        .map(
          ([text, size, ls, top, color]) =>
            `<div style="margin-top:${top}px;font-size:${size}px;letter-spacing:${ls}px;padding-left:${ls}px;font-weight:700;color:${color ?? '#fff'};text-shadow:0 2px 28px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.5)">${text}</div>`,
        )
        .join('')}
    </body>`,
  );
  const file = join(framesDir, `card-${lines[0][0].toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
  await p.screenshot({ path: file, type: 'png', omitBackground: true });
  await p.close();
  return file;
};
const titlePng = await card([
  ['BLOOMGRID', 112, 30, 0],
  ['A SOLARPUNK ISLAND STEWARD', 30, 10, 34, '#dbffe9'],
]);
const walkPng = await card(
  [
    ['WALK YOUR STREETS', 40, 11, 0],
    ['every district, at street level', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const trainPng = await card(
  [
    ['RIDE THE AEROLINE', 40, 11, 0],
    ['a solar maglev loop round the island', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const fireworksPng = await card(
  [
    ['SHAPES IN THE SKY', 40, 11, 0],
    ['fireworks you design', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const floraPng = await card(
  [
    ['MEET FLORA', 40, 12, 0],
    ['the city\u2019s AI steward', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const endPng = await card([
  ['TEND IT AND IT BLOOMS', 52, 12, 0],
  ['play free at bloomgrid.web.app', 26, 6, 26, '#dbffe9'],
]);
const cardPngs = { title: titlePng, walk: walkPng, train: trainPng, fireworks: fireworksPng, flora: floraPng, end: endPng };

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
  `[trailer] overview ${od.toFixed(0)}, hive ${hive.x.toFixed(0)}/${hive.z.toFixed(0)}, fireworks yard ${yard.x.toFixed(0)}/${yard.z.toFixed(0)}, ${Math.round(seconds * fps)} frames at ${W}x${H}, ${total.toFixed(1)}s after dissolves`,
);

const totalFrames = Math.round(seconds * fps);
let shotIdx = -1;
let segFrame = 0; // frames written into the current shot's segment
const fired = new Set();
const segDir = (i) => join(framesDir, `seg${String(i).padStart(2, '0')}`);
const t0 = Date.now();
for (let f = 0; f < totalFrames; f++) {
  const time = f / fps;
  let acc = 0;
  let i = 0;
  while (i < shots.length - 1 && time >= acc + shots[i].dur) (acc += shots[i].dur), i++;
  const shot = shots[i];
  const local = Math.min(1, Math.max(0, (time - acc) / shot.dur));
  if (i !== shotIdx) {
    if (shotIdx >= 0 && shots[shotIdx].exit) await page.evaluate(shots[shotIdx].exit);
    shotIdx = i;
    segFrame = 0;
    mkdirSync(segDir(i), { recursive: true });
    if (shot.enter) await page.evaluate(enterCode(shot));
    fired.clear();
    console.log(`[trailer] shot ${i + 1} @ ${time.toFixed(1)}s`);
  }
  for (const [at, code] of shot.at ?? []) {
    if (local * shot.dur >= at && !fired.has(at)) (fired.add(at), await page.evaluate(code));
  }
  const tod = shot.tod?.(ease(local));
  if (shot.free) {
    // Explore modes drive the camera (walk, train ride): only pin the clock.
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
  await page.screenshot({ path: join(segDir(i), `f${String(segFrame++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94 });
  if (f % 150 === 0) console.log(`[trailer] frame ${f}/${totalFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}
if (shots[shotIdx].exit) await page.evaluate(shots[shotIdx].exit);
await browser.close();

// Encode: dissolve the shot segments into one another (chained xfade), then composite the caption cards
// (overlay + alpha fades) and fade the whole video in/out. Card windows sit over their shots in output
// time, where each shot starts one dissolve earlier than the last.
const segFrames = shots.map((_, i) => readdirSync(segDir(i)).length);
const segDur = segFrames.map((n) => n / fps);
const inputs = ['-framerate', String(fps), '-i', join(segDir(0), 'f%04d.jpg')];
const graph = [];
let prev = '[0:v]';
{
  let len = segDur[0];
  shots.slice(1).forEach((_, k) => {
    const idx = k + 1;
    inputs.push('-framerate', String(fps), '-i', join(segDir(idx), 'f%04d.jpg'));
    const off = Math.max(0, len - xfade);
    const label = `[x${idx}]`;
    graph.push(`${prev}[${idx}:v]xfade=transition=fade:duration=${xfade.toFixed(2)}:offset=${off.toFixed(2)}${label}`);
    prev = label;
    len = off + segDur[idx];
  });
}
const cards = [];
const cardWin = (i, a, b) => {
  const s = shotStarts[i];
  return [s + a * scale, s + Math.min(b * scale, shots[i].dur - xfade - 0.3)];
};
if (seconds >= 6) cards.push({ png: titlePng, a: 1.0, b: Math.min(5.8, seconds * 0.1 + 2.8) });
{
  const [a, b] = cardWin(4, 1.0, 5.2);
  if (b - a >= 1.2) cards.push({ png: walkPng, a, b });
}
{
  const [a, b] = cardWin(5, 1.2, 5.4);
  if (b - a >= 1.2) cards.push({ png: trainPng, a, b });
}
{
  const [a, b] = cardWin(6, 1.5, 6.5);
  if (b - a >= 1.2) cards.push({ png: fireworksPng, a, b });
}
{
  const [a, b] = cardWin(9, 0.6, 4.5);
  if (b - a >= 1.2) cards.push({ png: floraPng, a, b });
}
cards.push({ png: endPng, a: total - 3.2, b: total - 0.35 });
const fades = (s, e) =>
  `fade=t=in:st=${s.toFixed(2)}:d=0.7:alpha=1,fade=t=out:st=${Math.max(0, e - 0.7).toFixed(2)}:d=0.7:alpha=1`;
let n = shots.length;
for (const c of cards) {
  inputs.push('-loop', '1', '-t', String(total), '-i', c.png);
  graph.push(`[${n}:v]${fades(c.a, c.b)}[c${n}]`);
  graph.push(`[${n === shots.length ? prev.slice(1, -1) : `o${n - 1}`}][c${n}]overlay[o${n}]`);
  n++;
}
const last = n === shots.length ? prev.slice(1, -1) : `o${n - 1}`;
graph.push(`[${last}]fade=t=in:st=0:d=0.7,fade=t=out:st=${Math.max(0, total - 0.9).toFixed(2)}:d=0.9,format=yuv420p[v]`);
console.log(`[trailer] encoding ${out} (${shots.length} segments, ${cards.length} cards, ${xfade.toFixed(2)}s dissolves)`);
execFileSync('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex', graph.join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
console.log(`[trailer] done: ${out} (${errors} page errors)`);
