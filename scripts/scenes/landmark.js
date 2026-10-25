// Frames the Wellspring Spire at the island centre. `window.NEAR` = distance, `window.NIGHT` = night,
// `window.YAW` / `window.PITCH` = orbit angles, `window.CX` / `window.CZ` = focus tile (the hero avenue is around CX 290).
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const h = Math.round(c.size / 2);
  const cam = g.cameraCtl;
  const [cx, cz] = [window.CX ?? h, window.CZ ?? h];
  cam.lookAt(cx, cz, window.NEAR ?? 75, true);
  cam.setView({
    x: cx,
    z: cz + 4,
    yaw: window.YAW ?? Math.PI * 0.25,
    pitch: window.PITCH ?? 0.32,
    distance: window.NEAR ?? 75,
  });
  return { building: c.grid.occupant[c.grid.index(h, h)] };
})();
