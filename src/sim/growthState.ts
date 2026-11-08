/**
 * Progression state (Phase 16, D-072): the city's name, what has been unlocked, unlock projects under way, the sea
 * wonders discovered, the fish stock the docks draw on, and Flora's bill. Plain data in its own module (no imports)
 * so `City` can hold it without an import cycle; logic lives in `sim/projects.ts`, `fishing.ts`, `wonders.ts`.
 */
export type UnlockId = 'skylanes' | 'aeroline' | 'flora' | 'police' | 'cruise' | 'skyguard';

/** Readable names for lock messages (`City.checkPlacement` can't import the project table). */
export const UNLOCK_NAMES: Record<UnlockId, string> = {
  skylanes: 'the Sky-lane charter',
  aeroline: 'the Aeroline',
  flora: 'Flora',
  police: 'the Aegis Watch charter',
  cruise: 'the Tidesong cruise line',
  skyguard: 'the Sky Guard air wing',
};

export interface ProjectRun {
  id: UnlockId;
  startTick: number;
  endTick: number;
  cost: number;
}

export interface GrowthState {
  name: string;
  /**
   * Progression on (a fresh island): locked buildings need their unlock project, wonders are discovered over time
   * and Flora must be woken and paid. Off (the showcase city, tests, saves from before v11): everything is open.
   */
  progression: boolean;
  unlocked: UnlockId[];
  projects: ProjectRun[];
  /** Sea wonders discovered (ids from `sim/wonders.ts`). */
  wonders: string[];
  /** Fish stock 0..1: boats deplete it, it regrows when left alone. */
  fish: number;
  /** Lifetime fishing income, Flora requests and what they cost. */
  fishIncome: number;
  floraRequests: number;
  floraSpent: number;
  /** Steward milestones claimed (ids from `sim/milestones.ts`, D-118). */
  milestones: string[];
  /** Residents' tips popped, and what they paid (`sim/tips.ts`, D-118). */
  tips: number;
  tipIncome: number;
}

export function createGrowthState(): GrowthState {
  return {
    name: 'BloomGrid',
    progression: false,
    unlocked: [],
    projects: [],
    wonders: [],
    fish: 1,
    fishIncome: 0,
    floraRequests: 0,
    floraSpent: 0,
    milestones: [],
    tips: 0,
    tipIncome: 0,
  };
}

/** Whether an unlock is available: always without progression, else once its project has finished. */
export const isOpen = (g: GrowthState, id: UnlockId): boolean => !g.progression || g.unlocked.includes(id);
