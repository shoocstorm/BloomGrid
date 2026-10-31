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
  /** Losses so far, for the incident log (D-050): damage events, ruins, fires started, credits, residents. */
  hits?: number;
  lost?: number;
  fires?: number;
  cost?: number;
  displaced?: number;
  /** Readable ids of the worst-hit buildings (up to 6). */
  objects?: string[];
}

/** A fire burning in one building (D-050). Grows unless crews, a station or rain beat it back; spreads when fierce. */
export interface FireIncident {
  id: number;
  /** The building's saved serial (`Building.uid`), stable across saves. */
  uid: number;
  x: number;
  z: number;
  /** 0..1: 0 = out. */
  intensity: number;
  startTick: number;
  /** Crews dispatched by the steward (a `respond` command). */
  crew: boolean;
  cause: 'lightning' | 'earthquake' | 'industrial' | 'heat' | 'spread' | 'fireworks';
  /** The crisis that started it, if any. */
  crisisId?: number;
  /** Credits of damage so far. */
  cost: number;
  /** Neighbours it has set alight (capped). */
  spread?: number;
}

/** A finished crisis or fire, kept for the steward's incident log. */
export interface IncidentRecord {
  id: number;
  /** Crisis def id, or 'fire'. */
  kind: string;
  name: string;
  icon: string;
  startTick: number;
  endTick: number;
  severity: number;
  district: string | null;
  x?: number;
  z?: number;
  cause?: string;
  /** Damage events, buildings ruined, fires started, residents displaced, credits lost (damage and response). */
  hits: number;
  lost: number;
  fires: number;
  displaced: number;
  cost: number;
  /** How it ended, in a few words ("contained by crews", "burned out", "weathered"). */
  outcome: string;
  objects: string[];
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
  /** Buildings burning or ruined this pulse: evacuated, producing nothing (hazards). */
  down: Set<number>;
  /** Ground shaking 0..1 (earthquake), for the camera. */
  shake: number;
  /** Storm rain 0..1 from hazards (thunderstorm), for weather and fire suppression. */
  rain: number;
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
  down: new Set(),
  shake: 0,
  rain: 0,
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
  /** Fires burning now, ruins awaiting repair (building serials), and the incident log (newest last). */
  fires: FireIncident[];
  ruins: number[];
  history: IncidentRecord[];
  nextIncidentId: number;
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
    fires: [],
    ruins: [],
    history: [],
    nextIncidentId: 1,
    modifiers: neutralModifiers(),
  };
}
