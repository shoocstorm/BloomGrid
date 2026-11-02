import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, bench, crate, entrance, flowers, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;
/** Mooring masts: x, z, height, heading of the moored airship. */
const MASTS = [
  [-2.6, -2.4, 9.5, 0.4],
  [2.8, -1.4, 11, 2.2],
  [-1.2, 3.0, 8, 4.4],
] as const;

export default defineBuilding({
  id: 'zephyr-airport',
  name: 'Zephyr Airship Port',
  description:
    'Solar airships moor at three mast towers above a garden terminal, ferrying commuters and day-trippers silently over the city. Takes a wide district’s commuters off the highways.',
  category: 'utility',
  footprint: [10, 10],
  stats: { cost: 3800, energy: -20, eco: 4, happiness: 12, population: 0, jobs: 50, pollution: 0 },
  growthTime: 160,
  requires: 'skylanes',
  transit: { radius: 22, riders: 900 },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 9.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.2, 0], s: [9.4, 0.06, 9.4] });
    grassTufts(b, 0, 0.26, 0, 9, 9, 80);
    flowers(b, 0, 0.26, 0, 4.2, 50, 0, 0.6);
    // Terminal: a glass drum with a planted roof.
    b.add({ piece: 'glassCyl', p: [0.6, 0.26, 0.4], s: [4.0, 2.4, 4.0], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'concreteCyl', p: [0.6, 2.66, 0.4], s: [4.4, 0.2, 4.4], tint: PALETTE.concrete });
    flowers(b, 0.6, 2.86, 0.4, 1.8, 26, 0.1, 0.7);
    const mast = (x: number, z: number, h: number, yaw: number) => {
      b.add({ piece: 'concreteCyl', p: [x, 0.26, z], s: [0.5, h, 0.5], tint: 0xe9f4ef });
      b.add({ piece: 'haloRing', p: [x, h * 0.6, z], s: [1.2, 4, 1.2], glow: 0.7 });
      b.add({ piece: 'lumenRib', p: [x, h + 0.26, z], s: [0.14, 0.8, 0.14], glow: 1 });
      // The airship nose sits at the mast; its body trails downwind.
      const cx = x - Math.cos(yaw) * 2.8;
      const cz = z + Math.sin(yaw) * 2.8;
      const y = h - 1.2;
      b.add({ piece: 'pod', p: [cx, y, cz], s: [6.2, 6.2, 6.2], r: yaw, glow: 0.7 });
      b.add({
        piece: 'glassBox',
        p: [cx, y - 0.45, cz],
        s: [1.8, 0.5, 0.7],
        r: yaw,
        tint: PALETTE.glassWarm,
        glow: 0.7,
      });
      for (const fin of [-1, 1])
        b.add({
          piece: 'solarLeaf',
          p: [cx - Math.cos(yaw) * 2.4, y + 1.3, cz + Math.sin(yaw) * 2.4],
          s: [1.6, 1, 0.9],
          r: yaw + Math.PI + fin * 0.5,
          rz: 0.25,
        });
    };
    for (const [x, z, h, yaw] of MASTS) mast(x, z, h, yaw);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 4.5, 0.26, Math.sin(a) * 4.5],
        s: [0.1, 0.5, 0.1],
        glow: 0.8,
      });
    }
    // Street level (D-097): a lit terminal entrance with a path out, lamps, benches, baggage crates and a windsock.
    entrance(b, 0.6, 0.26, 2.41, 1.0, 0.55);
    b.add({ piece: 'slab', p: [0.6, 0.26, 3.65], s: [1.2, 0.02, 2.4], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) lamp(b, 0.6 + sx * 0.8, 0.26, 3.9, 0.65);
    bench(b, -1.2, 0.26, 3.2);
    for (let i = 0; i < 3; i++)
      crate(b, 2.2 + i * 0.3, 0.26, 2.9, 0.22, i * 0.3, i % 2 ? 0x5f9fb0 : 0xc9a06a);
    b.add({ piece: 'timberBox', p: [-4.2, 0.26, 4.2], s: [0.06, 1.8, 0.06], tint: TRIM.steel });
    b.add({ piece: 'spireCone', p: [-4.2, 1.95, 4.2], s: [0.3, 0.8, 0.3], rz: -1.35, tint: TRIM.orange });

    // Levels (D-100). Level 2: a fourth mooring mast on the east lawn with its own airship, and a covered boarding
    // gangway from the terminal roof.
    b.level(2, () => {
      mast(3.6, 3.6, 10, 5.6);
      beam(b, 'glassBox', [1.9, 2.86, 1.6], [3.4, 9.2, 3.4], 0.4, { tint: PALETTE.glassWarm, glow: 0.4 });
    });
    // Level 3: a control tower rises from the terminal's planted roof (a lit glass cab with a halo and a beacon),
    // and a fifth mast moors a sky-yacht at the north edge.
    b.level(3, () => {
      mast(3.6, 3.6, 10, 5.6);
      beam(b, 'glassBox', [1.9, 2.86, 1.6], [3.4, 9.2, 3.4], 0.4, { tint: PALETTE.glassWarm, glow: 0.4 });
      mast(-4.0, -0.4, 7, 1.6);
      b.add({ piece: 'concreteCyl', p: [0.6, 2.86, 0.4], s: [0.6, 3.6, 0.6], tint: 0xe9f4ef });
      b.add({ piece: 'glassCyl', p: [0.6, 6.46, 0.4], s: [1.5, 0.7, 1.5], tint: PALETTE.glassWarm, glow: 0.7 });
      b.add({ piece: 'concreteCyl', p: [0.6, 7.16, 0.4], s: [1.7, 0.1, 1.7], tint: PALETTE.concrete });
      b.add({ piece: 'haloRing', p: [0.6, 6.8, 0.4], s: [2.0, 3, 2.0], tint: TRIM.orange, glow: 1 });
      b.add({ piece: 'lumenRib', p: [0.6, 7.26, 0.4], s: [0.06, 0.8, 0.06], tint: 0xff6a5a, glow: 1 });
    });
  },
});
