// The New Chapter dialog's showcase map (D-085): the founding city drawn from the live city, with the Aeroline loop.
// Regenerate after changing the founding-city scenario:  bun run showcase-map
(async () => {
  const g = window.bloomgrid;
  const { drawIsland, mapOfCity } = await import('/src/modules/tutorial/islandMap.ts');
  const { aerolineRoute } = await import('/src/content/scenarios/founding-city.ts');
  const size = g.city.grid.w;
  const canvas = document.createElement('canvas');
  drawIsland(canvas, g.city.seed, size, { ...mapOfCity(g.city), loop: aerolineRoute(size) });
  return canvas.toDataURL('image/webp', 0.9);
})();
