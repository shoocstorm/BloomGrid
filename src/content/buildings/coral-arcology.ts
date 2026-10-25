import { defineBuilding, type KitBuilder, type Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

const CORALS = [0xff9a8a, 0xffb48a, 0xf7c6d9, 0xffd0a0] as const;

/** A coral branch: grows from `p` along `dir`, forking twice or thrice; glass homes sit at the tips. */
function branch(
  b: KitBuilder,
  p: Vec3,
  dir: Vec3,
  len: number,
  thick: number,
  depth: number,
  tint: number,
): void {
  const end: Vec3 = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
  beam(b, 'concreteCyl', p, end, thick, { tint });
  if (depth === 0) {
    b.add({
      piece: 'glassCyl',
      p: [end[0], end[1] - 0.2, end[2]],
      s: [1.1, 0.8, 1.1],
      tint: PALETTE.glassWarm,
      glow: 0.7,
    });
    b.add({ piece: 'concreteCyl', p: [end[0], end[1] + 0.6, end[2]], s: [1.3, 0.1, 1.3], tint });
    flowers(b, end[0], end[1] + 0.7, end[2], 0.45, 3, 0.2, 0.8);
    return;
  }
  const forks = depth === 2 ? 3 : 2;
  for (let k = 0; k < forks; k++) {
    const a = b.rand() * Math.PI * 2;
    const spread = 0.45 + b.rand() * 0.25;
    const d: Vec3 = [dir[0] + Math.cos(a) * spread, dir[1] + 0.15, dir[2] + Math.sin(a) * spread];
    const n = Math.hypot(d[0], d[1], d[2]);
    branch(b, end, [d[0] / n, d[1] / n, d[2] / n], len * 0.72, thick * 0.68, depth - 1, tint);
  }
}

export default defineBuilding({
  id: 'coral-arcology',
  name: 'Coral Arcology',
  description:
    'Homes grown like a reef: branching towers of pink and apricot biocrete, each tip a glass dwelling with a flower roof. Pods dock among the branches so residents fly to work.',
  category: 'residential',
  footprint: [9, 9],
  stats: {
    cost: 4000,
    energy: -20,
    eco: 12,
    happiness: 14,
    population: 380,
    jobs: 8,
    pollution: 0,
    water: -24,
  },
  growthTime: 220,
  transit: { radius: 8, riders: 380 },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [8.8, 0.2, 8.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, 0.2, 0], s: [8.2, 0.05, 8.2] });
    grassTufts(b, 0, 0.25, 0, 8, 8, 30);
    const roots: [number, number, number][] = [
      [-1.8, -1.6, 4.2],
      [1.9, -0.8, 3.6],
      [-0.4, 2.2, 3.0],
    ];
    roots.forEach(([x, z, len], i) =>
      branch(b, [x, 0.2, z], [0, 1, 0], len, 1.0, 2, CORALS[i % CORALS.length]!),
    );
    for (const [x, z] of [
      [3.2, 3.0],
      [-3.4, 3.2],
    ] as const)
      b.add({ piece: 'pod', p: [x, 0.25, z], s: 1.2, r: 0.6, glow: 0.8 });
  },
});
