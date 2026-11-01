import type { BuildingDef } from '@/content/types';
import type { City } from './City';

/**
 * Which way a waterside building faces (D-095). Recipes put their sea side (a dock's jetty, an intake) at local
 * +z; rotation `rot` turns local +z to world +z, −x, −z, +x. These pick the rotation whose sea side looks at the
 * most open water, so docks reach into the sea wherever they are placed.
 */
const DIRS: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

/** Water tiles in a band up to 3 deep (`any`: stop at the first, for a cheap yes/no) beyond the side a building at (x, z, rot) faces. */
export function seawardScore(city: City, def: BuildingDef, x: number, z: number, rot: number, any = false): number {
  const [w, d] = city.footprint(def, rot);
  const [dx, dz] = DIRS[rot & 3]!;
  let n = 0;
  for (let k = 1; k <= 3; k++) {
    if (dx === 0) {
      const row = dz > 0 ? z + d - 1 + k : z - k;
      for (let i = x; i < x + w; i++) if (city.isWaterTile(i, row) && (++n, any)) return n;
    } else {
      const col = dx > 0 ? x + w - 1 + k : x - k;
      for (let j = z; j < z + d; j++) if (city.isWaterTile(col, j) && (++n, any)) return n;
    }
  }
  return n;
}

/** Rotations best facing the water first (stable for ties). */
export function rotsByWater(city: City, def: BuildingDef, x: number, z: number): number[] {
  return [0, 1, 2, 3].map((r) => ({ r, s: seawardScore(city, def, x, z, r) })).sort((a, b) => b.s - a.s || a.r - b.r).map((o) => o.r);
}

/** For a footprint centred near (cx, cz): the rotation (and its anchor) that faces the most water. */
export function faceWater(city: City, def: BuildingDef, cx: number, cz: number): { rot: number; x: number; z: number } {
  let best = { rot: 0, x: 0, z: 0, s: -1 };
  for (let rot = 0; rot < 4; rot++) {
    const [w, d] = city.footprint(def, rot);
    const x = Math.floor(cx - w / 2 + 0.5);
    const z = Math.floor(cz - d / 2 + 0.5);
    const s = seawardScore(city, def, x, z, rot);
    if (s > best.s) best = { rot, x, z, s };
  }
  return { rot: best.rot, x: best.x, z: best.z };
}
