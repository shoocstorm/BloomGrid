import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, flowers, grassTufts, lamp, planter, tree } from '../kit';

export default defineBuilding({
  id: 'greenhouse-hub',
  name: 'Mycelium Work Dome',
  description: 'Living workspaces grown from shaped timber and mycelium beneath a solar-glass dome.',
  category: 'commercial',
  footprint: [3, 3],
  stats: { cost: 260, energy: -10, eco: 4, happiness: 3, population: 0, jobs: 40, pollution: 1, water: -5, food: 60 },
  growthTime: 120,
  pollinators: 0.4,
  recipe(b) {
    // (D-095) A timber-ribbed geodesic dome on a stone ring with a deck round it, a sunflower crown lantern,
    // a timber entrance vestibule, and a forest of mycelium desks inside.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [2.9, 0.05, 2.9], tint: 0xd8cfbf });
    b.add({ piece: 'concreteCyl', p: [0, 0.05, 0], s: [2.62, 0.12, 2.62], tint: 0xc9bca6 });
    b.add({ piece: 'mossBox', p: [0, 0.16, 0], s: [1.8, 0.02, 1.8] });
    grassTufts(b, 0, 0.17, 0, 1.7, 1.7, 22);
    tree(b, -0.3, 0.17, -0.2, 0.7, 0);
    tree(b, 0.45, 0.17, -0.35, 0.5, 0.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add({ piece: 'fungus', p: [Math.cos(a) * 0.85, 0.17, Math.sin(a) * 0.85], s: b.range(0.14, 0.22), tint: 0xf3e3ff, glow: 0.9, growAt: 0.1 + i * 0.05 });
      // Desks under each fungus lamp.
      b.add({ piece: 'timberBox', p: [Math.cos(a) * 0.62, 0.17, Math.sin(a) * 0.62], s: [0.22, 0.08, 0.12], r: -a, tint: 0xc9a06a });
    }
    flowers(b, 0, 0.17, 0, 1.1, 18, 0.05, 0.7);
    // Glass skin and its timber ribs: 10 meridians of 5 straight segments, two rings of chords.
    const R = 1.3;
    const H = 1.05;
    const at = (a: number, t: number): [number, number, number] => [Math.cos(a) * R * Math.cos(t), 0.17 + H * Math.sin(t), Math.sin(a) * R * Math.cos(t)];
    b.add({ piece: 'dome', p: [0, 0.17, 0], s: [R * 2, H * 2, R * 2], tint: PALETTE.glass });
    const M = 10;
    for (let i = 0; i < M; i++) {
      const a = (i / M) * Math.PI * 2;
      for (let k = 0; k < 5; k++) beam(b, 'timberBox', at(a, (k / 5) * 1.35), at(a, ((k + 1) / 5) * 1.35), 0.035, { tint: 0xb08a5c });
      for (const t of [0.42, 0.95]) beam(b, 'timberBox', at(a, t), at(a + (2 * Math.PI) / M, t), 0.028, { tint: 0xb08a5c });
    }
    // Crown: an oculus lantern with a ring of solar petals.
    const top = 0.17 + H;
    const crown = (y: number, s: number) => {
      b.add({ piece: 'concreteCyl', p: [0, y - 0.06, 0], s: [0.42 * s, 0.08, 0.42 * s], tint: 0xe9e1d0 });
      b.add({ piece: 'glassCyl', p: [0, y + 0.02, 0], s: [0.28 * s, 0.16 * s, 0.28 * s], tint: 0xfff2c8, glow: 0.6 });
      for (let i = 0; i < 10; i++) b.add({ piece: 'solarLeaf', p: [0, y + 0.05, 0], s: [0.45 * s, 1, 0.45 * s], r: (i / 10) * Math.PI * 2, rz: 0.4, growAt: 0.1 + i * 0.03 });
    };
    b.upTo(1, () => crown(top, 1));
    // Entrance vestibule on the front (+z): a timber portal with a glass door and a canopy.
    b.add({ piece: 'timberBox', p: [0, 0.05, 1.28], s: [0.62, 0.5, 0.36], tint: 0xb08a5c });
    b.add({ piece: 'glassBox', p: [0, 0.05, 1.47], s: [0.34, 0.38, 0.02], tint: 0xd6f2ee });
    b.add({ piece: 'slab', p: [0, 0.55, 1.36], s: [0.78, 0.04, 0.56], tint: PALETTE.timber });
    b.add({ piece: 'slab', p: [0, 0.47, 1.49], s: [0.5, 0.06, 0.015], tint: 0x6a3f86, glow: 0.6 });
    // Deck furniture: planters, benches, lamps, a bike rack.
    for (const sx of [-1, 1]) {
      planter(b, sx * 0.85, 0.05, 1.2, 0.36, 0.2, 0.2);
      lamp(b, sx * 1.3, 0.05, 1.3);
      b.add({ piece: 'timberBox', p: [sx * 1.25, 0.05, -0.6], s: [0.12, 0.08, 0.4], tint: 0xa47c56 });
    }
    for (let k = 0; k < 4; k++) b.add({ piece: 'willowArch', p: [-1.25 + k * 0.12, 0.05, 0.6], s: [0.1, 0.12, 0.02], r: Math.PI / 2, tint: TRIM.steel });

    // Levels (D-100). Level 2: a glazed drum (a mezzanine gallery) lifts the lantern, and climbing-rose arches
    // ring the back of the deck.
    const drum = top - 0.08;
    b.level(2, () => {
      b.add({ piece: 'glassCyl', p: [0, drum, 0], s: [0.95, 0.32, 0.95], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'concreteCyl', p: [0, drum + 0.32, 0], s: [1.05, 0.05, 1.05], tint: 0xe9e1d0 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add({ piece: 'timberBox', p: [Math.cos(a) * 0.48, drum, Math.sin(a) * 0.48], s: [0.035, 0.32, 0.035], tint: 0xb08a5c });
      }
      b.upTo(2, () => crown(drum + 0.4, 1));
      for (const a of [-2.4, -1.57, -0.74]) {
        const [x, z] = [Math.cos(a) * 1.33, Math.sin(a) * 1.33];
        b.add({ piece: 'willowArch', p: [x, 0.05, z], s: [0.5, 0.55, 0.5], r: -a + Math.PI / 2, tint: PALETTE.bark });
        flowers(b, x, 0.05, z, 0.18, 4, 0.1, 0.6);
      }
    });
    // Level 3: a second, smaller dome over the gallery with its own ribs, a larger sunflower crown and a halo.
    b.level(3, () => {
      const R2 = 0.5;
      const y0 = drum + 0.37;
      b.add({ piece: 'dome', p: [0, y0, 0], s: [R2 * 2, 0.7, R2 * 2], tint: PALETTE.glass });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const at2 = (t: number): [number, number, number] => [Math.cos(a) * R2 * Math.cos(t), y0 + 0.35 * Math.sin(t), Math.sin(a) * R2 * Math.cos(t)];
        for (let k = 0; k < 3; k++) beam(b, 'timberBox', at2((k / 3) * 1.3), at2(((k + 1) / 3) * 1.3), 0.03, { tint: 0xb08a5c });
      }
      crown(y0 + 0.38, 1.35);
      b.add({ piece: 'haloRing', p: [0, y0 + 0.75, 0], s: [1.1, 3, 1.1], glow: 0.9 });
    });
  },
});
