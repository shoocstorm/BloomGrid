import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;

/** A misty forest mountain under glass: stacked mossy tiers, ivy, a crown of trees and a waterfall. */
function cloudMountain(b: KitBuilder, x: number, z: number, r: number, h: number): void {
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const size = r * (1.5 - t * 1.1);
    const y = 0.2 + t * h;
    b.add({ piece: 'mossBox', p: [x, y, z], s: [size, h / tiers + 0.05, size], r: i * 0.5 });
    for (let k = 0; k < 4; k++) {
      const a = i * 0.5 + (k / 4) * TAU;
      ivyEdge(
        b,
        x + Math.sin(a) * size * 0.5,
        y + h / tiers,
        z + Math.cos(a) * size * 0.5,
        size * 0.8,
        Math.sin(a),
        Math.cos(a),
        3,
      );
    }
    if (i > 0) tree(b, x + b.range(-0.3, 0.3) * size, y, z + b.range(-0.3, 0.3) * size, 0.45, 0.1 + t * 0.4);
  }
  b.add({ piece: 'waterfall', p: [x, 0.2, z + r * 0.45], s: [0.7, h * 0.85, 1], glow: 0.8 });
  for (let i = 0; i < 3; i++) tree(b, x + b.range(-0.4, 0.4), 0.2 + h, z + b.range(-0.4, 0.4), 0.6, 0.3);
}

export default defineBuilding({
  id: 'cloud-domes',
  name: 'Cloud Forest Domes',
  description:
    'Twin cooled glass biomes: a misty cloud-forest mountain with a hidden waterfall, and a flower dome of every season at once. The island’s botanic heart and favourite day out.',
  category: 'nature',
  footprint: [10, 10],
  stats: {
    cost: 4200,
    energy: -10,
    eco: 45,
    happiness: 30,
    population: 0,
    jobs: 60,
    pollution: -5,
    water: -12,
  },
  growthTime: 200,
  pollinators: 4,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 9.8], tint: PALETTE.concrete });
    // Lagoon between the domes and garden lawns around them.
    b.add({ piece: 'pool', p: [2.6, 0.2, -2.8], s: [3.6, 0.05, 3.0] });
    b.add({ piece: 'mossBox', p: [-3.2, 0.2, 3.4], s: [3.0, 0.1, 2.6] });
    grassTufts(b, -3.2, 0.3, 3.4, 2.8, 2.4, 30);
    flowers(b, -3.2, 0.3, 3.4, 1.2, 30, 0, 0.6);

    // Cloud forest dome.
    const [cx, cz] = [-1.6, -1.6];
    cloudMountain(b, cx, cz, 2.6, 3.8);
    b.add({ piece: 'dome', p: [cx, 0.2, cz], s: [6.8, 10, 6.8] });
    b.add({ piece: 'haloRing', p: [cx, 0.22, cz], s: [6.9, 4, 6.9], glow: 0.7 });

    // Flower dome: terraced beds of blossom with an olive grove.
    const [fx, fz] = [2.5, 2.4];
    for (let i = 0; i < 3; i++) {
      const size = 3.6 - i * 1.0;
      b.add({ piece: 'mossBox', p: [fx, 0.2 + i * 0.35, fz], s: [size, 0.35, size], r: i * 0.4 });
      flowers(b, fx, 0.55 + i * 0.35, fz, size * 0.45, 30 - i * 8, 0.05, 0.6);
    }
    for (let k = 0; k < 4; k++)
      tree(b, fx + Math.cos(k * 1.6) * 1.6, 0.2, fz + Math.sin(k * 1.6) * 1.6, 0.4, 0.2);
    b.add({ piece: 'dome', p: [fx, 0.2, fz], s: [4.6, 5.6, 4.6] });
    b.add({ piece: 'haloRing', p: [fx, 0.22, fz], s: [4.7, 4, 4.7], glow: 0.7 });

    // A cooling supertree between the domes (exhaust stack with a solar crown).
    const [sx, sz] = [3.4, -1.2];
    b.add({ piece: 'concreteCyl', p: [sx, 0.2, sz], s: [0.5, 6.5, 0.5], tint: 0x9aa59a });
    b.add({ piece: 'mossBox', p: [sx, 0.6, sz], s: [0.6, 4.6, 0.6], growAt: 0.1 });
    for (let k = 0; k < 10; k++)
      b.add({
        piece: 'solarLeaf',
        p: [sx, 6.7, sz],
        s: [1.5, 1, 1.1],
        r: (k / 10) * TAU,
        rz: -0.3,
        growAt: 0.2,
      });
    b.add({ piece: 'concreteCyl', p: [sx, 6.6, sz], s: [0.7, 0.2, 0.7], tint: 0xe9f4ef });
  },
});
