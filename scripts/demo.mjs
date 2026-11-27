#!/usr/bin/env node
/**
 * Records the ~110 s demo (shots/demo.mp4) from the running dev server, against the showcase city
 * (`scenario=founding-city`; a plain boot is the welcome screen, D-148). Twenty shots in four acts on a
 * day-and-a-night arc, camera driven per captured frame (lookAt always centers the subject):
 *
 *   I · The island (morning to golden hour)
 *     1. sunrise reveal: tight on the Aurora Gemini, exponential pull to the whole island (title)
 *     2. downtown skyline dive          3. Bloomtopia park + bridge, golden hour
 *     4. a whale breaching off the south shore (caption: a living sea)
 *     5. Sky Guard jet on afterburners, chase pass with a victory roll
 *     6. drone flight up the hero avenue (caption) ⟶ circle wipe out of the propeller ⟶
 *     7. Aeroline train ride into dusk (caption)
 *   II · The night
 *     8. the Aurora Gemini light show (caption)
 *     9. fireworks act I: heart, butterfly (caption)   10. act II: rings, then "BLOOM ♥" in the sky
 *     11. the Lotus Atoll glowing on dark water          12. the Tidesong cruise ferry and her deck show
 *   III · The steward
 *     13. fires break out, Flora's console opens, a live question is sent
 *     14. Flora answers: real Qwen3 1.7B tool calls and text streaming in (caption)
 *     15. "If Nothing Changes": Flora's forward run of the burning city, filmed (D-222)
 *     16. the postcard from the future over the night city (caption)
 *   IV · Dawn
 *     17. Bloom Retrofit wave through the night into sunrise
 *     18. the Archipelago chart: neighbours, agreements, envoys (caption, plan v8)
 *     19. Flora-Net hive + drone mist     20. pull back to the whole island (end card)
 *
 * Pacing: quick dissolves (0.35 s) through the daytime run, longer breaths (0.6–0.8 s) into the night and dawn,
 * a circle wipe out of the drone's propeller into the train ride, and the reveal/end pair mirror each other.
 * City Pulse stays folded (the demo frames the city, not the console). Flora's model core (Qwen3 1.7B,
 * wllama/WebGPU) loads at boot (the first run downloads it once into a persistent Chrome profile; `--no-ai`
 * skips) and shot 13 asks it a real question about the fires.
 *
 * Time discipline: a frame takes far longer than 1/fps to capture, so the engine is stopped and every frame is
 * advanced by hand (`window.__bgFrame`): input, one sim tick, sync and render at an exact dt of 1/fps, `U.clock`
 * pinned to video time (plus an offset that only moves at cuts: it lands a whale breach inside its shot). Three more clocks are put on video time so nothing runs on the wall clock:
 *   - the reels' clock (`moments.clock.virtual`, D-185): the 3D films wait on it, so they play at film pace;
 *   - every CSS animation and transition (`document.getAnimations()`: rate ≈ 0, `currentTime` stepped per
 *     frame), so captions, the films' letterbox, panels and cards ease in as they do in play, not pop;
 *   - film shots may run `rate`× (the film's stage, its waits) to fit a long film into a few seconds.
 * Films start off camera (`preroll`: uncaptured frames until the reel is playing) and are skipped at the cut.
 * The sim tick is pinned into the bloom season (61203 = 3603 + two seasonal cycles: no weather, no pulses).
 *
 * Each shot's frames are captured into its own segment directory and the encode chains ffmpeg `xfade` dissolves
 * between them. Caption cards are transparent full-frame PNGs overlaid with alpha fades. The page is laid out at
 * 1920 CSS px (`--css-width`) and drawn at 2 device pixels each (quality ultra, so the renderer fills the capture),
 * which keeps the HUD at its played size in a 4K 60 fps output (`--width/--height/--fps`); `--crf` (default 20) sets
 * the size trade-off (crf 25 + `--width 1920 --height 1080` fits a committed public/assets/ copy under GitHub's
 * ~100 MB limit). Intermediate frames are removed after the encode
 * (`--keep-frames` keeps them).
 *
 *   bun run dev                # keep it running
 *   bun run demo               # or: node scripts/demo.mjs [--duration 120] [--fps 30] [--no-ai] [--keep-frames]
 *   node scripts/demo.mjs --only 2,9 --width 1280 --height 720 --dpr 1 --fps 30 --no-ai
 *                              # quick look: renders only those shots (1-based) to shots/demo-shot-NN.mp4
 */
import { launchChrome } from './lib/chrome.mjs';
import { mkdirSync, existsSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d;
};
/** Scripts record the showcase city unless a path names a scenario (a plain boot is the welcome screen, D-148). */
const showcase = (p) =>
  /[?&]scenario=/.test(p) ? p : `${p}${p.includes('?') ? '&' : '?'}scenario=founding-city`;
const base = arg('base', 'http://localhost:3000');
// ultra + 2x device scale: the renderer runs at exactly the 2× capture size (ultra's maxPixelRatio 2; high would
// cap it at 1.25 and Chrome would upscale a soft frame). ffmpeg then lanczos-downscales to the output frame.
const path = showcase(arg('path', '/?quality=ultra&nodynres'));
const fps = Number(arg('fps', 60));
const framesDir = arg('frames', 'shots/demo');
const out = arg('out', 'shots/demo.mp4');
/** Flora's live model core in the video (skipped with --no-ai). Downloads once into the profile. */
const withAi = !process.argv.includes('--no-ai');
const keepFrames = process.argv.includes('--keep-frames');
/** Quick look: only these shots (1-based) are captured, each to its own clip; the others still run their setup. */
const only = arg('only', '')
  .split(',')
  .filter(Boolean)
  .map((n) => Number(n) - 1);
const AI_MODEL = 'qwen3-1.7b';
const profile = join(tmpdir(), 'bloomgrid-demo-profile');
mkdirSync(profile, { recursive: true });
const W = Number(arg('width', 3840));
const H = Number(arg('height', 2160));
/**
 * The page is laid out at a desktop size (1920 CSS px wide by default, `--css-width`) and drawn at `ui` device pixels
 * per CSS pixel, so the HUD, Flora's console, the postcard and the chart read at the size a player sees them; laid
 * out at 3840 CSS px they were a quarter of the frame's area and unreadable. `--dpr` supersamples on top (renderer
 * permitting: ultra caps its pixel ratio at 2, so `ui` × `dpr` above 2 only upscales).
 */
const cssW = Number(arg('css-width', Math.min(1920, W)));
const ui = W / cssW;
const dpr = Number(arg('dpr', 1));
const crf = arg('crf', '20');
const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

/** The sim tick every shot pins (bloom season, two cycles of 28800 in: no weather, no pulses). */
const TICK = 3603 + 2 * 28800;

// Gentler start/stop than smoothstep, so every camera move eases in and out imperceptibly.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Fast settle: for reveals that must grab in the first second and then breathe.
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
// Constant-rate zoom (log-interpolated distance): a 30→570 pull reads as one continuous dolly.
const zoom = (a, b, t) => a * Math.pow(b / a, t);

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
const SWEEP_TOASTS = `document.querySelectorAll('.toasts .toast').forEach((t) => t.remove())`;
const ENTER_TRAIN = `window.bloomgrid.services.get('explore').setMode('train')`;
const EXIT_TRAIN = `window.bloomgrid.services.get('explore').setMode('city')`;
// Drone flight: enter drone mode on the hero avenue south of the centre and fly it WEST along the street itself
// (found live from `grid.road`: roads are building-free, so the drone never freezes against a tower). It climbs to
// ~+8, then holds full speed to the last frame; the chase cam keeps it dead centre, so the circle wipe into the
// Aeroline ride opens out of its propeller disc. Keys: W + Shift (fast) + E (climb), E drops at 1.6 s.
const ENTER_DRONE = () => `(() => {
  const g = window.bloomgrid;
  const grid = g.city.grid;
  let streetZ = -1;
  for (let z = ${238 - 12}; z <= ${238 + 12} && streetZ < 0; z++) {
    let ok = true;
    for (let x = ${Math.round(spire.x - 22)}; x <= 292 && ok; x++) ok = !!grid.road[grid.index(x, z)];
    if (ok) streetZ = z;
  }
  const dx = ${spire.x.toFixed(1)} - 292;
  const dz = ${spire.z.toFixed(1)} - 238;
  const len = Math.hypot(dx, dz) || 1;
  const sz = streetZ >= 0 ? streetZ : 238;
  const ax = streetZ >= 0 ? 234 : 292 + dx + 16 * (dx / len) + 13 * (dz / len);
  const az = streetZ >= 0 ? streetZ : 238 + dz + 16 * (dz / len) - 13 * (dx / len);
  const cam = g.cameraCtl;
  cam.lookAt(292, sz, 16, true);
  cam.yaw = cam.goalYaw = Math.atan2(-(ax - 292), -(az - sz)) - Math.PI;
  cam.pitch = cam.goalPitch = 0.12;
  cam.distance = cam.goalDistance = 16;
  g.services.get('explore').setMode('drone');
  g.input.keys.add('ShiftLeft');
  g.input.keys.add('KeyW');
  g.input.keys.add('KeyE');
})()`;
const EXIT_DRONE = `(() => {
  const g = window.bloomgrid;
  for (const k of ['ShiftLeft', 'KeyW', 'KeyE']) g.input.keys.delete(k);
  g.services.get('explore').setMode('city');
})()`;
// Fireworks (D-068): shows fire per pulse (tick % 10 === 0), so the acts pace `city.tick` directly. Only one show
// can be in the sky at a time, so an act's second launch waits (inside the evaluate, which the capture awaits)
// until the first has ended; the wait advances the sim only (`engine.stepTicks`), never the cameras or U.clock.
const launch = (extra) =>
  `window.bloomgrid.commands.execute('launchFireworks', ${JSON.stringify({ grand: true, ...extra })})`;
const launchWhenClear = (extra, budget = 400) => `(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  let budget = ${budget};
  while (c.fireworks.show && budget-- > 0) g.engine.stepTicks(3);
  g.commands.execute('launchFireworks', ${JSON.stringify({ grand: true, ...extra })});
})()`;
// A show still in the sky at the cut would freeze there (the next act resets the tick below its startTick): end it.
const CLEAR_SKY = `(() => {
  const s = window.bloomgrid.city.fireworks.show;
  if (s) s.fired = s.shells;
})()`;
const FLORA_OPEN = `(async () => {
  const g = window.bloomgrid;
  g.services.get('assistant').toggle(true);
  const c = g.city;
  // Three fires: Flora's console picks them up as notices (no model needed), and the look ahead films them.
  const { ignite } = await import('/src/sim/hazards.ts');
  const near = ${near};
  [[292, 222], [150, 270], [360, 250]].forEach(([x, z]) => ignite(c, near(x, z), 'lightning', 0.8));
})()`;
// The live Flora demo: a real question to the loaded model, sent without awaiting so the capture keeps rolling
// while the console streams tool chips and the answer.
const ASK_FLORA = (q) => `void window.bloomgrid.services.get('assistant').ask(${JSON.stringify(q)})`;
// Films (D-185): started at a shot's enter, run off camera (uncaptured frames) until the reel is playing, then
// filmed; at the cut the reel is skipped and frames run until it has gone and the city is whole again.
const PREROLL = (sel, extra = 60) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let i = 0;
  for (; i < 4000 && !document.querySelector(${JSON.stringify(sel)}); i++) {
    await window.__bgFrame(1 / 60);
    await sleep(4);
  }
  for (let k = 0; k < ${extra}; k++) await window.__bgFrame(1 / 60);
  return i;
})()`;
const SKIP_FILM = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.reel-skip')?.click();
  for (let i = 0; i < 600 && document.querySelector('.reel'); i++) {
    await window.__bgFrame(1 / 60);
    await sleep(4);
  }
  for (let k = 0; k < 20; k++) await window.__bgFrame(1 / 60);
})()`;
// Lands a whale breach `lead` seconds into the shot: scans the pod's cycle (the shader's, mirrored on the CPU by
// `whalesNow`) for the next breach while the pod lingers off the south shore (pods roam the island, D-231:
// `podAt` in whaleRoute.ts) and moves the clock offset so it starts on cue.
const CUE_BREACH = (time, lead = 1.0) => `(async () => {
  const find = (part) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(part));
  const { whalesNow } = await import(find('/src/modules/scenery/SeaLife.ts') ?? '/src/modules/scenery/SeaLife.ts');
  const { podAt } = await import(find('/src/modules/scenery/whaleRoute.ts') ?? '/src/modules/scenery/whaleRoute.ts');
  const S = window.bloomgrid.city.size;
  const home = (c) => {
    const p = podAt(0, c, S);
    return p.travel === 0 && Math.hypot(p.x - ${WHALES.x}, p.z - ${WHALES.z}) < 1;
  };
  const now = ${time} + window.__bgOff;
  for (let c = now + ${lead}; c < now + 9000; c += 0.05)
    if (whalesNow(0, c) === 'Breaching!' && whalesNow(0, c - 0.05) !== 'Breaching!' && home(c) && home(c + 6)) {
      window.__bgOff += c - (now + ${lead});
      return c;
    }
  return null;
})()`;
// Founding-city landmarks (tiles), resolved from the live city at boot.
let hive = { x: 282, z: 333 };
let yard = { x: 54, z: 281 };
let spire = { x: 256, z: 256 }; // the Aurora Gemini's lot centre (D-135)
/** Pod 1's home ground (`GROUNDS[5]` in whaleRoute.ts), where the breach shot waits for it. */
const WHALES = { x: 0.3 * 512, z: 0.95 * 512 };
/**
 * Shots. `view(t, od)` poses an orbit (`aim` lifts the orbit point); `track` follows something live; `free` hands
 * the camera to an explore mode; `film` records a reel (`preroll` selector, `rate`). `tod(t)` sets the sun,
 * `enter(time)` / `exit` / `at: [[s, code]]` run in the page, `card` names a caption, `keep` runs the shot's
 * enter and exit even when `--only` skips it (state later shots need).
 */
const shots = [
  // ── I · The island ──
  {
    dur: 6.4,
    card: 'title',
    easeOut: true,
    tod: (t) => lerp(0.33, 0.4, t),
    view: (t, od) => ({
      x: lerp(spire.x, 270, t),
      z: lerp(spire.z, 250, t),
      yaw: lerp(0.55, 1.05, t),
      pitch: lerp(0.17, 1.02, t),
      dist: zoom(34, od * 1.02, t),
    }),
  },
  {
    dur: 4.4,
    tod: (t) => lerp(0.44, 0.5, t),
    view: (t) => ({
      x: 292,
      z: 222,
      yaw: lerp(1.15, 2.0, t),
      pitch: lerp(0.6, 0.44, t),
      dist: lerp(56, 37, t),
    }),
  },
  {
    dur: 4.6,
    tod: (t) => lerp(0.58, 0.63, t),
    view: (t) => ({
      x: 252,
      z: lerp(416, 441, t),
      yaw: lerp(2.6, 3.14, t),
      pitch: lerp(0.56, 0.46, t),
      dist: lerp(82, 46, t),
    }),
  },
  // A living sea: a whale breaching off the south shore in the late sun, the island behind it.
  {
    dur: 5.0,
    card: 'sea',
    enter: (time) => CUE_BREACH(time, 1.0),
    tod: (t) => lerp(0.64, 0.66, t),
    view: (t) => ({
      x: WHALES.x,
      z: WHALES.z,
      aim: 3,
      yaw: lerp(-0.4, -0.1, t),
      pitch: lerp(0.2, 0.13, t),
      dist: lerp(78, 58, t),
    }),
  },
  // The Sky Guard on afterburners: a banked chase pass, a victory roll two seconds in (both key off U.clock).
  {
    dur: 4.8,
    track: 'jet',
    tod: () => 0.68,
    enter: () => `(() => {
       window.bloomgrid.services.get('skyguard').afterburner();
       delete window.__jp;
       delete window.__jy;
       ${SWEEP_TOASTS};
     })()`,
    at: [[2.0, `(() => { window.bloomgrid.services.get('skyguard').roll(); ${SWEEP_TOASTS}; })()`]],
  },
  {
    dur: 6.3,
    free: true,
    card: 'drone',
    enter: ENTER_DRONE,
    exit: EXIT_DRONE,
    tod: () => 0.7,
    at: [[1.6, `window.bloomgrid.input.keys.delete('KeyE')`]],
  },
  {
    dur: 7.0,
    free: true,
    card: 'train',
    enter: () => ENTER_TRAIN,
    exit: EXIT_TRAIN,
    tod: (t) => lerp(0.74, 0.86, t),
  },
  // ── II · The night ──
  // The Aurora Gemini's light show: searchlights fan through the spectrum, an aurora over the Sun Gate. It runs
  // 42 s, so it is still dancing behind the fireworks.
  {
    dur: 6.8,
    card: 'aurora',
    enter: () => `(() => {
      const c = window.bloomgrid.city;
      const e = c.buildingEntities().find((e) => c.buildingDef(e).id === 'aurora-gemini');
      window.bloomgrid.services.get('aurora').show(e);
      ${SWEEP_TOASTS};
    })()`,
    tod: (t) => lerp(0.885, 0.91, t),
    view: (t) => ({
      x: spire.x,
      z: spire.z,
      aim: lerp(26, 34, t),
      yaw: lerp(2.1, 2.75, t),
      pitch: lerp(0.08, 0.2, t),
      dist: lerp(175, 140, t),
    }),
  },
  {
    dur: 8.2,
    card: 'fireworks',
    showPace: true,
    exit: CLEAR_SKY,
    tod: (t) => lerp(0.91, 0.95, t),
    at: [
      [0.4, launch({ shape: 'heart' })],
      [3.6, launchWhenClear({ shape: 'butterfly' })],
    ],
    view: (t) => ({
      x: yard.x + 2,
      z: yard.z + 2,
      yaw: lerp(Math.PI * 0.05, Math.PI * 0.3, t),
      pitch: lerp(0.2, 0.1, t),
      dist: lerp(220, 160, t),
    }),
  },
  {
    dur: 7.6,
    showPace: true,
    exit: CLEAR_SKY,
    tod: () => 0.94,
    at: [
      [0.4, launch({ shape: 'rings' })],
      [3.5, launchWhenClear({ text: 'BLOOM ♥' })],
    ],
    view: (t) => ({
      x: yard.x + 2,
      z: yard.z + 2,
      yaw: lerp(Math.PI * 0.38, Math.PI * 0.62, t),
      pitch: lerp(0.12, 0.16, t),
      dist: lerp(150, 138, t),
    }),
  },
  {
    dur: 4.4,
    tod: () => 0.95,
    view: (t) => ({
      x: 230,
      z: 31,
      yaw: lerp(Math.PI - 0.22, Math.PI + 0.16, t),
      pitch: lerp(0.16, 0.11, t),
      dist: lerp(36, 24, t),
    }),
  },
  {
    dur: 5.0,
    track: 'ferry',
    tod: () => 0.95,
    enter: () => `(() => {
       const f = window.bloomgrid.services.get('ferry');
       if (f.active) { f.departNow(); f.advance(10); f.deckShow(); }
       ${SWEEP_TOASTS};
     })()`,
  },
  // ── III · The steward ──
  {
    dur: 4.6,
    tod: () => 0.94,
    keep: true,
    enter: () => FLORA_OPEN,
    at: [[2.6, ASK_FLORA('Fires just broke out — what is happening, and what should I do first?')]],
    view: (t) => ({
      x: 292,
      z: 224,
      yaw: lerp(2.4, 2.6, t),
      pitch: lerp(0.82, 0.78, t),
      dist: lerp(120, 95, t),
    }),
  },
  {
    dur: 6.8,
    card: 'flora',
    tod: () => 0.94,
    view: (t) => ({
      x: 264,
      z: 250,
      yaw: lerp(2.6, 2.8, t),
      pitch: lerp(0.85, 0.8, t),
      dist: lerp(150, 135, t),
    }),
  },
  // If Nothing Changes: Flora runs the burning city ten days on in a worker, then films where it lands (2.6×).
  {
    dur: 8.0,
    film: true,
    rate: 2.6,
    enter: () => `(async () => {
      const g = window.bloomgrid;
      g.services.get('assistant').toggle(false);
      g.city.credits = 64000;
      ${SWEEP_TOASTS};
      await g.services.get('future').project(10);
      void g.services.get('future').show(10);
    })()`,
    preroll: PREROLL('.reel.fz.s-play', 30),
    exit: SKIP_FILM,
    report: `[document.querySelector('.fz-dnum')?.textContent, document.querySelector('.reel-cap')?.textContent].join(' · ')`,
  },
  // The postcard it leaves: residents, harmony, credits then and now, and the levers to change it.
  {
    dur: 5.2,
    card: 'future',
    tod: () => 0.96,
    preroll: PREROLL('.fpc:not(.hidden)', 20),
    exit: `document.querySelector('.fpc .pop-x')?.click()`,
    view: (t) => ({
      x: lerp(250, 262, t),
      z: 256,
      yaw: lerp(2.9, 3.05, t),
      pitch: lerp(0.95, 0.9, t),
      dist: lerp(210, 190, t),
    }),
  },
  // ── IV · Dawn ──
  // The steward answers: a Bloom Retrofit wave rolls through the old quarter as the night turns to sunrise.
  {
    dur: 5.8,
    tod: (t) => lerp(0.97, 1.36, t) % 1,
    enter: () => `(() => {
        const g = window.bloomgrid;
        g.city.steward.fires.length = 0;
        document.querySelector('.hz-panel')?.classList.add('hidden');
        g.city.credits = 1e6;
        g.commands.execute('retrofit', { x: 222, z: 284, radius: 14 });
        ${SWEEP_TOASTS};
      })()`,
    view: (t) => ({
      x: lerp(280, 270, t),
      z: 244,
      yaw: lerp(2.8, 3.15, t),
      pitch: lerp(0.72, 0.56, t),
      dist: lerp(95, 150, t),
    }),
  },
  // The Archipelago: the chart of the neighbours over the horizon, their fortunes and the agreements under way.
  {
    dur: 5.4,
    card: 'trade',
    tod: () => 0.42,
    enter: () =>
      `(() => { window.bloomgrid.services.get('archipelago').toggle(true, 'drift'); ${SWEEP_TOASTS}; })()`,
    exit: `window.bloomgrid.services.get('archipelago').toggle(false)`,
    view: (t) => ({
      x: 300,
      z: 300,
      yaw: lerp(-2.2, -2.05, t),
      pitch: lerp(0.3, 0.28, t),
      dist: lerp(300, 280, t),
    }),
  },
  {
    dur: 5.0,
    tod: (t) => lerp(0.44, 0.47, t),
    enter: () =>
      `window.bloomgrid.commands.execute('mist', { x: ${Math.round(hive.x)} + 6, z: ${Math.round(hive.z)} + 4 })`,
    view: (t) => ({
      x: hive.x + 2,
      z: hive.z + 2,
      yaw: lerp(1.1, 1.9, t),
      pitch: lerp(0.48, 0.42, t),
      dist: lerp(34, 26, t),
    }),
  },
  // Bookend of the reveal: pull out to the whole island, easing into the end card; the toasts leave with it.
  {
    dur: 7.4,
    card: 'end',
    easeOut: true,
    enter: () => `(() => {
       ${SWEEP_TOASTS};
       document.querySelector('.hz-panel')?.classList.add('hidden');
     })()`,
    tod: (t) => lerp(0.47, 0.53, t),
    view: (t, od) => ({
      x: lerp(270, 256, t),
      z: lerp(250, 258, t),
      yaw: lerp(3.15, 3.55, t),
      pitch: lerp(0.56, 1.0, t),
      dist: zoom(150, od, t),
    }),
  },
];
// Dissolve per boundary: quick through the daytime run, longer into the film, the night and the dawn; the
// drone→Aeroline cut is a circle wipe out of the propeller disc.
const XF = [
  0.6, 0.35, 0.35, 0.35, 0.45, 0.7, 0.7, 0.45, 0.45, 0.6, 0.35, 0.6, 0.35, 0.6, 0.6, 0.8, 0.5, 0.5, 1.1,
];
const XT = XF.map(() => 'fade');
XT[5] = 'circleopen';
if (XF.length !== shots.length - 1)
  throw new Error(`XF has ${XF.length} dissolves for ${shots.length - 1} shot boundaries`);
const PLAN = shots.reduce((a, s) => a + s.dur, 0);
const seconds = Number(arg('duration', PLAN));
const scale = seconds / PLAN;
shots.forEach((s) => {
  s.dur *= scale;
  if (s.at) s.at = s.at.map(([at, code]) => [at * scale, code]);
});
const xfs = XF.map((d) => Math.max(0.2, d * Math.min(1, scale)));
const shotStarts = [];
{
  let acc = 0;
  shots.forEach((s, i) => {
    shotStarts.push(acc);
    acc += s.dur - (xfs[i] ?? 0);
  });
}
const total = seconds - xfs.reduce((a, b) => a + b, 0);

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir))
  if (f !== '.gitignore') rmSync(join(framesDir, f), { recursive: true, force: true });

const browser = await launchChrome({
  executablePath: chrome,
  maxSeconds: 0,
  headless: 'new',
  userDataDir: profile,
  protocolTimeout: 30 * 60_000,
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${Math.round(W / ui)},${Math.round(H / ui)}`],
});
const page = await browser.newPage();
await page.setViewport({ width: Math.round(W / ui), height: Math.round(H / ui), deviceScaleFactor: ui * dpr });
let errors = 0;
page.on(
  'console',
  (m) =>
    ['warn', 'error'].includes(m.type()) &&
    !/AttributeNode: Vertex attribute/.test(m.text()) &&
    console.log(`[${m.type()}] ${m.text()}`),
);
page.on('pageerror', (e) => (errors++, console.log(`[pageerror] ${e.message}`)));
browser.on('disconnected', () => console.log('[demo] browser disconnected'));

// Caption cards: transparent full-frame PNGs (this ffmpeg build has no drawtext). Bottom cards carry a soft dark
// band so the type stays readable over bright scenes. Sizes are for 4K and scale with the output height.
const k = H / 2160;
const card = async (lines, pos = 'center') => {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  const band =
    pos === 'bottom'
      ? `justify-content:flex-end;padding-bottom:${Math.round(150 * k)}px;background:linear-gradient(to top,rgba(4,12,10,.62) 0%,rgba(4,12,10,.28) 14%,transparent 30%)`
      : 'justify-content:center;background:radial-gradient(ellipse at center,rgba(4,12,10,.32) 0%,transparent 62%)';
  await p.setContent(
    `<body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;${band};font-family:Helvetica,Arial,sans-serif;text-align:center">
      ${lines
        .map(
          ([text, size, ls, top, color]) =>
            `<div style="margin-top:${Math.round(top * k)}px;font-size:${Math.round(size * k)}px;letter-spacing:${Math.round(ls * k)}px;padding-left:${Math.round(ls * k)}px;font-weight:700;color:${color ?? '#fff'};text-shadow:0 2px 28px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.5)">${text}</div>`,
        )
        .join('')}
    </body>`,
  );
  const file = join(framesDir, `card-${lines[0][0].toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
  await p.screenshot({ path: file, type: 'png', omitBackground: true });
  await p.close();
  return file;
};
const sub = (title, line) =>
  card(
    [
      [title, 92, 24, 0],
      [line, 52, 8, 30, '#dbffe9'],
    ],
    'bottom',
  );
/** Caption PNG per card name, and when it shows (shot-local seconds, before the duration scale). */
const CARDS = {
  title: {
    png: await card([
      ['BLOOMGRID', 250, 66, 0],
      ['A SOLARPUNK ISLAND CITY BUILDER', 66, 22, 76, '#dbffe9'],
    ]),
  },
  sea: { png: await sub('A LIVING SEA', 'whales, dolphins and wonders beyond the shore'), a: 0.8, b: 4.4 },
  drone: { png: await sub('FLY YOUR CITY', 'a drone’s-eye view of every district'), a: 1.0, b: 5.2 },
  train: { png: await sub('RIDE THE AEROLINE', 'a solar maglev loop round the island'), a: 1.2, b: 5.4 },
  aurora: {
    png: await sub('LIGHT UP THE SKYLINE', 'the Aurora Gemini twin towers put on a show'),
    a: 1.0,
    b: 5.8,
  },
  fireworks: { png: await sub('SHAPES IN THE SKY', 'fireworks you design'), a: 1.5, b: 6.5 },
  flora: { png: await sub('MEET FLORA', 'a local AI steward’s assistant, by your side'), a: 0.8, b: 5.9 },
  future: {
    png: await sub(
      'POSTCARDS FROM THE FUTURE',
      'see where your city is heading, while you can still change it',
    ),
    a: 0.6,
    b: 4.6,
  },
  trade: {
    png: await sub('THE ARCHIPELAGO', 'trade and friendship with the islands over the horizon'),
    a: 0.7,
    b: 5.0,
  },
  end: {
    png: await card([
      ['TEND IT AND IT BLOOMS', 120, 28, 0],
      ['play free at bloomgrid.web.app', 60, 14, 60, '#dbffe9'],
    ]),
  },
};

await page.goto(base + path, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine && document.body.classList.contains('booted'), {
  timeout: 120000,
});
await new Promise((r) => setTimeout(r, 8000)); // boot reveal + founding city
await page.evaluate(async () => {
  document.querySelector('.help-ok')?.click();
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = 1e6;
  // No random crises, stories, envoys or ceremonies: the demo is a movie set.
  c.steward.autoCrises = false;
  c.steward.autoDirector = false;
  if (c.stories) c.stories.auto = false;
  if (c.happenings) c.happenings.auto = false;
  if (c.archipelago) c.archipelago.auto = false;
  g.services.get('moments').mode = 'off';
  g.services.get('pulse').fold(true);
  // The films' Skip button is for players, not viewers; the cat's chatter and the time-lapse's invitation would sit over the subject.
  const st = document.createElement('style');
  st.textContent = '.reel-skip, .ch-talk, .tli { visibility: hidden !important; }';
  document.head.append(st);
  // The showcase ships without a Fireworks Factory: build one on the Westport waterfront and fill its racks.
  const agent = g.services.get('agent');
  if (!c.buildingEntities().some((e) => c.buildingDef(e).id === 'fireworks-factory'))
    await agent.call('build', { type: 'fireworks-factory', district: 'Westport Works' });
  for (const k of Object.keys(c.fireworks.stock)) c.fireworks.stock[k] = 90;
  c.fireworks.auto = false;
  // The Archipelago: every neighbour met, three agreements under way (their cargo boats sail).
  for (let i = 0; i < 50 && !c.archipelago.neighbours.every((n) => n.met); i++)
    await new Promise((r) => setTimeout(r, 200));
  for (const n of c.archipelago.neighbours) n.met = true;
  g.commands.execute('signTrade', { partner: 'drift', good: 'energy', dir: 'export', size: 1 });
  g.commands.execute('signTrade', { partner: 'kestrel', good: 'water', dir: 'import', size: 2 });
  g.commands.execute('signTrade', { partner: 'concord', good: 'food', dir: 'export', size: 0 });
});
({ hive, yard, spire } = await page.evaluate(() => {
  const c = window.bloomgrid.city;
  const find = (id, fb) => {
    const e = c.buildingEntities().find((e) => c.buildingDef(e).id === id);
    return e === undefined ? fb : c.buildingRecord(e);
  };
  const h = find('flora-hive', { x: 282, z: 333 });
  const y = find('fireworks-factory', { x: 54, z: 281 });
  const s = find('aurora-gemini', { x: 249, z: 249 });
  return { hive: { x: h.x, z: h.z }, yard: { x: y.x, z: y.z }, spire: { x: s.x + 7, z: s.z + 7 } };
}));
const od = await page.evaluate(() => window.bloomgrid.cameraCtl.overviewDistance);

// The frame-exact machinery (see the header): the engine stops; `__bgFrame(dt, rate)` advances input, one sim tick,
// sync and render by dt·rate, the reels' clock by the same, and every CSS animation by dt (video time).
await page.evaluate(async () => {
  const g = window.bloomgrid;
  const url = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => /\/src\/render\/uniforms\.ts/.test(n))
    .pop();
  const U = url ? (await import(url)).U : null;
  const reel = g.services.get('moments').clock;
  reel.virtual = 0;
  window.__bgOff = 0;
  g.engine.stop();
  let t = 0;
  const ages = new WeakMap();
  window.__bgFrame = (dt, rate = 1) => {
    const d = dt * rate;
    t += d;
    reel.virtual += d * 1000;
    const f = { dt: d, tickDt: d, alpha: 0, elapsed: t, tick: g.city.tick };
    g.systems.run('input', g, f);
    g.engine.stepTicks(1);
    g.systems.run('sync', g, f);
    g.systems.run('render', g, f);
    for (const a of document.getAnimations()) {
      const s = a.playState;
      if (s === 'idle' || s === 'paused' || s === 'finished') continue;
      let age = ages.get(a);
      if (age === undefined) {
        age = 0;
        a.playbackRate = 1e-4;
      }
      age += dt * 1000;
      ages.set(a, age);
      a.currentTime = age;
    }
    return new Promise((res) => requestAnimationFrame(() => res()));
  };
  window.__bgPin = (tick, tod, time) => {
    if (g.input) g.input.lastActivity = performance.now();
    g.city.tick = tick;
    if (tod !== undefined && tod !== null) g.city.timeOfDay = tod;
    if (U) U.clock.value = time + window.__bgOff;
  };
  // Orbit pose exactly as CityCamera.update would, with `cinematic` set so nothing smooths it. The orbit height
  // follows the terrain low-passed (graded terraces step between tiles), plus `aim` for tall subjects.
  const place = (x, y, z, yaw, pitch, dist, floor = true) => {
    const cam = g.cameraCtl;
    cam.target.set(x, y, z);
    cam.goalTarget.copy(cam.target);
    cam.yaw = cam.goalYaw = yaw;
    cam.pitch = cam.goalPitch = pitch;
    cam.distance = cam.goalDistance = dist;
    const cp = Math.cos(pitch);
    const px = x + Math.sin(yaw) * cp * dist;
    const py = y + Math.sin(pitch) * dist;
    const pz = z + Math.cos(yaw) * cp * dist;
    g.camera.position.set(px, floor ? Math.max(py, Math.max(0, g.city.grid.heightAt(px, pz)) + 1.5) : py, pz);
    g.camera.lookAt(cam.target);
  };
  window.__bgPose = (v) => {
    const h = Math.max(0, g.city.grid.heightAt(v.x, v.z));
    const s = window.__bgTy === undefined ? h : window.__bgTy + (h - window.__bgTy) * 0.15;
    window.__bgTy = s;
    place(v.x, s + (v.aim ?? 0), v.z, v.yaw, v.pitch, v.dist);
  };
  // Chase the Sky Guard: its live position plus one frame of look-ahead (it flies 50 tiles/s), yaw easing from
  // three-quarter rear toward dead astern as the roll lands.
  window.__bgJet = (e) => {
    const p = g.services.get('skyguard').position;
    const pr = window.__jp;
    window.__jp = { x: p.x, y: p.y, z: p.z };
    const lx = 2 * p.x - (pr ? pr.x : p.x);
    const ly = 2 * p.y - (pr ? pr.y : p.y);
    const lz = 2 * p.z - (pr ? pr.z : p.z);
    let y = Math.atan2(-(p.x - (pr ? pr.x : p.x)), -(p.z - (pr ? pr.z : p.z))) + (0.5 - 0.38 * e);
    const py = window.__jy;
    if (py !== undefined) {
      let d = y - py;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      y = py + d * 0.5;
    }
    window.__jy = y;
    place(lx, ly, lz, y, 0.16 - 0.06 * e, 34 - 7 * e, false);
  };
  // Orbit the Tidesong as she cruises her loop.
  window.__bgFerry = (e) => {
    const p = g.services.get('ferry').position;
    place(p.x, 2.5, p.z, Math.PI * 0.8 + 0.55 * e, 0.36 - 0.08 * e, 46 - 8 * e, false);
  };
});

// Flora's live core: load the model before capturing (first run downloads ~1.1 GB into the profile).
if (withAi) {
  const ai = await page.evaluate(async (id) => {
    const a = window.bloomgrid.services.get('assistant');
    const t = performance.now();
    a.toggle(true);
    try {
      await a.engine.load(id);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
    a.toggle(false);
    const s = a.engine.state;
    return {
      ok: s.status === 'ready',
      status: s.status,
      error: s.error,
      backend: s.info?.backend,
      ms: Math.round(performance.now() - t),
    };
  }, AI_MODEL);
  console.log(`[demo] Flora core ${AI_MODEL}: ${JSON.stringify(ai)}`);
  if (!ai.ok) console.log('[demo] WARNING: continuing without the live model (--no-ai hides this)');
  else
    // Approve any action Flora proposes (the ai-probe pattern), or the turn would park on the approval chip.
    await page.evaluate(() => {
      new MutationObserver(() =>
        document.querySelector('.ai-approve:not(.ok):not(.bad) .ai-auth.yes')?.click(),
      ).observe(document.body, {
        subtree: true,
        childList: true,
      });
    });
}
const totalFrames = shots.reduce((a, s) => a + Math.round(s.dur * fps), 0);
console.log(
  `[demo] overview ${od.toFixed(0)}, spire ${spire.x.toFixed(0)}/${spire.z.toFixed(0)}, hive ${hive.x.toFixed(0)}/${hive.z.toFixed(0)}, yard ${yard.x.toFixed(0)}/${yard.z.toFixed(0)}; ${shots.length} shots, ${totalFrames} frames at ${W}x${H}, ${total.toFixed(1)}s after dissolves${only.length ? `; only shots ${only.map((i) => i + 1).join(',')}` : ''}`,
);

const segDir = (i) => join(framesDir, `seg${String(i).padStart(2, '0')}`);
const t0 = Date.now();
let done = 0;
let time = 0; // video time at the start of the current shot (shots run back to back; the dissolves overlap them)
for (let i = 0; i < shots.length; i++) {
  const shot = shots[i];
  const n = Math.round(shot.dur * fps);
  const capture = !only.length || only.includes(i);
  if (!capture && !shot.keep) {
    time += shot.dur;
    continue;
  }
  mkdirSync(segDir(i), { recursive: true });
  // Posed shots take the camera over completely (`cinematic`); free shots and films give it back.
  await page.evaluate(
    (free) => {
      window.bloomgrid.cameraCtl.cinematic = !free;
      delete window.__bgTy;
    },
    !!(shot.free || shot.film),
  );
  if (shot.enter) await page.evaluate(shot.enter(time));
  if (shot.preroll) console.log(`[demo] shot ${i + 1} prerolled ${await page.evaluate(shot.preroll)} frames`);
  // Tracked subjects move at the cut (clock offsets): one settle frame so the first pose reads their new place.
  if (shot.track)
    await page.evaluate(
      (args) => (window.__bgPin(...args), window.__bgFrame(1 / 60)),
      [TICK, shot.tod?.(0), time],
    );
  console.log(`[demo] shot ${i + 1} @ ${time.toFixed(1)}s`);
  const fired = new Set();
  for (let f = 0; f < (capture ? n : 0); f++) {
    const local = f / n;
    for (const [at, code] of shot.at ?? [])
      if (local * shot.dur >= at && !fired.has(at)) (fired.add(at), await page.evaluate(code));
    // Fireworks acts ramp the tick with every pin ≡ 9 (mod 10), so the engine's `tick++` lands on a pulse boundary
    // every sim update (+10 ticks per 3 frames ≈ 100 ticks/s of video: a 300-tick grand show spans ~3 s). Other
    // shots freeze at TICK (offset 3 + per-frame reset: no pulse is ever reached).
    const tick = shot.showPace ? TICK + 6 + 10 * Math.floor(f / 3) : TICK;
    const e = (shot.easeOut ? easeOut : ease)(local);
    const tod = shot.film ? null : shot.tod?.(ease(local));
    const kind = shot.film || shot.free ? 'none' : (shot.track ?? 'pose');
    const v = kind === 'pose' ? shot.view(e, od) : null;
    await page.evaluate(
      (kind, v, e, tick, tod, clock, dt, rate) => {
        window.__bgPin(tick, tod, clock);
        if (kind === 'pose') window.__bgPose(v);
        else if (kind === 'jet') window.__bgJet(e);
        else if (kind === 'ferry') window.__bgFerry(e);
        return window.__bgFrame(dt, rate);
      },
      kind,
      v,
      ease(local),
      tick,
      tod,
      time + f / fps,
      1 / fps,
      shot.rate ?? 1,
    );
    // JPEG is safe at the supersampled size: the downscale that follows averages the artefacts away.
    await page.screenshot({
      path: join(segDir(i), `f${String(f).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 96,
    });
    if (++done % 150 === 0)
      console.log(`[demo] frame ${done}/${totalFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
  }
  if (shot.report) console.log(`[demo] shot ${i + 1} ends on: ${await page.evaluate(shot.report)}`);
  if (shot.exit) await page.evaluate(shot.exit);
  time += shot.dur;
}
if (withAi) {
  const last = await page.evaluate(
    () =>
      [...document.querySelectorAll('.ai-msg.bot')].pop()?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  );
  console.log(
    `[demo] Flora's last on-screen message: ${last ? `${last.slice(0, 120)}…` : '(none: the demo ask never landed)'}`,
  );
}
await browser.close();

const clean = () => {
  if (keepFrames) return;
  for (const f of readdirSync(framesDir))
    if (f !== '.gitignore') rmSync(join(framesDir, f), { recursive: true, force: true });
  try {
    rmdirSync(framesDir);
  } catch {
    /* .gitignore or a stray file remains: leave the dir */
  }
  console.log(`[demo] intermediate frames removed (${framesDir})`);
};

if (only.length) {
  // Quick look: each captured shot as its own clip, no dissolves or cards.
  for (const i of only) {
    const clip = out.replace(/\.mp4$/, `-shot-${String(i + 1).padStart(2, '0')}.mp4`);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        String(fps),
        '-i',
        join(segDir(i), 'f%04d.jpg'),
        '-vf',
        `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
        '-c:v',
        'libx264',
        '-crf',
        String(crf),
        clip,
      ],
      { stdio: 'inherit' },
    );
    console.log(`[demo] ${clip}`);
  }
  clean();
  console.log(`[demo] done (${errors} page errors)`);
  process.exit(0);
}

// Encode: dissolve the shot segments into one another (chained xfade, one length per boundary), then composite
// the caption cards (overlay + alpha fades) and fade the whole video in and out.
const segDur = shots.map((_, i) => readdirSync(segDir(i)).length / fps);
const inputs = ['-framerate', String(fps), '-i', join(segDir(0), 'f%04d.jpg')];
const graph = [`[0:v]scale=${W}:${H}:flags=lanczos,setsar=1[s0]`];
let prev = '[s0]';
{
  let len = segDur[0];
  shots.slice(1).forEach((_, j) => {
    const idx = j + 1;
    inputs.push('-framerate', String(fps), '-i', join(segDir(idx), 'f%04d.jpg'));
    graph.push(`[${idx}:v]scale=${W}:${H}:flags=lanczos,setsar=1[s${idx}]`);
    const d = xfs[j];
    const off = Math.max(0, len - d);
    graph.push(
      `${prev}[s${idx}]xfade=transition=${XT[j]}:duration=${d.toFixed(2)}:offset=${off.toFixed(2)}[x${idx}]`,
    );
    prev = `[x${idx}]`;
    len = off + segDur[idx];
  });
}
const cards = [];
if (seconds >= 6) cards.push({ png: CARDS.title.png, a: 1.5, b: Math.min(5.7, seconds * 0.1 + 2.8) });
shots.forEach((s, i) => {
  const c = CARDS[s.card];
  if (!c || c.a === undefined) return;
  const a = shotStarts[i] + c.a * scale;
  const b = shotStarts[i] + Math.min(c.b * scale, s.dur - (xfs[i] ?? 0) - 0.3);
  if (b - a >= 1.2) cards.push({ png: c.png, a, b });
});
cards.push({ png: CARDS.end.png, a: total - 3.6, b: total - 0.35 });
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
// Filmic pass: slow open from black, slow close into it, a gentle vignette, and a whisper of grain that also
// dithers the night skies' gradient banding before a platform's own encode.
graph.push(
  `[${last}]fade=t=in:st=0:d=1.1,fade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5,vignette=angle=PI/6,noise=alls=3:allf=t+u,format=yuv420p[v]`,
);
console.log(
  `[demo] encoding ${out} (${shots.length} segments, ${cards.length} cards, ${xfs.length} dissolves)`,
);
execFileSync(
  'ffmpeg',
  [
    '-y',
    ...inputs,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-crf',
    String(crf),
    '-preset',
    'slow',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'inherit' },
);
clean();
console.log(`[demo] done: ${out} (${errors} page errors)`);
