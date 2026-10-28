import { defineBuilding } from '../types';
import { PALETTE, flowers, tree } from '../kit';

const TAU = Math.PI * 2;
const SEATS = [0xf4f1ea, 0x5ff2da, 0xf4f1ea, 0xffb7d5];

export default defineBuilding({
  id: 'bloom-stadium',
  name: 'Bloom Stadium',
  description:
    'The island’s great bowl: three tiers of terraced seating round a living pitch, under a crown of solar petals that shade the crowd and light the night games.',
  category: 'sports',
  footprint: [12, 12],
  stats: {
    cost: 6000,
    energy: -40,
    eco: 6,
    happiness: 40,
    population: 0,
    jobs: 120,
    pollution: 0,
    water: -15,
  },
  growthTime: 200,
  style: 'classic',
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [11.6, 0.3, 11.6], tint: PALETTE.concrete });
    // The pitch and its markings.
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [5.6, 0.06, 3.6] });
    b.add({ piece: 'slab', p: [0, 0.36, 0], s: [0.06, 0.01, 3.4], tint: 0xffffff });
    b.add({ piece: 'haloRing', p: [0, 0.37, 0], s: [1.1, 0.2, 1.1], glow: 0.2 });
    for (const x of [-2.75, 2.75])
      b.add({ piece: 'slab', p: [x, 0.36, 0], s: [0.06, 0.5, 1.0], tint: 0xffffff });
    // Three tiers of terraced seating round an oval.
    for (let t = 0; t < 3; t++) {
      const [ra, rb] = [3.7 + t * 0.85, 2.7 + t * 0.85];
      const n = 36 + t * 6;
      const len = (TAU * Math.sqrt((ra * ra + rb * rb) / 2)) / n + 0.08;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
        b.add({
          piece: 'slab',
          p: [Math.cos(a) * ra, 0.3, Math.sin(a) * rb],
          s: [len, 0.55 + t * 0.6, 0.85],
          r: Math.atan2(-tz, tx),
          tint: SEATS[(k + t * 2) % SEATS.length]!,
        });
      }
    }
    // Crown of solar petals over the stands.
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      const [x, z] = [Math.cos(a) * 5.6, Math.sin(a) * 4.7];
      b.add({
        piece: 'solarLeaf',
        p: [x, 2.6, z],
        s: [2.1, 1, 1.5],
        r: Math.atan2(z, -x) + Math.PI,
        rz: 0.22,
        growAt: 0.1,
      });
    }
    b.add({ piece: 'haloRing', p: [0, 3.0, 0], s: [11.2, 3, 9.4], glow: 0.9 });
    // Floodlight masts and a ring of trees.
    for (const [x, z] of [
      [-5.3, -5.3],
      [5.3, -5.3],
      [-5.3, 5.3],
      [5.3, 5.3],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.3, z], s: [0.18, 5.4, 0.18], tint: 0xf4f1ea });
      b.add({ piece: 'lumenRib', p: [x, 5.6, z], s: [0.7, 0.3, 0.3], r: Math.atan2(z, -x), glow: 1 });
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + 0.26;
      tree(b, Math.cos(a) * 5.4, 0.3, Math.sin(a) * 5.4, 0.55, 0.2);
    }
    flowers(b, 0, 0.3, 5.5, 2.5, 16, 0, 0.6);
  },
});
