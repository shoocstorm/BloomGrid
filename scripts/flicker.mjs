#!/usr/bin/env node
/**
 * Flicker probe (D-064, D-070): how much thin detail flashes while the camera moves. Pans the camera a fraction of
 * a tile per frame (shader clock pinned, sim paused) and reports the share of pixels whose brightness jumps by more
 * than --threshold (0–255) between consecutive frames. Real motion at this speed is sub-pixel, so what is left is
 * aliasing: sub-pixel lines and specks popping in and out of pixels, which bloom turns into flashing.
 *
 *   bun run flicker                                  # whole scene, night, three zooms
 *   bun run flicker -- --pieces all                  # every instanced piece type alone (worst first)
 *   bun run flicker -- --pieces glassBox,slab --day  # chosen pieces, by day
 *   bun run flicker -- --defs canopy-tower           # one building type alone (its pieces, on its buildings)
 *   bun run flicker -- --pieces names                # every named module mesh alone (lanes, rails, scenery…)
 *
 * Options: --base, --path (default "/?nodynres"), --dists 70,140,260, --frames 10, --step (tiles per frame; default ≈0.15 px of motion),
 * --threshold 48, --cx/--cz (focus tile, default downtown), --yaw, --pitch. Needs the dev server and a local Chrome.
 */
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith('--')
          ? [
              ...acc,
              [a.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? 'true' : all[i + 1]],
            ]
          : acc,
      [],
    ),
);
const base = args.base ?? 'http://localhost:5173';
const dists = (args.dists ?? '70,140,260').split(',').map(Number);
const frames = Number(args.frames ?? 10);
// Pan per frame: by default ~0.15 px on screen at any distance, so a well anti-aliased edge changes by ~15% of its
// contrast (under the threshold) while a detail that pops in or out of a pixel jumps fully.
const stepFor = (dist) => (args.step !== undefined ? Number(args.step) : dist * 0.0002);
const threshold = Number(args.threshold ?? 48);
const night = args.day !== 'true';
const [W, H] = [960, 600];
const chrome =
  args.chrome ??
  process.env.CHROME_PATH ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(base + (args.path ?? '/?nodynres'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 60000, polling: 250 });
await new Promise((r) => setTimeout(r, 2500));

// Freeze the world: sim paused, shader clock pinned, HUD hidden, night or noon.
await page.evaluate(
  async ({ night }) => {
    const g = window.bloomgrid;
    g.engine.speed = 0;
    g.city.timeOfDay = night ? 0.95 : 0.5;
    document.getElementById('hud').style.visibility = 'hidden';
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => n.includes('/src/render/uniforms.ts'));
    const { U } = await import(url);
    Object.defineProperty(U.clock, 'value', { get: () => 100, set() {}, configurable: true });
    // Wait for rendered frames, not animation frames: the engine paces rendering (an unfocused page renders at 15 fps).
    g.services.get('render').power.mode = 'max';
    window.__frames = (n) =>
      new Promise((res) => {
        const end = g.engine.frames + n;
        const f = () => (g.engine.frames >= end ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      });
    window.__view = (x, z, distance, yaw, pitch) => {
      const c = g.cameraCtl;
      // The focus height eases toward the ground: start it there, so the camera holds still.
      const y = Math.max(0, g.city.grid.heightAt(x, z));
      c.target.set(x, y, z);
      c.goalTarget.set(x, y, z);
      c.distance = c.goalDistance = distance;
      c.yaw = c.goalYaw = yaw;
      c.pitch = c.goalPitch = pitch;
    };
    // Isolation: show only instanced batches of the given pieces (null = everything). Layers, not `visible`:
    // the instancer sets visibility every frame for culling.
    window.__isolate = (pieces) => {
      const keep = new Set();
      if (pieces)
        for (const b of g.instancer.batches.values()) if (pieces.includes(b.piece.id)) keep.add(b.mesh);
      // `name:<prefix>` keeps scene objects by name (module meshes: mobility.lanes, aeroline…).
      if (pieces)
        g.scene.traverse((o) => {
          for (const p of pieces)
            if (p.startsWith('name:') && (o.name || '').startsWith(p.slice(5)))
              o.traverse((c) => keep.add(c));
        });
      g.scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) o.layers.set(!pieces || keep.has(o) ? 0 : 31);
      });
      return keep.size;
    };
    window.__pieces = () => [...new Set([...g.instancer.batches.values()].map((b) => b.piece.id))];
    window.__names = () => {
      const n = new Set();
      g.scene.traverse(
        (o) => (o.isMesh || o.isPoints || o.isLine) && o.name && !/@/.test(o.name) && n.add(`name:${o.name}`),
      );
      return [...n];
    };
    /** Pieces a building type is made of (its live entries' instances). */
    window.__defPieces = (id) => {
      const e = g.city.buildingEntities().filter((x) => g.city.buildingDef(x).id === id);
      const r = g.services.get('construction').renderer;
      const set = new Set();
      for (const x of e.slice(0, 20)) for (const p of r.snapshot(x)) set.add(p.piece);
      const first = e[0];
      return {
        pieces: [...set],
        at: first === undefined ? null : [g.city.buildingRecord(first).x, g.city.buildingRecord(first).z],
      };
    };
  },
  { night },
);

const luma = (buf) => {
  const out = new Float32Array(buf.length / 3);
  for (let i = 0, j = 0; j < out.length; i += 3, j++)
    out[j] = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
  return out;
};
const grab = async () =>
  luma(
    await sharp(await page.screenshot({ type: 'png' }))
      .removeAlpha()
      .raw()
      .toBuffer(),
  );

/** Mean share (%) of pixels that jump > threshold per frame while panning at `dist`. */
async function measure(pieces, x, z, dist) {
  await page.evaluate((p) => window.__isolate(p), pieces);
  const yaw = Number(args.yaw ?? 0.6);
  const pitch = Number(args.pitch ?? 0.7);
  let prev = null;
  let sum = 0;
  for (let f = 0; f <= frames; f++) {
    const step = stepFor(dist);
    await page.evaluate((a) => window.__view(...a), [x + f * step, z + f * step * 0.4, dist, yaw, pitch]);
    // Settle first: night lighting eases in, shadows re-render after isolation.
    await page.evaluate((n) => window.__frames(n), f === 0 ? 40 : 3);
    const cur = await grab();
    if (prev) {
      let n = 0;
      for (let i = 0; i < cur.length; i++) if (Math.abs(cur[i] - prev[i]) > threshold) n++;
      if (args.diff && f === frames) {
        // Where it flickers: changed pixels white over a dim copy of the frame.
        const img = Buffer.alloc(cur.length);
        for (let i = 0; i < cur.length; i++)
          img[i] = Math.abs(cur[i] - prev[i]) > threshold ? 255 : cur[i] * 0.25;
        await sharp(img, { raw: { width: W, height: H, channels: 1 } })
          .png()
          .toFile(args.diff.replace(/\.png$/, `-${(pieces ?? ['scene']).join('+')}-${dist}.png`));
      }
      sum += n / cur.length;
      if (args.verbose) process.stdout.write(`${((n / cur.length) * 100).toFixed(2)} `);
    }
    prev = cur;
  }
  return (sum / frames) * 100;
}

const cx = Number(args.cx ?? 292);
const cz = Number(args.cz ?? 222);
const fmt = (v) => v.toFixed(3).padStart(7);
console.log(
  `flicker % (pixels jumping > ${threshold}/255 per frame, ${night ? 'night' : 'day'}) at distances ${dists.join(' / ')}`,
);
if (args.defs) {
  for (const id of args.defs.split(',')) {
    const { pieces, at } = await page.evaluate((i) => window.__defPieces(i), id);
    if (!at) {
      console.log(`${id.padEnd(24)} (none in the city)`);
      continue;
    }
    const r = [];
    for (const d of dists) r.push(await measure(pieces, at[0] + 1, at[1] + 1, d));
    console.log(`${id.padEnd(24)} ${r.map(fmt).join(' ')}   at ${at.join(',')} pieces: ${pieces.join(',')}`);
  }
} else if (args.pieces) {
  const list =
    args.pieces === 'all'
      ? await page.evaluate(() => window.__pieces())
      : args.pieces === 'names'
        ? await page.evaluate(() => window.__names())
        : args.pieces.split(',');
  const rows = [];
  for (const p of list) {
    const r = [];
    for (const d of dists) r.push(await measure([p], cx, cz, d));
    rows.push([p, r]);
    process.stdout.write('.');
  }
  console.log();
  rows.sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]));
  for (const [p, r] of rows) console.log(`${p.padEnd(24)} ${r.map(fmt).join(' ')}`);
} else {
  const r = [];
  for (const d of dists) r.push(await measure(null, cx, cz, d));
  console.log(`${'whole scene'.padEnd(24)} ${r.map(fmt).join(' ')}`);
}
await browser.close();
