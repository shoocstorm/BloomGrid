// Sky pods, sky-lanes and the Aeroline up close (D-147). `window.VIEW` = 'pod' (chase a pod: explore follow mode),
// 'train' (chase a train), 'hub' (the central sky-lane hub), 'station' (Hillcrest Aeroline station), 'track' (the
// viaduct and a passing train), 'lanes' (lanes over downtown); `window.NIGHT = 1`, `window.NEAR`, `YAW`, `PITCH`,
// `window.N` (which pod / train). HUD hidden. Use `--after 8000`.
(async () => {
  const g = window.bloomgrid;
  g.city.timeOfDay = window.NIGHT ? 0.92 : (window.TIME ?? 0.42);
  document.getElementById('hud')?.classList.add('photo');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const view = window.VIEW ?? 'pod';
  // No ceremony over the shot (a city reaching a transit milestone plays one at boot).
  g.services.get('moments').mode = 'off';
  for (let i = 0; i < 3; i++)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  const x = g.services.get('explore');
  if (view === 'pod' || view === 'train') {
    x.setMode(view === 'pod' ? 'follow' : 'train');
    for (let i = 0; i < (window.N ?? 0); i++)
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
    x.pitch = window.PITCH ?? 0;
    await wait(3000);
    return { mode: x.mode, draws: g.renderer.info.render.drawCalls };
  }
  const c0 = g.cameraCtl;
  if (view === 'trainside' || view === 'podside') {
    // Track a train (or a pod) from beside it every frame: window.SIDE distance, window.UP height, window.BACK along.
    c0.cinematic = true;
    const V = g.camera.position.constructor;
    const [eye, look, at, ah] = [new V(), new V(), new V(), new V()];
    const line = g.services.get('aeroline');
    const lanes = g.services.get('skylanes');
    const clockOf = () => performance.now() / 1000;
    const t0 = clockOf();
    const tick = () => {
      if (view === 'trainside') {
        line.ride(window.N ?? 0, eye, look);
        // ride() gives a chase eye behind the train and a point ahead of its nose: the cars are in between.
        at.lerpVectors(eye, look, window.ALONG ?? 0.46);
        ah.copy(look).sub(eye).setY(0).normalize();
      } else {
        lanes.podAt(window.N ?? 3, window.__clock ? window.__clock() : clockOf() - t0 + 40, at, ah);
        ah.sub(at).setY(0).normalize();
      }
      const side = window.SIDE ?? (view === 'podside' ? 0.9 : 4);
      g.camera.position.set(
        at.x - ah.z * side - ah.x * (window.BACK ?? 0),
        at.y + (window.UP ?? 0.6),
        at.z + ah.x * side - ah.z * (window.BACK ?? 0),
      );
      g.camera.lookAt(at.x + ah.x * (window.LEAD ?? 0), at.y, at.z + ah.z * (window.LEAD ?? 0));
      c0.target.copy(at);
      requestAnimationFrame(tick);
    };
    tick();
    await wait(2500);
    return { draws: g.renderer.info.render.drawCalls };
  }
  if (view === 'pylon') {
    const [px, pz] = g.services.get('aeroline').pylons[window.N ?? 20];
    window.CX = px;
    window.CZ = pz;
  }
  const hubs = g.city.pulse.skylanes.hubs;
  const hub = hubs.find((h) => h.central) ?? hubs[0];
  const SPOTS = {
    pylon: [window.CX, window.CZ, 22, 0.15, 8],
    hub: [hub?.x ?? 256, hub?.z ?? 222, 70, 0.35, 40],
    station: [256, 159, 45, 0.3, 14],
    track: [200, 300, 30, 0.25, 12],
    lanes: [270, 240, 120, 0.5, 20],
  };
  const [cx, cz, near, pitch, aim] = SPOTS[view];
  const c = g.cameraCtl;
  c.cinematic = true;
  const yaw = window.YAW ?? 0.7;
  const d = window.NEAR ?? near;
  const p = window.PITCH ?? pitch;
  const at = { x: cx, y: window.AIM ?? aim, z: cz };
  c.target.set(at.x, at.y, at.z);
  g.camera.position.set(
    at.x + Math.sin(yaw) * Math.cos(p) * d,
    at.y + Math.sin(p) * d,
    at.z + Math.cos(yaw) * Math.cos(p) * d,
  );
  g.camera.lookAt(at.x, at.y, at.z);
  await wait(2500);
  return { hubs: hubs.length, hub: hub && [hub.x, hub.z], draws: g.renderer.info.render.drawCalls };
})();
