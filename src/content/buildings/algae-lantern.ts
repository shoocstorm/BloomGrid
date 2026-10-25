import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

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
    b.add({ piece: 'concreteCyl', p: [0, H + 0.3, 0], s: [2.6, 0.2, 2.6], tint: PALETTE.concrete });
    b.add({ piece: 'algaeTank', p: [0, H + 0.5, 0], s: [1.2, 1.4, 1.2] });
    for (let k = 0; k < 10; k++)
      b.add({
        piece: 'solarLeaf',
        p: [0, H + 0.5, 0],
        s: [1.6, 1, 1.0],
        r: (k / 10) * TAU,
        rz: 0.4,
        growAt: 0.2,
      });
  },
});
