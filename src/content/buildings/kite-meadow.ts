import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

/** Kites: winch x, z; kite x, height, z; heading. */
const KITES = [
  [-3.2, -3.0, -4.2, 17, -6.0, 0.4],
  [0.0, -3.4, 0.8, 20, -7.4, 1.4],
  [3.2, -2.6, 4.6, 16, -5.2, 2.2],
  [-2.4, 2.4, -3.0, 13, -2.0, 0.9],
  [2.6, 2.8, 3.4, 14.5, -1.4, 1.9],
] as const;

export default defineBuilding({
  id: 'kite-meadow',
  name: 'Solar Kite Meadow',
  description:
    'Five great solar kites ride the steady upper winds on glowing tethers, reeling power down to winches hidden in a wildflower meadow. On calm days they rest folded on the grass.',
  category: 'energy',
  footprint: [10, 10],
  stats: { cost: 2700, energy: 110, eco: 10, happiness: 12, population: 0, jobs: 12, pollution: 0 },
  growthTime: 140,
  cleanEnergy: true,
  pollinators: 2,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.12, 9.8] });
    grassTufts(b, 0, 0.12, 0, 9.4, 9.4, 140);
    flowers(b, 0, 0.12, 0, 4.6, 110, 0, 0.6);
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0.6], s: [2.0, 1.2, 2.0], tint: PALETTE.glassWarm, glow: 0.5 });
    for (const [wx, wz, kx, ky, kz, yaw] of KITES) {
      b.add({ piece: 'concreteCyl', p: [wx, 0.12, wz], s: [0.7, 0.5, 0.7], tint: 0xe9f4ef });
      beam(b, 'lumenRib', [wx, 0.6, wz], [kx, ky, kz], 0.05, { glow: 0.8 });
      // The kite: two iridescent petals forming a wing, tilted into the wind.
      b.add({ piece: 'solarLeaf', p: [kx, ky, kz], s: [3.0, 1, 2.6], r: yaw, rz: 0.55, growAt: 0.1 });
      b.add({
        piece: 'solarLeaf',
        p: [kx, ky, kz],
        s: [3.0, 1, 2.6],
        r: yaw + Math.PI,
        rz: -0.55,
        growAt: 0.1,
      });
      b.add({ piece: 'lumenRib', p: [kx, ky - 0.6, kz], s: [0.08, 1.2, 0.08], glow: 1 });
    }
  },
});
