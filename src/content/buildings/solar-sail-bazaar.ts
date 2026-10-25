import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts, tree } from '../kit';

/** Masts: x, z, height, yaw of the main sail. */
const MASTS = [
  [-2.8, -2.6, 8.5, 0.6],
  [2.6, -2.2, 9.5, 2.3],
  [-2.2, 2.6, 7.5, 4.1],
  [2.8, 2.8, 8.0, 5.4],
  [0, 0, 10.5, 1.4],
] as const;

export default defineBuilding({
  id: 'solar-sail-bazaar',
  name: 'Solar Sail Bazaar',
  description:
    'A night-and-day market under five vast iridescent solar sails. The sails shade the stalls by day, power them by night, and glow along their seams like moth wings.',
  category: 'commercial',
  footprint: [10, 10],
  stats: { cost: 3600, energy: 20, eco: 6, happiness: 20, population: 0, jobs: 220, pollution: 1, water: -8 },
  growthTime: 150,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.15, 9.8], tint: PALETTE.concrete });
    for (const [x, z] of [
      [-4.1, 0],
      [4.1, 0],
      [0, -4.1],
      [0, 4.1],
    ] as const) {
      b.add({ piece: 'mossBox', p: [x, 0.15, z], s: [1.2, 0.3, 1.2] });
      grassTufts(b, x, 0.45, z, 1.1, 1.1, 8);
      tree(b, x, 0.45, z, 0.6, 0.1);
    }
    // Stalls: timber booths with flower-box roofs and lit glass kiosks.
    for (let i = 0; i < 18; i++) {
      const x = b.range(-3.8, 3.8);
      const z = b.range(-3.8, 3.8);
      if (Math.hypot(x, z) < 1.2) continue;
      const r = Math.round(b.rand() * 4) * (Math.PI / 2);
      if (i % 3 === 0)
        b.add({
          piece: 'glassBox',
          p: [x, 0.15, z],
          s: [0.8, 0.7, 0.8],
          r,
          tint: PALETTE.glassWarm,
          glow: 0.6,
        });
      else {
        b.add({ piece: 'timberBox', p: [x, 0.15, z], s: [0.9, 0.6, 0.7], r, tint: 0xc8a57c });
        flowers(b, x, 0.75, z, 0.3, 4, 0.1, 0.6);
      }
    }
    // Masts and sails, with glowing guy lines.
    for (const [x, z, h, yaw] of MASTS) {
      b.add({ piece: 'concreteCyl', p: [x, 0.15, z], s: [0.26, h, 0.26], tint: 0xe9f4ef });
      b.add({ piece: 'lumenRib', p: [x, h + 0.1, z], s: [0.16, 0.5, 0.16], glow: 1 });
      b.add({ piece: 'solarLeaf', p: [x, h, z], s: [6.2, 1, 8.5], r: yaw, rz: -0.42, growAt: 0.1 });
      b.add({
        piece: 'solarLeaf',
        p: [x, h - 0.3, z],
        s: [4.4, 1, 6.5],
        r: yaw + Math.PI * 0.9,
        rz: -0.5,
        growAt: 0.2,
      });
      const gx = x + Math.cos(yaw + Math.PI) * 3.2;
      const gz = z - Math.sin(yaw + Math.PI) * 3.2;
      beam(
        b,
        'lumenRib',
        [Math.max(-4.7, Math.min(4.7, gx)), 0.15, Math.max(-4.7, Math.min(4.7, gz))],
        [x, h, z],
        0.04,
        { glow: 0.7 },
      );
    }
  },
});
