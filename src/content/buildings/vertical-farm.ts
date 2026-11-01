import { defineBuilding } from '../types';
import { FLOOR, PALETTE, TRIM, crate, gableRoof, lamp, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'vertical-farm',
  name: 'Orchard Stack',
  description: 'Stacked hydroponic floors crowned by a rooftop fruit orchard.',
  category: 'food',
  footprint: [2, 2],
  stats: { cost: 180, energy: -8, eco: 4, happiness: 2, population: 0, jobs: 12, pollution: 0, water: -8, food: 400 },
  tower: true,
  growthTime: 100,
  recipe(b) {
    const floors = 4 + Math.floor(b.rand() * 3);
    let y = 0;
    for (let i = 0; i < floors; i++) {
      b.add({ piece: 'slab', p: [0, y, 0], s: [1.7, 0.05, 1.7], tint: PALETTE.concrete });
      b.add({ piece: 'glassBox', p: [0, y + 0.05, 0], s: [1.6, FLOOR - 0.05, 1.6], tint: 0xc9f2d0, glow: 0.3 });
      // Hydroponic rows visible through glass
      for (let r = -2; r <= 2; r++) {
        b.add({ piece: 'mossBox', p: [r * 0.28, y + 0.05, 0], s: [0.12, 0.12, 1.4], growAt: 0.05 + i * 0.08 });
      }
      y += FLOOR;
    }
    roofMeadow(b, y, 1.7, 1.7, 0);
    for (let i = 0; i < 4; i++) {
      tree(b, (i % 2 ? 0.4 : -0.4), y + 0.05, (i < 2 ? 0.4 : -0.4), 0.35, 0.3 + i * 0.1);
    }
    // Detail (D-096): corner posts, magenta grow-light bands that glow at night, a loading bay with crates, a
    // glass rooftop greenhouse and a rain tank.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * 0.8, 0, sz * 0.8], s: [0.07, y, 0.07], tint: PALETTE.timber });
    for (let i = 0; i < floors; i++) b.add({ piece: 'lumenRib', p: [0, i * FLOOR + FLOOR - 0.03, 0.805], s: [1.5, 0.02, 0.01], tint: 0xff7ad8, glow: 0.8 });
    b.add({ piece: 'slab', p: [0.5, 0, 1.0], s: [0.7, 0.04, 0.35], tint: 0xd8d0c0 });
    b.add({ piece: 'slab', p: [0.5, 0.36, 0.9], s: [0.7, 0.03, 0.25], tint: TRIM.teal });
    crate(b, 0.3, 0.04, 1.05, 0.15, 0.2, 0xc94f3a);
    crate(b, 0.5, 0.04, 1.07, 0.15, -0.1, 0xf0a23c);
    crate(b, 0.42, 0.16, 1.05, 0.13, 0.4, 0x7fb04f);
    b.add({ piece: 'glassBox', p: [-0.35, y + 0.05, -0.35], s: [0.7, 0.28, 0.6], tint: 0xe8fff0 });
    gableRoof(b, -0.35, y + 0.33, -0.35, 0.7, 0.6, { pitch: 0.5, tint: 0xd6f2ee, thick: 0.02 });
    b.add({ piece: 'concreteCyl', p: [0.5, y + 0.05, -0.5], s: [0.3, 0.32, 0.3], tint: 0x6fa8c8 });
    lamp(b, -0.75, 0, 1.0);
  },
});
