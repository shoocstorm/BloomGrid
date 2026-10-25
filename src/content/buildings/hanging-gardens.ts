import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;
const LEVELS = 6;
const LH = 1.25;

export default defineBuilding({
  id: 'hanging-gardens',
  name: 'Hanging Gardens Ziggurat',
  description:
    'A stepped food-forest ziggurat cut into the hillside: six terraces of orchards and kitchen gardens, cascades spilling from level to level, and a great Tree of Life on its crown.',
  category: 'food',
  footprint: [10, 10],
  stats: {
    cost: 3800,
    energy: -12,
    eco: 25,
    happiness: 14,
    population: 0,
    jobs: 120,
    pollution: -2,
    water: -30,
    food: 600,
  },
  growthTime: 200,
  pollinators: 3,
  variants: 1,
  recipe(b) {
    let y = 0;
    for (let i = 0; i < LEVELS; i++) {
      const size = 9.6 - i * 1.4;
      b.add({ piece: 'slab', p: [0, y, 0], s: [size, LH, size], tint: i % 2 ? 0xe9e2d0 : PALETTE.concrete });
      // Glazed workshop band set into each riser.
      b.add({
        piece: 'glassBox',
        p: [0, y + 0.2, 0],
        s: [size + 0.04, LH * 0.45, size - 1.2],
        tint: PALETTE.glassWarm,
        glow: 0.2,
      });
      y += LH;
      const ring = size - 0.15;
      b.add({ piece: 'mossBox', p: [0, y, 0], s: [ring, 0.1, ring] });
      grassTufts(b, 0, y + 0.1, 0, ring, ring, Math.round(ring * 6), 0.05);
      flowers(b, 0, y + 0.1, 0, ring * 0.5, Math.round(ring * 4), 0.1, 0.7);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        ivyEdge(
          b,
          Math.sin(a) * size * 0.5,
          y,
          Math.cos(a) * size * 0.5,
          size * 0.8,
          Math.sin(a),
          Math.cos(a),
          5,
        );
        // Orchard trees on the outer step of the terrace.
        const r = size * 0.5 - 0.45;
        tree(b, Math.sin(a + 0.6) * r, y + 0.1, Math.cos(a + 0.6) * r, 0.45, 0.15 + i * 0.05);
      }
      // Cascades down the front (+z) and back faces of each riser.
      if (i < LEVELS - 1)
        for (const r of [0, Math.PI])
          b.add({
            piece: 'waterfall',
            p: [Math.sin(r) * (size * 0.5 + 0.02), y - LH, Math.cos(r) * (size * 0.5 + 0.02)],
            s: [0.9, LH, 1],
            r,
            glow: 0.7,
          });
    }
    // Tree of Life crown with a glowing root ring.
    b.add({ piece: 'trunk', p: [0, y, 0], s: [0.7, 3.2, 0.7], tint: PALETTE.bark });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      b.add({
        piece: 'canopy',
        p: [Math.cos(a) * 1.0, y + 2.5 + (k % 2) * 0.4, Math.sin(a) * 1.0],
        s: 1.9,
        tint: PALETTE.leaves[k % PALETTE.leaves.length],
        glow: k % 2 ? 0.5 : 0,
        growAt: 0.2 + k * 0.05,
      });
    }
    b.add({ piece: 'canopy', p: [0, y + 3.3, 0], s: 2.2, tint: 0x8fd35a, glow: 0.4, growAt: 0.3 });
    b.add({ piece: 'haloRing', p: [0, y + 0.15, 0], s: [2.4, 4, 2.4], glow: 0.9 });
  },
});
