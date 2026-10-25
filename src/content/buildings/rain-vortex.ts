import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'rain-vortex',
  name: 'Rain Vortex Market',
  description:
    'A glass donut market around the world’s tallest indoor rain-fall: the roof funnels every storm through an oculus into a glowing water column, then into the city’s mains. Forest terraces ring the falls.',
  category: 'utility',
  footprint: [10, 10],
  stats: {
    cost: 4400,
    energy: -14,
    eco: 18,
    happiness: 26,
    population: 0,
    jobs: 150,
    pollution: -1,
    water: 60,
  },
  growthTime: 180,
  pollinators: 1,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.25, 9.8], tint: PALETTE.concrete });
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      b.add({ piece: 'mossBox', p: [sx * 4.3, 0.25, sz * 4.3], s: [1.1, 0.1, 1.1] });
      tree(b, sx * 4.3, 0.35, sz * 4.3, 0.6, 0.1);
    }
    // Ground-floor market ring.
    b.add({ piece: 'glassCyl', p: [0, 0.25, 0], s: [8.2, 1.3, 8.2], tint: PALETTE.glassWarm, glow: 0.25 });
    b.add({ piece: 'concreteCyl', p: [0, 1.55, 0], s: [8.6, 0.15, 8.6], tint: PALETTE.concrete });
    // Stepped forest terraces inside the shell, around the falls.
    for (let i = 0; i < 4; i++) {
      const r = 3.4 - i * 0.55;
      const y = 1.7 + i * 0.9;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.2, r * 2], tint: 0xe9e2d0 });
      b.add({ piece: 'mossBox', p: [0, y + 0.2, 0], s: [r * 1.35, 0.06, r * 1.35], r: i * 0.4 });
      grassTufts(b, 0, y + 0.26, 0, r * 1.3, r * 1.3, 24, 0.05);
      flowers(b, 0, y + 0.26, 0, r * 0.6, 16, 0.1, 0.7);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + i * 0.5;
        if (k % 2 === 0)
          tree(b, Math.cos(a) * (r - 0.4), y + 0.2, Math.sin(a) * (r - 0.4), 0.4, 0.15 + i * 0.08);
        ivyEdge(b, Math.sin(a) * r, y, Math.cos(a) * r, 0.9, Math.sin(a), Math.cos(a), 2);
      }
    }
    // The glass torus shell (a flattened dome) with a lit oculus ring.
    b.add({ piece: 'dome', p: [0, 1.55, 0], s: [9.4, 9.0, 9.4] });
    const oy = 1.55 + 4.3;
    b.add({ piece: 'haloRing', p: [0, oy, 0], s: [2.0, 6, 2.0], glow: 1 });
    b.add({ piece: 'haloRing', p: [0, 1.6, 0], s: [9.4, 5, 9.4], glow: 0.7 });
    // The vortex: a ring of falling sheets from the oculus into a glowing basin.
    b.add({ piece: 'pool', p: [0, 1.7, 0], s: [1.6, 0.06, 1.6] });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      b.add({
        piece: 'waterfall',
        p: [Math.sin(a) * 0.55, 1.72, Math.cos(a) * 0.55],
        s: [0.38, oy - 1.72, 1],
        r: a,
        glow: 1,
      });
    }
    // Rain collectors on the roof: solar petals angled like a funnel.
    for (let k = 0; k < 12; k++)
      b.add({
        piece: 'solarLeaf',
        p: [0, oy - 0.1, 0],
        s: [2.2, 1, 1.0],
        r: (k / 12) * TAU + 0.13,
        rz: 0.22,
        growAt: 0.2,
      });
  },
});
