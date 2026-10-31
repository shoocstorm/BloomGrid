// Fireworks drill (D-068): uses the founding city's Westport waterfront Fireworks Factory (built if missing), fills its racks, sets the clock to
// night and launches a grand show, framed from across the bay. `window.DAY = 1` keeps daylight; `window.FAR = 1`
// pulls back to the island overview; `window.TAB = 1` opens the dashboard's Fireworks tab; `window.TEXT = 'HI'` writes a message, `window.SHAPE = 'heart' | 'rings' | 'butterfly'` features a shape. Evaluated by
// scripts/snap.mjs (use `--after 4000` so the shells are up).
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const agent = g.services.get('agent');
  c.credits += 5000;
  const has = c.buildingEntities().some((e) => c.buildingDef(e).id === 'fireworks-factory');
  const built = has ? { ok: true } : await agent.call('build', { type: 'fireworks-factory', district: 'Westport Works' });
  for (const k of Object.keys(c.fireworks.stock)) c.fireworks.stock[k] = 24;
  c.fireworks.auto = false;
  if (!window.DAY) c.timeOfDay = 0.93;
  g.engine.speed = 1;
  const site = c.buildingEntities().find((e) => c.buildingDef(e).id === 'fireworks-factory');
  const r = c.buildingRecord(site);
  const ok = g.commands.execute('launchFireworks', { grand: true, text: window.TEXT, shape: window.SHAPE });
  if (window.FAR) g.cameraCtl.overview();
  else {
    g.cameraCtl.lookAt(r.x + 2, r.z + 2, window.NEAR ?? 170, true);
    // Low and looking up a little, so the bursts 35–55 units over the yard fill the frame.
    g.cameraCtl.setView({ x: r.x + 2, z: r.z + 2, yaw: window.YAW ?? Math.PI * 0.25, pitch: window.PITCH ?? 0.12, distance: window.NEAR ?? 170 });
  }
  if (window.TAB) g.services.get('dashboard').openFireworks();
  await new Promise((res) => setTimeout(res, 3500));
  return { built: built.ok, launched: ok, at: [r.x, r.z], show: c.fireworks.show && c.fireworks.show.fired, drawCalls: g.renderer?.info?.render?.drawCalls };
})();
