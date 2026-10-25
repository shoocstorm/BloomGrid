import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const TIERS = 7;

export default defineBuilding({
  id: 'lotus-pagoda',
  name: 'Lotus Pagoda Museum',
  description:
    'A seven-storey pagoda whose eaves are solar petals, each tier a gallery of the island’s history from mangrove village to bloom city. Lanterns trace its rooflines at night.',
  category: 'tech',
  footprint: [8, 8],
  stats: { cost: 3200, energy: -12, eco: 6, happiness: 22, population: 0, jobs: 60, pollution: 0, water: -4 },
  growthTime: 180,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.4, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.4, 3.2], s: [6.8, 0.05, 1.1] });
    for (const [x, z] of [
      [-3.2, -3.2],
      [3.2, -3.2],
    ] as const) {
      grassTufts(b, x, 0.4, z, 1.2, 1.2, 8);
      tree(b, x, 0.4, z, 0.7, 0.1);
    }
    flowers(b, 0, 0.4, 3.2, 1.0, 10, 0, 0.6);
    let y = 0.4;
    for (let i = 0; i < TIERS; i++) {
      const d = 4.2 - i * 0.42;
      const h = 1.5 - i * 0.06;
      b.add({ piece: 'glassCyl', p: [0, y, 0], s: [d, h, d], tint: PALETTE.glassWarm, glow: 0.4 });
      y += h;
      // Eaves: a ring of petals curving down and out, with a lantern ring at the lip.
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d + 0.6, 0.15, d + 0.6], tint: 0xe9e2d0 });
      const n = 12 - Math.floor(i / 2);
      for (let k = 0; k < n; k++)
        b.add({
          piece: 'solarLeaf',
          p: [0, y + 0.1, 0],
          s: [d * 0.5 + 1.1, 1, 1.0],
          r: (k / n) * TAU + i * 0.2,
          rz: -0.32,
          growAt: 0.05 * i,
        });
      b.add({ piece: 'haloRing', p: [0, y - 0.3, 0], s: [d + 1.6, 4, d + 1.6], glow: 0.8 });
      y += 0.25;
    }
    b.add({ piece: 'spireCone', p: [0, y, 0], s: [1.0, 3.0, 1.0], tint: PALETTE.glassWarm, glow: 0.6 });
    for (let i = 0; i < 5; i++)
      b.add({
        piece: 'haloRing',
        p: [0, y + 0.5 + i * 0.45, 0],
        s: [0.9 - i * 0.12, 4, 0.9 - i * 0.12],
        glow: 1,
      });
  },
});
