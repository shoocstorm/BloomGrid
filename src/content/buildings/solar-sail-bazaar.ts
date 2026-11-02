import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, beam, bench, flowers, grassTufts, lamp, tree } from '../kit';

/** Masts: x, z, height, yaw of the main sail. */
const TAU = Math.PI * 2;
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
  style: 'whitewash',
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
    // Street level (D-097): a fountain in the middle of the market, benches round it, a lit gateway with string
    // lights over the front planter, and lamps round the edge.
    b.add({ piece: 'concreteCyl', p: [0, 0.15, 0], s: [1.6, 0.25, 1.6], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.36, 0], s: [1.05, 0.05, 1.05] });
    b.add({ piece: 'concreteCyl', p: [0, 0.4, 0], s: [0.25, 0.4, 0.25], tint: PALETTE.concrete });
    b.add({ piece: 'lumenRib', p: [0, 0.8, 0], s: [0.07, 0.35, 0.07], tint: 0x9ee6ff, glow: 0.8 });
    bench(b, 0, 0.15, -1.15);
    bench(b, 0, 0.15, 1.15, 0.42, false, true);
    for (const sx of [-1, 1]) {
      b.add({ piece: 'timberBox', p: [sx * 1.3, 0.15, 4.75], s: [0.12, 1.75, 0.12], tint: PALETTE.bark });
      for (let k = 0; k < 4; k++)
        b.add({
          piece: 'lumenRib',
          p: [sx * (0.25 + k * 0.32), 1.5 - Math.sin((k / 4) * Math.PI) * 0.05, 4.75],
          s: [0.06, 0.06, 0.06],
          tint: b.pick([0xffe08a, 0xffb7d5, 0x9ee6ff]),
          glow: 1,
        });
    }
    b.add({ piece: 'slab', p: [0, 1.75, 4.75], s: [2.9, 0.3, 0.1], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [0, 1.8, 4.81], s: [2.5, 0.18, 0.01], tint: 0xffe08a, glow: 0.9 });
    for (const [x, z] of [
      [-4.75, -2.4],
      [-4.75, 2.4],
      [4.6, -2.4],
      [4.6, 2.4],
      [-2.6, 4.75],
      [2.6, 4.75],
    ] as const)
      lamp(b, x, 0.15, z, 0.6);

    // Levels (D-100). Level 2: festoon lights strung between the mast tops, a covered food hall with long
    // tables along the back, and two more kiosk awnings at the gate.
    b.level(2, () => {
      for (let i = 0; i < 4; i++) {
        const [x, z, h] = MASTS[i]!;
        const [cx, cz, ch] = MASTS[4];
        beam(b, 'lumenRib', [x, h - 1.4, z], [cx, ch - 1.6, cz], 0.035, { tint: 0xffd9a0, glow: 1 });
      }
      b.add({ piece: 'timberBox', p: [0, 0.15, -4.35], s: [5.2, 0.9, 0.9], tint: 0xc8a57c });
      b.add({ piece: 'glassBox', p: [0, 0.3, -3.88], s: [4.8, 0.5, 0.04], tint: PALETTE.glassWarm, glow: 0.6 });
      awning(b, 0, 1.15, -3.7, 5.4, 0.5, 0xf5efe4, TRIM.orange, 10);
      for (const x of [-1.6, 0, 1.6]) b.add({ piece: 'timberBox', p: [x, 0.15, -3.2], s: [1.1, 0.24, 0.4], tint: PALETTE.timber });
      for (const sx of [-1, 1]) awning(b, sx * 2.6, 0.95, 4.2, 1.0, 0.35, 0xf5efe4, sx < 0 ? TRIM.teal : TRIM.terracotta, 4);
    });
    // Level 3: a sixth, highest sail over the fountain plaza on a twin mast, with a lit crown and a ring of
    // hanging lanterns; the fountain becomes a three-tier cascade.
    b.level(3, () => {
      for (const sx of [-1, 1]) b.add({ piece: 'concreteCyl', p: [sx * 0.9, 0.15, 1.6], s: [0.2, 12.4, 0.2], tint: 0xe9f4ef });
      b.add({ piece: 'solarLeaf', p: [0, 12.5, 1.6], s: [7.6, 1, 9.4], r: 3.1, rz: -0.36, tint: 0xffe0f0 });
      b.add({ piece: 'lumenRib', p: [0, 12.5, 1.6], s: [1.9, 0.1, 0.1], glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 12.6, 1.6], s: [2.4, 3, 2.4], tint: 0xffe08a, glow: 1 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        b.add({ piece: 'lumenRib', p: [Math.cos(a) * 1.4, 2.2, Math.sin(a) * 1.4], s: [0.14, 0.2, 0.14], tint: [0xffe08a, 0xffb7d5, 0x9ee6ff][k % 3], glow: 1 });
      }
      b.add({ piece: 'concreteCyl', p: [0, 0.8, 0], s: [0.7, 0.08, 0.7], tint: PALETTE.concrete });
      b.add({ piece: 'concreteCyl', p: [0, 1.15, 0], s: [0.35, 0.06, 0.35], tint: PALETTE.concrete });
      b.add({ piece: 'waterfall', p: [0, 0.4, 0.36], s: [0.3, 0.75, 1], glow: 0.7 });
    });
  },
});
