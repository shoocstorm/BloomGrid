import { defineBuilding } from '../types';
import { PALETTE, TRIM, flowers, grassTufts, ivyEdge, lamp } from '../kit';

export default defineBuilding({
  id: 'pod-dock',
  name: 'Green Pod Dock',
  description:
    'A vine-draped sky-dock where autonomous commuter pods recharge on solar-inductive leaves. Takes nearby commuters off the highways and flies them along glowing sky-lanes.',
  category: 'utility',
  footprint: [2, 2],
  stats: { cost: 240, energy: -8, eco: 2, happiness: 3, population: 0, jobs: 6, pollution: 0 },
  growthTime: 60,
  requires: 'skylanes',
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
    const crown = (y: number) => {
      for (let i = 0; i < 8; i++) b.add({ piece: 'solarLeaf', p: [0, y, 0], s: [0.75, 1, 0.75], r: (i / 8) * Math.PI * 2, rz: 0.45, growAt: 0.3 + i * 0.04 });
    };
    b.upTo(1, () => crown(top));
    // Detail (D-096): a waiting shelter with a bench and a lit departures pillar, the lift door in the core,
    // glass rails round both docking rings and a paved approach.
    b.add({ piece: 'slab', p: [0, 0.1, 0.72], s: [1.2, 0.025, 0.42], tint: 0xe4dac8 });
    for (const x of [-0.45, 0.45]) b.add({ piece: 'timberBox', p: [x, 0.1, 0.82], s: [0.035, 0.42, 0.035], tint: TRIM.cream });
    b.add({ piece: 'glassBox', p: [0, 0.52, 0.78], s: [1.05, 0.03, 0.34], tint: 0xd6f2ee });
    b.add({ piece: 'timberBox', p: [0, 0.1, 0.9], s: [0.6, 0.07, 0.12], tint: 0xa47c56 });
    b.add({ piece: 'slab', p: [0.62, 0.1, 0.6], s: [0.1, 0.5, 0.1], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [0.62, 0.42, 0.655], s: [0.08, 0.14, 0.01], tint: 0x7ff7e6, glow: 0.9 });
    b.add({ piece: 'slab', p: [0, 0.12, 0.25], s: [0.2, 0.36, 0.02], tint: 0x2a3a44 });
    b.add({ piece: 'lumenRib', p: [0, 0.5, 0.27], s: [0.16, 0.02, 0.02], tint: 0x7ff7e6, glow: 0.8 });
    lamp(b, -0.8, 0.1, 0.85, 0.45);

    // Levels (D-100): the mast grows and a ring of berths with it. A berth ring at y, radius r.
    const ring = (y: number, r: number, berths: number, k: number) => {
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.07, r * 2], tint: 0xe9f4ef, glow: 0.3 });
      for (let i = 0; i < berths; i++) {
        const a = (i / berths) * Math.PI * 2 + k * 0.6;
        b.add({ piece: 'pod', p: [Math.cos(a) * (r - 0.12), y + 0.07, Math.sin(a) * (r - 0.12)], s: 0.32, r: -a, glow: 0.8 });
      }
    };
    // Level 2: a third, smaller ring above the others with the solar crown lifted over it.
    b.level(2, () => {
      b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [0.28, 0.6, 0.28], tint: PALETTE.concrete });
      ring(top + 0.1, 0.55, 3, 2);
      b.upTo(2, () => crown(top + 0.6));
    });
    // Level 3: two rings more, a glazed waiting lounge round the foot of the mast and a lit beacon crown.
    b.level(3, () => {
      b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [0.26, 1.2, 0.26], tint: PALETTE.concrete });
      ring(top + 0.1, 0.55, 3, 2);
      ring(top + 0.7, 0.45, 2, 3);
      crown(top + 1.2);
      b.add({ piece: 'haloRing', p: [0, top + 1.3, 0], s: [0.6, 2, 0.6], tint: 0x7ff7e6, glow: 1 });
      b.add({ piece: 'glassCyl', p: [0, 0.1, 0], s: [0.85, 0.42, 0.85], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'concreteCyl', p: [0, 0.52, 0], s: [0.95, 0.04, 0.95], tint: 0xe9f4ef });
    });
  },
});
