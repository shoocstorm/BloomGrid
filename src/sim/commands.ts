import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord, City } from './City';
import { TAX_MAX, TAX_MIN } from './pulseState';
import { registerFinanceCommands } from './finance';

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

/** Writes overgrowth values for road tiles, keeping counts, networks and renderers in sync. */
function setOvergrowth(city: City, values: [number, number][]): void {
  const og = city.grid.addLayer('overgrowth', (n) => new Uint8Array(n));
  for (const [t, v] of values) {
    if (og[t] === 0 && v > 0) city.steward.overgrown++;
    if (og[t]! > 0 && v === 0) city.steward.overgrown--;
    og[t] = v;
  }
  city.networks.dirty = true;
  city.bus.emit('road:overgrowth', { tiles: values.map(([t]) => t) });
}

/** Registers the core city-building commands. Feature modules register their own. */
export function registerSimCommands(stack: CommandStack<SimCtx>): void {
  registerFinanceCommands(stack);
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

  stack.register<RoadPayload, { placed: number[]; cleared: [number, number][]; cost: number }>('road', {
    apply({ city }, p) {
      const placed: number[] = [];
      const cleared: [number, number][] = [];
      const seen = new Set<number>();
      const og = city.grid.layer<Uint8Array>('overgrowth');
      let cost = 0;
      for (const t of p.tiles) {
        if (seen.has(t)) continue;
        // Redrawing over an overgrown highway clears it.
        if (city.grid.road[t] && og && og[t]! > 0 && city.credits >= cost + ROAD_COST) {
          seen.add(t);
          cleared.push([t, og[t]!]);
          cost += ROAD_COST;
          continue;
        }
        if (!city.canRoad(t, p.bridges)) continue;
        const c = roadTileCost(city, t);
        if (city.credits < cost + c) break;
        seen.add(t);
        placed.push(t);
        cost += c;
      }
      if (!placed.length && !cleared.length) return null;
      city.credits -= cost;
      if (placed.length) city.setRoads(placed, true);
      if (cleared.length) setOvergrowth(city, cleared.map(([t]) => [t, 0]));
      return { placed, cleared, cost };
    },
    revert({ city }, _p, u) {
      if (u.placed.length) city.setRoads(u.placed, false);
      if (u.cleared.length) setOvergrowth(city, u.cleared);
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
