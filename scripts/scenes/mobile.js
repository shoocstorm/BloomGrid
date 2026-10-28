// Phone HUD check: run with `bun run snap -- --mobile --eval @scripts/scenes/mobile.js --after 1500`.
// window.SHEET = 'pulse' | 'advisor' | 'lens' | 'info' | 'build' | 'dashboard' | 'gesture' picks what to open.
(async () => {
  const g = window.bloomgrid;
  document.querySelector('.help-ok')?.click();
  const sheet = window.SHEET ?? 'info';
  const canvas = g.renderer.domElement;
  const touch = (type, id, x, y) =>
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
  if (sheet === 'pulse') document.querySelector('.pulse-head').click();
  if (sheet === 'advisor') document.querySelector('.adv-title').click();
  if (sheet === 'lens') document.querySelector('.lens-toggle').click(), g.services.get('overlays').set('ecology');
  if (sheet === 'dashboard') g.services.get('dashboard').toggle();
  if (sheet === 'info') {
    const eid = g.city.buildingEntities()[40];
    g.bus.emit('selection:changed', { eid });
  }
  if (sheet === 'build') {
    document.querySelector('.tool[title="Homes"], .toolbar .tool:nth-of-type(10)')?.click();
    const r = canvas.getBoundingClientRect();
    touch('pointerdown', 1, r.width / 2, r.height / 2);
    touch('pointerup', 1, r.width / 2, r.height / 2);
  }
  if (sheet === 'gesture') {
    // Pinch out + twist: the camera should zoom in and rotate; tools must not act.
    const before = { d: g.cameraCtl.getView().distance, yaw: g.cameraCtl.getView().yaw };
    const cx = 195, cy = 420;
    touch('pointerdown', 1, cx - 40, cy);
    touch('pointerdown', 2, cx + 40, cy);
    for (let i = 1; i <= 10; i++) {
      const r = 40 + i * 8, a = i * 0.04;
      touch('pointermove', 1, cx - r * Math.cos(a), cy - r * Math.sin(a));
      touch('pointermove', 2, cx + r * Math.cos(a), cy + r * Math.sin(a));
      await new Promise((res) => setTimeout(res, 20));
    }
    touch('pointerup', 1, 0, 0);
    touch('pointerup', 2, 0, 0);
    const after = g.cameraCtl.getView();
    return { before, after: { d: after.distance, yaw: after.yaw }, gesture: g.input.gesture };
  }
  const n = (s) => document.querySelectorAll(s).length;
  return { sheet, openSheets: n('.pulse:not(.collapsed)') + n('.advisor:not(.collapsed)') + n('.lens-wrap:not(.collapsed)'), tool: g.tools.active.id };
})();
