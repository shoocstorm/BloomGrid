import { defineBuilding } from '../types';
import { PALETTE, gableRoof, grassTufts, lamp, tree } from '../kit';

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
  style: 'rammed-earth',
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
    const hut = (y: number) => {
      b.add({ piece: 'slab', p: [0.6, y, 0.2], s: [1.4, 0.9, 1.0], tint: 0xc8a57c });
      b.add({
        piece: 'glassBox',
        p: [0.6, y + 0.9, 0.2],
        s: [1.5, 0.12, 1.1],
        tint: PALETTE.glassWarm,
        glow: 0.5,
      });
      tree(b, -0.8, y, -0.4, 1.2, 0.1);
    };
    b.upTo(1, () => hut(top));
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
    // Detail (D-097): a stone stair up the front of the terraces beside the falls, and lamps at its foot.
    for (let i = 0; i < TIERS; i++) {
      const d = 9.8 - i * 1.3;
      b.add({ piece: 'slab', p: [0.9, i * 0.55, d / 2 + 0.15], s: [0.6, 0.55, 0.3], tint: 0xb9b2a4 });
      b.add({ piece: 'slab', p: [0.9, i * 0.55, d / 2 + 0.45], s: [0.6, 0.28, 0.3], tint: 0xb9b2a4 });
    }
    for (const x of [0.4, 1.4]) lamp(b, x, 0, 4.85, 0.6);

    // Levels (D-100). One more paddy ring at tier i.
    const paddy = (i: number) => {
      const d = 9.8 - i * 1.3;
      const y = i * 0.55;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d * 1.08, 0.55, d], tint: i % 2 ? 0x9c8b70 : 0x8a7a64 });
      b.add({ piece: 'pool', p: [0, y + 0.55, 0], s: [d * 0.74, 0.04, d * 0.68], r: i * 0.35 });
      grassTufts(b, 0, y + 0.55, 0, d * 0.85, d * 0.8, Math.round(d * 6), 0.05);
    };
    const shrine = (y: number) => {
      // A farmers' pavilion: a timber hall under a sweeping pagoda roof with lanterns at its corners.
      b.add({ piece: 'timberBox', p: [0.3, y, 0.1], s: [1.2, 0.7, 1.0], tint: 0xb48a62 });
      b.add({ piece: 'glassBox', p: [0.3, y + 0.1, 0.61], s: [0.9, 0.35, 0.02], tint: PALETTE.glassWarm, glow: 0.6 });
      gableRoof(b, 0.3, y + 0.7, 0.1, 1.5, 1.3, { pitch: 0.45, tint: 0x5f6b73, overhang: 0.2 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add({ piece: 'lumenRib', p: [0.3 + sx * 0.8, y + 0.55, 0.1 + sz * 0.7], s: [0.1, 0.14, 0.1], tint: 0xffd9a0, glow: 1 });
    };
    // Level 2: an eighth paddy on the summit, its hut rebuilt as a pavilion with lanterns, and scarecrows.
    b.level(2, () => {
      paddy(TIERS);
      b.upTo(2, () => {
        shrine(top + 0.55);
        tree(b, -0.75, top + 0.55, -0.3, 0.7);
      });
      for (const [x, z] of [
        [-3.4, 1.0],
        [2.6, -2.6],
      ] as const) {
        b.add({ piece: 'timberBox', p: [x, 1.1, z], s: [0.04, 0.6, 0.04], tint: PALETTE.timber });
        b.add({ piece: 'timberBox', p: [x, 1.5, z], s: [0.4, 0.04, 0.04], tint: PALETTE.timber });
        b.add({ piece: 'spireCone', p: [x, 1.62, z], s: [0.28, 0.14, 0.28], tint: 0xd9c49a });
      }
    });
    // Level 3: a ninth paddy, a two-storey pagoda shrine on top with a gilded finial, and a water wheel turning
    // at the foot of the falls.
    b.level(3, () => {
      paddy(TIERS);
      paddy(TIERS + 1);
      const y = top + 1.1;
      shrine(y);
      b.add({ piece: 'timberBox', p: [0.3, y + 1.0, 0.1], s: [0.8, 0.45, 0.7], tint: 0xb48a62 });
      gableRoof(b, 0.3, y + 1.45, 0.1, 1.1, 1.0, { pitch: 0.5, tint: 0x5f6b73, overhang: 0.16 });
      b.add({ piece: 'spireCone', p: [0.3, y + 1.85, 0.1], s: [0.14, 0.6, 0.14], tint: 0xffd56b, glow: 0.6 });
      b.add({ piece: 'haloRing', p: [-0.6, 0.6, 4.75], s: [1.2, 1.2, 1.2], rx: Math.PI / 2, r: Math.PI / 2, tint: 0xc8a57c });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.add({ piece: 'timberBox', p: [-0.6, 0.6 + Math.sin(a) * 0.3, 4.75 + Math.cos(a) * 0.3], s: [0.12, 0.04, 0.3], rx: a, tint: 0x9a7552 });
      }
    });
  },
});
