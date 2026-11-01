import { defineBuilding } from '../types';
import type { KitBuilder } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

/**
 * Bayfront arts pavilion, fully procedural (D-082): a glass hall under an opening lotus on a round deck in a lily
 * pond. Level 2 adds lily-pad galleries and a lantern arcade over the entry bridge; level 3 crowns the bloom with
 * a lit lantern spire and a golden halo.
 */

const PETAL = [0xfff3f0, 0xffd6e4, 0xff9ec2] as const;

/** A whorl of `n` lotus petals rising from the centre at `y`. */
function whorl(b: KitBuilder, n: number, y: number, len: number, width: number, tilt: number, tint: number, glow: number, turn: number, growAt: number): void {
  for (let i = 0; i < n; i++)
    b.add({ piece: 'sunPetal', p: [0, y, 0], s: [len, 2.4, width], r: (i / n) * Math.PI * 2 + turn, rz: tilt, tint, glow, growAt });
}

export default defineBuilding({
  id: 'lotus-pavilion',
  name: 'Lotus Arts Pavilion',
  description: 'A bayfront arts pavilion shaped like an opening lotus, ringed by a lily pond. Concerts, galleries and night markets draw the whole island.',
  category: 'commercial',
  footprint: [4, 4],
  stats: { cost: 800, energy: -8, eco: 4, happiness: 14, population: 0, jobs: 24, pollution: 0, water: -3 },
  growthTime: 80,
  placement: { nearWater: true },
  floodproof: true,
  variants: 1,
  retrofit: false,
  recipe(b) {
    // Lot, pond and the round stone deck the pavilion stands on.
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [3.95, 0.06, 3.95] });
    grassTufts(b, 0, 0.06, 0, 3.8, 3.8, 20);
    b.add({ piece: 'pool', p: [0, 0.06, 0], s: [3.55, 0.03, 3.55] });
    b.add({ piece: 'concreteCyl', p: [0, 0.06, 0], s: [2.3, 0.14, 2.3], tint: 0xece3d2 });
    // Entry bridge across the pond on +z.
    b.add({ piece: 'timberBox', p: [0, 0.1, 1.45], s: [0.5, 0.06, 1.0], tint: PALETTE.timber });
    // Glass hall ringed by slender columns under a white roof disc.
    b.add({ piece: 'glassCyl', p: [0, 0.2, 0], s: [1.5, 0.75, 1.5], tint: PALETTE.glass });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.add({ piece: 'concreteCyl', p: [Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86], s: [0.07, 0.75, 0.07], tint: 0xf6efe4 });
    }
    b.add({ piece: 'concreteCyl', p: [0, 0.95, 0], s: [1.85, 0.07, 1.85], tint: 0xf6efe4 });
    // The bloom: three whorls opening wider and paler outward, round a golden stamen.
    whorl(b, 10, 0.98, 1.9, 1.9, 0.5, PETAL[0], 0.35, 0, 0.1);
    whorl(b, 8, 1.0, 1.45, 1.6, 0.82, PETAL[1], 0.4, 0.3, 0.25);
    whorl(b, 6, 1.02, 0.95, 1.2, 1.12, PETAL[2], 0.45, 0.1, 0.4);
    b.add({ piece: 'concreteCyl', p: [0, 1.0, 0], s: [0.32, 0.3, 0.32], tint: 0xffe08a, glow: 0.6 });
    flowers(b, 0, 1.3, 0, 0.12, 6, 0.4, 0.7);
    // Deck lanterns.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add({ piece: 'lumenRib', p: [Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0], s: [0.05, 0.45, 0.05], tint: 0xffd59a, glow: 0.8 });
    }
    // Lilies and koi in the pond corners, beyond the deck.
    for (let i = 0; i < 14; i++) {
      const a = b.rand() * Math.PI * 2;
      const r = b.range(1.3, 1.65);
      const [x, z] = [Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15];
      if (Math.abs(x) > 1.65 || Math.abs(z) > 1.65 || (Math.abs(x) < 0.4 && z > 0)) continue;
      b.add({ piece: 'lily', p: [x, 0.1, z], s: b.range(0.16, 0.24), tint: b.pick(PALETTE.blossoms) });
    }
    for (const [x, z] of [[-1.5, -1.5], [1.5, 1.4], [1.45, -1.5]] as const) b.add({ piece: 'koi', p: [x, 0.08, z], s: 0.18, r: b.rand() * 6.28, tint: 0xff8a3d });
  },
  levels(b, tier) {
    if (tier === 1) {
      // Level 2: two lily-pad galleries in the pond corners and a lantern arcade over the bridge.
      for (const [x, z] of [[-1.35, 1.35], [1.35, -1.35]] as const) {
        b.add({ piece: 'concreteCyl', p: [x, 0.06, z], s: [0.95, 0.08, 0.95], tint: 0xd8efc8 });
        b.add({ piece: 'glassCyl', p: [x, 0.14, z], s: [0.5, 0.36, 0.5], tint: PALETTE.glassWarm });
        for (let i = 0; i < 6; i++)
          b.add({ piece: 'sunPetal', p: [x, 0.5, z], s: [0.55, 2, 0.5], r: (i / 6) * Math.PI * 2, rz: 0.55, tint: PETAL[1], glow: 0.4 });
        flowers(b, x, 0.14, z, 0.4, 6, 0, 0.2);
      }
      for (let i = 0; i < 3; i++) {
        const z = 1.15 + i * 0.3;
        b.add({ piece: 'willowArch', p: [0, 0.16, z], s: [0.62, 0.7, 0.62], tint: PALETTE.bark });
        b.add({ piece: 'flower', p: [0, 0.5, z], s: 0.08, tint: 0xffd59a, glow: 0.9 });
      }
      for (const x of [-0.3, 0.3]) beam(b, 'lumenRib', [x, 0.2, 1.0], [x, 0.2, 1.9], 0.025, { tint: 0xfff1c9, glow: 0.6 });
    } else {
      // Level 3: a lantern spire rises from the stamen, with a golden crown and a halo over the bloom.
      b.add({ piece: 'glassCyl', p: [0, 1.25, 0], s: [0.42, 0.6, 0.42], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'spireCone', p: [0, 1.85, 0], s: [0.22, 1.1, 0.22], tint: PALETTE.glassWarm, glow: 0.5 });
      for (let i = 0; i < 8; i++)
        b.add({ piece: 'sunPetal', p: [0, 1.85, 0], s: [0.5, 2, 0.7], r: (i / 8) * Math.PI * 2, rz: 0.5, tint: 0xffe08a, glow: 0.7 });
      b.add({ piece: 'haloRing', p: [0, 2.45, 0], s: [1.2, 2, 1.2], tint: 0xfff1c9, glow: 0.9 });
      b.add({ piece: 'haloRing', p: [0, 2.0, 0], s: [3.3, 2, 3.3], tint: 0xffd6e4, glow: 0.6 });
    }
  },
});
