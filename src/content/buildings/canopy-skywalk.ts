import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, bench, door, flowers, grassTufts, lamp, tree } from '../kit';

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
    // Visitors (D-097): a glass lift from the street up to the ring's front with a short bridge across, lamps at
    // its door and benches under the trees.
    const front = pts[SEG / 4]!;
    b.add({
      piece: 'glassCyl',
      p: [0, 0.12, 4.5],
      s: [0.7, front[1] + 0.5, 0.7],
      tint: PALETTE.glassWarm,
      glow: 0.4,
    });
    b.add({ piece: 'concreteCyl', p: [0, front[1] + 0.62, 4.5], s: [0.85, 0.1, 0.85], tint: 0xc8a57c });
    for (const x of [-0.3, 0.3])
      b.add({ piece: 'lumenRib', p: [x, 0.12, 4.82], s: [0.04, front[1] + 0.5, 0.04], glow: 0.7 });
    beam(b, 'timberBox', [0, front[1], 4.15], [0, front[1], front[2] + 0.2], 0.5, { tint: 0xc8a57c });
    door(b, 0, 0.12, 4.86, 0.22, 0.4);
    for (const sx of [-1, 1]) lamp(b, sx * 0.6, 0.12, 4.75, 0.6);
    bench(b, 3.0, 0.12, 0.6, 0.45, true, true);
    bench(b, -3.0, 0.12, -0.6, 0.45, true);

    // Levels (D-100). Level 2: a second, higher loop of the skywalk (a figure-eight lobe through the treetops on
    // the north side) joined to the lookout tower, with a tree-house café on it.
    const loop2 = () => {
      const n = 12;
      const [cx, cz, r, y] = [0, -2.2, 2.0, 8.2];
      const ps: Vec3[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        ps.push([cx + Math.cos(a) * r, y + Math.sin(a * 2) * 0.25, cz + Math.sin(a) * r]);
      }
      for (let i = 0; i < n; i++) {
        beam(b, 'timberBox', ps[i]!, ps[(i + 1) % n]!, 0.5, { tint: 0xc8a57c });
        if (i % 3 === 0) b.add({ piece: 'trunk', p: [ps[i]![0], 0.12, ps[i]![2]], s: [0.3, ps[i]![1] - 0.12, 0.3], tint: PALETTE.bark });
      }
      beam(b, 'timberBox', [0, y, 0], ps[3]!, 0.45, { tint: 0xc8a57c });
      const c = ps[9]!;
      b.add({ piece: 'timberBox', p: [c[0], c[1], c[2]], s: [1.0, 0.6, 0.8], tint: 0xa47c56 });
      b.add({ piece: 'glassBox', p: [c[0], c[1] + 0.1, c[2] + 0.41], s: [0.8, 0.3, 0.02], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'spireCone', p: [c[0], c[1] + 0.6, c[2]], s: [1.3, 0.6, 1.1], tint: 0x6f8a5a });
    };
    b.level(2, loop2);
    // Level 3: the lookout grows a canopy crown (a domed glass observatory above the treetops, ringed with light)
    // and a zip line runs from it down to the far edge of the grove.
    b.level(3, () => {
      loop2();
      b.add({ piece: 'trunk', p: [0, 11.3, 0], s: [0.7, 2.2, 0.7], tint: PALETTE.bark });
      b.add({ piece: 'concreteCyl', p: [0, 13.5, 0], s: [2.6, 0.15, 2.6], tint: 0xc8a57c });
      b.add({ piece: 'glassCyl', p: [0, 13.65, 0], s: [2.0, 0.7, 2.0], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'dome', p: [0, 14.35, 0], s: [2.1, 1.2, 2.1], tint: PALETTE.glass });
      b.add({ piece: 'haloRing', p: [0, 13.9, 0], s: [2.8, 4, 2.8], tint: 0xffd9a0, glow: 1 });
      beam(b, 'timberBox', [0.8, 13.0, 0.4], [4.4, 1.5, 3.2], 0.02, { tint: 0xb8c2c6 });
    });
  },
});
