import { defineBuilding } from '../types';
import { PALETTE, forecourt, grassTufts, tree } from '../kit';

const TIERS = 6;
const STONE = 0xf6f2ea;

export default defineBuilding({
  id: 'travertine-baths',
  name: 'Travertine Thermal Baths',
  description:
    'Six white terraces of warm mineral pools spill one into the next down a gentle slope, heated by the data spire’s waste heat. The island’s favourite place to do absolutely nothing.',
  category: 'nature',
  footprint: [10, 10],
  stats: {
    cost: 3600,
    energy: -10,
    eco: 14,
    happiness: 32,
    population: 0,
    jobs: 60,
    pollution: 0,
    water: -24,
  },
  growthTime: 170,
  variants: 1,
  style: 'limestone',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.2, 9.8], tint: STONE });
    // Terraces climb toward -z; each holds a pool that spills over its front lip.
    for (let i = 0; i < TIERS; i++) {
      const z = 3.9 - i * 1.25;
      const top = 0.4 + i * 0.55;
      const w = 9.4 - i * 0.7;
      b.add({
        piece: 'slab',
        p: [0, 0.2, z - 0.6],
        s: [w, top - 0.2, 1.3 + (TIERS - 1 - i) * 0.01],
        tint: STONE,
      });
      b.add({ piece: 'pool', p: [0, top, z - 0.65], s: [w - 0.4, 0.05, 1.0] });
      for (const x of [-w * 0.3, w * 0.05, w * 0.32])
        b.add({ piece: 'waterfall', p: [x, top - 0.55, z + 0.06], s: [w * 0.18, 0.55, 1], glow: 0.6 });
    }
    // Bathhouse at the top, with trees either side.
    const ty = 0.4 + TIERS * 0.55;
    b.add({ piece: 'slab', p: [0, 0.2, -4.3], s: [9.4, ty - 0.2, 1.2], tint: STONE });
    b.add({ piece: 'glassCyl', p: [0, ty, -4.2], s: [3.2, 1.4, 1.4], tint: PALETTE.glassWarm, glow: 0.6 });
    b.add({ piece: 'dome', p: [0, ty + 1.4, -4.2], s: [3.4, 2.2, 1.6] });
    for (const sx of [-1, 1]) {
      grassTufts(b, sx * 3.4, ty, -4.3, 2.4, 1, 12);
      tree(b, sx * 3.6, ty, -4.3, 0.8, 0.1);
    }
    b.add({ piece: 'haloRing', p: [0, 0.45, 3.3], s: [3, 4, 1.2], glow: 0.8 });
    // Street level (D-097): a paved forecourt at the foot of the cascade, with planters, lamps and benches.
    forecourt(b, 0, 0.2, 4.45, 9.0, 0.8, 4, 2);

    // Levels (D-100). Level 2: steam pavilions (timber shelters with lit roofs) on two of the terraces, and the
    // bathhouse gains wings either side of its dome.
    const pavilions = () => {
      for (const [x, i] of [
        [-2.6, 1],
        [2.4, 3],
      ] as const) {
        const z = 3.9 - i * 1.25 - 0.65;
        const top = 0.4 + i * 0.55;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [x + sx * 0.45, top, z + sz * 0.35], s: [0.05, 0.7, 0.05], tint: PALETTE.timber });
        b.add({ piece: 'slab', p: [x, top + 0.7, z], s: [1.1, 0.06, 0.9], tint: 0xc8a57c });
        b.add({ piece: 'lumenRib', p: [x, top + 0.66, z], s: [0.9, 0.03, 0.7], tint: 0xffd9a0, glow: 0.7 });
      }
      for (const sx of [-1, 1]) {
        b.add({ piece: 'glassBox', p: [sx * 2.2, ty, -4.3], s: [1.4, 0.9, 1.0], tint: PALETTE.glassWarm, glow: 0.5 });
        b.add({ piece: 'slab', p: [sx * 2.2, ty + 0.9, -4.3], s: [1.6, 0.06, 1.2], tint: STONE });
      }
    };
    b.level(2, pavilions);
    // Level 3: a sky pool on the bathhouse roof (an infinity basin above the dome's shoulders with a waterfall
    // down the back) and a lit colonnade along the top terrace.
    b.level(3, () => {
      pavilions();
      for (const sx of [-1, 1]) b.add({ piece: 'pool', p: [sx * 2.2, ty + 0.96, -4.3], s: [1.3, 0.05, 0.9] });
      b.add({ piece: 'waterfall', p: [0, 0.2, -4.92], s: [2.4, ty + 1.8, 1], r: Math.PI, glow: 0.7 });
      const z = 3.9 - (TIERS - 1) * 1.25 - 1.1;
      for (let k = 0; k < 7; k++) {
        const x = -2.7 + k * 0.9;
        b.add({ piece: 'concreteCyl', p: [x, ty, z], s: [0.14, 1.0, 0.14], tint: STONE });
        b.add({ piece: 'lumenRib', p: [x, ty + 1.0, z], s: [0.2, 0.06, 0.2], tint: 0xffd9a0, glow: 1 });
      }
      b.add({ piece: 'slab', p: [0, ty + 1.06, z], s: [6.4, 0.08, 0.3], tint: STONE });
    });
  },
});
