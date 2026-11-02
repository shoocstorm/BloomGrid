import { defineBuilding } from '../types';
import { PALETTE, grassTufts, lamp, railing } from '../kit';

export default defineBuilding({
  id: 'mangrove-seawall',
  name: 'Mangrove Seawall',
  description:
    'A living dike of oyster reef, mangroves and earth berms. Keeps king tides and the rising sea out of everything within 9 tiles (up to 1.4 m). Must touch the sea.',
  category: 'utility',
  footprint: [2, 1],
  stats: { cost: 160, energy: 0, eco: 5, happiness: 1, population: 0, jobs: 1, pollution: -1 },
  growthTime: 60,
  placement: { nearWater: true },
  floodproof: true,
  defence: { radius: 9, height: 1.4 },
  recipe(b) {
    // Earth berm with an oyster-reef toe.
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.5, 0.9] });
    b.add({ piece: 'plinth', p: [0, -0.2, 0.42], s: [1.96, 0.35, 0.3], tint: 0xcfc4ae });
    grassTufts(b, 0, 0.5, 0, 1.8, 0.7, 12);
    // Mangroves on stilt roots.
    for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5 + b.range(-0.08, 0.08);
      const z = b.range(-0.15, 0.25);
      for (let k = 0; k < 3; k++)
        b.add({ piece: 'trunk', p: [x + Math.cos(k * 2.1) * 0.08, 0.1, z + Math.sin(k * 2.1) * 0.08], s: [0.03, 0.45, 0.03], rx: Math.sin(k * 2.1) * 0.35, rz: -Math.cos(k * 2.1) * 0.35, tint: PALETTE.bark });
      b.add({ piece: 'trunk', p: [x, 0.45, z], s: [0.05, 0.35, 0.05], tint: PALETTE.bark });
      b.add({ piece: 'canopy', p: [x, 0.72, z], s: b.range(0.32, 0.42), r: b.rand() * 6, tint: b.pick([0x3f8f5f, 0x4e9a3a]), glow: b.rand() < 0.3 ? 0.4 : 0, growAt: 0.1 + i * 0.1 });
    }

    // Levels (D-100). Level 2: a railed timber boardwalk along the crest of the wall with a lamp, and oyster-reef
    // baskets at its foot on the sea side.
    b.level(2, () => {
      b.add({ piece: 'timberBox', p: [0, 0.52, -0.3], s: [1.9, 0.04, 0.24], tint: 0xc8a57c });
      railing(b, 0, 0.56, -0.42, 1.9);
      lamp(b, 0.85, 0.56, -0.3, 0.4);
      for (let i = 0; i < 5; i++) b.add({ piece: 'timberBox', p: [-0.8 + i * 0.4, -0.05, 0.58], s: [0.22, 0.14, 0.14], tint: 0xa8a090 });
    });
    // Level 3: a tide-watch hut with a lit gauge at the west end and a second rank of young mangroves.
    b.level(3, () => {
      b.add({ piece: 'timberBox', p: [0, 0.52, -0.3], s: [1.9, 0.04, 0.24], tint: 0xc8a57c });
      railing(b, 0, 0.56, -0.42, 1.9);
      b.add({ piece: 'timberBox', p: [-0.78, 0.56, -0.2], s: [0.3, 0.28, 0.3], tint: 0x9b6e45 });
      b.add({ piece: 'slab', p: [-0.78, 0.86, -0.2], s: [0.38, 0.03, 0.38], tint: 0x5f6b73 });
      b.add({ piece: 'slab', p: [-0.95, 0.0, 0.47], s: [0.05, 0.9, 0.05], tint: 0xffffff });
      for (let k = 0; k < 4; k++) b.add({ piece: 'lumenRib', p: [-0.95, 0.15 + k * 0.2, 0.5], s: [0.06, 0.02, 0.02], tint: k % 2 ? 0xd8463a : 0x7ff7e6, glow: 0.9 });
      for (let i = 0; i < 4; i++) {
        const x = -0.5 + i * 0.4;
        b.add({ piece: 'trunk', p: [x, 0.45, 0.32], s: [0.03, 0.22, 0.03], tint: PALETTE.bark });
        b.add({ piece: 'canopy', p: [x, 0.62, 0.32], s: 0.22, tint: PALETTE.leaves[i % 5] });
      }
    });
  },
});
