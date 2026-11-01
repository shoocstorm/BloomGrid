import { defineBuilding } from '../types';
import { PALETTE, TRIM, flowers, grassTufts, ivyEdge, lamp, roofMeadow } from '../kit';

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
    // Detail (D-095): a fire engine on the apron, red trims, the hall's windows, a siren and a flag on the tower.
    const [ex, ez] = [0.85, 1.12];
    b.add({ piece: 'slab', p: [ex, 0.16, ez], s: [0.36, 0.2, 0.62], tint: TRIM.red });
    b.add({ piece: 'slab', p: [ex, 0.36, ez + 0.2], s: [0.34, 0.13, 0.2], tint: TRIM.red });
    b.add({ piece: 'glassBox', p: [ex, 0.38, ez + 0.305], s: [0.3, 0.08, 0.01], tint: 0x2a3a44 });
    b.add({ piece: 'slab', p: [ex, 0.36, ez - 0.12], s: [0.2, 0.05, 0.36], tint: TRIM.steel });
    b.add({ piece: 'lumenRib', p: [ex, 0.5, ez + 0.2], s: [0.22, 0.03, 0.05], tint: 0x6aa8ff, glow: 1 });
    for (const sx of [-1, 1]) for (const z of [ez - 0.2, ez + 0.18]) b.add({ piece: 'concreteCyl', p: [ex + sx * 0.18, 0.1, z], s: [0.04, 0.12, 0.12], rz: Math.PI / 2, tint: 0x222222 });
    b.add({ piece: 'slab', p: [0.35, 1.08, 0.86], s: [2.02, 0.05, 0.03], tint: TRIM.red });
    for (const x of [-0.45, 1.15]) b.add({ piece: 'glassBox', p: [x, 0.55, 0.86], s: [0.24, 0.2, 0.02], tint: 0xd6f2ee });
    for (let k = 0; k < 4; k++) b.add({ piece: 'glassBox', p: [-1.0, 0.8 + k * 0.6, -0.54], s: [0.16, 0.22, 0.02], tint: 0xd6f2ee });
    b.add({ piece: 'concreteCyl', p: [-0.82, 3.42, -0.68], s: [0.08, 0.1, 0.08], tint: TRIM.steel });
    b.add({ piece: 'timberBox', p: [1.35, 0.1, 1.3], s: [0.03, 1.4, 0.03], tint: TRIM.steel });
    b.add({ piece: 'slab', p: [1.24, 1.3, 1.3], s: [0.22, 0.13, 0.008], tint: TRIM.red });
    lamp(b, -0.25, 0.1, 1.35);
  },
});
