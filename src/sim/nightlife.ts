import { query } from 'bitecs';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import type { Fields } from './fields';
import { blurPeak, boxBlur } from './blur';

const ACTIVITY_BLUR = { r: 3, passes: 2 };
const ACTIVITY_SCALE = 1 / blurPeak(ACTIVITY_BLUR.r, ACTIVITY_BLUR.passes);
/** People-equivalents per tile that reach ~63% activity (1 − e⁻¹). */
const PEOPLE_PER_UNIT = 150;

/** 0..1 pedestrian density per tile (residents, workers and visitors on foot). */
export function activityLayer(city: City): Float32Array {
  const g = city.grid;
  return g.addLayer('activity', () => new Float32Array(g.w * g.h));
}

/**
 * Pedestrian-density field (Phase 7): residents, staffed jobs and amenity visitors deposit at
 * their building, spread a few tiles by box blurs (D-020 pattern) and are weighted toward the
 * places people walk: highways and parks carry more, open land less. Unpowered or worn-down
 * buildings empty their streets. Purely derived (not saved); night glow scales with it.
 */
export function computeActivity(city: City, f: Fields): void {
  const g = city.grid;
  const a = activityLayer(city);
  a.fill(0);
  for (const eid of query(city.world, [Building])) {
    const d = buildings.at(Building.def[eid]!);
    const st = d.stats;
    const occ = Service.occupancy[eid]!;
    // Amenities draw visitors (parks and sanctuaries are where evenings happen).
    const visitors = Math.max(0, st.happiness) * (d.category === 'nature' ? 5 : 2.5) + (Building.level[eid]! > 0 ? 4 : 0);
    const people = (st.population * occ + st.jobs * occ * 0.6 + visitors) * (0.3 + 0.7 * Service.power[eid]!) * (0.5 + 0.5 * Service.condition[eid]!);
    if (people <= 0) continue;
    a[g.index(Building.x[eid]! + (Building.w[eid]! >> 1), Building.z[eid]! + (Building.d[eid]! >> 1))] += (people / PEOPLE_PER_UNIT) * ACTIVITY_SCALE;
  }
  boxBlur(a, g.w, g.h, ACTIVITY_BLUR.r, ACTIVITY_BLUR.passes);
  let sum = 0;
  let built = 0;
  for (let i = 0; i < a.length; i++) {
    if (f.shore[i] === 0) {
      a[i] = 0;
      continue;
    }
    const occupied = g.occupant[i] !== NO_ENTITY;
    const w = g.road[i] ? 1.25 : occupied ? 1 : 0.55;
    const v = 1 - Math.exp(-Math.max(0, a[i]!) * w);
    a[i] = v;
    if (occupied || g.road[i]) {
      sum += v;
      built++;
    }
  }
  city.pulse.nightlife = built ? sum / built : 0;
}
