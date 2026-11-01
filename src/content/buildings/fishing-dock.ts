import { defineBuilding } from '../types';
import { PALETTE } from '../kit';

export default defineBuilding({
  id: 'fishing-dock',
  name: 'Fishing Boat Dock',
  description:
    'A timber pier, a net shed and three electric fishing boats. Free to build and the island’s first income: the catch sells for credits and feeds residents. Must touch the sea. Two or three docks fish the sea best; more overfish it, and polluted coasts or algal blooms spoil the haul.',
  category: 'food',
  footprint: [3, 2],
  // Free: the fishers pay their way from the catch (no upkeep).
  stats: {
    cost: 0,
    energy: 0,
    eco: 0,
    happiness: 1,
    population: 0,
    jobs: 16,
    pollution: 0,
    food: 60,
    upkeep: 0,
  },
  growthTime: 60,
  placement: { nearWater: true },
  fishing: { boats: 3 },
  limit: { base: 3, perPopulation: 600 },
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [2.9, 0.12, 1.9], tint: PALETTE.timber });
    // Pier posts and the deck reaching for the water on the far side.
    for (let i = 0; i < 4; i++) {
      b.add({
        piece: 'timberBox',
        p: [-1.2 + i * 0.8, -0.4, 0.85],
        s: [0.12, 0.6, 0.12],
        tint: PALETTE.bark,
      });
    }
    // Net shed with a sea-blue roof.
    b.add({ piece: 'timberBox', p: [-0.7, 0.12, -0.35], s: [1.2, 0.8, 0.9], tint: 0xb08a62 });
    b.add({ piece: 'slab', p: [-0.7, 0.92, -0.35], s: [1.35, 0.1, 1.05], tint: 0x3f8fb0 });
    b.add({ piece: 'lumenRib', p: [-0.7, 0.6, 0.12], s: [0.5, 0.06, 0.05], glow: 0.8, tint: 0xffc94a });
    // Drying nets on poles, crates and a mooring lantern.
    for (let i = 0; i < 3; i++) {
      b.add({
        piece: 'timberBox',
        p: [0.55 + i * 0.35, 0.12, -0.6],
        s: [0.05, 0.7, 0.05],
        tint: PALETTE.bark,
      });
    }
    b.add({ piece: 'willowArch', p: [0.9, 0.5, -0.6], s: [0.75, 0.25, 0.05], tint: 0x8fb8a0 });
    b.add({ piece: 'timberBox', p: [0.8, 0.12, 0.2], s: [0.3, 0.25, 0.3], tint: 0xc9a06a });
    b.add({ piece: 'timberBox', p: [1.15, 0.12, 0.25], s: [0.25, 0.2, 0.25], tint: 0xa98458 });
    b.add({ piece: 'timberBox', p: [1.3, 0.12, 0.8], s: [0.06, 0.9, 0.06], tint: PALETTE.bark });
    b.add({ piece: 'lumenRib', p: [1.3, 1.0, 0.8], s: [0.12, 0.12, 0.12], glow: 1, tint: 0xffd27a });
  },
});
