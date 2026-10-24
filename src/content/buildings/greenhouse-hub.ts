import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'greenhouse-hub',
  name: 'Mycelium Work Dome',
  description: 'Living workspaces grown from shaped timber and mycelium beneath a solar-glass dome.',
  category: 'commercial',
  footprint: [3, 3],
  stats: { cost: 260, energy: -10, eco: 4, happiness: 3, population: 0, jobs: 40, pollution: 1 },
  growthTime: 120,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [2.8, 0.1, 2.8] });
    grassTufts(b, 0, 0.1, 0, 2.6, 2.6, 30);
    // Interior forest
    tree(b, -0.3, 0.1, -0.2, 0.7, 0);
    tree(b, 0.45, 0.1, 0.35, 0.55, 0.2);
    // Mycelium desks (glowing fungi clusters)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add({ piece: 'fungus', p: [Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85], s: b.range(0.14, 0.22), tint: 0xf3e3ff, glow: 0.9, growAt: 0.1 + i * 0.05 });
    }
    flowers(b, 0, 0.1, 0, 1.2, 24, 0.05, 0.7);
    b.add({ piece: 'dome', p: [0, 0.1, 0], s: [2.7, 2.2, 2.7], tint: PALETTE.glass });
    b.add({ piece: 'slab', p: [0, 0.1, 1.3], s: [0.6, 0.45, 0.25], tint: PALETTE.timber });
  },
});
