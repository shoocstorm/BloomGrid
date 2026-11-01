import { defineBuilding } from '../types';
import { PALETTE, TRIM, flowers, forecourt, grassTufts, ivyEdge, tree } from '../kit';

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
    // Detail (D-097): a lighting truss with spotlights over the stage, speaker stacks, and a paved entrance at the
    // top of the bowl with planters and lamps.
    for (const sx of [-1, 1]) {
      b.add({ piece: 'slab', p: [sx * 2.7, 0.6, -2.35], s: [0.12, 2.3, 0.12], tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: [sx * 2.35, 0.6, -2.6], s: [0.4, 0.75, 0.35], tint: 0x2a2d30 });
      b.add({
        piece: 'concreteCyl',
        p: [sx * 2.35, 0.95, -2.42],
        s: [0.22, 0.02, 0.22],
        rx: Math.PI / 2,
        tint: 0x55595c,
      });
    }
    b.add({ piece: 'slab', p: [0, 2.85, -2.35], s: [5.5, 0.14, 0.14], tint: TRIM.charcoal });
    for (let i = 0; i < 6; i++)
      b.add({
        piece: 'lumenRib',
        p: [-2.0 + i * 0.8, 2.68, -2.3],
        s: [0.14, 0.17, 0.14],
        tint: [0xffd9a0, 0xffb7d5, 0x9ee6ff][i % 3],
        glow: 1,
      });
    forecourt(b, 0, 0.15, 4.4, 3.2, 0.8, 2, 0);
    // Ivy down the back of the top row, so the street side is green, not a bare wall.
    const rTop = 2.4 + (ROWS - 1) * 0.62 + 0.31;
    for (let s = 0; s < SEG; s++) {
      const a = Math.PI * (0.08 + ((s + 0.5) / SEG) * 0.84);
      const [x, z] = [Math.cos(a) * rTop, -3.4 + Math.sin(a) * rTop];
      if (Math.abs(x) > 4.7 || z > 4.9) continue;
      ivyEdge(
        b,
        x,
        0.15 + (ROWS - 1) * 0.32 + 0.3,
        z,
        (Math.PI * rTop * 0.84) / SEG,
        Math.cos(a),
        Math.sin(a),
        4,
      );
    }
  },
});
