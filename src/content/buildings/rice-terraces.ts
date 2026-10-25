import { defineBuilding } from '../types';
import { PALETTE, grassTufts, tree } from '../kit';

const TIERS = 7;

export default defineBuilding({
  id: 'rice-terraces',
  name: 'Rice Terrace Hill',
  description:
    'A hill sculpted into seven flooded rice terraces that mirror the sky, fed by a spring at the top beside a farmhouse and its old tree. Feeds the north terrace and glows with fireflies at dusk.',
  category: 'food',
  footprint: [11, 10],
  stats: {
    cost: 2600,
    energy: -4,
    eco: 22,
    happiness: 14,
    population: 0,
    jobs: 70,
    pollution: -2,
    water: -30,
    food: 450,
  },
  growthTime: 200,
  pollinators: 2,
  variants: 1,
  recipe(b) {
    for (let i = 0; i < TIERS; i++) {
      const d = 9.8 - i * 1.3;
      const y = i * 0.55;
      b.add({
        piece: 'concreteCyl',
        p: [0, y, 0],
        s: [d * 1.08, 0.55, d],
        tint: i % 2 ? 0x9c8b70 : 0x8a7a64,
      });
      // The flooded paddy on top, rimmed with rice.
      b.add({ piece: 'pool', p: [0, y + 0.55, 0], s: [d * 0.74, 0.04, d * 0.68], r: i * 0.35 });
      grassTufts(b, 0, y + 0.55, 0, d * 0.85, d * 0.8, Math.round(d * 5), 0.05);
    }
    const top = TIERS * 0.55;
    b.add({ piece: 'slab', p: [0.6, top, 0.2], s: [1.4, 0.9, 1.0], tint: 0xc8a57c });
    b.add({
      piece: 'glassBox',
      p: [0.6, top + 0.9, 0.2],
      s: [1.5, 0.12, 1.1],
      tint: PALETTE.glassWarm,
      glow: 0.5,
    });
    tree(b, -0.8, top, -0.4, 1.2, 0.1);
    b.add({ piece: 'waterfall', p: [0, 0.3, 4.6], s: [0.6, top - 0.2, 1], glow: 0.6 });
    // Fireflies at dusk: low light points over the paddies.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const r = 1.2 + (k % 3) * 1.1;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * r, (TIERS - 1 - (k % 3) * 2) * 0.55 + 0.9, Math.sin(a) * r],
        s: [0.06, 0.06, 0.06],
        glow: 1,
      });
    }
  },
});
