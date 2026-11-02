import { defineBuilding } from '../types';
import { PALETTE, TRIM, entrance, flowers, footbridge, grassTufts, lamp } from '../kit';

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
  style: 'whitewash',
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
    // Street level (D-097): a bridge over the reflecting pool to the main doors, a second door on the tall hall,
    // exhibition banners, a sculpture on a plinth and lamps by the bridge.
    footbridge(b, -1.6, 0.22, 3.2, 1.2, 1.0);
    entrance(b, -1.6, 0.2, 2.31, 1.2, 0.6, 0xff9aa2);
    entrance(b, 2.6, 0.2, 1.81, 0.8, 0.5, 0xff9aa2);
    for (const [x, c] of [
      [-3.7, 0xff9aa2],
      [-3.2, TRIM.teal],
      [0.3, 0xffe08a],
    ] as const)
      b.add({ piece: 'slab', p: [x, 0.9, 2.33], s: [0.32, 1.3, 0.02], tint: c });
    b.add({ piece: 'slab', p: [3.8, 0.2, 2.25], s: [0.45, 0.35, 0.45], tint: 0xe9e2d0 });
    b.add({ piece: 'pod', p: [3.8, 0.55, 2.25], s: [0.5, 1.4, 0.5], r: 0.6, rz: 0.3, tint: 0xff9a8a });
    for (const x of [-2.5, -0.7]) lamp(b, x, 0.2, 3.85, 0.6);

    // Levels (D-100). Level 2: a sculpture garden on the lawn behind the halls (three pieces on plinths) and a
    // glass rooftop café under the wave's low end.
    const garden = () => {
      for (const [x, c, h] of [
        [-3.4, 0xffe08a, 0.9],
        [-1.6, 0x9ee6ff, 1.3],
        [0.4, 0xc9b6ff, 0.8],
      ] as const) {
        b.add({ piece: 'slab', p: [x, 0.2, -3.0], s: [0.4, 0.3, 0.4], tint: 0xe9e2d0 });
        b.add({ piece: 'pod', p: [x, 0.5, -3.0], s: [0.4, h, 0.4], r: x, rz: 0.2, tint: c });
      }
    };
    b.level(2, () => {
      garden();
      b.add({ piece: 'glassBox', p: [-3.6, 2.8, 0], s: [1.6, 0.5, 2.6], tint: 0xfff2c8, glow: 0.6 });
    });
    // Level 3: a second, smaller wave rises over a new east wing on the back lawn, its crest lit like the first.
    b.level(3, () => {
      garden();
      b.add({ piece: 'glassBox', p: [-3.6, 2.8, 0], s: [1.6, 0.5, 2.6], tint: 0xfff2c8, glow: 0.6 });
      b.add({ piece: 'glassBox', p: [3.5, 0.2, -3.0], s: [2.0, 1.6, 1.3], tint: PALETTE.glassWarm, glow: 0.5 });
      const n = 8;
      for (let i = 0; i < n; i++) {
        const [x0, x1] = [2.4 + (i / n) * 2.3, 2.4 + ((i + 1) / n) * 2.3];
        const wave = (x: number) => 1.95 + Math.sin((x - 2.4) * 1.6) * 0.45;
        const [y0, y1] = [wave(x0), wave(x1)];
        const len = Math.hypot(x1 - x0, y1 - y0) + 0.02;
        const tilt = Math.atan2(y1 - y0, x1 - x0);
        b.add({ piece: 'slab', p: [(x0 + x1) / 2, (y0 + y1) / 2 - 0.06, -3.0], s: [len, 0.12, 1.7], rz: tilt, tint: i % 2 ? 0xf6f2ea : PALETTE.concrete });
        b.add({ piece: 'lumenRib', p: [(x0 + x1) / 2, (y0 + y1) / 2 - 0.1, -2.15], s: [len, 0.05, 0.05], rz: tilt, glow: 0.8 });
      }
    });
  },
});
