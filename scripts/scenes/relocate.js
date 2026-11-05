// Shift-drag relocation (D-116): `bun run snap -- --eval @scripts/scenes/relocate.js --after 6000`.
// Picks up a building (window.DEF, default a canopy tower) with real Shift + pointer events and carries it
// window.DX / DZ tiles (default 14 / 0); window.DROP = 1 releases it there. On `?scenario=empty` it builds one first. Returns the tooltip and the result.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const g = window.bloomgrid;
  const c = g.city;
  const id = window.DEF ?? 'canopy-tower';
  let eid = [...c.buildingEntities()].find((e) => c.buildingDef(e).id === id);
  // An empty island (`--path "/?scenario=empty"`): build one near the centre first.
  if (eid === undefined) {
    c.credits = 1e6;
    for (let z = 240; z < 300 && eid === undefined; z += 2)
      for (let x = 230; x < 300 && eid === undefined; x += 2)
        if (g.commands.execute('build', { def: id, x, z, rot: 0 }, false)) eid = c.buildingAt(x, z);
    await wait(3000);
  }
  const r = c.buildingRecord(eid);
  const [w, d] = c.footprint(c.buildingDef(eid), r.rot);
  const [cx, cz] = [r.x + w / 2, r.z + d / 2];
  const [dx, dz] = [window.DX ?? 14, window.DZ ?? 0];
  g.cameraCtl.locate(cx + dx / 2, cz + dz / 2, { size: 30 });
  await wait(2500);
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const screen = (x, z) => {
    const v = g.camera.position.clone().set(x, c.grid.heightAt(x, z), z).project(g.camera);
    return {
      clientX: rect.left + ((v.x + 1) / 2) * rect.width,
      clientY: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  };
  const fire = (type, at) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        ...at,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        shiftKey: true,
        pointerType: 'mouse',
        bubbles: true,
      }),
    );
  const from = screen(cx, cz);
  fire('pointerenter', from);
  fire('pointermove', from);
  fire('pointerdown', from);
  for (let i = 1; i <= 10; i++) {
    fire('pointermove', screen(cx + (dx * i) / 10, cz + (dz * i) / 10));
    await wait(60);
  }
  await wait(400);
  const tip = document.querySelector('.tooltip, .tool-tip, [class*="tooltip"]')?.innerText;
  if (!window.DROP) return { tip, from: [r.x, r.z] };
  fire('pointerup', screen(cx + dx, cz + dz));
  await wait(1500);
  const now = c.buildingRecord(eid);
  return {
    tip,
    from: [r.x, r.z],
    to: c.buildingEntities().includes(eid) ? [now.x, now.z] : 'moved (new eid)',
    uid: r.uid,
  };
})();
