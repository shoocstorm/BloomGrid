#!/usr/bin/env node
/**
 * Power/perf probe: boots the game headless and measures, over a window, how busy the page's
 * main thread is (CDP task time), how many frames were rendered, CPU ms per frame, and GPU ms
 * per frame (needs ?gputime). Use it to compare settings before/after power optimisations.
 *
 *   bun run perf -- --path "/?gputime" --seconds 10 [--idle]
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const base = args.base ?? 'http://localhost:5173';
const seconds = Number(args.seconds ?? 10);
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--window-size=1440,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: Number(args.dpr ?? 2) });
await page.goto(base + (args.path ?? '/'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.engine, { timeout: 60000 });
// Older builds have no rendered-frame counter: fall back to counting display refreshes.
await page.evaluate(() => {
  if (window.bloomgrid.engine.frames !== undefined) return;
  window.__raf = 0;
  const tick = () => ((window.__raf++), requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});
const frames = () => page.evaluate(() => window.bloomgrid.engine.frames ?? window.__raf);
await new Promise((r) => setTimeout(r, 4000)); // let the boot reveal finish
if (!args.idle) {
  // Simulate an active player: slowly orbit the downtown (stays over the city, keeps input fresh).
  await page.evaluate(() => {
    const g = window.bloomgrid;
    g.cameraCtl.lookAt(g.city.size * 0.55, g.city.size * 0.64, 70, true);
    window.__panTimer = setInterval(() => {
      g.cameraCtl.yaw += 0.003;
      if (g.input) g.input.lastActivity = performance.now();
    }, 16);
  });
}
if (args.idle) await page.evaluate(() => { const g = window.bloomgrid; g.cameraCtl.lookAt(g.city.size * 0.55, g.city.size * 0.64, 70, true); });
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const f0 = await frames();
const m0 = await metrics();
if (args.profile) await cdp.send('Profiler.enable'), await cdp.send('Profiler.start');
await new Promise((r) => setTimeout(r, seconds * 1000));
const m1 = await metrics();
if (args.profile) {
  // Self time by function (top 15) — where the main thread actually spends its frames.
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const dt = (profile.endTime - profile.startTime) / profile.samples.length / 1000;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const id of profile.samples) {
    const n = byId.get(id);
    const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(args.profile) || 15);
  for (const [k, ms] of top) console.log(`${((ms / seconds) * 100).toFixed(1).padStart(5)}%  ${k}`);
}
const f1 = await frames();
const app = await page.evaluate(() => ({
  cpuMs: window.bloomgrid.engine.frameMs,
  gpuMs: globalThis.__gpuMs?.value ?? 0,
  draws: window.bloomgrid.renderer.info.render.drawCalls,
  pixelRatio: window.bloomgrid.renderer.getPixelRatio(),
  quality: window.bloomgrid.quality.tier,
}));
const span = m1.Timestamp - m0.Timestamp;
const pct = (k) => `${(((m1[k] - m0[k]) / span) * 100).toFixed(1)}%`;
console.log(
  JSON.stringify(
    {
      path: args.path ?? '/',
      mode: args.idle ? 'idle' : 'panning',
      fps: +((f1 - f0) / span).toFixed(1),
      mainThreadBusy: pct('TaskDuration'),
      script: pct('ScriptDuration'),
      styleLayout: `${((((m1.RecalcStyleDuration - m0.RecalcStyleDuration) + (m1.LayoutDuration - m0.LayoutDuration)) / span) * 100).toFixed(1)}%`,
      cpuMsPerFrame: +app.cpuMs.toFixed(2),
      gpuMsPerFrame: +app.gpuMs.toFixed(2),
      draws: app.draws,
      pixelRatio: app.pixelRatio,
      quality: app.quality,
    },
    null,
    0,
  ),
);
await browser.close();
