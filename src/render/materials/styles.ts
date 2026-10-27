import { Color } from 'three/webgpu';
import { float, uniformArray } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { STYLE_IDS, type StyleId } from '@/content/types';
import { hash2 } from '@/sim/random';

/**
 * Architectural finishes. A building's structural pieces (slabs, glass, timber) carry their style in the
 * integer part of the instance seed (aParams.y), so the shared `concrete` and `glass` materials draw
 * terracotta courses, arched windows or copper seams per building with no extra draw calls. The CPU side
 * recolours neutral recipe tints into the style's palette; recipe accent colours are kept.
 */
export interface BuildingStyle {
  /** Wall render / cladding colour (replaces neutral concrete tints). */
  wall: number;
  /** Window frames and spandrels between windows. */
  frame: number;
  /** Glazing tint. */
  pane: number;
  timber: number;
  wallPattern: WallPattern;
  glassPattern: GlassPattern;
  roughness: number;
  metalness: number;
}

/** Wall surfaces: 0 smooth render, 1 tile courses, 2 rammed-earth strata, 3 lime plaster, 4 standing-seam
 * panels, 5 glazed mosaic, 6 charred boards, 7 ashlar blocks, 8 woven bamboo. */
export type WallPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Glazing: 0 grid, 1 ribbon windows, 2 tall slots between piers, 3 arched windows, 4 diagrid, 5 louvres. */
export type GlassPattern = 0 | 1 | 2 | 3 | 4 | 5;

const S = (
  wall: number,
  frame: number,
  pane: number,
  timber: number,
  wallPattern: WallPattern,
  glassPattern: GlassPattern,
  roughness = 0.85,
  metalness = 0,
): BuildingStyle => ({ wall, frame, pane, timber, wallPattern, glassPattern, roughness, metalness });

export const STYLES: Record<StyleId, BuildingStyle> = {
  classic: S(0xf1ede2, 0xf3efe4, 0xd6f2ee, 0x9a7552, 0, 0, 0.82),
  terracotta: S(0xd98a62, 0xf4e6cf, 0xc9a77a, 0x8a5a3a, 1, 3, 0.9),
  whitewash: S(0xfbf8f0, 0x2f66a8, 0x7fa6d6, 0x7a5a3e, 3, 3, 0.97),
  'rammed-earth': S(0xc99c6e, 0x8a6a4a, 0xa8b07c, 0x6b4a30, 2, 2, 1),
  verdigris: S(0x7fb8a2, 0xb8743c, 0xe6c07c, 0x8a5a3a, 4, 4, 0.45, 0.45),
  mosaic: S(0x9cd6d2, 0xf6f2ea, 0xa6d8ec, 0xb08a60, 5, 1, 0.3),
  'charred-timber': S(0x45403b, 0xc99a5c, 0xf0c070, 0xc99a5c, 6, 5, 1),
  limestone: S(0xe2d3ae, 0x9a8668, 0x9cc0b0, 0x8a6a48, 7, 0, 0.9),
  bamboo: S(0xd9bd7e, 0x7a5a30, 0xb4d8a4, 0xc8a46a, 8, 5, 0.9),
  rose: S(0xf0bcb8, 0xfff6ec, 0xa4e4d4, 0xa07050, 3, 1, 0.95),
  sage: S(0xbad0a2, 0xf6f2ea, 0xd2e4f2, 0x9a7552, 7, 2, 0.9),
  indigo: S(0x46639a, 0xf0d890, 0xf0dcac, 0x5a4636, 5, 4, 0.35),
};

const list = STYLE_IDS.map((id) => STYLES[id]);
const col = (k: 'wall' | 'frame' | 'pane') =>
  uniformArray(
    list.map((s) => new Color(s[k])),
    'color',
  );
const num = (f: (s: BuildingStyle) => number) => uniformArray(list.map(f), 'float');

/** Per-style shader data, indexed by the style index (the integer part of aParams.y). */
export const styleData = (() => {
  const frame = col('frame');
  const wallPattern = num((s) => s.wallPattern);
  const glassPattern = num((s) => s.glassPattern);
  const roughness = num((s) => s.roughness);
  const metalness = num((s) => s.metalness);
  return (index: Node<'float'>) => {
    const i = index.toInt();
    return {
      frame: frame.element(i) as unknown as Node<'vec3'>,
      wallPattern: wallPattern.element(i) as unknown as Node<'float'>,
      glassPattern: glassPattern.element(i) as unknown as Node<'float'>,
      roughness: roughness.element(i) as unknown as Node<'float'>,
      metalness: metalness.element(i) as unknown as Node<'float'>,
    };
  };
})();

/** Is pattern node `p` equal to `k` (as a 0/1 float)? */
export const is = (p: Node<'float'>, k: number) => float(1).sub(p.sub(k).abs().min(1)) as Node<'float'>;

/**
 * Families of styles that sit well together. Each district (a coarse cell of the map) draws its everyday
 * buildings from one family, so streets read as places rather than noise.
 */
const FAMILIES: StyleId[][] = [
  ['terracotta', 'whitewash', 'limestone', 'rose'],
  ['rammed-earth', 'bamboo', 'charred-timber', 'sage'],
  ['verdigris', 'mosaic', 'indigo', 'classic'],
  ['rose', 'mosaic', 'sage', 'terracotta'],
  ['limestone', 'verdigris', 'terracotta', 'indigo'],
  ['charred-timber', 'limestone', 'terracotta', 'bamboo'],
];
const DISTRICT = 36;

/** The style of a building at tile (x, z): the def's own, `classic` for heroes, else from its district. */
export function pickStyle(def: { style?: StyleId; variants?: number }, x: number, z: number): StyleId {
  if (def.style) return def.style;
  if (def.variants === 1) return 'classic';
  const fam =
    FAMILIES[Math.floor(hash2(Math.floor(x / DISTRICT), Math.floor(z / DISTRICT), 4243) * FAMILIES.length)]!;
  // One in eight breaks from its street for variety.
  const k = hash2(x, z, 4247);
  if (k < 0.125) return STYLE_IDS[Math.floor((k / 0.125) * STYLE_IDS.length)]!;
  return fam[Math.floor(hash2(x, z, 4253) * fam.length)]!;
}

export const styleIndex = (id: StyleId): number => STYLE_IDS.indexOf(id);

const WALL_PIECES = new Set(['slab', 'concreteCyl']);
const GLASS_PIECES = new Set(['glassBox', 'glassCyl', 'spireCone']);
const _a = new Color();
const _b = new Color();
const REF_LUM = lum(_a.setHex(STYLES.classic.wall));

function lum(c: Color): number {
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
}

function sat(c: Color): number {
  const mx = Math.max(c.r, c.g, c.b);
  return mx > 0 ? (mx - Math.min(c.r, c.g, c.b)) / mx : 0;
}

/** Does this piece take the building's style (and so its style index in the seed)? */
export const isStyled = (piece: string): boolean =>
  WALL_PIECES.has(piece) || GLASS_PIECES.has(piece) || piece === 'timberBox';

/**
 * Recolours a recipe tint into a style: light neutral walls take the style's wall colour (keeping their
 * relative lightness and a per-building shade), pale glass its pane colour, and timber its timber.
 * Saturated accent tints are the designer's and stay as they are.
 */
export function restyle(piece: string, tint: number, style: BuildingStyle, shade: number): number {
  if (style === STYLES.classic) return tint;
  _a.setHex(tint);
  if (WALL_PIECES.has(piece) && sat(_a) < 0.16 && Math.max(_a.r, _a.g, _a.b) > 0.78) {
    const k = Math.min(1.06, Math.max(0.82, lum(_a) / REF_LUM)) * shade;
    return _b.setHex(style.wall).multiplyScalar(k).getHex();
  }
  if (GLASS_PIECES.has(piece) && sat(_a) < 0.3 && Math.max(_a.r, _a.g, _a.b) > 0.72) return style.pane;
  if (piece === 'timberBox' && sat(_a) < 0.55 && Math.max(_a.r, _a.g, _a.b) < 0.85) return style.timber;
  return tint;
}
