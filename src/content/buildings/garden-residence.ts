import { defineBuilding } from '../types';
import { FLOOR, PALETTE, TRIM, barrel, bench, door, flowers, gableRoof, grassTufts, ivyEdge, lamp, louvres, planter, railing, roofMeadow, solarArray, tree } from '../kit';

/**
 * The first homes a player sees (D-095): small terraced garden homes. Glass storeys framed in timber posts, a
 * front balcony on every floor with a glass rail and planters, timber sun fins down one side, a front door under
 * a canopy, and either a pitched roof (terracotta, slate or sage) or a roof garden with a pergola and solar panels.
 * Six variants, so a street of them reads as neighbours, not copies. Level 2 adds a storey and a bike shed; level 3
 * a set-back timber loft with a terrace and a dormer or glass garden room on the roof (D-100).
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
    const [W0, D0] = [W, D];
    const fz = D / 2;
    const fin = b.rand() < 0.5 ? 1 : -1;

    // The lot: a paved front path and a strip of lawn.
    b.add({ piece: 'slab', p: [0, 0, fz + 0.32], s: [W + 0.4, 0.025, 0.5], tint: 0xe4dac8 });
    b.add({ piece: 'slab', p: [0.2, 0, fz + 0.62], s: [0.24, 0.025, 0.36], tint: 0xd8ccb6 });
    grassTufts(b, 0, 0.02, -fz - 0.35, 1.7, 0.4, 10);

    // One storey: a glass floor in a timber frame, its plate reaching out at the front as a balcony.
    const storey = (i: number, y: number, eaves: boolean): number => {
      b.add({ piece: 'glassBox', p: [0, y, 0], s: [W - 0.08, FLOOR, D - 0.08], tint: PALETTE.glass });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [(sx * (W - 0.06)) / 2, y, (sz * (D - 0.06)) / 2], s: [0.06, FLOOR, 0.06], tint: PALETTE.timber });
      b.add({ piece: 'slab', p: [0, y + FLOOR, 0.1], s: [W + 0.08, 0.045, D + 0.28], tint: PALETTE.concrete });
      const deck = y + FLOOR + 0.045;
      if (!eaves) balcony(i, deck);
      // Sun fins on one side on alternate floors; ivy on the back.
      if (i % 2 === 1) louvres(b, (fin * W) / 2 + fin * 0.03, y, 0, D * 0.85, FLOOR, 5, true);
      if (i > 0 && i % 2 === 0) for (const sx of [-1, 1]) b.add({ piece: 'ivy', p: [sx * (W / 2 - 0.12), y + FLOOR, -fz - 0.03], s: [0.16, b.range(0.18, 0.3), 1], r: Math.PI, tint: b.pick(PALETTE.leaves), growAt: 0.3 + i * 0.1 });
      return deck;
    };
    const balcony = (i: number, deck: number) => {
      railing(b, 0, deck, fz + 0.22, W + 0.04);
      planter(b, -W / 2 + 0.16, deck, fz + 0.12, 0.24, 0.12, 0.15 + i * 0.05);
      if (i % 2 === 0) planter(b, W / 2 - 0.16, deck, fz + 0.12, 0.24, 0.12, 0.2 + i * 0.05);
    };

    let y = 0.025;
    let topDeck = y;
    for (let i = 0; i < floors; i++) {
      const top = i === floors - 1;
      y = storey(i, y, top && pitched);
      if (top) topDeck = y;
    }

    // Front door under a little canopy, a planter and a lamp by the path.
    door(b, 0.2, 0.025, fz - 0.03);
    b.add({ piece: 'slab', p: [0.2, 0.32, fz + 0.06], s: [0.4, 0.03, 0.2], tint: PALETTE.timber });
    planter(b, -0.3, 0.025, fz + 0.38, 0.4, 0.16);
    lamp(b, 0.55, 0.025, fz + 0.62);

    // The roof, drawn at any height: the level-1 roof lifts off when a level adds a storey under it (D-100).
    let pitch = 0;
    let tile: number = TRIM.terracotta;
    const roof = (y: number, crown: boolean, W = W0, D = D0) => {
      if (pitched) {
        const rise = gableRoof(b, 0, y, 0, W + 0.02, D + 0.02, { pitch, tint: tile, ends: TRIM.cream });
        // A chimney flue and a skylight.
        b.add({ piece: 'slab', p: [W * 0.28, y + rise * 0.5, -D * 0.12], s: [0.1, rise * 0.75, 0.1], tint: 0xd9cfbf });
        b.add({ piece: 'concreteCyl', p: [W * 0.28, y + rise * 1.25, -D * 0.12], s: [0.07, 0.05, 0.07], tint: TRIM.charcoal });
        if (crown) {
          // Level 3: a glazed front dormer with its own little gable, and solar tiles on the back slope.
          b.add({ piece: 'glassBox', p: [-W * 0.18, y, D * 0.18], s: [0.42, 0.26, 0.3], tint: PALETTE.glassWarm, glow: 0.3 });
          b.add({ piece: 'slab', p: [-W * 0.18, y, D * 0.33], s: [0.46, 0.27, 0.03], tint: TRIM.cream });
          gableRoof(b, -W * 0.18, y + 0.26, D * 0.18, 0.46, 0.34, { pitch: 0.6, tint: tile, overhang: 0.04 });
          b.add({ piece: 'slab', p: [0.1, y + rise * 0.45, -D * 0.25], s: [W * 0.62, 0.02, D * 0.32], rx: pitch, tint: TRIM.pv, glow: 0.15 });
        }
      } else {
        // Roof garden: meadow, a pergola and solar panels on the back half.
        roofMeadow(b, y, W, D * 0.45, 0);
        b.add({ piece: 'mossBox', p: [0, y, -D * 0.25], s: [W, 0.04, D * 0.5] });
        if (!crown) solarArray(b, 0, y + 0.04, -D * 0.25, W * 0.9, D * 0.42, 1, 3, 0.4);
        const px = W / 2 - 0.08;
        const fz = D / 2;
        for (const sx of [-1, 1]) b.add({ piece: 'timberBox', p: [sx * px, y, fz - 0.1], s: [0.04, 0.24, 0.04], tint: PALETTE.timber });
        for (let k = 0; k < 5; k++) b.add({ piece: 'timberBox', p: [0, y + 0.24, fz - 0.28 + k * 0.08], s: [W - 0.1, 0.025, 0.03], tint: PALETTE.timber });
        ivyEdge(b, 0, y + 0.24, fz - 0.1, W * 0.7, 0, 1, 3);
        if (crown) {
          // Level 3: a glass garden room at the back, timber-roofed, with a little tree by its door.
          b.add({ piece: 'glassBox', p: [0, y + 0.04, -D * 0.28], s: [W * 0.62, 0.28, D * 0.36], tint: PALETTE.glassWarm, glow: 0.35 });
          b.add({ piece: 'timberBox', p: [0, y + 0.32, -D * 0.28], s: [W * 0.7, 0.03, D * 0.44], tint: PALETTE.timber });
          solarArray(b, 0, y + 0.35, -D * 0.28, W * 0.6, D * 0.36, 1, 2, 0.3);
          tree(b, W * 0.36, y + 0.05, fz - 0.4, 0.3);
        }
      }
    };
    b.upTo(1, () => {
      pitch = b.range(0.5, 0.65);
      tile = b.pick(ROOFS);
      roof(y, false);
    });

    // Level 2: one more storey (the old top floor gains its balcony), the roof back on top, and a timber bike
    // shed with a rain barrel at the side of the lot.
    b.level(2, () => {
      if (pitched) balcony(floors - 1, topDeck);
      const y2 = storey(floors, y, pitched);
      b.upTo(2, () => roof(y2, false));
      const sx = -fin * (W / 2 + 0.2);
      b.add({ piece: 'timberBox', p: [sx, 0.025, -0.1], s: [0.26, 0.02, 0.6], tint: 0xc8a57c });
      b.add({ piece: 'slab', p: [sx, 0.3, -0.1], s: [0.3, 0.025, 0.66], rz: fin * 0.12, tint: tile });
      for (const z of [-0.36, 0.16]) b.add({ piece: 'timberBox', p: [sx - fin * 0.11, 0.025, z], s: [0.03, 0.28, 0.03], tint: PALETTE.timber });
      barrel(b, sx, 0.025, 0.36, 0.1, 0x4f7f6a);
      // Window boxes under the new floor's glass, flowering.
      flowers(b, 0, y + 0.02, fz + 0.15, W * 0.4, 6, 0.1, 0.6);
    });

    // Level 3: a set-back loft storey with a wrap-around terrace, ivy curtains down the front corners, and the
    // roof crowned with a dormer (pitched) or a glass garden room (roof garden).
    b.level(3, () => {
      const y2 = y + FLOOR + 0.045;
      if (pitched) balcony(floors, y2);
      const [lw, ld] = [W * 0.78, D * 0.74];
      b.add({ piece: 'timberBox', p: [0, y2, 0], s: [lw, FLOOR * 0.95, ld], tint: 0xb48a62 });
      b.add({ piece: 'glassBox', p: [0, y2 + 0.04, ld / 2], s: [lw * 0.8, FLOOR * 0.75, 0.04], tint: PALETTE.glassWarm, glow: 0.4 });
      b.add({ piece: 'slab', p: [0, y2 + FLOOR * 0.95, 0], s: [lw + 0.1, 0.04, ld + 0.1], tint: PALETTE.concrete });
      railing(b, 0, y2, fz + 0.2, W);
      for (const sx of [-1, 1]) railing(b, sx * (W / 2 + 0.02), y2, 0.05, D * 0.9, true);
      planter(b, W * 0.3, y2, fz + 0.05, 0.26, 0.14, 0.2);
      bench(b, -W * 0.18, y2, fz + 0.02, 0.3);
      ivyEdge(b, -W / 2 + 0.05, y2, fz + 0.2, 0.3, 0, 1, 3);
      ivyEdge(b, W / 2 - 0.05, y2, fz + 0.2, 0.3, 0, 1, 3);
      roof(y2 + FLOOR * 0.95 + 0.04, true, lw + 0.08, ld + 0.08);
    });
    tree(b, -0.78, 0, 0.78, 0.42, 0.4);
    flowers(b, 0.75, 0.02, -0.75, 0.2, 5, 0.2, 0.8);
  },
});
