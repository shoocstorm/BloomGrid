import type { PodRoute } from './mobility';

/**
 * City Pulse state: everything the management layer tracks beyond raw entities.
 * Plain data so it serializes directly into saves.
 */
export const TIERS = ['Thriving', 'Stable', 'Strained', 'Critical', 'Collapse'] as const;
export type Tier = 0 | 1 | 2 | 3 | 4;

export const SYSTEMS = ['energy', 'water', 'food', 'jobs', 'mobility', 'ecology', 'harmony', 'budget'] as const;
export type SystemKey = (typeof SYSTEMS)[number];

export const HISTORY_METRICS = ['population', 'credits', 'happiness', 'energyBalance', 'waterBalance', 'eco', 'net', 'bloom'] as const;
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
  /** Active crises (heatwave, monsoon…). */
  crises: number;
  /** City-wide bloom (pollinated, flowering districts delight residents). */
  bloom: number;
  /** Congested commutes (see `sim/mobility.ts`). */
  traffic: number;
}

/** Per highway-network utility totals from the last pulse (index = network id). Not saved. */
export interface NetworkStats {
  buildings: number;
  energyProduced: number;
  energyUsed: number;
  waterProduced: number;
  waterUsed: number;
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
  networks: NetworkStats[];
  /** Mean building greenery (heatwave resilience). */
  avgGreenery: number;
  /** Mean pollution on coastal tiles (algal bloom likelihood). */
  coastalPollution: number;
  /** Mean bloom over land (0..1) and share of generation that is clean. */
  bloomIndex: number;
  cleanShare: number;
  /** Mean pedestrian activity over the built city (0..1), see `sim/nightlife.ts`. */
  nightlife: number;
  /** Mobility (derived on the mobility pulse phase): flow quality 0..1 (1 = free-flowing). */
  flow: number;
  /** Commuters per pulse, how many ride pods, and mean highway trip length in tiles. */
  commuters: number;
  podRiders: number;
  avgCommute: number;
  /** Sky-lanes flown by commuter pods (for rendering). */
  podRoutes: PodRoute[];
  /** Last season index (emits `season:changed`). */
  season: number;
  /** Pulses since start (drives field recompute cadence). */
  count: number;
}

export const TAX_MIN = 0.04;
export const TAX_MAX = 0.25;
export const TAX_DEFAULT = 0.12;

export function createPulseState(): PulseState {
  return {
    taxRate: TAX_DEFAULT,
    tiers: { energy: 1, water: 1, food: 1, jobs: 1, mobility: 1, ecology: 1, harmony: 1, budget: 1 },
    primed: false,
    history: Object.fromEntries(HISTORY_METRICS.map((m) => [m, []])) as unknown as Record<HistoryMetric, number[]>,
    harmony: { base: 55, ecology: 0, services: 0, jobs: 0, food: 0, taxes: 0, amenities: 0, crises: 0, bloom: 0, traffic: 0 },
    energyRatio: 1,
    waterRatio: 1,
    foodRatio: 1,
    unemployment: 0,
    networks: [],
    avgGreenery: 0.5,
    coastalPollution: 0,
    bloomIndex: 0.4,
    nightlife: 0,
    flow: 1,
    commuters: 0,
    podRiders: 0,
    avgCommute: 0,
    podRoutes: [],
    cleanShare: 1,
    season: -1,
    count: 0,
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
