import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, beam, flowers, grassTufts, tree } from '../kit';

type Vec3 = [number, number, number];

const TAU = Math.PI * 2;
/** Half extents of the 36 × 16 footprint; the gate faces -z (toward the bridge). */
const [HX, HZ] = [18, 8];
const FENCE_H = 1.3;
/** Gate pylons stand at ±GATE_X; the fence opens between them. */
const GATE_X = 9.2;

/** 5 × 7 neon glyphs for the sign, rows top to bottom. */
const GLYPHS: Record<string, string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};
const NAME = 'BLOOMTOPIA';
const PASTEL = [0xff9ac8, 0xffd36e, 0x9fe6ff, 0xc6a8ff, 0x8ff0b0, 0xffb38a] as const;

/**
 * Neon lettering on the sign's face: each row's runs of lit pixels become one glowing tube. The sign faces -z,
 * so a reader's left is +x: text runs from +x to -x.
 */
function sign(b: KitBuilder, cx: number, cy: number, z: number, px: number) {
  const width = NAME.length * 6 * px - px;
  NAME.split('').forEach((ch, k) => {
    const x0 = cx + width / 2 - k * 6 * px;
    GLYPHS[ch]!.forEach((row, r) => {
      const y = cy + (3 - r) * px;
      for (let c = 0; c < 5; ) {
        if (row[c] !== '1') {
          c++;
          continue;
        }
        let e = c;
        while (row[e + 1] === '1') e++;
        beam(b, 'lumenRib', [x0 - c * px + px * 0.35, y, z], [x0 - e * px - px * 0.35, y, z], px * 0.7, { glow: 1 });
        c = e + 1;
      }
    });
  });
}

/** Railing fence with posts, three rails and a glowing top rail from a to c (ground level y). */
function fence(b: KitBuilder, a: [number, number], c: [number, number], y: number) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const [mx, mz] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const yaw = Math.atan2(-(c[1] - a[1]), c[0] - a[0]);
  b.add({ piece: 'slab', p: [mx, y, mz], s: [len, 0.18, 0.22], r: yaw, tint: 0xf6f2ea });
  for (const h of [0.45, 0.85]) b.add({ piece: 'slab', p: [mx, y + h, mz], s: [len, 0.08, 0.08], r: yaw, tint: 0xc6a8ff });
  b.add({ piece: 'slab', p: [mx, y + FENCE_H - 0.08, mz], s: [len, 0.1, 0.14], r: yaw, tint: 0xf6f2ea });
  beam(b, 'lumenRib', [a[0], y + FENCE_H + 0.05, a[1]], [c[0], y + FENCE_H + 0.05, c[1]], 0.09, { glow: 0.5 });
  const posts = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    b.add({
      piece: 'concreteCyl',
      p: [a[0] + (c[0] - a[0]) * t, y, a[1] + (c[1] - a[1]) * t],
      s: [0.22, FENCE_H + 0.25, 0.22],
      tint: 0xf6f2ea,
    });
  }
}

/** Comet Loop: a closed coaster circuit round (cx, cz) with a lift hill, camel humps and a vertical loop. */
function coaster(b: KitBuilder, cx: number, cz: number, rx: number, rz: number, y0: number) {
  const pts: Vec3[] = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const a = t * TAU;
    // Lift hill early in the lap, then two camel humps and a low turn back to the station.
    const h = 1.2 + 7.5 * Math.exp(-(((t - 0.18) / 0.07) ** 2)) + 3.2 * Math.exp(-(((t - 0.45) / 0.06) ** 2)) + 2.2 * Math.exp(-(((t - 0.62) / 0.05) ** 2));
    pts.push([cx + Math.cos(a) * rx, y0 + h, cz + Math.sin(a) * rz]);
    // The vertical loop stands on the straight east of the circuit (t ≈ 0).
    if (i === 0) {
      const L = 2.4;
      for (let k = 1; k < 16; k++) {
        const th = (k / 16) * TAU;
        pts.push([cx + rx + 0.6 * (k / 16), y0 + 1.2 + L - Math.cos(th) * L, cz + Math.sin(th) * L]);
      }
    }
  }
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    // Twin rails offset sideways (horizontal normal to the run), a glowing spine between them.
    const [dx, dz] = [q[0] - p[0], q[2] - p[2]];
    const l = Math.hypot(dx, dz) || 1;
    const [ox, oz] = [(-dz / l) * 0.28, (dx / l) * 0.28];
    for (const s of [-1, 1])
      beam(b, 'concreteCyl', [p[0] + ox * s, p[1], p[2] + oz * s], [q[0] + ox * s, q[1], q[2] + oz * s], 0.09, { tint: 0xff6fa8 });
    beam(b, 'lumenRib', p, q, 0.06, { glow: 0.8 });
    if (i % 3 === 0 && p[1] > y0 + 1.6) beam(b, 'concreteCyl', [p[0], y0, p[2]], [p[0], p[1] - 0.05, p[2]], 0.16, { tint: 0xf6f2ea });
  });
  // Station canopy and a waiting train.
  const st = pts[Math.round(N * 0.9)]!;
  b.add({ piece: 'slab', p: [st[0], y0, st[2]], s: [3.2, 0.9, 1.6], tint: 0xc6a8ff });
  for (let k = 0; k < 4; k++) {
    const p = pts[Math.round(N * 0.86) + k]!;
    b.add({ piece: 'pod', p: [p[0], p[1] + 0.05, p[2]], s: [0.9, 0.9, 0.7], r: TAU * (0.86 + k / N) + Math.PI / 2, tint: PASTEL[k]!, glow: 0.6 });
  }
}

export default defineBuilding({
  id: 'bloomtopia',
  name: 'Bloomtopia Wonder Park',
  description:
    'The island’s amusement park, fenced in glass on its own islet: the Comet Loop coaster, the Sky Orbit wheel, the Petal Drop tower, a dandelion swing ride, the Firefly Carousel, spinning Bloom Cups and a splash lagoon, all behind a neon gate. Every ride runs on the sun.',
  category: 'commercial',
  footprint: [36, 16],
  stats: { cost: 8000, energy: -40, eco: 10, happiness: 60, population: 0, jobs: 40, pollution: 0, water: -15 },
  growthTime: 240,
  variants: 1,
  recipe(b) {
    const G = 0.15;
    // Lawn, paths and the central plaza.
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [HX * 2 - 0.2, G, HZ * 2 - 0.2] });
    b.add({ piece: 'slab', p: [0, G, -3.6], s: [3, 0.05, 8], tint: 0xf3e6d8 });
    b.add({ piece: 'slab', p: [0, G, 1.8], s: [30, 0.05, 2.4], tint: 0xf3e6d8 });
    b.add({ piece: 'concreteCyl', p: [0, G, 1.8], s: [7, 0.06, 7], tint: 0xf3e6d8 });
    // Fountain in the plaza: basin, pool and a ring of light jets.
    b.add({ piece: 'concreteCyl', p: [0, G, 1.8], s: [3.6, 0.45, 3.6], tint: 0xf6f2ea });
    b.add({ piece: 'pool', p: [0, G + 0.45, 1.8], s: [3.0, 0.04, 3.0] });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.add({ piece: 'lumenRib', p: [Math.cos(a) * 1.1, G + 0.45, 1.8 + Math.sin(a) * 1.1], s: [0.06, 1.2, 0.06], glow: 0.7 });
    }
    b.add({ piece: 'haloRing', p: [0, G + 1.7, 1.8], s: [2.4, 4, 2.4], glow: 0.8 });

    // Fence round the park, open between the gate pylons.
    const y = G;
    fence(b, [-HX + 0.3, -HZ + 0.3], [-GATE_X - 0.8, -HZ + 0.3], y);
    fence(b, [GATE_X + 0.8, -HZ + 0.3], [HX - 0.3, -HZ + 0.3], y);
    fence(b, [HX - 0.3, -HZ + 0.3], [HX - 0.3, HZ - 0.3], y);
    fence(b, [HX - 0.3, HZ - 0.3], [-HX + 0.3, HZ - 0.3], y);
    fence(b, [-HX + 0.3, HZ - 0.3], [-HX + 0.3, -HZ + 0.3], y);

    // The gate: two glass pylons ringed with light, the neon sign between them, turnstile booths below.
    const gz = -HZ + 0.4;
    for (const s of [-1, 1]) {
      b.add({ piece: 'concreteCyl', p: [s * GATE_X, G, gz], s: [2.2, 0.4, 2.2], tint: 0xf6f2ea });
      b.add({ piece: 'concreteCyl', p: [s * GATE_X, G + 0.4, gz], s: [1.5, 9.4, 1.5], tint: 0xf3eefc });
      for (let i = 0; i < 5; i++) b.add({ piece: 'haloRing', p: [s * GATE_X, G + 1.6 + i * 1.8, gz], s: [2.1, 4, 2.1], glow: 0.8 });
      for (let k = 0; k < 8; k++)
        b.add({ piece: 'solarLeaf', p: [s * GATE_X, G + 9.8, gz], s: [1.6, 1, 0.9], r: (k / 8) * TAU, rz: -0.5, growAt: 0.3 });
      b.add({ piece: 'spireCone', p: [s * GATE_X, G + 9.8, gz], s: [0.5, 2.2, 0.5], tint: PALETTE.glassWarm, glow: 0.5 });
    }
    b.add({ piece: 'slab', p: [0, G + 6.2, gz], s: [GATE_X * 2 - 1.4, 2.6, 0.4], tint: 0xc24a78 });
    b.add({ piece: 'slab', p: [0, G + 8.8, gz], s: [GATE_X * 2 - 1.0, 0.18, 0.6], tint: 0xf6f2ea });
    b.add({ piece: 'slab', p: [0, G + 6.05, gz], s: [GATE_X * 2 - 1.0, 0.18, 0.6], tint: 0xf6f2ea });
    sign(b, 0, G + 7.5, gz - 0.25, 0.28);
    // A blossom star over the sign.
    b.add({ piece: 'haloRing', p: [0, G + 10.2, gz], s: [2.4, 2.4, 2.4], rx: Math.PI / 2, glow: 1 });
    for (let k = 0; k < 6; k++)
      b.add({ piece: 'sunPetal', p: [0, G + 10.2, gz], s: [1.2, 1, 0.6], r: Math.PI / 2, rx: (k / 6) * TAU, tint: PASTEL[k]!, glow: 0.6 });
    [-6, -2.6, 2.6, 6].forEach((x, k) => {
      b.add({ piece: 'concreteCyl', p: [x, G, gz + 0.6], s: [1.5, 1.6, 1.5], tint: PASTEL[k]! });
      b.add({ piece: 'dome', p: [x, G + 1.6, gz + 0.6], s: [1.8, 0.7, 1.8] });
    });

    // West: the Comet Loop coaster.
    coaster(b, -12.4, 0.2, 4.2, 5.0, G);

    // Petal Drop: a 22-unit tower with a ring of seats paused at the top of the lift.
    const [tx, tz] = [-4.4, 5.0];
    b.add({ piece: 'concreteCyl', p: [tx, G, tz], s: [2.4, 0.5, 2.4], tint: 0xc6a8ff });
    b.add({ piece: 'concreteCyl', p: [tx, G, tz], s: [0.9, 22, 0.9], tint: 0xf6f2ea });
    for (let i = 0; i < 11; i++) b.add({ piece: 'haloRing', p: [tx, G + 1 + i * 2, tz], s: [1.2, 4, 1.2], glow: 0.6 });
    b.add({ piece: 'concreteCyl', p: [tx, G + 15, tz], s: [2.8, 0.4, 2.8], tint: 0xff6fa8 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.add({ piece: 'pod', p: [tx + Math.cos(a) * 1.5, G + 14.4, tz + Math.sin(a) * 1.5], s: [0.6, 0.9, 0.6], r: -a, tint: PASTEL[k % 6]!, glow: 0.5 });
    }
    for (let k = 0; k < 7; k++)
      b.add({ piece: 'sunPetal', p: [tx, G + 22, tz], s: [1.8, 1, 0.9], r: (k / 7) * TAU, rz: -0.6, tint: PASTEL[k % 6]!, glow: 0.5 });

    // Firefly Carousel by the gate: a glass canopy over pastel pod-horses on glowing poles.
    const [cx, cz] = [-4.6, -4.0];
    b.add({ piece: 'concreteCyl', p: [cx, G, cz], s: [5.2, 0.35, 5.2], tint: 0xffe2f0 });
    b.add({ piece: 'concreteCyl', p: [cx, G, cz], s: [0.8, 3.4, 0.8], tint: 0xffd36e });
    b.add({ piece: 'spireCone', p: [cx, G + 3.4, cz], s: [6.0, 1.8, 6.0], tint: 0xffd6ec, glow: 0.3 });
    b.add({ piece: 'haloRing', p: [cx, G + 3.4, cz], s: [5.8, 4, 5.8], glow: 1 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      const [hx, hz] = [cx + Math.cos(a) * 2.0, cz + Math.sin(a) * 2.0];
      b.add({ piece: 'lumenRib', p: [hx, G + 0.35, hz], s: [0.05, 3.05, 0.05], glow: 0.6 });
      b.add({ piece: 'pod', p: [hx, G + 0.9 + (k % 2) * 0.4, hz], s: [0.8, 0.7, 0.45], r: -a, tint: PASTEL[k % 6]!, glow: 0.4 });
    }

    // East: the Sky Orbit wheel, its face to the bridge.
    const [wx, wz, R, HUB] = [11.6, -2.6, 6.0, 7.4];
    b.add({ piece: 'slab', p: [wx, G, wz + 1.4], s: [5, 0.8, 1.6], tint: 0x9fe6ff });
    for (const z of [-1.0, 1.0]) {
      beam(b, 'concreteCyl', [wx - 3.0, G, wz + z], [wx, HUB, wz + z * 0.35], 0.4, { tint: 0xf6f2ea });
      beam(b, 'concreteCyl', [wx + 3.0, G, wz + z], [wx, HUB, wz + z * 0.35], 0.4, { tint: 0xf6f2ea });
    }
    for (const z of [-0.35, 0.35]) b.add({ piece: 'haloRing', p: [wx, HUB, wz + z], s: [R * 2, R * 2, R * 2], rx: Math.PI / 2, glow: 1 });
    b.add({ piece: 'haloRing', p: [wx, HUB, wz], s: [2.2, 2.2, 2.2], rx: Math.PI / 2, glow: 1 });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rim: Vec3 = [wx + Math.cos(a) * R, HUB + Math.sin(a) * R, wz];
      beam(b, 'lumenRib', [wx, HUB, wz], rim, 0.05, { glow: 0.6 });
      b.add({ piece: 'pod', p: [rim[0], rim[1] - 0.85, wz], s: [1.0, 1.3, 1.1], tint: PASTEL[k % 6]!, glow: 0.6 });
    }

    // Dandelion swing ride: seats flung out on glowing chains from a seed-head crown.
    const [dx, dz] = [4.8, -4.4];
    b.add({ piece: 'concreteCyl', p: [dx, G, dz], s: [2.0, 0.4, 2.0], tint: 0x8ff0b0 });
    b.add({ piece: 'concreteCyl', p: [dx, G, dz], s: [0.55, 7.2, 0.55], tint: 0xf6f2ea });
    b.add({ piece: 'dome', p: [dx, G + 7.2, dz], s: [3.4, 1.4, 3.4] });
    b.add({ piece: 'haloRing', p: [dx, G + 7.1, dz], s: [3.6, 4, 3.6], glow: 0.9 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const top: Vec3 = [dx + Math.cos(a) * 1.5, G + 7.1, dz + Math.sin(a) * 1.5];
      const seat: Vec3 = [dx + Math.cos(a) * 2.6, G + 3.6, dz + Math.sin(a) * 2.6];
      beam(b, 'lumenRib', seat, top, 0.035, { glow: 0.5 });
      b.add({ piece: 'pod', p: [seat[0], seat[1] - 0.35, seat[2]], s: [0.5, 0.7, 0.45], r: -a, tint: PASTEL[k % 6]!, glow: 0.4 });
    }

    // Bloom Cups: pastel teacups spinning on a flower turntable.
    const [ux, uz] = [13.8, 4.2];
    b.add({ piece: 'concreteCyl', p: [ux, G, uz], s: [6.0, 0.3, 6.0], tint: 0xffe2f0 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      b.add({ piece: 'sunPetal', p: [ux, G + 0.3, uz], s: [3.0, 1, 1.2], r: a, tint: 0xffb7d5 });
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const [px, pz] = [ux + Math.cos(a) * 1.9, uz + Math.sin(a) * 1.9];
      b.add({ piece: 'concreteCyl', p: [px, G + 0.3, pz], s: [1.3, 0.75, 1.3], tint: PASTEL[k]! });
      b.add({ piece: 'haloRing', p: [px, G + 1.05, pz], s: [1.3, 4, 1.3], glow: 0.6 });
    }
    b.add({ piece: 'concreteCyl', p: [ux, G + 0.3, uz], s: [0.5, 1.6, 0.5], tint: 0xffd36e });
    b.add({ piece: 'dome', p: [ux, G + 1.9, uz], s: [1.6, 0.8, 1.6] });

    // Splash lagoon with a log flume falling off a mossy hill.
    const [lx, lz] = [6.4, 5.2];
    b.add({ piece: 'concreteCyl', p: [lx, G, lz], s: [6.4, 0.2, 4.0], tint: 0xf6f2ea });
    b.add({ piece: 'pool', p: [lx, G + 0.2, lz], s: [5.6, 0.04, 3.2] });
    b.add({ piece: 'mossBox', p: [lx + 3.0, G, lz + 1.0], s: [2.2, 3.4, 2.0], r: 0.3 });
    beam(b, 'slab', [lx + 2.6, G + 3.3, lz + 0.6], [lx + 0.4, G + 0.25, lz], 0.7, { tint: 0x9fe6ff });
    b.add({ piece: 'waterfall', p: [lx + 1.9, G + 0.2, lz - 0.1], s: [0.9, 3.0, 1], r: 0.3, glow: 0.6 });
    for (const [x, z, k] of [[lx - 1.4, lz - 0.4, 0], [lx + 0.6, lz + 0.8, 2]] as const)
      b.add({ piece: 'pod', p: [x, G + 0.22, z], s: [1.3, 0.6, 0.6], r: 0.3 * k, tint: PASTEL[k]!, glow: 0.3 });

    // Snack kiosks with candy awnings along the promenade.
    for (const [x, k] of [[-2.0, 0], [2.0, 1]] as const) {
      b.add({ piece: 'concreteCyl', p: [x, G, 4.6], s: [1.3, 1.3, 1.3], tint: PASTEL[k + 2]! });
      b.add({ piece: 'concreteCyl', p: [x, G + 1.3, 4.6], s: [1.9, 0.12, 1.9], tint: PASTEL[k]! });
    }

    // Trees and flower beds inside the fence.
    for (let i = 0; i < 5; i++) tree(b, -16.4 + i * 3.6, G, HZ - 1.1, 0.9, 0.2);
    for (const z of [-5.5, 0, 5]) tree(b, -HX + 1.2, G, z, 0.9, 0.2);
    tree(b, HX - 1.2, G, -5.6, 0.9, 0.2);
    for (const x of [-7.4, 7.4]) flowers(b, x, G, gz + 1.6, 1.0, 18, 0.1, 0.7);
    grassTufts(b, 0, G, -0.4, 26, 0.8, 36);
  },
});
