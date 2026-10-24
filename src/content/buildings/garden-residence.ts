import { defineBuilding } from '../types';
import { FLOOR, PALETTE, flowers, ivyEdge, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'garden-residence',
  name: 'Garden Residence',
  description: 'Terraced homes where every balcony is a garden and ivy cascades down solar-glass walls.',
  category: 'residential',
  footprint: [2, 2],
  stats: { cost: 120, energy: -4, eco: 3, happiness: 4, population: 24, jobs: 0, pollution: 0 },
  growthTime: 90,
  recipe(b) {
    const floors = 3 + Math.floor(b.rand() * 4);
    let y = 0;
    for (let i = 0; i < floors; i++) {
      const s = 1.5 - i * 0.07;
      const ox = (i % 2 ? 0.08 : -0.08) * b.rand();
      b.add({ piece: 'glassBox', p: [ox, y, 0], s: [s * 0.82, FLOOR, s * 0.82], tint: PALETTE.glass });
      b.add({ piece: 'slab', p: [ox, y + FLOOR, 0], s: [s, 0.05, s], tint: PALETTE.concrete });
      // Terrace edge planting
      const e = s / 2 - 0.08;
      flowers(b, ox + e, y + FLOOR + 0.05, 0, 0.12, 3, 0.1, 0.6);
      flowers(b, ox - e, y + FLOOR + 0.05, 0, 0.12, 3, 0.1, 0.6);
      b.add({ piece: 'bush', p: [ox, y + FLOOR + 0.05, e], s: 0.18, tint: b.pick(PALETTE.leaves), growAt: 0.1 + i * 0.05 });
      if (i > 0) ivyEdge(b, ox, y + FLOOR, s / 2, s * 0.8, 0, 1, 3);
      y += FLOOR + 0.05;
    }
    roofMeadow(b, y, 1.2, 1.2, 1);
    tree(b, 0.75, 0, 0.75, 0.45, 0.4);
  },
});
