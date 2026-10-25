import type { City } from './City';
import { DIFFICULTIES } from './difficulty';

/** Seconds a city may stay in Collapse (harmony or budget) before the steward is replaced. */
export const FAIL_SECONDS = 120;

/**
 * The council's patience. While harmony or the budget is in Collapse the fail clock runs; it
 * unwinds twice as fast once the city recovers. At FAIL_SECONDS (and only on difficulties with
 * a fail state) the steward is replaced.
 */
export function updateStewardship(city: City): void {
  const st = city.steward;
  st.peakPopulation = Math.max(st.peakPopulation, city.stats.population);
  if (st.failed || !DIFFICULTIES[st.difficulty].fail) {
    st.failClock = 0;
    return;
  }
  const failing = city.pulse.tiers.harmony === 4 || city.pulse.tiers.budget === 4;
  const prev = st.failClock;
  st.failClock = failing ? prev + 1 : Math.max(0, prev - 2);
  if (prev === 0 && st.failClock > 0) city.bus.emit('steward:warning', { secondsLeft: FAIL_SECONDS - st.failClock });
  if (prev > 0 && st.failClock === 0) city.bus.emit('steward:warning', { secondsLeft: null });
  if (st.failClock >= FAIL_SECONDS) {
    st.failed = true;
    city.bus.emit('steward:replaced', { day: city.day, peakPopulation: Math.round(st.peakPopulation) });
  }
}
