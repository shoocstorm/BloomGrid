// Bloom Retrofit drill: digs a filtration channel, then transforms the downtown district.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = 1e6;
  const x = Math.round(c.size * 0.55), z = Math.round(c.size * 0.645);
  const tiles = [];
  for (let i = -10; i <= 10; i++) tiles.push(c.grid.index(x + i, z + 6));
  g.commands.execute('channel', { tiles });
  g.cameraCtl.lookAt(x, z, 48, true);
  setTimeout(() => g.commands.execute('retrofit', { x, z, radius: 14 }), 1500);
  return { x, z };
})();
