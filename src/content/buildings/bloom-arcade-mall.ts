import { defineBuilding } from '../types';
import type { KitBuilder, Vec3 } from '../types';
import { PALETTE, TRIM, awning, beam, bench, entrance, flowers, grassTufts, ivyEdge, lamp, planter, railing, solarArray, tree } from '../kit';

/**
 * The island's shopping mall: two retail wings either side of a glass-vaulted galleria that runs from the street
 * to a domed garden rotunda at the back. Shopfronts open both onto the galleria and the street, each under its own
 * awning and lit sign; the wing roofs are meadows with solar panels. Level 2 adds a third retail storey and a
 * food-court terrace under parasols; level 3 a cinema sky box with marquee bulbs, a glass sky-bridge across the
 * vault and a lit spire over the rotunda. Recipe space: x ∈ [-3, 3], z ∈ [-2.5, 2.5], street on +z.
 */

const SHOP_SIGNS = [0xff9ec2, 0x7ff7e6, 0xffe08a, 0xc9b6ff, 0xffb37a, 0x9ee6ff] as const;
const AWNINGS = [TRIM.teal, TRIM.terracotta, 0xe0459a, TRIM.seaBlue, TRIM.orange, 0x6f9a3a] as const;
const PARASOLS = [0xff9ec2, 0xffe08a, 0x7fd6c8, 0xf5efe4] as const;

/** Galleria: inner wing faces at x = ±GX, vault springing on the wing roofs. */
const GX = 0.9;
const WING_Z0 = -2.3;
const WING_Z1 = 1.3;
const STOREY = 0.52;
/** Vault runs from just in front of the rotunda to the portal. */
const VAULT_Z0 = -1.35;
const VAULT_Z1 = 1.6;
const ROT_Z = -1.75;
const ROT_R = 0.95;

/** A glass barrel vault over the galleria along z, springing at height y from x = ±r. */
function vault(b: KitBuilder, y: number, r: number, z0: number, z1: number, segs: number, ribs: number): void {
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const at = (k: number): [number, number] => {
    const a = Math.PI - (k / segs) * Math.PI;
    return [Math.cos(a) * r, y + Math.sin(a) * r];
  };
  for (let k = 0; k < segs; k++) {
    const [x0, y0] = at(k);
    const [x1, y1] = at(k + 1);
    const seg = Math.hypot(x1 - x0, y1 - y0);
    // Rz tilts +y toward -x: point the panel's height along the arc chord.
    b.add({ piece: 'glassBox', p: [x0, y0, zc], s: [0.025, seg * 1.02, len], rz: Math.atan2(-(x1 - x0), y1 - y0), tint: 0xdff3f4, glow: 0.25 });
  }
  // Lit arch ribs across the vault, and a ridge light along its crown.
  for (let i = 0; i <= ribs; i++) {
    const z = z0 + (len * i) / ribs;
    for (let k = 0; k < segs; k++) {
      const [x0, y0] = at(k);
      const [x1, y1] = at(k + 1);
      beam(b, 'lumenRib', [x0, y0 + 0.01, z], [x1, y1 + 0.01, z], 0.035, { tint: i === ribs ? 0xffe08a : 0xf3ead8, glow: i === ribs ? 1 : 0.35 });
    }
  }
  b.add({ piece: 'lumenRib', p: [0, y + r + 0.01, z0], s: [0.04, len, 0.04], rx: Math.PI / 2, tint: PALETTE.glowCyan, glow: 0.6 });
}

/** One retail storey of a wing (x from x0 to x1) at height y: walls, glazed shopfronts both sides, a cream band. */
function wingStorey(b: KitBuilder, x0: number, x1: number, y: number, h: number, inset = 0): void {
  const w = Math.abs(x1 - x0) - inset * 2;
  const xc = (x0 + x1) / 2;
  const d = WING_Z1 - WING_Z0 - inset * 2;
  const zc = (WING_Z0 + WING_Z1) / 2;
  const inner = Math.sign(xc) * (GX + inset);
  b.add({ piece: 'slab', p: [xc, y, zc], s: [w, h, d], tint: PALETTE.concrete });
  // Galleria-side shopfronts: glass bays split by cream mullions.
  b.add({ piece: 'glassBox', p: [inner - Math.sign(inner) * 0.02, y + 0.04, zc], s: [0.05, h - 0.12, d - 0.2], tint: PALETTE.glassWarm, glow: 0.55 });
  for (let i = 0; i <= 5; i++) b.add({ piece: 'slab', p: [inner - Math.sign(inner) * 0.04, y, WING_Z0 + inset + 0.1 + ((d - 0.2) * i) / 5], s: [0.05, h, 0.04], tint: TRIM.cream });
  // Ribbon windows on the outer side and the back, so no face is a blank wall.
  const outer = Math.sign(xc) * (2.9 - inset);
  b.add({ piece: 'glassBox', p: [outer + Math.sign(xc) * 0.01, y + 0.14, zc], s: [0.04, h * 0.45, d - 0.4], tint: PALETTE.glassWarm, glow: 0.4 });
  b.add({ piece: 'glassBox', p: [xc, y + 0.14, WING_Z0 + inset - 0.01], s: [w - 0.3, h * 0.45, 0.04], tint: PALETTE.glassWarm, glow: 0.4 });
  // Street-side glazing and the floor band.
  b.add({ piece: 'glassBox', p: [xc, y + 0.04, WING_Z1 - inset + 0.01], s: [w - 0.2, h - 0.12, 0.05], tint: PALETTE.glassWarm, glow: 0.5 });
  b.add({ piece: 'slab', p: [xc, y + h - 0.05, zc], s: [w + 0.06, 0.06, d + 0.06], tint: TRIM.cream });
}

/** A wing roof meadow with solar panels (centred on the wing, not the lot like `roofMeadow`). */
function wingRoof(b: KitBuilder, xc: number, y: number, w: number, d: number, trees: number): void {
  const zc = (WING_Z0 + WING_Z1) / 2;
  b.add({ piece: 'mossBox', p: [xc, y, zc], s: [w, 0.05, d] });
  grassTufts(b, xc, y + 0.05, zc + d * 0.2, w * 0.85, d * 0.4, 14, 0.05);
  flowers(b, xc, y + 0.05, zc + d * 0.25, Math.min(w, d) * 0.4, 14, 0.15, 0.8);
  solarArray(b, xc, y + 0.06, zc - d * 0.25, w * 0.8, d * 0.35, 2, 3, 0.4);
  for (let i = 0; i < trees; i++) tree(b, xc + b.range(-w / 3, w / 3), y + 0.05, zc + d * 0.28 + b.range(-0.2, 0.2), b.range(0.3, 0.42), 0.3 + i * 0.1);
  ivyEdge(b, xc, y, WING_Z1 + 0.01, w * 0.9, 0, 1, 7);
}

/** A café parasol: pole, a shallow canopy and a table under it. */
function parasol(b: KitBuilder, x: number, y: number, z: number, tint: number): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.22, 0.12, 0.22], tint: PALETTE.timber });
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [0.025, 0.42, 0.025], tint: TRIM.charcoal });
  b.add({ piece: 'spireCone', p: [x, y + 0.36, z], s: [0.55, 0.1, 0.55], tint });
  b.add({ piece: 'concreteCyl', p: [x, y + 0.34, z], s: [0.56, 0.02, 0.56], tint });
}

export default defineBuilding({
  id: 'bloom-arcade-mall',
  name: 'Bloom Arcade Mall',
  description:
    'A shopping mall grown round a glass-vaulted galleria. Two terraces of shops face the arcade and the street, the vault opens onto a domed garden rotunda, and the roofs are meadows that pay the lights.',
  category: 'commercial',
  footprint: [6, 5],
  stats: { cost: 2200, energy: -16, eco: 4, happiness: 14, population: 0, jobs: 150, pollution: 1, water: -6 },
  growthTime: 120,
  variants: 1,
  style: 'whitewash',
  retrofit: false,
  recipe(b) {
    const Y = 0.1;
    const H2 = Y + STOREY * 2;
    // Lot and the galleria's paving.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [5.95, Y, 4.95], tint: 0xe4dac8 });
    b.add({ piece: 'slab', p: [0, Y, (VAULT_Z0 + 2.45) / 2], s: [GX * 2, 0.015, 2.45 - VAULT_Z0], tint: 0xf3ead8 });

    // Two retail wings, two storeys each.
    for (const sx of [-1, 1]) {
      const x0 = sx * GX;
      const x1 = sx * 2.9;
      wingStorey(b, x0, x1, Y, STOREY);
      wingStorey(b, x0, x1, Y + STOREY, STOREY);
      // Street shopfronts: three bays per wing, each with its own awning and lit sign.
      for (let i = 0; i < 3; i++) {
        const x = sx * (GX + 0.35 + i * 0.66);
        const k = (sx < 0 ? 0 : 3) + i;
        awning(b, x, Y + STOREY - 0.08, WING_Z1 + 0.16, 0.58, 0.3, 0xf5efe4, AWNINGS[k]!, 4);
        b.add({ piece: 'slab', p: [x, Y + STOREY + 0.06, WING_Z1 + 0.04], s: [0.46, 0.09, 0.02], tint: SHOP_SIGNS[k]!, glow: 0.9 });
        b.add({ piece: 'slab', p: [x + 0.31, Y, WING_Z1 + 0.03], s: [0.04, STOREY * 2, 0.04], tint: TRIM.cream });
      }
      // Galleria balconies along the upper shops, with planters hanging over the arcade.
      b.add({ piece: 'slab', p: [sx * (GX - 0.12), Y + STOREY, (WING_Z0 + WING_Z1) / 2 + 0.4], s: [0.24, 0.04, 2.6], tint: TRIM.cream });
      railing(b, sx * (GX - 0.23), Y + STOREY + 0.04, (WING_Z0 + WING_Z1) / 2 + 0.4, 2.6, true);
      for (const z of [-0.6, 0.3, 1.1]) planter(b, sx * (GX - 0.12), Y + STOREY + 0.04, z, 0.18, 0.4, 0.15);
      b.upTo(1, () => wingRoof(b, sx * 1.9, H2, 1.95, 3.55, 1));
    }

    // The galleria vault from the rotunda to the street portal.
    vault(b, H2, GX, VAULT_Z0, VAULT_Z1, 9, 5);
    // Portal: twin pylons and the lit entrance under the vault's front arch.
    for (const sx of [-1, 1]) {
      b.add({ piece: 'slab', p: [sx * (GX + 0.06), Y, VAULT_Z1 - 0.04], s: [0.16, H2 - Y + 0.12, 0.16], tint: TRIM.cream });
      b.add({ piece: 'lumenRib', p: [sx * (GX + 0.06), Y + 0.1, VAULT_Z1 + 0.05], s: [0.03, H2 - Y - 0.1, 0.03], tint: 0xffe08a, glow: 0.8 });
    }
    entrance(b, 0, Y, VAULT_Z1, 1.1, 0.5, 0xffe08a);

    // Inside the arcade: a fountain, two shade trees in round planters and a kiosk.
    b.add({ piece: 'concreteCyl', p: [0, Y, 0.2], s: [0.8, 0.12, 0.8], tint: PALETTE.concrete });
    b.add({ piece: 'pool', p: [0, Y + 0.12, 0.2], s: [0.56, 0.03, 0.56] });
    b.add({ piece: 'concreteCyl', p: [0, Y + 0.12, 0.2], s: [0.12, 0.3, 0.12], tint: PALETTE.concrete });
    b.add({ piece: 'lumenRib', p: [0, Y + 0.42, 0.2], s: [0.04, 0.22, 0.04], tint: 0x9ee6ff, glow: 0.8 });
    for (const z of [-0.85, 1.05]) {
      b.add({ piece: 'concreteCyl', p: [0, Y, z], s: [0.42, 0.14, 0.42], tint: 0xd9cdb8 });
      tree(b, 0, Y + 0.14, z, 0.36, 0.1);
    }
    b.add({ piece: 'glassBox', p: [-0.45, Y, -0.35], s: [0.3, 0.3, 0.42], tint: PALETTE.glassWarm, glow: 0.7 });
    b.add({ piece: 'slab', p: [-0.45, Y + 0.3, -0.35], s: [0.36, 0.03, 0.48], tint: 0xff9ec2 });
    bench(b, 0.5, Y, 0.2, 0.42, true, true);

    // The garden rotunda at the back: a glass drum under a ribbed dome.
    b.add({ piece: 'concreteCyl', p: [0, Y, ROT_Z], s: [ROT_R * 2 + 0.1, 0.08, ROT_R * 2 + 0.1], tint: TRIM.cream });
    b.add({ piece: 'glassCyl', p: [0, Y + 0.08, ROT_Z], s: [ROT_R * 2, H2 - Y + 0.1, ROT_R * 2], tint: 0xe6f6ee, glow: 0.4 });
    const domeY = H2 + 0.18;
    b.add({ piece: 'concreteCyl', p: [0, domeY - 0.08, ROT_Z], s: [ROT_R * 2 + 0.14, 0.08, ROT_R * 2 + 0.14], tint: TRIM.cream });
    b.add({ piece: 'glassDome', p: [0, domeY, ROT_Z], s: [ROT_R * 2, ROT_R * 1.3, ROT_R * 2], tint: 0xdff7f0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const foot: Vec3 = [Math.cos(a) * ROT_R, domeY, ROT_Z + Math.sin(a) * ROT_R];
      const mid: Vec3 = [Math.cos(a) * ROT_R * 0.72, domeY + ROT_R * 0.45, ROT_Z + Math.sin(a) * ROT_R * 0.72];
      beam(b, 'lumenRib', foot, mid, 0.03, { tint: TRIM.cream, glow: 0.4 });
      beam(b, 'lumenRib', mid, [0, domeY + ROT_R * 0.64, ROT_Z], 0.03, { tint: TRIM.cream, glow: 0.4 });
    }
    // The garden inside the drum.
    b.add({ piece: 'mossBox', p: [0, Y + 0.08, ROT_Z], s: [1.2, 0.06, 1.2] });
    tree(b, 0, Y + 0.14, ROT_Z, 0.55, 0.05);
    flowers(b, 0, Y + 0.14, ROT_Z, 0.6, 12, 0.1, 0.6);

    // Street forecourt: a plaza with planters, benches, lamps, bike racks and corner trees.
    b.add({ piece: 'slab', p: [0, Y, 2.05], s: [5.9, 0.02, 0.8], tint: 0xe9e0cf });
    for (const sx of [-1, 1]) {
      planter(b, sx * 1.55, Y + 0.02, 1.95, 0.7, 0.26, 0.1);
      bench(b, sx * 1.55, Y + 0.02, 2.2, 0.5);
      tree(b, sx * 2.6, Y + 0.02, 2.05, 0.45, 0.1);
      lamp(b, sx * 0.85, Y + 0.02, 2.3, 0.62);
      for (let k = 0; k < 3; k++) b.add({ piece: 'willowArch', p: [sx * (2.0 + k * 0.12), Y + 0.02, 1.75], s: [0.1, 0.12, 0.02], r: Math.PI / 2, tint: TRIM.steel });
    }

    // Level 2: a third retail storey on each wing, set back behind a terrace, with the roof meadows lifted on top
    // and a food-court terrace of parasols over the east wing's front.
    const H3 = H2 + STOREY;
    b.level(2, () => {
      for (const sx of [-1, 1]) {
        wingStorey(b, sx * GX, sx * 2.9, H2, STOREY, 0.12);
        railing(b, sx * 1.9, H2, WING_Z1 - 0.02, 1.9);
        b.add({ piece: 'slab', p: [sx * 1.9, H2 + STOREY - 0.02, WING_Z1 - 0.1], s: [1.8, 0.1, 0.03], tint: sx < 0 ? 0xc9b6ff : 0xffe08a, glow: 0.8 });
      }
      b.upTo(2, () => {
        for (const sx of [-1, 1]) wingRoof(b, sx * 1.9, H3, 1.7, 3.3, 1);
      });
      for (let i = 0; i < 3; i++) parasol(b, 1.25 + i * 0.62, H2, WING_Z1 - 0.06, PARASOLS[i]!);
      for (let i = 0; i < 3; i++) parasol(b, -1.25 - i * 0.62, H2, WING_Z1 - 0.06, PARASOLS[(i + 1) % 4]!);
      // Bunting across the portal.
      for (let k = 0; k < 7; k++)
        b.add({ piece: 'lumenRib', p: [-0.75 + k * 0.25, H2 - 0.15 - Math.sin((k / 6) * Math.PI) * 0.1, VAULT_Z1 + 0.08], s: [0.05, 0.05, 0.05], tint: SHOP_SIGNS[k % 6]!, glow: 1 });
    });

    // Level 3: a cinema sky box over the west wing (marquee bulbs round its screen face), a glass sky-bridge across
    // the vault to an east roof garden, and a lit spire with a halo over the rotunda.
    b.level(3, () => {
      const cx = -1.9;
      const cz = -0.7;
      b.add({ piece: 'slab', p: [cx, H3, cz], s: [1.5, 0.7, 1.7], tint: 0x3b3f52 });
      b.add({ piece: 'slab', p: [cx, H3 + 0.12, cz + 0.86], s: [1.2, 0.46, 0.02], tint: 0x5a4a8a, glow: 0.6, sign: 'name' });
      for (let k = 0; k < 10; k++) {
        const t = k / 9;
        for (const y of [H3 + 0.08, H3 + 0.62])
          b.add({ piece: 'lumenRib', p: [cx - 0.65 + t * 1.3, y, cz + 0.88], s: [0.04, 0.04, 0.04], tint: 0xffe08a, glow: 1 });
      }
      wingRoof(b, 1.9, H3, 1.7, 3.3, 3);
      b.add({ piece: 'mossBox', p: [cx, H3, 1.0], s: [1.6, 0.05, 0.5] });
      flowers(b, cx, H3 + 0.05, 1.0, 0.3, 8, 0.2, 0.7);
      // Sky-bridge across the vault crown.
      b.add({ piece: 'glassBox', p: [0, H2 + GX + 0.08, -0.7], s: [2.0, 0.34, 0.42], tint: 0xdff3f4, glow: 0.4 });
      b.add({ piece: 'slab', p: [0, H2 + GX + 0.04, -0.7], s: [2.0, 0.05, 0.46], tint: TRIM.cream });
      b.add({ piece: 'slab', p: [0, H2 + GX + 0.42, -0.7], s: [2.0, 0.04, 0.46], tint: TRIM.cream });
      // Rotunda crown: a lantern, a spire and its halo.
      const top = domeY + ROT_R * 1.3;
      b.add({ piece: 'glassCyl', p: [0, top - 0.04, ROT_Z], s: [0.36, 0.3, 0.36], tint: 0xfff1c8, glow: 0.8 });
      b.add({ piece: 'spireCone', p: [0, top + 0.26, ROT_Z], s: [0.22, 1.4, 0.22], tint: 0xfff4f0 });
      b.add({ piece: 'haloRing', p: [0, top + 0.6, ROT_Z], s: [0.9, 2, 0.9], tint: 0xffe08a, glow: 1 });
      b.add({ piece: 'lumenRib', p: [0, top + 1.6, ROT_Z], s: [0.05, 0.2, 0.05], tint: 0xffe08a, glow: 1 });
    });
  },
});
