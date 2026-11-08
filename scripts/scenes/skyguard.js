// The BloomGrid Sky Guard jet (D-141). Default: a close look that tracks the jet (`window.NEAR` distance, `window.YAW`
// orbit, `window.PITCH`; negative pitch looks up from under it). `window.SMOKE = 1` display smoke, `window.BURN = 1`
// afterburner, `window.ROLL = 1` victory roll, `window.CHASE = 1` the chase cam, `window.INSPECT = 1` its inspector,
// `window.NIGHT = 1`. The scene tracks the jet itself: use `--after 100`.
(async () => {
  const g = window.bloomgrid;
  if (window.NIGHT) g.city.timeOfDay = 0.9;
  const j = g.services.get('skyguard');
  if (window.SMOKE) j.smoke(true);
  if (window.BURN) j.afterburner();
  if (window.INSPECT) j.inspect();
  if (window.CHASE) g.services.get('explore').setMode('jet');
  const p = j.position;
  // Hold the city camera on the jet (it flies 50 tiles a second): set the orbit point each frame.
  const cam = g.cameraCtl;
  const t0 = performance.now();
  await new Promise((done) => {
    const tick = () => {
      if (!window.CHASE) {
        cam.setView({ x: p.x, z: p.z, yaw: window.YAW ?? 0.6, pitch: window.PITCH ?? 0.35, distance: window.NEAR ?? 16, aim: p.y });
        // No glide: snap the orbit straight onto the jet.
        cam.target.set(p.x, p.y, p.z);
        cam.goalTarget.set(p.x, p.y, p.z);
        cam.distance = cam.goalDistance;
        cam.yaw = cam.goalYaw;
        cam.pitch = cam.goalPitch;
      }
      if (window.ROLL && performance.now() - t0 > 1200 && !window.__rolled) (window.__rolled = 1), j.roll();
      if (performance.now() - t0 < (window.WAIT ?? 2500)) requestAnimationFrame(tick);
      else done();
    };
    tick();
  });
  return { x: p.x.toFixed(1), y: p.y.toFixed(1), z: p.z.toFixed(1), draws: g.renderer.info.render.drawCalls };
})();
