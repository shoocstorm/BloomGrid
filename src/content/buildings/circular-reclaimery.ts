import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'circular-reclaimery',
  name: 'Circular Reclaimery',
  description:
    'Where nothing is waste: conveyors sort the city’s cast-offs under glass domes, metals and glass go back to the foundries and food scraps to compost. It cleans the air around it.',
  category: 'industry',
  footprint: [5, 5],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 800,
    energy: -20,
    eco: 3,
    happiness: 0,
    population: 0,
    jobs: 150,
    pollution: -1,
    water: -6,
    upkeep: 0.12,
  },
  growthTime: 130,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 4.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.12, 0, 4.4, 4.4, 24);
    // Three sorting domes.
    for (const [x, z] of [
      [-1.4, -1.3],
      [0.2, -1.4],
      [1.6, -1.2],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [1.3, 0.35, 1.3], tint: 0xe8e2d4 });
      b.add({ piece: 'dome', p: [x, 0.47, z], s: [1.3, 1.2, 1.3], tint: PALETTE.glass });
    }
    // Raised conveyors between them and the sheds.
    beam(b, 'slab', [-1.4, 1.2, -1.3], [-1.4, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    beam(b, 'slab', [0.2, 1.2, -1.4], [0.2, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    beam(b, 'slab', [1.6, 1.2, -1.2], [1.6, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    // Sheds with green roofs and the compost windrows.
    b.add({ piece: 'timberBox', p: [-0.4, 0.12, 1.4], s: [3.4, 1.1, 1.3], tint: PALETTE.timber });
    roofMeadow(b, 1.22, 3.4, 1.3);
    for (let i = 0; i < 3; i++)
      b.add({ piece: 'mossBox', p: [2.0, 0.12, 0.4 + i * 0.55], s: [0.9, 0.3, 0.35], tint: 0x8a6a45 });
    flowers(b, 2.0, 0.12, 1.6, 0.5, 8);
  },
});
