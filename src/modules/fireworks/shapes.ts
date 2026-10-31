import { SKY_FONT } from '@/content/skyFont';
import type { FireworkShape } from '@/sim/fireworksState';

/**
 * Shaped bursts (D-071): each is a set of spark targets in a flat plane, x right and y up, in world units from
 * the burst centre, with a colour per spark. The renderer lays the plane facing the camera, so the shape reads.
 */
export interface ShapePoint {
  x: number;
  y: number;
  color: number;
}

const TAU = Math.PI * 2;

/** The classic heart curve, ~32 units across. */
function heart(): ShapePoint[] {
  const out: ShapePoint[] = [];
  const n = 72;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x, y: y + 2, color: i % 3 ? 0xff3d7f : 0xff9cc0 });
  }
  return out;
}

/** Five interlaced rings: blue, black (drawn silver: black sparks don't show), red; yellow and green below. */
function rings(): ShapePoint[] {
  const out: ShapePoint[] = [];
  const R = 6;
  const rings: [number, number, number][] = [
    [-13, 3, 0x2f7dff],
    [0, 3, 0xe8ecff],
    [13, 3, 0xff3b3b],
    [-6.5, -3.5, 0xffd23f],
    [6.5, -3.5, 0x2fd06a],
  ];
  for (const [cx, cy, color] of rings)
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU;
      out.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, color });
    }
  return out;
}

/** Temple Fay's butterfly curve, ~30 units across: violet wings fading to cyan and pink at the tips. */
function butterfly(): ShapePoint[] {
  const out: ShapePoint[] = [];
  const n = 280;
  const wing = [0xb98cff, 0x7ff7e6, 0xff7ac8, 0xffd27a];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 12 * Math.PI;
    const r = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5;
    const x = Math.sin(t) * r;
    const y = Math.cos(t) * r;
    out.push({ x: x * 4, y: y * 4 + 2, color: wing[Math.min(3, Math.floor(Math.hypot(x, y) * 0.9))]! });
  }
  return out;
}

const SHAPES: Record<FireworkShape, () => ShapePoint[]> = { heart, rings, butterfly };
const cache = new Map<string, ShapePoint[]>();

export function shapePoints(shape: FireworkShape): ShapePoint[] {
  let p = cache.get(shape);
  if (!p) cache.set(shape, (p = SHAPES[shape]()));
  return p;
}

const TEXT_COLORS = [0xffd27a, 0x7ff7e6, 0xff7ac8, 0xb8ff6a, 0xc9b6ff];

/**
 * A message in dot letters, centred. Dots are 1.6 units apart (letters ~10 units tall), packed closer for long
 * messages so a line stays within ~120 units; each word takes its own colour, hearts are pink.
 */
export function textPoints(text: string): ShapePoint[] {
  const chars = [...text];
  const width = chars.length * 6 - 1;
  const dot = Math.min(1.6, 120 / width);
  const out: ShapePoint[] = [];
  let word = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ') return void word++;
    const color = ch === '♥' ? 0xff3d7f : TEXT_COLORS[word % TEXT_COLORS.length]!;
    for (const [cx, cy] of SKY_FONT[ch] ?? [])
      out.push({ x: (i * 6 + cx - width / 2) * dot, y: (3 - cy) * dot, color });
  });
  return out;
}
