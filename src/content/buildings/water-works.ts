import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, door, flowers, grassTufts, lamp, louvres, railing } from '../kit';

export default defineBuilding({
  id: 'water-works',
  name: 'NEWater Reclamation Works',
  description: 'Draws from the sea or a reservoir and purifies it through reed beds and membrane tanks. Must touch water.',
  category: 'utility',
  footprint: [3, 2],
  stats: { cost: 350, energy: -12, eco: 1, happiness: 0, population: 0, jobs: 10, pollution: 0, water: 220 },
  growthTime: 110,
  placement: { nearWater: true },
  floodproof: true,
  recipe(b) {
    // (D-095) A treatment hall with a sawtooth glass roof, three membrane tanks on a catwalk, an intake pipe to
    // the sea (+z), and reed-bed polishing ponds stepping down beside it.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [2.9, 0.06, 1.9], tint: 0xd9d2c4 });
    // Hall: concrete base, timber cladding, a sawtooth roof of glass north-lights.
    const [hx, hz] = [-0.75, -0.2];
    b.add({ piece: 'slab', p: [hx, 0.06, hz], s: [1.3, 0.22, 1.3], tint: PALETTE.concrete });
    b.add({ piece: 'timberBox', p: [hx, 0.28, hz], s: [1.28, 0.38, 1.28], tint: 0xb48d63 });
    louvres(b, hx, 0.28, hz + 0.65, 1.2, 0.38, 12, false, 0x9a7552);
    for (let k = 0; k < 3; k++) {
      const z = hz - 0.43 + k * 0.43;
      b.add({ piece: 'slab', p: [hx, 0.66 + 0.11, z + 0.07], s: [1.3, 0.025, 0.32], rx: 0.6, tint: 0x6f8f7a });
      b.add({ piece: 'glassBox', p: [hx, 0.66, z - 0.1], s: [1.26, 0.2, 0.02], tint: 0xcfefff });
    }
    door(b, hx + 0.35, 0.28, hz + 0.66, 0.22, 0.26);
    b.add({ piece: 'slab', p: [hx - 0.25, 0.5, hz + 0.67], s: [0.42, 0.1, 0.015], tint: TRIM.seaBlue, glow: 0.5 });
    // Membrane tanks: glass drums with domed caps and steel bands, a catwalk over them and a ladder.
    for (let i = 0; i < 3; i++) {
      const z = -0.62 + i * 0.6;
      const h = 0.95;
      b.add({ piece: 'concreteCyl', p: [0.45, 0.06, z], s: [0.5, 0.1, 0.5], tint: PALETTE.concrete });
      b.add({ piece: 'glassCyl', p: [0.45, 0.16, z], s: [0.44, h, 0.44], tint: 0x9fd8ff, glow: 0.5 });
      for (const y of [0.4, 0.75]) b.add({ piece: 'concreteCyl', p: [0.45, 0.16 + y, z], s: [0.455, 0.03, 0.455], tint: TRIM.steel });
      b.add({ piece: 'dome', p: [0.45, 0.16 + h, z], s: [0.44, 0.22, 0.44], tint: 0xe9f4f6 });
    }
    b.add({ piece: 'slab', p: [0.45, 1.13, 0], s: [0.12, 0.03, 1.5], tint: TRIM.steel });
    railing(b, 0.52, 1.16, 0, 1.5, true, 0.08);
    for (let k = 0; k < 6; k++) b.add({ piece: 'timberBox', p: [0.2, 0.08 + k * 0.17, 0.88], s: [0.08, 0.015, 0.02], tint: TRIM.steel });
    for (const x of [0.16, 0.24]) b.add({ piece: 'timberBox', p: [x, 0.06, 0.88], s: [0.015, 1.08, 0.015], tint: TRIM.steel });
    // Intake: a pipe from the tanks out over the sea edge to a pump head.
    beam(b, 'concreteCyl', [0.45, 0.25, 0.3], [0.45, 0.25, 1.45], 0.09, { tint: TRIM.seaBlue });
    beam(b, 'concreteCyl', [-0.1, 0.35, -0.2], [0.25, 0.35, -0.2], 0.07, { tint: TRIM.seaBlue });
    b.add({ piece: 'concreteCyl', p: [0.45, -0.2, 1.45], s: [0.18, 0.5, 0.18], tint: PALETTE.concrete });
    b.add({ piece: 'concreteCyl', p: [0.45, 0.3, 1.45], s: [0.2, 0.06, 0.2], tint: TRIM.seaBlue });
    // Reed-bed ponds stepping down along the sea side.
    for (let k = 0; k < 2; k++) {
      const z = -0.45 + k * 0.9;
      b.add({ piece: 'slab', p: [1.15, 0.06, z], s: [0.62, 0.06 + (1 - k) * 0.06, 0.8], tint: 0xc9c0ae });
      b.add({ piece: 'pool', p: [1.15, 0.12 + (1 - k) * 0.06, z], s: [0.54, 0.02, 0.72] });
      grassTufts(b, 1.15, 0.13 + (1 - k) * 0.06, z, 0.5, 0.7, 10, 0.1);
      flowers(b, 1.15, 0.14 + (1 - k) * 0.06, z, 0.25, 4, 0.2, 0.7);
    }
    b.add({ piece: 'waterfall', p: [1.15, 0.12, 0.0], s: [0.3, 0.07, 1], tint: 0xbfefff });
    lamp(b, -1.4, 0.06, 0.88);
  },
});
