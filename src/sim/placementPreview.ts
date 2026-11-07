import { query } from 'bitecs';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef } from '@/content/types';
import type { City } from './City';

/**
 * What a building would do on a lot, before it is placed (D-121): the area it serves (drawn as a ring by the
 * Build tool), the symbiotic partners it would pair with or complete, and the lot's land value. Pure and cheap
 * (one pass over buildings with a pairing rule), so the Build tool can call it on every hover change.
 */
export interface PlacementPreview {
  /** Service area in tiles from the footprint's centre, and what it covers. */
  area: { radius: number; label: string } | null;
  /** Names of nearby buildings this one would pair with (its own `symbiosis` partners in range). */
  pairsWith: string[];
  /** Names of nearby buildings that would gain a partner from this one. */
  completes: string[];
  /** Land value (desirability) under the footprint, 0..1. */
  landValue: number;
}

/** The area a building serves, if it has one (first match: response, drones, shelter, defence, transit, pairing). */
export function serviceArea(def: BuildingDef): PlacementPreview['area'] {
  if (def.response) return { radius: def.response.radius, label: 'fire cover' };
  if (def.drones) return { radius: def.drones.radius, label: 'drone reach' };
  if (def.shelter) return { radius: def.shelter.radius, label: 'shelter' };
  if (def.defence) return { radius: def.defence.radius, label: 'flood defence' };
  if (def.transit)
    return { radius: def.transit.radius, label: def.transit.rail ? 'station catchment' : 'pod catchment' };
  if (def.symbiosis) return { radius: def.symbiosis.radius, label: 'pairing range' };
  return null;
}

export function placementPreview(
  city: City,
  def: BuildingDef,
  x: number,
  z: number,
  rot: number,
): PlacementPreview {
  const [w, d] = city.footprint(def, rot);
  const cx = x + w / 2;
  const cz = z + d / 2;
  const pairsWith = new Set<string>();
  const completes = new Set<string>();
  const own = def.symbiosis;
  for (const eid of query(city.world, [Building])) {
    const other = buildings.at(Building.def[eid]!);
    const ox = Building.x[eid]! + Building.w[eid]! / 2;
    const oz = Building.z[eid]! + Building.d[eid]! / 2;
    const d2 = (ox - cx) ** 2 + (oz - cz) ** 2;
    if (own && own.partners.includes(other.id) && d2 <= own.radius ** 2) pairsWith.add(other.name);
    const s = other.symbiosis;
    if (s && s.partners.includes(def.id) && d2 <= s.radius ** 2) completes.add(other.name);
  }
  const g = city.grid;
  const des = city.fields.desirability;
  let sum = 0;
  let n = 0;
  for (let j = z; j < z + d; j++)
    for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      sum += des[g.index(i, j)]!;
      n++;
    }
  return {
    area: serviceArea(def),
    pairsWith: [...pairsWith],
    completes: [...completes],
    landValue: n ? sum / n : 0,
  };
}
