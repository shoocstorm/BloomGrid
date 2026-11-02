import { defineBuilding } from '../types';
import { FLOOR, PALETTE, TRIM, awning, crate, gableRoof, lamp, roofMeadow, tree } from '../kit';

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
    const orchard = (y: number) => {
      roofMeadow(b, y, 1.7, 1.7, 0);
      for (let i = 0; i < 4; i++) {
        tree(b, (i % 2 ? 0.4 : -0.4), y + 0.05, (i < 2 ? 0.4 : -0.4), 0.35, 0.3 + i * 0.1);
      }
    };
    b.upTo(1, () => orchard(y));
    // Detail (D-096): corner posts, magenta grow-light bands that glow at night, a loading bay with crates, a
    // glass rooftop greenhouse and a rain tank.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * 0.8, 0, sz * 0.8], s: [0.07, y, 0.07], tint: PALETTE.timber });
    for (let i = 0; i < floors; i++) b.add({ piece: 'lumenRib', p: [0, i * FLOOR + FLOOR - 0.03, 0.805], s: [1.5, 0.02, 0.01], tint: 0xff7ad8, glow: 0.8 });
    b.add({ piece: 'slab', p: [0.5, 0, 1.0], s: [0.7, 0.04, 0.35], tint: 0xd8d0c0 });
    b.add({ piece: 'slab', p: [0.5, 0.36, 0.9], s: [0.7, 0.03, 0.25], tint: TRIM.teal });
    crate(b, 0.3, 0.04, 1.05, 0.15, 0.2, 0xc94f3a);
    crate(b, 0.5, 0.04, 1.07, 0.15, -0.1, 0xf0a23c);
    crate(b, 0.42, 0.16, 1.05, 0.13, 0.4, 0x7fb04f);
    const roofKit = (y: number) => {
      b.add({ piece: 'glassBox', p: [-0.35, y + 0.05, -0.35], s: [0.7, 0.28, 0.6], tint: 0xe8fff0 });
      gableRoof(b, -0.35, y + 0.33, -0.35, 0.7, 0.6, { pitch: 0.5, tint: 0xd6f2ee, thick: 0.02 });
      b.add({ piece: 'concreteCyl', p: [0.5, y + 0.05, -0.5], s: [0.3, 0.32, 0.3], tint: 0x6fa8c8 });
    };
    b.upTo(1, () => roofKit(y));
    lamp(b, -0.75, 0, 1.0);

    // Levels (D-100): growing floors in the same glass-and-grow-bed rhythm, posts and pink grow lights included.
    const floor = (y0: number) => {
      b.add({ piece: 'slab', p: [0, y0, 0], s: [1.7, 0.05, 1.7], tint: PALETTE.concrete });
      b.add({ piece: 'glassBox', p: [0, y0 + 0.05, 0], s: [1.6, FLOOR - 0.05, 1.6], tint: 0xc9f2d0, glow: 0.3 });
      for (let r = -2; r <= 2; r++) b.add({ piece: 'mossBox', p: [r * 0.28, y0 + 0.05, 0], s: [0.12, 0.12, 1.4] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * 0.8, y0, sz * 0.8], s: [0.07, FLOOR, 0.07], tint: PALETTE.timber });
      b.add({ piece: 'lumenRib', p: [0, y0 + FLOOR - 0.03, 0.805], s: [1.5, 0.02, 0.01], tint: 0xff7ad8, glow: 0.8 });
      return y0 + FLOOR;
    };
    // Level 2: one floor more, the orchard roof back on top, and a farm stand with an awning at the door.
    b.level(2, () => {
      const y2 = floor(y);
      b.upTo(2, () => {
        orchard(y2);
        roofKit(y2);
      });
      awning(b, -0.25, 0.42, 1.0, 0.6, 0.3, 0xf5efe4, TRIM.red, 4);
      b.add({ piece: 'timberBox', p: [-0.25, 0.04, 1.05], s: [0.5, 0.26, 0.24], tint: PALETTE.timber });
      crate(b, -0.38, 0.3, 1.05, 0.12, 0.3, 0xf0a23c);
      crate(b, -0.14, 0.3, 1.05, 0.12, -0.2, 0x7fb04f);
    });
    // Level 3: two floors more, and the roof becomes a wind-and-water deck: a rainwater tower, a tilted solar
    // canopy over the orchard and a lit seed-bank sign.
    b.level(3, () => {
      const y3 = floor(floor(y));
      orchard(y3);
      b.add({ piece: 'concreteCyl', p: [0.5, y3 + 0.05, -0.5], s: [0.36, 0.6, 0.36], tint: 0x6fa8c8 });
      b.add({ piece: 'dome', p: [0.5, y3 + 0.65, -0.5], s: [0.36, 0.2, 0.36], tint: 0x6fa8c8 });
      for (const sx of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * 0.6, y3 + 0.05, 0.4], s: [0.04, 0.55, 0.04], tint: PALETTE.timber });
      b.add({ piece: 'slab', p: [0, y3 + 0.6, 0.3], s: [1.3, 0.025, 0.5], rx: -0.3, tint: TRIM.pv, glow: 0.15 });
      b.add({ piece: 'slab', p: [0, y3 - 0.25, 0.83], s: [0.9, 0.14, 0.02], tint: 0x7fb04f, glow: 0.8 });
    });
  },
});
