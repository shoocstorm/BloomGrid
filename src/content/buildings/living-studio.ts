import { defineBuilding } from '../types';
import { FLOOR, PALETTE, door, flowers, ivyEdge, lamp, planter, roofMeadow, solarArray } from '../kit';

export default defineBuilding({
  id: 'living-studio',
  name: 'Living Timber Studio',
  description:
    'Workspaces grown from shaped living timber and mycelium. Kinetic solar-leaf shutters follow the sun to keep every desk in daylight.',
  category: 'commercial',
  footprint: [3, 2],
  stats: { cost: 300, energy: -7, eco: 5, happiness: 4, population: 0, jobs: 55, pollution: 0, water: -4 },
  tower: true,
  growthTime: 80,
  recipe(b) {
    const floors = 3 + Math.floor(b.rand() * 2);
    const h = floors * FLOOR * 1.2;
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [2.9, 0.08, 1.9] });
    flowers(b, 0, 0.08, 0.8, 0.5, 10, 0, 0.5);
    b.add({ piece: 'glassBox', p: [0, 0.08, 0], s: [2.3, h, 1.4], tint: PALETTE.glassWarm });
    // Timber ribs and floor plates.
    for (let i = 0; i <= 4; i++) b.add({ piece: 'timberBox', p: [-1.2 + i * 0.6, 0.08, 0.72], s: [0.08, h, 0.08], tint: PALETTE.timber });
    for (let f = 1; f <= floors; f++) b.add({ piece: 'timberBox', p: [0, 0.08 + f * FLOOR * 1.2 - 0.04, 0], s: [2.45, 0.06, 1.55], tint: PALETTE.timber });
    // Solar-leaf shutters on the south face, tilted toward the sun.
    for (let f = 0; f < floors; f++)
      for (let i = 0; i < 5; i++)
        b.add({ piece: 'solarLeaf', p: [-1.05 + i * 0.52, 0.2 + f * FLOOR * 1.2, 0.78], s: [0.42, 1, 0.3], r: -Math.PI / 2, rz: 0.5, growAt: 0.1 + f * 0.1 });
    roofMeadow(b, 0.08 + h, 2.3, 1.4, 1);
    ivyEdge(b, 0, 0.08 + h, -0.72, 2.2, 0, -1, 6);
    // Detail (D-096): glazed doors and a timber porch on the front, a terrace with planters and benches, lamps,
    // and solar panels between the roof plantings.
    for (const x of [-0.6, 0.6]) door(b, x, 0.08, 0.72, 0.28, 0.34);
    b.add({ piece: 'timberBox', p: [0, 0.5, 0.92], s: [2.5, 0.05, 0.42], tint: PALETTE.timber });
    for (const x of [-1.2, 1.2]) b.add({ piece: 'timberBox', p: [x, 0.08, 1.08], s: [0.05, 0.42, 0.05], tint: PALETTE.timber });
    b.add({ piece: 'slab', p: [0, 0.08, 0.88], s: [2.7, 0.025, 0.3], tint: 0xe4dac8 });
    planter(b, -1.25, 0.08, 0.6, 0.3, 0.6, 0.15);
    planter(b, 1.25, 0.08, 0.6, 0.3, 0.6, 0.2);
    b.add({ piece: 'timberBox', p: [0, 0.08, 1.15], s: [0.5, 0.07, 0.12], tint: 0xa47c56 });
    lamp(b, -1.35, 0.08, 0.95);
    lamp(b, 1.35, 0.08, 0.95);
    solarArray(b, 0.6, 0.12 + h, -0.3, 0.9, 0.5, 1, 3, 0.4);
  },
});
