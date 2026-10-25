import type { City } from '@/sim/City';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { NO_ENTITY } from '@/sim/Grid';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';

/** Player body radius and the tallest ledge it steps up without jumping (world units). */
export const RADIUS = 0.06;
export const STEP = 0.18;

interface Solid {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  top: number;
}

/**
 * Explore-mode collision (D-025): terrain, bridge decks, water and building volumes. A building's
 * solid box is its recipe's solid bounds (slabs, glass, moss beds; not trees or domes), so a park
 * or plaza is walkable while towers are walls. Boxes are cached per entity; call `clear()` when
 * buildings or terrain change.
 */
export function createCollider(city: City) {
  const solids = new Map<number, Solid>();
  const solidOf = (eid: number): Solid => {
    let s = solids.get(eid);
    if (s) return s;
    const r = city.buildingRecord(eid);
    const def = city.buildingDef(eid);
    const place = placeBuilding(city.grid, def, r.x, r.z, r.rot);
    const [w, d] = city.footprint(def, r.rot);
    const b = place.template.bounds;
    const baseY = place.base.elements[13]!;
    // Recipe bounds are local (pre-rotation); an inset of the footprint matching the narrower
    // side of the solid volume is close enough for walking around.
    const inset = 0.5 - Math.min(0.48, Math.max(0.1, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) / Math.max(w, d) / 2));
    s = { x0: r.x + inset, z0: r.z + inset, x1: r.x + w - inset, z1: r.z + d - inset, top: baseY + b.top };
    solids.set(eid, s);
    return s;
  };

  /** Ground under (x, z): terrain, a bridge deck, or the top of a low solid (plaza, park bed). */
  const groundAt = (x: number, z: number, feet: number): number => {
    const g = city.grid;
    if (!g.inBounds(Math.floor(x), Math.floor(z))) return g.heightAt(x, z);
    const t = g.index(Math.floor(x), Math.floor(z));
    let y = g.road[t] === BRIDGE ? BRIDGE_DECK + 0.035 : g.heightAt(x, z);
    const eid = g.occupant[t]!;
    if (eid !== NO_ENTITY) {
      const s = solidOf(eid);
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.top <= feet + STEP) y = Math.max(y, s.top);
    }
    return y;
  };

  /** True if a body at (x, z) with feet at `feet` would be inside a wall, in deep water or off the map. */
  const blocked = (x: number, z: number, feet: number, swim: boolean, waterLevel: number): boolean => {
    const g = city.grid;
    if (x < 0.2 || z < 0.2 || x > g.w - 0.2 || z > g.h - 0.2) return true;
    if (!swim && g.heightAt(x, z) < waterLevel - 0.04 && g.road[g.index(Math.floor(x), Math.floor(z))] !== BRIDGE) return true;
    for (const [ox, oz] of [
      [RADIUS, 0],
      [-RADIUS, 0],
      [0, RADIUS],
      [0, -RADIUS],
    ] as const) {
      const tx = Math.floor(x + ox);
      const tz = Math.floor(z + oz);
      if (!g.inBounds(tx, tz)) continue;
      const eid = g.occupant[g.index(tx, tz)]!;
      if (eid === NO_ENTITY) continue;
      const s = solidOf(eid);
      if (x + ox >= s.x0 && x + ox <= s.x1 && z + oz >= s.z0 && z + oz <= s.z1 && feet < s.top - STEP) return true;
    }
    return false;
  };

  return { groundAt, blocked, clear: () => solids.clear() };
}
