import { defineBuilding, type KitBuilder } from '../types';
import { beam, flowers, grassTufts } from '../kit';

/** Standing pods: x, z, height. */
const PODS = [
  [-1.8, -1.6, 11],
  [2.2, -1.2, 8.5],
  [-0.6, 2.4, 7],
  [2.8, 2.8, 5],
  [-3.2, 2.6, 4.5],
] as const;

/** A seed pod stood on end: the commuter-pod shell rotated upright, its window band running up the side. */
function seedPod(b: KitBuilder, x: number, z: number, h: number): void {
  b.add({ piece: 'pod', p: [x + 0.21 * h, 0.25 + h / 2, z], s: h, rz: Math.PI / 2, glow: 0.8 });
  b.add({ piece: 'haloRing', p: [x, 0.3, z], s: [h * 0.55, 4, h * 0.55], glow: 0.8 });
  b.add({ piece: 'lumenRib', p: [x, 0.25 + h, z], s: [0.08, 0.9, 0.08], glow: 1 });
}

export default defineBuilding({
  id: 'seedpod-labs',
  name: 'Seedpod Labs',
  description:
    'Five pearly laboratories shaped like seeds about to sprout, where the island breeds the crops and microbes of the next century. Each pod’s window seam glows while someone is working late.',
  category: 'tech',
  footprint: [9, 9],
  stats: {
    cost: 4000,
    energy: -30,
    eco: 8,
    happiness: 10,
    population: 0,
    jobs: 160,
    pollution: 0,
    water: -8,
  },
  growthTime: 180,
  variants: 1,
  style: 'sage',
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [8.8, 0.25, 8.8] });
    grassTufts(b, 0, 0.25, 0, 8.4, 8.4, 100);
    flowers(b, 0, 0.25, 0, 4.2, 70, 0, 0.6);
    for (const [x, z, h] of PODS) seedPod(b, x, z, h);
    // Glass tubes linking the pods at first-floor level.
    for (let i = 0; i < PODS.length - 1; i++) {
      const [x0, z0] = PODS[i]!;
      const [x1, z1] = PODS[i + 1]!;
      beam(b, 'glassBox', [x0, 1.6, z0], [x1, 1.6, z1], 0.5, { tint: 0xe6f4e8, glow: 0.5 });
    }
  },
});
