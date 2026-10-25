// Frames the Wellspring Spire at the island centre. `window.NEAR` = distance, `window.NIGHT` = night,
// `window.YAW` / `window.PITCH` = orbit angles.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const h = Math.round(c.size / 2);
  const cam = g.cameraCtl;
  cam.lookAt(h, h, window.NEAR ?? 75, true);
  cam.setView({
    x: h,
    z: h + 4,
    yaw: window.YAW ?? Math.PI * 0.25,
    pitch: window.PITCH ?? 0.32,
    distance: window.NEAR ?? 75,
  });
  return { building: c.grid.occupant[c.grid.index(h, h)] };
})();
