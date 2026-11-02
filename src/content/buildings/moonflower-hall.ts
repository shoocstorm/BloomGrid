import { defineBuilding } from '../types';
import { PALETTE, bench, entrance, flowers, grassTufts, lamp, railing } from '../kit';

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
    // Street level (D-097): a railed boardwalk across the pool to a lit door in the drum, lamps at its foot, lilies
    // round the lily-pad stage and benches in the corner gardens.
    b.add({ piece: 'timberBox', p: [0, 0.2, 4.0], s: [1.2, 0.12, 1.9], tint: 0xc8a57c });
    for (const sx of [-1, 1]) {
      railing(b, sx * 0.58, 0.32, 4.0, 1.8, true);
      lamp(b, sx * 0.75, 0.2, 4.8, 0.6);
    }
    entrance(b, 0, 0.6, 2.32, 0.7, 0.45, 0xf2e6ff);
    for (let i = 0; i < 26; i++) {
      const a = b.rand() * TAU;
      if (Math.abs(a - Math.PI / 2) < 0.25) continue;
      const r = b.range(3.45, 4.3);
      b.add({
        piece: 'lily',
        p: [Math.cos(a) * r, 0.25, Math.sin(a) * r],
        s: b.range(0.16, 0.26),
        r: b.rand() * TAU,
        tint: b.pick(PALETTE.blossoms),
      });
    }
    for (const sx of [-1, 1]) bench(b, sx * 4.2, 0.3, 3.75, 0.42, false, true);

    // Levels (D-100). Level 2: three lily-pad pavilions float on the pool round the hall, each a small lit glass
    // room under its own ring of petals, joined to the hall's deck by stepping pads.
    b.level(2, () => {
      for (const a of [Math.PI, -Math.PI / 2, 0]) {
        const [x, z] = [Math.cos(a) * 3.65, Math.sin(a) * 3.65];
        b.add({ piece: 'lily', p: [x, 0.25, z], s: 1.4, r: a, tint: 0xf2e6ff });
        b.add({ piece: 'glassCyl', p: [x, 0.28, z], s: [0.8, 0.55, 0.8], tint: PALETTE.glassWarm, glow: 0.7 });
        for (let k = 0; k < 6; k++) b.add({ piece: 'sunPetal', p: [x, 0.28, z], s: [1.3, 1, 0.8], r: (k / 6) * TAU, rz: 1.1, tint: 0xfff4f0, glow: 0.6 });
        for (const t of [0.35, 0.6]) b.add({ piece: 'lily', p: [x * (1 - t * 0.3), 0.25, z * (1 - t * 0.3)], s: 0.35, tint: 0xffe08a });
      }
    });
    // Level 3: the flower opens wider: a third whorl of tall violet petals, a taller lit stamen crown and a
    // double halo.
    b.level(3, () => {
      for (let k = 0; k < 8; k++)
        b.add({ piece: 'sunPetal', p: [0, 0.6, 0], s: [9.6, 1, 4.2], r: (k / 8) * TAU + 0.2, rz: 1.45, tint: 0xd9c4ff, glow: 0.7 });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + 0.6;
        b.add({ piece: 'lumenRib', p: [Math.cos(a) * 0.5, 3.8, Math.sin(a) * 0.5], s: [0.1, 3.4, 0.1], glow: 0.9 });
        b.add({ piece: 'flower', p: [Math.cos(a) * 0.5, 7.2, Math.sin(a) * 0.5], s: 0.55, tint: 0xfff4f0, glow: 1 });
      }
      b.add({ piece: 'haloRing', p: [0, 7.4, 0], s: [2.2, 4, 2.2], tint: 0xffe08a, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 1.2, 0], s: [8.8, 4, 8.8], tint: 0xd9c4ff, glow: 0.8 });
    });
  },
});
