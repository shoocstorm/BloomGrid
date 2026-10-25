import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const R = 5.2; // wheel radius
const CY = 5.8; // axle height

export default defineBuilding({
  id: 'great-noria',
  name: 'Great Noria',
  description:
    'A timber water wheel eleven metres across lifts water from a hill channel into a glass aqueduct and a filtration tower. It turns slowly all day, and children time their races by it.',
  category: 'utility',
  footprint: [10, 10],
  stats: { cost: 3000, energy: -6, eco: 8, happiness: 14, population: 0, jobs: 20, pollution: 0, water: 40 },
  growthTime: 160,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.2, 9.8] });
    grassTufts(b, 0, 0.2, 0, 9.4, 9.4, 80);
    // Channel the wheel dips into.
    b.add({ piece: 'slab', p: [0, 0.2, 0], s: [9.6, 0.25, 2.4], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.45, 0], s: [9.4, 0.05, 1.8] });
    // Wheel in the x-y plane: twin rims, spokes, buckets and an axle on two trestles.
    for (const z of [-0.5, 0.5]) {
      b.add({ piece: 'haloRing', p: [0, CY, z], s: [R * 2, R * 2, R * 2], rx: Math.PI / 2, glow: 0.5 });
      b.add({ piece: 'haloRing', p: [0, CY, z], s: [R * 1.3, R * 1.3, R * 1.3], rx: Math.PI / 2, glow: 0.3 });
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rim: Vec3 = [Math.cos(a) * R, CY + Math.sin(a) * R, 0];
      if (k % 2 === 0) beam(b, 'slab', [0, CY, 0], rim, 0.22, { tint: 0xc8a57c });
      b.add({ piece: 'slab', p: [rim[0], rim[1] - 0.25, 0], s: [0.6, 0.5, 1.2], r: 0, tint: 0x9a7552 });
    }
    beam(b, 'concreteCyl', [0, CY, -1.6], [0, CY, 1.6], 0.5, { tint: 0xe9f4ef });
    for (const z of [-1.4, 1.4]) {
      beam(b, 'slab', [-2.2, 0.45, z], [0, CY, z], 0.35, { tint: 0x9a7552 });
      beam(b, 'slab', [2.2, 0.45, z], [0, CY, z], 0.35, { tint: 0x9a7552 });
    }
    // Aqueduct from the wheel top to the filtration tower, which spills back into the channel.
    b.add({ piece: 'slab', p: [2.2, CY + R - 0.2, -2.8], s: [4.6, 0.25, 0.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [2.2, CY + R + 0.05, -2.8], s: [4.4, 0.04, 0.6] });
    b.add({
      piece: 'glassCyl',
      p: [4.0, 0.2, -3.4],
      s: [1.8, CY + R, 1.8],
      tint: PALETTE.glassWarm,
      glow: 0.5,
    });
    b.add({ piece: 'waterfall', p: [4.0, 0.45, -2.45], s: [0.9, CY + R - 0.6, 1], glow: 0.8 });
    tree(b, -3.8, 0.2, -3.6, 0.9, 0.1);
    tree(b, -3.8, 0.2, 3.6, 0.8, 0.1);
  },
});
