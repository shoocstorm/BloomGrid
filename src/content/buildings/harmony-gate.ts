import { defineBuilding } from '../types';
import { PALETTE, beam, bench, entrance, flowers, grassTufts, ivyEdge, lamp, lilies, tree } from '../kit';

const H = 18;

export default defineBuilding({
  id: 'harmony-gate',
  name: 'Harmony Gate',
  description:
    'Two office towers lean toward each other until they meet in a sky-garden keystone eighteen storeys up, framing the avenue like a gate. The island’s co-ops and studios share its floors.',
  category: 'commercial',
  footprint: [12, 8],
  stats: {
    cost: 5000,
    energy: -36,
    eco: 10,
    happiness: 14,
    population: 0,
    jobs: 260,
    pollution: 1,
    water: -12,
  },
  growthTime: 220,
  variants: 1,
  style: 'terracotta',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [11.8, 0.2, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 0], s: [4.4, 0.05, 6.4] });
    for (const sx of [-1, 1]) {
      // A leaning tower: a glass shaft with a moss spine and a lit edge.
      beam(b, 'glassBox', [sx * 4.2, 0.2, 0], [sx * 1.5, H, 0], 2.8, { tint: PALETTE.glass, glow: 0.08 });
      beam(b, 'mossBox', [sx * 4.2, 0.2, -1.45], [sx * 1.5, H, -1.45], 1.2, { growAt: 0.1 });
      beam(b, 'lumenRib', [sx * 4.2, 0.2, 1.45], [sx * 1.5, H, 1.45], 0.1, { glow: 0.9 });
      grassTufts(b, sx * 5.2, 0.2, 0, 1.2, 7, 20);
      tree(b, sx * 5.2, 0.2, 2.8, 0.7, 0.1);
      tree(b, sx * 5.2, 0.2, -2.8, 0.7, 0.1);
    }
    // Keystone sky garden where the towers meet.
    b.add({ piece: 'glassBox', p: [0, H - 1.2, 0], s: [6.2, 2.0, 3.2], tint: PALETTE.glassWarm, glow: 0.4 });
    b.add({ piece: 'slab', p: [0, H + 0.8, 0], s: [6.8, 0.2, 3.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, H + 1.0, 0], s: [6.4, 0.08, 3.4] });
    grassTufts(b, 0, H + 1.08, 0, 6, 3, 30, 0.1);
    flowers(b, 0, H + 1.08, 0, 1.5, 24, 0.1, 0.7);
    for (const x of [-2.2, 0, 2.2]) tree(b, x, H + 1.08, 0, 0.7, 0.2);
    for (const nz of [-1, 1]) ivyEdge(b, 0, H + 0.8, nz * 1.9, 6, 0, nz, 6);
    b.add({ piece: 'haloRing', p: [0, H + 1.1, 0], s: [4.2, 4, 4.2], glow: 1 });
    // Street level (D-097): stepping stones through the gate across the pool, lilies, a lit lobby at each tower's
    // foot, lamps at the pool corners and benches looking over the water.
    for (let i = 0; i < 7; i++)
      b.add({
        piece: 'slab',
        p: [0, 0.2, -2.85 + i * 0.95],
        s: [0.6, 0.08, 0.55],
        r: (i % 2) * 0.12,
        tint: 0xe4dac8,
      });
    for (const sx of [-1, 1]) {
      lilies(b, sx * 1.35, 0.25, 0, 1.3, 6, 9);
      entrance(b, sx * 4.9, 0.2, 1.48, 0.8, 0.5);
      for (const z of [-3.4, 3.4]) lamp(b, sx * 2.55, 0.2, z, 0.6);
    }
    bench(b, -2.55, 0.2, -1.6, 0.5, true);
    bench(b, 2.55, 0.2, -1.6, 0.5, true, true);
  },
});
