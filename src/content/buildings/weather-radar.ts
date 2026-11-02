import { defineBuilding } from '../types';
import { PALETTE, TRIM, door, grassTufts, solarArray } from '../kit';

export default defineBuilding({
  id: 'weather-radar',
  name: 'Weather Radar',
  description:
    'A radome on a lattice tower watching the sky and the sea. While it works, storms, tornadoes, floods and tsunamis are seen coming twice as early: time to feather turbines, close the gates and evacuate.',
  category: 'tech',
  footprint: [2, 2],
  stats: { cost: 1200, energy: -15, eco: 0, happiness: 0, population: 0, jobs: 8, pollution: 0 },
  growthTime: 90,
  radar: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.9, 0.1, 1.9], tint: PALETTE.concrete });
    grassTufts(b, -0.5, 0.1, 0.5, 0.8, 0.8, 4);
    for (const [x, z] of [
      [-0.4, -0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [0.4, 0.4],
    ] as const)
      b.add({ piece: 'timberBox', p: [x, 0.1, z], s: [0.08, 3.0, 0.08], tint: 0xdfe8e4 });
    for (let i = 0; i < 4; i++)
      b.add({ piece: 'slab', p: [0, 0.6 + i * 0.7, 0], s: [0.9, 0.05, 0.9], tint: 0xdfe8e4 });
    const radome = (y: number, s = 1) => {
      b.add({ piece: 'concreteCyl', p: [0, y + 0.1, 0], s: [0.9, 0.2, 0.9], tint: 0xe9eee8 });
      b.add({ piece: 'dome', p: [0, y, 0], s: [1.3 * s, 1.6 * s, 1.3 * s], tint: 0xf4f6f2 });
      b.add({ piece: 'lumenRib', p: [0, y + 0.8 * s + 0.5, 0], s: [0.12, 0.12, 0.12], glow: 1, tint: 0xff6a5a });
    };
    b.upTo(2, () => radome(3.0));
    // Detail (D-097): a ladder up the front of the tower and an equipment hut with a door.
    for (const x of [-0.1, 0.1])
      b.add({ piece: 'timberBox', p: [x, 0.1, 0.44], s: [0.02, 2.9, 0.02], tint: TRIM.steel });
    for (let i = 0; i < 11; i++)
      b.add({ piece: 'timberBox', p: [0, 0.3 + i * 0.25, 0.44], s: [0.2, 0.015, 0.015], tint: TRIM.steel });
    b.add({ piece: 'slab', p: [0.72, 0.1, -0.1], s: [0.4, 0.42, 0.6], tint: 0xdfe8e4 });
    door(b, 0.93, 0.1, -0.1, 0.14, 0.28, true);

    // Levels (D-100). Level 2: a weather mast beside the tower (anemometer cups, a wind vane and a lit sensor
    // head) and a solar roof on the equipment hut.
    const mast = () => {
      b.add({ piece: 'timberBox', p: [-0.7, 0.1, -0.7], s: [0.04, 2.4, 0.04], tint: TRIM.steel });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.add({ piece: 'timberBox', p: [-0.7 + Math.cos(a) * 0.08, 2.5, -0.7 + Math.sin(a) * 0.08], s: [0.16, 0.012, 0.012], r: -a, tint: TRIM.steel });
        b.add({ piece: 'dome', p: [-0.7 + Math.cos(a) * 0.16, 2.47, -0.7 + Math.sin(a) * 0.16], s: [0.06, 0.06, 0.06], rz: Math.PI / 2, tint: 0xe9eee8 });
      }
      b.add({ piece: 'slab', p: [-0.6, 2.3, -0.7], s: [0.22, 0.08, 0.01], tint: TRIM.red });
      b.add({ piece: 'lumenRib', p: [-0.7, 2.62, -0.7], s: [0.05, 0.05, 0.05], tint: 0x7ff7e6, glow: 1 });
      solarArray(b, 0.72, 0.53, -0.1, 0.4, 0.6, 1, 2, 0.3);
    };
    b.level(2, mast);
    // Level 3: the lattice tower grows a stage taller, the radome rides up with a lightning rod and a ring of
    // warning lights.
    b.level(3, () => {
      mast();
      for (const [x, z] of [
        [-0.4, -0.4],
        [0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
      ] as const)
        b.add({ piece: 'timberBox', p: [x, 3.1, z], s: [0.07, 0.8, 0.07], tint: 0xdfe8e4 });
      b.add({ piece: 'slab', p: [0, 3.4, 0], s: [0.9, 0.05, 0.9], tint: 0xdfe8e4 });
      radome(3.8, 1.1);
      b.add({ piece: 'timberBox', p: [0, 5.8, 0], s: [0.02, 0.6, 0.02], tint: TRIM.steel });
      for (let k = 0; k < 4; k++) b.add({ piece: 'lumenRib', p: [Math.cos(k * 1.57) * 0.45, 3.9, Math.sin(k * 1.57) * 0.45], s: [0.06, 0.06, 0.06], tint: 0xff6a5a, glow: 1 });
    });
  },
});
