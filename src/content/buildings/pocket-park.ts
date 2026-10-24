import { defineBuilding } from '../types';
import { flowers, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'pocket-park',
  name: 'Bloom Park',
  description: 'A wildflower meadow with a lily pond and paths of glowing fungi that light up at night.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 60, energy: 0, eco: 8, happiness: 6, population: 0, jobs: 1, pollution: -2, water: -1 },
  growthTime: 70,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.06, 1.96] });
    b.add({ piece: 'pool', p: [0.35, 0.06, -0.3], s: [0.8, 0.02, 0.7] });
    grassTufts(b, 0, 0.06, 0, 1.8, 1.8, 26);
    flowers(b, -0.3, 0.06, 0.3, 0.6, 28, 0, 0.8);
    tree(b, -0.55, 0.06, -0.5, 0.6, 0.1);
    tree(b, 0.6, 0.06, 0.6, 0.45, 0.3);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      b.add({ piece: 'fungus', p: [-0.9 + t * 1.6, 0.06, 0.9 - t * 0.5 + Math.sin(t * 6) * 0.1], s: b.range(0.06, 0.1), tint: 0xbff6ff, glow: 1, growAt: 0.2 + t * 0.4 });
    }
  },
});
