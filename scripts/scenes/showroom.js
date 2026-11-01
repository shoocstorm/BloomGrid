// Buildings side by side on an empty island for close-up review of their models (use `--path "/?scenario=empty"`).
// `window.DEFS` = building ids (default: the fresh-island hamlet's), `window.GAP` tiles between them,
// `window.NEAR`, `window.YAW`, `window.PITCH`, `window.NIGHT`, `window.FOCUS` (index to centre on).
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const ids = window.DEFS ?? ['garden-residence', 'greenhouse-hub', 'fishing-dock', 'water-works', 'solar-spire', 'ember-watch', 'pocket-park'];
  const gap = window.GAP ?? 2;
  const [x0, z0] = [window.X0 ?? Math.round(c.size / 2) - 14, window.Z0 ?? Math.round(c.size / 2)];
  let x = x0;
  const spots = [];
  for (const id of ids) {
    const eid = c.addBuilding({ def: id, x, z: z0, rot: 0, greenery: 1, occupancy: 1 });
    const def = c.buildingDef(eid);
    spots.push([x + def.footprint[0] / 2, z0 + def.footprint[1] / 2]);
    x += def.footprint[0] + gap;
  }
  // A highway along the front, so nothing shows its "no road" alert.
  const tiles = [];
  const depth = Math.max(...ids.map((id) => g.city.buildingDef(c.buildingEntities().find((e) => c.buildingDef(e).id === id)).footprint[1]));
  for (let tx = x0 - 1; tx < x + 1; tx++) tiles.push((z0 + depth) * c.size + tx);
  g.commands.execute('road', { tiles }, false);
  const f = spots[window.FOCUS ?? Math.floor(spots.length / 2)];
  const near = window.NEAR ?? 26;
  g.cameraCtl.setView({ x: f[0], z: f[1], yaw: window.YAW ?? 0.35, pitch: window.PITCH ?? 0.42, distance: near });
  g.cameraCtl.lookAt(f[0], f[1], near, true);
  const st = document.createElement('style');
  st.textContent = '.panel, .topbar, .hud, .toast, .ai-fab, .build-launch, .rise-tag, [class*="rising"], .bd-launch, .dock-row { display: none !important; }';
  document.head.appendChild(st);
  return { spots };
})();
