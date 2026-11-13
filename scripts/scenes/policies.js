// Policies (plan v5, Phase 25): `bun run snap -- --eval @scripts/scenes/policies.js --after 3000`.
// Opens City Pulse on the Policies tab and enacts two ordinances (window.ENACT = 'id,id' to choose; '' for none);
// window.SCROLL = px scrolls the tab (budgets are below the cards). Returns the active policies and budgets.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const ids = (window.ENACT ?? 'four-day-week,rainwater-code').split(',').filter(Boolean);
  for (const id of ids) bloomgrid.commands.execute('setPolicy', { id, on: true });
  bloomgrid.commands.execute('setBudget', { sector: 'ecology', value: 0.8 });
  bloomgrid.services.get('pulse').show('policies');
  await wait(900);
  const pane = document.querySelector('.p-policies');
  if (window.SCROLL && pane) pane.scrollTop = window.SCROLL;
  await wait(300);
  const p = bloomgrid.city.policies;
  return JSON.stringify({
    active: Object.keys(p.active),
    budget: p.budget,
    business: p.businessRate,
    cost: bloomgrid.city.stats.policyCost,
  });
})();
