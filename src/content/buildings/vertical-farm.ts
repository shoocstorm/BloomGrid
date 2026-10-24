import { defineBuilding } from '../types';
import { FLOOR, PALETTE, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'vertical-farm',
  name: 'Orchard Stack',
  description: 'Stacked hydroponic floors crowned by a rooftop fruit orchard.',
  category: 'food',
  footprint: [2, 2],
  stats: { cost: 180, energy: -8, eco: 4, happiness: 2, population: 0, jobs: 12, pollution: 0 },
  growthTime: 100,
  recipe(b) {
    const floors = 4 + Math.floor(b.rand() * 3);
    let y = 0;
    for (let i = 0; i < floors; i++) {
      b.add({ piece: 'slab', p: [0, y, 0], s: [1.7, 0.05, 1.7], tint: PALETTE.concrete });
      b.add({ piece: 'glassBox', p: [0, y + 0.05, 0], s: [1.6, FLOOR - 0.05, 1.6], tint: 0xc9f2d0, glow: 0.3 });
      // Hydroponic rows visible through glass
      for (let r = -2; r <= 2; r++) {
        b.add({ piece: 'mossBox', p: [r * 0.28, y + 0.05, 0], s: [0.12, 0.12, 1.4], growAt: 0.05 + i * 0.08 });
      }
      y += FLOOR;
    }
    roofMeadow(b, y, 1.7, 1.7, 0);
    for (let i = 0; i < 4; i++) {
      tree(b, (i % 2 ? 0.4 : -0.4), y + 0.05, (i < 2 ? 0.4 : -0.4), 0.35, 0.3 + i * 0.1);
    }
  },
});
