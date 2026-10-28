import { defineBuilding } from '../types';
import { PALETTE, ivyEdge, tree } from '../kit';

export default defineBuilding({
  id: 'solar-glass-foundry',
  name: 'Solar Glass Foundry',
  description:
    'A sun-fired furnace hall that melts beach sand and recycled glass into the solar panes the city is clad in. Power-hungry and a little smoky, it is the island’s biggest employer per lot.',
  category: 'industry',
  footprint: [6, 4],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 1400,
    energy: -60,
    eco: -2,
    happiness: -1,
    population: 0,
    jobs: 220,
    pollution: 3,
    water: -8,
    upkeep: 0.24,
  },
  growthTime: 160,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.8, 0.12, 3.8], tint: PALETTE.concrete });
    // Furnace hall under a ridge of glass.
    b.add({ piece: 'slab', p: [-0.6, 0.12, 0], s: [4.2, 1.9, 2.6], tint: 0xe9e4d8 });
    for (let i = 0; i < 5; i++) {
      b.add({
        piece: 'glassBox',
        p: [-2.3 + i * 0.85, 2.02, -0.6],
        s: [0.8, 0.06, 1.4],
        rx: -0.35,
        tint: PALETTE.glass,
        glow: 0.4,
      });
      b.add({
        piece: 'glassBox',
        p: [-2.3 + i * 0.85, 2.02, 0.6],
        s: [0.8, 0.06, 1.4],
        rx: 0.35,
        tint: PALETTE.glass,
        glow: 0.4,
      });
    }
    // The furnace glow through the doors.
    b.add({ piece: 'lumenRib', p: [-0.6, 0.15, 1.32], s: [1.6, 0.9, 0.05], glow: 1, tint: 0xffb36b });
    ivyEdge(b, -0.6, 1.9, -1.32, 4.0, 0, -1, 8);
    // Chimney with a heat-recovery ring.
    b.add({ piece: 'concreteCyl', p: [2.2, 0.12, -0.8], s: [0.8, 6.2, 0.8], tint: 0xdcd5c6 });
    b.add({ piece: 'haloRing', p: [2.2, 4.6, -0.8], s: [1.4, 3, 1.4], glow: 0.9 });
    b.add({
      piece: 'spireCone',
      p: [2.2, 6.3, -0.8],
      s: [0.7, 0.8, 0.7],
      tint: PALETTE.glassWarm,
      glow: 0.3,
    });
    // Racks of fresh panes in the yard.
    for (let i = 0; i < 4; i++)
      b.add({
        piece: 'glassBox',
        p: [1.6 + (i % 2) * 0.8, 0.12, 0.6 + Math.floor(i / 2) * 0.6],
        s: [0.7, 0.9, 0.08],
        rx: 0.15,
        tint: 0xa9e6ff,
        glow: 0.5,
      });
    tree(b, 2.5, 0.12, 1.5, 0.45, 0.3);
  },
});
