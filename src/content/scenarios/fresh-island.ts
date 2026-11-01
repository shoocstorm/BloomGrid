import { defineScenario, type ScenarioBuilder } from '../types';

/**
 * A fresh island (Phase 16, D-072): the default New Game. A fishing hamlet on the south coast (a coast road, a
 * lane down to the water, a few garden homes, two solar spires, a water intake, a market garden, a park, an Ember
 * Watch and one Fishing Boat Dock) and an otherwise empty island. Progression is on: the sky-lanes, the Aeroline and Flora are
 * unlock projects, and most sea wonders are still to be discovered.
 */

/** The hamlet's centre on the coast: the first candidate column whose south shore has room to build. */
function findCoast(b: ScenarioBuilder): { x: number; shore: number } {
  const S = b.size;
  for (const fx of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68]) {
    const x = Math.round(fx * S);
    let z = Math.round(0.55 * S);
    if (!b.isLand(x, z)) continue;
    while (z < S - 2 && b.isLand(x, z + 1)) z++;
    // Need ~14 tiles of land north of the shore across the hamlet's width.
    let ok = true;
    for (let dx = -16; dx <= 16 && ok; dx += 4) ok = b.isLand(x + dx, z - 12);
    if (ok) return { x, shore: z };
  }
  return { x: Math.round(0.5 * S), shore: Math.round(0.7 * S) };
}

export default defineScenario({
  id: 'fresh-island',
  name: 'Fresh island',
  description: 'A fishing hamlet on an empty island: grow it into a city.',
  credits: 2000,
  progression: true,
  build(b) {
    const { x, shore } = findCoast(b);
    const street = shore - 9;
    // Level the hamlet's ground gently (never the sea), then lay the coast road and a lane down to the water.
    b.level(x - 18, street - 6, x + 18, shore - 1, 4);
    b.road(x - 18, street, x + 18, street);
    b.road(x, street, x, shore + 1);
    // Utilities and the first dock by the water, either side of the lane.
    b.fill(x - 14, street + 1, x, shore + 2, { 'fishing-dock': 1 }, 1, 1);
    b.fill(x + 1, street + 1, x + 14, shore + 2, { 'water-works': 1 }, 1, 1);
    b.fill(x - 18, street - 4, x - 6, street, { 'solar-spire': 1 }, 1, 2);
    b.fill(x + 6, street - 4, x + 18, street, { 'ember-watch': 1 }, 1, 1);
    // Homes along both sides of the coast road, and a park among them.
    b.fill(x - 6, street - 3, x + 6, street, { 'pocket-park': 1 }, 1, 1);
    // A market garden: food and work for the first families.
    b.fill(x - 18, street + 1, x + 18, shore - 1, { 'greenhouse-hub': 1 }, 1, 1);
    b.fill(x - 18, street - 3, x + 18, street + 3, { 'garden-residence': 1 }, 1, 8);
    b.nameArea('Old Harbour', x - 20, street - 8, x + 20, shore + 2, 'living');
  },
});
