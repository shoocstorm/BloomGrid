// Seasonal weather drill: jumps to mid-season (index from `window.SEASON`, default Haze = 3) at
// midday so drizzle (`window.SEASON = 1`, Monsoon) or haze can be checked. Evaluated by scripts/snap.mjs.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  const SEASON_TICKS = 7200;
  const i = window.SEASON ?? 3;
  // Monsoon: tick 12890 is the peak of a passing shower.
  c.tick = i === 1 ? 12890 : SEASON_TICKS * i + SEASON_TICKS / 2;
  c.timeOfDay = 0.45;
  g.cameraCtl.lookAt(Math.round(c.size * 0.55), Math.round(c.size * 0.6), 90, true);
  return { tick: c.tick };
})();
