import type { SystemKey } from './pulseState';

/**
 * One name per city indicator (D-113). The top bar, City Pulse, the dashboard, stat guides, advisories and Flora all
 * read their labels here, so the same number is never "Credits" in one place and "Treasury" or "Budget" in another.
 * Credits is the treasury balance and its health tier; its per-second change is "credit flow".
 */
export const INDICATOR_NAMES = {
  credits: 'Credits',
  residents: 'Residents',
  energy: 'Energy',
  water: 'Water',
  food: 'Food',
  jobs: 'Employment',
  mobility: 'Mobility',
  ecology: 'Ecology',
  harmony: 'Harmony',
  bloom: 'Bloom index',
} as const;

/**
 * The order indicators appear in on every surface (top bar, City Pulse, the dashboard, Flora's console): money, then
 * people, the supplies they need, how the city works and moves, and how it feels.
 */
export const INDICATOR_ORDER = ['credits', 'residents', 'energy', 'water', 'food', 'jobs', 'mobility', 'ecology', 'harmony'] as const;

/** Health systems in `INDICATOR_ORDER` (residents has no tier). Display only: the sim iterates `SYSTEMS`. */
export const SYSTEM_ORDER: readonly SystemKey[] = ['budget', 'energy', 'water', 'food', 'jobs', 'mobility', 'ecology', 'harmony'];

/** The per-second change in credits (City Pulse section, dashboard column). */
export const CREDIT_FLOW = 'Credit flow (per second)';

/** City Pulse's health systems by the same names. */
export const SYSTEM_LABELS: Record<SystemKey, string> = {
  energy: INDICATOR_NAMES.energy,
  water: INDICATOR_NAMES.water,
  food: INDICATOR_NAMES.food,
  jobs: INDICATOR_NAMES.jobs,
  mobility: INDICATOR_NAMES.mobility,
  ecology: INDICATOR_NAMES.ecology,
  harmony: INDICATOR_NAMES.harmony,
  budget: INDICATOR_NAMES.credits,
};
