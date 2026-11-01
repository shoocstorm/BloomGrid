import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, crate, ivyEdge, lamp, roofMeadow, tree } from '../kit';

export default defineBuilding({
  id: 'mycelium-brickworks',
  name: 'Mycelium Brickworks',
  description:
    'Grows building bricks from fungus and farm waste in glowing curing racks, then fires them in a moss-clad kiln. Dusty work: pair with a Phyto Garden to scrub its air.',
  category: 'industry',
  footprint: [5, 4],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 900,
    energy: -25,
    eco: -1,
    happiness: -1,
    population: 0,
    jobs: 160,
    pollution: 2,
    water: -10,
    upkeep: 0.15,
  },
  growthTime: 140,
  symbiosis: {
    partners: ['phyto-garden'],
    radius: 8,
    pollutionMul: 0.4,
    outputMul: 1.1,
    label: 'phyto-garden reeds catch the kiln dust',
  },
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 3.8], tint: PALETTE.concrete });
    // Curing hall with a sawtooth roof of north-light glass.
    b.add({ piece: 'timberBox', p: [-0.4, 0.12, -0.2], s: [3.6, 1.5, 2.6], tint: PALETTE.timber });
    for (let i = 0; i < 4; i++)
      b.add({
        piece: 'glassBox',
        p: [-1.75 + i * 0.9, 1.62, -0.2],
        s: [0.85, 0.5, 2.5],
        rz: 0.45,
        tint: PALETTE.glass,
        glow: 0.3,
      });
    ivyEdge(b, -0.4, 1.6, 1.12, 3.4, 0, 1, 7);
    // Glowing fungus curing racks along the open side.
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'fungus', p: [-1.9 + i * 0.6, 0.12, 1.45], s: 0.3, tint: 0xf6e7c8, glow: 0.9 });
    // Kiln with a moss-wrapped chimney.
    b.add({ piece: 'concreteCyl', p: [1.85, 0.12, -0.9], s: [1.2, 1.2, 1.2], tint: 0xc77a52 });
    b.add({ piece: 'concreteCyl', p: [1.85, 1.3, -0.9], s: [0.55, 3.2, 0.55], tint: 0xb46a48 });
    b.add({ piece: 'mossBox', p: [1.85, 2.2, -0.9], s: [0.6, 1.4, 0.6] });
    b.add({ piece: 'lumenRib', p: [1.85, 4.5, -0.9], s: [0.62, 0.12, 0.62], glow: 0.8 });
    // Brick pallets in the yard.
    for (let k = 0; k < 4; k++)
      b.add({
        piece: 'slab',
        p: [1.4 + (k % 2) * 0.7, 0.12, 0.6 + Math.floor(k / 2) * 0.7],
        s: [0.55, b.range(0.3, 0.55), 0.55],
        tint: 0xc0704a,
      });
    roofMeadow(b, 1.62, 0.8, 2.5);
    tree(b, -2.1, 0.12, 1.5, 0.5, 0.3);
    // Detail (D-097): shelved curing racks under a striped shade, a window band and lit sign on the hall, a
    // roller door, the kiln's glowing firing door and banded chimney, timber pallets and a little forklift.
    for (let i = 0; i < 4; i++)
      b.add({
        piece: 'timberBox',
        p: [-2.15 + i * 1.07, 0.12, 1.45],
        s: [0.05, 0.62, 0.32],
        tint: PALETTE.bark,
      });
    b.add({ piece: 'timberBox', p: [-0.55, 0.48, 1.45], s: [3.3, 0.04, 0.34], tint: PALETTE.timber });
    for (let i = 0; i < 7; i++)
      b.add({ piece: 'fungus', p: [-2.0 + i * 0.48, 0.52, 1.45], s: 0.18, tint: 0xf6e7c8, glow: 0.9 });
    awning(b, -0.55, 0.86, 1.42, 3.4, 0.5, TRIM.cream, TRIM.terracotta, 9);
    b.add({ piece: 'glassBox', p: [-0.4, 0.98, 1.11], s: [3.2, 0.2, 0.02], tint: 0xd6f2ee, glow: 0.3 });
    b.add({ piece: 'slab', p: [-0.4, 1.28, 1.11], s: [1.3, 0.22, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [-0.4, 1.32, 1.13], s: [1.1, 0.12, 0.01], tint: 0xf6e7c8, glow: 0.8 });
    b.add({ piece: 'slab', p: [-2.215, 0.12, -0.5], s: [0.03, 0.9, 0.8], tint: TRIM.terracotta });
    for (let r = 0; r < 6; r++)
      b.add({ piece: 'slab', p: [-2.235, 0.2 + r * 0.14, -0.5], s: [0.012, 0.012, 0.78], tint: 0x8a5a40 });
    b.add({ piece: 'slab', p: [1.85, 0.12, -0.29], s: [0.5, 0.48, 0.04], tint: TRIM.charcoal });
    b.add({ piece: 'lumenRib', p: [1.85, 0.16, -0.27], s: [0.34, 0.34, 0.04], tint: 0xff8a3c, glow: 1 });
    for (const y of [2.0, 3.6, 4.2])
      b.add({ piece: 'concreteCyl', p: [1.85, y, -0.9], s: [0.6, 0.06, 0.6], tint: TRIM.charcoal });
    for (let k = 0; k < 4; k++)
      b.add({
        piece: 'timberBox',
        p: [1.4 + (k % 2) * 0.7, 0.12, 0.6 + Math.floor(k / 2) * 0.7],
        s: [0.6, 0.06, 0.6],
        tint: 0xa47c56,
      });
    b.add({ piece: 'slab', p: [1.75, 0.14, 1.72], s: [0.34, 0.16, 0.26], tint: TRIM.orange });
    b.add({ piece: 'glassBox', p: [1.8, 0.3, 1.72], s: [0.18, 0.16, 0.22], tint: 0xd6f2ee });
    for (const z of [1.62, 1.82])
      b.add({ piece: 'slab', p: [1.55, 0.12, z], s: [0.04, 0.42, 0.03], tint: TRIM.charcoal });
    crate(b, 1.42, 0.14, 1.72, 0.14, 0, 0xc0704a);
    lamp(b, 2.3, 0.12, -0.05, 0.6);
    lamp(b, -2.3, 0.12, 0.6, 0.6);
  },
});
