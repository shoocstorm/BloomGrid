/** Reusable, renderer-agnostic recipe helpers shared by building definitions. */
import type { KitBuilder, PieceId, PieceSpec, Vec3 } from './types';

export const PALETTE = {
  blossoms: [0xffb7d5, 0xffe08a, 0xc9b6ff, 0xfff4f0, 0xff9aa2, 0x9ee6ff, 0xffc58a] as const,
  leaves: [0x6fbf4a, 0x4e9a3a, 0x8fd35a, 0x3f8f5f, 0x7ccf7a] as const,
  glass: 0xd6f2ee,
  glassWarm: 0xe6f4e8,
  concrete: 0xf1ede2,
  timber: 0x9a7552,
  bark: 0x6b4f3a,
  glowCyan: 0x7ff7e6,
};

export const FLOOR = 0.32;

/** A small tree: trunk + 1-3 canopy blobs. */
export function tree(b: KitBuilder, x: number, y: number, z: number, size: number, growAt = 0): void {
  const h = size * b.range(0.9, 1.3);
  b.add({ piece: 'trunk', p: [x, y, z], s: [size * 0.16, h, size * 0.16], tint: PALETTE.bark, growAt });
  const blobs = 1 + Math.floor(b.rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = size * b.range(0.55, 0.85);
    b.add({
      piece: 'canopy',
      p: [x + b.range(-0.25, 0.25) * size, y + h * 0.75 + i * size * 0.18, z + b.range(-0.25, 0.25) * size],
      s: r,
      r: b.rand() * Math.PI * 2,
      tint: b.pick(PALETTE.leaves),
      glow: b.rand() < 0.25 ? 0.5 : 0,
      growAt: growAt + 0.05 * (i + 1),
    });
  }
}

/** A loose patch of pastel flowers on a surface at height `y`. */
export function flowers(
  b: KitBuilder,
  x: number,
  y: number,
  z: number,
  radius: number,
  count: number,
  growFrom = 0.1,
  growTo = 0.9,
): void {
  for (let i = 0; i < count; i++) {
    const a = b.rand() * Math.PI * 2;
    const d = Math.sqrt(b.rand()) * radius;
    b.add({
      piece: 'flower',
      p: [x + Math.cos(a) * d, y, z + Math.sin(a) * d],
      s: b.range(0.07, 0.12),
      tint: b.pick(PALETTE.blossoms),
      glow: b.rand() < 0.4 ? b.range(0.4, 1) : 0,
      growAt: b.range(growFrom, growTo),
    });
  }
}

export function grassTufts(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, count: number, growAt = 0): void {
  for (let i = 0; i < count; i++) {
    b.add({
      piece: 'grass',
      p: [x + b.range(-w / 2, w / 2), y, z + b.range(-d / 2, d / 2)],
      s: b.range(0.08, 0.16),
      r: b.rand() * 6.28,
      tint: b.pick(PALETTE.leaves),
      growAt: growAt + b.rand() * 0.3,
    });
  }
}

/** A roof meadow: moss bed + grass + flowers (+ optional orchard trees). */
export function roofMeadow(b: KitBuilder, y: number, w: number, d: number, trees = 0): void {
  b.add({ piece: 'mossBox', p: [0, y, 0], s: [w, 0.05, d], growAt: 0 });
  grassTufts(b, 0, y + 0.05, 0, w * 0.9, d * 0.9, Math.round(w * d * 6), 0.05);
  flowers(b, 0, y + 0.05, 0, Math.min(w, d) * 0.45, Math.round(w * d * 8), 0.15, 0.8);
  for (let i = 0; i < trees; i++) {
    tree(b, b.range(-w / 3, w / 3), y + 0.05, b.range(-d / 3, d / 3), b.range(0.35, 0.55), 0.35 + i * 0.1);
  }
}

/** Ivy strands hanging from an edge. `nx/nz` is the outward edge normal. */
export function ivyEdge(b: KitBuilder, x: number, y: number, z: number, len: number, nx: number, nz: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    b.add({
      piece: 'ivy',
      p: [x + -nz * t * len, y, z + nx * t * len],
      // Finer strands (D-096): wide ones read as flat green planks over the glass.
      s: [b.range(0.06, 0.11), b.range(0.16, 0.48), 1],
      r: Math.atan2(nx, nz),
      tint: b.pick(PALETTE.leaves),
      glow: b.rand() < 0.15 ? 0.6 : 0,
      growAt: b.range(0.2, 0.9),
    });
  }
}

/** Stretches a unit piece (pivot at base, +y up: cylinders, boxes, trunks) from `a` to `c`. */
export function beam(b: KitBuilder, piece: PieceId, a: Vec3, c: Vec3, thick: number, extra: Partial<PieceSpec> = {}): void {
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-3;
  // Rz tilts +y toward -x, then the yaw swings that lean round to (dx, dz).
  const tilt = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  b.add({ piece, p: a, s: [thick, len, thick], r: Math.atan2(dz, -dx), rz: tilt, ...extra });
}

// ── Detail helpers (D-095): the vocabulary that makes the first buildings a player sees read as places ──────
// Composed from existing pieces only (more instances, no new draw calls). Sizes in tiles; FLOOR is a storey.

export const TRIM = {
  /** Warm off-white for frames and trims. */
  cream: 0xf3ead8,
  /** Charcoal for door openings, frames and panel backs. */
  charcoal: 0x3b3f42,
  /** Deep blue-green photovoltaic glass. */
  pv: 0x24425a,
  pvFrame: 0xc9d2d6,
  terracotta: 0xc8714f,
  seaBlue: 0x3f8fb0,
  teal: 0x2f8f86,
  rope: 0xd9c49a,
  red: 0xd8463a,
  orange: 0xf08a3c,
  steel: 0xb8c2c6,
};

/**
 * A pitched (gable) roof over a w × d footprint centred at (x, z) with its eaves at y: two sloped planes meeting
 * at a ridge along x, a ridge cap and gable-end infill (`ends`). Returns the ridge height above y.
 */
export function gableRoof(
  b: KitBuilder,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  o: { pitch?: number; tint?: number; overhang?: number; ends?: number; thick?: number } = {},
): number {
  const a = o.pitch ?? 0.6;
  const ov = o.overhang ?? 0.08;
  const half = d / 2 + ov;
  const rise = (d / 2) * Math.tan(a);
  const len = half / Math.cos(a);
  const t = o.thick ?? 0.04;
  const tint = o.tint ?? TRIM.terracotta;
  for (const s of [1, -1]) {
    // A plane's base centre sits halfway down its slope; tilting about x lowers its outer edge.
    b.add({ piece: 'slab', p: [x, y + rise / 2 - Math.tan(a) * (ov / 2) + 0.01, z + (s * half) / 2], s: [w + ov * 2, t, len], rx: s * a, tint });
  }
  b.add({ piece: 'slab', p: [x, y + rise - 0.01, z], s: [w + ov * 2 + 0.02, 0.05, 0.1], tint: o.ends ?? TRIM.cream });
  // Gable ends: a stack of narrowing slabs approximating the triangle.
  if (o.ends !== undefined) {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const f = (steps - i) / steps;
      for (const sx of [1, -1])
        b.add({ piece: 'slab', p: [x + sx * (w / 2 - 0.02), y + (rise * i) / steps, z], s: [0.04, rise / steps, d * f], tint: o.ends });
    }
  }
  return rise;
}

/** A tilted photovoltaic array: `rows` × `cols` framed panels over w × d at height y, facing -z (south-ish). */
export function solarArray(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, rows = 1, cols = 3, tilt = 0.45): void {
  const pw = w / cols;
  const pd = d / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = x - w / 2 + pw * (c + 0.5);
      const pz = z - d / 2 + pd * (r + 0.5);
      b.add({ piece: 'slab', p: [px, y + Math.sin(tilt) * pd * 0.5, pz], s: [pw * 0.94, 0.025, pd * 0.92], rx: -tilt, tint: TRIM.pv, glow: 0.15 });
      b.add({ piece: 'slab', p: [px, y, pz + pd * 0.2], s: [pw * 0.06, Math.sin(tilt) * pd * 0.7, 0.03], tint: TRIM.steel });
    }
}

/** Vertical timber fins across a façade of width w (along x at z, or along z when `alongZ`). */
export function louvres(b: KitBuilder, x: number, y: number, z: number, w: number, h: number, count: number, alongZ = false, tint = PALETTE.timber): void {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    b.add({ piece: 'timberBox', p: alongZ ? [x, y, z + t * w] : [x + t * w, y, z], s: alongZ ? [0.07, h, 0.025] : [0.025, h, 0.07], tint });
  }
}

/** A raised timber planter with soil, a bush or two and flowers. */
export function planter(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, growAt = 0.1): void {
  b.add({ piece: 'timberBox', p: [x, y, z], s: [w, 0.12, d], tint: 0xa47c56 });
  b.add({ piece: 'mossBox', p: [x, y + 0.1, z], s: [w * 0.88, 0.03, d * 0.88] });
  const n = Math.max(1, Math.round((w * d) / 0.12));
  for (let i = 0; i < Math.min(3, n); i++)
    b.add({ piece: 'bush', p: [x + b.range(-w / 3, w / 3), y + 0.12, z + b.range(-d / 3, d / 3)], s: b.range(0.1, 0.16), tint: b.pick(PALETTE.leaves), growAt: growAt + i * 0.08 });
  flowers(b, x, y + 0.13, z, Math.min(w, d) * 0.4, Math.min(6, 2 + Math.round(n)), growAt, growAt + 0.5);
}

/** A slim street lamp: post, arm and a warm head that glows at night. */
export function lamp(b: KitBuilder, x: number, y: number, z: number, h = 0.55, tint = TRIM.charcoal): void {
  b.add({ piece: 'timberBox', p: [x, y, z], s: [0.035, h, 0.035], tint });
  b.add({ piece: 'timberBox', p: [x + 0.06, y + h - 0.02, z], s: [0.14, 0.025, 0.03], tint });
  b.add({ piece: 'lumenRib', p: [x + 0.12, y + h - 0.075, z], s: [0.06, 0.05, 0.06], tint: 0xffd9a0, glow: 1 });
}

/** A glass balustrade with a timber handrail along x (at z) or z (at x when `alongZ`). */
export function railing(b: KitBuilder, x: number, y: number, z: number, len: number, alongZ = false, h = 0.11): void {
  b.add({ piece: 'glassBox', p: [x, y, z], s: alongZ ? [0.015, h, len] : [len, h, 0.015], tint: 0xe8f6f2 });
  b.add({ piece: 'timberBox', p: [x, y + h, z], s: alongZ ? [0.035, 0.022, len + 0.02] : [len + 0.02, 0.022, 0.035], tint: PALETTE.timber });
}

/** A striped market awning over (x, z), sloping down toward +z, `w` wide. */
export function awning(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, a = 0xf5efe4, c = TRIM.teal, stripes = 6): void {
  const sw = w / stripes;
  for (let i = 0; i < stripes; i++)
    b.add({ piece: 'slab', p: [x - w / 2 + sw * (i + 0.5), y, z], s: [sw * 1.01, 0.02, d], rx: 0.32, tint: i % 2 ? c : a });
  // Scalloped valance along the front edge.
  b.add({ piece: 'slab', p: [x, y - Math.sin(0.32) * (d / 2) - 0.05, z + (d / 2) * Math.cos(0.32)], s: [w, 0.06, 0.012], tint: c });
}

/** A wooden barrel (ringed). */
export function barrel(b: KitBuilder, x: number, y: number, z: number, s = 0.14, tint = 0x9b6e45): void {
  b.add({ piece: 'concreteCyl', p: [x, y, z], s: [s, s * 1.3, s], tint });
  for (const k of [0.25, 0.75]) b.add({ piece: 'concreteCyl', p: [x, y + s * 1.3 * k - 0.006, z], s: [s * 1.04, 0.012, s * 1.04], tint: 0x4a4440 });
}

/** A slatted crate. */
export function crate(b: KitBuilder, x: number, y: number, z: number, s = 0.16, r = 0, tint = 0xc9a06a): void {
  b.add({ piece: 'timberBox', p: [x, y, z], s: [s, s * 0.8, s], r, tint });
  b.add({ piece: 'timberBox', p: [x, y + s * 0.38, z], s: [s * 1.02, s * 0.06, s * 1.02], r, tint: 0x8a6545 });
}

/** A row of timber piles from y down into the water (or ground), `n` along x from x0 to x1. */
export function piles(b: KitBuilder, x0: number, x1: number, z: number, top: number, n: number, depth = 0.7): void {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
    b.add({ piece: 'trunk', p: [x, top - depth, z], s: [0.07, depth, 0.07], tint: 0x6b5440 });
  }
}

/** A door: frame, dark leaf and a small warm transom light. */
export function door(b: KitBuilder, x: number, y: number, z: number, w = 0.16, h = 0.24, alongZ = false): void {
  b.add({ piece: 'slab', p: [x, y, z], s: alongZ ? [0.03, h + 0.03, w + 0.04] : [w + 0.04, h + 0.03, 0.03], tint: TRIM.cream });
  b.add({ piece: 'timberBox', p: alongZ ? [x + 0.01, y, z] : [x, y, z + 0.01], s: alongZ ? [0.03, h, w] : [w, h, 0.03], tint: 0x6b4a32 });
  b.add({ piece: 'lumenRib', p: alongZ ? [x + 0.02, y + h + 0.005, z] : [x, y + h + 0.005, z + 0.02], s: alongZ ? [0.02, 0.02, w * 0.6] : [w * 0.6, 0.02, 0.02], tint: 0xffd9a0, glow: 0.8 });
}

// ── Street-level helpers for landmarks (D-097): a big building only reads as a place when its foot has an entrance,
// somewhere to sit and light at night. All face +z (the street side of a recipe).

/**
 * A park bench (timber seat and back on charcoal legs) `len` long along x, facing +z; `alongZ` turns it to face +x,
 * `flip` to face the other way.
 */
export function bench(b: KitBuilder, x: number, y: number, z: number, len = 0.42, alongZ = false, flip = false): void {
  // (u along the seat, v toward the back, h up) → local position and size.
  const f = flip ? -1 : 1;
  const p = (u: number, h: number, v: number): Vec3 => (alongZ ? [x - v * f, y + h, z + u] : [x + u, y + h, z - v * f]);
  const s = (u: number, h: number, v: number): Vec3 => (alongZ ? [v, h, u] : [u, h, v]);
  for (const u of [-len / 2 + 0.04, len / 2 - 0.04]) b.add({ piece: 'slab', p: p(u, 0, 0), s: s(0.03, 0.1, 0.13), tint: TRIM.charcoal });
  b.add({ piece: 'timberBox', p: p(0, 0.1, 0), s: s(len, 0.025, 0.14), tint: PALETTE.timber });
  b.add({ piece: 'timberBox', p: p(0, 0.125, 0.065), s: s(len, 0.1, 0.02), tint: PALETTE.timber });
}

/** A glazed double door on a +z façade at z, with a framed timber canopy and a lit name strip above it. */
export function entrance(b: KitBuilder, x: number, y: number, z: number, w = 0.7, h = 0.42, sign = 0x7ff7e6): void {
  b.add({ piece: 'slab', p: [x, y, z], s: [w + 0.08, h + 0.05, 0.04], tint: TRIM.charcoal });
  for (const sx of [-1, 1]) b.add({ piece: 'glassBox', p: [x + (sx * w) / 4, y, z + 0.02], s: [w / 2 - 0.03, h, 0.02], tint: 0xcfefff, glow: 0.5 });
  b.add({ piece: 'slab', p: [x, y + h + 0.1, z + 0.22], s: [w + 0.5, 0.04, 0.45], tint: PALETTE.timber });
  for (const sx of [-1, 1]) b.add({ piece: 'timberBox', p: [x + sx * (w / 2 + 0.18), y, z + 0.4], s: [0.04, h + 0.1, 0.04], tint: TRIM.charcoal });
  b.add({ piece: 'slab', p: [x, y + h + 0.16, z + 0.02], s: [w + 0.2, 0.1, 0.03], tint: TRIM.charcoal });
  b.add({ piece: 'slab', p: [x, y + h + 0.18, z + 0.04], s: [w, 0.06, 0.01], tint: sign, glow: 0.9 });
}

/** A paved forecourt w × d centred at (x, z): planters at the ends, `lamps` along the front edge, benches between. */
export function forecourt(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, lamps = 2, benches = 2): void {
  b.add({ piece: 'slab', p: [x, y, z], s: [w, 0.02, d], tint: 0xe4dac8 });
  for (const sx of [-1, 1]) planter(b, x + sx * (w / 2 - 0.35), y + 0.02, z, 0.55, Math.min(0.3, d * 0.5), 0.1);
  for (let i = 0; i < lamps; i++) lamp(b, x - w / 2 + (w * (i + 0.5)) / lamps, y + 0.02, z + d / 2 - 0.08, 0.6);
  for (let i = 0; i < benches; i++) bench(b, x - w / 4 + (w / 2) * (benches > 1 ? i / (benches - 1) : 0.5), y + 0.02, z - d / 4);
}

/** Lily pads scattered over a pool w × d centred at (x, z), floating at y. */
export function lilies(b: KitBuilder, x: number, y: number, z: number, w: number, d: number, count: number): void {
  for (let i = 0; i < count; i++)
    b.add({ piece: 'lily', p: [x + b.range(-w / 2, w / 2), y, z + b.range(-d / 2, d / 2)], s: b.range(0.16, 0.26), r: b.rand() * 6.28, tint: b.pick(PALETTE.blossoms) });
}
