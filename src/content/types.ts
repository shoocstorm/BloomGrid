/**
 * Content definitions are plain data + pure functions (no three.js). Renderers interpret the
 * `recipe`; the simulation only reads `stats`. Add a file under `content/buildings/` and it is
 * discovered automatically.
 */
export type Vec3 = [number, number, number];

/** Piece ids are registered by the renderer's kit (see `assets/kit/pieces.ts`). */
export type PieceId =
  | 'slab'
  | 'plinth'
  | 'glassBox'
  | 'glassCyl'
  | 'concreteCyl'
  | 'mossBox'
  | 'ivy'
  | 'solarLeaf'
  | 'trunk'
  | 'canopy'
  | 'bush'
  | 'flower'
  | 'fungus'
  | 'grass'
  | 'dome'
  | 'pool'
  | 'algaeTank'
  | (string & {});

export interface PieceSpec {
  piece: PieceId;
  /** Local position in tiles; origin is footprint center at ground level. */
  p?: Vec3;
  /** Scale (uniform number or per-axis). */
  s?: number | Vec3;
  /** Yaw in radians. */
  r?: number;
  /** Optional pitch / roll for leaves and petals. */
  rx?: number;
  rz?: number;
  /** Hex tint multiplied into the material. */
  tint?: number;
  /** Bioluminescent glow strength at night, 0..1. */
  glow?: number;
  /** Building greenery level (0..1) at which this piece grows in. 0 = present on placement. */
  growAt?: number;
}

export interface KitBuilder {
  /** Footprint in tiles (already rotated into local space: w along x, d along z). */
  readonly w: number;
  readonly d: number;
  rand(): number;
  range(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
  add(spec: PieceSpec): void;
}

export type BuildingCategory = 'residential' | 'energy' | 'tech' | 'commercial' | 'nature' | 'food';

export interface BuildingStats {
  cost: number;
  /** Positive = produces, negative = consumes (kW-ish units). */
  energy: number;
  /** Ecological contribution at full greenery. */
  eco: number;
  happiness: number;
  population: number;
  jobs: number;
  pollution: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  footprint: [number, number];
  stats: BuildingStats;
  /** Sim seconds to reach full greenery. */
  growthTime: number;
  /** Procedural recipe, or a GLB asset path for hero models. */
  recipe: ((b: KitBuilder) => void) | { glb: string; scale?: number };
}

export const defineBuilding = (def: BuildingDef): BuildingDef => def;

export const CATEGORY_ICONS: Record<BuildingCategory, string> = {
  residential: '⌂',
  energy: '☀',
  tech: '⚗',
  commercial: '❖',
  nature: '❀',
  food: '✾',
};

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  residential: 'Living',
  energy: 'Energy',
  tech: 'Tech',
  commercial: 'Work',
  nature: 'Nature',
  food: 'Food',
};
