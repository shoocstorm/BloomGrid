import { defineBuilding } from '../types';
import { PALETTE, beam, bench, entrance, flowers, grassTufts, lamp } from '../kit';

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
    // Visitors (D-097): a lit pavilion door, a path in from the street, picnic blankets on the lawn, benches and
    // lamps.
    entrance(b, 0, 0.12, 1.6, 0.6, 0.42);
    b.add({ piece: 'slab', p: [0, 0.12, 3.3], s: [0.8, 0.02, 3.2], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) lamp(b, sx * 0.6, 0.12, 4.4, 0.6);
    for (const [x, z, r, c] of [
      [-2.0, 2.6, 0.3, 0xff9aa2],
      [1.8, 3.2, -0.4, 0x9ee6ff],
      [-1.6, -2.4, 0.8, 0xffe08a],
    ] as const) {
      b.add({ piece: 'slab', p: [x, 0.12, z], s: [0.7, 0.015, 0.55], r, tint: c });
      b.add({ piece: 'slab', p: [x, 0.13, z], s: [0.35, 0.012, 0.55], r, tint: 0xfff4f0 });
    }
    bench(b, 1.2, 0.12, 1.9);
    bench(b, -1.2, 0.12, 1.9);

    // Levels (D-100). A kite on its winch: tether from (wx, wz) up to the wing at (kx, ky, kz).
    const kite = (wx: number, wz: number, kx: number, ky: number, kz: number, yaw: number, s: number, tint: number) => {
      b.add({ piece: 'concreteCyl', p: [wx, 0.12, wz], s: [0.7, 0.5, 0.7], tint: 0xe9f4ef });
      beam(b, 'lumenRib', [wx, 0.6, wz], [kx, ky, kz], 0.05, { glow: 0.8 });
      for (const [r, rz] of [
        [yaw, 0.55],
        [yaw + Math.PI, -0.55],
      ] as const)
        b.add({ piece: 'solarLeaf', p: [kx, ky, kz], s: [3.0 * s, 1, 2.6 * s], r, rz, tint });
      b.add({ piece: 'lumenRib', p: [kx, ky - 0.6, kz], s: [0.08, 1.2 * s, 0.08], glow: 1 });
    };
    // Level 2: a sixth kite in rose and a winch house with a reel on the lawn.
    const sixth = () => {
      kite(-3.6, 0.4, -5.6, 15.5, -3.2, 0.2, 1, 0xffe0f0);
      b.add({ piece: 'timberBox', p: [3.6, 0.12, 0.2], s: [0.9, 0.55, 0.6], tint: 0xb48a62 });
      b.add({ piece: 'concreteCyl', p: [3.6, 0.67, 0.2], s: [0.4, 0.3, 0.4], rx: Math.PI / 2, tint: 0xe9f4ef });
    };
    b.level(2, sixth);
    // Level 3: a great lead kite twice the others' size flying highest, with a lit tail of ribbons.
    b.level(3, () => {
      sixth();
      kite(0, 0.2, 0.4, 25, -9.0, 1.0, 1.7, 0xfff4c8);
      for (let k = 1; k <= 5; k++) b.add({ piece: 'slab', p: [0.4, 25 - k * 0.8, -9.0 + k * 0.3], s: [0.06, 0.4, 0.3], rx: 0.3, tint: [0xff9aa2, 0xffe08a, 0x9ee6ff][k % 3]!, glow: 0.6 });
    });
  },
});
