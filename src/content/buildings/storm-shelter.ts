import { defineBuilding } from '../types';
import { PALETTE, grassTufts, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'storm-shelter',
  name: 'Storm Shelter',
  description:
    'A turf-roofed bunker with a siren mast. Residents within reach ride out tornadoes and tsunamis inside: far less harmony lost when one strikes nearby.',
  category: 'utility',
  footprint: [2, 2],
  stats: { cost: 400, energy: -2, eco: 1, happiness: 1, population: 0, jobs: 2, pollution: 0, upkeep: 0.06 },
  growthTime: 60,
  shelter: { radius: 26 },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.9, 0.1, 1.9], tint: PALETTE.concrete });
    b.add({ piece: 'concreteCyl', p: [0, 0.1, 0], s: [1.5, 0.5, 1.5], tint: 0xcfc8ba });
    b.add({ piece: 'dome', p: [0, 0.6, 0], s: [1.5, 0.6, 1.5], tint: 0x7ccf7a });
    roofMeadow(b, 0.62, 0.8, 0.8);
    grassTufts(b, 0, 0.1, 0, 1.6, 1.6, 6);
    // Blast door and the siren mast.
    b.add({ piece: 'slab', p: [0, 0.1, 0.72], s: [0.5, 0.42, 0.06], tint: 0xffc94a, glow: 0.4 });
    b.add({ piece: 'timberBox', p: [0.75, 0.1, -0.75], s: [0.08, 1.8, 0.08], tint: PALETTE.bark });
    b.add({ piece: 'concreteCyl', p: [0.75, 1.9, -0.75], s: [0.25, 0.18, 0.25], tint: 0xd8463a, glow: 0.6 });
  },
});
