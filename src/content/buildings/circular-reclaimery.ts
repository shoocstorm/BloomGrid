import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, beam, crate, flowers, grassTufts, lamp, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'circular-reclaimery',
  name: 'Circular Reclaimery',
  description:
    'Where nothing is waste: conveyors sort the city’s cast-offs under glass domes, metals and glass go back to the foundries and food scraps to compost. It cleans the air around it.',
  category: 'industry',
  footprint: [5, 5],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 800,
    energy: -20,
    eco: 3,
    happiness: 0,
    population: 0,
    jobs: 150,
    pollution: -1,
    water: -6,
    upkeep: 0.12,
  },
  growthTime: 130,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 4.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.12, 0, 4.4, 4.4, 24);
    // Three sorting domes.
    for (const [x, z] of [
      [-1.4, -1.3],
      [0.2, -1.4],
      [1.6, -1.2],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [1.3, 0.35, 1.3], tint: 0xe8e2d4 });
      b.add({ piece: 'dome', p: [x, 0.47, z], s: [1.3, 1.2, 1.3], tint: PALETTE.glass });
    }
    // Raised conveyors between them and the sheds.
    beam(b, 'slab', [-1.4, 1.2, -1.3], [-1.4, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    beam(b, 'slab', [0.2, 1.2, -1.4], [0.2, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    beam(b, 'slab', [1.6, 1.2, -1.2], [1.6, 1.2, 1.0], 0.22, { tint: 0x6f8a86 });
    // Sheds with green roofs and the compost windrows.
    b.add({ piece: 'timberBox', p: [-0.4, 0.12, 1.4], s: [3.4, 1.1, 1.3], tint: PALETTE.timber });
    roofMeadow(b, 1.22, 3.4, 1.3);
    for (let i = 0; i < 3; i++)
      b.add({ piece: 'mossBox', p: [2.0, 0.12, 0.4 + i * 0.55], s: [0.9, 0.3, 0.35], tint: 0x8a6a45 });
    flowers(b, 2.0, 0.12, 1.6, 0.5, 8);
    // Detail (D-097): legs and belts under the conveyors, roller doors and a lit sign on the sheds, sorted bales
    // by colour (glass, metal, paper), a row of sorting bins, a parked collection pod and yard lamps.
    for (const [x, z] of [
      [-1.4, -1.3],
      [0.2, -1.4],
      [1.6, -1.2],
    ] as const) {
      for (const k of [0.25, 0.6]) {
        const zz = z + (1.0 - z) * k;
        b.add({ piece: 'timberBox', p: [x, 0.12, zz], s: [0.05, 1.08, 0.05], tint: TRIM.steel });
      }
      b.add({ piece: 'slab', p: [x, 1.23, (z + 1.0) / 2], s: [0.16, 0.02, 1.0 - z], tint: 0x3b3f42 });
    }
    for (let k = 0; k < 3; k++) {
      const x = -1.6 + k * 1.0;
      b.add({ piece: 'slab', p: [x, 0.12, 2.06], s: [0.6, 0.7, 0.03], tint: k === 1 ? TRIM.teal : 0xbac4c4 });
      for (let r = 0; r < 5; r++)
        b.add({ piece: 'slab', p: [x, 0.2 + r * 0.13, 2.08], s: [0.58, 0.012, 0.012], tint: 0x8a9494 });
    }
    b.add({ piece: 'slab', p: [-0.4, 0.92, 2.06], s: [1.2, 0.2, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [-0.4, 0.96, 2.08], s: [1.0, 0.1, 0.01], tint: 0x8fd35a, glow: 0.8 });
    const BALES = [0x7fbf8a, 0xa8b0b4, 0xe9dfc6, 0x8fb6c9] as const;
    for (let i = 0; i < 6; i++)
      crate(
        b,
        -2.05 + (i % 3) * 0.32,
        0.12 + Math.floor(i / 3) * 0.22,
        0.25,
        0.28,
        0,
        BALES[i % BALES.length],
      );
    for (let i = 0; i < 4; i++)
      b.add({ piece: 'slab', p: [-0.15 + i * 0.3, 0.12, 0.2], s: [0.24, 0.3, 0.24], tint: BALES[i]! });
    b.add({ piece: 'pod', p: [1.3, 0.12, 0.25], s: [0.8, 0.62, 0.62], tint: 0xf4f1e8 });
    lamp(b, 2.25, 0.12, -0.3, 0.6);
    lamp(b, -2.3, 0.12, 0.85, 0.6);

    // Levels (D-100). Level 2: a glazed sorting loft on the hall roof, fed by a covered conveyor from the
    // digesters, and a repair café under an awning at the hall's east end.
    const loft = () => {
      b.add({ piece: 'glassBox', p: [-0.9, 1.27, 1.4], s: [1.9, 0.55, 1.0], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'slab', p: [-0.9, 1.82, 1.4], s: [2.0, 0.05, 1.1], tint: 0x6f8a86 });
      beam(b, 'slab', [0.2, 1.3, -0.4], [0.05, 1.5, 0.95], 0.3, { tint: 0xbac4c4 });
    };
    b.level(2, () => {
      loft();
      awning(b, 1.25, 1.0, 2.25, 0.9, 0.35, 0xf5efe4, TRIM.teal, 4);
      for (const x of [0.95, 1.55]) b.add({ piece: 'concreteCyl', p: [x, 0.12, 2.3], s: [0.22, 0.24, 0.22], tint: PALETTE.timber });
    });
    // Level 3: a glowing biogas holder by the compost bays, and a ventilation stack with a wind cowl and halo.
    b.level(3, () => {
      loft();
      b.add({ piece: 'concreteCyl', p: [2.0, 0.12, -0.15], s: [0.9, 0.2, 0.9], tint: 0xe8e2d4 });
      b.add({ piece: 'dome', p: [2.0, 0.32, -0.15], s: [0.9, 1.3, 0.9], tint: 0xbfe8a0, glow: 0.4 });
      b.add({ piece: 'concreteCyl', p: [-2.1, 0.12, -1.9], s: [0.28, 3.4, 0.28], tint: 0xe8e2d4 });
      b.add({ piece: 'dome', p: [-2.1, 3.52, -1.9], s: [0.42, 0.35, 0.42], rz: 1.2, tint: TRIM.steel });
      b.add({ piece: 'haloRing', p: [-2.1, 3.2, -1.9], s: [0.5, 2, 0.5], tint: 0x8fd35a, glow: 1 });
      for (const y of [1.2, 2.2]) b.add({ piece: 'concreteCyl', p: [-2.1, y, -1.9], s: [0.31, 0.04, 0.31], tint: TRIM.steel });
    });
  },
});
