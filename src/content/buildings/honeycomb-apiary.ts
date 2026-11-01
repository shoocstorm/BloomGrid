import { defineBuilding } from '../types';
import { PALETTE, bench, flowers, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;
const LEVELS = 12;
const HONEY = [0xffc84a, 0xffd56b, 0xf4b43a] as const;

export default defineBuilding({
  id: 'honeycomb-apiary',
  name: 'Honeycomb Apiary Tower',
  description:
    'A tower of honey-gold cells, each a hive or a beekeeper’s workshop, rising from a wildflower meadow. Its bees pollinate gardens across the whole central district.',
  category: 'nature',
  footprint: [8, 8],
  stats: {
    cost: 2800,
    energy: -6,
    eco: 22,
    happiness: 14,
    population: 0,
    jobs: 30,
    pollution: -2,
    water: -6,
    food: 150,
  },
  growthTime: 180,
  pollinators: 6,
  variants: 1,
  style: 'bamboo',
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [7.8, 0.15, 7.8] });
    grassTufts(b, 0, 0.15, 0, 7.4, 7.4, 70);
    flowers(b, 0, 0.15, 0, 3.8, 120, 0, 0.5);
    b.add({
      piece: 'glassCyl',
      p: [0, 0.15, 0],
      s: [1.6, LEVELS * 1.0 + 0.6, 1.6],
      tint: PALETTE.glassWarm,
      glow: 0.6,
    });
    // Cells: six per level round the core, offset half a cell on alternate levels like a comb.
    for (let L = 0; L < LEVELS; L++) {
      const r = 1.55 + Math.sin((L / LEVELS) * Math.PI) * 0.6;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + (L % 2) * (TAU / 12);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        b.add({
          piece: 'concreteCyl',
          p: [x, 0.15 + L * 1.0, z],
          s: [1.15, 0.95, 1.15],
          tint: HONEY[(k + L) % 3],
        });
        if ((k + L) % 4 === 0)
          b.add({
            piece: 'glassCyl',
            p: [x, 0.35 + L * 1.0, z],
            s: [1.18, 0.4, 1.18],
            tint: PALETTE.glassWarm,
            glow: 0.8,
          });
      }
    }
    // Crown: a flower meadow on the roof under a glowing ring.
    const top = 0.15 + LEVELS * 1.0;
    b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [5.0, 0.2, 5.0], tint: 0xffd56b });
    flowers(b, 0, top + 0.2, 0, 2.2, 40, 0.1, 0.7);
    b.add({ piece: 'haloRing', p: [0, top + 0.3, 0], s: [5.2, 4, 5.2], glow: 0.9 });
    // Visitors (D-097): a path in from the street, white hive boxes in the meadow, benches and lamps.
    b.add({ piece: 'slab', p: [0, 0.15, 3.3], s: [0.8, 0.02, 1.2], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) lamp(b, sx * 0.55, 0.15, 3.75, 0.6);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      if (Math.abs(a - Math.PI / 2) < 0.4) continue;
      const [x, z] = [Math.cos(a) * 3.35, Math.sin(a) * 3.35];
      for (let s = 0; s < 3; s++)
        b.add({
          piece: 'slab',
          p: [x, 0.15 + s * 0.13, z],
          s: [0.3, 0.12, 0.3],
          r: a,
          tint: s === 1 ? 0xffe08a : 0xf6f2ea,
        });
      b.add({ piece: 'slab', p: [x, 0.54, z], s: [0.36, 0.04, 0.36], r: a, tint: 0x8a9494 });
    }
    bench(b, 1.4, 0.15, 3.2);
    bench(b, -1.4, 0.15, 3.2);
  },
});
