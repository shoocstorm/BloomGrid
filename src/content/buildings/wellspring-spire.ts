import { defineBuilding, type KitBuilder } from '../types';
import { PALETTE, flowers, grassTufts, ivyEdge, tree } from '../kit';

const TAU = Math.PI * 2;
const TIER = 1.28; // four glass floors
const TIERS = 20;
const BASE = 1.9;
const PARK_TIER = 7;
const GARDEN_TIERS = new Set([3, 12, 16]);

/** Tier width: a tapering shaft with a slight belly, so the silhouette reads from across the island. */
const tierSize = (i: number) => 5.6 - 2.9 * (i / TIERS) + 0.5 * Math.sin((Math.PI * i) / TIERS);

/** A root buttress from the plaza at (fx, fz) leaning in to the shaft at radius `rTop`, height `h`. */
function root(b: KitBuilder, fx: number, fz: number, rTop: number, h: number, girth: number): void {
  const rf = Math.hypot(fx, fz);
  const tilt = Math.atan2(rf - rTop, h);
  const len = Math.hypot(rf - rTop, h);
  // Yaw so the piece's +x tilt (rz) leans toward the centre.
  const yaw = Math.atan2(-fz, fx);
  b.add({ piece: 'trunk', p: [fx, 0.1, fz], s: [girth, len, girth], r: yaw, rz: tilt, tint: 0xc8a57c });
  b.add({
    piece: 'mossBox',
    p: [fx, 0.1, fz],
    s: [girth * 0.55, len * 0.6, girth * 0.95],
    r: yaw,
    rz: tilt,
    growAt: 0.15,
  });
}

export default defineBuilding({
  id: 'wellspring-spire',
  name: 'Wellspring Spire',
  description:
    'The island’s heart, rising where the river is born: a twisting arcology of research labs and sky-gardens on living root buttresses, a cantilevered sky-park whose rim pours four waterfalls into the moat, a solar halo, and a beacon spire seen from every shore.',
  category: 'commercial',
  footprint: [14, 14],
  stats: {
    cost: 9000,
    energy: 60,
    eco: 40,
    happiness: 40,
    population: 0,
    jobs: 320,
    pollution: -6,
    water: -16,
  },
  growthTime: 240,
  pollinators: 3,
  cleanEnergy: true,
  variants: 1,
  recipe(b) {
    // Plaza: paving, a square moat, corner gardens and fungus lamps along the edge.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [13.8, 0.16, 13.8], tint: PALETTE.concrete });
    const Y = 0.16;
    for (const sx of [-1, 1]) b.add({ piece: 'pool', p: [sx * 5.2, Y, 0], s: [1.2, 0.05, 10.4] });
    for (const sz of [-1, 1]) b.add({ piece: 'pool', p: [0, Y, sz * 5.2], s: [9.2, 0.05, 1.2] });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        b.add({ piece: 'mossBox', p: [sx * 6.3, Y, sz * 6.3], s: [1.4, 0.14, 1.4] });
        grassTufts(b, sx * 6.3, Y + 0.14, sz * 6.3, 1.3, 1.3, 14);
        flowers(b, sx * 6.3, Y + 0.14, sz * 6.3, 0.6, 16, 0, 0.6);
        tree(b, sx * 6.3, Y + 0.14, sz * 6.3, 0.8, 0.1);
      }
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * 4;
      const side = Math.floor(t);
      const u = (t - side) * 12.4 - 6.2;
      const [x, z] = side === 0 ? [u, -6.6] : side === 1 ? [6.6, u] : side === 2 ? [-u, 6.6] : [-6.6, -u];
      b.add({ piece: 'fungus', p: [x, Y, z], s: 0.35, tint: 0xf6efe4, glow: 0.9, growAt: 0.1 });
    }

    // Root buttresses: four great corner roots and four lesser ones, gripping the shaft.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      root(b, Math.cos(a) * 5.2, Math.sin(a) * 5.2, 2.6, 9.5, 1.2);
      root(b, Math.cos(a + Math.PI / 4) * 3.8, Math.sin(a + Math.PI / 4) * 3.8, 2.7, 5.5, 0.75);
    }

    // Lobby atrium.
    b.add({ piece: 'glassCyl', p: [0, Y, 0], s: [6.0, BASE - Y, 6.0], tint: PALETTE.glassWarm, glow: 0.15 });
    b.add({ piece: 'concreteCyl', p: [0, BASE - 0.12, 0], s: [6.4, 0.12, 6.4], tint: PALETTE.concrete });

    // Twisting shaft: glass tiers with floor plates, light ribs on the corners and sky-gardens.
    b.add({ piece: 'concreteCyl', p: [0, BASE, 0], s: [2.0, TIERS * TIER, 2.0], tint: PALETTE.concrete });
    let y = BASE;
    for (let i = 0; i < TIERS; i++) {
      const size = tierSize(i);
      const yaw = i * 0.078;
      if (GARDEN_TIERS.has(i)) {
        // Open sky-garden: planted terrace around the core, ivy spilling over the plate below.
        b.add({ piece: 'mossBox', p: [0, y, 0], s: [size * 0.92, 0.1, size * 0.92], r: yaw, growAt: 0.05 });
        for (let k = 0; k < 4; k++) {
          const a = yaw + (k / 4) * TAU + Math.PI / 4;
          tree(b, Math.cos(a) * size * 0.3, y + 0.1, Math.sin(a) * size * 0.3, 0.55, 0.2 + k * 0.05);
        }
        flowers(b, 0, y + 0.1, 0, size * 0.42, 18, 0.1, 0.7);
      } else {
        b.add({
          piece: 'glassBox',
          p: [0, y, 0],
          s: [size, TIER, size],
          r: yaw,
          tint: PALETTE.glass,
          glow: 0.08,
        });
      }
      for (let k = 0; k < 4; k++) {
        const a = -yaw + (k / 4) * TAU + Math.PI / 4;
        const rr = size * Math.SQRT1_2;
        b.add({
          piece: 'lumenRib',
          p: [Math.cos(a) * rr, y, Math.sin(a) * rr],
          s: [0.12, TIER, 0.12],
          glow: 0.9,
        });
      }
      y += TIER;
      b.add({
        piece: 'slab',
        p: [0, y, 0],
        s: [size + 0.3, 0.07, size + 0.3],
        r: yaw,
        tint: PALETTE.concrete,
      });
      if (GARDEN_TIERS.has(i - 1))
        for (let k = 0; k < 4; k++) {
          const a = yaw + (k / 4) * TAU;
          ivyEdge(
            b,
            Math.sin(a) * (size + 0.3) * 0.5,
            y,
            Math.cos(a) * (size + 0.3) * 0.5,
            size,
            Math.sin(a),
            Math.cos(a),
            4,
          );
        }

      if (i === PARK_TIER) {
        // Cantilevered sky-park disc; its rim pours four waterfalls into the moat below.
        const py = y + 0.07;
        b.add({ piece: 'concreteCyl', p: [0, py - 0.4, 0], s: [11.6, 0.4, 11.6], tint: PALETTE.concrete });
        b.add({ piece: 'lumenRib', p: [0, py - 0.46, 0], s: [11.7, 0.08, 11.7], glow: 0.7 });
        b.add({ piece: 'mossBox', p: [0, py, 0], s: [7.4, 0.08, 7.4], r: Math.PI / 4, growAt: 0.02 });
        grassTufts(b, 0, py + 0.08, 0, 6.6, 6.6, 120, 0.05);
        flowers(b, 0, py + 0.08, 0, 4.4, 90, 0.1, 0.8);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + 0.2;
          tree(b, Math.cos(a) * 4.6, py, Math.sin(a) * 4.6, b.range(0.6, 0.85), 0.15 + (k % 3) * 0.1);
        }
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          ivyEdge(b, Math.sin(a) * 5.75, py - 0.4, Math.cos(a) * 5.75, 1.6, Math.sin(a), Math.cos(a), 2);
        }
        for (let k = 0; k < 4; k++) {
          const r = (k / 4) * TAU;
          b.add({
            piece: 'waterfall',
            p: [Math.sin(r) * 5.7, Y + 0.05, Math.cos(r) * 5.7],
            s: [1.4, py - 0.4 - Y - 0.05, 1],
            r,
            glow: 0.6,
          });
        }
        // Pods berthed on the rim (diagonals, clear of the waterfalls).
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4;
          b.add({
            piece: 'pod',
            p: [Math.cos(a) * 5.1, py, Math.sin(a) * 5.1],
            s: [1.1, 1.1, 1.1],
            r: -a,
            glow: 0.8,
          });
        }
        y += 0.1;
      }
    }

    // Solar halo: a floating ring of petals around the upper shaft, held by four spokes.
    const hy = BASE + 16.5 * TIER;
    b.add({ piece: 'haloRing', p: [0, hy, 0], s: [13, 13, 13], glow: 1 });
    b.add({ piece: 'haloRing', p: [0, hy + 0.9, 0], s: [10, 7, 10], glow: 0.8 });
    for (let k = 0; k < 4; k++)
      b.add({
        piece: 'slab',
        p: [0, hy + 0.35, 0],
        s: [13, 0.12, 0.2],
        r: (k / 4) * Math.PI + Math.PI / 8,
        tint: PALETTE.concrete,
      });
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * TAU;
      b.add({
        piece: 'solarLeaf',
        p: [Math.cos(a) * 6.4, hy + 0.1, -Math.sin(a) * 6.4],
        s: [2.2, 1, 1.7],
        r: a,
        rz: 0.32,
        growAt: 0.1 + (k / 28) * 0.4,
      });
    }

    // Crown: a blooming ring of petals, a stepped glass lantern, a spire with light rings and a beacon.
    const top = y;
    b.add({ piece: 'concreteCyl', p: [0, top, 0], s: [3.4, 0.18, 3.4], tint: 0xffe08a, glow: 0.5 });
    for (let ring = 0; ring < 2; ring++)
      for (let k = 0; k < 14; k++)
        b.add({
          piece: 'solarLeaf',
          p: [0, top + 0.12 + ring * 0.12, 0],
          s: [3.6 - ring * 1.0, 1, 1.6 - ring * 0.3],
          r: (k / 14) * TAU + ring * 0.22,
          rz: 0.55 + ring * 0.35,
          growAt: 0.2 + ring * 0.2,
        });
    let ly = top + 0.18;
    for (const [d, h] of [
      [2.6, 1.2],
      [2.0, 1.1],
      [1.4, 1.0],
    ] as const) {
      b.add({ piece: 'glassCyl', p: [0, ly, 0], s: [d, h, d], tint: PALETTE.glassWarm, glow: 0.4 });
      ly += h;
    }
    b.add({ piece: 'spireCone', p: [0, ly, 0], s: [1.4, 10.5, 1.4], tint: PALETTE.glassWarm, glow: 0.3 });
    for (const [k, d] of [
      [0.15, 3.2],
      [0.4, 2.3],
      [0.62, 1.5],
    ] as const)
      b.add({ piece: 'haloRing', p: [0, ly + 10.5 * k, 0], s: [d, 3, d], glow: 1 });
    b.add({ piece: 'lumenRib', p: [0, ly + 8.3, 0], s: [0.1, 3.4, 0.1], glow: 1 });
  },
});
