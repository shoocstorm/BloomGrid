import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, door, grassTufts, lamp, planter, tree } from '../kit';

export default defineBuilding({
  id: 'aquatic-centre',
  name: 'Lagoon Aquatic Centre',
  description:
    'An Olympic pool, a diving tower and a children’s lagoon under one long glass shell, warmed by the sun and filtered by reed beds. Busy from dawn laps to evening galas.',
  category: 'sports',
  footprint: [8, 6],
  stats: {
    cost: 2200,
    energy: -20,
    eco: 4,
    happiness: 18,
    population: 0,
    jobs: 40,
    pollution: 0,
    water: -25,
  },
  growthTime: 160,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [7.8, 0.25, 5.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.25, 0], s: [7.4, 0.04, 5.4], tint: 0xdfe9e2 });
    // Racing pool with lane ropes, and the lagoon.
    b.add({ piece: 'pool', p: [-0.8, 0.22, -0.6], s: [5.0, 0.1, 2.6] });
    for (let i = 1; i < 6; i++)
      b.add({ piece: 'slab', p: [-0.8, 0.31, -1.9 + i * 0.43], s: [5.0, 0.01, 0.03], tint: 0xffd36b });
    b.add({ piece: 'pool', p: [2.4, 0.22, 1.6], s: [2.0, 0.1, 1.6] });
    // Diving tower.
    b.add({ piece: 'concreteCyl', p: [2.4, 0.25, -1.4], s: [0.35, 3.0, 0.35], tint: 0xf4f1ea });
    for (const y of [1.2, 2.2, 3.0])
      b.add({ piece: 'slab', p: [2.0, 0.25 + y, -1.4], s: [1.0, 0.08, 0.35], tint: 0xf4f1ea });
    // The long glass shell.
    b.add({ piece: 'dome', p: [0, 0.25, 0], s: [7.6, 3.6, 5.6], tint: PALETTE.glass });
    b.add({ piece: 'haloRing', p: [0, 0.4, 0], s: [7.5, 2, 5.5], glow: 0.6 });
    grassTufts(b, -2.8, 0.29, 2.0, 1.6, 1.0, 10);
    for (const x of [-3.4, -2.2]) tree(b, x, 0.29, 2.2, 0.45, 0.2);
    // Detail (D-097): starting blocks and lane-end walls, loungers and parasols on the deck, a lifeguard chair, a
    // coiled orange slide into the lagoon, and a glazed entrance porch with planters and lamps outside.
    for (let i = 0; i < 6; i++)
      b.add({
        piece: 'slab',
        p: [-3.4, 0.29, -1.81 + i * 0.43],
        s: [0.14, 0.12, 0.16],
        tint: i % 2 ? 0xf4f1ea : TRIM.seaBlue,
      });
    for (let i = 0; i < 4; i++) {
      const x = -1.9 + i * 0.6;
      b.add({
        piece: 'slab',
        p: [x, 0.29, 1.05],
        s: [0.22, 0.05, 0.5],
        rx: i % 2 ? 0.12 : 0,
        tint: 0xf4f1ea,
      });
      if (i % 2 === 0) {
        b.add({ piece: 'timberBox', p: [x + 0.3, 0.29, 1.15], s: [0.02, 0.6, 0.02], tint: TRIM.charcoal });
        b.add({
          piece: 'concreteCyl',
          p: [x + 0.3, 0.88, 1.15],
          s: [0.55, 0.04, 0.55],
          tint: i ? 0xffb7d5 : 0xffd36b,
        });
      }
    }
    b.add({ piece: 'timberBox', p: [0.6, 0.29, 0.95], s: [0.2, 0.5, 0.2], tint: PALETTE.timber });
    b.add({ piece: 'slab', p: [0.6, 0.79, 0.95], s: [0.26, 0.04, 0.26], tint: TRIM.red });
    b.add({ piece: 'concreteCyl', p: [3.2, 0.25, -0.1], s: [0.3, 1.5, 0.3], tint: 0xf4f1ea });
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 1.4;
      pts.push([
        3.2 - Math.sin(a) * 0.55 * (1 - k * 0.04),
        1.75 - k * 0.14,
        -0.1 + (1 - Math.cos(a)) * 0.55 + k * 0.08,
      ]);
    }
    for (let k = 0; k < 10; k++) beam(b, 'slab', pts[k]!, pts[k + 1]!, 0.16, { tint: TRIM.orange });
    b.add({ piece: 'glassBox', p: [0, 0.25, 2.65], s: [1.3, 0.75, 0.45], tint: PALETTE.glass });
    door(b, 0, 0.25, 2.88, 0.36, 0.42);
    b.add({ piece: 'slab', p: [0, 1.0, 2.75], s: [1.7, 0.05, 0.4], tint: PALETTE.timber });
    for (const x of [-1.2, 1.2]) planter(b, x, 0.25, 2.75, 0.5, 0.2, 0.1);
    for (const x of [-3.7, 3.7]) lamp(b, x, 0.25, 2.7, 0.6);

    // Levels (D-100). Level 2: an outdoor lido beside the hall (a sun deck with loungers and parasols round the
    // splash pool) and a glazed café with a roof terrace over the entrance.
    b.level(2, () => {
      b.add({ piece: 'slab', p: [2.4, 0.29, 2.55], s: [2.6, 0.03, 0.35], tint: 0xc8a57c });
      for (const x of [1.6, 2.4, 3.2]) {
        b.add({ piece: 'slab', p: [x, 0.32, 2.55], s: [0.2, 0.04, 0.32], rx: 0.15, tint: 0xf4f1ea });
        b.add({ piece: 'timberBox', p: [x + 0.2, 0.32, 2.6], s: [0.015, 0.5, 0.015], tint: TRIM.charcoal });
        b.add({ piece: 'concreteCyl', p: [x + 0.2, 0.8, 2.6], s: [0.45, 0.04, 0.45], tint: x === 2.4 ? TRIM.seaBlue : 0xffd36b });
      }
      b.add({ piece: 'glassBox', p: [0, 1.0, 2.65], s: [1.3, 0.5, 0.45], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'slab', p: [0, 1.5, 2.6], s: [1.5, 0.04, 0.55], tint: PALETTE.timber });
      planter(b, 0, 1.54, 2.75, 1.0, 0.18, 0.1);
    });
    // Level 3: a second, higher dome over a wave pool annex at the back, a ten-metre diving platform with lit
    // edges, and a halo on the main dome's crown.
    b.level(3, () => {
      b.add({ piece: 'dome', p: [-2.0, 0.25, -2.0], s: [3.6, 3.0, 1.6], tint: PALETTE.glass });
      b.add({ piece: 'pool', p: [-2.0, 0.26, -2.1], s: [3.2, 0.03, 1.2] });
      b.add({ piece: 'concreteCyl', p: [2.4, 0.25, -1.4], s: [0.3, 4.2, 0.3], tint: 0xf4f1ea });
      b.add({ piece: 'slab', p: [1.9, 4.4, -1.4], s: [1.2, 0.08, 0.4], tint: 0xf4f1ea });
      b.add({ piece: 'lumenRib', p: [1.32, 4.48, -1.4], s: [0.03, 0.03, 0.4], tint: 0x9ee6ff, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 1.9, 0], s: [3.4, 3, 2.6], tint: 0x9ee6ff, glow: 1 });
    });
  },
});
