#!/usr/bin/env node
/**
 * Records the ~75s trailer (shots/trailer.mp4) from the running dev server, against the showcase city
 * (`scenario=founding-city`; a plain boot is a fresh island, D-072). Fourteen shots on a full-day arc —
 * sunrise to night to dawn — camera driven per captured frame (lookAt always centers the subject):
 *   1. sunrise reveal: tight on the Wellspring Spire, exponential pull to the whole island (title)
 *   2. downtown skyline dive, morning   3. Windward Isle wind farm, midday
 *   4. Bloomtopia park + bridge, golden hour
 *   5. drone flight up the hero avenue toward the spire, golden hour (explore, caption card)
 *   6. Aeroline train ride into dusk (explore, caption card)
 *   7. night fireworks: heart then butterfly (caption card; tick-paced shows)
 *   8. rings, then "BLOOM ♥" written in the sky
 *   9. night sea: the Lotus Atoll, glowing flowers on dark water (caption card)
 *   10. fires ignite, Flora console opens, a live question is sent
 *   11. Flora AI answers: real Qwen3 1.7B tool calls and text streaming in the console (caption card)
 *   12. Bloom Retrofit wave at dawn     13. Flora-Net hive + drone mist
 *   14. pull back to overview (end card)
 *
 * Pacing: shots are short where the trailer runs fast (0.35s dissolves in the daytime run), long where
 * it breathes (0.7–0.8s into night, dawn and the end), and the reveal/end pair mirror each other —
 * tight to wide. City Pulse stays folded the whole way (`pulse.fold(true)` at boot): the trailer frames
 * the city, not the console. Flora's model core (Qwen3 1.7B, wllama/WebGPU) is loaded at boot — the
 * first run downloads it once into a persistent Chrome profile (`--no-ai` skips) — and shot 10 asks it
 * a real question about the fires; the answer streams into the console across shots 10–11.
 *
 * Time discipline: the capture loop is far slower than real time (a frame takes 0.3–1s wall), so the
 * engine is stopped for the whole capture and every frame is advanced by hand — `window.__bgFrame`
 * (installed at boot) runs the input, one sim tick, sync and render phases with an exact dt of 1/fps.
 * Everything integrated from dt (wind rotors, the drone, chase cameras, the train ride) and everything
 * accumulated onto `U.clock` (waves, beam, sparks, pods) then advances at exact video speed; a timed
 * engine step always left per-frame variance that read as turbines stuttering and cameras trembling.
 * The camera's target height is additionally pinned to the terrain: `lookAt` resets it to 0 and the
 * smoother would otherwise only partway re-climb it, unevenly, on raised ground.
 *
 * Each shot's frames are captured into its own segment directory and the encode chains ffmpeg `xfade`
 * dissolves between them, so the whole trailer reads as one continuous move. Caption cards are
 * transparent full-frame PNGs overlaid with alpha fades. Encodes at crf 25 / preset slow so the mp4 is
 * small enough to commit under public/assets/ (GitHub's hard limit is 100 MB; keep it under ~60 MB).
 *
 *   bun run dev                # keep it running
 *   bun run trailer            # or: node scripts/trailer.mjs [--duration 82] [--fps 30] [--no-ai]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
/** Flora's live model core in the video (skipped with --no-ai). Downloads once into the profile. */
const withAi = !process.argv.includes('--no-ai');
const AI_MODEL = 'qwen3-1.7b';
/** Persistent profile: caches the model download (OPFS) so only the first run pays for it. */
const profile = join(tmpdir(), 'bloomgrid-trailer-profile');
mkdirSync(profile, { recursive: true });
const W = 1920;
const H = 1080;
const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

// Gentler start/stop than smoothstep, so every camera move eases in and out imperceptibly.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Fast settle: for reveals that must grab in the first second and then breathe.
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
// Constant-rate zoom (log-interpolated distance): a 30→570 pull reads as one continuous dolly,
// where a linear lerp spends the whole shot crawling at the wide end.
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
const ENTER_TRAIN = `window.bloomgrid.services.get('explore').setMode('train')`;
const EXIT_TRAIN = `window.bloomgrid.services.get('explore').setMode('city')`;
// Drone flight: enter drone mode on the hero avenue south of the spire and fly it WEST along the
// street itself. The heading is found live from `grid.road` (an east-west street that spans the
// approach): roads are building-free by construction, so the drone cannot freeze against a hero
// tower the way a diagonal cross-block route did. It climbs to ~+8 (above the boulevard trees, under
// the Aeroline viaduct), then holds full speed to the very last frame — the chase cam keeps the
// quadcopter dead centre, and the cut into the Aeroline ride is an expanding-circle wipe from it:
// the propeller disc becomes the window into the next scene. Keys: W + Shift (fast) + E (climb)
// lift off, E drops at 1.6s (~+8); W and Shift stay held.
const ENTER_DRONE = () => `(() => {
  const g = window.bloomgrid;
  const grid = g.city.grid;
  // The east-west avenue nearest the spawn: a z whose road tiles run unbroken well past the flight.
  let streetZ = -1;
  for (let z = ${Math.round(238 - 12)}; z <= ${Math.round(238 + 12)} && streetZ < 0; z++) {
    let ok = true;
    for (let x = ${Math.round(spire.x - 22)}; x <= 292 && ok; x++) ok = !!grid.road[grid.index(x, z)];
    if (ok) streetZ = z;
  }
  // Fallback if no continuous street shows up: aim past the spire, high and to one side.
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
// Fireworks (D-068): one launch per Fireworks Factory yard; we build one on the Westport waterfront if the
// showcase city lacks it (the fireworks scene does the same), fill the racks and take over the sky. Shows
// fire per pulse (tick % 10 === 0), so the acts pace `city.tick` directly — no engine-speed tricks. Only
// one show can be in the sky at a time (`launchBlocker` silently rejects a launch while one runs), so an
// act's second launch waits (inside the evaluate, which the capture loop awaits) until the first show has
// ended, then fires — the acts self-serialize whatever the pulse rate does. The wait advances the sim
// directly (`engine.stepTicks`: sim phase only — running the whole engine would advance U.clock and the
// cameras between video frames, which showed as the picture jumping).
const launch = (extra) => `window.bloomgrid.commands.execute('launchFireworks', ${JSON.stringify({ grand: true, ...extra })})`;
const launchWhenClear = (extra, budget = 400) => `(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  while (c.fireworks.show && budget-- > 0) g.engine.stepTicks(3);
  g.commands.execute('launchFireworks', ${JSON.stringify({ grand: true, ...extra })});
})()`;
// A show still in the sky at the cut would freeze there: the next act resets the tick below its startTick,
// so its u clamps to 0 and it never fires or ends (blocking later launches). Force it to end on the next
// pulse instead.
const CLEAR_SKY = `(() => {
  const s = window.bloomgrid.city.fireworks.show;
  if (s) s.fired = s.shells;
})()`;
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
// The live Flora demo: a real question to the loaded model (Qwen3 1.7B). Sent without awaiting so the
// capture keeps rolling while the console streams tool chips and the answer (≈4s wall per turn).
const ASK_FLORA = (q) => `void window.bloomgrid.services.get('assistant').ask(${JSON.stringify(q)})`;

// Founding-city landmarks (tiles): spire block centre ≈ 256/256 (resolved live), downtown ≈ 292/222,
// wind farm ≈ 430/102, Bloomtopia ≈ 252/440 (gate faces yaw π), Tidewatch Lighthouse ≈ 471/41,
// hive/yard resolved from the live city at boot.
let hive = { x: 282, z: 333 }; // flora-hive, resolved from the live city at boot
let yard = { x: 54, z: 281 }; // fireworks factory yard, resolved from the live city at boot
let spire = { x: 256, z: 256 }; // wellspring-spire lot centre, resolved from the live city at boot
const shots = [
  // Cold open: tight on the spire against the sunrise, one exponential pull to the whole island. The
  // title lands while the island is still forming in frame; easeOut grabs in the first second.
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
  // Skyline dive: descend into the downtown towers as the morning breaks.
  {
    dur: 4.3,
    tod: (t) => lerp(0.44, 0.5, t),
    view: (t) => ({ x: 292, z: 222, yaw: lerp(1.15, 2.0, t), pitch: lerp(0.6, 0.44, t), dist: lerp(56, 37, t) }),
  },
  {
    dur: 4.2,
    tod: (t) => lerp(0.52, 0.56, t),
    view: (t) => ({ x: lerp(458, 430, t), z: lerp(72, 102, t), yaw: lerp(0.25, 1.0, t), pitch: lerp(0.46, 0.36, t), dist: lerp(62, 42, t) }),
  },
  // Golden hour on the amusement park: warm light on the rides as the camera sweeps past the gate.
  {
    dur: 4.8,
    tod: (t) => lerp(0.6, 0.66, t),
    view: (t) => ({ x: 252, z: lerp(416, 441, t), yaw: lerp(2.6, 3.14, t), pitch: lerp(0.56, 0.46, t), dist: lerp(82, 46, t) }),
  },
  // Drone flight: the quadcopter lifts off the hero avenue, climbs over the boulevard trees and runs
  // the street at full tilt, the city streaming past — held centre frame so the cut into the Aeroline
  // ride reads as a wipe through the propeller disc.
  {
    dur: 6.3,
    free: true,
    card: 'drone',
    enter: ENTER_DRONE,
    exit: EXIT_DRONE,
    tod: () => 0.7,
    at: [[1.6, `window.bloomgrid.input.keys.delete('KeyE')`]],
  },
  // The Aeroline carries the camera round the loop as dusk falls and the stations light up.
  { dur: 7.0, free: true, card: 'train', enter: ENTER_TRAIN, exit: EXIT_TRAIN, tod: (t) => lerp(0.74, 0.86, t) },
  // Fireworks act I — night falls; a heart goes up, then Temple Fay's butterfly once the heart's show has
  // ended (the launch polls until the sky is clear). Low angle like scripts/scenes/fireworks.js so bursts
  // 35-55 units up fill the frame. `showPace` drives city.tick forward on a ramp (the shows fire per
  // pulse, tick % 10 === 0).
  {
    dur: 8.2,
    card: 'fireworks',
    showPace: true,
    exit: CLEAR_SKY,
    tod: (t) => lerp(0.86, 0.95, t),
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
  // Fireworks act II — interlaced rings, then a message in dot letters ends the show once the rings have
  // cleared (the launch polls). Both shows finish inside the act (the sea shot freezes the tick, so
  // nothing may spill past the cut).
  {
    dur: 7.8,
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
  // Night sea: the Lotus Atoll from open water — giant lily pads and lotus flowers glowing softly on
  // the dark (aGlow rides U.night), the lit north shore glittering behind.
  {
    dur: 4.6,
    card: 'sea',
    tod: () => 0.95,
    view: (t) => ({ x: 230, z: 31, yaw: lerp(Math.PI - 0.22, Math.PI + 0.16, t), pitch: lerp(0.16, 0.11, t), dist: lerp(36, 24, t) }),
  },
  {
    dur: 4.6,
    tod: () => 0.94,
    enter: FLORA_OPEN,
    at: [[2.6, ASK_FLORA('Fires just broke out — what is happening, and what should I do first?')]],
    view: (t) => ({ x: 292, z: 224, yaw: lerp(2.4, 2.6, t), pitch: lerp(0.82, 0.78, t), dist: lerp(120, 95, t) }),
  },
  // The payoff: Flora's answer (real model) streams tool chips and text into the console while the
  // camera settles on her; an approval chip may wait at the end — the steward stays in charge.
  {
    dur: 6.8,
    card: 'flora',
    tod: () => 0.94,
    view: (t) => ({ x: 264, z: 250, yaw: lerp(2.6, 2.8, t), pitch: lerp(0.85, 0.8, t), dist: lerp(150, 135, t) }),
  },
  {
    dur: 5.8,
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
    dur: 5.6,
    tod: (t) => lerp(0.48, 0.36, t),
    enter: () => `window.bloomgrid.commands.execute('mist', { x: ${Math.round(hive.x)} + 6, z: ${Math.round(hive.z)} + 4 })`,
    view: (t) => ({ x: hive.x + 2, z: hive.z + 2, yaw: lerp(1.1, 1.9, t), pitch: lerp(0.48, 0.42, t), dist: lerp(34, 26, t) }),
  },
  // Bookend of the reveal: pull out from the waking city to the whole island, easing into the end card.
  {
    dur: 5.6,
    card: 'end',
    easeOut: true,
    tod: (t) => lerp(0.36, 0.46, t),
    view: (t, od) => ({ x: lerp(270, 256, t), z: lerp(250, 258, t), yaw: lerp(3.15, 3.55, t), pitch: lerp(0.56, 1.0, t), dist: zoom(150, od, t) }),
  },
];
// Dissolve per boundary (after shots 1..13): quick cuts through the daytime run, longer breaths into
// the night acts, dawn and the end. Pacing device — the trailer sprints, then lands. The drone→Aeroline
// cut (boundary 4) is longer and an expanding-circle wipe: the drone sits dead centre from its chase
// cam, so the circle opens out of the propeller disc into the ride — the "propeller becomes the ring".
const XF = [0.35, 0.35, 0.35, 0.5, 0.7, 0.7, 0.45, 0.35, 0.35, 0.5, 0.7, 0.5, 0.8];
const XT = XF.map(() => 'fade');
XT[4] = 'circleopen';
const scale = seconds / PLAN;
shots.forEach((s) => {
  s.dur *= scale;
  if (s.at) s.at = s.at.map(([at, code]) => [at * scale, code]);
});
// Crossfade lengths between shots, shrinking if the trailer is squeezed.
const xfs = XF.map((d) => Math.max(0.2, d * Math.min(1, scale)));
const enterCode = (s) => (typeof s.enter === 'function' ? s.enter() : s.enter);

// Per-shot frame segments: each shot's frames land in its own dir (renumbered), so the encode can
// dissolve between them. Shot starts in *output* time shift earlier by one dissolve per boundary.
const shotStarts = [];
{
  let acc = 0;
  shots.forEach((s, i) => {
    shotStarts.push(acc);
    acc += s.dur - xfs[i];
  });
}
const total = seconds - xfs.reduce((a, b) => a + b, 0);

mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) if (f !== '.gitignore') rmSync(join(framesDir, f), { recursive: true, force: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  // Persistent profile: the model core downloads once (OPFS cache) and every later run starts in ~2s.
  userDataDir: profile,
  protocolTimeout: 30 * 60_000,
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
const dronePng = await card(
  [
    ['FLY YOUR CITY', 40, 11, 0],
    ['a drone\u2019s-eye view of every district', 23, 4, 14, '#dbffe9'],
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
const seaPng = await card(
  [
    ['A LIVING SEA', 40, 11, 0],
    ['wonders beyond the shore', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const floraPng = await card(
  [
    ['MEET FLORA', 40, 12, 0],
    ['here to assist you, by your side', 23, 4, 14, '#dbffe9'],
  ],
  'bottom',
);
const endPng = await card([
  ['TEND IT AND IT BLOOMS', 52, 12, 0],
  ['play free at bloomgrid.web.app', 26, 6, 26, '#dbffe9'],
]);

await page.goto(base + path, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000)); // boot reveal + founding city
await page.evaluate(() => {
  document.querySelector('.help-ok')?.click();
  const g = window.bloomgrid;
  g.city.credits = 1e6;
  // No random crises: the trailer is a movie set, weather must stay pinned clear.
  g.city.steward.autoCrises = false;
  // The trailer frames the city, not the console: City Pulse stays folded for the whole capture.
  g.services.get('pulse').fold(true);
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
({ hive, yard, spire } = await page.evaluate(() => {
  const c = window.bloomgrid.city;
  const find = (id, fb) => {
    const e = c.buildingEntities().find((e) => c.buildingDef(e).id === id);
    return e === undefined ? fb : c.buildingRecord(e);
  };
  const h = find('flora-hive', { x: 282, z: 333 });
  const y = find('fireworks-factory', { x: 54, z: 281 });
  // Records are lot origins: the 14×14 spire's visual centre is +7/+7.
  const s = find('wellspring-spire', { x: 249, z: 249 });
  return { hive: { x: h.x, z: h.z }, yard: { x: y.x, z: y.z }, spire: { x: s.x + 7, z: s.z + 7 } };
}));
const od = await page.evaluate(() => window.bloomgrid.cameraCtl.overviewDistance);
// Time discipline: the engine is stopped for the whole capture and each frame is advanced by hand —
// input, one sim tick, sync and render phases run with an exact dt of 1/fps (see the header). A timed
// engine step could never be frame-exact: everything integrated from dt (wind rotors, the drone, chase
// cameras) or accumulated onto U.clock advanced by whatever the rAF cadence happened to be, and that
// variance read as turbines stuttering and the camera trembling. The render phase submits out of rAF,
// so one requestAnimationFrame is awaited for the compositor before the loop's screenshot.
await page.evaluate(() => {
  const g = window.bloomgrid;
  g.engine.stop();
  let t = 0;
  window.__bgFrame = (dt) => {
    t += dt;
    const f = { dt, tickDt: dt, alpha: 0, elapsed: t, tick: g.city.tick };
    g.systems.run('input', g, f);
    g.engine.stepTicks(1); // one sim tick per video frame: pulses fire from the tick pins
    g.systems.run('sync', g, f);
    g.systems.run('render', g, f);
    return new Promise((res) => requestAnimationFrame(() => res()));
  };
});
// Reach the *app's* uniforms module (importing '/src/render/uniforms.ts' fresh would give a second
// instance, see AGENTS gotchas) so the per-frame clock pin drives the real `U`.
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => /\/src\/render\/uniforms\.ts/.test(n)).pop();
  if (url) window.__bgU = (await import(url)).U;
});
// Flora's live core: load the model before capturing (first run downloads ~1.1 GB into the profile,
// later runs start in ~2s). The console opens for the load, then closes: shots 1–9 stay clean and
// shot 10 opens it again on camera.
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
    return { ok: s.status === 'ready', status: s.status, error: s.error, backend: s.info?.backend, ms: Math.round(performance.now() - t) };
  }, AI_MODEL);
  console.log(`[trailer] Flora core ${AI_MODEL}: ${JSON.stringify(ai)}`);
  if (!ai.ok) console.log('[trailer] WARNING: continuing without the live model (--no-ai hides this)');
  else
    // Approve any action Flora proposes during the demo (the ai-probe pattern): an unapproved action
    // would park the turn on the approval chip and the answer would never finish streaming.
    await page.evaluate(() => {
      new MutationObserver(() =>
        document.querySelector('.ai-approve:not(.ok):not(.bad) .ai-auth.yes')?.click(),
      ).observe(document.body, { subtree: true, childList: true });
    });
}
console.log(
  `[trailer] overview ${od.toFixed(0)}, spire ${spire.x.toFixed(0)}/${spire.z.toFixed(0)}, hive ${hive.x.toFixed(0)}/${hive.z.toFixed(0)}, fireworks yard ${yard.x.toFixed(0)}/${yard.z.toFixed(0)}, ${Math.round(seconds * fps)} frames at ${W}x${H}, ${total.toFixed(1)}s after dissolves`,
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
  // Pin the sim tick into the bloom season for every shot (weather can never drift in: no rain, haze or
  // heatwave overwrites the sky mid-capture). Fireworks acts ramp the tick with every pin set to ≡ 9
  // (mod 10): the engine's `tick++` then lands exactly on a pulse boundary on every sim update, so
  // volleys fire at the engine's own update rate and the show's progress tracks the pin sweep — +10
  // ticks per 3 frames ≈ 100 ticks/s of video, so a 300-tick grand show spans ~3s and each act fits two
  // of them (the second launch polls for a clear sky), all inside the 7200-tick bloom season. Other
  // pins freeze at 3603 (offset 3 + per-frame reset = no boundary is ever reached: no pulses at all).
  const tick = shot.showPace ? 3609 + 10 * Math.floor(segFrame / 3) : 3603;
  const tod = shot.tod?.(ease(local));
  if (shot.free) {
    // Explore modes drive the camera (drone flight, train ride): pin the clock (the train ride is a
    // pure function of U.clock) and keep input "active" so PowerManager's 60fps render cap applies
    // during the short engine steps.
    await page.evaluate(
      (tod, tick, clock) => {
        const g = window.bloomgrid;
        if (g.input) g.input.lastActivity = performance.now();
        g.city.tick = tick;
        if (tod !== undefined && tod !== null) g.city.timeOfDay = tod;
        if (window.__bgU) window.__bgU.clock.value = clock;
      },
      tod,
      tick,
      time,
    );
  } else {
    const v = shot.view(shot.easeOut ? easeOut(local) : ease(local), od);
    await page.evaluate((v, tod, tick, clock) => {
      const g = window.bloomgrid;
      const cam = g.cameraCtl;
      cam.lookAt(v.x, v.z, v.dist, true);
      // lookAt resets target.y to 0 and the smoother only partway re-climbs it during the short
      // engine steps — by an amount that varies with how many frames fit — which read as the camera
      // bobbing. Pin it to the terrain so every engine frame agrees with the pin.
      cam.target.y = Math.max(0, g.city.grid.heightAt(v.x, v.z));
      cam.yaw = cam.goalYaw = v.yaw;
      cam.pitch = cam.goalPitch = v.pitch;
      cam.distance = cam.goalDistance = v.dist;
      if (g.input) g.input.lastActivity = performance.now();
      g.city.tick = tick;
      if (tod !== undefined && tod !== null) g.city.timeOfDay = tod;
      if (window.__bgU) window.__bgU.clock.value = clock;
    }, v, tod, tick, time);
  }
  // Advance the world by exactly one video frame: input + one sim tick + sync + render at dt = 1/fps,
  // then one rAF for the compositor, then grab the presented frame.
  await page.evaluate((dt) => window.__bgFrame(dt), 1 / fps);
  await page.screenshot({ path: join(segDir(i), `f${String(segFrame++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94 });
  if (f % 150 === 0) console.log(`[trailer] frame ${f}/${totalFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}
if (shots[shotIdx].exit) await page.evaluate(shots[shotIdx].exit);
if (withAi) {
  const last = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.ai-msg.bot')].pop();
    return m?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  });
  console.log(`[trailer] Flora's last on-screen message: ${last ? `${last.slice(0, 120)}…` : '(none — the demo ask never landed)'}`);
}
await browser.close();

// Encode: dissolve the shot segments into one another (chained xfade, one length per boundary), then
// composite the caption cards (overlay + alpha fades) and fade the whole video in/out. Card windows
// sit over their shots in output time, where each shot starts one dissolve earlier than the last.
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
    const d = xfs[k];
    const off = Math.max(0, len - d);
    const label = `[x${idx}]`;
    graph.push(`${prev}[${idx}:v]xfade=transition=${XT[k]}:duration=${d.toFixed(2)}:offset=${off.toFixed(2)}${label}`);
    prev = label;
    len = off + segDur[idx];
  });
}
const cards = [];
const cardWin = (i, a, b) => {
  const s = shotStarts[i];
  return [s + a * scale, s + Math.min(b * scale, shots[i].dur - xfs[i] - 0.3)];
};
if (seconds >= 6) cards.push({ png: titlePng, a: 1.5, b: Math.min(5.7, seconds * 0.1 + 2.8) });
{
  const [a, b] = cardWin(4, 1.0, 5.2);
  if (b - a >= 1.2) cards.push({ png: dronePng, a, b });
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
  const [a, b] = cardWin(8, 0.8, 3.9);
  if (b - a >= 1.2) cards.push({ png: seaPng, a, b });
}
{
  const [a, b] = cardWin(10, 0.8, 5.9);
  if (b - a >= 1.2) cards.push({ png: floraPng, a, b });
}
cards.push({ png: endPng, a: total - 3.3, b: total - 0.35 });
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
const xfLast = xfs[xfs.length - 1] ?? 0;
console.log(`[trailer] encoding ${out} (${shots.length} segments, ${cards.length} cards, ${xfs.length} dissolves ${(xfs[0] ?? 0).toFixed(2)}–${xfLast.toFixed(2)}s)`);
execFileSync('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex', graph.join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
console.log(`[trailer] done: ${out} (${errors} page errors)`);
