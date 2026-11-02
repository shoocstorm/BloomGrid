import { defineBuilding } from '../types';
import { PALETTE, TRIM, awning, beam, door, grassTufts, lamp } from '../kit';

const TAU = Math.PI * 2;

export default defineBuilding({
  id: 'wind-velodrome',
  name: 'Wind Velodrome',
  description:
    'A banked timber track under ribs of glulam arches, cooled by the sea breeze through its open sides. Track racing by day, community rides by night.',
  category: 'sports',
  footprint: [9, 7],
  stats: { cost: 2400, energy: -18, eco: 3, happiness: 16, population: 0, jobs: 30, pollution: 0, water: -4 },
  growthTime: 170,
  variants: 1,
  recipe(b) {
    b.add({ piece: 'slab', p: [0, 0, 0], s: [8.8, 0.25, 6.8], tint: PALETTE.concrete });
    b.add({ piece: 'mossBox', p: [0, 0.25, 0], s: [4.6, 0.05, 2.6] });
    grassTufts(b, 0, 0.3, 0, 4.2, 2.2, 20);
    // The banked oval: timber boards tilted toward the infield.
    const [ra, rb, n] = [3.5, 2.3, 40];
    const len = (TAU * Math.sqrt((ra * ra + rb * rb) / 2)) / n + 0.06;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
      b.add({
        piece: 'timberBox',
        p: [Math.cos(a) * ra, 0.25, Math.sin(a) * rb],
        s: [len, 0.08, 0.95],
        r: Math.atan2(-tz, tx),
        rx: 0.32,
        tint: 0xc89a66,
      });
    }
    b.add({ piece: 'haloRing', p: [0, 0.6, 0], s: [8.0, 1, 5.6], glow: 0.8 });
    // Glulam rib vault, open to the breeze.
    for (let i = 0; i < 7; i++)
      b.add({
        piece: 'willowArch',
        p: [-3.6 + i * 1.2, 0.25, 0],
        s: [6.6, 3.4, 2.4],
        r: Math.PI / 2,
        tint: 0xd8b07e,
      });
    // The ridge rests on the arch crowns (the arch rises 1.7 above the deck).
    b.add({ piece: 'timberBox', p: [0, 2.05, 0], s: [7.6, 0.1, 0.5], tint: PALETTE.timber });
    // Detail (D-097): the blue and red racing lines round the banking, spectator steps along both sides, an
    // entrance pavilion with a lit sign, racing bikes on the infield, pennants and lamps.
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const [tx, tz] = [-Math.sin(a) * ra, Math.cos(a) * rb];
      for (const [off, tint] of [
        [-0.28, 0x3f8fb0],
        [0.05, TRIM.red],
      ] as const) {
        const [rx, rz] = [Math.cos(a) * (ra + off), Math.sin(a) * (rb + off)];
        b.add({
          piece: 'slab',
          p: [rx, 0.25 + 0.04 + off * Math.sin(0.32), rz],
          s: [len, 0.06, 0.035],
          r: Math.atan2(-tz, tx),
          rx: 0.32,
          tint,
        });
      }
    }
    for (const z of [-3.15, 3.15])
      for (let r = 0; r < 2; r++)
        b.add({
          piece: 'timberBox',
          p: [0, 0.25 + r * 0.14, z + Math.sign(z) * r * 0.14],
          s: [6.0, 0.14, 0.16],
          tint: 0xc89a66,
        });
    b.add({ piece: 'timberBox', p: [3.9, 0.25, 2.6], s: [0.8, 0.7, 0.8], tint: PALETTE.timber });
    door(b, 3.9, 0.25, 3.01, 0.26, 0.4);
    awning(b, 3.9, 0.95, 3.15, 0.9, 0.3, 0xf4f1ea, TRIM.red, 5);
    b.add({ piece: 'slab', p: [3.9, 0.98, 2.99], s: [0.8, 0.2, 0.03], tint: TRIM.charcoal });
    b.add({ piece: 'slab', p: [3.9, 1.04, 3.03], s: [0.7, 0.12, 0.01], tint: 0x5ff2da, glow: 0.9 });
    for (let i = 0; i < 3; i++) {
      const x = -1.2 + i * 0.5;
      for (const dx of [-0.13, 0.13])
        b.add({
          piece: 'concreteCyl',
          p: [x + dx, 0.47, 0.2],
          s: [0.22, 0.015, 0.22],
          rx: Math.PI / 2,
          tint: TRIM.charcoal,
        });
      beam(b, 'slab', [x - 0.13, 0.47, 0.2], [x + 0.06, 0.6, 0.2], 0.02, {
        tint: [TRIM.red, TRIM.seaBlue, TRIM.orange][i]!,
      });
      beam(b, 'slab', [x + 0.06, 0.6, 0.2], [x + 0.13, 0.47, 0.2], 0.02, {
        tint: [TRIM.red, TRIM.seaBlue, TRIM.orange][i]!,
      });
    }
    for (const [x, z] of [
      [-4.1, -3.1],
      [-4.1, 3.1],
      [4.1, -3.1],
    ] as const) {
      b.add({ piece: 'timberBox', p: [x, 0.25, z], s: [0.04, 1.6, 0.04], tint: TRIM.steel });
      b.add({
        piece: 'slab',
        p: [x + 0.15, 1.55, z],
        s: [0.3, 0.2, 0.01],
        tint: b.pick([TRIM.red, TRIM.teal, 0xffd36b]),
      });
    }
    lamp(b, -3.9, 0.25, 0.0, 0.7);
    lamp(b, 4.15, 0.25, 0.0, 0.7);

    // Levels (D-100). Level 2: spectator galleries of timber on both long sides, under glazed canopies, and a
    // turbine fin on the roof ridge.
    const galleries = () => {
      for (const z of [-3.15, 3.15]) {
        const s = Math.sign(z);
        b.add({ piece: 'timberBox', p: [0, 0.53, z + s * 0.28], s: [6.0, 0.14, 0.16], tint: 0xc89a66 });
        for (const x of [-2.8, 0, 2.8]) b.add({ piece: 'timberBox', p: [x, 0.25, z + s * 0.4], s: [0.05, 1.1, 0.05], tint: PALETTE.timber });
        b.add({ piece: 'glassBox', p: [0, 1.35, z + s * 0.25], s: [6.2, 0.04, 0.6], rx: s * 0.2, tint: 0xd6f2ee });
      }
    };
    b.level(2, () => {
      galleries();
      for (let k = 0; k < 3; k++) b.add({ piece: 'solarLeaf', p: [-2.4 + k * 2.4, 2.15, 0], s: [0.9, 1, 1.3], r: Math.PI / 2, rz: 0.15, tint: 0xf4f1ea });
    });
    // Level 3: the willow shell grows a lantern ridge (a lit glass clerestory along the top), wind spinners on
    // masts at each end and a finish-line gantry over the track.
    b.level(3, () => {
      galleries();
      b.add({ piece: 'glassBox', p: [0, 2.15, 0], s: [7.0, 0.35, 0.36], tint: PALETTE.glassWarm, glow: 0.7 });
      b.add({ piece: 'timberBox', p: [0, 2.5, 0], s: [7.4, 0.06, 0.6], tint: PALETTE.timber });
      for (const x of [-4.1, 4.1]) {
        b.add({ piece: 'timberBox', p: [x, 0.25, 0], s: [0.05, 2.8, 0.05], tint: TRIM.steel });
        for (let k = 0; k < 3; k++) b.add({ piece: 'solarLeaf', p: [x, 3.05, 0], s: [0.5, 1, 0.3], r: (k / 3) * TAU, rz: 1.2, tint: TRIM.red });
      }
      for (const z of [-2.3, -1.4]) b.add({ piece: 'timberBox', p: [1.6, 0.25, z], s: [0.05, 1.2, 0.05], tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: [1.6, 1.45, -1.85], s: [0.08, 0.16, 1.05], tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: [1.65, 1.48, -1.85], s: [0.01, 0.1, 0.9], tint: 0x5ff2da, glow: 0.9 });
    });
  },
});
