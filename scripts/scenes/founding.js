// "First Light" (D-183/D-184), the founding film, on `?scenario=fresh-island&nowizard` (`--after 8000`): plays it as
// a replay and freezes it `window.AT` ms in (its clock and every CSS animation), so the capture shows that exact
// moment (headless screenshots land seconds late otherwise). Stages: ~800 night, ~2200 the boat sails, ~4300 dawn,
// ~5500 the island rises, ~7700 the seed, ~8800 bloom, ~10300 homes, ~12700 Island OS, ~15300 the name.
// `window.INSTANT = 1` plays it as a founding does (opening on black); `window.NAME` renames the city first; `window.GALLERY = 'cat' | 'film:founding'`
// opens that gallery exhibit instead (`window.LEVEL` for the cat's coat). Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (window.GALLERY) {
    g.services.get('gallery').open(window.GALLERY, window.LEVEL ?? 0);
    await wait(window.AT ?? 2500);
    return { exhibit: document.querySelector('.gal-flat')?.innerText?.slice(0, 200) };
  }
  // The app's own module instance (a plain import would load a second copy).
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/modules/tutorial/founding.ts'));
  const film = await import(url ?? '/src/modules/tutorial/founding.ts');
  if (window.NAME) g.commands.execute('nameCity', { name: window.NAME }, false);
  const t0 = performance.now();
  if (window.INSTANT) film.playFounding(g, () => {}, { instant: true });
  else g.services.get('moments').replay('founding');
  await wait((window.AT ?? 9000) - (performance.now() - t0));
  film.filmClock.held = true;
  for (const a of document.getAnimations()) a.pause();
  const root = document.querySelector('.ftl-root');
  return {
    stages: root?.className,
    caption: document.querySelector('.ftl-cap')?.textContent,
    homes: document.querySelectorAll('.ftl-home').length,
    trees: document.querySelectorAll('.ftl-tree').length,
    paused: g.engine.speed === 0,
  };
})();
