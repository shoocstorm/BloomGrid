/**
 * District approval state (plan v5, Phase 26): each named district's approval of the steward, its streaks (for
 * protests and praise) and a passing mood from petitions. Plain data in its own module (no imports) so `City` can
 * hold it; saved (v21) and hashed. The derived view (terms, residents, migration) is rebuilt every pulse.
 */

/** Key of the land outside every named district. */
export const OUTSKIRTS_KEY = '';

export interface DistrictMood {
  /** 0..100, drifts toward its target like city harmony. */
  approval: number;
  /** Pulses spent below the protest line / at or above the praise line (reset when it crosses back). */
  lowFor: number;
  highFor: number;
  /** A passing lift (+) or grudge (−) from a petition or praise, in approval points, until `boostUntil` (tick). */
  boost: number;
  boostUntil: number;
}

/** What a district's approval is made of, in points, from the last pulse (not saved). */
export interface ApprovalTerms {
  /** The city-wide part (taxes, jobs, food, ecology, crises, policies…): every district shares it. */
  city: number;
  /** Power and water at its homes, against the city's mean. */
  services: number;
  /** Parks, venues and grown buildings in the district, against the city's mean. */
  amenities: number;
  /** Smog at its homes. */
  pollution: number;
  /** Mean trip to work from its homes, in tiles (jams count once, in the city's traffic term). */
  commute: number;
  /** Share of its workers in the kind of job they want (service, industry, creative, ecology). */
  jobMatch: number;
  /** A petition answered or ignored, praise, a protest's bitterness. */
  mood: number;
}

export interface DistrictView {
  /** District name, or `Outskirts`. */
  name: string;
  key: string;
  target: number;
  terms: ApprovalTerms;
  residents: number;
  capacity: number;
  jobs: number;
  buildings: number;
  /** Mean commute in tiles of travel (0 without commuters) and the share of workers in a matching job. */
  commute: number;
  match: number;
  /** Mean smog at its homes (0..1+). */
  smog: number;
  /** Residents moving in / out, per sim minute (smoothed). */
  movedIn: number;
  movedOut: number;
  /** Local demand for homes and for workplaces (level-ups need > 0). */
  homeDemand: number;
  workDemand: number;
}

export interface ApprovalView {
  districts: DistrictView[];
  /** City-wide residents moving in / out per sim minute (smoothed). */
  movedIn: number;
  movedOut: number;
}

export interface ApprovalState {
  /** By district name (`OUTSKIRTS_KEY` for the outskirts). */
  districts: Record<string, DistrictMood>;
  /** Derived each pulse; not saved or hashed. */
  view: ApprovalView;
}

export const createDistrictMood = (approval = 60): DistrictMood => ({
  approval,
  lowFor: 0,
  highFor: 0,
  boost: 0,
  boostUntil: 0,
});

export const createApprovalState = (): ApprovalState => ({
  districts: {},
  view: { districts: [], movedIn: 0, movedOut: 0 },
});
