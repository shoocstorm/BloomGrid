/**
 * The island's history ledger (plan v6, D-219): what the city built and when, so the time-lapse film can replay its
 * life without re-simulating it. Plain data in its own module (no imports) so `City` can hold it; saved (v28) and part
 * of `city.hash()` (`historyHash`). Recorders live in `sim/history.ts`.
 *
 * Anything that existed before recording started (the scenario, every building in a pre-v28 save) has no entry and
 * counts as founding content, tick 0.
 */

/** A building that is no longer there: [uid, def, x, z, rot, tier, born tick, gone tick]. */
export type GoneRecord = [number, string, number, number, number, number, number, number];

/** A moment worth a caption: [tick, kind, id]. Kinds: era, wonder, project. */
export type HistoryMark = [number, string, string];

/** A sample of the city: [tick, day, residents, credits, harmony, buildings]. */
export type HistorySample = [number, number, number, number, number, number];

export interface HistoryState {
  /** Building serial → tick it was built (only buildings built after founding). */
  born: Map<number, number>;
  /** Buildings that were demolished, moved away from a lot or lost (oldest first, capped). */
  gone: GoneRecord[];
  /** Highway tile → tick it was laid (only tiles laid after founding). */
  roads: Map<number, number>;
  /** Level changes as [uid, tick, tier] (oldest first, capped). */
  tiers: [number, number, number][];
  marks: HistoryMark[];
  samples: HistorySample[];
  /** Pulses between samples; doubles each time the list is halved. */
  every: number;
}

export const createHistoryState = (): HistoryState => ({
  born: new Map(),
  gone: [],
  roads: new Map(),
  tiers: [],
  marks: [],
  samples: [],
  every: 30,
});

export function historyHash(h: HistoryState): string {
  let b = 0;
  for (const [u, t] of h.born) b = (b + u * 31 + t) % 2147483647;
  let r = 0;
  for (const [i, t] of h.roads) r = (r + i * 17 + t) % 2147483647;
  const last = h.samples[h.samples.length - 1];
  return `${h.born.size}:${b}|${h.roads.size}:${r}|${h.gone.length}|${h.tiers.length}|${h.marks.map((m) => `${m[1]}:${m[2]}@${m[0]}`).join(',')}|${h.samples.length}@${h.every}:${last ? last[0] : '-'}`;
}
