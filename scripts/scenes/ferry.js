// The cruise ferry Tidesong and its pier (D-141). `window.AT` = 'pier' (default: at the berth) | 'sea' (departs and
// fast-forwards `window.SAIL` seconds, default 60, then frames it under way); `window.NEAR` distance, `window.YAW`,
// `window.PITCH`, `window.NIGHT = 1`, `window.SHOW = 1` deck show, `window.INSPECT = 1` opens its inspector,
// `window.RIDE = 1` rides aboard, `window.FULL = 1` Full ahead. The scene waits for the camera itself: use `--after 200`
// (the ship sails out of frame during a longer wait).
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const f = g.services.get('ferry');
  if (!f.active) return { active: false };
  if (window.AT === 'sea') {
    f.departNow();
    if (window.FULL) f.fullAhead(true);
    f.advance(window.SAIL ?? 60);
  }
  if (window.SHOW) f.deckShow();
  const p = f.position;
  const view = () => g.cameraCtl.setView({ x: p.x, z: p.z, yaw: window.YAW ?? Math.PI * 0.8, pitch: window.PITCH ?? 0.42, distance: window.NEAR ?? 45, aim: 3 });
  view();
  if (window.INSPECT) f.inspect();
  if (window.RIDE) g.services.get('explore').setMode('ferry');
  // Under way it sails out of a fixed shot: keep the camera on it while the glide settles, then hold it there.
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (!window.RIDE) view();
  }
  if (!window.RIDE) g.cameraCtl.lookAt(p.x, p.z, undefined, true);
  return { x: p.x.toFixed(1), z: p.z.toFixed(1), draws: g.renderer.info.render.drawCalls };
})();
