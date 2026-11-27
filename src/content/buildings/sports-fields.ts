import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, lamp, railing, tree } from '../kit';

export default defineBuilding({
  id: 'sports-fields',
  name: 'Meadow Sports Fields',
  description:
    'Two floodlit pitches of hardy meadow turf with timber bleachers: league games at the weekend, kick-abouts every evening. Cheap to run and good for the neighbourhood.',
  category: 'sports',
  footprint: [6, 4],
  // Cheap to run: turf, timber and floodlights.
  stats: {
    cost: 600,
    energy: -6,
    eco: 4,
    happiness: 10,
    population: 0,
    jobs: 8,
    pollution: -1,
    water: -4,
    upkeep: 0.08,
  },
  growthTime: 100,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.9, 0.1, 3.9], tint: PALETTE.concrete });
    for (const x of [-1.45, 1.45]) {
      // The pitch runs along z, its markings painted on (D-232: thin white slabs flashed from mid zoom).
      b.add({ piece: 'pitch', p: [x, 0.1, -0.2], s: [3.0, 0.05, 2.7], r: Math.PI / 2 });
      // Goals, a little stout and off-white (hairline bright frames flashed as the camera moved).
      for (const z of [-1.6, 1.2]) {
        beam(b, 'timberBox', [x - 0.4, 0.15, z], [x - 0.4, 0.6, z], 0.07, { tint: 0xdfe6e0 });
        beam(b, 'timberBox', [x + 0.4, 0.15, z], [x + 0.4, 0.6, z], 0.07, { tint: 0xdfe6e0 });
        beam(b, 'timberBox', [x - 0.4, 0.6, z], [x + 0.4, 0.6, z], 0.07, { tint: 0xdfe6e0 });
      }
    }
    // Bleachers along the long side.
    for (let r = 0; r < 3; r++)
      b.add({
        piece: 'timberBox',
        p: [0, 0.1 + r * 0.18, 1.55 + r * 0.18],
        s: [5.2, 0.18, 0.2],
        tint: PALETTE.timber,
      });
    // Floodlights.
    for (const [x, z] of [
      [-2.8, -1.8],
      [2.8, -1.8],
      [-2.8, 1.8],
      [2.8, 1.8],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.1, z], s: [0.1, 3.2, 0.1], tint: 0xf4f1ea });
      b.add({ piece: 'lumenRib', p: [x, 3.3, z], s: [0.4, 0.18, 0.18], glow: 1 });
    }
    tree(b, -2.7, 0.1, 0.0, 0.4, 0.2);
    tree(b, 2.7, 0.1, 0.0, 0.4, 0.2);
    // Detail (D-097): a roof over the bleachers, team benches, a scoreboard and a low back fence (the penalty boxes
    // and centre spots are in the pitch's markings).
    for (const x of [-1.45, 1.45]) {
      b.add({ piece: 'timberBox', p: [x, 0.1, -1.9], s: [0.6, 0.12, 0.12], tint: PALETTE.timber });
      b.add({ piece: 'glassBox', p: [x, 0.22, -1.9], s: [0.6, 0.25, 0.02], tint: 0xd6f2ee });
    }
    for (const x of [-2.5, 0, 2.5])
      b.add({ piece: 'timberBox', p: [x, 0.1, 2.0], s: [0.06, 0.95, 0.06], tint: PALETTE.bark });
    b.add({ piece: 'slab', p: [0, 1.05, 1.82], s: [5.4, 0.04, 0.6], rx: -0.12, tint: 0x8fb6a8 });
    for (const x of [-0.3, 0.3])
      b.add({ piece: 'timberBox', p: [x, 0.1, -1.92], s: [0.05, 0.9, 0.05], tint: TRIM.steel });
    b.add({ piece: 'slab', p: [0, 0.75, -1.92], s: [0.9, 0.45, 0.06], tint: TRIM.charcoal });
    for (const x of [-0.2, 0.2])
      b.add({ piece: 'slab', p: [x, 0.82, -1.885], s: [0.24, 0.26, 0.01], tint: 0xffd36b, glow: 1 });
    railing(b, -1.45, 0.1, -1.95, 2.7);
    railing(b, 1.45, 0.1, -1.95, 2.7);
    lamp(b, 0, 0.1, 1.25, 0.5);

    // Levels (D-100). Level 2: a timber clubhouse with changing rooms and a viewing terrace on its roof, beside a
    // scoreboard; the stand gains a fourth row.
    const clubhouse = () => {
      b.add({ piece: 'timberBox', p: [0, 0.1, -1.55], s: [0.5, 0.55, 0.6], tint: 0xb48a62 });
      b.add({ piece: 'glassBox', p: [0, 0.25, -1.24], s: [0.4, 0.3, 0.02], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'slab', p: [0, 0.65, -1.55], s: [0.6, 0.04, 0.7], tint: PALETTE.timber });
      railing(b, 0, 0.69, -1.22, 0.6);
      b.add({ piece: 'timberBox', p: [0, 0.1 + 3 * 0.18, 1.55 + 3 * 0.18], s: [5.2, 0.18, 0.2], tint: PALETTE.timber });
    };
    b.level(2, clubhouse);
    // Level 3: a membrane canopy over the stand on tall masts, flags along its edge, and a running track painted
    // round both pitches.
    b.level(3, () => {
      clubhouse();
      for (const x of [-2.5, 0, 2.5]) b.add({ piece: 'timberBox', p: [x, 1.05, 2.0], s: [0.07, 1.0, 0.07], tint: TRIM.steel });
      for (const x of [-1.3, 1.3]) b.add({ piece: 'solarLeaf', p: [x, 1.95, 1.95], s: [2.8, 1, 1.4], r: Math.PI / 2, rz: 0.2, tint: 0xf4f1ea });
      const FLAGS = [TRIM.red, 0xffd36b, TRIM.seaBlue, TRIM.teal, TRIM.orange] as const;
      for (let i = 0; i < 5; i++) b.add({ piece: 'slab', p: [-2.2 + i * 1.1, 2.15, 2.35], s: [0.22, 0.14, 0.01], tint: FLAGS[i]! });
      b.add({ piece: 'slab', p: [0, 0.12, -0.2], s: [5.75, 0.012, 3.35], tint: 0xc8714f });
    });
  },
});
