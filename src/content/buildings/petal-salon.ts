import { defineBuilding } from '../types';
import type { KitBuilder } from '../types';
import { PALETTE, TRIM, awning, bench, door, flowers, ivyEdge, lamp, louvres, planter, railing } from '../kit';

/**
 * A neighbourhood beauty salon: a glazed ground-floor salon under a scalloped awning, and over it a pastel storey
 * whose round window is ringed with vanity-mirror bulbs (the building's signature, lit at night). The roof is a rose
 * terrace round a little glass conservatory where the salon grows its botanicals. Level 2 adds a spa storey behind
 * timber louvres; level 3 a larger domed botanical spa with a halo and trailing ivy. Recipe space: x, z ∈ [-1, 1],
 * street on +z.
 */

const ACCENTS = [0xe0459a, 0xc9708f, 0xb58ae8] as const;
const ROSES = [0xff9ec2, 0xffb7d5, 0xe0459a, 0xfff1e6] as const;
const PASTEL = 0xf6dfe2;

const W = 1.7;
const D = 1.4;
const ZC = -0.2;
const FRONT = ZC + D / 2;
const G = 0.08;
const H1 = 0.44;
const H2 = 0.38;

/** Vanity bulbs: `n` small warm lights round a circle of radius r on the +z face at (x, y, z). */
function bulbRing(b: KitBuilder, x: number, y: number, z: number, r: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    b.add({ piece: 'lumenRib', p: [x + Math.cos(a) * r, y + Math.sin(a) * r - 0.015, z], s: [0.03, 0.03, 0.03], tint: 0xfff1c8, glow: 1 });
  }
}

/** A clipped topiary in a pot: a ball on a short stem. */
function topiary(b: KitBuilder, x: number, y: number, z: number, tint: number): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.12, 0.1, 0.12], tint });
  b.add({ piece: 'trunk', p: [x, y + 0.1, z], s: [0.02, 0.14, 0.02], tint: PALETTE.bark });
  b.add({ piece: 'bush', p: [x, y + 0.2, z], s: 0.11, tint: PALETTE.leaves[1], growAt: 0.1 });
}

/** A rose terrace on a roof at y: moss bed, rose planters round the edge and a glass conservatory of radius r. */
function roseRoof(b: KitBuilder, y: number, r: number, trees: boolean): void {
  b.add({ piece: 'mossBox', p: [0, y, ZC], s: [W - 0.1, 0.04, D - 0.1] });
  b.add({ piece: 'slab', p: [0, y + 0.04, ZC + 0.35], s: [0.5, 0.012, 0.5], tint: 0xe9e0cf });
  for (const sx of [-1, 1]) {
    planter(b, sx * 0.62, y + 0.04, ZC, 0.25, 1.0, 0.15);
    flowers(b, sx * 0.62, y + 0.17, ZC, 0.12, 6, 0.2, 0.7);
  }
  railing(b, 0, y + 0.04, FRONT - 0.04, W - 0.15);
  b.add({ piece: 'concreteCyl', p: [0, y + 0.04, ZC - 0.2], s: [r * 2 + 0.06, 0.04, r * 2 + 0.06], tint: TRIM.cream });
  b.add({ piece: 'glassCyl', p: [0, y + 0.08, ZC - 0.2], s: [r * 2, 0.16, r * 2], tint: 0xf3e6ee, glow: 0.4 });
  b.add({ piece: 'glassDome', p: [0, y + 0.24, ZC - 0.2], s: [r * 2, r * 1.6, r * 2], tint: 0xffeef4 });
  flowers(b, 0, y + 0.08, ZC - 0.2, r * 0.6, 5, 0.2, 0.6);
  if (trees) b.add({ piece: 'bush', p: [0, y + 0.08, ZC - 0.2], s: r * 0.6, tint: PALETTE.leaves[2], growAt: 0.3 });
}

export default defineBuilding({
  id: 'petal-salon',
  name: 'Petal & Polish Salon',
  description:
    'A beauty salon with a glass front of styling chairs, a round vanity window ringed in bulbs, and a rose terrace on the roof where the botanicals for its treatments grow.',
  category: 'commercial',
  footprint: [2, 2],
  stats: { cost: 260, energy: -4, eco: 2, happiness: 6, population: 0, jobs: 14, pollution: 0, water: -3 },
  growthTime: 70,
  style: 'rose',
  recipe(b) {
    const accent = b.pick(ACCENTS);
    const roof1 = G + H1 + H2;
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.95, G, 1.95], tint: 0xe4dac8 });

    // Ground floor: a back wall and a full glass salon front with chairs and lit mirrors behind it.
    b.add({ piece: 'slab', p: [0, G, ZC - 0.25], s: [W, H1, D - 0.5], tint: PASTEL });
    b.add({ piece: 'glassBox', p: [0, G, FRONT - 0.25], s: [W - 0.05, H1, 0.5], tint: 0xf4eaf0, glow: 0.35 });
    for (let i = 0; i < 3; i++) {
      const x = -0.55 + i * 0.4;
      b.add({ piece: 'glassBox', p: [x, G + 0.12, FRONT - 0.48], s: [0.22, 0.22, 0.02], tint: 0xfff6e8, glow: 0.8 });
      b.add({ piece: 'slab', p: [x, G, FRONT - 0.3], s: [0.13, 0.1, 0.13], tint: accent });
      b.add({ piece: 'slab', p: [x, G + 0.1, FRONT - 0.36], s: [0.13, 0.1, 0.03], tint: accent });
    }
    // Cream frame round the glass, the door and a scalloped awning.
    for (const sx of [-1, 1]) b.add({ piece: 'slab', p: [sx * (W / 2 - 0.02), G, FRONT - 0.25], s: [0.05, H1, 0.52], tint: TRIM.cream });
    door(b, 0.62, G, FRONT + 0.005, 0.18, 0.28);
    awning(b, 0, G + H1 - 0.04, FRONT + 0.16, W + 0.06, 0.32, 0xfff4f0, accent, 9);

    // Upper storey: pastel walls, a cornice and the round vanity window with its bulbs.
    const y2 = G + H1;
    b.add({ piece: 'slab', p: [0, y2, ZC], s: [W, 0.03, D + 0.02], tint: TRIM.cream });
    b.add({ piece: 'slab', p: [0, y2 + 0.03, ZC], s: [W, H2 - 0.03, D], tint: PASTEL });
    b.add({ piece: 'glassCyl', p: [-0.3, y2 + H2 / 2, FRONT], s: [0.28, 0.03, 0.28], rx: Math.PI / 2, tint: 0xfff1e6, glow: 0.7 });
    b.add({ piece: 'concreteCyl', p: [-0.3, y2 + H2 / 2, FRONT - 0.005], s: [0.34, 0.02, 0.34], rx: Math.PI / 2, tint: TRIM.cream });
    bulbRing(b, -0.3, y2 + H2 / 2, FRONT + 0.03, 0.19, 12);
    // Two tall windows beside it and the lit script sign.
    for (const x of [0.25, 0.6]) b.add({ piece: 'glassBox', p: [x, y2 + 0.07, FRONT + 0.005], s: [0.18, 0.24, 0.02], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'slab', p: [0.42, y2 + H2 - 0.04, FRONT + 0.012], s: [0.6, 0.06, 0.01], tint: 0xff9ec2, glow: 0.95, sign: 'name' });
    b.add({ piece: 'slab', p: [0, roof1 - 0.04, ZC], s: [W + 0.06, 0.05, D + 0.06], tint: TRIM.cream });
    // Window box under the round window, trailing roses.
    b.add({ piece: 'timberBox', p: [-0.3, y2 + 0.02, FRONT + 0.05], s: [0.36, 0.05, 0.08], tint: TRIM.cream });
    flowers(b, -0.3, y2 + 0.07, FRONT + 0.05, 0.14, 5, 0.1, 0.5);

    // Street: topiaries flanking the door, a bench with a rose bed, a sandwich board and a lamp.
    topiary(b, 0.38, G, FRONT + 0.12, accent);
    topiary(b, 0.86, G, FRONT + 0.12, accent);
    bench(b, -0.45, G, 0.82, 0.42, false, true);
    b.add({ piece: 'mossBox', p: [-0.45, G, 0.62], s: [0.6, 0.05, 0.12] });
    for (let i = 0; i < 5; i++) b.add({ piece: 'flower', p: [-0.7 + i * 0.12, G + 0.05, 0.62], s: 0.08, tint: ROSES[i % 4]!, glow: i % 2 ? 0.4 : 0, growAt: 0.1 + i * 0.1 });
    b.add({ piece: 'slab', p: [0.15, G, 0.82], s: [0.14, 0.18, 0.02], rx: 0.18, tint: 0x3b3f42 });
    b.add({ piece: 'slab', p: [0.15, G, 0.86], s: [0.14, 0.18, 0.02], rx: -0.18, tint: 0x3b3f42 });
    lamp(b, -0.88, G, 0.85, 0.55);
    ivyEdge(b, -W / 2 - 0.01, roof1, ZC, D * 0.8, -1, 0, 4);

    b.upTo(1, () => roseRoof(b, roof1, 0.22, false));

    // Level 2: a spa storey behind timber louvres, with a soft glow between the fins; the roof terrace moves up.
    const roof2 = roof1 + H2;
    b.level(2, () => {
      b.add({ piece: 'slab', p: [0, roof1, ZC - 0.05], s: [W - 0.1, H2 - 0.02, D - 0.1], tint: PASTEL });
      b.add({ piece: 'glassBox', p: [0, roof1 + 0.05, FRONT - 0.04], s: [W - 0.3, H2 - 0.12, 0.02], tint: 0xffe8d8, glow: 0.7 });
      louvres(b, 0, roof1 + 0.02, FRONT - 0.01, W - 0.2, H2 - 0.06, 11);
      b.add({ piece: 'slab', p: [0, roof2 - 0.04, ZC], s: [W + 0.04, 0.05, D + 0.04], tint: TRIM.cream });
      b.upTo(2, () => roseRoof(b, roof2, 0.22, false));
    });

    // Level 3: the conservatory becomes a domed botanical spa ringed by a halo, with ivy down the front.
    b.level(3, () => {
      b.add({ piece: 'mossBox', p: [0, roof2, ZC], s: [W - 0.1, 0.04, D - 0.1] });
      for (const sx of [-1, 1]) planter(b, sx * 0.66, roof2 + 0.04, ZC + 0.35, 0.22, 0.4, 0.15);
      b.add({ piece: 'concreteCyl', p: [0, roof2 + 0.04, ZC - 0.1], s: [1.0, 0.05, 1.0], tint: TRIM.cream });
      b.add({ piece: 'glassCyl', p: [0, roof2 + 0.09, ZC - 0.1], s: [0.92, 0.22, 0.92], tint: 0xf3e6ee, glow: 0.45 });
      b.add({ piece: 'glassDome', p: [0, roof2 + 0.31, ZC - 0.1], s: [0.92, 0.7, 0.92], tint: 0xffeef4 });
      b.add({ piece: 'bush', p: [0, roof2 + 0.09, ZC - 0.1], s: 0.22, tint: PALETTE.leaves[2], growAt: 0.3 });
      flowers(b, 0, roof2 + 0.09, ZC - 0.1, 0.32, 8, 0.2, 0.7);
      b.add({ piece: 'haloRing', p: [0, roof2 + 0.72, ZC - 0.1], s: [0.7, 2, 0.7], tint: 0xffb7d5, glow: 1 });
      b.add({ piece: 'lumenRib', p: [0, roof2 + 0.64, ZC - 0.1], s: [0.04, 0.12, 0.04], tint: 0xfff1c8, glow: 1 });
      ivyEdge(b, 0, roof2, FRONT + 0.01, W * 0.85, 0, 1, 7);
    });
  },
});
