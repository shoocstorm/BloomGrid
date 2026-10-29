// Fire locator drill: lights three fires across the island and frames one (others off screen get edge pins).
// `window.FAR = 1` pulls back to the island overview to check the beacons. Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const { ignite } = await import('/src/sim/hazards.ts');
  const near = (x, z) => {
    let best = -1;
    let bd = 1e9;
    for (const e of c.buildingEntities()) {
      const r = c.buildingRecord(e);
      const d = (r.x - x) ** 2 + (r.z - z) ** 2;
      if (d < bd) (bd = d), (best = e);
    }
    return best;
  };
  const lit = [
    [292, 222],
    [150, 270],
    [360, 250],
  ].map(([x, z]) => !!ignite(c, near(x, z), 'spread', 0.8));
  g.engine.speed = 1;
  if (window.FAR) g.cameraCtl.overview();
  else g.cameraCtl.lookAt(292, 230, 70, true);
  await new Promise((r) => setTimeout(r, 1500));
  return { lit, fires: c.steward.fires.length, pins: document.querySelectorAll('.hz-pin:not(.hidden)').length };
})();
