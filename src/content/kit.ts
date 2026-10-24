/** Reusable, renderer-agnostic recipe helpers shared by building definitions. */
import type { KitBuilder } from './types';

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
      s: [b.range(0.12, 0.22), b.range(0.25, 0.8), 1],
      r: Math.atan2(nx, nz),
      tint: b.pick(PALETTE.leaves),
      glow: b.rand() < 0.15 ? 0.6 : 0,
      growAt: b.range(0.2, 0.9),
    });
  }
}
