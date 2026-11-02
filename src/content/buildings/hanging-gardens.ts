import { defineBuilding } from '../types';
import { PALETTE, bench, entrance, flowers, grassTufts, ivyEdge, lamp, railing, tree } from '../kit';

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
  style: 'terracotta',
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
    // Tree of Life crown with a glowing root ring; a level grows a terrace under it (D-100).
    const crown = (y: number, sc = 1) => {
      b.add({ piece: 'trunk', p: [0, y, 0], s: [0.7 * sc, 3.2 * sc, 0.7 * sc], tint: PALETTE.bark });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        b.add({
          piece: 'canopy',
          p: [Math.cos(a) * sc, y + (2.5 + (k % 2) * 0.4) * sc, Math.sin(a) * sc],
          s: 1.9 * sc,
          tint: PALETTE.leaves[k % PALETTE.leaves.length],
          glow: k % 2 ? 0.5 : 0,
          growAt: 0.2 + k * 0.05,
        });
      }
      b.add({ piece: 'canopy', p: [0, y + 3.3 * sc, 0], s: 2.2 * sc, tint: 0x8fd35a, glow: 0.4, growAt: 0.3 });
      b.add({ piece: 'haloRing', p: [0, y + 0.15, 0], s: [2.4, 4, 2.4], glow: 0.9 });
    };
    b.upTo(1, () => crown(y));
    // Street level and terraces (D-097): two lit entrances either side of the front cascade, and on every terrace
    // a glass balustrade, corner lamps and a bench looking out.
    for (const x of [-2.4, 2.4]) entrance(b, x, 0, 4.81, 0.9, 0.5);
    for (let i = 0; i < LEVELS; i++) {
      const size = 9.6 - i * 1.4;
      const ty = (i + 1) * LH + 0.1;
      const e = size / 2 - 0.12;
      railing(b, 0, ty, e, size - 0.3);
      railing(b, 0, ty, -e, size - 0.3);
      railing(b, e, ty, 0, size - 0.3, true);
      railing(b, -e, ty, 0, size - 0.3, true);
      if (i === LEVELS - 1) continue;
      for (const sx of [-1, 1]) {
        lamp(b, sx * (e - 0.2), ty, e - 0.2, 0.5);
        bench(b, sx * 1.4, ty, e - 0.32);
      }
    }

    // Levels (D-100). One more terrace of the ziggurat (index i), planted and railed like the rest.
    const terrace = (i: number, y0: number) => {
      const size = 9.6 - i * 1.4;
      b.add({ piece: 'slab', p: [0, y0, 0], s: [size, LH, size], tint: i % 2 ? 0xe9e2d0 : PALETTE.concrete });
      b.add({ piece: 'glassBox', p: [0, y0 + 0.2, 0], s: [size + 0.04, LH * 0.45, size - 0.4], tint: PALETTE.glassWarm, glow: 0.3 });
      const y1 = y0 + LH;
      b.add({ piece: 'mossBox', p: [0, y1, 0], s: [size - 0.15, 0.1, size - 0.15] });
      flowers(b, 0, y1 + 0.1, 0, size * 0.4, 8, 0.1, 0.7);
      const e = size / 2 - 0.12;
      railing(b, 0, y1 + 0.1, e, size - 0.3);
      railing(b, 0, y1 + 0.1, -e, size - 0.3);
      return y1;
    };
    // Level 2: a seventh terrace, the Tree of Life replanted on it, and the cascades run on down from the old top.
    b.level(2, () => {
      const y2 = terrace(LEVELS, y);
      b.upTo(2, () => crown(y2 + 0.1));
      for (const r of [0, Math.PI]) b.add({ piece: 'waterfall', p: [Math.sin(r) * 0.82, y - LH, Math.cos(r) * 0.82], s: [0.5, LH, 1], r, glow: 0.7 });
    });
    // Level 3: an eighth, smallest terrace and a great Tree of Life a third larger, with fruit lanterns and a
    // second halo.
    b.level(3, () => {
      const y3 = terrace(LEVELS + 1, terrace(LEVELS, y));
      crown(y3 + 0.1, 1.3);
      b.add({ piece: 'haloRing', p: [0, y3 + 3.0, 0], s: [4.2, 4, 4.2], tint: 0xffd56b, glow: 1 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        b.add({ piece: 'flower', p: [Math.cos(a) * 1.7, y3 + 2.8 + (k % 2) * 0.5, Math.sin(a) * 1.7], s: 0.28, tint: 0xffb48a, glow: 1 });
      }
    });
  },
});
