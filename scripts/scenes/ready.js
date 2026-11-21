// Ready call-out and replays (D-181) on `?scenario=fresh-island&nowizard` (`--after 9000`): builds a Data Spire
// beside the hamlet and tops up credits, so "Wake Flora" turns ready and its call-out drops in. `window.GO = 1`
// presses the call-out's button; `window.REPLAY = '<film id>'` (e.g. 'project:cat') unlocks what it needs and plays
// that film again; `window.GOALS = 1` opens Build → Goals instead. Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const defs = (await import('/src/content/index.ts')).buildings;
  const homes = c.buildingEntities().filter((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(homes[0]);
  g.cameraCtl.lookAt(r0.x + 4, r0.z + 4, 70, true);
  let built = false;
  for (let dz = -16; dz <= 16 && !built; dz++)
    for (let dx = -22; dx <= 22 && !built; dx++)
      if (c.checkPlacement(defs.get('data-spire'), r0.x + dx, r0.z + dz, 0).ok)
        built = g.commands.execute('build', { def: 'data-spire', x: r0.x + dx, z: r0.z + dz, rot: 0 }, false);
  c.credits = Math.max(c.credits, 4000);
  if (window.REPLAY) {
    const id = String(window.REPLAY).replace(/^project:/, '');
    if (!c.growth.unlocked.includes(id)) c.growth.unlocked.push(id);
    await wait(500);
    g.services.get('moments').replay(window.REPLAY);
    await wait(window.AT ?? 6000);
    return { films: g.services.get('moments').films().map((f) => f.id) };
  }
  await wait(4500);
  if (window.GOALS) {
    const b = g.services.get('build');
    b.open();
    b.show('goals');
    await wait(1200);
  }
  if (window.GO) {
    document.querySelector('.rc-go')?.click();
    await wait(800);
  }
  return {
    built,
    callout: document.querySelector('.rc:not(.hidden)')?.innerText,
    fab: document.body.classList.contains('project-ready'),
    films: g.services.get('moments').films().map((f) => f.id),
  };
})();
