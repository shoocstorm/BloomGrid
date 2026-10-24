import { fbm, ridged } from './noise';
import type { Grid } from './Grid';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Island features in normalised map space (0..1). */
const ISLETS = [
  { x: 0.5, z: 0.86, rx: 0.07, rz: 0.03 }, // southern resort islet (Sentosa-like)
  { x: 0.84, z: 0.2, rx: 0.08, rz: 0.035 }, // north-eastern rustic islet (Ubin-like)
  { x: 0.1, z: 0.66, rx: 0.06, rz: 0.05 }, // western industrial islet (Jurong-like)
];
const RESERVOIRS = [
  { x: 0.47, z: 0.42, r: 0.035 },
  { x: 0.4, z: 0.36, r: 0.025 },
];
const HILLS = { x: 0.43, z: 0.42, r: 0.17, height: 9 };
const BAY = { x: 0.56, z: 0.78, rx: 0.09, rz: 0.07 };

/** 0..1 land mask for an ellipse with a soft, noise-warped edge. */
function blob(nx: number, nz: number, cx: number, cz: number, rx: number, rz: number, warp: number): number {
  const dx = (nx - cx) / rx;
  const dz = (nz - cz) / rz;
  // Superellipse (p = 1.6) gives a slightly diamond silhouette like Singapore's.
  const d = Math.pow(Math.pow(Math.abs(dx), 1.6) + Math.pow(Math.abs(dz), 1.6), 1 / 1.6) + warp;
  return 1 - smoothstep(0.88, 1.04, d);
}

/**
 * Singapore-inspired island height at any world position (also beyond the map, for the ocean
 * surroundings). Main island with an irregular coast, central forested hills and reservoirs,
 * a southern bay where a short river meets the sea, and three satellite islets.
 * Sea level is 0; land is mostly 0.4–2.5 with hills up to ~10.
 */
export function terrainHeight(x: number, z: number, seed: number, size: number): number {
  const nx = x / size;
  const nz = z / size;
  const coastWarp = fbm(x * 0.012, z * 0.012, seed + 1, 4) * 0.22 + fbm(x * 0.05, z * 0.05, seed + 2, 2) * 0.05;

  let land = blob(nx, nz, 0.5, 0.48, 0.44, 0.29, coastWarp);
  for (const i of ISLETS) land = Math.max(land, blob(nx, nz, i.x, i.z, i.rx, i.rz, coastWarp * 0.6));

  // Southern bay bites into the coast.
  const bay = blob(nx, nz, BAY.x, BAY.z, BAY.rx, BAY.rz, coastWarp * 0.4);
  land = Math.min(land, 1 - bay * 0.95);

  // Ground: gentle lowlands with soft undulation.
  let ground = 0.9 + fbm(x * 0.02, z * 0.02, seed + 3, 3) * 0.7 + fbm(x * 0.07, z * 0.07, seed + 4, 2) * 0.15;

  // Central nature-reserve hills.
  const hd = Math.hypot(nx - HILLS.x, (nz - HILLS.z) * 1.3) / HILLS.r;
  const hill = Math.max(0, 1 - hd * hd);
  ground += hill * (2 + ridged(x * 0.03, z * 0.03, seed + 11, 4) * HILLS.height);

  // Reservoirs nestled in the hills.
  for (const r of RESERVOIRS) {
    const d = Math.hypot(nx - r.x, nz - r.z) / r.r + fbm(x * 0.06, z * 0.06, seed + 9, 2) * 0.3;
    // Wide, gentle banks so reservoirs sit in the landscape rather than in craters.
    const lake = 1 - smoothstep(0.55, 1.6, d);
    ground = ground * (1 - lake) - 0.9 * lake;
  }

  // Short river from the hills down to the bay.
  const t = Math.min(1, Math.max(0, (nz - 0.5) / (BAY.z - 0.5)));
  const riverX = 0.5 + (BAY.x - 0.5) * t + Math.sin(nz * 28 + seed) * 0.012;
  const river = (1 - smoothstep(0.009, 0.02, Math.abs(nx - riverX))) * smoothstep(0.48, 0.55, nz);
  ground = ground * (1 - river) - 1.0 * river;

  // Ocean floor: shallow shelf near the coast, deep beyond.
  const shelf = Math.max(0, 1 - land);
  const seabed = -1.2 - shelf * 6 + fbm(x * 0.03, z * 0.03, seed + 6, 2) * 0.5;
  return seabed + (ground - seabed) * smoothstep(0.0, 1.0, land);
}

export function generateTerrain(grid: Grid, seed: number): void {
  const W = grid.w + 1;
  for (let z = 0; z <= grid.h; z++)
    for (let x = 0; x <= grid.w; x++) grid.heights[z * W + x] = terrainHeight(x, z, seed, grid.w);
}
