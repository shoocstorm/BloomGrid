import type { City } from './City';
import { DIFFICULTIES } from './difficulty';
import { PULSE_TICKS } from './pulseConst';
import { seasonAt } from './seasons';
import type { QueuedCrisis } from './stewardState';

/**
 * The director's constants, dials and queue (plan v5, Phase 27), apart from `director.ts` so the crisis scheduler
 * and the consequence rules can read them without importing the forecasts (an import cycle back to the crises).
 */

/** Calm needed between crises (seconds); the director may stretch it, never shorten it. */
export const MIN_GAP = 75;
/** Calm before the next link of a crisis chain (seconds): chains follow close behind. */
export const CHAIN_GAP = 15;
/** Bounds on the director's dials. */
export const PACE = [0.5, 1.8] as const;
export const CALM_MAX = 2.5;
/** Seconds of calm below the band to build drift to full, and of spiralling above it to clear it. */
export const DRIFT_IN = 1800;
export const DRIFT_OUT = 300;
/** Queue entries waiting longer than this are dropped (the moment passed). */
const QUEUE_TTL = 600;
const QUEUE_MAX = 3;

/** What drift does at full strength (scaled by the season's peak). */
export const DRIFT = { energyDemand: 0.25, waterDemand: 0.2, ageing: 0.5 } as const;
/** Drift weighs heavier in the dry season (cooling, evaporation). */
const SEASON_PEAK: Record<string, number> = { haze: 1.5, bloom: 1.1 };

/** Whether the director is steering this city (on, and the difficulty has a band). */
export const directing = (city: City): boolean =>
  city.steward.autoDirector && DIFFICULTIES[city.steward.difficulty].tension !== null;

/** Drift's strength now, with the season's peak. */
export function driftNow(city: City): number {
  const d = city.steward.director.drift;
  return d > 0 ? d * (SEASON_PEAK[seasonAt(city.tick).season.id] ?? 1) : 0;
}

/**
 * Queues a crisis the city has earned (an escalation) or the next link of a chain. One entry per crisis; the
 * queue holds a few at most (escalations displace chain links, never the reverse).
 */
export function queueCrisis(city: City, q: Omit<QueuedCrisis, 'until'>): boolean {
  const d = city.steward.director;
  if (d.queue.some((x) => x.crisis === q.crisis) || city.steward.crises.some((c) => c.def === q.crisis)) return false;
  if (d.queue.length >= QUEUE_MAX) {
    const i = q.kind === 'escalation' ? d.queue.findIndex((x) => x.kind === 'chain') : -1;
    if (i < 0) return false;
    d.queue.splice(i, 1);
  }
  const entry = { ...q, until: city.tick + QUEUE_TTL * PULSE_TICKS };
  // Chain links go first: they follow on from what just happened.
  if (q.kind === 'chain') d.queue.unshift(entry);
  else d.queue.push(entry);
  city.bus.emit('director:queued', { crisis: q.crisis, cause: q.cause, kind: q.kind });
  return true;
}
