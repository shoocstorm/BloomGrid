import type { City } from './City';
import { DIFFICULTIES } from './difficulty';
import { getCrisis } from './crises';
import { warnings } from './forecast';
import { PULSE_TICKS } from './pulseConst';
import { SYSTEMS } from './pulseState';
import { FAIL_SECONDS } from './steward';
import { eraOf } from './eras';
import type { QueuedCrisis } from './stewardState';
import { CALM_MAX, DRIFT_IN, DRIFT_OUT, PACE, directing } from './directorCore';

export * from './directorCore';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toward = (v: number, t: number, step: number) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));

/**
 * The director (plan v5, Phase 27): trouble that grows out of what the city does, paced to the steward.
 *
 * Each pulse it reads the city's **tension** (systems in Strained or worse, crises and fires, forecasts of
 * shortfalls, unhappy residents, the fail clock) and keeps a **mastery** score of how quickly the steward gets out
 * of trouble. The difficulty sets a target band for tension (nudged up for a steward who recovers fast). Below the
 * band the city is running itself: the **pace** of crises and happenings rises and slow structural **drift** builds
 * (homes and shops want more power and water, buildings age faster, the Haze peaks harder). Above the band it is
 * spiralling: pace falls and the **calm** gap between crises stretches. Escalations (neglect boiling over) and chain
 * links wait in a queue and are forecast by the crisis scheduler when the gap allows (`crises.ts`).
 *
 * Deterministic: no randomness here (the scheduler draws from `city.rng`). Runs at the end of the pulse, so the
 * stats, tiers and the per-pulse forecast cache it reads are this pulse's; the crisis step reads its output on the
 * next one. Off (`steward.autoDirector`) in tests and the trailer, and always on Sandbox (no band).
 */

export interface TensionParts {
  tiers: number;
  crises: number;
  forecasts: number;
  unhappy: number;
  failing: number;
}

/** This pulse's raw tension and where it comes from (each part already weighted; the sum is clamped to 1). */
export function tensionParts(city: City): TensionParts {
  const tiers = city.pulse.tiers;
  let t = 0;
  for (const k of SYSTEMS) if (k !== 'ecology') t += Math.max(0, tiers[k] - 1);
  const st = city.steward;
  const active = st.crises.some((c) => c.phase === 'active');
  const forecast = st.crises.some((c) => c.phase === 'forecast');
  return {
    tiers: Math.min(0.6, t / 6),
    crises: (active ? 0.3 : forecast ? 0.12 : 0) + Math.min(0.2, st.fires.length * 0.05),
    forecasts: Math.min(0.2, warnings(city).length * 0.07),
    unhappy: 0.25 * clamp01((55 - city.stats.happiness) / 30),
    failing: 0.4 * clamp01(st.failClock / FAIL_SECONDS),
  };
}

export const rawTension = (p: TensionParts) => clamp01(p.tiers + p.crises + p.forecasts + p.unhappy + p.failing);

/** The band the director aims for now: the difficulty's, shifted up to 0.06 for a steward who recovers fast. */
export function band(city: City): [number, number] | null {
  const b = DIFFICULTIES[city.steward.difficulty].tension;
  if (!b) return null;
  // A fast-recovering steward, and a later era (plan v5, Phase 28), are pressed harder.
  const shift = (city.steward.director.mastery - 0.5) * 0.12 + eraOf(city).band;
  return [b[0] + shift, b[1] + shift];
}

/** Trouble, for mastery: a system Critical or worse, a crisis under way, or a fire. */
const inTrouble = (city: City) =>
  SYSTEMS.some((k) => city.pulse.tiers[k] >= 3) ||
  city.steward.fires.length > 0 ||
  city.steward.crises.some((c) => c.phase === 'active');

/** Once per pulse, at its end: tension, mastery, the dials, and the queue's expiry. */
export function updateDirector(city: City): void {
  const d = city.steward.director;
  const raw = rawTension(tensionParts(city));
  d.tension += (raw - d.tension) * 0.05;

  // Mastery: how long each spell of trouble lasted (≤ 30 s scores 1, ≥ 270 s scores 0).
  const trouble = inTrouble(city);
  if (trouble && d.troubleSince < 0) d.troubleSince = city.tick;
  else if (!trouble && d.troubleSince >= 0) {
    const secs = (city.tick - d.troubleSince) / PULSE_TICKS;
    d.mastery += (clamp01(1 - (secs - 30) / 240) - d.mastery) * 0.25;
    d.troubleSince = -1;
  }

  d.queue = d.queue.filter((q) => city.tick < q.until);

  const b = directing(city) ? band(city) : null;
  if (!b) {
    d.pace = 1;
    d.calm = 1;
    d.drift = 0;
    return;
  }
  if (d.tension < b[0]) {
    // Too calm: pull the city up.
    d.pace = Math.min(PACE[1], d.pace + 0.004);
    d.calm = Math.max(1, d.calm - 0.01);
    d.drift = Math.min(1, d.drift + 1 / DRIFT_IN);
  } else if (d.tension > b[1]) {
    // Spiralling: ease off and give it room.
    d.pace = Math.max(PACE[0], d.pace - 0.01);
    d.calm = Math.min(CALM_MAX, d.calm + 0.02);
    d.drift = Math.max(0, d.drift - 1 / DRIFT_OUT);
  } else {
    d.pace = toward(d.pace, 1, 0.002);
    d.calm = toward(d.calm, 1, 0.005);
  }
}

export interface DirectorReport {
  on: boolean;
  tension: number;
  band: [number, number] | null;
  mood: 'calm' | 'in band' | 'spiralling' | 'off';
  mastery: number;
  pace: number;
  calm: number;
  drift: number;
  parts: TensionParts;
  queued: { crisis: string; name: string; cause: string; kind: QueuedCrisis['kind'] }[];
}

/** A readable snapshot (City Pulse, Flora). */
export function directorReport(city: City): DirectorReport {
  const d = city.steward.director;
  const on = directing(city);
  const b = on ? band(city) : null;
  return {
    on,
    tension: d.tension,
    band: b,
    mood: !b ? 'off' : d.tension < b[0] ? 'calm' : d.tension > b[1] ? 'spiralling' : 'in band',
    mastery: d.mastery,
    pace: d.pace,
    calm: d.calm,
    drift: d.drift,
    parts: tensionParts(city),
    queued: d.queue.map((q) => ({ crisis: q.crisis, name: getCrisis(q.crisis).name, cause: q.cause, kind: q.kind })),
  };
}
