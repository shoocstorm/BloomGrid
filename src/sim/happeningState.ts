/**
 * Happenings state (D-123): the good surprises and residents' requests the city brings up between crises.
 * Plain data in its own module (no imports) so `City` can hold it; saved (v18) and part of `city.hash()`.
 */

export type HappeningKind = 'request' | 'festival' | 'bumper-catch' | 'cruise';
export type HappeningStatus = 'active' | 'met' | 'done' | 'missed';

export interface Happening {
  id: number;
  kind: HappeningKind;
  status: HappeningStatus;
  startTick: number;
  /** Deadline (requests) or when the boon fades. */
  endTick: number;
  /** Where it is (a request's area centre, the festival's square, the cruise's quay, the fishing grounds). */
  x: number;
  z: number;
  /** Area name for the card ("Westbrook", "the hamlet"). */
  place: string;
  /** Requests: the building category asked for, its area radius and how many stood there when asked. */
  category?: string;
  radius?: number;
  baseline?: number;
  /** Credits on offer (requests) or earned so far (boons). */
  reward: number;
  earned: number;
}

export interface HappeningRecord {
  id: number;
  kind: HappeningKind;
  outcome: 'claimed' | 'missed' | 'done';
  tick: number;
  credits: number;
  place: string;
}

export interface HappeningState {
  /** Off in tests (like crises) so balance runs stay stable; on in play. */
  auto: boolean;
  current: Happening | null;
  /** Tick after which the next happening may start. */
  nextTick: number;
  nextId: number;
  /** Harmony lift after a claimed request, or dip after a missed one, until this tick (signed amount). */
  moodUntil: number;
  mood: number;
  history: HappeningRecord[];
}

export const createHappeningState = (): HappeningState => ({
  auto: true,
  current: null,
  // The first one comes a few minutes into a new city (see `updateHappenings`).
  nextTick: 0,
  nextId: 1,
  moodUntil: 0,
  mood: 0,
  history: [],
});
