import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, flowers, grassTufts, lamp, tree } from '../kit';

/**
 * Street-level concourse of an Aeroline station. The platform overhead and the two Bloom Helix towers that climb
 * to it (spiral walkways round glass lifts, at x = ±2.1, z = +0.9 here) are drawn by the aeroline module; this
 * recipe leaves their round plazas clear and puts the ticket hall between them, opening onto the street (-z).
 */
export default defineBuilding({
  id: 'aeroline-station',
  name: 'Aeroline Station',
  description:
    'Concourse of the Aeroline, the island’s solar maglev loop: two Bloom Helix towers, planted spiral walkways wound round glass lifts, climb to a canopied platform above the street, where silent trains glide through. Takes commuters from a wide radius off the highways.',
  category: 'utility',
  footprint: [6, 4],
  stats: { cost: 2600, energy: -30, eco: 2, happiness: 8, population: 0, jobs: 24, pollution: 0 },
  growthTime: 60,
  variants: 1,
  requires: 'aeroline',
  transit: { radius: 26, riders: 2200, rail: true },
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.9, 0.1, 3.9], tint: 0xe9e2d0 });
    // Street-side forecourt: a moss strip with flowers and benches under the platform edge.
    b.add({ piece: 'mossBox', p: [0, 0.1, -1.6], s: [2.0, 0.06, 0.5] });
    grassTufts(b, 0, 0.16, -1.6, 1.9, 0.4, 10);
    flowers(b, 0, 0.16, -1.6, 0.8, 12, 0, 0.6);
    b.add({ piece: 'timberBox', p: [-0.8, 0.1, -1.15], s: [0.7, 0.12, 0.18], tint: PALETTE.timber });
    b.add({ piece: 'timberBox', p: [0.8, 0.1, -1.15], s: [0.7, 0.12, 0.18], tint: PALETTE.timber });
    // Ticket hall between the towers, under a leaf-shaped solar roof, with a lit lintel over its doors.
    b.add({ piece: 'glassBox', p: [0, 0.1, 0.6], s: [1.9, 0.9, 1.6], tint: PALETTE.glass, glow: 0.3 });
    b.add({ piece: 'slab', p: [0, 1.0, 0.6], s: [2.3, 0.06, 2.0], tint: PALETTE.concrete });
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'solarLeaf', p: [0, 1.06, 0.6], s: [1.3, 1, 0.9], r: (i / 6) * Math.PI * 2, rz: 0.18 });
    b.add({ piece: 'lumenRib', p: [0, 0.98, -0.42], s: [2.1, 0.05, 0.05], glow: 0.9 });
    tree(b, -2.6, 0.1, -1.6, 0.5, 0.2);
    tree(b, 2.6, 0.1, -1.6, 0.5, 0.3);
    // Street side (D-097; the forecourt faces -z): glazed doors under the lit lintel, a departures pillar, ticket
    // machines, a bike rack and lamps along the kerb.
    b.add({ piece: 'slab', p: [0, 0.1, -0.22], s: [1.0, 0.6, 0.04], tint: TRIM.charcoal });
    for (const x of [-0.24, 0.24])
      b.add({ piece: 'glassBox', p: [x, 0.1, -0.25], s: [0.44, 0.55, 0.02], tint: 0xcfefff, glow: 0.5 });
    b.add({ piece: 'slab', p: [1.6, 0.1, -1.1], s: [0.16, 0.95, 0.16], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [1.6, 0.55, -1.19], s: [0.13, 0.4, 0.01], tint: 0xffd36b, glow: 1 });
    for (const x of [-1.6, -1.35]) {
      b.add({ piece: 'slab', p: [x, 0.1, -0.5], s: [0.18, 0.4, 0.12], tint: TRIM.teal });
      b.add({ piece: 'slab', p: [x, 0.38, -0.565], s: [0.12, 0.08, 0.01], tint: 0x7ff7e6, glow: 0.8 });
    }
    for (let i = 0; i < 4; i++)
      b.add({
        piece: 'willowArch',
        p: [2.0 + i * 0.16, 0.1, -1.6],
        s: [0.14, 0.2, 0.02],
        r: Math.PI / 2,
        tint: TRIM.steel,
      });
    for (const x of [-2.6, -1.3, 1.3, 2.6]) lamp(b, x, 0.1, -1.85, 0.6);

    // Levels (D-100): the line runs over this lot, so a station grows sideways and stays low. Level 2: a bike-share
    // dock with a green roof, and a kiosk under a striped awning by the doors.
    const bikes = () => {
      b.add({ piece: 'slab', p: [-2.3, 0.1, 0.9], s: [1.0, 0.03, 1.6], tint: 0xd8d0c0 });
      for (let k = 0; k < 5; k++) b.add({ piece: 'willowArch', p: [-2.3, 0.1, 0.3 + k * 0.3], s: [0.5, 0.3, 0.03], tint: TRIM.teal });
      for (const z of [0.15, 1.65]) b.add({ piece: 'timberBox', p: [-2.75, 0.1, z], s: [0.04, 0.7, 0.04], tint: PALETTE.timber });
      b.add({ piece: 'mossBox', p: [-2.35, 0.8, 0.9], s: [1.0, 0.05, 1.7] });
    };
    b.level(2, () => {
      bikes();
      b.add({ piece: 'timberBox', p: [1.3, 0.1, -0.5], s: [0.5, 0.42, 0.34], tint: 0xb48a62 });
      awning(b, 1.3, 0.62, -0.75, 0.6, 0.22, 0xf5efe4, TRIM.orange, 4);
    });
    // Level 3: a glazed waiting pavilion on the east side with a station clock on a pillar and a planted roof.
    b.level(3, () => {
      bikes();
      b.add({ piece: 'timberBox', p: [1.3, 0.1, -0.5], s: [0.5, 0.42, 0.34], tint: 0xb48a62 });
      awning(b, 1.3, 0.62, -0.75, 0.6, 0.22, 0xf5efe4, TRIM.orange, 4);
      b.add({ piece: 'glassBox', p: [2.2, 0.1, 0.9], s: [1.1, 0.7, 1.4], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'mossBox', p: [2.2, 0.8, 0.9], s: [1.2, 0.05, 1.5] });
      flowers(b, 2.2, 0.85, 0.9, 0.45, 6, 0.1, 0.6);
      b.add({ piece: 'slab', p: [-1.6, 0.1, -1.1], s: [0.12, 1.0, 0.12], tint: TRIM.charcoal });
      b.add({ piece: 'concreteCyl', p: [-1.6, 1.12, -1.1], s: [0.3, 0.3, 0.3], rx: Math.PI / 2, tint: TRIM.cream, glow: 0.6 });
    });
  },
});
