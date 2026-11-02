import { defineBuilding } from '../types';
import { PALETTE, bench, entrance, flowers, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;
const H = 19;
const TUBES = 16;

export default defineBuilding({
  id: 'algae-lantern',
  name: 'Algae Lantern Tower',
  description:
    'A photobioreactor tower: sixteen bubbling tubes of microalgae spiral round its core, eating CO₂ and making power. At night it glows like a green lantern over the boulevard.',
  category: 'energy',
  footprint: [6, 6],
  stats: {
    cost: 3200,
    energy: 120,
    eco: 8,
    happiness: 8,
    population: 0,
    jobs: 30,
    pollution: -6,
    water: -10,
  },
  growthTime: 150,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [5.8, 0.3, 5.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [4.0, 0.06, 4.0], r: Math.PI / 4 });
    grassTufts(b, 0, 0.36, 0, 3.8, 3.8, 30);
    flowers(b, 0, 0.36, 0, 2.0, 24, 0, 0.6);
    // Core: a tapering glass lantern.
    b.add({ piece: 'glassCyl', p: [0, 0.3, 0], s: [2.6, H * 0.55, 2.6], tint: PALETTE.glassWarm, glow: 0.2 });
    b.add({
      piece: 'glassCyl',
      p: [0, 0.3 + H * 0.55, 0],
      s: [2.0, H * 0.45, 2.0],
      tint: PALETTE.glassWarm,
      glow: 0.2,
    });
    // Spiralling algae tubes: short tilted segments that twist a quarter turn up the tower.
    const SEG = 10;
    for (let k = 0; k < TUBES; k++)
      for (let s = 0; s < SEG; s++) {
        const t = s / SEG;
        const a = (k / TUBES) * TAU + t * (Math.PI / 2);
        const r = 1.7 - t * 0.45;
        b.add({
          piece: 'algaeTank',
          p: [Math.cos(a) * r, 0.3 + t * H, Math.sin(a) * r],
          s: [0.22, H / SEG + 0.05, 0.22],
          r: -a,
          rx: 0.1,
        });
      }
    // Collar rings holding the tubes.
    for (let i = 1; i < 5; i++) {
      const r = 1.7 - (i / 5) * 0.45;
      b.add({ piece: 'haloRing', p: [0, 0.3 + (i / 5) * H, 0], s: [r * 2 + 0.3, 5, r * 2 + 0.3], glow: 0.6 });
    }
    // Lantern crown: a green dome with solar petals.
    const crown = (y: number, k = 1) => {
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [2.6, 0.2, 2.6], tint: PALETTE.concrete });
      b.add({ piece: 'algaeTank', p: [0, y + 0.2, 0], s: [1.2, 1.4 * k, 1.2] });
      for (let k = 0; k < 10; k++)
        b.add({
          piece: 'solarLeaf',
          p: [0, y + 0.2, 0],
        s: [1.6, 1, 1.0],
        r: (k / 10) * TAU,
          rz: 0.4,
          growAt: 0.2,
        });
    };
    b.upTo(1, () => crown(H + 0.3));
    // Street level (D-097): a lit door between the tubes, a paved path, lamps and benches, bollards on the rim.
    entrance(b, 0, 0.3, 1.32, 0.5, 0.45, 0x8fd35a);
    b.add({ piece: 'slab', p: [0, 0.36, 2.15], s: [0.7, 0.02, 1.4], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) {
      lamp(b, sx * 0.55, 0.36, 2.5, 0.6);
      bench(b, sx * 1.6, 0.36, 1.8, 0.42, false);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 2.7, 0.3, Math.sin(a) * 2.7],
        s: [0.07, 0.18, 0.07],
        tint: 0xffd9a0,
        glow: 0.9,
      });
    }

    // Levels (D-100). A section of the twisting tube cage from height y0, h tall, starting at radius r.
    const cage = (y0: number, h: number, r: number, turn: number) => {
      const seg = 5;
      for (let k = 0; k < TUBES; k++)
        for (let s = 0; s < seg; s++) {
          const t = s / seg;
          const a = (k / TUBES) * TAU + turn + t * (Math.PI / 4);
          b.add({ piece: 'algaeTank', p: [Math.cos(a) * (r - t * 0.2), y0 + t * h, Math.sin(a) * (r - t * 0.2)], s: [0.2, h / seg + 0.05, 0.2], r: -a, rx: 0.1 });
        }
      b.add({ piece: 'glassCyl', p: [0, y0, 0], s: [1.8, h, 1.8], tint: PALETTE.glassWarm, glow: 0.2 });
    };
    // Level 2: the lantern grows a quarter of its height again, the cage twisting on round it; the crown rides up.
    b.level(2, () => {
      cage(H + 0.3, 4.5, 1.25, Math.PI / 2);
      b.upTo(2, () => crown(H + 4.8));
    });
    // Level 3: a second section, a taller glowing crown tank, and a ring of algae tanks round the base.
    b.level(3, () => {
      cage(H + 0.3, 4.5, 1.25, Math.PI / 2);
      cage(H + 4.8, 3.5, 1.05, Math.PI * 0.75);
      crown(H + 8.3, 1.6);
      b.add({ piece: 'haloRing', p: [0, H + 9.6, 0], s: [2.6, 4, 2.6], tint: 0x8fd35a, glow: 1 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + 0.3;
        if (Math.abs(a - Math.PI / 2) < 0.4) continue;
        b.add({ piece: 'algaeTank', p: [Math.cos(a) * 2.2, 0.36, Math.sin(a) * 2.2], s: [0.3, 0.9, 0.3], glow: 1 });
      }
    });
  },
});
