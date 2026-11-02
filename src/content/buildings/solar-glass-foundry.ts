import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, crate, door, ivyEdge, lamp, solarArray, tree } from '../kit';

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
    b.upTo(2, () =>
      b.add({
        piece: 'spireCone',
        p: [2.2, 6.3, -0.8],
        s: [0.7, 0.8, 0.7],
        tint: PALETTE.glassWarm,
        glow: 0.3,
      }),
    );
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
    // Detail (D-097): a framed furnace door and office entrance, window bands down the hall, a sand silo with a
    // chute into the hall, A-frame racks holding the fresh panes, crates, a demo solar array and yard lamps.
    b.add({ piece: 'slab', p: [-0.6, 0.12, 1.31], s: [1.9, 1.15, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [-0.6, 1.25, 1.33], s: [2.1, 0.08, 0.06], tint: TRIM.orange });
    door(b, -2.2, 0.12, 1.32, 0.24, 0.36);
    for (const x of [-2.71, 1.51])
      b.add({ piece: 'glassBox', p: [x, 0.9, 0], s: [0.02, 0.3, 2.2], tint: 0xd6f2ee, glow: 0.3 });
    b.add({ piece: 'concreteCyl', p: [-2.3, 0.12, -1.55], s: [0.7, 1.4, 0.7], tint: 0xe3d3b0 });
    b.add({ piece: 'spireCone', p: [-2.3, 1.52, -1.55], s: [0.72, 0.4, 0.72], tint: 0xe3d3b0 });
    for (const x of [-2.55, -2.05])
      b.add({ piece: 'timberBox', p: [x, 0.12, -1.55], s: [0.05, 0.4, 0.05], tint: TRIM.steel });
    beam(b, 'slab', [-2.3, 1.5, -1.55], [-1.7, 1.9, -1.3], 0.12, { tint: TRIM.steel });
    for (let i = 0; i < 2; i++) {
      const x = 1.6 + i * 0.8;
      beam(b, 'timberBox', [x - 0.38, 0.12, 0.85], [x - 0.38, 0.95, 0.75], 0.05, { tint: PALETTE.bark });
      beam(b, 'timberBox', [x + 0.38, 0.12, 0.85], [x + 0.38, 0.95, 0.75], 0.05, { tint: PALETTE.bark });
    }
    crate(b, 1.4, 0.12, 1.65, 0.24, 0.1);
    crate(b, 1.75, 0.12, 1.7, 0.2, -0.2, 0xb48d5a);
    solarArray(b, -2.15, 0.12, 1.75, 0.9, 0.3, 1, 3, 0.5);
    lamp(b, 0.7, 0.12, 1.75, 0.6);
    lamp(b, 2.75, 0.12, -1.75, 0.6);

    // Levels (D-100). Level 2: a loading canopy of the foundry's own solar glass over the panel yard, on timber
    // posts, glowing amber at night.
    const canopy = () => {
      for (const [x, z] of [
        [1.25, 0.35],
        [2.75, 0.35],
        [1.25, 1.45],
        [2.75, 1.45],
      ] as const)
        b.add({ piece: 'timberBox', p: [x, 0.12, z], s: [0.06, 1.25, 0.06], tint: PALETTE.bark });
      b.add({ piece: 'glassBox', p: [2.0, 1.37, 0.9], s: [1.7, 0.05, 1.3], rx: -0.12, tint: 0xffd9a0, glow: 0.5 });
      b.add({ piece: 'slab', p: [2.0, 1.33, 0.9], s: [1.75, 0.04, 0.05], tint: TRIM.steel });
    };
    b.level(2, canopy);
    // Level 3: the chimney gains a glass lantern crown and a second halo, a slimmer twin stack rises beside it,
    // and prisms of coloured glass catch the light along the hall's roof ridge.
    b.level(3, () => {
      canopy();
      b.add({ piece: 'glassCyl', p: [2.2, 6.32, -0.8], s: [0.6, 0.5, 0.6], tint: 0xffd9a0, glow: 0.8 });
      b.add({ piece: 'spireCone', p: [2.2, 6.82, -0.8], s: [0.7, 1.1, 0.7], tint: PALETTE.glassWarm, glow: 0.3 });
      b.add({ piece: 'haloRing', p: [2.2, 5.6, -0.8], s: [1.1, 3, 1.1], tint: 0xffb36b, glow: 1 });
      b.add({ piece: 'concreteCyl', p: [2.7, 0.12, -1.5], s: [0.4, 4.6, 0.4], tint: 0xdcd5c6 });
      b.add({ piece: 'haloRing', p: [2.7, 4.2, -1.5], s: [0.7, 2, 0.7], glow: 0.9 });
      const PRISMS = [0xffb7d5, 0xffe08a, 0x9ee6ff, 0xc9b6ff, 0x8ff0b0] as const;
      for (let i = 0; i < 5; i++) b.add({ piece: 'glassBox', p: [-2.3 + i * 0.85, 2.3, 0], s: [0.22, 0.45, 0.22], r: 0.7, tint: PRISMS[i]!, glow: 0.8 });
    });
  },
});
