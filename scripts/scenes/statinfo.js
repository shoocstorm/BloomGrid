// Top-bar indicator guides (D-092): `bun run snap -- --eval @scripts/scenes/statinfo.js --after 2500`.
// window.STAT = 'credits' | 'pop' | 'energy' | 'water' | 'food' | 'eco' | 'happy'; window.HOVER = 1 shows the hover card
// instead of the pinned panel. Add `--mobile` for the phone bottom sheet (tap). Returns the guide's text.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  document.querySelector('.ch-close, .chapter .icon-btn')?.click();
  const id = window.STAT ?? 'happy';
  const el = document.querySelector(`.stats .stat-${id}`);
  if (window.HOVER) {
    el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    await wait(400);
    return document.querySelector('.si-card')?.innerText;
  }
  el.click();
  await wait(400);
  return document.querySelector('.si-panel')?.innerText;
})();
