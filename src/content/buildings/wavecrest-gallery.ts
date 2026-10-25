import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

const STRIPS = 22;

/** The roof's crest line: a wave rising toward the east end. */
const crest = (x: number) => 3.2 + Math.sin(x * 0.75 + 0.6) * 1.1 + (x + 5) * 0.32;

export default defineBuilding({
  id: 'wavecrest-gallery',
  name: 'Wavecrest Gallery',
  description:
    'An art gallery under a single rolling roof, white strips rising like a wave about to break over the hill. The glass halls beneath show the island’s artists; the roof is a sculpture walk.',
  category: 'tech',
  footprint: [10, 8],
  stats: { cost: 3000, energy: -12, eco: 6, happiness: 22, population: 0, jobs: 70, pollution: 0, water: -4 },
  growthTime: 170,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 3.2], s: [9.0, 0.05, 1.2] });
    grassTufts(b, 0, 0.2, -3.4, 9, 0.8, 24);
    flowers(b, -3.6, 0.2, -3.4, 0.8, 12, 0, 0.6);
    // Glass halls under the wave.
    b.add({ piece: 'glassBox', p: [-1.6, 0.2, 0], s: [5.4, 2.6, 4.6], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'glassBox', p: [2.6, 0.2, -0.2], s: [3.4, 3.8, 4.0], tint: PALETTE.glassWarm, glow: 0.5 });
    // Roof: strips following the crest, each tilted to the local slope, with a lit edge on the crest line.
    const dx = 10 / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      const x0 = -5 + i * dx;
      const x1 = x0 + dx;
      const y0 = crest(x0);
      const y1 = crest(x1);
      const mx = (x0 + x1) / 2;
      const len = Math.hypot(dx, y1 - y0) + 0.02;
      const tilt = Math.atan2(y1 - y0, dx);
      b.add({
        piece: 'slab',
        p: [mx, (y0 + y1) / 2 - 0.08, 0],
        s: [len, 0.16, 6.4 - Math.abs(mx) * 0.25],
        rz: tilt,
        tint: i % 2 ? 0xf6f2ea : PALETTE.concrete,
      });
      b.add({
        piece: 'lumenRib',
        p: [mx, (y0 + y1) / 2 - 0.12, 3.2 - Math.abs(mx) * 0.12],
        s: [len, 0.06, 0.06],
        rz: tilt,
        glow: 0.8,
      });
      if (i % 4 === 0)
        b.add({
          piece: 'concreteCyl',
          p: [mx, 0.2, 2.6],
          s: [0.18, (y0 + y1) / 2 - 0.3, 0.18],
          tint: 0xe9f4ef,
        });
    }
  },
});
