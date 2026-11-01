import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, barrel, beam, crate, gableRoof, lamp, piles } from '../kit';

export default defineBuilding({
  id: 'fishing-dock',
  name: 'Fishing Boat Dock',
  description:
    'A timber pier, a net shed and three electric fishing boats. Free to build and the island’s first income: the catch sells for credits and feeds residents. Must touch the sea. Two or three docks fish the sea best; more overfish it, and polluted coasts or algal blooms spoil the haul.',
  category: 'food',
  footprint: [3, 2],
  // Free: the fishers pay their way from the catch (no upkeep).
  stats: {
    cost: 0,
    energy: 0,
    eco: 0,
    happiness: 1,
    population: 0,
    jobs: 16,
    pollution: 0,
    food: 60,
    upkeep: 0,
  },
  growthTime: 60,
  placement: { nearWater: true },
  fishing: { boats: 3 },
  limit: { base: 3, perPopulation: 600 },
  variants: 2,
  recipe(b) {
    // The quay (D-095): a planked deck over the whole lot with a concrete curb on the sea side (+z).
    for (let i = 0; i < 10; i++)
      b.add({ piece: 'timberBox', p: [-1.35 + i * 0.3, 0, 0], s: [0.29, 0.1, 1.9], tint: i % 2 ? 0xa98258 : 0x9a7550 });
    b.add({ piece: 'slab', p: [0, 0, 0.93], s: [2.95, 0.14, 0.1], tint: 0xcfc6b6 });
    piles(b, -1.3, 1.3, 0.98, 0.1, 6, 0.6);
    // The jetty: a narrow pier on piles reaching into the water, bollards and a lamp at its end.
    for (let k = 0; k < 6; k++) b.add({ piece: 'timberBox', p: [0.75, 0.02, 1.1 + k * 0.22], s: [0.46, 0.06, 0.2], tint: k % 2 ? 0xa98258 : 0x957049 });
    for (const x of [0.55, 0.95]) for (const z of [1.2, 1.75, 2.3]) piles(b, x, x, z, 0.04, 1, 0.6);
    for (const z of [1.35, 1.95]) for (const x of [0.56, 0.94]) b.add({ piece: 'concreteCyl', p: [x, 0.08, z], s: [0.06, 0.07, 0.06], tint: TRIM.charcoal });
    lamp(b, 0.95, 0.08, 2.32, 0.5);

    // Net shed: timber walls, a pitched sea-blue roof, a dark doorway with a warm light, a window and a sign.
    const [sx, sz] = [-0.78, -0.38];
    b.add({ piece: 'timberBox', p: [sx, 0.1, sz], s: [1.2, 0.58, 0.85], tint: 0xb48d63 });
    for (let k = 0; k < 7; k++) b.add({ piece: 'timberBox', p: [sx - 0.54 + k * 0.18, 0.1, sz + 0.43], s: [0.025, 0.58, 0.02], tint: 0x8f6b48 });
    gableRoof(b, sx, 0.68, sz, 1.24, 0.9, { pitch: 0.55, tint: TRIM.seaBlue, ends: 0xb48d63 });
    b.add({ piece: 'slab', p: [sx + 0.18, 0.1, sz + 0.43], s: [0.42, 0.42, 0.02], tint: 0x2c2420 });
    b.add({ piece: 'lumenRib', p: [sx + 0.18, 0.56, sz + 0.45], s: [0.18, 0.03, 0.03], tint: 0xffd27a, glow: 0.9 });
    b.add({ piece: 'glassBox', p: [sx - 0.36, 0.32, sz + 0.43], s: [0.24, 0.16, 0.02], tint: 0xd6f2ee });
    b.add({ piece: 'slab', p: [sx, 0.85, sz + 0.47], s: [0.5, 0.1, 0.02], tint: TRIM.cream });
    b.add({ piece: 'slab', p: [sx, 0.87, sz + 0.48], s: [0.4, 0.05, 0.01], tint: TRIM.teal, glow: 0.4 });

    // Fish market stall: a counter with fish on ice under a striped awning, crates round it.
    const [mx, mz] = [0.55, -0.35];
    b.add({ piece: 'timberBox', p: [mx, 0.1, mz], s: [0.9, 0.22, 0.32], tint: 0xc9a06a });
    b.add({ piece: 'glassBox', p: [mx, 0.32, mz], s: [0.84, 0.03, 0.28], tint: 0xe6f6fb });
    for (let k = 0; k < 6; k++)
      b.add({ piece: 'koi', p: [mx - 0.32 + k * 0.13, 0.345, mz + (k % 2 ? 0.05 : -0.05)], s: [0.11, 0.05, 0.05], r: b.range(-0.3, 0.3), tint: k % 3 ? 0xc9d3d8 : 0xe8a07a });
    for (const x of [mx - 0.42, mx + 0.42]) b.add({ piece: 'timberBox', p: [x, 0.1, mz - 0.12], s: [0.035, 0.62, 0.035], tint: PALETTE.bark });
    awning(b, mx, 0.68, mz + 0.02, 0.98, 0.5, 0xf5efe4, TRIM.teal, 7);
    crate(b, mx + 0.6, 0.1, mz - 0.05, 0.17, 0.2);
    crate(b, mx + 0.62, 0.24, mz - 0.03, 0.14, -0.3, 0xb48d5a);
    crate(b, mx - 0.62, 0.1, mz + 0.05, 0.16, 0.5);

    // Derrick crane at the jetty's root: a post, a boom over the water and a crate on its line.
    b.add({ piece: 'timberBox', p: [0.35, 0.1, 0.72], s: [0.08, 1.0, 0.08], tint: TRIM.orange });
    beam(b, 'timberBox', [0.35, 1.0, 0.72], [0.75, 0.95, 1.55], 0.05, { tint: TRIM.orange });
    beam(b, 'timberBox', [0.35, 0.55, 0.72], [0.62, 0.92, 1.28], 0.025, { tint: TRIM.steel });
    b.add({ piece: 'timberBox', p: [0.75, 0.52, 1.55], s: [0.01, 0.42, 0.01], tint: TRIM.rope });
    crate(b, 0.75, 0.38, 1.55, 0.15, 0.3, 0x5f9fb0);

    // Drying nets on poles with orange floats; barrels, lobster pots and a coil of rope.
    for (let k = 0; k < 3; k++) b.add({ piece: 'timberBox', p: [-1.3 + k * 0.38, 0.1, 0.45], s: [0.04, 0.62, 0.04], tint: PALETTE.bark });
    for (let k = 0; k < 2; k++) {
      b.add({ piece: 'willowArch', p: [-1.11 + k * 0.38, 0.38, 0.45], s: [0.36, 0.3, 0.04], tint: 0x6f9f86 });
      for (let f = 0; f < 3; f++) b.add({ piece: 'concreteCyl', p: [-1.23 + k * 0.38 + f * 0.12, 0.52 - Math.abs(f - 1) * 0.08, 0.45], s: [0.045, 0.035, 0.045], tint: TRIM.orange });
    }
    barrel(b, -0.22, 0.1, 0.62, 0.13);
    barrel(b, -0.05, 0.1, 0.7, 0.12, 0x7f5a3a);
    for (let k = 0; k < 3; k++) {
      const [px, pz] = [-0.35 + k * 0.17, 0.15];
      b.add({ piece: 'timberBox', p: [px, 0.1, pz], s: [0.14, 0.012, 0.14], tint: 0x8f6b48 });
      b.add({ piece: 'willowArch', p: [px, 0.11, pz], s: [0.14, 0.18, 0.13], r: Math.PI / 2, tint: 0x5f7f6a });
    }
    b.add({ piece: 'concreteCyl', p: [0.1, 0.1, 0.5], s: [0.16, 0.035, 0.16], tint: TRIM.rope });
    b.add({ piece: 'concreteCyl', p: [0.1, 0.135, 0.5], s: [0.11, 0.03, 0.11], tint: 0xc8b088 });
    lamp(b, -1.35, 0.1, 0.85, 0.55);
    lamp(b, 1.38, 0.1, 0.85, 0.55);
  },
});
