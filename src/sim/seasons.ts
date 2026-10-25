import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';

/**
 * The island's year: four engineered bloom seasons, each two sim days long. Seasons scale
 * bloom, food and water and shift which crises are likely; visuals tint flowers and canopies.
 */
export interface Season {
  id: 'bloom' | 'monsoon' | 'harvest' | 'haze';
  name: string;
  icon: string;
  description: string;
  bloom: number;
  foodMul: number;
  waterMul: number;
  /** Soil evaporation multiplier (Flora-Net hydration). */
  evaporation: number;
  /** Multipliers on crisis likelihood by crisis id. */
  crisis: Partial<Record<string, number>>;
  /** Flower / canopy tint and strength for the season's look. */
  tint: number;
  tintAmount: number;
}

export const SEASONS: Season[] = [
  { id: 'bloom', name: 'Bloom', icon: '🌸', description: 'Flowers open everywhere; pollen runs high.', bloom: 1.15, foodMul: 1, waterMul: 1, evaporation: 1, crisis: { heatwave: 0.6 }, tint: 0xffb7d5, tintAmount: 0 },
  { id: 'monsoon', name: 'Monsoon', icon: '🌧', description: 'Rains fill reservoirs; floods and king tides are likely.', bloom: 0.95, foodMul: 1, waterMul: 1.15, evaporation: 0.55, crisis: { monsoon: 3, 'king-tide': 1.6, heatwave: 0.3 }, tint: 0x8fd8ff, tintAmount: 0.18 },
  { id: 'harvest', name: 'Harvest', icon: '🍊', description: 'Orchards ripen: food output rises; blight spreads more easily.', bloom: 0.9, foodMul: 1.25, waterMul: 1, evaporation: 1.15, crisis: { blight: 1.8 }, tint: 0xffb347, tintAmount: 0.35 },
  { id: 'haze', name: 'Haze', icon: '🌫', description: 'Dry, hot weeks: heatwaves and algal blooms; bloom fades.', bloom: 0.75, foodMul: 0.95, waterMul: 0.9, evaporation: 1.7, crisis: { heatwave: 2.5, 'algal-bloom': 2, monsoon: 0.3 }, tint: 0xd9c9a0, tintAmount: 0.3 },
];

export const SEASON_SECONDS = DAY_LENGTH * 2;
export const SEASON_TICKS = SEASON_SECONDS * PULSE_TICKS;

export function seasonIndex(tick: number): number {
  return Math.floor(tick / SEASON_TICKS) % SEASONS.length;
}

export function seasonAt(tick: number): { season: Season; index: number; progress: number } {
  const index = seasonIndex(tick);
  return { season: SEASONS[index]!, index, progress: (tick % SEASON_TICKS) / SEASON_TICKS };
}

/**
 * Passing Monsoon-season showers, 0..1 (0 in other seasons). Pure function of the tick so the
 * weather visuals and soil hydration agree; eases in and out over the season's first and last 6%.
 */
export function showerAt(tick: number): number {
  const { season, progress } = seasonAt(tick);
  if (season.id !== 'monsoon') return 0;
  const edge = Math.max(0, Math.min(1, progress / 0.06, (1 - progress) / 0.06));
  const t = tick / 10;
  return Math.min(1, Math.max(0, Math.sin(t * 0.021) * 0.6 + Math.sin(t * 0.0537 + 1.3) * 0.5 - 0.1)) * edge;
}
