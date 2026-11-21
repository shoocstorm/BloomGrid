// "First Light" (D-183/D-184), the founding film, on `?scenario=fresh-island&nowizard` (`--after 8000`): plays it as
// a replay and freezes it `window.AT` ms in (its clock and every CSS animation), so the capture shows that exact
// moment (headless screenshots land seconds late otherwise). Stages (3D on location, D-197): ~2500 night sea,
// ~4500 the lighthouse, ~6500 the boat sails, ~9000 dawn, ~12500 the seed, ~14500 bloom, ~16500 homes, ~19000 Island OS,
// ~22000 the name.
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
  if (window.NAME) g.commands.execute('nameCity', { name: window.NAME }, false);
  const t0 = performance.now();
  if (window.INSTANT) (await import(url ?? '/src/modules/tutorial/founding.ts')).playFounding(g, () => {}, { instant: true });
  else g.services.get('moments').replay('founding');
  await wait((window.AT ?? 9000) - (performance.now() - t0));
  // Freeze the film (its clock, the 3D stage's, and the CSS) at this moment.
  g.services.get('moments').clock.held = true;
  for (const a of document.getAnimations()) a.pause();
  const root = document.querySelector('.reel.ftl');
  return { stages: root?.className, caption: document.querySelector('.reel-cap')?.textContent, time: g.services.get('world').timeOverride };
})();
