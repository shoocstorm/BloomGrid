import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

export default defineBuilding({
  id: 'supertree-grove',
  name: 'Supertree Grove',
  description:
    'The island’s landmark: a grove of vertical-garden supertrees towering far above every tower, with solar canopies and a skywalk. Collects rain, powers itself, and is everyone’s favourite evening walk.',
  category: 'nature',
  footprint: [10, 10],
  stats: { cost: 2400, energy: 30, eco: 30, happiness: 24, population: 0, jobs: 12, pollution: -4, water: -4 },
  growthTime: 120,
  pollinators: 2,
  cleanEnergy: true,
  variants: 1,
  recipe: {
    glb: '/assets/supertree-grove.glb',
    // Procedural supertrees at the GLB's scale (~15 units, about 2.5× the tallest towers):
    // planted trunks with ivy, flared solar-lattice crowns, a skywalk between them, a garden floor.
    // Authored for an 8-tile plot and scaled by K (re-run optimize-glb with matching sizes).
    fallback(b) {
      const K = 1.25;
      const add = b.add.bind(b);
      b = { ...b, add: (sp) => add({ ...sp, p: sp.p && [sp.p[0] * K, sp.p[1] * K, sp.p[2] * K], s: typeof sp.s === 'number' ? sp.s * K : sp.s && [sp.s[0] * K, sp.s[1] * K, sp.s[2] * K] }) };
      b.add({ piece: 'mossBox', p: [0, 0, 0], s: [7.9, 0.1, 7.9] });
      grassTufts(b, 0, 0.1, 0, 7.4, 7.4, 90);
      flowers(b, 0, 0.1, 0, 3.6, 140, 0, 0.6);
      for (let i = 0; i < 6; i++) tree(b, b.range(-3.2, 3.2), 0.1, b.range(-3.2, 3.2), b.range(0.6, 0.9), 0.1);
      const trees: [number, number, number][] = [
        [-1.8, -1.4, 10.5],
        [1.9, -0.8, 12],
        [0.2, 2.0, 9],
      ];
      for (const [x, z, h] of trees) {
        b.add({ piece: 'concreteCyl', p: [x, 0.1, z], s: [0.8, h, 0.8], tint: 0x9aa59a });
        b.add({ piece: 'mossBox', p: [x, 0.5, z], s: [0.92, h * 0.72, 0.92], growAt: 0.1 });
        for (let i = 0; i < 6; i++) ivyEdge(b, x, 0.8 + (i + 1) * h * 0.12, z, 0.6, Math.cos(i * 1.1), Math.sin(i * 1.1), 2);
        // Flared crown: two rings of solar petals tilted outward around a lit core.
        b.add({ piece: 'concreteCyl', p: [x, h, z], s: [1.1, 0.25, 1.1], tint: 0xe9f4ef, glow: 0.6 });
        for (let ring = 0; ring < 2; ring++)
          for (let i = 0; i < 12; i++)
            b.add({ piece: 'solarLeaf', p: [x, h + 0.1 + ring * 0.25, z], s: [2.4 - ring * 0.6, 1, 1.8 - ring * 0.5], r: (i / 12) * Math.PI * 2 + ring * 0.26, rz: -0.35 - ring * 0.2, growAt: 0.2 + ring * 0.2 });
      }
      // Skywalk linking the trunks at mid height.
      b.add({ piece: 'slab', p: [0, 6.2, -1.1], s: [4.0, 0.1, 0.35], r: 0.15, tint: PALETTE.concrete });
      b.add({ piece: 'slab', p: [-0.8, 5.6, 0.3], s: [3.8, 0.1, 0.35], r: -1.0, tint: PALETTE.concrete });
    },
  },
});
