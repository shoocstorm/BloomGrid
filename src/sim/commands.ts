import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord, City } from './City';
import { TAX_MAX, TAX_MIN } from './pulseState';
import { registerFinanceCommands } from './finance';
import { MIST_COST, MIST_RADIUS, ZONE, mistZones } from './floranet';
import { RECLAIM_HEIGHT, cornersOf, reclaimPlan, setCorners } from './coast';
import { BANYAN_LEVEL, banyanPlan, bridgePlan, towerAt } from './weaver';
import { Building, Greenery } from '@/ecs/components';

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
  registerMist(stack);
  registerReclaim(stack);
  registerWeaver(stack);
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

  stack.register<RoadPayload, [number, number][]>('channel', {
    apply({ city }, p) {
      const placed: [number, number][] = [];
      let cost = 0;
      for (const t of p.tiles) {
        if (placed.some(([u]) => u === t) || !city.canChannel(t) || city.credits < cost + CHANNEL_COST) continue;
        placed.push([t, 1]);
        cost += CHANNEL_COST;
      }
      if (!placed.length) return null;
      city.credits -= cost;
      city.setChannels(placed);
      return placed;
    },
    revert({ city }, _p, placed) {
      city.setChannels(placed.map(([t]) => [t, 0]));
      city.credits += placed.length * CHANNEL_COST;
    },
  });

  stack.register<RoadPayload, [number, number][]>('unchannel', {
    apply({ city }, p) {
      const removed = p.tiles.filter((t) => city.channelAt(t)).map((t) => [t, city.channelAt(t)] as [number, number]);
      if (!removed.length) return null;
      city.setChannels(removed.map(([t]) => [t, 0]));
      return removed;
    },
    revert({ city }, _p, removed) {
      city.setChannels(removed);
    },
  });

  stack.register<RetrofitPayload, RetrofitUndo>('retrofit', {
    apply({ city }, p) {
      const plan = retrofitPlan(city, p.x, p.z, p.radius);
      if (!plan.eids.length || city.credits < plan.cost) return null;
      const undo: RetrofitUndo = { eids: plan.eids.map((e) => [e, Greenery.value[e]!]), channels: plan.channels.map((t) => [t, city.channelAt(t)]), cost: plan.cost };
      for (const e of plan.eids) {
        Building.level[e] = 1;
        Greenery.value[e] = Math.max(Greenery.value[e]!, 0.85);
      }
      if (plan.channels.length) city.setChannels(plan.channels.map((t) => [t, 2]));
      city.credits -= plan.cost;
      city.bus.emit('buildings:level', { eids: plan.eids, origin: { x: p.x, z: p.z, radius: p.radius } });
      return undo;
    },
    revert({ city }, _p, u) {
      for (const [e, g] of u.eids) {
        Building.level[e] = 0;
        Greenery.value[e] = g;
      }
      if (u.channels.length) city.setChannels(u.channels);
      city.credits += u.cost;
      city.bus.emit('buildings:level', { eids: u.eids.map(([e]) => e) });
    },
  });
}

export interface MistPayload {
  x: number;
  z: number;
}

/** Flora-Net mist dispatch: drones and pods soak the 3×3 soil zones around (x, z). */
function registerMist(stack: CommandStack<SimCtx>): void {
  stack.register<MistPayload, { zones: [number, number][] }>('mist', {
    apply({ city }, p) {
      const zones = mistZones(city, p.x, p.z);
      if (!zones.length || city.credits < MIST_COST) return null;
      const H = city.soil.hydration;
      const undo = { zones: zones.map((z) => [z, H[z]!] as [number, number]) };
      for (const z of zones) H[z] = Math.min(1, H[z]! + 0.35);
      city.credits -= MIST_COST;
      city.bus.emit('floranet:mist', { x: p.x, z: p.z, radius: (MIST_RADIUS + 0.5) * ZONE });
      return undo;
    },
    revert({ city }, _p, u) {
      for (const [z, v] of u.zones) city.soil.hydration[z] = v;
      city.credits += MIST_COST;
    },
  });
}

export interface ReclaimPayload {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Land reclamation: shallow sea in the rectangle becomes flat land at RECLAIM_HEIGHT. */
function registerReclaim(stack: CommandStack<SimCtx>): void {
  stack.register<ReclaimPayload, { corners: [number, number][]; edits: [number, number | undefined][]; cost: number }>('reclaim', {
    apply({ city }, p) {
      const plan = reclaimPlan(city, p.x0, p.z0, p.x1, p.z1);
      if (!plan.tiles.length || city.credits < plan.cost) return null;
      const corners = cornersOf(city, plan.tiles);
      const h = city.grid.heights;
      const undo = { corners: corners.map((c) => [c, h[c]!] as [number, number]), edits: corners.map((c) => [c, city.terrainEdits.get(c)] as [number, number | undefined]), cost: plan.cost };
      // Raised corners keep any existing higher ground (the shoreline blends into the fill).
      setCorners(city, corners.map((c) => [c, Math.max(h[c]!, RECLAIM_HEIGHT)]));
      city.credits -= plan.cost;
      return undo;
    },
    revert({ city }, _p, u) {
      setCorners(city, u.corners);
      for (const [c, e] of u.edits) if (e === undefined) city.terrainEdits.delete(c);
      else city.terrainEdits.set(c, e);
      city.credits += u.cost;
    },
  });
}

export interface WeavePayload {
  /** Footprint anchors (building record x, z) of the two towers. */
  a: [number, number];
  b: [number, number];
}

/** Green Weaver: sky-bridges between towers and tower–banyan merges. */
function registerWeaver(stack: CommandStack<SimCtx>): void {
  stack.register<WeavePayload, { cost: number }>('weave', {
    apply({ city }, p) {
      const plan = bridgePlan(city, towerAt(city, p.a[0], p.a[1]), towerAt(city, p.b[0], p.b[1]));
      if (!plan.ok) return null;
      city.weaver.bridges.push({ ax: p.a[0], az: p.a[1], bx: p.b[0], bz: p.b[1] });
      city.credits -= plan.cost;
      city.bus.emit('weaver:changed', undefined);
      return { cost: plan.cost };
    },
    revert({ city }, _p, u) {
      city.weaver.bridges.pop();
      city.credits += u.cost;
      city.bus.emit('weaver:changed', undefined);
    },
  });
  stack.register<{ x: number; z: number }, { eid: number; level: number; greenery: number; cost: number }>('banyan', {
    apply({ city }, p) {
      const eid = towerAt(city, p.x, p.z);
      const plan = banyanPlan(city, eid);
      if (!plan.ok) return null;
      const undo = { eid, level: Building.level[eid]!, greenery: Greenery.value[eid]!, cost: plan.cost };
      Building.level[eid] = BANYAN_LEVEL;
      Greenery.value[eid] = 1;
      city.credits -= plan.cost;
      city.bus.emit('buildings:level', { eids: [eid] });
      return undo;
    },
    revert({ city }, _p, u) {
      Building.level[u.eid] = u.level;
      Greenery.value[u.eid] = u.greenery;
      city.credits += u.cost;
      city.bus.emit('buildings:level', { eids: [u.eid] });
    },
  });
}

export interface RetrofitPayload {
  x: number;
  z: number;
  radius: number;
}
interface RetrofitUndo {
  eids: [number, number][];
  channels: [number, number][];
  cost: number;
}

export const CHANNEL_COST = 6;
/** Retrofit costs this share of each building's price. */
export const RETROFIT_SHARE = 0.4;
export const RETROFIT_RADIUS = 14;

/** Which buildings and channels a Bloom Retrofit at (x, z) would transform, and the price. */
export function retrofitPlan(city: City, x: number, z: number, radius: number): { eids: number[]; channels: number[]; cost: number } {
  const eids: number[] = [];
  let cost = 0;
  for (const e of city.buildingEntities()) {
    if (Building.level[e]) continue;
    const def = city.buildingDef(e);
    if (typeof def.recipe !== 'function' || def.category === 'nature') continue;
    const dx = Building.x[e]! + Building.w[e]! / 2 - x;
    const dz = Building.z[e]! + Building.d[e]! / 2 - z;
    if (dx * dx + dz * dz > radius * radius) continue;
    eids.push(e);
    cost += def.stats.cost * RETROFIT_SHARE;
  }
  const channels: number[] = [];
  const ch = city.grid.layer<Uint8Array>('channel');
  if (ch)
    for (let j = Math.max(0, Math.floor(z - radius)); j <= Math.min(city.grid.h - 1, Math.ceil(z + radius)); j++)
      for (let i = Math.max(0, Math.floor(x - radius)); i <= Math.min(city.grid.w - 1, Math.ceil(x + radius)); i++) {
        const t = j * city.grid.w + i;
        if (ch[t] === 1 && (i + 0.5 - x) ** 2 + (j + 0.5 - z) ** 2 <= radius * radius) channels.push(t);
      }
  return { eids, channels, cost: Math.round(cost) };
}
