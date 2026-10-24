import { fbm, ridged } from './noise';
import type { Grid } from './Grid';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Procedural landscape height at any world position (also outside the playable map, for the
 * scenic surroundings): gentle buildable plains, a meandering river, a lake basin and a
 * mountain range along the north edge (future hyperloop arches).
 */
export function terrainHeight(x: number, z: number, seed: number, size: number): number {
  // Plains with soft rolling hills.
  let h = 0.9 + fbm(x * 0.012, z * 0.012, seed, 4) * 1.4 + fbm(x * 0.05, z * 0.05, seed + 7, 2) * 0.25;

  // Mountains toward the north edge (z ~ 0) and beyond the map rim.
  const north = 1 - smoothstep(size * 0.08, size * 0.3, z + fbm(x * 0.02, 0, seed + 3) * 18);
  const rim = smoothstep(0, size * 0.35, Math.max(-x, x - size, z - size, 0));
  h += Math.max(north, rim * 0.8) * (4 + ridged(x * 0.018, z * 0.018, seed + 11) * 34);

  // River: meandering channel crossing west -> east.
  const cz = size * 0.45 + Math.sin(x * 0.021 + seed) * size * 0.08 + fbm(x * 0.01, 3, seed + 5) * 22;
  const river = 1 - smoothstep(1.5, 6, Math.abs(z - cz));
  h = h * (1 - river) + -1.3 * river;

  // Lake basin.
  const dl = Math.hypot(x - size * 0.72, (z - size * 0.62) * 1.3) + fbm(x * 0.04, z * 0.04, seed + 9) * 6;
  const lake = 1 - smoothstep(10, 20, dl);
  return h * (1 - lake) + -2 * lake;
}

export function generateTerrain(grid: Grid, seed: number): void {
  const W = grid.w + 1;
  for (let z = 0; z <= grid.h; z++)
    for (let x = 0; x <= grid.w; x++) grid.heights[z * W + x] = terrainHeight(x, z, seed, grid.w);
}
