/**
 * Policy state (plan v5, Phase 25): ordinances in force, sector budgets and the business tax. Plain data in its
 * own module (no imports) so `City` can hold it; saved (v20) and hashed.
 */

export const BUDGET_SECTORS = ['maintenance', 'response', 'ecology'] as const;
export type BudgetSector = (typeof BUDGET_SECTORS)[number];
export const BUDGET_MIN = 0.5;
export const BUDGET_MAX = 1.25;

export interface PolicyState {
  /** Ordinances in force: id → tick enacted. */
  active: Record<string, number>;
  /** Last change per ordinance (tick), for the cooldown. */
  changed: Record<string, number>;
  /** Share of each sector's upkeep the city pays (1 = as designed). */
  budget: Record<BudgetSector, number>;
  /** Tax on businesses (the worker share of income); residents pay `pulse.taxRate`. */
  businessRate: number;
}

export function createPolicyState(businessRate = 0.12): PolicyState {
  return { active: {}, changed: {}, budget: { maintenance: 1, response: 1, ecology: 1 }, businessRate };
}
