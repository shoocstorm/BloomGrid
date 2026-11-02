import { defineBuilding } from '../types';
import { PALETTE, TRIM, barrel, crate, door, grassTufts, ivyEdge, lamp, railing, roofMeadow } from '../kit';

/** Shell colours on the drying racks and the mortar caps (the five kinds the factory makes). */
const SHELLS = [0xff6a8a, 0xffc94a, 0x7ff7e6, 0xc9b6ff, 0xfff4f0] as const;

export default defineBuilding({
  id: 'fireworks-factory',
  name: 'Fireworks Factory',
  description:
    'A timber pyrotechnics works with a bermed magazine and a launch yard of mortar racks. Turns paper, salts and plant resins into peony, willow, halo, palm and crackle shells, and fires a show over the city every night. Delights residents, draws visitors; the smoke and the occasional stray spark are the price.',
  category: 'industry',
  footprint: [5, 4],
  // Upkeep below the 0.03%-of-cost default: a working business whose staff pay tax; shells cost materials.
  stats: {
    cost: 1300,
    energy: -20,
    eco: -1,
    happiness: 0,
    population: 0,
    jobs: 90,
    pollution: 3,
    water: -3,
    upkeep: 0.2,
  },
  interact: { off: 'Pause production', on: 'Resume production', help: 'Paused: no shells made (and no material costs); the staff go home.' },
  growthTime: 140,
  fireworks: { rate: 6, storage: 120 },
  variants: 2,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [4.8, 0.12, 3.8], tint: PALETTE.concrete });
    grassTufts(b, 1.6, 0.12, -1.3, 1.2, 0.8, 6);
    // Workshop hall: timber with a meadow roof and lantern-lit doors.
    b.add({ piece: 'timberBox', p: [-1.1, 0.12, -0.55], s: [2.4, 1.3, 2.4], tint: PALETTE.timber });
    b.upTo(1, () => roofMeadow(b, 1.42, 2.4, 2.4));
    b.add({ piece: 'slab', p: [-1.1, 0.12, 0.66], s: [1.0, 0.8, 0.04], tint: 0xd8463a, glow: 0.25 });
    b.add({ piece: 'lumenRib', p: [-1.1, 1.0, 0.7], s: [1.4, 0.08, 0.05], glow: 0.9, tint: 0xffc94a });
    ivyEdge(b, -1.1, 1.4, -1.76, 2.2, 0, -1, 5);
    // Bermed magazine: a low drum under a grass dome, kept apart from the hall.
    b.add({ piece: 'concreteCyl', p: [1.5, 0.12, -1.0], s: [1.4, 0.7, 1.4], tint: 0xdcd5c6 });
    b.add({ piece: 'dome', p: [1.5, 0.82, -1.0], s: [1.4, 0.8, 1.4], tint: 0x7ccf7a });
    // Drying racks of finished shells.
    for (let i = 0; i < 5; i++) {
      b.add({
        piece: 'timberBox',
        p: [-2.0 + i * 0.45, 0.12, 1.45],
        s: [0.06, 0.7, 0.06],
        tint: PALETTE.bark,
      });
      for (let k = 0; k < 2; k++)
        b.add({
          piece: 'concreteCyl',
          p: [-2.0 + i * 0.45, 0.35 + k * 0.28, 1.45],
          s: [0.2, 0.2, 0.2],
          tint: SHELLS[(i + k) % SHELLS.length],
          glow: 0.5,
        });
    }
    // Launch yard: mortar racks tilted toward the sky, coloured caps glowing at night.
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 2; k++) {
        const x = 0.75 + i * 0.5;
        const z = 0.75 + k * 0.55;
        b.add({
          piece: 'concreteCyl',
          p: [x, 0.12, z],
          s: [0.26, 0.7, 0.26],
          rz: (i - 1) * 0.18,
          tint: 0x3a4a48,
        });
        b.add({
          piece: 'lumenRib',
          p: [x - (i - 1) * 0.12, 0.8, z],
          s: [0.18, 0.05, 0.18],
          glow: 1,
          tint: SHELLS[(i * 2 + k) % SHELLS.length],
        });
      }
    // Safety beacon mast over the yard.
    b.upTo(2, () => {
      b.add({ piece: 'timberBox', p: [2.15, 0.12, 1.6], s: [0.12, 2.4, 0.12], tint: PALETTE.bark });
      b.add({ piece: 'haloRing', p: [2.15, 2.5, 1.6], s: [0.5, 2, 0.5], glow: 1 });
    });
    // Detail (D-097): a hazard-striped steel door into the magazine berm, a railed launch yard on a gravel pad,
    // a shell-coloured sign over the hall, red sand barrels, crates of packed shells and yard lamps.
    b.add({ piece: 'slab', p: [1.5, 0.12, -0.31], s: [0.5, 0.5, 0.04], tint: TRIM.steel });
    for (let k = 0; k < 4; k++) b.add({ piece: 'slab', p: [1.29 + k * 0.14, 0.62, -0.29], s: [0.07, 0.06, 0.02], tint: k % 2 ? TRIM.charcoal : 0xffc94a });
    b.add({ piece: 'slab', p: [1.25, 0.12, 1.02], s: [1.7, 0.02, 1.25], tint: 0xb9b2a4 });
    railing(b, 1.25, 0.12, 0.4, 1.7);
    railing(b, 0.4, 0.12, 1.02, 1.25, true);
    railing(b, 2.1, 0.12, 0.75, 0.7, true);
    b.add({ piece: 'slab', p: [-1.1, 1.08, 0.67], s: [1.5, 0.28, 0.03], tint: TRIM.charcoal });
    for (let i = 0; i < 5; i++) b.add({ piece: 'concreteCyl', p: [-1.6 + i * 0.25, 1.15, 0.69], s: [0.12, 0.12, 0.02], rx: Math.PI / 2, tint: SHELLS[i]!, glow: 1 });
    door(b, -2.31, 0.12, -0.55, 0.3, 0.42, true);
    for (const z of [1.15, 1.55]) barrel(b, 2.25, 0.12, z - 0.5, 0.13, TRIM.red);
    crate(b, -0.2, 0.12, 0.9, 0.22, 0.2, 0xc9a06a);
    crate(b, -0.25, 0.3, 0.9, 0.18, -0.1, 0xb48d5a);
    crate(b, 0.05, 0.12, 1.2, 0.2, 0.5, 0xc9a06a);
    lamp(b, -2.3, 0.12, 1.75, 0.6);
    lamp(b, 0.3, 0.12, -1.75, 0.6);

    // Levels (D-100). Level 2: the hall roof becomes a launch terrace: a railed deck with a battery of mortar
    // tubes, each capped with a shell colour, and a meadow strip along its back.
    const terrace = () => {
      b.add({ piece: 'slab', p: [-1.1, 1.42, -0.55], s: [2.4, 0.05, 2.4], tint: 0xb9b2a4 });
      b.add({ piece: 'mossBox', p: [-1.1, 1.47, -1.45], s: [2.3, 0.05, 0.5] });
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 3; k++) {
          const [x, z] = [-1.95 + i * 0.55, -0.85 + k * 0.5];
          b.add({ piece: 'concreteCyl', p: [x, 1.47, z], s: [0.18, 0.4, 0.18], rz: (i - 1.5) * 0.08, tint: 0x3a4a48 });
          b.add({ piece: 'lumenRib', p: [x, 1.88, z], s: [0.14, 0.04, 0.14], tint: SHELLS[(i + k) % SHELLS.length], glow: 1 });
        }
      for (const z of [-1.72, 0.62]) railing(b, -1.1, 1.47, z, 2.36);
      railing(b, -2.28, 1.47, -0.55, 2.36, true);
    };
    b.level(2, terrace);
    // Level 3: a launch gantry tower replaces the signal pole: a lattice with light rings, a starburst of
    // shell-coloured petals at its head, and a second magazine dome.
    b.level(3, () => {
      terrace();
      const [x, z] = [2.15, 1.55];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [x + sx * 0.18, 0.12, z + sz * 0.18], s: [0.05, 3.6, 0.05], tint: PALETTE.bark });
      for (let k = 0; k < 5; k++) b.add({ piece: 'haloRing', p: [x, 0.7 + k * 0.7, z], s: [0.55, 2, 0.55], tint: SHELLS[k], glow: 1 });
      for (let k = 0; k < 8; k++) b.add({ piece: 'sunPetal', p: [x, 3.8, z], s: [0.6, 1, 0.35], r: (k / 8) * Math.PI * 2, rz: 0.9, tint: SHELLS[k % SHELLS.length], glow: 1 });
      b.add({ piece: 'concreteCyl', p: [0.55, 0.12, -1.35], s: [0.75, 0.4, 0.75], tint: 0xdcd5c6 });
      b.add({ piece: 'dome', p: [0.55, 0.52, -1.35], s: [0.75, 0.5, 0.75], tint: 0x7ccf7a });
    });
  },
});
