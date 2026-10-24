// Night blackout drill: removes every power producer, then frames the downtown. Evaluated by scripts/snap.mjs.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.timeOfDay = 0.86;
  let removed = 0;
  for (const e of [...c.buildingEntities()]) {
    if (c.buildingDef(e).stats.energy > 0) {
      const r = c.buildingRecord(e);
      g.commands.execute('demolish', { x: r.x, z: r.z }, false);
      removed++;
    }
  }
  g.engine.speed = 3;
  g.cameraCtl.lookAt(140, 160, 55, true);
  return { removed };
})();
