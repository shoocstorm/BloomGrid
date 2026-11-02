import { defineBuilding } from '../types';
import { PALETTE, bench, flowers, gableRoof, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'pollinator-sanctuary',
  name: 'Pollinator Sanctuary',
  description: 'A wildflower maze with bee towers and moth lanterns. Floods the district with pollen: everything nearby blooms.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 75, energy: 0, eco: 7, happiness: 4, population: 0, jobs: 1, pollution: 0, water: -1 },
  growthTime: 60,
  pollinators: 3.5,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.05, 1.96] });
    flowers(b, 0, 0.05, 0, 0.92, 70, 0, 0.9);
    grassTufts(b, 0, 0.05, 0, 1.8, 1.8, 18, 0);
    // Bee towers: timber stacks topped with blossoms.
    for (const [x, z] of [
      [-0.55, -0.55],
      [0.6, 0.5],
    ] as const) {
      b.add({ piece: 'slab', p: [x, 0.05, z], s: [0.18, 0.55, 0.18], tint: PALETTE.timber });
      b.add({ piece: 'flower', p: [x, 0.6, z], s: 0.22, tint: 0xffe08a, glow: 0.9, growAt: 0.2 });
    }
    tree(b, 0.6, 0.05, -0.6, 0.35, 0.3);
    // Visitors (D-097): an insect hotel of drilled timber and a bench.
    b.add({ piece: 'timberBox', p: [-0.6, 0.05, 0.6], s: [0.3, 0.32, 0.12], tint: 0x9b6e45 });
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'concreteCyl', p: [-0.7 + (i % 3) * 0.1, 0.13 + Math.floor(i / 3) * 0.12, 0.66], s: [0.05, 0.02, 0.05], rx: Math.PI / 2, tint: 0x3b2f26 });
    b.add({ piece: 'slab', p: [-0.6, 0.37, 0.6], s: [0.38, 0.03, 0.18], tint: 0xc8714f });
    bench(b, 0.1, 0.05, 0.75);

    // Levels (D-100). Level 2: a bee hotel wall (a timber frame of nesting tubes under a little roof) and a
    // shallow drinking dish with stones.
    b.level(2, () => {
      b.add({ piece: 'timberBox', p: [0.0, 0.05, -0.8], s: [0.6, 0.45, 0.14], tint: 0x9b6e45 });
      for (let i = 0; i < 10; i++)
        b.add({ piece: 'concreteCyl', p: [-0.22 + (i % 5) * 0.11, 0.15 + Math.floor(i / 5) * 0.16, -0.72], s: [0.06, 0.02, 0.06], rx: Math.PI / 2, tint: i % 3 ? 0x3b2f26 : 0xc8a57c });
      gableRoof(b, 0.0, 0.5, -0.8, 0.66, 0.2, { pitch: 0.5, tint: 0xc8714f, overhang: 0.03 });
      b.add({ piece: 'concreteCyl', p: [0.2, 0.05, 0.2], s: [0.3, 0.04, 0.3], tint: 0xd8d0c0 });
      b.add({ piece: 'pool', p: [0.2, 0.09, 0.2], s: [0.22, 0.01, 0.22] });
    });
    // Level 3: a willow-dome butterfly house of glass with a lit beacon flower, and a third totem.
    b.level(3, () => {
      b.add({ piece: 'dome', p: [0.15, 0.05, -0.1], s: [0.75, 0.7, 0.75], tint: PALETTE.glass });
      for (let k = 0; k < 3; k++) b.add({ piece: 'willowArch', p: [0.15, 0.05, -0.1], s: [0.75, 0.7, 0.75], r: (k / 3) * Math.PI, tint: PALETTE.bark });
      b.add({ piece: 'flower', p: [0.15, 0.42, -0.1], s: 0.18, tint: 0xffb7d5, glow: 1 });
      b.add({ piece: 'slab', p: [-0.65, 0.05, -0.1], s: [0.16, 0.7, 0.16], tint: PALETTE.timber });
      b.add({ piece: 'flower', p: [-0.65, 0.75, -0.1], s: 0.24, tint: 0xc9b6ff, glow: 0.9 });
    });
  },
});
