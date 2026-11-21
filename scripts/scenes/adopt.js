// "The Stray" (D-178) on `?scenario=fresh-island&nowizard`: frames the hamlet (the stray on a roof), then plays the
// adoption cutscene and returns window.T ms into it (default 9000), for a screenshot of that beat. window.STRAY = 1
// only frames the stray (no cutscene). `--after 10`.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(800);
  const g = window.bloomgrid;
  const c = g.city;
  while (g.services.tryGet('moments')?.playing) await wait(300);
  const homes = c.buildingEntities().filter((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(homes[Math.floor(homes.length / 2)]);
  g.cameraCtl.lookAt(r0.x + 2, r0.z + 2, window.NEAR ?? 24, true);
  await wait(1200);
  const charm = g.services.get('charm');
  // A stray visits on its own schedule (about a minute after founding); bring it in now.
  g.services.get('charm').wander();
  await wait(1200);
  if (window.STRAY) {
    document.querySelector('.ch-cat .ch-cat-in')?.click();
    await wait(700);
    const r = document.querySelector('.ch-cat-in')?.getBoundingClientRect();
    return { stray: !!document.querySelector('.ch-cat.stray'), talk: document.querySelector('.ch-talk:not(.hidden)')?.innerText, rect: r && [r.left, r.top].map(Math.round) };
  }
  // As finishing "Befriend the stray" does: unlock first, so the cat is the steward's after the film.
  if (!c.growth.unlocked.includes('cat')) c.growth.unlocked.push('cat');
  charm.cutscene();
  await wait(window.T ?? 9000);
  return {
    on: !!document.querySelector('.reel.sx'),
    cap: document.querySelector('.reel-cap')?.textContent,
    stage: !!window.bloomgrid.services.get('render').stage,
  };
})();
