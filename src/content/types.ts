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
  | 'pod'
  | 'timberBox'
  | 'willowArch'
  | 'drone'
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

export type BuildingCategory = 'residential' | 'energy' | 'utility' | 'tech' | 'commercial' | 'nature' | 'food';

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
  /** Positive = supplies water, negative = consumes (units/s at full occupancy). */
  water: number;
  /** Residents fed by this building's produce. */
  food: number;
  /** Credits per sim second. */
  upkeep: number;
}

/** Stats as authored: utility values default to 0, upkeep to 0.03% of cost per second. */
export type BuildingStatsInput = Omit<BuildingStats, 'water' | 'food' | 'upkeep'> & Partial<Pick<BuildingStats, 'water' | 'food' | 'upkeep'>>;

export interface PlacementRules {
  /** Footprint must touch sea, river or reservoir water (intakes, harbours). */
  nearWater?: boolean;
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
  placement?: PlacementRules;
  /** Built for the waterfront (raised intakes): ignores floods. */
  floodproof?: boolean;
  /** Pollen output (pollinator habitat) feeding the bloom field. Lush buildings add a little anyway. */
  pollinators?: number;
  /** Clean generation (counts toward the clean-energy share that boosts bloom). */
  cleanEnergy?: boolean;
  /** Symbiotic pairing: with a partner nearby, pollution is purified and output rises. */
  symbiosis?: Symbiosis;
  /** Transit hub (Pod Dock): carries up to `riders` commuters from homes within `radius` tiles by air. */
  transit?: { radius: number; riders: number };
  /** Flora-Net Drone Hive: hummingbird drones pollinate, harvest, trim and mist within `radius` tiles. */
  drones?: { radius: number; count: number };
  /** Coastal defence (Mangrove Seawall): keeps flood water up to `height` out within `radius` tiles. */
  defence?: { radius: number; height: number };
  /** The city's signature landmark: the opening camera flies to the largest one. */
  landmark?: boolean;
  /** A tower the Green Weaver can bridge to other towers or merge with a banyan. */
  tower?: boolean;
  /** Number of procedural variants (recipe runs cached per variant). Default 3. */
  variants?: number;
  /**
   * Architectural finish (walls, window pattern, frames, timber). Unset: heroes (`variants: 1`) stay
   * `classic`; everyday buildings pick one per lot from their district's family of styles.
   */
  style?: StyleId;
  /**
   * Procedural recipe, or a GLB hero model. A GLB recipe's `fallback` provides the building's
   * volume (bounds, collision, retrofit overlays) and is drawn while the GLB is missing.
   */
  recipe: ((b: KitBuilder) => void) | { glb: string; scale?: number; fallback?: (b: KitBuilder) => void };
}

/** Building finishes; the render side (`render/materials/styles.ts`) defines how each looks. */
export const STYLE_IDS = [
  'classic',
  'terracotta',
  'whitewash',
  'rammed-earth',
  'verdigris',
  'mosaic',
  'charred-timber',
  'limestone',
  'bamboo',
  'rose',
  'sage',
  'indigo',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface Symbiosis {
  /** Partner building ids (any one within `radius` tiles counts). */
  partners: string[];
  radius: number;
  pollutionMul: number;
  outputMul: number;
  /** Short phrase for the inspector, e.g. "reed beds purify its effluent". */
  label: string;
}

export type BuildingDefInput = Omit<BuildingDef, 'stats'> & { stats: BuildingStatsInput };

export const defineBuilding = (def: BuildingDefInput): BuildingDef => ({
  ...def,
  stats: { water: 0, food: 0, upkeep: def.stats.cost * 0.0003, ...def.stats },
});

/**
 * Scenarios describe a starting city. They run once at new-game time through a sim-implemented
 * builder (deterministic), so the bulk content exists before any renderer attaches.
 */
export interface ScenarioBuilder {
  readonly size: number;
  rand(): number;
  /** Living Highway along an L-path; water tiles on the path become bridges when `bridges` is true. */
  road(x0: number, z0: number, x1: number, z1: number, bridges?: boolean): void;
  /** Tries to place a building; returns false if invalid. */
  building(def: string, x: number, z: number, rot?: number): boolean;
  /** Fills free road-adjacent land in a rectangle using weighted building picks. Returns count. */
  fill(x0: number, z0: number, x1: number, z1: number, weights: Record<string, number>, density?: number, limit?: number): number;
  isLand(x: number, z: number): boolean;
  /** Ground height at tile corner (x, z). */
  height(x: number, z: number): number;
  /** A building's footprint [w, d] in tiles at rotation `rot`. */
  footprint(def: string, rot?: number): [number, number];
  /**
   * Levels the tiles x0..x1 × z0..z1 (inclusive) to `height` (default: their mean ground height),
   * feathering back into the terrain over `margin` tiles (never over earlier edits). Water is never filled. Saved as terrain edits. Returns the height used.
   */
  level(x0: number, z0: number, x1: number, z1: number, margin?: number, height?: number): number;
  /** Running utility totals of everything placed so far (at full occupancy). */
  totals(): { energyProduced: number; energyUsed: number; waterProduced: number; waterUsed: number; food: number; population: number; jobs: number };
}

export interface ScenarioDef {
  id: string;
  name: string;
  description: string;
  credits: number;
  build(b: ScenarioBuilder): void;
}

export const defineScenario = (def: ScenarioDef): ScenarioDef => def;

export const CATEGORY_ICONS: Record<BuildingCategory, string> = {
  residential: '⌂',
  energy: '☀',
  utility: '◍',
  tech: '⚗',
  commercial: '❖',
  nature: '❀',
  food: '✾',
};

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  residential: 'Living',
  energy: 'Energy',
  utility: 'Water',
  tech: 'Tech',
  commercial: 'Work',
  nature: 'Nature',
  food: 'Food',
};
