// Bridges (D-128). Default: selects the longest named bridge and opens its inspector.
// `window.BUILD = 1` lays a new highway across the water beside it (paving wave, piers, deck from both banks,
// opening ceremony); capture with `--after` ≈ 1500–6000 to catch a stage. `window.UPGRADE = 2` raises it first.
// `window.NEAR` = camera distance, `window.NIGHT = 1` for night.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const bridges = [...c.bridges].sort((a, b) => b.len - a.len);
  const b = bridges[window.PICK ?? 0];
  if (!b) return { error: 'no bridges' };
  const mid = (r) => (r.alongX ? [r.x + r.len / 2, r.z + 0.5] : [r.x + 0.5, r.z + r.len / 2]);
  const [cx, cz] = mid(b);
  g.cameraCtl.setView({
    x: cx,
    z: cz,
    yaw: window.YAW ?? (b.alongX ? 0.35 : Math.PI / 2 + 0.35),
    pitch: window.PITCH ?? 0.42,
    distance: window.NEAR ?? Math.max(22, b.len * 1.1),
  });
  if (window.UPGRADE)
    for (let i = 0; i < window.UPGRADE; i++) g.commands.execute('upgradeBridge', { key: b.key });
  if (window.BUILD) {
    // A parallel crossing a few rows over: land to land through the water.
    const grid = c.grid;
    for (const off of [4, -4, 6, -6, 8, -8]) {
      const tiles = [];
      const pad = 3;
      for (let k = -pad; k < b.len + pad; k++) {
        const [x, z] = b.alongX ? [b.x + k, b.z + off] : [b.x + off, b.z + k];
        if (!grid.inBounds(x, z)) break;
        tiles.push(grid.index(x, z));
      }
      if (tiles.some((t) => grid.road[t] || grid.occupant[t] >= 0)) continue;
      c.credits += 50000;
      const ok = g.commands.execute('road', { tiles, bridges: true });
      if (ok) return { built: true, off, tiles: tiles.length, bridges: c.bridges.length };
    }
    return { built: false };
  }
  g.bus.emit('selection:changed', { eid: null, road: c.grid.index(b.x, b.z), bridge: b.key });
  return {
    name: b.name,
    len: b.len,
    by: b.by,
    count: c.bridges.length,
    names: bridges.slice(0, 6).map((r) => r.name),
  };
})();
