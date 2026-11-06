// Juice drill (D-118) on `?scenario=fresh-island&nowizard`: frames the hamlet, floats tip bubbles, places a home
// (its ready burst), and makes the next milestone claimable. `window.POP = 1` pops a bubble mid-capture (coins,
// quote, combo); `window.CLAIM = 1` claims the milestone (confetti, coins). Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const homes = c.buildingEntities().filter((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(homes[0]);
  g.engine.speed = 1;
  g.cameraCtl.lookAt(r0.x + 4, r0.z + 4, window.NEAR ?? 55, true);
  await wait(600);
  const juice = g.services.get('juice');
  const tips = [juice.spawnTip(), juice.spawnTip(), juice.spawnTip()].filter(Boolean).length;
  const def = 'garden-residence';
  const defs = (await import('/src/content/index.ts')).buildings;
  let built = false;
  for (let dz = -14; dz <= 14 && !built; dz++)
    for (let dx = -20; dx <= 20 && !built; dx++) {
      const x = r0.x + dx,
        z = r0.z + dz;
      if (c.checkPlacement(defs.get(def), x, z, 0).ok)
        built = g.commands.execute('build', { def, x, z, rot: 0 });
    }
  c.credits = Math.max(c.credits, 3100);
  await wait(window.POP || window.CLAIM ? 2600 : 3000);
  if (window.POP) document.querySelector('.jc-bubble')?.click();
  if (window.POP) setTimeout(() => document.querySelectorAll('.jc-bubble:not(.popped)')[0]?.click(), 500);
  if (window.CLAIM) document.querySelector('.jc-claim')?.click();
  await wait(window.POP || window.CLAIM ? 450 : 0);
  return {
    tips,
    built,
    bubbles: document.querySelectorAll('.jc-bubble').length,
    card: document.querySelector('.jc-m')?.className,
    credits: Math.round(c.credits),
    ms: c.growth.milestones,
  };
})();
