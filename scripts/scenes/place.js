// One placement, then out (D-174): `bun run snap -- --path "/?scenario=fresh-island&nowizard" --eval @scripts/scenes/place.js --after 300`.
// Picks up a building (window.DEF, default garden-residence) and places it with real pointer clicks on a free lot
// near the hamlet. window.SHIFT = 1 holds Shift (stays in hand); window.KEEP = 1 turns on "Keep placing" first;
// window.AGAIN = 1 clicks the "Another …" pill afterwards. Returns build mode's state after each step.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(800);
  const g = window.bloomgrid;
  const c = g.city;
  const def = window.DEF ?? 'garden-residence';
  const defs = (await import('/src/content/index.ts')).buildings;
  const home = c.buildingEntities().find((e) => c.buildingDef(e).category === 'residential');
  const r0 = c.buildingRecord(home);
  c.credits = Math.max(c.credits, 5000);
  // Free lots near the first home.
  const lots = [];
  for (let dz = -12; dz <= 12 && lots.length < 2; dz += 3)
    for (let dx = -16; dx <= 16 && lots.length < 2; dx += 3) {
      const [x, z] = [r0.x + dx, r0.z + dz];
      if (c.checkPlacement(defs.get(def), x, z, 0).ok && !lots.some((l) => Math.abs(l.x - x) < 4 && Math.abs(l.z - z) < 4)) lots.push({ x, z });
    }
  g.cameraCtl.locate(lots[0].x, lots[0].z, { size: 40 });
  await wait(1800);
  if (window.KEEP && !document.querySelector('.bd-keep.on')) {
    g.services.get('build').open();
    document.querySelector('.bd-keep')?.click();
  }
  g.services.get('construction').startBuilding(def);
  await wait(300);
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const [w, d] = c.footprint(defs.get(def), 0);
  const screen = (x, z) => {
    const v = g.camera.position.clone().set(x + w / 2, c.grid.heightAt(x + w / 2, z + d / 2), z + d / 2).project(g.camera);
    return { clientX: rect.left + ((v.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - v.y) / 2) * rect.height };
  };
  const click = async (at) => {
    const o = { ...at, button: 0, shiftKey: !!window.SHIFT, pointerType: 'mouse', bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...o, buttons: 0 }));
    await wait(120);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 }));
    await wait(60);
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    await wait(400);
  };
  const state = () => ({
    open: g.services.get('build').isOpen,
    tool: g.tools.active?.id,
    again: !document.querySelector('.bd-again')?.classList.contains('hidden') && document.querySelector('.bd-again')?.textContent,
  });
  const n0 = c.buildingEntities().length;
  await click(screen(lots[0].x, lots[0].z));
  const after = { ...state(), built: c.buildingEntities().length - n0 };
  let again;
  if (window.AGAIN) {
    document.querySelector('.bd-again')?.click();
    await wait(300);
    again = state();
  }
  return { lots, after, again };
})();
