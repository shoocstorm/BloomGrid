import { defineBuilding } from '../types';
import { PALETTE, grassTufts } from '../kit';

export default defineBuilding({
  id: 'weather-radar',
  name: 'Weather Radar',
  description:
    'A radome on a lattice tower watching the sky and the sea. While it works, storms, tornadoes, floods and tsunamis are seen coming twice as early: time to feather turbines, close the gates and evacuate.',
  category: 'tech',
  footprint: [2, 2],
  stats: { cost: 1200, energy: -15, eco: 0, happiness: 0, population: 0, jobs: 8, pollution: 0 },
  growthTime: 90,
  radar: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.9, 0.1, 1.9], tint: PALETTE.concrete });
    grassTufts(b, -0.5, 0.1, 0.5, 0.8, 0.8, 4);
    for (const [x, z] of [
      [-0.4, -0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [0.4, 0.4],
    ] as const)
      b.add({ piece: 'timberBox', p: [x, 0.1, z], s: [0.08, 3.0, 0.08], tint: 0xdfe8e4 });
    for (let i = 0; i < 4; i++)
      b.add({ piece: 'slab', p: [0, 0.6 + i * 0.7, 0], s: [0.9, 0.05, 0.9], tint: 0xdfe8e4 });
    b.add({ piece: 'concreteCyl', p: [0, 3.1, 0], s: [0.9, 0.2, 0.9], tint: 0xe9eee8 });
    b.add({ piece: 'dome', p: [0, 3.0, 0], s: [1.3, 1.6, 1.3], tint: 0xf4f6f2 });
    b.add({ piece: 'lumenRib', p: [0, 4.3, 0], s: [0.12, 0.12, 0.12], glow: 1, tint: 0xff6a5a });
  },
});
