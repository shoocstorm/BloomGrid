/**
 * Long-term goals state (plan v5, Phase 28): civic charters picked up and the tiers claimed, the city's era, and a
 * challenge scenario's objectives. Plain data in its own module (no imports) so `City` can hold it; saved (v23) and
 * part of `city.hash()`. Logic lives in `sim/charters.ts`, `sim/eras.ts` and `sim/objectives.ts`.
 */

export type ObjectiveStatus = 'playing' | 'won' | 'lost';

export interface CharterState {
  /** Charters in progress (at most `MAX_ACTIVE`), in the order they were taken up. */
  active: string[];
  /** Tiers reached per charter (sticky: a broken streak keeps what it earned), and tiers claimed (0 none … 3 Gold). */
  reached: Record<string, number>;
  claimed: Record<string, number>;
  /** Each active charter's running measure (streak seconds, a count, a smoothed share): see its def. */
  acc: Record<string, number>;
  /** Last incident / happening / fireworks show already counted (charters that count events). */
  seen: { incident: number; happening: number; show: number };
  /** Era index (0 Seedling … 3 Bloom), and the tick it began. */
  era: number;
  eraTick: number;
  /** A challenge scenario's run (null in free play). */
  challenge: {
    /** The scenario whose objectives these are. */
    scenario: string;
    status: ObjectiveStatus;
    /** Tick the challenge started (deadlines count from it), and when it was decided. */
    startTick: number;
    endTick: number;
    /** Per objective: seconds its lose condition has held in a row (a moment's dip is not a loss). */
    held: number[];
  } | null;
}

export const createCharterState = (): CharterState => ({
  active: [],
  reached: {},
  claimed: {},
  acc: {},
  seen: { incident: 0, happening: 0, show: 0 },
  era: 0,
  eraTick: 0,
  challenge: null,
});
