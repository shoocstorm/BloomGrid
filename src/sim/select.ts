import { Building } from '@/ecs/components';
import { NO_ENTITY } from './Grid';
import type { City } from './City';

/**
 * Group selection (D-070): the buildings of one type inside a tile rectangle. The type is the building under the
 * drag's first corner when there is one, otherwise the most common type in the rectangle (ties: the type found
 * first, scanning row by row). A building counts when its footprint's centre is inside. Pure and deterministic.
 */
export function selectInRect(
  city: City,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { def: string | null; eids: number[] } {
  const [x0, x1, z0, z1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
  const inside: number[] = [];
  const seen = new Set<number>();
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const e = city.buildingAt(x, z);
      if (e === NO_ENTITY || seen.has(e)) continue;
      seen.add(e);
      const cx = Building.x[e]! + Building.w[e]! / 2;
      const cz = Building.z[e]! + Building.d[e]! / 2;
      if (cx >= x0 && cx <= x1 + 1 && cz >= z0 && cz <= z1 + 1) inside.push(e);
    }
  const anchor = city.buildingAt(ax, az);
  let def = anchor !== NO_ENTITY ? city.buildingDef(anchor).id : null;
  if (!def) {
    const counts = new Map<string, number>();
    for (const e of inside) counts.set(city.buildingDef(e).id, (counts.get(city.buildingDef(e).id) ?? 0) + 1);
    let best = 0;
    for (const [id, n] of counts) if (n > best) [def, best] = [id, n];
  }
  if (!def) return { def: null, eids: [] };
  const eids = inside.filter((e) => city.buildingDef(e).id === def);
  // The anchor counts even when its centre lies just outside the rectangle.
  if (anchor !== NO_ENTITY && !eids.includes(anchor)) eids.unshift(anchor);
  return { def, eids };
}
