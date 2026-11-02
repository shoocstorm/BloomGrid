import { defineBuilding } from '../types';
import { PALETTE, entrance, footbridge, grassTufts, ivyEdge, lamp, railing, tree } from '../kit';

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
  style: 'limestone',
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
    // Street level and roof (D-097): two lit doors either side of the waterfall, each reached over the pool by a
    // railed footbridge, lamps at the corners, and a balustrade round the roof forest.
    for (const x of [-1.3, 1.3]) {
      entrance(b, x, 0.2, 3.12, 0.6, 0.5);
      footbridge(b, x, 0.22, 3.5, 0.7, 0.8);
    }
    for (const x of [-3.4, 3.4]) lamp(b, x, 0.2, 2.95, 0.6);
    const e = W / 2 - 0.05;
    railing(b, 0, top, e, W - 0.1);
    railing(b, 0, top, -e, W - 0.1);
    railing(b, e, top, 0, W - 0.1, true);
    railing(b, -e, top, 0, W - 0.1, true);

    // Levels (D-100). Level 2: moss sky gardens cut into the block (boxes that push out of two faces, each with a
    // glass loggia and a tree) and a second waterfall down the back.
    b.level(2, () => {
      for (const [x, y, z, nx, nz] of [
        [1.2, 6.2, W / 2, 0, 1],
        [-1.5, 10.6, W / 2, 0, 1],
        [W / 2, 8.4, -1.0, 1, 0],
        [-W / 2, 12.8, 0.9, -1, 0],
      ] as const) {
        const [sx, sz] = nx ? [1.1, 1.8] : [1.8, 1.1];
        const [cx, cz] = [x + nx * 0.4, z + nz * 0.4];
        b.add({ piece: 'mossBox', p: [cx, y, cz], s: [sx, 0.25, sz] });
        b.add({ piece: 'glassBox', p: [x + nx * 0.05, y + 0.25, z + nz * 0.05], s: nx ? [0.12, 1.1, 1.5] : [1.5, 1.1, 0.12], tint: PALETTE.glassWarm, glow: 0.6 });
        tree(b, cx + nx * 0.2, y + 0.25, cz + nz * 0.2, 0.55);
        railing(b, x + nx * 0.92, y + 0.25, z + nz * 0.92, 1.6, !!nx);
      }
      b.add({ piece: 'waterfall', p: [0.8, 0.25, -W / 2 - 0.06], s: [0.7, H - 0.3, 1], r: Math.PI, glow: 0.8 });
      b.add({ piece: 'pool', p: [0.8, 0.2, -W / 2 - 0.4], s: [1.4, 0.05, 0.6] });
    });
    // Level 3: a set-back moss crown with its own window slits, a forest on its roof and a lit beacon.
    b.level(3, () => {
      const cw = 2.0;
      const ch = 3.6;
      b.add({ piece: 'mossBox', p: [0, top, 0], s: [cw, ch, cw] });
      for (const [nx, nz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const)
        for (const o of [-0.45, 0.45])
          b.add({ piece: 'glassBox', p: [nx * (cw / 2 + 0.02) + nz * o, top + 0.4, nz * (cw / 2 + 0.02) + nx * o], s: [nz ? 0.22 : 0.06, ch - 0.9, nz ? 0.06 : 0.22], tint: PALETTE.glassWarm, glow: 0.8 });
      for (let k = 0; k < 3; k++) tree(b, Math.cos(k * 2.1) * 0.5, top + ch, Math.sin(k * 2.1) * 0.5, 0.6);
      b.add({ piece: 'spireCone', p: [0, top + ch, 0], s: [0.25, 2.2, 0.25], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'haloRing', p: [0, top + ch + 1.4, 0], s: [1.2, 3, 1.2], glow: 0.9 });
      for (const [nx, nz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const)
        ivyEdge(b, nx * (cw / 2 + 0.02), top + ch, nz * (cw / 2 + 0.02), cw * 0.8, nx, nz, 5);
    });
  },
});
