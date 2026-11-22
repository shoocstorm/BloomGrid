// Postcards from the future (plan v7, D-222/D-223), `--after 3000`. Evaluated by scripts/snap.mjs.
//
// Default: runs Flora's look ahead in its worker and reports the projection, how long it took and how many frames the
// page drew meanwhile (the run must not block the main thread). `window.DAYS` (default 1) sets the horizon.
// `window.FIRE = 1` first lights fires in a few buildings (so the run has losses and flares to show).
// `window.MODE = 'film'` plays the whole look ahead and freezes `window.AT` ms after the film opens (reel clock, 3D
//   stage and CSS); `'card'` shows the postcard alone (no film); `'chip'` shoots the progress chip `AT` ms into a run;
//   `'whatif'` builds the postcard's first lever and looks again (the comparison).
(async () => {
  const g = window.bloomgrid;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const future = g.services.get('future');
  const days = window.DAYS ?? 1;
  if (window.FIRE) {
    const { ignite } = await import('/src/sim/hazards.ts');
    const es = g.city.buildingEntities();
    for (const k of [40, 400, 900, 1500]) if (es[k] !== undefined) ignite(g.city, es[k], 'lightning', 1);
  }
  if (window.MODE === 'card') {
    // The showcase queues a run of ceremonies after boot: off for the preview.
    g.services.get('moments').mode = 'off';
    const p = await future.postcard(days);
    await wait(800);
    return { shown: !!document.querySelector('.fpc:not(.hidden)'), levers: document.querySelectorAll('.fpc-lever').length, verdict: document.querySelector('.fpc-verdict')?.textContent, end: p?.end };
  }
  if (window.MODE === 'whatif') {
    // The what-if loop: a postcard, build its first lever, then "See the difference" for the compared postcard.
    g.services.get('moments').mode = 'off';
    await future.postcard(days);
    await wait(500);
    const go = document.querySelector('.fpc-go:not([disabled])');
    if (!go) return { lever: false };
    go.click();
    for (let i = 0; i < 50 && !document.querySelector('.fpc-again'); i++) await wait(100);
    document.querySelector('.fpc-again')?.click();
    for (let i = 0; i < 600 && !document.querySelector('.fpc-row.cmp'); i++) await wait(100);
    await wait(400);
    return { compared: !!document.querySelector('.fpc-row.cmp'), vs: [...document.querySelectorAll('.fpc-vs')].map((e) => e.textContent), note: [...document.querySelectorAll('.fpc-what')].map((e) => e.textContent) };
  }
  if (window.MODE === 'chip') {
    // The progress chip while the worker runs (shot a moment in).
    void future.show(days);
    await wait(window.AT ?? 1500);
    return { chip: !!document.querySelector('.fzp:not(.hidden)'), label: document.querySelector('.fzp-label')?.textContent, running: future.running };
  }
  if (window.MODE === 'film') {
    const clocks = [g.services.get('moments').clock];
    void future.show(days);
    for (let i = 0; i < 600 && !document.querySelector('.reel.fz'); i++) await wait(100);
    await wait(window.AT ?? 9000);
    for (const c of clocks) c.held = true;
    for (const a of document.getAnimations()) a.pause();
    return { stages: document.querySelector('.reel')?.className, caption: document.querySelector('.reel-cap')?.textContent, day: document.querySelector('.fz-dnum')?.textContent, stats: document.querySelector('.fz-stats')?.textContent };
  }
  const progress = [];
  const f0 = g.engine.frames;
  const t0 = performance.now();
  const p = await future.project(days, (k) => progress.push(Math.round(k * 100)));
  const ms = performance.now() - t0;
  return {
    ms: Math.round(ms),
    workerMs: p.ms,
    fpsDuring: Math.round(((g.engine.frames - f0) * 1000) / ms),
    progress,
    start: p.start,
    end: p.end,
    tiers: p.tiers.length,
    ruined: p.ruined.length,
    incidents: p.incidents.map((i) => `${i.name} @${i.district ?? '?'}`),
    replacedDay: p.replacedDay,
    cached: future.last === p,
  };
})();
