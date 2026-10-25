// Flora-Net drill: frames the Drone Hive and dispatches a mist next to it. `window.NIGHT = 1` for
// night, `window.LENS = 'hydration' | 'nutrients'` for a soil lens, `window.NEAR` for distance.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = Math.max(c.credits, 5000);
  const hive = c.buildingEntities().find((e) => c.buildingDef(e).id === 'flora-hive');
  const r = hive === undefined ? { x: c.size * 0.55, z: c.size * 0.65 } : c.buildingRecord(hive);
  const tod = window.NIGHT ? 0.9 : 0.4;
  const hold = () => (c.timeOfDay = tod);
  const frame = () => g.cameraCtl.lookAt(r.x + 1, r.z + 1, window.NEAR ?? 22, true);
  hold();
  frame();
  [500, 2000, 4000].forEach((t) => setTimeout(hold, t));
  setTimeout(frame, 4000);
  setTimeout(() => g.commands.execute('mist', { x: r.x + 6, z: r.z + 4 }), 5500);
  if (window.LENS) setTimeout(() => g.services.get('overlays').set(window.LENS), 4000);
  return { hive: r, drones: c.pulse.drones.length, soil: c.pulse.soilHealth };
})();
