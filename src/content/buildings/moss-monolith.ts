import { defineBuilding } from '../types';
import { PALETTE, grassTufts, tree } from '../kit';

const H = 16;
const W = 6.2;

export default defineBuilding({
  id: 'moss-monolith',
  name: 'Breathing Monolith',
  description:
    'A sheer block of homes wrapped entirely in living moss, cut by tall glowing window slits and a waterfall down its face. It breathes out cool, clean air over the north terrace. Pods dock on its roof.',
  category: 'residential',
  footprint: [8, 8],
  stats: {
    cost: 3600,
    energy: -18,
    eco: 28,
    happiness: 12,
    population: 300,
    jobs: 6,
    pollution: -6,
    water: -20,
  },
  growthTime: 240,
  transit: { radius: 8, riders: 300 },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.2, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 3.5], s: [7.2, 0.05, 0.6] });
    grassTufts(b, 0, 0.2, -3.5, 7, 0.6, 20);
    b.add({ piece: 'mossBox', p: [0, 0.2, 0], s: [W, H, W] });
    // Window slits: glass strips on every face, with light seams beside them.
    for (const [nx, nz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      for (const o of [-1.9, -0.6, 0.7, 1.95]) {
        const h = H - 2.5 - Math.abs(o) * 1.4;
        const x = nx * (W / 2 + 0.02) + nz * o;
        const z = nz * (W / 2 + 0.02) + nx * o;
        b.add({
          piece: 'glassBox',
          p: [x, 1.2, z],
          s: [nz ? 0.4 : 0.08, h, nz ? 0.08 : 0.4],
          tint: PALETTE.glassWarm,
          glow: 0.7,
        });
        b.add({ piece: 'lumenRib', p: [x + nz * 0.26, 1.2, z + nx * 0.26], s: [0.05, h, 0.05], glow: 0.6 });
      }
    }
    b.add({ piece: 'waterfall', p: [0, 0.25, W / 2 + 0.06], s: [0.9, H - 0.3, 1], glow: 0.8 });
    // Roof forest and pod berths.
    const top = 0.2 + H;
    for (let k = 0; k < 4; k++) tree(b, (k % 2 ? 1 : -1) * 1.6, top, (k < 2 ? 1 : -1) * 1.6, 0.9, 0.3);
    for (const x of [-1.6, 1.6]) b.add({ piece: 'pod', p: [x, top, 0], s: 1.0, r: 0.5, glow: 0.8 });
    b.add({ piece: 'haloRing', p: [0, top + 0.05, 0], s: [W * 1.3, 4, W * 1.3], glow: 0.7 });
  },
});
