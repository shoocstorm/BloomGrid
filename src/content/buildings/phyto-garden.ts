import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'phyto-garden',
  name: 'Phyto Garden',
  description: 'Reed beds, ferns and mycelium mats that pull pollutants from soil and water. Pairs with Bioreactors.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 90, energy: 0, eco: 6, happiness: 2, population: 0, jobs: 2, pollution: -3, water: -1 },
  growthTime: 80,
  pollinators: 0.5,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.05, 1.96] });
    // Two stepped filtration pools.
    b.add({ piece: 'pool', p: [-0.4, 0.05, -0.3], s: [0.9, 0.02, 1.0] });
    b.add({ piece: 'pool', p: [0.5, 0.05, 0.45], s: [0.7, 0.02, 0.7] });
    for (let i = 0; i < 26; i++) {
      // Reeds ring the pools.
      const a = b.rand() * Math.PI * 2;
      const r = 0.45 + b.rand() * 0.15;
      b.add({ piece: 'grass', p: [-0.4 + Math.cos(a) * r, 0.05, -0.3 + Math.sin(a) * r * 1.1], s: b.range(0.25, 0.42), r: b.rand() * 6.28, tint: 0x8fae4a, growAt: b.rand() * 0.5 });
    }
    grassTufts(b, 0.5, 0.05, -0.5, 0.8, 0.6, 10, 0.1);
    flowers(b, 0.4, 0.05, 0.4, 0.5, 10, 0.1, 0.8);
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'fungus', p: [b.range(-0.9, 0.9), 0.05, b.range(0.4, 0.9)], s: b.range(0.07, 0.12), tint: 0xe9d8ff, glow: 0.8, growAt: 0.3 + i * 0.1 });
    tree(b, 0.75, 0.05, -0.75, 0.4, 0.4);
    b.add({ piece: 'bush', p: [-0.85, 0.05, 0.75], s: 0.3, tint: PALETTE.leaves[3], growAt: 0.2 });
  },
});
