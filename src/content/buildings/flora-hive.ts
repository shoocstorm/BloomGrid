import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge } from '../kit';

export default defineBuilding({
  id: 'flora-hive',
  name: 'Flora-Net Drone Hive',
  description:
    'A honeycomb node of the Flora-Net AI. Its hummingbird drones pollinate flowers, harvest ripe produce, trim overgrown highways and mist parched gardens nearby.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 280, energy: -6, eco: 4, happiness: 2, population: 0, jobs: 4, pollution: 0, water: -2 },
  growthTime: 60,
  pollinators: 0.8,
  drones: { radius: 16, count: 12 },
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.9, 0.1, 1.9] });
    grassTufts(b, 0, 0.1, 0, 1.7, 1.7, 14);
    flowers(b, 0, 0.1, 0, 0.85, 22, 0, 0.6);
    b.add({ piece: 'concreteCyl', p: [0, 0.1, 0], s: [0.22, 1.1, 0.22], tint: PALETTE.concrete });
    // Stacked honeycomb cells, golden and softly lit.
    for (let i = 0; i < 4; i++) {
      const y = 1.1 + i * 0.26;
      const r = 0.95 - Math.abs(i - 1.5) * 0.18;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r, 0.24, r], tint: i % 2 ? 0xffd166 : 0xffe08a, glow: 0.5 });
    }
    b.upTo(1, () => b.add({ piece: 'dome', p: [0, 2.14, 0], s: [0.7, 0.4, 0.7] }));
    // Drones resting on the comb.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add({ piece: 'drone', p: [Math.cos(a) * 0.5, 1.36 + (i % 2) * 0.26, Math.sin(a) * 0.5], s: 0.16, r: -a, glow: 1, growAt: 0.2 + i * 0.05 });
    }
    ivyEdge(b, 0.45, 1.1, 0, 0.6, 1, 0, 2);
    ivyEdge(b, -0.45, 1.1, 0, 0.6, -1, 0, 2);

    // Levels (D-100): the hive grows comb by comb. A honey-glass ring at height y, radius r.
    const comb = (y: number, r: number, i: number) => b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r, 0.24, r], tint: i % 2 ? 0xffd166 : 0xffe08a, glow: 0.5 });
    // Level 2: two more combs, the cap lifted onto them, and a ring of landing perches with more drones.
    b.level(2, () => {
      comb(2.14, 0.7, 0);
      comb(2.4, 0.55, 1);
      b.upTo(2, () => b.add({ piece: 'dome', p: [0, 2.64, 0], s: [0.55, 0.35, 0.55] }));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.add({ piece: 'timberBox', p: [Math.cos(a) * 0.62, 1.04, Math.sin(a) * 0.62], s: [0.3, 0.025, 0.06], r: -a, tint: PALETTE.timber });
        b.add({ piece: 'drone', p: [Math.cos(a) * 0.72, 1.12, Math.sin(a) * 0.72], s: 0.14, r: -a, glow: 1 });
      }
    });
    // Level 3: a crown comb, a seed-drone mast with a halo, and a ring of flowering planters round the foot.
    b.level(3, () => {
      comb(2.14, 0.7, 0);
      comb(2.4, 0.55, 1);
      comb(2.64, 0.4, 0);
      b.add({ piece: 'dome', p: [0, 2.88, 0], s: [0.42, 0.3, 0.42] });
      b.add({ piece: 'lumenRib', p: [0, 3.0, 0], s: [0.04, 0.6, 0.04], tint: 0xffe08a, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 3.4, 0], s: [0.5, 2, 0.5], tint: 0xffe08a, glow: 1 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add({ piece: 'concreteCyl', p: [Math.cos(a) * 0.78, 0.1, Math.sin(a) * 0.78], s: [0.22, 0.12, 0.22], tint: 0xdcd5c6 });
        b.add({ piece: 'flower', p: [Math.cos(a) * 0.78, 0.22, Math.sin(a) * 0.78], s: 0.16, tint: PALETTE.blossoms[i % 7], glow: 0.6 });
      }
    });
  },
});
