import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import type { Modifiers } from './stewardState';

/**
 * Fishing (Phase 16, D-072): the island's first income. Each Fishing Boat Dock (`fishing` on a def) sends its boats
 * out while staffed; the catch sells for credits. Three things set the haul: the fish stock (boats deplete it, it
 * regrows when the sea is left alone, so too many docks overfish it), clean water (coastal pollution spoils it)
 * and algal blooms (which all but stop it). Two or three docks fish the sea best; more drive the stock down until
 * the extra boats bring in less in total. Deterministic, no randomness.
 */

/** Credits per boat-second at full stock, staffing and clean water. */
export const CATCH_VALUE = 0.7;
/** Stock taken per boat-second, and the regrowth rate (logistic, per second). */
const TAKE = 0.0004;
const REGROW = 0.006;

/** How clean the coast is for fish, 0.2..1. */
export const cleanSea = (city: City): number => {
  const bloom = city.steward.crises.some((c) => c.def === 'algal-bloom' && c.phase === 'active') ? 0.3 : 1;
  return Math.min(1, Math.max(0.2, 1 - city.pulse.coastalPollution * 1.5)) * bloom;
};

export interface FishingResult {
  /** Credits this pulse. */
  income: number;
  boats: number;
}

/** Once per pulse after occupancy: boats fish, the stock moves, the catch is sold. */
export function updateFishing(
  city: City,
  ents: ArrayLike<number> & Iterable<number>,
  mod: Modifiers,
): FishingResult {
  const g = city.growth;
  let effort = 0;
  let boats = 0;
  for (const e of ents) {
    const f = buildings.at(Building.def[e]!).fishing;
    if (!f || mod.down.has(e)) continue;
    boats += f.boats;
    effort += f.boats * Service.occupancy[e]!;
  }
  // A fishing quota (plan v5) keeps boats in harbour part of the time: less catch, less taken from the stock.
  effort *= city.consequences.mods.fishEffort;
  const clean = cleanSea(city) * city.consequences.mods.fishing;
  const income = effort * CATCH_VALUE * g.fish * clean;
  g.fish = Math.min(
    1,
    Math.max(0, g.fish + REGROW * g.fish * (1 - g.fish) + 0.0002 * (1 - g.fish) - TAKE * effort * g.fish),
  );
  g.fishIncome += income;
  city.credits += income;
  return { income, boats };
}

/** How many docks the city may have: a few to start, more as the town grows. */
export function dockLimit(city: City, base: number, perPopulation: number): number {
  return base + Math.floor(city.stats.population / perPopulation);
}
