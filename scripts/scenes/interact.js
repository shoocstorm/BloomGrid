// Hands-on buildings (D-132): walks the steward up to the Mycelium Work Dome, opens its sliding doors (E), walks
// inside and (with `window.DARK = 1`) switches its lights off (L). Use on `--path "/?scenario=empty&nowizard"` with
// `--after 9000`. `window.NIGHT = 1` for a night view, `window.FP = 1` for first person, `window.STAY = 1` stops at the
// door (card and open doors from outside), `window.WALK` = seconds walked in (default 2.2).
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const [x, z] = [Math.round(c.size / 2) - 14, Math.round(c.size / 2)];
  c.addBuilding({ def: 'greenhouse-hub', x, z, rot: 0, greenery: 1, occupancy: 1 });
  const tiles = [];
  for (let tx = x - 2; tx < x + 5; tx++) tiles.push((z + 3) * c.size + tx);
  g.commands.execute('road', { tiles }, false);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code }));
  await wait(300);
  // Face north (-z): the city camera's yaw + π is the walker's yaw.
  g.cameraCtl.setView({ x: x + 1.5, z: z + 4, yaw: Math.PI, pitch: 0.4, distance: 10 });
  g.cameraCtl.yaw = Math.PI;
  const ex = g.services.get('explore');
  ex.setMode('walk');
  ex.position.set(x + 1.5, ex.position.y, z + 3.45);
  await wait(600);
  key('KeyE');
  key('KeyE', 'keyup');
  await wait(900);
  const card = document.querySelector('.ia-card');
  const out = { cardShown: !card.classList.contains('hidden'), cardText: card.textContent, door: g.services.get('construction').renderer.doorsOf(c.buildingAt(x, z))?.open };
  if (!window.STAY) {
    key('KeyW');
    await wait((window.WALK ?? 2.2) * 1000);
    key('KeyW', 'keyup');
  }
  if (window.FP) key('KeyV');
  if (window.DARK) {
    await wait(300);
    key('KeyL');
    key('KeyL', 'keyup');
  }
  await wait(800);
  out.pos = [ex.position.x - x, ex.position.y, ex.position.z - z].map((v) => +v.toFixed(2));
  out.lights = g.services.get('construction').renderer.lightsOn(c.buildingAt(x, z));
  return out;
})();
