import { defineBuilding, type Vec3 } from '../types';
import { PALETTE, beam, flowers, grassTufts } from '../kit';

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
  },
});
