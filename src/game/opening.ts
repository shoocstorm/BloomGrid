import { buildings } from '@/content';
import { Building } from '@/ecs/components';
import type { City } from '@/sim/City';
import type { CameraView } from '@/input/CityCamera';

/**
 * Where a city opens: a low, sweeping view of its largest landmark (the Wellspring Spire and its
 * hero quarter in the founding city), else the middle of what is built (a fresh island), else the old downtown view.
 */
export function openingView(city: City): CameraView {
  let best = -1;
  let area = 0;
  for (const eid of city.buildingEntities()) {
    const def = buildings.at(Building.def[eid]!);
    const a = def.footprint[0] * def.footprint[1];
    if (def.landmark && a > area) [best, area] = [eid, a];
  }
  if (best < 0) {
    // No landmark (a fresh island, D-072): the middle of what is built, else the old downtown view.
    const ents = city.buildingEntities();
    if (!ents.length) return { x: city.grid.w * 0.52, z: city.grid.h * 0.66, yaw: Math.PI * 0.25, pitch: 0.85, distance: 60 };
    let [sx, sz] = [0, 0];
    for (const e of ents) [sx, sz] = [sx + Building.x[e]! + Building.w[e]! / 2, sz + Building.z[e]! + Building.d[e]! / 2];
    return { x: sx / ents.length, z: sz / ents.length, yaw: Math.PI * 0.15, pitch: 0.55, distance: 55 };
  }
  const x = Building.x[best]! + Building.w[best]! / 2;
  const z = Building.z[best]! + Building.d[best]! / 2;
  // Aim a little past the landmark (away from the camera) so its spire clears the top HUD.
  const yaw = 0.3;
  return { x: x - Math.sin(yaw) * 16, z: z - Math.cos(yaw) * 16, yaw, pitch: 0.34, distance: 130 };
}
