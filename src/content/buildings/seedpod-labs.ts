import { defineBuilding, type KitBuilder } from '../types';
import { beam, bench, entrance, flowers, grassTufts, lamp } from '../kit';

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
    // Street level (D-097): a lit door at the front pod's foot, a path to it, lamps and benches on the lawn.
    entrance(b, -0.6, 0.25, 3.45, 0.5, 0.42, 0xc9b6ff);
    b.add({ piece: 'slab', p: [-0.6, 0.25, 4.15], s: [0.7, 0.02, 1.0], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) lamp(b, -0.6 + sx * 0.55, 0.25, 4.3, 0.6);
    bench(b, 1.0, 0.25, 0.6);
    bench(b, -2.6, 0.25, 0.2);

    // Levels (D-100). Level 2: a sixth pod sprouts in the east meadow, linked by tube, and the oldest pod puts out
    // a green shoot: a leafy sprout with two leaves from its tip.
    b.level(2, () => {
      seedPod(b, 3.4, 0.6, 6);
      beam(b, 'glassBox', [2.2, 1.6, -1.2], [3.4, 1.6, 0.6], 0.5, { tint: 0xe6f4e8, glow: 0.5 });
      b.add({ piece: 'trunk', p: [-1.8, 11.2, -1.6], s: [0.12, 1.6, 0.12], tint: 0x6fbf4a });
      for (const s of [-1, 1]) b.add({ piece: 'solarLeaf', p: [-1.8, 12.4, -1.6], s: [1.2, 1, 0.7], r: s > 0 ? 0 : Math.PI, rz: 0.4, tint: 0x8fd35a });
    });
    // Level 3: a seventh pod by the gate, the sprout grows into a sapling with a lit bud, and a seed-vault
    // lantern ring circles the cluster.
    b.level(3, () => {
      seedPod(b, 3.4, 0.6, 6);
      seedPod(b, -3.4, -0.6, 7.5);
      beam(b, 'glassBox', [2.2, 1.6, -1.2], [3.4, 1.6, 0.6], 0.5, { tint: 0xe6f4e8, glow: 0.5 });
      beam(b, 'glassBox', [-1.8, 1.6, -1.6], [-3.4, 1.6, -0.6], 0.5, { tint: 0xe6f4e8, glow: 0.5 });
      b.add({ piece: 'trunk', p: [-1.8, 11.2, -1.6], s: [0.16, 2.6, 0.16], tint: 0x6fbf4a });
      for (let k = 0; k < 4; k++) b.add({ piece: 'solarLeaf', p: [-1.8, 12.4 + (k % 2) * 0.6, -1.6], s: [1.3, 1, 0.7], r: (k / 4) * Math.PI * 2, rz: 0.4, tint: 0x8fd35a });
      b.add({ piece: 'flower', p: [-1.8, 13.8, -1.6], s: 0.6, tint: 0xc9b6ff, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 2.2, 0.5], s: [8.2, 4, 7.6], tint: 0xc9b6ff, glow: 0.8 });
    });
  },
});
