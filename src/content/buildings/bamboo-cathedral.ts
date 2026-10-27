import { defineBuilding, type Vec3 } from '../types';
import { beam, flowers, grassTufts, tree } from '../kit';

const RIBS = 9;
const SEG = 6;
const W = 3.6; // half span
const BAMBOO = 0xc2cc72;

/** A point on a lancet arch: vertical at the springing, pointed at the apex. */
const arch = (x: number, side: number, h: number, t: number): Vec3 => [
  x,
  0.12 + h * Math.pow(t, 0.6),
  side * W * Math.cos((t * Math.PI) / 2),
];

export default defineBuilding({
  id: 'bamboo-cathedral',
  name: 'Bamboo Cathedral',
  description:
    'A gothic nave woven from living giant bamboo, its pointed ribs swelling to a crossing ten storeys high. Concerts, weddings and the island’s quietest naps happen under its glowing ridge.',
  category: 'nature',
  footprint: [12, 8],
  stats: {
    cost: 3400,
    energy: -6,
    eco: 24,
    happiness: 30,
    population: 0,
    jobs: 24,
    pollution: -2,
    water: -6,
  },
  growthTime: 220,
  pollinators: 2,
  variants: 1,
  style: 'bamboo',
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [11.8, 0.12, 7.8] });
    b.add({ piece: 'timberBox', p: [0, 0.12, 0], s: [11.2, 0.06, 1.6], tint: 0xc8a57c });
    for (const sz of [-1, 1]) {
      grassTufts(b, 0, 0.12, sz * 2.4, 11, 2.2, 60);
      flowers(b, -3, 0.12, sz * 2.6, 1.1, 18, 0, 0.6);
      flowers(b, 3, 0.12, sz * 2.6, 1.1, 18, 0, 0.6);
    }
    tree(b, 0, 0.18, 0, 1.3, 0.2);
    // Ribs: lancet arches across the nave, tallest at the crossing.
    const apexes: Vec3[] = [];
    for (let i = 0; i < RIBS; i++) {
      const x = -5 + (i * 10) / (RIBS - 1);
      const h = 10 - Math.abs(i - (RIBS - 1) / 2) * 1.0;
      for (const side of [-1, 1])
        for (let s = 0; s < SEG; s++) {
          const a = arch(x, side, h, s / SEG);
          const c = arch(x, side, h, (s + 1) / SEG);
          beam(b, 'timberBox', a, c, 0.24, { tint: BAMBOO });
        }
      apexes.push(arch(x, 1, h, 1));
      // Ivy trailing from the shoulders.
      for (const side of [-1, 1]) {
        const p = arch(x, side, h, 0.55);
        b.add({ piece: 'ivy', p, s: [0.5, 1.6, 1], r: side > 0 ? 0 : Math.PI, growAt: 0.3 });
      }
    }
    // Purlins along the nave at the shoulders, and a glowing ridge.
    for (let i = 0; i < RIBS - 1; i++) {
      const x0 = -5 + (i * 10) / (RIBS - 1);
      const x1 = -5 + ((i + 1) * 10) / (RIBS - 1);
      const h0 = 10 - Math.abs(i - (RIBS - 1) / 2) * 1.0;
      const h1 = 10 - Math.abs(i + 1 - (RIBS - 1) / 2) * 1.0;
      for (const side of [-1, 1])
        for (const t of [0.45, 0.8])
          beam(b, 'timberBox', arch(x0, side, h0, t), arch(x1, side, h1, t), 0.14, { tint: BAMBOO });
      beam(b, 'lumenRib', apexes[i]!, apexes[i + 1]!, 0.12, { glow: 0.9 });
    }
  },
});
