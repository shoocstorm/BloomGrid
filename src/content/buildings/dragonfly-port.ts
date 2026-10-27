import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge } from '../kit';

const TAU = Math.PI * 2;
const H = 22;

export default defineBuilding({
  id: 'dragonfly-port',
  name: 'Dragonfly Skyport',
  description:
    'The island’s great pod interchange: a slender mast with four tiers of iridescent dragonfly wings, each a landing deck where commuter pods berth by the dozen. Flies commuters from a wide district off the highways.',
  category: 'utility',
  footprint: [8, 8],
  stats: { cost: 3900, energy: -30, eco: 4, happiness: 10, population: 0, jobs: 40, pollution: 0 },
  growthTime: 160,
  transit: { radius: 26, riders: 1400 },
  variants: 1,
  style: 'verdigris',
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [7.6, 0.3, 7.6], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [5.2, 0.08, 5.2], r: Math.PI / 4 });
    grassTufts(b, 0, 0.38, 0, 5, 5, 50);
    flowers(b, 0, 0.38, 0, 2.6, 40, 0, 0.6);
    // Terminal hall and mast.
    b.add({ piece: 'glassCyl', p: [0, 0.3, 0], s: [3.4, 2.2, 3.4], tint: PALETTE.glassWarm, glow: 0.3 });
    b.add({ piece: 'concreteCyl', p: [0, 0.3, 0], s: [1.2, H, 1.2], tint: PALETTE.concrete });
    b.add({ piece: 'glassCyl', p: [0, 2.5, 0], s: [1.6, H - 3, 1.6], tint: PALETTE.glass, glow: 0.1 });
    // Four tiers of wings, each turned 45° from the last; pods berth along their edges.
    for (let t = 0; t < 4; t++) {
      const y = 5 + t * 4;
      const span = 7.2 - t * 1.1;
      const yaw = t * (Math.PI / 4);
      b.add({ piece: 'concreteCyl', p: [0, y - 0.2, 0], s: [2.4, 0.4, 2.4], tint: 0xe9f4ef });
      for (let w = 0; w < 4; w++) {
        const a = yaw + (w / 4) * TAU;
        // Wing: a long iridescent solar petal over a thin deck.
        if (w < 2) b.add({ piece: 'slab', p: [0, y, 0], s: [span, 0.08, 0.7], r: a, tint: PALETTE.concrete });
        b.add({
          piece: 'solarLeaf',
          p: [0, y + 0.1, 0],
          s: [span * 0.55, 1, 2.6],
          r: a,
          rz: 0.05,
          growAt: 0.1,
        });
        const ex = Math.cos(a) * span * 0.5;
        const ez = -Math.sin(a) * span * 0.5;
        b.add({
          piece: 'pod',
          p: [ex * 0.8, y + 0.08, ez * 0.8],
          s: 0.75,
          r: a,
          glow: 0.8,
          growAt: 0.1 + t * 0.1,
        });
        b.add({ piece: 'lumenRib', p: [ex, y - 0.3, ez], s: [0.12, 0.4, 0.12], glow: 1 });
        ivyEdge(b, ex * 0.6, y, ez * 0.6, 0.6, Math.cos(a), -Math.sin(a), 1);
      }
      b.add({ piece: 'haloRing', p: [0, y + 0.05, 0], s: [span * 0.55, 4, span * 0.55], glow: 0.6 });
    }
    // Beacon crown.
    b.add({ piece: 'spireCone', p: [0, H + 0.3, 0], s: [1.0, 4, 1.0], tint: PALETTE.glassWarm, glow: 0.4 });
    b.add({ piece: 'haloRing', p: [0, H + 1.2, 0], s: [1.8, 4, 1.8], glow: 1 });
  },
});
