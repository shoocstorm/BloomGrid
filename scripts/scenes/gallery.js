// Opens the model gallery (modules/gallery) on one exhibit. `window.ID` = exhibit id (a building type is
// `b:<def id>`, e.g. `b:bloomtopia`; modules' own: `jet`, `ferry`, `train`, `drone`, `pod`, `cars`, `wonder:<id>`,
// `whales`, `dolphins`), `window.LEVEL` (0-based), `window.LIGHT` = day | dusk | night, `window.BARE = 1` hides the
// interface, `window.YAW` / `PITCH` / `ZOOM` pose the camera (turntable off). Use `--after 3000`.
(() => {
  const g = window.bloomgrid.services.get('gallery');
  g.open(window.ID, window.LEVEL ?? 0);
  const keys = [];
  if (window.LIGHT === 'dusk') keys.push('KeyL');
  if (window.LIGHT === 'night') keys.push('KeyL', 'KeyL');
  if (window.BARE) keys.push('KeyH');
  if (window.YAW !== undefined || window.PITCH !== undefined || window.ZOOM !== undefined) keys.push('Space');
  for (const code of keys) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const st = window.bloomgrid.services.get('render').stage;
  if (window.YAW !== undefined) st.yaw = window.YAW;
  if (window.PITCH !== undefined) st.pitch = window.PITCH;
  if (window.ZOOM !== undefined) st.zoom = window.ZOOM;
  return { open: g.isOpen };
})();
