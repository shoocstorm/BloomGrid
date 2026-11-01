/**
 * Consequence state (Phase 20, D-074): how strongly each cause-and-effect rule is in force, the slow "stocks"
 * that carry effects over time (credit rating, tourism reputation), the Cause & effect feed, and this pulse's
 * modifiers that other systems read. Plain data in its own module (no imports) so `City` can hold it.
 */

/** One rule's state: intensity 0..1 (ramps toward its target, so effects build and fade) and since when. */
export interface RuleState {
  level: number;
  since: number;
}

export interface FeedEntry {
  id: number;
  rule: string;
  tick: number;
  day: number;
  /** A rule came into force or eased off. */
  kind: 'start' | 'end';
  text: string;
  x?: number;
  z?: number;
}

/** What the rules do this pulse, read by other systems on the next one. Recomputed every pulse; not saved. */
export interface ConsequenceMods {
  harmony: number;
  /** Credits per second: visitors (tourism) and the insurance premium. */
  tourism: number;
  insurance: number;
  /** Extra loan interest (per minute, added to the difficulty's rate). */
  interest: number;
  /** Multipliers on crisis odds by crisis id. */
  crisis: Record<string, number>;
  /** Fire spread and heat-fire chance multipliers. */
  fireSpread: number;
  heatFire: number;
  /** Fishing haul multiplier, flood-damage multiplier, ageing speed. */
  fishing: number;
  flood: number;
  ageing: number;
  /** Bloom index points lost (pollinators), for harmony. */
  bloomLoss: number;
  /** Discount on Flora's requests (0..1). */
  floraDiscount: number;
  /** 0..1: fireworks smoke lingers (Haze). */
  smogHold: number;
}

export const neutralMods = (): ConsequenceMods => ({
  harmony: 0,
  tourism: 0,
  insurance: 0,
  interest: 0,
  crisis: {},
  fireSpread: 1,
  heatFire: 1,
  fishing: 1,
  flood: 1,
  ageing: 1,
  bloomLoss: 0,
  floraDiscount: 0,
  smogHold: 0,
});

export interface ConsequenceState {
  rules: Record<string, RuleState>;
  /** Credit rating 0..1 (1 = AAA): falls in debt, recovers slowly when out of it. */
  credit: number;
  /** Tourism reputation 0..1: builds with harmony, fades with crises and a dirty coast. */
  reputation: number;
  /** Seconds harmony has stayed at 70 or above (resets when it drops). */
  harmonyStreak: number;
  /** Lifetime credits from visitors and paid in insurance. */
  tourismIncome: number;
  insurancePaid: number;
  feed: FeedEntry[];
  nextFeedId: number;
  mods: ConsequenceMods;
}

export function createConsequenceState(): ConsequenceState {
  return {
    rules: {},
    credit: 1,
    reputation: 0.3,
    harmonyStreak: 0,
    tourismIncome: 0,
    insurancePaid: 0,
    feed: [],
    nextFeedId: 1,
    mods: neutralMods(),
  };
}

/** Readable credit rating for a 0..1 score. */
export function creditGrade(v: number): string {
  return v >= 0.9
    ? 'AAA'
    : v >= 0.75
      ? 'AA'
      : v >= 0.6
        ? 'A'
        : v >= 0.45
          ? 'BBB'
          : v >= 0.3
            ? 'BB'
            : v >= 0.15
              ? 'B'
              : 'C';
}
