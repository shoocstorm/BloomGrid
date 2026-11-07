import type { Builder } from './builders';
import { registerBridgeCommands, restoreBridges, type BridgeRecord } from './bridges';
import { registerRoadCommands, roadLevels, setRoadLevels } from './roads';
import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord, City } from './City';
import { TAX_MAX, TAX_MIN } from './pulseState';
import { registerFinanceCommands } from './finance';
import { registerHazardCommands } from './hazards';
import { registerFireworksCommands } from './fireworks';
import { registerProjectCommands } from './projects';
import { registerMilestoneCommands } from './milestones';
import { registerHappeningCommands } from './happenings';
import { registerTipCommands } from './tips';
import { registerFloraCommands } from './flora';
import { registerLevelCommands } from './levels';
import { registerSwitchCommands } from './switches';
import { registerDisasterCommands } from './disasters';
import { registerRelocateCommands } from './relocate';
import { MIST_COST, MIST_RADIUS, ZONE, mistZones } from './floranet';
import { RECLAIM_HEIGHT, cornersOf, reclaimPlan, setCorners } from './coast';
import { planRoad } from './roadPlan';
import { gradeLots } from './grading';
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
  /** Who builds it (D-128); default the steward. */
  by?: Builder;
}
export interface TilePayload {
  x: number;
  z: number;
}
export interface RoadPayload {
  tiles: number[];
  /** Allow bridge decks over water tiles on the path. */
  bridges?: boolean;
  /** Who builds it (D-128); default the steward. */
  by?: Builder;
}
export interface TaxPayload {
  rate: number;
}

export const ROAD_COST = 4;
export const BRIDGE_COST = 20;
/** Costs the highway planner works with (D-125): a redraw that clears overgrowth costs a road tile. */
export const ROAD_PLAN_COSTS = { road: ROAD_COST, bridge: BRIDGE_COST, clear: ROAD_COST };
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
  registerHazardCommands(stack);
  registerFireworksCommands(stack);
  registerProjectCommands(stack);
  registerMilestoneCommands(stack);
  registerHappeningCommands(stack);
  registerTipCommands(stack);
  registerFloraCommands(stack);
  registerLevelCommands(stack);
  registerSwitchCommands(stack);
  registerDisasterCommands(stack);
  registerRelocateCommands(stack);
  registerMist(stack);
  registerReclaim(stack);
  registerWeaver(stack);
  registerRoadCommands(stack);
  registerBridgeCommands(stack);
  stack.register<BuildPayload, { corners: [number, number][]; edits: [number, number | undefined][] }>('build', {
    apply({ city }, p) {
      const def = buildings.get(p.def);
      if (!city.checkPlacement(def, p.x, p.z, p.rot).ok) return null;
      city.credits -= def.stats.cost;
      city.addBuilding({ ...p, greenery: 0, by: p.by ?? 'player' });
      // Grade the lot to its street and cut back banks round it (D-099); undo puts the ground back.
      const [w, d] = city.footprint(def, p.rot);
      const grade = gradeLots(city, [{ x: p.x, z: p.z, w, d }]);
      const h = city.grid.heights;
      const undo = {
        corners: grade.map(([c]) => [c, h[c]!] as [number, number]),
        edits: grade.map(([c]) => [c, city.terrainEdits.get(c)] as [number, number | undefined]),
      };
      setCorners(city, grade);
      return undo;
    },
    revert({ city }, p, u) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid === NO_ENTITY) return;
      city.releaseUid(city.removeBuilding(eid).uid!);
      city.credits += buildings.get(p.def).stats.cost;
      setCorners(city, u.corners);
      for (const [c, e] of u.edits) if (e === undefined) city.terrainEdits.delete(c);
      else city.terrainEdits.set(c, e);
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

  // Several buildings in one step (a group selection, D-070): one undo puts them all back, with their serials.
  stack.register<{ tiles: [number, number][] }, { records: BuildingRecord[]; refund: number }>('demolishMany', {
    apply({ city }, p) {
      const eids = [...new Set(p.tiles.map(([x, z]) => city.buildingAt(x, z)).filter((e) => e !== NO_ENTITY))];
      if (!eids.length) return null;
      let refund = 0;
      const records: BuildingRecord[] = [];
      for (const eid of eids) {
        refund += city.buildingDef(eid).stats.cost * DEMOLISH_REFUND;
        records.push(city.removeBuilding(eid));
      }
      city.credits += refund;
      return { records, refund };
    },
    revert({ city }, _p, u) {
      for (const r of u.records) city.addBuilding(r);
      city.credits -= u.refund;
    },
  });

  stack.register<
    RoadPayload,
    {
      placed: number[];
      cleared: [number, number][];
      cost: number;
      corners: [number, number][];
      edits: [number, number | undefined][];
    }
  >('road', {
    apply({ city }, p) {
      // One plan for the preview and the command (D-125): abutments, landing, skips and the budget.
      const plan = planRoad(city, p.tiles, !!p.bridges, ROAD_PLAN_COSTS);
      if (!plan.place.length && !plan.clear.length) return null;
      const og = city.grid.layer<Uint8Array>('overgrowth');
      const cleared = plan.clear.map((t) => [t, og?.[t] ?? 0] as [number, number]);
      const h = city.grid.heights;
      const corners = plan.grade.map(([c]) => [c, h[c]!] as [number, number]);
      const edits = plan.grade.map(([c]) => [c, city.terrainEdits.get(c)] as [number, number | undefined]);
      city.credits -= plan.cost;
      // Abutments first: the bank must be graded before the tile is judged land or bridge.
      if (plan.grade.length) setCorners(city, plan.grade);
      if (plan.place.length) city.setRoads(plan.place, true, p.by ?? 'player');
      if (cleared.length) setOvergrowth(city, cleared.map(([t]) => [t, 0]));
      return { placed: plan.place, cleared, cost: plan.cost, corners, edits };
    },
    revert({ city }, _p, u) {
      if (u.placed.length) city.setRoads(u.placed, false);
      if (u.cleared.length) setOvergrowth(city, u.cleared);
      if (u.corners.length) {
        setCorners(city, u.corners);
        for (const [c, e] of u.edits) if (e === undefined) city.terrainEdits.delete(c);
        else city.terrainEdits.set(c, e);
      }
      city.credits += u.cost;
    },
  });

  stack.register<RoadPayload, { tiles: number[]; levels: number[]; bridges: BridgeRecord[] }>('unroad', {
    apply({ city }, p) {
      const removed = p.tiles.filter((t) => city.grid.road[t]);
      if (!removed.length) return null;
      const lv = roadLevels(city);
      const levels = removed.map((t) => lv[t]!);
      const bridges = city.bridges.map((b) => ({ ...b }));
      city.setRoads(removed, false);
      return { tiles: removed, levels, bridges };
    },
    revert({ city }, _p, u) {
      city.setRoads(u.tiles, true, 'system', true);
      setRoadLevels(city, u.tiles.map((t, i) => [t, u.levels[i]!]));
      // Restored spans keep their names, dates and builders (D-128).
      restoreBridges(city, u.bridges);
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
      // Each retrofitted building books an even share of the bill (D-128).
      for (const e of plan.eids) city.addSpend(e, plan.cost / plan.eids.length);
      city.bus.emit('buildings:level', { eids: plan.eids, origin: { x: p.x, z: p.z, radius: p.radius } });
      return undo;
    },
    revert({ city }, _p, u) {
      for (const [e, g] of u.eids) {
        Building.level[e] = 0;
        Greenery.value[e] = g;
        city.addSpend(e, -u.cost / u.eids.length);
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
      city.addSpend(eid, plan.cost);
      city.bus.emit('buildings:level', { eids: [eid] });
      return undo;
    },
    revert({ city }, _p, u) {
      Building.level[u.eid] = u.level;
      Greenery.value[u.eid] = u.greenery;
      city.credits += u.cost;
      city.addSpend(u.eid, -u.cost);
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
    if (typeof def.recipe !== 'function' || def.retrofit === false || def.category === 'nature') continue;
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
