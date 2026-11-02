import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, bench, flowers, grassTufts, railRing } from '../kit';

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
  style: 'verdigris',
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
    // The solar collar; a level lifts it onto a cloud deck (D-100).
    const collar = (y: number) => {
      for (let k = 0; k < 12; k++)
        b.add({
          piece: 'solarLeaf',
          p: [0, y, 0],
        s: [1.8, 1, 1.0],
        r: (k / 12) * TAU,
          rz: 0.3,
          growAt: 0.2,
        });
    };
    b.upTo(1, () => collar(H + 0.8));
    // Visitors (D-097): a rail round the cistern's lip, benches under the lattice and bollards on the rim.
    railRing(b, 0, 0.9, 0, 1.25, 16);
    bench(b, 0, 0.36, 1.9, 0.5);
    bench(b, 0, 0.36, -1.9, 0.5, false, true);
    bench(b, 1.9, 0.36, 0, 0.5, true);
    bench(b, -1.9, 0.36, 0, 0.5, true, true);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 3.6, 0.3, Math.sin(a) * 3.6],
        s: [0.08, 0.2, 0.08],
        tint: 0xffd9a0,
        glow: 0.9,
      });
    }

    // Levels (D-100). Level 2: a glass cloud deck rides on the crown tank (a lookout ring where visitors walk in the
    // fog the harp combs), with the solar collar round its rim, and mist nets strung between the lower struts.
    const deck = () => {
      b.add({ piece: 'glassCyl', p: [0, H + 0.8, 0], s: [2.8, 0.7, 2.8], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'concreteCyl', p: [0, H + 1.5, 0], s: [3.4, 0.1, 3.4], tint: PALETTE.concrete });
      railRing(b, 0, H + 1.6, 0, 1.65, 18);
    };
    b.level(2, () => {
      deck();
      b.upTo(2, () => collar(H + 1.6));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.3;
        b.add({ piece: 'slab', p: [Math.cos(a) * 2.9, 1.3, Math.sin(a) * 2.9], s: [1.2, 2.2, 0.01], r: -a + Math.PI / 2, tint: 0xe9f4ef, glow: 0.2 });
      }
    });
    // Level 3: a second, smaller lattice rises from the cloud deck (a crown harp), with its own lit rings and a
    // beacon of solar petals at the top.
    b.level(3, () => {
      deck();
      const [y0, h, r0, r1] = [H + 1.6, 5.0, 1.5, 0.8];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        for (const hand of [1, -1])
          beam(b, 'concreteCyl', [Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(a + hand * TWIST) * r1, y0 + h, Math.sin(a + hand * TWIST) * r1], 0.07, { tint: 0xe9f4ef });
      }
      for (const t of [0.5, 1]) b.add({ piece: 'haloRing', p: [0, y0 + t * h, 0], s: [1.6 + (1 - t) * 0.8, 3, 1.6 + (1 - t) * 0.8], glow: 0.8 });
      collar(y0 + h);
      b.add({ piece: 'lumenRib', p: [0, y0 + h, 0], s: [0.08, 1.2, 0.08], glow: 1 });
    });
  },
});
