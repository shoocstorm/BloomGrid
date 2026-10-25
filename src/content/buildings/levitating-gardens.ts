import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;
/** Floating islands: x, z, height, radius. */
const ISLANDS = [
  [-1.8, -1.5, 4.4, 2.4],
  [2.2, -0.4, 7.2, 1.9],
  [-0.6, 2.4, 9.8, 1.5],
] as const;

export default defineBuilding({
  id: 'levitating-gardens',
  name: 'Levitating Gardens',
  description:
    'Three garden islands held aloft on maglev tethers above a lily pond, each an orchard spilling its own waterfall. Nobody quite remembers how they were lifted; everyone comes to see them at dusk.',
  category: 'nature',
  footprint: [10, 10],
  stats: {
    cost: 4200,
    energy: -20,
    eco: 42,
    happiness: 32,
    population: 0,
    jobs: 30,
    pollution: -4,
    water: -10,
    food: 300,
  },
  growthTime: 220,
  pollinators: 4,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.15, 9.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.15, 0], s: [8.6, 0.06, 8.6] });
    for (let i = 0; i < 18; i++) {
      const a = b.rand() * TAU;
      const d = 1 + b.rand() * 2.9;
      b.add({
        piece: 'lily',
        p: [Math.cos(a) * d, 0.21, Math.sin(a) * d],
        s: b.range(0.4, 0.7),
        r: b.rand() * TAU,
        tint: 0xffb7d5,
        glow: 0.5,
        growAt: b.rand() * 0.5,
      });
    }
    for (let i = 0; i < 6; i++)
      b.add({
        piece: 'koi',
        p: [b.range(-3, 3), 0.17, b.range(-3, 3)],
        s: 0.3,
        r: b.rand() * TAU,
        tint: i % 2 ? 0xff8a3d : 0xfff4f0,
      });

    ISLANDS.forEach(([x, z, y, r], n) => {
      // Rocky underside tapering to a point, a planted top, ivy over the rim.
      for (let j = 0; j < 4; j++) {
        const rr = r * (1 - j * 0.24);
        b.add({
          piece: 'concreteCyl',
          p: [x, y - (j + 1) * 0.55, z],
          s: [rr * 2, 0.56, rr * 2],
          tint: j % 2 ? 0x8a7a64 : 0x9c8b70,
        });
      }
      b.add({ piece: 'concreteCyl', p: [x, y - 0.12, z], s: [r * 2, 0.12, r * 2], tint: 0x5f8f3a });
      grassTufts(b, x, y, z, r * 1.3, r * 1.3, 26, 0.05);
      flowers(b, x, y, z, r * 0.75, 22, 0.1, 0.7);
      for (let t = 0; t < 3 - n; t++)
        tree(b, x + b.range(-0.5, 0.5) * r, y, z + b.range(-0.5, 0.5) * r, 0.75 - n * 0.1, 0.2);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        ivyEdge(b, x + Math.sin(a) * r, y - 0.1, z + Math.cos(a) * r, r * 0.7, Math.sin(a), Math.cos(a), 2);
      }
      // Waterfall from the rim into the pond, a glowing levitation ring and light tethers.
      const wa = 0.6 + n * 2.1;
      b.add({
        piece: 'waterfall',
        p: [x + Math.sin(wa) * r * 0.92, 0.22, z + Math.cos(wa) * r * 0.92],
        s: [0.6, y - 0.4, 1],
        r: wa,
        glow: 0.8,
      });
      b.add({ piece: 'haloRing', p: [x, y - 2.5, z], s: [r * 1.4, 4, r * 1.4], glow: 0.9 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + n;
        b.add({
          piece: 'lumenRib',
          p: [x + Math.cos(a) * r * 0.55, 0.21, z + Math.sin(a) * r * 0.55],
          s: [0.05, y - 1.4, 0.05],
          glow: 0.8,
        });
      }
    });
  },
});
