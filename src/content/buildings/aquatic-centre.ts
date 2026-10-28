import { defineBuilding } from '../types';
import { PALETTE, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'aquatic-centre',
  name: 'Lagoon Aquatic Centre',
  description:
    'An Olympic pool, a diving tower and a children’s lagoon under one long glass shell, warmed by the sun and filtered by reed beds. Busy from dawn laps to evening galas.',
  category: 'sports',
  footprint: [8, 6],
  stats: {
    cost: 2200,
    energy: -20,
    eco: 4,
    happiness: 18,
    population: 0,
    jobs: 40,
    pollution: 0,
    water: -25,
  },
  growthTime: 160,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.25, 5.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.25, 0], s: [7.4, 0.04, 5.4], tint: 0xdfe9e2 });
    // Racing pool with lane ropes, and the lagoon.
    b.add({ piece: 'pool', p: [-0.8, 0.22, -0.6], s: [5.0, 0.1, 2.6] });
    for (let i = 1; i < 6; i++)
      b.add({ piece: 'slab', p: [-0.8, 0.31, -1.9 + i * 0.43], s: [5.0, 0.01, 0.03], tint: 0xffd36b });
    b.add({ piece: 'pool', p: [2.4, 0.22, 1.6], s: [2.0, 0.1, 1.6] });
    // Diving tower.
    b.add({ piece: 'concreteCyl', p: [2.4, 0.25, -1.4], s: [0.35, 3.0, 0.35], tint: 0xf4f1ea });
    for (const y of [1.2, 2.2, 3.0])
      b.add({ piece: 'slab', p: [2.0, 0.25 + y, -1.4], s: [1.0, 0.08, 0.35], tint: 0xf4f1ea });
    // The long glass shell.
    b.add({ piece: 'dome', p: [0, 0.25, 0], s: [7.6, 3.6, 5.6], tint: PALETTE.glass });
    b.add({ piece: 'haloRing', p: [0, 0.4, 0], s: [7.5, 2, 5.5], glow: 0.6 });
    grassTufts(b, -2.8, 0.29, 2.0, 1.6, 1.0, 10);
    for (const x of [-3.4, -2.2]) tree(b, x, 0.29, 2.2, 0.45, 0.2);
  },
});
