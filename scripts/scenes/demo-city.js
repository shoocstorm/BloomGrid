// Builds a small demo district near the southern bay and frames it. Evaluated in the page by scripts/snap.mjs.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = 1e5;
  const defs = ['canopy-tower', 'garden-residence', 'solar-spire', 'bioreactor', 'greenhouse-hub', 'pocket-park', 'vertical-farm'];
  const cx = Math.round(c.size * 0.52), cz = Math.round(c.size * 0.62);
  const road = [];
  for (let x = cx - 14; x < cx + 16; x++) road.push(c.grid.index(x, cz));
  for (let z = cz - 12; z < cz + 12; z++) road.push(c.grid.index(cx, z));
  g.commands.execute('road', { tiles: road });
  let placed = 0, i = 0;
  for (let z = cz - 10; z < cz + 10; z += 3)
    for (let x = cx - 12; x < cx + 14; x += 3) if (g.commands.execute('build', { def: defs[i++ % defs.length], x, z, rot: i % 4 })) placed++;
  g.engine.speed = 8;
  g.cameraCtl.lookAt(cx, cz, 40, true);
  return { placed, hash: c.hash() };
})();
