// City tour (D-145): starts the automatic flight round the island. `window.STOP = n` skips to stop n (0 = the
// opening overview), `window.WAIT` ms to let it fly (default 7000: arrival plus a little circling), `window.NIGHT = 1`,
// `window.PAUSE = 1` pauses there (the control strip shows). Use `--after 9000`. Returns the stop list and the pose.
(async () => {
  const g = window.bloomgrid;
  if (window.NIGHT) g.city.timeOfDay = 0.9;
  const x = g.services.get('explore');
  x.setMode('tour');
  const t = x.tour;
  for (let i = 0; i < (window.STOP ?? 0); i++) t.next();
  await new Promise((r) => setTimeout(r, window.WAIT ?? 7000));
  if (window.PAUSE && !t.paused) document.querySelector('.tour-ctl .tour-btn')?.click();
  const s = t.stops[t.index];
  const c = g.camera.position;
  return {
    stops: t.stops.map((s, i) => `${i} ${s.kind} ${s.title}`),
    at: `${t.index} ${s.kind} ${s.title} (${t.phase})`,
    camera: [c.x, c.y, c.z].map((v) => v.toFixed(1)).join(' '),
    draws: g.renderer.info.render.drawCalls,
  };
})();
