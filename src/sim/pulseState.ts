/**
 * City Pulse state: everything the management layer tracks beyond raw entities.
 * Plain data so it serializes directly into saves.
 */
export const TIERS = ['Thriving', 'Stable', 'Strained', 'Critical', 'Collapse'] as const;
export type Tier = 0 | 1 | 2 | 3 | 4;

export const SYSTEMS = ['energy', 'water', 'food', 'jobs', 'ecology', 'harmony', 'budget'] as const;
export type SystemKey = (typeof SYSTEMS)[number];

export const HISTORY_METRICS = ['population', 'credits', 'happiness', 'energyBalance', 'waterBalance', 'eco', 'net'] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];
export const HISTORY_LENGTH = 240; // samples (one per 10 sim seconds = 40 sim minutes)

export interface HarmonyBreakdown {
  base: number;
  ecology: number;
  services: number;
  jobs: number;
  food: number;
  taxes: number;
  amenities: number;
}

export interface PulseState {
  taxRate: number;
  tiers: Record<SystemKey, Tier>;
  /** False until the first pulse has computed tiers (suppresses spurious alerts). */
  primed: boolean;
  history: Record<HistoryMetric, number[]>;
  harmony: HarmonyBreakdown;
  /** Global ratios from the last pulse (0..1+). */
  energyRatio: number;
  waterRatio: number;
  foodRatio: number;
  unemployment: number;
}

export const TAX_MIN = 0.04;
export const TAX_MAX = 0.25;
export const TAX_DEFAULT = 0.12;

export function createPulseState(): PulseState {
  return {
    taxRate: TAX_DEFAULT,
    tiers: { energy: 1, water: 1, food: 1, jobs: 1, ecology: 1, harmony: 1, budget: 1 },
    primed: false,
    history: Object.fromEntries(HISTORY_METRICS.map((m) => [m, []])) as unknown as Record<HistoryMetric, number[]>,
    harmony: { base: 55, ecology: 0, services: 0, jobs: 0, food: 0, taxes: 0, amenities: 0 },
    energyRatio: 1,
    waterRatio: 1,
    foodRatio: 1,
    unemployment: 0,
  };
}

/** Maps a "higher is better" ratio onto a tier using ascending thresholds [collapse, critical, strained, stable]. */
export function tierFromRatio(v: number, t: [number, number, number, number]): Tier {
  if (v < t[0]) return 4;
  if (v < t[1]) return 3;
  if (v < t[2]) return 2;
  if (v < t[3]) return 1;
  return 0;
}
