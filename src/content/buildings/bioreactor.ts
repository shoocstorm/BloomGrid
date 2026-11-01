import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, door, ivyEdge, lamp, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'bioreactor',
  name: 'Algae Bioreactor',
  description: 'Glowing algae columns digest waste into clean power. Pair with greenery to purify its output.',
  category: 'tech',
  footprint: [3, 3],
  stats: { cost: 300, energy: 70, eco: -6, happiness: -2, population: 0, jobs: 20, pollution: 6, water: -6 },
  growthTime: 120,
  symbiosis: { partners: ['phyto-garden'], radius: 7, pollutionMul: 0.25, outputMul: 1.15, label: 'phyto-garden reed beds purify its effluent' },
  recipe(b) {
    // Main hall with living membrane walls
    b.add({ piece: 'slab', p: [-0.4, 0, 0], s: [1.8, 0.9, 2.4], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [-0.4, 0.05, 0], s: [1.86, 0.8, 2.46] });
    roofMeadow(b, 0.9, 1.7, 2.3, 2);
    ivyEdge(b, -0.4, 0.9, 1.23, 1.6, 0, 1, 5);
    ivyEdge(b, -1.33, 0.9, 0, 2.2, -1, 0, 6);
    // Algae tank columns
    for (let i = 0; i < 3; i++) {
      const z = -0.9 + i * 0.9;
      b.add({ piece: 'algaeTank', p: [1.0, 0, z], s: [0.55, b.range(1.4, 1.9), 0.55], glow: 1 });
      b.add({ piece: 'concreteCyl', p: [1.0, 0, z], s: [0.62, 0.15, 0.62], tint: PALETTE.concrete });
    }
    tree(b, 1.2, 0, 1.25, 0.4, 0.5);
    tree(b, 1.25, 0, -1.3, 0.35, 0.6);
    // Detail (D-097): a door and lit sign on the hall, pipes from each tank into it, and a lamp.
    door(b, -0.2, 0, 1.24, 0.24, 0.4);
    b.add({ piece: 'slab', p: [-0.95, 0.5, 1.24], s: [0.5, 0.14, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [-0.95, 0.53, 1.255], s: [0.42, 0.08, 0.01], tint: 0x8fd35a, glow: 0.9 });
    for (let i = 0; i < 3; i++) beam(b, 'concreteCyl', [1.0, 1.15, -0.9 + i * 0.9], [0.5, 0.7, -0.9 + i * 0.9], 0.07, { tint: TRIM.steel });
    lamp(b, 0.65, 0, 1.3, 0.5);
  },
});
