import { defineBuilding } from '../types';
import { PALETTE, flowers, ivyEdge, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'water-works',
  name: 'NEWater Reclamation Works',
  description: 'Draws from the sea or a reservoir and purifies it through reed beds and membrane tanks. Must touch water.',
  category: 'utility',
  footprint: [3, 2],
  stats: { cost: 350, energy: -12, eco: 1, happiness: 0, population: 0, jobs: 10, pollution: 0, water: 220 },
  growthTime: 110,
  placement: { nearWater: true },
  floodproof: true,
  recipe(b) {
    // Treatment hall with a living roof.
    b.add({ piece: 'slab', p: [-0.7, 0, 0], s: [1.4, 0.7, 1.7], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [-0.7, 0.05, 0], s: [1.46, 0.6, 1.76] });
    roofMeadow(b, 0.7, 1.3, 1.6, 0);
    ivyEdge(b, -0.7, 0.7, 0.88, 1.3, 0, 1, 4);
    // Membrane tanks glowing faint blue.
    for (let i = 0; i < 3; i++) {
      const z = -0.6 + i * 0.6;
      b.add({ piece: 'glassCyl', p: [0.55, 0, z], s: [0.48, b.range(0.9, 1.2), 0.48], tint: 0x9fd8ff, glow: 0.6 });
      b.add({ piece: 'concreteCyl', p: [0.55, 0, z], s: [0.56, 0.12, 0.56], tint: PALETTE.concrete });
    }
    // Reed-bed polishing pond.
    b.add({ piece: 'pool', p: [1.15, 0.02, 0], s: [0.6, 0.03, 1.7] });
    flowers(b, 1.15, 0.05, 0, 0.5, 10, 0.1, 0.7);
  },
});
