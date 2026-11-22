// The time-lapse "The Island Remembers" (plan v6, D-219), `--after 6000`. Plays it and freezes `window.AT` ms in (the
// reel clock, the 3D stage and CSS animations), so the capture shows that exact moment.
//
// `window.FAKE = 1` first writes a made-up past into the history ledger (scene preview only): every building and
// highway born by its distance from the island's middle over `window.DAYS` days (default 12), a few marks and samples,
// so the showcase city (all founding content) replays as a growing city. Without it, the city's real ledger is used.
// `window.PROMO = 'goals' | 'invite' | 'map'` shows how the film is promoted instead of playing it.
// `window.FPS = 1` also reports frames per second over the two seconds before the freeze.
// `window.SKIP = 1` skips the film after the freeze point to check that the veil lifts (returns the counts after).
// Evaluated by scripts/snap.mjs.
(async () => {
  const g = window.bloomgrid;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/modules/moments/reel.ts'));
  const clocks = [g.services.get('moments').clock, ...(await Promise.all(urls.map(async (u) => (await import(u)).reelClock)))];
  const city = g.city;
  const con = g.services.get('construction');
  if (window.FAKE) {
    const h = city.history;
    const days = window.DAYS ?? 12;
    const span = days * 360 * 10;
    const cx = city.size / 2;
    const cz = city.size / 2;
    const far = city.size * 0.62;
    const rnd = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const when = (x, z, i) => Math.max(1, Math.round(span * Math.min(0.98, (Math.hypot(x - cx, z - cz) / far) ** 1.3 * 0.9 + rnd(i) * 0.1)));
    h.born.clear();
    h.roads.clear();
    for (const eid of city.buildingEntities()) {
      const r = city.buildingRecord(eid);
      // A ring round the middle stays founding content (the hamlet the island started from).
      if (Math.hypot(r.x - cx, r.z - cz) < 26) continue;
      h.born.set(r.uid, when(r.x, r.z, r.uid));
    }
    for (const t of city.roadTiles()) {
      const x = t % city.grid.w;
      const z = (t / city.grid.w) | 0;
      if (Math.hypot(x - cx, z - cz) < 30) continue;
      h.roads.set(t, Math.max(1, when(x, z, t) - 40));
    }
    // Levels: buildings above level 1 rose at level 1 and levelled up a while after.
    h.tiers = [];
    h.gone = [];
    let n = 0;
    for (const eid of city.buildingEntities()) {
      const r = city.buildingRecord(eid);
      const born = h.born.get(r.uid);
      if (!born) continue;
      if (r.tier > 0) h.tiers.push([r.uid, Math.min(span - 10, born + Math.round(span * 0.12)), r.tier]);
      // Every 25th dated building replaced an older one on its lot: the old one stands, then folds away.
      if (n++ % 25 === 0 && born > span * 0.3) h.gone.push([r.uid + 100000, r.def, r.x, r.z, r.rot, 0, Math.round(born * 0.4), born - 60]);
    }
    h.tiers.sort((a, b) => a[1] - b[1]);
    // A monsoon with a place, for its flare.
    city.steward.history.push({ id: 9999, kind: 'monsoon', name: 'Monsoon', icon: 'rain', startTick: Math.round(span * 0.5), endTick: Math.round(span * 0.52), severity: 1, district: 'Westbrook', x: 150, z: 270, hits: 3, lost: 0, fires: 0, displaced: 0, cost: 0, outcome: 'weathered', objects: [] });
    h.marks = [
      [Math.round(span * 0.18), 'era', 'grove'],
      [Math.round(span * 0.36), 'wonder', 'lotus'],
      [Math.round(span * 0.6), 'era', 'canopy'],
      [Math.round(span * 0.85), 'era', 'bloom'],
    ];
    h.samples = Array.from({ length: 40 }, (_, i) => {
      const k = i / 39;
      return [Math.round(span * k), 1 + Math.floor(days * k), Math.round(city.stats.population * k ** 1.6), 0, 60, 0];
    });
    city.tick = Math.max(city.tick, span);
    city.day = Math.max(city.day, days + 1);
  }
  // `window.PROMO = 'goals'` opens Build → Goals on the featured card; `'invite'` waits for the invitation
  // (`--after 3000`: it settles 8 s after boot). Neither plays the film.
  if (window.PROMO) {
    // The showcase queues a run of ceremonies after boot (the invitation rightly waits them out): off for the preview.
    g.services.get('moments').mode = 'off';
    if (window.PROMO === 'map') {
      // The City map's history slider, dragged back to `window.BACK` (0..1000, default 400).
      g.services.get('citymap').toggle(true);
      await wait(600);
      const r = document.querySelector('.cmap-hist-range');
      if (r) {
        r.value = String(window.BACK ?? 400);
        r.dispatchEvent(new Event('input'));
      }
      await wait(900);
      return { hist: !!document.querySelector('.cmap-hist:not(.hidden)'), day: document.querySelector('.cmap-hist-day')?.textContent };
    }
    if (window.PROMO === 'goals') {
      g.services.get('build').open();
      g.services.get('build').show('goals');
      await wait(1500);
    } else {
      // Showcase ceremonies queue up after boot; the invitation steps aside for them and comes back.
      const clear = () => document.querySelector('.tli:not(.hidden)') && !g.services.get('moments').playing;
      for (let i = 0; i < 80 && !clear(); i++) await wait(500);
      await wait(900);
    }
    for (const a of document.getAnimations()) a.pause();
    const tl = g.services.get('timelapse');
    return { earned: tl.earned(), isNew: tl.isNew, unseen: tl.unseen, feature: !!document.querySelector('.tlf'), invite: !!document.querySelector('.tli:not(.hidden)'), line: document.querySelector('.tli-line')?.textContent, day: city.day };
  }
  const t0 = performance.now();
  g.services.get('timelapse').play();
  let fps;
  if (window.FPS) {
    // Frames drawn over two seconds just before the freeze point (playback cost while things rise).
    await wait((window.AT ?? 9000) - 2000 - (performance.now() - t0));
    const f0 = g.engine.frames;
    const p0 = performance.now();
    await wait(2000);
    fps = Math.round(((g.engine.frames - f0) * 1000) / (performance.now() - p0));
  }
  await wait((window.AT ?? 9000) - (performance.now() - t0));
  for (const c of clocks) c.held = true;
  for (const a of document.getAnimations()) a.pause();
  const out = {
    stages: document.querySelector('.reel')?.className,
    caption: document.querySelector('.reel-cap')?.textContent,
    day: document.querySelector('.tl-dnum')?.textContent,
    veiledBuildings: con.renderer.veiledCount,
    veiledRoads: con.roads.veiledCount,
    standing: con.renderer.count,
    drawCalls: g.renderer.info.render.drawCalls,
    fps,
  };
  Object.assign(out, g.services.get('timelapse').stats());
  if (window.SKIP) {
    for (const c of clocks) c.held = false;
    for (const a of document.getAnimations()) a.play();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await wait(2500);
    out.after = { veiledBuildings: con.renderer.veiledCount, veiledRoads: con.roads.veiledCount, standing: con.renderer.count, buildings: city.buildingEntities().length, reel: !!document.querySelector('.reel') };
  }
  return out;
})();
