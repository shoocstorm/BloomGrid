import type { DifficultyId } from './difficulty';

/** A loan: amortised with simple interest; `payment` credits per sim second until repaid. */
export interface Loan {
  id: number;
  principal: number;
  remaining: number;
  payment: number;
}

export type CrisisPhase = 'forecast' | 'active';

export interface CrisisInstance {
  id: number;
  def: string;
  phase: CrisisPhase;
  /** Ticks when the crisis starts / ends. */
  startTick: number;
  endTick: number;
  severity: number;
  /** Optional target (e.g. the producer that fails) and region (blight). */
  target?: number;
  x?: number;
  z?: number;
  radius?: number;
}

/** Effects of active crises on this pulse. Recomputed every pulse; not saved. */
export interface Modifiers {
  energySupply: number;
  waterSupply: number;
  energyDemand: number;
  waterDemand: number;
  harmony: number;
  /** World height of flood water above sea level (0 = none). */
  floodLevel: number;
  /** Entity forced offline (grid failure), or -1. */
  offline: number;
  /** Greenery loss per second inside a region (blight). */
  blight: { x: number; z: number; radius: number; rate: number } | null;
}

export const neutralModifiers = (): Modifiers => ({
  energySupply: 1,
  waterSupply: 1,
  energyDemand: 1,
  waterDemand: 1,
  harmony: 0,
  floodLevel: 0,
  offline: -1,
  blight: null,
});

/**
 * Stewardship state: difficulty, finances, crises and the fail clock. Plain data (except
 * `modifiers`, which is recomputed every pulse) so it serializes into saves.
 */
export interface StewardState {
  difficulty: DifficultyId;
  /** Automatic crisis scheduling (tests and drills switch it off). */
  autoCrises: boolean;
  loans: Loan[];
  nextLoanId: number;
  /** Fraction of upkeep the city can actually pay: 1 normally, lower when in debt (austerity). */
  funding: number;
  crises: CrisisInstance[];
  nextCrisisId: number;
  lastCrisisEndTick: number;
  /** Seconds the city has spent in a failing state (decays when recovering). */
  failClock: number;
  failed: boolean;
  peakPopulation: number;
  /** Current sea-level rise in world units (climate; see `sim/coast.ts`). */
  seaRise: number;
  /** Number of road tiles with any overgrowth (skip work when 0). */
  overgrown: number;
  modifiers: Modifiers;
}

export function createStewardState(difficulty: DifficultyId = 'steward'): StewardState {
  return {
    difficulty,
    autoCrises: true,
    loans: [],
    nextLoanId: 1,
    funding: 1,
    crises: [],
    nextCrisisId: 1,
    lastCrisisEndTick: 0,
    failClock: 0,
    failed: false,
    peakPopulation: 0,
    seaRise: 0,
    overgrown: 0,
    modifiers: neutralModifiers(),
  };
}
