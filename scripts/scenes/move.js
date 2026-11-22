// Moving a building on touch (D-212): `bun run snap -- --mobile --eval @scripts/scenes/move.js --after 6000`.
// Long-presses a building (window.DEF, default a canopy tower) with touch pointer events, drags it window.DX / DZ
// tiles (default: the nearest free lot) and lifts (window.HOLD = 1 keeps the finger down for the shot). window.TAP = 1 instead
// uses the inspector's Move: tap a lot, tap it again. Returns the tool, tooltip and where the building ended up.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = Math.max(c.credits, 1e5);
  const id = window.DEF ?? 'canopy-tower';
  const eid = [...c.buildingEntities()].find((e) => c.buildingDef(e).id === id);
  const r = c.buildingRecord(eid);
  const uid = c.buildingRecord(eid).uid;
  const [w, d] = c.footprint(c.buildingDef(eid), r.rot);
  const [cx, cz] = [r.x + w / 2, r.z + d / 2];
  // Default: the nearest free lot it may move to (window.DX / DZ override).
  let [dx, dz] = [window.DX, window.DZ];
  if (dx === undefined) {
    const { relocatePlan } = await import('/src/sim/relocate.ts');
    search: for (let k = 6; k < 40; k++)
      for (const [ax, az] of [[k, 0], [-k, 0], [0, k], [0, -k]])
        if (relocatePlan(c, eid, r.x + ax, r.z + az, r.rot).ok) {
          [dx, dz] = [ax, az];
          break search;
        }
  }
  dz ??= 0;
  g.cameraCtl.locate(cx + dx / 2, cz + dz / 2, { size: 30 });
  await wait(2500);
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const screen = (x, z) => {
    const v = g.camera.position.clone().set(x, c.grid.heightAt(x, z), z).project(g.camera);
    return { clientX: rect.left + ((v.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - v.y) / 2) * rect.height };
  };
  const fire = (type, at) =>
    canvas.dispatchEvent(
      new PointerEvent(type, { ...at, pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'touch', isPrimary: true, bubbles: true }),
    );
  const tap = async (at) => {
    fire('pointerdown', at);
    await wait(80);
    fire('pointerup', at);
    await wait(300);
  };
  const tip = () => document.querySelector('.tooltip, .tool-tip, [class*="tooltip"]')?.innerText;
  const to = screen(cx + dx, cz + dz);
  if (window.TAP) {
    g.services.get('construction').startMove(eid);
    await wait(300);
    await tap(to);
    const first = { tool: g.tools.active?.id, tip: tip() };
    if (window.HOLD) return first;
    await tap(to);
  } else {
    const from = screen(cx, cz);
    fire('pointerdown', from);
    await wait(650); // past the long press
    const picked = g.tools.active?.id;
    for (let i = 1; i <= 10; i++) {
      fire('pointermove', screen(cx + (dx * i) / 10, cz + (dz * i) / 10));
      await wait(60);
    }
    await wait(300);
    if (window.HOLD) return { picked, tool: g.tools.active?.id, tip: tip() };
    fire('pointerup', to);
  }
  await wait(1200);
  const now = [...c.buildingEntities()].find((e) => c.buildingRecord(e).uid === uid);
  const nr = c.buildingRecord(now);
  return { tool: g.tools.active?.id, from: [r.x, r.z], to: [nr.x, nr.z] };
})();
