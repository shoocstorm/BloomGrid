import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

const ROWS = 8;
const SEG = 14;

export default defineBuilding({
  id: 'sunset-amphitheatre',
  name: 'Sunset Amphitheatre',
  description:
    'Grass-stepped terraces curve round a stage under a fan of iridescent solar shells, facing west over the island so every evening show ends with the sunset.',
  category: 'commercial',
  footprint: [10, 10],
  stats: { cost: 2900, energy: -8, eco: 10, happiness: 30, population: 0, jobs: 30, pollution: 0, water: -4 },
  growthTime: 170,
  variants: 1,
  style: 'terracotta',
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.15, 9.8] });
    // Stage at the back (-z) with a lit apron.
    b.add({ piece: 'slab', p: [0, 0.15, -3.4], s: [5.6, 0.45, 2.4], tint: PALETTE.concrete });
    b.add({ piece: 'haloRing', p: [0, 0.62, -3.2], s: [3.4, 4, 1.6], glow: 1 });
    // Shell: solar petals fanning up and over the stage.
    for (let k = 0; k < 7; k++) {
      const a = Math.PI / 2 + ((k - 3) / 3) * 0.9;
      b.add({
        piece: 'solarLeaf',
        p: [0, 0.6, -4.4],
        s: [6.2, 1, 2.6],
        r: a,
        rz: 1.0 - Math.abs(k - 3) * 0.12,
        growAt: 0.1,
      });
    }
    // Seating: grassy stepped arcs rising toward +z.
    for (let i = 0; i < ROWS; i++) {
      const r = 2.4 + i * 0.62;
      const y = 0.15 + i * 0.32;
      for (let s = 0; s < SEG; s++) {
        const t = (s + 0.5) / SEG;
        const a = Math.PI * (0.08 + t * 0.84);
        const x = Math.cos(a) * r;
        const z = -3.4 + Math.sin(a) * r;
        if (Math.abs(x) > 4.7 || z > 4.7) continue;
        b.add({
          piece: 'slab',
          p: [x, 0.15, z],
          s: [(Math.PI * r * 0.84) / SEG + 0.05, y - 0.15 + 0.3, 0.6],
          r: Math.PI / 2 - a,
          tint: 0xe9e2d0,
        });
        if (s % 3 === i % 3) grassTufts(b, x, y + 0.3, z, 0.6, 0.4, 2, 0.1);
      }
    }
    for (const sx of [-1, 1]) {
      tree(b, sx * 4.2, 0.15, 3.6, 0.9, 0.1);
      flowers(b, sx * 4.0, 0.15, -4.2, 0.6, 10, 0, 0.6);
    }
  },
});
