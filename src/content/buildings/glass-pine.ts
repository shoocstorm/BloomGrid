import { defineBuilding } from '../types';
import { PALETTE, bench, entrance, flowers, grassTufts, tree } from '../kit';

/** Tiers of the pine: base height, cone diameter, cone height. */
const TIERS = [
  [0.3, 9.0, 7.0],
  [4.6, 7.4, 6.5],
  [8.6, 5.8, 6.0],
  [12.4, 4.2, 5.6],
  [16.0, 2.7, 5.4],
] as const;

export default defineBuilding({
  id: 'glass-pine',
  name: 'Glass Pine Tower',
  description:
    'An office tower shaped like a conifer: five stacked glass cones, each ringed with light, shelter studio floors under evergreen terraces. The island’s tallest evergreen, and its busiest.',
  category: 'commercial',
  footprint: [10, 10],
  stats: {
    cost: 4800,
    energy: -34,
    eco: 8,
    happiness: 12,
    population: 0,
    jobs: 220,
    pollution: 1,
    water: -12,
  },
  growthTime: 210,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.3, 9.8], tint: PALETTE.concrete });
    for (const [x, z] of [
      [-4.1, -4.1],
      [4.1, -4.1],
      [-4.1, 4.1],
      [4.1, 4.1],
    ] as const) {
      grassTufts(b, x, 0.3, z, 1.4, 1.4, 10);
      tree(b, x, 0.3, z, 0.8, 0.1);
    }
    flowers(b, 0, 0.3, 4.3, 1.0, 16, 0, 0.6);
    // A glass trunk through the middle.
    b.add({ piece: 'glassCyl', p: [0, 0.3, 0], s: [2.4, 21, 2.4], tint: PALETTE.glassWarm, glow: 0.3 });
    for (const [y, d, h] of TIERS) {
      b.add({ piece: 'spireCone', p: [0, y, 0], s: [d, h, d], tint: PALETTE.glass, glow: 0.2 });
      b.add({ piece: 'haloRing', p: [0, y + 0.1, 0], s: [d * 0.98, 5, d * 0.98], glow: 0.9 });
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d, 0.12, d], tint: 0xe9f4ef });
    }
    b.upTo(2, () => b.add({ piece: 'lumenRib', p: [0, 21.3, 0], s: [0.12, 2.0, 0.12], glow: 1 }));
    // Street level (D-097): a glazed vestibule through the foot of the lowest cone, benches round the trunk in the
    // winter garden inside, and a ring of glowing bollards on the plaza rim.
    b.add({ piece: 'glassBox', p: [0, 0.3, 4.5], s: [1.2, 0.62, 0.6], tint: PALETTE.glassWarm, glow: 0.4 });
    entrance(b, 0, 0.3, 4.81, 0.7, 0.45);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const [x, z] = [Math.cos(a) * 2.3, Math.sin(a) * 2.3];
      bench(b, x, 0.3, z, 0.5, Math.abs(x) > Math.abs(z), x < 0);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.26;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 4.7, 0.3, Math.sin(a) * 4.7],
        s: [0.08, 0.2, 0.08],
        tint: 0xffd9a0,
        glow: 0.9,
      });
    }

    // Levels (D-100). Level 2: evergreen terraces: a planted rim on the three lower cones, ringed with conifer
    // canopies and lit at night.
    b.level(2, () => {
      for (const [y, d] of TIERS.slice(1, 4)) {
        const r = d / 2 + 0.25;
        b.add({ piece: 'concreteCyl', p: [0, y - 0.05, 0], s: [d + 0.7, 0.1, d + 0.7], tint: 0xe9f4ef });
        const n = Math.round(d * 2.2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          b.add({ piece: 'canopy', p: [Math.cos(a) * r, y + 0.05, Math.sin(a) * r], s: [0.35, 0.6, 0.35], tint: PALETTE.leaves[k % 3 === 0 ? 3 : 1], growAt: 0.1 });
        }
        b.add({ piece: 'haloRing', p: [0, y + 0.02, 0], s: [d + 0.7, 3, d + 0.7], tint: 0xffd9a0, glow: 0.7 });
      }
    });
    // Level 3: the pine grows a sixth cone, a taller trunk and a lit star crown.
    b.level(3, () => {
      b.add({ piece: 'glassCyl', p: [0, 21.3, 0], s: [1.2, 2.6, 1.2], tint: PALETTE.glassWarm, glow: 0.3 });
      b.add({ piece: 'spireCone', p: [0, 19.6, 0], s: [1.7, 5.4, 1.7], tint: PALETTE.glass, glow: 0.2 });
      b.add({ piece: 'haloRing', p: [0, 19.7, 0], s: [1.7, 5, 1.7], glow: 0.9 });
      b.add({ piece: 'lumenRib', p: [0, 24.6, 0], s: [0.12, 2.4, 0.12], glow: 1 });
      for (let k = 0; k < 5; k++) b.add({ piece: 'sunPetal', p: [0, 26.2, 0], s: [0.5, 1, 0.5], r: (k / 5) * Math.PI * 2, rz: 1.2, tint: 0xffe08a, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 25.6, 0], s: [1.0, 3, 1.0], tint: 0xffe08a, glow: 1 });
    });
  },
});
