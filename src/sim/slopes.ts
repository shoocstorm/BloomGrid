import { Building } from '@/ecs/components';
import type { City } from './City';

/**
 * Bare slopes (plan v5, Phase 27): buildings standing on or under a steep bank with little living ground round
 * them. A monsoon can bring such a bank down (the landslide chain). Steepness is the height span over the lot and a
 * ring of `RING` tiles round it; bareness is the ecology field at the lot's centre (wild land and green buildings
 * hold the soil). Pure; cached per pulse because the crisis weight and the chain check both ask.
 */
export const RING = 3;
/** Height span (world units) over lot + ring that counts as a steep bank. */
export const STEEP = 3;
/** Ecology at or above this holds the bank. */
export const ROOTED = 0.55;

export interface SlopeSite {
  eid: number;
  x: number;
  z: number;
  /** 0..1+: steepness beyond STEEP times bareness. */
  risk: number;
}

let cache: { city: City; tick: number; sites: SlopeSite[] } | null = null;

/** Buildings on bare, steep ground, riskiest first. */
export function slopeSites(city: City): SlopeSite[] {
  if (cache && cache.city === city && cache.tick === city.tick) return cache.sites;
  const sites: SlopeSite[] = [];
  const eco = city.fields.ecology;
  for (const e of city.buildingEntities()) {
    const [x, z, w, d] = [Building.x[e]!, Building.z[e]!, Building.w[e]!, Building.d[e]!];
    const { min, max } = city.grid.rangeOver(
      Math.max(0, x - RING),
      Math.max(0, z - RING),
      Math.min(city.size - 1, x + w + RING) - Math.max(0, x - RING),
      Math.min(city.size - 1, z + d + RING) - Math.max(0, z - RING),
    );
    const span = max - min;
    if (span < STEEP) continue;
    const cx = x + w / 2;
    const cz = z + d / 2;
    const bare = 1 - Math.min(1, (eco[city.grid.index(Math.floor(cx), Math.floor(cz))] ?? 0.5) / ROOTED);
    if (bare <= 0) continue;
    sites.push({ eid: e, x: cx, z: cz, risk: (span / STEEP) * bare });
  }
  sites.sort((a, b) => b.risk - a.risk || a.eid - b.eid);
  cache = { city, tick: city.tick, sites };
  return sites;
}

/** Summed risk over the bare slopes (0 = none): the landslide's weight and the chain's gate. */
export function slopeRisk(city: City): number {
  return slopeSites(city).reduce((a, s) => a + s.risk, 0);
}
