/**
 * Building limits (D-072, D-130): some buildings (fishing docks) are capped at `base`, plus one per `perPopulation`
 * residents. Pure numbers with no imports, so `City.checkPlacement`, the Build panel and the build gate
 * (`sim/buildGate.ts`) all count it the same way and every surface can say when the next one opens.
 */
export interface LimitStatus {
  /** How many the city has. */
  have: number;
  /** How many it may have now. */
  max: number;
  /** Residents at which one more is allowed. */
  nextAt: number;
}

export function limitStatus(
  limit: { base: number; perPopulation: number },
  population: number,
  have: number,
): LimitStatus {
  const max = limit.base + Math.floor(population / limit.perPopulation);
  return { have, max, nextAt: (max - limit.base + 1) * limit.perPopulation };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};

/** One line for a full limit: how many, and the population that opens the next one. */
export function limitReason(s: LimitStatus, population: number): string {
  return `${s.have} of ${s.max} built: the ${ordinal(s.max + 1)} opens at ${fmt(s.nextAt)} residents (${fmt(population)} now)`;
}
