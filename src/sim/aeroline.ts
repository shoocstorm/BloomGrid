import type { CommandStack } from '@/core/Commands';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import type { SimCtx } from './systems';
import { isOpen } from './growthState';

/**
 * Aeroline line levels (D-170): the whole line (trains and station decks) is upgraded as one, like a building's
 * levels. Each level carries more riders per station and runs faster, newer rolling stock; the look of every level
 * is designed in `modules/aeroline` (Trains / Guideway). The level lives in `city.growth.aerolineLevel` (saved v25,
 * hashed); the upgrade is an undoable command.
 */
export const MAX_AEROLINE_LEVEL = 3;

export interface AerolineLevelDef {
  /** Rolling-stock name shown in the inspector. */
  name: string;
  /** What the level brings, in a line. */
  blurb: string;
  /** Credits to reach this level (0 for level 1). */
  cost: number;
  /** Rail riders per station, as a share of the station's own figure. */
  riders: number;
  /** Cruise speed of the trains (km/h, for the inspector; the render speed follows `vmax`). */
  kmh: number;
  /** Render cruise speed (world units per second). */
  vmax: number;
}

export const AEROLINE_LEVELS: readonly AerolineLevelDef[] = [
  { name: 'Bloomline', blurb: 'Five-car pearl maglev sets under glass vaults.', cost: 0, riders: 1, kmh: 240, vmax: 22 },
  {
    name: 'Zephyr',
    blurb: 'Six-car sets with panoramic glass roofs; stations gain solar sails and platform doors.',
    cost: 9000,
    riders: 1.35,
    kmh: 320,
    vmax: 27,
  },
  {
    name: 'Aurora Halo',
    blurb: 'Seven-car chrome-and-gold sets with light fins; stations crowned with halo spires.',
    cost: 20000,
    riders: 1.75,
    kmh: 420,
    vmax: 33,
  },
];

const STATION = 'aeroline-station';

/** The line's level, 1..3 (older states without the field are level 1). */
export const aerolineLevel = (city: City): number =>
  Math.min(MAX_AEROLINE_LEVEL, Math.max(1, city.growth.aerolineLevel ?? 1));

export const aerolineLevelDef = (city: City): AerolineLevelDef => AEROLINE_LEVELS[aerolineLevel(city) - 1]!;

/** Rail riders multiplier for stations (mobility). */
export const aerolineRiders = (city: City): number => aerolineLevelDef(city).riders;

/** Credits for the next level, 0 at the top. */
export const aerolineUpgradeCost = (city: City): number => {
  const l = aerolineLevel(city);
  return l >= MAX_AEROLINE_LEVEL ? 0 : AEROLINE_LEVELS[l]!.cost;
};

/** Stations standing on the line. */
export function aerolineStations(city: City): number {
  if (!buildings.has(STATION)) return 0;
  const idx = buildings.indexOf(STATION);
  let n = 0;
  for (const eid of city.buildingEntities()) if (Building.def[eid] === idx) n++;
  return n;
}

/** Why the line can't be upgraded now (with the credits still missing), or null when it can. */
export function aerolineBlock(city: City): { reason: string; short?: number } | null {
  const l = aerolineLevel(city);
  if (l >= MAX_AEROLINE_LEVEL) return { reason: 'The line runs its top level.' };
  if (!isOpen(city.growth, 'aeroline')) return { reason: 'Build the Aeroline first.' };
  if (aerolineStations(city) === 0) return { reason: 'The line needs a station.' };
  const cost = aerolineUpgradeCost(city);
  if (city.credits < cost) return { reason: `Needs ${Math.ceil(cost - city.credits)} more credits.`, short: cost - city.credits };
  return null;
}

export function registerAerolineCommands(stack: CommandStack<SimCtx>): void {
  // Raises the whole line one level (trains and stations). Undo restores the level and the credits.
  stack.register<Record<string, never>, { prev: number; cost: number }>('upgradeAeroline', {
    apply({ city }) {
      if (aerolineBlock(city)) return null;
      const prev = aerolineLevel(city);
      const cost = aerolineUpgradeCost(city);
      city.credits -= cost;
      city.growth.aerolineLevel = prev + 1;
      city.bus.emit('aeroline:level', { level: prev + 1 });
      return { prev, cost };
    },
    revert({ city }, _p, u) {
      city.growth.aerolineLevel = u.prev;
      city.credits += u.cost;
      city.bus.emit('aeroline:level', { level: u.prev });
    },
  });
}
