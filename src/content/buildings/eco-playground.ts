import { defineBuilding } from '../types';
import { flowers, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'eco-playground',
  name: 'Willow Eco-Playground',
  description: 'Woven willow tunnels and bouncy moss pads where children play under soft air-current guards. Families love living nearby.',
  category: 'nature',
  footprint: [3, 3],
  stats: { cost: 110, energy: 0, eco: 6, happiness: 9, population: 0, jobs: 2, pollution: -1, water: -2 },
  growthTime: 70,
  pollinators: 0.5,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [2.94, 0.06, 2.94] });
    grassTufts(b, 0, 0.06, 0, 2.7, 2.7, 30);
    // Bouncy moss pads.
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'mossBox', p: [b.range(-1, 1), 0.06, b.range(-1, 1)], s: [b.range(0.35, 0.6), 0.12, b.range(0.35, 0.6)], r: b.rand() * 3 });
    // A willow tunnel of arches.
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'willowArch', p: [-0.6 + i * 0.3, 0.06, -0.7], s: [1.1, 1.2, 1.1], r: Math.PI / 2, tint: 0x9cbf5a, growAt: 0.1 + i * 0.08 });
    b.add({ piece: 'willowArch', p: [0.8, 0.06, 0.6], s: [1.4, 1.4, 1.4], tint: 0x8fae4a, growAt: 0.3 });
    b.add({ piece: 'pool', p: [-0.6, 0.06, 0.7], s: [0.9, 0.02, 0.6] });
    flowers(b, 0.4, 0.06, 0.1, 1.1, 30, 0, 0.8);
    tree(b, 1.1, 0.06, -1.1, 0.6, 0.2);
    tree(b, -1.1, 0.06, 1.15, 0.5, 0.4);
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'fungus', p: [b.range(-1.3, 1.3), 0.06, b.range(-1.3, 1.3)], s: b.range(0.06, 0.1), tint: 0xbff6ff, glow: 1, growAt: 0.3 });
  },
});
