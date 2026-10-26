import { buildings, scenarios } from '@/content';
import type { ScenarioBuilder } from '@/content/types';
import { Service } from '@/ecs/components';
import type { City } from './City';
import { setCorners } from './coast';
import { SEA_LEVEL } from './Grid';
import { RoadNetworks } from './networks';
import { Rng } from './random';

/**
 * Applies a scenario in bulk, bypassing commands and undo. Roads are written to the grid
 * directly and announced with a single `road:changed`, so the content can be generated before
 * renderers attach (they sync existing state on init) or after (one event).
 */
export function applyScenario(city: City, id: string): { buildings: number; roads: number } {
  const def = scenarios.get(id);
  const g = city.grid;
  const rng = new Rng(city.seed ^ 0x5eed);
  city.credits = 1e12; // placement checks must not fail on cost
  const roadTiles: number[] = [];
  let placed = 0;
  /** Terrain edits from `level`, written to the heights at once but committed (saved, announced) in one go. */
  const leveled = new Map<number, number>();
  const totals = { energyProduced: 0, energyUsed: 0, waterProduced: 0, waterUsed: 0, food: 0, population: 0, jobs: 0 };

  const setRoad = (x: number, z: number, bridges: boolean) => {
    if (!g.inBounds(x, z)) return;
    const idx = g.index(x, z);
    if (!city.canRoad(idx, bridges)) return;
    g.road[idx] = city.isWaterTile(x, z) ? 2 : 1;
    roadTiles.push(idx);
  };

  const builder: ScenarioBuilder = {
    size: city.size,
    rand: () => rng.next(),
    isLand: (x, z) => g.inBounds(x, z) && !city.isWaterTile(x, z),
    height: (x, z) => g.heights[z * (g.w + 1) + x]!,
    footprint: (id, rot = 0) => city.footprint(buildings.get(id), rot),
    road(x0, z0, x1, z1, bridges = false) {
      [x0, z0, x1, z1] = [x0, z0, x1, z1].map(Math.round) as [number, number, number, number];
      const sx = Math.sign(x1 - x0);
      const sz = Math.sign(z1 - z0);
      let x = x0;
      let z = z0;
      setRoad(x, z, bridges);
      while (x !== x1) setRoad((x += sx), z, bridges);
      while (z !== z1) setRoad(x, (z += sz), bridges);
    },
    building(id, x, z, rot = 0) {
      const d = buildings.get(id);
      if (!city.checkPlacement(d, x, z, rot).ok) return false;
      const eid = city.addBuilding({ def: id, x, z, rot, greenery: 0.45 + rng.next() * 0.55, occupancy: 0.7 });
      Service.occupancy[eid] = 0.7;
      const st = d.stats;
      if (st.energy > 0) totals.energyProduced += st.energy;
      else totals.energyUsed -= st.energy;
      if (st.water > 0) totals.waterProduced += st.water;
      else totals.waterUsed -= st.water;
      totals.food += st.food;
      totals.population += st.population;
      totals.jobs += st.jobs;
      placed++;
      return true;
    },
    fill(x0, z0, x1, z1, weights, density = 1, limit = Infinity) {
      const ids = Object.keys(weights);
      const sum = ids.reduce((a, k) => a + weights[k]!, 0);
      const pick = () => {
        let r = rng.next() * sum;
        for (const k of ids) if ((r -= weights[k]!) <= 0) return k;
        return ids[ids.length - 1]!;
      };
      let n = 0;
      for (let z = Math.round(z0); z < z1 && n < limit; z++)
        for (let x = Math.round(x0); x < x1 && n < limit; x++) {
          if (g.road[g.index(x, z)] || g.occupant[g.index(x, z)] !== -1) continue;
          if (rng.next() > density) continue;
          const id = pick();
          const d = buildings.get(id);
          for (let r = 0; r < 4; r++) {
            const [w, dd] = city.footprint(d, r);
            if (!RoadNetworks.touchesRoad(g, x, z, w, dd)) continue;
            if (this.building(id, x, z, r)) {
              n++;
              break;
            }
          }
        }
      return n;
    },
    totals: () => ({ ...totals }),
    level(x0, z0, x1, z1, margin = 4, height) {
      const W = g.w + 1;
      // Corners of tiles x0..x1 span x0..x1+1.
      [x0, z0, x1, z1] = [x0, z0, x1 + 1, z1 + 1].map(Math.round) as [number, number, number, number];
      let target = height;
      if (target === undefined) {
        let sum = 0;
        let n = 0;
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) {
            const h = g.heights[z * W + x]!;
            if (h < SEA_LEVEL + 0.05) continue;
            sum += h;
            n++;
          }
        if (!n) return NaN;
        target = sum / n;
      }
      for (let z = Math.max(0, z0 - margin); z <= Math.min(g.h, z1 + margin); z++)
        for (let x = Math.max(0, x0 - margin); x <= Math.min(g.w, x1 + margin); x++) {
          const c = z * W + x;
          const h = g.heights[c]!;
          if (h < SEA_LEVEL + 0.05) continue; // rivers and reservoirs stay
          const out = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0);
          if (out > 0 && (city.terrainEdits.has(c) || leveled.has(c))) continue; // a feather never bends an earlier terrace
          let t = 1 - out / (margin + 1);
          t = t * t * (3 - 2 * t);
          g.heights[c] = h + (target - h) * t;
          leveled.set(c, g.heights[c]!);
        }
      return target;
    },
  };

  def.build(builder);
  setCorners(city, [...leveled]); // one shore/soil refresh for every terrace
  city.credits = def.credits;
  city.networks.dirty = true;
  city.roadCount += roadTiles.length;
  if (roadTiles.length) city.bus.emit('road:changed', { tiles: roadTiles });
  return { buildings: placed, roads: roadTiles.length };
}
