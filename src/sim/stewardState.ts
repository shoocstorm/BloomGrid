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
  /** Tornado heading (tiles per second); tsunami offshore origin is x/z (D-076). */
  vx?: number;
  vz?: number;
  /** Prevention in play (D-076): residents evacuated, the Tide Gates closed, credits of damage avoided. */
  evacuated?: boolean;
  gates?: boolean;
  saved?: number;
  /** An earthquake that has already rolled for a tsunami. */
  rolled?: boolean;
  /** What prevention did, in sentences, for the incident log. */
  prevented?: string[];
  /** Why it came (plan v5, Phase 27): the neglect that boiled over or the crisis it followed ("Polluted coast"). */
  cause?: string;
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
  cause: 'lightning' | 'earthquake' | 'industrial' | 'heat' | 'spread' | 'fireworks' | 'tornado';
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
  /** What prevention did (D-076): "Windbreak parks absorbed 30% of its force (◈1,200 saved)". */
  prevented?: string[];
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
  /** Tsunami surge height on the waterfront (D-076): floods the coast only, not every low tile like `floodLevel`. */
  surge: number;
  /** Workplace staffing multiplier (a strike walks people out, plan v5 Phase 27). */
  staffing: number;
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
  surge: 0,
  staffing: 1,
});

/** A crisis the director owes the city (plan v5, Phase 27): neglect that boiled over, or the next link of a chain. */
export interface QueuedCrisis {
  crisis: string;
  /** Seconds of calm needed after the last crisis before it is forecast. */
  gap: number;
  severity: number;
  /** Rule name or crisis name it grew out of (shown in the forecast and the log). */
  cause: string;
  kind: 'escalation' | 'chain';
  /** Dropped if still waiting at this tick (the moment passed). */
  until: number;
}

/**
 * The director (plan v5, Phase 27): reads how hard-pressed the city is (tension) and how quickly the steward gets
 * out of trouble (mastery), and paces the challenge toward the difficulty's band. Saved with the steward; hashed.
 */
export interface DirectorState {
  /** 0..1, smoothed: tiers in trouble, crises and fires, forecasts, unhappy residents, the fail clock. */
  tension: number;
  /** 0..1 EWMA of how fast the steward recovers from trouble (0.5 = unknown). */
  mastery: number;
  /** Multiplier on crisis odds and happening frequency (pulls a calm city up). */
  pace: number;
  /** Multiplier on the calm gap between crises (≥ 1: lets a spiralling city breathe). */
  calm: number;
  /** 0..1 structural pressure: rising demand and faster ageing that build while the city runs itself. */
  drift: number;
  /** Tick trouble began, or -1. */
  troubleSince: number;
  /** Escalations and chain links waiting for a calm gap (first = next). */
  queue: QueuedCrisis[];
}

export const createDirectorState = (): DirectorState => ({
  tension: 0,
  mastery: 0.5,
  pace: 1,
  calm: 1,
  drift: 0,
  troubleSince: -1,
  queue: [],
});

/**
 * Stewardship state: difficulty, finances, crises and the fail clock. Plain data (except
 * `modifiers`, which is recomputed every pulse) so it serializes into saves.
 */
export interface StewardState {
  difficulty: DifficultyId;
  /** Automatic crisis scheduling (tests and drills switch it off). */
  autoCrises: boolean;
  /** Adaptive pacing (plan v5, Phase 27): off in tests, the trailer and on Sandbox. */
  autoDirector: boolean;
  director: DirectorState;
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
    autoDirector: true,
    director: createDirectorState(),
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
