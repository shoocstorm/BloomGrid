// Procedural heroes (D-082) at every level, side by side on an empty island (use `--path "/?scenario=empty"`):
// `window.HERO` = 'supertree-grove' | 'lotus-pavilion' (default the grove), left to right level 1, 2, 3.
// `window.NEAR`, `window.YAW`, `window.PITCH`, `window.NIGHT`, `window.AGE` (0..1 weathering via age).
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const id = window.HERO ?? 'supertree-grove';
  const grove = id === 'supertree-grove';
  const step = grove ? 12 : 5;
  const [x0, z0] = [Math.round(c.size / 2) - step, Math.round(c.size / 2)];
  const eids = [];
  for (let tier = 0; tier < 3; tier++) {
    const eid = c.addBuilding({ def: id, x: x0 + tier * step, z: z0, rot: 0, greenery: 1, occupancy: 1, tier });
    eids.push(eid);
  }
  const def = c.buildingDef(eids[0]);
  const [cx, cz] = [x0 + step + def.footprint[0] / 2, z0 + def.footprint[1] / 2];
  const near = window.NEAR ?? (grove ? 70 : 22);
  g.cameraCtl.lookAt(cx, cz, near, true);
  g.cameraCtl.setView({ x: cx, z: cz, yaw: window.YAW ?? 0, pitch: window.PITCH ?? (grove ? 0.2 : 0.45), distance: near });
  const st = document.createElement('style');
  st.textContent = '.panel, .topbar, .hud, .toast { display: none !important; }';
  document.head.appendChild(st);
  return { eids, cx, cz };
})();
