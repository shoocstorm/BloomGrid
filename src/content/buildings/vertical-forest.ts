import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, flowers, grassTufts, tree } from '../kit';

/** A tower wrapped in staggered cantilevered balconies, each carrying a tree. */
function forestTower(b: KitBuilder, x: number, z: number, h: number, w: number): void {
  b.add({ piece: 'glassBox', p: [x, 0.3, z], s: [w, h, w], tint: PALETTE.glass, glow: 0.06 });
  b.add({ piece: 'slab', p: [x, 0.3, z], s: [w * 0.35, h + 0.3, w * 0.35], tint: PALETTE.concrete });
  let i = 0;
  for (let y = 1.4; y < h; y += 1.28, i++) {
    // Each floor's balconies jut out on alternating faces so the trees stagger up the façade.
    for (let f = 0; f < 4; f++) {
      const a = (f / 4) * Math.PI * 2;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      const off = w * 0.5 + 0.35;
      const lx = x + nx * off + nz * (i % 3 === 0 ? 0.6 : -0.6);
      const lz = z + nz * off - nx * (i % 3 === 0 ? 0.6 : -0.6);
      b.add({
        piece: 'slab',
        p: [lx, 0.3 + y, lz],
        s: [Math.abs(nz) > 0.5 ? 1.6 : 0.8, 0.08, Math.abs(nz) > 0.5 ? 0.8 : 1.6],
        tint: 0xe9e2d0,
      });
      tree(b, lx, 0.38 + y, lz, b.range(0.6, 0.85), 0.05 + (y / h) * 0.6);
      if (i % 2) b.add({ piece: 'ivy', p: [lx, 0.3 + y, lz], s: [0.9, 1.1, 1], r: a, growAt: 0.3 });
    }
  }
  // Roof orchard.
  b.add({ piece: 'mossBox', p: [x, 0.3 + h, z], s: [w, 0.12, w] });
  for (let k = 0; k < 3; k++)
    tree(b, x + b.range(-0.5, 0.5) * w, 0.42 + h, z + b.range(-0.5, 0.5) * w, 0.7, 0.4);
  b.add({ piece: 'lumenRib', p: [x, 0.3 + h + 0.12, z + w / 2], s: [w, 0.08, 0.08], glow: 0.9 });
}

export default defineBuilding({
  id: 'vertical-forest',
  name: 'Vertical Forest Towers',
  description:
    'Twin residential towers hosting a whole hectare of forest: nine hundred trees on staggered balconies that shade, cool and filter the air for every home inside.',
  category: 'residential',
  footprint: [10, 6],
  stats: {
    cost: 3600,
    energy: -18,
    eco: 30,
    happiness: 18,
    population: 360,
    jobs: 10,
    pollution: -4,
    water: -22,
  },
  growthTime: 240,
  pollinators: 2,
  variants: 1,
  style: 'limestone',
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, 0.3, 5.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [9.6, 0.06, 5.6] });
    grassTufts(b, 0, 0.36, 0, 9.4, 5.4, 70);
    flowers(b, 0, 0.36, 0, 2.6, 40, 0, 0.6);
    forestTower(b, -2.4, 0, 17, 2.6);
    forestTower(b, 2.5, 0.2, 13, 2.4);
    // Garden bridge between the two at the eighth floor.
    b.add({ piece: 'slab', p: [0.05, 8.0, 0.1], s: [2.6, 0.12, 0.9], tint: PALETTE.concrete });
    flowers(b, 0.05, 8.12, 0.1, 0.5, 8, 0.2, 0.8);
  },
});
