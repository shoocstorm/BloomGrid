// Mobility drill: frames the first Pod Dock at morning rush hour so commuters, pods and sky-lanes
// show; `window.NIGHT = 1` for the night look, `window.LENS = 1` for the Traffic lens.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  const dock = c.buildingEntities().find((e) => c.buildingDef(e).id === 'pod-dock');
  const r = dock === undefined ? { x: c.size * 0.55, z: c.size * 0.65 } : c.buildingRecord(dock);
  const tod = window.NIGHT ? 0.9 : 0.33;
  const hold = () => (c.timeOfDay = tod);
  hold();
  [500, 2000, 4000].forEach((t) => setTimeout(hold, t));
  // Frame after the boot intro has finished moving the camera.
  const frame = () => g.cameraCtl.lookAt(r.x + 1, r.z + 1, window.NEAR ?? 34, true);
  frame();
  setTimeout(frame, 4000);
  if (window.LENS) setTimeout(() => g.services.get('overlays').set('traffic'), 4000);
  return { dock: r, flow: c.pulse.flow, routes: c.pulse.podRoutes.length };
})();
