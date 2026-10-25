// Night-life drill: night over downtown with a Bloom Retrofit wave (courtyard waterfalls), so the
// glow of flowers, fungi paths, guidelines and canopies can be compared with quieter districts.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = 1e6;
  const x = Math.round(c.size * 0.55), z = Math.round(c.size * 0.645);
  g.commands.execute('retrofit', { x, z, radius: 12 });
  g.cameraCtl.lookAt(x + 4, z + 6, window.NEAR ?? 30, true);
  // Hold the clock at night (boot may still reset it); pause once the fields have been computed.
  const night = () => (c.timeOfDay = 0.92);
  night();
  [500, 2000, 4000, 6500].forEach((t) => setTimeout(night, t));
  setTimeout(() => (g.engine.speed = 0), 6500);
  return { x, z, nightlife: c.pulse.nightlife };
})();
