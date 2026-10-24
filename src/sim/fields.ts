import { query } from 'bitecs';
import { Building, Greenery, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY, SEA_LEVEL, type Grid } from './Grid';
import type { City } from './City';
import { blurPeak, boxBlur } from './blur';

/** Pulses between field recomputes (fields change slowly; recompute is O(tiles)). */
export const FIELD_PULSES = 5;
const SHORE_RANGE = 8;

export interface Fields {
  /** 0..1+ pollution concentration. */
  pollution: Float32Array;
  /** 0..1 ecological richness. */
  ecology: Float32Array;
  /** 0..1 land value / desirability. */
  desirability: Float32Array;
  /** Tile distance to open water (capped at SHORE_RANGE); 0 on water. */
  shore: Uint8Array;
}

/** Allocates field layers on the grid and precomputes static shore distance (BFS). */
export function createFields(grid: Grid): Fields {
  const n = grid.w * grid.h;
  const f: Fields = {
    pollution: grid.addLayer('pollution', () => new Float32Array(n)),
    ecology: grid.addLayer('ecology', () => new Float32Array(n)),
    desirability: grid.addLayer('desirability', () => new Float32Array(n).fill(0.5)),
    shore: grid.addLayer('shore', () => new Uint8Array(n).fill(SHORE_RANGE)),
  };
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++)
      if (grid.rangeOver(x, z, 1, 1).min < SEA_LEVEL + 0.05) {
        const i = grid.index(x, z);
        f.shore[i] = 0;
        q[tail++] = i;
      }
  while (head < tail) {
    const t = q[head++]!;
    const d = f.shore[t]! + 1;
    if (d >= SHORE_RANGE) continue;
    const x = t % grid.w;
    const z = (t / grid.w) | 0;
    for (const [nx, nz] of [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
    ] as const) {
      if (nx < 0 || nz < 0 || nx >= grid.w || nz >= grid.h) continue;
      const i = nz * grid.w + nx;
      if (f.shore[i]! > d) {
        f.shore[i] = d;
        q[tail++] = i;
      }
    }
  }
  return f;
}

// Deposits are scaled so a single source peaks at about the same value as the old radial splats.
const POLLUTION_BLUR = { r: 5, passes: 2 };
const ECO_BLUR = { r: 4, passes: 2 };
const POLLUTION_SCALE = 1 / blurPeak(POLLUTION_BLUR.r, POLLUTION_BLUR.passes);
const ECO_SCALE = 0.6 / blurPeak(ECO_BLUR.r, ECO_BLUR.passes);

/**
 * Recomputes the spatial fields from buildings and land use:
 * - pollution: emitters splat with falloff; parks and greenery absorb
 * - ecology: wild land and green buildings raise it, built-up and polluted land lowers it
 * - desirability: ecology, clean air, sea views and highway access
 */
export function computeFields(city: City, f: Fields): void {
  const g = city.grid;
  const n = g.w * g.h;
  f.pollution.fill(0);
  f.ecology.fill(0);
  for (let i = 0; i < n; i++) {
    if (f.shore[i] === 0) f.ecology[i] = 0.45;
    else if (g.road[i]) f.ecology[i] = 0.25;
    else if (g.occupant[i] === NO_ENTITY) f.ecology[i] = 0.6;
    else f.ecology[i] = 0.3;
  }
  for (const eid of query(city.world, [Building])) {
    const d0 = buildings.at(Building.def[eid]!);
    const st = d0.stats;
    const cx = Building.x[eid]! + Building.w[eid]! / 2;
    const cz = Building.z[eid]! + Building.d[eid]! / 2;
    const green = Greenery.value[eid]!;
    const pairMul = d0.symbiosis && Service.paired[eid] ? d0.symbiosis.pollutionMul : 1;
    const retroMul = Building.level[eid]! > 0 ? 0.7 : 1;
    const c = g.index(Math.floor(cx), Math.floor(cz));
    if (st.pollution !== 0) f.pollution[c] += (st.pollution > 0 ? st.pollution * (1 - 0.4 * green) * pairMul * retroMul : st.pollution) * 0.12 * POLLUTION_SCALE;
    if (st.eco !== 0) f.ecology[c] += st.eco * (0.3 + 0.7 * green) * 0.025 * ECO_SCALE;
  }
  boxBlur(f.pollution, g.w, g.h, POLLUTION_BLUR.r, POLLUTION_BLUR.passes);
  boxBlur(f.ecology, g.w, g.h, ECO_BLUR.r, ECO_BLUR.passes);
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, f.pollution[i]!);
    f.pollution[i] = p;
    const e = Math.min(1, Math.max(0, f.ecology[i]! - p * 0.5));
    f.ecology[i] = e;
    const shore = f.shore[i]!;
    const view = shore > 0 && shore < SHORE_RANGE ? (1 - shore / SHORE_RANGE) * 0.15 : 0;
    const x = i % g.w;
    const z = (i / g.w) | 0;
    const access =
      (x > 0 && g.road[i - 1]) || (x < g.w - 1 && g.road[i + 1]) || (z > 0 && g.road[i - g.w]) || (z < g.h - 1 && g.road[i + g.w])
        ? 0.1
        : 0;
    f.desirability[i] = Math.min(1, Math.max(0, 0.3 + e * 0.45 - Math.min(1, p) * 0.6 + view + access));
  }
  // Mean pollution along the coast (drives algal bloom likelihood).
  let cp = 0;
  let cn = 0;
  for (let i = 0; i < n; i++)
    if (f.shore[i]! >= 1 && f.shore[i]! <= 3) {
      cp += f.pollution[i]!;
      cn++;
    }
  city.pulse.coastalPollution = cn ? cp / cn : 0;
}
