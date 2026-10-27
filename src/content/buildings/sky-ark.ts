import { defineBuilding } from '../types';
import { FLOOR, PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const H = 19.2; // tower height (60 floors)
const TOWERS = [-4, 0, 4];

export default defineBuilding({
  id: 'sky-ark',
  name: 'Sky Ark Residences',
  description:
    'Three slender garden towers carrying a forested sky-ark across their crowns: an infinity pool, an orchard and a solar promenade sixty floors up. Home to seven hundred residents, most of whom fly to work.',
  category: 'residential',
  footprint: [12, 7],
  stats: {
    cost: 5200,
    energy: -40,
    eco: 14,
    happiness: 20,
    population: 700,
    jobs: 40,
    pollution: 1,
    water: -36,
  },
  growthTime: 220,
  // The ark is its own sky-port: most residents fly to work instead of jamming the plaza loop.
  transit: { radius: 8, riders: 700 },
  pollinators: 1,
  variants: 1,
  style: 'verdigris',
  recipe(b) {
    // Podium: garden roof with a lit colonnade.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [11.8, 0.9, 6.8], tint: PALETTE.concrete });
    b.add({ piece: 'glassBox', p: [0, 0, 3.0], s: [11.2, 0.75, 0.8], tint: PALETTE.glassWarm, glow: 0.3 });
    b.add({ piece: 'mossBox', p: [0, 0.9, 0], s: [11.6, 0.08, 6.6] });
    grassTufts(b, 0, 0.98, 0, 11, 6, 90);
    flowers(b, 0, 0.98, 0, 3.2, 60, 0, 0.6);
    for (const x of [-6, -2, 2, 6]) tree(b, x * 0.95, 0.98, 2.4, 0.6, 0.1);

    // Towers: glass shafts with a moss spine, balcony gardens every 3 units and light ribs.
    for (const tx of TOWERS) {
      const w = 2.6;
      const d = 3.6;
      b.add({ piece: 'glassBox', p: [tx, 0.98, 0], s: [w, H, d], tint: PALETTE.glass, glow: 0.06 });
      b.add({ piece: 'mossBox', p: [tx, 0.98, -d / 2 + 0.05], s: [w * 0.45, H, 0.12], growAt: 0.05 });
      for (const sx of [-1, 1])
        b.add({ piece: 'lumenRib', p: [tx + (sx * w) / 2, 0.98, d / 2], s: [0.1, H, 0.1], glow: 0.8 });
      for (let y = 3; y < H; y += 3) {
        const yy = 0.98 + y;
        b.add({ piece: 'slab', p: [tx, yy, 0.25], s: [w + 0.5, 0.07, d + 0.5], tint: PALETTE.concrete });
        ivyEdge(b, tx, yy, d / 2 + 0.5, w, 0, 1, 3);
        flowers(b, tx, yy + 0.07, d / 2 + 0.2, 0.5, 4, 0.1, 0.8);
      }
    }

    // The ark: a long hull bridging all three crowns, cantilevered past the east tower.
    const ay = 0.98 + H;
    b.add({ piece: 'slab', p: [0.8, ay, 0], s: [13.6, 0.7, 3.4], tint: PALETTE.concrete });
    b.add({ piece: 'lumenRib', p: [0.8, ay - 0.06, 1.72], s: [13.6, 0.08, 0.08], r: 0, glow: 1 });
    b.add({ piece: 'lumenRib', p: [0.8, ay - 0.06, -1.72], s: [13.6, 0.08, 0.08], glow: 1 });
    const deck = ay + 0.7;
    b.add({ piece: 'pool', p: [2.2, deck, 1.05], s: [10.4, 0.08, 1.0] });
    b.add({ piece: 'mossBox', p: [-0.4, deck, -0.6], s: [12.2, 0.1, 1.9] });
    grassTufts(b, -0.4, deck + 0.1, -0.6, 12, 1.8, 60, 0.1);
    for (let i = 0; i < 7; i++)
      tree(b, -5.4 + i * 1.75, deck + 0.1, -0.7, b.range(0.55, 0.75), 0.2 + i * 0.05);
    // Solar canopy fins along the hull's spine.
    for (let i = 0; i < 9; i++)
      b.add({
        piece: 'solarLeaf',
        p: [-5.6 + i * 1.4, deck + 1.6, -0.6],
        s: [1.6, 1, 1.1],
        r: Math.PI / 2,
        rz: 0.25,
        growAt: 0.3,
      });
    for (let i = 0; i < 9; i++)
      b.add({ piece: 'concreteCyl', p: [-5.6 + i * 1.4, deck, -0.6], s: [0.08, 1.6, 0.08] });
    // A floor line so the hull reads as inhabited.
    b.add({
      piece: 'glassBox',
      p: [0.8, ay + 0.12, 0],
      s: [13.2, FLOOR, 3.0],
      tint: PALETTE.glassWarm,
      glow: 0.2,
    });
  },
});
