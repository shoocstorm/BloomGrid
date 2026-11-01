import { defineBuilding } from '../types';
import { PALETTE, grassTufts, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'data-spire',
  name: 'Data Spire',
  description:
    'A sea-cooled compute tower where Flora, the city assistant, thinks. Needed (with a power plant and a healthy treasury) to wake her; power-hungry, with skilled jobs.',
  category: 'tech',
  footprint: [2, 2],
  stats: { cost: 1000, energy: -30, eco: 0, happiness: 1, population: 0, jobs: 20, pollution: 0, water: -4 },
  growthTime: 120,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.9, 0.12, 1.9], tint: PALETTE.concrete });
    grassTufts(b, 0.6, 0.12, 0.6, 0.6, 0.6, 4);
    // Glass core with stacked light rings, a cooling fin crown and a beacon.
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0], s: [1.0, 4.2, 1.0], tint: PALETTE.glass, glow: 0.6 });
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'haloRing', p: [0, 0.6 + i * 0.8, 0], s: [1.3, 2, 1.3], glow: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add({
        piece: 'slab',
        p: [Math.cos(a) * 0.55, 4.3, Math.sin(a) * 0.55],
        s: [0.08, 0.6, 0.3],
        r: -a,
        tint: 0xe9eee8,
      });
    }
    roofMeadow(b, 4.32, 0.7, 0.7);
    b.add({ piece: 'spireCone', p: [0, 4.6, 0], s: [0.35, 0.9, 0.35], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'lumenRib', p: [0, 5.5, 0], s: [0.14, 0.14, 0.14], glow: 1, tint: 0x7ff7e6 });
  },
});
