// Districts (plan v5, Phase 26): `bun run snap -- --eval @scripts/scenes/districts.js --after 4000`.
// window.VIEW = 'map' (default: the City map on Approval) | 'inspect' (a home's inspector with its district card)
// | 'petition' | 'protest' | 'praise' (the happening card). window.SOUR = 'District name' sours one district first
// (default Westbrook) so the map shows a spread. Returns the districts' approval.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const city = bloomgrid.city;
  const approval = await import(
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => n.includes('/src/sim/approval.ts')) ?? '/src/sim/approval.ts'
  );
  const happenings = await import(
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => n.includes('/src/sim/happenings.ts')) ?? '/src/sim/happenings.ts'
  );
  const sour = window.SOUR ?? 'Westbrook';
  const view = window.VIEW ?? 'map';
  if (sour) {
    approval.setDistrictMood(city, sour, -35);
    const m = approval.moodOf(city, sour);
    m.approval = view === 'protest' ? 25 : 42;
    if (view === 'protest') m.lowFor = approval.APPROVAL.protestPulses;
  }
  if (view === 'praise') {
    const best = city.approval.view.districts
      .filter((d) => d.capacity > 0)
      .sort((a, b) => b.target - a.target)[0];
    if (best) approval.moodOf(city, best.key).highFor = approval.APPROVAL.praisePulses;
  }
  await wait(1200);
  if (['petition', 'protest', 'praise'].includes(view)) {
    city.happenings.current = null;
    if (!happenings.startHappening(city, view)) console.warn(`[districts] no ${view} now`);
  }
  if (view === 'map') bloomgrid.services.get('citymap').show('approval');
  if (view === 'inspect') {
    const home = city
      .buildingEntities()
      .find(
        (e) =>
          city.buildingDef(e).stats.population > 0 &&
          approval.districtKey(city, approval.districtIndexOf(city, e)) === sour,
      );
    if (home !== undefined) bloomgrid.bus.emit('selection:changed', { eid: home });
  }
  await wait(1000);
  return JSON.stringify(
    city.approval.view.districts
      .filter((d) => d.capacity > 0)
      .map((d) => [d.name, Math.round(city.approval.districts[d.key].approval)]),
  );
})();
