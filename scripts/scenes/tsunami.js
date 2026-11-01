// Tsunami drill (D-076): forecasts a tsunami with no warning and frames it (HUD hidden). Evaluated by
// scripts/snap.mjs; `window.WAIT` = seconds before framing.
window.KIND = 'tsunami';
window.WAIT = window.WAIT ?? 12;
(async () => {
  const g = window.bloomgrid,
    c = g.city;
  const url = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .find((n) => n.includes('/src/sim/crises.ts'));
  const { forecastCrisis } = await import(url);
  const cr = forecastCrisis(c, window.KIND || 'tornado', 1.1, window.LEAD ?? 0);
  await new Promise((r) => setTimeout(r, (window.WAIT ?? 4) * 1000));
  const x = cr.x ?? 256,
    z = cr.z ?? 256;
  document.getElementById('hud').style.visibility = 'hidden';
  if ((window.KIND || 'tornado') === 'tornado')
    g.cameraCtl.setView({ x: x + 25, z: z + 10, yaw: 0.6, pitch: 0.12, distance: 110 });
  else g.cameraCtl.setView({ x: 256, z: 300, yaw: 0.2, pitch: 0.6, distance: 260 });
  await new Promise((r) => setTimeout(r, 2500));
  return { phase: cr.phase, x: cr.x, z: cr.z, hits: cr.hits ?? 0, flood: c.steward.modifiers.floodLevel };
})();
