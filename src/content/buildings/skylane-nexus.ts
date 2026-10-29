import { defineBuilding } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

const TAU = Math.PI * 2;
/** Spine height and the transfer ring the pods circle (the mobility module draws the moving rings there). */
const H = 21;
const RING = 16.2;

export default defineBuilding({
  id: 'skylane-nexus',
  name: 'Skylane Nexus',
  description:
    'The central hub of the sky-lane network: a glass spine ringed by berthing decks, where pods from every Pod Interchange and dock circle a floating transfer ring and peel off onto any lane on the island. Docks on its network carry more riders.',
  category: 'utility',
  footprint: [6, 6],
  stats: {
    cost: 5200,
    energy: -40,
    eco: 3,
    happiness: 12,
    population: 0,
    jobs: 50,
    pollution: 0,
    upkeep: 0.3,
  },
  growthTime: 170,
  transit: { radius: 24, riders: 1800, hub: { reach: 110, ring: RING, radius: 4.4, central: true } },
  variants: 1,
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [5.9, 0.3, 5.9], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [4.2, 0.08, 4.2], r: Math.PI / 4 });
    grassTufts(b, 0, 0.38, 0, 4.4, 4.4, 40);
    flowers(b, 0, 0.38, 0, 2.6, 36, 0, 0.6);
    for (const [x, z] of [
      [-2.3, -2.3],
      [2.3, -2.3],
      [-2.3, 2.3],
      [2.3, 2.3],
    ] as const)
      tree(b, x, 0.3, z, 0.5, 0.2);
    // Concourse: a glass drum under a dome, lit from within.
    b.add({ piece: 'glassCyl', p: [0, 0.38, 0], s: [3.2, 1.6, 3.2], tint: PALETTE.glassWarm, glow: 0.6 });
    b.add({ piece: 'dome', p: [0, 1.98, 0], s: [3.2, 1.4, 3.2], glow: 0.2 });
    // Spine: a concrete core in a glowing glass sheath, braced by four leaning light pylons.
    b.add({ piece: 'concreteCyl', p: [0, 0.38, 0], s: [0.8, H, 0.8], tint: PALETTE.concrete });
    b.add({ piece: 'glassCyl', p: [0, 2.4, 0], s: [1.3, H - 4, 1.3], tint: PALETTE.glass, glow: 0.35 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 2.5, 0.3, Math.sin(a) * 2.5],
        s: [0.14, 13.4, 0.14],
        r: -a,
        rz: 0.17,
        glow: 1,
      });
    }
    // Three berthing decks, narrowing upward, pods docked round each rim.
    for (let k = 0; k < 3; k++) {
      const y = 5.5 + k * 3.2;
      const r = 2.6 - k * 0.35;
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [r * 2, 0.14, r * 2], tint: 0xe9f4ef, glow: 0.2 });
      b.add({
        piece: 'glassCyl',
        p: [0, y + 0.14, 0],
        s: [r * 1.1, 0.5, r * 1.1],
        tint: PALETTE.glass,
        glow: 0.4,
      });
      b.add({ piece: 'haloRing', p: [0, y + 0.16, 0], s: [r * 2.04, 2, r * 2.04], glow: 1 });
      const berths = 8 - k * 2;
      for (let i = 0; i < berths; i++) {
        const a = (i / berths) * TAU + k * 0.5;
        b.add({
          piece: 'pod',
          p: [Math.cos(a) * (r - 0.3), y + 0.14, Math.sin(a) * (r - 0.3)],
          s: 0.5,
          r: -a + Math.PI / 2,
          glow: 0.9,
          growAt: 0.1 + k * 0.1,
        });
      }
    }
    // Transfer deck under the pods' ring, and the crown.
    b.add({
      piece: 'glassCyl',
      p: [0, RING - 0.9, 0],
      s: [2.6, 0.5, 2.6],
      tint: PALETTE.glassWarm,
      glow: 0.7,
    });
    b.add({ piece: 'haloRing', p: [0, RING - 0.6, 0], s: [3.2, 3, 3.2], glow: 1 });
    for (let i = 0; i < 8; i++)
      b.add({
        piece: 'solarLeaf',
        p: [0, RING - 0.4, 0],
        s: [1.1, 1, 0.8],
        r: (i / 8) * TAU,
        rz: 0.35,
        growAt: 0.3,
      });
    b.add({ piece: 'spireCone', p: [0, H + 0.38, 0], s: [1.1, 6, 1.1], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'haloRing', p: [0, H + 1.4, 0], s: [1.8, 3, 1.8], glow: 1 });
    b.add({ piece: 'haloRing', p: [0, H + 2.8, 0], s: [1.1, 3, 1.1], glow: 1 });
  },
});
