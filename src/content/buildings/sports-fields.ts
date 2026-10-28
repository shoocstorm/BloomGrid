import { defineBuilding } from '../types';
import { PALETTE, beam, tree } from '../kit';

export default defineBuilding({
  id: 'sports-fields',
  name: 'Meadow Sports Fields',
  description:
    'Two floodlit pitches of hardy meadow turf with timber bleachers: league games at the weekend, kick-abouts every evening. Cheap to run and good for the neighbourhood.',
  category: 'sports',
  footprint: [6, 4],
  // Cheap to run: turf, timber and floodlights.
  stats: {
    cost: 600,
    energy: -6,
    eco: 4,
    happiness: 10,
    population: 0,
    jobs: 8,
    pollution: -1,
    water: -4,
    upkeep: 0.08,
  },
  growthTime: 100,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.9, 0.1, 3.9], tint: PALETTE.concrete });
    for (const x of [-1.45, 1.45]) {
      b.add({ piece: 'mossBox', p: [x, 0.1, -0.2], s: [2.7, 0.05, 3.0] });
      b.add({ piece: 'slab', p: [x, 0.15, -0.2], s: [0.04, 0.01, 3.0], tint: 0xffffff });
      for (const z of [-1.6, 1.2]) {
        beam(b, 'timberBox', [x - 0.4, 0.15, z], [x - 0.4, 0.6, z], 0.05, { tint: 0xffffff });
        beam(b, 'timberBox', [x + 0.4, 0.15, z], [x + 0.4, 0.6, z], 0.05, { tint: 0xffffff });
        beam(b, 'timberBox', [x - 0.4, 0.6, z], [x + 0.4, 0.6, z], 0.05, { tint: 0xffffff });
      }
    }
    // Bleachers along the long side.
    for (let r = 0; r < 3; r++)
      b.add({
        piece: 'timberBox',
        p: [0, 0.1 + r * 0.18, 1.55 + r * 0.18],
        s: [5.2, 0.18, 0.2],
        tint: PALETTE.timber,
      });
    // Floodlights.
    for (const [x, z] of [
      [-2.8, -1.8],
      [2.8, -1.8],
      [-2.8, 1.8],
      [2.8, 1.8],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.1, z], s: [0.1, 3.2, 0.1], tint: 0xf4f1ea });
      b.add({ piece: 'lumenRib', p: [x, 3.3, z], s: [0.4, 0.18, 0.18], glow: 1 });
    }
    tree(b, -2.7, 0.1, 0.0, 0.4, 0.2);
    tree(b, 2.7, 0.1, 0.0, 0.4, 0.2);
  },
});
