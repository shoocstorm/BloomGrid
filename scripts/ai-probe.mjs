// Drives the city assistant in headless Chrome against the running dev server: loads a model (downloaded
// once into a persistent profile, so later runs reuse its OPFS copy), sends requests, and prints each turn's
// tool calls, answer and timings, plus a screenshot of the panel.
//
//   bun run ai-probe -- [--model qwen3-0.6b] [--auto] [--max] [--phone] [--ask "What needs fixing?" --ask "…"] [--out shots/ai.png]
//
// `--phone` loads like an iPhone: its user agent and screen (so the CPU plan and lean load options), and no
// JSPI, so wllama runs the compat build Safari gets; it prints the renderer and GPU processes' memory after
// the load (iOS closes a tab past its limit, and that is what the city and the model share).
// `--auto` lets the assistant act without approval (otherwise every action is approved by the probe).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Scripts measure the showcase city unless a path names a scenario (a plain boot is a fresh island + wizard, D-072). */
const showcase = (p) => (/[?&]scenario=/.test(p) ? p : `${p}${p.includes('?') ? '&' : '?'}scenario=founding-city`);

const argv = process.argv.slice(2);
const asks = [];
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'auto') opt.auto = true;
  else if (k === 'max') opt.max = true;
  else if (k === 'phone') opt.phone = true;
  else if (k === 'ask') asks.push(argv[++i]);
  else opt[k] = argv[++i];
}
const model = opt.model ?? 'qwen3-0.6b';
const base = opt.base ?? 'http://localhost:3000';
const out = opt.out ?? 'shots/ai-probe.png';
if (!asks.length) asks.push('What are the most urgent problems, and where?');
const profile = opt.profile ?? join(tmpdir(), 'bloomgrid-ai-probe-profile');
mkdirSync(profile, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: opt.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: profile,
  protocolTimeout: 30 * 60_000,
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--window-size=1440,900'],
});
const page = await browser.newPage();
if (opt.phone) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
  );
  await page.evaluateOnNewDocument(() => delete WebAssembly.Suspending);
} else await page.setViewport({ width: 1440, height: 900 });
page.on(
  'console',
  (m) =>
    ['error', 'warn'].includes(m.type()) &&
    !/bad special token/.test(m.text()) &&
    console.log(`[${m.type()}] ${m.text()}`),
);
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(base + showcase(opt.path ?? '/'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.bloomgrid?.services?.tryGet('assistant'), { timeout: 120_000 });

const load = await page.evaluate(
  async (id, auto, max) => {
    const a = window.bloomgrid.services.get('assistant');
    if (max) a.maximize(true);
    else a.toggle(true);
    if (auto) a.autonomous(true);
    const t = performance.now();
    await a.engine.load(id);
    const s = a.engine.state;
    return {
      status: s.status,
      error: s.error,
      backend: s.info?.backend,
      ms: Math.round(performance.now() - t),
    };
  },
  model,
  !!opt.auto,
  !!opt.max,
);
console.log(`[load] ${model}: ${JSON.stringify(load)}`);
if (opt.phone) {
  const { execSync } = await import('node:child_process');
  const pid = browser.process().pid;
  const rows = execSync('ps -A -o pid=,ppid=,rss=,command=').toString().split('\n');
  const mem = rows
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter((r) => r && Number(r[2]) === pid && /--type=(renderer|gpu-process)/.test(r[4]))
    .map((r) => `${/--type=([\w-]+)/.exec(r[4])[1]} ${Math.round(Number(r[3]) / 1024)} MB`);
  console.log(`[memory] ${mem.join(' · ')}`);
}
if (load.status !== 'ready') process.exit(1);

// Approve every action the assistant asks about (the panel's Approve button), unless --auto already allows them.
await page.evaluate(() => {
  new MutationObserver(() =>
    document.querySelector('.ai-approve:not(.ok):not(.bad) .ai-auth.yes')?.click(),
  ).observe(document.body, { subtree: true, childList: true });
});

for (const q of asks) {
  const r = await page.evaluate(async (text) => {
    const a = window.bloomgrid.services.get('assistant');
    const t = performance.now();
    const answer = await a.ask(text);
    const last = [...document.querySelectorAll('.ai-msg.bot')].pop();
    const tools = [...(last?.querySelectorAll('.ai-tool') ?? [])].map(
      (c) =>
        `${c.classList.contains('ok') ? '✓' : c.classList.contains('bad') ? '✗' : '·'} ${c.textContent}\n      → ${(c.title || '').slice(0, 240)}`,
    );
    return { ms: Math.round(performance.now() - t), tools, answer, tokPerSec: a.engine.state.tokPerSec };
  }, q);
  console.log(
    `\n[ask] ${q}\n  ${r.tools.join('\n  ') || '(no tools)'}\n[answer ${r.ms} ms, ${Math.round(r.tokPerSec ?? 0)} tok/s] ${r.answer}`,
  );
}
await page.screenshot({ path: out });
console.log(`[shot] ${out}`);
await browser.close();
