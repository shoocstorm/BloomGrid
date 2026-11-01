import type { CommandStack } from '@/core/Commands';
import { Building, Greenery, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import type { Modifiers } from './stewardState';
import type { SimCtx } from './systems';
import { DAY_LENGTH } from './pulseConst';
import { fireAt, isRuined } from './hazards';

/**
 * Building levels and ageing (Phase 18, D-073). A home or workplace that thrives (powered, watered, full, green and
 * in good repair) grows a level after 1.5 sim days, and again after 3 more: each level holds more people and jobs
 * and makes more, but costs more to run. The steward can also pay for an upgrade. Every building ages: upkeep rises
 * 15% per 10 days (up to +90%), it wears faster, and its walls weather, until it is renovated. Pure and
 * deterministic; tier, age and progress are saved and hashed.
 */

/** Size (capacity, jobs, output) and running-cost multipliers per tier (level 1–3). */
export const TIER_SIZE = [1, 1.35, 1.75] as const;
export const TIER_USE = [1, 1.25, 1.55] as const;
export const TIER_UPKEEP = [1, 1.3, 1.7] as const;
/** Sim days of thriving needed to reach the next level. */
export const LEVEL_DAYS = [1.5, 3] as const;
export const MAX_TIER = 2;
/** From this age (days) a building counts as old: upkeep has crept up 15% and renovation pays (inventory `is:old`). */
export const OLD_DAYS = 10;

export const size = (eid: number): number => TIER_SIZE[Building.tier[eid]!] ?? 1;
export const use = (eid: number): number => TIER_USE[Building.tier[eid]!] ?? 1;

/** Days a building has stood since it was built or renovated. */
export const ageDays = (eid: number): number => Service.age[eid]! / DAY_LENGTH;

/** Upkeep multiplier from level and age. */
export function upkeepMul(eid: number): number {
  const age = 1 + 0.15 * Math.min(6, Service.age[eid]! / (10 * DAY_LENGTH));
  return (TIER_UPKEEP[Building.tier[eid]!] ?? 1) * age;
}

/** Extra condition wear per pulse from age (up to 0.0004 after 20 days; full funding mends 0.003). */
export const ageWear = (eid: number): number => 0.0004 * Math.min(1, Service.age[eid]! / (20 * DAY_LENGTH));

/** 0..1 progress toward the next level, or 1 at the top. */
export function levelProgress(eid: number): number {
  const t = Building.tier[eid]!;
  if (t >= MAX_TIER) return 1;
  return Math.min(1, Service.thrive[eid]! / (LEVEL_DAYS[t]! * DAY_LENGTH));
}

/** Whether the building grows at all (homes and workplaces). */
export const levels = (city: City, eid: number): boolean => {
  const st = city.buildingDef(eid).stats;
  return st.population > 0 || st.jobs > 0;
};

/** What renovation and an upgrade cost (credits). */
export const renovateCost = (city: City, eid: number): number =>
  Math.max(
    20,
    Math.round(
      city.buildingDef(eid).stats.cost * 0.3 * (0.4 + Math.min(1, Service.age[eid]! / (10 * DAY_LENGTH))),
    ),
  );
export const upgradeCost = (city: City, eid: number): number =>
  Math.round(city.buildingDef(eid).stats.cost * (0.6 + 0.4 * Building.tier[eid]!));

/** Why a building can't be upgraded, or null. */
export function upgradeBlocker(city: City, eid: number): string | null {
  if (!levels(city, eid)) return 'Only homes and workplaces grow';
  if (Building.tier[eid]! >= MAX_TIER) return 'Already at the top level';
  if (fireAt(city, eid) || isRuined(city, eid)) return 'Repair it first';
  if (Service.condition[eid]! < 0.5) return 'Too run down: renovate it first';
  if (city.credits < upgradeCost(city, eid)) return 'Not enough credits';
  return null;
}

/** Once per pulse, after condition and occupancy: buildings age, thriving ones grow toward their next level. */
export function updateLevels(city: City, ents: ArrayLike<number> & Iterable<number>, mod: Modifiers): void {
  for (const e of ents) {
    // Unfunded upkeep ages buildings faster (consequences, D-074).
    Service.age[e] = Service.age[e]! + city.consequences.mods.ageing;
    const st = buildings.at(Building.def[e]!).stats;
    if (st.population <= 0 && st.jobs <= 0) continue;
    const t = Building.tier[e]!;
    if (t >= MAX_TIER) continue;
    const thriving =
      !mod.down.has(e) &&
      Service.power[e]! >= 0.85 &&
      Service.water[e]! >= 0.85 &&
      Service.occupancy[e]! >= 0.85 &&
      Service.condition[e]! >= 0.7 &&
      Greenery.value[e]! >= 0.5;
    const v = thriving ? Service.thrive[e]! + 1 : Math.max(0, Service.thrive[e]! - 2);
    if (v >= LEVEL_DAYS[t]! * DAY_LENGTH) {
      Building.tier[e] = t + 1;
      Service.thrive[e] = 0;
      city.bus.emit('building:tier', { eid: e, tier: t + 1, paid: false });
    } else Service.thrive[e] = v;
  }
}

interface TileP {
  x: number;
  z: number;
}

export function registerLevelCommands(stack: CommandStack<SimCtx>): void {
  stack.register<TileP, { uid: number; tier: number; thrive: number; cost: number }>('upgradeBuilding', {
    apply({ city }, p) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid < 0 || upgradeBlocker(city, eid)) return null;
      const cost = upgradeCost(city, eid);
      const undo = { uid: Building.uid[eid]!, tier: Building.tier[eid]!, thrive: Service.thrive[eid]!, cost };
      city.credits -= cost;
      Building.tier[eid] = undo.tier + 1;
      Service.thrive[eid] = 0;
      city.bus.emit('building:tier', { eid, tier: undo.tier + 1, paid: true });
      return undo;
    },
    revert({ city }, _p, u) {
      const eid = city.buildingByUid(u.uid);
      if (eid < 0) return;
      Building.tier[eid] = u.tier;
      Service.thrive[eid] = u.thrive;
      city.credits += u.cost;
      city.bus.emit('building:tier', { eid, tier: u.tier, paid: true });
    },
  });

  stack.register<TileP, { uid: number; age: number; condition: number; scorch: number; cost: number }>('renovate', {
    apply({ city }, p) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid < 0 || fireAt(city, eid) || isRuined(city, eid)) return null;
      if (Service.age[eid]! < DAY_LENGTH * 0.5 && Service.condition[eid]! > 0.95 && Service.scorch[eid]! < 0.05) return null;
      const cost = renovateCost(city, eid);
      if (city.credits < cost) return null;
      const undo = {
        uid: Building.uid[eid]!,
        age: Service.age[eid]!,
        condition: Service.condition[eid]!,
        scorch: Service.scorch[eid]!,
        cost,
      };
      city.credits -= cost;
      Service.age[eid] = 0;
      Service.condition[eid] = 1;
      Service.scorch[eid] = 0;
      city.bus.emit('building:renovated', { eid });
      return undo;
    },
    revert({ city }, _p, u) {
      const eid = city.buildingByUid(u.uid);
      if (eid < 0) return;
      Service.age[eid] = u.age;
      Service.condition[eid] = u.condition;
      Service.scorch[eid] = u.scorch;
      city.credits += u.cost;
      city.bus.emit('building:renovated', { eid });
    },
  });
}
