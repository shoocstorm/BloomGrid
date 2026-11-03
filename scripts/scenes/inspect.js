// Building inspector (Hud.select): `bun run snap -- --eval @scripts/scenes/inspect.js --after 6000`.
// window.DEF = a building id ('solar-spire'), or window.PICK = 'bad' (the worst-off building, default) | 'home' |
// 'work' | 'power' (`--path "/?pick=home"` works too). Add `--mobile` for the phone sheet. Returns the inspector's text.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const g = window.bloomgrid;
  const c = g.city;
  const ents = [...c.buildingEntities()];
  const def = (e) => c.buildingDef(e);
  const q = new URLSearchParams(location.search);
  const pick = window.PICK ?? q.get('pick') ?? 'bad';
  window.DEF ??= q.get('def') ?? undefined;
  const want = window.DEF
    ? (e) => def(e).id === window.DEF
    : pick === 'home'
      ? (e) => def(e).stats.population > 0
      : pick === 'work'
        ? (e) => def(e).stats.jobs > 0 && def(e).stats.population === 0
        : pick === 'power'
          ? (e) => def(e).stats.energy > 0
          : () => true;
  const { Service } = await import(
    performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/src/ecs/components.ts')) ?? '/src/ecs/components.ts'
  );
  const score = (e) => (pick === 'bad' ? Service.problems[e] * 4 + (1 - Service.condition[e]) : Service.occupancy[e]);
  const eid = ents.filter(want).sort((a, b) => score(b) - score(a))[0];
  g.bus.emit('selection:changed', { eid });
  await wait(1200);
  // `scroll=1`: the phone sheet scrolled to its consumes / produces.
  if (q.get('scroll')) document.querySelector('.info .ix-flows')?.scrollIntoView({ block: 'center' });
  await wait(200);
  return document.querySelector('.info')?.innerText;
})();
