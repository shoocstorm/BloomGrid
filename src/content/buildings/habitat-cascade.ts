import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const M = 1.7; // module width
const MH = 1.05; // module height (three floors)
const LEVELS = 7;

export default defineBuilding({
  id: 'habitat-cascade',
  name: 'Habitat Cascade',
  description:
    'Prefab garden homes stacked like a hillside village, each one standing on its neighbour’s roof and every roof somebody’s kitchen garden. Pods berth on the top terraces. Stepped terraces cascade toward the promenade.',
  category: 'residential',
  footprint: [11, 9],
  stats: {
    cost: 4100,
    energy: -24,
    eco: 16,
    happiness: 16,
    population: 420,
    jobs: 12,
    pollution: 0,
    water: -26,
    food: 400,
  },
  // Its roofs are kitchen gardens, and pods berth on the top terraces so residents fly to work.
  transit: { radius: 8, riders: 400 },
  growthTime: 220,
  pollinators: 1,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [10.8, 0.2, 8.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.2, 3.8, 10.4, 1.0, 30);
    // Glass circulation cores.
    for (const x of [-2.2, 2.2])
      b.add({
        piece: 'glassCyl',
        p: [x, 0.2, -0.6],
        s: [1.1, LEVELS * MH - 0.4, 1.1],
        tint: PALETTE.glassWarm,
        glow: 0.4,
      });
    // Pod berths on the upper terraces.
    for (const [x, z] of [
      [-1.2, -2.6],
      [1.4, -2.4],
    ] as const)
      b.add({ piece: 'pod', p: [x, 0.2 + LEVELS * MH + 0.1, z], s: 0.9, r: 0.3, glow: 0.8, growAt: 0.2 });
    // Modules: each level narrows and steps back from the promenade (+z), with a garden on every roof.
    for (let L = 0; L < LEVELS; L++) {
      const halfX = 4.5 - L * 0.42;
      const zMin = -3.5;
      const zMax = 3.3 - L * 0.75;
      const n = 9 - L;
      for (let k = 0; k < n; k++) {
        const x = -halfX + ((k + b.range(0.2, 0.8)) / n) * halfX * 2;
        const z = b.range(zMin + M * 0.6, Math.max(zMin + M * 0.6, zMax - M * 0.6));
        const y = 0.2 + L * MH;
        const r = b.rand() < 0.5 ? 0 : Math.PI / 2;
        const [w, d] = r ? [M * 1.3, M] : [M, M * 1.3];
        b.add({
          piece: 'glassBox',
          p: [x, y, z],
          s: [M, MH, M * 1.3],
          r,
          tint: PALETTE.glassWarm,
          glow: 0.1,
        });
        b.add({
          piece: 'timberBox',
          p: [x, y + MH - 0.06, z],
          s: [M + 0.12, 0.08, M * 1.3 + 0.12],
          r,
          tint: 0xc8a57c,
        });
        b.add({ piece: 'mossBox', p: [x, y + MH + 0.02, z], s: [M - 0.1, 0.07, M * 1.3 - 0.1], r });
        grassTufts(b, x, y + MH + 0.09, z, w * 0.8, d * 0.8, 5, 0.05);
        flowers(b, x, y + MH + 0.09, z, 0.5, 4, 0.1, 0.7);
        if (b.rand() < 0.35)
          tree(b, x + b.range(-0.3, 0.3), y + MH + 0.09, z + b.range(-0.3, 0.3), 0.38, 0.2 + L * 0.06);
        if (b.rand() < 0.5) ivyEdge(b, x, y + MH, z + d / 2, w * 0.8, 0, 1, 2);
      }
    }
  },
});
