import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'pod-interchange',
  name: 'Pod Interchange',
  description:
    'A neighbourhood transit hub: three tiers of pod berths round a glass concourse, flying a whole quarter’s commuters straight to the work, industry and stadium districts so the streets stay clear.',
  category: 'utility',
  footprint: [4, 4],
  // Upkeep like three docks (it replaces several): transit should stay cheap to run.
  stats: {
    cost: 1200,
    energy: -20,
    eco: 3,
    happiness: 5,
    population: 0,
    jobs: 20,
    pollution: 0,
    upkeep: 0.2,
  },
  growthTime: 110,
  transit: { radius: 22, riders: 1600 },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [3.9, 0.12, 3.9] });
    grassTufts(b, 0, 0.12, 0, 3.6, 3.6, 24);
    flowers(b, 0, 0.12, 0, 1.8, 20, 0, 0.6);
    // Glass concourse at street level.
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0], s: [1.8, 1.0, 1.8], tint: PALETTE.glass, glow: 0.5 });
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [0.7, 6.4, 0.7], tint: PALETTE.concrete });
    // Three berthing tiers, each a ring of pods with vines from the rim.
    for (let k = 0; k < 3; k++) {
      const y = 1.6 + k * 1.5;
      const r = 1.75 - k * 0.3;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.1, r * 2], tint: 0xe9f4ef, glow: 0.3 });
      b.add({ piece: 'haloRing', p: [0, y + 0.1, 0], s: [r * 2.02, 2, r * 2.02], glow: 0.9 });
      const berths = 8 - k * 2;
      for (let i = 0; i < berths; i++) {
        const a = (i / berths) * TAU + k * 0.4;
        b.add({
          piece: 'pod',
          p: [Math.cos(a) * (r - 0.25), y + 0.1, Math.sin(a) * (r - 0.25)],
          s: 0.42,
          r: -a,
          glow: 0.8,
          growAt: 0.05 + i * 0.04,
        });
      }
      for (const [nx, nz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        ivyEdge(b, nx * r * 0.92, y, nz * r * 0.92, r, nx, nz, 2);
    }
    // Solar leaf crown and corner trees.
    for (let i = 0; i < 10; i++)
      b.add({
        piece: 'solarLeaf',
        p: [0, 6.5, 0],
        s: [1.2, 1, 1.0],
        r: (i / 10) * TAU,
        rz: 0.4,
        growAt: 0.3,
      });
    for (const [x, z] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [-1.6, 1.6],
      [1.6, 1.6],
    ] as const)
      tree(b, x, 0.12, z, 0.45, 0.2);
  },
});
