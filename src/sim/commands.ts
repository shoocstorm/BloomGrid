import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord, City } from './City';
import { TAX_MAX, TAX_MIN } from './pulseState';

/** Cost of building a highway on a tile (bridges over water cost more). */
export function roadTileCost(city: City, t: number): number {
  return city.isWaterTile(t % city.grid.w, (t / city.grid.w) | 0) ? BRIDGE_COST : ROAD_COST;
}
import type { SimCtx } from './systems';

export interface BuildPayload {
  def: string;
  x: number;
  z: number;
  rot: number;
}
export interface TilePayload {
  x: number;
  z: number;
}
export interface RoadPayload {
  tiles: number[];
  /** Allow bridge decks over water tiles on the path. */
  bridges?: boolean;
}
export interface TaxPayload {
  rate: number;
}

export const ROAD_COST = 4;
export const BRIDGE_COST = 20;
export const DEMOLISH_REFUND = 0.5;

/** Registers the core city-building commands. Feature modules register their own. */
export function registerSimCommands(stack: CommandStack<SimCtx>): void {
  stack.register<BuildPayload, true>('build', {
    apply({ city }, p) {
      const def = buildings.get(p.def);
      if (!city.checkPlacement(def, p.x, p.z, p.rot).ok) return null;
      city.credits -= def.stats.cost;
      city.addBuilding({ ...p, greenery: 0 });
      return true;
    },
    revert({ city }, p) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid === NO_ENTITY) return;
      city.removeBuilding(eid);
      city.credits += buildings.get(p.def).stats.cost;
    },
  });

  stack.register<TilePayload, { record: BuildingRecord; refund: number }>('demolish', {
    apply({ city }, p) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid === NO_ENTITY) return null;
      const refund = city.buildingDef(eid).stats.cost * DEMOLISH_REFUND;
      const record = city.removeBuilding(eid);
      city.credits += refund;
      return { record, refund };
    },
    revert({ city }, _p, u) {
      city.addBuilding(u.record);
      city.credits -= u.refund;
    },
  });

  stack.register<RoadPayload, { placed: number[]; cost: number }>('road', {
    apply({ city }, p) {
      const placed: number[] = [];
      const seen = new Set<number>();
      let cost = 0;
      for (const t of p.tiles) {
        if (seen.has(t) || !city.canRoad(t, p.bridges)) continue;
        const c = roadTileCost(city, t);
        if (city.credits < cost + c) break;
        seen.add(t);
        placed.push(t);
        cost += c;
      }
      if (!placed.length) return null;
      city.credits -= cost;
      city.setRoads(placed, true);
      return { placed, cost };
    },
    revert({ city }, _p, u) {
      city.setRoads(u.placed, false);
      city.credits += u.cost;
    },
  });

  stack.register<RoadPayload, number[]>('unroad', {
    apply({ city }, p) {
      const removed = p.tiles.filter((t) => city.grid.road[t]);
      if (!removed.length) return null;
      city.setRoads(removed, false);
      return removed;
    },
    revert({ city }, _p, removed) {
      city.setRoads(removed, true);
    },
  });

  stack.register<TaxPayload, number>('setTax', {
    apply({ city }, p) {
      const rate = Math.min(TAX_MAX, Math.max(TAX_MIN, Math.round(p.rate * 100) / 100));
      if (rate === city.pulse.taxRate) return null;
      const prev = city.pulse.taxRate;
      city.pulse.taxRate = rate;
      return prev;
    },
    revert({ city }, _p, prev) {
      city.pulse.taxRate = prev;
    },
  });
}
