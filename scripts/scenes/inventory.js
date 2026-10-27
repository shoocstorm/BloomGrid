// Opens the dashboard's Inventory tab on the worst object and exercises the agent tools. Evaluated in the page by scripts/snap.mjs.
// `window.QUERY = 'district:westbrook'` pre-fills the search.
(async () => {
  const g = window.bloomgrid;
  const agent = g.services.get('agent');
  const overview = await agent.call('city_overview');
  const worst = await agent.call('inventory_search', { sort: 'status', limit: 3, text: window.QUERY ?? '' });
  const id = worst.ok ? worst.result.items[0]?.id : undefined;
  g.services.get('dashboard').openInventory(id);
  const search = document.querySelector('.inv-search');
  if (window.QUERY && search) {
    search.value = window.QUERY;
    search.dispatchEvent(new Event('input'));
  }
  return {
    tools: agent.specs().map((s) => s.name),
    overview: overview.ok && overview.result.inventory,
    worst: worst.ok && worst.result,
  };
})();
