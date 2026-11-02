import { defineBuilding } from '../types';
import { PALETTE, bench, entrance, flowers, grassTufts, ivyEdge, lamp } from '../kit';

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
  requires: 'skylanes',
  transit: { radius: 26, riders: 1400, hub: { reach: 60, ring: 24.6, radius: 2.8 } },
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
    const crown = (y: number) => {
      b.add({ piece: 'spireCone', p: [0, y + 0.3, 0], s: [1.0, 4, 1.0], tint: PALETTE.glassWarm, glow: 0.4 });
      b.add({ piece: 'haloRing', p: [0, y + 1.2, 0], s: [1.8, 4, 1.8], glow: 1 });
    };
    b.upTo(1, () => crown(H));
    // Street level (D-097): a lit terminal door with a paved path to the street, lamps along it, benches and a
    // ring of glowing bollards on the rim.
    entrance(b, 0, 0.3, 1.7, 0.8, 0.5);
    b.add({ piece: 'slab', p: [0, 0.38, 2.85], s: [0.9, 0.02, 2.3], tint: 0xe4dac8 });
    for (const sx of [-1, 1]) {
      lamp(b, sx * 0.65, 0.38, 3.2, 0.6);
      bench(b, sx * 2.3, 0.38, 0, 0.5, true, sx < 0);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 3.55, 0.3, Math.sin(a) * 3.55],
        s: [0.08, 0.2, 0.08],
        tint: 0xffd9a0,
        glow: 0.9,
      });
    }

    // Levels (D-100). A wing tier t (the recipe has t = 0..3), short and turned like the rest.
    const wings = (t: number) => {
      const y = 5 + t * 4;
      const span = Math.max(2.4, 7.2 - t * 1.1);
      const yaw = t * (Math.PI / 4);
      b.add({ piece: 'concreteCyl', p: [0, y - 0.2, 0], s: [2.0, 0.4, 2.0], tint: 0xe9f4ef });
      for (let w = 0; w < 4; w++) {
        const a = yaw + (w / 4) * TAU;
        b.add({ piece: 'solarLeaf', p: [0, y + 0.1, 0], s: [span * 0.55, 1, 2.2], r: a, rz: 0.05 });
        b.add({ piece: 'pod', p: [Math.cos(a) * span * 0.4, y + 0.08, -Math.sin(a) * span * 0.4], s: 0.6, r: a, glow: 0.8 });
      }
      b.add({ piece: 'haloRing', p: [0, y + 0.05, 0], s: [span * 0.55, 4, span * 0.55], glow: 0.6 });
    };
    const mast = (y0: number, h: number) => {
      b.add({ piece: 'concreteCyl', p: [0, y0, 0], s: [1.0, h, 1.0], tint: PALETTE.concrete });
      b.add({ piece: 'glassCyl', p: [0, y0, 0], s: [1.3, h, 1.3], tint: PALETTE.glass, glow: 0.1 });
    };
    // Level 2: the mast climbs four more units with a fifth tier of wings, the beacon riding on top.
    b.level(2, () => {
      mast(H, 4);
      wings(4);
      b.upTo(2, () => crown(H + 4));
    });
    // Level 3: a sixth tier, a glass sky-lounge ring at the top of the mast and a taller beacon.
    b.level(3, () => {
      mast(H, 8);
      wings(4);
      wings(5);
      b.add({ piece: 'glassCyl', p: [0, H + 6.5, 0], s: [2.4, 1.0, 2.4], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'concreteCyl', p: [0, H + 7.5, 0], s: [2.6, 0.1, 2.6], tint: 0xe9f4ef });
      crown(H + 8);
      b.add({ piece: 'haloRing', p: [0, H + 10.4, 0], s: [1.0, 3, 1.0], tint: 0xffd9a0, glow: 1 });
    });
  },
});
