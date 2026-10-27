import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;
const BANDS = 6;

export default defineBuilding({
  id: 'nautilus-library',
  name: 'Nautilus Library',
  description:
    'A spiral rotunda of books that widens as it rises, like a shell grown in reverse, under a glass oculus. A slender reading tower beside it holds the island’s seed and story archives.',
  category: 'tech',
  footprint: [9, 9],
  stats: {
    cost: 3700,
    energy: -18,
    eco: 10,
    happiness: 24,
    population: 0,
    jobs: 90,
    pollution: 0,
    water: -6,
  },
  growthTime: 180,
  variants: 1,
  style: 'mosaic',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [8.8, 0.2, 8.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [-3.4, 0.2, 3.4], s: [1.8, 0.1, 1.8] });
    grassTufts(b, -3.4, 0.3, 3.4, 1.6, 1.6, 14);
    flowers(b, -3.4, 0.3, 3.4, 0.8, 14, 0, 0.6);
    tree(b, -3.4, 0.3, 3.4, 0.7, 0.1);
    // Rotunda: white bands with glass reading galleries between, each wider than the last.
    let y = 0.2;
    let r = 2.0;
    for (let i = 0; i < BANDS; i++) {
      r = 2.0 + i * 0.42;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.75, r * 2], tint: PALETTE.concrete });
      y += 0.75;
      b.add({
        piece: 'glassCyl',
        p: [0, y, 0],
        s: [r * 2 - 0.35, 0.45, r * 2 - 0.35],
        tint: PALETTE.glassWarm,
        glow: 0.5,
      });
      y += 0.45;
      if (i % 2)
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + i;
          ivyEdge(b, Math.sin(a) * r, y - 0.45, Math.cos(a) * r, 1.2, Math.sin(a), Math.cos(a), 1);
        }
    }
    // Roof garden ring and the glass oculus.
    b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.15, r * 2], tint: 0xe9e2d0 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      flowers(b, Math.cos(a) * (r - 0.6), y + 0.15, Math.sin(a) * (r - 0.6), 0.4, 5, 0.1, 0.7);
    }
    b.add({ piece: 'dome', p: [0, y + 0.15, 0], s: [r * 1.3, r * 1.1, r * 1.3] });
    b.add({ piece: 'haloRing', p: [0, y + 0.18, 0], s: [r * 1.32, 4, r * 1.32], glow: 0.9 });
    // Reading tower and its bridge.
    const [tx, tz] = [3.6, -3.6];
    b.add({ piece: 'glassCyl', p: [tx, 0.2, tz], s: [1.2, 11, 1.2], tint: PALETTE.glass, glow: 0.4 });
    b.add({ piece: 'lumenRib', p: [tx, 0.2, tz + 0.6], s: [0.08, 11, 0.08], glow: 0.8 });
    b.add({ piece: 'spireCone', p: [tx, 11.2, tz], s: [1.2, 2.4, 1.2], tint: PALETTE.glassWarm, glow: 0.5 });
    for (let k = 0; k < 6; k++)
      b.add({
        piece: 'solarLeaf',
        p: [tx, 11.2, tz],
        s: [1.3, 1, 0.9],
        r: (k / 6) * TAU,
        rz: 0.5,
        growAt: 0.2,
      });
    beam(b, 'timberBox', [tx, 5.6, tz], [tx * 0.55, 5.6, tz * 0.55], 0.3, { tint: 0xc8a57c });
  },
});
