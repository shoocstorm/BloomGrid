import { defineBuilding } from '../types';
import { PALETTE, entrance, flowers, grassTufts, lamp, railing } from '../kit';

const TAU = Math.PI * 2;
const H = 14;

export default defineBuilding({
  id: 'heliostat-array',
  name: 'Heliostat Sunflower Array',
  description:
    'Fifty sunflower mirrors turn through the day to focus sunlight on a receiver at the top of a slender tower, which glows like a second sun. Clean power for a whole district.',
  category: 'energy',
  footprint: [10, 10],
  stats: { cost: 3400, energy: 180, eco: 6, happiness: 8, population: 0, jobs: 20, pollution: 0 },
  growthTime: 150,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.12, 9.8] });
    grassTufts(b, 0, 0.12, 0, 9.4, 9.4, 120);
    flowers(b, 0, 0.12, 0, 4.6, 60, 0, 0.6);
    // Receiver tower.
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [1.6, H, 1.6], tint: PALETTE.concrete });
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [2.6, 1.2, 2.6], tint: 0xe9f4ef });
    const receiver = (y: number, k = 1) => {
      b.add({ piece: 'glassCyl', p: [0, y, 0], s: [2.2 * k, 2.0 * k, 2.2 * k], tint: 0xffe08a, glow: 1 });
      for (let i = 0; i < 4; i++)
        b.add({ piece: 'haloRing', p: [0, y + (0.2 + i * 0.5) * k, 0], s: [2.6 * k, 4, 2.6 * k], glow: 1 });
      b.add({ piece: 'spireCone', p: [0, y + 2 * k, 0], s: [1.6 * k, 2.0 * k, 1.6 * k], tint: PALETTE.glassWarm, glow: 0.5 });
    };
    b.upTo(1, () => receiver(H));
    // Heliostats in rings, each mirror tilted to face the receiver.
    let n = 0;
    for (const [r, count] of [
      [2.4, 12],
      [3.4, 16],
      [4.4, 22],
    ] as const) {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + r;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.1, 0.7, 0.1], tint: 0xe9f4ef });
        // Petal pointing back toward the tower, tilted up so its face looks at the receiver.
        b.add({
          piece: 'solarLeaf',
          p: [x + Math.cos(a) * 0.45, 0.82, z + Math.sin(a) * 0.45],
          s: [0.9, 1, 2.0],
          r: Math.PI - a,
          rz: 0.55,
          growAt: (n++ % 10) * 0.05,
        });
      }
    }
    // Site detail (D-097): a lit control-room door at the tower's foot, a low fence round the field with a gap at
    // the front, and lamps at its corners.
    entrance(b, 0, 0.12, 1.3, 0.5, 0.42, 0xffe08a);
    const e = 4.8;
    railing(b, 0, 0.12, -e, 2 * e);
    railing(b, e, 0.12, 0, 2 * e, true);
    railing(b, -e, 0.12, 0, 2 * e, true);
    for (const sx of [-1, 1]) railing(b, sx * 2.9, 0.12, e, 3.8);
    for (const [x, z] of [
      [-4.6, -4.6],
      [4.6, -4.6],
      [-1.1, 4.6],
      [1.1, 4.6],
    ] as const)
      lamp(b, x, 0.12, z, 0.6);

    // Levels (D-100). A ring of heliostats on stands at radius r.
    const ring = (r: number, count: number, h: number) => {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + r * 1.3;
        const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
        b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.08, h, 0.08], tint: 0xe9f4ef });
        b.add({ piece: 'solarLeaf', p: [x + Math.cos(a) * 0.35, 0.12 + h, z + Math.sin(a) * 0.35], s: [0.7, 1, 1.4], r: Math.PI - a, rz: 0.65 });
      }
    };
    // Level 2: the tower climbs three units to a bigger receiver, and a raised ring of mirrors fills the gaps
    // between the inner rings.
    b.level(2, () => {
      b.add({ piece: 'concreteCyl', p: [0, H, 0], s: [1.4, 3, 1.4], tint: PALETTE.concrete });
      b.upTo(2, () => receiver(H + 3, 1.15));
      ring(2.9, 14, 1.1);
    });
    // Level 3: a molten-salt store (two lit tanks) by the gate and a receiver half again as large with a crown of
    // light.
    b.level(3, () => {
      b.add({ piece: 'concreteCyl', p: [0, H, 0], s: [1.4, 3, 1.4], tint: PALETTE.concrete });
      ring(2.9, 14, 1.1);
      receiver(H + 3, 1.4);
      b.add({ piece: 'haloRing', p: [0, H + 6.4, 0], s: [4.2, 4, 4.2], tint: 0xffb36b, glow: 1 });
      for (const x of [-3.9, 3.9]) {
        b.add({ piece: 'concreteCyl', p: [x, 0.12, 3.9], s: [0.9, 1.2, 0.9], tint: 0xe9f4ef });
        b.add({ piece: 'haloRing', p: [x, 0.9, 3.9], s: [0.95, 2, 0.95], tint: 0xffb36b, glow: 1 });
      }
    });
  },
});
