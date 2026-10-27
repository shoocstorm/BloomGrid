import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'moonflower-hall',
  name: 'Moonflower Concert Hall',
  description:
    'A concert hall cupped in sixteen living petals that open with the island’s bloom and glow at night. Its acoustics are said to be the best of any flower on Earth.',
  category: 'commercial',
  footprint: [10, 10],
  stats: {
    cost: 4200,
    energy: -20,
    eco: 10,
    happiness: 34,
    population: 0,
    jobs: 80,
    pollution: 0,
    water: -8,
  },
  growthTime: 200,
  pollinators: 2,
  variants: 1,
  style: 'indigo',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 9.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 0], s: [9.0, 0.05, 9.0] });
    for (const [x, z] of [
      [-4.2, -4.2],
      [4.2, -4.2],
      [-4.2, 4.2],
      [4.2, 4.2],
    ] as const) {
      b.add({ piece: 'mossBox', p: [x, 0.2, z], s: [1.2, 0.1, 1.2] });
      grassTufts(b, x, 0.3, z, 1.1, 1.1, 8);
      flowers(b, x, 0.3, z, 0.5, 8, 0, 0.5);
    }
    // The hall: a glass drum on a lily-pad stage.
    b.add({ piece: 'concreteCyl', p: [0, 0.2, 0], s: [6.4, 0.4, 6.4], tint: 0xe9f4ef });
    b.add({ piece: 'glassCyl', p: [0, 0.6, 0], s: [4.6, 3.2, 4.6], tint: PALETTE.glassWarm, glow: 0.6 });
    b.add({ piece: 'haloRing', p: [0, 0.62, 0], s: [6.5, 4, 6.5], glow: 0.9 });
    // Petals: an inner ring standing tall and an outer ring flaring wide.
    for (let k = 0; k < 6; k++)
      b.add({
        piece: 'sunPetal',
        p: [0, 0.6, 0],
        s: [8.2, 1, 4.6],
        r: (k / 6) * TAU,
        rz: 1.25,
        tint: 0xf2e6ff,
        glow: 0.7,
        growAt: 0.1,
      });
    for (let k = 0; k < 10; k++)
      b.add({
        piece: 'sunPetal',
        p: [0, 0.6, 0],
        s: [6.8, 1, 4.4],
        r: (k / 10) * TAU + 0.3,
        rz: 0.8,
        tint: 0xfff4f0,
        glow: 0.6,
        growAt: 0.2,
      });
    // Stamens: light rods tipped with glowing pollen heads.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      const r = k ? 0.9 : 0;
      const h = k ? 5.2 : 6.4;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * r, 3.8, Math.sin(a) * r],
        s: [0.12, h - 3.8, 0.12],
        glow: 0.9,
      });
      b.add({ piece: 'flower', p: [Math.cos(a) * r, h, Math.sin(a) * r], s: 0.6, tint: 0xffe08a, glow: 1 });
    }
  },
});
