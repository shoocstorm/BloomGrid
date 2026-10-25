// Explore drill: enters an explore mode near the downtown Pod Dock and walks forward briefly.
// `window.MODE = 'walk' | 'board' | 'drone' | 'follow'`, `window.PHOTO = 1` for photo mode,
// `window.NIGHT = 1` for night.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  const dock = c.buildingEntities().find((e) => c.buildingDef(e).id === 'pod-dock');
  const r = c.buildingRecord(dock);
  const set = () => (c.timeOfDay = window.NIGHT ? 0.9 : 0.4);
  set();
  [1500, 3000].forEach((t) => setTimeout(set, t));
  g.cameraCtl.lookAt(r.x + 3, r.z + 3, 30, true);
  setTimeout(() => {
    g.services.get('explore').setMode(window.MODE ?? 'walk');
    if (window.MODE !== 'follow') {
      g.input.keys.add('KeyW');
      setTimeout(() => g.input.keys.delete('KeyW'), 1200);
    }
    if (window.PHOTO) setTimeout(() => g.services.get('explore').setPhoto(true), 1800);
  }, 3500);
  return { dock: [r.x, r.z] };
})();
