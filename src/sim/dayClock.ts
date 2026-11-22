/**
 * The day/night pace. A full cycle still takes DAY_LENGTH sim seconds, but the clock runs faster while the sun is
 * well below the horizon and a little slower by day, so players spend about three quarters of the cycle in daylight
 * (it was half). Dusk and dawn keep the day pace so sunsets don't rush past.
 *
 * `timeOfDay` stays the sun's position (0 = midnight, 0.5 = noon), so everything that reads it (lights, fireworks,
 * nightlife) agrees with the sky. `phaseOf` / `timeAtPhase` convert to and from elapsed time (a cycle fraction that
 * grows linearly with sim seconds), for labels that turn a past tick into a clock time.
 */

/** How much faster the clock runs in deep night than in daylight. */
export const NIGHT_BOOST = 3.5;

const elevation = (t: number) => Math.sin((t - 0.25) * Math.PI * 2);

/** Unnormalised speed: 1 by day and through twilight, ramping to NIGHT_BOOST once the sun is well down. */
function boost(t: number): number {
  const x = Math.min(1, Math.max(0, (-0.08 - elevation(t)) / 0.22));
  return 1 + (NIGHT_BOOST - 1) * x * x * (3 - 2 * x);
}

const N = 1440;
/** PHASE[i] = elapsed cycle fraction at timeOfDay i / N (PHASE[N] = 1). */
const PHASE = new Float64Array(N + 1);
let norm = 0;
for (let i = 0; i < N; i++) norm += 1 / boost((i + 0.5) / N);
norm /= N;
for (let i = 0; i < N; i++) PHASE[i + 1] = PHASE[i]! + 1 / boost((i + 0.5) / N) / N / norm;
PHASE[N] = 1;

/** Clock speed multiplier at a time of day (averages out so one cycle still takes DAY_LENGTH seconds). */
export const clockRate = (t: number): number => boost(t) * norm;

/** Elapsed cycle fraction (linear in time) at a time of day. */
export function phaseOf(t: number): number {
  const f = (((t % 1) + 1) % 1) * N;
  const i = Math.min(N - 1, Math.floor(f));
  return PHASE[i]! + (PHASE[i + 1]! - PHASE[i]!) * (f - i);
}

/** Time of day (sun position) at an elapsed cycle fraction. */
export function timeAtPhase(p: number): number {
  const q = ((p % 1) + 1) % 1;
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PHASE[mid]! <= q) lo = mid;
    else hi = mid;
  }
  return (lo + (q - PHASE[lo]!) / (PHASE[lo + 1]! - PHASE[lo]!)) / N;
}

/** Share of a cycle's time with the sun below the horizon (for docs and tests). */
export function nightShare(): number {
  let s = 0;
  for (let i = 0; i < N; i++) if (elevation((i + 0.5) / N) < 0) s += PHASE[i + 1]! - PHASE[i]!;
  return s;
}
