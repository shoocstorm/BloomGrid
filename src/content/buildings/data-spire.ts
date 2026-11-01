import { defineBuilding } from '../types';
import { PALETTE, TRIM, door, grassTufts, roofMeadow } from '../kit';

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
    // Detail (D-096): a podium of server racks with blinking status strips, cooling pipes running up the core,
    // a glazed entrance with a canopy, and a fence of light posts round the lot.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const [x, z] = [Math.cos(a) * 0.68, Math.sin(a) * 0.68];
      b.add({ piece: 'slab', p: [x, 0.12, z], s: [0.36, 0.42, 0.36], r: -a, tint: 0x3b4248 });
      for (let r = 0; r < 3; r++) b.add({ piece: 'lumenRib', p: [x, 0.2 + r * 0.11, z], s: [0.37, 0.012, 0.37], r: -a, tint: r % 2 ? 0x7ff7e6 : 0x9fd0ff, glow: 0.7 });
    }
    for (const a of [0.4, 2.5, 4.4]) b.add({ piece: 'concreteCyl', p: [Math.cos(a) * 0.53, 0.12, Math.sin(a) * 0.53], s: [0.06, 3.6, 0.06], tint: TRIM.steel });
    door(b, 0, 0.12, 0.5, 0.26, 0.3);
    b.add({ piece: 'slab', p: [0, 0.48, 0.62], s: [0.6, 0.03, 0.3], tint: PALETTE.concrete });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.add({ piece: 'timberBox', p: [Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9], s: [0.03, 0.28, 0.03], tint: TRIM.charcoal });
      b.add({ piece: 'lumenRib', p: [Math.cos(a) * 0.9, 0.4, Math.sin(a) * 0.9], s: [0.04, 0.03, 0.04], tint: 0x7ff7e6, glow: 0.8 });
    }
  },
});
