import { defineBuilding } from '../types';
import { PALETTE, TRIM, barrel, crate, ivyEdge, lamp, roofMeadow } from '../kit';

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
    // Detail (D-096): a sawtooth north-light roof over the hall, loading bays with roller doors and a parked
    // delivery pod, an overhead gantry crane, window bands on the office wing, a lit sign and yard lamps.
    for (let k = 0; k < 4; k++) {
      b.add({ piece: 'slab', p: [-0.7, 2.44 + 0.2, -1.7 + k * 0.8 + 0.12], s: [4.0, 0.03, 0.55], rx: 0.6, tint: 0x8fa7a0 });
      b.add({ piece: 'glassBox', p: [-0.7, 2.44, -1.7 + k * 0.8 - 0.12], s: [3.96, 0.32, 0.02], tint: 0xcfefff });
    }
    for (let k = 0; k < 3; k++) {
      const x = -2.2 + k * 1.1;
      b.add({ piece: 'slab', p: [x, 0.12, 1.11], s: [0.8, 0.9, 0.03], tint: k === 1 ? TRIM.orange : 0xbac4c4 });
      for (let r = 0; r < 6; r++) b.add({ piece: 'slab', p: [x, 0.2 + r * 0.14, 1.13], s: [0.78, 0.012, 0.012], tint: 0x8a9494 });
    }
    b.add({ piece: 'pod', p: [-1.1, 0.12, 1.75], s: [0.9, 0.7, 0.7], tint: 0xf4f1e8 });
    for (const x of [-2.6, 1.2]) b.add({ piece: 'timberBox', p: [x, 0.12, 1.5], s: [0.08, 1.4, 0.08], tint: TRIM.orange });
    b.add({ piece: 'timberBox', p: [-0.7, 1.5, 1.5], s: [3.9, 0.1, 0.1], tint: TRIM.orange });
    b.add({ piece: 'timberBox', p: [-1.6, 1.0, 1.5], s: [0.015, 0.5, 0.015], tint: TRIM.steel });
    crate(b, -1.6, 0.85, 1.5, 0.22, 0, 0x5f9fb0);
    for (let k = 0; k < 3; k++) b.add({ piece: 'glassBox', p: [2.1, 0.35 + k * 0.38, -0.29], s: [1.3, 0.16, 0.02], tint: 0xd6f2ee });
    b.add({ piece: 'slab', p: [-0.7, 2.0, 1.13], s: [1.6, 0.22, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [-0.7, 2.03, 1.15], s: [1.4, 0.12, 0.01], tint: TRIM.teal, glow: 0.8 });
    for (const [x, z] of [
      [2.7, 0.3],
      [-2.75, 2.2],
      [0.5, 2.3],
    ] as const)
      lamp(b, x, 0.12, z, 0.6);
    crate(b, 0.2, 0.12, 1.6, 0.2, 0.3);
    crate(b, 0.45, 0.12, 1.75, 0.18, -0.2, 0xb48d5a);
    barrel(b, 0.25, 0.12, 2.0, 0.12, 0x3f8fb0);
  },
});
