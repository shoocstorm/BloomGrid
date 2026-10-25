import { defineBuilding } from '../types';
import { FLOOR, PALETTE, flowers, ivyEdge, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'canopy-tower',
  name: 'Canopy Tower',
  description: 'A high-density tower with forested sky-gardens every few floors and breathing moss facades.',
  category: 'residential',
  footprint: [3, 3],
  stats: { cost: 480, energy: -14, eco: 6, happiness: 6, population: 110, jobs: 6, pollution: 1, water: -14 },
  tower: true,
  growthTime: 180,
  recipe(b) {
    const segments = 3 + Math.floor(b.rand() * 2);
    let y = 0;
    for (let s = 0; s < segments; s++) {
      const floors = 4;
      const size = 2.1 - s * 0.18;
      const hh = floors * FLOOR;
      b.add({ piece: 'glassBox', p: [0, y, 0], s: [size, hh, size], tint: PALETTE.glass });
      // Membrane wings on two faces
      b.add({ piece: 'mossBox', p: [size / 2 - 0.04, y, 0], s: [0.1, hh, size * 0.7] });
      b.add({ piece: 'mossBox', p: [0, y, -size / 2 + 0.04], s: [size * 0.6, hh, 0.1] });
      y += hh;
      // Sky garden plate
      b.add({ piece: 'slab', p: [0, y, 0], s: [size + 0.3, 0.08, size + 0.3], tint: PALETTE.concrete });
      y += 0.08;
      tree(b, size * 0.32, y, size * 0.32, 0.45, 0.15 + s * 0.12);
      tree(b, -size * 0.32, y, -size * 0.3, 0.4, 0.2 + s * 0.12);
      flowers(b, -size * 0.3, y, size * 0.3, 0.25, 6, 0.1, 0.7);
      ivyEdge(b, 0, y, (size + 0.3) / 2, size, 0, 1, 4);
      ivyEdge(b, -(size + 0.3) / 2, y, 0, size, -1, 0, 4);
      // Recessed garden level
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [size * 0.5, 0.45, size * 0.5], tint: PALETTE.concrete });
      y += 0.45;
    }
    roofMeadow(b, y, 1.4, 1.4, 2);
  },
});
