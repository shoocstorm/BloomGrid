import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, TRIM, awning, beam, entrance, flowers, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;
const R = 7.2;
const HUB = 8.4;
const CARS = 18;

export default defineBuilding({
  id: 'bloom-eye',
  name: 'Bloom Eye',
  description:
    'The island’s observation wheel: eighteen glowing gondolas turn on a ring of light high above the hills, with the whole city laid out below. A favourite for first dates and proposals.',
  category: 'commercial',
  footprint: [10, 6],
  stats: { cost: 3200, energy: -14, eco: 2, happiness: 30, population: 0, jobs: 40, pollution: 0 },
  growthTime: 150,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.25, 5.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.25, 2.4, 9.4, 0.8, 24);
    flowers(b, -3.8, 0.25, 2.2, 0.8, 14, 0, 0.6);
    flowers(b, 3.8, 0.25, 2.2, 0.8, 14, 0, 0.6);
    // Boarding hall.
    b.add({ piece: 'glassBox', p: [0, 0.25, 1.6], s: [4.0, 1.0, 1.6], tint: PALETTE.glassWarm, glow: 0.6 });
    // A-frame legs to the hub.
    for (const z of [-1.6, 1.0]) {
      beam(b, 'concreteCyl', [-3.6, 0.25, z], [0, HUB, z * 0.4], 0.45, { tint: 0xe9f4ef });
      beam(b, 'concreteCyl', [3.6, 0.25, z], [0, HUB, z * 0.4], 0.45, { tint: 0xe9f4ef });
    }
    beam(b, 'concreteCyl', [0, HUB, -0.8], [0, HUB, 0.6], 0.8, { tint: 0xe9f4ef });
    // Rims of light and spokes.
    for (const z of [-0.35, 0.35])
      b.add({ piece: 'haloRing', p: [0, HUB, z], s: [R * 2, R * 2, R * 2], rx: Math.PI / 2, glow: 1 });
    b.add({ piece: 'haloRing', p: [0, HUB, 0], s: [2.4, 2.4, 2.4], rx: Math.PI / 2, glow: 1 });
    for (let k = 0; k < CARS; k++) {
      const a = (k / CARS) * TAU;
      const rim: Vec3 = [Math.cos(a) * R, HUB + Math.sin(a) * R, 0];
      if (k % 2 === 0) beam(b, 'lumenRib', [0, HUB, 0], rim, 0.06, { glow: 0.7 });
      // Gondolas hang below the rim.
      b.add({ piece: 'pod', p: [rim[0], rim[1] - 0.9, 0], s: [1.2, 1.6, 1.4], glow: 0.9 });
    }
    // Street level (D-097): a lit boarding entrance with a name sign on the hall roof, ticket and snack kiosks under
    // striped awnings, and lamps along the street.
    entrance(b, 0, 0.25, 2.41, 1.0, 0.5, 0xffb7d5);
    b.add({ piece: 'slab', p: [0, 1.25, 2.1], s: [2.6, 0.36, 0.06], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [0, 1.3, 2.14], s: [2.3, 0.24, 0.01], tint: 0xffb7d5, glow: 1 });
    for (const [x, c] of [
      [-2.9, TRIM.teal],
      [2.9, TRIM.terracotta],
    ] as const) {
      b.add({ piece: 'timberBox', p: [x, 0.25, 1.9], s: [0.7, 0.55, 0.5], tint: PALETTE.timber });
      b.add({ piece: 'glassBox', p: [x, 0.5, 2.16], s: [0.5, 0.2, 0.02], tint: 0xd6f2ee, glow: 0.4 });
      awning(b, x, 0.9, 2.25, 0.8, 0.3, 0xf5efe4, c, 4);
    }
    for (const x of [-4.4, -1.6, 1.6, 4.4]) lamp(b, x, 0.25, 2.7, 0.6);

    // Levels (D-100). Level 2: a glass sky-lounge wraps the hub, and two more kiosks join the arcade under the
    // wheel, with strings of festoon lights between the lamps.
    b.level(2, () => {
      b.add({ piece: 'glassCyl', p: [0, HUB - 0.9, 0], s: [1.9, 1.8, 1.9], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'concreteCyl', p: [0, HUB + 0.9, 0], s: [2.1, 0.12, 2.1], tint: 0xe9f4ef });
      for (const [x, c] of [
        [-1.6, TRIM.orange],
        [1.6, TRIM.seaBlue],
      ] as const) {
        b.add({ piece: 'timberBox', p: [x, 0.25, -1.9], s: [0.7, 0.55, 0.5], tint: PALETTE.timber });
        awning(b, x, 0.9, -1.55, 0.8, 0.3, 0xf5efe4, c, 4);
      }
      for (const x of [-3, 0, 3]) beam(b, 'lumenRib', [x - 1.4, 0.83, 2.7], [x + 1.4, 0.83, 2.7], 0.03, { tint: 0xffd9a0, glow: 0.9 });
    });
    // Level 3: a second, outer rim of light carries a gondola for every car, the legs get light ribs, and a
    // fountain basin opens on the plaza.
    b.level(3, () => {
      for (const z of [-0.5, 0.5]) b.add({ piece: 'haloRing', p: [0, HUB, z], s: [R * 2.25, R * 2.25, R * 2.25], rx: Math.PI / 2, tint: 0xffb7d5, glow: 1 });
      for (let k = 0; k < CARS; k++) {
        const a = ((k + 0.5) / CARS) * TAU;
        b.add({ piece: 'flower', p: [Math.cos(a) * R * 1.125, HUB + Math.sin(a) * R * 1.125, 0.55], s: 0.3, tint: k % 2 ? 0xffe08a : 0xffb7d5, glow: 1 });
      }
      for (const z of [-1.6, 1.0])
        for (const sx of [-1, 1]) beam(b, 'lumenRib', [sx * 3.4, 0.25, z + 0.25], [sx * 0.2, HUB, z * 0.4 + 0.25], 0.06, { glow: 0.8 });
      b.add({ piece: 'concreteCyl', p: [0, 0.25, -2.2], s: [2.0, 0.18, 1.0], tint: 0xe9f4ef });
      b.add({ piece: 'pool', p: [0, 0.3, -2.2], s: [1.7, 0.1, 0.8] });
      b.add({ piece: 'waterfall', p: [0, 0.4, -2.2], s: [0.2, 0.7, 1], glow: 0.8 });
    });
  },
});
