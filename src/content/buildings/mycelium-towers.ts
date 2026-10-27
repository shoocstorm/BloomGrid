import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge } from '../kit';

const TAU = Math.PI * 2;

/** One mushroom tower: a ribbed glass stalk, gill rings and a glowing cap that brightens with street life. */
function mushroom(b: KitBuilder, x: number, z: number, h: number, cap: number, tint: number): void {
  b.add({ piece: 'timberBox', p: [x, 0.2, z], s: [cap * 0.32, h, cap * 0.32], r: 0.4, tint: 0xd9c7a8 });
  b.add({
    piece: 'glassCyl',
    p: [x, 0.2, z],
    s: [cap * 0.42, h * 0.97, cap * 0.42],
    tint: PALETTE.glassWarm,
    glow: 0.15,
  });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.add({
      piece: 'lumenRib',
      p: [x + Math.cos(a) * cap * 0.21, 0.2, z + Math.sin(a) * cap * 0.21],
      s: [0.07, h, 0.07],
      glow: 0.6,
    });
  }
  // Gill rings stepping out under the cap.
  for (let i = 0; i < 3; i++)
    b.add({
      piece: 'haloRing',
      p: [x, h - 0.6 - i * 0.35, z],
      s: [cap * (0.5 + i * 0.12), 5, cap * (0.5 + i * 0.12)],
      glow: 0.7,
    });
  // The cap: the fungus piece's dome scaled up so its stem hides inside the stalk.
  b.add({ piece: 'fungus', p: [x, h - cap * 0.75, z], s: [cap * 1.7, cap * 1.9, cap * 1.7], tint, glow: 1 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ivyEdge(
      b,
      x + Math.sin(a) * cap * 0.7,
      h,
      z + Math.cos(a) * cap * 0.7,
      cap * 0.45,
      Math.sin(a),
      Math.cos(a),
      1,
    );
  }
}

export default defineBuilding({
  id: 'mycelium-towers',
  name: 'Mycelium Research Towers',
  description:
    'Three grown-not-built research towers of mycelium composite, capped with luminous gills that brighten with the life of the streets. The island’s labs for materials, medicine and soil.',
  category: 'tech',
  footprint: [9, 9],
  stats: {
    cost: 4000,
    energy: -24,
    eco: 16,
    happiness: 14,
    population: 0,
    jobs: 200,
    pollution: -3,
    water: -14,
  },
  growthTime: 200,
  variants: 1,
  style: 'rammed-earth',
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [8.8, 0.2, 8.8] });
    grassTufts(b, 0, 0.2, 0, 8.4, 8.4, 110);
    flowers(b, 0, 0.2, 0, 4.0, 60, 0, 0.6);
    // A forest floor of glowing fungi between the stalks.
    for (let i = 0; i < 40; i++) {
      const a = b.rand() * TAU;
      const d = 1.5 + b.rand() * 2.6;
      b.add({
        piece: 'fungus',
        p: [Math.cos(a) * d, 0.2, Math.sin(a) * d],
        s: b.range(0.25, 0.6),
        tint: 0xf6efe4,
        glow: b.range(0.6, 1),
        growAt: b.rand() * 0.5,
      });
    }
    mushroom(b, -1.6, -1.4, 17, 4.6, 0xf2e6ff);
    mushroom(b, 2.2, -0.4, 12.5, 3.6, 0xe6fff4);
    mushroom(b, -0.4, 2.5, 9, 3.0, 0xfff1e0);
    // Root walkways linking the stalks at low level.
    b.add({ piece: 'slab', p: [0.3, 3.2, -0.9], s: [4.0, 0.12, 0.5], r: -0.25, tint: PALETTE.concrete });
    b.add({ piece: 'slab', p: [-1.0, 2.4, 0.5], s: [4.0, 0.12, 0.5], r: 1.3, tint: PALETTE.concrete });
  },
});
