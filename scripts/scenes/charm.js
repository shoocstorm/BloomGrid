// Little charms (D-175) on `?scenario=fresh-island&nowizard`: frames the hamlet close up, puts the island's cat on a
// roof, and (window.PET = n) pets it n times; window.PLANE = 1 sends a paper plane, window.CATCH = 1 catches it
// (the note); window.NIGHT = 1 sets the clock to night (the cat sleeps, homes float z's); window.ACT = 'groom' |
// 'look' | 'yawn' | 'stretch' | 'walk' | 'loaf' | 'butterfly' | 'leap' | 'twitchL' makes the cat do that and
// returns window.AT ms later (D-176); window.SAY = 'milestone' | any text makes it speak; window.PAN = 20 pans
// the camera that many tiles after the cat settles and reports how it followed (D-177). `--after 300` (or `--after 10` for an act's moment).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(800);
  const g = window.bloomgrid;
  const c = g.city;
  const homes = c.buildingEntities().filter((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(homes[Math.floor(homes.length / 2)]);
  if (window.NIGHT) c.timeOfDay = 0.95;
  g.cameraCtl.lookAt(r0.x + 2, r0.z + 2, window.NEAR ?? 34, true);
  await wait(1500);
  const charm = g.services.get('charm');
  charm.wander();
  await wait(900);
  const centre = () => {
    const r = document.querySelector('.ch-cat-in')?.getBoundingClientRect();
    return r ? Math.round(Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2)) : null;
  };
  let follow;
  if (window.PAN) {
    await wait(1500);
    const before = centre();
    const v = g.cameraCtl.getView();
    g.cameraCtl.lookAt(v.x + window.PAN, v.z + window.PAN * 0.4, window.NEAR ?? 34, true);
    await wait(window.AT ?? 4000);
    follow = { before, after: centre(), eid: charm.cat };
  }
  if (window.SAY) {
    await wait(800);
    charm.say(window.SAY);
    await wait(window.AT ?? 900);
  }
  if (window.ACT) {
    // Let it land and settle first, then the act.
    await wait(1200);
    charm.act(window.ACT);
    await wait(window.AT ?? 1000);
  }
  for (let i = 0; i < (window.PET ?? 0); i++) {
    document.querySelector('.ch-cat .ch-cat-in')?.click();
    await wait(i === (window.PET ?? 0) - 1 ? 350 : 1300);
  }
  if (window.PLANE) {
    charm.spawnPlane();
    await wait(window.CATCH ? 3500 : 4500);
    if (window.CATCH) {
      document.querySelector('.ch-plane')?.click();
      await wait(700);
    }
  }
  if (window.NIGHT) await wait(7000);
  return {
    cat: charm.cat,
    sleeping: !!document.querySelector('.ch-cat.sleep'),
    note: document.querySelector('.charm-note')?.innerText,
    plane: !!document.querySelector('.ch-plane'),
    zzz: document.querySelectorAll('.ch-zzz').length,
    rect: (({ left, top, width, height }) => [left, top, width, height].map(Math.round))(
      document.querySelector('.ch-cat-in')?.getBoundingClientRect() ?? {},
    ),
    cls: document.querySelector('.ch-cat')?.className,
    follow,
    talk: !document.querySelector('.ch-talk')?.classList.contains('hidden') && document.querySelector('.ch-talk')?.innerText,
  };
})();
