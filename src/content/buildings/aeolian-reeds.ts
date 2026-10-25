import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts } from '../kit';

const REEDS = 72;

export default defineBuilding({
  id: 'aeolian-reeds',
  name: 'Aeolian Reed Field',
  description:
    'A meadow of bladeless wind reeds that sway with the breeze and turn it into power. Their tips glow brighter the harder the wind blows, so the field shimmers on stormy nights.',
  category: 'energy',
  footprint: [10, 10],
  stats: { cost: 2800, energy: 90, eco: 12, happiness: 12, population: 0, jobs: 10, pollution: 0 },
  growthTime: 140,
  cleanEnergy: true,
  pollinators: 2,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [9.8, 0.12, 9.8] });
    grassTufts(b, 0, 0.12, 0, 9.4, 9.4, 150);
    flowers(b, 0, 0.12, 0, 4.6, 90, 0, 0.6);
    // Boardwalk to a small glass pavilion in the middle of the field.
    b.add({ piece: 'timberBox', p: [0, 0.12, 0], s: [9.6, 0.1, 0.8], r: 0.4, tint: 0xc8a57c });
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0], s: [1.6, 1.1, 1.6], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'concreteCyl', p: [0, 1.22, 0], s: [2.0, 0.1, 2.0], tint: PALETTE.concrete });
    // Reeds: tallest toward the middle, a glowing tip on each.
    for (let i = 0; i < REEDS; i++) {
      const x = b.range(-4.6, 4.6);
      const z = b.range(-4.6, 4.6);
      const d = Math.hypot(x, z);
      if (d < 1.3) continue;
      const h = Math.max(2.5, 9 - d * 0.9 + b.range(-1, 1));
      b.add({ piece: 'concreteCyl', p: [x, 0.12, z], s: [0.12, h, 0.12], tint: 0xb8c79a });
      b.add({ piece: 'lumenRib', p: [x, 0.12 + h - 0.7, z], s: [0.15, 0.75, 0.15], glow: b.range(0.6, 1) });
    }
  },
});
