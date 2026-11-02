// Any building (D-082, D-100) at every level, side by side on an empty island (use `--path "/?scenario=empty"`):
// `window.HERO` = a building id (default the grove), left to right level 1, 2, 3; `window.VARIANT` shifts the lots
// so a multi-variant building shows another variant.
// `window.NEAR`, `window.YAW`, `window.PITCH`, `window.NIGHT`, `window.AGE` (0..1 weathering via age).
(async () => {
  const g = window.bloomgrid;
  const c = g.city;
  if (window.NIGHT) c.timeOfDay = 0.9;
  const id = window.HERO ?? 'supertree-grove';
  const grove = id === 'supertree-grove';
  // Lots whose procedural variant is window.VARIANT (variantFor in BuildingRenderer), so all three show one design.
  const { buildings } = await import('/src/content/index.ts');
  const def0 = buildings.get(id);
  // One finish for all three (`window.STYLE`), so only the level differs.
  const style0 = def0.style;
  def0.style = window.STYLE ?? def0.style ?? 'classic';
  const hash2 = (x, y, seed) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const variant = (x, z) => Math.floor(hash2(x, z, buildings.indexOf(id) + 1) * (def0.variants ?? 3));
  const want = (window.VARIANT ?? 0) % (def0.variants ?? 3);
  const fp = def0.footprint;
  const step = grove ? 12 : id === 'lotus-pavilion' ? 5 : Math.max(4, fp[0] + 2);
  // A dry, gentle stretch of ground near the middle for the three lots and their search rows.
  let [xb, zc] = [Math.round(c.size / 2) - step, Math.round(c.size / 2)];
  search: for (let r = 0; r < 200; r += 6)
    for (let a = 0; a < 16; a++) {
      const x = Math.round(c.size / 2 - step + Math.cos(a / 2.55) * r);
      const z = Math.round(c.size / 2 + Math.sin(a / 2.55) * r);
      const { min, max } = c.grid.rangeOver(x - 2, z - 2, step * 3 + 4, fp[1] + 24);
      if (min > 0.4 && max - min < 2.5) {
        [xb, zc] = [x, z];
        break search;
      }
    }
  const xs = [];
  const zs = [];
  for (let k = 0; k < 3; k++) {
    const x = xb + k * step;
    let z = zc;
    for (let dz = 0; dz < 40 && variant(x, zc + dz) !== want; dz++) z = zc + dz + 1;
    xs.push(x);
    zs.push(z);
  }
  // Added as a load (no rise animation), so the shot shows the finished buildings at once.
  const wasLoading = g.loading;
  g.loading = true;
  const eids = xs.map((x, tier) => c.addBuilding({ def: id, x, z: zs[tier], rot: 0, greenery: 1, occupancy: 1, tier }));
  g.loading = wasLoading;
  def0.style = style0;
  const x0 = xs[0];
  const z0 = zc;
  const def = c.buildingDef(eids[0]);
  const [cx, cz] = [(xs[0] + xs[2] + def.footprint[0]) / 2, (Math.min(...zs) + Math.max(...zs) + def.footprint[1]) / 2];
  window.__tallY = 0;
  // Frame the span and the tallest level (read back from what the renderer draws).
  const r = g.services.get('construction').renderer;
  const ground = c.grid.heightAt(cx, cz);
  let tall = 1;
  for (const p of r.snapshot(eids[2])) tall = Math.max(tall, p.matrix.elements[13] - ground);
  const span = xs[2] - xs[0] + fp[0];
  const near = window.NEAR ?? (grove ? 70 : Math.max(9, span * 0.9 + (Math.max(...zs) - Math.min(...zs)) * 0.5, tall * 1.9));
  g.cameraCtl.lookAt(cx, cz, near, true);
  g.cameraCtl.setView({ x: cx, z: cz, yaw: window.YAW ?? 0, pitch: window.PITCH ?? (grove ? 0.2 : 0.45), distance: near });
  const st = document.createElement('style');
  st.textContent = '.panel, .topbar, .hud, .toast, .rise-tags, .fa-stage, .moment, .ceremony, [class^="moment"], [class^="cer"] { display: none !important; }';
  document.head.appendChild(st);
  return { eids, xs, variant: want, cx, cz };
})();
