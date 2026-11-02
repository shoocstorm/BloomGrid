import { defineBuilding } from '../types';
import { PALETTE, TRIM, door, flowers, grassTufts, railRing } from '../kit';

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
  interact: { off: 'Feather the blades', on: 'Release the blades', help: 'Turned out of the wind: no power, but storms barely touch it (lightning seeks it far less).' },
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
    // A service door at the tower's foot (D-097).
    door(b, 0, 0.34, 0.29, 0.14, 0.26);

    // Levels (D-100): the rotor and nacelle are posed by the wind module, so levels dress the foot and the shaft.
    // Level 2: a battery store (a timber hut with a solar roof) and a wider ring of solar petals round the base.
    const store = () => {
      b.add({ piece: 'timberBox', p: [0.55, 0.28, -0.5], s: [0.42, 0.3, 0.3], tint: 0xb48d63 });
      b.add({ piece: 'slab', p: [0.55, 0.6, -0.5], s: [0.48, 0.025, 0.36], rx: -0.25, tint: TRIM.pv, glow: 0.15 });
      for (let r = 0; r < 2; r++) b.add({ piece: 'lumenRib', p: [0.55, 0.36 + r * 0.08, -0.34], s: [0.3, 0.02, 0.01], tint: 0x8fd35a, glow: 0.8 });
    };
    b.level(2, () => {
      store();
      for (let k = 0; k < 6; k++) b.add({ piece: 'solarLeaf', p: [0, 0.36, 0], s: [0.85, 1, 0.55], r: (k / 6) * Math.PI * 2 + 0.9, rz: 0.22 });
    });
    // Level 3: a lookout balcony rings the shaft, with aviation lights up the tower and a lit band at the hub.
    b.level(3, () => {
      store();
      b.add({ piece: 'concreteCyl', p: [0, 6.6, 0], s: [1.1, 0.06, 1.1], tint: 0xe9eee8 });
      railRing(b, 0, 6.66, 0, 0.53, 14, 0.1);
      for (const y of [3.2, 8.2, 10.9]) b.add({ piece: 'lumenRib', p: [0, y, 0], s: [0.5, 0.05, 0.5], tint: 0xff6a5a, glow: 1 });
    });
  },
});
