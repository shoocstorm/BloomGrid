import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'pollinator-sanctuary',
  name: 'Pollinator Sanctuary',
  description: 'A wildflower maze with bee towers and moth lanterns. Floods the district with pollen: everything nearby blooms.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 75, energy: 0, eco: 7, happiness: 4, population: 0, jobs: 1, pollution: 0, water: -1 },
  growthTime: 60,
  pollinators: 3.5,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.05, 1.96] });
    flowers(b, 0, 0.05, 0, 0.92, 70, 0, 0.9);
    grassTufts(b, 0, 0.05, 0, 1.8, 1.8, 18, 0);
    // Bee towers: timber stacks topped with blossoms.
    for (const [x, z] of [
      [-0.55, -0.55],
      [0.6, 0.5],
    ] as const) {
      b.add({ piece: 'slab', p: [x, 0.05, z], s: [0.18, 0.55, 0.18], tint: PALETTE.timber });
      b.add({ piece: 'flower', p: [x, 0.6, z], s: 0.22, tint: 0xffe08a, glow: 0.9, growAt: 0.2 });
    }
    tree(b, 0.6, 0.05, -0.6, 0.35, 0.3);
  },
});
