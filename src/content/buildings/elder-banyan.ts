import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, TRIM, beam, bench, flowers, gableRoof, grassTufts, railRing } from '../kit';

const TAU = Math.PI * 2;
const lerp = (a: Vec3, c: Vec3, t: number): Vec3 => [
  a[0] + (c[0] - a[0]) * t,
  a[1] + (c[1] - a[1]) * t,
  a[2] + (c[2] - a[2]) * t,
];

export default defineBuilding({
  id: 'elder-banyan',
  name: 'Elder Banyan Treehouse Hotel',
  description:
    'A colossal banyan grown over two centuries of careful steering: glass treehouse suites hang in its limbs, rope bridges link them, and aerial roots fall like curtains to a fungus-lit garden.',
  category: 'commercial',
  footprint: [10, 10],
  stats: {
    cost: 4600,
    energy: -16,
    eco: 30,
    happiness: 26,
    population: 0,
    jobs: 90,
    pollution: -4,
    water: -14,
  },
  growthTime: 260,
  pollinators: 2,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.15, 9.8] });
    grassTufts(b, 0, 0.15, 0, 9.4, 9.4, 110);
    flowers(b, 0, 0.15, 0, 4.4, 70, 0, 0.6);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      b.add({
        piece: 'fungus',
        p: [Math.cos(a) * 4.4, 0.15, Math.sin(a) * 4.4],
        s: 0.45,
        tint: 0xf6efe4,
        glow: 0.9,
        growAt: 0.1,
      });
    }
    // A fused trunk of five stems round a core.
    b.add({ piece: 'trunk', p: [0, 0.15, 0], s: [2.6, 13.5, 2.6], tint: PALETTE.bark });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      b.add({
        piece: 'trunk',
        p: [Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8],
        s: [1.5, 12, 1.5],
        r: a,
        tint: 0x7a5c44,
      });
    }
    // Buttress roots.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      beam(
        b,
        'trunk',
        [Math.cos(a) * 4.0, 0.1, Math.sin(a) * 4.0],
        [Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9],
        0.9,
        { tint: PALETTE.bark },
      );
    }
    // Limbs reaching out and up, each with a canopy, an aerial root and (on every other) a treehouse suite.
    const rooms: Vec3[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      const y0 = 8.2 + (k % 3) * 1.3;
      const base: Vec3 = [Math.cos(a) * 0.9, y0, Math.sin(a) * 0.9];
      const tip: Vec3 = [Math.cos(a) * 4.5, y0 + 2.4, Math.sin(a) * 4.5];
      beam(b, 'trunk', base, tip, 0.8, { tint: PALETTE.bark });
      b.add({
        piece: 'canopy',
        p: [tip[0], tip[1] - 1.0, tip[2]],
        s: 3.6,
        tint: PALETTE.leaves[k % 5],
        glow: k % 3 === 0 ? 0.4 : 0,
        growAt: 0.15,
      });
      const mid = lerp(base, tip, 0.7);
      b.add({
        piece: 'trunk',
        p: [mid[0], 0.15, mid[2]],
        s: [0.2, mid[1] - 0.15, 0.2],
        tint: 0x8a6a50,
        growAt: 0.4,
      });
      if (k % 2 === 0) {
        const r = lerp(base, tip, 0.5);
        rooms.push(r);
        b.add({
          piece: 'concreteCyl',
          p: [r[0], r[1] + 0.1, r[2]],
          s: [1.7, 0.12, 1.7],
          tint: PALETTE.concrete,
        });
        b.add({
          piece: 'glassCyl',
          p: [r[0], r[1] + 0.22, r[2]],
          s: [1.25, 0.95, 1.25],
          tint: PALETTE.glassWarm,
          glow: 0.6,
        });
        b.add({ piece: 'haloRing', p: [r[0], r[1] + 0.2, r[2]], s: [1.8, 4, 1.8], glow: 0.8 });
      }
    }
    // Rope bridges between the suites.
    for (let i = 0; i < rooms.length; i++) {
      const a = rooms[i]!;
      const c = rooms[(i + 1) % rooms.length]!;
      beam(b, 'timberBox', [a[0], a[1] + 0.15, a[2]], [c[0], c[1] + 0.15, c[2]], 0.22, { tint: 0xc8a57c });
    }
    // Crown.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      b.add({
        piece: 'canopy',
        p: [Math.cos(a) * 1.8, 12.5, Math.sin(a) * 1.8],
        s: 4.4,
        tint: PALETTE.leaves[(k + 2) % 5],
        growAt: 0.2,
      });
    }
    b.add({ piece: 'canopy', p: [0, 14, 0], s: 5, tint: 0x6fbf4a, glow: 0.3, growAt: 0.25 });
    // Visitors (D-097): a timber stair spiralling up the trunk to the first limbs, a lantern gate at the front with
    // a stepping-stone path to the roots, and benches either side of the gate.
    for (let i = 0; i < 44; i++) {
      const a = i * 0.36 + Math.PI / 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      b.add({
        piece: 'timberBox',
        p: [c * 2.35, 0.15 + i * 0.185, s * 2.35],
        s: [0.8, 0.05, 0.26],
        r: -a,
        tint: 0xc8a57c,
      });
      if (i % 3 === 0)
        b.add({
          piece: 'timberBox',
          p: [c * 2.73, 0.2 + i * 0.185, s * 2.73],
          s: [0.03, 0.32, 0.03],
          tint: PALETTE.bark,
        });
    }
    for (const sx of [-1, 1]) {
      b.add({ piece: 'timberBox', p: [sx * 0.85, 0.15, 4.6], s: [0.14, 1.6, 0.14], tint: 0x8a5a40 });
      b.add({ piece: 'lumenRib', p: [sx * 0.6, 1.2, 4.6], s: [0.14, 0.2, 0.14], tint: 0xffc58a, glow: 1 });
      bench(b, sx * 1.7, 0.15, 4.25);
    }
    b.add({ piece: 'timberBox', p: [0, 1.65, 4.6], s: [2.3, 0.12, 0.2], tint: 0x8a5a40 });
    b.add({ piece: 'timberBox', p: [0, 1.4, 4.6], s: [1.9, 0.07, 0.1], tint: 0x8a5a40 });
    for (let i = 0; i < 5; i++)
      b.add({
        piece: 'slab',
        p: [b.range(-0.08, 0.08), 0.15, 4.1 - i * 0.55],
        s: [0.42, 0.04, 0.34],
        r: b.range(-0.3, 0.3),
        tint: 0xb9b2a4,
      });

    // Levels (D-100). The branch for room k, as the recipe grows it.
    const limb = (k: number): [Vec3, Vec3] => {
      const a = (k / 7) * TAU + 0.3;
      const y0 = 8.2 + (k % 3) * 1.3;
      return [
        [Math.cos(a) * 0.9, y0, Math.sin(a) * 0.9],
        [Math.cos(a) * 4.5, y0 + 2.4, Math.sin(a) * 4.5],
      ];
    };
    // Level 2: tree-house rooms on the three bare limbs, rope bridges to their neighbours, and lanterns hanging
    // from every limb.
    b.level(2, () => {
      for (const k of [1, 3, 5]) {
        const [base, tip] = limb(k);
        const r = lerp(base, tip, 0.55);
        b.add({ piece: 'concreteCyl', p: [r[0], r[1] + 0.1, r[2]], s: [1.5, 0.12, 1.5], tint: 0xc8a57c });
        b.add({ piece: 'timberBox', p: [r[0], r[1] + 0.22, r[2]], s: [1.0, 0.8, 1.0], r: k, tint: 0xa47c56 });
        b.add({ piece: 'glassBox', p: [r[0], r[1] + 0.35, r[2]], s: [1.04, 0.35, 0.7], r: k, tint: PALETTE.glassWarm, glow: 0.6 });
        gableRoof(b, r[0], r[1] + 1.02, r[2], 1.1, 1.1, { pitch: 0.55, tint: 0x6f8a5a, overhang: 0.08 });
        for (const n of [k - 1, k + 1]) {
          const [b2, t2] = limb((n + 7) % 7);
          const o = lerp(b2, t2, 0.5);
          beam(b, 'timberBox', [r[0], r[1] + 0.15, r[2]], [o[0], o[1] + 0.15, o[2]], 0.16, { tint: 0xd9c49a });
        }
      }
      for (let k = 0; k < 7; k++) {
        const [base, tip] = limb(k);
        const m = lerp(base, tip, 0.85);
        b.add({ piece: 'timberBox', p: [m[0], m[1] - 0.9, m[2]], s: [0.02, 0.9, 0.02], tint: TRIM.rope });
        b.add({ piece: 'lumenRib', p: [m[0], m[1] - 1.05, m[2]], s: [0.16, 0.18, 0.16], tint: 0xffc58a, glow: 1 });
      }
    });
    // Level 3: a crown lookout breaks through the canopy (a timber deck round the trunk with a glass room, a
    // spire and a halo) and curtains of aerial roots fall round the old trunk.
    b.level(3, () => {
      b.add({ piece: 'trunk', p: [0, 13.6, 0], s: [1.0, 3.9, 1.0], tint: PALETTE.bark });
      b.add({ piece: 'concreteCyl', p: [0, 17.4, 0], s: [3.6, 0.15, 3.6], tint: 0xc8a57c });
      railRing(b, 0, 17.55, 0, 1.75, 20);
      b.add({ piece: 'glassCyl', p: [0, 17.55, 0], s: [1.6, 0.9, 1.6], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'dome', p: [0, 18.45, 0], s: [1.7, 1.0, 1.7], tint: PALETTE.glass });
      b.add({ piece: 'spireCone', p: [0, 18.9, 0], s: [0.25, 2.2, 0.25], tint: 0xffe08a, glow: 0.6 });
      b.add({ piece: 'haloRing', p: [0, 18.0, 0], s: [4.2, 4, 4.2], tint: 0xffe08a, glow: 0.9 });
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU + 0.1;
        const r = 1.7 + (k % 2) * 0.35;
        const h = 6.5 + (k % 3) * 0.8;
        b.add({ piece: 'trunk', p: [Math.cos(a) * r, 0.15, Math.sin(a) * r], s: [0.12, h, 0.12], tint: 0x8a6a50, growAt: 0.3 });
      }
    });
  },
});
