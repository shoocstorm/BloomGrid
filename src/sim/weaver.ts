import { Building } from '@/ecs/components';
import { NO_ENTITY } from './Grid';
import type { City } from './City';

/** Building level meaning "merged with a banyan" (above a Bloom Retrofit, which is 1). */
export const BANYAN_LEVEL = 2;
/** Banyan merges cost this share of the tower's price. */
export const BANYAN_SHARE = 0.6;
export const BRIDGE_MIN = 3;
export const BRIDGE_MAX = 18;
export const BRIDGES_PER_TOWER = 3;

/** A woven sky-bridge between two towers, keyed by the towers' footprint anchors. */
export interface SkyBridge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Tower entity anchored at (x, z) (building record origin), or NO_ENTITY. */
export function towerAt(city: City, x: number, z: number): number {
  const eid = city.buildingAt(x, z);
  if (eid === NO_ENTITY || Building.x[eid] !== x || Building.z[eid] !== z) return NO_ENTITY;
  return city.buildingDef(eid).tower ? eid : NO_ENTITY;
}

const centre = (eid: number): [number, number] => [Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2];

/** Bridges whose two towers still stand (demolished ends deactivate a bridge; undo revives it). */
export function activeBridges(city: City): { bridge: SkyBridge; a: number; b: number }[] {
  const out: { bridge: SkyBridge; a: number; b: number }[] = [];
  for (const bridge of city.weaver.bridges) {
    const a = towerAt(city, bridge.ax, bridge.az);
    const b = towerAt(city, bridge.bx, bridge.bz);
    if (a !== NO_ENTITY && b !== NO_ENTITY) out.push({ bridge, a, b });
  }
  return out;
}

export interface WeavePlan {
  ok: boolean;
  cost: number;
  reason?: string;
  length: number;
}

/** Can a sky-bridge be woven between towers a and b (entities)? */
export function bridgePlan(city: City, a: number, b: number): WeavePlan {
  if (a === NO_ENTITY || b === NO_ENTITY || !city.buildingDef(a).tower || !city.buildingDef(b).tower) return { ok: false, cost: 0, length: 0, reason: 'Sky-bridges join two towers' };
  if (a === b) return { ok: false, cost: 0, length: 0, reason: 'Pick a second tower' };
  const [ax, az] = centre(a);
  const [bx, bz] = centre(b);
  const length = Math.hypot(bx - ax, bz - az);
  if (length < BRIDGE_MIN) return { ok: false, cost: 0, length, reason: 'Too close for a sky-bridge' };
  if (length > BRIDGE_MAX) return { ok: false, cost: 0, length, reason: `Too far (max ${BRIDGE_MAX} tiles)` };
  const active = activeBridges(city);
  const count = (e: number) => active.filter((x) => x.a === e || x.b === e).length;
  if (active.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return { ok: false, cost: 0, length, reason: 'Already woven' };
  if (count(a) >= BRIDGES_PER_TOWER || count(b) >= BRIDGES_PER_TOWER) return { ok: false, cost: 0, length, reason: `A tower holds at most ${BRIDGES_PER_TOWER} bridges` };
  const cost = Math.round(100 + length * 35);
  if (city.credits < cost) return { ok: false, cost, length, reason: 'Not enough credits' };
  return { ok: true, cost, length };
}

/** Can tower `eid` be merged with a banyan? */
export function banyanPlan(city: City, eid: number): WeavePlan {
  if (eid === NO_ENTITY || !city.buildingDef(eid).tower) return { ok: false, cost: 0, length: 0, reason: 'Only towers can merge with a banyan' };
  if (Building.level[eid] === BANYAN_LEVEL) return { ok: false, cost: 0, length: 0, reason: 'Already merged with a banyan' };
  const cost = Math.round(city.buildingDef(eid).stats.cost * BANYAN_SHARE);
  if (city.credits < cost) return { ok: false, cost, length: 0, reason: 'Not enough credits' };
  return { ok: true, cost, length: 0 };
}

/** Per-building count of active bridge ends (amenity and ecology bonuses in the pulse). */
export function bridgeEnds(city: City): Map<number, number> {
  const m = new Map<number, number>();
  for (const { a, b } of activeBridges(city)) {
    m.set(a, (m.get(a) ?? 0) + 1);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}
