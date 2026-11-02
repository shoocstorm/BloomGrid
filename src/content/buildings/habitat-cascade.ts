import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, bench, flowers, grassTufts, ivyEdge, lamp, tree } from '../kit';

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
  style: 'sage',
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
    const pods = (y: number) => {
      for (const [x, z] of [
        [-1.2, -2.6],
        [1.4, -2.4],
      ] as const)
        b.add({ piece: 'pod', p: [x, y, z], s: 0.9, r: 0.3, glow: 0.8, growAt: 0.2 });
    };
    b.upTo(1, () => pods(0.2 + LEVELS * MH + 0.1));
    // One prefab module: glass, a timber cornice, and a kitchen garden on its roof.
    const module = (L: number, x: number, z: number, r: number) => {
      const y = 0.2 + L * MH;
      const [w, d] = r ? [M * 1.3, M] : [M, M * 1.3];
      b.add({ piece: 'glassBox', p: [x, y, z], s: [M, MH, M * 1.3], r, tint: PALETTE.glassWarm, glow: 0.1 });
      b.add({ piece: 'timberBox', p: [x, y + MH - 0.06, z], s: [M + 0.12, 0.08, M * 1.3 + 0.12], r, tint: 0xc8a57c });
      b.add({ piece: 'mossBox', p: [x, y + MH + 0.02, z], s: [M - 0.1, 0.07, M * 1.3 - 0.1], r });
      grassTufts(b, x, y + MH + 0.09, z, w * 0.8, d * 0.8, 5, 0.05);
      flowers(b, x, y + MH + 0.09, z, 0.5, 4, 0.1, 0.7);
      if (b.rand() < 0.35) tree(b, x + b.range(-0.3, 0.3), y + MH + 0.09, z + b.range(-0.3, 0.3), 0.38, 0.2 + L * 0.06);
      if (b.rand() < 0.5) ivyEdge(b, x, y + MH, z + d / 2, w * 0.8, 0, 1, 2);
    };
    // Modules: each level narrows and steps back from the promenade (+z), with a garden on every roof.
    for (let L = 0; L < LEVELS; L++) {
      const halfX = 4.5 - L * 0.42;
      const zMin = -3.5;
      const zMax = 3.3 - L * 0.75;
      const n = 9 - L;
      for (let k = 0; k < n; k++) {
        const x = -halfX + ((k + b.range(0.2, 0.8)) / n) * halfX * 2;
        const z = b.range(zMin + M * 0.6, Math.max(zMin + M * 0.6, zMax - M * 0.6));
        module(L, x, z, b.rand() < 0.5 ? 0 : Math.PI / 2);
      }
    }
    // The promenade (D-097): a paved walk along the street side with lamps and benches.
    b.add({ piece: 'slab', p: [0, 0.2, 4.1], s: [10.4, 0.02, 0.55], tint: 0xe4dac8 });
    for (const x of [-4.5, -1.5, 1.5, 4.5]) lamp(b, x, 0.22, 4.3, 0.6);
    for (const x of [-3, 0, 3]) bench(b, x, 0.22, 4.0);

    // Levels (D-100): the village keeps stacking. Level 2: two more modules on top with the pod berths moved up
    // onto them, the glass cores rising another storey, and a market of awnings along the promenade.
    const cores = (L: number) => {
      for (const x of [-2.2, 2.2]) {
        b.add({ piece: 'glassCyl', p: [x, 0.2 + L * MH - 0.4, -0.6], s: [1.1, MH, 1.1], tint: PALETTE.glassWarm, glow: 0.4 });
        b.add({ piece: 'concreteCyl', p: [x, 0.2 + (L + 1) * MH - 0.4, -0.6], s: [1.25, 0.08, 1.25], tint: 0xc8a57c });
      }
    };
    b.level(2, () => {
      module(LEVELS, -1.0, -2.55, 0);
      module(LEVELS, 1.05, -2.55, 0);
      cores(LEVELS);
      b.upTo(2, () => pods(0.2 + (LEVELS + 1) * MH + 0.1));
      for (const x of [-3.6, 3.6]) awning(b, x, 0.6, 3.75, 1.4, 0.45, 0xf5efe4, x < 0 ? TRIM.terracotta : TRIM.teal, 6);
    });
    // Level 3: a crowning module with a pergola orchard, the cores capped with lit lanterns, pods berthed on top
    // and a waterfall stepping down the terraces.
    b.level(3, () => {
      module(LEVELS + 1, 0, -2.6, Math.PI / 2);
      cores(LEVELS + 1);
      pods(0.2 + (LEVELS + 1) * MH + 0.1);
      for (const x of [-2.2, 2.2]) b.add({ piece: 'haloRing', p: [x, 0.2 + (LEVELS + 2) * MH - 0.2, -0.6], s: [1.4, 3, 1.4], glow: 0.9 });
      const yt = 0.2 + (LEVELS + 2) * MH + 0.09;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * 0.85, yt, -2.6 + sz * 0.6], s: [0.06, 0.55, 0.06], tint: PALETTE.timber });
      for (let k = 0; k < 5; k++) b.add({ piece: 'timberBox', p: [-0.8 + k * 0.4, yt + 0.55, -2.6], s: [0.05, 0.04, 1.3], tint: PALETTE.timber });
      tree(b, 0, yt, -2.6, 0.5);
      b.add({ piece: 'waterfall', p: [3.2, 0.2, 2.0], s: [0.6, 4.2, 1], glow: 0.7 });
      b.add({ piece: 'pool', p: [3.2, 0.2, 2.6], s: [1.2, 0.05, 0.7] });
    });
  },
});
