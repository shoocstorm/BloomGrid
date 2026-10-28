import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

/** Top of the tower (tiles above the plinth): the wind module mounts the nacelle and rotor here (D-047). */
export const TURBINE_TOP = 11.3;

export default defineBuilding({
  id: 'wind-turbine',
  name: 'Breeze Turbine',
  description:
    'A slender three-blade wind turbine on a wildflower plinth. Cheap, clean and quick to raise: line a breezy coast or ridge with them to run the city on the sea wind.',
  category: 'energy',
  footprint: [2, 2],
  // Low upkeep: wind is the cheapest power to run per unit (0.0013 ◈/s per energy vs solar's 0.0017).
  stats: { cost: 700, energy: 55, eco: 2, happiness: 2, population: 0, jobs: 2, pollution: 0, upkeep: 0.07 },
  growthTime: 90,
  cleanEnergy: true,
  // Turbines stay white in every district (styles recolour neutral tints).
  style: 'classic',
  variants: 2,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [1.7, 0.28, 1.7], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.28, 0], s: [1.2, 0.06, 1.2], r: Math.PI / 4 });
    grassTufts(b, 0, 0.34, 0, 1.6, 1.6, 14);
    flowers(b, 0, 0.34, 0, 0.85, 10, 0, 0.5);
    // Solar petals skirt the foot of the tower.
    for (let k = 0; k < 4; k++)
      b.add({
        piece: 'solarLeaf',
        p: [0, 0.4, 0],
        s: [0.75, 1, 0.7],
        r: (k / 4) * Math.PI * 2 + 0.4,
        rz: 0.35,
      });
    // Tapered tower in three sections and a service ring with a light band. The nacelle and rotor are drawn
    // by the wind module so every turbine faces the prevailing wind, whatever its lot's rotation.
    b.add({ piece: 'concreteCyl', p: [0, 0.3, 0], s: [0.56, 4.2, 0.56], tint: 0xf7f5ee });
    b.add({ piece: 'concreteCyl', p: [0, 4.5, 0], s: [0.46, 4.0, 0.46], tint: 0xf7f5ee });
    b.add({ piece: 'concreteCyl', p: [0, 8.5, 0], s: [0.38, 2.8, 0.38], tint: 0xf7f5ee });
    b.add({ piece: 'lumenRib', p: [0, 4.3, 0], s: [0.62, 0.12, 0.62], glow: 0.7 });
    b.add({ piece: 'concreteCyl', p: [0, 11.25, 0], s: [0.5, 0.12, 0.5], tint: PALETTE.concrete });
  },
});
