import { defineBuilding } from '../types';
import { PALETTE, grassTufts, flowers } from '../kit';

const TAU = Math.PI * 2;
const H = 14;

export default defineBuilding({
  id: 'heliostat-array',
  name: 'Heliostat Sunflower Array',
  description:
    'Fifty sunflower mirrors turn through the day to focus sunlight on a receiver at the top of a slender tower, which glows like a second sun. Clean power for a whole district.',
  category: 'energy',
  footprint: [10, 10],
  stats: { cost: 3400, energy: 180, eco: 6, happiness: 8, population: 0, jobs: 20, pollution: 0 },
  growthTime: 150,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.12, 9.8] });
    grassTufts(b, 0, 0.12, 0, 9.4, 9.4, 120);
    flowers(b, 0, 0.12, 0, 4.6, 60, 0, 0.6);
    // Receiver tower.
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [1.6, H, 1.6], tint: PALETTE.concrete });
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [2.6, 1.2, 2.6], tint: 0xe9f4ef });
    b.add({ piece: 'glassCyl', p: [0, H, 0], s: [2.2, 2.0, 2.2], tint: 0xffe08a, glow: 1 });
    for (let i = 0; i < 4; i++)
      b.add({ piece: 'haloRing', p: [0, H + 0.2 + i * 0.5, 0], s: [2.6, 4, 2.6], glow: 1 });
    b.add({ piece: 'spireCone', p: [0, H + 2, 0], s: [1.6, 2.0, 1.6], tint: PALETTE.glassWarm, glow: 0.5 });
    // Heliostats in rings, each mirror tilted to face the receiver.
    let n = 0;
    for (const [r, count] of [
      [2.4, 12],
      [3.4, 16],
      [4.4, 22],
    ] as const) {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + r;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.1, 0.7, 0.1], tint: 0xe9f4ef });
        // Petal pointing back toward the tower, tilted up so its face looks at the receiver.
        b.add({
          piece: 'solarLeaf',
          p: [x + Math.cos(a) * 0.45, 0.82, z + Math.sin(a) * 0.45],
          s: [0.9, 1, 2.0],
          r: Math.PI - a,
          rz: 0.55,
          growAt: (n++ % 10) * 0.05,
        });
      }
    }
  },
});
