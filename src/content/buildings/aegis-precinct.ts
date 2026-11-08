import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, TRIM, bench, entrance, flowers, grassTufts, ivyEdge, lamp, planter, railing, solarArray, tree } from '../kit';

/**
 * The Aegis Watch Precinct (D-138): the island's police headquarters and emergency command, a hero of The Exchange.
 * A white-and-navy civic hall with a glass command atrium, a rooftop drone deck with two pads (the police module
 * parks the precinct's drones there and flies them on a dispatch), a comms mast with a beacon, a star badge over the
 * entrance and red/blue light strips along the roofline.
 */

const Y = 0.14;
/** Main hall: footprint (x, z), height and its front face (+z). */
const HALL_W = 8.2;
const HALL_D = 4.6;
const HALL_Z = -0.9;
const HALL_H = 3.0;
const FRONT = HALL_Z + HALL_D / 2;
/** Drone deck on the hall's roof, and the two pads on it (recipe space): read by the police module. */
const DECK_Y = Y + HALL_H + 0.18;
export const POLICE_PADS: readonly (readonly [number, number, number])[] = [
  [1.1, DECK_Y + 0.1, HALL_Z],
  [3.0, DECK_Y + 0.1, HALL_Z],
];
const NAVY = 0x22314e;
const WHITE = 0xf1f3f5;
const BLUE = 0x3f7bff;
const RED = 0xff3b4c;

/** A five-pointed star badge of light ribs inside a ring, facing +z at (x, y, z). */
function badge(b: KitBuilder, x: number, y: number, z: number, r: number): void {
  b.add({ piece: 'haloRing', p: [x, y, z], s: [r * 2.2, 4, r * 2.2], rx: Math.PI / 2, tint: 0xffd56b, glow: 1 });
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 5;
    b.add({ piece: 'lumenRib', p: [x, y, z], s: [0.07, r * 0.95, 0.04], rz: a - Math.PI / 2, tint: 0xffd56b, glow: 1 });
  }
}

/** A drone pad: navy disc, a blue light ring, a white inner ring and red/blue corner beacons. */
function pad(b: KitBuilder, x: number, y: number, z: number): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [1.7, 0.1, 1.7], tint: NAVY });
  b.add({ piece: 'haloRing', p: [x, y + 0.11, z], s: [1.6, 2, 1.6], tint: BLUE, glow: 1 });
  b.add({ piece: 'haloRing', p: [x, y + 0.11, z], s: [0.9, 2, 0.9], tint: WHITE, glow: 0.6 });
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    b.add({ piece: 'lumenRib', p: [x + sx * 0.62, y + 0.1, z + sz * 0.62], s: [0.06, 0.12, 0.06], tint: sz > 0 ? RED : BLUE, glow: 1 });
}

export default defineBuilding({
  id: 'aegis-precinct',
  name: 'Aegis Watch Precinct',
  description:
    'The island’s police headquarters and emergency command: a white-and-navy hall around a glass command atrium, a comms mast with a beacon, and a rooftop deck where the patrol drones land. Its crews and drones answer fires within reach while it is powered and staffed. Select it to dispatch its drones.',
  category: 'utility',
  footprint: [10, 8],
  requires: 'police',
  stats: {
    cost: 4200,
    energy: -24,
    eco: 6,
    happiness: 12,
    population: 0,
    jobs: 90,
    pollution: 0,
  },
  growthTime: 160,
  response: { radius: 36 },
  variants: 1,
  retrofit: false,
  recipe(b) {
    // Plaza: pale paving, a navy apron at the front with a lit entrance walk, planters and trees at the corners.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [9.8, Y, 7.8], tint: PALETTE.concrete });
    b.add({ piece: 'slab', p: [0, Y, FRONT + 1.2], s: [3.2, 0.03, 2.2], tint: 0x34445f });
    for (const sx of [-1, 1]) {
      b.add({ piece: 'mossBox', p: [sx * 4.1, Y, 2.9], s: [1.4, 0.12, 1.6] });
      grassTufts(b, sx * 4.1, Y + 0.12, 2.9, 1.2, 1.4, 10);
      tree(b, sx * 4.2, Y + 0.12, 3.0, 0.75, 0.1);
      flowers(b, sx * 4.1, Y + 0.12, 2.9, 0.5, 10, 0, 0.6);
      planter(b, sx * 2.6, Y, FRONT + 2.2, 0.9, 0.5);
      lamp(b, sx * 1.9, Y, FRONT + 0.6, 0.7);
      bench(b, sx * 3.2, Y, FRONT + 1.5, 0.5);
    }
    // Flagpoles with navy and gold banners either side of the walk.
    for (const sx of [-1, 1]) {
      b.add({ piece: 'timberBox', p: [sx * 1.2, Y, FRONT + 2.4], s: [0.05, 2.4, 0.05], tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: [sx * 1.2 + sx * 0.32, Y + 1.9, FRONT + 2.4], s: [0.6, 0.38, 0.02], tint: sx > 0 ? NAVY : 0xffd56b });
    }

    // The main hall: white frame over navy glass, a lit band at each floor and red/blue light strips on the roofline.
    b.add({ piece: 'glassBox', p: [0, Y, HALL_Z], s: [HALL_W, HALL_H, HALL_D], tint: 0x9cc2e6, glow: 0.2 });
    for (const y of [Y + 1.5, Y + HALL_H]) b.add({ piece: 'slab', p: [0, y - 0.08, HALL_Z], s: [HALL_W + 0.2, 0.16, HALL_D + 0.2], tint: WHITE });
    for (let i = 0; i < 9; i++) {
      const x = -HALL_W / 2 + (i * HALL_W) / 8;
      b.add({ piece: 'slab', p: [x, Y, FRONT + 0.06], s: [0.14, HALL_H, 0.12], tint: WHITE });
    }
    // Blue light fins up the hall's four corners.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) b.add({ piece: 'lumenRib', p: [sx * (HALL_W / 2 + 0.1), Y, HALL_Z + sz * (HALL_D / 2 + 0.1)], s: [0.09, HALL_H + 0.1, 0.09], tint: BLUE, glow: 1 });
    for (let i = 0; i < 8; i++) {
      const x = -HALL_W / 2 + (i + 0.5) * (HALL_W / 8);
      b.add({ piece: 'slab', p: [x, Y + HALL_H + 0.02, FRONT + 0.11], s: [HALL_W / 8 - 0.12, 0.08, 0.03], tint: i % 2 ? BLUE : RED, glow: 0.9 });
    }
    // Entrance under a deep canopy, sliding glass doors (E in walk mode) and the star badge above.
    entrance(b, 0, Y, FRONT + 0.08, 1.2, 0.75, 0x9fd0ff);
    for (const sx of [-1, 1]) b.add({ piece: 'glassBox', p: [sx * 0.3, Y, FRONT + 0.1], s: [0.6, 0.72, 0.03], tint: 0xd6ecff, glow: 0.3, door: sx * 0.95 });
    b.add({ piece: 'slab', p: [0, Y + 1.0, FRONT + 0.7], s: [3.0, 0.1, 1.4], tint: WHITE });
    b.add({ piece: 'lumenRib', p: [-1.5, Y + 0.98, FRONT + 1.38], s: [0.05, 3.0, 0.05], rz: -Math.PI / 2, tint: BLUE, glow: 1 });
    badge(b, 0, Y + 2.25, FRONT + 0.14, 0.42);

    // Command atrium: a glass drum rising through the hall's west end, ringed with blue light, a lookout on top.
    const ax = -2.6;
    const AH = 6.4;
    b.add({ piece: 'glassCyl', p: [ax, Y, HALL_Z - 0.2], s: [3.0, AH, 3.0], tint: 0xbfe2ff, glow: 0.3 });
    for (const y of [Y + HALL_H + 0.6, Y + AH - 0.6]) b.add({ piece: 'haloRing', p: [ax, y, HALL_Z - 0.2], s: [3.1, 2, 3.1], tint: BLUE, glow: 1 });
    b.add({ piece: 'concreteCyl', p: [ax, Y + AH, HALL_Z - 0.2], s: [3.4, 0.14, 3.4], tint: WHITE });
    b.add({ piece: 'haloRing', p: [ax, Y + AH + 0.15, HALL_Z - 0.2], s: [3.2, 2, 3.2], tint: WHITE, glow: 0.4 });
    // A light-bar crown round the lookout's rim: red and blue blocks alternating, like a patrol car's roof.
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2;
      b.add({ piece: 'slab', p: [ax + Math.cos(t) * 1.62, Y + AH + 0.14, HALL_Z - 0.2 - Math.sin(t) * 1.62], s: [0.5, 0.16, 0.1], r: t + Math.PI / 2, tint: k % 2 ? BLUE : RED, glow: 1 });
    }
    // Comms mast with a dish and a red-and-blue beacon.
    const mast = (h: number) => {
      b.add({ piece: 'lumenRib', p: [ax, Y + AH + 0.14, HALL_Z - 0.2], s: [0.09, h, 0.09], tint: WHITE, glow: 0.4 });
      for (const k of [0.35, 0.65]) b.add({ piece: 'haloRing', p: [ax, Y + AH + h * k, HALL_Z - 0.2], s: [0.7 - k * 0.4, 2, 0.7 - k * 0.4], tint: BLUE, glow: 1 });
      b.add({ piece: 'lumenRib', p: [ax, Y + AH + h, HALL_Z - 0.2], s: [0.16, 0.18, 0.16], tint: RED, glow: 1 });
    };
    b.add({ piece: 'dome', p: [ax + 0.7, Y + AH + 0.14, HALL_Z - 0.6], s: [0.7, 0.35, 0.7], rx: -0.6, tint: WHITE });
    b.upTo(2, () => mast(3.2));

    // Drone deck on the hall roof: navy decking, a railing round the open edges and two pads (POLICE_PADS).
    b.add({ piece: 'slab', p: [1.4, DECK_Y - 0.06, HALL_Z], s: [5.2, 0.08, HALL_D - 0.2], tint: 0x2c3a4c });
    for (const [x, , z] of POLICE_PADS) pad(b, x, DECK_Y, z);
    railing(b, -1.2, DECK_Y, HALL_Z + HALL_D / 2 - 0.15, 5.2);
    railing(b, -1.2, DECK_Y, HALL_Z - HALL_D / 2 + 0.15, 5.2);
    railing(b, 3.95, DECK_Y, HALL_Z - HALL_D / 2 + 0.15, HALL_D - 0.3, true);
    ivyEdge(b, 1.4, Y + HALL_H, HALL_Z - HALL_D / 2 - 0.1, 5, 0, -1, 5);

    // Level 2: a second storey on the east wing with a solar roof, and a garden terrace on the atrium's lookout.
    b.level(2, () => {
      b.add({ piece: 'glassBox', p: [-0.4, DECK_Y, HALL_Z - 1.3], s: [1.6, 1.0, 1.6], tint: 0x9cc2e6, glow: 0.4 });
      b.add({ piece: 'slab', p: [-0.4, DECK_Y + 1.0, HALL_Z - 1.3], s: [1.8, 0.08, 1.8], tint: WHITE });
      solarArray(b, -0.4, DECK_Y + 1.08, HALL_Z - 1.3, 1.6, 1.6);
      b.add({ piece: 'mossBox', p: [ax, Y + AH + 0.14, HALL_Z - 0.2], s: [2.2, 0.08, 2.2], r: Math.PI / 4 });
      flowers(b, ax, Y + AH + 0.22, HALL_Z - 0.2, 0.9, 12, 0.1, 0.7);
    });
    // Level 3: the mast doubles in height with a third light ring, and a glass command crown tops the atrium.
    b.level(3, () => {
      mast(5.6);
      b.add({ piece: 'haloRing', p: [ax, Y + AH + 5.6 * 0.85, HALL_Z - 0.2], s: [0.4, 2, 0.4], tint: RED, glow: 1 });
      b.add({ piece: 'glassCyl', p: [ax, Y + AH + 0.14, HALL_Z - 0.2], s: [1.4, 0.7, 1.4], tint: 0xd6ecff, glow: 0.6 });
    });
  },
});
