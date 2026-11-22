import { defineBuilding } from '../types';
import type { KitBuilder } from '../types';
import { PALETTE, TRIM, awning, barrel, beam, bench, crate, door, flowers, gableRoof, lamp, planter, railing, solarArray } from '../kit';

/**
 * A corner coffee shop and micro-roastery: a timber café with a gabled roof, a copper roaster chimney up its side
 * and a big coffee-cup sign swinging from a post over the terrace. Bistro tables under string lights spill onto the
 * pavement beside a planter of coffee shrubs heavy with red cherries. Level 2 adds a roasting loft with a seating
 * balcony; level 3 swaps the loft's gable for a rooftop café under a pergola, with the cup sign moved up there,
 * bigger and lit. Recipe space: x, z ∈ [-1, 1], street on +z.
 */

const COPPER = 0xc07a4a;
const AWNINGS = [TRIM.red, TRIM.teal, 0x6f4a32] as const;
const CUPS = [0xfff4f0, 0xf3d9a8, 0x9ee6ff] as const;

const BX = -0.25;
const BZ = -0.4;
const BW = 1.4;
const BD = 1.0;
const FRONT = BZ + BD / 2;
const G = 0.06;
const H1 = 0.46;
const LOFT = 0.4;

/** A bistro table with two chairs. */
function bistro(b: KitBuilder, x: number, y: number, z: number): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.015, 0.14, 0.015], tint: TRIM.charcoal });
  b.add({ piece: 'concreteCyl', p: [x, y + 0.14, z], s: [0.14, 0.012, 0.14], tint: 0xf3ead8 });
  b.add({ piece: 'concreteCyl', p: [x + 0.02, y + 0.152, z], s: [0.03, 0.03, 0.03], tint: 0xfff4f0 });
  for (const sx of [-1, 1]) {
    b.add({ piece: 'slab', p: [x + sx * 0.12, y, z], s: [0.07, 0.08, 0.07], tint: PALETTE.timber });
    b.add({ piece: 'slab', p: [x + sx * 0.15, y + 0.08, z], s: [0.015, 0.08, 0.07], tint: PALETTE.timber });
  }
}

/** A coffee-cup sign: cup, saucer, handle and a wisp of steam; `s` scales it. */
function cup(b: KitBuilder, x: number, y: number, z: number, s: number, tint: number, glow: number): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.3 * s, 0.03 * s, 0.3 * s], tint });
  b.add({ piece: 'concreteCyl', p: [x, y + 0.03 * s, z], s: [0.18 * s, 0.17 * s, 0.18 * s], tint, glow });
  b.add({ piece: 'concreteCyl', p: [x, y + 0.195 * s, z], s: [0.16 * s, 0.01 * s, 0.16 * s], tint: 0x5a3a24 });
  b.add({ piece: 'willowArch', p: [x + 0.09 * s, y + 0.07 * s, z], s: [0.1 * s, 0.1 * s, 0.2 * s], rz: -Math.PI / 2, tint });
  for (let k = 0; k < 3; k++)
    b.add({ piece: 'lumenRib', p: [x + Math.sin(k * 1.7) * 0.03 * s, y + (0.24 + k * 0.08) * s, z], s: [0.03 * s, 0.06 * s, 0.03 * s], tint: 0xfff1e6, glow: 0.45 });
}

/** String lights between two points, sagging in the middle. */
function stringLights(b: KitBuilder, x0: number, z0: number, x1: number, z1: number, y: number, n: number): void {
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    b.add({ piece: 'lumenRib', p: [x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.06, z0 + (z1 - z0) * t], s: [0.03, 0.03, 0.03], tint: k % 2 ? 0xffd9a0 : 0xffe08a, glow: 1 });
  }
}

/** The copper roaster flue up the café's east side, from the ground to y, with a cowl and a band. */
function chimney(b: KitBuilder, y: number): void {
  const x = BX + BW / 2 + 0.1;
  const z = BZ - 0.2;
  b.add({ piece: 'concreteCyl', p: [x, G, z], s: [0.14, y - G, 0.14], tint: COPPER });
  for (const k of [0.3, 0.65]) b.add({ piece: 'concreteCyl', p: [x, G + (y - G) * k, z], s: [0.16, 0.02, 0.16], tint: 0x8a5232 });
  b.add({ piece: 'spireCone', p: [x, y + 0.06, z], s: [0.24, 0.1, 0.24], tint: COPPER });
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.04, 0.06, 0.04], tint: 0x8a5232 });
}

export default defineBuilding({
  id: 'copperleaf-coffee',
  name: 'Copperleaf Coffee',
  description:
    'A corner coffee shop that roasts its own island-grown beans. A copper flue breathes out the smell of the morning roast, and the terrace under the string lights is where half the street starts its day.',
  category: 'commercial',
  footprint: [2, 2],
  stats: { cost: 180, energy: -3, eco: 2, happiness: 5, population: 0, jobs: 10, pollution: 0, water: -2 },
  growthTime: 60,
  recipe(b) {
    const awn = b.pick(AWNINGS);
    const cupTint = b.pick(CUPS);
    const roofY = G + H1;
    b.add({ piece: 'slab', p: [0, 0, 0], s: [1.95, G, 1.95], tint: 0xe4dac8 });
    // Terrace decking in front and to the east of the café.
    b.add({ piece: 'timberBox', p: [0, G, 0.48], s: [1.9, 0.02, 0.9], tint: 0xc8a57c });

    // The café: timber walls, a big glazed front with a counter window, cream trims.
    b.add({ piece: 'timberBox', p: [BX, G, BZ], s: [BW, H1, BD], tint: PALETTE.timber });
    b.add({ piece: 'glassBox', p: [BX - 0.2, G + 0.06, FRONT + 0.005], s: [0.8, H1 - 0.12, 0.03], tint: PALETTE.glassWarm, glow: 0.65 });
    for (let i = 0; i <= 4; i++) b.add({ piece: 'timberBox', p: [BX - 0.6 + i * 0.2, G, FRONT + 0.02], s: [0.025, H1, 0.025], tint: 0x6b4a32 });
    b.add({ piece: 'timberBox', p: [BX - 0.2, G + 0.17, FRONT + 0.06], s: [0.82, 0.03, 0.1], tint: 0x6b4a32 });
    door(b, BX + 0.48, G, FRONT + 0.005, 0.2, 0.3);
    awning(b, BX - 0.2, G + H1 - 0.05, FRONT + 0.14, 0.9, 0.28, 0xf5efe4, awn, 7);
    // Chalkboard menu and the lit name strip under the eaves.
    b.add({ piece: 'slab', p: [BX + 0.48, G + 0.34, FRONT + 0.02], s: [0.22, 0.1, 0.01], tint: 0x2f3a34 });
    b.add({ piece: 'slab', p: [BX - 0.2, roofY - 0.06, FRONT + 0.025], s: [0.7, 0.05, 0.01], tint: 0xffd59a, glow: 0.95, sign: 'name' });
    b.upTo(1, () => {
      gableRoof(b, BX, roofY, BZ, BW, BD, { pitch: 0.55, tint: 0x8a4f3a, ends: TRIM.cream, overhang: 0.1 });
      solarArray(b, BX, roofY + 0.02, BZ - 0.28, BW * 0.7, 0.3, 1, 3, 0.5);
    });
    b.upTo(1, () => chimney(b, roofY + 0.35));

    // Terrace: bistro tables, string lights from the façade to a post, the swinging cup sign.
    for (const [x, z] of [
      [-0.7, 0.35],
      [-0.2, 0.62],
      [0.35, 0.3],
      [0.6, -0.2],
    ] as const)
      bistro(b, x, G + 0.02, z);
    const px = 0.85;
    const pz = 0.85;
    b.add({ piece: 'timberBox', p: [px, G, pz], s: [0.05, 0.9, 0.05], tint: 0x4a3426 });
    b.add({ piece: 'timberBox', p: [px - 0.16, G + 0.86, pz], s: [0.36, 0.035, 0.035], tint: 0x4a3426 });
    beam(b, 'timberBox', [px - 0.3, G + 0.86, pz], [px - 0.3, G + 0.7, pz], 0.012, { tint: TRIM.charcoal });
    cup(b, px - 0.3, G + 0.52, pz, 0.9, cupTint, 0.25);
    stringLights(b, BX - 0.8, FRONT + 0.05, px, pz, G + 0.78, 8);
    stringLights(b, BX + BW / 2, FRONT + 0.05, px, pz, G + 0.78, 5);

    // A planter of coffee shrubs with red cherries, sacks and a barrel by the door, a bench and a lamp.
    planter(b, -0.72, G + 0.02, 0.88, 0.48, 0.16, 0.1);
    for (let i = 0; i < 6; i++)
      b.add({ piece: 'flower', p: [-0.9 + i * 0.07, G + 0.2, 0.88 + (i % 2 ? 0.03 : -0.03)], s: 0.045, tint: 0xc8323a, growAt: 0.4 + i * 0.05 });
    crate(b, BX + 0.72, G + 0.02, FRONT + 0.12, 0.14, 0.3, 0xd9c49a);
    barrel(b, BX + 0.75, G + 0.02, FRONT + 0.32, 0.1);
    bench(b, 0.75, G + 0.02, -0.75, 0.42, true, true);
    lamp(b, -0.92, G, -0.1, 0.55);

    // Level 2: a roasting loft over the café: a timber storey with tall windows, a balcony with two tables over
    // the awning and the gable lifted on top; the flue grows with it.
    const loftY = roofY + LOFT;
    b.level(2, () => {
      b.add({ piece: 'timberBox', p: [BX, roofY, BZ - 0.1], s: [BW, LOFT, BD - 0.2], tint: 0xa47c56 });
      b.add({ piece: 'timberBox', p: [BX, roofY, BZ], s: [BW + 0.04, 0.03, BD + 0.04], tint: 0x6b4a32 });
      for (let i = 0; i < 3; i++)
        b.add({ piece: 'glassBox', p: [BX - 0.45 + i * 0.45, roofY + 0.06, FRONT - 0.19], s: [0.3, LOFT - 0.12, 0.02], tint: PALETTE.glassWarm, glow: 0.6 });
      b.add({ piece: 'timberBox', p: [BX, roofY, FRONT - 0.04], s: [BW, 0.03, 0.32], tint: 0xc8a57c });
      railing(b, BX, roofY + 0.03, FRONT + 0.1, BW - 0.05);
      bistro(b, BX - 0.35, roofY + 0.03, FRONT - 0.02);
      bistro(b, BX + 0.35, roofY + 0.03, FRONT - 0.02);
      b.upTo(2, () => {
        chimney(b, loftY + 0.35);
        gableRoof(b, BX, loftY, BZ - 0.1, BW, BD - 0.2, { pitch: 0.55, tint: 0x8a4f3a, ends: TRIM.cream, overhang: 0.1 });
        solarArray(b, BX, loftY + 0.02, BZ - 0.33, BW * 0.7, 0.26, 1, 3, 0.5);
      });
    });

    // Level 3: the loft roof becomes a rooftop café: decking, a timber pergola with string lights and climbing
    // flowers, coffee planters, and the cup sign moved up to the roof edge, bigger and lit.
    b.level(3, () => {
      const y = loftY;
      b.add({ piece: 'timberBox', p: [BX, y, BZ - 0.1], s: [BW, 0.03, BD - 0.2], tint: 0xc8a57c });
      railing(b, BX, y + 0.03, FRONT - 0.21, BW - 0.05);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) b.add({ piece: 'timberBox', p: [BX + sx * 0.6, y + 0.03, BZ - 0.1 + sz * 0.3], s: [0.04, 0.36, 0.04], tint: 0x6b4a32 });
      for (let i = 0; i < 6; i++) b.add({ piece: 'timberBox', p: [BX - 0.6 + i * 0.24, y + 0.39, BZ - 0.1], s: [0.03, 0.03, 0.7], tint: 0x6b4a32 });
      stringLights(b, BX - 0.6, BZ + 0.2, BX + 0.6, BZ + 0.2, y + 0.38, 7);
      stringLights(b, BX - 0.6, BZ - 0.4, BX + 0.6, BZ - 0.4, y + 0.38, 7);
      flowers(b, BX - 0.6, y + 0.03, BZ - 0.1, 0.12, 5, 0.2, 0.6);
      flowers(b, BX + 0.6, y + 0.03, BZ - 0.1, 0.12, 5, 0.2, 0.6);
      bistro(b, BX - 0.25, y + 0.03, BZ - 0.1);
      bistro(b, BX + 0.25, y + 0.03, BZ - 0.1);
      planter(b, BX, y + 0.03, BZ - 0.48, 0.9, 0.12, 0.2);
      cup(b, BX - 0.55, y + 0.42, FRONT - 0.3, 1.6, cupTint, 0.6);
      chimney(b, y + 0.55);
    });
  },
});
