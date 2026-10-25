import { query } from 'bitecs';
import { Building, Greenery, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY, SEA_LEVEL, type Grid } from './Grid';
import type { City } from './City';
import { blurPeak, boxBlur } from './blur';

/** Pulses between field recomputes (fields change slowly; recompute is O(tiles)). */
export const FIELD_PULSES = 6;
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
  computeShore(grid, f.shore);
  return f;
}

/** Shore distance by BFS from water tiles (recomputed when the coast changes, e.g. reclamation). */
export function computeShore(grid: Grid, shore: Uint8Array): void {
  const n = grid.w * grid.h;
  shore.fill(SHORE_RANGE);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++)
      if (grid.rangeOver(x, z, 1, 1).min < SEA_LEVEL + 0.05) {
        const i = grid.index(x, z);
        shore[i] = 0;
        q[tail++] = i;
      }
  while (head < tail) {
    const t = q[head++]!;
    const d = shore[t]! + 1;
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
      if (shore[i]! > d) {
        shore[i] = d;
        q[tail++] = i;
      }
    }
  }
}

// Deposits are scaled so a single source peaks at about the same value as the old radial splats.
const POLLUTION_BLUR = { r: 5, passes: 2 };
const ECO_BLUR = { r: 4, passes: 2 };
const POLLUTION_SCALE = 1 / blurPeak(POLLUTION_BLUR.r, POLLUTION_BLUR.passes);
const ECO_SCALE = 0.6 / blurPeak(ECO_BLUR.r, ECO_BLUR.passes);

/**
 * Recomputes the spatial fields from buildings and land use (both halves; the pulse runs them on
 * separate phases so no single pulse carries both blurs, see D-020):
 * - pollution: emitters splat with falloff; parks and greenery absorb
 * - ecology: wild land and green buildings raise it, built-up and polluted land lowers it
 * - desirability: ecology, clean air, sea views and highway access
 */
export function computeFields(city: City, f: Fields): void {
  computePollution(city, f);
  computeEcology(city, f);
}

/** Pollution field (point deposits + blur, clamped ≥ 0) and mean coastal pollution. */
export function computePollution(city: City, f: Fields): void {
  const g = city.grid;
  const n = g.w * g.h;
  const pollution = f.pollution;
  pollution.fill(0);
  for (const eid of query(city.world, [Building])) {
    const d0 = buildings.at(Building.def[eid]!);
    const st = d0.stats;
    if (st.pollution === 0) continue;
    const green = Greenery.value[eid]!;
    const pairMul = d0.symbiosis && Service.paired[eid] ? d0.symbiosis.pollutionMul : 1;
    const retroMul = Building.level[eid]! > 0 ? 0.7 : 1;
    const c = g.index(Math.floor(Building.x[eid]! + Building.w[eid]! / 2), Math.floor(Building.z[eid]! + Building.d[eid]! / 2));
    pollution[c] += (st.pollution > 0 ? st.pollution * (1 - 0.4 * green) * pairMul * retroMul : st.pollution) * 0.12 * POLLUTION_SCALE;
  }
  boxBlur(pollution, g.w, g.h, POLLUTION_BLUR.r, POLLUTION_BLUR.passes);
  // Clamp, and the mean along the coast (drives algal-bloom likelihood).
  const shore = f.shore;
  let cp = 0;
  let cn = 0;
  for (let i = 0; i < n; i++) {
    const p = pollution[i]! > 0 ? pollution[i]! : 0;
    pollution[i] = p;
    const sh = shore[i]!;
    if (sh >= 1 && sh <= 3) {
      cp += p;
      cn++;
    }
  }
  city.pulse.coastalPollution = cn ? cp / cn : 0;
}

/** Ecology field (land use + green buildings, blurred, minus pollution) and desirability. */
export function computeEcology(city: City, f: Fields): void {
  const g = city.grid;
  const { pollution, ecology, desirability, shore } = f;
  const road = g.road;
  const occ = g.occupant;
  const w = g.w;
  const n = w * g.h;
  for (let i = 0; i < n; i++) ecology[i] = shore[i] === 0 ? 0.45 : road[i] ? 0.25 : occ[i] === NO_ENTITY ? 0.6 : 0.3;
  for (const eid of query(city.world, [Building])) {
    const st = buildings.at(Building.def[eid]!).stats;
    if (st.eco === 0) continue;
    const c = g.index(Math.floor(Building.x[eid]! + Building.w[eid]! / 2), Math.floor(Building.z[eid]! + Building.d[eid]! / 2));
    ecology[c] += st.eco * (0.3 + 0.7 * Greenery.value[eid]!) * 0.025 * ECO_SCALE;
  }
  boxBlur(ecology, w, g.h, ECO_BLUR.r, ECO_BLUR.passes);
  // Row-major nested loops (no per-tile div/mod).
  for (let z = 0, i = 0; z < g.h; z++)
    for (let x = 0; x < w; x++, i++) {
      const p = pollution[i]!;
      const e = Math.min(1, Math.max(0, ecology[i]! - p * 0.5));
      ecology[i] = e;
      const sh = shore[i]!;
      const view = sh > 0 && sh < SHORE_RANGE ? (1 - sh / SHORE_RANGE) * 0.15 : 0;
      const access = (x > 0 && road[i - 1]) || (x < w - 1 && road[i + 1]) || (z > 0 && road[i - w]) || (z < g.h - 1 && road[i + w]) ? 0.1 : 0;
      desirability[i] = Math.min(1, Math.max(0, 0.3 + e * 0.45 - Math.min(1, p) * 0.6 + view + access));
    }
}
