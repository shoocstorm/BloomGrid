import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, beam, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'kelp-refinery',
  name: 'Kelp Bioplastic Refinery',
  description:
    'Ferments farmed kelp in glowing towers and domed digesters into compostable plastics for the whole island. Its effluent needs Phyto Garden reed beds to run clean.',
  category: 'industry',
  footprint: [5, 5],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 1100,
    energy: -35,
    eco: -2,
    happiness: -1,
    population: 0,
    jobs: 180,
    pollution: 4,
    water: -20,
    upkeep: 0.18,
  },
  growthTime: 150,
  symbiosis: {
    partners: ['phyto-garden'],
    radius: 8,
    pollutionMul: 0.25,
    outputMul: 1.15,
    label: 'phyto-garden reed beds polish its effluent',
  },
  variants: 2,
  recipe(b: KitBuilder) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 4.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.12, 0, 4.4, 4.4, 30);
    // Two rows of kelp fermentation towers.
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 3; i++) {
        const [x, z] = [-1.5 + i * 1.0, -1.4 + r * 1.0];
        b.add({ piece: 'algaeTank', p: [x, 0.12, z], s: [0.7, b.range(2.0, 2.8), 0.7], glow: 1 });
        b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.8, 0.2, 0.8], tint: PALETTE.concrete });
      }
    // Domed digesters and the pipes feeding them.
    for (const x of [-0.9, 1.0]) {
      b.add({ piece: 'concreteCyl', p: [x, 0.12, 1.3], s: [1.6, 0.5, 1.6], tint: 0xe6efe6 });
      b.add({ piece: 'dome', p: [x, 0.62, 1.3], s: [1.6, 1.4, 1.6], tint: 0xbfe8d8 });
      beam(b, 'lumenRib', [x, 1.2, 1.3], [x - 0.4, 2.0, -0.4], 0.1, { glow: 0.8 });
    }
    // Control hall with a living roof.
    b.add({ piece: 'slab', p: [1.6, 0.12, -1.0], s: [1.4, 1.2, 2.2], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [1.6, 1.32, -1.0], s: [1.45, 0.08, 2.25] });
    tree(b, 1.6, 1.4, -1.0, 0.45, 0.4);
    beam(b, 'concreteCyl', [-2.0, 1.6, -1.4], [0.9, 1.6, -1.4], 0.14, { tint: 0xd8dfd6 });
  },
});
