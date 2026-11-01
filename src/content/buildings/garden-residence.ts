import { defineBuilding } from '../types';
import { FLOOR, PALETTE, TRIM, door, flowers, gableRoof, grassTufts, ivyEdge, lamp, louvres, planter, railing, roofMeadow, solarArray, tree } from '../kit';

/**
 * The first homes a player sees (D-095): small terraced garden homes. Glass storeys framed in timber posts, a
 * front balcony on every floor with a glass rail and planters, timber sun fins down one side, a front door under
 * a canopy, and either a pitched roof (terracotta, slate or sage) or a roof garden with a pergola and solar panels.
 * Six variants, so a street of them reads as neighbours, not copies.
 */
const ROOFS = [TRIM.terracotta, 0x5f6b73, 0x7f9a6a, 0xb35f45] as const;

export default defineBuilding({
  id: 'garden-residence',
  name: 'Garden Residence',
  description: 'Terraced homes where every balcony is a garden and ivy cascades down solar-glass walls.',
  category: 'residential',
  footprint: [2, 2],
  stats: { cost: 120, energy: -4, eco: 3, happiness: 4, population: 24, jobs: 0, pollution: 0, water: -3 },
  growthTime: 90,
  variants: 6,
  recipe(b) {
    const floors = 3 + Math.floor(b.rand() * 3);
    const pitched = b.rand() < 0.5;
    const W = b.range(1.15, 1.35);
    const D = b.range(1.05, 1.2);
    const fz = D / 2;
    const fin = b.rand() < 0.5 ? 1 : -1;

    // The lot: a paved front path and a strip of lawn.
    b.add({ piece: 'slab', p: [0, 0, fz + 0.32], s: [W + 0.4, 0.025, 0.5], tint: 0xe4dac8 });
    b.add({ piece: 'slab', p: [0.2, 0, fz + 0.62], s: [0.24, 0.025, 0.36], tint: 0xd8ccb6 });
    grassTufts(b, 0, 0.02, -fz - 0.35, 1.7, 0.4, 10);

    let y = 0.025;
    for (let i = 0; i < floors; i++) {
      const top = i === floors - 1;
      // Glass storey inside a timber frame.
      b.add({ piece: 'glassBox', p: [0, y, 0], s: [W - 0.08, FLOOR, D - 0.08], tint: PALETTE.glass });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [(sx * (W - 0.06)) / 2, y, (sz * (D - 0.06)) / 2], s: [0.06, FLOOR, 0.06], tint: PALETTE.timber });
      // Floor plate, reaching out at the front as a balcony.
      b.add({ piece: 'slab', p: [0, y + FLOOR, 0.1], s: [W + 0.08, 0.045, D + 0.28], tint: PALETTE.concrete });
      const deck = y + FLOOR + 0.045;
      if (!top || !pitched) {
        railing(b, 0, deck, fz + 0.22, W + 0.04);
        planter(b, -W / 2 + 0.16, deck, fz + 0.12, 0.24, 0.12, 0.15 + i * 0.05);
        if (i % 2 === 0) planter(b, W / 2 - 0.16, deck, fz + 0.12, 0.24, 0.12, 0.2 + i * 0.05);
      }
      // Sun fins on one side on alternate floors; ivy on the back.
      if (i % 2 === 1) louvres(b, (fin * W) / 2 + fin * 0.03, y, 0, D * 0.85, FLOOR, 5, true);
      // A few short ivy strands down the back corners.
      if (i > 0 && i % 2 === 0) for (const sx of [-1, 1]) b.add({ piece: 'ivy', p: [sx * (W / 2 - 0.12), y + FLOOR, -fz - 0.03], s: [0.16, b.range(0.18, 0.3), 1], r: Math.PI, tint: b.pick(PALETTE.leaves), growAt: 0.3 + i * 0.1 });
      y = deck;
    }

    // Front door under a little canopy, a planter and a lamp by the path.
    door(b, 0.2, 0.025, fz - 0.03);
    b.add({ piece: 'slab', p: [0.2, 0.32, fz + 0.06], s: [0.4, 0.03, 0.2], tint: PALETTE.timber });
    planter(b, -0.3, 0.025, fz + 0.38, 0.4, 0.16);
    lamp(b, 0.55, 0.025, fz + 0.62);

    if (pitched) {
      const rise = gableRoof(b, 0, y, 0, W + 0.02, D + 0.02, { pitch: b.range(0.5, 0.65), tint: b.pick(ROOFS), ends: TRIM.cream });
      // A chimney flue and a skylight.
      b.add({ piece: 'slab', p: [W * 0.28, y + rise * 0.5, -D * 0.12], s: [0.1, rise * 0.75, 0.1], tint: 0xd9cfbf });
      b.add({ piece: 'concreteCyl', p: [W * 0.28, y + rise * 1.25, -D * 0.12], s: [0.07, 0.05, 0.07], tint: TRIM.charcoal });
    } else {
      // Roof garden: meadow, a pergola and solar panels on the back half.
      roofMeadow(b, y, W, D * 0.45, 0);
      b.add({ piece: 'mossBox', p: [0, y, -D * 0.25], s: [W, 0.04, D * 0.5] });
      solarArray(b, 0, y + 0.04, -D * 0.25, W * 0.9, D * 0.42, 1, 3, 0.4);
      const px = W / 2 - 0.08;
      for (const sx of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * px, y, fz - 0.1], s: [0.04, 0.24, 0.04], tint: PALETTE.timber });
      for (let k = 0; k < 5; k++) b.add({ piece: 'timberBox', p: [0, y + 0.24, fz - 0.28 + k * 0.08], s: [W - 0.1, 0.025, 0.03], tint: PALETTE.timber });
      ivyEdge(b, 0, y + 0.24, fz - 0.1, W * 0.7, 0, 1, 3);
    }
    tree(b, -0.78, 0, 0.78, 0.42, 0.4);
    flowers(b, 0.75, 0.02, -0.75, 0.2, 5, 0.2, 0.8);
  },
});
