import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, flowers, grassTufts, lamp, railing } from '../kit';

export default defineBuilding({
  id: 'solar-spire',
  name: 'Sunflower Spire',
  description: 'A slender solar-glass spire whose photovoltaic petals unfurl toward the sun.',
  category: 'energy',
  footprint: [2, 2],
  stats: { cost: 220, energy: 40, eco: 1, happiness: 1, population: 0, jobs: 4, pollution: 0 },
  growthTime: 60,
  cleanEnergy: true,
  recipe(b) {
    const h = b.range(3.2, 4.2);
    b.add({ piece: 'mossBox', p: [0, 0, 0], s: [1.6, 0.12, 1.6] });
    grassTufts(b, 0, 0.12, 0, 1.5, 1.5, 14);
    flowers(b, 0, 0.12, 0, 0.75, 14, 0, 0.5);
    b.add({ piece: 'glassCyl', p: [0, 0.12, 0], s: [0.42, h, 0.42], tint: PALETTE.glassWarm });
    b.add({ piece: 'concreteCyl', p: [0, 0.12, 0], s: [0.55, 0.4, 0.55], tint: PALETTE.concrete });
    // Spiral of ivy up the shaft
    for (let i = 0; i < 6; i++) {
      b.add({ piece: 'ivy', p: [Math.cos(i) * 0.22, 0.6 + i * (h / 7), Math.sin(i) * 0.22], s: [0.12, 0.5, 1], r: -i + Math.PI / 2, growAt: 0.1 * i });
    }
    // Sunflower crown
    const top = h + 0.12;
    b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [0.5, 0.12, 0.5], tint: 0xffe08a, glow: 0.4 });
    const petals = 12;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 + ring * 0.26;
        b.add({
          piece: 'solarLeaf',
          p: [0, top + 0.08 + ring * 0.04, 0],
          s: [0.9 - ring * 0.25, 1, 0.9 - ring * 0.25],
          r: a,
          rz: 0.35 + ring * 0.3,
          growAt: 0.05 + (i / petals) * 0.3 + ring * 0.2,
        });
      }
    }
    // Detail (D-095): a stone apron, the inverter kiosk with a lit sign, a service ring halfway up and a slim
    // helical rib round the shaft.
    b.add({ piece: 'slab', p: [0, 0.12, 0.55], s: [1.1, 0.03, 0.4], tint: 0xe4dac8 });
    b.add({ piece: 'timberBox', p: [0.5, 0.12, -0.45], s: [0.3, 0.26, 0.24], tint: 0xb48d63 });
    b.add({ piece: 'slab', p: [0.5, 0.38, -0.45], s: [0.36, 0.03, 0.3], tint: TRIM.pv });
    b.add({ piece: 'slab', p: [0.5, 0.26, -0.32], s: [0.18, 0.05, 0.01], tint: 0xffd23f, glow: 0.6 });
    b.add({ piece: 'concreteCyl', p: [0, 0.12 + h * 0.55, 0], s: [0.62, 0.035, 0.62], tint: TRIM.cream });
    railing(b, 0, 0.12 + h * 0.55 + 0.035, 0.3, 0.5, false, 0.06);
    for (let k = 0; k < 14; k++) {
      const a0 = k * 0.75;
      const a1 = (k + 1) * 0.75;
      const y0 = 0.5 + (k / 14) * h * 0.9;
      const y1 = 0.5 + ((k + 1) / 14) * h * 0.9;
      beam(b, 'timberBox', [Math.cos(a0) * 0.235, y0, Math.sin(a0) * 0.235], [Math.cos(a1) * 0.235, y1, Math.sin(a1) * 0.235], 0.02, { tint: 0xe9e1d0 });
    }
    b.add({ piece: 'timberBox', p: [-0.45, 0.12, 0.55], s: [0.36, 0.06, 0.1], tint: 0xa47c56 });
    lamp(b, 0.62, 0.12, 0.62, 0.45);

    // Levels (D-100). A ring of solar petals at height y, `n` petals of size s.
    const bloom = (y: number, s: number, n: number, tilt: number, tint = 0xffffff) => {
      b.add({ piece: 'concreteCyl', p: [0, y - 0.04, 0], s: [0.5, 0.06, 0.5], tint: 0xffe08a, glow: 0.4 });
      for (let i = 0; i < n; i++) b.add({ piece: 'solarLeaf', p: [0, y, 0], s: [s, 1, s], r: (i / n) * Math.PI * 2 + 0.13, rz: tilt, tint });
    };
    // Level 2: a second, lower bloom opens at the balcony and a battery bank joins the kiosk.
    b.level(2, () => {
      bloom(0.12 + h * 0.36, 0.7, 10, 0.3);
      b.add({ piece: 'slab', p: [-0.5, 0.12, -0.45], s: [0.34, 0.34, 0.24], tint: 0xe9eee8 });
      for (let r = 0; r < 3; r++) b.add({ piece: 'lumenRib', p: [-0.5, 0.2 + r * 0.08, -0.32], s: [0.26, 0.02, 0.01], tint: 0x8fd35a, glow: 0.8 });
    });
    // Level 3: the crown grows a third, widest ring of golden petals under a halo, with a beacon.
    b.level(3, () => {
      bloom(0.12 + h * 0.36, 0.7, 10, 0.3);
      bloom(top + 0.02, 1.15, 14, 0.18, 0xffe9b0);
      b.add({ piece: 'haloRing', p: [0, top + 0.5, 0], s: [1.4, 3, 1.4], tint: 0xffe08a, glow: 1 });
      b.add({ piece: 'lumenRib', p: [0, top + 0.12, 0], s: [0.05, 0.8, 0.05], glow: 1 });
    });
  },
});
