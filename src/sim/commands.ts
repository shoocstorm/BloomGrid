import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord } from './City';
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
}

export const ROAD_COST = 4;
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

  stack.register<RoadPayload, number[]>('road', {
    apply({ city }, p) {
      const placed: number[] = [];
      for (const t of p.tiles) {
        if (city.credits < ROAD_COST * (placed.length + 1)) break;
        if (city.canRoad(t) && !placed.includes(t)) placed.push(t);
      }
      if (!placed.length) return null;
      city.credits -= placed.length * ROAD_COST;
      city.setRoads(placed, true);
      return placed;
    },
    revert({ city }, _p, placed) {
      city.setRoads(placed, false);
      city.credits += placed.length * ROAD_COST;
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
}
