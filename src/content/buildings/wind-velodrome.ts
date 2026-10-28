import { defineBuilding } from '../types';
import { PALETTE, grassTufts } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'wind-velodrome',
  name: 'Wind Velodrome',
  description:
    'A banked timber track under ribs of glulam arches, cooled by the sea breeze through its open sides. Track racing by day, community rides by night.',
  category: 'sports',
  footprint: [9, 7],
  stats: { cost: 2400, energy: -18, eco: 3, happiness: 16, population: 0, jobs: 30, pollution: 0, water: -4 },
  growthTime: 170,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [8.8, 0.25, 6.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.25, 0], s: [4.6, 0.05, 2.6] });
    grassTufts(b, 0, 0.3, 0, 4.2, 2.2, 20);
    // The banked oval: timber boards tilted toward the infield.
    const [ra, rb, n] = [3.5, 2.3, 40];
    const len = (TAU * Math.sqrt((ra * ra + rb * rb) / 2)) / n + 0.06;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
      b.add({
        piece: 'timberBox',
        p: [Math.cos(a) * ra, 0.25, Math.sin(a) * rb],
        s: [len, 0.08, 0.95],
        r: Math.atan2(-tz, tx),
        rx: 0.32,
        tint: 0xc89a66,
      });
    }
    b.add({ piece: 'haloRing', p: [0, 0.6, 0], s: [8.0, 1, 5.6], glow: 0.8 });
    // Glulam rib vault, open to the breeze.
    for (let i = 0; i < 7; i++)
      b.add({ piece: 'willowArch', p: [-3.6 + i * 1.2, 0.25, 0], s: [6.6, 3.4, 6.6], r: Math.PI / 2 });
    b.add({ piece: 'timberBox', p: [0, 3.5, 0], s: [7.6, 0.1, 0.5], tint: PALETTE.timber });
  },
});
