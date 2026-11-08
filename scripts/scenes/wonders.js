// Sea wonders close up (scenery module, D-146). `window.WONDER` = 'lighthouse' | 'tideGates' | 'lotus' | 'dome' |
// 'stacks' (default lighthouse); `window.NEAR` distance, `window.YAW`, `window.PITCH`, `window.AIM` (look-at height),
// `window.NIGHT = 1` (or `window.TIME`), `window.HUD = 1` keeps the HUD. Use `--after 6000`.
(async () => {
  const g = window.bloomgrid;
  const SITES = {
    lighthouse: [0.92, 0.08, 62, 14],
    tideGates: [0.14, 0.92, 95, 6],
    lotus: [0.45, 0.06, 70, 1],
    dome: [0.86, 0.92, 55, 7],
    stacks: [0.06, 0.24, 85, 14],
  };
  const [u, v, near, aim] = SITES[window.WONDER ?? 'lighthouse'];
  g.city.timeOfDay = window.NIGHT ? 0.92 : (window.TIME ?? 0.4);
  if (!window.HUD) document.getElementById('hud')?.classList.add('photo');
  g.engine.speed = 0;
  const S = g.city.size;
  const c = g.cameraCtl;
  const [yaw, pitch, d] = [window.YAW ?? 0.8, window.PITCH ?? 0.3, window.NEAR ?? near];
  const at = { x: u * S, y: window.AIM ?? aim, z: v * S };
  c.cinematic = true;
  c.target.set(at.x, at.y, at.z);
  g.camera.position.set(
    at.x + Math.sin(yaw) * Math.cos(pitch) * d,
    at.y + Math.sin(pitch) * d,
    at.z + Math.cos(yaw) * Math.cos(pitch) * d,
  );
  g.camera.lookAt(at.x, at.y, at.z);
  await new Promise((r) => setTimeout(r, 2500));
  return { draws: g.renderer.info.render.drawCalls };
})();
