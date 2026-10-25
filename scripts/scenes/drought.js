// Drought drill: removes every water source and frames a district so wilting is visible.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  let removed = 0;
  for (const e of [...c.buildingEntities()]) {
    if (c.buildingDef(e).stats.water > 0) {
      const r = c.buildingRecord(e);
      g.commands.execute('demolish', { x: r.x, z: r.z }, false);
      removed++;
    }
  }
  g.engine.speed = 3;
  g.cameraCtl.lookAt(c.size * 0.55, c.size * 0.66, 38, true);
  return { removed };
})();
