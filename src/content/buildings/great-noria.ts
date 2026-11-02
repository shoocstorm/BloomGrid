import { defineBuilding, type Vec3 } from '../types';
import {
  PALETTE,
  TRIM,
  beam,
  bench,
  door,
  footbridge,
  gableRoof,
  grassTufts,
  lamp,
  railing,
  tree,
} from '../kit';

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
  style: 'charred-timber',
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
    // Visitors (D-097): a timber pump house with a gable roof, a footbridge over the channel, a railed viewing
    // edge along it, a bench facing the wheel and lamps.
    b.add({ piece: 'timberBox', p: [-2.2, 0.2, 2.9], s: [1.6, 0.9, 1.0], tint: PALETTE.timber });
    gableRoof(b, -2.2, 1.1, 2.9, 1.6, 1.0, { pitch: 0.55, ends: TRIM.cream });
    door(b, -2.2, 0.2, 3.41, 0.26, 0.42);
    footbridge(b, -4.0, 0.47, 0, 2.6, 0.8);
    railing(b, 3.4, 0.45, 1.25, 2.4);
    railing(b, -1.6, 0.45, 1.25, 2.4);
    bench(b, 1.2, 0.2, 2.2, 0.5, false, true);
    for (const x of [-3.0, 0.2, 3.0]) lamp(b, x, 0.2, 1.55, 0.6);

    // Levels (D-100). Level 2: the aqueduct runs on west from the wheel's crown to a second filtration tower,
    // which spills its own waterfall back into the channel.
    const west = () => {
      b.add({ piece: 'slab', p: [-1.1, CY + R - 0.2, -2.8], s: [2.4, 0.25, 0.8], tint: PALETTE.concrete });
      b.add({ piece: 'pool', p: [-1.1, CY + R + 0.05, -2.8], s: [2.2, 0.04, 0.6] });
      b.add({ piece: 'glassCyl', p: [-2.4, 0.2, -3.4], s: [1.6, CY + R, 1.6], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'waterfall', p: [-2.4, 0.45, -2.6], s: [0.8, CY + R - 0.6, 1], glow: 0.8 });
    };
    b.level(2, west);
    // Level 3: the first tower gains a crown of glass (a tea room over the aqueduct with a halo), the second a
    // glass spire, and the great wheel's rim is strung with lanterns.
    b.level(3, () => {
      west();
      const top = 0.2 + CY + R;
      b.add({ piece: 'glassCyl', p: [4.0, top, -3.4], s: [2.4, 0.8, 2.4], tint: 0xfff2c8, glow: 0.6 });
      b.add({ piece: 'dome', p: [4.0, top + 0.8, -3.4], s: [2.4, 1.2, 2.4], tint: PALETTE.glass });
      b.add({ piece: 'haloRing', p: [4.0, top + 0.4, -3.4], s: [2.8, 3, 2.8], tint: 0xffd9a0, glow: 1 });
      b.add({ piece: 'concreteCyl', p: [-2.4, top, -3.4], s: [1.8, 0.12, 1.8], tint: PALETTE.concrete });
      b.add({ piece: 'spireCone', p: [-2.4, top + 0.12, -3.4], s: [1.2, 1.4, 1.2], tint: PALETTE.glassWarm, glow: 0.4 });
      for (let k = 0; k < 16; k++) {
        const a = ((k + 0.5) / 16) * TAU;
        b.add({ piece: 'lumenRib', p: [Math.cos(a) * (R + 0.15), CY + Math.sin(a) * (R + 0.15), 0.6], s: [0.14, 0.14, 0.14], tint: 0xffd9a0, glow: 1 });
      }
    });
  },
});
