import { defineBuilding } from '../types';
import { PALETTE, TRIM, crate, grassTufts, lamp, roofMeadow } from '../kit';

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
    // Detail (D-096): a sunken entrance ramp between retaining walls, a sign, supply crates, benches and lamps.
    for (const x of [-0.32, 0.32]) b.add({ piece: 'slab', p: [x, 0.1, 0.9], s: [0.06, 0.3, 0.5], tint: 0xcfc8ba });
    for (let k = 0; k < 4; k++) b.add({ piece: 'slab', p: [0, 0.1, 1.08 - k * 0.1], s: [0.56, 0.02 + k * 0.05, 0.1], tint: 0xbdb5a5 });
    b.add({ piece: 'slab', p: [0.55, 0.1, 0.85], s: [0.04, 0.4, 0.04], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [0.55, 0.42, 0.87], s: [0.28, 0.16, 0.015], tint: 0x2f8f86, glow: 0.6 });
    crate(b, -0.7, 0.1, 0.55, 0.16, 0.3, 0xd8463a);
    crate(b, -0.72, 0.23, 0.56, 0.14, -0.2, TRIM.teal);
    b.add({ piece: 'timberBox', p: [-0.65, 0.1, -0.75], s: [0.4, 0.07, 0.12], tint: 0xa47c56 });
    lamp(b, -0.85, 0.1, 0.85, 0.45);
  },
});
