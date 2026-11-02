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
    const crown = (y: number, r: number) => {
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.2, r * 2], tint: 0xffd56b });
      flowers(b, 0, y + 0.2, 0, r * 0.88, 40, 0.1, 0.7);
      b.add({ piece: 'haloRing', p: [0, y + 0.3, 0], s: [r * 2.08, 4, r * 2.08], glow: 0.9 });
    };
    b.upTo(1, () => crown(top, 2.5));
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

    // Levels (D-100): more comb. A level of six cells round the core at height index L, radius r.
    const comb = (L: number, r: number) => {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + (L % 2) * (TAU / 12);
        const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
        b.add({ piece: 'concreteCyl', p: [x, 0.15 + L * 1.0, z], s: [1.0, 0.95, 1.0], tint: HONEY[(k + L) % 3] });
        if ((k + L) % 3 === 0) b.add({ piece: 'glassCyl', p: [x, 0.35 + L * 1.0, z], s: [1.03, 0.4, 1.03], tint: PALETTE.glassWarm, glow: 0.8 });
      }
      b.add({ piece: 'glassCyl', p: [0, 0.15 + L * 1.0, 0], s: [1.4, 1.0, 1.4], tint: PALETTE.glassWarm, glow: 0.6 });
    };
    // Level 2: two more levels of comb narrowing toward the top, the meadow crown riding on them, and bee hotel
    // pillars round the meadow.
    b.level(2, () => {
      comb(LEVELS, 1.25);
      comb(LEVELS + 1, 1.0);
      b.upTo(2, () => crown(top + 2, 2.0));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.8;
        b.add({ piece: 'timberBox', p: [Math.cos(a) * 2.6, 0.15, Math.sin(a) * 2.6], s: [0.3, 1.1, 0.3], tint: 0x9b6e45 });
        b.add({ piece: 'slab', p: [Math.cos(a) * 2.6, 1.25, Math.sin(a) * 2.6], s: [0.4, 0.04, 0.4], tint: 0xc8714f });
      }
    });
    // Level 3: a queen's lantern on top: a last comb, a golden glass bell with a halo, and a swarm of glowing
    // bees circling the crown.
    b.level(3, () => {
      comb(LEVELS, 1.25);
      comb(LEVELS + 1, 1.0);
      comb(LEVELS + 2, 0.8);
      crown(top + 3, 1.6);
      b.add({ piece: 'dome', p: [0, top + 3.2, 0], s: [1.4, 1.8, 1.4], tint: 0xffd56b, glow: 0.6 });
      b.add({ piece: 'haloRing', p: [0, top + 4.4, 0], s: [1.6, 3, 1.6], tint: 0xffe08a, glow: 1 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        b.add({ piece: 'drone', p: [Math.cos(a) * 2.2, top + 3.6 + (k % 3) * 0.4, Math.sin(a) * 2.2], s: 0.16, r: -a, tint: 0xffd56b, glow: 1 });
      }
    });
  },
});
