// The director (plan v5, Phase 27): `bun run snap -- --eval @scripts/scenes/director.js --after 3000`.
// Puts long debt part-way to a strike and a heat island near a heatwave (Risk lines), queues a landslide chain link
// (a "brewing" line), and opens City Pulse on its Coming up strip. Returns the strip and the director's report.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const city = bloomgrid.city;
  const app = (path) =>
    import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(path)) ?? path);
  const { queueCrisis, directorReport } = await app('/src/sim/director.ts');
  const { comingUp } = await app('/src/sim/forecast.ts');
  city.steward.autoCrises = false;
  city.consequences.rules['long-debt'] = { level: 0.45, since: city.tick };
  city.consequences.rules['heat-island'] = { level: 0.7, since: city.tick };
  queueCrisis(city, { crisis: 'landslide', gap: 15, severity: 1, cause: 'Monsoon flood: sodden, bare hillsides give way', kind: 'chain' });
  bloomgrid.services.get('pulse').show('pulse');
  await wait(1500);
  return JSON.stringify({ ahead: comingUp(city, 4).map((c) => [c.kind, c.title, Math.round(c.in)]), director: directorReport(city).mood });
})();
