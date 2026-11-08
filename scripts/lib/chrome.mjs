/**
 * One way to launch headless Chrome for the probe scripts (snap, perf, flicker, trailer, ai-probe) that never leaves
 * it behind. A headless Chrome left running keeps rendering the game at full speed, so every exit path kills it:
 *
 * - normal end, `process.exit`, uncaught errors and Ctrl-C / SIGTERM / SIGHUP: the whole process tree is killed
 *   (Chrome's GPU and renderer helpers carry no flag of ours, so they are found as children of the main process
 *   while it is still alive);
 * - the node process killed outright (SIGKILL, a tool timeout): a detached guard shell watches the node pid and
 *   kills the tree once it is gone;
 * - a script that hangs: a watchdog ends it after `maxSeconds`;
 * - leftovers from an older run (before this guard): main processes tagged `--bloomgrid-probe=<pid>` whose owner
 *   is dead are reaped at launch.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const TAG = '--bloomgrid-probe=';

export const findChrome = (override) =>
  override ??
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) =>
    existsSync(p),
  );

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/** `pid` and every descendant, children first (collected before anything is killed). */
function tree(pid) {
  const r = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
  const kids = (r.stdout ?? '').split('\n').filter(Boolean).map(Number);
  return [...kids.flatMap(tree), pid];
}

function killTree(pid) {
  if (!pid) return;
  for (const p of tree(pid)) {
    try {
      process.kill(p, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Kills tagged probe Chromes whose owning node process has died (left by a crashed or killed run). */
function reapOrphans() {
  const r = spawnSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' });
  for (const line of (r.stdout ?? '').split('\n')) {
    const i = line.indexOf(TAG);
    if (i < 0) continue;
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    const owner = Number(line.slice(i + TAG.length).split(/\s/, 1)[0]);
    if (pid && owner && !alive(owner)) {
      console.log(`[chrome] reaping a probe Chrome left by run ${owner} (pid ${pid})`);
      killTree(pid);
    }
  }
}

/** Shell that outlives a SIGKILLed node and then takes Chrome down with it. */
function guard(chromePid) {
  const sh = `
    kt() { for c in $(pgrep -P "$1"); do kt "$c"; done; kill -9 "$1" 2>/dev/null; }
    while kill -0 ${process.pid} 2>/dev/null && kill -0 ${chromePid} 2>/dev/null; do sleep 2; done
    kill -0 ${chromePid} 2>/dev/null && kt ${chromePid}
  `;
  const g = spawn('sh', ['-c', sh], { detached: true, stdio: 'ignore' });
  g.unref();
  return g;
}

/**
 * `puppeteer.launch` with cleanup on every exit path. `maxSeconds` (default 15 min, 0 = none) ends a hung script.
 */
export async function launchChrome({ maxSeconds = 15 * 60, args = [], ...opts } = {}) {
  reapOrphans();
  const browser = await puppeteer.launch({
    ...opts,
    executablePath: findChrome(opts.executablePath),
    args: [...args, `${TAG}${process.pid}`],
  });
  const pid = browser.process()?.pid;
  const g = pid ? guard(pid) : null;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    killTree(pid);
    try {
      if (g?.pid) process.kill(g.pid, 'SIGKILL');
    } catch {
      /* guard already gone */
    }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => {
      console.log(`[chrome] ${sig}: closing headless Chrome`);
      cleanup();
      process.exit(130);
    });
  const fail = (e) => {
    console.error(e);
    cleanup();
    process.exit(1);
  };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
  if (maxSeconds > 0)
    setTimeout(() => {
      console.error(`[chrome] still running after ${maxSeconds}s: giving up (raise maxSeconds if this run is meant to be long)`);
      cleanup();
      process.exit(1);
    }, maxSeconds * 1000).unref();

  // Close politely first (flushes a persistent profile), then make sure.
  const close = browser.close.bind(browser);
  browser.close = async () => {
    await Promise.race([close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    cleanup();
  };
  return browser;
}
