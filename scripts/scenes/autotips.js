// Auto-collect tips (D-205) on `?scenario=fresh-island&nowizard`: frames the hamlet, floats a shower of three tip
// bubbles and lets them collect themselves (rings fill, then each pops with coins and a combo). `window.AT` = ms to
// wait before the shot (default 2000: rings filling; 4200: mid-pops), `window.SHOT = 1` returns there so the shot shows it. Returns the credits gained and the combo seen.
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  const toasts = [];
  g.bus.on('toast', (t) => toasts.push(t.text));
  const homes = c.buildingEntities().filter((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(homes[0]);
  g.engine.speed = 1;
  g.cameraCtl.lookAt(r0.x + 4, r0.z + 4, window.NEAR ?? 55, true);
  await wait(1500);
  const juice = g.services.get('juice');
  juice.tips = true;
  const before = c.credits;
  const tips0 = c.growth.tips;
  const combos = [];
  g.bus.on('juice', (e) => e.sound === 'tip' && combos.push((e.step ?? 0) + 1));
  for (let i = 0; i < 3; i++) {
    juice.spawnTip();
    await wait(350);
  }
  await wait(window.AT ?? 2000);
  const shot = { tipJar: juice.tipJar, told: toasts.some((t) => t.startsWith('Tip jar')), rings: document.querySelectorAll('.jc-bubble.auto:not(.popped)').length };
  if (window.SHOT) return shot;
  await wait(5000);
  return { ...shot, popped: c.growth.tips - tips0, gained: Math.round(c.credits - before), combos };
})();
