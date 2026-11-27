// Sea wonders close up (scenery module, D-146, D-164). `window.WONDER` = 'lighthouse' | 'tideGates' | 'lotus' | 'dome' |
// 'stacks' | 'turtle' | 'colonnade' | 'geode' | 'whales' | 'dolphins' (default lighthouse); `window.CLOCK` pins the
// shader clock (whales breach round 0.47 of their cycle; pods roam, so `whales` frames pod `window.POD` (0) where it is then); `window.NEAR` distance, `window.YAW`, `window.PITCH`, `window.AIM` (look-at height),
// `window.NIGHT = 1` (or `window.TIME`), `window.HUD = 1` keeps the HUD. Use `--after 6000`.
(async () => {
  const g = window.bloomgrid;
  const SITES = {
    lighthouse: [0.92, 0.08, 62, 14],
    tideGates: [0.14, 0.92, 95, 6],
    lotus: [0.45, 0.06, 70, 1],
    dome: [0.86, 0.92, 55, 7],
    stacks: [0.06, 0.24, 85, 14],
    turtle: [0.94, 0.8, 70, 2],
    colonnade: [0.95, 0.3, 70, 5],
    geode: [0.1, 0.06, 70, 5],
    whales: [0.3, 0.95, 95, 0],
    dolphins: [0.62, 0.95, 80, 0],
  };
  let [u, v, near, aim] = SITES[window.WONDER ?? 'lighthouse'];
  if (window.WONDER === 'whales') {
    // Pods roam the island (D-231): frame pod 1 where it is at the pinned clock (`window.POD` for another).
    const find = (part) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(part));
    const { podSite } = await import(find('/src/modules/scenery/whaleRoute.ts') ?? '/src/modules/scenery/whaleRoute.ts');
    [u, v] = podSite(window.POD ?? 0, window.CLOCK ?? 0, g.city.size);
  }
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
  if (window.CLOCK !== undefined) {
    // Pin the app's own uniforms module (a fresh import is a second instance, see AGENTS.md §8).
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/render/uniforms.ts'));
    const { U } = await import(url);
    const t0 = performance.now();
    const pin = () => {
      U.clock.value = window.CLOCK + (window.RUN ? (performance.now() - t0) / 1000 : 0);
      requestAnimationFrame(pin);
    };
    pin();
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { draws: g.renderer.info.render.drawCalls };
})();
