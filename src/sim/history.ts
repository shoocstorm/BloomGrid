import type { City } from './City';
import type { HistoryState } from './historyState';

/**
 * Recorders for the island's history ledger (plan v6, D-219). `City` calls them as buildings and highways come and
 * go and as levels, eras, wonders and unlocks happen; the pulse takes a sample now and then. Nothing is recorded at
 * tick 0: the scenario's content is the founding.
 *
 * `City` imports this module, so only types come back from `City.ts` (see the gotcha in AGENTS.md §8).
 */

/** Oldest entries go once a list is this long (founding content is never stored, so a city rarely gets here). */
export const GONE_MAX = 4000;
export const TIERS_MAX = 8000;
export const MARKS_MAX = 400;
/** Samples kept before every other one is dropped (and the interval doubles). */
export const SAMPLE_MAX = 400;
/** Builds that stood less than this (ticks) never show in a replay: an undone or immediately moved build. */
export const MIN_LIFE = 50;

/** The tick a building was built (0 = founding content). */
export const bornAt = (h: HistoryState, uid: number): number => h.born.get(uid) ?? 0;

/**
 * A building added. A building that comes back with its serial and type (undo of a demolition, a move) keeps the
 * birth it had; anything else is born now.
 */
export function noteBuilt(city: City, uid: number, def: string): void {
  const h = city.history;
  if (h.born.has(uid)) return;
  for (let i = h.gone.length - 1; i >= 0; i--) {
    const g = h.gone[i]!;
    if (g[0] !== uid || g[1] !== def) continue;
    h.gone.splice(i, 1);
    if (g[6] > 0) h.born.set(uid, g[6]);
    return;
  }
  if (city.tick > 0) h.born.set(uid, city.tick);
}

/** A building removed (demolished, moved, undone): kept as a gone record so it can come back or be replayed. */
export function noteGone(city: City, uid: number, def: string, x: number, z: number, rot: number, tier: number): void {
  const h = city.history;
  const born = bornAt(h, uid);
  h.born.delete(uid);
  if (city.tick <= 0) return;
  h.gone.push([uid, def, x, z, rot, tier, born, city.tick]);
  if (h.gone.length > GONE_MAX) h.gone.splice(0, h.gone.length - GONE_MAX);
}

/** A build undone (its serial handed back): it never happened, so it leaves no gone record. */
export function forgetBuild(city: City, uid: number): void {
  const g = city.history.gone;
  for (let i = g.length - 1; i >= 0; i--) if (g[i]![0] === uid) g.splice(i, 1);
}

/** A highway tile laid (`on`) or taken up. */
export function noteRoad(city: City, tile: number, on: boolean): void {
  const h = city.history;
  if (!on) h.roads.delete(tile);
  else if (city.tick > 0 && !h.roads.has(tile)) h.roads.set(tile, city.tick);
}

export function noteTier(city: City, uid: number, tier: number): void {
  if (city.tick <= 0) return;
  const t = city.history.tiers;
  t.push([uid, city.tick, tier]);
  if (t.length > TIERS_MAX) t.splice(0, t.length - TIERS_MAX);
}

export function noteMark(city: City, kind: string, id: string): void {
  if (city.tick <= 0) return;
  const m = city.history.marks;
  m.push([city.tick, kind, id]);
  if (m.length > MARKS_MAX) m.splice(0, m.length - MARKS_MAX);
}

/** Called once per pulse: a sample every `every` pulses; past `SAMPLE_MAX` the list halves and the interval doubles. */
export function sampleHistory(city: City, pulses: number, residents: number, harmony: number): void {
  const h = city.history;
  if (pulses % h.every !== 0) return;
  h.samples.push([city.tick, city.day, Math.round(residents), Math.round(city.credits), Math.round(harmony), city.buildingEntities().length]);
  if (h.samples.length > SAMPLE_MAX) {
    h.samples = h.samples.filter((_, i) => i % 2 === 0);
    h.every *= 2;
  }
}
