import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'ember-watch',
  name: 'Ember Watch Station',
  description:
    'Fire and rescue for a neighbourhood: a timber engine hall, a lookout tower with a storm beacon, a rain cistern and a firefighting drone. Fights any fire within reach on its own while it is powered and staffed.',
  category: 'utility',
  footprint: [3, 3],
  stats: {
    cost: 900,
    energy: -10,
    eco: 2,
    happiness: 4,
    population: 0,
    jobs: 24,
    pollution: 0,
    upkeep: 0.18,
  },
  growthTime: 90,
  response: { radius: 32 },
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [2.9, 0.1, 2.9], tint: PALETTE.concrete });
    grassTufts(b, -0.9, 0.1, 1.0, 1.0, 0.8, 8);
    flowers(b, -0.9, 0.1, 1.0, 0.4, 6);
    // Engine hall with ember-red doors.
    b.add({ piece: 'timberBox', p: [0.35, 0.1, -0.25], s: [2.0, 1.1, 2.1], tint: PALETTE.timber });
    for (const x of [-0.15, 0.85])
      b.add({ piece: 'slab', p: [x, 0.1, 0.86], s: [0.8, 0.85, 0.04], tint: 0xd8463a, glow: 0.2 });
    roofMeadow(b, 1.2, 2.0, 2.1);
    ivyEdge(b, 0.35, 1.2, -1.3, 1.9, 0, -1, 4);
    // Lookout tower with the storm beacon.
    b.add({ piece: 'timberBox', p: [-1.0, 0.1, -0.85], s: [0.6, 3.2, 0.6], tint: 0x8a6545 });
    b.add({ piece: 'slab', p: [-1.0, 3.3, -0.85], s: [0.95, 0.1, 0.95], tint: PALETTE.concrete });
    b.add({ piece: 'lumenRib', p: [-1.0, 3.4, -0.85], s: [0.25, 0.3, 0.25], glow: 1, tint: 0xff6a4a });
    b.add({ piece: 'haloRing', p: [-1.0, 3.55, -0.85], s: [0.9, 2, 0.9], glow: 0.9 });
    // Rain cistern and the firefighting drone over the yard.
    b.add({ piece: 'algaeTank', p: [-1.0, 0.1, 0.55], s: [0.6, 1.2, 0.6], tint: 0x6fc6ff, glow: 0.4 });
    b.add({ piece: 'drone', p: [0.4, 2.1, 0.9], s: 0.3, glow: 1 });
  },
});
