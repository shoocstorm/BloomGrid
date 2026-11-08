import { buildings } from '@/content';
import type { City } from '@/sim/City';
import type { SaveData } from '@/sim/save';
import type { MapCity } from './islandMap';

/*
 * City maps from the building registry. Apart from `islandMap.ts` so the welcome screen can paint islands without
 * loading every building recipe (it loads this lazily, D-148).
 */

/** The live city as a map (the showcase snapshot script uses it). */
export function mapOfCity(city: City): MapCity {
  return {
    roads: city.roadTiles(),
    lots: city.buildingEntities().map((e) => {
      const r = city.buildingRecord(e);
      const def = city.buildingDef(e);
      const [w, d] = city.footprint(def, r.rot);
      return { x: r.x, z: r.z, w, d, cat: def.category };
    }),
  };
}

/** A saved city as a map, read straight from its save (no need to load it). Unknown building ids are skipped. */
export function mapOfSave(data: Pick<SaveData, 'roads' | 'buildings'>): MapCity {
  const lots: MapCity['lots'] = [];
  for (const [id, x, z, rot] of data.buildings) {
    if (!buildings.has(id)) continue;
    const def = buildings.get(id);
    const [fw, fd] = def.footprint;
    const [w, d] = rot % 2 ? [fd, fw] : [fw, fd];
    lots.push({ x, z, w, d, cat: def.category });
  }
  return { roads: data.roads, lots };
}
