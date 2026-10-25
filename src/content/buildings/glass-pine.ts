import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

/** Tiers of the pine: base height, cone diameter, cone height. */
const TIERS = [
  [0.3, 9.0, 7.0],
  [4.6, 7.4, 6.5],
  [8.6, 5.8, 6.0],
  [12.4, 4.2, 5.6],
  [16.0, 2.7, 5.4],
] as const;

export default defineBuilding({
  id: 'glass-pine',
  name: 'Glass Pine Tower',
  description:
    'An office tower shaped like a conifer: five stacked glass cones, each ringed with light, shelter studio floors under evergreen terraces. The island’s tallest evergreen, and its busiest.',
  category: 'commercial',
  footprint: [10, 10],
  stats: {
    cost: 4800,
    energy: -34,
    eco: 8,
    happiness: 12,
    population: 0,
    jobs: 220,
    pollution: 1,
    water: -12,
  },
  growthTime: 210,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.3, 9.8], tint: PALETTE.concrete });
    for (const [x, z] of [
      [-4.1, -4.1],
      [4.1, -4.1],
      [-4.1, 4.1],
      [4.1, 4.1],
    ] as const) {
      grassTufts(b, x, 0.3, z, 1.4, 1.4, 10);
      tree(b, x, 0.3, z, 0.8, 0.1);
    }
    flowers(b, 0, 0.3, 4.3, 1.0, 16, 0, 0.6);
    // A glass trunk through the middle.
    b.add({ piece: 'glassCyl', p: [0, 0.3, 0], s: [2.4, 21, 2.4], tint: PALETTE.glassWarm, glow: 0.3 });
    for (const [y, d, h] of TIERS) {
      b.add({ piece: 'spireCone', p: [0, y, 0], s: [d, h, d], tint: PALETTE.glass, glow: 0.2 });
      b.add({ piece: 'haloRing', p: [0, y + 0.1, 0], s: [d * 0.98, 5, d * 0.98], glow: 0.9 });
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d, 0.12, d], tint: 0xe9f4ef });
    }
    b.add({ piece: 'lumenRib', p: [0, 21.3, 0], s: [0.12, 2.0, 0.12], glow: 1 });
  },
});
