import { defineBuilding } from '../types';
import { PALETTE, flowers, ivyEdge, roofMeadow } from '../kit';

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
  },
});
