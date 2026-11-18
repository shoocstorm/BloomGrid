// Charters and eras (plan v5, Phase 28): `bun run snap -- --eval @scripts/scenes/charters.js --after 3000`.
// Takes up three charters (one part-way, one ready to claim), then opens Build → Goals on the era, legacy and charter
// cards. `window.CHAPTER = 1` opens the New Chapter dialog on Showcase with Water Crisis picked instead;
// `?scenario=debt-island` shows a challenge's objectives at the top of Goals. Returns the era and legacy.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  const g = bloomgrid;
  if (window.CHAPTER) {
    g.services.get('wizard').open();
    await wait(800);
    document.querySelector('.ch-path[data-path="showcase"]')?.click();
    await wait(200);
    document.querySelector('.ch-diff[data-mode="water-crisis"]')?.click();
    await wait(600);
    return 'chapter';
  }
  const city = g.city;
  city.steward.autoCrises = false;
  for (const id of ['carbon-zero', 'transit-city', 'ten-thousand-voices']) g.commands.execute('setCharter', { id, on: true });
  city.charters.acc['carbon-zero'] = 220;
  city.charters.reached['ten-thousand-voices'] = 1;
  city.charters.claimed['debt-free'] = 3;
  city.charters.reached['debt-free'] = 3;
  g.services.get('build').open();
  g.services.get('build').show('goals');
  await wait(2500);
  return JSON.stringify({ era: city.charters.era, active: city.charters.active });
})();
