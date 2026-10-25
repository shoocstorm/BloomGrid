import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

const TAU = Math.PI * 2;
const H = 16;
const R0 = 3.3;
const R1 = 2.3;
const TWIST = 1.1;
const STRUTS = 20;

export default defineBuilding({
  id: 'fog-harp',
  name: 'Fog Harp Tower',
  description:
    'A twisted lattice tower strung with fine mesh that combs drinking water out of the morning fog. The water falls through its heart into a cistern; the lattice hums faintly in the wind.',
  category: 'utility',
  footprint: [8, 8],
  stats: { cost: 2900, energy: -10, eco: 6, happiness: 10, population: 0, jobs: 16, pollution: 0, water: 50 },
  growthTime: 150,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [7.6, 0.3, 7.6], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [5.2, 0.06, 5.2], r: Math.PI / 4 });
    grassTufts(b, 0, 0.36, 0, 5, 5, 40);
    flowers(b, 0, 0.36, 0, 2.8, 30, 0, 0.6);
    // Cistern at the foot.
    b.add({ piece: 'concreteCyl', p: [0, 0.3, 0], s: [2.6, 0.6, 2.6], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.9, 0], s: [1.7, 0.05, 1.7], r: Math.PI / 4 });
    // Hyperboloid lattice: straight struts in both hands between a wide base ring and a narrower crown ring.
    for (let k = 0; k < STRUTS; k++) {
      const a = (k / STRUTS) * TAU;
      for (const hand of [1, -1]) {
        const p0: Vec3 = [Math.cos(a) * R0, 0.3, Math.sin(a) * R0];
        const p1: Vec3 = [Math.cos(a + hand * TWIST) * R1, H, Math.sin(a + hand * TWIST) * R1];
        beam(b, 'concreteCyl', p0, p1, 0.1, { tint: 0xe9f4ef });
      }
    }
    // Rings where the lattice pinches (radius of a strut at height t), lit at night.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = Math.cos(0) * R0 * (1 - t) + Math.cos(TWIST) * R1 * t;
      const z = Math.sin(TWIST) * R1 * t;
      const r = Math.hypot(x, z);
      b.add({ piece: 'haloRing', p: [0, 0.3 + t * (H - 0.3), 0], s: [r * 2, 4, r * 2], glow: 0.7 });
    }
    // Crown tank, the falling water through the heart and a solar collar.
    b.add({ piece: 'concreteCyl', p: [0, H, 0], s: [2.2, 0.8, 2.2], tint: PALETTE.concrete });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      b.add({
        piece: 'waterfall',
        p: [Math.sin(a) * 0.35, 0.95, Math.cos(a) * 0.35],
        s: [0.4, H - 1, 1],
        r: a,
        glow: 0.8,
      });
    }
    for (let k = 0; k < 12; k++)
      b.add({
        piece: 'solarLeaf',
        p: [0, H + 0.8, 0],
        s: [1.8, 1, 1.0],
        r: (k / 12) * TAU,
        rz: 0.3,
        growAt: 0.2,
      });
  },
});
