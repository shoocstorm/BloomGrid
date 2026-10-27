import { defineBuilding } from '../types';
import { PALETTE, beam, flowers, grassTufts, tree } from '../kit';

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
  },
});
