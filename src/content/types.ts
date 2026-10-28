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

export type BuildingCategory = 'residential' | 'energy' | 'utility' | 'tech' | 'commercial' | 'industry' | 'sports' | 'nature' | 'food';

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
  transit?: { radius: number; riders: number; /** A rail station: riders board trains, not sky-lane pods. */ rail?: boolean };
  /** Flora-Net Drone Hive: hummingbird drones pollinate, harvest, trim and mist within `radius` tiles. */
  drones?: { radius: number; count: number };
  /** Coastal defence (Mangrove Seawall): keeps flood water up to `height` out within `radius` tiles. */
  defence?: { radius: number; height: number };
  /** The city's signature landmark: the opening camera flies to the largest one. */
  landmark?: boolean;
  /** A tower the Green Weaver can bridge to other towers or merge with a banyan. */
  tower?: boolean;
  /** Emergency services (D-050): fires within `radius` tiles are fought automatically while it is powered and staffed. */
  response?: { radius: number };
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
/**
 * What a named area is for (D-049): the founding city is planned in zones so homes, jobs, factories, fun and
 * sport each have their place. Shown on the city map and in the inspector.
 */
export type ZoneKind = 'living' | 'work' | 'industry' | 'leisure' | 'sports' | 'utility' | 'civic' | 'parks';

export const ZONES: Record<ZoneKind, { label: string; icon: string; color: number; note: string }> = {
  living: { label: 'Living', icon: '⌂', color: 0x7fd68a, note: 'Homes, pocket parks and pod docks' },
  work: { label: 'Work', icon: '❖', color: 0x6aa8ff, note: 'Offices, studios and work domes' },
  industry: { label: 'Industry', icon: '⚙', color: 0xf09a4a, note: 'Factories, kept apart from homes' },
  leisure: { label: 'Entertainment', icon: '✦', color: 0xff7ac8, note: 'Venues, culture and nightlife' },
  sports: { label: 'Sports', icon: '✪', color: 0xffd34d, note: 'Stadium, pools, tracks and fields' },
  utility: { label: 'Utility', icon: '◍', color: 0x5ff2da, note: 'Power, water and farms' },
  civic: { label: 'Civic', icon: '◇', color: 0xc9b6ff, note: 'Landmarks at the city’s heart' },
  parks: { label: 'Parkland', icon: '❀', color: 0x3fbf6a, note: 'Gardens and green landmarks' },
};

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
  /** Names the tile rectangle x0..x1 × z0..z1 (inclusive): a town, quarter or park, with what it is for. Earlier names win where areas overlap. */
  nameArea(name: string, x0: number, z0: number, x1: number, z1: number, zone?: ZoneKind): void;
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
  industry: '⚙',
  sports: '✪',
  nature: '❀',
  food: '✾',
};

/** Prefixes of readable building ids (`LIV-0042`), one per category. */
export const CATEGORY_CODES: Record<BuildingCategory, string> = {
  residential: 'LIV',
  energy: 'NRG',
  utility: 'UTL',
  tech: 'TEC',
  commercial: 'WRK',
  industry: 'IND',
  sports: 'SPT',
  nature: 'NAT',
  food: 'FOD',
};

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  residential: 'Living',
  energy: 'Energy',
  utility: 'Water',
  tech: 'Tech',
  commercial: 'Work',
  nature: 'Nature',
  food: 'Food',
  // Last, so the older categories keep their hotkeys (4–9, 0); these two are click-only in the toolbar.
  industry: 'Industry',
  sports: 'Sports',
};
