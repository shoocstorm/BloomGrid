import { defineBuilding } from '../types';
import { PALETTE, grassTufts, ivyEdge, roofMeadow } from '../kit';

/** Shell colours on the drying racks and the mortar caps (the five kinds the factory makes). */
const SHELLS = [0xff6a8a, 0xffc94a, 0x7ff7e6, 0xc9b6ff, 0xfff4f0] as const;

export default defineBuilding({
  id: 'fireworks-factory',
  name: 'Fireworks Factory',
  description:
    'A timber pyrotechnics works with a bermed magazine and a launch yard of mortar racks. Turns paper, salts and plant resins into peony, willow, halo, palm and crackle shells, and fires a show over the city every night. Delights residents, draws visitors; the smoke and the occasional stray spark are the price.',
  category: 'industry',
  footprint: [5, 4],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax; shells cost materials.
  stats: {
    cost: 1300,
    energy: -20,
    eco: -1,
    happiness: 0,
    population: 0,
    jobs: 90,
    pollution: 3,
    water: -3,
    upkeep: 0.2,
  },
  growthTime: 140,
  fireworks: { rate: 6, storage: 120 },
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 3.8], tint: PALETTE.concrete });
    grassTufts(b, 1.6, 0.12, -1.3, 1.2, 0.8, 6);
    // Workshop hall: timber with a meadow roof and lantern-lit doors.
    b.add({ piece: 'timberBox', p: [-1.1, 0.12, -0.55], s: [2.4, 1.3, 2.4], tint: PALETTE.timber });
    roofMeadow(b, 1.42, 2.4, 2.4);
    b.add({ piece: 'slab', p: [-1.1, 0.12, 0.66], s: [1.0, 0.8, 0.04], tint: 0xd8463a, glow: 0.25 });
    b.add({ piece: 'lumenRib', p: [-1.1, 1.0, 0.7], s: [1.4, 0.08, 0.05], glow: 0.9, tint: 0xffc94a });
    ivyEdge(b, -1.1, 1.4, -1.76, 2.2, 0, -1, 5);
    // Bermed magazine: a low drum under a grass dome, kept apart from the hall.
    b.add({ piece: 'concreteCyl', p: [1.5, 0.12, -1.0], s: [1.4, 0.7, 1.4], tint: 0xdcd5c6 });
    b.add({ piece: 'dome', p: [1.5, 0.82, -1.0], s: [1.4, 0.8, 1.4], tint: 0x7ccf7a });
    // Drying racks of finished shells.
    for (let i = 0; i < 5; i++) {
      b.add({
        piece: 'timberBox',
        p: [-2.0 + i * 0.45, 0.12, 1.45],
        s: [0.06, 0.7, 0.06],
        tint: PALETTE.bark,
      });
      for (let k = 0; k < 2; k++)
        b.add({
          piece: 'concreteCyl',
          p: [-2.0 + i * 0.45, 0.35 + k * 0.28, 1.45],
          s: [0.2, 0.2, 0.2],
          tint: SHELLS[(i + k) % SHELLS.length],
          glow: 0.5,
        });
    }
    // Launch yard: mortar racks tilted toward the sky, coloured caps glowing at night.
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 2; k++) {
        const x = 0.75 + i * 0.5;
        const z = 0.75 + k * 0.55;
        b.add({
          piece: 'concreteCyl',
          p: [x, 0.12, z],
          s: [0.26, 0.7, 0.26],
          rz: (i - 1) * 0.18,
          tint: 0x3a4a48,
        });
        b.add({
          piece: 'lumenRib',
          p: [x - (i - 1) * 0.12, 0.8, z],
          s: [0.18, 0.05, 0.18],
          glow: 1,
          tint: SHELLS[(i * 2 + k) % SHELLS.length],
        });
      }
    // Safety beacon mast over the yard.
    b.add({ piece: 'timberBox', p: [2.15, 0.12, 1.6], s: [0.12, 2.4, 0.12], tint: PALETTE.bark });
    b.add({ piece: 'haloRing', p: [2.15, 2.5, 1.6], s: [0.5, 2, 0.5], glow: 1 });
  },
});
