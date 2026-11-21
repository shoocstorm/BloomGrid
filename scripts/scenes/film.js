// Any film (D-185) on `?scenario=fresh-island&nowizard` (`--after 8000`): `window.FILM` = a film id ('project:skylanes',
// 'project:flora', 'wonder:lotus', 'founding', 'project:cat'…) plays as a replay and freezes `window.AT` ms in (the
// reel clock, CSS animations and SVG `animateMotion`), so the capture shows that exact moment (headless screenshots
// land seconds late otherwise). `window.NAME` renames the city first; `window.CAT = 1` adopts the island's cat. Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The app's own module instances (a plain import would load another copy, and the dev server can serve the module
  // under more than one URL): hold every one's clock.
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/modules/moments/reel.ts'));
  // The resource list can be full by now (it holds 250 entries), so the moments service hands over its own clock too.
  const clocks = [g.services.get('moments').clock, ...(await Promise.all(urls.map(async (u) => (await import(u)).reelClock)))];
  if (window.NAME) g.commands.execute('nameCity', { name: window.NAME }, false);
  // The steward's cat (Flora's film casts it on the ledge).
  if (window.CAT && !g.city.growth.unlocked.includes('cat')) g.city.growth.unlocked.push('cat');
  const t0 = performance.now();
  g.services.get('moments').replay(window.FILM ?? 'project:skylanes');
  await wait((window.AT ?? 6000) - (performance.now() - t0));
  for (const c of clocks) c.held = true;
  for (const a of document.getAnimations()) a.pause();
  for (const s of document.querySelectorAll('.reel svg')) s.pauseAnimations?.();
  const root = document.querySelector('.reel');
  return { stages: root?.className, caption: document.querySelector('.reel-cap')?.textContent };
})();
