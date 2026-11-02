import { defineBuilding } from '../types';
import { PALETTE, entrance, flowers, footbridge, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const TIERS = 7;

export default defineBuilding({
  id: 'lotus-pagoda',
  name: 'Lotus Pagoda Museum',
  description:
    'A seven-storey pagoda whose eaves are solar petals, each tier a gallery of the island’s history from mangrove village to bloom city. Lanterns trace its rooflines at night.',
  category: 'tech',
  footprint: [8, 8],
  stats: { cost: 3200, energy: -12, eco: 6, happiness: 22, population: 0, jobs: 60, pollution: 0, water: -4 },
  growthTime: 180,
  variants: 1,
  style: 'charred-timber',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.4, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.4, 3.2], s: [6.8, 0.05, 1.1] });
    for (const [x, z] of [
      [-3.2, -3.2],
      [3.2, -3.2],
    ] as const) {
      grassTufts(b, x, 0.4, z, 1.2, 1.2, 8);
      tree(b, x, 0.4, z, 0.7, 0.1);
    }
    flowers(b, 0, 0.4, 3.2, 1.0, 10, 0, 0.6);
    // One tier: a glass drum, its eave plate, a whorl of solar petals and a halo; returns the next tier's base.
    const tier = (i: number, y: number): number => {
      const d = 4.2 - i * 0.42;
      const h = 1.5 - i * 0.06;
      b.add({ piece: 'glassCyl', p: [0, y, 0], s: [d, h, d], tint: PALETTE.glassWarm, glow: 0.4 });
      y += h;
      // Eaves: a ring of petals curving down and out, with a lantern ring at the lip.
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d + 0.6, 0.15, d + 0.6], tint: 0xe9e2d0 });
      const n = 12 - Math.floor(i / 2);
      for (let k = 0; k < n; k++)
        b.add({
          piece: 'solarLeaf',
          p: [0, y + 0.1, 0],
          s: [d * 0.5 + 1.1, 1, 1.0],
          r: (k / n) * TAU + i * 0.2,
          rz: -0.32,
          growAt: 0.05 * i,
        });
      b.add({ piece: 'haloRing', p: [0, y - 0.3, 0], s: [d + 1.6, 4, d + 1.6], glow: 0.8 });
      return y + 0.25;
    };
    let y = 0.4;
    for (let i = 0; i < TIERS; i++) y = tier(i, y);
    const spire = (y: number, k = 1, tint: number = PALETTE.glassWarm) => {
      b.add({ piece: 'spireCone', p: [0, y, 0], s: [1.0, 3.0 * k, 1.0], tint, glow: 0.6 });
      for (let i = 0; i < 5; i++)
        b.add({
          piece: 'haloRing',
          p: [0, y + (0.5 + i * 0.45) * k, 0],
          s: [0.9 - i * 0.12, 4, 0.9 - i * 0.12],
          glow: 1,
        });
    };
    b.upTo(1, () => spire(y));
    // Street level (D-097): a railed bridge over the front pool to a lit door, and stone lanterns along the way.
    footbridge(b, 0, 0.42, 3.3, 1.2, 0.8);
    entrance(b, 0, 0.4, 2.1, 0.8, 0.5, 0xffe08a);
    for (const [x, z] of [
      [-1.5, 2.3],
      [1.5, 2.3],
      [-3.2, 0.6],
      [3.2, 0.6],
    ] as const) {
      b.add({ piece: 'slab', p: [x, 0.4, z], s: [0.26, 0.08, 0.26], tint: 0xd8d2c4 });
      b.add({ piece: 'concreteCyl', p: [x, 0.48, z], s: [0.1, 0.32, 0.1], tint: 0xd8d2c4 });
      b.add({ piece: 'lumenRib', p: [x, 0.8, z], s: [0.2, 0.15, 0.2], tint: 0xffd9a0, glow: 1 });
      b.add({ piece: 'slab', p: [x, 0.95, z], s: [0.3, 0.05, 0.3], tint: 0xd8d2c4 });
      b.add({ piece: 'spireCone', p: [x, 1.0, z], s: [0.18, 0.12, 0.18], tint: 0xd8d2c4 });
    }

    // Levels (D-100). Level 2: an eighth tier with its whorl of petals, the spire lifted onto it, and stone
    // lanterns on the bridge.
    b.level(2, () => {
      const y2 = tier(TIERS, y);
      b.upTo(2, () => spire(y2));
      for (const x of [-0.5, 0.5]) {
        b.add({ piece: 'concreteCyl', p: [x, 0.5, 3.75], s: [0.08, 0.3, 0.08], tint: 0xd8d2c4 });
        b.add({ piece: 'lumenRib', p: [x, 0.8, 3.75], s: [0.14, 0.12, 0.14], tint: 0xffd9a0, glow: 1 });
      }
    });
    // Level 3: a ninth tier and a gilded spire half again as tall, a lotus of golden petals round its foot, and
    // wind bells hung from the lowest eave.
    b.level(3, () => {
      const y3 = tier(TIERS + 1, tier(TIERS, y));
      spire(y3, 1.5, 0xffe08a);
      for (let k = 0; k < 8; k++) b.add({ piece: 'sunPetal', p: [0, y3, 0], s: [1.2, 1, 0.7], r: (k / 8) * TAU, rz: 0.7, tint: 0xffd56b, glow: 0.7 });
      const r0 = (4.2 + 0.6) / 2;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        b.add({ piece: 'timberBox', p: [Math.cos(a) * r0, 1.55, Math.sin(a) * r0], s: [0.012, 0.3, 0.012], tint: 0x6b5440 });
        b.add({ piece: 'dome', p: [Math.cos(a) * r0, 1.48, Math.sin(a) * r0], s: [0.14, 0.18, 0.14], rx: Math.PI, tint: 0xffd56b, glow: 0.6 });
      }
    });
  },
});
