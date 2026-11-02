import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, bench, entrance, flowers, grassTufts, railRing, tree } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'starlight-observatory',
  name: 'Starlight Observatory',
  description:
    'A white tower crowned by a glass telescope dome inside a slowly glowing armillary sphere. On clear nights the whole island turns its street lights down for stargazing hour.',
  category: 'tech',
  footprint: [8, 8],
  stats: { cost: 3300, energy: -12, eco: 4, happiness: 22, population: 0, jobs: 60, pollution: 0, water: -4 },
  growthTime: 170,
  variants: 1,
  style: 'indigo',
  recipe(b) {
    b.add({ piece: 'concreteCyl', p: [0, 0, 0], s: [7.6, 0.3, 7.6], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [5.0, 0.08, 5.0], r: Math.PI / 4 });
    grassTufts(b, 0, 0.38, 0, 4.8, 4.8, 50);
    flowers(b, 0, 0.38, 0, 2.6, 36, 0, 0.6);
    for (let k = 0; k < 4; k++) tree(b, Math.cos(k * 1.57) * 3.0, 0.3, Math.sin(k * 1.57) * 3.0, 0.6, 0.1);
    // Tapering tower with glazed rings.
    let y = 0.3;
    for (const [d, h] of [
      [3.0, 4],
      [2.5, 4],
      [2.1, 4],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [d, h, d], tint: PALETTE.concrete });
      b.add({
        piece: 'glassCyl',
        p: [0, y + h - 0.6, 0],
        s: [d + 0.08, 0.4, d + 0.08],
        tint: PALETTE.glassWarm,
        glow: 0.5,
      });
      y += h;
    }
    // Viewing deck, telescope and glass dome.
    b.add({ piece: 'concreteCyl', p: [0, y, 0], s: [4.4, 0.3, 4.4], tint: 0xe9f4ef });
    const dy = y + 0.3;
    beam(b, 'concreteCyl', [0, dy, 0], [1.2, dy + 2.6, 0.6], 0.7, { tint: 0xe9f4ef });
    b.add({ piece: 'dome', p: [0, dy, 0], s: [3.8, 6, 3.8] });
    // Armillary sphere: three glowing rings at different tilts round the dome.
    const cy = dy + 1.4;
    b.add({ piece: 'haloRing', p: [0, cy, 0], s: [7, 7, 7], rx: 0.5, glow: 1 });
    b.add({ piece: 'haloRing', p: [0, cy, 0], s: [6.2, 6.2, 6.2], rz: 0.9, glow: 0.8 });
    b.add({ piece: 'haloRing', p: [0, cy, 0], s: [7.6, 7.6, 7.6], r: 1.2, rx: -0.35, glow: 0.9 });
    b.add({ piece: 'lumenRib', p: [0, dy + 3, 0], s: [0.08, 2.2, 0.08], glow: 1 });
    // Star-lamp path round the base.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      b.add({
        piece: 'lumenRib',
        p: [Math.cos(a) * 3.5, 0.3, Math.sin(a) * 3.5],
        s: [0.1, 0.5, 0.1],
        glow: 0.8,
      });
    }
    // Street level (D-097): a lit door with stepping stones round the front tree, benches, a public telescope on a
    // tripod in the garden, and a balustrade round the viewing deck.
    entrance(b, 0, 0.3, 1.5, 0.6, 0.45, 0xc9b6ff);
    for (const [x, z] of [
      [0.25, 2.05],
      [0.65, 2.5],
      [0.8, 3.0],
      [0.65, 3.5],
    ] as const)
      b.add({ piece: 'slab', p: [x, 0.38, z], s: [0.4, 0.03, 0.34], r: x, tint: 0xe4dac8 });
    for (const x of [-1.4, 1.4]) bench(b, x, 0.38, 2.25);
    const [sx, sz] = [-2.0, 1.4];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      beam(b, 'timberBox', [sx + Math.cos(a) * 0.22, 0.38, sz + Math.sin(a) * 0.22], [sx, 0.85, sz], 0.03, {
        tint: TRIM.charcoal,
      });
    }
    beam(b, 'concreteCyl', [sx - 0.2, 0.75, sz + 0.1], [sx + 0.25, 1.1, sz - 0.12], 0.12, { tint: 0xe9f4ef });
    railRing(b, 0, 12.6, 0, 2.1, 20);

    // Levels (D-100). Level 2: a planetarium wing at the foot of the tower (a low dome on a glazed drum) and a
    // second, outer ring of star lamps.
    const planetarium = () => {
      b.add({ piece: 'glassCyl', p: [-2.2, 0.38, -1.6], s: [2.0, 0.55, 2.0], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'dome', p: [-2.2, 0.93, -1.6], s: [2.1, 1.5, 2.1], tint: 0x2a3550 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        b.add({ piece: 'lumenRib', p: [-2.2 + Math.cos(a) * 0.55, 1.2 + (k % 3) * 0.12, -1.6 + Math.sin(a) * 0.55], s: [0.05, 0.05, 0.05], tint: 0xfff4c8, glow: 1 });
      }
    };
    b.level(2, () => {
      planetarium();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU + 0.2;
        b.add({ piece: 'lumenRib', p: [Math.cos(a) * 3.75, 0.3, Math.sin(a) * 3.75], s: [0.08, 0.35, 0.08], tint: 0xc9b6ff, glow: 0.8 });
      }
    });
    // Level 3: a radio dish on a mast beside the dome, a fourth armillary ring and a beam of light from the
    // telescope's mouth into the sky.
    b.level(3, () => {
      planetarium();
      b.add({ piece: 'concreteCyl', p: [2.5, 0.3, -2.0], s: [0.2, 3.4, 0.2], tint: 0xe9f4ef });
      b.add({ piece: 'dome', p: [2.6, 3.7, -2.0], s: [1.8, 0.6, 1.8], rx: -0.7, r: 0.6, tint: 0xe9f4ef });
      b.add({ piece: 'timberBox', p: [2.6, 3.8, -1.85], s: [0.03, 0.8, 0.03], rx: -0.7, tint: TRIM.steel });
      b.add({ piece: 'haloRing', p: [0, cy, 0], s: [8.4, 8.4, 8.4], rz: -0.6, r: 0.4, tint: 0xffe08a, glow: 1 });
      beam(b, 'lumenRib', [1.25, dy + 2.65, 0.62], [3.2, dy + 9.5, 1.6], 0.05, { tint: 0xc9b6ff, glow: 0.8 });
    });
  },
});
