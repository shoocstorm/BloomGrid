import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

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
  },
});
