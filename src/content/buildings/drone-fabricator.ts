import { defineBuilding } from '../types';
import { PALETTE, ivyEdge, roofMeadow } from '../kit';

export default defineBuilding({
  id: 'drone-fabricator',
  name: 'Drone Fabricator',
  description:
    'A clean-room robotics plant under a solar roof that builds the Flora-Net’s gardening drones and the city’s pod cabins. No smoke, lots of skilled jobs, and test flights over the yard at night.',
  category: 'industry',
  footprint: [6, 5],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 1600,
    energy: -45,
    eco: 1,
    happiness: 2,
    population: 0,
    jobs: 260,
    pollution: 0,
    water: -6,
    upkeep: 0.26,
  },
  growthTime: 170,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.8, 0.12, 4.8], tint: PALETTE.concrete });
    // Glass assembly hall and its office wing.
    b.add({ piece: 'glassBox', p: [-0.7, 0.12, -0.5], s: [4.0, 2.2, 3.2], tint: PALETTE.glass, glow: 0.5 });
    b.add({ piece: 'slab', p: [-0.7, 2.32, -0.5], s: [4.1, 0.12, 3.3], tint: PALETTE.concrete });
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 2; k++)
        b.add({ piece: 'solarLeaf', p: [-2.4 + i * 1.0, 2.46, -1.3 + k * 1.5], s: [0.95, 1, 1.2], rz: 0.12 });
    ivyEdge(b, -0.7, 2.3, 1.12, 3.8, 0, 1, 8);
    b.add({ piece: 'slab', p: [2.1, 0.12, -1.2], s: [1.4, 1.4, 1.8], tint: 0xe9eee8 });
    roofMeadow(b, 1.52, 1.4, 1.8, 1);
    // Test-flight pad with drones hovering over it.
    b.add({ piece: 'concreteCyl', p: [1.8, 0.12, 1.4], s: [1.8, 0.1, 1.8], tint: 0xdfe8e4 });
    b.add({ piece: 'haloRing', p: [1.8, 0.24, 1.4], s: [1.6, 2, 1.6], glow: 1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add({
        piece: 'drone',
        p: [1.8 + Math.cos(a) * 0.5, 1.0 + i * 0.35, 1.4 + Math.sin(a) * 0.5],
        s: 0.22,
        glow: 1,
      });
    }
  },
});
