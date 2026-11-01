import { defineBuilding } from '../types';
import { PALETTE, beam, entrance, flowers, footbridge, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;
const TINTS = [0xd8e8ff, 0xe6dcff, 0xd6f2ee, 0xf0e6ff] as const;

export default defineBuilding({
  id: 'quartz-spire',
  name: 'Quartz Data Spire',
  description:
    'The island’s data vault, grown as a cluster of photonic crystal shards rising from a cooling lagoon. Its servers run on sunlight and the lagoon water carries their heat to the district’s baths.',
  category: 'tech',
  footprint: [9, 9],
  stats: {
    cost: 4300,
    energy: -40,
    eco: 6,
    happiness: 12,
    population: 0,
    jobs: 180,
    pollution: 0,
    water: -12,
  },
  growthTime: 180,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [8.8, 0.2, 8.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 0], s: [8.2, 0.06, 8.2] });
    b.add({ piece: 'slab', p: [0, 0.2, 0], s: [5.0, 0.28, 5.0], r: Math.PI / 4, tint: 0xe9f4ef });
    b.add({ piece: 'haloRing', p: [0, 0.5, 0], s: [5.6, 4, 5.6], glow: 0.9 });
    for (const [x, z] of [
      [-3.6, -3.6],
      [3.6, 3.6],
    ] as const) {
      b.add({ piece: 'mossBox', p: [x, 0.2, z], s: [1.2, 0.1, 1.2] });
      grassTufts(b, x, 0.3, z, 1.1, 1.1, 10);
      flowers(b, x, 0.3, z, 0.5, 10, 0, 0.5);
    }
    // The master crystal and its tip.
    b.add({
      piece: 'glassBox',
      p: [0, 0.48, 0],
      s: [1.9, 14, 1.9],
      r: Math.PI / 4,
      tint: 0xd8e8ff,
      glow: 0.6,
    });
    b.add({
      piece: 'spireCone',
      p: [0, 14.48, 0],
      s: [2.6, 3.2, 2.6],
      r: Math.PI / 4,
      tint: 0xe6f4ff,
      glow: 0.7,
    });
    // Lesser shards leaning out from the root, tallest nearest the master.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + b.range(-0.2, 0.2);
      const d = b.range(0.8, 1.6);
      const h = b.range(4.5, 11) * (1 - k * 0.03);
      const lean = b.range(0.8, 2.2);
      const base: [number, number, number] = [Math.cos(a) * d, 0.48, Math.sin(a) * d];
      const top: [number, number, number] = [Math.cos(a) * (d + lean), h, Math.sin(a) * (d + lean)];
      beam(b, 'glassBox', base, top, b.range(0.7, 1.2), { tint: TINTS[k % TINTS.length], glow: 0.55 });
      beam(b, 'lumenRib', [base[0], base[1] + 0.4, base[2]], [top[0], top[1] + 0.3, top[2]], 0.08, {
        glow: 0.9,
      });
    }
    // Street level (D-097): a railed footbridge over the pool to a glazed visitor gallery at the crystal's foot,
    // lamps on the platform and lilies round it.
    footbridge(b, 0, 0.22, 3.95, 1.0, 0.8);
    b.add({ piece: 'glassBox', p: [0, 0.48, 2.1], s: [1.4, 0.6, 0.7], tint: PALETTE.glassWarm, glow: 0.4 });
    entrance(b, 0, 0.48, 2.46, 0.6, 0.42, 0xd8e8ff);
    for (const x of [-0.9, 0.9]) lamp(b, x, 0.48, 2.55, 0.55);
    for (let i = 0; i < 40; i++) {
      const [x, z] = [b.range(-4, 4), b.range(-4, 4)];
      const onGarden = Math.hypot(x - 3.6, z - 3.6) < 1 || Math.hypot(x + 3.6, z + 3.6) < 1;
      if (Math.abs(x) + Math.abs(z) < 3.9 || (Math.abs(x) < 0.6 && z > 3) || onGarden) continue;
      b.add({
        piece: 'lily',
        p: [x, 0.26, z],
        s: b.range(0.16, 0.26),
        r: b.rand() * TAU,
        tint: b.pick(PALETTE.blossoms),
      });
    }
  },
});
