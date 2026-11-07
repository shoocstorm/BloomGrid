import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, TRIM, bench, entrance, flowers, footbridge, grassTufts, ivyEdge, lamp, lilies, planter, railRing, railing, tree } from '../kit';

/**
 * The Aurora Gemini (D-135): the city's twin landmark at the island centre. Two identical round glass towers,
 * Sol (east) and Luna (west), ringed by spiralling light ribs and round sky-garden lawns, joined by a garden
 * bridge and a sky-pool bridge whose waterfall drops into the canal between them, with the Sun Gate (the Aurora
 * Ring and its golden rays) hung between their spires. The `aurora` module
 * reads `AURORA` for its searchlights, light show and sky deck.
 */

const TAU = Math.PI * 2;
/** Plaza top, lobby height, storey stack. */
const Y = 0.16;
const BASE = 2.4;
const TIER = 1.3;
const TIERS = 32;
/** Tower axes at x = ±AXIS (local). */
const AXIS = 3.7;
const GARDENS = new Set([5, 13, 23, 28]);
const GARDEN_BRIDGE = 9;
const POOL_BRIDGE = 19;
const LIGHT_BRIDGE = 26;

/** Tower diameter at storey i: a slender taper with a slight belly. */
const size = (i: number) => 4.4 - 1.6 * (i / TIERS) + 0.35 * Math.sin((Math.PI * i) / TIERS);
/** Storey i's twist: the light ribs spiral gently up both towers alike. */
const twist = (i: number) => i * 0.045;
const TOP = BASE + TIERS * TIER;
/** The Sun Gate (Aurora Ring): centre height and diameter; it hangs between the two spires, through their axes. */
const RING_Y = TOP + 4.4;
const RING_D = AXIS * 2;
/** Light ribs round each storey. */
const RIBS = 10;

/** Where the aurora module anchors its effects (local space; tower axes at x = ±AXIS). */
export const AURORA = { axis: AXIS, top: TOP, crown: TOP + 5.2, ringY: RING_Y, ringD: RING_D, poolY: BASE + POOL_BRIDGE * TIER } as const;

/** One finish for both twins: pale aqua glass, warm light ribs, pearl floor plates and gold lotus crowns. */
const LOOK = { glass: 0xbfe9ef, rib: 0xffd59a, plate: 0xf4efe4, crown: 0xffd56b, lawn: 0x8fc46a };

/** A living root buttress from the plaza at (fx, fz) leaning in to the tower at (tx, tz), `h` up. */
function root(b: KitBuilder, fx: number, fz: number, tx: number, tz: number, h: number, girth: number): void {
  const run = Math.hypot(tx - fx, tz - fz);
  const tilt = Math.atan2(run, h);
  const len = Math.hypot(run, h);
  const yaw = Math.atan2(-(tz - fz), tx - fx);
  b.add({ piece: 'trunk', p: [fx, Y, fz], s: [girth, len, girth], r: yaw, rz: -tilt, tint: 0xc8a57c });
  b.add({ piece: 'mossBox', p: [fx, Y, fz], s: [girth * 0.5, len * 0.62, girth * 0.9], r: yaw, rz: -tilt, growAt: 0.15 });
}

/**
 * One twin (both are built alike, mirrored only in where their roots stand): a round glass lobby, a stack of
 * round glass storeys ringed by light ribs that spiral gently upward, round sky-garden lawns cantilevered
 * past the shaft, a helix of solar sun-fins, and a lotus crown round a stepped lantern and a lit spire.
 */
function tower(b: KitBuilder, side: 1 | -1): void {
  const cx = side * AXIS;
  // Lobby: a round glass hall under a round canopy, a lit entrance to the south and sliding doors north.
  b.add({ piece: 'glassCyl', p: [cx, Y, 0], s: [4.8, BASE - Y, 4.8], tint: PALETTE.glassWarm, glow: 0.25 });
  b.add({ piece: 'concreteCyl', p: [cx, BASE - 0.1, 0], s: [5.6, 0.12, 5.6], tint: LOOK.plate });
  b.add({ piece: 'haloRing', p: [cx, BASE - 0.14, 0], s: [5.65, 2, 5.65], tint: LOOK.rib, glow: 0.9 });
  entrance(b, cx, Y, 2.36, 1.1, 0.7, 0xffd27a);
  for (const sx of [-1, 1]) b.add({ piece: 'glassBox', p: [cx + sx * 0.3, Y, -2.4], s: [0.6, 0.7, 0.03], tint: 0xd6f2ee, glow: 0.3, door: sx * 0.95 });
  b.add({ piece: 'slab', p: [cx, Y + 0.72, -2.41], s: [1.4, 0.08, 0.05], tint: TRIM.charcoal });
  // Living roots grip the tower from the plaza on its three outer sides (the canal side stays open).
  for (const [ox, oz] of [
    [side * 3.0, 0],
    [side * 2.3, 2.9],
    [side * 2.3, -2.9],
  ] as const)
    root(b, cx + ox, oz, cx + ox * 0.35, oz * 0.35, 9, 0.85);

  let y = BASE;
  for (let i = 0; i < TIERS; i++) {
    const d = size(i);
    const t = twist(i);
    if (GARDENS.has(i)) {
      // A round lawn cantilevered past the shaft: from afar the gardens read as green bands up the tower.
      const wide = d + 1.5;
      b.add({ piece: 'concreteCyl', p: [cx, y, 0], s: [1.6, TIER, 1.6], tint: LOOK.plate });
      b.add({ piece: 'glassCyl', p: [cx, y, 0], s: [d * 0.55, TIER, d * 0.55], tint: LOOK.glass, glow: 0.3 });
      b.add({ piece: 'concreteCyl', p: [cx, y - 0.12, 0], s: [wide, 0.14, wide], tint: LOOK.plate });
      b.add({ piece: 'concreteCyl', p: [cx, y + 0.02, 0], s: [wide - 0.2, 0.1, wide - 0.2], tint: LOOK.lawn });
      grassTufts(b, cx, y + 0.12, 0, wide * 0.7, wide * 0.7, 24, 0.05);
      for (let k = 0; k < 8; k++) {
        const a = t + (k * TAU) / 8;
        tree(b, cx + Math.cos(a) * wide * 0.38, y + 0.12, -Math.sin(a) * wide * 0.38, 0.42, 0.2 + k * 0.03);
      }
      flowers(b, cx, y + 0.12, 0, wide * 0.42, 20, 0.1, 0.7);
      railRing(b, cx, y + 0.12, 0, wide / 2 - 0.08, 28);
      for (let k = 0; k < 8; k++) {
        const a = t + (k * TAU) / 8;
        ivyEdge(b, cx + Math.sin(a) * wide * 0.5, y - 0.12, Math.cos(a) * wide * 0.5, wide * 0.38, Math.sin(a), Math.cos(a), 3);
      }
    } else b.add({ piece: 'glassCyl', p: [cx, y, 0], s: [d, TIER, d], tint: LOOK.glass, glow: 0.12 });
    // Light ribs round the drum, each storey turned a little further: they spiral up the shaft.
    for (let k = 0; k < RIBS; k++) {
      const a = t + (k * TAU) / RIBS;
      b.add({ piece: 'lumenRib', p: [cx + Math.cos(a) * d * 0.5, y, -Math.sin(a) * d * 0.5], s: [0.09, TIER, 0.09], tint: LOOK.rib, glow: 0.9 });
    }
    y += TIER;
    b.add({ piece: 'concreteCyl', p: [cx, y, 0], s: [d + 0.26, 0.07, d + 0.26], tint: LOOK.plate });
    // A helix of solar sun-fins climbing the outside, every other storey.
    if (i % 2 === 1 && i < TIERS - 2 && !GARDENS.has(i) && !GARDENS.has(i + 1)) {
      const a = i * 0.42;
      const R = d * 0.5 + 0.45;
      b.add({ piece: 'solarLeaf', p: [cx + Math.cos(a) * R, y + 0.02, -Math.sin(a) * R], s: [1.4, 1, 0.9], r: a, rz: 0.3, growAt: 0.1 + i / 80 });
    }
  }

  // Crown: an observation deck with a balustrade round a stepped glass lantern, a gold lotus, a lit spire.
  const top = size(TIERS - 1);
  const deck = top + 1.2;
  b.add({ piece: 'concreteCyl', p: [cx, y, 0], s: [deck, 0.16, deck], tint: LOOK.plate });
  b.add({ piece: 'haloRing', p: [cx, y - 0.04, 0], s: [deck + 0.06, 2, deck + 0.06], tint: LOOK.rib, glow: 1 });
  railRing(b, cx, y + 0.16, 0, deck / 2 - 0.05, 28);
  // A lotus crown: two rings of great petals opening round the lantern.
  for (let ring = 0; ring < 2; ring++)
    for (let k = 0; k < 12; k++)
      b.add({
        piece: 'sunPetal',
        p: [cx, y + 0.16 + ring * 0.2, 0],
        s: [2.4 - ring * 0.8, 1, 1.3 - ring * 0.3],
        r: (k / 12) * TAU + ring * 0.26,
        rz: 0.75 + ring * 0.4,
        tint: LOOK.crown,
        glow: 0.6,
        growAt: 0.2 + ring * 0.15,
      });
  let ly = y + 0.16;
  for (const [dd, h] of [
    [1.7, 1.2],
    [1.25, 1.1],
    [0.85, 1.0],
  ] as const) {
    b.add({ piece: 'glassCyl', p: [cx, ly, 0], s: [dd, h, dd], tint: PALETTE.glassWarm, glow: 0.5 });
    b.add({ piece: 'haloRing', p: [cx, ly + h, 0], s: [dd + 0.25, 2, dd + 0.25], tint: LOOK.crown, glow: 1 });
    ly += h;
  }
  const spire = (from: number, h: number) => {
    b.add({ piece: 'spireCone', p: [cx, from, 0], s: [0.9, h, 0.9], tint: 0xffe7a8, glow: 0.4 });
    for (const [k, dd] of [
      [0.2, 1.8],
      [0.45, 1.25],
      [0.68, 0.8],
    ] as const)
      b.add({ piece: 'haloRing', p: [cx, from + h * k, 0], s: [dd, 2.5, dd], tint: LOOK.crown, glow: 1 });
    b.add({ piece: 'lumenRib', p: [cx, from + h * 0.8, 0], s: [0.08, h * 0.22, 0.08], tint: LOOK.crown, glow: 1 });
  };
  b.upTo(2, () => spire(ly, 8));
  b.level(3, () => {
    b.add({ piece: 'glassCyl', p: [cx, ly, 0], s: [0.6, 1.2, 0.6], tint: 0xfff2c8, glow: 0.8 });
    spire(ly + 1.2, 12);
    for (let k = 0; k < 6; k++)
      b.add({ piece: 'sunPetal', p: [cx, ly + 1.2 + 12 * 0.97, 0], s: [0.7, 1, 0.5], r: (k / 6) * TAU, rz: 1.0, tint: LOOK.crown, glow: 1 });
  });
}

/** Inner faces of the towers at storey k are about this far from the plaza's centre line. */
const gap = (k: number) => AXIS - size(k) / 2;

export default defineBuilding({
  id: 'aurora-gemini',
  name: 'Aurora Gemini',
  description:
    'Twin towers at the island’s heart, mostly sky homes over a few floors of offices. Sol and Luna are identical round glass towers, ringed by spiralling light ribs and sky-garden lawns, and joined by a garden bridge and a sky-pool bridge. The pool spills a waterfall into the canal between them, and the Sun Gate, a golden ring of rays, hangs between their spires. At night their searchlights sweep the sky. Select them for a light show, to stand on the sky deck or for a postcard view.',
  category: 'commercial',
  footprint: [14, 14],
  // Mostly homes: residents at the centre walk to work, where 360 office jobs pulled commuters in from the towns
  // and slowed the showcase's traffic (tests/zoning.test.ts, D-135).
  stats: {
    cost: 12000,
    energy: 40,
    eco: 36,
    happiness: 50,
    population: 600,
    jobs: 240,
    pollution: -6,
    water: -14,
  },
  growthTime: 260,
  pollinators: 3,
  cleanEnergy: true,
  variants: 1,
  landmark: true,
  tower: true,
  retrofit: false,
  recipe(b) {
    // Plaza: pale paving, a lily canal between the towers with sun-basin fountains at its ends, fungus lamps.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [13.8, Y, 13.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, Y, 0], s: [2.2, 0.05, 12.2] });
    lilies(b, 0, Y + 0.05, 0, 1.8, 11, 18);
    for (const sz of [-1, 1]) {
      b.add({ piece: 'concreteCyl', p: [0, Y, sz * 6.25], s: [1.9, 0.3, 1.9], tint: PALETTE.concrete });
      b.add({ piece: 'pool', p: [0, Y + 0.3, sz * 6.25], s: [1.3, 0.04, 1.3] });
      b.add({ piece: 'haloRing', p: [0, Y + 0.9, sz * 6.25], s: [1.5, 3, 1.5], rx: Math.PI / 2, tint: 0xffe8b0, glow: 1 });
    }
    for (const z of [-4.2, 4.2]) footbridge(b, 0, Y + 0.02, z, 2.8, 0.8, true);
    // Corner gardens and the outer walks: trees, planters, benches and lamps.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        b.add({ piece: 'mossBox', p: [sx * 5.6, Y, sz * 5.4], s: [2.4, 0.14, 2.6] });
        grassTufts(b, sx * 5.6, Y + 0.14, sz * 5.4, 2.2, 2.4, 14);
        flowers(b, sx * 5.6, Y + 0.14, sz * 5.4, 0.9, 16, 0, 0.6);
        tree(b, sx * 5.9, Y + 0.14, sz * 5.6, 0.85, 0.1);
        bench(b, sx * 2.4, Y, sz * 4.2, 0.5, true, sx > 0);
        lamp(b, sx * 1.55, Y, sz * 2.8, 0.75);
        lamp(b, sx * 6.6, Y, sz * 3.2, 0.75);
      }
    for (const sx of [-1, 1]) planter(b, sx * 6.4, Y, 0, 0.6, 1.8);
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * 4;
      const sd = Math.floor(t);
      const u = (t - sd) * 12.6 - 6.3;
      const [x, z] = sd === 0 ? [u, -6.75] : sd === 1 ? [6.75, u] : sd === 2 ? [-u, 6.75] : [-6.75, -u];
      b.add({ piece: 'fungus', p: [x, Y, z], s: 0.32, tint: 0xf6efe4, glow: 0.9, growAt: 0.1 });
    }

    tower(b, 1);
    tower(b, -1);

    // Garden bridge: a glazed gallery with a planted roof.
    {
      const y = BASE + GARDEN_BRIDGE * TIER;
      const len = 2 * gap(GARDEN_BRIDGE) + 0.8;
      b.add({ piece: 'slab', p: [0, y - 0.12, 0], s: [len, 0.14, 2.1], tint: LOOK.plate });
      b.add({ piece: 'glassBox', p: [0, y, 0], s: [len - 0.2, 1.0, 1.9], tint: PALETTE.glassWarm, glow: 0.3 });
      b.add({ piece: 'mossBox', p: [0, y + 1.0, 0], s: [len, 0.12, 2.1], growAt: 0.05 });
      for (const x of [-0.8, 0.8]) tree(b, x, y + 1.12, 0, 0.42, 0.25);
      flowers(b, 0, y + 1.12, 0, 0.8, 14, 0.2, 0.8);
      for (const z of [-1.05, 1.05]) b.add({ piece: 'lumenRib', p: [-len / 2, y - 0.14, z], s: [0.05, len, 0.05], rz: -Math.PI / 2, tint: 0xfff1d0, glow: 1 });
    }
    // Sky-pool bridge: an infinity pool between the towers, its north edge pouring a waterfall into the canal.
    {
      const y = AURORA.poolY;
      const len = 2 * gap(POOL_BRIDGE) + 0.8;
      b.add({ piece: 'slab', p: [0, y - 0.3, 0], s: [len, 0.3, 2.7], tint: LOOK.plate });
      b.add({ piece: 'pool', p: [0, y, 0.1], s: [len - 0.6, 0.06, 2.1] });
      for (const z of [-1.3, 1.3]) railing(b, -len / 2 + 0.3, y, z, len - 0.6);
      for (const z of [-1.35, 1.35]) b.add({ piece: 'lumenRib', p: [-len / 2, y - 0.32, z], s: [0.05, len, 0.05], rz: -Math.PI / 2, tint: 0x9ff7ee, glow: 1 });
      b.add({ piece: 'waterfall', p: [0, Y + 0.05, -1.36], s: [1.4, y - 0.3 - Y - 0.05, 1], r: Math.PI, glow: 0.7 });
      for (const x of [-0.7, 0.7]) bench(b, x, y, 1.1, 0.42);
    }
    // The Sun Gate: three rings of the Aurora Ring hung between the spires, crowned by a sunburst of golden petals
    // over its upper arc and silver ones under it (the dawn over the twins).
    for (const [d, tint] of [
      [RING_D, 0xfff1d0],
      [RING_D - 0.5, 0xffd56b],
      [RING_D - 1.0, 0xbff8ff],
    ] as const)
      b.add({ piece: 'haloRing', p: [0, RING_Y, 0], s: [d, 9, d], rx: Math.PI / 2, tint, glow: 1 });
    // Rays are light ribs (round, so they read from any side), turned from +y to point out along angle a.
    const ray = (a: number, r: number, len: number, w: number, tint: number) =>
      b.add({ piece: 'lumenRib', p: [Math.cos(a) * r, RING_Y + Math.sin(a) * r, 0], s: [w, len, w], rz: a - Math.PI / 2, tint, glow: 1 });
    for (let k = 0; k <= 12; k++) ray(0.2 + (k / 12) * (Math.PI - 0.4), RING_D / 2 + 0.15, k % 2 ? 1.3 : 2.3, k % 2 ? 0.1 : 0.16, 0xffd56b);
    // Silver rays point inward from the lower arc, and a small gold sun hangs at the ring's heart.
    for (let k = 1; k < 8; k++) ray(Math.PI + 0.3 + (k / 8) * (Math.PI - 0.6), RING_D / 2 - 0.55, 0.9, 0.08, 0xd8f4ff);
    b.add({ piece: 'haloRing', p: [0, RING_Y, 0], s: [1.1, 9, 1.1], rx: Math.PI / 2, tint: 0xffd56b, glow: 1 });
    b.add({ piece: 'haloRing', p: [0, RING_Y, 0], s: [0.6, 9, 0.6], rx: Math.PI / 2, tint: 0xfff6dc, glow: 1 });

    // Level 2: a slender light bridge high between the towers, and solar petals blooming round the garden bridge.
    b.level(2, () => {
      const y = BASE + LIGHT_BRIDGE * TIER;
      const len = 2 * gap(LIGHT_BRIDGE) + 0.6;
      b.add({ piece: 'slab', p: [0, y - 0.1, 0], s: [len, 0.1, 0.9], tint: 0xf4f6f2 });
      for (const z of [-0.45, 0.45]) b.add({ piece: 'lumenRib', p: [-len / 2, y + 0.25, z], s: [0.05, len, 0.05], rz: -Math.PI / 2, tint: 0xffd59a, glow: 1 });
      b.add({ piece: 'haloRing', p: [0, y + 0.4, 0], s: [2.2, 3, 2.2], rx: Math.PI / 2, rz: Math.PI / 2, tint: 0xffe08a, glow: 1 });
      const gy = BASE + GARDEN_BRIDGE * TIER + 0.5;
      for (const sz of [-1, 1])
        for (let k = 0; k < 4; k++) b.add({ piece: 'solarLeaf', p: [-1.2 + k * 0.8, gy, sz * 1.15], s: [1.1, 1, 0.8], r: sz > 0 ? -Math.PI / 2 : Math.PI / 2, rz: 0.5 });
      for (const sx of [-1, 1])
        for (const i of GARDENS) {
          const s = size(i) / 2 + 0.13;
          b.add({ piece: 'ivy', p: [sx * AXIS, BASE + (i + 1) * TIER, s], s: [1.6, 2.4, 1], tint: PALETTE.leaves[i % 5], glow: 0.2 });
          b.add({ piece: 'ivy', p: [sx * AXIS, BASE + (i + 1) * TIER, -s], s: [1.6, 2.4, 1], r: Math.PI, tint: PALETTE.leaves[(i + 2) % 5], glow: 0.2 });
        }
    });
    // Level 3: a second Aurora Ring crosses the first like a gyroscope, the crowns soar (in `tower`), and golden
    // petals open round the ring's foot.
    b.level(3, () => {
      b.add({ piece: 'haloRing', p: [0, RING_Y, 0], s: [RING_D * 0.72, 9, RING_D * 0.72], rx: Math.PI / 2, rz: Math.PI / 2, tint: 0xbff8ff, glow: 1 });
      for (let k = 0; k < 8; k++) b.add({ piece: 'sunPetal', p: [0, RING_Y - RING_D / 2 - 0.1, 0], s: [0.9, 1, 0.6], r: (k / 8) * TAU, rz: 1.1, tint: 0xffd56b, glow: 1 });
    });
  },
});
