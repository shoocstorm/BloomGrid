// The Archipelago (plan v8): `bun run snap -- --eval @scripts/scenes/archipelago.js --after 6000` (showcase).
// `window.VIEW = 'chart'` (default) opens the chart on `window.ID` (drift | concord | lantern | kestrel) with a couple
// of agreements signed and one neighbour struck by a storm; `'dispatch'` puts an envoy on the table instead
// (`window.KIND` = aid | families | request | offer | rival | loan | dive, from `window.ID`; `window.TAKE = 1` takes the
// first choice, which for a rival bid shows the goal). `window.HORIZON = 1` frames the neighbours far out at sea
// (Phase 39). Returns a digest of the state.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  const g = bloomgrid;
  const city = g.city;
  city.steward.autoCrises = false;
  city.archipelago.auto = false;
  g.services.get('moments').mode = 'off';
  const app = (path) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(path)) ?? path);
  const A = await app('/src/sim/archipelago.ts');
  while (!city.archipelago.neighbours.every((n) => n.met)) await wait(200);
  const id = window.ID ?? 'drift';
  const view = window.VIEW ?? 'chart';
  if (view === 'chart') {
    g.commands.execute('signTrade', { partner: 'drift', good: 'energy', dir: 'export', size: 1 });
    g.commands.execute('signTrade', { partner: 'kestrel', good: 'water', dir: 'import', size: 2 });
    g.commands.execute('signTrade', { partner: 'concord', good: 'food', dir: 'export', size: 0 });
    const n = A.neighbour(city, 'lantern');
    n.crisis = 'storm';
    n.crisisUntil = city.tick + 900;
    A.neighbour(city, 'drift').relation = 62;
    A.neighbour(city, 'concord').relation = -22;
    await wait(1500);
    g.services.get('archipelago').toggle(true, id);
    await wait(1200);
  } else if (view === 'dispatch') {
    const kind = window.KIND ?? 'families';
    const n = A.neighbour(city, id);
    if (kind === 'aid' || kind === 'families') {
      n.crisis = 'storm';
      n.crisisUntil = city.tick + 900;
    }
    if (kind === 'offer' || kind === 'loan') n.relation = 60;
    const d = A.startDispatch(city, kind, kind === 'rival' ? 'kestrel' : kind === 'loan' ? 'concord' : kind === 'dive' ? 'lantern' : id);
    if (window.TAKE && d) g.commands.execute('answerDispatch', { id: d.id, choice: 0 }, false);
    await wait(1500);
  }
  if (window.HORIZON) {
    // From the north-west, looking out past the south-east coast: the flotilla, Kestrel Cay to the right.
    if (window.NIGHT) city.timeOfDay = 0.95;
    g.cameraCtl.setView({ x: window.CX ?? 330, z: window.CZ ?? 330, distance: window.DIST ?? 420, yaw: window.YAW ?? -2.35, pitch: window.PITCH ?? 0.32 });
    await wait(2500);
  }
  const st = city.archipelago;
  return JSON.stringify({
    trades: st.trades.map((t) => `${t.partner} ${t.dir} ${t.good} ${t.moved.toFixed(0)}/${t.amount} ${t.credits.toFixed(2)}`),
    dispatch: st.dispatch && { kind: st.dispatch.kind, from: st.dispatch.from, status: st.dispatch.status },
    trade: city.stats.trade.toFixed(2),
  });
})();
