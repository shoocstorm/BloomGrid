import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge } from '../kit';

export default defineBuilding({
  id: 'flora-hive',
  name: 'Flora-Net Drone Hive',
  description:
    'A honeycomb node of the Flora-Net AI. Its hummingbird drones pollinate flowers, harvest ripe produce, trim overgrown highways and mist parched gardens nearby.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 280, energy: -6, eco: 4, happiness: 2, population: 0, jobs: 4, pollution: 0, water: -2 },
  growthTime: 60,
  pollinators: 0.8,
  drones: { radius: 16, count: 12 },
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.9, 0.1, 1.9] });
    grassTufts(b, 0, 0.1, 0, 1.7, 1.7, 14);
    flowers(b, 0, 0.1, 0, 0.85, 22, 0, 0.6);
    b.add({ piece: 'concreteCyl', p: [0, 0.1, 0], s: [0.22, 1.1, 0.22], tint: PALETTE.concrete });
    // Stacked honeycomb cells, golden and softly lit.
    for (let i = 0; i < 4; i++) {
      const y = 1.1 + i * 0.26;
      const r = 0.95 - Math.abs(i - 1.5) * 0.18;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r, 0.24, r], tint: i % 2 ? 0xffd166 : 0xffe08a, glow: 0.5 });
    }
    b.add({ piece: 'dome', p: [0, 2.14, 0], s: [0.7, 0.4, 0.7] });
    // Drones resting on the comb.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add({ piece: 'drone', p: [Math.cos(a) * 0.5, 1.36 + (i % 2) * 0.26, Math.sin(a) * 0.5], s: 0.16, r: -a, glow: 1, growAt: 0.2 + i * 0.05 });
    }
    ivyEdge(b, 0.45, 1.1, 0, 0.6, 1, 0, 2);
    ivyEdge(b, -0.45, 1.1, 0, 0.6, -1, 0, 2);
  },
});
