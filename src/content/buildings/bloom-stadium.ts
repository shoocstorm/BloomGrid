import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, flowers, lamp, tree } from '../kit';

const TAU = Math.PI * 2;
const SEATS = [0xf4f1ea, 0x5ff2da, 0xf4f1ea, 0xffb7d5];

export default defineBuilding({
  id: 'bloom-stadium',
  name: 'Bloom Stadium',
  description:
    'The island’s great bowl: three tiers of terraced seating round a living pitch, under a crown of solar petals that shade the crowd and light the night games.',
  category: 'sports',
  footprint: [12, 12],
  stats: {
    cost: 6000,
    energy: -40,
    eco: 6,
    happiness: 40,
    population: 0,
    jobs: 120,
    pollution: 0,
    water: -15,
  },
  growthTime: 200,
  style: 'classic',
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [11.6, 0.3, 11.6], tint: PALETTE.concrete });
    // The pitch and its markings.
    b.add({ piece: 'mossBox', p: [0, 0.3, 0], s: [5.6, 0.06, 3.6] });
    b.add({ piece: 'slab', p: [0, 0.36, 0], s: [0.06, 0.01, 3.4], tint: 0xffffff });
    b.add({ piece: 'haloRing', p: [0, 0.37, 0], s: [1.1, 0.2, 1.1], glow: 0.2 });
    for (const x of [-2.75, 2.75])
      b.add({ piece: 'slab', p: [x, 0.36, 0], s: [0.06, 0.5, 1.0], tint: 0xffffff });
    // Three tiers of terraced seating round an oval.
    for (let t = 0; t < 3; t++) {
      const [ra, rb] = [3.7 + t * 0.85, 2.7 + t * 0.85];
      const n = 36 + t * 6;
      const len = (TAU * Math.sqrt((ra * ra + rb * rb) / 2)) / n + 0.08;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
        b.add({
          piece: 'slab',
          p: [Math.cos(a) * ra, 0.3, Math.sin(a) * rb],
          s: [len, 0.55 + t * 0.6, 0.85],
          r: Math.atan2(-tz, tx),
          tint: SEATS[(k + t * 2) % SEATS.length]!,
        });
      }
    }
    // Crown of solar petals over the stands.
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      const [x, z] = [Math.cos(a) * 5.6, Math.sin(a) * 4.7];
      b.add({
        piece: 'solarLeaf',
        p: [x, 2.6, z],
        s: [2.1, 1, 1.5],
        r: Math.atan2(z, -x) + Math.PI,
        rz: 0.22,
        growAt: 0.1,
      });
    }
    b.add({ piece: 'haloRing', p: [0, 3.0, 0], s: [11.2, 3, 9.4], glow: 0.9 });
    // Floodlight masts and a ring of trees.
    for (const [x, z] of [
      [-5.3, -5.3],
      [5.3, -5.3],
      [-5.3, 5.3],
      [5.3, 5.3],
    ] as const) {
      b.add({ piece: 'concreteCyl', p: [x, 0.3, z], s: [0.18, 5.4, 0.18], tint: 0xf4f1ea });
      b.add({ piece: 'lumenRib', p: [x, 5.6, z], s: [0.7, 0.3, 0.3], r: Math.atan2(z, -x), glow: 1 });
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + 0.26;
      tree(b, Math.cos(a) * 5.4, 0.3, Math.sin(a) * 5.4, 0.55, 0.2);
    }
    flowers(b, 0, 0.3, 5.5, 2.5, 16, 0, 0.6);
    // Detail (D-097): goal frames and penalty boxes on the pitch, a big screen over the north stand, three lit
    // entrance gates with turnstiles, a ticket kiosk and plaza lamps.
    const line = (x: number, z: number, w: number, d: number) =>
      b.add({ piece: 'slab', p: [x, 0.36, z], s: [w, 0.01, d], tint: 0xffffff });
    for (const s of [-1, 1]) {
      const gx = s * 2.75;
      line(s * 2.35, -0.6, 0.8, 0.05);
      line(s * 2.35, 0.6, 0.8, 0.05);
      line(s * 1.95, 0, 0.05, 1.25);
      for (const z of [-0.4, 0.4])
        b.add({ piece: 'timberBox', p: [gx + s * 0.04, 0.36, z], s: [0.04, 0.3, 0.04], tint: 0xffffff });
      b.add({ piece: 'timberBox', p: [gx + s * 0.04, 0.66, 0], s: [0.04, 0.04, 0.84], tint: 0xffffff });
    }
    for (const x of [-1.0, 1.0])
      b.add({ piece: 'slab', p: [x, 0.3, -5.25], s: [0.14, 3.3, 0.14], tint: 0xf4f1ea });
    b.add({ piece: 'slab', p: [0, 3.5, -5.25], s: [2.6, 1.1, 0.1], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [0, 3.58, -5.19], s: [2.4, 0.94, 0.02], tint: 0x5ff2da, glow: 0.9 });
    for (const [x, z, r] of [
      [0, 5.0, 0],
      [5.75, 0, Math.PI / 2],
      [-5.75, 0, -Math.PI / 2],
    ] as const) {
      const [c, s] = [Math.cos(r), Math.sin(r)];
      const at = (u: number, v = 0): [number, number] => [x + u * c + v * s, z - u * s + v * c];
      for (const u of [-0.75, 0.75])
        b.add({ piece: 'slab', p: [at(u)[0], 0.3, at(u)[1]], s: [0.22, 1.5, 0.22], tint: 0xf4f1ea });
      b.add({
        piece: 'slab',
        p: [x, 1.8, z],
        s: r ? [0.2, 0.32, 1.8] : [1.8, 0.32, 0.2],
        tint: TRIM.charcoal,
      });
      b.add({
        piece: 'slab',
        p: [at(0, 0.11)[0], 1.86, at(0, 0.11)[1]],
        s: r ? [0.02, 0.2, 1.5] : [1.5, 0.2, 0.02],
        tint: 0xffb7d5,
        glow: 1,
      });
      for (const u of [-0.3, 0, 0.3])
        b.add({
          piece: 'slab',
          p: [at(u, -0.2)[0], 0.3, at(u, -0.2)[1]],
          s: [0.06, 0.28, 0.06],
          tint: TRIM.steel,
        });
    }
    b.add({ piece: 'timberBox', p: [2.2, 0.3, 5.35], s: [0.6, 0.55, 0.4], tint: PALETTE.timber });
    b.add({ piece: 'glassBox', p: [2.2, 0.55, 5.56], s: [0.45, 0.2, 0.02], tint: 0xd6f2ee, glow: 0.4 });
    awning(b, 2.2, 0.9, 5.6, 0.7, 0.3, 0xf4f1ea, 0x2fbfa6, 4);
    for (const x of [-3.0, 3.6]) lamp(b, x, 0.3, 5.5, 0.8);

    // Levels (D-100). A stand tier on the oval at level t (the recipe's three are t = 0..2).
    const tier = (t: number) => {
      const [ra, rb] = [3.7 + t * 0.85, 2.7 + t * 0.85];
      const n = 36 + t * 6;
      const len = (TAU * Math.sqrt((ra * ra + rb * rb) / 2)) / n + 0.08;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        // Leave the scoreboard end open.
        if (Math.abs(a - Math.PI * 1.5) < 0.35) continue;
        const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
        b.add({ piece: 'slab', p: [Math.cos(a) * ra, 0.3, Math.sin(a) * rb], s: [len, 0.55 + t * 0.6, 0.6], r: Math.atan2(-tz, tx), tint: SEATS[(k + t * 2) % SEATS.length]! });
      }
    };
    // Level 2: a fourth, upper tier of seats behind the others, and the light masts taller with a second bank.
    b.level(2, () => {
      tier(3);
      for (const [x, z] of [
        [-5.3, -5.3],
        [5.3, -5.3],
        [-5.3, 5.3],
        [5.3, 5.3],
      ] as const) {
        b.add({ piece: 'concreteCyl', p: [x, 5.7, z], s: [0.14, 1.4, 0.14], tint: 0xf4f1ea });
        b.add({ piece: 'lumenRib', p: [x, 7.1, z], s: [0.7, 0.3, 0.3], r: Math.atan2(z, -x), glow: 1 });
      }
    });
    // Level 3: the roof closes into a petal crown: a second ring of larger solar petals cantilevered over the
    // upper tier, a lit crown ring, and garlands of pink light round the rim.
    b.level(3, () => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU + 0.13;
        const [x, z] = [Math.cos(a) * 5.3, Math.sin(a) * 4.5];
        b.add({ piece: 'sunPetal', p: [x, 3.4, z], s: [2.6, 1, 1.4], r: Math.atan2(z, -x) + Math.PI, rz: -0.35, tint: k % 2 ? 0xffb7d5 : 0xf4f1ea, glow: 0.4 });
      }
      b.add({ piece: 'haloRing', p: [0, 4.1, 0], s: [8.6, 3, 7.0], tint: 0xffb7d5, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, 3.9, 0], s: [11.6, 3, 9.8], tint: 0x5ff2da, glow: 0.9 });
    });
  },
});
