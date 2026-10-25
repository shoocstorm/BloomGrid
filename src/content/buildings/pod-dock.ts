import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge } from '../kit';

export default defineBuilding({
  id: 'pod-dock',
  name: 'Green Pod Dock',
  description:
    'A vine-draped sky-dock where autonomous commuter pods recharge on solar-inductive leaves. Takes nearby commuters off the highways and flies them along glowing sky-lanes.',
  category: 'utility',
  footprint: [2, 2],
  stats: { cost: 240, energy: -8, eco: 2, happiness: 3, population: 0, jobs: 6, pollution: 0 },
  growthTime: 60,
  transit: { radius: 12, riders: 420 },
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.9, 0.1, 1.9] });
    grassTufts(b, 0, 0.1, 0, 1.7, 1.7, 12);
    flowers(b, 0, 0.1, 0, 0.85, 14, 0, 0.6);
    const h = b.range(2.6, 3.2);
    b.add({ piece: 'concreteCyl', p: [0, 0.1, 0], s: [0.34, h, 0.34], tint: PALETTE.concrete });
    b.add({ piece: 'glassCyl', p: [0, 0.1, 0], s: [0.5, 0.5, 0.5], tint: PALETTE.glass });
    // Two docking rings with pods berthed around them and vines hanging from the rims.
    for (const [k, y] of [0.45, 0.78].map((f, i) => [i, 0.1 + h * f] as const)) {
      const r = 0.82 - k * 0.12;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.07, r * 2], tint: 0xe9f4ef, glow: 0.3 });
      const berths = 5 - k;
      for (let i = 0; i < berths; i++) {
        const a = (i / berths) * Math.PI * 2 + k * 0.6;
        b.add({ piece: 'pod', p: [Math.cos(a) * (r - 0.12), y + 0.07, Math.sin(a) * (r - 0.12)], s: 0.32, r: -a, glow: 0.8, growAt: 0.1 + i * 0.05 });
      }
      for (const [nx, nz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        ivyEdge(b, nx * r * 0.9, y, nz * r * 0.9, r, nx, nz, 2);
    }
    // Solar-inductive leaf crown.
    const top = h + 0.1;
    for (let i = 0; i < 8; i++) b.add({ piece: 'solarLeaf', p: [0, top, 0], s: [0.75, 1, 0.75], r: (i / 8) * Math.PI * 2, rz: 0.45, growAt: 0.3 + i * 0.04 });
  },
});
