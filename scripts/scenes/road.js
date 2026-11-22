// Smart highways and the mode banner (D-202): `bun run snap -- --path "/?scenario=fresh-island&nowizard" --eval @scripts/scenes/road.js --after 300`.
// Picks up the highway tool and hovers a spot a few tiles off the hamlet's road, so the shot shows the link preview,
// its tooltip and the banner. window.CLICK = 1 clicks there (lays the link); window.DRAG = 1 drags a road that ends
// just short of the road instead (it snaps on); window.REMOVE = 1 shows the Remove banner instead. The highway tool
// takes the full view (D-206); window.EXIT = 1 clicks the banner's Exit afterwards (the panels come back).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(800);
  const g = window.bloomgrid;
  const c = g.city;
  const G = c.grid;
  c.credits = Math.max(c.credits, 5000);
  // A free land tile 6 tiles off the road, beside the first road tile with open ground to its side.
  let spot = null;
  let near = null;
  for (let t = 0; t < G.road.length && !spot; t++) {
    if (!G.road[t]) continue;
    const x = t % G.w;
    const z = (t / G.w) | 0;
    for (const dz of [6, -6]) {
      let ok = true;
      for (let k = 1; k <= 6 && ok; k++) ok = c.canRoad(G.index(x, z + Math.sign(dz) * k));
      if (ok) {
        spot = { x, z: z + dz };
        near = { x, z: z + Math.sign(dz) * 2 };
        break;
      }
    }
  }
  g.cameraCtl.locate(spot.x, spot.z, { size: 36 });
  await wait(1800);
  g.services.get('build').open();
  g.tools.setActive(window.REMOVE ? 'bulldoze' : 'road');
  await wait(300);
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const screen = (x, z) => {
    const v = g.camera.position.clone().set(x + 0.5, G.heightAt(x + 0.5, z + 0.5), z + 0.5).project(g.camera);
    return { clientX: rect.left + ((v.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - v.y) / 2) * rect.height };
  };
  const ev = (type, at, buttons) =>
    canvas.dispatchEvent(new PointerEvent(type, { ...at, button: 0, buttons, pointerType: 'mouse', bubbles: true }));
  const n0 = c.roadCount;
  const far = { x: spot.x + 8, z: spot.z };
  if (window.DRAG) {
    ev('pointermove', screen(far.x, far.z), 0);
    await wait(100);
    ev('pointerdown', screen(far.x, far.z), 1);
    await wait(60);
    for (let i = 1; i <= 6; i++) {
      const p = { x: Math.round(far.x + ((near.x - far.x) * i) / 6), z: Math.round(far.z + ((near.z - far.z) * i) / 6) };
      ev('pointermove', screen(p.x, p.z), 1);
      await wait(60);
    }
    ev('pointerup', screen(near.x, near.z), 0);
  } else {
    ev('pointermove', screen(spot.x, spot.z), 0);
    await wait(200);
    if (window.CLICK) {
      ev('pointerdown', screen(spot.x, spot.z), 1);
      await wait(60);
      ev('pointerup', screen(spot.x, spot.z), 0);
    }
  }
  await wait(400);
  const shown = (sel) => {
    const el = document.querySelector(sel);
    return !!el && getComputedStyle(el).visibility !== 'hidden' && !el.classList.contains('hidden');
  };
  const panels = () => ({ maxed: document.body.classList.contains('view-max'), build: shown('.build.panel'), card: shown('.rightcol') });
  const during = panels();
  let after;
  if (window.EXIT) {
    document.querySelector('.mb-exit')?.click();
    await wait(400);
    after = panels();
  }
  return {
    during,
    after,
    tool: g.tools.active?.id,
    banner: document.querySelector('.mb-title')?.textContent,
    tooltip: document.querySelector('.tooltip:not(.hidden)')?.textContent,
    laid: c.roadCount - n0,
  };
})();
