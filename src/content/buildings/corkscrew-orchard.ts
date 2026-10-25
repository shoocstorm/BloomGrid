import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const STEPS = 64;
const H = 20;
const R = 2.7;

export default defineBuilding({
  id: 'corkscrew-orchard',
  name: 'Corkscrew Orchard',
  description:
    'An orchard that climbs: a ramp of fruit trees spirals five times round a glass farm core, so pickers walk from the street to the canopy crown without a single stair.',
  category: 'food',
  footprint: [8, 8],
  stats: {
    cost: 3300,
    energy: -10,
    eco: 20,
    happiness: 12,
    population: 0,
    jobs: 80,
    pollution: -2,
    water: -24,
    food: 500,
  },
  growthTime: 200,
  pollinators: 3,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [7.6, 0.25, 7.6], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.25, 0], s: [5.2, 0.06, 5.2], r: Math.PI / 4 });
    grassTufts(b, 0, 0.31, 0, 5, 5, 40);
    b.add({ piece: 'glassCyl', p: [0, 0.25, 0], s: [3.2, H, 3.2], tint: PALETTE.glassWarm, glow: 0.3 });
    b.add({ piece: 'algaeTank', p: [0, 0.25, 0], s: [1.2, H, 1.2] });
    // The spiral ramp: planted treads with a tree on every other one and a lit kerb.
    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const a = t * TAU * 5;
      const y = 0.4 + t * (H - 0.6);
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      b.add({ piece: 'slab', p: [x, y, z], s: [1.4, 0.12, 1.3], r: -a, tint: 0xe9e2d0 });
      b.add({ piece: 'mossBox', p: [x, y + 0.12, z], s: [1.2, 0.05, 1.1], r: -a });
      if (i % 2 === 0) tree(b, x * 1.08, y + 0.17, z * 1.08, 0.55, 0.05 + t * 0.6);
      else flowers(b, x, y + 0.17, z, 0.4, 4, 0.1, 0.8);
      if (i % 3 === 0)
        b.add({ piece: 'lumenRib', p: [x * 1.27, y - 0.2, z * 1.27], s: [0.08, 0.35, 0.08], glow: 0.9 });
      if (i % 4 === 0)
        b.add({
          piece: 'ivy',
          p: [x * 1.25, y, z * 1.25],
          s: [0.5, 1.0, 1],
          r: Math.atan2(x, z),
          growAt: 0.3,
        });
    }
    // Canopy crown.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      b.add({
        piece: 'canopy',
        p: [Math.cos(a) * 1.0, H + 0.2, Math.sin(a) * 1.0],
        s: 2.4,
        tint: PALETTE.leaves[k],
        growAt: 0.4,
      });
    }
    b.add({ piece: 'canopy', p: [0, H + 1.0, 0], s: 2.8, tint: 0x8fd35a, glow: 0.3, growAt: 0.5 });
  },
});
