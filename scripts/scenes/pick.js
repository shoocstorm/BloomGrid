// Forgiving picking (D-129): clicks with real pointer events on (1) the upper floors of the tallest building in
// view, (2) a bridge's structure well above its deck and (3) the ground just beside a building, and returns what
// each selected (the inspector's title). `window.NEAR` = camera distance (default 40).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.bloomgrid;
  const c = g.city;
  const r = g.services.get('construction').renderer;
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const screen = (x, y, z) => {
    const v = g.camera.position.clone().set(x, y, z).project(g.camera);
    return {
      clientX: rect.left + ((v.x + 1) / 2) * rect.width,
      clientY: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  };
  const click = async (x, y, z) => {
    const at = screen(x, y, z);
    for (const type of ['pointermove', 'pointerdown', 'pointerup'])
      canvas.dispatchEvent(
        new PointerEvent(type, {
          ...at,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          pointerType: 'mouse',
          bubbles: true,
        }),
      );
    await wait(600);
    return document.querySelector('.info:not(.hidden) h3')?.textContent ?? '(nothing)';
  };
  const out = {};
  const near = window.NEAR ?? 40;

  // 1. A tall building: click 80% up its height, at its centre.
  const tall = [...c.buildingEntities()]
    .map((e) => ({ e, v: r.verticalExtent(e) }))
    .filter((o) => o.v)
    .sort((a, b) => b.v.y1 - b.v.y0 - (a.v.y1 - a.v.y0))[window.RANK ?? 12];
  {
    const rec = c.buildingRecord(tall.e);
    const [w, d] = c.footprint(c.buildingDef(tall.e), rec.rot);
    // From high above, so nothing stands in front of it (the nearest object along the ray wins).
    g.cameraCtl.setView({
      x: rec.x + w / 2,
      z: rec.z + d / 2,
      yaw: 0.6,
      pitch: window.PITCH ?? 1.15,
      distance: near * 2,
    });
    await wait(1200);
    const y = tall.v.y0 + (tall.v.y1 - tall.v.y0) * 0.8;
    out.tower = { want: c.buildingDef(tall.e).name, got: await click(rec.x + w / 2, y, rec.z + d / 2) };
    // 3. Beside it: half a tile off its footprint edge, at ground level.
    const gx = rec.x - 0.4;
    out.beside = {
      want: c.buildingDef(tall.e).name,
      got: await click(gx, c.grid.heightAt(gx, rec.z + d / 2), rec.z + d / 2),
    };
  }

  // 2. A bridge: its middle, 3 tiles above the deck (arch, cables or towers).
  const b = [...c.bridges].sort((a, b) => b.len - a.len)[2];
  {
    const [x, z] = b.alongX ? [b.x + b.len / 2, b.z + 0.5] : [b.x + 0.5, b.z + b.len / 2];
    g.cameraCtl.setView({
      x,
      z,
      yaw: b.alongX ? 0.4 : Math.PI / 2 + 0.4,
      pitch: window.PITCH ?? 1.15,
      distance: near * 2,
    });
    await wait(1200);
    out.bridge = { want: b.name, got: await click(x, 0.9 + 3, z) };
    out.bridgeDeckEdge = {
      want: b.name,
      got: await click(b.alongX ? x : x + 0.9, 0.95, b.alongX ? z + 0.9 : z),
    };
  }
  return out;
})();
