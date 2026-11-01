import { defineBuilding } from '../types';
import type { KitBuilder, Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts, tree } from '../kit';

/**
 * The island landmark, fully procedural (D-082): supertrees about 2.5× the tallest towers, each a steel core
 * wrapped in a vertical garden, a funnel of lattice ribs and a solar canopy with a lit rim. It grows with its
 * levels instead of a generic roof terrace: level 2 plants a fourth tree and a Cloud Forest dome, level 3 adds a
 * crown walk with lit halos and a waterfall into the pond.
 */

/** Supertrees: x, z, height, canopy radius. The level overlays build on the same positions. */
const TREES: [number, number, number, number][] = [
  [-2.4, -2.2, 13, 2.3],
  [2.4, -1.6, 14.8, 2.6],
  [-0.6, 2.2, 11, 2.1],
];
const FOURTH: [number, number, number, number] = [3.1, 2.9, 9.6, 1.9];
const STEEL = 0x7f8c84;
const POND: Vec3 = [-3.3, 0.08, 3.3];

function supertree(b: KitBuilder, [x, z, h, R]: [number, number, number, number], growAt = 0): void {
  // Buttress roots flare into the garden floor.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    beam(b, 'concreteCyl', [x + Math.cos(a) * 1.25, 0.08, z + Math.sin(a) * 1.25], [x + Math.cos(a) * 0.35, h * 0.16, z + Math.sin(a) * 0.35], 0.16, { tint: STEEL, growAt });
  }
  // Tapered steel core in three drums.
  const drums: [number, number, number][] = [
    [0.95, 0, 0.36],
    [0.72, 0.36, 0.7],
    [0.55, 0.7, 0.9],
  ];
  for (const [r, y0, y1] of drums) b.add({ piece: 'concreteCyl', p: [x, h * y0, z], s: [r, h * (y1 - y0), r], tint: STEEL, growAt });
  // Vertical garden: ivy curtains and planted pockets spiralling up the core.
  for (let row = 0; row < 5; row++) {
    const y = h * (0.18 + row * 0.15);
    const r = (row < 2 ? 0.95 : row < 4 ? 0.72 : 0.55) * 0.5 + 0.02;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + row * 0.4;
      const [nx, nz] = [Math.cos(a), Math.sin(a)];
      b.add({ piece: 'ivy', p: [x + nx * r, y, z + nz * r], s: [0.34, b.range(0.9, 1.6), 1], r: Math.atan2(nx, nz), tint: b.pick(PALETTE.leaves), glow: b.rand() < 0.12 ? 0.6 : 0, growAt: 0.1 + row * 0.08 });
    }
    for (let i = 0; i < 3; i++) {
      const a = b.rand() * Math.PI * 2;
      const p: Vec3 = [x + Math.cos(a) * (r + 0.06), y - b.range(0.2, 0.8), z + Math.sin(a) * (r + 0.06)];
      b.add({ piece: 'bush', p, s: b.range(0.22, 0.34), r: a, tint: b.pick(PALETTE.leaves), growAt: 0.15 + row * 0.08 });
      b.add({ piece: 'flower', p: [p[0], p[1] + 0.18, p[2]], s: 0.1, tint: b.pick(PALETTE.blossoms), glow: 0.7, growAt: 0.3 + row * 0.08 });
    }
  }
  // The funnel: steel ribs from the core to the canopy rim, every other one a lit lattice line.
  const top = h * 0.9;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const from: Vec3 = [x + Math.cos(a) * 0.3, h * 0.66, z + Math.sin(a) * 0.3];
    const to: Vec3 = [x + Math.cos(a) * R, h, z + Math.sin(a) * R];
    if (i % 2) beam(b, 'lumenRib', from, to, 0.05, { tint: PALETTE.glowCyan, glow: 0.55, growAt });
    else beam(b, 'concreteCyl', from, to, 0.09, { tint: STEEL, growAt });
  }
  // Solar canopy petals, the lit rim and the crown cap.
  for (let i = 0; i < 12; i++)
    b.add({ piece: 'solarLeaf', p: [x, top, z], s: [R * 1.02, 1, R * 1.25], r: (i / 12) * Math.PI * 2 + 0.26, rz: 0.27, growAt: 0.2 + growAt });
  b.add({ piece: 'haloRing', p: [x, h + 0.02, z], s: [R * 2, 2, R * 2], tint: PALETTE.glowCyan, glow: 0.7, growAt: 0.25 + growAt });
  b.add({ piece: 'concreteCyl', p: [x, top - 0.1, z], s: [0.85, 0.3, 0.85], tint: 0xe9f4ef, glow: 0.6, growAt });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    b.add({ piece: 'bush', p: [x + Math.cos(a) * R * 0.92, h - 0.12, z + Math.sin(a) * R * 0.92], s: 0.3, tint: b.pick(PALETTE.leaves), growAt: 0.35 + growAt });
  }
}

/** A skywalk deck between two points with lit handrails. */
function skywalk(b: KitBuilder, a: Vec3, c: Vec3, growAt = 0): void {
  const [dx, dy, dz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const run = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  b.add({ piece: 'slab', p: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], s: [Math.hypot(run, dy), 0.08, 0.42], r: yaw, rz: Math.atan2(dy, run), tint: PALETTE.concrete, growAt });
  const [ox, oz] = [(-dz / run) * 0.2, (dx / run) * 0.2];
  for (const s of [-1, 1])
    beam(b, 'lumenRib', [a[0] + ox * s, a[1] + 0.3, a[2] + oz * s], [c[0] + ox * s, c[1] + 0.3, c[2] + oz * s], 0.025, { tint: 0xfff1c9, glow: 0.6, growAt });
}

/** Point on a tree's trunk surface, facing `toward`, at height `y`. */
function trunkSide([x, z]: [number, number, number, number], toward: [number, number], y: number): Vec3 {
  const [dx, dz] = [toward[0] - x, toward[1] - z];
  const l = Math.hypot(dx, dz) || 1;
  return [x + (dx / l) * 0.4, y, z + (dz / l) * 0.4];
}

function walkBetween(b: KitBuilder, p: [number, number, number, number], q: [number, number, number, number], y0: number, y1: number, growAt = 0): void {
  skywalk(b, trunkSide(p, [q[0], q[1]], y0), trunkSide(q, [p[0], p[1]], y1), growAt);
}

export default defineBuilding({
  id: 'supertree-grove',
  name: 'Supertree Grove',
  description:
    'The island’s landmark: a grove of vertical-garden supertrees towering far above every tower, with solar canopies and a skywalk. Collects rain, powers itself, and is everyone’s favourite evening walk.',
  category: 'nature',
  footprint: [10, 10],
  stats: { cost: 2400, energy: 30, eco: 30, happiness: 24, population: 0, jobs: 12, pollution: -4, water: -4 },
  growthTime: 120,
  pollinators: 2,
  cleanEnergy: true,
  variants: 1,
  retrofit: false,
  recipe(b) {
    // Garden floor: meadow, a crossing of paths, a lily pond and an orchard round the edge.
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.9, 0.08, 9.9] });
    b.add({ piece: 'slab', p: [0, 0.08, 0], s: [9.6, 0.02, 0.7], r: 0.62, tint: 0xe8dcc0 });
    b.add({ piece: 'slab', p: [0, 0.08, 0], s: [9.6, 0.02, 0.7], r: -0.9, tint: 0xe8dcc0 });
    b.add({ piece: 'pool', p: POND, s: [2.6, 0.03, 2.4] });
    for (let i = 0; i < 9; i++)
      b.add({ piece: 'lily', p: [POND[0] + b.range(-1.1, 1.1), 0.12, POND[2] + b.range(-1, 1)], s: b.range(0.16, 0.24), tint: b.pick(PALETTE.blossoms) });
    for (let i = 0; i < 3; i++) b.add({ piece: 'koi', p: [POND[0] + b.range(-0.8, 0.8), 0.09, POND[2] + b.range(-0.7, 0.7)], s: 0.2, r: b.rand() * 6.28, tint: 0xff8a3d });
    grassTufts(b, 0, 0.08, 0, 9.4, 9.4, 110);
    flowers(b, 0, 0.08, 0, 4.6, 160, 0, 0.6);
    const orchard: [number, number][] = [
      [-4.2, 0.4],
      [-4.1, -4.2],
      [0.3, -4.3],
      [4.3, 1.0],
      [4.2, -4.3],
      [1.4, 4.4],
      [-1.0, -0.4],
    ];
    for (const [x, z] of orchard) tree(b, x, 0.08, z, b.range(0.6, 0.9), 0.1);
    for (const t of TREES) supertree(b, t);
    // Skywalks linking the three crowns at mid height.
    walkBetween(b, TREES[0]!, TREES[1]!, 6.4, 7.2, 0.3);
    walkBetween(b, TREES[0]!, TREES[2]!, 6.4, 5.8, 0.3);
  },
  levels(b, tier) {
    if (tier === 1) {
      // Level 2: a fourth supertree joins the skywalk, and a glass Cloud Forest dome rises between the trunks.
      supertree(b, FOURTH);
      walkBetween(b, TREES[2]!, FOURTH, 5.8, 5.2);
      walkBetween(b, TREES[1]!, FOURTH, 7.2, 5.2);
      b.add({ piece: 'concreteCyl', p: [0.4, 0.08, -0.2], s: [2.9, 0.16, 2.9], tint: PALETTE.concrete });
      b.add({ piece: 'dome', p: [0.4, 0.24, -0.2], s: [2.7, 2.6, 2.7], tint: PALETTE.glass, glow: 0.3 });
      for (let i = 0; i < 4; i++) tree(b, 0.4 + b.range(-0.6, 0.6), 0.24, -0.2 + b.range(-0.6, 0.6), b.range(0.45, 0.6));
      flowers(b, 0.4, 0.24, -0.2, 1.1, 24, 0, 0.3);
    } else {
      // Level 3: a crown walk round the tallest canopy, second halos on every crown, a waterfall into the pond.
      const [x, z, h, R] = TREES[1]!;
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = ((i + 1) / 16) * Math.PI * 2;
        const r = R + 0.35;
        skywalk(b, [x + Math.cos(a0) * r, h + 0.1, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, h + 0.1, z + Math.sin(a1) * r]);
      }
      for (const [tx, tz, th, tr] of [...TREES, FOURTH]) {
        b.add({ piece: 'haloRing', p: [tx, th + 0.5, tz], s: [tr * 1.4, 2, tr * 1.4], tint: 0xfff1c9, glow: 0.9 });
        b.add({ piece: 'spireCone', p: [tx, th - 0.1, tz], s: [0.22, 1.3, 0.22], tint: PALETTE.glassWarm, glow: 0.5 });
      }
      // The waterfall drops from a lookout cantilevered off the third tree.
      const [cx, cz] = [TREES[2]![0], TREES[2]![1]];
      const look: Vec3 = [POND[0] + 0.6, 6, POND[2] - 0.6];
      skywalk(b, trunkSide(TREES[2]!, [look[0], look[2]], 6), look);
      b.add({ piece: 'slab', p: look, s: [0.9, 0.1, 0.9], r: Math.atan2(cz - look[2], cx - look[0]), tint: PALETTE.concrete });
      b.add({ piece: 'waterfall', p: [look[0] - 0.2, 0.1, look[2] + 0.2], s: [0.8, 5.9, 1], r: -Math.PI / 4, glow: 0.4 });
    }
  },
});
