import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

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
    for (const [x, z, h, yaw] of MASTS) {
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
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 4.5, 0.26, Math.sin(a) * 4.5],
        s: [0.1, 0.5, 0.1],
        glow: 0.8,
      });
    }
  },
});
