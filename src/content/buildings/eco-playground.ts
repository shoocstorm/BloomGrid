import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, bench, flowers, gableRoof, grassTufts, tree } from '../kit';

export default defineBuilding({
  id: 'eco-playground',
  name: 'Willow Eco-Playground',
  description: 'Woven willow tunnels and bouncy moss pads where children play under soft air-current guards. Families love living nearby.',
  category: 'nature',
  footprint: [3, 3],
  stats: { cost: 110, energy: 0, eco: 6, happiness: 9, population: 0, jobs: 2, pollution: -1, water: -2 },
  growthTime: 70,
  pollinators: 0.5,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [2.94, 0.06, 2.94] });
    grassTufts(b, 0, 0.06, 0, 2.7, 2.7, 30);
    // Bouncy moss pads.
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'mossBox', p: [b.range(-1, 1), 0.06, b.range(-1, 1)], s: [b.range(0.35, 0.6), 0.12, b.range(0.35, 0.6)], r: b.rand() * 3 });
    // A willow tunnel of arches.
    for (let i = 0; i < 5; i++)
      b.add({ piece: 'willowArch', p: [-0.6 + i * 0.3, 0.06, -0.7], s: [1.1, 1.2, 1.1], r: Math.PI / 2, tint: 0x9cbf5a, growAt: 0.1 + i * 0.08 });
    b.add({ piece: 'willowArch', p: [0.8, 0.06, 0.6], s: [1.4, 1.4, 1.4], tint: 0x8fae4a, growAt: 0.3 });
    b.add({ piece: 'pool', p: [-0.6, 0.06, 0.7], s: [0.9, 0.02, 0.6] });
    flowers(b, 0.4, 0.06, 0.1, 1.1, 30, 0, 0.8);
    tree(b, 1.1, 0.06, -1.1, 0.6, 0.2);
    tree(b, -1.1, 0.06, 1.15, 0.5, 0.4);
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'fungus', p: [b.range(-1.3, 1.3), 0.06, b.range(-1.3, 1.3)], s: b.range(0.06, 0.1), tint: 0xbff6ff, glow: 1, growAt: 0.3 });
    // Play equipment (D-097): a swing set, a little slide and a bench for the grown-ups.
    for (const x of [0.3, 1.2]) {
      beam(b, 'timberBox', [x, 0.06, -0.2], [x, 0.75, 0], 0.04, { tint: TRIM.orange });
      beam(b, 'timberBox', [x, 0.06, 0.2], [x, 0.75, 0], 0.04, { tint: TRIM.orange });
    }
    b.add({ piece: 'timberBox', p: [0.75, 0.73, 0], s: [0.95, 0.04, 0.04], tint: TRIM.orange });
    for (const x of [0.55, 0.95]) {
      for (const dz of [-0.06, 0.06]) b.add({ piece: 'timberBox', p: [x, 0.3, dz], s: [0.008, 0.43, 0.008], tint: TRIM.steel });
      b.add({ piece: 'slab', p: [x, 0.28, 0], s: [0.16, 0.02, 0.14], tint: TRIM.red });
    }
    b.add({ piece: 'timberBox', p: [-1.2, 0.06, -0.2], s: [0.3, 0.55, 0.3], tint: PALETTE.timber });
    beam(b, 'slab', [-1.05, 0.6, -0.2], [-0.55, 0.08, 0.25], 0.22, { tint: 0x5fc2e0 });
    bench(b, 0.2, 0.06, 1.25);

    // Levels (D-100). Level 2: a treehouse in the big tree's crown (a timber platform with a hut and a slide)
    // reached by a rope bridge from the climbing frame.
    b.level(2, () => {
      const [x, z] = [1.0, -1.0];
      for (const [dx, dz] of [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
      ] as const)
        b.add({ piece: 'trunk', p: [x + dx, 0.06, z + dz], s: [0.05, 0.7, 0.05], tint: PALETTE.bark });
      b.add({ piece: 'timberBox', p: [x, 0.76, z], s: [0.75, 0.05, 0.75], tint: 0xc8a57c });
      b.add({ piece: 'timberBox', p: [x + 0.05, 0.81, z - 0.05], s: [0.4, 0.32, 0.4], tint: 0xa47c56 });
      gableRoof(b, x + 0.05, 1.13, z - 0.05, 0.44, 0.44, { pitch: 0.6, tint: TRIM.red, overhang: 0.04 });
      beam(b, 'timberBox', [x - 0.35, 0.78, z + 0.1], [0.75, 0.76, -0.02], 0.12, { tint: TRIM.rope });
      beam(b, 'slab', [x + 0.35, 0.74, z + 0.3], [1.35, 0.08, 0.1], 0.2, { tint: TRIM.orange });
    });
    // Level 3: a climbing-net dome of woven willow over the play hill, and splash jets in the pond.
    b.level(3, () => {
      for (let k = 0; k < 4; k++) b.add({ piece: 'willowArch', p: [-0.55, 0.06, 0.0], s: [1.3, 1.3, 1.3], r: (k / 4) * Math.PI, tint: 0xc8a57c });
      b.add({ piece: 'haloRing', p: [-0.55, 0.42, 0.0], s: [1.05, 2, 1.05], tint: TRIM.rope });
      for (let k = 0; k < 4; k++) b.add({ piece: 'lumenRib', p: [-0.85 + k * 0.2, 0.08, 0.7], s: [0.025, 0.3 + (k % 2) * 0.15, 0.025], tint: 0x9ee6ff, glow: 0.8 });
    });
  },
});
