import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef, KitBuilder, PieceSpec } from '@/content/types';
import { Rng, hash2 } from '@/sim/random';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { PALETTE } from '@/content/kit';
import type { Grid } from '@/sim/Grid';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';
import { STYLES, isStyled, pickStyle, restyle, styleIndex, type BuildingStyle } from '@/render/materials/styles';

/** One piece of a cached recipe run, in building-local space (origin = footprint centre at ground). */
export interface TemplatePiece {
  piece: string;
  local: Matrix4;
  tint: number;
  glow: number;
  growAt: number;
  seed: number;
  /** Local base height, used to stagger the bottom-up construction animation. */
  y: number;
  /** Tier range (0 = level 1) a designed level piece shows in (D-100); unset = always. */
  from?: number;
  to?: number;
  /** Local top of a designed level piece, for the level's height. */
  top?: number;
  /** A door leaf's slide, in its own widths along its local x (D-132). */
  door?: number;
  /** A sign surface (D-133). */
  sign?: 'name' | 'number';
}

export interface BuildingTemplate {
  pieces: TemplatePiece[];
  /** Top of the tallest piece (local), for placing alert markers. */
  height: number;
  /** Local bounds of the solid building volume (for façade decoration). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; top: number };
  /** Bloom Retrofit overlay (flower walls, ivy curtains, sunflower roof), built on demand. */
  retrofit?: TemplatePiece[];
  /** Level overlays per tier (D-073), built on demand. */
  tiers?: TemplatePiece[][];
  /**
   * Designed level pieces (D-100: `b.level` / `b.upTo` in the recipe, or a def's `levels`), each with its tier
   * range. Empty for a recipe with no designed levels, which gets the generic overlay instead.
   */
  ranged: TemplatePiece[];
  /** Banyan merge overlay (aerial roots, buttresses, crown), built on demand. */
  banyan?: TemplatePiece[];
  rng: Rng;
}

/** World-space placement of a building: template + base transform + terrain plinth. */
export interface Placement {
  template: BuildingTemplate;
  base: Matrix4;
  plinth: Matrix4;
}

const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _c = new Color();
const _params = new Float32Array(4);
const UP = new Vector3(0, 1, 0);

const templates = new Map<string, BuildingTemplate>();
/** Pieces whose materials read vitality from aParams.w. */
const PLANT_PIECES = new Set(['mossBox', 'canopy', 'palm', 'bush', 'grass', 'ivy', 'flower', 'fungus']);
/** Pieces that make up a building's solid volume (for façade bounds). */
// Domes and tanks are excluded: dressing their bounding box would float flowers in mid-air.
const SOLID_PIECES = new Set(['slab', 'glassBox', 'glassCyl', 'concreteCyl', 'mossBox']);

/**
 * Runs a recipe once per (definition, variant) and caches the result. Thousands of buildings
 * then cost only a matrix multiply per piece, instead of re-running recipes and allocating.
 */
export function buildingTemplate(def: BuildingDef, variant: number): BuildingTemplate {
  const key = `${def.id}#${variant}`;
  let t = templates.get(key);
  if (t) return t;
  const rng = new Rng(Math.floor(hash2(variant, 7, buildings.indexOf(def.id) + 1) * 2 ** 31));
  const recipe = typeof def.recipe === 'function' ? def.recipe : def.recipe.fallback;
  // Each level draws from its own seeded stream (D-082), so the base pieces never shift when a level is designed.
  const idx = buildings.indexOf(def.id) + 1;
  const tierRng = [1, 2].map((tier) => new Rng(Math.floor(hash2(variant, 11 + tier, idx) * 2 ** 31)));
  const levels = def.levels;
  const run = runRecipe(def, rng, (b) => {
    recipe?.(b);
    // A def's `levels` hook (the first designed heroes) is the same as `b.level` blocks at the end of the recipe.
    if (levels) for (const tier of [1, 2] as const) b.level((tier + 1) as 2 | 3, () => levels(b, tier));
  }, tierRng);
  const bounds = run.bounds;
  if (bounds.minX === Infinity) Object.assign(bounds, { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, top: 0.5 });
  t = { pieces: run.pieces, ranged: run.ranged, height: run.height, bounds, rng };
  templates.set(key, t);
  return t;
}

/**
 * Runs one recipe function against a fresh builder; returns its pieces, height and solid bounds (level-1 pieces
 * only). Pieces inside `b.level` / `b.upTo` blocks go to `ranged` with their tier range; `b.level` blocks draw from
 * `tierRng` (per tier) so they never move the base stream.
 */
function runRecipe(
  def: BuildingDef,
  rng: Rng,
  fn: (b: KitBuilder) => void,
  tierRng: Rng[] = [],
): { pieces: TemplatePiece[]; ranged: TemplatePiece[]; height: number; bounds: BuildingTemplate['bounds'] } {
  const pieces: TemplatePiece[] = [];
  const ranged: TemplatePiece[] = [];
  let height = 0.5;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, top: 0 };
  // Current tier range (0 = level 1) and the stream it draws from.
  let from = 0;
  let to = 2;
  let cur = rng;
  const add = (spec: PieceSpec) => {
    const p = spec.p ?? [0, 0, 0];
    const s = spec.s ?? 1;
    const sv = typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]);
    _q.setFromEuler(_e.set(spec.rx ?? 0, spec.r ?? 0, spec.rz ?? 0, 'YXZ'));
    const local = new Matrix4().compose(_v.set(p[0], p[1], p[2]), _q, sv);
    const piece: TemplatePiece = { piece: spec.piece, local, tint: spec.tint ?? 0xffffff, glow: spec.glow ?? 0, growAt: spec.growAt ?? 0, seed: cur.next(), y: p[1] };
    if (spec.door) piece.door = spec.door;
    if (spec.sign) piece.sign = spec.sign;
    if (from > 0 || to < 2) {
      if (from <= to) ranged.push(Object.assign(piece, { from, to, top: p[1] + (spec.piece === 'ivy' ? 0 : sv.y) }));
      return;
    }
    height = Math.max(height, p[1] + (spec.piece === 'ivy' ? 0 : sv.y));
    if (SOLID_PIECES.has(spec.piece)) {
      // Rotated half-extents of a unit piece (pivot at base centre).
      const hx = Math.abs(Math.cos(spec.r ?? 0)) * sv.x * 0.5 + Math.abs(Math.sin(spec.r ?? 0)) * sv.z * 0.5;
      const hz = Math.abs(Math.sin(spec.r ?? 0)) * sv.x * 0.5 + Math.abs(Math.cos(spec.r ?? 0)) * sv.z * 0.5;
      bounds.minX = Math.min(bounds.minX, p[0] - hx);
      bounds.maxX = Math.max(bounds.maxX, p[0] + hx);
      bounds.minZ = Math.min(bounds.minZ, p[2] - hz);
      bounds.maxZ = Math.max(bounds.maxZ, p[2] + hz);
      bounds.top = Math.max(bounds.top, p[1] + sv.y);
    }
    pieces.push(piece);
  };
  const within = (f: number, t: number, body: () => void) => {
    const saved = [from, to, cur] as const;
    from = Math.max(from, f);
    to = Math.min(to, t);
    // A level block draws from that level's stream; an `upTo` block keeps the stream it is in.
    if (f > saved[0]) cur = tierRng[from - 1] ?? cur;
    try {
      body();
    } finally {
      [from, to, cur] = saved;
    }
  };
  const [w, d] = def.footprint;
  fn({
    w,
    d,
    rand: () => cur.next(),
    range: (a, b) => cur.range(a, b),
    pick: (arr) => cur.pick(arr),
    add,
    level: (n, body) => within(n - 1, 2, body),
    upTo: (n, body) => within(0, n - 1, body),
  });
  return { pieces, ranged, height, bounds };
}

/** Top of the tallest piece a building shows at `tier` (0 = level 1): sky-lanes clear it, alert markers float over it. */
export function heightAt(t: BuildingTemplate, tier: number): number {
  let h = t.height;
  for (const p of t.ranged) if (p.from! <= tier && tier <= p.to!) h = Math.max(h, p.top!);
  return h;
}

/** Every template piece a building shows at `tier` (0 = level 1): the base plus its designed level pieces. */
export function piecesAt(t: BuildingTemplate, tier: number): TemplatePiece[] {
  if (!t.ranged.length) return t.pieces;
  return [...t.pieces, ...t.ranged.filter((p) => p.from! <= tier && tier <= p.to!)];
}

/**
 * Bloom Retrofit overlay for a template: flowering façades and ivy curtains on all four faces,
 * plus a sunflower solar crown on the roof. Generated once per template and cached.
 */
export function retrofitPieces(t: BuildingTemplate): TemplatePiece[] {
  if (t.retrofit) return t.retrofit;
  const out: TemplatePiece[] = [];
  const { minX, maxX, minZ, maxZ, top } = t.bounds;
  const rng = t.rng;
  const push = (piece: string, p: [number, number, number], s: [number, number, number], r: number, tint: number, glow: number, rz = 0) => {
    _q.setFromEuler(_e.set(0, r, rz, 'YXZ'));
    out.push({ piece, local: new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, glow, growAt: 0, seed: rng.next(), y: p[1] });
  };
  const blossoms = PALETTE.blossoms;
  // Faces: [fixed coord, along-axis min, max, outward normal x, z]
  const faces: [number, number, number, number, number][] = [
    [maxX + 0.03, minZ, maxZ, 1, 0],
    [minX - 0.03, minZ, maxZ, -1, 0],
    [maxZ + 0.03, minX, maxX, 0, 1],
    [minZ - 0.03, minX, maxX, 0, -1],
  ];
  // Only buildings with a real box-like volume get flowering façades.
  const hasFacade = maxX - minX > 0.5 && maxZ - minZ > 0.5 && top > 0.4;
  const perFace = Math.max(8, Math.min(18, Math.round(top * 5)));
  for (const [fixed, a, b, nx, nz] of hasFacade ? faces : []) {
    // Blossom clusters climbing the façade, densest low down like a cascading planting.
    for (let i = 0; i < perFace; i++) {
      const u = a + 0.06 + rng.next() * (b - a - 0.12);
      const y = 0.12 + Math.pow(rng.next(), 1.4) * Math.max(0.2, top * 0.95 - 0.12);
      const p: [number, number, number] = nx ? [fixed, y, u] : [u, y, fixed];
      const s = 0.11 + rng.next() * 0.07;
      push('flower', p, [s, s, s], 0, rng.pick(blossoms), rng.next() < 0.6 ? 0.6 + rng.next() * 0.4 : 0);
    }
    // Short ivy fringes under each roof edge.
    for (let i = 0; i < 4; i++) {
      const u = a + ((i + 0.5) / 4) * (b - a);
      const p: [number, number, number] = nx ? [fixed, top, u] : [u, top, fixed];
      push('ivy', p, [0.13, Math.min(1, top * (0.25 + rng.next() * 0.2)), 1], Math.atan2(nx, nz), rng.pick(PALETTE.leaves), rng.next() < 0.3 ? 0.6 : 0);
    }
  }
  // Indoor-outdoor courtyard on taller buildings: a waterfall down one façade into a ground-floor
  // basin, framed by bushes and fungus lamps (their glow follows street activity at night).
  if (hasFacade && top > 1.2) {
    const [fixed, a, b, nx, nz] = faces[Math.floor(rng.next() * 4)]!;
    const mid = (a + b) / 2;
    const width = Math.min(0.55, (b - a) * 0.4);
    const r = Math.atan2(nx, nz);
    const at = (out: number, y: number, along = 0): [number, number, number] => (nx ? [fixed + nx * out, y, mid + along] : [mid + along, y, fixed + nz * out]);
    push('waterfall', at(0.02, 0.04), [width, top * 0.92, 1], r, 0xffffff, 0);
    push('pool', at(0.2, 0.0), [width + 0.18, 0.05, 0.36], r, 0xffffff, 0);
    for (const side of [-1, 1]) {
      push('bush', at(0.24, 0.02, side * (width / 2 + 0.17)), [0.2, 0.18, 0.2], 0, rng.pick(PALETTE.leaves), 0.4);
      push('fungus', at(0.42, 0.02, side * (width / 2 + 0.05)), [0.09, 0.09, 0.09], 0, 0xbff6ff, 1);
    }
  }
  // A ring of blossoms around the base for every retrofitted building (domes included).
  for (let i = 0; i < 12; i++) {
    const ang = rng.next() * Math.PI * 2;
    const rx = (maxX - minX) / 2 + 0.12;
    const rz = (maxZ - minZ) / 2 + 0.12;
    const s = 0.1 + rng.next() * 0.05;
    push('flower', [(minX + maxX) / 2 + Math.cos(ang) * rx, 0.02, (minZ + maxZ) / 2 + Math.sin(ang) * rz], [s, s, s], 0, rng.pick(blossoms), 0.7);
  }
  // Sunflower crown.
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  push('concreteCyl', [cx, top, cz], [0.32, 0.08, 0.32], 0, 0xffe08a, 0.5);
  for (let i = 0; i < 10; i++) push('sunPetal', [cx, top + 0.06, cz], [0.6, 1, 0.6], (i / 10) * Math.PI * 2, 0xffc83a, 0.6, 0.45); // golden sunflower petals
  t.retrofit = out;
  return out;
}

/**
 * Level overlays (D-073), generic so no recipe changes: level 2 adds a roof terrace (a plate, planters at the
 * corners, a flower edge and two solar petals); level 3 adds a setback crown on top (two glass floors, a meadow
 * cap with a tree, and a lit spire). Built from the template's bounds; cached per template and level. A recipe with
 * designed levels (D-100: `b.level` / `b.upTo`, or a def's `levels`) returns those pieces instead, at every tier
 * (level 1 included: an `upTo` roof shows until a level replaces it).
 */
export function tierPieces(t: BuildingTemplate, tier: number): TemplatePiece[] {
  const cache = (t.tiers ??= []);
  if (cache[tier]) return cache[tier]!;
  if (t.ranged.length) return (cache[tier] = t.ranged.filter((p) => p.from! <= tier && tier <= p.to!));
  const out: TemplatePiece[] = [];
  const { minX, maxX, minZ, maxZ, top } = t.bounds;
  const rng = new Rng(Math.floor((minX * 31 + maxZ * 17 + top * 13 + tier) * 1000) >>> 0);
  const push = (piece: string, p: [number, number, number], s: [number, number, number], r: number, tint: number, glow: number, rz = 0) => {
    _q.setFromEuler(_e.set(0, r, rz, 'YXZ'));
    out.push({ piece, local: new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, glow, growAt: 0, seed: rng.next(), y: p[1] });
  };
  const [w, d] = [maxX - minX, maxZ - minZ];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  if (tier >= 1 && w > 0.4 && d > 0.4) {
    push('slab', [cx, top, cz], [w * 0.92, 0.06, d * 0.92], 0, PALETTE.concrete, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const p: [number, number, number] = [cx + sx * w * 0.36, top + 0.06, cz + sz * d * 0.36];
      push('concreteCyl', p, [0.16, 0.12, 0.16], 0, 0xdcd5c6, 0);
      push('bush', [p[0], top + 0.16, p[2]], [0.2, 0.18, 0.2], rng.next() * 6, rng.pick(PALETTE.leaves), 0);
    }
    for (let i = 0; i < 6; i++) {
      const s = 0.09 + rng.next() * 0.04;
      push('flower', [cx + (rng.next() - 0.5) * w * 0.8, top + 0.06, cz + (rng.next() > 0.5 ? 1 : -1) * d * 0.42], [s, s, s], 0, rng.pick(PALETTE.blossoms), 0.5);
    }
    push('solarLeaf', [cx - w * 0.15, top + 0.08, cz], [0.5, 1, 0.6], 0.3, 0xffffff, 0, 0.15);
    push('solarLeaf', [cx + w * 0.15, top + 0.08, cz], [0.5, 1, 0.6], -0.3, 0xffffff, 0, 0.15);
  }
  if (tier >= 2 && w > 0.6 && d > 0.6) {
    const [cw, cd] = [w * 0.55, d * 0.55];
    const y = top + 0.06;
    push('glassBox', [cx, y, cz], [cw, 0.64, cd], 0, PALETTE.glass, 0.4);
    push('slab', [cx, y + 0.64, cz], [cw + 0.08, 0.06, cd + 0.08], 0, PALETTE.concrete, 0);
    push('grass', [cx, y + 0.7, cz], [cw * 0.8, 0.3, cd * 0.8], 0, 0x8fd35a, 0);
    push('trunk', [cx - cw * 0.2, y + 0.7, cz], [0.06, 0.35, 0.06], 0, 0xffffff, 0);
    push('canopy', [cx - cw * 0.2, y + 1.0, cz], [0.35, 0.3, 0.35], 0, rng.pick(PALETTE.leaves), 0);
    push('spireCone', [cx + cw * 0.25, y + 0.7, cz], [0.12, 0.7, 0.12], 0, PALETTE.glassWarm, 0.3);
    push('haloRing', [cx + cw * 0.25, y + 1.2, cz], [0.3, 2, 0.3], 0, 0xffffff, 0.8);
  }
  cache[tier] = out;
  return out;
}

/**
 * Green Weaver banyan merge: aerial roots curtain the façades down to the ground, buttress roots
 * grip the base and a vast canopy crowns the roof. Generated once per template and cached.
 */
export function banyanPieces(t: BuildingTemplate): TemplatePiece[] {
  if (t.banyan) return t.banyan;
  const out: TemplatePiece[] = [];
  const { minX, maxX, minZ, maxZ, top } = t.bounds;
  const rng = t.rng;
  const push = (piece: string, p: [number, number, number], s: [number, number, number], r: number, tint: number, glow: number, rx = 0, rz = 0) => {
    _q.setFromEuler(_e.set(rx, r, rz, 'YXZ'));
    out.push({ piece, local: new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, glow, growAt: 0, seed: rng.next(), y: p[1] });
  };
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hx = (maxX - minX) / 2 + 0.08;
  const hz = (maxZ - minZ) / 2 + 0.08;
  // Aerial roots around the perimeter, from the crown down to the ground.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.next() * 0.2;
    const x = cx + Math.max(-hx, Math.min(hx, Math.cos(a) * hx * 1.4));
    const z = cz + Math.max(-hz, Math.min(hz, Math.sin(a) * hz * 1.4));
    const w = 0.03 + rng.next() * 0.035;
    push('trunk', [x, 0, z], [w, top + 0.15, w], 0, PALETTE.bark, 0, (rng.next() - 0.5) * 0.06, (rng.next() - 0.5) * 0.06);
  }
  // Buttress roots flaring out at the base.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    push('trunk', [cx + Math.cos(a) * hx, 0, cz + Math.sin(a) * hz], [0.08, 0.55, 0.08], -a, PALETTE.bark, 0, 0, 0.7);
  }
  // A great crown over the roof.
  for (let i = 0; i < 9; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next());
    const s = 0.75 + rng.next() * 0.6;
    push('canopy', [cx + Math.cos(a) * d * hx, top + 0.15 + rng.next() * 0.35, cz + Math.sin(a) * d * hz], [s * 1.2, s * 0.8, s * 1.2], rng.next() * 6, rng.pick(PALETTE.leaves), rng.next() < 0.35 ? 0.6 : 0);
  }
  t.banyan = out;
  return out;
}

export function variantFor(def: BuildingDef, x: number, z: number): number {
  return Math.floor(hash2(x, z, buildings.indexOf(def.id) + 1) * (def.variants ?? 3));
}

/** Flattens a placement into world matrices (for previews). */
export function placementMatrices(place: Placement): { piece: string; matrix: Matrix4 }[] {
  return [
    { piece: 'plinth', matrix: place.plinth },
    ...place.template.pieces.map((p) => ({ piece: p.piece, matrix: new Matrix4().multiplyMatrices(place.base, p.local) })),
  ];
}

/** Base transform and terrain-meeting plinth for a building at (x, z, rot). */
export function placeBuilding(grid: Grid, def: BuildingDef, x: number, z: number, rot: number): Placement {
  const [fw, fd] = def.footprint;
  const W = rot % 2 ? fd : fw;
  const D = rot % 2 ? fw : fd;
  const { min, max } = grid.rangeOver(x, z, W, D);
  const baseY = max + 0.02;
  const base = new Matrix4().compose(_v.set(x + W / 2, baseY, z + D / 2), _q.setFromAxisAngle(UP, -rot * (Math.PI / 2)), _s.set(1, 1, 1));
  const bottom = min - 0.4;
  const plinth = new Matrix4().multiplyMatrices(base, _m.compose(_v.set(0, bottom - baseY, 0), _q.identity(), _s.set(fw * 0.98, baseY - bottom, fd * 0.98)));
  return { template: buildingTemplate(def, variantFor(def, x, z)), base, plinth };
}

/** Front steps (D-132): rise per step (under the walker's step height), tread depth, width. */
const STAIR_RISE = 0.1;
const STAIR_TREAD = 0.075;
const STAIR_WIDTH = 0.5;

/**
 * Front steps from a door building's lot down to the ground before its door (D-132): unit `slab` boxes in world
 * space, each a rise below the last, stepping out from the lot's edge until they meet the ground. Lots stand on
 * their highest corner, so a door on the low side can be a storey above the street. Empty when the building has no
 * door or its door is at street level. The renderer draws these and the explore collider walks on them.
 */
export function doorSteps(grid: Grid, def: BuildingDef, place: Placement): Matrix4[] {
  const doors = place.template.pieces.filter((p) => p.door);
  if (!doors.length) return [];
  const c = new Vector3();
  for (const d of doors) c.add(_v.setFromMatrixPosition(d.local));
  c.divideScalar(doors.length);
  // Outward: the leaf's thin (local z) axis, pointing away from the building's centre.
  const n = new Vector3().setFromMatrixColumn(doors[0]!.local, 2).setY(0).normalize();
  if (n.dot(c) < 0) n.negate();
  const side = new Vector3(-n.z, 0, n.x);
  const lateral = c.dot(side);
  const half = Math.abs(n.x) * (def.footprint[0] / 2) + Math.abs(n.z) * (def.footprint[1] / 2);
  const baseY = place.base.elements[13]!;
  const yaw = Math.atan2(n.x, n.z);
  const out: Matrix4[] = [];
  const p = new Vector3();
  for (let i = 1; i < 60; i++) {
    const top = -i * STAIR_RISE;
    p.copy(n).multiplyScalar(half + (i - 0.5) * STAIR_TREAD).addScaledVector(side, lateral);
    const w = _v.copy(p).applyMatrix4(place.base);
    const ground = (grid.inBounds(Math.floor(w.x), Math.floor(w.z)) ? grid.heightAt(w.x, w.z) : baseY) - baseY;
    if (top <= ground + 0.02) break;
    const bottom = ground - 0.05;
    _q.setFromAxisAngle(UP, yaw);
    const local = new Matrix4().compose(_v.set(p.x, bottom, p.z), _q, _s.set(STAIR_WIDTH, top - bottom, STAIR_TREAD));
    out.push(new Matrix4().multiplyMatrices(place.base, local));
  }
  return out;
}

/** A sign surface in world space (D-133): the outward face of a `sign` piece. */
export interface SignSpot {
  kind: 'name' | 'number';
  /** Centre of the face, its outward normal, the reading direction (right) and the face's size (world units). */
  at: Vector3;
  normal: Vector3;
  right: Vector3;
  width: number;
  height: number;
}

const _pos = new Vector3();
const _scl = new Vector3();
const _rot = new Quaternion();

/**
 * Where a building's signs go (D-133): the outward face of each `sign` piece (its thin horizontal axis, pointing away
 * from the building's centre). A building with none gets a number plate at the middle of its front (+z) face.
 */
export function signSpots(place: Placement): SignSpot[] {
  const out: SignSpot[] = [];
  const centre = new Vector3().setFromMatrixPosition(place.base);
  for (const p of place.template.pieces) {
    if (!p.sign) continue;
    _m.multiplyMatrices(place.base, p.local).decompose(_pos, _rot, _scl);
    const alongX = _scl.x < _scl.z;
    const normal = new Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1).applyQuaternion(_rot);
    normal.y = 0;
    normal.normalize();
    if (normal.dot(_v.copy(_pos).sub(centre)) < 0) normal.negate();
    const thick = alongX ? _scl.x : _scl.z;
    const at = _pos.clone().addScaledVector(normal, thick / 2).add(_v.set(0, _scl.y / 2, 0));
    const right = new Vector3().crossVectors(UP, normal).normalize();
    out.push({ kind: p.sign, at, normal, right, width: alongX ? _scl.z : _scl.x, height: _scl.y });
  }
  if (!out.length) {
    const b = place.template.bounds;
    const at = new Vector3((b.minX + b.maxX) / 2, 0.12, b.maxZ).applyMatrix4(place.base);
    const normal = new Vector3(0, 0, 1).transformDirection(place.base).setY(0).normalize();
    const right = new Vector3().crossVectors(UP, normal).normalize();
    out.push({ kind: 'number', at, normal, right, width: Math.min(0.5, b.maxX - b.minX), height: 0.12 });
  }
  return out;
}

/**
 * The way into a building (D-133), for residents walking in and out: door leaves first, then number plates, then
 * name strips, else the middle of its front. `y` is the lot's floor; `steps` = it has front steps (D-132).
 */
export function doorwayOf(grid: Grid, def: BuildingDef, place: Placement): { x: number; z: number; y: number; nx: number; nz: number; steps: boolean } {
  const y = place.base.elements[13]!;
  const doors = place.template.pieces.filter((p) => p.door);
  if (doors.length) {
    const c = new Vector3();
    for (const d of doors) c.add(_v.setFromMatrixPosition(d.local));
    c.divideScalar(doors.length);
    const n = new Vector3().setFromMatrixColumn(doors[0]!.local, 2).setY(0).normalize();
    if (n.dot(c) < 0) n.negate();
    c.setY(0).applyMatrix4(place.base);
    n.transformDirection(place.base);
    return { x: c.x, z: c.z, y, nx: n.x, nz: n.z, steps: doorSteps(grid, def, place).length > 0 };
  }
  const spots = signSpots(place);
  const s = spots.find((p) => p.kind === 'number') ?? spots[0]!;
  return { x: s.at.x, z: s.at.z, y, nx: s.normal.x, nz: s.normal.z, steps: false };
}

interface Entry {
  handles: InstanceHandle[];
  /** The terrain-meeting plinth it was placed with (re-seated when the ground under it changes). */
  plinth: Matrix4;
  /** Membrane pieces whose shader reads live greenery. */
  moss: InstanceHandle[];
  /** Glass pieces whose lit windows follow power and occupancy (aParams.w). */
  glass: InstanceHandle[];
  /** Plant and membrane pieces that wilt with low vitality (aParams.w). */
  plants: InstanceHandle[];
  vitality: number;
  /** 0..1 how far nature has reclaimed a worn-down building (extra moss). */
  wild: number;
  template: BuildingTemplate | null;
  /** Bloom Retrofit overlay instances (empty when not retrofitted). */
  retro: InstanceHandle[];
  /** Level overlay instances (D-073) and the concrete walls that weather with age (aParams.w = 1 − weathering). */
  tierH: InstanceHandle[];
  /** The template piece each `tierH` handle draws (same order), so a level change keeps what both levels show. */
  tierP: TemplatePiece[];
  walls: InstanceHandle[];
  /** Glass and timber pieces: their weathering rides on aParams.x (1 = clean), which those materials don't use. */
  skins: InstanceHandle[];
  weather: number;
  /** A ruin (D-075): upper floors gone, rubble on the lot. */
  rubble: InstanceHandle[];
  collapsed: boolean;
  /** Template pieces waiting for greenery to reach their threshold, sorted by growAt. */
  pending: TemplatePiece[];
  base: Matrix4;
  height: number;
  lastGreenery: number;
  /** Window lighting 0..1 (power × occupancy). */
  power: number;
  /** Architectural finish, its index (carried in the seed of styled pieces) and a per-lot wall shade. */
  style: BuildingStyle;
  styleIndex: number;
  shade: number;
  problems: number;
  alert: InstanceHandle | null;
  /** Door leaves (D-132): their handles and pieces, how far open they are (0..1) and where they are heading. */
  doors: { h: InstanceHandle; p: TemplatePiece }[];
  open: number;
  openTo: number;
  /** Lamps: pieces that glow (fungus lamps, screens, signs), with their glow, for the lights switch. */
  lamps: { h: InstanceHandle; glow: number }[];
  lightsOn: boolean;
  /** Seconds the build-in animation takes from `building:added` (0 = appeared at once). */
  rise: number;
}

/** Build-in pace: a template piece at local height y starts growing after y × RISE_PER_UNIT seconds. */
export const RISE_PER_UNIT = 0.35;
/** Grow tween of one template piece (s). */
const PIECE_GROW = 0.7;

/** A building rising on its lot (see `BuildingRenderer.rising`). */
export interface Rising {
  base: Matrix4;
  bounds: BuildingTemplate['bounds'];
  height: number;
  seconds: number;
}

// Marker colour by most urgent problem first.
const ALERT_COLORS: [number, number][] = [
  [Problem.FLOODED, 0x2fe6c8],
  [Problem.OFFLINE, 0xff8a3a],
  [Problem.NO_ROAD, 0xe8e8e8],
  [Problem.NO_POWER, 0xffcf3a],
  [Problem.NO_WATER, 0x4ab8ff],
  [Problem.NEGLECTED, 0x8a6a3a],
  [Problem.UNSTAFFED, 0xc9a6ff],
];

/**
 * Mirrors building entities into instanced kit pieces. New buildings grow bottom-up; later
 * plant stages pop in as the sim's greenery crosses each piece's `growAt`. Service state is
 * reflected visually: windows dim without power, and a floating marker flags problems.
 */
export class BuildingRenderer {
  private entries = new Map<number, Entry>();
  private mossTimer = 0;

  constructor(private ctx: GameContext) {
    const { bus } = ctx;
    bus.on('building:added', ({ eid }) => this.add(eid, !ctx.loading));
    bus.on('building:removed', ({ eid }) => this.remove(eid, !ctx.loading));
    bus.on('city:reset', () => {
      for (const eid of [...this.entries.keys()]) this.remove(eid);
    });
    bus.on('stats:updated', () => this.syncService());
    // Levels (D-073): a new level's overlay grows in with a little fanfare; renovation clears the weathering.
    bus.on('building:tier', ({ eid, tier }) => {
      const entry = this.entries.get(eid);
      if (entry) this.setTier(entry, tier, ctx.loading ? -1 : 0, Greenery.value[eid]!);
    });
    bus.on('building:renovated', () => this.syncService());
    // Ruins collapse; a repair rebuilds (D-075).
    bus.on('building:ruined', ({ eid }) => {
      const entry = this.entries.get(eid);
      if (entry) this.collapse(entry, !ctx.loading);
    });
    bus.on('building:repaired', ({ eid, ruined }) => {
      if (ruined && this.entries.get(eid)?.collapsed) {
        this.remove(eid, false);
        this.add(eid, !ctx.loading);
      } else this.syncService();
    });
    // District transformation wave: overlays pop in by distance from the retrofit origin.
    bus.on('buildings:level', ({ eids, origin }) => {
      for (const eid of eids) {
        const entry = this.entries.get(eid);
        if (!entry) continue;
        if (Building.level[eid]) {
          const e = entry.base.elements;
          const dist = origin ? Math.hypot(e[12]! - origin.x, e[14]! - origin.z) : 0;
          // Re-grow the overlay so a banyan merge (level 2) adds its roots and crown.
          this.removeRetrofit(entry);
          this.addRetrofit(entry, ctx.loading ? -1 : dist * 0.09, Building.level[eid]!);
        } else this.removeRetrofit(entry);
      }
    });
    // Ground edits (land reclamation, scenario terraces) can lift a lot's corners after its building went up: re-seat
    // every building whose lot touches the changed corners, or it ends up sunk into its own ground.
    bus.on('terrain:changed', ({ x0, z0, x1, z1 }) => {
      for (const [eid, entry] of [...this.entries]) {
        const [x, z, w, d] = [Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!];
        if (x > x1 || z > z1 || x + w < x0 || z + d < z0) continue;
        const rec = ctx.city.buildingRecord(eid);
        const place = placeBuilding(ctx.city.grid, buildings.get(rec.def), rec.x, rec.z, rec.rot);
        if (Math.abs(place.base.elements[13]! - entry.base.elements[13]!) < 1e-3 && place.plinth.equals(entry.plinth)) continue;
        this.remove(eid);
        this.add(eid, false);
      }
    });
    // Bulk content (scenario) may exist before this renderer attaches.
    for (const eid of ctx.city.buildingEntities()) this.add(eid, false);
  }

  get count(): number {
    return this.entries.size;
  }

  // ── Interactive parts (D-132): render-only, so a door or a light switch never touches the sim or its hash ──
  /** Uids of buildings whose lights the steward switched off (kept across re-seats; saved by the interact module). */
  readonly dark = new Set<number>();
  private moving = new Set<Entry>();

  /** World centres of a building's door leaves, and whether its doors are open (or opening). */
  doorsOf(eid: number): { at: Vector3[]; open: boolean } | null {
    const entry = this.entries.get(eid);
    if (!entry?.doors.length || entry.collapsed) return null;
    const at = entry.doors.map((d) => new Vector3().setFromMatrixPosition(_m.multiplyMatrices(entry.base, d.p.local)));
    return { at, open: entry.openTo > 0 };
  }

  /** Is (any) door of the building open? The collider asks this to let the steward through. */
  doorOpen(eid: number): boolean {
    const entry = this.entries.get(eid);
    return !!entry && entry.open > 0.6;
  }

  setDoor(eid: number, open: boolean): void {
    const entry = this.entries.get(eid);
    if (!entry?.doors.length) return;
    entry.openTo = open ? 1 : 0;
    if (entry.open !== entry.openTo) this.moving.add(entry);
  }

  lightsOn(eid: number): boolean {
    return this.entries.get(eid)?.lightsOn ?? true;
  }

  /** Does switching this building's lights show anything (lamps or lit windows)? */
  hasLights(eid: number): boolean {
    const entry = this.entries.get(eid);
    return !!entry && !entry.collapsed && (entry.lamps.length > 0 || entry.glass.length > 0);
  }

  setLights(eid: number, on: boolean): void {
    const entry = this.entries.get(eid);
    if (!entry || entry.lightsOn === on) return;
    entry.lightsOn = on;
    const uid = Building.uid[eid]!;
    if (on) this.dark.delete(uid);
    else this.dark.add(uid);
    const { instancer } = this.ctx;
    for (const l of entry.lamps) instancer.setParam(l.h, 2, on ? l.glow : 0);
    for (const h of entry.glass) instancer.setParam(h, 3, on ? entry.power : 0);
  }

  /**
   * The building as it is drawn now (grown pieces, GLB parts and retrofit overlay; not its alert marker): world
   * matrices, tints and shader params read back from the instancer, for the inspector's 3D preview.
   */
  /**
   * A building type as the Build panel's preview stage draws it (D-069): variant 0, fully grown and lit, on its
   * plinth, standing at `at`. A GLB hero comes back empty until its model has loaded (the stage retries); if
   * the model fails, its procedural fallback stands in.
   */
  designParts(def: BuildingDef, at: Vector3): { piece: string; matrix: Matrix4; color: Color; params: number[] }[] {
    const base = new Matrix4().makeTranslation(at.x, at.y, at.z);
    const [fw, fd] = def.footprint;
    const out = [
      {
        piece: 'plinth',
        matrix: new Matrix4().multiplyMatrices(base, new Matrix4().compose(_v.set(0, -0.4, 0), _q.identity(), _s.set(fw * 0.98, 0.42, fd * 0.98))),
        color: new Color(0xffffff),
        params: [1, 0.5, 0, 1],
      },
    ];
    if (typeof def.recipe !== 'function') {
      const recipe = def.recipe;
      const glb = this.designGlbs.get(recipe.glb);
      if (glb === undefined) {
        this.designGlbs.set(recipe.glb, null);
        void this.ctx.assets.loadGlbPieces(recipe.glb).then(
          (parts) => this.designGlbs.set(recipe.glb, parts),
          () => this.designGlbs.set(recipe.glb, 'failed'),
        );
      }
      if (glb === undefined || glb === null) return [];
      if (glb !== 'failed') {
        const scaled = base.clone().scale(_s.setScalar(recipe.scale ?? 1));
        for (const part of glb)
          out.push({ piece: part.piece, matrix: new Matrix4().multiplyMatrices(scaled, part.matrix), color: new Color(0xffffff), params: [1, 0.5, 0.4, 1] });
        return out;
      }
      if (!recipe.fallback) return out;
    }
    const style = def.style ?? 'classic';
    for (const p of piecesAt(buildingTemplate(def, 0), 0)) {
      const styled = isStyled(p.piece);
      out.push({
        piece: p.piece,
        matrix: new Matrix4().multiplyMatrices(base, p.local),
        color: new Color(styled ? restyle(p.piece, p.tint, STYLES[style], 1) : p.tint),
        params: [1, styled ? styleIndex(style) + p.seed * 0.999 : p.seed, p.glow, 1],
      });
    }
    return out;
  }

  /** A building that has just been placed and is still rising (null once it appeared at once, or is unknown). */
  /** World heights a building is drawn between (its base and its current top, level included), for picking. */
  verticalExtent(eid: number): { y0: number; y1: number } | null {
    const entry = this.entries.get(eid);
    if (!entry) return null;
    const y0 = entry.base.elements[13]!;
    return { y0: y0 - 0.4, y1: y0 + (entry.collapsed ? Math.max(0.35, entry.height * 0.25) : entry.height) };
  }

  rising(eid: number): Rising | null {
    const entry = this.entries.get(eid);
    if (!entry?.rise) return null;
    const b = entry.template?.bounds ?? { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5, top: entry.height };
    return { base: entry.base, bounds: b, height: entry.height, seconds: entry.rise };
  }

  /** GLB parts for design previews: null while loading. */
  private designGlbs = new Map<string, Awaited<ReturnType<GameContext['assets']['loadGlbPieces']>> | null | 'failed'>();

  snapshot(eid: number): { piece: string; matrix: Matrix4; color: Color; params: number[] }[] {
    const entry = this.entries.get(eid);
    if (!entry) return [];
    const out: { piece: string; matrix: Matrix4; color: Color; params: number[] }[] = [];
    // Everything the lot shows now: base, retrofit, level additions (D-073) and rubble, at full size.
    for (const h of [...entry.handles, ...entry.retro, ...entry.tierH, ...entry.rubble]) {
      const b = h.batch;
      if (!b) continue;
      out.push({
        piece: b.piece.id,
        matrix: this.ctx.instancer.restMatrix(h, new Matrix4()),
        color: new Color().fromArray(b.mesh.instanceColor!.array as Float32Array, h.slot * 3),
        params: Array.from((b.params.array as Float32Array).subarray(h.slot * 4, h.slot * 4 + 4)),
      });
    }
    return out;
  }

  private add(eid: number, animate: boolean): void {
    const { city, instancer, assets } = this.ctx;
    const rec = city.buildingRecord(eid);
    const def = buildings.get(rec.def);
    const place = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
    const style = pickStyle(def, rec.x, rec.z);
    const entry: Entry = {
      handles: [],
      moss: [],
      glass: [],
      plants: [],
      vitality: 1,
      wild: 0,
      template: typeof def.recipe === 'function' || def.recipe.fallback ? place.template : null,
      retro: [],
      tierH: [],
      tierP: [],
      walls: [],
      skins: [],
      rubble: [],
      collapsed: false,
      weather: 0,
      pending: [],
      base: place.base,
      plinth: place.plinth,
      height: place.template.height,
      lastGreenery: rec.greenery,
      power: 1,
      style: STYLES[style],
      styleIndex: styleIndex(style),
      shade: 0.93 + hash2(rec.x, rec.z, 4259) * 0.12,
      problems: 0,
      alert: null,
      rise: 0,
      doors: [],
      open: 0,
      openTo: 0,
      lamps: [],
      lightsOn: !this.dark.has(Building.uid[eid]!),
    };
    this.entries.set(eid, entry);
    _params.set([rec.greenery, 0.5, 0, 1]);
    entry.handles.push(instancer.addMatrix('plinth', place.plinth, _c.setHex(0xffffff), _params, animate ? 0 : -1));

    const spawnTemplate = () => {
      for (const p of place.template.pieces) {
        if (p.growAt <= rec.greenery) {
          const delay = animate ? p.y * RISE_PER_UNIT + Math.random() * 0.08 : -1;
          this.spawn(entry, p, rec.greenery, delay);
          entry.rise = Math.max(entry.rise, delay + PIECE_GROW);
        } else entry.pending.push(p);
      }
      entry.pending.sort((a, b) => a.growAt - b.growAt);
    };

    if (typeof def.recipe !== 'function') {
      // Hero model: GLB parts become instanced pieces; the procedural fallback stands in if the
      // file is missing or fails to load (the game must work without optional assets).
      const recipe = def.recipe;
      void assets.loadGlbPieces(recipe.glb).then(
        (parts) => {
          if (this.entries.get(eid) !== entry) return;
          const scaled = _m.copy(place.base).scale(_s.setScalar(recipe.scale ?? 1)).clone();
          for (const part of parts) {
            _params.set([1, 0.5, 0.4, 1]);
            const world = new Matrix4().multiplyMatrices(scaled, part.matrix);
            entry.handles.push(instancer.addMatrix(part.piece, world, _c.setHex(0xffffff), _params, animate ? 0 : -1, 1.2));
          }
          if (animate) entry.rise = Math.max(entry.rise, 1.2);
          this.ctx.services.tryGet('world')?.atmosphere.invalidateShadows();
        },
        () => {
          if (this.entries.get(eid) === entry && recipe.fallback) spawnTemplate();
        },
      );
    } else spawnTemplate();
    // Front steps up to a door that stands above the street (D-132).
    _params.set([1, 0.5, 0, 1]);
    for (const m of doorSteps(city.grid, def, place)) entry.handles.push(instancer.addMatrix('slab', m, _c.setHex(0xd8cfbf), _params, animate ? 0.2 : -1));
    if (Building.level[eid]) this.addRetrofit(entry, animate ? 0.3 : -1, Building.level[eid]!);
    if (Building.tier[eid] || entry.template?.ranged.length) this.setTier(entry, Building.tier[eid]!, animate ? 0.5 : -1, rec.greenery);
    if (city.steward.ruins.includes(Building.uid[eid]!)) this.collapse(entry, false);
  }

  /**
   * A ruin (D-075): everything above the ground floor folds away (animated when it happens in play) and charred
   * rubble lies on the lot. Repair rebuilds the building from its template (see `building:repaired`).
   */
  private collapse(entry: Entry, animate: boolean): void {
    if (entry.collapsed) return;
    entry.collapsed = true;
    const { instancer } = this.ctx;
    const base = entry.base.elements[13]!;
    const cut = base + Math.max(0.35, entry.height * 0.25);
    const keep = (list: InstanceHandle[]) =>
      list.filter((h) => {
        const y = h.batch ? (h.batch.mesh.instanceMatrix.array as Float32Array)[h.slot * 16 + 13]! : 0;
        if (y <= cut) return true;
        if (animate) instancer.removeAnimated(h, (y - cut) * 0.08 + Math.random() * 0.2, 0.5);
        else instancer.remove(h);
        return false;
      });
    entry.handles = keep(entry.handles);
    for (const h of [...entry.retro, ...entry.tierH]) {
      if (animate) instancer.removeAnimated(h, 0.2, 0.4);
      else instancer.remove(h);
    }
    entry.retro = [];
    entry.tierH = [];
    entry.tierP = [];
    const live = new Set(entry.handles);
    this.forget(entry, (h) => !live.has(h));
    const t = entry.template;
    const b = t?.bounds ?? { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5, top: 0.5 };
    const rng = new Rng(Math.floor(base * 1000 + b.maxX * 77) >>> 0);
    for (let i = 0; i < 9; i++) {
      const s = 0.25 + rng.next() * 0.35;
      _q.setFromEuler(_e.set(rng.next() * 0.8, rng.next() * 6.28, rng.next() * 0.8));
      const local = _m.compose(_v.set(b.minX + rng.next() * (b.maxX - b.minX), 0.05, b.minZ + rng.next() * (b.maxZ - b.minZ)), _q, _s.set(s, s * 0.45, s * 0.8));
      const world = new Matrix4().multiplyMatrices(entry.base, local);
      entry.rubble.push(instancer.addMatrix(i % 3 ? 'slab' : 'concreteCyl', world, _c.setHex(i % 2 ? 0x5e5650 : 0x7a7068), [1, 0.5, 0, 0.05], animate ? 0.3 + rng.next() * 0.3 : -1, 0.4));
    }
  }

  /**
   * Shows a building's level (D-073, D-100): pieces the new level drops fold away, its new pieces grow in from the
   * roof (`delay` < 0 = instant) and pieces both levels share stay put. Level pieces take the building's finish,
   * lit windows, weathering and wilting like its base.
   */
  private setTier(entry: Entry, tier: number, delay: number, greenery: number): void {
    const want = entry.template && !entry.collapsed ? tierPieces(entry.template, tier) : [];
    const keep = new Set(want);
    const handles: InstanceHandle[] = [];
    const pieces: TemplatePiece[] = [];
    const gone = new Set<InstanceHandle>();
    entry.tierP.forEach((p, i) => {
      const h = entry.tierH[i]!;
      if (keep.has(p)) {
        handles.push(h);
        pieces.push(p);
        keep.delete(p);
      } else {
        gone.add(h);
        this.ctx.instancer.removeAnimated(h, 0, 0.3);
      }
    });
    if (gone.size) this.forget(entry, (h) => gone.has(h));
    entry.tierH = handles;
    entry.tierP = pieces;
    if (entry.template) entry.height = heightAt(entry.template, tier);
    for (const p of keep) {
      const d = delay < 0 ? -1 : delay + Math.max(0, p.y - entry.height * 0.6) * 0.12 + Math.random() * 0.3;
      entry.tierH.push(this.spawn(entry, p, greenery, d, false));
      entry.tierP.push(p);
    }
  }

  /** Drops handles from the per-material lists that live service updates write to. */
  private forget(entry: Entry, drop: (h: InstanceHandle) => boolean): void {
    entry.glass = entry.glass.filter((h) => !drop(h));
    entry.walls = entry.walls.filter((h) => !drop(h));
    entry.skins = entry.skins.filter((h) => !drop(h));
    entry.plants = entry.plants.filter((h) => !drop(h));
    entry.moss = entry.moss.filter((h) => !drop(h));
    entry.doors = entry.doors.filter((d) => !drop(d.h));
    entry.lamps = entry.lamps.filter((l) => !drop(l.h));
  }

  /** Adds the retrofit (and, at level 2, banyan) overlay; `delay` < 0 = instant, else pop-in bottom-up. */
  private addRetrofit(entry: Entry, delay: number, level = 1): void {
    if (!entry.template || entry.retro.length) return;
    const pieces = level >= 2 ? [...retrofitPieces(entry.template), ...banyanPieces(entry.template)] : retrofitPieces(entry.template);
    for (const p of pieces) {
      _params.set([1, p.seed, p.glow, 1]);
      const world = _m.multiplyMatrices(entry.base, p.local);
      const d = delay < 0 ? -1 : delay + p.y * 0.25 + Math.random() * 0.25;
      entry.retro.push(this.ctx.instancer.addMatrix(p.piece, world, _c.setHex(p.tint), _params, d, 0.8));
    }
  }

  private removeRetrofit(entry: Entry): void {
    for (const h of entry.retro) this.ctx.instancer.remove(h);
    entry.retro = [];
  }

  private spawn(entry: Entry, p: TemplatePiece, greenery: number, delay: number, base = true): InstanceHandle {
    _params[0] = greenery;
    const styled = isStyled(p.piece);
    // Styled pieces carry the style index in the seed's integer part (the shaders split it off).
    _params[1] = styled ? entry.styleIndex + p.seed * 0.999 : p.seed;
    const lamp = p.glow > 0 && (!PLANT_PIECES.has(p.piece) || p.piece === 'fungus');
    _params[2] = lamp && !entry.lightsOn ? 0 : p.glow;
    const glass = p.piece === 'glassBox' || p.piece === 'glassCyl';
    const plant = PLANT_PIECES.has(p.piece);
    _params[3] = glass ? (entry.lightsOn ? entry.power : 0) : plant ? entry.vitality : 1;
    const skin = glass || p.piece === 'timberBox';
    if (skin) _params[0] = 1 - entry.weather;
    const world = _m.multiplyMatrices(entry.base, p.local);
    if (p.door && entry.open > 0) world.multiply(_m2.makeTranslation(p.door * entry.open, 0, 0));
    const tint = styled ? restyle(p.piece, p.tint, entry.style, entry.shade) : p.tint;
    const h = this.ctx.instancer.addMatrix(p.piece, world, _c.setHex(tint), _params, delay, PIECE_GROW);
    if (base) entry.handles.push(h);
    if (p.door) entry.doors.push({ h, p });
    if (lamp) entry.lamps.push({ h, glow: p.glow });
    if (p.piece === 'mossBox') entry.moss.push(h);
    if (p.piece === 'slab' || p.piece === 'concreteCyl') entry.walls.push(h);
    if (skin) entry.skins.push(h);
    if (glass) entry.glass.push(h);
    else if (plant) entry.plants.push(h);
    return h;
  }

  /**
   * Takes a building's pieces off the map. Animated (a demolition): the pieces fold away from the top down, the
   * plinth last, and a few wild plants sprout on the bare lot, then fade back into the meadow.
   */
  private remove(eid: number, animate = false): void {
    const entry = this.entries.get(eid);
    if (!entry) return;
    this.moving.delete(entry);
    const { instancer } = this.ctx;
    if (entry.alert) instancer.remove(entry.alert);
    for (const h of entry.rubble) instancer.remove(h);
    entry.rubble = [];
    if (!animate) {
      for (const h of [...entry.handles, ...entry.tierH]) instancer.remove(h);
      this.removeRetrofit(entry);
      this.entries.delete(eid);
      return;
    }
    const parts = [...entry.handles, ...entry.retro, ...entry.tierH];
    const ys = parts.map((h) => (h.batch ? (h.batch.mesh.instanceMatrix.array as Float32Array)[h.slot * 16 + 13]! : 0));
    const base = entry.base.elements[13]!;
    const top = Math.max(base + 0.5, ...ys);
    parts.forEach((h, i) => instancer.removeAnimated(h, ((top - ys[i]!) / (top - base)) * 0.4 + Math.random() * 0.06, 0.4));
    entry.handles = [];
    entry.retro = [];
    entry.tierH = [];
    entry.tierP = [];
    this.entries.delete(eid);
    this.sprout(entry.base, Building.w[eid]!, Building.d[eid]!);
  }

  /** Wild plants that grow on a cleared lot and fade back into the meadow (render only). */
  private sprout(base: Matrix4, w: number, d: number): void {
    const { instancer } = this.ctx;
    const n = Math.min(16, Math.max(4, Math.round(w * d * 0.7)));
    const tints = PALETTE.blossoms;
    for (let i = 0; i < n; i++) {
      const piece = i % 4 === 0 ? 'bush' : i % 2 ? 'grass' : 'flower';
      const s = piece === 'bush' ? 0.35 + Math.random() * 0.2 : piece === 'grass' ? 0.4 : 0.12;
      _q.setFromEuler(_e.set(0, Math.random() * 6.28, 0));
      const local = _m.compose(_v.set((Math.random() - 0.5) * w * 0.8, 0, (Math.random() - 0.5) * d * 0.8), _q, _s.setScalar(s));
      const world = new Matrix4().multiplyMatrices(base, local);
      const tint = piece === 'flower' ? tints[i % tints.length]! : piece === 'bush' ? PALETTE.leaves[i % PALETTE.leaves.length]! : 0x8fd35a;
      const delay = 0.3 + Math.random() * 0.3;
      const h = instancer.addMatrix(piece, world, _c.setHex(tint), [1, Math.random(), piece === 'flower' ? 0.6 : 0, 1], delay, 0.5);
      instancer.removeAnimated(h, delay + 2.2 + Math.random() * 0.8, 0.6);
    }
  }

  /**
   * Once per pulse: windows light with power and occupancy, plants wilt without water (or when
   * a home is all but abandoned), and problem markers appear.
   */
  private syncService(): void {
    const { instancer, city } = this.ctx;
    for (const [eid, entry] of this.entries) {
      const st = city.buildingDef(eid).stats;
      const occ = Service.occupancy[eid]!;
      const occupied = st.population > 0 || st.jobs > 0 ? 0.2 + 0.8 * occ : 1;
      const cond = Service.condition[eid]!;
      // Weathering (D-073): walls grime with age and wear; renovation washes it off. Char from fire and lightning
      // (D-075) takes the top of the same channel (0.7..1: soot), so it needs no attribute of its own.
      const scorch = Service.scorch[eid]!;
      const weather = Math.max(Math.min(0.7, (Service.age[eid]! / (20 * DAY_LENGTH)) * 0.55 + (1 - cond) * 0.35), scorch > 0.02 ? 0.7 + 0.3 * scorch : 0);
      if (Math.abs(weather - entry.weather) > 0.04) {
        entry.weather = weather;
        for (const h of entry.walls) instancer.setParam(h, 3, 1 - weather);
        for (const h of entry.skins) instancer.setParam(h, 0, 1 - weather);
      }
      const power = Service.power[eid]! * occupied * (0.3 + 0.7 * cond);
      if (Math.abs(power - entry.power) > 0.03) {
        entry.power = power;
        if (entry.lightsOn) for (const h of entry.glass) instancer.setParam(h, 3, power);
      }
      // Nature reclaims worn-down buildings: moss spreads over every surface.
      const wild = cond < 0.6 ? (0.6 - cond) / 0.6 : 0;
      if (Math.abs(wild - entry.wild) > 0.05) {
        entry.wild = wild;
        const g = Math.min(1.4, Greenery.value[eid]! + wild);
        for (const h of entry.moss) instancer.setParam(h, 0, g);
      }
      const abandoned = st.population > 0 && occ < 0.2 ? 0.55 : 1;
      // Plants wilt with dry taps and with parched soil (Flora-Net hydration below ~0.35).
      const vitality = (st.water < 0 ? Service.water[eid]! : 1) * abandoned * Math.min(1, 0.35 + Service.soil[eid]! * 1.9);
      if (Math.abs(vitality - entry.vitality) > 0.04) {
        entry.vitality = vitality;
        for (const h of entry.plants) instancer.setParam(h, 3, vitality);
      }
      const problems = Service.problems[eid]!;
      if (problems === entry.problems) continue;
      entry.problems = problems;
      if (entry.alert) {
        instancer.remove(entry.alert);
        entry.alert = null;
      }
      const hit = ALERT_COLORS.find(([bit]) => problems & bit);
      if (!hit) continue;
      _params.set([0, (eid % 97) / 97, 1, 1]);
      const e = entry.base.elements;
      const world = _m.compose(_v.set(e[12]!, e[13]! + entry.height + 0.8, e[14]!), _q.identity(), _s.setScalar(0.6));
      entry.alert = instancer.addMatrix('alert', world, _c.setHex(hit[1]), _params, 0, 0.4);
    }
  }

  /** Per-frame: stage plant growth and feed live greenery to membrane shaders. */
  update(dt: number): void {
    // Doors slide every frame while they move (D-132); only the few moving leaves are re-written.
    for (const entry of this.moving) {
      const step = dt * 2.5;
      entry.open = entry.openTo > entry.open ? Math.min(entry.openTo, entry.open + step) : Math.max(entry.openTo, entry.open - step);
      const k = entry.open * entry.open * (3 - 2 * entry.open);
      for (const d of entry.doors) {
        _m.multiplyMatrices(entry.base, d.p.local).multiply(_m2.makeTranslation(d.p.door! * k, 0, 0));
        this.ctx.instancer.setMatrix(d.h, _m);
      }
      if (entry.open === entry.openTo) this.moving.delete(entry);
    }
    // Greenery changes slowly (~1%/s), so check at 2 Hz and only re-upload moss coverage once it
    // has visibly moved: every param write is GPU upload traffic.
    this.mossTimer += dt;
    if (this.mossTimer < 0.5) return;
    this.mossTimer = 0;
    for (const [eid, entry] of this.entries) {
      const g = Greenery.value[eid]!;
      let spawned = 0;
      while (entry.pending.length && entry.pending[0]!.growAt <= g) {
        this.spawn(entry, entry.pending.shift()!, g, spawned++ * 0.04);
      }
      if (Math.abs(g - entry.lastGreenery) >= 0.03 || (g >= 1 && entry.lastGreenery < 1)) {
        entry.lastGreenery = g;
        for (const h of entry.moss) this.ctx.instancer.setParam(h, 0, Math.min(1.4, g + entry.wild));
      }
    }
  }
}
