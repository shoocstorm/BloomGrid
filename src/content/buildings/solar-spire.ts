import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

export default defineBuilding({
  id: 'solar-spire',
  name: 'Sunflower Spire',
  description: 'A slender solar-glass spire whose photovoltaic petals unfurl toward the sun.',
  category: 'energy',
  footprint: [2, 2],
  stats: { cost: 220, energy: 40, eco: 1, happiness: 1, population: 0, jobs: 4, pollution: 0 },
  growthTime: 60,
  cleanEnergy: true,
  recipe(b) {
    const h = b.range(3.2, 4.2);
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.6, 0.12, 1.6] });
    grassTufts(b, 0, 0.12, 0, 1.5, 1.5, 14);
    flowers(b, 0, 0.12, 0, 0.75, 14, 0, 0.5);
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0], s: [0.42, h, 0.42], tint: PALETTE.glassWarm });
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [0.55, 0.4, 0.55], tint: PALETTE.concrete });
    // Spiral of ivy up the shaft
    for (let i = 0; i < 6; i++) {
      b.add({ piece: 'ivy', p: [Math.cos(i) * 0.22, 0.6 + i * (h / 7), Math.sin(i) * 0.22], s: [0.12, 0.5, 1], r: -i + Math.PI / 2, growAt: 0.1 * i });
    }
    // Sunflower crown
    const top = h + 0.12;
    b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [0.5, 0.12, 0.5], tint: 0xffe08a, glow: 0.4 });
    const petals = 12;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 + ring * 0.26;
        b.add({
          piece: 'solarLeaf',
          p: [0, top + 0.08 + ring * 0.04, 0],
          s: [0.9 - ring * 0.25, 1, 0.9 - ring * 0.25],
          r: a,
          rz: 0.35 + ring * 0.3,
          growAt: 0.05 + (i / petals) * 0.3 + ring * 0.2,
        });
      }
    }
  },
});
