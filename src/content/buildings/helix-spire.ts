import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const STEPS = 54;
const STEP = 0.46;

export default defineBuilding({
  id: 'helix-spire',
  name: 'Helix Wind Spire',
  description:
    'A double-helix wind tower on the hill crest: its twisting vanes turn the sea breeze into power, and a ring of light climbs the strands every night.',
  category: 'energy',
  footprint: [8, 8],
  stats: { cost: 3600, energy: 160, eco: 4, happiness: 8, population: 0, jobs: 20, pollution: 0 },
  growthTime: 160,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [7.4, 0.35, 7.4], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.35, 0], s: [5.0, 0.08, 5.0], r: Math.PI / 4 });
    grassTufts(b, 0, 0.43, 0, 4.6, 4.6, 50);
    flowers(b, 0, 0.43, 0, 2.6, 40, 0, 0.6);
    for (let k = 0; k < 4; k++)
      tree(b, Math.cos(k * 1.57 + 0.78) * 3.0, 0.35, Math.sin(k * 1.57 + 0.78) * 3.0, 0.7, 0.1);

    // Mast and the twisting double helix of vanes, each strand tipped with a light bead.
    const top = 0.8 + STEPS * STEP;
    b.add({ piece: 'concreteCyl', p: [0, 0.35, 0], s: [1.1, top, 1.1], tint: PALETTE.concrete });
    b.add({ piece: 'glassCyl', p: [0, 0.35, 0], s: [2.2, 1.6, 2.2], tint: PALETTE.glassWarm, glow: 0.3 });
    for (let i = 0; i < STEPS; i++) {
      const y = 0.8 + i * STEP;
      const t = i / STEPS;
      const a = i * 0.32;
      const span = 3.6 - t * 1.6 + Math.sin(t * Math.PI) * 0.6;
      for (const side of [0, Math.PI]) {
        const ang = a + side;
        b.add({ piece: 'solarLeaf', p: [0, y, 0], s: [span * 0.5, 1, 1.5], r: ang, rz: 0.06 });
        b.add({
          piece: 'lumenRib',
          p: [Math.cos(ang) * span * 0.5, y - 0.12, -Math.sin(ang) * span * 0.5],
          s: [0.13, 0.3, 0.13],
          glow: 0.9,
        });
      }
    }
    // Sky-garden ring at mid height.
    const gy = 0.8 + 22 * STEP;
    b.add({ piece: 'concreteCyl', p: [0, gy, 0], s: [4.4, 0.25, 4.4], tint: PALETTE.concrete });
    b.add({ piece: 'haloRing', p: [0, gy, 0], s: [4.5, 6, 4.5], glow: 0.8 });
    for (let k = 0; k < 5; k++)
      tree(b, Math.cos((k / 5) * TAU) * 1.5, gy + 0.25, Math.sin((k / 5) * TAU) * 1.5, 0.4, 0.2);

    // Turbine crown: a vertical-axis rotor of solar vanes under a light ring.
    for (let k = 0; k < 6; k++)
      b.add({
        piece: 'solarLeaf',
        p: [0, top - 0.6, 0],
        s: [1.8, 1, 0.9],
        r: (k / 6) * TAU,
        rz: 0.9,
        growAt: 0.2,
      });
    b.add({ piece: 'haloRing', p: [0, top + 0.3, 0], s: [2.6, 4, 2.6], glow: 1 });
    b.add({ piece: 'spireCone', p: [0, top, 0], s: [0.8, 3.2, 0.8], tint: PALETTE.glassWarm, glow: 0.4 });
  },
});
