// Any film (D-185) on `?scenario=fresh-island&nowizard` (`--after 8000`): `window.FILM` = a film id ('project:skylanes',
// 'project:flora', 'wonder:lotus', 'founding', 'project:cat'…) plays as a replay and freezes `window.AT` ms in (the
// reel clock, CSS animations and SVG `animateMotion`), so the capture shows that exact moment (headless screenshots
// land seconds late otherwise). `window.NAME` renames the city first; `window.CAT = 1` adopts the island's cat. Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The app's own module instance (a plain import would load a second copy).
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/modules/moments/reel.ts'));
  const { reelClock } = await import(url ?? '/src/modules/moments/reel.ts');
  if (window.NAME) g.commands.execute('nameCity', { name: window.NAME }, false);
  // The steward's cat (Flora's film casts it on the ledge).
  if (window.CAT && !g.city.growth.unlocked.includes('cat')) g.city.growth.unlocked.push('cat');
  const t0 = performance.now();
  g.services.get('moments').replay(window.FILM ?? 'project:skylanes');
  await wait((window.AT ?? 6000) - (performance.now() - t0));
  reelClock.held = true;
  for (const a of document.getAnimations()) a.pause();
  for (const s of document.querySelectorAll('.reel svg')) s.pauseAnimations?.();
  const root = document.querySelector('.reel');
  return { stages: root?.className, caption: document.querySelector('.reel-cap')?.textContent };
})();
