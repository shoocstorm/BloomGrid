import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

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
  },
});
