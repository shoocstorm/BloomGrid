/**
 * The Chronicle's state (D-192): the pages of the island's history this city has found, in order, and the choice
 * made at Meridian's flame. Plain data in its own module (no imports) so `City` can hold it; saved (v26) and part of
 * `city.hash()` (`chronicleHash`, here so `City` needn't import `chronicle.ts`). Logic lives in `sim/chronicle.ts`.
 */

export type FlameEnding = 'relit' | 'rest';

export interface ChronicleState {
  /** Pages found, oldest first, with the tick each was found. */
  found: { id: string; tick: number }[];
  /** What the city chose at the flame (the last page), or null. */
  ending: FlameEnding | null;
}

export const createChronicleState = (): ChronicleState => ({ found: [], ending: null });

export const chronicleHash = (st: ChronicleState): string =>
  `${st.found.map((f) => `${f.id}@${f.tick}`).join(',')}|${st.ending ?? '-'}`;
