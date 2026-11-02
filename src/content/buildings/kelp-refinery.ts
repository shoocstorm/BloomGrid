import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, TRIM, barrel, beam, door, grassTufts, lamp, tree } from '../kit';

export default defineBuilding({
  id: 'kelp-refinery',
  name: 'Kelp Bioplastic Refinery',
  description:
    'Ferments farmed kelp in glowing towers and domed digesters into compostable plastics for the whole island. Its effluent needs Phyto Garden reed beds to run clean.',
  category: 'industry',
  footprint: [5, 5],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax.
  stats: {
    cost: 1100,
    energy: -35,
    eco: -2,
    happiness: -1,
    population: 0,
    jobs: 180,
    pollution: 4,
    water: -20,
    upkeep: 0.18,
  },
  growthTime: 150,
  symbiosis: {
    partners: ['phyto-garden'],
    radius: 8,
    pollutionMul: 0.25,
    outputMul: 1.15,
    label: 'phyto-garden reed beds polish its effluent',
  },
  variants: 2,
  recipe(b: KitBuilder) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 4.8], tint: PALETTE.concrete });
    grassTufts(b, 0, 0.12, 0, 4.4, 4.4, 30);
    // Two rows of kelp fermentation towers.
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 3; i++) {
        const [x, z] = [-1.5 + i * 1.0, -1.4 + r * 1.0];
        b.add({ piece: 'algaeTank', p: [x, 0.12, z], s: [0.7, b.range(2.0, 2.8), 0.7], glow: 1 });
        b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.8, 0.2, 0.8], tint: PALETTE.concrete });
      }
    // Domed digesters and the pipes feeding them.
    for (const x of [-0.9, 1.0]) {
      b.add({ piece: 'concreteCyl', p: [x, 0.12, 1.3], s: [1.6, 0.5, 1.6], tint: 0xe6efe6 });
      b.add({ piece: 'dome', p: [x, 0.62, 1.3], s: [1.6, 1.4, 1.6], tint: 0xbfe8d8 });
      beam(b, 'lumenRib', [x, 1.2, 1.3], [x - 0.4, 2.0, -0.4], 0.1, { glow: 0.8 });
    }
    // Control hall with a living roof.
    b.add({ piece: 'slab', p: [1.6, 0.12, -1.0], s: [1.4, 1.2, 2.2], tint: PALETTE.concrete });
    const roof = (y: number) => {
      b.add({ piece: 'mossBox', p: [1.6, y, -1.0], s: [1.45, 0.08, 2.25] });
      tree(b, 1.6, y + 0.08, -1.0, 0.45, 0.4);
    };
    b.upTo(1, () => roof(1.32));
    beam(b, 'concreteCyl', [-2.0, 1.6, -1.4], [0.9, 1.6, -1.4], 0.14, { tint: 0xd8dfd6 });
    // Detail (D-097): a steel catwalk with rails along the tank tops, ladders, pipe trestles, kelp drying lines,
    // a door, window band and lit sign on the control hall, drums of finished resin and yard lamps.
    b.add({ piece: 'slab', p: [-0.5, 2.0, -0.9], s: [2.6, 0.04, 0.3], tint: TRIM.steel });
    for (const x of [-1.8, 0.8])
      b.add({ piece: 'timberBox', p: [x, 0.12, -0.9], s: [0.05, 1.9, 0.05], tint: TRIM.steel });
    for (const z of [-1.04, -0.76])
      b.add({ piece: 'timberBox', p: [-0.5, 2.18, z], s: [2.6, 0.02, 0.02], tint: TRIM.orange });
    for (const x of [-1.5, -0.5, 0.5])
      for (let r = 0; r < 9; r++)
        b.add({
          piece: 'slab',
          p: [x + 0.38, 0.25 + r * 0.2, -1.4],
          s: [0.12, 0.015, 0.03],
          tint: TRIM.steel,
        });
    for (const x of [-1.6, 0.6]) {
      b.add({ piece: 'timberBox', p: [x, 0.12, -1.4], s: [0.06, 1.5, 0.06], tint: TRIM.steel });
      b.add({ piece: 'timberBox', p: [x, 1.5, -1.4], s: [0.06, 0.06, 0.4], tint: TRIM.steel });
    }
    for (let i = 0; i < 3; i++) {
      const z = 0.25 + i * 0.3;
      b.add({ piece: 'timberBox', p: [-2.2, 0.12, z], s: [0.04, 0.55, 0.04], tint: PALETTE.bark });
      b.add({ piece: 'timberBox', p: [-1.3, 0.12, z], s: [0.04, 0.55, 0.04], tint: PALETTE.bark });
      b.add({ piece: 'timberBox', p: [-1.75, 0.66, z], s: [0.92, 0.015, 0.015], tint: TRIM.rope });
      for (let k = 0; k < 5; k++)
        b.add({ piece: 'ivy', p: [-2.1 + k * 0.17, 0.66, z], s: [0.08, 0.32, 1], tint: 0x5f7f3a });
    }
    door(b, 0.89, 0.12, -0.6, 0.26, 0.4, true);
    b.add({ piece: 'glassBox', p: [0.89, 0.8, -1.2], s: [0.02, 0.24, 0.9], tint: 0xd6f2ee, glow: 0.3 });
    b.add({ piece: 'slab', p: [1.6, 1.0, 0.11], s: [1.0, 0.2, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [1.6, 1.04, 0.13], s: [0.82, 0.1, 0.01], tint: 0x7ff7e6, glow: 0.8 });
    for (let i = 0; i < 4; i++)
      barrel(b, 1.95 + (i % 2) * 0.28, 0.12, 0.45 + Math.floor(i / 2) * 0.3, 0.13, 0x2f8f86);
    lamp(b, 2.3, 0.12, 2.25, 0.6);
    lamp(b, -2.3, 0.12, 2.25, 0.6);

    // Levels (D-100). Level 2: a glass lab storey on the office block (its roof garden lifted on top) and a
    // third digester dome on the street side.
    const lab = () => {
      b.add({ piece: 'glassBox', p: [1.6, 1.32, -1.0], s: [1.3, 0.62, 2.1], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'slab', p: [1.6, 1.94, -1.0], s: [1.45, 0.06, 2.25], tint: PALETTE.concrete });
    };
    b.level(2, () => {
      lab();
      b.upTo(2, () => roof(2.0));
      b.add({ piece: 'concreteCyl', p: [2.0, 0.12, 1.75], s: [0.9, 0.3, 0.9], tint: 0xe6efe6 });
      b.add({ piece: 'dome', p: [2.0, 0.42, 1.75], s: [0.9, 0.8, 0.9], tint: 0xbfe8d8 });
    });
    // Level 3: a spray-drying tower rises between the tanks and domes (lit glass bands, a halo and a steam cowl),
    // and the lab roof carries a sea-green wind sail.
    b.level(3, () => {
      lab();
      roof(2.0);
      b.add({ piece: 'concreteCyl', p: [2.0, 0.12, 1.75], s: [0.9, 0.3, 0.9], tint: 0xe6efe6 });
      b.add({ piece: 'dome', p: [2.0, 0.42, 1.75], s: [0.9, 0.8, 0.9], tint: 0xbfe8d8 });
      b.add({ piece: 'concreteCyl', p: [0.05, 0.12, 0.35], s: [0.6, 3.6, 0.6], tint: 0xe6efe6 });
      for (const y of [1.0, 1.9, 2.8]) b.add({ piece: 'glassCyl', p: [0.05, y, 0.35], s: [0.64, 0.25, 0.64], tint: 0x7ff7e6, glow: 0.8 });
      b.add({ piece: 'dome', p: [0.05, 3.72, 0.35], s: [0.62, 0.4, 0.62], tint: TRIM.steel });
      b.add({ piece: 'haloRing', p: [0.05, 3.5, 0.35], s: [0.9, 2, 0.9], tint: 0x7ff7e6, glow: 1 });
      beam(b, 'concreteCyl', [0.05, 2.4, 0.35], [-0.5, 2.0, -0.4], 0.09, { tint: 0xd8dfd6 });
      b.add({ piece: 'solarLeaf', p: [1.6, 2.1, -1.4], s: [0.9, 1, 1.3], r: 0.4, rz: -0.5, tint: 0x9fe6d0 });
    });
  },
});
