import { defineBuilding } from '../types';
import { PALETTE, ivyEdge, roofMeadow, tree } from '../kit';

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
  },
});
