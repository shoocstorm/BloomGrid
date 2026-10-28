// Flora's console: `bun run snap -- --eval @scripts/scenes/flora.js --after 1500` (add --mobile for phones).
// window.VIEW = 'console' | 'profile' | 'tools'; window.OPEN = '<tool name>' expands that tool card; window.MAX = 1 maximizes.
(async () => {
  const g = window.bloomgrid;
  document.querySelector('.help-ok')?.click();
  const a = g.services.get('assistant');
  if (window.MAX) a.maximize(true);
  else a.toggle(true);
  await new Promise((r) => setTimeout(r, 1300));
  if (window.VIEW === 'console' || !window.VIEW) await a.ask('/advisor_tips');
  else document.querySelectorAll('.ai-tab')[window.VIEW === 'profile' ? 1 : 2].click();
  if (window.OPEN) {
    await new Promise((r) => setTimeout(r, 400));
    const card = [...document.querySelectorAll('.ai-tcard')].find((c) => c.querySelector('.ai-tname b').textContent === window.OPEN);
    card?.click();
    card?.scrollIntoView({ block: 'start' });
  }
  return { view: document.querySelector('.ai-main').dataset.view, tools: document.querySelectorAll('.ai-tcard').length, fab: getComputedStyle(document.querySelector('.ai-fab')).display };
})();
