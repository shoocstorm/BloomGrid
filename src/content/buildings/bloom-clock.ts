import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;
const H = 15;
const FACE = 11.5;

export default defineBuilding({
  id: 'bloom-clock',
  name: 'Bloom Clock Tower',
  description:
    'The civic clock: twelve living flowers mark the hours on a glowing dial, re-planted each season. The bell in its glass lantern rings the start of every Bloom.',
  category: 'commercial',
  footprint: [8, 8],
  stats: { cost: 2400, energy: -8, eco: 8, happiness: 18, population: 0, jobs: 30, pollution: 0, water: -4 },
  growthTime: 160,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.2, 7.8], tint: PALETTE.concrete });
    for (const [x, z] of [
      [-2.8, -2.8],
      [2.8, -2.8],
      [-2.8, 2.8],
      [2.8, 2.8],
    ] as const) {
      b.add({ piece: 'mossBox', p: [x, 0.2, z], s: [1.8, 0.1, 1.8] });
      grassTufts(b, x, 0.3, z, 1.6, 1.6, 12);
      flowers(b, x, 0.3, z, 0.8, 12, 0, 0.6);
      tree(b, x, 0.3, z, 0.7, 0.1);
    }
    // Shaft: a glass core in a white frame with moss panels.
    b.add({ piece: 'glassBox', p: [0, 0.2, 0], s: [2.0, H, 2.0], tint: PALETTE.glass, glow: 0.1 });
    for (const [x, z] of [
      [-1.05, -1.05],
      [1.05, -1.05],
      [-1.05, 1.05],
      [1.05, 1.05],
    ] as const)
      b.add({ piece: 'slab', p: [x, 0.2, z], s: [0.35, H + 0.4, 0.35], tint: PALETTE.concrete });
    for (const [nx, nz] of [
      [1, 0],
      [-1, 0],
    ] as const)
      b.add({ piece: 'mossBox', p: [nx * 1.02, 2, nz], s: [0.08, 7, 1.4], growAt: 0.1 });
    // Dials on the front and back: a lit ring, twelve hour flowers and two hands.
    for (const side of [1, -1]) {
      const z = side * 1.12;
      b.add({ piece: 'haloRing', p: [0, FACE, z], s: [4.6, 4.6, 4.6], rx: Math.PI / 2, glow: 1 });
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        b.add({
          piece: 'flower',
          p: [Math.cos(a) * 1.9, FACE - 0.15 + Math.sin(a) * 1.9, z + side * 0.05],
          s: k % 3 ? 0.3 : 0.45,
          tint: k % 3 ? 0xfff4f0 : 0xffe08a,
          glow: 1,
        });
      }
      beam(b, 'lumenRib', [0, FACE, z + side * 0.08], [0.9, FACE + 1.1, z + side * 0.08], 0.12, { glow: 1 });
      beam(b, 'lumenRib', [0, FACE, z + side * 0.1], [-1.5, FACE - 0.4, z + side * 0.1], 0.08, { glow: 1 });
    }
    ivyEdge(b, 0, H + 0.2, 1.0, 2, 0, 1, 3);
    // Lantern belfry and spire.
    b.add({ piece: 'slab', p: [0, H + 0.2, 0], s: [2.6, 0.2, 2.6], tint: PALETTE.concrete });
    b.add({ piece: 'glassCyl', p: [0, H + 0.4, 0], s: [1.6, 1.6, 1.6], tint: 0xffe08a, glow: 0.9 });
    b.add({ piece: 'dome', p: [0, H + 0.6, 0], s: [1.1, 1.4, 1.1] });
    b.add({ piece: 'spireCone', p: [0, H + 2, 0], s: [1.8, 3, 1.8], tint: PALETTE.glassWarm, glow: 0.4 });
  },
});
