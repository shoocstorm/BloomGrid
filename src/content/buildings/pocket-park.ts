import { defineBuilding } from '../types';
import { TRIM, awning, flowers, gableRoof, grassTufts, lamp, tree } from '../kit';

export default defineBuilding({
  id: 'pocket-park',
  name: 'Bloom Park',
  description: 'A wildflower meadow with a lily pond and paths of glowing fungi that light up at night.',
  category: 'nature',
  footprint: [2, 2],
  stats: { cost: 60, energy: 0, eco: 8, happiness: 6, population: 0, jobs: 1, pollution: -2, water: -1 },
  growthTime: 70,
  pollinators: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.96, 0.06, 1.96] });
    b.add({ piece: 'pool', p: [0.35, 0.06, -0.3], s: [0.8, 0.02, 0.7] });
    grassTufts(b, 0, 0.06, 0, 1.8, 1.8, 26);
    flowers(b, -0.3, 0.06, 0.3, 0.6, 28, 0, 0.8);
    tree(b, -0.55, 0.06, -0.5, 0.6, 0.1);
    tree(b, 0.6, 0.06, 0.6, 0.45, 0.3);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      b.add({ piece: 'fungus', p: [-0.9 + t * 1.6, 0.06, 0.9 - t * 0.5 + Math.sin(t * 6) * 0.1], s: b.range(0.06, 0.1), tint: 0xbff6ff, glow: 1, growAt: 0.2 + t * 0.4 });
    }
    // Detail (D-095): a winding gravel path, stepping stones across the pond, two benches, a little timber
    // gazebo with a pitched roof, and lamps.
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      b.add({ piece: 'slab', p: [-0.85 + t * 1.7, 0.06, 0.55 - t * 0.2 + Math.sin(t * 5) * 0.18], s: [0.26, 0.015, 0.22], r: Math.sin(t * 5) * 0.4, tint: 0xe6dcc8 });
    }
    for (let k = 0; k < 3; k++) b.add({ piece: 'concreteCyl', p: [0.1 + k * 0.22, 0.06, -0.3 + (k % 2) * 0.08], s: [0.13, 0.03, 0.13], tint: 0xd8d0c0 });
    for (const [x, z, r] of [
      [-0.2, 0.82, 0],
      [0.65, 0.1, Math.PI / 2],
    ] as const) {
      b.add({ piece: 'timberBox', p: [x, 0.13, z], s: [0.32, 0.03, 0.1], r, tint: 0xa47c56 });
      b.add({ piece: 'timberBox', p: [x, 0.06, z], s: [0.28, 0.07, 0.03], r, tint: TRIM.charcoal });
    }
    const [gx, gz] = [-0.55, -0.1];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [gx + sx * 0.2, 0.06, gz + sz * 0.2], s: [0.035, 0.34, 0.035], tint: TRIM.cream });
    b.add({ piece: 'slab', p: [gx, 0.06, gz], s: [0.5, 0.03, 0.5], tint: 0xc9a06a });
    gableRoof(b, gx, 0.4, gz, 0.46, 0.46, { pitch: 0.7, tint: 0x6f9a6a });
    lamp(b, 0.85, 0.06, 0.85, 0.45);
    lamp(b, -0.9, 0.06, 0.45, 0.45);

    // Levels (D-100). Level 2: a little café kiosk with a striped awning and two bistro tables by the pond.
    b.level(2, () => {
      b.add({ piece: 'timberBox', p: [0.55, 0.06, -0.78], s: [0.5, 0.36, 0.3], tint: 0xb48a62 });
      b.add({ piece: 'glassBox', p: [0.55, 0.16, -0.62], s: [0.36, 0.14, 0.02], tint: 0xfff2c8, glow: 0.6 });
      awning(b, 0.55, 0.45, -0.55, 0.56, 0.2, 0xf5efe4, TRIM.terracotta, 4);
      for (const x of [0.05, 0.85]) {
        b.add({ piece: 'concreteCyl', p: [x, 0.06, 0.2], s: [0.03, 0.18, 0.03], tint: TRIM.charcoal });
        b.add({ piece: 'concreteCyl', p: [x, 0.24, 0.2], s: [0.16, 0.015, 0.16], tint: TRIM.cream });
      }
    });
    // Level 3: the gazebo becomes a bandstand (a lit dome over a round deck), with a fountain jet in the pond and
    // a rose arch over the path.
    b.level(3, () => {
      b.add({ piece: 'concreteCyl', p: [gx, 0.06, gz], s: [0.62, 0.04, 0.62], tint: 0xe9e1d0 });
      b.add({ piece: 'dome', p: [gx, 0.58, gz], s: [0.5, 0.3, 0.5], tint: 0x6f9a6a });
      b.add({ piece: 'haloRing', p: [gx, 0.4, gz], s: [0.56, 2, 0.56], tint: 0xffd9a0, glow: 0.9 });
      b.add({ piece: 'lumenRib', p: [0.35, 0.08, -0.3], s: [0.03, 0.35, 0.03], tint: 0x9ee6ff, glow: 0.9 });
      b.add({ piece: 'willowArch', p: [0.05, 0.06, 0.48], s: [0.42, 0.5, 0.42], r: 0.2, tint: 0x6b4f3a });
      flowers(b, 0.05, 0.06, 0.48, 0.22, 5, 0.1, 0.6);
    });
  },
});
