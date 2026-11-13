// Foresight (plan v5, Phase 24): `bun run snap -- --eval @scripts/scenes/forecast.js --after 3000`.
// Forces a sliding energy (or window.METRIC = 'water' | 'food') trend into the pulse history so the forecast shows,
// then opens City Pulse (Coming up) and the indicator's panel with its dashed projection. window.HOVER = 1 shows the
// hover card instead of the panel; window.PULSE = 1 leaves only City Pulse open. Returns the forecasts.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const city = bloomgrid.city;
  const metric = window.METRIC ?? 'energy';
  const series = { energy: 'energyBalance', water: 'waterBalance', food: 'food' }[metric];
  const used = metric === 'energy' ? city.stats.energyUsed : metric === 'water' ? city.stats.waterUsed : 1;
  const now = city.pulse.history[series].at(-1) ?? 0;
  const top = metric === 'food' ? 1.25 : used * 0.25;
  const step = metric === 'food' ? -0.012 : -used * 0.008;
  // Keep the slide going while the pulse appends real samples.
  const h = city.pulse.history[series];
  h.length = 0;
  for (let i = 0; i < 30; i++) h.push(top + step * i);
  void now;
  bloomgrid.services.get('pulse').show('pulse');
  if (!window.PULSE) {
    const stat = { energy: 'energy', water: 'water', food: 'food' }[metric];
    const el = document.querySelector(`.stats .stat-${stat}`);
    if (window.HOVER) el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    else el.click();
  }
  await wait(1200);
  const { forecastCity } = await import(
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => n.includes('/src/sim/forecast.ts')) ?? '/src/sim/forecast.ts'
  );
  return JSON.stringify(forecastCity(city).map((f) => [f.metric, f.text, f.eta && Math.round(f.eta)]));
})();
