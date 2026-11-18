// Stories and plans (plan v5, Phase 29): `bun run snap -- --path "/?scenario=fresh-island&nowizard" --eval @scripts/scenes/story.js --after 4000`.
// Starts the fisher's story (the fish stock is set low) and shows its card. `window.PLAN = 'carbon-zero' | 'fix' |
// 'harmony' | 'budget'` instead posts Flora's plan card (on the showcase, default path); `window.WAIT = 1` takes the
// first choice so the card shows the goal it waits for. Returns the story or the plan.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!document.body.classList.contains('booted')) await wait(200);
  await wait(1500);
  document.querySelector('.help-ok')?.click();
  const g = bloomgrid;
  const city = g.city;
  city.steward.autoCrises = false;
  if (window.PLAN) {
    city.credits = Math.max(city.credits, 60000);
    g.services.get('moments').mode = 'off';
    const ok = g.services.get('assistant').plan(window.PLAN);
    await wait(800);
    // No model core yet: close the core picker so the console log (and the plan card) shows.
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Done' && b.closest('.ai-panel, .ai'))?.click();
    await wait(800);
    return `plan ${window.PLAN}: ${ok}`;
  }
  const app = (path) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(path)) ?? path);
  const { startStory } = await app('/src/sim/stories.ts');
  city.growth.fish = 0.4;
  const run = startStory(city, window.ARC ?? 'fisher');
  if (window.WAIT) g.commands.execute('storyChoice', { choice: 0 }, false);
  await wait(1500);
  return JSON.stringify(run && { name: run.name, place: run.place, beat: run.beat, status: run.status });
})();
