import { defineBuilding } from '../types';
import { PALETTE, grassTufts, tree } from '../kit';

const TIERS = 6;
const STONE = 0xf6f2ea;

export default defineBuilding({
  id: 'travertine-baths',
  name: 'Travertine Thermal Baths',
  description:
    'Six white terraces of warm mineral pools spill one into the next down a gentle slope, heated by the data spire’s waste heat. The island’s favourite place to do absolutely nothing.',
  category: 'nature',
  footprint: [10, 10],
  stats: {
    cost: 3600,
    energy: -10,
    eco: 14,
    happiness: 32,
    population: 0,
    jobs: 60,
    pollution: 0,
    water: -24,
  },
  growthTime: 170,
  variants: 1,
  style: 'limestone',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 9.8], tint: STONE });
    // Terraces climb toward -z; each holds a pool that spills over its front lip.
    for (let i = 0; i < TIERS; i++) {
      const z = 3.9 - i * 1.25;
      const top = 0.4 + i * 0.55;
      const w = 9.4 - i * 0.7;
      b.add({
        piece: 'slab',
        p: [0, 0.2, z - 0.6],
        s: [w, top - 0.2, 1.3 + (TIERS - 1 - i) * 0.01],
        tint: STONE,
      });
      b.add({ piece: 'pool', p: [0, top, z - 0.65], s: [w - 0.4, 0.05, 1.0] });
      for (const x of [-w * 0.3, w * 0.05, w * 0.32])
        b.add({ piece: 'waterfall', p: [x, top - 0.55, z + 0.06], s: [w * 0.18, 0.55, 1], glow: 0.6 });
    }
    // Bathhouse at the top, with trees either side.
    const ty = 0.4 + TIERS * 0.55;
    b.add({ piece: 'slab', p: [0, 0.2, -4.3], s: [9.4, ty - 0.2, 1.2], tint: STONE });
    b.add({ piece: 'glassCyl', p: [0, ty, -4.2], s: [3.2, 1.4, 1.4], tint: PALETTE.glassWarm, glow: 0.6 });
    b.add({ piece: 'dome', p: [0, ty + 1.4, -4.2], s: [3.4, 2.2, 1.6] });
    for (const sx of [-1, 1]) {
      grassTufts(b, sx * 3.4, ty, -4.3, 2.4, 1, 12);
      tree(b, sx * 3.6, ty, -4.3, 0.8, 0.1);
    }
    b.add({ piece: 'haloRing', p: [0, 0.45, 3.3], s: [3, 4, 1.2], glow: 0.8 });
  },
});
