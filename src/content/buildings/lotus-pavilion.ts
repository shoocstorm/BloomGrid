import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

export default defineBuilding({
  id: 'lotus-pavilion',
  name: 'Lotus Arts Pavilion',
  description: 'A bayfront arts pavilion shaped like an opening lotus, ringed by a lily pond. Concerts, galleries and night markets draw the whole island.',
  category: 'commercial',
  footprint: [4, 4],
  stats: { cost: 800, energy: -8, eco: 4, happiness: 14, population: 0, jobs: 24, pollution: 0, water: -3 },
  growthTime: 80,
  placement: { nearWater: true },
  floodproof: true,
  variants: 1,
  recipe: {
    glb: '/assets/lotus-pavilion.glb',
    // Procedural lotus: a glass drum, two whorls of petal shells, a pond ring with lilies.
    fallback(b) {
      b.add({ piece: 'mossBox', p: [0, 0, 0], s: [3.9, 0.08, 3.9] });
      grassTufts(b, 0, 0.08, 0, 3.6, 3.6, 24);
      b.add({ piece: 'pool', p: [0, 0.08, 0], s: [3.4, 0.03, 3.4] });
      b.add({ piece: 'glassCyl', p: [0, 0.1, 0], s: [1.6, 0.7, 1.6], tint: PALETTE.glass });
      b.add({ piece: 'mossBox', p: [0, 0.8, 0], s: [1.2, 0.08, 1.2] });
      for (let whorl = 0; whorl < 2; whorl++)
        for (let i = 0; i < 9; i++)
          b.add({ piece: 'sunPetal', p: [0, 0.8 + whorl * 0.25, 0], s: [1.5 - whorl * 0.4, 2.4, 1.0 - whorl * 0.2], r: (i / 9) * Math.PI * 2 + whorl * 0.35, rz: 0.9 + whorl * 0.25, tint: whorl ? 0xffd6e4 : 0xfff6f2, glow: 0.4, growAt: 0.1 + whorl * 0.2 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add({ piece: 'lily', p: [Math.cos(a) * 1.45, 0.11, Math.sin(a) * 1.45], s: b.range(0.18, 0.26), tint: b.pick(PALETTE.blossoms) });
      }
      flowers(b, 0, 0.08, 0, 1.9, 24, 0, 0.6);
    },
  },
});
