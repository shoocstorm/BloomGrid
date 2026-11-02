import { defineBuilding } from '../types';
import { FLOOR, PALETTE, door, flowers, ivyEdge, lamp, louvres, planter, railing, roofMeadow, solarArray, tree } from '../kit';

export default defineBuilding({
  id: 'canopy-tower',
  name: 'Canopy Tower',
  description: 'A high-density tower with forested sky-gardens every few floors and breathing moss facades.',
  category: 'residential',
  footprint: [3, 3],
  stats: { cost: 480, energy: -14, eco: 6, happiness: 6, population: 110, jobs: 6, pollution: 1, water: -14 },
  tower: true,
  growthTime: 180,
  recipe(b) {
    const segments = 3 + Math.floor(b.rand() * 2);
    let y = 0;
    for (let s = 0; s < segments; s++) {
      const floors = 4;
      const size = 2.1 - s * 0.18;
      const hh = floors * FLOOR;
      b.add({ piece: 'glassBox', p: [0, y, 0], s: [size, hh, size], tint: PALETTE.glass });
      // Membrane wings on two faces
      b.add({ piece: 'mossBox', p: [size / 2 - 0.04, y, 0], s: [0.1, hh, size * 0.7] });
      b.add({ piece: 'mossBox', p: [0, y, -size / 2 + 0.04], s: [size * 0.6, hh, 0.1] });
      y += hh;
      // Sky garden plate
      b.add({ piece: 'slab', p: [0, y, 0], s: [size + 0.3, 0.08, size + 0.3], tint: PALETTE.concrete });
      y += 0.08;
      tree(b, size * 0.32, y, size * 0.32, 0.45, 0.15 + s * 0.12);
      tree(b, -size * 0.32, y, -size * 0.3, 0.4, 0.2 + s * 0.12);
      flowers(b, -size * 0.3, y, size * 0.3, 0.25, 6, 0.1, 0.7);
      ivyEdge(b, 0, y, (size + 0.3) / 2, size, 0, 1, 4);
      ivyEdge(b, -(size + 0.3) / 2, y, 0, size, -1, 0, 4);
      // Recessed garden level
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [size * 0.5, 0.45, size * 0.5], tint: PALETTE.concrete });
      y += 0.45;
    }
    b.upTo(1, () => roofMeadow(b, y, 1.4, 1.4, 2));
    // Detail (D-096): a glazed lobby with a canopy and planters at the foot, glass rails round each sky garden,
    // timber fins on the two bare faces, and solar panels on the roof.
    b.add({ piece: 'slab', p: [0, 0, 1.25], s: [2.6, 0.03, 0.5], tint: 0xe4dac8 });
    door(b, 0, 0, 1.05, 0.32, 0.3);
    b.add({ piece: 'slab', p: [0, 0.38, 1.2], s: [1.1, 0.04, 0.4], tint: PALETTE.timber });
    for (const x of [-0.85, 0.85]) planter(b, x, 0.03, 1.28, 0.5, 0.2, 0.1);
    lamp(b, 1.3, 0.03, 1.38);
    let yy = 0;
    for (let s = 0; s < segments; s++) {
      const size = 2.1 - s * 0.18;
      const hh = 4 * FLOOR;
      louvres(b, -size / 2 - 0.02, yy, 0.15, size * 0.75, hh, 9, true);
      louvres(b, 0.2, yy, size / 2 + 0.02, size * 0.7, hh, 9);
      yy += hh + 0.08;
      railing(b, 0, yy, (size + 0.3) / 2 - 0.02, size + 0.25);
      railing(b, (size + 0.3) / 2 - 0.02, yy, 0, size + 0.25, true);
      yy += 0.45;
    }
    b.upTo(1, () => solarArray(b, 0.35, yy + 0.05, -0.35, 0.9, 0.6, 1, 3, 0.4));

    // Levels (D-100): the tower keeps growing in its own rhythm, a segment at a time. Each new segment is a
    // narrower glass drum with moss wings, fins, a railed sky garden and its recessed garden level.
    const segment = (s: number, y0: number): number => {
      const size = 2.1 - s * 0.18;
      const hh = 4 * FLOOR;
      b.add({ piece: 'glassBox', p: [0, y0, 0], s: [size, hh, size], tint: PALETTE.glass });
      b.add({ piece: 'mossBox', p: [size / 2 - 0.04, y0, 0], s: [0.1, hh, size * 0.7] });
      b.add({ piece: 'mossBox', p: [0, y0, -size / 2 + 0.04], s: [size * 0.6, hh, 0.1] });
      louvres(b, -size / 2 - 0.02, y0, 0.15, size * 0.75, hh, 9, true);
      louvres(b, 0.2, y0, size / 2 + 0.02, size * 0.7, hh, 9);
      let y = y0 + hh;
      b.add({ piece: 'slab', p: [0, y, 0], s: [size + 0.3, 0.08, size + 0.3], tint: PALETTE.concrete });
      y += 0.08;
      railing(b, 0, y, (size + 0.3) / 2 - 0.02, size + 0.25);
      railing(b, (size + 0.3) / 2 - 0.02, y, 0, size + 0.25, true);
      tree(b, size * 0.32, y, size * 0.32, 0.42);
      flowers(b, -size * 0.3, y, size * 0.3, 0.25, 6, 0.1, 0.7);
      ivyEdge(b, 0, y, (size + 0.3) / 2, size, 0, 1, 4);
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [size * 0.5, 0.45, size * 0.5], tint: PALETTE.concrete });
      return y + 0.45;
    };
    // Level 2: one more segment, the roof meadow and solar panels lifted onto it, and a glazed winter garden
    // wrapping the lobby.
    b.level(2, () => {
      const top = segment(segments, y);
      b.upTo(2, () => {
        roofMeadow(b, top, 1.2, 1.2, 1);
        solarArray(b, 0.3, top + 0.05, -0.3, 0.8, 0.5, 1, 3, 0.4);
      });
      b.add({ piece: 'glassBox', p: [-0.75, 0, 1.25], s: [0.7, 0.36, 0.4], tint: PALETTE.glassWarm, glow: 0.4 });
      b.add({ piece: 'slab', p: [-0.75, 0.36, 1.25], s: [0.78, 0.04, 0.48], tint: PALETTE.timber });
      flowers(b, -0.75, 0.4, 1.25, 0.25, 5, 0.1, 0.6);
    });
    // Level 3: a second new segment and a crown: a forest drum with a ring of trees, a lit spire and its halo,
    // and wind sails on the top sky garden.
    b.level(3, () => {
      const top = segment(segments + 1, segment(segments, y));
      const r = 0.55;
      b.add({ piece: 'mossBox', p: [0, top, 0], s: [1.3, 0.12, 1.3] });
      for (let k = 0; k < 4; k++) tree(b, Math.cos((k / 4) * Math.PI * 2 + 0.8) * r, top + 0.12, Math.sin((k / 4) * Math.PI * 2 + 0.8) * r, 0.36);
      b.add({ piece: 'spireCone', p: [0, top + 0.12, 0], s: [0.22, 1.6, 0.22], tint: PALETTE.glassWarm, glow: 0.4 });
      b.add({ piece: 'haloRing', p: [0, top + 1.2, 0], s: [0.7, 2, 0.7], glow: 0.9 });
      b.add({ piece: 'haloRing', p: [0, top + 0.6, 0], s: [1.6, 2, 1.6], glow: 0.6 });
    });
  },
});
