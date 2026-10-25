import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
const SEG = 20;
const R = 3.9;
const Y = 5.4;

export default defineBuilding({
  id: 'canopy-skywalk',
  name: 'Canopy Skywalk',
  description:
    'A ring of boardwalk threaded through the crowns of an old rainforest grove, lit along its rail at night, with a timber lookout rising above the canopy. Free to walk, always busy at dawn.',
  category: 'nature',
  footprint: [10, 10],
  stats: {
    cost: 2600,
    energy: -4,
    eco: 36,
    happiness: 22,
    population: 0,
    jobs: 12,
    pollution: -4,
    water: -8,
  },
  growthTime: 240,
  pollinators: 3,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.12, 9.8] });
    grassTufts(b, 0, 0.12, 0, 9.4, 9.4, 120);
    flowers(b, 0, 0.12, 0, 4.6, 60, 0, 0.6);
    // The grove: tall trees inside and outside the ring.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + 0.2;
      const r = k % 2 ? 2.2 : 4.4;
      tree(b, Math.cos(a) * r, 0.12, Math.sin(a) * r, b.range(1.4, 1.9), 0.05 + (k % 4) * 0.05);
    }
    // The ring walk on timber posts, with a glowing rail.
    const pts: Vec3[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU;
      pts.push([Math.cos(a) * R, Y + Math.sin(a * 2) * 0.3, Math.sin(a) * R]);
    }
    for (let i = 0; i < SEG; i++) {
      const a = pts[i]!;
      const c = pts[(i + 1) % SEG]!;
      beam(b, 'timberBox', a, c, 0.55, { tint: 0xc8a57c });
      beam(
        b,
        'lumenRib',
        [a[0] * 1.07, a[1] + 0.45, a[2] * 1.07],
        [c[0] * 1.07, c[1] + 0.45, c[2] * 1.07],
        0.05,
        { glow: 0.8 },
      );
      if (i % 4 === 0)
        b.add({ piece: 'trunk', p: [a[0], 0.12, a[2]], s: [0.35, a[1] - 0.12, 0.35], tint: PALETTE.bark });
    }
    // Lookout tower and a bridge out to the ring.
    b.add({ piece: 'trunk', p: [0, 0.12, 0], s: [1.0, 11, 1.0], tint: PALETTE.bark });
    for (let i = 0; i < 4; i++)
      b.add({ piece: 'haloRing', p: [0, 2 + i * 2.4, 0], s: [1.6, 4, 1.6], glow: 0.6 });
    b.add({ piece: 'concreteCyl', p: [0, 11.1, 0], s: [3.2, 0.2, 3.2], tint: 0xc8a57c });
    b.add({ piece: 'haloRing', p: [0, 11.6, 0], s: [3.2, 4, 3.2], glow: 1 });
    beam(b, 'timberBox', [0, Y, 0], pts[3]!, 0.5, { tint: 0xc8a57c });
  },
});
