import { defineBuilding } from '../types';
import { PALETTE, TRIM, door, flowers, ivyEdge, lamp, railing, roofMeadow } from '../kit';

const HOLDS = [0xff9aa2, 0xffe08a, 0x9ee6ff, 0xc9b6ff, 0x8fd35a];

export default defineBuilding({
  id: 'climbing-tower',
  name: 'Canopy Climbing Tower',
  description:
    'A timber climbing tower studded with bright holds and wrapped in ivy, with a garden deck on top for whoever makes it. Small, cheap and loved by every block it stands in.',
  category: 'sports',
  footprint: [3, 3],
  // Cheap to run: turf, timber and floodlights.
  stats: {
    cost: 500,
    energy: -3,
    eco: 3,
    happiness: 8,
    population: 0,
    jobs: 6,
    pollution: 0,
    water: -1,
    upkeep: 0.06,
  },
  growthTime: 110,
  variants: 2,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [2.8, 0.1, 2.8] });
    flowers(b, 0, 0.1, 0, 1.3, 14, 0, 0.6);
    const H = b.range(3.6, 4.6);
    b.add({ piece: 'timberBox', p: [0, 0.1, 0], s: [1.3, H, 1.3], tint: PALETTE.timber });
    // Holds on all four faces.
    for (let i = 0; i < 18; i++) {
      const face = i % 4;
      const [nx, nz] = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ][face]!;
      const t = b.range(-0.5, 0.5);
      b.add({
        piece: 'pod',
        p: [nx * 0.66 + nz * t, 0.4 + b.rand() * (H - 0.6), nz * 0.66 + nx * t],
        s: 0.18,
        tint: b.pick(HOLDS),
      });
    }
    ivyEdge(b, 0, H, 0.66, 1.2, 0, 1, 4);
    ivyEdge(b, 0, H, -0.66, 1.2, 0, -1, 4);
    b.add({ piece: 'slab', p: [0, H + 0.1, 0], s: [2.0, 0.12, 2.0], tint: PALETTE.timber });
    roofMeadow(b, H + 0.22, 1.9, 1.9, 1);
    b.add({ piece: 'haloRing', p: [0, H + 0.4, 0], s: [2.1, 3, 2.1], glow: 0.7 });
    // Detail (D-097): top-rope lines down the front, crash mats round the foot, a boulder with holds, a glass rail
    // round the roof garden, the stair door, a bench and a lamp.
    for (const x of [-0.35, 0.35])
      b.add({
        piece: 'timberBox',
        p: [x, 0.1, 0.72],
        s: [0.012, H, 0.012],
        tint: x < 0 ? TRIM.red : TRIM.orange,
      });
    b.add({ piece: 'slab', p: [0, 0.1, 0.95], s: [1.3, 0.06, 0.55], tint: 0x3f8fb0 });
    b.add({ piece: 'slab', p: [0.95, 0.1, 0], s: [0.55, 0.06, 1.3], tint: 0x2f8f86 });
    b.add({ piece: 'slab', p: [-0.95, 0.1, -0.8], s: [0.75, 0.55, 0.6], r: 0.4, rz: 0.25, tint: 0xb9b2a4 });
    for (let i = 0; i < 5; i++)
      b.add({
        piece: 'pod',
        p: [-0.95 + b.range(-0.25, 0.25), 0.25 + b.rand() * 0.3, -0.48],
        s: 0.1,
        tint: b.pick(HOLDS),
      });
    railing(b, 0, H + 0.22, 0.98, 1.96);
    railing(b, 0, H + 0.22, -0.98, 1.96);
    railing(b, 0.98, H + 0.22, 0, 1.96, true);
    railing(b, -0.98, H + 0.22, 0, 1.96, true);
    door(b, -0.3, 0.1, -0.66, 0.22, 0.34);
    b.add({ piece: 'timberBox', p: [-1.05, 0.1, 0.9], s: [0.5, 0.12, 0.16], tint: PALETTE.timber });
    lamp(b, 1.2, 0.1, 1.2, 0.6);
  },
});
